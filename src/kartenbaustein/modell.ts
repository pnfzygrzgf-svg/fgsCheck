// ── Gemeinsame Form der Kartenebenen ──
// Alle Rechner zeichnen dieselben Objekte in LV95. Was ein Rechner intern anders hält, bringt er vor der Karte in diese Form.

export type P = [number, number]           // LV95 [E, N]

/** Ein Objekt einer Kartenebene: Linie(n), Punkt oder Fläche, mit Klasse (Farbe), Beschriftung und Text für den Tooltip */
export interface KartenObjekt<H = unknown> {
  id: string
  linien?: P[][]
  punkt?: P
  ringe?: P[][]
  klasse: string
  wert?: string             // kurze Beschriftung (Tempo, DTV, Neigung)
  text: string              // Tooltip
  profil?: true
  hoehenprofil?: H
  quelle?: string
  quellenSchluessel?: string
  datenstand?: string       // Stand der Ebene aus dem gespeicherten Ausschnitt
  gestrichelt?: boolean     // Ersatzquelle, zum Beispiel OSM statt amtlich
  deckkraft?: number        // Füllung einer Fläche (Standard 0,3)
  symbol?: string           // Zeichen eines Punkts, wenn es nicht aus der Legende kommt
}

/** Eintrag der Legende: Klasse, Farbe, Text und bei Punkten das Zeichen im Quadrat */
export type LegendenEintrag = readonly [klasse: string, farbe: string, text: string, symbol?: string]
