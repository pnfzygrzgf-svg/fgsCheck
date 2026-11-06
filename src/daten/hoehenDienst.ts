// ── Höhendienste für die Profile (swissALTI3D schweizweit, in der Stadt Bern das DTM 2023 der Stadt) ──
//
// Ein Dienst liefert Höhenprofile entlang einer Linie (ProfilPunkt: dist, h) für die Längsneigung (Knotensicht, Fahrlinie), die
// Erkennungsdistanz und die Sicht auf die Wartefläche (erkennungGelaende.ts, sichtGelaende.ts, daten/sichtProfil.ts). In der Stadt Bern
// steht das DTM 2023 (25 cm, Toleranz BERN_DTM_TOL_M) zuerst; antwortet es nicht (Fehler, Zeitüberschreitung, Linie ausserhalb),
// fällt der Abruf auf swissALTI3D zurück (mitRueckfall). Je Zufahrt bzw. Knotensicht gilt immer nur ein Modell; die Ergebnisse tragen
// den Namen des benutzten Modells (kurz), aus dem die Texte den Modellbezug bilden.

import type { P } from '../geo'
import { istAbbruch, type Abruf } from './holen'
import { ladeProfil, linieLaenge, profilLesen, profilUrl, PROFIL_PUNKTE } from '../knotensicht/daten/hoehen'
import { HOEHEN_QUELLE, neigungMessung, type ProfilPunkt } from '../knotensicht/rechner/neigung'
import type { NeigungMessung } from '../knotensicht/rechner/typen'
import { BERN_DTM_KURZ, BERN_DTM_MS, BERN_DTM_TOL_M, bernDtmLesen, bernDtmUrl, ladeBernProfil } from './bernDtm'

export type HoehenDienstId = 'swissalti' | 'bern.dtm'

export interface HoehenDienst {
  /** Kennung im Quellenregister */
  id: HoehenDienstId
  /** Modellname in Texten, z. B. «Geländemodell (swissALTI3D)» */
  kurz: string
  /** Anbieter mit Quellenangabe */
  anbieter: string
  host: string
  /** Gelände verdeckt erst ab so viel über der Sichtlinie [m] */
  tolM: number
  /** Schlüssel in «Geladene Quellen»: Längsneigung/Erkennung bzw. Sicht auf die Wartefläche */
  schluessel: { neigung: string; sicht: string }
  profilUrl(linie: P[], punkte: number): string
  lesen(roh: unknown): ProfilPunkt[]
  /** Profil entlang der Linie holen */
  laden(linie: P[], punkte: number, signal?: AbortSignal): Promise<Abruf<ProfilPunkt[]>>
  ms: number
}

/** Toleranz von swissALTI3D (erkennungGelaende.GELAENDE_TOL_M; hier wiederholt, damit der Dienst ohne die Prüfung ladbar bleibt) */
const SWISSALTI_TOL_M = 0.3

export const SWISSALTI: HoehenDienst = {
  id: 'swissalti', kurz: 'swissALTI3D', anbieter: '© swisstopo', host: 'api3.geo.admin.ch', tolM: SWISSALTI_TOL_M,
  schluessel: { neigung: 'hoehen', sicht: 'hoehenSicht' },
  profilUrl, lesen: profilLesen, laden: (linie, _punkte, signal) => ladeProfil(linie, signal), ms: 15000,
}
export const BERN_DTM: HoehenDienst = {
  id: 'bern.dtm', kurz: BERN_DTM_KURZ, anbieter: 'Geodaten Stadt Bern', host: 'gisapp.bern.ch', tolM: BERN_DTM_TOL_M,
  schluessel: { neigung: 'hoehenBern', sicht: 'hoehenSichtBern' },
  profilUrl: bernDtmUrl, lesen: bernDtmLesen, laden: ladeBernProfil, ms: BERN_DTM_MS,
}
export const HOEHEN_DIENSTE: readonly HoehenDienst[] = [SWISSALTI, BERN_DTM]

/** Dienste in der Reihenfolge des Rückfalls: in der Stadt Bern das DTM der Stadt, dann swissALTI3D; sonst nur swissALTI3D */
export const hoehenDienstFuer = (bern: boolean): readonly HoehenDienst[] => (bern ? [BERN_DTM, SWISSALTI] : [SWISSALTI])

/** Dienst zum Modellnamen (kurz) bzw. zur Kennung; undefined, wenn unbekannt */
export const hoehenDienst = (kurzOderId: string | undefined): HoehenDienst | undefined =>
  HOEHEN_DIENSTE.find(d => d.kurz === kurzOderId || d.id === kurzOderId)

/** Modellname aus der Quelle einer Neigungsmessung («swissALTI3D (swisstopo), Profil 50 m, 20 Punkte» → «swissALTI3D») */
export function modellName(quelle: string): string {
  const d = HOEHEN_DIENSTE.find(x => quelle.startsWith(x.kurz))
  if (d) return d.kurz
  const kopf = quelle.split(',')[0].trim()
  return kopf.replace(/\s*\(swisstopo\)$/, '') || 'Höhenmodell'
}

/** Neigungsmessung des Kerns mit dem Modellnamen des Dienstes als Quelle (der Kern schreibt immer HOEHEN_QUELLE) */
export function neigungMit(d: HoehenDienst, profil: ProfilPunkt[] | Error, geplantM?: number): NeigungMessung {
  const m = neigungMessung(profil, geplantM)
  return d.id === 'swissalti' ? m : { ...m, quelle: m.quelle.replace(HOEHEN_QUELLE, `${d.kurz} (${d.anbieter.replace(/^© /, '')})`) }
}

/** Neigung entlang der Linie mit dem Dienst (wie knotensicht/daten/hoehen.ladeNeigung): Fehler des Dienstes → i = null mit Hinweis;
 *  ein Abbruch wird weitergereicht. -> [Messung, Abruf bzw. Fehlertext] */
export async function ladeNeigungMit(d: HoehenDienst, linie: P[], signal?: AbortSignal): Promise<[NeigungMessung, Abruf<ProfilPunkt[]> | string]> {
  try {
    const r = await d.laden(linie, PROFIL_PUNKTE, signal)
    return [neigungMit(d, r.daten, linieLaenge(linie)), r]
  } catch (e) {
    if (signal?.aborted || istAbbruch(e)) throw e
    const f = e instanceof Error ? e : new Error(String(e))
    return [neigungMit(d, f), f.message]
  }
}

/** Ergebnis eines Laufs mit dem Dienst, der ihn geliefert hat */
export interface MitDienst<R> { dienst: HoehenDienst; wert: R }

/**
 * Lauf mit Rückfall: die Dienste der Reihe nach; wirft der Lauf (ausser bei Abbruch), meldet `rueckfall(dienst, fehler)` und der
 * nächste Dienst übernimmt; wirft der letzte, wird sein Fehler weitergereicht. Ein Abbruch wird sofort weitergereicht.
 */
export async function mitRueckfall<R>(dienste: readonly HoehenDienst[], lauf: (d: HoehenDienst) => Promise<R>,
  rueckfall: (d: HoehenDienst, fehler: Error, naechster: HoehenDienst) => void = () => {}): Promise<MitDienst<R>> {
  if (!dienste.length) throw new Error('kein Höhendienst')
  for (let i = 0; i < dienste.length; i++) {
    const d = dienste[i]
    try {
      return { dienst: d, wert: await lauf(d) }
    } catch (e) {
      if (istAbbruch(e) || i === dienste.length - 1) throw e
      rueckfall(d, e instanceof Error ? e : new Error(String(e)), dienste[i + 1])
    }
  }
  throw new Error('kein Höhendienst')
}

/** Rückfallgrund für «Geladene Quellen» */
export const rueckfallText = (fehler: Error, naechster: HoehenDienst): string => `${fehler.message} (Rückfall auf ${naechster.kurz})`
