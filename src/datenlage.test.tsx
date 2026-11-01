import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BerichtQuellenTabelle, DatenlageZeile, genutzteQuellen, zustandJeQuelle } from './Datenlage'
import { datenlage } from './daten/quellenregister'
import { Anleitung, Datenschutz } from './Hilfe'
import { lv95 } from './geo'

const BERN = datenlage({ lat: 46.942, lon: 7.4323, bfs: 351, kanton: 'BE' })
const LAUSANNE = datenlage({ lat: 46.5197, lon: 6.6323, bfs: 5586, kanton: 'VD' })
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('«Datenlage hier» im Panel', () => {
  it('Bern: Satz, Details mit Tabelle je Thema (Quelle, Anbieter, Stand, Lizenz)', () => {
    const h = renderToStaticMarkup(<DatenlageZeile lage={BERN} />)
    expect(h).toContain('Datenlage hier: Vermessung, Luftbild, OSM')
    expect(h).toContain('<summary>Details</summary>')
    const t = text(h)
    expect(t).toContain('Tempo-Signalisation Signalisierte Höchstgeschwindigkeit Geodaten Stadt Bern')
    expect(t).toContain('Open Data Stadt Bern: freie Nutzung, Quellenangabe Pflicht')
    expect(h).not.toContain('Zustand')
  })
  it('Lausanne: AV nicht frei, Themen ohne Quelle «von Hand»', () => {
    const h = renderToStaticMarkup(<DatenlageZeile lage={LAUSANNE} />)
    expect(h).toContain('Amtliche Vermessung hier nicht frei verfügbar: keine Rechnung.')
    expect(text(h)).toContain('Vermessung keine Quelle: Angabe von Hand')
  })
  it('«Geladene Quellen»: Ladezustand je Quelle (Fehler vor geladen)', () => {
    const z = zustandJeQuelle({ av: { objekte: '12 Flächen', ms: 3 }, sosf: { fehler: 'HTTP 500' }, osm: { ms: 1 }, vsig: {} })
    expect(z).toEqual({ av: 'Fehler', osm: 'geladen', 'bern.vsig': 'lädt' })
    const h = renderToStaticMarkup(<DatenlageZeile lage={BERN} zustand={z} />)
    expect(h).toContain('<th>Zustand</th>')
    expect(h).toContain('<td class="fehler">Fehler</td>')
  })
})

describe('Bericht: nur die genutzten Quellen', () => {
  it('Fall-Quellen, Übergang aus dem Luftbild und Höhen -> Kennungen; Tabelle mit Themen nach der Datenlage', () => {
    const ids = genutzteQuellen({ osm: 'x', av: 'y', luftbild: 'z', vsig: 'v', haltestellen: 'h', geladen: '2026-10-30' },
      { herkunftP: lv95(46.95, 7.44), hoehen: true })
    expect(ids).toEqual(['osm', 'av', 'swissimage', 'bern.vsig', 'bern.halt', 'eth.fgs.bern', 'swissalti'])
    const t = text(renderToStaticMarkup(<BerichtQuellenTabelle ids={ids} lage={BERN} />))
    expect(t).toContain('OpenStreetMap (Overpass) Strassennetz, Übergänge OpenStreetMap Abruf beim Laden ODbL')
    expect(t).not.toContain('Baumkataster')
    expect(t).toContain('Signalisierte Höchstgeschwindigkeit Tempo-Signalisation')
    expect(renderToStaticMarkup(<BerichtQuellenTabelle ids={[]} />)).toBe('')
  })
  it('Bericht.tsx zeigt die Tabelle unter «Quellen»', () => {
    const src = readFileSync(resolve(__dirname, 'Bericht.tsx'), 'utf-8')
    expect(src).toMatch(/<h2>Quellen<\/h2>\s*<BerichtQuellenTabelle ids=\{quellenIds\} lage=\{datenlage\} \/>/)
  })
})

describe('Hilfe', () => {
  it('Datenschutz aus dem Register: Dienste wie bisher, eigene Dateien, Street View und Statistik bleiben', () => {
    const t = text(renderToStaticMarkup(<Datenschutz />))
    expect(t).toContain('geodienste.ch (Amtliche Vermessung): Rechteck ±150 m um den Übergang bzw. die geplanten Streifen.')
    expect(t).toContain('map.bern.ch (Geodaten Stadt Bern), nur in der Stadt Bern: Rechteck ±150 m für amtliche Parkfelder')
    expect(t).toContain('liegen als Datei je Stadt auf dieser Seite')
    expect(t).toContain('Street View')
    expect(t).toContain('GoatCounter')
  })
  it('Abschnitt «Quellen je Ort»: Register, neue Stadt, CORS', () => {
    const t = text(renderToStaticMarkup(<Anleitung />))
    expect(t).toContain('Quellen je Ort')
    expect(t).toMatch(/Eine weitere Stadt kommt dazu mit ihren Einträgen im Register, der Zuordnung der Felder ihres Diensts und einer Probe/)
    expect(t).toContain('(CORS)')
  })
})
