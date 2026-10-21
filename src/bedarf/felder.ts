// ── Bedarfsmodul E1: Felder der Eingabemaske und der Fall-Datei ──
//
// Jedes Eingabefeld aus eingaben.ts (Werte) erscheint hier mit Gruppe (Blöcke der Skizze: Rahmen, Nachfrage, Verkehr, Lage,
// Insel, Ausrüstung, LSA-Zeiten, Trottoirüberfahrt), Beschriftung und Art. Objekt-Felder (insel, haltestelle, hvl …) sind in
// ihre Unterfelder zerlegt (Pfad «insel.breite»): so prüft die Fall-Datei jedes Unterfeld einzeln (offener Punkt aus E0: bisher
// nur das Objekt als Ganzes), und die Maske kann ein Unterfeld von Hand setzen, während die übrigen vorbelegt bleiben.
// Abgeleitet und nicht in der Maske: fgQuelle (aus Zählung bzw. Schätzklasse).
// Beschriftung in Alltagssprache; Erklärung, Herkunft und Sichtbarkeit je Feld in feldhilfen.ts (Feldhilfen, 20.10.2026).
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
}

const B: FeldArt = { art: 'bool' }
const m = (min = 0, max = 500): FeldArt => ({ art: 'zahl', einheit: 'm', min, max })
const ms = (n?: number, max = 100): FeldArt => ({ art: 'zahlen', einheit: 'm', n, min: 0, max })
const s = (max = 300): FeldArt => ({ art: 'zahl', einheit: 's', min: 0, max })
const w = (...o: [string, string][]): FeldArt => ({ art: 'wahl', optionen: o })

export const FELD_DEFS: FeldDef[] = [
  // ── Rahmen ──
  { pfad: 'typ', gruppe: 'rahmen', name: 'Art der Querung (Bestand bzw. Planung)', art: w(['fgs', 'Fussgängerstreifen'],
    ['lsa', 'Fussgängerstreifen mit Lichtsignal'], ['furt', 'Furt (Insel ohne Balken, ohne Vortritt)'],
    ['ohne_vortritt', 'Querung ohne Vortritt (Nase, Einengung, ohne Massnahme)'], ['trottoirueberfahrt', 'Trottoirüberfahrt'],
    ['mehrzweck', 'Mehrzweckstreifen']) },
  { pfad: 'innerorts', gruppe: 'rahmen', name: 'Innerorts (innerhalb der Ortstafeln)', art: B },
  { pfad: 'vSig', gruppe: 'rahmen', name: 'Signalisiertes Tempo', art: { art: 'zahl', einheit: 'km/h', min: 5, max: 120 } },
  { pfad: 'tempoRegime', gruppe: 'rahmen', name: 'Strecke oder Zone (Tempo-Regime)', art: w(['strecke', 'Strecke (auch Tempo 30 auf einer Hauptstrasse)'],
    ['t30_zone', 'in einer Tempo-30-Zone (Zonentafel)'], ['begegnungszone', 'in einer Begegnungszone']) },
  { pfad: 'v85', gruppe: 'rahmen', name: 'Gefahrenes Tempo (V85)', art: { art: 'zahl', einheit: 'km/h', min: 5, max: 150 } },
  { pfad: 'v85Nachweis', gruppe: 'rahmen', name: 'V85 ist gemessen', art: B },
  { pfad: 'anzeichenSchneller', gruppe: 'rahmen', name: 'Anzeichen, dass schneller gefahren wird', art: B },
  { pfad: 'strassentyp', gruppe: 'rahmen', name: 'Durchgangs- oder Quartierstrasse (Strassentyp)', art: w(['verkehrsorientiert', 'verkehrsorientiert (Durchgangsverkehr)'],
    ['siedlungsorientiert', 'siedlungsorientiert (Quartier)']) },
  { pfad: 'ohneBaulich', gruppe: 'rahmen', name: 'Querung ganz ohne bauliche Hilfe', art: B },
  { pfad: 'neuanlage', gruppe: 'rahmen', name: 'Neue Anlage (nicht Bestand)', art: B },
  { pfad: 'kantonsstrasse', gruppe: 'rahmen', name: 'Kantonsstrasse', art: B },

  // ── Nachfrage ──
  { pfad: 'fg5h', gruppe: 'nachfrage', name: 'Querende, gezählt (5 Spitzenstunden)', art: { art: 'zahl', min: 0, max: 100000 } },
  { pfad: 'fgKlasse', gruppe: 'nachfrage', name: 'Querende, geschätzt (5 Spitzenstunden)', art: w(['<100', 'unter 100'],
    ['100-500', '100 bis 500'], ['>500', 'über 500']), quelle: 'schaetzung' },
  { pfad: 'fgSehrHoch', gruppe: 'nachfrage', name: 'So viele Querende, dass sie den Verkehr aufhalten', art: B },
  { pfad: 'netz', gruppe: 'nachfrage', name: 'Stellung im Fusswegnetz (Bern)', art: w(['basisnetz', 'Basisnetz'],
    ['publikumsintensiv', 'publikumsintensiv'], ['feinverteiler', 'Feinverteiler'], ['keins', 'nicht im Netz']) },
  { pfad: 'netzQualifiziert', gruppe: 'nachfrage', name: 'Teil einer amtlichen Fusswegnetzplanung', art: B },
  { pfad: 'beduerfnis', gruppe: 'nachfrage', name: 'Besonderer Grund für Vortritt', art: { art: 'liste', optionen: [['schule', 'Schule'],
    ['kindergarten', 'Kindergarten'], ['heim', 'Heim'], ['haltestelle', 'Haltestelle'], ['schulweg', 'Schulweg']] } },
  { pfad: 'nachfrage', gruppe: 'nachfrage', name: 'Gequert wird gebündelt oder verteilt', art: w(['punktuell', 'gebündelt an einer Stelle'],
    ['flaechig', 'verteilt über die ganze Strecke']) },
  { pfad: 'wunschlinieM', gruppe: 'nachfrage', name: 'Abstand zur bevorzugten Gehlinie', art: m() },
  { pfad: 'fusswegAchse.rechtwinkligUneinsehbar', gruppe: 'nachfrage', name: 'Fussweg mündet direkt und verdeckt auf den Streifen', art: B },
  { pfad: 'fusswegAchse.versatz', gruppe: 'nachfrage', name: 'Fussweg: kommt seitlich versetzt an', art: B },
  { pfad: 'fusswegAchse.umlaufschranke', gruppe: 'nachfrage', name: 'Fussweg: Umlaufschranke am Ende', art: B },

  // ── Verkehr ──
  { pfad: 'dtv', gruppe: 'verkehr', name: 'Fahrzeuge pro Tag (DTV)', art: { art: 'zahl', einheit: 'Fz/Tag', min: 0, max: 200000 } },
  { pfad: 'starkBelastet', gruppe: 'verkehr', name: 'Stark befahrene Strasse (eigene Einschätzung)', art: B },
  { pfad: 'mivKlasse', gruppe: 'verkehr', name: 'Autoverkehr an der Einengung', art: w(['tief', 'wenig'], ['mittel', 'mittel'], ['hoch', 'viel']) },
  { pfad: 'zweirichtung', gruppe: 'verkehr', name: 'Gegenverkehr (nicht Einbahn)', art: B },
  { pfad: 'nRichtung', gruppe: 'verkehr', name: 'Fahrstreifen je Richtung (Busstreifen zählen, Radstreifen nicht)', art: { art: 'zahlen', min: 1, max: 6 } },
  { pfad: 'radstreifen', gruppe: 'verkehr', name: 'Radstreifen an der Querung', art: B },
  { pfad: 'busspur', gruppe: 'verkehr', name: 'Busstreifen', art: B },
  { pfad: 'busDurchmarkiert', gruppe: 'verkehr', name: 'Balken auch über den Busstreifen', art: B },
  { pfad: 'tram', gruppe: 'verkehr', name: 'Tram an der Querung', art: w(['keins', 'kein Tram'], ['eigentrassee', 'auf eigenem Gleiskörper'], ['fahrbahn', 'auf der Fahrbahn']) },
  { pfad: 'tramHaltestellenbereich', gruppe: 'verkehr', name: 'Querung bei einer Tramhaltestelle', art: B },
  { pfad: 'balkenAufGleis', gruppe: 'verkehr', name: 'Balken auch auf den Gleisen', art: B },

  // ── Lage ──
  { pfad: 'lage', gruppe: 'lage', name: 'Wo liegt die Querung', art: w(['strecke', 'auf der Strecke (keine Kreuzung)'],
    ['knoten_berechtigt', 'Kreuzung, über die Strasse mit Vortritt'], ['knoten_belastet', 'Kreuzung, über die Zufahrt ohne Vortritt'],
    ['einmuendung', 'über eine einmündende Seitenstrasse'], ['kreisel', 'am Kreisel']) },
  { pfad: 'knotenArmeOhneQuerung', gruppe: 'lage', name: 'Arme der Kreuzung ohne Querung', art: { art: 'zahl', min: 0, max: 8 } },
  { pfad: 'knotenLsa', gruppe: 'lage', name: 'Kreuzung mit Lichtsignal für den Verkehr', art: B },
  { pfad: 'alleZufahrtsstreifenBelastet', gruppe: 'lage', name: 'Alle Fahrstreifen der Zufahrt ohne Vortritt', art: B },
  { pfad: 'fahrbahnB', gruppe: 'lage', name: 'Fahrbahnbreite (Bordstein bis Bordstein)', art: m(0, 60) },
  { pfad: 'querdistanzL', gruppe: 'lage', name: 'Länge jeder Teilquerung', art: ms(undefined, 60) },
  { pfad: 'abstandFgsM', gruppe: 'lage', name: 'Abstand zum nächsten Fussgängerstreifen', art: m(0, 5000) },
  { pfad: 'abstandLsaM', gruppe: 'lage', name: 'Abstand zum nächsten Lichtsignal', art: m(0, 5000) },
  { pfad: 'verzweigung', gruppe: 'lage', name: 'Querung an einer Kreuzung bzw. Einmündung', art: B },
  { pfad: 'verzweigungErkennbar', gruppe: 'lage', name: 'Lichtsignal-Kreuzung gut als Kreuzung erkennbar', art: B },
  { pfad: 'haltestelleAngrenzend', gruppe: 'lage', name: 'Haltestelle direkt an der Querung', art: B },
  { pfad: 'haltestelle.art', gruppe: 'lage', name: 'Bushaltestelle an der Querung', art: w(['keine', 'keine'], ['fahrbahn', 'Bus hält auf der Fahrbahn'], ['bucht', 'Busbucht']) },
  { pfad: 'haltestelle.lage', gruppe: 'lage', name: 'Querung hinter, vor oder in der Haltestelle', art: w(['fgs_nach_halt', 'hinter dem Haltebereich'],
    ['fgs_vor_halt', 'vor dem Haltebereich'], ['im_bereich', 'mitten im Haltebereich']) },
  { pfad: 'haltestelle.verdeckt', gruppe: 'lage', name: 'Haltender Bus verdeckt die Querenden', art: B },
  { pfad: 'haltestelle.ueberholenUnterbunden', gruppe: 'lage', name: 'Überholen des haltenden Busses verhindert', art: B },
  { pfad: 'rueckversatzM', gruppe: 'lage', name: 'Abstand der Querung zur Kreuzung (Rückversatz)', art: m(0, 100) },
  { pfad: 'laengsparkierung', gruppe: 'lage', name: 'Längsparkierung an der Querung', art: B },
  { pfad: 'seitenraumVorParklinieM', gruppe: 'lage', name: 'Trottoir vorgezogen über die Parkreihe (+) bzw. dahinter (−)', art: m(-5, 5) },
  { pfad: 'einengung', gruppe: 'lage', name: 'Nase bzw. Einengung', art: B },
  { pfad: 'restbreiteM', gruppe: 'lage', name: 'Fahrbahn an der engsten Stelle', art: m(0, 30) },
  { pfad: 'einengungLaengeM', gruppe: 'lage', name: 'Länge der Einengung', art: m(0, 100) },
  { pfad: 'mzsBreiteM', gruppe: 'lage', name: 'Breite des Mehrzweckstreifens', art: m(0, 10) },
  { pfad: 'mzsMitFgs', gruppe: 'lage', name: 'Fussgängerstreifen über den Mehrzweckstreifen', art: B },
  { pfad: 'kurve.radius', gruppe: 'lage', name: 'Kurvenradius vor der Querung', art: m(0, 1000) },
  { pfad: 'kurve.fuenfBedingungen', gruppe: 'lage', name: 'Sicht nach Kurvenradius anwendbar', art: B },
  { pfad: 'sichtVorh', gruppe: 'lage', name: 'Sichtweite je Zufahrt, von Hand (ersetzt den Sichtrechner)', art: ms(undefined, 500) },
  { pfad: 'erkennungM', gruppe: 'lage', name: 'Ab welcher Distanz ist der Streifen erkennbar', art: m(0, 1000) },

  // ── Insel ──
  { pfad: 'insel.vorhanden', gruppe: 'insel', name: 'Insel in der Fahrbahnmitte', art: B },
  { pfad: 'insel.art', gruppe: 'insel', name: 'Insel gebaut oder nur aufgemalt', art: w(['baulich', 'gebaut (erhöht)'], ['markiert', 'nur markiert']) },
  { pfad: 'insel.breite', gruppe: 'insel', name: 'Inseltiefe (in Gehrichtung)', art: m(0, 20) },
  { pfad: 'insel.kopfUeberstand', gruppe: 'insel', name: 'Inselspitze über den Streifen hinaus (je Seite)', art: ms(2, 20) },
  { pfad: 'insel.vertikal', gruppe: 'insel', name: 'Pfosten bzw. Signal auf der Insel', art: B },
  { pfad: 'insel.kopfErhoeht', gruppe: 'insel', name: 'Inselspitzen erhöht', art: B },
  { pfad: 'insel.pfostenH', gruppe: 'insel', name: 'Höhe der Pfosten auf der Insel', art: m(0, 5) },
  { pfad: 'insel.furt', gruppe: 'insel', name: 'Rollstuhldurchgang durch die Insel (Breite)', art: m(0, 5) },
  { pfad: 'inselMoeglich', gruppe: 'insel', name: 'Platz für eine Insel', art: B },
  { pfad: 'durchfahrt', gruppe: 'insel', name: 'Fahrbahn neben der Insel (je Seite, quer)', art: ms(undefined, 30) },

  // ── Ausrüstung ──
  { pfad: 'fgsMitLsa', gruppe: 'ausruestung', name: 'Mit Lichtsignal für Fussgänger', art: B },
  { pfad: 'streifenBreite', gruppe: 'ausruestung', name: 'Streifenbreite (Länge der Balken)', art: m(0, 20) },
  { pfad: 'randAbstand', gruppe: 'ausruestung', name: 'Lücke zwischen Balken und Trottoirkante', art: ms(undefined, 10) },
  { pfad: 'achsWinkel', gruppe: 'ausruestung', name: 'Winkel zur Fahrbahn (90 = rechtwinklig)', art: { art: 'zahl', einheit: '°', min: 0, max: 90 } },
  { pfad: 'signal411', gruppe: 'ausruestung', name: 'Blaue Tafel Fussgängerstreifen (Signal 4.11)', art: B },
  { pfad: 'signal411Insel', gruppe: 'ausruestung', name: 'Blaue Tafel auch auf der Insel', art: B },
  { pfad: 'beleuchtung', gruppe: 'ausruestung', name: 'Beleuchtung der Querung', art: B },
  { pfad: 'schattenfrei', gruppe: 'ausruestung', name: 'Kein Schatten auf Streifen und Wartefläche', art: B },
  { pfad: 'hvl.vorhanden', gruppe: 'ausruestung', name: 'Halteverbotslinie', art: B },
  { pfad: 'hvl.laengeM', gruppe: 'ausruestung', name: 'Länge der Halteverbotslinie', art: m(0, 200) },
  { pfad: 'hvl.beidseits', gruppe: 'ausruestung', name: 'Halteverbotslinie auf beiden Seiten (Einbahn)', art: B },
  { pfad: 'hvlBedarfM', gruppe: 'ausruestung', name: 'Nötige Länge der Halteverbotslinie (für die Sicht)', art: m(0, 200) },
  { pfad: 'haltenSichtrelevantUeber5m', gruppe: 'ausruestung', name: 'Haltende Autos weiter als 5 m vor dem Streifen stören die Sicht', art: B },
  { pfad: 'haltenSonstVerboten', gruppe: 'ausruestung', name: 'Halten dort schon anders verboten', art: B },
  { pfad: 'reklameUnter20m', gruppe: 'ausruestung', name: 'Werbung näher als 20 m', art: B },
  { pfad: 'reklameAusnahme', gruppe: 'ausruestung', name: 'Werbung als Ausnahme bewilligt', art: B },
  { pfad: 'annaeherungUeberfahrbar', gruppe: 'ausruestung', name: 'Wartefläche vor dem Streifen überfahrbar', art: B },
  { pfad: 'einAusfahrtNah', gruppe: 'ausruestung', name: 'Ein- bzw. Ausfahrt direkt beim Streifen', art: B },
  { pfad: 'blinklicht', gruppe: 'ausruestung', name: 'Blinklicht am Streifen', art: w(['keins', 'keines'], ['gelb_ssv', 'gelbes Blinklicht (SSV)'],
    ['nicht_ssv', 'anderes Warnlicht (nicht SSV)']) },
  { pfad: 'randabschluss.art', gruppe: 'ausruestung', name: 'Randstein an der Querung', art: w(['vertikal', 'niedrig, senkrecht'], ['schraeg', 'niedrig, schräg'], ['hoch', 'hoch (nicht abgesenkt)']) },
  { pfad: 'randabschluss.hoeheMm', gruppe: 'ausruestung', name: 'Höhe des Randsteins', art: { art: 'zahl', einheit: 'mm', min: 0, max: 300 } },
  { pfad: 'randabschluss.breiteM', gruppe: 'ausruestung', name: 'Breite der Schräge', art: m(0, 2) },
  { pfad: 'quergefaelle', gruppe: 'ausruestung', name: 'Quergefälle', art: { art: 'zahl', einheit: '%', min: 0, max: 30 } },
  { pfad: 'absenkung', gruppe: 'ausruestung', name: 'Neigung der Trottoirabsenkung (0 = keine)', art: { art: 'zahl', einheit: '%', min: 0, max: 30 } },
  { pfad: 'taktil', gruppe: 'ausruestung', name: 'Ertastbare Markierung für Sehbehinderte', art: B },
  { pfad: 'leitlinie', gruppe: 'ausruestung', name: 'Ertastbare Leitlinie über die Querung', art: B },
  { pfad: 'querungLang', gruppe: 'ausruestung', name: 'Lange Querung (eigene Einschätzung)', art: B },
  { pfad: 'absenkungBeidseits', gruppe: 'ausruestung', name: 'Trottoir beidseits abgesenkt', art: B },
  { pfad: 'aufstellflaeche', gruppe: 'ausruestung', name: 'Warteflächen auf beiden Seiten', art: B },
  { pfad: 'parkierungSichtbehindernd', gruppe: 'ausruestung', name: 'Parkierte Autos verdecken die Sicht', art: B },

  // ── LSA-Zeiten ──
  { pfad: 'lsaZeiten.L', gruppe: 'lsa', name: 'Länge der Querung (Bord bis Bord)', art: m(0, 100) },
  { pfad: 'lsaZeiten.teile', gruppe: 'lsa', name: 'Teilquerungen an der Insel', art: ms(2, 60) },
  { pfad: 'lsaZeiten.inselB', gruppe: 'lsa', name: 'Inseltiefe (in Gehrichtung) für die LSA-Zeiten', art: m(0, 20) },
  { pfad: 'lsaZeiten.gelb', gruppe: 'lsa', name: 'Gelbzeit für Fussgänger', art: s(30) },
  { pfad: 'lsaZeiten.freigabe', gruppe: 'lsa', name: 'Grünzeit für Fussgänger', art: s(120) },
  { pfad: 'lsaZeiten.phasengleich', gruppe: 'lsa', name: 'Beide Teilquerungen gleichzeitig grün', art: B },
  { pfad: 'lsaZeiten.beideRichtungenImZyklus', gruppe: 'lsa', name: 'Beide Richtungen im selben Umlauf', art: B },
  { pfad: 'lsaZeiten.wartezeit', gruppe: 'lsa', name: 'Wartezeit auf Grün', art: s(300) },
  { pfad: 'lsaZeiten.vorstart', gruppe: 'lsa', name: 'Vorsprung der Fussgänger vor den Abbiegenden', art: { art: 'zahl', einheit: 's', min: -10, max: 30 } },
  { pfad: 'lsaZeiten.abbiegerKonflikt', gruppe: 'lsa', name: 'Abbiegende fahren während Fussgängergrün', art: B },
  { pfad: 'lsaZeiten.inselGeraet', gruppe: 'lsa', name: 'Taster und Zusatzgerät auf der Insel', art: B },
  { pfad: 'lsaZeiten.inselNurAnmeldung', gruppe: 'lsa', name: 'Grün nur auf Tastendruck', art: B },

  // ── Trottoirüberfahrt ──
  { pfad: 'q3.bebaut', gruppe: 'q3', name: 'Im bebauten Gebiet', art: B },
  { pfad: 'q3.gewerbe', gruppe: 'q3', name: 'In einem Industrie- oder Gewerbegebiet', art: B },
  { pfad: 'q3.anschlussGewerbe', gruppe: 'q3', name: 'Seitenstrasse führt zu Betrieben bzw. Landwirtschaft', art: B },
  { pfad: 'q3.ueber', gruppe: 'q3', name: 'Die Überfahrt quert', art: w(['einmuendend', 'die Seitenstrasse'], ['haupt', 'die Hauptstrasse']) },
  { pfad: 'q3.vSigHaupt', gruppe: 'q3', name: 'Tempo auf der Hauptstrasse', art: { art: 'zahl', einheit: 'km/h', min: 5, max: 120 } },
  { pfad: 'q3.vSigEinm', gruppe: 'q3', name: 'Tempo in der Seitenstrasse', art: { art: 'zahl', einheit: 'km/h', min: 5, max: 120 } },
  { pfad: 'q3.nEinm', gruppe: 'q3', name: 'Fahrstreifen je Richtung, Seitenstrasse', art: { art: 'zahl', min: 1, max: 6 } },
  { pfad: 'q3.nHaupt', gruppe: 'q3', name: 'Fahrstreifen je Richtung, Hauptstrasse', art: { art: 'zahl', min: 1, max: 6 } },
  { pfad: 'q3.trottoirBeidseits', gruppe: 'q3', name: 'Trottoir vor und nach der Einmündung', art: B },
  { pfad: 'q3.winkel', gruppe: 'q3', name: 'Winkel der Einmündung', art: { art: 'zahl', einheit: '°', min: 0, max: 180 } },
  { pfad: 'q3.knotensichtOk', gruppe: 'q3', name: 'Sicht beim Ausfahren genügt (Knotensicht)', art: B },
  { pfad: 'q3.hvl5m', gruppe: 'q3', name: 'Halteverbot je 5 m beidseits der Einmündung', art: B },
  { pfad: 'q3.gegenueberEinm', gruppe: 'q3', name: 'Gegenüber mündet eine weitere Strasse ein', art: B },
  { pfad: 'q3.belastungSchwach', gruppe: 'q3', name: 'Wenig Verkehr auf allen Armen', art: B },
  { pfad: 'q3.veloSchule', gruppe: 'q3', name: 'Wichtige Veloroute bzw. Weg zur Schule', art: B },
  { pfad: 'q3.einmSiedlungsorientiert', gruppe: 'q3', name: 'Seitenstrasse ist eine Quartierstrasse', art: B },
  { pfad: 'q3.zoneEinm', gruppe: 'q3', name: 'Seitenstrasse in einer Zone', art: w(['keine', 'keine'], ['t30', 'Tempo-30-Zone'], ['bgz', 'Begegnungszone']) },
  { pfad: 'q3.eingangstor', gruppe: 'q3', name: 'Überfahrt als Eingang in die Zone', art: B },
  { pfad: 'q3.hauptInZone', gruppe: 'q3', name: 'Auch die Hauptstrasse liegt in der Zone', art: B },
  { pfad: 'q3.wartezeitEinmS', gruppe: 'q3', name: 'Mittlere Wartezeit beim Ausfahren', art: s(300) },
  { pfad: 'q3.lkwGelegentlich', gruppe: 'q3', name: 'Lastwagen nur ab und zu', art: B },
  { pfad: 'q3.linienbus', gruppe: 'q3', name: 'Linienbus in der Seitenstrasse', art: B },
  { pfad: 'q3.lsaKnoten', gruppe: 'q3', name: 'Einmündung mit Lichtsignal', art: B },
  { pfad: 'q3.kreisel', gruppe: 'q3', name: 'Einmündung an einem Kreisel', art: B },
  { pfad: 'q3.breiteM', gruppe: 'q3', name: 'Breite der Trottoirüberfahrt', art: m(0, 20) },
  { pfad: 'q3.anrampung', gruppe: 'q3', name: 'Rampe: Neigung (%) und Länge (m); leer = keine', art: { art: 'zahlen', n: 2, min: 0, max: 100 } },
  { pfad: 'q3.dtvEinm', gruppe: 'q3', name: 'Fahrzeuge pro Tag in der Seitenstrasse', art: { art: 'zahl', einheit: 'Fz/Tag', min: 0, max: 200000 } },
  { pfad: 'q3.mivEinmHoch', gruppe: 'q3', name: 'Viel Verkehr in der Seitenstrasse', art: B },
]

export const FELD_DEF: ReadonlyMap<string, FeldDef> = new Map(FELD_DEFS.map(d => [d.pfad, d]))

/**
 * Felder der Grundprüfung bfu (Big Five, grundpruefung.ts): stehen in der Maske oben offen, alle übrigen unter «Erweiterte
 * Prüfung». Querungstyp und Lichtsignal entscheiden, ob die Grundprüfung gilt.
 */
export const GRUND_FELDER: readonly string[] = ['typ', 'fgsMitLsa', 'innerorts', 'vSig', 'v85', 'sichtVorh', 'kurve.radius', 'erkennungM',
  'insel.vorhanden', 'insel.art', 'insel.breite', 'durchfahrt', 'fahrbahnB', 'nRichtung', 'busspur', 'beleuchtung', 'fg5h', 'fgKlasse',
  'dtv', 'annaeherungUeberfahrbar', 'haltestelle.art']
export const istGrundFeld = (pfad: string): boolean => GRUND_FELDER.includes(pfad)

/** Objekt-Felder: Unterfelder in der Reihenfolge des Typs und die Unterfelder, ohne die das Objekt nicht entsteht */
export type ObjektFeld = 'insel' | 'haltestelle' | 'hvl' | 'fusswegAchse' | 'randabschluss' | 'kurve' | 'lsaZeiten' | 'q3'
export const OBJEKTE: { readonly [K in ObjektFeld]: { pflicht: readonly string[] } } = {
  insel: { pflicht: ['vorhanden'] },
  haltestelle: { pflicht: ['art'] },
  hvl: { pflicht: ['vorhanden'] },
  fusswegAchse: { pflicht: ['rechtwinkligUneinsehbar'] },
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
