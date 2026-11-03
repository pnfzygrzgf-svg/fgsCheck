import { describe, expect, it } from 'vitest'
import { wgs } from '../geo'
import { leererFall, fallLesen, fallSchreiben } from '../fall'
import { haltestellenMitBav } from './haltestellen'
import { bavUmwandeln, bavUrl } from './anbieter/gemeinsam/bav'
import type { BavSnapshot } from './anbieter/gemeinsam/typen'
import { ebenenAusGeo, ebenenSichtbar } from '../quellenEbenen'
import roh from './anbieter/gemeinsam/testdaten/bav-zuerich.json'

const mitte: [number, number] = [2683105, 1247126], [lat, lon] = wgs(...mitte)
const bav: BavSnapshot = { version: 1, quelleId: 'bav.halt', datenstand: null, abgerufen: '2026-11-01T12:00:00.000Z',
  mitte, radiusM: 400, url: bavUrl(lat, lon, 400), vollstaendigkeit: 'unbekannt', halte: bavUmwandeln(roh).halte }

describe('E1a: Quelle und gespeicherte Fälle', () => {
  it('lokale Haltekanten bleiben vorrangig, unabhängig davon, ob BAV bereits geladen ist', () => {
    const lokal = { halte: [{ id: 'bern:1', name: 'Kante A', p: mitte, art: 'oev' as const }] }
    expect(haltestellenMitBav(lokal, { daten: bav }, null, mitte, 150)).toMatchObject({ quelle: 'geoportal', halte: lokal.halte })
    expect(haltestellenMitBav({ laedt: true }, { daten: bav }, null, mitte, 150)).toBeNull()
    expect(haltestellenMitBav(null, { daten: bav }, null, mitte, 150)).toMatchObject({ quelle: 'bav', vollstaendig: false })
    expect(haltestellenMitBav({ fehler: 'HTTP 503' }, { daten: bav }, null, mitte, 150)).toMatchObject({ quelle: 'bav',
      zusatz: expect.stringContaining('Geoportal Stadt Bern nicht erreichbar') })
  })
  it('Ausfall erlaubt OSM-Rückfall mit Warnung, aber keine neue Negativaussage', () => {
    const osm = { elements: [] }
    expect(haltestellenMitBav(null, { fehler: 'HTTP 503' }, osm, mitte, 150)).toMatchObject({ quelle: 'osm', vollstaendig: false,
      zusatz: expect.stringContaining('BAV nicht erreichbar') })
    expect(haltestellenMitBav(null, { laedt: true }, osm, mitte, 150)).toBeNull()
  })
  it('Snapshot, Abrufzeit und bestätigte Eingaben bleiben beim Speichern und Lesen erhalten; alte Fälle bleiben lesbar', () => {
    const fall = leererFall(lat, lon, null)
    fall.amtlicheQuellen = { bav }
    fall.quellen.bav = '© BAV'
    fall.bedarf = { felder: { beduerfnis: { wert: ['haltestelle'], quelle: 'bestaetigt' } } }
    const text = fallSchreiben(fall), [neu, hinweise] = fallLesen(text)
    expect(JSON.parse(text).version).toBe(6)
    expect(hinweise).toEqual([])
    expect(neu.amtlicheQuellen).toEqual(fall.amtlicheQuellen)
    expect(neu.bedarf).toEqual(fall.bedarf)
    expect(neu.quellen.bav).toBe('© BAV')
    const alt = leererFall(lat, lon, null)
    expect(fallLesen(fallSchreiben(alt))[0].amtlicheQuellen).toBeUndefined()
    const ungueltig = JSON.parse(text); ungueltig.amtlicheQuellen.bav.halte[0].p = [8.5, 47.3]
    expect(fallLesen(JSON.stringify(ungueltig))[1]).toContain('Gespeicherte BAV-Haltestellen ungültig, übergangen')
  })
  it('Kartenebene zeigt BAV-Daten ohne AV oder Rechnung mit eindeutiger Herkunft und Zeit', () => {
    const d = ebenenAusGeo({ bav }, [])
    expect(d.bav).toHaveLength(3)
    expect(ebenenSichtbar(d).zeigen.map(e => e.id)).toContain('bav')
    expect(d.bav![0].text).toContain('BAV')
    expect(d.bav![0].text).toContain(bav.abgerufen)
  })
})
