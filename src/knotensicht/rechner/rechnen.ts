// ── Rechnung E0 bis E3c: Knoten bzw. Grundstückzufahrt, Zufahrt, Beobachtungspunkt, Fahrstreifenachsen, Sicht je Richtung,
//    Status, Annahmen, Massnahmen nach Ziffer 14 ──
//
// Ablauf: Kontext aus AV und OSM (Netz, Fahrbahn, Trottoir, Gebäude), Knoten und Arme, Vortrittsstrasse, Zufahrt (gewählt
// bzw. eindeutiger Vorschlag; E2b auch Grundstückzufahrt ab einem Zufahrtspunkt, grundstueck.ts), Vortrittsregelung (Eingabe
// bzw. OSM highway=stop an der Zufahrt), Strassentyp und ungünstige Verhältnisse (Eingabe bzw. Vorgabe aus OSM), Querschnitte,
// nächstliegender Rand, Achse des Zufahrtsstreifens, Nullpunkt (Kante, Haltelinie bzw. Trottoirhinterkante), B und D (bzw. D
// von Hand), je Richtung Tempo (OSM bzw. von Hand), Tab. 1 nach
// Strassentyp, Anhaltesichtweite bei der Neigung, Fahrstreifenachse, Kreuzungspunkt K, Zielpunkte je 1 m bis 1,5 × oberer
// Wert, Sicht gegen die AV-Gebäude und die Hindernisse (E2a: von Hand, bestätigte Vorschläge, amtliche Parkfelder; Palisade
// für Bäume), Status und Sichtdreieck, nötiger AV-Ausschnitt, Vorschläge (OSM-Parkierung im Sichtfeld, Baumkataster). Alle
// Annahmen kommen als Text zurück und stehen in der Seite.
// E3a: Längsneigung je Richtung von Hand bzw. als Vorgabe aus dem Höhenmodell (fall.hoehen, geholt von der App entlang der
// profilLinie je Richtung und des zufahrtProfil); Massnahmen nach Ziffer 14 (massnahmen.ts) als Varianten dieser Rechnung.
// Neigung unbekannt (Entscheid 31.10.2026): weder von Hand noch messbar (kein Profil, zu kurz, Dienst-Fehler), Höhenmodell fertig
// geladen: je Tabelle der strengste Wert (Tab. 2 Spalte ≤ −6, Tab. 3 Spalte ≤ −4, Anhaltesichtweite bei −12 %); solange das
// Höhenmodell lädt, vorerst 0 %.
// E3b: je Richtung die Prüfung des Veloverkehrs auf der Veloachse (velo.ts, Tab. 3; Radstreifen verschiebt die Autoachse, ein Radweg
// näher als 2,00 m den Nullpunkt von B), mit Trottoir an der Zufahrt die Prüfung des Trottoirverkehrs von D' aus (Tab. 2); der
// Gesamtstatus je Richtung ist der schlechteste der Teile (Entscheid 1).
// E3c: bei Rechtsvortritt an einem Knoten Teil E (rechtsvortritt.ts): Arme links und rechts der Zufahrt statt der Vortrittsstrasse,
// Nullpunkt am Rand des rechten Arms, B 5,00 m, Tempo 30 km/h fest; nach rechts die Sicht auf die Fahrstreifenachse des rechten Arms
// mit dem Zustand nach Abb. 6 (Wahrnehmbarkeit als Eingabe), bei schmaler Zufahrt das Sichtfeld nach Abb. 5 (Konstruktion nach bfu
// BM.021 Abb. 4, Block 5); von links keine
// Prüfung (dieser Verkehr muss der Zufahrt den Vortritt lassen); auf Wunsch dieselbe Rechnung für jeden Arm.
//
// K0 (23.10.2026): Trottoirüberfahrt und amtliches Tempo. Schnittstelle «Knotensicht einer Zufahrt mit Trottoirüberfahrt» (auch für
// die Kopie in fgsCheck; Kern = rechner/ und daten/osm.ts, daten/av.ts, daten/parkkataster.ts, daten/baumkataster.ts, daten/holen.ts,
// daten/vsig.ts, daten/hoehen.ts, geo.ts, ohne UI):
//
//   rechneKnoten(osm, av, {
//     knoten, zufahrt,                       // OSM-Knoten und Arm «wid:i:sd» (bzw. zufahrtspunkt für eine Ausfahrt ohne Knoten)
//     eingaben: { ...KEINE_ALLE_EINGABEN, trottoirueberfahrt: { breite: null | m }, D?: P, Dtrottoir?: P },   // D, D' von Hand
//     hindernisse, avZentrum, hoehen,
//     tempoAmtlich: { linien, bereich, quelle } | null,   // Stadt Bern: V_sig des Geoportals (daten/vsig.ts), sonst null = OSM
//   }) -> Rechnung; ergebnis.trottoirueberfahrt: TueErgebnis (Breite mit Herkunft, Abstand des hinteren Rands vom Fahrbahnrand, Länge
//      auf der Achse, vorderer und hinterer Rand, durchgehend = Zufahrt auf der durchgehenden Strasse (Ziffer 14.2), Status je Phase),
//      Phase Trottoir = ergebnis.trottoirPruefung (D' = B 3,00 m hinter dem hinteren Rand, VSS 40 273 Ziffer 13.2; Zielpunkte auf
//      der Gehlinie 0,50 m vor dem hinteren Rand der Überfahrt, Tab. 2), Phase Fahrbahn = ergebnis.richtungen (Auto Tab. 1, Velo
//      Tab. 3, B ab der Bordkante).
//
// Block 5 (31.10.2026): Abb. 2 der VSS 40 090b nach der Ablesung des Auftraggebers (anhaltesicht.ts); ungünstige Verhältnisse mit
// den Massen des Kantons Solothurn (strasseBestimmen, Annahme); beim Rechtsvortritt an schmalen Zufahrten das Sichtfeld nach bfu
// BM.021 Abb. 4 statt der Paarmatrix (rechtsvortritt.ts); ausserorts der Überholfall (VSS 40 273 Ziffer 6, Abb. 1) als eigener Teil
// je Richtung; Hinweise ohne Statuswirkung zu Einbiegewinkel, Rechtsvortritt (Ziffer 15), Reduktion der Anhaltesichtweite (VSS 40 090b
// Ziffer 6) und «Kein Vortritt statt Stop» (SSV Art. 36 Abs. 7). Das Feld «haltelinie» steht für die Halte- oder Wartelinie.
//
// Im Modus gilt (VSS 40 242 Ziffern 12.3, 14.4): kein Rechtsvortritt (Vorgabe Vortritt bzw. Stop aus OSM; «Rechtsvortritt» gewählt:
// gerechnet wie Vortritt), Nullpunkt von B an der Bordkante (vorderer Rand der Überfahrt; eine Haltelinie bzw. ein Radweg nach Ziffer 12
// gehen vor), Sicht aufs Trottoir ab dem hinteren Rand mit der Gehlinie; Breite der Überfahrt in trottoirueberfahrt.ts. Ohne Modus
// rechnet der Kern wie 0.5.0 (Trottoirachse in der Mitte, Nullpunkt an der Trottoirhinterkante bzw. mit «ohne Hindernisse» an der
// Bordkante). Amtliches Tempo: je Richtung Mehrheit entlang der Mittellinie des Arms (tempo.amtlichEntlang; überwiegen die Punkte an
// einer Linie ohne Wert, gilt OSM), vor OSM, von Hand geht vor.

import { type P, lv95, wgs, neg, drehung, kreuz, dist, links, imPolygon, wdiff, sub, add, abstandStrecke } from '../geo'
import type { OsmDaten } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { OsmNetz, abschneiden } from './netz'
import { Fahrbahn, Gebaeude, Flaechen, SEHNE_HALB } from './flaechen'
import { OsmAchsen, type SpurEnde } from './achsen'
import { fahrstreifenmitte, lageOsm, LAGE_ERSATZ, randProfil, fahrstreifenLagen, profilBei, lageMuendung } from './fahrstreifen'
import { punkteAufSpur, SEHNE_MIN_PUNKTE } from './spur'
import { wegTempo, tempoEntlang, zonenTempo, amtlichEntlang, TEMPO_ERSATZ } from './tempo'
import { tueBand, TUE_GEHLINIE_M, TUE_BREITE_ANNAHME_M, type TueBand } from './trottoirueberfahrt'
import { sichtweiteA, zielLaenge, sichtStatus, istHvsHighway, TAB1, TAB1_MAX, ZIEL_FAKTOR, STRASSENTYP_TEXT, NEIGUNG_GROSS_PROZENT,
  NEIGUNG_EBEN_PROZENT, ZWISCHENWERT_TEXT, SCHWERVERKEHR_PROZENT, type Strassentyp, type Ungunst,
  HVS_HIGHWAY } from './sichtweite'
import { ANHALTESICHT_I_MIN } from './anhaltesicht'
import { knotenInfo, vortrittPaar, vortrittsSignale, signalAnArm, armText, nachNr, knotenArt, keineKnoten, istLsaKnoten, ampelPunkte,
  knotenFinden, fahrbahnteilungText, GABELUNG_TEXT, KREISEL_TEXT, ZUSAMMENFUEHRUNG_TEXT } from './knoten'
import { grundstueckGeometrie, type GrundstueckGeo } from './grundstueck'
import { parkStreifen, sondenRechts, parkStreifenText, KEIN_PARKSTREIFEN, PARK_SONDE_RADIUS_M, PARK_EIN_FELD_TREFFER,
  type ParkStreifen } from './hauptachsen'
import { armMittellinieMitEnde, muendungGeglaettet, querschnitt, fahrstreifenAchse, versetzt, versetztVariabel, mitVerlaengerung, schnittBei, lot,
  abBogen, randLinksBei, randRechtsBei, D_MFZ_M, VERLAENGERUNG_M, SEHNE_OFFEN_ANTEIL, type Querschnitt } from './hauptachsen'
import { massnahmenRechnen, type Variante, type VarianteRichtung } from './massnahmen'
import { PROFIL_MIN_M, ZUFAHRT_STEIL_PROZENT } from './neigung'
import { B_INNERORTS_M, B_AUSSERORTS_M, istAusserorts, beobachtungsdistanz, beobachtungspunkt, beobachtungAb, lageAnAchse, trottoirAnZufahrt, querlinie,
  FAHRERSITZ_M } from './beobachtung'
import { sichtEntlang, sichtdreieck, PALISADE_MIN_M, type Verdeckend } from './sicht'
import { veloSichtweite, trottoirSichtweite, radwegLinien, radwegNeben, veloVorgabe, trottoirNeben, richtungsAenderung, KURVE_GRAD,
  D_VELO_M, RADSTREIFEN_M, RADWEG_BREITE_M, RADWEG_NAH_M, VELOFUEHRUNG_TEXT, TAB2, TROTTOIR_NEIGUNG_AUSLEGUNG, type RadwegLinie, type RadwegLage,
  type Velofuehrung } from './velo'
import { rechterArm, rechteArme, linkerArm, RECHTS_MIN_GRAD, zustandAbb6, rvMindest, sichtfeldEng, RV_TEMPO, RV_B_M, RV_A_M, RV_A_MIN_M, RV_ZIEL_M, SCHMAL_M,
  ENG_LAENGE_M, ENG_SCHRITT_M, WAHRNEHMBARKEIT_VORGABE, WAHRNEHMBARKEIT_TEXT, WAHRNEHMBARKEITEN, ZUSTAND_TEXT, ABB6_GRENZEN, type Wahrnehmbarkeit,
  type Zustand } from './rechtsvortritt'
import { hindernisVerdeckend, HindernisDaten, BAUM_STAMM_M, type Hindernis, type ParkRaster } from './hindernisse'
import { PARKSTREIFEN, PARK_SONDE_M, PARK_MIN_TREFFER, type AbzugQuelle } from './fahrstreifen'
import { parkVorschlaege, baumVorschlaege, parkKatasterFelder, osmUeberdeckt, imSichtfeld } from './vorschlaege'
import { KEINE_EINGABEN, KEINE_HINDERNISSE, KEINE_KNOTEN_EINGABEN, type ArmInfo, type Ergebnis, type HindernisEingaben,
  type HindernisStand, type KnotenEingaben, type KnotenFall, type KnotenInfo, type Rechnung, type Regelung, type Richtung,
  type RichtungErgebnis, type SichtEingaben, type StrasseErgebnis, type TempoArt, type TempoEingabe, type VerdeckerEintrag,
  type HaltelinieErgebnis, type TrottoirErgebnis, type VortrittsHinweis, type HoehenVorgabe, type NeigungMessung, type SichtTeil,
  type VeloErgebnis, type TrottoirPruefung, type TrottoirRichtung, type RichtungStatus, type RvArm, type RvStatus,
  type RechtsvortrittErgebnis, type Lage, type TempoAmtlichDaten, type TueErgebnis, type TuePhase, type UeberholStand,
  type UeberholTeil, type AnnahmeThema, type AnnahmeThemaId, TUE_BREITE_MIN, TUE_BREITE_MAX } from './typen'
import { GEGENUEBER_GRAD, geradeausWinkel, lageVon, lageKurz, lageNach, lageWort } from './lage'

/** Abruf um den Knoten (App): AV ±150 m, OSM Umkreis 300 m */
export const AV_RADIUS_M = 150
export const OSM_RADIUS_M = 300
/** amtliche Parkfelder und Baumkataster (map.bern.ch): Ausschnitt um den Knoten wie die AV */
export const KATASTER_RADIUS_M = AV_RADIUS_M
/** AV nach Bedarf nachladen (App): weitester Zielpunkt ab Knoten plus Reserve, höchstens AV_MAX_M */
export const AV_RESERVE_M = 20
export const AV_MAX_M = 400
/** Radius für das Nachladen der AV: der Bedarf (weitester Zielpunkt plus Reserve), höchstens AV_MAX_M; null = kein Nachladen
 *  nötig (Bedarf gedeckt bzw. schon AV_MAX_M geladen) */
export function avNachladen(bedarf: number, geladen: number): number | null {
  if (bedarf <= geladen || geladen >= AV_MAX_M) return null
  return Math.min(bedarf, AV_MAX_M)
}
/** Länge der Mittellinien der vortrittsberechtigten Arme: 1,5 × grösster oberer Wert und Reserve für K */
const ARM_LAENGE_M = Math.ceil(ZIEL_FAKTOR * TAB1[TAB1_MAX][1]) + 60
/** Zufahrt: Mittellinie und Querschnitt (fahrstreifenmitte) ab dem Rand der Vortrittsstrasse plus ZUF_VON_M bis plus ZUF_BIS_M */
const ZUF_LAENGE_M = 80
/** Hinweis beim Rechtsvortritt: Voraussetzungen nach VSS 40 273 Ziffer 15 prüft die App nicht (Wortlaut des Auftraggebers,
 *  Korrektur 31.10.2026; die Voraussetzungen stehen in der Regelübersicht) */
/** Rechtsvortritt (Nutzer 31.10.2026, Korrektur Punkt 24): Tempo wie sonst aus OSM bzw. Geoportal oder von Hand; die Auto-Sicht
 *  folgt Abb. 6, die auf 30 km/h beruht */
export const RV_TEMPO_TEXT = `Die Norm geht beim Rechtsvortritt von ${RV_TEMPO} km/h aus (Ziffer 15, S. 10); ein tieferes Tempo ändert die nötige Sicht nicht.`
export const RV_VORAUSSETZUNG_TEXT = 'Ob hier Rechtsvortritt korrekt ist, prüft die App nicht. Das muss vor Ort gemäss VSS 40 273 geprüft werden.'
const ZUF_VON_M = 4
const ZUF_BIS_M = 34
const ZUF_SCHRITT_M = 2
/** nächstliegender Rand: so weit entlang der Arme gezeichnet */
const RAND_LAENGE_M = 60
/** Einbiegewinkel unter diesem Wert (bzw. über 180° minus diesem Wert) gilt als schief (Annahme zu B) */
const SCHIEF_UNTER = 75
/** Block 5: Einbiegewinkel unter diesem Wert (bzw. über 180° minus diesem Wert): Hinweis «deutlich von 90° abweichend» (VSS 40 273
 *  Ziffer 10); eigene Grenze, Annahme (Anhalt VSS 40 242 Ziffer 14.3.4, S. 12) */
export const EINBIEGEWINKEL_GRENZE_GRAD = 45
/** Haltelinie (E2b): höchstens so weit neben der Zufahrtsachse geklickt, höchstens so weit vor bzw. hinter der Kante */
export const HALTELINIE_SEITLICH_M = 6
export const HALTELINIE_VOR_M = 6
export const HALTELINIE_HINTER_M = 30
/** Haltelinie auf der Karte: so weit beidseits der Achse */
const HALTELINIE_HALB_M = 1.5
/** D von Hand: Hinweis, wenn weiter als so weit vom Nullpunkt */
export const D_HAND_WEIT_M = 30
/** Signal an einer Grundstückzufahrt: bis so weit neben den ersten Metern der Zufahrt */
const SIGNAL_ZUFAHRT_M = 4

/** Block 5: Hinweis bei «Stop», wenn die Sicht reicht (SSV Art. 36 Abs. 7; kantonale Praxis, eigene Worte) */
export const KEIN_VORTRITT_STATT_STOP = 'Kein Vortritt statt Stop möglich: Stop nur, wo die Sicht nicht reicht (SSV Art. 36 Abs. 7; Praxis ' +
  'TBA Bern Arbeitshilfe Vortritt Kap. 2.3, vif Luzern 653.105, Basel-Stadt AB-SSV Teil 1 Kap. 5.2).'

/** Themen der Annahmen in der Reihenfolge der Rechnung (Korrektur 31.10.2026): je Thema ein Punkt in Alltagssprache; allgemeine Regeln
 *  stehen in der Regelübersicht (regeln.ts), technische Einzelheiten in Ergebnis.herleitung */
export const ANNAHME_THEMEN: readonly [AnnahmeThemaId, string][] = [
  ['vortritt', 'Vortritt'], ['wartend', 'Wartendes Fahrzeug'], ['verkehr', 'Verkehr mit Vortritt und nötige Sicht'],
  ['hindernisse', 'Hindernisse'], ['wahrnehmbarkeit', 'Wahrnehmbarkeit'], ['eng', 'Enge Kreuzung'],
]
/** Quelle mit Strichpunkten als Sätze: «ohne Signal in OSM; Quartierstrasse …» -> «ohne Signal in OSM. Quartierstrasse …» */
const saetze = (q: string) => q.split('; ').map((x, i) => (i ? x.charAt(0).toUpperCase() + x.slice(1) : x)).join('. ')
/** Richtung im Satz: «von links», «beim Gegenverkehr» */
const vonSatz = (r: { lage: Lage }) => (r.lage === 'gegenueber' ? 'beim Gegenverkehr' : `von ${r.lage}`)
/** Name eines Arms im Satz: Strassenname, sonst Nummer, Name und Himmelsrichtung */
const armName = (a: ArmInfo) => a.name || armText(a)
const gross = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)

/** Korrektur 31.10.2026 (Punkt 14): die Regelung gilt für die gewählte Zufahrt; Werte im Code und in der Fall-Datei bleiben */
export const REGELUNG_TEXT: Record<Regelung, string> = { vortritt: 'Kein Vortritt (Signal 3.02)', stop: 'Stop (Signal 3.01)',
  rechtsvortritt: 'Rechtsvortritt (ohne Signal)' }
/** Korrektur 31.10.2026 (Punkt 13): Hinweis oben im Ergebnis und im Bericht an einem LSA-Knoten */
export const LSA_TEXT = 'Lichtsignalanlage: Im Betrieb regelt das Lichtsignal, die VSS 40 273 betrifft Knoten ohne Lichtsignal. Gerechnet ' +
  'ist die Rückfallebene bei ausgeschalteter oder gelb blinkender Anlage (Signale Kein Vortritt bzw. Stop darunter).'
export const TEMPO_ART_TEXT: Record<TempoArt, string> = {
  signalisiert: 'signalisierte Höchstgeschwindigkeit', vp: 'Projektierungsgeschwindigkeit VP', v85: 'V85',
  fahrbar: 'fahrbares Tempo bei Verkehrsberuhigung',
}

const f2 = (x: number) => x.toFixed(2).replace('.', ',')
const f1 = (x: number) => x.toFixed(1).replace('.', ',')
/** seitliche Lage zur OSM-Linie in Worten (positiv = rechts in Fahrtrichtung zum Knoten) */
const seiteOsm = (l: number) => (Math.abs(l) < 0.005 ? 'auf der OSM-Achse' : `${f2(Math.abs(l))} m ${l > 0 ? 'rechts' : 'links'} der OSM-Achse`)
/** Neigung mit Vorzeichen, Dezimalkomma */
const fi = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '±') + String(Math.abs(Math.round(x * 10) / 10)).replace('.', ',')

export interface Kontext { netz: OsmNetz; achsen: OsmAchsen; fahrbahn: Fahrbahn; trottoir: Flaechen; gebaeude: Verdeckend[]; osm: OsmDaten
  radwege: RadwegLinie[] }

/** Kontext aus OSM und AV (verdeckend sind die Gebäude der AV; Hindernisse kommen je Rechnung dazu) */
export function kontextBauen(osm: OsmDaten, av: AvFlaeche[]): Kontext {
  const netz = new OsmNetz(osm)
  const geb = new Gebaeude(av)
  return { netz, achsen: new OsmAchsen(netz), fahrbahn: new Fahrbahn(av), trottoir: new Flaechen(av, ['Trottoir']), osm,
    radwege: radwegLinien(osm.querungen ?? []),
    gebaeude: geb.r.teile.map((t, i) => ({ poly: t.poly, id: `gebaeude:${i}`, name: 'Gebäude (AV)', art: 'Gebäude', quelle: 'AV' })) }
}

const leer = (meldung: string, t0: number, knoten: Rechnung['knoten'] = null, netz: OsmNetz | null = null,
  ampeln: P[] = []): Rechnung => ({ knoten, ergebnis: null, meldungen: [meldung], ms: performance.now() - t0, ...(netz ? umkreis(netz, ampeln) : {}) })
/** Korrektur 31.10.2026 (Punkte 12, 13, 16, 17): Gabelungen, Kreisel und Fahrbahnteilungen bzw. LSA-Knoten im geladenen Umkreis
 *  (Knotensuche, Karte) */
const umkreis = (netz: OsmNetz, ampeln: P[]) => ({ keinKnoten: keineKnoten(netz),
  lsaKnoten: ampeln.length ? knotenFinden(netz).filter(n => istLsaKnoten(netz, n, ampeln)) : [] })

/** Eingaben zum Knoten aus dem Fall (fehlende Felder: Vorgabe) */
export function knotenEingabenAus(e: Partial<KnotenEingaben> | undefined): Required<KnotenEingaben> {
  return { regelung: e?.regelung ?? null, haltelinie: e?.haltelinie ?? null, D: e?.D ?? null, trottoirFrei: e?.trottoirFrei ?? false,
    tempo: { links: e?.tempo?.links ?? null, rechts: e?.tempo?.rechts ?? null }, velo: { links: e?.velo?.links ?? null,
      rechts: e?.velo?.rechts ?? null }, ebikeVerboten: e?.ebikeVerboten ?? false, wahrnehmbarkeit: e?.wahrnehmbarkeit ?? null,
    alleArme: e?.alleArme ?? false, markierungRv: e?.markierungRv ?? false, trottoirueberfahrt: e?.trottoirueberfahrt ?? null, Dtrottoir: e?.Dtrottoir ?? null,
    ueberholen: e?.ueberholen ?? null }
}

/** Rechnung für den gewählten Knoten und die Zufahrt (ohne Zufahrt: Vorschlag, sonst nur Knoten und Arme) bzw. für eine
 *  Grundstückzufahrt (fall.zufahrtspunkt); avRadius = Halbseite des geladenen AV-Ausschnitts (für den Hinweis und den Bedarf an
 *  Nachladen), fall.avZentrum seine Mitte (Vorgabe: Knotenpunkt) */
export function rechneKnoten(osm: OsmDaten, av: AvFlaeche[], fall: KnotenFall, kx: Kontext | null = null,
  avRadius = AV_RADIUS_M): Rechnung {
  const t0 = performance.now()
  const k = kx ?? kontextBauen(osm, av)
  const { netz } = k
  const eg: SichtEingaben = fall.eingaben ? { typ: fall.eingaben.typ, fahrstreifen: fall.eingaben.fahrstreifen,
    neigungGross: fall.eingaben.neigungGross, schwerverkehr: fall.eingaben.schwerverkehr,
    schwerverkehrAnteil: fall.eingaben.schwerverkehrAnteil ?? null, neigung: fall.eingaben.neigung } : KEINE_EINGABEN
  const ke = knotenEingabenAus(fall.eingaben ?? KEINE_KNOTEN_EINGABEN)
  const hg = fall.hindernisse ?? KEINE_HINDERNISSE
  const keineAv = 'Keine AV-Fahrbahn am Knoten: Rechnung nicht möglich (AV nicht frei bzw. ausserhalb der Schweiz).'
  const ampeln = ampelPunkte(osm, lv95)
  if (fall.zufahrtspunkt) {
    // Grundstückzufahrt: Knotenpunkt auf der Vortrittsstrasse, Arme ab dort
    const g = grundstueckGeometrie(netz, k.achsen, k.fahrbahn, fall.zufahrtspunkt)
    if (typeof g === 'string') return leer(g, t0)
    // Korrektur 31.10.2026 (Punkt 16): an einem Kreisel keine Rechnung
    if ([...g.arme, g.zArm].some(a => a.wid >= 0 && netz.W.has(a.wid) && netz.w(a.wid).ring)) return leer(`${KREISEL_TEXT}.`, t0)
    const info: KnotenInfo = { id: 0, p: g.kp, ll: wgs(g.kp[0], g.kp[1]), name: `Grundstückzufahrt, Vortrittsstrasse ${g.strasse}`,
      arme: [...g.arme, g.zArm], vortritt: [g.arme[0].key, g.arme[1].key], vortrittGrund: g.grund, vorschlag: g.zArm.key,
      signale: vortrittsSignale(osm, g.kp, lv95), grundstueck: true }
    if (!av.some(f => f.art === 'Strasse_Weg')) return leer(keineAv, t0, info)
    const ergebnis = rechneZufahrt(k, info, g.zArm, false, eg, ke, avRadius, hg, fall.avZentrum ?? g.kp, g, fall.hoehen ?? null,
      fall.tempoAmtlich ?? null)
    return { knoten: info, ergebnis, meldungen: [], ms: performance.now() - t0 }
  }
  if (fall.knoten === null) return leer('Knoten bzw. Zufahrtspunkt wählen.', t0)
  if (!netz.P.has(fall.knoten)) return leer(`OSM-Knoten ${fall.knoten} nicht in den OSM-Daten.`, t0)
  const kp = netz.p(fall.knoten)
  // Korrektur 31.10.2026 (Punkte 12, 16, 17): Gabelung, Kreisel und Fahrbahnteilung ohne Rechnung (auch aus der Adresse bzw. der Fall-Datei)
  const art = knotenArt(netz, fall.knoten)
  if (art === 'kreisel') return leer(`${KREISEL_TEXT}.`, t0, null, netz, ampeln)
  if (art === 'gabelung') return leer(`${GABELUNG_TEXT}.`, t0, null, netz, ampeln)
  if (art === 'fahrbahnteilung') return leer(`${fahrbahnteilungText(netz, fall.knoten)}.`, t0, null, netz, ampeln)
  if (art === 'zusammenfuehrung') return leer(`${ZUSAMMENFUEHRUNG_TEXT}.`, t0, null, netz, ampeln)
  const info = knotenInfo(netz, fall.knoten, vortrittsSignale(osm, kp, lv95), istLsaKnoten(netz, fall.knoten, ampeln))
  if (!info) return leer(`OSM-Knoten ${fall.knoten} hat weniger als drei Strassenarme (ohne service): kein Knoten nach E0.`, t0)
  const zKey = fall.zufahrt ?? info.vorschlag
  if (!zKey) return leer('Zufahrt wählen: welcher Arm ist vortrittsbelastet?', t0, info, netz, ampeln)
  const zArm = info.arme.find(a => a.key === zKey)
  if (!zArm) return leer('Die gewählte Zufahrt gehört nicht zu diesem Knoten.', t0, info, netz, ampeln)
  if (!av.some(f => f.art === 'Strasse_Weg')) return leer(keineAv, t0, info, netz, ampeln)
  const ergebnis = rechneZufahrt(k, info, zArm, fall.zufahrt === null, eg, ke, avRadius, hg, fall.avZentrum ?? kp, null, fall.hoehen ?? null,
    fall.tempoAmtlich ?? null)
  return { knoten: info, ergebnis, meldungen: [], ms: performance.now() - t0, ...umkreis(netz, ampeln) }
}

/** Ende der OSM-Linie eines Arms der Vortrittsstrasse (Befund 31.10.2026, Knoten 132629283): ab geradeAb [m ab dem Knotenpunkt] nimmt die
 *  App die Mittellinie gerade an (kein Anschlussweg bis 45°); quer: Name der Querstrasse dort, nur wenn eindeutig; kreuzung: am Ende
 *  hängen weitere befahrbare Wege */
export interface ArmEnde { geradeAb: number; quer: string | null; kreuzung: boolean }
export function armEnde(netz: OsmNetz, e: SpurEnde): ArmEnde {
  const eigene = new Set(e.wege.filter(w => netz.W.has(w)).map(w => netz.w(w).name).filter(x => x))
  const andere = [...new Set((netz.an.get(e.knoten) ?? []).map(([w]) => w))].filter(w => !e.wege.includes(w) && netz.w(w).mfz)
  const namen = [...new Set(andere.map(w => netz.w(w).name).filter(x => x && !eigene.has(x)))]
  return { geradeAb: e.geradeAb, quer: namen.length === 1 ? namen[0] : null, kreuzung: andere.length > 0 }
}
/** Strassenname mit Artikel im Dativ («mit der Weissensteinstrasse»), ohne Artikel bei unbekannter Endung */
const mitArtikel = (name: string): string =>
  /(strasse|gasse|allee|promenade|halde|matte|brücke|route|zeile|terrasse|chaussee)$/i.test(name) ? `der ${name}` :
  /(weg|platz|ring|rain|graben|steg|stutz|hof|markt|pfad|quai|kai|damm|rank|steig)$/i.test(name) ? `dem ${name}` : name
/** Hinweis, wenn die nötige Sichtweite A über das Ende der OSM-Linie hinausreicht (ohne Statuswirkung) */
export function armEndeText(a: Pick<ArmInfo, 'nr' | 'name' | 'hw' | 'himmel'>, e: ArmEnde): string {
  const wo = !e.kreuzung ? ' (Ende der OSM-Linie)' : e.quer ? ` an der Kreuzung mit ${mitArtikel(e.quer)}` : ' an einer Kreuzung'
  return `Arm ${armText(a)} endet nach ${Math.round(e.geradeAb)} m${wo}. Weiter weg nimmt die App die Fahrlinie gerade an; Sicht und ` +
    'Lage von F_A dort vor Ort prüfen.'
}

/** Strassentyp und ungünstige Verhältnisse der vortrittsberechtigten Strasse: Eingabe, sonst Vorgabe aus OSM highway und lanes
 *  bzw. aus der Neigung (|i| > 5 % in einer Richtung; neigung: wie gerechnet, von Hand bzw. aus dem Höhenmodell) und dem
 *  Schwerverkehrsanteil (> 8 %; Masse nach Kanton Solothurn, Annahme). Fahrstreifen (Block 5): mehr als ein Fahrstreifen je
 *  Richtung; je Arm lanes:forward bzw. lanes:backward, wenn vorhanden (> 1), sonst lanes (Einbahn > 1, sonst > 2) */
export function strasseBestimmen(netz: OsmNetz, arme: ArmInfo[], eg: SichtEingaben,
  neigung: Record<Richtung, number> = { links: eg.neigung.links ?? 0, rechts: eg.neigung.rechts ?? 0 }): StrasseErgebnis {
  const hws = [...new Set(arme.map(a => a.hw))]
  const typVorgabe: Strassentyp = hws.some(istHvsHighway) ? 'hvs' : 'es'
  // lanes, auch «2;3» (je Abschnitt): grösster Wert
  const zahlen = (v: string | undefined) => (v ?? '').split(';').map(x => Number.parseFloat(x)).filter(Number.isFinite)
  const fs = arme.filter(a => a.wid >= 0 && netz.W.has(a.wid)).map(a => {
    const t = netz.w(a.wid).t
    const je = [...zahlen(t['lanes:forward']), ...zahlen(t['lanes:backward'])]
    if (je.length) return { mehr: Math.max(...je) > 1, lanes: Math.max(...je), text: ['lanes:forward', 'lanes:backward']
      .filter(k => t[k] !== undefined).map(k => `${k}=${t[k]}`).join(', ') }
    const l = zahlen(t.lanes)
    if (!l.length) return null
    const max = Math.max(...l), einbahn = a.einbahn !== 0
    return { mehr: max > (einbahn ? 1 : 2), lanes: max, text: `lanes=${String(max).replace('.', ',')}${einbahn ? ', Einbahn' : ''}` }
  }).filter((x): x is NonNullable<typeof x> => x !== null)
  const fsMass = fs.find(x => x.mehr) ?? [...fs].sort((a, b) => b.lanes - a.lanes)[0] ?? null
  const anteil = eg.schwerverkehrAnteil ?? null
  const ungunstVorgabe = {
    fahrstreifen: fs.some(x => x.mehr),
    neigung: Object.values(neigung).some(i => Math.abs(i) > NEIGUNG_GROSS_PROZENT + 1e-9),
    schwerverkehr: anteil !== null && anteil > SCHWERVERKEHR_PROZENT + 1e-9,
  }
  // Schwerverkehr: Häkchen von Hand gesetzt = ungünstig (unabhängig vom Anteil), sonst nach dem Anteil
  const ungunst: Ungunst = { fahrstreifen: eg.fahrstreifen ?? ungunstVorgabe.fahrstreifen, neigung: eg.neigungGross ?? ungunstVorgabe.neigung,
    schwerverkehr: eg.schwerverkehr || ungunstVorgabe.schwerverkehr }
  return { typ: eg.typ ?? typVorgabe, typVorgabe, typQuelle: `OSM highway=${hws.join(' / ')}`, typGewaehlt: eg.typ !== null, ungunst,
    ungunstVorgabe, fahrstreifenQuelle: fsMass ? `OSM ${fsMass.text}` : 'ohne OSM lanes', schwerverkehrAnteil: anteil }
}

/** Abstand über den weitesten Zielpunkt hinaus, bis zu dem amtliche Parkfelder und Bäume angezeigt werden [m] */
const REICHWEITE_RESERVE_M = 10

/** Hindernisse für die Rechnung: Eingaben (von Hand, bestätigte Vorschläge) und amtliche Parkfelder ohne verworfene */
export function zaehlendeHindernisse(hg: HindernisEingaben): Hindernis[] {
  const weg = new Set(hg.verworfen)
  const amtlich: Hindernis[] = (hg.park?.felder ?? []).filter(f => !weg.has(f.id) && f.ring.length >= 3)
    .map(f => ({ id: f.id, art: 'parkfeld', klasse: f.klasse, ring: f.ring, quelle: 'kataster', name: f.name }))
  return [...hg.hindernisse, ...amtlich]
}

/** Tags der Vortrittsstrasse für die Vorgabe der Regelung: highway, Tags, Tempo (maxspeed bzw. Zone, km/h) */
export interface VortrittsstrasseTags { hw: string; t: Record<string, string>; tempo: number | null }
/** Vorgabe der Vortrittsregelung (Entscheid 17.10.2026): Signale an der Zufahrt gehen vor (highway=stop -> Stop, give_way ->
 *  Vortritt). Ohne Signal nach der Vortrittsstrasse: Hauptverkehrsstrasse (trunk/primary/secondary/tertiary inkl. _link,
 *  priority_road, maxspeed ab 50 km/h) -> Vortritt; Quartierstrasse (residential, living_street) mit Tempo 30 bzw. 20 oder
 *  unclassified in einer Tempo-30-Zone (zone:maxspeed, maxspeed:type) -> Rechtsvortritt (SVG Art. 36 Abs. 2, in Tempo-30-Zonen
 *  die Regel); sonst Vortritt. An einer Grundstückzufahrt gilt kein Rechtsvortritt (VRV Art. 15 Abs. 3). Alles ohne Signal ist
 *  eine Annahme (Quelle beginnt mit «ohne Signal in OSM»). K0: an einer Trottoirüberfahrt gilt kein Rechtsvortritt (VSS 40 242
 *  Ziffer 12.3). */
export function regelungVorgabe(signaleZufahrt: VortrittsHinweis[], strasse: VortrittsstrasseTags[] = [], grundstueck = false,
  trottoirueberfahrt = false, lsa = false): [Regelung, string] {
  if (signaleZufahrt.some(s => s.art === 'stop')) return ['stop', 'OSM highway=stop an der Zufahrt']
  if (signaleZufahrt.some(s => s.art === 'give_way')) return ['vortritt', 'OSM highway=give_way («Kein Vortritt») an der Zufahrt']
  if (grundstueck) return ['vortritt', 'ohne Signal in OSM; an einer Grundstückzufahrt gilt kein Rechtsvortritt']
  if (trottoirueberfahrt) return ['vortritt', 'ohne Signal in OSM; an einer Trottoirüberfahrt gilt kein Rechtsvortritt (VSS 40 242 Ziffer 12.3)']
  const hvs = strasse.find(x => HVS_HIGHWAY.includes(x.hw.replace(/_link$/, '')) || ['designated', 'yes'].includes(x.t.priority_road ?? '') ||
    (x.tempo ?? 0) >= 50)
  if (hvs) {
    const grund = HVS_HIGHWAY.includes(hvs.hw.replace(/_link$/, '')) ? `highway=${hvs.hw}` : hvs.t.priority_road ? `priority_road=${hvs.t.priority_road}` :
      `maxspeed ${hvs.tempo} km/h`
    return ['vortritt', `ohne Signal in OSM; Vortrittsstrasse ${grund}`]
  }
  const zone = (x: VortrittsstrasseTags) => zonenTempo(x.t['zone:maxspeed']) ?? zonenTempo(x.t['maxspeed:type'])
  const quartier = strasse.length > 0 && strasse.every(x => (['residential', 'living_street'].includes(x.hw) && (x.tempo ?? 99) <= 30) ||
    (x.hw === 'unclassified' && (zone(x) ?? 99) <= 30))
  // Korrektur 31.10.2026 (Punkt 13): an einem LSA-Knoten als Rückfallebene nie Rechtsvortritt (Annahme)
  if (quartier && lsa) return ['vortritt', 'ohne Signal in OSM; Lichtsignalanlage: als Rückfallebene ohne Rechtsvortritt (Annahme)']
  if (quartier) {
    const z = strasse.map(zone).find(v => v !== null && v <= 30)
    return ['rechtsvortritt', `ohne Signal in OSM; Quartierstrasse mit Tempo ${Math.min(...strasse.map(x => x.tempo ?? 30))} km/h` +
      `${z !== undefined ? ' (Tempo-30-Zone)' : ''}`]
  }
  return ['vortritt', 'ohne Signal in OSM']
}

/** Längsneigung einer Richtung: von Hand, sonst Vorgabe aus dem Höhenmodell (E3a), sonst unbekannt (strengster Wert, Entscheid
 *  31.10.2026) bzw. vorerst 0 %, solange das Höhenmodell lädt. i bleibt bei unbekannter Neigung 0 (kein Mass; die Rechnungen
 *  nehmen mit «unbekannt» den strengsten Tabellenwert, die Vorgabe «grosse Längsneigung» bleibt aus) */
interface NeigungStand { i: number; vorgabe: number; hand: boolean; quelle: string; vorgabeQuelle: string; gemessen: boolean
  unbekannt: boolean; vorgabeUnbekannt: boolean; hinweis: string | null }
/** Quelle einer unbekannten Neigung (Panel, Bericht) */
export const NEIGUNG_UNBEKANNT_QUELLE = 'unbekannt, strengster Wert'
// hoehenDa: die App hat die Profile zu diesem Fall geholt (Fall.hoehen gesetzt). Vorher (null) lädt das Höhenmodell noch: der
// Bericht wartet darauf. Fehlt danach die Messung einer Richtung, wurde für sie kein Profil geholt (nicht geprüft, kein Verkehr):
// kein «lädt», sonst wartete der Druck ewig (Befund 17.10.2026); die Neigung ist dann unbekannt.
export function neigungBestimmen(hand: number | null, m: NeigungMessung | undefined, hoehenDa: boolean): NeigungStand {
  const vorgabe = m?.i ?? 0
  const gemessen = m !== undefined && m.i !== null
  const vorgabeUnbekannt = !gemessen && (m !== undefined || hoehenDa)
  const vorgabeQuelle = gemessen ? m!.quelle : m ? `${m.quelle}: ${NEIGUNG_UNBEKANNT_QUELLE}` : hoehenDa ?
    `ohne Profil: ${NEIGUNG_UNBEKANNT_QUELLE}` : 'Höhenmodell lädt: vorerst 0 %'
  if (hand !== null) return { i: hand, vorgabe, hand: true, quelle: 'von Hand', vorgabeQuelle, gemessen, unbekannt: false, vorgabeUnbekannt,
    hinweis: null }
  return { i: vorgabe, vorgabe, hand: false, quelle: vorgabeQuelle, vorgabeQuelle, gemessen, unbekannt: vorgabeUnbekannt, vorgabeUnbekannt,
    hinweis: m?.hinweis ?? null }
}

/** nurRv: nur für «alle Arme» (E3c): ohne Massnahmen, Trottoir und ohne die Rechnung der übrigen Arme */
function rechneZufahrt(k: Kontext, info: KnotenInfo, zArm: ArmInfo, vorgeschlagen: boolean, eg: SichtEingaben, ke: Required<KnotenEingaben>,
  avRadius: number, hg: HindernisEingaben, avZentrum: P, g: GrundstueckGeo | null, hoehen: HoehenVorgabe | null,
  tempoAmtlich: TempoAmtlichDaten | null, nurRv = false): Ergebnis {
  const { netz, achsen, fahrbahn } = k
  // K0: Trottoirüberfahrt über diese Einmündung (nicht in der Rechnung «alle Arme»)
  const tue = !!ke.trottoirueberfahrt && !nurRv
  const amtlich = tempoAmtlich?.linien.length ? tempoAmtlich : null
  const kp = info.p
  // Annahmen je Thema (Korrektur 31.10.2026): Sätze in Alltagssprache, am Ende je Thema zu einem Punkt zusammengefasst
  const an: Record<AnnahmeThemaId, string[]> = { vortritt: [], wartend: [], verkehr: [], hindernisse: [], wahrnehmbarkeit: [], eng: [] }
  const hinweise: string[] = [], herleitung: string[] = []
  const zName = g ? (g.weg !== null ? `${zArm.name || 'Zufahrt'} (OSM-Weg ${g.weg}, service)` : 'Grundstückzufahrt') : zArm.name || zArm.hw
  const istWeg = (wid: number) => wid >= 0 && netz.W.has(wid)
  if (g) hinweise.push(...g.hinweise)
  // Zufahrt: OSM-Linie des Arms, im Mündungsbereich geglättet (muendungGeglaettet), damit D und F_B nicht an Knickstücken hängen.
  // Befund 31.10.2026 (Knoten 282773328): teilt sich die Fahrbahn der Zufahrt in zwei Einbahnen, folgt die Linie der zuführenden (dort
  // fährt der wartende Verkehr zum Knoten; armMittellinieMitEnde)
  const zLinie = g ? null : armMittellinieMitEnde(netz, achsen, zArm, ZUF_LAENGE_M)
  const zMl = g ? g.zMl(ZUF_LAENGE_M) : muendungGeglaettet(zLinie!.linie)
  const zTeilung = zLinie?.teilungen[0] ?? null

  // Vortrittsstrasse
  let paar: [ArmInfo, ArmInfo], grund: string, durchgehend = false
  if (g) { paar = g.arme; grund = g.grund }
  else if (info.vortritt && !info.vortritt.includes(zArm.key)) {
    paar = info.vortritt.map(key => info.arme.find(a => a.key === key)!) as [ArmInfo, ArmInfo]
    grund = info.vortrittGrund
  } else {
    const vp = vortrittPaar(info.arme, zArm.key)!
    paar = vp[0]; grund = vp[1]
    durchgehend = true
  }
  // Vortrittsregelung (E2b): Eingabe, sonst Vorgabe aus OSM highway=stop/give_way an der Zufahrt
  const anZufahrt = (s: VortrittsHinweis) => istWeg(zArm.wid) ? signalAnArm(netz, zArm, s) :
    zMl.slice(0, -1).some((q, i) => dist(q, kp) <= 30 && abstandStrecke(s.p, q, zMl[i + 1]) <= SIGNAL_ZUFAHRT_M)
  const signaleZ = info.signale.filter(anZufahrt)
  const strasseTags = paar.map(a => a.wid).filter(istWeg).map(wid => ({ hw: netz.w(wid).hw, t: netz.w(wid).t, tempo: wegTempo(netz, wid)?.[0] ?? null }))
  const [rVorgabe, rQuelle] = regelungVorgabe(signaleZ, strasseTags, !!g, tue, !!info.lsa)
  // Korrektur 31.10.2026 (Punkt 13): LSA-Knoten, Hinweis zuoberst
  if (info.lsa) hinweise.push(LSA_TEXT)
  // Korrektur 31.10.2026 (Punkt 15): Arm mit Vortritt von Hand als Zufahrt gewählt
  if (info.mitVortritt?.includes(zArm.key)) hinweise.push(`Die gewählte Zufahrt ${armText(zArm)} hat nach OSM Vortritt (${info.vortrittSicher}): ` +
    'von Hand als Zufahrt gewählt; das Ergebnis gilt nur, wenn dieser Arm wirklich Vortritt gewähren muss.')
  // Trottoirüberfahrt: Rechtsvortritt gilt nicht (VSS 40 242 Ziffer 12.3, VRV Art. 15 Abs. 3), gerechnet wie Vortritt
  const regelung: Regelung = tue && ke.regelung === 'rechtsvortritt' ? 'vortritt' : ke.regelung ?? rVorgabe
  if (tue && ke.regelung === 'rechtsvortritt')
    hinweise.push('Rechtsvortritt an einer Trottoirüberfahrt: gilt nicht (wer über das Trottoir einfährt, ist vortrittsbelastet; VSS 40 242 ' +
      'Ziffer 12.3, VRV Art. 15 Abs. 3); gerechnet wie «Kein Vortritt».')
  // Wortlaut nach dem Auftraggeber (Korrektur 31.10.2026, Punkt 3)
  if (ke.regelung === null)
    an.vortritt.push(`Vortrittsregelung «${REGELUNG_TEXT[regelung]}» angenommen (${saetze(rQuelle)}` +
      `${rVorgabe === 'rechtsvortritt' ? '. Ohne Signal gilt Rechtsvortritt nach SVG Art. 36 Abs. 2' : ''}). Vortrittsregelung kann angepasst werden.`)
  for (const s of info.signale) {
    const art = s.art === 'stop' ? 'Stop' : 'Kein Vortritt'
    if (!signaleZ.includes(s)) hinweise.push(`OSM: Signal «${art}» (highway=${s.art}) an einem anderen Arm des Knotens: Vortrittsstrasse prüfen.`)
    else if (ke.regelung !== null && ke.regelung !== rVorgabe)
      hinweise.push(`OSM: Signal «${art}» (highway=${s.art}) an der Zufahrt; gewählt ist «${REGELUNG_TEXT[regelung]}».`)
  }
  // Rechtsvortritt (E3c, Teil E): an einer Grundstückzufahrt gilt er nicht (wer über ein Trottoir bzw. aus einer Ausfahrt einfährt,
  // ist vortrittsbelastet); am Knoten die Arme links und rechts der Zufahrt
  if (regelung === 'rechtsvortritt' && g)
    hinweise.push('Rechtsvortritt an einer Grundstückzufahrt: gilt nicht (aus einer Ausfahrt bzw. über ein Trottoir ist man ' +
      'vortrittsbelastet, VRV Art. 15 Abs. 3); gerechnet wie «Kein Vortritt».')
  const rv = regelung === 'rechtsvortritt' && !g
  // Zufahrt mit Einbahn vom Knoten weg und Velo gegen die Einbahn (E4): vortrittsbelastet sind nur die Velos; D auf ihrer Achse, F_B
  // als Velo (auch beim Rechtsvortritt: die Velos gewähren dem Verkehr von rechts den Vortritt; nicht an einer Grundstückzufahrt)
  const zVeloGegen = !zArm.zufluss && zArm.veloZufluss && !g ? zArm.veloZuflussQuelle : null
  const rArm = rv ? rechterArm(zArm, info.arme) : null
  const lArm = rv ? linkerArm(zArm, info.arme, rArm) : null
  const wahr: Wahrnehmbarkeit = ke.wahrnehmbarkeit ?? WAHRNEHMBARKEIT_VORGABE
  if (rv && rArm && lArm) {
    paar = [lArm, rArm]
    grund = 'Rechtsvortritt: Arme links und rechts der Zufahrt'
  }
  if (!rv) {
    if (durchgehend) hinweise.push('Die gewählte Zufahrt gehört nach OSM zur durchgehenden Strasse; als vortrittsberechtigt gelten hier ' +
      'die übrigen Arme. Vortrittsregelung vor Ort prüfen.')
    an.vortritt.push(`Vortritt haben ${paar.map(armText).join(' und ')} (${grund}).`)
    if (vorgeschlagen) an.vortritt.push(`Die App schlägt ${armText(zArm)} als Zufahrt vor, weil nur dieser Arm nicht zur Vortrittsstrasse gehört.`)
  } else {
    // Wortlaut nach dem Auftraggeber (Korrektur 31.10.2026, Punkt 4); dazu Tempo und Richtungen der Prüfung (Punkt 6 k, m)
    an.vortritt.push(rArm ? `Rechtsvortritt: Vortritt vor der Zufahrt hat der Arm rechts davon, ${armText(rArm)}. Als rechts gilt ein ` +
      `Arm mehr als ${RECHTS_MIN_GRAD}° rechts der Fahrtrichtung.` : `Rechtsvortritt: Kein Arm liegt mehr als ${RECHTS_MIN_GRAD}° rechts ` +
      'der Fahrtrichtung, darum hat kein Verkehr Vortritt vor dieser Zufahrt.')
    if (rArm && (zArm.zufluss || zVeloGegen)) an.vortritt.push(`Beim Rechtsvortritt gilt die nötige Sicht nach Abb. 6 (S. 12). ${RV_TEMPO_TEXT.replace('Die Norm', 'Die VSS 40 273')} ` +
      'Verkehr von links und Gegenverkehr prüft sie nicht: Wer von links kommt, muss der Zufahrt den ' +
      'Vortritt lassen, und mit dem Gegenverkehr gibt es beim Geradeausfahren keinen Konflikt.')
    // Block 5: Voraussetzungen des Rechtsvortritts nach Ziffer 15 prüft die App nicht (Hinweis ohne Statuswirkung)
    hinweise.push(RV_VORAUSSETZUNG_TEXT)
    const weitere = rechteArme(zArm, info.arme).slice(1)
    if (weitere.length) hinweise.push(`Rechtsvortritt: rechts der Zufahrt liegen weitere Arme (${weitere.map(armText).join(', ')}); ` +
      'geprüft wird nur der nächste rechts, die übrigen vor Ort prüfen.')
    if (ke.haltelinie) hinweise.push('Rechtsvortritt mit Halte- oder Wartelinie: B ab ihrer Vorderkante gerechnet; an Knoten mit ' +
      'Rechtsvortritt gibt es in der Regel keine Halte- oder Wartelinie (Abb. 4).')
  }
  // Wortlaut nach dem Auftraggeber (Korrektur 31.10.2026, Punkt 2)
  if (!zArm.zufluss) hinweise.push(zVeloGegen ? 'Die Zufahrt ist eine Einbahn vom Knoten weg. Vortrittsbelastet sind nur die Velos im ' +
    `Gegenverkehr (OSM ${zVeloGegen}).` : rv ? 'Die Zufahrt ist ' +
    'nach OSM eine Einbahn vom Knoten weg: kein vortrittsbelasteter Verkehr, keine Prüfung nach Teil E.' :
    'Die Zufahrt ist nach OSM eine Einbahn vom Knoten weg: kein vortrittsbelasteter Verkehr. Gerechnet wird trotzdem.')

  // links und rechts aus Sicht des wartenden Fahrzeugs (Fahrt zum Knoten: −u der Zufahrt)
  const fahrt = neg(zArm.richtung)
  const [aL, aR] = rv && rArm && lArm ? [lArm, rArm] :
    drehung(fahrt, paar[0].richtung) >= drehung(fahrt, paar[1].richtung) ? paar : [paar[1], paar[0]]
  // Lage (lage.ts): ein Arm höchstens GEGENUEBER_GRAD neben der Geradeausrichtung liegt gegenüber (Gegenverkehr, Zufahrt auf der
  // durchgehenden Strasse); höchstens einer, der nähere. Beim Rechtsvortritt bleibt der Arm rechts (mehr als RECHTS_MIN_GRAD rechts der
  // Fahrt) «rechts»; an einer Grundstückzufahrt liegt nie ein Arm gegenüber. richtung bleibt der Schlüssel, die Lage nur Beschriftung
  const lageLR: [Lage, Lage] = ['links', 'rechts']
  if (!g) {
    const w = [aL, aR].map(a => geradeausWinkel(fahrt, a.richtung))
    const j = w[0] <= w[1] ? 0 : 1
    if (!(rv && rArm && j === 1)) lageLR[j] = lageVon(fahrt, [aL, aR][j].richtung, j === 0 ? 'links' : 'rechts')
  }
  const gegenArm = lageLR[0] === 'gegenueber' ? aL : lageLR[1] === 'gegenueber' ? aR : null
  if (!rv && gegenArm) hinweise.push(`Die Zufahrt liegt auf der durchgehenden Strasse; die Sicht zum Gegenverkehr (${armText(gegenArm)}) ` +
    'zählt nur beim Linksabbiegen (Ziffer 1: Zufahrt aus einer einmündenden Strasse).')
  // die Seite des Arms gegenüber: liegt dort kein Arm des Knotens (mehr als GEGENUEBER_GRAD neben der Geradeausrichtung)?
  const gegenSeite: Richtung | null = lageLR[0] === 'gegenueber' ? 'links' : lageLR[1] === 'gegenueber' ? 'rechts' : null
  const seiteOhneArm = gegenSeite && !info.arme.some(a => a.key !== zArm.key && geradeausWinkel(fahrt, a.richtung) > GEGENUEBER_GRAD &&
    (drehung(fahrt, a.richtung) > 0) === (gegenSeite === 'links')) ? gegenSeite : null
  // spitzer Winkel: beide Arme auf einer Seite (ein Arm gegenüber zählt nicht)
  if (!rv && ((lageLR[0] === 'links' && drehung(fahrt, aL.richtung) <= 0) || (lageLR[1] === 'rechts' && drehung(fahrt, aR.richtung) >= 0)))
    hinweise.push('Die Arme der Vortrittsstrasse liegen nicht beidseits der Zufahrt (spitzer Winkel): Seiten links/rechts prüfen.')
  // Einbiegewinkel: Zufahrt gegen die Richtung der Vortrittsstrasse (Sehne von rechts nach links)
  // Rechtsvortritt: Winkel zwischen Zufahrt und rechtem Arm (ohne rechten Arm ohne Bedeutung: 90° gesetzt)
  const einbiegewinkel = rv ? (rArm ? wdiff(zArm.richtung, rArm.richtung) : 90) : wdiff(zArm.richtung, sub(aL.richtung, aR.richtung))
  if (einbiegewinkel < SCHIEF_UNTER || einbiegewinkel > 180 - SCHIEF_UNTER)
    an.wartend.push(`Die Zufahrt mündet schräg ein (Einbiegewinkel rund ${Math.round(einbiegewinkel)}°): B wird entlang der Zufahrt ` +
      'gemessen, senkrecht zum Rand gemessen ist D darum näher als B.')
  // Block 5, Hinweis ohne Statuswirkung: Einbiegewinkel deutlich von 90° abweichend (eigene Grenze, Annahme; Anhalt VSS 40 242 Ziffer
  // 14.3.4, S. 12); nicht, wenn die Zufahrt auf der durchgehenden Strasse liegt (dort ist der Winkel ohne Bedeutung)
  if (!(durchgehend || gegenArm) && (einbiegewinkel < EINBIEGEWINKEL_GRENZE_GRAD || einbiegewinkel > 180 - EINBIEGEWINKEL_GRENZE_GRAD))
    hinweise.push(`Einbiegewinkel rund ${Math.round(einbiegewinkel)}°: deutlich von 90° abweichend, nach VSS 40 273 Ziffer 10 (S. 7) ` +
      `grundsätzlich zu vermeiden; spitze Winkel für Lastwagen besonders problematisch (Annahme der Grenze ${EINBIEGEWINKEL_GRENZE_GRAD}°/` +
      `${180 - EINBIEGEWINKEL_GRENZE_GRAD}°).`)

  // Mittellinien und Querschnitte der vortrittsberechtigten Arme
  // Befund 31.10.2026 (Knoten 132629283): ende = Stelle, ab der die Mittellinie gerade verlängert ist, mit der Querstrasse dort
  // Befund 31.10.2026 (Knoten 282773328): teilt sich die Fahrbahn eines Arms in zwei Einbahnen, folgt die Mittellinie der zuführenden
  // (Verkehr zum Knoten: Fahrlinie, Velo, Überholfall, Tempo). Rand, Radweg und Trottoir auf der Seite der Zufahrt gehören zur
  // Gegenrichtung, wenn die Zufahrt rechts von u liegt (links von u ist der rechte Rand des Verkehrs zum Knoten): dort folgt die Linie
  // der wegführenden Einbahn (seiteZ; ohne Teilung dieselbe Linie)
  const haupt = [aL, aR].map(a => {
    const { linie: ml, ende, teilungen, abschnitte } = g ? g.mittellinie(a, ARM_LAENGE_M) : armMittellinieMitEnde(netz, achsen, a, ARM_LAENGE_M)
    const qs = querschnitt(netz, fahrbahn, ml, a.wid, undefined, undefined, abschnitte)
    const zl = kreuz(a.richtung, zArm.richtung) > 0
    let seiteZ = { ml, qs, geteilt: zl && teilungen.length > 0 }
    if (!zl && teilungen.length) {
      const w = g ? g.mittellinie(a, ARM_LAENGE_M, 'weg') : armMittellinieMitEnde(netz, achsen, a, ARM_LAENGE_M, 'weg')
      seiteZ = { ml: w.linie, qs: querschnitt(netz, fahrbahn, w.linie, a.wid, undefined, undefined, w.abschnitte), geteilt: true }
    }
    return { arm: a, ml, qs, ende: ende ? armEnde(netz, ende) : null, teilungen, zl, seiteZ }
  })
  // nächstliegender Rand (Seite der Zufahrt) je Arm, zusammengesetzt durch den Knoten
  // Entscheid 31.10.2026: Rand je Stelle aus der AV (h.qs.profil), am Knoten der Wert der ersten gültigen Stelle
  const randTeile = haupt.map(h => {
    const { ml, qs } = h.seiteZ
    const versatz = (s: number) => (h.zl ? randLinksBei(qs, s) : -randRechtsBei(qs, s))
    return { linie: versetztVariabel(abschneiden(ml, RAND_LAENGE_M), versatz), abstand: Math.abs(versatz(0)) }
  })
  // Rechtsvortritt: B ab dem Rand des rechten Arms auf der Seite der Zufahrt (Abb. 4), über den Knoten hinaus verlängert
  const rvRand = rv && rArm ? mitVerlaengerung(randTeile[1].linie, RAND_LAENGE_M) : null
  const rand = rvRand ?? [...[...randTeile[0].linie].reverse(), ...randTeile[1].linie]
  const nah = rvRand ? randTeile[1].abstand : Math.max(randTeile[0].abstand, randTeile[1].abstand)
  // Veloführung je Richtung (E3b): Eingabe, sonst Vorgabe aus OSM (Tags des Arms, Radweg daneben)
  const veloStand = haupt.map((h, j): VeloStand => {
    const r: Richtung = j === 0 ? 'links' : 'rechts'
    const rw = radwegNeben(h.ml, h.qs.links, h.qs.rechts, k.radwege)
    const [vorgabe, quelle] = veloVorgabe(istWeg(h.arm.wid) ? netz.w(h.arm.wid).t : {}, h.arm.hw, h.arm.sd > 0, rw,
      !h.arm.zufluss && h.arm.veloZufluss ? h.arm.veloZuflussQuelle : null)
    const fuehrung = ke.velo[r] ?? vorgabe
    // Radweg ohne OSM-Linie (cycleway=track bzw. von Hand gewählt): RADWEG_BREITE_M direkt am Fahrbahnrand angenommen
    const radweg: RadwegLage | null = fuehrung !== 'radweg' ? null : rw ?? { id: 0, versatz: h.qs.links + RADWEG_BREITE_M / 2,
      breite: RADWEG_BREITE_M, breiteOsm: false, abstand: 0, zweiRichtungen: false, eigeneSeite: true, treffer: 0 }
    // Befund 31.10.2026 (Knoten 282773328): teilt sich die Fahrbahn in zwei Einbahnen, gelten ab der Teilung die Tags der zuführenden
    // Einbahn (dort fährt der Verkehr zum Knoten; Seite rechts in Fahrtrichtung). Die Achsen wechseln dort nur zwischen Mischverkehr und
    // Radstreifen (ab); ein anderer Unterschied (Radweg, kein Veloverkehr) bleibt ein Hinweis. Von Hand gewählt gilt durchgehend
    let ab: VeloStand['ab'] = null
    const t0 = h.teilungen[0]
    if (t0 && ke.velo[r] === null && h.arm.zufluss && netz.W.has(t0.wid)) {
      const wz = netz.w(t0.wid)
      const [v2, q2] = veloVorgabe(wz.t, wz.hw, wz.ow === -1, null)
      const linie = (f: Velofuehrung) => f === 'misch' || f === 'radstreifen'
      if (v2 !== vorgabe && linie(v2) && linie(vorgabe))
        ab = { s: t0.ab, fuehrung: v2 as 'misch' | 'radstreifen', quelle: `${q2}, zuführende Einbahn, OSM-Weg ${t0.wid}` }
      else if (v2 !== vorgabe)
        hinweise.push(`${armText(h.arm)}: Die Fahrbahn teilt sich nach ${Math.round(t0.ab)} m in zwei Einbahnen. Für die Einbahn zum Knoten ` +
          `nennt OSM «${VELOFUEHRUNG_TEXT[v2]}» (${q2}, Weg ${t0.wid}); gerechnet ist mit «${VELOFUEHRUNG_TEXT[vorgabe]}» wie am Knoten. ` +
          'Veloführung vor Ort prüfen.')
    }
    return { fuehrung, vorgabe, quelle, gewaehlt: ke.velo[r] !== null, radweg, radwegOsm: rw, ab }
  })
  // Ziffer 12: Radweg zwischen Zufahrt und Fahrbahn näher als RADWEG_NAH_M am Rand: B ab seiner Aussenkante. Es zählt die Lage des
  // Radwegs (aus OSM auch bei anderer Veloführung; ohne OSM-Linie nur der von Hand bzw. aus cycleway=track angenommene); zwischen
  // Zufahrt und Fahrbahn heisst auf der Seite der Zufahrt (versatz > 0 = links von u)
  const radwegNah = veloStand.map((v, j) => {
    const x = v.radwegOsm ?? (v.fuehrung === 'radweg' ? v.radweg : null)
    const zl = kreuz(haupt[j].arm.richtung, zArm.richtung) > 0
    return x && (x.versatz > 0) === zl && x.abstand < RADWEG_NAH_M - RADWEG_TOL_M ? x : null
  })
  const radwegAussen = Math.max(0, ...radwegNah.map(x => (x ? x.abstand + x.breite : 0)))
  const radwegMass = radwegNah.find(x => x && x.abstand + x.breite === radwegAussen) ?? null
  for (const [j, x] of radwegNah.entries())
    if (x && x.id && veloStand[j].fuehrung !== 'radweg')
      hinweise.push(`Radweg in OSM (Weg ${x.id}) ${f1(x.abstand)} m neben dem Fahrbahnrand an der Zufahrt: B ab seiner Aussenkante ` +
        `(Ziffer 12), obwohl ${lageNach({ lage: lageLR[j] })} «${VELOFUEHRUNG_TEXT[veloStand[j].fuehrung]}» gilt.`)
  let radwegRandLinie: P[] | null = null
  if (radwegAussen > 0) {
    const teile = haupt.map(h => {
      const { ml, qs } = h.seiteZ
      return versetztVariabel(abschneiden(ml, RAND_LAENGE_M), s => (h.zl ? randLinksBei(qs, s) + radwegAussen :
        -(randRechtsBei(qs, s) + radwegAussen)))
    })
    radwegRandLinie = [...[...teile[0]].reverse(), ...teile[1]]
  }

  // Achse des Zufahrtsstreifens: AV-Querschnitte der Zufahrt (fahrstreifenmitte) ausserhalb der Vortrittsstrasse, sonst OSM.
  // Entscheid 31.10.2026: die Lage je Querschnittstelle (randProfil, fahrstreifenLagen), nicht mehr als feste Verschiebung der
  // OSM-Linie; zwischen den Stellen linear, zum Knoten hin und am Ende konstant. Ohne genügend AV-Querschnitte feste Lage zLage.
  // Hindernisse (E2a): zählende Hindernisse; Parkfelder aller Klassen und Längsparkierung auch für den Parkstreifen an den Achsen
  // (Nutzer 31.10.2026, Korrektur Punkt 23: auch Velo- und Motorradfelder verschieben die Fahrlinie; ihre Sichtwirkung bleibt Hinweis)
  const zaehlend = zaehlendeHindernisse(hg)
  const park = new HindernisDaten(zaehlend).parkAlle
  let zLage: number, zQuelle: string
  // Lage je Stelle (Bogenlänge auf zMl), sonst null = feste Lage zLage; zText ergänzt die Quelle um die Lage am Nullpunkt
  let zProfil: { s: number[]; lage: number[] } | null = null
  let zText: ((lageNull: number) => string) | null = null
  let zufahrtVelo: Ergebnis['zufahrtVelo'] = null
  let zTeilungText = ''
  if (g) {
    // Grundstückzufahrt: Achse = Linie der Zufahrt (Mitte, einspurig angenommen), ohne Parkstreifen
    zLage = 0
    zQuelle = g.weg !== null ? `Achse der Zufahrt entlang des OSM-Wegs ${g.weg} (service), Mitte der Zufahrt, einspurig angenommen` :
      `Achse der Grundstückzufahrt: Linie durch den Zufahrtspunkt, ${g.gezeichnet ? 'Richtung gezeichnet' : 'senkrecht zum Rand'}, ` +
      'Mitte der Zufahrt, einspurig angenommen'
    an.wartend.push(`Die Grundstückzufahrt gilt als einspurig: das wartende Fahrzeug steht in ihrer Mitte (${g.weg !== null ?
      `entlang des OSM-Wegs ${g.weg}` : g.gezeichnet ? 'Richtung gezeichnet' : 'Richtung senkrecht zum Rand'}).`)
  } else {
  const abAlle: number[] = []
  for (let s = nah + ZUF_VON_M; s <= nah + ZUF_BIS_M + 1e-9; s += ZUF_SCHRITT_M) abAlle.push(s)
  // Teilung der Zufahrt in zwei Einbahnen (Befund 31.10.2026): Querschnitte nur bis zur Teilung (Fahrbahn mit beiden Richtungen); liegen
  // dort zu wenige, die danach auf der zuführenden Einbahn (Lage als Einbahn)
  const vorTeilung = zTeilung ? abAlle.filter(x => x <= zTeilung.ab) : abAlle
  const nachTeilung = !!zTeilung && vorTeilung.length < SEHNE_MIN_PUNKTE
  const ab = !zTeilung ? abAlle : nachTeilung ? abAlle.filter(x => x > zTeilung.ab) : vorTeilung
  if (zTeilung) zTeilungText = nachTeilung ? 'Querschnitte auf der zuführenden Einbahn (Lage als Einbahn)' : 'Querschnitte bis zur Teilung'
  const ref = punkteAufSpur(zMl, ab).map(([q, t]) => [q, links(t)] as [P, P])       // rechts des Fahrers = links von u
  const art = zArm.einbahn !== 0 || nachTeilung ? 'einbahn' : 'beide'
  const sehnenRoh = ref.map(([q, r]) => fahrbahn.sehne(q, r))
  // Sehnen an der Suchgrenze zählen nicht (wie querschnitt, randProfil); an mehr als SEHNE_OFFEN_ANTEIL der Stellen (Platz,
  // Kreuzungsfläche neben der Zufahrt): kein AV-Querschnitt, Lage aus OSM (Befund 31.10.2026, Hubelmattstrasse/Loryplatz)
  const offen = sehnenRoh.filter(sh => sh && Math.max(sh[0], sh[1]) >= SEHNE_HALB - 0.5).length
  const gemessen = sehnenRoh.filter(sh => sh).length
  const zOffen = gemessen > 0 && offen > SEHNE_OFFEN_ANTEIL * gemessen
  const sehnen = sehnenRoh.map(sh => (sh && Math.max(sh[0], sh[1]) < SEHNE_HALB - 0.5 ? sh : null))
  if (zOffen) hinweise.push(`Neben der Zufahrt liegt nach der AV eine weite Fahrbahnfläche (an ${offen} von ${gemessen} Querschnittstellen ` +
    `kein Fahrbahnrand innert ${String(SEHNE_HALB).replace(".", ",")} m, z. B. Platz oder Kreuzungsfläche): Lage der Zufahrtsachse aus OSM statt aus der AV; ` +
    'Lage von D vor Ort prüfen.')
  // Parkstreifen rechts bzw. links auf der Zufahrt: Prüfpunkte PARK_SONDE_M innerhalb der Ränder (je Sehne); als Abzug an
  // fahrstreifenmitte (wie Parkierung aus OSM-Tags, gleich an allen Messpunkten)
  const sondenR: P[] = [], sondenL: P[] = []
  ref.forEach(([q, r], i) => {
    const sh = sehnen[i]
    if (!sh) return
    sondenR.push(add(q, r, sh[0] - PARK_SONDE_M)); sondenL.push(add(q, r, -(sh[1] - PARK_SONDE_M)))
  })
  const zParkR = parkStreifen(sondenR, park), zParkL = parkStreifen(sondenL, park)
  const zAbzug: AbzugQuelle | null = zParkR.abzug || zParkL.abzug ?
    () => ({ r: { park: zParkR.abzug, velo: 0 }, l: { park: zParkL.abzug, velo: 0 } }) : null
  const fs = zOffen ? null : fahrstreifenmitte(ref, art, fahrbahn, zAbzug, 0)
  // Ränder je Stelle (Ausreisser verworfen, geglättet); zu wenige gültige Stellen: feste Lage aus dem Median wie bisher
  const rp = fs ? randProfil(ab.slice(0, ref.length), sehnen) : null
  if (fs) {
    zLage = fs.lage
    const pz = [zParkR.abzug ? parkStreifenText(zParkR) : '', fs.abzugParkL ? parkStreifenText(zParkL).replace('rechts', 'links') : '']
      .filter(x => x)
    const mitteText = art === 'einbahn' ? 'Einbahn, Mitte' : 'Mitte der rechten Hälfte'
    if (rp) {
      // Mündung (Knoten bis zur ersten stetigen Stelle): Abstand zum rechten AV-Rand konstant (lageMuendung)
      zProfil = lageMuendung({ s: rp.s, lage: fahrstreifenLagen(rp, fs, art) }, rp, x => {
        const pk = punkteAufSpur(zMl, [x])
        const sh = pk.length ? fahrbahn.sehne(pk[0][0], links(pk[0][1])) : null
        return sh && sh[0] < SEHNE_HALB - 0.5 ? sh[0] : null
      })
      const rpText = `${rp.n} Sehnen${rp.verworfen ? `, ${rp.verworfen} Ausreisser verworfen` : ''}`
      zText = l => `Achse des Zufahrtsstreifens aus den AV-Querschnitten der Zufahrt je Stelle (Fahrbahn ${f1(fs.breite)} m im Median, ` +
        `${rpText}, ${mitteText}; Lage folgt der Fahrbahn, am Nullpunkt ${seiteOsm(l)}${pz.length ? `; ${pz.join('; ')}` : ''})`
      zQuelle = zText(zLage)
    } else
      zQuelle = `Achse des Zufahrtsstreifens aus dem AV-Querschnitt der Zufahrt (Fahrbahn ${f1(fs.breite)} m, ${mitteText}, ` +
        `${fs.nSehnen} Sehnen; ohne genügend AV-Querschnitte je Stelle: feste Lage ${seiteOsm(zLage)}` +
        `${pz.length ? `; ${pz.join('; ')}` : ''})`
    // Wortlaut nach dem Auftraggeber (Korrektur 31.10.2026, Punkt 5; Seite und Zählung der Prüfpunkte stehen in der Herleitung)
    if (pz.length) an.wartend.push(`Parkierung entlang Zufahrt. Von der verfügbaren Fahrbahnbreite werden ${pz.length > 1 ? '2 × ' : ''}` +
      `${f2(PARKSTREIFEN)} m für Parkfelder abgezogen. Achse des Zufahrtsstreifens, D und FB entsprechend verschoben.`)
  } else {
    const [l0, , q] = lageOsm(netz, zArm.wid, LAGE_ERSATZ)
    zLage = l0 ?? LAGE_ERSATZ
    zQuelle = `Achse des Zufahrtsstreifens ohne genügend AV-Querschnitte: feste Lage ${q === 'Annahme' ?
      `${f2(LAGE_ERSATZ)} m rechts der OSM-Achse angenommen` : `aus OSM (${q})`}`
    an.wartend.push('Die amtliche Vermessung zeigt die Fahrbahn der Zufahrt nicht genügend: das wartende Fahrzeug steht ' +
      `${q === 'Annahme' ? `${f2(LAGE_ERSATZ)} m rechts der OSM-Linie (Annahme)` : `nach OSM (${q})`}.`)
  }
  if (zVeloGegen) {
    // Velo gegen die Einbahn (E4): Achse am für das Velo rechten Rand (aus Sicht des Autoverkehrs dem linken), wie velo.ts: Mischverkehr
    // D_VELO_M vom Rand, Gegenverkehrsstreifen in seiner Mitte, Radweg auf seiner Achse (ohne OSM-Linie direkt am Rand angenommen)
    const rwZ = fs ? radwegNeben(zMl, fs.rechts, fs.links, k.radwege) : null
    const [f0, fQuelle] = veloVorgabe(netz.w(zArm.wid).t, zArm.hw, zArm.sd > 0, rwZ?.eigeneSeite ? rwZ : null, zVeloGegen)
    const fuehrung: Exclude<Velofuehrung, 'kein'> = f0 === 'kein' ? 'misch' : f0
    let lageText: string
    if (fs) {
      // Abstand der Veloachse vom für das Velo rechten Rand (aus Sicht des Autoverkehrs dem linken); Radweg aus OSM: feste Lage
      const vomRandV = fuehrung === 'misch' ? fs.abzugParkR + D_VELO_M : fuehrung === 'radstreifen' ? fs.abzugParkR + RADSTREIFEN_M / 2 :
        -RADWEG_BREITE_M / 2
      const rwFest = fuehrung === 'radweg' && !!rwZ?.eigeneSeite
      zLage = rwFest ? rwZ!.versatz : fs.rechts - vomRandV
      zProfil = rp && !rwFest ? { s: rp.s, lage: rp.rechts.map(x => x - vomRandV) } : null
      lageText = fuehrung === 'misch' ? `${f2(D_VELO_M)} m vom für das Velo rechten Fahrbahnrand${fs.abzugParkR ? ' neben dem Parkstreifen' : ''} ` +
        '(Mischverkehr)' : fuehrung === 'radstreifen' ? `Mitte des Gegenverkehrsstreifens, ${f2(fs.abzugParkR + RADSTREIFEN_M / 2)} m vom ` +
        'für das Velo rechten Fahrbahnrand' : rwZ?.eigeneSeite ? `Achse des Radwegs (OSM-Weg ${rwZ.id})` :
        `Achse des Radwegs ohne OSM-Linie, ${f2(RADWEG_BREITE_M)} m breit direkt am Fahrbahnrand angenommen`
      const vgText = lageText
      zText = l => `Achse des Velogegenverkehrs auf der Zufahrt: ${vgText}, aus Sicht des Autoverkehrs am linken Fahrbahnrand (` +
        (zProfil ? `AV-Querschnitte der Zufahrt je Stelle, Fahrbahn ${f1(fs.breite)} m im Median, ${rp!.n} Sehnen; Lage folgt der Fahrbahn, ` +
        `am Nullpunkt ${seiteOsm(l)})` : `AV-Querschnitt der Zufahrt, Fahrbahn ${f1(fs.breite)} m, ${fs.nSehnen} Sehnen)`)
      zQuelle = zText(zLage)
    } else {
      lageText = 'ohne AV-Querschnitt: auf der Achse des Zufahrtsstreifens angenommen'
      zQuelle += '; Velogegenverkehr ohne AV-Querschnitt auf dieser Achse angenommen'
    }
    zufahrtVelo = { quelle: zVeloGegen, fuehrung, fuehrungQuelle: fQuelle, lageText }
    // Korrektur 31.10.2026 (Punkt 6 d, 7): Velo gegen die Einbahn in den Annahmen nur hier, in einem Satz
    const lageSatz = !fs ? 'auf der Achse der Zufahrt (ohne Querschnitt der amtlichen Vermessung)' : fuehrung === 'misch' ?
      `${f2(D_VELO_M)} m vom für das Velo rechten Fahrbahnrand${fs.abzugParkR ? ' neben der Parkierung' : ''}` : fuehrung === 'radstreifen' ?
      `in der Mitte des Gegenverkehrsstreifens (${f2(RADSTREIFEN_M)} m breit angenommen)` : 'auf der Achse des Radwegs'
    an.wartend.push(`Auf dieser Zufahrt dürfen Velos gegen die Einbahn zum Knoten fahren (OSM ${zVeloGegen}). Die App prüft darum die ` +
      `Sicht aus der Lage eines solchen Velos: ${lageSatz}, das Auge des Velofahrers über dieser Linie.`)
    herleitung.push(`Velogegenverkehr auf der Zufahrt: ${VELOFUEHRUNG_TEXT[fuehrung]} (${fQuelle}), ${lageText}.`)
  }
  }
  const zProf = zProfil
  const zAchse = mitVerlaengerung(zProf ? versetztVariabel(zMl, s => profilBei(zProf.s, zProf.lage, s)) : versetzt(zMl, zLage))
  /** seitliche Lage der Zufahrtsachse zur OSM-Linie bei der Bogenlänge s auf zMl */
  const zLageBei = (s: number) => (zProf ? profilBei(zProf.s, zProf.lage, s) : zLage)

  // B und D
  const ao = istAusserorts(netz, [aL.wid, aR.wid])
  const stop = regelung === 'stop'
  const B = rv ? RV_B_M : beobachtungsdistanz(ao.ausserorts, stop)
  // ohne Schnitt mit dem Rand: Rand im Abstand nah vom Knoten (Verlängerung plus halbe Fahrbahn auf der Zufahrtsachse)
  // D am Fahrersitz links der Achse; ein Velo (E4, Velo gegen die Einbahn) auf der Achse
  const dSeitlich = zufahrtVelo ? 0 : FAHRERSITZ_M
  const beob = beobachtungspunkt(zAchse, rand, B, kp, VERLAENGERUNG_M + nah, dSeitlich)
  if (!beob.randGefunden) hinweise.push('Die Zufahrtsachse schneidet den Rand der Vortrittsstrasse nicht: Rand im Abstand der halben Fahrbahn angenommen.')
  // Trottoir zwischen Zufahrt und Vortrittsstrasse (AV): F_B wartet vor dem Trottoir, ausser es ist frei von Hindernissen
  const tr = trottoirAnZufahrt(zAchse, beob.sRand, p => k.trottoir.art(p) !== null)
  const trAt = 'sHinter' in tr ? tr : null
  const trottoir: TrottoirErgebnis | null = trAt ? { breite: trAt.breite, frei: ke.trottoirFrei,
    hinterkante: beobachtungAb(zAchse, trAt.sHinter, 0).nullpunkt } : null
  // AV-Trottoir neben den Armen (velo.trottoirNeben): für die Trottoirachse (E3b) bzw. die Trottoirüberfahrt (K0)
  // Teilung der Fahrbahn (seiteZ.geteilt): Linie der Seite der Zufahrt, Trottoir ab dem Rand je Stelle gesucht
  const lagenT = (trAt || tue) && !nurRv ? haupt.map(h => {
    const { zl } = h, { ml, qs, geteilt } = h.seiteZ
    // Fahrbahnrand je Stelle (Entscheid 31.10.2026), für die Linien ab dem Fahrbahnrand (hinterer Rand, Gehlinie)
    const randBei = (s: number) => (zl ? randLinksBei(qs, s) : randRechtsBei(qs, s))
    return { h, ml, geteilt, seite: (zl ? 1 : -1) as 1 | -1, rand: zl ? qs.links : qs.rechts, randBei,
      t: trottoirNeben(ml, zl ? 1 : -1, zl ? qs.links : qs.rechts, p => k.trottoir.art(p) !== null, geteilt ? randBei : null) }
  }) : null
  // Trottoirüberfahrt (K0): Band zwischen Bordkante und hinterem Rand; F_B wartet für die Phase Fahrbahn an der Bordkante
  const tueEingabe = ke.trottoirueberfahrt?.breite ?? null
  const tueB0: TueBand | null = tue ? tueBand(beob.sRand, lagenT!.map(l => ({ ml: l.ml, seite: l.seite, rand: l.rand, t: l.t })) as
    [Parameters<typeof tueBand>[1][0], Parameters<typeof tueBand>[1][1]], trAt,
    tueEingabe !== null && tueEingabe >= TUE_BREITE_MIN && tueEingabe <= TUE_BREITE_MAX ? tueEingabe : null, einbiegewinkel) : null
  // Hinterer Rand auf der Zufahrtsachse dort, wo ihn der hintere Rand der Arme (Fahrbahnrand des Arms plus Abstand, je Seite für sich,
  // ohne zusammengesetzte Linie) schneidet, der weitere der beiden; so liegt D' an jedem Arm mindestens 3,00 m hinter dem Rand und die
  // Gehlinie (ab dem Fahrbahnrand des Arms, folgt der Strasse) nie auf der Fahrbahn (Korrektur nach Review, Strasse in einer Kurve).
  // Gerade Arme: Länge = Abstand / sin α wie in tueBand. Schnitte ausserhalb der halben bis doppelten Länge zählen nicht (Arm fast
  // parallel zur Zufahrt, z. B. gegenüber); ohne Schnitt bleibt Abstand / sin α
  let tueB = tueB0
  if (tueB0) {
    const sx = lagenT!.flatMap(l => {
      const x = schnittBei(zAchse, mitVerlaengerung(versetztVariabel(l.ml, s => l.seite * (l.randBei(s) + tueB0.abstand))), kp)
      return x && x.sa > beob.sRand + 0.5 * tueB0.laenge && x.sa < beob.sRand + 2 * tueB0.laenge ? [x.sa] : []
    })
    if (sx.length && tueB0.quelle !== 'av_quer') {
      const sHinter = Math.max(...sx), laenge = sHinter - beob.sRand
      tueB = { ...tueB0, sHinter, laenge }
      if (Math.abs(laenge - tueB0.laenge) > TUE_GEH_TOL_M) hinweise.push(`Trottoirüberfahrt: Strasse in einer Kurve, hinterer Rand auf der ` +
        `Zufahrtsachse nach dem Rand der Arme (${f2(laenge)} m statt ${f2(tueB0.laenge)} m hinter der Bordkante).`)
    }
    hinweise.push(...tueB0.hinweise)
  }
  const sKante = trAt && !ke.trottoirFrei && !tue ? trAt.sHinter : beob.sRand
  let xRadweg = radwegRandLinie ? schnittBei(zAchse, radwegRandLinie, kp) : null
  if (radwegRandLinie && !xRadweg) hinweise.push('Die Zufahrtsachse schneidet die Aussenkante des Radwegs nicht: B ab der Kante bzw. Trottoirhinterkante.')
  // Radweg aus OSM: nur, wenn seine Linie an der Zufahrt liegt (endet er vorher, keine Verlängerung)
  const rwLinie = radwegMass?.id ? k.radwege.find(w => w.id === radwegMass.id)?.linie ?? null : null
  if (xRadweg && rwLinie && Math.min(...rwLinie.slice(0, -1).map((q, i) => abstandStrecke(xRadweg!.p, q, rwLinie[i + 1]))) >
    radwegMass!.breite / 2 + RADWEG_AN_ZUFAHRT_M) {
    hinweise.push(`Der Radweg (OSM-Weg ${radwegMass!.id}) reicht nicht bis an die Zufahrt: B ab der Kante bzw. Trottoirhinterkante.`)
    xRadweg = null
  }
  const abRadweg = !!xRadweg && xRadweg.sa > sKante + 0.005
  const sNormal = abRadweg ? xRadweg!.sa : sKante
  // Halte- oder Wartelinie (E2b; Feld «haltelinie»: Stop Haltelinie SSV 6.10, Kein Vortritt Wartelinie SSV 6.13): Lot auf die
  // Zufahrtsachse; B ab ihrer Vorderkante, dem vorderen Rand (VSS 40 273 Ziffer 5)
  let haltelinie: HaltelinieErgebnis | null = null
  if (ke.haltelinie) {
    const l = lageAnAchse(zAchse, ke.haltelinie)
    const abstand = l.s - beob.sRand
    if (Math.abs(l.seitlich) > HALTELINIE_SEITLICH_M)
      hinweise.push(`Halte- oder Wartelinie ${f1(Math.abs(l.seitlich))} m neben der Zufahrtsachse: nicht gerechnet (höchstens ${HALTELINIE_SEITLICH_M} m).`)
    else if (abstand < -HALTELINIE_VOR_M || abstand > HALTELINIE_HINTER_M)
      hinweise.push(`Halte- oder Wartelinie ${f1(Math.abs(abstand))} m ${abstand < 0 ? 'vor' : 'hinter'} der Kante: nicht gerechnet (zulässig ` +
        `${HALTELINIE_VOR_M} m davor bis ${HALTELINIE_HINTER_M} m dahinter).`)
    else {
      const vorverlegt = l.s < sNormal - 0.05
      haltelinie = { p: l.fuss, quer: querlinie(l.fuss, l.t, HALTELINIE_HALB_M), abstand, vorverlegt }
      if (vorverlegt)
        hinweise.push(`Halte- oder Wartelinie ${f2(sNormal - l.s)} m vor ${abRadweg ? 'der Aussenkante des Radwegs' : trAt && !ke.trottoirFrei && !tue ?
          'der Trottoirhinterkante' : 'der Kante des Fahrstreifens mit Vortritt'} (vorverlegt): Ausnahme nach VSS 40 273 Ziffer 14, nur an bestehenden ` +
          'Knoten und Zufahrten und mit begleitenden Markierungen.')
    }
  }
  const sNull = haltelinie ? beob.sRand + haltelinie.abstand : sNormal
  const nullpunktText = haltelinie ? 'Vorderkante der Halte- oder Wartelinie' : abRadweg ? 'Aussenkante des Radwegs' :
    tue ? 'Bordkante (vorderer Rand der Trottoirüberfahrt)' : trAt && !ke.trottoirFrei ? 'Trottoirhinterkante' :
    trAt ? 'Bordkante (Trottoir ohne Hindernisse)' : 'Kante des Fahrstreifens mit Vortritt'
  const vorgabe = beobachtungAb(zAchse, sNull, B, dSeitlich)
  const ausserText = rv ? 'Rechtsvortritt, Abb. 4' : ao.ausserorts ? (stop ? 'ausserorts, Stop' : 'ausserorts') : 'innerorts'
  // D von Hand (E2b): frei gesetzt; F_B folgt (Fahrzeugachse um den Fahrersitz nach rechts)
  let D = vorgabe.D, Dachse = vorgabe.Dachse, fbRichtung = neg(vorgabe.t)
  let Dlage = { laengs: B, seitlich: dSeitlich }
  if (ke.D) {
    const l = lageAnAchse(zAchse, ke.D)
    D = ke.D; Dachse = add(ke.D, links(l.t), dSeitlich); fbRichtung = neg(l.t)
    Dlage = { laengs: l.s - sNull, seitlich: l.seitlich }
    if (Dlage.laengs < B_INNERORTS_M - 0.005)
      hinweise.push(`D von Hand ${f2(Dlage.laengs)} m hinter der ${nullpunktText}: weniger als ${f2(B_INNERORTS_M)} m (Ziffer 12; Ausnahmen ` +
        'nur an bestehenden Knoten und Zufahrten, Ziffer 14).')
    else if (Dlage.laengs < B - 0.005)
      hinweise.push(`D von Hand ${f2(Dlage.laengs)} m hinter der ${nullpunktText}: weniger als B = ${f2(B)} m (${ausserText}, Ziffer 12).`)
    if (dist(ke.D, vorgabe.nullpunkt) > D_HAND_WEIT_M)
      hinweise.push(`D von Hand liegt ${Math.round(dist(ke.D, vorgabe.nullpunkt))} m vom Nullpunkt entfernt: Lage prüfen.`)
  } else {
    // Korrektur 31.10.2026 (Punkt 6 e): B nur einmal; D beim Velo im Satz zum Velogegenverkehr
    const wer = zufahrtVelo ? 'Velo' : 'Fahrzeug'
    const ab = rv && rArm && nullpunktText === 'Kante des Fahrstreifens mit Vortritt' ? `hinter dem Rand des Arms rechts, ${armName(rArm)},` :
      `hinter der ${nullpunktText}`
    an.wartend.push((rv ? `Das wartende ${wer} steht ${f2(B)} m ${ab} (Rechtsvortritt, VSS 40 273 Ziffer 16, S. 10; Abb. 4).` :
      `Das wartende ${wer} steht ${f2(B)} m ${ab} (Beobachtungsdistanz B ${ausserText}, Ortslage nach ${ao.grund}; VSS 40 273 ` +
      'Ziffer 12, S. 7–8).') + (zufahrtVelo ? '' : ` Das Auge des Lenkers (D) liegt ${f2(FAHRERSITZ_M)} m links der Fahrlinie (Fahrersitz).`))
  }
  if (trAt && !ke.trottoirFrei && !haltelinie && !ke.D && !tue)
    an.wartend.push(`Zwischen Zufahrt und Vortrittsstrasse liegt ein Trottoir (amtliche Vermessung, ${f1(trAt.breite)} m): das Fahrzeug ` +
      'wartet davor, B zählt ab der Trottoirhinterkante. Steht auf dem Trottoir nichts im Weg, im Panel «Trottoir ohne Hindernisse» ' +
      'setzen (VSS 40 273 Ziffer 13.1, S. 8).')
  if (abRadweg && !haltelinie && !ke.D) {
    const rw = radwegMass!
    an.wartend.push(`Ein Radweg liegt ${f1(rw.abstand)} m neben dem Fahrbahnrand, näher als ${f2(RADWEG_NAH_M)} m: das Fahrzeug wartet ` +
      `vor dem Radweg, B zählt ab seiner Aussenkante (Radweg ${f2(rw.breite)} m breit${rw.breiteOsm ? ' nach OSM' : ', angenommen'}; ` +
      'VSS 40 273 Ziffer 12, S. 8; Abb. 2, S. 6).')
  }
  const trottoirGrund = trAt ? '' : (tr as { grund: string }).grund
  if (rv && trAt) hinweise.push('Rechtsvortritt mit Trottoir quer über die Zufahrt (Trottoirüberfahrt): wer über ein Trottoir einfährt, ist ' +
    'vortrittsbelastet (VRV Art. 15 Abs. 3); Vortrittsregelung prüfen.')
  if (ke.trottoirFrei && !trAt && !tue) hinweise.push(`Häkchen «Trottoir ohne Hindernisse» ohne Wirkung: ${trottoirGrund}.`)
  if (ke.Dtrottoir && !tue && !nurRv) hinweise.push("D' von Hand ohne Wirkung: gilt nur mit dem Häkchen «Trottoirüberfahrt».")
  if (k.gebaeude.some(x => imPolygon(D, x.poly))) hinweise.push('D liegt in einem Gebäude der AV: Daten bzw. Lage der Zufahrt prüfen.')
  const qsAnnahmen = haupt.filter(h => h.qs.annahme).map(h => `${armText(h.arm)}: ${h.qs.quelle}`)
  an.verkehr.push(...qsAnnahmen.map(x => `Fahrbahnbreite ${x}.`))
  // Strassentyp und ungünstige Verhältnisse (E1)
  const ns: Record<Richtung, NeigungStand> = { links: neigungBestimmen(eg.neigung.links, hoehen?.links, !!hoehen),
    rechts: neigungBestimmen(eg.neigung.rechts, hoehen?.rechts, !!hoehen) }
  const strasse = strasseBestimmen(netz, [aL, aR], eg, { links: ns.links.i, rechts: ns.rechts.i })
  if (!strasse.typGewaehlt && !rv) {
    an.verkehr.push(`Die Vortrittsstrasse gilt als ${STRASSENTYP_TEXT[strasse.typ]} (nach ${strasse.typQuelle}; im Panel änderbar): ` +
      `massgebend ist ${strasse.typ === 'es' ? 'der untere Wert der Tab. 1 (VSS 40 273, S. 8)' :
      `der Zwischenwert der Tab. 1 (VSS 40 273, S. 8; ${ZWISCHENWERT_TEXT})`}.`)
    herleitung.push(`Strassentyp aus ${strasse.typQuelle}: trunk, primary, secondary, tertiary und deren links gelten als Hauptverkehrsstrasse ` +
      '(tertiary damit auf der sicheren Seite), sonst Erschliessungsstrasse (Annahme der App).')
  }
  // ungünstige Verhältnisse als Vorgabe: ein Satz mit allen Gründen
  const ungGruende = [
    ...(eg.fahrstreifen === null && strasse.ungunst.fahrstreifen && !rv ? [`mehr als ein Fahrstreifen je Richtung (${strasse.fahrstreifenQuelle})`] : []),
    ...(eg.neigungGross === null && strasse.ungunst.neigung && !rv ? [`Gefälle über ${NEIGUNG_GROSS_PROZENT} % in einer Richtung`] : []),
    ...(!eg.schwerverkehr && strasse.ungunstVorgabe.schwerverkehr && !rv ? [`Schwerverkehrsanteil ${f1(strasse.schwerverkehrAnteil!)} %, ` +
      `über ${SCHWERVERKEHR_PROZENT} %`] : []),
  ]
  if (ungGruende.length) an.verkehr.push(`Ungünstige Verhältnisse angenommen: ${ungGruende.join('; ')}. Die Masse stammen vom Kanton ` +
    'Solothurn (AVT 12/2024, S. 3; Annahme, VSS 40 273 Ziffer 13.1 nennt keine).')
  const ung = strasse.ungunst.fahrstreifen || strasse.ungunst.neigung || strasse.ungunst.schwerverkehr
  if (strasse.typ === 'es' && ung && !rv)
    hinweise.push('Ungünstige Verhältnisse an einer Erschliessungs-, Sammel- oder Verbindungsstrasse: der untere Wert bleibt massgebend; ' +
      'gilt die Strasse als Hauptverkehrsstrasse, hebt die Wahl im Panel auf den oberen Wert.')
  // 0 % (Höhenmodell lädt noch, oder von Hand 0) bzw. unbekannt (Höhenmodell geladen, keine Messung: strengster Wert) als
  // Annahme; gemessene Werte mit Quelle. Richtungen ohne Profil (nicht geprüft bzw. kein Verkehr; Profile geladen, aber für sie
  // keines geholt) erscheinen hier nicht
  const ohneProfil = (r: Richtung) => !ns[r].hand && !!hoehen && hoehen[r] === undefined
  const eben = (['links', 'rechts'] as Richtung[]).filter(r => ns[r].i === 0 && !ns[r].unbekannt && !(ns[r].gemessen && !ns[r].hand) &&
    !ohneProfil(r))
  const lageR = (r: Richtung) => ({ lage: lageLR[r === 'links' ? 0 : 1] })
  if (eben.length) an.verkehr.push(`Längsneigung ${eben.map(r => lageKurz(lageR(r))).join(' und ')} 0 % (eben; ${eben.some(r => !ns[r].hand) ?
    'vorerst, das Höhenmodell lädt noch; ' : ''}im Panel je Richtung einzugeben).`)
  // unbekannte Neigung: Annahme an dieser Stelle, sobald die Richtungen gerechnet sind (nur Richtungen mit Verkehr)
  const annahmeNeigung = an.verkehr.length
  const gemessen = (['links', 'rechts'] as Richtung[]).filter(r => ns[r].gemessen && !ns[r].hand)
  if (gemessen.length) an.verkehr.push(`Längsneigung ${gemessen.map(r => `${lageKurz(lageR(r))} ${fi(ns[r].i)} %`).join(', ')} aus dem ` +
    `Höhenmodell swissALTI3D: gemessen über die nötige Sicht ab K (mindestens ${PROFIL_MIN_M} m), in Fahrtrichtung, abwärts negativ. ` +
    'Einzelne Kuppen oder Senken prüft die App nicht; die Neigung kann im Panel geändert werden.')
  // Hindernisse (E2a): in D liegende nicht rechnen (z. B. Parkierung entlang der Zufahrt an der Stelle des wartenden Fahrzeugs)
  const hvAlle = hindernisVerdeckend(zaehlend)
  const inD = hvAlle.filter(v => imPolygon(D, v.poly)).map(v => v.id)
  const hv = hvAlle.filter(v => !inD.includes(v.id))
  for (const id of inD) hinweise.push(`D liegt im Hindernis «${hvAlle.find(v => v.id === id)!.name}»: für die Sicht nicht gerechnet.`)
  const hat = (f: (h: Hindernis) => boolean) => zaehlend.some(f)
  an.hindernisse.push(`Als Sichthindernisse zählen die Gebäude der amtlichen Vermessung${hv.length ? ` und ${hv.length} weitere Hindernisse ` +
    '(von Hand gesetzt, bestätigte Vorschläge, amtliche Parkfelder)' : ' (weitere Hindernisse sind keine eingegeben bzw. geladen)'}. Die App ` +
    'rechnet im Grundriss und prüft nicht, ob ein Hindernis in die Höhe des Sichtfelds reicht (0,60 bis 3,00 m, VSS 40 273 Ziffer 10, S. 7)' +
    (hat(h => h.art === 'hecke' || h.art === 'mauer' || h.art === 'zaun' || h.art === 'uebrige') ? '; ob eine Hecke, Mauer, ein Zaun oder ' +
      'ein übriges Hindernis die Sicht verdeckt, legst du beim Hindernis fest («sichtbehindernd» bzw. «dicht»).' : '.'))
  if (hat(h => h.art === 'parkfeld' || h.art === 'laengsparkierung'))
    an.hindernisse.push('Parkfelder gelten als besetzt: Ein parkiertes Auto verdeckt die Sicht. Velo- und Motorradparkfelder verdecken die ' +
      'Sicht nicht und werden nur erwähnt; die Fahrzeuge mit Vortritt fahren aber neben ihnen wie neben Autoparkfeldern.')
  if (hat(h => h.art === 'baum'))
    an.hindernisse.push(`Bäume zählen mit dem Stamm (${f1(BAUM_STAMM_M)} m), die Krone liegt über dem Sichtfeld. Mehrere Bäume verdecken ` +
      `erst, wenn sie zusammen mindestens ${f1(PALISADE_MIN_M)} m der Strecke am Stück verdecken (Palisade).`)

  const richtungen = ([['links', aL, haupt[0], veloStand[0], lageLR[0]], ['rechts', aR, haupt[1], veloStand[1], lageLR[1]]] as
    [Richtung, ArmInfo, typeof haupt[0], VeloStand, Lage][])
    .map(([r, a, h, v, lg]) => richtungRechnen(k, r, lg, a, h.ml, h.ende, h.qs, zAchse, D, kp, strasse, ns[r], avRadius, hv, park, ke.tempo[r],
      amtlich, !rv ? null : !zArm.zufluss && !zVeloGegen ? { grund: 'Rechtsvortritt: die Zufahrt ist eine Einbahn vom Knoten weg, kein vortrittsbelasteter ' +
        'Verkehr; keine Prüfung' } : r === 'rechts' && rArm ? { wahr } :
        // Gegenverkehr wartet beim Geradeausfahren nicht (nur wer links abbiegt, lässt ihn durch); von links wartet der Verkehr
        { grund: !rArm ? 'Rechtsvortritt: kein Arm rechts der Zufahrt, kein Verkehr hat Vortritt vor dieser Zufahrt; keine Prüfung' :
          lg === 'gegenueber' ? `Gegenverkehr aus ${armText(a)}: kein Vortrittsverhältnis beim Geradeausfahren (Linksabbiegen nicht geprüft)` :
          `Verkehr von links (${armText(a)}) muss dieser Zufahrt den Vortritt lassen: nicht geprüft` },
      avZentrum, v, ke.ebikeVerboten))
  // Neigung unbekannt (Entscheid 31.10.2026): je Richtung mit Verkehr ohne Neigung von Hand und ohne Messung
  const unbekannt = richtungen.filter(r => r.neigungUnbekannt)
  if (unbekannt.length) an.verkehr.splice(annahmeNeigung, 0, `Längsneigung ${unbekannt.map(r => lageKurz(r)).join(' und ')} unbekannt ` +
    `(kein Höhenprofil): strengster Wert der Tab. 3 (Spalte ≤ −4 %)${rv ? '' : ` bzw. Anhaltesichtweite (VSS 40 090b Abb. 2) bei ` +
    `${fi(ANHALTESICHT_I_MIN)} %`} angenommen; Neigung von Hand eingeben, um das zu verfeinern (Entscheid 31.10.2026).`)
  if (unbekannt.some(r => r.status !== 'keine_zufahrt') && !rv && eg.neigungGross === null && strasse.typ === 'hvs' && !strasse.ungunst.neigung)
    hinweise.push('Längsneigung unbekannt: die Vorgabe «grosse Längsneigung» (ungünstige Verhältnisse) bleibt aus, weil kein Mass bekannt ' +
      'ist; trifft sie zu, im Panel setzen (oberer Wert der Tab. 1).')
  // Block 5, Hinweis ohne Statuswirkung: VSS 40 090b Ziffer 6 erlaubt auf siedlungsorientierten Strassen eine Reduktion (nicht gerechnet)
  if (!rv && richtungen.some(r => r.status !== 'keine_zufahrt' && r.anhalteAngewendet && (r.tempo <= 30 || strasse.typ === 'es')))
    hinweise.push('Auf siedlungsorientierten Strassen mit Verkehrsberuhigung darf die Anhaltesichtweite nach VSS 40 090b Ziffer 6 (S. 4) ' +
      'reduziert werden; die App reduziert nicht (konservativ).')
  // Anhaltesichtweite (VSS 40 090b Abb. 2): nur nennen, wo sie in einer geprüften Richtung angewendet ist
  if (!rv && richtungen.some(r => r.status !== 'keine_zufahrt' && r.anhalteAngewendet)) {
    an.verkehr.push(`Bei Gefälle oder Steigung über ${NEIGUNG_EBEN_PROZENT} % zählt zusätzlich die Anhaltesichtweite nach VSS 40 090b ` +
      '(Abb. 2, S. 5; aus dem Diagramm abgelesen, Entscheide 15.10. und 31.10.2026).')
    herleitung.push(`Anhaltesichtweite nach VSS 40 090b Abb. 2 (übrige Strassen; aus dem Diagramm abgelesen, Ablesung 30./31.10.2026, ±2 m; ` +
      'VP = Tempo der Tab. 1), Kurven bei 0 % auf den unteren Wert der Tab. 1 verschoben (Entscheid 15.10.2026); Untergrenze erst über ' +
      `±${NEIGUNG_EBEN_PROZENT} % (VSS 40 273 Ziffer 13.1); gestrichelte Kurvenenden gelten als nicht gezeichnet (Entscheid 31.10.2026).`)
  }
  // Fahrlinie der Fahrzeuge mit Vortritt (Punkt 6 i): an den Anfang des Themas; Prüfpunktregel der Parkierung in der Regelübersicht
  const autoR = richtungen.filter(r => r.status !== 'keine_zufahrt')
  if (autoR.length) an.verkehr.unshift(`Fahrzeuge mit Vortritt fahren mit der Wagenmitte ${f2(D_MFZ_M)} m vom rechten Fahrbahnrand ` +
    `(VSS 40 273 Ziffer 10, S. 7), wo parkiert wird ${f2(D_MFZ_M)} m neben den parkierten Autos` +
    `${autoR.some(r => r.veloFuehrung === 'radstreifen') ? `, neben einem Radstreifen ${f2(D_MFZ_M)} m neben dem Radstreifen` : ''}. ` +
    `Parkierung: ${autoR.map(r => `${vonSatz(r)} ${r.parkStreifen.abzug ? 'ja' : 'nein'}`).join(', ')}.`)
  // Befund 31.10.2026 (Knoten 282773328): Teilung der Fahrbahn in zwei Einbahnen, die Fahrlinie folgt der zuführenden (Annahme gleich
  // nach dem Satz zur Fahrlinie, Herleitung nach der Lage der Fahrlinie)
  let nachFahrlinie = autoR.length ? 1 : 0
  richtungen.forEach((r, j) => {
    if (r.status === 'keine_zufahrt' && !r.velo) return
    herleitung.push(`Fahrlinie ${lageNach(r)}: ${r.lageQuelle}.`)
    const t = haupt[j].teilungen[0]
    if (!t) return
    an.verkehr.splice(nachFahrlinie++, 0, `Die Fahrbahn ${lageKurz(r)} (${armName(haupt[j].arm)}) teilt sich nach ${Math.round(t.ab)} m in ` +
      'zwei Einbahnen. Ab dort folgt die Fahrlinie der Einbahn, auf der die Fahrzeuge zum Knoten fahren.')
    herleitung.push(`Fahrlinie ${lageNach(r)} ab ${Math.round(t.ab)} m (Teilung am OSM-Knoten ${t.knoten}): auf der zuführenden Einbahn ` +
      `(OSM-Weg ${t.wid}); Rand, Breite und Parkierung von dieser Fahrbahn, Randprofil je Abschnitt.`)
  })
  if (zTeilung) {
    an.wartend.push(`Die Fahrbahn der Zufahrt teilt sich nach ${Math.round(zTeilung.ab)} m in zwei Einbahnen. Gerechnet ist ` +
      'auf der Einbahn, auf der die Fahrzeuge zum Knoten fahren.')
    herleitung.push(`Zufahrt: ab ${Math.round(zTeilung.ab)} m (Teilung am OSM-Knoten ${zTeilung.knoten}) auf der zuführenden Einbahn ` +
      `(OSM-Weg ${zTeilung.wid})${zTeilungText ? `; ${zTeilungText}` : ''}.`)
  }
  if (autoR.length) herleitung.push(`Parkierung an der Fahrlinie: Abzug ${f2(PARKSTREIFEN)} m, wenn Prüfpunkte ${f2(PARK_SONDE_M)} m ` +
    `innerhalb des Rands, je 2 m bis zum Ende der Zielpunkte, auf Parkfeldern liegen (mindestens ${PARK_MIN_TREFFER} Treffer an 2 ` +
    `Feldern bzw. ${PARK_EIN_FELD_TREFFER} an einem Feld, Abstand höchstens ${f1(PARK_SONDE_RADIUS_M)} m).`)
  // Rechtsvortritt (E3c): Ergebnis des gewählten Arms gegen den rechten, bei schmaler Zufahrt das Sichtfeld (Abb. 5; Konstruktion nach
  // bfu BM.021 Kap. 3.2.2, Abb. 4, Block 5: Sichtlinien von D zu den Punkten des Pfads über X auf den rechten Arm)
  const flaechenRv = [...k.gebaeude, ...hv]
  let rvAchsen: [P[], P[]] | null = null
  let rechtsvortritt: RechtsvortrittErgebnis | null = null
  if (rv) {
    const rr = richtungen.find(r => r.richtung === 'rechts')!
    const breite = (q: Querschnitt) => (q.annahme ? null : q.links + q.rechts)
    const qsZ = g ? null : querschnitt(netz, fahrbahn, zMl, zArm.wid, undefined, undefined, zLinie?.abschnitte ?? [])
    const bZ = qsZ ? breite(qsZ) : null, bR = rArm ? breite(haupt[1].qs) : null
    const schmal = !!rArm && [bZ, bR].some(b => b !== null && b <= SCHMAL_M + 1e-6)
    let sichtfeld: RvArm['sichtfeld'] = null
    if (schmal && rr.status !== 'keine_zufahrt' && (zArm.zufluss || zufahrtVelo)) {
      // Fahrbahnachse (Mitte der AV-Fahrbahn) eines schmalen Arms; auf einem breiten Arm (nur einer schmal) fährt das Fahrzeug auf
      // seinem Fahrstreifen: Achse des Zufahrtsstreifens bzw. Fahrstreifenachse des rechten Arms. Beide ab ihrem Schnittpunkt
      const eng = (b: number | null) => b !== null && b <= SCHMAL_M + 1e-6
      // Fahrbahnmitte je Stelle (Entscheid 31.10.2026; ohne genügend AV-Querschnitte je Stelle aus dem Median)
      const mitte = (ml: P[], q: Querschnitt) => mitVerlaengerung(versetztVariabel(ml, s => (randLinksBei(q, s) - randRechtsBei(q, s)) / 2))
      // Velo gegen die Einbahn auf der Zufahrt (E4): der Pfad liegt auf der Achse der Velos, nicht auf der Fahrbahnachse
      const a1 = eng(bZ) && !zufahrtVelo ? mitte(zMl, qsZ!) : zAchse, a2 = eng(bR) ? mitte(haupt[1].ml, haupt[1].qs) : mitVerlaengerung(rr.achse)
      if (zufahrtVelo) hinweise.push('Abb. 5: auf der Zufahrt fahren nur Velos gegen die Einbahn; der Pfad auf der Zufahrt liegt auf ihrer Achse.')
      else if (!eng(bZ) || !eng(bR)) hinweise.push(`Abb. 5: nur ${eng(bZ) ? 'die Zufahrt' : 'der rechte Arm'} ist höchstens ${f2(SCHMAL_M)} m breit; ` +
        `auf dem breiteren Arm liegt der Pfad auf ${eng(bZ) ? 'der Fahrstreifenachse des rechten Arms' : 'der Achse des Zufahrtsstreifens'}.`)
      const x = schnittBei(a1, a2, kp)
      rvAchsen = [abBogen(a1, x ? x.sa : lot(a1, kp).s), abBogen(a2, x ? x.sb : lot(a2, kp).s)]
      if (!x) hinweise.push('Abb. 5: kein Schnitt der Achsen, Anfang als Lot vom Knoten.')
      sichtfeld = sichtfeldEng(D, rvAchsen[0], rvAchsen[1], flaechenRv)
      for (const id of sichtfeld.ohneFlaechen) hinweise.push(`Abb. 5: ein Punkt des Pfads liegt in «${hvAlle.find(v => v.id === id)?.name ?? id}»: ` +
        'für das Sichtfeld der schmalen Zufahrt nicht gerechnet.')
      if (sichtfeld.bisX > ENG_LAENGE_M) hinweise.push(`Abb. 5: D liegt ${f1(sichtfeld.bisX)} m vor dem Schnitt der Achsen, mehr als die ` +
        `Pfadlänge ${ENG_LAENGE_M} m: nur die Sichtlinie zum Schnittpunkt geprüft.`)
      if (!sichtfeld.frei) {
        rr.status = 'nicht_erfuellt'
        rr.statusZusatz.push('Sichtfeld nach Abb. 5 nicht frei')
        rr.hinweise.push(`Abb. 5 (schmale Zufahrt, Konstruktion nach bfu BM.021 Abb. 4): ${sichtfeld.linien.length - sichtfeld.sichtbar} von ` +
          `${sichtfeld.linien.length} Sichtlinien verdeckt; erste verdeckte bei ${f1(sichtfeld.erste!.s)} m Pfadlänge ab D ` +
          `(${f1(sichtfeld.erste!.sRechts)} m auf ${armText(rArm!)} ab dem Schnitt der Achsen; ${sichtfeld.erste!.verdecker}).`)
      }
    }
    const zust = rr.rv ? zustandAbb6(wahr, rr.vorhanden) : null
    const grundKeine = !rArm ? 'kein Arm rechts der Zufahrt: kein Verkehr hat Vortritt vor dieser Zufahrt' :
      !zArm.zufluss && !zufahrtVelo ? 'Einbahn vom Knoten weg: auf diesem Arm kein vortrittsbelasteter Verkehr' :
      // Velo gegen die Einbahn auf dem rechten Arm (E4): von rechts nur Velos, geprüft nach Tab. 3 (Block Veloverkehr)
      !rArm.zufluss && rArm.veloZufluss ? `der Arm rechts (${armText(rArm)}) ist eine Einbahn vom Knoten weg: von rechts kommen nur Velos ` +
        `(OSM ${rArm.veloZuflussQuelle}), geprüft nach Tab. 3` :
      !rArm.zufluss ? `der Arm rechts (${armText(rArm)}) ist eine Einbahn vom Knoten weg: kein Verkehr von rechts` : ''
    const st: RvStatus = grundKeine || !zust ? 'keine' : sichtfeld && !sichtfeld.frei ? 'nicht_erfuellt' : RV_STATUS[zust]
    const arm: RvArm = { arm: zArm.key, armName: armText(zArm), rechts: rArm?.key ?? null, rechtsName: rArm ? armText(rArm) : '–',
      vorhanden: st === 'keine' ? 0 : rr.vorhanden, bisEnde: st !== 'keine' && rr.bisEnde, zustand: st === 'keine' ? null : zust, status: st,
      grund: grundKeine, breite: bZ, breiteRechts: bR, schmal, sichtfeld,
      ...(rArm && !rArm.zufluss && rArm.veloZufluss && (zArm.zufluss || zufahrtVelo) ? { nurVelo: rArm.veloZuflussQuelle } : {}) }
    rechtsvortritt = { wahrnehmbarkeit: wahr, wahrnehmbarkeitGewaehlt: ke.wahrnehmbarkeit !== null, markierung: ke.markierungRv, tempo: RV_TEMPO, B: RV_B_M, arm,
      alle: null, fahrbahnachsen: rvAchsen }
    // Korrektur 31.10.2026 (Punkt 6 j, k, l): Wahrnehmbarkeit eigenes Thema; Sicht nach rechts im Thema «Verkehr mit Vortritt»; enge
    // Kreuzung nur, wenn eine Fahrbahn höchstens SCHMAL_M breit ist und das Sichtfeld gerechnet wird
    if (ke.wahrnehmbarkeit === null && rArm && !grundKeine)
      an.wahrnehmbarkeit.push(`Die Wahrnehmbarkeit des Knotens ist mit «${WAHRNEHMBARKEIT_TEXT[wahr]}» angenommen (VSS 40 273 Ziffer 18, ` +
        'S. 12). Bitte vor Ort einschätzen und im Panel wählen.')
    if (rArm && !grundKeine) {
      an.verkehr.push(`Geprüft wird die Sicht nach rechts (${armName(rArm)}) bis ${RV_ZIEL_M} m. Nötig sind ${RV_A_M} m; ${RV_A_MIN_M} m genügen ` +
        'nur bei sehr guter Wahrnehmbarkeit (VSS 40 273 Ziffer 16, S. 10). Aus Sichtweite und Wahrnehmbarkeit ergibt sich der Zustand ' +
        'nach Abb. 6 (S. 12).')
      herleitung.push(`Rechtsvortritt: Zielpunkte auf der Fahrstreifenachse des rechten Arms (zum Knoten fahrender Fahrstreifen, d ` +
        `${f2(D_MFZ_M)} m) bis ${RV_ZIEL_M} m ab K; Zustand nach Abb. 6 aus Wahrnehmbarkeit und vorhandener Sichtweite (Stufen ` +
        `${ABB6_GRENZEN.join(', ')} m, dazwischen die nächsttiefere).`)
    }
    if (sichtfeld) {
      const engText = (b: number | null, name: string) => (b !== null ? `${name} ${f1(b)} m` : `${name} ohne Querschnitt der amtlichen Vermessung`)
      an.eng.push(`Enge Kreuzung: eine Fahrbahn ist höchstens ${f2(SCHMAL_M)} m breit (${engText(bZ, 'Zufahrt')}, ` +
        `${engText(bR, rArm ? armName(rArm) : 'rechter Arm')}). Zusätzlich prüft die App, ob sich zwei Fahrzeuge auf den letzten ` +
        `${ENG_LAENGE_M} m vor der Ecke sehen (VSS 40 273 Abb. 5, S. 11; Konstruktion nach bfu BM.021 Kap. 3.2.2, Abb. 4, S. 4).`)
      herleitung.push(`Enge Kreuzung: Sichtlinien vom Beobachtungspunkt D (B ${f2(RV_B_M)} m; Annahme: Beobachter in D) zu Punkten alle ` +
        `${ENG_SCHRITT_M} m auf einem Pfad von ${ENG_LAENGE_M} m (doppelte Anhaltestrecke bei rund 25 km/h): ab D (Annahme: Pfadbeginn ` +
        'in D) entlang der Achse der Zufahrt bis zum Schnitt mit der Achse des rechten Arms, dann auf dieser (Fahrbahnmitte eines ' +
        'schmalen, Fahrstreifen eines breiten Arms); gezählt der Schnittpunkt und die Punkte dahinter; Gebäude und volle Hindernisse; ' +
        'frei, wenn alle Sichtlinien frei sind.')
    }
  }

  // Veloverkehr (E3b)
  // Korrektur 31.10.2026 (Punkt 6 n): nur die Führung dieses Falls; Lagen und Spaltenregeln der Tab. 3 in der Regelübersicht
  const FUEHRUNG_SATZ: Record<Exclude<Velofuehrung, 'kein'>, string> = { misch: `im Mischverkehr, ${f2(D_VELO_M)} m vom rechten Fahrbahnrand`,
    radstreifen: `auf einem Radstreifen, in seiner Mitte (${f2(RADSTREIFEN_M)} m breit angenommen)`, radweg: 'auf einem Radweg, auf seiner Achse' }
  const mitVelo = richtungen.filter(r => r.velo && !r.veloGegen)
  const fuehrungen = [...new Set(mitVelo.map(r => r.veloFuehrung as Exclude<Velofuehrung, 'kein'>))]
  if (mitVelo.length) an.verkehr.push(`Velos fahren ${fuehrungen.length === 1 ? `${mitVelo.length > 1 ? 'hier ' : `${vonSatz(mitVelo[0])} `}` +
    FUEHRUNG_SATZ[fuehrungen[0]] : fuehrungen.map(f => `${mitVelo.filter(r => r.veloFuehrung === f).map(vonSatz).join(' und ')} ` +
    FUEHRUNG_SATZ[f]).join(', ')} (VSS 40 273 Ziffer 10 und 13.3, S. 7 und 9). Die nötige Sichtweite richtet sich nach Tempo und ` +
    `Gefälle (Tab. 3, S. 9)${rv ? '; beim Rechtsvortritt mit dem Tempo der Strasse von rechts' : ''}.`)
  for (const r of richtungen) if (r.veloGegen) an.verkehr.push(`${gross(vonSatz(r))} kommen nur Velos (Einbahn vom Knoten weg, OSM ` +
    `${r.veloGegen}); sie fahren am für sie rechten Fahrbahnrand${r.velo ? ` (${VELOFUEHRUNG_TEXT[r.veloFuehrung]})` : ''}.`)
  for (const r of richtungen) if (r.velo) herleitung.push(`Veloachse ${lageNach(r)}: ${r.velo.lageText}; ${VELOFUEHRUNG_TEXT[r.veloFuehrung]} ` +
    `(${r.veloGewaehlt ? 'gewählt' : r.veloVorgabeQuelle}); ${r.velo.text}.`)
  for (const r of richtungen) if (r.tempoAnnahme) an.verkehr.push(`Tempo ${lageNach(r)}: ohne Angabe in OSM ${TEMPO_ERSATZ} km/h angenommen.`)

  // Trottoir (E3b, Ziffer 13.2, Tab. 2): D' = B 3,00 m hinter der Trottoirhinterkante (Ziffer 13.2), Zielpunkte beidseits auf der
  // Trottoirachse; Neigung in Gehrichtung auf die Zufahrt zu, talwärts negativ (Auslegung, Block 5: Tab. 2 nennt keine Richtung,
  // gestützt auf bfu BM.021 Tab. 3, Fussnote S. 7)
  let trottoirPruefung: TrottoirPruefung | null = null, trottoirProfil: P[] = []
  if ((trAt || tueB) && !nurRv) {
    // Trottoirüberfahrt (K0): D' = B 3,00 m hinter dem hinteren Rand der Überfahrt (VSS 40 273 Ziffer 13.2), Zielpunkte auf der
    // Gehlinie TUE_GEHLINIE_M vor dem hinteren Trottoirrand je Seite (VSS 40 242 Ziffer 14.4); sonst (E3b) hinter der
    // Trottoirhinterkante nach AV, Zielpunkte auf der Trottoirachse
    const sH = tueB ? tueB.sHinter : trAt!.sHinter
    let Dt = beobachtungAb(zAchse, sH, B_INNERORTS_M, dSeitlich)
    // K0: D' von Hand (nur im Modus Trottoirüberfahrt): frei gesetzt, Achspunkt um den Fahrersitz versetzt wie bei D; das Band bleibt
    let dtHinter: number | null = null
    if (tueB && ke.Dtrottoir) {
      const l = lageAnAchse(zAchse, ke.Dtrottoir)
      dtHinter = l.s - sH
      Dt = { ...Dt, D: ke.Dtrottoir, Dachse: add(ke.Dtrottoir, links(l.t), dSeitlich) }
      if (dtHinter < B_INNERORTS_M - 0.005) hinweise.push(`D' von Hand ${f2(dtHinter)} m hinter dem hinteren Rand der Überfahrt: weniger ` +
        `als B = ${f2(B_INNERORTS_M)} m (VSS 40 273 Ziffer 13.2).`)
      if (dist(ke.Dtrottoir, Dt.nullpunkt) > D_HAND_WEIT_M)
        hinweise.push(`D' von Hand liegt ${Math.round(dist(ke.Dtrottoir, Dt.nullpunkt))} m vom hinteren Rand entfernt: Lage prüfen.`)
    }
    // Achse: Mitte der AV-Fläche Trottoir je Arm aus Querschnitten; sonst die Mitte des Trottoirs auf der Zufahrtsachse
    const mitte = punkteAufSpur(zAchse, [(beob.sRand + sH) / 2])[0]?.[0] ?? Dt.Dachse
    const lagen = lagenT!
    const quellen: string[] = []
    const linien = lagen.map((l, j) => {
      const anders = lagen[1 - j].t
      // Trottoirüberfahrt: Gehlinie je Seite ab dem Fahrbahnrand dieses Arms (Abstand plus Fahrbahnrand − 0,50 m), folgt der Strasse
      const abstand = tueB ? tueB.gehlinie[j] : l.t?.abstand ?? anders?.abstand ?? dist(mitte, lot(l.ml, mitte).p)
      quellen.push(tueB ? `${lageNach({ lage: lageLR[j] })} ${f2(tueB.hinten[j] - tueB.gehlinie[j])} m vor dem hinteren Rand der Überfahrt, ` +
        `${f2(Math.max(0, abstand - l.rand))} m hinter dem Fahrbahnrand` :
        `${lageNach({ lage: lageLR[j] })} ${l.t ? `Mitte der AV-Fläche Trottoir (${l.t.n} Querschnitte, Breite ${f1(l.t.breite)} m)` :
        anders ? 'wie die Gegenseite' : 'Mitte des Trottoirs an der Zufahrt, parallel zur Strasse'}`)
      // Gehlinie ab dem Fahrbahnrand je Stelle; Trottoirachse nach AV (Mitte der Fläche) fest zur Mittellinie, an einer Teilung der
      // Fahrbahn (Befund 31.10.2026) ab dem Rand je Stelle
      const linie = mitVerlaengerung(tueB || l.geteilt ? versetztVariabel(l.ml, s => l.seite * (l.randBei(s) + abstand - l.rand)) :
        versetzt(l.ml, l.seite * abstand))
      const x = schnittBei(zAchse, linie, kp)
      return abBogen(linie, x ? x.sb : lot(linie, kp).s)
    })
    const hvT = hvAlle.filter(v => !imPolygon(Dt.D, v.poly))
    const mT = hoehen?.trottoir
    // Neigung des Trottoirs: gemessen; nach dem Laden ohne Messung unbekannt (Tab. 2 Spalte ≤ −6, Entscheid 31.10.2026); lädt: 0 %
    const gemessenT = mT !== undefined && mT.i !== null
    const unbekanntT = !gemessenT && !!hoehen
    const trRichtungen = (['links', 'rechts'] as Richtung[]).map((r, j): TrottoirRichtung => {
      // Profil vom Ende links zum Ende rechts: i in Gehrichtung von rechts; von links −i
      const i = gemessenT ? (j === 0 ? -mT!.i! : mT!.i!) || 0 : 0
      const quelle = gemessenT ? `${mT!.quelle}, ${tueB ? 'Gehlinie' : 'Trottoirachse'}` : mT ? `${mT.quelle}: ${NEIGUNG_UNBEKANNT_QUELLE}` :
        hoehen ? `ohne Profil: ${NEIGUNG_UNBEKANNT_QUELLE}` : 'Höhenmodell lädt: vorerst 0 %'
      const tw = trottoirSichtweite(i, unbekanntT)
      const teil = sichtTeil(Dt.D, linien[j], Math.ceil(ZIEL_FAKTOR * tw.A), [...k.gebaeude, ...hvT], tw.A)
      return { ...teil, richtung: r, lage: lageLR[j], neigung: i, neigungUnbekannt: unbekanntT, neigungQuelle: quelle, text: tw.text,
        hinweise: [...teil.hinweise, ...(mT?.hinweis && j === 0 ? [mT.hinweis] : [])] }
    })
    trottoirPruefung = { D: Dt.D, Dachse: Dt.Dachse, hinterkante: Dt.nullpunkt, achseQuelle: quellen.join('; '), richtungen: trRichtungen,
      ...(tueB ? { gehlinie: true } : {}) }
    trottoirProfil = [...abschneiden(linien[0], TROTTOIR_PROFIL_M).reverse(), ...abschneiden(linien[1], TROTTOIR_PROFIL_M).slice(1)]
    const neigungT = gemessenT ? `aus dem Höhenmodell (Ausgleichsgerade über ${TROTTOIR_PROFIL_M} m beidseits)` : unbekanntT ?
      'unbekannt (kein Höhenprofil): strengster Wert der Tab. 2 (Spalte ≤ −6 %) angenommen (Entscheid 31.10.2026)' :
      '0 % (vorerst, das Höhenmodell lädt noch)'
    // Korrektur 31.10.2026: D' beim wartenden Fahrzeug, die Fussgänger beim Verkehr mit Vortritt; Lage der Achsen in der Herleitung,
    // Auslegung der Neigungsrichtung und Spaltenregel in der Regelübersicht
    const sitz = zufahrtVelo ? 'beim Velofahrer' : 'am Fahrersitz'
    an.wartend.push(tueB ? (dtHinter !== null ? `Für die Sicht aufs Trottoir liegt das Auge D' von Hand ${f2(dtHinter)} m hinter dem ` +
      `hinteren Rand der Überfahrt (Vorgabe ${f2(B_INNERORTS_M)} m, VSS 40 273 Ziffer 13.2, S. 8).` : `Für die Sicht aufs Trottoir liegt ` +
      `das Auge D' ${f2(B_INNERORTS_M)} m hinter dem hinteren Rand der Überfahrt, ${sitz} (VSS 40 273 Ziffer 13.2, S. 8).`) :
      `Für die Sicht aufs Trottoir liegt das Auge D' ${f2(B_INNERORTS_M)} m hinter der Trottoirhinterkante, ${sitz} (VSS 40 273 ` +
      'Ziffer 13.2, S. 8).')
    an.verkehr.push((tueB ? `Fussgänger gehen auf einer Linie ${f2(TUE_GEHLINIE_M)} m vor dem hinteren Rand der Überfahrt (VSS 40 242 ` +
      'Ziffer 14.4, S. 13); die nötige Sicht auf sie richtet sich nach VSS 40 273 Tab. 2 (S. 8).' : 'Fussgänger gehen in der Mitte des ' +
      'Trottoirs beidseits der Zufahrt; die nötige Sicht auf sie richtet sich nach VSS 40 273 Tab. 2 (S. 8).') +
      ` Längsneigung des Trottoirs in Gehrichtung auf die Zufahrt zu ${neigungT}.`)
    herleitung.push(`${tueB ? 'Gehlinie' : 'Trottoirachse'}: ${quellen.join('; ')}; ${TROTTOIR_NEIGUNG_AUSLEGUNG}.`)
  }
  // Überholfall (Block 5, VSS 40 273 Ziffer 6, S. 4; Abb. 1, S. 5): nur ausserorts und mit erlaubtem Überholen (Vorgabe aus OSM je
  // Richtung, von Hand für beide), nicht beim Rechtsvortritt. Je Richtung mit Motorfahrzeugen eine zweite Sichtlinie S' von D auf die
  // Achse des anderen Fahrstreifens derselben Strasse: das überholende Fahrzeug fährt auf dem Gegenfahrstreifen, D_MFZ_M vom anderen
  // Fahrbahnrand (Annahme: ohne Abzug eines Parkstreifens dort). Zielpunkte bis A (dieselbe erforderliche Sichtweite), Hindernisse
  // wie für Motorfahrzeuge; der Teil zählt zum Gesamtstatus der Richtung und zu den Massnahmen
  let ueberholen: UeberholStand | null = null
  if (!rv) {
    const mitAuto = richtungen.map((r, j) => ({ r, j })).filter(x => x.r.status !== 'keine_zufahrt')
    const vg = mitAuto.map(x => ({ ...x, v: ueberholenVorgabe(netz, haupt[x.j].arm) }))
    const vorgabe = vg.length ? vg.some(x => x.v[0]) : true
    const qs = [...new Set(vg.map(x => x.v[1]))]
    const vorgabeQuelle = qs.length <= 1 ? qs[0] ?? 'ohne Verkehr' : vg.map(x => `${lageKurz(x.r)}: ${x.v[1]}`).join('; ')
    const geprueft: string[] = [], grund: string[] = [], geteilt: string[] = []
    for (const { r, j, v } of vg) {
      const erlaubt = ke.ueberholen ?? v[0]
      const g0 = !ao.ausserorts ? 'innerorts' : !erlaubt ? (ke.ueberholen === false ? 'Überholen verboten (von Hand)' :
        `Überholen verboten (${v[1]})`) : haupt[j].arm.einbahn !== 0 && istWeg(haupt[j].arm.wid) ? 'Einbahn, kein Gegenfahrstreifen' : ''
      if (g0) { grund.push(`${lageKurz(r)}: ${g0}`); continue }
      const h = haupt[j]
      // Achse des Gegenfahrstreifens: D_MFZ_M vom anderen Rand, Rand je Stelle (Entscheid 31.10.2026)
      const au = mitVerlaengerung(versetztVariabel(h.ml, s => -(randRechtsBei(h.qs, s) - D_MFZ_M)))
      const xu = schnittBei(zAchse, au, kp)
      const achseU = abBogen(au, xu ? xu.sb : lot(au, kp).s)
      const teil = sichtTeil(D, achseU, r.sMax, [...k.gebaeude, ...hv], r.massgebend)
      const u: UeberholTeil = { ...teil, lageText: `${f2(D_MFZ_M)} m vom linken Fahrbahnrand (Gegenfahrstreifen, überholendes Fahrzeug)`,
        hinweise: [...teil.hinweise, ...(xu ? [] : ['Kein Schnitt der Zufahrtsachse mit der Achse des Gegenfahrstreifens: Anfang als Lot vom Knoten.'])] }
      r.ueberholfall = u
      geprueft.push(lageKurz(r))
      // Befund 31.10.2026: ab einer Teilung der Fahrbahn ist die Gegenrichtung baulich getrennt; die Achse bleibt auf der zuführenden
      // Einbahn, D_MFZ_M von deren linkem Rand (mehrstreifig: Überholstreifen; einstreifig nahe der Fahrlinie, konservativ weiter geprüft)
      const t = h.teilungen[0]
      if (t) geteilt.push(`${lageKurz(r)} ab ${Math.round(t.ab)} m`)
    }
    const erlaubtAlle = ke.ueberholen ?? vorgabe
    ueberholen = { ausserorts: ao.ausserorts, vorgabe, vorgabeQuelle, gewaehlt: ke.ueberholen !== null, erlaubt: erlaubtAlle,
      geprueft: geprueft.length > 0, grund: !ao.ausserorts ? 'innerorts' : grund.join('; ') }
    // Korrektur 31.10.2026: innerorts gilt der Überholfall nicht, darum ohne Annahme
    if (geprueft.length) {
      an.verkehr.push(`Ausserorts ist hier Überholen erlaubt (${ke.ueberholen !== null ? 'von Hand' : `Vorgabe: ${vorgabeQuelle}`}): die App ` +
        `prüft ${geprueft.join(' und ')} zusätzlich die Sicht auf ein überholendes Fahrzeug auf dem Gegenfahrstreifen bis A (Sichtlinie S', ` +
        'VSS 40 273 Ziffer 6, S. 4; Abb. 1, S. 5).')
      herleitung.push(`Überholfall: Achse des Gegenfahrstreifens ${f2(D_MFZ_M)} m vom anderen Fahrbahnrand (ohne Abzug eines Parkstreifens, ` +
        'Annahme), Zielpunkte bis A wie für Motorfahrzeuge, Hindernisse wie für Motorfahrzeuge' + (geteilt.length ? `; ${geteilt.join(' und ')} ` +
        `(Fahrbahn geteilt, Gegenrichtung baulich getrennt) ${f2(D_MFZ_M)} m vom linken Rand der Einbahn zum Knoten (Annahme)` : '') + '.')
    }
    if (mitAuto.length && ao.ausserorts && grund.length)
      an.verkehr.push(`Überholfall nicht geprüft (${grund.join('; ')}; VSS 40 273 Ziffer 6, S. 4).`)
  }
  // Gesamtstatus je Richtung: schlechtester von Auto, Velo, Überholfall und Trottoir dieser Seite (Entscheid 1 vom 16.10.2026)
  for (const r of richtungen) {
    const tr = trottoirPruefung?.richtungen.find(x => x.richtung === r.richtung) ?? null
    const teile: [string, RichtungStatus][] = [...(r.status !== 'keine_zufahrt' ? [['Auto', r.status]] as [string, RichtungStatus][] : []),
      ...(r.velo ? [['Velo', r.velo.status]] as [string, RichtungStatus][] : []),
      ...(r.ueberholfall ? [['Überholfall', r.ueberholfall.status]] as [string, RichtungStatus][] : []),
      ...(tr ? [['Trottoir', tr.status]] as [string, RichtungStatus][] : [])]
    r.gesamt = teile.length ? teile.reduce((a, b) => (RANG[b[1]] < RANG[a[1]] ? b : a))[1] : 'keine_zufahrt'
    r.gesamtFehlt = teile.filter(t => t[1] === 'nicht_erfuellt').map(t => t[0])
  }
  // Trottoirüberfahrt (K0): Ergebnis je Phase (Trottoir ab dem hinteren Rand, Fahrbahn ab der Bordkante)
  let trottoirueberfahrt: TueErgebnis | null = null
  if (tueB) {
    const seitenAv = lagenT!.map((l, j) => (l.t ? `${lageWort({ lage: lageLR[j] })} ${f2(l.t.breite)} m` : '')).filter(x => x)
    const breiteText = tueB.quelle === 'av_quer' ? `Breite ${f2(tueB.breite)} m aus der AV-Fläche Trottoir quer über die Zufahrt` :
      tueB.quelle === 'av_neben' ? `Breite ${f2(tueB.breite)} m nach dem ${seitenAv.length > 1 ? 'schmaleren ' : ''}angrenzenden Trottoir ` +
      `(AV ${seitenAv.join(', ')}; VSS 40 242 Ziffer 16: 2,00 bis 3,50 m); an der Einmündung zeigt die AV kein Trottoir (Planungsfall)` :
      tueB.quelle === 'eingabe' ? `Breite ${f2(tueB.breite)} m von Hand` :
      `Breite ${f2(TUE_BREITE_ANNAHME_M)} m angenommen (die AV zeigt kein Trottoir, keine Eingabe; VSS 40 242 Ziffer 16)`
    an.wartend.push(`Trottoirüberfahrt: ${breiteText}. Vorderer Rand an der Bordkante, hinterer Rand beidseits ${f2(tueB.abstand)} m ` +
      `${tueB.vorlauf > 0.005 ? `(Trottoir nach AV ab ${f2(tueB.vorlauf)} m) ` : ''}` +
      `hinter dem Fahrbahnrand, auf der Zufahrtsachse ${f2(tueB.laenge)} m (Einbiegewinkel rund ${Math.round(einbiegewinkel)}°).`)
    // kurze Hinweise nur, wenn sie zutreffen (VSS 40 242 Ziffern 14.1, 14.2, 14.3.1, 14.3.4, 15.4.2)
    if (ao.ausserorts) hinweise.push('Trottoirüberfahrt ausserorts (nach OSM): nach VSS 40 242 Ziffer 14.1 nur innerorts.')
    if (durchgehend || gegenArm) hinweise.push('Die Zufahrt liegt auf der durchgehenden Strasse: nach VSS 40 242 Ziffer 14.2 Trottoirüberfahrt nur ' +
      'über die einmündende Strasse.')
    const vMax = Math.max(0, ...richtungen.filter(r => r.status !== 'keine_zufahrt' && (r.tempoArt === null || r.tempoArt === 'signalisiert'))
      .map(r => r.tempo))
    if (vMax > 50) hinweise.push(`Tempo auf der Hauptfahrbahn ${vMax} km/h: nach VSS 40 242 Ziffer 14.3.1 höchstens 50 km/h.`)
    if (!(durchgehend || gegenArm) && (einbiegewinkel < 45 || einbiegewinkel > 135)) hinweise.push(`Einbiegewinkel rund ${Math.round(einbiegewinkel)}°: nach VSS 40 242 ` +
      'Ziffer 14.3.4 nur zwischen 45° und 135°.')
    const velo = veloAufTrottoir(netz, haupt.map((h, j) => ({ arm: h.arm, seite: lagenT![j].seite })), k.osm.querungen ?? [],
      punkteAufSpur(zAchse, [(beob.sRand + tueB.sHinter) / 2])[0]?.[0] ?? null)
    if (velo) hinweise.push(`OSM: Velos auf dem Trottoir gestattet (${velo}): nach VSS 40 242 Ziffer 15.4.2 wie ein Radweg zu prüfen; nicht gerechnet.`)
    an.wartend.push(`Für die Sicht auf die Fahrbahn zählt B ab der ${nullpunktText}${haltelinie || abRadweg ? ' (geht dem vorderen Rand der Überfahrt vor)' :
      ''}; die Zufahrt ist vortrittsbelastet, kein Rechtsvortritt (VSS 40 242 Ziffer 12.3, S. 8; Ziffer 14.4, S. 13).`)
    const schlecht = (xs: RichtungStatus[]): RichtungStatus => (xs.length ? xs.reduce((a, b) => (RANG[b] < RANG[a] ? b : a)) : 'keine_zufahrt')
    const fb: [string, RichtungStatus][] = richtungen.flatMap(r => [...(r.status !== 'keine_zufahrt' ? [[`${lageKurz(r)}: Auto`, r.status]] : []),
      ...(r.ueberholfall ? [[`${lageKurz(r)}: Überholfall`, r.ueberholfall.status]] : []),
      ...(r.velo ? [[`${lageKurz(r)}: Velo`, r.velo.status]] : [])] as [string, RichtungStatus][])
    const tt: [string, RichtungStatus][] = (trottoirPruefung?.richtungen ?? []).map(t => [`${lageKurz(t)}: Trottoir`, t.status])
    const phase = (x: [string, RichtungStatus][]): TuePhase => ({ status: schlecht(x.map(y => y[1])),
      fehlt: x.filter(y => y[1] === 'nicht_erfuellt').map(y => y[0]) })
    trottoirueberfahrt = { breite: tueB.breite, breiteQuelle: tueB.quelle, breiteText, laenge: tueB.laenge, abstand: tueB.abstand,
      durchgehend: durchgehend || !!gegenArm, D, Dquelle: ke.D ? 'hand' : 'rechnung',
      Dtrottoir: trottoirPruefung!.D, DtrottoirQuelle: ke.Dtrottoir ? 'hand' : 'rechnung',
      vorderkante: beobachtungAb(zAchse, beob.sRand, 0).nullpunkt, hinterkante: beobachtungAb(zAchse, tueB.sHinter, 0).nullpunkt,
      gehlinie: TUE_GEHLINIE_M, regelungText: regelung === 'stop' ? 'Stop (Zufahrt vortrittsbelastet)' : 'Vortritt: kein Rechtsvortritt an ' +
        'einer Trottoirüberfahrt, die Zufahrt ist vortrittsbelastet (VSS 40 242 Ziffer 12.3)', phaseTrottoir: phase(tt), phaseFahrbahn: phase(fb) }
  }

  // nötiger AV-Ausschnitt: weitester Zielpunkt ab dem Knoten plus Reserve (ohne Richtungen ohne Verkehr), mit Velo- und Trottoirachse
  const achsen2 = [...richtungen.flatMap(r => [r.achse, r.velo?.achse ?? []]), ...(trottoirPruefung?.richtungen.map(t => t.achse) ?? [])]
  const weit = Math.max(0, ...achsen2.flatMap(a => a.map(p => dist(kp, p))))
  const weitAv = Math.max(0, ...achsen2.flatMap(a => a.map(p => dist(avZentrum, p))))
  const avBedarf = Math.ceil(weitAv + AV_RESERVE_M)
  const hindernis: HindernisStand = nurRv ? { vorschlaege: [], amtlich: [], amtlichVerworfen: [], osmUeberdeckt: 0, inD, reichweite: 0 } :
    hindernisStand(k, hg, kp, weit + REICHWEITE_RESERVE_M, richtungen, D, inD)
  const bisD = Math.max(sNull - beob.sRand + B, ke.D ? sNull - beob.sRand + Dlage.laengs : 0)
  // Längsneigung der Zufahrt (E3a): Profil ab der Kante PROFIL_MIN_M vom Knoten weg; noch ohne Wirkung (Tab. 2 folgt in E3b)
  const zufahrtProfil = abschneiden(abBogen(zAchse, beob.sRand), PROFIL_MIN_M)
  const zufahrtNeigung = hoehen?.zufahrt ?? null
  if (zufahrtNeigung?.i !== null && zufahrtNeigung?.i !== undefined && Math.abs(zufahrtNeigung.i) > ZUFAHRT_STEIL_PROZENT + 1e-9)
    hinweise.push(`Steile Zufahrt: Längsneigung ${fi(zufahrtNeigung.i)} % in Fahrtrichtung von FB (Höhenmodell, ${zufahrtNeigung.quelle}); ` +
      'ohne Wirkung auf B (Ziffer 12 kennt keine Anpassung).')

  // Massnahmen nach Ziffer 14 (E3a): Varianten dieser Rechnung (D, Hindernisse, Tempo), ohne neue Daten
  const flaechen = [...k.gebaeude, ...hv]
  const variante = (v: Variante): VarianteRichtung[] => richtungen.filter(r => r.status !== 'keine_zufahrt' || r.velo).map(r => {
    const t = v.tempo?.[r.richtung] ?? r.tempo
    const fl = v.ohne ? flaechen.filter(f => !v.ohne!.includes(f.id)) : flaechen
    // Velo (E3b): dieselbe Variante auf der Veloachse; ein tieferes Tempo gilt als zulässige Höchstgeschwindigkeit der Tab. 3
    let velo: VarianteRichtung['velo'] = null
    if (r.velo) {
      // tieferes Tempo: höchstens die heutige zulässige Höchstgeschwindigkeit (ein V85 von Hand macht die Zeile nicht strenger)
      const Av = v.tempo?.[r.richtung] !== undefined ? veloSichtweite(Math.min(t, r.velo.tempo), r.velo.neigung, ke.ebikeVerboten,
        r.velo.neigungUnbekannt).A : r.velo.A
      const flV = r.velo.ohneFlaechen.length ? fl.filter(f => !r.velo!.ohneFlaechen.includes(f.id)) : fl
      const sv = sichtEntlang(v.D ?? D, r.velo.achse, Math.max(r.velo.sMax, Math.ceil(ZIEL_FAKTOR * Av)), flV, Av)
      velo = { vorhanden: sv.vorhanden, massgebend: Av, reicht: sv.vorhanden + 1e-6 >= Av }
    }
    // Velo gegen die Einbahn (E4): von dieser Seite nur Velos
    if (r.status === 'keine_zufahrt')
      return { richtung: r.richtung, lage: r.lage, vorhanden: velo!.vorhanden, massgebend: velo!.massgebend, reicht: velo!.reicht, tempo: t, velo, nurVelo: true }
    const sw = t === r.tempo ? null : sichtweiteA(t, strasse.typ, strasse.ungunst, r.neigung, r.neigungUnbekannt)
    const A = sw ? sw.massgebend : r.massgebend
    const si = sichtEntlang(v.D ?? D, r.achse, r.sMax, fl, A)
    // Überholfall (Block 5): dieselbe Variante auf der Achse des Gegenfahrstreifens, mit derselben erforderlichen Sichtweite
    const u0 = r.ueberholfall
    const su = u0 ? sichtEntlang(v.D ?? D, u0.achse, u0.sMax, u0.ohneFlaechen.length ? fl.filter(f => !u0.ohneFlaechen.includes(f.id)) : fl, A) : null
    const ueberholfall = u0 && su ? { vorhanden: su.vorhanden, massgebend: A, reicht: su.vorhanden + 1e-6 >= A } : null
    // Rechtsvortritt: Abb. 6 nicht «zu sanieren» und (schmale Zufahrt) Sichtfeld ohne die entfernten Hindernisse frei
    const st = r.rv ? (zustandAbb6(wahr, si.vorhanden) === 'sanieren' ? 'nicht_erfuellt' : 'erfuellt') :
      sichtStatus(si.vorhanden, sw ?? { massgebend: r.massgebend, oben: r.erforderlichOben })
    const engFrei = !(r.rv && rvAchsen) || sichtfeldEng(v.D ?? D, rvAchsen[0], rvAchsen[1], v.ohne ?
      flaechenRv.filter(f => !v.ohne!.includes(f.id)) : flaechenRv).frei
    const auto = st !== 'nicht_erfuellt' && engFrei
    return { richtung: r.richtung, lage: r.lage, vorhanden: si.vorhanden, massgebend: A, reicht: auto && (velo?.reicht ?? true) &&
      (ueberholfall?.reicht ?? true), tempo: t, velo, ...(ueberholfall ? { ueberholfall } : {}),
      ...(r.rv && rvAchsen ? { sichtfeldFrei: engFrei } : {}) }
  })
  const bezug = abRadweg ? 'Aussenkante des Radwegs' : trAt && !ke.trottoirFrei && !tue ? 'Trottoirhinterkante' : 'Kante'
  const massnahmen = nurRv ? null : massnahmenRechnen({ richtungen, variante, ausserorts: ao.ausserorts, regelung, grundstueck: !!g, lsa: !!info.lsa,
    rechtsvortritt: rechtsvortritt ? { aufheben: rechtsvortritt.arm.status === 'nicht_erfuellt', verdecker: rechtsvortritt.arm.sichtfeld?.verdecker ?? [],
      wahrnehmbarkeit: rechtsvortritt.arm.status === 'keine' ? [] : WAHRNEHMBARKEITEN.map(w => `${WAHRNEHMBARKEIT_TEXT[w]}${w === wahr ?
        ' (heute)' : ''}: ${ZUSTAND_TEXT[zustandAbb6(w, rechtsvortritt!.arm.vorhanden)]} bei ${f1(rechtsvortritt!.arm.vorhanden)} m`) } : null,
    haltelinie: ke.D ? null : { dHeute: sNull + B - sNormal, bezug, lage: b => {
      const l = beobachtungAb(zAchse, sNormal + b - B, B, dSeitlich)
      return { D: l.D, haltelinie: l.nullpunkt }
    } },
    dStop: ke.D ? null : beobachtungAb(zAchse, sNull, B_INNERORTS_M, dSeitlich).D,
    siedlungsorientiert: strasse.typ === 'es' || richtungen.some(r => r.status !== 'keine_zufahrt' && r.tempo <= 30) })

  // Block 5, Hinweis ohne Statuswirkung: Stop und die Sicht reicht in allen Richtungen (Auto, Velo, Überholfall) -> «Kein Vortritt»
  // genügt (SSV Art. 36 Abs. 7, kantonale Praxis). Ausserorts gilt bei «Kein Vortritt» B 5,00 m: als Variante mit D bei B 5,00 m ab
  // dem Nullpunkt gerechnet (wie die Massnahmen); mit D von Hand nur mit Vorbehalt
  if (regelung === 'stop' && !rv && !nurRv) {
    const mitV = richtungen.filter(r => r.status !== 'keine_zufahrt' || r.velo)
    const reicht = (r: RichtungErgebnis) => r.status !== 'nicht_erfuellt' && r.velo?.status !== 'nicht_erfuellt' &&
      r.ueberholfall?.status !== 'nicht_erfuellt'
    if (mitV.length && mitV.every(reicht)) {
      if (!ao.ausserorts) hinweise.push(KEIN_VORTRITT_STATT_STOP)
      else if (ke.D) hinweise.push(`${KEIN_VORTRITT_STATT_STOP} Ausserorts gilt bei «Kein Vortritt» B ${f2(B_AUSSERORTS_M)} m (Ziffer 12): ` +
        `ab B ${f2(B_AUSSERORTS_M)} m zu prüfen (D von Hand gesetzt, nicht gerechnet).`)
      else if (variante({ D: beobachtungAb(zAchse, sNull, B_AUSSERORTS_M, dSeitlich).D }).every(x => x.reicht))
        hinweise.push(`${KEIN_VORTRITT_STATT_STOP} Ausserorts gilt bei «Kein Vortritt» B ${f2(B_AUSSERORTS_M)} m (Ziffer 12): mit D bei ` +
          `B ${f2(B_AUSSERORTS_M)} m gerechnet, reicht die Sicht auch dort.`)
    }
  }

  // Rechtsvortritt, alle Arme (E3c): dieselbe Rechnung je Arm gegen seinen rechten Nachbarn, mit den Vorgaben (ohne Haltelinie, D,
  // Neigung und Trottoir-Häkchen des gewählten Arms)
  if (rechtsvortritt && ke.alleArme && !nurRv) {
    const keA: Required<KnotenEingaben> = { ...knotenEingabenAus(undefined), regelung: 'rechtsvortritt', wahrnehmbarkeit: ke.wahrnehmbarkeit }
    const egA: SichtEingaben = { ...eg, neigung: { links: null, rechts: null } }
    rechtsvortritt.alle = nachNr(info.arme).map(a => a.key === zArm.key ? rechtsvortritt!.arm :
      rechneZufahrt(k, info, a, false, egA, keA, avRadius, hg, avZentrum, null, null, tempoAmtlich, true).rechtsvortritt!.arm)
  }

  // technische Herleitung: Achse der Zufahrt (bzw. des Velogegenverkehrs) am Nullpunkt und Längsneigung der Zufahrt (ohne Wirkung)
  const zufahrtLageQuelle = zText ? zText(zLageBei(lot(zMl, vorgabe.nullpunkt).s)) : zQuelle
  herleitung.unshift(`${zufahrtLageQuelle}.`, ...(zufahrtNeigung?.i !== null && zufahrtNeigung?.i !== undefined ? [`Längsneigung der ` +
    `Zufahrt ${fi(zufahrtNeigung.i)} % in Fahrtrichtung von F_B (${zufahrtNeigung.quelle}; ohne Wirkung` +
    `${Math.abs(zufahrtNeigung.i) > ZUFAHRT_STEIL_PROZENT ? ', steile Zufahrt' : ''}).`] : []))
  // je Thema ein Punkt (Korrektur 31.10.2026, Punkte 6 und 7)
  const annahmenThemen: AnnahmeThema[] = ANNAHME_THEMEN.filter(([id]) => an[id].length).map(([id, titel]) => ({ thema: id,
    titel: id === 'wartend' && zufahrtVelo ? 'Wartendes Velo' : titel, text: an[id].join(' ') }))
  const annahmen = annahmenThemen.map(t => `${t.titel}: ${t.text}`)

  return { knoten: g ? null : info.id, zufahrt: zArm.key, zufahrtName: g?.weg != null ? `${zArm.nr} ${zName}` : armText(zArm),
    zufahrtspunkt: g ? { eingabe: g.eingabe, richtung: g.richtung, gezeichnet: g.gezeichnet, weg: g.weg, strasse: g.strasse } : null,
    D, Dachse, Dvorgabe: vorgabe.D, Dhand: !!ke.D, Dlage, fbRichtung, rand: beob.rand, nullpunkt: vorgabe.nullpunkt, nullpunktText,
    regelung, regelungVorgabe: rVorgabe, regelungQuelle: rQuelle, regelungGewaehlt: ke.regelung !== null, haltelinie, trottoir, trottoirGrund, B,
    ausserorts: ao.ausserorts, zufahrtAchse: abschneiden(abBogen(zAchse, Math.max(0, beob.sRand - 2)), Math.max(B, bisD) + 12),
    zufahrtLageQuelle, vortritt: [aL.key, aR.key], einbiegewinkel,
    richtungen, strasse, avRadius, avBedarf, annahmen, hinweise, annahmenThemen, herleitung,
    hindernis, zufahrtProfil, zufahrtNeigung, massnahmen, radwegRand: abRadweg ? xRadweg!.p : null, trottoirPruefung, trottoirProfil,
    rechtsvortritt, zufahrtVelo, seiteOhneArm, ...(trottoirueberfahrt ? { trottoirueberfahrt } : {}), ueberholen, ...(info.lsa ? { lsa: true } : {}) }
}

/** Überholen im Knotenbereich (Block 5, VSS 40 273 Ziffer 6): Vorgabe aus den OSM-Tags des Arms für den Verkehr zum Knoten. Der Arm
 *  läuft mit sd > 0 in Wegrichtung vom Knoten weg, dieser Verkehr fährt also gegen die Wegrichtung (overtaking:backward), sonst in
 *  Wegrichtung (overtaking:forward). overtaking=no bzw. das Tag dieser Richtung = no -> verboten; sonst erlaubt (Annahme) */
export function ueberholenVorgabe(netz: OsmNetz, a: ArmInfo): [boolean, string] {
  if (a.wid < 0 || !netz.W.has(a.wid)) return [true, 'ohne OSM-Weg: erlaubt angenommen']
  const t = netz.w(a.wid).t
  const zu = a.sd > 0 ? 'backward' : 'forward'
  if (t.overtaking === 'no') return [false, 'OSM overtaking=no']
  if (t[`overtaking:${zu}`] === 'no') return [false, `OSM overtaking:${zu}=no`]
  return [true, 'ohne overtaking=no in OSM: erlaubt angenommen']
}

/** Veloführung einer Richtung (E3b): in der Rechnung, Vorgabe aus OSM mit Quelle, Radweg (OSM bzw. angenommen) */
interface VeloStand { fuehrung: Velofuehrung; vorgabe: Velofuehrung; quelle: string; gewaehlt: boolean; radweg: RadwegLage | null
  radwegOsm: RadwegLage | null
  /** Befund 31.10.2026 (Knoten 282773328): ab der Teilung der Fahrbahn (Bogenlänge s auf der Mittellinie) gilt nach den Tags der
   *  zuführenden Einbahn diese Führung (nur Wechsel zwischen Mischverkehr und Radstreifen; Übergang über VELO_WECHSEL_M) */
  ab: { s: number; fuehrung: 'misch' | 'radstreifen'; quelle: string } | null }
/** Annahme (Befund 31.10.2026): Wechsel der Veloführung an einer Teilung der Fahrbahn: Achsen gleiten über diese Länge ab der Teilung
 *  von der einen Lage in die andere (kein Sprung) */
const VELO_WECHSEL_M = 10
/** Ziffer 12: Toleranz am Grenzwert 2,00 m (Rundung der Lage) und höchster Abstand der OSM-Radweglinie vom Schnitt mit der
 *  Zufahrtsachse über die halbe Breite hinaus [m] */
const RADWEG_TOL_M = 0.05
/** K0: Länge auf der Zufahrtsachse nach dem Rand der Arme weicht mehr als so viel von Abstand / sin α ab: Hinweis [m] */
const TUE_GEH_TOL_M = 0.3
const RADWEG_AN_ZUFAHRT_M = 3
/** Trottoir: Höhenprofil so weit beidseits der Zufahrt [m] (grösster Wert der Tab. 2) */
export const TROTTOIR_PROFIL_M = Math.max(...TAB2)
const RANG: Record<RichtungStatus, number> = { nicht_erfuellt: 0, massgebend: 1, erfuellt: 2, keine_zufahrt: 3 }
/** Rechtsvortritt (E3c): Zustand nach Abb. 6 als Status der Richtung bzw. des Arms */
const ZUSTAND_STATUS: Record<Zustand, RichtungStatus> = { anzustreben: 'erfuellt', zulaessig: 'massgebend', sanieren: 'nicht_erfuellt' }
export const RV_STATUS: Record<Zustand, RvStatus> = { anzustreben: 'erfuellt', zulaessig: 'bedingt', sanieren: 'nicht_erfuellt' }

/** K0: Velos auf dem Trottoir an der Überfahrt nach OSM: Tag sidewalk[:both|:Seite der Zufahrt]:bicycle=yes|designated an einem Arm der
 *  Vortrittsstrasse bzw. ein Fussweg (nicht Querung) mit bicycle=yes|designated höchstens VELO_TROTTOIR_M neben der Mitte des Bands.
 *  -> Tag als Text bzw. null */
const VELO_TROTTOIR_M = 5
function veloAufTrottoir(netz: OsmNetz, arme: { arm: ArmInfo; seite: 1 | -1 }[], querungen: OsmDaten['querungen'], mitte: P | null): string | null {
  const ja = (v: string | undefined) => v === 'yes' || v === 'designated'
  for (const { arm, seite } of arme) {
    if (arm.wid < 0 || !netz.W.has(arm.wid)) continue
    const t = netz.w(arm.wid).t
    // Seite der Zufahrt in Digitalisierrichtung des Wegs: links von u, wenn der Arm in Wegrichtung läuft
    const wl = (seite === 1) === (arm.sd > 0) ? 'left' : 'right'
    for (const key of ['sidewalk:bicycle', 'sidewalk:both:bicycle', `sidewalk:${wl}:bicycle`]) if (ja(t[key])) return `${key}=${t[key]}`
  }
  if (mitte) for (const w of querungen) {
    const tg = w.tags
    if (!['footway', 'path'].includes(tg.highway ?? '') || tg.footway === 'crossing' || tg.path === 'crossing' || !ja(tg.bicycle)) continue
    const l = w.geom.map(([la, lo]) => lv95(la, lo))
    if (l.slice(0, -1).some((q, i) => abstandStrecke(mitte, q, l[i + 1]) <= VELO_TROTTOIR_M)) return `Weg ${w.id} highway=${tg.highway} bicycle=${tg.bicycle}`
  }
  return null
}

/** Sicht von D auf eine Achse ab K (Velo, Trottoir; E3b): erfüllt ab A, sonst nicht erfüllt (Tab. 2 und 3 ohne Bereich). Hindernisse
 *  (nicht Gebäude der AV), in denen ein Zielpunkt bis A liegt, zählen nicht (die Achse läuft durch sie hindurch, z. B. ein Parkfeld
 *  breiter als der Parkstreifen-Abzug): Hinweis */
function sichtTeil(D: P, achse: P[], sMax: number, flaechenAlle: Verdeckend[], A: number): SichtTeil {
  const ziel: number[] = []
  for (let s = 0; s <= A + 1e-9; s += 0.5) ziel.push(s)
  const zp = punkteAufSpur(achse, ziel).map(x => x[0])
  const durch = flaechenAlle.filter(f => f.quelle && f.quelle !== 'AV' && zp.some(p => imPolygon(p, f.poly)))
  const flaechen = durch.length ? flaechenAlle.filter(f => !durch.includes(f)) : flaechenAlle
  const si = sichtEntlang(D, achse, sMax, flaechen, A)
  const vd = si.verdecker as Verdeckend | null
  const frei = Math.min(si.vorhanden, A)
  const ohneFlaechen = durch.map(f => f.id)
  const hinweise: string[] = durch.map(f => `Die Achse läuft bis A durch «${f.name}» (${f.quelle}): für diese Sicht nicht gerechnet; Lage ` +
    'prüfen (z. B. Parkfeld breiter als der angenommene Parkstreifen).')
  const pal = si.palisade
  if (pal && (pal.anteil > 0 || pal.zaehlt))
    hinweise.push(`Palisade (Bäume): ${Math.round(pal.anteil * 100)} % der Strecke bis A verdeckt, längste Strecke ${f1(pal.laengste)} m` +
      `${pal.zaehlt ? ` (ab ${f1(PALISADE_MIN_M)} m: zählt als Verdeckung)` : ''}.`)
  return { A, K: achse[0], achse: abschneiden(achse, sMax), sMax, sichtpunkte: si.punkte, sichtbar: si.sichtbar, vorhanden: si.vorhanden,
    bisEnde: si.bisEnde, status: si.vorhanden + 1e-6 >= A ? 'erfuellt' : 'nicht_erfuellt',
    verdecker: vd ? { id: vd.id, name: vd.name, art: vd.art ?? 'Gebäude', quelle: vd.quelle ?? 'AV', ring: vd.poly[0], sVerdeckt: si.sVerdeckt ?? 0 } : null,
    verdeckerListe: si.liste.map(t => ({ id: t.v.id, name: t.v.name, art: t.v.art ?? 'Gebäude', quelle: t.v.quelle ?? 'AV',
      wirkung: t.v.wirkung ?? 'voll', sErst: t.sErst, strecke: t.strecke, ring: t.v.poly[0] })), palisade: pal,
    dreieckFrei: sichtdreieck(D, achse, 0, frei), dreieckVerdeckt: si.vorhanden < A ? sichtdreieck(D, achse, si.vorhanden, A) : [], hinweise,
    ohneFlaechen }
}

/**
 * Vorschläge und amtliche Parkfelder für Panel und Karte: OSM-Parkierung im Sichtfeld (Dreieck bis zum Ende der Zielpunkte),
 * ohne die von amtlichen Feldern abgedeckte; Bäume aus dem Baumkataster und amtliche Felder bis reichweite vom Knoten. Ohne
 * verworfene (amtliche: getrennt aufgeführt) und ohne bestätigte (Id schon unter den Hindernissen).
 */
function hindernisStand(k: Kontext, hg: HindernisEingaben, kp: P, reichweite: number, richtungen: RichtungErgebnis[], D: P,
  inD: string[]): HindernisStand {
  const weg = new Set(hg.verworfen), da = new Set(hg.hindernisse.map(h => h.id))
  const offen = (id: string) => !weg.has(id) && !da.has(id)
  const felder = hg.park?.felder ?? []
  const dreiecke = richtungen.filter(r => r.achse.length >= 2).map(r => sichtdreieck(D, r.achse, 0, r.sMax))
  const osmAlle = parkVorschlaege(k.netz, k.fahrbahn, kp).filter(v => offen(v.id))
  // nur Auto-Felder beschreiben dieselbe Parkierung wie ein OSM-Streifen (Zweirad-Felder sind nur Hinweis)
  const ueberdeckt = osmUeberdeckt(osmAlle, felder.filter(f => f.klasse === 'auto').map(f => f.ring))
  const osm = osmAlle.filter(v => !ueberdeckt.has(v.id) && v.hindernis.art === 'parkfeld' && imSichtfeld(v.hindernis.ring, dreiecke))
  const baeume = hg.baeume ? baumVorschlaege(hg.baeume.baeume, kp, reichweite, hg.baeume.quellenangabe).filter(v => offen(v.id)) : []
  const amtlichAlle = hg.park ? parkKatasterFelder(felder, kp, reichweite, hg.park.quellenangabe) : []
  return { vorschlaege: [...osm, ...baeume], amtlich: amtlichAlle.filter(v => !weg.has(v.id)),
    amtlichVerworfen: amtlichAlle.filter(v => weg.has(v.id)), osmUeberdeckt: ueberdeckt.size, inD, reichweite: Math.round(reichweite) }
}

function richtungRechnen(k: Kontext, richtung: Richtung, lage: Lage, a: ArmInfo, ml: P[], ende: ArmEnde | null, qs: Querschnitt, zAchse: P[], D: P, kp: P,
  strasse: StrasseErgebnis, ns: NeigungStand, avRadius: number, hindernisse: Verdeckend[], park: ParkRaster | null,
  te0: TempoEingabe | null, amtlich: TempoAmtlichDaten | null, rvR: { wahr: Wahrnehmbarkeit } | { grund: string } | null, avZentrum: P, vs: VeloStand,
  ebikeVerboten: boolean): RichtungErgebnis {
  const { netz } = k
  const hinweise: string[] = []
  // Rechtsvortritt (E3c; Korrektur Punkt 24, 31.10.2026): Tempo wie sonst (OSM, Geoportal, von Hand); es wirkt nur auf die Velos
  // (Tab. 3), die Auto-Sicht folgt Abb. 6
  const rvWahr = rvR && 'wahr' in rvR ? rvR.wahr : null
  const te: TempoEingabe | null = te0
  const spur = richtung === 'links' ? 'nah' : 'fern'
  // Tempo: OSM des Arms, Mehrheit entlang der Achse über die massgebende Länge; ohne Angabe 50 km/h (Annahme); von Hand (E2b)
  const w = wegTempo(netz, a.wid)
  const [t, treffer] = tempoEntlang(netz, ml, w ? w[0] : TEMPO_ERSATZ, 0, x => sichtweiteA(x).massgebend)
  const tempoOsm = treffer ? t : w ? w[0] : TEMPO_ERSATZ
  // K0: amtliches Tempo (Stadt Bern V_sig) entlang derselben Linie vor OSM; ohne Treffer bleibt OSM
  const am = amtlich ? amtlichEntlang(netz, ml, tempoOsm, 0, x => sichtweiteA(x).massgebend, amtlich) : null
  const ta = am?.tempo ?? 0, trefferA = !!am?.treffer
  const vorgabeAnnahme = !trefferA && !treffer && !w
  // Rechtsvortritt ohne Angabe: 30 km/h wie die Norm (Ziffer 15) statt der allgemeinen Annahme TEMPO_ERSATZ
  const tempoVorgabe = trefferA ? ta : vorgabeAnnahme && rvR ? RV_TEMPO : tempoOsm
  const tempoVorgabeQuelle = vorgabeAnnahme && rvR ? `Annahme (ohne OSM-Angabe; beim Rechtsvortritt ${RV_TEMPO} km/h wie die Norm, Ziffer 15)` : trefferA ? `${amtlich!.quelle} (signalisierte Höchstgeschwindigkeit V_sig, Mehrheit entlang der Achse)` :
    vorgabeAnnahme ? `Annahme (ohne OSM-Angabe)` : w && tempoVorgabe === w[0] ? w[1] : 'OSM maxspeed (Mehrheit entlang der Achse)'
  if (trefferA && ta !== tempoOsm)
    hinweise.push(`Tempo ${ta} km/h laut ${amtlich!.quelle} (signalisierte Höchstgeschwindigkeit), OSM ${!treffer && !w ? 'ohne Angabe' :
      `${tempoOsm} km/h`}.`)
  else if (am && !trefferA && a.zufluss)
    hinweise.push(`${amtlich!.quelle}: ${!am.innen ? 'Richtung ausserhalb des geladenen Bereichs' : !am.wert && !am.leer ?
      'entlang dieser Richtung keine Linie' : `${am.wert} von ${am.wert + am.leer} Punkten an einer Linie mit Wert`}: Tempo aus OSM.`)
  const tempo = te ? te.wert : tempoVorgabe
  const tempoAnnahme = !te && vorgabeAnnahme
  const tempoQuelle = te ? `von Hand: ${TEMPO_ART_TEXT[te.art]}${te.begruendung.trim() ? ` (${te.begruendung.trim()})` : ''}` : tempoVorgabeQuelle
  if (te && te.art === 'signalisiert' && te.wert !== tempoVorgabe && !vorgabeAnnahme)
    hinweise.push(`Signalisiertes Tempo von Hand ${te.wert} km/h, ${trefferA ? amtlich!.quelle : 'OSM'} ${tempoVorgabe} km/h: Signalisation vor Ort prüfen.`)
  const sw0 = sichtweiteA(tempo, strasse.typ, strasse.ungunst, ns.i, ns.unbekannt)
  // Rechtsvortritt: massgebend die kleinste Sichtweite, die nach Abb. 6 nicht «zu sanieren» ist (sehr schlecht: keine, 25 m gezeigt),
  // oberer Wert die grösste Stufe der Abb. 6; Zielpunkte bis RV_ZIEL_M
  const rvMin = rvWahr ? rvMindest(rvWahr) : null
  const rvA = rvMin ? rvMin.zulaessig ?? ABB6_GRENZEN[2] : 0
  const sw = rvMin ? { ...sw0, massgebend: rvA, oben: ABB6_GRENZEN[2], typWert: RV_A_M, anhalteAngewendet: false, hinweise: [], hinweis: null,
    massgebendText: `Abb. 6, Wahrnehmbarkeit ${WAHRNEHMBARKEIT_TEXT[rvWahr!]}${rvMin.zulaessig === null ? ': keine Sichtweite genügt' :
      rvMin.zulaessig === rvMin.anzustreben ? '' : `; anzustreben ${rvMin.anzustreben ?? '–'} m`}`,
    typText: `Rechtsvortritt: ${RV_A_M} m anzustreben (Ziffer 16)` } : sw0
  if (ns.hinweis) hinweise.push(ns.hinweis)
  if (sw.hinweis) hinweise.push(sw.hinweis)
  if (rvWahr && tempo > RV_TEMPO)
    hinweise.push(`Tempo ${tempo} km/h: Die Norm geht beim Rechtsvortritt von ${RV_TEMPO} km/h aus (Ziffer 15, S. 10). Bei höherem Tempo ` +
      'fehlt eine Voraussetzung für den Rechtsvortritt; stufe die Wahrnehmbarkeit tiefer ein. Die Velos brauchen mehr Sicht (Tab. 3, S. 9).')
  hinweise.push(...sw.hinweise)
  if (rvMin && Math.abs(ns.i) > NEIGUNG_EBEN_PROZENT + 1e-9)
    hinweise.push(`Längsneigung ${fi(ns.i)} %: die Werte für den Rechtsvortritt gelten ohne Längsneigung (Ziffer 16); bei Gefälle ` +
      'mehr Sichtweite vorsehen (nicht gerechnet).')
  const sMax = rvMin ? RV_ZIEL_M : zielLaenge(sw)
  const rvGrund = rvR && 'grund' in rvR ? rvR.grund : null
  // Velo gegen die Einbahn (E4): Einbahn vom Knoten weg, aber Velozufluss (OSM-Tag); von dieser Seite kommen nur Velos (beim
  // Rechtsvortritt nur der Arm rechts, mit Tab. 3 bei 30 km/h)
  const nurVelo = !a.zufluss && a.veloZufluss && !rvGrund ? a.veloZuflussQuelle : null
  // Parkstreifen am rechten Rand dieses Verkehrs (vom Knoten bis zum Ende der Zielpunkte): Achse d neben dem Parkstreifen
  const ps: ParkStreifen = a.zufluss || nurVelo ? parkStreifen(sondenRechts(ml, qs, sMax), park) : KEIN_PARKSTREIFEN
  // Radstreifen (E3b): die Autoachse liegt d neben dem Radstreifen (Abzug RADSTREIFEN_M wie fgsCheck)
  const veloAbzug = vs.fuehrung === 'radstreifen' ? RADSTREIFEN_M : 0
  // Teilung der Fahrbahn mit anderer Veloführung auf der zuführenden Einbahn (vs.ab): Wert je Stelle, Übergang über VELO_WECHSEL_M
  const jeStelle = (wert: (f: Velofuehrung) => number) => (x: number) => !vs.ab ? wert(vs.fuehrung) :
    wert(vs.fuehrung) + (wert(vs.ab.fuehrung) - wert(vs.fuehrung)) * Math.max(0, Math.min(1, (x - vs.ab.s) / VELO_WECHSEL_M))
  const veloAbzugBei = jeStelle(f => (f === 'radstreifen' ? RADSTREIFEN_M : 0))
  const fa = mitVerlaengerung(vs.ab ? versetztVariabel(ml, x => randLinksBei(qs, x) - (D_MFZ_M + ps.abzug + veloAbzugBei(x))) :
    fahrstreifenAchse(ml, qs, D_MFZ_M + ps.abzug + veloAbzug))
  const abText = vs.ab ? `; ab der Teilung der Fahrbahn nach ${Math.round(vs.ab.s)} m ${VELOFUEHRUNG_TEXT[vs.ab.fuehrung]} (${vs.ab.quelle})` : ''
  const x = schnittBei(zAchse, fa, kp)
  let sK: number
  if (x) sK = x.sb
  else { sK = lot(fa, kp).s; hinweise.push('Kein Schnitt der Zufahrtsachse mit der Fahrstreifenachse: K als Lot vom Knoten.') }
  const achse = abBogen(fa, sK)
  const K = achse[0]
  const weit = a.zufluss ? Math.max(...abschneiden(achse, sMax).map(p => dist(avZentrum, p))) : 0
  if (weit > avRadius - 5)
    hinweise.push(`Zielpunkte reichen über den AV-Ausschnitt (±${avRadius} m) hinaus: weiter weg fehlen Gebäude` +
      (weit + AV_RESERVE_M > AV_MAX_M ? ` (nachgeladen wird höchstens ±${AV_MAX_M} m).` : '.'))
  const basis = { richtung, lage, arm: a.key, strasse: armText(a), spur, tempo, tempoQuelle, tempoAnnahme, tempoVorgabe, tempoVorgabeQuelle,
    tempoArt: te?.art ?? null, tempoBegruendung: te?.begruendung.trim() ?? '', stufe: sw.stufe,
    erforderlichUnten: sw.unten, erforderlichOben: sw.oben, zwischenwert: sw.zwischen, typStufe: sw.typStufe, typWert: sw.typWert,
    typText: sw.typText, neigung: sw.neigung, neigungVorgabe: ns.vorgabe, neigungHand: ns.hand,
    // ohne Verkehr von dieser Seite kein Profil (dann auch nicht «unbekannt»)
    neigungUnbekannt: ((a.zufluss && !rvGrund) || !!nurVelo) && ns.unbekannt,
    neigungVorgabeUnbekannt: ((a.zufluss && !rvGrund) || !!nurVelo) && ns.vorgabeUnbekannt,
    neigungQuelle: (a.zufluss && !rvGrund) || nurVelo || ns.hand ? ns.quelle : rvGrund ? 'entfällt: diese Richtung wird beim Rechtsvortritt nicht geprüft' :
      'kein Verkehr von dieser Seite: ohne Profil',
    neigungVorgabeQuelle: (a.zufluss && !rvGrund) || nurVelo ? ns.vorgabeQuelle : rvGrund ? 'entfällt: diese Richtung wird beim Rechtsvortritt nicht geprüft' :
      'kein Verkehr von dieser Seite: ohne Profil',
    anhalte: sw.anhalte, anhalteAngewendet: sw.anhalteAngewendet,
    massgebend: sw.massgebend, massgebendText: sw.massgebendText, sMax, K, randAbstand: D_MFZ_M + ps.abzug + veloAbzug,
    lageQuelle: `${qs.quelle}; ${parkStreifenText(ps)}${veloAbzug ? `; Radstreifen ${f2(RADSTREIFEN_M)} m (Annahme), Achse ${f2(D_MFZ_M)} m ` +
      'daneben' : ''}${abText}`, parkStreifen: ps,
    veloFuehrung: vs.fuehrung, veloVorgabe: vs.vorgabe, veloVorgabeQuelle: vs.quelle, veloGewaehlt: vs.gewaehlt } as const
  // Veloverkehr (E3b, Ziffer 13.3): Veloachse je Führung, Tab. 3 nach der zulässigen Höchstgeschwindigkeit und der Neigung
  // Velo gegen die Einbahn (E4): dieselbe Achse am für das Velo rechten Rand (aus Sicht des Autoverkehrs dem linken)
  const veloRechnen = (): VeloErgebnis | null => {
    if (vs.fuehrung === 'kein') return null
    const rw = vs.radweg
    // Abstand der Veloachse vom rechten Rand (Mischverkehr, Radstreifen, Radweg ohne OSM-Linie); Rand je Stelle (Entscheid
    // 31.10.2026). Radweg aus OSM: feste Lage seiner Linie
    const vomRand = vs.fuehrung === 'misch' ? ps.abzug + D_VELO_M : vs.fuehrung === 'radstreifen' ? ps.abzug + RADSTREIFEN_M / 2 :
      !rw!.id ? -RADWEG_BREITE_M / 2 : null
    // Teilung mit anderer Führung auf der zuführenden Einbahn (vs.ab: nur Mischverkehr und Radstreifen)
    const vomRandBei = jeStelle(f => ps.abzug + (f === 'radstreifen' ? RADSTREIFEN_M / 2 : D_VELO_M))
    const versatz = vomRand !== null ? qs.links - vomRand : rw!.versatz
    const lageText0 = vs.fuehrung === 'misch' ? `${f2(D_VELO_M)} m vom rechten Fahrbahnrand${ps.abzug ? ' neben dem Parkstreifen' : ''} (Mischverkehr)` :
      vs.fuehrung === 'radstreifen' ? `Mitte des Radstreifens, ${f2(ps.abzug + RADSTREIFEN_M / 2)} m vom rechten Fahrbahnrand` :
      rw!.id ? `Achse des Radwegs (OSM-Weg ${rw!.id}${rw!.eigeneSeite ? '' : ', gegenüber, in beiden Richtungen'}), ${f2(Math.abs(rw!.versatz) -
        (rw!.eigeneSeite ? qs.links : qs.rechts))} m ${rw!.eigeneSeite ? 'neben dem rechten' : 'neben dem linken'} Fahrbahnrand` :
      `Achse des Radwegs ohne OSM-Linie: ${f2(RADWEG_BREITE_M)} m breit direkt am Fahrbahnrand angenommen`
    const lageText = (!nurVelo ? lageText0 : (vs.fuehrung === 'radstreifen' ? lageText0.replace('Mitte des Radstreifens',
      'Mitte des Gegenverkehrsstreifens') : lageText0) + '; Velo gegen die Einbahn: am für das Velo rechten, aus Sicht des Autoverkehrs ' +
      'linken Fahrbahnrand') + (vs.ab ? `; ab der Teilung der Fahrbahn nach ${Math.round(vs.ab.s)} m ${vs.ab.fuehrung === 'misch' ?
      `${f2(D_VELO_M)} m vom rechten Fahrbahnrand (Mischverkehr)` : `Mitte des Radstreifens`} (${vs.ab.quelle})` : '')
    const va = mitVerlaengerung(vomRand !== null ? versetztVariabel(ml, s => randLinksBei(qs, s) - (vs.ab ? vomRandBei(s) : vomRand)) :
      versetzt(ml, versatz))
    const xv = schnittBei(zAchse, va, kp)
    const achseV = abBogen(va, xv ? xv.sb : lot(va, kp).s)
    // zulässige Höchstgeschwindigkeit: signalisiert von Hand bzw. OSM (V85, VP und fahrbares Tempo ändern die Zeile nicht)
    const vt = te && te.art !== 'signalisiert' ? tempoVorgabe : tempo
    const vsw = veloSichtweite(vt, ns.i, ebikeVerboten, ns.unbekannt)
    const teil = sichtTeil(D, achseV, Math.ceil(ZIEL_FAKTOR * vsw.A), [...k.gebaeude, ...hindernisse], vsw.A)
    const vh = [...teil.hinweise]
    if (!xv) vh.push('Kein Schnitt der Zufahrtsachse mit der Veloachse: Anfang als Lot vom Knoten.')
    if (te && te.art !== 'signalisiert') vh.push(`Tab. 3 nach der zulässigen Höchstgeschwindigkeit ${vt} km/h (${tempoVorgabeQuelle}), nicht nach dem Tempo von Hand.`)
    if (ebikeVerboten && vt <= 30) vh.push('«Schnelle E-Bikes verboten» gilt nur über 30 km/h: ohne Wirkung.')
    const kurve = richtungsAenderung(achseV, vsw.A)
    if (kurve > KURVE_GRAD) vh.push(`Veloachse in einer Kurve (Richtungsänderung rund ${Math.round(kurve)}° bis A): A darf nach Ziffer 13.3 ` +
      'reduziert werden, wenn die gefahrenen Geschwindigkeiten tiefer sind; nicht gerechnet.')
    return { ...teil, fuehrung: vs.fuehrung, lageText, randAbstand: qs.links - versatz, radweg: rw, tempo: vt,
      tempoQuelle: vt === tempo ? tempoQuelle : tempoVorgabeQuelle, neigung: ns.i, neigungUnbekannt: ns.unbekannt, text: vsw.text, ebike: vsw.ebike, hinweise: vh }
  }
  // Befund 31.10.2026 (Knoten 132629283): liegt der Zielpunkt bei A (Auto bzw. Velo; der Überholfall hat dasselbe A wie das Auto) auf dem
  // gerade verlängerten Stück der Mittellinie, Hinweis ohne Statuswirkung
  const ueberEnde = (linie: P[], s: number) => {
    const bisA = abschneiden(linie, s)
    return !!ende && linie.length >= 2 && lot(ml, bisA[bisA.length - 1]).s > ende.geradeAb + 1e-6
  }
  const endeHinweis = (velo: VeloErgebnis | null, autoA: number | null) =>
    ende && ((autoA !== null && ueberEnde(achse, autoA)) || (velo && ueberEnde(velo.achse, velo.A))) ? [armEndeText(a, ende)] : []
  if (!a.zufluss || rvGrund) {
    // ohne Motorfahrzeuge von dieser Seite; mit Velo gegen die Einbahn die Velo-Prüfung, Profil der Neigung auf der Veloachse
    const velo = nurVelo ? veloRechnen() : null
    if (!rvGrund) hinweise.push(...endeHinweis(velo, null))
    return { ...basis, vorhanden: 0, bisEnde: false, status: 'keine_zufahrt', statusZusatz: [], verdecker: null, verdeckerListe: [],
      palisade: null, achse: [], sichtpunkte: [], sichtbar: [], profilLinie: velo ? abschneiden(velo.achse, Math.max(PROFIL_MIN_M, velo.A)) : [],
      velo, gesamt: 'keine_zufahrt', gesamtFehlt: [], dreieck: [], dreieckFrei: [], dreieckVerdeckt: [],
      hinweise: [...hinweise, nurVelo ? `Einbahn vom Knoten weg: von dieser Seite kommen nur Velos (OSM ${nurVelo}).` :
        !a.zufluss ? 'Einbahn vom Knoten weg: von dieser Seite kommt kein Verkehr.' : `${rvGrund}.`],
      ...(rvGrund ? { keinGrund: rvGrund, rvKeine: true } : nurVelo ? { keinGrund: 'nur Velos (Einbahn vom Knoten weg)', veloGegen: nurVelo } : {}) }
  }
  // Rechtsvortritt: Sichtdreieck und Liste der Verdecker bis zum anzustrebenden Wert (mindestens RV_A_M), auch wenn weniger zulässig ist
  const A = rvWahr ? Math.max(sw.massgebend, RV_A_M) : sw.massgebend
  const si = sichtEntlang(D, achse, sMax, [...k.gebaeude, ...hindernisse], A)
  // Rechtsvortritt: Status nach Abb. 6 (anzustreben = erfüllt, zulässig = «massgebend», zu sanieren = nicht erfüllt)
  const zustand: Zustand | null = rvWahr ? zustandAbb6(rvWahr, si.vorhanden) : null
  const status = zustand ? ZUSTAND_STATUS[zustand] : sichtStatus(si.vorhanden, sw)
  const frei = Math.min(si.vorhanden, A)
  const vd = si.verdecker as Verdeckend | null
  const verdeckerListe: VerdeckerEintrag[] = si.liste.map(t => ({ id: t.v.id, name: t.v.name, art: t.v.art ?? 'Gebäude',
    quelle: t.v.quelle ?? 'AV', wirkung: t.v.wirkung ?? 'voll', sErst: t.sErst, strecke: t.strecke, ring: t.v.poly[0] }))
  // Statuszusatz und Hinweise zu Zweirädern, durchlässigen Zäunen und zur Palisade (ohne Statuswirkung)
  const statusZusatz: string[] = zustand ? [`Abb. 6: ${ZUSTAND_TEXT[zustand]}`] : []
  const hinweisArt = (f: (t: VerdeckerEintrag) => boolean) => verdeckerListe.filter(t => t.wirkung === 'hinweis' && f(t))
  const zweirad = hinweisArt(t => t.art.startsWith('Parkfeld'))
  if (zweirad.length) {
    statusZusatz.push('Hinweis: Zweiräder')
    hinweise.push(`Zweiräder im Sichtfeld, prüfen: ${zweirad.map(t => `${t.name} ab ${f1(t.sErst)} m`).join('; ')} (Velo- und ` +
      'Motorrad-Parkfelder ohne Statuswirkung).')
  }
  const zaun = hinweisArt(t => t.art.startsWith('Zaun'))
  if (zaun.length) {
    statusZusatz.push('Hinweis: Zaun')
    hinweise.push(`Sichtdurchlässiger Zaun bzw. Geländer im Sichtfeld ab ${f1(zaun[0].sErst)} m: Durchsicht vor Ort prüfen (Palisadenwirkung, ` +
      'VSS 40 273 Ziffer 11).')
  }
  const pal = si.palisade
  if (pal && (pal.anteil > 0 || pal.zaehlt)) {
    const proz = Math.round(pal.anteil * 100)
    if (!pal.zaehlt) statusZusatz.push(`Hinweis: Palisade ${proz} %`)
    const wertung = pal.zaehlt ? `(ab ${f1(PALISADE_MIN_M)} m: zählt als Verdeckung, Sichtweite endet davor)` :
      pal.hinterVoll ? '(liegt hinter der ersten vollen Verdeckung: ohne Wirkung)' :
      `(unter ${f1(PALISADE_MIN_M)} m: zählt nicht als Verdeckung)`
    hinweise.push(`Palisade (Bäume, VSS 40 273 Ziffer 11, Abb. 3): ${proz} % der Strecke bis A verdeckt, längste zusammenhängend verdeckte ` +
      `Strecke bis A ${f1(pal.laengste)} m ${wertung}.` + (pal.beiA ? ' Der Zielpunkt bei A liegt im Schatten eines ' +
      'Stamms: Sichtbarkeit des Fahrzeugs bei A vor Ort prüfen.' : ''))
  }
  const velo = veloRechnen()
  hinweise.push(...endeHinweis(velo, A))
  return {
    ...basis, vorhanden: si.vorhanden, bisEnde: si.bisEnde, status, statusZusatz, verdeckerListe, palisade: pal, velo,
    gesamt: status, gesamtFehlt: status === 'nicht_erfuellt' ? ['Auto'] : [], ...(rvWahr ? { rv: true } : {}),
    verdecker: vd ? { id: vd.id, name: vd.name, art: vd.art ?? 'Gebäude', quelle: vd.quelle ?? 'AV', ring: vd.poly[0],
      sVerdeckt: si.sVerdeckt ?? 0 } : null,
    achse: abschneiden(achse, sMax), sichtpunkte: si.punkte, sichtbar: si.sichtbar,
    profilLinie: abschneiden(achse, Math.max(PROFIL_MIN_M, A)),
    dreieck: sichtdreieck(D, achse, 0, A), dreieckFrei: sichtdreieck(D, achse, 0, frei),
    dreieckVerdeckt: si.vorhanden < A ? sichtdreieck(D, achse, si.vorhanden, A) : [],
    hinweise,
  }
}
