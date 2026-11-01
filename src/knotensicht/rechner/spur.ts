// ── Spuren und Sichtpunkte (Portierung der Spur-Helfer aus fgs_sicht_pruefen.py) ──
//
// punkte_auf_spur, ref_auf, glaetten, versetzen, projektion, uebergang, am_rand_halten (mit rand_luecken), auf_fahrbahn,
// Rand am Umriss (rand_am_umriss, rand_waehlen, umsetzen), Kreisfit, Kehre/Gegendrehung. Nicht übernommen in
// am_rand_halten: Trottoirnase vor Parkfeldern (nase, braucht Parkfelder) und Haltestellen-Buchten (halt, braucht das
// Berner Kataster); beide Zweige sind ohne diese Daten auch in Python wirkungslos.

import { type P, add, dist, dot, einheit, rechts, median, sub, kreuz, imPolygon } from '../geo'
import { verlaengern, abschneiden, streckeLaenge } from './netz'
import type { Fahrbahn } from './flaechen'
import type { ParkRaster } from './hindernisse'

export const SCHRITT = 2.0
export const VERSATZ_RUECK_M = 10.0
export const QUER_ZWEI_MAX = 6.0
export const SEHNE_MIN_PUNKTE = 3
export const RAND_AUSREISSER_M = 0.5
export const RAND_FENSTER_M = 14.0
export const FAHRSTREIFEN_MAX = 3.50
export const FEST_SPRUNG_M = 0.5
export const ABST_UEBERGANG_M = 6.0
const NASE_MIN_M = 0.5
const NASE_MAX_M = 30.0
const RAND_TOL_NASE = 1.0
const PARK_SONDE_M = 0.95

type RefPunkt = [P, P]                                   // (punkt, rechts)

/** punkte_auf_spur: Punkt und Rückwärts-Tangente bei gegebenen Abständen entlang einer Polylinie */
export function punkteAufSpur(weg: P[], abstaende: number[]): [P, P][] {
  const out: [P, P][] = []
  const kum = [0]
  for (let k = 1; k < weg.length; k++) kum.push(kum[k - 1] + dist(weg[k - 1], weg[k]))
  for (const s of abstaende) {
    for (let k = 0; k < weg.length - 1; k++) {
      if (kum[k + 1] >= s && kum[k + 1] > kum[k]) {
        const t = (s - kum[k]) / (kum[k + 1] - kum[k])
        const a = weg[k], b = weg[k + 1]
        out.push([add(a, sub(b, a), t), einheit(sub(b, a))])
        break
      }
    }
  }
  return out
}

/** ref_auf: Punkte entlang der Spur, quer m nach rechts (zur Fahrt) versetzt: [(punkt, rechts)] */
export function refAuf(spur: P[], abstaende: number[], quer: number): RefPunkt[] {
  return punkteAufSpur(spur, abstaende).map(([p, t]) => {
    const r = rechts([-t[0], -t[1]])
    return [add(p, r, quer), r]
  })
}

/** punkt_auf: Punkt s Meter entlang der Spur (bzw. ihr Ende) */
export function punktAuf(spur: P[], s: number): P {
  const p = punkteAufSpur(spur, [s])
  return p.length ? p[0][0] : spur[spur.length - 1]
}

/** abstand_spur */
export function abstandSpur(p: P, spur: P[]): number {
  let best = Infinity
  for (let k = 0; k < spur.length - 1; k++) {
    const a = spur[k], v = sub(spur[k + 1], a), l2 = dot(v, v)
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), v) / l2))
    best = Math.min(best, dist(p, add(a, v, t)))
  }
  return best
}

/** naechster_auf_spur -> [abstand, lage, punkt, richtung] */
export function naechsterAufSpur(p: P, spur: P[]): [number, number, P, P] | null {
  let best: [number, number, P, P] | null = null, acc = 0
  for (let k = 0; k < spur.length - 1; k++) {
    const a = spur[k], v = sub(spur[k + 1], a), l = Math.hypot(v[0], v[1])
    if (l > 0) {
      const t = Math.max(0, Math.min(1, dot(sub(p, a), v) / (l * l)))
      const q = add(a, v, t)
      if (best === null || dist(p, q) < best[0]) best = [dist(p, q), acc + t * l, q, [v[0] / l, v[1] / l]]
    }
    acc += l
  }
  return best
}

/** projektion -> [lage, seitlich (rechts zur Fahrt positiv)] oder null */
export function projektion(spur: P[], p: P, schaetz: number | null = null, fenster = 15.0): [number, number] | null {
  let best: [number, number, P, P] | null = null, acc = 0
  for (let k = 0; k < spur.length - 1; k++) {
    const a = spur[k], v = sub(spur[k + 1], a), l = Math.hypot(v[0], v[1])
    if (l > 0 && (schaetz === null || (acc <= schaetz + fenster && acc + l >= schaetz - fenster))) {
      const t = Math.max(0, Math.min(1, dot(sub(p, a), v) / (l * l)))
      const q = add(a, v, t)
      if (best === null || dist(p, q) < best[0]) best = [dist(p, q), acc + t * l, q, [v[0] / l, v[1] / l]]
    }
    acc += l
  }
  if (best === null) return null
  const [, s, q, u] = best
  return [s, dot(sub(p, q), rechts([-u[0], -u[1]]))]
}

/** uebergang: Punkte bei lagen, seitlich lat_strasse, zum Bogenende hin über ABST_UEBERGANG_M angeglichen */
export function uebergang(spur: P[], lagen: number[], latStrasse: number, latEnde: number, lEnde: number): P[] {
  return refAuf(spur, lagen, 0).map(([q, r], k) =>
    add(q, r, latEnde + (latStrasse - latEnde) * Math.min(1, Math.abs(lagen[k] - lEnde) / ABST_UEBERGANG_M)))
}

/** versetzen: Spur um v verschieben; mit ab geht die Verschiebung danach über lang m auf 0 zurück */
export function versetzen(weg: P[], v: P, ab: number | null = null, lang = VERSATZ_RUECK_M): P[] {
  if (ab === null) return weg.map(p => add(p, v))
  const pts: P[] = [weg[0]], lagen = [0]
  let acc = 0
  for (let k = 0; k < weg.length - 1; k++) {
    const a = weg[k], b = weg[k + 1], l = dist(a, b)
    if (l > 0) {
      for (let x = Math.ceil(Math.max(acc, ab)); x <= Math.floor(Math.min(acc + l, ab + lang)); x++) {
        if (acc < x && x < acc + l) { pts.push(add(a, sub(b, a), (x - acc) / l)); lagen.push(x) }
      }
    }
    acc += l
    pts.push(b); lagen.push(acc)
  }
  return pts.map((p, k) => add(p, v, lagen[k] <= ab ? 1 : Math.max(0, 1 - (lagen[k] - ab) / lang)))
}

/** glaetten: Polylinie im 1-m-Raster neu abtasten und über ±fenster mitteln (Anfang fest) */
export function glaetten(weg: P[], fenster: number): P[] {
  const laenge = streckeLaenge(weg)
  if (laenge < 2 * fenster) return weg
  const lang = verlaengern(weg, laenge + 2 * fenster + 2)
  const ab: number[] = []
  for (let k = 0; k <= Math.floor(streckeLaenge(lang)); k++) ab.push(k)
  const pts = punkteAufSpur(lang, ab).map(x => x[0])
  const n = pts.length, w = Math.floor(fenster)
  const out: P[] = [pts[0]]
  for (let k = 1; k < n; k++) {
    const a = Math.max(0, k - w)
    let b = Math.min(n, k + w + 1)
    if (k - a < w) b = Math.min(n, k + (k - a) + 1)
    let sx = 0, sy = 0
    for (let i = a; i < b; i++) { sx += pts[i][0]; sy += pts[i][1] }
    out.push([sx / (b - a), sy / (b - a)])
  }
  return abschneiden(out, laenge)
}

/** richtung_am_knoten: Fahrtrichtung vom Knoten (dj entlang der Spur) zum Streifen, Sehne 10 m */
export function richtungAmKnoten(wegA: P[], dj: number): P {
  const pk = punkteAufSpur(wegA, [dj, Math.max(0, dj - 10)])
  if (pk.length === 2 && dist(pk[0][0], pk[1][0]) >= 0.5) return einheit(sub(pk[1][0], pk[0][0]))
  const t = pk.length ? pk[0][1] : einheit(sub(wegA[wegA.length - 1], wegA[wegA.length - 2]))
  return [-t[0], -t[1]]
}

/** quer_zweirichtig (Spiegelfall zu versetzen) -> [referenzspur, x | null] */
export function querZweirichtig(fahrbahn: Fahrbahn, ref: RefPunkt[], abst: number[], ab: number, lage: number, vomRand: number,
  lang = VERSATZ_RUECK_M): [RefPunkt[], number | null] {
  const werte: number[] = []
  ref.forEach(([q, r], k) => {
    if (abst[k] >= ab + lang / 2) {
      const sh = fahrbahn.sehne(q, r)
      if (sh) werte.push(sh[0] - vomRand - lage)
    }
  })
  if (werte.length < SEHNE_MIN_PUNKTE) return [ref, null]
  const x = Math.min(median(werte), QUER_ZWEI_MAX)
  if (x < 0.5) return [ref, null]
  return [ref.map(([q, r], k) => [add(q, r, x * Math.min(1, Math.max(0, (abst[k] - ab + lang / 2) / lang))), r] as RefPunkt), x]
}

/** rand_luecken -> [lagen, n_muendung, n_luecke] */
export function randLuecken(lat0: (number | null)[], rand0: (number | null)[] | null, grenze0: (number | null)[] | null,
  frei: ((k: number, v: number) => boolean) | null, fenster = Math.round(RAND_FENSTER_M / SCHRITT), aussen = RAND_AUSREISSER_M,
  fest: Map<number, number> | null = null, hart0: Set<number> | null = null): [number[], number, number] {
  const rand = rand0 ?? lat0
  const grenze = grenze0 ? [...grenze0] : lat0.map(() => null as number | null)
  const out = [...lat0]
  let k = 1
  while (k < out.length) {
    if (out[k] === null) { k++; continue }
    let j = k
    while (j < out.length && out[j] !== null) j++
    if (j - k < SEHNE_MIN_PUNKTE && !(k === 1 && out[0] !== null && j - k + 1 >= SEHNE_MIN_PUNKTE))
      for (let i = k; i < j; i++) out[i] = null
    k = j
  }
  const gueltig: [number, number][] = []
  out.forEach((v, i) => { if (v !== null && rand[i] !== null) gueltig.push([i, rand[i]!]) })
  let nMuendung = 0
  const hart = new Set(hart0 ?? [])
  for (const [i, v] of gueltig) {
    if (i === 0) continue
    const nb = gueltig.filter(([j]) => Math.abs(j - i) <= fenster).map(([, w]) => w)
    if (v - median(nb) > aussen) {
      grenze[i] = grenze[i] === null ? out[i] : Math.min(grenze[i]!, out[i]!)
      hart.add(i)
      out[i] = null
      nMuendung++
    }
  }
  for (const [i, v] of fest ?? []) { out[i] = v; grenze[i] = null }
  const nLuecke = out.filter(v => v === null).length
  const stuetz = new Map<number, number>()
  out.forEach((v, i) => { if (v !== null) stuetz.set(i, v) })
  const res = out.map(v => v ?? 0)
  while (stuetz.size) {
    const ks = [...stuetz.keys()].sort((a, b) => a - b)
    for (let j = 0; j < res.length; j++) res[j] = j < ks[0] ? stuetz.get(ks[0])! : stuetz.get(ks[ks.length - 1])!
    for (let x = 0; x < ks.length - 1; x++) {
      const i0 = ks[x], i1 = ks[x + 1]
      for (let j = i0; j < i1; j++) res[j] = stuetz.get(i0)! + (stuetz.get(i1)! - stuetz.get(i0)!) * (j - i0) / (i1 - i0)
    }
    const zuWeit: number[] = []
    grenze.forEach((g, i) => {
      if (g !== null && !stuetz.has(i) && res[i] > g && (hart.has(i) || frei === null || !frei(i, res[i]))) zuWeit.push(i)
    })
    if (!zuWeit.length) break
    for (const i of zuWeit) stuetz.set(i, grenze[i]!)
  }
  return [res, nMuendung, nLuecke]
}

/** auf_fahrbahn: p neben der Fahrbahn auf der Querlinie Richtung Referenzlinie hinein */
export function aufFahrbahn(fahrbahn: Fahrbahn, p: P, q: P, r: P, innen = 1.0): P {
  if (fahrbahn.enthaelt(p)) return p
  const lat = dot(sub(p, q), r)
  const n = Math.min(40, Math.ceil(Math.abs(lat) / 0.25))
  for (let k = 1; k <= n; k++) {
    const t = lat ? lat - Math.sign(lat) * 0.25 * k : 0
    const c = add(q, r, t)
    if (fahrbahn.enthaelt(c)) {
      const c2 = add(q, r, t - (lat >= 0 ? innen : -innen))
      return fahrbahn.enthaelt(c2) ? c2 : c
    }
  }
  return p
}

/** auf_fahrbahn_naechst: zum nächsten Fahrbahnpunkt (16 Richtungen, 0,25-m-Schritte) und innen m hinein */
export function aufFahrbahnNaechst(fahrbahn: { enthaelt(p: P): boolean }, p: P, innen = 1.0, weit = 10.0): P {
  if (fahrbahn.enthaelt(p)) return p
  const richtungen: P[] = []
  for (let k = 0; k < 16; k++) richtungen.push([Math.cos(k * Math.PI / 8), Math.sin(k * Math.PI / 8)])
  for (let k = 1; k <= Math.floor(weit / 0.25); k++) {
    for (const v of richtungen) {
      const c = add(p, v, 0.25 * k)
      if (fahrbahn.enthaelt(c)) {
        const c2 = add(c, v, innen)
        return fahrbahn.enthaelt(c2) ? c2 : c
      }
    }
  }
  return p
}

export interface RandInfo { verschoben?: boolean[]; muendung?: number; luecke?: number; fest?: number; ohneAv?: boolean }

/**
 * am_rand_halten: Sichtpunkte entlang ref; seitliche Lage = rechter Fahrbahnrand − vom_rand, wenn der Querschnitt
 * brauchbar ist, sonst interpoliert (rand_luecken); gleitender Median über 5 Punkte; Punkte neben der Fahrbahn zurück auf
 * sie. Vereinfacht gegenüber Python: ohne nase (Parkfelder) und halt (Haltestellen-Kataster).
 */
export function amRandHalten(fahrbahn: Fahrbahn, ref: RefPunkt[], lage: number, vomRand: number | number[], maxSprung = 3.0,
  info: RandInfo | null = null, osm = true, basis: RefPunkt[] | null = null, fest: Map<number, number | null> = new Map(),
  nase: [ParkRaster, number] | null = null): [P[], number] {
  const lat: (number | null)[] = [], rand: (number | null)[] = [], grenze: (number | null)[] = [], raenderK: (number | null)[] = []
  ref.forEach(([q, r], k) => {
    if (fest.has(k)) { lat.push(null); rand.push(null); grenze.push(null); raenderK.push(null); return }
    const sh = fahrbahn.sehne(q, r)
    const vr = Array.isArray(vomRand) ? vomRand[k] : vomRand
    const neu = sh ? sh[0] - vr : null
    const ok = neu !== null && Math.abs(neu - lage) <= maxSprung
    lat.push(ok ? neu : null)
    raenderK.push(ok ? sh![0] : null)
    const [qb, rb] = basis !== null ? basis[k] : [q, r]
    rand.push(ok ? sh![0] + dot(sub(q, qb), rb) : null)
    grenze.push(sh && sh[0] >= 0 && sh[1] >= 0 ? sh[0] - Math.min(vr, FAHRSTREIFEN_MAX / 2) : null)
  })
  if (lat.length) lat[0] = lage
  // Trottoirnase vor einem Parkstreifen (NASE_MIN_M): Querschnitte ohne Parkfeld am Rand, deren Rand mindestens NASE_MIN_M
  // innerhalb der beparkten Querschnitte davor und danach liegt, tragen nicht; Grenze vom_rand − Abzug an der Nase
  const naseK = new Set<number>(), grenzeNase = new Map<number, number>()
  if (nase && nase[1] > 0 && lat.length && !Array.isArray(vomRand)) {
    const [park, abzug] = nase
    const halb = vomRand - abzug
    const nMax = Math.round(NASE_MAX_M / SCHRITT)
    const beparkt = new Map<number, number>([[0, lage + vomRand]])
    for (let k = 1; k < lat.length; k++)
      if (raenderK[k] !== null && park.trifft(add(ref[k][0], ref[k][1], raenderK[k]! - PARK_SONDE_M))) beparkt.set(k, raenderK[k]!)
    const folge = [...Array.from({ length: lat.length - 1 }, (_, i) => i + 1), 0]
    for (const k of folge) {
      const e = raenderK[k]
      if (e === null || (beparkt.has(k) && k > 0) || (k === 0 && !naseK.has(1))) continue
      const vorK = [...beparkt.keys()].filter(j => k - nMax <= j && j < k)
      const vor = vorK.length ? Math.max(...vorK) : (k === 0 ? 0 : null)
      const nachK = [...beparkt.keys()].filter(j => k < j && j <= k + nMax)
      const nach = nachK.length ? Math.min(...nachK) : null
      if (vor !== null && nach !== null && NASE_MIN_M <= beparkt.get(vor)! - e && beparkt.get(vor)! - e <= abzug + RAND_TOL_NASE &&
        beparkt.get(nach)! - e >= NASE_MIN_M) {
        grenzeNase.set(k, e - halb)
        if (k === 0) lat[0] = Math.min(lat[0]!, grenzeNase.get(0)!)
        else { naseK.add(k); lat[k] = null; grenze[k] = grenzeNase.get(k)! }
      }
    }
  }
  const freiF = (k: number, v: number) => fahrbahn.enthaelt(add(ref[k][0], ref[k][1], v))
  const festV = new Map<number, number>()
  for (const [k, v] of fest) if (v !== null) festV.set(k, v)
  const [lat2, nMuendung, nLuecke] = randLuecken(lat, rand, grenze, freiF, undefined, undefined, festV, naseK)
  const latF = [...lat2]
  if (info) { info.muendung = nMuendung; info.luecke = nLuecke; info.fest = fest.size }
  if (fest.size) {
    const nUe = Math.max(1, Math.round(VERSATZ_RUECK_M / SCHRITT)), roh = [...latF]
    const festSprung = (i: number) => fest.has(i) && fest.has(i - 1) && Math.abs(roh[i] - roh[i - 1]) > FEST_SPRUNG_M
    for (let k = 1; k < latF.length; k++) {
      if (fest.has(k) === fest.has(k - 1) && !festSprung(k)) continue
      const basisV = latF[k - 1]
      for (let j = 0; j < nUe; j++) {
        const i = k + j
        if (i >= latF.length || fest.has(i) !== fest.has(k)) break
        latF[i] = basisV + (roh[i] - basisV) * (j + 1) / (nUe + 1)
      }
    }
  }
  const out: P[] = [], rohe: P[] = []
  let nVersch = 0
  ref.forEach(([q, r], k) => {
    const fenster = latF.slice(Math.max(0, k - 2), k + 3).sort((a, b) => a - b)
    const roh = add(q, r, grenzeNase.has(k) ? Math.min(latF[k], grenzeNase.get(k)!) : fenster[Math.floor(fenster.length / 2)])
    const p = fest.has(k) ? roh : aufFahrbahnNaechst(fahrbahn, aufFahrbahn(fahrbahn, roh, q, r))
    if (p[0] !== roh[0] || p[1] !== roh[1]) nVersch++
    out.push(p); rohe.push(roh)
  })
  const freiK = out.map((_, k) => k).filter(k => !fest.has(k))
  if (osm && nVersch && freiK.length && freiK[0] === 0 && !fahrbahn.enthaelt(rohe[0]) &&
    2 * freiK.filter(k => !fahrbahn.enthaelt(out[k])).length >= freiK.length) {
    if (info) { info.ohneAv = true; info.verschoben = rohe.map(() => false) }
    return [rohe, 0]
  }
  if (info) info.verschoben = out.map((p, k) => p[0] !== rohe[k][0] || p[1] !== rohe[k][1])
  return [out, nVersch]
}

// ---------------------------------------------------------------- Kreisfit, Kehre (fgs_sicht_pruefen.py)
/** kreis_anpassen: Kreis durch Punkte (Kåsa) -> [mitte, radius] oder null */
export function kreisAnpassen(pts: P[]): [P, number] | null {
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n
  const u = pts.map(p => p[0] - mx), v = pts.map(p => p[1] - my)
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0
  for (let i = 0; i < n; i++) {
    suu += u[i] * u[i]; svv += v[i] * v[i]; suv += u[i] * v[i]
    suuu += u[i] ** 3; svvv += v[i] ** 3; suvv += u[i] * v[i] * v[i]; svuu += v[i] * u[i] * u[i]
  }
  const det = suu * svv - suv * suv
  if (Math.abs(det) < 1e-9) return null
  const rhs1 = (suuu + suvv) / 2, rhs2 = (svvv + svuu) / 2
  const uc = (rhs1 * svv - rhs2 * suv) / det, vc = (suu * rhs2 - suv * rhs1) / det
  return [[uc + mx, vc + my], Math.sqrt(uc * uc + vc * vc + (suu + svv) / n)]
}

/** kreis_residuum */
export function kreisResiduum(k: [P, number], pts: P[]): number {
  return Math.max(...pts.map(p => Math.abs(dist(p, k[0]) - k[1])))
}

/** kehre: grösster Richtungswechsel (°) */
export function kehre(pts: P[], minL = 0.5): number {
  const seg: [P, P][] = []
  for (let k = 0; k < pts.length - 1; k++) if (dist(pts[k], pts[k + 1]) > minL) seg.push([pts[k], pts[k + 1]])
  let best = 0
  for (let k = 0; k < seg.length - 1; k++) {
    const v1 = einheit(sub(seg[k][1], seg[k][0])), v2 = einheit(sub(seg[k + 1][1], seg[k + 1][0]))
    best = Math.max(best, Math.acos(Math.max(-1, Math.min(1, dot(v1, v2)))) * 180 / Math.PI)
  }
  return best
}

const wrap = (x: number) => ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI

/** gegendrehung (°) */
export function gegendrehung(pts: P[], minL = 0.5): number {
  const hs: number[] = []
  for (let k = 0; k < pts.length - 1; k++)
    if (dist(pts[k], pts[k + 1]) > minL) hs.push(Math.atan2(pts[k + 1][1] - pts[k][1], pts[k + 1][0] - pts[k][0]))
  const dreh = hs.slice(1).map((h1, k) => wrap(h1 - hs[k]))
  const sgn = dreh.reduce((s, x) => s + x, 0) >= 0 ? 1 : -1
  let best = 0, kum = 0, spitze = 0
  for (const x of dreh) { kum += sgn * x; spitze = Math.max(spitze, kum); best = Math.max(best, spitze - kum) }
  return best * 180 / Math.PI
}

/** kante_drehung (°, + links) */
export function kanteDrehung(pts: P[]): number {
  const hs: number[] = []
  for (let k = 0; k < pts.length - 1; k++)
    if (dist(pts[k], pts[k + 1]) > 1e-6) hs.push(Math.atan2(pts[k + 1][1] - pts[k][1], pts[k + 1][0] - pts[k][0]))
  let s = 0
  for (let k = 1; k < hs.length; k++) s += wrap(hs[k] - hs[k - 1])
  return s * 180 / Math.PI
}

/** stetig_drehend: längste Teilfolge mit stetig zunehmendem Winkel um mitte */
export function stetigDrehend(pts: P[], mitte: P, w0: number, sgn: number, bis: number, tol: number): P[] {
  const us = pts.map(p => {
    const u = wrap(sgn * (Math.atan2(p[1] - mitte[1], p[0] - mitte[0]) - w0))
    return u >= -tol && u <= bis + tol ? u : null
  })
  const enden: number[] = [], endenI: number[] = [], vor: (number | null)[] = pts.map(() => null)
  us.forEach((u, i) => {
    if (u === null) return
    let lo = 0, hi = enden.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (enden[m] < u) lo = m + 1; else hi = m }
    vor[i] = lo ? endenI[lo - 1] : null
    if (lo === enden.length) { enden.push(u); endenI.push(i) } else { enden[lo] = u; endenI[lo] = i }
  })
  const out: P[] = []
  let i: number | null = endenI.length ? endenI[endenI.length - 1] : null
  while (i !== null) { out.push(pts[i]); i = vor[i] }
  return out.reverse()
}

// ---------------------------------------------------------------- Umriss und Beginn der Sichtpunkte (Auftrag 2)
export const STREIFEN_ENDE_M = 0.25
export const ENTLANG_MIN = 0.2
export const H_RAND_TOL_M = 0.05
export const RASTER_MIN_M = 0.5
export const RASTER_VOR_M = 20.0
export const RAND_SUCH_M = 0.1
export const RAND_BELEG_MIN_M = 0.05
export const RAND_IM_UMRISS_M = 0.5

/** abstand_ring: Abstand von p zum Polygon (0 = innen) */
export function abstandRing(p: P, ring: P[]): number {
  if (imPolygon(p, [ring])) return 0
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], v = sub(ring[(i - 1 + ring.length) % ring.length], a), l2 = dot(v, v)
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), v) / l2))
    best = Math.min(best, dist(p, add(a, v, t)))
  }
  return best
}

/** tiefe_im_ring */
export function tiefeImRing(p: P, ring: P[]): number {
  if (abstandRing(p, ring) > 0) return 0
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], v = sub(ring[(i - 1 + ring.length) % ring.length], a), l2 = dot(v, v)
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), v) / l2))
    best = Math.min(best, dist(p, add(a, v, t)))
  }
  return best
}

/** ring_schnitt: Gerade p + t·r durch den (konvexen) Umriss -> [kleinstes, grösstes t] */
export function ringSchnitt(ring: P[], p: P, r: P): [number, number] | null {
  const ts: number[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], e = sub(b, a)
    const nenner = r[0] * e[1] - r[1] * e[0]
    if (Math.abs(nenner) < 1e-12) continue
    const w = sub(a, p)
    const mu = (w[0] * r[1] - w[1] * r[0]) / nenner
    if (mu >= -1e-9 && mu <= 1 + 1e-9) ts.push((w[0] * e[1] - w[1] * e[0]) / nenner)
  }
  return ts.length ? [Math.min(...ts), Math.max(...ts)] : null
}

/** umsetzen: Sichtpunkte ab dem Rand am Umriss -> [punkte, abstände] */
export function umsetzen(punkte: P[], abstP: number[], h: number, gesamt: number, spur: ((a: number) => P | null) | null = null):
  [P[], number[]] {
  const paare: [number, P][] = []
  punkte.forEach((p, k) => { if (!paare.length || abstP[k] > paare[paare.length - 1][0] + 1e-9) paare.push([abstP[k], p]) })
  if (paare.length < 2) return [[...punkte], [...abstP]]
  const bei = (a: number): P => {
    if (spur !== null && !(paare[0][0] <= a && a <= paare[paare.length - 1][0])) {
      const q = spur(a)
      if (q !== null) return q
    }
    let i = 0
    while (i < paare.length - 2 && paare[i + 1][0] < a) i++
    const [a0, p0] = paare[i], [a1, p1] = paare[i + 1]
    const t = (a - a0) / (a1 - a0)
    return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]
  }
  const neu: [number, P][] = [[h, bei(h)], ...paare.filter(([a]) => h + RASTER_MIN_M <= a && a <= gesamt - RASTER_MIN_M),
    [gesamt, bei(gesamt)]]
  return [neu.map(x => x[1]), neu.map(x => x[0])]
}

/** endpunkte_mangel (ohne Parkfelder) */
export function endpunkteMangel(alt: [P, P], neu: [P, P], auf: (p: P) => boolean, park: ParkRaster | null = null): [string, string][] {
  const out: [string, string][] = []
  const paare: [string, P, P][] = [['erster', alt[0], neu[0]], ['letzter', alt[1], neu[1]]]
  for (const [name, a, b] of paare) {
    if (a[0] === b[0] && a[1] === b[1]) continue
    if (auf(a) && !auf(b)) out.push(['fahrbahn', `${name} Sichtpunkt neben der Fahrbahn`])
    if (park && !park.trifft(a, 0.05) && park.trifft(b, 0.05)) out.push(['parkfeld', `${name} Sichtpunkt im Auto-Parkfeld`])
  }
  return out
}

/** rand_waehlen -> [h, Mangel | null] */
export function randWaehlen(hRand: number, hAlt: number, punkte: P[], abstP: number[], swBei: (h: number) => number,
  spur: ((a: number) => P | null) | null, auf: (p: P) => boolean, ring: P[], park: ParkRaster | null = null): [number, string | null] {
  const alt: [P, P] = [punkte[0], punkte[punkte.length - 1]]
  const dAlt = abstandRing(alt[0], ring)
  const vz = hAlt > hRand ? 1 : -1
  let grund: string | null = null
  for (let k = 0; ; k++) {
    const h = hRand + vz * RAND_SUCH_M * k
    if ((hAlt - h) * vz < H_RAND_TOL_M) return [hAlt, grund]
    const [neu] = umsetzen(punkte, abstP, h, swBei(h) + h, spur)
    const arten = new Set(endpunkteMangel(alt, [neu[0], neu[neu.length - 1]], auf, park).map(x => x[0]))
    const mangel = arten.has('fahrbahn') ? 'fahrbahn' : arten.size ? 'parkfeld' :
      abstandRing(neu[0], ring) > dAlt + H_RAND_TOL_M ? 'umriss' :
        vz > 0 && tiefeImRing(neu[0], ring) > RAND_IM_UMRISS_M ? 'im_umriss' : null
    if (mangel === null) return [h, grund]
    grund = grund ?? mangel
  }
}

/** rand_spur: grösster Abstand a ≤ bis_m, an dem die Linie der Sichtpunkte den Umriss kreuzt */
export function randSpur(punkte: P[], abstP: number[], ring: P[], bisM: number): number | null {
  const paare: [number, P][] = []
  punkte.forEach((p, k) => { if (!paare.length || abstP[k] > paare[paare.length - 1][0] + 1e-9) paare.push([abstP[k], p]) })
  if (paare.length < 2) return null
  const [a0, p0] = paare[0], [a1, p1] = paare[1]
  const t = (-RASTER_VOR_M - a0) / (a1 - a0)
  paare.unshift([-RASTER_VOR_M, [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]])
  let best: number | null = null
  for (let k = 0; k < paare.length - 1; k++) {
    const [aa, pa] = paare[k], [ab, pb] = paare[k + 1]
    if (aa > bisM) break
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i], d = ring[(i + 1) % ring.length]
      const r = sub(pb, pa), s = sub(d, c), den = kreuz(r, s)
      if (Math.abs(den) < 1e-12) continue
      const q = sub(c, pa), tt = kreuz(q, s) / den, u = kreuz(q, r) / den
      if (tt >= 0 && tt <= 1 && u >= 0 && u <= 1 && aa + (ab - aa) * tt <= bisM)
        best = Math.max(best ?? -Infinity, aa + (ab - aa) * tt)
    }
  }
  return best
}

// ---------------------------------------------------------------- Abstand zu Parkfeldern (PARK_ABSTAND, abstand_halten)
export const PARK_ABSTAND_M = 1.5
const PARK_SUCH_M = 4.0
const PARK_UEBERGANG_M = 6.0
const LINKS_DER_MITTE_TOL = 0.5
const ZWEISPURIG_MIN_M = 5.0
const SEHNE_HALB_A = 22.0

export interface ParkInfo { n: number; max: number; vor: number; nach: number; eng: number; im: number }

/**
 * abstand_halten: Sichtpunkte näher als PARK_ABSTAND_M an einem Parkfeld (alle Klassen) rücken quer zur Fahrlinie so wenig wie
 * nötig weg (höchstens PARK_SUCH_M, auf der Fahrbahn, nicht über eine Parkreihe), sonst an die Stelle mit dem grössten Abstand;
 * Nachbarpunkte folgen über PARK_UEBERGANG_M. Ohne Velostreifen-Band (Kataster in Bern). -> [punkte, info | null]
 */
export function abstandHalten(punkte: P[], auf: (p: P) => boolean, parkAlle: ParkRaster, fahrbahn: Fahrbahn | null = null,
  fest: Set<number> = new Set(), zweirichtig = false): [P[], ParkInfo | null] {
  const n = punkte.length
  if (n === 0 || parkAlle.leer) return [[...punkte], null]
  const such = PARK_ABSTAND_M + PARK_SUCH_M
  const acc = [0]
  for (let k = 1; k < n; k++) acc.push(acc[k - 1] + dist(punkte[k - 1], punkte[k]))
  const quer: P[] = [], ziel: number[] = new Array(n).fill(0), d0s: number[] = [], kappe: number[] = new Array(n).fill(Infinity)
  const mess: ((x: number) => number)[] = []
  for (let k = 0; k < n; k++) {
    const p = punkte[k]
    const a = punkte[Math.max(0, k - 1)], b = punkte[Math.min(n - 1, k + 1)]
    const t: P = sub(b, a)
    const r: P = Math.hypot(t[0], t[1]) > 1e-9 ? rechts(einheit(t)) : (quer.length ? quer[quer.length - 1] : [1, 0])
    quer.push(r)
    const felder = parkAlle.kandidaten(p, such)
    const abst = (x: number) => felder.length ? parkAlle.abstand(add(p, r, x), felder) : Infinity
    mess.push(abst)
    if (zweirichtig && fahrbahn) {
      const sh = fahrbahn.sehne(p, r)
      if (sh && Math.max(...sh) < SEHNE_HALB_A - 0.5 && sh[0] + sh[1] >= ZWEISPURIG_MIN_M)
        kappe[k] = Math.max(0, (sh[0] - sh[1]) / 2 + LINKS_DER_MITTE_TOL)
    }
    const d0 = abst(0)
    d0s.push(d0)
    if (fest.has(k) || d0 >= PARK_ABSTAND_M - 1e-6) continue
    const nS = Math.round(PARK_SUCH_M / 0.1)
    const erreichbar: [number, number][] = []
    for (const vz of [1, -1]) {
      let drin = d0 <= 0
      for (let i = 1; i <= nS; i++) {
        const x = vz * 0.1 * i
        if (!auf(add(p, r, x))) break
        const d = abst(x)
        if (d <= 0 && !drin) break
        drin = drin && d <= 0
        erreichbar.push([x, d])
      }
    }
    let best: [number, number] | null = null
    for (const mitKappe of [true, false]) {
      const kand = erreichbar.filter(([x]) => !mitKappe || x <= kappe[k])
      const gut = kand.filter(([, d]) => d >= PARK_ABSTAND_M)
      best = null
      if (gut.length) best = gut.reduce((b_, xd) => (Math.abs(xd[0]) < Math.abs(b_[0]) || (Math.abs(xd[0]) === Math.abs(b_[0]) && xd[1] > b_[1]) ? xd : b_))
      else if (kand.length) {
        const b_ = kand.reduce((m, xd) => (xd[1] > m[1] || (xd[1] === m[1] && Math.abs(xd[0]) < Math.abs(m[0])) ? xd : m))
        best = b_[1] > d0 + 0.05 ? b_ : null
      }
      if (best !== null && (best[1] > 0 || d0 > 0)) break
    }
    if (best !== null) ziel[k] = best[0]
  }
  const minD0 = Math.min(...d0s)
  if (!ziel.some(x => x)) {
    return [[...punkte], minD0 >= PARK_ABSTAND_M ? null : { n: 0, max: 0, vor: minD0, nach: minD0,
      eng: d0s.filter(d => d < PARK_ABSTAND_M).length, im: d0s.filter(d => d <= 0).length }]
  }
  const out: P[] = [], d1s: number[] = []
  let nV = 0, xMax = 0
  for (let k = 0; k < n; k++) {
    const p = punkte[k]
    let x = 0
    if (!fest.has(k)) {
      for (let j = 0; j < n; j++) {
        if (!ziel[j]) continue
        const w = j === k ? 1 : Math.max(0, 1 - Math.abs(acc[k] - acc[j]) / PARK_UEBERGANG_M)
        if (Math.abs(ziel[j] * w) > Math.abs(x)) x = ziel[j] * w
      }
    }
    if (x !== ziel[k]) {
      const grenze = Math.min(PARK_ABSTAND_M, mess[k](ziel[k]))
      const kand = !ziel[k] ? [x, x * 0.5] : [x]
      x = kand.find(x_ => x_ <= kappe[k] && auf(add(p, quer[k], x_)) && mess[k](x_) >= grenze - 1e-6) ?? ziel[k]
    }
    out.push(x ? add(p, quer[k], x) : p)
    if (x) nV++
    xMax = Math.max(xMax, Math.abs(x))
    d1s.push(mess[k](x))
  }
  return [out, { n: nV, max: xMax, vor: minD0, nach: Math.min(...d1s), eng: d1s.filter(d => d < PARK_ABSTAND_M - 1e-6).length,
    im: d1s.filter(d => d <= 0).length }]
}
