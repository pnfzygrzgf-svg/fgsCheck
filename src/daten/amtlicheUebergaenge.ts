import { dist, lv95, type P } from '../geo'
import type { RegionalSnapshot } from './anbieter/gemeinsam/regional'
import { regionalDienst } from './anbieter/gemeinsam/regionalDienste'
import { istObjekt } from './anbieter/gemeinsam/regionalGeometrie'
export interface AmtlicherUebergang { id: number; objektId: string; quelleId: string; p: P; name: string; datenstand: string; abgerufen: string; hinweis: string }
const idFuer = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return -7000000000000000 - (h >>> 0) }
export const amtlicherText = (h: AmtlicherUebergang) => `${h.name}; ${h.hinweis}; Datenstand ${h.datenstand}; abgerufen ${h.abgerufen}; ${h.objektId}`
export function amtlicheKandidaten(s: RegionalSnapshot | null, osm: { lat: number; lon: number }[]): AmtlicherUebergang[] {
  const aus: AmtlicherUebergang[] = []
  for (const t of s?.teile ?? []) for (const o of t.objekte) {
    if (o.verkehr !== 'fgs') continue
    // Markierungslinien liefern nur einen Suchpunkt, keine bestätigte Streifenachse oder Breite.
    const points = o.punkte ?? (o.teile ?? []).map(l => l[Math.floor(l.length / 2)])
    for (const p of points) {
      if (osm.some(k => dist(lv95(k.lat,k.lon),p) <= 15) || aus.some(k => dist(k.p,p) < 8)) continue
      aus.push({ id: idFuer(o.id), objektId: o.id, quelleId: t.id, p, name: regionalDienst(t.id)?.name ?? t.id, datenstand: t.datenstand, abgerufen: t.abgerufen,
        hinweis: `${o.hinweis}; amtlicher Suchpunkt ohne OSM-Gegenstück; Achse, Breite, Insel und Bestand prüfen` })
    }
  }
  return aus
}
export function amtlicherUebergangLesen(x: unknown): AmtlicherUebergang | null {
  if (!istObjekt(x) || typeof x.objektId !== 'string' || typeof x.quelleId !== 'string' || !regionalDienst(x.quelleId) || x.id !== idFuer(x.objektId)
    || !Array.isArray(x.p) || x.p.length !== 2 || !x.p.every(v => typeof v === 'number' && Number.isFinite(v)) || x.p[0]<2400000 || x.p[0]>2900000 || x.p[1]<1000000 || x.p[1]>1400000
    || typeof x.name !== 'string' || x.name.length>1000 || typeof x.hinweis !== 'string' || x.hinweis.length>8000 || typeof x.datenstand !== 'string' || x.datenstand.length>2000 || typeof x.abgerufen !== 'string' || !Number.isFinite(Date.parse(x.abgerufen))) return null
  return { id:x.id as number, objektId:x.objektId, quelleId:x.quelleId, p:[x.p[0],x.p[1]], name:x.name, hinweis:x.hinweis, datenstand:x.datenstand, abgerufen:x.abgerufen }
}
