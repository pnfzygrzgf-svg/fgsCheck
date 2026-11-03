// ── Signalisierte Höchstgeschwindigkeit der Stadt Bern (Geoportal) für die Vorbelegung ──
//
// Service «Signalisierte_Hoechstgeschwindigkeit», Layer 0 (Linien auf der Strassenachse, wie VeloroutenCheck bern.ts): V_sig in
// km/h (im Dienst 20, 30, 40, 50, 60, 80 und leer; geprüft 21.10.2026) und Strassenname. Ein Feld für Zone oder Strecke hat der
// Layer nicht. V_afu bzw. V_afu_manuell (Amt für Umwelt) nur für einen Hinweis, wenn es vom V_sig abweicht. Probe Mühlemattstrasse ±150 m: 39 Linien, 15 kB. Nur Daten, keine Regeln.

import { type P, dot, dist, einheit, sub, add } from '../geo'
import { imBereich } from './haltestellen'
import type { ArcgisGeoJson } from './geoportal'
import { ANBIETER } from './anbieter'
import { BERN_TEMPO_DIENST } from './anbieter/bernTempo'
import type { TempoLinie as VsigLinie } from './anbieter/typen'
import { regionalTempo, regionalTempoTreffer } from './anbieter/gemeinsam/regionalZuordnung'
import type { RegionalSnapshot } from './anbieter/gemeinsam/regional'
import type { ZuerichSnapshot } from './anbieter/gemeinsam/zuerich'
import { zuerichBei, type ZhStrasse } from './anbieter/gemeinsam/zuerichZuordnung'
import type { TempoAmtlich } from '../rechner/tempo'
export interface VsigEingang { linien: readonly VsigLinie[]; bereich?: { mitte: P; radiusM: number; form?: string } | null; signalEntscheide?: import('./anbieter/gemeinsam/regionalSignale').SignalEntscheid[]; regional?: RegionalSnapshot; zuerich?: ZuerichSnapshot; zhStrassen?: ZhStrasse[] }

export type { TempoLinie as VsigLinie, TempoDaten as VsigDaten } from './anbieter/typen'

// Bestehende Schnittstelle für Vorbelegung und Rechner; Abruf und Umwandlung laufen seit E0 über das Anbieter-Register.
const anbieter = ANBIETER['bern.vsig']
export const VSIG_DIENST = BERN_TEMPO_DIENST
export const vsigAusGeoportal = (gj: ArcgisGeoJson): VsigLinie[] => anbieter.umwandeln(gj).linien
export const vsigUrl = anbieter.url
export const ladeVsigBern = anbieter.laden

// ── Tempo der Zufahrten im Sichtrechner (in Bern gilt V_sig als Tempo der Zufahrt, OSM nur Rückfall) ──

/** Suchradius um einen Punkt der Spur (m): die Linien liegen auf der Strassenachse, die Spur in der Fahrstreifenmitte */
export const VSIG_SUCH_M = 8
/** höchste Abweichung der Linie von der Fahrtrichtung (°) */
export const VSIG_WINKEL = 35

/**
 * Amtliches Tempo für den Sichtrechner (rechner/tempo.TempoAmtlich): V_sig der nächsten Linie bis VSIG_SUCH_M, die etwa parallel zur
 * Fahrtrichtung liegt (höchstens VSIG_WINKEL); ausserhalb des geladenen Bereichs null (dort OSM). Linien ohne Wert nehmen am Vergleich
 * teil: ist die nächste Linie ohne Wert, gilt null (OSM-Rückfall), nicht der Wert einer weiter entfernten Linie (
 * z. B. 177/211: Schwarzenburgstrasse ohne Wert neben einem kurzen Knotenstück mit 50 km/h). */
export function vsigTempo(d: VsigEingang): TempoAmtlich {
  if (d.regional) return Object.assign((p: P, r: P) => regionalTempo(d.regional!, p, r, d.zhStrassen ?? []), { quelle: 'amtliche regionale Quelle', quelleBei: (p:P,r:P) => regionalTempoTreffer(d.regional!,p,r,d.zhStrassen ?? [])?.quelle ?? null })
  if (d.zuerich) return Object.assign((p: P, r: P) => zuerichBei(d.zuerich!, p, r, d.zhStrassen ?? []).tempo, { quelle: 'Stadt Zürich' })
  const cos = Math.cos(VSIG_WINKEL * Math.PI / 180)
  const ls = d.linien
  return (p, richtung) => {
    if (d.bereich && !imBereich(p, VSIG_SUCH_M, { ...d.bereich, form: d.bereich.form === 'kreis' ? 'kreis' : 'quadrat' })) return null
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
