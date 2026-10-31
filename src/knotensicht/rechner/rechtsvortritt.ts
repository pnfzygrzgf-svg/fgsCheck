// ── Knoten mit Rechtsvortritt (VSS 40 273 Teil E, Ziffern 15 bis 18, Abb. 4 bis 6; E3c) ──
//
// Nur Zahlenwerte und Ziffern, kein Normtext. Bei «Rechtsvortritt» sind alle Arme vortrittsbelastet; geprüft wird der gewählte
// Arm gegen den Arm rechts davon (sein Verkehr hat Vortritt): Zufahrtstempo 30 km/h für alle Arme (Ziffer 15), D mit B 5,00 m
// (Abb. 4) auf der Achse des Zufahrtsstreifens, Zielpunkte auf der Fahrstreifenachse des rechten Arms (rechnen.ts). Die vorhandene
// Sichtweite ergibt mit der Wahrnehmbarkeit (Eingabe, Ziffer 18) den Zustand nach Abb. 6.
// Schmale Zufahrten (b ≤ 3,50 m nach dem AV-Querschnitt eines der beiden Arme, Abb. 5): zusätzlich das Sichtfeld der schmalen
// Zufahrt (Block 5, Entscheid 31.10.2026, ersetzt die Paarmatrix). Die Norm zeigt in Abb. 5 (S. 11) nur eine Grafik; die Konstruktion
// beschreibt die bfu BM.021 (2022), Kap. 3.2.2 und Abb. 4 (S. 4): ein Pfad von ENG_LAENGE_M (doppelte Anhaltestrecke bei rund
// 25 km/h und 1 s Reaktionszeit) mit Punkten alle ENG_SCHRITT_M, vom wartenden Fahrzeug je eine Sichtlinie. Umsetzung: Beobachter =
// D des Rechtsvortritts (B 5,00 m, Fahrersitz; Annahme), Pfad ab D (Lotfusspunkt auf der Achse der Zufahrt; Annahme: Pfadbeginn in D)
// entlang der Achse der Zufahrt bis zum Schnittpunkt X mit der Achse des rechten Arms, dann auf dieser (Fahrbahnmitte bei schmalem
// Arm, sonst Fahrstreifenachse; rechnen.ts). Gezählt werden X und die Punkte dahinter (Punkte auf der eigenen Achse vor D nicht);
// Sichtlinien D -> Punkt gegen Gebäude und volle Hindernisse. Sichtfeld frei = alle Linien frei, sonst «Sichtfeld nach Abb. 5 nicht
// frei».

import { type P, winkelGrad, imPolygon, dist } from '../geo'
import type { ArmInfo } from './typen'
import { punkteAufSpur } from './spur'
import { lot } from './hauptachsen'
import { abschneiden } from './netz'
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
/** Abb. 5: schmale Zufahrt bis zu dieser Fahrbahnbreite [m]; bfu BM.021 Abb. 4: Länge des Pfads (doppelte Anhaltestrecke bei rund
 *  25 km/h) und Abstand der Punkte darauf [m] */
export const SCHMAL_M = 3.5
export const ENG_LAENGE_M = 20
export const ENG_SCHRITT_M = 2
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

/** Sichtlinie des Sichtfelds einer schmalen Zufahrt (bfu BM.021 Abb. 4): Punkt bei Pfadlänge s ab D (sRechts ab X auf dem rechten Arm) */
export interface EngLinie { s: number; sRechts: number; p: P; frei: boolean; verdecker: string | null }
/** Sichtfeld einer schmalen Zufahrt (VSS 40 273 Abb. 5, Konstruktion nach bfu BM.021 Kap. 3.2.2, Abb. 4; Block 5) */
export interface SichtfeldEng {
  D: P                        // Beobachtungspunkt (Fahrersitz)
  X: P                        // Schnittpunkt der Achse der Zufahrt mit der Achse des rechten Arms
  bisX: number                // Pfadlänge vom Lotfusspunkt von D auf der Achse der Zufahrt bis X [m]
  laenge: number              // Länge des Pfads [m] (ENG_LAENGE_M)
  pfad: P[]                   // ab dem Lotfusspunkt von D über X auf der Achse des rechten Arms bis laenge
  linien: EngLinie[]          // geprüfte Sichtlinien: X und die Punkte dahinter
  sichtbar: number            // Anzahl freie Linien
  anteil: number              // Anteil freie Linien [0, 1]
  erste: { s: number; sRechts: number; verdecker: string } | null   // erste verdeckte Linie (kleinste Pfadlänge)
  frei: boolean               // alle Linien frei
  ohneFlaechen: string[]      // Hindernisse, in denen ein Punkt liegt: nicht gerechnet (Hinweis)
  verdecker: { id: string; name: string; art: string; quelle: string }[]   // Flächen, die eine Linie verdecken
}

/**
 * Sichtfeld einer schmalen Zufahrt nach bfu BM.021 Abb. 4. D: Beobachtungspunkt; achseZ: Achse der Zufahrt ab X vom Knoten weg (zu D
 * hin); achseR: Achse des rechten Arms ab X vom Knoten weg; flaechenAlle: Gebäude und Hindernisse (nur Wirkung «voll»; Palisade und
 * Hinweis nicht). Punkte alle schritt ab D entlang des Pfads bis laenge; Punkte vor X (auf der eigenen Achse vor D) zählen nicht, X
 * immer. Hindernisse (nicht Gebäude der AV), in denen ein Punkt liegt, zählen nicht (der Pfad läuft durch sie hindurch).
 */
export function sichtfeldEng(D: P, achseZ: P[], achseR: P[], flaechenAlle: Verdeckend[], laenge = ENG_LAENGE_M,
  schritt = ENG_SCHRITT_M): SichtfeldEng {
  const X = achseR[0] ?? achseZ[0]
  const fuss = lot(achseZ, D)
  const bisX = fuss.s
  // Pfadlängen der Punkte: X, dann die Vielfachen von schritt hinter X bis laenge
  const sListe = [bisX]
  for (let k = 1; k * schritt <= laenge + 1e-9; k++) if (k * schritt > bisX + 1e-6) sListe.push(Math.round(k * schritt * 1e6) / 1e6)
  const ziele = punkteAufSpur(achseR, sListe.map(x => Math.max(0, x - bisX))).map(x => x[0])
  const voll = flaechenAlle.filter(f => (f.wirkung ?? 'voll') === 'voll')
  const durch = voll.filter(f => f.quelle && f.quelle !== 'AV' && ziele.some(p => imPolygon(p, f.poly)))
  const fl = voll.filter(f => !durch.includes(f))
  const verdecker = new Map<string, SichtfeldEng['verdecker'][number]>()
  // punkteAufSpur lässt Punkte jenseits des Achsenendes weg (am Ende): Schleife über die vorhandenen Punkte
  const linien: EngLinie[] = ziele.map((p, k) => {
    const v = fl.find(f => dist(D, p) > 1e-9 && linieTrifft([D, p], [f.poly])) ?? null
    if (v && !verdecker.has(v.id)) verdecker.set(v.id, { id: v.id, name: v.name, art: v.art ?? 'Gebäude', quelle: v.quelle ?? 'AV' })
    return { s: sListe[k], sRechts: Math.max(0, sListe[k] - bisX), p, frei: !v, verdecker: v?.name ?? null }
  })
  const e = linien.find(l => !l.frei) ?? null
  const sichtbar = linien.filter(l => l.frei).length
  const pfad = [...abschneiden(achseZ, bisX).reverse(), ...abschneiden(achseR, Math.max(0, laenge - bisX)).slice(1)]
  return { D, X, bisX, laenge, pfad, linien, sichtbar, anteil: linien.length ? sichtbar / linien.length : 1,
    erste: e ? { s: e.s, sRechts: e.sRechts, verdecker: e.verdecker! } : null, frei: !e, ohneFlaechen: durch.map(f => f.id),
    verdecker: [...verdecker.values()] }
}
