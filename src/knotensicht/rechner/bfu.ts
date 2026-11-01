// ── Vergleichswerte der bfu (Block 5): bfu-Fachdokumentation «Sicht an Verzweigungen und Grundstückzufahrten», 2.443.01-2022/BM.021,
//    Tab. 2 (S. 5) und Tab. 3 (S. 7) ──
//
// Nur Zahlenwerte, kein Text der bfu. Die Werte erscheinen nur im Bericht, als bfu gekennzeichnet, und haben keine Wirkung auf die
// Rechnung (massgebend bleibt VSS 40 273 Tab. 2 und Tab. 3). Spalten nach der Längsneigung i [%] (talwärts negativ): ≥ −8 (Gefälle 8 %
// und mehr), −6, −4, −2, > 0 (Steigung); Zwischenwerte zur strengeren Klasse (z. B. −5 % wie −6 %, −7 % wie ≥ −8 %; −2 < i ≤ 0 wie −2).
// Tab. 2: Veloanlage (Radstreifen, Radweg, gemeinsamer Rad- und Fussweg), in der Spalte ≥ −8 als Mindestwert angegeben.
// Tab. 3: Trottoir, getrennt nach Fussgängern, fäG und Kindern auf dem Velo bzw. nach zugelassenen Velos (SSV Art. 65 Abs. 8).
// Neigung unbekannt: strengste Spalte (wie in der Rechnung, Entscheid 31.10.2026).

/** Spalten der bfu-Tabellen [%] */
export const BFU_SPALTEN = ['≥ −8', '−6', '−4', '−2', '> 0']
/** bfu BM.021 Tab. 2 (S. 5): Sichtweite A [m] auf eine Radverkehrsanlage je Spalte */
export const BFU_TAB2_VELO = [60, 55, 45, 40, 40]
/** bfu BM.021 Tab. 3 (S. 7): Sichtweite A_T [m] auf das Trottoir je Spalte */
export const BFU_TAB3 = { fuss: [30, 25, 20, 20, 15], velo: [35, 30, 30, 25, 20] }
/** Kurzname der Quelle (Bericht) */
export const BFU_QUELLE = 'bfu BM.021 (2022)'

/** Spalte der bfu-Tabellen für die Längsneigung i [%]: 0 (≥ −8), 1 (−6), 2 (−4), 3 (−2), 4 (> 0); Zwischenwerte zur strengeren
 *  Klasse; unbekannt: Spalte 0 */
export function bfuSpalte(i: number, unbekannt = false): 0 | 1 | 2 | 3 | 4 {
  if (unbekannt) return 0
  const x = Number.isFinite(i) ? i : 0
  return x < -6 - 1e-9 ? 0 : x < -4 - 1e-9 ? 1 : x < -2 - 1e-9 ? 2 : x <= 1e-9 ? 3 : 4
}

/** Vergleichswert Velo nach bfu Tab. 2: A [m] und Text */
export function bfuVelo(i: number, unbekannt = false): { A: number; text: string } {
  const k = bfuSpalte(i, unbekannt)
  return { A: BFU_TAB2_VELO[k], text: `${BFU_QUELLE} Tab. 2, Spalte ${BFU_SPALTEN[k]} %${unbekannt ? ' (Neigung unbekannt: strengste Spalte)' : ''}` }
}

/** Vergleichswerte Trottoir nach bfu Tab. 3: Fussgänger, fäG und Kinder auf dem Velo bzw. zugelassene Velos [m] und Text */
export function bfuTrottoir(i: number, unbekannt = false): { fuss: number; velo: number; text: string } {
  const k = bfuSpalte(i, unbekannt)
  return { fuss: BFU_TAB3.fuss[k], velo: BFU_TAB3.velo[k],
    text: `${BFU_QUELLE} Tab. 3, Spalte ${BFU_SPALTEN[k]} %${unbekannt ? ' (Neigung unbekannt: strengste Spalte)' : ''}` }
}
