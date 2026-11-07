// ── Parkfelder der Stadt Zürich als Vorschlag (seit 07.11.2026) ──
//
// Der Dienst der Dienstabteilung Verkehr führt keine Flächen: je Feld einen Punkt mit der Anordnung (LPU längs, SCHPU schräg, QPU quer), dazu
// Linien für Abschnitte nach Länge (Blaue Zone, Güterumschlag). Die Flächen hier sind also angenommen. Darum kommen die Felder nie in die
// Rechnung wie die Flächen von Bern und Luzern (daten/parkkataster.ts), sondern nur als Vorschlag in die App; erst «bestätigen» legt ein Feld als
// Hindernis in den Fall. Abfrage und Antwort in LV95, CORS offen, Lizenz CC0.
//
// Annahmen für die Fläche:
// - Masse je Anordnung wie die Vorschläge aus OSM (Tiefe 2,0, 4,5 und 5,0 m); Länge eines Felds längs 5,0 m, schräg und quer 2,5 m. Gemessen
//   liegen die Punkte einer Reihe im Mittel 5,8 m (längs), 2,6 m (schräg) und 2,4 m (quer) auseinander.
// - Der Punkt ist die Mitte des Felds, die Richtung gibt das nächste Feld derselben Reihe (Kennung davnr) bis NACHBAR_M.
// - Ohne Nachbar ist die Richtung unbekannt: Quadrat von 2 × 2 m wie im VeloroutenCheck.
// - Linien als Streifen von 2,0 m Breite, die Linie in der Mitte.

import { add, dist, einheit, rechts, sub, type P } from '../../../geo'
import { laengsPolygon, type ParkKlasse } from '../../../rechner/hindernisse'
import type { Vorschlag } from '../../../rechner/vorschlaege'
import { AbrufFehler, holeJson, type Abruf } from '../../holen'
import type { KatasterFeld } from '../../parkkataster'

export const ZH_PARK_SCHLUESSEL = 'parkZuerich'
export const ZH_PARK_NAME = 'Parkfelder Stadt Zürich (Vorschlag)'
export const ZH_PARK_QUELLE = 'Stadt Zürich, öffentlich zugängliche Parkplätze'
export const ZH_PARK_LIZENZ = 'CC0, Stadt Zürich'
/** Quelle eines bestätigten Felds als Text; gleicher Wortlaut wie rechner/hindernisse.ts im SichtweitenCheck */
export const ZH_PARK_FLAECHE = 'Stadt Zürich, Fläche angenommen'
export const ZH_PARK_ANNAHME = 'Der Dienst führt nur Punkte und Linien: Lage und Grösse der Fläche sind angenommen (längs 5 × 2 m, schräg 2,5 × 4,5 m, quer 2,5 × 5 m, ' +
  'ausgerichtet am Nachbarfeld; ohne Nachbar 2 × 2 m; Linien als Streifen von 2 m)'
const GRUND = `${ZH_PARK_QUELLE} – Vorschlag, zählt erst nach Bestätigung. Fläche angenommen, vor Ort bzw. im Luftbild prüfen`
const PRAEFIX = 'zhpark'
const WFS = 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/oeffentlich_zugaengliche_Parkplaetze_DAV'
const TYP_PUNKTE = 'oeff_strassenparkierung_dav_p', TYP_LINIEN = 'oeff_strassenparkierung_dav_l'

/** Annahme: Länge und Tiefe eines Felds je Anordnung [m] */
const MASSE: Record<string, [number, number]> = { LPU: [5, 2], SCHPU: [2.5, 4.5], QPU: [2.5, 5] }
const MASSE_UNBEKANNT = MASSE.LPU
/** Annahme: Ein Feld derselben Reihe gibt bis zu diesem Abstand die Richtung */
const NACHBAR_M = 12
const QUADRAT_M = 2
const STREIFEN_M = 2

interface Roh { crs?: { properties?: { name?: string } }; features?: { geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> | null }[] }

export const istZhParkId = (id: string) => id.startsWith(`${PRAEFIX}:`)
export const zhParkUrl = (typ: string, mitte: P, radiusM: number) => `${WFS}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=${typ}&SRSNAME=EPSG:2056` +
  `&BBOX=${mitte[0] - radiusM},${mitte[1] - radiusM},${mitte[0] + radiusM},${mitte[1] + radiusM},EPSG:2056&OUTPUTFORMAT=application/vnd.geo%2Bjson`

const istP = (x: unknown): x is P => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1])
const klasseVon = (art: string): ParkKlasse => (/motorrad/i.test(art) ? 'motorrad' : /velo/i.test(art) ? 'velo' : 'auto')
const istLv95 = (r: Roh) => !r.crs || /(^|[^0-9])2056$/.test(r.crs.properties?.name ?? '')

/** Rechteck um die Mitte p: Länge entlang u, Tiefe quer dazu */
function rechteck(p: P, u: P, laenge: number, tiefe: number): P[] {
  const a = einheit(u), q = rechts(a), l = laenge / 2, t = tiefe / 2
  return [add(add(p, a, l), q, t), add(add(p, a, -l), q, t), add(add(p, a, -l), q, -t), add(add(p, a, l), q, -t)]
}

/** Antwort des Dienstes -> Felder mit angenommener Fläche */
export function zhParkFelder(punkte: Roh, linien: Roh): KatasterFeld[] {
  if (!istLv95(punkte) || !istLv95(linien)) throw new AbrufFehler('Antwort nicht in LV95 (EPSG:2056)')
  const felder = (punkte.features ?? []).flatMap(f => {
    const g = f.geometry, pr = f.properties ?? {}
    const ps = (g?.type === 'MultiPoint' ? g.coordinates : g?.type === 'Point' ? [g.coordinates] : []) as unknown[]
    return ps.filter(istP).map((p, k) => ({ p, k, oid: pr.objectid, reihe: String(pr.davnr ?? ''), art: String(pr.art ?? ''), strasse: String(pr.bezeichnung ?? ''),
      nr: pr.parkfeldnummer, anordnung: String(pr.orientierung ?? '') }))
  })
  const aus: KatasterFeld[] = felder.map(f => {
    const nachbar = felder.filter(x => x !== f && x.reihe === f.reihe && dist(x.p, f.p) <= NACHBAR_M && dist(x.p, f.p) > 0.1)
      .sort((a, b) => dist(a.p, f.p) - dist(b.p, f.p))[0]
    const [laenge, tiefe] = MASSE[f.anordnung] ?? MASSE_UNBEKANNT
    const ring = nachbar ? rechteck(f.p, sub(nachbar.p, f.p), laenge, tiefe) : rechteck(f.p, [1, 0], QUADRAT_M, QUADRAT_M)
    return { id: `${PRAEFIX}:p:${f.oid}:${f.k}`, klasse: klasseVon(f.art), ring,
      name: `Parkfeld ${f.art}${f.strasse ? `, ${f.strasse}` : ''}${f.nr != null ? `, Feld ${f.nr}` : ''}` }
  })
  for (const f of linien.features ?? []) {
    const g = f.geometry, pr = f.properties ?? {}
    const teile = (g?.type === 'MultiLineString' ? g.coordinates : g?.type === 'LineString' ? [g.coordinates] : []) as unknown[][]
    teile.forEach((t, k) => {
      const linie = t.filter(istP)
      const typ = String(pr.typ ?? 'Parkierung')
      if (linie.length >= 2) aus.push({ id: `${PRAEFIX}:l:${pr.objectid}:${k}`, klasse: klasseVon(typ), ring: laengsPolygon(linie, STREIFEN_M),
        name: `Parkierung ${typ}${typeof pr.laenge === 'number' ? `, ${String(pr.laenge).replace('.', ',')} m` : ''}` })
    })
  }
  return aus
}

/** Stand des Datensatzes aus der Antwort (Feld stand), als Datum wie die übrigen Quellen */
const standAus = (r: Roh): string | undefined => {
  const s = r.features?.[0]?.properties?.stand
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('.') : undefined
}

export async function ladeParkZuerich(mitte: P, radiusM: number, signal?: AbortSignal): Promise<Abruf<KatasterFeld[]>> {
  const [p, l] = await Promise.all([TYP_PUNKTE, TYP_LINIEN].map(t => holeJson<Roh>(zhParkUrl(t, mitte, radiusM), {}, 30000, signal)))
  const stand = standAus(p.daten)
  return { daten: zhParkFelder(p.daten, l.daten), ms: Math.max(p.ms, l.ms), bytes: p.bytes + l.bytes, quelle: p.quelle, ...(stand ? { datenstand: stand } : {}) }
}

/** Offene Vorschläge: Felder in Reichweite der Rechnung (Eingang) ohne bestätigte und ohne verworfene */
export function zhParkVorschlaege(inReichweite: readonly Vorschlag[], hindernisse: readonly { id: string }[], verworfen: Readonly<Record<string, unknown>>): Vorschlag[] {
  const da = new Set(hindernisse.map(h => h.id))
  return inReichweite.filter(v => !da.has(v.id) && !verworfen[v.id]).map(v => ({ ...v, grund: GRUND }))
}
