// ── Bedarfsmodul: Automatik Paket A + B (21.10.2026) ──
//
// Vorbelegung weiterer Felder aus Daten, die die App schon geladen hat: Rechnung (Sichtrechner), OSM-Antwort (Wege mit Tags,
// Übergänge, Ampeln, Tramgleise), AV-Bodenbedeckung, Haltestellen. Aufgerufen am Schluss von vorbelegung.vorbelegen (die dort
// gesetzten Werte, z. B. Tempo, DTV, Fahrbahnbreite, sind dann bekannt). Jeder Wert trägt Quelle und Herkunft als Text; Annahmen
// tragen die Quelle «annahme» und erscheinen damit im Befund unter «Annahmen». «Erfüllt» entsteht nie ohne Grundlage: fehlen die
// Daten bzw. ist der Fall unklar, bleibt das Feld offen (mit Hinweis, wo er weiterhilft). Eine Handeingabe überschreibt jeden Wert.
// Schwellen in AUTO (Nutzerentscheide 21.10.2026, Abschnitt 22 der Regeln).
// Paket C (Abschnitt 24): Vortrittszeichen (OSM) entscheiden an einer Kreuzung die Vortrittsrolle; der Strassentyp aus dem Geoportal
// (geo.strassentyp, gebildet in vorbelegung.ts) hat Vorrang vor der OSM-Annahme, auch wenn er offen bleibt (Hinweis). Die übrigen
// Regeln des Pakets C stehen in automatikC.ts.

import { tag } from './lesetext'
import { TEMPO_QUELLE_AMTLICH } from '../rechner/tempo'
import { type P, add, sub, dot, dist, einheit, rechts, links, lv95, imPolygon, abstandStrecke, segSchnitt } from '../geo'
import type { StreifenErgebnis, ZufahrtErgebnis } from '../rechner/typen'
import type { Fall, PlanSeitenraum } from '../fall'
import type { Quelle } from './eingaben'
import type { Vorbelegung } from './fallBedarf'
import { HW_ALLE, istFgs, istLsaUebergang, markierung, type OsmDaten, type OsmKnoten, type OsmWeg, type VortrittZeichen } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { schnitt, abstandPunkt } from '../rechner/poly'
import { seitenraumGemessen } from '../rechner/seitenraum'
import { planTitel } from '../rechner/planflaechen'
import { KATALOG } from './katalog'
import { imBereich, HALT_TEXT, type Bereich, type HaltestellenErgebnis, type OevHalt } from '../daten/haltestellen'

/** Schwellen der Automatik (Abschnitt 22 der Regeln; Annahmen ausser wo vermerkt) */
export const AUTO = {
  /** Knoten bzw. Kreisel höchstens so weit vom Streifen: Lage am Knoten, Verzweigung */
  knotenM: 20,
  /** Haltestelle direkt an der Querung bis hier; «keine» ab Umkreis haltUmkreisM (vorbelegung.HALT_UMKREIS_M) */
  haltAngrenzendM: 20,
  haltUmkreisM: 50,
  /** Tramhaltestelle bis hier: Querung im Tramhaltestellenbereich */
  tramHaltM: 30,
  /** Ampel bis hier vom Knoten: Knoten mit Lichtsignal; keine bis knotenLsaNeinM: ohne */
  knotenLsaJaM: 30,
  knotenLsaNeinM: 50,
  /** Übergang auf einem Arm bis hier vom Knoten: Arm mit Querung */
  armUebergangM: 25,
  /** eigene Querung: Übergänge bzw. Lichtsignale so nah am Streifen zählen nicht als «nächster» */
  eigenFgsM: 5,
  eigenLsaM: 10,
  /** stark befahren: DTV ab dtvStark oder Fahrstreifen je Richtung ab nStark */
  dtvStark: 10000,
  nStark: 2,
  /** Autoverkehr an der Einengung: tief unter mivMittel, mittel bis mivHoch, hoch darüber (DTV) */
  mivMittel: 3000,
  mivHoch: 10000,
  /** viel Verkehr in der Seitenstrasse ab diesem DTV */
  mivEinmHoch: 3000,
  /** lange Querung: Teilquerung länger als (m) */
  querungLangM: 12,
  /** Einengung: Fahrbahn an der Querung um mindestens so viel schmaler als die Zufahrt (m) */
  einengungM: 1.0,
  /** Länge der Einengung: Fahrbahn schmaler als Zufahrt minus (m) */
  einengungLaengeTolM: 0.5,
  /** Trottoir vor bzw. hinter der Parklinie: kleinere Beträge gelten als Messungenauigkeit (offen mit Hinweis) */
  seitenraumTolM: 0.3,
  /** Ein- bzw. Ausfahrt (service-Weg) mündet so nah am Streifen */
  einfahrtM: 10,
  /** Haltebereich: so weit um den Haltepunkt; verdeckt, wenn die Querung hinter dem Halt näher liegt als busVerdecktM */
  haltBereichM: 15,
  busVerdecktM: 18,
  /** Umkreis der OSM-Abfrage (osm.ladeOsmRoh, App OSM_RADIUS_M) */
  osmRadiusM: 300,
} as const

/** Geodaten der Automatik (Teil von vorbelegung.GeoVorbelegung) */
export interface AutoGeo {
  haltestellen?: HaltestellenErgebnis | null
  osmTags?: ReadonlyMap<number, Record<string, string>> | null
  /** geparste OSM-Antwort (osm.osmParsen der Rohantwort) */
  osm?: OsmDaten | null
  /** AV-Bodenbedeckung um den Ladeort */
  av?: AvFlaeche[] | null
  /** Ladeort (LV95) und Umkreis der OSM-Abfrage: Reichweite für «kein Übergang gefunden» */
  ladeort?: P | null
  osmRadiusM?: number
  /** Strassentyp aus einer amtlichen Quelle (Geoportal Bern, vorbelegung.ts): hat Vorrang vor OSM; wert null mit Text: offen mit Hinweis */
  strassentyp?: { wert: 'verkehrsorientiert' | 'siedlungsorientiert' | null; quelle: Quelle; text: string } | null
  /** Vortrittszeichen (give_way, stop) und Verkehrsschilder nach OSM mit abgedecktem Bereich (überall; Paket C) */
  vortritt?: { zeichen: VortrittZeichen[]; bereich: Bereich } | null
}

/** ganzeStrasse: Wert ist die Länge der ganzen Strasse (Runde 4, Abstände bei beidseitigem Strassenende) */
type Setze = (pfad: string, wert: unknown, quelle: Quelle, text: string, ganzeStrasse?: true) => void
type FeldHinweis = (pfad: string, text: string) => void

const r1 = (x: number) => Math.round(x * 10) / 10 || 0
const f1 = (x: number) => r1(x).toFixed(1).replace('.', ',')
const ganz = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }
const wegId = (x: string | null | undefined): number | null => {
  const n = Number(String(x ?? '').replace(/^w/, ''))
  return x && Number.isInteger(n) && n > 0 ? n : null
}

/** Abstand eines Punkts zum Streifen (Umriss; 0 innerhalb), ohne Umriss zur Achse (wie vorbelegung.abstandZumStreifen) */
function abstandStreifen(p: P, s: StreifenErgebnis): number {
  const u = s.umriss
  if (!u || u.length < 3) return abstandStrecke(p, s.p0, s.p1)
  if (imPolygon(p, [[...u, u[0]]])) return 0
  let d = Infinity
  for (let i = 0; i < u.length; i++) d = Math.min(d, abstandStrecke(p, u[i], u[(i + 1) % u.length]))
  return d
}
export const abstandQuerung = (p: P, st: StreifenErgebnis[]) => Math.min(...st.map(s => abstandStreifen(p, s)))
export const eckenVon = (s: StreifenErgebnis): P[] => (s.umriss?.length >= 3 ? s.umriss : [s.p0, s.p1])
/** Abstand eines Linienzugs zur Querung */
export function linieAbstand(pts: P[], st: StreifenErgebnis[]): number {
  let d = Infinity
  for (const s of st) {
    const ecken = eckenVon(s)
    for (let i = 0; i < pts.length; i++) {
      d = Math.min(d, abstandStreifen(pts[i], s))
      if (i === 0) continue
      for (const e of ecken) d = Math.min(d, abstandStrecke(e, pts[i - 1], pts[i]))
      for (let j = 0; j < ecken.length; j++) if (segSchnitt(pts[i - 1], pts[i], ecken[j], ecken[(j + 1) % ecken.length])) return 0
    }
  }
  return d
}
/** Punkt in Abstand d entlang eines Linienzugs (über das Ende hinaus: letzter Punkt), null ohne Länge */
function punktEntlang(z: P[], d: number): P | null {
  if (z.length < 2) return null
  let s = 0
  for (let i = 1; i < z.length; i++) {
    const l = dist(z[i - 1], z[i])
    if (l > 0 && s + l >= d) return add(z[i - 1], sub(z[i], z[i - 1]), (d - s) / l)
    s += l
  }
  return null
}

// ── AV ──
interface AvTeil { art: string; ringe: P[][]; box: [number, number, number, number] }
class AvIndex {
  teile: AvTeil[]
  constructor(av: AvFlaeche[]) {
    this.teile = av.map(f => {
      const xs = f.ringe[0].map(p => p[0]), ys = f.ringe[0].map(p => p[1])
      return { art: f.art, ringe: f.ringe, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
    })
  }
  artBei(p: P): string | null {
    for (const t of this.teile) if (p[0] >= t.box[0] && p[0] <= t.box[2] && p[1] >= t.box[1] && p[1] <= t.box[3] && imPolygon(p, t.ringe)) return t.art
    return null
  }
  in(p: P, arten: readonly string[]): boolean {
    for (const t of this.teile) if (arten.includes(t.art) && p[0] >= t.box[0] && p[0] <= t.box[2] && p[1] >= t.box[1] && p[1] <= t.box[3] &&
      imPolygon(p, t.ringe)) return true
    return false
  }
  /** Strecke von p in Richtung d, bis die Flächen der Arten enden (0,1 m genau, höchstens max); null, wenn p nicht darin liegt */
  sehne(p: P, d: P, arten: readonly string[], max = 40): number | null {
    if (!this.in(p, arten)) return null
    let t = 0
    while (t < max && this.in(add(p, d, t + 0.1), arten)) t += 0.1
    // auf 1 cm genauer: Rand zwischen t und t + 0,1
    let lo = t, hi = Math.min(t + 0.1, max)
    for (let i = 0; i < 4; i++) { const m = (lo + hi) / 2; if (this.in(add(p, d, m), arten)) lo = m; else hi = m }
    return lo
  }
}
const FAHRBAHN = ['Strasse_Weg']

// ── OSM ──
/** Klassen, die als Arm eines Knotens zählen (ohne Zufahrten zu Grundstücken und Fussgängerzonen) */
const ARM_HW = HW_ALLE.filter(h => !['service', 'pedestrian'].includes(h))
interface Netz {
  wege: Map<number, { w: OsmWeg; pts: P[] }>
  knoten: Map<number, P>
  /** Wege je Knoten (nur ARM_HW) */
  an: Map<number, number[]>
}
function netzBauen(osm: OsmDaten): Netz {
  const wege = new Map<number, { w: OsmWeg; pts: P[] }>(), knoten = new Map<number, P>(), an = new Map<number, number[]>()
  for (const w of osm.wege) {
    const pts = w.geom.map(([la, lo]) => lv95(la, lo))
    wege.set(w.id, { w, pts })
    w.knoten.forEach((k, i) => { if (!knoten.has(k)) knoten.set(k, pts[i]) })
    if (ARM_HW.includes(w.tags.highway ?? '')) for (const k of new Set(w.knoten)) an.set(k, [...(an.get(k) ?? []), w.id])
  }
  return { wege, knoten, an }
}
export interface Arm { wid: number; pts: P[]; knoten: number[] }
/** Arme eines Knotens: je Weg und Richtung der Linienzug ab dem Knoten (Knoten-Ids mit) */
function armeVon(n: Netz, k: number): Arm[] {
  const arme: Arm[] = [], gesehen = new Set<string>()
  for (const wid of n.an.get(k) ?? []) {
    const { w, pts } = n.wege.get(wid)!
    w.knoten.forEach((kk, i) => {
      if (kk !== k) return
      for (const r of [-1, 1]) {
        const j = i + r
        if (j < 0 || j >= w.knoten.length) continue
        const key = `${wid}:${w.knoten[j]}`
        if (gesehen.has(key)) continue
        gesehen.add(key)
        const idx: number[] = []
        for (let x = i; x >= 0 && x < w.knoten.length; x += r) idx.push(x)
        arme.push({ wid, pts: idx.map(x => pts[x]), knoten: idx.map(x => w.knoten[x]) })
      }
    })
  }
  return arme
}
/** Knoten-Ids eines Arms bis d m ab dem Knoten */
function armKnotenBis(a: Arm, d: number): number[] {
  const aus = [a.knoten[0]]
  let s = 0
  for (let i = 1; i < a.pts.length; i++) { s += dist(a.pts[i - 1], a.pts[i]); if (s > d + 1e-9) break; aus.push(a.knoten[i]) }
  return aus
}
const ll2p = (k: OsmKnoten): P => lv95(k.lat, k.lon)

/** Zufahrten mit Sicht auf die Wartefläche (ohne Trottoirüberfahrt, deren Zufahrten nur der Vorbelegung dienen): Grundlage für
 * Vorbelegungen aus dem Sichtfeld (Parkierung im Sichtfeld, Kurvenradius, Halteverbotslinie) */
export const zufSicht = (st: StreifenErgebnis[]): ZufahrtErgebnis[] => st.filter(s => !s.trottoirueberfahrt).flatMap(s => s.zufahrten)

// ── Hauptfunktion ──
export interface AutoEingang {
  st: StreifenErgebnis[]
  fall: Fall
  geo: AutoGeo
  /** bisher gesetzte Werte (gelesen für Ableitungen und Kopien) */
  w: Vorbelegung
  setze: Setze
  feldHinweis: FeldHinweis
  hinweise: string[]
  /** Anzeige je Pfad im Zustand «rechner» (Feld ohne Wert, Sichtrechner rechnet je Zufahrt) */
  rechner: Record<string, string>
  /** Ausgabe ohne Feld: OSM-Knoten der Lage (Kreuzung bzw. Einmündung, nicht am Kreisel), für den Verweis auf den SichtweitenCheck */
  aus?: { knoten?: number }
}

export function automatik(x: AutoEingang): void {
  const { st, fall, geo, w, setze, feldHinweis, rechner } = x
  const gerade = st.flatMap(s => s.zufahrten.filter(z => z.art !== 'abbiegend'))
  const zuf = st.flatMap(s => s.zufahrten)
  const osm = geo.osm ?? null
  const av = geo.av?.length ? new AvIndex(geo.av) : null
  const n = osm ? netzBauen(osm) : null
  // Querungsachse über alle Teilstreifen (Bord bis Bord, je 1 m darüber)
  const s0 = st[0], ax = einheit(sub(s0.p1, s0.p0))
  const ts = st.flatMap(s => [s.p0, s.p1, ...s.rand]).map(p => dot(sub(p, s0.p0), ax))
  const A = add(s0.p0, ax, Math.min(...ts) - 1), B = add(s0.p0, ax, Math.max(...ts) + 1)
  const mitte: P = add(A, sub(B, A), 0.5)

  // ── gequerte Wege (Rechnung bzw. Schnitt mit der Achse) ──
  const gequert = new Set<number>()
  for (const z of gerade) { const id = wegId(z.osmWeg); if (id !== null) gequert.add(id) }
  for (const s of st) for (const e of s.entfallen) if (e.art === 'gerade') { const id = wegId(e.osmWeg); if (id !== null) gequert.add(id) }
  if (n) for (const [id, { w: ow, pts }] of n.wege) {
    if (!ARM_HW.includes(ow.tags.highway ?? '')) continue
    for (let i = 1; i < pts.length; i++) if (segSchnitt(A, B, pts[i - 1], pts[i])) { gequert.add(id); break }
  }
  const strassenWege = (): Set<number> => {
    if (!n) return new Set(gequert)
    const namen = new Set([...gequert].map(id => n.wege.get(id)?.w.tags.name?.trim()).filter((v): v is string => !!v))
    const aus = new Set([...gequert].filter(id => n.wege.has(id)))
    if (namen.size) for (const [id, { w: ow }] of n.wege) if (ARM_HW.includes(ow.tags.highway ?? '') && namen.has(ow.tags.name?.trim() ?? '')) aus.add(id)
    return aus
  }
  const strasse = strassenWege()

  // ── B1 Lage: Kreisel, Knoten (Einmündung bzw. Kreuzung), Strecke ──
  let knoten: { id: number; p: P; d: number; arme: Arm[] } | null = null
  let kreiselD: number | null = null
  if (n) {
    for (const [, { w: ow, pts }] of n.wege) {
      if (!['roundabout', 'circular'].includes(ow.tags.junction ?? '') || !ARM_HW.includes(ow.tags.highway ?? '')) continue
      const d = linieAbstand(pts, st)
      if (d <= AUTO.knotenM + 1e-9 && (kreiselD === null || d < kreiselD)) kreiselD = d
    }
    const kandidaten = new Set<number>()
    for (const id of gequert) for (const k of n.wege.get(id)?.w.knoten ?? []) kandidaten.add(k)
    for (const k of kandidaten) {
      const arme = armeVon(n, k)
      if (arme.length < 3) continue
      const p = n.knoten.get(k)!, d = abstandQuerung(p, st)
      if (d <= AUTO.knotenM + 1e-9 && (!knoten || d < knoten.d)) knoten = { id: k, p, d, arme }
    }
  }
  // Rechnung: Knoten an den geraden Zufahrten bzw. Strassenende am Knoten (Einmündung)
  const einmRechnung = st.flatMap(s => s.entfallen).filter(e => e.art === 'gerade' && e.grund === 'einmuendung')
  const knotenRechnungM = (): number | null => {
    const d = [...gerade.map(z => z.ersterKnotenM), ...zuf.filter(z => z.art === 'abbiegend').map(z => z.knotenM),
      ...einmRechnung.map(e => { const m = /nach ([\d.]+) m/.exec(e.quelle); return m ? Number(m[1]) : null })]
      .filter((v): v is number => v !== null && Number.isFinite(v))
    return d.length ? Math.min(...d) : null
  }
  if (n) {
    if (kreiselD !== null) {
      setze('lage', 'kreisel', 'osm', `Kreisel ${ganz(kreiselD)} m vom Streifen (OSM)${tag('junction=roundabout')}`)
      setze('q3.kreisel', true, 'osm', 'Kreisel am Streifen (OSM)')
    } else if (knoten) {
      const k = knoten
      if (x.aus) x.aus.knoten = k.id
      const weiter = gerade.some(z => z.osmKnoten === String(k.id))
      const endetR = einmRechnung.some(e => e.osmKnoten === String(k.id))
      // OSM: an diesem Knoten nur ein Arm der gequerten Strasse (Name bzw. Weg)
      const armeStrasse = k.arme.filter(a => strasse.has(a.wid)).length
      const endet = endetR || (!weiter && armeStrasse === 1)
      if (endet) {
        setze('lage', 'einmuendung', 'osm', `Einmündung: Knoten ${ganz(k.d)} m vom Streifen, die gequerte Strasse endet dort ` +
          `(OSM-Netz${endetR ? ', Sichtrechner' : ''}; ${k.arme.length} Arme)`)
        setze('q3.ueber', 'einmuendend', 'annahme', 'Querung über die einmündende Strasse (Lage Einmündung)')
        setze('q3.kreisel', false, 'osm', `kein Kreisel innerhalb ${AUTO.knotenM} m (OSM)`)
      } else {
        // Paket C: Vortrittszeichen (OSM) auf einem Arm bis 20 m vom Knoten entscheiden die Rolle; ohne Zeichen bleibt sie offen
        const rolle = vortrittRolle(k, strasse, geo.vortritt ?? null)
        if (rolle?.lage) setze('lage', rolle.lage, 'osm', rolle.text)
        else feldHinweis('lage', `Kreuzung ${ganz(k.d)} m entfernt (OSM). Bitte wählen: Führt die Querung über die Strasse mit Vortritt oder ` +
          `über die einmündende Strasse ohne Vortritt?${tag(`Knoten mit ${k.arme.length} Armen`)}` + (rolle ? ` (${rolle.text})` : ''))
      }
    } else {
      setze('lage', 'strecke', 'osm', `kein Knoten und kein Kreisel innerhalb ${AUTO.knotenM} m vom Streifen (OSM-Netz)`)
    }
  }
  // A7 Verzweigung: Knoten bis 20 m (OSM-Netz bzw. Sichtrechner)
  if (n) {
    const d = kreiselD ?? knoten?.d ?? null
    if (d !== null) setze('verzweigung', true, 'rechnung', `${kreiselD !== null ? 'Kreisel' : 'Knoten'} ${ganz(d)} m vom Streifen (OSM-Netz)`)
    else setze('verzweigung', false, 'rechnung', `kein Knoten innerhalb ${AUTO.knotenM} m vom Streifen (OSM-Netz)`)
  } else if (zuf.length || einmRechnung.length) {
    const d = knotenRechnungM()
    if (d !== null && d <= AUTO.knotenM + 1e-9) setze('verzweigung', true, 'rechnung', `Sichtrechner: Knoten ${ganz(d)} m vom Streifen`)
    else if (gerade.length && gerade.every(z => z.ersterKnotenM === null || z.ersterKnotenM > AUTO.knotenM) && !einmRechnung.length &&
      zuf.every(z => z.art !== 'abbiegend' || (z.knotenM ?? Infinity) > AUTO.knotenM))
      setze('verzweigung', false, 'rechnung', `Sichtrechner: kein Knoten innerhalb ${AUTO.knotenM} m an den Zufahrten`)
  }

  // ── B2 Abstände zum nächsten Fussgängerstreifen bzw. Lichtsignal (entlang derselben Strasse), Knoten mit LSA, Arme ──
  const eigenId = fall.ort.uebergang
  if (n && osm) {
    const reichweite = geo.ladeort ? Math.floor((geo.osmRadiusM ?? AUTO.osmRadiusM) - Math.max(...st.map(s => dist(s.m, geo.ladeort!))) - 5) : null
    const max = reichweite ?? Infinity
    const ab = strassenAbstaende(n, strasse, A, B, mitte, max)
    if (ab) {
      const fgs = osm.uebergaenge.filter(u => u.id !== eigenId && istFgs(markierung(u.tags)) && abstandQuerung(ll2p(u), st) > AUTO.eigenFgsM)
      const lsa = [...osm.ampeln, ...osm.uebergaenge.filter(u => istLsaUebergang(u.tags))]
        .filter(u => u.id !== eigenId && abstandQuerung(ll2p(u), st) > AUTO.eigenLsaM)
      const naechst = (ks: OsmKnoten[]) => ks.map(k => ab.get(k.id)).filter((v): v is number => v !== undefined).sort((a, b) => a - b)[0] ?? null
      // Runde 4 (S6): endet die Strasse an einem Knoten ohne Fortsetzung, zählt ohne Fund entlang der Strasse ein Lichtsignal bis
      // 30 m von diesem Knoten als Lichtsignal am Knoten (Ampel highway=traffic_signals wie knotenLsa, keine Fussgänger-LSA einer
      // anderen Querung); bis 50 m ist es unklar, die Suche endet dort
      const ampeln = osm.ampeln.filter(a => !(a.id === eigenId || (a.tags.crossing && abstandQuerung(ll2p(a), st) <= AUTO.eigenFgsM)))
      const lsaAm = (k: number, bis: number) => ampeln.some(u => dist(ll2p(u), n.knoten.get(k)!) <= bis + 1e-9)
      const endenOhne = ab.seiten.flatMap(x => x.enden.filter(e => !e.fortgesetzt && !x.enden.some(f => f.fortgesetzt)))
      const lsaEnde = endenOhne.filter(e => lsaAm(e.k, AUTO.knotenLsaJaM)).map(e => e.d).sort((a, b) => a - b)[0] ?? null
      const dF = naechst(fgs), dL0 = naechst(lsa)
      // nur ohne Fund entlang der Strasse (ein gefundenes Lichtsignal bleibt wie bisher)
      const dL = dL0 ?? lsaEnde
      // Korrektur S6: ohne Fund «mindestens» nur die tatsächlich durchsuchte Länge (gleichnamige Wege bis zum Namenswechsel, höchstens
      // die Reichweite der Daten) als Annahme, und nur, wenn sie die Schwelle von G1 bzw. G2 erreicht; sonst offen. Runde 4: endet die
      // Strasse in einer Richtung ohne Fortsetzung (Querstrasse, Sackgasse), ist diese Richtung ganz durchsucht und begrenzt nicht
      const name = [...new Set([...gequert].map(id => n.wege.get(id)?.w.tags.name?.trim()).filter(Boolean))].join(' bzw. ')
      // Runde 5 (Stelle 38): Lichtsignal am nahen Knoten (wie knotenLsa) für den Hinweis ohne Fund
      const knotenAmpelM = knoten ? (() => { const d = ampeln.map(a => dist(ll2p(a), knoten!.p)).sort((a, b) => a - b)[0] ?? Infinity
        return d <= AUTO.knotenLsaJaM + 1e-9 ? d : null })() : null
      const ohneFund = (pfad: string, was: string, schwelle: number, weiter: string, endeUnklar?: (k: number) => boolean) => {
        if (reichweite === null || reichweite <= 0) return
        const su = sucheAuswerten(ab, max, endeUnklar)
        const enden = su.seiten.filter(x => x.art === 'ende').map(x => x.laenge).sort((a, b) => a - b).map(ganz)
        // beide Richtungen enden ohne Fortsetzung: die ganze Strasse ist durchsucht; Wert = ihre Länge mit Kennzeichen ganzeStrasse
        // (G1/G2 dann Hinweis «nicht anwendbar», kein Befund), als Annahme wie der Fall «mindestens» (Abwesenheit in OSM; Runde 4)
        if (su.grenze === 'ende') {
          const L = Math.round(su.durchsucht)
          setze(pfad, L, 'annahme', `ganze ${name || 'Strasse'} durchsucht, ${ganz(L)} m (endet in beiden Richtungen ohne Fortsetzung, ` +
            `nach ${enden.join(' bzw. ')} m): ${was} auf ihr (OSM), ${weiter}`, true)
          return
        }
        const bis = `entlang ${name ? `der ${name}` : 'der Strasse'} ${su.grenze === 'reichweite' ? 'bis zur Reichweite der Daten'
            : su.grenze === 'wechsel' ? 'bis zum Namenswechsel' : 'bis zum Strassenende (Lichtsignal 30 bis 50 m davon)'} in ` +
            `${ganz(su.durchsucht)} m${enden.length ? ` (in der anderen Richtung endet sie nach ${enden[0]} m ohne Fortsetzung)` : ''}`
        if (su.durchsucht >= schwelle - 1e-9) setze(pfad, Math.floor(su.durchsucht), 'annahme', `${bis} ${was} gefunden (OSM): mindestens ` +
          `${ganz(Math.floor(su.durchsucht))} m angenommen`)
        else if (pfad === 'abstandLsaM' && knotenAmpelM !== null) feldHinweis(pfad, `Das Lichtsignal der Kreuzung (${ganz(knotenAmpelM)} m vom ` +
          `Knoten) regelt die Querstrasse; entlang ${name ? `der ${name}` : 'der gequerten Strasse'} ist keines bekannt (OSM, ${ganz(su.durchsucht)} m ` +
          'durchsucht). Abstand bei Bedarf von Hand eingeben')
        else feldHinweis(pfad, `${bis} ${was} gefunden (OSM), weniger als ${schwelle} m durchsucht: Abstand von Hand eingeben`)
      }
      if (dF !== null) setze('abstandFgsM', Math.round(dF), 'osm', `nächster markierter Übergang ${ganz(dF)} m entlang der Strasse (OSM)`)
      else ohneFund('abstandFgsM', 'kein markierter Übergang', KATALOG.G1.werte!.min, 'kein weiterer Fussgängerstreifen möglich')
      if (dL !== null) setze('abstandLsaM', Math.round(dL), 'osm', dL === dL0 ? `nächstes Lichtsignal ${ganz(dL)} m entlang der Strasse (OSM)`
        : `Lichtsignal am Knoten, an dem die Strasse endet: ${ganz(dL)} m entlang der Strasse (OSM, Lichtsignal bis ${AUTO.knotenLsaJaM} m vom Knoten)`)
      else ohneFund('abstandLsaM', 'kein Lichtsignal', KATALOG.G2.werte!.min, 'Abstand zu einem Lichtsignal nicht anwendbar', k => lsaAm(k, AUTO.knotenLsaNeinM))
    }
    if (knoten) {
      const k = knoten
      const ampeln = osm.ampeln.filter(a => !(a.id === eigenId || (a.tags.crossing && abstandQuerung(ll2p(a), st) <= AUTO.eigenFgsM)))
      const dA = ampeln.map(a => dist(ll2p(a), k.p)).sort((a, b) => a - b)[0] ?? Infinity
      if (dA <= AUTO.knotenLsaJaM + 1e-9) {
        setze('knotenLsa', true, 'osm', `Lichtsignal ${ganz(dA)} m vom Knoten (OSM)${tag('highway=traffic_signals')}`)
        setze('q3.lsaKnoten', true, 'osm', `Lichtsignal ${ganz(dA)} m vom Knoten (OSM)`)
      } else if (dA > AUTO.knotenLsaNeinM) {
        setze('knotenLsa', false, 'annahme', `kein Lichtsignal in OSM innerhalb ${AUTO.knotenLsaNeinM} m vom Knoten (OSM oft unvollständig)`)
        setze('q3.lsaKnoten', false, 'annahme', `kein Lichtsignal in OSM innerhalb ${AUTO.knotenLsaNeinM} m vom Knoten`)
      } else feldHinweis('knotenLsa', `Lichtsignal ${ganz(dA)} m vom Knoten (OSM): gehört es zum Knoten? Von Hand wählen`)
      // Arme ohne Querung: Übergang (markiert bzw. Lichtsignal) innert 25 m auf dem Arm; der Arm der eigenen Querung zählt mit Querung
      const mitQ = osm.uebergaenge.filter(u => istFgs(markierung(u.tags)))
      const mitQIds = new Set(mitQ.map(u => u.id))
      let ohne = 0
      for (const a of k.arme) {
        const ids = armKnotenBis(a, AUTO.armUebergangM)
        const teil = a.pts.slice(0, ids.length + 1)
        const eigen = linieAbstand(teil, st) <= AUTO.eigenFgsM
        if (!eigen && !ids.some(id => mitQIds.has(id))) ohne++
      }
      setze('knotenArmeOhneQuerung', ohne, 'annahme', `Knoten mit ${k.arme.length} Armen (OSM), ${k.arme.length - ohne} davon mit markiertem ` +
        `Übergang innert ${AUTO.armUebergangM} m (OSM-Übergänge oft unvollständig)`)
    }
  }

  // ── B3 Rückversatz (AV) ──
  if (n && av && knoten && st.every(s => s.randQuelle === 'AV')) {
    const k = knoten
    const haupt = k.arme.filter(a => !strasse.has(a.wid))
    const zumStreifen = einheit(sub(mitte, k.p))
    const werte: number[] = []
    for (const a of haupt) {
      const u = einheit(sub(punktEntlang(a.pts, 10) ?? a.pts[a.pts.length - 1], k.p))
      let q = links(u)
      if (dot(q, zumStreifen) < 0) q = rechts(u)
      for (const d of [12, 15, 18]) {
        const p = punktEntlang(a.pts, d)
        if (!p) continue
        const t = av.sehne(p, q, FAHRBAHN, 30)
        if (t === null) continue
        const rand = add(p, q, t)
        werte.push(Math.min(...st.flatMap(eckenVon).map(e => dot(sub(e, rand), q))))
      }
    }
    if (werte.length >= 2 && Math.max(...werte) - Math.min(...werte) <= 1.5)
      setze('rueckversatzM', r1(Math.max(0, median(werte))), 'av', `AV: Fahrbahnrand der Querstrasse bis zur Streifenkante (${werte.length} Messungen ` +
        `12 bis 18 m neben dem Knoten)`)
  }

  // ── B4 Haltestelle (Art, Lage, verdeckt), A5 angrenzend, Tramhaltestellenbereich ──
  haltestelle(x, n, mitte, ax)

  // ── B5 Tram ──
  if (st.some(s => s.tram === true) && osm) {
    const arten = new Set<string>()
    const texte: string[] = []
    for (const t of osm.tram) {
      const pts = t.geom.map(([la, lo]) => lv95(la, lo))
      for (let i = 1; i < pts.length; i++) {
        const sx = segSchnitt(A, B, pts[i - 1], pts[i])
        if (!sx) continue
        const p = add(A, sub(B, A), sx[0])
        const art = av?.artBei(p) ?? null
        if (art === 'Bahn' || art === 'Verkehrsinsel') { arten.add('eigentrassee:av'); texte.push(`Gleis in der AV-Fläche ${art === 'Bahn' ? 'Bahn' : 'Verkehrsinsel'}`) }
        else if (t.tags.embedded === 'yes' || t.tags.embedded === 'partial') { arten.add('fahrbahn:osm'); texte.push(`Gleis in der Fahrbahn (OSM)${tag(`embedded=${t.tags.embedded}`)}`) }
        else if (art === 'Strasse_Weg') { arten.add('fahrbahn:av'); texte.push('Gleis in der AV-Fläche Strasse/Weg') }
        else arten.add('offen')
      }
    }
    const werte = new Set([...arten].map(a => a.split(':')[0]))
    if (werte.size === 1 && !werte.has('offen')) {
      const [wert] = [...werte]
      const quelle: Quelle = [...arten].some(a => a.endsWith(':osm')) && ![...arten].some(a => a.endsWith(':av')) ? 'osm' : 'av'
      setze('tram', wert, quelle, `Tramgleis quert die Querung: ${[...new Set(texte)].join('; ')}`)
    } else if (werte.size > 1) feldHinweis('tram', 'Tramgleise teils auf eigenem Gleiskörper, teils in der Fahrbahn (AV/OSM): von Hand wählen')
  }

  // ── B6 Strassentyp (amtliche Quelle vor OSM; bleibt sie offen, mit Hinweis und ohne OSM-Annahme) ──
  if (geo.strassentyp?.wert) setze('strassentyp', geo.strassentyp.wert, geo.strassentyp.quelle, geo.strassentyp.text)
  else if (geo.strassentyp?.text) feldHinweis('strassentyp', geo.strassentyp.text)
  else if (n && gequert.size) {
    const klassen = [...gequert].map(id => n.wege.get(id)?.w.tags.highway).filter((v): v is string => !!v)
    const RANG = ['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street']
    const k = klassen.filter(h => RANG.includes(h.replace(/_link$/, ''))).map(h => h.replace(/_link$/, ''))
      .sort((a, b) => RANG.indexOf(a) - RANG.indexOf(b))[0]
    if (k && ['trunk', 'primary', 'secondary', 'tertiary'].includes(k))
      setze('strassentyp', 'verkehrsorientiert', 'annahme', `Hauptstrasse laut OSM: verkehrsorientiert angenommen${tag(`highway=${k}`)}`)
    else if (k && ['residential', 'living_street'].includes(k))
      setze('strassentyp', 'siedlungsorientiert', 'annahme', `Wohnstrasse laut OSM: siedlungsorientiert angenommen${tag(`highway=${k}`)}`)
    else if (k === 'unclassified') feldHinweis('strassentyp', `OSM ohne Einstufung der Strasse: Durchgangs- oder Quartierstrasse von Hand wählen${tag('highway=unclassified')}`)
  }

  // ── B8 Tags des eigenen Übergangs (nur Hinweise), Ein-/Ausfahrt ──
  if (osm) {
    const eigen = osm.uebergaenge.find(u => u.id === eigenId) ??
      osm.uebergaenge.filter(u => abstandQuerung(ll2p(u), st) <= 2).sort((a, b) => abstandQuerung(ll2p(a), st) - abstandQuerung(ll2p(b), st))[0]
    if (eigen) {
      const t = eigen.tags
      if (t['crossing:island'] === 'yes' && w['insel.vorhanden']?.wert === false)
        feldHinweis('insel.vorhanden', `laut OSM hat der Übergang eine Insel, die Streifen sind aber nicht geteilt: prüfen${tag('crossing:island=yes')}`)
      if (t.flashing_lights && t.flashing_lights !== 'no') feldHinweis('blinklicht', `laut OSM mit Blinklicht: Art des Blinklichts wählen${tag(`flashing_lights=${t.flashing_lights}`)}`)
      else if (t.flashing_lights === 'no') feldHinweis('blinklicht', `laut OSM ohne Blinklicht${tag('flashing_lights=no')}`)
      if (t.tactile_paving) feldHinweis('taktil', `laut OSM ${t.tactile_paving === 'no' ? 'keine' : 'mit'} ertastbaren Platten am Übergang: vor Ort prüfen${tag(`tactile_paving=${t.tactile_paving}`)}`)
      if (t.button_operated) feldHinweis('lsaZeiten.inselNurAnmeldung', `laut OSM mit Taster${tag(`button_operated=${t.button_operated}`)}`)
    }
  }
  if (n) {
    let best: number | null = null
    for (const [, { w: ow, pts }] of n.wege) {
      if (ow.tags.highway !== 'service') continue
      ow.knoten.forEach((k, i) => {
        if ((n.an.get(k) ?? []).length === 0) return
        const d = abstandQuerung(pts[i], st)
        if (d <= AUTO.einfahrtM + 1e-9 && (best === null || d < best)) best = d
      })
    }
    if (best !== null) setze('einAusfahrtNah', true, 'annahme', `Zufahrtsweg (OSM) mündet ${ganz(best)} m vom Streifen${tag('highway=service')}`)
  }

  // ── A6 Busstreifen (OSM-Tags der Zufahrten) ──
  const tags = geo.osmTags ?? null
  const busRechnung = zuf.some(z => z.netzHinweis.includes('busstreifen'))
  if (tags || busRechnung) {
    const wege = [...new Set([...gerade.map(z => wegId(z.osmWeg)), ...gequert])].filter((v): v is number => v !== null)
    const bus = wege.map(id => ({ id, tag: busTag(tags?.get(id) ?? {}) })).filter(b => b.tag)
    if (bus.length) setze('busspur', true, 'osm', `Busstreifen nach OSM${tag(bus[0].tag)}`)
    else if (busRechnung) setze('busspur', true, 'osm', 'Busstreifen nach OSM (Fahrstreifen der Zufahrt)')
    else if (wege.length) setze('busspur', false, 'annahme', 'kein Busstreifen in OSM an den Zufahrten (OSM lückenhaft)')
  }

  // ── A6 Neuanlage ──
  const handIds = new Set(fall.streifenHand.map(h => h.id))
  const vonHand = st.some(s => handIds.has(s.fgsId))
  const mk = fall.ort.markierung
  if (!vonHand) setze('neuanlage', false, mk && istFgs(mk) ? 'osm' : 'rechnung', mk && istFgs(mk)
    ? 'bestehender Übergang (OSM mit Markierung bzw. Lichtsignal)' : 'Streifen aus OSM und AV bzw. Luftbild erkannt: Bestand')
  else if (eigenId !== null && mk && istFgs(mk)) setze('neuanlage', false, 'osm', 'Streifen von Hand an einem markierten OSM-Übergang: Bestand')
  else if (eigenId === null || (mk && !istFgs(mk)))
    setze('neuanlage', true, 'annahme', eigenId === null ? 'Streifen von Hand ohne OSM-Übergang: neue Anlage angenommen'
      : 'Streifen von Hand an einem OSM-Übergang ohne Markierung: neue Anlage angenommen')

  // ── A7 Kurvenradius aus dem Sichtrechner ──
  const zs = zufSicht(st)
  const radien = zs.filter(z => z.kurvenradiusM !== null && z.kurvenradiusM > 0)
  if (radien.length) {
    const z = radien.reduce((a, b) => (b.kurvenradiusM! < a.kurvenradiusM! ? b : a))
    const geschaetzt = /geschätzt/.test(z.radiusQuelle ?? '')
    const was = z.art === 'abbiegend' ? `Abbiegeradius${z.strasse ? ` aus der ${z.strasse}` : ''}` : 'Radius im Kreisel'
    const wie = geschaetzt ? 'aus den Fahrbahnbreiten geschätzt' : `aus ${(z.radiusQuelle ?? 'der Rechnung').replace(/^geschätzt \((.*)\)$/, '$1 geschätzt')}`
    setze('kurve.radius', z.kurvenradiusM, geschaetzt ? 'annahme' : 'rechnung', `${was} ${f1(z.kurvenradiusM!)} m, ${wie} (Sichtrechner)`)
  } else if (zs.length) rechner['kurve.radius'] = 'Sichtrechner: keine abbiegende Zufahrt und kein Kreisel; gerade Zufahrten nach Tempo'

  // ── A9 Halteverbotslinie nach Sichtbedarf ──
  if (zs.length) {
    let bedarf = 0, wo = ''
    for (const z of zs) for (const k of z.konflikte.filter(k => k.klasse === 'auto')) {
      const s = st.find(y => y.fgsId === z.fgsId) ?? s0
      // nur der Teil des Parkfelds im Sichtfeld (lange Parkstreifen reichen weit darüber hinaus)
      const teil = z.feld?.length ? schnitt(k.geom, z.feld) : k.geom
      const pkt = teil.flatMap(poly => poly[0] ?? [])
      if (!pkt.length) continue
      const fern = Math.min(Math.max(...pkt.map(p => abstandStreifen(p, s))), z.sichtweite)
      if (fern > bedarf) { bedarf = fern; wo = z.strasse ?? '' }
    }
    const wert = Math.ceil(bedarf * 2) / 2
    setze('hvlBedarfM', wert, 'rechnung', wert > 0 ? `Sichtrechner: Auto-Parkfelder im Sichtfeld bis ${f1(wert)} m vor dem Streifen` +
      (wo ? ` (Zufahrt ${wo})` : '') : 'Sichtrechner: keine Auto-Parkfelder im Sichtfeld')
  }

  // ── A8 Annahmen mit Schwellen ──
  const dtv = w.dtv?.wert as number | undefined, nR = w.nRichtung?.wert as number[] | undefined
  const fb = w.fahrbahnB, L = w.querdistanzL?.wert as number[] | undefined
  if (dtv !== undefined || nR) {
    const nMax = nR ? Math.max(...nR) : 0
    if ((dtv ?? 0) >= AUTO.dtvStark || nMax >= AUTO.nStark)
      setze('starkBelastet', true, 'annahme', [dtv !== undefined && dtv >= AUTO.dtvStark ? `DTV ${ganz(dtv)} ab ${ganz(AUTO.dtvStark)}` : '',
        nMax >= AUTO.nStark ? `${nMax} Fahrstreifen je Richtung` : ''].filter(Boolean).join(', ') + ': stark befahren angenommen')
    else if (dtv !== undefined) setze('starkBelastet', false, 'annahme', `DTV ${ganz(dtv)} unter ${ganz(AUTO.dtvStark)} und 1 Fahrstreifen je Richtung: ` +
      'nicht stark befahren angenommen')
  }
  if (dtv !== undefined) {
    const kl = dtv < AUTO.mivMittel ? 'tief' : dtv <= AUTO.mivHoch ? 'mittel' : 'hoch'
    setze('mivKlasse', kl, 'annahme', `DTV ${ganz(dtv)}: ${kl === 'tief' ? 'wenig' : kl === 'mittel' ? 'mittel' : 'viel'} Autoverkehr angenommen ` +
      `(unter ${ganz(AUTO.mivMittel)} wenig, bis ${ganz(AUTO.mivHoch)} mittel)`)
  }
  if (L?.length) {
    const lang = Math.max(...L) > AUTO.querungLangM
    setze('querungLang', lang, 'annahme', `längste Teilquerung ${f1(Math.max(...L))} m: ${lang ? 'lang' : 'nicht lang'} angenommen ` +
      `(Schwelle ${AUTO.querungLangM} m)`)
  }
  // Einengung: Fahrbahn an der Querung um mindestens 1 m schmaler als die Zufahrten (nur ohne Insel, Zufahrten mit gemessener Breite)
  const breiten = gerade.filter(z => (z.art === 'beide' || z.art === 'einbahn') && z.fahrbahnM !== null).map(z => z.fahrbahnM!)
  let einengung = null as boolean | null
  if (fb && st.length === 1 && breiten.length && breiten.length === gerade.length) {
    const zb = Math.min(...breiten), B0 = fb.wert as number
    // Runde 5 (F7): aus dem Breitenvergleich nur «keine Einengung» als Annahme; eine schmalere Stelle ist nur ein Hinweis (kein Wert, kein
    // Befund F4 aus einer geometrischen Annahme)
    const schmaler = B0 <= zb - AUTO.einengungM + 1e-9
    if (!schmaler) {
      einengung = false
      setze('einengung', false, 'annahme', `Fahrbahn an der Querung ${f1(B0)} m, Zufahrt ${f1(zb)} m: keine Einengung angenommen ` +
        `(Schwelle ${f1(AUTO.einengungM)} m schmaler)`)
    } else {
      const lg = einengungLaenge(av, st, zb - AUTO.einengungLaengeTolM)
      feldHinweis('einengung', `Fahrbahn an der Querung ${f1(B0)} m, Zufahrt ${f1(zb)} m (Rechnung): vielleicht eine Nase bzw. Einengung` +
        `${lg !== null ? ` auf etwa ${f1(lg)} m Länge (AV)` : ''}; vor Ort prüfen`)
    }
  }
  if (w.typ?.wert === 'ohne_vortritt') {
    const insel = w['insel.vorhanden']?.wert
    if (insel === false && einengung === false) setze('ohneBaulich', true, 'annahme', 'keine Insel und keine Einengung: ohne bauliche Hilfe angenommen')
    else if (insel === true || einengung === true) setze('ohneBaulich', false, 'annahme', insel === true ? 'Insel an der Querung' : 'Einengung an der Querung')
  }
  // Trottoir vor bzw. hinter der Parkreihe: aus dem Plan-Element «Vorgezogener Seitenraum», wenn jede gerade Zufahrt mit Parkierung
  // rechts an ihrem Parkierungsende (Streifenende rechts der Fahrtrichtung) ein Element mit Messbezug hat (kleinster Überstand);
  // sonst AV-Bord am Streifen gegen den Bord entlang der Zufahrt, minus Parkstreifen
  const sr = seitenraumVorbelegung(fall, st, gerade.filter(z => z.parkRechts))
  if (sr) {
    const v = sr.reduce((a, b) => (b.st.ueberstand < a.st.ueberstand ? b : a))
    setze('seitenraumVorParklinieM', r2s(v.st.ueberstand), 'rechnung', `Plan: vorgezogener Seitenraum (${[...new Set(sr.map(x => planTitel(x.id)))]
      .join(', ')}), Überstand über die Parklinie`)
  } else if (av && st.every(s => s.randQuelle === 'AV')) {
    const mitPark = gerade.filter(z => z.parkRechts)
    const sv = mitPark.map(z => seitenraum(av, st.find(s => s.fgsId === z.fgsId) ?? s0, z)).filter((v): v is number => v !== null)
    if (sv.length) {
      const v = r1(Math.max(-5, Math.min(5, Math.min(...sv))))
      // Parkstreifen in der Rechnung meist angenommen (Breite aus der Regel, nicht gemessen): dann Annahme
      const handPark = mitPark.every(z => /von Hand/.test(z.abzugQuelle ?? ''))
      if (Math.abs(v) < AUTO.seitenraumTolM) feldHinweis('seitenraumVorParklinieM', 'Das Trottoir endet nach Plan (AV) etwa auf der Linie der ' +
        `Parkfelder; bitte vor Ort messen, ob es vorsteht${tag(`${f1(v)} m, Messgenauigkeit ± ${f1(AUTO.seitenraumTolM)} m`)}`)
      else setze('seitenraumVorParklinieM', v, handPark ? 'av' : 'annahme',
        `AV: Bordkante am Streifen gegen die Bordkante 15 bis 25 m entlang der Zufahrt, minus Parkstreifen${handPark ? ' (von Hand)' : ' (Breite angenommen)'}`)
    }
  }

  // ── A4 Kopien ──
  if (fb) setze('lsaZeiten.L', fb.wert, fb.quelle, `wie Fahrbahnbreite (${fb.text})`)
  if (L?.length === 2) setze('lsaZeiten.teile', L, w.querdistanzL!.quelle, `wie Länge jeder Teilquerung (${w.querdistanzL!.text})`)
  const ib = w['insel.breite']
  if (ib && w['insel.vorhanden']?.wert === true) setze('lsaZeiten.inselB', ib.wert, ib.quelle, `wie Inseltiefe (${ib.text})`)
  // Runde 5 (F3): Werte der gequerten Strasse sind nur dann die der Seitenstrasse, wenn die Querung über die einmündende Strasse führt
  // (Lage Einmündung); die Hauptstrasse ist dann die Querstrasse der abbiegenden Zufahrten (Tempo des Sichtrechners)
  const ueberSeite = w['q3.ueber']?.wert === 'einmuendend'
  const vs = w.vSig
  if (vs && ueberSeite) setze('q3.vSigEinm', vs.wert, vs.quelle, `wie signalisiertes Tempo (${vs.text})`)
  const abb = zuf.filter(z => z.art === 'abbiegend' && z.tempoQuelle !== 'Ersatz')
  if (ueberSeite && abb.length) {
    const vH = Math.max(...abb.map(z => z.tempo))
    const q: Quelle = abb.some(z => z.tempoQuelle === 'Korrektur') ? 'hand' : abb.every(z => z.tempoQuelle === TEMPO_QUELLE_AMTLICH) ? 'geoportal' : 'osm'
    const namen = [...new Set(abb.map(z => z.strasse).filter(Boolean))].join(', ')
    setze('q3.vSigHaupt', vH, q, `Tempo der Hauptstrasse${namen ? ` (${namen})` : ''} ${vH} km/h (Sichtrechner, ${q === 'geoportal' ? 'Geoportal' : q === 'hand' ? 'von Hand' : 'OSM'})`)
  }
  if (nR && ueberSeite) setze('q3.nEinm', Math.max(...nR), w.nRichtung!.quelle, `wie Fahrstreifen je Richtung (${w.nRichtung!.text})`)
  if (dtv !== undefined && ueberSeite) {
    setze('q3.dtvEinm', dtv, w.dtv!.quelle, `wie DTV (${w.dtv!.text})`)
    const hoch = dtv >= AUTO.mivEinmHoch
    setze('q3.mivEinmHoch', hoch, 'annahme', `DTV ${ganz(dtv)} ${hoch ? 'ab' : 'unter'} ${ganz(AUTO.mivEinmHoch)}: ${hoch ? 'viel' : 'wenig'} Verkehr angenommen`)
  }
  const tr = w.tempoRegime
  if (tr && ueberSeite) setze('q3.zoneEinm', tr.wert === 't30_zone' ? 't30' : tr.wert === 'begegnungszone' ? 'bgz' : 'keine', tr.quelle, `wie Strecke oder Zone (${tr.text})`)
}

/** Art eines Vortrittszeichens: highway=give_way|stop bzw. Signal CH:3.02 (Kein Vortritt) / CH:3.01 (Stop) in traffic_sign */
function vortrittArt(z: VortrittZeichen): 'give_way' | 'stop' | null {
  if (z.art === 'give_way' || z.art === 'stop') return z.art
  const t = z.zeichen ?? ''
  return /\bCH:3\.02\b/.test(t) ? 'give_way' : /\bCH:3\.01\b/.test(t) ? 'stop' : null
}

/**
 * Vortrittsrolle an einer Kreuzung aus den Vortrittszeichen nach OSM (Paket C, Nutzerentscheid 21.10.2026): Zeichen «Kein Vortritt»
 * bzw. «Stop» (highway=give_way|stop, traffic_sign CH:3.02 bzw. CH:3.01) bis AUTO.knotenM vom Knoten. Es zählt nur, wenn es ein Knoten
 * eines Wegs ist, der ein Arm des Knotens ist (Korrektur S2: Zeichen an Ausfahrten, Rad- und Fusswegen bzw. frei stehende Zeichen
 * zählen nicht). Steht es auf einem Arm der gequerten Strasse, muss diese Vortritt gewähren:
 * knoten_belastet (über die Zufahrt ohne Vortritt); steht es auf der Querstrasse, hat die gequerte Strasse Vortritt:
 * knoten_berechtigt. Zeichen auf beiden: nur Hinweis; ohne Zeichen bzw. ohne Abdeckung: null.
 */
export function vortrittRolle(k: { id: number; p: P; d: number; arme: Arm[] }, strasse: ReadonlySet<number>,
  v: { zeichen: VortrittZeichen[]; bereich: Bereich } | null): { lage?: 'knoten_belastet' | 'knoten_berechtigt'; text: string } | null {
  if (!v || !imBereich(k.p, AUTO.knotenM, v.bereich)) return null
  const zeichen = v.zeichen.filter(z => vortrittArt(z) && z.id !== k.id && dist(z.p, k.p) <= AUTO.knotenM + 1e-9)
  const rollen = new Map<'belastet' | 'berechtigt', VortrittZeichen[]>()
  for (const z of zeichen) {
    const arm = k.arme.find(a => a.knoten.slice(1).includes(z.id))
    if (!arm) continue
    const r = strasse.has(arm.wid) ? 'belastet' : 'berechtigt'
    rollen.set(r, [...(rollen.get(r) ?? []), z])
  }
  if (rollen.size > 1) return { text: 'Vortrittszeichen nach OSM auf der gequerten Strasse und auf der Querstrasse: von Hand wählen' }
  if (!rollen.size) return null
  const [[r, zs]] = [...rollen]
  const z = zs.sort((a, b) => dist(a.p, k.p) - dist(b.p, k.p))[0]
  const art = vortrittArt(z)!
  const was = `«${art === 'stop' ? 'Stop' : 'Kein Vortritt'}» ${ganz(dist(z.p, k.p))} m vom Knoten (OSM)`
  return r === 'belastet'
    ? { lage: 'knoten_belastet', text: `Kreuzung ${ganz(k.d)} m vom Streifen, ${was} auf der gequerten Strasse: sie gewährt Vortritt, Querung über die Zufahrt ohne Vortritt` }
    : { lage: 'knoten_berechtigt', text: `Kreuzung ${ganz(k.d)} m vom Streifen, ${was} auf der Querstrasse: die gequerte Strasse hat Vortritt` }
}

/** Bus-Tag eines Wegs (busway*, lanes:bus, lanes:psv, bus:lanes, psv:lanes), '' ohne */
export function busTag(t: Record<string, string>): string {
  for (const [k, v] of Object.entries(t)) {
    if (/^busway(:(left|right|both))?$/.test(k) && /lane/.test(v)) return `${k}=${v}`
    if (/^lanes:(bus|psv)(:(forward|backward))?$/.test(k) && Number(v) > 0) return `${k}=${v}`
    if (/^(bus|psv):lanes(:(forward|backward))?$/.test(k) && /designated/.test(v)) return `${k}=${v}`
  }
  return ''
}

/** Art des Endes einer Suchrichtung entlang der Strasse (Runde 4, S6) */
export type SuchEnde = 'reichweite' | 'wechsel' | 'ende' | 'ende_unklar'
export interface SuchSeite {
  /** durchsuchte Länge dieser Richtung (m) */
  laenge: number
  /** reichweite: Grenze der geladenen Daten; wechsel: eine andere Strasse setzt die Strasse fort (Namenswechsel); ende: die Strasse
   * endet ohne Fortsetzung (Querstrasse, Sackgasse) – diese Richtung ist ganz durchsucht; ende_unklar: sie endet, aber am Endknoten
   * ist der Fund unklar (Lichtsignal 30 bis 50 m vom Endknoten) – begrenzt wie ein Namenswechsel */
  art: SuchEnde
}
/** Ende der gleichnamigen Wege in einer Richtung: Knoten, Abstand entlang der Strasse, von einer anderen Strasse fortgesetzt */
interface StrassenEnde { k: number; d: number; fortgesetzt: boolean }
interface SuchRoh {
  get: (id: number) => number | undefined
  seiten: [{ amEnde: boolean; weit: number; enden: StrassenEnde[] }, { amEnde: boolean; weit: number; enden: StrassenEnde[] }]
}

/**
 * Fortsetzung am Ende der gleichnamigen Wege (Runde 4, S6): ein Arm einer anderen Strasse (ARM_HW), der höchstens um diesen Winkel
 * von der Richtung der Strasse abweicht, setzt sie fort (Namenswechsel); sonst endet sie dort (Querstrasse quer dazu, Sackgasse).
 * Richtung je über rund 10 m gemessen. 45° wie «längs» in automatikC (im Zweifel Fortsetzung: die Suche bleibt dann begrenzt).
 */
export const FORTSETZUNG_GRAD = 45
const RICHTUNG_M = 10

/**
 * Abstände entlang der gequerten Strasse (Wege gleichen Namens): kürzester Weg im Netz von der Querung (Schnitt der Achse mit
 * einem Weg der Strasse) zu jedem Knoten, höchstens bis max m; je Richtung (Seite) ob die Reichweite erreicht ist, die weiteste
 * Länge und die Enden der gleichnamigen Wege (Knoten mit nur einem Nachbarn auf der Strasse) mit Fortsetzung bzw. ohne. null ohne
 * Schnitt.
 */
function strassenAbstaende(n: Netz, strasse: Set<number>, A: P, B: P, mitte: P, max: number): SuchRoh | null {
  const kanten = new Map<number, [number, number][]>()
  const neben = (a: number, b: number, l: number) => { kanten.set(a, [...(kanten.get(a) ?? []), [b, l]]) }
  let start: { a: number; b: number; da: number; db: number; d: number } | null = null
  for (const id of strasse) {
    const e = n.wege.get(id)
    if (!e) continue
    for (let i = 1; i < e.pts.length; i++) {
      const l = dist(e.pts[i - 1], e.pts[i])
      neben(e.w.knoten[i - 1], e.w.knoten[i], l); neben(e.w.knoten[i], e.w.knoten[i - 1], l)
      const sx = segSchnitt(A, B, e.pts[i - 1], e.pts[i])
      if (sx) {
        const x = add(e.pts[i - 1], sub(e.pts[i], e.pts[i - 1]), sx[1]), d = dist(x, mitte)
        if (!start || d < start.d) start = { a: e.w.knoten[i - 1], b: e.w.knoten[i], da: sx[1] * l, db: (1 - sx[1]) * l, d }
      }
    }
  }
  if (!start) return null
  const st0 = start as { a: number; b: number; da: number; db: number }
  const d = new Map<number, number>([[st0.a, st0.da], [st0.b, st0.db]])
  const seite = new Map<number, 0 | 1>([[st0.a, 0], [st0.b, 1]])
  const vor = new Map<number, number>([[st0.a, st0.b], [st0.b, st0.a]])
  const weit: [number, number] = [st0.da, st0.db], amEnde: [boolean, boolean] = [false, false]
  const offen = [st0.a, st0.b]
  while (offen.length) {
    offen.sort((x, y) => d.get(x)! - d.get(y)!)
    const k = offen.shift()!
    const dk = d.get(k)!, sk = seite.get(k)!
    weit[sk] = Math.max(weit[sk], Math.min(dk, max))
    if (dk > max) { amEnde[sk] = true; continue }
    for (const [m, l] of kanten.get(k) ?? []) {
      const neu = dk + l
      // Reichweite nur, wenn der Nachbar nicht schon näher erreicht ist (der Rückweg über eine Kante zählt nicht; Runde 4)
      if (neu > max) { if ((d.get(m) ?? Infinity) > max) amEnde[sk] = true; continue }
      if (neu < (d.get(m) ?? Infinity)) { d.set(m, neu); seite.set(m, sk); vor.set(m, k); if (!offen.includes(m)) offen.push(m) }
    }
  }
  // Richtung der Strasse am Ende (über rund 10 m rückwärts) und Fortsetzung durch eine andere Strasse
  const pos = (k: number) => n.knoten.get(k)!
  const richtungEin = (k: number): P | null => {
    let a = k, s = 0
    for (let i = 0; i < 500 && s < RICHTUNG_M; i++) {
      const b = vor.get(a)
      if (b === undefined) break
      s += dist(pos(a), pos(b)); a = b
      if (a === st0.a || a === st0.b) break
    }
    return dist(pos(a), pos(k)) < 1e-6 ? null : einheit(sub(pos(k), pos(a)))
  }
  const cosMin = Math.cos(FORTSETZUNG_GRAD * Math.PI / 180)
  const fortgesetzt = (k: number): boolean => {
    const r = richtungEin(k)
    return armeVon(n, k).some(arm => {
      if (strasse.has(arm.wid)) return false
      if (r === null) return true
      const q = punktEntlang(arm.pts, RICHTUNG_M) ?? arm.pts[arm.pts.length - 1]
      return dist(q, arm.pts[0]) > 1e-6 && dot(r, einheit(sub(q, arm.pts[0]))) >= cosMin - 1e-9
    })
  }
  const seiten = ([0, 1] as const).map(i => ({
    amEnde: amEnde[i], weit: weit[i],
    enden: amEnde[i] ? [] : [...d].filter(([k]) => seite.get(k) === i && new Set((kanten.get(k) ?? []).map(([m]) => m)).size <= 1)
      .map(([k, dk]) => ({ k, d: dk, fortgesetzt: fortgesetzt(k) })),
  })) as SuchRoh['seiten']
  return { get: id => d.get(id), seiten }
}

/**
 * Durchsuchte Länge aus der Suche (Runde 4, S6): je Richtung Reichweite, Namenswechsel (Länge bis zum nächsten Ende mit
 * Fortsetzung) bzw. echtes Strassenende (ganz durchsucht, begrenzt nicht). endeUnklar: Ende, an dem ein Fund unklar ist
 * (begrenzt dort). durchsucht: die kürzere der nicht abgeschlossenen Richtungen; enden beide, die Länge der ganzen Strasse ab der
 * Querung (grenze «ende»).
 */
function sucheAuswerten(roh: SuchRoh, max: number, endeUnklar: (k: number) => boolean = () => false):
  { durchsucht: number; grenze: SuchEnde; seiten: [SuchSeite, SuchSeite] } {
  const seiten = roh.seiten.map((x): SuchSeite => {
    if (x.amEnde) return { laenge: max, art: 'reichweite' }
    // Namenswechsel: die kleinste Länge bis zu einem fortgesetzten Ende (ein Ast mit Namenswechsel begrenzt, auch wenn ein anderer
    // weiter reicht; Runde 4)
    const fort = x.enden.filter(e => e.fortgesetzt).map(e => e.d)
    if (fort.length) return { laenge: Math.min(...fort), art: 'wechsel' }
    const unklar = x.enden.filter(e => endeUnklar(e.k)).map(e => e.d)
    return unklar.length ? { laenge: Math.min(...unklar), art: 'ende_unklar' } : { laenge: x.weit, art: 'ende' }
  }) as [SuchSeite, SuchSeite]
  const offenS = seiten.filter(x => x.art !== 'ende')
  // beide Richtungen enden: die ganze Strasse ist durchsucht (Länge beider Richtungen ab der Querung; Runde 4)
  if (!offenS.length) return { durchsucht: seiten[0].laenge + seiten[1].laenge, grenze: 'ende', seiten }
  const kurz = offenS.reduce((a, c) => (c.laenge < a.laenge ? c : a))
  return { durchsucht: kurz.laenge, grenze: kurz.laenge >= max - 1e-9 ? 'reichweite' : kurz.art, seiten }
}

/** Haltestelle: angrenzend, Art (Busbucht bzw. Fahrbahn), Lage in Fahrtrichtung, verdeckt; Tramhaltestellenbereich */
function haltestelle(x: AutoEingang, n: Netz | null, mitte: P, ax: P): void {
  const { st, geo, setze, feldHinweis, w } = x
  const h = geo.haltestellen
  if (!h || 'fehler' in h) return
  const zusatz = h.zusatz ? `; ${h.zusatz}` : ''
  const mitD = h.halte.map(y => ({ y, d: abstandQuerung(y.p, st) })).sort((a, b) => a.d - b.d)
  const abgedeckt = st.flatMap(eckenVon).every(p => imBereich(p, AUTO.haltUmkreisM, h.bereich))
  const nah = mitD[0]
  // A5 angrenzend
  if (nah && nah.d <= AUTO.haltAngrenzendM + 1e-9)
    setze('haltestelleAngrenzend', true, h.quelle, `${HALT_TEXT[nah.y.art]} «${nah.y.name}», ${ganz(nah.d)} m (${h.herkunft}${zusatz})`)
  else if ((!nah || nah.d > AUTO.haltUmkreisM) && abgedeckt)
    setze('haltestelleAngrenzend', false, h.quelle, `keine Haltestelle im Umkreis von ${AUTO.haltUmkreisM} m (${h.herkunft}${zusatz})`)
  // A5 Tramhaltestellenbereich
  const tramArt = (y: OevHalt) => y.art === 'tram' || y.art === 'bus_tram'
  if (h.quelle === 'osm') {
    const tram = mitD.find(z => tramArt(z.y))
    if (tram && tram.d <= AUTO.tramHaltM + 1e-9) setze('tramHaltestellenbereich', true, 'osm', `Tramhaltestelle «${tram.y.name}», ${ganz(tram.d)} m (OSM)`)
    else if ((!tram || tram.d > AUTO.haltUmkreisM) && abgedeckt)
      setze('tramHaltestellenbereich', false, 'osm', `keine Tramhaltestelle im Umkreis von ${AUTO.haltUmkreisM} m (OSM${zusatz})`)
    else if (tram) feldHinweis('tramHaltestellenbereich', `Tramhaltestelle «${tram.y.name}», ${ganz(tram.d)} m (OSM): von Hand wählen`)
  } else if (nah && nah.d <= AUTO.haltUmkreisM) {
    feldHinweis('tramHaltestellenbereich', `Haltestelle «${nah.y.name}», ${ganz(nah.d)} m (${h.herkunft}, ohne Angabe Bus oder Tram): bei Tramhalt «ja» wählen`)
  } else if (abgedeckt) setze('tramHaltestellenbereich', false, h.quelle, `keine Haltestelle im Umkreis von ${AUTO.haltUmkreisM} m (${h.herkunft}${zusatz})`)

  // B4 nächste Bushaltestelle bis 50 m (Geoportal ohne Modus zählt als möglicher Bushalt)
  const bus = mitD.find(z => z.d <= AUTO.haltUmkreisM && (z.y.art === 'bus' || z.y.art === 'bus_tram' || z.y.art === 'oev'))
  if (!bus) return
  // Art: OSM bus_bay am Halt (bzw. an einem Halt derselben Gruppe bis 30 m) → Bucht; Haltepunkt auf einem Fahrbahnweg → Fahrbahn
  let art: 'bucht' | 'fahrbahn' | null = null
  if (h.quelle === 'osm' && w['haltestelle.art']?.wert !== 'keine') {
    const gruppe = h.halte.filter(y => dist(y.p, bus.y.p) <= 30 && y.art !== 'tram')
    const bucht = gruppe.find(y => y.tags?.bus_bay && y.tags.bus_bay !== 'no')
    const aufFb = gruppe.find(y => y.tags?.public_transport === 'stop_position' && y.osmId !== undefined && (n?.an.get(y.osmId) ?? []).length > 0)
    if (bucht) { art = 'bucht'; setze('haltestelle.art', 'bucht', 'osm', `Busbucht (OSM bus_bay=${bucht.tags!.bus_bay} an «${bucht.name}»)`) }
    else if (aufFb) {
      art = 'fahrbahn'
      setze('haltestelle.art', 'fahrbahn', 'annahme', `Haltepunkt «${aufFb.name}» auf der Fahrbahn (OSM stop_position ohne bus_bay): Fahrbahnhaltestelle angenommen`)
    }
  }
  // Lage in Fahrtrichtung: der Halt bedient die Richtung, für die er rechts liegt; Haltebereich ± haltBereichM um den Haltepunkt
  const quer = dot(sub(bus.y.p, mitte), ax)
  const t = quer >= 0 ? links(ax) : rechts(ax)
  const th = dot(sub(bus.y.p, mitte), t)
  const proj = st.flatMap(eckenVon).map(p => dot(sub(p, mitte), t))
  const smin = Math.min(...proj), smax = Math.max(...proj)
  let lage: 'fgs_nach_halt' | 'fgs_vor_halt' | 'im_bereich'
  let abstand: number
  if (th + AUTO.haltBereichM < smin) { lage = 'fgs_nach_halt'; abstand = smin - th }
  else if (th - AUTO.haltBereichM > smax) { lage = 'fgs_vor_halt'; abstand = th - smax }
  else { lage = 'im_bereich'; abstand = 0 }
  const lageText = { fgs_nach_halt: 'hinter dem Haltebereich', fgs_vor_halt: 'vor dem Haltebereich', im_bereich: 'im Haltebereich' }[lage]
  setze('haltestelle.lage', lage, 'annahme', `Haltestelle «${bus.y.name}» (${h.herkunft}): Querung ${lageText}${abstand ? ` (${ganz(abstand)} m)` : ''}, ` +
    `Haltebereich ± ${AUTO.haltBereichM} m um den Haltepunkt angenommen`)
  if (art === 'fahrbahn' && lage === 'fgs_nach_halt' && abstand < AUTO.busVerdecktM)
    setze('haltestelle.verdeckt', true, 'annahme', `Fahrbahnhaltestelle, Querung ${ganz(abstand)} m hinter dem Haltepunkt (unter ${AUTO.busVerdecktM} m): ` +
      'haltender Bus verdeckt angenommen')
}

/** Länge der Einengung (AV): Fahrbahn quer zur Strasse schmaler als grenze, ab der Streifenmitte in beide Richtungen; null ohne AV */
function einengungLaenge(av: AvIndex | null, st: StreifenErgebnis[], grenze: number): number | null {
  if (!av || st.length !== 1) return null
  const s = st[0]
  const t = einheit(rechts(einheit(sub(s.p1, s.p0))))
  const r = links(t)
  const breite = (p: P) => { const a = av.sehne(p, r, FAHRBAHN, 40), b = av.sehne(p, [-r[0], -r[1]], FAHRBAHN, 40); return a === null || b === null ? null : a + b }
  const b0 = breite(s.m)
  if (b0 === null || b0 >= grenze) return null
  let l = 0
  for (const sgn of [1, -1]) {
    let d = 0
    while (d < 30) { const b = breite(add(s.m, t, sgn * (d + 0.5))); if (b === null || b >= grenze) break; d += 0.5 }
    l += d
  }
  return r1(l)
}

const r2s = (x: number) => Math.round(x * 100) / 100

/** Elemente «Vorgezogener Seitenraum» an den Parkierungsenden der Zufahrten mit Parkierung rechts (Streifenende rechts der
 * Fahrtrichtung, Ring höchstens 1 m von der Bordkante der Rechnung); null, wenn keine solche Zufahrt bzw. eine ohne gültiges Element */
function seitenraumVorbelegung(fall: Fall, st: StreifenErgebnis[], mitPark: ZufahrtErgebnis[]): { id: string; st: PlanSeitenraum }[] | null {
  const el = (fall.flaechenPlan ?? []).map(fp => ({ fp, st: seitenraumGemessen(fp) })).filter(x => x.st)
  if (!el.length || !mitPark.length) return null
  const aus: { id: string; st: PlanSeitenraum }[] = []
  for (const z of mitPark) {
    const s = st.find(x => x.zufahrten.includes(z)) ?? st[0]
    const sp = z.spur, p5 = sp && sp.length >= 2 ? punktEntlang(sp, 5) : null
    if (!p5) return null
    const r = rechts(einheit(sub(sp[0], p5)))
    const rand = s.rand.reduce((a, b) => (dot(sub(b, sp[0]), r) > dot(sub(a, sp[0]), r) ? b : a))
    const e = el.find(x => abstandPunkt([[x.fp.ring]], rand) <= 1.0)
    if (!e) return null
    aus.push({ id: e.fp.id, st: e.st! })
  }
  return aus
}

/** Bordversatz am Streifen gegen die Zufahrt minus Parkstreifen (+ Trottoir vorgezogen, − dahinter); null ohne Messung */
function seitenraum(av: AvIndex, s: StreifenErgebnis, z: ZufahrtErgebnis): number | null {
  const sp = z.spur
  if (!sp || sp.length < 2) return null
  const p0 = sp[0], p5 = punktEntlang(sp, 5)
  if (!p5) return null
  const t = einheit(sub(p0, p5))                      // Fahrtrichtung zum Streifen
  const r = rechts(t)
  const a0 = Math.max(...s.rand.map(q => dot(sub(q, p0), r)))
  const a1 = [15, 20, 25].map(d => { const q = punktEntlang(sp, d); return q ? av.sehne(q, r, FAHRBAHN, 20) : null }).filter((v): v is number => v !== null)
  if (a1.length < 2) return null
  const park = z.abzugRechtsM ?? 0
  return median(a1) - a0 - park
}

/** Kopfüberstand einer AV-Verkehrsinsel über die Streifenränder je Seite (entlang der Fahrbahn); null ohne Insel der AV am Punkt */
export function kopfUeberstandAv(av: AvFlaeche[], p: P, st: StreifenErgebnis[]): [number, number] | null {
  const insel = av.find(f => f.art === 'Verkehrsinsel' && imPolygon(p, f.ringe))
  if (!insel) return null
  const t = einheit(rechts(einheit(sub(st[0].p1, st[0].p0))))
  const pi = insel.ringe[0].map(q => dot(sub(q, p), t)), ps = st.flatMap(eckenVon).map(q => dot(sub(q, p), t))
  const k = (x: number) => r1(Math.min(20, Math.max(0, x)))
  return [k(Math.max(...pi) - Math.max(...ps)), k(Math.min(...ps) - Math.min(...pi))]
}

/** AV-Verkehrsinsel am Punkt (Lücke zwischen den Teilstreifen) */
export const avInselBei = (av: AvFlaeche[] | null | undefined, p: P): boolean => !!av?.some(f => f.art === 'Verkehrsinsel' && imPolygon(p, f.ringe))
