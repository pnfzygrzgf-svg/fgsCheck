// Gemeinsame Parkplatzannahmen von SichtweitenCheck und fgsCheck. Originaldaten bleiben unverändert.
import { type P, sub, dot, dist, einheit, imPolygon, abstandStrecke } from '../geo'
import type { AvFlaeche } from '../daten/av'
import type { Hindernis } from './hindernisse'
import type { OsmNetz } from './netz'

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

export type ParkAnordnung = 'laengs' | 'senkrecht' | 'schraeg45'
export const MOTO_TIEFE: Record<ParkAnordnung, number> = { laengs: 1.2, senkrecht: 2.3, schraeg45: 1.9 }
export const PARK_ANORDNUNG_TEXT: Record<ParkAnordnung, string> = { laengs: 'längs', senkrecht: 'senkrecht', schraeg45: 'schräg 45°' }
export const parkAnordnungLesen = (x: unknown): ParkAnordnung | undefined =>
  typeof x === 'string' && Object.prototype.hasOwnProperty.call(MOTO_TIEFE, x) ? x as ParkAnordnung : undefined
export interface ParkRegel { breite: number | null; gebiet: string; grundlage: string; quellenId: string }
/** Kanton am Objekt, auch wenn das Parkfeld gerade ausserhalb der AV-Strassenfläche liegt. */
export function parkRegel(av: readonly AvFlaeche[], p?: P): ParkRegel & { breite: number }
export function parkRegel(av: readonly AvFlaeche[], p: P | undefined, klasse: string, anordnung?: ParkAnordnung): ParkRegel
export function parkRegel(av: readonly AvFlaeche[], p?: P, klasse = 'auto', anordnung?: ParkAnordnung): ParkRegel {
  let f = av.find(f => f.art === 'Strasse_Weg') ?? av[0]
  if (p && av.length) {
    f = av.find(f => imPolygon(p, f.ringe)) ?? av.reduce((a, b) => {
      const ab = (f: AvFlaeche) => Math.min(...f.ringe.flatMap(r => r.map((q, i) => abstandStrecke(p, q, r[(i + 1) % r.length]))))
      return ab(a) <= ab(b) ? a : b
    })
  }
  const bern = f?.bfs === 351
  if (klasse === 'motorrad') return { breite: anordnung ? MOTO_TIEFE[anordnung] : null,
    gebiet: bern ? 'Stadt Bern' : 'aus Bern übertragene Modellannahme', grundlage: `${PARK_BE_VELO}, Motorradflächen: ` +
      `längs 1,20 m, senkrecht 2,30 m, schräg 45° 1,90 m; ${anordnung ? `Anordnung von Hand: ${PARK_ANORDNUNG_TEXT[anordnung]}` : 'Anordnung noch offen'}${bern ? '' : '; ausserhalb Berns als Modellannahme'}`,
    quellenId: 'norm.park.be.zweirad' }
  if (klasse === 'velo') return { breite: 1.9, gebiet: bern ? 'Stadt Bern' : 'aus Bern übertragene Modellannahme',
    grundlage: `${PARK_BE_VELO}, Parkfeld Velo: 1,90 m Tiefe quer zur Strasse${bern ? '' : '; ausserhalb Berns als Modellannahme'}`,
    quellenId: 'norm.park.be.zweirad' }
  if (bern) return { breite: 1.9, gebiet: 'Stadt Bern', grundlage: `${PARK_BE_AUTO}, Längspark- und Parkverbotsfelder: 1,90 m`, quellenId: 'norm.park.be.auto' }
  return f?.kanton === 'ZH' ? { breite: 2, gebiet: 'Kanton Zürich', grundlage: `${PARK_ZH}, Kap. 4.1; kantonsweite Modellannahme`, quellenId: 'norm.park.zh' }
    : { breite: 1.9, gebiet: f?.kanton ? `Kanton ${f.kanton}` : 'Gebiet nicht bestimmt',
      grundlage: `${PARK_SN}, Tab. 2, Komfortstufen A/B; Mindestbreite als Modellannahme`, quellenId: 'norm.park.sn' }
}

export interface ParkPruefung {
  original: P[]
  katasterBreite: number | null
  pruefBreite: number | null
  ergaenzung: number
  regel: ParkRegel
  status: 'ergaenzt' | 'unveraendert' | 'unklar'
  hinweis: string
}
type Parkfeld = Extract<Hindernis, { art: 'parkfeld' }>
const kreuz = (a: P, b: P) => a[0] * b[1] - a[1] * b[0]
const EPS = 1e-7

/** Konvexe Hülle: nur für die gerichtete Ergänzung eines bereits konvexen Umrisses. */
function huelle(punkte: P[]): P[] {
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

/** Nächste befahrbare Strassenachse bis 15 m; bei konkurrierenden Achsen keine Seitenzuordnung raten. */
function strasse(netz: OsmNetz | null, p: P): { p: P; t: P } | null {
  const kandidaten: { p: P; t: P; d: number }[] = []
  for (const w of netz?.W.values() ?? []) {
    if (!w.mfz) continue
    for (let i = 0; i + 1 < w.nds.length; i++) {
      const a = netz!.p(w.nds[i]), b = netz!.p(w.nds[i + 1]), v = sub(b, a), l2 = dot(v, v)
      if (l2 < EPS) continue
      const f = Math.max(0, Math.min(1, dot(sub(p, a), v) / l2)), q: P = [a[0] + f * v[0], a[1] + f * v[1]]
      const d = dist(p, q)
      if (d <= 15) kandidaten.push({ p: q, t: einheit(v), d })
    }
  }
  kandidaten.sort((a, b) => a.d - b.d)
  const a = kandidaten[0]
  if (!a || kandidaten.some(b => b.d <= a.d + 0.5 && (Math.abs(dot(a.t, b.t)) < Math.cos(Math.PI / 9) ||
    dot(sub(a.p, p), sub(b.p, p)) < 0))) return null
  return a
}

export function parkPruefflaechen(liste: readonly Hindernis[], av: readonly AvFlaeche[], netz: OsmNetz | null): Hindernis[] {
  return liste.map(h => {
    if (h.art !== 'parkfeld' || h.quelle !== 'kataster' || h.parkPruefung) return h
    const velo = h.klasse === 'velo' && (h.katasterTyp === 'Parkplatz_Velo_Mofa' || h.id.includes(':Parkplatz_Velo_Mofa:'))
    const moto = h.klasse === 'motorrad' && (h.katasterTyp === 'Parkplatz_Motorrad' || h.id.includes(':Parkplatz_Motorrad:'))
    const zweirad = velo || moto
    if (h.klasse !== 'auto' && !zweirad) return h
    const mitte: P = h.ring.length ? [h.ring.reduce((s, p) => s + p[0] / h.ring.length, 0), h.ring.reduce((s, p) => s + p[1] / h.ring.length, 0)] : [0, 0]
    let s = zweirad ? strasse(netz, mitte) : null
    // Bei einer kurzen Velo-Gruppe kann die Tiefe grösser als die Reihenlänge sein: quer zur Strasse messen,
    // nicht pauschal die kürzeste Polygonseite verbreitern. Richtung aus einer strassenparallelen Katasterkante.
    const parallel = zweirad && s ? h.ring.map((p, i) => einheit(sub(h.ring[(i + 1) % h.ring.length], p)))
      .filter(u => Math.abs(dot(u, s!.t)) >= Math.cos(Math.PI / 9)).sort((a, b) => Math.abs(dot(b, s!.t)) - Math.abs(dot(a, s!.t)))[0] : undefined
    const m = zweirad && !parallel ? null : parkMasse(h.ring, parallel)
    const regel = parkRegel(av, mitte, h.klasse, h.parkAnordnung)
    const meta: ParkPruefung = { original: h.ring.map(p => [...p] as P), katasterBreite: m?.breite ?? null,
      pruefBreite: m?.breite ?? null, ergaenzung: 0, regel, status: 'unveraendert', hinweis: '' }
    const aus = (hinweis: string): Parkfeld => ({ ...h, parkPruefung: { ...meta, status: 'unklar', hinweis } })
    if (regel.breite === null) return aus('Motorrad-Anordnung im Kataster nicht angegeben: längs, senkrecht oder schräg 45° am Luftbild prüfen und festlegen. Bis dahin Originalumriss unverändert.')
    if (!m) return aus('Katastergeometrie oder Fahrbahnbezug nicht auswertbar; keine Ergänzung.')
    if (m.breite >= regel.breite - EPS) return { ...h, parkPruefung: meta }
    if (!m.konvex || (zweirad ? m.laenge < 0.5 : m.laenge < 3 || m.laenge < 2 * m.breite) || m.breite < 0.5)
      return aus('Keine eindeutig längliche, konvexe Parkfläche; keine Ergänzung. Geometrie vor Ort prüfen.')
    s ??= strasse(netz, mitte)
    if (!s || Math.abs(dot(s.t, m.achse)) < Math.cos(Math.PI / 9))
      return aus('Längsparkierung oder Fahrbahnseite nicht eindeutig; keine Ergänzung. Geometrie vor Ort prüfen.')
    const n: P = [-m.achse[1], m.achse[0]], seite = dot(sub(s.p, mitte), n)
    if (Math.abs(seite) <= m.breite / 2 + 0.1) return aus('Strassenachse liegt in oder zu nahe an der Parkfläche; Fahrbahnseite unklar, keine Ergänzung.')
    const delta = regel.breite - m.breite, v = (seite > 0 ? 1 : -1) * delta
    const ring = huelle([...h.ring, ...h.ring.map(p => [p[0] + n[0] * v, p[1] + n[1] * v] as P)])
    return { ...h, ring, parkPruefung: { ...meta, pruefBreite: regel.breite, ergaenzung: delta, status: 'ergaenzt',
      hinweis: 'Zur Fahrbahn hin ergänzt; der gegenüberliegende Rand bleibt erhalten.' } }
  })
}

const f2 = (x: number | null) => x === null ? 'nicht bestimmbar' : `${x.toFixed(2).replace('.', ',')} m`
export function parkPruefText(h: Hindernis): string {
  const p = h.art === 'parkfeld' ? h.parkPruefung : undefined
  if (!p) return ''
  const zweirad = h.art === 'parkfeld' && h.klasse !== 'auto'
  return `Katasterbreite ${zweirad ? 'quer zur Strasse' : 'quer zur Längsrichtung'} ${f2(p.katasterBreite)}; verwendete Prüffläche ${f2(p.pruefBreite)}. ` +
    (p.status === 'ergaenzt' ? `Um ${f2(p.ergaenzung)} zur Fahrbahn hin ergänzt. ` : p.status === 'unklar' ? `${p.hinweis} ` : 'Originalumriss unverändert. ') +
    `Mindest${zweirad ? 'tiefe der Zweiradfläche' : 'breite für Längsparkierung'} ${f2(p.regel.breite)} (${p.regel.gebiet}); ${p.regel.grundlage}. ` +
    `${zweirad ? 'Zweiradfläche: nur Hinweis, keine Sichtverdeckung.' : 'Belegung angenommen.'} Diese Fläche gilt für Sichtprüfung und Darstellung; erkannte Parkstreifen beeinflussen auch die Fahrlinie.`
}

/** Ersetzt nur Parkfelder; ermöglicht auch mehrere verbleibende Teilflächen unter derselben Quell-Id (Plan-Seitenraum). */
export function parkDarstellung(liste: readonly Hindernis[], gerechnet?: readonly Hindernis[]): Hindernis[] {
  if (!gerechnet) return [...liste]
  return liste.flatMap(h => h.art === 'parkfeld' || h.art === 'laengsparkierung' ? gerechnet.filter(p => p.id === h.id) : [h])
}

/** Neue Anordnung immer am Quellenumriss anwenden, damit eine frühere Ergänzung nicht zur neuen Quelle wird. */
export function parkMitAnordnung(h: Hindernis, anordnung: ParkAnordnung | undefined): Hindernis {
  if (h.art !== 'parkfeld') return h
  const { parkPruefung, ...roh } = h
  return { ...roh, ring: (parkPruefung?.original ?? h.ring).map(p => [...p] as P), parkAnordnung: anordnung }
}


/** Gemeinsame, kurze Annahme für Ergebnis und Bericht; Einzelangaben folgen nur bei einem Ergebnisbeitrag. */
export const PARK_BERICHT_ANNAHME = 'Parkfelder gelten als besetzt, einschliesslich Parkverbotsflächen. Velo-/Mofa- und Motorradflächen ergeben nur Hinweise zur Sicht. ' +
  'Mindestbreite für Auto-Längsparkierung: Bern und ohne örtliche Vorgabe 1,90 m, Kanton Zürich 2,00 m (Modellannahme). ' +
  'Velo/Mofa: 1,90 m Tiefe; Motorrad je bestätigter Anordnung 1,20 / 2,30 / 1,90 m. ' +
  'Ergänzung nur bei eindeutiger Zuordnung zur Fahrbahn hin; sonst Originalumriss. Belegung und Geometrie sind Annahmen. ' +
  'Die verwendete Prüffläche gilt für Sichtprüfung, Parkstreifenerkennung und Darstellung; grau gestrichelt der ursprüngliche Katasterumriss einer ergänzten Fläche.'
