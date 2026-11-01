// ── Geometrie-Hilfen für die Vorbelegung aus Geodaten (Automatik Paket C, 21.10.2026) ──
//
// Alles in LV95 (Meter). Linien als Linienzüge (teile: P[][], wie die Berner Dienste und VdLinie), Flächen als flache Ringliste
// (Gerade-Ungerade-Regel wie AV-Flächen, Löcher inbegriffen). Reine Funktionen ohne Zustand; die Vorbelegungsregeln nutzen sie.

import { type P, imPolygon, abstandStrecke, segSchnitt, dist, sub, dot, add } from '../geo'

/** Liegt p in der Fläche (Ringe inkl. Löcher, Gerade-Ungerade-Regel)? */
export const inFlaeche = (p: P, ringe: readonly P[][]): boolean => imPolygon(p, ringe as P[][])

/** Erste Fläche, die p enthält, sonst null */
export function flaecheAmPunkt<T extends { ringe: P[][] }>(p: P, flaechen: readonly T[]): T | null {
  return flaechen.find(f => inFlaeche(p, f.ringe)) ?? null
}

/** Nächster Punkt einer Linie: Abstand d, Fusspunkt q, Teil- und Segmentnummer */
export interface LinienPunkt { d: number; q: P; teil: number; seg: number }

/** Nächster Punkt auf den Linienzügen zu p, null ohne Segment */
export function naechsterPunkt(p: P, teile: readonly P[][]): LinienPunkt | null {
  let best: LinienPunkt | null = null
  teile.forEach((z, ti) => {
    for (let i = 0; i + 1 < z.length; i++) {
      const a = z[i], v = sub(z[i + 1], a), l2 = dot(v, v)
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), v) / l2))
      const q = add(a, v, t), d = dist(p, q)
      if (!best || d < best.d) best = { d, q, teil: ti, seg: i }
    }
  })
  return best
}

/** Abstand von p zu den Linienzügen (Infinity ohne Segment) */
export function abstandLinie(p: P, teile: readonly P[][]): number {
  let d = Infinity
  for (const z of teile) for (let i = 0; i + 1 < z.length; i++) d = Math.min(d, abstandStrecke(p, z[i], z[i + 1]))
  return d
}

/** Abstand von p zum Rand einer Fläche (0 im Innern), Infinity ohne Ring */
export function abstandFlaeche(p: P, ringe: readonly P[][]): number {
  if (inFlaeche(p, ringe)) return 0
  let d = Infinity
  for (const r of ringe) for (let i = 0; i < r.length; i++) d = Math.min(d, abstandStrecke(p, r[i], r[(i + 1) % r.length]))
  return d
}

/** Schnitt einer Linie mit der Achse a–b: Lage p, Anteil t entlang der Achse (0 = a, 1 = b), Schnittwinkel 0–90° */
export interface AchsSchnitt { p: P; t: number; winkel: number }

/**
 * Schnitte der Linienzüge mit der Achse a–b (z. B. Streifenachse), nach t aufsteigend. verlaengerungM verlängert die Achse an
 * beiden Enden (t dann unter 0 bzw. über 1). Mehrfache Treffer am selben Ort (Stützpunkt genau auf der Achse) zählen einmal.
 */
export function achsSchnitte(teile: readonly P[][], a: P, b: P, verlaengerungM = 0): AchsSchnitt[] {
  const L = dist(a, b)
  if (!(L > 0)) return []
  const u: P = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
  const a2 = add(a, u, -verlaengerungM), b2 = add(b, u, verlaengerungM), L2 = L + 2 * verlaengerungM
  const aus: AchsSchnitt[] = []
  for (const z of teile) for (let i = 0; i + 1 < z.length; i++) {
    const s = segSchnitt(a2, b2, z[i], z[i + 1])
    if (!s) continue
    const p = add(a2, sub(b2, a2), s[0])
    const t = (s[0] * L2 - verlaengerungM) / L
    if (aus.some(x => dist(x.p, p) < 1e-6)) continue
    const v = sub(z[i + 1], z[i]), lv = Math.hypot(v[0], v[1])
    const c = lv > 0 ? Math.abs(dot(u, v)) / lv : 1
    aus.push({ p, t, winkel: Math.acos(Math.min(1, c)) * 180 / Math.PI })
  }
  return aus.sort((x, y) => x.t - y.t)
}

/** Nächste Linie zu p (höchstens maxM entfernt), mit Abstand und Fusspunkt; null ohne Linie im Abstand */
export function naechsteLinie<T extends { teile: P[][] }>(p: P, linien: readonly T[], maxM = Infinity):
  { linie: T; d: number; q: P } | null {
  let best: { linie: T; d: number; q: P } | null = null
  for (const l of linien) {
    const n = naechsterPunkt(p, l.teile)
    if (n && n.d <= maxM && (!best || n.d < best.d)) best = { linie: l, d: n.d, q: n.q }
  }
  return best
}

/** Linien im Abstand maxM um p, nach Abstand aufsteigend */
export function linienImUmkreis<T extends { teile: P[][] }>(p: P, linien: readonly T[], maxM: number): { linie: T; d: number }[] {
  return linien.map(linie => ({ linie, d: abstandLinie(p, linie.teile) })).filter(x => x.d <= maxM).sort((x, y) => x.d - y.d)
}

/**
 * Linienzüge auf das Quadrat ±halbM um mitte zuschneiden (grob): Segmente, deren Hülle das Quadrat berührt, bleiben ganz;
 * zusammenhängende Segmente bilden einen Teil. Für lange Linien (ÖV-Linien über die ganze Stadt), deren ferne Stücke nichts nützen.
 */
export function zuschneiden(teile: readonly P[][], mitte: P, halbM: number): P[][] {
  const [x0, y0, x1, y1] = [mitte[0] - halbM, mitte[1] - halbM, mitte[0] + halbM, mitte[1] + halbM]
  const trifft = (a: P, b: P) => Math.max(a[0], b[0]) >= x0 && Math.min(a[0], b[0]) <= x1 && Math.max(a[1], b[1]) >= y0 &&
    Math.min(a[1], b[1]) <= y1
  const aus: P[][] = []
  for (const z of teile) {
    let lauf: P[] = []
    for (let i = 0; i + 1 < z.length; i++) {
      if (trifft(z[i], z[i + 1])) { if (!lauf.length) lauf.push(z[i]); lauf.push(z[i + 1]) }
      else if (lauf.length) { aus.push(lauf); lauf = [] }
    }
    if (lauf.length) aus.push(lauf)
  }
  return aus
}
