// ── Beobachtungsdistanz B und Beobachtungspunkt D (VSS 40 273, Ziffern 5, 12, 13.1 und 14, Abb. 1) ──
//
// D liegt auf der Achse des Zufahrtsstreifens, B hinter dem Nullpunkt: der zugewandten Kante des Fahrstreifens mit Vortritt
// bzw. der Vorderkante der Haltelinie (Ziffer 5, E2b). B entlang der Zufahrtsachse gemessen; bei schiefem Einbiegewinkel ist
// der senkrechte Abstand kleiner. Seitlich sitzt D am Fahrersitz: FAHRERSITZ_M links der Achse (Annahme nach Skizze 3.1, in der
// Seite ausgewiesen); von Hand lässt sich D frei setzen (E2b).
// B: innerorts 3,00 m, ausserorts 5,00 m, ausserorts mit Stop 3,00 m (Ziffer 12). Ausserorts: OSM
// maxspeed über 50 km/h bzw. maxspeed:type CH:rural auf der vortrittsberechtigten Strasse.
// Trottoir (E2b): liegt nach AV ein Trottoir zwischen Zufahrt und Vortrittsstrasse (Trottoirüberfahrt, Grundstückzufahrt mit
// Trottoir), wartet F_B vor dem Trottoir: Nullpunkt an der Trottoirhinterkante. Steht auf dem Trottoir nichts im Weg, wartet
// F_B an der Bordkante (Ziffer 13.1): Nullpunkt an der Kante (Häkchen im Panel).

import { type P, add, dist, rechts, links, kreuz, sub } from '../geo'
import type { OsmNetz } from './netz'
import { punkteAufSpur } from './spur'
import { schnittBei, lot } from './hauptachsen'

/** VSS 40 273 Ziffer 12: Beobachtungsdistanz innerorts */
export const B_INNERORTS_M = 3.0
/** VSS 40 273 Ziffer 12: Beobachtungsdistanz ausserorts (ohne Anhalten) */
export const B_AUSSERORTS_M = 5.0
/** Annahme (Skizze 3.1, Abb. 1 der VSS 40 273): Augenpunkt am Fahrersitz, so weit links der Achse des Zufahrtsstreifens */
export const FAHRERSITZ_M = 0.5

const RURAL = 'CH:rural'

/** ausserorts nach OSM: maxspeed über 50 km/h bzw. maxspeed:type (zone:maxspeed, maxspeed) CH:rural auf einem der Wege */
export function istAusserorts(netz: OsmNetz, wids: number[]): { ausserorts: boolean; grund: string } {
  for (const wid of wids) {
    const t = netz.w(wid).t
    if ([t['maxspeed:type'], t['zone:maxspeed'], t.maxspeed].some(v => (v ?? '').trim() === RURAL))
      return { ausserorts: true, grund: `OSM ${RURAL} (Weg ${wid})` }
    const v = netz.maxspeed(wid)
    if (v !== null && v > 50) return { ausserorts: true, grund: `OSM maxspeed ${v} km/h (Weg ${wid})` }
  }
  return { ausserorts: false, grund: 'OSM maxspeed höchstens 50 km/h bzw. ohne Angabe' }
}

/** B nach Ziffer 12: ausserorts 5,00 m, ausserorts mit Stop und innerorts 3,00 m */
export const beobachtungsdistanz = (ausserorts: boolean, stop = false): number => (ausserorts && !stop ? B_AUSSERORTS_M : B_INNERORTS_M)

export interface Beobachtung {
  D: P                // Augenpunkt (Fahrersitz)
  Dachse: P           // auf der Achse des Zufahrtsstreifens
  rand: P             // Schnitt der Zufahrtsachse mit dem nächstliegenden Rand
  sRand: number       // Bogenlänge des Rands auf der Zufahrtsachse
  randGefunden: boolean
}

/**
 * Beobachtungspunkt. zAchse: Achse des Zufahrtsstreifens vom Knoten weg (am Anfang über den Knoten hinaus verlängert), rand:
 * nächstliegender Rand des vortrittsberechtigten Fahrstreifens (Polylinie), knoten: Lage des OSM-Knotens. Ohne Schnitt mit
 * dem Rand: ersatzS (Bogenlänge auf zAchse) als Rand.
 */
export function beobachtungspunkt(zAchse: P[], rand: P[], B: number, knoten: P, ersatzS: number, seitlich = FAHRERSITZ_M): Beobachtung {
  const x = schnittBei(zAchse, rand, knoten)
  const sRand = x ? x.sa : ersatzS
  const b = beobachtungAb(zAchse, sRand, B, seitlich)
  return { D: b.D, Dachse: b.Dachse, rand: b.nullpunkt, sRand, randGefunden: !!x }
}

/** D und Dachse im Abstand B hinter dem Nullpunkt sNull (Bogenlänge auf zAchse, vom Knoten weg); t = Richtung der Achse */
export function beobachtungAb(zAchse: P[], sNull: number, B: number, seitlich = FAHRERSITZ_M): { D: P; Dachse: P; nullpunkt: P; t: P } {
  const r = punkteAufSpur(zAchse, [sNull, sNull + B])
  const nullpunkt = r.length ? r[0][0] : zAchse[zAchse.length - 1]
  const [Dachse, t] = r.length > 1 ? r[1] : r.length ? r[0] : [zAchse[zAchse.length - 1], [1, 0] as P]
  // die Achse läuft vom Knoten weg (t); der Fahrer schaut zum Knoten (−t), links von ihm liegt rechts(t)
  return { D: add(Dachse, rechts(t), seitlich), Dachse, nullpunkt, t }
}

/** Lage eines Punkts gegenüber der Zufahrtsachse: Bogenlänge des Lots, Lotfusspunkt, Richtung dort und Abstand links der
 *  Achse aus Sicht des Fahrers (der zum Knoten schaut, also gegen die Richtung der Achse) */
export function lageAnAchse(zAchse: P[], p: P): { s: number; fuss: P; t: P; seitlich: number } {
  const l = lot(zAchse, p)
  const q = punkteAufSpur(zAchse, [Math.max(0, l.s - 0.5), l.s + 0.5])
  const t: P = q.length > 1 ? [q[1][0][0] - q[0][0][0], q[1][0][1] - q[0][0][1]] : q.length ? q[0][1] : [1, 0]
  const n = Math.hypot(t[0], t[1]) || 1
  const tn: P = [t[0] / n, t[1] / n]
  // links des Fahrers = rechts von t; kreuz(t, v) < 0, wenn v rechts von t liegt
  return { s: l.s, fuss: l.p, t: tn, seitlich: -Math.sign(kreuz(tn, sub(p, l.p))) * dist(p, l.p) }
}

/** Trottoir an der Zufahrt: Suche des ersten Trottoir-Punkts ab TROTTOIR_VON_M bis TROTTOIR_BIS_M um die Kante, Trottoir bis
 *  höchstens TROTTOIR_MAX_M hinter der Kante, Lücken bis TROTTOIR_LUECKE_M überbrückt (Schritt TROTTOIR_SCHRITT_M) */
export const TROTTOIR_VON_M = -0.5
export const TROTTOIR_BIS_M = 1.5
export const TROTTOIR_MAX_M = 8
export const TROTTOIR_LUECKE_M = 0.3
export const TROTTOIR_SCHRITT_M = 0.05

/**
 * Trottoir zwischen Zufahrt und Vortrittsstrasse entlang der Zufahrtsachse (AV-Fläche Trottoir, istTrottoir): ab der Kante
 * (sRand) vom Knoten weg. -> Bogenlänge der Trottoirhinterkante auf zAchse und Breite ab der Kante, bzw. null mit Grund.
 */
export function trottoirAnZufahrt(zAchse: P[], sRand: number, istTrottoir: (p: P) => boolean):
  { sHinter: number; breite: number } | { grund: string } {
  const bei = (s: number) => { const q = punkteAufSpur(zAchse, [s]); return q.length ? istTrottoir(q[0][0]) : false }
  let sVon: number | null = null
  for (let s = sRand + TROTTOIR_VON_M; s <= sRand + TROTTOIR_BIS_M + 1e-9; s += TROTTOIR_SCHRITT_M) if (bei(s)) { sVon = s; break }
  if (sVon === null) return { grund: 'die AV zeigt an der Zufahrt kein Trottoir zwischen Zufahrt und Vortrittsstrasse' }
  let sLetzt = sVon
  for (let s = sVon; s <= sRand + TROTTOIR_MAX_M + TROTTOIR_LUECKE_M + 1e-9; s += TROTTOIR_SCHRITT_M) {
    if (bei(s)) sLetzt = s
    else if (s - sLetzt > TROTTOIR_LUECKE_M) break
  }
  const sHinter = sLetzt + TROTTOIR_SCHRITT_M / 2
  if (sHinter - sRand > TROTTOIR_MAX_M)
    return { grund: `die AV-Fläche Trottoir reicht entlang der Zufahrtsachse über ${TROTTOIR_MAX_M} m: kein querendes Trottoir` }
  return { sHinter, breite: sHinter - sRand }
}

/** Querlinie (z. B. Haltelinie) durch p senkrecht zur Richtung t, halb so lang wie laenge auf jeder Seite */
export function querlinie(p: P, t: P, halb: number): [P, P] {
  return [add(p, links(t), halb), add(p, rechts(t), halb)]
}
