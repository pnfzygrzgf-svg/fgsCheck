// ── Längsneigung der Fahrlinie vor dem Streifen (Kurvenregel b5, Velosicht): Linie und Schlüssel des Höhenprofils ──
//
// Die Kurvenregel selbst (VSS 40 241 Ziffer 14, Tab. 2, S. 7) rechnet seit 10.11.2026 je Zufahrt im Rechenkern (rechner/kurvenregel.ts,
// Prüfung FGS-01); die App lädt das Höhenprofil entlang der Fahrlinie und gibt die Neigung an die Rechnung zurück.

import type { P } from '../geo'
import type { StreifenErgebnis, ZufahrtErgebnis } from '../rechner/typen'
import { lageAufLinie } from '../rechner/kurvenbogen'
import { abtasten } from '../rechner/kurvenbogen'

/** Länge des Höhenprofils vor dem Streifen [m] */
export const KURVE_PROFIL_M = 50

/** Schlüssel des Höhenprofils einer Zufahrt: «Streifen|Kennung» wie die Eingaben je Zufahrt (fall.zufahrtSchluessel), damit die Rechnung
 *  die Längsneigung je Zufahrt findet (Kurvenregel b5, Prüfung FGS-01) */
export const kurveProfilSchluessel = (z: Pick<ZufahrtErgebnis, 'fgsId' | 'kennung'>): string => `${z.fgsId}|${z.kennung}`
/** Zufahrten, für die die App die Längsneigung der Fahrlinie lädt: mit Strassenkurve (Kurvenregel) bzw. mit Velosicht */
export const zufahrtenMitFahrlinienNeigung = (st: readonly StreifenErgebnis[]): ZufahrtErgebnis[] =>
  st.flatMap(s => s.zufahrten.filter(z => (z.kurveStrasse && z.kurveStrasse.radius !== null) || z.velo))

/** Linie des Höhenprofils: Fahrlinie ab dem Streifenrand KURVE_PROFIL_M zurück (vom Streifen weg) */
export function kurveProfilLinie(z: Pick<ZufahrtErgebnis, 'spur' | 'sichtpunkte'>): P[] {
  const a0 = z.sichtpunkte.length ? lageAufLinie(z.spur, z.sichtpunkte[0]) : 0
  return abtasten(z.spur, a0, a0 + KURVE_PROFIL_M, 5)
}
