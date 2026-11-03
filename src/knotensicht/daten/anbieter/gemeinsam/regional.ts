import { bedarfsOrt, type BedarfsOrt } from './bedarfOrte'
import { e6Dienst, e6Lesen, e6Stand, e6Url, ladeE6 } from './e6'
import {bundUrl,bundFeatures,bundFach,ladeBundGeoAdmin,type BundFach} from './bundGeoAdmin'
import {poiUrl} from './bundPoiUrl'
import {bavDatenstand} from './bav'
import { wgs, type P } from '../../../geo'
import { holeJson, holeText, type Abruf } from '../../holen'
import { regionalDienst, type RegionalDienst } from './regionalDienste'
import { istObjekt, regionalGeometrie, regionalGml, type RegionalGeometrie } from './regionalGeometrie'
export type RegionalZone = 't30_zone' | 'begegnungszone' | 'fussgaengerzone'
export interface RegionalObjekt extends RegionalGeometrie { kontext?: string; bedarf?: BedarfsOrt; bund?:BundFach; verkehr?: 'fgs' | 'lsa' | 'stop' | 'give_way' | 'hauptstrasse' | 'fgs_signal'; id: string; name: string; tempo: number | null; zone: RegionalZone | null; bestaetigen: boolean; hinweis: string; stand: string | null }
export interface RegionalTeil { id: string; url: string; abgerufen: string; datenstand: string; objekte: RegionalObjekt[]; roh: unknown; meta?: unknown }
export interface RegionalSnapshot { version: 1; mitte: P; radiusM: number; teile: RegionalTeil[] }
const str = (x: unknown) => typeof x === 'string' ? x.trim().slice(0, 8000) : ''
const tempo = (x: unknown): number | null => typeof x === 'number' && Number.isFinite(x) && x >= 5 && x <= 130 ? x : typeof x === 'string' && /^\d{1,3}$/.test(x.trim()) ? tempo(Number(x)) : null
export const regionalDatum = (x: unknown): string | null => {
  let s = str(x), m: RegExpMatchArray | null
  if ((m = s.match(/^(\d{2})[._](\d{2})[._](\d{4})$/))) s = `${m[3]}-${m[2]}-${m[1]}`
  else if ((m = s.match(/^(\d{4})_(\d{2})_(\d{2})$/))) s = `${m[1]}-${m[2]}-${m[3]}`
  else if ((m = s.match(/^(\d{2})(\d{2})(\d{2})$/))) s = `20${m[1]}-${m[2]}-${m[3]}`
  s = s.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s ? s : null
}
const zone = (x: unknown): RegionalZone | null => {
  const s = str(x).toLowerCase().replace(/[\s-]/g, '')
  return /tempo30|zone30/.test(s) ? 't30_zone' : /begegnung|rencontre/.test(s) ? 'begegnungszone' : /fussg|pi[ée]ton/.test(s) ? 'fussgaengerzone' : null
}
const hash = (x: unknown) => { let h = 2166136261; for (const c of JSON.stringify(x)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16) }
export function regionalLesen(d: RegionalDienst, roh: unknown): RegionalObjekt[] {
  const e6 = e6Dienst(d.id)
  if (e6) return e6Lesen(e6, roh).map(o => ({ ...o, tempo: null, zone: null, bestaetigen: false, stand: null }))
  let fs: unknown[]
  if (d.format === 'geoAdmin') fs = bundFeatures(roh,d.typ!)
  else if (d.format === 'gml') { if (typeof roh !== 'string') throw new Error('GML fehlt'); fs = regionalGml(roh).features }
  else {
    if (!istObjekt(roh)) throw new Error('Ungültige Antwort')
    if (d.format !== 'ods' && d.format !== 'poi' && d.format !== 'ogc' && (roh.type !== 'FeatureCollection' || !/2056$/.test(str((roh.crs as { properties?: { name?: string } })?.properties?.name)))) throw new Error('Antwort ist nicht LV95')
    const a = d.format === 'ods' ? roh.results : roh.features
    if (!Array.isArray(a)) throw new Error('Objektliste fehlt'); fs = a
  }
  if (fs.length > 2000) throw new Error('Zu viele Objekte im Ausschnitt')
  const ids = new Set<string>()
  return fs.map(f => {
    if (!istObjekt(f)) throw new Error('Ungültiges Objekt')
    const p = d.format === 'ods' ? f : f.properties
    if (!istObjekt(p)) throw new Error('Attribute fehlen')
    const geom = d.format === 'ods' && istObjekt(p.geo_shape) ? p.geo_shape.geometry : f.geometry
    const g = regionalGeometrie(geom, d.format === 'ods' || d.format === 'poi' || d.format === 'ogc')
    if (['tempo','strasse','tram'].includes(d.art) && !g.teile || ['zone','bauzone'].includes(d.art) && !g.polygone || ['bedarf','unfall'].includes(d.art) && !g.punkte) throw new Error('Unerwarteter Geometrietyp')
    // Einige Inventare verwenden eine Strassenkennung für mehrere Abschnitte. Die Geometrie gehört deshalb zur Kennung.
    const id = `${d.id}:${str(f.id) || p.OBJECTID || p.geodb_oid || p.id_strasse_weg || p.nr || ''}:${hash(geom)}`
    if (ids.has(id)) throw new Error('Doppeltes Objekt'); ids.add(id)
    let v: number | null = null, z: RegionalZone | null = null, name = '', stand: string | null = null, bestaetigen = false, hinweis = ''
    const bedarf = d.id.startsWith('bedarf.') ? bedarfsOrt(d.id,p) : null
    if (bedarf) {name=bedarf.name; bestaetigen=!!bedarf.bedarf?.unsicher || bedarf.bedarf?.art===null; hinweis=bedarf.bedarf ? `${bedarf.bedarf.wort}; Inventartyp ${bedarf.bedarf.typ}; ${d.hinweis}` : 'Nicht bedarfsrelevanter Inventareintrag'; const datum=str(p.datum); if(/^\d{12}$/.test(datum))stand=regionalDatum(`${datum.slice(0,4)}-${datum.slice(4,6)}-${datum.slice(6,8)}`) }
    const fach=d.id.startsWith('bund.')?bundFach(d.id,p):null
    if(fach){name=fach.name;hinweis=fach.hinweis;bestaetigen=d.art!=='unfall';if(d.id==='bund.gwr')stand=regionalDatum(p.gexpdat)}
    let verkehr: RegionalObjekt['verkehr']
    switch (d.id) {
      case 'ktzh.tempo': v = tempo(p.geschw); stand = regionalDatum(p.dat_logo); break
      case 'ktzh.zone': z = zone(p.zone_kt); name = str(p.ort_kt); stand = regionalDatum(p.datenstand); bestaetigen = true; hinweis = `Status ${str(p.zustand) || 'unbekannt'}; Verfügung ${str(p.vfg_dat)}; Umsetzung prüfen`; break
      case 'bs.tempo': v = tempo(p.geschwindigkeit); name = str(p.strassenname); z = /zone/i.test(str(p.regime)) ? zone(p.regime) : null; break
      case 'ge.tempo': v = tempo(p.VITESSE); z = /zone/i.test(str(p.TYPE_LIMITE)) ? zone(p.TYPE_LIMITE) : null; break
      case 'ge.zone': z = zone(p.TYPE_ZONE); name = str(p.NOM_ZONE); bestaetigen = !Number(p.ANNEE_MISE_EN_SERVICE) || Number(p.ANNEE_MISE_EN_SERVICE) > new Date().getUTCFullYear(); break
      case 'ur.tempo': v = tempo(p.geschwindigkeit); name = str(p.axisnamelong); stand = regionalDatum(p.datenstand); break
      case 'ur.gemeinde.tempo': v = tempo(p.tempo); name = str(p.name_untergeordnet); stand = regionalDatum(p.datum_upload_sde); break
      case 'ur.weitere.tempo': v = tempo(p.tempo); name = str(p.strassenname); stand = regionalDatum(p.datum_upload_sde); break
      case 'so.tempo': v = tempo(p.max_geschw); name = str(p.achsename).replace(/^\S+\s+/, ''); break
      case 'sz.tempo': v = tempo(p.geschwindigkeit_ui); break
      case 'fr.tempo': v = tempo(p.VITESSE); if (str(p.VITESSE_NUIT_DIFF_VALEUR).toLowerCase() !== 'non' || p.VITESSE_NUIT != null) { bestaetigen = true; hinweis = `Tag ${v ?? 'offen'} km/h; Nacht ${tempo(p.VITESSE_NUIT) ?? 'offen'} km/h (${str(p.HEURES_NUIT) || 'Zeiten unbekannt'}); gültige Zeit prüfen` }; break
      case 'ju.tempo': v = tempo(p.vitesse); break
      case 'lu.zone': z = zone(p.PP_ZONE_TEXT); bestaetigen = !/^Bestehende /i.test(str(p.PP_ZONE_TEXT)); hinweis = str(p.PP_ZONE_TEXT); break
      case 'lausanne.zone': z = zone(p.type); name = str(p.nom); bestaetigen = !/^\d{4}$/.test(str(p.creation)) || Number(p.creation) > new Date().getUTCFullYear(); break
      case 'ge.signal': name = str(p.NOM_VOIE); verkehr = p.ETAT !== 'Posé' ? undefined : p.NO_OSR === '3.01' ? 'stop' : p.NO_OSR === '3.02' ? 'give_way' : p.NO_OSR === '4.11' ? 'fgs_signal' : undefined; hinweis = `Signal ${str(p.NO_OSR)}; Zustand ${str(p.ETAT) || 'unbekannt'}; Orientierung ${str(p.ORIENTATION) || p.ORIENTATION || 'unbekannt'} (Bezug vor Ort prüfen)`; bestaetigen = true; break
      case 'ge.lsa': if (p.TYPE_CARREFOUR_SL === 'SL tricolor') verkehr = 'lsa'; name = str(p.NO_CARREFOUR_SL); break
      case 'ge.markierung': if (p.TYPE === 'Piéton') verkehr = 'fgs'; bestaetigen = true; hinweis = 'Einzelne Fussgängermarkierung; kein vollständiges Streifenobjekt'; break
      case 'lu.fgs': verkehr = 'fgs'; hinweis = `Inventarattribut SICHERHEIT: ${p.SICHERHEIT ?? 'unbekannt'}; keine Aussage zur normativen Verkehrssicherheit`; break
      case 'ktzh.fgs': if (p.status_txt === 'aktiv') verkehr = 'fgs'; stand = regionalDatum(p.dat_logo); hinweis = `${str(p.typ_txt)}; ${str(p.status_txt)}`; break
      case 'ktzh.lsa': name = str(p.bezeichnung); if (p.typ_bez === 'Lichtsignalanlage' && /betrieb|bestehend|aktiv/i.test(str(p.status_bez)) && !/ausser|abbruch|geplant/i.test(str(p.status_bez))) verkehr = 'lsa'; hinweis = `${str(p.typ_bez)}; Status ${str(p.status_bez) || 'unbekannt'}`; break
      case 'sz.signal': case 'sz.fgs_signal': {
        const code = str(p.ssv_typ_cd); verkehr = code === '3.01' ? 'stop' : code === '3.02' ? 'give_way' : code === '3.03' ? 'hauptstrasse' : code === '4.11' ? 'fgs_signal' : undefined; hinweis = `${code} ${str(p.ssv_typ_tx)}; ${str(p.beschreibung)}`; bestaetigen = true; break
      }
      case 'bs.lsa': verkehr = 'lsa'; name = str(p.lg_lsaname); break
      case 'lu.lsa': verkehr = 'lsa'; name = str(p.BEZEICHNUNG); hinweis = str(p.GERAETETYP); break
      case 'stadtzh.lsa': verkehr = 'lsa'; name = str(p.knotenbezeichnung); hinweis = `Betriebszeit ${str(p.betriebszeit) || 'unbekannt'}`; break
      case 'sg.fgs': verkehr = 'fgs'; name = str(p.strasse); hinweis = `${str(p.oertlichkeit)}; Inventarart ${str(p.art)}`; break
      case 'zg.fgs': verkehr = 'fgs'; name = str(p.bezeichnung); break
      default:
        if (d.id.startsWith('bs.zone.')) { z = zone(p.vr_regime); bestaetigen = !/^\d{4}$/.test(str(p.vr_umsetzjahr)) || Number(p.vr_umsetzjahr) > new Date().getUTCFullYear() }
        else if (d.id.startsWith('sg.zone.')) { z = d.id.includes('tempo-30') ? 't30_zone' : d.id.includes('begegnung') ? 'begegnungszone' : 'fussgaengerzone'; name = str(p.gebiet); const umgesetzt = regionalDatum(p.realisiert); bestaetigen = !umgesetzt || umgesetzt > new Date().toISOString().slice(0, 10); hinweis = `Realisiert: ${str(p.realisiert) || 'unbekannt'}` }
    }
    if (z === 'fussgaengerzone') { v = null; bestaetigen = true; hinweis += '; Fussgängerzone: Sonderzulassung prüfen, kein Tempo 0' }
    return { ...g, ...(bedarf?.bedarf ? {bedarf:bedarf.bedarf} : {}), ...(fach?.bund?{bund:fach.bund}:{}), ...(verkehr ? { verkehr } : {}), id, name, tempo: v, zone: z, stand, bestaetigen, hinweis }
  })
}
const bbox = (p: P, r: number) => [p[0] - r, p[1] - r, p[0] + r, p[1] + r].map(x => x.toFixed(2)).join(',')
export function regionalUrl(d: RegionalDienst, p: P, r = 200, hits = false): string {
  const e6 = e6Dienst(d.id)
  if (e6) return e6Url(e6, p, r, hits)
  if(d.format==='geoAdmin')return bundUrl(d.typ!,p,r)
  if(d.format==='poi')return poiUrl(p)
  const u = new URL(d.url), set = (k: string, v: string) => u.searchParams.set(k, v)
  if (d.format === 'arcgis') {
    u.pathname += '/query'; set('f', hits ? 'json' : 'geojson'); set('where', d.where ?? '1=1'); set('geometry', bbox(p, r)); set('geometryType', 'esriGeometryEnvelope'); set('inSR', '2056'); set('spatialRel', 'esriSpatialRelIntersects')
    if (hits) set('returnCountOnly', 'true'); else { set('outFields', d.felder ?? '*'); set('outSR', '2056'); set('resultRecordCount', '2000') }
  } else if (d.format === 'ogc') {
    const [s,w]=wgs(p[0]-r,p[1]-r), [n,e]=wgs(p[0]+r,p[1]+r); set('f','json'); set('bbox',[w,s,e,n].map(x=>x.toFixed(7)).join(',')); set('limit','2000')
  } else if (d.format === 'ods') {
    const [s, w] = wgs(p[0] - r, p[1] - r), [n, e] = wgs(p[0] + r, p[1] + r)
    set('where', `intersects(geo_shape, geom'POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))')`); set('limit', '100'); set('offset', '0')
  } else if (d.format === 'qwc') set('bbox', bbox(p, r))
  else {
    const ver = d.version ?? '2.0.0'; set('SERVICE', 'WFS'); set('VERSION', ver); set('REQUEST', 'GetFeature'); set(ver === '2.0.0' ? 'TYPENAMES' : 'TYPENAME', d.typ!); set('SRSNAME', 'EPSG:2056'); set('BBOX', `${bbox(p, r)},EPSG:2056`)
    if (hits) set('RESULTTYPE', 'hits'); else { set(ver === '2.0.0' ? 'COUNT' : 'MAXFEATURES', '2000'); if (d.format !== 'gml') set('OUTPUTFORMAT', d.output ?? (d.kanton === 'UR' ? 'application/json' : 'geojson')) }
  }
  return u.toString()
}
export function regionalStand(d: RegionalDienst, objekte: RegionalObjekt[], meta: unknown): string {
  if (e6Dienst(d.id)) return e6Stand(meta)
  const dates = [...new Set(objekte.map(o => o.stand).filter((s): s is string => !!s))].sort()
  const dt = (s: string) => s.split('-').reverse().join('.')
  if (dates.length && d.id.startsWith('bedarf.')) {
    const range=dates.length===1?dt(dates[0]):`${dt(dates[0])}–${dt(dates[dates.length-1])}`
    const m=istObjekt(meta)&&istObjekt(meta.result)?regionalDatum(meta.result.dateLastUpdated):null
    return `${range} (Objektfeld datum; ${objekte.filter(o=>!o.stand).length} ohne Stand)${m?`; ${dt(m)} (Katalogaktualisierung)`:''}`
  }
  if (dates.length) return `${dates.map(dt).join(', ')} (Objekt-/Exportstand; ${objekte.filter(o => !o.stand).length} ohne Stand)`
  if (istObjekt(meta)) {
    if(d.format==='geoAdmin' && typeof meta.legende==='string'){const stand=bavDatenstand(meta.legende);if(stand)return `${dt(stand)} (Ebene laut geo.admin.ch)`}
    if(d.format==='poi' && typeof meta.datenstand==='string' && meta.datenstand.length<2000)return meta.datenstand
    const z = istObjekt(meta.result) ? str(meta.result.dateLastUpdated).match(/^(\d{2})\.(\d{2})\.(\d{4})$/) : null
    const zd = z ? regionalDatum(`${z[3]}-${z[2]}-${z[1]}`) : null
    if (zd) return `${dt(zd)} (Katalogaktualisierung)`
    if (d.format === 'ods') { const m = (meta.metas as { default?: { modified?: unknown } })?.default, t = regionalDatum(m?.modified); if (t) return `${dt(t)} (Katalogangabe modified)` }
    const ed = meta.editingInfo as { lastEditDate?: unknown } | undefined, t = ed?.lastEditDate
    if (typeof t === 'number' && Number.isFinite(t) && t > 0 && t < 4102444800000) return `${dt(new Date(t).toISOString().slice(0, 10))} (Dienstaktualisierung)`
  }
  return 'unbekannt (Dienst liefert keinen verwendbaren Datenstand)'
}
export async function ladeRegional(d: RegionalDienst, p: P, r = 200, signal?: AbortSignal): Promise<Abruf<RegionalTeil>> {
  const e6 = e6Dienst(d.id)
  if (e6) { const a = await ladeE6(e6, p, r, signal); return { ...a, daten: { ...a.daten, objekte: regionalLesen(d, a.daten.roh) } } }
  const url = regionalUrl(d, p, r), start = performance.now()
  if(d.format==='geoAdmin'||d.format==='poi'){
    const a=d.format==='geoAdmin'?await ladeBundGeoAdmin(d.typ!,p,r,signal):await import('./bundPoi').then(m=>m.ladeBundPoi(p,r,signal))
    const objekte=regionalLesen(d,a.daten.roh)
    return {...a,daten:{id:d.id,url,abgerufen:new Date().toISOString(),datenstand:regionalStand(d,objekte,a.daten.meta),objekte,roh:a.daten.roh,meta:a.daten.meta}}
  }
  const metaAuftrag = d.meta ? holeJson<unknown>(d.meta, {}, 10000, signal).catch(() => null) : Promise.resolve(null)
  let roh: unknown, bytes = 0
  const meta = await (async () => {
    if (d.format === 'gml') {
      const [res, text] = await holeText(url, {}, 30000, signal); if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const g = regionalGml(text); roh = text; bytes += text.length
      const [hr, ht] = await holeText(regionalUrl(d, p, r, true), {}, 15000, signal)
      const n = ht.match(/(?:numberMatched|numberOfFeatures)=["'](\d+)["']/)?.[1]
      if (!hr.ok || n === undefined || Number(n) !== g.features.length || g.next) throw new Error('Unvollständige GML-Antwort; Zuordnung offen')
      bytes += ht.length
    } else {
      const a = await holeJson<Record<string, unknown>>(url, {}, 30000, signal); roh = a.daten; bytes += a.bytes
      if (d.format === 'ogc') {
        if (a.daten.type !== 'FeatureCollection' || !Array.isArray(a.daten.features)) throw new Error('OGC-Objektliste fehlt')
        const all = [...a.daten.features], seen = new Set<string>([url]); let page = a.daten
        while (true) {
          if (page.numberReturned !== (page.features as unknown[]).length) throw new Error('Unvollständige OGC-Antwort')
          const links = Array.isArray(page.links) ? page.links : []
          const next = links.filter((l):l is {rel:string;href:string} => istObjekt(l) && l.rel === 'next' && typeof l.href === 'string')
          if (next.length > 1) throw new Error('Mehrdeutige OGC-Folgeseite')
          if (!next.length) { if ((page.features as unknown[]).length >= 2000 || typeof page.numberMatched === 'number' && page.numberMatched !== all.length) throw new Error('OGC-Antwort an Übertragungsgrenze'); break }
          const u = new URL(next[0].href, url), original = new URL(url)
          if (u.origin !== original.origin || u.pathname !== original.pathname || u.searchParams.get('bbox') !== original.searchParams.get('bbox') || seen.has(u.href) || seen.size >= 10) throw new Error('Ungültige OGC-Folgeseite')
          seen.add(u.href)
          const b = await holeJson<Record<string,unknown>>(u.href,{},20000,signal)
          if (b.daten.type !== 'FeatureCollection' || !Array.isArray(b.daten.features) || !b.daten.features.length) throw new Error('Leere OGC-Folgeseite')
          page=b.daten;all.push(...b.daten.features);bytes+=b.bytes
          if(all.length>2000)throw new Error('Zu viele OGC-Objekte')
        }
        roh={...a.daten,features:all,numberReturned:all.length,links:[]}
      } else if (d.format === 'ods') {
        const total = a.daten.total_count, rows = a.daten.results
        if (typeof total !== 'number' || total > 2000 || !Array.isArray(rows)) throw new Error('Unvollständige Explore-Antwort')
        const all = [...rows]
        for (let off = rows.length; off < total;) {
          const u = new URL(url); u.searchParams.set('offset', String(off)); const next = await holeJson<{ results: unknown[]; total_count: number }>(u.toString(), {}, 20000, signal)
          if (!Array.isArray(next.daten.results) || !next.daten.results.length || next.daten.total_count !== total) throw new Error('Ausschnitt während Abruf verändert')
          all.push(...next.daten.results); off = all.length; bytes += next.bytes
        }
        if (all.length !== total) throw new Error('Unvollständige Explore-Antwort'); roh = { ...a.daten, results: all }
      } else {
        let count: unknown = a.daten.numberMatched
        if (d.format === 'arcgis') { const h = await holeJson<{ count?: number }>(regionalUrl(d, p, r, true), {}, 15000, signal); count = h.daten.count; bytes += h.bytes }
        else if (d.format === 'wfs') { const [hr, ht] = await holeText(regionalUrl(d, p, r, true), {}, 15000, signal); const n = ht.match(/(?:numberMatched|numberOfFeatures)=["'](\d+)["']/)?.[1]; if (!hr.ok || n === undefined) throw new Error('Trefferzahl fehlt'); count = Number(n); bytes += ht.length }
        if (typeof count !== 'number' || !Array.isArray(a.daten.features) || count !== a.daten.features.length || a.daten.exceededTransferLimit === true) throw new Error('Unvollständige Antwort; Übertragungsgrenze oder veränderter Ausschnitt')
      }
    }
    return metaAuftrag
  })()
  if (signal?.aborted) throw new DOMException('abgebrochen', 'AbortError')
  const objekte = regionalLesen(d, roh), m = meta?.daten
  return { daten: { id: d.id, url, abgerufen: new Date().toISOString(), datenstand: regionalStand(d, objekte, m), objekte, roh, ...(m !== undefined ? { meta: m } : {}) }, ms: performance.now() - start, bytes: bytes + (meta?.bytes ?? 0), quelle: new URL(d.url).host }
}
export function regionalSnapshotLesen(x: unknown, hinweise: string[] = []): RegionalSnapshot | null {
  if (!istObjekt(x) || x.version !== 1 || !Array.isArray(x.mitte) || x.mitte.length !== 2 || !x.mitte.every(v => typeof v === 'number' && Number.isFinite(v)) || x.mitte[0] < 2400000 || x.mitte[0] > 2900000 || x.mitte[1] < 1000000 || x.mitte[1] > 1400000 || typeof x.radiusM !== 'number' || x.radiusM < 10 || x.radiusM > 500 || !Array.isArray(x.teile) || x.teile.length > 50) return null
  try {
    const ids = new Set<string>(), mitte = x.mitte as P, radiusM = x.radiusM
    const uebersprungen: string[] = []
    const teile: RegionalTeil[] = []
    for (const t of x.teile) {
      if (!istObjekt(t) || typeof t.id !== 'string' || ids.has(t.id)) throw new Error('Ungültige Quelle')
      ids.add(t.id); const d = regionalDienst(t.id)
      if (!d) {
        uebersprungen.push(`Unbekannte regionale Quelle «${t.id}» übersprungen; bekannte Quellen bleiben erhalten.`)
        continue
      }
      if (t.url !== regionalUrl(d, mitte, radiusM) || typeof t.abgerufen !== 'string' || !regionalDatum(t.abgerufen)) throw new Error('Ungültiger Ausschnitt')
      const objekte = regionalLesen(d, t.roh)
      teile.push({ id: d.id, url: t.url, abgerufen: t.abgerufen, objekte, datenstand: regionalStand(d, objekte, t.meta), roh: t.roh, ...(t.meta !== undefined ? { meta: t.meta } : {}) })
    }
    hinweise.push(...uebersprungen)
    return { version: 1, mitte, radiusM, teile }
  } catch { return null }
}

/** Falldatei: nur eine Rohfassung je Teil; abgeleitete Objekte entstehen beim Lesen erneut. */
export function regionalSnapshotSchreiben(s: RegionalSnapshot) {
  return { ...s, teile: s.teile.map(({ objekte: _abgeleitet, ...teil }) => teil) }
}
