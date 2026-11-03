import { describe, expect, it } from 'vitest'
import { alphabetisch, quellenSortiert } from './sortierung'

describe('Quellen alphabetisch nach Thema', () => {
  it('sortiert Schweizer Umlaute und Themen unabhängig von Ladefolge und Anbietername', () => {
    const q = { av: { name: 'Amtliche Vermessung' }, suche: { name: 'OSM' }, npvm: { name: 'ARE' },
      vsig: { name: 'Geoportal Bern' }, kataster: { name: 'Kataster' } }
    expect(quellenSortiert(q).map(([k]) => k)).toEqual(['kataster', 'vsig', 'suche', 'npvm', 'av'])
    expect(Object.keys(q)[0]).toBe('av')
    expect(['Tempo', 'Bäume', 'ÖV-Linien'].sort(alphabetisch)).toEqual(['Bäume', 'ÖV-Linien', 'Tempo'])
  })
})
