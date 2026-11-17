// ── Messen an der amtlichen Vermessung: Bordsteinkanten, Breiten ab Kante, Einrasten auf AV-Punkte (gemeinsam seit 17.11.2026) ──
//
// Herkunft: fgsCheck bordkanten.ts (06.11.2026, nach VeloroutenCheck breitenmessung.ts) und fixpunkt.ts (16.10.2026). Hier liegt die
// Rechnung, damit das Messwerkzeug der Karte (messwerkzeug.ts) in allen Rechnern gleich misst; bordkanten.ts und fixpunkt.ts des fgsCheck
// geben sie weiter. Gerechnet wird in LV95 (Meter).
//
// Bordsteinkante: Kante einer AV-Fläche «Strasse_Weg», hinter der keine Strasse liegt. Die AV teilt eine Strasse in mehrere Flächen; deren
// gemeinsame Kanten sind keine Bordsteine und fallen weg (Prüfpunkt PRUEF_M auf der Aussenseite liegt in einer anderen Strassenfläche).
// Löcher einer Strassenfläche (Verkehrsinseln) zählen mit. Geprüft wird je Stück von höchstens STUECK_M: eine lange Kante, die nur auf
// einem Teil an eine andere Strassenfläche grenzt (Einmündung), fiele sonst ganz weg.
//
// Einrasten: Fangradius FANG_PX = 12 Bildschirmpunkte, nach dem Zoom in Meter umgerechnet (fangRadiusM), höchstens FANG_MAX_M = 5 m.
// Gebäudeecke: Stützpunkt einer AV-Fläche «Gebaeude», an dem der Umriss um mindestens ECKE_MIN_GRAD (20°) abknickt; Bögen sind in der AV
// mit vielen Stützpunkten und kleinen Knicken erfasst, ihre Punkte gelten als AV-Punkt. Andere Stützpunkte: AV-Punkt. AV-Stützpunkte
// sind keine vermarkten Grenzpunkte: die Bodenbedeckung hat eine Lagegenauigkeit je Qualitätsstufe der AV.

import { dist, dot, imPolygonSchnell, sub, type P } from './geometrie'

/** AV-Fläche in LV95, so viel braucht die Messung (die Rechner halten mehr) */
export interface MessAvFlaeche { art: string; ringe: P[][] }
export interface Kante { a: P; b: P }

const PRUEF_M = 0.3      // Prüfpunkt beidseits der Kante: liegt die Aussenseite wieder auf Strasse?
const STUECK_M = 2
export const FANG_M = 8  // weiter weg vom Klick liegt keine Bordsteinkante, die gemeint sein kann
export const FLAECHE_MAX_M = 25   // «Ganze Fläche»: höchstens so weit bis zur gegenüberliegenden Kante

export const FANG_PX = 12
export const FANG_MAX_M = 5
export const ECKE_MIN_GRAD = 20

type Box = [number, number, number, number]   // minE, minN, maxE, maxN
function box(ringe: P[][]): Box {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const r of ringe) for (const [e, n] of r) { a = Math.min(a, e); b = Math.min(b, n); c = Math.max(c, e); d = Math.max(d, n) }
  return [a, b, c, d]
}
const inBox = (p: P, x: Box) => p[0] >= x[0] && p[0] <= x[2] && p[1] >= x[1] && p[1] <= x[3]

/** Bordsteinkanten = Kanten der Strassenflächen, hinter denen keine Strasse liegt; aufeinanderfolgende Bord-Stücke zusammengefügt */
export function bordkanten(flaechen: readonly MessAvFlaeche[]): Kante[] {
  const strassen = flaechen.filter(f => f.art === 'Strasse_Weg' && f.ringe.length && f.ringe[0].length >= 3)
    .map(f => ({ f, box: box(f.ringe) }))
  const aus: Kante[] = []
  for (const s of strassen) {
    for (const r of s.f.ringe) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length]
        const de = b[0] - a[0], dn = b[1] - a[1], l = Math.hypot(de, dn)
        if (l < 0.05) continue
        const nx = -dn / l, ny = de / l
        const teile = Math.max(1, Math.ceil(l / STUECK_M))
        let start: P | null = null
        for (let k = 0; k < teile; k++) {
          const t0 = k / teile, t1 = (k + 1) / teile
          const p0: P = [a[0] + de * t0, a[1] + dn * t0], q1: P = [a[0] + de * t1, a[1] + dn * t1]
          const m: P = [(p0[0] + q1[0]) / 2, (p0[1] + q1[1]) / 2]
          const p1: P = [m[0] + PRUEF_M * nx, m[1] + PRUEF_M * ny], p2: P = [m[0] - PRUEF_M * nx, m[1] - PRUEF_M * ny]
          const aussen = imPolygonSchnell(p1, s.f.ringe) ? p2 : p1
          const innen = strassen.some(o => o !== s && inBox(aussen, o.box) && imPolygonSchnell(aussen, o.f.ringe))
          if (!innen) { if (!start) start = p0 }
          else if (start) { aus.push({ a: start, b: p0 }); start = null }
          if (k === teile - 1 && start) aus.push({ a: start, b: q1 })
        }
      }
    }
  }
  return aus
}

/** Nächster Punkt einer Strecke zu p */
function fusspunkt(p: P, k: Kante): { d: number; fuss: P } {
  const de = k.b[0] - k.a[0], dn = k.b[1] - k.a[1], l2 = de * de + dn * dn
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - k.a[0]) * de + (p[1] - k.a[1]) * dn) / l2))
  const fuss: P = [k.a[0] + t * de, k.a[1] + t * dn]
  return { d: Math.hypot(p[0] - fuss[0], p[1] - fuss[1]), fuss }
}

/** Punkt an eine Bordsteinkante fangen («Zwei Punkte»): ohne ersten Punkt die nächste Stelle der Kante; mit erstem Punkt (von) der
 *  Fusspunkt des Lots von ihm auf die Kante, wenn er im Fangradius liegt, damit die Messung rechtwinklig zur Kante steht.
 *  null, wenn keine Kante näher als radiusM ist. */
export function fangeAnKante(p: P, kanten: readonly Kante[], radiusM: number, von?: P): P | null {
  let best: P | null = null, bestD = radiusM
  for (const k of kanten) {
    const de = k.b[0] - k.a[0], dn = k.b[1] - k.a[1], ll = de * de + dn * dn
    if (ll < 1e-9) continue
    const auf = (q: P): { u: number; f: P } => {
      const u = ((q[0] - k.a[0]) * de + (q[1] - k.a[1]) * dn) / ll
      return { u, f: [k.a[0] + u * de, k.a[1] + u * dn] }
    }
    const naechst = auf(p), uk = Math.max(0, Math.min(1, naechst.u))
    let q: P = [k.a[0] + uk * de, k.a[1] + uk * dn]
    if (von) { const lot = auf(von); if (lot.u >= 0 && lot.u <= 1 && dist(lot.f, p) <= radiusM) q = lot.f }
    const d = dist(q, p)
    if (d <= bestD) { bestD = d; best = q }
  }
  return best
}

/** «Ab Bordsteinkante»: kürzester Abstand vom Klick (auf der Markierung) zur nächsten Bordsteinkante, höchstens maxM */
export function messeAbKante(klick: P, kanten: readonly Kante[], maxM = FANG_M): { breite: number; fuss: P } | null {
  let best: { d: number; fuss: P } | null = null
  for (const k of kanten) {
    const f = fusspunkt(klick, k)
    if (f.d <= maxM && (!best || f.d < best.d)) best = f
  }
  return best && { breite: best.d, fuss: best.fuss }
}

/** Abstand vom Punkt p entlang der Richtung d (Einheitsvektor) bis zur ersten Kante, oder Infinity */
function strahl(p: P, d: P, kanten: readonly Kante[], maxM: number): number {
  let best = Infinity
  for (const k of kanten) {
    const ex = k.b[0] - k.a[0], ey = k.b[1] - k.a[1]
    const nenner = d[0] * ey - d[1] * ex
    if (Math.abs(nenner) < 1e-12) continue
    const ax = k.a[0] - p[0], ay = k.a[1] - p[1]
    const t = (ax * ey - ay * ex) / nenner        // Abstand entlang d
    const u = (ax * d[1] - ay * d[0]) / nenner    // Lage auf der Kante (0…1)
    if (t > 0 && t <= maxM && u >= 0 && u <= 1 && t < best) best = t
  }
  return best
}

/** «Ganze Fläche»: Klick in die Fahrbahn; von der nächsten Kante rechtwinklig durch den Klick bis zur gegenüberliegenden Kante */
export function messeFlaeche(klick: P, kanten: readonly Kante[], maxM = FLAECHE_MAX_M): { breite: number; von: P; bis: P } | null {
  let best: { d: number; fuss: P } | null = null
  for (const k of kanten) {
    const f = fusspunkt(klick, k)
    if (f.d <= FANG_M && (!best || f.d < best.d)) best = f
  }
  if (!best || best.d < 0.01) return null
  const d: P = [(klick[0] - best.fuss[0]) / best.d, (klick[1] - best.fuss[1]) / best.d]
  const t = strahl(klick, d, kanten, maxM)
  if (!Number.isFinite(t)) return null
  return { breite: best.d + t, von: best.fuss, bis: [klick[0] + d[0] * t, klick[1] + d[1] * t] }
}

// ── Einrasten auf Stützpunkte der AV ──

/** Fangradius in Metern aus der Länge von FANG_PX Bildschirmpunkten in Metern (beim aktuellen Zoom), höchstens FANG_MAX_M */
export const fangRadiusM = (fangPxInM: number): number => Math.min(FANG_MAX_M, Math.max(0, fangPxInM))

export type AvFangArt = 'gebaeudeecke' | 'av_punkt' | 'frei'

/** Knick des Umrisses am Punkt i eines Rings (Grad, 0 = gerade weiter); der Ring darf geschlossen sein (erster = letzter) */
export function knickGrad(ring: P[], i: number): number {
  const r = ring.length > 1 && dist(ring[0], ring[ring.length - 1]) < 1e-9 ? ring.slice(0, -1) : ring
  const n = r.length
  if (n < 3) return 0
  const k = i % n
  // nächste verschiedene Nachbarn (doppelte Punkte überspringen)
  let a = (k - 1 + n) % n, b = (k + 1) % n
  while (a !== k && dist(r[a], r[k]) < 1e-6) a = (a - 1 + n) % n
  while (b !== k && dist(r[b], r[k]) < 1e-6) b = (b + 1) % n
  const v1 = sub(r[k], r[a]), v2 = sub(r[b], r[k])
  const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1])
  if (!(l1 > 0) || !(l2 > 0)) return 0
  return Math.acos(Math.max(-1, Math.min(1, dot(v1, v2) / (l1 * l2)))) * 180 / Math.PI
}

export interface AvPunkt { p: P; ecke: boolean; avArt: string }

/** Stützpunkte der AV-Flächen nahe bei p (Hüllquader ± radius); ecke: Gebäudeecke (Knick ab ECKE_MIN_GRAD) */
export function avPunkte(av: readonly MessAvFlaeche[], p: P, radius: number): AvPunkt[] {
  const aus: AvPunkt[] = []
  for (const f of av) for (const ring of f.ringe) {
    const n = ring.length > 1 && dist(ring[0], ring[ring.length - 1]) < 1e-9 ? ring.length - 1 : ring.length
    for (let i = 0; i < n; i++) {
      const q = ring[i]
      if (Math.abs(q[0] - p[0]) > radius || Math.abs(q[1] - p[1]) > radius) continue
      aus.push({ p: q, ecke: f.art === 'Gebaeude' && knickGrad(ring, i) >= ECKE_MIN_GRAD, avArt: f.art })
    }
  }
  return aus
}

/** Klick auf die Karte fangen: nächster AV-Stützpunkt im Radius; am selben Punkt (1 cm) zählt eine Gebäudeecke vor anderen
 * Flächen (ein Gebäudepunkt ist zugleich Punkt der Nachbarfläche). Ohne Treffer: freier Punkt am Klick. */
export function fangen(p: P, av: readonly MessAvFlaeche[], radiusM: number): { p: P; art: AvFangArt; avArt?: string } {
  const kand = avPunkte(av, p, radiusM).map(x => ({ ...x, d: dist(x.p, p) })).filter(x => x.d <= radiusM + 1e-9)
  if (!kand.length) return { p: [p[0], p[1]], art: 'frei' }
  const best = kand.reduce((a, b) => (b.d < a.d ? b : a))
  const gleich = kand.filter(x => dist(x.p, best.p) <= 0.01)
  const ecke = gleich.find(x => x.ecke)
  if (ecke) return { p: [ecke.p[0], ecke.p[1]], art: 'gebaeudeecke' }
  const geb = gleich.find(x => x.avArt === 'Gebaeude')
  return { p: [best.p[0], best.p[1]], art: 'av_punkt', avArt: (geb ?? best).avArt }
}

export type MessPunktArt = AvFangArt | 'bordkante'
export const MESSPUNKT_TEXT: Record<MessPunktArt, string> = { gebaeudeecke: 'Gebäudeecke', av_punkt: 'AV-Punkt', bordkante: 'Bordkante', frei: 'frei' }

/** Punkt für «Zwei Punkte» und die Linien: AV-Stützpunkt im Radius, sonst die nächste Bordsteinkante im selben Radius (mit vorigem Punkt
 *  rechtwinklig zu ihm), sonst frei */
export function messPunktFangen(p: P, av: readonly MessAvFlaeche[], kanten: readonly Kante[], radiusM: number, von?: P): { p: P; art: MessPunktArt } {
  const g = fangen(p, av, radiusM)
  if (g.art !== 'frei' || !kanten.length) return { p: g.p, art: g.art }
  const f = fangeAnKante(p, kanten, radiusM, von)
  return f ? { p: f, art: 'bordkante' } : { p: g.p, art: 'frei' }
}
