// ── Streifengeometrie: Fussgängerstreifen aus OSM-Übergang und AV-Fahrbahn (gemeinsamer Baustein seit 13.11.2026 abends) ──
// Bis dahin Kern von fgsCheck streifenAusUebergang (src/rechner/streifen.ts); jetzt hier, damit fgsCheck und VeloroutenCheck
// denselben Streifen zeichnen. Nur Landeskoordinaten (LV95), keine Daten- oder Netzklassen: der Aufrufer übersetzt seine
// Flächen in Ringlisten (Ring 0 aussen, weitere Ringe Löcher).
//
// Regeln (wie im fgsCheck seit E1, Prüfungen 14.10.2026):
// - Achse senkrecht zum gequerten Weg durch den Knoten c (links(dWeg)); liegt am Knoten ein Fussweg (footway=crossing), gilt
//   seine Gehrichtung (Sehne ±6 m um c) als Achse, wenn sie höchstens 45° von der Senkrechten abweicht (schräge Streifen).
// - Fahrbahnteile auf der Achse ±SUCHE aus den AV-Flächen Strasse_Weg (Löcher wie Trottoirnasen kürzen), zusammengefasst
//   (Lücken bis 5 cm); der Teil am Knoten (bzw. der nächste) ist der Kernteil.
// - AV-Fahrbahn um mehr als 3 m breiter als die Querung (Ausdehnung des Fusswegs entlang der Achse): Enden aus dem Fussweg
//   ± RAND_ZUSCHLAG (geklemmt). Ohne Fussweg und Fahrbahn über 15 m: Länge aus der OSM-Breite (sonst 7 m, Einbahn 3,5 m)
//   ± 1 m um den Knoten (geschaetzt).
// - Teilstreifen über Verkehrsinseln: Nachbarteile ab TEIL_MIN_M, Lücke höchstens TEIL_LUECKE_MAX_M und überwiegend Insel
//   (AV-Verkehrsinsel oder Insel von Hand); mit Fussweg nur, soweit er über die Insel weiterführt.
// - Enden je Teil RAND_ZUSCHLAG vor der Bordkante bzw. der Insel.
// - Bord aus dem Bordmodell (seit 13.11.2026 spät, Plan AV-Geometrie A6; opt.bord = bordmodell.schnittBord(…, 'rand') beider Seiten:
//   gemessener Rand, kurze Lücken «Rand unbekannt» überbrückt): die Achse bleibt wie oben (ein schräg erfasster Streifen bleibt schräg);
//   der Kernteil endet am nächsten Schnitt mit dem Bord unter bzw. über dem Knoten, ein Teil jenseits einer Insel am nächsten Schnitt
//   von der Insel aus nach aussen (ein Fussweg in der Fläche Strasse_Weg verlängert den Streifen nicht mehr). Klemmung und Schätzung
//   entfallen auf jeder Seite mit Bord; ohne Schnitt auf einer Seite bleibt dort der Weg oben (Rückfall, bordA/bordB false).
import { type P, add, dist, dot, einheit, geradeSchnitte, imPolygon, intervalleImPolygon, links, sub } from './geometrie'

export type { P }
export const RAND_ZUSCHLAG = 0.30
export const TEIL_LUECKE_MAX_M = 12.0          // Teilstreifen: Insel zwischen zwei Fahrbahnteilen höchstens so breit
export const TEIL_MIN_M = 2.0                   // Fahrbahnteil mindestens so breit
export const SUCHE = 30                         // Fahrbahn auf der Achse ± so weit vom Knoten
const FUSSWEG_SEHNE_M = 6                       // Gehrichtung des Fusswegs: Sehne ± so weit um den Knoten
const FUSSWEG_MAX_GRAD = 45                     // Fussweg als Achse, wenn höchstens so weit von der Senkrechten
const KLEMM_M = 3                               // Klemmung, wenn die AV-Fahrbahn um mehr als so viel breiter ist als die Querung
const BREIT_M = 15                              // Schätzung aus der OSM-Breite ab so breiter Fahrbahn (ohne Fussweg)
const NEBEN_M = 3                               // Meldung, wenn der Knoten weiter neben der AV-Fahrbahn liegt
const f1 = (x: number) => x.toFixed(1).replace('.', ',')

/** Inseln als Polygone (Ringlisten) oder als Prüfung «liegt p auf einer Insel?» (z. B. mit Raster des Aufrufers) */
export type InselnEingabe = P[][][] | ((p: P) => boolean)

export interface StreifenOptionen {
  breiteOsm?: number | null     // Breite des gequerten OSM-Wegs (width bzw. lanes × 3 m) für die Schätzung
  einbahn?: boolean             // gequerter Weg Einbahn: Schätzung ohne Breite 3,5 m statt 7 m
  inselnHand?: P[][]            // Inseln ausserhalb der AV (je ein Ring): schneiden die Fahrbahn wie AV-Verkehrsinseln
  fusswegNurRichtung?: boolean  // Fussweg ist kein footway=crossing: nur Richtung, keine Ausdehnung (Klemmung)
  /** Bordlinien beider Seiten aus dem Bordmodell (schnittBord): äussere Enden = Schnitt der Achse mit ihnen (Plan A6) */
  bord?: readonly (readonly P[])[] | null
}

/** Ein Fahrbahnteil des Streifens: Lage a…b auf der Achse ab c (Bordkante bzw. Insel), Enden p0/p1 RAND_ZUSCHLAG davor */
export interface StreifenAbschnitt {
  a: number; b: number; p0: P; p1: P
  kern: boolean                 // im Kernteil am Knoten (nach Klemmung bzw. Schätzung)
  inselVor: number | null       // Index in opt.inselnHand der Insel am Anfang (a) bzw. am Ende (b), sonst null
  inselNach: number | null
}

export interface StreifenEnden {
  p0: P; p1: P                  // Teilstreifen am Knoten (Kernteil, sonst der erste); ohne Teil ab TEIL_MIN_M beide c
  teile: [P, P][]               // alle Teilstreifen ab TEIL_MIN_M
  achse: P                      // Richtung der Achse (von p0 nach p1)
  achseText: 'senkrecht' | 'fussweg'
  geklemmt: boolean
  geschaetzt: boolean
  meldungen: string[]
  abschnitte: StreifenAbschnitt[]   // alle Teile des Streifens, auch kürzere als TEIL_MIN_M (Nummerierung im fgsCheck)
  inselnHandAufAchse: boolean[]     // je opt.inselnHand: kreuzt die Achse
  /** äusseres Ende am Anfang (Seite −achse) bzw. am Ende (Seite +achse) aus dem Bord (opt.bord); false: Rückfall wie ohne Bord */
  bordA: boolean
  bordB: boolean
}

// Umgrenzung je Polygon (Ring 0), nach Objekt zwischengespeichert: der Aufrufer gibt meist dieselben Polygone wieder
const umgrenzung = new WeakMap<P[][], [number, number, number, number]>()
function env(poly: P[][]): [number, number, number, number] {
  let e = umgrenzung.get(poly)
  if (!e) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of poly[0] ?? []) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) }
    e = [x0, y0, x1, y1]
    umgrenzung.set(poly, e)
  }
  return e
}

/** Intervalle ohne die Bereiche weg (Reste unter 5 cm fallen weg) */
export function abziehen(iv: [number, number][], weg: [number, number][]): [number, number][] {
  let aus = iv.map(([a, b]) => [a, b] as [number, number])
  for (const [w0, w1] of weg)
    aus = aus.flatMap(([a, b]): [number, number][] => (w1 <= a || w0 >= b ? [[a, b]] :
      ([[a, w0], [w1, b]] as [number, number][]).filter(([x, y]) => y - x > 0.05)))
  return aus
}

/** Lage (Bogenlänge) des Punkts auf der Linie, der c am nächsten liegt */
function lageAuf(pts: P[], lagen: number[], c: P): number {
  let best = Infinity, lage = 0
  for (let k = 1; k < pts.length; k++) {
    const v = sub(pts[k], pts[k - 1]), l2 = dot(v, v)
    const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(c, pts[k - 1]), v) / l2)) : 0
    const d = dist(add(pts[k - 1], v, t), c)
    if (d < best) { best = d; lage = lagen[k - 1] + t * (lagen[k] - lagen[k - 1]) }
  }
  return lage
}

/**
 * Enden des Fussgängerstreifens am Übergangsknoten c (LV95). dWeg: Richtung des gequerten Wegs am Knoten; fahrbahn: AV-Flächen
 * Strasse_Weg; inseln: AV-Verkehrsinseln; fussweg: Geometrie des Fusswegs (footway=crossing) durch den Knoten oder null.
 * -> null, wenn die Achse keine Fahrbahn trifft.
 */
export function streifenEnden(c: P, dWeg: P, fahrbahn: P[][][], inseln: InselnEingabe, fussweg: P[] | null,
  opt: StreifenOptionen = {}): StreifenEnden | null {
  const meldungen: string[] = []
  let n = links(dWeg)                                   // Achse quer über die Fahrbahn
  let achseText: StreifenEnden['achseText'] = 'senkrecht'
  // Fussweg über die Fahrbahn am Knoten: Gehrichtung als Achse (schräge Streifen), Länge der Querung
  let querAus: [number, number] | null = null
  if (fussweg && fussweg.length) {
    const pts = fussweg
    const lagen = [0]
    for (let k = 1; k < pts.length; k++) lagen.push(lagen[k - 1] + dist(pts[k - 1], pts[k]))
    const bei = (x: number): P => {
      x = Math.max(0, Math.min(lagen[lagen.length - 1], x))
      for (let k = 1; k < pts.length; k++) if (lagen[k] >= x && lagen[k] > lagen[k - 1])
        return add(pts[k - 1], sub(pts[k], pts[k - 1]), (x - lagen[k - 1]) / (lagen[k] - lagen[k - 1]))
      return pts[pts.length - 1]
    }
    const l0 = lageAuf(pts, lagen, c)
    const g = einheit(sub(bei(l0 + FUSSWEG_SEHNE_M), bei(l0 - FUSSWEG_SEHNE_M)))
    const w = Math.abs(dot(g, einheit(dWeg)))
    if (g[0] !== 0 || g[1] !== 0) {
      if (w <= Math.cos(FUSSWEG_MAX_GRAD * Math.PI / 180)) {
        n = dot(g, n) >= 0 ? g : [-g[0], -g[1]]
        achseText = 'fussweg'
      }
      if (!opt.fusswegNurRichtung) {
        const ls = pts.map(p => dot(sub(p, c), n))
        querAus = [Math.min(...ls), Math.max(...ls)]
      }
    }
  }
  // Fahrbahnteile (AV Strasse_Weg) entlang der Achse, ±SUCHE m
  const iv: [number, number][] = []
  for (const poly of fahrbahn) {
    const e = env(poly)
    if (e[2] < c[0] - SUCHE || e[0] > c[0] + SUCHE || e[3] < c[1] - SUCHE || e[1] > c[1] + SUCHE) continue
    iv.push(...intervalleImPolygon(c, n, SUCHE, poly))
  }
  iv.sort((a, b) => a[0] - b[0])
  let fb: [number, number][] = []
  for (const x of iv) {
    const m = fb[fb.length - 1]
    if (m && x[0] <= m[1] + 0.05) m[1] = Math.max(m[1], x[1]); else fb.push([x[0], x[1]])
  }
  // Inseln von Hand: aus der Fahrbahn auf der Achse herausgeschnitten (wie eine AV-Verkehrsinsel)
  const zusatz = opt.inselnHand ?? []
  const zusatzIv = zusatz.map(ring => intervalleImPolygon(c, n, SUCHE, [ring]))
  if (zusatz.length) fb = abziehen(fb, zusatzIv.flat())
  if (!fb.length) return null
  const abst = ([a, b]: [number, number]) => (a <= 0 && b >= 0 ? 0 : Math.min(Math.abs(a), Math.abs(b)))
  let i0 = 0
  fb.forEach((x, i) => { if (abst(x) < abst(fb[i0])) i0 = i })
  if (abst(fb[i0]) > NEBEN_M) meldungen.push(`Übergangsknoten ${abst(fb[i0]).toFixed(1)} m neben der AV-Fahrbahn`)
  // Bord aus dem Bordmodell (Plan A6): Schnitte der Achse mit dem Bord. Der Kernteil endet am nächsten Schnitt unter bzw. über einem
  // Punkt in ihm (Knoten bzw. Mitte des Kernteils); Teile jenseits einer Insel (unten) am nächsten Schnitt von ihrem Ende an der Insel aus
  const ts = opt.bord && opt.bord.length ? geradeSchnitte(c, n, opt.bord).filter(t => Math.abs(t) <= SUCHE) : null
  const schnittUnter = (x: number) => { const u = (ts ?? []).filter(t => t < x - 1e-6); return u.length ? u[u.length - 1] : null }
  const schnittUeber = (x: number) => (ts ?? []).find(t => t > x + 1e-6) ?? null
  // Bezugspunkt im Kernteil: der Knoten; liegt er nicht auf der Fahrbahn (auf einer Insel, daneben), das ihm nächste Ende des Kernteils,
  // höchstens 1 m nach innen (Nachtrag B, BK3, 14.11.2026: bisher die Mitte des Kernteils – reicht die Fläche Strasse_Weg in einen
  // Fussweg, lag sie jenseits der Bordflucht; Laubeggstrasse FGS 275422258: Kernteil t −20,4 … −1,0, Mitte −10,7 im Fussweg)
  const k0 = fb[i0], innen = Math.min(1, (k0[1] - k0[0]) / 2)
  const m0 = k0[0] <= 0 && k0[1] >= 0 ? 0 : k0[1] < 0 ? k0[1] - innen : k0[0] + innen
  const kA = schnittUnter(m0), kB = schnittUeber(m0)
  fb[i0] = [Math.max(k0[0], kA ?? -Infinity), Math.min(k0[1], kB ?? Infinity)]
  let bordA = kA !== null, bordB = kB !== null
  const avInselBei = typeof inseln === 'function' ? inseln : (p: P) => inseln.some(poly => imPolygon(p, poly))
  const inselBei = (p: P) => avInselBei(p) || zusatz.some(ring => imPolygon(p, [ring]))
  const istInsel = (a: number, b: number) => {
    // Lücke zwischen zwei Fahrbahnteilen: überwiegend AV-Verkehrsinsel bzw. Insel von Hand (Punkte alle 0,25 m)
    let n_ = 0, ja = 0
    for (let x = a + 0.125; x < b; x += 0.25) { n_++; if (inselBei(add(c, n, x))) ja++ }
    return n_ > 0 && ja / n_ >= 0.5
  }
  let geklemmt = false
  const mitBord = bordA || bordB
  if (!(bordA && bordB) && querAus && fb[i0][1] - fb[i0][0] > querAus[1] - querAus[0] + KLEMM_M) {
    // AV-Fahrbahn viel breiter als die Querung (Knotenbereich, Platz): Enden aus dem Fussweg (eine Seite mit Bord bleibt)
    const a = bordA ? fb[i0][0] : Math.max(fb[i0][0], querAus[0] - RAND_ZUSCHLAG), b = bordB ? fb[i0][1] : Math.min(fb[i0][1], querAus[1] + RAND_ZUSCHLAG)
    if (b - a >= TEIL_MIN_M) { geklemmt = !mitBord || a !== fb[i0][0] || b !== fb[i0][1]; fb[i0] = [a, b] }
  }
  // Teilstreifen über Verkehrsinseln; mit Fussweg (footway=crossing) nur, soweit er über die Insel weiterführt (eine Insel von
  // Hand teilt einen Fahrbahnteil: beide Seiten gehören zum Streifen)
  const reicht = (x: [number, number]) => querAus === null || (x[1] > querAus[0] + 1 && x[0] < querAus[1] - 1)
  const schnitt = (g0: number, g1: number) => zusatzIv.some(iv => iv.some(([a, b]) => a <= g0 + 0.06 && b >= g1 - 0.06))
  let geschaetzt = false
  if (!(bordA && bordB) && !geklemmt && fb[i0][1] - fb[i0][0] > BREIT_M) {
    // AV-Fahrbahn auf der Achse sehr lang (Platz, Knotenbereich) und kein Fussweg: Länge aus der Breite des OSM-Wegs
    // (width bzw. lanes × 3 m, sonst 7 m zweirichtig bzw. 3,5 m Einbahn), um den Knoten (eine Seite mit Bord bleibt)
    const bEst = opt.breiteOsm ?? (opt.einbahn ? 3.5 : 7.0)
    if (fb[i0][1] - fb[i0][0] > 2 * bEst + 6) {
      const a = bordA ? fb[i0][0] : Math.max(fb[i0][0], -bEst / 2 - 1), b = bordB ? fb[i0][1] : Math.min(fb[i0][1], bEst / 2 + 1)
      if (b - a >= TEIL_MIN_M) { geschaetzt = !mitBord || a !== fb[i0][0] || b !== fb[i0][1]; fb[i0] = [a, b] }
    }
  }
  let teile: [number, number][] = [fb[i0]]
  for (let i = i0 - 1; i >= 0; i--) {
    const g0 = fb[i][1], g1 = teile[0][0]
    if (g1 - g0 > TEIL_LUECKE_MAX_M || !istInsel(g0, g1) || fb[i][1] - fb[i][0] < TEIL_MIN_M || (!reicht(fb[i]) && !schnitt(g0, g1))) break
    teile.unshift(fb[i])
  }
  for (let i = i0 + 1; i < fb.length; i++) {
    const g0 = teile[teile.length - 1][1], g1 = fb[i][0]
    if (g1 - g0 > TEIL_LUECKE_MAX_M || !istInsel(g0, g1) || fb[i][1] - fb[i][0] < TEIL_MIN_M || (!reicht(fb[i]) && !schnitt(g0, g1))) break
    teile.push(fb[i])
  }
  // Bord an den äusseren Teilen jenseits einer Insel: nächster Schnitt von der Insel aus nach aussen (ein Schnitt an der Insel selbst zählt
  // nicht); ohne Schnitt Rückfall wie ohne Bord
  if (ts) {
    const kernAn = teile.indexOf(fb[i0])
    if (kernAn > 0) {
      const t = schnittUnter(teile[0][1] - 0.05)
      bordA = t !== null
      if (t !== null && t > teile[0][0]) teile[0] = [t, teile[0][1]]
    }
    if (kernAn >= 0 && kernAn < teile.length - 1) {
      const z = teile.length - 1, t = schnittUeber(teile[z][0] + 0.05)
      bordB = t !== null
      if (t !== null && t < teile[z][1]) teile[z] = [teile[z][0], t]
    }
  }
  // zu kurze Teile neben einer Insel von Hand nicht mitzählen
  if (zusatz.length) teile = teile.filter(([a, b]) => b - a >= TEIL_MIN_M)
  if (!teile.length) meldungen.push(`Streifen aus OSM + AV: neben der Insel kein Fahrbahnteil ab ${f1(TEIL_MIN_M)} m – Insel prüfen.`)
  // Insel von Hand an einem Ende eines Teils (dort aus der Fahrbahn geschnitten)
  const inselAn = (x: number) => { const k = zusatzIv.findIndex(iv => iv.some(([a, b]) => Math.abs(a - x) < 0.06 || Math.abs(b - x) < 0.06)); return k < 0 ? null : k }
  const abschnitte: StreifenAbschnitt[] = teile.map(([a, b]) => ({ a, b, p0: add(c, n, a + RAND_ZUSCHLAG), p1: add(c, n, b - RAND_ZUSCHLAG),
    kern: a >= fb[i0][0] - 1e-9 && b <= fb[i0][1] + 1e-9, inselVor: inselAn(a), inselNach: inselAn(b) }))
  const lang = abschnitte.filter(x => x.b - x.a >= TEIL_MIN_M)
  const amKnoten = lang.find(x => x.kern) ?? lang[0]
  return { p0: amKnoten ? amKnoten.p0 : c, p1: amKnoten ? amKnoten.p1 : c, teile: lang.map(x => [x.p0, x.p1] as [P, P]), achse: n, achseText,
    geklemmt, geschaetzt, meldungen, abschnitte, inselnHandAufAchse: zusatzIv.map(iv => iv.length > 0), bordA, bordB }
}
