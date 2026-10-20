// ── Bedarfsmodul: LSA-Zeiten als reine Formeln (I1 bis I8; Ausbau E4, in E0 nur getestet) ──
//
// VSS 40 837:2019-03 Z. 16, 18; SN 640 075:2014-12 Anh. 8.1.5; Handbuch Lichtsignalanlagen Stadt Bern V2.1 Kap. 24.2, 24.3,
// 30.3. Nur Formeln und Rundungen, die Grenzwerte stehen im Katalog (werte der Regeln).

/**
 * Zulässige Fussgänger-Gelbzeiten (I1, VSS 40 837 Z. 16): Anteil der Querung mit Gehgeschwindigkeit, ab- oder aufgerundet auf
 * ganze Sekunden (beides zulässig), je auf [min, max] begrenzt
 */
export function gelbZulaessig(L: number, anteil: number, gehV: number, min: number, max: number): number[] {
  const x = anteil * L / gehV
  const k = (v: number): number => Math.min(max, Math.max(min, v))
  return [...new Set([k(Math.floor(x + 1e-9)), k(Math.ceil(x - 1e-9))])]
}

/** Mindestfreigabe nach Norm: max(Minimum; Anteil · L / Gehgeschwindigkeit), ungerundet (I2) */
export const freigabeSollNorm = (L: number, anteil: number, gehV: number, min: number): number => Math.max(min, anteil * L / gehV)

/** Mit Insel in einer Phase: Weg bis Freigabeende L₁ + Insel + Drittel des letzten Abschnitts (I3a), Zeit in s */
export const freigabeSollInsel = (L1: number, inselB: number, L2: number, anteilLetzter: number, gehV: number): number =>
  (L1 + inselB + anteilLetzter * L2) / gehV

/** Bern: ganze Sekunden mit Rundungsschwelle s (0,5 für Gelb: 5,49 → 5, 5,50 → 6; 0,1 für Mindestfreigabe: 5,09 → 5, 5,10 → 6) */
export function rundeBern(x: number, schwelle: number): number {
  const ganz = Math.floor(x + 1e-9)
  return x - ganz >= schwelle - 1e-9 ? ganz + 1 : ganz
}
