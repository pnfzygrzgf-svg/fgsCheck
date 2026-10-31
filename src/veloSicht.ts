// ── Sicht vom Velo mit gemessener Längsneigung (29.10.2026) ──
//
// Die Rechnung (rechner/pruefen.ts, veloSicht) prüft die Sicht von der Veloachse bis zum grössten Wert der Zeile von VSS 40 273 Tab. 3
// (nach dem signalisierten Tempo) und liefert «frei bis». Das Soll wählt erst die Anzeige bzw. das Befundblatt nach der Längsneigung
// in Fahrtrichtung (talwärts negativ) aus dem Höhenprofil entlang der Fahrlinie (App, Schlüssel «fgsId|zufahrt»). Solange das Profil
// lädt (keine Messung), vorerst 0 %; ist es geladen, aber ohne Neigung (Höhenmodell nicht verfügbar bzw. Profil zu kurz: i null), ist
// die Neigung unbekannt und es gilt der strengste Wert der Tab. 3, Spalte ≤ −4 % (Entscheid 31.10.2026, wie im SichtweitenCheck).

import { veloSichtweite } from './knotensicht/rechner/velo'
import type { NeigungMessung } from './knotensicht/rechner/typen'
import type { ZufahrtErgebnis } from './rechner/typen'

export interface VeloSoll {
  /** Längsneigung [%] in Fahrtrichtung (talwärts negativ); 0 ohne Messung (lädt) und bei unbekannter Neigung (kein Mass; das Soll
   * nimmt dann die Spalte ≤ −4 %) */
  i: number
  /** «Längsneigung −3 % (swissALTI3D)», «Längsneigung unbekannt (…): strengster Wert der Tab. 3 angenommen» bzw. «Längsneigung vorerst
   * 0 % angenommen (Höhenmodell lädt)» */
  neigungText: string
  /** Neigung aus dem Höhenprofil gemessen (false: lädt bzw. unbekannt) */
  gemessen: boolean
  /** Profil geladen, aber keine Neigung bestimmbar: strengster Wert (Entscheid 31.10.2026) */
  unbekannt: boolean
  /** Soll nach Tab. 3 und Herleitung */
  A: number; text: string
  frei: boolean
  /** über 30 km/h: Soll, wenn schnelle E-Bikes verboten sind (Tab. 3); sonst null */
  ebikeA: number | null
  /** frei, aber die Fahrlinie reicht nicht bis zum Soll: nur bis hier geprüft */
  nurBis?: number
}

/** Neigung als Text mit echtem Minus und Komma */
export const prozent = (i: number): string => `${i < 0 ? '−' : ''}${String(Math.abs(Math.round(i * 10) / 10)).replace('.', ',')} %`

/** Soll und Ergebnis der Velo-Sicht einer Zufahrt mit der gemessenen Längsneigung (fehlt: vorerst 0 %; ohne Neigung im geladenen
 * Profil: strengster Wert); null ohne Velo-Prüfung */
export function veloSoll(z: Pick<ZufahrtErgebnis, 'fgsId' | 'zufahrt' | 'tempo' | 'velo'>,
  neigung?: Readonly<Record<string, NeigungMessung>> | null): VeloSoll | null {
  const v = z.velo
  if (!v) return null
  const m = neigung?.[`${z.fgsId}|${z.zufahrt}`]
  const gemessen = !!m && m.i !== null
  // unbekannt: Messung da, aber ohne Neigung; i bleibt dann 0 (kein Mass), das Soll nimmt den strengsten Wert
  const unbekannt = !!m && m.i === null
  const i = gemessen ? m!.i! : 0
  const vs = veloSichtweite(z.tempo, i, false, unbekannt)
  const kurz = !v.konflikte.length && v.freiBisM < vs.A - 1
  return { i, gemessen, unbekannt, A: vs.A, text: vs.text, ...(kurz ? { nurBis: v.freiBisM } : {}), frei: !v.konflikte.length || v.freiBisM >= vs.A - 1e-6,
    ebikeA: vs.zeile === 'ueber30' ? veloSichtweite(z.tempo, i, true, unbekannt).A : null,
    neigungText: gemessen ? `Längsneigung ${prozent(i)} (swissALTI3D)`
      : unbekannt ? 'Längsneigung unbekannt (Höhenmodell nicht verfügbar): strengster Wert der Tab. 3 angenommen'
        : 'Längsneigung vorerst 0 % angenommen (Höhenmodell lädt)' }
}
