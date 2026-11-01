// ── Erkennungsdistanz aus dem Sichtrechner (Nutzerentscheid 23.10.2026) ──
//
// Ab welcher Distanz sehen Fahrende einer geraden Zufahrt die Markierung des Streifens auf der Fahrbahn? Zusätzliches Ausgabefeld
// (ZufahrtErgebnis.erkennungM), ohne Einfluss auf Status, Soll, Sichtfeld, «frei bis» und Konflikte der Sichtprüfung.
// - Augpunkte: die Sichtpunkte der Sichtprüfung (ab dem Streifenrand), dahinter auf einer nur für die Erkennung verlängerten
//   Fahrlinie (gleiche Herleitung wie die Spur, längere Reichweite; pruefen.ts) mit der seitlichen Lage des letzten Sichtpunkts.
//   Abstand x entlang der Fahrlinie ab dem ersten Sichtpunkt. Alle geraden Zufahrten einheitlich bis ERKENNUNG_MAX_M (Reichweite der
//   geladenen Daten, wie REICHWEITE_SICHT_M; Prüfung 23.10.2026: so verdrängt die Untergrenze einer langsameren Zufahrt keinen
//   gerechneten Wert einer schnelleren) bzw. bis zum Ende der Fahrlinie (Knoten ohne gerade Fortsetzung, Wegende, Kreisel, Spurende
//   im Gebäude).
// - Ziel: die Markierung im eigenen Fahrstreifen, Punkte auf dem vorderen Rand und der Achse des Streifens bis ZIEL_HALB_M
//   beidseits des ersten Sichtpunkts (innerhalb der Streifenenden). Sichtbar ist der Streifen, wenn die Sichtlinie zu
//   mindestens einem Zielpunkt frei ist (nächster sichtbarer Teil der Balken).
// - Hindernisse: Gebäude (AV), Hecken, Mauern und übrige sichtbehindernde Hindernisse, Bäume (Stamm) und Auto-Parkfelder
//   (Nutzerentscheid 23.10.2026, wie in der Sichtprüfung: Augpunkt 1,0 m (AUGHOEHE_M), Auto rund 1,5 m hoch, die Markierung liegt am
//   Boden).
//   Wie in der Sichtprüfung zählen ein Gebäude, Hindernis bzw. Parkfeld, in dem der Augpunkt liegt, und ein Baum bis 1 m am
//   Augpunkt nicht.
// - Erkennungsdistanz: grösste Distanz, ab der die Sicht durchgehend bis zum Streifen frei ist (vom Streifen aus gesucht, zwischen
//   dem letzten freien und dem ersten verdeckten Augpunkt halbierend verfeinert), abgerundet auf ganze Meter.
// - Sichtlinien (30.10.2026, zusätzliches Ausgabefeld ZufahrtErgebnis.erkennungLinien, ohne Wirkung auf die Erkennungsdistanz): dünn,
//   ein Augpunkt alle LINIEN_ABSTAND_M ab dem Streifenrand bis zum letzten Augpunkt (dazu dieser), zwischen zwei Augpunkten gerade
//   eingeschoben, je mit dem genutzten Zielpunkt (dem ersten freien, sonst dem ersten) und dem Befund. Die Karte zeigt sie auf Klick.
// - Bewuchs (30.10.2026, Nutzerentscheid): kreuzt jede freie Sichtlinie eines Augpunkts AV-Bodenbedeckung mit Bewuchs (BEWUCHS_ARTEN;
//   eine Fläche, in der Augpunkt bzw. Ziel liegt, zählt nicht), ist die Sicht dort nicht sicher frei: bewuchsAb nennt die Distanz, ab
//   der das gilt (wie die Erkennungsdistanz vom Streifen aus gesucht und halbierend verfeinert), solange sie unter der
//   Erkennungsdistanz liegt. Das ist kein Befund «verdeckt»: wert bleibt; die Vorbelegung nimmt den sicher freien Teil.
// Grenzen: 2D, ohne Kuppen und Senken; nur die Markierung, die blaue Tafel (Signal 4.11) nicht. Das Ergebnis ist eine Annahme
// («Sichtrechner, ohne Gelände»). Das Gelände prüft die App danach entlang der Sichtlinien mit dem Höhenmodell (erkennungGelaende.ts:
// Augpunkt AUGHOEHE_M über dem Gelände, Ziel die Markierung am Boden); Sichtlinien mit Augpunkt bzw. Ziel auf einer Brücke
// (AV-Einzelobjekt) sind dort nicht prüfbar (bruecke), das Höhenmodell kennt keine Brücken.

import { type P, add, dist, dot, einheit, sub, segSchnitt } from '../geo'
import type { Flaechen, Gebaeude, Teil } from './flaechen'
import { type HindernisDaten, linieTrifft } from './hindernisse'
import { enthaelt, type Multi } from './poly'
import { REICHWEITE_SICHT_M } from './ohneVortritt'
import { projektion } from './spur'

/** so weit geprüft [m ab dem Streifenrand entlang der Fahrlinie]: Reichweite der geladenen Daten (110 m) */
export const ERKENNUNG_MAX_M = REICHWEITE_SICHT_M
/** nötige Erkennungsdistanz als Vielfaches der Sichtweite (VSS 40 241 Z. 15, S. 9 (doppelte Sichtweite als Soll, Sichtweite als Mindestmass); Vorbelegung) */
export const ERKENNUNG_FAKTOR = 2
/** Zielpunkte bis so weit beidseits des ersten Sichtpunkts entlang der Streifenachse (halber Fahrstreifen, Annahme) */
export const ZIEL_HALB_M = 1.5
const ZIEL_VERSATZ = [0, -0.5, 0.5, -1, 1].map(f => f * ZIEL_HALB_M)
/** AV-Bodenbedeckung mit Bewuchs (Art im WFS von geodienste.ch): Sicht darüber nicht sicher frei (Höhe und Dichte unbekannt) */
export const BEWUCHS_ARTEN = ['geschlossener_Wald', 'Wytweide_dicht', 'uebrige_bestockte', 'Gartenanlage']
export const BEWUCHS_NAME: Record<string, string> = { geschlossener_Wald: 'geschlossener Wald', Wytweide_dicht: 'Wytweide dicht',
  uebrige_bestockte: 'übrige bestockte Fläche', Gartenanlage: 'Gartenanlage' }
/** Augpunkt über der Fahrbahn [m] (Normwert (VSS 40 241 Ziffer 14, S. 6; VSS 40 273 Ziffer 10, S. 7: Personenwagen), Entscheid
 * 31.10.2026, vorher 1,1 m als Annahme; Geländeprüfung der Sichtlinien in erkennungGelaende.ts und sichtGelaende.ts) */
export const AUGHOEHE_M = 1.0
/** Baum näher am Augpunkt zählt nicht (wie konflikteSuchen) */
const BAUM_AUGE_M = 1.0
/** Schritte der halbierenden Suche zwischen dem letzten freien und dem ersten verdeckten Augpunkt */
const VERFEINERN = 6
/** Sichtlinien zum Zeigen: ein Augpunkt alle so viele Meter ab dem Streifenrand (dünn) */
export const LINIEN_ABSTAND_M = 10

export type ErkennungBis = 'frei' | 'fahrlinie_endet' | 'verdeckt'
export type ErkennungEnde = 'knoten' | 'wegende' | 'gebaeude' | 'kreisel'
/** gelaende: nur in der Anzeige nach der Geländeprüfung (erkennungGelaende.ts), nie aus der Rechnung */
export interface ErkennungHindernis { klasse: 'gebaeude' | 'baum' | 'hindernis' | 'auto' | 'gelaende'; name: string; id?: string }
/** Erkennungsdistanz einer geraden Zufahrt [m ab dem Streifenrand]. bis frei: bis zur Prüfgrenze (ERKENNUNG_MAX_M) frei; fahrlinie_endet: frei bis zum Ende der Fahrlinie (wert ist eine Untergrenze, ende nennt den Grund); verdeckt: ab wert
 * verdeckt hindernis die Sicht */
export interface Erkennung {
  wert: number; bis: ErkennungBis; hindernis?: ErkennungHindernis; ende?: ErkennungEnde
  /** nur Anzeige (erkennungGelaende.erkennungAnzeige), nie aus der Rechnung: Gelände entlang der Sichtlinien geprüft (mit), Profile
   * laden noch (laedt) bzw. nicht geprüft (ohne) */
  gelaende?: 'mit' | 'laedt' | 'ohne'
  /** Bewuchs: ab hier [m, kleiner als wert] sieht man die Markierung nur über AV-Bodenbedeckung mit Bewuchs (Art bewuchs), nicht
   * sicher frei */
  bewuchsAb?: number; bewuchs?: string
}
/** Augpunkt: Lage und Abstand x ab dem Streifenrand entlang der Fahrlinie */
export interface Augpunkt { p: P; x: number }
export type LinienBefund = 'frei' | 'bewuchs' | 'verdeckt'
/** Sichtlinie vom Augpunkt (Abstand x ab dem Streifenrand) zum genutzten Zielpunkt der Markierung; grund: Name des Hindernisses;
 * bruecke: Augpunkt bzw. Ziel auf einer Brücke (Gelände nicht prüfbar); gelaende: nur Anzeige, Gelände geprüft (true frei, false
 * schneidet die Linie), fehlt: nicht geprüft */
export interface ErkennungLinie { x: number; auge: P; ziel: P; befund: LinienBefund; grund?: string; bruecke?: true; gelaende?: boolean }
/** Erkennungsdistanz und die dünnen Sichtlinien einer Zufahrt */
export interface ErkennungErgebnis { e: Erkennung; linien: ErkennungLinie[] }

/**
 * Lage von Punkten entlang einer Linie (Prüfung 23.10.2026): je Punkt der Abstand a entlang der Linie (Projektion, Suche um den
 * vorigen Punkt + schritt, nie rückwärts) und die seitliche Lage lat. Seitlich versetzte Punkte (am Rand gehalten, Abstand zu
 * Parkfeldern, Brücke) zählen so nicht mit ihrem Zickzack. Ohne Projektion: der vorige Abstand plus die Sehne.
 */
export function entlangLinie(linie: P[], pts: P[], start: number, schritt: number): { a: number; lat: number }[] {
  let a = start
  return pts.map((p, k) => {
    const pr = projektion(linie, p, k ? a + schritt : start)
    a = pr ? Math.max(k ? a : -Infinity, pr[0]) : a + (k ? dist(pts[k - 1], p) : 0)
    return { a, lat: pr ? pr[1] : 0 }
  })
}

/**
 * Zielpunkte im eigenen Fahrstreifen: vom ersten Sichtpunkt p0 (am Streifenrand) entlang der Streifenachse (s.p0 → s.p1)
 * bis ZIEL_HALB_M beidseits, auf dem vorderen Rand (Lage von p0) und auf der Achse, innerhalb der Streifenenden.
 */
export function zielPunkte(p0: P, s: { p0: P; p1: P }): P[] {
  const n = einheit(sub(s.p1, s.p0)), L = dist(s.p0, s.p1)
  const t0 = dot(sub(p0, s.p0), n)
  const ts = [...new Set(ZIEL_VERSATZ.map(o => Math.min(L, Math.max(0, t0 + o))))]
  return [...ts.map(t => add(p0, n, t - t0)), ...ts.map(t => add(s.p0, n, t))]
}

type Box = [number, number, number, number]
const boxVon = (pts: P[]): Box => [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])),
  Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]
const ueberlappt = (a: Box, b: Box) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3])
const segBox = (a: P, b: P): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]

/** Hindernisse einer Zufahrt, vorab auf den Bereich der Augpunkte und Ziele beschränkt */
interface Kandidat { box: Box; geom: Multi | null; linie: P[] | null; info: ErkennungHindernis; baum?: P }
function kandidaten(bereich: Box, gebaeude: Gebaeude, hd: HindernisDaten | null): Kandidat[] {
  const out: Kandidat[] = gebaeude.kandidaten(bereich).map((t: Teil) => ({ box: t.env, geom: [t.poly], linie: null,
    info: { klasse: 'gebaeude', name: 'Gebäude (AV)' } }))
  if (hd) {
    for (const h of hd.sonstige) {
      const pts = h.geom ? h.geom.flatMap(poly => poly[0]) : h.linie ?? []
      if (!pts.length) continue
      const box = boxVon(pts)
      if (ueberlappt(box, bereich)) out.push({ box, geom: h.geom, linie: h.geom ? null : h.linie,
        info: { klasse: 'hindernis', name: h.name, id: h.id } })
    }
    for (const b of hd.baeume) {
      const box = boxVon(b.stamm.flatMap(poly => poly[0]))
      if (ueberlappt(box, bereich)) out.push({ box, geom: b.stamm, linie: null, info: { klasse: 'baum', name: b.name, id: b.id }, baum: b.xy })
    }
    // Auto-Parkfelder (Nutzerentscheid 23.10.2026); Zweirad-Felder nicht
    for (const f of hd.park.felder) if (ueberlappt(f.env, bereich)) out.push({ box: f.env, geom: [f.poly], linie: null,
      info: { klasse: 'auto', name: f.name, ...(f.id ? { id: f.id } : {}) } })
  }
  return out
}

/** Linie schneidet die Strecke a–b? */
function linieKreuzt(a: P, b: P, linie: P[]): boolean {
  for (let i = 0; i < linie.length - 1; i++) if (segSchnitt(a, b, linie[i], linie[i + 1])) return true
  return false
}

/** Sichtlinie vom Augpunkt: der erste Zielpunkt frei von Hindernissen und Bewuchs (frei), sonst der erste frei von Hindernissen
 * (bewuchs, grund: AV-Art), sonst der erste mit dem Hindernis davor (verdeckt, wie verdecktVon) */
function sichtLinie(auge: P, ziele: P[], kand: Kandidat[], gruen: Teil[]): { befund: LinienBefund; ziel: P; grund?: string } {
  const gilt = kand.filter(k => (k.baum ? dist(k.baum, auge) >= BAUM_AUGE_M : !(k.geom && enthaelt(k.geom, auge))))
  const g = gruen.filter(t => !enthaelt([t.poly], auge))
  let erstes: ErkennungHindernis | null = null, ueber: { ziel: P; art: string } | null = null
  for (const z of ziele) {
    const sb = segBox(auge, z)
    const k = gilt.find(c => ueberlappt(c.box, sb) && (c.geom ? linieTrifft([auge, z], c.geom) : linieKreuzt(auge, z, c.linie!)))
    if (k) { erstes ??= k.info; continue }
    const t = g.find(c => ueberlappt(c.env, sb) && linieTrifft([auge, z], [c.poly]))
    if (!t) return { befund: 'frei', ziel: z }
    ueber ??= { ziel: z, art: t.art }
  }
  if (ueber) return { befund: 'bewuchs', ziel: ueber.ziel, grund: ueber.art }
  return { befund: 'verdeckt', ziel: ziele[0], grund: erstes!.name }
}

/** Lage auf der Folge der Augpunkte beim Abstand x (zwischen zwei Augpunkten gerade eingeschoben) */
function augeBei(augen: Augpunkt[], x: number): P {
  let i = 0
  while (i < augen.length - 2 && augen[i + 1].x < x) i++
  const a = augen[i], b = augen[Math.min(i + 1, augen.length - 1)]
  const t = b.x > a.x ? Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x))) : 0
  return add(a.p, sub(b.p, a.p), t)
}

/** Dünne Sichtlinien: x = 0, LINIEN_ABSTAND_M, 2 · LINIEN_ABSTAND_M … bis zum letzten Augpunkt, dazu dieser */
function sichtLinien(augen: Augpunkt[], ziele: P[], kand: Kandidat[], gruen: Teil[], bruecke: Bruecke | null): ErkennungLinie[] {
  const xEnde = augen[augen.length - 1].x, xs = [0]
  for (let x = LINIEN_ABSTAND_M; x < xEnde - 1e-6; x += LINIEN_ABSTAND_M) xs.push(x)
  if (xEnde > 1e-6) xs.push(xEnde)
  return xs.map(x => {
    const auge = augeBei(augen, x), l = sichtLinie(auge, ziele, kand, gruen)
    return { x: Math.round(x * 100) / 100, auge, ziel: l.ziel, befund: l.befund, ...(l.grund ? { grund: l.grund } : {}),
      ...(bruecke && (bruecke.enthaelt(auge) || bruecke.enthaelt(l.ziel)) ? { bruecke: true as const } : {}) }
  })
}

/** Hindernis, das die Sicht vom Augpunkt auf alle Zielpunkte verdeckt (das zum ersten Zielpunkt), sonst null (sichtbar) */
function verdecktVon(auge: P, ziele: P[], kand: Kandidat[]): ErkennungHindernis | null {
  // Hindernisse, die am Augpunkt nicht zählen (Augpunkt im Gebäude bzw. Hindernis, Baum direkt daneben)
  const gilt = kand.filter(k => (k.baum ? dist(k.baum, auge) >= BAUM_AUGE_M : !(k.geom && enthaelt(k.geom, auge))))
  let erstes: ErkennungHindernis | null = null
  for (const z of ziele) {
    const sb = segBox(auge, z)
    const k = gilt.find(c => ueberlappt(c.box, sb) && (c.geom ? linieTrifft([auge, z], c.geom) : linieKreuzt(auge, z, c.linie!)))
    if (!k) return null
    erstes ??= k.info
  }
  return erstes
}

/**
 * Erkennungsdistanz entlang der Augpunkte (nach x aufsteigend, der letzte an der Prüfgrenze bzw. am Ende der Fahrlinie) und die
 * dünnen Sichtlinien. ende: Grund, wenn die Fahrlinie vor der Prüfgrenze endet (sonst null).
 */
export function erkennungRechnen(augen: Augpunkt[], ziele: P[], gebaeude: Gebaeude, hd: HindernisDaten | null,
  ende: ErkennungEnde | null, opt: { bruecke?: Bruecke | null; bewuchs?: Flaechen | null } = {}): ErkennungErgebnis | undefined {
  if (!augen.length || !ziele.length) return undefined
  const bereich = boxVon([...augen.map(a => a.p), ...ziele])
  const kand = kandidaten(bereich, gebaeude, hd)
  // Bewuchs im Bereich; eine Fläche, in der ein Zielpunkt liegt, zählt nicht
  const gruen = opt.bewuchs ? opt.bewuchs.r.inBox(...bereich).filter(t => !ziele.some(z => enthaelt([t.poly], z))) : []
  const e = erkennung2D(augen, ziele, kand, ende)
  const b = gruen.length ? bewuchsAb(augen, ziele, kand, gruen, e.wert) : null
  return { e: b ? { ...e, bewuchsAb: b.ab, bewuchs: b.art } : e, linien: sichtLinien(augen, ziele, kand, gruen, opt.bruecke ?? null) }
}

/** Distanz, ab der die Sicht nur noch über Bewuchs geht (vom Streifen aus, halbierend verfeinert); null: bis wert sicher frei */
function bewuchsAb(augen: Augpunkt[], ziele: P[], kand: Kandidat[], gruen: Teil[], wert: number): { ab: number; art: string } | null {
  let sicher: Augpunkt | null = null
  for (const a of augen) {
    if (a.x > wert + 1e-6) break
    const l = sichtLinie(a.p, ziele, kand, gruen)
    if (l.befund === 'frei') { sicher = a; continue }
    if (l.befund === 'verdeckt') return null
    let lo = 0, hi = 1, art = l.grund!
    if (sicher) for (let i = 0; i < VERFEINERN; i++) {
      const t = (lo + hi) / 2, lx = sichtLinie(add(sicher.p, sub(a.p, sicher.p), t), ziele, kand, gruen)
      if (lx.befund === 'frei') lo = t; else { hi = t; if (lx.befund === 'bewuchs') art = lx.grund! }
    }
    const ab = sicher ? Math.floor(sicher.x + (a.x - sicher.x) * lo + 1e-6) : 0
    return ab < wert ? { ab, art } : null
  }
  return null
}
/** Umriss der Brücken (AV-Einzelobjekte, Kontext.brueckenumriss) */
type Bruecke = { enthaelt(p: P): boolean }

function erkennung2D(augen: Augpunkt[], ziele: P[], kand: Kandidat[], ende: ErkennungEnde | null): Erkennung {
  let frei: Augpunkt | null = null
  for (const a of augen) {
    const h = verdecktVon(a.p, ziele, kand)
    if (!h) { frei = a; continue }
    if (!frei) return { wert: 0, bis: 'verdeckt', hindernis: h }
    // zwischen dem letzten freien und diesem Augpunkt verfeinern (gerade dazwischen)
    let lo = 0, hi = 1, hind = h
    for (let i = 0; i < VERFEINERN; i++) {
      const t = (lo + hi) / 2
      const hx = verdecktVon(add(frei.p, sub(a.p, frei.p), t), ziele, kand)
      if (hx) { hi = t; hind = hx } else lo = t
    }
    return { wert: Math.floor(frei.x + (a.x - frei.x) * lo + 1e-6), bis: 'verdeckt', hindernis: hind }
  }
  const x = Math.floor(augen[augen.length - 1].x + 1e-6)
  return ende ? { wert: x, bis: 'fahrlinie_endet', ende } : { wert: x, bis: 'frei' }
}
