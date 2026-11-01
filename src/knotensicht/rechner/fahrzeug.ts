// ── Fahrzeug-Umrisse für die Karte (Vogelperspektive), in LV95-Metern ──
//
// Nur Darstellung, keine Wirkung auf die Rechnung. Die Masse sind Annahmen für einen Personenwagen (VSS 40 273 Abb. 1
// zeichnet FB und FA als Fahrzeuge; die Norm nennt dafür keine Abmessungen). Der Lenker sitzt rund 2,0 m hinter der Front,
// was unter der Beobachtungsdistanz B von 3,00 m liegt (Ziffer 12: B nicht kleiner als Lenker bis Fahrzeugfront).

import { type P, add, einheit, links, sub } from '../geo'

export const PW_LAENGE_M = 4.5
export const PW_BREITE_M = 1.8
/** Abstand Lenker (Augen) bis Fahrzeugfront, Annahme Personenwagen */
export const LENKER_VOR_FRONT_M = 2.0

/** Punkt aus Fahrzeugkoordinaten (x vorwärts, y links) in LV95 */
const lokal = (mitte: P, u: P, v: P, x: number, y: number): P => add(add(mitte, u, x), v, y)

/**
 * Umriss eines Personenwagens von oben: Mitte, Fahrtrichtung (Einheitsvektor). Ring aus 8 Punkten (abgeschrägte Ecken,
 * vorne stärker als hinten), im Uhrzeigersinn ab hinten links.
 */
export function autoUmriss(mitte: P, richtung: P, laenge = PW_LAENGE_M, breite = PW_BREITE_M): P[] {
  const u = einheit(richtung), v = links(u), L = laenge / 2, W = breite / 2
  return [
    lokal(mitte, u, v, -L + 0.3, W), lokal(mitte, u, v, L - 0.6, W), lokal(mitte, u, v, L, W - 0.4),
    lokal(mitte, u, v, L, -W + 0.4), lokal(mitte, u, v, L - 0.6, -W), lokal(mitte, u, v, -L + 0.3, -W),
    lokal(mitte, u, v, -L, -W + 0.3), lokal(mitte, u, v, -L, W - 0.3),
  ]
}

/** Windschutzscheibe (zeigt die Fahrtrichtung): Viereck im vorderen Drittel */
export function autoScheibe(mitte: P, richtung: P, laenge = PW_LAENGE_M, breite = PW_BREITE_M): P[] {
  const u = einheit(richtung), v = links(u), L = laenge / 2, W = breite / 2 - 0.2
  return [lokal(mitte, u, v, L - 1.7, W), lokal(mitte, u, v, L - 1.0, W - 0.1), lokal(mitte, u, v, L - 1.0, -W + 0.1),
    lokal(mitte, u, v, L - 1.7, -W)]
}

/**
 * Fahrzeug FB (vortrittsbelastet) auf der Zufahrt: Dachse = Punkt auf der Achse des Zufahrtsstreifens im Abstand B vor
 * dem Rand (bei D von Hand: D um den Fahrersitz nach rechts versetzt), rand = ein Punkt in Fahrtrichtung voraus (Kante des
 * Fahrstreifens mit Vortritt bzw. Dachse plus Fahrtrichtung). Die Front steht LENKER_VOR_FRONT_M vor Dachse (ohne Eingaben
 * also B − 2,0 m hinter der Kante). -> [Mitte, Fahrtrichtung]
 */
export function fbLage(Dachse: P, rand: P): [P, P] {
  const u = einheit(sub(rand, Dachse))
  return [add(Dachse, u, LENKER_VOR_FRONT_M - PW_LAENGE_M / 2), u]
}

/**
 * Fahrzeug FA (vortrittsberechtigt) am Ende der Sichtweite A: sichtpunkte = Zielpunkte je 1 m ab K entlang der Achse,
 * iA = Index des Punkts bei A. Die Front steht bei A, das Fahrzeug fährt auf K zu. -> [Mitte, Fahrtrichtung] bzw. null
 */
export function faLage(sichtpunkte: P[], iA: number): [P, P] | null {
  if (iA < 1 || iA >= sichtpunkte.length) return null
  const u = einheit(sub(sichtpunkte[iA - 1], sichtpunkte[iA]))
  return [add(sichtpunkte[iA], u, -PW_LAENGE_M / 2), u]
}

// ---------------------------------------------------------------- Velo (E3b)
/** Velo von oben (Annahme, nur Darstellung): Länge und Breite (Lenker) */
export const VELO_LAENGE_M = 1.8
export const VELO_BREITE_M = 0.6
/** Rad: Durchmesser und Breite des Reifens von oben */
const RAD_M = 0.66
const REIFEN_M = 0.1

/**
 * Velo von oben als einfache Polygone: Hinterrad, Vorderrad, Rahmen, Lenker (je ein Viereck), Mitte und Fahrtrichtung. Aussenmass
 * VELO_LAENGE_M × VELO_BREITE_M (Räder vorne und hinten bis an das Ende, Lenker über die ganze Breite).
 */
export function veloTeile(mitte: P, richtung: P): P[][] {
  const u = einheit(richtung), v = links(u), L = VELO_LAENGE_M / 2, W = VELO_BREITE_M / 2
  const viereck = (x0: number, x1: number, y0: number, y1: number): P[] =>
    [lokal(mitte, u, v, x0, y0), lokal(mitte, u, v, x1, y0), lokal(mitte, u, v, x1, y1), lokal(mitte, u, v, x0, y1)]
  const r = REIFEN_M / 2
  return [
    viereck(-L, -L + RAD_M, -r, r),                 // Hinterrad
    viereck(L - RAD_M, L, -r, r),                   // Vorderrad
    viereck(-L + RAD_M / 2, L - RAD_M / 2, -0.04, 0.04),   // Rahmen
    viereck(L - RAD_M / 2 - 0.06, L - RAD_M / 2 + 0.02, -W, W), // Lenker über der Vorderradachse
  ]
}

/** Velo FA am Ende von A: Vorderrad bei A, auf K zu fahrend (wie faLage) -> [Mitte, Fahrtrichtung] bzw. null */
export function veloLage(sichtpunkte: P[], iA: number): [P, P] | null {
  if (iA < 1 || iA >= sichtpunkte.length) return null
  const u = einheit(sub(sichtpunkte[iA - 1], sichtpunkte[iA]))
  return [add(sichtpunkte[iA], u, -VELO_LAENGE_M / 2), u]
}

/** F_B als Velo (E4, Velo gegen die Einbahn auf der Zufahrt): der Velofahrer (D) sitzt so weit hinter der Mitte des Velos */
export const VELO_FAHRER_HINTER_MITTE_M = 0.2
/** F_B als Velo: Dachse = D auf der Veloachse, voraus = ein Punkt in Fahrtrichtung (wie fbLage) -> [Mitte, Fahrtrichtung] */
export function fbVeloLage(Dachse: P, voraus: P): [P, P] {
  const u = einheit(sub(voraus, Dachse))
  return [add(Dachse, u, VELO_FAHRER_HINTER_MITTE_M), u]
}
