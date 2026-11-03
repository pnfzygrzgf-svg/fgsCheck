// Gemeinsame Datenformen und Anbieter-Vertrag. E0 beschreibt nur den bereits vorhandenen Tempo-Anbieter;
// weitere Formate und Themen werden erst mit dem jeweiligen Anbieter ergänzt. Keine Rechen- oder Oberflächenlogik.
import type { P } from '../../geo'
import type { Abruf } from '../holen'
import type { Quelle, Thema } from '../quellenregister'

export interface TempoLinie {
  id: string
  strasse: string
  /** km/h, null ohne Angabe */
  vSig: number | null
  teile: P[][]
  /** Tempo des Amts für Umwelt, nur für den Hinweis bei einem Widerspruch */
  vAfu?: number | null
}

export interface TempoDaten { linien: TempoLinie[] }

export interface Anbieter<Roh, Daten> {
  /** Bestehender Quellenregister-Eintrag: Gebiet, Anbieter, Lizenz, Empfänger und Datenschutz bleiben dort gepflegt. */
  quelle: Quelle
  thema: Thema
  format: 'geojson'
  datenart: 'signalisiert' | 'erfasst' | 'modelliert'
  /** Fachlicher Datenstand; null, wenn die Antwort keinen Stand liefert. Abrufzeit ist kein Datenstand. */
  datenstand: string | null
  abdeckung: {
    inhalt: string
    einschraenkungen: readonly string[]
    vollstaendigkeit: 'unbekannt'
  }
  url: (lat: number, lon: number, radiusM: number) => string
  umwandeln: (roh: Roh) => Daten
  laden: (lat: number, lon: number, radiusM: number, signal?: AbortSignal) => Promise<Abruf<Daten>>
}
