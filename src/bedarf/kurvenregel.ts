// ── Kurvenregel (VSS 40 241 Z. 14, S. 7; Nutzerentscheid 29.10.2026): Vorbelegung der fünf Voraussetzungen aus dem Sichtrechner ──
//
// Die Zufahrt mit der Kurve ist die mit dem kleinsten Radius (wie die Vorbelegung «Kurvenradius», automatik.ts A7). Aus ihrer Fahrlinie
// (spur, beginnt am Streifen, gegen die Fahrtrichtung): Abstand vom Kurvenende bis zum Streifenrand und Richtungsänderung über die
// Kurve; das Längsgefälle aus einem Höhenprofil entlang der Fahrlinie (App lädt es, Schlüssel kurveProfilSchluessel).

import { type P, add, dist, einheit, sub } from '../geo'
import type { StreifenErgebnis, ZufahrtErgebnis } from '../rechner/typen'

/** Kurve beginnt (vom Streifen aus gesehen), wo die Fahrlinie mehr als so viel von ihrer Richtung am Streifen abweicht */
export const KURVE_ABWEICHUNG_GRAD = 5
/** Kurvenende bis so weit vor dem Streifen: «unmittelbar danach»; über KURVE_WEIT_M: nein; dazwischen offen */
export const KURVE_NAH_M = 10, KURVE_WEIT_M = 30
/** Richtungsänderung der Kurve mindestens (VSS 40 241 Z. 14) */
export const KURVE_WINKEL_MIN = 60
/** Längsgefälle höchstens [%] */
export const KURVE_GEFAELLE_MAX = 5
/** Länge des Höhenprofils vor dem Streifen [m] */
export const KURVE_PROFIL_M = 50

/** Zufahrt mit der Kurve: kleinster Radius über die Zufahrten mit Sicht (ohne Trottoirüberfahrt); null ohne Radius */
export function kurveZufahrt(st: readonly StreifenErgebnis[]): ZufahrtErgebnis | null {
  const zs = st.filter(s => !s.trottoirueberfahrt).flatMap(s => s.zufahrten).filter(z => z.kurvenradiusM !== null && z.kurvenradiusM > 0)
  return zs.length ? zs.reduce((a, b) => (b.kurvenradiusM! < a.kurvenradiusM! ? b : a)) : null
}
/** Schlüssel des Höhenprofils einer Zufahrt */
export const kurveProfilSchluessel = (z: Pick<ZufahrtErgebnis, 'fgsId' | 'zufahrt'>): string => `${z.fgsId}|${z.zufahrt}`

/** Lage des Punkts p auf der Linie als Abstand ab ihrem Anfang (nächster Punkt) */
function lageAuf(linie: P[], p: P): number {
  let best = Infinity, a = 0, s = 0
  for (let i = 1; i < linie.length; i++) {
    const u = sub(linie[i], linie[i - 1]), l = Math.hypot(u[0], u[1])
    if (l <= 0) continue
    const t = Math.max(0, Math.min(1, ((p[0] - linie[i - 1][0]) * u[0] + (p[1] - linie[i - 1][1]) * u[1]) / (l * l)))
    const d = dist(p, add(linie[i - 1], u, t))
    if (d < best) { best = d; a = s + t * l }
    s += l
  }
  return a
}
/** Punkt der Linie beim Abstand x ab ihrem Anfang (am Ende festgehalten) */
function punktBei(linie: P[], x: number): P {
  let s = 0
  for (let i = 1; i < linie.length; i++) {
    const l = dist(linie[i - 1], linie[i])
    if (l > 0 && x <= s + l) return add(linie[i - 1], sub(linie[i], linie[i - 1]), (x - s) / l)
    s += l
  }
  return linie[linie.length - 1]
}
const laenge = (linie: P[]) => linie.slice(1).reduce((s, q, i) => s + dist(linie[i], q), 0)
/** Punkte der Linie ab Abstand von, alle schritt Meter, höchstens bis bis (bzw. bis zum Ende) */
function abtasten(linie: P[], von: number, bis: number, schritt: number): P[] {
  const ende = Math.min(bis, laenge(linie)), aus: P[] = []
  for (let x = von; x <= ende + 1e-9; x += schritt) aus.push(punktBei(linie, x))
  return aus
}

/** Geometrie der Kurve aus der Fahrlinie (je Meter ab dem Streifenrand): Abstand vom Kurvenende bis zum Streifenrand (erste Abweichung
 * über KURVE_ABWEICHUNG_GRAD von der Richtung am Streifen; null: keine) und grösste Richtungsänderung gegenüber dieser Richtung [°] */
export function kurveGeometrie(z: Pick<ZufahrtErgebnis, 'spur' | 'sichtpunkte'>): { endeM: number | null; winkel: number } | null {
  const sp = z.spur
  if (sp.length < 2) return null
  const a0 = z.sichtpunkte.length ? lageAuf(sp, z.sichtpunkte[0]) : 0
  const pts = abtasten(sp, a0, Infinity, 1)
  if (pts.length < 3) return null
  const richtung = (i: number) => { const u = einheit(sub(pts[i + 1], pts[i])); return Math.atan2(u[1], u[0]) * 180 / Math.PI }
  let ende: number | null = null, winkel = 0, acc = 0
  for (let i = 1; i < pts.length - 1; i++) {
    let d = richtung(i) - richtung(i - 1)
    while (d > 180) d -= 360
    while (d < -180) d += 360
    acc += d
    if (Math.abs(acc) > winkel) winkel = Math.abs(acc)
    if (ende === null && Math.abs(acc) > KURVE_ABWEICHUNG_GRAD) ende = i
  }
  return { endeM: ende, winkel: Math.round(winkel) }
}

/** Linie des Höhenprofils: Fahrlinie ab dem Streifenrand KURVE_PROFIL_M zurück (vom Streifen weg) */
export function kurveProfilLinie(z: Pick<ZufahrtErgebnis, 'spur' | 'sichtpunkte'>): P[] {
  const a0 = z.sichtpunkte.length ? lageAuf(z.spur, z.sichtpunkte[0]) : 0
  return abtasten(z.spur, a0, a0 + KURVE_PROFIL_M, 5)
}
