// ── Knoten mit Rechtsvortritt (VSS 40 273 Teil E, Ziffern 15 bis 18, Abb. 4 bis 6; E3c) ──
//
// Nur Zahlenwerte und Ziffern, kein Normtext. Bei «Rechtsvortritt» sind alle Arme vortrittsbelastet; geprüft wird der gewählte
// Arm gegen den Arm rechts davon (sein Verkehr hat Vortritt): Zufahrtstempo 30 km/h für alle Arme (Ziffer 15), D mit B 5,00 m
// (Abb. 4) auf der Achse des Zufahrtsstreifens, Zielpunkte auf der Fahrstreifenachse des rechten Arms (rechnen.ts). Die vorhandene
// Sichtweite ergibt mit der Wahrnehmbarkeit (Eingabe, Ziffer 18) den Zustand nach Abb. 6.
// Schmale Zufahrten (b ≤ 3,50 m nach dem AV-Querschnitt eines der beiden Arme, Abb. 5): zusätzlich die Paarmatrix. Punkte alle
// PAAR_SCHRITT_M auf beiden Fahrbahnachsen bis PAAR_LAENGE_M ab ihrem Schnittpunkt; massgebend sind die Paare, deren Abstände
// zusammen höchstens die Anhaltestrecke PAAR_LAENGE_M ergeben (Auslegung: in Abb. 5 enden die Sichtlinien an Punkten, die entlang der
// Achsen rund 20 m auseinander liegen; Paare mit kleinerer Summe liegen im selben Sichtfeld), ohne Punkte im Schnittpunkt (45 Paare).
// Ein verdecktes massgebendes Paar: «Sichtfeld nach Abb. 5 nicht frei». Auf einem breiten Arm (nur einer schmal) liegen die Punkte auf
// seinem Fahrstreifen (rechnen.ts).

import { type P, winkelGrad, imPolygon } from '../geo'
import type { ArmInfo } from './typen'
import { punkteAufSpur } from './spur'
import { linieTrifft } from './hindernisse'
import type { Verdeckend } from './sicht'

/** Ziffer 15: Zufahrtsgeschwindigkeit an Knoten mit Rechtsvortritt [km/h] */
export const RV_TEMPO = 30
/** Abb. 4: Beobachtungsdistanz B [m] */
export const RV_B_M = 5.0
/** Ziffer 16: anzustrebende Knotensichtweite [m] und Minimum bei sehr guter Wahrnehmbarkeit [m] */
export const RV_A_M = 20
export const RV_A_MIN_M = 15
/** Abb. 6: Grenzen der Spalten der Knotensichtweite [m] (unter 15, 15 bis unter 20, 20 bis unter 25, ab 25) */
export const ABB6_GRENZEN = [15, 20, 25] as const
/** Zielpunkte auf der Achse des rechten Arms bis so weit ab K: 1,5 × grösste Stufe der Abb. 6 */
export const RV_ZIEL_M = Math.ceil(1.5 * ABB6_GRENZEN[2])
/** Abb. 5: schmale Zufahrt bis zu dieser Fahrbahnbreite [m]; Anhaltestrecke [m]; Abstand der Punkte [m] */
export const SCHMAL_M = 3.5
export const PAAR_LAENGE_M = 20
export const PAAR_SCHRITT_M = 2
/** ein Arm gilt als «von rechts», wenn er mehr als so viel rechts der Fahrtrichtung liegt [°] (sonst geradeaus bzw. links; eine
 *  durchgehende Strasse mit einem Knick bis 25° gilt als geradeaus, Annahme nach der Prüfrunde) */
export const RECHTS_MIN_GRAD = 25

export type Wahrnehmbarkeit = 'sehr_gut' | 'gut' | 'schlecht' | 'sehr_schlecht'
export const WAHRNEHMBARKEITEN: Wahrnehmbarkeit[] = ['sehr_gut', 'gut', 'schlecht', 'sehr_schlecht']
export const WAHRNEHMBARKEIT_TEXT: Record<Wahrnehmbarkeit, string> = {
  sehr_gut: 'sehr gut', gut: 'gut', schlecht: 'schlecht', sehr_schlecht: 'sehr schlecht',
}
/** Vorgabe ohne Eingabe (Annahme, im Panel ausgewiesen) */
export const WAHRNEHMBARKEIT_VORGABE: Wahrnehmbarkeit = 'gut'

/** Zustand nach Abb. 6: anzustrebender Zustand, zulässig wenn der anzustrebende nicht erreichbar ist, zu sanierender Zustand */
export type Zustand = 'anzustreben' | 'zulaessig' | 'sanieren'
export const ZUSTAND_TEXT: Record<Zustand, string> = {
  anzustreben: 'anzustrebender Zustand', zulaessig: 'zulässiger Zustand (Ausnahme)',
  sanieren: 'zu sanierender Zustand',
}

/**
 * VSS 40 273 Abb. 6, aus der Grafik abgelesen (16.10.2026): Zeilen Wahrnehmbarkeit, Spalten Knotensichtweite unter 15 m, 15 bis
 * unter 20 m, 20 bis unter 25 m, ab 25 m (Spalten «sehr schlecht», «schlecht», «gut», «sehr gut» der Sichtweite). Die Grafik hat
 * vier Spalten: die Achse ist bei 15, 20 und 25 m geteilt.
 *   sehr gut:      sanieren, zulässig, anzustreben, anzustreben
 *   gut:           sanieren, sanieren, anzustreben, anzustreben
 *   schlecht:      sanieren, sanieren, sanieren,    zulässig
 *   sehr schlecht: sanieren, sanieren, sanieren,    sanieren
 */
export const ABB6: Record<Wahrnehmbarkeit, [Zustand, Zustand, Zustand, Zustand]> = {
  sehr_gut: ['sanieren', 'zulaessig', 'anzustreben', 'anzustreben'],
  gut: ['sanieren', 'sanieren', 'anzustreben', 'anzustreben'],
  schlecht: ['sanieren', 'sanieren', 'sanieren', 'zulaessig'],
  sehr_schlecht: ['sanieren', 'sanieren', 'sanieren', 'sanieren'],
}
export const ABB6_SPALTEN = ['unter 15 m', '15 bis 20 m', '20 bis 25 m', 'ab 25 m']

/** Spalte der Abb. 6: dazwischen gilt die nächsttiefere Stufe (19,9 m -> Spalte «15 bis 20 m») */
export function abb6Spalte(vorhanden: number): 0 | 1 | 2 | 3 {
  const v = vorhanden + 1e-6
  return v < ABB6_GRENZEN[0] ? 0 : v < ABB6_GRENZEN[1] ? 1 : v < ABB6_GRENZEN[2] ? 2 : 3
}
export const zustandAbb6 = (w: Wahrnehmbarkeit, vorhanden: number): Zustand => ABB6[w][abb6Spalte(vorhanden)]

/** kleinste Sichtweite, die bei dieser Wahrnehmbarkeit nicht «zu sanieren» ist (null: keine) bzw. den anzustrebenden Zustand
 *  erreicht (null: keine) */
export function rvMindest(w: Wahrnehmbarkeit): { zulaessig: number | null; anzustreben: number | null } {
  const ab = [0, ...ABB6_GRENZEN]
  const i = ABB6[w].findIndex(z => z !== 'sanieren'), j = ABB6[w].findIndex(z => z === 'anzustreben')
  return { zulaessig: i < 0 ? null : ab[i], anzustreben: j < 0 ? null : ab[j] }
}

/** Winkel vom Arm a zum Arm b, im Gegenuhrzeigersinn [0, 360) */
const ccw = (a: P, b: P) => ((winkelGrad(b) - winkelGrad(a)) % 360 + 360) % 360

/**
 * Arm rechts der Zufahrt z (aus Sicht des Fahrers, der zum Knoten fährt): unter den übrigen Armen der erste im Gegenuhrzeigersinn
 * ab der Richtung von z (vom Knoten weg), wenn er mehr als RECHTS_MIN_GRAD rechts der Fahrtrichtung liegt; sonst null (kein
 * Verkehr von rechts, z. B. am Querbalken einer T-Einmündung mit dem Stamm links).
 */
export function rechterArm(z: ArmInfo, arme: ArmInfo[]): ArmInfo | null {
  return rechteArme(z, arme)[0] ?? null
}
/** alle Arme rechts der Zufahrt, der nächste zuerst (fünf und mehr Arme: mehrere) */
export function rechteArme(z: ArmInfo, arme: ArmInfo[]): ArmInfo[] {
  return arme.filter(a => a.key !== z.key && ccw(z.richtung, a.richtung) < 180 - RECHTS_MIN_GRAD)
    .sort((a, b) => ccw(z.richtung, a.richtung) - ccw(z.richtung, b.richtung))
}
/** Arm links der Zufahrt: unter den übrigen (ohne den rechten) der letzte im Gegenuhrzeigersinn (am weitesten links) */
export function linkerArm(z: ArmInfo, arme: ArmInfo[], rechts: ArmInfo | null): ArmInfo | null {
  const andere = arme.filter(a => a.key !== z.key && a.key !== rechts?.key)
    .sort((a, b) => ccw(z.richtung, a.richtung) - ccw(z.richtung, b.richtung))
  return andere.length ? andere[andere.length - 1] : null
}

/** Paar der Matrix nach Abb. 5: Punkt i auf der Achse des gewählten Arms, Punkt j auf der Achse des rechten Arms */
export interface Paar { i: number; j: number; frei: boolean }
export interface Paarmatrix {
  K: P                        // Schnittpunkt der Fahrbahnachsen
  s: number[]                 // Abstände der Punkte ab K [m] (gleich auf beiden Achsen)
  punkte1: P[]                // gewählter Arm
  punkte2: P[]                // rechter Arm
  paare: Paar[]               // massgebende Paare (s1, s2 ≥ PAAR_SCHRITT_M, s1 + s2 ≤ PAAR_LAENGE_M)
  sichtbar: number            // Anzahl freie massgebende Paare
  anteil: number              // Anteil freie massgebende Paare [0, 1]
  erste: { s1: number; s2: number; verdecker: string } | null   // erste verdeckte Kombination (kleinste Summe, dann kleinerer Abstand)
  frei: boolean
  ohneFlaechen: string[]      // Hindernisse, in denen ein Punkt liegt: nicht gerechnet (Hinweis)
  verdecker: { id: string; name: string; art: string; quelle: string }[]   // Flächen, die ein massgebendes Paar verdecken
}

/**
 * Paarmatrix nach Abb. 5. achse1, achse2: Fahrbahnachsen ab ihrem Schnittpunkt K vom Knoten weg; flaechen: Gebäude und
 * Hindernisse (nur Wirkung «voll» verdeckt; Palisade und Hinweis nicht). Hindernisse (nicht Gebäude der AV), in denen ein Punkt
 * liegt, zählen nicht (die Achse läuft durch sie hindurch).
 */
export function paarmatrix(achse1: P[], achse2: P[], flaechenAlle: Verdeckend[], laenge = PAAR_LAENGE_M, schritt = PAAR_SCHRITT_M): Paarmatrix {
  const s: number[] = []
  for (let x = 0; x <= laenge + 1e-9; x += schritt) s.push(Math.round(x * 1e6) / 1e6)
  const punkte1 = punkteAufSpur(achse1, s).map(x => x[0]), punkte2 = punkteAufSpur(achse2, s).map(x => x[0])
  const voll = flaechenAlle.filter(f => (f.wirkung ?? 'voll') === 'voll')
  const durch = voll.filter(f => f.quelle && f.quelle !== 'AV' && [...punkte1, ...punkte2].some(p => imPolygon(p, f.poly)))
  const fl = voll.filter(f => !durch.includes(f))
  const paare: Paar[] = []
  let erste: Paarmatrix['erste'] = null, ersteRang = Infinity
  const verdecker = new Map<string, Paarmatrix['verdecker'][number]>()
  // punkteAufSpur lässt Punkte jenseits des Achsenendes weg (am Ende): Schleife über die vorhandenen Punkte
  for (let i = 0; i < punkte1.length; i++) for (let j = 0; j < punkte2.length; j++) {
    // ohne Punkte im Schnittpunkt (ein Fahrzeug dort steht schon im Konfliktbereich)
    if (s[i] === 0 || s[j] === 0 || s[i] + s[j] > laenge + 1e-9) continue
    const v = fl.find(f => linieTrifft([punkte1[i], punkte2[j]], [f.poly])) ?? null
    paare.push({ i, j, frei: !v })
    if (v && !verdecker.has(v.id)) verdecker.set(v.id, { id: v.id, name: v.name, art: v.art ?? 'Gebäude', quelle: v.quelle ?? 'AV' })
    // erste verdeckte Kombination: kleinste Summe, dann kleinster grösserer Abstand, dann kleineres s1
    const rang = (s[i] + s[j]) * 1e4 + Math.max(s[i], s[j]) * 10 + s[i] / 100
    if (v && rang < ersteRang) { ersteRang = rang; erste = { s1: s[i], s2: s[j], verdecker: v.name } }
  }
  const sichtbar = paare.filter(p => p.frei).length
  return { K: punkte1[0] ?? achse1[0], s, punkte1, punkte2, paare, sichtbar, anteil: paare.length ? sichtbar / paare.length : 1, erste,
    frei: !erste, ohneFlaechen: durch.map(f => f.id), verdecker: [...verdecker.values()] }
}
