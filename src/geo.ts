// ── Koordinaten und ebene Geometrie ──
//
// Gerechnet wird in LV95 (Meter, E/N). WGS84 nur für die Kartenanzeige und für OSM.
// Seit E1 strenge Umrechnung wie GDAL/PROJ (EPSG:4326 ↔ EPSG:2056) im Berner Projekt: Datumsübergang WGS84 ↔ CH1903+
// über die geozentrische Verschiebung (674,374 / 15,056 / 405,346 m), Bessel-Ellipsoid, schiefachsige winkeltreue
// Zylinderprojektion (Formeln swisstopo). Genauigkeit im Millimeterbereich; die Näherungsformeln von E0 (rund 1 m) legten
// OSM und AV gegeneinander verschoben.

export type P = [number, number]           // LV95 [E, N]
export type LL = [number, number]          // WGS84 [lat, lon]

const RAD = Math.PI / 180
// WGS84
const A_W = 6378137.0, F_W = 1 / 298.257223563, E2_W = 2 * F_W - F_W * F_W
// Bessel 1841 (CH1903+)
const A_B = 6377397.155, F_B = 1 / 299.1528128, E2_B = 2 * F_B - F_B * F_B, E_B = Math.sqrt(E2_B)
const DX = 674.374, DY = 15.056, DZ = 405.346              // CH1903+ -> WGS84 (ECEF)
// Projektionszentrum Bern
const PHI0 = (46 + 57 / 60 + 8.66 / 3600) * RAD, LAM0 = (7 + 26 / 60 + 22.5 / 3600) * RAD
const R_K = A_B * Math.sqrt(1 - E2_B) / (1 - E2_B * Math.sin(PHI0) ** 2)
const ALPHA = Math.sqrt(1 + E2_B / (1 - E2_B) * Math.cos(PHI0) ** 4)
const B0 = Math.asin(Math.sin(PHI0) / ALPHA)
const K_K = Math.log(Math.tan(Math.PI / 4 + B0 / 2)) - ALPHA * Math.log(Math.tan(Math.PI / 4 + PHI0 / 2)) +
  ALPHA * E_B / 2 * Math.log((1 + E_B * Math.sin(PHI0)) / (1 - E_B * Math.sin(PHI0)))

function zuEcef(phi: number, lam: number, a: number, e2: number): [number, number, number] {
  const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)
  return [n * Math.cos(phi) * Math.cos(lam), n * Math.cos(phi) * Math.sin(lam), n * (1 - e2) * Math.sin(phi)]
}

function ausEcef(x: number, y: number, z: number, a: number, e2: number): [number, number] {
  const lam = Math.atan2(y, x), p = Math.hypot(x, y)
  let phi = Math.atan2(z, p * (1 - e2))
  for (let i = 0; i < 8; i++) {
    const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)
    const h = p / Math.cos(phi) - n
    phi = Math.atan2(z, p * (1 - e2 * n / (n + h)))
  }
  return [phi, lam]
}

/** WGS84 (Grad) -> LV95 [E, N] (streng, Höhe 0 wie PROJ in 2D). */
export function lv95(lat: number, lon: number): P {
  const [xw, yw, zw] = zuEcef(lat * RAD, lon * RAD, A_W, E2_W)
  const [phi, lam] = ausEcef(xw - DX, yw - DY, zw - DZ, A_B, E2_B)
  const s = ALPHA * Math.log(Math.tan(Math.PI / 4 + phi / 2)) -
    ALPHA * E_B / 2 * Math.log((1 + E_B * Math.sin(phi)) / (1 - E_B * Math.sin(phi))) + K_K
  const b = 2 * (Math.atan(Math.exp(s)) - Math.PI / 4)
  const l = ALPHA * (lam - LAM0)
  const lq = Math.atan(Math.sin(l) / (Math.sin(B0) * Math.tan(b) + Math.cos(B0) * Math.cos(l)))
  const bq = Math.asin(Math.cos(B0) * Math.sin(b) - Math.sin(B0) * Math.cos(b) * Math.cos(l))
  const y = R_K * lq, x = R_K / 2 * Math.log((1 + Math.sin(bq)) / (1 - Math.sin(bq)))
  return [y + 2600000, x + 1200000]
}

/** LV95 -> WGS84 [lat, lon] (Grad; strenge Umkehrung von lv95). */
export function wgs(e: number, n: number): LL {
  const y = e - 2600000, x = n - 1200000
  const lq = y / R_K
  const bq = 2 * (Math.atan(Math.exp(x / R_K)) - Math.PI / 4)
  const b = Math.asin(Math.cos(B0) * Math.sin(bq) + Math.sin(B0) * Math.cos(bq) * Math.cos(lq))
  const l = Math.atan(Math.sin(lq) / (Math.cos(B0) * Math.cos(lq) - Math.sin(B0) * Math.tan(bq)))
  const lam = LAM0 + l / ALPHA
  let phi = b
  for (let i = 0; i < 10; i++) {
    const s = (Math.log(Math.tan(Math.PI / 4 + b / 2)) - K_K) / ALPHA +
      E_B * Math.log(Math.tan(Math.PI / 4 + Math.asin(E_B * Math.sin(phi)) / 2))
    phi = 2 * Math.atan(Math.exp(s)) - Math.PI / 2
  }
  const [xb, yb, zb] = zuEcef(phi, lam, A_B, E2_B)
  const [p2, l2] = ausEcef(xb + DX, yb + DY, zb + DZ, A_W, E2_W)
  return [p2 / RAD, l2 / RAD]
}

/** BBOX-Teil einer WFS-Abfrage in LV95 (Achsenfolge E,N, auf den Meter) für ±radiusM um den Ort (Parkfelder, Baumkataster) */
export function bboxLv95(lat: number, lon: number, radiusM: number): string {
  const [e, n] = lv95(lat, lon)
  return [e - radiusM, n - radiusM, e + radiusM, n + radiusM].map(v => v.toFixed(0)).join(',') + ',urn:ogc:def:crs:EPSG::2056'
}

// ── Vektoren ──
export const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
/** add(p, v, f) = p + v·f (wie add in fgs_sicht_pruefen.py) */
export const add = (a: P, b: P, f = 1): P => [a[0] + b[0] * f, a[1] + b[1] * f]
export const dist = (a: P, b: P): number => Math.hypot(a[0] - b[0], a[1] - b[1])
export const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1]
export const kreuz = (a: P, b: P): number => a[0] * b[1] - a[1] * b[0]
export const neg = (a: P): P => [-a[0], -a[1]]
/** Einheitsvektor; Nullvektor bleibt (0, 0) (wie fgs_netz.norm). */
export const einheit = (a: P): P => { const l = Math.hypot(a[0], a[1]); return l ? [a[0] / l, a[1] / l] : [0, 0] }
/** Normale links von a (90° gegen den Uhrzeigersinn). */
export const links = (a: P): P => [-a[1], a[0]]
/** Normale rechts von a (wie rechts(d) in fgs_sicht_pruefen.py). */
export const rechts = (a: P): P => [a[1], -a[0]]

/** Richtung als mathematischer Winkel in Grad (Ost = 0, gegen den Uhrzeigersinn), 0–360. */
export function winkelGrad(a: P): number {
  const w = Math.atan2(a[1], a[0]) * 180 / Math.PI
  return (w + 360) % 360
}

/** Python-round (halbe Werte zur geraden Zahl) für ganze Zahlen. */
export function pyRound(x: number): number {
  const f = Math.floor(x), d = x - f
  if (Math.abs(d - 0.5) < 1e-12) return f % 2 === 0 ? f : f + 1
  return Math.round(x)
}

/** Richtung in ganzen Grad wie richtung_grad (fgs_netz/fgs_sicht_pruefen): round(deg % 360) */
export function richtungGrad(v: P): number {
  const g = ((Math.atan2(v[1], v[0]) * 180 / Math.PI) % 360 + 360) % 360
  return pyRound(g)
}

/** Winkel zwischen zwei Richtungen (°, 0–180), fgs_netz.wdiff */
export function wdiff(a: P, b: P): number {
  const x = Math.max(-1, Math.min(1, dot(einheit(a), einheit(b))))
  return Math.acos(x) * 180 / Math.PI
}

/** Vorzeichenbehafteter Winkel von «von» nach «nach» (°, + links), fgs_netz.drehung */
export function drehung(von: P, nach: P): number {
  return Math.atan2(kreuz(von, nach), dot(von, nach)) * 180 / Math.PI
}

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
 * Schnitte der Geraden o + t·d mit allen Kanten der Ringe; Rückgabe: Parameter t (sortiert).
 * d muss nicht Einheitsvektor sein; t ist dann in Vielfachen von |d|.
 */
export function geradeSchnitte(o: P, d: P, ringe: P[][]): number[] {
  const ts: number[] = []
  for (const r of ringe) {
    for (let i = 0; i < r.length - 1; i++) {
      const a = r[i], b = r[i + 1], e = sub(b, a)
      const nenner = kreuz(d, e)
      if (Math.abs(nenner) < 1e-12) continue
      const ao = sub(a, o)
      const t = kreuz(ao, e) / nenner
      const s = kreuz(ao, d) / nenner
      if (s >= 0 && s <= 1) ts.push(t)
    }
  }
  return ts.sort((x, y) => x - y)
}

/** Schneiden sich die Strecken ab und cd? */
export function streckenSchnitt(a: P, b: P, c: P, d: P): boolean {
  const d1 = kreuz(sub(b, a), sub(c, a)), d2 = kreuz(sub(b, a), sub(d, a))
  const d3 = kreuz(sub(d, c), sub(a, c)), d4 = kreuz(sub(d, c), sub(b, c))
  return d1 * d2 < 0 && d3 * d4 < 0
}

/** fgs_netz.seg_schnitt: Parameter (t, u) des Schnitts der Strecken ab und cd oder null. */
export function segSchnitt(a: P, b: P, c: P, d: P): [number, number] | null {
  const r: P = [b[0] - a[0], b[1] - a[1]], s: P = [d[0] - c[0], d[1] - c[1]]
  const den = kreuz(r, s)
  if (Math.abs(den) < 1e-12) return null
  const q: P = [c[0] - a[0], c[1] - a[1]]
  const t = kreuz(q, s) / den, u = kreuz(q, r) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null
}

/** Berührt das Dreieck (konvex) das Polygon? Prüft Ecken gegenseitig und Kantenschnitte. */
export function dreieckTrifftPolygon(dr: [P, P, P], ringe: P[][]): boolean {
  if (dr.some(p => imPolygon(p, ringe))) return true
  const drRing: P[] = [...dr, dr[0]]
  for (const r of ringe) {
    if (r.some(p => imPolygon(p, [drRing]))) return true
    for (let i = 0; i < r.length - 1; i++)
      for (let k = 0; k < 3; k++)
        if (streckenSchnitt(r[i], r[i + 1], drRing[k], drRing[k + 1])) return true
  }
  return false
}

/** Abstand von p zur Strecke ab */
export function abstandStrecke(p: P, a: P, b: P): number {
  const v = sub(b, a), l2 = dot(v, v)
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), v) / l2))
  return dist(p, add(a, v, t))
}

/**
 * Kleinster Kreis um Punkte (Welzl, iterativ) -> Mitte und Radius, null ohne Punkte. Gerechnet relativ zum ersten Punkt
 * (LV95-Koordinaten um 2,6 Mio. m machen die Umkreis-Formel sonst ungenau); die Punkte in fester Pseudo-Zufallsfolge (gleiche
 * Eingabe, gleiches Ergebnis; erwartet linear statt kubisch bei ungünstiger Reihenfolge).
 */
export function kleinsterKreis(punkte: P[]): { m: P; r: number } | null {
  if (!punkte.length) return null
  const o = punkte[0]
  const q = punkte.map((p): P => [p[0] - o[0], p[1] - o[1]])
  let s = 1
  for (let i = q.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647                     // Park–Miller
    const j = s % (i + 1); [q[i], q[j]] = [q[j], q[i]]
  }
  type K = { m: P; r: number }
  const drin = (k: K, p: P) => dist(k.m, p) <= k.r + 1e-7
  const zwei = (a: P, b: P): K => ({ m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r: dist(a, b) / 2 })
  const drei = (a: P, b: P, c: P): K => {
    const bx = b[0] - a[0], by = b[1] - a[1], cx = c[0] - a[0], cy = c[1] - a[1], d = 2 * (bx * cy - by * cx)
    // auf einer Geraden: Kreis über die beiden äussersten
    if (Math.abs(d) < 1e-12) return [zwei(a, b), zwei(a, c), zwei(b, c)].reduce((x, y) => (y.r > x.r ? y : x))
    const b2 = bx * bx + by * by, c2 = cx * cx + cy * cy
    const ux = (cy * b2 - by * c2) / d, uy = (bx * c2 - cx * b2) / d
    return { m: [a[0] + ux, a[1] + uy], r: Math.hypot(ux, uy) }
  }
  let k: K = { m: q[0], r: 0 }
  for (let i = 1; i < q.length; i++) {
    if (drin(k, q[i])) continue
    k = { m: q[i], r: 0 }
    for (let j = 0; j < i; j++) {
      if (drin(k, q[j])) continue
      k = zwei(q[i], q[j])
      for (let l = 0; l < j; l++) if (!drin(k, q[l])) k = drei(q[i], q[j], q[l])
    }
  }
  return { m: [k.m[0] + o[0], k.m[1] + o[1]], r: k.r }
}

/** statistics.median */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b), n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}
