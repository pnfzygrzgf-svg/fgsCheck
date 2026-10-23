// ── Hindernisse (E2): Parkfelder, Bäume, Hecken/Mauern/übrige – Eingaben von Hand bzw. bestätigte Vorschläge ──
//
// Gegenstück zu ParkRaster und Baeume in fgs_sicht_pruefen.py. Im Berner Projekt kommen Parkfelder aus dem Kataster und Bäume
// aus dem Baumkataster; in der App zeichnet der Nutzer sie (bzw. bestätigt Vorschläge aus OSM-Tags); Bäume aus dem
// Baumkataster und amtliche Parkfelder (Quelle 'kataster', daten/parkkataster.ts) zählen ohne Bestätigung, verwerfbar. Die
// Rechnung behandelt alle Quellen gleich.
// Hecken, Mauern und übrige Hindernisse gibt es im Berner Projekt nicht; sie zählen wie Gebäude (Fläche bzw. Linie im
// Sichtfeld ohne Streifen und Annäherungsbereiche), wenn sie als «sichtbehindernd» markiert sind.
// SichtweitenCheck E2a: dazu Zaun bzw. Geländer (Linie, dicht oder sichtdurchlässig) und hindernisVerdeckend(): Hindernisse
// als verdeckende Polygone für rechner/sicht.ts mit ihrer Wirkung (voll, Palisade, nur Hinweis; VSS 40 273 Ziffer 11, Abb. 3).
// HindernisDaten und ParkRaster bleiben aus fgsCheck (Typen in spur.ts und fahrstreifen.ts), die Sichtrechnung nutzt sie nicht.

import { type P, add, dist, imPolygon, sub, einheit, rechts } from '../geo'
import { type Multi, type Poly, abstandPunkt } from './poly'
import type { Verdeckend } from './sicht'

export const BAUM_STAMM_M = 0.5            // Stamm als Kreis mit diesem Durchmesser (BAUM_STAMM_M)
export const LAENGS_BREITE_M = 2.0         // Längsparkierung von Hand: Breite des Streifens (Annahme, wie ein Parkfeld)
/** Hecke, Mauer und Zaun als Linie: Puffer je 0,3 m beidseits der Linie (Breite 0,6 m, Enden rechtwinklig) */
export const LINIE_PUFFER_M = 0.3

export type ParkKlasse = 'auto' | 'velo' | 'motorrad'
export type Quelle = 'hand' | 'osm' | 'kataster'

export type Hindernis =
  | { id: string; art: 'parkfeld'; klasse: ParkKlasse; ring: P[]; quelle: Quelle; name?: string }
  | { id: string; art: 'laengsparkierung'; linie: P[]; breite: number; quelle: Quelle; name?: string }
  | { id: string; art: 'baum'; p: P; stamm: number; quelle: Quelle; name?: string }
  | { id: string; art: 'hecke' | 'mauer' | 'uebrige'; linie?: P[]; ring?: P[]; sichtbehindernd: boolean; quelle: Quelle; name?: string }
  | { id: string; art: 'zaun'; linie: P[]; dicht: boolean; quelle: Quelle; name?: string }

export type HindernisArt = Hindernis['art']

/** Längsparkierung (Mittellinie, Breite) -> Polygon (Puffer quer zur Linie, Enden rechtwinklig). An Knickpunkten mit
 *  Gehrung (Versatz breite/2 / cos(θ/2), höchstens doppelt), damit der Streifen dort nicht schmaler wird; doppelte Punkte
 *  (Doppelklick) entfallen. */
export function laengsPolygon(linieRoh: P[], breite: number): P[] {
  const linie = linieRoh.filter((p, i) => i === 0 || dist(p, linieRoh[i - 1]) > 1e-6)
  if (linie.length < 2) return []
  const h = breite / 2
  const n = (i: number): P => rechts(einheit(sub(linie[i + 1], linie[i])))    // Normale der Strecke i
  const versatz = (i: number): P => {
    if (i === 0) return n(0)
    if (i === linie.length - 1) return n(i - 1)
    const a = n(i - 1), b = n(i)
    const m = einheit(add(a, b))
    const c = m[0] * a[0] + m[1] * a[1]                                     // cos(θ/2)
    if (c < 1e-6) return a                                                  // Umkehr: ohne Gehrung
    const f = Math.min(1 / c, 2)
    return [m[0] * f, m[1] * f]
  }
  const links = linie.map((p, i) => add(p, versatz(i), -h)), rechtsS = linie.map((p, i) => add(p, versatz(i), h))
  return [...links, ...rechtsS.reverse()]
}

/** Stamm als Polygon (16 Ecken, wie Buffer(…, 4)) */
export function stammPolygon(p: P, d: number): P[] {
  const r = d / 2
  return Array.from({ length: 16 }, (_, k) => [p[0] + r * Math.cos(k * Math.PI / 8), p[1] + r * Math.sin(k * Math.PI / 8)] as P)
}

interface Feld { poly: Poly; env: [number, number, number, number]; klasse: ParkKlasse; name: string; id: string }

const env = (r: P[]): [number, number, number, number] =>
  [Math.min(...r.map(p => p[0])), Math.min(...r.map(p => p[1])), Math.max(...r.map(p => p[0])), Math.max(...r.map(p => p[1]))]

/** ParkRaster: Parkfelder (alle Klassen; auto = nur Autos) mit trifft/kandidaten/abstand wie in Python */
export class ParkRaster {
  felder: Feld[]
  constructor(felder: Feld[], nurAuto: boolean) { this.felder = nurAuto ? felder.filter(f => f.klasse === 'auto') : felder }
  /** trifft: Kreis mit radius um p berührt ein Feld */
  trifft(p: P, radius = 0.4): boolean {
    return this.felder.some(f => p[0] >= f.env[0] - radius && p[0] <= f.env[2] + radius && p[1] >= f.env[1] - radius &&
      p[1] <= f.env[3] + radius && abstandPunkt([f.poly], p) <= radius)
  }
  kandidaten(p: P, radius: number): Feld[] {
    return this.felder.filter(f => !(p[0] < f.env[0] - radius - 20 || p[0] > f.env[2] + radius + 20 || p[1] < f.env[1] - radius - 20 ||
      p[1] > f.env[3] + radius + 20))
  }
  abstand(p: P, felder: Feld[] | null = null, bis = Infinity): number {
    const ff = felder ?? this.kandidaten(p, bis)
    return ff.length ? Math.min(...ff.map(f => abstandPunkt([f.poly], p))) : bis
  }
  get leer(): boolean { return this.felder.length === 0 }
}

export interface BaumInfo { xy: P; stamm: Multi; name: string; id: string }
export interface SonstInfo { geom: Multi | null; linie: P[] | null; name: string; id: string; art: string }

/** Hindernisse für die Rechnung aufbereiten */
export class HindernisDaten {
  park: ParkRaster          // Auto-Parkfelder (Parkstreifen, Nase, Ecke, Rand am Umriss)
  parkAlle: ParkRaster      // alle Klassen (Konflikte, Abstand 1,5 m)
  baeume: BaumInfo[]
  sonstige: SonstInfo[]
  constructor(liste: Hindernis[]) {
    const felder: Feld[] = []
    this.baeume = []
    this.sonstige = []
    for (const h of liste) {
      if (h.art === 'parkfeld' && h.ring.length >= 3) felder.push({ poly: [h.ring], env: env(h.ring), klasse: h.klasse,
        name: h.name ?? `Parkfeld (${h.klasse}, ${h.quelle === 'hand' ? 'von Hand' : h.quelle})`, id: h.id })
      else if (h.art === 'laengsparkierung') {
        const r = laengsPolygon(h.linie, h.breite)
        if (r.length >= 3) felder.push({ poly: [r], env: env(r), klasse: 'auto', name: h.name ?? 'Längsparkierung von Hand', id: h.id })
      } else if (h.art === 'baum') this.baeume.push({ xy: h.p, stamm: [[stammPolygon(h.p, h.stamm || BAUM_STAMM_M)]],
        name: h.name ?? `Baum (${h.quelle === 'hand' ? 'von Hand' : h.quelle})`, id: h.id })
      else if ((h.art === 'hecke' || h.art === 'mauer' || h.art === 'uebrige') && h.sichtbehindernd)
        this.sonstige.push({ geom: h.ring && h.ring.length >= 3 ? [[h.ring]] : null, linie: h.linie && h.linie.length >= 2 ? h.linie : null,
          name: h.name ?? ({ hecke: 'Hecke', mauer: 'Mauer', uebrige: 'Hindernis' } as Record<string, string>)[h.art], id: h.id, art: h.art })
    }
    this.park = new ParkRaster(felder, true)
    this.parkAlle = new ParkRaster(felder, false)
  }
}

/** Liegt die Linie (Strecken) im Mehrfachpolygon bzw. schneidet sie es? */
export function linieTrifft(linie: P[], m: Multi): boolean {
  for (let k = 0; k < linie.length - 1; k++) {
    if (m.some(poly => imPolygon(linie[k], poly))) return true
    for (const poly of m) for (const r of poly) for (let i = 0; i < r.length; i++)
      if (segSchneidet(linie[k], linie[k + 1], r[i], r[(i + 1) % r.length])) return true
  }
  return m.some(poly => imPolygon(linie[linie.length - 1], poly))
}

function segSchneidet(a: P, b: P, c: P, d: P): boolean {
  const cr = (o: P, p: P, q: P) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
  const d1 = cr(a, b, c), d2 = cr(a, b, d), d3 = cr(c, d, a), d4 = cr(c, d, b)
  return d1 * d2 <= 0 && d3 * d4 <= 0 && !(d1 === 0 && d2 === 0)
}

/** Länge der Linie innerhalb des Mehrfachpolygons (0,1-m-Abtastung) */
export function linieLaengeIn(linie: P[], m: Multi): number {
  let s = 0
  for (let k = 0; k < linie.length - 1; k++) {
    const l = dist(linie[k], linie[k + 1]), n = Math.max(1, Math.ceil(l / 0.1))
    for (let i = 0; i < n; i++) {
      const q = add(linie[k], sub(linie[k + 1], linie[k]), (i + 0.5) / n)
      if (m.some(poly => imPolygon(q, poly))) s += l / n
    }
  }
  return s
}


// ---------------------------------------------------------------- SichtweitenCheck E2a: Hindernisse als verdeckende Polygone

export const KLASSE_TEXT: Record<ParkKlasse, string> = { auto: 'Auto', velo: 'Velo', motorrad: 'Motorrad' }

/** Art eines Hindernisses als Text, z. B. «Parkfeld Auto», «Zaun (dicht)» */
export function artText(h: Hindernis): string {
  switch (h.art) {
    case 'parkfeld': return `Parkfeld ${KLASSE_TEXT[h.klasse]}`
    case 'laengsparkierung': return 'Längsparkierung'
    case 'baum': return 'Baum'
    case 'hecke': return 'Hecke'
    case 'mauer': return 'Mauer'
    case 'uebrige': return 'übriges Hindernis'
    case 'zaun': return h.dicht ? 'Zaun (dicht)' : 'Zaun (sichtdurchlässig)'
  }
}

/** Quelle eines Hindernisses als Text */
export function quelleText(h: Hindernis): string {
  if (h.quelle === 'hand') return 'von Hand'
  if (h.quelle === 'osm') return 'aus OSM (bestätigt)'
  return h.art === 'baum' ? 'Baumkataster' : 'amtlich (Parkkataster)'
}

/** Umriss eines Hindernisses (Parkfeld, Puffer der Längsparkierung bzw. der Linie, Stamm als Kreis, Fläche); leer = ungültig */
export function hindernisRing(h: Hindernis): P[] {
  switch (h.art) {
    case 'parkfeld': return h.ring.length >= 3 ? h.ring : []
    case 'laengsparkierung': return laengsPolygon(h.linie, h.breite)
    case 'baum': return stammPolygon(h.p, h.stamm || BAUM_STAMM_M)
    case 'zaun': return laengsPolygon(h.linie, 2 * LINIE_PUFFER_M)
    default:
      if (h.ring && h.ring.length >= 3) return h.ring
      return h.linie && h.linie.length >= 2 ? laengsPolygon(h.linie, 2 * LINIE_PUFFER_M) : []
  }
}

/**
 * Wirkung in der Sichtrechnung (Entscheide vom 16.10.2026): Parkfeld Auto und Längsparkierung voll (Parkfeld gilt als belegt);
 * Parkfeld Velo bzw. Motorrad nur Hinweis (Entscheid 1); Baum als Palisade (Entscheid 2, rechner/sicht.ts); Hecke, Mauer und
 * übriges voll, wenn «sichtbehindernd» (Entscheid 3), sonst keine; Zaun dicht voll, sichtdurchlässig nur Hinweis.
 * null = zählt nicht (auch nicht als Hinweis).
 */
export function wirkung(h: Hindernis): 'voll' | 'palisade' | 'hinweis' | null {
  switch (h.art) {
    case 'parkfeld': return h.klasse === 'auto' ? 'voll' : 'hinweis'
    case 'laengsparkierung': return 'voll'
    case 'baum': return 'palisade'
    case 'zaun': return h.dicht ? 'voll' : 'hinweis'
    default: return h.sichtbehindernd ? 'voll' : null
  }
}

/** Hindernisse -> verdeckende Polygone mit Art, Quelle und Wirkung (ohne ungültige und nicht wirksame) */
export function hindernisVerdeckend(liste: Hindernis[]): Verdeckend[] {
  const out: Verdeckend[] = []
  for (const h of liste) {
    const w = wirkung(h), ring = hindernisRing(h)
    if (!w || ring.length < 3) continue
    out.push({ poly: [ring], id: h.id, name: h.name ?? artText(h), art: artText(h), quelle: quelleText(h), wirkung: w })
  }
  return out
}
