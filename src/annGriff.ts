// ── Griffe des Annäherungsbereichs und der Enden eines Streifens von Hand: Fangen, Projektion, Zahleneingabe (30.10.2026) ──
//
// Die Ecken des Annäherungsbereichs liessen sich nicht auf eine bestimmte Stelle legen: beim Loslassen wurde die Mausposition auf die
// Gerade der Bordkante (AnnBasis: Mitte rand, Richtung u) projiziert, ohne Fangen und ohne Zahleneingabe. Neu:
// - Fangen wie bei den Fixpunkten (fixpunkt.fangen, Fangradius FANG_PX bzw. fangRadiusM): AV-Stützpunkte der geladenen
//   Bodenbedeckung, dazu Fixpunkte und Enden der Streifen (Ziele); der nächste Punkt im Fangradius gewinnt, am selben Punkt (1 cm)
//   ein Ziel (benannt) vor der AV. Ohne Treffer gilt die Lage wie gezogen.
// - Annäherungsbereich: der gefangene Punkt wird auf die Bordkanten-Gerade projiziert (das Modell bleibt Versatz und Breite); der
//   Abstand des Punkts zur Geraden steht im Text («gefangen: AV-Punkt (Trottoir), 0,4 m neben der Bordkante»); ab ANN_FANG_WEIT_M
//   meldet die App es zusätzlich. Beim Ziehen läuft der Griff schon auf der Geraden (gleiche Rechnung wie beim Loslassen).
// - Zahleneingabe je Ende (Versatz, Breite; eine Nachkommastelle): leeres Feld = dieser Wert wie gerechnet (Versatz 0, Breite des
//   Streifenendes); beide wie gerechnet = keine Vorgabe (null), die Fall-Datei bleibt ohne Feld.

import { type P, add, dist, dot, sub } from './geo'
import type { AvFlaeche } from './daten/av'
import type { FixpunktArt } from './fall'
import { fangen, fixpunktName } from './fixpunkt'
import { ANN_HAND_BREITE, ANN_HAND_VERSATZ_MAX, type AnnBasis, type AnnHand } from './rechner/typen'
import { f1 } from './texte'

/** Abstand des gefangenen Punkts zur Bordkanten-Geraden, ab dem die App beim Loslassen eine Meldung zeigt (m) */
export const ANN_FANG_WEIT_M = 1
/** Abstand zur Geraden, bis zu dem ein gefangener Punkt als «auf der Bordkante» gilt (m) */
const AUF_KANTE_M = 0.05

/** zusätzliches Fangziel (Fixpunkt, Ende eines Streifens) mit Bezeichnung */
export interface FangZiel { p: P; name: string }
/** Ergebnis des Fangens: Lage, Art (frei = kein Punkt im Fangradius) und Bezeichnung des gefangenen Punkts */
export interface FangTreffer { p: P; art: 'frei' | 'av' | 'ziel'; name: string | null }

/** Lage fangen: nächster AV-Stützpunkt (fixpunkt.fangen, Gebäudeecke vor anderen Flächen) bzw. nächstes Ziel im Radius; am selben
 * Punkt (1 cm) das Ziel; ohne Treffer frei an p */
export function fangenMitZielen(p: P, av: AvFlaeche[], ziele: FangZiel[], radiusM: number): FangTreffer {
  const g = fangen(p, av, radiusM)
  const dAv = g.art === 'frei' ? Infinity : dist(g.p, p)
  let z: FangZiel | null = null, dz = Infinity
  for (const x of ziele) { const d = dist(x.p, p); if (d <= radiusM + 1e-9 && d < dz) { dz = d; z = x } }
  if (z && dz <= dAv + 0.01) return { p: [z.p[0], z.p[1]], art: 'ziel', name: z.name }
  if (g.art !== 'frei') return { p: g.p, art: 'av', name: fixpunktName({ art: g.art, avArt: g.avArt }) }
  return { p: [p[0], p[1]], art: 'frei', name: null }
}

/** Fangziele ausser der AV: Fixpunkte und Enden der Streifen (Ergebnis bzw. von Hand; je Id einmal, von Hand geht vor), ohne die
 * Enden des Streifens ohneId (sonst fängt ein Ende das andere bzw. der Griff das eigene Ende) */
export function fangZiele(fixpunkte: { p: P; art: FixpunktArt; name?: string; avArt?: string }[],
  streifen: { id: string; p0: P; p1: P }[], ohneId: string, titel: (id: string) => string): FangZiel[] {
  const ziele: FangZiel[] = fixpunkte.map(f => ({ p: f.p, name: `Fixpunkt «${fixpunktName(f)}»` }))
  const enden = new Map<string, [P, P]>(streifen.map(x => [x.id, [x.p0, x.p1]]))
  for (const [id, [a, b]] of enden) if (id !== ohneId) ziele.push({ p: a, name: `Ende A von ${titel(id)}` }, { p: b, name: `Ende B von ${titel(id)}` })
  return ziele
}

/** Lage eines Punkts zur Bordkanten-Geraden eines Endes: Versatz entlang der Kante (wie AnnHand.versatz) und Abstand zur Geraden */
export function annProjektion(b: AnnBasis, p: P): { x: number; abstand: number } {
  const x = dot(sub(p, b.rand), b.u)
  return { x, abstand: dist(p, add(b.rand, b.u, x)) }
}

/** Annäherungsbereich von Hand in den Grenzen (Breite, Versatz) */
export const annBegrenzt = (h: AnnHand): AnnHand => ({
  versatz: Math.max(-ANN_HAND_VERSATZ_MAX, Math.min(ANN_HAND_VERSATZ_MAX, h.versatz)),
  breite: Math.max(ANN_HAND_BREITE[0], Math.min(ANN_HAND_BREITE[1], h.breite)) })

/** Griff des Annäherungsbereichs: Mitte (entlang der Kante verschieben) bzw. Seite −1/+1 (breiter bzw. schmaler, die andere bleibt) */
export type AnnGriff = 'mitte' | -1 | 1

/** neue Vorgabe, wenn der Griff an den Versatz x (entlang der Kante) gezogen wird; h: Vorgabe vor dem Ziehen */
export function annGriffNeu(h: AnnHand, griff: AnnGriff, x: number): AnnHand {
  if (griff === 'mitte') return annBegrenzt({ versatz: x, breite: h.breite })
  const fest = h.versatz - griff * h.breite / 2
  const breite = Math.max(ANN_HAND_BREITE[0], griff * (x - fest))
  return annBegrenzt({ versatz: fest + griff * breite / 2, breite })
}
/** Versatz eines Griffs bei der Vorgabe h */
export const annGriffX = (h: AnnHand, griff: AnnGriff) => (griff === 'mitte' ? h.versatz : h.versatz + griff * h.breite / 2)

export interface AnnZug {
  /** neue Vorgabe (in den Grenzen) */
  h: AnnHand
  /** Lage des Griffs nach dem Ziehen (auf der Bordkanten-Geraden) */
  lage: P
  treffer: FangTreffer
  /** Text zum gefangenen Punkt, null ohne Fang */
  text: string | null
  /** gefangener Punkt mehr als ANN_FANG_WEIT_M neben der Bordkante */
  weit: boolean
}

/** Text zum Fang: «gefangen: AV-Punkt (Trottoir), 0,4 m neben der Bordkante» bzw. «…, auf der Bordkante» */
export function annFangText(t: FangTreffer, abstand: number): string | null {
  if (t.art === 'frei' || !t.name) return null
  return `gefangen: ${t.name}, ${abstand < AUF_KANTE_M ? 'auf der Bordkante' : `${f1(abstand)} m neben der Bordkante`}`
}

/**
 * Griff des Annäherungsbereichs an die Stelle roh gezogen (beim Ziehen und beim Loslassen dieselbe Rechnung): fangen, auf die
 * Bordkanten-Gerade projizieren, neue Vorgabe in den Grenzen und Lage des Griffs danach.
 */
export function annGriffZiehen(b: AnnBasis, h: AnnHand, griff: AnnGriff, roh: P, fang: (p: P) => FangTreffer): AnnZug {
  const treffer = fang(roh)
  const { x, abstand } = annProjektion(b, treffer.p)
  const neu = annGriffNeu(h, griff, x)
  return { h: neu, lage: add(b.rand, b.u, annGriffX(neu, griff)), treffer, text: annFangText(treffer, abstand),
    weit: treffer.art !== 'frei' && abstand > ANN_FANG_WEIT_M }
}

/**
 * Zahleneingabe je Ende («Lage und Masse»): Versatz bzw. Breite setzen (auf 0,1 m gerundet, in den Grenzen); null (leeres Feld) =
 * dieser Wert wie gerechnet (Versatz 0, Breite des Streifenendes). Sind danach beide wie gerechnet: keine Vorgabe (null).
 */
export function annEingabe(h: AnnHand | null, breiteGerechnet: number, feld: 'versatz' | 'breite', wert: number | null): AnnHand | null {
  const alt = h ?? { versatz: 0, breite: breiteGerechnet }
  const w = wert === null ? (feld === 'versatz' ? 0 : breiteGerechnet) : Math.round(wert * 10) / 10
  const neu = annBegrenzt({ ...alt, [feld]: w })
  return Math.abs(neu.versatz) < 0.005 && Math.abs(neu.breite - breiteGerechnet) < 0.005 ? null : neu
}

/** gleiche Vorgabe (auf den cm, wie fall.annHandSetzen rundet): Text zum Fang gilt nur, solange die Vorgabe so bleibt */
export const annGleich = (a: AnnHand | null | undefined, b: AnnHand | null | undefined) =>
  !!a && !!b && Math.abs(a.versatz - b.versatz) < 0.006 && Math.abs(a.breite - b.breite) < 0.006
