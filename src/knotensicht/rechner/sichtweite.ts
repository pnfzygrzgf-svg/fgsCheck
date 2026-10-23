// ── Erforderliche Knotensichtweite A für Motorfahrzeuge (VSS 40 273, Ziffer 13.1, Tab. 1) ──
//
// Nur die Zahlenwerte der Tabelle, kein Normtext. Das Zufahrtstempo der vortrittsberechtigten Fahrzeuge wird auf die nächste
// Stufe der Tabelle aufgerundet; über 80 km/h gilt die Stufe 80 mit Hinweis (die Tabelle endet dort).
// Wert nach Strassentyp (E1): Erschliessungs-, Sammel- und Verbindungsstrassen (ES) der untere Wert; Hauptverkehrsstrassen und
// wichtige Verbindungsstrassen (HVS) der Zwischenwert = Mittel von unterem und oberem Wert, auf ganze Meter aufgerundet
// (Entscheid 1 vom 15.10.2026, Praxis Kanton Zug); HVS mit ungünstigen Verhältnissen (mehr als zwei Fahrstreifen, grosse
// Längsneigung, hoher Schwerverkehrsanteil) der obere Wert. Bei ES heben die ungünstigen Verhältnisse nicht an (nur Hinweis).
// Anhaltesichtweite (VSS 40 090b Abb. 2, anhaltesicht.ts): immer gerechnet, als Untergrenze nur bei |i| > 2 % angewendet
// (Entscheid 2): massgebend = max(Wert nach Strassentyp, Anhaltesichtweite bei i). Die Kurven der Abb. 2 sind bei i = 0 auf den
// unteren Wert der Tab. 1 verschoben (Entscheid 15.10.2026), aus Abb. 2 zählt nur die Wirkung der Neigung.

import { anhaltesichtweite, ANHALTESICHT_STUFEN, type Anhaltesicht } from './anhaltesicht'

/** VSS 40 273 Tab. 1: Zufahrtsgeschwindigkeit [km/h] -> [unterer Wert, oberer Wert] der Knotensichtweite A [m] */
export const TAB1: Record<number, [number, number]> = {
  20: [10, 20],
  30: [20, 35],
  40: [35, 50],
  50: [50, 70],
  60: [70, 90],
  70: [90, 110],
  80: [110, 140],
}
/** Stufen der Tab. 1, aufsteigend */
export const TAB1_STUFEN = Object.keys(TAB1).map(Number).sort((a, b) => a - b)
export const TAB1_MAX = TAB1_STUFEN[TAB1_STUFEN.length - 1]
export const TAB1_MIN = TAB1_STUFEN[0]
/** Zielpunkte entlang der Achse bis zu diesem Vielfachen des oberen Werts (Skizze Abschnitt 5) */
export const ZIEL_FAKTOR = 1.5

/** Tempo auf die nächste Stufe der Tab. 1 aufrunden; unter 20 km/h wie 20; über 80 bleibt der Wert (sichtweiteA begrenzt) */
export function tempoStufe(v: number): number {
  if (v > TAB1_MAX) return v
  return TAB1_STUFEN.find(t => t >= v) ?? TAB1_MAX
}

/** Strassentyp der vortrittsberechtigten Strasse: es = Erschliessungs-, Sammel- oder Verbindungsstrasse, hvs = Hauptverkehrs-
 *  strasse oder wichtige Verbindungsstrasse */
export type Strassentyp = 'es' | 'hvs'
export const STRASSENTYP_TEXT: Record<Strassentyp, string> = {
  es: 'Erschliessungs-, Sammel- oder Verbindungsstrasse', hvs: 'Hauptverkehrsstrasse oder wichtige Verbindungsstrasse',
}
/** OSM highway, die als Vorgabe Hauptverkehrsstrasse ergeben (mit den *_link); trunk (Autostrasse) zusätzlich zum Plan, damit
 *  die Vorgabe dort nicht auf dem unteren Wert liegt */
export const HVS_HIGHWAY = ['trunk', 'primary', 'secondary', 'tertiary']
export const istHvsHighway = (hw: string): boolean => HVS_HIGHWAY.includes(hw.replace(/_link$/, ''))

/** ungünstige Verhältnisse (VSS 40 273 Ziffer 13.1) */
export interface Ungunst { fahrstreifen: boolean; neigung: boolean; schwerverkehr: boolean }
export const KEINE_UNGUNST: Ungunst = { fahrstreifen: false, neigung: false, schwerverkehr: false }
export const UNGUNST_TEXT: Record<keyof Ungunst, string> = {
  fahrstreifen: 'mehr als zwei Fahrstreifen', neigung: 'grosse Längsneigung', schwerverkehr: 'hoher Schwerverkehrsanteil',
}
/** Vorgabe «grosse Längsneigung» ab |i| über diesem Wert [%] */
export const NEIGUNG_GROSS_PROZENT = 4
/** Anhaltesichtweite als Untergrenze erst bei |i| über diesem Wert [%] (Tab. 1 gilt für i ≤ ±2 %) */
export const NEIGUNG_EBEN_PROZENT = 2

export type TypStufe = 'unten' | 'zwischen' | 'oben'
const STUFE_TEXT: Record<TypStufe, string> = { unten: 'unterer Wert', zwischen: 'Zwischenwert', oben: 'oberer Wert' }

/** Zwischenwert für Hauptverkehrsstrassen: Mittel von unterem und oberem Wert, auf ganze Meter aufgerundet (Entscheid 1) */
export const zwischenwert = (unten: number, oben: number): number => Math.ceil((unten + oben) / 2)

export interface Sichtweite {
  tempo: number            // Zufahrtstempo (Eingang)
  stufe: number            // Stufe der Tab. 1
  unten: number            // unterer Wert A [m]
  oben: number             // oberer Wert A [m]
  zwischen: number         // Zwischenwert [m]
  typ: Strassentyp
  ungunst: Ungunst
  typStufe: TypStufe       // Wert der Tab. 1 nach Strassentyp und ungünstigen Verhältnissen
  typWert: number          // [m]
  typText: string          // z. B. «Zwischenwert, Hauptverkehrsstrasse»
  neigung: number          // Längsneigung in Fahrtrichtung [%], talwärts negativ
  anhalte: Anhaltesicht | null      // VSS 40 090b Abb. 2 (null unter 30 km/h: keine Kurve)
  anhalteAngewendet: boolean        // |i| > 2 % und Anhaltesichtweite massgebend geprüft
  massgebend: number       // max(typWert, Anhaltesichtweite bei |i| > 2 %) [m]
  massgebendText: string   // Herkunft des massgebenden Werts
  hinweis: string | null   // z. B. über 80 km/h
  hinweise: string[]       // Hinweise zur Anhaltesichtweite
}

const fi = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '') + String(Math.round(x * 10) / 10).replace('-', '').replace('.', ',')

/** Knotensichtweite A nach VSS 40 273 Tab. 1 für das Zufahrtstempo (km/h), den Strassentyp, die ungünstigen Verhältnisse und
 *  die Längsneigung i [%] (in Fahrtrichtung, talwärts negativ); ohne Angaben: ES, eben (unterer Wert, wie E0) */
export function sichtweiteA(tempo: number, typ: Strassentyp = 'es', ungunst: Ungunst = KEINE_UNGUNST, neigung = 0): Sichtweite {
  const ueber = tempo > TAB1_MAX
  const stufe = ueber ? TAB1_MAX : tempoStufe(tempo)
  const [unten, oben] = TAB1[stufe]
  const zwischen = zwischenwert(unten, oben)
  const ungUnstig = ungunst.fahrstreifen || ungunst.neigung || ungunst.schwerverkehr
  const typStufe: TypStufe = typ === 'es' ? 'unten' : ungUnstig ? 'oben' : 'zwischen'
  const typWert = typStufe === 'unten' ? unten : typStufe === 'oben' ? oben : zwischen
  const typText = `${STUFE_TEXT[typStufe]}, ${typ === 'es' ? 'Erschliessungsstrasse' : ungUnstig ? 'Hauptverkehrsstrasse mit ungünstigen Verhältnissen' :
    'Hauptverkehrsstrasse'}`
  const i = Number.isFinite(neigung) ? neigung : 0
  const hinweise: string[] = []
  // Abb. 2 hat keine Kurve unter 30 km/h: dort keine Anhaltesichtweite (die Kurve 30 km/h läge weit über Tab. 1)
  const anhalte = stufe >= ANHALTESICHT_STUFEN[0] ? anhaltesichtweite(tempo, i) : null
  const steil = Math.abs(i) > NEIGUNG_EBEN_PROZENT + 1e-9
  if (!anhalte && steil) hinweise.push(`Tempo unter ${ANHALTESICHT_STUFEN[0]} km/h: Abb. 2 der VSS 40 090b ohne Kurve, Anhaltesichtweite nicht angewendet.`)
  const anhalteAngewendet = !!anhalte && steil
  if (anhalte && anhalteAngewendet) hinweise.push(...anhalte.hinweise)
  const massgebend = anhalteAngewendet ? Math.max(typWert, anhalte!.meter) : typWert
  const massgebendText = anhalteAngewendet && anhalte!.meter > typWert ? `Anhaltesichtweite bei ${fi(i)} %` : typText
  return {
    tempo, stufe, unten, oben, zwischen, typ, ungunst, typStufe, typWert, typText, neigung: i, anhalte, anhalteAngewendet,
    massgebend, massgebendText,
    hinweis: ueber ? `Tempo ${tempo} km/h über der Tab. 1 (bis ${TAB1_MAX} km/h): Werte der Stufe ${TAB1_MAX} km/h, prüfen` : null,
    hinweise,
  }
}

/** Längsneigung aus einer Eingabe lesen [%]: Dezimalkomma bzw. -punkt, Minus auch als «−» oder «–», «%» am Ende erlaubt;
 *  leer = 0; unlesbar bzw. ausserhalb ±30 % = null */
export function neigungLesen(t: string): number | null {
  const x = t.trim().replace(/[−–]/, '-').replace(/%$/, '').trim().replace(',', '.')
  if (x === '' || x === '-' || x === '+') return 0
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(x)) return null
  const v = Number(x)
  return Math.abs(v) <= 30 ? v : null
}

/** Länge der Achse mit Zielpunkten ab K: 1,5 × oberer Wert (bzw. × massgebender Wert, wenn grösser), aufgerundet */
export const zielLaenge = (sw: Pick<Sichtweite, 'oben' | 'massgebend'>): number => Math.ceil(ZIEL_FAKTOR * Math.max(sw.oben, sw.massgebend))

/** erfüllt: ≥ oberer Wert (und ≥ massgebend); massgebend: ≥ massgebender Wert; sonst nicht erfüllt */
export type Status = 'erfuellt' | 'massgebend' | 'nicht_erfuellt'

/** Status je Richtung: erfüllt ab dem oberen Wert (mindestens dem massgebenden), «massgebend» ab dem massgebenden Wert, sonst
 *  nicht erfüllt */
export function sichtStatus(vorhanden: number, sw: Pick<Sichtweite, 'massgebend' | 'oben'>): Status {
  const eps = 1e-6
  if (vorhanden + eps < sw.massgebend) return 'nicht_erfuellt'
  return vorhanden + eps >= sw.oben ? 'erfuellt' : 'massgebend'
}
