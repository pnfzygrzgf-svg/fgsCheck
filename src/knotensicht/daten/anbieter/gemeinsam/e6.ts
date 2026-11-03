// E6a: ausschliesslich Kartenkontext. Keine Ableitung einer Normantwort oder eines Rechenhindernisses.
import { lv95, wgs, type P } from '../../../geo'
import { holeJson, holeText, type Abruf } from '../../holen'

export interface E6Dienst {
  id: `e6.${string}`; name: string; anbieter: string; kanton: string; bfs?: number; ausgenommen?: number[]
  art: 'beleuchtung' | 'taktil' | 'netz'; format: 'wfs' | 'ods'; url: string; typ?: string; version?: string; output?: string
  meta: string; metaText?: boolean; lizenz: string; hinweis: string
}
const zh = (id: E6Dienst['id'], name: string, art: E6Dienst['art'], dienst: string, typ: string): E6Dienst => ({
  id, name, art, kanton: 'ZH', bfs: 261, anbieter: 'Stadt Zürich', format: 'wfs', version: '1.1.0', output: 'GeoJSON',
  url: `https://www.ogd.stadt-zuerich.ch/wfs/geoportal/${dienst}`, typ,
  meta: `https://data.stadt-zuerich.ch/api/3/action/package_show?id=geo_${dienst.toLowerCase()}`,
  lizenz: 'CC0, Stadt Zürich', hinweis: art === 'beleuchtung' ? 'Inventarstandort; kein Nachweis ausreichender Beleuchtung.'
    : art === 'taktil' ? 'Nur VBZ-Haltestellen; Punktinventar, keine Rillenfläche oder Vollständigkeitsbestätigung.'
    : 'Kontextnetz; keine automatische Übernahme von Führungsform, Einbahnrichtung oder Routentyp.',
})
export const E6_DIENSTE: readonly E6Dienst[] = [
  zh('e6.zh.licht', 'Beleuchtung (Stadt Zürich)', 'beleuchtung', 'Oeffentliche_Beleuchtung_der_Stadt_Zuerich', 'ewz_brennstelle_p'),
  { id: 'e6.ktzh.licht', name: 'Beleuchtung Staatsstrassen (Kanton Zürich)', anbieter: 'Kanton Zürich', kanton: 'ZH', ausgenommen: [261, 230],
    art: 'beleuchtung', format: 'wfs', url: 'https://maps.zh.ch/wfs/OGDZHWFS', typ: 'ms:ogd-0124_giszhpub_tba_str_beleuchtung_p', version: '2.0.0', output: 'application/json',
    meta: 'https://maps.zh.ch/wfs/OGDZHWFS?request=GetMetadata&layer=ogd-0124_giszhpub_tba_str_beleuchtung_p', metaText: true,
    lizenz: 'CC0, Kanton Zürich', hinweis: 'Nur inventarisierte Standorte an Staatsstrassen; Betriebszustand und örtliche Abdeckung prüfen. Kein Beleuchtungsnachweis.' },
  { id: 'e6.sg.licht', name: 'Beleuchtung (Stadt St. Gallen)', anbieter: 'St.Galler Stadtwerke (sgsw)', kanton: 'SG', bfs: 3203,
    art: 'beleuchtung', format: 'ods', url: 'https://daten.stadt.sg.ch/api/explore/v2.1/catalog/datasets/offentliche-beleuchtung-stadt-stgallen/records',
    meta: 'https://daten.stadt.sg.ch/api/explore/v2.1/catalog/datasets/offentliche-beleuchtung-stadt-stgallen',
    lizenz: 'CC BY 4.0, Stadt St. Gallen / sgsw', hinweis: 'Inventarstandorte; Katalog sieht keine laufende Aktualisierung vor. Kein Beleuchtungsnachweis.' },
  zh('e6.zh.taktil', 'Taktile Rillen an VBZ-Haltestellen (Zürich)', 'taktil', 'VBZ_Infrastruktur_OGD', 'haltestellen_blindenrillenplat'),
  zh('e6.zh.netz', 'Fuss- und Velowegnetz (Stadt Zürich)', 'netz', 'Fuss__und_Velowegnetz', 'tbl_routennetz'),
]
export const e6Fuer = (orte: readonly { bfs?: number | null; kanton?: string }[]) => E6_DIENSTE.filter(d =>
  orte.some(o => o.kanton === d.kanton && (!d.bfs || o.bfs === d.bfs) && !d.ausgenommen?.includes(o.bfs ?? -1)))
export const e6Dienst = (id: string) => E6_DIENSTE.find(d => d.id === id)
export interface E6Objekt { id: string; name: string; hinweis: string; kontext: string; punkte?: P[]; teile?: P[][] }
export interface E6Teil { id: string; url: string; abgerufen: string; datenstand: string; objekte: E6Objekt[]; roh: unknown; meta?: unknown }
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const text = (x: unknown) => typeof x === 'string' ? x.trim().slice(0, 1000) : typeof x === 'number' && Number.isFinite(x) ? String(x) : 'unbekannt'
const flag = (x: unknown) => x === 1 || x === '1' || x === true ? true : x === 0 || x === '0' || x === false ? false : null
const hash = (x: unknown) => { let h = 2166136261; for (const c of JSON.stringify(x)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16) }
export function e6Lesen(d: E6Dienst, roh: unknown): E6Objekt[] {
  if (!obj(roh)) throw Error('Kartenkontext: Antwort fehlt')
  if (d.format === 'wfs' && (roh.type !== 'FeatureCollection' || !obj(roh.crs) || !obj(roh.crs.properties)
    || !/2056$/.test(String(roh.crs.properties.name)))) throw Error('Kartenkontext: Antwort ist nicht LV95')
  const fs = d.format === 'ods' ? roh.results : roh.features
  if (!Array.isArray(fs) || fs.length > 2000) throw Error('Kartenkontext: Objektliste fehlt oder Ausschnitt zu gross')
  const ids = new Set<string>()
  const ohneQuellId = new Map<string, number>()
  return fs.map(f => {
    if (!obj(f)) throw Error('Kartenkontext: ungültiges Objekt')
    const p = d.format === 'ods' ? f : f.properties
    const g = d.format === 'ods' && obj(f.geo_shape) ? f.geo_shape.geometry : f.geometry
    if (!obj(p) || !obj(g)) throw Error('Kartenkontext: Attribute oder Geometrie fehlen')
    const punkt = (x: unknown): P => {
      if (!Array.isArray(x) || x.length < 2 || !x.slice(0, 2).every(v => typeof v === 'number' && Number.isFinite(v))) throw Error('Kartenkontext: ungültiger Punkt')
      const q: P = d.format === 'ods' ? lv95(x[1], x[0]) : [x[0], x[1]]
      if (q[0] < 2400000 || q[0] > 2900000 || q[1] < 1000000 || q[1] > 1400000) throw Error('Kartenkontext: Punkt ausserhalb LV95')
      return q
    }
    const linie = (x: unknown): P[] => {
      if (!Array.isArray(x) || x.length < 2 || x.length > 50000) throw Error('Kartenkontext: ungültige Linie')
      return x.map(punkt)
    }
    const punkte = g.type === 'Point' ? [punkt(g.coordinates)] : g.type === 'MultiPoint' && Array.isArray(g.coordinates) && g.coordinates.length ? g.coordinates.map(punkt) : undefined
    const teile = g.type === 'LineString' ? [linie(g.coordinates)] : g.type === 'MultiLineString' && Array.isArray(g.coordinates) && g.coordinates.length ? g.coordinates.map(linie) : undefined
    if (d.art === 'netz' ? !teile : !punkte) throw Error('Kartenkontext: unerwarteter Geometrietyp')
    const quellId = f.id ?? p.objectid ?? p.geodb_oid
    const geometrieHash = hash(g)
    let id: string
    if (typeof quellId === 'number' && Number.isFinite(quellId) || typeof quellId === 'string' && quellId.trim()) {
      id = `${d.id}:${quellId}:${geometrieHash}`
    } else {
      // Zähler nur je gleicher Geometrie: andere Standorte und überlappende Ausschnitte verschieben die Kennung nicht.
      const n = (ohneQuellId.get(geometrieHash) ?? 0) + 1
      ohneQuellId.set(geometrieHash, n)
      id = `${d.id}:${geometrieHash}:${n}`
    }
    if (ids.has(id)) throw Error('Kartenkontext: doppelte Objektkennung'); ids.add(id)
    let name: string, hinweis = d.hinweis, kontext: string = d.art === 'beleuchtung' ? 'lampe' : d.art
    if (d.id === 'e6.zh.licht') name = `${text(p.art_txt)} ${text(p.nisnr)}`
    else if (d.id === 'e6.ktzh.licht') { name = `Leuchte ${text(p.nummer)}`; hinweis += ` Typ: ${text(p.beleuchtungstyp_txt)}; Bauart: ${text(p.bauart_txt)}; ausgeschaltet: ${text(p.ausgeschaltet_txt)}.` }
    else if (d.id === 'e6.sg.licht') name = text(p.typ)
    else if (d.art === 'taktil') { name = 'Taktile Rillen (VBZ)'; hinweis += ` Orientierung im Inventar: ${text(p.orientierung)}°; Winkelbezug nicht abgeleitet.` }
    else {
      name = text(p.name); const fuss = flag(p.fuss), velo = flag(p.velo)
      kontext = fuss === null || velo === null ? 'netz_unbekannt' : fuss && velo ? 'fussvelo' : fuss ? 'fuss' : velo ? 'velo' : 'netz_ohne'
      hinweis += ` Originalattribute: fuss=${text(p.fuss)}, velo=${text(p.velo)}, einbahn=${text(p.einbahn)}, velostreifen=${text(p.velostreifen)}, veloweg=${text(p.veloweg)}.`
    }
    return { id, name, hinweis, kontext, ...(punkte ? { punkte } : {}), ...(teile ? { teile } : {}) }
  })
}
export function e6Stand(meta: unknown): string {
  const dt = (s: unknown): string | null => {
    if (typeof s !== 'string') return null
    const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/), iso = m ? `${m[3]}-${m[2]}-${m[1]}` : s.slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso ? iso.split('-').reverse().join('.') : null
  }
  if (obj(meta)) {
    const d = meta.success === true && obj(meta.result) ? dt(meta.result.dateLastUpdated) : null
    if (d) return `${d} (Katalogaktualisierung)`
    const m = obj(meta.metas) && obj(meta.metas.default) ? meta.metas.default : null
    const t = dt(m?.modified)
    if (t) return `${t} (Katalogangabe modified; kein Datum einer örtlichen Kontrolle)`
  }
  if (typeof meta === 'string' && meta.length < 1_000_000 && !/<!DOCTYPE|<!ENTITY/i.test(meta)) {
    const block = meta.match(/<(?:\w+:)?dateStamp\b[^>]*>([\s\S]*?)<\/(?:\w+:)?dateStamp>/)?.[1]
    const stamp = block?.match(/<(?:\w+:)?(?:Date|DateTime)\b[^>]*>([^<]+)</)?.[1]
    const d = dt(stamp)
    if (d) return `${d} (Metadatenaktualisierung; fachlicher Stand unbekannt)`
  }
  // WFS-ISO-Metadaten des kantonalen Dienstes liefern derzeit dateStamp/date mit nilReason=missing.
  // Keine Datumszahlen aus beliebigen Textstellen oder HTTP-Headern als fachlichen Stand deuten.
  return 'unbekannt (keine verwendbare Standangabe in den Dienstmetadaten)'
}
export function e6Url(d: E6Dienst, p: P, r = 200, hits = false): string {
  const u = new URL(d.url)
  if (d.format === 'ods') {
    const [s, w] = wgs(p[0] - r, p[1] - r), [n, e] = wgs(p[0] + r, p[1] + r)
    u.searchParams.set('where', `intersects(geo_shape, geom'POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))')`)
    u.searchParams.set('limit', '100'); u.searchParams.set('offset', '0')
  } else {
    const ver = d.version ?? '2.0.0'
    const q: Record<string, string> = { SERVICE: 'WFS', VERSION: ver, REQUEST: 'GetFeature', [ver === '2.0.0' ? 'TYPENAMES' : 'TYPENAME']: d.typ!, SRSNAME: 'EPSG:2056', BBOX: `${[p[0] - r, p[1] - r, p[0] + r, p[1] + r].map(v => v.toFixed(2)).join(',')},EPSG:2056` }
    if (hits) q.RESULTTYPE = 'hits'; else { q.OUTPUTFORMAT = d.output ?? 'GeoJSON'; q[ver === '2.0.0' ? 'COUNT' : 'MAXFEATURES'] = '2000' }
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v)
  }
  return u.href
}
export interface E6LadeLauf { metadaten: Map<string, Promise<{ daten: unknown; bytes: number } | null>> }
export async function ladeE6(d: E6Dienst, p: P, r = 200, signal?: AbortSignal, lauf?: E6LadeLauf): Promise<Abruf<E6Teil>> {
  if (!Number.isFinite(r) || r < 10 || r > 500 || p.length !== 2 || !p.every(Number.isFinite)
    || p[0] < 2400000 || p[0] > 2900000 || p[1] < 1000000 || p[1] > 1400000) throw Error('Kartenkontext: ungültiger Ausschnitt')
  const start = performance.now(), url = e6Url(d, p, r)
  const schonGeladen = lauf?.metadaten.has(d.id) ?? false
  const metadaten = lauf?.metadaten.get(d.id) ?? (d.metaText ? holeText(d.meta, {}, 10000, signal).then(([res, text]) => { if (!res.ok) throw Error('Metadaten fehlen'); return { daten: text as unknown, bytes: text.length } })
    : holeJson<unknown>(d.meta, {}, 10000, signal)).catch(() => null)
  lauf?.metadaten.set(d.id, metadaten)
  const a = await holeJson<Record<string, unknown>>(url, {}, 20000, signal)
  if (!obj(a.daten)) throw Error('Kartenkontext: ungültige Antwort; Objektliste fehlt')
  let roh = a.daten, bytes = a.bytes
  if (d.format === 'wfs') {
    const [res, s] = await holeText(e6Url(d, p, r, true), {}, 15000, signal)
    const count = s.match(/(?:numberMatched|numberOfFeatures)=["'](\d+)["']/)?.[1]
    if (!res.ok || count === undefined || !Array.isArray(roh.features) || Number(count) !== roh.features.length || Number(count) > 2000) throw Error('Kartenkontext: unvollständige Antwort oder Ausschnitt während Abruf verändert')
    bytes += s.length
  } else {
    const total = roh.total_count
    if (typeof total !== 'number' || !Number.isInteger(total) || total < 0 || total > 2000 || !Array.isArray(roh.results)) throw Error('Kartenkontext: ungültige Trefferzahl')
    const all = [...roh.results]
    while (all.length < total) {
      const u = new URL(url); u.searchParams.set('offset', String(all.length))
      const b = await holeJson<Record<string, unknown>>(u.href, {}, 15000, signal)
      if (!obj(b.daten) || !Array.isArray(b.daten.results) || !b.daten.results.length || b.daten.total_count !== total) throw Error('Kartenkontext: Ausschnitt während Abruf verändert')
      all.push(...b.daten.results); bytes += b.bytes
    }
    if (all.length !== total) throw Error('Kartenkontext: unvollständige Antwort')
    roh = { ...roh, results: all }
  }
  const meta = await metadaten
  if (signal?.aborted) throw new DOMException('abgebrochen', 'AbortError')
  const objekte = e6Lesen(d, roh)
  return { daten: { id: d.id, url, abgerufen: new Date().toISOString(), datenstand: e6Stand(meta?.daten), objekte, roh, ...(meta ? { meta: meta.daten } : {}) }, bytes: bytes + (schonGeladen ? 0 : meta?.bytes ?? 0), ms: performance.now() - start, quelle: new URL(url).host }
}
export const e6Legende = (art: E6Dienst['art']): [string, string, string, string?][] => art === 'beleuchtung'
  ? [['lampe', '#a16207', 'Inventarisierter Leuchtenstandort', 'L']]
  : art === 'taktil' ? [['taktil', '#7c3aed', 'Rillenstandort, keine Fläche', 'R']]
  : [['fuss', '#db2777', 'Fussverkehr'], ['velo', '#0f766e', 'Veloverkehr'], ['fussvelo', '#2563eb', 'Fuss- und Veloverkehr'], ['netz_ohne', '#64748b', 'Im Inventar weder Fuss noch Velo'], ['netz_unbekannt', '#94a3b8', 'Nutzungsangabe ungeklärt']]
