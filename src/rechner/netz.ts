// ── OSM-Strassennetz und Topologie am Fussgängerstreifen (Portierung von fgs_netz.py, Klasse OsmNetz) ──
//
// Gleiche Regeln wie im Berner Projekt (SPEC Abschnitte 2 und 3): Zuordnung Streifen -> gequerter Weg (Übergangsknoten,
// Schnitt mit der Achse ±3 m, ±6 m), Fahrtrichtung (Sehne ±10 m), Suche stromauf bis zum ersten Strassenknoten
// (Nebenarme, Gabeln), Knotenbereich (Durchblick, Kreisel-Ausfahrt), Fortsetzung (Name -> Klasse -> Winkel), Rollen der
// Arme, Abbiegeverbote, Spuren entlang des Netzes. Funktionsnamen in camelCase, Verweis auf die Python-Funktion je Methode.
// Winkel mathematisch: 0° = Ost, 90° = Nord, gegen den Uhrzeigersinn.
// Begriffe: Arm = [wid, i, sd] am Knoten nds[i] des Wegs wid, vom Knoten weg in Indexrichtung sd (±1).
// Nicht übernommen: Aufbereitung aus dem Dump, Diagnose (zeige) und Abnahme T1 (test).

import type { OsmDaten } from '../daten/osm'
import {
  type P, lv95, dist, dot, einheit, neg, kreuz, wdiff, drehung, segSchnitt,
} from '../geo'

// ---------------------------------------------------------------- Konstanten (fgs_netz.py)
export const MFZ_HW = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary',
  'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road'])
const NEBEN_SERVICE = new Set(['driveway', 'parking_aisle', 'drive-through', 'emergency_access', 'slipway'])
const FREIGABE = new Set(['yes', 'destination', 'designated', 'permissive'])
export const MAXSPEED_CH: Record<string, number> = { 'CH:urban': 50, 'CH:rural': 80, 'CH:trunk': 100, 'CH:motorway': 120 }
export const VERL_1 = 3.0
export const VERL_2 = 6.0
const WINKEL_VERL_2 = 30
export const WINKEL_MAX = 60
const SEHNE_D = 10.0
const SEHNE_MIN = 2.0
export const ARM_SEHNE = 10.0
export const FORTS_MAX = 45.0
const DURCHBLICK_M = 12.0
const DURCHBLICK_MAX = 30.0
export const GABEL_MAX = 60.0
const WENDEN_AB = 120.0
const WENDEN_OHNE_NAME = true
// Nutzerentscheid 13.10.2026 (Rückmeldung «nicht systematisch alle Sichtweiten»: ein Arm mit Drehung 25° wurde als «nebenast»
// weggelassen, obwohl sein Knoten innerhalb der Sichtweite liegt): ein
// Arm ab NEBENAST_GRAD Drehung ist eine Abbiegezufahrt mit allen Regeln, darunter «nebenast» (nur Hinweis). Bis 13.10.2026: 30
export const NEBENAST_GRAD = 10.0
// «Fast geradeaus» für die Fortsetzung (klasseVorName) und die turn:lanes an Gabeln (fahrstreifen.ts: left/right gegen
// slight_*/through) bleibt bei 30° (bis 13.10.2026 NEBENAST_GRAD): dort geht es um die Fahrtrichtung, nicht um die Sichtweite
export const FAST_GERADE_GRAD = 30.0
const ZU_STEIL_GRAD = 150.0
// Drehung in Rollen-Texten mit einer Nachkommastelle (13.10.2026), gerundet; erreicht die Rundung die Grenze, unter (unter)
// bzw. über (ueber) der die Drehung liegt, wird abgeschnitten bzw. aufgerundet (Nebenast 9,96° -> «9,9°» statt «10,0°»)
const grad1 = (x: number, unter: number | null = null, ueber: number | null = null): string => {
  let v = Math.round(x * 10) / 10
  if (unter !== null && v >= unter) v = Math.floor(x * 10) / 10
  if (ueber !== null && v <= ueber) v = Math.ceil(x * 10) / 10
  return `${v.toFixed(1).replace('.', ',')}°`
}
const MAX_SUCHE = 400.0
const KREISEL_RING_M = 12.0
const SERVICE_IST_KNOTEN = false
const BUS_AUSNAHME_PSV = true
const KLASSE_VOR_NAME = false
const UEBERGANG_ZUORDNUNG = true
export const UEBERGANG_M = 3.0
const HW_RANG: Record<string, number> = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, unclassified: 5,
  residential: 6, road: 6, living_street: 7, service: 8, pedestrian: 9, busway: 9 }
export const GEGENFAHRBAHN_M = 25.0
const GEGEN_COS = Math.cos(30 * Math.PI / 180)
const SPUR_WEITER_M = 5.0
export const RASTER = 25.0

// ---------------------------------------------------------------- Polylinien (fgs_netz.py)
export type Arm = [number, number, number]          // (wid, i, sd)
export const armGleich = (a: Arm | null | undefined, b: Arm | null | undefined): boolean =>
  !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
const armKey = (a: Arm) => `${a[0]},${a[1]},${a[2]}`

export function streckeLaenge(pl: P[]): number {
  let s = 0
  for (let k = 1; k < pl.length; k++) s += dist(pl[k - 1], pl[k])
  return s
}

/** fgs_netz.abschneiden: Polylinie bis zur Bogenlänge s (Endpunkt interpoliert). */
export function abschneiden(pl: P[], s: number): P[] {
  const out: P[] = [pl[0]]
  let acc = 0
  for (let k = 1; k < pl.length; k++) {
    const a = pl[k - 1], b = pl[k], l = dist(a, b)
    if (acc + l >= s) {
      const f = l ? (s - acc) / l : 0
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
      return out
    }
    acc += l
    out.push(b)
  }
  return out
}

/** fgs_netz.punkt_zurueck: Punkt s vor dem Ende der Polylinie (bzw. ihr Anfang). */
export function punktZurueck(pl: P[], s: number): P {
  let acc = 0
  for (let j = pl.length - 1; j > 0; j--) {
    const l = dist(pl[j], pl[j - 1])
    if (acc + l >= s && l > 0) {
      const f = (s - acc) / l
      return [pl[j][0] + (pl[j - 1][0] - pl[j][0]) * f, pl[j][1] + (pl[j - 1][1] - pl[j][1]) * f]
    }
    acc += l
  }
  return pl[0]
}

/** fgs_netz.end_richtung */
export function endRichtung(pl: P[], ersatz: P = [1, 0]): P {
  const z = punktZurueck(pl, 2.0)
  const v = einheit([pl[pl.length - 1][0] - z[0], pl[pl.length - 1][1] - z[1]])
  return v[0] === 0 && v[1] === 0 ? ersatz : v
}

/** fgs_netz.verlaengern: Polylinie gerade bis zur Länge L verlängern. */
export function verlaengern(pl: P[], L: number, ersatz: P = [1, 0]): P[] {
  const rest = L - streckeLaenge(pl)
  if (rest <= 0) return [...pl]
  const g = endRichtung(pl, ersatz), e = pl[pl.length - 1]
  return [...pl, [e[0] + g[0] * rest, e[1] + g[1] * rest]]
}

/** fgs_netz.streifen_abstand: Abstand von p zum Streifen als Rechteck p0 -> p1 × bw (0 = im Streifen). */
export function streifenAbstand(p: P, p0: P, p1: P, bw: number): number {
  const n = einheit([p1[0] - p0[0], p1[1] - p0[1]])
  const v: P = [p[0] - p0[0], p[1] - p0[1]]
  const a = dot(v, n), b = Math.abs(kreuz(n, v))
  return Math.hypot(Math.max(0, -a, a - dist(p0, p1)), Math.max(0, b - bw / 2))
}

// ---------------------------------------------------------------- Tags deuten (fgs_netz.py)
type Tags = Record<string, string>

/** fgs_netz.einbahn_tag: Einbahn für Motorfahrzeuge +1 / -1 / 0 */
export function einbahnTag(t: Tags): number {
  const ohne = t.junction === 'roundabout' || t.junction === 'circular' || t.highway === 'motorway' ? 1 : 0
  for (const k of ['oneway:motorcar', 'oneway:motor_vehicle', 'oneway:vehicle', 'oneway']) {
    const v = t[k]
    if (v) return ({ yes: 1, '1': 1, true: 1, '-1': -1, no: 0 } as Record<string, number>)[v] ?? ohne
  }
  return ohne
}

/** fgs_netz.zugang_tag: ja | privat | nein */
export function zugangTag(t: Tags): string {
  const wert = ['motorcar', 'motor_vehicle', 'vehicle', 'access'].map(k => t[k]).find(v => v)
  if (t.highway === 'pedestrian') {
    const mfz = ['motorcar', 'motor_vehicle', 'vehicle'].map(k => t[k]).find(v => v)
    if (!mfz || !FREIGABE.has(mfz)) return 'nein'
  }
  return wert === 'no' ? 'nein' : wert === 'private' ? 'privat' : 'ja'
}

function layerZahl(t: Tags): number {
  const n = parseInt(String(t.layer ?? '0').split(';')[0].trim(), 10)
  return Number.isFinite(n) ? n : 0
}

export interface Weg {
  nds: number[]; t: Tags; hw: string; name: string; sv: string; ow: number; zug: string
  mfz: boolean; bus: boolean; v2: boolean; strasse: boolean; ring: boolean; ebene: boolean; hoch: boolean
}

/** fgs_netz.weg_deuten (SPEC 2.1) */
export function wegDeuten(nds: number[], t: Tags): Weg {
  const hw = t.highway ?? ''
  const zug = zugangTag(t)
  const mfz = (MFZ_HW.has(hw) || hw === 'pedestrian') && zug !== 'nein'
  const bus = hw === 'busway' || (zug === 'nein' && (['yes', 'designated'].includes(t.bus ?? '') ||
    ['yes', 'designated'].includes(t.psv ?? '')))
  const v2 = mfz && !NEBEN_SERVICE.has(t.service ?? '') && zug !== 'privat'
  return {
    nds, t, hw, name: t.name ?? '', sv: t.service ?? '', ow: einbahnTag(t), zug, mfz, bus: bus && !mfz, v2,
    strasse: v2 && hw !== 'service', ring: t.junction === 'roundabout' || t.junction === 'circular',
    ebene: (t.bridge ?? 'no') === 'no' && (t.tunnel ?? 'no') === 'no' && (t.layer === undefined || t.layer === '' || t.layer === '0'),
    hoch: (t.tunnel ?? 'no') === 'no' && ((t.bridge ?? 'no') !== 'no' || layerZahl(t) > 0),
  }
}

// ---------------------------------------------------------------- Datenklassen (fgs_netz.py)
export interface Gequert {            // massgebender Weg am Teilstreifen (SPEC 2.2)
  wid: number; k: number; q: P; lage: number; winkel: number; imStreifen: boolean; klasse: 'mfz' | 'bus'
  stufe: number; tang: P; abMitte: number; hinweise: string[]; stufeWege: number[]; uebergang: number | null
}
export interface Nebenarm { dist: number; nid: number; arm: Arm }
export interface Suche {              // SPEC 3.2
  art: string; K: number | null; dist: number; pfad: P[]; wege: number[]; ankunft: Arm | null
  nebenarme: Nebenarm[]; gabeln: number[]; gabelWege: number[]; hinweise: string[]; endeGrund: string | null
  g: Gequert; sd: number; extra: Set<number>; eigSvc: boolean; ketteAn: Map<number, [Arm, number]>
}
export interface Mitglied {           // Knoten des Knotenbereichs
  nid: number; abK: number; erreichbar: boolean; kette: P[]; ankunft: Arm; art: string; ketteWege: number[]
  ketteVerbot: [string | null, boolean]
}
export interface ArmInfo {            // Arm am Knotenbereich bzw. Nebenarm (SPEC 3.3, 3.4)
  knoten: number; j: P; abK: number; arm: Arm; wid: number; name: string; hw: string; svc: string; ring: boolean
  ow: number; aus: P; fahrt: P; abw: number; dreh: number; zufluss: boolean; verbot: string | null
  rolle: string; grund: string; dj: number; hinweis: string; hinweise: string[]; nebenarm: boolean
}
export interface Knotenbereich {
  K: number; hAnk: P; mitglieder: Mitglied[]; arme: ArmInfo[]; forts: ArmInfo | null; kreiselAusfahrt: boolean
  ringEigen: boolean; fortsService: boolean; klasseVorName: ArmInfo | null
}
export interface SpurGerade { punkte: P[]; knotenM: number[]; endeM: number | null; endeGrund: string | null }

interface Verbot {
  id: number; typ: string; frm: Set<number>; to: Set<number>; viaWege: number[]; zubringer: boolean; busAus: boolean
  mehrdeutig: boolean
}

/** fgs_netz.kennung_gerade */
export const kennungGerade = (g: Gequert, sd: number) => `w${g.wid}${sd > 0 ? '+' : '-'}`
/** fgs_netz.kennung_arm */
export const kennungArm = (a: ArmInfo) => `k${a.knoten}:w${a.wid}${a.arm[2] > 0 ? '+' : '-'}`

const rk = (x: number, y: number) => `${x},${y}`

// ---------------------------------------------------------------- Netz
export class OsmNetz {
  P = new Map<number, P>()
  W = new Map<number, Weg>()
  an = new Map<number, [number, number][]>()
  raster = new Map<string, [number, number][]>()
  verbAn = new Map<number, Verbot[]>()
  verboteIgnoriert = new Map<string, number>()
  U = new Map<number, { p: P; ll: [number, number]; t: Tags }>()
  uRaster = new Map<string, number[]>()
  tram: P[][] = []
  ampeln: { id: number; p: P }[] = []
  private armCache = new Map<string, P>()
  private wids: number[]

  constructor(osm: OsmDaten) {
    const wege = [...osm.wege].sort((a, b) => a.id - b.id)
    for (const w of wege) {
      w.knoten.forEach((n, i) => {
        if (!this.P.has(n)) {
          const [e, nn] = lv95(w.geom[i][0], w.geom[i][1])
          this.P.set(n, [Math.round(e * 100) / 100, Math.round(nn * 100) / 100])
        }
      })
      this.W.set(w.id, wegDeuten(w.knoten, w.tags))
    }
    this.wids = wege.map(w => w.id)
    for (const wid of this.wids) {
      this.W.get(wid)!.nds.forEach((n, i) => {
        if (!this.an.has(n)) this.an.set(n, [])
        this.an.get(n)!.push([wid, i])
      })
    }
    for (const wid of this.wids) {
      const w = this.W.get(wid)!
      if (!(w.mfz || w.bus)) continue
      const pts = w.nds.map(n => this.P.get(n)!)
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1]
        for (let cx = Math.floor(Math.min(a[0], b[0]) / RASTER); cx <= Math.floor(Math.max(a[0], b[0]) / RASTER); cx++)
          for (let cy = Math.floor(Math.min(a[1], b[1]) / RASTER); cy <= Math.floor(Math.max(a[1], b[1]) / RASTER); cy++) {
            const key = rk(cx, cy)
            if (!this.raster.has(key)) this.raster.set(key, [])
            this.raster.get(key)!.push([wid, k])
          }
      }
    }
    const benutzt = new Set<number>()
    for (const w of this.W.values()) for (const n of w.nds) benutzt.add(n)
    for (const r of osm.relationen) {
      const m = (rolle: string, typ: string) => r.members.filter(x => x.role === rolle && x.type === typ).map(x => x.ref)
      const v = { id: r.id, t: r.tags, from: m('from', 'way'), viaKnoten: m('via', 'node'), viaWege: m('via', 'way'), to: m('to', 'way') }
      const fehlt = [...v.from, ...v.viaWege, ...v.to].some(w => !this.W.has(w)) || v.viaKnoten.some(n => !benutzt.has(n))
      const unvollstaendig = fehlt || !v.from.length || !v.to.length || !(v.viaKnoten.length || v.viaWege.length)
      this.verbotEintragen({ ...v, unvollstaendig })
    }
    for (const u of osm.uebergaenge) {
      const [e, n] = lv95(u.lat, u.lon)
      const p: P = [Math.round(e * 100) / 100, Math.round(n * 100) / 100]
      this.U.set(u.id, { p, ll: [u.lat, u.lon], t: u.tags })
      const key = rk(Math.floor(p[0] / RASTER), Math.floor(p[1] / RASTER))
      if (!this.uRaster.has(key)) this.uRaster.set(key, [])
      this.uRaster.get(key)!.push(u.id)
    }
    this.tram = osm.tram.map(w => w.geom.map(([la, lo]) => lv95(la, lo)))
    this.ampeln = osm.ampeln.map(a => ({ id: a.id, p: lv95(a.lat, a.lon) }))
  }

  w(wid: number): Weg { return this.W.get(wid)! }
  p(nid: number): P { return this.P.get(nid)! }

  // ------------------------------------------------------------ Grundfunktionen
  /** fgs_netz.OsmNetz.arme: Arme am Knoten n (Wege des Knotennetzes V2 und die Wege der eigenen Kette extra). */
  arme(n: number, extra: Set<number> = new Set()): Arm[] {
    const out: Arm[] = []
    for (const [wid, i] of this.an.get(n) ?? []) {
      const w = this.w(wid)
      if (!(w.v2 || extra.has(wid))) continue
      if (i > 0) out.push([wid, i, -1])
      if (i < w.nds.length - 1) out.push([wid, i, +1])
    }
    return out
  }

  /** fgs_netz.OsmNetz.ist_strasse */
  istStrasse(wid: number, extra: Set<number> = new Set(), eigSvc = false): boolean {
    const w = this.w(wid)
    return extra.has(wid) || (w.v2 && (w.hw !== 'service' || eigSvc || SERVICE_IST_KNOTEN))
  }

  /** fgs_netz.OsmNetz.strassenarme */
  strassenarme(n: number, extra: Set<number> = new Set(), eigSvc = false): Arm[] {
    return this.arme(n, extra).filter(a => this.istStrasse(a[0], extra, eigSvc))
  }

  /** fgs_netz.OsmNetz.zufluss */
  zufluss(arm: Arm): boolean {
    const ow = this.w(arm[0]).ow
    return ow === 0 || ow === -arm[2]
  }

  /** fgs_netz.OsmNetz._weiter */
  private weiter(wid: number, idx: number, walk: number, start: P, L: number, extra0: Set<number>, eigSvc: boolean): P[] {
    const pts: P[] = [start]
    let acc = 0
    const extra = new Set(extra0)
    for (;;) {
      const nds = this.w(wid).nds
      if (idx < 0 || idx >= nds.length) return pts
      const p = this.p(nds[idx])
      const l = dist(pts[pts.length - 1], p)
      if (l > 0 && acc + l >= L) {
        const f = (L - acc) / l, a = pts[pts.length - 1]
        pts.push([a[0] + (p[0] - a[0]) * f, a[1] + (p[1] - a[1]) * f])
        return pts
      }
      acc += l
      pts.push(p)
      const st = this.strassenarme(nds[idx], extra, eigSvc)
      const rest = st.filter(a => !armGleich(a, [wid, idx, -walk]))
      if (st.length !== 2 || rest.length !== 1) return pts
      const [w2, i2, wk] = rest[0]
      wid = w2; walk = wk
      extra.add(wid)
      idx = i2 + walk
    }
  }

  /** fgs_netz.OsmNetz.arm_richtung */
  armRichtung(arm: Arm, L = ARM_SEHNE): P {
    const k = armKey(arm) + '|' + L
    let v = this.armCache.get(k)
    if (!v) {
      const pts = this.armLinie(arm, L)
      v = einheit([pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]])
      this.armCache.set(k, v)
    }
    return v
  }

  /** fgs_netz.OsmNetz.arm_linie */
  armLinie(arm: Arm, L = ARM_SEHNE): P[] {
    const [wid, i, d] = arm
    const p0 = this.p(this.w(wid).nds[i])
    return this.weiter(wid, i + d, d, p0, L, new Set([wid]), this.w(wid).hw === 'service')
  }

  /** fgs_netz.OsmNetz.arm_punkt */
  armPunkt(arm: Arm, L = ARM_SEHNE): P {
    const l = this.armLinie(arm, L)
    return l[l.length - 1]
  }

  /** fgs_netz.OsmNetz.ist_gabel */
  istGabel(st: Arm[]): boolean {
    if (st.length !== 3) return false
    const namen = new Set(st.map(a => this.w(a[0]).name))
    if (namen.size !== 1 || namen.has('')) return false
    const ows = st.filter(a => this.w(a[0]).ow)
    if (ows.length !== 2 || this.zufluss(ows[0]) === this.zufluss(ows[1])) return false
    return wdiff(this.armRichtung(ows[0]), this.armRichtung(ows[1])) <= GABEL_MAX
  }

  /** fgs_netz.OsmNetz._gleichnamig_v1 */
  private gleichnamigV1(nid: number, wid: number, ankunft: Arm): Arm | null {
    const w0 = this.w(wid), name = w0.name
    for (const [w2, i] of this.an.get(nid) ?? []) {
      const w = this.w(w2)
      if (w2 === wid || w.v2) continue
      if (!((w.mfz && name && w.name === name) || (w0.bus && w.bus && (w.name === name || !w.name || !name)))) continue
      for (const d of [-1, 1]) {
        if (i + d >= 0 && i + d < w.nds.length && !armGleich([w2, i, d], ankunft)) return [w2, i, d]
      }
    }
    return null
  }

  /** fgs_netz.OsmNetz._fahrverbot */
  private fahrverbot(nid: number, extra: Set<number> = new Set()): boolean {
    return (this.an.get(nid) ?? []).some(([w]) => !extra.has(w) && !this.w(w).mfz)
  }

  // ------------------------------------------------------------ Abbiegeverbote (SPEC 3.5)
  /** fgs_netz.OsmNetz._verbot_eintragen */
  private verbotEintragen(r: { id: number; t: Tags; from: number[]; viaKnoten: number[]; viaWege: number[]; to: number[];
    unvollstaendig: boolean }) {
    const t = r.t, typ = t.restriction
    const exc = new Set((t.except ?? '').split(';').map(x => x.trim()).filter(x => x))
    let grund: string | null = null
    if (r.unvollstaendig) grund = 'unvollständig oder Mitglied fehlt'
    else if (!typ) grund = 'bedingt oder fahrzeugbezogen'
    else if (typ === 'no_u_turn') grund = 'no_u_turn'
    else if (r.from.some(w => r.to.includes(w))) grund = 'from = to'
    else if (['motorcar', 'motor_vehicle', 'vehicle'].some(x => exc.has(x))) grund = 'except Motorfahrzeuge'
    else if (r.viaWege.length && typ.startsWith('only_')) grund = 'only_* mit via-Weg'
    if (grund) {
      this.verboteIgnoriert.set(grund, (this.verboteIgnoriert.get(grund) ?? 0) + 1)
      return
    }
    const v: Verbot = { id: r.id, typ, frm: new Set(r.from), to: new Set(r.to), viaWege: [...r.viaWege],
      zubringer: exc.has('destination'), busAus: exc.has('psv') || exc.has('bus'), mehrdeutig: false }
    let knoten: number[]
    if (r.viaWege.length) {
      knoten = [...new Set(r.viaWege.flatMap(w => this.w(w).nds))]
    } else {
      knoten = [...new Set(r.viaKnoten)]
      const n = r.viaKnoten[0]
      v.mehrdeutig = r.to.some(w => this.w(w).nds.slice(1, -1).includes(n))
    }
    for (const n of knoten) {
      if (!this.verbAn.has(n)) this.verbAn.set(n, [])
      this.verbAn.get(n)!.push(v)
    }
  }

  /** fgs_netz.OsmNetz._seite_passt */
  private seitePasst(v: Verbot, nid: number, arm: Arm, zielArm: Arm): boolean {
    const fin = neg(this.armRichtung(arm))
    const seiten = this.arme(nid, v.to).filter(a => v.to.has(a[0]))
    if (!seiten.length) return true
    const dr = new Map(seiten.map(a => [armKey(a), drehung(fin, this.armRichtung(a))]))
    const d = (a: Arm) => dr.get(armKey(a))!
    let gemeint: Arm
    if (v.typ.includes('left')) gemeint = seiten.reduce((b, a) => (d(a) > d(b) ? a : b))
    else if (v.typ.includes('right')) gemeint = seiten.reduce((b, a) => (d(a) < d(b) ? a : b))
    else if (v.typ.includes('straight')) gemeint = seiten.reduce((b, a) => (Math.abs(d(a)) < Math.abs(d(b)) ? a : b))
    else return true
    return armGleich(zielArm, gemeint)
  }

  /** fgs_netz.OsmNetz._verbot_pruefen -> [Text | null, Zubringer erlaubt] */
  verbotPruefen(nid: number, arm: Arm, zielWid: number, kette: number[] = [], zielArm: Arm | null = null): [string | null, boolean] {
    let zub = false
    let wege = [zielWid, ...kette]
    wege = wege.filter((w, k) => k === 0 || w !== wege[k - 1])
    for (const v of this.verbAn.get(nid) ?? []) {
      if (!v.frm.has(arm[0])) continue
      if (v.viaWege.length) {
        const nv = v.viaWege.length
        const anfang = new Set(wege.slice(0, nv))
        const gleich = anfang.size === new Set(v.viaWege).size && [...anfang].every(w => v.viaWege.includes(w))
        if (!(gleich && wege.length > nv && v.to.has(wege[nv]))) continue
      } else {
        let zum = v.to.has(zielWid)
        if (zum && v.mehrdeutig && zielArm !== null) zum = this.seitePasst(v, nid, arm, zielArm)
        if ((v.typ.startsWith('no_') && !zum) || (v.typ.startsWith('only_') && zum)) continue
        if (!(v.typ.startsWith('no_') || v.typ.startsWith('only_'))) continue
      }
      const ziel = v.viaWege.length ? wege[v.viaWege.length] : zielWid
      if (v.busAus && BUS_AUSNAHME_PSV && this.w(ziel).bus) continue
      if (v.zubringer) { zub = true; continue }
      return [`${v.typ} (Rel. ${v.id})`, zub]
    }
    return [null, zub]
  }

  // ------------------------------------------------------------ Zuordnung Streifen -> Weg (SPEC 2.2)
  /** fgs_netz.OsmNetz.schnitte */
  schnitte(p0: P, p1: P, verl: number): Gequert[] {
    const n = einheit([p1[0] - p0[0], p1[1] - p0[1]])
    const L = dist(p0, p1)
    const a: P = [p0[0] - n[0] * verl, p0[1] - n[1] * verl], b: P = [p1[0] + n[0] * verl, p1[1] + n[1] * verl]
    const m: P = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
    const kand = new Map<string, [number, number]>()
    for (let cx = Math.floor(Math.min(a[0], b[0]) / RASTER); cx <= Math.floor(Math.max(a[0], b[0]) / RASTER); cx++)
      for (let cy = Math.floor(Math.min(a[1], b[1]) / RASTER); cy <= Math.floor(Math.max(a[1], b[1]) / RASTER); cy++)
        for (const wk of this.raster.get(rk(cx, cy)) ?? []) kand.set(`${wk[0]},${wk[1]}`, wk)
    const sortiert = [...kand.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1])
    const tr = new Map<number, Gequert>()
    for (const [wid, k] of sortiert) {
      const nds = this.w(wid).nds
      const c = this.p(nds[k]), d = this.p(nds[k + 1])
      const x = segSchnitt(a, b, c, d)
      if (!x) continue
      const q: P = [a[0] + (b[0] - a[0]) * x[0], a[1] + (b[1] - a[1]) * x[0]]
      const lage = x[0] * (L + 2 * verl) - verl
      const tang = einheit([d[0] - c[0], d[1] - c[1]])
      const w = wdiff(tang, [-n[1], n[0]])
      const e: Gequert = { wid, k, q, lage, winkel: Math.min(w, 180 - w), imStreifen: lage >= -0.01 && lage <= L + 0.01,
        klasse: this.w(wid).mfz ? 'mfz' : 'bus', stufe: 0, tang, abMitte: dist(q, m), hinweise: [], stufeWege: [],
        uebergang: null }
      if (!tr.has(wid) || e.abMitte < tr.get(wid)!.abMitte) tr.set(wid, e)
    }
    return [...tr.values()].sort((x, y) => x.abMitte - y.abMitte)
  }

  /** fgs_netz.OsmNetz.zuordnen -> [[Gequert], netz_quelle] */
  zuordnen(p0: P, p1: P, dInsel: P | null = null, bus = true, bw: number | null = null): [Gequert[], string] {
    if (UEBERGANG_ZUORDNUNG && bw !== null) {
      const gu = this.zuordnenUebergang(p0, p1, bw, dInsel, bus)
      if (gu.length) return [gu, 'uebergang']
    }
    const tr = this.schnitte(p0, p1, VERL_1).filter(e => e.winkel <= WINKEL_MAX)
    const tr6: Gequert[] = []
    for (const e of this.schnitte(p0, p1, VERL_2)) {
      const w = this.w(e.wid)
      if (e.klasse !== 'mfz' || e.winkel > WINKEL_VERL_2) continue
      if (dInsel !== null && w.ow && dot(e.tang, dInsel) * w.ow <= 0) continue
      tr6.push(e)
    }
    const stufen: [number, Gequert[], string][] = [[1, tr.filter(e => e.imStreifen), 'schnitt'], [2, tr, 'schnitt_3m'],
      [3, tr6, 'schnitt_6m']]
    for (const [stufe, kand, quelle] of stufen) {
      let wahl = kand.filter(e => e.klasse === 'mfz')
      if (!wahl.length) wahl = kand.filter(e => e.klasse === 'bus')
      if (!wahl.length) continue
      if (wahl[0].klasse === 'bus' && !bus) return [[], 'rueckfall']
      const eben = wahl.filter(e => this.w(e.wid).ebene)
      if (eben.length) wahl = eben
      const alleWege = wahl.map(e => e.wid)
      const hinweise: string[] = []
      if (wahl.length > 1 && !wahl.every(e => this.w(e.wid).ow)) {
        wahl = [wahl.reduce((b, e) => (e.winkel < b.winkel || (e.winkel === b.winkel && e.abMitte < b.abMitte) ? e : b))]
        hinweise.push('mehrere_wege')
      }
      for (const e of wahl) {
        e.stufe = stufe
        e.hinweise = [...hinweise, ...(e.klasse === 'bus' ? ['bus'] : [])]
        e.stufeWege = [...alleWege]
      }
      return [wahl, quelle]
    }
    return [[], 'rueckfall']
  }

  /** fgs_netz.OsmNetz.uebergaenge_bei -> [[Abstand, nid]] aufsteigend */
  uebergaengeBei(p0: P, p1: P, bw: number, maxd = UEBERGANG_M): [number, number][] {
    const m: P = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
    const r = dist(p0, p1) / 2 + bw / 2 + maxd
    const out: [number, number][] = []
    for (let cx = Math.floor((m[0] - r) / RASTER); cx <= Math.floor((m[0] + r) / RASTER); cx++)
      for (let cy = Math.floor((m[1] - r) / RASTER); cy <= Math.floor((m[1] + r) / RASTER); cy++)
        for (const nid of this.uRaster.get(rk(cx, cy)) ?? []) {
          const dd = streifenAbstand(this.U.get(nid)!.p, p0, p1, bw)
          if (dd <= maxd) out.push([Math.round(dd * 100) / 100, nid])
        }
    return out.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  }

  /** fgs_netz.OsmNetz._uebergang_weg */
  private uebergangWeg(nid: number, p0: P, p1: P, bus: boolean): Gequert | null {
    const wege = new Set((this.an.get(nid) ?? []).map(([w]) => w).filter(w => this.w(w).mfz || (this.w(w).bus && bus)))
    if (!wege.size) return null
    const rang = (e: Gequert): [number, number, number] => [e.klasse !== 'mfz' ? 1 : 0, e.winkel, e.abMitte]
    const kleiner = (a: [number, number, number], b: [number, number, number]) =>
      a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))
    const kand = this.schnitte(p0, p1, VERL_2).filter(e => wege.has(e.wid) && e.winkel <= WINKEL_MAX)
    let e: Gequert | null = null
    if (kand.length) {
      e = kand.reduce((b, x) => (kleiner(rang(x), rang(b)) ? x : b))
    } else {
      const n = einheit([p1[0] - p0[0], p1[1] - p0[1]])
      const q = this.U.get(nid)!.p, m: P = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
      for (const [wid, i] of this.an.get(nid) ?? []) {
        if (!wege.has(wid)) continue
        const nds = this.w(wid).nds
        for (const k of [i - 1, i]) {
          if (!(k >= 0 && k < nds.length - 1)) continue
          const c = this.p(nds[k]), d = this.p(nds[k + 1])
          const tang = einheit([d[0] - c[0], d[1] - c[1]])
          const w = wdiff(tang, [-n[1], n[0]])
          const lage = dot([q[0] - p0[0], q[1] - p0[1]], n)
          const x: Gequert = { wid, k, q, lage, winkel: Math.min(w, 180 - w), imStreifen: lage >= -0.01 && lage <= dist(p0, p1) + 0.01,
            klasse: this.w(wid).mfz ? 'mfz' : 'bus', stufe: 0, tang, abMitte: dist(q, m), hinweise: [], stufeWege: [],
            uebergang: null }
          if (x.winkel <= WINKEL_MAX && (e === null || kleiner(rang(x), rang(e)))) e = x
        }
      }
      if (e === null) return null
    }
    e.stufe = 0
    e.uebergang = nid
    return e
  }

  /** fgs_netz.OsmNetz.zuordnen_uebergang (Stufe 0) */
  zuordnenUebergang(p0: P, p1: P, bw: number, dInsel: P | null = null, bus = true): Gequert[] {
    const kand: [number, number, Gequert][] = []
    for (const [dd, nid] of this.uebergaengeBei(p0, p1, bw)) {
      const e = this.uebergangWeg(nid, p0, p1, bus)
      if (e === null) continue
      const ow = this.w(e.wid).ow
      if (dInsel !== null && dd > 0.01 && ow && dot(e.tang, dInsel) * ow <= 0) continue
      kand.push([dd, nid, e])
    }
    const imSt = kand.filter(k => k[0] <= 0.01)
    const gew = imSt.length ? imSt : kand.slice(0, 1)
    // je Weg der nächste Knoten: {e.wid: e for … in reversed(gew)} – Reihenfolge der ersten Einfügung (Python-dict)
    const jeWeg = new Map<number, Gequert>()
    for (const [, , e] of [...gew].reverse()) jeWeg.set(e.wid, e)
    let wahl = [...jeWeg.values()]
    const mfz = wahl.filter(e => e.klasse === 'mfz')
    if (mfz.length) wahl = mfz
    const eben = wahl.filter(e => this.w(e.wid).ebene)
    if (eben.length) wahl = eben
    const alle: number[] = []
    for (const w of [...wahl.map(e => e.wid), ...gew.flatMap(([, nid]) => (this.an.get(nid) ?? []).map(([w]) => w)
      .filter(w => this.w(w).mfz || this.w(w).bus))]) if (!alle.includes(w)) alle.push(w)
    const hinweise: string[] = []
    if (wahl.length > 1 && !wahl.every(e => this.w(e.wid).ow)) {
      wahl = [wahl.reduce((b, e) => (e.winkel < b.winkel || (e.winkel === b.winkel && e.abMitte < b.abMitte) ? e : b))]
      hinweise.push('mehrere_wege')
    }
    if (dInsel === null && wahl.length && wahl.every(e => this.w(e.wid).ow)) {
      const fahrt = (e: Gequert): P => { const ow = this.w(e.wid).ow; return [e.tang[0] * ow, e.tang[1] * ow] }
      for (const x of this.schnitte(p0, p1, VERL_1)) {
        const w = this.w(x.wid)
        if (wahl.some(e => e.wid === x.wid) || !x.imStreifen || x.klasse !== 'mfz' || !w.ow || x.winkel > WINKEL_MAX || !w.name)
          continue
        if (wahl.some(e => this.w(e.wid).name === w.name && dot(fahrt(x), fahrt(e)) < 0)) {
          x.stufe = 0
          wahl.push(x)
          alle.push(x.wid)
        }
      }
    }
    for (const e of wahl) {
      e.hinweise = [...hinweise, ...(e.klasse === 'bus' ? ['bus'] : [])]
      e.stufeWege = [...alle]
    }
    return wahl.sort((a, b) => a.abMitte - b.abMitte)
  }

  /** fgs_netz.OsmNetz.richtung: Fahrtrichtung am Streifen (Sehne ±SEHNE_D), mal sd */
  richtung(g: Gequert, sd: number): P {
    const eig = this.w(g.wid).hw === 'service'
    const vorL = this.weiter(g.wid, g.k + 1, +1, g.q, SEHNE_D, new Set([g.wid]), eig)
    const zurL = this.weiter(g.wid, g.k, -1, g.q, SEHNE_D, new Set([g.wid]), eig)
    const vor = vorL[vorL.length - 1], zur = zurL[zurL.length - 1]
    let d: P = [vor[0] - zur[0], vor[1] - zur[1]]
    d = Math.hypot(d[0], d[1]) >= SEHNE_MIN ? einheit(d) : g.tang
    return [d[0] * sd, d[1] * sd]
  }

  /** fgs_netz.OsmNetz.gegenfahrbahn (B2) */
  gegenfahrbahn(wid: number, d: P, p0: P, p1: P): boolean {
    const name = this.w(wid).name
    for (const e of this.schnitte(p0, p1, GEGENFAHRBAHN_M)) {
      const w = this.w(e.wid)
      if (e.wid === wid || !w.mfz || !w.ow) continue
      if (dot([e.tang[0] * w.ow, e.tang[1] * w.ow], d) < -GEGEN_COS && (w.name === name || !w.name || !name)) return true
    }
    return false
  }

  // ------------------------------------------------------------ Suche stromauf (SPEC 3.2)
  /** fgs_netz.OsmNetz.stromauf */
  stromauf(g: Gequert, sd: number, gegenEinbahn = false): Suche {
    let wid = g.wid, walk = -sd
    let idx = walk === 1 ? g.k + 1 : g.k
    const su: Suche = { art: '', K: null, dist: 0, pfad: [g.q], wege: [wid], ankunft: null, nebenarme: [], gabeln: [],
      gabelWege: [], hinweise: [], endeGrund: null, g, sd, extra: new Set([wid]),
      eigSvc: SERVICE_IST_KNOTEN || this.w(wid).hw === 'service', ketteAn: new Map() }
    for (;;) {
      const nid = this.w(wid).nds[idx]
      const p = this.p(nid)
      su.dist += dist(su.pfad[su.pfad.length - 1], p)
      su.pfad.push(p)
      if (su.dist > MAX_SUCHE) { su.art = 'weit'; return su }
      const ankunft: Arm = [wid, idx, -walk]
      su.ketteAn.set(nid, [ankunft, su.wege.length])
      const alle = this.arme(nid, su.extra)
      const st = alle.filter(a => this.istStrasse(a[0], su.extra, su.eigSvc))
      let rest = st.filter(a => !armGleich(a, ankunft))
      if (st.length >= 3) {
        if (this.istGabel(st) && rest.some(a => this.zufluss(a))) {
          const vorher = su.pfad[su.pfad.length - 2]
          const h = einheit([p[0] - vorher[0], p[1] - vorher[1]])
          const zu = rest.filter(a => this.zufluss(a))
          rest = [zu.reduce((b, a) => (wdiff(this.armRichtung(a), h) < wdiff(this.armRichtung(b), h) ? a : b))]
          su.gabeln.push(su.dist)
          su.gabelWege.push(rest[0][0])
        } else {
          su.art = 'knoten'; su.K = nid; su.ankunft = ankunft
          return su
        }
      }
      for (const a of alle) if (!st.some(s => armGleich(s, a))) su.nebenarme.push({ dist: su.dist, nid, arm: a })
      if (!rest.length) {
        const fort = this.gleichnamigV1(nid, wid, ankunft)
        if (fort === null) {
          su.art = 'ende'
          su.endeGrund = this.fahrverbot(nid, su.extra) ? 'fahrverbot' : 'wegende'
          return su
        }
        rest = [fort]
      }
      const a2 = rest[0]
      if (!this.zufluss(a2) && !gegenEinbahn) {
        su.art = 'widerspruch'; su.endeGrund = 'einbahn_widerspruch'
        su.hinweise.push('einbahn_widerspruch')
        return su
      }
      if (a2[0] !== wid) { su.wege.push(a2[0]); su.extra.add(a2[0]) }
      wid = a2[0]; idx = a2[1] + a2[2]; walk = a2[2]
    }
  }

  /** fgs_netz.OsmNetz._bis_knoten -> [knoten | null, länge, punkte, befahrbar, Ankunftsarm, Wege] */
  private bisKnoten(n: number, arm: Arm, maxlen: number, extra: Set<number>, eigSvc: boolean):
    [number | null, number, P[], boolean, Arm | null, number[]] {
    let [wid, i, d] = arm
    const pts: P[] = [this.p(this.w(wid).nds[i])]
    let l = 0, ok = this.zufluss(arm)
    const wege = [wid]
    const ex = new Set([...extra, wid])
    for (;;) {
      const nds = this.w(wid).nds
      const m = nds[i + d]
      l += dist(this.p(nds[i]), this.p(m))
      pts.push(this.p(m))
      if (l > maxlen) return [null, l, pts, ok, null, wege]
      const st = this.strassenarme(m, ex, eigSvc)
      const ank: Arm = [wid, i + d, -d]
      if (st.length !== 2 || m === n) return [st.length >= 3 ? m : null, l, pts, ok, ank, wege]
      const weiter = st.filter(x => !armGleich(x, ank))
      if (!weiter.length) return [null, l, pts, ok, null, wege]
      ;[wid, i, d] = weiter[0]
      ex.add(wid)
      if (wid !== wege[wege.length - 1]) wege.push(wid)
      ok = ok && this.zufluss(weiter[0])
    }
  }

  // ------------------------------------------------------------ Knotenbereich (SPEC 3.3)
  /** fgs_netz.OsmNetz._ankunft_richtung */
  private ankunftRichtung(pfad: P[], s: number, g: Gequert, sd: number): P {
    const teil = abschneiden(pfad, s)
    const a = punktZurueck(teil, ARM_SEHNE)
    const e = teil[teil.length - 1]
    const h: P = [e[0] - a[0], e[1] - a[1]]
    return Math.hypot(h[0], h[1]) >= SEHNE_MIN ? einheit(h) : neg(this.richtung(g, sd))
  }

  /** fgs_netz.OsmNetz._arm_bilden */
  private armBilden(nid: number, abK: number, arm: Arm, h: P): ArmInfo {
    const w = this.w(arm[0])
    const aus = this.armRichtung(arm), fahrt = neg(aus)
    return { knoten: nid, j: this.p(nid), abK, arm, wid: arm[0], name: w.name, hw: w.hw, svc: w.sv, ring: w.ring,
      ow: w.ow, aus, fahrt, abw: wdiff(aus, h), dreh: drehung(fahrt, neg(h)), zufluss: this.zufluss(arm), verbot: null,
      rolle: '', grund: '', dj: 0, hinweis: '', hinweise: [], nebenarm: false }
  }

  /** fgs_netz.OsmNetz._rolle (SPEC 3.3 Punkt 8); Drehung in den Texten mit einer Nachkommastelle (grad1, seit 13.10.2026;
   * bis dahin ganze Grad, ein Nebenast mit 9,6° stand als «Drehung 10°» da) */
  private rolle(a: ArmInfo, nameAnk: string, ringEigen: boolean, forts: ArmInfo | null = null, stamm = false) {
    const ad = Math.abs(a.dreh)
    if (a === forts) [a.rolle, a.grund] = !a.verbot ? ['gerade', ''] : ['gerade_verboten', a.verbot]
    else if (!a.zufluss) [a.rolle, a.grund] = ['kein_zufluss', a.grund || 'Einbahn']
    else if (a.verbot) [a.rolle, a.grund] = ['verbot', a.verbot]
    else if (a.ring && !ringEigen) [a.rolle, a.grund] = ['kreisel', 'über den Ring mitgeprüft']
    else if (nameAnk && a.name === nameAnk && a.ow && ad > WENDEN_AB) [a.rolle, a.grund] = ['wenden', `Gegenfahrbahn, Drehung ${grad1(ad, null, WENDEN_AB)}`]
    else if (stamm && ad > WENDEN_AB) [a.rolle, a.grund] = ['wenden', `Gegenfahrbahn ohne Namen (gemeinsamer Stamm), Drehung ${grad1(ad, null, WENDEN_AB)}`]
    else if (ad < NEBENAST_GRAD) [a.rolle, a.grund] = ['nebenast', `Drehung ${grad1(ad, NEBENAST_GRAD)}`]
    else if (ad > ZU_STEIL_GRAD) [a.rolle, a.grund] = ['zu_steil', `Drehung ${grad1(ad, null, ZU_STEIL_GRAD)}`]
    else [a.rolle, a.grund] = ['abbiegend', '']
  }

  /** fgs_netz.OsmNetz.knotenbereich */
  knotenbereich(su: Suche, g: Gequert): Knotenbereich {
    const K = su.K!
    const extra = su.extra, eigSvc = su.eigSvc
    const nameAnk = this.w(su.ankunft![0]).name
    const ringEigen = this.w(g.wid).ring
    const svcEigen = this.w(g.wid).hw === 'service'
    const h = this.ankunftRichtung(su.pfad, su.dist, g, su.sd)
    const mitglieder: Mitglied[] = [{ nid: K, abK: 0, erreichbar: true, kette: [this.p(K)], ankunft: su.ankunft!, art: 'K',
      ketteWege: [...su.wege].reverse(), ketteVerbot: [null, false] }]
    const aussen: [Mitglied, Arm][] = []
    let kreiselAus = false
    let cur = mitglieder[0]
    for (;;) {
      const alle = this.arme(cur.nid, extra).filter(a => !armGleich(a, cur.ankunft))
      let best: Arm | null = null, art: string | null = null
      if (!ringEigen && !kreiselAus) {
        const ringAuf = alle.filter(a => this.w(a[0]).ring && this.zufluss(a))
        if (ringAuf.length) { kreiselAus = true; best = ringAuf[0]; art = 'ring' }
        else {
          const gerade = neg(this.armRichtung(cur.ankunft))
          const kand = alle.filter(a => !this.w(a[0]).ring && this.istStrasse(a[0], extra, eigSvc))
          if (kand.length) {
            const b = kand.reduce((x, a) => (wdiff(this.armRichtung(a), gerade) < wdiff(this.armRichtung(x), gerade) ? a : x))
            if (wdiff(this.armRichtung(b), gerade) <= FORTS_MAX) { best = b; art = 'durchblick' }
          }
        }
      }
      let weiter: Mitglied | null = null
      if (best !== null) {
        const [ende, l, pts, ok, ank2, wege] = this.bisKnoten(cur.nid, best, art === 'ring' ? KREISEL_RING_M : DURCHBLICK_M,
          extra, eigSvc)
        if (ende !== null && !mitglieder.some(m => m.nid === ende) && cur.abK + l <= DURCHBLICK_MAX) {
          let kv = cur.ketteVerbot
          if (!kv[0]) {
            const [t, z] = this.verbotPruefen(cur.nid, best, cur.ankunft[0], cur.ketteWege.slice(1), cur.ankunft)
            kv = [t, z || kv[1]]
          }
          weiter = { nid: ende, abK: cur.abK + l, erreichbar: cur.erreichbar && ok, kette: [...cur.kette, ...pts.slice(1)],
            ankunft: ank2!, art: art!, ketteWege: [...[...wege].reverse(), ...cur.ketteWege], ketteVerbot: kv }
        }
      }
      for (const a of alle) if (weiter === null || !armGleich(a, best)) aussen.push([cur, a])
      if (weiter === null) break
      mitglieder.push(weiter)
      cur = weiter
    }
    const arme: ArmInfo[] = []
    for (const [m, arm] of aussen) {
      const a = this.armBilden(m.nid, m.abK, arm, h)
      a.dj = su.dist + m.abK
      a.grund = a.zufluss ? '' : 'Einbahn'
      if (a.zufluss && !m.erreichbar) { a.zufluss = false; a.grund = 'Kette zum Streifen nicht befahrbar' }
      const [t, zub] = this.verbotPruefen(m.nid, arm, m.ankunft[0], m.ketteWege.slice(1), m.ankunft)
      a.verbot = t || m.ketteVerbot[0]
      if (zub || m.ketteVerbot[1]) a.hinweise.push('verbot_zubringer')
      a.hinweis = m.art === 'ring' ? 'kreisel_einfahrt' : m.art === 'durchblick' ? 'durchblick' : ''
      arme.push(a)
    }
    let forts: ArmInfo | null = null
    if (kreiselAus) {
      const ringK = arme.filter(a => a.ring && a.zufluss)
      forts = ringK.length ? ringK.reduce((b, a) => (a.abK > b.abK ? a : b)) : null
    } else if (ringEigen) {
      forts = arme.find(a => a.ring && a.zufluss && a.knoten === K) ?? null
    }
    let klasse: ArmInfo | null = null
    if (forts === null) {
      const kand = arme.filter(a => a.zufluss && a.abw <= FORTS_MAX)
      if (kand.length) {
        const schl = (a: ArmInfo): [number, number, number] =>
          [!(nameAnk && a.name === nameAnk) ? 1 : 0, a.hw === 'service' && !svcEigen ? 1 : 0, a.abw]
        forts = kand.reduce((b, a) => (lexKleiner(schl(a), schl(b)) ? a : b))
        klasse = this.klasseVorName(kand, forts, su.ankunft![0], nameAnk)
        if (klasse !== null && KLASSE_VOR_NAME) forts = klasse
      }
    }
    for (const a of arme) this.rolle(a, nameAnk, ringEigen, forts, this.stamm(a, arme, su.ankunft![0]))
    return { K, hAnk: h, mitglieder, arme, forts, kreiselAusfahrt: kreiselAus, ringEigen,
      fortsService: forts !== null && forts.hw === 'service' && !svcEigen, klasseVorName: klasse }
  }

  /** fgs_netz.OsmNetz._stamm (WENDEN_OHNE_NAME) */
  private stamm(a: ArmInfo, arme: ArmInfo[], widAnk: number): boolean {
    const w = this.w(widAnk)
    if (!WENDEN_OHNE_NAME || w.name || a.name || !(w.ow && a.ow && a.zufluss) || a.hw !== w.hw) return false
    return arme.some(b => b !== a && b.knoten === a.knoten && !b.ow && !b.name && b.hw === w.hw)
  }

  private static rang(hw: string): number { return HW_RANG[hw.replace(/_link$/, '')] ?? 9 }

  /** fgs_netz.OsmNetz._klasse_vor_name */
  private klasseVorName(kand: ArmInfo[], forts: ArmInfo, widAnk: number, nameAnk: string): ArmInfo | null {
    if (!(nameAnk && forts.name === nameAnk)) return null
    const rAnk = OsmNetz.rang(this.w(widAnk).hw)
    const andere = kand.filter(a => a !== forts && a.name !== nameAnk && a.abw < FAST_GERADE_GRAD &&
      OsmNetz.rang(a.hw) === rAnk && OsmNetz.rang(forts.hw) > rAnk)
    return andere.length ? andere.reduce((b, a) => (a.abw < b.abw ? a : b)) : null
  }

  /** fgs_netz.OsmNetz.nebenarm */
  nebenarm(su: Suche, na: Nebenarm): ArmInfo {
    const h = this.ankunftRichtung(su.pfad, na.dist, su.g, su.sd)
    const a = this.armBilden(na.nid, 0, na.arm, h)
    a.dj = na.dist; a.nebenarm = true; a.hinweis = 'nebenarm'
    const [ank, nWege] = su.ketteAn.get(na.nid)!
    const [t, zub] = this.verbotPruefen(na.nid, na.arm, ank[0], [...su.wege.slice(0, nWege)].reverse().slice(1), ank)
    a.verbot = t
    if (zub) a.hinweise.push('verbot_zubringer')
    this.rolle(a, this.w(ank[0]).name, this.w(su.g.wid).ring)
    return a
  }

  // ------------------------------------------------------------ Spuren (SPEC 3.7, 3.8)
  /** fgs_netz.OsmNetz._folgen -> [punkte, knoten_m, ende_m | null, ende_grund | null] */
  private folgen(n: number, arm: Arm, L: number, eigSvc = false, gegenEinbahn = false): [P[], number[], number | null, string | null] {
    let [wid, i, d] = arm
    const pts: P[] = [this.p(n)]
    let acc = 0
    const km: number[] = [], extra = new Set([wid])
    let idx = i + d, walk = d
    let frei = gegenEinbahn
    for (;;) {
      const nds = this.w(wid).nds
      if (idx < 0 || idx >= nds.length) return [pts, km, acc, 'wegende']
      const nid = nds[idx]
      const p = this.p(nid)
      const l = dist(pts[pts.length - 1], p)
      if (l > 0 && acc + l >= L) {
        const f = (L - acc) / l, a = pts[pts.length - 1]
        pts.push([a[0] + (p[0] - a[0]) * f, a[1] + (p[1] - a[1]) * f])
        return [pts, km, null, null]
      }
      acc += l
      pts.push(p)
      const st = this.strassenarme(nid, extra, eigSvc)
      const ank: Arm = [wid, idx, -walk]
      let rest = st.filter(a => !armGleich(a, ank))
      if (st.length >= 3) {
        km.push(acc)
        if (this.istGabel(st) && rest.some(a => this.zufluss(a))) {
          const vorher = pts[pts.length - 2]
          const h = einheit([p[0] - vorher[0], p[1] - vorher[1]])
          const zu = rest.filter(a => this.zufluss(a))
          rest = [zu.reduce((b, a) => (wdiff(this.armRichtung(a), h) < wdiff(this.armRichtung(b), h) ? a : b))]
        } else {
          frei = false
          const a0 = punktZurueck(pts, ARM_SEHNE)
          const h = einheit([p[0] - a0[0], p[1] - a0[1]])
          const w0 = this.w(wid)
          const ringAuf = w0.ring ? [] : rest.filter(a => this.w(a[0]).ring && this.zufluss(a))
          if (ringAuf.length) {
            rest = [ringAuf.reduce((b, a) => (wdiff(this.armRichtung(a), h) < wdiff(this.armRichtung(b), h) ? a : b))]
          } else {
            let kand = rest.filter(a => this.zufluss(a) && (wdiff(this.armRichtung(a), h) <= FORTS_MAX ||
              (w0.ring && this.w(a[0]).ring)))
            if (w0.ring && kand.some(a => this.w(a[0]).ring)) kand = kand.filter(a => this.w(a[0]).ring)
            if (!kand.length) return [pts, km, acc, 'strassenende']
            const schl = (a: Arm): [number, number, number] => [
              !(w0.name && this.w(a[0]).name === w0.name) ? 1 : 0,
              this.w(a[0]).hw === 'service' && w0.hw !== 'service' ? 1 : 0, wdiff(this.armRichtung(a), h)]
            rest = [kand.reduce((b, a) => (lexKleiner(schl(a), schl(b)) ? a : b))]
          }
        }
      } else if (!rest.length) {
        const fort = this.gleichnamigV1(nid, wid, ank)
        if (fort === null) return [pts, km, acc, this.fahrverbot(nid, extra) ? 'fahrverbot' : 'wegende']
        rest = [fort]
      }
      const a2 = rest[0]
      if (!this.zufluss(a2) && !frei) return [pts, km, acc, 'einbahn_widerspruch']
      extra.add(a2[0])
      wid = a2[0]; idx = a2[1] + a2[2]; walk = a2[2]
    }
  }

  /** fgs_netz.OsmNetz.spur_gerade */
  spurGerade(su: Suche, kb: Knotenbereich | null, laenge: number, kappen = true): SpurGerade {
    let pts = [...su.pfad]
    let km = [...su.gabeln]
    let endeM: number | null = null, endeGrund: string | null = null
    if (su.art === 'knoten') {
      if (kb === null) throw new Error(`spurGerade: Knotenbereich fehlt (Knoten ${su.K})`)
      km.push(...kb.mitglieder.map(m => su.dist + m.abK))
      if (kb.forts === null) { endeM = su.dist; endeGrund = 'strassenende' }
      else {
        const m = kb.mitglieder.find(x => x.nid === kb.forts!.knoten)!
        pts.push(...m.kette.slice(1))
        const basis = streckeLaenge(pts)
        if (basis < laenge) {
          const [fPts, fKm, fEnde, fGrund] = this.folgen(m.nid, kb.forts.arm, laenge - basis, su.eigSvc,
            kb.forts.zufluss && !this.zufluss(kb.forts.arm))
          pts.push(...fPts.slice(1))
          km.push(...fKm.map(x => basis + x))
          if (fGrund) { endeM = basis + fEnde!; endeGrund = fGrund }
        }
      }
    } else if (su.art === 'ende' || su.art === 'widerspruch') {
      endeM = su.dist; endeGrund = su.endeGrund
    }
    if (endeM !== null && endeM >= laenge) { endeM = null; endeGrund = null }
    pts = abschneiden(pts, laenge)
    if (endeM === null || !kappen) pts = verlaengern(pts, laenge, neg(this.richtung(su.g, su.sd)))
    pts = pts.filter((p, k) => k === 0 || dist(p, pts[k - 1]) > 0.01)
    km = [...new Set(km.filter(x => x <= laenge).map(x => Math.round(x * 100) / 100))].sort((a, b) => a - b)
    return { punkte: pts, knotenM: km, endeM, endeGrund }
  }

  /** fgs_netz.OsmNetz.spur_zum_knoten */
  spurZumKnoten(su: Suche, kb: Knotenbereich | null, a: ArmInfo): P[] {
    let pts: P[]
    if (a.nebenarm) pts = abschneiden(su.pfad, a.dj)
    else {
      const m = kb!.mitglieder.find(x => x.nid === a.knoten)!
      pts = [...su.pfad, ...m.kette.slice(1)]
    }
    pts = pts.filter((p, k) => k === 0 || dist(p, pts[k - 1]) > 0.01)
    return verlaengern(pts, streckeLaenge(pts) + SPUR_WEITER_M, neg(this.richtung(su.g, su.sd)))
  }

  /** fgs_netz.OsmNetz.arm_spur -> [punkte, ende_grund | "", ende_m ab Knoten | null] */
  armSpur(a: ArmInfo, laenge: number): [P[], string, number | null] {
    const [pts, , endeM, grund] = this.folgen(a.knoten, a.arm, laenge, SERVICE_IST_KNOTEN || a.hw === 'service',
      a.zufluss && !this.zufluss(a.arm))
    return [verlaengern(pts, laenge, a.aus), endeM !== null ? (grund ?? '') : '', endeM]
  }

  /** fgs_netz.OsmNetz.kreisel_wege: Kreiselringe als Punktfolgen in Fahrtrichtung */
  kreiselWege(): P[][] {
    const out: P[][] = []
    for (const wid of this.wids) {
      const w = this.w(wid)
      if (w.ring && w.mfz && w.ow) {
        const pts = w.nds.map(n => this.p(n))
        out.push(w.ow > 0 ? pts : pts.reverse())
      }
    }
    return out
  }

  /** fgs_netz.OsmNetz.maxspeed: OSM-maxspeed als km/h oder null */
  maxspeed(wid: number): number | null {
    const v = (this.W.get(wid)?.t.maxspeed ?? '').split(';')[0].trim()
    if (v in MAXSPEED_CH) return MAXSPEED_CH[v]
    const m = /^(\d+)\s*(mph)?$/.exec(v)
    if (!m) return null
    return m[2] ? Math.round(parseInt(m[1], 10) * 1.609) : parseInt(m[1], 10)
  }
}

/** lexikographischer Vergleich (Python-Tupel) */
export function lexKleiner(a: number[], b: number[]): boolean {
  for (let k = 0; k < a.length; k++) {
    if (a[k] < b[k]) return true
    if (a[k] > b[k]) return false
  }
  return false
}

/** Richtung der Fahrbahn bei p: nächster befahrbarer OSM-Weg (bis 15 m); bis 20.10.2026 in index.ts */
export function fahrbahnRichtung(netz: OsmNetz | null, p: P): P | null {
  if (!netz) return null
  let best: [number, P] | null = null
  for (const w of netz.W.values()) {
    if (!w.mfz) continue
    for (let k = 0; k < w.nds.length - 1; k++) {
      const a = netz.p(w.nds[k]), b = netz.p(w.nds[k + 1]), v: P = [b[0] - a[0], b[1] - a[1]], l2 = dot(v, v)
      if (l2 === 0) continue
      const t = Math.max(0, Math.min(1, dot([p[0] - a[0], p[1] - a[1]], v) / l2))
      const d = dist(p, [a[0] + v[0] * t, a[1] + v[1] * t])
      if (d <= 15 && (best === null || d < best[0])) best = [d, einheit(v)]
    }
  }
  return best ? best[1] : null
}
