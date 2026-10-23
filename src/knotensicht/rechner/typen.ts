// ── Ein- und Ausgabe der Rechnung (E0 bis E3c): Knoten bzw. Grundstückzufahrt, Zufahrt, Eingaben zur erforderlichen
//    Sichtweite, Eingaben zum Knoten (Vortrittsregelung, Haltelinie, D, Trottoir, Tempo, Veloführung, Wahrnehmbarkeit), Hindernisse,
//    Längsneigung aus dem Höhenmodell (E3a), Ergebnis je Richtung mit Velo (E3b), Trottoir (E3b), Massnahmen nach Ziffer 14 (E3a),
//    Rechtsvortritt nach Teil E (E3c); K0: Trottoirüberfahrt (VSS 40 242 Ziffer 14.4) und amtliches Tempo (V_sig Stadt Bern) ──

import type { P } from '../geo'
import type { Status, Strassentyp, Ungunst, TypStufe } from './sichtweite'
import type { Anhaltesicht } from './anhaltesicht'
import type { Hindernis } from './hindernisse'
import type { Wirkung, Palisade } from './sicht'
import type { Vorschlag } from './vorschlaege'
import type { ParkStreifen } from './hauptachsen'
import type { KatasterFeld } from '../daten/parkkataster'
import type { KatasterBaum } from '../daten/baumkataster'
import type { Massnahme } from './massnahmen'
import type { Velofuehrung, RadwegLage } from './velo'
import type { Wahrnehmbarkeit, Zustand, Paarmatrix } from './rechtsvortritt'

/** Eingaben zur erforderlichen Sichtweite (E1, von Hand im Panel); null = Vorgabe aus OSM bzw. aus der Neigung */
export interface SichtEingaben {
  typ: Strassentyp | null
  fahrstreifen: boolean | null      // mehr als zwei Fahrstreifen (Vorgabe: OSM lanes > 2)
  neigungGross: boolean | null      // grosse Längsneigung (Vorgabe: |i| > 4 % in einer Richtung)
  schwerverkehr: boolean            // hoher Schwerverkehrsanteil (nur von Hand)
  neigung: Record<Richtung, number | null> // Längsneigung in Fahrtrichtung von FA [%], talwärts negativ; null = Vorgabe aus dem
                                           // Höhenmodell (E3a), ohne Messung 0 %
}
export const KEINE_EINGABEN: SichtEingaben = {
  typ: null, fahrstreifen: null, neigungGross: null, schwerverkehr: false, neigung: { links: null, rechts: null },
}

/** Längsneigung aus dem Höhenmodell (E3a): mittlere Neigung eines Profils in Fahrtrichtung [%] (talwärts negativ) bzw. null bei
 *  einem Fehler des Dienstes; quelle z. B. «swissALTI3D (swisstopo), Profil 50 m, 20 Punkte»; hinweis bei Fehler bzw. Ausreissern */
export interface NeigungMessung { i: number | null; quelle: string; laenge: number; punkte: number; hinweis: string | null }
/** Messungen je Fall: je Richtung der Vortrittsstrasse, die Zufahrt und das Trottoir (E3b: ein Profil entlang der Trottoirachse vom
 *  Ende links über die Zufahrt zum Ende rechts; i wie geliefert, also Neigung in Gehrichtung von rechts, die Gegenrichtung −i);
 *  fehlt ein Eintrag, ist er (noch) nicht geladen */
export interface HoehenVorgabe { links?: NeigungMessung; rechts?: NeigungMessung; zufahrt?: NeigungMessung; trottoir?: NeigungMessung }

/** Vortrittsregelung der Zufahrt (E2b): Vortritt (Kein Vortritt bzw. ohne Signal), Stop, Rechtsvortritt (Teil E, E3c) */
export type Regelung = 'vortritt' | 'stop' | 'rechtsvortritt'
export const REGELUNGEN: Regelung[] = ['vortritt', 'stop', 'rechtsvortritt']
/** Art eines Tempos von Hand (VSS 40 273 Ziffer 10): signalisierte Höchstgeschwindigkeit, Projektierungsgeschwindigkeit VP, V85,
 *  fahrbares Tempo bei baulicher Verkehrsberuhigung */
export type TempoArt = 'signalisiert' | 'vp' | 'v85' | 'fahrbar'
export const TEMPO_ARTEN: TempoArt[] = ['signalisiert', 'vp', 'v85', 'fahrbar']
export interface TempoEingabe { art: TempoArt; wert: number; begruendung: string }
/** Tempo von Hand: zulässiger Bereich [km/h] */
export const TEMPO_MIN = 10
export const TEMPO_MAX = 120

/** Eingaben zum Knoten bzw. zur Zufahrt (E2b, im Panel bzw. auf der Karte); null bzw. false = Vorgabe */
export interface KnotenEingaben {
  regelung: Regelung | null         // Vorgabe: OSM highway=stop an der Zufahrt -> Stop, sonst Vortritt
  haltelinie: P | null              // Vorderkante der Haltelinie (geklickt; gerechnet mit dem Lot auf die Zufahrtsachse)
  D: P | null                       // Beobachtungspunkt von Hand (auf der Karte gezogen)
  trottoirFrei: boolean             // Trottoir ohne Hindernisse: F_B wartet an der Bordkante (Ziffer 13.1)
  tempo: Record<Richtung, TempoEingabe | null>   // Tempo von Hand je Richtung (Vorgabe: OSM)
  // E3b, fehlen in älteren Fällen (= Vorgabe; knotenEingabenAus ergänzt sie)
  velo?: Record<Richtung, Velofuehrung | null>   // Veloführung je Richtung (Vorgabe: OSM)
  ebikeVerboten?: boolean           // schnelle E-Bikes verboten (Tab. 3, nur über 30 km/h)
  // E3c, fehlen in älteren Fällen
  wahrnehmbarkeit?: Wahrnehmbarkeit | null   // Rechtsvortritt: Wahrnehmbarkeit des Knotens (Ziffer 18; Vorgabe «gut», Annahme)
  alleArme?: boolean                // Rechtsvortritt: jeden Arm gegen seinen rechten Nachbarn prüfen (Tabelle im Panel)
  // K0, fehlt in älteren Fällen (= kein Modus)
  trottoirueberfahrt?: TrottoirueberfahrtEingabe | null   // Trottoirüberfahrt über diese Einmündung (VSS 40 242 Ziffer 14.4)
}
/** Trottoirüberfahrt über die Einmündung der Zufahrt (K0): gesetzt = Modus an. breite: Breite der Überfahrt von Hand [m]; geht der
 *  AV vor (Reihenfolge: Eingabe, AV-Trottoir quer über die Zufahrt, schmaleres angrenzendes AV-Trottoir, Annahme; trottoirueberfahrt.ts) */
export interface TrottoirueberfahrtEingabe { breite: number | null }
/** Breite der Trottoirüberfahrt von Hand: zulässiger Bereich [m] */
export const TUE_BREITE_MIN = 1
export const TUE_BREITE_MAX = 8
export const KEINE_KNOTEN_EINGABEN: KnotenEingaben = {
  regelung: null, haltelinie: null, D: null, trottoirFrei: false, tempo: { links: null, rechts: null },
}
/** alle Eingaben einer Zufahrt (E1 und E2b; Fall-Datei) */
export type Eingaben = SichtEingaben & KnotenEingaben
export const KEINE_ALLE_EINGABEN: Eingaben = { ...KEINE_EINGABEN, ...KEINE_KNOTEN_EINGABEN }

/** Grundstückzufahrt (E2b): geklickter Punkt am Fahrbahnrand der Vortrittsstrasse (bzw. auf einem OSM-Weg service nahe der
 *  Einmündung), Richtung der Zufahrt vom Rand weg in das Grundstück (null = senkrecht zum Rand) */
export interface ZufahrtspunktEingabe { p: P; richtung: P | null }

/** Hindernisse für die Rechnung (E2a): Eingaben von Hand bzw. bestätigte Vorschläge, verworfene Vorschläge und amtliche
 *  Parkfelder (Ids), geladene amtliche Parkfelder und Bäume aus dem Baumkataster (null = nicht geladen bzw. abgeschaltet) */
export interface HindernisEingaben {
  hindernisse: Hindernis[]
  verworfen: string[]
  park: { felder: KatasterFeld[]; quellenangabe: string } | null
  baeume: { baeume: KatasterBaum[]; quellenangabe: string } | null
}
export const KEINE_HINDERNISSE: HindernisEingaben = { hindernisse: [], verworfen: [], park: null, baeume: null }

/** Eingabe: gewählter OSM-Knoten und vortrittsbelastete Zufahrt (Schlüssel des Arms, null = noch nicht gewählt) bzw.
 *  Grundstückzufahrt (zufahrtspunkt, dann gilt knoten nicht); avZentrum: Mitte des geladenen AV-Ausschnitts (Vorgabe: Knoten) */
export interface KnotenFall {
  knoten: number | null; zufahrt: string | null; zufahrtspunkt?: ZufahrtspunktEingabe | null
  eingaben?: SichtEingaben & Partial<KnotenEingaben>; hindernisse?: HindernisEingaben; avZentrum?: P
  hoehen?: HoehenVorgabe | null     // Längsneigung aus dem Höhenmodell (E3a; null = nicht geladen)
  tempoAmtlich?: TempoAmtlichDaten | null   // K0: amtliches Tempo (Stadt Bern: V_sig des Geoportals); null = nur OSM
}

/** Linie des amtlichen Tempos (K0; Stadt Bern: Layer «Signalisierte_Hoechstgeschwindigkeit», Linien auf der Strassenachse):
 *  vSig in km/h, null ohne Angabe (dort gilt OSM) */
export interface TempoAmtlichLinie { id: string; strasse: string; vSig: number | null; teile: P[][] }
/** Amtliches Tempo für die Rechnung (K0): Linien, abgedeckter Bereich (Quadrat ±radiusM um mitte; ausserhalb gilt OSM) und
 *  Herkunft für die Texte (z. B. «Geoportal Stadt Bern»). Die Zuständigkeit (Gemeinde) prüft der Aufrufer. */
export interface TempoAmtlichDaten { linien: TempoAmtlichLinie[]; bereich: { mitte: P; radiusM: number } | null; quelle: string }

/** Strassentyp und ungünstige Verhältnisse der vortrittsberechtigten Strasse, wie gerechnet, mit den Vorgaben */
export interface StrasseErgebnis {
  typ: Strassentyp
  typVorgabe: Strassentyp
  typQuelle: string           // z. B. «OSM highway=tertiary»
  typGewaehlt: boolean        // von Hand gewählt (sonst Vorgabe)
  ungunst: Ungunst
  ungunstVorgabe: Pick<Ungunst, 'fahrstreifen' | 'neigung'>
  fahrstreifenQuelle: string  // z. B. «OSM lanes=4» bzw. «ohne OSM lanes»
}

/** Arm eines Knotens (OSM-Weg vom Knoten weg) */
export interface ArmInfo {
  key: string                 // «wid:i:sd»
  nr: string                  // Nummer am Knoten (Karte, Panel, Bericht): im Uhrzeigersinn ab Norden «1», «2» …, Grundstückzufahrt
                              // «Z»; leer, solange nicht nummeriert (armInfo)
  wid: number; i: number; sd: number
  name: string                // Strassenname (leer ohne name)
  hw: string                  // highway
  richtung: P                 // Einheitsvektor vom Knoten weg (Sehne 10 m)
  himmel: string              // Himmelsrichtung, z. B. «Süd»
  zufluss: boolean            // Verkehr fährt auf diesem Arm zum Knoten (keine Einbahn vom Knoten weg)
  einbahn: number             // OSM-Einbahn (+1/-1/0) des Wegs
  veloZufluss: boolean        // Velos fahren auf diesem Arm zum Knoten: wie zufluss, bei Einbahn vom Knoten weg mit Velo gegen die
                              // Einbahn (OSM oneway:bicycle=no, cycleway*=opposite*, cycleway:*:oneway gegen die Einbahn)
  veloZuflussQuelle: string   // das Tag des Velos gegen die Einbahn, z. B. «cycleway=opposite_lane» ('' ohne Einbahn vom Knoten weg)
}

export interface VortrittsHinweis { id: number; art: 'stop' | 'give_way'; p: P }

export interface KnotenInfo {
  id: number
  p: P                        // LV95
  ll: [number, number]        // WGS84 [lat, lon]
  name: string                // «Strasse A / Strasse B»
  arme: ArmInfo[]
  vortritt: [string, string] | null   // Arme der vortrittsberechtigten Strasse (ohne Rücksicht auf die Zufahrt)
  vortrittGrund: string
  vorschlag: string | null    // Zufahrt, wenn eindeutig (einziger Arm ausserhalb der Vortrittsstrasse)
  signale: VortrittsHinweis[] // OSM highway=stop/give_way in der Nähe (nur Hinweis)
  grundstueck?: boolean       // Grundstückzufahrt (E2b): Knotenpunkt auf der Vortrittsstrasse, Arme ab dort, keine Wahl der Zufahrt
}

export type Richtung = 'links' | 'rechts'
/** Lage einer Richtung aus Sicht der Zufahrt (lage.ts): gegenüber = Gegenverkehr (Arm fast geradeaus) */
export type Lage = Richtung | 'gegenueber'
export type RichtungStatus = Status | 'keine_zufahrt'

export interface Verdecker { id: string; name: string; art: string; quelle: string; ring: P[]; sVerdeckt: number }

/** Fläche, die eine Sichtlinie bis A schneidet (Liste je Richtung) */
export interface VerdeckerEintrag {
  id: string
  name: string
  art: string                 // z. B. «Gebäude», «Parkfeld Auto», «Baum»
  quelle: string              // z. B. «AV», «amtlich (Parkkataster)», «von Hand»
  wirkung: Wirkung            // voll, Palisade, nur Hinweis
  sErst: number               // erster verdeckter Zielpunkt [m ab K]
  strecke: number             // verdeckte Strecke entlang der Achse bis A [m]
  ring: P[]
}

/** Sicht von einem Beobachtungspunkt auf eine Achse (Velo, Trottoir; E3b): wie die Felder der Richtung für Motorfahrzeuge */
export interface SichtTeil {
  A: number                   // erforderliche Sichtweite [m]
  K: P                        // Anfang der Achse (Schnitt mit der Zufahrtsachse)
  achse: P[]                  // Achse ab K bis sMax
  sMax: number
  sichtpunkte: P[]
  sichtbar: boolean[]
  vorhanden: number
  bisEnde: boolean
  status: 'erfuellt' | 'nicht_erfuellt'
  verdecker: Verdecker | null
  verdeckerListe: VerdeckerEintrag[]
  palisade: Palisade | null
  dreieckFrei: P[]
  dreieckVerdeckt: P[]
  hinweise: string[]
  ohneFlaechen: string[]      // Hindernisse, durch die die Achse bis A läuft: für diese Sicht nicht gerechnet (auch in den Massnahmen)
}
/** Prüfung des Veloverkehrs je Richtung (E3b, Ziffer 13.3, Tab. 3) */
export interface VeloErgebnis extends SichtTeil {
  fuehrung: Exclude<Velofuehrung, 'kein'>
  lageText: string            // z. B. «0,50 m vom rechten Fahrbahnrand (Mischverkehr)»
  randAbstand: number         // Abstand rechter Fahrbahnrand – Veloachse (negativ: ausserhalb der Fahrbahn, Radweg)
  radweg: RadwegLage | null
  tempo: number               // zulässige Höchstgeschwindigkeit (Zeile der Tab. 3)
  tempoQuelle: string
  neigung: number
  text: string                // z. B. «Tab. 3, bis 30 km/h, Spalte 0 %»
  ebike: boolean              // Wert «schnelle E-Bikes verboten» angewendet
}
/** Prüfung des Trottoirverkehrs je Richtung (E3b, Ziffer 13.2, Tab. 2): Fussgänger und fahrzeugähnliche Geräte, die von dieser Seite
 *  auf dem Trottoir zur Zufahrt kommen */
export interface TrottoirRichtung extends SichtTeil {
  richtung: Richtung
  lage: Lage                  // wie die Richtung der Vortrittsstrasse auf derselben Seite
  neigung: number             // Längsneigung des Trottoirs in Gehrichtung auf die Zufahrt zu [%]
  neigungQuelle: string
  text: string                // z. B. «Tab. 2, Spalte ≥ 0 %»
}
export interface TrottoirPruefung {
  D: P                        // D' am Fahrersitz, B 3,00 m hinter der Trottoirhinterkante
  Dachse: P
  hinterkante: P
  achseQuelle: string         // Lage der Trottoirachse
  richtungen: TrottoirRichtung[]
  gehlinie?: boolean          // K0, Trottoirüberfahrt: Zielpunkte auf der Gehlinie 0,50 m vom hinteren Rand der Überfahrt statt auf der Achse
}

/** Herkunft der Breite einer Trottoirüberfahrt (K0), in dieser Reihenfolge: Eingabe, AV-Fläche Trottoir quer über die Zufahrt, das
 *  schmalere angrenzende AV-Trottoir links bzw. rechts (begrenzt auf 2,00 bis 3,50 m), Annahme 2,00 m */
export type TueBreiteQuelle = 'av_quer' | 'av_neben' | 'eingabe' | 'annahme'
/** Phase der Sicht an einer Trottoirüberfahrt (VSS 40 242 Ziffer 14.4): schlechtester Status der Richtungen und die nicht erfüllten
 *  Teile je Richtung (z. B. «links: Auto»); keine_zufahrt = in keiner Richtung geprüft */
export interface TuePhase { status: RichtungStatus; fehlt: string[] }
/** Trottoirüberfahrt (K0): Band zwischen vorderem Rand (Bordkante = Fahrbahnrand) und hinterem Rand auf der Zufahrtsachse; Phase
 *  Trottoir = trottoirPruefung (D' 3,00 m hinter dem hinteren Rand, Gehlinie), Phase Fahrbahn = richtungen (Auto, Velo; B ab der Bordkante) */
export interface TueErgebnis {
  breite: number              // Breite der Überfahrt quer zur Vortrittsstrasse [m] (hinterer Rand beidseits so weit hinter dem Fahrbahnrand)
  breiteQuelle: TueBreiteQuelle
  breiteText: string          // Herkunft der Breite als Satz
  laenge: number              // Abstand vorderer – hinterer Rand entlang der Zufahrtsachse [m] = abstand / sin α
  abstand: number             // hinterer Rand hinter dem Fahrbahnrand [m]: Breite plus Vorlauf (AV-Trottoir hinter Radweg bzw. Grünstreifen)
  durchgehend: boolean        // die Zufahrt ist ein Arm der durchgehenden Strasse (VSS 40 242 Ziffer 14.2: keine Einmündung)
  vorderkante: P              // Bordkante (Fahrbahnrand der Vortrittsstrasse) auf der Zufahrtsachse: Nullpunkt der Phase Fahrbahn
  hinterkante: P              // hinterer Rand der Überfahrt auf der Zufahrtsachse: Nullpunkt der Phase Trottoir
  gehlinie: number            // Abstand der Gehlinie vom hinteren Rand der Überfahrt [m] (0,50)
  regelungText: string        // Vortritt fest: warum
  phaseTrottoir: TuePhase
  phaseFahrbahn: TuePhase
}

export interface RichtungErgebnis {
  richtung: Richtung          // Schlüssel (Eingaben, Tempo, Neigung, Fall-Datei)
  lage: Lage                  // Beschriftung: links, rechts oder gegenüber (Gegenverkehr, lage.ts)
  arm: string                 // Schlüssel des vortrittsberechtigten Arms, von dem der Verkehr kommt
  strasse: string
  spur: 'nah' | 'fern'        // nach links die nahe, nach rechts die ferne Fahrspur (Rechtsverkehr)
  tempo: number
  tempoQuelle: string
  tempoAnnahme: boolean       // ohne OSM-Angabe 50 km/h angenommen (nicht bei Tempo von Hand)
  tempoVorgabe: number        // Tempo aus OSM (bzw. Annahme), auch wenn von Hand ersetzt (E2b)
  tempoVorgabeQuelle: string
  tempoArt: TempoArt | null   // Tempo von Hand: Art (null = Vorgabe aus OSM)
  tempoBegruendung: string
  stufe: number               // Stufe der Tab. 1
  erforderlichUnten: number
  erforderlichOben: number
  zwischenwert: number        // Mittel von unterem und oberem Wert, aufgerundet
  typStufe: TypStufe          // Wert der Tab. 1 nach Strassentyp
  typWert: number             // [m]
  typText: string             // z. B. «Zwischenwert, Hauptverkehrsstrasse»
  neigung: number             // Längsneigung in Fahrtrichtung [%], wie gerechnet
  neigungVorgabe: number      // Vorgabe: aus dem Höhenmodell (E3a), sonst 0 %
  neigungHand: boolean        // Längsneigung von Hand (sonst Vorgabe)
  neigungQuelle: string       // «von Hand», «swissALTI3D (swisstopo), Profil …» bzw. warum 0 %
  neigungVorgabeQuelle: string  // Quelle der Vorgabe (auch bei Eingabe von Hand): Profil, Fehler, lädt bzw. ohne Profil
  profilLinie: P[]            // Fahrstreifenachse ab K bis max(20 m, A massgebend): Linie des Höhenprofils (E3a)
  anhalte: Anhaltesicht | null      // VSS 40 090b Abb. 2 (immer gerechnet ab 30 km/h)
  anhalteAngewendet: boolean        // nur bei |i| > 2 %
  massgebend: number          // max(typWert, Anhaltesichtweite bei |i| > 2 %)
  massgebendText: string      // Herkunft des massgebenden Werts
  vorhanden: number           // [m], ab K entlang der Achse
  bisEnde: boolean            // bis zum Ende der Zielpunkte (1,5 × oberer Wert) frei
  sMax: number                // Länge der geprüften Achse ab K
  status: RichtungStatus
  statusZusatz: string[]      // z. B. «Hinweis: Zweiräder», «Hinweis: Palisade 4 %»
  verdecker: Verdecker | null
  verdeckerListe: VerdeckerEintrag[] // alle Flächen mit Treffer bis A (E2a)
  palisade: Palisade | null
  K: P                        // Kreuzungspunkt
  achse: P[]                  // Fahrstreifenachse ab K bis sMax
  sichtpunkte: P[]            // Zielpunkte je 1 m
  sichtbar: boolean[]
  dreieck: P[]                // D und Achse bis A massgebend
  dreieckFrei: P[]            // D und Achse bis min(vorhanden, A massgebend)
  dreieckVerdeckt: P[]        // D und Achse von vorhanden bis A massgebend (leer, wenn erfüllt)
  randAbstand: number         // Abstand rechter Fahrbahnrand – Achse (d, mit Parkstreifen d + 1,90 m)
  parkStreifen: ParkStreifen  // Parkstreifen am rechten Rand (Abzug, Treffer)
  lageQuelle: string
  hinweise: string[]
  veloFuehrung: Velofuehrung  // in der Rechnung (E3b)
  veloVorgabe: Velofuehrung
  veloVorgabeQuelle: string
  veloGewaehlt: boolean
  velo: VeloErgebnis | null   // null: kein Veloverkehr bzw. kein Verkehr von dieser Seite
  gesamt: RichtungStatus      // schlechtester von Auto, Velo und Trottoir dieser Seite (Entscheid 1)
  gesamtFehlt: string[]       // Teile, die nicht erfüllt sind: «Auto», «Velo», «Trottoir»
  keinGrund?: string          // status keine_zufahrt: warum (Vorgabe «kein Verkehr von dieser Seite»; E3c: Rechtsvortritt, von links)
  rv?: boolean                // E3c: Auto nach Teil E (Rechtsvortritt, Abb. 6) statt Tab. 1
  rvKeine?: boolean           // E3c: Rechtsvortritt, von dieser Seite keine Prüfung (Grund in keinGrund)
  veloGegen?: string          // E4: Einbahn vom Knoten weg mit Velo gegen die Einbahn: nur Velos von dieser Seite (OSM-Tag), Auto
                              // keine_zufahrt, velo auf der für das Velo rechten Seite
}

/** Rechtsvortritt (E3c): Status eines Arms gegen den Arm rechts davon (erfüllt = anzustrebender Zustand, bedingt = zulässig, wenn
 *  der anzustrebende nicht erreichbar ist, nicht erfüllt = zu sanieren bzw. Sichtfeld nach Abb. 5 nicht frei; keine = keine Prüfung) */
export type RvStatus = 'erfuellt' | 'bedingt' | 'nicht_erfuellt' | 'keine'
export interface RvArm {
  arm: string                 // Schlüssel des geprüften (vortrittsbelasteten) Arms
  armName: string             // z. B. «3 Hallerstrasse (Süd)» (armText)
  rechts: string | null       // Schlüssel des Arms rechts davon (null: keiner)
  rechtsName: string
  vorhanden: number           // [m] ab K auf der Fahrstreifenachse des rechten Arms
  bisEnde: boolean
  zustand: Zustand | null     // Abb. 6 (null: keine Prüfung)
  status: RvStatus
  grund: string               // bei status keine: warum
  breite: number | null       // Fahrbahnbreite des Arms (AV-Querschnitt; null ohne AV)
  breiteRechts: number | null // Fahrbahnbreite des rechten Arms
  schmal: boolean             // b ≤ 3,50 m (Abb. 5)
  paare: Paarmatrix | null    // nur bei schmaler Zufahrt
  nurVelo?: string            // E4: der Arm rechts ist eine Einbahn vom Knoten weg mit Velo gegen die Einbahn (OSM-Tag): keine Prüfung
                              // nach Abb. 6, das Velo von rechts nach Tab. 3 (Richtung rechts)
}
/** Ergebnis nach Teil E (E3c): Wahrnehmbarkeit, gewählter Arm, auf Wunsch alle Arme */
export interface RechtsvortrittErgebnis {
  wahrnehmbarkeit: Wahrnehmbarkeit
  wahrnehmbarkeitGewaehlt: boolean
  tempo: number               // 30 km/h (Ziffer 15)
  B: number                   // 5,00 m (Abb. 4)
  arm: RvArm
  alle: RvArm[] | null        // je Arm gegen seinen rechten Nachbarn (nur auf Wunsch)
  fahrbahnachsen: [P[], P[]] | null   // Fahrbahnachsen ab K der Paarmatrix (Karte)
}

/** Haltelinie (E2b): Vorderkante auf der Zufahrtsachse, Querlinie für die Karte, Abstand von der Kante entlang der Achse
 *  (positiv: auf der Zufahrt hinter der Kante) */
export interface HaltelinieErgebnis { p: P; quer: [P, P]; abstand: number; vorverlegt: boolean }
/** Trottoir zwischen Zufahrt und Vortrittsstrasse nach AV (E2b): Breite entlang der Zufahrtsachse, Hinterkante */
export interface TrottoirErgebnis { breite: number; hinterkante: P; frei: boolean }
/** Grundstückzufahrt (E2b): geklickter Punkt (Schlüssel), Richtung, OSM-Weg service (falls über ihn gesetzt), Strasse */
export interface ZufahrtspunktErgebnis {
  eingabe: P                  // geklickter Punkt (Schlüssel des Falls, ?zufahrt=E,N)
  richtung: P                 // Richtung der Zufahrt vom Rand weg in das Grundstück
  gezeichnet: boolean         // Richtung mit zweitem Klick gezeichnet (sonst senkrecht zum Rand bzw. entlang des OSM-Wegs)
  weg: number | null          // OSM-Weg highway=service, wenn die Zufahrt über ihn gesetzt ist
  strasse: string             // Vortrittsstrasse
}

export interface Ergebnis {
  knoten: number | null       // OSM-Knoten (null bei einer Grundstückzufahrt)
  zufahrtspunkt: ZufahrtspunktErgebnis | null
  zufahrt: string
  zufahrtName: string
  D: P                        // Beobachtungspunkt (Fahrersitz bzw. von Hand)
  Dachse: P                   // Punkt auf der Achse des Zufahrtsstreifens im Abstand B vor dem Nullpunkt (bei D von Hand: D
                              // um den Fahrersitz nach rechts versetzt; F_B steht darauf)
  Dvorgabe: P                 // D ohne Eingabe von Hand
  Dhand: boolean              // D von Hand
  Dlage: { laengs: number; seitlich: number }   // D gegenüber dem Nullpunkt: entlang der Achse (wirksames B), links der Achse
  fbRichtung: P               // Fahrtrichtung von F_B (entlang der Zufahrtsachse zum Knoten)
  rand: P                     // Schnitt der Zufahrtsachse mit der zugewandten Kante des Fahrstreifens mit Vortritt
  nullpunkt: P                // Punkt auf der Zufahrtsachse, ab dem B gemessen wird (Kante, Haltelinie bzw. Trottoirhinterkante)
  nullpunktText: string
  regelung: Regelung          // in der Rechnung verwendete Vortrittsregelung (E2b)
  regelungVorgabe: Regelung
  regelungQuelle: string      // z. B. «OSM highway=stop an der Zufahrt»
  regelungGewaehlt: boolean
  haltelinie: HaltelinieErgebnis | null
  trottoir: TrottoirErgebnis | null
  trottoirGrund: string       // ohne Trottoir: warum das Häkchen nicht gilt
  B: number
  ausserorts: boolean
  zufahrtAchse: P[]
  zufahrtLageQuelle: string
  vortritt: [string, string]  // in der Rechnung verwendete Arme der Vortrittsstrasse (links, rechts)
  einbiegewinkel: number      // Winkel zwischen Zufahrt und Vortrittsstrasse [°], 90 = rechtwinklig
  richtungen: RichtungErgebnis[]
  strasse: StrasseErgebnis    // Strassentyp und ungünstige Verhältnisse (E1)
  avRadius: number            // Halbseite des geladenen AV-Ausschnitts um den Knoten [m]
  avBedarf: number            // nötiger AV-Ausschnitt: weitester Zielpunkt ab Knoten plus Reserve [m]
  annahmen: string[]          // in der Seite als Annahme ausgewiesen
  hinweise: string[]
  hindernis: HindernisStand
  zufahrtProfil: P[]          // Achse der Zufahrt ab dem Nullpunkt 20 m vom Knoten weg: Linie des Höhenprofils (E3a)
  zufahrtNeigung: NeigungMessung | null   // Längsneigung der Zufahrt in Fahrtrichtung von FB (E3a; noch ohne Wirkung)
  massnahmen: Massnahme[] | null          // Massnahmen nach Ziffer 14 (E3a), nur wenn eine Richtung nicht erfüllt ist
  radwegRand: P | null        // Ziffer 12 (E3b): Radweg näher als 2,00 m, Schnitt der Zufahrtsachse mit seinem Rand
  trottoirPruefung: TrottoirPruefung | null   // Ziffer 13.2 (E3b), nur mit Trottoir an der Zufahrt
  trottoirProfil: P[]         // Trottoirachse vom Ende links bis zum Ende rechts: Linie des Höhenprofils (E3b)
  rechtsvortritt: RechtsvortrittErgebnis | null   // Teil E (E3c), nur bei Rechtsvortritt an einem Knoten
  seiteOhneArm?: Richtung | null    // ein Arm liegt gegenüber und auf dieser Seite liegt kein Arm des Knotens (Panel: «links: kein Arm»)
  zufahrtVelo: ZufahrtVelo | null   // E4: Zufahrt mit Einbahn vom Knoten weg und Velo gegen die Einbahn: F_B ist ein Velo, D auf seiner Achse
  trottoirueberfahrt?: TueErgebnis  // K0: nur im Modus Trottoirüberfahrt (sonst fehlt das Feld)
}
/** Velo gegen die Einbahn auf der Zufahrt (E4): Tag des Velozuflusses, Veloführung aus OSM mit Quelle, Lage der Achse (D, F_B) */
export interface ZufahrtVelo { quelle: string; fuehrung: Exclude<Velofuehrung, 'kein'>; fuehrungQuelle: string; lageText: string }

/** Stand der Hindernisse nach der Rechnung (E2a) */
export interface HindernisStand {
  vorschlaege: Vorschlag[]       // OSM-Parkierung im Sichtfeld und Bäume aus dem Baumkataster: zählen erst nach «bestätigen»
  amtlich: Vorschlag[]           // amtliche Parkfelder in Reichweite, zählen (nicht verworfen)
  amtlichVerworfen: Vorschlag[]  // verworfene amtliche Parkfelder in Reichweite
  osmUeberdeckt: number          // OSM-Vorschläge, die amtliche Felder schon abdecken (nicht gezeigt)
  inD: string[]                  // Hindernisse, in denen D liegt (nicht gerechnet)
  reichweite: number             // Abstand vom Knoten, bis zu dem Felder und Bäume angezeigt werden [m]
}

export interface Rechnung {
  knoten: KnotenInfo | null
  ergebnis: Ergebnis | null
  meldungen: string[]
  ms: number
}
