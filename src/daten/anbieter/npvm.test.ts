import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { wgs, type P } from '../../geo'
import { fallLesen, fallSchreiben, leererFall } from '../../fall'
import { eingabenBilden } from '../../bedarf/fallBedarf'
import { ladeNpvm, NPVM_METADATEN_URL, npvmMetadaten, npvmUmwandeln, npvmUrl, type NpvmSnapshot } from './npvm'
import { npvmZuordnen } from './npvmZuordnung'
import { npvmBelegLesen, npvmSnapshotLesen } from './npvmSpeicher'
import roh from './testdaten/npvm/zuerich.json'
import vergleich from './testdaten/npvm/richtungsabgleich.json'

const legende = readFileSync(join(__dirname, 'testdaten/npvm/legende.html'), 'utf8')
const o: P = [2600000, 1200000], p = (x: number, y: number): P => [o[0] + x, o[1] + y]
const achse: [P, P] = [p(0, -4), p(0, 4)], spuren = [[p(-40, 0), p(40, 0)]]
const snapshot = (): NpvmSnapshot => ({ version: 1, quelleId: 'are.npvm', abgerufen: '2026-11-01T20:00:00.000Z',
  datenstand: '2023-06-30', bezugsjahr: 2023, datenstandQuelle: NPVM_METADATEN_URL, mitte: o, radiusM: 200,
  url: npvmUrl(...wgs(...o)), vollstaendigkeit: 'unbekannt',
  linien: [{ id: 'npvm:1', nr: 1, dtv: 1234, teile: [[p(-40, 0), p(40, 0)]] }] })
afterEach(() => vi.unstubAllGlobals())
describe('NPVM: echte Quelldaten und Semantik', () => {
  it('liest aktuelle Modellmetadaten statt Abrufjahr und DWV; echte Probe enthält 64 Modellstrecken', () => {
    expect(npvmMetadaten(legende)).toEqual({ datenstand: '2023-06-30', bezugsjahr: 2023 })
    const r = npvmUmwandeln(roh)
    expect(r).toHaveLength(64)
    expect(r.find(l => l.nr === 844258)?.dtv).toBe(829)
    expect(roh.results[0].properties.dwv_fzg).toBe(934)
  })
  it('Online-DTV stimmt mit der Summe der Richtungen des offiziellen Originalexports überein', () => {
    for (const v of vergleich) {
      expect(v.richtungen.reduce((s, r) => s + r.dtv, 0)).toBe(v.api)
      expect(npvmUmwandeln(roh).find(l => l.nr === v.nr)?.dtv).toBe(v.api)
    }
    expect(vergleich.some(v => v.richtungen.some(r => r.motorrad > 0))).toBe(true)
  })
  it('fehlender DTV wird nie durch DWV, Null oder eine Fahrzeug-Untergruppe ersetzt', () => {
    const f = roh.results[0]
    for (const dtv_fzg of [null, undefined, '829', -1, Infinity])
      expect(npvmUmwandeln({ results: [{ ...f, properties: { ...f.properties, dtv_fzg } }] })[0].dtv).toBeNull()
    expect(npvmUmwandeln({ results: [{ ...f, properties: { ...f.properties, dtv_fzg: 0 } }] })[0].dtv).toBe(0)
  })
  it('Doppel werden entfernt; fremde Quelle, falsche Koordinaten und widersprüchliche IDs abgelehnt', () => {
    const f = roh.results[0]
    expect(npvmUmwandeln({ results: [f, f] })).toHaveLength(1)
    expect(() => npvmUmwandeln({ results: [{ ...f, layerBodId: 'falsch' }] })).toThrow('Datenquelle')
    expect(() => npvmUmwandeln({ results: [{ ...f, geometry: { type: 'LineString', coordinates: [[8, 47], [8, 48]] } }] })).toThrow('LV95')
    expect(() => npvmUmwandeln({ results: [f, { ...f, properties: { ...f.properties, dtv_fzg: 2 } }] })).toThrow('widersprüchlich')
  })
  it('jeder neue Abruf bezieht Daten und Metadaten neu; Metadaten-Ausfall lässt die Kartenobjekte nutzbar', async () => {
    let html = legende
    const holen = vi.fn(async (url: string) => url === NPVM_METADATEN_URL ? new Response(html) : new Response(JSON.stringify(roh)))
    vi.stubGlobal('fetch', holen)
    const [lat, lon] = wgs(...o), a = await ladeNpvm(lat, lon)
    html = legende.replace('30.06.2023', '01.10.2026')
    expect((await ladeNpvm(lat, lon)).daten.datenstand).toBe('2026-10-01')
    expect(a.daten.datenstand).toBe('2023-06-30'); expect(holen).toHaveBeenCalledTimes(4)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === NPVM_METADATEN_URL ? new Response('', { status: 503 }) : new Response(JSON.stringify(roh))))
    expect((await ladeNpvm(lat, lon)).daten).toMatchObject({ bezugsjahr: null, datenstand: null, linien: expect.any(Array) })
  })
})
describe('NPVM: konservative Zuordnung', () => {
  it('eindeutige Querungsachse und beidseitige OSM-Nähe ergeben einen nachvollziehbaren Vorschlag', () => {
    const r = npvmZuordnen(snapshot(), achse, spuren)
    expect(r.beleg).toMatchObject({ wert: 1234, linie: 'npvm:1', nr: 1, bezug: 'summe_richtungen_je_modellstrecke', achse })
    expect(npvmBelegLesen(r.beleg)).toEqual(r.beleg)
  })
  it('Parallelachsen, Knoten und mehrere Modellstrecken werden nicht willkürlich ausgewählt oder addiert', () => {
    const s = snapshot(); s.linien.push({ id: 'npvm:2', nr: 2, dtv: 6000, teile: [[p(-40, 2), p(40, 2)]] })
    expect(npvmZuordnen(s, achse, spuren).beleg).toBeNull()
    s.linien.reverse(); expect(npvmZuordnen(s, achse, spuren).beleg).toBeNull()
  })
  it('Brücken, Tunnel, fehlender Netzbezug und abweichende Modellfassung bleiben offen', () => {
    expect(npvmZuordnen(snapshot(), achse, spuren, true).beleg).toBeNull()
    expect(npvmZuordnen(snapshot(), achse, [[p(-40, 30), p(40, 30)]]).beleg).toBeNull()
    expect(npvmZuordnen({ ...snapshot(), bezugsjahr: 2025 }, achse, spuren).beleg).toBeNull()
    expect(npvmZuordnen(snapshot(), achse, []).beleg).toBeNull()
  })
  it('leeres Modellnetz, nur einseitige Abschnitte, fehlende DTV und unzureichende Abdeckung ergeben keinen Wert', () => {
    const s = snapshot()
    expect(npvmZuordnen({ ...s, linien: [] }, achse, spuren).hinweis).toContain('bedeutet nicht keinen Verkehr')
    expect(npvmZuordnen({ ...s, radiusM: 10 }, achse, spuren).beleg).toBeNull()
    s.linien[0].dtv = null; expect(npvmZuordnen(s, achse, spuren).beleg).toBeNull()
    s.linien[0].teile = [[p(0, 0), p(40, 0)]]; expect(npvmZuordnen(s, achse, spuren).beleg).toBeNull()
  })
  it('gespeicherte Ausschnitte und Bestätigungsbelege bleiben lesbar; Manipulationen werden verworfen', () => {
    const s = snapshot(), beleg = npvmZuordnen(s, achse, spuren).beleg!, f = leererFall(...wgs(...o), null)
    f.npvm = s; f.bedarf = { felder: { dtv: { wert: beleg.wert, quelle: 'bestaetigt', npvmBeleg: beleg } } }
    const text = fallSchreiben(f), [n, hinweise] = fallLesen(text)
    expect(JSON.parse(text).version).toBe(7); expect(hinweise).toEqual([])
    expect(n.npvm).toEqual(s); expect(n.bedarf?.felder.dtv.npvmBeleg).toEqual(beleg)
    expect(eingabenBilden({}, n.bedarf).herkunft.get('dtv')?.text).toContain('modelliert (NPVM 2023)')
    expect(npvmSnapshotLesen({ ...s, datenstandQuelle: 'https://fremd.example' })).toBeNull()
    expect(npvmBelegLesen({ ...beleg, wert: -1 })).toBeNull()
    const falsch = JSON.parse(text); falsch.bedarf.felder.dtv.wert++
    expect(fallLesen(JSON.stringify(falsch))[1]).toContain('NPVM-Zuordnungsbeleg zum DTV ungültig, übergangen')
  })
})
