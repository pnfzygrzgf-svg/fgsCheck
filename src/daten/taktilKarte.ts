// ── Taktil-visuelle Markierungen der Stadt Bern als Kartenebene (Vektordaten aus dem REST-Dienst des Geoportals, 30.10.2026) ──
//
// Zeigt auf der Karte, welche Daten die Vorbelegung von «taktil» und «leitlinie» nutzt (bedarf/automatikC.taktilTreffer). Gleicher
// Dienst wie die Vorbelegung (taktil.ts): ArcGIS REST «Taktil_visuelle_Markierungen», je Layer eine Abfrage im Rechteck um den
// sichtbaren Ausschnitt (LV95, GeoJSON): Layer 1 Felder (Punkte), Layer 2 Linien. Gleiche Felder, Kennungen und Texte wie die
// Vorbelegung (tvmFelderAusGeoportal, tvmLinienAusGeoportal), damit die dort genutzten Objekte hier hervorgehoben werden können.
// Darstellung wie die echte Markierung: weiss mit dunklem Rand (Felder als kleine Quadrate, Linien weiss mit dunkler Kontur);
// abseits der übrigen Ebenen (Richtplan Magenta, Fahrzeuge, Velo-Kegel, Parkfelder farbig; Streifenenden sind Kreise, keine Quadrate).
// Aufbau wie die Ebene «Richtplan Fussverkehr (Geoportal Bern)» (richtplanKarte.ts): nur in der Ebenenwahl, solange die Karte die
// Stadt Bern zeigt, anfangs aus, lädt erst eingeschaltet und ab TK_KARTE_ZOOM: erst dann geht der Ausschnitt an map.bern.ch.
// Hier nur Daten, Darstellung und Treffer (rein, getestet); Laden und Zeichnen in Karte.tsx.

import { abstandStrecke, dist, type P } from '../geo'
import { BERN_GEOPORTAL, arcgisPruefen, type ArcgisGeoJson } from './geoportal'
import { holeJson, istAbbruch, type Abruf } from './holen'
import { TVM_DIENST, tvmFelderAusGeoportal, tvmLinienAusGeoportal, type TaktilDaten, type TvmFeld, type TvmLinie } from './taktil'
import { enthaelt, rpVerfuegbar, type Box } from './richtplanKarte'

export const TK_KARTE_NAME = 'Taktile Markierungen (Stadt Bern)'
/** Quellenangabe auf der Karte */
export const TK_KARTE_QUELLE = '© Geodaten Stadt Bern, Taktil-visuelle Markierungen'
/** Herkunft im Tooltip */
export const TK_QUELLE_TEXT = 'Taktil-visuelle Markierungen, Geoportal Stadt Bern'
/** erst ab dieser Zoomstufe laden und zeichnen (darunter zu viele Objekte für den Ausschnitt) */
export const TK_KARTE_ZOOM = 15
/** Farben wie die echte Markierung: weiss mit dunklem Rand */
export const TK_WEISS = '#ffffff'
export const TK_RAND = '#111827'

/** Kartenausschnitt (WGS84) berührt die Stadt Bern: Ebene in der Ebenenwahl anbieten (gleiche Grenzen wie der Richtplan) */
export const tkVerfuegbar = rpVerfuegbar

export type TkArt = 'feld' | 'linie'
export interface TkLayer { layer: number; art: TkArt }
/** geladene REST-Layer, in der Reihenfolge der Abfragen */
export const TK_KARTE_LAYER: readonly TkLayer[] = [{ layer: 1, art: 'feld' }, { layer: 2, art: 'linie' }]
/** Namen (Legende, Fehler) */
export const TK_NAME: Readonly<Record<TkArt, string>> = { feld: 'Taktile Felder', linie: 'Taktile Linien' }
/** Beispiele je Art (Legende) */
export const TK_BEISPIELE: Readonly<Record<TkArt, string>> = {
  feld: 'Aufmerksamkeitsfeld, Blindenquadrat, Abschluss-, Abzweigfeld', linie: 'Leitlinie, auch auf dem Fussgängerstreifen, Sicherheitslinie',
}
/** Legende in Zeichenreihenfolge von oben: Felder, dann Linien */
export const TK_LEGENDE: readonly TkArt[] = ['feld', 'linie']

/** Objekt der Ebene (LV95): Feld als ein Punkt (geom [[p]]), Linie als Linienzüge; Text der Art (taktil.ts), Baujahr */
export interface TkObjekt { id: string; art: TkArt; geom: P[][]; text: string; baujahr: number | null; box: Box }

const boxVon = (geom: P[][]): Box => {
  let e0 = Infinity, n0 = Infinity, e1 = -Infinity, n1 = -Infinity
  for (const z of geom) for (const [e, n] of z) { e0 = Math.min(e0, e); n0 = Math.min(n0, n); e1 = Math.max(e1, e); n1 = Math.max(n1, n) }
  return [e0, n0, e1, n1]
}
/** Feld bzw. Linie der Vorbelegung (taktil.ts) als Objekt der Ebene (gleiche Kennung) */
export const tkAusFeld = (f: TvmFeld): TkObjekt => ({ id: f.id, art: 'feld', geom: [[f.p]], text: f.text, baujahr: f.baujahr, box: boxVon([[f.p]]) })
export const tkAusLinie = (l: TvmLinie): TkObjekt => ({ id: l.id, art: 'linie', geom: l.teile, text: l.text, baujahr: l.baujahr, box: boxVon(l.teile) })

/** Antwort eines Layers -> Objekte (Einlesen wie die Vorbelegung); Features ohne Geometrie entfallen */
export function tkObjekte(l: TkLayer, gj: ArcgisGeoJson): TkObjekt[] {
  return l.art === 'feld' ? tvmFelderAusGeoportal(gj).map(tkAusFeld) : tvmLinienAusGeoportal(gj).map(tkAusLinie)
}
/** Daten der Vorbelegung (Felder, Linien) als Objekte der Ebene; ein nicht erreichter Layer (null) fehlt */
export function tkAusVorbelegung(d: TaktilDaten): Partial<Record<TkArt, TkObjekt[]>> {
  return { ...(d.felder ? { feld: d.felder.map(tkAusFeld) } : {}), ...(d.linien ? { linie: d.linien.map(tkAusLinie) } : {}) }
}

/** Abfrage-URL eines Layers im Rechteck (LV95), Antwort GeoJSON in LV95, Koordinaten auf 1 dm (Felder und Linien sind klein: keine
 * Vereinfachung) */
export function tkKarteUrl(layer: number, b: Box): string {
  const q = new URLSearchParams({
    geometry: b.map(v => v.toFixed(0)).join(','), geometryType: 'esriGeometryEnvelope', inSR: '2056', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'Objectid,Art,Art_beschrieb,Baujahr', outSR: '2056', f: 'geojson', geometryPrecision: '1',
  })
  return `${BERN_GEOPORTAL}/${TVM_DIENST}/MapServer/${layer}/query?${q}`
}

/** Zwischenspeicher je Layer: geladene Rechtecke mit ihren Objekten (die ältesten fallen über TK_CACHE_MAX je Layer weg) */
export const TK_CACHE_MAX = 8
export type TkCache = Map<TkArt, { box: Box; objekte: TkObjekt[] }[]>
/** Daten der Vorbelegung, die die Ebene mitbenutzt (Felder, Linien), mit ihrem Rechteck */
export interface TkVorhanden { box: Box; objekte: Partial<Record<TkArt, TkObjekt[]>> }
/** fehler: Layer nicht erreichbar; zuViel: Antwort an der Übertragungsgrenze des Diensts (im Ausschnitt zu viele Objekte) */
export interface TkStand { objekte: Record<TkArt, TkObjekt[]>; fehler: TkArt[]; zuViel: TkArt[]; geladen: number }
type Holen = (url: string, signal?: AbortSignal) => Promise<Abruf<ArcgisGeoJson>>
const holenStandard: Holen = (url, signal) => holeJson<ArcgisGeoJson>(url, {}, 30000, signal)

/**
 * Objekte der Ebene für ein Abfrage-Rechteck: je Layer aus dem Zwischenspeicher (ein geladenes Rechteck deckt es), aus den Daten der
 * Vorbelegung (deckt deren Rechteck es) bzw. neu geladen (Antwort geprüft wie die Vorbelegung). Ein Abbruch bricht alles ab (wirft);
 * fehlt ein Layer, steht er in fehler, eine gekappte Antwort in zuViel (beide ohne Objekte, nicht gespeichert; die übrigen Layer
 * bleiben). geladen: Zahl der neuen Abfragen.
 */
export async function tkLaden(box: Box, cache: TkCache, vorhanden: TkVorhanden | null, signal?: AbortSignal, holen: Holen = holenStandard): Promise<TkStand> {
  const objekte = {} as Record<TkArt, TkObjekt[]>, fehler: TkArt[] = [], zuViel: TkArt[] = []
  let geladen = 0
  await Promise.all(TK_KARTE_LAYER.map(async l => {
    const da = cache.get(l.art)?.find(x => enthaelt(x.box, box))
    if (da) { objekte[l.art] = da.objekte; return }
    const vor = vorhanden?.objekte[l.art]
    if (vor && enthaelt(vorhanden!.box, box)) { objekte[l.art] = vor; return }
    try {
      geladen++
      const r = await holen(tkKarteUrl(l.layer, box), signal)
      if (r.daten.exceededTransferLimit === true || r.daten.properties?.exceededTransferLimit === true) {
        objekte[l.art] = []; zuViel.push(l.art); return
      }
      arcgisPruefen(r.daten)
      const o = tkObjekte(l, r.daten)
      objekte[l.art] = o
      const liste = [...(cache.get(l.art) ?? []), { box, objekte: o }]
      cache.set(l.art, liste.slice(-TK_CACHE_MAX))
    } catch (x) {
      if (istAbbruch(x) || signal?.aborted) throw x
      objekte[l.art] = []
      fehler.push(l.art)
    }
  }))
  return { objekte, fehler, zuViel, geladen }
}

// ── Darstellung und Tooltip ──

/**
 * Stil je Art in Bildpunkten: Feld als Quadrat (Kantenlänge groesse, Rand rand), Linie weiss (Breite groesse) mit dunkler Kontur
 * (je Seite rand, gezeichnet als breitere dunkle Linie darunter: kontur). Genutzt: das Feld bzw. die Leitlinie der Vorbelegung
 * grösser mit kräftigerem Rand.
 */
export interface TkStil { art: TkArt; groesse: number; rand: number; kontur: number; fuellung: string; randFarbe: string; opacity: number }
export function tkStil(art: TkArt, genutzt = false): TkStil {
  const groesse = art === 'feld' ? (genutzt ? 13 : 7) : (genutzt ? 4 : 2)
  const rand = genutzt ? 2.5 : 1.5
  return { art, groesse, rand, kontur: groesse + 2 * rand, fuellung: TK_WEISS, randFarbe: TK_RAND, opacity: genutzt ? 1 : 0.9 }
}
/** Inhalt des Feld-Symbols auf der Karte (Leaflet divIcon, Grösse groesse × groesse) */
export const tkFeldHtml = (s: TkStil): string => `<div style="width:100%;height:100%;box-sizing:border-box;background:${s.fuellung};` +
  `border:${s.rand}px solid ${s.randFarbe};opacity:${s.opacity}"></div>`

/** Tooltip: Titel (Art, Baujahr, Vermerk des genutzten Objekts) und Herkunft */
export function tkTooltip(o: Pick<TkObjekt, 'art' | 'text' | 'baujahr'>, genutzt = false): { titel: string; quelle: string } {
  const titel = `${o.text || (o.art === 'feld' ? 'Taktiles Feld' : 'Taktile Linie')}${o.baujahr !== null ? `, Baujahr ${o.baujahr}` : ''}` +
    (genutzt ? ' – für die Prüfung genutzt' : '')
  return { titel, quelle: TK_QUELLE_TEXT }
}

// ── Treffer unter dem Mauszeiger (die Ebene ist nicht anklickbar, damit sie keine Klicks schluckt) ──

const nahe = (b: Box, p: P, r: number) => p[0] >= b[0] - r && p[0] <= b[2] + r && p[1] >= b[1] - r && p[1] <= b[3] + r
/** Objekt unter dem Punkt (LV95): zuerst das nächste Feld bis tolM (Felder liegen über den Linien), sonst die nächste Linie bis tolM;
 * null ohne Treffer */
export function tkTreffer(objekte: readonly TkObjekt[], p: P, tolM: number): TkObjekt | null {
  let feld: TkObjekt | null = null, fd = Infinity, linie: TkObjekt | null = null, ld = Infinity
  for (const o of objekte) {
    if (!nahe(o.box, p, tolM)) continue
    if (o.art === 'feld') {
      const d = dist(p, o.geom[0][0])
      if (d <= tolM && d < fd) { fd = d; feld = o }
    } else for (const z of o.geom) for (let i = 1; i < z.length; i++) {
      const d = abstandStrecke(p, z[i - 1], z[i])
      if (d <= tolM && d < ld) { ld = d; linie = o }
    }
  }
  return feld ?? linie
}
