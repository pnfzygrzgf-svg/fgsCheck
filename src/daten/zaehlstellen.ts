// ── Zählstellen des Kantons Zürich, der Stadt Luzern und von Basel-Stadt (seit 07.11.2026) ──
//
// Für die Vorbelegung des DTV im Bedarf. Eine Zählstelle ist eine Messung, liegt also vor dem Modell (NPVM), gilt aber nur für ihren Standort:
// Zwischen ihr und der Querung kann Verkehr abzweigen. Darum ist sie immer ein Vorschlag und wirkt erst nach Bestätigung, wie der Modellwert.
// Die Dienste liefern alle Stellen auf einmal: Ein Abruf je Sitzung reicht. Basel-Stadt kennt nur Stundenwerte; die Datei public/dtv_basel.json
// ist eine Kopie aus dem VeloroutenCheck, offline zum Werktagsmittel gerechnet, ohne Zähljahr.
//
// Annahmen wie im VeloroutenCheck (nearestDtvStation): Eine Zählstelle gehört bis 25 m zur Fahrlinie, nahe am äusseren Ende der Fahrlinie aber nur
// bis 10 m, sonst erbt eine Nebenstrasse den Wert der Hauptstrasse, in die sie mündet. Die Länge der Fahrlinie setzt die Reichweite längs der Strasse.
// Unter den passenden Stellen gilt die nächste zur Querung: Sie misst am ehesten denselben Verkehr.

import { dist, lv95, type P } from '../geo'
import { naechsterPunkt } from './geoHilfen'
import { holeJson, type Abruf } from './holen'

export type ZaehlQuelleId = 'zh.dtv' | 'lu.dtv' | 'bs.dtv'
export interface Zaehlstelle { id: string; p: P; dtv: number; jahr: number | null; name: string }
export interface ZaehlSnapshot { quelleId: ZaehlQuelleId; stellen: Zaehlstelle[]; abgerufen: string }
export interface ZaehlQuelle { id: ZaehlQuelleId; name: string; quellenangabe: string; masszahl: 'DTV' | 'Werktagsmittel'; laden: (signal?: AbortSignal) => Promise<Abruf<Zaehlstelle[]>> }

/** Annahme: Abstand, bis zu dem eine Zählstelle zur Fahrlinie gehört [m] */
export const ZAEHLSTELLE_M = 25
/** Annahme: Abstand am äusseren Ende der Fahrlinie (innerhalb von ZAEHLSTELLE_M vor dem Ende) [m] */
export const ZAEHLSTELLE_ENDE_M = 10
/** Annahme, nur für die Kartenebene: Zählstellen bis zu diesem Abstand vom Ladeort [m] */
export const ZAEHLSTELLEN_KARTE_M = 500
const ABRUF_MS = 20000
const LUZERN_BFS = 1061

type Punkte = { features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }[] }
const zahl = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)

/** Kanton Zürich und Stadt Luzern: GeoJSON in WGS84; Stellen ohne positiven Wert (defekte Zähler) fallen weg */
export function zaehlstellenLesen(roh: Punkte, feldDtv: string, feldJahr: string, name: (p: Record<string, unknown>) => string, praefix: string): Zaehlstelle[] {
  return (roh.features ?? []).flatMap((f, i) => {
    const c = f.geometry?.coordinates, pr = f.properties ?? {}, dtv = zahl(pr[feldDtv])
    return c && dtv !== null && dtv > 0 ? [{ id: `${praefix}:${i}`, p: lv95(c[1], c[0]), dtv, jahr: zahl(pr[feldJahr]), name: name(pr) }] : []
  })
}

/** Datei von Basel-Stadt: { lat, lon, dtv, name } */
export function baselLesen(roh: readonly { lat?: unknown; lon?: unknown; dtv?: unknown; name?: unknown }[]): Zaehlstelle[] {
  return roh.flatMap((s, i) => {
    const lat = zahl(s.lat), lon = zahl(s.lon), dtv = zahl(s.dtv)
    return lat !== null && lon !== null && dtv !== null && dtv > 0 ? [{ id: `bs:${i}`, p: lv95(lat, lon), dtv, jahr: null, name: typeof s.name === 'string' ? s.name : '' }] : []
  })
}

export const zhZaehlUrl = 'https://maps.zh.ch/wfs/OGDZHWFS?service=WFS&version=2.0.0&request=GetFeature' +
  '&typeNames=ms:ogd-0223_giszhpub_tba_verkehrsmessstellen_p&outputFormat=geojson&srsName=EPSG:4326'
export const luZaehlUrl = 'https://map.stadtluzern.ch/server/rest/services/OGD/verkehrszaehldaten/MapServer/0/query?' +
  new URLSearchParams({ where: '1=1', outFields: 'OBJECTID,DTV_ANZAHL,DTV_JAHR', returnGeometry: 'true', outSR: '4326', f: 'geojson' })

export const ZAEHLQUELLEN: Record<ZaehlQuelleId, ZaehlQuelle> = {
  'zh.dtv': { id: 'zh.dtv', name: 'Verkehrsmessstellen Kanton Zürich', quellenangabe: 'Kanton Zürich, Verkehrsmessstellen', masszahl: 'DTV',
    laden: async signal => { const r = await holeJson<Punkte>(zhZaehlUrl, {}, ABRUF_MS, signal)
      return { ...r, daten: zaehlstellenLesen(r.daten, 'dtv', 'dtv_bezugsjahr', p => (p.messst_nr != null ? `Messstelle ${p.messst_nr}` : 'Messstelle'), 'zh') } } },
  'lu.dtv': { id: 'lu.dtv', name: 'Verkehrszähldaten Stadt Luzern', quellenangabe: 'Stadt Luzern, Verkehrszähldaten', masszahl: 'DTV',
    laden: async signal => { const r = await holeJson<Punkte>(luZaehlUrl, {}, ABRUF_MS, signal)
      return { ...r, daten: zaehlstellenLesen(r.daten, 'DTV_ANZAHL', 'DTV_JAHR', () => 'Zählstelle', 'lu') } } },
  'bs.dtv': { id: 'bs.dtv', name: 'Zählstellen Basel-Stadt (Datei)', quellenangabe: 'Kanton Basel-Stadt, Verkehrszählung', masszahl: 'Werktagsmittel',
    laden: async signal => { const r = await holeJson<Parameters<typeof baselLesen>[0]>(new URL(`${import.meta.env.BASE_URL}dtv_basel.json`, location.origin).href, {}, ABRUF_MS, signal)
      return { ...r, daten: baselLesen(r.daten) } } },
}

/** Quelle für die Gemeinden und Kantone im AV-Ausschnitt; die Stadt Luzern führt ihre Stellen selbst */
export function zaehlQuelleAmOrt(bfs: readonly (number | null)[], kantone: readonly string[]): ZaehlQuelle | null {
  return bfs.includes(LUZERN_BFS) ? ZAEHLQUELLEN['lu.dtv'] : kantone.includes('BS') ? ZAEHLQUELLEN['bs.dtv'] : kantone.includes('ZH') ? ZAEHLQUELLEN['zh.dtv'] : null
}

const geholt = new Map<ZaehlQuelleId, Abruf<Zaehlstelle[]>>()
/** Alle Stellen einer Quelle, einmal je Sitzung; ein Fehler bleibt nicht gemerkt */
export async function zaehlstellenHolen(q: ZaehlQuelle, signal?: AbortSignal): Promise<Abruf<Zaehlstelle[]>> {
  const schon = geholt.get(q.id)
  if (schon) return schon
  const r = await q.laden(signal)
  geholt.set(q.id, r)
  return r
}

export interface ZaehlTreffer { stelle: Zaehlstelle; abstandM: number; zurQuerungM: number }

/** Unter den Zählstellen an den Fahrlinien die nächste zur Querung; null, wenn keine dazugehört (kein DTV ist besser als der einer anderen Strasse) */
export function zaehlstelleZuordnen(stellen: readonly Zaehlstelle[], spuren: readonly P[][], mitte: P): ZaehlTreffer | null {
  let best: ZaehlTreffer | null = null
  for (const stelle of stellen) {
    // Lage der Stelle an der Fahrlinie, die ihr am nächsten liegt: Das innere Ende einer anderen Fahrlinie läge sonst immer an der Querung
    let lage: { d: number; q: P; spur: readonly P[] } | null = null
    for (const spur of spuren) {
      const n = spur.length >= 2 ? naechsterPunkt(stelle.p, [spur]) : null
      if (n && (!lage || n.d < lage.d)) lage = { d: n.d, q: n.q, spur }
    }
    if (!lage || lage.d > ZAEHLSTELLE_M) continue
    const a = lage.spur[0], b = lage.spur[lage.spur.length - 1], aussen = dist(a, mitte) > dist(b, mitte) ? a : b
    if (dist(lage.q, aussen) <= ZAEHLSTELLE_M && lage.d > ZAEHLSTELLE_ENDE_M) continue
    const zurQuerungM = dist(lage.q, mitte)
    if (!best || zurQuerungM < best.zurQuerungM) best = { stelle, abstandM: lage.d, zurQuerungM }
  }
  return best
}

const ganz = (x: number) => Math.round(x).toLocaleString('de-CH').replace(/[’']/g, ' ')

/** Text des Vorschlags: Wert, Herkunft, Lage und was die Zählstelle nicht sagt */
export function zaehlText(q: ZaehlQuelle, t: ZaehlTreffer, abgerufen: string): string {
  const s = t.stelle
  return `${q.masszahl} ${ganz(s.dtv)} Fz/Tag${s.jahr ? ` (${s.jahr})` : ''}, gezählt: ${q.quellenangabe}${s.name ? `, ${s.name}` : ''}; ${Math.round(t.abstandM)} m neben der Fahrlinie, ` +
    `rund ${Math.round(t.zurQuerungM)} m von der Querung, abgerufen ${abgerufen}. Annahme: Eine Zählstelle gehört bis ${ZAEHLSTELLE_M} m zur Fahrlinie, die nächste zur Querung gilt. ` +
    'Sie misst nur ihren Standort; prüfen, ob dazwischen Verkehr abzweigt. Erst nach Bestätigung verwenden.'
}
