// Tests 3D-Ansicht, Datenmodell (modell.ts): Abbildung eines gerechneten Falls (künstliche Strassen wie fahrzeuge.test.ts) auf die Szene,
// Hindernisse, Kamera und gemerkter Modus. Keine Cesium-Abhängigkeit.
import { describe, expect, it } from 'vitest'
import { wgs, dist, type P } from '../geo'
import { osmParsen } from '../daten/osm'
import { avParsen, type GeoJson } from '../daten/av'
import { rechneFall } from '../rechner'
import { leererFall, type Fall } from '../fall'
import type { Hindernis } from '../rechner/hindernisse'
import { ring as ring3d } from './modell'
import { FARBE_HERAN, FARBE_HERAN_BLASS } from '../fahrzeuge'
import { peilung } from '../streetview'
import { AUGHOEHE, AUTO_MASSE, BAUM_HOEHE_M, EBENE, BAUM_STAMM_MIN_M, KONFLIKT_HOEHE, NICHT_SICHTBEHINDERND_M, PARK_HOEHE_M, PERSON_FARBE, PERSON_MASSE,
  SCHLUESSEL_MODUS, SICHTBEHINDERND_M, SICHT_NICHT_GEPRUEFT, STREIFEN_FARBE, UEBERSICHT_DISTANZ_M, UEBERSICHT_NEIGUNG_GRAD, ZIELHOEHE_WARTE_M,
  ZIELHOEHE_MARKIERUNG_M, PARK_ZWEIRAD_HOEHE_M, PARKRAND_FARBE, BALKEN_M, balken, hintereEcken,
  aufBruecke, verdichten, versatz, kameraHeadingPitch, kameraModusVorgabe, koerperHeading, ll, modusLesen, modusSpeichern, ring, szene3d, uebersichtKamera, type Farben3D } from './modell'

const O: P = [2600000, 1200000]
const llx = (x: number, y: number) => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const weg = (id: number, pts: [number, number, number][], tags: Record<string, string>) =>
  ({ type: 'way', id, tags, nodes: pts.map(p => p[0]), geometry: pts.map(p => { const [lat, lon] = llx(p[1], p[2]); return { lat, lon } }) })
const OSM_ROH = { elements: [
  weg(1, [[10, -300, 0], [11, -40, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }),
  weg(2, [[11, -40, 0], [20, -40, -200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' })] }
const flaeche = (art: string, ring: P[]) => ({ properties: { Art: art, Kanton: 'BE', Qualitaet: 'AV93', BFSNr: null },
  geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } })
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const AV: GeoJson = { features: [
  flaeche('Strasse_Weg', [lv(-300, -4), lv(-43, -4), lv(-43, -200), lv(-37, -200), lv(-37, -4), lv(300, -4), lv(300, 4), lv(-300, 4)]),
  flaeche('Trottoir', rechteck(-300, 4, 300, 7)), flaeche('Trottoir', rechteck(-300, -7, -43, -4)), flaeche('Trottoir', rechteck(-37, -7, 300, -4))] }
const FARBEN: Farben3D = { status: { frei: '#0f0', verdeckt: '#f00', verdeckt_gelaende: '#f00', verdeckt_hindernis: '#fa0' },
  hindernis: h => (h.quelle === 'kataster' ? '#00f' : '#0ea5e9'), plan: { trottoir: { flaeche: '#aaa', linie: '#555' },
    fahrbahn: { flaeche: '#bbb', linie: '#666' }, insel: { flaeche: '#ccc', linie: '#777' } }, insel: '#65a30d' }
function fallMit(hindernisse: Hindernis[] = []): Fall {
  const [lat, lon] = llx(100, 0), x = leererFall(lat, lon, null)
  x.streifenHand.push({ id: 'hand-1', p0: lv(100, -6), p1: lv(100, 6), breite: 4, herkunft: 'gezeichnet' })
  x.hindernisse.push(...hindernisse)
  return x
}
const rechnen = (f: Fall) => rechneFall(osmParsen(OSM_ROH), avParsen(AV), [], null, f, null, null, null, null)
const PARKFELD: Hindernis = { id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(90, 4, 95, 6), quelle: 'hand' }
const key = (r: ReturnType<typeof rechnen>, i: number) => `${r.streifen[0].zufahrten[i].fgsId}|${r.streifen[0].zufahrten[i].zufahrt}`

describe('Abbildung eines Falls (Fussgängerstreifen über die Hauptstrasse, zwei gerade Zufahrten)', () => {
  const r = rechnen(fallMit([PARKFELD]))
  const s = r.streifen[0]
  const ohne = szene3d(r, null, [PARKFELD], [], null, FARBEN)
  const mit = szene3d(r, key(r, 0), [PARKFELD], [], null, FARBEN)
  it('ordnet Fahrzeuge und Sichtlinien ihrer Zufahrt, Personen dem ganzen Streifen zu', () => {
    for (const k of mit.koerper.filter(k => k.art === 'auto')) {
      expect(k.fahrbahn).toBeTruthy()
      expect(mit.wege!.find(w => w.id === k.fahrbahn)?.punkte.length).toBeGreaterThan(1)
    }
    expect(mit.sichtlinien.every(l => l.fahrbahn === key(r, 0))).toBe(true)
    for (const person of mit.koerper.filter(k => k.art === 'person')) {
      const quer = mit.wege!.find(w => w.id === person.fahrbahn)!
      expect(quer.punkte[0]).toEqual(ll(s.m))
      expect(quer.punkte).toContainEqual(ll(s.p0)); expect(quer.punkte).toContainEqual(ll(s.p1))
    }
  })
  it('alle Koordinaten in WGS84; ring entfernt den doppelten Schlusspunkt', () => {
    const punkte = [...ohne.flaechen.flatMap(f => f.ringe.flat()), ...ohne.linien.flatMap(l => l.punkte), ...ohne.koerper.map(k => k.mitte)]
    expect(punkte.length).toBeGreaterThan(10)
    for (const [lat, lon] of punkte) { expect(lat).toBeGreaterThan(45); expect(lat).toBeLessThan(48); expect(lon).toBeGreaterThan(5); expect(lon).toBeLessThan(11) }
    expect(ll(O)).toEqual(wgs(O[0], O[1]))
    expect(ring([lv(0, 0), lv(1, 0), lv(1, 1), lv(0, 0)])).toHaveLength(3)
    expect(ring([lv(0, 0), lv(1, 0), lv(1, 1)])).toHaveLength(3)
  })
  it('Streifen als gelbe Balken auf dem Gelände, Warteflächen als Fläche und Rand, Fahrlinien weiss gestrichelt', () => {
    const streifen = ohne.flaechen.filter(f => f.art === 'streifen')
    expect(streifen.length).toBe(balken(s).length)
    expect(streifen.length).toBeGreaterThanOrEqual(Math.floor(dist(s.p0, s.p1) / (2 * BALKEN_M)))
    expect([streifen[0].farbe, streifen[0].alpha, streifen[0].hoehe, streifen[0].ringe[0].length]).toEqual([STREIFEN_FARBE, 0.9, undefined, 4])
    // Balken: 0,50 m breit quer zur Achse, Länge = Streifenbreite, Abstand 0,50 m
    const b = balken({ p0: lv(0, 0), p1: lv(6.5, 0), bw: 4 })
    expect(b).toHaveLength(7)
    expect(b[0].map(p => [+(p[0] - O[0]).toFixed(3), +(p[1] - O[1]).toFixed(3)])).toEqual([[0, 2], [0.5, 2], [0.5, -2], [0, -2]])
    expect(b[1][0][0] - O[0]).toBeCloseTo(1, 9)
    expect(ohne.flaechen.filter(f => f.art === 'ann')).toHaveLength(2)
    expect(ohne.linien.filter(l => l.art === 'annRand').every(l => l.gestrichelt && l.punkte[0][0] === l.punkte[l.punkte.length - 1][0])).toBe(true)
    expect(ohne.linien.filter(l => l.art === 'spur')).toHaveLength(s.zufahrten.filter(z => z.spur.length >= 2).length)
    expect(ohne.leer).toBe(false)
  })
  it('Sichtfeld in der Statusfarbe: gewählte Zufahrt kräftig, übrige blass; Velo-Sichtfeld, Konflikte und Sichtlinien nur mit Auswahl', () => {
    const felder = ohne.flaechen.filter(f => f.art === 'sichtfeld')
    expect(felder.length).toBeGreaterThanOrEqual(2)
    const farben = new Set(s.zufahrten.map(z => FARBEN.status[z.status]))
    expect(felder.every(f => f.alpha === 0.12 && farben.has(f.farbe))).toBe(true)
    const gewaehlt = mit.flaechen.filter(f => f.art === 'sichtfeld' && f.alpha === 0.3)
    expect(gewaehlt.length).toBeGreaterThanOrEqual(1)
    // Sichtfeldwahl der 2D-Karte: ausgeblendete Felder fehlen auch in 3D
    const nurVelo = szene3d(r, key(r, 0), [], [], null, FARBEN, [], { feldZeigen: art => art === 'velo' })
    expect(nurVelo.flaechen.filter(f => f.art === 'sichtfeld')).toEqual([])
    expect(ohne.sichtlinien).toEqual([])
    expect(ohne.flaechen.filter(f => f.art === 'konflikt')).toEqual([])
    expect(mit.sichtlinien.length).toBeGreaterThanOrEqual(1)
  })
  it('Sichtlinien ohne Geländeprüfung: vom Auge zu beiden Bordkanten, nicht geprüft; Augenhöhe wie die Rechnung', () => {
    const z = s.zufahrten[0], auge = z.sichtpunkte[z.sichtpunkte.length - 1]
    expect(mit.sichtlinien).toHaveLength(2)
    for (const l of mit.sichtlinien) {
      expect(l.auge).toEqual(ll(auge)); expect([l.augHoehe, l.zielHoehe, l.frei, l.farbe]).toEqual([AUGHOEHE, ZIELHOEHE_WARTE_M, null, SICHT_NICHT_GEPRUEFT])
    }
    expect(mit.sichtlinien.map(l => l.ziel)).toEqual(s.rand.map(ll))
  })
  it('Sichtlinien aus der Geländeprüfung: Farbe nach Befund, Brücke übernommen; Konflikte als Körper nach Klasse', () => {
    const z = s.zufahrten[0]
    const zg = { ...z, sichtGelaende: { stand: 'mit' as const, abM: 10, bisM: 30, linien: [
      { x: 0, auge: lv(80, 0), ziel: lv(100, -6), frei: true }, { x: 10, auge: lv(90, 0), ziel: lv(100, -6), frei: false },
      { x: 20, auge: lv(95, 0), ziel: lv(100, -6), frei: null, bruecke: true as const }] },
      konflikte: [{ klasse: 'baum' as const, flaeche: 1, abstand: 5, geom: [[rechteck(90, 3, 91, 4)]], layer: 'x' },
        { klasse: 'gebaeude' as const, flaeche: 1, abstand: 5, geom: [[rechteck(90, 8, 91, 9)]], layer: 'x' }] }
    const r2 = { ...r, streifen: [{ ...s, zufahrten: [zg, ...s.zufahrten.slice(1)] }] }
    const sz = szene3d(r2, key(r, 0), [], [], null, FARBEN)
    expect(sz.sichtlinien.map(l => [l.frei, l.farbe, l.bruecke ?? false])).toEqual([[true, '#0f0', false], [false, '#f00', false], [null, SICHT_NICHT_GEPRUEFT, true]])
    expect(sz.sichtlinien.every(l => l.zielHoehe === ZIELHOEHE_WARTE_M && l.augHoehe === AUGHOEHE)).toBe(true)   // Ziel 0,60 m wie die Geländeprüfung
    expect(sz.sichtlinien.map(l => l.profil)).toEqual([`gel:${s.fgsId}:${z.zufahrt}:warte:0`, `gel:${s.fgsId}:${z.zufahrt}:warte:10`, `gel:${s.fgsId}:${z.zufahrt}:warte:20`])
    expect(sz.sichtlinien.some(l => l.gewaehlt)).toBe(false)
    // gewähltes Profil: Linie markiert, Kamera am Auge dieses Profils
    const mitProfil = szene3d(r2, key(r, 0), [], [], null, FARBEN, [], { profil: `gel:${s.fgsId}:${z.zufahrt}:warte:10` })
    expect(mitProfil.sichtlinien.map(l => l.gewaehlt ?? false)).toEqual([false, true, false])
    expect(mitProfil.kamera.fahrzeug?.auge).toEqual(ll(lv(90, 0))); expect(mitProfil.kamera.fahrzeug?.profil).toBe(`gel:${s.fgsId}:${z.zufahrt}:warte:10`)
    // Profil der Bodenmarkierung: nur die gewählte Erkennungslinie dazu, Ziel am Boden
    const zg2 = { ...zg, erkennungLinien: [{ x: 30, auge: lv(70, 0), ziel: lv(98, 0), befund: 'bewuchs' as const, gelaende: true }] }
    const r3 = { ...r, streifen: [{ ...s, zufahrten: [zg2, ...s.zufahrten.slice(1)] }] }
    const mitMark = szene3d(r3, key(r, 0), [], [], null, FARBEN, [], { profil: `gel:${s.fgsId}:${z.zufahrt}:markierung:30` })
    const em = mitMark.sichtlinien.find(l => l.id.startsWith('erkennung:'))!
    expect([em.zielHoehe, em.gewaehlt, em.farbe]).toEqual([ZIELHOEHE_MARKIERUNG_M, true, '#facc15'])
    expect(mitMark.kamera.fahrzeug?.auge).toEqual(ll(lv(70, 0)))
    expect(szene3d(r3, key(r, 0), [], [], null, FARBEN).sichtlinien.some(l => l.id.startsWith('erkennung:'))).toBe(false)
    expect(sz.flaechen.filter(f => f.art === 'konflikt').map(f => f.hoehe)).toEqual([BAUM_HOEHE_M, undefined])
    expect(KONFLIKT_HOEHE.auto).toBe(PARK_HOEHE_M)
    expect(sz.kamera.fahrzeug?.bruecke).toBe(true)
  })
  it('Fahrzeuge: ein Auto je gerade Zufahrt (gewählte kräftig und «eigen»), Personen je Streifenende; Peilung in Fahrtrichtung', () => {
    const autos = mit.koerper.filter(k => k.art === 'auto')
    expect(autos).toHaveLength(2)
    const eigen = autos.find(k => k.eigen), fremd = autos.find(k => !k.eigen)!
    expect(eigen?.farbe).toBe(FARBE_HERAN); expect(fremd.farbe).toBe(FARBE_HERAN_BLASS)
    expect(eigen?.masse).toEqual(AUTO_MASSE)
    expect(ohne.koerper.filter(k => k.art === 'auto').every(k => !k.eigen && k.farbe === FARBE_HERAN_BLASS)).toBe(true)
    // Zufahrt von Westen fährt nach Osten (Peilung 90°)
    const west = autos.find(k => k.mitte[1] < ll(s.m)[1])!
    expect(Math.abs(west.peilung - 90)).toBeLessThan(2)
    expect(mit.koerper.some(k => k.art === 'velo')).toBe(false)   // Velos nicht in 3D
    // Personen an den hinteren Ecken der Warteflächen (zwei je Ende), Blick zur Streifenmitte
    const personen = mit.koerper.filter(k => k.art === 'person')
    expect(personen).toHaveLength(4)
    expect(personen.every(p => p.farbe === PERSON_FARBE && p.masse === PERSON_MASSE)).toBe(true)
    const ecken = s.ann.flatMap(poly => hintereEcken(poly, s.m))
    expect(personen.map(p => p.mitte)).toEqual(ecken.map(ll))
    expect(hintereEcken([[lv(0, 0), lv(4, 0), lv(5, 1), lv(-1, 1)]], lv(2, -5)).map(p => [p[0] - O[0], p[1] - O[1]])).toEqual([[5, 1], [-1, 1]])
  })
  it('Kamera: ohne Auswahl nur Übersicht; mit Auswahl Auge = letzter Sichtpunkt, Ziel = Streifenmitte, Peilung dorthin', () => {
    expect(ohne.kamera.fahrzeug).toBeNull()
    expect(ohne.kamera.uebersicht).toEqual({ ziel: ll(s.m), peilung: 0, distanzM: UEBERSICHT_DISTANZ_M, neigungGrad: UEBERSICHT_NEIGUNG_GRAD })
    const z = s.zufahrten[0], auge = z.sichtpunkte[z.sichtpunkte.length - 1]
    const k = mit.kamera.fahrzeug!
    expect(k.auge).toEqual(ll(auge)); expect(k.ziel).toEqual(ll(s.m))
    expect(k.peilung).toBeCloseTo(peilung(auge, s.m), 6); expect(k.abstandM).toBeCloseTo(dist(auge, s.m), 6)
    expect([k.augHoehe, k.zielHoehe, k.bruecke, k.zufahrt]).toEqual([AUGHOEHE, ZIELHOEHE_WARTE_M, false, key(r, 0)])
    expect(mit.kamera.uebersicht?.peilung).toBe(k.peilung)
  })
  it('Legende nennt die angenommenen Höhen; leere Rechnung ergibt eine leere Szene', () => {
    for (const t of ['1,0 m', '0,6 m', '1,5 m', '1,7 m', '4 m', 'swissBUILDINGS3D']) expect(mit.legende).toContain(t)
    const leer = szene3d(null, null, [], [], null, FARBEN)
    expect(leer.leer).toBe(true); expect(leer.kamera).toEqual({ fahrzeug: null, uebersicht: null }); expect(leer.flaechen).toEqual([])
  })
})

describe('Parkfelder aus den Vorschlägen der Rechnung', () => {
  it('verwendet genau die ergänzte Rechenfläche und zeigt den Katasterumriss getrennt; keine geparkten Fahrzeugmodelle', () => {
    const kat: Hindernis = { id: 'kat-schmals', art: 'parkfeld', klasse: 'auto', ring: rechteck(80, 2.4, 85, 4), quelle: 'kataster', name: 'schmal' }
    const r = rechnen(fallMit([kat])), sz = szene3d(r, null, [kat], [], null, FARBEN)
    const h = r.parkPruefflaechen!.find(h => h.id === kat.id)!
    if (h.art !== 'parkfeld') throw Error('Typ')
    expect(h.parkPruefung?.status).toBe('ergaenzt')
    expect(sz.flaechen.find(f => f.pruefhuelle && f.parkfeld === kat.id)!.ringe).toEqual([ring3d(h.ring)])
    expect(sz.linien.find(l => l.id === `katasterRand:${kat.id}`)?.gestrichelt).toBe(true)
    expect(sz.koerper.some(k => k.id.startsWith('parkauto:'))).toBe(false)
  })
  it('ein bereits übernommenes amtliches Feld erhält nur einen Parkquader', () => {
    const r = rechnen(fallMit([PARKFELD])), kat = { ...PARKFELD, quelle: 'kataster' as const }
    const sz = szene3d({ ...r, vorschlaege: [{ id: kat.id, hindernis: kat, grund: 'amtlich' }] }, null, [kat], [], null, FARBEN)
    expect(sz.koerper.some(k => k.id.startsWith('parkauto:'))).toBe(false)
    expect(sz.flaechen.filter(f => f.pruefhuelle && f.parkfeld === kat.id)).toHaveLength(1)
  })
  it('amtliche Felder mit Prüfhülle ohne Parkautos, OSM-Vorschläge nur flach, verworfene gar nicht', () => {
    const r = rechnen(fallMit())
    const kat: Hindernis = { id: 'k1', art: 'parkfeld', klasse: 'auto', ring: rechteck(80, 4, 85, 6), quelle: 'kataster', name: 'Nr. 1' }
    const osm: Hindernis = { id: 'o1', art: 'parkfeld', klasse: 'auto', ring: rechteck(70, 4, 75, 6), quelle: 'osm' }
    const r2 = { ...r, parkPruefflaechen: [kat], vorschlaege: [{ id: 'k1', hindernis: kat, grund: 'amtlich' }, { id: 'o1', hindernis: osm, grund: 'parking:lane' }],
      parkVerworfen: [{ id: 'k2', hindernis: { ...kat, id: 'k2' }, grund: 'verworfen' }] }
    const sz = szene3d(r2, null, [], [], null, FARBEN)
    const p = sz.flaechen.filter(f => f.art === 'parkfeld' && !f.pruefhuelle)
    expect(p.map(f => [f.id, f.hoehe, f.farbe, f.alpha])).toEqual([['hindernis:k1', undefined, PARKRAND_FARBE, 0.1], ['vorschlag:o1', undefined, '#0ea5e9', 0.25]])
    expect(sz.koerper.some(k => k.id.startsWith('parkauto:'))).toBe(false)
    expect(sz.flaechen.filter(f => f.pruefhuelle).map(f => [f.parkfeld, f.hoehe])).toEqual([['k1', PARK_HOEHE_M]])
    expect(p[1].text).toContain('zählt erst nach Bestätigung')
  })
})

describe('Boden aus der Amtlichen Vermessung', () => {
  it('AV-Flächen als unterste Ebene in den Farben der Karte, Gebäude blasser', () => {
    const sz = szene3d(null, null, [], [], null, FARBEN, [
      { art: 'Strasse_Weg', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [rechteck(0, 0, 10, 4)] },
      { art: 'Gebaeude', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [rechteck(0, 10, 10, 14), rechteck(2, 11, 4, 13)] },
      { art: 'Gartenanlage', kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [rechteck(20, 0, 30, 4)] }])
    const av = sz.flaechen.filter(f => f.art === 'av')
    expect(av.map(f => [f.farbe, f.alpha, f.ringe.length, f.hoehe])).toEqual([['#6e6e6e', 0.9, 1, undefined], ['#3f3f46', 0.6, 2, undefined], ['#65a30d', 0.45, 1, undefined]])
    expect(EBENE.av).toBe(0); expect(EBENE.streifen).toBeGreaterThan(EBENE.sichtfeld); expect(EBENE.spur).toBeGreaterThan(EBENE.streifen)
    expect(sz.legende).toContain('Amtlichen Vermessung')
  })
})

describe('Hindernisse und Flächen (Plan)', () => {
  const hs: Hindernis[] = [
    PARKFELD,
    { id: 'l1', art: 'laengsparkierung', linie: [lv(0, 0), lv(10, 0)], breite: 2, quelle: 'osm' },
    { id: 'b1', art: 'baum', p: lv(5, 5), stamm: 0.2, quelle: 'kataster' },
    { id: 'b2', art: 'baum', p: lv(6, 5), stamm: 0.6, quelle: 'hand' },
    { id: 'h1', art: 'hecke', linie: [lv(0, 10), lv(10, 10)], sichtbehindernd: true, quelle: 'hand' },
    { id: 'h2', art: 'mauer', linie: [lv(0, 12), lv(10, 12)], sichtbehindernd: false, quelle: 'hand' },
    { id: 'h3', art: 'uebrige', ring: rechteck(0, 14, 2, 16), sichtbehindernd: true, quelle: 'hand' },
    { id: 'i1', art: 'insel', ring: rechteck(0, 20, 2, 22), quelle: 'hand' },
  ]
  const sz = szene3d(null, null, hs, [{ id: 'fp1', art: 'trottoir', ring: rechteck(0, 30, 4, 32) }], null, FARBEN)
  it('Parkfelder ohne Autos, mit blauem Umriss und vollständiger Prüfhülle; Zweiradflächen bleiben Hinweise', () => {
    const p = sz.flaechen.filter(f => f.art === 'parkfeld' && !f.pruefhuelle)
    expect(p.map(f => [f.hoehe, f.farbe, f.ringe[0].length])).toEqual([[undefined, PARKRAND_FARBE, 4], [undefined, PARKRAND_FARBE, 4]])
    expect(sz.koerper.some(k => k.art === 'auto')).toBe(false)
    expect(sz.linien.filter(l => l.parkfeld).map(l => [l.farbe, l.punkte.length])).toEqual([[PARKRAND_FARBE, 5], [PARKRAND_FARBE, 5]])
    expect(sz.flaechen.filter(f => f.pruefhuelle).map(f => f.hoehe)).toEqual([PARK_HOEHE_M, PARK_HOEHE_M])
    const velo = szene3d(null, null, [{ id: 'v1', art: 'parkfeld', klasse: 'velo', ring: rechteck(0, 0, 2, 2), quelle: 'kataster' }], [], null, FARBEN)
    expect(velo.flaechen.map(f => [f.hoehe, f.alpha])).toEqual([[PARK_ZWEIRAD_HOEHE_M, 0.4]]); expect(velo.flaechen[0].text).toContain('nur Hinweis')
  })
  it('breite Sammelflächen behalten ihre vollständige Prüfhülle ohne erfundene Stellordnung', () => {
    const sz = szene3d(null, null, [{ ...PARKFELD, ring: rechteck(0, 0, 20, 15) }], [], null, FARBEN)
    expect(sz.koerper).toHaveLength(0)
    expect(sz.flaechen.find(f => !f.pruefhuelle)?.hoehe).toBeUndefined()
    expect(sz.flaechen.find(f => f.pruefhuelle)?.hoehe).toBe(PARK_HOEHE_M)
    expect(sz.linien[0].parkfeld).toBe(PARKFELD.id)
  })
  it('Bäume als Stamm: Durchmesser mindestens 0,3 m, Höhe 4 m', () => {
    const b = sz.koerper.filter(k => k.art === 'baum')
    expect(b.map(k => k.masse)).toEqual([[BAUM_STAMM_MIN_M, BAUM_STAMM_MIN_M, BAUM_HOEHE_M], [0.6, 0.6, BAUM_HOEHE_M]])
    expect(b[0].mitte).toEqual(ll(lv(5, 5)))
  })
  it('Hecken und Mauern als Linie werden Wände (1,5 bzw. 0,5 m), als Ring Körper; Insel nur Umriss', () => {
    expect(sz.waende.map(w => [w.id, w.hoehe])).toEqual([['hindernis:h1', SICHTBEHINDERND_M], ['hindernis:h2', NICHT_SICHTBEHINDERND_M]])
    expect(sz.flaechen.filter(f => f.art === 'hindernis').map(f => f.hoehe)).toEqual([SICHTBEHINDERND_M])
    expect(sz.linien.filter(l => l.art === 'inselRand').map(l => [l.farbe, l.gestrichelt, l.punkte.length])).toEqual([['#65a30d', true, 5]])
  })
  it('Flächen (Plan): Füllung und gestrichelter Rand in den Planfarben', () => {
    expect(sz.flaechen.filter(f => f.art === 'plan').map(f => [f.farbe, f.alpha, f.hoehe])).toEqual([['#aaa', 0.25, undefined]])
    expect(sz.linien.filter(l => l.art === 'planRand').map(l => [l.farbe, l.gestrichelt])).toEqual([['#555', true]])
  })
})

describe('Kamera-Hilfen und gemerkter Modus', () => {
  it('Vorgabe: Fahrzeug nur mit Fahrzeugkamera; gemerkte Übersicht geht vor', () => {
    const mitF = { kamera: { fahrzeug: {} as never, uebersicht: null } }, ohneF = { kamera: { fahrzeug: null, uebersicht: null } }
    expect(kameraModusVorgabe(mitF, null)).toBe('fahrzeug')
    expect(kameraModusVorgabe(mitF, 'uebersicht')).toBe('uebersicht')
    expect(kameraModusVorgabe(ohneF, 'fahrzeug')).toBe('uebersicht')
  })
  it('Heading aus der Peilung, Neigung aus dem Höhenunterschied; Körper drehen ab Osten; Übersicht als Kreisbahn', () => {
    expect(kameraHeadingPitch(0, 10, 90)).toEqual({ heading: Math.PI / 2, pitch: 0 })
    expect(kameraHeadingPitch(-1, 10, 0).pitch).toBeCloseTo(-0.0997, 3)
    expect(kameraHeadingPitch(1, 0, 0).pitch).toBe(0)
    expect(koerperHeading(90)).toBe(0); expect(koerperHeading(0)).toBeCloseTo(-Math.PI / 2, 9)
    expect(uebersichtKamera({ ziel: [46, 7], peilung: 180, distanzM: 60, neigungGrad: -45 })).toEqual({ heading: Math.PI, pitch: -Math.PI / 4, range: 60 })
  })
  it('Modus lesen und speichern: nur gültige Werte, Fehler im Speicher werden geschluckt', () => {
    const werte: Record<string, string> = {}
    const s = { getItem: (k: string) => werte[k] ?? null, setItem: (k: string, v: string) => { werte[k] = v } }
    expect(modusLesen(s)).toBeNull()
    modusSpeichern('uebersicht', s)
    expect(werte[SCHLUESSEL_MODUS]).toBe('uebersicht'); expect(modusLesen(s)).toBe('uebersicht')
    werte[SCHLUESSEL_MODUS] = 'kaputt'
    expect(modusLesen(s)).toBeNull()
    const kaputt = { getItem: () => { throw new Error('nein') }, setItem: () => { throw new Error('nein') } }
    expect(modusLesen(kaputt)).toBeNull()
    expect(() => modusSpeichern('fahrzeug', kaputt)).not.toThrow()
    // «Frei» wird nicht gemerkt: der zuletzt gemerkte feste Modus bleibt
    modusSpeichern('fahrzeug', s); modusSpeichern('frei', s)
    expect(modusLesen(s)).toBe('fahrzeug')
    expect(modusLesen(null)).toBeNull()
  })
})

describe('Brückenumrisse', () => {
  it('Punkt im Umriss, ausserhalb und im Loch', () => {
    const q = (s: number, w: number, d: number): [number, number][] => [[s, w], [s, w + d], [s + d, w + d], [s + d, w]]
    const umrisse = [[q(46.9, 7.4, 0.001), q(46.9004, 7.4004, 0.0002)]]
    expect(aufBruecke([46.9002, 7.4002], umrisse)).toBe(true)
    expect(aufBruecke([46.902, 7.4002], umrisse)).toBe(false)
    expect(aufBruecke([46.9005, 7.4005], umrisse)).toBe(false)
    expect(aufBruecke([46.9002, 7.4002], [])).toBe(false)
  })
})

describe('Linien auf Brücken verdichten', () => {
  it('Zwischenpunkte höchstens alle 1 m, Ecken bleiben', () => {
    const a: [number, number] = [46.94, 7.45], b: [number, number] = [46.94 + 9.5 / 111320, 7.45]   // 9,5 m nach Norden: 10 Abschnitte
    const v = verdichten([a, b], 1)
    expect(v).toHaveLength(11)
    expect(v[0]).toEqual(a); expect(v[10][0]).toBeCloseTo(b[0], 12)
    expect(verdichten([a], 1)).toEqual([a])
  })
})

describe('Versatz entlang der Peilung', () => {
  it('2 m nach Norden bzw. Osten, rückwärts negativ', () => {
    const p: [number, number] = [46.94, 7.45]
    const n = versatz(p, 0, 2), o = versatz(p, 90, 2), s = versatz(p, 0, -2)
    expect((n[0] - p[0]) * 111320).toBeCloseTo(2, 6); expect(n[1]).toBeCloseTo(p[1], 9)
    expect((o[1] - p[1]) * 111320 * Math.cos((p[0] * Math.PI) / 180)).toBeCloseTo(2, 6)
    expect((s[0] - p[0]) * 111320).toBeCloseTo(-2, 6)
  })
})

it('erkennt eine schmale überquerte Brücke ohne Stützpunkt im Umriss', async () => {
  const { linieBeruehrtBruecke } = await import('./modell')
  const br: [number, number][][][] = [[[[0, 4.1], [0, 4.2], [2, 4.2], [2, 4.1]]]]
  expect(linieBeruehrtBruecke([[1, 0], [1, 10]], br)).toBe(true)
  expect(linieBeruehrtBruecke([[3, 0], [3, 10]], br)).toBe(false)
  expect(linieBeruehrtBruecke([[0.5, 4.15], [1.5, 4.15]], br)).toBe(true)
})
