// ── Spur von Hand (fgs_sicht_pruefen.py SPUR_HAND, karte_vorlage.html: spurVersetzen, spurPunkteB, linieKreis, swAusRadius) ──
//
// A: jeder berechnete Sichtpunkt quer zur Fahrlinie versetzt, am ersten um a, am letzten um b (m, + nach links in
// Fahrtrichtung), dazwischen linear nach der Länge (nur gerade Zufahrten).
// B: Sichtpunkte entlang einer gezeichneten Linie (erster Punkt am Streifen), alle 2 m bis zur Sichtweite, kürzere Linie gerade
// verlängert. Abbiegende zusätzlich mit Radius von Hand (Vorschlag: Kreis durch den Bogen der Linie); dann gilt die Sichtweite
// aus diesem Radius wie in der Rechnung (sichtweite_radius_hand).

import { type P, add, dist, einheit, rechts } from '../geo'
import { kreisAnpassen, kreisResiduum, SCHRITT } from './spur'
import { sichtweiteKurve, sichtweiteTab1 } from './tempo'

export type SpurHand = { art: 'A'; a: number; b: number } | { art: 'B'; linie: P[]; radius?: number | null }

export const RADIUS_HAND_M: [number, number] = [3.0, 60.0]
const LINIE_RICHTUNG_M = 1.0
const LINIE_KNICK_GRAD = 8.0
const LINIE_KREIS_UNSICHER_M = 0.5

/** spur_normalen: Einheitsnormale nach links zur Fahrt je Sichtpunkt (Punkte laufen gegen die Fahrt) */
export function spurNormalen(pts: P[]): P[] | null {
  const out: (P | null)[] = []
  let vor: P | null = null
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(k - 1, 0)], b = pts[Math.min(k + 1, pts.length - 1)]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (l > 1e-6) vor = rechts([(b[0] - a[0]) / l, (b[1] - a[1]) / l])
    out.push(vor)
  }
  const erste = out.find(v => v !== null) ?? null
  return erste === null ? null : out.map(v => v ?? erste)
}

/** spur_versetzen (Variante A) */
export function spurVersetzen(pts: P[], a: number, b: number): P[] {
  if (pts.length < 2) return [...pts]
  const s = [0]
  for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + dist(pts[k - 1], pts[k]))
  const nrm = spurNormalen(pts)
  if (nrm === null || s[s.length - 1] <= 0) return [...pts]
  return pts.map((p, k) => add(p, nrm[k], a + (b - a) * s[k] / s[s.length - 1]))
}

/** linie_punkte (Variante B) -> [Sichtpunkte, Länge der Linie] */
export function liniePunkte(linie: P[], sw: number, schritt = SCHRITT): [P[], number] {
  const s = [0]
  for (let k = 1; k < linie.length; k++) s.push(s[k - 1] + dist(linie[k - 1], linie[k]))
  const abst: number[] = []
  for (let k = 0; k <= Math.floor(sw / schritt + 1e-9); k++) abst.push(k * schritt)
  if (sw - abst[abst.length - 1] > 1e-9) abst.push(sw)
  const paare: [P, P][] = []
  for (let k = linie.length - 2; k >= 0; k--) paare.push([linie[k], linie[k + 1]])
  let letzte = paare.find(([p, q]) => dist(p, q) >= LINIE_RICHTUNG_M) ??
    (paare.length ? paare.reduce((b, pq) => (dist(...pq) > dist(...b) ? pq : b)) : null)
  if (letzte && dist(...letzte) <= 1e-6) letzte = null
  const r: P = letzte ? einheit([letzte[1][0] - letzte[0][0], letzte[1][1] - letzte[0][1]]) : [0, 0]
  const out: P[] = []
  let k = 0
  const L = s[s.length - 1]
  for (const a of abst) {
    if (a >= L) { out.push(add(linie[linie.length - 1], r, a - L)); continue }
    while (s[k + 1] < a) k++
    const f = s[k + 1] > s[k] ? (a - s[k]) / (s[k + 1] - s[k]) : 0
    out.push([linie[k][0] + (linie[k + 1][0] - linie[k][0]) * f, linie[k][1] + (linie[k + 1][1] - linie[k][1]) * f])
  }
  return [out, L]
}

export interface LinieKreis { r: number | null; n?: number; abw?: number; sicher?: boolean; text: string }

/** linie_kreis: Radius aus dem Bogenteil der gezeichneten Linie (Vorschlag für «Radius übernehmen») */
export function linieKreis(linie: P[]): LinieKreis {
  const pts: P[] = []
  for (const p of linie) if (!pts.length || dist(pts[pts.length - 1], p) >= 0.05) pts.push(p)
  if (pts.length < 3) return { r: null, text: 'kein Radius bestimmbar: nur 2 Stützpunkte' }
  const dreh: number[] = []
  for (let k = 0; k < pts.length - 2; k++) {
    const [a, b, c] = [pts[k], pts[k + 1], pts[k + 2]]
    const h0 = Math.atan2(b[1] - a[1], b[0] - a[0]), h1 = Math.atan2(c[1] - b[1], c[0] - b[0])
    dreh.push(((((h1 - h0 + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * 180 / Math.PI)
  }
  const knick = dreh.map((x, k) => (Math.abs(x) >= LINIE_KNICK_GRAD ? k + 1 : -1)).filter(k => k >= 0)
  if (!knick.length) return { r: null, text: 'kein Radius bestimmbar: Linie ohne Bogen' }
  const [i0, i1] = knick[knick.length - 1] - knick[0] >= 2 ? [knick[0], knick[knick.length - 1]] : [knick[0] - 1, knick[knick.length - 1] + 1]
  const bogen = pts.slice(i0, i1 + 1)
  const kreis = kreisAnpassen(bogen)
  if (kreis === null) return { r: null, text: 'kein Radius bestimmbar' }
  const abw = kreisResiduum(kreis, bogen)
  let gesamt = 0
  for (let k = Math.max(i0, 1); k <= Math.min(i1, pts.length - 2); k++) gesamt += dreh[k - 1]
  if (Math.abs(gesamt) < LINIE_KNICK_GRAD) return { r: null, text: `kein Radius bestimmbar: Linie dreht insgesamt nur ${Math.abs(gesamt).toFixed(0)}°` }
  const sicher = bogen.length >= 4 && abw <= LINIE_KREIS_UNSICHER_M
  const text = (sicher ? 'sicher' : 'unsicher') + (bogen.length < 4 ? `: nur ${bogen.length} Punkte im Bogen` :
    `: ${bogen.length} Punkte im Bogen`) + `, Abweichung höchstens ${abw.toFixed(1)} m, Drehung ${Math.abs(gesamt).toFixed(0)}°`
  return { r: kreis[1], n: bogen.length, abw, sicher, text: text.replace('.', ',') }
}

/** sichtweite_radius_hand -> [Sichtweite, Quelle] */
export function sichtweiteRadiusHand(radius: number, sw: number, quelle: string, tempo: number, bisKnoten: number | null = null,
  swEigen: number | null = null, quelleKnoten: string | null = null): [number, string] {
  let [swK, qK] = sichtweiteKurve(radius)
  const tab1 = sichtweiteTab1(tempo)
  if (swK === null || swK >= tab1) { swK = tab1; qK = 'VSS Tab. 1' }
  if (quelle === 'bis Knoten (Strassenende)' || quelle === 'bis Wegende') return swK < sw ? [swK, qK!] : [sw, quelle]
  const knoten = quelle.startsWith('bis Knoten')
  if (bisKnoten !== null) {
    if (bisKnoten > swK) return knoten ? [sw, quelle] : [Math.min(Math.ceil(bisKnoten), swEigen!), quelleKnoten!]
    return [swK, qK!]
  }
  if (['bfu', 'VSS Tab. 2', 'VSS Tab. 1'].includes(quelle)) return [swK, qK!]
  if (knoten) return swK > sw ? [swK, qK!] : [sw, quelle]
  return swK < sw ? [swK, qK!] : [sw, quelle]
}
