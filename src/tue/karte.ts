// ── Trottoirüberfahrt auf Karte und Bericht (27.10.2026) ──
//
// Gezeichnet wird die gerechnete Überfahrt zwischen vorderem und hinterem Rand (Knotensicht: karte.kanten), nicht der Streifen von Hand
// mit seiner festen Zeichenbreite; dieser bleibt als dünne Achse. Ohne Knotensicht (Rechnung läuft, keine Einmündung) nur die Achse.

import type { P } from '../geo'
import type { KnotensichtAntwort } from './knotensicht'

/** Knotensicht, die eine Überfahrt zeichnen darf: gerechnet und über eine Einmündung (nicht über die durchgehende Strasse; 27.10.2026) */
export const tueGezeichnet = (ks: KnotensichtAntwort | undefined): ks is Exclude<KnotensichtAntwort, { fehler: string }> =>
  !!ks && !('fehler' in ks) && !ks.durchgehend

/** Fläche der Überfahrt (vorderer Rand hin, hinterer Rand zurück); null ohne gerechnete Knotensicht bzw. über die durchgehende Strasse */
export function tueFlaeche(ks: KnotensichtAntwort | undefined): P[] | null {
  if (!tueGezeichnet(ks) || ks.karte.kanten.length !== 2) return null
  const [v, h] = ks.karte.kanten
  return [v[0], v[1], h[1], h[0]]
}

/** Masse der Überfahrt aus der Knotensicht: Breite (Trottoir quer zur Hauptstrasse) und Länge entlang der Hauptstrasse */
export function tueMasse(ks: KnotensichtAntwort | undefined): { breite: number; laenge: number } | null {
  if (!tueGezeichnet(ks) || !ks.karte.kanten.length) return null
  const [a, b] = ks.karte.kanten[0]
  return { breite: ks.breite, laenge: Math.hypot(b[0] - a[0], b[1] - a[1]) }
}

// ── Sicht je Phase zeigen (27.10.2026): Klick auf ein wartendes Fahrzeug bzw. Wahl im Block Knotensicht; nur Sitzung ──

/** gezeigte Phase der Knotensicht: beide, nur Sicht auf die Fahrbahn (Auto, Velo) bzw. nur aufs Trottoir */
export type KsPhase = 'beide' | 'fahrbahn' | 'trottoir'

/** nach einem Klick auf das wartende Fahrzeug einer Phase: diese Phase; nochmals dieselbe: wieder beide */
export const ksPhaseNach = (jetzt: KsPhase, geklickt: Exclude<KsPhase, 'beide'>): KsPhase => (jetzt === geklickt ? 'beide' : geklickt)

/** Sichtdreieck zeigen? (Fahrbahn: Auto und Velo; Trottoir: Trottoir) */
export const ksDreieckSichtbar = (art: 'auto' | 'velo' | 'trottoir', phase: KsPhase): boolean =>
  phase === 'beide' || (phase === 'trottoir') === (art === 'trottoir')

/**
 * Fahrzeug der Knotensicht in der gezeigten Phase: «normal», «hervor» (gewähltes wartendes Fahrzeug), «blass» (wartendes Fahrzeug der
 * anderen Phase, bleibt anklickbar zum Wechseln) bzw. «aus» (Fahrzeuge am Ende der Sichtweite gehören zur Sicht auf die Fahrbahn)
 */
export function ksFahrzeugStand(f: { rolle: string; phase?: 'fahrbahn' | 'trottoir' }, phase: KsPhase): 'normal' | 'hervor' | 'blass' | 'aus' {
  if (phase === 'beide') return 'normal'
  if (f.rolle === 'fb') return f.phase === phase ? 'hervor' : 'blass'
  return phase === 'fahrbahn' ? 'normal' : 'aus'
}
