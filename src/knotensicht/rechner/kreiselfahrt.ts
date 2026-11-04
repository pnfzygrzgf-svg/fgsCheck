// ── Kreisel: Einfahrt, K, D (K2) und Ablenkungswinkel β (K3) ──
//
// Fahrstreifen einer Ein- bzw. Ausfahrt: OSM-Linie des Arms, seitlich in die Mitte des Fahrstreifens verschoben. Lage aus dem
// AV-Querschnitt QUERSCHNITT_AUSSEN_M ausserhalb des Aussenrands (sonst weitere Abstände); quert ihn ein anderer OSM-Weg, nur bis zur
// Hälfte des Abstands, ein OSM-Rad- bzw. Fussweg auf derselben AV-Fläche begrenzt ihn ebenfalls; liegt die OSM-Linie auf einer
// Mittelinsel, gilt das Fahrbahnstück rechts davon. Einbahn (getrennte Ein- und Ausfahrt) in der Mitte der Fahrbahn, Weg mit Gegenverkehr in der Mitte der rechten Hälfte; ohne
// Querschnitt FAHRSTREIFEN_ANNAHME_M breite Streifen (Annahme).
// K2: Fahrlinie mit Vortritt in der Mitte zwischen Aussenrand und Innenring bzw. Insel (Form aus E9), im
// Gegenuhrzeigersinn von links auf die gewählte Einfahrt; Fahrlinie der Einfahrt in der Mitte des Einfahrtsfahrstreifens; K = Schnitt;
// D = B hinter dem Rand der Kreiselfahrbahn (Wartelinie) auf dieser Achse, am Fahrersitz (wie am Knoten). Nur Verkehr von links.
// K3 (VSS 40 263 Ziffer 17, S. 12): je Fahrbeziehung Hilfslinie HILFSLINIE_M innerhalb des rechten Rands der Einfahrt (AV-Rand quer zur
// Achse gemessen, mit der Ausrundung an der Mündung); vom Startpunkt auf ihr die Tangente an den Inselrand (Fall 1) bzw. den Innenring
// (Fall 2), Insel links; Ausfahrt spiegelbildlich; β zwischen den beiden Tangenten. Startpunkt (Annahme; K5: von Hand): dort, wo die
// Tangente die Hilfslinie berührt, also die geringste Ablenkung (schnellste Fahrt); ohne AV-Rand an der Wartelinie. Fahrbeziehungen: gegenüberliegende Arme, bei drei Armen nur über 180 gon,
// von Hand an- und abwählbar. Kleinstes β → Tempo auf der Kreiselfahrbahn (Ziffer 13.2, S. 8–9); Minikreisel fest 30 km/h ohne β
// (Annahme); ohne gültige Konstruktion 40 km/h (Annahme).

import { type P, add, einheit, sub, links, rechts, neg, drehung, wdiff, imPolygon, dist, dot, median, kreisAnpassen, segSchnitt } from '../geo'
import { type OsmNetz, type Arm, verlaengern, streckeLaenge, abschneiden } from './netz'
import { type Fahrbahn, intervalleImPolygon } from './flaechen'
import { versetzt, schnitte } from './hauptachsen'
import { punkteAufSpur } from './spur'
import { beobachtungsdistanz, istAusserorts, FAHRERSITZ_M } from './beobachtung'
import { profilLinie, profilWert, profilWinkel, profilPunkt, grenzeProfil } from './kreisel'
import type { KreiselArm, KreiselBeta, KreiselBeziehung, KreiselTyp, KreiselVermessung, KreiselZufahrt } from './typen'

/** Hilfslinie für den Ablenkungswinkel: so weit innerhalb des rechten Rands der Ein- bzw. Ausfahrt [m] (VSS 40 263 Ziffer 17, S. 12) */
export const HILFSLINIE_M = 3.5
/** Annahme: Querschnitt der Ein- bzw. Ausfahrt so weit ausserhalb des Aussenrands [m] */
export const QUERSCHNITT_AUSSEN_M = 5
/** Annahme: weitere Abstände für den Querschnitt, wenn er beim ersten nicht gelingt [m]; Querschnitt bis so weit seitlich [m]; liegt die
 *  OSM-Linie auf einer Mittelinsel, zählt das nächste Fahrbahnstück rechts bis so weit [m] */
const QUERSCHNITT_ABSTAENDE_M = [QUERSCHNITT_AUSSEN_M, 3, 7, 9, 11]
const QUERSCHNITT_HALB_M = 15
const QUERSCHNITT_INSEL_M = 4
/** Annahme: ein Fahrbahnstück für eine Richtung ist höchstens so breit, mit Gegenverkehr doppelt so breit [m]; sonst nächster Abstand */
const EINE_RICHTUNG_MAX_M = 7
/** Annahme: Rad- bzw. Fussweg (OSM) auf der AV-Fahrbahn begrenzt den Fahrstreifen so weit vor seiner Linie [m] */
const TRENNER_ABSTAND_M = 1
/** Annahme ohne AV-Querschnitt: Fahrstreifen so breit [m] */
export const FAHRSTREIFEN_ANNAHME_M = 3.5
/** Tempo auf der Kreiselfahrbahn nach dem kleinsten β (Ziffer 13.2, S. 8–9): unter 20 gon 40 km/h, 20 bis 45 gon 35 km/h, darüber 30 */
export const BETA_40_UNTER_GON = 20
export const BETA_30_UEBER_GON = 45
/** empfohlener Ablenkungswinkel (Ziffer 17, S. 13): mindestens so viele gon */
export const BETA_EMPFOHLEN_GON = 45
/** bei drei Armen gilt eine Fahrbeziehung nur, wenn die Arme mehr als so viele gon einschliessen (Ziffer 17, S. 12) */
export const DREI_ARME_GON = 180
/** Tempo ohne gültige Konstruktion bzw. am Minikreisel (Annahmen) */
export const TEMPO_OHNE_BETA = 40
export const TEMPO_MINI = 30
const LINIE_M = 40           // OSM-Linie der Ein- bzw. Ausfahrt ab dem Ring
const VERLAENGERUNG_M = 25   // Achse über den Ring hinaus verlängert
/** Ausrundung Re2 (Annahme): rechter Rand auf so viel Achse vor (Einfahrt) bzw. nach (Ausfahrt) dem Rand der Kreiselfahrbahn gemessen
 *  [m]; zur Ausrundung zählen Punkte so viel weiter aussen als der gerade Rand [m]; Rand höchstens so weit von der Achse [m]; Radius im
 *  Bereich [m] */
const AUSRUNDUNG_SPANNE_M = 20
const AUSRUNDUNG_AB_M = 0.3
const RAND_RECHTS_MAX_M = 12
/** Ausrundung: der Rand weitet zur Mündung hin um mindestens so viel auf [m]; mittlere Abweichung vom Kreis höchstens so gross [m] */
const AUSRUNDUNG_AUFWEITUNG_M = 0.5
const AUSRUNDUNG_RMS_M = 0.25
const RE2_MIN_M = 2
const RE2_MAX_M = 60
const HILFSLINIE_ZEICHNEN_M = 12

const gon = (grad: number) => grad * 400 / 360
const f1 = (x: number) => x.toFixed(1).replace('.', ',')
const f2 = (x: number) => x.toFixed(2).replace('.', ',')
const armVon = (key: string): Arm => key.split(':').map(Number) as Arm

/** Querschnitt durch p quer zur Fahrtrichtung (r = rechts): Fahrbahnstücke der AV bis ±QUERSCHNITT_HALB_M, zusammengefasst. Liegt die
 *  OSM-Linie auf der Fahrbahn: dieses Stück (Weg mit Gegenverkehr: seine rechte Hälfte); liegt sie auf einer Mittelinsel (Lücke): das
 *  nächste Stück rechts bis QUERSCHNITT_INSEL_M (nur diese Richtung). Quert ein anderer befahrbarer OSM-Weg das Stück (z. B. die Ausfahrt,
 *  wo die Leitinsel schon endet), gehört dem Fahrstreifen nur die Seite bis zur Hälfte des Abstands. -> Grenzen lo < hi rechts der
 *  OSM-Linie bzw. null */
function querschnitt(netz: OsmNetz, fahrbahn: Fahrbahn, wid: number, p: P, r: P, einbahn: boolean, trenner: P[][]):
  { lo: number; hi: number; breite: number; geteilt: boolean; insel: boolean; ab: number } | null {
  const iv: [number, number][] = []
  for (const t of fahrbahn.r.imUmkreis(p, QUERSCHNITT_HALB_M + 1)) iv.push(...intervalleImPolygon(p, r, QUERSCHNITT_HALB_M, t.poly))
  iv.sort((x, y) => x[0] - y[0])
  const zus: [number, number][] = []
  for (const x of iv) { const l = zus[zus.length - 1]; if (l && x[0] <= l[1] + 0.2) l[1] = Math.max(l[1], x[1]); else zus.push([x[0], x[1]]) }
  const hier = zus.find(([a, b]) => a <= 0.05 && b >= -0.05)
  const rechtsDavon = hier ? null : zus.find(([a]) => a > 0 && a <= QUERSCHNITT_INSEL_M)
  const stueck = hier ?? rechtsDavon
  if (!stueck || stueck[1] - stueck[0] < 2) return null
  // zu breit für eine Richtung bzw. für beide (Busbucht, Platz, Radweg auf derselben Fläche): diesen Querschnitt verwerfen
  if (stueck[1] - stueck[0] > (einbahn || !hier ? EINE_RICHTUNG_MAX_M : 2 * EINE_RICHTUNG_MAX_M)) return null
  let [lo, hi] = stueck
  const a0 = add(p, r, lo), a1 = add(p, r, hi)
  for (const [w2, w] of netz.W) {
    if (w2 === wid || !w.mfz || w.ring) continue
    for (let k = 0; k < w.nds.length - 1; k++) {
      const x = segSchnitt(a0, a1, netz.p(w.nds[k]), netz.p(w.nds[k + 1]))
      if (!x) continue
      const u = stueck[0] + (stueck[1] - stueck[0]) * x[0]
      if (u < -0.5) lo = Math.max(lo, u / 2); else if (u > 0.5) hi = Math.min(hi, u / 2)
    }
  }
  // Rad- und Fusswege auf derselben AV-Fläche (z. B. ein Velobypass neben der Einfahrt): Fahrstreifen bis TRENNER_ABSTAND_M davor
  for (const l of trenner) for (let k = 0; k < l.length - 1; k++) {
    const x = segSchnitt(a0, a1, l[k], l[k + 1])
    if (!x) continue
    const u = stueck[0] + (stueck[1] - stueck[0]) * x[0]
    if (u < -TRENNER_ABSTAND_M) lo = Math.max(lo, u + TRENNER_ABSTAND_M); else if (u > TRENNER_ABSTAND_M) hi = Math.min(hi, u - TRENNER_ABSTAND_M)
  }
  const geteilt = lo > stueck[0] || hi < stueck[1]
  // Weg mit Gegenverkehr auf der Fahrbahn: rechte Hälfte
  if (!einbahn && hier) lo = (lo + hi) / 2
  return { lo, hi, breite: stueck[1] - stueck[0], geteilt, insel: !hier, ab: 0 }
}

/** Fahrstreifen einer Ein- (zumRing) bzw. Ausfahrt: Achse in Fahrtrichtung (verlängert), Abstand zum rechten Rand, Schnitt mit dem
 *  Aussenrand (Wartelinie bzw. Ende der Kreiselfahrbahn) mit Bogenlänge und Richtung dort */
export interface Streifen { achse: P[]; rechts: number; quelle: string; annahme: boolean; rand: P; sRand: number; t: P }
export function fahrstreifen(netz: OsmNetz, fahrbahn: Fahrbahn | null, v: KreiselVermessung, key: string, zumRing: boolean,
  trenner: P[][] = []): Streifen | string {
  const a = armVon(key)
  if (!netz.W.has(a[0])) return 'OSM-Weg fehlt'
  const roh = [netz.p(netz.w(a[0]).nds[a[1]]), ...netz.armLinie(a, LINIE_M).slice(1)]
  const L = streckeLaenge(roh)
  if (L < 3) return 'OSM-Linie zu kurz'
  const proben = punkteAufSpur(roh, Array.from({ length: Math.floor(L / 0.5) + 1 }, (_, i) => i * 0.5))
  const einbahn = netz.w(a[0]).ow !== 0
  // Querschnitt QUERSCHNITT_AUSSEN_M ausserhalb des Aussenrands, sonst bei den weiteren Abständen; der erste mit Fahrstreifen gilt
  let streifen: { lo: number; hi: number; breite: number; geteilt: boolean; insel: boolean; ab: number } | null = null
  for (const ab of QUERSCHNITT_ABSTAENDE_M) {
    const pr = proben.find(([p]) => dist(p, v.mitte) > profilWert(v.aussen, profilWinkel(v.mitte, p)) + ab)
    if (!pr || !fahrbahn) continue
    streifen = querschnitt(netz, fahrbahn, a[0], pr[0], rechts(zumRing ? neg(pr[1]) : pr[1]), einbahn, trenner)
    if (streifen) { streifen.ab = ab; break }
  }
  let versatz: number, rechtsRand: number, quelle: string
  if (streifen) {
    versatz = (streifen.lo + streifen.hi) / 2
    rechtsRand = streifen.hi - versatz
    quelle = `AV-Querschnitt ${f2(streifen.breite)} m (${streifen.ab} m ausserhalb des Kreisels)` + (streifen.insel ?
      `, OSM-Linie auf einer Mittelinsel: Fahrbahn rechts davon, ${f2(streifen.hi - streifen.lo)} m` : streifen.geteilt ?
      `, davon ${f2(streifen.hi - streifen.lo)} m (begrenzt durch einen benachbarten OSM-Weg)` : '') +
      `, ${einbahn || streifen.insel ? 'Mitte der Fahrbahn' : 'Mitte der rechten Hälfte'}`
  } else {
    versatz = einbahn ? 0 : FAHRSTREIFEN_ANNAHME_M / 2
    rechtsRand = FAHRSTREIFEN_ANNAHME_M / 2
    quelle = `ohne AV-Querschnitt: Fahrstreifen ${f2(FAHRSTREIFEN_ANNAHME_M)} m breit angenommen`
  }
  const fahrt = zumRing ? [...roh].reverse() : roh
  const achse0 = versetzt(fahrt, -versatz)
  const achse = zumRing ? verlaengern(achse0, streckeLaenge(achse0) + VERLAENGERUNG_M) :
    [...verlaengern([...achse0].reverse(), streckeLaenge(achse0) + VERLAENGERUNG_M)].reverse()
  const x = schnitte(achse, profilLinie(v.mitte, v.aussen))
  if (!x.length) return 'kein Schnitt mit dem Aussenrand'
  const r = x.reduce((m, y) => ((zumRing ? y.sa < m.sa : y.sa > m.sa) ? y : m))
  const [[, t]] = punkteAufSpur(achse, [Math.min(r.sa, streckeLaenge(achse) - 1e-6)])
  return { achse, rechts: rechtsRand, quelle, annahme: !streifen, rand: r.p, sRand: r.sa, t }
}

/** K2: gewählte Einfahrt arm -> Achse, Rand, K, D und Fahrlinie mit Vortritt bzw. ein Text, warum es nicht geht */
export function kreiselZufahrt(netz: OsmNetz, fahrbahn: Fahrbahn | null, v: KreiselVermessung, arm: KreiselArm,
  trenner: P[][] = []): KreiselZufahrt | string {
  const s = fahrstreifen(netz, fahrbahn, v, arm.ein!, true, trenner)
  if (typeof s === 'string') return `Einfahrt ${arm.nr}: ${s}`
  const k = schnitte(s.achse, profilLinie(v.mitte, v.fahrlinie)).filter(x => x.sa > s.sRand).sort((a, b) => a.sa - b.sa)[0]
  if (!k) return `Einfahrt ${arm.nr}: kein Schnitt mit der Fahrlinie mit Vortritt`
  const aus = istAusserorts(netz, [armVon(arm.ein!)[0]])
  const B = beobachtungsdistanz(aus.ausserorts)
  const [[Dachse, t]] = punkteAufSpur(s.achse, [Math.max(0, s.sRand - B)])
  // Fahrlinie mit Vortritt: halber Ring gegen den Uhrzeigersinn bis K (Verkehr von links)
  const gK = profilWinkel(v.mitte, k.p)
  const vortrittLinie: P[] = []
  for (let g = Math.ceil(gK - 180); g < gK; g++) vortrittLinie.push(profilPunkt(v.mitte, v.fahrlinie, g))
  vortrittLinie.push(k.p)
  return { arm: arm.key, ein: arm.ein!, achse: abschneiden(s.achse, k.sa), lageQuelle: s.quelle, rand: s.rand, K: k.p,
    D: add(Dachse, links(t), FAHRERSITZ_M), Dachse, B, bGrund: aus.grund, vortrittLinie }
}

/** Abstand vom Punkt p in Richtung r bis zum Rand des Fahrbahnstücks, auf dem p liegt (höchstens max), null ausserhalb bzw. weiter */
function randAbstand(fahrbahn: Fahrbahn, p: P, r: P, max: number): number | null {
  const iv: [number, number][] = []
  for (const t of fahrbahn.r.imUmkreis(p, max + 1)) iv.push(...intervalleImPolygon(p, r, max + 1, t.poly))
  iv.sort((a, b) => a[0] - b[0])
  const zus: [number, number][] = []
  for (const x of iv) { const l = zus[zus.length - 1]; if (l && x[0] <= l[1] + 0.2) l[1] = Math.max(l[1], x[1]); else zus.push([x[0], x[1]]) }
  const hier = zus.find(([a, b]) => a <= 0.05 && b >= 0)
  return hier && hier[1] <= max ? hier[1] : null
}

/** Ausrundung Re2 am rechten Rand der Ein- bzw. Ausfahrt (Annahme): Ausgleichskreis durch die Punkte des rechten AV-Rands (quer zur
 *  Achse gemessen) an der Mündung, die mehr als AUSRUNDUNG_AB_M weiter aussen liegen als der gerade Rand davor; Mitte rechts der Achse,
 *  Radius im Bereich. null ohne AV-Rand bzw. ohne Ausrundung (z. B. eckige Mündung) */
export function ausrundung(fahrbahn: Fahrbahn | null, s: Streifen, zumRing: boolean): { m: P; r: number; mitte: number; halb: number } | null {
  if (!fahrbahn) return null
  const ab = Array.from({ length: Math.round(AUSRUNDUNG_SPANNE_M / 0.5) }, (_, i) =>
    (zumRing ? s.sRand - AUSRUNDUNG_SPANNE_M + i * 0.5 : s.sRand + 0.3 + i * 0.5)).filter(x => x >= 0)
  const proben = punkteAufSpur(s.achse, ab).map(([p, t]) => ({ p, t, d: randAbstand(fahrbahn, p, rechts(t), RAND_RECHTS_MAX_M) }))
  const fern = proben.filter((x, i) => x.d !== null && (zumRing ? i < proben.length / 2 : i >= proben.length / 2)).map(x => x.d!)
  if (fern.length < 3) return null
  const gerade = median(fern)
  // Bogen: zusammenhängende Punkte an der Mündung, deren Rand mehr als AUSRUNDUNG_AB_M weiter aussen liegt als der gerade Rand und zur
  // Mündung hin aufweitet; der Kreis muss gut passen (sonst zerklüfteter Rand, z. B. Inseln oder ein Radweg daneben: keine Ausrundung)
  const zurMuendung = zumRing ? proben : [...proben].reverse()
  const lauf: typeof proben = []
  for (let i = zurMuendung.length - 1; i >= 0; i--) {
    const x = zurMuendung[i]
    if (x.d === null || x.d <= gerade + AUSRUNDUNG_AB_M) break
    lauf.unshift(x)
  }
  if (lauf.length < 4 || lauf[lauf.length - 1].d! < lauf[0].d! + AUSRUNDUNG_AUFWEITUNG_M) return null
  const bogen = lauf.map(x => add(x.p, rechts(x.t), x.d!))
  const k = kreisAnpassen(bogen)
  if (!k || k.r < RE2_MIN_M || k.r > RE2_MAX_M || dot(sub(k.m, s.rand), rechts(s.t)) <= 0) return null
  if (Math.sqrt(bogen.reduce((q, p) => q + (dist(p, k.m) - k.r) ** 2, 0) / bogen.length) > AUSRUNDUNG_RMS_M) return null
  // Winkelbereich des gemessenen Bogens um die Mitte (Startpunkte nur dort, sonst trifft die Tangente die Gegenseite des Kreises)
  const w = bogen.map(p => Math.atan2(p[1] - k.m[1], p[0] - k.m[0])), w0 = w[0]
  const rel = w.map(x => Math.atan2(Math.sin(x - w0), Math.cos(x - w0)))
  const lo = Math.min(...rel), hi = Math.max(...rel)
  return { ...k, mitte: w0 + (lo + hi) / 2, halb: (hi - lo) / 2 }
}
/** Startpunkte auf dem Hilfskreis nur im Bereich des gemessenen Bogens, erweitert um so viel Bogenlänge (Annahme) [m], und nicht innerhalb
 *  der Fahrlinie mit Vortritt (sonst entartet die Tangente an der Insel) */
const BOGEN_REST_M = 3

/** Kreis als Punktfolge (n Punkte, gegen den Uhrzeigersinn) */
const kreisPunkte = (m: P, r: number, n = 360): P[] => Array.from({ length: n }, (_, i) => add(m, [Math.cos(2 * Math.PI * i / n), Math.sin(2 * Math.PI * i / n)], r))

/** Berührpunkt der Tangente von s an die Form (geschlossene Linie um mitte): seite −1 die Form links der Linie s → Berührpunkt (Einfahrt),
 *  +1 rechts der Linie s → Berührpunkt (Ausfahrt rückwärts) */
function tangente(s: P, form: P[], mitte: P, seite: -1 | 1): P {
  const ref = sub(mitte, s)
  return form.reduce((m, p) => (seite * drehung(ref, sub(p, s)) > seite * drehung(ref, sub(m, s)) ? p : m))
}

/** K3: Fahrbeziehungen, β und Tempo. hand: Fahrbeziehungen von Hand an bzw. ab («von>nach»); start: K5, Startpunkte von Hand
 *  («von>nach:ein» bzw. «:aus»), noch ohne Eingabe in der Oberfläche */
export function kreiselBeta(netz: OsmNetz, fahrbahn: Fahrbahn | null, v: KreiselVermessung, arme: KreiselArm[], typ: KreiselTyp,
  hand: Record<string, boolean>, start: Record<string, P> = {}, trenner: P[][] = []): KreiselBeta {
  const grenze = grenzeProfil(v), form = profilLinie(v.mitte, grenze).slice(0, -1)
  const ohneInsel = grenze.every(x => x <= 0)
  const cache = new Map<string, Streifen | string>()
  const streifen = (key: string, zumRing: boolean) => {
    const k = `${key}|${zumRing}`
    if (!cache.has(k)) cache.set(k, fahrstreifen(netz, fahrbahn, v, key, zumRing, trenner))
    return cache.get(k)!
  }
  const nachArme = arme.filter(a => a.aus)
  const beziehungen: KreiselBeziehung[] = []
  for (const a of arme.filter(x => x.ein)) {
    const gegen = nachArme.filter(b => b !== a).reduce<KreiselArm | null>((m, b) =>
      (!m || wdiff(a.richtung, b.richtung) > wdiff(a.richtung, m.richtung) ? b : m), null)
    for (const b of nachArme) {
      if (b === a) continue
      const key = `${a.key}>${b.key}`
      const vorgabe = b === gegen && (arme.length >= 4 || (arme.length === 3 && gon(wdiff(a.richtung, b.richtung)) > DREI_ARME_GON))
      const x: KreiselBeziehung = { key, von: a.key, nach: b.key, vorgabe, aktiv: hand[key] ?? vorgabe, gueltig: false, grund: '',
        startEin: null, tangEin: null, hilfEin: null, startAus: null, tangAus: null, hilfAus: null,
        startHand: !!(start[`${key}:ein`] || start[`${key}:aus`]), re2Ein: null, re2Aus: null, fall: null, betaGrad: null, betaGon: null }
      beziehungen.push(x)
      if (ohneInsel) { x.grund = 'keine Insel bzw. kein Innenring'; continue }
      const se = streifen(a.ein!, true), sa = streifen(b.aus!, false)
      if (typeof se === 'string' || typeof sa === 'string') { x.grund = typeof se === 'string' ? `Einfahrt: ${se}` : `Ausfahrt: ${sa as string}`; continue }
      // Hilfslinie: Kreis Re2 + 3,50 m um die Ausrundung; die Tangente berührt ihn (Kreis rechts) und die Insel (links), Abb. 6. Ohne
      // Ausrundung: Gerade 3,50 m innerhalb des rechten Rands, Startpunkt an der Wartelinie bzw. am Ende der Kreiselfahrbahn (Annahme).
      // Von Hand geht vor (K5)
      const draussen = (p: P) => !imPolygon(p, [form])
      const seite = (st: Streifen, zumRing: boolean, hand: P | undefined) => {
        const k = ausrundung(fahrbahn, st, zumRing)
        const w = add(st.rand, rechts(st.t), st.rechts - HILFSLINIE_M)
        if (hand) return { kand: [hand], kreis: k ? { m: k.m, r: k.r + HILFSLINIE_M, re2: k.r } : null, w }
        const imBogen = (p: P) => { const a = Math.atan2(p[1] - k!.m[1], p[0] - k!.m[0]) - k!.mitte
          return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= k!.halb + BOGEN_REST_M / (k!.r + HILFSLINIE_M) }
        const ausserhalb = (p: P) => dist(p, v.mitte) >= profilWert(v.fahrlinie, profilWinkel(v.mitte, p))
        const kand = k ? kreisPunkte(k.m, k.r + HILFSLINIE_M, 3600).filter(p => draussen(p) && imBogen(p) && ausserhalb(p)) : []
        return k && kand.length ? { kand, kreis: { m: k.m, r: k.r + HILFSLINIE_M, re2: k.r }, w } :
          { kand: [w].filter(draussen), kreis: null, w }
      }
      const kE = seite(se, true, start[`${key}:ein`]), kA = seite(sa, false, start[`${key}:aus`])
      x.re2Ein = kE.kreis?.re2 ?? null; x.re2Aus = kA.kreis?.re2 ?? null
      if (!kE.kand.length || !kA.kand.length) { x.grund = 'Startpunkt in der Insel'; continue }
      // Einfahrt: Tangente am Hilfskreis (rechts) und an der Insel (links) = am weitesten im Uhrzeigersinn; Ausfahrt spiegelbildlich
      const ein = kE.kand.map(p => { const t = tangente(p, form, v.mitte, -1); return { p, t, w: drehung(se.t, sub(t, p)) } })
        .reduce((m, y) => (kE.kreis ? y.w < m.w : y.w > m.w) ? y : m)
      const aus = kA.kand.map(p => { const t = tangente(p, form, v.mitte, 1); return { p, t, w: drehung(sa.t, sub(p, t)) } })
        .reduce((m, y) => (kA.kreis ? y.w > m.w : y.w < m.w) ? y : m)
      const bogen = (k: { m: P; r: number } | null, p: P, w: P, t: P, vor: boolean): P[] => {
        if (!k) return vor ? [add(w, t, -HILFSLINIE_ZEICHNEN_M), w] : [w, add(w, t, HILFSLINIE_ZEICHNEN_M)]
        const g0 = Math.atan2(p[1] - k.m[1], p[0] - k.m[0])
        return Array.from({ length: 41 }, (_, i) => add(k.m, [Math.cos(g0 + (i - 20) * Math.PI / 90), Math.sin(g0 + (i - 20) * Math.PI / 90)], k.r))
      }
      x.hilfEin = bogen(kE.kreis, ein.p, kE.w, se.t, true); x.hilfAus = bogen(kA.kreis, aus.p, kA.w, sa.t, false)
      const sEin = ein.p, sAus = aus.p, tEin = ein.t, tAus = aus.t
      x.startEin = sEin; x.startAus = sAus
      x.tangEin = tEin; x.tangAus = tAus
      const grad = Math.abs(drehung(einheit(sub(tEin, sEin)), einheit(sub(sAus, tAus))))
      x.gueltig = true
      x.betaGrad = grad; x.betaGon = gon(grad)
      const innenring = (p: P) => v.innenring[Math.round(profilWinkel(v.mitte, p)) % 360] !== null
      x.fall = innenring(tEin) || innenring(tAus) ? 2 : 1
    }
  }
  const nr = (key: string) => arme.find(a => a.key === key)?.nr ?? '?'
  const gueltig = beziehungen.filter(x => x.aktiv && x.gueltig)
  const min = gueltig.length ? gueltig.reduce((m, x) => (x.betaGon! < m.betaGon! ? x : m)) : null
  const massgebend = min?.key ?? null, betaGon = min?.betaGon ?? null
  if (typ === 'mini') return { beziehungen, massgebend, betaGon, tempo: TEMPO_MINI, annahme: true,
    tempoGrund: `Minikreisel: fest ${TEMPO_MINI} km/h, ohne Ablenkungswinkel (Annahme)` }
  if (!min) return { beziehungen, massgebend, betaGon, tempo: TEMPO_OHNE_BETA, annahme: true,
    tempoGrund: `ohne gültige Konstruktion des Ablenkungswinkels ${TEMPO_OHNE_BETA} km/h (Annahme)` }
  const b = min.betaGon!
  const tempo = b < BETA_40_UNTER_GON ? 40 : b <= BETA_30_UEBER_GON ? 35 : 30
  return { beziehungen, massgebend, betaGon, tempo, annahme: false, tempoGrund: `kleinstes β ${f1(b)} gon (Fahrbeziehung ` +
    `${nr(min.von)} → ${nr(min.nach)}): ${tempo} km/h (VSS 40 263 Ziffer 13.2, S. 8–9)` }
}
