import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ParkBerichtDetails, ParkBerichtAnnahme } from './ParkBericht'
import type { Hindernis } from './rechner/hindernisse'
import { parkPruefflaechen } from './rechner/parkgeometrie'

const roh: Hindernis = { id: 'bernpark:Parkplatz_Motorrad:1:0', katasterTyp: 'Parkplatz_Motorrad', name: 'Motorradfeld', art: 'parkfeld', klasse: 'motorrad', quelle: 'kataster', ring: [[2600000, 1200000], [2600005, 1200000], [2600005, 1200001], [2600000, 1200001]] }
describe('Kurze Parkangaben im Bericht', () => {
  it('zeigt eine offene Zuordnung nur bei einem Einfluss auf diese Richtung, ohne Inventartabelle oder Eingabefeld', () => {
    const felder = parkPruefflaechen([roh], [], null)
    expect(renderToStaticMarkup(<ParkBerichtDetails felder={felder} ergebnis={{}} />)).toBe('')
    const html = renderToStaticMarkup(<ParkBerichtDetails felder={felder} ergebnis={{ verdeckerListe: [{ id: roh.id }] }} />)
    expect(html).toContain('Motorrad-Anordnung im Kataster nicht angegeben')
    expect(html).toContain('Sichtverdeckung')
    expect(html).toContain('Bern baut C 2.10.23')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('<table')
  })
  it('nennt die gemeinsamen Annahmen kurz, ohne einzelne Katasterobjekte', () => {
    const html = renderToStaticMarkup(<ParkBerichtAnnahme />)
    for (const text of ['1,90 m', '2,00 m', 'Modellannahme', 'zur Fahrbahn', 'nur Hinweise']) expect(html).toContain(text)
    expect(html).not.toContain('Motorradfeld')
  })
})
