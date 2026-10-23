// ── Mittlere Längsneigung aus einem Höhenprofil (E3a) ──
//
// Das Profil läuft vom Knoten weg (dist ab K bzw. ab dem Nullpunkt der Zufahrt). Mittlere Neigung = Steigung einer
// Ausgleichsgeraden (kleinste Quadrate) über (dist, Höhe), nicht Endpunkt minus Anfangspunkt. Ein Ausreisser (z. B. Mauer, Brücke
// oder Böschung im Höhenmodell) schlägt so nur gedämpft durch; Punkte, die nach der ersten Geraden mehr als AUSREISSER_M bzw. das
// AUSREISSER_FAKTOR-fache des Medians der absoluten Abweichungen neben ihr liegen, fallen weg und die Gerade wird neu gelegt.
// Mehrere Ausreisser zusammen (Brücke, Kuppe) entfernt die Regel nicht: bleibt die Streuung um die Gerade über STREUUNG_M, gibt
// die Messung einen Hinweis (Neigung von Hand prüfen).
// Vorzeichen in Fahrtrichtung zum Knoten hin (FA bzw. FB fahren auf den Knoten zu): steigt das Gelände vom Knoten weg an, fährt
// das Fahrzeug bergab, i ist negativ (talwärts negativ, wie VSS 40 090b Abb. 2).

import type { NeigungMessung } from './typen'

/** Abweichung von der ersten Geraden, ab der ein Punkt als Ausreisser wegfällt: mindestens so viel [m] … */
export const AUSREISSER_M = 0.5
/** … und mindestens dieses Vielfache des Medians der absoluten Abweichungen */
export const AUSREISSER_FAKTOR = 4
/** Streuung (quadratisches Mittel der Abweichungen) um die Gerade, ab der die Messung einen Hinweis gibt [m] */
export const STREUUNG_M = 0.3
/** mindestens so viele Punkte für eine Neigung */
export const PROFIL_MIN_PUNKTE = 3
/** Profil mindestens so lang [m] (Plan E3a) */
export const PROFIL_MIN_M = 20
/** Zufahrt: Hinweis «steile Zufahrt» ab |i| über diesem Wert [%] (noch ohne Wirkung auf B; Tab. 2 folgt in E3b) */
export const ZUFAHRT_STEIL_PROZENT = 6
export const HOEHEN_QUELLE = 'swissALTI3D (swisstopo)'

export interface ProfilPunkt { dist: number; h: number }

/** Ausgleichsgerade h = a + b · dist (kleinste Quadrate); null bei weniger als zwei verschiedenen dist */
export function ausgleichsgerade(pkt: ProfilPunkt[]): { a: number; b: number } | null {
  const n = pkt.length
  if (n < 2) return null
  const mx = pkt.reduce((s, p) => s + p.dist, 0) / n, my = pkt.reduce((s, p) => s + p.h, 0) / n
  let sxx = 0, sxy = 0
  for (const p of pkt) { sxx += (p.dist - mx) ** 2; sxy += (p.dist - mx) * (p.h - my) }
  if (sxx < 1e-9) return null
  const b = sxy / sxx
  return { a: my - b * mx, b }
}

const median = (x: number[]): number => {
  const s = [...x].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Mittlere Längsneigung in Fahrtrichtung zum Knoten hin [%] aus einem Profil vom Knoten weg; talwärts negativ. Ausreisser fallen
 * weg (siehe oben). -> { i, punkte (verwendet), ausreisser, laenge } bzw. null bei zu wenigen Punkten
 */
export function neigungAusProfil(profil: ProfilPunkt[]): { i: number; punkte: number; ausreisser: number; laenge: number; streuung: number } | null {
  const pkt = profil.filter(p => Number.isFinite(p.dist) && Number.isFinite(p.h))
  if (pkt.length < PROFIL_MIN_PUNKTE) return null
  const g0 = ausgleichsgerade(pkt)
  if (!g0) return null
  const abw = pkt.map(p => Math.abs(p.h - (g0.a + g0.b * p.dist)))
  const grenze = Math.max(AUSREISSER_M, AUSREISSER_FAKTOR * median(abw))
  const gut = pkt.filter((_, k) => abw[k] <= grenze)
  const g = gut.length >= PROFIL_MIN_PUNKTE ? ausgleichsgerade(gut) ?? g0 : g0
  const genutzt = gut.length >= PROFIL_MIN_PUNKTE ? gut : pkt
  const laenge = Math.max(...pkt.map(p => p.dist)) - Math.min(...pkt.map(p => p.dist))
  const streuung = Math.sqrt(genutzt.reduce((s, p) => s + (p.h - (g.a + g.b * p.dist)) ** 2, 0) / genutzt.length)
  // Steigung vom Knoten weg (b) -> Neigung zum Knoten hin: −b
  return { i: -g.b * 100, punkte: genutzt.length, ausreisser: pkt.length - genutzt.length, laenge, streuung }
}

const f0 = (x: number) => String(Math.round(x))
const f1 = (x: number) => x.toFixed(1).replace('.', ',')
/** auf 0,1 % gerundet (Anzeige und Rechnung) */
export const neigungRunden = (i: number): number => Math.round(i * 10) / 10 || 0

/** Messung aus einem geladenen Profil bzw. einem Fehler des Dienstes (dann i = null, Rechnung mit 0 % und Hinweis) */
export function neigungMessung(profil: ProfilPunkt[] | Error): NeigungMessung {
  if (profil instanceof Error) return { i: null, quelle: `${HOEHEN_QUELLE} nicht verfügbar`, laenge: 0, punkte: 0,
    hinweis: `Höhenmodell nicht verfügbar (${profil.message}): Längsneigung 0 % angenommen, von Hand eingeben.` }
  const r = neigungAusProfil(profil)
  if (!r) return { i: null, quelle: `${HOEHEN_QUELLE}: zu wenige Punkte`, laenge: 0, punkte: profil.length,
    hinweis: `Höhenprofil mit ${profil.length} Punkten: keine Neigung bestimmbar, 0 % angenommen, von Hand eingeben.` }
  return { i: neigungRunden(r.i), quelle: `${HOEHEN_QUELLE}, Profil ${f0(r.laenge)} m, ${r.punkte} Punkte`, laenge: r.laenge, punkte: r.punkte,
    hinweis: [r.ausreisser ? `Höhenprofil: ${r.ausreisser} Punkt${r.ausreisser > 1 ? 'e' : ''} weit neben der Ausgleichsgeraden ` +
      '(Mauer, Brücke, Böschung?) nicht gerechnet.' : '', r.streuung > STREUUNG_M ? `Höhenprofil uneben (Streuung ${f1(r.streuung)} m um ` +
      'die Ausgleichsgerade; Kuppe, Wanne, Brücke?): Längsneigung vor Ort bzw. von Hand prüfen.' : ''].filter(x => x).join(' ') || null }
}
