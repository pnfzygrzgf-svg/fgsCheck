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

import { sollSichtOhneVortritt, formelSicht } from '../bedarf/sichtOhneVortritt'
import { ahs, AHS_40240 } from '../bedarf/tabellen'
import { KATALOG } from '../bedarf/katalog'
import { KATASTER_PARK_M } from './vorschlaege'
import type { QuerungOhneVortritt } from './typen'

export const GEH_V = KATALOG.E3.werte.gehV
/** Obergrenze des Tempos für die Länge der Fahrlinie (höchstes Tempo der Auswahl von Hand) */
export const TEMPO_MAX_SPUR = 80
/** Abzug von der Kataster-Reichweite für die Suche um die Sichtpunkte (Herleitung oben) */
export const SICHT_RESERVE_M = 10
/** Mit den geladenen Daten belegte Sichtweite ab dem Streifenrand (110 m) */
export const REICHWEITE_SICHT_M = KATASTER_PARK_M - SICHT_RESERVE_M
/** höchstes Tempo der Anhaltesichtweiten-Tabelle */
const AHS_MAX_V = Math.max(...Object.keys(AHS_40240).map(Number))

export interface OhneVortritt { typ: QuerungOhneVortritt; L: number; ganzeFahrbahn: boolean }

const f1 = (x: number) => x.toFixed(1).replace('.', ',')
const auf01 = (x: number) => Math.ceil(x * 10 - 1e-9) / 10

/** Soll-Sichtweite [m] für Tempo v [km/h] und Querdistanz L [m], auf 0,1 m aufwärts */
export const sichtOhneVortritt = (v: number, L: number): number => auf01(sollSichtOhneVortritt(v, L, GEH_V))

/** Quelle der Sichtweite (Spalte «Sichtweite») */
export const quelleOhneVortritt = (L: number): string => `VSS 40 240 Z. 8.2 (L ${f1(L)} m)`

/** Annahme je Streifen: Formel mit den Zahlen (Formelteil wie das Ergebnis auf 0,1 m aufwärts) */
export function annahmeOhneVortritt(o: OhneVortritt, tempi: number[], randAngenommen = false): string {
  const t = [...new Set(tempi)].sort((a, b) => a - b)
  const teile = t.map(v => `${v} km/h: max(${f1(auf01(formelSicht(v, o.L, GEH_V)))}; ${ahs(v)}) = ${f1(sichtOhneVortritt(v, o.L))} m`)
  const ueber = t.filter(v => v > AHS_MAX_V)
  return `Querung ohne Vortritt (${o.typ === 'furt' ? 'Furt' : 'Nase, Einengung bzw. ohne Massnahme'}): Sichtweite nach VSS 40 240 Z. 8.2 = ` +
    `max(v · L / ${f1(GEH_V)} m/s; Anhaltesichtweite), L = ${f1(o.L)} m${o.ganzeFahrbahn ? ' (Insel nur markiert: ganze Fahrbahn)' : ''}` +
    (randAngenommen ? ' aus angenommenen Bordkanten (keine passende AV-Sehne, 0,3 m vor den Enden) – prüfen' : '') +
    (teile.length ? `; ${teile.join('; ')}` : '') + '. v = Tempo der Zufahrt (V85 nur über das Tempo von Hand); für Abbieger lässt sich ' +
    'die gefahrene Geschwindigkeit als Tempo von Hand je Zufahrt setzen. Die Kurvenregeln für Fussgängerstreifen (bfu, VSS 40 241 ' +
    `Tab. 2) gelten hier nicht. Geprüft wird höchstens bis ${REICHWEITE_SICHT_M} m (Reichweite der geladenen Daten).` +
    (ueber.length ? ` Tempo über ${AHS_MAX_V} km/h (${ueber.join(', ')} km/h): die Anhaltesichtweite der Tabelle endet bei ${AHS_MAX_V} km/h, ` +
      `verwendet ist ihr Wert ${ahs(AHS_MAX_V)} m.` : '')
}

/** Länge der Fahrlinie: so weit, dass die geprüfte Sichtweite (höchstens REICHWEITE_SICHT_M) Platz hat, mindestens wie beim
 * Fussgängerstreifen */
export const weiteOhneVortritt = (L: number, basis: number): number =>
  Math.max(basis, Math.min(sichtOhneVortritt(TEMPO_MAX_SPUR, L), REICHWEITE_SICHT_M))
