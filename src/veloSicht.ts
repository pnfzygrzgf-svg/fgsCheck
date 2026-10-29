// ── Sicht vom Velo mit gemessener Längsneigung (29.10.2026) ──
//
// Die Rechnung (rechner/pruefen.ts, veloSicht) prüft die Sicht von der Veloachse bis zum grössten Wert der Zeile von VSS 40 273 Tab. 3
// (nach dem signalisierten Tempo) und liefert «frei bis». Das Soll wählt erst die Anzeige bzw. das Befundblatt nach der Längsneigung
// in Fahrtrichtung (talwärts negativ) aus dem Höhenprofil entlang der Fahrlinie (App, Schlüssel «fgsId|zufahrt»); ohne Profil 0 %.

import { veloSichtweite } from './knotensicht/rechner/velo'
import type { NeigungMessung } from './knotensicht/rechner/typen'
import type { ZufahrtErgebnis } from './rechner/typen'

export interface VeloSoll {
  /** Längsneigung [%] in Fahrtrichtung (talwärts negativ); 0 ohne Profil */
  i: number
  /** «Längsneigung −3 % (swissALTI3D)» bzw. «Längsneigung 0 % angenommen (Höhenmodell …)» */
  neigungText: string
  gemessen: boolean
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

/** Soll und Ergebnis der Velo-Sicht einer Zufahrt mit der gemessenen Längsneigung (fehlt: 0 %); null ohne Velo-Prüfung */
export function veloSoll(z: Pick<ZufahrtErgebnis, 'fgsId' | 'zufahrt' | 'tempo' | 'velo'>,
  neigung?: Readonly<Record<string, NeigungMessung>> | null): VeloSoll | null {
  const v = z.velo
  if (!v) return null
  const m = neigung?.[`${z.fgsId}|${z.zufahrt}`]
  const gemessen = !!m && m.i !== null
  const i = gemessen ? m!.i! : 0
  const vs = veloSichtweite(z.tempo, i)
  const kurz = !v.konflikte.length && v.freiBisM < vs.A - 1
  return { i, gemessen, A: vs.A, text: vs.text, ...(kurz ? { nurBis: v.freiBisM } : {}), frei: !v.konflikte.length || v.freiBisM >= vs.A - 1e-6, ebikeA: vs.zeile === 'ueber30' ? veloSichtweite(z.tempo, i, true).A : null,
    neigungText: gemessen ? `Längsneigung ${prozent(i)} (swissALTI3D)`
      : `Längsneigung 0 % angenommen (Höhenmodell ${m ? 'nicht verfügbar' : 'nicht verfügbar bzw. lädt'})` }
}
