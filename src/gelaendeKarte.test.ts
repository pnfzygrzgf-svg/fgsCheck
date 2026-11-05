import { describe, expect, it } from 'vitest'
import { gelaendeProfile, profilBeruehrtBruecke } from './gelaendeKarte'
import { gelaendeSchluessel, type GelaendeStand } from './erkennungGelaende'
import { ebenenBeschriften, ebenenSichtbar } from './quellenEbenen'
import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'

const zufahrt = (): ZufahrtErgebnis => ({
  fgsId: '2372725069', zufahrt: 'osten', erkennungM: { wert: 20, bis: 'frei' },
  erkennungLinien: [
    { x: 10, auge: [10, 0], ziel: [0, 0], befund: 'frei' },
    { x: 20, auge: [20, 0], ziel: [0, 0], befund: 'frei' },
    { x: 30, auge: [30, 0], ziel: [0, 0], befund: 'frei' },
  ],
  sichtGelaende: { stand: 'mit', abM: 12, bisM: 55, linien: [
    { x: 10, auge: [10, 0], ziel: [0, 4], frei: true },
    { x: 20, auge: [20, 0], ziel: [0, 4], frei: false },
    { x: 30, auge: [30, 0], ziel: [0, 4], frei: null },
    { x: 40, auge: [40, 0], ziel: [0, 4], frei: false, bruecke: true },
  ] },
} as ZufahrtErgebnis)
const streifen = (z: ZufahrtErgebnis): StreifenErgebnis => ({ fgsId: z.fgsId, status: 'verdeckt_gelaende', zufahrten: [z] } as StreifenErgebnis)
const stand: GelaendeStand = { stand: 'ok', abM: 12, abfragen: 4, frei: { '10.00': true, '20.00': false } }

describe('Gelände als Kartenebene', () => {
  it('zeigt beide Geländeprüfungen mit tatsächlichem Befund, niemals ungeprüfte oder Brückenlinien', () => {
    const z = zufahrt(), s = streifen(z), vorher = structuredClone(s)
    const daten = gelaendeProfile([s], { [gelaendeSchluessel(z)!]: stand })
    expect(daten.map(o => [o.quellenSchluessel, o.klasse])).toEqual([
      ['hoehenSicht', 'frei'], ['hoehenSicht', 'verdeckt'], ['hoehen', 'frei'], ['hoehen', 'verdeckt'],
    ])
    expect(daten[1].linien).toEqual([[[20, 0], [0, 4]]])
    expect(daten[1].text).toContain('Sicht auf die Wartefläche')
    expect(daten[3].text).toContain('Erkennung der Bodenmarkierung')
    expect(daten[3].text).toContain('im Geländemodell verdeckt')
    expect(new Set(daten.map(o => o.id)).size).toBe(4)
    expect(s).toEqual(vorher)
  })

  it('macht aus fehlenden, ladenden, fehlerhaften oder veralteten Ergebnissen keine freien Geländeprofile', () => {
    const z = zufahrt(), key = gelaendeSchluessel(z)!
    z.sichtGelaende = { stand: 'ohne', abM: null, bisM: 55, linien: [] }
    for (const daten of [null, {}, { [key]: { stand: 'laedt' } as GelaendeStand },
      { [key]: { stand: 'fehler', text: 'kein Profil' } as GelaendeStand }, { veralteteGeometrie: stand }])
      expect(gelaendeProfile([streifen(z)], daten)).toEqual([])
  })

  it('lässt Trottoirüberfahrten und verworfene FGS aus, auch mit älteren Geländewerten', () => {
    const s = streifen(zufahrt())
    expect(gelaendeProfile([{ ...s, trottoirueberfahrt: true } as StreifenErgebnis, { ...s, status: 'kein_fgs' }], null)).toEqual([])
  })

  it('erscheint alphabetisch im Menü mit tatsächlicher Quelle und getrennten Quelldaten je Prüfung', () => {
    const z = zufahrt(), daten = ebenenBeschriften({
      gelaende: gelaendeProfile([streifen(z)], { [gelaendeSchluessel(z)!]: stand }),
      metadaten: { hoehenSicht: { datenstand: 'Stand der Sichtprofile' }, hoehen: { datenstand: 'Stand der Erkennungsprofile' } },
    })
    const e = ebenenSichtbar(daten).zeigen.find(e => e.id === 'gelaende')!
    expect(e.titel).toBe('Gelände (Höhenmodell, Sichtprofile)')
    expect(e.quelle).toContain('swisstopo')
    expect(e.quelle).toContain('Stand der Sichtprofile')
    expect(e.quelle).toContain('Stand der Erkennungsprofile')
    expect(daten.gelaende![0].text).toContain('Datenstand Stand der Sichtprofile')
    expect(daten.gelaende![2].text).toContain('Datenstand Stand der Erkennungsprofile')
  })

  it('weist unbekannten Datenstand aus und nennt Gelände ohne angefragte Profile nicht als leere Quelle', () => {
    const e = ebenenSichtbar({ gelaende: gelaendeProfile([streifen(zufahrt())], null) }).zeigen.find(e => e.id === 'gelaende')!
    expect(e.quelle).toContain('Datenstand unbekannt')
    expect(e.quelle).toContain('Vollständigkeit unbekannt')
    expect(ebenenSichtbar({}).ohne.some(e => e.id === 'gelaende')).toBe(false)
    expect(ebenenSichtbar({ gelaende: [] }).ohne.some(e => e.id === 'gelaende')).toBe(true)
  })

  it('erklärt die beiden Sichtziele mit ihren tatsächlichen Zielhöhen aus den bereits geladenen Punkten', () => {
    const z = zufahrt(), punkte = [{ dist: 0, h: 500 }, { dist: 10, h: 502 }, { dist: 20, h: 500 }]
    const daten = gelaendeProfile([streifen(z)], { [gelaendeSchluessel(z)!]: stand }, () => ({
      daten: punkte, ms: 10, bytes: 100, quelle: 'api3.geo.admin.ch', abgerufen: '2026-11-02T18:30:00Z',
    }))
    const [warte, , markierung] = daten.map(o => o.hoehenprofil!)
    expect(warte.punkte).toBe(punkte)
    expect(warte.sicht).toMatchObject({ augeM: 1, zielM: .6 })
    expect(markierung.sicht).toMatchObject({ augeM: 1, zielM: 0 })
    expect(warte.abgerufen).toBe('2026-11-02T18:30:00Z')
    expect(daten[0].wert).toBe('Wartefläche · Auto 10 m vor dem Streifen · im Geländemodell frei')
    expect(daten[2].wert).toBe('Bodenmarkierung · Auto 10 m vor dem Streifen · im Geländemodell frei')
  })
  it('kennzeichnet eine Brücke zwischen den Endpunkten als unsicher, ohne den gerechneten Befund zu ändern', () => {
    const z = zufahrt(), s = streifen(z), vorher = structuredClone(s)
    const bruecke = { enthaelt: ([x]: [number, number]) => x > 4.5 && x < 5.5 }
    expect(profilBeruehrtBruecke([0, 0], [10, 0], bruecke)).toBe(true)
    expect(profilBeruehrtBruecke([10, 0], [20, 0], bruecke)).toBe(false)
    const daten = gelaendeProfile([s], null, () => ({ daten: [{ dist: 0, h: 500 }, { dist: 10, h: 490 }, { dist: 20, h: 500 }],
      ms: 1, bytes: 1, quelle: 'api3.geo.admin.ch', abgerufen: undefined }), undefined, bruecke)
    expect(daten.every(o => o.klasse === 'bruecke')).toBe(true)
    expect(daten[0].hoehenprofil?.hinweis).toContain('Boden unter der Brücke')
    expect(daten[0].text).not.toContain('im Geländemodell frei')
    expect(s).toEqual(vorher)
  })
  it('benennt Zufahrt und Teilstreifen verständlich und trennt auch gleich benannte Zufahrten ohne neue Höhenabfragen', () => {
    const z = zufahrt(), z2 = { ...z, fgsId: 'zweiter' }
    let abrufe = 0
    const daten = gelaendeProfile([streifen(z), streifen(z2)], null, () => {
      abrufe++
      return { daten: [{ dist: 0, h: 500 }, { dist: 20, h: 500 }], ms: 1, bytes: 1, quelle: 'api3.geo.admin.ch', abgerufen: undefined }
    }, () => '1 Abbieger: Schosshaldenstrasse von Nordosten')
    expect(abrufe).toBe(4) // liest ausschliesslich die schon geprüften vier Linien aus dem Cache
    expect(daten[0].hoehenprofil?.gruppe?.titel).toBe('1 Abbieger: Schosshaldenstrasse von Nordosten · Teilstreifen 1')
    expect(daten[2].hoehenprofil?.gruppe?.titel).toContain('Teilstreifen 2')
    expect(daten[0].hoehenprofil?.gruppe?.id).not.toBe(daten[2].hoehenprofil?.gruppe?.id)
    expect(daten[1].hoehenprofil?.titel).toContain('Wartefläche · Auto 20 m vor dem Streifen · im Geländemodell verdeckt')
    for (const o of daten) expect([o.wert, o.text, o.hoehenprofil?.titel].join(' ')).not.toMatch(/\bG\d+\b/)
  })
})
