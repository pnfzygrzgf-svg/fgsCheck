// ── Vorschläge für Hindernisse (E2): Parkierung aus OSM-Tags, Bäume aus einem Baumkataster; amtliche Parkfelder ──
//
// Vorschläge zählen erst, wenn der Nutzer sie bestätigt (Nutzerentscheid 10.10.2026: «aus OSM, prüfen»). Parkierung: je Seite
// eines befahrbaren OSM-Wegs mit parking:<seite>=lane|half_on_kerb|street_side (bzw. älterem parking:lane:<seite>) ein Streifen
// entlang der AV-Bordkante, im Umkreis PARK_UMKREIS_M um den Streifen; Annahmen: Breite längs 2,0 m, schräg 4,5 m, quer 5,0 m;
// lane/half_on_kerb auf der Fahrbahn, street_side ausserhalb; nicht näher als 5 m am Streifen (VRV Art. 18 Abs. 2e) und nicht in
// Knoten (± 10 m). Ob dort wirklich parkiert wird, zeigt nur das Luftbild bzw. der Ort.
// Amtliche Parkfelder (Nutzerentscheid 11.10.2026) sind keine Vorschläge: sie zählen sofort, einzelne lassen sich verwerfen.
// Sie kommen hier als «Vorschlag» mit Quelle 'kataster' zurück (Anzeige und Verwerfen wie die Bäume aus dem Baumkataster).

import { type P, add, dist, rechts } from '../geo'
import type { OsmNetz } from './netz'
import type { Fahrbahn } from './flaechen'
import type { Hindernis } from './hindernisse'
import { punkteAufSpur, abstandRing } from './spur'
import type { KatasterBaum } from '../daten/baumkataster'
import type { KatasterFeld } from '../daten/parkkataster'
import { BAUM_STAMM_M, laengsPolygon } from './hindernisse'
import { abstandPunkt, abstandMulti, schnitt, vereinigung, flaeche, ringFlaeche, type Multi } from './poly'

export const PARK_UMKREIS_M = 60
const SCHRITT_M = 2
const STREIFEN_ABSTAND_M = 5
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

/** Parkierungs-Vorschläge aus OSM-Tags um die Streifen (umrisse) */
export function parkVorschlaege(netz: OsmNetz, fahrbahn: Fahrbahn, umrisse: P[][], mitte: P): Vorschlag[] {
  const out: Vorschlag[] = []
  const knoten: P[] = []
  for (const [nid, an] of netz.an) if (netz.strassenarme(nid).length >= 3 && an.length) knoten.push(netz.p(nid))
  for (const [wid, w] of netz.W) {
    if (!w.mfz || w.ring) continue
    const pts = w.nds.map(n => netz.p(n))
    if (!pts.some(p => dist(p, mitte) <= PARK_UMKREIS_M + 50)) continue
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
        let gut = dist(p, mitte) <= PARK_UMKREIS_M && !knoten.some(kp => dist(kp, p) < KNOTEN_ABSTAND_M)
        let innen: P | null = null, aussen: P | null = null
        if (gut) {
          const sh = fahrbahn.sehne(p, r)
          if (!sh) gut = false
          else {
            const vz = seite === 'right' ? 1 : -1
            const kante = add(p, r, vz * (seite === 'right' ? sh[0] : sh[1]))
            innen = kante; aussen = add(kante, r, -vz * b)            // b > 0 nach innen (Fahrbahn), b < 0 nach aussen
            if (umrisse.some(u => abstandRing(kante, u) < STREIFEN_ABSTAND_M || abstandRing(aussen!, u) < STREIFEN_ABSTAND_M)) gut = false
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

/**
 * Reichweite der Rechnung für amtliche Parkfelder und Bäume aus dem Baumkataster, gemessen als kürzester Abstand der
 * Feldfläche (Kanten, bei Bäumen der Stamm-Mittelpunkt) zum Umriss der Streifen. Herleitung:
 * - Gerade Zufahrten: die Sichtpunkte liegen auf der Spur höchstens eine Sichtweite vom Streifen, die grösste Sichtweite ist
 *   75 m (VSS 40 241 Tab. 1 ab 60 km/h; Spur bis 75 + h + 5 m gebildet). Das Sichtfeld liegt zwischen Streifen bzw.
 *   Annäherungsbereichen und den Sichtpunkten; der 1,5-m-Abstand und die Trottoirnase suchen wenige Meter um die Sichtpunkte.
 * - Abbiegende: der Knoten liegt innerhalb der Sichtweite (sonst entfällt die Richtung), also höchstens 75 m vom Streifen;
 *   gemessen wird am Arm bis ARM_MESSUNG = 30 m hinter dem Knoten (Fahrbahn, Parkabzug) -> höchstens 105 m.
 * - Seitlicher Versatz: die Prüfpunkte des Parkabzugs liegen quer zur Spur bis an die Bordkante (PARK_SONDE_M innerhalb), bei
 *   breiten Fahrbahnen rund 5–10 m neben der Achse, auf der die 105 m gemessen sind.
 * - Reserve für Kurven und Messunschärfe: 120 m.
 * Geladen wird ±150 m um den Ort (App: PARK_RADIUS_M bzw. KATASTER_RADIUS_M), das deckt 120 m um den Umriss auch bei langen
 * bzw. versetzten Streifen.
 * Bäume nehmen seit 11.10.2026 dieselbe Reichweite (vorher 100 m um die Streifenmitte); ein Baum zählt nur im Sichtfeld,
 * weiter entfernte Bäume ändern das Ergebnis nicht, kosten nur Rechenzeit.
 */
export const KATASTER_PARK_M = 120

/** Abstand Fläche bzw. Punkt zum Umriss der Streifen (ohne Streifen: zur Mitte) */
function reichweite(umrisse: P[][], mitte: P) {
  const ziele: Multi = umrisse.filter(u => u.length >= 3).map(u => [u])
  return {
    ring: (r: P[]) => (ziele.length ? abstandMulti(ziele, [[r]]) : abstandPunkt([[r]], mitte)),
    punkt: (p: P) => (ziele.length ? abstandPunkt(ziele, p) : dist(p, mitte)),
  }
}

/** Baum-Vorschläge aus einem Baumkataster (in Reichweite der Rechnung: KATASTER_PARK_M um die Umrisse) */
export function baumVorschlaege(baeume: KatasterBaum[], umrisse: P[][], mitte: P, quellenangabe: string): Vorschlag[] {
  const rw = reichweite(umrisse, mitte)
  return baeume.filter(b => rw.punkt(b.p) <= KATASTER_PARK_M).map(b => ({ id: b.id, grund: `${quellenangabe} – Lage ohne Gewähr`,
    hindernis: { id: b.id, art: 'baum', p: b.p, stamm: BAUM_STAMM_M, quelle: 'kataster', name: b.name } }))
}

/** Amtliche Parkfelder in Reichweite der Rechnung (Feldfläche bis KATASTER_PARK_M um die Umrisse, ohne Streifen um die Mitte) */
export function parkKatasterFelder(felder: KatasterFeld[], umrisse: P[][], mitte: P, quellenangabe: string): Vorschlag[] {
  const rw = reichweite(umrisse, mitte)
  return felder.filter(f => f.ring.length >= 3 && rw.ring(f.ring) <= KATASTER_PARK_M)
    .map(f => ({ id: f.id, grund: `${quellenangabe} – zählt als Hindernis, verwerfen, wenn nicht mehr vorhanden`,
      hindernis: { id: f.id, art: 'parkfeld', klasse: f.klasse, ring: f.ring, quelle: 'kataster', name: f.name } }))
}

/**
 * OSM-Parkierungsvorschläge, die amtliche Parkfelder schon abdecken. Regel: unterdrückt, wenn amtliche Felder mindestens
 * OSM_UEBERDECKT_ANTEIL der Vorschlagsfläche bedecken. Ein OSM-Vorschlag ist ein angenommener Streifen (2 m breit) über die
 * ganze Länge der Strasse im Umkreis; die amtlichen Felder derselben Parkierung liegen mit Lücken (Einfahrten, Parkverbote)
 * und anderer Tiefe darin, decken also selten alles, aber deutlich mehr als ein Drittel. Liegt der Vorschlag auf der anderen
 * Seite oder anderswo, ist die Überdeckung nahe null. Massgebend sind alle geladenen amtlichen Felder, auch verworfene: der
 * Datensatz beschreibt die öffentliche Parkierung vollständig, ein verworfenes Feld soll nicht als OSM-Vorschlag zurückkommen.
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

/**
 * Parkierung im Fall (von Hand gezeichnete Parkfelder und Längsparkierungen, bestätigte OSM-Parkierung), die sich mit
 * amtlichen Feldern deckt: ältere Berner Fälle, gezeichnet bevor die App die amtlichen Felder lud, zählten sonst doppelt.
 * Regel wie bei den OSM-Vorschlägen: mindestens OSM_UEBERDECKT_ANTEIL der eigenen Fläche von amtlichen Feldern bedeckt
 * (alle geladenen, auch verworfene). Die Einträge werden nicht gelöscht und zählen weiter; die App meldet sie im Panel.
 */
export function doppeltAmtlich(hindernisse: Hindernis[], amtlich: P[][]): string[] {
  if (!amtlich.length) return []
  const out: string[] = []
  for (const h of hindernisse) {
    if (h.quelle !== 'hand' && h.quelle !== 'osm') continue
    const ring = h.art === 'parkfeld' ? h.ring : h.art === 'laengsparkierung' ? laengsPolygon(h.linie, h.breite) : null
    if (ring && ring.length >= 3 && anteilAmtlich(ring, amtlich) >= OSM_UEBERDECKT_ANTEIL) out.push(h.id)
  }
  return out
}
