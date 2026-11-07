// Quelle einer Kartenebene und einzelner Unfall
import { describe, expect, it } from 'vitest'
import { anDerStelle, ebenenQuelleUrl, objektFenster, objektHtml, objektQuelleUrl, unfallUrl } from './quellenLink'

const M = { lat: 46.95, lon: 7.45, e: 2600000.4, n: 1200000.6 }

describe('ebenenQuelleUrl', () => {
  it('Unfälle und Bundesebenen führen auf die Karte des Bundes', () => {
    expect(ebenenQuelleUrl('unfaelleVelo', '© ASTRA')).toBe('https://map.geo.admin.ch/#/map?lang=de&layers=ch.astra.unfaelle-personenschaeden_fahrraeder@year=all')
    expect(ebenenQuelleUrl('bav', '© BAV')).toContain('ch.bav.haltestellen-oev')
  })
  it('Bern führt auf das Produkt, sonst auf das Geoportal', () => {
    expect(ebenenQuelleUrl('tempo', 'Geoportal Stadt Bern, Signalisierte Höchstgeschwindigkeit')).toBe('https://map.bern.ch/geoportal/#/produkt/Signalisierte_Hoechstgeschwindigkeit')
    expect(ebenenQuelleUrl('x', '© Geodaten Stadt Bern, Taktil-visuelle Markierungen')).toContain('Taktil_visuelle_Markierungen')
    expect(ebenenQuelleUrl('x', 'Geoportal Stadt Bern, Anderes')).toBe('https://map.bern.ch/geoportal/')
  })
  it('Datensatz in Basel, Dienst als Rückfall, sonst kein Link', () => {
    expect(ebenenQuelleUrl('tempo', 'data.bs.ch 100250 «Strassen und Wege»')).toBe('https://data.bs.ch/explore/dataset/100250/')
    expect(ebenenQuelleUrl('x', 'Kanton Uri', 'https://geo.ur.ch/wfs')).toBe('https://geo.ur.ch/')
    expect(ebenenQuelleUrl('x', 'Kanton', 'https://a.ch/api/explore/v2.1/catalog/datasets/123/records')).toBe('https://a.ch/explore/dataset/123/')
    expect(ebenenQuelleUrl('x', 'Tempoquelle nicht geladen')).toBeNull()
  })
})

describe('anDerStelle', () => {
  it('Bund und OpenStreetMap öffnen an der Stelle, andere bleiben', () => {
    expect(anDerStelle(ebenenQuelleUrl('bav', '')!, M)).toContain('center=2600000,1200001&z=10')
    expect(anDerStelle(ebenenQuelleUrl('vortritt', 'OpenStreetMap highway=stop')!, M)).toBe('https://www.openstreetmap.org/#map=18/46.95000/7.45000')
    expect(anDerStelle('https://data.bs.ch/', M)).toBe('https://data.bs.ch/')
  })
})

describe('Amtliche Vermessung', () => {
  it('führt in Luzern zum Ersatz', () => {
    expect(ebenenQuelleUrl('av', 'Stadt Luzern, Strassenflächen (Ersatz der AV)')).toBe('https://map.stadtluzern.ch/')
    expect(ebenenQuelleUrl('av', 'Amtliche Vermessung Kanton BE')).toContain('geodienste')
  })
})

describe('objektHtml', () => {
  it('setzt den Titel fett und die Angaben je Zeile darunter', () => {
    expect(objektHtml('DTV 4 933 Fahrzeuge je Tag; Morgenspitze 429; modelliert (NPVM)')).toBe('<b>DTV 4 933 Fahrzeuge je Tag</b><br>Morgenspitze 429<br>modelliert (NPVM)')
    expect(objektHtml('Tempo 30 km/h · Stadt Bern')).toBe('<b>Tempo 30 km/h</b><br>Stadt Bern')
  })
  it('nimmt einen kurzen Titel vor dem Doppelpunkt', () => {
    expect(objektHtml('Bern, Hirschengraben, Kante C: BAV ch:1:sloid:79896:0:4')).toBe('<b>Bern, Hirschengraben, Kante C</b><br>BAV ch:1:sloid:79896:0:4')
  })
  it('trennt nicht in Klammern und lässt leere Teile weg', () => {
    expect(objektHtml('Bahnhof (Bus / Tram; BAV 1); Haltestellenpunkt; ;')).toBe('<b>Bahnhof (Bus / Tram; BAV 1)</b><br>Haltestellenpunkt')
  })
  it('lässt einen Text ohne Trenner als Titel stehen und maskiert', () => {
    expect(objektHtml('Tempo 30 km/h, Teststrasse (OpenStreetMap maxspeed)')).toBe('<b>Tempo 30 km/h, Teststrasse (OpenStreetMap maxspeed)</b>')
    expect(objektHtml('a<b; c&d')).toBe('<b>a&lt;b</b><br>c&amp;d')
  })
})

describe('objektQuelleUrl', () => {
  it('Haltekante führt auf die ganze Nummer, nicht auf ihr letztes Stück', () => {
    expect(objektQuelleUrl({ id: 'bav:k:ch:1:sloid:79896:0:4', text: 'Kante' }, 'bav', null, { lat: 46.9, lon: 7.4, e: 2600000, n: 1200000 })).toContain('features=ch%3A1%3Asloid%3A79896%3A0%3A4')
  })
  const osm = ebenenQuelleUrl('vortritt', 'OpenStreetMap')
  it('OpenStreetMap führt zum Objekt', () => {
    expect(objektQuelleUrl({ id: 'vt:123', text: 'Stop (OpenStreetMap)' }, 'vortritt', osm, M)).toBe('https://www.openstreetmap.org/node/123')
    expect(objektQuelleUrl({ id: 'hw:77', text: 'x', quelle: 'OpenStreetMap highway' }, 'strassentyp', osm, M)).toBe('https://www.openstreetmap.org/way/77')
    expect(objektQuelleUrl({ id: 'lampe:9', text: 'Strassenlampe (OpenStreetMap)' }, 'beleuchtung', osm, M)).toBe('https://www.openstreetmap.org/node/9')
    expect(objektQuelleUrl({ id: 'h:osm:8', text: 'Halt', quelle: 'OpenStreetMap' }, 'haltestellen', osm, M)).toBe('https://www.openstreetmap.org/node/8')
    expect(objektQuelleUrl({ id: 'sch:osm:way/6', text: 'Schule', quelle: 'OpenStreetMap' }, 'schulen', osm, M)).toBe('https://www.openstreetmap.org/way/6')
    expect(objektQuelleUrl({ id: 'sch:osm:relation/5', text: 'Schule', quelle: 'OpenStreetMap' }, 'schulen', osm, M)).toBe('https://www.openstreetmap.org/relation/5')
  })
  it('Profil und amtliche Quellen bleiben bei der Ebene an der Stelle', () => {
    expect(objektQuelleUrl({ id: 'pr:5', text: 'OpenStreetMap', profil: true }, 'steigung', osm, M)).toContain('#map=18/')
    expect(objektQuelleUrl({ id: 'h:4', text: 'Halt', quelle: 'Geoportal Stadt Bern' }, 'haltestellen', 'https://map.bern.ch/geoportal/', M)).toBe('https://map.bern.ch/geoportal/')
    expect(objektQuelleUrl({ id: 'vs:5', text: 'Tempo', quelle: 'Geoportal Stadt Bern' }, 'tempo', 'https://map.bern.ch/geoportal/', M)).toBe('https://map.bern.ch/geoportal/')
  })
  it('Bundesobjekt mit Kennung, gespeicherte Adresse geht vor', () => {
    expect(objektQuelleUrl({ id: 'x:AB', text: 'Halt' }, 'bav', null, M)).toContain('ch.bav.haltestellen-oev@features=AB')
  })
})

describe('Unfall', () => {
  it('Adresse wie auf der Seite der Quelle', () => {
    expect(unfallUrl('B6A3', [2599816, 1199913], 'fussgaenger')).toBe('https://map.geo.admin.ch/#/map?lang=de&center=2599816,1199913&z=8&topic=ech&layers=ch.astra.unfaelle-personenschaeden_fussgaenger@year=all@features=B6A3&bgLayer=ch.swisstopo.pixelkarte-farbe')
  })
  it('Text wird maskiert', () => {
    expect(objektFenster('a<b', 'https://x.ch/')).toContain('a&lt;b')
  })
})
