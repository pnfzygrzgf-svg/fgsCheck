// ── Vorgezogener Seitenraum: Standardelement der Flächen (Plan) (Nutzerentscheid 23.10.2026) ──
//
// Grundlage: VSS 40 240 Z. 13.4 (und Masterplan Fussverkehr Stadt Bern): an einer Querung zwischen Längsparkierung ist ein
// vorgezogener Seitenraum nötig, mindestens 0,20 m über die Parkstreifenlinie in die Fahrbahn (Regeln E2b/E2c des Bedarfsmoduls,
// Feld seitenraumVorParklinieM).
//
// Element: eine Fläche (Plan) der Art Trottoir an einem Streifenende (Kennzeichnung fall.PlanSeitenraum im Feld standard).
// - Lage: k = heutige Bordkante auf der Streifenachse (Sehne der Fahrbahn entlang der Achse, AV mit den übrigen Flächen (Plan)),
//   balken = Balkenrichtung des Streifens (entlang der Bordkante), tief = senkrecht dazu in die Fahrbahn. Lokale Koordinaten
//   P(s, t) = k + s · balken + t · tief.
// - Bordkante quer: c(s) = kante[0] + kante[1] · s, ausgeglichen aus der Sehne der Fahrbahn bei s = sA, 0, sB (die Fläche folgt
//   einer schief zum Balken laufenden Bordkante: Trapez statt Rechteck); ohne Messung c = 0.
// - Masse: Tiefe T = tiefePark + ueberstand ab der Bordkante; entlang der Bordkante von sA = −(breite/2 + randA) bis
//   sB = breite/2 + randB. Ring: P(sA, c(sA) − SR_HINTEN_M), P(sB, c(sB) − SR_HINTEN_M), P(sB, c(sB) + T), P(sA, c(sA) + T).
// - tiefePark: Aussenkante der Längsparkierung an dieser Bordkante (amtliche Parkfelder, Parkfelder von Hand, OSM-Vorschläge),
//   gemessen ab c(s), bis SR_SUCHE_M beidseits entlang der Bordkante; ohne Parkierung SR_PARK_TIEFE_M (Hinweis).
// Wirkung in der Rechnung (index.rechneFall): die Fläche ersetzt die AV darunter wie jede Fläche (Plan); Parkierung, die sie
// überdeckt, entfällt für die Sichtprüfung (parkOhneSeitenraum). Einträge im Fall bleiben (nur in der Rechnung ausgeblendet).

import { type P, add, dot, sub, einheit, dist, links, kreuz } from '../geo'
import type { FlaechePlan, PlanSeitenraum, StreifenHand } from '../fall'
import { seitenraumStandard } from '../fall'
import { type Hindernis, laengsPolygon } from './hindernisse'
import { type Multi, flaeche, schnitt, differenz, vereinigung, abstandLinieMulti } from './poly'
import { balkenNormiert, standardTeilText, standardAngepasst } from './standardinsel'

export const SR_UEBERSTAND_M = 0.20     // über die Parkstreifenlinie hinaus (VSS 40 240 Z. 13.4: mindestens)
export const SR_PARK_TIEFE_M = 2.00     // Parkstreifen, wenn im Fall keine Parkierung liegt (Annahme, anpassbar)
export const SR_RAND_M = 1.00           // Rand je Seite über die Streifenbreite hinaus (Annahme, anpassbar)
export const SR_HINTEN_M = 0.50         // Fläche reicht so weit hinter die heutige Bordkante (Annahme: deckt eine unruhige AV-Kante)
export const SR_SUCHE_M = 15            // Parkierung entlang der Bordkante so weit beidseits suchen (Annahme)
export const SR_PARK_INNEN_M = 0.8      // Parkierung gehört zu dieser Bordkante: Innenkante höchstens so weit davor (Annahme)
export const SR_PARK_TIEFE_BEREICH: [number, number] = [1.0, 6.0]   // plausible Tiefe einer Parkierung ab der Bordkante
export const SR_PARK_ANTEIL = 0.5       // Parkfeld entfällt ganz ab diesem überdeckten Anteil, sonst nur der überdeckte Teil (Annahme)
export const SR_REST_M2 = 0.5           // kleinere Reste eines Parkfelds entfallen
export const SR_KANTE_MAX_M = 1.5       // Bordkante quer weiter weg: Messung verworfen (c = 0)
export const SR_ENDE_TOL_M = 0.05       // Streifenende «an der Kante» (Nachführen)
export const SR_RAND_ZUSCHLAG = 0.30    // Streifenende vor der Bordkante (wie streifen.RAND_ZUSCHLAG)
export const SR_BEREICH = { ueberstand: [0, 2] as [number, number], breite: [1, 15] as [number, number], rand: [0, 10] as [number, number],
  tiefePark: [0.5, 6] as [number, number] }
export const SR_NAME = 'Vorgezogener Seitenraum'
export const SR_KURZ = 'vorgezogener Seitenraum'
export const SR_ERSETZT = 'durch vorgezogenen Seitenraum ersetzt'

const f2 = (x: number) => x.toFixed(2).replace('.', ',')

export interface SrLage { k: P; balken: P; tief: P; kante: [number, number] }
export interface SrMasse { tiefePark: number; ueberstand: number; breite: number; randA: number; randB: number }

export const srTiefe = (x: { tiefePark: number; ueberstand: number }) => x.tiefePark + x.ueberstand
export const srSeiten = (x: { breite: number; randA: number; randB: number }): [number, number] => [-(x.breite / 2 + x.randA), x.breite / 2 + x.randB]
const pt = (l: { k: P; balken: P; tief: P }, s: number, t: number): P => add(add(l.k, l.balken, s), l.tief, t)
export const kanteBei = (l: SrLage, s: number) => l.kante[0] + l.kante[1] * s

/** Lage an einem Streifenende: Achse p0 -> p1, Ende 0 (p0) bzw. 1 (p1), Balkenrichtung (null: senkrecht zur Achse), Bordkante k auf
 * der Achse; tief zeigt in die Fahrbahn (zum anderen Ende) */
export function seitenraumLage(p0: P, p1: P, ende: 0 | 1, balkenRoh: P | null, k: P): Omit<SrLage, 'kante'> {
  const a = einheit(sub(p1, p0)), innen: P = ende === 0 ? a : [-a[0], -a[1]]
  const balken = balkenNormiert(a, balkenRoh)
  let tief = links(balken)
  if (dot(tief, innen) < 0) tief = [-tief[0], -tief[1]]
  return { k: [k[0], k[1]], balken, tief: [tief[0] + 0, tief[1] + 0] }
}

/** Bordkante quer (c0, Neigung) aus der Sehne der Fahrbahn bei s = sA, 0, sB: 1 m vor der Kante in die Fahrbahn, Sehne gegen tief.
 * Ausgleichsgerade; weniger als zwei Messungen (Messungen weiter als SR_KANTE_MAX_M verworfen): null */
export function kanteMessen(l: Omit<SrLage, 'kante'>, x: SrMasse, sehne: (p: P, r: P) => [number, number] | null): [number, number] | null {
  const [sA, sB] = srSeiten(x)
  const m: [number, number][] = []
  for (const s of [sA, 0, sB]) {
    const sh = sehne(pt(l, s, 1), l.tief)
    if (!sh) continue
    const c = 1 - sh[1]
    if (Math.abs(c) <= SR_KANTE_MAX_M) m.push([s, c])
  }
  if (m.length < 2) return null
  const ms = m.reduce((a, q) => a + q[0], 0) / m.length, mc = m.reduce((a, q) => a + q[1], 0) / m.length
  const sxx = m.reduce((a, q) => a + (q[0] - ms) ** 2, 0)
  const g = sxx > 1e-9 ? m.reduce((a, q) => a + (q[0] - ms) * (q[1] - mc), 0) / sxx : 0
  const r = (v: number) => Math.round(v * 1000) / 1000
  return [r(mc - g * ms) + 0, r(g) + 0]
}

/** Ring des Elements (Regeln oben) */
export function seitenraumRing(l: SrLage, x: SrMasse): P[] {
  const [sA, sB] = srSeiten(x), T = srTiefe(x)
  const cA = kanteBei(l, sA), cB = kanteBei(l, sB)
  return [pt(l, sA, cA - SR_HINTEN_M), pt(l, sB, cB - SR_HINTEN_M), pt(l, sB, cB + T), pt(l, sA, cA + T)]
}
/** Bordkante heute (Linie über die Länge des Elements) bzw. neue Bordkante (Vorderkante) */
export function kanteLinie(l: SrLage, x: SrMasse, vorne: boolean): [P, P] {
  const [sA, sB] = srSeiten(x), T = vorne ? srTiefe(x) : 0
  return [pt(l, sA, kanteBei(l, sA) + T), pt(l, sB, kanteBei(l, sB) + T)]
}
/** Mitte des Elements (Griff) */
export function seitenraumMitte(st: PlanSeitenraum): P {
  const [sA, sB] = srSeiten(st), s = (sA + sB) / 2
  return pt(st, s, kanteBei(st, s) + (srTiefe(st) - SR_HINTEN_M) / 2)
}

/** Parkierung im Fall (Ring; Parkfelder, Längsparkierung, Vorschläge) */
export interface ParkRing { id: string; ring: P[] }
/** Parkierung als Ringe (nur Auto-Parkfelder und Längsparkierung) */
export function parkRinge(h: Hindernis[]): ParkRing[] {
  const aus: ParkRing[] = []
  for (const x of h) {
    if (x.art === 'parkfeld' && x.klasse === 'auto' && x.ring.length >= 3) aus.push({ id: x.id, ring: x.ring })
    else if (x.art === 'laengsparkierung') { const r = laengsPolygon(x.linie, x.breite); if (r.length >= 3) aus.push({ id: x.id, ring: r }) }
  }
  return aus
}

/** Tiefe der Längsparkierung an dieser Bordkante (Aussenkante ab c(s), grösste) -> Tiefe und beteiligte Ids, sonst null */
export function parkTiefe(park: ParkRing[], l: SrLage): { tiefe: number; ids: string[] } | null {
  let best = -Infinity
  const ids: string[] = []
  for (const f of park) {
    const v = f.ring.map(q => { const d = sub(q, l.k), s = dot(d, l.balken); return [s, dot(d, l.tief) - kanteBei(l, s)] as [number, number] })
      .filter(([s]) => Math.abs(s) <= SR_SUCHE_M + 2)
    if (!v.length || !v.some(([s]) => Math.abs(s) <= SR_SUCHE_M)) continue
    const innen = Math.min(...v.map(q => q[1])), aussen = Math.max(...v.map(q => q[1]))
    if (innen > SR_PARK_INNEN_M || innen < -1 || aussen < SR_PARK_TIEFE_BEREICH[0] || aussen > SR_PARK_TIEFE_BEREICH[1]) continue
    ids.push(f.id)
    best = Math.max(best, aussen)
  }
  return ids.length ? { tiefe: Math.round(best * 100) / 100, ids } : null
}

/** Masse beim Einfügen: Streifenbreite, Rand SR_RAND_M, Überstand SR_UEBERSTAND_M, Parktiefe aus der Parkierung bzw. Annahme */
export function seitenraumMasse(breite: number, park: { tiefe: number } | null): SrMasse & { parkQuelle: PlanSeitenraum['parkQuelle'] } {
  return { tiefePark: park ? park.tiefe : SR_PARK_TIEFE_M, ueberstand: SR_UEBERSTAND_M, breite: Math.round(breite * 100) / 100,
    randA: SR_RAND_M, randB: SR_RAND_M, parkQuelle: park ? 'parkierung' : 'annahme' }
}

/** Unzulässige Masse -> Grund, sonst null */
export function srMasseFehler(x: SrMasse): string | null {
  const ok = (v: number, [a, b]: [number, number]) => Number.isFinite(v) && v >= a - 1e-9 && v <= b + 1e-9
  if (!ok(x.ueberstand, SR_BEREICH.ueberstand)) return `Überstand ${f2(x.ueberstand)} m ausserhalb ${SR_BEREICH.ueberstand[0]} bis ${SR_BEREICH.ueberstand[1]} m.`
  if (!ok(x.breite, SR_BEREICH.breite)) return `Streifenbreite ${f2(x.breite)} m ausserhalb ${SR_BEREICH.breite[0]} bis ${SR_BEREICH.breite[1]} m.`
  if (!ok(x.randA, SR_BEREICH.rand) || !ok(x.randB, SR_BEREICH.rand)) return `Rand ausserhalb ${SR_BEREICH.rand[0]} bis ${SR_BEREICH.rand[1]} m.`
  if (!ok(x.tiefePark, SR_BEREICH.tiefePark)) return `Parkstreifen ${f2(x.tiefePark)} m ausserhalb ${SR_BEREICH.tiefePark[0]} bis ${SR_BEREICH.tiefePark[1]} m.`
  return null
}

/** Nächste freie Kennung (sr-1, sr-2, …) */
export function naechsteSrGruppe(plan: FlaechePlan[] | undefined): string {
  const n = Math.max(0, ...(plan ?? []).map(x => Number(/^sr-(\d+)$/.exec(seitenraumStandard(x)?.gruppe ?? '')?.[1] ?? 0)))
  return `sr-${n + 1}`
}

/** Kennzeichnung aus Lage und Massen */
export function seitenraumKennung(gruppe: string, l: SrLage, x: SrMasse & { parkQuelle: PlanSeitenraum['parkQuelle'] }): PlanSeitenraum {
  return { typ: 'seitenraum', gruppe, tiefePark: x.tiefePark, ueberstand: x.ueberstand, breite: x.breite, randA: x.randA, randB: x.randB,
    parkQuelle: x.parkQuelle, k: [l.k[0], l.k[1]], balken: [l.balken[0], l.balken[1]], tief: [l.tief[0], l.tief[1]], kante: [l.kante[0], l.kante[1]] }
}

/** Ring seit dem Einfügen bzw. der letzten Änderung von Hand verändert (Ecken verschoben, Ecke gerundet, Art geändert)? */
export function seitenraumAngepasst(fp: FlaechePlan): boolean {
  const st = seitenraumStandard(fp)
  if (!st) return false
  const soll = seitenraumRing(st, st)
  return fp.art !== 'trottoir' || soll.length !== fp.ring.length || soll.some((p, i) => dist(p, fp.ring[i]) > 1e-3)
}

/** «Vorgezogener Seitenraum: 0,20 m über die Parklinie (Parkstreifen 2,00 m aus der Parkierung), Länge 6,00 m» */
export function seitenraumText(st: PlanSeitenraum): string {
  return `${SR_NAME}: ${f2(st.ueberstand)} m über die Parklinie (Parkstreifen ${f2(st.tiefePark)} m ${st.parkQuelle === 'parkierung'
    ? 'aus der Parkierung' : st.parkQuelle === 'hand' ? 'von Hand' : 'angenommen'}), Länge ${f2(st.breite + st.randA + st.randB)} m`
}

/** Text zur Kennzeichnung einer Fläche (Plan): Mittelinsel bzw. vorgezogener Seitenraum (Liste, Karte, Bericht) */
export function planStandardText(fp: FlaechePlan): string {
  const st = seitenraumStandard(fp)
  if (!st) return standardTeilText(fp)
  return `${seitenraumText(st)}${seitenraumAngepasst(fp) ? ' (Form seither von Hand angepasst)' : ''}`
}
/** Form von Hand angepasst (Mittelinsel bzw. vorgezogener Seitenraum) */
export const planStandardAngepasst = (fp: FlaechePlan): boolean => (seitenraumStandard(fp) ? seitenraumAngepasst(fp) : standardAngepasst(fp))

/** Fläche des Elements neu bilden (Ring aus Lage und Massen) */
export function seitenraumNeu(fp: FlaechePlan, st: PlanSeitenraum): FlaechePlan {
  return { ...fp, art: 'trottoir', ring: seitenraumRing(st, st), standard: st }
}

// ---------------------------------------------------------------- Wirkung auf die Parkierung (Rechnung)
type Box = [number, number, number, number]
const box = (r: P[]): Box => [Math.min(...r.map(p => p[0])), Math.min(...r.map(p => p[1])), Math.max(...r.map(p => p[0])), Math.max(...r.map(p => p[1]))]
const ueber = (a: Box, b: Box) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3])

export interface SrErsetzt { id: string; ganz: boolean }
/**
 * Parkierung unter vorgezogenen Seitenräumen (polys: wirksame Teile, planflaechen.avMitPlan): ein Parkfeld bzw. eine Längsparkierung
 * entfällt ganz, wenn mindestens SR_PARK_ANTEIL davon überdeckt ist; sonst entfällt nur der überdeckte Teil (Reste unter SR_REST_M2
 * weg; eine Längsparkierung wird dann zu Parkfeldern). Ohne Element bzw. Überdeckung: dieselbe Liste
 */
export function parkOhneSeitenraum(liste: Hindernis[], polys: Multi): { hindernisse: Hindernis[]; ersetzt: SrErsetzt[] } {
  if (!polys.length) return { hindernisse: liste, ersetzt: [] }
  let sr: Multi
  try { sr = vereinigung(polys) } catch { sr = polys }
  const sb = box(sr.flatMap(p => p[0] ?? []))
  const aus: Hindernis[] = [], ersetzt: SrErsetzt[] = []
  for (const h of liste) {
    const ring = h.art === 'parkfeld' ? h.ring : h.art === 'laengsparkierung' ? laengsPolygon(h.linie, h.breite) : null
    if (!ring || ring.length < 3 || !ueber(box(ring), sb)) { aus.push(h); continue }
    let a = 0, ue = 0
    try { a = flaeche([[ring]]); ue = flaeche(schnitt([[ring]], sr)) } catch { aus.push(h); continue }
    if (ue < 0.05 || !(a > 0)) { aus.push(h); continue }
    if (ue >= SR_PARK_ANTEIL * a) { ersetzt.push({ id: h.id, ganz: true }); continue }
    let rest: Multi = []
    try { rest = differenz([[ring]], sr) } catch { aus.push(h); continue }
    ersetzt.push({ id: h.id, ganz: false })
    const klasse = h.art === 'parkfeld' ? h.klasse : 'auto'
    for (const p of rest) if (p[0] && flaeche([[p[0]]]) >= SR_REST_M2)
      aus.push({ id: h.id, art: 'parkfeld', klasse, ring: p[0], quelle: h.quelle, name: h.name ?? (h.art === 'laengsparkierung' ? 'Längsparkierung von Hand' : undefined) })
  }
  return { hindernisse: aus, ersetzt }
}

/** Vorgezogene Seitenräume an den Streifen (Ring höchstens 1 m von einer Achse) -> Kennzeichnung und Id */
export function seitenraumAnStreifen(plan: FlaechePlan[] | undefined, st: { p0: P; p1: P }[]): { id: string; st: PlanSeitenraum }[] {
  const aus: { id: string; st: PlanSeitenraum }[] = []
  for (const fp of plan ?? []) {
    const x = seitenraumStandard(fp)
    if (x && st.some(s => abstandLinieMulti([s.p0, s.p1], [[fp.ring]]) <= 1.0)) aus.push({ id: fp.id, st: x })
  }
  return aus
}

// ---------------------------------------------------------------- Streifen von Hand nachführen
/** Schnitt der Geraden durch q in Richtung a mit der Strecke u–v (Parameter auf u–v zurück, für die Lage) */
function schnittGerade(q: P, a: P, u: P, v: P): { x: P; t: number } | null {
  const d = sub(v, u), n = kreuz(d, a)
  if (Math.abs(n) < 0.3 * Math.hypot(d[0], d[1])) return null       // fast parallel
  const t = kreuz(sub(q, u), a) / n
  return { x: add(u, d, t), t }
}

/** Ende ende eines Streifens von Hand auf die Linie (u–v, als Gerade) setzen, SR_RAND_ZUSCHLAG davor (zum anderen Ende hin) */
export function endeAnLinie(s: StreifenHand, ende: 'p0' | 'p1', linie: [P, P]): P | null {
  const a = einheit(sub(s.p1, s.p0)), innen: P = ende === 'p0' ? a : [-a[0], -a[1]]
  const x = schnittGerade(s.p0, a, linie[0], linie[1])
  return x ? add(x.x, innen, SR_RAND_ZUSCHLAG) : null
}

/**
 * Streifen von Hand, deren Ende SR_RAND_ZUSCHLAG vor der Linie alt liegt (die Achse quert alt innerhalb der Strecke), an die Linie neu
 * nachführen (beim Ändern, Ziehen bzw. Löschen eines Elements); die Achse muss neu innerhalb der Strecke queren, sonst gilt rueck
 * (Bordkante heute). -> neue Liste und die Ids der nachgeführten Streifen
 */
export function endenNachfuehren(streifen: StreifenHand[], alt: [P, P], neu: [P, P], rueck: [P, P] | null = null):
  { streifen: StreifenHand[]; ids: string[] } {
  const ids: string[] = []
  const aus = streifen.map(s => {
    const a = einheit(sub(s.p1, s.p0))
    let x: StreifenHand = s
    for (const ende of ['p0', 'p1'] as const) {
      const innen: P = ende === 'p0' ? a : [-a[0], -a[1]]
      const sa = schnittGerade(s.p0, a, alt[0], alt[1])
      if (!sa || sa.t < -0.05 || sa.t > 1.05 || dist(add(sa.x, innen, SR_RAND_ZUSCHLAG), s[ende]) > SR_ENDE_TOL_M) continue
      const sn = schnittGerade(s.p0, a, neu[0], neu[1])
      const ziel = sn && sn.t >= -0.05 && sn.t <= 1.05 ? neu : rueck ?? neu
      const p = endeAnLinie(s, ende, ziel)
      if (!p) continue
      x = { ...x, [ende]: p, angepasst: true }
      ids.push(s.id)
    }
    return x
  })
  return { streifen: aus, ids: [...new Set(ids)] }
}

/**
 * Element entlang der Bordkante verschieben (Griff in der Mitte nach ziel): k gleitet um d = (ziel − Mitte) · balken; die Bordkante
 * quer wird an der neuen Lage neu gemessen (sehne: Fahrbahn ohne das Element), ohne Messung die bisherige Gerade weitergeführt.
 * Masse bleiben
 */
export function srVerschieben(st: PlanSeitenraum, ziel: P, sehne: ((p: P, r: P) => [number, number] | null) | null): PlanSeitenraum {
  const d = dot(sub(ziel, seitenraumMitte(st)), st.balken)
  const k = add(st.k, st.balken, d)
  const l0 = { k, balken: st.balken, tief: st.tief }
  const kante = (sehne ? kanteMessen(l0, st, sehne) : null) ?? [st.kante[0] + st.kante[1] * d, st.kante[1]] as [number, number]
  return { ...st, k: [k[0], k[1]], kante }
}
