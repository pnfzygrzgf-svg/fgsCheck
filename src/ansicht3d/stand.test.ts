// Tests 3D-Ansicht, Ladezustand (stand.ts): Zeile für «Datenquellen und Ladezustand»
import { describe, expect, it } from 'vitest'
import { TITEL, quelleZeile, einzelQuellenZeilen } from './stand'

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

describe('Einzelquellen für die bestehende Liste', () => {
  it('trennt Laden, Fehler und ausgeschaltete Ebenen; ein Kacheldatum belegt keinen Ladevorgang', () => {
    const z = einzelQuellenZeilen({ phase: 'laedt', text: '', stand: { gebaeude: '20260520' }, kunstbauten: 0,
      quellen: { gelaende: { aktiv: true, zustand: 'geladen', geladen: true }, grundkarte: { aktiv: true, zustand: 'lädt' },
        luftbild: { aktiv: false, zustand: 'aus' }, gebaeude: { aktiv: false, zustand: 'geladen', geladen: true },
        bruecken: { aktiv: true, zustand: 'Fehler', fehler: 'HTTP 503' }, kunstbauten: { aktiv: true, zustand: 'geladen', geladen: true } } })
    expect(z.ansicht3dGelaende.zustand).toBe('geladen')
    expect(z.ansicht3dGrundkarte.zustand).toBe('lädt')
    expect(z.ansicht3dLuftbild.zustand).toBe('aus')
    expect(z.ansicht3dGebaeude.zustand).toBe('geladen (Ebene aus)')
    expect(z.ansicht3dGebaeude.datenstand).toBe('20.05.2026 (Datum der Kachelpfade)')
    expect(z.ansicht3dBruecken.fehler).toBe('HTTP 503')
    expect(z.ansicht3dKunstbauten.objekte).toContain('0 Bauwerke')
    expect(einzelQuellenZeilen({ phase: 'aus', text: '', quellen: { gelaende: { aktiv: true, zustand: 'geladen' } } })).toEqual({})
  })
  it('unterscheidet bei Berner Kunstbauten den Katalogstand von der Abrufzeit und unbekannten Objektständen', () => {
    const zeit = '2026-11-09T20:54:05.000Z'
    const z = einzelQuellenZeilen({ phase: 'bereit', text: '', kunstbauten: 2,
      quellen: { kunstbauten: { aktiv: true, zustand: 'geladen', geladen: true, zeit } } }).ansicht3dKunstbauten
    expect(z.name).toBe('3D-Stadtmodell Stadt Bern – Ebene Kunstbauten')
    expect(z.datenstand).toBe('30.05.2023 (Katalogstand; Erfassungsstand einzelner Bauwerke unbekannt)')
    expect(z.zeit).toBe(zeit)
    expect(z.vollstaendigkeit).toBe('unbekannt')
    expect(z.objekte).toContain('2 Bauwerke')
  })
})
