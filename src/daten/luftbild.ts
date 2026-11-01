// ── Luftbild SWISSIMAGE 10 cm (© swisstopo) für die Streifen-Erkennung (E3) ──
//
// WMS GetMap von wms.geo.admin.ch in LV95 (EPSG:2056), 0,1 m/px, JPEG; CORS erlaubt (Access-Control-Allow-Origin: *).
// Flugjahr (Datenstand) je 1-km-Kachel aus den Metadaten (api3.geo.admin.ch identify, Layer
// ch.swisstopo.images-swissimage-dop10.metadata). Hinaus gehen nur der Kartenausschnitt bzw. die Kachel-Box.

import { holeJson, type Abruf, AbrufFehler } from './holen'
import { AUFLOESUNG_M, FENSTER_M } from '../rechner/luftbild'

export const LUFTBILD_QUELLE = '© swisstopo, SWISSIMAGE'
/** Name in «Geladene Quellen» */
export const LUFTBILD_NAME = `Luftbild SWISSIMAGE 10 cm (${LUFTBILD_QUELLE}), ±${FENSTER_M} m`

/**
 * Luftbild (und Flugjahr) jetzt laden? Nur am OSM-Übergang (nid), wenn «Streifen im Luftbild suchen» eingeschaltet ist (an),
 * das Bild noch fehlt und für diesen Ladevorgang noch kein Versuch lief (kein doppeltes Laden; nach einem Fehler kein
 * endloses Wiederholen). Abgeschaltet lädt die App nichts; wird die Suche später eingeschaltet, holt sie das Laden nach.
 */
export function luftbildLaden(x: { nid: number | null; hatBild: boolean; an: boolean; versucht: boolean }): boolean {
  return x.nid !== null && x.an && !x.hatBild && !x.versucht
}

/** Ausschnitt um (e, n) auf ganze 0,1 m: [e0, n0, e1, n1] und Kantenlänge in Pixeln */
export function luftbildBox(e: number, n: number, halb = FENSTER_M): [[number, number, number, number], number] {
  const r = (x: number) => Math.round(x / AUFLOESUNG_M) * AUFLOESUNG_M
  const e0 = r(e - halb), n0 = r(n - halb)
  const px = Math.round(2 * halb / AUFLOESUNG_M)
  return [[e0, n0, e0 + px * AUFLOESUNG_M, n0 + px * AUFLOESUNG_M], px]
}

export function wmsUrl(box: [number, number, number, number], px: number): string {
  return wmsBildUrl(box, px, px)
}

/** WMS GetMap SWISSIMAGE in LV95 für einen beliebigen Ausschnitt (auch Kartenbild im Bericht) */
export function wmsBildUrl(box: [number, number, number, number], breitePx: number, hoehePx: number): string {
  const b = box.map(v => v.toFixed(1)).join(',')
  return 'https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage&STYLES=' +
    `&CRS=EPSG:2056&BBOX=${b}&WIDTH=${breitePx}&HEIGHT=${hoehePx}&FORMAT=image/jpeg`
}

export function flugjahrUrl(e: number, n: number): string {
  const e0 = Math.floor(e / 1000) * 1000 + 500, n0 = Math.floor(n / 1000) * 1000 + 500
  const g = `${e0},${n0},${e0 + 1},${n0 + 1}`
  return `https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometry=${g}&geometryType=esriGeometryEnvelope` +
    `&layers=all:ch.swisstopo.images-swissimage-dop10.metadata&mapExtent=${g}&imageDisplay=10,10,96&tolerance=0&sr=2056` +
    '&returnGeometry=false&lang=de&limit=1'
}

export interface LuftbildRoh { blob: Blob; box: [number, number, number, number]; px: number }

/** Luftbild-Ausschnitt als JPEG-Blob (Dekodieren im Worker) */
export async function ladeLuftbild(e: number, n: number, signal?: AbortSignal): Promise<Abruf<LuftbildRoh>> {
  const [box, px] = luftbildBox(e, n)
  const url = wmsUrl(box, px)
  const t0 = performance.now()
  const ctrl = new AbortController()
  const ab = () => ctrl.abort()
  signal?.addEventListener('abort', ab)
  const t = setTimeout(() => ctrl.abort(), 30000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new AbrufFehler(`Luftbild: HTTP ${res.status}`)
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) throw new AbrufFehler(`Luftbild: keine Bilddatei (${blob.type})`)
    return { daten: { blob, box, px }, ms: performance.now() - t0, bytes: blob.size, quelle: 'wms.geo.admin.ch' }
  } finally { clearTimeout(t); signal?.removeEventListener('abort', ab) }
}

/** Flugjahr der Kachel (leer, wenn nicht verfügbar) */
export async function ladeFlugjahr(e: number, n: number, signal?: AbortSignal): Promise<string> {
  try {
    const r = await holeJson<{ results?: { attributes?: { datenstand?: string } }[] }>(flugjahrUrl(e, n), {}, 15000, signal)
    return String(r.daten.results?.[0]?.attributes?.datenstand ?? '')
  } catch { return '' }
}
