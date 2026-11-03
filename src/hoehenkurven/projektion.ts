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

