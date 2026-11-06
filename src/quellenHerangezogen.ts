// ── Quellen im Bericht: nur, was für diesen Fall herangezogen wurde (06.11.2026) ──
//
// Die App lädt um den Ort herum alle Dienste, die es dort gibt (Fall.quellen). Der Bericht nennt aber nur die Quellen, die in die
// Sichtprüfung oder in den Bedarf dieses Falls eingeflossen sind:
// - immer: amtliche Vermessung, OpenStreetMap, Luftbild SWISSIMAGE (Kartenbild);
// - Baum- bzw. Parkfeldkataster nur, wenn ein Hindernis daraus im Fall liegt (übernommener Vorschlag);
// - Höhenmodelle nur, wenn ein Profil gerechnet wurde (App.hoehenGenutzt), Übergang aus dem Luftbild und amtlicher Übergang, wenn gesetzt;
// - Bedarf: je Feld die Quelle, die den Wert liefert, also die gewählte Datenquelle einer Handeingabe, die Vorgabe unter den Quellenoptionen
//   oder, bei einer Vorbelegung aus dem Geoportal, der Dienst, der das Feld füllt (GEOPORTAL_FELD_KEYS), auch bei einer Annahme, die sich
//   auf das Geoportal stützt (ANNAHME_FELD_KEYS); «app.*» ist keine Quelle, «osm.*» ist OpenStreetMap.
// Nicht genannt: Dienste, die nur dem Kartenkontext dienen (Höhenkurven, E6-Kontext), die Gebietsbestimmung und Dienste, deren Daten
// kein Feld dieses Falls gefüllt haben.

import type { Fall } from './fall'
import type { BefundBlatt } from './bedarf/befundblatt'
import { QUELLE_JE_SCHLUESSEL, genutzteQuellen } from './Datenlage'
import { BAUMKATASTER } from './daten/baumkataster'
import { PARKKATASTER } from './daten/parkkataster'

/** Feld der Bedarfsmaske -> Schlüssel in Fall.quellen der Geoportal-Dienste, die es vorbelegen (Quelle «geoportal»). «beduerfnis» kommt
 *  aus Schulen bzw. Haltestellen, Haltestellenfelder aus dem Haltestellendienst */
export const GEOPORTAL_FELD_KEYS: Readonly<Record<string, readonly string[]>> = {
  vSig: ['vsig'], tempoRegime: ['vsig'], dtv: ['verkehrsdaten'], netz: ['richtplan'], netzQualifiziert: ['richtplan'], taktil: ['taktil'],
  leitlinie: ['taktil'], 'q3.gewerbe': ['nutzungszonen'], 'q3.linienbus': ['oevLinien'], strassentyp: ['strassenhierarchie'],
  beduerfnis: ['schulen', 'haltestellen'], haltestelleAngrenzend: ['haltestellen'], tramHaltestellenbereich: ['haltestellen'],
}
/** Felder, die der Rechner aus einem Geoportal-Dienst als Annahme ableitet (Quelle «annahme», im Text «Geoportal»), etwa «kein taktiles Feld
 *  laut Geoportal»: Der Dienst ist herangezogen, auch wenn er nichts gefunden hat. Annahmen aus OSM nennen das Geoportal nicht */
const ANNAHME_FELD_KEYS: Readonly<Record<string, readonly string[]>> = {
  taktil: ['taktil'], leitlinie: ['taktil'], tempoRegime: ['strassenhierarchie'], innerorts: ['vsig'], 'q3.bebaut': ['nutzungszonen'],
  beduerfnis: ['schulen'], dtv: ['verkehrsdaten'],
}
const geoportalKeys = (pfad: string): readonly string[] => GEOPORTAL_FELD_KEYS[pfad] ?? (pfad.startsWith('haltestelle') ? ['haltestellen'] : [])

/** Kennung einer Datenquelle eines Felds im Register: «osm.*» ist OpenStreetMap, «app.*» keine Quelle */
const registerId = (id: string): string | null => (id.startsWith('osm.') ? 'osm' : id.startsWith('app.') ? null : id)

/** Kennungen der Quellen, die ein Feld des Bedarfs dieses Falls gefüllt haben */
export function bedarfQuellenIds(blaetter: readonly BefundBlatt[], quellen: Readonly<Record<string, unknown>>): Set<string> {
  const ids = new Set<string>()
  const add = (id: string | null | undefined) => { const r = id ? registerId(id) : null; if (r) ids.add(r) }
  for (const b of blaetter) for (const [pfad, h] of b.gebildet.herkunft) {
    if (h.zustand === 'hand') { add(h.datenquelle?.id); continue }
    if (h.zustand !== 'vorbelegt' || !h.vorbelegt) continue
    const v = h.vorbelegt
    const vorgabe = v.quellenOptionen?.find(q => q.vorgabe)
    if (vorgabe) { add(vorgabe.id); continue }
    if (v.quelle === 'geoportal') { for (const k of geoportalKeys(pfad)) if (quellen[k]) add(QUELLE_JE_SCHLUESSEL[k]) }
    else if (v.quelle === 'annahme' && v.text.includes('Geoportal')) { for (const k of ANNAHME_FELD_KEYS[pfad] ?? []) if (quellen[k]) add(QUELLE_JE_SCHLUESSEL[k]) }
    else if (v.quelle === 'osm') add('osm')
    else if (v.quelle === 'av') add('av')
    else if (v.quelle === 'amtlich') add(v.quellenOptionen?.[0]?.id)
  }
  return ids
}

/** Kennungen der herangezogenen Quellen eines Falls (Reihenfolge: Sichtprüfung, dann Bedarf), ohne Doppel */
export function herangezogeneQuellen(fall: Fall, blaetter: readonly BefundBlatt[], hoehen: readonly string[]): string[] {
  const basis: Record<string, unknown> = {}
  for (const k of ['av', 'osm', 'luftbild'] as const) if (fall.quellen[k]) basis[k] = fall.quellen[k]
  if (fall.hindernisse.some(h => h.quelle === 'kataster' && h.art === 'baum')) basis.baumkataster = true
  if (fall.hindernisse.some(h => h.quelle === 'kataster' && h.art === 'parkfeld')) basis.parkkataster = true
  if (fall.ort.amtlich) basis[`regional.${fall.ort.amtlich.quelleId}`] = true
  const ids = genutzteQuellen(basis, { herkunftP: fall.ort.herkunft?.p ?? null, hoehen })
  return [...new Set([...ids, ...bedarfQuellenIds(blaetter, fall.quellen)])]
}

/** Kennungen der Kataster (für die Zusatzzeilen des Berichts) */
export const BAUMKATASTER_ID = BAUMKATASTER[0].quelleId
export const PARKKATASTER_ID = PARKKATASTER[0].quelleId
