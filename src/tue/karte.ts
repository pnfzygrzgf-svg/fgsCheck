// ── Trottoirüberfahrt auf Karte und Bericht (27.10.2026) ──
//
// Gezeichnet wird die gerechnete Überfahrt zwischen vorderem und hinterem Rand (Knotensicht: karte.kanten), nicht der Streifen von Hand
// mit seiner festen Zeichenbreite; dieser bleibt als dünne Achse. Ohne Knotensicht (Rechnung läuft, keine Einmündung) nur die Achse.

import type { P } from '../geo'
import type { KnotensichtAntwort } from './knotensicht'

/** Fläche der Überfahrt (vorderer Rand hin, hinterer Rand zurück); null ohne gerechnete Knotensicht */
export function tueFlaeche(ks: KnotensichtAntwort | undefined): P[] | null {
  if (!ks || 'fehler' in ks || ks.karte.kanten.length !== 2) return null
  const [v, h] = ks.karte.kanten
  return [v[0], v[1], h[1], h[0]]
}

/** Masse der Überfahrt aus der Knotensicht: Breite (Trottoir quer zur Hauptstrasse) und Länge entlang der Hauptstrasse */
export function tueMasse(ks: KnotensichtAntwort | undefined): { breite: number; laenge: number } | null {
  if (!ks || 'fehler' in ks || !ks.karte.kanten.length) return null
  const [a, b] = ks.karte.kanten[0]
  return { breite: ks.breite, laenge: Math.hypot(b[0] - a[0], b[1] - a[1]) }
}
