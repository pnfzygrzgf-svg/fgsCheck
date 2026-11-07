// ── Welches Ebenen-Objekt liegt unter dem Zeiger? ──
// Eine Regel für alle Rechner: zuerst Punkte, dann Linien, dann von mehreren Flächen die kleinste. Gerechnet wird in LV95.

import type { KartenObjekt, P } from './modell'

/** Punkte sind kleine Ziele: Sie treffen in einem etwas grösseren Umkreis als Linien */
const PUNKT_FAKTOR = 1 / 0.7

function abstand(p: P, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1])
}
function innen(p: P, ring: readonly P[]): boolean {
  let drin = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) drin = !drin
  }
  return drin
}
const kastenFlaeche = (r: readonly P[]) => (Math.max(...r.map(p => p[0])) - Math.min(...r.map(p => p[0]))) * (Math.max(...r.map(p => p[1])) - Math.min(...r.map(p => p[1])))

/** nurLinien: über einem anklickbaren Objekt der Prüfung. Eine Fläche unter der Strasse deckte dessen Tooltip sonst immer zu */
export function trefferObjekt<T extends KartenObjekt>(liste: readonly T[], p: P, tolM: number, nurLinien = false): T | null {
  let punkt: { o: T; d: number } | null = null
  for (const o of liste) if (o.punkt) {
    const d = Math.hypot(o.punkt[0] - p[0], o.punkt[1] - p[1])
    if (d <= tolM * PUNKT_FAKTOR && (!punkt || d < punkt.d)) punkt = { o, d }
  }
  if (punkt) return punkt.o
  let linie: { o: T; d: number } | null = null
  for (const o of liste) for (const l of o.linien ?? []) for (let i = 1; i < l.length; i++) {
    const d = abstand(p, l[i - 1], l[i])
    if (d <= tolM && (!linie || d < linie.d)) linie = { o, d }
  }
  if (linie) return linie.o
  if (nurLinien) return null
  let flaeche: { o: T; a: number } | null = null
  for (const o of liste) {
    const r = o.ringe?.[0]
    if (!r || r.length < 3 || !innen(p, r)) continue
    const a = kastenFlaeche(r)
    if (!flaeche || a < flaeche.a) flaeche = { o, a }
  }
  return flaeche?.o ?? null
}
