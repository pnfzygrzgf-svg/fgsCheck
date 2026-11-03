import { istLv95 } from './geoAdmin'
import type { AmtlicheQuellen, AmtlicherHalt, BavSnapshot, Gemeinde, GebietSnapshot } from './typen'
import { BAV_METADATEN_URL } from './bav'

const objekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const text = (x: unknown, max = 500): x is string => typeof x === 'string' && x.length > 0 && x.length <= max
const zeit = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(x) && Number.isFinite(Date.parse(x))
const basis = (x: Record<string, unknown>) => x.version === 1 && zeit(x.abgerufen) && istLv95(x.mitte) &&
  typeof x.radiusM === 'number' && x.radiusM > 0 && x.radiusM <= 1000

export function bavLesen(x: unknown): BavSnapshot | null {
  if (!objekt(x) || !basis(x) || x.quelleId !== 'bav.halt' ||
    !(x.datenstand === null || (typeof x.datenstand === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.datenstand) &&
      Number.isFinite(Date.parse(x.datenstand)) && new Date(x.datenstand).toISOString().slice(0, 10) === x.datenstand && x.datenstandQuelle === BAV_METADATEN_URL)) || x.vollstaendigkeit !== 'unbekannt' ||
    !text(x.url, 2000) || !Array.isArray(x.halte) || x.halte.length > 2000) return null
  try {
    const u = new URL(x.url)
    if (u.origin !== 'https://api3.geo.admin.ch' || u.pathname !== '/rest/services/ech/MapServer/identify' ||
      u.searchParams.get('layers') !== 'all:ch.bav.haltestellen-oev' || u.searchParams.get('sr') !== '2056') return null
  } catch { return null }
  const mitte = x.mitte as [number, number], radiusM = x.radiusM as number, gesehen = new Set<string>(), halte: AmtlicherHalt[] = []
  for (const h of x.halte) {
    if (!objekt(h) || !text(h.id, 120) || !h.id.startsWith('bav:') || gesehen.has(h.id) || !text(h.nummer, 80) ||
      !text(h.name) || !istLv95(h.p) || !['bus', 'tram', 'bus_tram'].includes(h.art as string) ||
      Math.abs(h.p[0] - mitte[0]) > radiusM + 0.01 || Math.abs(h.p[1] - mitte[1]) > radiusM + 0.01) return null
    gesehen.add(h.id)
    halte.push({ id: h.id, nummer: h.nummer, name: h.name, p: [h.p[0], h.p[1]], art: h.art as AmtlicherHalt['art'] })
  }
  return { version: 1, quelleId: 'bav.halt', abgerufen: x.abgerufen as string, datenstand: x.datenstand as string | null,
    ...(x.datenstandQuelle === BAV_METADATEN_URL ? { datenstandQuelle: BAV_METADATEN_URL } : {}),
    ...(text(x.datenstandHinweis) ? { datenstandHinweis: x.datenstandHinweis } : {}), mitte: [...mitte], radiusM,
    url: x.url, vollstaendigkeit: 'unbekannt', halte }
}
function gemeinden(x: unknown): Gemeinde[] | null {
  if (!Array.isArray(x) || x.length > 100) return null
  const aus: Gemeinde[] = [], ids = new Set<number>()
  for (const g of x) {
    if (!objekt(g) || typeof g.bfs !== 'number' || !Number.isInteger(g.bfs) || g.bfs <= 0 || ids.has(g.bfs) ||
      typeof g.kanton !== 'string' || !/^[A-Z]{2}$/.test(g.kanton) || !text(g.name)) return null
    ids.add(g.bfs); aus.push({ bfs: g.bfs, kanton: g.kanton, name: g.name })
  }
  return aus
}
export function gebietLesen(x: unknown): GebietSnapshot | null {
  if (!objekt(x) || !basis(x) || x.quelleId !== 'swisstopo.gebiet' || typeof x.jahr !== 'number' ||
    !Number.isInteger(x.jahr) || x.jahr < 2020 || x.jahr > 2100) return null
  const amOrt = gemeinden(x.amOrt), imAusschnitt = gemeinden(x.imAusschnitt)
  if (!amOrt?.length || !imAusschnitt || !amOrt.every(g => imAusschnitt.some(a => a.bfs === g.bfs))) return null
  return { version: 1, quelleId: 'swisstopo.gebiet', jahr: x.jahr, abgerufen: x.abgerufen as string,
    mitte: [...x.mitte as [number, number]], radiusM: x.radiusM as number, amOrt, imAusschnitt }
}
export function amtlicheQuellenLesen(x: unknown, hinweise: string[]): AmtlicheQuellen | undefined {
  if (x === undefined) return undefined
  if (!objekt(x)) { hinweise.push('Amtliche Quellen ungültig, übergangen'); return undefined }
  const aus: AmtlicheQuellen = {}
  if (x.bav !== undefined) { const b = bavLesen(x.bav); if (b) aus.bav = b; else hinweise.push('Gespeicherte BAV-Haltestellen ungültig, übergangen') }
  if (x.gebiet !== undefined) { const g = gebietLesen(x.gebiet); if (g) aus.gebiet = g; else hinweise.push('Gespeicherte Gebietsbestimmung ungültig, übergangen') }
  return Object.keys(aus).length ? aus : undefined
}
