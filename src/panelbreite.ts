// ── Breite des rechten Bereichs (Panel), ziehbar am Trenner zwischen Karte und Bereich ──
//
// Reine Funktionen: Breite klemmen (360 px bis 70 % der Fensterbreite), aus der Zeigerposition bzw. mit Pfeiltasten (±20 px) ändern,
// in localStorage lesen und speichern (Fehler beim Zugriff, z. B. privates Fenster, werden geschluckt: dann gilt die Vorgabe 560 px).

export const PANEL_MIN = 360
export const PANEL_VORGABE = 560
export const PANEL_MAX_ANTEIL = 0.7
export const PANEL_SCHRITT = 20
export const PANEL_SCHLUESSEL = 'fgsCheck.panelBreite'

type Speicher = Pick<Storage, 'getItem' | 'setItem'>

/** grösste Breite: 70 % der Fensterbreite, mindestens 360 px */
export const panelMax = (fensterBreite: number): number => Math.max(PANEL_MIN, Math.floor(fensterBreite * PANEL_MAX_ANTEIL))

/** Breite auf 360 px bis 70 % der Fensterbreite klemmen (schmales Fenster: mindestens 360 px), ganze Pixel */
export function klemmen(breite: number, fensterBreite: number): number {
  const max = panelMax(fensterBreite)
  if (!Number.isFinite(breite)) return Math.min(max, PANEL_VORGABE)
  return Math.round(Math.min(max, Math.max(PANEL_MIN, breite)))
}

/** Breite aus der Zeigerposition: der Bereich reicht vom Zeiger bis zum rechten Fensterrand */
export const breiteAusZeiger = (clientX: number, fensterBreite: number): number => klemmen(fensterBreite - clientX, fensterBreite)

/** Breite nach einer Taste: Pfeil links verbreitert, Pfeil rechts verschmälert; andere Tasten: null */
export function breiteNachTaste(breite: number, taste: string, fensterBreite: number): number | null {
  if (taste === 'ArrowLeft') return klemmen(breite + PANEL_SCHRITT, fensterBreite)
  if (taste === 'ArrowRight') return klemmen(breite - PANEL_SCHRITT, fensterBreite)
  return null
}

function speicher(): Speicher | null {
  try { return globalThis.localStorage ?? null } catch { return null }
}

/** gespeicherte Breite (geklemmt); fehlt sie bzw. ist der Speicher nicht lesbar: Vorgabe */
export function ladeBreite(fensterBreite: number, s: Speicher | null = speicher()): number {
  try {
    const v = Number(s?.getItem(PANEL_SCHLUESSEL) ?? NaN)
    if (Number.isFinite(v) && v > 0) return klemmen(v, fensterBreite)
  } catch { /* Speicher nicht lesbar: Vorgabe */ }
  return klemmen(PANEL_VORGABE, fensterBreite)
}

/** Breite speichern (Fehler beim Schreiben werden geschluckt) */
export function speichereBreite(breite: number, s: Speicher | null = speicher()): void {
  try { s?.setItem(PANEL_SCHLUESSEL, String(Math.round(breite))) } catch { /* nicht speicherbar: nur für diese Sitzung */ }
}
