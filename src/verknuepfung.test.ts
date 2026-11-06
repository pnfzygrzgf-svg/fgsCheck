// Übergabe zwischen den Rechnern: nur gültige Angaben, bestehende Parameter unberührt
import { describe, expect, it } from 'vitest'
import { uebergabeLesen, uebergabeText, zielAdresse } from './verknuepfung'

describe('uebergabeLesen', () => {
  it('liest Herkunft, Ort und Übergang', () => {
    expect(uebergabeLesen('#pruefen?von=swc&lat=46.942058&lon=7.432262&uebergang=123', 'pruefen'))
      .toEqual({ von: 'swc', ort: { lat: 46.942058, lon: 7.432262 }, uebergang: 123, fehler: false })
  })
  it('ohne Angaben hinter dem Anker oder mit fremdem Anker: nichts', () => {
    expect(uebergabeLesen('#pruefen', 'pruefen')).toBeNull()
    expect(uebergabeLesen('', 'pruefen')).toBeNull()
    expect(uebergabeLesen('#rechner?von=fgs', 'pruefen')).toBeNull()
  })
  it('verwirft Ungültiges und meldet es', () => {
    for (const h of ['von=fremd', 'lat=46.9', 'lon=7.4', 'lat=abc&lon=7.4', 'lat=1&lon=2', 'lat=46.9&lon=7.4&uebergang=-5', 'lat=46.9&lon=7.4&uebergang=1e3', 'uebergang=123']) {
      const u = uebergabeLesen(`#pruefen?${h}`, 'pruefen')!
      expect(u.fehler, h).toBe(true)
      expect(u.uebergang, h).toBeNull()
    }
    expect(uebergabeLesen('#pruefen?lat=1&lon=2', 'pruefen')!.ort).toBeNull()
  })
  it('Herkunft nur aus der festen Liste', () => {
    expect(uebergabeLesen('#pruefen?von=javascript:alert(1)', 'pruefen')!.von).toBeNull()
  })
})

describe('uebergabeText', () => {
  it('nennt die Herkunft, bei Fehlern den Fehler, sonst nichts', () => {
    expect(uebergabeText({ von: 'fgs', ort: null, uebergang: null, fehler: false })).toContain('Aus fgsCheck geöffnet')
    expect(uebergabeText({ von: 'fgs', ort: null, uebergang: null, fehler: true })).toContain('nicht lesbar')
    expect(uebergabeText({ von: null, ort: null, uebergang: null, fehler: false })).toBeNull()
    expect(uebergabeText(null)).toBeNull()
    expect(uebergabeText({ von: 'swc', ort: { lat: 47, lon: 8 }, uebergang: null, fehler: false })).toContain('nur der Ort übernommen')
    expect(uebergabeText({ von: 'swc', ort: { lat: 47, lon: 8 }, uebergang: 5, fehler: false })).toContain('nur Ort und Objekt übernommen')
  })
})

describe('zielAdresse', () => {
  const ort = { lat: 46.9420585, lon: 7.4322619 }
  it('fgsCheck: Übergang und Ort hinter dem Anker, von dort wieder lesbar', () => {
    const a = zielAdresse('fgs', 'swc', { ort, uebergang: 123 }, false)
    expect(a).toBe('https://fgscheck.ch/#pruefen?von=swc&lat=46.942059&lon=7.432262&uebergang=123')
    expect(uebergabeLesen(a.slice(a.indexOf('#')), 'pruefen')).toMatchObject({ von: 'swc', uebergang: 123, fehler: false })
  })
  it('SichtweitenCheck: Knoten im bestehenden Parameter', () => {
    expect(zielAdresse('swc', 'fgs', { knoten: 77 }, false)).toBe('https://sichtweitencheck.ch/?knoten=77#pruefen?von=fgs')
  })
  it('VeloroutenCheck: nur Ort, eigener Anker; kein Übergang ohne Ort', () => {
    expect(zielAdresse('vrc', 'fgs', { ort }, false)).toBe('https://veloroutencheck.ch/#rechner?von=fgs&lat=46.942059&lon=7.432262')
    expect(zielAdresse('fgs', 'vrc', { uebergang: 5 }, false)).toBe('https://fgscheck.ch/#pruefen?von=vrc')
  })
  it('in der Entwicklung die lokalen Server', () => {
    expect(zielAdresse('swc', 'vrc', {}, true)).toBe('http://localhost:5177/#pruefen?von=vrc')
  })
})
