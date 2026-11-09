import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ParkAnnahmen, ParkQuellen } from './ParkAnnahmen'
import { leererFall, fallLesen, fallSchreiben } from './fall'
import type { Hindernis } from './rechner/hindernisse'
import { parkPruefflaechen, parkMitAnordnung } from './rechner/parkgeometrie'

const roh: Hindernis = { id: 'bernpark:Parkplatz_Motorrad:1:0', art: 'parkfeld', klasse: 'motorrad', quelle: 'kataster',
  katasterTyp: 'Parkplatz_Motorrad', name: 'Motorradfeld 1', ring: [[2600000, 1200000], [2600005, 1200000], [2600005, 1200001], [2600000, 1200001]] }
const offen = parkPruefflaechen([roh], [], null)
describe('Parkannahmen in Panel, Bericht und Fall-Datei', () => {
  it('Anordnung ist im Panel wählbar; Bericht erklärt offene Anordnung und Hinweiswirkung ohne Auswahlfeld', () => {
    const panel = renderToStaticMarkup(<ParkAnnahmen felder={offen} anordnungSetzen={() => {}} />)
    expect(panel).toContain('Motorrad-Anordnung Motorradfeld 1')
    for (const text of ['längs', 'senkrecht', 'schräg 45°', 'Unklar – Originalumriss']) expect(panel).toContain(text)
    const bericht = renderToStaticMarkup(<ParkAnnahmen felder={offen} bericht />)
    expect(bericht).not.toContain('<select')
    expect(bericht).toContain('Motorrad-Anordnung im Kataster nicht angegeben')
    expect(bericht).toContain('nur Hinweis')
  })
  it('speichert Anordnung und Originalgeometrie, ohne eine frühere Ergänzung zur Quelle zu machen', () => {
    const f = leererFall(46.95, 7.44, null)
    f.hindernisse = [parkMitAnordnung(offen[0], 'senkrecht')]
    const [geladen] = fallLesen(fallSchreiben(f))
    expect(geladen.hindernisse[0]).toMatchObject({ parkAnordnung: 'senkrecht', katasterTyp: 'Parkplatz_Motorrad', ring: roh.art === 'parkfeld' ? roh.ring : [] })
    expect(geladen.hindernisse[0]).not.toHaveProperty('parkPruefung')
  })
  it('nennt die allgemeinen und örtlichen Grundlagen vollständig', () => {
    const html = renderToStaticMarkup(<ParkQuellen />)
    for (const text of ['SN 640 291a', '601.14.01', '2.10.22', '2.10.23', 'März 2019', 'April 2011']) expect(html).toContain(text)
  })
})
