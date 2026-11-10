// Fahrbahnhöhen ohne WebGL: vom Streifen nach aussen verfolgen, niemals zum höchsten Deck springen.
import { dist, type P } from '../geo'

export type Hoehe = { h: number; grund?: never } | { h: null; grund: 'fehlt' | 'unklar' }
export const gueltigeHoehe = (h: unknown): h is number => typeof h === 'number' && Number.isFinite(h)

/** Ober- und Unterseite desselben Decks (bis 75 cm) zusammenfassen; getrennte Decks bleiben Kandidaten. */
export function kandidaten(werte: readonly unknown[]): number[] {
  const hs = werte.filter(gueltigeHoehe).sort((a, b) => a - b), aus: number[] = []
  let anfang = Number.NEGATIVE_INFINITY
  for (const h of hs) {
    if (aus.length && h - anfang <= 0.75) aus[aus.length - 1] = h
    else { aus.push(h); anfang = h }
  }
  return aus
}

/** 30 % maximale Längs-/Querneigung plus 50 cm Datenreserve; Annahmen für die Darstellung, keine Normprüfung. */
export function hoeheWaehlen(werte: readonly unknown[], vorher: unknown, abstandM: number): Hoehe {
  if (!gueltigeHoehe(vorher)) return { h: null, grund: 'fehlt' }
  const hs = kandidaten(werte).sort((a, b) => Math.abs(a - vorher) - Math.abs(b - vorher))
  if (!hs.length) return { h: null, grund: 'fehlt' }
  if (Math.abs(hs[0] - vorher) > 0.5 + 0.3 * Math.max(0, abstandM)) return { h: null, grund: 'unklar' }
  if (hs.length > 1 && Math.abs(Math.abs(hs[0] - vorher) - Math.abs(hs[1] - vorher)) < 0.25)
    return { h: null, grund: 'unklar' }
  return { h: hs[0] }
}

/** Ebene des gequerten OSM-Wegs (rechner/netz.ts) */
export type StartLage = 'hoch' | 'boden' | 'tunnel'
export interface StartWahl { h: number | null; hinweis?: string }
/** Annahmetexte der Startwahl */
export const START_DECK_TEXT = 'Streifen auf einer Brücke: Fahrbahn ab dem Deck (Annahme aus OSM bridge bzw. layer)'
export const START_UNKLAR_TEXT = 'Streifen mit mehreren Ebenen (Gelände und Brückendeck), Ebene nicht eindeutig (OSM ohne Brückenangabe, Tunnel bzw. mehrere Decks): Fahrbahnhöhe dort unklar'

/**
 * Starthöhe eines Wegs am Streifen (Prüfung 3D-01, 10.11.2026). boden: Bodenprofil (DTM 2023 Stadt Bern bzw. swissALTI3D, ohne Brücken),
 * gelaende: Geländekachel der 3D-Ansicht, deck: Deckhöhen am Startpunkt, lage: Ebene des gequerten OSM-Wegs.
 * - Eine Ebene (Deck höchstens 0,75 m über dem Boden bzw. kein Deck): wie bisher der Boden (am Klösterlistutz liegt das DTM am Streifen
 *   auf der Fahrbahn).
 * - Mehrere Ebenen: lage «hoch» und genau ein Deck über dem Boden → dieses Deck; lage «boden» (auch Unterführung, layer < 0) → der
 *   Boden; sonst (keine OSM-Angabe, Tunnel, mehrere Decks) unklar. Nie pauschal das höchste Deck.
 */
export function startWaehlen(boden: unknown, gelaende: unknown, deck: readonly unknown[], lage?: StartLage | null): StartWahl {
  const unten = gueltigeHoehe(boden) ? boden : gueltigeHoehe(gelaende) ? gelaende : null
  const ebenen = kandidaten([unten, ...deck])
  if (ebenen.length < 2) return { h: gueltigeHoehe(boden) ? boden : ebenen.length === 1 && gueltigeHoehe(gelaende) ? gelaende : null }
  if (lage === 'boden' && unten !== null) return { h: unten }
  if (lage === 'hoch' && unten !== null) {
    const oben = ebenen.filter(h => h > unten + 0.75)
    if (oben.length === 1) return { h: oben[0], hinweis: START_DECK_TEXT }
  }
  return { h: null, hinweis: START_UNKLAR_TEXT }
}

export interface WegProbe { p: P; kandidaten: readonly unknown[]; boden?: number | null }
export interface FahrbahnProbe { p: P; hoehe: Hoehe; boden?: number | null }
export const LUECKE_MAX_M = 5
const RESERVE_M = 0.5

export function fahrbahnVerfolgen(proben: readonly WegProbe[], start: unknown): FahrbahnProbe[] {
  const aus: FahrbahnProbe[] = proben.map(p => ({ p: p.p, boden: p.boden, hoehe: { h: null, grund: kandidaten(p.kandidaten).length ? 'unklar' : 'fehlt' } }))
  const ds = proben.map((p, i) => i ? dist(proben[i - 1].p, p.p) : 0)
  for (let i = 1; i < ds.length; i++) ds[i] += ds[i - 1]
  let sicher = -1, davor = -1
  for (let i = 0; i < proben.length; i++) {
    const letzte = sicher >= 0 ? aus[sicher].hoehe.h : start
    if (sicher === i - 1) {
      const h = hoeheWaehlen(proben[i].kandidaten, letzte, i ? ds[i] - ds[i - 1] : 0)
      aus[i].hoehe = h
      if (h.h !== null) { davor = sicher; sicher = i; continue }
    }
    // Erst nach zwei sicheren Punkten ist eine Neigung bekannt. Keine wachsende Höhenreserve über Datenlücken.
    if (sicher < 0 || davor < 0 || ds[i] - ds[sicher] > LUECKE_MAX_M || i + 1 >= proben.length) continue
    const h0 = aus[davor].hoehe.h!, h1 = aus[sicher].hoehe.h!, laenge = ds[sicher] - ds[davor]
    const neigung = laenge > 0 ? (h1 - h0) / laenge : Infinity
    if (Math.abs(neigung) > 0.3 || ds[i + 1] - ds[i] > 1.5) continue
    const passend = (j: number) => kandidaten(proben[j].kandidaten).filter(h =>
      Math.abs(h - (h1 + neigung * (ds[j] - ds[sicher]))) <= RESERVE_M &&
      Math.abs(h - h1) <= RESERVE_M + 0.3 * (ds[j] - ds[sicher]))
    const a = passend(i), b = passend(i + 1)
    if (a.length !== 1 || b.length !== 1 || Math.abs(b[0] - a[0]) > RESERVE_M + 0.3 * (ds[i + 1] - ds[i])) continue
    aus[i].hoehe = { h: a[0] }; aus[i + 1].hoehe = { h: b[0] }
    davor = i; sicher = i + 1; i++
  }
  return aus
}

/** Höhe am nächsten Segment, mit Interpolation entlang des Wegs (keine Übertragung über dessen Ende hinaus). */
export function wegBezug(p: P, proben: readonly FahrbahnProbe[]): { abstand: number; hoehe: Hoehe } | null {
  let aus: { abstand: number; hoehe: Hoehe } | null = null
  for (let i = 0; i < proben.length; i++) {
    const a = proben[i], b = proben[Math.min(i + 1, proben.length - 1)]
    const dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a.p[0]) * dx + (p[1] - a.p[1]) * dy) / l2)) : 0
    const abstand = dist(p, [a.p[0] + t * dx, a.p[1] + t * dy])
    const hoehe: Hoehe = t === 0 ? a.hoehe : t === 1 ? b.hoehe : a.hoehe.h !== null && b.hoehe.h !== null
      ? { h: a.hoehe.h + t * (b.hoehe.h - a.hoehe.h) } : { h: null, grund: 'unklar' }
    if (!aus || abstand < aus.abstand) aus = { abstand, hoehe }
  }
  return aus
}
