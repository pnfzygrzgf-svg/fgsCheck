import { lv95, type P } from '../../../geo'
import { AbrufFehler, holeJson, holeText, type Abruf } from '../../holen'

export const ZH_QUELLE = 'Stadt Zürich, Dienstabteilung Verkehr (CC0)'
export const ZH_RADIUS_M = 200
export const ZH_DIENSTE = {
  tempo: { dienst: 'Signalisierte_Geschwindigkeiten', typ: 'view_geoserver_tempo_ist', katalog: 'geo_signalisierte_geschwindigkeiten' },
  zonen: { dienst: 'Verkehrszonen', typ: 'view_geoserver_zonen_ist', katalog: 'geo_verkehrszonen' },
} as const
export type ZhArt = keyof typeof ZH_DIENSTE
export interface ZhObjekt { id: string; name: string; regime: string; code: string; umgesetzt: string | null; rechtskraeftig: string | null }
export interface ZhLinie extends ZhObjekt { teile: P[][]; tempo: number | null; verbot: boolean; ausnahmen: string; signal: string }
export interface ZhZone extends ZhObjekt { polygone: P[][][]; art: 't30_zone' | 'begegnungszone' | 'fussgaengerzone' | null }
export interface ZhTeil<T> { objekte: T[]; datenstand: string | null; url: string; metadaten: string; abgerufen: string }
export interface ZuerichSnapshot { version: 1; mitte: P; radiusM: number; tempo?: ZhTeil<ZhLinie>; zonen?: ZhTeil<ZhZone> }
type Roh = { type?: string; crs?: { properties?: { name?: string } }; features?: unknown[] }
const objekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const text = (x: unknown) => typeof x === 'string' && x.length <= 8000 ? x.trim() : ''
const punkt = (x: unknown): x is P => Array.isArray(x) && x.length >= 2 && x.slice(0, 2).every(v => typeof v === 'number' && Number.isFinite(v))
  && x[0] >= 2400000 && x[0] <= 2900000 && x[1] >= 1000000 && x[1] <= 1400000
const datum = (x: unknown): string | null => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(x)
  && Number.isFinite(Date.parse(x.slice(0, 10))) && new Date(x.slice(0, 10)).toISOString().slice(0, 10) === x.slice(0, 10) ? x.slice(0, 10) : null
export function zhDatenstand(x: unknown): string | null {
  if (!objekt(x) || x.success !== true || !objekt(x.result)) return null
  const t = text(x.result.dateLastUpdated).match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return t ? datum(`${t[3]}-${t[2]}-${t[1]}`) : null
}
export const zhStandText = (x: { datenstand: string | null }) => x.datenstand ? `${x.datenstand.split('-').reverse().join('.')} (Katalogaktualisierung)` : 'unbekannt'
export const zhMetadatenUrl = (art: ZhArt) => `https://data.stadt-zuerich.ch/api/3/action/package_show?id=${ZH_DIENSTE[art].katalog}`
export function zhUrl(art: ZhArt, mitte: P, radiusM = ZH_RADIUS_M, hits = false): string {
  const d = ZH_DIENSTE[art], u = new URL(`https://www.ogd.stadt-zuerich.ch/wfs/geoportal/${d.dienst}`)
  const [e, n] = mitte
  const p: Record<string, string> = { SERVICE: 'WFS', VERSION: '1.1.0', REQUEST: 'GetFeature', TYPENAME: d.typ,
    SRSNAME: 'EPSG:2056', BBOX: `${[e - radiusM, n - radiusM, e + radiusM, n + radiusM].map(z => z.toFixed(2)).join(',')},EPSG:2056` }
  if (hits) p.RESULTTYPE = 'hits'; else { p.OUTPUTFORMAT = 'GeoJSON'; p.MAXFEATURES = '2001' }
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v)
  return u.toString()
}
function lesen(roh: Roh, art: ZhArt): (ZhLinie | ZhZone)[] {
  if (roh.type !== 'FeatureCollection' || !/(^|[^0-9])2056$/.test(roh.crs?.properties?.name ?? '') || !Array.isArray(roh.features)
    || roh.features.length > 2000) throw new AbrufFehler('Zürich: unvollständige Antwort oder Koordinaten nicht LV95')
  const ids = new Set<string>()
  return roh.features.map(f => {
    if (!objekt(f) || !objekt(f.properties) || !objekt(f.geometry) || typeof f.id !== 'string'
      || !f.id.startsWith(`${ZH_DIENSTE[art].typ}.`) || ids.has(f.id)) throw new AbrufFehler('Zürich: ungültige oder doppelte Objektkennung')
    ids.add(f.id)
    const p = f.properties, g = f.geometry
    const basis: ZhObjekt = { id: f.id, name: text(p.lokalisationsname ?? p.zonenname), regime: text(p.temporegime ?? p.zonentyp),
      code: text(p.temporegime_technical ?? p.zonentyp_technical), umgesetzt: datum(p.umgesetzt_datum), rechtskraeftig: datum(p.rechtskraeftig_datum) }
    const linie = (x: unknown): P[] => {
      if (!Array.isArray(x) || x.length < 2 || x.length > 50000 || !x.every(punkt)) throw new AbrufFehler('Zürich: ungültige Geometrie')
      return x.map(c => [c[0], c[1]])
    }
    if (art === 'tempo') {
      const teile = g.type === 'LineString' ? [linie(g.coordinates)] : g.type === 'MultiLineString' && Array.isArray(g.coordinates)
        && g.coordinates.length > 0 ? g.coordinates.map(linie) : null
      if (!teile) throw new AbrufFehler('Zürich: Liniengeometrie fehlt')
      const v = /^T(20|30|40|50|60|70|80|100|120)$/.exec(basis.regime)
      return { ...basis, teile, tempo: v && basis.code === basis.regime ? Number(v[1]) : null,
        verbot: basis.regime === 'Fahrverbot' && basis.code === 'T0', ausnahmen: text(p.ausnahmen_fahrverbot), signal: text(p.fahrverbot_ssv) }
    }
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null
    if (!Array.isArray(polys) || !polys.length) throw new AbrufFehler('Zürich: Zonengeometrie fehlt')
    const polygone = polys.map(poly => {
      if (!Array.isArray(poly) || !poly.length) throw new AbrufFehler('Zürich: leeres Polygon')
      return poly.map(r => { const l = linie(r); if (l.length < 4 || l[0][0] !== l[l.length - 1][0] || l[0][1] !== l[l.length - 1][1])
        throw new AbrufFehler('Zürich: offener Zonenring'); return l })
    })
    const zonen = { 'T30-Zone': ['T30', 't30_zone'], Begegnungszone: ['T20', 'begegnungszone'], Fussgängerzone: ['T0', 'fussgaengerzone'] } as const
    const z = zonen[basis.regime as keyof typeof zonen]
    return { ...basis, polygone, art: z && z[0] === basis.code ? z[1] : null }
  })
}
export const zhTempoLesen = (roh: Roh) => lesen(roh, 'tempo') as ZhLinie[]
export const zhZonenLesen = (roh: Roh) => lesen(roh, 'zonen') as ZhZone[]
export async function ladeZuerich<K extends ZhArt>(art: K, mitte: P, radiusM = ZH_RADIUS_M, signal?: AbortSignal): Promise<Abruf<ZhTeil<K extends 'tempo' ? ZhLinie : ZhZone>>> {
  const url = zhUrl(art, mitte, radiusM), metadaten = zhMetadatenUrl(art), start = performance.now()
  const [r, hits, meta] = await Promise.allSettled([holeJson<Roh>(url, {}, 30000, signal), holeText(zhUrl(art, mitte, radiusM, true), {}, 30000, signal),
    holeJson<unknown>(metadaten, {}, 12000, signal)])
  if (signal?.aborted) throw new DOMException('abgebrochen', 'AbortError')
  if (r.status === 'rejected') throw r.reason
  if (hits.status === 'rejected') throw hits.reason
  const anzahl = hits.value[1].match(/numberOfFeatures=["'](\d+)["']/)?.[1]
  if (!hits.value[0].ok || anzahl === undefined || Number(anzahl) !== r.value.daten.features?.length)
    throw new AbrufFehler('Zürich: Übertragungsgrenze oder veränderter Ausschnitt; erneut laden')
  const objekte = lesen(r.value.daten, art)
  return { ...r.value, ms: performance.now() - start, bytes: r.value.bytes + hits.value[1].length + (meta.status === 'fulfilled' ? meta.value.bytes : 0),
    daten: { objekte, datenstand: meta.status === 'fulfilled' ? zhDatenstand(meta.value.daten) : null,
      abgerufen: new Date().toISOString(), url, metadaten } as ZhTeil<K extends 'tempo' ? ZhLinie : ZhZone> }
}

/** Gespeicherte Daten werden vor Benutzung erneut durch dieselbe Geometrie-/Attributprüfung geführt. */
export function zuerichSnapshotLesen(x: unknown): ZuerichSnapshot | null {
  if (!objekt(x) || x.version !== 1 || !punkt(x.mitte) || typeof x.radiusM !== 'number' || !Number.isFinite(x.radiusM) || x.radiusM < 10 || x.radiusM > 500) return null
  const aus: ZuerichSnapshot = { version: 1, mitte: [x.mitte[0], x.mitte[1]], radiusM: x.radiusM }
  try {
    for (const art of ['tempo', 'zonen'] as const) {
      const t = x[art]; if (t === undefined) continue
      if (!objekt(t) || !Array.isArray(t.objekte) || typeof t.abgerufen !== 'string' || !Number.isFinite(Date.parse(t.abgerufen))
        || t.url !== zhUrl(art, aus.mitte, aus.radiusM) || t.metadaten !== zhMetadatenUrl(art)
        || t.datenstand !== null && datum(t.datenstand) !== t.datenstand) return null
      const features = t.objekte.map(o => {
        if (!objekt(o)) throw new Error('Objekt fehlt')
        const basis = { id: o.id, properties: { lokalisationsname: o.name, zonenname: o.name, temporegime: o.regime, zonentyp: o.regime,
          temporegime_technical: o.code, zonentyp_technical: o.code, umgesetzt_datum: o.umgesetzt, rechtskraeftig_datum: o.rechtskraeftig,
          ausnahmen_fahrverbot: o.ausnahmen, fahrverbot_ssv: o.signal }, geometry: art === 'tempo'
          ? { type: 'MultiLineString', coordinates: o.teile } : { type: 'MultiPolygon', coordinates: o.polygone } }
        return basis
      })
      const objekte = lesen({ type: 'FeatureCollection', crs: { properties: { name: 'EPSG:2056' } }, features }, art)
      if (objekte.some((o, i) => { const alt = t.objekte as Record<string, unknown>[]; return 'tempo' in o ? o.tempo !== alt[i].tempo || o.verbot !== alt[i].verbot : o.art !== alt[i].art })) return null
      Object.assign(aus, { [art]: { objekte, datenstand: t.datenstand, url: t.url, metadaten: t.metadaten, abgerufen: t.abgerufen } })
    }
  } catch { return null }
  return aus.tempo || aus.zonen ? aus : null
}
export const zhMitte = (lat: number, lon: number) => lv95(lat, lon)
