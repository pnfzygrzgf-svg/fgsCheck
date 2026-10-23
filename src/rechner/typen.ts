// ── Ergebnis-Typen der Rechnung (entsprechen den Spalten von sichtpruefung.csv, soweit in der App vorhanden) ──

import type { P } from '../geo'
import type { Multi, Poly } from './poly'
import type { Entfallen } from './zufahrten'
import type { Vermassung } from './vermassung'
import type { Erkennung } from './erkennung'

export interface Konflikt {
  klasse: 'auto' | 'velo' | 'motorrad' | 'gebaeude' | 'baum' | 'hindernis'
  flaeche: number; abstand: number; geom: Multi; layer: string; id?: string
}

export interface ZufahrtErgebnis {
  fgsId: string
  zufahrt: string                 // Schlüssel wie in der Berner Karte: gerade = Richtung, abbiegend = a + Richtung
  kennung: string                 // w<wid>± bzw. k<nid>:w<wid>±
  richtung: number
  art: string                     // beide | einbahn | insel | abbiegend
  strasse: string | null
  ueberStrasse: string | null
  knotenM: number | null
  tempo: number
  tempoQuelle: string
  sichtweite: number
  sichtweiteQuelle: string
  kurvenradiusM: number | null
  radiusQuelle: string | null
  status: string                  // frei | verdeckt | verdeckt_gebaeude | verdeckt_hindernis | verdeckt_baum | verdeckt_zweirad
  nAuto: number; nZweirad: number; nGebaeude: number; nBaeume: number; nHindernisse: number
  ueberdeckungM2: number          // Auto-Parkfelder im Sichtfeld
  minAbstandAutoM: number | null  // kleinster Abstand Auto-Parkfeld – Streifen
  unter5m: boolean                // VRV Art. 18 Abs. 2e
  konflikte: Konflikt[]
  spurHinweis: string
  spurHinweisM: number | null
  fahrbahnM: number | null
  parkRechts: boolean | null
  parkLinks: boolean | null
  velostreifenRechtsM: number | null
  velostreifenLinksM: number | null
  abzugQuelle: string | null
  abzugRechtsM: number | null    // Abzug rechts (Parkierung bzw. Velostreifen-Linie ab der Bordkante)
  fahrstreifenM: number | null
  mehrstreifig: number | null
  sichtpunktVomRandM: number | null
  lageQuelle: string
  randQuelle: string
  einbahnQuelle: string | null
  netzQuelle: string
  osmWeg: string | null
  osmKnoten: string | null
  ersterKnotenM: number | null
  netzHinweis: string[]
  punkteVerschoben: number
  sichtpunkte: P[]
  feld: Multi
  spur: P[]
  annahmen: string[]              // in der App sichtbar gemachte Annahmen und Ersatzwerte
  /** Querung ohne Vortritt: Sichtfeld nur bis hier geprüft (Reichweite der geladenen Daten); sichtweite ist dann das Soll, darüber
   * nicht geprüft (ohneVortritt.REICHWEITE_SICHT_M) */
  geprueftBisM?: number
  fahrstreifenOsmN?: number | null  // Fahrstreifen dieser Richtung nach OSM (lanes, Busstreifen nach Regel), nur gerade Zufahrten mit
                                  // OSM-Weg (seit E1 Bedarfsmodul: Vorbelegung «Fahrstreifen je Richtung»; die Rechnung nutzt ihn nicht)
  /** Sichtfeld frei bis hier [m ab dem Streifenrand, entlang der Sichtpunkte, abgerundet] (Automatik Paket B, 21.10.2026; nur gerade
   * Zufahrten, zusätzliches Ausgabefeld ohne Einfluss auf Status und Soll): frei = geprüfte Länge (Soll bzw. geprueftBisM), verdeckt =
   * Länge bis zum ersten Sichtpunkt, dessen Sichtfeld einen der gemeldeten Konflikte trifft. Darüber hinaus nicht gerechnet */
  freiBisM?: number
  /** Erkennungsdistanz (Nutzerentscheid 23.10.2026; erkennung.ts): ab wie vielen Metern vor dem Streifen Fahrende die Markierung im
   * eigenen Fahrstreifen sehen, geprüft bis zum Doppelten der Sichtweite nach Tempo (höchstens 110 m) bzw. bis zum Ende der Fahrlinie.
   * Nur gerade Zufahrten von Fussgängerstreifen; 2D ohne Gelände (Annahme). Zusätzliches Ausgabefeld ohne Einfluss auf Status und Soll */
  erkennungM?: Erkennung
  deckung?: string                // Abbiegezufahrt, die ab dem Knoten von der geraden Zufahrt gedeckt ist (nur mit GEDECKT_RECHNEN,
                                  // seit 14.10.2026 standardmässig aus): Text wie beim Entfallen «Knoten … m vor dem Streifen; …»
}

export interface StreifenErgebnis {
  fgsId: string
  uebergangId: string
  p0: P; p1: P; bw: number; m: P
  umriss: P[]
  ann: [Poly, Poly]
  rand: [P, P]
  randQuelle: string
  strasse: string
  netzQuelle: string
  lsa: string
  lsaQuelle: string | null
  zufahrten: ZufahrtErgebnis[]
  entfallen: Entfallen[]
  status: string
  annahmen: string[]
  keinFgsHinweis?: string    // unmarkierter Übergang: Prüfung sinngemäss, ohne Normbezug
  markierungHinweis?: string // Markierung in OSM nicht belegt (crossing=uncontrolled): vermutlich FGS, bitte prüfen
  vermassung?: Vermassung    // Streifen von Hand: Lage (LV95) und Masse für den Plan (rechneFall)
  /** Querung ohne Vortritt (von Hand, Bedarfsmodul E1): Sichtweite nach VSS 40 240 Z. 8.2 statt Tab. 1; L = Querdistanz der
   * Teilquerung (ganzeFahrbahn: Insel nur markiert, L über die ganze Fahrbahn). Fehlt bei Fussgängerstreifen */
  querung?: { typ: QuerungOhneVortritt; L: number; ganzeFahrbahn: boolean }
  /** OSM-Tramgleis quert den Streifen (nur mit OSM-Netz; Vorbelegung Bedarfsmodul) */
  tram?: boolean
  /** Trottoirüberfahrt (Wahl am Streifen, 23.10.2026): angezeigt wie «kein FGS» (Status kein_fgs, ohne Zufahrten und ohne hier nicht
   * geprüfte Richtungen, keine Sicht auf die Wartefläche); massgebend ist die Knotensicht, die fgsCheck nicht rechnet */
  trottoirueberfahrt?: true
  /** Trottoirüberfahrt: Zufahrten und entfallene Richtungen der Rechnung (wie beim Fussgängerstreifen), nur für die Vorbelegung des
   * Bedarfs (Tempo, innerorts, Lage …), nicht für Sichtbefunde */
  nurVorbelegung?: { zufahrten: ZufahrtErgebnis[]; entfallen: Entfallen[] }
}

/** Querung ohne Vortritt: Furt (Insel ohne Balken) bzw. Nase, Einengung, ohne bauliche Massnahme */
export type QuerungOhneVortritt = 'furt' | 'ohne_vortritt'

export interface Rechnung {
  streifen: StreifenErgebnis[]
  meldungen: string[]
  ms: number
}
