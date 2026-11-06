// ── Seite 1 des Berichts im Druck: Höhe des Kartenbilds (06.11.2026) ──
//
// Ort, Ergebnis, Kartenbild und Legende sollen zusammen auf die erste Seite. Die Länge von Ergebnis und Legende hängt vom Fall ab, darum
// richtet sich das Bild nach ihnen: volle Breite, wenn es passt, sonst kleiner, mindestens BILD_MIN_MM. Die Werte sind am gedruckten
// Bericht gemessen (Firefox, A4, Mühlemattstrasse): Inhalt bis und mit Ergebnis endet bei rund 97 mm ab Blattoberkante, der Fussrand
// beginnt bei 283 mm. Zeichen je Zeile und Zeilenhöhe sind vorsichtig gewählt; die Rechnung ist eine Schätzung, kein Mass.

export const BILD_BREITE_MM = 186   // A4 ohne die seitlichen Ränder
export const BILD_MIN_MM = 70
const SEITE_ENDE_MM = 283
const KOPF_MM = 97          // Kopf, Ort und Ergebnis mit einem Streifen
const JE_STREIFEN_MM = 5    // weitere Zeile im Ergebnis
const RESERVE_MM = 7        // weitere Zeile unter «Ort» (Bodenbedeckung, Bezeichnung über zwei Zeilen)
const LEITSATZ_MM = 8       // Satz über der Legende, zwei Zeilen
const ABSTAND_MM = 6
const ZEILE_MM = 3.9
const ERGEBNIS_ZEILE_MM = 5
const ZEICHEN_ERGEBNIS = 90
const ZEICHEN_SPALTE = 48
const ZEICHEN_BREIT = 105

/** Zuordnung zum OSM-Netz als Text (die Rechnung liefert Kennungen) */
export const netzQuelleText = (q: string): string => ({ uebergang: 'am Übergang', rueckfall: 'keine' } as Record<string, string>)[q] ?? q

/** Datum aus ISO-Schreibweise wie im übrigen Bericht (TT.MM.JJJJ), auch mitten im Text */
export const datumText = (t: string): string => t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3.$2.$1')

/** Druckzeilen der Legende: ganze Breite zuerst, die übrigen paarweise in zwei Spalten (die höhere Zelle zählt) */
export function legendeZeilen(texte: readonly string[], breit: readonly string[] = []): number {
  const zeilen = (t: string, n: number) => Math.max(1, Math.ceil(t.length / n))
  let n = breit.reduce((s, t) => s + zeilen(t, ZEICHEN_BREIT), 0)
  for (let i = 0; i < texte.length; i += 2) n += Math.max(zeilen(texte[i], ZEICHEN_SPALTE), texte[i + 1] ? zeilen(texte[i + 1], ZEICHEN_SPALTE) : 1)
  return n
}

/** Höhe der zusätzlichen Zeilen unter «Ergebnis» (Erkennungsdistanz, Bedarf) [mm] */
export const ergebnisZusatzMm = (texte: readonly string[]): number =>
  texte.reduce((s, t) => s + Math.max(1, Math.ceil(t.length / ZEICHEN_ERGEBNIS)) * ERGEBNIS_ZEILE_MM, 0)

/** Höhe des Kartenbilds im Druck [mm]; vollMm: Höhe bei voller Breite */
export function bildDruckHoeheMm(zeilen: number, streifen: number, vollMm: number, zusatzMm = 0): number {
  const frei = SEITE_ENDE_MM - KOPF_MM - JE_STREIFEN_MM * Math.max(0, streifen - 1) - zusatzMm - RESERVE_MM - ABSTAND_MM - LEITSATZ_MM - zeilen * ZEILE_MM
  return Math.max(Math.min(BILD_MIN_MM, vollMm), Math.min(vollMm, Math.floor(frei)))
}
