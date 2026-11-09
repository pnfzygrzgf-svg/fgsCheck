import { describe, expect, it } from 'vitest'
import { parkBerichtFelder, parkEinfluesse } from './parkEinfluss'
import type { Hindernis } from './hindernisse'

const feld = (id: string): Hindernis => ({ id, art: 'parkfeld', klasse: 'auto', quelle: 'kataster', ring: [[0, 0], [5, 0], [5, 2], [0, 2]] })
describe('Parkflächen im Bericht', () => {
  it('unterscheidet geladene Daten von tatsächlicher Sichtwirkung und Abzug', () => {
    const alle = ['geladen', 'sicht', 'streifen', 'wartend', 'erkennung', 'darin'].map(feld)
    const ergebnis = { parkPruefflaechen: alle, parkAnnahmen: alle,
      hindernis: { amtlich: alle.map(h => ({ id: h.id, hindernis: h })), vorschlaege: alle, inD: ['darin'] },
      parkEinfluss: [{ id: 'wartend', grund: 'Abzug auf der Zufahrt' }],
      richtungen: [{ verdeckerListe: [{ id: 'sicht' }], parkStreifen: { abzug: 1.9, ids: ['streifen'] } }],
      streifen: [{ zufahrten: [{ erkennungM: { hindernis: { id: 'erkennung' } } }] }] }
    expect(parkBerichtFelder(alle, ergebnis).map(h => h.id)).toEqual(['sicht', 'streifen', 'wartend', 'erkennung', 'darin'])
  })
  it('ein Treffer ohne Abzug ist kein Parkstreifenbeitrag; Konflikte und integrierte Knotensicht bleiben erhalten', () => {
    const ergebnis = { parkStreifen: { abzug: 0, ids: ['nur-probe'] },
      konflikte: [{ id: 'unveraendert' }], knotensicht: { parkEinfluss: [{ id: 'knoten', grund: 'Abzug' }] } }
    expect(parkBerichtFelder(['nur-probe', 'unveraendert', 'knoten'].map(feld), ergebnis).map(h => h.id)).toEqual(['unveraendert', 'knoten'])
  })
  it('dedupliziert Beiträge und lässt ohne Ergebnisbeitrag alle Parkflächen weg', () => {
    expect(parkEinfluesse({ konflikte: [{ id: 'x' }, { id: 'x' }] })).toHaveLength(1)
    expect(parkBerichtFelder([feld('x')], { parkPruefflaechen: [feld('x')] })).toEqual([])
  })
})
