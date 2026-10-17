// Tests Benennung (16.10.2026): Streifen von Hand (Name, «Streifen 1»), Zufahrten nach Strasse und Herkunft statt Gradzahl.
import { describe, expect, it } from 'vitest'
import { herkunftAzimut, herkunft8, herkunft16, streifenTitel, streifenKurz, zufahrtNamen, zufahrtLang, entfallenLang, wegNamen, zufahrtNr,
  zufahrtText, nachNr, schildLage, NUMMERN_TEXT, entfallenNr, entfallenText } from './benennung'
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

// Nummern der Zufahrten (17.10.2026, wie SichtweitenCheck): je Streifen im Uhrzeigersinn ab Norden nach der Herkunft
describe('Nummern der Zufahrten', () => {
  const nrn = (n: ReturnType<typeof zufahrtNamen>, keys: string[]) => keys.map(k => zufahrtNr(n, k))
  it('im Uhrzeigersinn ab Norden, unabhängig von der Reihenfolge der Rechnung', () => {
    // Fahrtrichtung 90 = nach Norden, Herkunft Süden; 0 Herkunft Westen; 270 Herkunft Norden; 180 Herkunft Osten
    const n = zufahrtNamen({ strasse: 'A', zufahrten: [z('90', 90, 'beide', 'A'), z('0', 0, 'beide', 'B'), z('270', 270, 'beide', 'A'),
      z('180', 180, 'beide', 'B')], entfallen: [] })
    expect(nrn(n, ['270', '180', '90', '0'])).toEqual(['1', '2', '3', '4'])
    expect(zufahrtText(n, '270')).toBe('1 A von Norden')
    expect(zufahrtText(n, '0')).toBe('4 B von Westen')
  })
  it('gerade und abbiegende gemeinsam; nicht geprüfte Richtungen ohne Nummer, lückenlos', () => {
    const n = zufahrtNamen({ strasse: 'Glockenstrasse', zufahrten: [z('70', 70, 'einbahn', 'Glockenstrasse'), z('a151', 151, 'abbiegend', 'Bernstrasse'),
      z('a20', 20, 'abbiegend', 'Waldeggstrasse')], entfallen: [e('250', 250, 'gerade'), e('a74', 74, 'abbiegend')] })
    // Herkunft: a20 Azimut 250 (Westsüdwesten), 70 Azimut 200 (Süden), a151 Azimut 119 (Ostsüdosten), 250 (entfallen) Norden
    expect(nrn(n, ['a151', '70', 'a20'])).toEqual(['1', '2', '3'])
    expect(zufahrtText(n, 'a151')).toBe('1 Abbieger: Bernstrasse von Südosten')
    expect([...n.entfallen.values()].every(x => x.nr === undefined)).toBe(true)
    expect(entfallenLang(n, { zufahrt: '250', kennung: 'k250' })).toBe('Glockenstrasse von Norden')
    // unbekannte Zufahrt: ohne Nummer wie bisher
    expect([zufahrtNr(n, '999'), zufahrtText(n, '999'), zufahrtNr(undefined, '70'), zufahrtText(undefined, '70')])
      .toEqual(['', 'Zufahrt 999', '', 'Zufahrt 70'])
  })
  it('Herkunft aus der Fahrlinie wie der Name; bis 1° westlich von Nord zählt als Nord', () => {
    // gerade Zufahrt mit Fahrtrichtung 90 (Herkunft Süden), deren Sichtpunkte aber nach Osten liegen: Herkunft Osten
    const ost = { ...z('90', 90, 'beide', 'A'), sichtpunkte: [[0, 0], [30, 1]] as [number, number][] } as ZufahrtErgebnis
    const n = zufahrtNamen({ strasse: 'A', zufahrten: [z('0', 0, 'beide', 'A'), ost, z('270', 270, 'beide', 'A')], entfallen: [] })
    expect(nrn(n, ['270', '90', '0'])).toEqual(['1', '2', '3'])
    expect(zufahrtLang(n, '90')).toBe('A von Osten')
    // Herkunft 359,5° (Fahrt 270,5) vor 10° (Fahrt 260); 358,5° (Fahrt 271,5) zuletzt
    const m = zufahrtNamen({ strasse: 'A', zufahrten: [z('260', 260, 'beide', 'A'), z('271.5', 271.5, 'beide', 'B'), z('270.5', 270.5, 'beide', 'C')],
      entfallen: [] })
    expect(nrn(m, ['270.5', '260', '271.5'])).toEqual(['1', '2', '3'])
  })
  it('gleiche Herkunft: Reihenfolge der Rechnung, passend zu «(2)»', () => {
    const n = zufahrtNamen({ strasse: 'A', zufahrten: [z('0', 0, 'beide', 'A'), z('90', 90, 'beide', 'A'), z('90b', 90, 'beide', 'A')], entfallen: [] })
    expect(nrn(n, ['90', '90b', '0'])).toEqual(['1', '2', '3'])
    expect([zufahrtText(n, '90'), zufahrtText(n, '90b')]).toEqual(['1 A von Süden', '2 A von Süden (2)'])
    // dieselbe Rechnung zweimal: dieselben Nummern
    const m = zufahrtNamen({ strasse: 'A', zufahrten: [z('0', 0, 'beide', 'A'), z('90', 90, 'beide', 'A'), z('90b', 90, 'beide', 'A')], entfallen: [] })
    expect(nrn(m, ['90', '90b', '0'])).toEqual(nrn(n, ['90', '90b', '0']))
  })
  it('mehrere Streifen: eigene Nummern je Streifen, Tabellen nach Nummern', () => {
    const s1 = zufahrtNamen({ strasse: 'A', zufahrten: [z('0', 0, 'beide', 'A'), z('180', 180, 'beide', 'A')], entfallen: [] })
    const s2 = zufahrtNamen({ strasse: 'A', zufahrten: [z('90', 90, 'beide', 'A'), z('a151', 151, 'abbiegend', 'B')], entfallen: [] })
    expect([nrn(s1, ['180', '0']), nrn(s2, ['a151', '90'])]).toEqual([['1', '2'], ['1', '2']])
    const liste = [{ zufahrt: '0' }, { zufahrt: 'x' }, { zufahrt: '180' }]
    expect(nachNr(liste, s1).map(x => x.zufahrt)).toEqual(['180', '0', 'x'])
    expect(liste.map(x => x.zufahrt)).toEqual(['0', 'x', '180'])
  })
  it('Lage des Schilds: letzter Sichtpunkt, nach aussen entlang der Fahrlinie', () => {
    const l = schildLage({ sichtpunkte: [[0, 0], [0, -2], [0, -4], [0, -6], [0, -8]], spur: [] })!
    expect(l.p).toEqual([0, -8])
    expect(l.aussen[0]).toBeCloseTo(0)
    expect(l.aussen[1]).toBeCloseTo(-1)
    // ohne Sichtpunkte: Ende der Fahrlinie; ohne Punkte keine Lage
    const f = schildLage({ sichtpunkte: [], spur: [[0, 0], [3, 4]] })!
    expect([f.p, f.aussen]).toEqual([[3, 4], [0.6, 0.8]])
    expect(schildLage({ sichtpunkte: [], spur: [] })).toBeNull()
    expect(schildLage({ sichtpunkte: [[1, 1]], spur: [] })!.aussen).toEqual([0, 1])
  })
  it('von Hand gestrichene Zufahrt behält ihre Nummer, die übrigen bleiben; aus den Daten entfallene ohne Nummer', () => {
    const vier = [z('90', 90, 'beide', 'A'), z('0', 0, 'beide', 'B'), z('270', 270, 'beide', 'A'), z('180', 180, 'beide', 'B')]
    const vorher = zufahrtNamen({ strasse: 'A', zufahrten: vier, entfallen: [] })
    expect(nrn(vorher, ['270', '180', '90', '0'])).toEqual(['1', '2', '3', '4'])
    // Zufahrt 1 (von Norden) gestrichen: steht als Entfallen mit Grund «hand» (wie rechner/pruefen.ts), dazu eine Einbahn
    const hand: Entfallen = { ...e('270', 270, 'gerade'), grund: 'hand' }
    const nachher = zufahrtNamen({ strasse: 'A', zufahrten: vier.filter(x => x.zufahrt !== '270'), entfallen: [hand, e('45', 45, 'gerade')] })
    expect(nrn(nachher, ['180', '90', '0'])).toEqual(['2', '3', '4'])
    expect([entfallenNr(nachher, hand), entfallenText(nachher, hand)]).toEqual(['1', '1 A von Norden'])
    expect([entfallenNr(nachher, { zufahrt: '45', kennung: 'k45' }), entfallenText(nachher, { zufahrt: '45', kennung: 'k45' })])
      .toEqual(['', 'A von Südwesten'])
    // ohne die Einbahn usw.: dieselben Nummern; Streichen und Zurückholen ergeben dieselben Nummern wie vorher
    const zurueck = zufahrtNamen({ strasse: 'A', zufahrten: vier, entfallen: [e('45', 45, 'gerade')] })
    expect(nrn(zurueck, ['270', '180', '90', '0'])).toEqual(['1', '2', '3', '4'])
  })
  it('exakter Winkel statt ganzer Grad; «(2)» folgt den Nummern', () => {
    // Fahrt 259,6 (Herkunft 10,4°) vor Fahrt 259,8 (10,2°) in der Rechnung: Nummern nach dem Winkel, «(2)» passend dazu
    const n = zufahrtNamen({ strasse: 'A', zufahrten: [z('259.6', 259.6, 'beide', 'A'), z('259.8', 259.8, 'beide', 'A')], entfallen: [] })
    expect(nrn(n, ['259.8', '259.6'])).toEqual(['1', '2'])
    expect([zufahrtText(n, '259.8'), zufahrtText(n, '259.6')]).toEqual(['1 A von Norden', '2 A von Norden (2)'])
  })
  it('Erklärsatz', () => {
    expect(NUMMERN_TEXT).toBe('Nummern: Zufahrten im Uhrzeigersinn ab Norden')
  })
})
