// ── Ebene Geometrie in LV95 (gemeinsamer Baustein seit 13.11.2026 abends) ──
// Vektoren, Punkt im Polygon und Schnitt einer Geraden mit einem Polygon bzw. mit Linien. Bis dahin in fgsCheck src/geo.ts bzw.
// src/rechner/flaechen.ts; dort jetzt aus dem Baustein weitergereicht, damit alle Rechner dieselbe Rechnung haben.
// Polygone als Ringlisten: Ring 0 aussen, weitere Ringe Löcher (Gerade-Ungerade-Regel über alle Ringe).

export type P = [number, number]           // LV95 [E, N]

export const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
/** add(p, v, f) = p + v·f (wie add in fgs_sicht_pruefen.py) */
export const add = (a: P, b: P, f = 1): P => [a[0] + b[0] * f, a[1] + b[1] * f]
export const dist = (a: P, b: P): number => Math.hypot(a[0] - b[0], a[1] - b[1])
export const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1]
export const kreuz = (a: P, b: P): number => a[0] * b[1] - a[1] * b[0]
/** Einheitsvektor; Nullvektor bleibt (0, 0) (wie fgs_netz.norm). */
export const einheit = (a: P): P => { const l = Math.hypot(a[0], a[1]); return l ? [a[0] / l, a[1] / l] : [0, 0] }
/** Normale links von a (90° gegen den Uhrzeigersinn). */
export const links = (a: P): P => [-a[1], a[0]]

/** Punkt im Polygon (Ring ohne Wiederholung des ersten Punkts nötig; Gerade-Ungerade-Regel über alle Ringe). */
export function imPolygon(pt: P, ringe: P[][]): boolean {
  let innen = false
  for (const r of ringe) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j]
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) innen = !innen
    }
  }
  return innen
}

/**
 * Wie imPolygon, mit demselben Ergebnis, aber schnell bei vielen Abfragen auf dieselbe Fläche (17.11.2026): Die Gerade-Ungerade-Regel
 * zählt nur Kanten, deren Höhenbereich den Punkt überdeckt (min(yi, yj) ≤ y < max(yi, yj)). Diese Kanten liegen je Fläche einmal nach
 * waagrechten Streifen von STREIFEN_M vorsortiert bereit (gemerkt am Array der Ringe), geprüft wird mit genau derselben Bedingung.
 * Die Bordkanten fragen je 2-m-Stück zwei Punkte gegen lange Strassenflächen ab; mit imPolygon kostete das im VeloroutenCheck beim
 * Übernehmen einer Strecke rund 90 % der Rechenzeit.
 */
export function imPolygonSchnell(pt: P, ringe: P[][]): boolean {
  let idx = STREIFEN_INDEX.get(ringe)
  if (!idx) { idx = streifenIndex(ringe); STREIFEN_INDEX.set(ringe, idx) }
  const k = idx.get(Math.floor(pt[1] / STREIFEN_M))
  let innen = false
  if (k) for (let n = 0; n < k.length; n += 4) {
    const xi = k[n], yi = k[n + 1], xj = k[n + 2], yj = k[n + 3]
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) innen = !innen
  }
  return innen
}
const STREIFEN_M = 4
const STREIFEN_INDEX = new WeakMap<P[][], Map<number, number[]>>()
function streifenIndex(ringe: P[][]): Map<number, number[]> {
  const idx = new Map<number, number[]>()
  for (const r of ringe) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j]
      if (yi === yj) continue                     // waagrechte Kante: die Bedingung trifft nie zu
      const k0 = Math.floor(Math.min(yi, yj) / STREIFEN_M), k1 = Math.floor(Math.max(yi, yj) / STREIFEN_M)
      for (let k = k0; k <= k1; k++) { let l = idx.get(k); if (!l) idx.set(k, l = []); l.push(xi, yi, xj, yj) }
    }
  }
  return idx
}

/**
 * Schnitte der Geraden o + t·r mit Polylinien (seit 13.11.2026 spät, Plan AV-Geometrie A6): Parameter t aller Schnittpunkte, aufsteigend.
 * Beispiel: o (0, 0), r (0, 1), Linien [(−5, 4)–(5, 4)] und [(−5, −4)–(5, −4)] → [−4, 4].
 */
export function geradeSchnitte(o: P, r: P, linien: readonly (readonly P[])[]): number[] {
  const ts: number[] = []
  for (const l of linien) for (let i = 1; i < l.length; i++) {
    const a = l[i - 1], e = sub(l[i], a), den = kreuz(r, e)
    if (Math.abs(den) < 1e-12) continue
    const w = sub(a, o), t = kreuz(w, e) / den, u = kreuz(w, r) / den
    if (u >= -1e-9 && u <= 1 + 1e-9) ts.push(t)
  }
  return ts.sort((x, y) => x - y)
}

/** Intervalle [t0, t1] der Geraden p + t·r (|t| ≤ halb) innerhalb des Polygons (OGR Intersection einer Linie) */
export function intervalleImPolygon(p: P, r: P, halb: number, poly: P[][]): [number, number][] {
  const ts = [-halb, halb]
  for (const ring of poly) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], e = sub(b, a)
    const den = kreuz(r, e)
    if (Math.abs(den) < 1e-12) continue
    const q = sub(a, p), t = kreuz(q, e) / den, u = kreuz(q, r) / den
    if (u >= 0 && u <= 1 && t > -halb && t < halb) ts.push(t)
  }
  ts.sort((x, y) => x - y)
  const out: [number, number][] = []
  for (let i = 0; i < ts.length - 1; i++) {
    if (ts[i + 1] - ts[i] < 1e-9) continue
    const m = (ts[i] + ts[i + 1]) / 2
    if (imPolygon(add(p, r, m), poly)) {
      const l = out[out.length - 1]
      if (l && Math.abs(l[1] - ts[i]) < 1e-9) l[1] = ts[i + 1]
      else out.push([ts[i], ts[i + 1]])
    }
  }
  return out
}
