import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { QUELLEN, AV_KANTONE, AV_NICHT_FREI, BERN_BFS, ETH_STAND, datenlage, datenlageSatz, datenschutzGruppen, gemeindeAmOrt, quelle,
  quellenFuer, THEMEN, type Gebiet } from './quellenregister'
import { bernZustaendig, bfsAmPunkt, BERN_GEMEINDEN } from './geoportal'
import { BERN_C_KEYS, BERN_DIENSTE_C } from './bernDienste'
import { PARKKATASTER } from './parkkataster'
import { BAUMKATASTER } from './baumkataster'
import { HALT_QUELLE_ID } from './haltestellen'
import { VD_QUELLE_ID } from './verkehrsdaten'
import { LUFTBILD_FGS_STAEDTE } from './luftbildFgs'
import type { AvFlaeche } from './av'
import type { P } from '../geo'

const SRC = resolve(__dirname, '..')
// Orte (WGS84): Bern Mühlemattstrasse, Zürich Bahnhofstrasse, Lausanne Place St-François
const BERN = { lat: 46.942, lon: 7.4323, bfs: 351, kanton: 'BE' }
const ZUERICH = { lat: 47.372, lon: 8.539, bfs: 261, kanton: 'ZH' }
const LAUSANNE = { lat: 46.5197, lon: 6.6323, bfs: 5586, kanton: 'VD' }

describe('Quellenregister: Vollständigkeit', () => {
  it('Kennungen eindeutig, jedes Modul vorhanden', () => {
    const ids = QUELLEN.map(q => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const q of QUELLEN) for (const m of q.module) expect(existsSync(join(SRC, m)), `${q.id}: ${m}`).toBe(true)
  })
  it('jeder Lader in src/daten hat einen Eintrag (Module mit Abruf, ohne die gemeinsamen Hilfen)', () => {
    const HILFEN = ['daten/holen.ts', 'daten/geoportal.ts']
    const lader = readdirSync(join(SRC, 'daten')).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).map(f => `daten/${f}`)
      .filter(m => !HILFEN.includes(m) && readFileSync(join(SRC, m), 'utf-8').split('\n')
        .some(z => !z.startsWith('import') && /\b(holeJson|holeText|arcgisHolen|fetch)\b/.test(z)))
    expect(lader.length).toBeGreaterThanOrEqual(17)
    const erfasst = new Set(QUELLEN.flatMap(q => q.module))
    for (const m of lader) expect(erfasst.has(m), m).toBe(true)
  })
  it('Lader tragen ihre Kennung; Gebiete stimmen mit den Ladern überein', () => {
    const bern = (id: string) => quelle(id)?.gebiet as Extract<Gebiet, { art: 'gemeinden' }>
    for (const k of BERN_C_KEYS) expect(bern(BERN_DIENSTE_C[k].quelleId)?.bfs, k).toEqual(BERN_GEMEINDEN)
    for (const q of [...PARKKATASTER, ...BAUMKATASTER]) expect(bern(q.quelleId)?.bfs, q.id).toEqual(q.gemeinden)
    expect(bern(HALT_QUELLE_ID).bfs).toEqual(BERN_GEMEINDEN)
    expect(bern(VD_QUELLE_ID).bfs).toEqual(BERN_GEMEINDEN)
    expect(BERN_GEMEINDEN).toEqual([BERN_BFS])
    for (const s of LUFTBILD_FGS_STAEDTE) {
      const q = QUELLEN.find(x => x.dienst === 'datei' && x.gebiet.art === 'bbox' && x.gebiet.name === s.stadt)
      expect(q?.gebiet, s.stadt).toMatchObject({ w: s.bbox[0], s: s.bbox[1], e: s.bbox[2], n: s.bbox[3] })
    }
    // Stand der Snapshots wie in den gebündelten Dateien (Feld «erzeugt»)
    for (const [k, stand] of Object.entries(ETH_STAND)) {
      const roh = JSON.parse(readFileSync(resolve(SRC, '..', 'public', `luftbild_fgs_${k}.json`), 'utf-8')) as { erzeugt: string }
      expect(roh.erzeugt.split('-').reverse().join('.'), k).toBe(stand)
      expect(quelle(`eth.fgs.${k}`)?.stand).toContain(stand)
    }
  })
  it('AV: 19 Kantone ganz, Wallis, Liechtenstein; die sechs ohne freie AV fehlen; heute alle Dienste mit CORS', () => {
    expect(AV_KANTONE.filter(k => k !== 'VS' && k !== 'FL')).toHaveLength(19)
    for (const k of AV_NICHT_FREI) expect(AV_KANTONE).not.toContain(k)
    expect(QUELLEN.every(q => q.cors === true)).toBe(true)
    expect(QUELLEN.every(q => q.datenschutz.length > 0 && q.lizenz.length > 0)).toBe(true)
  })
})

describe('gemeindeAmOrt', () => {
  const O: P = [2600000, 1200000]
  const q = (x0: number, x1: number): P[] => [[O[0] + x0, O[1] - 100], [O[0] + x1, O[1] - 100], [O[0] + x1, O[1] + 100], [O[0] + x0, O[1] + 100]]
  const AV: AvFlaeche[] = [
    { art: 'Gebaeude', kanton: 'BE', qualitaet: 'AV93', bfs: 355, ringe: [q(-100, 100)] },
    { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [q(-100, 0)] },
  ]
  it('Bern: BFS 351 und Kanton aus der Strassenfläche, sonst jede Fläche; ausserhalb null', () => {
    expect(gemeindeAmOrt([O[0] - 50, O[1]], AV)).toEqual({ bfs: 351, kanton: 'BE' })
    expect(gemeindeAmOrt([O[0] + 50, O[1]], AV)).toEqual({ bfs: 355, kanton: 'BE' })
    expect(gemeindeAmOrt([O[0], O[1] + 500], AV)).toBeNull()
    expect(gemeindeAmOrt([O[0], O[1]], [])).toBeNull()
  })
  it('bernZustaendig bleibt gleich (dünne Hülle, gleiche Wahl wie bfsAmPunkt)', () => {
    for (const p of [[O[0] - 50, O[1]], [O[0] + 50, O[1]], [O[0], O[1] + 500]] as P[]) {
      expect(gemeindeAmOrt(p, AV)?.bfs ?? null).toBe(bfsAmPunkt(p, AV))
      expect(bernZustaendig(p, AV)).toBe(bfsAmPunkt(p, AV) === 351)
    }
  })
})

describe('quellenFuer und datenlage', () => {
  it('Bern: schweizweite Quellen, alle Berner Dienste und der Berner Snapshot', () => {
    const ids = quellenFuer(BERN).map(q => q.id)
    expect(ids).toEqual(expect.arrayContaining(['av', 'swissimage', 'swissalti', 'osm', 'bern.park', 'bern.baum', 'bern.halt', 'bern.dtv',
      'bern.richtplan', 'bern.strassen', 'bern.vsig', 'bern.schulen', 'bern.taktil', 'bern.zonen', 'bern.oev', 'eth.fgs.bern']))
    expect(ids).not.toContain('eth.fgs.zurich')
    const d = datenlage(BERN)
    expect(d.tempo?.id).toBe('bern.vsig')
    expect(d.haltestellen?.id).toBe('bern.halt')
    expect(d.vermessung?.id).toBe('av')
    expect(THEMEN.every(t => d[t] !== null)).toBe(true)
  })
  it('Zürich: nur schweizweite Quellen und der Zürcher Snapshot', () => {
    const qs = quellenFuer(ZUERICH)
    expect(qs.filter(q => q.gebiet.art !== 'schweiz' && q.gebiet.art !== 'kantone').map(q => q.id)).toEqual(['eth.fgs.zurich'])
    const d = datenlage(ZUERICH)
    expect(d.vermessung?.id).toBe('av')
    expect(d.tempo?.id).toBe('osm')
    expect([d.parkfelder, d.baeume, d.dtv, d.fusswegnetz, d.taktil, d.zonen, d.oevLinien]).toEqual(Array(7).fill(null))
  })
  it('Lausanne: AV nicht frei (VD), keine örtliche Quelle', () => {
    expect(quellenFuer(LAUSANNE).map(q => q.id)).not.toContain('av')
    expect(quellenFuer(LAUSANNE).every(q => q.gebiet.art === 'schweiz')).toBe(true)
    expect(datenlage(LAUSANNE).vermessung).toBeNull()
    // ohne Kanton (keine AV-Fläche geladen) ebenso
    expect(datenlage({ lat: LAUSANNE.lat, lon: LAUSANNE.lon }).vermessung).toBeNull()
  })
})

describe('Satz «Datenlage hier»', () => {
  it('Bern', () => {
    expect(datenlageSatz(datenlage(BERN))).toBe('Datenlage hier: Vermessung, Luftbild, OSM, Luftbild-Streifen (ETH); dazu Stadt Bern: ' +
      'Parkfelder, Bäume, Haltestellen, Verkehrsmengen, Fusswegnetz, Strassentyp, Tempo-Signalisation, Schulen, taktile Markierungen, Zonen, ' +
      'ÖV-Linien.')
  })
  it('Zürich', () => {
    expect(datenlageSatz(datenlage(ZUERICH))).toBe('Datenlage hier: Vermessung, Luftbild, OSM, Luftbild-Streifen (ETH). Aus OSM: ' +
      'Haltestellen, Strassentyp, Tempo, Schulen; keine Quelle für Parkfelder, Bäume, Verkehrsmengen, Fusswegnetz, taktile Markierungen, ' +
      'Zonen, ÖV-Linien: Angaben von Hand.')
  })
  it('Lausanne (AV nicht frei)', () => {
    expect(datenlageSatz(datenlage(LAUSANNE))).toBe('Datenlage hier: Luftbild, OSM. Amtliche Vermessung hier nicht frei verfügbar: ' +
      'keine Rechnung.')
  })
  it('Ort mit freier AV ohne örtliche Quelle (z. B. Freiburg)', () => {
    expect(datenlageSatz(datenlage({ lat: 46.8065, lon: 7.1619, bfs: 2196, kanton: 'FR' }))).toBe('Datenlage hier: Vermessung, Luftbild, ' +
      'OSM. Aus OSM: Haltestellen, Strassentyp, Tempo, Schulen; keine Quelle für Parkfelder, Bäume, Verkehrsmengen, Fusswegnetz, taktile ' +
      'Markierungen, Zonen, ÖV-Linien: Angaben von Hand.')
  })
})

describe('Datenschutz aus dem Register', () => {
  it('je Empfänger eine Zeile im bisherigen Wortlaut', () => {
    const { gruppen, eigen } = datenschutzGruppen()
    expect(gruppen.map(g => g.name)).toEqual(['swisstopo (geo.admin.ch)', 'geodienste.ch (Amtliche Vermessung)', 'Overpass (OpenStreetMap)',
      'map.bern.ch (Geodaten Stadt Bern), nur in der Stadt Bern'])
    const t = Object.fromEntries(gruppen.map(g => [g.name.split(' ')[0], g.text]))
    expect(t['swisstopo']).toMatch(/^Kartenkacheln \(Luftbild bzw\. Landeskarte\) des sichtbaren Ausschnitts \(wmts\.geo\.admin\.ch\); Luftbild-Ausschnitt ±30 m/)
    expect(t['swisstopo']).toContain('bei der Ortssuche der eingegebene Suchbegriff (api3.geo.admin.ch)')
    expect(t['geodienste.ch']).toBe('Rechteck ±150 m um den Übergang bzw. die geplanten Streifen.')
    expect(t['Overpass']).toContain('Server overpass.osm.ch (Swiss OpenStreetMap Association), bei Störung ersatzweise overpass-api.de')
    expect(t['map.bern.ch']).toBe('Rechteck ±150 m für amtliche Parkfelder, Baumkataster, Haltestellen, Verkehrsdaten, Richtplan Fussverkehr, ' +
      'Strassenhierarchie und Strassentypen, signalisierte Höchstgeschwindigkeit, Volksschulen und Kindergärten (±200 m), taktil-visuelle ' +
      'Markierungen, Nutzungszonen und ÖV-Linien. Die Kartenebene «Richtplan Fussverkehr (Geoportal Bern)» sendet den sichtbaren ' +
      'Kartenausschnitt mit Rand (Rechteck in LV95, je Layer eine Abfrage) nur, wenn sie eingeschaltet ist. Die Kartenebene «Taktile ' +
      'Markierungen (Stadt Bern)» sendet den sichtbaren Kartenausschnitt mit Rand (Rechteck in LV95, je Layer eine Abfrage, zwei Layer) ' +
      'nur, wenn sie eingeschaltet ist, und erst ab Zoomstufe 15.')
    expect(eigen).toEqual(['Die Streifen aus dem Luftbild (ETH-Modell) liegen als Datei je Stadt auf dieser Seite: dafür geht keine ' +
      'Anfrage an einen anderen Dienst.'])
  })
})
