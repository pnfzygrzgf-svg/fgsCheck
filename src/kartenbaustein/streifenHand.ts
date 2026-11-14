// ── Streifen von Hand: Fussgängerstreifen mit Enden von Hand (gemeinsamer Baustein seit 14.11.2026, Plan AV-Geometrie A5) ──
// Der fgsCheck führt Streifen von Hand seit Oktober 2026 (fall.ts StreifenHand: ein Eintrag je Teilstreifen, Enden auf der Karte
// gezogen). Der VeloroutenCheck bekommt mit A5 denselben Bearbeiter je Fussgängerstreifen (FGS) seines Bestands. Hier liegt die reine
// Rechnung, die beide teilen; die Bedienung auf der Karte bleibt je Rechner:
// - Kern des Datentyps und seine Prüfung (Lage der Enden, Breite; im fgsCheck bis dahin in fallLesen),
// - Teilen eines Teilstreifens an einer Insel und Verbinden der Teile,
// - Fangen eines gezogenen Endes am AV-Bord (Bordstücke des Bordmodells, nicht an Stossstellen zweier Strassenflächen),
// - Anwenden auf die gerechnete Streifengeometrie (streifenGeometrie.streifenEnden): die Teile von Hand gehen vor.
// Nur Landeskoordinaten (LV95). Eigene Schwellen sind Annahmen dieses Bausteins (keine Normwerte).
import { type P, add, dist, dot, einheit, kreuz, sub } from './geometrie'
import { RAND_ZUSCHLAG, TEIL_MIN_M, type StreifenAbschnitt, type StreifenEnden } from './streifenGeometrie'
import { schnittBord, type Bordmodell, type BordStueck } from './bordmodell'

export type { P }

// ── Masse ──
/** Breite eines Streifens von Hand (entlang der Fahrbahn) mindestens bzw. höchstens so viel; wie bisher im fgsCheck (fallLesen) */
export const STREIFEN_BREITE_MIN_M = 0.5
export const STREIFEN_BREITE_MAX_M = 15
/** Annahme: Breite eines Fussgängerstreifens ohne Angabe von Hand, wie die Zeichnung im VeloroutenCheck bis dahin (4 m) */
export const STREIFEN_BREITE_STANDARD_M = 4
/** Annahme: Lücke zwischen den beiden Teilen beim Teilen eines Teilstreifens (schmale Insel); die Enden zieht man danach an die Insel */
export const TEILEN_LUECKE_M = 2
/** Annahme: höchstens so viele Teilstreifen je Streifen von Hand (zwei Inseln) */
export const TEILE_HAND_MAX = 4
/** Annahme: ein Teilstreifen von Hand ist mindestens so lang (Enden nicht aufeinander) */
export const TEIL_HAND_MIN_M = 0.5
/** Wortlaut im Plan, im Bericht und in der Liste, wenn die Teile von Hand den gerechneten Streifen ersetzen */
export const LAGE_VON_HAND = 'Lage von Hand angepasst'

// ── Datentyp und Prüfung ──
/** Kern eines Streifens von Hand: Enden in LV95 und Breite entlang der Fahrbahn (fgsCheck StreifenHand) */
export interface StreifenHandKern { p0: P; p1: P; breite: number }
/** Teilstreifen von Hand: Enden in LV95 (wie die gerechneten Enden RAND_ZUSCHLAG vor dem Bord bzw. der Insel) */
export interface TeilHand { p0: P; p1: P }
/**
 * Fussgängerstreifen von Hand (VeloroutenCheck, je FGS des Bestands): id = Kennung des FGS (OSM-Knoten, bei einem Querungsweg ohne
 * Knoten «w» und die Kennung des Wegs); teile in der Reihenfolge entlang der Achse; breite fehlt: STREIFEN_BREITE_STANDARD_M.
 */
export interface StreifenVonHand { id: string; teile: TeilHand[]; breite?: number }

const zahl = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const objekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/** Punkt in LV95: zwei endliche Zahlen */
export const istPunkt = (x: unknown): x is P => Array.isArray(x) && x.length === 2 && x.every(zahl)
/** Breite eines Streifens von Hand: endlich, STREIFEN_BREITE_MIN_M … STREIFEN_BREITE_MAX_M */
export const breiteGueltig = (b: unknown): b is number => zahl(b) && b >= STREIFEN_BREITE_MIN_M && b <= STREIFEN_BREITE_MAX_M
/** Kern eines Streifens von Hand gültig (fgsCheck fallLesen): beide Enden Punkte, Breite im Bereich */
export const streifenHandKernGueltig = <T extends Record<string, unknown>>(o: T): o is T & StreifenHandKern =>
  istPunkt(o.p0) && istPunkt(o.p1) && breiteGueltig(o.breite)

/**
 * Prüfung eines Streifens von Hand beim Laden (VeloroutenCheck fallDatei): nur die Felder id, teile, breite; id Text mit 1 bis 64 Zeichen;
 * 1 bis TEILE_HAND_MAX Teile, je nur p0 und p1 als Punkte, mindestens TEIL_HAND_MIN_M lang; breite fehlt oder gültig. → Grund oder null.
 */
export function streifenVonHandFehler(v: unknown): string | null {
  if (!objekt(v) || !Object.keys(v).every(k => ['id', 'teile', 'breite'].includes(k))) return 'ist kein Objekt mit den Feldern id, teile, breite'
  if (typeof v.id !== 'string' || !v.id || v.id.length > 64) return 'braucht eine Kennung (Text mit 1 bis 64 Zeichen)'
  if (!Array.isArray(v.teile) || !v.teile.length || v.teile.length > TEILE_HAND_MAX) return `braucht 1 bis ${TEILE_HAND_MAX} Teilstreifen`
  for (const t of v.teile as unknown[]) {
    if (!objekt(t) || !Object.keys(t).every(k => ['p0', 'p1'].includes(k)) || !istPunkt(t.p0) || !istPunkt(t.p1)) return 'hat einen Teilstreifen ohne zwei gültige Enden'
    if (dist(t.p0, t.p1) < TEIL_HAND_MIN_M) return `hat einen Teilstreifen kürzer als ${String(TEIL_HAND_MIN_M).replace('.', ',')} m`
  }
  if (v.breite !== undefined && !breiteGueltig(v.breite))
    return `hat eine Breite ausserhalb ${String(STREIFEN_BREITE_MIN_M).replace('.', ',')} bis ${STREIFEN_BREITE_MAX_M} m`
  return null
}

/** Breite eines Streifens von Hand, ohne Angabe die Annahme STREIFEN_BREITE_STANDARD_M */
export const breiteVon = (h: StreifenVonHand | null | undefined): number => h?.breite ?? STREIFEN_BREITE_STANDARD_M

// ── Teilen und Verbinden ──
/**
 * Teilstreifen an seiner Mitte in zwei Teile teilen, luecke dazwischen (Insel); null, wenn ein Teil kürzer als TEIL_MIN_M würde.
 * Beispiel: (0, 0)–(0, 10), Lücke 2 → (0, 0)–(0, 4) und (0, 6)–(0, 10).
 */
export function teilTeilen(t: TeilHand, luecke = TEILEN_LUECKE_M): [TeilHand, TeilHand] | null {
  const l = dist(t.p0, t.p1), r = einheit(sub(t.p1, t.p0)), halb = (l - luecke) / 2
  if (!(halb >= TEIL_MIN_M)) return null
  return [{ p0: [t.p0[0], t.p0[1]], p1: add(t.p0, r, halb) }, { p0: add(t.p1, r, -halb), p1: [t.p1[0], t.p1[1]] }]
}

/** Teilstreifen zu einem verbinden: vom Anfang des ersten bis zum Ende des letzten (Reihenfolge entlang der Achse); null ohne Teil */
export function teileVerbinden(teile: readonly TeilHand[]): TeilHand | null {
  if (!teile.length) return null
  return { p0: [teile[0].p0[0], teile[0].p0[1]], p1: [teile[teile.length - 1].p1[0], teile[teile.length - 1].p1[1]] }
}

/** Teilstreifen aus der gerechneten Geometrie (Ausgang des Bearbeiters): Kopie der Enden aller Teile */
export const teileVon = (e: Pick<StreifenEnden, 'teile'>): TeilHand[] => e.teile.map(([a, b]) => ({ p0: [a[0], a[1]], p1: [b[0], b[1]] }))

// ── Fangen am Bord ──
/** Bordlinien zum Fangen eines Endes: je Bordstück mit Bord dahinter (Trottoir, Verkehrsinsel, Grün, Gebäude) die Strecke a–b */
export const bordFangLinien = (stuecke: readonly Pick<BordStueck, 'a' | 'b' | 'nachbar'>[]): P[][] =>
  stuecke.filter(s => s.nachbar === 'bord').map(s => [[s.a[0], s.a[1]], [s.b[0], s.b[1]]])

/**
 * Fanglinien für die Enden eines Streifens aus dem Bordmodell: der Bord beider Seiten, wie ihn die gerechneten Enden schneiden (schnittBord
 * 'rand': gemessener Rand, bestätigte Einmündungen und kurze Lücken «Rand unbekannt» gerade überbrückt, z. B. die Öffnung eines Fusswegs in
 * der Fläche Strasse_Weg), dazu alle Bordstücke mit Bord dahinter (Inseln, Flanken von Nasen und Einmündungen).
 */
export function streifenFangLinien(m: Bordmodell): P[][] {
  return [...schnittBord(m, 'links', 'rand').teile, ...schnittBord(m, 'rechts', 'rand').teile, ...bordFangLinien(m.stuecke)]
}

/**
 * Ende eines Streifens am Bord fangen. Bordpunkt: wo die Gerade vom anderen Ende (gegen) durch den gezogenen Punkt p eine Bordlinie
 * höchstens radiusM von p schneidet (die gezogene Richtung bleibt, ein schräger Streifen bleibt schräg); ohne solchen Schnitt der nächste
 * Punkt einer Bordlinie im Radius. Das Ende liegt zuschlag (wie die gerechneten Enden RAND_ZUSCHLAG) vor dem Bordpunkt, zum anderen Ende
 * hin. Ohne Bordlinie im Radius bleibt p (bord null).
 * Beispiel: Bord N 4 von E −10 bis 10, gegen (0, −3,7), p (0,2, 4,6), Radius 1,5 → Bordpunkt (≈0,17, 4), Ende 0,30 m davor auf N ≈3,7.
 */
export function endeAmBordFangen(p: P, gegen: P | null, linien: readonly (readonly P[])[], radiusM: number,
  zuschlag = RAND_ZUSCHLAG): { p: P; bord: P | null } {
  let bord: P | null = null, best = radiusM
  const r = gegen && dist(gegen, p) > 1e-6 ? einheit(sub(p, gegen)) : null
  if (r && gegen) {
    // Schnitte der Geraden gegen + t·r mit den Bordlinien (vor dem anderen Ende), der nächste an p
    for (const l of linien) for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], e = sub(l[i], a), den = kreuz(r, e)
      if (Math.abs(den) < 1e-12) continue
      const w = sub(a, gegen), t = kreuz(w, e) / den, u = kreuz(w, r) / den
      if (u < -1e-9 || u > 1 + 1e-9 || t <= zuschlag) continue
      const x = add(gegen, r, t), d = dist(x, p)
      if (d <= best) { best = d; bord = x }
    }
  }
  if (!bord) {
    best = radiusM
    for (const l of linien) for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], v = sub(l[i], a), l2 = dot(v, v)
      const u = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), v) / l2)) : 0
      const x = add(a, v, u), d = dist(x, p)
      if (d <= best) { best = d; bord = x }
    }
  }
  if (!bord) return { p: [p[0], p[1]], bord: null }
  const zurueck = gegen && dist(gegen, bord) > zuschlag ? einheit(sub(gegen, bord)) : null
  return { p: zurueck ? add(bord, zurueck, zuschlag) : [bord[0], bord[1]], bord }
}

// ── Anwenden auf die Streifengeometrie ──
/** Abstand des Punkts c von der Strecke a–b */
function abstandStrecke(c: P, a: P, b: P): number {
  const v = sub(b, a), l2 = dot(v, v), u = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(c, a), v) / l2)) : 0
  return dist(add(a, v, u), c)
}

/**
 * Streifen von Hand auf die gerechnete Geometrie anwenden (streifenEnden am Knoten c): die Teile von Hand ersetzen die gerechneten
 * (teile, abschnitte; p0/p1 = der Teil am Knoten bzw. der nächste; Achse aus diesem Teil), geklemmt und geschätzt entfallen; vonHand
 * true. Ohne Hand bzw. ohne Teil das gerechnete Ergebnis mit vonHand false (null bleibt null; Hand ohne Rechnung genügt).
 * Beispiel: gerechnet zwei Teile 7,8 + 5,3 m, von Hand (50, −5)–(50, −1,3) und (50, 1,3)–(50, 5) → teile 3,7 + 3,7 m, Achse nach Norden.
 */
export function streifenMitHand(e: StreifenEnden | null, c: P, hand: StreifenVonHand | null | undefined): (StreifenEnden & { vonHand: boolean }) | null {
  const teile = hand?.teile.filter(t => dist(t.p0, t.p1) >= TEIL_HAND_MIN_M) ?? []
  if (!teile.length) return e ? { ...e, vonHand: false } : null
  let k = 0
  teile.forEach((t, i) => { if (abstandStrecke(c, t.p0, t.p1) < abstandStrecke(c, teile[k].p0, teile[k].p1)) k = i })
  const n = einheit(sub(teile[k].p1, teile[k].p0))
  const abschnitte: StreifenAbschnitt[] = teile.map((t, i) => ({ a: dot(sub(t.p0, c), n) - RAND_ZUSCHLAG, b: dot(sub(t.p1, c), n) + RAND_ZUSCHLAG,
    p0: [t.p0[0], t.p0[1]], p1: [t.p1[0], t.p1[1]], kern: i === k, inselVor: null, inselNach: null }))
  return { p0: abschnitte[k].p0, p1: abschnitte[k].p1, teile: abschnitte.map(x => [x.p0, x.p1] as [P, P]), achse: n,
    achseText: e?.achseText ?? 'senkrecht', geklemmt: false, geschaetzt: false, meldungen: [LAGE_VON_HAND], abschnitte,
    inselnHandAufAchse: e?.inselnHandAufAchse ?? [], bordA: false, bordB: false, vonHand: true }
}
