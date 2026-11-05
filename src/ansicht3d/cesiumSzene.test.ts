// Die echten Szenenabläufe mit Cesium-Datentypen, aber ohne WebGL oder Netz prüfen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Szene3D } from './modell'
import type { Stand3D } from './stand'
import { wgs } from '../geo'
import { Cartographic, ClassificationType, HeightReference } from 'cesium'

const test = vi.hoisted(() => ({ widgets: [] as any[], terrain: 500 as number | undefined, terrainFehler: false, dtm: 500.04, profilStartFehlt: false,
  baute: [] as any[], ladeBaute: null as null | Promise<any> }))
vi.mock('./kunstbauten', async original => ({ ...await original<typeof import('./kunstbauten')>(),
  kunstbautenLesen: vi.fn(async () => test.ladeBaute ? await test.ladeBaute : test.baute) }))
vi.mock('./bodenprofil', async original => ({ ...await original<typeof import('./bodenprofil')>(),
  ladeBodenProfil: vi.fn(async (punkte: [number, number][]) => {
    if (test.terrain === undefined || test.terrainFehler) throw new Error('Profil fehlt')
    return { dienst: 'bern.dtm', bezug: 'LN02', versatzM: -0.04,
      messwerte: punkte.map((_, i) => i === 0 && test.profilStartFehlt ? null : test.dtm),
      szeneHoehen: punkte.map((_, i) => i === 0 && test.profilStartFehlt ? null : test.dtm - 0.04) }
  }) }))
vi.mock('cesium', async original => {
  const C = await original<typeof import('cesium')>()
  class Widget {
    scene: any; camera: any; entities: any; imageryLayers: any; creditDisplay: any
    clock = {}; destroy = vi.fn(); resize = vi.fn()
    constructor() {
      const primitives: any[] = []
      this.scene = { globe: { tilesLoaded: true, tileLoadProgressEvent: new C.Event() }, shadowMap: {},
        postProcessStages: { fxaa: {} }, screenSpaceCameraController: {}, renderError: new C.Event(), requestRender: vi.fn(),
        sampleHeightSupported: false,
        primitives: { add: vi.fn(p => { primitives.push(p); return p }), remove: vi.fn(p => {
          const i = primitives.indexOf(p); if (i >= 0) primitives.splice(i, 1); return i >= 0
        }), values: primitives } }
      this.camera = { frustum: new C.PerspectiveFrustum(), lookAtTransform: vi.fn(), setView: vi.fn(), lookAt: vi.fn() }
      this.entities = new C.EntityCollection()
      vi.spyOn(this.entities, 'suspendEvents'); vi.spyOn(this.entities, 'resumeEvents')
      this.imageryLayers = { addImageryProvider: vi.fn(() => ({})), remove: vi.fn() }
      this.creditDisplay = { addStaticCredit: vi.fn() }
      test.widgets.push(this)
    }
  }
  return { ...C, CesiumWidget: Widget, WebMapTileServiceImageryProvider: class {},
    CesiumTerrainProvider: { fromUrl: vi.fn(async () => ({})) },
    Cesium3DTileset: { fromUrl: vi.fn(async () => ({ show: true, tilesLoaded: true, totalMemoryUsageInBytes: 0,
      loadProgress: new C.Event(), destroy: vi.fn(), isDestroyed: () => false })) },
    sampleTerrainMostDetailed: vi.fn(async (_provider, points) => {
      if (test.terrainFehler) throw new Error('offline')
      points.forEach((p: any) => { p.height = test.terrain }); return points
    }) }
})

import { MODELLE, szeneOeffnen } from './cesiumSzene'
const ziel: [number, number] = [47.2, 8.5]
function modell(p = ziel): Szene3D {
  return { flaechen: [], linien: [], waende: [], koerper: [], sichtlinien: [], kamera: {
    fahrzeug: { auge: p, ziel: p, augHoehe: 1, zielHoehe: 0.6, peilung: 0, abstandM: 1, bruecke: false, zufahrt: 'weg' },
    uebersicht: { ziel: p, peilung: 0, distanzM: 60, neigungGrad: -45 } },
    wege: [{ id: 'weg', punkte: [p] }], leer: false, legende: '', bruecken: [] }
}
const aktiv: (() => void)[] = []
async function oeffnen() {
  const ctrl = new AbortController(), staende: Stand3D[] = []
  const s = await szeneOeffnen({} as HTMLElement, {} as HTMLElement, stand => staende.push(stand), ctrl.signal,
    { gebaeude: false, baeume: false, bruecken: true })
  aktiv.push(() => { ctrl.abort(); s.zerstoeren() })
  return { s, w: test.widgets.at(-1)!, staende }
}
beforeEach(() => {
  test.widgets = []; test.profilStartFehlt = false; test.dtm = 500.04; test.terrain = 500; test.terrainFehler = false; test.baute = []; test.ladeBaute = null
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
})
afterEach(() => { aktiv.splice(0).forEach(f => f()); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('3D-Szene ohne WebGL', () => {
  it.each(['undefined', 'abgelehnt'])('fehlendes Gelände (%s) lässt keine Nullhöhen oder NaN in Geometrie und Kamera gelangen', async art => {
    test.terrain = undefined; test.terrainFehler = art === 'abgelehnt'
    const { s, w, staende } = await oeffnen(), m = modell()
    m.sichtlinien.push({ id: 'sl', fahrbahn: 'weg', auge: ziel, ziel, augHoehe: 1, zielHoehe: 0.6, frei: null, farbe: '#ff0000', text: 'Sicht' })
    m.waende.push({ id: 'w', punkte: [ziel, [47.20001, 8.5]], hoehe: 1, farbe: '#ff0000', text: 'Wand' })
    m.koerper.push({ id: 'k', fahrbahn: 'weg', art: 'auto', mitte: ziel, peilung: 0, masse: [4, 2, 1.5], farbe: '#ff0000', text: 'Auto' })
    await s.zeigen(m)
    expect(w.entities.values).toHaveLength(0)
    expect(await s.kamera('fahrzeug')).toBe('uebersicht')
    expect(w.camera.lookAt).not.toHaveBeenCalled()
    const position = w.camera.setView.mock.calls.at(-1)[0].destination
    expect([position.x, position.y, position.z].every(Number.isFinite)).toBe(true)
    expect(staende.at(-1)?.hinweis).toContain('entfernte Übersicht')
  })
  it.each([['Unterführung', 500.04, 500], ['Brückenkopf', 505.04, 505]] as const)
    ('%s: Fahrzeug, Person und Kamera erhalten dieselbe zugeordnete Fahrbahn', async (_fall, dtm, erwartet) => {
      test.dtm = dtm
      const { s, w } = await oeffnen()
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
      test.baute = [{ name: 'Brücke', dreiecke: new Float64Array([2600000, 1200000, 505, 2600020, 1200000, 505, 2600000, 1200020, 505]) }]
      const p = wgs(2600005, 1200005), m = modell(p)
      m.wege!.push({ id: 'streifen', punkte: [p] })
      m.koerper.push({ id: 'auto', fahrbahn: 'weg', art: 'auto', mitte: p, peilung: 0, masse: [4, 2, 1.5], farbe: '#ff0000', text: 'Auto' },
        { id: 'person', fahrbahn: 'streifen', art: 'person', mitte: p, peilung: 0, masse: [0.5, 0.5, 1.7], farbe: '#ff0000', text: 'Person' })
      await s.zeigen(m)
      expect(w.entities.values).toHaveLength(2)
      const auto = w.entities.values.find((e: any) => e.name === 'Auto')
      const person = w.entities.values.find((e: any) => e.name === 'Person')
      expect(Cartographic.fromCartesian(auto.position.getValue()).height).toBeCloseTo(erwartet + 0.75, 2)
      expect(person.cylinder.heightReference.getValue()).toBe(HeightReference.NONE)
      expect(Cartographic.fromCartesian(person.position.getValue()).height).toBeCloseTo(erwartet + 0.85, 2)
      expect(await s.kamera('fahrzeug')).toBe('fahrzeug')
      expect(Cartographic.fromCartesian(w.camera.setView.mock.calls.at(-1)[0].destination).height).toBeCloseTo(erwartet + 1, 2)
    })
  it.each([0.043077, 0.24523, 0.245771, 0.31231])('Klösterlistutz: Personen und Markierungen folgen dem um %s m höheren sichtbaren Boden', async differenz => {
    test.dtm = 504.18; test.terrain = 504.14 + differenz
    const { s, w } = await oeffnen(), m = modell()
    const ring: [number, number][] = [ziel, [47.20001, 8.5], [47.20001, 8.50001], [47.2, 8.50001]]
    m.koerper.push({ id: 'person', fahrbahn: 'weg', art: 'person', mitte: ziel, peilung: 0, masse: [0.5, 0.5, 1.7], farbe: '#ff0000', text: 'Person' })
    m.flaechen.push({ id: 'streifen', fahrbahn: 'weg', art: 'streifen', ringe: [ring], farbe: '#ffff00', alpha: 1, text: 'Streifen' })
    m.linien.push({ id: 'spur', fahrbahn: 'weg', art: 'spur', punkte: ring.slice(0, 2), farbe: '#ffffff', breite: 2, text: 'Spur' })
    await s.zeigen(m)
    const person = w.entities.values.find((e: any) => e.name === 'Person')
    // Die Unterkante folgt der feinsten Geländeprobe, unabhängig von der tieferen DTM-Fahrbahnhöhe.
    expect(person.cylinder.heightReference.getValue()).toBe(HeightReference.NONE)
    expect(Cartographic.fromCartesian(person.position.getValue()).height).toBeCloseTo(test.terrain! + 0.85, 5)
    const streifen = w.entities.values.find((e: any) => e.name === 'Streifen').polygon
    expect(streifen.classificationType.getValue()).toBe(ClassificationType.TERRAIN)
    expect(streifen.perPositionHeight).toBeUndefined()
    const spur = w.entities.values.find((e: any) => e.name === 'Spur').polyline
    expect(spur.clampToGround.getValue()).toBe(true)
    expect(spur.classificationType.getValue()).toBe(ClassificationType.TERRAIN)
    // Die Darstellungskorrektur ändert die physische Augenhöhe nicht.
    await s.kamera('fahrzeug')
    expect(Cartographic.fromCartesian(w.camera.setView.mock.calls.at(-1)[0].destination).height).toBeCloseTo(505.14, 4)
  })
  it.each(['Boden', 'Brücke'] as const)('%s: beide Personenmodelle stehen mit ihrer tatsächlichen Fusssohle auf der Fläche', async ort => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    test.terrain = 500.31; test.dtm = ort === 'Brücke' ? 505.04 : 500.04
    test.baute = [{ name: 'Brücke', dreiecke: new Float64Array([2600000, 1200000, 505, 2600020, 1200000, 505, 2600000, 1200020, 505]) }]
    const { s, w } = await oeffnen(), p = wgs(2600005, 1200005), m = modell(p)
    for (let i = 0; i < 2; i++) m.koerper.push({ id: `person${i}`, fahrbahn: 'weg', art: 'person', mitte: p, peilung: 0,
      masse: [0.5, 0.5, 1.7], farbe: '#ff0000', text: `Person${i}` })
    m.flaechen.push({ id: 'streifen', fahrbahn: 'weg', art: 'streifen', ringe: [[p, wgs(2600006, 1200005), wgs(2600005, 1200006)]],
      farbe: '#ffff00', alpha: 1, text: 'Streifen' })
    await s.zeigen(m)
    for (const e of w.entities.values.filter((e: any) => e.model)) {
      const def = MODELLE.person!.find(m => e.model.uri.getValue().endsWith(m.datei))!
      const fuss = Cartographic.fromCartesian(e.position.getValue()).height + def.unterkanteModell! * e.model.scale.getValue()
      expect(e.model.heightReference.getValue()).toBe(HeightReference.NONE)
      expect(fuss).toBeCloseTo(ort === 'Boden' ? test.terrain! : 505, 5)
    }
    expect(w.entities.values.filter((e: any) => e.model)).toHaveLength(2)
    const streifen = w.entities.values.find((e: any) => e.name === 'Streifen').polygon
    if (ort === 'Brücke') {
      expect(streifen.perPositionHeight.getValue()).toBe(true)
      expect(Cartographic.fromCartesian(streifen.hierarchy.getValue().positions[0]).height).toBeCloseTo(505.075, 4)
    } else expect(streifen.classificationType.getValue()).toBe(ClassificationType.TERRAIN)
  })
  it('auf einem ergänzten Anschluss stehen Person und Markierung über dem tieferen Gelände', async () => {
    test.dtm = 505.04
    const { s, w } = await oeffnen(), p = wgs(2600005, 1200005), q = wgs(2600010, 1200005), m = modell(p)
    m.wege = [{ id: 'weg', punkte: [p, q] }]
    const ring = (x0: number, x1: number, y0: number, y1: number) =>
      [wgs(x0, y0), wgs(x1, y0), wgs(x1, y1), wgs(x0, y1)]
    m.flaechen.push({ id: 'av', art: 'av', avArt: 'Strasse_Weg', ringe: [ring(2600000, 2600020, 1200000, 1200010)],
      farbe: '#777777', alpha: 1, text: 'Strasse' })
    m.bruecken = [[ring(2600020, 2600030, 1200000, 1200010)]]
    m.koerper.push({ id: 'person', fahrbahn: 'weg', art: 'person', mitte: wgs(2600007, 1200005), peilung: 0,
      masse: [0.5, 0.5, 1.7], farbe: '#ff0000', text: 'Person' })
    m.flaechen.push({ id: 'streifen', fahrbahn: 'weg', art: 'streifen', ringe: [ring(2600006, 2600008, 1200004, 1200006)],
      farbe: '#ffff00', alpha: 1, text: 'Streifen' })
    await s.zeigen(m)
    expect(w.entities.values.some((e: any) => e.name.startsWith('Ergänzter Fahrbahnanschluss'))).toBe(true)
    const person = w.entities.values.find((e: any) => e.name === 'Person')
    expect(person.cylinder.heightReference.getValue()).toBe(HeightReference.NONE)
    expect(Cartographic.fromCartesian(person.position.getValue()).height).toBeCloseTo(505.02 + 0.85, 5)
    const streifen = w.entities.values.find((e: any) => e.name === 'Streifen').polygon
    expect(streifen.perPositionHeight.getValue()).toBe(true)
    expect(Cartographic.fromCartesian(streifen.hierarchy.getValue().positions[0]).height).toBeCloseTo(505.02 + 0.075, 5)
  })
  it('ohne Ausgangsmessung bei mehreren Ebenen weder Boden noch Deck als Start raten', async () => {
    test.profilStartFehlt = true
    const { s, w } = await oeffnen()
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    test.baute = [{ name: 'Brücke', dreiecke: new Float64Array([2600000, 1200000, 505, 2600020, 1200000, 505, 2600000, 1200020, 505]) }]
    const p = wgs(2600005, 1200005), m = modell(p)
    m.koerper.push({ id: 'auto', fahrbahn: 'weg', art: 'auto', mitte: p, peilung: 0, masse: [4, 2, 1.5], farbe: '#ff0000', text: 'Auto' })
    await s.zeigen(m)
    expect(w.entities.values).toHaveLength(0)
    expect(await s.kamera('fahrzeug')).toBe('uebersicht')
  })
  it('bei Geometriefehler werden Events fortgesetzt und die nächste Aktualisierung funktioniert', async () => {
    const { s, w } = await oeffnen(), m = modell()
    m.koerper.push({ id: 'k', fahrbahn: 'weg', art: 'auto', mitte: ziel, peilung: 0, masse: [4, 2, 1.5], farbe: '#ff0000', text: 'Auto' })
    const add = vi.spyOn(w.entities, 'add').mockImplementationOnce(() => { throw new Error('Geometrie') })
    await expect(s.zeigen(m)).rejects.toThrow('Geometrie')
    expect(w.entities.resumeEvents).toHaveBeenCalledTimes(1)
    add.mockRestore()
    await s.zeigen(m)
    expect(w.entities.values).toHaveLength(1)
  })
  it('Bern → ausserhalb: spätes Berner Ergebnis wird weder eingebaut noch gemeldet', async () => {
    const { s, w, staende } = await oeffnen()
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    let resolve!: (b: any[]) => void
    test.ladeBaute = new Promise(ja => { resolve = ja })
    const alt = s.zeigen(modell([46.948, 7.447]))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('StadtBern_Kunstbauten'), expect.anything()))
    await s.zeigen(modell())
    const anzahl = w.scene.primitives.add.mock.calls.length
    resolve([{ name: 'alt', dreiecke: new Float64Array([2600000, 1200000, 505, 2600010, 1200000, 505, 2600000, 1200010, 505]) }])
    await alt
    expect(w.scene.primitives.add.mock.calls).toHaveLength(anzahl)
    expect(staende.at(-1)?.kunstbauten).toBeUndefined()
  })
  it('beim Verlassen Berns werden vorhandenes Netz und Ausblendefilter entfernt', async () => {
    const { s, w, staende } = await oeffnen()
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    test.baute = [{ name: 'Brücke', dreiecke: new Float64Array([2600000, 1200000, 505, 2600010, 1200000, 505, 2600000, 1200010, 505]) }]
    await s.zeigen(modell([46.948, 7.447]))
    expect(staende.at(-1)?.kunstbauten).toBe(1)
    expect(w.scene.primitives.values).toHaveLength(2)
    await s.zeigen(modell())
    expect(w.scene.primitives.values).toHaveLength(1)
    expect(w.scene.primitives.values[0].style).toBeUndefined()
    expect(staende.at(-1)?.kunstbauten).toBeUndefined()
  })
})
