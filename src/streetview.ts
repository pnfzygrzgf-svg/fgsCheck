// ── Google Street View als Link (Nutzerwunsch 23.10.2026, Vorbild VeloroutenCheck) ──
//
// Nur ein Link auf Google Maps (Maps URLs, map_action=pano: Google sucht das nächste Panorama), keine Einbettung, kein API-Schlüssel.
// Die Koordinaten gehen erst beim Klick an Google. Je Zufahrt der Blick der Fahrenden: vom fernsten Sichtpunkt (Soll-Distanz) zur
// Streifenmitte; allgemein an der Streifenmitte entlang der Streifenachse.

import { wgs, type P } from './geo'
import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'

/** Link auf Google Street View: Standpunkt (WGS84, 6 Nachkommastellen) und Blickrichtung (Grad ab Norden im Uhrzeigersinn, 0–359) */
export function streetViewUrl(lat: number, lon: number, heading?: number | null): string {
  const h = heading == null || !Number.isFinite(heading) ? '' : `&heading=${((Math.round(heading) % 360) + 360) % 360}`
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}${h}`
}

/** Peilung von a nach b in LV95 [Grad ab Norden im Uhrzeigersinn]; die Meridiankonvergenz (unter 2°) ist vernachlässigt */
export function peilung(a: P, b: P): number {
  const g = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI
  return (g + 360) % 360
}

const url = (p: P, heading?: number | null) => { const [lat, lon] = wgs(p[0], p[1]); return streetViewUrl(lat, lon, heading) }

/** Street View je Zufahrt: vom Sichtpunkt in Soll-Distanz (fernster Sichtpunkt) mit Blick auf die Streifenmitte; null ohne Sichtpunkt */
export function zufahrtStreetView(z: Pick<ZufahrtErgebnis, 'sichtpunkte'>, s: Pick<StreifenErgebnis, 'm'>): string | null {
  if (!z.sichtpunkte.length) return null
  const fern = z.sichtpunkte.reduce((a, b) => (Math.hypot(b[0] - s.m[0], b[1] - s.m[1]) > Math.hypot(a[0] - s.m[0], a[1] - s.m[1]) ? b : a))
  return url(fern, peilung(fern, s.m))
}

/** Street View an der Streifenmitte, Blick entlang der Streifenachse (quer zur Strasse) */
export const streifenStreetView = (s: Pick<StreifenErgebnis, 'm' | 'p0' | 'p1'>): string => url(s.m, peilung(s.p0, s.p1))

/** Tooltip des Links je Zufahrt */
export const zufahrtStreetViewTitel = (nr: string): string =>
  `Google Street View: Blick der Fahrenden aus Zufahrt ${nr} auf die Wartefläche – Hecken, Mauern, Parkierung prüfen (öffnet Google Maps)`
