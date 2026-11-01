// ── Grundstückzufahrt (E2b): Zufahrtspunkt am Fahrbahnrand bzw. OSM-Weg service, gerechnet wie ein Arm ──
//
// Gesetzt wird ein Punkt am Fahrbahnrand der Vortrittsstrasse (Klick). Die Vortrittsstrasse ist unter den OSM-Wegen mit
// Strassenklasse (MFZ_HW ohne service) bis GRUND_SUCH_M derjenige, dessen AV-Fahrbahnrand (Sehne quer zum Weg am Lotfusspunkt)
// dem Punkt am nächsten liegt (ohne AV-Sehne: Abstand zur Achse); so gilt an einer Einmündung die Strasse, an deren Rand
// geklickt wurde, nicht die einmündende. Der Knotenpunkt liegt auf ihr, wo die Linie der Zufahrt ihn trifft,
// und beide Richtungen des Wegs ab dort sind die vortrittsberechtigten Arme (Mittellinien entlang des Netzes wie bei einem
// Knoten). Die Zufahrt ist die Gerade durch den Punkt in ihrer Richtung: senkrecht zur Achse der Vortrittsstrasse
// (Vorgabe; die Achse folgt dem Rand) bzw. mit dem zweiten Klick gezeichnet. Ihre Achse ist diese Gerade (Mitte der Zufahrt,
// einspurig angenommen). Liegt ohne gezeichnete Richtung ein OSM-Weg highway=service bis SERVICE_KLICK_M neben dem Punkt und
// mündet er bis SERVICE_EINMUENDUNG_M vom Klick in eine Strasse, folgt die Zufahrt diesem Weg ab der Einmündung (OSM-Knoten);
// Arme dort wie an einem Knoten.

import { type P, add, dist, dot, einheit, links, neg, sub, abstandStrecke, segSchnitt, median } from '../geo'
import { type OsmNetz, streckeLaenge, MFZ_HW } from './netz'
import type { OsmAchsen } from './achsen'
import type { Fahrbahn } from './flaechen'
import { punkteAufSpur } from './spur'
import { armInfo, himmelsrichtung, strassenArme, vortrittPaar, nummerieren, NR_GRUNDSTUECK, teilungsFortsetzung } from './knoten'
import { armMittellinieMitEnde, armLinieAus, type ArmLinie } from './hauptachsen'
import type { ArmInfo, ZufahrtspunktEingabe } from './typen'

/** Vortrittsstrasse: nächster Strassenweg bis zu diesem Abstand vom Zufahrtspunkt */
export const GRUND_SUCH_M = 25
/** OSM-Weg service bis zu diesem Abstand vom Klick: Zufahrt entlang des Wegs */
export const SERVICE_KLICK_M = 4
/** OSM-Weg service: seine Einmündung höchstens so weit vom Klick (sonst etwa ein Weg parallel zur Strasse) */
export const SERVICE_EINMUENDUNG_M = 12
/** Zufahrtspunkt näher an der Strassenachse: kein Rand erkennbar */
export const GRUND_ACHSE_MIN_M = 0.5
/** gezeichnete Richtung höchstens so flach zum Rand (Winkel zur Achse der Vortrittsstrasse mindestens 20°) */
const FLACH_MIN = Math.sin(20 * Math.PI / 180)
/** Rand der Strasse: AV-Sehnen am Lotfusspunkt und so weit daneben entlang des Wegs */
const RAND_VERSATZ_M = [0, -3, 3, -6, 6]
/** Richtung eines Arms: Sehne über diese Länge */
const SEHNE_M = 10
/** Schlüssel der Zufahrt bei einer Grundstückzufahrt (ohne OSM-Weg) */
export const GRUNDSTUECK_KEY = 'grundstueck'

/** Schlüssel eines Zufahrtspunkts (Fall, localStorage, Adresse ?zufahrt=E,N): LV95 auf 0,1 m */
export const zufahrtspunktKey = (p: P): string => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
/** «2600123.4,1200456.7» -> LV95 bzw. null (auch für die Adresse) */
export function zufahrtspunktLesen(s: string | null): P | null {
  const m = /^\s*(\d{7}(?:\.\d+)?)\s*,\s*(\d{7}(?:\.\d+)?)\s*$/.exec(s ?? '')
  if (!m) return null
  const p: P = [Number(m[1]), Number(m[2])]
  return p[0] > 2400000 && p[0] < 2900000 && p[1] > 1000000 && p[1] < 1350000 ? p : null
}

export interface GrundstueckGeo {
  eingabe: P                              // geklickter Punkt (Schlüssel)
  kp: P                                   // Knotenpunkt auf der Vortrittsstrasse
  arme: [ArmInfo, ArmInfo]                // vortrittsberechtigte Arme ab kp
  grund: string                           // warum diese Arme
  /** Mittellinie eines Arms ab kp bis laenge; ende: ab wo sie gerade verlängert ist (SpurEnde); an einer Teilung der Fahrbahn in zwei
   *  Einbahnen auf der zuführenden (ArmLinie) */
  mittellinie: (a: ArmInfo, laenge: number, seite?: 'zu' | 'weg') => ArmLinie
  zArm: ArmInfo                           // Zufahrt (Arm des Wegs service bzw. Pseudo-Arm ohne OSM-Weg, wid −1)
  zMl: (laenge: number) => P[]            // Mittellinie der Zufahrt ab kp (Achse des Zufahrtsstreifens, ohne Versatz)
  richtung: P
  gezeichnet: boolean
  weg: number | null                      // OSM-Weg service
  strasse: string
  hinweise: string[]
}

/** nächster Punkt auf einem OSM-Weg (Segment, Anteil, Punkt, Abstand) */
function aufWeg(pts: P[], p: P): { k: number; t: number; q: P; d: number } {
  let best = { k: 0, t: 0, q: pts[0], d: Infinity }
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], v = sub(pts[k + 1], a), l2 = dot(v, v)
    const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), v) / l2)) : 0
    const q = add(a, v, t), d = dist(p, q)
    if (d < best.d) best = { k, t, q, d }
  }
  return best
}

/** Linie am Ende gerade bis zur Länge laenge verlängern (Zufahrt kürzer als die Rechnung braucht) */
export function bisLaenge(linie: P[], laenge: number): P[] {
  const L = streckeLaenge(linie)
  if (L >= laenge || linie.length < 2) return linie
  const t = einheit(sub(linie[linie.length - 1], linie[linie.length - 2]))
  return [...linie, add(linie[linie.length - 1], t, laenge - L)]
}

/** Richtung einer Linie ab ihrem Anfang (Sehne SEHNE_M) */
function sehnenRichtung(linie: P[]): P {
  const L = Math.min(SEHNE_M, streckeLaenge(linie))
  const q = punkteAufSpur(linie, [L])
  return einheit(sub(q.length ? q[0][0] : linie[linie.length - 1], linie[0]))
}

/** Grundstückzufahrt -> Geometrie bzw. Meldung (warum nicht rechenbar) */
export function grundstueckGeometrie(netz: OsmNetz, achsen: OsmAchsen, fahrbahn: Fahrbahn, z: ZufahrtspunktEingabe): GrundstueckGeo | string {
  const hinweise: string[] = []
  if (!z.richtung) {
    const s = serviceZufahrt(netz, achsen, z.p, hinweise)
    if (s) return s
  }
  // Vortrittsstrasse: Strassenweg (MFZ_HW ohne service), dessen AV-Rand dem Punkt am nächsten liegt
  let best: { wid: number; pts: P[]; k: number; t: number; q: P; d: number; wert: number } | null = null
  for (const [wid, w] of netz.W) {
    if (!w.strasse || !MFZ_HW.has(w.hw) || w.nds.length < 2) continue
    const pts = w.nds.map(n => netz.p(n))
    const a = aufWeg(pts, z.p)
    if (a.d > GRUND_SUCH_M) continue
    const tg = einheit(sub(pts[a.k + 1], pts[a.k]))
    // Sehnen [in Richtung r, gegen r] mit r = links(tg) am Lotfusspunkt und daneben (an einer Einmündung ist die Sehne am
    // Lotfusspunkt zu lang): Median des Rands auf der Seite des Punkts
    const seite = dot(links(tg), sub(z.p, a.q)) >= 0 ? 0 : 1
    const raender = RAND_VERSATZ_M.map(v => fahrbahn.sehne(add(a.q, tg, v), links(tg))).filter(x => x !== null).map(x => x![seite])
    const wert = raender.length ? Math.abs(a.d - median(raender)) : a.d
    if (!best || wert < best.wert - 1e-9 || (Math.abs(wert - best.wert) <= 1e-9 && a.d < best.d)) best = { wid, pts, ...a, wert }
  }
  if (!best) return `Keine Strasse (OSM) bis ${GRUND_SUCH_M} m neben dem Zufahrtspunkt: auf den Fahrbahnrand der Vortrittsstrasse klicken.`
  if (best.d < GRUND_ACHSE_MIN_M) return 'Der Zufahrtspunkt liegt auf der Strassenachse: auf den Fahrbahnrand klicken, auf der Seite der Zufahrt.'
  const w = netz.w(best.wid)
  const tang0 = einheit(sub(best.pts[best.k + 1], best.pts[best.k]))
  const normal: P = dot(links(tang0), sub(z.p, best.q)) >= 0 ? links(tang0) : neg(links(tang0))
  let r = normal, gezeichnet = false
  if (z.richtung) {
    r = einheit(z.richtung)
    gezeichnet = true
    if (dot(r, normal) < 0) { r = neg(r); hinweise.push('Gezeichnete Richtung umgekehrt: die Zufahrt führt vom Rand weg in das Grundstück.') }
    if (dot(r, normal) < FLACH_MIN) {
      r = normal; gezeichnet = false
      hinweise.push('Gezeichnete Richtung zu flach zum Rand (unter 20°): senkrecht zum Rand gerechnet.')
    }
  }
  // Knotenpunkt: wo die Gerade der Zufahrt die Achse der Vortrittsstrasse trifft (nächster Schnitt). Ist der Weg am Knoten
  // geteilt, trifft eine schiefe Zufahrt die Achse oft auf dem anschliessenden Weg derselben Strasse: dann gilt dieser Weg
  // (Strassenwege gleichen Namens bzw. der gewählte); ohne Schnitt das Lot (Hinweis)
  const a0 = add(z.p, r, -(best.d / Math.max(dot(r, normal), FLACH_MIN) + 30)), a1 = add(z.p, r, 1)
  let kp = best.q, kpD = Infinity, kpWeg = best
  for (const [wid, wx] of netz.W) {
    if (wid !== best.wid && !(wx.strasse && MFZ_HW.has(wx.hw) && wx.nds.length >= 2 && (wx.name === w.name && w.name !== ''))) continue
    const pts = wid === best.wid ? best.pts : wx.nds.map(n => netz.p(n))
    for (let k = 0; k < pts.length - 1; k++) {
      const x = segSchnitt(a0, a1, pts[k], pts[k + 1])
      if (!x) continue
      const q = add(a0, sub(a1, a0), x[0])
      if (dist(q, z.p) < kpD) { kp = q; kpD = dist(q, z.p); kpWeg = wid === best.wid ? best : { ...best, wid, pts } }
    }
  }
  if (kpD === Infinity) hinweise.push('Die Linie der Zufahrt trifft die OSM-Achse der Vortrittsstrasse nicht: Knotenpunkt als Lot des Zufahrtspunkts.')
  best = kpWeg
  const lage = aufWeg(best.pts, kp)
  const tang = einheit(sub(best.pts[lage.k + 1], best.pts[lage.k]))
  const li = achsen.linien.findIndex(l => l.wid === best!.wid)
  const start: [number, number, number] = [li, lage.k, lage.t]
  const wk = netz.w(best.wid)
  const pseudo = (sd: 1 | -1): ArmInfo => {
    const linie = li >= 0 ? achsen.spur(start, sd > 0 ? tang : neg(tang), SEHNE_M) : [kp, add(kp, tang, sd * SEHNE_M)]
    const richtung = sehnenRichtung(linie)
    const [veloZufluss, veloZuflussQuelle] = netz.veloZufluss([best!.wid, lage.k, sd])
    return { key: `g${best!.wid}:${lage.k}:${sd}`, nr: '', wid: best!.wid, i: lage.k, sd, name: wk.name, hw: wk.hw, richtung,
      himmel: himmelsrichtung(richtung), zufluss: netz.zufluss([best!.wid, lage.k, sd]), einbahn: wk.ow,
      veloZufluss, veloZuflussQuelle }
  }
  const [vor, zur] = nummerieren([pseudo(1), pseudo(-1)])
  const zArm: ArmInfo = { key: GRUNDSTUECK_KEY, nr: NR_GRUNDSTUECK, wid: -1, i: 0, sd: 1, name: 'Grundstückzufahrt', hw: 'Grundstückzufahrt', richtung: r,
    himmel: himmelsrichtung(r), zufluss: true, einbahn: 0, veloZufluss: true, veloZuflussQuelle: '' }
  const strasse = wk.name || wk.hw
  return {
    eingabe: z.p, kp, arme: [vor, zur], grund: `OSM-Weg ${best.wid} am Zufahrtspunkt`, zArm, richtung: r, gezeichnet, weg: null, strasse, hinweise,
    mittellinie: (a, laenge, seite = 'zu') => li >= 0 ? armLinieAus(netz, achsen.spurMitEnde(start, a.sd > 0 ? tang : neg(tang), laenge,
      teilungsFortsetzung(netz, seite))) : { linie: [kp, add(kp, a.richtung, laenge)], ende: null, teilungen: [], abschnitte: [] },
    zMl: laenge => [kp, add(kp, r, laenge)],
  }
}

/** Zufahrt entlang eines OSM-Wegs service, der bis SERVICE_KLICK_M neben p liegt und in eine Strasse mündet; sonst null */
function serviceZufahrt(netz: OsmNetz, achsen: OsmAchsen, p: P, hinweise: string[]): GrundstueckGeo | null {
  // p: geklickter Punkt (Schlüssel)
  let best: { wid: number; d: number } | null = null
  for (const [wid, w] of netz.W) {
    if (w.hw !== 'service' || !w.mfz || w.nds.length < 2) continue
    for (let k = 0; k < w.nds.length - 1; k++) {
      const d = abstandStrecke(p, netz.p(w.nds[k]), netz.p(w.nds[k + 1]))
      if (d <= SERVICE_KLICK_M && (!best || d < best.d)) best = { wid, d }
    }
  }
  if (!best) return null
  const w = netz.w(best.wid)
  // Einmündung: Knoten des Wegs an einer Strasse (Strassenarme ohne service), der p am nächsten liegt
  const kand = w.nds.map((n, idx) => ({ n, idx })).filter(x => strassenArme(netz, x.n).length >= 2)
  if (!kand.length) {
    hinweise.push(`OSM-Weg ${best.wid} (service) mündet in keine Strasse: Zufahrt senkrecht zum Rand gerechnet.`)
    return null
  }
  const { n, idx } = kand.reduce((a, b) => (dist(netz.p(b.n), p) < dist(netz.p(a.n), p) ? b : a))
  if (dist(netz.p(n), p) > SERVICE_EINMUENDUNG_M) {
    hinweise.push(`OSM-Weg ${best.wid} (service) neben dem Zufahrtspunkt mündet erst ${Math.round(dist(netz.p(n), p))} m entfernt in die ` +
      'Strasse: Zufahrt senkrecht zum Rand gerechnet.')
    return null
  }
  // Richtung vom Knoten weg: zum Ende des Wegs, auf dem p liegt (bzw. das einzige mögliche)
  const sds = ([1, -1] as const).filter(sd => idx + sd >= 0 && idx + sd < w.nds.length)
  const sd = sds.length === 1 ? sds[0] : sds.reduce((a, b) =>
    (dist(netz.armPunkt([best!.wid, idx, b], 6), p) < dist(netz.armPunkt([best!.wid, idx, a], 6), p) ? b : a))
  const zArm = { ...armInfo(netz, [best.wid, idx, sd]), nr: NR_GRUNDSTUECK }
  const arme = strassenArme(netz, n).map(a => armInfo(netz, a))
  const vp = vortrittPaar(arme)!
  const kp = netz.p(n)
  const strasse = [...new Set(vp[0].map(a => a.name || a.hw))].join(' / ')
  return {
    eingabe: p, kp, arme: nummerieren(vp[0]) as [ArmInfo, ArmInfo], grund: vp[1], zArm, richtung: zArm.richtung, gezeichnet: false, weg: best.wid, strasse, hinweise,
    mittellinie: (a, laenge, seite = 'zu') => armMittellinieMitEnde(netz, achsen, a, laenge, seite),
    zMl: laenge => bisLaenge(netz.armLinie([best!.wid, idx, sd], laenge), laenge),
  }
}
