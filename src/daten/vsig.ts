// ── Signalisierte Höchstgeschwindigkeit der Stadt Bern (Geoportal) für die Vorbelegung (Automatik Paket C, 21.10.2026) ──
//
// Service «Signalisierte_Hoechstgeschwindigkeit», Layer 0 (Linien auf der Strassenachse, wie VeloroutenCheck bern.ts): V_sig in
// km/h (im Dienst 20, 30, 40, 50, 60, 80 und leer; geprüft 21.10.2026) und Strassenname. Ein Feld für Zone oder Strecke hat der
// Layer nicht. V_afu bzw. V_afu_manuell (Amt für Umwelt) nur für einen Hinweis, wenn es vom V_sig abweicht. Probe Mühlemattstrasse ±150 m: 39 Linien, 15 kB. Nur Daten, keine Regeln.

import { type P, dot, dist, einheit, sub, add } from '../geo'
import { imBereich, type Bereich } from './haltestellen'
import { arcgisUrl, arcgisHolen, linienTeile, textFeld, zahlFeld, featureId, type ArcgisGeoJson } from './geoportal'
import type { Abruf } from './holen'

export interface VsigLinie { id: string; strasse: string; /** km/h, null ohne Angabe */ vSig: number | null; teile: P[][]
  /** Tempo nach dem Amt für Umwelt (V_afu_manuell, sonst V_afu), km/h; nur für den Hinweis «Tempo prüfen» (Korrektur nach Prüfung Runde 5) */
  vAfu?: number | null }
export interface VsigDaten { linien: VsigLinie[] }

export const VSIG_DIENST = 'Signalisierte_Hoechstgeschwindigkeit'

/** Geoportal-Antwort -> Linien; V_sig ausserhalb 5–130 km/h gilt als ohne Angabe */
export function vsigAusGeoportal(gj: ArcgisGeoJson): VsigLinie[] {
  return (gj.features ?? []).flatMap((f, i) => {
    const teile = linienTeile(f), pr = f.properties ?? {}
    if (!teile.length) return []
    const v = zahlFeld(pr.V_sig), ok = (x: number | null) => (x !== null && x >= 5 && x <= 130 ? x : null)
    const afu = ok(zahlFeld(pr.V_afu_manuell)) ?? ok(zahlFeld(pr.V_afu))
    return [{ id: featureId('bernvsig', f, i), strasse: textFeld(pr.Strassenname) ?? '', vSig: ok(v), teile, ...(afu !== null ? { vAfu: afu } : {}) }]
  })
}

export const vsigUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(VSIG_DIENST, lat, lon, radiusM, 'Objectid,V_sig,V_afu,V_afu_manuell,Strassenname', { nachkomma: 2 })

/** Signalisierte Höchstgeschwindigkeit im Rechteck ±radiusM um den Ort */
export async function ladeVsigBern(lat: number, lon: number, radiusM: number, signal?: AbortSignal): Promise<Abruf<VsigDaten>> {
  const r = await arcgisHolen(vsigUrl(lat, lon, radiusM), signal)
  return { ...r, daten: { linien: vsigAusGeoportal(r.daten) } }
}

// ── Tempo der Zufahrten im Sichtrechner (Nutzerentscheid 21.10.2026: in Bern gilt V_sig als Tempo der Zufahrt, OSM nur Rückfall) ──

/** Suchradius um einen Punkt der Spur (m): die Linien liegen auf der Strassenachse, die Spur in der Fahrstreifenmitte */
export const VSIG_SUCH_M = 8
/** höchste Abweichung der Linie von der Fahrtrichtung (°) */
export const VSIG_WINKEL = 35

/**
 * Amtliches Tempo für den Sichtrechner (rechner/tempo.TempoAmtlich): V_sig der nächsten Linie bis VSIG_SUCH_M, die etwa parallel zur
 * Fahrtrichtung liegt (höchstens VSIG_WINKEL); ausserhalb des geladenen Bereichs null (dort OSM). Linien ohne Wert nehmen am Vergleich
 * teil: ist die nächste Linie ohne Wert, gilt null (OSM-Rückfall), nicht der Wert einer weiter entfernten Linie (Korrektur nach Prüfung,
 * z. B. 177/211: Schwarzenburgstrasse ohne Wert neben einem kurzen Knotenstück mit 50 km/h).
 */
export function vsigTempo(d: { linien: readonly VsigLinie[]; bereich?: Bereich | null }): (p: P, richtung: P) => number | null {
  const cos = Math.cos(VSIG_WINKEL * Math.PI / 180)
  const ls = d.linien
  return (p, richtung) => {
    if (d.bereich && !imBereich(p, VSIG_SUCH_M, d.bereich)) return null
    let best: [number, number | null] | null = null
    for (const l of ls) for (const z of l.teile) for (let i = 1; i < z.length; i++) {
      const a = z[i - 1], w = sub(z[i], a), l2 = dot(w, w)
      if (l2 === 0) continue
      const t = Math.max(0, Math.min(1, dot(sub(p, a), w) / l2))
      const dd = dist(p, add(a, w, t))
      if (dd <= VSIG_SUCH_M && Math.abs(dot(einheit(w), richtung)) >= cos - 1e-9 && (best === null || dd < best[0])) best = [dd, l.vSig]
    }
    return best ? best[1] : null
  }
}
