import type { P } from '../../../geo'

export interface AmtlicherHalt {
  id: string
  nummer: string
  name: string
  p: P
  art: 'bus' | 'tram' | 'bus_tram'
}
export interface BavSnapshot {
  version: 1
  quelleId: 'bav.halt'
  abgerufen: string
  /** Stand der gesamten Ebene laut offizieller Legende, kein Änderungsdatum des einzelnen Halts. */
  datenstand: string | null
  datenstandQuelle?: string
  datenstandHinweis?: string
  mitte: P
  radiusM: number
  url: string
  /** Abfrage vollständig abgearbeitet; die fachliche Vollständigkeit des Inventars ist nicht belegt. */
  vollstaendigkeit: 'unbekannt'
  halte: AmtlicherHalt[]
}
export interface Gemeinde { bfs: number; kanton: string; name: string }
export interface GebietSnapshot {
  version: 1
  quelleId: 'swisstopo.gebiet'
  abgerufen: string
  jahr: number
  mitte: P
  radiusM: number
  amOrt: Gemeinde[]
  imAusschnitt: Gemeinde[]
}
export interface AmtlicheQuellen { bav?: BavSnapshot; gebiet?: GebietSnapshot }
export type Stand<T> = { laedt: true } | { daten: T } | { fehler: string } | { offen: true }
export interface OrtQuellenStand { bav: Stand<BavSnapshot>; gebiet: Stand<GebietSnapshot> }
