import { dist } from '../../geo'
import { istLv95 } from './gemeinsam/geoAdmin'
import { NPVM_LAYER, NPVM_METADATEN_URL, npvmUmwandeln, type NpvmBeleg, type NpvmSnapshot } from './npvm'

const objekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const zeit = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(x) && Number.isFinite(Date.parse(x))
const datum = (x: unknown): boolean => x === null || typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x
function quelleUrl(x: unknown): x is string {
  if (typeof x !== 'string' || x.length > 2000) return false
  try { const u = new URL(x); return u.origin === 'https://api3.geo.admin.ch' && u.pathname === '/rest/services/ech/MapServer/identify' &&
    u.searchParams.get('layers') === `all:${NPVM_LAYER}` && u.searchParams.get('sr') === '2056' } catch { return false }
}
export function npvmBelegLesen(x: unknown): NpvmBeleg | null {
  if (!objekt(x) || x.version !== 1 || x.quelleId !== 'are.npvm' || typeof x.wert !== 'number' || !Number.isFinite(x.wert) ||
    x.wert < 0 || x.wert > 500000 || typeof x.linie !== 'string' || !/^npvm:\d{1,15}$/.test(x.linie) ||
    !Number.isSafeInteger(x.nr) || (x.nr as number) <= 0 || x.bezugsjahr !== 2023 || !datum(x.datenstand) || !zeit(x.abgerufen) || !quelleUrl(x.url) ||
    x.bezug !== 'summe_richtungen_je_modellstrecke' || x.zuordnung !== 'achsenschnitt_und_osm_nähe' ||
    !Array.isArray(x.achse) || x.achse.length !== 2 || !x.achse.every(istLv95) || dist(x.achse[0], x.achse[1]) < 0.5 || dist(x.achse[0], x.achse[1]) > 500) return null
  return { version: 1, quelleId: 'are.npvm', wert: x.wert, linie: x.linie, nr: x.nr as number, bezugsjahr: 2023,
    datenstand: x.datenstand as string | null, abgerufen: x.abgerufen, url: x.url, achse: [[...x.achse[0]], [...x.achse[1]]],
    bezug: 'summe_richtungen_je_modellstrecke', zuordnung: 'achsenschnitt_und_osm_nähe' }
}
export function npvmSnapshotLesen(x: unknown): NpvmSnapshot | null {
  if (!objekt(x) || x.version !== 1 || x.quelleId !== 'are.npvm' || !zeit(x.abgerufen) || !datum(x.datenstand) ||
    !(x.bezugsjahr === null || typeof x.bezugsjahr === 'number' && Number.isInteger(x.bezugsjahr) && x.bezugsjahr >= 2000 && x.bezugsjahr <= 2100) ||
    x.datenstandQuelle !== NPVM_METADATEN_URL || !istLv95(x.mitte) || typeof x.radiusM !== 'number' || !Number.isFinite(x.radiusM) ||
    x.radiusM <= 0 || x.radiusM > 1000 || !quelleUrl(x.url) || x.vollstaendigkeit !== 'unbekannt' || !Array.isArray(x.linien) || x.linien.length > 2000) return null
  try {
    const ids = new Set<string>()
    for (const l of x.linien) if (!objekt(l) || !(l.dtv === null || typeof l.dtv === 'number' && Number.isFinite(l.dtv) && l.dtv >= 0 && l.dtv <= 500000) || typeof l.id !== 'string' || !/^npvm:\d{1,15}$/.test(l.id) || ids.has(l.id)) return null
      else ids.add(l.id)
    const linien = npvmUmwandeln({ results: x.linien.map(l => ({ layerBodId: NPVM_LAYER, featureId: l.id.slice(5),
      properties: { nr: l.nr, dtv_fzg: l.dtv, dwv_fzg: l.dwv, msp_fzg: l.msp, asp_fzg: l.asp, dtv_lw: l.lw, dtv_lz: l.lz }, geometry: { type: 'MultiLineString', coordinates: l.teile } })) })
    return { version: 1, quelleId: 'are.npvm', abgerufen: x.abgerufen, datenstand: x.datenstand as string | null,
      bezugsjahr: x.bezugsjahr as number | null, datenstandQuelle: NPVM_METADATEN_URL, mitte: [...x.mitte], radiusM: x.radiusM,
      url: x.url, vollstaendigkeit: 'unbekannt', linien }
  } catch { return null }
}
