// ── Sichtrechner: Querung ohne Vortritt (Bedarfsmodul E1, Entscheid 6) ──
//
// Für einen Streifen, den der Fall als «Querung ohne Vortritt» führt (Furt bzw. Nase, Einengung, ohne bauliche Massnahme), gilt
// statt Tab. 1 von VSS 40 241 die Sichtweite nach VSS 40 240 Z. 8.2: Soll = max(v [m/s] · L / 1,2 m/s; Anhaltesichtweite(v)) je
// Teilquerung, v = Tempo der Zufahrt (OSM bzw. von Hand), L = Querdistanz Bord–Bord des (Teil-)Streifens entlang der Achse; bei
// nur markierter Insel die ganze Fahrbahn. Gerundet auf 0,1 m aufwärts. Sichtfeld, Sichtpunkte und Hindernisprüfung bleiben die
// des Fussgängerstreifens; die Kurvenregeln (bfu, VSS 40 241 Tab. 2) gelten nur für Fussgängerstreifen und entfallen hier.
// Formel und Tabelle aus src/bedarf (eine Quelle), Gehgeschwindigkeit aus dem Regelkatalog (E3).
//
// Reichweite (Korrektur E1, Prüfbefund 20.10.2026): Die Soll-Sichtweite ohne Vortritt kann weit über 75 m liegen (50 km/h, L 18 m:
// 209 m). Geladen sind aber nur Daten für die Sichtweiten des Fussgängerstreifens: amtliche Parkfelder und Bäume bis
// KATASTER_PARK_M (120 m) um den Umriss der Streifen (Herleitung in vorschlaege.ts), die AV ±150 m um den Ladeort, wobei ein
// Streifen bis NACHLADEN_M (30 m) vom Ladeort liegen darf – also ebenfalls 120 m um den Umriss (abdeckung.ts). Um die Sichtpunkte
// sucht die Rechnung zudem einige Meter (1,5 m Abstand zu Parkfeldern, Sichtpunkt am Umriss, Sichtfeld zum Wartebereich): davon
// SICHT_RESERVE_M (10 m) ab. Belegt ist die Sicht darum bis REICHWEITE_SICHT_M = 110 m ab dem Streifenrand. Liegt das Soll
// darüber, prüft der Sichtrechner bis dort («geprüft bis 110 m, darüber nicht geprüft», ZufahrtErgebnis.geprueftBisM); ein
// Wegende bzw. Knoten jenseits davon gilt nicht als Grenze (er kann an der Grenze der OSM-Daten liegen). Das Befundblatt führt
// die Sicht dann als offen, nicht als erfüllt.
//
// Abbieger (Nutzerentscheid 30.10.2026, Variante A) – eigene Annahme der App, keine Normvorgabe: Z. 8.2 (S. 8) ergäbe v · L / 1,2 m/s
// ohne Grenze. Die App nimmt an, dass ein Fahrzeug weiter hinten auf seiner Strasse für die Querung noch nicht als Einbieger erkennbar
// ist und im Abbiegen langsam fährt. Für abbiegende Zufahrten gilt darum Soll = min(Z. 8.2 mit dem Tempo der Strasse des Arms; Länge
// der Fahrlinie bis zum Beginn des Abbiegens), mindestens SPUR_MIN_M (abbiegen.ts): gemessen vom Streifen entlang der Fahrlinie bis
// zum Bogenende auf dem Arm (Strecke bis zum Knoten, an dem das Fahrzeug abbiegt, und Bogen), nie entlang des Arms darüber hinaus und
// nie über einen weiteren Knoten. Greift die Grenze, ist das Soll eine Annahme (Nutzerentscheid 30.10.2026): die Quelle nennt sie und
// den ungekürzten Normwert («Annahme: bis Beginn des Abbiegens; nach VSS 40 240 Z. 8.2 wären es 89,1 m»), ZufahrtErgebnis.annahmeGrenze
// trägt beides, das Befundblatt führt das Soll als Annahme. Das Tempo von Hand je Zufahrt bleibt wirksam. Gerade Zufahrten unverändert.
//
// Einmündung (Nutzerentscheid 30.10.2026) – ebenfalls eigene Annahme der App: mündet die gequerte Strasse unmittelbar an der Querung in
// eine andere (eine Zufahrt der Querung hat ihren nächsten Knoten höchstens EINMUENDUNG_NAH_M vom Streifenrand, dort setzt sich die
// gequerte Strasse nicht fort, und es biegen Fahrzeuge ab), gilt für die Gegenseite – Fahrzeuge, die in der gequerten Strasse auf die
// Querung zufahren – genau eine Zufahrt entlang der gequerten Strasse, höchstens bis zum nächsten Knoten: Soll = min(Normwert; Strecke
// bis zum Knoten, auf 0,1 m aufwärts), mindestens SPUR_MIN_M, keine Fortsetzung durch den Knoten; die Abbieger an diesem Knoten entfallen
// («mitgeprueft»). Greift die Grenze, nennt die Quelle die Annahme und den Normwert (annahmeGrenze wie bei den Abbiegern). Die Abbieger
// an der Einmündung selbst bleiben wie oben; Querungen ohne Einmündung und Fussgängerstreifen unverändert.
//
// Begegnungszone (Nutzerentscheid 30.10.2026): liegt eine unmarkierte OSM-Querung ohne Wahl am Streifen in einer Begegnungszone
// (Strecke oder Zone wie im Bedarfsmodul, rechneFall), hat der Fussverkehr dort Vortritt. Nach Z. 8.2 (S. 8) gilt dann die
// Anhaltesichtweite nach dem Tempo der Zufahrt (Tab. AHS_40240), nicht die Formel mit L; Typ «begegnungszone» derselben Rechnung
// (keine Kurvenregeln, Abbieger höchstens bis zum Beginn des Abbiegens wie oben, Reichweite wie oben).

import { sollSichtOhneVortritt, formelSicht } from '../bedarf/sichtOhneVortritt'
import { ahs, AHS_40240 } from '../bedarf/tabellen'
import { KATALOG } from '../bedarf/katalog'
import { KATASTER_PARK_M } from './vorschlaege'
import type { QuerungSicht } from './typen'

export const GEH_V = KATALOG.E3.werte.gehV
/** Obergrenze des Tempos für die Länge der Fahrlinie (höchstes Tempo der Auswahl von Hand) */
export const TEMPO_MAX_SPUR = 80
/** Abzug von der Kataster-Reichweite für die Suche um die Sichtpunkte (Herleitung oben) */
export const SICHT_RESERVE_M = 10
/** Mit den geladenen Daten belegte Sichtweite ab dem Streifenrand (110 m) */
export const REICHWEITE_SICHT_M = KATASTER_PARK_M - SICHT_RESERVE_M
/** höchstes Tempo der Anhaltesichtweiten-Tabelle */
const AHS_MAX_V = Math.max(...Object.keys(AHS_40240).map(Number))

export interface OhneVortritt { typ: QuerungSicht; L: number; ganzeFahrbahn: boolean }

const f1 = (x: number) => x.toFixed(1).replace('.', ',')
const auf01 = (x: number) => Math.ceil(x * 10 - 1e-9) / 10

/** Soll-Sichtweite [m] für Tempo v [km/h] und Querdistanz L [m], auf 0,1 m aufwärts */
export const sichtOhneVortritt = (v: number, L: number): number => auf01(sollSichtOhneVortritt(v, L, GEH_V))

/** Quelle der Sichtweite (Spalte «Sichtweite») */
export const quelleOhneVortritt = (L: number): string => `VSS 40 240 Z. 8.2 (L ${f1(L)} m)`
/** Zusatz der Quelle, wenn eine abbiegende Zufahrt nur bis zum Beginn des Abbiegens gemessen ist */
export const BIS_ABBIEGEN = 'bis Beginn des Abbiegens'
/** Grenze der Gegenseite an einer Einmündung (eigene Annahme der App, 30.10.2026) */
export const BIS_KNOTEN = 'bis zum nächsten Knoten'
/** Einmündung: nächster Knoten einer Zufahrt höchstens so weit vom Streifenrand (m), ohne Fortsetzung der gequerten Strasse, mit Abbiegern */
export const EINMUENDUNG_NAH_M = 15
/** Zahl wie in der Anzeige: höchstens eine Nachkommastelle, Komma */
const zahl = (x: number): string => String(Math.round(x * 10) / 10).replace('.', ',')
/** Grenze der App unter dem Normwert (eigene Annahme, keine Normvorgabe; ZufahrtErgebnis.annahmeGrenze) */
export interface AnnahmeGrenze { grenze: string; normM: number }
/** Quelle einer Sichtweite, die eine Annahme der App unter den Normwert kürzt: Annahme und ungekürzter Normwert (ohne Vortritt mit L) */
export const quelleAnnahme = (o: Pick<OhneVortritt, 'typ' | 'L'>, a: AnnahmeGrenze): string => (istBgz(o)
  ? `Annahme: ${a.grenze}; Anhaltesichtweite nach VSS 40 240 Z. 8.2 wären ${zahl(a.normM)} m`
  : `Annahme: ${a.grenze}; nach VSS 40 240 Z. 8.2 wären es ${zahl(a.normM)} m (L ${f1(o.L)} m)`)
/** Kurzform für Befundtexte: «Annahme: bis Beginn des Abbiegens; VSS 40 240 Z. 8.2: 89,1 m» */
export const annahmeKurz = (a: AnnahmeGrenze, bgz: boolean): string =>
  `Annahme: ${a.grenze}; ${bgz ? 'Anhaltesichtweite nach ' : ''}VSS 40 240 Z. 8.2: ${zahl(a.normM)} m`
/** Quelle der Sichtweite eines Abbiegers, der vor dem Soll nach Z. 8.2 abbiegt (normM: ungekürzter Wert nach Z. 8.2) */
export const quelleOhneVortrittAbbiegen = (L: number, normM: number): string =>
  quelleAnnahme({ typ: 'ohne_vortritt', L }, { grenze: BIS_ABBIEGEN, normM })

/** Querung in der Begegnungszone (Vortritt Fussverkehr) statt ohne Vortritt */
export const istBgz = (o: Pick<OhneVortritt, 'typ'> | null | undefined): boolean => o?.typ === 'begegnungszone'
/** Soll [m] der Querung für Tempo v [km/h]: ohne Vortritt nach der Formel mit L, in der Begegnungszone die Anhaltesichtweite */
export const sollQuerung = (o: OhneVortritt, v: number): number => (istBgz(o) ? ahs(v) : sichtOhneVortritt(v, o.L))
/** Quelle der Sichtweite in der Begegnungszone */
export const QUELLE_BGZ = 'VSS 40 240 Z. 8.2: Anhaltesichtweite (Begegnungszone)'
/** Quelle der Sichtweite der Querung (Spalte «Sichtweite») */
export const quelleQuerung = (o: OhneVortritt): string => (istBgz(o) ? QUELLE_BGZ : quelleOhneVortritt(o.L))
/** Quelle der Sichtweite eines Abbiegers, der vor dem Soll abbiegt (normM: ungekürztes Soll) */
export const quelleQuerungAbbiegen = (o: OhneVortritt, normM: number): string => quelleAnnahme(o, { grenze: BIS_ABBIEGEN, normM })
/** Länge der Fahrlinie der Querung (Begegnungszone: höchstens die Anhaltesichtweite, wie beim Fussgängerstreifen) */
export const weiteQuerung = (o: OhneVortritt, basis: number): number => (istBgz(o) ? basis : weiteOhneVortritt(o.L, basis))

/** Annahme je Streifen in der Begegnungszone: Anhaltesichtweite je Tempo */
export function annahmeBgz(tempi: number[]): string {
  const t = [...new Set(tempi)].sort((a, b) => a - b)
  const ueber = t.filter(v => v > AHS_MAX_V)
  return 'Querung in der Begegnungszone (Vortritt Fussverkehr): Sichtweite = Anhaltesichtweite nach VSS 40 240 Z. 8.2 (S. 8)' +
    (t.length ? `; ${t.map(v => `${v} km/h: ${ahs(v)} m`).join('; ')}` : '') + '. v = Tempo der Zufahrt (V85 nur über das Tempo von Hand). ' +
    'Abbieger: Sicht höchstens bis zum Beginn des Abbiegens (eigene Annahme der App, keine Normvorgabe; ohne sie gälte die ' +
    'Anhaltesichtweite ungekürzt). Die Kurvenregeln für Fussgängerstreifen gelten hier nicht.' +
    (ueber.length ? ` Tempo über ${AHS_MAX_V} km/h (${ueber.join(', ')} km/h): verwendet ist der Wert ${ahs(AHS_MAX_V)} m.` : '')
}

/** Annahme je Streifen: Formel mit den Zahlen (Formelteil wie das Ergebnis auf 0,1 m aufwärts) */
export function annahmeOhneVortritt(o: OhneVortritt, tempi: number[], randAngenommen = false): string {
  const t = [...new Set(tempi)].sort((a, b) => a - b)
  const teile = t.map(v => `${v} km/h: max(${f1(auf01(formelSicht(v, o.L, GEH_V)))}; ${ahs(v)}) = ${f1(sichtOhneVortritt(v, o.L))} m`)
  const ueber = t.filter(v => v > AHS_MAX_V)
  return `Querung ohne Vortritt (${o.typ === 'furt' ? 'Furt' : 'Nase, Einengung bzw. ohne Massnahme'}): Sichtweite nach VSS 40 240 Z. 8.2 = ` +
    `max(v · L / ${f1(GEH_V)} m/s; Anhaltesichtweite), L = ${f1(o.L)} m${o.ganzeFahrbahn ? ' (Insel nur markiert: ganze Fahrbahn)' : ''}` +
    (randAngenommen ? ' aus angenommenen Bordkanten (keine passende AV-Sehne, 0,3 m vor den Enden) – prüfen' : '') +
    (teile.length ? `; ${teile.join('; ')}` : '') + '. v = Tempo der Zufahrt (V85 nur über das Tempo von Hand). Abbieger: Sicht ' +
    'höchstens bis zum Beginn des Abbiegens (Strecke bis zu ihrem Knoten und Bogen) – eigene Annahme der App, keine Normvorgabe: nach ' +
    'Z. 8.2 gälte die Formel ohne Grenze; die App nimmt an, dass ein Fahrzeug weiter hinten noch nicht als Einbieger erkennbar ist. ' +
    'Das Tempo von Hand je Zufahrt gilt auch für sie. Die Kurvenregeln für Fussgängerstreifen (bfu, VSS 40 241 ' +
    `Tab. 2) gelten hier nicht. Geprüft wird höchstens bis ${REICHWEITE_SICHT_M} m (Reichweite der geladenen Daten).` +
    (ueber.length ? ` Tempo über ${AHS_MAX_V} km/h (${ueber.join(', ')} km/h): die Anhaltesichtweite der Tabelle endet bei ${AHS_MAX_V} km/h, ` +
      `verwendet ist ihr Wert ${ahs(AHS_MAX_V)} m.` : '')
}

/** Länge der Fahrlinie: so weit, dass die geprüfte Sichtweite (höchstens REICHWEITE_SICHT_M) Platz hat, mindestens wie beim
 * Fussgängerstreifen */
export const weiteOhneVortritt = (L: number, basis: number): number =>
  Math.max(basis, Math.min(sichtOhneVortritt(TEMPO_MAX_SPUR, L), REICHWEITE_SICHT_M))
