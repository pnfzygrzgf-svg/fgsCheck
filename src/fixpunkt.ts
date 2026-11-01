// ── Fixpunkte für die Vermassung eines Streifens von Hand: Fangen auf die AV, Vorschläge (16.10.2026) ──
//
// Ein geplanter Streifen wird im Plan bzw. beim Abstecken ab einem Fixpunkt vermasst (Gebäudeecke, Eckpunkt eines Randsteins).
// Die App fängt den Klick auf den nächsten Stützpunkt der geladenen AV-Bodenbedeckung; die Masse rechnet
// rechner/vermassung.fixpunktMasse. Fixpunkte beeinflussen die Sichtprüfung nicht (sie gehen nicht in rechneFall ein).
//
// - Fangradius FANG_PX = 12 Bildschirmpunkte, nach dem Zoom in Meter umgerechnet (fangRadiusM): so gross wie die Griffe zum
//   Verschieben (.ecke 12 px) und gut mit Maus bzw. Finger zu treffen, ohne bei Zoom 19 (rund 0,2 m/px in Bern, 12 px rund
//   2,4 m) einen anderen Punkt zu fangen; Gebäudeecken liegen meist mehrere Meter auseinander. Höchstens FANG_MAX_M = 5 m, damit
//   weit herausgezoomt (Zoom 16: 12 px rund 20 m) kein entfernter Punkt gefangen wird; dann eher näher heranzoomen.
// - Gebäudeecke: Stützpunkt einer AV-Fläche «Gebaeude», an dem der Umriss um mindestens ECKE_MIN_GRAD (20°) abknickt; Bögen
//   sind in der AV mit vielen Stützpunkten und kleinen Knicken erfasst (Glockenstrasse: Rundung mit Knicken unter 10°), ihre
//   Punkte gelten als AV-Punkt. Andere Stützpunkte (Trottoir, Strasse, Verkehrsinsel, Gebäude-Bogen …): AV-Punkt.
//   Ohne Stützpunkt im Fangradius: freier Punkt.
// - Vorschlag je Streifen und Strassenseite (Seite des Endes A bzw. B, getrennt durch die Gerade durch die Streifenmitte
//   senkrecht zur Achse A–B) die nächste Gebäudeecke bis VORSCHLAG_M = 30 m vom Umriss: Masse zum Abstecken mit Messband bzw. Laser
//   bleiben kurz; 30 m sind zugleich die Abdeckung der geladenen Daten um den Ladeort (abdeckung.NACHLADEN_M), die AV liegt
//   dort sicher vor; Gebäude an einer innerörtlichen Querung stehen meist 5 bis 20 m vom Streifen (Vorgarten, Knoten).
// AV-Stützpunkte sind keine vermarkten Grenzpunkte: die Bodenbedeckung hat eine Lagegenauigkeit je Qualitätsstufe der AV.

import { type P, dist, sub, dot, abstandStrecke } from './geo'
import type { AvFlaeche } from './daten/av'
import type { FixpunktArt } from './fall'
import type { FixpunktMass } from './rechner/vermassung'
import { f2 } from './texte'

export const FANG_PX = 12
export const FANG_MAX_M = 5
export const ECKE_MIN_GRAD = 20
export const VORSCHLAG_M = 30

/** Fangradius in Metern aus der Länge von FANG_PX Bildschirmpunkten in Metern (beim aktuellen Zoom), höchstens FANG_MAX_M */
export const fangRadiusM = (fangPxInM: number): number => Math.min(FANG_MAX_M, Math.max(0, fangPxInM))

const AV_NAME: Record<string, string> = { Gebaeude: 'Gebäude', Strasse_Weg: 'Strasse/Weg', Trottoir: 'Trottoir', Verkehrsinsel: 'Verkehrsinsel',
  uebrige_befestigte: 'übrige befestigte', uebrige_humusierte: 'übrige humusierte', Gartenanlage: 'Gartenanlage' }
/** Art einer AV-Fläche als Text */
export const avName = (art: string) => AV_NAME[art] ?? art.replace(/_/g, ' ')

/** Bezeichnung eines Fixpunkts (eigene, sonst nach Art) */
export function fixpunktName(f: { art: FixpunktArt; name?: string; avArt?: string }): string {
  if (f.name?.trim()) return f.name
  return f.art === 'gebaeudeecke' ? 'Gebäudeecke (AV)' : f.art === 'av_punkt' ? `AV-Punkt${f.avArt ? ` (${avName(f.avArt)})` : ''}` : 'freier Punkt'
}
export const ART_TEXT: Record<FixpunktArt, string> = { gebaeudeecke: 'Gebäudeecke (AV)', av_punkt: 'Stützpunkt der AV-Bodenbedeckung',
  frei: 'freier Punkt, nicht aus der AV' }

/** Knick des Umrisses am Punkt i eines Rings (Grad, 0 = gerade weiter); der Ring darf geschlossen sein (erster = letzter) */
export function knickGrad(ring: P[], i: number): number {
  const r = ring.length > 1 && dist(ring[0], ring[ring.length - 1]) < 1e-9 ? ring.slice(0, -1) : ring
  const n = r.length
  if (n < 3) return 0
  const k = i % n
  // nächste verschiedene Nachbarn (doppelte Punkte überspringen)
  let a = (k - 1 + n) % n, b = (k + 1) % n
  while (a !== k && dist(r[a], r[k]) < 1e-6) a = (a - 1 + n) % n
  while (b !== k && dist(r[b], r[k]) < 1e-6) b = (b + 1) % n
  const v1 = sub(r[k], r[a]), v2 = sub(r[b], r[k])
  const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1])
  if (!(l1 > 0) || !(l2 > 0)) return 0
  return Math.acos(Math.max(-1, Math.min(1, dot(v1, v2) / (l1 * l2)))) * 180 / Math.PI
}

export interface AvPunkt { p: P; ecke: boolean; avArt: string }

/** Stützpunkte der AV-Flächen nahe bei p (Hüllquader ± radius); ecke: Gebäudeecke (Knick ab ECKE_MIN_GRAD) */
export function avPunkte(av: AvFlaeche[], p: P, radius: number): AvPunkt[] {
  const aus: AvPunkt[] = []
  for (const f of av) for (const ring of f.ringe) {
    const n = ring.length > 1 && dist(ring[0], ring[ring.length - 1]) < 1e-9 ? ring.length - 1 : ring.length
    for (let i = 0; i < n; i++) {
      const q = ring[i]
      if (Math.abs(q[0] - p[0]) > radius || Math.abs(q[1] - p[1]) > radius) continue
      aus.push({ p: q, ecke: f.art === 'Gebaeude' && knickGrad(ring, i) >= ECKE_MIN_GRAD, avArt: f.art })
    }
  }
  return aus
}

/** Klick auf die Karte fangen: nächster AV-Stützpunkt im Radius; am selben Punkt (1 cm) zählt eine Gebäudeecke vor anderen
 * Flächen (ein Gebäudepunkt ist zugleich Punkt der Nachbarfläche). Ohne Treffer: freier Punkt am Klick. */
export function fangen(p: P, av: AvFlaeche[], radiusM: number): { p: P; art: FixpunktArt; avArt?: string } {
  const kand = avPunkte(av, p, radiusM).map(x => ({ ...x, d: dist(x.p, p) })).filter(x => x.d <= radiusM + 1e-9)
  if (!kand.length) return { p: [p[0], p[1]], art: 'frei' }
  const best = kand.reduce((a, b) => (b.d < a.d ? b : a))
  const gleich = kand.filter(x => dist(x.p, best.p) <= 0.01)
  const ecke = gleich.find(x => x.ecke)
  if (ecke) return { p: [ecke.p[0], ecke.p[1]], art: 'gebaeudeecke' }
  const geb = gleich.find(x => x.avArt === 'Gebaeude')
  return { p: [best.p[0], best.p[1]], art: 'av_punkt', avArt: (geb ?? best).avArt }
}

/** Abstand eines Punkts zum Umriss (0 im Umriss nicht unterschieden: Gebäudeecken liegen nie im Streifen) */
export function abstandUmriss(p: P, umriss: P[]): number {
  let d = Infinity
  for (let i = 0; i < umriss.length; i++) d = Math.min(d, abstandStrecke(p, umriss[i], umriss[(i + 1) % umriss.length]))
  return d
}

export interface FixVorschlag { seite: 'A' | 'B'; p: P; abstandM: number }

/**
 * Vorschlag: je Strassenseite (Seite von Ende A bzw. B) die nächste Gebäudeecke der AV bis VORSCHLAG_M vom Umriss des
 * Streifens. Die Seiten trennt die Gerade durch die Streifenmitte senkrecht zur Achse A–B (bei schiefen Streifen nicht die
 * Balkenrichtung): Ende A liegt auf der einen, Ende B auf der anderen Seite.
 */
export function fixpunktVorschlaege(s: { p0: P; p1: P; umriss: P[] }, av: AvFlaeche[]): FixVorschlag[] {
  const m: P = [(s.p0[0] + s.p1[0]) / 2, (s.p0[1] + s.p1[1]) / 2]
  const l = dist(s.p0, s.p1)
  if (!(l > 0)) return []
  const n: P = [(s.p1[0] - s.p0[0]) / l, (s.p1[1] - s.p0[1]) / l]
  const best: Partial<Record<'A' | 'B', FixVorschlag>> = {}
  for (const x of avPunkte(av, m, VORSCHLAG_M + l / 2 + 10)) {
    if (!x.ecke) continue
    const d = abstandUmriss(x.p, s.umriss)
    if (d > VORSCHLAG_M) continue
    const seite = dot(sub(x.p, m), n) < 0 ? 'A' : 'B'
    if (!best[seite] || d < best[seite]!.abstandM - 1e-9) best[seite] = { seite, p: [x.p[0], x.p[1]], abstandM: d }
  }
  return (['A', 'B'] as const).flatMap(k => (best[k] ? [best[k]!] : []))
}

/** Streifen, dem ein Fixpunkt am nächsten liegt (Masslinie auf Karte und Bericht), null ohne Streifen */
export function naechsterStreifen<T extends { umriss: P[] }>(p: P, streifen: T[]): T | null {
  let b: T | null = null, bd = Infinity
  for (const s of streifen) { const d = abstandUmriss(p, s.umriss); if (d < bd) { bd = d; b = s } }
  return b
}

/** Himmelsrichtung als Ziel («nach Norden», «nach Nordosten»; vermassung.himmelsrichtung liefert «Nord», «Nordost» …) */
export const nachRichtung = (r: string) => `nach ${r}en`

/** Masse eines Fixpunkts als Text (Panel, Bericht): längs zur Kante bzw. Achse, zum näheren Ende, Luftlinie zur Ecke */
export function fixMassTexte(m: FixpunktMass): { kante: string; achse: string; ende: string; ecke: string } {
  return {
    kante: m.aufHoehe ? 'auf Höhe des Streifens' : `${f2(m.laengsKanteM)} m bis Kante ${m.kante}`,
    achse: `${f2(m.laengsAchseM)} m`,
    ende: `Ende ${m.ende}: ${f2(m.endeLaengsM)} m ${nachRichtung(m.endeLaengsRichtung)}, ${f2(m.endeQuerM)} m ${nachRichtung(m.endeQuerRichtung)}`,
    ecke: `${m.ecke} ${f2(m.eckeM)} m`,
  }
}
