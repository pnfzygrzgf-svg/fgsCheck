// ── Bordsteinkanten der AV und Breiten ab Kante (06.11.2026, übernommen aus VeloroutenCheck breitenmessung.ts) ──
//
// Die Bordsteinkante ist die Kante der AV-Fläche «Strasse_Weg», hinter der keine Strasse liegt. Die AV teilt eine Strasse in
// mehrere Flächen; deren gemeinsame Kanten sind keine Bordsteine und fallen weg (Prüfpunkt PRUEF_M auf der Aussenseite liegt in
// einer anderen Strassenfläche). Löcher einer Strassenfläche (Verkehrsinseln) zählen mit. Geprüft wird je Stück von höchstens
// STUECK_M: eine lange Kante, die nur auf einem Teil an eine andere Strassenfläche grenzt (Einmündung), fiele sonst ganz weg.
// Gerechnet wird in LV95 (Meter). Das Werkzeug «Messen» (messen.ts) misst damit ab einer Kante bzw. quer durch die ganze Fläche.
// Flächen (Plan) gehen über rechner/planflaechen.avMitPlan in die AV ein, die geplante Bordkante zählt also wie die bestehende.

import { type P, dist, imPolygon } from './geo'
import type { AvFlaeche } from './daten/av'

export interface Kante { a: P; b: P }

const PRUEF_M = 0.3      // Prüfpunkt beidseits der Kante: liegt die Aussenseite wieder auf Strasse?
const STUECK_M = 2
export const FANG_M = 8  // weiter weg vom Klick liegt keine Bordsteinkante, die gemeint sein kann
export const FLAECHE_MAX_M = 25   // «Ganze Fläche»: höchstens so weit bis zur gegenüberliegenden Kante

type Box = [number, number, number, number]   // minE, minN, maxE, maxN
function box(ringe: P[][]): Box {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const r of ringe) for (const [e, n] of r) { a = Math.min(a, e); b = Math.min(b, n); c = Math.max(c, e); d = Math.max(d, n) }
  return [a, b, c, d]
}
const inBox = (p: P, x: Box) => p[0] >= x[0] && p[0] <= x[2] && p[1] >= x[1] && p[1] <= x[3]

/** Bordsteinkanten = Kanten der Strassenflächen, hinter denen keine Strasse liegt; aufeinanderfolgende Bord-Stücke zusammengefügt */
export function bordkanten(flaechen: AvFlaeche[]): Kante[] {
  const strassen = flaechen.filter(f => f.art === 'Strasse_Weg' && f.ringe.length && f.ringe[0].length >= 3)
    .map(f => ({ f, box: box(f.ringe) }))
  const aus: Kante[] = []
  for (const s of strassen) {
    for (const r of s.f.ringe) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length]
        const de = b[0] - a[0], dn = b[1] - a[1], l = Math.hypot(de, dn)
        if (l < 0.05) continue
        const nx = -dn / l, ny = de / l
        const teile = Math.max(1, Math.ceil(l / STUECK_M))
        let start: P | null = null
        for (let k = 0; k < teile; k++) {
          const t0 = k / teile, t1 = (k + 1) / teile
          const p0: P = [a[0] + de * t0, a[1] + dn * t0], q1: P = [a[0] + de * t1, a[1] + dn * t1]
          const m: P = [(p0[0] + q1[0]) / 2, (p0[1] + q1[1]) / 2]
          const p1: P = [m[0] + PRUEF_M * nx, m[1] + PRUEF_M * ny], p2: P = [m[0] - PRUEF_M * nx, m[1] - PRUEF_M * ny]
          const aussen = imPolygon(p1, s.f.ringe) ? p2 : p1
          const innen = strassen.some(o => o !== s && inBox(aussen, o.box) && imPolygon(aussen, o.f.ringe))
          if (!innen) { if (!start) start = p0 }
          else if (start) { aus.push({ a: start, b: p0 }); start = null }
          if (k === teile - 1 && start) aus.push({ a: start, b: q1 })
        }
      }
    }
  }
  return aus
}

/** Nächster Punkt einer Strecke zu p */
function fusspunkt(p: P, k: Kante): { d: number; fuss: P } {
  const de = k.b[0] - k.a[0], dn = k.b[1] - k.a[1], l2 = de * de + dn * dn
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - k.a[0]) * de + (p[1] - k.a[1]) * dn) / l2))
  const fuss: P = [k.a[0] + t * de, k.a[1] + t * dn]
  return { d: Math.hypot(p[0] - fuss[0], p[1] - fuss[1]), fuss }
}

/** Punkt an eine Bordsteinkante fangen («Zwei Punkte»): ohne ersten Punkt die nächste Stelle der Kante; mit erstem Punkt (von) der
 *  Fusspunkt des Lots von ihm auf die Kante, wenn er im Fangradius liegt, damit die Messung rechtwinklig zur Kante steht.
 *  null, wenn keine Kante näher als radiusM ist. */
export function fangeAnKante(p: P, kanten: Kante[], radiusM: number, von?: P): P | null {
  let best: P | null = null, bestD = radiusM
  for (const k of kanten) {
    const de = k.b[0] - k.a[0], dn = k.b[1] - k.a[1], ll = de * de + dn * dn
    if (ll < 1e-9) continue
    const auf = (q: P): { u: number; f: P } => {
      const u = ((q[0] - k.a[0]) * de + (q[1] - k.a[1]) * dn) / ll
      return { u, f: [k.a[0] + u * de, k.a[1] + u * dn] }
    }
    const naechst = auf(p), uk = Math.max(0, Math.min(1, naechst.u))
    let q: P = [k.a[0] + uk * de, k.a[1] + uk * dn]
    if (von) { const lot = auf(von); if (lot.u >= 0 && lot.u <= 1 && dist(lot.f, p) <= radiusM) q = lot.f }
    const d = dist(q, p)
    if (d <= bestD) { bestD = d; best = q }
  }
  return best
}

/** «Ab Bordsteinkante»: kürzester Abstand vom Klick (auf der Markierung) zur nächsten Bordsteinkante, höchstens maxM */
export function messeAbKante(klick: P, kanten: Kante[], maxM = FANG_M): { breite: number; fuss: P } | null {
  let best: { d: number; fuss: P } | null = null
  for (const k of kanten) {
    const f = fusspunkt(klick, k)
    if (f.d <= maxM && (!best || f.d < best.d)) best = f
  }
  return best && { breite: best.d, fuss: best.fuss }
}

/** Abstand vom Punkt p entlang der Richtung d (Einheitsvektor) bis zur ersten Kante, oder Infinity */
function strahl(p: P, d: P, kanten: Kante[], maxM: number): number {
  let best = Infinity
  for (const k of kanten) {
    const ex = k.b[0] - k.a[0], ey = k.b[1] - k.a[1]
    const nenner = d[0] * ey - d[1] * ex
    if (Math.abs(nenner) < 1e-12) continue
    const ax = k.a[0] - p[0], ay = k.a[1] - p[1]
    const t = (ax * ey - ay * ex) / nenner        // Abstand entlang d
    const u = (ax * d[1] - ay * d[0]) / nenner    // Lage auf der Kante (0…1)
    if (t > 0 && t <= maxM && u >= 0 && u <= 1 && t < best) best = t
  }
  return best
}

/** «Ganze Fläche»: Klick in die Fahrbahn; von der nächsten Kante rechtwinklig durch den Klick bis zur gegenüberliegenden Kante */
export function messeFlaeche(klick: P, kanten: Kante[], maxM = FLAECHE_MAX_M): { breite: number; von: P; bis: P } | null {
  let best: { d: number; fuss: P } | null = null
  for (const k of kanten) {
    const f = fusspunkt(klick, k)
    if (f.d <= FANG_M && (!best || f.d < best.d)) best = f
  }
  if (!best || best.d < 0.01) return null
  const d: P = [(klick[0] - best.fuss[0]) / best.d, (klick[1] - best.fuss[1]) / best.d]
  const t = strahl(klick, d, kanten, maxM)
  if (!Number.isFinite(t)) return null
  return { breite: best.d + t, von: best.fuss, bis: [klick[0] + d[0] * t, klick[1] + d[1] * t] }
}
