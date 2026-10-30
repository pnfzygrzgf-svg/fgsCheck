// ── Richtplan Fussverkehr der Stadt Bern als Kartenebene (Vektordaten aus dem REST-Dienst des Geoportals, 30.10.2026) ──
//
// Ersetzt die WMS-Ebene (Rückmeldung 30.10.2026: Hover soll zeigen, was eine Linie bzw. Fläche ist; Flächen waren den AV-Flächen zu
// ähnlich). Gleicher Dienst wie die Vorbelegung (richtplanFussverkehr.ts): ArcGIS REST «Richtplan_Fussverkehr», je Layer eine Abfrage
// im Rechteck um den sichtbaren Ausschnitt (LV95, GeoJSON). Geladen: Layer 4 Basisnetz Fussweg bestehend (Linie) und 7 Hinweis (Fläche,
// nur publikumsattraktive Bereiche); die Massnahmen (1, 2, 3, 6) und Wanderwege (5) bleiben weg (Nutzerentscheid 30.10.2026).
// Eigene Darstellung in Magenta, abseits der AV-Farben (grau, beige,
// grün) und der Sichtfelder (grün, rot, orange, ocker). Die Ebene steht nur in der Ebenenwahl, solange die Karte die Stadt Bern zeigt,
// ist anfangs aus und lädt erst eingeschaltet und ab RP_KARTE_ZOOM: erst dann geht der Ausschnitt an map.bern.ch.
// Hier nur Daten, Darstellung und Treffer (rein, getestet); Laden und Zeichnen in Karte.tsx.

import { imPolygon, type P } from '../geo'
import { BERN_GEOPORTAL, arcgisPruefen, featureId, flaechenRinge, linienTeile, textFeld, type ArcgisGeoJson } from './geoportal'
import { holeJson, istAbbruch, type Abruf } from './holen'
import { RP_DIENST, type RichtplanDaten } from './richtplanFussverkehr'
import type { Bereich } from './haltestellen'

export const RP_KARTE_NAME = 'Richtplan Fussverkehr (Geoportal Bern)'
/** Quellenangabe auf der Karte */
export const RP_KARTE_QUELLE = '© Geodaten Stadt Bern, Richtplan Fussverkehr'
/** Herkunft im Tooltip */
export const RP_QUELLE_TEXT = 'Richtplan Fussverkehr, Geoportal Stadt Bern'
/** erst ab dieser Zoomstufe laden und zeichnen (darunter zu viele Objekte für den Ausschnitt) */
export const RP_KARTE_ZOOM = 15
export const RP_FARBE = '#be185d'
/** Ausdehnung der Stadt Bern (WGS84, gerundet wie das Orthofoto in VeloroutenCheck: LV95 2588000–2605000 / 1196000–1205000) */
export const BERN_GRENZEN = { s: 46.91, w: 7.27, n: 47.0, e: 7.51 } as const

/** Kartenausschnitt (WGS84) berührt die Stadt Bern: Ebene in der Ebenenwahl anbieten */
export const rpVerfuegbar = (b: { s: number; w: number; n: number; e: number }): boolean =>
  b.s <= BERN_GRENZEN.n && b.n >= BERN_GRENZEN.s && b.w <= BERN_GRENZEN.e && b.e >= BERN_GRENZEN.w

export type RpArt = 'basisnetz' | 'publikum'
export interface RpLayer { layer: number; art: RpArt; flaeche: boolean }
/** geladene REST-Layer, in der Reihenfolge der Abfragen */
// 30.10.2026 (Nutzerentscheid): nur Basisnetz und publikumsattraktive Bereiche; die Massnahmen (Layer 1, 2, 3, 6) bleiben weg
export const RP_KARTE_LAYER: readonly RpLayer[] = [
  { layer: 4, art: 'basisnetz', flaeche: false }, { layer: 7, art: 'publikum', flaeche: true },
]
/** Namen (Tooltip, Legende) */
export const RP_NAME: Readonly<Record<RpArt, string>> = {
  basisnetz: 'Basisnetz Fussweg (bestehend)', publikum: 'Publikumsattraktiver Bereich',
}
/** Legende in Zeichenreihenfolge von oben: Linien, dann Flächen */
export const RP_LEGENDE: readonly RpArt[] = ['basisnetz', 'publikum']

export type Box = [number, number, number, number]   // LV95: e0, n0, e1, n1

/** Objekt der Ebene (LV95): Linienzüge bzw. Ringe, Name (Refname, ohne interne «RP-…»-Namen), Zusatz (z. B. ausserhalb Bern) */
export interface RpObjekt { id: string; art: RpArt; geom: P[][]; name: string | null; box: Box }

const boxVon = (geom: P[][]): Box => {
  let e0 = Infinity, n0 = Infinity, e1 = -Infinity, n1 = -Infinity
  for (const z of geom) for (const [e, n] of z) { e0 = Math.min(e0, e); n0 = Math.min(n0, n); e1 = Math.max(e1, e); n1 = Math.max(n1, n) }
  return [e0, n0, e1, n1]
}
/** Präfix der Kennung je Art; Basisnetz und publikumsattraktive Bereiche wie richtplanFussverkehr.ts (gleiche Kennung wie die
 * Daten der Vorbelegung, damit die dort genutzte Linie hier hervorgehoben werden kann) */
const PRAEFIX: Readonly<Record<RpArt, string>> = { basisnetz: 'bernrp', publikum: 'bernrph' }
const nameVon = (x: unknown): string | null => { const t = textFeld(x); return t && !/^RP[- ]/i.test(t) ? t : null }

/** Antwort eines Layers -> Objekte; Features ohne Geometrie entfallen; Layer 7 nur publikumsattraktive Bereiche */
export function rpObjekte(l: RpLayer, gj: ArcgisGeoJson): RpObjekt[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const geom = l.flaeche ? flaechenRinge(f) : linienTeile(f)
    const layer = textFeld(f.properties?.Layer) ?? ''
    if (!geom.length || (l.art === 'publikum' && layer && !/publikum/i.test(layer))) return []
    return [{ id: featureId(PRAEFIX[l.art], f, i), art: l.art, geom, name: l.flaeche ? nameVon(f.properties?.Refname) : null,
      box: boxVon(geom) }]
  })
}
/** Daten der Vorbelegung (Basisnetz, publikumsattraktive Bereiche) als Objekte der Ebene */
export function rpAusVorbelegung(d: RichtplanDaten): Partial<Record<RpArt, RpObjekt[]>> {
  return {
    ...(d.basisnetz ? { basisnetz: d.basisnetz.map(l => ({ id: l.id, art: 'basisnetz' as const, geom: l.teile, name: null, box: boxVon(l.teile) })) } : {}),
    ...(d.publikum ? { publikum: d.publikum.map(f => ({ id: f.id, art: 'publikum' as const, geom: f.ringe, name: f.name && !/^RP[- ]/i.test(f.name) ? f.name : null,
      box: boxVon(f.ringe) })) } : {}),
  }
}

/** Abfrage-URL eines Layers im Rechteck (LV95), Antwort GeoJSON in LV95, Koordinaten auf 1 dm, vereinfacht auf 0,5 m */
export function rpKarteUrl(layer: number, b: Box, flaeche: boolean): string {
  const q = new URLSearchParams({
    geometry: b.map(v => v.toFixed(0)).join(','), geometryType: 'esriGeometryEnvelope', inSR: '2056', spatialRel: 'esriSpatialRelIntersects',
    outFields: flaeche ? 'Objectid,Layer,Refname' : 'Objectid,Layer', outSR: '2056', f: 'geojson', geometryPrecision: '1', maxAllowableOffset: '0.5',
  })
  return `${BERN_GEOPORTAL}/${RP_DIENST}/MapServer/${layer}/query?${q}`
}

/** Raster der Abfragen (m): Ausschnitt mit Rand auf dieses Raster gerundet, damit kleine Verschiebungen den Zwischenspeicher treffen */
export const RP_RASTER_M = 250
/** Abfrage-Rechteck zum sichtbaren Ausschnitt: ein Viertel Rand je Seite, auf RP_RASTER_M nach aussen gerundet */
export function rpAbfrageBox(sicht: Box): Box {
  const re = (sicht[2] - sicht[0]) / 4, rn = (sicht[3] - sicht[1]) / 4, r = RP_RASTER_M
  return [Math.floor((sicht[0] - re) / r) * r, Math.floor((sicht[1] - rn) / r) * r, Math.ceil((sicht[2] + re) / r) * r, Math.ceil((sicht[3] + rn) / r) * r]
}
export const enthaelt = (a: Box, b: Box): boolean => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3]
/** Rechteck eines geladenen Bereichs (Vorbelegung: Quadrat bzw. Kreis ±radiusM; beim Kreis das einbeschriebene Quadrat) */
export function bereichBox(b: Bereich): Box {
  const r = b.form === 'kreis' ? b.radiusM / Math.SQRT2 : b.radiusM
  return [b.mitte[0] - r, b.mitte[1] - r, b.mitte[0] + r, b.mitte[1] + r]
}

/** Zwischenspeicher je Layer: geladene Rechtecke mit ihren Objekten (die ältesten fallen über RP_CACHE_MAX je Layer weg) */
export const RP_CACHE_MAX = 8
export type RpCache = Map<RpArt, { box: Box; objekte: RpObjekt[] }[]>
/** Daten der Vorbelegung, die die Ebene mitbenutzt (Basisnetz, Bereiche), mit ihrem Rechteck */
export interface RpVorhanden { box: Box; objekte: Partial<Record<RpArt, RpObjekt[]>> }
export interface RpStand { objekte: Record<RpArt, RpObjekt[]>; fehler: RpArt[]; geladen: number }
type Holen = (url: string, signal?: AbortSignal) => Promise<Abruf<ArcgisGeoJson>>
const holenStandard: Holen = (url, signal) => holeJson<ArcgisGeoJson>(url, {}, 30000, signal)

/**
 * Objekte der Ebene für ein Abfrage-Rechteck: je Layer aus dem Zwischenspeicher (ein geladenes Rechteck deckt es), aus den Daten der
 * Vorbelegung (deckt deren Rechteck es) bzw. neu geladen (Antwort geprüft wie die Vorbelegung). Ein Abbruch bricht alles ab (wirft);
 * fehlt ein Layer, steht er in fehler (die übrigen bleiben). geladen: Zahl der neuen Abfragen.
 */
export async function rpLaden(box: Box, cache: RpCache, vorhanden: RpVorhanden | null, signal?: AbortSignal, holen: Holen = holenStandard): Promise<RpStand> {
  const objekte = {} as Record<RpArt, RpObjekt[]>, fehler: RpArt[] = []
  let geladen = 0
  await Promise.all(RP_KARTE_LAYER.map(async l => {
    const da = cache.get(l.art)?.find(x => enthaelt(x.box, box))
    if (da) { objekte[l.art] = da.objekte; return }
    const vor = vorhanden?.objekte[l.art]
    if (vor && enthaelt(vorhanden!.box, box)) { objekte[l.art] = vor; return }
    try {
      geladen++
      const r = await holen(rpKarteUrl(l.layer, box, l.flaeche), signal)
      arcgisPruefen(r.daten)
      const o = rpObjekte(l, r.daten)
      objekte[l.art] = o
      const liste = [...(cache.get(l.art) ?? []), { box, objekte: o }]
      cache.set(l.art, liste.slice(-RP_CACHE_MAX))
    } catch (x) {
      if (istAbbruch(x) || signal?.aborted) throw x
      objekte[l.art] = []
      fehler.push(l.art)
    }
  }))
  return { objekte, fehler, geladen }
}

// ── Darstellung und Tooltip ──

/** Stil je Art (Leaflet-Pfad): Basisnetz durchgezogen, Bereiche blass gefüllt
 * mit gestricheltem Rand; genutzt: die Basisnetz-Linie der Vorbelegung kräftiger */
export interface RpStil { flaeche: boolean; color: string; weight: number; opacity: number; dashArray?: string
  fill: false | 'farbe'; fillOpacity: number }
export function rpStil(art: RpArt, genutzt = false): RpStil {
  const F = RP_FARBE
  switch (art) {
    case 'basisnetz': return { flaeche: false, color: F, weight: genutzt ? 5 : 3, opacity: genutzt ? 1 : 0.85, fill: false, fillOpacity: 0 }
    case 'publikum': return { flaeche: true, color: F, weight: 1.5, opacity: 0.7, dashArray: '6 4', fill: 'farbe', fillOpacity: 0.12 }
  }
}
/** Tooltip: Titel (Art, Name, Vermerk der genutzten Linie) und Herkunft */
export function rpTooltip(o: Pick<RpObjekt, 'art' | 'name'>, genutztM?: number | null): { titel: string; quelle: string } {
  const titel = `${RP_NAME[o.art]}${o.name ? `: ${o.name}` : ''}` +
    (genutztM !== undefined && genutztM !== null ? ' – für die Prüfung genutzt' : '')
  return { titel, quelle: RP_QUELLE_TEXT }
}

// ── Treffer unter dem Mauszeiger (die Ebene ist nicht anklickbar, damit sie keine Klicks schluckt) ──

function abstandSegment(p: P, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
const nahe = (b: Box, p: P, r: number) => p[0] >= b[0] - r && p[0] <= b[2] + r && p[1] >= b[1] - r && p[1] <= b[3] + r
/**
 * Objekt unter dem Punkt (LV95): zuerst die nächste Linie bis tolM (Linien liegen über den Flächen), sonst die kleinste Fläche, die den
 * Punkt enthält; null ohne Treffer
 */
export function rpTreffer(objekte: readonly RpObjekt[], p: P, tolM: number): RpObjekt | null {
  let best: RpObjekt | null = null, bd = Infinity
  for (const o of objekte) {
    if (rpStil(o.art).flaeche || !nahe(o.box, p, tolM)) continue
    for (const z of o.geom) for (let i = 1; i < z.length; i++) {
      const d = abstandSegment(p, z[i - 1], z[i])
      if (d <= tolM && d < bd) { bd = d; best = o }
    }
  }
  if (best) return best
  const flaeche = (b: Box) => (b[2] - b[0]) * (b[3] - b[1])
  return objekte.filter(o => rpStil(o.art).flaeche && nahe(o.box, p, 0) && imPolygon(p, o.geom))
    .sort((a, b) => flaeche(a.box) - flaeche(b.box))[0] ?? null
}
/** Toleranz des Treffers in Metern: so viele Bildpunkte bei Zoomstufe z und Breite lat (Web-Mercator) */
export const rpToleranzM = (px: number, z: number, lat: number): number => px * 40075016.686 * Math.cos(lat * Math.PI / 180) / 2 ** (z + 8)
