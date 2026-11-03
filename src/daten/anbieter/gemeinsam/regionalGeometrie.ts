import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { lv95, type P } from '../../../geo'
export const istObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
export const liste = (x: unknown): unknown[] => x === undefined ? [] : Array.isArray(x) ? x : [x]
export interface RegionalGeometrie { punkte?: P[]; teile?: P[][]; polygone?: P[][][] }
export function regionalGeometrie(g: unknown, wgs84 = false): RegionalGeometrie {
  if (!istObjekt(g)) throw new Error('Geometrie fehlt')
  const punkt = (p: unknown): P => {
    if (!Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(z => typeof z === 'number' && Number.isFinite(z))) throw new Error('Ungültiger Punkt')
    const q: P = wgs84 ? lv95(p[1], p[0]) : [p[0], p[1]]
    if (q[0] < 2400000 || q[0] > 2900000 || q[1] < 1000000 || q[1] > 1400000) throw new Error('Koordinaten ausserhalb LV95')
    return q
  }
  const linie = (x: unknown, ring = false): P[] => {
    if (!Array.isArray(x) || x.length < (ring ? 4 : 2) || x.length > 50000) throw new Error('Ungültige Linie')
    const p = x.map(punkt)
    if (ring && (p[0][0] !== p[p.length - 1][0] || p[0][1] !== p[p.length - 1][1])) throw new Error('Offener Polygonring')
    return p
  }
  if (g.type === 'Point') return { punkte: [punkt(g.coordinates)] }
  if (g.type === 'MultiPoint' && Array.isArray(g.coordinates) && g.coordinates.length) return { punkte: g.coordinates.map(punkt) }
  if (g.type === 'LineString') return { teile: [linie(g.coordinates)] }
  if (g.type === 'MultiLineString' && Array.isArray(g.coordinates) && g.coordinates.length) return { teile: g.coordinates.map(x => linie(x)) }
  const ps = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null
  if (!Array.isArray(ps) || !ps.length) throw new Error('Nicht unterstützte Geometrie')
  return { polygone: ps.map(p => { if (!Array.isArray(p) || !p.length) throw new Error('Leeres Polygon'); return p.map(r => linie(r, true)) }) }
}
/** GML 3.1/3.2: keine externen Entitäten, keine stillen Projektions- oder Dimensionsannahmen. */
export function regionalGml(text: string): { features: Record<string, unknown>[]; matched: number | null; next: boolean } {
  if (text.length > 15000000 || /<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) throw new Error('Ungültige GML-Antwort')
  const raw = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false }).parse(text)
  const fc = raw.FeatureCollection
  if (!istObjekt(fc)) throw new Error('Dienst liefert keine FeatureCollection')
  const find = (x: unknown, key: string): unknown[] => Array.isArray(x) ? x.flatMap(v => find(v, key)) : !istObjekt(x) ? [] : Object.entries(x).flatMap(([k, v]) => k === key ? liste(v) : liste(v).flatMap(vv => find(vv, key)))
  const features = [...liste(fc.member), ...liste(fc.featureMember)].map(m => {
    if (!istObjekt(m)) throw new Error('Ungültiges GML-Objekt')
    const f = Object.values(m).find(istObjekt)
    if (!istObjekt(f) || !liste(f.geom).length || liste(f.geom).some(g => !istObjekt(g))) throw new Error('GML-Geometrie fehlt')
    const srs = [...find(f.geom, '@_srsName')].map(String)
    if (!srs.length || srs.some(s => !/(^|[^0-9])2056$/.test(s))) throw new Error('GML ist nicht LV95')
    const pos = (x: unknown): P[] => {
      const ps = find(x, 'posList')
      if (ps.length !== 1 || !istObjekt(ps[0]) || !['2', '3'].includes(String(ps[0]['@_srsDimension']))) throw new Error('GML-Dimension fehlt')
      const dim = Number(ps[0]['@_srsDimension']), ns = String(ps[0]['#text'] ?? '').trim().split(/\s+/).map(Number)
      if (!ns.length || ns.length % dim || ns.some(n => !Number.isFinite(n))) throw new Error('Ungültige GML-Koordinaten')
      return Array.from({ length: ns.length / dim }, (_, i) => [ns[i * dim], ns[i * dim + 1]])
    }
    const points = find(f.geom, 'Point').flatMap(p => find(p, 'pos')).map(p => {
      const ns = String(istObjekt(p) ? p['#text'] : p).trim().split(/\s+/).map(Number)
      if (ns.length < 2 || ns.length > 3 || ns.some(n => !Number.isFinite(n))) throw new Error('Ungültiger GML-Punkt')
      return ns.slice(0, 2)
    })
    const polys = find(f.geom, 'Polygon')
    const geometry = points.length ? { type: 'MultiPoint', coordinates: points } : polys.length ? { type: 'MultiPolygon', coordinates: polys.map(p => {
      if (!istObjekt(p)) throw new Error('Ungültiges GML-Polygon')
      return [pos(p.exterior), ...liste(p.interior).map(pos)]
    }) } : { type: 'MultiLineString', coordinates: find(f.geom, 'LineString').map(pos) }
    const properties = Object.fromEntries(Object.entries(f).filter(([k, v]) => !k.startsWith('@_') && k !== 'geom' && k !== 'boundedBy' && (typeof v === 'string' || typeof v === 'number')))
    return { id: f['@_id'], properties, geometry }
  })
  const n = fc['@_numberMatched'] ?? fc['@_numberOfFeatures']
  return { features, matched: /^\d+$/.test(String(n)) ? Number(n) : null, next: !!fc['@_next'] }
}
