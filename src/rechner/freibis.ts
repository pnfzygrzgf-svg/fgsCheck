// ── Frei bis: freie Länge entlang der Sichtpunkte bis zum ersten Konflikt (gerade und abbiegende Zufahrten) ──

import { dist, type P } from '../geo'
import type { Multi } from './poly'
import type { Konflikt } from './typen'

/** Schlüssel eines Konflikts (gleiches Objekt in zwei Läufen der Konfliktsuche) */
const konfliktKey = (k: Konflikt) => `${k.klasse}|${k.id ?? ''}|${k.layer}|${k.abstand.toFixed(3)}`
/**
 * Frei bis (Automatik Paket B, 21.10.2026): zusätzliches Ausgabefeld, ändert weder Status noch Soll. Ohne Konflikt die geprüfte
 * Länge sw; sonst die Länge entlang der Sichtpunkte bis zum letzten Sichtpunkt, dessen Sichtfeld (Sichtpunkte 0 bis k) noch keinen
 * der gemeldeten Konflikte trifft (Suche halbierend, das Sichtfeld wächst mit k). Abgerundet auf ganze Meter. Seit 29.10.2026 auch für
 * abbiegende Zufahrten (abbiegen.ts)
 */
export function freiBis(sp: P[], konflikte: Konflikt[], sf: (p: P[]) => Multi, kf: (f: Multi, p: P[]) => Konflikt[], sw: number): number {
  if (!konflikte.length || sp.length < 2) return Math.floor(sw + 1e-6)
  const ziel = new Set(konflikte.map(konfliktKey))
  const trifft = (n: number) => { const pre = sp.slice(0, n); return kf(sf(pre), pre).some(k => ziel.has(konfliktKey(k))) }
  if (trifft(1)) return 0
  let lo = 1, hi = sp.length                      // lo: frei, hi: trifft (das ganze Sichtfeld enthält die Konflikte)
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (trifft(mid)) hi = mid; else lo = mid }
  let l = 0
  for (let i = 1; i < lo; i++) l += dist(sp[i - 1], sp[i])
  return Math.floor(l + 1e-6)
}

