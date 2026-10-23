// ── Vorschläge für Hindernisse (E2a): Parkierung aus OSM-Tags, Bäume aus dem Baumkataster; amtliche Parkfelder ──
//
// Aus fgsCheck (rechner/vorschlaege.ts) übernommen und an den Knoten angepasst. Vorschläge zählen erst, wenn der Nutzer sie
// bestätigt (E2_PLAN: OSM-Parkierung und Baumkataster). Parkierung: je Seite eines befahrbaren OSM-Wegs mit
// parking:<seite>=lane|half_on_kerb|street_side (bzw. älterem parking:lane:<seite>) ein Streifen entlang der AV-Bordkante,
// im Umkreis PARK_UMKREIS_M um den Knoten; Annahmen: Breite längs 2,0 m, schräg 4,5 m, quer 5,0 m, half_on_kerb 1,0 m auf der
// Fahrbahn; lane/half_on_kerb auf der Fahrbahn, street_side ausserhalb; nicht näher als KNOTEN_ABSTAND_M an einem Knoten
// (Parkierungsverbot nahe der Verzweigung angenommen). Ob dort wirklich parkiert wird, zeigt nur das Luftbild bzw. der Ort.
// In fgsCheck hielten die Vorschläge zusätzlich 5 m Abstand zum Fussgängerstreifen; das entfällt hier.
// Amtliche Parkfelder (Nutzerentscheid 11.10.2026, fgsCheck) sind keine Vorschläge: sie zählen sofort, einzelne lassen sich
// verwerfen. Sie kommen hier als «Vorschlag» mit Quelle 'kataster' zurück (Anzeige und Verwerfen wie in fgsCheck).

import { type P, add, dist, rechts } from '../geo'
import type { OsmNetz } from './netz'
import type { Fahrbahn } from './flaechen'
import type { Hindernis } from './hindernisse'
import { punkteAufSpur } from './spur'
import type { KatasterBaum } from '../daten/baumkataster'
import type { KatasterFeld } from '../daten/parkkataster'
import { BAUM_STAMM_M } from './hindernisse'
import { abstandPunkt, schnitt, vereinigung, flaeche, ringFlaeche, type Multi } from './poly'

/** OSM-Parkierung: Umkreis um den Knoten (fest, damit die Ids der Vorschläge gleich bleiben) */
export const PARK_UMKREIS_M = 100
const SCHRITT_M = 2
const KNOTEN_ABSTAND_M = 10

export interface Vorschlag { id: string; hindernis: Hindernis; grund: string }

function parkArt(t: Record<string, string>, seite: 'left' | 'right'): [string, number] | null {
  const p = t[`parking:${seite}`] ?? t['parking:both']
  const orient = t[`parking:${seite}:orientation`] ?? t['parking:both:orientation']
  const alt = t[`parking:lane:${seite}`] ?? t['parking:lane:both']
  const breite = (o: string | undefined) => (o === 'diagonal' ? 4.5 : o === 'perpendicular' ? 5.0 : 2.0)
  if (p === 'lane' || p === 'half_on_kerb') return [`parking:${seite}=${p}`, p === 'half_on_kerb' ? 1.0 : breite(orient)]
  if (p === 'street_side') return [`parking:${seite}=street_side`, -breite(orient)]     // negativ: ausserhalb der Fahrbahn
  if (!p && ['parallel', 'diagonal', 'perpendicular', 'marked'].includes(alt ?? '')) return [`parking:lane:${seite}=${alt}`, breite(alt)]
  return null
}

/** Parkierungs-Vorschläge aus OSM-Tags im Umkreis um den Knoten (mitte); Id «osm:<Weg>:<Seite>:<Lauf>» */
export function parkVorschlaege(netz: OsmNetz, fahrbahn: Fahrbahn, mitte: P, umkreis = PARK_UMKREIS_M): Vorschlag[] {
  const out: Vorschlag[] = []
  const knoten: P[] = []
  for (const [nid, an] of netz.an) if (netz.strassenarme(nid).length >= 3 && an.length) knoten.push(netz.p(nid))
  for (const [wid, w] of netz.W) {
    if (!w.mfz || w.ring) continue
    const pts = w.nds.map(n => netz.p(n))
    if (!pts.some(p => dist(p, mitte) <= umkreis + 50)) continue
    for (const seite of ['right', 'left'] as const) {
      const pa = parkArt(w.t, seite)
      if (!pa) continue
      const [tag, b] = pa
      let L = 0
      for (let k = 1; k < pts.length; k++) L += dist(pts[k - 1], pts[k])
      const ab: number[] = []
      for (let s = 1; s < L; s += SCHRITT_M) ab.push(s)
      const laeufe: [P, P][][] = []
      let cur: [P, P][] | null = null, letzter: P | null = null
      for (const [p, t] of punkteAufSpur(pts, ab)) {
        const r = rechts(t)                                  // rechts zur Digitalisierung
        let gut = dist(p, mitte) <= umkreis && !knoten.some(kp => dist(kp, p) < KNOTEN_ABSTAND_M)
        let innen: P | null = null, aussen: P | null = null
        if (gut) {
          const sh = fahrbahn.sehne(p, r)
          if (!sh) gut = false
          else {
            const vz = seite === 'right' ? 1 : -1
            const kante = add(p, r, vz * (seite === 'right' ? sh[0] : sh[1]))
            innen = kante; aussen = add(kante, r, -vz * b)            // b > 0 nach innen (Fahrbahn), b < 0 nach aussen
            if (letzter && dist(letzter, kante) > SCHRITT_M + 1.5) cur = null
            letzter = kante
          }
        }
        if (!gut || !innen || !aussen) { cur = null; letzter = null; continue }
        if (!cur) { cur = []; laeufe.push(cur) }
        cur.push([innen, aussen])
      }
      laeufe.filter(l => l.length >= 3).forEach((l, i) => {
        const ring = [...l.map(x => x[0]), ...l.map(x => x[1]).reverse()]
        out.push({ id: `osm:${wid}:${seite}:${i}`, grund: `aus OSM (Weg ${wid}, ${tag}), Lage und Breite angenommen – prüfen`,
          hindernis: { id: `osm:${wid}:${seite}:${i}`, art: 'parkfeld', klasse: 'auto', ring, quelle: 'osm',
            name: `Parkierung aus OSM (${w.name || 'Weg ' + wid}, ${tag})` } })
      })
    }
  }
  return out
}

/** Baum-Vorschläge aus einem Baumkataster (Stamm bis reichweite vom Knoten) */
export function baumVorschlaege(baeume: KatasterBaum[], mitte: P, reichweite: number, quellenangabe: string): Vorschlag[] {
  return baeume.filter(b => dist(b.p, mitte) <= reichweite).map(b => ({ id: b.id, grund: `${quellenangabe} – Lage ohne Gewähr, prüfen`,
    hindernis: { id: b.id, art: 'baum', p: b.p, stamm: BAUM_STAMM_M, quelle: 'kataster', name: b.name } }))
}

/** Amtliche Parkfelder in Reichweite (Feldfläche bis reichweite vom Knoten) */
export function parkKatasterFelder(felder: KatasterFeld[], mitte: P, reichweite: number, quellenangabe: string): Vorschlag[] {
  return felder.filter(f => f.ring.length >= 3 && abstandPunkt([[f.ring]], mitte) <= reichweite)
    .map(f => ({ id: f.id, grund: `${quellenangabe} – zählt als Hindernis, verwerfen, wenn nicht mehr vorhanden`,
      hindernis: { id: f.id, art: 'parkfeld', klasse: f.klasse, ring: f.ring, quelle: 'kataster', name: f.name } }))
}

/**
 * OSM-Parkierungsvorschläge, die amtliche Parkfelder schon abdecken (fgsCheck). Regel: unterdrückt, wenn amtliche Felder
 * mindestens OSM_UEBERDECKT_ANTEIL der Vorschlagsfläche bedecken. Ein OSM-Vorschlag ist ein angenommener Streifen (2 m breit)
 * über die ganze Länge der Strasse im Umkreis; die amtlichen Felder derselben Parkierung liegen mit Lücken (Einfahrten,
 * Parkverbote) und anderer Tiefe darin, decken also selten alles, aber deutlich mehr als ein Drittel. Liegt der Vorschlag auf
 * der anderen Seite oder anderswo, ist die Überdeckung nahe null. Massgebend sind alle geladenen amtlichen Felder, auch
 * verworfene: der Datensatz beschreibt die öffentliche Parkierung vollständig, ein verworfenes Feld soll nicht als
 * OSM-Vorschlag zurückkommen.
 */
export const OSM_UEBERDECKT_ANTEIL = 0.3

/** Anteil der Fläche von ring, den die amtlichen Felder bedecken (0…1; Kandidaten über eine Hülle mit 30 m Rand) */
export function anteilAmtlich(ring: P[], amtlich: P[][]): number {
  const a = Math.abs(ringFlaeche(ring))
  if (a <= 0 || !amtlich.length) return 0
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const kand = amtlich.filter(f => f.length >= 3 && f.some(p => p[0] >= x0 - 30 && p[0] <= x1 + 30 && p[1] >= y0 - 30 && p[1] <= y1 + 30))
  if (!kand.length) return 0
  try {
    const u: Multi = vereinigung(...kand.map(f => [[f]] as Multi))
    return flaeche(schnitt([[ring]], u)) / a
  } catch { return 0 }
}

export function osmUeberdeckt(osm: Vorschlag[], amtlich: P[][]): Set<string> {
  const weg = new Set<string>()
  if (!amtlich.length) return weg
  for (const v of osm)
    if (v.hindernis.art === 'parkfeld' && anteilAmtlich(v.hindernis.ring, amtlich) >= OSM_UEBERDECKT_ANTEIL) weg.add(v.id)
  return weg
}

/** Liegt der Ring (bzw. ein Teil davon) in einem der Dreiecke (Polygone)? */
export function imSichtfeld(ring: P[], dreiecke: P[][]): boolean {
  if (ring.length < 3) return false
  for (const d of dreiecke) {
    if (d.length < 3) continue
    try { if (flaeche(schnitt([[ring]], [[d]])) > 1e-6) return true } catch { /* ungültige Geometrie: nicht im Sichtfeld */ }
  }
  return false
}
