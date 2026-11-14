// ── AV-Bord in der Rechnung (Plan AV-Geometrie A6, 13.11.2026 spät) ──
//
// Bindet den Baustein kartenbaustein/bordmodell an die Sichtprüfung: Achsen aus dem OSM-Netz (gequerter Weg am Streifen, Spur der
// Zufahrt), Abzweigungen aus den OSM-Knoten (nur Strassenarme, mit Punkt auf dem Arm; Einmündungen bleiben Topologie aus OSM) und eine
// Sehne gegen den Bord statt gegen den Umriss der Fläche Strasse_Weg (BordSehne):
// - Messrichtung: senkrecht zum Bord (örtliche Randrichtung des Bordmodells) statt senkrecht zur OSM-Spur, wo das Bordmodell eine
//   Randrichtung hat; so bleiben Fahrbahnbreite, Querdistanzen und der Abstand der Fahrlinie zum Bord bei schiefer OSM-Linie die echten.
// - Rand (bordLinien): für Fahrbahnbreite und Querdistanzen der gemessene Rand; für die Lage der Fahrlinie die Führungslinie (über
//   Einmündungen gerade); für Streifenenden der gemessene Rand mit bestätigten Einmündungen zwischen den Anschlusspunkten gerade. Dazu je
//   «Rand unbekannt» bis SCHNITT_LUECKE_MAX_M gerade (Fussweg- oder Einfahrtsmündung in der Fläche Strasse_Weg). Eine Insel (Lücke im
//   Umriss Strasse_Weg) näher als der Bord begrenzt wie bisher.
// - Lage der Messpunkte in der Fahrbahn: eine schiefe OSM-Spur wandert quer über die Fahrbahn; fahrstreifen.fahrstreifenmitte rechnet die
//   Wanderung auf den ersten Messpunkt zurück, spur.amRandHalten glättet im Abstand zum Bord statt in der Lage.
// Wo das Bordmodell keinen Rand liefert (keine AV, nur Ränder gegen andere oder keine Flächen, ausserhalb des Bands), gilt wie bis dahin
// die AV-Sehne quer zur OSM-Spur (Rückfall, im Bericht «Bord aus OSM geschätzt»).

import type { AvFlaeche } from '../daten/av'
import { type P, add, dist, dot, einheit, links, neg, sub } from '../geo'
import { geradeSchnitte } from '../kartenbaustein/geometrie'
import { type Abzweigung, type Bordmodell, type Seite, BAND_M, BORD_ARTEN, STRASSE_ART, bordmodell, schnittBord } from '../kartenbaustein/bordmodell'
import type { OsmNetz } from './netz'
import type { Fahrbahn } from './flaechen'

/** Annahme: Achse des Bordmodells am Streifen ± so weit entlang des gequerten OSM-Wegs */
export const BORD_ACHSE_M = 30
/** Annahme: am Ende eines OSM-Wegs geht die Achse auf dem Strassenarm weiter, der höchstens so weit abbiegt (wie EINM_WINKEL_GRAD) */
export const ACHSE_WEITER_GRAD = 30
/** Annahme: OSM-Knoten höchstens so weit von der Achse bzw. OSM-Linie gilt als Abzweigung dieser Strasse */
export const ABZW_NAH_M = 3
/** Annahme: Strassenarm ist eine Abzweigung, wenn er um mehr als so viel von der Achse abweicht (wie EINM_WINKEL_GRAD) */
export const ABZW_WINKEL_GRAD = 30
/** Punkt auf dem Arm so weit vom Knoten (wie netz.ARM_SEHNE) */
export const ABZW_ARM_M = 10
/** Annahme: Messnormale senkrecht zum Bord nur, wenn sie höchstens so weit von der Normalen der OSM-Spur abweicht; sonst die Normale der
 *  Spur. Seit Nachtrag B, BK4 (14.11.2026) 20° statt 30° (wie FLANKE_ABZW_GRAD): eine Nasenflanke oder Mündungsecke (Bern 768:72: 26–27°)
 *  ist keine repräsentative Messrichtung und fällt aus; im gemessenen Rand und in der Breite (Engstelle) bleibt sie */
export const NORMALE_MAX_GRAD = 20
/** Annahme: Achse des Bordmodells einer Zufahrt über den ersten und letzten Messpunkt hinaus so weit gerade verlängert */
export const ACHSE_ZUGABE_M = 5
/** Annahme: Hinweis «Bord aus OSM geschätzt», wenn das Bordmodell an weniger als diesem Anteil der Messpunkte einen Bord liefert */
export const BORD_ANTEIL_MIN = 0.5
/** Wortlaut der Ersatzgeometrie (Plan 2.1) */
export const BORD_GESCHAETZT = 'Bord aus OSM geschätzt'
/** Messlinie höchstens so weit (wie flaechen.SEHNE_HALB) */
const SUCH_M = 22
const GRAD = Math.PI / 180
const CACHE_MAX = 200

type RefPunkt = [P, P]                                   // (Punkt, Normale nach rechts der Fahrt), wie spur.refAuf
/** Sehne quer zur Fahrt wie Fahrbahn.sehne: [Abstand rechts, Abstand links] entlang r ab p (r nach rechts), null ohne Fahrbahn */
export interface SehnenQuelle {
  sehne(p: P, r: P): [number, number] | null
  enthaelt(p: P): boolean
  /** wie sehne, dazu ob der rechte Rand aus dem Bordmodell kommt (ohne Klemmung in spur.amRandHalten) */
  sehneHerkunft?(p: P, r: P): { w: [number, number] | null; bord: boolean }
}

// ---------------------------------------------------------------- Achse und Abzweigungen aus dem OSM-Netz
const winkelGrad = (a: P, b: P) => Math.acos(Math.max(-1, Math.min(1, dot(einheit(a), einheit(b))))) / GRAD

/** Von start auf dem Weg wid weiter zum Knoten-Index idx (Richtung walk), höchstens L m; am Wegende auf dem Strassenarm, der höchstens
 *  ACHSE_WEITER_GRAD abbiegt (auch durch eine Kreuzung), sonst Ende */
function gehen(netz: OsmNetz, wid: number, idx: number, walk: number, start: P, L: number): P[] {
  const pts: P[] = [start]
  let acc = 0
  const besucht = new Set<number>([wid])
  for (let n = 0; n < 500; n++) {
    const nds = netz.w(wid).nds
    if (idx < 0 || idx >= nds.length) {
      // Richtung am Wegende: letzte Strecke des Wegs in Gehrichtung
      const ende = nds[idx - walk], j = idx - 2 * walk
      if (j < 0 || j >= nds.length) return pts
      const d = einheit(sub(netz.p(ende), netz.p(nds[j])))
      if (!d[0] && !d[1]) return pts
      let best: [number, number, number] | null = null, bw = ACHSE_WEITER_GRAD
      for (const arm of netz.strassenarme(ende)) {
        if (besucht.has(arm[0])) continue
        const w = winkelGrad(netz.armRichtung(arm), d)
        if (w <= bw) { bw = w; best = arm }
      }
      if (!best) return pts
      wid = best[0]; walk = best[2]; idx = best[1] + walk
      besucht.add(wid)
      continue
    }
    const p = netz.p(nds[idx]), a = pts[pts.length - 1], l = dist(a, p)
    if (l > 0 && acc + l >= L) { pts.push(add(a, sub(p, a), (L - acc) / l)); return pts }
    acc += l
    if (l > 1e-6) pts.push(p)
    idx += walk
  }
  return pts
}

/**
 * Achse des Bordmodells am Punkt c auf dem OSM-Weg wid (Strecke k: Knoten k → k+1): ± halb m entlang des Wegs, am Wegende auf dem
 * geradesten Strassenarm weiter (höchstens ACHSE_WEITER_GRAD), in Wegrichtung. Beispiel: Weg (−200, 0)–(200, 0), c (0, 0) →
 * (−30, 0)…(30, 0).
 */
export function achseAmWeg(netz: OsmNetz, wid: number, k: number, c: P, halb = BORD_ACHSE_M): P[] {
  const vor = gehen(netz, wid, k + 1, +1, c, halb), zur = gehen(netz, wid, k, -1, c, halb)
  const aus = [...zur.slice(1).reverse(), c, ...vor.slice(1)]
  return aus.filter((p, i) => i === 0 || dist(p, aus[i - 1]) > 0.01)
}

/**
 * Gequerter befahrbarer OSM-Weg (mfz bzw. Bus) eines Streifens p0–p1: die Strecke, die die Achse (je Ende um 3 m verlängert) schneidet,
 * mit dem Schnitt am nächsten bei der Mitte; sonst der nächste Weg bis maxM von der Mitte. → Weg, Strecke und Punkt auf dem Weg
 */
export function wegAmStreifen(netz: OsmNetz, p0: P, p1: P, maxM = 15): { wid: number; k: number; q: P } | null {
  const m: P = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], n = einheit(sub(p1, p0))
  const a0 = add(p0, n, -3), e = sub(add(p1, n, 3), a0)
  let schnitt: { wid: number; k: number; q: P; d: number } | null = null
  let naechst: { wid: number; k: number; q: P; d: number } | null = null
  for (const [wid, w] of netz.W) {
    if (!(w.mfz || w.bus)) continue
    for (let k = 0; k < w.nds.length - 1; k++) {
      const a = netz.p(w.nds[k]), v = sub(netz.p(w.nds[k + 1]), a), l2 = dot(v, v)
      if (l2 === 0) continue
      const den = v[0] * e[1] - v[1] * e[0]
      if (Math.abs(den) > 1e-12) {
        const w0 = sub(a0, a), t = (w0[0] * e[1] - w0[1] * e[0]) / den, u = (w0[0] * v[1] - w0[1] * v[0]) / den
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
          const q = add(a, v, t), d = dist(q, m)
          if (schnitt === null || d < schnitt.d) schnitt = { wid, k, q, d }
        }
      }
      const t = Math.max(0, Math.min(1, dot(sub(m, a), v) / l2)), q = add(a, v, t), d = dist(m, q)
      if (d <= maxM && (naechst === null || d < naechst.d)) naechst = { wid, k, q, d }
    }
  }
  const x = schnitt ?? naechst
  return x ? { wid: x.wid, k: x.k, q: x.q } : null
}

/** Abstand von p zur Polylinie und deren Richtung dort */
function lageZurLinie(p: P, linie: readonly P[]): { d: number; r: P } {
  let d = Infinity, r: P = [1, 0]
  for (let i = 1; i < linie.length; i++) {
    const a = linie[i - 1], v = sub(linie[i], a), l2 = dot(v, v)
    if (l2 === 0) continue
    const t = Math.max(0, Math.min(1, dot(sub(p, a), v) / l2)), x = dist(p, add(a, v, t))
    if (x < d) { d = x; r = einheit(v) }
  }
  return { d, r }
}

/**
 * Abzweigungen entlang einer Linie (Plan A6, Punkt 4): OSM-Knoten höchstens ABZW_NAH_M von der Linie mit mindestens drei Strassenarmen;
 * je Arm, der um mehr als ABZW_WINKEL_GRAD von der Linie abweicht, eine Abzweigung mit Punkt ABZW_ARM_M auf dem Arm.
 */
export function abzweigungenEntlang(netz: OsmNetz, linie: readonly P[]): Abzweigung[] {
  if (linie.length < 2) return []
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of linie) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) }
  const knoten = new Set<number>()
  for (const [, w] of netz.W) {
    if (!w.v2) continue
    for (const n of w.nds) {
      const p = netz.p(n)
      if (p[0] >= x0 - ABZW_NAH_M && p[0] <= x1 + ABZW_NAH_M && p[1] >= y0 - ABZW_NAH_M && p[1] <= y1 + ABZW_NAH_M) knoten.add(n)
    }
  }
  const aus: Abzweigung[] = []
  for (const n of [...knoten].sort((a, b) => a - b)) {
    const p = netz.p(n), lz = lageZurLinie(p, linie)
    if (lz.d > ABZW_NAH_M) continue
    const arme = netz.strassenarme(n)
    if (arme.length < 3) continue
    for (const arm of arme) {
      const w = winkelGrad(netz.armRichtung(arm), lz.r)
      if (Math.min(w, 180 - w) > ABZW_WINKEL_GRAD) aus.push({ p, arm: netz.armPunkt(arm, ABZW_ARM_M) })
    }
  }
  return aus
}

// ---------------------------------------------------------------- Quelle der Bordmodelle
// Zwischenspeicher je AV-Liste (kontextBauen baut für dieselbe AV mehrere Kontexte): Schlüssel Achse und Abzweigungen
const SPEICHER = new WeakMap<readonly AvFlaeche[], Map<string, Bordmodell>>()
const schluessel = (pts: readonly P[]) => pts.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(';')

/** Bordmodelle aus der AV des Kontexts (Strasse_Weg und die Flächen dahinter), Abzweigungen aus dem OSM-Netz */
export class Bordquelle {
  /** AV mit Strassenfläche und mindestens einer Fläche, gegen die ein Bord gilt (sonst bleibt alles beim Rückfall) */
  readonly mitBord: boolean
  constructor(readonly av: readonly AvFlaeche[], readonly netz: OsmNetz | null) {
    this.mitBord = av.some(f => f.art === STRASSE_ART) && av.some(f => BORD_ARTEN.includes(f.art))
  }
  /** Bordmodell entlang der Achse (Abschnittsrichtung); Abzweigungen entlang osmLinie (sonst entlang der Achse). null ohne Bord */
  modell(achse: readonly P[], osmLinie: readonly P[] | null = null): Bordmodell | null {
    if (!this.mitBord || achse.length < 2) return null
    const abzweigungen = this.netz ? abzweigungenEntlang(this.netz, osmLinie ?? achse) : []
    const key = schluessel(achse) + '|' + abzweigungen.map(z => schluessel([z.p, z.arm!])).join(';')
    let c = SPEICHER.get(this.av)
    if (!c) { c = new Map(); SPEICHER.set(this.av, c) }
    let m = c.get(key)
    if (!m) {
      m = bordmodell({ flaechen: this.av, achse: [...achse], abzweigungen })
      if (c.size >= CACHE_MAX) c.clear()
      c.set(key, m)
    }
    return m
  }
}

// ---------------------------------------------------------------- Sehne gegen den Bord
/** Abstand entlang der Messlinie p + t·r zum Bord einer Seite: der erste Schnitt in Richtung r (t > 0); liegt p schon jenseits des
 *  Bords (Messpunkt neben der Fahrbahn), der nächste dahinter (t < 0, Abstand negativ). Höchstens SUCH_M, sonst null */
function bordAbstand(p: P, r: P, linien: readonly (readonly P[])[]): number | null {
  const ts = geradeSchnitte(p, r, linien).filter(t => Math.abs(t) <= SUCH_M)
  const vor = ts.find(t => t > 1e-6)
  if (vor !== undefined) return vor
  const hinter = ts.filter(t => t <= 1e-6)
  return hinter.length ? hinter[hinter.length - 1] : null
}

/**
 * Sehne quer zur Fahrt gegen den Bord: rechts bzw. links der nächste Schnitt der Messlinie mit dem Bord der Seite, höchstens bis zum Ende
 * der Fläche Strasse_Weg (eine Insel begrenzt); ohne Bord auf einer Seite dort die AV-Sehne (Rückfall). Liegt der Messpunkt neben der
 * Fahrbahn (schiefe OSM-Linie), ist der Abstand zum Bord auf dieser Seite negativ. Beispiel: Fahrbahn N −4…4 mit Fussweg in der Fläche
 * bei E 48,5…51,5 nach Norden, Fahrt nach Westen, p (50, 0), r (0, 1) → [4, 4] statt [12, 4].
 */
export class BordSehne implements SehnenQuelle {
  constructor(private readonly fahrbahn: Fahrbahn, private readonly rechts: readonly (readonly P[])[],
    private readonly links: readonly (readonly P[])[]) {}
  sehneHerkunft(p: P, r: P): { w: [number, number] | null; bord: boolean } {
    const poly = this.fahrbahn.sehne(p, r)
    const tr = bordAbstand(p, r, this.rechts), tl0 = bordAbstand(p, neg(r), this.links)
    const re = tr !== null ? (poly ? Math.min(poly[0], tr) : tr) : poly ? poly[0] : null
    const li = tl0 !== null ? (poly ? Math.min(poly[1], tl0) : tl0) : poly ? poly[1] : null
    if (re === null || li === null) return { w: null, bord: false }
    return { w: [re, li], bord: tr !== null }
  }
  sehne(p: P, r: P): [number, number] | null { return this.sehneHerkunft(p, r).w }
  enthaelt(p: P): boolean { return this.fahrbahn.enthaelt(p) }
}

/**
 * Linien je Seite: 'rand' gemessener Rand (Fahrbahnbreite, Querdistanzen); 'fahrlinie' Führungslinie mit kurzen Lücken überbrückt (Lage
 * der Fahrlinie: über eine Einmündung gerade); 'streifen' gemessener Rand mit kurzen Lücken überbrückt (Streifenenden und Bordkanten am
 * Streifen: an einer Ecke oder Bucht am wirklichen Bord, über eine Fussweg- oder Einfahrtsmündung gerade)
 */
export function bordLinien(m: Bordmodell, seite: Seite, art: 'rand' | 'fahrlinie' | 'streifen'): P[][] {
  return art === 'rand' ? m.rand[seite].teile : schnittBord(m, seite, art === 'fahrlinie' ? 'fuehrung' : 'rand').teile
}

/** Seite des Bordmodells rechts der Fahrt: Achse in Richtung a0 → a1, Normale nach rechts der Fahrt r */
const rechtsSeite = (m: Bordmodell, r: P): Seite => (dot(links(m.achse.richtungAnfang), r) >= 0 ? 'links' : 'rechts')
const andere = (x: Seite): Seite => (x === 'links' ? 'rechts' : 'links')

/** Richtung des gemessenen Rands der Seite an der Stelle, die q am nächsten liegt (höchstens BAND_M), sonst null */
function randRichtungBei(m: Bordmodell, seite: Seite, q: P): P | null {
  let best: P | null = null, bd = BAND_M
  for (const t of m.rand[seite].teile) for (let i = 1; i < t.length; i++) {
    const a = t[i - 1], v = sub(t[i], a), l2 = dot(v, v)
    if (l2 < 1e-6) continue
    const u = Math.max(0, Math.min(1, dot(sub(q, a), v) / l2)), d = dist(q, add(a, v, u))
    if (d < bd) { bd = d; best = einheit(v) }
  }
  return best
}

/** Normale am Punkt q senkrecht zum Bord (gleich gerichtet wie r): örtliche Randrichtung des Querschnitts, ohne Bordpunkt dort (Messpunkt
 *  neben der Fahrbahn) die Richtung des nächsten Bordstücks rechts bzw. links; null, wenn sie mehr als NORMALE_MAX_GRAD abweicht */
function bordNormale(m: Bordmodell, q: P, r: P, rechts: Seite): P | null {
  const Q = m.querschnitt(m.achse.station(q).s)
  const u = Q.richtung ?? randRichtungBei(m, rechts, q) ?? randRichtungBei(m, andere(rechts), q)
  if (!u) return null
  let n = links(u)
  if (dot(n, r) < 0) n = neg(n)
  return dot(n, r) >= Math.cos(NORMALE_MAX_GRAD * GRAD) ? n : null
}

/** Bord entlang einer Zufahrt: Messpunkte mit Normalen senkrecht zum Bord, Sehnen gegen den gemessenen Rand bzw. den Bord für Schnitte */
export interface BordZufahrt {
  modell: Bordmodell
  ref: RefPunkt[]               // Normalen senkrecht zum Bord, wo das Bordmodell eine Randrichtung hat (sonst die der OSM-Spur)
  rand: BordSehne               // gemessener Rand: Fahrbahnbreite und Querdistanzen
  fuehrung: BordSehne           // Bord für Schnitte: Lage der Fahrlinie (spur.amRandHalten)
  anteil: number                // Anteil der Messpunkte mit Bord rechts der Fahrt
  drehen: (ref: RefPunkt[]) => RefPunkt[]   // weitere Messpunkte derselben Spur senkrecht zum Bord drehen
}

/**
 * Bordmodell entlang der Messpunkte einer Zufahrt (ref: Punkte in Folge, Normale nach rechts der Fahrt). Achse = die Messpunkte, an
 * beiden Enden um ACHSE_ZUGABE_M gerade verlängert (der Rand endet senkrecht zur Achse; so reicht er bei schiefer Achse über den ersten
 * und letzten Messpunkt hinaus); Abzweigungen entlang der OSM-Linie osmLinie. null ohne Bord in der AV.
 */
export function bordZufahrt(q: Bordquelle, fahrbahn: Fahrbahn, ref: RefPunkt[], osmLinie: readonly P[] | null): BordZufahrt | null {
  if (!q.mitBord || ref.length < 2) return null
  const pkt = ref.map(x => x[0]).filter((p, i, a) => i === 0 || dist(p, a[i - 1]) > 0.05)
  if (pkt.length < 2) return null
  const d0 = einheit(sub(pkt[1], pkt[0])), d1 = einheit(sub(pkt[pkt.length - 1], pkt[pkt.length - 2]))
  const achse = [add(pkt[0], d0, -ACHSE_ZUGABE_M), ...pkt, add(pkt[pkt.length - 1], d1, ACHSE_ZUGABE_M)]
  const m = q.modell(achse, osmLinie)
  if (!m) return null
  const re = rechtsSeite(m, ref[0][1]), li = andere(re)
  const drehen = (rs: RefPunkt[]): RefPunkt[] => rs.map(([p, r]) => [p, bordNormale(m, p, r, re) ?? r] as RefPunkt)
  const neu = drehen(ref)
  const fuehrung = new BordSehne(fahrbahn, bordLinien(m, re, 'fahrlinie'), bordLinien(m, li, 'fahrlinie'))
  // Anteil der Messpunkte, an denen die Fahrlinie einen Bord rechts hat
  const anteil = neu.filter(([p, r]) => fuehrung.sehneHerkunft(p, r).bord).length / neu.length
  return { modell: m, ref: neu, rand: new BordSehne(fahrbahn, bordLinien(m, re, 'rand'), bordLinien(m, li, 'rand')), fuehrung, anteil, drehen }
}

/** Bord am Streifen: Linien beider Seiten für Schnitte (Enden, Bordkanten) und die Normale zum Bord in der Mitte (gerichtet wie p0→p1) */
export interface BordStreifen { achse: P[]; linien: P[][]; normale: P | null }

/**
 * Bordmodell am Streifen p0–p1: Achse = achse (vom Übergang: gequerter OSM-Weg), sonst der gequerte bzw. nächste befahrbare OSM-Weg
 * (wegAmStreifen), sonst eine Gerade quer zum Streifen (± BORD_ACHSE_M). null ohne Bord in der AV.
 */
export function bordAmStreifen(q: Bordquelle, p0: P, p1: P, achse: P[] | null = null): BordStreifen | null {
  if (!q.mitBord) return null
  const m: P = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], n = einheit(sub(p1, p0))
  let a = achse
  if (!a && q.netz) { const w = wegAmStreifen(q.netz, p0, p1); if (w) a = achseAmWeg(q.netz, w.wid, w.k, w.q) }
  if (!a || a.length < 2) { const u = links(n); a = [add(m, u, -BORD_ACHSE_M), add(m, u, BORD_ACHSE_M)] }
  return bordAnAchse(q, a, m, n)
}

/** Bord am Punkt m für eine Querlinie in Richtung n auf dem Bordmodell entlang der Achse a; null ohne Bord in der AV */
export function bordAnAchse(q: Bordquelle, a: P[], m: P, n: P): BordStreifen | null {
  const bm = q.modell(a)
  if (!bm) return null
  const Q = bm.querschnitt(bm.achse.station(m).s)
  let normale: P | null = null
  if (Q.richtung) { normale = links(Q.richtung); if (dot(normale, n) < 0) normale = neg(normale) }
  return { achse: a, linien: [...bordLinien(bm, 'links', 'streifen'), ...bordLinien(bm, 'rechts', 'streifen')], normale }
}
