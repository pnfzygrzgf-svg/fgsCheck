// Tests Benennung (16.10.2026): Streifen von Hand (Name, «Streifen 1»), Zufahrten nach Strasse und Herkunft statt Gradzahl.
import { describe, expect, it } from 'vitest'
import { herkunftAzimut, herkunft8, herkunft16, streifenTitel, streifenKurz, zufahrtNamen, zufahrtLang, entfallenLang, wegNamen } from './benennung'
import { fallLesen, fallSchreiben, leererFall, eingabenSchluessel, STREIFEN_NAME_MAX, type StreifenHand } from './fall'
import type { ZufahrtErgebnis } from './rechner/typen'
import type { Entfallen } from './rechner/zufahrten'

const z = (zufahrt: string, richtung: number, art: string, strasse: string | null): ZufahrtErgebnis =>
  ({ zufahrt, richtung, art, strasse, kennung: `k${zufahrt}` } as ZufahrtErgebnis)
const e = (zufahrt: string, richtung: number, art: string, osmWeg = ''): Entfallen =>
  ({ fgsId: 'hand-1', art, richtung, zufahrt, grund: 'einbahn_osm', quelle: '', osmWeg, osmKnoten: '', kennung: `k${zufahrt}` })

describe('Herkunft aus der Fahrtrichtung', () => {
  it('70 = Fahrt nach Nordnordosten, Herkunft Süden (8 Teile) bzw. Südsüdwesten (16 Teile)', () => {
    expect(herkunftAzimut(70)).toBe(200)
    expect([herkunft8(70), herkunft16(70)]).toEqual(['Süden', 'Südsüdwesten'])
    expect([herkunft8(0), herkunft8(90), herkunft8(180), herkunft8(270), herkunft8(250)]).toEqual(['Westen', 'Süden', 'Osten', 'Norden', 'Norden'])
  })
})

describe('Streifen von Hand: Name bzw. «Streifen 1»', () => {
  const hand: StreifenHand[] = [{ id: 'hand-1', p0: [0, 0], p1: [0, 7], breite: 4 }, { id: 'hand-2', p0: [0, 0], p1: [0, 7], breite: 4, name: 'Nord' }]
  it('Titel und Kurzform', () => {
    expect([streifenTitel('hand-1', hand), streifenTitel('hand-2', hand), streifenTitel('12345-1'), streifenTitel('hand-7')])
      .toEqual(['Streifen 1', 'Nord', 'Streifen 12345-1', 'Streifen 7'])
    expect([streifenKurz('hand-1', hand), streifenKurz('hand-2', hand), streifenKurz('12345')]).toEqual(['1', 'Nord', '12345'])
  })
  it('Fall-Datei: Name gelesen, gekürzt, leer = keiner; ältere Datei ohne Name unverändert; Schlüssel der Eingaben', () => {
    const f = leererFall(46.95, 7.44, null)
    f.streifenHand.push({ id: 'hand-1', p0: [2600000, 1200000], p1: [2600000, 1200007], breite: 4 })
    const k0 = eingabenSchluessel(f)
    const roh = JSON.parse(fallSchreiben(f))
    expect('name' in roh.streifenHand[0]).toBe(false)
    expect(fallLesen(JSON.stringify(roh))[0].streifenHand[0].name).toBeUndefined()
    roh.streifenHand[0].name = '  Glockenstrasse neu  '
    expect(fallLesen(JSON.stringify(roh))[0].streifenHand[0].name).toBe('Glockenstrasse neu')
    roh.streifenHand[0].name = 'x'.repeat(100)
    expect(fallLesen(JSON.stringify(roh))[0].streifenHand[0].name!.length).toBe(STREIFEN_NAME_MAX)
    roh.streifenHand[0].name = '   '
    expect(fallLesen(JSON.stringify(roh))[0].streifenHand[0].name).toBeUndefined()
    roh.streifenHand[0].name = 42
    expect(fallLesen(JSON.stringify(roh))[0].streifenHand[0].name).toBeUndefined()
    f.streifenHand[0].name = 'Nord'
    expect(eingabenSchluessel(f)).not.toBe(k0)
  })
})

describe('Zufahrten: Strasse und Herkunft statt Gradzahl', () => {
  it('gerade, abbiegend, nicht geprüft (Glockenstrasse-Plan: 70 geprüft, 250 Einbahn)', () => {
    const n = zufahrtNamen({ strasse: 'Glockenstrasse', zufahrten: [z('70', 70, 'einbahn', 'Glockenstrasse'), z('a151', 151, 'abbiegend', 'Bernstrasse')],
      entfallen: [e('250', 250, 'gerade'), e('a74', 74, 'abbiegend', '77'), e('a296', 296, 'abbiegend')] }, w => (w === '77' ? 'Waldeggstrasse' : null))
    expect(zufahrtLang(n, '70')).toBe('Glockenstrasse von Süden')
    expect(n.zufahrt.get('70')!.kurz).toBe('von S')
    // Fahrt nach 151° (Azimut 299°, Nordwesten): Herkunft Südosten
    expect(zufahrtLang(n, 'a151')).toBe('Abbieger: Bernstrasse von Südosten')
    expect(n.zufahrt.get('a151')!.kurz).toBe('Abbieger von SO')
    expect(entfallenLang(n, { zufahrt: '250', kennung: 'k250' })).toBe('Glockenstrasse von Norden')
    expect(entfallenLang(n, { zufahrt: 'a74', kennung: 'ka74' })).toBe('Abbieger: Waldeggstrasse von Süden')
    expect(entfallenLang(n, { zufahrt: 'a296', kennung: 'ka296' })).toBe('Abbieger: Strasse ohne Namen von Nordwesten')
    // unbekannt: wie bisher
    expect([zufahrtLang(n, '999'), zufahrtLang(undefined, '70')]).toEqual(['Zufahrt 999', 'Zufahrt 70'])
  })
  it('gleiche Namen eindeutig: zuerst 16 Teile, dann (2)', () => {
    // 160° und 180°: beide «von Osten» (Azimut 110° bzw. 90°); fein «Ostsüdosten» bzw. «Osten»
    const n = zufahrtNamen({ strasse: 'A', zufahrten: [z('160', 160, 'beide', 'A'), z('180', 180, 'beide', 'A')], entfallen: [] })
    expect([zufahrtLang(n, '160'), zufahrtLang(n, '180')]).toEqual(['A von Ostsüdosten', 'A von Osten'])
    // gleiche Richtung (zwei Fahrbahnen): «(2)»
    const m = zufahrtNamen({ strasse: 'A', zufahrten: [z('90', 90, 'beide', 'A'), z('90b', 90, 'beide', 'A')], entfallen: [] })
    expect([zufahrtLang(m, '90'), zufahrtLang(m, '90b')]).toEqual(['A von Süden', 'A von Süden (2)'])
    expect([m.zufahrt.get('90')!.kurz, m.zufahrt.get('90b')!.kurz]).toEqual(['von S', 'von S (2)'])
    // gerade ohne Strassennamen: Strasse des Streifens, sonst «Strasse ohne Namen»
    expect(zufahrtLang(zufahrtNamen({ strasse: 'B', zufahrten: [z('0', 0, 'beide', null)], entfallen: [] }), '0')).toBe('B von Westen')
    expect(zufahrtLang(zufahrtNamen({ strasse: '', zufahrten: [z('0', 0, 'beide', null)], entfallen: [] }), '0')).toBe('Strasse ohne Namen von Westen')
  })
  it('Wegnamen aus der Overpass-Antwort', () => {
    expect([...wegNamen({ elements: [{ type: 'way', id: 7, tags: { name: 'Glockenstrasse' } }, { type: 'way', id: 8, tags: {} },
      { type: 'node', id: 9, tags: { name: 'x' } }] })]).toEqual([['7', 'Glockenstrasse']])
    expect(wegNamen(null).size).toBe(0)
  })
})
