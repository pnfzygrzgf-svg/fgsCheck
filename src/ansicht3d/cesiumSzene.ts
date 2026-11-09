// ── 3D-Ansicht: Szene mit CesiumJS (einzige Datei, die Cesium lädt; erst beim Öffnen der Ansicht per import()) ──
//
// Gelände (quantized mesh) und die 3D-Tiles der Brücken (swissTLM3D) und Gebäude (swissBUILDINGS3D) kommen
// direkt von swisstopo; Fahrzeuge, Personen, Kamera und Sichtlinien stehen auf dem Gelände und auf einer Brücke auf deren Fahrbahn (Höhen selbst
// bestimmt, nicht an 3D-Kacheln angedockt). Den
// Boden bilden die AV-Flächen des Falls als eigene Bildebene (avBild.ts), deckend; rundherum liegt die graue Karte swissTLM für 3D, das
// Luftbild ist zuschaltbar; kein Cesium-ion-Konto, keine Ausweichdienste. Die übrige Geometrie des Falls (modell.ts) wird auf
// das Gelände gelegt (ClassificationType, clampToGround) mit selbst bestimmten Höhen dargestellt; Sichtlinien und Wände bekommen
// ihre Höhen aus dem geladenen Gelände (sampleTerrainMostDetailed). Die Szenenhöhen werden
// nirgends als Meter über Meer gezeigt. Nur Darstellung: ein Pixel ist kein Befund, die Rechnung bleibt unverändert.
// Kamera «Aus dem Fahrzeug»: Auge der gewählten Zufahrt auf Geländehöhe + Augenhöhe, Blick zum Streifen; «Übersicht»: Kreisbahn um den
// Streifen (camera.lookAt), Ziehen dreht, Rad zoomt, rechte Maustaste bzw. Strg kippt; «Frei»: dieselbe Kamera vom Streifen gelöst,
// Ziehen verschiebt über die Karte (Standardsteuerung von Cesium). Jede asynchrone Stufe prüft das Abbruchsignal;
// zerstoeren() gibt Renderer und Listener frei.

import type { KameraModus, Koerper3D, Szene3D, LL } from './modell'
import { BAUM_KRONE_MASSE, BAUM_KRONE_MITTE_M, EBENE, aufBruecke, linieBeruehrtBruecke, kameraHeadingPitch, koerperHeading, uebersichtKamera, verdichten, versatz, type Flaeche3D } from './modell'
import type { Stand3D, Dienst3D, DienstStand3D } from './stand'
import { lv95, wgs } from '../geo'
import { ladeBodenProfil, type BodenProfil } from './bodenprofil'
import { anschlussFlaechen, anschlussProben, naheUmriss, tragendeFlaechen, ANSCHLUSS_NAEHE_M, ANSCHLUSS_TEXT, type AnschlussFlaeche } from './anschluss'
import { abstandPunkt, enthaelt, vereinigung } from '../rechner/poly'
import { fahrbahnVerfolgen, gueltigeHoehe, hoeheWaehlen, kandidaten, wegBezug, type FahrbahnProbe } from './fahrbahn'
import { anfragenFolge, ebenenLader, mitEreignispause } from './ladevorgaenge'
import { LN02_ZU_SZENE_M, bauHoehen, grenzenLv95, grundriss, inBern, naheBau, kunstbautenLesen, kunstbautenUrl, type Grundriss, type Kunstbaute } from './kunstbauten'
import { AV_MAX_STUFE, KACHEL_PX, avFuellung, avSchluessel, gesamtGrenzen, grenzen, kachelZeichnen, type AvBildFlaeche, type AvBildTeil } from './avBild'

type Cesium = typeof import('cesium')

export const TERRAIN_URL = 'https://3d.geo.admin.ch/ch.swisstopo.terrain.3d/v1/'
export const GEBAEUDE_URL = 'https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json'
/** Kunstbauten aus swissTLM3D (Brücken, KUNSTBAUTE 200/450); das Gelände (DTM) enthält keine Brücken */
export const BRUECKEN_URL = 'https://3d.geo.admin.ch/ch.swisstopo.swisstlm3d.3d/v1/tileset.json'
export type TilesetSchluessel = 'gebaeude' | 'bruecken'
const TILESET_NAME: Readonly<Record<TilesetSchluessel, string>> = { gebaeude: 'Gebäude', bruecken: 'Brücken' }
/** neutraler Grund (Globus, solange keine Kacheln da sind) und Grundton, mit dem die AV-Flächen deckend gemischt werden; Himmel */
export const BODEN_FARBE = '#d6d3cb'
export const HIMMEL_FARBE = '#dbeafe'
/** Grundkarte: Karte swissTLM für 3D (grau), im Raster EPSG:4326 (Matrixsatz 4326_18, Stufe 0 = 2 × 1 Kacheln wie Cesiums GeographicTilingScheme) */
export const KARTE_URL = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-karte-grau.3d/default/current/4326/{TileMatrix}/{TileCol}/{TileRow}.jpeg'
export const KARTE_MAX_STUFE = 18
/** Luftbild SWISSIMAGE im Raster EPSG:4326 (Matrixsatz 4326_19); Stufe 20 gibt es nicht */
export const BILD_URL = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/4326/{TileMatrix}/{TileCol}/{TileRow}.jpeg'
export const BILD_MAX_STUFE = 19
/** unterhalb Stufe 4 und ausserhalb der Schweiz gibt es keine Kacheln (Stufe 0 antwortet mit 400); gilt für Karte und Luftbild */
export const BILD_MIN_STUFE = 4
export const BILD_RECHTECK = [5.9, 45.7, 10.6, 47.9] as const
/** AV-Flächen über dem Luftbild nur als Tönung (wie auf der 2D-Karte); über der Karte deckend, damit deren Strassen nicht durchscheinen */
const AV_UEBER_LUFTBILD = 0.3
/** fester Sonnenstand für Licht und Schatten (Sommer, früher Nachmittag), unabhängig von der Uhrzeit */
export const SONNE_ZEIT = '2026-06-21T12:00:00Z'
/** Ort der Cesium-Dateien (scripts/cesium_assets.mjs kopiert sie nach public/cesium) */
export const CESIUM_PFAD = 'cesium/'
/** 3D-Modelle für Körper (public/modelle/, Herkunft und Lizenz in HERKUNFT.txt): Masse des Modells in glTF-Einheiten, damit die Szene es auf
 *  die Darstellungsmasse (modell.ts) skaliert; Cesium stellt glTF +Z nach vorn (+X der Szene), die Peilung dreht wie bei den Boxen.
 *  Fehlt ein Modell (HEAD-Abruf schlägt fehl), bleibt der einfache Körper. */
/** kippGrad: Neigung um die Querachse, falls das Modell in der Datei liegt statt steht (skinnte FBX-Exporte) */
export interface ModellDef { datei: string; laengeModell: number; hoeheModell: number; drehungGrad: number; kippGrad?: number; unterkanteModell?: number }
export const MODELLE: Readonly<Partial<Record<Koerper3D['art'], readonly ModellDef[]>>> = {
  auto: [{ datei: 'modelle/auto.glb', laengeModell: 4.209, hoeheModell: 1.528, drehungGrad: 0 }],
  // Personen abwechselnd Mann und Frau (Quaternius, Ruhepose statisch gebacken; siehe public/modelle/HERKUNFT.txt)
  // Unterkante der Fusssohlen in glTF-Y: der Modellursprung liegt geringfügig über den Füssen.
  person: [{ datei: 'modelle/person_m.glb', laengeModell: 1, hoeheModell: 4.81, drehungGrad: 0, unterkanteModell: -0.004294701122169366 },
    { datei: 'modelle/person_w.glb', laengeModell: 1, hoeheModell: 4.62, drehungGrad: 0, unterkanteModell: -0.025982547049364882 }],
}
/** Farbanteil des Fahrzeugs auf dem Modell (Rolle und Auswahl bleiben erkennbar); Personen behalten ihre eigenen Farben */
const MODELL_FARBANTEIL = 0.45
export type Kategorie = 'fahrzeuge' | 'personen'
const KATEGORIE: Readonly<Record<Koerper3D['art'], Kategorie | null>> = { auto: 'fahrzeuge', velo: 'fahrzeuge', person: 'personen', baum: null }
/** Kamera nicht über die Augenhöhe heben und die Fahrbahn vor dem Auto nicht abschneiden [m] */
const KAMERA_MIN_M = 0.3
/** Farbe der Berner Kunstbauten (Stein/Beton) und Rand um ihre Grenzen, in dem swissTLM3D-Brücken ausgeblendet werden [m] */
const KUNSTBAU_FARBE = '#cfc8bd'
const KUNSTBAU_RAND_M = 10
/** Flächen, die auf einer Brücke deren Fahrbahn folgen (Sichtfelder bleiben auf dem Gelände: gross, wenige Ecken) */
const BRUECKE_FLAECHEN: ReadonlySet<Flaeche3D['art']> = new Set(['streifen', 'ann', 'plan', 'parkfeld', 'hindernis', 'konflikt'])
/** über der Fahrbahn [m], gegen Flimmern; je Bodenebene (EBENE) ein wenig mehr, damit der Streifen über der Wartefläche liegt */
const AUF_BRUECKE_M = 0.05
/** Linien auf einer Brücke: Zwischenpunkte so dicht [m] */
const LINIE_SCHRITT_M = 1
/** Körper (Parkfelder, Hindernisse, Konflikte): Bodenpunkte entlang des Umrisses so dicht [m], damit sie dem Gefälle folgen */
const KOERPER_SCHRITT_M = 2
const GEBAEUDE_FEHLER_PX = 24

export interface Szene {
  zeigen(s: Szene3D): Promise<void>
  kamera(modus: KameraModus): Promise<KameraModus | null>
  gebaeude(an: boolean): Promise<void>
  baeume(an: boolean): Promise<void>
  /** Brücken an/aus; Kamera, Sichtlinien und Wände bekommen danach neue Höhen */
  bruecken(an: boolean): Promise<void>
  luftbild(an: boolean): void
  schatten(an: boolean): void
  /** Sichtprüfung (Sichtfelder, Warteflächen, Fahrlinien, Konflikte, Sichtlinien) im Fahrzeugblick zeigen; in der Übersicht immer sichtbar */
  pruefung(an: boolean): void
  kategorie(k: Kategorie, an: boolean): void
  groesse(): void
  zerstoeren(): void
}

/** Bietet der Browser WebGL? (Cesium 1.140+ braucht WebGL 2 für Billboards; Körper und Linien gehen auch mit WebGL 1) */
export function webglDa(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch { return false }
}

const abbruch = () => new DOMException('3D-Ansicht geschlossen', 'AbortError')
/** Datum im Kachelpfad (JJJJMMTT) eines Manifests, nur zur Anzeige als «Datum der Kachelpfade» */
const kachelDatum = (t: string): string | undefined => t.match(/(?:^|\/)(20\d{6})(?:\/|$)/)?.[1]

export async function szeneOeffnen(el: HTMLElement, credits: HTMLElement, melden: (s: Stand3D) => void, signal: AbortSignal,
  start: { gebaeude: boolean; baeume: boolean; bruecken?: boolean; fahrzeuge?: boolean; personen?: boolean; luftbild?: boolean; schatten?: boolean; pruefung?: boolean }): Promise<Szene> {
  const t0 = performance.now(), zeit = new Date().toISOString()
  let stand: Stand3D = { phase: 'laedt', text: '3D-Bibliothek wird geladen …', zeit, quellen: {
    gelaende: { aktiv: true, zustand: 'lädt' }, grundkarte: { aktiv: true, zustand: 'lädt' },
    luftbild: { aktiv: start.luftbild ?? false, zustand: start.luftbild ? 'lädt' : 'aus' },
    gebaeude: { aktiv: start.gebaeude, zustand: start.gebaeude ? 'lädt' : 'aus' },
    bruecken: { aktiv: start.bruecken ?? true, zustand: (start.bruecken ?? true) ? 'lädt' : 'aus' },
  } }
  const setzen = (s: Partial<Stand3D>) => { if (signal.aborted) return; stand = { ...stand, ...s }; melden(stand) }
  const quelleSetzen = (key: Dienst3D, neu: Partial<DienstStand3D>) => {
    const alt = stand.quellen?.[key] ?? { aktiv: false, zustand: 'aus' as const }
    const z = { ...alt, ...neu, ...(neu.zustand === 'geladen' ? { geladen: true, fehler: undefined } : {}) }
    if (neu.zustand === 'lädt' && !z.zeit) z.zeit = new Date().toISOString()
    if (JSON.stringify(z) !== JSON.stringify(alt)) setzen({ quellen: { ...stand.quellen, [key]: z } })
  }
  const quellFehler = (key: Dienst3D, e: unknown) => quelleSetzen(key, { zustand: 'Fehler', fehler: e instanceof Error ? e.message : String(e) })
  const pruefen = () => { if (signal.aborted) throw abbruch() }
  setzen({})
  // Cesium sucht seine Dateien unter dieser Adresse (buildModuleUrl prüft die globale Variable CESIUM_BASE_URL)
  const g = globalThis as { CESIUM_BASE_URL?: string }
  g.CESIUM_BASE_URL ??= import.meta.env.BASE_URL + CESIUM_PFAD
  const C: Cesium = await import('cesium')
  pruefen()
  // Modelle vorhanden? (nur Dateien der App; ohne Modell bleibt der einfache Körper)
  const modellDa = new Set<string>()
  await Promise.all(Object.values(MODELLE).flat().map(async m => {
    try { if ((await fetch(import.meta.env.BASE_URL + m.datei, { method: 'HEAD', signal })).ok) modellDa.add(m.datei) } catch { /* ohne Modell */ }
  }))
  pruefen()
  setzen({ text: 'Gelände wird geladen …' })
  quelleSetzen('gelaende', { zustand: 'lädt' })
  const terrainProvider = await C.CesiumTerrainProvider.fromUrl(TERRAIN_URL, { credit: new C.Credit('© swisstopo', true) })
    .catch(e => { quellFehler('gelaende', e); throw e })
  quelleSetzen('gelaende', { zustand: 'geladen' })
  pruefen()
  const w = new C.CesiumWidget(el, {
    baseLayer: false, terrainProvider, scene3DOnly: true, requestRenderMode: true, maximumRenderTimeChange: Infinity,
    skyBox: false, creditContainer: credits, creditViewport: el, showRenderLoopErrors: false, msaaSamples: 4,
    shadows: start.schatten ?? true, terrainShadows: C.ShadowMode.RECEIVE_ONLY,
    contextOptions: { webgl: { failIfMajorPerformanceCaveat: false } },
  })
  const listener: (() => void)[] = []
  let tot = false
  const zerstoeren = () => {
    if (tot) return
    tot = true
    for (const l of listener) l()
    w.destroy()   // zerstört auch die Bildebenen samt Boden
  }
  try {
    const scene = w.scene, globe = scene.globe
    // Grundkarte (immer) und darüber das Luftbild (zuschaltbar); fester Sonnenstand für Licht und Schatten
    const kachelEbene = (key: 'grundkarte' | 'luftbild', url: string, layer: string, tileMatrixSetID: string, maximumLevel: number) => {
      const provider = new C.WebMapTileServiceImageryProvider({
        url, layer, style: 'default', format: 'image/jpeg', tileMatrixSetID, tilingScheme: new C.GeographicTilingScheme(), maximumLevel,
        minimumLevel: BILD_MIN_STUFE, rectangle: C.Rectangle.fromDegrees(...BILD_RECHTECK), credit: new C.Credit('© swisstopo', true) })
      // Nur beobachten: die ursprüngliche Anfrage samt Rückgabewert und Fehlerverhalten bleibt erhalten.
      if (provider.requestImage) {
        const abruf = provider.requestImage.bind(provider)
        provider.requestImage = (...args) => {
          const antwort = abruf(...args)
          if (antwort) {
            quelleSetzen(key, { zustand: 'lädt' })
            void antwort.then(() => quelleSetzen(key, { zustand: 'geladen' }), e => quellFehler(key, e))
          }
          return antwort
        }
      }
      return w.imageryLayers.addImageryProvider(provider)
    }
    kachelEbene('grundkarte', KARTE_URL, 'ch.swisstopo.swisstlm3d-karte-grau.3d', '4326_18', KARTE_MAX_STUFE)
    const luftbildEbene = kachelEbene('luftbild', BILD_URL, 'ch.swisstopo.swissimage', '4326_19', BILD_MAX_STUFE)
    let luftbildAn = start.luftbild ?? false
    luftbildEbene.show = luftbildAn
    w.clock.currentTime = C.JulianDate.fromIso8601(SONNE_ZEIT)
    w.clock.shouldAnimate = false
    globe.enableLighting = true
    scene.shadowMap.size = 2048
    scene.shadowMap.darkness = 0.5   // Schatten etwas aufgehellt (Vorgabe 0,3), die Schattenseiten der Häuser waren fast schwarz
    w.creditDisplay.addStaticCredit(new C.Credit('© swisstopo', true))
    // Cesium zeigt sonst das Logo von Cesium ion; dessen Dienste nutzt die App nicht. Der Hinweis auf die Bibliothek bleibt als Text
    C.CreditDisplay.cesiumCredit = new C.Credit('CesiumJS', true)
    globe.depthTestAgainstTerrain = true
    globe.baseColor = C.Color.fromCssColorString(BODEN_FARBE)
    globe.showGroundAtmosphere = false
    scene.backgroundColor = C.Color.fromCssColorString(HIMMEL_FARBE)
    scene.postProcessStages.fxaa.enabled = true
    scene.screenSpaceCameraController.minimumZoomDistance = KAMERA_MIN_M
    const frustum = w.camera.frustum
    if (frustum instanceof C.PerspectiveFrustum) frustum.near = KAMERA_MIN_M
    const renderFehler = (_s: unknown, e: unknown) => setzen({ phase: 'fehler', text: `Darstellung abgebrochen: ${e instanceof Error ? e.message : String(e)}` })
    scene.renderError.addEventListener(renderFehler)
    listener.push(() => scene.renderError.removeEventListener(renderFehler))

    // Kachelstände (Datum der Kachelpfade) aus den Manifesten, die Cesium ohnehin lädt; ohne Wirkung auf die Szene
    void fetch(TERRAIN_URL + 'layer.json', { signal }).then(r => r.json()).then((j: { tiles?: string[] }) => {
      if (!signal.aborted) setzen({ stand: { ...stand.stand, gelaende: kachelDatum(j.tiles?.[0] ?? '') } })
    }).catch(() => undefined)
    const tilesetStand = (url: string, schluessel: TilesetSchluessel) =>
      fetch(url, { signal }).then(r => r.json()).then((j: { root?: { children?: { content?: { uri?: string } }[] } }) => {
        if (!signal.aborted) setzen({ stand: { ...stand.stand, [schluessel]: kachelDatum(j.root?.children?.[0]?.content?.uri ?? '') } })
      }).catch(() => undefined)

    // Ladezustand: offene Kacheln von Gelände und Tilesets; «bereit», sobald alles einmal vollständig da war
    let geladenMs: number | undefined, offenGlobe = 0
    const tilesets: Partial<Record<TilesetSchluessel, import('cesium').Cesium3DTileset>> = {}
    const offenTiles: Partial<Record<TilesetSchluessel, number>> = {}
    const melde = () => {
      if (tot || stand.phase === 'fehler') return
      const offen = offenGlobe + Object.values(offenTiles).reduce((a, b) => a + (b ?? 0), 0)
      const fertig = globe.tilesLoaded && Object.values(tilesets).every(t => !t || !t.show || t.tilesLoaded)
      if (fertig && geladenMs === undefined) geladenMs = Math.round(performance.now() - t0)
      const gpu = Object.values(tilesets).reduce((a, t) => a + (t && t.show ? t.totalMemoryUsageInBytes : 0), 0)
      setzen({ phase: fertig ? 'bereit' : 'laedt', text: fertig ? 'Bereit.' : `Lädt … (${offen} Kacheln offen)`, ms: geladenMs, offen,
        gpuBytes: gpu || undefined })
    }
    if (terrainProvider.errorEvent) {
      const fehler = (e: { message?: string }) => quellFehler('gelaende', e.message ?? 'Geländekachel nicht verfügbar')
      terrainProvider.errorEvent.addEventListener(fehler)
      listener.push(() => terrainProvider.errorEvent.removeEventListener(fehler))
    }
    const globeFortschritt = (n: number) => { offenGlobe = n; melde() }
    globe.tileLoadProgressEvent.addEventListener(globeFortschritt)
    listener.push(() => globe.tileLoadProgressEvent.removeEventListener(globeFortschritt))

    // Kunstbauten der Stadt Bern (kunstbauten.ts): echtes 3D-Netz der Brücken im Umkreis des Falls; die swissTLM3D-Brücke an derselben
    // Stelle wird ausgeblendet (Stil nach Lage ihres Mittelpunkts, Felder Longitude/Latitude der Kacheln in Radiant)
    let kunstbau: { schluessel: string; prim: import('cesium').Primitive | null; grenzen: [number, number, number, number][]; grundriss: Grundriss | null } | null = null
    const kunstFolge = anfragenFolge()
    let brueckenAn = start.bruecken ?? true
    const tlmStilSetzen = () => {
      const ts = tilesets.bruecken
      if (!ts) return
      const rad = (g: number) => (g * Math.PI) / 180
      const raus = (kunstbau?.grenzen ?? []).map(([w, s, o, n]) => {
        const [s1, w1] = wgs(w - KUNSTBAU_RAND_M, s - KUNSTBAU_RAND_M), [n1, o1] = wgs(o + KUNSTBAU_RAND_M, n + KUNSTBAU_RAND_M)
        return '(${Longitude} > ' + rad(w1) + ' && ${Longitude} < ' + rad(o1) + ' && ${Latitude} > ' + rad(s1) + ' && ${Latitude} < ' + rad(n1) + ')'
      })
      ts.style = raus.length ? new C.Cesium3DTileStyle({ show: `!(${raus.join(' || ')})` }) : undefined
      scene.requestRender()
    }
    const kunstbautenLaden = async (s: Szene3D) => {
      const nr = kunstFolge.beginnen()
      const ziel = s.kamera.uebersicht?.ziel ?? s.kamera.fahrzeug?.ziel
      const p = ziel ? lv95(ziel[0], ziel[1]) : null
      const leeren = () => {
        if (kunstbau?.prim) scene.primitives.remove(kunstbau.prim)
        kunstbau = null
        tlmStilSetzen()
        const quellen = { ...stand.quellen }; delete quellen.kunstbauten
        setzen({ kunstbauten: undefined, quellen })
      }
      if (!p || !inBern(p)) { leeren(); return }
      const schluessel = `${Math.round(p[0] / 50)}|${Math.round(p[1] / 50)}`
      if (kunstbau?.schluessel === schluessel) return
      leeren()
      quelleSetzen('kunstbauten', { aktiv: brueckenAn, zustand: 'lädt', geladen: false, zeit: new Date().toISOString() })
      let liste: Kunstbaute[]
      try {
        const r = await fetch(kunstbautenUrl(p), { signal })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        liste = await kunstbautenLesen(await r.json())
      } catch (e) {
        if (signal.aborted || tot || !kunstFolge.aktuell(nr)) return
        quellFehler('kunstbauten', e)
        setzen({ kunstbauten: 'fehlt', text: `Kunstbauten Stadt Bern nicht verfügbar (swissTLM3D bleibt): ${e instanceof Error ? e.message : String(e)}` })
        return
      }
      if (signal.aborted || tot || !kunstFolge.aktuell(nr)) return
      if (kunstbau?.prim) scene.primitives.remove(kunstbau.prim)
      let prim: import('cesium').Primitive | null = null
      const n = liste.reduce((a, k) => a + k.dreiecke.length / 3, 0)
      if (n) {
        const pos = new Float64Array(3 * n)
        let o = 0
        const c = new C.Cartesian3()
        for (const k of liste) for (let i = 0; i < k.dreiecke.length; i += 3) {
          const [lat, lon] = wgs(k.dreiecke[i], k.dreiecke[i + 1])
          C.Cartesian3.fromDegrees(lon, lat, k.dreiecke[i + 2] + LN02_ZU_SZENE_M, undefined, c)
          pos[o++] = c.x; pos[o++] = c.y; pos[o++] = c.z
        }
        const attr = new C.GeometryAttributes()
        attr.position = new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: pos })
        const geom = new C.Geometry({ attributes: attr, primitiveType: C.PrimitiveType.TRIANGLES,
          indices: Uint32Array.from({ length: n }, (_, i) => i), boundingSphere: C.BoundingSphere.fromVertices(pos) })
        C.GeometryPipeline.computeNormal(geom)
        prim = new C.Primitive({ geometryInstances: new C.GeometryInstance({ geometry: geom, id: 'kunstbauten',
          attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(KUNSTBAU_FARBE)) } }),
          appearance: new C.PerInstanceColorAppearance({ flat: false, faceForward: true, translucent: false, closed: false }),
          asynchronous: false, shadows: C.ShadowMode.ENABLED })
        prim.show = tilesets.bruecken?.show ?? brueckenAn
        scene.primitives.add(prim)
      }
      kunstbau = { schluessel, prim, grenzen: liste.map(grenzenLv95), grundriss: grundriss(liste) }
      tlmStilSetzen()
      quelleSetzen('kunstbauten', { zustand: 'geladen', aktiv: brueckenAn })
      setzen({ kunstbauten: liste.length })
      scene.requestRender()
    }

    const lader: Partial<Record<TilesetSchluessel, (an: boolean) => Promise<void>>> = {}
    const tilesetLaden = async (schluessel: TilesetSchluessel, url: string, an: boolean) => {
      if (tot || signal.aborted) return
      quelleSetzen(schluessel, { aktiv: an })
      if (schluessel === 'bruecken') {
        brueckenAn = an; if (kunstbau?.prim) kunstbau.prim.show = an
        if (stand.quellen?.kunstbauten) quelleSetzen('kunstbauten', { aktiv: an })
      }
      lader[schluessel] ??= ebenenLader(async () => {
        quelleSetzen(schluessel, { zustand: 'lädt' })
        const ts = await C.Cesium3DTileset.fromUrl(url, { maximumScreenSpaceError: GEBAEUDE_FEHLER_PX, showCreditsOnScreen: true })
        if (!tot && !signal.aborted) {
          scene.primitives.add(ts)
          tilesets[schluessel] = ts
          quelleSetzen(schluessel, { zustand: 'geladen' })
          if (schluessel === 'bruecken') tlmStilSetzen()
          const fortschritt = (pending: number, processing: number) => { offenTiles[schluessel] = pending + processing;
            quelleSetzen(schluessel, { zustand: pending + processing > 0 ? 'lädt' : 'geladen' }); melde() }
          ts.loadProgress.addEventListener(fortschritt)
          listener.push(() => { if (!ts.isDestroyed()) ts.loadProgress.removeEventListener(fortschritt) })
          void tilesetStand(url, schluessel)
        }
        return ts
      }, (ts, sichtbar) => {
        ts.show = sichtbar
        quelleSetzen(schluessel, { aktiv: sichtbar })
        setzen({ [schluessel]: sichtbar ? 'an' : 'aus' })
        melde(); scene.requestRender()
      }, ts => ts.destroy(), () => tot || signal.aborted)
      if (!an) setzen({ [schluessel]: 'aus' })
      try { await lader[schluessel]!(an) } catch (e) {
        if (signal.aborted || tot) return
        quellFehler(schluessel, e)
        setzen({ [schluessel]: 'fehlt', text: `${TILESET_NAME[schluessel]} nicht verfügbar: ${e instanceof Error ? e.message : String(e)}` })
      }
    }

    // Geometrie des Falls: Entities, bei jeder neuen Szene vollständig ersetzt
    let eigenes: import('cesium').Entity[] = [], eigenesAuto: import('cesium').Entity[] = []
    let baumKronen: import('cesium').Entity[] = [], baeumeAn = start.baeume
    // Boden (AV-Flächen) als Bildebene über Karte und Luftbild (avBild.ts): Kacheln werden bei Bedarf aus den Flächen gezeichnet.
    // Als GroundPrimitive (Schattenvolumen) fielen je nach Kamera ganze Flächen weg.
    let boden: { ebene: import('cesium').ImageryLayer; schluessel: string } | null = null
    const bodenSetzen = (flaechen: AvBildFlaeche[]) => {
      const schluessel = avSchluessel(flaechen)
      if (boden?.schluessel === schluessel) return
      if (boden) { w.imageryLayers.remove(boden.ebene, true); boden = null }
      const teile: AvBildTeil[] = flaechen.map(f => ({ f, g: grenzen(f.ringe) }))
      const ges = gesamtGrenzen(teile)
      if (!ges) return
      const schema = new C.GeographicTilingScheme()
      const quelle = {
        tileWidth: KACHEL_PX, tileHeight: KACHEL_PX, minimumLevel: 0, maximumLevel: AV_MAX_STUFE, tilingScheme: schema,
        rectangle: C.Rectangle.fromDegrees(ges.west, ges.sued, ges.ost, ges.nord), tileDiscardPolicy: undefined, errorEvent: new C.Event(),
        credit: new C.Credit('Amtliche Vermessung (geodienste.ch)', true), proxy: undefined, hasAlphaChannel: true,
        getTileCredits: () => undefined, pickFeatures: () => undefined,
        requestImage: (x: number, y: number, stufe: number) => {
          const r = schema.tileXYToRectangle(x, y, stufe)
          const leinwand = document.createElement('canvas')
          leinwand.width = leinwand.height = KACHEL_PX
          const ctx = leinwand.getContext('2d')
          if (ctx) kachelZeichnen(ctx, teile, { west: C.Math.toDegrees(r.west), sued: C.Math.toDegrees(r.south), ost: C.Math.toDegrees(r.east),
            nord: C.Math.toDegrees(r.north) })
          return Promise.resolve(leinwand)
        },
      }
      // eigene Quelle ohne Klasse: Cesium liest nur diese Felder (ImageryLayer); die Typen verlangen die ganze Klasse
      boden = { ebene: w.imageryLayers.addImageryProvider(quelle as unknown as import('cesium').ImageryProvider), schluessel }
    }
    const kategorieAn: Record<Kategorie, boolean> = { fahrzeuge: start.fahrzeuge ?? true, personen: start.personen ?? true }
    let koerperEntities: { e: import('cesium').Entity; k: Koerper3D }[] = []
    /** Geometrie der Sichtprüfung: in der Übersicht immer, aus dem Fahrzeug nur mit «Sichtprüfung» (ruhiger Blick auf Strasse und Streifen) */
    let pruefungEntities: import('cesium').Entity[] = []
    let pruefungAn = start.pruefung ?? false
    const PRUEFUNG_ARTEN = new Set(['sichtfeld', 'velofeld', 'konflikt', 'ann', 'annRand', 'spur'])
    const pruefungSichtbar = () => modusAktuell !== 'fahrzeug' || pruefungAn
    const sichtbar = (k: Koerper3D) => { const kat = KATEGORIE[k.art]; return (!kat || kategorieAn[kat]) && !(k.eigen && modusAktuell === 'fahrzeug') }
    let aktuell: Szene3D | null = null, modusAktuell: KameraModus = 'uebersicht'
    const farbe = (css: string, alpha = 1) => C.Color.fromCssColorString(css).withAlpha(alpha)
    const grad = (p: LL, h = 0) => C.Cartesian3.fromDegrees(p[1], p[0], h)
    const hierarchie = (ringe: LL[][]) => new C.PolygonHierarchy(ringe[0].map(p => grad(p)), ringe.slice(1).map(r => new C.PolygonHierarchy(r.map(p => grad(p)))))
    type Probe = { gelaende: number | null; deck: number[] }
    let fahrbahnen = new Map<string, FahrbahnProbe[]>()
    let hoehenHinweis = ''
    /** Ergebnis je Punkt validieren; keine Nullhöhe als Ersatz für fehlende Daten. */
    const kandidatenLaden = async (punkte: LL[], s: Szene3D): Promise<Probe[]> => {
      if (!punkte.length) return []
      const bau = kunstbau?.prim?.show ? kunstbau.grundriss : null
      const an = brueckenSichtbar()
      const ohne: object[] = [tilesets.gebaeude, ...eigenes].filter((x): x is NonNullable<typeof x> => !!x)
      const carto = punkte.map(p => C.Cartographic.fromDegrees(p[1], p[0]))
      try { await C.sampleTerrainMostDetailed(terrainProvider, carto, true) }
      catch { for (const c of carto) c.height = Number.NaN }
      if (tot || signal.aborted) throw abbruch()
      const aus = carto.map((c, i) => ({ gelaende: gueltigeHoehe(c.height) ? c.height : null,
        deck: kandidaten(bauHoehen(bau, lv95(...punkte[i])).map(h => h + LN02_ZU_SZENE_M)) }))
      const indizes = punkte.map((_, i) => i).filter(i => an && !bauHoehen(bau, lv95(...punkte[i])).length && aufBruecke(punkte[i], s.bruecken))
      if (scene.sampleHeightSupported && indizes.length) {
        try {
          const oben = await scene.sampleHeightMostDetailed(indizes.map(i => C.Cartographic.fromDegrees(punkte[i][1], punkte[i][0])), ohne)
          indizes.forEach((i, k) => { aus[i].deck = kandidaten([...aus[i].deck, oben[k]?.height]) })
        } catch { /* fehlende Brückenprobe nicht durch eine erfundene Höhe ersetzen */ }
      }
      return aus
    }
    const profilCache = new Map<string, Promise<BodenProfil | null>>()
    const profilCredits = new Set<string>()
    const profilFehler = new Map<string, string>()
    const fahrbahnenLaden = async (s: Szene3D) => {
      const eintraege = await Promise.all((s.wege ?? []).map(async weg => {
        const pts = verdichten(weg.punkte, LINIE_SCHRITT_M), ps = pts.map(p => lv95(...p))
        const profilPunkte = ps.length === 1 ? [ps[0], [ps[0][0] + 0.25, ps[0][1]] as [number, number]] : ps
        const key = JSON.stringify(profilPunkte)
        if (!profilCache.has(key)) profilCache.set(key, ladeBodenProfil(profilPunkte, signal).then(p => { profilFehler.delete(key); return p }).catch(e => {
          profilCache.delete(key)
          if (signal.aborted || (e instanceof Error && e.name === 'AbortError')) throw e
          profilFehler.set(key, e instanceof Error ? e.message : String(e))
          return null
        }))
        const [proben, profil] = await Promise.all([kandidatenLaden(pts, s), profilCache.get(key)!])
        const eingang = ps.map((p, i) => ({ p, boden: profil?.szeneHoehen[i] ?? null,
          kandidaten: kandidaten([profil?.szeneHoehen[i] ?? proben[i].gelaende, ...proben[i].deck]) }))
        const start = gueltigeHoehe(profil?.szeneHoehen[0]) ? profil.szeneHoehen[0]
          : eingang[0]?.kandidaten.length === 1 ? proben[0]?.gelaende : null
        return { id: weg.id, weg: fahrbahnVerfolgen(eingang, start), profil, fehler: profilFehler.get(key) }
      }))
      return { wege: new Map(eintraege.map(e => [e.id, e.weg])), profile: eintraege.map(e => e.profil), fehler: [...new Set(eintraege.flatMap(e => e.fehler ? [e.fehler] : []))] }
    }
    const anschlussLaden = async (s: Szene3D, wege: Map<string, FahrbahnProbe[]>): Promise<AnschlussFlaeche[]> => {
      if (!brueckenSichtbar()) return []
      const strassen = vereinigung(s.flaechen.filter(f => f.art === 'av' && f.avArt === 'Strasse_Weg').map(f => f.ringe.map(r => r.map(p => lv95(...p)))))
      const umrisse = s.bruecken.map(poly => poly.map(r => r.map(p => lv95(...p))))
      const bau = kunstbau?.prim?.show ? kunstbau.grundriss : null
      const nahe = (p: [number, number]) => naheUmriss(p, umrisse) || naheBau(bau, p, ANSCHLUSS_NAEHE_M)
      const ws = [...wege.values()], proben = anschlussProben(ws, strassen, nahe)
      if (!proben.length) return []
      const carto = proben.flatMap(p => p.punkte.map(p => { const [lat, lon] = wgs(...p); return C.Cartographic.fromDegrees(lon, lat) }))
      try { await C.sampleTerrainMostDetailed(terrainProvider, carto, true) } catch { return [] }
      if (tot || signal.aborted) throw abbruch()
      const getragen = carto.map(() => false)
      const punktListe = proben.flatMap(p => p.punkte)
      const indizes = punktListe.map((_, i) => i).filter(i => aufBruecke(wgs(...punktListe[i]), s.bruecken) &&
        !bauHoehen(bau, punktListe[i]).some(h => Math.abs(h + LN02_ZU_SZENE_M - proben[Math.floor(i / 3)].hoehen[i % 3]) <= 0.75))
      if (indizes.length && scene.sampleHeightSupported && tilesets.bruecken?.show) {
        try {
          const ohne: object[] = [tilesets.gebaeude, kunstbau?.prim, ...eigenes].filter((x): x is NonNullable<typeof x> => !!x)
          const oben = await scene.sampleHeightMostDetailed(indizes.map(i => C.Cartographic.clone(carto[i])), ohne)
          indizes.forEach((i, j) => { const h = oben[j]?.height
            getragen[i] = gueltigeHoehe(h) && h > carto[i].height + 0.3 && Math.abs(h - proben[Math.floor(i / 3)].hoehen[i % 3]) <= 0.75
          })
        } catch { return [] } // Keine Ergänzung über einem möglichen, nicht prüfbaren Deck.
      } else if (indizes.length && !scene.sampleHeightSupported) {
        indizes.forEach(i => { getragen[i] = true })
      }
      return anschlussFlaechen(proben, carto.map(c => gueltigeHoehe(c.height) ? c.height : null), strassen,
        tragendeFlaechen(bau, ws), ws, nahe, getragen)
    }
    const hoehenMitBruecken = async (punkte: LL[], bezuege: (string | undefined)[] = []): Promise<(Probe & { oben: number | null })[]> => {
      const s = aktuell
      if (!s) return punkte.map(() => ({ oben: null, gelaende: null, deck: [] }))
      const wege = fahrbahnen
      const proben = await kandidatenLaden(punkte, s)
      return proben.map((probe, i) => {
        const p = lv95(...punkte[i]), id = bezuege[i]
        const passende = id ? [wege.get(id)].filter((w): w is FahrbahnProbe[] => !!w) : [...wege.values()]
        const bezug = passende.map(w => {
          const bezug = wegBezug(p, w)
          const boden = wegBezug(p, w.map(x => ({ p: x.p, hoehe: x.boden === null || x.boden === undefined ? { h: null, grund: 'fehlt' as const } : { h: x.boden } })))
          return bezug ? { ...bezug, boden: boden?.hoehe.h ?? null } : null
        }).filter((x): x is NonNullable<typeof x> => !!x)
          .filter(x => x.abstand <= 8).sort((a, b) => a.abstand - b.abstand)
        if (!bezug.length) {
          if (probe.deck.length || id) return { ...probe, oben: null }
          return { ...probe, oben: probe.gelaende }
        }
        const nah = bezug.filter(x => x.abstand <= bezug[0].abstand + 0.5)
        const ergebnisse = nah.map(x => hoeheWaehlen(kandidaten([x.boden ?? probe.gelaende, ...probe.deck]), x.hoehe.h, x.abstand))
        const hs = ergebnisse.map(x => x.h).filter(gueltigeHoehe)
        if (hs.length !== ergebnisse.length || Math.max(...hs) - Math.min(...hs) > 0.75) {
          return { ...probe, oben: null }
        }
        return { ...probe, oben: hs[0] }
      })
    }
    const hoehen = async (punkte: LL[], bezuege?: (string | undefined)[]): Promise<number[]> => {
      const hs = (await hoehenMitBruecken(punkte, bezuege)).map(h => h.oben)
      if (!hs.every(gueltigeHoehe)) throw new Error('Fahrbahnhöhe fehlt oder ist mehrdeutig')
      return hs
    }
    function brueckenSichtbar(): boolean { return !!(tilesets.bruecken?.show || kunstbau?.prim?.show) }
    function aufBau(p: LL): boolean { return !!(kunstbau?.prim?.show && bauHoehen(kunstbau.grundriss, lv95(...p)).length) }
    const zeigenFolge = anfragenFolge()
    const zeigen = async (s: Szene3D) => {
      const nr = zeigenFolge.beginnen()
      aktuell = s
      // in Bern zuerst die Kunstbauten: ihr Netz trägt Fahrzeuge und Kamera auf einer Brücke (Abtastung unten)
      await kunstbautenLaden(s)
      if (signal.aborted || tot || aktuell !== s || !zeigenFolge.aktuell(nr)) return
      const daten = await fahrbahnenLaden(s)
      if (signal.aborted || tot || !zeigenFolge.aktuell(nr)) return
      const anschluesse = await anschlussLaden(s, daten.wege)
      if (signal.aborted || tot || !zeigenFolge.aktuell(nr)) return
      fahrbahnen = daten.wege
      const profile = daten.profile.filter((p): p is BodenProfil => p !== null)
      for (const p of profile) if (!profilCredits.has(p.dienst)) {
        profilCredits.add(p.dienst)
        w.creditDisplay.addStaticCredit(new C.Credit(p.dienst === 'bern.dtm' ? 'Fahrbahnhöhen: © Geodaten Stadt Bern, DTM 2023' : 'Fahrbahnhöhen: © swisstopo, swissALTI3D', true))
      }
      setzen({ hoehenprofile: profile.map(p => ({ dienst: p.dienst, versatzM: p.versatzM, rueckfall: p.rueckfall })), anschluss: anschluesse.length })
      // Höhen aller Punkte, die nicht aufgelegt werden können (Sichtlinien, Wände), und der Körper (Brückenzuschlag) in einem Abruf
      // Flächen und Linien, die einen Brückenumriss berühren, folgen der Fahrbahn (eigene Höhe je Punkt); alle übrigen liegen auf dem Gelände
      const an = brueckenSichtbar()
      const beruehrt = (pts: readonly LL[]) => (an && linieBeruehrtBruecke(pts, s.bruecken)) || verdichten(pts, LINIE_SCHRITT_M).some(aufBau)
      const flaechenBr = s.flaechen.filter(f => f.hoehe === undefined && BRUECKE_FLAECHEN.has(f.art) && (f.fahrbahn || beruehrt(f.ringe.flat())))
      const linienBr = s.linien.map(l => (l.fahrbahn || beruehrt(l.punkte) ? verdichten(l.punkte, LINIE_SCHRITT_M) : null))
      // Körper (Parkfelder, Hindernisse, Konflikte): Umriss verdichtet, Boden je Punkt; so folgen sie dem Gefälle und stehen auf Brücken.
      // Cesium-Körper mit CLAMP_TO_TERRAIN reichten von der tiefsten bis zur höchsten Geländehöhe unter der Fläche (am Nydeggstalden in Bern
      // wurde eine lange Längsparkierung so hoch wie das Gefälle)
      const koerperFl = s.flaechen.filter(f => f.art !== 'av' && f.hoehe !== undefined && f.ringe[0]?.length >= 3)
        .map(f => ({ f, ring: verdichten([...f.ringe[0], f.ringe[0][0]], KOERPER_SCHRITT_M) }))
      const punkte: LL[] = [...s.sichtlinien.flatMap(l => [l.auge, l.ziel]), ...s.waende.flatMap(wd => wd.punkte), ...s.koerper.map(k => k.mitte),
        ...flaechenBr.flatMap(f => f.ringe.flat()), ...linienBr.flatMap(x => x ?? []), ...koerperFl.flatMap(k => k.ring)]
      // Autos und Velos: Gelände vorne und hinten, für die Neigung entlang der Strasse
      const neigungAb = punkte.length, neigungJ = new Map<number, number>()
      s.koerper.forEach((k, j) => { if (k.art !== 'auto' && k.art !== 'velo') return
        neigungJ.set(j, neigungJ.size); punkte.push(versatz(k.mitte, k.peilung, k.masse[0] / 2), versatz(k.mitte, k.peilung, -k.masse[0] / 2)) })
      const bezuege = [...s.sichtlinien.flatMap(l => [l.fahrbahn, l.fahrbahn]), ...s.waende.flatMap(w => w.punkte.map(() => w.fahrbahn)),
        ...s.koerper.map(k => k.fahrbahn), ...flaechenBr.flatMap(f => f.ringe.flat().map(() => f.fahrbahn)),
        ...linienBr.flatMap((pts, i) => (pts ?? []).map(() => s.linien[i].fahrbahn)), ...koerperFl.flatMap(k => k.ring.map(() => k.f.fahrbahn))]
      s.koerper.forEach(k => { if (k.art === 'auto' || k.art === 'velo') bezuege.push(k.fahrbahn, k.fahrbahn) })
      const hs = await hoehenMitBruecken(punkte, bezuege)
      if (signal.aborted || tot || aktuell !== s || !zeigenFolge.aktuell(nr)) return
      // Mess-/Fahrbahnhöhen bleiben für Sichtlinien und Kamera erhalten. Die sichtbare Bodenfläche ist dagegen das
      // Cesium-Gelände, ausser auf dem zugeordneten Deck oder einem tatsächlich gezeichneten Anschlussstück.
      const darstellung = hs.map((h, j) => {
        const p = lv95(...punkte[j])
        const anschluss = gueltigeHoehe(h.oben) && anschluesse.some(a => h.oben! >= Math.min(...a.hoehen.flat()) - 0.75 &&
          h.oben! <= Math.max(...a.hoehen.flat()) + 0.75 && (enthaelt([a.ringe], p) || abstandPunkt([a.ringe], p) < 1e-6))
        const fest = gueltigeHoehe(h.oben) && (h.deck.some(d => Math.abs(d - h.oben!) <= 0.75) || anschluss)
        return { h: h.oben === null ? null : fest ? h.oben + (anschluss ? 0.02 : 0) : h.gelaende ?? h.oben,
          gelaende: !fest && gueltigeHoehe(h.gelaende) }
      })
      hoehenHinweis = [hs.some(h => h.oben === null) ? 'Fahrbahnhöhen fehlen oder sind mehrdeutig; betroffene Objekte und Sichtlinien werden ausgeblendet.' : '',
        daten.fehler.length ? `Bodenprofil nicht verfügbar (${daten.fehler.join('; ')}); Rückfall auf Geländekacheln der 3D-Ansicht.` : ''].filter(Boolean).join(' ')
      let i = 0
      const naechste = () => hs[i++]?.oben ?? null
      // Sichtlinien/Wände verwenden die zugeordnete Fahrbahn, Bodenmarkierungen die sichtbare Standfläche.
      const koerperAb = s.sichtlinien.length * 2 + s.waende.reduce((a, wd) => a + wd.punkte.length, 0)
      let c = koerperAb + s.koerper.length
      const anzeige = () => darstellung[c++]
      const flHoehen = new Map(flaechenBr.map(f => [f, f.ringe.map(rg => rg.map(anzeige))] as const))
      const liHoehen = linienBr.map(pts => (pts ? pts.map(anzeige) : null))
      const kfHoehen = new Map(koerperFl.map(k => [k.f, { ring: k.ring,
        boden: k.ring.map(() => k.f.pruefhuelle ? darstellung[c++].h : hs[c++]?.oben ?? null) }] as const))
      mitEreignispause(w.entities, () => {
        for (const e of eigenes) w.entities.remove(e)
        eigenes = []; eigenesAuto = []; koerperEntities = []; pruefungEntities = []; baumKronen = []
        const add = (e: Parameters<typeof w.entities.add>[0], pruefung = false) => { const x = w.entities.add(e); eigenes.push(x); if (pruefung) { pruefungEntities.push(x); x.show = pruefungSichtbar() } return x }
        // Boden: über der Karte deckend (mit dem Grundton gemischt), über dem Luftbild nur als Tönung; neu nur, wenn sich Flächen oder Farben ändern
        bodenSetzen(s.flaechen.filter(f => f.art === 'av').map(f => ({ ringe: f.ringe,
          fuellung: avFuellung(f.farbe, f.alpha, BODEN_FARBE, luftbildAn, AV_UEBER_LUFTBILD), rand: !luftbildAn })))
        for (const a of anschluesse) {
          const ring = (k: number) => a.ringe[k].map((p, i) => grad(wgs(...p), a.hoehen[k][i] + 0.02))
          add({ name: ANSCHLUSS_TEXT, polygon: { hierarchy: new C.PolygonHierarchy(ring(0), a.ringe.slice(1).map((_, i) => new C.PolygonHierarchy(ring(i + 1)))),
            perPositionHeight: true, material: farbe(s.flaechen.find(f => f.avArt === 'Strasse_Weg')?.farbe ?? '#777777') } })
        }
        for (const f of s.flaechen) {
          if (f.art === 'av') continue
          const pruef = PRUEFUNG_ARTEN.has(f.art)
          const kf = kfHoehen.get(f)
          if (kf && !kf.boden.every(gueltigeHoehe)) continue
          if (kf && f.hoehe !== undefined && kf.boden.every(gueltigeHoehe)) {
            // Körper: Seitenwände vom Boden je Punkt bis hoehe darüber, Dach schräg darauf (folgt Gefälle und Brücke)
            const hoehe = f.hoehe, oberkante = kf.ring.map((p, m) => grad(p, kf.boden[m]! + hoehe))
            add({ name: f.text, wall: { positions: oberkante, minimumHeights: kf.boden, maximumHeights: kf.boden.map(b => b + hoehe),
              material: farbe(f.farbe, f.alpha), outline: true, outlineColor: C.Color.BLACK.withAlpha(0.6) } }, pruef)
            add({ name: f.text, polygon: { hierarchy: new C.PolygonHierarchy(oberkante.slice(0, -1)), perPositionHeight: true,
              material: farbe(f.farbe, f.alpha) } }, pruef)
            continue
          }
          const hb = flHoehen.get(f)
          if (hb && !hb.every(r => r.every(x => gueltigeHoehe(x.h)))) continue
          if (hb && hb.some(r => r.some(x => !x.gelaende))) {
            // auf der Brücke: flach mit Höhe je Ecke über der Fahrbahn; Höhen selbst bestimmt
            const dz = AUF_BRUECKE_M + 0.005 * EBENE[f.art]
            const ring = (k: number) => f.ringe[k].map((p, m) => grad(p, hb[k][m].h! + dz))
            add({ name: f.text, polygon: { hierarchy: new C.PolygonHierarchy(ring(0), f.ringe.slice(1).map((_, k) => new C.PolygonHierarchy(ring(k + 1)))),
              perPositionHeight: true, material: farbe(f.farbe, f.alpha) } }, pruef)
            continue
          }
          add({ name: f.text, polygon: { hierarchy: hierarchie(f.ringe), material: farbe(f.farbe, f.alpha),
            classificationType: C.ClassificationType.TERRAIN, zIndex: EBENE[f.art] } }, pruef)
        }
        // Linien auf dem Gelände (auf 3D-Kacheln würden sie auch an Fassaden gemalt); berührt eine Linie eine Brücke, folgt sie mit
        // Zwischenpunkten den selbst bestimmten Höhen (Fahrbahn bzw. Gelände)
        s.linien.forEach((l, li) => {
          const material = l.gestrichelt ? new C.PolylineDashMaterialProperty({ color: farbe(l.farbe), dashLength: 12 }) : farbe(l.farbe)
          const pts = linienBr[li], hl = liHoehen[li]
          if (hl && !hl.every(x => gueltigeHoehe(x.h))) return
          if (pts && hl && hl.some(x => !x.gelaende)) add({ name: l.text, polyline: { positions: pts.map((p, k) => grad(p, hl[k].h! + AUF_BRUECKE_M + 0.005 * EBENE[l.art])),
            width: l.breite, arcType: C.ArcType.NONE, material } }, PRUEFUNG_ARTEN.has(l.art))
          else add({ name: l.text, polyline: { positions: l.punkte.map(p => grad(p)), width: l.breite, clampToGround: true,
            classificationType: C.ClassificationType.TERRAIN, zIndex: EBENE[l.art], material } }, PRUEFUNG_ARTEN.has(l.art))
        })
        // Sichtlinien: ist ein Profil gewählt, dieses kräftig mit Auge und Ziel als Punkte, die übrigen blass
        const profilGewaehlt = s.sichtlinien.some(x => x.gewaehlt)
        for (const sl of s.sichtlinien) {
          const a = naechste(), z = naechste()
          if (!gueltigeHoehe(a) || !gueltigeHoehe(z)) continue
          const hA = a + sl.augHoehe, hZ = z + sl.zielHoehe
          const blass = profilGewaehlt && !sl.gewaehlt
          add({ name: sl.text, polyline: { positions: [grad(sl.auge, hA), grad(sl.ziel, hZ)], arcType: C.ArcType.NONE, width: sl.gewaehlt ? 6 : 3,
            material: new C.PolylineOutlineMaterialProperty({ color: farbe(sl.farbe, blass ? 0.35 : 1), outlineColor: C.Color.BLACK.withAlpha(blass ? 0.2 : 0.6), outlineWidth: 1 }),
            depthFailMaterial: farbe(sl.farbe, blass ? 0.08 : 0.15) } }, true)
          if (sl.gewaehlt) for (const [p, h, name] of [[sl.auge, hA, 'Auge'], [sl.ziel, hZ, 'Ziel']] as const)
            add({ name: `${name}: ${sl.text}`, position: grad(p, h), ellipsoid: { radii: new C.Cartesian3(0.2, 0.2, 0.2), material: farbe(sl.farbe),
              outline: true, outlineColor: C.Color.BLACK } }, true)
        }
        for (const wd of s.waende) {
          const unten = wd.punkte.map(() => naechste())
          if (!unten.every(gueltigeHoehe)) continue
          add({ name: wd.text, wall: { positions: wd.punkte.map((p, k) => grad(p, unten[k] + wd.hoehe)), minimumHeights: unten,
            maximumHeights: unten.map(h => h + wd.hoehe), material: farbe(wd.farbe, 0.8), outline: true, outlineColor: C.Color.BLACK.withAlpha(0.6) } })
        }
        const zaehler: Partial<Record<Koerper3D['art'], number>> = {}
        // Fahrzeuge behalten die bestimmte Fahrbahnhöhe. Personen stehen auf der sichtbaren Fläche: am Boden auf der feinsten
        // Geländeprobe, sonst auf dem zugeordneten Deck/Anschluss. Feste Höhen vermeiden fehlerhafte Andockhöhen beim Kachelwechsel.
        // Ohne gültige Fahrbahnhöhe wird der Körper ausgelassen.
        for (const [j, k] of s.koerper.entries()) {
          const hk = hs[koerperAb + j]?.oben
          if (!gueltigeHoehe(hk)) continue
          const ni = neigungJ.get(j)
          const hv = ni === undefined ? undefined : hs[neigungAb + 2 * ni]?.oben, hh = ni === undefined ? undefined : hs[neigungAb + 2 * ni + 1]?.oben
          const neigung = gueltigeHoehe(hv) && gueltigeHoehe(hh) ? Math.atan2(hv - hh, k.masse[0]) : 0
          const stand = darstellung[koerperAb + j]
          const standHoehe = k.art === 'person' || k.art === 'baum' ? stand.h! : hk
          /** Box und Zylinder sitzen ohne Höhenbezug mit der Mitte auf der Position */
          const mittig = grad(k.mitte, standHoehe + k.masse[2] / 2)
          const basis = { name: k.text, show: sichtbar(k) }
          const varianten = (MODELLE[k.art] ?? []).filter(v => modellDa.has(v.datei))
          const m = varianten.length ? varianten[(zaehler[k.art] = (zaehler[k.art] ?? 0) + 1) % varianten.length] : undefined
          const skala = m ? k.art === 'person' ? k.masse[2] / m.hoeheModell : k.masse[0] / m.laengeModell : 1
          const pos = grad(k.mitte, standHoehe - (m?.unterkanteModell ?? 0) * skala)
          const drehung = (bei: import('cesium').Cartesian3, grad: number, kipp = 0) =>
            C.Transforms.headingPitchRollQuaternion(bei, new C.HeadingPitchRoll(koerperHeading(k.peilung + grad), C.Math.toRadians(kipp) + neigung, 0))
          const vorher = eigenes.length
          if (m) add({ ...basis, position: pos, orientation: drehung(pos, m.drehungGrad, m.kippGrad),
            model: { uri: import.meta.env.BASE_URL + m.datei, scale: skala, heightReference: C.HeightReference.NONE,
              ...(k.art === 'person' ? {} : { color: farbe(k.farbe), colorBlendMode: C.ColorBlendMode.MIX, colorBlendAmount: MODELL_FARBANTEIL }) } })
          else if (k.art === 'auto' || k.art === 'velo') add({ ...basis, position: mittig, orientation: drehung(mittig, 0),
            box: { dimensions: new C.Cartesian3(k.masse[0], k.masse[1], k.masse[2]),
              material: farbe(k.farbe, 0.95), outline: true, outlineColor: C.Color.BLACK.withAlpha(0.7) } })
          else add({ ...basis, position: mittig, cylinder: { length: k.masse[2], topRadius: k.masse[0] / 2, bottomRadius: k.masse[1] / 2,
            heightReference: C.HeightReference.NONE, material: farbe(k.farbe, 0.95), outline: k.art === 'person', outlineColor: C.Color.BLACK.withAlpha(0.7) } })
          if (eigenes.length > vorher) { koerperEntities.push({ e: eigenes[eigenes.length - 1], k }); if (k.eigen) eigenesAuto.push(eigenes[eigenes.length - 1]) }
          // Genau eine generische Krone am selben Punkt wie der erfasste Stamm, auch bei Bäumen von Hand.
          // Keine unabhängige Vegetationsebene und kein räumliches Raten zwischen zwei Baum-Datensätzen.
          if (k.art === 'baum') baumKronen.push(add({ name: `${k.text}; Krone: Form und Masse angenommen`, show: baeumeAn,
            position: grad(k.mitte, standHoehe + BAUM_KRONE_MITTE_M), ellipsoid: {
              radii: new C.Cartesian3(...BAUM_KRONE_MASSE.map(m => m / 2) as [number, number, number]),
              stackPartitions: 6, slicePartitions: 10, material: farbe('#4d7c0f'), shadows: C.ShadowMode.ENABLED } }))
        }
      })
      setzen({ phase: 'laedt', hinweis: hoehenHinweis || undefined })
      melde()
      scene.requestRender()
    }
    /** Sichtbarkeit der Körper: Kategorie an/aus, das Fahrzeug der gewählten Zufahrt nur ausserhalb der Fahrzeugkamera (die Kamera sitzt darin) */
    const eigenesZeigen = () => {
      for (const { e, k } of koerperEntities) e.show = sichtbar(k)
      for (const e of pruefungEntities) e.show = pruefungSichtbar()
    }
    // Nur die jüngste Kameraanforderung der weiterhin aktuellen Szene darf den Standpunkt setzen.
    let kameraNr = 0
    const kamera = async (modus: KameraModus, grund = '') => {
      const nr = ++kameraNr
      const s = aktuell
      if (!s || tot || signal.aborted) return null
      modusAktuell = modus === 'frei' || s.kamera.fahrzeug ? modus : 'uebersicht'
      eigenesZeigen()
      if (modusAktuell === 'frei') {
        // Kamera bleibt, wo sie ist, und wird nur vom Streifen gelöst (lookAt): dann verschiebt die Standardsteuerung von Cesium über die Karte
        w.camera.lookAtTransform(C.Matrix4.IDENTITY)
      } else if (modusAktuell === 'fahrzeug' && s.kamera.fahrzeug) {
        const f = s.kamera.fahrzeug
        let hA = 0, hZ = 0
        try { [hA, hZ] = await hoehen([f.auge, f.ziel], [f.zufahrt, f.zufahrt]) } catch {
          // ohne Geländehöhe stünde die Kamera auf dem Ellipsoid (0 m): Blick aus dem Fahrzeug sperren, Grund nennen, Übersicht zeigen
          if (signal.aborted || tot || nr !== kameraNr || aktuell !== s) return null
          modusAktuell = 'uebersicht'; eigenesZeigen()
          return kamera('uebersicht', 'Fahrbahnhöhe am Augpunkt fehlt oder ist unklar; Übersicht gezeigt.')
        }
        if (signal.aborted || tot || nr !== kameraNr || aktuell !== s) return null
        const { heading, pitch } = kameraHeadingPitch((hZ + f.zielHoehe) - (hA + f.augHoehe), f.abstandM, f.peilung)
        w.camera.lookAtTransform(C.Matrix4.IDENTITY)
        w.camera.setView({ destination: grad(f.auge, hA + f.augHoehe), orientation: { heading, pitch, roll: 0 } })
      } else if (s.kamera.uebersicht) {
        const u = s.kamera.uebersicht
        let hZ: number
        try { [hZ] = await hoehen([u.ziel]) } catch {
          if (signal.aborted || tot || nr !== kameraNr || aktuell !== s) return null
          // Sichere Übersicht weit über dem Ziel, ohne eine Bodenhöhe zu erfinden.
          w.camera.lookAtTransform(C.Matrix4.IDENTITY)
          w.camera.setView({ destination: grad(u.ziel, 10000), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } })
          setzen({ hinweis: 'Fahrbahnhöhe nicht verfügbar; entfernte Übersicht gezeigt.' })
          scene.requestRender()
          return modusAktuell
        }
        if (signal.aborted || tot || nr !== kameraNr || aktuell !== s) return null
        const { heading, pitch, range } = uebersichtKamera(u)
        w.camera.lookAtTransform(C.Matrix4.IDENTITY)
        w.camera.lookAt(grad(u.ziel, hZ), new C.HeadingPitchRange(heading, pitch, range))
      }
      setzen({ hinweis: [hoehenHinweis, grund].filter(Boolean).join(' ') || undefined })
      scene.requestRender()
      return modusAktuell
    }

    setzen({ luftbild: luftbildAn })
    await tilesetLaden('bruecken', BRUECKEN_URL, start.bruecken ?? true)
    await tilesetLaden('gebaeude', GEBAEUDE_URL, start.gebaeude)
    setzen({ baeume: baeumeAn ? 'an' : 'aus' })
    pruefen()
    melde()
    scene.requestRender()
    return {
      zeigen,
      kamera,
      gebaeude: an => tilesetLaden('gebaeude', GEBAEUDE_URL, an),
      baeume: async an => { baeumeAn = an; for (const e of baumKronen) e.show = an; setzen({ baeume: an ? 'an' : 'aus' }); scene.requestRender() },
      bruecken: an => tilesetLaden('bruecken', BRUECKEN_URL, an),
      kategorie: (kat, an) => { kategorieAn[kat] = an; eigenesZeigen(); scene.requestRender() },
      luftbild: an => { luftbildAn = an; luftbildEbene.show = an; quelleSetzen('luftbild', { aktiv: an, ...(an ? { zustand: stand.quellen?.luftbild?.geladen ? 'geladen' as const : 'lädt' as const } : {}) }); setzen({ luftbild: an }); if (aktuell) bodenSetzen(aktuell.flaechen.filter(f => f.art === 'av').map(f => ({ ringe: f.ringe, fuellung: avFuellung(f.farbe, f.alpha, BODEN_FARBE, an, AV_UEBER_LUFTBILD), rand: !an }))); scene.requestRender() },
      pruefung: an => { pruefungAn = an; eigenesZeigen(); scene.requestRender() },
      schatten: an => { scene.shadowMap.enabled = an; scene.requestRender() },
      groesse: () => { if (!tot) { w.resize(); scene.requestRender() } },
      zerstoeren,
    }
  } catch (e) {
    zerstoeren()
    throw e
  }
}
