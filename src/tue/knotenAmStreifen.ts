// ── Knoten nahe einer Querung (Verknüpfung, Etappe 3): Ziel des Links «Knotensicht prüfen» in den SichtweitenCheck ──
//
// Knoten wie im Kern des SichtweitenCheck (ohne Gabelungen, Kreisel, Fahrbahnteilungen), bis KNOTEN_M von der Achse eines Streifens,
// wie bei der Trottoirüberfahrt. Mehrere Treffer bleiben eine Auswahl; es wird keiner still vorgezogen.

import type { P } from '../geo'
import { abstandStrecke } from '../knotensicht/geo'
import { osmParsen } from '../knotensicht/daten/osm'
import { OsmNetz } from '../knotensicht/rechner/netz'
import { knotenFinden, knotenInfo } from '../knotensicht/rechner/knoten'
import { KNOTEN_M } from './knotensicht'

export interface KnotenNah { id: number; name: string; abstandM: number }

/** Netz aus den rohen OSM-Daten des Falls, null bei unbrauchbaren Daten */
export function netzAusRoh(osmRoh: unknown): OsmNetz | null {
  try { return new OsmNetz(osmParsen(osmRoh as Parameters<typeof osmParsen>[0])) } catch { return null }
}

/** Knoten bis KNOTEN_M von einer der Streifenachsen, der nächste zuerst */
export function knotenAmStreifen(netz: OsmNetz, streifen: readonly { p0: P; p1: P }[]): KnotenNah[] {
  const aus: KnotenNah[] = []
  for (const id of knotenFinden(netz)) {
    const p = netz.P.get(id)
    if (!p) continue
    const d = Math.min(...streifen.map(s => abstandStrecke(p, s.p0, s.p1)))
    if (d > KNOTEN_M + 1e-9) continue
    const info = knotenInfo(netz, id)
    if (info) aus.push({ id, name: info.name, abstandM: d })
  }
  return aus.sort((a, b) => a.abstandM - b.abstandM || a.id - b.id)
}
