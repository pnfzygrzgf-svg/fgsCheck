// Erweiterte Prüfung nach der Gliederung der Normen (27.10.2026): Themen in Gruppen nach VSS 40 241 Kap. C und D, im Thema nach der
// Ziffer der ersten Normfundstelle, Lichtsignal nach VSS 40 837; Felder der LSA-Zeiten in dieser Reihenfolge; Seiten in den Fundstellen.
import { describe, expect, it } from 'vitest'
import { THEMEN, THEMEN_GRUPPEN, gruppeAb, normVergleich } from './themen'
import { FELD_DEFS } from './felder'
import { KATALOG } from './katalog'
import { regelGruppen, regelZeilen } from './regeluebersicht'

describe('Gliederung nach den Normen', () => {
  it('Themen: Anordnungsvoraussetzungen, Positionierung, Ausrüstung (VSS 40 241), dann Lichtsignal, Trottoirüberfahrt, ohne Vortritt', () => {
    expect(THEMEN.map(t => t.id)).toEqual(['zulaessigkeit', 'nachfrage', 'sicht', 'fahrstreifen', 'lage', 'insel', 'ausruestung',
      'beleuchtung', 'lichtsignal', 'trottoirueberfahrt', 'ohneVortritt'])
    expect(THEMEN_GRUPPEN.slice(0, 3).map(g => g.titel)).toEqual(['Anordnungsvoraussetzungen (VSS 40 241 Kap. C, S. 6–10)',
      'Positionierung (VSS 40 241 Kap. D, Z. 18–20, S. 10–11)', 'Ausrüstung (VSS 40 241 Kap. D, Z. 21–29, S. 11–14)'])
    expect(gruppeAb('insel')).toBe('Ausrüstung (VSS 40 241 Kap. D, Z. 21–29, S. 11–14)')
    expect(gruppeAb('ausruestung')).toBeNull()
  })
  it('im Thema nach der Ziffer: Lage G1 (Z. 19) vor G2 (Z. 20); Sicht H1 (Z. 14) vor H3a (Z. 15); Regeln ohne Norm danach', () => {
    expect(normVergleich('G1', 'G2')).toBeLessThan(0)
    expect(normVergleich('H1', 'H3a')).toBeLessThan(0)
    expect(normVergleich('G6', 'G6-B')).toBeLessThan(0)
    const lage = regelGruppen(regelZeilen(), 'thema').find(g => g.schluessel === 'thema-lage')!
    expect(lage.ober).toBe('Positionierung (VSS 40 241 Kap. D, Z. 18–20, S. 10–11)')
    const ids = lage.zeilen.map(z => z.id)
    expect(ids.indexOf('G3')).toBeLessThan(ids.indexOf('G1'))   // Z. 18 vor Z. 19
    expect(ids.indexOf('G1')).toBeLessThan(ids.indexOf('G2'))
  })
  it('Lichtsignal: VSS 40 837 Z. 16, 18, 21, dann SN 640 075, VSS 40 240 Tab. 3, Bern; Felder ebenso', () => {
    const lsa0 = regelGruppen(regelZeilen(), 'thema').find(g => g.schluessel === 'thema-lichtsignal')!.zeilen.map(z => z.id)
    // zuerst, wann ein Lichtsignal zu prüfen ist (VSS 40 240 Z. 17), dann die Zeiten
    expect(lsa0.indexOf('D5-1')).toBeLessThan(lsa0.indexOf('I1'))
    const lsa = lsa0.filter(id => id.startsWith('I'))
    expect(lsa).toEqual(['I1', 'I2', 'I3a', 'I3b', 'I5', 'I4', 'I8', 'I6', 'I6-B', 'I7-B1', 'I7-B2', 'I7-B3', 'I7-B4'])
    expect(FELD_DEFS.filter(d => d.gruppe === 'lsa').map(d => d.pfad.slice(10))).toEqual(['L', 'gelb', 'freigabe', 'teile', 'inselB',
      'phasengleich', 'beideRichtungenImZyklus', 'abbiegerKonflikt', 'vorstart', 'inselGeraet', 'wartezeit', 'inselNurAnmeldung'])
  })
  it('Seiten in den Fundstellen', () => {
    expect(KATALOG.I1.quellen[0].ziffer).toBe('Z. 16, S. 5')
    expect(KATALOG.I2.quellen[0].ziffer).toBe('Z. 18, S. 6')
    expect(KATALOG.I5.quellen[0].ziffer).toBe('Z. 21, S. 8')
    expect(KATALOG['D5-1'].quellen[0].ziffer).toBe('Z. 17, S. 18')
    expect(KATALOG.G1.quellen[0].ziffer).toBe('Z. 19, S. 10')
    expect(KATALOG.G2.quellen[0].ziffer).toBe('Z. 20, S. 11')
  })
})
