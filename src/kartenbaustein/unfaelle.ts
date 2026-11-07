import { ladeBundAusschnitt } from './bund'
import { UNFALL_EBENE, maskiert, unfallUrl } from './quellenLink'

/** Unfälle sind im Kartenbild nur Pixel: Ab dieser Zoomstufe lädt die App die Punkte im Ausschnitt für Tooltip und Klick.
 *  Weiter draussen sind es in Zürich bis 8000 Unfälle je Ausschnitt, und die Symbole liegen ohnehin übereinander. */
export const UNFALL_ZOOM = 17
/** Die drei Ebenen der Quelle, Titel in allen Rechnern gleich */
export const UNFALL_TITEL: Readonly<Record<string, string>> = { 'regional.bund.unfaelle': 'Unfälle mit Personenschaden (ASTRA)', unfaelleFuss: 'Unfälle mit Fussgängerbeteiligung (ASTRA)', unfaelleVelo: 'Unfälle mit Velobeteiligung (ASTRA)' }
export const UNFALL_HINWEIS = `Ab Zoomstufe ${UNFALL_ZOOM} zeigen die Punkte beim Überfahren und Anklicken die Angaben zum Unfall.`
/** So viele Unfälle zeigt der Tooltip, der Klick zeigt alle */
export const UNFALL_TIP_MAX = 3
export type UnfallArt = 'alle' | 'fussgaenger' | 'fahrraeder'
export interface UnfallPunkt { id: string; p: [number, number]; titel: string; angaben: string; url: string }
type Roh = { results?: { featureId?: string | number; id?: string | number; geometry?: { coordinates?: unknown } | null; properties?: Record<string, unknown> }[]; exceededTransferLimit?: boolean }

/** Die eingeschalteten Unfall-Ebenen einer Ebenenliste */
export const unfallEbenen = (an: ReadonlySet<string>): { layer: string; art: UnfallArt }[] =>
  Object.entries(UNFALL_EBENE).filter(([id]) => an.has(id)).map(([, layer]) => ({ layer, art: layer.split('_').pop() as UnfallArt }))

/** Antwort des Bundesdienstes lesen; unvollständige Einträge fallen weg */
export function unfallPunkte(roh: Roh, art: UnfallArt): UnfallPunkt[] {
  return (roh.results ?? []).flatMap(f => {
    const id = f.featureId ?? f.id, c = f.geometry?.coordinates, p = f.properties ?? {}
    if (id === undefined || !Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return []
    const beteiligt = [p.involving_pedestrian ? 'Fussverkehr' : '', p.involving_bicycle ? 'Velo' : '', p.involving_motorcycle ? 'Motorrad' : ''].filter(Boolean)
    const zeit = [[p.accidentmonth_de, p.accidentyear].filter(Boolean).join(' '), p.accidentday_de, p.accidenthour_text].filter(Boolean).join(', ')
    const angaben = [zeit, p.severitycategory_de, p.roadtype_de, beteiligt.length ? `mit ${beteiligt.join(', ')}` : ''].filter(Boolean).join(' · ')
    return [{ id: String(id), p: [c[0], c[1]] as [number, number], titel: String(p.accidenttype_de ?? '') || 'Unfall', angaben, url: unfallUrl(String(id), [c[0], c[1]], art) }]
  })
}

export const ladeUnfaelle = async (a: { layer: string; art: UnfallArt }, box: string, signal?: AbortSignal): Promise<UnfallPunkt[]> =>
  unfallPunkte({ results: await ladeBundAusschnitt(a.layer, box, signal) }, a.art)

/** Alle Unfälle im Umkreis r (Meter), der nächste zuerst: An Knoten liegen oft mehrere unter einem Symbol */
export function unfaelleAm(liste: UnfallPunkt[], p: readonly [number, number], r: number): UnfallPunkt[] {
  return liste.map(u => ({ u, d: Math.hypot(u.p[0] - p[0], u.p[1] - p[1]) })).filter(x => x.d <= r).sort((a, b) => a.d - b.d).map(x => x.u)
}

/** Inhalt von Tooltip (kurz) und Fenster beim Klick (alle Unfälle, je mit Link zur Quelle) */
export function unfallHtml(liste: UnfallPunkt[], mitLink: boolean): string {
  const zeigen = mitLink ? liste : liste.slice(0, UNFALL_TIP_MAX), mehr = liste.length - zeigen.length
  const eintrag = (u: UnfallPunkt) => `<div class="unfall-eintrag"><b>${maskiert(u.titel)}</b><br>${maskiert(u.angaben)}` +
    (mitLink ? `<br><a href="${maskiert(u.url)}" target="_blank" rel="noopener noreferrer">Auf map.geo.admin.ch ansehen ↗</a>` : '') + '</div>'
  return (liste.length > 1 ? `<div class="unfall-kopf">${liste.length} Unfälle an dieser Stelle</div>` : '') + zeigen.map(eintrag).join('') +
    (mehr ? `<div class="unfall-mehr">und ${mehr} weitere; Klick zeigt alle</div>` : '') + '<div class="unfall-fuss">Lage anonymisiert · © ASTRA</div>'
}

/** Datenstand der Ebene aus der Legende von geo.admin.ch */
export function astraStand(html:string):string {
  const m=html.match(/<td[^>]*>\s*Datenstand\s*<\/td>\s*<td[^>]*>\s*(\d{2})\.(\d{2})\.(\d{4})\s*<\/td>/i)
  if(!m)return 'unbekannt (Dienst liefert keinen verwendbaren Datenstand)'
  const iso=`${m[3]}-${m[2]}-${m[1]}`,t=Date.parse(iso)
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===iso?`${m[1]}.${m[2]}.${m[3]} (Ebene laut geo.admin.ch)`:'unbekannt (Datum ungültig)'
}
export async function ladeAstraStand(layer:string,signal?:AbortSignal):Promise<string> {
  const res=await fetch(`https://api3.geo.admin.ch/rest/services/api/MapServer/${layer}/legend?lang=de`,{signal,cache:'no-store'})
  if(!res.ok)throw new Error(`ASTRA Metadaten: HTTP ${res.status}`)
  return astraStand(await res.text())
}
