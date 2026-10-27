// ── Fahrzeuge und wartende Personen auf der Karte (27.10.2026, wie der SichtweitenCheck) ──
//
// Nur Darstellung, ohne Wirkung auf die Rechnung. Die Umrisse kommen aus dem Kern des SichtweitenCheck (knotensicht/rechner/fahrzeug.ts,
// unverändert): Personenwagen 4,5 × 1,8 m, Lenker 2,0 m hinter der Front.
// - Trottoirüberfahrt: die Fahrzeuge der Knotensicht (F_B wartend je Phase, F_A am Ende der Sichtweite A je Richtung; tue/knotensicht.ts).
// - Fussgängerstreifen: je gerade Zufahrt ein Fahrzeug mit dem Auge auf dem letzten Sichtpunkt, entlang der Fahrlinie zum Streifen hin;
//   je Streifenende eine wartende Person 0,6 m hinter der Bordkante (wie die Rechnung den Wartebereich prüft, rechner/streifen.ts).

import { add, dist, einheit, sub, type P } from './geo'
import { autoScheibe, autoUmriss, fbLage } from './knotensicht/rechner/fahrzeug'
import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'
import { tueGezeichnet } from './tue/karte'

/** Farben (27.10.2026): wartendes Fahrzeug mit Sicht auf die Fahrbahn grau, mit Sicht aufs Trottoir ocker, Fahrzeug am Ende der
 * Sichtweite bzw. das herannahende am Fussgängerstreifen blau (hebt sich von den grünen und roten Sichtfeldern und vom gelben Streifen
 * ab); blass: nicht gewählte Zufahrt */
export const FARBE_WARTEND = '#4b5563'
export const FARBE_WARTEND_TROTTOIR = '#b45309'
export const FARBE_HERAN = '#2563eb'
export const FARBE_HERAN_BLASS = '#93c5fd'
/** Füllfarbe eines Fahrzeugs nach seiner Rolle; Person: Trottoirfarbe (Karte) */
export function fahrzeugFarbe(f: Pick<FahrzeugForm, 'rolle' | 'phase'>, blass = false): string {
  if (f.rolle === 'fb') return f.phase === 'trottoir' ? FARBE_WARTEND_TROTTOIR : FARBE_WARTEND
  return blass ? FARBE_HERAN_BLASS : FARBE_HERAN
}

/** Abstand der wartenden Person hinter der Bordkante [m] (wie rechner/streifen.inselProbe) */
export const WARTE_HINTER_RAND_M = 0.6

export interface FahrzeugForm {
  art: 'auto' | 'velo' | 'person'
  /** fb/fa: Knotensicht; zufahrt: Fahrzeug einer Zufahrt des Fussgängerstreifens; warte: wartende Person */
  rolle: 'fb' | 'fa' | 'zufahrt' | 'warte'
  mitte: P
  richtung: P
  text: string
  /** Auto: Umriss und Windschutzscheibe (LV95) */
  umriss?: P[]
  scheibe?: P[]
  /** Fahrzeug einer Zufahrt: Schlüssel «fgsId|zufahrt» (Karte: gewählte Zufahrt kräftig) */
  zufahrt?: string
  /** Auge (Lenker) bzw. Standort der Person */
  auge?: P
  /** wartendes Fahrzeug der Knotensicht: Phase (Sicht auf die Fahrbahn bzw. aufs Trottoir) und ob das Auge von Hand gesetzt ist */
  phase?: 'fahrbahn' | 'trottoir'
  vonHand?: boolean
  /** auf der Karte ziehbar (Auge von Hand; Phase Trottoir erst, wenn der Kern es kennt) */
  ziehbar?: boolean
}

const auto = (f: Omit<FahrzeugForm, 'umriss' | 'scheibe'>): FahrzeugForm =>
  ({ ...f, ...(f.art === 'auto' ? { umriss: autoUmriss(f.mitte, f.richtung), scheibe: autoScheibe(f.mitte, f.richtung) } : {}) })

/** Fahrzeuge der Knotensicht einer Trottoirüberfahrt (leer ohne gerechnete Knotensicht bzw. bei anderem Streifen) */
export function tueFahrzeuge(s: StreifenErgebnis): FahrzeugForm[] {
  const ks = s.knotensicht
  // ohne Einmündung bzw. über die durchgehende Strasse keine Fahrzeuge (sie stünden mitten auf der Hauptstrasse; 27.10.2026)
  if (!s.trottoirueberfahrt || !tueGezeichnet(ks) || (ks.streifenId && ks.streifenId !== s.fgsId)) return []
  return (ks.karte.fahrzeuge ?? []).map(f => auto({ art: f.art, rolle: f.rolle, mitte: f.mitte, richtung: f.richtung, text: f.text,
    ...(f.phase ? { phase: f.phase } : {}), ...(f.auge ? { auge: f.auge } : {}), ...(f.vonHand ? { vonHand: true } : {}),
    ...(f.ziehbar ? { ziehbar: true } : {}) }))
}

/** Fahrtrichtung zum Streifen beim Punkt p: Fahrlinie (spur beginnt am Streifen) vom nächsten Stützpunkt zum vorherigen */
function richtungZumStreifen(z: ZufahrtErgebnis, p: P): P | null {
  const sp = z.spur
  if (sp.length < 2) return null
  let i = 0, d = Infinity
  sp.forEach((q, k) => { const x = dist(q, p); if (x < d) { d = x; i = k } })
  const [a, b] = i > 0 ? [sp[i], sp[i - 1]] : [sp[1], sp[0]]
  const u = einheit(sub(b, a))
  return u[0] || u[1] ? u : null
}

/** gerade Zufahrt mit Sichtpunkten (abbiegende und von Hand gestrichene nicht; gestrichene stehen unter entfallen) */
export const geradeZufahrt = (z: ZufahrtErgebnis): boolean => z.art !== 'abbiegend' && z.sichtpunkte.length > 0

/** Fahrzeuge (je gerade Zufahrt) und wartende Personen (je Streifenende) eines Fussgängerstreifens; leer bei Trottoirüberfahrt */
export function fgsFahrzeuge(s: StreifenErgebnis): FahrzeugForm[] {
  if (s.trottoirueberfahrt) return []
  const aus: FahrzeugForm[] = []
  for (const z of s.zufahrten) {
    if (!geradeZufahrt(z)) continue
    const auge = z.sichtpunkte[z.sichtpunkte.length - 1]
    const u = richtungZumStreifen(z, auge)
    if (!u) continue
    const [mitte, richtung] = fbLage(auge, add(auge, u))
    aus.push(auto({ art: 'auto', rolle: 'zufahrt', mitte, richtung, auge, zufahrt: `${z.fgsId}|${z.zufahrt}`,
      text: `Fahrzeug am Sichtpunkt, ${z.sichtweite.toFixed(1).replace('.', ',')} m vor dem Streifen` }))
  }
  // Wartebereich je Ende wie gerechnet (Bordkante, Richtung vom Streifen weg); ohne: Bordkante, von der Streifenmitte weg
  for (const [r, a] of s.warte ?? s.rand.map(r => [r, einheit(sub(r, s.m))] as [P, P])) {
    const aussen = einheit(a)
    if (!aussen[0] && !aussen[1]) continue
    const p = add(r, aussen, WARTE_HINTER_RAND_M)
    aus.push({ art: 'person', rolle: 'warte', mitte: p, auge: p, richtung: [-aussen[0], -aussen[1]], text: 'Wartende Person' })
  }
  return aus
}
