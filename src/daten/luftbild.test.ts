import { describe, expect, it } from 'vitest'
import { luftbildLaden } from './luftbild'

describe('Luftbild nachladen (Schalter «Streifen im Luftbild suchen», Korrektur 13.10.2026)', () => {
  const basis = { nid: 12, hatBild: false, an: true, versucht: false }
  it('lädt am OSM-Übergang, wenn eingeschaltet und noch nicht versucht', () => {
    expect(luftbildLaden(basis)).toBe(true)
  })
  it('abgeschaltet: weder Bild noch Flugjahr', () => {
    expect(luftbildLaden({ ...basis, an: false })).toBe(false)
  })
  it('später eingeschaltet: Laden nachholen, solange das Bild fehlt', () => {
    expect(luftbildLaden({ ...basis, an: true, versucht: false })).toBe(true)
  })
  it('kein doppeltes Laden: Bild schon da bzw. Versuch läuft oder ist fehlgeschlagen', () => {
    expect(luftbildLaden({ ...basis, hatBild: true })).toBe(false)
    expect(luftbildLaden({ ...basis, versucht: true })).toBe(false)
  })
  it('ohne OSM-Übergang (Ort aus der Fall-Datei) kein Luftbild', () => {
    expect(luftbildLaden({ ...basis, nid: null })).toBe(false)
  })
})
