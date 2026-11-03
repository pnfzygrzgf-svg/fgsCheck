import { describe, expect, it } from 'vitest'
import { osmDatenstand, quellenQualitaetText } from './qualitaet'

describe('Quellenstand und Vollständigkeit', () => {
  it('unterscheidet unbekannten Datenstand, Quellenstand und Abrufzeit', () => {
    expect(quellenQualitaetText()).toBe('Datenstand unbekannt; Vollständigkeit unbekannt')
    expect(quellenQualitaetText({ datenstand: '01.11.2026 (Ebene)' })).toBe('Datenstand 01.11.2026 (Ebene); Vollständigkeit unbekannt')
    expect(osmDatenstand({ osm3s: { timestamp_osm_base: '2026-10-30T15:16:17Z' } })).toBe('30.10.2026, 15:16:17 UTC (OSM-Datenbank)')
    expect(osmDatenstand({ elements: [], abgerufen: '2026-11-01' })).toBeUndefined()
    expect(osmDatenstand({ osm3s: { timestamp_osm_base: '118162' } })).toBe('unbekannt (OSM-Replikationsstand 118162)')
    expect(osmDatenstand({ osm3s: { timestamp_osm_base: '2026-02-30T15:16:17Z' } })).toBeUndefined()
  })
})
