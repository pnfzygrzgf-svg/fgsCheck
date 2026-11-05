// ── Namen der Höhenmodelle in Texten (ohne Lader; auch im Worker nutzbar) ──
//
// Die Dienste selbst stehen in daten/hoehenDienst.ts (swissALTI3D schweizweit, DTM 2023 der Stadt Bern im Stadtgebiet). Eine
// Neigungsmessung des Kerns nennt ihr Modell am Anfang der Quelle («swissALTI3D (swisstopo), Profil 50 m, 20 Punkte»); die App schreibt
// für das Berner DTM «DTM 2023 Stadt Bern (Geodaten Stadt Bern), …» (hoehenDienst.neigungMit).

export const SWISSALTI_KURZ = 'swissALTI3D'
export const BERN_DTM_KURZ = 'DTM 2023 Stadt Bern'
/** Kurznamen der Modelle (Reihenfolge: längere zuerst, damit startsWith eindeutig bleibt) */
export const HOEHEN_MODELLE: readonly string[] = [BERN_DTM_KURZ, SWISSALTI_KURZ]
/** Modellbezug in Hilfetexten, die vor dem Laden gelten */
export const HOEHEN_MODELLE_TEXT = 'swissALTI3D, in der Stadt Bern DTM 2023'

/** Modellname aus der Quelle einer Neigungsmessung; «Höhenmodell», wenn keines erkennbar ist */
export function modellName(quelle: string | undefined | null): string {
  if (!quelle) return 'Höhenmodell'
  const m = HOEHEN_MODELLE.find(k => quelle.startsWith(k))
  return m ?? 'Höhenmodell'
}
/** Messung stammt aus einem Höhenmodell (Quelle beginnt mit einem Modellnamen) */
export const ausHoehenmodell = (quelle: string | undefined | null): boolean => !!quelle && HOEHEN_MODELLE.some(k => quelle.startsWith(k))
