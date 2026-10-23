// ── Veloverkehr (VSS 40 273 Ziffer 10, 12 und 13.3, Tab. 3, Abb. 2) und Trottoir (Ziffer 13.2, Tab. 2) (E3b) ──
//
// Velo: je Richtung eine zweite Prüfung auf der Veloachse. Veloführung je Richtung (vortrittsberechtigter Arm) aus OSM als Vorgabe,
// im Panel wählbar: Mischverkehr (d = D_VELO_M vom rechten Fahrbahnrand, nach dem Parkstreifen-Abzug), Radstreifen (OSM
// cycleway:<seite>=lane; Achse in der Mitte des Streifens RADSTREIFEN_M breit ab Rand bzw. Parkstreifen; die Autoachse liegt dann
// d = 1,50 m neben dem Streifen), Radweg (OSM highway=cycleway bzw. Fuss- und Radweg neben der Strasse, oder cycleway:*=track;
// Zielpunkte auf seiner Achse; liegt er näher als RADWEG_NAH_M am Fahrbahnrand und zwischen Zufahrt und Fahrbahn, gilt B ab dem
// Radwegrand, Ziffer 12), kein Veloverkehr.
// Tab. 3 nach der zulässigen Höchstgeschwindigkeit (bis 30 km/h bzw. darüber) und der Längsneigung in Fahrtrichtung des Velos
// (Spalten ≤ −4, −2, 0, > 0 %, je bis zur Spaltenzahl gerechnet: −4 < i ≤ −2 -> «−2», −2 < i ≤ 0 -> «0»); schnelle E-Bikes verboten
// (nur über 30 km/h): talwärts (Spalten ≤ −4 und −2) 35 m, eben 30 m, bergwärts (> 0) 25 m.
// Trottoir: Tab. 2 nach der Längsneigung des Trottoirs in Gehrichtung auf die Zufahrt zu (Spalten ≤ −6, −4, −2, ≥ 0 %; Zwischenwerte
// zur Spalte talwärts daneben: −6 < i ≤ −4 -> «−4», −4 < i < 0 -> «−2»). Achse des Trottoirs: Mitte der AV-Fläche Trottoir aus
// Querschnitten entlang der Vortrittsstrasse (wie die Fahrbahn), der Bordkante folgend.
// Nur Zahlenwerte der Norm, kein Normtext.

import { type P, add, dot, einheit, links, sub, median, lv95, segSchnitt } from '../geo'
import type { OsmWeg } from '../daten/osm'
import { punkteAufSpur } from './spur'
import { QUER_VON_M, QUER_BIS_M, QUER_SCHRITT_M } from './hauptachsen'
import { ABZUG_VELO } from './fahrstreifen'
import { streckeLaenge } from './netz'

export type Velofuehrung = 'misch' | 'radstreifen' | 'radweg' | 'kein'
export const VELOFUEHRUNGEN: Velofuehrung[] = ['misch', 'radstreifen', 'radweg', 'kein']
export const VELOFUEHRUNG_TEXT: Record<Velofuehrung, string> = {
  misch: 'Mischverkehr', radstreifen: 'Radstreifen', radweg: 'Radweg', kein: 'kein Veloverkehr',
}
/** VSS 40 273 Ziffer 10: Abstand Mitte Velo – rechter Fahrbahnrand im Mischverkehr */
export const D_VELO_M = 0.5
/** Breite eines Radstreifens (Annahme, wie der Velostreifen-Abzug aus fgsCheck); Achse in seiner Mitte */
export const RADSTREIFEN_M = ABZUG_VELO
/** Radweg ohne OSM width: so breit angenommen [m] */
export const RADWEG_BREITE_M = 2.0
/** Ziffer 12: Radweg näher als so viel am Fahrbahnrand -> B ab dem Radwegrand */
export const RADWEG_NAH_M = 2.0
/** Radweg neben der Strasse: Achse höchstens so weit neben dem Fahrbahnrand gesucht [m] */
export const RADWEG_SUCHE_M = 10
/** … und höchstens so schief zur Strasse (cos des Winkels mindestens) */
const RADWEG_PARALLEL_COS = Math.cos(25 * Math.PI / 180)
/** … mit mindestens so vielen Treffern der Querschnitte */
const RADWEG_MIN_TREFFER = 3

// ---------------------------------------------------------------- Tab. 3 und Tab. 2
/** VSS 40 273 Tab. 3: A [m] je Spalte (≤ −4, −2, 0, > 0 %) bis 30 km/h bzw. über 30 km/h */
export const TAB3: { bis30: number[]; ueber30: number[] } = { bis30: [30, 25, 25, 20], ueber30: [55, 55, 50, 45] }
export const TAB3_SPALTEN = ['≤ −4', '−2', '0', '> 0']
/** Tab. 3, schnelle E-Bikes verboten (nur über 30 km/h): talwärts, eben, bergwärts [m] */
export const TAB3_EBIKE = { talwaerts: 35, eben: 30, bergwaerts: 25 }
/** Tab. 3: Grenze zwischen den beiden Zeilen [km/h] */
export const TAB3_GRENZE = 30

/** Spalte der Tab. 3 für die Längsneigung i [%] in Fahrtrichtung (talwärts negativ): 0 (≤ −4), 1 (−2), 2 (0), 3 (> 0) */
export function tab3Spalte(i: number): 0 | 1 | 2 | 3 {
  const x = Number.isFinite(i) ? i : 0
  return x <= -4 + 1e-9 ? 0 : x <= -2 + 1e-9 ? 1 : x <= 1e-9 ? 2 : 3
}

export interface VeloSichtweite { A: number; spalte: number; zeile: 'bis30' | 'ueber30'; ebike: boolean; text: string }

/** erforderliche Knotensichtweite A für den Veloverkehr nach Tab. 3: zulässige Höchstgeschwindigkeit [km/h], Längsneigung [%],
 *  schnelle E-Bikes verboten (gilt nur über 30 km/h) */
export function veloSichtweite(tempo: number, i: number, ebikeVerboten = false): VeloSichtweite {
  const zeile = tempo <= TAB3_GRENZE ? 'bis30' : 'ueber30'
  const spalte = tab3Spalte(i)
  const ebike = ebikeVerboten && zeile === 'ueber30'
  const A = ebike ? (spalte <= 1 ? TAB3_EBIKE.talwaerts : spalte === 2 ? TAB3_EBIKE.eben : TAB3_EBIKE.bergwaerts) : TAB3[zeile][spalte]
  const z = zeile === 'bis30' ? `bis ${TAB3_GRENZE} km/h` : `über ${TAB3_GRENZE} km/h`
  const s = `Spalte ${TAB3_SPALTEN[spalte]} %`
  const text = ebike ? `Tab. 3, ${z}, schnelle E-Bikes verboten, ${spalte <= 1 ? 'talwärts' : spalte === 2 ? 'eben' : 'bergwärts'} (${s})` :
    `Tab. 3, ${z}, ${s}`
  return { A, spalte, zeile, ebike, text }
}

/** VSS 40 273 Tab. 2: A [m] auf dem Trottoir je Spalte (≤ −6, −4, −2, ≥ 0 %) */
export const TAB2 = [30, 20, 20, 15]
export const TAB2_SPALTEN = ['≤ −6', '−4', '−2', '≥ 0']
/** Spalte der Tab. 2 für die Längsneigung i [%] in Gehrichtung auf die Zufahrt zu: 0 (≤ −6), 1 (−4), 2 (−2), 3 (≥ 0) */
export function tab2Spalte(i: number): 0 | 1 | 2 | 3 {
  const x = Number.isFinite(i) ? i : 0
  return x <= -6 + 1e-9 ? 0 : x <= -4 + 1e-9 ? 1 : x < -1e-9 ? 2 : 3
}
export function trottoirSichtweite(i: number): { A: number; spalte: number; text: string } {
  const spalte = tab2Spalte(i)
  return { A: TAB2[spalte], spalte, text: `Tab. 2, Spalte ${TAB2_SPALTEN[spalte]} %` }
}

// ---------------------------------------------------------------- Radwege aus OSM
/** Radweg in OSM: highway=cycleway bzw. Fuss- oder Radweg mit bicycle=designated (ohne Querungen) */
export function istRadweg(t: Record<string, string>): boolean {
  if (t.cycleway === 'crossing' || t.footway === 'crossing' || t.path === 'crossing') return false
  return t.highway === 'cycleway' || (['path', 'footway'].includes(t.highway ?? '') && t.bicycle === 'designated')
}
export interface RadwegLinie { id: number; tags: Record<string, string>; linie: P[] }
export const radwegLinien = (wege: OsmWeg[]): RadwegLinie[] =>
  wege.filter(w => istRadweg(w.tags)).map(w => ({ id: w.id, tags: w.tags, linie: w.geom.map(([la, lo]) => lv95(la, lo)) }))

/** Radweg neben einem Arm: versatz = Lage seiner Achse links von u (positiv: rechte Seite des Verkehrs zum Knoten), Breite,
 *  Abstand des inneren Rands vom Fahrbahnrand, zweiRichtungen (nicht oneway), eigene Seite (rechts des Verkehrs) */
export interface RadwegLage { id: number; versatz: number; breite: number; breiteOsm: boolean; abstand: number; zweiRichtungen: boolean
  eigeneSeite: boolean; treffer: number }

const oneway = (t: Record<string, string>) => ['yes', '1', '-1'].includes(t.oneway ?? '') || ['yes', '1', '-1'].includes(t['oneway:bicycle'] ?? '')

/**
 * Radweg neben dem Arm (Mittellinie ml vom Knoten weg, Querschnitt links bzw. rechts von u): Querschnitte alle QUER_SCHRITT_M von
 * QUER_VON_M bis QUER_BIS_M; je Querschnitt der nächste Schnitt mit einer Radweg-Linie ausserhalb der Fahrbahn bis RADWEG_SUCHE_M,
 * die etwa parallel läuft. Zuerst auf der rechten Seite des Verkehrs zum Knoten (links von u), sonst gegenüber nur ein Radweg in
 * beiden Richtungen. -> Lage (Median) bzw. null
 */
export function radwegNeben(ml: P[], qsLinks: number, qsRechts: number, radwege: RadwegLinie[]): RadwegLage | null {
  if (!radwege.length || ml.length < 2) return null
  const ab: number[] = []
  for (let s = QUER_VON_M; s <= QUER_BIS_M + 1e-9; s += QUER_SCHRITT_M) ab.push(s)
  const pkte = punkteAufSpur(ml, ab)
  const suche = (seite: 1 | -1, nurZwei: boolean): RadwegLage | null => {
    const rand = seite > 0 ? qsLinks : qsRechts
    const treffer = new Map<number, number[]>()
    for (const [q, t] of pkte) {
      const n = links(t)
      const a = add(q, n, seite * (rand - 0.3)), b = add(q, n, seite * (rand + RADWEG_SUCHE_M))
      let best: { id: number; x: number } | null = null
      for (const w of radwege) {
        if (nurZwei && oneway(w.tags)) continue
        for (let k = 0; k < w.linie.length - 1; k++) {
          const c = w.linie[k], d = w.linie[k + 1]
          if (Math.abs(dot(einheit(sub(d, c)), t)) < RADWEG_PARALLEL_COS) continue
          const x = segSchnitt(a, b, c, d)
          if (!x) continue
          const off = rand - 0.3 + x[0] * (RADWEG_SUCHE_M + 0.3)
          if (!best || off < best.x) best = { id: w.id, x: off }
        }
      }
      if (best) treffer.set(best.id, [...(treffer.get(best.id) ?? []), best.x])
    }
    const [id, xs] = [...treffer].sort((a, b) => b[1].length - a[1].length)[0] ?? [0, []]
    if (xs.length < RADWEG_MIN_TREFFER) return null
    const w = radwege.find(r => r.id === id)!
    const bo = Number.parseFloat((w.tags.width ?? '').replace(',', '.'))
    const breite = Number.isFinite(bo) && bo > 0.5 && bo < 8 ? bo : RADWEG_BREITE_M
    const x = median(xs)
    return { id, versatz: seite * x, breite, breiteOsm: breite === bo, abstand: Math.max(0, x - breite / 2 - rand), zweiRichtungen: !oneway(w.tags),
      eigeneSeite: seite > 0, treffer: xs.length }
  }
  return suche(1, false) ?? suche(-1, true)
}

/** Vorgabe der Veloführung je Richtung aus OSM: Tags des Arms (Seite rechts des Verkehrs zum Knoten: gegen die Digitalisierung,
 *  wenn der Weg vom Knoten weg digitalisiert ist), Radweg daneben. -> [Führung, Quelle]
 *  gegen: Tag des Velos gegen die Einbahn (Arm mit Einbahn vom Knoten weg, netz.veloGegenTag): nur die Velos fahren zum Knoten, auf
 *  der für sie rechten Seite (aus Sicht des Autoverkehrs der linken); Radstreifen bei opposite_lane bzw. lane auf dieser Seite,
 *  Radweg bei opposite_track bzw. track (bzw. Radweg aus OSM daneben), sonst Mischverkehr */
export function veloVorgabe(t: Record<string, string>, hw: string, vomKnotenWeg: boolean, radweg: RadwegLage | null,
  gegen: string | null = null): [Velofuehrung, string] {
  const seite = vomKnotenWeg ? 'left' : 'right'
  if (gegen) return veloGegenVorgabe(t, seite, gegen, radweg)
  const tag = (k: string) => t[`cycleway:${seite}${k}`] ?? t[`cycleway:both${k}`] ?? t[`cycleway${k}`]
  const c = tag('')
  const rw = radweg ? `OSM-Weg ${radweg.id} (Radweg, ${radweg.eigeneSeite ? '' : 'gegenüber, in beiden Richtungen, '}` +
    `${String(Math.round(radweg.abstand * 10) / 10).replace('.', ',')} m neben dem Fahrbahnrand)` : ''
  if (/^motorway/.test(hw) || t.motorroad === 'yes') return ['kein', `OSM highway=${hw}${t.motorroad === 'yes' ? ', motorroad=yes' : ''}`]
  if (t.bicycle === 'no') return ['kein', 'OSM bicycle=no']
  if (c === 'lane') return ['radstreifen', `OSM cycleway${t[`cycleway:${seite}`] ? `:${seite}` : t['cycleway:both'] ? ':both' : ''}=lane`]
  if (radweg) return ['radweg', rw]
  if (c === 'track') return ['radweg', `OSM cycleway${t[`cycleway:${seite}`] ? `:${seite}` : t['cycleway:both'] ? ':both' : ''}=track (ohne eigene Linie)`]
  if (t.bicycle === 'use_sidepath') return ['radweg', 'OSM bicycle=use_sidepath (Radweg ohne eigene Linie)']
  return ['misch', 'ohne Veloanlage in OSM']
}

/** Velo gegen die Einbahn: Führung auf der Seite seite (für das Velo rechts), Quelle mit dem Tag des Gegenverkehrs */
function veloGegenVorgabe(t: Record<string, string>, seite: string, gegen: string, radweg: RadwegLage | null): [Velofuehrung, string] {
  const zusatz = `Velo gegen die Einbahn (OSM ${gegen})`
  if (t.bicycle === 'no') return ['kein', 'OSM bicycle=no']
  // cycleway=lane ohne Seite gilt auf einer Einbahn in Fahrtrichtung: nur die Seite des Gegenverkehrs bzw. opposite_*
  const k = t[`cycleway:${seite}`] !== undefined ? `cycleway:${seite}` : t['cycleway:both'] !== undefined ? 'cycleway:both' : null
  const v = k ? t[k] : undefined
  const fTag = (x: string) => (x === gegen ? `OSM ${gegen} (Velo gegen die Einbahn)` : `OSM ${x}; ${zusatz}`)
  if (v === 'lane' || v === 'opposite_lane') return ['radstreifen', fTag(`${k}=${v}`)]
  if (t.cycleway === 'opposite_lane') return ['radstreifen', fTag('cycleway=opposite_lane')]
  if (radweg?.eigeneSeite) return ['radweg', `OSM-Weg ${radweg.id} (Radweg, ${String(Math.round(radweg.abstand * 10) / 10).replace('.', ',')} m ` +
    `neben dem Fahrbahnrand); ${zusatz}`]
  if (v === 'track' || v === 'opposite_track') return ['radweg', fTag(`${k}=${v}`) + ', ohne eigene Linie']
  if (t.cycleway === 'opposite_track') return ['radweg', fTag('cycleway=opposite_track') + ', ohne eigene Linie']
  return ['misch', `ohne Gegenverkehrsstreifen in OSM; ${zusatz}`]
}

// ---------------------------------------------------------------- Trottoir neben der Fahrbahn
/** Trottoir: erster Trottoir-Punkt höchstens so weit vor bzw. hinter dem Fahrbahnrand, Trottoir höchstens TROTTOIR_BREITE_MAX breit */
const TROTTOIR_SUCHE_VON_M = -0.5
const TROTTOIR_SUCHE_BIS_M = 3.0
const TROTTOIR_BREITE_MIN = 0.8
const TROTTOIR_BREITE_MAX = 8
const TROTTOIR_LUECKE = 0.3
const TROTTOIR_SCHRITT = 0.05

/**
 * Lage der Trottoirachse neben einem Arm (Mittellinie ml vom Knoten weg) auf der Seite seite (+1 links von u, −1 rechts): je
 * Querschnitt (QUER_VON_M bis QUER_BIS_M) ab dem Fahrbahnrand (rand) nach aussen das Trottoir der AV (istTrottoir), Mitte und
 * Breite; Median über mindestens drei Querschnitte. -> { versatz (Abstand der Achse von ml, ohne Vorzeichen), breite, n } bzw. null
 */
export function trottoirNeben(ml: P[], seite: 1 | -1, rand: number, istTrottoir: (p: P) => boolean): { abstand: number; breite: number; n: number } | null {
  const ab: number[] = []
  for (let s = QUER_VON_M; s <= QUER_BIS_M + 1e-9; s += QUER_SCHRITT_M) ab.push(s)
  const mitten: number[] = [], breiten: number[] = []
  for (const [q, t] of punkteAufSpur(ml, ab)) {
    const n = links(t)
    const bei = (x: number) => istTrottoir(add(q, n, seite * x))
    let x0: number | null = null
    for (let x = rand + TROTTOIR_SUCHE_VON_M; x <= rand + TROTTOIR_SUCHE_BIS_M + 1e-9; x += TROTTOIR_SCHRITT) if (bei(x)) { x0 = x; break }
    if (x0 === null) continue
    let x1 = x0
    for (let x = x0; x <= x0 + TROTTOIR_BREITE_MAX + TROTTOIR_LUECKE; x += TROTTOIR_SCHRITT) {
      if (bei(x)) x1 = x
      else if (x - x1 > TROTTOIR_LUECKE) break
    }
    // Ränder auf 1 mm halbieren (zwischen dem letzten Punkt ausserhalb und dem ersten innerhalb)
    const grenze = (aus: number, ein: number) => { while (Math.abs(ein - aus) > 0.001) { const m = (aus + ein) / 2; if (bei(m)) ein = m; else aus = m } return ein }
    const r0 = grenze(x0 - TROTTOIR_SCHRITT, x0), r1 = grenze(x1 + TROTTOIR_SCHRITT, x1)
    const b = r1 - r0
    if (b < TROTTOIR_BREITE_MIN || b > TROTTOIR_BREITE_MAX) continue
    mitten.push((r0 + r1) / 2); breiten.push(b)
  }
  if (mitten.length < 3) return null
  return { abstand: median(mitten), breite: median(breiten), n: mitten.length }
}

/** Richtungsänderung einer Achse zwischen K und s [°] (für den Hinweis «Kurve», Ziffer 13.3) */
export function richtungsAenderung(achse: P[], s: number): number {
  const L = streckeLaenge(achse)
  if (L < 2) return 0
  const q = punkteAufSpur(achse, [0, Math.min(3, L), Math.max(0, Math.min(s, L) - 3), Math.min(s, L)])
  if (q.length < 4) return 0
  const a = einheit(sub(q[1][0], q[0][0])), b = einheit(sub(q[3][0], q[2][0]))
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180 / Math.PI
}
export const KURVE_GRAD = 20

