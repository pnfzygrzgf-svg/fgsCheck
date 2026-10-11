// ── Streifen: Lage, Teilstreifen, Bordkanten, Wartebereiche, Annäherungsbereiche ──
//
// Im Berner Projekt kommen die Streifen aus dem Kataster (Achse p0 -> p1 über die Balken, Balkenlänge bw, Umriss). Die
// App bildet sie aus dem gewählten OSM-Übergang und der AV (streifenAusUebergang): Achse senkrecht zum gequerten OSM-Weg
// durch den Übergangsknoten, Enden an den AV-Bordkanten (RAND_ZUSCHLAG davor), Breite (Balkenlänge) 4 m als Annahme;
// liegt auf der Achse eine AV-Verkehrsinsel zwischen zwei Fahrbahnteilen, entstehen Teilstreifen (wie Inselteile im
// Kataster). Liegt ein Luftbild vor, erkennt rechner/luftbild.ts den Streifen dort (E3); dieser Weg bleibt der Rückfall.
// Danach wie in Python: zufahrten (Inselteile), raender, wartebereiche, annaeherungsbereich, ann_am_rand, streifen_h,
// rand_am_umriss.

import { type P, add, dist, dot, einheit, links, rechts, sub, median, lv95 } from '../geo'
import type { OsmNetz } from './netz'
import type { OsmWeg } from '../daten/osm'
import { osmBreite } from './fahrstreifen'
import { type Fahrbahn, type Flaechen, type Inseln, intervalleImPolygon } from './flaechen'
import { ringSchnitt, randSpur, H_RAND_TOL_M, STREIFEN_ENDE_M, ENTLANG_MIN, RAND_BELEG_MIN_M } from './spur'
import { type Poly, type Multi } from './poly'

export const RAND_ZUSCHLAG = 0.30
export const ANN_TIEFE = 1.0
export const RAND_SEHNE_TOL_M = 2.5
export const RAND_GEH_MIN_GRAD = 10.0
export const ENDE_NORMALE_MIN = 0.8
export const WARTE_SEHNE_M = 3.0
export const STREIFEN_BREITE_ANNAHME = 4.0     // Balkenlänge (Breite des Streifens entlang der Fahrbahn), Annahme E1
export const TEIL_LUECKE_MAX_M = 12.0          // Teilstreifen: Insel zwischen zwei Fahrbahnteilen höchstens so breit
const TEIL_MIN_M = 2.0                          // Fahrbahnteil mindestens so breit

export interface Streifen {
  fgsId: string; uebergangId: string; p0: P; p1: P; bw: number; quelle: string
  umriss: P[] | null; schraeg: number
  n: P; u: P; m: P; breite: number
  zufahrten: [P, P, string][]                  // (Fahrtrichtung, Spurmitte, Art beide | insel)
  rand: [P, P]; randQuelle: string
  warte: [P, P, P, number][]                   // (rand, aussen, richtung, breite) je Ende
  osmKnoten: number | null
  annahmen: string[]
}

export function neuerStreifen(fgsId: string, uebergangId: string, p0: P, p1: P, bw: number, quelle: string,
  umriss: P[] | null = null, schraeg = 0, osmKnoten: number | null = null): Streifen {
  return { fgsId, uebergangId, p0, p1, bw, quelle, umriss, schraeg, n: [0, 0], u: [0, 0], m: [0, 0], breite: 0, zufahrten: [],
    rand: [p0, p1], randQuelle: '', warte: [], osmKnoten, annahmen: [] }
}

/** zufahrten(S): je Teilstreifen die geraden Zufahrten (Richtung, Spurmitte, Art) */
export function zufahrtenStreifen(S: Streifen[]): void {
  const nachUeb = new Map<string, Streifen[]>()
  for (const s of S) {
    if (!nachUeb.has(s.uebergangId)) nachUeb.set(s.uebergangId, [])
    nachUeb.get(s.uebergangId)!.push(s)
  }
  for (const s of S) {
    const n = einheit(sub(s.p1, s.p0))
    const u: P = [-n[1], n[0]]
    s.n = n; s.u = u
    const m: P = [(s.p0[0] + s.p1[0]) / 2, (s.p0[1] + s.p1[1]) / 2]
    s.m = m
    s.breite = dist(s.p0, s.p1) + 2 * RAND_ZUSCHLAG
    const teile = nachUeb.get(s.uebergangId)!
    const z: [P, P, string][] = []
    if (teile.length > 1) {
      const ends = teile.flatMap(t => [t.p0, t.p1])
      const ks = ends.map(p => dot(sub(p, m), n))
      const cOff = (Math.min(...ks) + Math.max(...ks)) / 2
      if (Math.abs(cOff) >= 1.0) {
        const r: P = cOff < 0 ? n : [-n[0], -n[1]]
        const d: P = [-r[1], r[0]]
        z.push([d, m, 'insel'])
      }
    }
    if (!z.length) for (const d of [u, [-u[0], -u[1]] as P]) z.push([d, add(m, rechts(d), s.breite / 4), 'beide'])
    s.zufahrten = z
  }
}

/** umriss_ring: Umriss bzw. Rechteck aus Achse und Balkenlänge */
export function umrissRing(s: Streifen): P[] {
  if (s.umriss) return s.umriss
  const n = einheit(sub(s.p1, s.p0)), u: P = [-n[1], n[0]], h = s.bw / 2
  return [add(s.p0, u, -h), add(s.p0, u, h), add(s.p1, u, h), add(s.p1, u, -h)]
}

export const streifenPoly = (s: Streifen): Multi => [[umrissRing(s)]]

/** raender: Bordkanten an den Enden aus der AV-Sehne entlang der Achse, sonst angenommen */
export function raender(s: Streifen, fahrbahn: Fahrbahn): [P, P, string] {
  const n = s.n, m = s.m
  const annahme: [P, P, string] = [add(s.p0, n, -RAND_ZUSCHLAG), add(s.p1, n, RAND_ZUSCHLAG), 'Annahme']
  const halb = dist(s.p0, s.p1) / 2
  const richtungen: [P, number][] = [[n, 1]]
  if (Math.abs(s.schraeg || 0) >= RAND_GEH_MIN_GRAD) {
    const g = einheit(add(n, [-n[1], n[0]], Math.tan(s.schraeg * Math.PI / 180)))
    richtungen.push([g, dot(g, n)])
  }
  for (const [r, cos] of richtungen) {
    const sh = fahrbahn.sehne(m, r)
    if (sh === null) continue
    const [vorne, hinten] = sh
    const ziel0 = [-halb / cos], ziel1 = [halb / cos]
    if (s.umriss) {
      const rs = ringSchnitt(s.umriss, m, r)
      if (rs) { ziel0.push(rs[0]); ziel1.push(rs[1]) }
    }
    if (Math.min(...ziel0.map(z => Math.abs(-hinten - z))) <= RAND_SEHNE_TOL_M &&
      Math.min(...ziel1.map(z => Math.abs(vorne - z))) <= RAND_SEHNE_TOL_M)
      return [add(m, r, -hinten), add(m, r, vorne), 'AV']
  }
  return annahme
}

/** rand_quer: Abstand der Bordkanten quer zur Fahrbahn */
export const randQuer = (s: Streifen, r0: P, r1: P) => Math.abs(dot(sub(r1, r0), s.n))

/** wartebereiche: Enden des Umrisses -> [(rand, aussen, richtung, breite)] (ohne Endbalken-Sonderfall) */
export function wartebereiche(s: Streifen, fahrbahn: Fahrbahn | null): [P, P, P, number][] {
  const ring = umrissRing(s), n = s.n
  const c: P = [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length]
  const us: P = [-n[1], n[0]]
  const out: [P, P, P, number][] = []
  for (const [k, sg] of [[0, -1], [1, 1]] as [number, number][]) {
    const kanten: [number, P, P, P, P, P][] = []
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length], laenge = dist(a, b)
      if (laenge < 1e-6) return
      const t: P = [(b[0] - a[0]) / laenge, (b[1] - a[1]) / laenge]
      const mitte: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      let nr = rechts(t)
      if (dot(sub(mitte, c), nr) < 0) nr = [-nr[0], -nr[1]]
      kanten.push([sg * dot(nr, n), a, b, mitte, t, nr])
    })
    const best = kanten.reduce((x, y) => (y[0] > x[0] ? y : x))
    const teil = kanten.filter(x => x === best || (x[0] >= ENDE_NORMALE_MIN && sg * dot(sub(x[3], c), n) > 0))
    const [, , , mitte, t, nr] = best
    const lagen = teil.flatMap(x => [x[1], x[2]]).map(p => dot(sub(p, mitte), t))
    const z = add(mitte, t, (Math.min(...lagen) + Math.max(...lagen)) / 2)
    const r_ = s.rand[k]
    let rand = add(r_, t, dot(sub(z, r_), t))
    if (fahrbahn !== null && s.randQuelle === 'AV' && Math.abs(dot(sub(z, s.m), us)) > H_RAND_TOL_M) {
      const sh = fahrbahn.sehne(z, n)
      const kante = sh === null ? null : add(z, n, k ? sh[0] : -sh[1])
      if (kante !== null && dist(kante, z) <= WARTE_SEHNE_M) rand = kante
    }
    out.push([rand, nr, t, Math.max(...lagen) - Math.min(...lagen)])
  }
  return out
}

/** insel_probe: 0,6 m hinter der Bordkante an der Endkante */
export function inselProbe(s: Streifen, k: number, r: P | null = null): P {
  if (s.warte.length) { const [rand, aussen] = s.warte[k]; return add(rand, aussen, 0.6) }
  return add(r!, s.n, k ? 0.6 : -0.6)
}

/** annaeherungsbereich: Trapez, Grundlinie am Rand, 1 m tief, 45° nach aussen */
export function annaeherungsbereich(rand: P, aussen: P, u: P, bw: number): Poly {
  const h = bw / 2
  return [[add(rand, u, -h), add(rand, u, h), add(add(rand, aussen, ANN_TIEFE), u, h + ANN_TIEFE),
    add(add(rand, aussen, ANN_TIEFE), u, -h - ANN_TIEFE)]]
}

const ANN_STRAHL_M = 0.25, ANN_RUECK_M = 1.5, ANN_VOR_M = 2.5, ANN_TREFFER_MIN = 0.6, ANN_RAND_MEDIAN_M = 2.0
export const ANN_RAND_ARTEN = ['Trottoir', 'Verkehrsinsel']
const ANN_SCHRAEG_MAX_GRAD = 30.0

/** ann_am_rand: Annäherungsbereich auf der AV-Bordkante -> [Polygon, Anteil] oder null */
export function annAmRand(w: [P, P, P, number], fahrbahn: Fahrbahn, flaechenRand: Flaechen): [Poly, number] | null {
  const [rand, aussen, t, breite] = w
  const nS = Math.max(2, Math.ceil(breite / ANN_STRAHL_M)) + 1
  const xs: number[] = []
  for (let i = 0; i < nS; i++) xs.push(-breite / 2 + breite * i / (nS - 1))
  const ex = breite / 2 + ANN_VOR_M + ANN_RUECK_M + 1.0
  const teile = fahrbahn.polys.filter(g => !(g.env[2] < rand[0] - ex || g.env[0] > rand[0] + ex || g.env[3] < rand[1] - ex ||
    g.env[1] > rand[1] + ex))
  if (!teile.length) return null
  const off: (number | null)[] = []
  const L = ANN_RUECK_M + ANN_VOR_M
  for (const x0 of xs) {
    const a_ = add(add(rand, t, x0), aussen, -ANN_RUECK_M)
    // Strahl a_ -> a_ + aussen·L gegen die lokale Fahrbahn (Vereinigung): Intervalle je Fläche, zusammengefasst
    const iv: [number, number][] = []
    for (const g of teile) for (const [lo, hi] of intervalleImPolygon(add(a_, aussen, L / 2), aussen, L / 2, g.poly))
      iv.push([lo + L / 2, hi + L / 2])
    iv.sort((p, q) => p[0] - q[0])
    const merged: [number, number][] = []
    for (const x of iv) {
      const m = merged[merged.length - 1]
      if (m && x[0] <= m[1] + 1e-9) m[1] = Math.max(m[1], x[1]); else merged.push([x[0], x[1]])
    }
    const ts = merged.map(x => x[1]).filter(v => v > 0.05 && v < L - 0.05)
    let ende: number | null = ts.length ? Math.min(...ts) : null
    if (ende !== null && !ANN_RAND_ARTEN.includes(flaechenRand.art(add(a_, aussen, ende + 0.3)) ?? '')) ende = null
    off.push(ende === null ? null : ende - ANN_RUECK_M)
  }
  const gueltig = off.filter((v): v is number => v !== null)
  const anteil = gueltig.length / off.length
  if (anteil < ANN_TREFFER_MIN || Math.abs(median(gueltig)) > ANN_RAND_MEDIAN_M) return null
  for (let i = 0; i < off.length; i++) {
    if (off[i] === null) {
      let vor: number | null = null, nach: number | null = null
      for (let j = i - 1; j >= 0; j--) if (off[j] !== null) { vor = off[j]; break }
      for (let j = i + 1; j < off.length; j++) if (off[j] !== null) { nach = off[j]; break }
      off[i] = nach === null ? vor : vor === null ? nach : (vor + nach) / 2
    }
  }
  const o = off as number[]
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, mo = o.reduce((a, b) => a + b, 0) / o.length
  const k = xs.reduce((s, x0, i) => s + (x0 - mx) * (o[i] - mo), 0) / xs.reduce((s, x0) => s + (x0 - mx) ** 2, 0)
  if (Math.atan(Math.abs(k)) * 180 / Math.PI > ANN_SCHRAEG_MAX_GRAD) return null
  const basis = xs.map((x0, i) => add(add(rand, t, x0), aussen, o[i]))
  const aussenPts = basis.map((p, i) => {
    const a_ = basis[Math.max(0, i - 2)], b_ = basis[Math.min(basis.length - 1, i + 2)]
    const tg = dist(a_, b_) > 1e-6 ? einheit(sub(b_, a_)) : t
    let nr = rechts(tg)
    if (dot(nr, aussen) < 0) nr = [-nr[0], -nr[1]]
    let q = add(p, nr, ANN_TIEFE)
    if (i === 0) q = add(q, tg, -ANN_TIEFE)
    else if (i === basis.length - 1) q = add(q, tg, ANN_TIEFE)
    return q
  })
  const ring = [...basis, ...aussenPts.reverse()]
  let fl = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) fl += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  if (Math.abs(fl / 2) < 0.5 * breite * ANN_TIEFE) return null
  return [[ring], anteil]
}

/** streifen_h: Beginn der Sichtweite, wo die Gerade der Fahrstreifenmitte den Umriss gegen die Fahrt verlässt */
export function streifenH(s: Streifen, d: P, quer: number): number {
  const ring = umrissRing(s), m = s.m, n = s.n
  const us: P = [-n[1], n[0]]
  const du = dot(d, us)
  if (Math.abs(du) < ENTLANG_MIN) return s.bw / 2
  const rd = rechts(d)
  let a = dot(rd, n) * quer - dot(d, n) * quer * dot(rd, us) / du
  const lagen = ring.map(p => dot(sub(p, m), n))
  const lo = Math.min(...lagen), hi = Math.max(...lagen)
  const rand = Math.min(STREIFEN_ENDE_M, (hi - lo) / 4)
  a = Math.min(Math.max(a, lo + rand), hi - rand)
  const q = add(m, n, a)
  let best: number | null = null
  ring.forEach((p, i) => {
    const r = ring[(i + 1) % ring.length], e = sub(r, p)
    const nenner = d[0] * e[1] - d[1] * e[0]
    if (Math.abs(nenner) < 1e-12) return
    const w = sub(q, p)
    const lam = (d[0] * w[1] - d[1] * w[0]) / nenner
    if (lam >= -1e-9 && lam <= 1 + 1e-9) {
      const x = add(p, e, lam)
      const h_ = -dot(sub(x, m), d)
      best = best === null ? h_ : Math.max(best, h_)
    }
  })
  return best === null ? s.bw / 2 : Math.max(best, 0)
}

/** rand_am_umriss -> [h, Quelle] (RAND_NIE_UNTER_HALB) */
export function randAmUmriss(s: Streifen, punkte: P[], abstP: number[], d: P, quer: number, hAlt: number): [number, string] {
  const ring = umrissRing(s)
  let h = randSpur(punkte, abstP, ring, Math.max(...ring.map(p => dist(s.m, p))) + 1.0)
  let quelle: string
  if (h !== null && h >= RAND_BELEG_MIN_M) quelle = 'schnitt'
  else {
    h = streifenH(s, d, quer)
    if (h > hAlt) quelle = 'streifen'
    else { h = hAlt; quelle = 'halb' }
  }
  return Math.abs(h - hAlt) < H_RAND_TOL_M && quelle !== 'halb' ? [hAlt, 'gleich'] : [h, quelle]
}

// ---------------------------------------------------------------- App: Streifen aus OSM-Übergang und AV
export interface UebergangWahl { nid: number; p: P; tags: Record<string, string> }

/** Gequerter befahrbarer Weg am Übergang und seine Richtung (Sehne ±10 m), auch für die Luftbild-Erkennung */
export function gequerterWeg(u: UebergangWahl, netz: OsmNetz): { best: { wid: number; k: number; q: P; ab: number }; dWeg: P;
  meldung: string | null } | null {
  // gequerter Weg: befahrbarer Weg am Knoten (fgs_netz._uebergang_weg: MFZ vor Bus), sonst nächstes Segment bis 5 m
  let best: { wid: number; k: number; q: P; ab: number } | null = null
  for (const [wid, i] of netz.an.get(u.nid) ?? []) {
    const w = netz.w(wid)
    if (!(w.mfz || w.bus)) continue
    const k = i < w.nds.length - 1 ? i : i - 1
    const kand = { wid, k, q: netz.p(u.nid), ab: w.mfz ? 0 : 1 }
    if (best === null || kand.ab < best.ab) best = kand
  }
  if (best === null) {
    for (const [wid, w] of netz.W) {
      if (!(w.mfz || w.bus)) continue
      for (let k = 0; k < w.nds.length - 1; k++) {
        const a = netz.p(w.nds[k]), b = netz.p(w.nds[k + 1]), v = sub(b, a), l2 = dot(v, v)
        if (l2 === 0) continue
        const t = Math.max(0, Math.min(1, dot(sub(u.p, a), v) / l2))
        const q = add(a, v, t), ab = dist(q, u.p)
        if (ab <= 5 && (best === null || ab < best.ab)) best = { wid, k, q, ab }
      }
    }
  }
  if (best === null) return null
  const gq = { wid: best.wid, k: best.k, q: best.q, lage: 0, winkel: 0, imStreifen: true, klasse: 'mfz' as const, stufe: 0,
    tang: einheit(sub(netz.p(netz.w(best.wid).nds[best.k + 1]), netz.p(netz.w(best.wid).nds[best.k]))), abMitte: 0,
    hinweise: [], stufeWege: [], uebergang: u.nid }
  return { best, dWeg: netz.richtung(gq, 1), meldung: best.ab > 0 && !(netz.an.get(u.nid) ?? []).some(([wid]) => wid === best!.wid) ?
    `Übergang liegt nicht auf einem befahrbaren OSM-Weg; Weg ${best.wid} ${best.ab.toFixed(1)} m daneben` : null }
}

/**
 * Teilstreifen eines OSM-Übergangs: Achse senkrecht zum gequerten befahrbaren Weg durch den Knoten; Fahrbahnteile auf der
 * Achse aus der AV (Strasse_Weg), Teilstreifen über Verkehrsinseln bis TEIL_LUECKE_MAX_M. -> Streifen oder Meldung.
 */
export function streifenAusUebergang(u: UebergangWahl, netz: OsmNetz, fahrbahn: Fahrbahn, inseln: Inseln,
  querungen: OsmWeg[] = []): { streifen: Streifen[]; meldungen: string[] } {
  const meldungen: string[] = []
  const gw = gequerterWeg(u, netz)
  if (gw === null) return { streifen: [], meldungen: ['Kein befahrbarer OSM-Weg am Übergang (bis 5 m).'] }
  const { best, dWeg } = gw
  if (gw.meldung) meldungen.push(gw.meldung)
  let n = links(dWeg)                                   // Achse quer über die Fahrbahn
  const c = u.p
  let achseText = `senkrecht zum OSM-Weg ${best.wid}`
  // Fussweg über die Fahrbahn am Knoten (footway=crossing): Gehrichtung als Achse (schräge Streifen), Länge der Querung
  let querAus: [number, number] | null = null
  const fw = querungen.filter(w => w.knoten.includes(u.nid))
  const fwq = fw.find(w => w.tags.footway === 'crossing') ?? fw[0]
  if (fwq) {
    const pts = fwq.geom.map(([la, lo]) => lv95(la, lo))
    const i = fwq.knoten.indexOf(u.nid)
    const lagen = [0]
    for (let k = 1; k < pts.length; k++) lagen.push(lagen[k - 1] + dist(pts[k - 1], pts[k]))
    const bei = (x: number): P => {
      x = Math.max(0, Math.min(lagen[lagen.length - 1], x))
      for (let k = 1; k < pts.length; k++) if (lagen[k] >= x && lagen[k] > lagen[k - 1])
        return add(pts[k - 1], sub(pts[k], pts[k - 1]), (x - lagen[k - 1]) / (lagen[k] - lagen[k - 1]))
      return pts[pts.length - 1]
    }
    const g = einheit(sub(bei(lagen[i] + 6), bei(lagen[i] - 6)))
    const w = Math.abs(dot(g, einheit(dWeg)))
    if (g[0] !== 0 || g[1] !== 0) {
      if (w <= Math.cos(45 * Math.PI / 180)) {
        n = dot(g, n) >= 0 ? g : [-g[0], -g[1]]
        achseText = `entlang des OSM-Fusswegs ${fwq.id}`
      }
      if (fwq.tags.footway === 'crossing') {
        const ls = pts.map(p => dot(sub(p, c), n))
        querAus = [Math.min(...ls), Math.max(...ls)]
      }
    }
  }
  // Fahrbahnteile (AV Strasse_Weg) und Inseln entlang der Achse, ±SUCHE m
  const SUCHE = 30
  const iv: [number, number][] = []
  for (const t of fahrbahn.polys) {
    if (t.env[2] < c[0] - SUCHE || t.env[0] > c[0] + SUCHE || t.env[3] < c[1] - SUCHE || t.env[1] > c[1] + SUCHE) continue
    iv.push(...intervalleImPolygon(c, n, SUCHE, t.poly))
  }
  iv.sort((a, b) => a[0] - b[0])
  const fb: [number, number][] = []
  for (const x of iv) {
    const m = fb[fb.length - 1]
    if (m && x[0] <= m[1] + 0.05) m[1] = Math.max(m[1], x[1]); else fb.push([x[0], x[1]])
  }
  if (!fb.length) return { streifen: [], meldungen: [...meldungen, 'Die Achse quer zum Weg trifft keine AV-Fahrbahn (Strasse_Weg).'] }
  const abst = ([a, b]: [number, number]) => (a <= 0 && b >= 0 ? 0 : Math.min(Math.abs(a), Math.abs(b)))
  let i0 = 0
  fb.forEach((x, i) => { if (abst(x) < abst(fb[i0])) i0 = i })
  if (abst(fb[i0]) > 3) meldungen.push(`Übergangsknoten ${abst(fb[i0]).toFixed(1)} m neben der AV-Fahrbahn`)
  const istInsel = (a: number, b: number) => {
    // Lücke zwischen zwei Fahrbahnteilen: überwiegend AV-Verkehrsinsel (Punkte alle 0,25 m)
    let n_ = 0, ja = 0
    for (let x = a + 0.125; x < b; x += 0.25) { n_++; if (inseln.enthaelt(add(c, n, x))) ja++ }
    return n_ > 0 && ja / n_ >= 0.5
  }
  let geklemmt = false
  if (querAus && fb[i0][1] - fb[i0][0] > querAus[1] - querAus[0] + 3) {
    // AV-Fahrbahn viel breiter als die Querung (Knotenbereich, Platz): Enden aus dem OSM-Fussweg
    const a = Math.max(fb[i0][0], querAus[0] - RAND_ZUSCHLAG), b = Math.min(fb[i0][1], querAus[1] + RAND_ZUSCHLAG)
    if (b - a >= TEIL_MIN_M) { fb[i0] = [a, b]; geklemmt = true }
  }
  // Teilstreifen über Verkehrsinseln; mit OSM-Fussweg (footway=crossing) nur, soweit er über die Insel weiterführt
  const reicht = (x: [number, number]) => querAus === null || (x[1] > querAus[0] + 1 && x[0] < querAus[1] - 1)
  let geschaetzt = false
  if (!geklemmt && fb[i0][1] - fb[i0][0] > 15) {
    // AV-Fahrbahn auf der Achse sehr lang (Platz, Knotenbereich) und kein OSM-Fussweg: Länge aus der Breite des OSM-Wegs
    // (width bzw. lanes × 3 m, sonst 7 m zweirichtig bzw. 3,5 m Einbahn), um den Knoten
    const w = netz.w(best.wid)
    const bEst = osmBreite(w.t)[0] ?? (w.ow ? 3.5 : 7.0)
    if (fb[i0][1] - fb[i0][0] > 2 * bEst + 6) {
      const a = Math.max(fb[i0][0], -bEst / 2 - 1), b = Math.min(fb[i0][1], bEst / 2 + 1)
      if (b - a >= TEIL_MIN_M) { fb[i0] = [a, b]; geschaetzt = true }
    }
  }
  const teile: [number, number][] = [fb[i0]]
  for (let i = i0 - 1; i >= 0; i--) {
    const g0 = fb[i][1], g1 = teile[0][0]
    if (g1 - g0 > TEIL_LUECKE_MAX_M || !istInsel(g0, g1) || fb[i][1] - fb[i][0] < TEIL_MIN_M || !reicht(fb[i])) break
    teile.unshift(fb[i])
  }
  for (let i = i0 + 1; i < fb.length; i++) {
    const g0 = teile[teile.length - 1][1], g1 = fb[i][0]
    if (g1 - g0 > TEIL_LUECKE_MAX_M || !istInsel(g0, g1) || fb[i][1] - fb[i][0] < TEIL_MIN_M || !reicht(fb[i])) break
    teile.push(fb[i])
  }
  const streifen: Streifen[] = []
  teile.forEach(([a, b], i) => {
    if (b - a < TEIL_MIN_M) return
    const p0 = add(c, n, a + RAND_ZUSCHLAG), p1 = add(c, n, b - RAND_ZUSCHLAG)
    const id = teile.length > 1 ? `${u.nid}-${i + 1}` : `${u.nid}`
    const s = neuerStreifen(id, `${u.nid}`, p0, p1, STREIFEN_BREITE_ANNAHME, 'osm_av', null, 0, u.nid)
    const mitteTeil = teile[i] === fb[i0]
    s.annahmen.push(`Streifenachse ${achseText}, Enden ` + (geklemmt && mitteTeil ?
      'aus dem OSM-Fussweg (footway=crossing; AV-Fahrbahn dort breiter)' : geschaetzt && mitteTeil ?
      'aus der Breite des OSM-Wegs geschätzt (AV-Fahrbahn dort sehr breit, kein OSM-Fussweg)' :
      `${RAND_ZUSCHLAG.toFixed(1).replace('.', ',')} m vor der AV-Bordkante`) +
      `; Breite ${STREIFEN_BREITE_ANNAHME.toFixed(1).replace('.', ',')} m angenommen`)
    if (teile.length > 1) s.annahmen.push(`Teilstreifen ${i + 1} von ${teile.length} (AV-Verkehrsinsel auf der Achse)`)
    streifen.push(s)
  })
  return { streifen, meldungen }
}
