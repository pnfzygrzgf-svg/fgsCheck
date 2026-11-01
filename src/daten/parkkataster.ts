// ── Amtliche Parkfelder als Quelle (Nutzerentscheid 11.10.2026) ──
//
// Je Stadt ein Eintrag wie beim Baumkataster: wo er gilt (BFS-Nummer der AV-Gemeinde), wie geladen wird, Quellenangabe.
// Die Felder zählen sofort als Hindernis (nicht als Vorschlag), einzelne lassen sich verwerfen, die ganze Quelle abschalten.
// Bern: öffentlicher WFS des Geoportals, Produkt «Parkplätze öffentlich» (derselbe Datensatz wie Parkplaetze_oeffentlich.dxf
// der lokalen Berner Prüfung). Je Flächen-Typ eine Abfrage (mehrere TYPENAMES in einer Abfrage liefert der Dienst als
// aneinandergehängte FeatureCollections, kein gültiges JSON). Abfrage und Antwort in LV95 (BBOX und SRSNAME EPSG:2056):
// in WGS84 rechnet der Dienst ohne Datumsübergang um (geprüft 11.10.2026: Ausgabe rund 150 m nördlich und 70 m östlich
// der wahren Lage, die WGS84-BBOX trifft entsprechend daneben). Antworten ohne EPSG:2056 werden abgelehnt.
// Punkt-Typen (Taxistandplatz, Veloabstellplatz, Motorradparkplatz u. a.) sind Symbole und werden nicht geladen.
// Klassen wie park_klasse in fgs_sicht_pruefen.py; Flächen unter 0,5 m² entfallen (parkfelder_lesen); ungültige Ringe werden
// mit einer Vereinigung bereinigt (statt Buffer(0)); Löcher entfallen (Aussenring), Teile eines MultiPolygons sind je ein Feld.
// Private Parkplätze enthält der Datensatz nicht.

import { type P, lv95, bboxLv95 } from '../geo'
import type { ParkKlasse } from '../rechner/hindernisse'
import { vereinigung, ringFlaeche } from '../rechner/poly'
import { holeJson, AbrufFehler, type Abruf } from './holen'

export const PARK_MIN_M2 = 0.5

export interface KatasterFeld { id: string; klasse: ParkKlasse; ring: P[]; name: string }
export interface ParkQuelle {
  id: string
  /** Kennung im Quellenregister (daten/quellenregister.ts) */
  quelleId: string
  name: string
  quellenangabe: string
  gemeinden: number[]                 // BFS-Nummern
  laden: (lat: number, lon: number, radiusM: number, signal?: AbortSignal) => Promise<Abruf<KatasterFeld[]>>
}

/** park_klasse (fgs_sicht_pruefen.py): Typ bzw. Layer -> Klasse, null = nicht verwenden */
export function parkKlasse(typ: string): ParkKlasse | null {
  if (typ.startsWith('Parkverbot') || typ.startsWith('Veloabstell') || typ.startsWith('Velostation')) return null
  if (typ.startsWith('Parkplatz_Velo')) return 'velo'
  if (typ.startsWith('Parkplatz_Motorrad') || typ.startsWith('Motorradparkplatz')) return 'motorrad'
  if (typ.startsWith('Parkfeld') || typ.startsWith('Spezialfeld') || typ.startsWith('Andere')) return 'auto'
  return null
}

interface GeoJsonFlaechen {
  crs?: { properties?: { name?: string } }
  features?: { geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> | null }[]
}

const istZahlPaar = (x: unknown): x is [number, number] =>
  Array.isArray(x) && x.length >= 2 && Number.isFinite(x[0]) && Number.isFinite(x[1])

/** Koordinaten der Antwort: LV95 [E, N] bzw. WGS84 [lon, lat] (dann mit lv95() umgerechnet) */
export type Koord = 'lv95' | 'wgs84'

/** Aussenring in LV95 bereinigen: ungültige (verdrehte) Ringe über eine Vereinigung, je Teil ein Ring ab PARK_MIN_M2 */
function ringeBereinigen(roh: unknown, koord: Koord): P[][] {
  if (!Array.isArray(roh)) return []
  const r: P[] = roh.filter(istZahlPaar).map(([x, y]) => (koord === 'wgs84' ? lv95(y, x) : [x, y] as P))
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop()
  if (r.length < 3) return []
  let teile: P[][]
  try { teile = vereinigung([[r]]).map(poly => poly[0]).filter(x => x && x.length >= 3) }
  catch { teile = [r] }
  return teile.filter(x => Math.abs(ringFlaeche(x)) >= PARK_MIN_M2)
}

/**
 * GeoJSON eines Flächen-Typs -> Felder. id «<praefix>:<Typ>:<OBJECTID>:<k>» (k: Teil des MultiPolygons bzw. der bereinigten
 * Fläche), Name «<Bezeichnung>, Nr. <PARKPLATZ_NUMMER> (<zusatz>)».
 */
export function felderAusGeoJson(gj: GeoJsonFlaechen, typ: string, praefix: string, bezeichnung: string, zusatz: string,
  koord: Koord = 'lv95'): KatasterFeld[] {
  const klasse = parkKlasse(typ)
  if (!klasse) return []
  const out: KatasterFeld[] = []
  for (const f of gj.features ?? []) {
    const g = f.geometry, pr = f.properties ?? {}
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon') || !Array.isArray(g.coordinates)) continue
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as unknown[]
    const oid = pr.OBJECTID ?? pr.GmlID ?? out.length
    const nr = pr.PARKPLATZ_NUMMER ?? pr.PARKPLATZ_NAME
    const name = `${bezeichnung}${nr != null && nr !== 'null' ? `, Nr. ${nr}` : ''} (${zusatz})`
    let k = 0
    for (const poly of polys) {
      if (!Array.isArray(poly)) continue
      for (const ring of ringeBereinigen(poly[0], koord)) out.push({ id: `${praefix}:${typ}:${oid}:${k++}`, klasse, ring, name })
    }
  }
  return out
}

// ---------------------------------------------------------------- Bern
const BERN_WFS = 'https://map.bern.ch/arcgis/services/Geoportal/Parkplaetze_oeffentlich/MapServer/WFSServer'
/** Flächen-Typen (MultiPolygon) mit Bezeichnung; Parkverbot hat keine Klasse und wird nicht geladen */
export const BERN_TYPEN: Record<string, string> = {
  Parkfeld_Gebuehrenpflichtig: 'Parkfeld gebührenpflichtig', Parkfeld_blau_APK: 'Parkfeld blau (APK)',
  Parkfeld_weiss_APK: 'Parkfeld weiss (APK)', Parkfeld_weiss_Kurzzeit: 'Parkfeld weiss (Kurzzeit)',
  Parkplatz_Velo_Mofa: 'Parkplatz Velo/Mofa', Parkplatz_Motorrad: 'Parkplatz Motorrad', Parkverbot: 'Parkverbot',
  Spezialfeld: 'Spezialfeld', Andere_Unbekannt: 'Parkfeld (andere/unbekannt)',
}

export function bernParkUrl(typ: string, lat: number, lon: number, radiusM: number): string {
  return `${BERN_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=Geoportal_Parkplaetze_oeffentlich_2:${typ}` +
    `&OUTPUTFORMAT=GEOJSON&SRSNAME=urn:ogc:def:crs:EPSG::2056&BBOX=${bboxLv95(lat, lon, radiusM)}`
}

/** Antwort in LV95? (crs EPSG:2056; sonst wären die Koordinaten WGS84 mit dem Versatz des Dienstes) */
export const istLv95 = (gj: GeoJsonFlaechen) => /(^|[^0-9])2056$/.test(gj.crs?.properties?.name ?? '')

async function bernLaden(lat: number, lon: number, radiusM: number, signal?: AbortSignal): Promise<Abruf<KatasterFeld[]>> {
  const typen = Object.keys(BERN_TYPEN).filter(t => parkKlasse(t))
  // parallel je Typ; fehlt ein Typ, gilt die ganze Quelle als nicht geladen (sonst fehlten Felder unbemerkt)
  const rr = await Promise.all(typen.map(t => holeJson<GeoJsonFlaechen>(bernParkUrl(t, lat, lon, radiusM), {}, 30000, signal)))
  if (rr.some(r => !istLv95(r.daten))) throw new AbrufFehler('Antwort nicht in LV95 (EPSG:2056)')
  const felder = rr.flatMap((r, i) => felderAusGeoJson(r.daten, typen[i], 'bernpark', BERN_TYPEN[typen[i]],
    'Parkplätze öffentlich Stadt Bern'))
  return { daten: felder, ms: Math.max(...rr.map(r => r.ms)), bytes: rr.reduce((s, r) => s + r.bytes, 0), quelle: rr[0].quelle }
}

export const PARKKATASTER: ParkQuelle[] = [
  { id: 'bernpark', quelleId: 'bern.park', name: 'Parkfelder Stadt Bern (amtlich)', quellenangabe: 'Geodaten Stadt Bern, Parkplätze öffentlich',
    gemeinden: [351], laden: bernLaden },
]

/** Quelle für die Gemeinden im AV-Ausschnitt (erste passende) */
export function parkQuelleFuer(bfs: (number | null)[]): ParkQuelle | null {
  return PARKKATASTER.find(q => bfs.some(b => b !== null && q.gemeinden.includes(b))) ?? null
}

/** Gehört die Vorschlags- bzw. Feld-Id zu einer Parkquelle? (verworfene Felder in fall.vorschlaege) */
export const istParkId = (id: string, q: ParkQuelle) => id.startsWith(`${q.id}:`)
