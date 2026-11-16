// ── Bordmodell: Fahrbahnrand aus der AV statt aus der OSM-Linie (gemeinsamer Baustein seit 13.11.2026, Plan AV-Geometrie A1) ──
// Grundsatz (Plan 2.1): Wo AV vorliegt, ist der AV-Bord der Bezug aller Geometrie. Die OSM-Achse wählt nur noch Seite, Reihenfolge
// und Stationen. Reine Rechnung in LV95 (Meter), ohne Browser und ohne Daten- oder Netzklassen: der Aufrufer übersetzt seine Flächen in
// Ringlisten (Ring 0 aussen, weitere Ringe Löcher), seine Abzweigungen und Haltestellen in Punkte.
//
// Ablauf:
// 1. Bordstücke (bordStuecke): jede Kante einer Fläche Strasse_Weg in Stücke von höchstens STUECK_M (an fremden Eckpunkten zusätzlich
//    geteilt, damit Stossstellen genau liegen), je mit der Art dahinter (Prüfpunkt PRUEF_M neben der Stückmitte, wie bordkanten.ts):
//    'bord' (Trottoir, Verkehrsinsel, Grün, Gebäude), 'strasse' (andere Fläche Strasse_Weg: kein Bord), 'offen' (keine Fläche oder eine
//    Fläche ohne Bordgrenze, z. B. uebrige_befestigte: «Rand unbekannt»). Jedes Stück ist so gerichtet, dass die Fahrbahn links liegt.
// 2. Gemessener Rand je Seite: Von der Achse aus wird alle SAAT_M quer gesucht (Band ±BAND_M). Auf der Normalen gilt der Fahrbahnteil an
//    der Achse; Lücken über eine Verkehrsinsel (höchstens INSEL_LUECKE_MAX_M) gehören dazu, Inseln sind also nie Seitenrand. Das erste
//    Bordstück am oberen Ende ist links, das am unteren Ende rechts. Diese Stücke werden entlang des AV-Umrisses (Ketten der Stücke)
//    zusammengehängt und über verdeckte Stücke hinweg verlängert (Flanken einer Nase oder Bucht, Ecke einer Einmündung bis ans Band),
//    entlang der Achse geordnet und an den Abschnittsenden senkrecht zur Achse geschnitten (verlängerte Achse, kein Klemmen).
//    Die Punkte des gemessenen Rands sind Eckpunkte der AV-Stücke; eine andere OSM-Achse ergibt darum denselben Rand.
// 3. Abweichungen: steile Stücke (mehr als EINM_WINKEL_GRAD zur Achse) bilden Flanken nach aussen bzw. innen.
//    Einmündung = Richtungsänderung des Bords > EINM_WINKEL_GRAD UND OSM-Abzweigung höchstens EINM_UMKREIS_M entfernt.
//    Eine Lücke oder Ausbuchtung ohne diese Bestätigung heisst «Rand unbekannt» (z. B. Fussweg in der Fläche Strasse_Weg).
//    Bucht = Ausbuchtung nach aussen (mindestens BUCHT_MIN_TIEFE_M) nur mit bekannter Haltestelle an dieser Stelle.
//    Trottoirnase = Einschnürung nach innen (mindestens NASE_MIN_TIEFE_M): bleibt immer, reale Engstelle.
//    Die Anschlusspunkte vor und nach einer Abweichung sucht der Baustein höchstens SUCHE_M vor bzw. nach der Flanke (Suchschwelle,
//    Plan 2.2); die Länge einer Abweichung allein überbrückt nichts.
// 4. Führungslinie je Seite (Plan 2.2a): wie der gemessene Rand, aber über bestätigte Einmündungen und an bestätigten Buchten gerade
//    verbunden; bei «Rand unbekannt» unterbrochen. Zwei getrennte Linien: Messungen lesen nur den gemessenen Rand.
// 5. Querschnitt je Station (Plan 2.5): Bordpunkt links und rechts als Schnitt der Achsnormalen mit dem gemessenen Rand der Seite; Breite
//    zwischen diesen Punkten senkrecht zur örtlichen Randrichtung (eine schiefe Achse vergrössert die Breite nicht).
// 6. parallele: Linie im Abstand (Markierung im Abstand ihrer Breite), mit Gehrungsgrenze und ohne Selbstüberschneidung.
// 7. schnittBord (seit 13.11.2026 spät, Plan A6, fgsCheck): Bord einer Seite für Schnitte quer zur Fahrbahn: Führungslinie (Lage der
//    Fahrlinie) bzw. gemessener Rand (Enden eines Fussgängerstreifens), dazu «Rand unbekannt» mit beiden Anschlusspunkten bis
//    SCHNITT_LUECKE_MAX_M gerade überbrückt (Fussweg- oder Einfahrtsmündung in der Fläche Strasse_Weg). Konstruiert, nie gemessener Bord.
//
// Nachträge (14.11.2026, Plan «Nachträge für den Baustein», aus A3, A4 und A7):
//   K1 Auf der Normalen wird eine Lücke nur überbrückt, wenn dort eine Verkehrsinsel liegt oder ein Loch der Strassenfläche ohne jede
//      Fläche; ein Häuserblock mit Trottoir (Loch der grossen Strassenfläche, Aegertenstrasse) ist Seitenrand, ein Vorplatz dahinter nicht.
//   K2 Ein Teil des gemessenen Rands, der an allen Eckpunkten hinter einem anderen Teil derselben Seite liegt (verdeckt), entfällt, bevor
//      Lücken und Enden bestimmt werden (sonst umgekehrte Lücke und falsches Ende).
//   K3 Querschnitt: Richtung je Seite aus der getroffenen AV-Strecke (nicht aus der Sehne, die sich an Ecken neigt).
//   K4 Querschnitt: Enden der Masslinie auf dem Messquerschnitt (senkrecht zum Bord) je Seite.
//   5  Führungslinie je Strecke gemessen oder konstruiert; konstruierte Führung länger als VERBINDUNG_MAX_M (ausser an einer Bucht) oder
//      neben der Fahrbahn (mehr als FUEHRUNG_NEBEN_ANTEIL_MAX der Prüfpunkte FUEHRUNG_PRUEF_M innen weder auf Strasse_Weg noch auf einer
//      Verkehrsinsel) verworfen: dort «Rand unbekannt».
//   6  Am Abschnittsanfang bzw. -ende entlang der Achskrümmung verlängert statt mit der Tangente; Anschlusspunkte mit Tangente.
//   7  Vorberechnete Bordstücke als Eingabe (eine Rechnung für mehrere Achsen, bordBereich).
//
// Alle eigenen Schwellen sind Annahmen dieses Bausteins (keine Normwerte); Plan: VeloroutenCheckWeb/docs/plan_av_geometrie.md.
import { type P, add, dist, dot, einheit, imPolygon, intervalleImPolygon, kreuz, links, sub } from './geometrie'

export type { P }
export type Seite = 'links' | 'rechts'

// ── Schwellen ──
/** Stücklänge und Prüfpunkt wie in bordkanten.ts (fgsCheck, VeloroutenCheck breitenmessung.ts) */
export const STUECK_M = 2
export const PRUEF_M = 0.3
/** Annahme (Plan 2.2): Rand je Seite höchstens so weit quer zur OSM-Achse gesucht */
export const BAND_M = 15
/** Annahme (Plan 2.2): Einmündung erst ab dieser Richtungsänderung des Bords; Stücke steiler als dieser Winkel zur Achse sind Flanken */
export const EINM_WINKEL_GRAD = 30
/** Annahme (Plan 2.2): OSM-Abzweigung höchstens so weit von der Verbindung der Anschlusspunkte */
export const EINM_UMKREIS_M = 25
/** Annahme (Nachtrag B, S8/BK4, 14.11.2026): liegt eine OSM-Abzweigung dieser Seite höchstens EINM_UMKREIS_M entfernt, zählt ein
 *  Randstück schon ab so viel Grad zur Achse als Flanke (und als Richtungsänderung einer Einmündung), sonst ab EINM_WINKEL_GRAD. Eine
 *  trichterförmige Mündung läuft flach aus (Bürkiweg, Knoten 32985984: 22–33°); ohne Abzweigung bleibt die strengere Grenze */
export const FLANKE_ABZW_GRAD = 20
/** Annahme (Nachtrag B, BK4, 14.11.2026): in die örtliche Randrichtung des Querschnitts (Messrichtung, Breite senkrecht zum Bord) gehen
 *  nur Bordstücke bis so viel Grad zur Achse ein (bisher EINM_WINKEL_GRAD 30°; Bern 768:72: Nasenflanke 26–27° drehte die Messnormale);
 *  steilere bleiben Bordpunkt (gemessener Rand, Engstelle) */
export const RICHTUNG_MAX_GRAD = 20
/** Annahme (Plan 2.2, Entscheid 1): Suchschwelle der Führungslinie – Anschlusspunkte höchstens so weit vor bzw. nach der Flanke */
export const SUCHE_M = 10
/** Annahme: Lücke auf der Normalen höchstens so breit, damit sie als Verkehrsinsel überquert wird (wie TEIL_LUECKE_MAX_M der Streifengeometrie) */
export const INSEL_LUECKE_MAX_M = 12
/** Annahme (Nachtrag C, C1, 14.11.2026): Eine Verkehrsinsel neben der Achse (nicht auf ihr) ist Seitenbord statt Mittelinsel, wenn
 *  hinter ihr eine andere Strasse fast parallel verläuft: der Strahl einer OSM-Abzweigung (Knoten → Armpunkt, bis SEITENINSEL_STRAHL_M
 *  verlängert, höchstens SEITENINSEL_WINKEL_GRAD zur Achse) schneidet die Normale im Fahrbahnteil hinter der Insel. Beispiel Knoten
 *  2860577444: Zufahrt Marzilistrasse 3° neben der Aarstrasse, dazwischen eine Insel 28 × 2,3 m (sonst nimmt die Aarstrasse das
 *  Trottoir jenseits der Zufahrt als Rand) */
export const SEITENINSEL_STRAHL_M = 80
export const SEITENINSEL_WINKEL_GRAD = 30
/** Annahme (Nachtrag C, C2, 14.11.2026): Ein Randstück gehört zu einer anderen Fahrbahn und fällt aus dem eigenen Rand, wenn es ganz
 *  mehr als FREMD_SEITE_M auf der anderen Seite der Achse liegt (nur, wenn die Seite noch ein Stück diesseits hat; sonst liegt die Achse
 *  neben der Fahrbahn, NEBEN_M) oder wenn es kurz ist (höchstens FREMD_LAENGE_MAX_M im Abschnitt) und an beiden Enden mehr als
 *  FREMD_VERSATZ_M (Abstand zur Achse; beim Nachbarn am achsparallelen Teil) neben dem eigenen Rand davor bzw. danach liegt (ohne
 *  Nachbarn auf einer Seite: dort gegen den Rand des anderen), oder wenn es als Keil zwischen zwei Mündungen ganz mehr als
 *  FREMD_VERSATZ_M hinter dem Rand davor und danach liegt, ohne achsparallelen Grund (TEILUNG_GRAD, TEILUNG_MIN_M). Beispiele: äusserer Rand
 *  der Parallelfahrbahn in einer Lücke des Trennstreifens (Aargauerstalden, Lerberstrasse: q 12 statt 4,5 m), Spitze eines fremden
 *  Keils am Abschnittsende (q 13–15 statt 4,3 m), Inselspitze in einer Zufahrt (Kasernenstrasse: q 12,9 statt 5,6 m) */
export const FREMD_VERSATZ_M = 2
export const FREMD_LAENGE_MAX_M = 15
export const FREMD_SEITE_M = 0.5
/** Annahme (Nachtrag C): Prüfabstand für die stellenweise Verdeckung eines Randstücks */
export const TEILWEISE_SCHRITT_M = 1
/** Annahme (Nachtrag C, C3): Verbindung über eine Mündung als Bogen erst ab so viel Grad Richtungsänderung des Bords (darunter die
 *  Sehne), voll ab BOGEN_VOLL_GRAD, dazwischen stetig überblendet */
export const BOGEN_AB_GRAD = 3
export const BOGEN_VOLL_GRAD = 10
/** Annahme (Sichtprüfung 14.11.2026, Murtenstrasse 3161672015): überkreuzen sich die Anschlusspunkte zweier Abweichungen auf
 *  demselben Randteil (leicht gekrümmte Inselkante zwischen zwei Mündungen), wird der Teil an seiner achsparallelsten Ecke dazwischen
 *  geteilt, wenn diese höchstens TEILUNG_GRAD zur Achse liegt und der Teil dort auf mindestens TEILUNG_MIN_M so verläuft (keine
 *  Inselspitze: Sandrainstrasse 625820863 bei 1 m K 3,1 statt 1,3 m neben 0.9.9; bei 3 m entfällt die Verbesserung an der
 *  Rosenbühlgasse 2960338314); sonst werden beide Abweichungen wie bisher zusammengefasst */
export const TEILUNG_GRAD = 10
export const TEILUNG_MIN_M = 2
/** Annahme: Achse höchstens so weit neben der AV-Fahrbahn (wie NEBEN_M der Streifengeometrie) */
export const NEBEN_M = 3
/** Annahme: Anschlusspunkt, wo der Bord ANKER_SONDE_M weiter vorne mehr als ANKER_TOL_M von seiner Geraden abweicht */
export const ANKER_SONDE_M = 2
export const ANKER_TOL_M = 0.05
/** Annahme: Bucht erst ab dieser Tiefe gegenüber dem Bord daneben, Suche ab der Haltestelle höchstens BUCHT_SUCHE_M entlang des Rands */
export const BUCHT_MIN_TIEFE_M = 1.0
export const BUCHT_SUCHE_M = 40
/** Annahme: Schulter der Bucht, sobald der Bord wieder höchstens so viele Grad von der Richtung der Buchtsohle abweicht */
export const BUCHT_PARALLEL_GRAD = 6
/** Annahme (Nachtrag B, BK3): Bordflucht über eine Öffnung, wenn der Bord nach der Lücke höchstens so weit neben der Geraden des Bords
 *  davor liegt (und umgekehrt); Richtung höchstens BUCHT_PARALLEL_GRAD verschieden. 0,30 m wie die Abnahmetoleranz der Führung */
export const OEFFNUNG_VERSATZ_M = 0.3
/** Annahme: Haltestelle höchstens so weit vom gemessenen Rand ihrer Seite */
export const HALT_FANG_M = 15
/** Annahme: Trottoirnase erst ab dieser Einschnürung gegenüber dem Bord davor bzw. danach */
export const NASE_MIN_TIEFE_M = 0.5
/** Annahme: Ausbuchtung bzw. Nase zwischen zwei Flanken höchstens so lang (Station); längere sind eine andere Fahrbahnbreite */
export const ABWEICHUNG_MAX_M = 60
/** Annahme: Rand nicht weiter verlängert, wo der Umriss um mehr als so viele Grad gegen die Achse zurückläuft */
export const RUECKLAUF_GRAD = 120
/** Annahme: Suchschritt der Normalen für den gemessenen Rand */
export const SAAT_M = 0.5
/** Annahme: örtliche Richtung (Achse, Rand) als Sehne ± so weit */
export const RICHTUNG_SEHNE_M = 1
/** Annahme: Gehrung höchstens so lang (Vielfaches des Abstands), sonst Bogen um die Ecke; 2 entspricht einer Richtungsänderung von 120° */
export const GEHRUNG_MAX = 2
/** Annahme (Plan A6): «Rand unbekannt» mit beiden Anschlusspunkten höchstens so weit auseinander wird für Schnitte quer zur Fahrbahn
 *  (schnittBord) gerade überbrückt (Fussweg- oder Einfahrtsmündung); weiter auseinander (Platz, Strassenmündung ohne OSM-Weg,
 *  Parkbucht) bleibt der Rand unbekannt */
export const SCHNITT_LUECKE_MAX_M = 10
/** Annahme (Nachtrag K2, wie VERDECKT_TOL_M im VeloroutenCheck messquerschnitt.ts): ein Teil des gemessenen Rands ist verdeckt, wenn an
 *  jedem seiner Eckpunkte ein anderer Teil derselben Seite um mehr als so viel näher an der Fahrbahn liegt */
export const VERDECKT_TOL_M = 0.05
/** Annahme (Nachtrag K3, wie KURZ_M im VeloroutenCheck): getroffene AV-Strecke kürzer als so viel: Richtung als Sehne ±RICHTUNG_SEHNE_M */
export const RICHTUNG_KURZ_M = 0.2
/** Annahme (Nachtrag 5, wie VERBINDUNG_MAX_M im SichtweitenCheck): konstruierte Führung über eine Einmündung bzw. an einem Abschnittsende
 *  höchstens so lang (Seitenstrasse mit beiden Eckausrundungen); länger: verworfen, «Rand unbekannt». An einer Bucht (bestätigt durch
 *  eine Haltestelle, höchstens zweimal BUCHT_SUCHE_M lang) gilt die Grenze nicht */
export const VERBINDUNG_MAX_M = 30
/** Annahme (Nachtrag 5, wie FUEHRUNG_PRUEF_M im SichtweitenCheck): Prüfpunkt der konstruierten Führung so weit innen (zur Fahrbahn hin);
 *  er liegt auf der Fahrbahn, wenn dort eine Fläche Strasse_Weg oder eine Verkehrsinsel liegt */
export const FUEHRUNG_PRUEF_M = 0.3
/** Annahme (Nachtrag 5): Prüfpunkte der konstruierten Führung höchstens so weit auseinander */
export const FUEHRUNG_PRUEF_SCHRITT_M = 1
/** Annahme (Nachtrag 5): konstruierte Führung verworfen, wenn mehr als dieser Anteil ihrer Prüfpunkte neben der Fahrbahn liegt. Eine
 *  Verbindung, die nur an einer Eckausrundung über das Trottoir schneidet, bleibt (Berner Referenzort 1416: 1 von 28 Punkten) */
export const FUEHRUNG_NEBEN_ANTEIL_MAX = 0.5
/** Annahme (Nachtrag 6): Schritt der Verlängerung entlang der Achskrümmung an den Abschnittsenden */
export const KRUEMMUNG_SCHRITT_M = 0.5

// ── AV-Arten (dieselben Namen wie VeloroutenCheck av.ts/breitenmessung.ts und fgsCheck daten/av.ts) ──
export const STRASSE_ART = 'Strasse_Weg'
export const INSEL_ART = 'Verkehrsinsel'
/** Grün wie GRUEN_ARTEN in VeloroutenCheck breitenmessung.ts */
export const GRUEN_ARTEN: readonly string[] = ['Gartenanlage', 'uebrige_humusierte', 'Acker_Wiese_Weide']
/** Kante gegen diese Arten ist Bord; jede andere Art (z. B. uebrige_befestigte, Bahn) und keine Fläche: offen */
/** S6 (14.11.2026, Hinweis des Nutzers): Wald, bestockte Flächen, Kulturen und Gewässer begrenzen die Fahrbahn ebenfalls (in den Testdaten
 *  grenzte Strasse_Weg 30 km an Wald und 0,2 km an Gewässer «offen»); uebrige_befestigte (Parkplatz, Vorplatz) und Bahn bleiben offen */
// Codeprüfung 16.11.2026 (FB13): dazu Wytweide (dicht/offen, wie Wald bzw. Weide), Schilfgürtel und Moor (Namen nach AV DM.01)
export const NATUR_ARTEN: readonly string[] = ['geschlossener_Wald', 'uebrige_bestockte', 'Wytweide_dicht', 'Wytweide_offen', 'Reben',
  'uebrige_Intensivkultur', 'Gewaesser_fliessendes', 'Gewaesser_stehendes', 'Schilfguertel', 'Hoch_Flachmoor']
export const BORD_ARTEN: readonly string[] = ['Trottoir', INSEL_ART, 'Gebaeude', ...GRUEN_ARTEN, ...NATUR_ARTEN]

const STOSS_M = 0.05          // Fahrbahnteile auf der Normalen mit so kleiner Lücke gehören zusammen (Stossstelle zweier Flächen)
const TEIL_TOL_M = 0.02       // fremder Eckpunkt so nah an einer Kante teilt sie
const KETTE_TOL_M = 0.01      // Stücke mit so nahen Enden hängen zusammen
const ZELLE_M = 5             // Raster für Eckpunkte und Stücke
const KLEIN_M = 0.02          // so kurze Stücke zählen für Flanken nicht
const GRAD = Math.PI / 180

// ── Typen ──
/** AV-Fläche in LV95 (wie AvFlaeche in avDienst.ts) */
export interface AvFlaecheLv { art: string; ringe: P[][] }
/** Umgrenzung [minE, minN, maxE, maxN] */
export type Kasten = [number, number, number, number]

export type Nachbar = 'bord' | 'strasse' | 'offen'
/**
 * Stück des Umrisses einer Fläche Strasse_Weg, höchstens STUECK_M lang, Fahrbahn links von a→b.
 * Beispiel: Fahrbahn N −4…4, Trottoir N 4…7 → oberer Umriss in Stücken von 2 m nach Westen, nachbar 'bord', nachbarArt 'Trottoir'.
 */
export interface BordStueck {
  a: P; b: P
  nachbar: Nachbar
  nachbarArt: string | null   // Art der Fläche hinter dem Stück (Prüfpunkt PRUEF_M), null ohne Fläche
  /** Kante einer Insel: Verkehrsinsel dahinter oder Loch der Strassenfläche ohne Fläche (seit 14.11.2026, K1; ein Loch mit Trottoir,
   *  Gebäude oder Grün ist ein Häuserblock und kann Seitenrand sein) */
  insel: boolean
  flaeche: number             // Index in den Flächen der Eingabe
  ring: number
}

/** Abzweigung aus OSM: Knoten mit Seitenarm. Seite ausdrücklich oder aus einem Punkt auf dem Arm; ohne beides gilt sie für beide Seiten. */
/** OSM-Abzweigung. zufahrt (Nachtrag C, C4): Abzweigung einer Zufahrt (highway=service); für das Bordmodell gleich wie eine Strasse,
 *  ein Rechner kann sie unterscheiden (VeloroutenCheck: eine Zufahrt am Abschnittsende ist kein Knoten). nurInsel (Nachtrag C, C1):
 *  zählt nur für die Seiteninsel (Strahl hinter einer Insel, z. B. ein Radweg in der Strassenfläche), nicht für Einmündungen */
export interface Abzweigung { p: P; seite?: Seite; arm?: P; zufahrt?: boolean; nurInsel?: boolean }
/** Bekannte Haltestelle (OSM, BAV, Messung) mit ihrer Seite */
export interface Haltestelle { p: P; seite: Seite }

export interface BordmodellEingabe {
  flaechen: readonly AvFlaecheLv[]
  achse: readonly P[]                     // OSM-Achse des Abschnitts in Abschnittsrichtung (nur Auswahl: Seite, Reihenfolge, Stationen)
  abzweigungen?: readonly Abzweigung[]
  haltestellen?: readonly Haltestelle[]
  schrittM?: number                       // Abstand der Querschnitte (Standard 1 m)
  /** vorberechnete Bordstücke derselben Flächen (Nachtrag 7): bordStuecke(flaechen, bordBereich(achse1, achse2, …)) einmal für mehrere
   *  Achsen; das Ergebnis ist dasselbe wie ohne (dann rechnet das Modell sie für sein eigenes Band) */
  stuecke?: readonly BordStueck[]
  /** Auslegung je Rechner (Nachtrag C, 14.11.2026; gemeinsamer Kern, Abweichungen nur hier und nur mit Beleg) */
  auslegung?: BordAuslegung
}
/** Auslegung des Bordmodells je Rechner. eigenerRand (Vorgabe true): Rand der eigenen Fahrbahn – stellenweise verdeckte Stücke getrennt,
 *  Randstücke einer anderen Fahrbahn entfernt (Nachtrag C). false: jeder physische Bord zählt wie bis Nachtrag B; so endet ein Streifen
 *  im fgsCheck an der Verbindungslinie über eine Mündung bis zum Bord der Querstrasse (Berner Ort 1416: 18,13 m statt 42,4 m).
 *  naturNurParallel (Vorgabe false, FB6): Kanten gegen NATUR_ARTEN nur etwa achsparallel als Bord (naturQuer) */
export interface BordAuslegung { eigenerRand?: boolean; naturNurParallel?: boolean }

// oeffnung (Nachtrag B, BK3, 14.11.2026): Lücke zwischen zwei Teilen des Rands ohne OSM-Abzweigung, über die der Bord in derselben
// Flucht weiterläuft (Fussweg-Öffnung, Zufahrt ohne OSM-Weg): der Fahrbahnrand setzt sich gerade fort
export type StellenArt = 'normal' | 'einmuendung' | 'oeffnung' | 'nase' | 'bucht' | 'unbekannt'
export type AbweichungArt = 'einmuendung' | 'oeffnung' | 'bucht' | 'nase' | 'unbekannt'

/**
 * Abweichung des gemessenen Rands. Beispiel: Seitenstrasse links mit OSM-Abzweigung, Bord N 4 bis E 44 und ab E 56 →
 * { seite: 'links', art: 'einmuendung', s0: 44, s1: 56, von: (44, 4), bis: (56, 4), verbunden: true }.
 */
export interface Abweichung {
  seite: Seite
  art: AbweichungArt
  s0: number; s1: number        // Stationen an der OSM-Achse
  von: P | null; bis: P | null  // Anschlusspunkte auf dem gemessenen Rand; null am Abschnittsanfang bzw. -ende
  /** Führungslinie hier konstruiert verbunden (bestätigte Einmündung, Öffnung in der Bordflucht oder Bucht); false auch, wenn die konstruierte Führung verworfen
   *  wurde (seit 14.11.2026, Nachtrag 5: zu lang oder neben der Fahrbahn, Grund in grund) */
  verbunden: boolean
  tiefe?: number                // Bucht und Nase: Tiefe gegenüber dem Bord daneben [m]
  grund: string
  /** Richtung des Bords an den Anschlusspunkten (Einheitsvektor in Achsrichtung), soweit bestimmbar (seit 14.11.2026, Nachtrag 6:
   *  Anschlusspunkt und Tangente, z. B. für eine eigene Kurve durch den Knoten) */
  richtungVon?: P; richtungBis?: P
}

export interface RandLuecke { s0: number; s1: number; von: P | null; bis: P | null }
/** Gemessener Fahrbahnrand einer Seite: Teile entlang der Achse (Lücken dazwischen), folgt jeder Bucht, Nase und Einmündung.
 *  verdeckt (seit 14.11.2026, K2): entfernte Teile, die ganz hinter einem anderen Teil derselben Seite lagen (nur zur Anzeige).
 *  fremd (Nachtrag C, C2, 14.11.2026): Randstücke einer anderen Fahrbahn, die nicht zum Rand dieser Achse zählen (FREMD_*); sie sind
 *  trotzdem physischer Bord. Für Schnitte quer zur Fahrbahn am physischen Bord (Streifenenden) reicht es nicht, sie wieder dazuzunehmen:
 *  die Teilverdeckung trennt auch Strecken ab, die in verdeckt landen (Codeprüfung 16.11.2026, FB3, Querung 1416). Dafür das Modell mit
 *  auslegung.eigenerRand = false rechnen (so der fgsCheck in bordquelle.ts) */
export interface GemessenerRand { teile: P[][]; luecken: RandLuecke[]; verdeckt: P[][]; fremd: P[][] }
/** Konstruierte Führung: gerade Verbindung bzw. Verlängerung an einem Abschnittsende (linie: von … bis, in Achsrichtung) */
export interface Verbindung { art: 'einmuendung' | 'oeffnung' | 'bucht'; von: P; bis: P; linie: P[] }
/**
 * Führungslinie der Markierung einer Seite: über bestätigte Einmündungen und Buchten gerade (verbindungen), sonst wie der Rand.
 * konstruiert[t][k] (seit 14.11.2026, Nachtrag 5): Strecke k (Punkt k → k+1) des Teils t ist konstruiert (Verbindung, Verlängerung),
 * nicht gemessener Bord.
 */
export interface Fuehrungslinie { teile: P[][]; verbindungen: Verbindung[]; konstruiert: boolean[][] }

export interface QuerPunkt {
  punkt: P | null               // Bordpunkt (Schnitt der Achsnormalen mit dem gemessenen Rand), null ohne Bord
  quer: number | null           // Lage auf der Achsnormalen ab der Achse [m], positiv links
  herkunft: 'av' | 'unbekannt'
  art: StellenArt
  /** Richtung der getroffenen AV-Strecke (Einheitsvektor in Achsrichtung, auch an einer Flanke), null ohne Bordpunkt (seit 14.11.2026, K3) */
  richtung: P | null
  /** Ende der Masslinie auf dem Messquerschnitt: senkrecht zum Bord (Querschnitt.richtung) durch die Mitte der beiden Bordpunkte, auf
   *  der Bordgeraden dieser Seite; null ohne Breite (seit 14.11.2026, K4) */
  mess: P | null
}
/**
 * Querschnitt an der Station s. Beispiel: Fahrbahn N −4…4, Achse 5° schief → links (s, 4), rechts (s, −4) auf der schiefen Normalen,
 * breite 8,00 (nicht 8,03).
 */
export interface Querschnitt {
  s: number
  achse: P                      // Achspunkt
  normale: P                    // Achsnormale nach links (Einheitsvektor)
  links: QuerPunkt; rechts: QuerPunkt
  breite: number | null         // senkrecht zur örtlichen Randrichtung zwischen den beiden Bordpunkten (= Länge der Masslinie)
  /** örtliche Randrichtung (Einheitsvektor in Achsrichtung): Mittel der Richtungen der getroffenen AV-Strecken beider Seiten (K3), soweit
   *  höchstens EINM_WINKEL_GRAD von der Achse; null ohne solchen Rand (seit 13.11.2026 spät, Plan A6: Messrichtung senkrecht zum Bord im
   *  fgsCheck). Beispiel: 1 m vor der Ecke einer Trottoirnase bleibt sie längs der Fahrbahn (die Sehne ±1 m neigte sich dort) */
  richtung: P | null
}

export interface AchsLage {
  achse: P[]
  laenge: number
  /** Station s und Querabstand q (positiv links); hinter den Enden auf der verlängerten ersten bzw. letzten Teilstrecke (s < 0, s > Länge).
   *  Beispiel Achse (0,0)–(100,0): (−20, −4) → s −20, q −4; (130, 3) → s 130, q 3. */
  station: (p: P) => { s: number; q: number }
  /** Punkt bei s (q positiv links), hinter den Enden auf der verlängerten Achse */
  punkt: (s: number, q?: number) => P
  /** Richtung bei s als Sehne ±RICHTUNG_SEHNE_M (an einem Knick allmählich) */
  richtung: (s: number) => P
  richtungAnfang: P; richtungEnde: P   // erste bzw. letzte Teilstrecke: Abschnittsenden senkrecht dazu
}

export interface Bordmodell {
  achse: AchsLage
  stuecke: BordStueck[]
  stueckSeite: (Seite | null)[]      // Seite, von der aus die Achse das Stück als nächsten Bord trifft
  rand: Record<Seite, GemessenerRand>
  fuehrung: Record<Seite, Fuehrungslinie>
  abweichungen: Abweichung[]
  querschnitte: Querschnitt[]        // alle schrittM von 0 bis zur Länge
  querschnitt: (s: number) => Querschnitt
}

// ── kleine Hilfen ──
const neg = (a: P): P => [-a[0], -a[1]]
const kasten = (pts: Iterable<P>): Kasten => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const [e, n] of pts) { a = Math.min(a, e); b = Math.min(b, n); c = Math.max(c, e); d = Math.max(d, n) }
  return [a, b, c, d]
}
const ueberlappt = (a: Kasten, b: Kasten, rand = 0) => a[0] <= b[2] + rand && a[2] >= b[0] - rand && a[1] <= b[3] + rand && a[3] >= b[1] - rand
const imKasten = (p: P, b: Kasten) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]
const winkelGrad = (a: P, b: P) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) / GRAD
const zk = (ix: number, iy: number) => ix + ':' + iy
const f1 = (x: number) => x.toFixed(1).replace('.', ',')
const f2 = (x: number) => x.toFixed(2).replace('.', ',')
/** Ring ohne Wiederholung des ersten Punkts */
const offenerRing = (r: readonly P[]): P[] => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r.slice())
/** Vorzeichenbehaftete Fläche (positiv gegen den Uhrzeigersinn), um den ersten Punkt gerechnet (grosse LV95-Werte) */
function ringFlaeche(r: P[]): number {
  let a = 0
  for (let i = 1; i < r.length - 1; i++) a += kreuz(sub(r[i], r[0]), sub(r[i + 1], r[0]))
  return a / 2
}
function abstandStrecke(p: P, a: P, b: P): number {
  const e = sub(b, a), l2 = dot(e, e)
  const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), e) / l2)) : 0
  return dist(p, add(a, e, t))
}
/** Schnitt der Geraden p + t·r und q + u·s, null wenn parallel */
function schnittGeraden(p: P, r: P, q: P, s: P): P | null {
  const den = kreuz(r, s)
  if (Math.abs(den) < 1e-12) return null
  return add(p, r, kreuz(sub(q, p), s) / den)
}
function schnittStrecken(a: P, b: P, c: P, d: P): P | null {
  const r = sub(b, a), s = sub(d, c), den = kreuz(r, s)
  if (Math.abs(den) < 1e-12) return null
  const w = sub(c, a), t = kreuz(w, s) / den, u = kreuz(w, r) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? add(a, r, t) : null
}
/** Stationen 0, h, 2h, …, L (L immer dabei) */
function stationen(L: number, h: number): number[] {
  const n = Math.floor(L / h + 1e-9), aus: number[] = []
  for (let i = 0; i <= n; i++) aus.push(i * h)
  if (!aus.length || L - aus[aus.length - 1] > 1e-6) aus.push(L)
  return aus
}

// ── 1. Bordstücke ──
/**
 * Stücke des Umrisses aller Flächen Strasse_Weg mit der Art dahinter. bereich: nur Stücke, die diese Umgrenzung berühren.
 * Beispiel: zwei Strassenflächen E −50…50 und 50…150 → die Stossstelle E 50 ist 'strasse', die Kanten gegen das Trottoir 'bord'.
 */
export function bordStuecke(flaechen: readonly AvFlaecheLv[], bereich?: Kasten): BordStueck[] {
  const alle = flaechen.map((f, i) => ({ f, i, box: kasten(f.ringe.flat()) })).filter(x => x.f.ringe.length && x.f.ringe[0].length >= 3)
  // Eckpunkte aller Flächen im Raster: eine Kante wird an fremden Eckpunkten geteilt (Stossstelle einer Seitenstrasse, Wechsel der Art).
  // Seit 14.11.2026 (Nachtrag 7) alle Eckpunkte in der Umgrenzung der Kanten, die den Bereich berühren, auch weit draussen auf einer
  // langen Kante: die Teilung einer Kante hängt so nicht vom Bereich ab, und vorberechnete Stücke eines grösseren Bereichs sind an jeder
  // Stelle dieselben
  let ub: Kasten | null = null
  if (bereich) {
    ub = [Infinity, Infinity, -Infinity, -Infinity]
    for (const x of alle) {
      if (x.f.art !== STRASSE_ART || !ueberlappt(x.box, bereich)) continue
      for (const roh of x.f.ringe) for (let i = 0; i < roh.length; i++) {
        const kb = kasten([roh[i], roh[(i + 1) % roh.length]])
        if (ueberlappt(kb, bereich)) ub = [Math.min(ub[0], kb[0]), Math.min(ub[1], kb[1]), Math.max(ub[2], kb[2]), Math.max(ub[3], kb[3])]
      }
    }
  }
  const raster = new Map<string, P[]>()
  for (const x of alle) {
    if (ub && !ueberlappt(x.box, ub, 1)) continue
    for (const r of x.f.ringe) for (const p of r) {
      if (ub && (p[0] < ub[0] - 1 || p[0] > ub[2] + 1 || p[1] < ub[1] - 1 || p[1] > ub[3] + 1)) continue
      const k = zk(Math.floor(p[0] / ZELLE_M), Math.floor(p[1] / ZELLE_M)), l = raster.get(k)
      if (l) l.push(p); else raster.set(k, [p])
    }
  }
  const nachbarVon = (q: P, eigen: number): { nachbar: Nachbar; art: string | null } => {
    let art: string | null = null
    for (const x of alle) {
      if (x.i === eigen || !imKasten(q, x.box) || !imPolygon(q, x.f.ringe)) continue
      if (x.f.art === STRASSE_ART) return { nachbar: 'strasse', art: x.f.art }
      if (art === null || (!BORD_ARTEN.includes(art) && BORD_ARTEN.includes(x.f.art))) art = x.f.art
    }
    return { nachbar: art !== null && BORD_ARTEN.includes(art) ? 'bord' : 'offen', art }
  }
  const aus: BordStueck[] = []
  for (const x of alle) {
    if (x.f.art !== STRASSE_ART || (bereich && !ueberlappt(x.box, bereich))) continue
    x.f.ringe.forEach((roh, ri) => {
      const r = offenerRing(roh)
      if (r.length < 3) return
      const fl = ringFlaeche(r)
      const innenLinks = ri === 0 ? fl > 0 : fl < 0      // Aussenring gegen den Uhrzeigersinn bzw. Loch im Uhrzeigersinn: Fläche links
      for (let i = 0; i < r.length; i++) {
        let a = r[i], b = r[(i + 1) % r.length]
        if (!innenLinks) [a, b] = [b, a]
        const e = sub(b, a), l2 = dot(e, e)
        if (l2 < 1e-4) continue
        const kb = kasten([a, b])
        if (bereich && !ueberlappt(kb, bereich)) continue
        const teil: { u: number; p: P }[] = [{ u: 0, p: a }, { u: 1, p: b }]
        const ix0 = Math.floor((kb[0] - TEIL_TOL_M) / ZELLE_M), ix1 = Math.floor((kb[2] + TEIL_TOL_M) / ZELLE_M)
        const iy0 = Math.floor((kb[1] - TEIL_TOL_M) / ZELLE_M), iy1 = Math.floor((kb[3] + TEIL_TOL_M) / ZELLE_M)
        const l = Math.sqrt(l2)
        for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) for (const v of raster.get(zk(ix, iy)) ?? []) {
          const w = sub(v, a), u = dot(w, e) / l2
          if (u * l <= 0.005 || (1 - u) * l <= 0.005 || Math.abs(kreuz(e, w)) / l > TEIL_TOL_M) continue
          teil.push({ u, p: v })
        }
        teil.sort((p, q) => p.u - q.u)
        const pkt: P[] = []
        for (const t of teil) if (!pkt.length || dist(pkt[pkt.length - 1], t.p) > 0.005) pkt.push(t.p)
        pkt[pkt.length - 1] = b
        for (let k = 1; k < pkt.length; k++) {
          const p0 = pkt[k - 1], p1 = pkt[k], d = sub(p1, p0), n = Math.max(1, Math.ceil(dist(p0, p1) / STUECK_M - 1e-9))
          for (let j = 0; j < n; j++) {
            const s0 = j === 0 ? p0 : add(p0, d, j / n), s1 = j === n - 1 ? p1 : add(p0, d, (j + 1) / n)
            if (bereich && !ueberlappt(kasten([s0, s1]), bereich)) continue
            const m: P = [(s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2]
            const nb = nachbarVon(add(m, links(einheit(sub(s1, s0))), -PRUEF_M), x.i)   // Prüfpunkt rechts = aussen
            aus.push({ a: s0, b: s1, nachbar: nb.nachbar, nachbarArt: nb.art, insel: nb.art === INSEL_ART || (ri > 0 && nb.art === null), flaeche: x.i, ring: ri })
          }
        }
      }
    })
  }
  return aus
}

/**
 * Bereich, für den bordmodell die Bordstücke einer Achse braucht (Umgrenzung der Achse ± 2·BAND_M, mit 1 m Zugabe); mit mehreren Achsen
 * die gemeinsame Umgrenzung (Nachtrag 7). Beispiel: Arme eines Knotens → einmal bordStuecke(flaechen, bordBereich(arm1, arm2, arm3)),
 * dann bordmodell({ …, achse: armX, stuecke }) je Arm.
 */
export function bordBereich(...achsen: readonly (readonly P[])[]): Kasten {
  const k = kasten(achsen.flatMap(a => a.map(p => [p[0], p[1]] as P)))
  const z = 2 * BAND_M + 1
  return [k[0] - z, k[1] - z, k[2] + z, k[3] + z]
}

// ── Achse ──
/** Lage an der OSM-Achse mit verlängerten Enden (wie Abwicklung.stationFrei im VeloroutenCheck) */
export function achsLage(achseRoh: readonly P[]): AchsLage {
  const a: P[] = []
  for (const p of achseRoh) if (!a.length || dist(a[a.length - 1], p) > 0.05) a.push([p[0], p[1]])
  const st = [0]
  for (let i = 1; i < a.length; i++) st.push(st[i - 1] + dist(a[i - 1], a[i]))
  const L = st[st.length - 1] ?? 0
  const dir = a.slice(1).map((p, i) => einheit(sub(p, a[i])))
  const richtungAnfang: P = dir[0] ?? [1, 0], richtungEnde: P = dir[dir.length - 1] ?? [1, 0]
  const seg = (s: number) => {
    if (s <= 0) return 1
    if (s >= L) return a.length - 1
    let lo = 1, hi = a.length - 1
    while (lo < hi) { const m = (lo + hi) >> 1; if (st[m] < s) lo = m + 1; else hi = m }
    return lo
  }
  const punkt = (s: number, q = 0): P => {
    if (a.length < 2) return a[0] ? [a[0][0], a[0][1]] : [0, 0]
    const i = seg(s), d = dir[i - 1]
    return add(add(a[i - 1], d, s - st[i - 1]), links(d), q)
  }
  const richtung = (s: number): P => {
    if (a.length < 2) return [1, 0]
    const r = einheit(sub(punkt(s + RICHTUNG_SEHNE_M), punkt(s - RICHTUNG_SEHNE_M)))
    return r[0] || r[1] ? r : dir[seg(s) - 1]
  }
  const station = (p: P) => {
    if (a.length < 2) return { s: 0, q: 0 }
    let best = Infinity, s = 0, q = 0
    for (let i = 1; i < a.length; i++) {
      const d = dir[i - 1], len = st[i] - st[i - 1], w = sub(p, a[i - 1])
      const u = Math.max(0, Math.min(len, dot(w, d))), dd = dist(p, add(a[i - 1], d, u))
      if (dd < best - 1e-12) { best = dd; s = st[i - 1] + u; q = Math.sign(kreuz(d, w)) * dd }
    }
    if (s <= 1e-9) { const w = sub(p, a[0]), t = dot(w, richtungAnfang); if (t < 0) return { s: t, q: kreuz(richtungAnfang, w) } }
    if (s >= L - 1e-9) { const w = sub(p, a[a.length - 1]), t = dot(w, richtungEnde); if (t > 0) return { s: L + t, q: kreuz(richtungEnde, w) } }
    return { s, q }
  }
  return { achse: a, laenge: L, station, punkt, richtung, richtungAnfang, richtungEnde }
}

// ── Teil des gemessenen Rands (Polylinie in Achsrichtung) ──
interface Teil { p: P[]; lam: number[]; s: number[]; q: number[] }
const teilVon = (p: P[], ach: AchsLage): Teil => {
  const lam = [0]
  for (let i = 1; i < p.length; i++) lam.push(lam[i - 1] + dist(p[i - 1], p[i]))
  const sq = p.map(x => ach.station(x))
  return { p, lam, s: sq.map(x => x.s), q: sq.map(x => x.q) }
}
const teilLaenge = (T: Teil) => T.lam[T.lam.length - 1]
function punktBei(T: Teil, l: number): P {
  const n = T.p.length
  if (l <= 0) return T.p[0]
  if (l >= T.lam[n - 1]) return T.p[n - 1]
  let i = 1
  while (i < n - 1 && T.lam[i] < l) i++
  const d = T.lam[i] - T.lam[i - 1]
  return d > 0 ? add(T.p[i - 1], sub(T.p[i], T.p[i - 1]), (l - T.lam[i - 1]) / d) : T.p[i]
}
/** Bogenlänge und Abstand des nächsten Punkts auf dem Teil */
function lageAuf(T: Teil, p: P): { lam: number; d: number } {
  let best = Infinity, lam = 0
  for (let i = 1; i < T.p.length; i++) {
    const a = T.p[i - 1], e = sub(T.p[i], a), l2 = dot(e, e)
    const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), e) / l2)) : 0
    const d = dist(p, add(a, e, t))
    if (d < best) { best = d; lam = T.lam[i - 1] + t * (T.lam[i] - T.lam[i - 1]) }
  }
  return { lam, d: best }
}
/** Schnitte der Geraden o + t·n mit dem Teil, |t| ≤ maxT: Parameter t, Strecke k (Punkt k → k+1) und Bogenlänge */
function teilSchnitte(T: Teil, o: P, n: P, maxT: number): { t: number; k: number; lam: number }[] {
  const aus: { t: number; k: number; lam: number }[] = []
  for (let i = 1; i < T.p.length; i++) {
    const a = T.p[i - 1], e = sub(T.p[i], a), den = kreuz(n, e)
    if (Math.abs(den) < 1e-12) continue
    const w = sub(a, o), t = kreuz(w, e) / den, u = kreuz(w, n) / den
    if (u < -1e-9 || u > 1 + 1e-9 || Math.abs(t) > maxT) continue
    aus.push({ t, k: i - 1, lam: T.lam[i - 1] + Math.max(0, Math.min(1, u)) * (T.lam[i] - T.lam[i - 1]) })
  }
  return aus
}
/** Richtung des Teils auf der Strecke k (in Laufrichtung), auf einer sehr kurzen Strecke (RICHTUNG_KURZ_M) die Sehne ±RICHTUNG_SEHNE_M um lam */
function teilRichtung(T: Teil, k: number, lam: number): P | null {
  const r = T.lam[k + 1] - T.lam[k] >= RICHTUNG_KURZ_M ? einheit(sub(T.p[k + 1], T.p[k]))
    : einheit(sub(punktBei(T, lam + RICHTUNG_SEHNE_M), punktBei(T, lam - RICHTUNG_SEHNE_M)))
  return r[0] || r[1] ? r : null
}
/** Punkte des Teils zwischen den Bogenlängen l0 und l1 (Enden eingesetzt) */
function teilStueck(T: Teil, l0: number, l1: number): P[] {
  const aus: P[] = [punktBei(T, l0)]
  for (let i = 0; i < T.p.length; i++) if (T.lam[i] > l0 + 1e-9 && T.lam[i] < l1 - 1e-9) aus.push(T.p[i])
  if (l1 > l0 + 1e-9) aus.push(punktBei(T, l1))
  return aus
}
/** Polylinie auf der Seite dot(p − p0, d) ≥ 0 behalten (Abschnittsende senkrecht zur Achse) */
function halbebene(pl: P[], p0: P, d: P): P[][] {
  const aus: P[][] = []
  let cur: P[] = []
  const f = (p: P) => dot(sub(p, p0), d)
  for (let i = 0; i < pl.length; i++) {
    const v = pl[i], fv = f(v)
    if (i > 0) {
      const u = pl[i - 1], fu = f(u)
      if ((fu >= 0) !== (fv >= 0)) {
        const x = add(u, sub(v, u), fu / (fu - fv))
        if (fu >= 0) { if (!cur.length || dist(cur[cur.length - 1], x) > 1e-9) cur.push(x); if (cur.length >= 2) aus.push(cur); cur = [] } else cur = [x]
      }
    }
    if (fv >= 0 && (!cur.length || dist(cur[cur.length - 1], v) > 1e-9)) cur.push(v)
  }
  if (cur.length >= 2) aus.push(cur)
  return aus
}

// Steile Stücke eines Teils, zu Flanken gruppiert (k0…k1: Stücke p[k]→p[k+1]); aus = Flanke vom Bord weg nach aussen.
// Nachtrag B, BK1: zwei gleich gerichtete Flanken gelten als eine, wenn der Bord zwischen ihnen keinen Anschlusspunkt hergibt, d. h. vom
// Ende der ersten Flanke bis zum Anschlusspunkt vor der zweiten (aus) bzw. vom Anschlusspunkt nach der ersten bis zur zweiten (ein) liegen
// weniger als ANKER_SONDE_M gerader Bord (dort liesse sich auch keine Richtung des Bords bestimmen). Beispiel Knoten 282774166, Bürkiweg:
// Absatz 2,42 m nach aussen, 0,52 m flach, dann die Ausrundung → eine Flanke, Anschlusspunkt an der Trottoirecke vor dem Absatz
interface Flanke { k0: number; k1: number; aus: boolean }
function flanken(T: Teil, X: Seite, ach: AchsLage, nahAbzweigung: (p: P) => boolean = () => false): Flanke[] {
  const sg = X === 'links' ? 1 : -1, aus: Flanke[] = []
  let cur: Flanke | null = null
  for (let k = 0; k < T.p.length - 1; k++) {
    if (T.lam[k + 1] - T.lam[k] < KLEIN_M) continue
    const d = einheit(sub(T.p[k + 1], T.p[k])), r = ach.richtung((T.s[k] + T.s[k + 1]) / 2)
    const grenze = nahAbzweigung([(T.p[k][0] + T.p[k + 1][0]) / 2, (T.p[k][1] + T.p[k + 1][1]) / 2]) ? FLANKE_ABZW_GRAD : EINM_WINKEL_GRAD
    if (winkelGrad(d, r) <= grenze) { cur = null; continue }
    const nachAussen = sg * (T.q[k + 1] - T.q[k]) >= 0
    if (cur && cur.aus === nachAussen) cur.k1 = k
    else { cur = { k0: k, k1: k, aus: nachAussen }; aus.push(cur) }
  }
  for (let i = 1; i < aus.length;) {
    const g1 = aus[i - 1], g2 = aus[i]
    if (g1.aus === g2.aus) {
      const l1 = T.lam[g1.k1 + 1], l2 = T.lam[g2.k0]
      const gerade = g2.aus ? T.lam[ankerVor(T, g2.k0, l1)] - l1 : l2 - T.lam[ankerNach(T, g1.k1 + 1, l2)]
      if (gerade < ANKER_SONDE_M - 1e-9) { g1.k1 = g2.k1; aus.splice(i, 1); continue }
    }
    i++
  }
  return aus
}
const ersteEchte = (T: Teil) => { let k = 0; while (k < T.p.length - 2 && T.lam[k + 1] - T.lam[k] < KLEIN_M) k++; return k }
const letzteEchte = (T: Teil) => { let k = T.p.length - 2; while (k > 0 && T.lam[k + 1] - T.lam[k] < KLEIN_M) k--; return k }

/** Anschlusspunkt vor einer Flanke (erstes steiles Stück k): ab SUCHE_M davor (nicht vor lamMin) vorwärts bis zur ersten Ecke, nach der
 *  der Bord ANKER_SONDE_M weiter vorne mehr als ANKER_TOL_M von der Geraden der letzten ANKER_SONDE_M abweicht. → Index der Ecke */
function ankerVor(T: Teil, k: number, lamMin: number): number {
  let i = 0
  while (i < k && T.lam[i] < Math.max(lamMin, T.lam[k] - SUCHE_M) - 1e-9) i++
  for (; i < k; i++) {
    const v = T.p[i], h = punktBei(T, Math.max(lamMin, T.lam[i] - ANKER_SONDE_M))
    if (dist(h, v) < 0.5) continue
    const r = einheit(sub(v, h)), sonde = punktBei(T, T.lam[i] + ANKER_SONDE_M)
    if (Math.abs(kreuz(r, sub(sonde, v))) > ANKER_TOL_M) return i
  }
  return k
}
/** Anschlusspunkt nach einer Flanke (endet an der Ecke k): gespiegelt zu ankerVor, höchstens bis lamMax */
function ankerNach(T: Teil, k: number, lamMax: number): number {
  let i = T.p.length - 1
  while (i > k && T.lam[i] > Math.min(lamMax, T.lam[k] + SUCHE_M) + 1e-9) i--
  for (; i > k; i--) {
    const v = T.p[i], h = punktBei(T, Math.min(lamMax, T.lam[i] + ANKER_SONDE_M))
    if (dist(h, v) < 0.5) continue
    const r = einheit(sub(v, h)), sonde = punktBei(T, T.lam[i] - ANKER_SONDE_M)
    if (Math.abs(kreuz(r, sub(sonde, v))) > ANKER_TOL_M) return i
  }
  return k
}
/** Richtung des Bords am Anschlusspunkt (in Achsrichtung), aus dem Stück davor (vor) bzw. danach (nach); ohne Platz null */
function tangente(T: Teil, i: number, wo: 'vor' | 'nach'): P | null {
  const q = punktBei(T, T.lam[i] + (wo === 'vor' ? -ANKER_SONDE_M : ANKER_SONDE_M))
  if (dist(q, T.p[i]) < 0.5) return null
  return wo === 'vor' ? einheit(sub(T.p[i], q)) : einheit(sub(q, T.p[i]))
}
/** Grösste Richtungsänderung der Flanke gegenüber der Richtung r [Grad] */
function wendung(T: Teil, g: Flanke, r: P): number {
  let w = 0
  for (let k = g.k0; k <= g.k1; k++) if (T.lam[k + 1] - T.lam[k] >= KLEIN_M) w = Math.max(w, winkelGrad(einheit(sub(T.p[k + 1], T.p[k])), r))
  return w
}

/** Bucht an der Haltestelle (Fusspunkt lamF): Sohle bei der Haltestelle, Schultern davor und danach mindestens BUCHT_MIN_TIEFE_M weiter
 *  innen, dort wieder parallel zur Sohle. → Ecken der Schultern (Anschlusspunkte) und Tiefe, sonst null */
function buchtSuchen(T: Teil, lamF: number, X: Seite): { iA: number; iB: number; tiefe: number } | null {
  const f = punktBei(T, lamF)
  const r = einheit(sub(punktBei(T, lamF + RICHTUNG_SEHNE_M), punktBei(T, lamF - RICHTUNG_SEHNE_M)))
  const aussen = X === 'links' ? links(r) : neg(links(r))
  const innen = (v: P) => dot(sub(f, v), aussen)        // > 0: v liegt weiter innen (zur Fahrbahn hin) als die Sohle
  const parallel = Math.cos(BUCHT_PARALLEL_GRAD * GRAD), n = T.p.length
  let iA = -1, iB = -1
  {
    let i = n - 1, tief = false
    while (i > 0 && T.lam[i] >= lamF) i--
    for (; i > 0 && lamF - T.lam[i] <= BUCHT_SUCHE_M; i--) {
      if (!tief && innen(T.p[i]) < BUCHT_MIN_TIEFE_M) continue
      tief = true
      if (dot(einheit(sub(T.p[i], T.p[i - 1])), r) >= parallel) { iA = i; break }
    }
  }
  {
    let i = 0, tief = false
    while (i < n - 1 && T.lam[i] <= lamF) i++
    for (; i < n - 1 && T.lam[i] - lamF <= BUCHT_SUCHE_M; i++) {
      if (!tief && innen(T.p[i]) < BUCHT_MIN_TIEFE_M) continue
      tief = true
      if (dot(einheit(sub(T.p[i + 1], T.p[i])), r) >= parallel) { iB = i; break }
    }
  }
  if (iA < 0 || iB < 0) return null
  const A = T.p[iA], B = T.p[iB], dAB = einheit(sub(B, A)), ausAB = X === 'links' ? links(dAB) : neg(links(dAB))
  for (let i = iA + 1; i < iB; i++) if (dot(sub(T.p[i], A), ausAB) < -ANKER_TOL_M) return null   // Rand ragt über die Verbindung hinein
  return { iA, iB, tiefe: Math.min(innen(A), innen(B)) }
}

// ── 2.–5. Bordmodell ──
interface Treffer { t: number; punkt: P; stueck: number | null; grund: 'bord' | 'offen' | 'band' }
interface Strahl { s: number; o: P; n: P; links: Treffer | null; rechts: Treffer | null }
interface Lage { t: number; lam: number }
interface Ersatz { art: AbweichungArt; a: Lage | null; b: Lage | null; verbunden: boolean; grund: string; tiefe?: number }
const VORRANG: Record<AbweichungArt, number> = { bucht: 3, einmuendung: 2, oeffnung: 1.5, unbekannt: 1, nase: 0 }

/**
 * Bordmodell eines Abschnitts aus den AV-Flächen und der OSM-Achse.
 * Beispiel: Strasse_Weg E −50…150 × N −4…4 mit Trottoir beidseits, Achse (0,0)–(100,0) → rand.links ein Teil (0,4)…(100,4), rand.rechts
 * (0,−4)…(100,−4), Querschnitte alle 1 m mit Breite 8,00, Herkunft 'av', Art 'normal'.
 */
/** Codeprüfung 16.11.2026 (FB6, Querung 236 Turnierstrasse am Luftbild): eine Kante gegen Wald, Gewässer usw. (NATUR_ARTEN) ist nur dort
 *  Bord, wo sie etwa achsparallel läuft (Richtung über NATUR_FENSTER_M um die Stückmitte, höchstens NATUR_GRAD zur Achse). Ein schräg
 *  von der Fahrbahn weglaufender Waldrand hinter einem Kiesstreifen wurde sonst Rand der Zufahrt, die Sichtpunkte lagen neben dem Fahrstreifen.
 *  Sonst gilt die Kante wie vor S6 als offen. Nur mit auslegung.naturNurParallel (fgsCheck): im SichtweitenCheck machte die Regel die
 *  Waldecke am Sustenweg 253634793 offen, die Zufahrt erhielt eine 24 m lange Mündung und D rückte an die Inselspitze. */
export const NATUR_GRAD = 10
export const NATUR_FENSTER_M = 2.5
function naturQuer(st: BordStueck[], ach: AchsLage): BordStueck[] {
  const natur = new Set(NATUR_ARTEN)
  const idx = st.map((_, k) => k).filter(k => st[k].nachbar === 'bord' && st[k].nachbarArt !== null && natur.has(st[k].nachbarArt!))
  if (!idx.length || ach.laenge <= 0) return st
  const zelle = new Map<string, number[]>()
  for (const k of idx) for (const p of [st[k].a, st[k].b]) {
    const z = zk(Math.floor(p[0] / ZELLE_M), Math.floor(p[1] / ZELLE_M)), l = zelle.get(z)
    if (l) l.push(k); else zelle.set(z, [k])
  }
  const grenze = Math.cos(NATUR_GRAD * GRAD)
  const aus = st.slice()
  for (const k of idx) {
    const x = st[k], m: P = [(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2], sq = ach.station(m)
    if (Math.abs(sq.q) > BAND_M || sq.s < -BAND_M || sq.s > ach.laenge + BAND_M) continue
    // Hauptrichtung der Kantenpunkte derselben Fläche im Fenster (gewichtet nach Stücklänge)
    let sxx = 0, sxy = 0, syy = 0, w = 0
    const gesehen = new Set<number>()
    const ix = Math.floor(m[0] / ZELLE_M), iy = Math.floor(m[1] / ZELLE_M)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of zelle.get(zk(ix + dx, iy + dy)) ?? []) {
      if (gesehen.has(j)) continue
      gesehen.add(j)
      const y = st[j]
      if (y.flaeche !== x.flaeche || y.ring !== x.ring) continue
      const c: P = [(y.a[0] + y.b[0]) / 2, (y.a[1] + y.b[1]) / 2]
      if (dist(c, m) > NATUR_FENSTER_M) continue
      const d = sub(y.b, y.a), l = Math.hypot(d[0], d[1])
      if (l < 1e-9) continue
      const u = [d[0] / l, d[1] / l]
      sxx += l * u[0] * u[0]; sxy += l * u[0] * u[1]; syy += l * u[1] * u[1]; w += l
    }
    if (w <= 0) continue
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), r: P = [Math.cos(th), Math.sin(th)]
    if (Math.abs(dot(r, ach.richtung(Math.max(0, Math.min(ach.laenge, sq.s))))) < grenze) aus[k] = { ...x, nachbar: 'offen' }
  }
  return aus
}

export function bordmodell(e: BordmodellEingabe): Bordmodell {
  const ach = achsLage(e.achse)
  const L = ach.laenge, schritt = e.schrittM && e.schrittM > 0 ? e.schrittM : 1
  const eigenerRand = e.auslegung?.eigenerRand ?? true
  const ka = kasten(ach.achse.length ? ach.achse : [[0, 0]])
  const bereich: Kasten = [ka[0] - 2 * BAND_M, ka[1] - 2 * BAND_M, ka[2] + 2 * BAND_M, ka[3] + 2 * BAND_M]
  const roh = e.stuecke ? e.stuecke.slice() : bordStuecke(e.flaechen, bereich)
  const stuecke = e.auslegung?.naturNurParallel ? naturQuer(roh, ach) : roh
  const gueltig = e.flaechen.filter(f => f.ringe.length && f.ringe[0].length >= 3)
  const strassen = gueltig.filter(f => f.art === STRASSE_ART).map(f => ({ ringe: f.ringe, box: kasten(f.ringe[0]) }))
  const inseln = gueltig.filter(f => f.art === INSEL_ART).map(f => ({ ringe: f.ringe, box: kasten(f.ringe[0]) }))
  // alle übrigen Flächen im Bereich (K1: liegt in der Lücke eine davon, ist sie keine Insel)
  const uebrige = gueltig.filter(f => f.art !== STRASSE_ART && f.art !== INSEL_ART).map(f => ({ ringe: f.ringe, box: kasten(f.ringe[0]) }))
    .filter(x => ueberlappt(x.box, bereich))
  const aufStrasse = (p: P) => strassen.some(x => imKasten(p, x.box) && imPolygon(p, x.ringe))
  const mitte = (k: number): P => { const x = stuecke[k]; return [(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2] }

  // Randstücke (ohne Stossstellen) im Raster, für die Suche entlang der Normalen
  const randIdx = stuecke.map((_, k) => k).filter(k => stuecke[k].nachbar !== 'strasse')
  const raster = new Map<string, number[]>()
  for (const k of randIdx) {
    const b = kasten([stuecke[k].a, stuecke[k].b])
    for (let ix = Math.floor(b[0] / ZELLE_M); ix <= Math.floor(b[2] / ZELLE_M); ix++) for (let iy = Math.floor(b[1] / ZELLE_M); iy <= Math.floor(b[3] / ZELLE_M); iy++) {
      const key = zk(ix, iy), l = raster.get(key)
      if (l) l.push(k); else raster.set(key, [k])
    }
  }
  // K1 (seit 14.11.2026): Lücke auf der Normalen ist eine Insel, wenn dort eine Verkehrsinsel liegt oder ein Loch der Strassenfläche ohne
  // jede Fläche. Ein Loch mit Trottoir, Gebäude oder Grün ist ein Häuserblock: nicht überbrückt (Aegertenstrasse, Vorplatz im Block)
  const istInsel = (m: P) => inseln.some(x => imKasten(m, x.box) && imPolygon(m, x.ringe)) ||
    (strassen.some(x => imKasten(m, x.box) && imPolygon(m, [x.ringe[0]]) && !imPolygon(m, x.ringe)) &&
      !uebrige.some(x => imKasten(m, x.box) && imPolygon(m, x.ringe)))
  // C1 (Nachtrag C): Strahlen der OSM-Abzweigungen; eine Insel neben der Achse, hinter der eine andere Strasse fast parallel verläuft,
  // ist Seitenbord (nicht überbrückt)
  const abzwStrahlen = (e.abzweigungen ?? []).filter(z => z.arm && dist(z.p, z.arm) > 1e-6).map(z => ({ p: z.p, d: einheit(sub(z.arm!, z.p)) }))
  const seitenInsel = (s: number, o: P, n: P, m: [number, number], x: [number, number]): boolean => {
    if (!abzwStrahlen.length || (m[1] <= 0 && x[0] >= 0)) return false          // Insel auf der Achse: Mittelinsel
    const fern = m[1] > 0 ? x : m, r = ach.richtung(s), grenze = Math.cos(SEITENINSEL_WINKEL_GRAD * GRAD)
    return abzwStrahlen.some(({ p, d }) => {
      if (Math.abs(dot(d, r)) < grenze) return false
      const den = kreuz(n, d)
      if (Math.abs(den) < 1e-12) return false
      const w = sub(p, o), t = kreuz(w, d) / den, u = kreuz(w, n) / den
      return u >= -1e-6 && u <= SEITENINSEL_STRAHL_M && t >= fern[0] - 1e-6 && t <= fern[1] + 1e-6
    })
  }
  const treffer = (o: P, n: P, t: number, sb: Kasten): Treffer | null => {
    if (Math.abs(t) >= BAND_M - 1e-6) return { t, punkt: add(o, n, t), stueck: null, grund: 'band' }
    let best: number | null = null, bd = 0.03
    const gesehen = new Set<number>()
    for (let ix = Math.floor(sb[0] / ZELLE_M); ix <= Math.floor(sb[2] / ZELLE_M); ix++) for (let iy = Math.floor(sb[1] / ZELLE_M); iy <= Math.floor(sb[3] / ZELLE_M); iy++)
      for (const k of raster.get(zk(ix, iy)) ?? []) {
        if (gesehen.has(k)) continue
        gesehen.add(k)
        const x = stuecke[k], ed = sub(x.b, x.a), den = kreuz(n, ed)
        if (Math.abs(den) < 1e-12) continue
        const w = sub(x.a, o), tk = kreuz(w, ed) / den, u = kreuz(w, n) / den
        if (u < -1e-9 || u > 1 + 1e-9) continue
        const d = Math.abs(tk - t)
        if (d < bd - 1e-12 || (d < bd + 1e-12 && best !== null && x.nachbar === 'bord' && stuecke[best].nachbar !== 'bord')) { bd = d; best = k }
      }
    if (best === null) return { t, punkt: add(o, n, t), stueck: null, grund: 'offen' }
    return { t, punkt: add(o, n, t), stueck: best, grund: stuecke[best].nachbar === 'bord' ? 'bord' : 'offen' }
  }
  // Normale an der Station s: Fahrbahnteile (alle Flächen Strasse_Weg), Stossstellen und Verkehrsinseln überbrückt, Teil an der Achse
  const strahl = (s: number): Strahl => {
    const o = ach.punkt(s), n = links(ach.richtung(s))
    const sb = kasten([add(o, n, -BAND_M), add(o, n, BAND_M)])
    const iv: [number, number][] = []
    for (const x of strassen) if (ueberlappt(x.box, sb)) iv.push(...intervalleImPolygon(o, n, BAND_M, x.ringe))
    iv.sort((a, b) => a[0] - b[0])
    const fb: [number, number][] = []
    for (const x of iv) {
      const m = fb[fb.length - 1]
      if (m && x[0] <= m[1] + STOSS_M) m[1] = Math.max(m[1], x[1]); else fb.push([x[0], x[1]])
    }
    const zus: [number, number][] = []
    for (const x of fb) {
      const m = zus[zus.length - 1]
      if (m && x[0] - m[1] <= INSEL_LUECKE_MAX_M && istInsel(add(o, n, (m[1] + x[0]) / 2)) && !seitenInsel(s, o, n, m, x)) m[1] = x[1]; else zus.push([x[0], x[1]])
    }
    let wahl: [number, number] | null = null, wd = Infinity
    for (const x of zus) {
      const d = x[0] <= 0 && x[1] >= 0 ? 0 : Math.min(Math.abs(x[0]), Math.abs(x[1]))
      if (d < wd) { wd = d; wahl = x }
    }
    if (!wahl || wd > NEBEN_M) return { s, o, n, links: null, rechts: null }
    return { s, o, n, links: treffer(o, n, wahl[1], sb), rechts: treffer(o, n, wahl[0], sb) }
  }

  // Saat: von der Achse aus nächste Bordstücke je Seite
  const zahl: Record<Seite, Map<number, number>> = { links: new Map(), rechts: new Map() }
  if (L > 0) for (const s of stationen(L, SAAT_M)) {
    const st = strahl(s)
    for (const X of ['links', 'rechts'] as const) {
      const t = st[X]
      if (t && t.grund === 'bord' && t.stueck !== null) zahl[X].set(t.stueck, (zahl[X].get(t.stueck) ?? 0) + 1)
    }
  }
  const stueckSeite: (Seite | null)[] = stuecke.map((_, k) => {
    const l = zahl.links.get(k) ?? 0, r = zahl.rechts.get(k) ?? 0
    return l + r === 0 ? null : l >= r ? 'links' : 'rechts'
  })

  // Ketten: Randstücke entlang des Umrisses (Fahrbahn links), an Stossstellen in die Nachbarfläche weiter
  const key = (p: P, dx = 0, dy = 0) => zk(Math.round(p[0] * 100) + dx, Math.round(p[1] * 100) + dy)
  const anfaenge = new Map<string, number[]>()
  for (const k of randIdx) { const kk = key(stuecke[k].a), l = anfaenge.get(kk); if (l) l.push(k); else anfaenge.set(kk, [k]) }
  const nach = new Map<number, number>(), vor = new Map<number, number>()
  for (const k of randIdx) {
    const x = stuecke[k], dk = einheit(sub(x.b, x.a))
    let best = -1, bw = -Infinity
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of anfaenge.get(key(x.b, dx, dy)) ?? []) {
      const y = stuecke[j]
      if (j === k || dist(y.a, x.b) > KETTE_TOL_M || dist(y.b, x.a) <= KETTE_TOL_M) continue
      const dj = einheit(sub(y.b, y.a)), w = Math.atan2(kreuz(dk, dj), dot(dk, dj))   // am stärksten links: am Rand derselben Fläche bleiben
      if (w > bw) { bw = w; best = j }
    }
    if (best >= 0 && !vor.has(best)) { nach.set(k, best); vor.set(best, k) }
  }
  const ketten: { st: number[]; zu: boolean }[] = []
  const besucht = new Set<number>()
  for (const k of randIdx) {
    if (vor.has(k) || besucht.has(k)) continue
    const st: number[] = []
    for (let j: number | undefined = k; j !== undefined && !besucht.has(j); j = nach.get(j)) { besucht.add(j); st.push(j) }
    ketten.push({ st, zu: false })
  }
  for (const k of randIdx) {
    if (besucht.has(k)) continue
    const st: number[] = []
    for (let j: number | undefined = k; j !== undefined && !besucht.has(j); j = nach.get(j)) { besucht.add(j); st.push(j) }
    ketten.push({ st, zu: true })
  }

  // Gemessener Rand je Seite: getroffene Stücke, entlang der Kette über verdeckte Stücke verlängert, als Teile in Achsrichtung
  const ruecklauf = Math.cos(RUECKLAUF_GRAD * GRAD)
  const imRand: Record<Seite, Set<number>> = { links: new Set(), rechts: new Set() }
  const teileVon: Record<Seite, Teil[]> = { links: [], rechts: [] }
  const verdecktVon: Record<Seite, Teil[]> = { links: [], rechts: [] }
  const fremdVon: Record<Seite, Teil[]> = { links: [], rechts: [] }
  // nach Station geordnete Teile, die aneinanderstossen, zusammenhängen
  const zusammen = (teile: Teil[]): Teil[] => {
    const zus: Teil[] = []
    for (const T of teile) {
      const m = zus[zus.length - 1]
      if (m && dist(m.p[m.p.length - 1], T.p[0]) < STOSS_M) zus[zus.length - 1] = teilVon([...m.p, ...T.p.slice(1)], ach)
      else zus.push(T)
    }
    return zus
  }
  // K2 (seit 14.11.2026, wie verdeckteTeile im VeloroutenCheck messquerschnitt.ts): Teile, die an allen Eckpunkten im Abschnitt hinter
  // einem anderen Teil derselben Seite liegen (der andere um mehr als VERDECKT_TOL_M näher an der Fahrbahn)
  const verdeckte = (TT: Teil[], X: Seite, ohne: Teil[] = []): boolean[] => {
    if (TT.length < 2) return TT.map(() => false)
    const sg = X === 'links' ? 1 : -1
    const sb = TT.map(U => [Math.min(...U.s) - BAND_M, Math.max(...U.s) + BAND_M])
    return TT.map((T, j) => {
      let geprueft = 0
      for (let i = 0; i < T.p.length; i++) {
        const s = T.s[i], q = T.q[i]
        if (s < -1e-6 || s > L + 1e-6) continue
        geprueft++
        const o = ach.punkt(s), n = links(ach.richtung(s))
        const naeher = TT.some((U, k) => k !== j && s >= sb[k][0] && s <= sb[k][1] &&
          teilSchnitte(U, o, n, BAND_M).some(x => sg * x.t < sg * q - VERDECKT_TOL_M && sg * x.t > -NEBEN_M &&
            (!ohne.length || !ohne.some(F => lageAuf(F, add(o, n, x.t)).d < 0.05))))
        if (!naeher) return false
      }
      return geprueft > 0
    })
  }
  // Nachtrag C (zu S5, 14.11.2026): Teile, die nur stellenweise hinter einem anderen Teil derselben Seite liegen, dort auftrennen; der
  // Rand an einer Station ist der nächste Bord (wie der Querschnitt). Geprüft an Punkten höchstens TEILWEISE_SCHRITT_M auseinander.
  // Beispiel Knoten 2860577444: das Trottoir jenseits der Zufahrt läuft neben der Insel weiter und lag als Rand der Aarstrasse vor.
  // Die abgetrennten Strecken zählen als verdeckt (wie K2), damit der Querschnitt dort den Teil davor nimmt (Codeprüfung 14.11.2026)
  // ohne: Stücke, die nicht verdecken (FB5: als fremd entfernte Stücke, Codeprüfung 16.11.2026)
  const teilweise = (TT: Teil[], X: Seite, ohne: Teil[] = []): { teile: Teil[]; verdeckt: Teil[] } => {
    if (TT.length < 2) return { teile: TT, verdeckt: [] }
    const zaehlt = (o: P, n: P, t: number) => !ohne.length || !ohne.some(F => lageAuf(F, add(o, n, t)).d < 0.05)
    const sg = X === 'links' ? 1 : -1
    const sb = TT.map(U => [Math.min(...U.s) - BAND_M, Math.max(...U.s) + BAND_M])
    const aus: Teil[] = [], weg: Teil[] = []
    TT.forEach((T, j) => {
      const dicht: P[] = []
      for (let i = 0; i + 1 < T.p.length; i++) {
        const a = T.p[i], v = sub(T.p[i + 1], a), n = Math.max(1, Math.ceil(dist(a, T.p[i + 1]) / TEILWEISE_SCHRITT_M - 1e-9))
        for (let k = 0; k < n; k++) dicht.push(add(a, v, k / n))
      }
      dicht.push(T.p[T.p.length - 1])
      const D = teilVon(dicht, ach)
      const hintenSq = (s: number, q: number) => {
        if (s < -1e-6 || s > L + 1e-6) return false
        const o = ach.punkt(s), n = links(ach.richtung(s))
        return TT.some((U, k) => k !== j && s >= sb[k][0] && s <= sb[k][1] &&
          teilSchnitte(U, o, n, BAND_M).some(x => sg * x.t < sg * q - VERDECKT_TOL_M && sg * x.t > -NEBEN_M && zaehlt(o, n, x.t)))
      }
      const hinten = D.p.map((_, i) => hintenSq(D.s[i], D.q[i]))
      if (!hinten.some(Boolean)) { aus.push(T); return }
      // Codeprüfung 16.11.2026 (FB8): Grenze zwischen sichtbarem und verdecktem Punkt auf rund 1 cm genau (Halbierung); sonst zählte die
      // ganze Strecke dazwischen (bis TEILWEISE_SCHRITT_M) zum verdeckten Stück und der Querschnitt fand dort keinen Bordpunkt
      const grenze = (sichtbar: P, verdeckt: P): P => {
        let lo = sichtbar, hi = verdeckt
        for (let it = 0; it < 7 && dist(lo, hi) > 0.01; it++) {
          const m: P = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], st = ach.station(m)
          if (hintenSq(st.s, st.q)) hi = m; else lo = m
        }
        return lo
      }
      const gr = D.p.map((_, i) => (i > 0 && hinten[i] !== hinten[i - 1] ? grenze(hinten[i] ? D.p[i - 1] : D.p[i], hinten[i] ? D.p[i] : D.p[i - 1]) : null))
      let lauf: P[] = []
      const fertig = () => { if (lauf.length >= 2) { const U = teilVon(lauf, ach); if (teilLaenge(U) >= 0.05) aus.push(U) } lauf = [] }
      D.p.forEach((p, i) => {
        const g = gr[i]
        if (hinten[i]) { if (g) lauf.push(g); fertig() }
        else { if (g) lauf.push(g); lauf.push(p) }
      })
      fertig()
      // verdeckte Strecken, je von Grenze zu Grenze (lückenlos bis an den sichtbaren Teil; am Teilende bis zum Endpunkt)
      for (let i = 0; i < D.p.length; i++) {
        if (!hinten[i]) continue
        let k = i
        while (k + 1 < D.p.length && hinten[k + 1]) k++
        const pts: P[] = [...(gr[i] ? [gr[i]!] : []), ...D.p.slice(i, k + 1), ...(k + 1 < D.p.length && gr[k + 1] ? [gr[k + 1]!] : [])]
        const U = teilVon(pts, ach)
        if (U.p.length >= 2 && teilLaenge(U) >= 0.05) weg.push(U)
        i = k
      }
    })
    return { teile: aus.sort((a, b) => a.s[0] - b.s[0]), verdeckt: weg }
  }
  // C2 (Nachtrag C, 14.11.2026): Randstücke einer anderen Fahrbahn (FREMD_SEITE_M, FREMD_LAENGE_MAX_M, FREMD_VERSATZ_M); Bezug ist der
  // eigene Rand davor (nächstes nicht fremde Teil) und danach (nächstes lange Teil, sonst das nächste)
  const fremde = (TT: Teil[], X: Seite): boolean[] => {
    const sg = X === 'links' ? 1 : -1
    const imAb = TT.map(T => T.s.map((_, i) => i).filter(i => T.s[i] >= -1e-6 && T.s[i] <= L + 1e-6))
    const lang = TT.map((T, j) => { const ix = imAb[j]; return ix.length < 2 ? 0 : T.lam[ix[ix.length - 1]] - T.lam[ix[0]] })
    const qA0 = (j: number) => TT[j].q[imAb[j].length ? imAb[j][0] : 0]
    const qE0 = (j: number) => TT[j].q[imAb[j].length ? imAb[j][imAb[j].length - 1] : TT[j].q.length - 1]
    // Bezug am Nachbarn: Abstand zur Achse am Ende bzw. Anfang seines achsparallelen Teils (höchstens EINM_WINKEL_GRAD zur Achse), also vor
    // einer Eckausrundung in die Mündung (Helvetiastrasse, Knoten 7209686: Inselspitze in der Zufahrt zwischen zwei Ausrundungen)
    const parallel = (T: Teil, i: number) => {
      const d = sub(T.p[i + 1], T.p[i]), l = Math.hypot(d[0], d[1])
      return l > 1e-9 && T.s[i] >= -1e-6 && T.s[i + 1] <= L + 1e-6 && dot([d[0] / l, d[1] / l], ach.richtung((T.s[i] + T.s[i + 1]) / 2)) >= Math.cos(EINM_WINKEL_GRAD * GRAD)
    }
    // Codeprüfung 16.11.2026 (FB2): Bezug nur aus einem achsparallelen Lauf von mindestens TEILUNG_MIN_M (ein 1,6 m kurzer Absatz in der
    // Mündung von Querung 392 machte das eigene Trottoir dahinter fremd); ohne solchen Lauf wie bisher die erste achsparallele Kante
    const lauf = (T: Teil, i: number) => dist(T.p[i], T.p[i + 1])
    const qE = (j: number) => {
      const T = TT[j]
      let erst: number | null = null, l = 0, ende = -1
      for (let i = T.p.length - 2; i >= 0; i--) {
        if (!parallel(T, i)) { l = 0; ende = -1; continue }
        if (erst === null) erst = T.q[i + 1]
        if (ende < 0) ende = i + 1
        l += lauf(T, i)
        if (l >= TEILUNG_MIN_M - 1e-9) return T.q[ende]
      }
      return erst ?? qE0(j)
    }
    const qA = (j: number) => {
      const T = TT[j]
      let erst: number | null = null, l = 0, anf = -1
      for (let i = 0; i + 1 < T.p.length; i++) {
        if (!parallel(T, i)) { l = 0; anf = -1; continue }
        if (erst === null) erst = T.q[i]
        if (anf < 0) anf = i
        l += lauf(T, i)
        if (l >= TEILUNG_MIN_M - 1e-9) return T.q[anf]
      }
      return erst ?? qA0(j)
    }
    // FB2: eigene Randlage eines kurzen Stücks = Querlage seines längsten Laufs von mindestens TEILUNG_MIN_M höchstens TEILUNG_GRAD zur
    // Achse (im Abschnitt), sonst null. Enden in Rückkehr oder Eckausrundung zählen dafür nicht. Nicht für Inselkanten (Insel bzw. Loch
    // hinter dem Lauf, istInsel): Inselspitze und Inselrundung bleiben fremd (Turnierstrasse 255605324, Schänzlihalde 6048677147)
    const eigeneLage = (j: number): number | null => {
      const T = TT[j], grenze = Math.cos(TEILUNG_GRAD * GRAD)
      let best: number | null = null, bl = 0, bs = 0, l = 0, sq = 0, ss = 0
      for (let i = 0; i + 1 < T.p.length; i++) {
        const d = sub(T.p[i + 1], T.p[i]), li = Math.hypot(d[0], d[1])
        const ok = li > 1e-9 && T.s[i] >= -1e-6 && T.s[i + 1] <= L + 1e-6 && dot([d[0] / li, d[1] / li], ach.richtung((T.s[i] + T.s[i + 1]) / 2)) >= grenze
        if (!ok) { l = 0; sq = 0; ss = 0; continue }
        l += li; sq += li * (T.q[i] + T.q[i + 1]) / 2; ss += li * (T.s[i] + T.s[i + 1]) / 2
        if (l >= TEILUNG_MIN_M - 1e-9 && l > bl) { bl = l; best = sq / l; bs = ss / l }
      }
      if (best === null) return null
      const hinter = add(ach.punkt(bs), links(ach.richtung(bs)), best + sg * PRUEF_M)
      return istInsel(hinter) ? null : best
    }
    // ganz auf der anderen Seite der Achse: nur, wenn die Seite noch ein Stück diesseits hat (Codeprüfung 14.11.2026: liegt die Achse neben
    // der Fahrbahn, NEBEN_M, liegt der ganze eigene Rand jenseits)
    // Codeprüfung 16.11.2026 (FB9): nur, wenn das Stück weiter als NEBEN_M jenseits liegt oder an denselben Stationen ein Stück diesseits
    // liegt (Achse am Anfang neben der Fahrbahn: sonst fiel dort der eigene Rand weg)
    const jRoh = TT.map(T => T.q.every(q => sg * q < -FREMD_SEITE_M))
    const sBer = TT.map(T => [Math.min(...T.s), Math.max(...T.s)])
    const jenseits = TT.map((T, j) => jRoh[j] && (T.q.every(q => sg * q < -NEBEN_M) ||
      TT.some((_, k) => k !== j && !jRoh[k] && sBer[k][0] < sBer[j][1] && sBer[k][1] > sBer[j][0])))
    const aus = jenseits.every(Boolean) ? TT.map(() => false) : jenseits
    for (let j = 0; j < TT.length; j++) {
      if (aus[j] || lang[j] > FREMD_LAENGE_MAX_M) continue
      let v = -1, h = -1
      for (let k = j - 1; k >= 0; k--) if (!aus[k]) { v = k; break }
      for (let k = j + 1; k < TT.length; k++) if (!aus[k] && lang[k] > FREMD_LAENGE_MAX_M) { h = k; break }
      if (h < 0) for (let k = j + 1; k < TT.length; k++) if (!aus[k]) { h = k; break }
      if (v < 0 && h < 0) continue
      // am geprüften Stück die Enden im Abschnitt (der achsparallele Teil wäre bei einer Inselspitze ihre Kappe: Turnierstrasse 5268607205).
      // Beginnt bzw. endet das Stück genau am Abschnittsanfang bzw. -ende, zählt dort sein Ende gegen den Rand des anderen Nachbarn
      // (Codeprüfung 14.11.2026: ein eigenes kurzes Stück am Abschnittsanfang vor einer Mündung beginnt auf der Randlage und endet in der
      // Ausrundung); sonst gilt eine Seite ohne Nachbarn als abweichend (Inselrundung nach einem fremden Stück: Schänzlihalde 6048677147)
      const ix = imAb[j], T = TT[j], amAnfang = ix.length > 0 && T.s[ix[0]] <= 0.05, amEnde = ix.length > 0 && T.s[ix[ix.length - 1]] >= L - 0.05
      // FB2: ein Stück mit eigenem achsparallelem Lauf auf der Randlage eines Nachbarn (oder näher an der Achse als alle Nachbarn: Engstelle,
      // Trottoirnase) bleibt eigener Rand, auch wenn seine Enden in Rückkehr oder Ausrundung liegen (Trottoir zwischen zwei Einfahrten)
      const qe = eigeneLage(j), bezug = [v >= 0 ? qE(v) : null, h >= 0 ? qA(h) : null].filter((x): x is number => x !== null)
      const aufRandlage = qe !== null && bezug.length > 0 &&
        (bezug.some(b => Math.abs(qe - b) <= FREMD_VERSATZ_M) || bezug.every(b => sg * qe < sg * b))
      if (aufRandlage) continue
      const weitV = v >= 0 ? Math.abs(qA0(j) - qE(v)) > FREMD_VERSATZ_M : !(amAnfang && h >= 0 && Math.abs(qA0(j) - qA(h)) <= FREMD_VERSATZ_M)
      const weitH = h >= 0 ? Math.abs(qE0(j) - qA(h)) > FREMD_VERSATZ_M : !(amEnde && v >= 0 && Math.abs(qE0(j) - qE(v)) <= FREMD_VERSATZ_M)
      if (weitV && weitH) aus[j] = true
      // ein kurzes Stück, das an einem Ende von beiden Nachbarn um mehr als FREMD_VERSATZ_M nach aussen wegläuft, verlässt die eigene
      // Fahrbahn (Sichtprüfung 14.11.2026, Grosser Muristalden 484734431: Rand einer spitz einmündenden Parallelfläche, q −5,6 → −7,5 neben
      // −5,0 davor und −3,8 danach; sonst läuft die Führung in die Parallelfläche)
      else if (v >= 0 && h >= 0) {
        const aussen = (q: number) => sg * q - sg * qE(v) > FREMD_VERSATZ_M && sg * q - sg * qA(h) > FREMD_VERSATZ_M
        if (aussen(qE0(j)) || aussen(qA0(j))) aus[j] = true
      }
    }
    // Keil zwischen zwei Mündungen (Testfall Marien_Jungfrau 14.11.2026, Jungfraustrasse bei Kollerweg/Englische Anlagen: Spitze 5 m hinter
    // dem Rand, die Führung lief als «V» dorthin): ein Teil, das im Abschnitt ganz mehr als FREMD_VERSATZ_M hinter dem Rand davor und
    // danach liegt und nirgends auf TEILUNG_MIN_M höchstens TEILUNG_GRAD zur Achse verläuft (keine Ausbuchtung mit Grund), gehört nicht
    // zum eigenen Rand, auch wenn es länger als FREMD_LAENGE_MAX_M ist
    const parallelGrenze = Math.cos(TEILUNG_GRAD * GRAD)
    for (let j = 0; j < TT.length; j++) {
      if (aus[j] || !imAb[j].length) continue
      let v = -1, h = -1
      for (let k = j - 1; k >= 0; k--) if (!aus[k]) { v = k; break }
      for (let k = j + 1; k < TT.length; k++) if (!aus[k]) { h = k; break }
      if (v < 0 || h < 0) continue
      const T = TT[j], grenze = Math.max(sg * qE(v), sg * qA(h)) + FREMD_VERSATZ_M
      if (!imAb[j].every(i => sg * T.q[i] > grenze)) continue
      let lauf = 0, maxLauf = 0
      for (let i = 0; i + 1 < T.p.length; i++) {
        const d = sub(T.p[i + 1], T.p[i]), l = Math.hypot(d[0], d[1])
        const ok = l > 1e-9 && T.s[i] >= -1e-6 && T.s[i + 1] <= L + 1e-6 && dot([d[0] / l, d[1] / l], ach.richtung((T.s[i] + T.s[i + 1]) / 2)) >= parallelGrenze
        lauf = ok ? lauf + l : 0
        maxLauf = Math.max(maxLauf, lauf)
      }
      if (maxLauf < TEILUNG_MIN_M) aus[j] = true
    }
    return aus
  }
  for (const X of ['links', 'rechts'] as const) {
    const anderer: Seite = X === 'links' ? 'rechts' : 'links', sinn = X === 'rechts' ? 1 : -1
    const geht = (k: number) => {
      const x = stuecke[k]
      if (x.nachbar !== 'bord' || stueckSeite[k] === anderer) return false
      const sq = ach.station(mitte(k))
      if (Math.abs(sq.q) > BAND_M || sq.s < -BAND_M || sq.s > L + BAND_M) return false
      return dot(einheit(sub(x.b, x.a)), ach.richtung(sq.s)) * sinn >= ruecklauf
    }
    const roh: P[][] = []
    for (const C of ketten) {
      const n = C.st.length, drin = C.st.map(k => stueckSeite[k] === X)
      if (!drin.some(Boolean)) continue
      const dazu = drin.slice()
      const weiter = (i: number, r: number) => { const j = i + r; return j >= 0 && j < n ? j : C.zu ? (j + n) % n : -1 }
      for (let i = 0; i < n; i++) {
        if (!drin[i]) continue
        for (const r of [1, -1]) {
          let j = weiter(i, r), z = 0
          while (j >= 0 && !drin[j] && z < n && geht(C.st[j])) { dazu[j] = true; j = weiter(j, r); z++ }
        }
      }
      // Läufe in Kettenfolge (geschlossene Kette ab einem Stück ausserhalb, ganz im Rand: geschlossener Umriss)
      let start = 0
      if (C.zu) { start = dazu.findIndex(x => !x); if (start < 0) start = 0 }
      let lauf: number[] = []
      const fertig = () => {
        if (!lauf.length) return
        const pts: P[] = [stuecke[lauf[0]].a, ...lauf.map(k => stuecke[k].b)]
        for (const k of lauf) imRand[X].add(k)
        roh.push(pts); lauf = []
      }
      for (let z = 0; z < n; z++) {
        const i = (start + z) % n
        if (dazu[i]) lauf.push(C.st[i]); else fertig()
      }
      fertig()
    }
    // in Achsrichtung (Fahrbahn links: links läuft der Umriss gegen die Achse), an den Abschnittsenden senkrecht geschnitten
    const teile: Teil[] = []
    for (const r of roh) {
      let pts = X === 'links' ? r.slice().reverse() : r
      const s0 = ach.station(pts[0]).s, s1 = ach.station(pts[pts.length - 1]).s
      if (s1 < s0 - 1) pts = pts.slice().reverse()
      for (const a of halbebene(pts, ach.punkt(0), ach.richtungAnfang))
        for (const b of halbebene(a, ach.punkt(L), neg(ach.richtungEnde))) {
          const T = teilVon(b, ach)
          if (teilLaenge(T) >= 0.05) teile.push(T)
        }
    }
    teile.sort((a, b) => a.s[0] - b.s[0])
    const zus = zusammen(teile)
    // Verdeckung (K2, Teilverdeckung) und fremde Stücke (C2). Codeprüfung 16.11.2026 (FB5): ein als fremd entferntes Stück verdeckt nichts;
    // sonst blieb der Rand dahinter weg (Seiteninsel 9 m: Bord dahinter verdeckt, Insel fremd, Querschnitt ohne Bordpunkt). Darum mit
    // den fremden Stücken als Nicht-Verdecker ein zweites Mal
    const rechne = (ohne: Teil[]) => {
      const vd = verdeckte(zus, X, ohne)
      let vv = zus.filter((_, i) => vd[i]), tt = vv.length ? zusammen(zus.filter((_, i) => !vd[i])) : zus
      if (eigenerRand) { const tw = teilweise(tt, X, ohne); tt = tw.teile; if (tw.verdeckt.length) vv = [...vv, ...tw.verdeckt] }
      const fr = eigenerRand ? fremde(tt, X) : tt.map(() => false)
      return { tt, vv, fr }
    }
    let r = rechne([])
    if (r.fr.some(Boolean)) r = rechne(r.tt.filter((_, i) => r.fr[i]))
    verdecktVon[X] = r.vv
    teileVon[X] = r.tt.filter((_, i) => !r.fr[i])
    if (r.fr.some(Boolean)) fremdVon[X] = r.tt.filter((_, i) => r.fr[i])
  }

  // Abweichungen je Seite, daraus Führungslinie und Bereiche der Querschnitte
  const abzweigungSeiten = (z: Abzweigung): Seite[] => {
    if (z.seite) return [z.seite]
    if (z.arm) return [ach.station(z.arm).q - ach.station(z.p).q >= 0 ? 'links' : 'rechts']
    return ['links', 'rechts']
  }
  const anfangSchnitt = (B: P, r: P): P | null => {
    const S = ach.punkt(0), c = dot(r, ach.richtungAnfang), tau = c > 0.1 ? dot(sub(B, S), ach.richtungAnfang) / c : 0
    return tau > 1e-6 ? add(B, r, -tau) : null
  }
  const endeSchnitt = (A: P, r: P): P | null => {
    const E = ach.punkt(L), c = dot(r, ach.richtungEnde), tau = c > 0.1 ? dot(sub(E, A), ach.richtungEnde) / c : 0
    return tau > 1e-6 ? add(A, r, tau) : null
  }
  // Nachtrag 6: Verlängerung des Bords vom Anschlusspunkt Q (Richtung r in Achsrichtung) bis zum Abschnittsanfang bzw. -ende entlang der
  // Achskrümmung: an jeder Station der Abstand zur Achse wie am Anschlusspunkt, dazu die Schräge des Bords gegen die Achse (bei gerader
  // Achse genau die Tangente, an einer Kurve der Bogen parallel zur Achse). Endet auf der Senkrechten zur ersten bzw. letzten
  // Teilstrecke (wie der Schnitt des gemessenen Rands). Punkte in Achsrichtung; null wie anfangSchnitt/endeSchnitt
  const verlaengerung = (Q: P, r: P, wo: 'anfang' | 'ende'): P[] | null => {
    const a = ach.station(Q), sQ = a.s, qQ = a.q
    if (wo === 'anfang' ? sQ <= 1e-6 : sQ >= L - 1e-6) return null
    if (dot(r, ach.richtung(sQ)) <= 0.1) return null
    // Schräge des Bords gegen die Achse aus dem Abstand zur Achse am Anschlusspunkt und ANKER_SONDE_M weiter auf dem Bord (Richtung der
    // Sehne allein wäre in einer Kurve um die halbe Krümmung gedreht); Bord parallel zur Achse: 0
    const b = ach.station(add(Q, r, wo === 'anfang' ? ANKER_SONDE_M : -ANKER_SONDE_M)), tanA = (b.q - qQ) / (b.s - sQ)
    if (!Number.isFinite(tanA)) return null
    const roh = (s: number): P => {
      const n = s <= 0 ? links(ach.richtungAnfang) : s >= L ? links(ach.richtungEnde) : links(ach.richtung(s))
      return add(ach.punkt(s), n, qQ + (s - sQ) * tanA)
    }
    // Rest am Anschlusspunkt (geglättete gegen gerade Normale an einem Achsknick) gegen das freie Ende hin auslaufend
    const rest = sub(Q, roh(sQ)), weg = wo === 'anfang' ? sQ : L - sQ
    const schritte = Math.max(1, Math.ceil(weg / KRUEMMUNG_SCHRITT_M - 1e-9))
    const pts: P[] = []
    for (let k = 0; k <= schritte; k++) {
      const s = wo === 'anfang' ? sQ * (1 - k / schritte) : sQ + (L - sQ) * (k / schritte)
      pts.push(k === 0 ? [Q[0], Q[1]] : add(roh(s), rest, 1 - k / schritte))
    }
    if (wo === 'anfang') pts.reverse()
    // gerade Verlängerung (gerade Achse): nur die beiden Enden, wie die Tangente
    const p0 = pts[0], p1 = pts[pts.length - 1], d = einheit(sub(p1, p0))
    return pts.every(p => Math.abs(kreuz(d, sub(p, p0))) < 1e-3) ? [p0, p1] : pts
  }
  // C3 (Nachtrag C, 14.11.2026): Verbindung über eine Einmündung bzw. Öffnung als Bogen, der an beiden Anschlusspunkten tangential an
  // den AV-Bord anschliesst (kubische Kurve mit den Bordrichtungen rA, rB, Hebel wie für einen Kreisbogen). Die Form hängt nur von der AV
  // ab; die OSM-Achse begrenzt nur den Anteil des Bogens (FB1, stetig); liegen beide Bordstücke in einer Flucht, ist sie die Gerade. An einem Knick der
  // Strasse folgt sie der Biegung (Kasernenstrasse bei der Blumenbergstrasse: Knick 28°, die Sehne lag bis 2,5 m daneben). Ohne
  // Bordrichtung die Gerade. Keine Schwelle: die Form ändert sich stetig mit den Bordrichtungen.
  const verbindungBogen = (A: P, B: P, rA: P | null, rB: P | null): P[] => {
    const len = dist(A, B)
    if (!rA || !rB || len < 1e-6) return [A, B]
    // Hebel: für einen Kreisbogen mit der Richtungsänderung th exakt 4/3 · tan(th/4) · R (R = Sehne / (2 sin(th/2))), bei th → 0 ein
    // Drittel der Sehne
    const th = Math.acos(Math.max(-1, Math.min(1, dot(rA, rB))))
    // Codeprüfung 16.11.2026 (FB1): der Bogen gilt nur so weit, wie auch die Strasse zwischen den Anschlusspunkten dreht. Auf gerader
    // Strasse kommt eine Richtungsänderung der Bordstücke aus einer Schräge, Nasenflanke, Keilkante oder Ausrundung am Anschlusspunkt, und
    // der Bogen lief in die Fahrbahn (Querung 1565: 2,57 m). Massgebend ist die kleinere der beiden Drehungen
    const sA = ach.station(A).s, sB = ach.station(B).s
    const thAchse = Math.acos(Math.max(-1, Math.min(1, dot(ach.richtung(sA), ach.richtung(sB)))))
    const thWirk = Math.min(th, thAchse)
    // Anteil des Bogens stetig nach der Richtungsänderung (BOGEN_AB_GRAD … BOGEN_VOLL_GRAD, dazwischen weich): bei fast gleichen
    // Bordrichtungen die Sehne – die Richtung am Anschlusspunkt kommt aus einer Vieleckseite und springt, wenn sich der Punkt um eine
    // Ecke verschiebt (Philosophenweg: mit vollem Bogen K bei 1° gedrehter OSM-Linie 0,24 statt 0,08 m)
    const u0 = Math.max(0, Math.min(1, (thWirk / GRAD - BOGEN_AB_GRAD) / (BOGEN_VOLL_GRAD - BOGEN_AB_GRAD))), wb = u0 * u0 * (3 - 2 * u0)
    if (wb <= 0) return [A, B]
    const h = th > 1e-6 ? (4 / 3) * Math.tan(th / 4) * len / (2 * Math.sin(th / 2)) : len / 3
    const P1 = add(A, rA, h), P2 = add(B, rB, -h)
    const n = Math.max(1, Math.ceil(len / KRUEMMUNG_SCHRITT_M - 1e-9))
    const pts: P[] = []
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
      const bx = a * A[0] + b * P1[0] + c * P2[0] + d * B[0], by = a * A[1] + b * P1[1] + c * P2[1] + d * B[1]
      const sx = A[0] + (B[0] - A[0]) * t, sy = A[1] + (B[1] - A[1]) * t
      pts.push(k === 0 ? [A[0], A[1]] : k === n ? [B[0], B[1]] : [sx + wb * (bx - sx), sy + wb * (by - sy)])
    }
    const e = einheit(sub(B, A))
    return pts.every(x => Math.abs(kreuz(e, sub(x, A))) < 1e-3) ? [A, B] : pts
  }
  // Nachtrag 5: konstruierte Führung prüfen → Grund des Verwerfens oder null
  const konstruiertPruefen = (linie: P[], X: Seite, ohneLaenge: boolean): string | null => {
    let len = 0
    for (let i = 1; i < linie.length; i++) len += dist(linie[i - 1], linie[i])
    if (!ohneLaenge && len > VERBINDUNG_MAX_M + 1e-9) return `konstruierte Führung ${f1(len)} m länger als ${VERBINDUNG_MAX_M} m, verworfen (Rand unbekannt)`
    let alle = 0, neben = 0
    for (let i = 1; i < linie.length; i++) {
      const a = linie[i - 1], v = sub(linie[i], a), l = Math.hypot(v[0], v[1])
      if (l < 1e-9) continue
      const d = einheit(v), innen = X === 'links' ? neg(links(d)) : links(d), n = Math.max(1, Math.ceil(l / FUEHRUNG_PRUEF_SCHRITT_M - 1e-9))
      for (let k = 0; k < n; k++) {
        const q = add(add(a, v, (k + 0.5) / n), innen, FUEHRUNG_PRUEF_M)
        alle++
        if (!aufStrasse(q) && !inseln.some(x => imKasten(q, x.box) && imPolygon(q, x.ringe))) neben++
      }
    }
    if (alle && neben > FUEHRUNG_NEBEN_ANTEIL_MAX * alle)
      return `konstruierte Führung neben der Fahrbahn (${neben} von ${alle} Prüfpunkten ${f1(FUEHRUNG_PRUEF_M)} m innen weder Strasse_Weg noch Verkehrsinsel), verworfen (Rand unbekannt)`
    return null
  }
  const abweichungen: Abweichung[] = []
  const rand = {} as Record<Seite, GemessenerRand>
  const fuehrung = {} as Record<Seite, Fuehrungslinie>
  const bereiche: Record<Seite, { s0: number; s1: number; art: AbweichungArt }[]> = { links: [], rechts: [] }

  for (const X of ['links', 'rechts'] as const) {
    const TT = teileVon[X], sg = X === 'links' ? 1 : -1
    const abzw = (e.abzweigungen ?? []).filter(z => !z.nurInsel && abzweigungSeiten(z).includes(X))
    const naheAbzweigung = (a: P, b: P): number | null => {
      let best: number | null = null
      for (const z of abzw) { const d = abstandStrecke(z.p, a, b); if (d <= EINM_UMKREIS_M && (best === null || d < best)) best = d }
      return best
    }
    const pktVon = (l: Lage) => punktBei(TT[l.t], l.lam)
    const ers: Ersatz[] = []
    const nasen: Abweichung[] = []
    // S8: nahe einer OSM-Abzweigung dieser Seite gilt die Flankengrenze FLANKE_ABZW_GRAD
    const nahAbzweigung = (p: P) => abzw.some(z => dist(z.p, p) <= EINM_UMKREIS_M)
    const fl = TT.map(T => flanken(T, X, ach, nahAbzweigung))
    const vorn = (t: number): Flanke | null => { const g = fl[t][0]; return g && !g.aus && g.k0 <= ersteEchte(TT[t]) ? g : null }
    const hinten = (t: number): Flanke | null => { const g = fl[t][fl[t].length - 1]; return g && g.aus && g.k1 >= letzteEchte(TT[t]) ? g : null }
    const lamMin = (t: number, g: Flanke) => { const i = fl[t].indexOf(g); return i > 0 ? TT[t].lam[fl[t][i - 1].k1 + 1] : 0 }
    const lamMax = (t: number, g: Flanke) => { const i = fl[t].indexOf(g); return i < fl[t].length - 1 ? TT[t].lam[fl[t][i + 1].k0] : teilLaenge(TT[t]) }
    // BK3: Bordflucht über eine Lücke zwischen zwei Teilen: Bord an A (davor) und an B (danach) gleich gerichtet, jeder Anschlusspunkt
    // höchstens OEFFNUNG_VERSATZ_M neben der Geraden des anderen Bords, Verbindung höchstens VERBINDUNG_MAX_M → Grund, sonst null
    const bordflucht = (A: Lage, B: Lage): string | null => {
      const pa = pktVon(A), pb = pktVon(B), len = dist(pa, pb)
      const rA = tangente(TT[A.t], TT[A.t].lam.findIndex(l => l >= A.lam - 1e-9), 'vor')
      const rB = tangente(TT[B.t], TT[B.t].lam.findIndex(l => l >= B.lam - 1e-9), 'nach')
      if (!rA || !rB || len < 1e-6 || len > VERBINDUNG_MAX_M + 1e-9 || dot(rA, sub(pb, pa)) <= 0) return null
      // Nachtrag C (C4, 14.11.2026): Richtung und Versatz gegen die Achse (Stationskoordinaten), damit eine Öffnung auch in einer Kurve als
      // Bordflucht gilt (Kasernenstrasse, zwei Einfahrten in der Kurve); auf gerader Achse wie die bisherige Geradenprüfung
      // Codeprüfung 16.11.2026 (FB4): gilt auch, wenn die Prüfung am Bord allein (Geraden der beiden Bordstücke, wie 0.11.0) erfüllt ist;
      // sonst machte ein Knick der OSM-Linie von 3° in einer 11-m-Öffnung aus einem geraden Bord «Rand unbekannt»
      const w0 = winkelGrad(rA, rB), v0 = Math.max(Math.abs(kreuz(rA, sub(pb, pa))), Math.abs(kreuz(rB, sub(pa, pb))))
      if (w0 <= BUCHT_PARALLEL_GRAD + 1e-9 && v0 <= OEFFNUNG_VERSATZ_M + 1e-9)
        return `Bordflucht über die Öffnung ${f1(len)} m (Richtung ${f1(w0)}°, Versatz ${f2(v0)} m)`
      const a = ach.station(pa), b = ach.station(pb), ds = b.s - a.s
      if (ds <= 1e-6) return null
      const ra = ach.richtung(a.s), rb = ach.richtung(b.s)
      const wa = Math.atan2(kreuz(ra, rA), dot(ra, rA)), wb = Math.atan2(kreuz(rb, rB), dot(rb, rB))
      const w = Math.abs(wa - wb) / GRAD
      const v = Math.max(Math.abs(b.q - (a.q + ds * Math.tan(wa))), Math.abs(a.q - (b.q - ds * Math.tan(wb))))
      if (w > BUCHT_PARALLEL_GRAD + 1e-9 || v > OEFFNUNG_VERSATZ_M + 1e-9) return null
      return `Bordflucht über die Öffnung ${f1(len)} m (Richtung ${f1(w)}°, Versatz ${f2(v)} m)`
    }
    const ersatzAusFlanken = (A: Lage | null, B: Lage | null, gA: { t: number; g: Flanke } | null, gB: { t: number; g: Flanke } | null,
      ohneFlanke: string, ohneAbzw: string, oeffnung = false) => {
      // Richtungsänderung des Bords gegenüber seiner Richtung am Anschlusspunkt
      let w = 0
      if (gA && A) w = Math.max(w, wendung(TT[gA.t], gA.g, tangente(TT[A.t], TT[A.t].lam.findIndex(l => l >= A.lam - 1e-9), 'vor') ?? ach.richtung(ach.station(pktVon(A)).s)))
      if (gB && B) w = Math.max(w, wendung(TT[gB.t], gB.g, tangente(TT[B.t], TT[B.t].lam.findIndex(l => l >= B.lam - 1e-9), 'nach') ?? ach.richtung(ach.station(pktVon(B)).s)))
      const pa = A ? pktVon(A) : null, pb = B ? pktVon(B) : null
      const rA = A ? tangente(TT[A.t], TT[A.t].lam.findIndex(l => l >= A.lam - 1e-9), 'vor') : null
      const rB = B ? tangente(TT[B.t], TT[B.t].lam.findIndex(l => l >= B.lam - 1e-9), 'nach') : null
      const ea = pa ?? (pb && rB ? anfangSchnitt(pb, rB) : null) ?? pb, eb = pb ?? (pa && rA ? endeSchnitt(pa, rA) : null) ?? pa
      const dz = ea && eb ? naheAbzweigung(ea, eb) : null
      if (w > (dz !== null ? FLANKE_ABZW_GRAD : EINM_WINKEL_GRAD) && dz !== null)
        ers.push({ art: 'einmuendung', a: A, b: B, verbunden: true, grund: `Richtungsänderung ${Math.round(w)}° und OSM-Abzweigung ${f1(dz)} m` })
      else {
        const o = oeffnung && A && B ? bordflucht(A, B) : null
        ers.push(o ? { art: 'oeffnung', a: A, b: B, verbunden: true, grund: o }
          : { art: 'unbekannt', a: A, b: B, verbunden: false, grund: w > EINM_WINKEL_GRAD ? ohneAbzw : ohneFlanke })
      }
    }
    if (!TT.length) ers.push({ art: 'unbekannt', a: null, b: null, verbunden: false, grund: 'kein Bord im Band' })
    else {
      // Anfang
      const g0 = vorn(0)
      if (g0) ersatzAusFlanken(null, { t: 0, lam: TT[0].lam[ankerNach(TT[0], g0.k1 + 1, lamMax(0, g0))] }, null, { t: 0, g: g0 },
        'Rand unbekannt (kein Bord)', 'Richtungsänderung ohne OSM-Abzweigung (Rand unbekannt)')
      else if (TT[0].s[0] > 0.05) {
        // BK2: der Bord setzt erst nach dem Abschnittsanfang ohne Flanke ein (davor eine offene Kante); mit einer OSM-Abzweigung dieser
        // Seite eine Einmündung (Beispiel Dalmazi, Knoten 1021708: Weihergasse, Ausrundung gegen «uebrige_befestigte»), sonst unbekannt
        const B: Lage = { t: 0, lam: 0 }, pb = pktVon(B), rB = tangente(TT[0], 0, 'nach'), ea = rB ? anfangSchnitt(pb, rB) : null
        const dz = ea ? naheAbzweigung(ea, pb) : null
        ers.push(dz !== null ? { art: 'einmuendung', a: null, b: B, verbunden: true, grund: `Bord erst nach dem Abschnittsanfang und OSM-Abzweigung ${f1(dz)} m` }
          : { art: 'unbekannt', a: null, b: B, verbunden: false, grund: 'Rand unbekannt (kein Bord)' })
      }
      // Lücken zwischen den Teilen
      for (let t = 0; t < TT.length - 1; t++) {
        const gA = hinten(t), gB = vorn(t + 1)
        const A: Lage = { t, lam: gA ? TT[t].lam[ankerVor(TT[t], gA.k0, lamMin(t, gA))] : teilLaenge(TT[t]) }
        const B: Lage = { t: t + 1, lam: gB ? TT[t + 1].lam[ankerNach(TT[t + 1], gB.k1 + 1, lamMax(t + 1, gB))] : 0 }
        ersatzAusFlanken(A, B, gA && { t, g: gA }, gB && { t: t + 1, g: gB },
          'Lücke ohne Bord (Rand unbekannt)', 'Lücke mit Richtungsänderung, ohne OSM-Abzweigung (Rand unbekannt)', true)
      }
      // Ende
      const tl = TT.length - 1, gE = hinten(tl)
      if (gE) ersatzAusFlanken({ t: tl, lam: TT[tl].lam[ankerVor(TT[tl], gE.k0, lamMin(tl, gE))] }, null, { t: tl, g: gE }, null,
        'Rand unbekannt (kein Bord)', 'Richtungsänderung ohne OSM-Abzweigung (Rand unbekannt)')
      else if (TT[tl].s[TT[tl].s.length - 1] < L - 0.05) {
        // BK2 gespiegelt: der Bord endet ohne Flanke vor dem Abschnittsende
        const A: Lage = { t: tl, lam: teilLaenge(TT[tl]) }, pa = pktVon(A), rA = tangente(TT[tl], TT[tl].p.length - 1, 'vor')
        const eb = rA ? endeSchnitt(pa, rA) : null, dz = eb ? naheAbzweigung(pa, eb) : null
        ers.push(dz !== null ? { art: 'einmuendung', a: A, b: null, verbunden: true, grund: `Bord endet vor dem Abschnittsende und OSM-Abzweigung ${f1(dz)} m` }
          : { art: 'unbekannt', a: A, b: null, verbunden: false, grund: 'Rand unbekannt (kein Bord)' })
      }
      // innerhalb der Teile: Ausbuchtung (Flanke aus, dann ein) und Nase (ein, dann aus)
      TT.forEach((T, t) => {
        const G = fl[t]
        for (let i = 0; i + 1 < G.length; i++) {
          const g = G[i], h = G[i + 1]
          if (Math.abs(T.s[h.k1 + 1] - T.s[g.k0]) > ABWEICHUNG_MAX_M) continue
          if (g.aus && !h.aus) {
            const A: Lage = { t, lam: T.lam[ankerVor(T, g.k0, lamMin(t, g))] }, B: Lage = { t, lam: T.lam[ankerNach(T, h.k1 + 1, lamMax(t, h))] }
            ersatzAusFlanken(A, B, { t, g }, { t, g: h }, 'Ausbuchtung (Rand unbekannt)', 'Ausbuchtung mit Richtungsänderung, ohne OSM-Abzweigung (Rand unbekannt)')
          } else if (!g.aus && h.aus) {
            // Einschnürung gegenüber dem Bord davor bzw. danach (soweit vorhanden)
            const tiefen: number[] = []
            const front = T.p.slice(g.k1 + 1, h.k0 + 1)
            if (T.lam[g.k0] - lamMin(t, g) >= 1) {
              const iA = ankerVor(T, g.k0, lamMin(t, g)), r = tangente(T, iA, 'vor')
              if (r) { const aus = sg > 0 ? links(r) : neg(links(r)); tiefen.push(Math.max(...front.map(v => -dot(sub(v, T.p[iA]), aus)))) }
            }
            if (lamMax(t, h) - T.lam[h.k1 + 1] >= 1) {
              const iB = ankerNach(T, h.k1 + 1, lamMax(t, h)), r = tangente(T, iB, 'nach')
              if (r) { const aus = sg > 0 ? links(r) : neg(links(r)); tiefen.push(Math.max(...front.map(v => -dot(sub(v, T.p[iB]), aus)))) }
            }
            if (tiefen.length && Math.min(...tiefen) >= NASE_MIN_TIEFE_M) {
              const tiefe = Math.min(...tiefen)
              nasen.push({ seite: X, art: 'nase', s0: Math.min(T.s[g.k0], T.s[h.k1 + 1]), s1: Math.max(T.s[g.k0], T.s[h.k1 + 1]), von: T.p[g.k0],
                bis: T.p[h.k1 + 1], verbunden: false, tiefe, grund: `Einschnürung ${f1(tiefe)} m (Trottoirnase, bleibt)` })
            }
          }
        }
      })
      // Buchten an bekannten Haltestellen dieser Seite
      for (const hs of e.haltestellen ?? []) {
        if (hs.seite !== X) continue
        let bt = -1, bl = 0, bd = HALT_FANG_M
        TT.forEach((T, t) => { const x = lageAuf(T, hs.p); if (x.d <= bd) { bd = x.d; bt = t; bl = x.lam } })
        if (bt < 0) continue
        const b = buchtSuchen(TT[bt], bl, X)
        if (b) ers.push({ art: 'bucht', a: { t: bt, lam: TT[bt].lam[b.iA] }, b: { t: bt, lam: TT[bt].lam[b.iB] }, verbunden: true, tiefe: b.tiefe,
          grund: `Haltestelle, Ausbuchtung ${f1(b.tiefe)} m` })
      }
    }
    // überlappende Abweichungen zusammenfassen (bestätigte gehen vor)
    const kA = (x: Ersatz) => (x.a ? x.a.t * 1e7 + x.a.lam : -Infinity), kB = (x: Ersatz) => (x.b ? x.b.t * 1e7 + x.b.lam : Infinity)
    ers.sort((x, y) => kA(x) - kA(y))
    const liste: Ersatz[] = []
    // achsparallelste Ecke des Teils t zwischen lam0 und lam1 (TEILUNG_GRAD), sonst null
    const teilungBei = (t: number, lam0: number, lam1: number): number | null => {
      const T = TT[t]
      const winkel = (lam: number): number => {
        const a = punktBei(T, Math.max(0, lam - 1)), b = punktBei(T, Math.min(teilLaenge(T), lam + 1))
        if (dist(a, b) < 0.5) return 180
        return winkelGrad(einheit(sub(b, a)), ach.richtung(ach.station(punktBei(T, lam)).s))
      }
      let best: number | null = null, bw = TEILUNG_GRAD + 1e-9
      for (let i = 0; i < T.p.length; i++) {
        if (T.lam[i] < lam0 - 1e-9 || T.lam[i] > lam1 + 1e-9 || T.s[i] < 0 || T.s[i] > L) continue
        const w = winkel(T.lam[i])
        if (w < bw) { bw = w; best = T.lam[i] }
      }
      if (best === null) return null
      // Länge des achsparallelen Laufs um die Teilungsstelle (Prüfabstand 0,5 m)
      let v = best, h = best
      while (v - 0.5 >= 0 && winkel(v - 0.5) <= TEILUNG_GRAD) v -= 0.5
      while (h + 0.5 <= teilLaenge(T) && winkel(h + 0.5) <= TEILUNG_GRAD) h += 0.5
      return h - v >= TEILUNG_MIN_M - 1e-9 ? best : null
    }
    for (const x of ers) {
      const m = liste[liste.length - 1]
      const teilung = m && kA(x) < kB(m) - 1e-9 && m.b && x.a && m.b.t === x.a.t && m.art !== 'bucht' && x.art !== 'bucht'
        ? teilungBei(x.a.t, x.a.lam, m.b.lam) : null
      if (m && teilung !== null) { m.b = { t: x.a!.t, lam: teilung }; liste.push({ ...x, a: { t: x.a!.t, lam: teilung } }); continue }
      if (m && kA(x) < kB(m) - 1e-9) {
        if (kB(x) > kB(m)) m.b = x.b
        if (VORRANG[x.art] > VORRANG[m.art]) { m.art = x.art; m.tiefe = x.tiefe }
        m.verbunden = m.verbunden || x.verbunden
        m.grund += '; ' + x.grund
      } else liste.push({ ...x })
    }
    // Konstruierte Führung je verbundener Abweichung (Nachträge 5 und 6): gerade Verbindung der Anschlusspunkte bzw. Verlängerung entlang
    // der Achskrümmung an einem Abschnittsende; zu lang (ausser an einer Bucht) oder neben der Fahrbahn: verworfen, «Rand unbekannt»
    const tanVor = (l: Lage) => tangente(TT[l.t], TT[l.t].lam.findIndex(x => x >= l.lam - 1e-9), 'vor')
    const tanNach = (l: Lage) => tangente(TT[l.t], TT[l.t].lam.findIndex(x => x >= l.lam - 1e-9), 'nach')
    const linien = liste.map((x): P[] | null => {
      if (!x.verbunden || (!x.a && !x.b)) return null
      let linie: P[] | null
      if (!x.a) { const r = tanNach(x.b!); linie = r && verlaengerung(pktVon(x.b!), r, 'anfang') }
      else if (!x.b) { const r = tanVor(x.a); linie = r && verlaengerung(pktVon(x.a), r, 'ende') }
      else linie = x.art === 'bucht' ? [pktVon(x.a), pktVon(x.b)] : verbindungBogen(pktVon(x.a), pktVon(x.b), tanVor(x.a), tanNach(x.b))
      if (!linie) return null
      const grund = konstruiertPruefen(linie, X, x.art === 'bucht' && !!x.a && !!x.b)
      if (grund) { x.verbunden = false; x.grund += '; ' + grund; return null }
      return linie
    })
    // Führungslinie, je Strecke gemessen oder konstruiert
    const teile: P[][] = [], konstruiert: boolean[][] = [], verbindungen: Verbindung[] = []
    let cur: P[] = [], curK: boolean[] = []
    const flush = () => { if (cur.length >= 2) { teile.push(cur); konstruiert.push(curK) } cur = []; curK = [] }
    const dazu = (pts: readonly P[], k = false) => {
      for (const p of pts) if (!cur.length || dist(cur[cur.length - 1], p) > 1e-9) { if (cur.length) curK.push(k); cur.push([p[0], p[1]]) }
    }
    const verbindung = (x: Ersatz, linie: P[]) => verbindungen.push({ art: x.art === 'bucht' || x.art === 'oeffnung' ? x.art : 'einmuendung', von: linie[0],
      bis: linie[linie.length - 1], linie: linie.map(p => [p[0], p[1]] as P) })
    let pos: Lage | null = TT.length ? { t: 0, lam: 0 } : null
    const bis = (z: Lage) => {
      if (!pos) return
      while (pos.t < z.t) { dazu(teilStueck(TT[pos.t], pos.lam, teilLaenge(TT[pos.t]))); flush(); pos = { t: pos.t + 1, lam: 0 } }
      dazu(teilStueck(TT[pos.t], pos.lam, z.lam)); pos = z
    }
    for (let i = 0; i < liste.length; i++) {
      const x = liste[i], li = linien[i]
      if (!pos) break
      if (!x.a) {
        if (li) { dazu(li, true); verbindung(x, li) }
        pos = x.b
        continue
      }
      bis(x.a)
      if (!x.b) {
        if (li) { dazu(li, true); verbindung(x, li) }
        pos = null
        break
      }
      if (li) { dazu(li, true); verbindung(x, li) }
      else flush()
      pos = x.b
    }
    if (pos) bis({ t: TT.length - 1, lam: teilLaenge(TT[TT.length - 1]) })
    flush()
    fuehrung[X] = { teile, verbindungen, konstruiert }

    // gemessener Rand mit Lücken
    const luecken: RandLuecke[] = []
    if (!TT.length) luecken.push({ s0: 0, s1: L, von: null, bis: null })
    else {
      if (TT[0].s[0] > 0.05) luecken.push({ s0: 0, s1: TT[0].s[0], von: null, bis: TT[0].p[0] })
      for (let t = 0; t + 1 < TT.length; t++) {
        const a = TT[t].p[TT[t].p.length - 1], b = TT[t + 1].p[0]
        luecken.push({ s0: TT[t].s[TT[t].s.length - 1], s1: TT[t + 1].s[0], von: a, bis: b })
      }
      const T = TT[TT.length - 1]
      if (T.s[T.s.length - 1] < L - 0.05) luecken.push({ s0: T.s[T.s.length - 1], s1: L, von: T.p[T.p.length - 1], bis: null })
    }
    rand[X] = { teile: TT.map(T => T.p.map(p => [p[0], p[1]] as P)), luecken, verdeckt: verdecktVon[X].map(T => T.p.map(p => [p[0], p[1]] as P)),
      fremd: fremdVon[X].map(T => T.p.map(p => [p[0], p[1]] as P)) }

    // Abweichungen und Bereiche
    for (const x of liste) {
      const von = x.a ? pktVon(x.a) : null, bisP = x.b ? pktVon(x.b) : null
      const sa = von ? ach.station(von).s : 0, sb = bisP ? ach.station(bisP).s : L
      const ab: Abweichung = { seite: X, art: x.art, s0: Math.min(sa, sb), s1: Math.max(sa, sb), von, bis: bisP, verbunden: x.verbunden, grund: x.grund }
      if (x.tiefe !== undefined) ab.tiefe = x.tiefe
      const rv = x.a && tanVor(x.a), rb = x.b && tanNach(x.b)
      if (rv) ab.richtungVon = rv
      if (rb) ab.richtungBis = rb
      abweichungen.push(ab)
      bereiche[X].push({ s0: ab.s0, s1: ab.s1, art: x.art })
    }
    for (const x of nasen) { abweichungen.push(x); bereiche[X].push({ s0: x.s0, s1: x.s1, art: 'nase' }) }
  }
  abweichungen.sort((a, b) => a.s0 - b.s0 || (a.seite < b.seite ? -1 : 1))

  // Querschnitte
  const artBei = (X: Seite, s: number): AbweichungArt | null => {
    let best: AbweichungArt | null = null
    for (const b of bereiche[X]) if (s >= b.s0 - 1e-6 && s <= b.s1 + 1e-6 && (best === null || VORRANG[b.art] > VORRANG[best])) best = b.art
    return best
  }
  const randRichtung = (X: Seite, p: P): P | null => {
    let bt: Teil | null = null, bl = 0, bd = 0.01
    for (const T of teileVon[X]) { const x = lageAuf(T, p); if (x.d < bd) { bd = x.d; bt = T; bl = x.lam } }
    if (!bt) return null
    const r = einheit(sub(punktBei(bt, bl + RICHTUNG_SEHNE_M), punktBei(bt, bl - RICHTUNG_SEHNE_M)))
    return r[0] || r[1] ? r : null
  }
  // Codeprüfung 16.11.2026 (FB12): Kasten je Teil vorab prüfen, sonst wuchs die Zeit je Querschnitt mit der Zahl der verdeckten und
  // fremden Teile (lange Achse mit vielen Lücken: 191 statt 7 µs)
  const kaesten = new Map<Teil, Kasten>()
  const kastenVon = (T: Teil) => { let k = kaesten.get(T); if (!k) { k = kasten(T.p); kaesten.set(T, k) } return k }
  const aufTeilen = (TT: Teil[], p: P) => TT.some(T => { const k = kastenVon(T); return imKasten(p, [k[0] - 1e-3, k[1] - 1e-3, k[2] + 1e-3, k[3] + 1e-3]) && lageAuf(T, p).d < 1e-6 })
  // K3: Richtung des getroffenen Bordstücks in Achsrichtung (links läuft der Umriss gegen die Achse); ein sehr kurzes Stück: Sehne am Rand
  const stueckRichtung = (X: Seite, k: number, p: P): P | null => {
    const x = stuecke[k]
    if (dist(x.a, x.b) < RICHTUNG_KURZ_M) return randRichtung(X, p)
    const r = einheit(sub(x.b, x.a))
    return X === 'links' ? [0 - r[0], 0 - r[1]] : r
  }
  const querschnitt = (s: number): Querschnitt => {
    const st = strahl(s)
    // Bezug zwischen den Seiten (K2): die Achse, in das Fahrbahnstück der Normalen geschoben (wie im VeloroutenCheck messquerschnitt.ts)
    let c = 0
    if (st.rechts) c = Math.max(c, st.rechts.t + 0.5)
    if (st.links) c = Math.min(c, st.links.t - 0.5)
    const seitenPunkt = (X: Seite): Omit<QuerPunkt, 'mess'> => {
      const t = st[X]
      let punkt: P | null = null, quer: number | null = null, richtung: P | null = null
      if (t && t.grund === 'bord' && t.stueck !== null && imRand[X].has(t.stueck)) {
        const ausser = fremdVon[X].length ? [...verdecktVon[X], ...fremdVon[X]] : verdecktVon[X]
        if (ausser.length && aufTeilen(ausser, t.punkt) && !aufTeilen(teileVon[X], t.punkt)) {
          // K2: Treffer auf einem verdeckten Teil: der Teil davor gilt (innerster Schnitt der Normalen mit dem gemessenen Rand); ebenso auf
          // einem Randstück einer anderen Fahrbahn (Nachtrag C, C2) – ohne Teil davor kein Bordpunkt
          const sg = X === 'links' ? 1 : -1
          let best: { t: number; T: Teil; k: number; lam: number } | null = null
          for (const T of teileVon[X]) for (const x of teilSchnitte(T, st.o, st.n, BAND_M))
            if (sg * x.t > sg * c && sg * x.t <= sg * t.t + 1e-9 && (!best || sg * x.t < sg * best.t)) best = { ...x, T }
          // Codeprüfung 16.11.2026 (FB5): auf einem fremden Stück ohne Teil davor gilt der eigene Rand dahinter (nächster Schnitt jenseits;
          // Seiteninsel vor dem Bord: sonst kein Bordpunkt)
          if (!best && aufTeilen(fremdVon[X], t.punkt))
            for (const T of teileVon[X]) for (const x of teilSchnitte(T, st.o, st.n, BAND_M))
              if (sg * x.t > sg * t.t && (!best || sg * x.t < sg * best.t)) best = { ...x, T }
          if (best) { punkt = add(st.o, st.n, best.t); quer = best.t; richtung = teilRichtung(best.T, best.k, best.lam) }
        } else { punkt = [t.punkt[0], t.punkt[1]]; quer = t.t; richtung = stueckRichtung(X, t.stueck, t.punkt) }
      }
      const art: StellenArt = artBei(X, s) ?? (punkt ? 'normal' : 'unbekannt')
      return { punkt, quer, herkunft: punkt ? 'av' : 'unbekannt', art, richtung }
    }
    const l = seitenPunkt('links'), r = seitenPunkt('rechts')
    // örtliche Randrichtung: Mittel der Richtungen der getroffenen Strecken beider Ränder, soweit höchstens RICHTUNG_MAX_GRAD von der Achse
    // (BK4: eine Nasenflanke oder Mündungsecke ist keine repräsentative Messrichtung; ihr Bordpunkt bleibt für Rand und Breite)
    const ra = ach.richtung(s), grenze = Math.cos(RICHTUNG_MAX_GRAD * GRAD)
    const us = [l.punkt && l.richtung, r.punkt && r.richtung].filter((u): u is P => !!u && dot(u, ra) >= grenze)
    const richtung = us.length ? einheit(us.reduce((m, x) => add(m, x), [0, 0] as P)) : null
    let breite: number | null = null, mL: P | null = null, mR: P | null = null
    if (l.punkt && r.punkt) {
      const u = richtung ?? ra
      breite = Math.abs(kreuz(u, sub(l.punkt, r.punkt)))
      // K4: Masslinie auf dem Messquerschnitt, senkrecht zum Bord durch die Mitte der Bordpunkte bis zu den Bordgeraden
      const M: P = [(l.punkt[0] + r.punkt[0]) / 2, (l.punkt[1] + r.punkt[1]) / 2], nu = links(u)
      mL = add(M, nu, dot(sub(l.punkt, M), nu)); mR = add(M, nu, dot(sub(r.punkt, M), nu))
    }
    return { s, achse: st.o, normale: st.n, links: { ...l, mess: mL }, rechts: { ...r, mess: mR }, breite, richtung }
  }
  const querschnitte = L > 0 ? stationen(L, schritt).map(querschnitt) : []
  return { achse: ach, stuecke, stueckSeite, rand, fuehrung, abweichungen, querschnitte, querschnitt }
}

// ── 7. Bord für Schnitte quer zur Fahrbahn ──
/** Bord einer Seite für Schnitte quer zur Fahrbahn: Teile und die gerade überbrückten Stellen «Rand unbekannt» (konstruiert) */
export interface SchnittBord { teile: P[][]; ueberbrueckt: { von: P; bis: P; grund: string }[] }

/**
 * Bord einer Seite für Schnitte quer zur Fahrbahn (Plan A6). basis 'fuehrung' (Lage der Fahrlinie): die Führungslinie (Einmündung und
 * Bucht gerade verbunden, auch über ein Abschnittsende hinaus verlängert; Trottoirnase bleibt). basis 'rand' (Enden eines
 * Fussgängerstreifens): der gemessene Rand, dazu jede bestätigte Einmündung bzw. Bucht als gerade Strecke zwischen ihren beiden
 * Anschlusspunkten (nur dazwischen, nicht verlängert: ein Streifen in der Mündung endet auf der Linie des Bords der gequerten Strasse,
 * ein Streifen ausserhalb am wirklichen Bord). Zu beiden jede Abweichung «Rand unbekannt» mit beiden Anschlusspunkten höchstens
 * SCHNITT_LUECKE_MAX_M auseinander als gerade Strecke (konstruiert, nicht gemessen; Breiten lesen weiter nur den gemessenen Rand).
 * Beispiel: Fussweg E 48,5…51,5 in der Fläche Strasse_Weg, Bord N 4 → Teile N 4 bis E 48,5 und ab E 51,5, dazu die Strecke
 * (48,5, 4)–(51,5, 4); ueberbrueckt nennt sie.
 */
export function schnittBord(m: Bordmodell, seite: Seite, basis: 'fuehrung' | 'rand' = 'fuehrung'): SchnittBord {
  const teile = (basis === 'rand' ? m.rand[seite].teile : m.fuehrung[seite].teile).map(t => t.map(p => [p[0], p[1]] as P))
  const ueberbrueckt: SchnittBord['ueberbrueckt'] = []
  for (const a of m.abweichungen) {
    if (a.seite !== seite || !a.von || !a.bis) continue
    const verbunden = basis === 'rand' && a.verbunden && (a.art === 'einmuendung' || a.art === 'oeffnung' || a.art === 'bucht')
    if (!verbunden && (a.art !== 'unbekannt' || dist(a.von, a.bis) > SCHNITT_LUECKE_MAX_M)) continue
    teile.push([[a.von[0], a.von[1]], [a.bis[0], a.bis[1]]])
    ueberbrueckt.push({ von: a.von, bis: a.bis, grund: a.grund })
  }
  return { teile, ueberbrueckt }
}

// ── 6. Parallele ──
/** Schlaufen entfernen: schneiden sich zwei nicht benachbarte Strecken, fällt alles dazwischen weg (Innenseite enger Kurven) */
function schlaufenEntfernen(p: P[]): P[] {
  let pts = p, i = 0
  while (i < pts.length - 3) {
    let gefunden = false
    for (let j = pts.length - 2; j >= i + 2; j--) {
      const x = schnittStrecken(pts[i], pts[i + 1], pts[j], pts[j + 1])
      if (x) { pts = [...pts.slice(0, i + 1), x, ...pts.slice(j + 1)]; gefunden = true; break }
    }
    if (!gefunden) i++
  }
  return pts
}

/**
 * Linie im Abstand zur Seite (in Laufrichtung links bzw. rechts), z. B. innere Kante eines Velostreifens 1,80 m vom Bord.
 * Ecken: innen der Schnittpunkt der versetzten Strecken, aussen die Gehrung bis GEHRUNG_MAX × Abstand, darüber ein Bogen um die Ecke;
 * enge Kurven ohne Selbstüberschneidung (Schlaufen entfernt).
 * Beispiel: (0,0)–(10,0)–(10,10), 1,8 links → (0,1,8)–(8,2,1,8)–(8,2,10); rechts → (0,−1,8)–(11,8,−1,8)–(11,8,10).
 */
export function parallele(linie: readonly P[], abstand: number, seite: Seite): P[] {
  const pts: P[] = []
  for (const p of linie) if (!pts.length || dist(pts[pts.length - 1], p) > 1e-9) pts.push([p[0], p[1]])
  if (pts.length < 2 || !(abstand > 0)) return pts
  const d = seite === 'links' ? abstand : -abstand
  const st = pts.slice(1).map((b, i) => { const a = pts[i], r = einheit(sub(b, a)), n = links(r); return { a: add(a, n, d), b: add(b, n, d), r } })
  const aus: P[] = [st[0].a]
  for (let i = 1; i < st.length; i++) {
    const s0 = st[i - 1], s1 = st[i], c = pts[i]
    const cos = dot(s0.r, s1.r), sin = kreuz(s0.r, s1.r)
    if (Math.abs(sin) < 1e-12 && cos > 0) { aus.push(s0.b); continue }
    const x = Math.abs(sin) >= 1e-12 ? schnittGeraden(s0.a, s0.r, s1.a, s1.r) : null
    if (sin * d > 0) {
      // Innenseite: Schnittpunkt, wenn er auf beiden versetzten Strecken liegt; sonst beide Enden (die Schlaufe fällt unten weg)
      const t0 = x ? dot(sub(x, s0.a), s0.r) : -1, t1 = x ? dot(sub(x, s1.a), s1.r) : -1
      if (x && t0 >= 0 && t0 <= dist(s0.a, s0.b) + 1e-9 && t1 >= -1e-9 && t1 <= dist(s1.a, s1.b)) aus.push(x); else aus.push(s0.b, s1.a)
      continue
    }
    if (x && 1 / Math.sqrt((1 + cos) / 2) <= GEHRUNG_MAX) { aus.push(x); continue }   // Gehrung
    // Bogen um die Ecke (Radius = Abstand) im Drehsinn der Linie, als umschriebenes Vieleck: nirgends näher als der Abstand
    const phi = Math.abs(sin) < 1e-12 ? (d > 0 ? -Math.PI : Math.PI) : Math.atan2(sin, cos)
    const w0 = Math.atan2(s0.b[1] - c[1], s0.b[0] - c[0]), n = Math.max(1, Math.ceil(Math.abs(phi) / (15 * GRAD)))
    const dw = phi / n, rr = abstand / Math.cos(dw / 2)
    aus.push(s0.b)
    for (let k = 0; k < n; k++) { const w = w0 + dw * (k + 0.5); aus.push([c[0] + rr * Math.cos(w), c[1] + rr * Math.sin(w)]) }
    aus.push(s1.a)
  }
  aus.push(st[st.length - 1].b)
  return schlaufenEntfernen(aus)
}
