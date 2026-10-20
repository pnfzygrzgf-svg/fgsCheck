// ── Bedarfsmodul E1: Felder der Eingabemaske und der Fall-Datei ──
//
// Jedes Eingabefeld aus eingaben.ts (Werte) erscheint hier mit Gruppe (Blöcke der Skizze: Rahmen, Nachfrage, Verkehr, Lage,
// Insel, Ausrüstung, LSA-Zeiten, Trottoirüberfahrt), Beschriftung und Art. Objekt-Felder (insel, haltestelle, hvl …) sind in
// ihre Unterfelder zerlegt (Pfad «insel.breite»): so prüft die Fall-Datei jedes Unterfeld einzeln (offener Punkt aus E0: bisher
// nur das Objekt als Ganzes), und die Maske kann ein Unterfeld von Hand setzen, während die übrigen vorbelegt bleiben.
// Abgeleitet und nicht in der Maske: fgQuelle (aus Zählung bzw. Schätzklasse).
// Kein Normtext: nur eigene Kurztexte.

import type { FeldName } from './eingaben'

export type GruppeId = 'rahmen' | 'nachfrage' | 'verkehr' | 'lage' | 'insel' | 'ausruestung' | 'lsa' | 'q3'
export const GRUPPEN: { id: GruppeId; name: string }[] = [
  { id: 'rahmen', name: 'Rahmen' }, { id: 'nachfrage', name: 'Nachfrage' }, { id: 'verkehr', name: 'Verkehr' },
  { id: 'lage', name: 'Lage' }, { id: 'insel', name: 'Insel' }, { id: 'ausruestung', name: 'Ausrüstung' },
  { id: 'lsa', name: 'LSA-Zeiten' }, { id: 'q3', name: 'Trottoirüberfahrt' },
]
export const gruppenName = (g: GruppeId): string => GRUPPEN.find(x => x.id === g)!.name

/** Art eines Felds in der Maske. zahlen: Liste von Zahlen («7,0 / 6,5»); n = feste Anzahl. liste: Mehrfachwahl (beduerfnis) */
export type FeldArt =
  | { art: 'bool' }
  | { art: 'zahl'; einheit?: string; min?: number; max?: number }
  | { art: 'zahlen'; einheit?: string; n?: number; min?: number; max?: number }
  | { art: 'wahl'; optionen: [string, string][] }
  | { art: 'liste'; optionen: [string, string][] }

export interface FeldDef {
  /** Feldname bzw. «objekt.unterfeld» */
  pfad: string
  gruppe: GruppeId
  name: string
  art: FeldArt
  /** Vorgabe für die Quelle einer Handeingabe (fgKlasse: Schätzung, Entscheid 5) */
  quelle?: 'schaetzung'
  /** kurzer Hilfetext (Tooltip) */
  hilfe?: string
}

const B: FeldArt = { art: 'bool' }
const m = (min = 0, max = 500): FeldArt => ({ art: 'zahl', einheit: 'm', min, max })
const ms = (n?: number, max = 100): FeldArt => ({ art: 'zahlen', einheit: 'm', n, min: 0, max })
const s = (max = 300): FeldArt => ({ art: 'zahl', einheit: 's', min: 0, max })
const w = (...o: [string, string][]): FeldArt => ({ art: 'wahl', optionen: o })

export const FELD_DEFS: FeldDef[] = [
  // ── Rahmen ──
  { pfad: 'typ', gruppe: 'rahmen', name: 'Querungstyp der Anlage (Bestand bzw. Planung)', art: w(['fgs', 'Fussgängerstreifen'],
    ['lsa', 'Fussgängerstreifen mit Lichtsignal'], ['furt', 'Furt (Insel ohne Balken, ohne Vortritt)'],
    ['ohne_vortritt', 'Querung ohne Vortritt (Nase, Einengung, ohne Massnahme)'], ['trottoirueberfahrt', 'Trottoirüberfahrt'],
    ['mehrzweck', 'Mehrzweckstreifen']), hilfe: 'Vorbelegt aus der Querungsart der Streifen (Fussgängerstreifen bzw. ohne Vortritt)' },
  { pfad: 'innerorts', gruppe: 'rahmen', name: 'innerorts', art: B },
  { pfad: 'vSig', gruppe: 'rahmen', name: 'Signalisiertes Tempo', art: { art: 'zahl', einheit: 'km/h', min: 5, max: 120 } },
  { pfad: 'tempoRegime', gruppe: 'rahmen', name: 'Tempo-Regime', art: w(['strecke', 'Strecke'], ['t30_zone', 'Tempo-30-Zone'],
    ['begegnungszone', 'Begegnungszone']) },
  { pfad: 'zoneVerkehrsorientiert', gruppe: 'rahmen', name: 'verkehrsorientierte Strasse in der Zone eingebettet', art: B },
  { pfad: 'v85', gruppe: 'rahmen', name: 'V85', art: { art: 'zahl', einheit: 'km/h', min: 5, max: 150 } },
  { pfad: 'v85Nachweis', gruppe: 'rahmen', name: 'V85 gemessen (Nachweis)', art: B },
  { pfad: 'anzeichenSchneller', gruppe: 'rahmen', name: 'Anzeichen für schnelleres Fahren', art: B },
  { pfad: 'strassentyp', gruppe: 'rahmen', name: 'Strassentyp', art: w(['verkehrsorientiert', 'verkehrsorientiert'],
    ['siedlungsorientiert', 'siedlungsorientiert']) },
  { pfad: 'ohneBaulich', gruppe: 'rahmen', name: 'Querung ohne bauliche Massnahme', art: B },
  { pfad: 'neuanlage', gruppe: 'rahmen', name: 'Neuanlage', art: B },
  { pfad: 'kantonsstrasse', gruppe: 'rahmen', name: 'Kantonsstrasse', art: B },

  // ── Nachfrage ──
  { pfad: 'fg5h', gruppe: 'nachfrage', name: 'Fussgänger in den 5 Spitzenstunden (Zählung)', art: { art: 'zahl', min: 0, max: 100000 },
    hilfe: 'Eine Zählung geht der Schätzklasse vor' },
  { pfad: 'fgKlasse', gruppe: 'nachfrage', name: 'Fussgänger, Schätzklasse (5 Spitzenstunden)', art: w(['<100', 'unter 100'],
    ['100-500', '100 bis 500'], ['>500', 'über 500']), quelle: 'schaetzung' },
  { pfad: 'fgSehrHoch', gruppe: 'nachfrage', name: 'sehr viele Fussgänger (behindern den Verkehr)', art: B },
  { pfad: 'netz', gruppe: 'nachfrage', name: 'Netzstufe Fusswegnetz', art: w(['basisnetz', 'Basisnetz'],
    ['publikumsintensiv', 'publikumsintensiv'], ['feinverteiler', 'Feinverteiler'], ['keins', 'nicht im Netz']) },
  { pfad: 'netzQualifiziert', gruppe: 'nachfrage', name: 'Teil einer qualifizierten Fusswegnetzplanung', art: B },
  { pfad: 'beduerfnis', gruppe: 'nachfrage', name: 'Besonderes Vortrittsbedürfnis', art: { art: 'liste', optionen: [['schule', 'Schule'],
    ['kindergarten', 'Kindergarten'], ['heim', 'Heim'], ['haltestelle', 'Haltestelle'], ['schulweg', 'Schulweg']] } },
  { pfad: 'nachfrage', gruppe: 'nachfrage', name: 'Querungsnachfrage', art: w(['punktuell', 'punktuell (gebündelt)'], ['flaechig', 'flächig']) },
  { pfad: 'wunschlinieM', gruppe: 'nachfrage', name: 'Abstand zur Wunschlinie', art: m() },
  { pfad: 'fusswegAchse.rechtwinkligUneinsehbar', gruppe: 'nachfrage', name: 'Fussweg in der Achse, rechtwinklig und nicht einsehbar', art: B },
  { pfad: 'fusswegAchse.versatz', gruppe: 'nachfrage', name: 'Fussweg: Versatz vorhanden', art: B },
  { pfad: 'fusswegAchse.umlaufschranke', gruppe: 'nachfrage', name: 'Fussweg: Umlaufschranke vorhanden', art: B },

  // ── Verkehr ──
  { pfad: 'dtv', gruppe: 'verkehr', name: 'DTV', art: { art: 'zahl', einheit: 'Fz/Tag', min: 0, max: 200000 } },
  { pfad: 'starkBelastet', gruppe: 'verkehr', name: 'stark belastete Strasse (Handangabe)', art: B },
  { pfad: 'mivKlasse', gruppe: 'verkehr', name: 'Motorfahrzeugverkehr', art: w(['tief', 'wenig'], ['mittel', 'mittel'], ['hoch', 'viel']) },
  { pfad: 'zweirichtung', gruppe: 'verkehr', name: 'Gegenverkehr (Zweirichtung)', art: B },
  { pfad: 'nRichtung', gruppe: 'verkehr', name: 'Fahrstreifen je Richtung (ohne Radstreifen, mit Busstreifen)', art: { art: 'zahlen', min: 1, max: 6 } },
  { pfad: 'radstreifen', gruppe: 'verkehr', name: 'Radstreifen', art: B },
  { pfad: 'busspur', gruppe: 'verkehr', name: 'Busstreifen', art: B },
  { pfad: 'busDurchmarkiert', gruppe: 'verkehr', name: 'Streifen über den Busstreifen durchmarkiert', art: B },
  { pfad: 'tram', gruppe: 'verkehr', name: 'Tram', art: w(['keins', 'kein Tram'], ['eigentrassee', 'auf Eigentrassee'], ['fahrbahn', 'auf der Fahrbahn']) },
  { pfad: 'tramHaltestellenbereich', gruppe: 'verkehr', name: 'im Haltestellenbereich des Trams', art: B },
  { pfad: 'balkenAufGleis', gruppe: 'verkehr', name: 'Balken über die Gleise markiert', art: B },

  // ── Lage ──
  { pfad: 'lage', gruppe: 'lage', name: 'Lage', art: w(['strecke', 'Strecke'], ['knoten_berechtigt', 'Knoten, vortrittsberechtigte Achse'],
    ['knoten_belastet', 'Knoten, vortrittsbelastete Zufahrt'], ['einmuendung', 'über eine einmündende Strasse'], ['kreisel', 'Kreisel']) },
  { pfad: 'knotenArmeOhneQuerung', gruppe: 'lage', name: 'Knotenarme ohne Querung', art: { art: 'zahl', min: 0, max: 8 } },
  { pfad: 'knotenLsa', gruppe: 'lage', name: 'Knoten mit Lichtsignal', art: B },
  { pfad: 'alleZufahrtsstreifenBelastet', gruppe: 'lage', name: 'alle Fahrstreifen der Zufahrt vortrittsbelastet', art: B },
  { pfad: 'fahrbahnB', gruppe: 'lage', name: 'Fahrbahnbreite B (Bord–Bord entlang der Achse)', art: m(0, 60) },
  { pfad: 'querdistanzL', gruppe: 'lage', name: 'Querdistanz je Teilquerung L', art: ms(undefined, 60) },
  { pfad: 'abstandFgsM', gruppe: 'lage', name: 'Abstand zum nächsten Fussgängerstreifen', art: m(0, 5000) },
  { pfad: 'abstandLsaM', gruppe: 'lage', name: 'Abstand zur nächsten LSA', art: m(0, 5000) },
  { pfad: 'verzweigung', gruppe: 'lage', name: 'an einer Verzweigung', art: B },
  { pfad: 'verzweigungErkennbar', gruppe: 'lage', name: 'Verzweigung erkennbar', art: B },
  { pfad: 'haltestelleAngrenzend', gruppe: 'lage', name: 'Haltestelle angrenzend', art: B },
  { pfad: 'haltestelle.art', gruppe: 'lage', name: 'Bushaltestelle', art: w(['keine', 'keine'], ['fahrbahn', 'Fahrbahnhaltestelle'], ['bucht', 'Busbucht']) },
  { pfad: 'haltestelle.lage', gruppe: 'lage', name: 'Lage zur Haltestelle', art: w(['fgs_nach_halt', 'nach dem Haltebereich'],
    ['fgs_vor_halt', 'vor dem Haltebereich'], ['im_bereich', 'im Haltestellenbereich']) },
  { pfad: 'haltestelle.verdeckt', gruppe: 'lage', name: 'haltender Bus verdeckt die Querenden', art: B },
  { pfad: 'haltestelle.ueberholenUnterbunden', gruppe: 'lage', name: 'Überholen des haltenden Busses unterbunden', art: B },
  { pfad: 'rueckversatzM', gruppe: 'lage', name: 'Rückversatz ab der vortrittsberechtigten Fahrbahn', art: m(0, 100) },
  { pfad: 'laengsparkierung', gruppe: 'lage', name: 'Längsparkierung an der Querung', art: B },
  { pfad: 'seitenraumVorParklinieM', gruppe: 'lage', name: 'Seitenraum vor (+) bzw. hinter (−) der Parklinie', art: m(-5, 5) },
  { pfad: 'einengung', gruppe: 'lage', name: 'Nase bzw. Einengung', art: B },
  { pfad: 'restbreiteM', gruppe: 'lage', name: 'Restbreite an der Einengung', art: m(0, 30) },
  { pfad: 'einengungLaengeM', gruppe: 'lage', name: 'Länge der Einengung', art: m(0, 100) },
  { pfad: 'mzsBreiteM', gruppe: 'lage', name: 'Breite Mehrzweckstreifen', art: m(0, 10) },
  { pfad: 'mzsMitFgs', gruppe: 'lage', name: 'Fussgängerstreifen über den Mehrzweckstreifen', art: B },
  { pfad: 'kurve.radius', gruppe: 'lage', name: 'Kurvenradius vor dem Streifen', art: m(0, 1000) },
  { pfad: 'kurve.fuenfBedingungen', gruppe: 'lage', name: 'Voraussetzungen für die Sichtweite nach Kurvenradius erfüllt', art: B },
  { pfad: 'sichtVorh', gruppe: 'lage', name: 'vorhandene Sichtweite je Zufahrt (von Hand; ersetzt den Sichtrechner)', art: ms(undefined, 500),
    hilfe: 'Leer: der Befund übernimmt das Ergebnis des Sichtrechners (frei bzw. verdeckt)' },
  { pfad: 'erkennungM', gruppe: 'lage', name: 'Erkennungsdistanz', art: m(0, 1000) },

  // ── Insel ──
  { pfad: 'insel.vorhanden', gruppe: 'insel', name: 'Insel vorhanden', art: B },
  { pfad: 'insel.art', gruppe: 'insel', name: 'Art der Insel', art: w(['baulich', 'baulich (erhöht)'], ['markiert', 'nur markiert']),
    hilfe: 'Nur markiert: für die Querung ohne Vortritt gilt die ganze Fahrbahn als Querdistanz' },
  { pfad: 'insel.breite', gruppe: 'insel', name: 'Inseltiefe (quer zur Fahrbahn)', art: m(0, 20) },
  { pfad: 'insel.kopfUeberstand', gruppe: 'insel', name: 'Inselkopf über den Streifenrand (je Seite)', art: ms(2, 20) },
  { pfad: 'insel.vertikal', gruppe: 'insel', name: 'vertikales Element auf der Insel', art: B },
  { pfad: 'insel.kopfErhoeht', gruppe: 'insel', name: 'Inselköpfe erhöht', art: B },
  { pfad: 'insel.pfostenH', gruppe: 'insel', name: 'Höhe der Inselpfosten', art: m(0, 5) },
  { pfad: 'insel.furt', gruppe: 'insel', name: 'Rollstuhlfurt', art: m(0, 5) },
  { pfad: 'inselMoeglich', gruppe: 'insel', name: 'Platz für eine Insel', art: B },
  { pfad: 'durchfahrt', gruppe: 'insel', name: 'Durchfahrt neben der Insel (je Seite, quer)', art: ms(undefined, 30) },

  // ── Ausrüstung ──
  { pfad: 'fgsMitLsa', gruppe: 'ausruestung', name: 'mit Lichtsignal', art: B },
  { pfad: 'streifenBreite', gruppe: 'ausruestung', name: 'Streifenbreite (Balkenlänge)', art: m(0, 20) },
  { pfad: 'randAbstand', gruppe: 'ausruestung', name: 'Abstand äusserster Balken bis Trottoirkante', art: ms(undefined, 10) },
  { pfad: 'achsWinkel', gruppe: 'ausruestung', name: 'Winkel zur Fahrbahn (90 = rechtwinklig)', art: { art: 'zahl', einheit: '°', min: 0, max: 90 } },
  { pfad: 'signal411', gruppe: 'ausruestung', name: 'Signal 4.11', art: B },
  { pfad: 'signal411Insel', gruppe: 'ausruestung', name: 'Signal 4.11 auf der Insel', art: B },
  { pfad: 'beleuchtung', gruppe: 'ausruestung', name: 'Beleuchtung', art: B },
  { pfad: 'schattenfrei', gruppe: 'ausruestung', name: 'ohne Schatten auf Streifen und Annäherungsbereich', art: B },
  { pfad: 'hvl.vorhanden', gruppe: 'ausruestung', name: 'Halteverbotslinie', art: B },
  { pfad: 'hvl.laengeM', gruppe: 'ausruestung', name: 'Länge der Halteverbotslinie', art: m(0, 200) },
  { pfad: 'hvl.beidseits', gruppe: 'ausruestung', name: 'Halteverbotslinie beidseits (Einbahn)', art: B },
  { pfad: 'hvlBedarfM', gruppe: 'ausruestung', name: 'Länge nach Sichtbedarf', art: m(0, 200) },
  { pfad: 'haltenSichtrelevantUeber5m', gruppe: 'ausruestung', name: 'Halten weiter als 5 m vor dem Streifen stört die Sicht', art: B },
  { pfad: 'haltenSonstVerboten', gruppe: 'ausruestung', name: 'Halten sonst verboten', art: B },
  { pfad: 'reklameUnter20m', gruppe: 'ausruestung', name: 'verkehrsgerichtete Reklame näher als 20 m', art: B },
  { pfad: 'reklameAusnahme', gruppe: 'ausruestung', name: 'Reklame als Ausnahme zulässig', art: B },
  { pfad: 'annaeherungUeberfahrbar', gruppe: 'ausruestung', name: 'Annäherungsbereich überfahrbar', art: B },
  { pfad: 'einAusfahrtNah', gruppe: 'ausruestung', name: 'Ein- bzw. Ausfahrt unmittelbar beim Streifen', art: B },
  { pfad: 'blinklicht', gruppe: 'ausruestung', name: 'Blinklicht', art: w(['keins', 'keines'], ['gelb_ssv', 'gelbes Blinklicht (SSV)'],
    ['nicht_ssv', 'Warnlicht ausserhalb der SSV']) },
  { pfad: 'randabschluss.art', gruppe: 'ausruestung', name: 'Randabschluss an der Querung', art: w(['vertikal', 'vertikal'], ['schraeg', 'schräg'], ['hoch', 'hoch']) },
  { pfad: 'randabschluss.hoeheMm', gruppe: 'ausruestung', name: 'Höhe des Randabschlusses', art: { art: 'zahl', einheit: 'mm', min: 0, max: 300 } },
  { pfad: 'randabschluss.breiteM', gruppe: 'ausruestung', name: 'Breite des schrägen Absatzes', art: m(0, 2) },
  { pfad: 'quergefaelle', gruppe: 'ausruestung', name: 'Quergefälle', art: { art: 'zahl', einheit: '%', min: 0, max: 30 } },
  { pfad: 'absenkung', gruppe: 'ausruestung', name: 'Trottoirabsenkung (0 = keine)', art: { art: 'zahl', einheit: '%', min: 0, max: 30 } },
  { pfad: 'taktil', gruppe: 'ausruestung', name: 'taktil-visuelle Markierung', art: B },
  { pfad: 'leitlinie', gruppe: 'ausruestung', name: 'taktile Leitlinie', art: B },
  { pfad: 'querungLang', gruppe: 'ausruestung', name: 'lange Querung (Handangabe)', art: B },
  { pfad: 'absenkungBeidseits', gruppe: 'ausruestung', name: 'Absenkung beidseits', art: B },
  { pfad: 'aufstellflaeche', gruppe: 'ausruestung', name: 'Aufstellflächen vorhanden', art: B },
  { pfad: 'parkierungSichtbehindernd', gruppe: 'ausruestung', name: 'Parkierung behindert die Sicht', art: B },

  // ── LSA-Zeiten ──
  { pfad: 'lsaZeiten.L', gruppe: 'lsa', name: 'Querung Bord–Bord', art: m(0, 100) },
  { pfad: 'lsaZeiten.teile', gruppe: 'lsa', name: 'Teilquerungen an der Insel', art: ms(2, 60) },
  { pfad: 'lsaZeiten.inselB', gruppe: 'lsa', name: 'Inselbreite', art: m(0, 20) },
  { pfad: 'lsaZeiten.gelb', gruppe: 'lsa', name: 'Gelb Fussverkehr', art: s(30) },
  { pfad: 'lsaZeiten.freigabe', gruppe: 'lsa', name: 'Freigabe Fussverkehr', art: s(120) },
  { pfad: 'lsaZeiten.phasengleich', gruppe: 'lsa', name: 'beide Teilquerungen in einer Phase', art: B },
  { pfad: 'lsaZeiten.beideRichtungenImZyklus', gruppe: 'lsa', name: 'beide Richtungen im selben Umlauf', art: B },
  { pfad: 'lsaZeiten.wartezeit', gruppe: 'lsa', name: 'Wartezeit', art: s(300) },
  { pfad: 'lsaZeiten.vorstart', gruppe: 'lsa', name: 'Vorstart Fussverkehr', art: { art: 'zahl', einheit: 's', min: -10, max: 30 } },
  { pfad: 'lsaZeiten.abbiegerKonflikt', gruppe: 'lsa', name: 'Konflikt mit Abbiegenden', art: B },
  { pfad: 'lsaZeiten.inselGeraet', gruppe: 'lsa', name: 'Anforderungsgerät auf der Insel', art: B },
  { pfad: 'lsaZeiten.inselNurAnmeldung', gruppe: 'lsa', name: 'Freigabe nur auf Anmeldung', art: B },

  // ── Trottoirüberfahrt ──
  { pfad: 'q3.bebaut', gruppe: 'q3', name: 'bebautes Gebiet', art: B },
  { pfad: 'q3.gewerbe', gruppe: 'q3', name: 'Industrie- oder Gewerbegebiet', art: B },
  { pfad: 'q3.anschlussGewerbe', gruppe: 'q3', name: 'Zufahrt zu gewerblich bzw. landwirtschaftlich genutzten Grundstücken', art: B },
  { pfad: 'q3.ueber', gruppe: 'q3', name: 'Überfahrt über', art: w(['einmuendend', 'die einmündende Strasse'], ['haupt', 'die Hauptfahrbahn']) },
  { pfad: 'q3.vSigHaupt', gruppe: 'q3', name: 'Tempo Hauptfahrbahn', art: { art: 'zahl', einheit: 'km/h', min: 5, max: 120 } },
  { pfad: 'q3.vSigEinm', gruppe: 'q3', name: 'Tempo einmündende Strasse', art: { art: 'zahl', einheit: 'km/h', min: 5, max: 120 } },
  { pfad: 'q3.nEinm', gruppe: 'q3', name: 'Fahrstreifen je Richtung, einmündend', art: { art: 'zahl', min: 1, max: 6 } },
  { pfad: 'q3.nHaupt', gruppe: 'q3', name: 'Fahrstreifen je Richtung, Hauptfahrbahn', art: { art: 'zahl', min: 1, max: 6 } },
  { pfad: 'q3.trottoirBeidseits', gruppe: 'q3', name: 'Trottoir vor und nach der Einmündung', art: B },
  { pfad: 'q3.winkel', gruppe: 'q3', name: 'Einmündungswinkel', art: { art: 'zahl', einheit: '°', min: 0, max: 180 } },
  { pfad: 'q3.knotensichtOk', gruppe: 'q3', name: 'Knotensicht erfüllt', art: B },
  { pfad: 'q3.hvl5m', gruppe: 'q3', name: 'Halteverbotslinien je 5 m', art: B },
  { pfad: 'q3.gegenueberEinm', gruppe: 'q3', name: 'gegenüberliegende Einmündung', art: B },
  { pfad: 'q3.belastungSchwach', gruppe: 'q3', name: 'insgesamt schwacher Verkehr', art: B },
  { pfad: 'q3.veloSchule', gruppe: 'q3', name: 'wichtige Veloroute bzw. Zufahrt zu einer Schule', art: B },
  { pfad: 'q3.einmSiedlungsorientiert', gruppe: 'q3', name: 'einmündende Strasse siedlungsorientiert', art: B },
  { pfad: 'q3.zoneEinm', gruppe: 'q3', name: 'Zone der einmündenden Strasse', art: w(['keine', 'keine'], ['t30', 'Tempo-30-Zone'], ['bgz', 'Begegnungszone']) },
  { pfad: 'q3.eingangstor', gruppe: 'q3', name: 'als Eingangstor der Zone', art: B },
  { pfad: 'q3.hauptInZone', gruppe: 'q3', name: 'Hauptverkehrsstrasse in der Zone', art: B },
  { pfad: 'q3.wartezeitEinmS', gruppe: 'q3', name: 'mittlere Wartezeit einmündend', art: s(300) },
  { pfad: 'q3.lkwGelegentlich', gruppe: 'q3', name: 'Lastwagen nur gelegentlich', art: B },
  { pfad: 'q3.linienbus', gruppe: 'q3', name: 'Linienbus auf der einmündenden Strasse', art: B },
  { pfad: 'q3.lsaKnoten', gruppe: 'q3', name: 'Knoten mit Lichtsignal', art: B },
  { pfad: 'q3.kreisel', gruppe: 'q3', name: 'an einem Kreisel', art: B },
  { pfad: 'q3.breiteM', gruppe: 'q3', name: 'Breite der Trottoirüberfahrt', art: m(0, 20) },
  { pfad: 'q3.anrampung', gruppe: 'q3', name: 'Anrampung: Neigung (%) und Länge (m); leer = keine', art: { art: 'zahlen', n: 2, min: 0, max: 100 } },
  { pfad: 'q3.dtvEinm', gruppe: 'q3', name: 'DTV einmündende Strasse', art: { art: 'zahl', einheit: 'Fz/Tag', min: 0, max: 200000 } },
  { pfad: 'q3.mivEinmHoch', gruppe: 'q3', name: 'viel Verkehr auf der einmündenden Strasse', art: B },
]

export const FELD_DEF: ReadonlyMap<string, FeldDef> = new Map(FELD_DEFS.map(d => [d.pfad, d]))

/** Objekt-Felder: Unterfelder in der Reihenfolge des Typs und die Unterfelder, ohne die das Objekt nicht entsteht */
export type ObjektFeld = 'insel' | 'haltestelle' | 'hvl' | 'fusswegAchse' | 'randabschluss' | 'kurve' | 'lsaZeiten' | 'q3'
export const OBJEKTE: { readonly [K in ObjektFeld]: { pflicht: readonly string[] } } = {
  insel: { pflicht: ['vorhanden'] },
  haltestelle: { pflicht: ['art'] },
  hvl: { pflicht: ['vorhanden'] },
  fusswegAchse: { pflicht: ['rechtwinkligUneinsehbar', 'versatz', 'umlaufschranke'] },
  randabschluss: { pflicht: ['art'] },
  kurve: { pflicht: ['fuenfBedingungen'] },
  lsaZeiten: { pflicht: [] },
  q3: { pflicht: [] },
}
export const istObjektFeld = (f: string): f is ObjektFeld => Object.prototype.hasOwnProperty.call(OBJEKTE, f)
/** Unterfelder eines Objekt-Felds (aus FELD_DEFS) */
export const unterfelder = (o: ObjektFeld): string[] => FELD_DEFS.filter(d => d.pfad.startsWith(`${o}.`)).map(d => d.pfad.slice(o.length + 1))

/** Felder, die die Maske nicht zeigt (abgeleitet) */
export const ABGELEITET: readonly FeldName[] = ['fgQuelle']

/** Gruppe eines Pfads bzw. Feldnamens (für «offen» und «nicht geprüft»); unbekannt: null */
export function gruppeVon(pfad: string): GruppeId | null {
  const d = FELD_DEF.get(pfad)
  if (d) return d.gruppe
  if (pfad === 'fgQuelle') return 'nachfrage'
  const o = pfad.split('.')[0]
  return istObjektFeld(o) ? FELD_DEFS.find(x => x.pfad.startsWith(`${o}.`))!.gruppe : null
}

/** Beschriftung eines Pfads bzw. Feldnamens (Felder, die im Befund als fehlend erscheinen) */
export function feldName(pfad: string): string {
  const d = FELD_DEF.get(pfad)
  if (d) return d.name
  if (pfad === 'fgQuelle') return 'Herkunft der Fussgängerzahl'
  if (pfad === 'fg5h') return 'Fussgänger in den 5 Spitzenstunden'
  const o = pfad.split('.')[0]
  if (istObjektFeld(o)) return { insel: 'Insel', haltestelle: 'Bushaltestelle', hvl: 'Halteverbotslinie', fusswegAchse: 'Fussweg in der Achse',
    randabschluss: 'Randabschluss', kurve: 'Kurve vor dem Streifen', lsaZeiten: 'LSA-Zeiten', q3: 'Trottoirüberfahrt' }[o]
  return pfad
}

/** Erlaubte Werte einer Art als Text (Meldung der Maske), z. B. «5 bis 120 km/h» */
export function bereichText(art: FeldArt): string {
  const b = (a: { min?: number; max?: number; einheit?: string }) =>
    `${String(a.min ?? '…').replace('.', ',')} bis ${String(a.max ?? '…').replace('.', ',')}${a.einheit ? ` ${a.einheit}` : ''}`
  switch (art.art) {
    case 'bool': return 'ja oder nein'
    case 'zahl': return b(art)
    case 'zahlen': return `${art.n ? `${art.n} Werte` : 'Werte'} mit / getrennt, je ${b(art)}`
    case 'wahl': case 'liste': return art.optionen.map(o => o[1]).join(', ')
  }
}

/** Prüfen eines Werts gegen die Art (Fall-Datei und Maske); Zahlen im Bereich */
export function wertGueltig(art: FeldArt, x: unknown): boolean {
  const zahl = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const imBereich = (v: number, a: { min?: number; max?: number }) => (a.min === undefined || v >= a.min) && (a.max === undefined || v <= a.max)
  switch (art.art) {
    case 'bool': return typeof x === 'boolean'
    case 'zahl': return zahl(x) && imBereich(x, art)
    case 'zahlen': return Array.isArray(x) && x.length > 0 && x.length <= 12 && (art.n === undefined || x.length === art.n) &&
      x.every(v => zahl(v) && imBereich(v, art))
    case 'wahl': return typeof x === 'string' && art.optionen.some(([k]) => k === x)
    case 'liste': return Array.isArray(x) && x.every(v => art.optionen.some(([k]) => k === v)) && new Set(x).size === x.length
  }
}

/** Pfad ohne Objektteil als Feldname (Prüfung in den Tests: jedes Feld der Eingaben hat eine Zeile bzw. Unterfelder) */
export const feldVon = (pfad: string): FeldName => pfad.split('.')[0] as FeldName
