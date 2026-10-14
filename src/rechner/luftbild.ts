// ── Streifen-Erkennung im Luftbild (E3) ──
//
// Kern nach fgs_luftbild.py des Berner Projekts (Gelb-Merkmal b* im Lab-Raum mit Grün-Dämpfung, Balkentakt, normierte
// Kreuzkorrelation), dort ein Abgleich Kataster gegen Bild. Hier entsteht der Streifen OHNE Kataster aus dem Bild:
//   1. Merkmal: b* (CIE-Lab, Gelb-Blau-Achse) je Pixel, Grün (a* deutlich negativ: Laub, Rasen) auf den Median gedämpft.
//   2. Abtasten in einem Rahmen am OSM-Übergang bzw. Klick: u entlang der Fahrbahn (Balkenrichtung; die Balken eines
//      Fussgängerstreifens liegen parallel zur Fahrbahn), n quer darüber (Streifenachse); nur Punkte auf der AV-Fahrbahn.
//      Probiert werden kleine Drehungen der Fahrbahnrichtung (DREH_GRAD) und schräge Achsen (SCHRAEG_GRAD: Balken
//      parallel zur Fahrbahn, Achse schief).
//   3. Takt: je Lage u das Profil quer (über ±BALKEN_FENSTER_M entlang der Balken gemittelt) und seine Korrelation mit
//      einer Schwingung der Periode P (Balkentakt 0,92 … 1,12 m). Die beste Lage (mit kleinem Abzug je m Abstand vom
//      Übergang) ist der Streifen; die Phase gibt die Balkenmitten.
//   4. Balken: je Balkenmitte Kontrast (Balken minus Lücken daneben); vorhandene Balken bilden Gruppen. Fehlen Balken
//      auf der Fahrbahn (Fahrzeug, Abrieb), bleibt die Gruppe zusammen; liegt dazwischen keine Fahrbahn (AV-Insel),
//      entstehen Teilstreifen (wie im Kataster).
//   5. Balkenlänge (= Breite des Streifens): Kontrast Balken – Lücken entlang u, Bereich über LAENGE_SCHWELLE des
//      Höchstwerts (Lücken bis 0,5 m überbrückt), wie fgs_luftbild.balken_enden.
//   6. Sicherheitsmass: NCC der gefundenen Balken-Vorlage mit dem Merkmal über ihrem Träger (Hülle + Rand) und der
//      Gelb-Kontrast (Balken minus Umgebung): «erkannt», «unsicher» (schwaches Muster, Schatten) oder «nicht gefunden».
// Weisse Streifen (nur in Ausnahmefällen) erkennt die App nicht.

import { type P, add, einheit, links, dist, imPolygon, abstandStrecke, streckenSchnitt } from '../geo'

export const AUFLOESUNG_M = 0.1          // SWISSIMAGE 10 cm
export const FENSTER_M = 30              // Bildausschnitt: Ort ± so viel
const GRUEN_A: [number, number] = [-9.0, -15.0]   // a*: ab −9 wird b* gedämpft, ab −15 ganz
const SU_M = 26                          // Suche entlang der Fahrbahn: ± so viel um den Ort
const SN_M = 18                          // quer: ± so viel
const SCHRITT_M = 0.1
const BALKEN_FENSTER_M = 1.5             // Profil quer: entlang der Balken über ± so viel gemittelt
const PERIODEN = [0.92, 0.96, 1.0, 1.04, 1.08, 1.12]
const DREH_GRAD = [-24, -20, -16, -12, -8, -4, 0, 4, 8, 12, 16, 20, 24]
const SCHRAEG_GRAD = [-30, -24, -18, -12, -6, 0, 6, 12, 18, 24, 30]
const NAH_M = 8                          // zuerst so weit entlang der Fahrbahn um den Ort suchen
const ABSTAND_STRAFE = 0.012             // je m Abstand vom Ort so viel von der Korrelation abziehen
const N_MIN = 20                         // so viele gültige Punkte (2 m) quer mindestens
const AMP_REF = 4.0                       // Stärke der Schwingung (b*): Gewicht 1 − e^(−A/AMP_REF)
const AMPLITUDE_MIN = 1.5                // Schwingung mindestens so stark (b*)
const BALKEN_KONTRAST = 3.0              // Balken vorhanden: so viel gelber als die Lücken daneben (KONTRAST_MIN)
const LUECKE_BALKEN_MAX = 2              // so viele fehlende Balken auf der Fahrbahn halten eine Gruppe zusammen
const INSEL_LUECKE_MAX_M = 12            // Teilstreifen: Lücke ohne Fahrbahn höchstens so breit (TEIL_LUECKE_MAX_M)
const LAENGE_SCHWELLE = 0.35
const LAENGE_LUECKE_M = 0.5
export const BALKEN_BREITE_M = 0.5
const MARGE_U_M = 0.8, MARGE_N_M = 0.6   // Träger der Vorlage (MARGE_FAHRBAHN_M, MARGE_ACHSE_M)
export const NCC_SICHER = 0.45, NCC_MIN = 0.30
const BALKEN_SICHER = 4                  // «erkannt» erst ab so vielen Balken (Fahrzeug mit Schatten wirkt wie 2–3 Balken)
export const KONTRAST_SICHER = 4.5, KONTRAST_UNSICHER = 3.0   // ZEBRA_KONTRAST, ZEBRA_KONTRAST_SCHWACH
const DUNKEL_L = 25.0, DUNKEL_ANTEIL = 0.5
const GRUEN_ANTEIL = 0.3                 // Ende verlängern, wenn bis zur Bordkante so viel Grün bzw. Schatten liegt
const ENDE_RAND_M = 1.0                  // Streifenende höchstens so weit vor der Bordkante (AV-Fahrbahn)
const ENDE_OFFEN_ANTEIL = 0.35          // Balken laufen hinter dem Ende weiter: Kontrast dort mindestens so viel vom Höchstwert
const VERLAENGERN_MAX_M = 3.0            // höchstens so weit verlängern (sonst unsicher)
const RAND_VOR_M = 0.3                   // verlängertes Ende so weit vor der Bordkante (RAND_ZUSCHLAG)
const KNOTEN_RAND_M = 1.0                // OSM-Knoten höchstens so weit neben dem erkannten Streifen
const KNOTEN_ACHSE_M = 2.0               // … und entlang der Fahrbahn höchstens so weit neben der Achse
const KNOTEN_MITTE_M = 4.0               // Streifenmitte höchstens so weit vom Knoten (ZEBRA_RADIUS_M)

export interface Bild {
  w: number; h: number
  box: [number, number, number, number]       // LV95 e0, n0, e1, n1 (Pixelränder)
  res: number
  L: Float32Array; F: Float32Array            // Helligkeit L*, Gelb-Merkmal
  A: Float32Array                             // a* (Grün negativ)
}

// ---------------------------------------------------------------- Farbe
const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
const fLab = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)

/** sRGB (D65, 8 bit) -> CIE-Lab wie fgs_luftbild.lab */
export function lab(r: number, g: number, b: number): [number, number, number] {
  const R = LIN[r], G = LIN[g], B = LIN[b]
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
  const fx = fLab(x), fy = fLab(y), fz = fLab(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Median über ein Histogramm (Schritt 0,25) – genügt für die Dämpfung */
function medianHist(v: Float32Array): number {
  const lo = -128, step = 0.25, n = 1025
  const h = new Uint32Array(n)
  for (let i = 0; i < v.length; i++) h[Math.max(0, Math.min(n - 1, Math.round((v[i] - lo) / step)))]++
  let s = 0
  for (let k = 0; k < n; k++) { s += h[k]; if (s * 2 >= v.length) return lo + k * step }
  return 0
}

/** Gelb-Merkmal (fgs_luftbild.merkmal_gelb): b*, Grün auf den Median gedämpft */
export function merkmalGelb(a: Float32Array, b: Float32Array): Float32Array {
  // Median über die nicht grünen Pixel (Belag, Dächer): Grün zählt wie Hintergrund, nicht wie Gelb
  const ohne = b.filter((_, i) => a[i] > GRUEN_A[0])
  const m = medianHist(ohne.length ? ohne : b)
  const F = new Float32Array(b.length)
  for (let i = 0; i < b.length; i++) {
    const w = Math.max(0, Math.min(1, (a[i] - GRUEN_A[1]) / (GRUEN_A[0] - GRUEN_A[1])))
    F[i] = m + (b[i] - m) * w
  }
  return F
}

/** Bild aus RGBA- bzw. RGB-Pixeln (kanaele 4 bzw. 3) für den LV95-Ausschnitt box */
export function bildAusPixeln(px: ArrayLike<number>, w: number, h: number, box: [number, number, number, number],
  kanaele = 4): Bild {
  const n = w * h
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const [l, a, b] = lab(px[i * kanaele], px[i * kanaele + 1], px[i * kanaele + 2])
    L[i] = l; A[i] = a; B[i] = b
  }
  return { w, h, box, res: (box[2] - box[0]) / w, L, A, F: merkmalGelb(A, B) }
}

/** Wert an einem LV95-Punkt (bilinear, Pixelmitten), ausserhalb NaN */
export function wertBei(bild: Bild, feld: Float32Array, p: P): number {
  const x = (p[0] - bild.box[0]) / bild.res - 0.5, y = (bild.box[3] - p[1]) / bild.res - 0.5
  if (x < 0 || y < 0 || x > bild.w - 1 || y > bild.h - 1) return NaN
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, bild.w - 1), y1 = Math.min(y0 + 1, bild.h - 1)
  const fx = x - x0, fy = y - y0
  return (feld[y0 * bild.w + x0] * (1 - fx) + feld[y0 * bild.w + x1] * fx) * (1 - fy) +
    (feld[y1 * bild.w + x0] * (1 - fx) + feld[y1 * bild.w + x1] * fx) * fy
}

// ---------------------------------------------------------------- Takt und NCC (auch für Tests)
/**
 * Korrelation eines Profils x (Werte im Abstand schritt, NaN = ungültig) mit einer Schwingung der Periode P:
 * -> [r (0…1), Amplitude, Phase φ (Maxima bei s = φ/2π·P + k·P, s ab Index 0)]
 */
export function taktKorrelation(x: ArrayLike<number>, schritt: number, P: number,
  tab: [Float32Array, Float32Array] | null = null): [number, number, number] {
  let n = 0, s = 0
  for (let j = 0; j < x.length; j++) if (!Number.isNaN(x[j])) { n++; s += x[j] }
  if (n < 3) return [0, 0, 0]
  const m = s / n
  let C = 0, S = 0, V = 0
  for (let j = 0; j < x.length; j++) {
    if (Number.isNaN(x[j])) continue
    const d = x[j] - m
    if (tab) { C += d * tab[0][j]; S += d * tab[1][j] } else { const t = 2 * Math.PI * j * schritt / P; C += d * Math.cos(t); S += d * Math.sin(t) }
    V += d * d
  }
  if (V <= 1e-9) return [0, 0, 0]
  return [Math.min(1, Math.sqrt((C * C + S * S) / (V * n / 2))), 2 * Math.sqrt(C * C + S * S) / n, Math.atan2(S, C)]
}

/** NCC einer Vorlage T (0/1) über ihrem Träger W (0/1) mit dem Merkmal F (gleich lang; NaN in F zählt nicht) */
export function nccVorlage(F: ArrayLike<number>, T: ArrayLike<number>, W: ArrayLike<number>): number {
  let n = 0, sf = 0, st = 0
  for (let i = 0; i < F.length; i++) if (W[i] && !Number.isNaN(F[i])) { n++; sf += F[i]; st += T[i] }
  if (n < 2) return 0
  const mf = sf / n, mt = st / n
  let c = 0, vf = 0, vt = 0
  for (let i = 0; i < F.length; i++) {
    if (!W[i] || Number.isNaN(F[i])) continue
    const df = F[i] - mf, dt = T[i] - mt
    c += df * dt; vf += df * df; vt += dt * dt
  }
  return vf > 1e-9 && vt > 1e-9 ? c / Math.sqrt(vf * vt) : 0
}

// ---------------------------------------------------------------- Erkennung
export type Befund = 'erkannt' | 'unsicher' | 'nicht_gefunden'
export interface TeilErkannt { p0: P; p1: P; q0: P; q1: P; richtung: P; bw: number; umriss: P[]; nBalken: number; balkenS: number[] }
// q0/q1: Enden auf der geschrägten Achse durch die Balkenmitten, richtung: Balkenrichtung (für einen Streifen von Hand);
// balkenS: Balkenmitten entlang der Achse ab p0 (m; für die Insel nach OSM, rechner/streifen.ts)
// schraegGrad der Erkennung: Achse schief zu den Balken; im Kataster-Sinn (Streifen.schraeg) ist es −schraegGrad
export interface Erkennung {
  befund: Befund
  gruende: string[]
  ncc: number; kontrast: number; periode: number; schraegGrad: number; drehungGrad: number
  abstandM: number                        // Mitte des Streifens vom Ort
  teile: TeilErkannt[]
  balken: P[][]                           // Balken (Ringe) zur Anzeige
  ms: number
}

interface Raster { nu: number; nn: number; U: Float32Array; N: Float32Array; F: Float32Array; ud: P; nd: P }

export function abtasten(bild: Bild, c: P, u: P, auf: ((p: P) => boolean) | null): Raster {
  const nu = Math.round(2 * SU_M / SCHRITT_M) + 1, nn = Math.round(2 * SN_M / SCHRITT_M) + 1
  const U = new Float32Array(nu).map((_, i) => -SU_M + i * SCHRITT_M)
  const N = new Float32Array(nn).map((_, j) => -SN_M + j * SCHRITT_M)
  const nd = links(u)
  const F = new Float32Array(nu * nn)
  for (let i = 0; i < nu; i++) for (let j = 0; j < nn; j++) {
    const p: P = [c[0] + u[0] * U[i] + nd[0] * N[j], c[1] + u[1] * U[i] + nd[1] * N[j]]
    F[i * nn + j] = auf && !auf(p) ? NaN : wertBei(bild, bild.F, p)
  }
  return { nu, nn, U, N, F, ud: u, nd }
}

/** Präfixsummen je Querindex j über u (Werte, Anzahl gültiger) */
function praefix(R: Raster): [Float64Array, Uint16Array] {
  const { nu, nn, F } = R
  const S = new Float64Array((nu + 1) * nn), K = new Uint16Array((nu + 1) * nn)
  for (let i = 0; i < nu; i++) for (let j = 0; j < nn; j++) {
    const v = F[i * nn + j], o = i * nn + j, q = (i + 1) * nn + j
    S[q] = S[o] + (Number.isNaN(v) ? 0 : v); K[q] = K[o] + (Number.isNaN(v) ? 0 : 1)
  }
  return [S, K]
}

interface Treffer { r: number; wert: number; i: number; sigma: number; P: number; phi: number; amp: number; dreh: number }

/** Querprofil an der Lage i (geschert um sigma) mit Fenster ±h Indizes entlang u */
function profil(R: Raster, S: Float64Array, K: Uint16Array, i: number, tanS: number, h: number, aus: Float32Array): void {
  const { nu, nn, N } = R
  for (let j = 0; j < nn; j++) {
    const ii = i + Math.round(N[j] * tanS / SCHRITT_M)
    const a = Math.max(0, ii - h), b = Math.min(nu, ii + h + 1)
    if (b <= a) { aus[j] = NaN; continue }
    const k = K[b * nn + j] - K[a * nn + j]
    aus[j] = k >= Math.max(3, 0.7 * (b - a)) && b - a >= h ? (S[b * nn + j] - S[a * nn + j]) / k : NaN
  }
}

const TABELLEN = new Map<string, [Float32Array, Float32Array]>()
function tabelle(n: number, P: number): [Float32Array, Float32Array] {
  const k = `${n}:${P}`
  let t = TABELLEN.get(k)
  if (!t) {
    t = [new Float32Array(n), new Float32Array(n)]
    for (let j = 0; j < n; j++) { const w = 2 * Math.PI * j * SCHRITT_M / P; t[0][j] = Math.cos(w); t[1][j] = Math.sin(w) }
    TABELLEN.set(k, t)
  }
  return t
}

/** Suche im Raster: modus «lage» (Korrelation mit Abzug je m vom Ort) bzw. «schaerfe» (Amplitude × Korrelation, für Drehung
 * und Schräge: falsch gedrehte Balken verschmieren im längeren Fenster) */
export function suchen(R: Raster, dreh: number, schrittI: number, iBereich: [number, number] | null, sigmen: number[],
  fensterM = BALKEN_FENSTER_M, modus: 'lage' | 'schaerfe' = 'lage'): Treffer | null {
  const [S, K] = praefix(R)
  const h = Math.round(fensterM / SCHRITT_M)
  const x = new Float32Array(R.nn)
  let best: Treffer | null = null
  for (const sg of sigmen) {
    const tanS = Math.tan(sg * Math.PI / 180)
    const i0 = iBereich ? Math.max(0, iBereich[0]) : 0, i1 = iBereich ? Math.min(R.nu - 1, iBereich[1]) : R.nu - 1
    for (let i = i0; i <= i1; i += schrittI) {
      profil(R, S, K, i, tanS, h, x)
      let n = 0
      for (let j = 0; j < R.nn; j++) if (!Number.isNaN(x[j])) n++
      if (n < N_MIN) continue
      for (const P of PERIODEN) {
        const [r, amp, phi] = taktKorrelation(x, SCHRITT_M, P, tabelle(R.nn, P))
        if (amp < AMPLITUDE_MIN) continue
        // Lage: Korrelation, gewichtet mit der Stärke (an Balkenenden schwach), Abzug je m vom Ort
        const wert = modus === 'lage' ? r * (1 - Math.exp(-amp / AMP_REF)) - ABSTAND_STRAFE * Math.abs(R.U[i]) : r * amp
        if (!best || wert > best.wert) best = { r, wert, i, sigma: sg, P, phi, amp, dreh }
      }
    }
  }
  return best
}

export const drehen = (v: P, grad: number): P => {
  const w = grad * Math.PI / 180, c = Math.cos(w), s = Math.sin(w)
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
}

type Balken = { s: number; c: number; da: boolean; fahrbahn: boolean }
type Seg = { k0: number; k1: number }
interface Auswertung { balken: Balken[]; g: Seg[]; ks: number[]; bw: number; uMitte: number; tanS: number; P: number; endeOffen: number }

/** Balken an der Fundstelle: Mitten, Kontrast, Gruppen (Teilstreifen), Balkenlänge */
function auswerten(R: Raster, best: Treffer): Auswertung | string {
  const tanS = Math.tan(best.sigma * Math.PI / 180), P = best.P
  const [S, K] = praefix(R)
  const x = new Float32Array(R.nn)
  profil(R, S, K, best.i, tanS, Math.round(BALKEN_FENSTER_M / SCHRITT_M), x)
  // Balkenmitten: Maxima der Schwingung bei s = φ/2π·P + k·P (s ab N[0])
  const s0 = R.N[0] + (best.phi / (2 * Math.PI)) * P
  const mittelUm = (s: number, halb: number): number => {
    let n = 0, v = 0
    for (let j = Math.max(0, Math.ceil((s - halb - R.N[0]) / SCHRITT_M)); j <= Math.min(R.nn - 1, Math.floor((s + halb - R.N[0]) / SCHRITT_M)); j++)
      if (!Number.isNaN(x[j])) { n++; v += x[j] }
    return n >= 2 ? v / n : NaN
  }
  const kMin = Math.ceil((R.N[0] - s0) / P), kMax = Math.floor((R.N[R.nn - 1] - s0) / P)
  const balken: Balken[] = []
  for (let k = kMin; k <= kMax; k++) {
    const s = s0 + k * P
    const auf_ = mittelUm(s, 0.15), l = mittelUm(s - P / 2, 0.15), r = mittelUm(s + P / 2, 0.15)
    const luecke = Number.isNaN(l) ? r : Number.isNaN(r) ? l : (l + r) / 2
    const c_ = Number.isNaN(auf_) || Number.isNaN(luecke) ? NaN : auf_ - luecke
    balken.push({ s, c: c_, da: !Number.isNaN(c_) && c_ >= BALKEN_KONTRAST, fahrbahn: !Number.isNaN(auf_) })
  }
  // Gruppen: vorhandene Balken; fehlende auf der Fahrbahn (höchstens LUECKE_BALKEN_MAX) halten zusammen, eine Lücke ohne
  // Fahrbahn (Insel) bis INSEL_LUECKE_MAX_M trennt Teilstreifen derselben Gruppe
  const da = balken.map((b, k) => (b.da ? k : -1)).filter(k => k >= 0)
  if (da.length < 2) return 'zu wenige Balken (Kontrast)'
  const gruppen: Seg[][] = [[{ k0: da[0], k1: da[0] }]]
  for (const k of da.slice(1)) {
    const g = gruppen[gruppen.length - 1], sg = g[g.length - 1]
    const zw = balken.slice(sg.k1 + 1, k)
    const fehlend = zw.filter(b => b.fahrbahn).length, ohneFahrbahn = zw.filter(b => !b.fahrbahn).length
    if (ohneFahrbahn === 0 && fehlend <= LUECKE_BALKEN_MAX) sg.k1 = k
    else if (ohneFahrbahn > 0 && fehlend <= LUECKE_BALKEN_MAX && (k - sg.k1) * P <= INSEL_LUECKE_MAX_M) g.push({ k0: k, k1: k })
    else gruppen.push([{ k0: k, k1: k }])
  }
  // Gruppe am Ort (Achse durch n = 0), sonst die mit den meisten Balken
  const spanne = (g: Seg[]) => [balken[g[0].k0].s, balken[g[g.length - 1].k1].s]
  const nB = (g: Seg[]) => g.reduce((a, sg) => a + balken.slice(sg.k0, sg.k1 + 1).filter(b => b.da).length, 0)
  const abst = (g: Seg[]) => { const [a, b] = spanne(g); return a <= 0 && b >= 0 ? 0 : Math.min(Math.abs(a), Math.abs(b)) }
  gruppen.sort((a, b) => abst(a) - abst(b) || nB(b) - nB(a))
  const g = gruppen[0].filter(sg => balken.slice(sg.k0, sg.k1 + 1).filter(b => b.da).length >= 2)
  if (!g.length) return 'zu wenige Balken (Kontrast)'
  // Balkenlänge: Kontrast Balken – Lücken entlang u (Profil je 0,1 m), über alle vorhandenen Balken der Gruppe
  const ks = g.flatMap(sg => balken.slice(sg.k0, sg.k1 + 1).map((b, q) => (b.da ? sg.k0 + q : -1))).filter(k => k >= 0)
  const wert = (i: number, s: number): number => {
    const ii = i + Math.round(s * tanS / SCHRITT_M), j = Math.round((s - R.N[0]) / SCHRITT_M)
    if (ii < 0 || ii >= R.nu || j < 0 || j >= R.nn) return NaN
    // ±0,1 m quer gemittelt
    let n = 0, v = 0
    for (let q = -1; q <= 1; q++) { const f = R.F[ii * R.nn + j + q]; if (j + q >= 0 && j + q < R.nn && !Number.isNaN(f)) { n++; v += f } }
    return n ? v / n : NaN
  }
  const prof: number[] = []
  for (let i = 0; i < R.nu; i++) {
    let n = 0, v = 0
    for (const k of ks) {
      const b = wert(i, balken[k].s), l = wert(i, balken[k].s - P / 2), r = wert(i, balken[k].s + P / 2)
      const lu = Number.isNaN(l) ? r : Number.isNaN(r) ? l : (l + r) / 2
      if (!Number.isNaN(b) && !Number.isNaN(lu)) { n++; v += b - lu }
    }
    prof.push(n ? v / n : NaN)
  }
  // geglättet ±0,2 m
  const gl = prof.map((_, i) => { let n = 0, v = 0; for (let q = -2; q <= 2; q++) { const y = prof[i + q]; if (y !== undefined && !Number.isNaN(y)) { n++; v += y } } return n ? v / n : NaN })
  let iMax = best.i
  for (let i = Math.max(0, best.i - 15); i <= Math.min(R.nu - 1, best.i + 15); i++) if (!Number.isNaN(gl[i]) && (Number.isNaN(gl[iMax]) || gl[i] > gl[iMax])) iMax = i
  const schwelle = LAENGE_SCHWELLE * gl[iMax]
  const reicht = (schritt: number): number => {
    let i = iMax, letzte = iMax, luecke = 0
    while (i + schritt >= 0 && i + schritt < R.nu) {
      i += schritt
      if (!Number.isNaN(gl[i]) && gl[i] >= schwelle) { letzte = i; luecke = 0 } else if (++luecke * SCHRITT_M > LAENGE_LUECKE_M) break
    }
    return letzte
  }
  const iA = reicht(-1), iB = reicht(1)
  const bw = Math.max(1.0, (iB - iA + 1) * SCHRITT_M)
  const uMitte = (R.U[iA] + R.U[iB]) / 2
  // Balkenende frei? Dahinter (0,6–2,0 m) im Mittel kaum noch Kontrast; sonst laufen die Balken weiter (Länge zu kurz)
  let endeOffen = 0
  for (const [i0, st] of [[iA, -1], [iB, 1]] as [number, number][]) {
    let n = 0, v = 0
    for (let q = 6; q <= 20; q++) { const y = gl[i0 + st * q]; if (y !== undefined && !Number.isNaN(y)) { n++; v += y } }
    // n < 5: hinter dem Ende keine Fahrbahn (AV) – entlang der Fahrbahn unerwartet, die Länge ist dann von der Maske gekappt
    if (n < 5 || v / n >= ENDE_OFFEN_ANTEIL * gl[iMax]) endeOffen++
  }
  return { balken, g, ks, bw, uMitte, tanS, P, endeOffen }
}

/** Neigung der Balken im Raster (Drehung der Fahrbahnrichtung) und Schräge der Achse aus den Balkenmitten */
function lageSchaetzen(R: Raster, a: Auswertung): { epsGrad: number; sigmaGrad: number } | null {
  const { balken, ks, bw, uMitte, tanS, P } = a
  const F = (i: number, j: number) => (i >= 0 && i < R.nu && j >= 0 && j < R.nn ? R.F[i * R.nn + j] : NaN)
  const jVon = (s: number) => Math.round((s - R.N[0]) / SCHRITT_M)
  const uc: [number, number][] = [], eps: number[] = []
  for (const k of ks) {
    const sk = balken[k].s, jk = jVon(sk), jl = jVon(sk - P / 2), jr = jVon(sk + P / 2)
    const iExp = Math.round((uMitte + sk * tanS - R.U[0]) / SCHRITT_M), r = Math.round((bw / 2 + 1.5) / SCHRITT_M)
    const kon: number[] = []
    for (let i = iExp - r; i <= iExp + r; i++) {
      let v = 0, n = 0
      for (let q = -1; q <= 1; q++) { const f = F(i, jk + q); if (!Number.isNaN(f)) { v += f; n++ } }
      const l = F(i, jl), rr = F(i, jr), lu = Number.isNaN(l) ? rr : Number.isNaN(rr) ? l : (l + rr) / 2
      kon.push(n && !Number.isNaN(lu) ? v / n - lu : NaN)
    }
    let m = -Infinity
    for (const x of kon) if (!Number.isNaN(x) && x > m) m = x
    if (!(m >= BALKEN_KONTRAST)) continue
    const ja = kon.map(x => !Number.isNaN(x) && x >= 0.5 * m)
    const iA = ja.indexOf(true), iB = ja.lastIndexOf(true)
    if (iB - iA < 6) continue
    const i0 = iExp - r + iA, i1 = iExp - r + iB
    uc.push([sk, R.U[Math.round((i0 + i1) / 2)]])
    // Schwerpunkt quer je Hälfte
    const schwer = (ia: number, ib: number): number => {
      let sw = 0, sn = 0
      for (let i = ia; i <= ib; i++) {
        const bg = ((F(i, jl) || 0) + (F(i, jr) || 0)) / 2
        for (let q = -4; q <= 4; q++) {
          const f = F(i, jk + q)
          if (Number.isNaN(f)) continue
          const w = Math.max(0, f - bg)
          sw += w; sn += w * R.N[jk + q]
        }
      }
      return sw > 0 ? sn / sw : NaN
    }
    const mitte = Math.round((i0 + i1) / 2)
    const nL = schwer(i0 + 2, mitte - 2), nR = schwer(mitte + 2, i1 - 2)
    if (!Number.isNaN(nL) && !Number.isNaN(nR)) eps.push(Math.atan2(nR - nL, (i1 - i0) / 2 * SCHRITT_M))
  }
  if (uc.length < 3 || eps.length < 2) return null
  const ms = uc.reduce((x, q) => x + q[0], 0) / uc.length, mu = uc.reduce((x, q) => x + q[1], 0) / uc.length
  let sxy = 0, sxx = 0
  for (const [x, y] of uc) { sxy += (x - ms) * (y - mu); sxx += (x - ms) ** 2 }
  const steig = sxx > 0 ? sxy / sxx : 0
  eps.sort((x, y) => x - y)
  const e = eps[Math.floor(eps.length / 2)]
  return { epsGrad: e * 180 / Math.PI, sigmaGrad: Math.max(-40, Math.min(40, Math.atan(steig) * 180 / Math.PI)) }
}

function streckeTrifftRing(a: P, b: P, ring: P[]): boolean {
  for (let q = 0; q < ring.length; q++) if (streckenSchnitt(a, b, ring[q], ring[(q + 1) % ring.length])) return true
  return false
}

/** Test «auf der Fahrbahn» einmal je 0,2 m im Suchbereich auswerten (statt je Abtastpunkt) */
function maskeRaster(bild: Bild, c: P, auf: (p: P) => boolean): (p: P) => boolean {
  const r = Math.hypot(SU_M, SN_M) + 1, st = 0.2, n = Math.ceil(2 * r / st)
  const e0 = c[0] - r, n0 = c[1] - r
  const m = new Uint8Array(n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) m[y * n + x] = auf([e0 + (x + 0.5) * st, n0 + (y + 0.5) * st]) ? 1 : 0
  void bild
  return (p: P) => {
    const x = Math.floor((p[0] - e0) / st), y = Math.floor((p[1] - n0) / st)
    return x >= 0 && y >= 0 && x < n && y < n && m[y * n + x] === 1
  }
}

/**
 * Streifen im Luftbild am Ort c suchen. u: Fahrbahnrichtung (gequerter Weg); auf: Punkt auf der AV-Fahrbahn (sonst
 * zählt das ganze Bild); fahrbahnLuecke: Punkt auf einer Lücke zwischen Fahrbahnteilen ist eine Insel (Teilstreifen).
 */
export interface Pruefung {
  insel?: (p: P) => boolean          // AV-Verkehrsinsel (Teilstreifen nur über einer Insel …)
  querungen?: P[][]                  // … oder wenn die OSM-Querung (footway=crossing) jeden Teil schneidet
  andereKnoten?: P[]                 // andere OSM-Übergänge: ein Teil auf einem davon ist ein Nachbarstreifen
}

export function streifenImBild(bild: Bild, c: P, u0: P, auf: ((p: P) => boolean) | null = null, pr: Pruefung = {}): Erkennung {
  const t0 = performance.now()
  const leer = (gruende: string[]): Erkennung => ({ befund: 'nicht_gefunden', gruende, ncc: 0, kontrast: 0, periode: 0, schraegGrad: 0,
    drehungGrad: 0, abstandM: 0, teile: [], balken: [], ms: performance.now() - t0 })
  u0 = einheit(u0)
  if (auf) auf = maskeRaster(bild, c, auf)
  // grob: Drehungen × Schrägen, Lage in 0,2-m-Schritten; zuerst nahe am Ort (der OSM-Knoten liegt auf dem Streifen),
  // weiter weg nur, wenn dort nichts Sicheres liegt (Nachbarstreifen am selben Knoten)
  let nah: Treffer | null = null, nahR: Raster | null = null, fern: Treffer | null = null, fernR: Raster | null = null
  const raster: [number, Raster][] = []
  for (const d of DREH_GRAD) {
    const R = abtasten(bild, c, drehen(u0, d), auf)
    const iC = Math.round(-R.U[0] / SCHRITT_M), r = Math.round(NAH_M / SCHRITT_M)
    const tn = suchen(R, d, 2, [iC - r, iC + r], SCHRAEG_GRAD)
    if (tn && (!nah || tn.wert > nah.wert)) { nah = tn; nahR = R }
    raster.push([d, R])
  }
  // Fernsuche nur bei Bedarf (nahe am Ort nichts Sicheres)
  const fernSuchen = () => {
    for (const [d, R] of raster) {
      const tf = suchen(R, d, 2, null, SCHRAEG_GRAD)
      if (tf && (!fern || tf.wert > fern.wert)) { fern = tf; fernR = R }
    }
  }
  const fertig = (best: Treffer, bestR: Raster): Erkennung => {
    // Balkenlänge grob, dann Drehung und Schräge nach der Schärfe im Fenster über die halbe Balkenlänge
    const a0 = auswerten(bestR, best)
    if (typeof a0 === 'string') return leer([a0])
    // Drehung und Schräge aus den Balken selbst (die Suche trennt sie kaum): Neigung jedes Balkens (Schwerpunkt quer in der
    // linken und rechten Hälfte) und Lage der Balkenmitten entlang u über der Achse; bis zu fünfmal nachgeführt
    // Kandidaten (Ausgangslage und jede Runde) werden am Ende nach der NCC der Balken-Vorlage verglichen
    const kandidaten: [Treffer, Raster, Auswertung][] = [[best, bestR, a0]]
    let dreh = best.dreh, aa = a0, tk = best, Rk = bestR
    for (let runde = 0; runde < 5; runde++) {
      const lage = lageSchaetzen(Rk, aa)
      if (!lage) break
      const d2 = dreh + Math.max(-8, Math.min(8, lage.epsGrad)), sg2 = lage.sigmaGrad      // höchstens 8° je Runde
      if (Math.abs(d2 - dreh) < 0.3 && Math.abs(sg2 - tk.sigma) < 0.5) break
      const R = abtasten(bild, c, drehen(u0, d2), auf)
      const i = Math.round((Rk.U[tk.i] - R.U[0]) / SCHRITT_M)
      const t = suchen(R, d2, 1, [i - 10, i + 10], [sg2], BALKEN_FENSTER_M, 'schaerfe')
      if (!t) break
      const neu = auswerten(R, t)
      if (typeof neu === 'string') break
      dreh = d2; tk = t; Rk = R; aa = neu
      kandidaten.push([t, R, neu])
    }
    let bestE: Erkennung | null = null
    for (const [t, R, a] of kandidaten) {
      const e = abschluss(t, R, a)
      if (!bestE || e.ncc >= bestE.ncc - 0.01) bestE = e
    }
    return bestE!
  }
  const abschluss = (best: Treffer, R: Raster, a: Auswertung): Erkennung => {
    const { balken, g, ks, bw, uMitte, tanS, P } = a
    // Geometrie: Achse durch die Balkenmitten (geschert), Enden an den äusseren Balkenkanten
    const { ud, nd } = R
    const punkt = (s: number): P => add(add(c, ud, uMitte + s * tanS), nd, s)
    const plausibel: string[] = []          // Gründe gegen «erkannt» (Plausibilität)
    const hinweise: string[] = []
    // Teile als Bereiche quer (s) mit den Balken; ihre Hülle
    type TeilS = { sA: number; sB: number; ks: number[] }
    let ts: TeilS[] = g.map(sg => ({ sA: balken[sg.k0].s - BALKEN_BREITE_M / 2, sB: balken[sg.k1].s + BALKEN_BREITE_M / 2,
      ks: ks.filter(k => k >= sg.k0 && k <= sg.k1) }))
    const huelle = (t: TeilS): P[] => {
      const q0 = punkt(t.sA), q1 = punkt(t.sB), h = bw / 2
      return [add(q0, ud, -h), add(q1, ud, -h), add(q1, ud, h), add(q0, ud, h)]
    }
    const abstandZu = (ring: P[], p: P): number => {
      if (imPolygon(p, [ring])) return 0
      let m = Infinity
      for (let q = 0; q < ring.length; q++) m = Math.min(m, abstandStrecke(p, ring[q], ring[(q + 1) % ring.length]))
      return m
    }
    // d) Teilstreifen nur über einer AV-Insel oder wenn die OSM-Querung jeden Teil schneidet; sonst bleibt der Teil am Knoten
    if (ts.length > 1) {
      const iK = ts.reduce((b, t, q) => (abstandZu(huelle(t), c) < abstandZu(huelle(ts[b]), c) ? q : b), 0)
      const querungTrifft = (t: TeilS) => (pr.querungen ?? []).some(l => l.some((pt, q) => q > 0 &&
        (imPolygon(pt, [huelle(t)]) || streckeTrifftRing(l[q - 1], pt, huelle(t)))))
      const inselZwischen = (a: TeilS, b: TeilS) => {
        if (!pr.insel) return false
        for (let x = a.sB; x <= b.sA; x += 0.25) if (pr.insel(punkt(x))) return true
        return false
      }
      const nachbar = (t: TeilS) => (pr.andereKnoten ?? []).some(p => abstandZu(huelle(t), p) <= KNOTEN_RAND_M)
      const ok = (a: TeilS, b: TeilS, neu: TeilS) => !nachbar(neu) && (inselZwischen(a, b) || (querungTrifft(a) && querungTrifft(b)))
      const behalten = new Set([iK])
      for (let q = iK - 1; q >= 0 && ok(ts[q], ts[q + 1], ts[q]); q--) behalten.add(q)
      for (let q = iK + 1; q < ts.length && ok(ts[q - 1], ts[q], ts[q]); q++) behalten.add(q)
      if (behalten.size < ts.length) hinweise.push(`${ts.length - behalten.size} Teil(e) ohne AV-Insel bzw. OSM-Querung weggelassen`)
      ts = ts.filter((_, q) => behalten.has(q))
    }
    // c) Streifenenden: mehr als ENDE_RAND_M vor der Bordkante -> bis dorthin verlängern, wenn dazwischen Grün/Schatten (Laub,
    // Baumschatten über den Balken), sonst unplausibel
    if (auf) for (const t of ts) {
      for (const seite of [-1, 1]) {
        const s0 = seite < 0 ? t.sA : t.sB
        let x = s0, rand: number | null = null
        for (let k = 1; k <= 150; k++) { const xs = s0 + seite * k * SCHRITT_M; if (!auf(punkt(xs))) { rand = xs - seite * SCHRITT_M; break } x = xs }
        if (rand === null) rand = x
        const luecke = Math.abs(rand - s0)
        if (luecke <= ENDE_RAND_M) continue
        let n = 0, gs = 0
        for (let xs = s0 + seite * 0.2; seite < 0 ? xs >= rand : xs <= rand; xs += seite * 0.2)
          for (let du = -bw / 2; du <= bw / 2; du += 0.5) {
            const q = add(punkt(xs), ud, du)
            const av = wertBei(bild, bild.A, q), lv = wertBei(bild, bild.L, q)
            if (Number.isNaN(av)) continue
            n++; if (av < GRUEN_A[0] || lv < DUNKEL_L) gs++
          }
        if (n && gs / n >= GRUEN_ANTEIL && luecke <= VERLAENGERN_MAX_M) {
          const ziel = rand - seite * RAND_VOR_M
          if (seite < 0) t.sA = Math.min(t.sA, ziel); else t.sB = Math.max(t.sB, ziel)
          hinweise.push(`Ende um ${luecke.toFixed(1)} m bis zur Bordkante verlängert (Grün/Schatten über den Balken)`)
        } else plausibel.push(`Streifenende ${luecke.toFixed(1)} m vor der Bordkante` + (n && gs / n >= GRUEN_ANTEIL ? ' (Grün/Schatten, zu weit zum Verlängern)' : ''))
      }
    }
    const teile: TeilErkannt[] = ts.map(t => {
      // wie im Kataster: Achse senkrecht zu den Balken durch die Mitte der Balken-Hülle, Länge = Ausdehnung quer
      const mt = punkt((t.sA + t.sB) / 2), q0 = punkt(t.sA), q1 = punkt(t.sB), h = bw / 2
      return { p0: add(mt, nd, -(t.sB - t.sA) / 2), p1: add(mt, nd, (t.sB - t.sA) / 2), q0, q1, richtung: ud, bw: Math.round(bw * 10) / 10,
        nBalken: t.ks.length, balkenS: t.ks.map(k => balken[k].s - t.sA),
        umriss: [add(q0, ud, -h), add(q1, ud, -h), add(q1, ud, h), add(q0, ud, h)] }
    })
    // a) der OSM-Knoten liegt in einem Teil (höchstens KNOTEN_RAND_M daneben); b) dessen Mitte höchstens KNOTEN_MITTE_M vom Knoten
    const nahTeil = teile.reduce<TeilErkannt | null>((b, t) => (b === null || abstandZu(t.umriss, c) < abstandZu(b.umriss, c) ? t : b), null)
    if (nahTeil) {
      const dk = abstandZu(nahTeil.umriss, c), dm = dist(c, [(nahTeil.p0[0] + nahTeil.p1[0]) / 2, (nahTeil.p0[1] + nahTeil.p1[1]) / 2])
      // Knoten auf der Insel zwischen zwei Teilen (n = 0 liegt in der Lücke) zählt wie im Streifen
      const zwischen = ts.some((t, q) => q > 0 && ts[q - 1].sB <= 0 && t.sA >= 0)
      if (dk > KNOTEN_RAND_M && !zwischen) plausibel.push(`OSM-Knoten ${dk.toFixed(1)} m neben dem erkannten Streifen`)
      else if (!zwischen && dm > KNOTEN_MITTE_M) plausibel.push(`Streifenmitte ${dm.toFixed(1)} m vom OSM-Knoten`)
      else if (zwischen && dist(c, punkt((ts[0].sA + ts[ts.length - 1].sB) / 2)) > KNOTEN_MITTE_M)
        plausibel.push('Streifenmitte (alle Teile) mehr als 4 m vom OSM-Knoten')
    }
    // Der OSM-Knoten liegt auf der Querungslinie: entlang der Fahrbahn höchstens KNOTEN_ACHSE_M neben der Streifenachse
    // (sonst nur ein Teil eines breiten bzw. versetzten Streifens erkannt)
    if (Math.abs(uMitte) > KNOTEN_ACHSE_M) plausibel.push(`OSM-Knoten ${Math.abs(uMitte).toFixed(1)} m neben der Streifenachse (entlang der Fahrbahn)`)
    if (a.endeOffen) plausibel.push('Balkenende offen (Balken laufen weiter oder enden an der AV-Fahrbahngrenze, Länge unsicher)')
    const ksBehalten = ts.flatMap(t => t.ks)
    const ringe: P[][] = ksBehalten.map(k => {
      const m = punkt(balken[k].s), h = bw / 2, b2 = BALKEN_BREITE_M / 2
      return [add(add(m, ud, -h), nd, -b2), add(add(m, ud, h), nd, -b2), add(add(m, ud, h), nd, b2), add(add(m, ud, -h), nd, b2)]
    })
    // Sicherheitsmass: NCC der Balken-Vorlage über dem Träger (Hülle + Rand), Gelb-Kontrast, Schatten
    const Fv: number[] = [], Tv: number[] = [], Wv: number[] = []
    let dunkel = 0, nTr = 0
    const sMin = Math.min(...ts.map(t => t.sA)), sMax = Math.max(...ts.map(t => t.sB))
    for (let s = sMin - MARGE_N_M; s <= sMax + MARGE_N_M; s += SCHRITT_M) {
      for (let du = -bw / 2 - MARGE_U_M; du <= bw / 2 + MARGE_U_M; du += SCHRITT_M) {
        const p = add(punkt(s), ud, du)
        const i = Math.round((uMitte + s * tanS + du - R.U[0]) / SCHRITT_M), j = Math.round((s - R.N[0]) / SCHRITT_M)
        if (i < 0 || i >= R.nu || j < 0 || j >= R.nn) continue
        const f = R.F[i * R.nn + j]
        if (Number.isNaN(f)) continue
        const imBalken = Math.abs(du) <= bw / 2 && ksBehalten.some(k => Math.abs(s - balken[k].s) <= BALKEN_BREITE_M / 2)
        Fv.push(f); Tv.push(imBalken ? 1 : 0); Wv.push(1)
        const l = wertBei(bild, bild.L, p)
        nTr++; if (l < DUNKEL_L) dunkel++
      }
    }
    const ncc = nccVorlage(Fv, Tv, Wv)
    let sb = 0, nb = 0, su = 0, nu_ = 0
    Fv.forEach((f, q) => { if (Tv[q]) { sb += f; nb++ } else { su += f; nu_++ } })
    const kontrast = nb && nu_ ? sb / nb - su / nu_ : 0
    const schatten = nTr ? dunkel / nTr : 0
    const gruende: string[] = []
    let befund: Befund
    if (ncc >= NCC_SICHER && kontrast >= KONTRAST_SICHER && ksBehalten.length >= BALKEN_SICHER) befund = 'erkannt'
    else if (ncc >= NCC_MIN && kontrast >= KONTRAST_UNSICHER) {
      befund = 'unsicher'
      gruende.push(`Muster schwach (NCC ${ncc.toFixed(2)}, Gelb-Kontrast ${kontrast.toFixed(1)})`)
    } else if (schatten >= DUNKEL_ANTEIL) { befund = 'unsicher'; gruende.push('Schatten') }
    else { befund = 'nicht_gefunden'; gruende.push(`kein deutliches Muster (NCC ${ncc.toFixed(2)}, Gelb-Kontrast ${kontrast.toFixed(1)})`) }
    if (schatten >= DUNKEL_ANTEIL && befund !== 'nicht_gefunden') gruende.push(`Schatten ${Math.round(schatten * 100)} %`)
    // Plausibilität: lieber «unsicher» als falsch erkannt
    if (befund === 'erkannt' && plausibel.length) { befund = 'unsicher'; gruende.push(...plausibel) }
    gruende.push(...hinweise)
    const mitte = punkt((sMin + sMax) / 2)
    return { befund, gruende, ncc: Math.round(ncc * 1000) / 1000, kontrast: Math.round(kontrast * 10) / 10, periode: P,
      schraegGrad: best.sigma, drehungGrad: best.dreh, abstandM: Math.round(dist(mitte, c) * 10) / 10, teile, balken: ringe,
      ms: performance.now() - t0 }
  }
  // weiter als NAH_M + 2 m vom Ort: wohl ein Nachbarstreifen; nur als Vorschlag («unsicher»), nicht von selbst übernommen
  const weit = (e: Erkennung): Erkennung => {
    if (e.befund === 'erkannt' && e.abstandM > NAH_M + 2) {
      e.befund = 'unsicher'
      e.gruende.push(`Streifen ${e.abstandM.toFixed(0)} m vom OSM-Übergang entfernt – richtiger Streifen?`)
    }
    return e
  }
  const eNah = weit(nah && nahR ? fertig(nah, nahR) : leer(['kein Balkenmuster auf der Fahrbahn']))
  if (eNah.befund === 'erkannt') return eNah
  fernSuchen()
  if (!fern || !fernR) return eNah
  const eFern = weit(fertig(fern as Treffer, fernR as Raster))
  if (eFern.befund === 'erkannt') return eFern
  return eNah.befund === 'unsicher' || eFern.befund !== 'unsicher' ? eNah : eFern
}
