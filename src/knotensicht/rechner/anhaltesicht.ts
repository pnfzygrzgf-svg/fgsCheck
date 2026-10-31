// ── Anhaltesichtweite S_A auf übrigen Strassen (VSS 40 090b, Abb. 2) ──
//
// VSS 40 090b Abb. 2, abgelesen, Ablesegenauigkeit ±2 m. Nur Zahlenwerte, kein Normtext.
// Eigene Ablesung vom 30./31.10.2026 (Neigungstabelle.csv), Ablesegenauigkeit ±2 m; Werte ohne Ablesung aus der Digitalisierung
// vom 15.10.2026 (70 km/h bei −12 und +12 %, 80 km/h bei −12, −10 und +12 %). Digitalisierung 15.10.2026: Seite 5 bei 300 dpi
// gerendert, Achsen an allen Gitterlinien geeicht (i alle 1 %, S_A alle 10 m, stückweise linear), Kurvenmitte je Pixelspalte
// verfolgt, je Stützstelle Ausgleichsgerade über ±0,6 %, auf ganze Meter gerundet. Monoton: mit zunehmendem Gefälle (kleinerem i)
// nie kleiner (geprüft 31.10.2026, keine Zelle verletzt das).
// Kontrolle bei i = 0 gegen den unteren Wert der VSS 40 273 Tab. 1 (Ablesung 30./31.10.2026): 30 km/h +4 m (24 statt 20 m),
// 40 km/h +2 m (37 statt 35 m), 50 km/h +1 m (51 statt 50 m), 60 km/h −2 m (68 statt 70 m), 70 km/h −3 m (87 statt 90 m),
// 80 km/h +1 m (111 statt 110 m): die Abweichung steht im Diagramm selbst (Tab. 1 offenbar gerundet).
// Entscheid 15.10.2026: Die Kurven werden so verschoben, dass sie bei i = 0 den unteren Wert der Tab. 1 treffen (wert =
// Diagrammwert − Abweichung bei i = 0); aus Abb. 2 zählt nur die Wirkung der Neigung, die VSS 40 273 bleibt bei i = 0 die Referenz, und an der 2-%-Grenze entsteht kein Sprung. Der rohe Diagrammwert bleibt in «roh».
// Die Kurven 70 und 80 km/h sind nicht über den ganzen Bereich gezeichnet (ANHALTESICHT_GEZEICHNET, mit den gestrichelten
// Stücken); die Werte ausserhalb sind verlängert (Gerade über die letzten 2 % der Kurve). Die Kurven ab 50 km/h sind an den Enden
// gestrichelt; durchgezogen sind (am 300-dpi-Render nachgemessen, 31.10.2026) 30 und 40 km/h −12 … +12 %, 50 km/h −11 … +10 %,
// 60 km/h −10 … +10 %, 70 km/h −9 … +9 %, 80 km/h −8 … +8 % (ANHALTESICHT_DURCHGEZOGEN). Die Bedeutung der Strichelung nennt die
// Norm nicht; Entscheid 31.10.2026: gestrichelt gilt als nicht gezeichnet. Ausserhalb des durchgezogenen Stücks bleibt der Wert
// (aus dem gestrichelten Stück abgelesen bzw. verlängert), gilt aber als unsicher (mit Hinweis).

import { TAB1 } from './sichtweite'

/** Stützstellen der Längsneigung i [%], in Fahrtrichtung, talwärts negativ */
export const ANHALTESICHT_I = [-12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12]
export const ANHALTESICHT_I_MIN = ANHALTESICHT_I[0]
export const ANHALTESICHT_I_MAX = ANHALTESICHT_I[ANHALTESICHT_I.length - 1]

/** VSS 40 090b Abb. 2, abgelesen (eigene Ablesung 30./31.10.2026; Lücken aus der Digitalisierung 15.10.2026), Ablesegenauigkeit ±2 m:
 *  VP [km/h] -> S_A [m] je Stützstelle von ANHALTESICHT_I */
export const ANHALTESICHT: Record<number, number[]> = {
  //    −12  −10   −8   −6   −4   −2    0   +2   +4   +6   +8  +10  +12
  30: [  26,  26,  26,  25,  25,  25,  24,  24,  24,  23,  23,  22,  22],
  40: [  40,  40,  39,  38,  38,  37,  37,  36,  35,  34,  34,  33,  33],
  50: [  58,  56,  54,  53,  52,  51,  51,  50,  49,  47,  46,  45,  45],
  60: [  81,  78,  76,  74,  72,  70,  68,  66,  64,  62,  61,  60,  58],
  70: [ 109, 101,  99,  95,  92,  89,  87,  85,  84,  82,  80,  78,  76],   // −12 und +12 % aus der Digitalisierung 15.10.2026
  80: [ 143, 135, 130, 123, 118, 114, 111, 106, 103, 100,  97,  94,  92],   // −12, −10 und +12 % aus der Digitalisierung 15.10.2026
}
/** Stufen der Abb. 2, aufsteigend */
export const ANHALTESICHT_STUFEN = Object.keys(ANHALTESICHT).map(Number).sort((a, b) => a - b)
/** Bereich von i [%], über den die Kurve in Abb. 2 gezeichnet ist, mit den gestrichelten Stücken (ausserhalb verlängert) */
export const ANHALTESICHT_GEZEICHNET: Record<number, [number, number]> = {
  30: [-12, 12], 40: [-12, 12], 50: [-12, 12], 60: [-12, 12], 70: [-10.8, 11], 80: [-10, 10],
}
/** Bereich von i [%], über den die Kurve in Abb. 2 durchgezogen ist (Entscheid 31.10.2026: nur dieser gilt als gezeichnet;
 *  ausserhalb unsicher) */
export const ANHALTESICHT_DURCHGEZOGEN: Record<number, [number, number]> = {
  30: [-12, 12], 40: [-12, 12], 50: [-11, 10], 60: [-10, 10], 70: [-9, 9], 80: [-8, 8],
}
/** Abweichung der Kurve bei i = 0 vom unteren Wert der VSS 40 273 Tab. 1 [m] (Kontrolle der Ablesung; als Funktion, weil
 *  sichtweite.ts dieses Modul einbindet) */
export const anhalteAbweichung = (stufe: number): number => ANHALTESICHT[stufe][ANHALTESICHT_I.indexOf(0)] - TAB1[stufe][0]
/** ab dieser Abweichung von Tab. 1 bei i = 0 nennt die App einen Hinweis [m] */
export const ABWEICHUNG_HINWEIS_M = 2

export interface Anhaltesicht {
  vp: number               // Tempo (Eingang)
  stufe: number            // Stufe der Abb. 2 (aufgerundet, 30 … 80 km/h)
  i: number                // Längsneigung (Eingang) [%]
  roh: number              // S_A nach Diagramm, linear interpoliert [m]
  wert: number             // S_A auf Tab. 1 verschoben: roh − Abweichung bei i = 0 [m]
  meter: number            // wert auf ganze Meter aufgerundet [m]
  unsicher: boolean        // Wert ausserhalb des durchgezogenen Stücks der Kurve (gestrichelt bzw. verlängert)
  verlaengert: boolean     // Wert ausserhalb der gezeichneten Kurve, auch des gestrichelten Stücks (verlängert)
  abweichung: number       // Abweichung der Kurve bei i = 0 vom unteren Wert der Tab. 1 [m] (steht so im Diagramm)
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
  const abw = anhalteAbweichung(stufe)
  const wert = roh - abw
  if (Math.abs(abw) >= ABWEICHUNG_HINWEIS_M) hinweise.push(`Abb. 2 liegt für ${stufe} km/h bei i = 0 ${Math.abs(abw)} m ${abw > 0 ? 'über' : 'unter'} ` +
    `dem unteren Wert der VSS 40 273 Tab. 1 (${TAB1[stufe][0]} m); die Kurve ist auf Tab. 1 verschoben, aus Abb. 2 zählt nur die ` +
    `Wirkung der Neigung (Diagramm bei ${fi(ic)} %: ${Math.ceil(roh - 1e-9)} m).`)
  return { vp, stufe, i: ii, roh, wert, meter: Math.ceil(wert - 1e-9), unsicher, verlaengert, abweichung: abw, hinweise }
}
