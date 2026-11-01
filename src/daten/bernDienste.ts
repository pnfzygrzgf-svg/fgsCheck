// ── Weitere Dienste des Geoportals Stadt Bern für die Vorbelegung (Automatik Paket C, 21.10.2026): Liste für App und Quellen ──
//
// Je Dienst: Name in «Geladene Quellen», Quellenangabe (Fusszeile, Fall-Datei quellen.<Schlüssel>), Zeile im Bericht, Laden
// (Rechteck ±radiusM um den Ladeort), Kurztext der geladenen Objekte und was ohne den Dienst gilt. Geladen wie Haltestellen und
// Verkehrsdaten: nur wenn die AV-Fläche am Ladeort in der Stadt Bern liegt (bernZustaendig), parallel, nicht blockierend, Fehler
// je Dienst getrennt. Die Schlüssel sind zugleich die Schlüssel in Fall.quellen.

import { GEODATEN_BERN, GEOPORTAL_BERN } from './geoportal'
import type { Abruf } from './holen'
import { ladeRichtplanBern, type RichtplanDaten } from './richtplanFussverkehr'
import { ladeStrassenhierarchieBern, type StrassenhierarchieDaten } from './strassenhierarchie'
import { ladeVsigBern, type VsigDaten } from './vsig'
import { ladeSchulenBern, type SchulenBernDaten } from './schulen'
import { SCHULEN_OSM_RADIUS_M } from './osm'
import { ladeTaktilBern, type TaktilDaten } from './taktil'
import { ladeNutzungszonenBern, type NutzungszonenDaten } from './nutzungszonen'
import { ladeOevLinienBern, type OevLinienDaten } from './oevLinien'

export interface BernDatenC {
  richtplan: RichtplanDaten
  strassenhierarchie: StrassenhierarchieDaten
  vsig: VsigDaten
  schulen: SchulenBernDaten
  taktil: TaktilDaten
  nutzungszonen: NutzungszonenDaten
  oevLinien: OevLinienDaten
}
export type BernDienstKey = keyof BernDatenC

export interface BernDienst<T> {
  /** Kennung im Quellenregister (daten/quellenregister.ts) */
  quelleId: string
  /** Name in «Geladene Quellen» (ohne Ausschnitt) */
  name: string
  /** Quellenangabe (Fusszeile, Fall-Datei) */
  quelle: string
  /** Inhalt im Bericht (Quellen), ohne Quellenangabe */
  bericht: string
  laden: (lat: number, lon: number, radiusM: number, signal?: AbortSignal) => Promise<Abruf<T> & { hinweis?: string | null }>
  objekte: (d: T) => string
  /** was ohne den Dienst gilt (Fehlermeldung in «Geladene Quellen») */
  ohne: string
  /** eigener Ausschnitt ±radiusM (sonst der gemeinsame der App), z. B. Schulen: Umkreis 150 m um den Streifen mit Rand */
  radiusM?: number
}

const n = (x: unknown[] | null, eins: string, mehr: string) => (x ? `${x.length} ${x.length === 1 ? eins : mehr}` : `${mehr}: –`)

/** Reihenfolge der Dienste (Laden, Quellen-Tabelle, Fusszeile, Bericht) */
export const BERN_C_KEYS: BernDienstKey[] = ['richtplan', 'strassenhierarchie', 'vsig', 'schulen', 'taktil', 'nutzungszonen', 'oevLinien']

export const BERN_DIENSTE_C: { [K in BernDienstKey]: BernDienst<BernDatenC[K]> } = {
  richtplan: { quelleId: 'bern.richtplan', name: 'Richtplan Fussverkehr Stadt Bern', quelle: `${GEODATEN_BERN}, Richtplan Fussverkehr`,
    bericht: 'Basisnetz Fussverkehr und publikumsattraktive Bereiche', laden: ladeRichtplanBern,
    objekte: d => `${n(d.basisnetz, 'Basisnetz-Linie', 'Basisnetz-Linien')}, ${n(d.publikum, 'Fläche', 'Flächen')}`, ohne: 'Fusswegnetz bleibt offen' },
  strassenhierarchie: { quelleId: 'bern.strassen', name: 'Strassenhierarchie und Strassentypen Stadt Bern', quelle: `${GEODATEN_BERN}, Strassenhierarchie und Strassentypen`,
    bericht: 'Strassenhierarchie (Typ) und Strassentypen', laden: ladeStrassenhierarchieBern,
    objekte: d => `${n(d.hierarchie, 'Abschnitt', 'Abschnitte')}, ${n(d.typen, 'Strassentyp', 'Strassentypen')}`, ohne: 'Strassentyp bleibt offen' },
  vsig: { quelleId: 'bern.vsig', name: 'Signalisierte Höchstgeschwindigkeit Stadt Bern', quelle: `${GEODATEN_BERN}, Signalisierte Höchstgeschwindigkeit`,
    bericht: 'Signalisierte Höchstgeschwindigkeit', laden: ladeVsigBern, objekte: d => n(d.linien, 'Abschnitt', 'Abschnitte'),
    ohne: 'Tempo nur aus OSM' },
  schulen: { quelleId: 'bern.schulen', name: 'Volksschulen und Kindergärten Stadt Bern', quelle: `${GEODATEN_BERN}, Volksschulen und Kindergärten`,
    bericht: 'Volksschulen und Kindergärten', laden: ladeSchulenBern,
    objekte: d => `${n(d.volksschulen, 'Volksschule', 'Volksschulen')}, ${n(d.kindergaerten, 'Kindergarten', 'Kindergärten')}`,
    ohne: 'Schulen nur aus OSM', radiusM: SCHULEN_OSM_RADIUS_M },
  taktil: { quelleId: 'bern.taktil', name: 'Taktil-visuelle Markierungen Stadt Bern', quelle: `${GEODATEN_BERN}, Taktil-visuelle Markierungen`,
    bericht: 'Taktil-visuelle Markierungen (Felder und Linien)', laden: ladeTaktilBern,
    objekte: d => `${n(d.felder, 'Feld', 'Felder')}, ${n(d.linien, 'Linie', 'Linien')}`, ohne: 'Markierungen bleiben offen' },
  nutzungszonen: { quelleId: 'bern.zonen', name: 'Nutzungszonenplan Stadt Bern', quelle: `${GEODATEN_BERN}, Nutzungszonenplan`,
    bericht: 'Nutzungszonenplan (Grundzonen)', laden: ladeNutzungszonenBern, objekte: d => n(d.flaechen, 'Zone', 'Zonen'),
    ohne: 'Nutzung bleibt offen' },
  oevLinien: { quelleId: 'bern.oev', name: 'ÖV-Linien Stadt Bern', quelle: `${GEODATEN_BERN}, ÖV-Linien`, bericht: 'ÖV-Linien (Bus, Tram)',
    laden: ladeOevLinienBern, objekte: d => n(d.linien, 'Linie', 'Linien'), ohne: 'Bus oder Tram bleibt offen' },
}

/** Zeile «Geladene Quellen»: Name mit Herkunft und Ausschnitt */
export const bernDienstName = (k: BernDienstKey, radiusM: number) => `${BERN_DIENSTE_C[k].name} (${GEOPORTAL_BERN}, ±${radiusM} m)`
/** Zeile im Bericht (Quellen) */
export const bernDienstBericht = (k: BernDienstKey) =>
  `${BERN_DIENSTE_C[k].bericht} (Vorbelegung Bedarf): ${BERN_DIENSTE_C[k].quelle} (${GEOPORTAL_BERN}, ArcGIS REST map.bern.ch)`
