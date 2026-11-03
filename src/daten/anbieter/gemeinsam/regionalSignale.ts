import { dist, type P } from '../../../geo'
import type { RegionalSnapshot } from './regional'
import { regionalDienst } from './regionalDienste'
import { istObjekt } from './regionalGeometrie'
export interface SignalEntscheid { objektId: string; quelleId: string; name: string; art: 'stop' | 'give_way' | 'lsa'; knoten: number; zufahrt: string; p: P; datenstand: string; abgerufen: string }
export interface SignalZiel { knoten: number; zufahrt: string; p: P; name: string }
export function signalEntscheideLesen(x: unknown): SignalEntscheid[] {
  if (!Array.isArray(x) || x.length > 50) return []
  return x.flatMap(o => istObjekt(o) && typeof o.objektId === 'string' && typeof o.quelleId === 'string' && !!regionalDienst(o.quelleId)
    && ['stop', 'give_way', 'lsa'].includes(String(o.art)) && o.objektId.startsWith(`${o.quelleId}:`) && (o.art === 'lsa' ? regionalDienst(o.quelleId)?.art === 'lsa' : regionalDienst(o.quelleId)?.art === 'signal') && typeof o.knoten === 'number' && Number.isSafeInteger(o.knoten)
    && typeof o.zufahrt === 'string' && /^-?\d+:\d+:(?:-1|1)$/.test(o.zufahrt) && o.zufahrt.length < 100 && typeof o.name === 'string' && o.name.length < 1000
    && Array.isArray(o.p) && o.p.length === 2 && o.p.every(v => typeof v === 'number' && Number.isFinite(v))
    && o.p[0] >= 2400000 && o.p[0] <= 2900000 && o.p[1] >= 1000000 && o.p[1] <= 1400000
    && typeof o.datenstand === 'string' && o.datenstand.length < 2000 && typeof o.abgerufen === 'string' && Number.isFinite(Date.parse(o.abgerufen))
    ? [{ objektId: o.objektId, quelleId: o.quelleId, name: o.name, art: o.art as SignalEntscheid['art'], knoten: o.knoten, zufahrt: o.zufahrt, p: [o.p[0], o.p[1]] as P, datenstand: o.datenstand, abgerufen: o.abgerufen }] : [])
}
export function signalVorschlaege(s: RegionalSnapshot | null, ziel: SignalZiel): SignalEntscheid[] {
  return (s?.teile ?? []).flatMap(t => t.objekte.flatMap(o => o.verkehr && ['stop','give_way','lsa'].includes(o.verkehr)
    ? (o.punkte ?? []).filter(p => dist(p, ziel.p) <= 40).map(p => ({ objektId: o.id, quelleId: t.id, name: `${regionalDienst(t.id)?.anbieter}: ${o.name || o.hinweis || o.id}`,
      art: o.verkehr as SignalEntscheid['art'], knoten: ziel.knoten, zufahrt: ziel.zufahrt, p, datenstand: t.datenstand, abgerufen: t.abgerufen })) : []))
}
export const signalText = (e: SignalEntscheid) => `${e.art === 'stop' ? 'Stop' : e.art === 'give_way' ? 'Kein Vortritt' : 'Lichtsignalanlage'}; ${e.name}; Zuordnung bestätigt; Datenstand ${e.datenstand}; abgerufen ${e.abgerufen}; ${e.objektId}`
