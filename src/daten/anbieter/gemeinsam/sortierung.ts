import { REGIONAL_THEMA } from './regionalLegende'
import { regionalDienst } from './regionalDienste'
const kollator = new Intl.Collator('de-CH', { sensitivity: 'base', numeric: true })
export const alphabetisch = (a: string, b: string): number => kollator.compare(a, b)

const THEMEN: Record<string, string> = {
  av: 'Vermessung', sosf: 'Vermessung – Einzelobjekte', osm: 'Strassennetz (OSM)', suche: 'Übergänge und Strassennamen',
  luftbild: 'Luftbild', hoehen: 'Höhenmodell', hoehenSicht: 'Höhenmodell – Wartefläche', hoehenBern: 'Höhenmodell', hoehenSichtBern: 'Höhenmodell – Wartefläche',
  kataster: 'Bäume', baumkataster: 'Bäume', parkkataster: 'Parkfelder', bav: 'Haltestellen', haltestellen: 'Haltestellen',
  gebiet: 'Gebietsangaben', verkehrsdaten: 'Verkehrsmenge (DTV)', npvm: 'Verkehrsmenge (DTV)', richtplan: 'Fusswegnetz',
  strassenhierarchie: 'Strassenhierarchie und Strassentypen', vsig: 'Tempo', zhTempo: 'Tempo', zhZonen: 'Verkehrszonen', schulen: 'Schulen, Kindergärten und Heime',
  taktil: 'Taktile Markierungen (Stadt Bern)', nutzungszonen: 'Nutzungszonen', oevLinien: 'ÖV-Linien',
}
export const quellenThema = (key: string, name: string): string => {
  if (key === 'regional.e6.zh.taktil') return 'Taktile Rillen an VBZ-Haltestellen (Zürich)'
  const art = key.startsWith('regional.') ? regionalDienst(key.slice(9))?.art : null
  return THEMEN[key] ?? (art ? REGIONAL_THEMA[art] : key.startsWith('eth.fgs.') ? 'Luftbild – Streifenkandidaten' : name)
}
export function quellenSortiert<T extends { name: string }>(quellen: Readonly<Record<string, T>>): [string, T][] {
  return Object.entries(quellen).sort(([ka, a], [kb, b]) =>
    alphabetisch(quellenThema(ka, a.name), quellenThema(kb, b.name)) || alphabetisch(a.name, b.name))
}
