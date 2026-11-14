// ── Parkregel: Längsparkfelder zur Fahrbahn hin auf die Regelbreite ergänzen (gemeinsamer Baustein seit 14.11.2026, Plan AV-Geometrie,
//    «Nachträge für den Baustein», aus A4) ──
// Bis dahin im fgsCheck rechner/parkgeometrie.ts (parkPruefflaechen, parkMasse, huelle) und als örtliche Kopie im VeloroutenCheck
// (src/parkregel.ts, gleiche Namen und Texte); beide rechnen jetzt mit dieser Funktion.
//
// Regel (Plan 2.4, Entscheid 4): Ein Feld schmaler als die Regelbreite (Stadt Bern 1,90 m Längsparkierung) wird zur Fahrbahn hin auf die
// Regelbreite ergänzt; die äussere Kante (der gegenüberliegende Rand) bleibt. Breitere Felder bleiben unverändert. Keine Ergänzung bei
// unklarer Geometrie: nicht länglich oder nicht konvex, nicht parallel zur Fahrbahn (mehr als 20°), Seite unklar.
//
// Bezug zur Fahrbahn (vom Aufrufer, wahlweise):
//   { p, t }         ein Punkt auf der Fahrbahnseite des Felds und die Fahrbahnrichtung (fgsCheck: nächste befahrbare OSM-Achse;
//                    VeloroutenCheck: Fahrbahnmitte zwischen den Bordpunkten und Bordrichtung). Liegt p im Feld oder näher als
//                    halbe Feldbreite + 0,1 m an seiner Längsachse: Seite unklar.
//   { bord, innen }  ein Bordpunkt und die Normale zur Fahrbahn hin (Bordmodell): ergänzt wird in Richtung innen, auch für ein Feld auf
//                    Trottoirniveau jenseits des Bords.
// Der Bezug darf als Funktion kommen; sie wird nur aufgerufen, wenn das Feld ergänzt werden müsste (der fgsCheck sucht die OSM-Achse
// erst dann). Reine Rechnung in LV95 ohne Browser; die Regelbreite nach Gebiet (parkRegel) ist hier die der Auto-Längsparkierung.
import { type P, dist, dot, einheit, kreuz, links, sub } from './geometrie'

export const PARK_SN = 'SN 640 291a – Parkieren, Anordnung und Geometrie der Parkierungsanlagen'
export const PARK_ZH = 'Kanton Zürich, Richtlinie Parkieren entlang von Staatsstrassen, 601.14.01, Version 1.0 vom 1.11.2022'
export const PARK_BE_AUTO = 'Stadt Bern, Bern baut C 2.10.22 – Parkfelder 1/2 (Auto), revidiert März 2019'
export const PARK_BE_VELO = 'Stadt Bern, Bern baut C 2.10.23 – Parkfelder 2/2 (Velo, Motorrad, E-Mobil, Car, LKW), revidiert April 2011'
export const PARK_GRUNDLAGE = `${PARK_SN}, Tabelle 2: Längsparkfelder Komfortstufen A/B mindestens 1,90 m (C: 2,00 m). ` +
  `${PARK_ZH}, Kapitel 4.1: mindestens 2,00 m auf Staatsstrassen. Die App verwendet 2,00 m im ganzen Kanton Zürich als ` +
  'Modellannahme, sonst 1,90 m; keine Aussage zur heutigen Normkonformität. Schräg- und Senkrechtparkierung braucht andere Masse. ' +
  `Überhang- und Sicherheitsstreifen werden nicht zur Parkfeldbreite addiert. In Bern belegt ${PARK_BE_AUTO} die 1,90 m auch für ` +
  `Parkverbotsfelder. Velo-/Mofa-Parkflächen: 1,90 m Tiefe quer zur Strasse nach ${PARK_BE_VELO}; ausserhalb Berns als Modellannahme. ` +
  'Motorradflächen nach demselben Blatt: längs 1,20 m, senkrecht 2,30 m, schräg 45° 1,90 m. Ohne bekannte Anordnung keine Ergänzung.'

export interface ParkRegel { breite: number | null; gebiet: string; grundlage: string; quellenId: string }
/**
 * Regelbreite der Auto-Längsparkierung (auch Parkverbotsfelder) nach Gebiet: Stadt Bern 1,90 m (Bern baut C 2.10.22), Kanton Zürich
 * 2,00 m (kantonsweite Modellannahme), sonst 1,90 m nach SN 640 291a (Modellannahme).
 * Beispiel { bern: true } → 1,90 m, «Stadt Bern»; { kanton: 'ZH' } → 2,00 m; { kanton: 'LU' } → 1,90 m, «Kanton LU».
 */
export function parkRegel(gebiet: { bern?: boolean; kanton?: string }): ParkRegel & { breite: number } {
  if (gebiet.bern) return { breite: 1.9, gebiet: 'Stadt Bern', grundlage: `${PARK_BE_AUTO}, Längspark- und Parkverbotsfelder: 1,90 m`, quellenId: 'norm.park.be.auto' }
  return gebiet.kanton === 'ZH' ? { breite: 2, gebiet: 'Kanton Zürich', grundlage: `${PARK_ZH}, Kap. 4.1; kantonsweite Modellannahme`, quellenId: 'norm.park.zh' }
    : { breite: 1.9, gebiet: gebiet.kanton ? `Kanton ${gebiet.kanton}` : 'Gebiet nicht bestimmt',
      grundlage: `${PARK_SN}, Tab. 2, Komfortstufen A/B; Mindestbreite als Modellannahme`, quellenId: 'norm.park.sn' }
}

export interface ParkPruefung {
  original: P[]
  katasterBreite: number | null   // erfasste Feldbreite quer zur Längsrichtung des Felds [m]
  pruefBreite: number | null      // verwendete (angesetzte) Breite [m]
  ergaenzung: number              // zur Fahrbahn hin ergänzt [m]
  regel: ParkRegel
  status: 'ergaenzt' | 'unveraendert' | 'unklar'
  hinweis: string
}
/** Hinweise der Prüfung (Wortlaut seit dem fgsCheck) */
export const PARK_HINWEIS = {
  geometrie: 'Katastergeometrie oder Fahrbahnbezug nicht auswertbar; keine Ergänzung.',
  laenglich: 'Keine eindeutig längliche, konvexe Parkfläche; keine Ergänzung. Geometrie vor Ort prüfen.',
  seite: 'Längsparkierung oder Fahrbahnseite nicht eindeutig; keine Ergänzung. Geometrie vor Ort prüfen.',
  nahe: 'Strassenachse liegt in oder zu nahe an der Parkfläche; Fahrbahnseite unklar, keine Ergänzung.',
  ergaenzt: 'Zur Fahrbahn hin ergänzt; der gegenüberliegende Rand bleibt erhalten.',
} as const

/** Bezug zur Fahrbahn: Punkt auf der Fahrbahnseite mit Fahrbahnrichtung, oder Bordpunkt mit Normale zur Fahrbahn hin */
export type ParkBezug = { p: P; t: P } | { bord: P; innen: P }

const EPS = 1e-7
/** Annahme (seit dem fgsCheck): Feld und Fahrbahn höchstens so schräg zueinander [Grad] */
export const PARK_PARALLEL_MAX_GRAD = 20
/** Annahme (seit dem fgsCheck): Fahrbahnpunkt mindestens halbe Feldbreite plus so viel neben der Längsachse des Felds [m] */
export const PARK_SEITE_ZUGABE_M = 0.1

/** Konvexe Hülle: nur für die gerichtete Ergänzung eines bereits konvexen Umrisses. */
export function huelle(punkte: P[]): P[] {
  const p = [...punkte].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .filter((a, i, arr) => !i || dist(a, arr[i - 1]) > EPS)
  const teil = (pp: P[]) => {
    const h: P[] = []
    for (const q of pp) {
      while (h.length > 1 && kreuz(sub(h[h.length - 1], h[h.length - 2]), sub(q, h[h.length - 1])) <= EPS) h.pop()
      h.push(q)
    }
    return h.slice(0, -1)
  }
  return [...teil(p), ...teil([...p].reverse())]
}

/** Kleinstes gedrehtes Rechteck, dazu Breite der Endkanten quer zur Längsrichtung (auch leicht keilförmige Katasterreihen). */
export function parkMasse(ring: readonly P[], richtung?: P): { achse: P; breite: number; laenge: number; konvex: boolean } | null {
  const r = ring.filter((p, i) => p.every(Number.isFinite) && (!i || dist(p, ring[i - 1]) > EPS))
  if (r.length > 1 && dist(r[0], r[r.length - 1]) < EPS) r.pop()
  if (r.length < 3) return null
  let best: { achse: P; breite: number; laenge: number; flaeche: number } | null = null
  for (let i = 0; i < (richtung ? 1 : r.length); i++) {
    const u = richtung ? einheit(richtung) : einheit(sub(r[(i + 1) % r.length], r[i])), n: P = [-u[1], u[0]]
    const a = r.map(p => dot(sub(p, r[0]), u)), b = r.map(p => dot(sub(p, r[0]), n))
    const x = Math.max(...a) - Math.min(...a), y = Math.max(...b) - Math.min(...b)
    if (x * y > EPS && (!best || x * y < best.flaeche)) best = { achse: richtung || x >= y ? u : n,
      laenge: richtung ? x : Math.max(x, y), breite: richtung ? y : Math.min(x, y), flaeche: x * y }
  }
  if (!best) return null
  const n: P = [-best.achse[1], best.achse[0]]
  // Breite zwischen den beiden Längsrändern, auch bei schrägen Stirnseiten. Nach einer gerichteten Ergänzung kann
  // eine Stirnseite aus mehreren Kanten bestehen; deren einzelne Längen wären keine Parkfeldbreiten.
  const laengs = r.map((p, i) => ({ a: sub(p, r[0]), b: sub(r[(i + 1) % r.length], r[0]) }))
    .filter(e => dist(e.a, e.b) >= 0.5 * best!.laenge && Math.abs(dot(einheit(sub(e.b, e.a)), best!.achse)) >= 0.94)
  let breite = best.breite
  if (laengs.length === 2) {
    const [a, b] = laengs
    const ns = (e: typeof a, u: number) => dot(e.a, n) + (u - dot(e.a, best!.achse)) * dot(sub(e.b, e.a), n) / dot(sub(e.b, e.a), best!.achse)
    const us = laengs.flatMap(e => [dot(e.a, best!.achse), dot(e.b, best!.achse)])
    breite = Math.min(breite, ...[Math.min(...us), Math.max(...us)].map(u => Math.abs(ns(a, u) - ns(b, u))))
  }
  const vorzeichen = r.map((p, i) => kreuz(sub(r[(i + 1) % r.length], p), sub(r[(i + 2) % r.length], r[(i + 1) % r.length])))
  return { achse: best.achse, laenge: best.laenge, breite,
    konvex: !vorzeichen.some(v => v < -EPS) || !vorzeichen.some(v => v > EPS) }
}

/**
 * Prüffläche eines Parkfelds nach der Parkregel. ring: Umriss aus dem Kataster bzw. Geoportal (LV95); regel: Regelbreite (parkRegel
 * oder die des Aufrufers, z. B. Zweiradtiefe); fahrbahn: Bezug zur Fahrbahn (oben), auch als Funktion, null ohne eindeutigen Bezug.
 * optionen.richtung: Längsrichtung vorgegeben (Zweiradfläche: strassenparallele Katasterkante); optionen.zweirad: Zweiradfläche (ohne
 * Längsrichtung nicht auswertbar; länglich schon ab 0,5 m Länge).
 * Zurück die Prüfung und der verwendete Umriss: ergänzt die konvexe Hülle aus dem Umriss und seiner Verschiebung um die fehlende Breite
 * zur Fahrbahn hin (die äussere Kante bleibt), sonst eine Kopie des Umrisses.
 * Beispiel: Feld 12 × 1,60 m längs bei N 3 … 4,6, Achse N 0, Regel 1,90 m → 'ergaenzt' um 0,30 m nach Süden (N 2,7 … 4,6); dasselbe mit
 * Bordpunkt (0, 4,6) und innen (0, −1); Feld 2,30 m → 'unveraendert'; Feld quer zur Fahrbahn → 'unklar'.
 */
export function parkFeldPruefen(ring: readonly P[], regel: ParkRegel & { breite: number },
  fahrbahn: ParkBezug | null | (() => ParkBezug | null), optionen: { richtung?: P; zweirad?: boolean } = {}): { pruefung: ParkPruefung; ring: P[] } {
  const original = ring.map(p => [...p] as P)
  const mitte: P = ring.length ? [ring.reduce((s, p) => s + p[0] / ring.length, 0), ring.reduce((s, p) => s + p[1] / ring.length, 0)] : [0, 0]
  const m = optionen.zweirad && !optionen.richtung ? null : parkMasse(ring, optionen.richtung)
  const meta: ParkPruefung = { original, katasterBreite: m?.breite ?? null, pruefBreite: m?.breite ?? null, ergaenzung: 0, regel, status: 'unveraendert', hinweis: '' }
  const kopie = () => original.map(p => [...p] as P)
  const aus = (hinweis: string) => ({ pruefung: { ...meta, status: 'unklar' as const, hinweis }, ring: kopie() })
  if (!m) return aus(PARK_HINWEIS.geometrie)
  if (m.breite >= regel.breite - EPS) return { pruefung: meta, ring: kopie() }
  if (!m.konvex || (optionen.zweirad ? m.laenge < 0.5 : m.laenge < 3 || m.laenge < 2 * m.breite) || m.breite < 0.5) return aus(PARK_HINWEIS.laenglich)
  const bezug = typeof fahrbahn === 'function' ? fahrbahn() : fahrbahn
  const parallel = Math.cos(PARK_PARALLEL_MAX_GRAD * Math.PI / 180)
  const n: P = [-m.achse[1], m.achse[0]]
  let vorzeichen: number
  if (bezug && 'bord' in bezug) {
    const innen = einheit(bezug.innen)
    if ((!innen[0] && !innen[1]) || Math.abs(dot(links(innen), m.achse)) < parallel) return aus(PARK_HINWEIS.seite)
    vorzeichen = dot(innen, n) > 0 ? 1 : -1
  } else {
    const t = bezug ? einheit(bezug.t) : null
    if (!bezug || !t || Math.abs(dot(t, m.achse)) < parallel) return aus(PARK_HINWEIS.seite)
    const seite = dot(sub(bezug.p, mitte), n)
    if (Math.abs(seite) <= m.breite / 2 + PARK_SEITE_ZUGABE_M) return aus(PARK_HINWEIS.nahe)
    vorzeichen = seite > 0 ? 1 : -1
  }
  const delta = regel.breite - m.breite, v = vorzeichen * delta
  const neu = huelle([...ring, ...ring.map(p => [p[0] + n[0] * v, p[1] + n[1] * v] as P)])
  return { pruefung: { ...meta, pruefBreite: regel.breite, ergaenzung: delta, status: 'ergaenzt', hinweis: PARK_HINWEIS.ergaenzt }, ring: neu }
}
