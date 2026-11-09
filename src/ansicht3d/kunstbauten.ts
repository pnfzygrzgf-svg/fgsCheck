// ── 3D-Ansicht: Ebene Kunstbauten des 3D-Stadtmodells Stadt Bern als Dreiecksnetz, ohne Cesium ──
//
// Produkt: https://map.bern.ch/geoportal/#/produkt/3D_Stadtmodell (Zugangsstufe A; wichtigste Brücken und einzelne Spezialbauten).
// Katalogstand 30.05.2023; Erfassungsstand einzelner Bauwerke unbekannt. Gleichnamiger Bauwerkskataster «Kunstbauten»: anderes Produkt (Stufe B).
// Quelle: Geodaten Stadt Bern, gisapp.bern.ch …/StadtBern_Kunstbauten/FeatureServer/0 (MultiPatch, 42 Bauwerke, LV95, Höhen LN02).
// Der Szenendienst derselben Daten (I3S) liegt in LV95 und ist darum in Cesium nicht ladbar (Cesium-I3S nimmt nur WGS84); die
// Abfrage des FeatureServers mit multipatchOption=stripMaterials liefert je Bauwerk «binaryPatches»: Base64, 12 Byte Kopf (Typ,
// Länge entpackt, Länge gepackt) und zlib-Daten; entpackt ein Esri-Shape-Puffer (MultiPatch: Teile, Teiltypen, Punkte, z).
// Teiltypen: 0 Dreiecksstreifen, 1 Dreiecksfächer, 2 äusserer Ring, 3 innerer Ring (Loch, übergangen), 4 erster Ring, 5 Ring,
// 6 Dreiecke. Ringe werden als Fächer zerlegt (in den Berner Daten sind es Dreiecke mit Schlusspunkt).

import { BERN_DTM_RECHTECK } from '../daten/bernDtm'
import { abstandStrecke, type P } from '../geo'

export const KUNSTBAUTEN_URL = 'https://gisapp.bern.ch/server/rest/services/StadtBern_Kunstbauten/FeatureServer/0/query'
/** Abfragerechteck ±so viel um den Streifen [m], wie die AV (abdeckung.AV_RADIUS_M) */
export const KUNSTBAUTEN_RADIUS_M = 150
/** Höhe in der 3D-Ansicht = LN02 + so viel [m]. Die swisstopo-Kacheln (terrain.3d, swissBUILDINGS3D) tragen Landeshöhen, keine
 *  Ellipsoidhöhen: am Klösterlistutz liefert terrain.3d 504,32 m, das DTM 2023 der Stadt (LN02) 504,18 m (gemessen 09.11.2026).
 *  LN02 → LHN95 nach swisstopo REFRAME dort −0,04 m (Annahme: in der Stadt Bern konstant). */
export const LN02_ZU_SZENE_M = -0.04

/** Bauwerk: Name und Dreiecke (je drei Punkte, flach x, y, z in LV95/LN02) */
export interface Kunstbaute { name: string; dreiecke: Float64Array }

/** Liegt der Punkt (LV95) im Gebiet, für das die Stadt Bern Kunstbauten führt (Rechteck des DTM 2023)? */
export function inBern(p: P): boolean {
  const [w, s, o, n] = BERN_DTM_RECHTECK
  return p[0] >= w && p[0] <= o && p[1] >= s && p[1] <= n
}

/** Abfrage aller Kunstbauten, die das Rechteck ±radius um p (LV95) schneiden */
export function kunstbautenUrl(p: P, radius = KUNSTBAUTEN_RADIUS_M): string {
  const r = (v: number) => v.toFixed(1)
  const q = new URLSearchParams({ geometry: [p[0] - radius, p[1] - radius, p[0] + radius, p[1] + radius].map(r).join(','),
    geometryType: 'esriGeometryEnvelope', inSR: '2056', spatialRel: 'esriSpatialRelIntersects', outFields: 'cgUnId',
    returnGeometry: 'true', returnZ: 'true', multipatchOption: 'stripMaterials', outSR: '2056', f: 'json' })
  return `${KUNSTBAUTEN_URL}?${q}`
}

function base64Bytes(s: string): Uint8Array {
  const bin = atob(s.replace(/\s+/g, ''))
  const b = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i)
  return b
}

async function inflate(b: Uint8Array): Promise<Uint8Array> {
  const strom = new Blob([b.slice()]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(strom).arrayBuffer())
}

/** binaryPatches → Shape-Puffer: gepackt (Kopf 12 Byte, dann zlib 0x78 …) oder schon roh */
export async function entpacken(base64: string): Promise<Uint8Array> {
  const b = base64Bytes(base64)
  return b.length > 13 && b[12] === 0x78 ? inflate(b.subarray(12)) : b
}

/** MultiPatch aus dem Shape-Puffer: Startindex und Typ je Teil, Punkte (x, y, z) */
export interface MultiPatch { teile: number[]; typen: number[]; punkte: Float64Array }
export function multipatchLesen(buf: Uint8Array): MultiPatch {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const typ = v.getUint32(0, true) & 0xff
  if (typ !== 31 && typ !== 32 && typ !== 54) throw new Error(`kein MultiPatch (Shape-Typ ${typ})`)
  let o = 4 + 32
  const nTeile = v.getInt32(o, true), nPunkte = v.getInt32(o + 4, true); o += 8
  if (nTeile < 0 || nPunkte < 0 || 44 + 8 * nTeile + 24 * nPunkte + 16 > buf.byteLength) throw new Error('MultiPatch unvollständig')
  const teile: number[] = [], typen: number[] = []
  for (let i = 0; i < nTeile; i++) teile.push(v.getInt32(o + 4 * i, true))
  o += 4 * nTeile
  for (let i = 0; i < nTeile; i++) typen.push(v.getInt32(o + 4 * i, true))
  o += 4 * nTeile
  const punkte = new Float64Array(3 * nPunkte)
  for (let i = 0; i < nPunkte; i++) { punkte[3 * i] = v.getFloat64(o + 16 * i, true); punkte[3 * i + 1] = v.getFloat64(o + 16 * i + 8, true) }
  o += 16 * nPunkte + 16   // xy, dann z-Bereich (min, max)
  for (let i = 0; i < nPunkte; i++) punkte[3 * i + 2] = v.getFloat64(o + 8 * i, true)
  return { teile, typen, punkte }
}

/** Dreiecke eines MultiPatch (flach, je 9 Werte) nach den Teiltypen */
export function dreiecke(mp: MultiPatch): Float64Array {
  const aus: number[] = [], pt = mp.punkte, n = pt.length / 3
  const dazu = (a: number, b: number, c: number) => { for (const i of [a, b, c]) aus.push(pt[3 * i], pt[3 * i + 1], pt[3 * i + 2]) }
  const gleich = (a: number, b: number) => pt[3 * a] === pt[3 * b] && pt[3 * a + 1] === pt[3 * b + 1] && pt[3 * a + 2] === pt[3 * b + 2]
  mp.teile.forEach((start, k) => {
    const ende = k + 1 < mp.teile.length ? mp.teile[k + 1] : n, typ = mp.typen[k]
    if (typ === 0) for (let i = start; i + 2 < ende; i++) dazu(i, i + 1, i + 2)
    else if (typ === 1) for (let i = start + 1; i + 1 < ende; i++) dazu(start, i, i + 1)
    else if (typ === 6) for (let i = start; i + 2 < ende; i += 3) dazu(i, i + 1, i + 2)
    else if (typ === 2 || typ === 4 || typ === 5) {
      const letzter = ende - 1 > start && gleich(start, ende - 1) ? ende - 1 : ende
      for (let i = start + 1; i + 1 < letzter; i++) dazu(start, i, i + 1)
    }
    // 3 (innerer Ring): übergangen
  })
  return new Float64Array(aus)
}

interface Antwort { features?: { attributes?: { cgUnId?: string }; geometry?: { binaryPatches?: string | string[] } }[]; error?: { message?: string } }

/** Antwort der Abfrage → Bauwerke mit Dreiecken; ein unlesbares Bauwerk wird übergangen, ein Dienstfehler geworfen */
export async function kunstbautenLesen(antwort: Antwort): Promise<Kunstbaute[]> {
  if (antwort.error) throw new Error(`Kunstbauten Stadt Bern: ${antwort.error.message ?? 'Fehler des Dienstes'}`)
  const aus: Kunstbaute[] = []
  for (const f of antwort.features ?? []) {
    const bp = f.geometry?.binaryPatches
    const roh = Array.isArray(bp) ? bp : bp ? [bp] : []
    const teile: Float64Array[] = []
    for (const b of roh) {
      try { teile.push(dreiecke(multipatchLesen(await entpacken(b)))) } catch { /* unlesbar: dieses Teil weglassen */ }
    }
    const laenge = teile.reduce((a, t) => a + t.length, 0)
    if (!laenge) continue
    const alle = new Float64Array(laenge)
    let o = 0
    for (const t of teile) { alle.set(t, o); o += t.length }
    aus.push({ name: f.attributes?.cgUnId ?? 'Kunstbaute', dreiecke: alle })
  }
  return aus
}

/** Grenzen der Bauwerke in LV95 (für das Ausblenden der swissTLM3D-Brücken an derselben Stelle) */
export function grenzenLv95(k: Kunstbaute): [number, number, number, number] {
  let w = Infinity, s = Infinity, o = -Infinity, n = -Infinity
  for (let i = 0; i < k.dreiecke.length; i += 3) {
    const x = k.dreiecke[i], y = k.dreiecke[i + 1]
    if (x < w) w = x; if (x > o) o = x; if (y < s) s = y; if (y > n) n = y
  }
  return [w, s, o, n]
}

/** Raster nur als räumlicher Index. Alle Dreiecke des Begrenzungsrechtecks eintragen;
 * die Zellmitte entscheidet weder über Belegung noch Höhe. Höhen bleiben LN02. */
export interface Grundriss { w: number; s: number; zelle: number; nx: number; ny: number; dreiecke: Float64Array; zellen: Map<number, number[]> }
export const GRUNDRISS_ZELLE_M = 0.5
export function grundriss(liste: readonly Kunstbaute[], zelle = GRUNDRISS_ZELLE_M): Grundriss | null {
  if (!liste.length) return null
  let w = Infinity, s = Infinity, o = -Infinity, n = -Infinity
  for (const k of liste) { const [a, b, c, d] = grenzenLv95(k); w = Math.min(w, a); s = Math.min(s, b); o = Math.max(o, c); n = Math.max(n, d) }
  if (!Number.isFinite(w) || !(zelle > 0)) return null
  const nx = Math.floor((o - w) / zelle) + 1, ny = Math.floor((n - s) / zelle) + 1
  const d = new Float64Array(liste.reduce((a, k) => a + k.dreiecke.length, 0)), zellen = new Map<number, number[]>()
  let offset = 0
  for (const k of liste) { d.set(k.dreiecke, offset); offset += k.dreiecke.length }
  for (let i = 0; i + 8 < d.length; i += 9) {
    const fl = (d[i + 3] - d[i]) * (d[i + 7] - d[i + 1]) - (d[i + 6] - d[i]) * (d[i + 4] - d[i + 1])
    if (!Number.isFinite(fl) || Math.abs(fl) < 1e-6) continue
    const i0 = Math.max(0, Math.floor((Math.min(d[i], d[i + 3], d[i + 6]) - w) / zelle))
    const i1 = Math.min(nx - 1, Math.floor((Math.max(d[i], d[i + 3], d[i + 6]) - w) / zelle))
    const j0 = Math.max(0, Math.floor((Math.min(d[i + 1], d[i + 4], d[i + 7]) - s) / zelle))
    const j1 = Math.min(ny - 1, Math.floor((Math.max(d[i + 1], d[i + 4], d[i + 7]) - s) / zelle))
    for (let y = j0; y <= j1; y++) for (let x = i0; x <= i1; x++) {
      const key = y * nx + x, indizes = zellen.get(key) ?? []
      indizes.push(i); zellen.set(key, indizes)
    }
  }
  return { w, s, zelle, nx, ny, dreiecke: d, zellen }
}
function dreieckHoehe(d: Float64Array, i: number, p: P): number | null {
  const ax = d[i], ay = d[i + 1], bx = d[i + 3], by = d[i + 4], cx = d[i + 6], cy = d[i + 7]
  const fl = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
  if (Math.abs(fl) < 1e-6) return null
  const u = ((bx - p[0]) * (cy - p[1]) - (cx - p[0]) * (by - p[1])) / fl
  const v = ((cx - p[0]) * (ay - p[1]) - (ax - p[0]) * (cy - p[1])) / fl
  if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) return null
  const h = u * d[i + 2] + v * d[i + 5] + (1 - u - v) * d[i + 8]
  return Number.isFinite(h) ? h : null
}
/** Alle Oberflächen am tatsächlichen Abfragepunkt, mit baryzentrischer Interpolation. */
export function bauHoehen(g: Grundriss | null, p: P): number[] {
  if (!g) return []
  const x = Math.floor((p[0] - g.w) / g.zelle), y = Math.floor((p[1] - g.s) / g.zelle)
  if (x < 0 || y < 0 || x >= g.nx || y >= g.ny) return []
  const aus: number[] = []
  for (const i of g.zellen.get(y * g.nx + x) ?? []) {
    const h = dreieckHoehe(g.dreiecke, i, p)
    if (h !== null && !aus.some(v => Math.abs(v - h) < 0.01)) aus.push(h)
  }
  return aus
}
export const aufGrundriss = (g: Grundriss | null, p: P): boolean => bauHoehen(g, p).length > 0
export function bauHoehe(g: Grundriss | null, p: P): number | null {
  const hs = bauHoehen(g, p)
  return hs.length ? Math.max(...hs) : null
}
/** Abstand zum projizierten Netz, nicht bloss zum Rechteck des gesamten Bauwerks. */
export function naheBau(g: Grundriss | null, p: P, radius: number): boolean {
  if (!g) return false
  const d = g.dreiecke
  for (let i = 0; i + 8 < d.length; i += 9) {
    if (p[0] < Math.min(d[i], d[i + 3], d[i + 6]) - radius || p[0] > Math.max(d[i], d[i + 3], d[i + 6]) + radius ||
        p[1] < Math.min(d[i + 1], d[i + 4], d[i + 7]) - radius || p[1] > Math.max(d[i + 1], d[i + 4], d[i + 7]) + radius) continue
    if (dreieckHoehe(d, i, p) !== null) return true
    const a: P = [d[i], d[i + 1]], b: P = [d[i + 3], d[i + 4]], c: P = [d[i + 6], d[i + 7]]
    if (Math.min(abstandStrecke(p, a, b), abstandStrecke(p, b, c), abstandStrecke(p, c, a)) <= radius) return true
  }
  return false
}
