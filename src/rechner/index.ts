// ── Einstieg der Rechnung: Daten aufbereiten, Streifen bilden, prüfen ──

import { type OsmDaten, type Markierung, markierung, markierungHinweis, planungHinweis, istFgs } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import type { KatasterBaum } from '../daten/baumkataster'
import type { KatasterFeld } from '../daten/parkkataster'
import { type P, lv95, einheit, sub, dot, dist, imPolygon } from '../geo'
import { OsmNetz } from './netz'
import { Fahrbahn, Inseln, Gebaeude, Flaechen } from './flaechen'
import { ANN_RAND_ARTEN, streifenAusUebergang, neuerStreifen, umrissRing, gequerterWeg, luftbildInsel, teilGrundText, inselLuftbildText,
  sehneStreifen, handGruppen, type Streifen, type InselZusatz } from './streifen'
import { vermassung } from './vermassung'
import { streifenImBild, type Bild, type Erkennung, type TeilErkannt } from './luftbild'
import { pruefen, type Kontext, R2_FLAECHEN } from './pruefen'
import { eckCacheLeeren } from './abbiegen'
import { HindernisDaten, type Hindernis } from './hindernisse'
import { parkVorschlaege, baumVorschlaege, parkKatasterFelder, osmUeberdeckt, doppeltAmtlich, type Vorschlag } from './vorschlaege'
import { abstandPunkt, flaeche } from './poly'
import { avMitPlan, planAmRand, planNahLinie, planKurz, anteilInPlanInsel, PLAN_NAME, planTitel, INSEL_DOPPELT_ANTEIL,
  type PlanTeil } from './planflaechen'
import type { PlanArt } from '../fall'
import { f1 } from '../texte'
import type { Rechnung, StreifenErgebnis } from './typen'
import { vonHandAusFall, streifenHerkunftText, type Fall } from '../fall'
import { streifenTitel } from '../benennung'

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
  nurVorschlag?: boolean           // «erkannt», aber mit Flächen (Plan) nur Vorschlag (die Rechnung nutzt OSM + AV nach Plan)
}
/** Hinweis, wenn der Fall Flächen (Plan) hat und das Luftbild einen Streifen zeigt (erkannt bzw. unsicher) */
export const LUFTBILD_PLAN_TEXT = 'Mit Flächen (Plan): Streifen aus dem Luftbild (Bestand) nur als Vorschlag; gerechnet mit OSM + AV ' +
  'nach Plan bzw. mit den Streifen von Hand.'
// letzte Erkennung je Übergang und Bild (der Worker behält das dekodierte Bild, solange der Ausschnitt gleich bleibt); die Inseln
// rechnet rechneFall jedes Mal neu
let luftbildCache: { bild: Bild; nid: number; erkennung: Erkennung } | null = null

export interface FallRechnung extends Rechnung {
  vorschlaege: Vorschlag[]; streifenQuelle: 'osm' | 'hand' | 'luftbild'
  parkVerworfen: Vorschlag[]         // verworfene amtliche Parkfelder in Reichweite (Karte: gedimmt, einzeln zurückholbar)
  doppelt: string[]                  // Ids von Parkierung im Fall, die sich mit amtlichen Feldern deckt (doppeltAmtlich)
  luftbild: LuftbildErgebnis | null
  markierung: Markierung | null      // Einordnung des gewählten OSM-Übergangs (null: Ort ohne Übergang)
  hinweis: string                    // «Kein Fussgängerstreifen: …» bzw. «vermutlich Fussgängerstreifen, bitte prüfen», mit Streifen
                                     // von Hand an einem Übergang ohne FGS «Heute kein Fussgängerstreifen …», sonst leer
  inseln: InselZusatz[]              // angenommene Inseln (nach OSM und Luftbild) der gerechneten Streifen, für die Karte
  inselTeilt: boolean                // Luftbild «unsicher»: der Streifen aus OSM + AV ist an der Insel aus dem Luftbild geteilt
  planFlaechen?: number              // wirksame Flächen (Plan) von Hand in der Rechnung (fehlt ohne; planflaechen.avMitPlan)
}

/**
 * App (E2): Rechnung mit allen Eingaben des Falls. Streifen von Hand ersetzen die aus OSM + AV gebildeten. Hindernisse: von
 * Hand gezeichnete, bestätigte Vorschläge, (eingeschaltet) der Baumkataster ohne verworfene Bäume und die amtlichen
 * Parkfelder (park, geladen und nicht abgeschaltet) ohne verworfene, in Reichweite der Rechnung (KATASTER_PARK_M). Parkierung
 * aus OSM kommt als Vorschlag zurück und zählt erst bestätigt; Vorschläge, die amtliche Felder schon abdecken, entfallen.
 * Parkierung im Fall, die sich mit amtlichen Feldern deckt, zählt weiter und kommt in doppelt zurück (Meldung im Panel).
 */
export function rechneFall(osm: OsmDaten, av0: AvFlaeche[], sosf: AvFlaeche[], nid: number | null, fall: Fall,
  kataster: { baeume: KatasterBaum[]; quellenangabe: string } | null, bild: Bild | null = null,
  park: { felder: KatasterFeld[]; quellenangabe: string } | null = null): FallRechnung {
  const t0 = performance.now()
  // Flächen (Plan) von Hand (planflaechen.ts): ersetzen die AV-Bodenbedeckung darunter, für die ganze Rechnung (ohne sie: av)
  const plan = avMitPlan(av0, fall.flaechenPlan)
  const av = plan.av, mitPlan = plan.teile.length > 0
  const kxOhne = kontextBauen(osm, av, sosf)
  let streifen: Streifen[] = [], meldungen: string[] = []
  // Inseln von Hand (Werkzeug «Insel»): teilen den Streifen wie AV-Verkehrsinseln und ersetzen die Insel nach OSM und Luftbild.
  // Liegt eine zu mindestens INSEL_DOPPELT_ANTEIL in einer Fläche (Plan) der Art Insel, zählt nur die Plan-Fläche (keine doppelte
  // Wirkung als Insel von Hand und als Verkehrsinsel der Bodenbedeckung)
  const handInseln: InselZusatz[] = [], planMeldungen: string[] = []
  for (const h of fall.hindernisse) {
    if (h.art !== 'insel') continue
    if (plan.teile.length && anteilInPlanInsel(h.ring, plan.teile) >= INSEL_DOPPELT_ANTEIL) {
      planMeldungen.push(`${h.name ?? 'Insel von Hand'} liegt in einer Plan-Fläche (Insel): sie zählt nur einmal, als Plan-Fläche.`)
      continue
    }
    handInseln.push({ ring: h.ring, herkunft: 'hand', breite: 0 })
  }
  let quelle: FallRechnung['streifenQuelle'] = 'osm'
  let luftbild: LuftbildErgebnis | null = null
  let inselTeilt = false
  if (fall.streifenHand.length) {
    quelle = 'hand'
    const kurz = fall.streifenHand.filter(h => dist(h.p0, h.p1) < HAND_MIN_M)
    if (kurz.length) meldungen.push(`Streifen von Hand kürzer als ${HAND_MIN_M} m übergangen: ${kurz.map(h => streifenTitel(h.id, fall.streifenHand)).join(', ')}`)
    const lang = fall.streifenHand.filter(h => dist(h.p0, h.p1) >= HAND_MIN_M)
    // Übergangskennung: gemeinsam nur für Teilstreifen auf einer Achse (streifen.handGruppen; bis 16.10.2026 'hand' für alle)
    const gruppe = handGruppen(lang)
    streifen = lang.map(h => {
      const m: P = [(h.p0[0] + h.p1[0]) / 2, (h.p0[1] + h.p1[1]) / 2]
      const s = neuerStreifen(h.id, gruppe.get(h.id)!, h.p0, h.p1, h.breite, 'hand', handUmriss(h.p0, h.p1, h.breite, h.richtung ?? fahrbahnRichtung(kxOhne.netz, m)))
      // ohne gespeicherte Herkunft (Fall-Dateien vor dem 11.10.2026): neutral, nicht «übernommen»
      s.annahmen.push(h.herkunft === 'gezeichnet' ? 'Lage und Breite des Streifens von Hand gezeichnet (nicht aus OSM bzw. Luftbild).'
        : !h.herkunft ? 'Streifen von Hand (Herkunft nicht gespeichert); Lage und Breite wie in der Fall-Datei (nicht neu aus OSM bzw. Luftbild).'
        : `Streifen von Hand: ${streifenHerkunftText(h)}; Lage und Breite wie übernommen bzw. angepasst (nicht neu aus OSM bzw. Luftbild).`)
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
    // Luftbild (E3): «erkannt» ersetzt die Streifen aus OSM + AV, «unsicher» bleibt Vorschlag. Die Erkennung läuft immer auf dem
    // Bestand (unverschnittene AV; Korrektur 16.10.2026, Prüfbefund M1): sonst hinge das Ergebnis mit Flächen (Plan) davon ab, ob
    // die Erkennung zwischengespeichert war (luftbildCache: Schlüssel nur Bild und Übergang). Mit Flächen (Plan) ist das Luftbild
    // (Bestand) nur Vorschlag, auch «erkannt»: gerechnet wird mit OSM + AV auf der verschnittenen Fahrbahn (Enden an den
    // geplanten Bordkanten), ohne Teilen an einer Insel aus dem Luftbild
    if (bild && fall.luftbild !== false) {
      const kxB = mitPlan ? kontextBauen(osm, av0, sosf) : kxOhne
      const avInselB = mitPlan ? streifenAusUebergang(uw, kxB.netz!, kxB.fahrbahn, kxB.inseln, osm.querungen ?? [], { inseln: handInseln }).avInsel
        : r.avInsel
      const erk = luftbildCache && luftbildCache.bild === bild && luftbildCache.nid === nid ? luftbildCache.erkennung : undefined
      const lb = luftbildStreifen(osm, kxB, nid, bild, { handInseln, erkennung: erk, avInsel: avInselB })
      if (!erk) luftbildCache = { bild, nid, erkennung: lb.erkennung }
      const e = lb.erkennung
      luftbild = { befund: e.befund, gruende: e.gruende, ncc: e.ncc, kontrast: e.kontrast, abstandM: e.abstandM, ms: e.ms,
        balken: e.balken, teile: lb.teile.map((t, i) => ({ fgsId: lb.teile.length > 1 ? `${nid}-${i + 1}` : `${nid}`, p0: t.p0, p1: t.p1,
          q0: t.q0, q1: t.q1, richtung: t.richtung, bw: t.bw, umriss: t.umriss, nBalken: t.nBalken })), insel: lb.insel,
        ...(mitPlan && e.befund === 'erkannt' ? { nurVorschlag: true } : {}) }
      if (mitPlan) {
        if (e.befund !== 'nicht_gefunden') planMeldungen.push(LUFTBILD_PLAN_TEXT)
      } else if (e.befund === 'erkannt' && lb.streifen.length) {
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
  // Streifen von Hand an einem Übergang ohne Fussgängerstreifen (Planung, 16.10.2026): heute kein FGS, der Streifen von Hand
  // wird als Fussgängerstreifen geprüft – nur als Hinweis zum Fall, nicht «kein Fussgängerstreifen» am Streifen
  const planung = quelle === 'hand' && !!u && !!mk && !istFgs(mk)
  const hinweis = u && mk ? (planung ? planungHinweis(mk, u.tags) : markierungHinweis(mk, u.tags)) : ''
  if (hinweis && !planung) for (const s of erg) {
    if (mk && istFgs(mk)) s.markierungHinweis = hinweis; else s.keinFgsHinweis = hinweis
  }
  // Streifen von Hand: Lage und Masse für den Plan (vermassung.ts), mit Umriss und Bordkanten der Rechnung
  if (quelle === 'hand') for (const e of erg) {
    const s = streifen.find(x => x.fgsId === e.fgsId), h = fall.streifenHand.find(x => x.id === e.fgsId)
    if (!s || !h) continue
    const r = fahrbahnRichtung(kxOhne.netz, e.m)
    const sh = e.randQuelle === 'AV' ? null : sehneStreifen(s, kx.fahrbahn, s.m, s.n)
    e.vermassung = vermassung({ p0: e.p0, p1: e.p1, breite: e.bw, umriss: e.umriss, rand: e.rand, randQuelle: e.randQuelle,
      sehne: sh ? [[s.m[0] - s.n[0] * sh[1], s.m[1] - s.n[1] * sh[1]], [s.m[0] + s.n[0] * sh[0], s.m[1] + s.n[1] * sh[0]]] : null,
      fahrbahn: r ? { r, quelle: 'nächster befahrbarer OSM-Weg' } : h.richtung ? { r: h.richtung, quelle: 'Balkenrichtung des Streifens' } : null,
      zufahrten: e.zufahrten })
  }
  if (plan.teile.length || plan.meldungen.length) planAnnahmen(erg, plan, meldungen, planMeldungen, kx.fahrbahn)
  const inseln = [...new Set(streifen.flatMap(s => s.inseln))].filter(z => z.herkunft !== 'hand')
  return { streifen: erg, meldungen, ms: performance.now() - t0, vorschlaege: [...offen, ...kat, ...katPark], streifenQuelle: quelle,
    markierung: mk, hinweis, luftbild, parkVerworfen, doppelt, inseln, inselTeilt,
    ...(fall.flaechenPlan?.length ? { planFlaechen: new Set(plan.teile.map(t => t.id)).size } : {}) }
}

/**
 * Flächen (Plan) in den Annahmen sichtbar machen (Quellen einheitlich «nach AV» bzw. «nach Plan-Fläche n (Art) von Hand»):
 * - Meldung zur Rechnung: welche Plan-Flächen wirken;
 * - je Streifen die Bordkanten an den Enden (Annahme und Vermassung); ein Streifen von Hand, der eine Plan-Fläche der Art Insel
 *   quert, wird nicht automatisch geteilt (Streifen von Hand teilt die App nie selbst; man zeichnet die Teile, wie bei der Insel
 *   aus dem Luftbild): Hinweis «als zwei Teilstreifen zeichnen» und kein Randmass (die Sehne endet an der Insel, ein Mass bis
 *   dorthin wäre falsch);
 * - Teilstreifen über einer Plan-Insel: «Verkehrsinsel auf der Achse nach Plan-Fläche n» statt «AV-Verkehrsinsel»;
 * - je Zufahrt «Fahrbahnrand nach Plan-Fläche n», wenn die Fahrbahn quer zur Fahrlinie (Sehne alle FAHRLINIE_SCHRITT_M bis zum
 *   letzten Sichtpunkt) an einer Plan-Fläche endet – dort richtet die Rechnung die Fahrlinie aus; nicht bei einer Fahrlinie von Hand.
 */
const FAHRLINIE_SCHRITT_M = 2
function planAnnahmen(erg: StreifenErgebnis[], plan: ReturnType<typeof avMitPlan>, meldungen: string[], weitere: string[],
  fahrbahn: Fahrbahn): void {
  const ids = [...new Set(plan.teile.map(t => t.id))]
  if (ids.length) {
    const liste = ids.map(id => {
      const ts = plan.teile.filter(t => t.id === id)
      return `${planTitel(id)}: ${PLAN_NAME[ts[0].art]} ${f1(flaeche(ts.map(t => t.poly)))} m²`
    })
    meldungen.push(`Rechnung mit geplanter Bodenbedeckung (von Hand): ${liste.join('; ')}. Die Plan-Flächen ersetzen die AV-Flächen ` +
      'darunter (Gebäude bleiben); Bordkanten, Wartebereiche, Inseln und Fahrlinien richten sich danach.')
  }
  meldungen.push(...plan.meldungen, ...weitere)
  if (!plan.teile.length) return
  const nach = (t: { id: string; art: PlanArt } | null) => (t ? `nach ${planKurz(t)} von Hand` : 'nach AV')
  const inselPlan = plan.teile.filter(t => t.art === 'insel')
  for (const e of erg) {
    const v = e.vermassung
    // Streifen von Hand über eine Plan-Insel
    const quert = v ? inselPlan.find(t => [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].some(f =>
      imPolygon([e.p0[0] + (e.p1[0] - e.p0[0]) * f, e.p0[1] + (e.p1[1] - e.p0[1]) * f], t.poly))) : undefined
    if (v && quert) {
      e.annahmen.push(`Streifen quert ${planKurz(quert)} von Hand: als zwei Teilstreifen zeichnen (je Fahrbahnteil ein Streifen von ` +
        'Hand, Lücke an der Insel); Bordkanten und Randmasse sonst nicht verlässlich')
      v.randAbstandM = null; v.fahrbahnM = null
      v.randQuelle = `Streifen quert ${planKurz(quert)} von Hand: Rand nicht vermasst – als zwei Teilstreifen zeichnen`
    } else if (e.randQuelle === 'AV') {
      const an = e.rand.map(p => planAmRand(plan.teile, p))
      if (an[0] || an[1]) {
        e.annahmen.push(`Bordkanten: Ende A ${nach(an[0])}, Ende B ${nach(an[1])}`)
        if (v) v.randQuelle = `Bordkanten wie in der Rechnung (Sehne der Fahrbahn entlang der Achse): Ende A ${nach(an[0])}, Ende B ${nach(an[1])}`
      }
    } else if (v?.randAbstandM && v.fahrbahnM !== null) {
      // Rand angenommen, Vermassung aus der Sehne: Enden der Sehne an einer Plan-Fläche?
      const n = einheit(sub(e.p1, e.p0))
      const an = [planAmRand(plan.teile, [e.p0[0] - n[0] * v.randAbstandM[0], e.p0[1] - n[1] * v.randAbstandM[0]]),
        planAmRand(plan.teile, [e.p1[0] + n[0] * v.randAbstandM[1], e.p1[1] + n[1] * v.randAbstandM[1]])]
      if (an[0] || an[1]) v.randQuelle = `Sehne der Fahrbahn entlang der Achse (Ende A ${nach(an[0])}, Ende B ${nach(an[1])}); die ` +
        'Rechnung nimmt den Rand 0,3 m vor den Enden an (Sehne weicht mehr als 2,5 m ab)'
    }
    // Teilstreifen: die Insel auf der Achse ist eine Plan-Fläche (Art Insel), nicht die AV
    const ip = planNahLinie(inselPlan, [e.p0, e.p1], 1.2)
    if (ip.length) e.annahmen = e.annahmen.map(a => a.replace('(AV-Verkehrsinsel auf der Achse)',
      `(Verkehrsinsel auf der Achse ${nach(ip[0])})`))
    for (const z of e.zufahrten) {
      if (z.lageQuelle === 'Hand' || z.spur.length < 2) continue
      const treffer = new Map<string, PlanTeil>()
      const ende = z.sichtpunkte.length ? z.sichtpunkte[z.sichtpunkte.length - 1] : z.spur[z.spur.length - 1]
      let weiter = true
      for (let k = 0; k < z.spur.length - 1 && weiter; k++) {
        const a = z.spur[k], b = z.spur[k + 1], l = dist(a, b)
        if (!(l > 0)) continue
        const d = einheit(sub(b, a)), r: P = [d[1], -d[0]]
        for (let t = 0; t < l; t += FAHRLINIE_SCHRITT_M) {
          const p: P = [a[0] + d[0] * t, a[1] + d[1] * t]
          const sh = fahrbahn.sehne(p, r)
          if (sh) for (const q of [[p[0] + r[0] * sh[0], p[1] + r[1] * sh[0]], [p[0] - r[0] * sh[1], p[1] - r[1] * sh[1]]] as P[]) {
            const pt = planAmRand(plan.teile, q)
            if (pt) treffer.set(pt.id, pt)
          }
          if (dist(p, ende) < FAHRLINIE_SCHRITT_M) { weiter = false; break }
        }
      }
      if (treffer.size) z.annahmen.push(`Fahrbahnrand ${[...treffer.values()].map(t => nach(t).replace(/ von Hand$/, '')).join(', ')} ` +
        'von Hand: Fahrlinie und Sichtpunkte daran ausgerichtet')
    }
  }
}

