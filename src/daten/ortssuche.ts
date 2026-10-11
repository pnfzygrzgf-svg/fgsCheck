// ── Ortssuche über den SearchServer von swisstopo (api3.geo.admin.ch): Adressen, Strassen, Ortsnamen, Gemeinden, PLZ ──
//
// Antwort (geprüft 11.10.2026, ohne sr): results[].attrs mit origin (address, gazetteer, gg25, zipcode), label (HTML mit <b>,
// <i>, teils Zeilenumbruch), lat/lon (WGS84), geom_st_box2d (LV03). Strassen ohne Hausnummer kommen als address mit «#»
// («Mühlemattstrasse # <b>4112 Bättwil</b>»). Liechtenstein ist abgedeckt (Adressen, Gemeinden, Ortsnamen). CORS offen
// (Access-Control-Allow-Origin: *). Parzellen (parcel), Bezirke und Kantone werden nicht angefragt.
// Nutzung nach geo.admin.ch (Fair Use): Abfrage erst nach einer Tipp-Pause (Ortssuche.tsx), alte Anfragen werden abgebrochen.

import { holeJson } from './holen'

export const SUCHE_URL = 'https://api3.geo.admin.ch/rest/services/api/SearchServer'
export const SUCHE_ORIGINS = 'address,gazetteer,gg25,zipcode'
export const SUCHE_LIMIT = 8

export type OrtArt = 'adresse' | 'strasse' | 'ort' | 'gemeinde' | 'plz'
export interface Ort { text: string; art: OrtArt; zusatz: string; lat: number; lon: number }

interface RohTreffer { attrs?: { origin?: string; label?: string; lat?: number; lon?: number } }

const ENTITAETEN: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** HTML-Tags entfernen, Entitäten auflösen, Leerraum zusammenfassen (Text wird nur als Text angezeigt, nie als HTML) */
export function ohneHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
      }
      return ENTITAETEN[e.toLowerCase()] ?? m
    })
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ').trim()
}

/**
 * Objektart der Ortsnamen (swissNAMES3D, <i>-Teil) lesbar: der Dienst schreibt ohne Umlaute («Gebaeude», «Fliessgewaesser»,
 * «Haupthuegel», «Oeffentliches Parkareal», gesehen 11.10.2026) bzw. mit Zusatz «swisstopo» («Flurname swisstopo»). Kleine
 * Abbildung der häufigen Wortteile; übrige Werte unverändert.
 */
const ZUSATZ_LESBAR: [RegExp, string][] = [
  [/Gebaeude/g, 'Gebäude'], [/gebaeude/g, 'gebäude'], [/Gewaesser/g, 'Gewässer'], [/gewaesser/g, 'gewässer'],
  [/Huegel/g, 'Hügel'], [/huegel/g, 'hügel'], [/Huette/g, 'Hütte'], [/huette/g, 'hütte'], [/\bOeffentlich/g, 'Öffentlich'],
  [/\bUebergang/g, 'Übergang'], [/\s+swisstopo$/, ''],
]
export const zusatzLesbar = (z: string) => ZUSATZ_LESBAR.reduce((t, [re, neu]) => t.replace(re, neu), z)

/** Anzeige eines Treffers: Text, Art und Zusatz (z. B. «Ort», «Gebäude» aus dem <i>-Teil der Ortsnamen) */
export function ortLesen(origin: string, label: string): { text: string; art: OrtArt; zusatz: string } | null {
  if (origin === 'address') {
    // «Strasse Nr <b>PLZ Ort</b>», Strasse ohne Nummer mit «#»
    const [vorne, ...hinten] = label.split(/<b>/i)
    const strasse = ohneHtml(vorne), ort = ohneHtml(hinten.join(' '))
    const ohneNr = /(^|\s)#$/.test(strasse)
    const name = strasse.replace(/\s*#$/, '').trim()
    if (!name && !ort) return null
    return { text: [name, ort].filter(Boolean).join(', '), art: ohneNr ? 'strasse' : 'adresse', zusatz: ohneNr ? 'Strasse' : 'Adresse' }
  }
  const zusatz = zusatzLesbar(ohneHtml((label.match(/<i>([\s\S]*?)<\/i>/i) ?? ['', ''])[1]))
  const text = ohneHtml(label.replace(/<i>[\s\S]*?<\/i>/gi, ' '))
    .replace(/\s*\(\s*\)/g, '')                         // leere Kantonsklammer (Liechtenstein, «Vaduz ()»)
    .replace(/,(?=\S)/g, ', ')
    .replace(/ - /g, ' – ')
    .trim()
  if (!text) return null
  if (origin === 'gg25') return { text, art: 'gemeinde', zusatz: 'Gemeinde' }
  if (origin === 'zipcode') return { text, art: 'plz', zusatz: 'PLZ' }
  return { text, art: 'ort', zusatz: zusatz || 'Ort' }
}

/** Antwort des SearchServer -> Treffer (ohne Doppel gleicher Anzeige, nur mit gültigen Koordinaten) */
export function ortsTreffer(data: { results?: RohTreffer[] }): Ort[] {
  const aus: Ort[] = [], gesehen = new Set<string>()
  for (const r of data.results ?? []) {
    const a = r.attrs
    if (!a || typeof a.lat !== 'number' || typeof a.lon !== 'number' || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue
    const o = ortLesen(a.origin ?? '', a.label ?? '')
    if (!o) continue
    const k = `${o.art}|${o.text}|${o.zusatz}`
    if (gesehen.has(k)) continue
    gesehen.add(k)
    aus.push({ ...o, lat: a.lat, lon: a.lon })
  }
  return aus
}

/**
 * Zoomstufe nach der Art des Treffers. Adresse 19 wie die Startansicht (Übergang direkt anklickbar), Strasse 18 (der Punkt
 * liegt irgendwo an der Strasse, etwas Umgebung zeigen), Ortsname 17 (Dorf, Quartier, Haltestelle: Punkt im Zentrum),
 * Gemeinde und PLZ 16: die Grenze der automatischen Übergangssuche, damit die Suche sofort läuft und zugleich ein möglichst
 * grosser Teil des Zentrums zu sehen ist (bei grösseren Gemeinden liegt der Punkt nicht immer am Ort, der gesucht wird).
 */
export function ortZoom(art: OrtArt): number {
  return { adresse: 19, strasse: 18, ort: 17, gemeinde: 16, plz: 16 }[art]
}

/** Treffer zum Suchbegriff holen (signal: Abbruch, wenn weiter getippt wird) */
export async function sucheOrt(text: string, signal?: AbortSignal): Promise<Ort[]> {
  const url = `${SUCHE_URL}?type=locations&lang=de&origins=${SUCHE_ORIGINS}&limit=${SUCHE_LIMIT}&searchText=${encodeURIComponent(text)}`
  const r = await holeJson<{ results?: RohTreffer[] }>(url, {}, 10000, signal)
  return ortsTreffer(r.daten)
}
