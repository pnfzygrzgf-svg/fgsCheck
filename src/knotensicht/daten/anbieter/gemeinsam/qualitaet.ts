/** Fachlicher Quellenstand und Inventarvollständigkeit; Abrufzeit ist kein Datenstand. */
export interface QuellenQualitaet { datenstand?: string; vollstaendigkeit?: string; datenstaende?: Record<string, string> }

export const quellenQualitaetText = (q: QuellenQualitaet = {}): string =>
  `Datenstand ${q.datenstand || 'unbekannt'}; Vollständigkeit ${q.vollstaendigkeit || 'unbekannt'}`

/** Overpass nennt den Stand seiner OSM-Datenbank, nicht das Änderungsdatum jedes Objekts. */
export function osmDatenstand(roh: unknown): string | undefined {
  const t = (roh as { osm3s?: { timestamp_osm_base?: unknown } } | null)?.osm3s?.timestamp_osm_base
  // Der Schweizer Mirror liefert hier derzeit eine Replikationsnummer statt eines ISO-Datums.
  if (typeof t === 'string' && /^\d{1,15}$/.test(t)) return `unbekannt (OSM-Replikationsstand ${t})`
  if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(t)) return undefined
  const d = new Date(t)
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 19) !== t.slice(0, 19)) return undefined
  return `${t.slice(0, 10).split('-').reverse().join('.')}, ${t.slice(11, 19)} UTC (OSM-Datenbank)`
}
