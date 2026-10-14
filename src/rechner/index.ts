// ── Einstieg der Rechnung: Daten aufbereiten, Streifen bilden, prüfen ──

import { type OsmDaten, type Markierung, markierung, markierungHinweis, istFgs } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import type { KatasterBaum } from '../daten/baumkataster'
import type { KatasterFeld } from '../daten/parkkataster'
import { type P, lv95, einheit, sub, dot, dist } from '../geo'
import { OsmNetz } from './netz'
import { Fahrbahn, Inseln, Gebaeude, Flaechen } from './flaechen'
import { ANN_RAND_ARTEN, streifenAusUebergang, neuerStreifen, umrissRing, gequerterWeg, luftbildInsel, teilGrundText, inselLuftbildText,
  type Streifen, type InselZusatz } from './streifen'
import { streifenImBild, type Bild, type Erkennung, type TeilErkannt } from './luftbild'
import { pruefen, type Kontext, R2_FLAECHEN } from './pruefen'
import { eckCacheLeeren } from './abbiegen'
import { HindernisDaten, type Hindernis } from './hindernisse'
import { parkVorschlaege, baumVorschlaege, parkKatasterFelder, osmUeberdeckt, doppeltAmtlich, type Vorschlag } from './vorschlaege'
import { abstandPunkt } from './poly'
import type { Rechnung } from './typen'
import { vonHandAusFall, type Fall } from '../fall'

const BRUECKE_UMRISS_M = 0.5
const HAND_SCHRAEG_MAX = 60 * Math.PI / 180
const HAND_MIN_M = 1.0                 // Streifen von Hand: kürzere (z. B. Länge 0) werden nicht gerechnet

export function kontextBauen(osm: OsmDaten | null, av: AvFlaeche[], sosf: AvFlaeche[] = [], hindernisse: Hindernis[] = []): Kontext {
  eckCacheLeeren()
  const bruecken = sosf.filter(f => f.art === 'Bruecke_Passerelle').map(f => f.ringe)
  return {
    netz: osm ? new OsmNetz(osm) : null,
    fahrbahn: new Fahrbahn(av),
    inseln: new Inseln(av),
    gebaeude: new Gebaeude(av),
    flaechenRand: new Flaechen(av, ANN_RAND_ARTEN),
    flaechenR2: new Flaechen(av, [...R2_FLAECHEN, 'Gebaeude']),
    brueckenumriss: bruecken.length ? { enthaelt: (p: P) => bruecken.some(r => abstandPunkt([r], p) <= BRUECKE_UMRISS_M) } : null,
    hindernisse: hindernisse.length ? new HindernisDaten(hindernisse) : null,
  }
}

/** App: Streifen am gewählten OSM-Übergang bilden und prüfen */
export function rechneUebergang(osm: OsmDaten, av: AvFlaeche[], nid: number, kx: Kontext | null = null): Rechnung {
  const t0 = performance.now()
  const k = kx ?? kontextBauen(osm, av)
  const u = osm.uebergaenge.find(x => x.id === nid)
  if (!u) return { streifen: [], meldungen: [`Übergang ${nid} nicht in den OSM-Daten.`], ms: 0 }
  const { streifen, meldungen } = streifenAusUebergang({ nid, p: lv95(u.lat, u.lon), tags: u.tags }, k.netz!, k.fahrbahn, k.inseln,
    osm.querungen ?? [])
  if (!streifen.length) return { streifen: [], meldungen, ms: performance.now() - t0 }
  const erg = pruefen(streifen, k)
  return { streifen: erg, meldungen, ms: performance.now() - t0 }
}

/** Vorgegebene Streifen prüfen (Kataster-Achse im Referenzvergleich, Streifen von Hand) */
export function rechneStreifen(osm: OsmDaten | null, av: AvFlaeche[], S: Streifen[], kx: Kontext | null = null): Rechnung {
  const t0 = performance.now()
  const k = kx ?? kontextBauen(osm, av)
  const erg = pruefen(S, k)
  return { streifen: erg, meldungen: [], ms: performance.now() - t0 }
}

export interface LuftbildStreifen {
  erkennung: Erkennung
  teile: TeilErkannt[]             // Teile nach der Insel (Insel nach OSM bzw. von Hand), sonst die der Erkennung
  streifen: Streifen[]             // aus den Teilen («erkannt» bzw. «unsicher»)
  insel: InselZusatz | null        // Insel nach OSM und Luftbild (für «unsicher»: teilt den Streifen aus OSM + AV)
}

/**
 * Streifen am OSM-Übergang aus dem Luftbild (E3): Suche entlang des gequerten Wegs auf der AV-Fahrbahn. -> Erkennung und,
 * wenn «erkannt» oder «unsicher», die Teilstreifen (Quelle «luftbild»). Inseln (INSEL_AUS_OSM): eine Insel von Hand teilt die
 * Teile; sonst bei crossing:island=yes die Insel aus der Lücke zwischen zwei Balkengruppen (streifen.luftbildInsel; ohne Lücke
 * Hinweis, kein Teilen). erkennung: schon gerechnete Erkennung (Cache in rechneFall), sonst wird gesucht.
 */
export function luftbildStreifen(osm: OsmDaten, kx: Kontext, nid: number, bild: Bild,
  opt: { handInseln?: InselZusatz[]; erkennung?: Erkennung; avInsel?: boolean } = {}): LuftbildStreifen {
  const u = osm.uebergaenge.find(x => x.id === nid)
  const leer = (g: string): LuftbildStreifen => ({ streifen: [], teile: [], insel: null, erkennung: { befund: 'nicht_gefunden',
    gruende: [g], ncc: 0, kontrast: 0, periode: 0, schraegGrad: 0, drehungGrad: 0, abstandM: 0, teile: [], balken: [], ms: 0 } })
  if (!u || !kx.netz) return leer('Übergang nicht in den OSM-Daten')
  const c = lv95(u.lat, u.lon)
  const gw = gequerterWeg({ nid, p: c, tags: u.tags }, kx.netz)
  if (!gw) return leer('kein befahrbarer OSM-Weg am Übergang')
  // Fahrbahn: AV Strasse_Weg, dazu Brücken (AV-Einzelobjekte) und übrige befestigte Flächen (Platz, Mischfläche)
  const auf = (p: P) => kx.fahrbahn.enthaelt(p) || !!kx.brueckenumriss?.enthaelt(p) ||
    R2_FLAECHEN.includes(kx.flaechenR2?.art(p) ?? '')
  // Plausibilität der Teilstreifen: AV-Inseln und die OSM-Querung(en) am Knoten
  const querungen = (osm.querungen ?? []).filter(w => w.knoten.includes(nid)).map(w => w.geom.map(([la, lo]) => lv95(la, lo)))
  const andereKnoten = osm.uebergaenge.filter(x => x.id !== nid).map(x => lv95(x.lat, x.lon)).filter(p => dist(p, c) <= 60)
  const erkennung = opt.erkennung ?? streifenImBild(bild, c, gw.dWeg, auf, { insel: p => kx.inseln.enthaelt(p), querungen, andereKnoten })
  if (erkennung.befund === 'nicht_gefunden') return { erkennung, teile: [], streifen: [], insel: null }
  const hand = opt.handInseln ?? []
  // avInsel: auf der Achse des Streifens aus OSM + AV liegt eine AV-Verkehrsinsel (dann keine Insel nach OSM aus dem Luftbild)
  const li = luftbildInsel(erkennung.teile, opt.avInsel ? {} : u.tags, c, kx.inseln, hand)
  const n = li.teile.length, befund = erkennung.befund === 'erkannt' ? 'erkannt' : 'unsicher'
  const streifen = li.teile.map((t, i) => {
    const s = neuerStreifen(n > 1 ? `${nid}-${i + 1}` : `${nid}`, `${nid}`, t.p0, t.p1, t.bw, 'luftbild', t.umriss,
      -erkennung.schraegGrad, nid)
    s.annahmen.push(`Streifen aus dem Luftbild (${befund}, ${t.nBalken} Balken, Balkenlänge ${t.bw.toFixed(1).replace('.', ',')} m, ` +
      `NCC ${erkennung.ncc.toFixed(2).replace('.', ',')}) – prüfen`)
    if (n > 1) s.annahmen.push(`Teilstreifen ${i + 1} von ${n} (${teilGrundText(li.grund)})`)
    if (li.insel) s.annahmen.push(inselLuftbildText(li.insel.breite))
    if (li.hinweis) s.annahmen.push(li.hinweis)
    s.inseln = li.insel ? [li.insel, ...hand] : hand
    return s
  })
  return { erkennung, teile: li.teile, streifen, insel: li.insel }
}

/** fgs_extrahieren.hand_umriss: Parallelogramm mit Enden parallel zur Fahrbahn r, sonst Rechteck */
export function handUmriss(q0: P, q1: P, breite: number, r: P | null): P[] {
  const n = einheit(sub(q1, q0)), u: P = [-n[1], n[0]]
  let rr = r
  if (rr === null || Math.abs(dot(rr, u)) < Math.cos(HAND_SCHRAEG_MAX)) rr = u
  else if (dot(rr, u) < 0) rr = [-rr[0], -rr[1]]
  const h = breite / 2
  return [[q0[0] + rr[0] * h, q0[1] + rr[1] * h], [q1[0] + rr[0] * h, q1[1] + rr[1] * h],
    [q1[0] - rr[0] * h, q1[1] - rr[1] * h], [q0[0] - rr[0] * h, q0[1] - rr[1] * h]]
}

/** Richtung der Fahrbahn bei p: nächster befahrbarer OSM-Weg (bis 15 m) */
export function fahrbahnRichtung(netz: OsmNetz | null, p: P): P | null {
  if (!netz) return null
  let best: [number, P] | null = null
  for (const w of netz.W.values()) {
    if (!w.mfz) continue
    for (let k = 0; k < w.nds.length - 1; k++) {
      const a = netz.p(w.nds[k]), b = netz.p(w.nds[k + 1]), v = sub(b, a), l2 = dot(v, v)
      if (l2 === 0) continue
      const t = Math.max(0, Math.min(1, dot(sub(p, a), v) / l2))
      const d = dist(p, [a[0] + v[0] * t, a[1] + v[1] * t])
      if (d <= 15 && (best === null || d < best[0])) best = [d, einheit(v)]
    }
  }
  return best ? best[1] : null
}

/** Ergebnis der Luftbild-Erkennung für Anzeige und Übernahme */
export interface LuftbildErgebnis {
  befund: Erkennung['befund']; gruende: string[]; ncc: number; kontrast: number; abstandM: number; ms: number
  balken: P[][]
  teile: { fgsId: string; p0: P; p1: P; q0: P; q1: P; richtung: P; bw: number; umriss: P[]; nBalken: number }[]
  insel: InselZusatz | null        // Insel nach OSM und Luftbild, an der die Teile geteilt sind (für «Luftbild-Streifen übernehmen»)
}
// letzte Erkennung je Übergang und Bild (der Worker behält das dekodierte Bild, solange der Ausschnitt gleich bleibt); die Inseln
// rechnet rechneFall jedes Mal neu
let luftbildCache: { bild: Bild; nid: number; erkennung: Erkennung } | null = null

export interface FallRechnung extends Rechnung {
  vorschlaege: Vorschlag[]; streifenQuelle: 'osm' | 'hand' | 'luftbild'
  parkVerworfen: Vorschlag[]         // verworfene amtliche Parkfelder in Reichweite (Karte: gedimmt, einzeln zurückholbar)
  doppelt: string[]                  // Ids von Parkierung im Fall, die sich mit amtlichen Feldern deckt (doppeltAmtlich)
  luftbild: LuftbildErgebnis | null
  markierung: Markierung | null      // Einordnung des gewählten OSM-Übergangs (null: Ort ohne Übergang)
  hinweis: string                    // «Kein Fussgängerstreifen: …» bzw. «vermutlich Fussgängerstreifen, bitte prüfen», sonst leer
  inseln: InselZusatz[]              // angenommene Inseln (nach OSM und Luftbild) der gerechneten Streifen, für die Karte
  inselTeilt: boolean                // Luftbild «unsicher»: der Streifen aus OSM + AV ist an der Insel aus dem Luftbild geteilt
}

/**
 * App (E2): Rechnung mit allen Eingaben des Falls. Streifen von Hand ersetzen die aus OSM + AV gebildeten. Hindernisse: von
 * Hand gezeichnete, bestätigte Vorschläge, (eingeschaltet) der Baumkataster ohne verworfene Bäume und die amtlichen
 * Parkfelder (park, geladen und nicht abgeschaltet) ohne verworfene, in Reichweite der Rechnung (KATASTER_PARK_M). Parkierung
 * aus OSM kommt als Vorschlag zurück und zählt erst bestätigt; Vorschläge, die amtliche Felder schon abdecken, entfallen.
 * Parkierung im Fall, die sich mit amtlichen Feldern deckt, zählt weiter und kommt in doppelt zurück (Meldung im Panel).
 */
export function rechneFall(osm: OsmDaten, av: AvFlaeche[], sosf: AvFlaeche[], nid: number | null, fall: Fall,
  kataster: { baeume: KatasterBaum[]; quellenangabe: string } | null, bild: Bild | null = null,
  park: { felder: KatasterFeld[]; quellenangabe: string } | null = null): FallRechnung {
  const t0 = performance.now()
  const kxOhne = kontextBauen(osm, av, sosf)
  let streifen: Streifen[] = [], meldungen: string[] = []
  // Inseln von Hand (Werkzeug «Insel»): teilen den Streifen wie AV-Verkehrsinseln und ersetzen die Insel nach OSM und Luftbild
  const handInseln: InselZusatz[] = fall.hindernisse.flatMap(h => (h.art === 'insel' ? [{ ring: h.ring, herkunft: 'hand' as const, breite: 0 }] : []))
  let quelle: FallRechnung['streifenQuelle'] = 'osm'
  let luftbild: LuftbildErgebnis | null = null
  let inselTeilt = false
  if (fall.streifenHand.length) {
    quelle = 'hand'
    const kurz = fall.streifenHand.filter(h => dist(h.p0, h.p1) < HAND_MIN_M)
    if (kurz.length) meldungen.push(`Streifen von Hand kürzer als ${HAND_MIN_M} m übergangen: ${kurz.map(h => h.id).join(', ')}`)
    streifen = fall.streifenHand.filter(h => dist(h.p0, h.p1) >= HAND_MIN_M).map(h => {
      const m: P = [(h.p0[0] + h.p1[0]) / 2, (h.p0[1] + h.p1[1]) / 2]
      const s = neuerStreifen(h.id, 'hand', h.p0, h.p1, h.breite, 'hand', handUmriss(h.p0, h.p1, h.breite, h.richtung ?? fahrbahnRichtung(kxOhne.netz, m)))
      s.annahmen.push('Streifen von Hand (Wartebereiche und Breite gezeichnet)')
      s.inseln = handInseln
      return s
    })
  } else if (nid !== null) {
    const u = osm.uebergaenge.find(x => x.id === nid)
    if (!u) return { streifen: [], meldungen: [`Übergang ${nid} nicht in den OSM-Daten.`], ms: 0, vorschlaege: [], streifenQuelle: quelle,
      markierung: null, hinweis: '', luftbild: null, parkVerworfen: [], doppelt: [], inseln: [], inselTeilt: false }
    const uw = { nid, p: lv95(u.lat, u.lon), tags: u.tags }
    const r = streifenAusUebergang(uw, kxOhne.netz!, kxOhne.fahrbahn, kxOhne.inseln, osm.querungen ?? [], { inseln: handInseln })
    streifen = r.streifen; meldungen = r.meldungen
    // Luftbild (E3): «erkannt» ersetzt die Streifen aus OSM + AV, «unsicher» bleibt Vorschlag
    if (bild && fall.luftbild !== false) {
      const erk = luftbildCache && luftbildCache.bild === bild && luftbildCache.nid === nid ? luftbildCache.erkennung : undefined
      const lb = luftbildStreifen(osm, kxOhne, nid, bild, { handInseln, erkennung: erk, avInsel: r.avInsel })
      if (!erk) luftbildCache = { bild, nid, erkennung: lb.erkennung }
      const e = lb.erkennung
      luftbild = { befund: e.befund, gruende: e.gruende, ncc: e.ncc, kontrast: e.kontrast, abstandM: e.abstandM, ms: e.ms,
        balken: e.balken, teile: lb.teile.map((t, i) => ({ fgsId: lb.teile.length > 1 ? `${nid}-${i + 1}` : `${nid}`, p0: t.p0, p1: t.p1,
          q0: t.q0, q1: t.q1, richtung: t.richtung, bw: t.bw, umriss: t.umriss, nBalken: t.nBalken })), insel: lb.insel }
      if (e.befund === 'erkannt' && lb.streifen.length) {
        streifen = lb.streifen
        quelle = 'luftbild'
      } else if (lb.insel) {
        // «unsicher» mit Insel aus den Balken (INSEL_AUS_OSM): sie teilt den Streifen aus OSM + AV, wenn sie dessen Achse kreuzt
        // (sonst bleibt er durchgehend, mit Hinweis)
        const insel = lb.insel
        const r2 = streifenAusUebergang(uw, kxOhne.netz!, kxOhne.fahrbahn, kxOhne.inseln, osm.querungen ?? [], { inseln: [insel] })
        if (r2.streifen.some(s => s.inseln.includes(insel))) {
          streifen = r2.streifen; meldungen = r2.meldungen
          inselTeilt = r2.streifen.length > 1
        }
      }
    }
  }
  const umrisse = streifen.map(umrissRing)
  const mitte: P = streifen.length ? [(streifen[0].p0[0] + streifen[0].p1[0]) / 2, (streifen[0].p0[1] + streifen[0].p1[1]) / 2] :
    lv95(fall.ort.lat, fall.ort.lon)
  const vorhanden = new Set(fall.hindernisse.map(h => h.id))
  const parkAlle = park && fall.parkkataster !== false ? parkKatasterFelder(park.felder, umrisse, mitte, park.quellenangabe) : []
  const osmPark = kxOhne.netz ? parkVorschlaege(kxOhne.netz, kxOhne.fahrbahn, umrisse, mitte) : []
  const ueberdeckt = osmUeberdeckt(osmPark, parkAlle.map(v => (v.hindernis.art === 'parkfeld' ? v.hindernis.ring : [])))
  const offen = osmPark.filter(v => !vorhanden.has(v.id) && !fall.vorschlaege[v.id] && !ueberdeckt.has(v.id))
  const kat = kataster ? baumVorschlaege(kataster.baeume, umrisse, mitte, kataster.quellenangabe)
    .filter(v => !fall.vorschlaege[v.id] && !vorhanden.has(v.id)) : []
  const katPark = parkAlle.filter(v => !fall.vorschlaege[v.id] && !vorhanden.has(v.id))
  const parkVerworfen = parkAlle.filter(v => fall.vorschlaege[v.id] && !vorhanden.has(v.id))
  // Doppelzählung: gegen alle geladenen amtlichen Felder (auch verworfene und ausserhalb der Reichweite)
  const doppelt = park && fall.parkkataster !== false ? doppeltAmtlich(fall.hindernisse, park.felder.map(f => f.ring)) : []
  const hindernisse: Hindernis[] = [...fall.hindernisse, ...kat.map(v => v.hindernis), ...katPark.map(v => v.hindernis)]
  const kx = kontextBauen(osm, av, sosf, hindernisse)
  kx.vonHand = vonHandAusFall(fall)
  const erg = streifen.length ? pruefen(streifen, kx) : []
  const u = nid !== null ? osm.uebergaenge.find(x => x.id === nid) : undefined
  const mk = u ? markierung(u.tags) : null
  const hinweis = u && mk ? markierungHinweis(mk, u.tags) : ''
  if (hinweis) for (const s of erg) {
    if (mk && istFgs(mk)) s.markierungHinweis = hinweis; else s.keinFgsHinweis = hinweis
  }
  const inseln = [...new Set(streifen.flatMap(s => s.inseln))].filter(z => z.herkunft !== 'hand')
  return { streifen: erg, meldungen, ms: performance.now() - t0, vorschlaege: [...offen, ...kat, ...katPark], streifenQuelle: quelle,
    markierung: mk, hinweis, luftbild, parkVerworfen, doppelt, inseln, inselTeilt }
}
