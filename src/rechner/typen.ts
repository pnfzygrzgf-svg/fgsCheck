// ── Ergebnis-Typen der Rechnung (entsprechen den Spalten von sichtpruefung.csv, soweit in der App vorhanden) ──

import type { P } from '../geo'
import type { Multi, Poly } from './poly'
import type { Entfallen } from './zufahrten'
import type { Vermassung } from './vermassung'
import type { Erkennung } from './erkennung'
import type { KnotensichtAntwort } from '../tue/knotensicht'

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
  /** Querung ohne Vortritt bzw. in der Begegnungszone (30.10.2026): eine Annahme der App kürzt das Soll unter den Normwert (Abbieger
   * bis Beginn des Abbiegens, Gegenseite einer Einmündung bis zum nächsten Knoten); grenze: Text der Annahme, normM: ungekürzter Wert
   * nach VSS 40 240 Z. 8.2. Fehlt sonst */
  annahmeGrenze?: { grenze: string; normM: number }
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
  /** Sicht des Veloverkehrs (29.10.2026; VSS 40 241 Z. 14 mit VSS 40 273 Tab. 3): zweite Prüfung von der Veloachse, nur gerade Zufahrten
   * eines Fussgängerstreifens mit Radstreifen bzw. Radweg nach OSM. Zusätzliches Ausgabefeld ohne Einfluss auf Status und Soll */
  velo?: VeloSicht
  deckung?: string                // Abbiegezufahrt, die ab dem Knoten von der geraden Zufahrt gedeckt ist (nur mit GEDECKT_RECHNEN,
                                  // seit 14.10.2026 standardmässig aus): Text wie beim Entfallen «Knoten … m vor dem Streifen; …»
}

/** Sicht von der Veloachse einer Zufahrt (ZufahrtErgebnis.velo) */
export interface VeloSicht {
  fuehrung: 'radstreifen' | 'radweg'
  /** Veloachse ab dem rechten Fahrbahnrand [m] */
  vomRandM: number
  /** nötige Sichtweite nach VSS 40 273 Tab. 3 bei Längsneigung 0 % und ihre Herleitung; mit gemessener Neigung wählt
   * veloSicht.veloSoll die Spalte (die Rechnung prüft bis maxM, dem grössten Wert der Zeile) */
  soll: number; sollText: string
  frei: boolean
  /** Zeile der Tab. 3 nach dem signalisierten Tempo und so weit geprüft [m] */
  zeile: 'bis30' | 'ueber30'; maxM: number
  /** frei bis [m ab dem Streifenrand] (wie freiBisM), höchstens maxM */
  freiBisM: number
  /** Fahrlinie kürzer als das Soll: nur bis hier geprüft */
  bisM?: number
  /** über 30 km/h: mit Verbot für schnelle E-Bikes gälte eben 30 m (Tab. 3) */
  ebikeHinweis: boolean
  konflikte: Konflikt[]; feld: Multi; sichtpunkte: P[]
}

/** Annäherungsbereich eines Endes vor der Vorgabe von Hand (StreifenErgebnis.annBasis) */
export interface AnnBasis { rand: P; u: P; breite: number }
/** Annäherungsbereich eines Endes von Hand (Fall, StreifenHand.ann; 30.10.2026): Mitte entlang der Bordkante versetzt (m, positiv links
 * der Achse A→B, bezogen auf die Mitte des Streifenendes) und Breite (m); unabhängig von der Breite des Streifens */
export interface AnnHand { versatz: number; breite: number }
/** Breite des Annäherungsbereichs von Hand: mindestens, höchstens (m) */
export const ANN_HAND_BREITE: readonly [number, number] = [0.5, 15]
/** Versatz von Hand höchstens (m, Betrag) */
export const ANN_HAND_VERSATZ_MAX = 15

export interface StreifenErgebnis {
  fgsId: string
  uebergangId: string
  p0: P; p1: P; bw: number; m: P
  umriss: P[]
  ann: [Poly, Poly]
  /** Streifen von Hand (30.10.2026): Annäherungsbereich je Ende vor einer Vorgabe von Hand: Mitte auf der Bordkante, Richtung entlang der
   * Kante (positiver Versatz, links der Achse A→B) und Breite; Grundlage der Griffe auf der Karte und der Vorgabe von Hand (AnnHand) */
  annBasis?: [AnnBasis, AnnBasis]
  /** Annäherungsbereich je Ende von Hand vorgegeben (wie gerechnet; nur Streifen von Hand) */
  annHand?: [AnnHand | null, AnnHand | null]
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
  /** unmarkierte OSM-Querung ohne Wahl am Streifen (29.10.2026): als Querung ohne Vortritt angenommen (Text des Hinweises) */
  querungAnnahme?: string
  markierungHinweis?: string // Markierung in OSM nicht belegt (crossing=uncontrolled): vermutlich FGS, bitte prüfen
  /** Übergang aus dem Luftbild (ETH-Modell), nicht in OSM (daten/luftbildFgs.ts): Hinweis mit dem Befund der eigenen Erkennung */
  luftbildUebergang?: string
  vermassung?: Vermassung    // Streifen von Hand: Lage (LV95) und Masse für den Plan (rechneFall)
  /** Querung ohne Vortritt (von Hand, Bedarfsmodul E1): Sichtweite nach VSS 40 240 Z. 8.2 statt Tab. 1; L = Querdistanz der
   * Teilquerung (ganzeFahrbahn: Insel nur markiert, L über die ganze Fahrbahn). Typ «begegnungszone» (30.10.2026): unmarkierte
   * OSM-Querung in einer Begegnungszone, Vortritt Fussverkehr, Sichtweite = Anhaltesichtweite (Z. 8.2). Fehlt bei Fussgängerstreifen */
  querung?: { typ: QuerungSicht; L: number; ganzeFahrbahn: boolean }
  /** OSM-Tramgleis quert den Streifen (nur mit OSM-Netz; Vorbelegung Bedarfsmodul) */
  tram?: boolean
  /** Trottoirüberfahrt (Wahl am Streifen, 23.10.2026): angezeigt wie «kein FGS» (Status kein_fgs, ohne Zufahrten und ohne hier nicht
   * geprüfte Richtungen, keine Sicht auf die Wartefläche); massgebend ist die Knotensicht, die fgsCheck nicht rechnet */
  trottoirueberfahrt?: true
  /** Trottoirüberfahrt: Zufahrten und entfallene Richtungen der Rechnung (wie beim Fussgängerstreifen), nur für die Vorbelegung des
   * Bedarfs (Tempo, innerorts, Lage …), nicht für Sichtbefunde */
  nurVorbelegung?: { zufahrten: ZufahrtErgebnis[]; entfallen: Entfallen[] }
  /** Trottoirüberfahrt: Knotensicht der Einbiegenden (K2, Kern des SichtweitenCheck; tue/knotensicht.ts), im Worker angefügt; fehlt
   * ohne Trottoirüberfahrt */
  knotensicht?: KnotensichtAntwort
  /** Wartebereich je Ende (Bordkante, Richtung vom Streifen weg) wie gerechnet; Karte: wartende Person 0,6 m dahinter (27.10.2026) */
  warte?: [P, P][]
}

/** Querung ohne Vortritt: Furt (Insel ohne Balken) bzw. Nase, Einengung, ohne bauliche Massnahme */
export type QuerungOhneVortritt = 'furt' | 'ohne_vortritt'
/** Querungsart mit Sicht nach VSS 40 240 Z. 8.2: ohne Vortritt bzw. Querung in der Begegnungszone (Vortritt Fussverkehr; nur als
 * Annahme an einer unmarkierten OSM-Querung, nicht wählbar) */
export type QuerungSicht = QuerungOhneVortritt | 'begegnungszone'

export interface Rechnung {
  streifen: StreifenErgebnis[]
  meldungen: string[]
  ms: number
}
