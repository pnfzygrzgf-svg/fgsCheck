// ── Lage einer Richtung aus Sicht der Zufahrt: links, rechts oder gegenüber (Gegenverkehr) ──
//
// Die Rechnung sortiert die zwei Arme der Vortrittsstrasse immer in «links» und «rechts» (Schlüssel für Eingaben, Tempo, Neigung und
// Fall-Datei). Liegt ein Arm aber fast geradeaus (Zufahrt auf der durchgehenden Strasse), kommt von dort Gegenverkehr: die Lage
// beschriftet ihn als solchen. Alle Ansichten holen ihre Wörter hier.

import { type P, wdiff } from '../geo'
import type { Lage, Richtung } from './typen'

/** ein Arm liegt gegenüber, wenn er höchstens so viel neben der Geradeausrichtung liegt [°] */
export const GEGENUEBER_GRAD = 30

/** Winkel zwischen der Fahrtrichtung zum Knoten und der Richtung des Arms vom Knoten weg [°, 0–180]; 0 = genau geradeaus */
export const geradeausWinkel = (fahrt: P, armRichtung: P) => wdiff(fahrt, armRichtung)

/** Lage eines Arms: gegenüber innerhalb GEGENUEBER_GRAD der Geradeausrichtung, sonst die Seite der Richtung */
export function lageVon(fahrt: P, armRichtung: P, richtung: Richtung): Lage {
  return geradeausWinkel(fahrt, armRichtung) <= GEGENUEBER_GRAD + 1e-9 ? 'gegenueber' : richtung
}

type MitLage = { lage: Lage }
/** «Verkehr von links», «Verkehr von rechts», «Gegenverkehr» */
export const lageText = (r: MitLage) => (r.lage === 'gegenueber' ? 'Gegenverkehr' : `Verkehr von ${r.lage}`)
/** «von links», «von rechts», «von gegenüber» */
export const lageKurz = (r: MitLage) => `von ${lageWort(r)}`
/** «nach links», «nach rechts», «zum Gegenverkehr» (Blick aus der Zufahrt) */
export const lageNach = (r: MitLage) => (r.lage === 'gegenueber' ? 'zum Gegenverkehr' : `nach ${r.lage}`)
/** «links», «rechts», «gegenüber» */
export const lageWort = (r: MitLage) => (r.lage === 'gegenueber' ? 'gegenüber' : r.lage)
