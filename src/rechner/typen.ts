// ── Ergebnis-Typen der Rechnung (entsprechen den Spalten von sichtpruefung.csv, soweit in der App vorhanden) ──

import type { P } from '../geo'
import type { Multi, Poly } from './poly'
import type { Entfallen } from './zufahrten'

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
}

export interface Rechnung {
  streifen: StreifenErgebnis[]
  meldungen: string[]
  ms: number
}
