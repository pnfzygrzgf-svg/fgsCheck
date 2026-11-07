// ── Kreisel erkennen und vermessen (K1, E9, E10;) ──
//
// Ein Kreisel (OSM junction=roundabout bzw. circular) gilt als ein Knoten: alle Ringwege, die über gemeinsame Punkte zusammenhängen,
// bilden den Ring. Kennung ist der kleinste OSM-Punkt des Rings (gleich wie in der Knotensuche, daten/osm.ts kreiselMitten).
// Arme: Strassenwege an den Ringpunkten (wie strassenArme: ohne service), die nicht selbst zum Ring gehören. Getrennte Wege derselben
// Strasse (Einfahrt und Ausfahrt um eine Leitinsel, zusätzliche Einfahrt) bilden einen Kreiselarm, wenn sie aussen in dieselbe Richtung
// führen (KREISEL_ARM_GRAD, Annahme). Wege, die den Ring nicht berühren, und Tramgleise sind keine Arme. Nummern im Uhrzeigersinn ab
// Norden. Ein Weg mit Gegenverkehr, zu dem von aussen kein Weg für Motorfahrzeuge führt, ist nur Ausfahrt (vonAussen; Beispiel Dalmazibrücke).
// E10: eine zweite Einfahrt, die kurz vor der Ausfahrt des nächsten Arms in den Ring mündet (BYPASS_M), ist ein Bypass.
// Velobypass (01.11.2026): Rad- bzw. Fuss- und Radweg ausserhalb des Rings zwischen zwei Armen (velobypaesse); Velos auf dem Ring wie bisher.
// Vermessung (E9, Form statt Kreis): Strahlen aus der Mitte je 1°; auf jedem Strahl zählt das Fahrbahnstück der AV (Strasse_Weg), auf
// dem die OSM-Linie des Rings liegt: es beginnt am Rand der Mittelinsel (Fläche ohne Fahrbahn um die Mitte, gleich welche AV-Art) und
// endet am Aussenrand; in den Armen läuft die Fahrbahn weiter. Aussenrand je Richtung = OSM-Linie plus Abstand, der zwischen den Armen
// gemessen und als glatte Funktion des Winkels angepasst wird (Ausreisser verworfen, Start beim unteren Quartil); gemessene Randpunkte
// gelten, in den Armen die angepasste Form, danach geglättet. So bleibt ein Oval ein Oval. Inselrand je Richtung, Lücken (z. B. ein
// Tramtrassee quer durch die Insel) aus den Nachbarn ergänzt. Ohne brauchbare AV: Form der OSM-Linie, Breite angenommen.
// Typ nach dem mittleren Aussendurchmesser (VSS 40 263 Ziffern 3 und 4, S. 4), von Hand umschaltbar.
// Innenring nur als Vorschlag (Ziffer 16, S. 12): je Richtung 5,50 m innerhalb des Aussenrands, wo die Kreiselfahrbahn breiter ist;
// nie aus der AV gelesen. Fahrlinie mit Vortritt (E2) je Richtung in der Mitte zwischen Aussenrand und Innenring bzw. Insel.
// Einfahrt, K, D (K2) und Ablenkungswinkel (K3) in kreiselfahrt.ts.

import { type P, add, dist, einheit, sub, wgs, winkelGrad, wdiff, median, kreisAnpassen, segSchnitt, imPolygon, lv95, abstandStrecke } from '../geo'
import { type OsmNetz, type Arm } from './netz'
import { type Fahrbahn, intervalleImPolygon } from './flaechen'
import { segmentieren } from './poly'
import { armInfo, armText, himmelsrichtung, nummerieren, nachNr, strassenArme, HW_RANG } from './knoten'
import { kreiselZufahrt, kreiselBeta, BETA_EMPFOHLEN_GON } from './kreiselfahrt'
import type { KnotenInfo, KreiselArm, KreiselBypass, KreiselInfo, KreiselTyp, KreiselVermessung, KreiselVelobypass } from './typen'
import type { OsmWeg } from '../daten/osm'

/** Innenring (VSS 40 263 Ziffer 16, S. 12): der Teil der Kreiselfahrbahn über diese Breite [m] */
export const INNENRING_AB_M = 5.5
/** Aussendurchmesser [m] nach VSS 40 263 Ziffern 3 und 4, S. 4: Minikreisel 14 bis 25 m, Kleinkreisel 26 bis 40 m */
export const MINI_D_MIN = 14
export const MINI_D_MAX = 25
export const KLEIN_D_MIN = 26
export const KLEIN_D_MAX = 40
/** Annahme: OSM-Wege am Ring gehören zum selben Kreiselarm (Einfahrt und Ausfahrt um eine Leitinsel, zusätzliche Einfahrt), wenn ihre
 *  Punkte KREISEL_ARM_M aussen (entlang der OSM-Linie, von der Kreiselmitte aus gesehen) höchstens so weit auseinander liegen [°] und sie
 *  gleich heissen (ohne Namen: eine Einbahn zum Ring und eine vom Ring weg) */
export const KREISEL_ARM_GRAD = 45
export const KREISEL_ARM_M = 20
/** Annahme ohne brauchbare AV: die OSM-Linie des Rings liegt in der Mitte einer so breiten Kreiselfahrbahn [m] */
export const KREISEL_BREITE_OHNE_AV_M = 5.5
/** Annahme (E10, 01.11.2026): eine zweite Einfahrt eines Arms, die höchstens so weit (entlang des Rings in Fahrtrichtung) vor der
 *  Ausfahrt des nächsten Arms in den Ring mündet, ist ein Bypass [m] */
export const BYPASS_M = 20
/** Annahme (Velobypass, 01.11.2026): Rad- bzw. Fuss- und Radweg ganz in diesem Umkreis um die Mitte [m], ausserhalb des Aussenrands, dessen
 *  Enden je höchstens VELOBYPASS_ARM_M von der OSM-Linie zweier verschiedener Arme liegen (Toleranz für lückenhafte Kartierung) */
export const VELOBYPASS_UMKREIS_M = 60
export const VELOBYPASS_ARM_M = 25
/** Annahme: ein Velobypass ist mindestens so lang [m], und beide Enden liegen mindestens so weit ausserhalb des Aussenrands [m]; ein
 *  kurzer Radweg, der an einem Arm unmittelbar am Ring endet, ist eine Zufahrt für Velos (Beispiel Dalmazibrücke) */
export const VELOBYPASS_MIN_LAENGE_M = 20
export const VELOBYPASS_ENDE_AUSSEN_M = 5
/** Annahme (E9): ab diesem Verhältnis grösster / kleinster Aussendurchmesser gilt ein Kreisel als nicht kreisrund */
export const NICHT_RUND_AB = 1.1
/** Strahlen aus der Mitte: je Grad, Länge [m]; eine Fahrbahn, die weiter reicht, gehört zu einem Arm */
const STRAHL_M = 35
/** Fahrbahnstück eines Strahls, das die OSM-Linie nicht enthält, zählt noch bis so weit von ihr [m] */
const RING_NAH_M = 2
/** Randpunkte: Abstand Aussenrand − OSM-Linie erst bis so weit vom unteren Quartil, dann von der angepassten Form [m] */
const RAND_QUANTIL = 0.25
const RAND_TOL_M = [1.5, 1.0, 0.6, 0.6]
/** Glättung des Profils: gleitendes Mittel über ± so viele Grad */
const GLATT_GRAD = 4
/** Inselrand: Strahlen mit weniger als diesem Anteil des Medians gelten als Lücke (z. B. Tramtrassee) und werden ergänzt */
const INSEL_LUECKE_ANTEIL = 0.5
/** brauchbare AV: so viele Strahlen am Aussenrand (Anteil), Lücke zwischen ihnen höchstens so gross [°], Fahrbahn im Mittel mindestens
 *  so breit [m], mittlerer Aussenradius im Bereich [m], Mitte höchstens so weit vom Schwerpunkt der OSM-Linie [m], OSM-Linie auf
 *  mindestens diesem Anteil der Strahlen auf der Kreiselfahrbahn */
const RAND_ANTEIL = 1 / 6
const RAND_LUECKE_GRAD = 160
const BREITE_MIN_M = 3
const AUSSEN_R_MIN = 4
const AUSSEN_R_MAX = 30
const MITTE_ABWEICHUNG_M = 4
const AUF_RING_ANTEIL = 0.5

const f1 = (x: number) => x.toFixed(1).replace('.', ',')
const f2 = (x: number) => x.toFixed(2).replace('.', ',')

/** Weg des Kreiselrings? (junction=roundabout bzw. circular, befahrbar) */
const istRing = (netz: OsmNetz, wid: number) => { const w = netz.w(wid); return w.ring && w.mfz }

/** Liegt der Punkt n an einem Kreiselring? */
export const amKreisel = (netz: OsmNetz, n: number): boolean => (netz.an.get(n) ?? []).some(([w]) => istRing(netz, w))

/** Ringwege des Kreisels am Punkt n: alle Ringwege, die über gemeinsame Punkte zusammenhängen (aufsteigend); [] abseits eines Rings */
export function ringWege(netz: OsmNetz, n: number): number[] {
  const offen = (netz.an.get(n) ?? []).map(([w]) => w).filter(w => istRing(netz, w))
  const gesehen = new Set(offen)
  while (offen.length) {
    const wid = offen.pop()!
    for (const m of netz.w(wid).nds) for (const [w] of netz.an.get(m) ?? [])
      if (!gesehen.has(w) && istRing(netz, w)) { gesehen.add(w); offen.push(w) }
  }
  return [...gesehen].sort((a, b) => a - b)
}

/** Punkte des Rings in Fahrtrichtung (geschlossen: erster = letzter Punkt). Die Ringwege werden in Fahrtrichtung aneinandergehängt;
 *  geht das nicht auf, die Punkte nach dem Winkel um ihren Schwerpunkt (gegen den Uhrzeigersinn) */
export function ringFolge(netz: OsmNetz, wege: number[]): number[] {
  const gerichtet = wege.map(wid => { const w = netz.w(wid); return w.ow < 0 ? [...w.nds].reverse() : w.nds })
  if (gerichtet.length) {
    const folge = [...gerichtet[0]], benutzt = new Set([0])
    for (;;) {
      const ende = folge[folge.length - 1]
      const k = gerichtet.findIndex((g, i) => !benutzt.has(i) && g[0] === ende)
      if (k < 0) break
      benutzt.add(k); folge.push(...gerichtet[k].slice(1))
    }
    if (benutzt.size === gerichtet.length && folge.length > 3 && folge[0] === folge[folge.length - 1]) return folge
  }
  const alle = [...new Set(gerichtet.flat())]
  if (!alle.length) return []
  const s: P = [alle.reduce((x, n) => x + netz.p(n)[0], 0) / alle.length, alle.reduce((y, n) => y + netz.p(n)[1], 0) / alle.length]
  alle.sort((a, b) => winkelGrad(sub(netz.p(a), s)) - winkelGrad(sub(netz.p(b), s)))
  return [...alle, alle[0]]
}

/** Typ nach dem Aussendurchmesser (auf ganze Meter gerundet, Annahme für die Lücke zwischen 25 und 26 m): bis 25 m Minikreisel */
export const kreiselTypVorgabe = (d: number): KreiselTyp => (Math.round(d) <= MINI_D_MAX ? 'mini' : 'klein')
/** Hinweis, wenn der Aussendurchmesser ausserhalb der Norm liegt (unter 14 m bzw. über 40 m), sonst null */
export function kreiselAusserhalb(d: number): string | null {
  const g = Math.round(d)
  if (g < MINI_D_MIN) return `Aussendurchmesser ${g} m: kleiner als ein Minikreisel (${MINI_D_MIN} bis ${MINI_D_MAX} m, VSS 40 263 Ziffer 4, S. 4)`
  if (g > KLEIN_D_MAX) return `Aussendurchmesser ${g} m: grösser als ein Kleinkreisel (${KLEIN_D_MIN} bis ${KLEIN_D_MAX} m, VSS 40 263 Ziffer 3, S. 4)`
  return null
}
export const KREISEL_TYP_TEXT: Record<KreiselTyp, string> = { klein: 'Kleinkreisel', mini: 'Minikreisel' }

/** Innenring-Vorschlag: Radius seines Rands, wenn die Kreiselfahrbahn breiter als INNENRING_AB_M ist, sonst null */
export const innenringVorschlag = (aussenR: number, inselR: number): number | null =>
  (aussenR - inselR > INNENRING_AB_M + 1e-9 ? aussenR - INNENRING_AB_M : null)

// ---------------------------------------------------------------- Polarprofil (E9)
/** Einheitsvektor in Richtung grad (mathematisch: 0 = Ost, gegen den Uhrzeigersinn) */
export const richtungBei = (grad: number): P => [Math.cos(grad * Math.PI / 180), Math.sin(grad * Math.PI / 180)]
/** Wert des Profils (360 Werte je Grad) in Richtung grad, linear zwischen den Graden */
export function profilWert(prof: number[], grad: number): number {
  const g = ((grad % 360) + 360) % 360, k = Math.floor(g), f = g - k
  return prof[k % 360] * (1 - f) + prof[(k + 1) % 360] * f
}
/** Richtung [°] von mitte zu p */
export const profilWinkel = (mitte: P, p: P): number => winkelGrad(sub(p, mitte))
/** Punkt des Profils in Richtung grad */
export const profilPunkt = (mitte: P, prof: number[], grad: number): P => add(mitte, richtungBei(grad), profilWert(prof, grad))
/** Profil als geschlossene Linie (361 Punkte, gegen den Uhrzeigersinn) */
export const profilLinie = (mitte: P, prof: number[]): P[] => Array.from({ length: 361 }, (_, g) => add(mitte, richtungBei(g), prof[g % 360]))
/** Innenring bzw. Inselrand je Richtung: Grenze der Fahrlinie (E2) und des Ablenkungswinkels (Ziffer 17, Fall 1 bzw. 2) */
export const grenzeProfil = (v: Pick<KreiselVermessung, 'insel' | 'innenring'>): number[] => v.insel.map((x, g) => v.innenring[g] ?? x)

/** Schwerpunkt der Fläche innerhalb einer geschlossenen Linie */
function schwerpunkt(pts: P[]): P {
  let a = 0, x = 0, y = 0
  const o = pts[0]
  for (let i = 0; i < pts.length - 1; i++) {
    const p = sub(pts[i], o), q = sub(pts[i + 1], o), k = p[0] * q[1] - q[0] * p[1]
    a += k; x += (p[0] + q[0]) * k; y += (p[1] + q[1]) * k
  }
  return Math.abs(a) < 1e-9 ? o : [o[0] + x / (3 * a), o[1] + y / (3 * a)]
}

/** gleitendes Mittel über ± halb Grad (ringförmig) */
function glaetten(prof: number[], halb = GLATT_GRAD): number[] {
  return prof.map((_, g) => { let s = 0; for (let k = -halb; k <= halb; k++) s += prof[(g + k + 360) % 360]; return s / (2 * halb + 1) })
}
/** Lücken (null) ringförmig linear aus den nächsten Werten ergänzen */
function ergaenzen(prof: (number | null)[]): number[] {
  const gueltig = prof.map((x, g) => (x === null ? -1 : g)).filter(g => g >= 0)
  if (!gueltig.length) return prof.map(() => 0)
  return prof.map((x, g) => {
    if (x !== null) return x
    const vor = [...gueltig].reverse().find(k => k < g) ?? gueltig[gueltig.length - 1] - 360
    const nach = gueltig.find(k => k > g) ?? gueltig[0] + 360
    const f = (g - vor) / (nach - vor)
    return prof[(vor + 360) % 360]! * (1 - f) + prof[nach % 360]! * f
  })
}
/** Ausgleich y(g) = a0 + Σ (ak cos kg + bk sin kg), k ≤ ordnung (kleinste Quadrate) -> Funktion des Winkels [°] */
function fourier(gs: number[], ys: number[], ordnung: number): (g: number) => number {
  const basis = (g: number) => { const w = g * Math.PI / 180, b = [1]; for (let k = 1; k <= ordnung; k++) b.push(Math.cos(k * w), Math.sin(k * w)); return b }
  const n = 1 + 2 * ordnung, A = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0))
  gs.forEach((g, i) => { const b = basis(g); for (let r = 0; r < n; r++) { for (let c = 0; c < n; c++) A[r][c] += b[r] * b[c]; A[r][n] += b[r] * ys[i] } })
  for (let c = 0; c < n; c++) {
    const piv = A.slice(c).reduce((m, row, i) => (Math.abs(row[c]) > Math.abs(A[m][c]) ? c + i : m), c)
    ;[A[c], A[piv]] = [A[piv], A[c]]
    if (Math.abs(A[c][c]) < 1e-9) return () => median(ys)
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k] }
  }
  const x = A.map((row, i) => row[n] / row[i])
  return g => basis(g).reduce((s, b, i) => s + b * x[i], 0)
}

/** Abstand von c in Richtung r bis zur OSM-Linie des Rings (erster Schnitt), null ohne Schnitt */
function ringAbstand(c: P, r: P, ring: P[]): number | null {
  const e = add(c, r, 2 * STRAHL_M)
  let best: number | null = null
  for (let k = 0; k < ring.length - 1; k++) {
    const x = segSchnitt(c, e, ring[k], ring[k + 1])
    if (x && (best === null || x[0] < best)) best = x[0]
  }
  return best === null ? null : best * 2 * STRAHL_M
}

/** Fahrbahn auf dem Strahl c + t·r, 0 ≤ t ≤ STRAHL_M: Intervalle, aneinanderstossende Flächen zusammengefasst */
function strahl(fahrbahn: Fahrbahn, c: P, r: P): [number, number][] {
  const iv: [number, number][] = []
  for (const t of fahrbahn.r.imUmkreis(c, STRAHL_M))
    for (const [lo, hi] of intervalleImPolygon(c, r, STRAHL_M, t.poly)) if (hi > 0) iv.push([Math.max(lo, 0), hi])
  iv.sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const x of iv) {
    const l = out[out.length - 1]
    if (l && x[0] <= l[1] + 0.2) l[1] = Math.max(l[1], x[1]); else out.push([x[0], x[1]])
  }
  return out
}

interface Messung { g: number; ring: number | null; innen: number | null; aussen: number | null; aufRing: boolean }
/** je Grad: OSM-Linie, Rand der Insel (0: ab der Mitte Fahrbahn) und Aussenrand (null: Fahrbahn reicht weiter, also ein Arm) des
 *  Fahrbahnstücks, auf dem die OSM-Linie liegt (bzw. des nächsten bis RING_NAH_M) */
function strahlen(fahrbahn: Fahrbahn, c: P, ring: P[]): Messung[] {
  const out: Messung[] = []
  for (let g = 0; g < 360; g++) {
    const r = richtungBei(g), s = ringAbstand(c, r, ring), iv = strahl(fahrbahn, c, r)
    const ab = (x: [number, number]) => (s === null ? Infinity : s < x[0] ? x[0] - s : s > x[1] ? s - x[1] : 0)
    const bestes = iv.length ? iv.reduce((m, x) => (ab(x) < ab(m) ? x : m)) : null
    if (s === null || !bestes || ab(bestes) > RING_NAH_M) { out.push({ g, ring: s, innen: null, aussen: null, aufRing: false }); continue }
    const [lo, hi] = bestes
    out.push({ g, ring: s, innen: lo < 0.05 ? 0 : lo, aussen: hi >= STRAHL_M - 0.01 ? null : hi, aufRing: ab(bestes) === 0 })
  }
  return out
}

/** Quantil q (0 bis 1) der Werte, linear zwischen den Rängen */
function quantil(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b), i = q * (s.length - 1), k = Math.floor(i)
  return k + 1 < s.length ? s[k] + (s[k + 1] - s[k]) * (i - k) : s[k]
}
/** grösste Lücke [°] zwischen den Richtungen */
function groessteLuecke(gs: number[]): number {
  if (!gs.length) return 360
  const w = [...gs].sort((a, b) => a - b)
  let l = 360 - w[w.length - 1] + w[0]
  for (let i = 1; i < w.length; i++) l = Math.max(l, w[i] - w[i - 1])
  return l
}
const mittel = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const cm = (x: number) => Math.round(x * 100) / 100

/** Innenring, Fahrlinie und Kennzahlen aus Aussenrand und Insel */
function vermessungAus(quelle: 'av' | 'osm', mitte: P, aussen: number[], insel: number[], inselErgaenzt: number, strahlen: number): KreiselVermessung {
  aussen = aussen.map(cm); insel = insel.map(cm)
  const innenring = aussen.map((a, g) => (a - insel[g] > INNENRING_AB_M + 1e-9 ? cm(a - INNENRING_AB_M) : null))
  const fahrlinie = aussen.map((a, g) => cm((a + (innenring[g] ?? insel[g])) / 2))
  const d = aussen.slice(0, 180).map((a, g) => a + aussen[g + 180])
  const ir = innenring.filter((x): x is number => x !== null)
  return { quelle, mitte, aussen, insel, innenring, fahrlinie, aussenR: mittel(aussen), inselR: mittel(insel),
    breite: mittel(aussen.map((a, g) => a - insel[g])), durchmesser: mittel(d), dMin: Math.min(...d), dMax: Math.max(...d),
    innenringR: ir.length ? mittel(ir) : null, innenringAnteil: ir.length / 360, inselErgaenzt, strahlen }
}

/**
 * Vermessung aus der AV-Fahrbahn entlang der OSM-Linie des Rings (ring, geschlossen); null, wenn die AV keinen Kreisel zeigt (zu
 * wenige Randpunkte, grosse Lücke, Masse ausserhalb, Mitte weit vom Schwerpunkt der OSM-Linie, OSM-Linie kaum auf der Fahrbahn)
 */
export function kreiselAusAv(fahrbahn: Fahrbahn, ring: P[]): KreiselVermessung | null {
  const start = schwerpunkt(ring)
  let c = start, ms: Messung[] = [], rand = new Set<number>(), abstand: (g: number) => number = () => 0
  for (let pass = 0; pass < RAND_TOL_M.length; pass++) {
    ms = strahlen(fahrbahn, c, ring)
    const kand = ms.filter(m => m.aussen !== null && m.ring !== null && m.aufRing)
    if (kand.length < 10) return null
    const d = (m: Messung) => m.aussen! - m.ring!
    const q = quantil(kand.map(d), RAND_QUANTIL)
    const ziel = pass === 0 ? () => q : abstand
    const r = kand.filter(m => Math.abs(d(m) - ziel(m.g)) <= RAND_TOL_M[pass])
    if (r.length < 10) return null
    // Form des Abstands: mit zweiter Harmonischer (Oval), wenn die Randpunkte rundum liegen
    const luecke = groessteLuecke(r.map(m => m.g))
    abstand = fourier(r.map(m => m.g), r.map(d), luecke <= 120 && r.length >= 30 ? 2 : luecke <= 180 ? 1 : 0)
    rand = new Set(r.map(m => m.g))
    if (pass < RAND_TOL_M.length - 1) {
      if (ms.some(m => m.ring === null)) return null
      c = schwerpunkt(profilLinie(c, ms.map(m => (rand.has(m.g) ? m.aussen! : m.ring! + abstand(m.g)))))
    }
  }
  if (ms.some(m => m.ring === null)) return null
  if (rand.size < 360 * RAND_ANTEIL || groessteLuecke([...rand]) > RAND_LUECKE_GRAD) return null
  if (ms.filter(m => m.aufRing).length < 360 * AUF_RING_ANTEIL) return null
  const aussen = glaetten(ms.map(m => (rand.has(m.g) ? m.aussen! : m.ring! + abstand(m.g))))
  // Insel: Rand auf den Strahlen; ab der Mitte auf mehr als der Hälfte der Strahlen Fahrbahn: keine Insel; sonst Lücken ergänzt
  const innen = ms.map(m => (m.innen !== null && m.innen < aussen[m.g] ? m.innen : null))
  const bekannt = innen.filter((x): x is number => x !== null), positiv = bekannt.filter(x => x > 0)
  let insel = aussen.map(() => 0), ergaenzt = 0
  if (positiv.length > bekannt.length / 2) {
    const med = median(positiv)
    const roh = innen.map((x, g) => (x !== null && x >= INSEL_LUECKE_ANTEIL * med && x < aussen[g] - 1 ? x : null))
    ergaenzt = roh.filter(x => x === null).length
    insel = glaetten(ergaenzen(roh))
  }
  const v = vermessungAus('av', c, aussen, insel, ergaenzt, rand.size)
  if (v.aussenR < AUSSEN_R_MIN || v.aussenR > AUSSEN_R_MAX || v.breite < BREITE_MIN_M || dist(c, start) > MITTE_ABWEICHUNG_M) return null
  return v
}

/** Schätzung ohne brauchbare AV (Annahme): Form der OSM-Linie, die in der Mitte einer KREISEL_BREITE_OHNE_AV_M breiten
 *  Kreiselfahrbahn liegt (ohne Schnitt in einer Richtung: Ausgleichskreis) */
export function kreiselAusOsm(ring: P[], osm: { m: P; r: number }): KreiselVermessung {
  const c = schwerpunkt(ring), h = KREISEL_BREITE_OHNE_AV_M / 2
  const s = Array.from({ length: 360 }, (_, g) => ringAbstand(c, richtungBei(g), ring))
  const mitte = s.some(x => x === null) ? osm.m : c
  const linie = s.some(x => x === null) ? s.map(() => osm.r) : (s as number[])
  return vermessungAus('osm', mitte, linie.map(x => x + h), linie.map(x => Math.max(0, x - h)), 0, 0)
}

/** Kommt ein Motorfahrzeug von aussen auf den Arm a (Weg mit Gegenverkehr, ab dem Ring)? Nein nur, wenn weiter aussen Wege für
 *  Motorfahrzeuge anschliessen und alle vom Ring weg führen (Annahme; z. B. kurzes Stück ohne Einbahn für Velos von einem Radweg, dahinter
 *  nur eine Einbahn weg vom Ring). Ohne Anschluss (Sackgasse) oder am nächsten Ring: ja. Wege mit Gegenverkehr werden weiterverfolgt */
function vonAussen(netz: OsmNetz, a: Arm, gesehen = new Set<string>()): boolean {
  const [wid, i, sd] = a, w = netz.w(wid), schluessel = `${wid}:${sd}`
  if (gesehen.has(schluessel)) return false
  gesehen.add(schluessel)
  let anschluesse = 0
  for (let k = i + sd; k >= 0 && k < w.nds.length; k += sd) for (const [v, j] of netz.an.get(w.nds[k]) ?? []) {
    const x = netz.w(v)
    if (v === wid || !x.mfz || x.ring) continue
    for (const r of [-1, 1]) {
      if (j + r < 0 || j + r >= x.nds.length) continue
      anschluesse++
      const weiter: Arm = [v, j, r]
      if (netz.zufluss(weiter) && (x.ow !== 0 || vonAussen(netz, weiter, gesehen))) return true
    }
  }
  return anschluesse === 0
}

/** Arme des Kreisels an den Ringpunkten (ohne Ringwege, ohne service), Ein- und Ausfahrt je Strasse zusammengefasst, nummeriert.
 *  folge: Ringpunkte in Fahrtrichtung (geschlossen, für den Bypass); ohne folge kein Bypass */
export function kreiselArme(netz: OsmNetz, ringKnoten: number[], mitte: P, folge: number[] = []): KreiselArm[] {
  const roh = ringKnoten.flatMap(n => strassenArme(netz, n).filter(a => !netz.w(a[0]).ring).map(a => {
    const aussen = netz.armPunkt(a, KREISEL_ARM_M)
    const info = armInfo(netz, a), nurAusfahrt = info.einbahn === 0 && !vonAussen(netz, a)
    return { a, info: nurAusfahrt ? { ...info, zufluss: false, einbahn: a[2] } : info, n, r: einheit(sub(aussen, mitte)), nurAusfahrt }
  }))
  type Roh = typeof roh[number]
  // zusammen gehören zwei OSM-Arme in derselben Richtung (KREISEL_ARM_GRAD) mit gleichem Namen (z. B. Einfahrt und Ausfahrt um eine
  // Leitinsel, ein Weg mit Gegenverkehr und eine zusätzliche Einfahrt) bzw., wenn einer keinen Namen hat, eine Einbahn zum Ring und eine
  // vom Ring weg; verschiedene Namen bleiben getrennt
  const nurEin = (x: Roh) => x.info.einbahn !== 0 && x.info.zufluss, nurAus = (x: Roh) => x.info.einbahn !== 0 && !x.info.zufluss
  const passen = (x: Roh, y: Roh) => wdiff(x.r, y.r) <= KREISEL_ARM_GRAD && (x.info.name && y.info.name ? x.info.name === y.info.name :
    (nurEin(x) && nurAus(y)) || (nurAus(x) && nurEin(y)))
  // das engste Paar zuerst; zwei Gruppen nur, wenn alle ihre Arme zueinander passen
  const gruppe = new Map<Roh, Roh[]>(roh.map(x => [x, [x]]))
  const paare = roh.flatMap((x, i) => roh.slice(i + 1).map(y => ({ x, y, w: wdiff(x.r, y.r) }))).filter(p => passen(p.x, p.y))
    .sort((p, q) => p.w - q.w)
  for (const { x, y } of paare) {
    const gx = gruppe.get(x)!, gy = gruppe.get(y)!
    if (gx === gy || !gx.every(u => gy.every(v => passen(u, v)))) continue
    const g = [...gx, ...gy]
    for (const u of g) gruppe.set(u, g)
  }
  const gruppen = [...new Set(gruppe.values())]
  // E10: Lage der Ringpunkte entlang des Rings in Fahrtrichtung; eine zweite Einfahrt, die höchstens BYPASS_M vor der nächsten Ausfahrt
  // eines anderen Arms mündet, ist ein Bypass (mindestens eine Einfahrt bleibt)
  const lage = new Map<number, number>(), pts = folge.map(k => netz.p(k))
  let L = 0
  folge.forEach((k, i) => { if (i) L += dist(pts[i - 1], pts[i]); if (!lage.has(k)) lage.set(k, L) })
  const vorwaerts = (a: number, b: number) => ((lage.get(b)! - lage.get(a)!) % L + L) % L
  const ausfahrten = roh.filter(x => !x.info.zufluss || x.info.einbahn === 0)
  const naechsteAusfahrt = (x: Roh, g: Roh[]) => {
    if (!lage.has(x.n) || L <= 0) return null
    const k = ausfahrten.filter(y => !g.includes(y) && lage.has(y.n)).map(y => ({ y, s: vorwaerts(x.n, y.n) })).filter(z => z.s > 0)
    return k.length ? k.reduce((m, z) => (z.s < m.s ? z : m)) : null
  }
  const linie = (a: Arm) => [netz.p(netz.w(a[0]).nds[a[1]]), ...netz.armLinie(a, 25).slice(1)]
  const bypassVon = new Map<Roh[], { x: Roh; s: number; vor: Roh }[]>()
  for (const g of gruppen) {
    const einfahrten = g.filter(x => x.info.zufluss)
    if (einfahrten.length < 2) continue
    const kand = einfahrten.filter(nurEin).map(x => ({ x, z: naechsteAusfahrt(x, g) }))
      .filter((k): k is { x: Roh; z: { y: Roh; s: number } } => !!k.z && k.z.s <= BYPASS_M).sort((p, q) => p.z.s - q.z.s)
    const bp = kand.slice(0, einfahrten.length - 1).map(k => ({ x: k.x, s: k.z.s, vor: k.z.y }))
    if (bp.length) bypassVon.set(g, bp)
  }
  const arme = gruppen.map(g => {
    const bp = bypassVon.get(g) ?? [], ohne = g.filter(x => !bp.some(b => b.x === x))
    const e = ohne.find(nurEin) ?? ohne.find(x => x.info.zufluss) ?? null, x = ohne.find(nurAus) ?? ohne.find(x => x.info.einbahn === 0) ?? null
    const haupt = e ?? x ?? g[0]
    const richtung = einheit(ohne.reduce<P>((s, y) => add(s, y.r), [0, 0]))
    const name = g.map(y => y.info.name).find(y => y) ?? ''
    const hw = g.map(y => y.info.hw).sort((a, b) => (HW_RANG[a] ?? 9) - (HW_RANG[b] ?? 9))[0]
    return { ...haupt.info, name, hw, richtung, himmel: himmelsrichtung(richtung), ein: e?.info.key ?? null, aus: x?.info.key ?? null,
      getrennt: ohne.length > 1, anschluss: ohne.map(y => netz.p(y.n)), linien: ohne.map(y => linie(y.a)), bypass: [] as KreiselBypass[],
      velobypass: [] as KreiselVelobypass[], nurAusfahrt: g.filter(y => y.nurAusfahrt).map(y => y.a[0]),
      bpRoh: bp, gruppe: g }
  })
  // Bypass erst nach dem Nummerieren beschriften (Ausfahrt des nächsten Arms mit Nummer)
  const nummeriert = nummerieren(arme)
  const armVon = (y: Roh) => nummeriert.find(a => a.gruppe.includes(y))!
  return nummeriert.map(({ bpRoh, gruppe: _g, ...a }) => ({ ...a,
    bypass: bpRoh.map(b => ({ key: b.x.info.key, wid: b.x.a[0], linie: linie(b.x.a), abstand: b.s, vor: armText(armVon(b.vor)) })) }))
}

/** Velobypässe: highway=cycleway bzw. path/footway mit bicycle=designated|yes (ohne Querungen), über gemeinsame
 *  Punkte zu Ketten verbunden; eine Kette ganz im Umkreis VELOBYPASS_UMKREIS_M, ohne Ringpunkt und ausserhalb des Aussenrands, mindestens
 *  VELOBYPASS_MIN_LAENGE_M lang, deren Enden mindestens VELOBYPASS_ENDE_AUSSEN_M ausserhalb des Aussenrands und je höchstens
 *  VELOBYPASS_ARM_M von zwei verschiedenen Armen liegen (Arm = OSM-Linie der Ein- und Ausfahrt, 80 m). Richtung:
 *  bei Einbahn in Wegrichtung, sonst vom Arm mit der kleineren Nummer. -> je Arm (Schlüssel) die Velobypässe ab ihm */
export function velobypaesse(netz: OsmNetz, wege: OsmWeg[], v: KreiselVermessung, arme: KreiselArm[], ringKnoten: number[]): Map<string, KreiselVelobypass[]> {
  const aus = new Map<string, KreiselVelobypass[]>()
  const ring = new Set(ringKnoten)
  const kand = wege.filter(w => { const t = w.tags
    return [t.footway, t.path, t.cycleway].every(x => x !== 'crossing') && (t.highway === 'cycleway' ||
      (['path', 'footway'].includes(t.highway ?? '') && ['designated', 'yes'].includes(t.bicycle ?? ''))) })
  // Ketten: Wege mit gemeinsamen Punkten (Union-Find)
  const eltern = kand.map((_, i) => i)
  const wurzel = (i: number): number => (eltern[i] === i ? i : (eltern[i] = wurzel(eltern[i])))
  const an = new Map<number, number>()
  kand.forEach((w, i) => { for (const n of w.knoten) { const j = an.get(n); if (j === undefined) an.set(n, i); else eltern[wurzel(i)] = wurzel(j) } })
  const ketten = new Map<number, OsmWeg[]>()
  kand.forEach((w, i) => { const r = wurzel(i); ketten.set(r, [...(ketten.get(r) ?? []), w]) })
  const linieVon = (key: string) => { const [w, i, s] = key.split(':').map(Number) as Arm; return [netz.p(netz.w(w).nds[i]), ...netz.armLinie([w, i, s], 80).slice(1)] }
  const armLinien = arme.map(a => ({ a, l: [a.ein, a.aus].filter((k): k is string => !!k).filter((k, i, x) => x.indexOf(k) === i).map(linieVon) }))
  const naechster = (p: P) => armLinien.map(({ a, l }) => ({ a, d: Math.min(...l.flatMap(x => x.slice(0, -1).map((q, k) => abstandStrecke(p, q, x[k + 1])))) }))
    .reduce((m, x) => (x.d < m.d ? x : m))
  for (const kette of ketten.values()) {
    const linien = kette.map(w => w.geom.map(([la, lo]) => lv95(la, lo)))
    const pts = linien.flat()
    if (kette.some(w => w.knoten.some(n => ring.has(n)))) continue
    if (pts.some(p => dist(p, v.mitte) > VELOBYPASS_UMKREIS_M || dist(p, v.mitte) < profilWert(v.aussen, profilWinkel(v.mitte, p)) - 0.5)) continue
    // Enden der Kette: Punkte, die nur einmal als Wegende vorkommen
    const zahl = new Map<number, number>()
    for (const w of kette) for (const n of [w.knoten[0], w.knoten[w.knoten.length - 1]]) zahl.set(n, (zahl.get(n) ?? 0) + 1)
    const enden: P[] = []
    kette.forEach((w, i) => { for (const [n, p] of [[w.knoten[0], linien[i][0]], [w.knoten[w.knoten.length - 1], linien[i][linien[i].length - 1]]] as [number, P][])
      if (zahl.get(n) === 1 && kette.filter(x => x.knoten.includes(n)).length === 1) enden.push(p) })
    if (enden.length !== 2) continue
    const laenge = linien.reduce((x, l) => x + l.slice(1).reduce((y, q, k) => y + dist(l[k], q), 0), 0)
    if (laenge < VELOBYPASS_MIN_LAENGE_M ||
      enden.some(p => dist(p, v.mitte) < profilWert(v.aussen, profilWinkel(v.mitte, p)) + VELOBYPASS_ENDE_AUSSEN_M)) continue
    const [e0, e1] = enden.map(naechster)
    if (e0.d > VELOBYPASS_ARM_M || e1.d > VELOBYPASS_ARM_M || e0.a === e1.a) continue
    const einbahn = kette.length === 1 && ['yes', '1'].includes(kette[0].tags.oneway ?? '')
    const [von, zu] = einbahn || e0.a.nr.localeCompare(e1.a.nr, 'de', { numeric: true }) <= 0 ? [e0.a, e1.a] : [e1.a, e0.a]
    aus.set(von.key, [...(aus.get(von.key) ?? []), { wege: kette.map(w => w.id), linien, zu: armText(zu), einbahn }])
  }
  return aus
}

/** Kreisel am Punkt n: Ring, Arme, Vermessung (aus der AV, sonst aus OSM geschätzt), Typ (typWahl von Hand), K2 gewählte Einfahrt
 *  (zufahrt: Schlüssel des Kreiselarms), K3 Fahrbeziehungen (beziehungen: von Hand an bzw. ab) -> KnotenInfo bzw. null, wenn n an keinem
 *  Ring liegt */
export function kreiselKnoten(netz: OsmNetz, fahrbahn: Fahrbahn | null, n: number, typWahl: KreiselTyp | null = null,
  zufahrt: string | null = null, beziehungen: Record<string, boolean> | null = null, velowege: OsmWeg[] = []): KnotenInfo | null {
  const wege = ringWege(netz, n)
  if (!wege.length) return null
  const folge = ringFolge(netz, wege)
  const ring = folge.map(k => netz.p(k))
  const ringKnoten = [...new Set(folge)].sort((a, b) => a - b)
  const osm = kreisAnpassen(segmentieren(ring, 1).slice(0, -1)) ?? { m: ring[0], r: 0 }
  const v = (fahrbahn && kreiselAusAv(fahrbahn, ring)) || kreiselAusOsm(ring, osm)
  const arme0 = kreiselArme(netz, ringKnoten, v.mitte, folge)
  const vb = velobypaesse(netz, velowege, v, arme0, ringKnoten)
  const arme = arme0.map(a => ({ ...a, velobypass: vb.get(a.key) ?? [] }))
  const typVorgabe = kreiselTypVorgabe(v.durchmesser), typ = typWahl ?? typVorgabe
  const annahmen: string[] = [], hinweise: string[] = []
  if (v.quelle === 'osm') annahmen.push(`Masse geschätzt: Die AV zeigt hier keinen Kreisel. Die App nimmt an, dass die OSM-Linie in der ` +
    `Mitte einer ${f2(KREISEL_BREITE_OHNE_AV_M)} m breiten Kreiselfahrbahn liegt.`)
  annahmen.push(`Typ nach dem mittleren Aussendurchmesser, auf ganze Meter gerundet: bis ${MINI_D_MAX} m Minikreisel, ab ${KLEIN_D_MIN} m ` +
    'Kleinkreisel.')
  if (arme.some(a => a.getrennt)) annahmen.push(`Getrennte OSM-Wege derselben Strasse (z. B. Einfahrt und Ausfahrt um eine Leitinsel) ` +
    `bilden einen Arm, wenn sie ${KREISEL_ARM_M} m vom Ring höchstens ${KREISEL_ARM_GRAD}° auseinander liegen (von der Mitte aus gesehen).`)
  for (const a of nachNr(arme)) for (const w of a.nurAusfahrt) annahmen.push(`Arm ${armText(a)}: Der OSM-Weg ${w} ist ohne Einbahn erfasst, ` +
    'aber von aussen führt kein Weg für Motorfahrzeuge zu ihm. Er zählt nur als Ausfahrt.')
  const ausserhalb = kreiselAusserhalb(v.durchmesser)
  if (v.dMax / v.dMin >= NICHT_RUND_AB) hinweise.push(`Nicht kreisrund: Aussendurchmesser ${f1(v.dMin)} bis ${f1(v.dMax)} m; der Typ ` +
    `richtet sich nach dem mittleren (${f1(v.durchmesser)} m). Als nicht kreisrund gilt ein Verhältnis ab ${f1(NICHT_RUND_AB)} (Annahme).`)
  if (typWahl && typWahl !== typVorgabe) hinweise.push(`Typ von Hand: ${KREISEL_TYP_TEXT[typWahl]} (nach dem Durchmesser ` +
    `${f1(v.durchmesser)} m: ${KREISEL_TYP_TEXT[typVorgabe]}).`)
  if (v.inselR === 0) hinweise.push('Die AV zeigt keine Mittelinsel ohne Fahrbahn (überfahrbare Insel?); vor Ort prüfen.')
  const tramSchnitt = (flaeche: P[]) => netz.tram.some(l => segmentieren(l, 1).some(p => imPolygon(p, [flaeche])))
  if (v.inselErgaenzt > 0 && v.inselR > 0) {
    if (tramSchnitt(profilLinie(v.mitte, v.insel))) hinweise.push('Das Tramtrassee führt durch die Mittelinsel: Durchsicht über das ' +
      'Tramtrassee (VSS 40 263 Ziffer 13.3, S. 9). Der Inselrand ist über die Lücke ergänzt.')
    else annahmen.push(`Die Mittelinsel ist in der AV nicht geschlossen; ihr Rand ist auf ${v.inselErgaenzt}° aus den Nachbarn ergänzt.`)
  }
  if (tramSchnitt(profilLinie(v.mitte, v.aussen))) hinweise.push('Ein Tramgleis quert die Kreiselfahrbahn (OSM railway=tram).')
  for (const a of arme) for (const b of a.bypass) hinweise.push(`Arm ${armText(a)}: Die zweite Einfahrt (OSM-Weg ${b.wid}) mündet ` +
    `${Math.round(b.abstand)} m vor der Ausfahrt ${b.vor} in den Ring und gilt als Bypass (Annahme: bis ${BYPASS_M} m). Das Einfädeln ` +
    'prüft die App nicht.')
  for (const a of nachNr(arme)) for (const x of a.velobypass) hinweise.push(`Velobypass von Arm ${armText(a)} zu Arm ${x.zu} (OSM-Weg ` +
    `${x.wege.join(', ')}): Querungen und Einmündungen des Bypasses prüft die App nicht.`)
  const ringName = [...new Set(wege.map(w => netz.w(w).name).filter(x => x))]
  const namen = [...new Set(nachNr(arme).map(a => a.name).filter(x => x))]
  const zArm = zufahrt ? arme.find(a => a.key === zufahrt && a.ein) ?? null : null
  // Rad- und Fusswege (ohne Querungen) begrenzen den Querschnitt der Ein- und Ausfahrten
  const trenner = velowege.filter(w => ['cycleway', 'path', 'footway'].includes(w.tags.highway ?? '') &&
    [w.tags.footway, w.tags.path, w.tags.cycleway].every(x => x !== 'crossing')).map(w => w.geom.map(([la, lo]) => lv95(la, lo)))
  const z = zArm ? kreiselZufahrt(netz, fahrbahn, v, zArm, trenner) : null
  // K jeder Einfahrt (für die Begrenzung der Sichtlinien an der vorherigen Einfahrt, K4)
  const einfahrtK: Record<string, P> = {}, einfahrtAchse: Record<string, P[]> = {}
  if (zArm) for (const a of arme.filter(x => x.ein)) {
    const za = a === zArm ? z : kreiselZufahrt(netz, fahrbahn, v, a, trenner)
    if (za && typeof za !== 'string') { einfahrtK[a.key] = za.K; einfahrtAchse[a.key] = za.achse }
  }
  const beta = kreiselBeta(netz, fahrbahn, v, arme, typ, beziehungen ?? {}, {}, trenner)
  if (beta.betaGon !== null && beta.betaGon < BETA_EMPFOHLEN_GON) hinweise.push(`Kleinstes β ${f1(beta.betaGon)} gon: unter den empfohlenen ` +
    `${BETA_EMPFOHLEN_GON} gon (VSS 40 263 Ziffer 17, S. 13).`)
  const kreisel: KreiselInfo = { ringKnoten, ringWege: wege, ring, osmMitte: osm.m, osmR: osm.r, arme, vermessung: v, typ, typVorgabe,
    typGewaehlt: typWahl !== null, ausserhalb, zufahrt: z && typeof z !== 'string' ? z : null, einfahrtK, einfahrtAchse,
    zufahrtFehler: zufahrt && !zArm ? 'Die gewählte Einfahrt gehört nicht zu diesem Kreisel.' : typeof z === 'string' ? z : null,
    beta, sicht: null, annahmen, hinweise }
  const id = ringKnoten[0]
  return { id, p: v.mitte, ll: wgs(v.mitte[0], v.mitte[1]), name: (ringName.length ? ringName : namen).join(' / ') || `OSM-Punkt ${id}`,
    arme: [], vortritt: null, vortrittGrund: '', vorschlag: null, signale: [], kreisel }
}

/** Meldung am Kreisel ohne gewählte Einfahrt (K4) */
export const KREISEL_EINFAHRT_TEXT = 'Kreisel: Einfahrt wählen, um die Sicht zu prüfen.'
