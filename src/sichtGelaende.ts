// ── Sicht auf die Wartefläche mit Gelände (Höhenmodell swissALTI3D © swisstopo, in der Stadt Bern DTM 2023 der Stadt) ──
//
// Die Rechnung (rechner/pruefen.ts: sichtfeld, konflikteSuchen) prüft die Sicht von den Sichtpunkten auf die Wartefläche
// (VSS 40 241 Z. 14, S. 6, mit Tab. 1) in 2D: Gebäude, Parkfelder, Bäume, Hindernisse. Kuppen und andere Geländeformen kennt sie nicht.
// Danach prüft die App je Zufahrt (gerade und abbiegend, alle mit Sichtpunkten) das Gelände entlang einzelner Sichtlinien, nachgelagert
// wie die Erkennungsdistanz (erkennungGelaende.ts, derselbe Profil-Dienst daten/sichtProfil.ts, dieselbe Prüfung gelaendeFrei):
// - Augpunkte: auf den Sichtpunkten der 2D-Rechnung, Abstand x entlang der Sichtpunkte ab dem ersten (am Streifenrand), alle
//   SICHT_LINIEN_ABSTAND_M bis zur Soll-Sichtweite und der Punkt an der Soll-Sichtweite selbst (bzw. am letzten Sichtpunkt, wenn die
//   Sichtpunkte kürzer sind: Querung ohne Vortritt über die Reichweite, Spur endet im Gebäude). Augpunkt AUGHOEHE_M (1,0 m, VSS 40 241 Ziffer 14, S. 6) über dem Boden.
// - Ziel: die Ecken der beiden Warteflächen (Annäherungsbereiche, StreifenErgebnis.ann), die auch das 2D-Sichtfeld aufspannen. Je
//   Augpunkt EINE Sichtlinie zum ungünstigsten Zielpunkt (Annahme): zur Ecke, die am stärksten von der Fahrtrichtung abweicht (äusserer
//   Rand des Sichtkeils; diese Linie verläuft am weitesten neben der Fahrbahn, z. B. über die Innenseite einer Kurve). Eine Linie je
//   Augpunkt hält die Abfragen klein; eine Kuppe auf der Fahrbahn schneidet alle Linien eines Augpunkts ähnlich. Ziel
//   ZIEL_HOEHE_WARTE_M über dem Boden in der MITTE der Wartefläche, nicht genau an der Ecke (Annahme: die Person steht auf dem
//   Trottoir; fällt das Gelände unmittelbar an der Ecke ab, z. B. zur Aare am Klösterlistutz in Bern, lag das Ziel sonst im Hang und
//   die Trottoirkante verdeckte es). Die Höhe der Mitte kommt aus einer Abfrage je Wartefläche (erster Punkt des Profils Mitte → Ecke).
//   Toleranz des Dienstes wie bei der Erkennung (GELAENDE_TOL_M für swissALTI3D).
// - Abfragen je Zufahrt: eine je Sichtlinie (höchstens 11 bis 110 m, Reichweite der geladenen Daten), dazu VERFEINERN_GELAENDE
//   halbierende zwischen der letzten freien und der ersten geschnittenen Linie (10 m → 2,5 m): höchstens 13 (SICHT_ABFRAGEN_MAX 14);
//   dazu je Wartefläche, auf die eine Linie zielt, eine Abfrage für die Höhe ihrer Mitte (zählt nicht zu den 14).
// - Ergebnis: «Gelände frei» bzw. «Verdeckung im Geländemodell» mit letzter freier/erster verdeckter Prüflage (Rechenwert aus letzter freier Lage,
//   abgerundet). Liegt x unter der geprüften Länge, ist die Zufahrt nicht erfüllt: aus «frei» wird «verdeckt_gelaende» (ein 2D-Befund
//   «verdeckt …» bleibt als Status, das Gelände steht dann in der Zeile «Gelände» und im Befund des Bedarfs), «frei bis» höchstens x; der
//   Streifen zeigt den höchsten Status seiner Zufahrten (RANG_STATUS). Die 2D-Rechnung im Worker bleibt unverändert; ohne Antwort bleibt
//   sie mit «Gelände: nicht geprüft».
// - Brücken: das Höhenmodell kennt sie nicht; Sichtlinien mit Augpunkt bzw. Ziel auf einer Brücke (AV-Einzelobjekt) prüft die App nicht.
// Die Ergebnisse liegen je Zufahrt UND Lage der Linien (sichtGelaendeSchluessel, Prüfsumme über Sichtpunkte, Warteflächen und
// Brücken-Lage), nur in der Sitzung (nicht in der Fall-Datei).

import { add, dist, imPolygon, sub, type P } from './geo'
import type { Poly } from './rechner/poly'
import { RANG_STATUS, type SichtGelaendeAnzeige, type StreifenErgebnis, type ZufahrtErgebnis } from './rechner/typen'
import { GELAENDE_TOL_M, VERFEINERN_GELAENDE, gelaendeFrei, gelaendeName, xKey, pruefbereichText, type GelaendeErgebnis, type GelaendeStand, type ProfilLader } from './erkennungGelaende'

/** Ziel über dem Boden der Wartefläche (in ihrer Mitte) [m]: untere Grenze der Sichtfeldhöhe (Annahme) */
export const ZIEL_HOEHE_WARTE_M = 0.6
/** Mitte und Ecke so nah beieinander, dass die Höhe der Ecke gilt [m] (kein Profil über null Länge) */
const MITTE_MIN_M = 0.2
/** ein Augpunkt alle so viele Meter entlang der Sichtpunkte */
export const SICHT_LINIEN_ABSTAND_M = 10
/** Obergrenze der Höhenabfragen je Zufahrt (wie bei der Erkennungsdistanz) */
export const SICHT_ABFRAGEN_MAX = 14
/** Status einer Zufahrt, deren Sicht auf die Wartefläche nur das Gelände verdeckt */
export const STATUS_GELAENDE = 'verdeckt_gelaende'
/** Fahrtrichtung am Augpunkt: Richtung zu dem Punkt so weit näher am Streifen [m] */
const FAHRT_M = 2

type Bruecke = { enthaelt(p: P): boolean } | null | undefined
/** Geometrie der Prüfung einer Zufahrt: Sichtpunkte mit ihrem Abstand ab dem ersten, geprüfte Länge, Zielpunkte und je Zielpunkt die
 *  Mitte seiner Wartefläche (gleiche Reihenfolge) */
export interface SichtGeo { sp: P[]; cum: number[]; bis: number; ziele: P[]; mitten: P[] }
/** Sichtlinie vom Augpunkt (Abstand x) zum ungünstigsten Zielpunkt; mitte: Mitte der Wartefläche des Ziels (Höhe des Ziels);
 *  bruecke: Augpunkt bzw. Ziel auf einer Brücke (nicht prüfbar) */
export interface SichtLinieGelaende { x: number; auge: P; ziel: P; mitte?: P; bruecke?: true }

/** Punkt in der Mitte einer Wartefläche, der sicher in ihr liegt: Schwerpunkt der Ecken, sonst (gebogene Fläche) die Mitte
 *  zwischen gegenüberliegenden Ecken des Rings, die ihm am nächsten liegt; sonst die Ecke, die ihm am nächsten liegt */
export function warteMitte(poly: Poly): P | null {
  const r = poly[0] ?? []
  if (!r.length) return null
  const s: P = [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length]
  if (imPolygon(s, poly)) return s
  let best: P | null = null
  for (let i = 0; i < Math.floor(r.length / 2); i++) {
    const m: P = [(r[i][0] + r[r.length - 1 - i][0]) / 2, (r[i][1] + r[r.length - 1 - i][1]) / 2]
    if (imPolygon(m, poly) && (!best || dist(m, s) < dist(best, s))) best = m
  }
  return best ?? r.reduce((b, p) => (dist(p, s) < dist(b, s) ? p : b), r[0])
}

/** Zielpunkte mit der Mitte ihrer Wartefläche: Ecken der äusseren Ringe (ohne Doppel; bei Doppel gilt die erste Wartefläche) */
export function warteZieleMitMitte(ann: readonly Poly[]): { ziele: P[]; mitten: P[] } {
  const ziele: P[] = [], mitten: P[] = [], da = new Set<string>()
  for (const poly of ann) {
    const m = warteMitte(poly)
    for (const p of poly[0] ?? []) {
      const k = `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`
      if (!da.has(k)) { da.add(k); ziele.push(p); mitten.push(m ?? p) }
    }
  }
  return { ziele, mitten }
}

/** Zielpunkte: Ecken der äusseren Ringe der Warteflächen (ohne Doppel) */
export const warteZiele = (ann: readonly Poly[]): P[] => warteZieleMitMitte(ann).ziele

/** Geometrie einer Zufahrt; null ohne Sichtpunkte bzw. Warteflächen */
export function sichtGeo(z: Pick<ZufahrtErgebnis, 'sichtpunkte' | 'sichtweite'>, ann: readonly Poly[]): SichtGeo | null {
  const sp = z.sichtpunkte, { ziele, mitten } = warteZieleMitMitte(ann)
  if (sp.length < 2 || !ziele.length) return null
  const cum = [0]
  for (let i = 1; i < sp.length; i++) cum.push(cum[i - 1] + dist(sp[i - 1], sp[i]))
  const bis = Math.min(z.sichtweite, cum[cum.length - 1])
  return bis > 1e-6 ? { sp, cum, bis, ziele, mitten } : null
}

/** Punkt beim Abstand x entlang der Sichtpunkte */
function punktBei(g: SichtGeo, x: number): P {
  const { sp, cum } = g
  for (let i = 1; i < sp.length; i++) {
    if (x > cum[i] + 1e-9 && i < sp.length - 1) continue
    const l = cum[i] - cum[i - 1]
    return l > 0 ? add(sp[i - 1], sub(sp[i], sp[i - 1]), Math.max(0, Math.min(1, (x - cum[i - 1]) / l))) : sp[i]
  }
  return sp[sp.length - 1]
}

/** Fahrtrichtung am Augpunkt (zum Streifen hin, Einheitsvektor) */
function fahrtBei(g: SichtGeo, x: number): P {
  const L = g.cum[g.cum.length - 1], x1 = Math.min(L, Math.max(x, FAHRT_M)), x0 = Math.max(0, x1 - FAHRT_M)
  const d = sub(punktBei(g, x0), punktBei(g, x1)), l = Math.hypot(d[0], d[1])
  return l > 0 ? [d[0] / l, d[1] / l] : [0, 0]
}

/** ungünstigster Zielpunkt vom Augpunkt: grösster Winkel zur Fahrtrichtung (bei gleichem der erste) */
export function zielBei(auge: P, fahrt: P, ziele: readonly P[]): P {
  let best = ziele[0], bw = -Infinity
  for (const z of ziele) {
    const v = sub(z, auge)
    const w = Math.atan2(Math.abs(fahrt[0] * v[1] - fahrt[1] * v[0]), fahrt[0] * v[0] + fahrt[1] * v[1])
    if (w > bw + 1e-9) { bw = w; best = z }
  }
  return best
}

/** Sichtlinie beim Abstand x */
export function linieBei(g: SichtGeo, x: number, bruecke?: Bruecke): SichtLinieGelaende {
  const auge = punktBei(g, x), ziel = zielBei(auge, fahrtBei(g, x), g.ziele), mitte = g.mitten[g.ziele.indexOf(ziel)]
  return { x: Math.round(x * 100) / 100, auge, ziel, ...(mitte ? { mitte } : {}),
    ...(bruecke && (bruecke.enthaelt(auge) || bruecke.enthaelt(ziel)) ? { bruecke: true as const } : {}) }
}

/** Sichtlinien der ersten Runde: x = 10, 20 … unter der geprüften Länge, dazu diese selbst */
export function sichtLinien(g: SichtGeo, bruecke?: Bruecke): SichtLinieGelaende[] {
  const xs: number[] = []
  for (let x = SICHT_LINIEN_ABSTAND_M; x < g.bis - 1e-6; x += SICHT_LINIEN_ABSTAND_M) xs.push(x)
  xs.push(g.bis)
  return xs.map(x => linieBei(g, x, bruecke))
}

/** Prüfsumme der Geometrie (Lage auf 0,1 m), der geprüften Länge und der Brücken-Lage der Linien; «zm»: Zielhöhe aus der Mitte der
 *  Wartefläche (Ergebnisse mit der Höhe an der Ecke aus derselben Sitzung gelten nicht mehr) */
function pruefsumme(g: SichtGeo, bruecke?: Bruecke): string {
  const r = (p: P) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`
  const text = `zm|${xKey(g.bis)}|${g.sp.map(r).join(';')}|${g.ziele.map(r).join(';')}|${sichtLinien(g, bruecke).map(l => (l.bruecke ? 1 : 0)).join('')}`
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16)
}

/** Schlüssel der Geländeprüfung einer Zufahrt «fgsId|zufahrt|sicht|Prüfsumme»; null ohne Sichtpunkte bzw. Warteflächen */
export function sichtGelaendeSchluessel(z: Pick<ZufahrtErgebnis, 'fgsId' | 'zufahrt' | 'sichtpunkte' | 'sichtweite'>, ann: readonly Poly[],
  bruecke?: Bruecke): string | null {
  const g = sichtGeo(z, ann)
  return g ? `${z.fgsId}|${z.zufahrt}|sicht|${pruefsumme(g, bruecke)}` : null
}

/**
 * Gelände entlang der Sichtlinien bis zur geprüften Länge (Ablauf oben). Wirft, wenn ein Profil der ersten Runde fehlt (die Rechnung
 * bleibt dann 2D); fehlt ein Profil der Verfeinerung, gilt die letzte freie Lage. Ein Abbruch wird weitergereicht.
 */
export async function sichtGelaendePruefen(g: SichtGeo, laden: ProfilLader, bruecke?: Bruecke, tol = GELAENDE_TOL_M):
  Promise<GelaendeErgebnis> {
  const kand = sichtLinien(g, bruecke).filter(l => !l.bruecke)
  // Boden in der Mitte der Wartefläche: eine Abfrage je Mitte (Profil Mitte → Ecke, erster Punkt), für alle Linien dorthin
  const boden = new Map<string, Promise<number | null>>()
  const bodenMitte = (l: SichtLinieGelaende): Promise<number | null> => {
    const m = l.mitte
    if (!m || dist(m, l.ziel) < MITTE_MIN_M) return Promise.resolve(null)
    const key = `${m[0]},${m[1]}`
    let h = boden.get(key)
    if (!h) { h = laden(m, l.ziel).then(p => (p.length && Number.isFinite(p[0].h) ? p[0].h : null)); boden.set(key, h) }
    return h
  }
  const zielBoden: Record<string, number> = {}
  /** frei mit dem Ziel über dem Boden der Mitte (ohne Mitte: über dem Boden an der Ecke, dem letzten Profilpunkt) */
  const pruefe = async (l: SichtLinieGelaende, p: Parameters<typeof gelaendeFrei>[0]) => {
    if (!p.length) return null
    const hMitte = await bodenMitte(l)
    const mitMitte = hMitte === null ? p : [...p.slice(0, -1), { ...p[p.length - 1], h: hMitte }]
    zielBoden[xKey(l.x)] = mitMitte[mitMitte.length - 1].h
    return gelaendeFrei(mitMitte, tol, ZIEL_HOEHE_WARTE_M)
  }
  const res = await Promise.all(kand.map(l => laden(l.auge, l.ziel).then(async p => {
    const f = await pruefe(l, p)
    if (f === null) throw new Error('Höhenprofil ohne Höhen')
    return f
  })))
  const frei: Record<string, boolean> = {}
  kand.forEach((l, i) => { frei[xKey(l.x)] = res[i] })
  let abfragen = kand.length
  const k = res.indexOf(false)
  const mitBoden = () => (Object.keys(zielBoden).length ? { zielBoden } : {})
  if (k < 0) return { abM: null, frei, abfragen, ...mitBoden() }
  let lo = k ? kand[k - 1].x : 0, hi = kand[k].x
  let letzteFreiM: number | null = k ? lo : null
  for (let i = 0; i < VERFEINERN_GELAENDE && abfragen < SICHT_ABFRAGEN_MAX; i++) {
    const m = (lo + hi) / 2, q = linieBei(g, m, bruecke)
    if (q.bruecke) break
    abfragen++
    let f: boolean | null
    try { f = await pruefe(q, await laden(q.auge, q.ziel)) } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err
      break
    }
    if (f === null) break
    if (f) { lo = m; letzteFreiM = m } else hi = m
  }
  return { abM: Math.floor(lo + 1e-6), frei, abfragen, ...mitBoden(), pruefbereich: { letzteFreiM, ersteVerdecktM: hi } }
}

/** Anzeige der Geländeprüfung einer Zufahrt aus dem Stand (werte je sichtGelaendeSchluessel); undefined ohne prüfbare Geometrie */
export function sichtGelaendeAnzeige(z: Pick<ZufahrtErgebnis, 'fgsId' | 'zufahrt' | 'sichtpunkte' | 'sichtweite'>, ann: readonly Poly[],
  werte: Readonly<Record<string, GelaendeStand>> | null | undefined, bruecke?: Bruecke): SichtGelaendeAnzeige | undefined {
  const g = sichtGeo(z, ann)
  if (!g) return undefined
  const st = werte?.[`${z.fgsId}|${z.zufahrt}|sicht|${pruefsumme(g, bruecke)}`]
  if (!st || st.stand !== 'ok') return { stand: st?.stand === 'laedt' ? 'laedt' : 'ohne', abM: null, bisM: g.bis, linien: [] }
  if (!st.abfragen) return { stand: 'bruecke', abM: null, bisM: g.bis, linien: [] }
  return { stand: 'mit', abM: st.abM !== null && st.abM < g.bis - 1e-6 ? st.abM : null, bisM: g.bis,
    ...(st.pruefbereich ? { pruefbereich: st.pruefbereich } : {}), ...(st.quelle ? { quelle: st.quelle } : {}),
    linien: sichtLinien(g, bruecke).map(l => {
      const hB = l.bruecke ? undefined : st.zielBoden?.[xKey(l.x)]
      return { ...l, frei: l.bruecke ? null : st.frei[xKey(l.x)] ?? null, ...(hB !== undefined ? { zielBodenH: hB } : {}) }
    }) }
}

/** Zufahrt mit dem Ergebnis der Geländeprüfung: Anzeige (sichtGelaende) und, wenn das Gelände die Sicht vor der geprüften Länge
 * verdeckt, Status (frei → verdeckt_gelaende, ein 2D-Befund bleibt) und «frei bis» (höchstens abM) */
export function zufahrtMitGelaende(z: ZufahrtErgebnis, ann: readonly Poly[], werte: Readonly<Record<string, GelaendeStand>> | null | undefined,
  bruecke?: Bruecke): ZufahrtErgebnis {
  const a = sichtGelaendeAnzeige(z, ann, werte, bruecke)
  if (!a) return z
  if (a.abM === null) return { ...z, sichtGelaende: a }
  const status = z.status === 'frei' ? STATUS_GELAENDE : z.status
  return { ...z, sichtGelaende: a, status, freiBisM: Math.min(z.freiBisM ?? Math.floor(a.bisM + 1e-6), a.abM) }
}

/** Status eines Streifens aus seinen Zufahrten (höchster Rang), wie die Rechnung; andere Status (kein FGS, ohne Zufahrt) bleiben */
export function streifenStatusNeu(s: Pick<StreifenErgebnis, 'status' | 'zufahrten'>): string {
  if (!(s.status in RANG_STATUS) || !s.zufahrten.length) return s.status
  return s.zufahrten.reduce((b, e) => ((RANG_STATUS[e.status] ?? 0) > (RANG_STATUS[b] ?? 0) ? e.status : b), 'frei')
}

/** Rechnung zum Zeigen: Zufahrten aller Streifen (ohne Trottoirüberfahrt und «kein FGS») mit der Geländeprüfung, Status der Streifen
 * neu; null bleibt null. Die Rechnung selbst bleibt unverändert */
export function rechnungMitSichtGelaende<R extends { streifen: StreifenErgebnis[] }>(r: R | null, werte: Readonly<Record<string, GelaendeStand>> | null | undefined,
  bruecke?: Bruecke): R | null {
  if (!r) return r
  return { ...r, streifen: r.streifen.map(s => {
    if (s.trottoirueberfahrt || s.status === 'kein_fgs') return s
    const zufahrten = s.zufahrten.map(z => zufahrtMitGelaende(z, s.ann, werte, bruecke))
    return { ...s, zufahrten, status: streifenStatusNeu({ status: s.status, zufahrten }) }
  }) }
}

/** Gleicher Modellbefund für Sichtprüfung und Bericht; Prüflagen nie als genaue Sichtgrenze darstellen. */
export function sichtGelaendeText(a: Pick<SichtGelaendeAnzeige, 'stand' | 'abM' | 'linien' | 'pruefbereich' | 'quelle'>): string {
  if (a.stand === 'laedt') return 'Geländemodell: lädt'
  if (a.stand === 'ohne') return 'Geländemodell: nicht geprüft'
  if (a.stand === 'bruecke') return 'Geländemodell: nicht prüfbar (Brücke)'
  if (a.abM !== null) return `${gelaendeName(a.quelle)}: Verdeckung; ${a.pruefbereich ? pruefbereichText(a.pruefbereich) : `abgerundeter Rechenwert ${a.abM} m, genaue Prüflagen nicht verfügbar`}`
  return `Geländemodell: geprüfte Sichtlinien frei${a.linien.some(l => l.bruecke) ? ' (Sichtlinien auf der Brücke nicht geprüft)' : ''}`
}
/** Bericht: Zeile der Geländeprüfung im gleichen Aufbau wie die Grundrisszeile («Prüfart: Wartefläche …») */
export function sichtGelaendeBerichtText(a: Pick<SichtGelaendeAnzeige, 'stand' | 'abM' | 'linien' | 'pruefbereich' | 'quelle'>): string {
  const kopf = 'Geländemodell (Kuppen, Senken)'
  if (a.stand === 'laedt') return `${kopf}: lädt`
  if (a.stand === 'ohne') return `${kopf}: nicht geprüft`
  if (a.stand === 'bruecke') return `${kopf}: nicht prüfbar (Brücke)`
  if (a.abM !== null) return `${kopf}: Wartefläche verdeckt; ${a.pruefbereich ? pruefbereichText(a.pruefbereich) : `abgerundeter Rechenwert ${a.abM} m, genaue Prüflagen nicht verfügbar`}`
  return `${kopf}: Wartefläche frei${a.linien.some(l => l.bruecke) ? ' (Sichtlinien auf der Brücke nicht geprüft)' : ''}`
}
/** Tooltip der Zeile */
export const SICHT_GELAENDE_TITEL = 'Geländemodell (Kuppen, Senken, Böschungen) zwischen Fahrlinie und Wartefläche: nach der Rechnung entlang ' +
  'einzelner Sichtlinien (alle 10 m bis zur nötigen Sicht) aus dem Höhenmodell (swissALTI3D, in der Stadt Bern DTM 2023) geprüft, Auge 1,0 m (VSS 40 241 Ziffer 14, S. 6) ' +
  'und Ziel 0,60 m über dem Boden in der Mitte der Wartefläche (Annahme); verdeckt es die Sicht vor der nötigen Sicht, ist die Zufahrt verdeckt. Ohne Antwort gilt die Rechnung in 2D ' +
  '(«Geländemodell: nicht geprüft»). Die genannten Positionen sind Fahrzeugpositionen entlang der Fahrlinie, keine genaue Sichtgrenze.'
/** Tooltip einer geländeverdeckten Sichtlinie auf der Karte */
export const sichtGelaendeLinieText = (x: number, quelle?: string): string =>
  `Sichtlinie ${Math.round(x)} m vor dem Streifen auf die Wartefläche: im ${gelaendeName(quelle)} verdeckt`
