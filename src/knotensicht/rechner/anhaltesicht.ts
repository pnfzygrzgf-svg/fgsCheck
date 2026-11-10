// ── Anhaltesichtweite S_A auf übrigen Strassen (VSS 40 090b, Abb. 2) ──
//
// VSS 40 090b Abb. 2, abgelesen. Nur Zahlenwerte, kein Normtext.
// Ablesung vom 10.11.2026 (ANHALTESICHT_ABLESUNG): Seite 5 bei 600 dpi gerendert, Achsen an allen Gitterlinien geeicht
// (i alle 1 %, S_A alle 10 m, stückweise linear), je Stützstelle die Linienmitte über ±0,2 % gemessen (Median), Stellen mit
// Gitterlinien und Beschriftungen ausgelassen und überbrückt. Die Linien sind rund 1,3 m dick; verwendet wird die Oberkante
// (Linienmitte + 0,64 m), auf ganze Meter aufgerundet: die vorsichtige Lesart, Ablesegenauigkeit rund ±1 m. Ausserhalb der
// messbaren Linie linear fortgesetzt: 40 km/h bei −12 %, 60 km/h bei −12, +10 und +12 %, 70 km/h bei −12 und +12 %, 80 km/h bei
// −12 und +12 %. Monoton: mit zunehmendem Gefälle (kleinerem i) nie kleiner.
// Die Werte gelten unverändert (VSS 40 090b Ziffer 5: nur die grafischen Werte verwenden). Bei i = 0 liegt Abb. 2 nicht genau auf
// dem unteren Wert der VSS 40 273 Tab. 1 (30 km/h 25 statt 20 m); die App verschiebt die Kurven nicht (bis 10.11.2026 wurden sie auf
// Tab. 1 verschoben, Befund SW-01 der Prüfung vom 10.11.2026). Bis |i| = 2 % gilt Tab. 1, darüber mindestens der Diagrammwert; an
// der 2-%-Grenze kann das Soll darum springen (sichtweite.ts).
// Die Kurven 70 und 80 km/h sind nicht über den ganzen Bereich gezeichnet (ANHALTESICHT_GEZEICHNET, mit den gestrichelten
// Stücken); die Werte ausserhalb sind verlängert (Gerade über die letzten 2 % der Kurve). Die Kurven ab 50 km/h sind an den Enden
// gestrichelt; durchgezogen sind (am 300-dpi-Render nachgemessen, 31.10.2026) 30 und 40 km/h −12 … +12 %, 50 km/h −11 … +10 %,
// 60 km/h −10 … +10 %, 70 km/h −9 … +9 %, 80 km/h −8 … +8 % (ANHALTESICHT_DURCHGEZOGEN). Die Bedeutung der Strichelung nennt die
// Norm nicht; Gestrichelt gilt als nicht gezeichnet. Ausserhalb des durchgezogenen Stücks bleibt der Wert
// (aus dem gestrichelten Stück abgelesen bzw. verlängert), gilt aber als unsicher (mit Hinweis).

/** Stützstellen der Längsneigung i [%], in Fahrtrichtung, talwärts negativ */
export const ANHALTESICHT_I = [-12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12]
export const ANHALTESICHT_I_MIN = ANHALTESICHT_I[0]
export const ANHALTESICHT_I_MAX = ANHALTESICHT_I[ANHALTESICHT_I.length - 1]

/** Ablesung der Abb. 2 für Anzeige und Regeln */
export const ANHALTESICHT_ABLESUNG = 'abgelesen an der Oberkante der rund 1,3 m dicken Linie, auf ganze Meter aufgerundet; Ablesegenauigkeit rund ±1 m'
/** VSS 40 090b Abb. 2, abgelesen am 10.11.2026 (Oberkante der Linie, aufgerundet): VP [km/h] -> S_A [m] je Stützstelle von ANHALTESICHT_I */
export const ANHALTESICHT: Record<number, number[]> = {
  //    −12  −10   −8   −6   −4   −2    0   +2   +4   +6   +8  +10  +12
  30: [  28,  27,  27,  26,  26,  26,  25,  24,  24,  23,  23,  23,  23],
  40: [  40,  39,  39,  38,  38,  37,  37,  36,  36,  35,  35,  34,  34],   // −12 % fortgesetzt
  50: [  58,  56,  55,  54,  53,  52,  51,  50,  49,  47,  47,  46,  46],
  60: [  81,  78,  75,  73,  72,  70,  68,  67,  65,  64,  62,  61,  60],   // −12, +10 und +12 % fortgesetzt
  70: [ 109, 105,  99,  96,  93,  91,  89,  86,  84,  82,  80,  79,  78],   // −12 und +12 % fortgesetzt
  80: [ 142, 136, 129, 124, 119, 115, 111, 108, 104, 101,  98,  96,  93],   // −12 und +12 % fortgesetzt
}
/** Stufen der Abb. 2, aufsteigend */
export const ANHALTESICHT_STUFEN = Object.keys(ANHALTESICHT).map(Number).sort((a, b) => a - b)
/** Bereich von i [%], über den die Kurve in Abb. 2 gezeichnet ist, mit den gestrichelten Stücken (ausserhalb verlängert) */
export const ANHALTESICHT_GEZEICHNET: Record<number, [number, number]> = {
  30: [-12, 12], 40: [-12, 12], 50: [-12, 12], 60: [-12, 12], 70: [-10.8, 11], 80: [-10, 10],
}
/** Bereich von i [%], über den die Kurve in Abb. 2 durchgezogen ist (nur dieser gilt als gezeichnet;
 *  ausserhalb unsicher) */
export const ANHALTESICHT_DURCHGEZOGEN: Record<number, [number, number]> = {
  30: [-12, 12], 40: [-12, 12], 50: [-11, 10], 60: [-10, 10], 70: [-9, 9], 80: [-8, 8],
}
export interface Anhaltesicht {
  vp: number               // Tempo (Eingang)
  stufe: number            // Stufe der Abb. 2 (aufgerundet, 30 … 80 km/h)
  i: number                // Längsneigung (Eingang) [%]
  roh: number              // S_A nach Diagramm, linear interpoliert [m]
  meter: number            // roh auf ganze Meter aufgerundet [m]
  unsicher: boolean        // Wert ausserhalb des durchgezogenen Stücks der Kurve (gestrichelt bzw. verlängert)
  verlaengert: boolean     // Wert ausserhalb der gezeichneten Kurve, auch des gestrichelten Stücks (verlängert)
  hinweise: string[]
}

const fi = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '') + String(Math.abs(x)).replace('.', ',')

/** Anhaltesichtweite nach VSS 40 090b Abb. 2 für das Tempo vp [km/h] und die Längsneigung i [%]: VP auf die nächste Stufe
 *  aufgerundet (unter 30 wie 30, über 80 wie 80, je mit Hinweis), linear interpoliert in i, ausserhalb ±12 % am Rand
 *  festgehalten (mit Hinweis) */
export function anhaltesichtweite(vp: number, i: number): Anhaltesicht {
  const hinweise: string[] = []
  const max = ANHALTESICHT_STUFEN[ANHALTESICHT_STUFEN.length - 1], min = ANHALTESICHT_STUFEN[0]
  const stufe = ANHALTESICHT_STUFEN.find(t => t >= vp) ?? max
  if (vp < min) hinweise.push(`Tempo ${vp} km/h unter der Abb. 2 (ab ${min} km/h): Kurve ${min} km/h.`)
  if (vp > max) hinweise.push(`Tempo ${vp} km/h über der Abb. 2 (bis ${max} km/h): Kurve ${max} km/h, prüfen.`)
  const ii = Number.isFinite(i) ? i : 0
  const ic = Math.min(ANHALTESICHT_I_MAX, Math.max(ANHALTESICHT_I_MIN, ii))
  if (ic !== ii) hinweise.push(`Längsneigung ${fi(ii)} % ausserhalb der Abb. 2 (${fi(ANHALTESICHT_I_MIN)} … ${fi(ANHALTESICHT_I_MAX)} %): ` +
    `Wert bei ${fi(ic)} % festgehalten.`)
  const w = ANHALTESICHT[stufe]
  const k = Math.min(ANHALTESICHT_I.length - 2, Math.floor((ic - ANHALTESICHT_I_MIN) / 2))
  const t = (ic - ANHALTESICHT_I[k]) / (ANHALTESICHT_I[k + 1] - ANHALTESICHT_I[k])
  const roh = w[k] + t * (w[k + 1] - w[k])
  const [g0, g1] = ANHALTESICHT_GEZEICHNET[stufe], [d0, d1] = ANHALTESICHT_DURCHGEZOGEN[stufe]
  const verlaengert = ic < g0 - 1e-9 || ic > g1 + 1e-9
  const unsicher = verlaengert || ic < d0 - 1e-9 || ic > d1 + 1e-9
  if (unsicher) hinweise.push(`Kurve ${stufe} km/h in Abb. 2 nur von ${fi(d0)} bis ${fi(d1)} % durchgezogen: Wert ` +
    `${verlaengert ? `verlängert (gezeichnet nur von ${fi(g0)} bis ${fi(g1)} %)` : 'aus dem gestrichelten Stück'}, unsicher.`)
  return { vp, stufe, i: ii, roh, meter: Math.ceil(roh - 1e-9), unsicher, verlaengert, hinweise }
}
