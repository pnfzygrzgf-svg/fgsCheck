// ── Vorschau der Amtlichen Vermessung beim Planen ohne geladenen Ort (27.10.2026) ──
//
// Mit «Streifen planen» bzw. «Trottoirüberfahrt planen» ohne geladenen Ort lädt die App nur die AV-Bodenbedeckung (geodienste.ch, Rechteck
// ±AV_RADIUS_M um die Kartenmitte, wie ein Fall), damit die Bordkanten beim Zeichnen zu sehen sind und die Enden auf AV-Stützpunkte fangen.
// Erst ab Zoom VORSCHAU_ZOOM (sonst Hinweis); verschiebt man die Karte um mehr als NACHLADEN_AB_M, lädt sie um die neue Mitte (nur der
// letzte Ausschnitt bleibt). Liegt der fertige Streifen ganz innert NACHLADEN_M um die Mitte der Vorschau, lädt der neue Fall dort und
// nimmt die Vorschau als AV (keine zweite Abfrage); sonst wie bisher. Ohne OSM und Kataster; nichts davon kommt in den Fall.

import { dist, type P } from './geo'
import { avParsen, ladeAvRoh, type AvFlaeche, type GeoJson } from './daten/av'
import type { Abruf } from './daten/holen'
import { AV_RADIUS_M, NACHLADEN_M } from './abdeckung'

/** Vorschau erst ab diesem Zoom (weiter weg wäre der Ausschnitt ±150 m kleiner als die Karte) */
export const VORSCHAU_ZOOM = 17
/** neu laden, wenn die Kartenmitte so weit von der Mitte der Vorschau liegt [m] */
export const NACHLADEN_AB_M = 100
export const VORSCHAU_TEXT = 'Vermessung geladen (nur Anzeige)'
export const ZOOM_TEXT = 'näher heranzoomen, dann lädt die Vermessung'

export interface Vorschau { mitte: P; abruf: Abruf<GeoJson>; av: AvFlaeche[] }
export type Lader = (e: number, n: number, radius: number, signal?: AbortSignal) => Promise<Abruf<GeoJson>>

/** Stand der Vorschau mit Laden, Nachladen und Aufräumen; melden: nach jeder Änderung (App: neu zeichnen) */
export class AvVorschau {
  stand: Vorschau | null = null
  hinweis: string | null = null
  laedt = false
  private ctrl: AbortController | null = null
  private ziel: P | null = null
  constructor(private readonly melden: () => void, private readonly laden: Lader = ladeAvRoh) {}

  /** Werkzeug an (aktiv) bzw. aus; Kartenmitte (LV95) und Zoom nach dem Verschieben */
  async aktualisieren(aktiv: boolean, mitte: P, zoom: number): Promise<void> {
    if (!aktiv) { this.leeren(); return }
    if (zoom < VORSCHAU_ZOOM) { this.setze(this.stand, ZOOM_TEXT); return }
    const nah = (p: P | null) => !!p && dist(p, mitte) <= NACHLADEN_AB_M
    if (nah(this.stand?.mitte ?? null) || (this.laedt && nah(this.ziel))) { this.setze(this.stand, this.stand ? VORSCHAU_TEXT : null); return }
    this.ctrl?.abort()
    const ctrl = new AbortController()
    this.ctrl = ctrl; this.ziel = mitte; this.laedt = true
    this.setze(this.stand, 'Vermessung wird geladen …')
    try {
      const abruf = await this.laden(mitte[0], mitte[1], AV_RADIUS_M, ctrl.signal)
      if (ctrl.signal.aborted) return
      this.laedt = false
      this.setze({ mitte, abruf, av: avParsen(abruf.daten) }, VORSCHAU_TEXT)
    } catch (e) {
      if (ctrl.signal.aborted) return
      this.laedt = false
      this.setze(this.stand, `Vermessung nicht geladen: ${(e as Error).message}`)
    }
  }

  /** Werkzeug beendet bzw. Fall geladen: Vorschau weg, laufende Abfrage abbrechen */
  leeren(): void {
    this.ctrl?.abort(); this.ctrl = null; this.ziel = null; this.laedt = false
    if (this.stand || this.hinweis) this.setze(null, null)
  }

  /** Vorschau für den neuen Fall: alle Punkte (Enden des Streifens) innert NACHLADEN_M um ihre Mitte; sonst null (wie bisher laden) */
  fuer(punkte: readonly P[]): Vorschau | null {
    const s = this.stand
    return s && punkte.every(p => dist(p, s.mitte) <= NACHLADEN_M + 1e-9) ? s : null
  }

  private setze(stand: Vorschau | null, hinweis: string | null): void {
    this.stand = stand; this.hinweis = hinweis
    this.melden()
  }
}
