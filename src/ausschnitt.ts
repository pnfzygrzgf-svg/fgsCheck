// ── Abgesuchte Kartenausschnitte (automatische Übergangssuche): enthalten, erweitern, Cache der letzten Ausschnitte ──
//
// Die App sucht nach jedem Verschieben bzw. Zoomen (App.tsx, ausschnitt und suchen). Liegt der neue Ausschnitt ganz in einem
// schon abgesuchten, fragt sie Overpass nicht neu. Abgefragt wird der Ausschnitt mit Rand (AUSSCHNITT_RAND, abfrageBox), damit
// kleines Verschieben und Hineinzoomen keine neue Abfrage auslöst. Behalten werden die letzten CACHE_MAX Ausschnitte; die
// angezeigten Übergänge sind deren Vereinigung (nach id ohne Doppel), so wächst die Liste nicht ohne Grenze.

export interface Box { s: number; w: number; n: number; e: number }
export interface CacheEintrag<T> { box: Box; daten: T[] }

/**
 * Rand je Seite als Anteil von Breite bzw. Höhe: 20 % je Seite, die Abfrage deckt das 1,4-Fache in jeder Richtung (rund das
 * Doppelte der Fläche). Ein Verschieben um bis zu einem Fünftel des Bildschirms bleibt im abgesuchten Rechteck; die Abfrage
 * holt nur Knoten (keine Wege), auch das Doppelte der Fläche bleibt klein.
 */
export const AUSSCHNITT_RAND = 0.2
export const CACHE_MAX = 8

/**
 * Grösse der Abfrage. Zoom 16 (Grenze der Suche) zeigt bei 47° N rund 1,6 m je Bildpunkt: ein Kartenbereich von 1000 × 900 px
 * (Laptop neben dem Panel) umfasst rund 2,4 km², 1500 × 1050 px rund 4,2 km², 2150 × 1400 px (grosser Bildschirm) rund 8 km².
 * Mit 20 % Rand je Seite wäre die Abfrage fast doppelt so gross. Darum: Rand nur so weit, dass die Abfrage höchstens
 * ABFRAGE_ZIEL_KM2 umfasst (Laptop: Rand fast voll, grosser Bildschirm: ohne Rand); ist die Sicht grösser als SICHT_MAX_KM2
 * (sehr grosser Bildschirm bei Zoom 16), sucht die App erst nach weiterem Hineinzoomen. So bleibt eine Abfrage auch in
 * dichten Innenstädten bei einigen hundert KB, und der Mindestzoom 16 bleibt für übliche Bildschirme.
 */
export const ABFRAGE_ZIEL_KM2 = 4
export const SICHT_MAX_KM2 = 10

/** Fläche eines Rechtecks in km² (Kugel, für die Begrenzung genügend genau) */
export function flaecheKm2(b: Box): number {
  const KM_JE_GRAD = 111.32
  return Math.abs((b.n - b.s) * KM_JE_GRAD * (b.e - b.w) * KM_JE_GRAD * Math.cos(((b.n + b.s) / 2) * Math.PI / 180))
}

/** Sicht zu gross für eine Abfrage (mehr als max km²)? */
export const zuGross = (sicht: Box, max = SICHT_MAX_KM2) => flaecheKm2(sicht) > max

/**
 * Abfragerechteck: Sicht mit Rand, höchstens rand je Seite und nur so viel, dass die Abfrage höchstens ziel km² umfasst
 * (Fläche mit Rand r: a · (1 + 2r)², also r = (√(ziel / a) − 1) / 2); ist schon die Sicht grösser, ohne Rand.
 */
export function abfrageBox(sicht: Box, ziel = ABFRAGE_ZIEL_KM2, rand = AUSSCHNITT_RAND): Box {
  const a = flaecheKm2(sicht)
  const r = a > 0 ? Math.min(rand, Math.max(0, (Math.sqrt(ziel / a) - 1) / 2)) : rand
  return r > 0 ? erweitern(sicht, r) : sicht
}

/** liegt innen ganz in aussen? */
export function enthaelt(aussen: Box, innen: Box): boolean {
  return innen.s >= aussen.s && innen.n <= aussen.n && innen.w >= aussen.w && innen.e <= aussen.e
}

/** Rechteck je Seite um anteil seiner Höhe bzw. Breite vergrössern (Breite auf ±90° begrenzt) */
export function erweitern(b: Box, anteil = AUSSCHNITT_RAND): Box {
  const dy = (b.n - b.s) * anteil, dx = (b.e - b.w) * anteil
  return { s: Math.max(-90, b.s - dy), n: Math.min(90, b.n + dy), w: b.w - dx, e: b.e + dx }
}

/**
 * Ausschnitt im Cache? -> neuer Cache (Treffer ans Ende, damit der zuletzt gezeigte Ausschnitt zuletzt herausfällt) bzw.
 * null, wenn kein abgesuchter Ausschnitt ihn ganz enthält.
 */
export function imCache<T>(cache: CacheEintrag<T>[], b: Box): CacheEintrag<T>[] | null {
  for (let i = cache.length - 1; i >= 0; i--) {
    if (enthaelt(cache[i].box, b)) return i === cache.length - 1 ? cache : [...cache.slice(0, i), ...cache.slice(i + 1), cache[i]]
  }
  return null
}

/** neuen Ausschnitt aufnehmen: darin ganz enthaltene alte fallen weg (überholt), dann höchstens max Einträge (die neusten) */
export function aufnehmen<T>(cache: CacheEintrag<T>[], neu: CacheEintrag<T>, max = CACHE_MAX): CacheEintrag<T>[] {
  return [...cache.filter(c => !enthaelt(neu.box, c.box)), neu].slice(-max)
}

/** Daten aller Ausschnitte, nach id ohne Doppel (der neuere Eintrag gilt, z. B. bei geänderten Tags) */
export function vereinigen<T extends { id: number }>(cache: CacheEintrag<T>[]): T[] {
  const m = new Map<number, T>()
  for (const c of cache) for (const x of c.daten) { m.delete(x.id); m.set(x.id, x) }
  return [...m.values()]
}
