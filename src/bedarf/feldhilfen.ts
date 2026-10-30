// ── Bedarfsmodul: Feldhilfen der Eingabemaske (Nutzerentscheid 20.10.2026) ──
//
// Je Feld der Maske (felder.ts) drei Teile, im Panel hinter dem Knopf «?»:
//   «Was ist gemeint»: eigene Erklärung in Alltagssprache (FELD_HILFEN.was), wo nötig mit Beispiel.
//   «Wozu»: automatisch aus dem Regelkatalog (katalog.ts): jede Regel, deren Eingaben das Feld enthalten, mit Ergebnis (Kurztext) und
//           Quelle als Kurztext (WERK_KURZ). Objekt-Felder (insel, haltestelle …) listet der Katalog oft als Ganzes; welche
//           Unterfelder die Regel liest, steht in UNTERFELDER (geprüft im Wächter feldhilfen.test.ts gegen die Regeln selbst).
//           Felder, die den Ablauf steuern (welche Prüfblöcke laufen, Empfehlung), haben zusätzlich FELD_HILFEN.ablauf.
//   «Leer lassen»: Vorgabetext (die genannten Prüfungen bleiben offen) bzw. eigener Text, wo leer etwas anderes heisst; bei
//           vorbelegten Feldern, woher der Vorschlag kommt (FELD_HILFEN.vorschlag; die Herkunft im Fall zeigt die Maske).
// Sichtbarkeit (SICHTBAR): Bedingungen als Daten, wann ein Feld im aktuellen Fall überhaupt wirken kann; sonst blendet die Maske
// es aus (Werte bleiben im Fall). Der Wächter prüft an allen Testfällen, dass ausgeblendete Felder das Ergebnis nicht ändern.
// «Wozu» gekürzt (Nutzerentscheid 20.10.2026): GELTUNG je Regel (Bedingung als Daten, offene Eingaben zählen als möglich) lässt nur
// Regeln zu, die im Fall greifen können; Felder, die eine Regel nur als Geltungsbedingung liest (Schalter, z. B. Querungstyp,
// Lichtsignal, Insel vorhanden), zeigen die Regel nicht, sondern ihren Ablauf-Satz mit der Zahl der geschalteten Prüfungen.
// Reihenfolge: Grundprüfung zuerst, dann nach Stärke; im Panel höchstens 5, der Rest aufklappbar.
// Kein Normtext: nur Ziffern, Zahlen und eigene Erklärungen.

import { KATALOG, REGEL_IDS, WERKE, type RegelId, type WerkId } from './katalog'
import { FELD_DEF, istObjektFeld } from './felder'
import type { BedarfEingaben, FeldName } from './eingaben'
import type { Ebene, RegelDef } from './typen'
import { regelName } from './regelname'
/** Kurvenregel: die fünf Voraussetzungen (Unterfelder von kurve) */
const KB = ['kurve.radiusStrasse', 'kurve.b1Innerorts50', 'kurve.b2EinFahrstreifen', 'kurve.b3NachKurvenende', 'kurve.b4Winkel60', 'kurve.b5Gefaelle5']

/** Werke als Kurztext für «Wozu» (statt SR-Nummer bzw. vollem Titel) */
export const WERK_KURZ: Record<WerkId, string> = {
  '40241': 'VSS 40 241', '40240': 'VSS 40 240', '40242': 'VSS 40 242', '40837': 'VSS 40 837', '40273': 'VSS 40 273', '40213': 'VSS 40 213',
  '640075': 'SN 640 075', '640850a': 'SN 640 850a', '640852': 'SN 640 852', '640070': 'SN 640 070',
  VOT30: 'Tempo-30-Zonen-Verordnung', SSV: 'Signalisationsverordnung', VRV: 'Verkehrsregelnverordnung',
  MP: 'Masterplan Fussverkehr Bern', MPV: 'Masterplan Veloinfrastruktur Bern', HBLSA: 'Handbuch Lichtsignalanlagen Bern',
  AHBE: 'Arbeitshilfe Kanton Bern', BFU: 'bfu-Fachdokumentation «Fussgängerstreifen»', BFU2016: 'ältere bfu-Fachdokumentation (2016)', HA: 'Richtlinie Hindernisfreie Architektur',
  VCS: 'VCS', ENTSCHEID: 'Projektentscheid fgsCheck',
}

/** Quellen einer Regel als Kurztext, z. B. «Tempo-30-Zonen-Verordnung Art. 4 Abs. 2» */
export const quelleKurz = (id: RegelId): string =>
  (KATALOG[id] as RegelDef).quellen.map(q => `${WERK_KURZ[q.werk as WerkId] ?? WERKE[q.werk as WerkId].name} ${q.ziffer}`).join('; ')

/**
 * Unterfelder, die eine Regel liest, wo der Katalog nur das Objekt nennt (z. B. «insel»). Fehlt eine Regel hier, obwohl sie ein
 * Objekt als Ganzes nennt, schlägt der Wächter an.
 */
const IV = ['insel.vorhanden', 'insel.art'] as const
export const UNTERFELDER: Partial<Record<RegelId, readonly string[]>> = {
  D1: IV, D2: IV, D2a: IV, D2c: IV, D3a: IV, 'D5-3': IV, 'D6-2': IV, 'D6-2b': IV, 'D6-4': IV, D7: IV, E3: IV, E3a: IV, F2d: IV, F3: IV,
  G4b: IV, 'B5-2a': IV, 'B5-2c': IV, 'B5-3': IV, 'B5-W3': ['haltestelle.art', ...IV],
  D4a: ['haltestelle.lage'], D4b: ['haltestelle.art', 'haltestelle.verdeckt', ...IV], D4c: ['haltestelle.lage'],
  D4d: ['haltestelle.art', 'haltestelle.lage', 'haltestelle.ueberholenUnterbunden'], 'D4-R': ['haltestelle.art', ...IV],
  F2: ['insel.vorhanden', 'insel.breite'], F2b: ['insel.vorhanden', 'insel.breite'], F2c: ['insel.vorhanden', 'insel.breite'],
  'F2-K': [...IV, 'insel.breite'], F2e: [...IV, 'insel.vertikal', 'insel.kopfErhoeht'], F2f: [...IV, 'insel.kopfUeberstand'],
  F2g: [...IV, 'insel.pfostenH'], 'F2-B': ['insel.vorhanden', 'insel.furt'], 'F3-M': [...IV, 'insel.breite'], 'F3-B': ['insel.vorhanden'],
  'B5-2b': [...IV, 'insel.breite'],
  F7a: ['randabschluss.art', 'randabschluss.hoeheMm', 'randabschluss.breiteM'], F7b: ['randabschluss.art'],
  G3b: ['fusswegAchse.rechtwinkligUneinsehbar', 'fusswegAchse.versatz', 'fusswegAchse.umlaufschranke'],
  G7: ['hvl.vorhanden', 'hvl.laengeM', 'hvl.beidseits'], G7b: ['hvl.vorhanden'],
  H1: [...KB, 'kurve.radius'], 'D5-4': [...KB, 'kurve.radius', ...IV], H2: [...KB, 'kurve.radius'],
  H3a: [...KB, 'kurve.radius'], H3b: [...KB, 'kurve.radius'], H4: ['kurve.radius'],
  'B5-1': ['kurve.radius'], 'B5-1b': ['kurve.radius'],
  E1c: IV, 'I6-B': ['insel.vorhanden'], 'I7-B2': ['insel.vorhanden'], 'I7-B3': ['insel.vorhanden'], I8: ['insel.vorhanden'],
}

export interface FeldHilfe {
  /** Was ist gemeint: eigene Erklärung, 1–2 Sätze, wo nötig mit Beispiel */
  was: string
  /** eigener Text zu «Leer lassen», wo ein leeres Feld nicht einfach «offen» heisst */
  leer?: string
  /** woher die Vorbelegung kommt (genau die Felder, die vorbelegung.ts setzt) */
  vorschlag?: string
  /** steuert den Ablauf (Prüfblöcke, Empfehlung) über die Regeln hinaus */
  ablauf?: string
  /** Feld ohne eigene Regel, nur für Vorbelegung bzw. Ablauf (Wächter) */
  nurAblauf?: true
}

const MIT_SLASH = 'mehrere Werte mit / trennen'

export const FELD_HILFEN: Record<string, FeldHilfe> = {
  // ── Rahmen ──
  typ: {
    was: 'Welche Querung beurteilt wird, die bestehende oder die geplante. Davon hängt ab, welche Prüfungen überhaupt laufen.',
    ablauf: 'Wählt die Prüfblöcke: Streifenmasse beim Fussgängerstreifen (auch mit Lichtsignal), Position, Ausrüstung und Sicht nur ' +
      'beim Fussgängerstreifen, eigene Regeln für Trottoirüberfahrt, Mehrzweckstreifen und Querung ohne Vortritt; die Grundprüfung ' +
      'gilt nur für den Fussgängerstreifen ohne Lichtsignal.',
    leer: 'Leer: nur die Empfehlung des Querungstyps; Streifen, Position, Ausrüstung und Sicht werden nicht geprüft. Die ' +
      'Grundprüfung rechnet dann wie bei einem Fussgängerstreifen.',
    vorschlag: 'aus der Querungsart der Streifen (je Streifen unter «Querung») und dem Lichtsignal; Trottoirüberfahrt und ' +
      'Mehrzweckstreifen nur von Hand.',
  },
  innerorts: {
    was: 'Ja, wenn die Querung innerhalb der Ortstafeln liegt. Ausserorts endet die erweiterte Prüfung; die Grundprüfung läuft weiter ' +
      '(bei 60 km/h mit 100 m Sichtweite statt 75 m).',
    vorschlag: 'aus OSM (Angabe innerorts, Zone bzw. Begegnungszone «ja», ausserorts «nein»); sonst bei einem Tempo der gequerten Strasse bis 50 km/h «ja» als Annahme, ohne gerade Zufahrt nach dem Tempo der einmündenden Strasse bzw. in Bern nach einer Bauzone im Nutzungszonenplan.',
  },
  vSig: {
    was: 'Die erlaubte Höchstgeschwindigkeit an der Querung laut Tafel bzw. generell innerorts, z. B. 50 oder 30 km/h.',
    vorschlag: 'in der Stadt Bern aus der signalisierten Höchstgeschwindigkeit des Geoportals (Vorrang vor OSM; der Sichtrechner rechnet mit demselben Tempo); sonst aus OSM (Tempo der geraden Zufahrten), ohne Angabe 50 km/h als Annahme.',
  },
  tempoRegime: {
    was: 'Strecke: gewöhnliche Strasse ohne Zonentafel. Zone: die Querung liegt in einer signalisierten Tempo-30-Zone bzw. ' +
      'Begegnungszone. Eine Hauptstrasse, die nicht zur Zone gehört, ist eine Strecke, auch mit Tempo 30. In der Tempo-30-Zone ist ' +
      'ein Fussgängerstreifen nur mit besonderem Grund erlaubt, in der Begegnungszone nie.',
    vorschlag: 'aus OSM (zone:maxspeed bzw. maxspeed); ab 40 km/h Strecke (eine Zone hat höchstens 30 km/h); Tempo 20 ohne andere Zonenangabe: Begegnungszone vorgeschlagen, gilt für die Beurteilung (sonst «Strecke» wählen). Tempo 30 ohne Zonenangabe in Bern nach der Strassenhierarchie als Annahme: Quartierstrasse Zone, Basisnetz Strecke, sonst offen.',
  },
  v85: {
    was: 'Das Tempo, das 85 von 100 Fahrzeugen nicht überschreiten, aus einer Messung. Beispiel: signalisiert 50 km/h, gemessen ' +
      'V85 = 56 km/h.',
    leer: 'Leer: die Prüfungen rechnen mit dem signalisierten Tempo und weisen das als Annahme aus; die Grundprüfung meldet das ' +
      'Tempo dann als offen.',
  },
  v85Nachweis: {
    was: 'Ja, wenn die V85 aus einer Messung stammt. Dann rechnet die Sichtprüfung des Fussgängerstreifens mit dieser V85 statt ' +
      'mit dem signalisierten Tempo (liegt sie darüber, muss sie es; liegt sie darunter, darf sie es).',
  },
  anzeichenSchneller: {
    was: 'Ja, wenn Hinweise bestehen, dass schneller als erlaubt gefahren wird (z. B. lange gerade Strasse, Beobachtung, Klagen). ' +
      'Dann gehört eine Messung der V85 dazu; ohne sie bleibt die Sichtprüfung offen.',
  },
  strassentyp: {
    was: 'Verkehrsorientiert: Strasse vor allem für den Durchgangsverkehr (Haupt- und Sammelstrassen). Siedlungsorientiert: ' +
      'Strasse vor allem für Anwohnende, Aufenthalt und Quartier.',
    ablauf: 'Ist kein Fussgängerstreifen angezeigt, wählt er die Empfehlung: Furt auf verkehrsorientierten, Querung ohne Vortritt ' +
      'mit Seitenraum, Einengung oder Anhebung auf siedlungsorientierten Strassen.',
    vorschlag: 'in Bern aus der Strassenhierarchie des Geoportals: Basisnetz verkehrsorientiert, Quartierstrasse siedlungsorientiert, Quartierverbindungsstrasse bzw. Widerspruch zum Strassentyp offen. Sonst als Annahme aus OSM: trunk bis tertiary verkehrsorientiert, residential und living_street siedlungsorientiert.',
  },
  ohneBaulich: {
    was: 'Ja, wenn die Querung ohne Vortritt weder Nase noch Einengung noch Anhebung hat, also einfach über die Fahrbahn führt. ' +
      'Dann gelten strengere Bedingungen (beidseits abgesenkt, Warteflächen, freie Sicht, wenig Verkehr).',
    ablauf: 'Schaltet die Bedingungen für die Querung ganz ohne bauliche Hilfe ein.',
    vorschlag: 'nur bei der Querung ohne Vortritt, als Annahme: keine Insel und keine Einengung «ja», Insel bzw. Einengung «nein».',
  },
  neuanlage: {
    was: 'Ja, wenn die Lichtsignalanlage neu gebaut wird (nicht Bestand). Für neue Anlagen begrenzt Bern die Länge der Querung.',
    vorschlag: '«nein» bei Streifen aus OSM und AV bzw. Luftbild und bei Streifen an einem markierten OSM-Übergang (Bestand); «ja» als Annahme bei Streifen von Hand ohne markierten OSM-Übergang.',
  },
  kantonsstrasse: {
    was: 'Ja, wenn die Strasse eine Kantonsstrasse ist. Dafür nennt die Arbeitshilfe des Kantons Bern eigene Streifenbreiten.',
    ablauf: 'Schaltet die Streifenbreite nach der Arbeitshilfe des Kantons Bern ein (Ebene Kanton BE).',
  },

  // ── Nachfrage ──
  fg5h: {
    was: 'Anzahl Personen, die hier in den fünf Stunden mit den meisten Querenden eines durchschnittlichen Tags queren (die Stunden ' +
      'müssen nicht aufeinander folgen), aus einer Zählung. Beispiel: zusammen 180 Personen. Eine Zählung geht der Schätzklasse vor.',
    leer: 'Leer: es gilt die Schätzklasse; fehlt auch sie, bleiben die Prüfungen zur Zahl der Querenden offen.',
  },
  fgKlasse: {
    was: 'Grobe Schätzung, wenn keine Zählung vorliegt: unter 100, 100 bis 500 oder über 500 Querende, zusammengezählt über die ' +
      'fünf Stunden mit den meisten Querenden eines Durchschnittstags. Der Befund weist sie als Schätzung aus.',
    leer: 'Leer: zählt nur ohne Zählung; fehlt beides, bleiben die Prüfungen zur Zahl der Querenden offen.',
  },
  fgSehrHoch: {
    was: 'Ja, wenn die Querenden den Fahrverkehr regelmässig stark aufhalten (z. B. Ströme vor einem Bahnhof). Dann ist ein ' +
      'Lichtsignal zu prüfen.',
  },
  netz: {
    was: 'Welche Bedeutung der Weg im Fusswegnetz der Stadt Bern hat (Richtplan Fussverkehr). In Bern kann das Netz einen ' +
      'Fussgängerstreifen begründen, auch bei wenig Verkehr oder in einer Tempo-30-Zone.',
    vorschlag: 'aus dem Richtplan Fussverkehr (Geoportal Stadt Bern): Basisnetz-Linie quert die Fahrbahn bis 15 m vom Streifen «Basisnetz»; Streifen in einem publikumsattraktiven Bereich «publikumsintensiv». Sonst offen mit Hinweis (Feinverteiler sind nicht kartiert).',
  },
  netzQualifiziert: {
    was: 'Ja, wenn die Querung Teil einer behördlich erarbeiteten Fusswegnetzplanung ist (z. B. Richtplan). Dann ist ein ' +
      'Fussgängerstreifen auch bei weniger als 100 Querenden möglich.',
    vorschlag: '«ja», wenn die Querung im Basisnetz bzw. in einem publikumsattraktiven Bereich des Richtplans Fussverkehr liegt (Geoportal Stadt Bern); sonst offen.',
  },
  beduerfnis: {
    was: 'Ankreuzen, wenn eine Schule, ein Kindergarten, ein Heim oder eine Haltestelle nahe liegt bzw. ein Schulweg hier quert. ' +
      'Ein solcher Grund erlaubt einen Streifen auch in einer Tempo-30-Zone bzw. bei wenig Querenden. In Bern gilt auch die ' +
      'Zugehörigkeit zum Fusswegnetz als Begründung (nur mit der Ebene Bern).',
    leer: 'Leer: offen, die genannten Prüfungen bleiben offen. Gibt es keinen solchen Grund, «keines» ankreuzen.',
    vorschlag: 'Volksschule bzw. Kindergarten bis 150 m (Geoportal Stadt Bern), Heim bis 150 m (OSM, Annahme), Haltestelle bis 50 m; ausserhalb Berns Schule bzw. Kindergarten nach OSM als Annahme. In Bern «Fusswegnetz» im Basisnetz bzw. publikumsattraktiven Bereich; nichts gefunden: «keines» als Annahme. Schulweg nur von Hand.',
  },
  nachfrage: {
    was: 'Gebündelt: die Leute queren an einer Stelle. Verteilt: sie queren überall entlang einer längeren Strecke (z. B. ' +
      'Einkaufsstrasse); dann passt kein einzelner Fussgängerstreifen.',
    vorschlag: '«gebündelt» als Annahme, wenn eine Basisnetz-Linie des Richtplans Fussverkehr die Fahrbahn an der Querung quert; im publikumsattraktiven Bereich und sonst offen.',
  },
  wunschlinieM: {
    was: 'Wie weit die Querung neben der Linie liegt, auf der die Leute am liebsten queren würden (z. B. zwischen zwei Wegen oder ' +
      'Eingängen), in Metern.',
  },
  'fusswegAchse.rechtwinkligUneinsehbar': {
    was: 'Ja, wenn ein Fussweg genau in der Achse des Streifens rechtwinklig ankommt und von der Fahrbahn aus nicht einsehbar ist: ' +
      'Kinder können dann ungebremst auf die Fahrbahn laufen.',
  },
  'fusswegAchse.versatz': { was: 'Ja, wenn der Fussweg seitlich versetzt zum Streifen ankommt, sodass niemand geradeaus auf die Fahrbahn läuft.' },
  'fusswegAchse.umlaufschranke': { was: 'Ja, wenn eine Umlaufschranke (versetzte Gitter) am Wegende zum Abbremsen zwingt.' },

  // ── Verkehr ──
  dtv: {
    was: 'Durchschnittlicher täglicher Verkehr: Motorfahrzeuge pro Tag in beiden Richtungen im Jahresmittel, z. B. aus einer ' +
      'Verkehrszählung von Kanton oder Stadt.',
    ablauf: 'Unter 3000 Fahrzeugen nennt die Empfehlung auch die Querung ohne bauliche Massnahme.',
    vorschlag: 'in der Stadt Bern aus den Verkehrsdaten des Geoportals; Strassen ohne Eintrag 500 als Annahme; sonst offen.',
  },
  starkBelastet: {
    was: 'Ja, wenn die Strasse nach eigener Einschätzung stark befahren ist (die Norm nennt keine Zahl). Dann ist ein Lichtsignal ' +
      'zu prüfen.',
    vorschlag: 'als Annahme: DTV ab 10 000 oder mindestens zwei Fahrstreifen je Richtung «ja», sonst «nein» (nur mit DTV).',
  },
  mivKlasse: {
    was: 'Wie viel Autoverkehr an einer Nase bzw. Einengung durchfährt: wenig, mittel oder viel. Davon hängt in Bern die nötige ' +
      'Restbreite ab.',
    vorschlag: 'als Annahme aus dem DTV: unter 3 000 wenig, bis 10 000 mittel, darüber viel.',
  },
  zweirichtung: {
    was: 'Ja, wenn in beide Richtungen gefahren wird; nein bei einer Einbahnstrasse.',
    vorschlag: 'aus den Zufahrten der Rechnung (OSM, Einbahn).',
  },
  nRichtung: {
    was: `Wie viele Fahrstreifen jede Richtung an der Querung hat, z. B. 2 / 1 (${MIT_SLASH}). Busstreifen zählen mit, Radstreifen ` +
      'nicht; bei Einbahn eine Zahl.',
    vorschlag: 'aus OSM (lanes); ohne Angabe aus der Fahrbahnbreite geschätzt.',
  },
  radstreifen: {
    was: 'Ja, wenn ein Radstreifen (gelbe Linie mit Velosymbol) an der Querung vorbeiführt. Wichtig für die Breite neben einer Insel.',
    vorschlag: 'aus OSM (Velostreifen an den Zufahrten).',
    ablauf: 'Mit Radstreifen und Insel gilt die Durchfahrt neben der Insel nach den Standards der Stadt Bern.',
  },
  busspur: { was: 'Ja, wenn ein eigener Fahrstreifen für Busse gequert wird. Er zählt bei den Fahrstreifen je Richtung mit.', vorschlag: '«ja» aus den Angaben zu Busstreifen an den Zufahrten in OSM; ohne solche Angaben «nein» als Annahme (OSM ist lückenhaft).' },
  busDurchmarkiert: { was: 'Ja, wenn die gelben Balken auch über den Busstreifen durchgehen.' },
  tram: {
    was: 'Ob ein Tram die Querung kreuzt: auf eigenem Gleiskörper (von der Fahrbahn abgetrennt) oder auf der Fahrbahn im Verkehr.',
    vorschlag: 'aus OSM: kein Gleis am Streifen ergibt «kein Tram»; quert ein Gleis, aus der AV (Bahn bzw. Insel: eigener Gleiskörper; Strasse: Fahrbahn) bzw. OSM embedded; sonst offen.',
    ablauf: 'Mit Tram gelten die Regeln zu Insel, Balken auf dem Gleis und Lichtsignal beim Tram.',
  },
  tramHaltestellenbereich: {
    was: 'Ja, wenn die Querung bei einer Tramhaltestelle liegt, wo das Tram ohnehin hält bzw. langsam fährt. Sonst ist ein ' +
      'Lichtsignal zu prüfen.',
    vorschlag: 'aus OSM: Tramhaltestelle bis 30 m «ja», keine bis 50 m «nein». Haltestellen des Geoportals mit den ÖV-Linien: Halt bis 30 m mit Tramlinie am Haltepunkt «ja» als Annahme, kein Halt bis 50 m mit Tramlinie «nein»; sonst offen mit Hinweis.',
  },
  balkenAufGleis: { was: 'Ja, wenn die gelben Balken auch auf dem Gleiskörper des Trams markiert sind.' },

  // ── Lage ──
  lage: {
    was: 'Wo die Querung liegt. «mit Vortritt»: über die Strasse, die an der Kreuzung Vortritt hat; «ohne Vortritt»: über eine ' +
      'Zufahrt, die Vortritt gewähren muss (z. B. Kein Vortritt, Stop).',
    ablauf: 'An einer einmündenden Seitenstrasse prüft die App zusätzlich, ob eine Trottoirüberfahrt möglich wäre.',
    vorschlag: 'aus dem OSM-Netz: Kreisel bis 20 m «am Kreisel»; Knoten bis 20 m, an dem die gequerte Strasse endet, «Einmündung»; kein Knoten «Strecke». Kreuzung: Kein Vortritt bzw. Stop (OSM) auf einem Arm der gequerten Strasse «ohne Vortritt», auf der Querstrasse «mit Vortritt»; sonst offen.',
  },
  knotenArmeOhneQuerung: { was: 'Anzahl Arme der Kreuzung, über die keine Querung führt (0 = über alle Arme). Fehlende Querungen zwingen zu Umwegen.', vorschlag: 'als Annahme aus dem OSM-Netz: Arme des Knotens ohne markierten Übergang innert 25 m (OSM-Übergänge oft unvollständig).' },
  knotenLsa: { was: 'Ja, wenn die Kreuzung für den Fahrverkehr mit Lichtsignalen geregelt ist. Dann ist zu prüfen, ob alle Arme mit Lichtsignal gequert werden.', vorschlag: 'aus OSM: Lichtsignal bis 30 m vom Knoten «ja»; keines bis 50 m «nein» als Annahme; dazwischen offen mit Hinweis.' },
  alleZufahrtsstreifenBelastet: {
    was: 'Ja, wenn an dieser Zufahrt alle Fahrstreifen Vortritt gewähren müssen (z. B. Stop über die ganze Breite). Dann braucht es ' +
      'auch bei zwei Fahrstreifen keine Insel.',
  },
  fahrbahnB: {
    was: 'Breite der Fahrbahn entlang der Querung von Bordstein zu Bordstein, mit Park- und Radstreifen. Beispiel: 7,00 m für zwei ' +
      'Fahrstreifen.',
    vorschlag: 'aus den Bordkanten der Rechnung (AV bzw. Flächen von Hand) entlang der Streifenachse.',
  },
  querdistanzL: {
    was: `Wie weit man ohne Halt über die Fahrbahn geht, je Teilquerung Bord bis Bord bzw. bis zur Insel (${MIT_SLASH}). Zählt nur ` +
      'bei der Querung ohne Vortritt mit einer Sichtweite von Hand; sonst rechnet der Sichtrechner selbst.',
    vorschlag: 'aus den Bordkanten der Rechnung je Teilstreifen.',
  },
  abstandFgsM: { was: 'Entfernung bis zum nächsten Fussgängerstreifen über dieselbe Strasse, in Metern. Liegen Streifen zu dicht, wird der einzelne weniger beachtet.', vorschlag: 'aus OSM: nächster markierter Übergang entlang derselben Strasse, ohne die eigene Querung; ohne Fund die durchsuchte Länge (bis Namenswechsel bzw. Datenende) als Mindestwert (Annahme), nur ab 50 m.' },
  abstandLsaM: { was: 'Entfernung bis zum nächsten Lichtsignal für den Fahrverkehr, in Metern. Kurz nach einem Lichtsignal rechnen Fahrende kaum mit einem Streifen ohne Signal.', vorschlag: 'aus OSM: nächstes Lichtsignal entlang derselben Strasse, ohne die eigene Querung; ohne Fund die durchsuchte Länge (bis Namenswechsel bzw. Datenende) als Mindestwert (Annahme), nur ab 125 m.' },
  verzweigung: { was: 'Ja, wenn die Querung an einer Kreuzung bzw. Einmündung liegt; dort sind kurze Abstände zwischen Streifen üblich.', vorschlag: 'aus dem Sichtrechner bzw. OSM-Netz: Knoten oder Kreisel bis 20 m vom Streifen «ja», sonst «nein».' },
  verzweigungErkennbar: { was: 'Ja, wenn die nahe Kreuzung mit Lichtsignal für die Fahrenden deutlich als Kreuzung erkennbar ist; dann ist ein kürzerer Abstand möglich.' },
  haltestelleAngrenzend: { was: 'Ja, wenn eine Bus- oder Tramhaltestelle direkt an die Querung grenzt; dann ist ein kurzer Abstand zum nächsten Streifen üblich.', vorschlag: '«ja», wenn eine Haltestelle höchstens 20 m vom Streifen liegt; «nein», wenn im Umkreis von 50 m keine liegt (Geoportal Stadt Bern bzw. OSM); dazwischen offen.' },
  'haltestelle.art': {
    was: 'Ob eine Bushaltestelle an der Querung liegt: der Bus hält auf der Fahrbahn oder in einer Bucht daneben.',
    leer: 'Leer: die Prüfungen zur Haltestelle bleiben offen. «keine» wählen, wenn keine Bushaltestelle in der Nähe ist.',
    vorschlag: '«keine», wenn im Umkreis von 50 m um den Streifen keine Haltestelle liegt (Geoportal Stadt Bern bzw. OSM); Busbucht aus OSM (bus_bay), Fahrbahnhaltestelle als Annahme, wenn der Haltepunkt auf der Fahrbahn liegt; sonst offen mit Hinweis.',
  },
  'haltestelle.lage': {
    was: 'Wo die Querung im Verhältnis zum haltenden Bus liegt. Üblich ist hinter dem Haltebereich, damit der abfahrende Bus nicht ' +
      'auf Querende warten muss; mitten durch den Haltebereich ist ausgeschlossen.',
    vorschlag: 'als Annahme aus der Lage des Haltepunkts: der Halt bedient die Fahrtrichtung, für die er rechts liegt; Haltebereich ± 15 m um den Haltepunkt.',
  },
  'haltestelle.verdeckt': { was: 'Ja, wenn ein haltender Bus die Querenden für andere Fahrzeuge verdeckt.', vorschlag: '«ja» als Annahme bei einer Fahrbahnhaltestelle, wenn die Querung weniger als 18 m hinter dem Haltepunkt liegt.' },
  'haltestelle.ueberholenUnterbunden': { was: 'Ja, wenn eine Insel oder Sicherheitslinie verhindert, dass Fahrzeuge am haltenden Bus vorbei auf die Querung fahren.' },
  rueckversatzM: {
    was: 'Wie weit die Querung an der Zufahrt ohne Vortritt von der Strasse mit Vortritt zurückversetzt ist, in Metern (z. B. 5 m: ' +
      'ein einbiegendes Auto hat davor Platz).',
    vorschlag: 'aus der AV: Fahrbahnrand der Querstrasse bis zur Streifenkante, gemessen 12 bis 18 m neben dem Knoten.',
  },
  laengsparkierung: {
    was: 'Ja, wenn neben der Querung parallel zur Fahrbahn parkiert wird. Dann muss das Trottoir bis an die Parkreihe vorgezogen sein, ' +
      'damit Querende gesehen werden.',
    ablauf: 'Bestimmt, ob die Empfehlung einen vorgezogenen Seitenraum nennt.',
    vorschlag: 'aus der Parkierung an den Zufahrten (OSM bzw. Parkfelder).',
  },
  seitenraumVorParklinieM: {
    was: 'Wie weit die Trottoirkante an der Querung über die Linie der parkierten Autos hinaus in die Fahrbahn reicht, in Metern ' +
      '(+ davor, − dahinter). Beispiel: +0,20 m.',
    vorschlag: 'aus der AV: Bordkante am Streifen gegen die Bordkante 15 bis 25 m entlang der Zufahrt, minus Parkstreifen.',
  },
  einengung: {
    was: 'Ja, wenn das Trottoir an der Querung vorgezogen ist (Nase) oder die Fahrbahn sonst verengt ist, damit der Weg über die Fahrbahn kürzer wird.',
    ablauf: 'Mit Nase bzw. Einengung prüft die App deren Restbreite und Länge.',
    vorschlag: 'als Annahme «nein», wenn die Fahrbahn an der Querung nicht mindestens 1 m schmaler ist als an den Zufahrten (nur ohne Insel); ist sie schmaler, nur ein Hinweis.',
  },
  restbreiteM: { was: 'Wie breit die Fahrbahn an der engsten Stelle bleibt, in Metern; davon hängt ab, ob sich zwei Fahrzeuge noch kreuzen können.', },
  einengungLaengeM: { was: 'Wie lang die Einengung entlang der Fahrbahn ist, in Metern.', },
  mzsBreiteM: { was: 'Breite des Mehrzweckstreifens in der Fahrbahnmitte (überfahrbar, zum Warten beim Queren und zum Abbiegen), in Metern.' },
  mzsMitFgs: {
    was: 'Ja, wenn über den Mehrzweckstreifen ein Fussgängerstreifen markiert ist.',
    ablauf: 'Mit Streifen prüft die App den Mehrzweckstreifen wie einen Fussgängerstreifen, sonst wie eine Querung ohne Vortritt.',
  },
  'kurve.radius': {
    was: 'Radius der Kurve bzw. des Abbiegens unmittelbar vor der Querung, in Metern. In engen Kurven fahren die Autos langsamer, ' +
      'die nötige Sichtweite richtet sich dann nach dem Radius.',
    leer: 'Leer: keine Kurve vor der Querung; die Sichtweite richtet sich nach dem Tempo. Gilt für Abbieger und Kreisel (bfu); ' +
      'die Kurvenregel der Norm betrifft nur eine Kurve der Strasse selbst.',
    vorschlag: 'aus dem Sichtrechner: kleinster Abbiegeradius bzw. Kreiselring (geschätzt: Annahme); ohne Abbieger zeigt das Feld das Ergebnis des Sichtrechners.',
  },
  // Kurvenregel (29.10.2026): nur an einer Kurve der Strasse selbst; gilt, wenn alle fünf ja sind (dann Sicht nach Kurvenradius, ohne V85)
  'kurve.radiusStrasse': {
    was: 'Radius der Kurve der Strasse selbst vor dem Streifen, in Metern (nicht das Abbiegen an einer Einmündung). Unter 20 m ' +
      'nennt VSS 40 241 Tab. 2, S. 7 keinen Wert; dann gilt die Sicht nach dem Tempo.',
    vorschlag: 'aus der Fahrlinie des Sichtrechners (OSM-Weg) einer geraden Zufahrt, die vor dem Streifen um mindestens 60° dreht; sonst ausgeblendet.',
  },
  'kurve.b1Innerorts50': {
    was: 'Ja, wenn Kurve und Streifen innerorts auf einer Strasse mit Vortritt liegen, mit 50 km/h als allgemeinem Tempo. Erste der ' +
      'fünf Voraussetzungen der Kurvenregel (VSS 40 241 Z. 14, S. 7; Tab. 2, S. 7; Abb. 2, S. 8); mit allen fünf braucht es keine V85-Messung.',
    vorschlag: 'aus «Innerorts» und dem Tempo der Zufahrt in der Kurve: ja bei innerorts und 50 km/h, sonst nein.',
  },
  'kurve.b2EinFahrstreifen': {
    was: 'Ja, wenn die Kurve je Richtung nur einen Fahrstreifen hat (VSS 40 241 Z. 14, S. 7).',
    vorschlag: 'aus den Fahrstreifen der Zufahrt nach OSM (lanes), ohne Angabe aus der Fahrbahnbreite geschätzt (Annahme).',
  },
  'kurve.b3NachKurvenende': {
    was: 'Ja, wenn der Streifen gleich nach dem Ende der Kurve liegt (VSS 40 241 Z. 14, S. 7; Abb. 2, S. 8).',
    vorschlag: 'aus der Fahrlinie des Sichtrechners: Abstand vom Ende der Kurve bis zum Streifen; bis 10 m ja, über 30 m nein, dazwischen offen.',
  },
  'kurve.b4Winkel60': {
    was: 'Ja, wenn die Kurve die Fahrtrichtung um 60° oder mehr ändert (VSS 40 241 Z. 14, S. 7).',
    vorschlag: 'aus der Fahrlinie des Sichtrechners (OSM-Weg): Richtungsänderung über die Kurve.',
  },
  'kurve.b5Gefaelle5': {
    was: 'Ja, wenn die Strasse vor dem Streifen höchstens 5 % Längsgefälle hat (VSS 40 241 Z. 14, S. 7).',
    vorschlag: 'aus dem Höhenmodell swissALTI3D entlang der Fahrlinie (50 m vor dem Streifen); ohne Höhenmodell offen.',
  },
  sichtVorh: {
    was: `Wie weit Fahrende je Zufahrt auf die Wartefläche am Streifen sehen, in Metern (${MIT_SLASH}). Nur nötig, wenn das ` +
      'Ergebnis des Sichtrechners nicht passt.',
    leer: 'Leer: der Befund übernimmt das Ergebnis des Sichtrechners je Zufahrt (frei bzw. verdeckt). Das ist der Normalfall.',
  },
  erkennungM: {
    was: 'Aus welcher Entfernung Fahrende den Streifen (Markierung bzw. Tafel) erkennen, in Metern. Pflicht ist mindestens die ' +
      'nötige Sichtweite, empfohlen das Doppelte (auch in der Grundprüfung).',
    vorschlag: 'aus dem Sichtrechner als Annahme: kleinster Wert der geraden Zufahrten (Sicht von der Fahrlinie auf die Markierung, ' +
      'geprüft bis 110 m; Gebäude, Hecken, Mauern, Bäume und Auto-Parkfelder verdecken), ohne Gelände und ohne die blaue Tafel ' +
      '(Signal 4.11). Ein Wert «mindestens …» gilt nur, wenn er das Doppelte erreicht; sonst bleibt das Feld offen (Hinweis).',
  },

  // ── Insel ──
  'insel.vorhanden': {
    was: 'Ja, wenn die Querung über eine Insel in der Fahrbahnmitte führt, auf der man warten kann.',
    ablauf: 'Eine gebaute Insel nennt die Empfehlung als vorhandene Schutzinsel.',
    vorschlag: '«ja», wenn die Streifen an einer Insel geteilt sind, sonst «nein».',
  },
  'insel.art': {
    was: 'Gebaut: erhöhte Insel mit Randsteinen. Nur markiert: aufgemalte Fläche ohne Schutz; sie gilt nicht als Schutzinsel, und ' +
      'bei der Querung ohne Vortritt zählt dann die ganze Fahrbahn als Querdistanz.',
    vorschlag: '«gebaut» bei einer Verkehrsinsel der AV unter der Lücke, als Annahme bei einer Insel von Hand, gebaut bei der Mittelinsel (Standard).',
  },
  'insel.breite': {
    was: 'Wie tief die Insel in Gehrichtung ist, also wie viel Platz man beim Warten hat, quer zur Fahrbahn gemessen. Beispiel: ' +
      '2,00 m reichen für ein Velo oder einen Kinderwagen.',
    vorschlag: 'aus der Lücke zwischen den Teilstreifen, quer zur Fahrbahn; bei der Mittelinsel (Standard) ihre Tiefe.',
  },
  'insel.kopfUeberstand': {
    was: 'Wie weit die Inselspitze auf jeder Seite über den Rand des Streifens hinausragt, in Metern (zwei Werte mit /).',
    vorschlag: 'aus dem Umriss der AV-Insel bzw. der Mittelinsel (Standard), wenn sie gezeichnet ist.',
  },
  'insel.vertikal': {
    was: 'Ja, wenn auf der Insel ein senkrechtes Element steht (z. B. Signal oder Pfosten), das sie auch nachts und bei Schnee sichtbar macht.',
    vorschlag: 'aus der Mittelinsel (Standard), wenn sie gezeichnet ist.',
  },
  'insel.kopfErhoeht': { was: 'Ja, wenn die Inselspitzen erhöht sind (Randstein), sodass man sie nicht einfach überfährt.' },
  'insel.pfostenH': { was: 'Höhe der Pfosten bzw. Poller auf der Insel, in Metern; zu hohe Pfosten verdecken kleine Kinder.' },
  'insel.furt': {
    was: 'Breite des abgesenkten Durchgangs durch die Insel für Rollstuhl und Rollator, in Metern (0 = keiner).',
    vorschlag: 'aus der Mittelinsel (Standard), wenn sie gezeichnet ist.',
  },
  inselMoeglich: {
    was: 'Ja, wenn hier eine Insel Platz hätte (genug Fahrbahnbreite, keine Zufahrten im Weg). Ohne Platz rät die App eher zu ' +
      'einem Lichtsignal.',
    ablauf: 'Bestimmt, ob die Empfehlung eine Schutzinsel nennt oder auf ein Lichtsignal ausweicht.',
    leer: 'Leer: offen bleibt, ob ohne Insel ein Lichtsignal nötig ist, und eine Empfehlung mit Insel gilt als vorläufig.',
  },
  durchfahrt: {
    was: `Wie breit die Fahrbahn auf jeder Seite der Insel bleibt, Bord bis Insel quer gemessen (${MIT_SLASH}). Zu schmal behindert ` +
      'Lastwagen; mittlere Breiten verleiten zum knappen Überholen von Velos.',
    vorschlag: 'aus den Teilquerungen Bord bis Insel, quer zur Fahrbahn.',
  },
  veloQuerung: {
    was: 'Ja, wenn auch Velos hier queren und dabei auf der Insel warten (z. B. eine Veloroute quert die Strasse). Ein Radstreifen ' +
      'entlang der Strasse allein genügt nicht.',
    ablauf: 'Mit gebauter Insel gilt dann die Inseltiefe nach der Arbeitshilfe des Kantons Bern (Ebene Kanton BE).',
  },

  // ── Ausrüstung ──
  fgsMitLsa: {
    was: 'Ja, wenn die Querung mit einem Lichtsignal (Ampel) für Fussgänger geregelt ist.',
    ablauf: 'Mit Lichtsignal prüft die App die LSA-Zeiten; die Grundprüfung bfu und die Sichtregeln des Fussgängerstreifens ' +
      'ohne Signal gelten dann nicht.',
    vorschlag: 'aus der Eingabe am Streifen bzw. aus OSM (Lichtsignal am Streifen).',
  },
  streifenBreite: {
    was: 'Wie breit der Fussgängerstreifen in Gehrichtung gesehen ist, also wie lang die gelben Balken sind. Beispiel: 4,00 m.',
    vorschlag: 'aus der Breite der gezeichneten Streifen.',
  },
  randAbstand: {
    was: `Lücke zwischen dem äussersten gelben Balken und der Trottoirkante, je Ende in Metern (${MIT_SLASH}).`,
    vorschlag: 'nur bei Streifen aus dem Luftbild: aus den erkannten Balkenenden und den Bordkanten der Rechnung; sonst von Hand.',
  },
  achsWinkel: {
    was: 'Winkel zwischen Streifen und Fahrbahnrand in Grad; 90 = rechtwinklig. Schräge Streifen sind länger und für Sehbehinderte ' +
      'schwer zu finden.',
    vorschlag: 'aus der Fahrtrichtung der geraden Zufahrten zur Streifenachse.',
  },
  signal411: { was: 'Ja, wenn die blaue Tafel mit dem Fussgänger (Signal 4.11) am Streifen steht.' },
  signal411Insel: { was: 'Ja, wenn die blaue Tafel zusätzlich auf der Insel steht.' },
  beleuchtung: { was: 'Ja, wenn Streifen und Warteflächen nachts eigens öffentlich beleuchtet sind.' },
  schattenfrei: { was: 'Ja, wenn die Beleuchtung keine Schatten (z. B. von Bäumen oder Masten) auf Streifen und Wartefläche wirft.' },
  'hvl.vorhanden': { was: 'Ja, wenn vor dem Streifen eine gelbe Linie am Fahrbahnrand das Halten verbietet, damit haltende Autos Wartende nicht verdecken.' },
  'hvl.laengeM': { was: 'Länge dieser Linie entlang des Fahrbahnrands vor dem Streifen, in Metern.' },
  'hvl.beidseits': { was: 'Bei einer Einbahnstrasse: ja, wenn die Linie links und rechts der Fahrbahn markiert ist.' },
  hvlBedarfM: {
    was: 'Wie lang die Linie sein müsste, damit haltende Autos die Sicht auf die Wartefläche nicht verdecken, in Metern (z. B. am ' +
      'Sichtfeld auf der Karte abgelesen).',
    vorschlag: 'aus dem Sichtrechner: so weit vor dem Streifen liegen Auto-Parkfelder im Sichtfeld (0 ohne solche).',
  },
  haltenSichtrelevantUeber5m: {
    was: 'Ja, wenn haltende Autos auch mehr als 5 m vor dem Streifen die Sicht auf Wartende versperren (in den ersten 5 m ist ' +
      'Halten ohnehin verboten).',
    vorschlag: 'aus dem Sichtrechner: Auto-Parkfelder im Sichtfeld weiter als 5 m vom Streifen.',
  },
  haltenSonstVerboten: { was: 'Ja, wenn das Halten dort schon anders verboten oder unmöglich ist (z. B. Signal, Poller); dann braucht es keine eigene Linie.' },
  reklameUnter20m: { was: 'Ja, wenn auf die Fahrbahn gerichtete Werbung (Plakat, Bildschirm) näher als 20 m beim Streifen steht; sie lenkt Fahrende ab.' },
  reklameAusnahme: { was: 'Ja, wenn diese Werbung nach der Signalisationsverordnung ausnahmsweise bewilligt ist.' },
  annaeherungUeberfahrbar: {
    was: 'Ja, wenn Fahrzeuge die Fläche überfahren können, auf der man vor dem Queren wartet (z. B. ohne Randstein oder als ' +
      'Parkfeld). Besser ist eine geschützte Wartefläche.',
  },
  einAusfahrtNah: { was: 'Ja, wenn direkt beim Streifen eine Ein- oder Ausfahrt (Garage, Parkplatz, Hof) liegt; Fahrzeuge kreuzen dann die Wartefläche.', vorschlag: '«ja» als Annahme, wenn ein Zufahrtsweg (OSM service) höchstens 10 m vom Streifen einmündet; sonst offen.' },
  blinklicht: {
    was: 'Ob ein Licht vor dem Streifen warnt: ein gelbes Blinklicht nach der Signalisationsverordnung oder ein anderes Warnlicht ' +
      '(z. B. eigene Leuchten). Andere Warnlichter sind nicht zulässig.',
  },
  'randabschluss.art': {
    was: 'Wie die Trottoirkante an der Querung ausgebildet ist. Eine niedrige Kante können Rollstühle überwinden, Blinde mit dem ' +
      'Stock aber noch ertasten.',
  },
  'randabschluss.hoeheMm': { was: 'Höhe der Kante über der Fahrbahn an der Querung, in Millimetern (z. B. 30 mm).' },
  'randabschluss.breiteM': { was: 'Bei einer schrägen Kante: wie breit die Schräge ist, in Metern (z. B. 0,15 m).' },
  quergefaelle: { was: 'Neigung der Fahrbahn quer zur Fahrtrichtung, in Prozent. Bei starkem Gefälle eignet sich eine schräge Kante nicht.' },
  absenkung: { was: 'Wie steil das Trottoir zur Querung hin abgesenkt ist, in Prozent (0 = keine Absenkung). Zu steil ist für Rollstühle schwierig.' },
  taktil: {
    was: 'Ja, wenn am Trottoirrand eine weisse, mit dem Stock ertastbare Markierung die Querung anzeigt. Ohne Absenkung und ohne ' +
      'diese Markierung finden Sehbehinderte die Querung nicht.',
    vorschlag: 'in Bern aus den taktil-visuellen Markierungen des Geoportals: Feld bis 3 m von einem Streifenende «ja»; kein Feld «nein» als Annahme. Das OSM-Tag tactile_paving erscheint nur als Hinweis.',
  },
  leitlinie: { was: 'Ja, wenn eine ertastbare Linie Sehbehinderte über eine schräge oder lange Querung führt.',
    vorschlag: 'in Bern aus den taktil-visuellen Markierungen des Geoportals: Leitlinie auf dem Streifen «ja»; keine «nein» als Annahme.' },
  querungLang: { was: 'Ja, wenn die Querung so lang ist, dass Sehbehinderte die Richtung verlieren können (eigene Einschätzung, die Norm nennt keine Zahl).', vorschlag: 'als Annahme: «ja», wenn eine Teilquerung länger als 12 m ist.' },
  absenkungBeidseits: { was: 'Ja, wenn das Trottoir auf beiden Seiten der Querung abgesenkt ist.' },
  aufstellflaeche: { was: 'Ja, wenn es auf beiden Seiten genug Platz zum Warten gibt, ohne den Gehweg zu versperren.' },
  parkierungSichtbehindernd: {
    was: 'Ja, wenn parkierte Autos die Sicht zwischen Wartenden und Fahrenden verdecken.',
    vorschlag: 'aus dem Sichtrechner: Auto-Parkfelder im Sichtfeld.',
  },

  // ── LSA-Zeiten ──
  'lsaZeiten.L': { was: 'Gehstrecke über die ganze Fahrbahn von Bordkante zu Bordkante, in Metern; daraus folgen die nötigen Grün- und Gelbzeiten.', vorschlag: 'wie die Fahrbahnbreite.' },
  'lsaZeiten.teile': { was: 'Bei einer Insel: Länge der beiden Teile bis zur Insel und ab der Insel, in Metern (zwei Werte mit /).', vorschlag: 'wie die Länge jeder Teilquerung (zwei Teile).' },
  'lsaZeiten.inselB': { was: 'Inseltiefe in Gehrichtung, in Metern, wie bei der Insel; hier für die Zeit, die man über die Insel braucht.', vorschlag: 'wie die Inseltiefe.' },
  'lsaZeiten.gelb': { was: 'Dauer des gelben Lichts für Fussgänger nach dem Grün, in Sekunden.' },
  'lsaZeiten.freigabe': { was: 'Dauer des Grüns für Fussgänger, in Sekunden.' },
  'lsaZeiten.phasengleich': { was: 'Ja, wenn beide Teilquerungen an der Insel zur gleichen Zeit Grün haben, man also ohne Halt durchgehen kann.' },
  'lsaZeiten.beideRichtungenImZyklus': { was: 'Bei getrenntem Grün an der Insel: ja, wenn man in beide Richtungen innerhalb eines Signalumlaufs ganz queren kann.' },
  'lsaZeiten.wartezeit': { was: 'Wie lange Fussgänger auf Grün warten, in Sekunden (wie in der Signalplanung ausgewiesen).' },
  'lsaZeiten.vorstart': { was: 'Wie viele Sekunden die Fussgänger vor den abbiegenden Fahrzeugen Grün erhalten, damit sie schon auf der Fahrbahn sind (negativ = später).' },
  'lsaZeiten.abbiegerKonflikt': {
    was: 'Ja, wenn abbiegende Fahrzeuge während des Fussgängergrüns über die Querung fahren dürfen.',
    ablauf: 'Dann prüft die App den Vorsprung der Fussgänger vor den Abbiegenden.',
  },
  'lsaZeiten.inselGeraet': { was: 'Ja, wenn auf der Insel ein Taster und ein Zusatzgerät (z. B. Tonsignal für Sehbehinderte) stehen.' },
  'lsaZeiten.inselNurAnmeldung': { was: 'Ja, wenn Fussgänger nur Grün erhalten, nachdem jemand den Taster gedrückt hat.' },

  // ── Trottoirüberfahrt ──
  'q3.bebaut': { was: 'Ja, wenn die Einmündung im bebauten Siedlungsgebiet liegt.',
    vorschlag: 'in Bern «ja» als Annahme, wenn am Streifen eine Bauzone des Nutzungszonenplans liegt (Geoportal); Schutzzonen, Landwirtschaft und Wald zählen nicht.' },
  'q3.gewerbe': { was: 'Ja, wenn die Umgebung vor allem Industrie oder Gewerbe ist; dort passt keine Trottoirüberfahrt.',
    vorschlag: 'in Bern aus dem Nutzungszonenplan (Geoportal): Industrie- und Gewerbezone bzw. Gewerbegebiet Matte am Streifen «ja», andere Zone «nein».' },
  'q3.anschlussGewerbe': { was: 'Ja, wenn die Seitenstrasse zu Betrieben mit Lieferverkehr oder zu landwirtschaftlich genutztem Land führt.' },
  'q3.ueber': { was: 'Welche Fahrbahn die Trottoirüberfahrt quert. Möglich ist sie nur über die einmündende Seitenstrasse, nie über die Hauptstrasse.', vorschlag: '«die Seitenstrasse» als Annahme, wenn die Lage eine Einmündung ist bzw. (Trottoirüberfahrt) eine Kreuzung über die Zufahrt ohne Vortritt; «die Hauptstrasse», wenn der Streifen nach OSM quer über die Hauptstrasse führt.' },
  'q3.vSigHaupt': { was: 'Signalisiertes Tempo auf der Strasse, entlang der das Trottoir durchläuft, in km/h.',
    vorschlag: 'bei einer Querung über die Seitenstrasse das Tempo der abbiegenden Zufahrten aus dem Sichtrechner.' },
  'q3.vSigEinm': { was: 'Signalisiertes Tempo in der einmündenden Seitenstrasse, in km/h (für die Berner Tabelle).', vorschlag: 'wie das signalisierte Tempo.' },
  'q3.nEinm': { was: 'Wie viele Fahrstreifen die Seitenstrasse je Richtung hat.', vorschlag: 'an einer Trottoirüberfahrt aus OSM am Knoten ' +
    '(lanes, ohne Angabe 1 als Annahme; mehr als 1 als Vorschlag zum Bestätigen), sonst wie die Fahrstreifen je Richtung (grösster Wert).' },
  'q3.nHaupt': { was: 'Wie viele Fahrstreifen die Hauptstrasse je Richtung hat.', vorschlag: 'an einer Trottoirüberfahrt aus OSM am Knoten ' +
    '(lanes der Strasse mit Vortritt, ohne Angabe 1 als Annahme; mehr als 1 als Vorschlag zum Bestätigen).' },
  'q3.trottoirBeidseits': { was: 'Ja, wenn das Trottoir entlang der Hauptstrasse vor und nach der Einmündung weitergeht.' },
  'q3.winkel': { was: 'Winkel zwischen Seiten- und Hauptstrasse in Grad; 90 = rechtwinklig.',
    vorschlag: 'aus der Knotensicht der Trottoirüberfahrt: Winkel der beiden Strassen im OSM-Netz an der Einmündung.' },
  'q3.knotensichtOk': { was: 'Ja, wenn Ausfahrende aus der Seitenstrasse genug weit sehen (Knotensicht nach VSS 40 273); die App rechnet sie an der Trottoirüberfahrt.',
    vorschlag: 'aus der Knotensicht der Trottoirüberfahrt (Reiter Sichtprüfung): «ja», wenn die Sicht aufs Trottoir und auf die Fahrbahn genügt, «nein», wenn eine nicht genügt; sonst bzw. bei unsicherem Ergebnis offen. Ohne Höhenmodell, mit Breite oder Tempo angenommen bzw. nach OSM als Annahme; ein «nein» daraus zählt erst nach «Vorschlag bestätigen».' },
  'q3.hvl5m': { was: 'Ja, wenn beidseits der Einmündung auf je 5 m Halteverbotslinien markiert sind.' },
  'q3.gegenueberEinm': { was: 'Ja, wenn gegenüber auf der anderen Seite der Hauptstrasse ebenfalls eine Strasse einmündet.',
    vorschlag: 'an einer Trottoirüberfahrt über die Zufahrt ohne Vortritt einer Kreuzung «ja», wenn gegenüber ein weiterer Arm liegt (OSM).' },
  'q3.belastungSchwach': { was: 'Ja, wenn auf allen Strassen dieser Kreuzung nur wenig Verkehr ist.' },
  'q3.veloSchule': { was: 'Ja, wenn die Seitenstrasse eine wichtige Veloroute ist oder zu einer Schule führt.' },
  'q3.einmSiedlungsorientiert': { was: 'Ja, wenn die Seitenstrasse vor allem dem Quartier dient (siedlungsorientiert, nicht Durchgangsverkehr).' },
  'q3.zoneEinm': { was: 'Ob die Seitenstrasse zu einer Tempo-30-Zone oder Begegnungszone gehört; dort gilt meist Rechtsvortritt statt Trottoirüberfahrt.',
    vorschlag: 'aus «Strecke oder Zone»; an einer Trottoirüberfahrt eine Zone als Vorschlag zum Bestätigen (heutiger Zustand).' },
  'q3.eingangstor': { was: 'Ja, wenn die Trottoirüberfahrt bewusst den Eingang in die Zone markiert.' },
  'q3.hauptInZone': { was: 'Ja, wenn auch die Hauptstrasse innerorts in der Tempo-30-Zone liegt.' },
  'q3.wartezeitEinmS': { was: 'Wie lange Fahrzeuge aus der Seitenstrasse im Mittel auf eine Lücke warten, in Sekunden. ' +
    'Ein gemessener Wert aus einer Verkehrszählung ersetzt die Schätzung.',
    vorschlag: 'in Bern als Annahme aus dem DTV der Hauptstrasse (Verkehrsdaten des Geoportals): Spitzenstunde 10 % des DTV, Zeitlückenmodell ' +
      'mit 6 s Grenz- und 3 s Folgezeitlücke. Ohne Verkehrszahlen offen.' },
  'q3.lkwGelegentlich': { was: 'Ja, wenn in der Seitenstrasse nur ab und zu Lastwagen fahren.' },
  'q3.linienbus': { was: 'Ja, wenn ein Linienbus durch die Seitenstrasse fährt.',
    vorschlag: 'in Bern aus den ÖV-Linien des Geoportals: Bus- bzw. Trolleybuslinie in der gequerten Strasse «ja», keine «nein».' },
  'q3.lsaKnoten': { was: 'Ja, wenn die Einmündung mit der Überfahrt mit Lichtsignalen geregelt ist. Ein bestehendes Lichtsignal wird mit der ' +
    'Überfahrt in der Regel aufgehoben; «ja» nur, wenn es bleibt.',
    vorschlag: 'wie «Kreuzung mit Lichtsignal»; an einer Trottoirüberfahrt ein Lichtsignal nach OSM als Vorschlag zum Bestätigen (heutiger Zustand).' },
  'q3.kreisel': { was: 'Ja, wenn die Einmündung an einem Kreisel liegt.', vorschlag: 'aus OSM: Kreisel bis 20 m bzw. Einmündung ohne Kreisel.' },
  'q3.breiteM': { was: 'Wie breit die durchgehende Trottoirfläche über die Seitenstrasse ist, in Metern. Mit Zusatztafel «Velos gestattet» ' +
    'sind bis 4,00 m zulässig; der Hinweis über 3,50 m bleibt.',
    vorschlag: 'aus der Knotensicht: Trottoir der AV quer über die Einmündung bzw. das schmalere angrenzende Trottoir, auf 2,00 bis 3,50 m ' +
      'begrenzt; zeigt die AV keines, 2,00 m als Annahme.' },
  'q3.randDurchgehend': { was: 'Ja, wenn der Trottoirrand entlang der Hauptstrasse ohne Rücksprung über die Einmündung läuft. Bei ' +
    'Längsparkierung darf er bis zur Parklinie vorgezogen sein (Werkzeug «Vorgezogener Seitenraum»).' },
  'q3.ueberfahrbarM': { was: 'Länge des abgesenkten, überfahrbaren Rands entlang der Hauptstrasse, in Metern.',
    vorschlag: 'mit gerechneter Knotensicht die Fahrbahnöffnung an der Bordkante der Hauptstrasse, so weit die Überfahrt reicht (AV mit ' +
      'Flächen (Plan): eine geplante Trottoirfläche verkürzt sie); ohne Fahrbahn an der Bordkante offen.' },
  'q3.begrenzung': { was: 'Womit der Bereich, den Fahrzeuge befahren dürfen, seitlich abgegrenzt ist.' },
  'q3.erkennbar': { was: 'Ja, wenn Fahrende aus der Seitenstrasse mindestens 10 m vorher sehen, dass sie über ein Trottoir fahren; auch bei ' +
    'Schnee sollte das so bleiben.' },
  'q3.belag': { was: 'Ob das Trottoir mit gleichem Belag und ohne Kante über die Überfahrt läuft. Beim Umbau einer Einmündung den neuen ' +
    'Belag länger ziehen, als die Seitenstrasse breit ist.' },
  'q3.quergefaelle': { was: 'Neigung quer zur Gehrichtung auf der Überfahrt, in Prozent; üblich sind 2 %.' },
  'q3.randabschluss': { was: 'Der schräge Stein, über den Fahrzeuge von der Hauptstrasse auf die Überfahrt fahren; Sehbehinderte ertasten ' +
    'ihn mit dem Stock.' },
  'q3.randsteineSenkrecht': { was: 'Ja, wenn die Randsteine links und rechts der Überfahrt senkrecht und mindestens 6 cm hoch sind.' },
  'q3.signalisation': { was: 'Ja, wenn dauernd ein Signal auf die Überfahrt hinweisen soll. Bei einer neuen Überfahrt ist für die ' +
    'Einführungszeit ein Gefahrensignal mit Zusatztafel sinnvoll.' },
  'q3.markierung': { was: 'Ja, wenn auf der Überfahrt Markierungen oder davor in der Seitenstrasse eine Wartelinie geplant sind.' },
  'q3.taktil': { was: 'Ja, wenn beidseits der Überfahrt Aufmerksamkeitsfelder markiert sind, verbunden durch eine Leitlinie für Sehbehinderte.' },
  'q3.anrampung': {
    was: 'Die Schräge, über die Fahrzeuge auf Trottoirhöhe fahren: Neigung in Prozent und Länge in Metern, z. B. 12 / 0,80. Gut ' +
      'sichtbar mit Schachbrettmuster oder kontrastierender Pflästerung.',
    leer: 'Leer: keine Rampe angegeben; die Prüfung der Rampe entfällt.',
  },
  'q3.dtvEinm': { was: 'Motorfahrzeuge pro Tag in der Seitenstrasse (für die Berner Tabelle).', vorschlag: 'wie der DTV.' },
  'q3.mivEinmHoch': { was: 'Ja, wenn in der Seitenstrasse viel gefahren wird (eigene Einschätzung, die Norm nennt keine Zahl).', vorschlag: 'als Annahme: DTV ab 3 000 «ja».' },
}

// ── Sichtbarkeit ──

/** Wert eines Felds bzw. Unterfelds in den Eingaben (vorbelegt oder von Hand); offen = null */
type Wert = string | number | boolean | null
export type Bedingung =
  | { feld: string; ist: readonly Wert[] }
  | { feld: string; gesetzt: true }
  /** Zahl über der Schwelle; offen zählt als möglich (nur GELTUNG) */
  | { feld: string; ueber: number }
  | { ebene: 'bern' | 'kantonBE' }
  | { alle: readonly Bedingung[] }
  | { eines: readonly Bedingung[] }

const typ = (...t: Wert[]): Bedingung => ({ feld: 'typ', ist: t })
const ja = (feld: string): Bedingung => ({ feld, ist: [true] })
const BERN: Bedingung = { ebene: 'bern' }
const KANTON: Bedingung = { ebene: 'kantonBE' }
const FGS = typ('fgs')
/** Fussgängerstreifen bzw. Querungstyp offen: Grundprüfung, Sicht und Erkennungsdistanz */
const FGS_ODER_OFFEN = typ(null, 'fgs')
/** Mehrzweckstreifen mit Fussgängerstreifen: geprüft wie ein Fussgängerstreifen (entscheid.ts) */
const MZS_FGS: Bedingung = { alle: [typ('mehrzweck'), ja('mzsMitFgs')] }
/** Streifenmasse F1 (entscheid.ts Schritt 6) */
const F1_TYPEN: Bedingung = { eines: [typ('fgs', 'lsa'), MZS_FGS] }
/** Befunde aus D gelten dem Fussgängerstreifen (entscheid.ts FGS_ARTIG) */
const FGS_ARTIG: Bedingung = { eines: [typ(null, 'fgs', 'lsa'), MZS_FGS] }
const LSA: Bedingung = { eines: [typ('lsa'), ja('fgsMitLsa')] }
const Q3_BLOCK: Bedingung = { eines: [{ feld: 'lage', ist: ['einmuendung'] }, typ('trottoirueberfahrt')] }
const KNOTEN: Bedingung = { feld: 'lage', ist: ['knoten_berechtigt', 'knoten_belastet'] }
const INSEL = ja('insel.vorhanden')
const INSEL_BAULICH: Bedingung = { alle: [INSEL, { feld: 'insel.art', ist: ['baulich'] }] }
const OHNE_BAULICH: Bedingung = { alle: [typ('ohne_vortritt'), ja('ohneBaulich')] }
const HVL_G7: Bedingung = { alle: [FGS, ja('haltenSichtrelevantUeber5m')] }
const alle = (...b: Bedingung[]): Bedingung => ({ alle: b })
/** Kurvenregel: die fünf Voraussetzungen nur mit einer Kurve (Radius) und bei Fussgängerstreifen bzw. offenem Typ */
const KURVE_DA = alle(FGS_ODER_OFFEN, { feld: 'kurve.radiusStrasse', gesetzt: true })

/**
 * Wann ein Feld zählt (fehlt: immer). Abgeleitet aus dem Ablauf in entscheid.ts und grundpruefung.ts und aus den Regeln, die ohne
 * die Bedingung nicht anwendbar sind (null). Leitlinie: ein ausgeblendetes Feld darf weder einen Befund noch «offen» noch die
 * Empfehlung ändern (Wächter an allen Testfällen).
 */
export const SICHTBAR: Partial<Record<string, Bedingung>> = {
  // Rahmen
  v85Nachweis: FGS,
  ohneBaulich: typ('ohne_vortritt'),
  neuanlage: alle(typ('lsa'), BERN),
  kantonsstrasse: alle(F1_TYPEN, KANTON),
  // Nachfrage
  netz: BERN,
  'fusswegAchse.rechtwinkligUneinsehbar': FGS, 'fusswegAchse.versatz': FGS, 'fusswegAchse.umlaufschranke': FGS,
  // Verkehr
  mivKlasse: alle(ja('einengung'), BERN),
  // F3-B (Bern) liest den Radstreifen erst mit Insel; F2-K (Kanton BE) fragt nach querenden Velos (veloQuerung, 23.10.2026)
  radstreifen: alle(INSEL, BERN),
  busDurchmarkiert: alle(ja('busspur'), F1_TYPEN),
  tramHaltestellenbereich: { feld: 'tram', ist: ['eigentrassee', 'fahrbahn'] },
  balkenAufGleis: alle({ feld: 'tram', ist: ['eigentrassee'] }, FGS_ARTIG),
  // Lage
  knotenArmeOhneQuerung: KNOTEN,
  knotenLsa: KNOTEN,
  alleZufahrtsstreifenBelastet: { feld: 'lage', ist: ['knoten_belastet'] },
  querdistanzL: { feld: 'sichtVorh', gesetzt: true },
  abstandFgsM: FGS, verzweigung: FGS, haltestelleAngrenzend: FGS,
  abstandLsaM: alle(FGS, { feld: 'fgsMitLsa', ist: [false, null] }),
  verzweigungErkennbar: alle(FGS, { feld: 'fgsMitLsa', ist: [false, null] }),
  'haltestelle.lage': alle(FGS_ARTIG, { feld: 'haltestelle.art', ist: ['fahrbahn', 'bucht'] }),
  'haltestelle.verdeckt': { feld: 'haltestelle.art', ist: ['fahrbahn'] },
  'haltestelle.ueberholenUnterbunden': alle(FGS_ARTIG, { feld: 'haltestelle.art', ist: ['fahrbahn'] }),
  rueckversatzM: alle(FGS, KNOTEN),
  seitenraumVorParklinieM: ja('laengsparkierung'),
  restbreiteM: alle(ja('einengung'), BERN),
  einengungLaengeM: ja('einengung'),
  mzsBreiteM: typ('mehrzweck'),
  mzsMitFgs: typ('mehrzweck'),
  'kurve.radius': FGS_ODER_OFFEN,
  'kurve.radiusStrasse': KURVE_DA, 'kurve.b1Innerorts50': KURVE_DA, 'kurve.b2EinFahrstreifen': KURVE_DA, 'kurve.b3NachKurvenende': KURVE_DA, 'kurve.b4Winkel60': KURVE_DA,
  'kurve.b5Gefaelle5': KURVE_DA,
  erkennungM: FGS_ODER_OFFEN,
  // Insel
  'insel.art': INSEL, 'insel.breite': INSEL, 'insel.furt': INSEL, durchfahrt: INSEL, veloQuerung: alle(INSEL_BAULICH, KANTON),
  'insel.kopfUeberstand': INSEL_BAULICH, 'insel.vertikal': INSEL_BAULICH, 'insel.kopfErhoeht': INSEL_BAULICH, 'insel.pfostenH': INSEL_BAULICH,
  // Ausrüstung
  streifenBreite: F1_TYPEN, randAbstand: F1_TYPEN,
  signal411: FGS, signal411Insel: alle(FGS, INSEL_BAULICH),
  beleuchtung: FGS_ODER_OFFEN, schattenfrei: alle(FGS, ja('beleuchtung')),
  'hvl.vorhanden': FGS, haltenSichtrelevantUeber5m: FGS,
  haltenSonstVerboten: HVL_G7,
  'hvl.laengeM': alle(HVL_G7, ja('hvl.vorhanden')),
  'hvl.beidseits': alle(HVL_G7, ja('hvl.vorhanden'), { feld: 'zweirichtung', ist: [false] }),
  hvlBedarfM: alle(HVL_G7, ja('hvl.vorhanden')),
  reklameUnter20m: FGS, reklameAusnahme: alle(FGS, ja('reklameUnter20m')),
  annaeherungUeberfahrbar: FGS_ODER_OFFEN,
  einAusfahrtNah: FGS, blinklicht: FGS,
  'randabschluss.hoeheMm': { feld: 'randabschluss.art', ist: ['vertikal', 'schraeg'] },
  'randabschluss.breiteM': { feld: 'randabschluss.art', ist: ['schraeg'] },
  quergefaelle: { feld: 'randabschluss.art', ist: ['schraeg'] },
  absenkungBeidseits: OHNE_BAULICH, aufstellflaeche: OHNE_BAULICH, parkierungSichtbehindernd: OHNE_BAULICH,
  // LSA-Zeiten
  'lsaZeiten.L': LSA, 'lsaZeiten.teile': LSA, 'lsaZeiten.gelb': LSA, 'lsaZeiten.freigabe': LSA, 'lsaZeiten.wartezeit': LSA,
  'lsaZeiten.abbiegerKonflikt': LSA,
  'lsaZeiten.vorstart': alle(LSA, ja('lsaZeiten.abbiegerKonflikt')),
  'lsaZeiten.inselB': alle(LSA, { feld: 'lsaZeiten.teile', gesetzt: true }),
  'lsaZeiten.phasengleich': alle(LSA, { feld: 'lsaZeiten.teile', gesetzt: true }),
  'lsaZeiten.beideRichtungenImZyklus': alle(LSA, { feld: 'lsaZeiten.teile', gesetzt: true }, { feld: 'lsaZeiten.phasengleich', ist: [false] }),
  'lsaZeiten.inselGeraet': alle(LSA, INSEL),
  'lsaZeiten.inselNurAnmeldung': alle(LSA, INSEL, { feld: 'lsaZeiten.inselGeraet', ist: [false] }, BERN),
  // Trottoirüberfahrt (übrige q3-Felder: Q3_BLOCK, unten ergänzt)
  'q3.breiteM': typ('trottoirueberfahrt'), 'q3.anrampung': typ('trottoirueberfahrt'),
  ...Object.fromEntries(['randDurchgehend', 'ueberfahrbarM', 'begrenzung', 'erkennbar', 'belag', 'quergefaelle', 'randabschluss',
    'randsteineSenkrecht', 'signalisation', 'markierung', 'taktil'].map(u => [`q3.${u}`, typ('trottoirueberfahrt')])),
  'q3.vSigEinm': alle(Q3_BLOCK, BERN), 'q3.dtvEinm': alle(Q3_BLOCK, BERN),
  'q3.eingangstor': alle(Q3_BLOCK, { feld: 'q3.zoneEinm', ist: ['t30', 'bgz'] }),
  'q3.hauptInZone': alle(Q3_BLOCK, { feld: 'q3.zoneEinm', ist: ['t30', 'bgz'] }),
  'q3.belastungSchwach': alle(Q3_BLOCK, ja('q3.gegenueberEinm')),
}
for (const pfad of FELD_DEF.keys()) if (pfad.startsWith('q3.') && !SICHTBAR[pfad]) SICHTBAR[pfad] = Q3_BLOCK

/** Wert eines Pfads in den Eingaben (Unterfeld aus dem Objekt); offen bzw. Objekt fehlt: null */
export function wertVon(e: BedarfEingaben, pfad: string): unknown {
  const [f, u] = pfad.split('.')
  const x = e[f as FeldName]?.wert ?? null
  if (u === undefined) return x
  // Haltestelle «keine»: Objekt ohne Art (eingabenBilden), nicht offen
  if (pfad === 'haltestelle.art' && x !== null && (x as { art: unknown }).art === null) return 'keine'
  return x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as unknown as Record<string, unknown>)[u] ?? null : null
}

/** alternative: Trottoirüberfahrt mit «Alternative Fussgängerstreifen prüfen» (27.10.2026): Felder und Regeln des Fussgängerstreifens
 * zählen dann wie bei einem Fussgängerstreifen */
export interface SichtKontext { e: BedarfEingaben; ebenen: { bern: boolean; kantonBE: boolean; richtlinie?: boolean }; alternative?: boolean }

export function erfuellt(b: Bedingung, k: SichtKontext): boolean {
  if ('alle' in b) return b.alle.every(x => erfuellt(x, k))
  if ('eines' in b) return b.eines.some(x => erfuellt(x, k))
  if ('ebene' in b) return k.ebenen[b.ebene]
  const w = wertVon(k.e, b.feld)
  if ('gesetzt' in b) return w !== null
  if ('ueber' in b) return w === null || (typeof w === 'number' && w > b.ueber)
  // Trottoirüberfahrt mit geprüfter Alternative: gilt auch, wo ein Fussgängerstreifen verlangt ist
  if (b.feld === 'typ' && w === 'trottoirueberfahrt' && k.alternative && b.ist.includes('fgs')) return true
  return b.ist.includes(w as Wert)
}

/** Trottoirüberfahrt ohne Alternative (27.10.2026): ausser den Feldern der Trottoirüberfahrt (q3) zählen nur diese */
export const TUE_FELDER: readonly string[] = ['typ', 'innerorts', 'lage', 'fg5h', 'fgKlasse']
/** Feld zählt bei einer Trottoirüberfahrt ohne geprüfte Alternative nicht (Fragen des Fussgängerstreifens ausgeblendet) */
export const nurFgsBeiTue = (pfad: string, k: SichtKontext): boolean =>
  !k.alternative && wertVon(k.e, 'typ') === 'trottoirueberfahrt' && !pfad.startsWith('q3.') && !TUE_FELDER.includes(pfad)

/**
 * Blöcke ohne Pflicht-Unterfeld (q3, lsaZeiten) entstehen nur aus Unterfeldern, die im Fall zählen: ein ausgeblendeter Wert (z. B.
 * Breite der Trottoirüberfahrt bei anderem Typ, Tempo der Seitenstrasse ohne Ebene Bern) lässt den Block nicht laufen (sonst
 * «offen» statt «nicht geprüft»). Ändert e (Befundblatt nach eingabenBilden).
 */
export function ausgeblendeteBloeckeLeeren(e: BedarfEingaben, ebenen: SichtKontext['ebenen'], alternative = false): void {
  for (const o of ['q3', 'lsaZeiten'] as const) {
    const x = e[o].wert as unknown as Record<string, unknown> | null
    if (!x) continue
    const k: SichtKontext = { e, ebenen, alternative }
    if (!Object.keys(x).some(u => x[u] !== null && x[u] !== undefined && sichtbar(`${o}.${u}`, k))) e[o] = { wert: null, quelle: null }
  }
}

/** Feld zählt im aktuellen Fall (sonst blendet die Maske es aus; der Wert bleibt im Fall) */
export const sichtbar = (pfad: string, k: SichtKontext): boolean => {
  if (nurFgsBeiTue(pfad, k)) return false
  const b = SICHTBAR[pfad]
  return !b || erfuellt(b, k)
}

const wertName = (feld: string, x: Wert): string => {
  if (x === null) return 'offen'
  if (typeof x === 'boolean') return x ? 'ja' : 'nein'
  const a = FELD_DEF.get(feld)?.art
  return (a && (a.art === 'wahl' || a.art === 'liste') ? a.optionen.find(o => o[0] === x)?.[1] : undefined) ?? String(x)
}
const feldText = (pfad: string): string => FELD_DEF.get(pfad)?.name ?? pfad

/** Bedingung als Lesetext, z. B. «Art der Querung: Fussgängerstreifen» */
export function bedingungText(b: Bedingung): string {
  if ('alle' in b) return b.alle.map(x => ('eines' in x && x.eines.length > 1 ? `(${bedingungText(x)})` : bedingungText(x))).join(' und ')
  if ('eines' in b) return b.eines.map(bedingungText).join(' oder ')
  if ('ebene' in b) return b.ebene === 'bern' ? 'Ebene Bern an' : 'Ebene Kanton BE an'
  if ('gesetzt' in b) return `${feldText(b.feld)} eingegeben`
  if ('ueber' in b) return `${feldText(b.feld)} über ${b.ueber} oder offen`
  return `${feldText(b.feld)}: ${b.ist.map(x => wertName(b.feld, x)).join(' oder ')}`
}

// ── Wozu: Regeln je Feld aus dem Katalog ──

/** Eingaben einer Regel als Pfade der Maske: Objekt-Einträge über UNTERFELDER, abgeleitete Felder (fgQuelle) ohne Pfad */
export function regelPfade(id: RegelId): string[] {
  const def = KATALOG[id] as RegelDef
  const p: string[] = []
  for (const e of def.eingaben) {
    if (FELD_DEF.has(e)) p.push(e)
    else if (istObjektFeld(e)) p.push(...(UNTERFELDER[id] ?? []).filter(u => u.startsWith(`${e}.`)))
  }
  return [...new Set(p)]
}

// ── Geltung je Regel: wann sie im Fall greifen kann (offene Eingaben zählen als möglich) ──

/** Feld offen oder einer der Werte */
const kann = (feld: string, ...w: Wert[]): Bedingung => ({ feld, ist: [null, ...w] })
const T = (...t: Wert[]): Bedingung => kann('typ', ...t)
const MZS_FGS_K = alle(T('mehrzweck'), kann('mzsMitFgs', true))
/** Befunde aus D bzw. Streifenmasse F1: Fussgängerstreifen (auch mit Lichtsignal), Mehrzweckstreifen mit Streifen */
const FGS_ARTIG_K: Bedingung = { eines: [T('fgs', 'lsa'), MZS_FGS_K] }
const FGS_K = T('fgs')
const NICHT_LSA_K = alle(T('fgs', 'furt', 'ohne_vortritt', 'trottoirueberfahrt', 'mehrzweck'), kann('fgsMitLsa', false))
const LSA_K: Bedingung = { eines: [T('lsa'), kann('fgsMitLsa', true)] }
const GRUND_K = alle(T('fgs'), kann('fgsMitLsa', false))
const NICHT_TUE = T('fgs', 'lsa', 'furt', 'ohne_vortritt', 'mehrzweck')
/** Pfad E (Querung ohne Vortritt): Typ ohne Vortritt, Mehrzweck ohne Streifen oder Fussgängerstreifen nicht angezeigt (C1, C2) */
const E_K = alle(NICHT_TUE, { eines: [T('furt', 'ohne_vortritt'), alle(T('mehrzweck'), kann('mzsMitFgs', false)),
  kann('tempoRegime', 't30_zone'), { feld: 'vSig', ueber: 60 }, { feld: 'v85', ueber: 60 }] })
const Q3_K: Bedingung = { eines: [kann('lage', 'einmuendung'), T('trottoirueberfahrt')] }
const KNOTEN_K = kann('lage', 'knoten_berechtigt', 'knoten_belastet')
const INSEL_K = kann('insel.vorhanden', true)
const BAULICH_K = alle(INSEL_K, kann('insel.art', 'baulich'))
const ZONE_K = alle(NICHT_TUE, kann('tempoRegime', 't30_zone'))

/** Bausteine der Geltung mit Namen in Alltagssprache (Regelübersicht, «Gilt für») */
const GELTUNG_NAME = new Map<Bedingung, string>([
  [GRUND_K, 'Fussgängerstreifen ohne Lichtsignal'], [FGS_ARTIG_K, 'Fussgängerstreifen (auch mit Lichtsignal)'], [FGS_K, 'Fussgängerstreifen'],
  [NICHT_LSA_K, 'Querungen ohne Lichtsignal'], [LSA_K, 'Querungen mit Lichtsignal'], [NICHT_TUE, 'nicht bei Trottoirüberfahrten'],
  [E_K, 'Querungen ohne Vortritt'], [Q3_K, 'Einmündungen bzw. Trottoirüberfahrten'], [KNOTEN_K, 'Querungen an Knoten'],
  [INSEL_K, 'mit Insel'], [BAULICH_K, 'mit gebauter Insel'], [ZONE_K, 'in Tempo-30-Zonen'], [MZS_FGS_K, 'Mehrzweckstreifen mit Fussgängerstreifen'],
])
/** ein Baustein in Worten; «offen» (noch nicht bekannt, gilt vorsorglich) fällt weg */
function geltungTeil(b: Bedingung): string {
  const n = GELTUNG_NAME.get(b)
  if (n) return n
  if ('alle' in b) return b.alle.map(geltungTeil).join(', ')
  if ('eines' in b) return b.eines.map(geltungTeil).join(' oder ')
  if ('ebene' in b) return b.ebene === 'bern' ? 'nur Stadt Bern' : 'nur Kanton Bern'
  if ('gesetzt' in b) return `${feldText(b.feld)} bekannt`
  if ('ueber' in b) return `${feldText(b.feld)} über ${b.ueber}`
  const w = b.ist.filter(x => x !== null)
  if (b.feld === 'typ') return w.map(x => wertName('typ', x)).join(' oder ')
  if (w.length === 1 && typeof w[0] === 'boolean') return `${feldText(b.feld)}: ${w[0] ? 'ja' : 'nein'}`
  return `${feldText(b.feld)}: ${w.map(x => wertName(b.feld, x)).join(' oder ')}`
}
/**
 * Geltung kurz in Worten (Regelübersicht, Nutzertest 23.10.2026): Bausteine mit Namen («Fussgängerstreifen ohne Lichtsignal», «mit
 * Insel»), sonst Feld und Werte ohne «offen»; alle Teile (die Übersicht kürzt auf zwei), genau: bedingungText
 */
export function geltungKurz(b: Bedingung | undefined): { teile: string[]; mehr: boolean; genau: string } {
  if (!b) return { teile: [], mehr: false, genau: '' }
  const teile = !GELTUNG_NAME.has(b) && 'alle' in b ? b.alle.map(geltungTeil) : [geltungTeil(b)]
  return { teile, mehr: false, genau: bedingungText(b) }
}

/**
 * Geltung je Regel (fehlt: immer): Ablauf in entscheid.ts bzw. grundpruefung.ts (Blöcke nach Typ, Lichtsignal, Lage) und die
 * Fälle, in denen eine Regel nicht anwendbar ist (null) bzw. nie verletzt sein kann. Ebenen kommen aus dem Katalog (Bern, Kanton BE,
 * Richtlinie). Wächter: kein Eintrag im Befund bzw. in der Grundprüfung ausserhalb der Geltung.
 */
export const GELTUNG: Partial<Record<RegelId, Bedingung>> = {
  A3: kann('innerorts', true),
  B4: KNOTEN_K,
  C1: NICHT_TUE, C2: ZONE_K, C2b: ZONE_K, 'C2-B': ZONE_K, C3: NICHT_TUE, C3b: NICHT_TUE, C3c: NICHT_TUE, C4: NICHT_TUE, 'C4-B': NICHT_TUE,
  // D1, D1b, D2, D2a, D3a bestimmen die Empfehlung auch bei anderen Typen
  D1: NICHT_LSA_K, D2: kann('zweirichtung', true), D2a: kann('zweirichtung', true), D2c: FGS_ARTIG_K,
  D3a: alle(kann('tram', 'eigentrassee'), NICHT_LSA_K), D3b: alle(FGS_ARTIG_K, kann('tram', 'eigentrassee')),
  D4a: alle(FGS_ARTIG_K, kann('haltestelle.art', 'fahrbahn', 'bucht')), D4c: alle(FGS_ARTIG_K, kann('haltestelle.art', 'fahrbahn', 'bucht')),
  D4b: alle(FGS_ARTIG_K, kann('haltestelle.art', 'fahrbahn')), 'D4-R': alle(FGS_ARTIG_K, kann('haltestelle.art', 'fahrbahn')),
  D4d: alle(FGS_ARTIG_K, kann('haltestelle.art', 'fahrbahn'), kann('haltestelle.lage', 'fgs_nach_halt')),
  'D5-1': alle(kann('strassentyp', 'verkehrsorientiert'), NICHT_LSA_K), 'D5-2': alle(KNOTEN_K, NICHT_LSA_K), 'D5-3': NICHT_LSA_K,
  'D5-4': NICHT_LSA_K, 'D5-5': alle(kann('tram', 'eigentrassee', 'fahrbahn'), NICHT_LSA_K), 'D5-6': NICHT_LSA_K,
  'D6-1': FGS_ARTIG_K, 'D6-2': FGS_ARTIG_K, 'D6-2b': FGS_ARTIG_K, 'D6-3': alle(FGS_ARTIG_K, NICHT_LSA_K),
  'D6-3b': alle(FGS_ARTIG_K, NICHT_LSA_K), 'D6-4': alle(FGS_ARTIG_K, NICHT_LSA_K), 'D6-5': T('lsa'),
  D7: alle(T('mehrzweck'), kann('mzsMitFgs', true)),
  E1: E_K, E2: E_K, E3: E_K, E3a: E_K, E1b: alle(E_K, kann('strassentyp', 'verkehrsorientiert')), E2a: alle(E_K, T('furt')), E1c: alle(E_K, T('furt')),
  E2d: alle(E_K, T('ohne_vortritt'), kann('ohneBaulich', true)), E2e: alle(E_K, T('ohne_vortritt'), kann('ohneBaulich', true)),
  // Querung auf der Fahrbahn (F2 bis F4, E2b, E2c, F7): nicht bei Trottoirüberfahrten (entscheid.ts, 27.10.2026)
  E2b: alle(NICHT_TUE, kann('laengsparkierung', true)), E2c: alle(NICHT_TUE, kann('laengsparkierung', true)),
  'Q3-4': T('trottoirueberfahrt'),
  F1a: FGS_ARTIG_K, F1b: FGS_ARTIG_K, F1c: FGS_ARTIG_K, F1d: FGS_ARTIG_K, 'F1-K': alle(FGS_ARTIG_K, kann('kantonsstrasse', true)),
  F1e: alle(FGS_ARTIG_K, kann('busspur', true)),
  F2: alle(NICHT_TUE, INSEL_K), F2b: alle(NICHT_TUE, INSEL_K), F2c: alle(NICHT_TUE, INSEL_K), F2d: alle(NICHT_TUE, INSEL_K),
  'F2-B': alle(NICHT_TUE, INSEL_K), F2e: alle(NICHT_TUE, BAULICH_K), F2f: alle(NICHT_TUE, BAULICH_K), F2g: alle(NICHT_TUE, BAULICH_K),
  F3: alle(NICHT_TUE, BAULICH_K), 'F3-M': alle(NICHT_TUE, INSEL_K, kann('insel.art', 'markiert')),
  'F3-B': alle(NICHT_TUE, INSEL_K, kann('radstreifen', true)), 'F2-K': alle(NICHT_TUE, BAULICH_K, kann('veloQuerung', true)),
  F4a: alle(NICHT_TUE, kann('einengung', true), kann('mivKlasse', 'tief', 'mittel')), F4b: alle(NICHT_TUE, kann('einengung', true)),
  F4c: alle(kann('einengung', true), T('fgs')),
  F5a: T('trottoirueberfahrt'), F5b: T('trottoirueberfahrt'), F5c: T('trottoirueberfahrt'), F5d: T('trottoirueberfahrt'),
  F5e: T('trottoirueberfahrt'), F5f: T('trottoirueberfahrt'), F5g: T('trottoirueberfahrt'), F5h: T('trottoirueberfahrt'),
  F5i: T('trottoirueberfahrt'), F5j: T('trottoirueberfahrt'), F5k: T('trottoirueberfahrt'), F5l: T('trottoirueberfahrt'),
  F5m: T('trottoirueberfahrt'), F5n: T('trottoirueberfahrt'),
  F7a: NICHT_TUE, F7c: NICHT_TUE, F7d: NICHT_TUE, F7e: NICHT_TUE, F6a: T('mehrzweck'), F6b: T('mehrzweck'), F6c: T('mehrzweck'),
  F7b: alle(NICHT_TUE, kann('randabschluss.art', 'schraeg')),
  G1: FGS_K, G2: alle(FGS_K, kann('fgsMitLsa', false)), G3b: FGS_K, G4: FGS_K, G4b: alle(FGS_K, BAULICH_K), G5: FGS_K, G5b: FGS_K,
  G6: alle(FGS_K, kann('lage', 'knoten_belastet')), 'G6-B': alle(FGS_K, KNOTEN_K),
  G7: alle(FGS_K, kann('haltenSichtrelevantUeber5m', true)), G7b: alle(FGS_K, kann('hvl.vorhanden', true)), G8a: FGS_K,
  G8b: alle(FGS_K, kann('beleuchtung', true)), G9: FGS_K, G10a: FGS_K, G10b: FGS_K,
  H1: FGS_K, H1b: FGS_K, H2: FGS_K, H3a: FGS_K, H3b: FGS_K, H4: FGS_K,
  I5: alle(LSA_K, kann('lsaZeiten.abbiegerKonflikt', true)), 'I7-B2': alle(LSA_K, kann('insel.vorhanden', false)),
  'I7-B3': alle(LSA_K, INSEL_K), I8: alle(LSA_K, INSEL_K),
  'B5-2a': alle(GRUND_K, { eines: [kann('insel.vorhanden', false), kann('insel.art', 'markiert')] }),
  'B5-2b': alle(GRUND_K, BAULICH_K), 'B5-2c': alle(GRUND_K, BAULICH_K), 'B5-W3': alle(GRUND_K, kann('haltestelle.art', 'fahrbahn')),
}
for (const id of REGEL_IDS) {
  const g = KATALOG[id].gruppe
  const block = g === 'Q3' ? Q3_K : g === 'I' ? LSA_K : g === 'B5' ? GRUND_K : null
  if (block && !GELTUNG[id]) GELTUNG[id] = block
  else if (block && g !== 'B5' && g !== 'I') GELTUNG[id] = alle(block, GELTUNG[id]!)
}

/**
 * Felder, die in der Geltung einer Regel stehen, aber die geprüfte Grösse sind (sonst gilt jedes Feld der Geltung als Schalter):
 * E3/E3a prüfen die Sicht nach dem Tempo, F4a die Restbreite nach der Verkehrsmenge, B5-W3 die Fahrbahnhaltestelle selbst,
 * Q3-4 die Lage an der Einmündung, C2/C2b/C2-B die Zone.
 */
export const GEPRUEFT: Partial<Record<RegelId, readonly string[]>> = {
  E3: ['v85', 'vSig'], E3a: ['v85', 'vSig'], F4a: ['mivKlasse'], 'B5-W3': ['haltestelle.art'], 'Q3-4': ['lage'],
  // die Zone ist die geprüfte Grösse des Rechtsverbots (Nachprüfung 20.10.2026)
  C2: ['tempoRegime'], C2b: ['tempoRegime'], 'C2-B': ['tempoRegime'],
}

/** Felder einer Bedingung */
export const felderIn = (b: Bedingung | undefined): string[] => !b ? [] : 'alle' in b ? b.alle.flatMap(felderIn)
  : 'eines' in b ? b.eines.flatMap(felderIn) : 'feld' in b ? [b.feld] : []

/** Schalter einer Regel: Felder ihrer Geltung, ausser der geprüften Grösse (GEPRUEFT) */
export const schalter = (id: RegelId): string[] =>
  [...new Set(felderIn(GELTUNG[id]))].filter(f => !(GEPRUEFT[id] ?? []).includes(f))

/** Regel greift im Fall (Ebene an und Geltung erfüllt); Grundprüfung unabhängig von den Ebenen */
export function gilt(id: RegelId, k: SichtKontext): boolean {
  const d = KATALOG[id] as RegelDef
  if (d.gruppe !== 'B5') {
    if (d.ebene === 'Bern' && !k.ebenen.bern) return false
    if (d.ebene === 'Kanton BE' && !k.ebenen.kantonBE) return false
    if (d.ebene === 'Richtlinie' && k.ebenen.richtlinie === false) return false
  }
  const g = GELTUNG[id]
  return !g || erfuellt(g, k)
}

export interface Bezug {
  id: RegelId
  /** Ergebnis der Regel (Kurztext aus dem Katalog) */
  text: string
  quelle: string
  ebene: Ebene
  /** Grundprüfung bfu (Gruppe B5) */
  grund: boolean
}

const istBefund = (id: RegelId): boolean => ['befund', 'weiche'].includes((KATALOG[id] as RegelDef).art)
let bezugCache: Map<string, Bezug[]> | null = null
/** Regeln mit Befund (befund, weiche), die das Feld als geprüfte Grösse lesen (nicht als Schalter), Reihenfolge des Katalogs */
export function bezuege(pfad: string): Bezug[] {
  if (!bezugCache) {
    bezugCache = new Map()
    for (const id of REGEL_IDS) {
      const d = KATALOG[id] as RegelDef
      if (!istBefund(id)) continue
      const sch = schalter(id)
      for (const p of regelPfade(id)) if (!sch.includes(p)) bezugCache.set(p, [...(bezugCache.get(p) ?? []),
        { id, text: d.ergebnis, quelle: quelleKurz(id), ebene: d.ebene!, grund: d.gruppe === 'B5' }])
    }
  }
  return bezugCache.get(pfad) ?? []
}

const RANG: Record<string, number> = { hart: 0, hart_bericht: 1, weich: 2, hinweis: 3 }
/**
 * «Wozu» im Fall: nur Regeln, die in mindestens einer Querung greifen können (kontexte; leer = alle), Grundprüfung zuerst, dann
 * nach Stärke (hart, mit Bericht, weich, Hinweis), sonst Reihenfolge des Katalogs.
 */
export function bezuegeImFall(pfad: string, kontexte: readonly SichtKontext[]): Bezug[] {
  const r = (b: Bezug) => (b.grund ? -1 : RANG[(KATALOG[b.id] as RegelDef).staerke ?? 'hinweis'])
  return bezuege(pfad).filter(b => !kontexte.length || kontexte.some(k => gilt(b.id, k)))
    .map((b, i) => ({ b, i })).sort((x, y) => r(x.b) - r(y.b) || x.i - y.i).map(x => x.b)
}
/** Höchstzahl der Einträge unter «Wozu»; der Rest aufklappbar */
export const WOZU_MAX = 5
/** «Wozu» geteilt: sichtbar (höchstens WOZU_MAX) und weitere (hinter «weitere anzeigen») */
export const wozuTeilen = (bz: readonly Bezug[]): { sichtbar: Bezug[]; weitere: Bezug[] } =>
  ({ sichtbar: bz.slice(0, WOZU_MAX), weitere: bz.slice(WOZU_MAX) })

/** Regeln, für die das Feld ein Schalter ist (Ablauf-Satz: «bestimmt, ob N Prüfungen gelten») */
export const schaltet = (pfad: string): RegelId[] => REGEL_IDS.filter(id => istBefund(id) && schalter(id).includes(pfad))
/** Geschaltete Regeln, die im Fall greifen können (Ablauf-Satz der Maske nennt sie) */
export const schaltetImFall = (pfad: string, kontexte: readonly SichtKontext[]): RegelId[] =>
  schaltet(pfad).filter(id => !kontexte.length || kontexte.some(k => gilt(id, k)))

/**
 * Satz zu den geschalteten Regeln im Fall (höchstens WOZU_MAX, mit Kurztitel), z. B. «Schaltet im Fall diese Prüfungen ein: Insel bei
 * breiter Fahrbahn (D2), Verzicht auf Insel bei wenig Verkehr (D2a).»
 */
export function schalterText(pfad: string, kontexte: readonly SichtKontext[]): string | null {
  const ids = schaltetImFall(pfad, kontexte)
  if (!ids.length) return null
  const rest = ids.length - WOZU_MAX
  return `Schaltet im Fall ${ids.length === 1 ? 'diese Prüfung' : 'diese Prüfungen'} ein: ${ids.slice(0, WOZU_MAX).map(regelName).join(', ')}` +
    `${rest > 0 ? ` und ${rest} weitere` : ''}.`
}

/** Text «Leer lassen» (ohne die Herkunft im Fall, die die Maske ergänzt) */
export function leerText(pfad: string): string {
  const h = FELD_HILFEN[pfad]
  if (h?.leer) return h.leer
  const n = bezuege(pfad).length
  return `Leer: offen; ${n === 1 ? 'die genannte Prüfung meldet «offen» und zählt' : 'die genannten Prüfungen melden «offen» und zählen'} ` +
    'nie als erfüllt. Keine Pflicht, aber jede Angabe macht das Ergebnis vollständiger.'
}

// ── Fragen je Feld (Runde 2, Verdichtung): offene Angaben als Frage in Alltagssprache statt Feldname ──
// Je Feld der Maske eine eigene Frage (Wächter: jedes Feld hat eine, mit Fragezeichen); dazu Objekt-Felder und Sonderfälle, wie sie
// als fehlende Felder im Befund erscheinen. Klick auf die Frage springt im Panel zum Feld (feldZiel).
export const FRAGEN: Readonly<Record<string, string>> = {
  // Rahmen
  typ: 'Welche Art Querung wird beurteilt?',
  innerorts: 'Liegt die Querung innerhalb der Ortstafeln?',
  vSig: 'Welches Tempo ist hier signalisiert?',
  tempoRegime: 'Liegt die Strasse in einer Tempo-30- oder Begegnungszone?',
  v85: 'Wie schnell fahren hier 85 % der Fahrzeuge (V85)?',
  v85Nachweis: 'Ist das gefahrene Tempo (V85) gemessen?',
  anzeichenSchneller: 'Gibt es Anzeichen, dass hier schneller als erlaubt gefahren wird?',
  strassentyp: 'Ist es eine Durchgangsstrasse oder eine Quartierstrasse?',
  ohneBaulich: 'Ist die Querung ganz ohne bauliche Hilfe (ohne Nase, Einengung, Anhebung)?',
  neuanlage: 'Wird das Lichtsignal neu gebaut?',
  kantonsstrasse: 'Ist es eine Kantonsstrasse?',
  // Nachfrage
  fg5h: 'Wie viele Personen queren in den 5 Spitzenstunden (gezählt oder geschätzt)?',
  fgKlasse: 'Wie viele Personen queren hier ungefähr in den 5 Spitzenstunden?',
  fgSehrHoch: 'Queren hier so viele Personen, dass sie den Verkehr aufhalten?',
  netzQualifiziert: 'Ist die Querung Teil einer amtlichen Fusswegnetzplanung?',
  netz: 'Zu welcher Stufe des Berner Fusswegnetzes gehört die Querung?',
  beduerfnis: 'Gibt es einen besonderen Grund für Vortritt (Schule, Kindergarten, Heim, Haltestelle, Schulweg, Fusswegnetz)?',
  nachfrage: 'Queren die Leute an einer Stelle gebündelt oder verteilt über die Strecke?',
  wunschlinieM: 'Wie weit liegt die Querung neben der Linie, auf der die Leute queren möchten?',
  'fusswegAchse.rechtwinkligUneinsehbar': 'Mündet ein Fussweg direkt und verdeckt auf den Streifen?',
  'fusswegAchse.versatz': 'Kommt der verdeckt mündende Fussweg seitlich versetzt zum Streifen an?',
  'fusswegAchse.umlaufschranke': 'Hat der verdeckt mündende Fussweg am Ende eine Umlaufschranke?',
  // Verkehr
  dtv: 'Wie viele Fahrzeuge fahren hier pro Tag (DTV)?',
  starkBelastet: 'Ist die Strasse stark befahren?',
  mivKlasse: 'Wie viel Autoverkehr fährt an der Einengung?',
  zweirichtung: 'Gibt es Gegenverkehr (keine Einbahnstrasse)?',
  nRichtung: 'Wie viele Fahrstreifen gibt es je Richtung (mit Busstreifen)?',
  radstreifen: 'Gibt es an der Querung einen Radstreifen?',
  busspur: 'Gibt es an der Querung einen Busstreifen?',
  busDurchmarkiert: 'Sind die Balken auch über den Busstreifen markiert?',
  tram: 'Fährt hier ein Tram, und auf eigenem Gleis oder auf der Fahrbahn?',
  tramHaltestellenbereich: 'Liegt die Querung bei einer Tramhaltestelle?',
  balkenAufGleis: 'Sind die Balken auch auf den Gleisen markiert?',
  // Lage
  lage: 'Liegt die Querung auf der Strecke, an einer Kreuzung, an einer Einmündung oder am Kreisel?',
  knotenArmeOhneQuerung: 'Wie viele Arme der Kreuzung haben keine Querung?',
  knotenLsa: 'Hat die Kreuzung ein Lichtsignal für den Verkehr?',
  alleZufahrtsstreifenBelastet: 'Müssen an dieser Zufahrt alle Fahrstreifen den Vortritt gewähren?',
  fahrbahnB: 'Wie breit ist die Fahrbahn von Bordstein zu Bordstein?',
  querdistanzL: 'Wie lang ist jede Teilquerung?',
  abstandFgsM: 'Wie weit ist der nächste Fussgängerstreifen entfernt?',
  abstandLsaM: 'Wie weit ist das nächste Lichtsignal entfernt?',
  verzweigung: 'Liegt die Querung an einer Kreuzung oder Einmündung?',
  verzweigungErkennbar: 'Ist die Kreuzung mit Lichtsignal gut als Kreuzung erkennbar?',
  haltestelleAngrenzend: 'Grenzt eine Bus- oder Tramhaltestelle direkt an die Querung?',
  'haltestelle.art': 'Hält an der Querung ein Bus – auf der Fahrbahn oder in einer Bucht?',
  'haltestelle.lage': 'Liegt die Querung, in Fahrtrichtung des Busses gesehen, hinter, vor oder mitten im Haltebereich?',
  'haltestelle.verdeckt': 'Verdeckt ein haltender Bus die Querenden?',
  'haltestelle.ueberholenUnterbunden': 'Ist das Überholen des haltenden Busses verhindert?',
  rueckversatzM: 'Wie weit liegt die Querung von der Kreuzung zurück?',
  laengsparkierung: 'Wird an der Querung längs parkiert?',
  seitenraumVorParklinieM: 'Wie weit ist das Trottoir über die Parkreihe vorgezogen?',
  einengung: 'Gibt es an der Querung eine Nase oder Einengung?',
  restbreiteM: 'Wie breit ist die Fahrbahn an der engsten Stelle?',
  einengungLaengeM: 'Wie lang ist die Einengung?',
  mzsBreiteM: 'Wie breit ist der Mehrzweckstreifen?',
  mzsMitFgs: 'Führt ein Fussgängerstreifen über den Mehrzweckstreifen?',
  'kurve.radius': 'Wie eng ist die Kurve vor der Querung (Radius)?',
  'kurve.radiusStrasse': 'Wie eng ist die Kurve der Strasse vor dem Streifen (Radius)?',
  'kurve.b1Innerorts50': 'Liegt die Kurve innerorts auf einer Strasse mit Vortritt und 50 km/h?',
  'kurve.b2EinFahrstreifen': 'Hat die Kurve nur einen Fahrstreifen je Richtung?',
  'kurve.b3NachKurvenende': 'Liegt der Streifen unmittelbar nach dem Kurvenende?',
  'kurve.b4Winkel60': 'Ändert die Kurve die Richtung um mindestens 60°?',
  'kurve.b5Gefaelle5': 'Ist das Längsgefälle höchstens 5 %?',
  sichtVorh: 'Wie weit sieht man je Zufahrt auf die Wartefläche (von Hand gemessen)?',
  erkennungM: 'Ab welcher Entfernung sehen Fahrende den Streifen (Markierung oder Signal)?',
  // Insel
  'insel.vorhanden': 'Gibt es eine Insel in der Fahrbahnmitte?',
  'insel.art': 'Ist die Insel gebaut oder nur aufgemalt?',
  'insel.breite': 'Wie tief ist die Insel in Gehrichtung?',
  'insel.kopfUeberstand': 'Wie weit ragt die Inselspitze über den Streifen hinaus?',
  'insel.vertikal': 'Steht auf der Insel ein Pfosten oder Signal?',
  'insel.kopfErhoeht': 'Sind die Inselspitzen erhöht?',
  'insel.pfostenH': 'Wie hoch sind die Pfosten auf der Insel?',
  'insel.furt': 'Wie breit ist der Rollstuhldurchgang durch die Insel?',
  inselMoeglich: 'Hat es Platz für eine Insel?',
  durchfahrt: 'Wie breit ist die Fahrbahn neben der Insel (je Seite)?',
  veloQuerung: 'Queren hier auch Velos und warten auf der Insel?',
  // Ausrüstung
  fgsMitLsa: 'Hat die Querung ein Lichtsignal für Fussgänger?',
  streifenBreite: 'Wie breit ist der Streifen (Länge der Balken)?',
  randAbstand: 'Wie gross ist die Lücke zwischen Balken und Trottoirkante?',
  achsWinkel: 'In welchem Winkel quert der Streifen die Fahrbahn?',
  signal411: 'Steht am Streifen die blaue Tafel Fussgängerstreifen?',
  signal411Insel: 'Steht die blaue Tafel auch auf der Insel?',
  beleuchtung: 'Ist die Querung nachts beleuchtet?',
  schattenfrei: 'Bleiben Streifen und Wartefläche nachts ohne Schatten?',
  'hvl.vorhanden': 'Gibt es vor dem Streifen eine Halteverbotslinie?',
  'hvl.laengeM': 'Wie lang ist die Halteverbotslinie?',
  'hvl.beidseits': 'Ist bei der Einbahnstrasse links und rechts eine Halteverbotslinie markiert?',
  hvlBedarfM: 'Wie lang muss die Halteverbotslinie für die Sicht sein?',
  haltenSichtrelevantUeber5m: 'Stören haltende Autos weiter als 5 m vor dem Streifen die Sicht?',
  haltenSonstVerboten: 'Ist das Halten dort schon anders verboten?',
  reklameUnter20m: 'Steht Werbung näher als 20 m beim Streifen?',
  reklameAusnahme: 'Ist die Werbung nahe am Streifen als Ausnahme bewilligt?',
  annaeherungUeberfahrbar: 'Können Fahrzeuge über die Wartefläche vor dem Streifen fahren?',
  einAusfahrtNah: 'Liegt direkt beim Streifen eine Ein- oder Ausfahrt?',
  blinklicht: 'Gibt es am Streifen ein Blinklicht, und welches?',
  'randabschluss.art': 'Welcher Randstein liegt an der Querung (senkrecht, schräg, hoch)?',
  'randabschluss.hoeheMm': 'Wie hoch ist der Randstein an der Querung?',
  'randabschluss.breiteM': 'Wie breit ist die Schräge des Randsteins?',
  quergefaelle: 'Wie stark fällt die Fahrbahn quer ab?',
  absenkung: 'Wie steil ist die Absenkung des Trottoirs?',
  taktil: 'Gibt es eine ertastbare Markierung für Sehbehinderte?',
  leitlinie: 'Führt eine ertastbare Leitlinie über die Querung?',
  querungLang: 'Ist die Querung so lang, dass Sehbehinderte die Richtung verlieren können?',
  absenkungBeidseits: 'Ist das Trottoir auf beiden Seiten abgesenkt?',
  aufstellflaeche: 'Gibt es auf beiden Seiten Platz zum Warten?',
  parkierungSichtbehindernd: 'Verdecken parkierte Autos die Sicht?',
  // LSA-Zeiten
  'lsaZeiten.L': 'Wie lang ist die Querung von Bord zu Bord?',
  'lsaZeiten.teile': 'Wie lang sind die Teilquerungen an der Insel?',
  'lsaZeiten.inselB': 'Wie tief ist die Insel in Gehrichtung?',
  'lsaZeiten.gelb': 'Wie lange dauert das Gelb für Fussgänger?',
  'lsaZeiten.freigabe': 'Wie lange dauert das Grün für Fussgänger?',
  'lsaZeiten.phasengleich': 'Sind beide Teilquerungen gleichzeitig grün?',
  'lsaZeiten.beideRichtungenImZyklus': 'Kommt man im selben Umlauf in beide Richtungen über die Strasse?',
  'lsaZeiten.wartezeit': 'Wie lange wartet man auf Grün?',
  'lsaZeiten.vorstart': 'Wie viele Sekunden vor den Abbiegenden erhalten Fussgänger Grün?',
  'lsaZeiten.abbiegerKonflikt': 'Fahren Abbiegende während Fussgängergrün?',
  'lsaZeiten.inselGeraet': 'Gibt es auf der Insel einen Taster mit Signal für Sehbehinderte (Ton, Vibration)?',
  'lsaZeiten.inselNurAnmeldung': 'Gibt es Grün nur auf Tastendruck?',
  // Trottoirüberfahrt
  'q3.bebaut': 'Liegt die Einmündung im bebauten Gebiet?',
  'q3.gewerbe': 'Liegt die Einmündung in einem Industrie- oder Gewerbegebiet?',
  'q3.anschlussGewerbe': 'Führt die Seitenstrasse zu Betrieben oder zu Landwirtschaftsland?',
  'q3.ueber': 'Quert die Überfahrt die Seitenstrasse oder die Hauptstrasse?',
  'q3.vSigHaupt': 'Welches Tempo gilt auf der Hauptstrasse?',
  'q3.vSigEinm': 'Welches Tempo gilt in der Seitenstrasse?',
  'q3.nEinm': 'Wie viele Fahrstreifen je Richtung hat die Seitenstrasse?',
  'q3.nHaupt': 'Wie viele Fahrstreifen je Richtung hat die Hauptstrasse?',
  'q3.trottoirBeidseits': 'Gibt es vor und nach der Einmündung ein Trottoir?',
  'q3.winkel': 'In welchem Winkel mündet die Seitenstrasse ein?',
  'q3.knotensichtOk': 'Sieht man beim Ausfahren genügend weit?',
  'q3.hvl5m': 'Gilt je 5 m beidseits der Einmündung ein Halteverbot?',
  'q3.gegenueberEinm': 'Mündet gegenüber eine weitere Strasse ein?',
  'q3.belastungSchwach': 'Hat es auf allen Armen wenig Verkehr?',
  'q3.veloSchule': 'Führt hier eine wichtige Veloroute oder ein Schulweg durch?',
  'q3.einmSiedlungsorientiert': 'Ist die Seitenstrasse eine Quartierstrasse?',
  'q3.zoneEinm': 'Liegt die Seitenstrasse in einer Tempo-30- oder Begegnungszone?',
  'q3.eingangstor': 'Ist die Überfahrt als Eingang in die Zone gestaltet?',
  'q3.hauptInZone': 'Liegt auch die Hauptstrasse in der Zone?',
  'q3.wartezeitEinmS': 'Wie lange wartet man im Mittel beim Ausfahren?',
  'q3.lkwGelegentlich': 'Fahren Lastwagen nur ab und zu?',
  'q3.linienbus': 'Fährt ein Linienbus durch die Seitenstrasse?',
  'q3.lsaKnoten': 'Hat die Einmündung mit der Überfahrt noch ein Lichtsignal?',
  'q3.kreisel': 'Liegt die Einmündung an einem Kreisel?',
  'q3.breiteM': 'Wie breit ist die Trottoirüberfahrt?',
  'q3.randDurchgehend': 'Läuft der Trottoirrand entlang der Hauptstrasse gerade durch?',
  'q3.ueberfahrbarM': 'Wie lang ist der überfahrbare Randabschluss entlang der Hauptstrasse?',
  'q3.begrenzung': 'Wie ist der befahrbare Bereich begrenzt?',
  'q3.erkennbar': 'Ist die Überfahrt aus der Seitenstrasse auf mindestens 10 m als solche erkennbar?',
  'q3.belag': 'Wie geht das Trottoir über die Überfahrt?',
  'q3.quergefaelle': 'Wie gross ist das Quergefälle auf der Überfahrt?',
  'q3.randabschluss': 'Welcher überfahrbare Randabschluss liegt zur Hauptstrasse?',
  'q3.randsteineSenkrecht': 'Sind die Randsteine neben der Überfahrt senkrecht und mindestens 6 cm hoch?',
  'q3.signalisation': 'Ist eine dauernde Signalisation der Überfahrt vorgesehen?',
  'q3.markierung': 'Sind auf der Überfahrt Markierungen vorgesehen oder eine Wartelinie davor in der Seitenstrasse?',
  'q3.taktil': 'Sind beidseits Aufmerksamkeitsfelder mit verbindender Leitlinie markiert?',
  'q3.anrampung': 'Wie steil und wie lang ist die Rampe der Überfahrt?',
  'q3.dtvEinm': 'Wie viele Fahrzeuge fahren pro Tag in der Seitenstrasse?',
  'q3.mivEinmHoch': 'Hat die Seitenstrasse viel Verkehr?',
  // Objekt-Felder und Sonderfälle (fehlende Felder im Befund)
  fgQuelle: 'Sind die Querenden gezählt oder geschätzt?',
  insel: 'Gibt es eine Insel in der Fahrbahnmitte?',
  haltestelle: 'Hält an der Querung ein Bus – auf der Fahrbahn oder in einer Bucht?',
  hvl: 'Gibt es vor dem Streifen eine Halteverbotslinie?',
  fusswegAchse: 'Mündet ein Fussweg direkt auf den Streifen?',
  randabschluss: 'Welcher Randstein liegt an der Querung?',
  kurve: 'Liegt vor der Querung eine Kurve?',
  lsaZeiten: 'Wie sind die Grün- und Gelbzeiten für Fussgänger?',
  q3: 'Wie ist die Einmündung beschaffen (Angaben im Thema «Trottoirüberfahrt»: Gebiet, Tempo, Fahrstreifen, Sicht beim Ausfahren …)?',
  Zufahrten: 'Hinweis: im Sichtrechner ist für diesen Streifen keine Zufahrt geprüft (Zufahrten prüfen bzw. Sichtweite von Hand eingeben).',
}

/** Frage zu einem Feld bzw. fehlenden Feld (unbekannt: Feldname mit Fragezeichen) */
export const frageVon = (feld: string): string => FRAGEN[feld] ?? `${FELD_DEF.get(feld)?.name ?? feld}?`

/** Feld der Maske, zu dem eine Frage springt (Objekt-Feld: erstes Unterfeld; Zählung bzw. Schätzung: Zählung); null: kein Feld */
export function feldZiel(feld: string): string | null {
  if (FELD_DEF.has(feld)) return feld
  if (feld === 'fgQuelle') return 'fg5h'
  const unter = [...FELD_DEF.keys()].find(p => p.startsWith(`${feld}.`))
  return unter ?? null
}
