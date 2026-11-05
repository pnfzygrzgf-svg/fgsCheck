// Tests 3D-Ansicht, Ladezustand (stand.ts): Zeile für «Datenquellen und Ladezustand»
import { describe, expect, it } from 'vitest'
import { TITEL, quelleZeile } from './stand'

describe('quelleZeile', () => {
  it('leer, solange die Ansicht geschlossen ist oder lädt', () => {
    expect(quelleZeile({ phase: 'aus', text: '' })).toEqual({})
    expect(quelleZeile({ phase: 'laedt', text: 'Lädt …' })).toEqual({})
  })
  it('bereit: Objekte, Dauer, Datum der Kachelpfade; keine Bytes', () => {
    const z = quelleZeile({ phase: 'bereit', text: 'Bereit.', zeit: '2026-11-04T10:00:00.000Z', ms: 1234, gebaeude: 'an', baeume: 'aus', luftbild: true, gpuBytes: 3 * 1048576,
      stand: { gelaende: '20250101', gebaeude: '20260520' } }).ansicht3d
    expect(z.name).toBe(TITEL)
    expect(z.datenstand).toBe('Gelände 01.01.2025, Gebäude 20.05.2026 (Datum der Kachelpfade)')
    expect(z.objekte).toBe('Gelände und Luftbild, Gebäude, Speicherschätzung 3 MB')
    expect([z.ms, z.zeit, z.bytes, z.fehler]).toEqual([1234, '2026-11-04T10:00:00.000Z', undefined, undefined])
    expect(z.server).toContain('keine Änderung der Rechnung')
  })
  it('Fehler und fehlende Gebäude werden genannt; unbekannter Stand bleibt unbekannt', () => {
    const z = quelleZeile({ phase: 'fehler', text: 'Gelände nicht erreichbar', gebaeude: 'fehlt' }).ansicht3d
    expect(z.fehler).toBe('Gelände nicht erreichbar'); expect(z.datenstand).toBe('unbekannt'); expect(z.objekte).toContain('Gebäude nicht verfügbar')
  })
  it('ohne Luftbild wird die Karte swissTLM genannt', () => {
    const z = quelleZeile({ phase: 'bereit', text: 'Bereit.', gebaeude: 'an', luftbild: false }).ansicht3d
    expect(z.objekte).toBe('Gelände und Karte swissTLM, Gebäude')
  })
  it('Brücken: genannt, mit Datum der Kachelpfade; fehlende Brücken werden gemeldet', () => {
    const z = quelleZeile({ phase: 'bereit', text: 'Bereit.', gebaeude: 'an', bruecken: 'an', stand: { bruecken: '20260520' } }).ansicht3d
    expect(z.objekte).toBe('Gelände und Karte swissTLM, Gebäude, Brücken')
    expect(z.datenstand).toBe('Brücken 20.05.2026 (Datum der Kachelpfade)')
    expect(quelleZeile({ phase: 'bereit', text: 'Bereit.', bruecken: 'fehlt' }).ansicht3d.objekte).toContain('Brücken nicht verfügbar')
  })
})
