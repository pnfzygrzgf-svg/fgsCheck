// ── Gerade Fahrtrichtungen am Teilstreifen (fgs_sicht_pruefen.zufahrten_bilden und Umgebung) ──
//
// Aus dem gequerten OSM-Weg: Einbahn (OSM), Richtungsfahrbahn (B2, Gegenfahrbahn-Test), Inselteil, einspurig neben
// Verkehrsinsel, Teilstreifen (TEILSTREIFEN_STREICHEN, LUECKE_ALS_INSEL, TRENNUNG_ERWEITERT) mit Gegenstück
// (teilstreifen_paare, Spiegelregel). Nicht übernommen: Velonetz-Regel B3/B4 (Berner Velonetz von Hand) und der Rückfall
// über Tempo-Achsen; ohne OSM-Weg gelten gerade Zufahrten senkrecht zum Streifen (Rückfall, Hinweis).

import { type P, add, dot, rechts, sub, neg, richtungGrad, dist, abstandStrecke, einheit } from '../geo'
import { type OsmNetz, type Gequert, kennungGerade } from './netz'
import type { Inseln } from './flaechen'
import { type Streifen, inselProbe, randQuer, umrissRing } from './streifen'
import { abstandMulti, differenz, enthaelt, konvexeHuelle, vereinigung, schnitt, abstandPunkt, type Multi } from './poly'

export const EINSPUR_MAX_M = 6.0
export const EINSPUR_RUECKFALL_MAX_M = 7.0
const TEILSTREIFEN_BREITE_M = 2.0
const TEIL_PARTNER_QUER_M = 10.0
const TEIL_PARTNER_LAENGS_M = 12.0
const TEIL_PARTNER_WINKEL = 35.0
const LUECKE_MAX_M = 4.0
const LUECKE_ACHSE_GRAD = 15.0
const LUECKE_ACHSE_HAND_GRAD = 25.0
const LUECKE_WEG_M = 1.5
const TRENNUNG_MAX_M = 12.0
const WEG_KNAPP_M = 2.0
const WEG_KNAPP_ANTEIL = 0.25
const WEG_KNAPP_BELEG = true
const BUS_ZUFAHRT = true

export interface Zufahrt {
  d: P; art: string; versatz: number; netzQuelle: string; g: Gequert | null; sd: number | null; name: string
  einbahnQuelle: string | null; gegenEinbahn: boolean; hinweise: string[]
  teil: boolean | null; teilPartner: [string, number] | null; spiegel: boolean; teilTrennung: string
}

export interface Entfallen {
  fgsId: string; art: string; richtung: number; zufahrt: string; grund: string; quelle: string; osmWeg: string; osmKnoten: string
  kennung: string
}

export function entfallen(fid: string, art: string, grad: number, zufahrt: string, grund: string, quelle = '',
  osmWeg: number | string | null = '', osmKnoten: number | string | null = '', kennung = ''): Entfallen {
  return { fgsId: fid, art, richtung: grad, zufahrt, grund, quelle: quelle || '', osmWeg: String(osmWeg ?? ''),
    osmKnoten: String(osmKnoten ?? ''), kennung }
}

/** einspur_behalten: Index der Richtung mit dem Trottoir rechts (Insel links) oder null */
export function einspurBehalten(s: Streifen, r0: P, r1: P, inseln: Inseln, richtungen: P[], maxM: number | null = null): number | null {
  if (randQuer(s, r0, r1) > (maxM ?? EINSPUR_MAX_M)) return null
  const insel0 = inseln.an(inselProbe(s, 0, r0)), insel1 = inseln.an(inselProbe(s, 1, r1))
  if (insel0 === insel1) return null
  const trottoir = insel0 ? r1 : r0
  const behalten = richtungen.map((d, k) => (dot(sub(trottoir, s.m), rechts(d)) > 0 ? k : -1)).filter(k => k >= 0)
  return behalten.length === 1 ? behalten[0] : null
}

// ---------------------------------------------------------------- Trennung zwischen Teilstreifen (LUECKE_ALS_INSEL)
export interface TrennungKontext {
  streifen: { fid: string; m: P; ax: P; umriss: Multi; L: number; hand: boolean }[]
  tram: P[][]
  osmInsel: P[]
  inseln: Inseln
}

/** weg_knapp */
function wegKnapp(s: Streifen, lage: number, laenge: number | null = null): number | null {
  const L = laenge ?? dist(s.p0, s.p1)
  const e = Math.max(0, Math.min(lage, L - lage))
  return e <= Math.min(WEG_KNAPP_M, WEG_KNAPP_ANTEIL * L) ? e : null
}

/** trennung_beleg: Tram, AV-Insel, OSM-Insel in der Lücke zwischen zwei Umrissen */
function trennungBeleg(tk: TrennungKontext, eigen: Multi, u: Multi): string[] {
  const beide = vereinigung(eigen, u)
  const huelle = konvexeHuelle(beide.flatMap(p => p[0]))
  const luecke = differenz([[huelle]], beide)
  if (!luecke.length) return []
  const out: string[] = []
  const trifft = (a: P, b: P) => {
    if (enthaelt(luecke, a) || enthaelt(luecke, b)) return true
    return abstandMulti([[[a, b, b]]], luecke) === 0
  }
  if (tk.tram.some(l => l.slice(1).some((b, k) => trifft(l[k], b)))) out.push('Tram')
  const box = luecke.flatMap(p => p[0])
  const c = box.reduce((s, p) => add(s, p, 1 / box.length), [0, 0] as P)
  if (tk.inseln.r.imUmkreis(c, 30).some(t => schnitt([t.poly], luecke).length > 0)) out.push('AV-Insel')
  if (tk.osmInsel.some(p => abstandPunkt(luecke, p) <= 1.0)) out.push('OSM-Insel')
  return out
}

/** luecke_gegen_weg -> [fgs_id, Lücke m, Beleg] oder null */
function lueckeGegenWeg(s: Streifen, g: Gequert, tk: TrennungKontext, knapp = false): [string, number, string[]] | null {
  const ax = einheit(sub(s.p1, s.p0))
  const eigen = tk.streifen.find(x => x.fid === s.fgsId)
  if (!eigen) return null
  const weit = TRENNUNG_MAX_M
  const such = 20 + weit - LUECKE_MAX_M
  const kand: [string, number, string[]][] = []
  for (const x of tk.streifen) {
    if (x.fid === s.fgsId || Math.abs(x.m[0] - s.m[0]) > such || Math.abs(x.m[1] - s.m[1]) > such) continue
    const hand = eigen.hand || x.hand
    if (Math.abs(dot(ax, x.ax)) < Math.cos((hand ? LUECKE_ACHSE_HAND_GRAD : LUECKE_ACHSE_GRAD) * Math.PI / 180)) continue
    const luecke = abstandMulti(eigen.umriss, x.umriss)
    if (luecke > weit) continue
    const v = sub(x.m, s.m)
    if (dot(sub(g.q, s.m), v) <= 0) continue
    if (abstandStrecke(g.q, s.m, x.m) > LUECKE_WEG_M) continue
    const lageT = dot(sub(g.q, x.m), x.ax) + x.L / 2
    if (lageT > 0 && lageT < x.L && wegKnapp(s, lageT, x.L) === null) continue
    const beleg = trennungBeleg(tk, eigen.umriss, x.umriss)
    if ((luecke > LUECKE_MAX_M || (knapp && WEG_KNAPP_BELEG)) && !beleg.length) continue
    kand.push([x.fid, luecke, beleg])
  }
  return kand.length ? kand.reduce((b, k) => (k[1] < b[1] ? k : b)) : null
}

/** teilstreifen_weg -> [Vektor Streifenmitte -> Weg, streng, Text] oder null */
function teilstreifenWeg(s: Streifen, g: Gequert, inseln: Inseln, r0: P, r1: P, tk: TrennungKontext): [P, boolean, string] | null {
  let knapp: number | null = null, lu: [string, number, string[]] | null = null
  if (g.imStreifen) {
    knapp = wegKnapp(s, g.lage)
    lu = knapp !== null ? lueckeGegenWeg(s, g, tk, true) : null
    if (lu === null) return null
  } else if (inseln.an(g.lage < 0 ? inselProbe(s, 0, r0) : inselProbe(s, 1, r1))) {
    lu = null
  } else {
    lu = lueckeGegenWeg(s, g, tk)
    if (lu === null) return null
  }
  let text = ''
  if (lu !== null && (knapp !== null || lu[1] > LUECKE_MAX_M)) {
    text = (knapp !== null ? `OSM Weg ${g.wid} ${knapp.toFixed(1)} m im Streifen vor dem Ende gegen Nr. ${lu[0]}` :
      `OSM Weg ${g.wid} in der Lücke zu Nr. ${lu[0]}`) + ` (Lücke ${lu[1].toFixed(1)} m` + (lu[2].length ? `, ${lu[2].join(', ')})` : ')')
  }
  const streng = s.randQuelle === 'AV' && randQuer(s, r0, r1) <= dist(s.p0, s.p1) + TEILSTREIFEN_BREITE_M
  return [sub(g.q, s.m), streng, text]
}

export function trennungKontext(S: Streifen[], netz: OsmNetz | null, inseln: Inseln): TrennungKontext {
  return {
    streifen: S.map(s => ({ fid: s.fgsId, m: s.m, ax: einheit(sub(s.p1, s.p0)), umriss: [[umrissRing(s)]] as Multi,
      L: dist(s.p0, s.p1), hand: s.quelle === 'hand' })),
    tram: netz ? netz.tram : [],
    osmInsel: netz ? [...netz.U.values()].filter(u => u.t['crossing:island'] === 'yes').map(u => u.p) : [],
    inseln,
  }
}

/** rueckfall_zufahrten (ohne Velonetz/Einbahn-Datei: Richtungen senkrecht zum Streifen, Einspur-Regel) */
function rueckfallZufahrten(s: Streifen, inseln: Inseln, r0: P, r1: P): [Zufahrt[], Entfallen[]] {
  const fid = s.fgsId, entf: Entfallen[] = []
  let z = [...s.zufahrten]
  if (z.length === 2 && z[0][2] === 'beide') {
    const k = einspurBehalten(s, r0, r1, inseln, z.map(x => x[0]), EINSPUR_RUECKFALL_MAX_M)
    if (k !== null) {
      const g_ = richtungGrad(z[1 - k][0])
      entf.push(entfallen(fid, 'gerade', g_, String(g_), 'einspurig', 'Verkehrsinsel an einem Ende', '', '', `s${fid}:${g_}`))
      z = [[z[k][0], s.m, 'insel']]
    }
  }
  const out: Zufahrt[] = z.map(([d, spurmitte, art]) => ({ d, art, versatz: dot(sub(spurmitte, s.m), rechts(d)),
    netzQuelle: 'rueckfall', g: null, sd: null, name: '', einbahnQuelle: null, gegenEinbahn: false, hinweise: ['ohne_osm'],
    teil: null, teilPartner: null, spiegel: false, teilTrennung: '' }))
  return [out, entf]
}

/** zufahrten_bilden -> [Zufahrten nach Richtung, Entfallen]; setzt s.netzQuelle/osmWeg/strasse */
export function zufahrtenBilden(s: Streifen & { netzQuelle?: string; strasse?: string }, netz: OsmNetz | null, inseln: Inseln,
  r0: P, r1: P, tk: TrennungKontext): [Zufahrt[], Entfallen[]] {
  const fid = s.fgsId
  const insel = s.zufahrten.filter(z => z[2] === 'insel')
  const dInsel = insel.length ? insel[0][0] : null
  const [gl, quelle] = netz ? netz.zuordnen(s.p0, s.p1, dInsel, BUS_ZUFAHRT, s.bw) : [[], 'rueckfall'] as [Gequert[], string]
  s.netzQuelle = quelle
  s.strasse = ''
  if (!gl.length) {
    const [zfs, entf] = rueckfallZufahrten(s, inseln, r0, r1)
    return [zfs.sort((a, b) => richtungGrad(a.d) - richtungGrad(b.d)), entf]
  }
  const entf: Entfallen[] = [], kand: { g: Gequert; sd: number; d: P; quelle: string | null; gegen: boolean; hinweise: string[]; b4: boolean }[] = []
  const bRegel = dInsel === null
  for (const g of gl) {
    const ow = netz!.w(g.wid).ow, osm = `OSM Weg ${g.wid}`
    let b2 = false
    if (ow) b2 = bRegel && netz!.gegenfahrbahn(g.wid, netz!.richtung(g, ow), s.p0, s.p1)
    for (const sd of [1, -1]) {
      const d = netz!.richtung(g, sd)
      const grad = richtungGrad(d)
      const k = { g, sd, d, quelle: null as string | null, gegen: false, hinweise: [...g.hinweise], b4: false }
      const wegDamit = (grund: string, q: string) =>
        entf.push(entfallen(fid, 'gerade', grad, String(grad), grund, q, g.wid, '', kennungGerade(g, sd)))
      if (ow) {
        if (sd !== ow) { wegDamit(b2 ? 'richtungsfahrbahn' : 'einbahn_osm', osm); continue }
        k.quelle = b2 ? `${osm}: Richtungsfahrbahn` : osm
        if (b2) k.hinweise.push('richtungsfahrbahn')
      }
      if (dInsel !== null && dot(d, dInsel) <= 0) {
        if (!ow) { wegDamit('insel', 'Inselteil (Insel rechts der Fahrt)'); continue }
        if (!g.imStreifen) { wegDamit('insel_einbahn', `${osm} nur in der Verlängerung, gegen die Inselregel`); continue }
        k.hinweise.push('insel_einbahn')
      }
      kand.push(k)
    }
  }
  let einspur = false
  let kd = kand
  if (dInsel === null && kd.length === 2 && kd[0].g === kd[1].g && !netz!.w(kd[0].g.wid).ow) {
    const k_ = einspurBehalten(s, r0, r1, inseln, kd.map(k => k.d))
    if (k_ !== null) {
      const x = kd[1 - k_]
      const g_ = richtungGrad(x.d)
      entf.push(entfallen(fid, 'gerade', g_, String(g_), 'einspurig', 'Verkehrsinsel an einem Ende', x.g.wid, '',
        kennungGerade(x.g, x.sd)))
      kd = [kd[k_]]; einspur = true
    }
  } else if (dInsel === null && kd.length === 1 && netz!.w(kd[0].g.wid).ow && !kd[0].gegen) {
    if (einspurBehalten(s, r0, r1, inseln, [kd[0].d, neg(kd[0].d)]) === 1) kd[0].hinweise.push('insel_einbahn')
  }
  const zfs: Zufahrt[] = []
  for (const k of kd) {
    const g = k.g, d = k.d, w = netz!.w(g.wid)
    let art: string
    if (dInsel !== null || einspur) art = 'insel'
    else if (kd.length === 1 && gl.length === 1 && (w.ow || k.b4)) art = 'einbahn'
    else art = 'beide'
    const versatz = art === 'insel' ? 0 : s.breite * Math.abs(dot(s.n, rechts(d))) / 4
    let teil: boolean | null = null, trennung = ''
    if (art === 'beide' && !w.ow) {
      const vt = teilstreifenWeg(s, g, inseln, r0, r1, tk)
      if (vt !== null && dot(vt[0], rechts(d)) > 0) {
        teil = vt[1]; trennung = vt[2]
        if (teil) k.hinweise.push('teilstreifen')
      }
    }
    zfs.push({ d, art, versatz, netzQuelle: quelle, g, sd: k.sd, name: w.name, einbahnQuelle: k.quelle, gegenEinbahn: k.gegen,
      hinweise: [...new Set(k.hinweise)], teil, teilPartner: null, spiegel: false, teilTrennung: trennung })
  }
  s.strasse = netz!.w(gl[0].wid).name
  return [zfs.sort((a, b) => richtungGrad(a.d) - richtungGrad(b.d)), entf]
}

/** teilstreifen_paare: Gegenstück je Phantomrichtung, Spiegelregel -> Anzahl ohne Insel */
export function teilstreifenPaare(S: Streifen[], zfVon: Map<string, Zufahrt[]>, inseln: Inseln): number {
  const mitte = new Map(S.map(s => [s.fgsId, s.m]))
  const teilstreifen = new Set([...zfVon].filter(([, zfs]) => zfs.some(z => z.teil !== null)).map(([fid]) => fid))
  const cosMax = Math.cos(TEIL_PARTNER_WINKEL * Math.PI / 180)
  for (const [fid, zfs] of zfVon) {
    for (const zf of zfs) {
      if (zf.teil === null) continue
      const q = zf.g!.q, rd = rechts(zf.d)
      let best: [number, string, number] | null = null
      for (const [fidT, m] of mitte) {
        if (fidT === fid || Math.abs(m[0] - q[0]) > 25 || Math.abs(m[1] - q[1]) > 25) continue
        const v = sub(m, q), quer = dot(v, rd), laengs = Math.abs(dot(v, zf.d))
        if (!(quer > 0 && quer <= TEIL_PARTNER_QUER_M && laengs <= TEIL_PARTNER_LAENGS_M)) continue
        for (const z2 of zfVon.get(fidT) ?? []) {
          if (z2.teil !== null || dot(z2.d, zf.d) < cosMax) continue
          if (!zf.teil && z2.art !== 'insel' && !teilstreifen.has(fidT)) continue
          if (best === null || Math.hypot(quer, laengs) < best[0]) best = [Math.hypot(quer, laengs), fidT, richtungGrad(z2.d)]
        }
      }
      if (best !== null) zf.teilPartner = [best[1], best[2]]
    }
  }
  const sid = new Map(S.map(s => [s.fgsId, s]))
  const ohneInsel = new Set<string>()
  for (const [fid, zfs] of zfVon) {
    for (const zf of zfs) {
      if (zf.teilPartner === null || zf.spiegel) continue
      const pFid = zf.teilPartner[0], pZfs = zfVon.get(pFid) ?? []
      if (teilstreifen.has(pFid) || pZfs.some(z2 => z2.art === 'insel')) continue
      const b = sid.get(pFid)!, mA = sid.get(fid)!.m
      const gegenA = dot(sub(mA, b.m), b.n) > 0
      if (!inseln.an(gegenA ? inselProbe(b, 1, b.rand[1]) : inselProbe(b, 0, b.rand[0]))) { ohneInsel.add(pFid); continue }
      const bleibt = new Map<string, number>()
      for (const z of zfs) if (z.g !== null && z.g.wid === zf.g!.wid && z.teilPartner === null) bleibt.set(kennungGerade(z.g, z.sd!), richtungGrad(z.d))
      for (const z2 of pZfs) {
        if (z2.g !== null && z2.teilPartner === null && z2.art === 'beide' && bleibt.has(kennungGerade(z2.g, z2.sd!))) {
          z2.teilPartner = [fid, bleibt.get(kennungGerade(z2.g, z2.sd!))!]
          z2.spiegel = true
        }
      }
    }
  }
  return ohneInsel.size
}
