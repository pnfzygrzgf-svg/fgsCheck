// ── Kurvenbogen aus einer Fahrlinie (10.11.2026, Prüfung FGS-01) ──
//
// Radius in Fahrstreifenmitte für die Strassenkurve (VSS 40 241 Ziffer 14, Tab. 2, S. 7) und die Ausfahrt aus dem Kreisel
// (bfu MS.013-2025, Abschnitt 2.2, Tabelle 1, S. 4). Die Fahrlinie ist modelliert (OSM, AV) bzw. von Hand gezeichnet; der Radius ist
// eine Schätzung aus dieser Linie. Er gilt nur, wenn der Bogen belastbar ist (lang genug, gleichmässig gekrümmt); sonst kein Radius
// und die Sichtweite nach dem Tempo (Tab. 1). Der Radius bleibt ungerundet, damit die Wahl der Tabellenstufe nicht an der Rundung
// hängt (20,4 m ist nicht 20 m); gerundet wird erst in der Anzeige.
//
// Ablauf: Fahrlinie ab dem Streifenrand (a0) alle BOGEN_SCHRITT_M abgetastet; das Kurvenende (vom Streifen aus) ist die erste Stelle,
// an der die Richtung mehr als BOGEN_ABWEICHUNG_GRAD von der Richtung am Streifen abweicht; der Bogen reicht von dort bis zur Stelle mit
// 90 % der grössten Richtungsänderung. Radius aus einer Kreisanpassung (algebraisch, kleinste Quadrate) an die Punkte des Bogens.
// Grenzen (Annahmen der App): Bogen mindestens BOGEN_MIN_M lang und mindestens BOGEN_MIN_GRAD Richtungsänderung; mittlere Abweichung
// der Punkte vom Kreis höchstens BOGEN_RMS_ANTEIL des Radius (mindestens BOGEN_RMS_MIN_M).

import { type P, add, dist, einheit, sub } from '../geo'

export const BOGEN_SCHRITT_M = 0.5
export const BOGEN_ABWEICHUNG_GRAD = 5
export const BOGEN_MIN_M = 5
export const BOGEN_MIN_GRAD = 15
export const BOGEN_RMS_ANTEIL = 0.05
export const BOGEN_RMS_MIN_M = 0.15
/** gleichmässig gekrümmt: Radien der ersten und der zweiten Bogenhälfte höchstens um diesen Faktor verschieden (Annahme; ein
 *  Übergangsbogen bleibt darunter, eine Folge zweier deutlich verschiedener Bögen nicht) */
export const BOGEN_RADIUS_VERHAELTNIS = 1.5
/** Beginn der Krümmung (Kurvenende vom Streifen aus): erste Richtungsänderung über diesem Wert [°] */
const BOGEN_BEGINN_GRAD = 0.5
/** Text der Grenzen für Annahmen und Hilfe */
export const BOGEN_ANNAHME = `Radius aus der Fahrlinie geschätzt (Kreisanpassung an den Bogen; Annahme: Bogen mindestens ${BOGEN_MIN_M} m lang und ` +
  `${BOGEN_MIN_GRAD}° Richtungsänderung, Punkte im Mittel höchstens ${Math.round(BOGEN_RMS_ANTEIL * 100)} % des Radius bzw. ` +
  `${String(BOGEN_RMS_MIN_M).replace('.', ',')} m vom Kreis entfernt, Radien der beiden Bogenhälften höchstens ${String(BOGEN_RADIUS_VERHAELTNIS).replace('.', ',')}-fach ` +
  'verschieden; sonst kein Radius)'

export interface Kurvenbogen {
  /** Abstand vom Streifenrand bis zum Kurvenende [m]; null: keine Kurve */
  endeM: number | null
  /** grösste Richtungsänderung gegenüber der Richtung am Streifen [°] */
  winkel: number
  /** Radius in Fahrstreifenmitte [m], ungerundet; null: nicht belastbar bzw. keine Kurve */
  radius: number | null
  /** Grund, wenn kein Radius vorliegt */
  grund: string | null
}

const laenge = (l: readonly P[]) => l.slice(1).reduce((s, q, i) => s + dist(l[i], q), 0)
function punktBei(l: readonly P[], x: number): P {
  let s = 0
  for (let i = 1; i < l.length; i++) {
    const d = dist(l[i - 1], l[i])
    if (d > 0 && x <= s + d) return add(l[i - 1], sub(l[i], l[i - 1]), (x - s) / d)
    s += d
  }
  return l[l.length - 1]
}
/** Lage des Punkts p auf der Linie als Abstand ab ihrem Anfang (nächster Punkt) */
export function lageAufLinie(l: readonly P[], p: P): number {
  let best = Infinity, a = 0, s = 0
  for (let i = 1; i < l.length; i++) {
    const u = sub(l[i], l[i - 1]), d = Math.hypot(u[0], u[1])
    if (d <= 0) continue
    const t = Math.max(0, Math.min(1, ((p[0] - l[i - 1][0]) * u[0] + (p[1] - l[i - 1][1]) * u[1]) / (d * d)))
    const e = dist(p, add(l[i - 1], u, t))
    if (e < best) { best = e; a = s + t * d }
    s += d
  }
  return a
}

/** Punkte der Linie ab Abstand von, alle schritt Meter, höchstens bis bis (bzw. bis zum Ende) */
export function abtasten(l: readonly P[], von: number, bis: number, schritt: number): P[] {
  const ende = Math.min(bis, laenge(l)), aus: P[] = []
  for (let x = von; x <= ende + 1e-9; x += schritt) aus.push(punktBei(l, x))
  return aus
}

/** Kreis durch die Punkte (algebraisch, kleinste Quadrate); null bei (fast) geraden Punkten */
export function kreisAnpassen(pts: readonly P[]): { mitte: P; radius: number; rms: number } | null {
  const n = pts.length
  if (n < 3) return null
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n
  let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0, sx = 0, sy = 0
  for (const p of pts) {
    const x = p[0] - mx, y = p[1] - my, z = x * x + y * y
    sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; sx += x; sy += y
  }
  // Normalgleichungen für x² + y² + D x + E y + F = 0
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], b = [-sxz, -syz, -sz]
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const d0 = det(A)
  if (Math.abs(d0) < 1e-9) return null
  const spalte = (k: number) => det(A.map((r, i) => r.map((v, j) => (j === k ? b[i] : v))))
  const D = spalte(0) / d0, E = spalte(1) / d0, F = spalte(2) / d0
  const r2 = (D * D + E * E) / 4 - F
  if (!(r2 > 0)) return null
  const mitte: P = [mx - D / 2, my - E / 2], radius = Math.sqrt(r2)
  const rms = Math.sqrt(pts.reduce((s, p) => s + (dist(p, mitte) - radius) ** 2, 0) / n)
  return { mitte, radius, rms }
}

/** Kurvenbogen der Fahrlinie linie (beginnt am Streifen, gegen die Fahrtrichtung) ab Abstand a0, höchstens bis a0 + bis */
export function kurvenbogen(linie: readonly P[], a0: number, bis: number): Kurvenbogen | null {
  if (linie.length < 2) return null
  const ende = Math.min(a0 + bis, laenge(linie))
  const pts: P[] = []
  for (let x = a0; x <= ende + 1e-9; x += BOGEN_SCHRITT_M) pts.push(punktBei(linie, x))
  if (pts.length < 3) return null
  const richtung = (i: number) => { const u = einheit(sub(pts[i + 1], pts[i])); return Math.atan2(u[1], u[0]) * 180 / Math.PI }
  let kEnde: number | null = null, winkel = 0, acc = 0
  const accs: number[] = [0]
  for (let i = 1; i < pts.length - 1; i++) {
    let d = richtung(i) - richtung(i - 1)
    while (d > 180) d -= 360
    while (d < -180) d += 360
    acc += d
    accs.push(acc)
    if (Math.abs(acc) > winkel) winkel = Math.abs(acc)
    if (kEnde === null && Math.abs(acc) > BOGEN_ABWEICHUNG_GRAD) kEnde = i
  }
  // Kurvenende (vom Streifen aus): wo die Krümmung beginnt, nicht erst die Abweichung über BOGEN_ABWEICHUNG_GRAD
  const kBeginn = kEnde === null ? null : Math.max(1, accs.findIndex(x => Math.abs(x) > BOGEN_BEGINN_GRAD))
  const endeM = kBeginn === null ? null : (kBeginn - 1) * BOGEN_SCHRITT_M
  const aus = (grund: string): Kurvenbogen => ({ endeM, winkel, radius: null, grund })
  if (kEnde === null || winkel < BOGEN_MIN_GRAD) return aus('keine Kurve')
  const j = accs.findIndex(x => Math.abs(x) >= 0.9 * winkel)
  const i0 = Math.max(0, kEnde - 1)
  const bogen = pts.slice(i0, j + 2)
  if ((bogen.length - 1) * BOGEN_SCHRITT_M < BOGEN_MIN_M - 1e-9) return aus('Bogen zu kurz bzw. eckig')
  const k = kreisAnpassen(bogen)
  if (!k) return aus('Bogen nicht auswertbar')
  if (k.rms > Math.max(BOGEN_RMS_MIN_M, BOGEN_RMS_ANTEIL * k.radius)) return aus('Bogen ungleichmässig gekrümmt')
  // zwei Hälften: bei (fast) geraden Hälften (lockere Stützpunkte) entfällt der Vergleich
  const h = Math.floor(bogen.length / 2), a = kreisAnpassen(bogen.slice(0, h + 1)), b = kreisAnpassen(bogen.slice(h))
  if (a && b && Math.max(a.radius, b.radius) / Math.min(a.radius, b.radius) > BOGEN_RADIUS_VERHAELTNIS) return aus('Bogen ungleichmässig gekrümmt')
  return { endeM, winkel, radius: k.radius, grund: null }
}
