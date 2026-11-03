import { REGIONAL_DIENSTE } from '../daten/anbieter/gemeinsam/regionalDienste'
import type { Quelle } from './eingaben'
import { TEMPO_QUELLE_AMTLICH } from '../rechner/tempo'
/** Herkunft der tatsächlich verwendeten Zufahrtswerte, auch bei mehreren Anbietern. */
export function tempoQuelleArt(qs: string[]): Quelle {
  if (qs.includes('Korrektur')) return 'hand'
  if (qs.some(q => q.startsWith('Schätzung'))) return 'schaetzung'
  if (qs.some(q => q.startsWith('Annahme'))) return 'annahme'
  if (qs.some(q => q.startsWith('bestätigt'))) return 'bestaetigt'
  if (qs.includes('Ersatz')) return 'annahme'
  if (qs.length && qs.every(q => q === TEMPO_QUELLE_AMTLICH || q.startsWith('Geoportal Stadt Bern'))) return 'geoportal'
  if (qs.some(q => q === 'Stadt Zürich' || q === 'amtliche regionale Quelle' || REGIONAL_DIENSTE.some(d => q.startsWith(d.anbieter)))) return 'amtlich'
  return 'osm'
}
export const tempoQuellenName = (qs: string[]) => [...new Set(qs.map(q => q === TEMPO_QUELLE_AMTLICH ? 'Geoportal Stadt Bern' : q.startsWith('OSM') ? 'OSM' : q === 'Korrektur' ? 'von Hand' : q === 'Ersatz' ? 'angenommen' : q))].join(' / ')
