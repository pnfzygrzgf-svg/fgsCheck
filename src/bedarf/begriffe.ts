// ── Bedarfsmodul Runde 4: Begriffsliste (Hilfe, Bericht, Verweise in Feldhilfen und Details) ──
//
// Je Begriff ein Name und eine eigene Erklärung in Alltagssprache (ein bis zwei Sätze), kein Text aus Normen. muster: Wortformen, an
// denen die Anzeige den Begriff in einem Text erkennt (reguläre Ausdrücke ohne Flags, ganze Wörter; Gross- und Kleinschreibung wie
// angegeben). Die Hilfe listet alle alphabetisch, der Bericht nur die im Fall vorkommenden, Feldhilfen («Was ist gemeint») und Details
// je Eintrag setzen einen dezenten Verweis (Name mit «?»). Die Zusammenfassung bleibt ohne Markierung.

import type { BefundBlatt } from './befundblatt'
import { eintragSatz, grundKopf } from './kompakt'
import { frageVon } from './feldhilfen'
import { feldName } from './felder'
import { lesetext } from './lesetext'
import { zusammenfassungBlatt, zusammenfassungText } from './zusammenfassung'

export interface Begriff {
  id: string
  /** Name in der Liste */
  name: string
  /** eigene Erklärung, ein bis zwei Sätze */
  text: string
  /** Wortformen (reguläre Ausdrücke, ganze Wörter) */
  muster: readonly string[]
}

export const BEGRIFFE: readonly Begriff[] = [
  { id: 'v85', name: 'V85 (gefahrenes Tempo)', muster: ['V85'],
    text: 'Das Tempo, das 85 von 100 Fahrzeugen nicht überschreiten, aus einer Messung. Es zeigt, wie schnell tatsächlich gefahren wird, nicht was erlaubt ist.' },
  { id: 'dtv', name: 'DTV (Fahrzeuge pro Tag)', muster: ['DTV', 'Fahrzeuge pro Tag', 'Fz/Tag'],
    text: 'Durchschnittlicher täglicher Verkehr: wie viele Motorfahrzeuge an einem mittleren Tag vorbeifahren, beide Richtungen zusammen.' },
  { id: 'lsa', name: 'Lichtsignalanlage (LSA)', muster: ['LSA', 'Lichtsignal(?:anlagen?|e|s)?'],
    text: 'Ampel: regelt mit Rot, Gelb und Grün, wer fahren bzw. gehen darf; an einer Querung mit eigenem Signal für Fussgänger.' },
  { id: 'warteflaeche', name: 'Wartefläche (Annäherungsbereich)', muster: ['Wartefläche[n]?', 'Annäherungsbereich(?:e|s)?'],
    text: 'Die Fläche am Trottoirrand vor dem Streifen, auf der Querende warten. Fahrende sollen sie früh genug sehen; sie entspricht ungefähr dem Annäherungsbereich der Fachsprache.' },
  { id: 'erkennung', name: 'Erkennungsdistanz', muster: ['Erkennungsdistanz'],
    text: 'Ab welcher Entfernung Fahrende merken, dass ein Fussgängerstreifen kommt, an den Balken oder an der blauen Tafel.' },
  { id: 'sichtweite', name: 'Sichtweite', muster: ['Sichtweiten?'],
    text: 'Wie weit Fahrende vor der Querung die Wartefläche frei sehen. Wie viel nötig ist, hängt vom Tempo ab.' },
  { id: 'anhalte', name: 'Anhaltesichtweite', muster: ['Anhaltesichtweiten?'],
    text: 'Strecke, die ein Fahrzeug vom Erkennen eines Hindernisses bis zum Stillstand braucht: Reaktionsweg und Bremsweg. Sie wächst mit dem Tempo.' },
  { id: 'furt', name: 'Fussgängerfurt', muster: ['Fussgängerfurt', 'Furt'],
    text: 'Querung über eine Insel ohne Balken und ohne Vortritt: die Insel teilt den Weg über die Fahrbahn in zwei kurze Stücke.' },
  { id: 'ohneVortritt', name: 'Querung ohne Vortritt', muster: ['[Qq]uerung(?:en)? ohne Vortritt'],
    text: 'Stelle zum Queren ohne Fussgängerstreifen: Querende warten, bis die Fahrbahn frei ist. Oft mit Trottoirnase, Einengung oder Anhebung, damit der Weg kurz und gut sichtbar ist.' },
  { id: 'trottoirueberfahrt', name: 'Trottoirüberfahrt', muster: ['Trottoirüberfahrt(?:en)?'],
    text: 'Das Trottoir läuft auf gleicher Höhe über die Einmündung einer Seitenstrasse weiter; Fahrzeuge fahren darüber wie über eine Schwelle.' },
  { id: 'mehrzweck', name: 'Mehrzweckstreifen', muster: ['Mehrzweckstreifens?'],
    text: 'Markierter Streifen in der Fahrbahnmitte, den Fahrzeuge zum Abbiegen und Querende als Zwischenhalt nutzen.' },
  { id: 'insel', name: 'Schutzinsel (Mittelinsel)', muster: ['Schutzinseln?', 'Mittelinseln?', 'Inseln?'],
    text: 'Gebaute oder aufgemalte Fläche in der Fahrbahnmitte, auf der Querende anhalten und jede Fahrtrichtung für sich queren. Als Schutz zählt nur eine gebaute Insel, eine aufgemalte erfüllt keine Inselpflicht.' },
  { id: 'durchfahrt', name: 'Durchfahrt (neben der Insel)', muster: ['Durchfahrt(?:en)?'],
    text: 'Breite der Fahrbahn, die neben einer Insel je Fahrtrichtung bleibt. Davon hängt ab, ob Autos und Lastwagen Velos dort überholen können.' },
  { id: 'eigentrassee', name: 'Eigentrassee (eigenes Gleis)', muster: ['Eigentrassee', 'eigene[mnrs]? Gleis(?:körper)?'],
    text: 'Das Tram fährt auf einem eigenen, vom Autoverkehr getrennten Streifen; sonst fährt es auf der Fahrbahn im Verkehr mit.' },
  { id: 'haltestelle', name: 'Fahrbahnhaltestelle und Busbucht', muster: ['Fahrbahnhaltestellen?', 'Busbucht(?:en)?', 'Bucht'],
    text: 'An einer Fahrbahnhaltestelle hält der Bus auf der Fahrbahn, der Verkehr dahinter wartet oder überholt; in einer Busbucht hält er in einer Nische daneben.' },
  { id: 'basisnetz', name: 'Basisnetz (Richtplan Fussverkehr)', muster: ['Basisnetz(?:es)?', 'Richtplan Fussverkehr', 'Fusswegnetz(?:es|planung)?'],
    text: 'Der Richtplan Fussverkehr der Stadt Bern legt die wichtigen Fusswege fest; das Basisnetz verbindet Wohngebiete, Schulen, Haltestellen und Zentren. Feinverteiler sind die übrigen Wege dazwischen.' },
  { id: 'publikum', name: 'publikumsintensiv', muster: ['publikumsintensiv\\p{L}*', 'publikumsattraktiv\\p{L}*'],
    text: 'Orte und Achsen mit sehr vielen Fussgängern, etwa Altstadt, Bahnhof oder Einkaufsstrassen; im Richtplan Fussverkehr eigens bezeichnet.' },
  { id: 'strassentyp', name: 'verkehrsorientiert und siedlungsorientiert', muster: ['verkehrsorientiert\\p{L}*', 'siedlungsorientiert\\p{L}*',
    'Durchgangsstrassen?', 'Quartierstrassen?'],
    text: 'Verkehrsorientierte Strassen dienen vor allem dem Durchgangsverkehr (Haupt- und Verbindungsstrassen), siedlungsorientierte vor allem dem Quartier (Quartier- und Sammelstrassen): Anwohnende, Aufenthalt, Zufahrt.' },
  { id: 'zone', name: 'Tempo-30-Zone und Strecke', muster: ['Tempo-30-Zonen?', 'Tempo-Regime'],
    text: 'Eine Tempo-30-Zone ist ein ganzes Gebiet mit Zonentafel am Eingang, mit eigenen Regeln. Eine Strasse mit Tempo 30 ohne Zonentafel ist eine Strecke.' },
  { id: 'begegnungszone', name: 'Begegnungszone', muster: ['[Bb]egegnungszonen?'],
    text: 'Zone mit Tempo 20 und Zonentafel, in der Fussgänger die ganze Fläche benützen und Vortritt haben.' },
  { id: 'grund', name: 'besonderer Grund für Vortritt', muster: ['Vortrittsbedürfnis(?:se)?', '[Bb]esondere[nrs]? Grund'],
    text: 'Ein Anlass, der in einer Tempo-30-Zone dennoch einen Fussgängerstreifen begründen kann, etwa eine Schule, ein Kindergarten, ein Heim oder eine Haltestelle in der Nähe.' },
  { id: 'hvl', name: 'Halteverbotslinie', muster: ['Halteverbotslinien?'],
    text: 'Gelbe Markierung am Fahrbahnrand vor dem Streifen, die das Halten verbietet, damit wartende Fussgänger sichtbar bleiben.' },
  { id: 'signal411', name: 'Signal 4.11 (blaue Tafel)', muster: ['Signal 4\\.11', '[Bb]laue Tafel'],
    text: 'Die blaue Tafel mit dem Fussgänger auf Balken; sie zeigt den Fussgängerstreifen an. 4.11 ist ihre Nummer in der Signalisationsverordnung.' },
  { id: 'taktil', name: 'Taktil-visuelle Markierung und Leitlinie', muster: ['[Tt]aktil\\p{L}*', '[Ee]rtastbare[nrs]?', 'Leitlinien?', 'Aufmerksamkeitsfeld(?:er)?'],
    text: 'Weisse Linien und Felder mit Rillen, die Blinde mit dem Stock ertasten und Sehbehinderte am Kontrast erkennen; die Leitlinie führt über die Querung, das Aufmerksamkeitsfeld zeigt ihren Anfang an.' },
  { id: 'absenkung', name: 'Absenkung und Anrampung', muster: ['Absenkung(?:en)?', 'abgesenkt', 'Anrampung', 'Rampe'],
    text: 'Absenkung: das Trottoir ist zur Fahrbahn hin abgesenkt, damit man mit Rollstuhl oder Kinderwagen ohne Stufe hinunterkommt. Anrampung: die Rampe einer Trottoirüberfahrt.' },
  { id: 'rueckversatz', name: 'Rückversatz', muster: ['Rückversatz'],
    text: 'Wie weit die Querung von der Kreuzung bzw. Einmündung in die Strasse hinein zurückliegt.' },
  { id: 'radius', name: 'Kurvenradius (Abbiegeradius)', muster: ['Kurvenradius', 'Abbiegeradius', 'Radius'],
    text: 'Radius des Bogens, den ein Fahrzeug fährt, etwa beim Abbiegen: je kleiner, desto enger die Kurve und desto langsamer die Fahrt.' },
  { id: 'fahrstreifen', name: 'Mehrere Fahrstreifen je Richtung', muster: ['Fahrstreifen je Richtung', 'zweistreifig\\p{L}*', 'Zweistreifigkeit'],
    text: 'Zwei oder mehr Fahrstreifen in derselben Richtung: ein Fahrzeug kann dann neben einem anhaltenden weiterfahren, das ihm die Sicht auf Querende verdeckt.' },
  { id: 'bigFive', name: 'Big Five (Grundprüfung)', muster: ['Big Five', 'Grundprüfung'],
    text: 'Die fünf Punkte der bfu für einen sicheren Fussgängerstreifen: Sicht, Schutzinsel, ein Fahrstreifen je Richtung, Beleuchtung und genug Querende. fgsCheck prüft sie zuerst, als Grundprüfung.' },
  { id: 'verbindlichkeit', name: 'Muss, Soll, Hinweis', muster: ['Muss', 'Muss-\\p{L}+', 'Soll-\\p{L}+'],
    text: 'Wie verbindlich eine Prüfung nach dem Wortlaut ihrer Quelle ist: Muss heisst verlangt, Soll heisst empfohlen (Abweichung begründen), Hinweis heisst prüfen ohne Wertung. Rechtlich verbindlich ist nur die Ebene Recht.' },
  { id: 'annahme', name: 'Annahme, Vorbelegung, bestätigt', muster: ['Annahmen?', 'Vorbelegung', 'vorbelegt\\p{L}*', 'bestätigt', 'Schätzung(?:en)?'],
    text: 'Vorbelegt ist, was die App aus Daten übernimmt; eine Annahme ist ein Vorschlag ohne sichere Grundlage, eine Schätzung ein ungefährer Wert. Bestätigt heisst: von Hand als zutreffend übernommen.' },
  { id: 'ebene', name: 'Ebene', muster: ['Ebenen?'],
    text: 'Woher eine Regel stammt: Recht, Norm, Standard der Stadt Bern, Arbeitshilfe des Kantons Bern oder Richtlinie einer Fachstelle. Bern, Kanton und Richtlinie lassen sich ein- und ausschalten.' },
  { id: 'bericht', name: 'verkehrstechnischer Bericht', muster: ['verkehrstechnische[mnrs]? Bericht'],
    text: 'Begründung einer Fachperson, warum eine Abweichung hier vertretbar ist, mit Angaben zu Verkehr, Sicht und Sicherheit.' },
  { id: 'spitzenstunden', name: '5 Spitzenstunden', muster: ['Spitzenstunden?'],
    text: 'Die Stunden mit den meisten Querenden; gezählt werden die fünf stärksten eines Tages, auch wenn sie nicht aufeinander folgen.' },
  { id: 'knoten', name: 'Knoten (Kreuzung, Einmündung)', muster: ['Knoten', 'Kreuzung(?:en)?', 'Einmündung(?:en)?'],
    text: 'Ort, an dem sich Strassen treffen: an einer Kreuzung geht es in mehrere Richtungen weiter, an einer Einmündung endet eine Strasse an einer anderen.' },
  // Runde 5 (Muster 5): Abkürzungen und Quellen, die gedruckt werden
  { id: 'osm', name: 'OSM (OpenStreetMap)', muster: ['OSM', 'OpenStreetMap'],
    text: 'Freie Weltkarte, von Freiwilligen erfasst. fgsCheck liest daraus Strassen, Übergänge und Tempoangaben; sie kann lückenhaft sein.' },
  { id: 'av', name: 'AV (amtliche Vermessung)', muster: ['AV', 'AV-\\p{L}+'],
    text: 'Amtlicher Plan der Kantone mit Fahrbahn, Trottoir, Inseln und Gebäuden. fgsCheck misst daraus Breiten und Bordkanten.' },
  { id: 'sichtrechner', name: 'Sichtrechner', muster: ['Sichtrechners?'],
    text: 'Teil von fgsCheck, der je Zufahrt prüft, ob man die Wartefläche weit genug sieht (Parkfelder, Bäume, Gebäude im Sichtfeld).' },
  { id: 'geoportal', name: 'Geoportal Stadt Bern', muster: ['Geoportals?'],
    text: 'Kartendienst der Stadt Bern; fgsCheck liest daraus u. a. Tempo, Verkehrsmengen, Schulen und das Fusswegnetz.' },
  { id: 'fgs', name: 'FGS (Fussgängerstreifen)', muster: ['FGS'],
    text: 'Abkürzung für Fussgängerstreifen: gelb markierte Querung, auf der Fussgänger Vortritt haben.' },
  { id: 'miv', name: 'MIV (Autoverkehr)', muster: ['MIV'],
    text: 'Motorisierter Individualverkehr: Autos und Motorräder, ohne Bus und Tram.' },
  { id: 'slg', name: 'SLG 202 (Beleuchtung)', muster: ['SLG(?: 202)?'],
    text: 'Richtlinie der Schweizer Licht Gesellschaft zur Beleuchtung von Fussgängerstreifen: wie hell Streifen und Wartefläche sein sollen.' },
  { id: 'abbieger', name: 'Abbiegende Zufahrt', muster: ['Abbieger', 'Abbiegende[nr]?', 'abbiegende[nr]? Zufahrt(?:en)?'],
    text: 'Fahrzeuge, die aus der Querstrasse in die gequerte Strasse einbiegen und so auf den Streifen zufahren.' },
  { id: 'teilquerung', name: 'Teilquerung', muster: ['Teilquerung(?:en)?'],
    text: 'Ein Stück einer Querung bis zu einer Insel; über eine Insel quert man in zwei Teilquerungen.' },
  { id: 'einengung', name: 'Einengung (Trottoirnase)', muster: ['Einengung(?:en)?', 'Trottoirnasen?', 'Nase'],
    text: 'Stelle, an der das Trottoir in die Fahrbahn vorgezogen ist: der Weg über die Fahrbahn wird kürzer, und Querende sind besser zu sehen.' },
  { id: 'projektentscheid', name: 'Projektentscheid', muster: ['Projektentscheide?'],
    text: 'Festlegung der App fgsCheck, wo die Grundlagen nichts sagen oder eine Vereinfachung nötig ist; sie ist kein externes Werk und nicht verbindlich.' },
  { id: 'ziffer', name: 'Ziffer', muster: ['Ziffer'],
    text: 'Nummerierter Abschnitt einer Norm oder Fachdokumentation (etwa Ziffer 24), damit sich die Stelle im Werk finden lässt.' },
  { id: 'sr', name: 'SR (Systematische Rechtssammlung)', muster: ['SR(?= \\d)', 'Systematische Rechtssammlung'],
    text: 'Systematische Rechtssammlung des Bundes: unter dieser Nummer wird ein Erlass des Bundes geführt, etwa SR 741.21 für die Signalisationsverordnung.' },
]

const RE = new Map(BEGRIFFE.map(b => [b.id, new RegExp(`(?<![\\p{L}\\p{N}])(?:${b.muster.join('|')})(?![\\p{L}\\p{N}])`, 'u')]))

/** Begriffe, die in einem Text vorkommen (Reihenfolge der Liste) */
export const begriffeIn = (text: string): Begriff[] => (text ? BEGRIFFE.filter(b => RE.get(b.id)!.test(text)) : [])

/** Begriffe alphabetisch nach Name (Hilfe) */
export const begriffeAlphabetisch = (): Begriff[] =>
  [...BEGRIFFE].sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))

/** Texte eines Befundblatts, wie Bericht und Panel sie zeigen (Zusammenfassung, Grundprüfung, Einträge, Empfehlung, Annahmen) */
export function blattTexte(b: BefundBlatt): string[] {
  // Runde 5 (Stelle 51): auch Masse, Eingaben, Annahmen und Hinweise, wie der Bericht sie druckt
  const t: string[] = [zusammenfassungText(zusammenfassungBlatt(b, 'bericht')), b.typText, b.begruendung, ...b.befund.empfehlung.zusatz,
    ...b.annahmen, ...b.grund.annahmen, ...b.hinweise, ...b.befund.masse.flatMap(m => [m.groesse, m.ist, m.soll, m.zusatz ?? '']),
    ...[...b.gebildet.herkunft].flatMap(([p, h]) => (h.zustand === 'offen' ? [] : [feldName(p), lesetext(h.text)]))]
  if (b.grund.gilt) {
    const k = grundKopf(b.grund)
    for (const z of [...k.zeilen, ...(k.weitere ? [k.weitere] : [])]) t.push(z.satz, z.zusatz ?? '', ...z.fragen.map(frageVon))
    for (const p of b.grund.punkte) t.push(p.titel)
  } else if (b.grund.grund) t.push(b.grund.grund)
  for (const x of b.befund.alle) t.push(eintragSatz(x), x.detail ?? '', x.normHinweis ?? '', ...(x.fehlend ?? []).map(frageVon))
  for (const o of b.offen) t.push(frageVon(o.feld))
  return t.filter(Boolean)
}

/** Begriffe, die im Fall vorkommen (Bericht), alphabetisch */
export function begriffeImFall(blaetter: readonly BefundBlatt[]): Begriff[] {
  const text = blaetter.flatMap(blattTexte).join('\n')
  const ids = new Set(begriffeIn(text).map(b => b.id))
  return begriffeAlphabetisch().filter(b => ids.has(b.id))
}
