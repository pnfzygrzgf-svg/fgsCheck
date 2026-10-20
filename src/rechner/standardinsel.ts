// ── Mittelinsel (Standard): Schutzinsel mit Rollstuhlfurt als Standardelement der Flächen (Plan) (Nutzerwunsch 20.10.2026) ──
//
// Vorlage: Masterplan Fussverkehr Stadt Bern, Standards, E1 «Schutzinsel» (Abbildung «Neues Prinzip: Mittelinsel mit
// Rollstuhlfurt»). Gelesene Masse: Fussgängerstreifen (Breite entlang der Fahrbahn) mindestens 4,00 m; Insel zwischen den
// Fahrrichtungen, Tiefe quer zur Fahrbahn mindestens 2,00 m; innerhalb der Streifenbreite 1,20 m Rollstuhlfurt auf
// Fahrbahnniveau (keine Inselkante) und 2,80 m erhöhte Wartefläche; vor und nach dem Streifen je ein halbrunder Inselkopf,
// auf der Seite der Furt mit Signalmast.
//
// Geometrie (inselGeometrie): schiefe Koordinaten um die Mitte m, P(a, b) = m + a · balken + b · achse. achse: Streifenachse
// von Ende A nach Ende B; balken: Balkenrichtung (entlang der Fahrbahn), wie der Umriss eines Streifens von Hand
// (index.handUmriss: Balkenrichtung, sonst senkrecht zur Achse, höchstens SCHRAEG_MAX_GRAD schief; Vorzeichen links der Achse).
// - Streifenbreite B, Furt F und Kopflänge K entlang balken (wie die Breite eines Streifens von Hand); die Tiefe T gilt quer zur
//   Fahrbahn (senkrecht zu balken): entlang der Achse ist die Insel T' = T / |sin(Achse, Balken)| lang, bei einem geraden
//   Streifen T' = T.
// - Furt «links» bzw. «rechts» in Blickrichtung von Ende A nach Ende B: links a ∈ [B/2 − F, B/2], rechts a ∈ [−B/2, −B/2 + F].
// - Teile (je eine Fläche (Plan) der Art Insel): (a) Kopf auf der Furt-Seite, Halbellipse mit Halbachsen K (entlang balken) und
//   T'/2 (entlang der Achse) an der Streifenkante; bei K = T/2 und geradem Streifen ein Halbkreis (Radius halbe Tiefe), bei
//   schiefem Streifen geschert, tangential an die Längsseiten. (b) erhöhte Fläche B − F zusammen mit dem Gegenkopf als ein
//   Polygon. Die Furt selbst bleibt Fahrbahn; nur wenn dort heute eine Verkehrsinsel liegt (z. B. bestehende Insel ersetzt),
//   kommt die Furt als Fläche (Plan) der Art Fahrbahn dazu, zuerst (die Inselteile liegen nicht darüber).
// - Bögen in Schritten von BOGEN_GRAD (Halbkreis 19 Punkte).
// - Signalmast: Punkt im Kopf der Furt-Seite (0,45 · K vor der Streifenkante, auf der Achse), nur Hinweis auf Karte und im
//   Bericht, kein Hindernis in der Rechnung.
//
// Teilung (Entscheid 20.10.2026): die Rechnung teilt einen Streifen nur entlang seiner Achse. Liegt die Mitte der Insel auf der
// Achse und ist die Furt höchstens B/2 − FURT_ACHSE_RAND_M breit, quert die Achse immer die erhöhte Fläche, nie die Furt: aus OSM +
// AV entstehen genau zwei Teilstreifen (die Lücke der Furt neben der Insel liegt nicht auf der Achse und ergibt keinen dritten
// Teil). Die Furt gilt damit als Teil der Querung: keine Bordkante (die Ränder kommen aus der Inselkante auf der Achse), der
// Annäherungsbereich an der Insel läuft über die ganze Streifenbreite (in der Furt ohne Bordkante, aus den Nachbarstrahlen
// ergänzt), kein eigener Wartebereich. Streifen von Hand teilt die Rechnung nie selbst (Hinweis «als zwei Teilstreifen
// zeichnen»); das Werkzeug teilt den gewählten Streifen von Hand darum auf Wunsch gleich mit (streifenTeilen): Enden
// TEIL_ABSTAND_M vor den Inselkanten auf der Achse, wie die Teilstreifen aus OSM + AV (RAND_ZUSCHLAG). Quert die Achse eines
// Streifens trotzdem die Furt (Insel von Hand verschoben, Achse aus OSM daneben), meldet die Rechnung das (furtQuert).

import { type P, add, dot, einheit, sub, dist, links, kreuz, imPolygon } from '../geo'
import type { AvFlaeche } from '../daten/av'
import type { FlaechePlan, FurtSeite, PlanStandard, StandardTeil, StreifenHand } from '../fall'
import { flaeche, schnitt, vereinigung, type Multi } from './poly'
import { KATALOG } from '../bedarf/katalog'
import { durchfahrtHinweise } from '../bedarf/durchfahrt'

/** Vorgaben nach E1 (Masterplan Fussverkehr Stadt Bern, Standards) */
export const E1_TIEFE_M = 2.0           // Inseltiefe quer zur Fahrbahn, mindestens (Standardbreite für Schutzinseln)
export const E1_BREITE_M = 4.0          // Fussgängerstreifen entlang der Fahrbahn, mindestens
export const E1_FURT_M = 1.2            // Rollstuhlfurt auf Fahrbahnniveau
export const E1_NAME = 'Mittelinsel (Standard E1 Masterplan Fussverkehr Bern)'
export const E1_KURZ = 'Mittelinsel Standard E1'
/** Eingabebereiche des Werkzeugs (m) */
export const INSEL_BEREICH = { tiefe: [1, 8] as [number, number], breite: [2, 15] as [number, number], furt: [0, 3] as [number, number],
  kopf: [0, 6] as [number, number] }
export const BOGEN_GRAD = 10
export const SCHRAEG_MAX_GRAD = 60      // wie index.handUmriss (HAND_SCHRAEG_MAX)
export const TEIL_ABSTAND_M = 0.3       // Ende eines Teilstreifens vor der Inselkante (wie streifen.RAND_ZUSCHLAG)
export const TEIL_MIN_HAND_M = 1.0      // Teilstreifen von Hand mindestens so lang (wie index.HAND_MIN_M)
export const FURT_ACHSE_RAND_M = 0.25   // Furt höchstens B/2 − so viel: die Achse liegt sicher auf der erhöhten Fläche
const MAST_ANTEIL = 0.45

export interface InselLage { m: P; achse: P; balken: P }
export interface InselMasse { tiefe: number; breite: number; furt: number; kopf: number; seite: FurtSeite }
export interface InselGeometrie {
  kopf: P[] | null          // Kopf auf der Furt-Seite (null bei Kopflänge 0)
  insel: P[]                // erhöhte Fläche mit Gegenkopf
  furt: P[] | null          // Rollstuhlfurt (Fahrbahn; null bei Furt 0)
  mast: P | null            // Signalmast (Hinweis), im Kopf der Furt-Seite
  tiefeAchse: number        // Länge der Insel entlang der Achse (T')
  kanten: [P, P]            // Inselkanten auf der Achse, zuerst auf der Seite von Ende A
}

const f2 = (x: number) => x.toFixed(2).replace('.', ',')

/** Balkenrichtung wie index.handUmriss: r (Fahrbahn bzw. Balken), zu schief bzw. ohne: senkrecht zur Achse; Vorzeichen links der Achse */
export function balkenNormiert(achse: P, r: P | null): P {
  const u = links(achse)
  let rr = r ? einheit(r) : null
  if (rr === null || (rr[0] === 0 && rr[1] === 0) || Math.abs(dot(rr, u)) < Math.cos(SCHRAEG_MAX_GRAD * Math.PI / 180)) rr = u
  else if (dot(rr, u) < 0) rr = [-rr[0], -rr[1]]
  return ohneMinusNull(rr)
}
/** −0 als 0 (die Fall-Datei schreibt −0 als 0: gleiche Kennzeichnung nach dem Laden) */
const ohneMinusNull = (p: P): P => [p[0] + 0, p[1] + 0]

/** Balkenrichtung eines gerechneten Streifens aus seinem Umriss: die Kante, die am wenigsten parallel zur Achse läuft (Umrisse
 * aus OSM + AV, Luftbild und von Hand haben die Ecken in verschiedener Folge) */
export function balkenAusUmriss(achse: P, umriss: P[]): P | null {
  let best: [number, P] | null = null
  umriss.forEach((p, i) => {
    const v = sub(umriss[(i + 1) % umriss.length], p), l = Math.hypot(v[0], v[1])
    if (l < 0.1) return
    const c = Math.abs(dot(v, achse)) / l
    if (best === null || c < best[0]) best = [c, [v[0] / l, v[1] / l]]
  })
  return best ? (best as [number, P])[1] : null
}

/** Lage aus Mitte, Achse (beliebige Länge) und Balken- bzw. Fahrbahnrichtung (null: senkrecht zur Achse) */
export function inselLage(m: P, achse: P, r: P | null): InselLage {
  const a = ohneMinusNull(einheit(achse))
  return { m, achse: a, balken: balkenNormiert(a, r) }
}

/** Masse mit der Vorgabe der Kopflänge (null: halbe Tiefe, halbrund) */
export function inselMasse(tiefe: number, breite: number, furt: number, kopf: number | null, seite: FurtSeite): InselMasse {
  return { tiefe, breite, furt, kopf: kopf ?? tiefe / 2, seite }
}

/** Harte Untergrenze der Inseltiefe [m] (Regel F2 des Bedarfsmoduls, VSS 40 241 Z. 24): darunter keine Insel (Korrektur E1) */
export const INSEL_TIEFE_MIN_M = KATALOG.F2.werte.min

/** Unzulässige Masse (die Insel wird nicht gebildet) -> Grund, sonst null */
export function masseFehler(x: InselMasse): string | null {
  const ok = (v: number, [a, b]: [number, number]) => Number.isFinite(v) && v >= a - 1e-9 && v <= b + 1e-9
  if (!ok(x.tiefe, INSEL_BEREICH.tiefe)) return `Inseltiefe ${f2(x.tiefe)} m ausserhalb ${INSEL_BEREICH.tiefe[0]} bis ${INSEL_BEREICH.tiefe[1]} m.`
  if (x.tiefe < INSEL_TIEFE_MIN_M - 1e-9) return `Inseltiefe ${f2(x.tiefe)} m unter ${f2(INSEL_TIEFE_MIN_M)} m: zu schmal für eine ` +
    'Schutzinsel (F2, VSS 40 241 Z. 24); die Insel wird nicht eingefügt.'
  if (!ok(x.breite, INSEL_BEREICH.breite)) return `Streifenbreite ${f2(x.breite)} m ausserhalb ${INSEL_BEREICH.breite[0]} bis ${INSEL_BEREICH.breite[1]} m.`
  if (!ok(x.furt, INSEL_BEREICH.furt)) return `Furt ${f2(x.furt)} m ausserhalb ${INSEL_BEREICH.furt[0]} bis ${INSEL_BEREICH.furt[1]} m.`
  if (!ok(x.kopf, INSEL_BEREICH.kopf)) return `Kopflänge ${f2(x.kopf)} m ausserhalb ${INSEL_BEREICH.kopf[0]} bis ${INSEL_BEREICH.kopf[1]} m.`
  if (x.furt > x.breite / 2 - FURT_ACHSE_RAND_M + 1e-9)
    return `Furt ${f2(x.furt)} m zu breit für einen ${f2(x.breite)} m breiten Streifen: höchstens ${f2(x.breite / 2 - FURT_ACHSE_RAND_M)} m, ` +
      'sonst läge die Streifenachse in der Furt und die Rechnung teilte den Streifen nicht an der Insel.'
  return null
}

/** Abweichungen von E1 (Hinweise, die Insel wird trotzdem gebildet) */
export function masseHinweise(x: InselMasse): string[] {
  const h: string[] = []
  if (x.tiefe < E1_TIEFE_M - 1e-9) h.push(`Inseltiefe ${f2(x.tiefe)} m unter ${f2(E1_TIEFE_M)} m (E1: Standardbreite für Schutzinseln mindestens ${f2(E1_TIEFE_M)} m).`)
  if (x.breite < E1_BREITE_M - 1e-9) h.push(`Streifenbreite ${f2(x.breite)} m unter ${f2(E1_BREITE_M)} m (E1: mindestens ${f2(E1_BREITE_M)} m).`)
  if (Math.abs(x.furt - E1_FURT_M) > 1e-9) h.push(x.furt === 0 ? 'Ohne Rollstuhlfurt (E1: 1,20 m).' : `Furt ${f2(x.furt)} m statt ${f2(E1_FURT_M)} m (E1).`)
  return h
}

/** Teile der Mittelinsel (Regeln oben) */
export function inselGeometrie(lage: InselLage, x: InselMasse): InselGeometrie {
  const { m, achse, balken } = lage
  const sin = Math.max(Math.abs(kreuz(achse, balken)), Math.sin((90 - SCHRAEG_MAX_GRAD) * Math.PI / 180))
  const h = x.tiefe / sin / 2, hb = x.breite / 2, s = x.seite === 'links' ? 1 : -1, K = x.kopf, F = x.furt
  const pt = (a: number, b: number): P => add(add(m, balken, a), achse, b)
  const schritte = Math.round(180 / BOGEN_GRAD)
  const bogen = (seite: number, vonOben: boolean): P[] => {
    const aus: P[] = []
    for (let k = 0; k <= schritte; k++) {
      const phi = (vonOben ? 90 - k * BOGEN_GRAD : -90 + k * BOGEN_GRAD) * Math.PI / 180
      aus.push(pt(seite * (hb + K * Math.cos(phi)), h * Math.sin(phi)))
    }
    return aus
  }
  const kopf = K > 1e-9 ? bogen(s, false) : null
  const gegen = K > 1e-9 ? bogen(-s, true) : [pt(-s * hb, h), pt(-s * hb, -h)]
  const insel = [pt(s * (hb - F), -h), pt(s * (hb - F), h), ...gegen]
  const furt = F > 1e-9 ? [pt(s * (hb - F), -h), pt(s * hb, -h), pt(s * hb, h), pt(s * (hb - F), h)] : null
  const mast = K > 1e-9 ? pt(s * (hb + MAST_ANTEIL * K), 0) : null
  return { kopf, insel, furt, mast, tiefeAchse: 2 * h, kanten: [pt(0, -h), pt(0, h)] }
}

/** Geometrie aus der Kennzeichnung einer Fläche (Plan) */
export const standardGeometrie = (st: PlanStandard): InselGeometrie =>
  inselGeometrie({ m: st.m, achse: st.achse, balken: st.balken }, st)

/** Ring des Teils teil (null: Teil gibt es bei diesen Massen nicht) */
export function teilRing(g: InselGeometrie, teil: StandardTeil): P[] | null {
  return teil === 'kopf' ? g.kopf : teil === 'furt' ? g.furt : g.insel
}

/** Teil einer Mittelinsel (Standard) seit dem Einfügen von Hand verändert (Ecken verschoben, Ecke gerundet, Art geändert)? */
export function standardAngepasst(fp: FlaechePlan): boolean {
  const st = fp.standard
  if (!st) return false
  const soll = teilRing(standardGeometrie(st), st.teil)
  if (!soll || soll.length !== fp.ring.length) return true
  if (fp.art !== (st.teil === 'furt' ? 'fahrbahn' : 'insel')) return true
  return soll.some((p, i) => dist(p, fp.ring[i]) > 1e-3)
}

export const TEIL_TEXT: Record<StandardTeil, string> = { kopf: 'Kopf mit Signalmast (Furt-Seite)', insel: 'erhöhte Wartefläche mit Gegenkopf',
  furt: 'Rollstuhlfurt (Fahrbahnniveau)' }

/** «Mittelinsel (Standard E1 Masterplan Fussverkehr Bern): Tiefe 2,00 m, Furt 1,20 m, Insel 2,80 m» */
export function standardText(st: { tiefe: number; breite: number; furt: number }): string {
  return `${E1_NAME}: Tiefe ${f2(st.tiefe)} m, Furt ${f2(st.furt)} m, Insel ${f2(st.breite - st.furt)} m`
}
/** Kennzeichnung eines Teils (Liste, Karte, Bericht): Text, Teil, ggf. «von Hand angepasst» */
export function standardTeilText(fp: FlaechePlan): string {
  const st = fp.standard
  if (!st) return ''
  return `${standardText(st)} – ${TEIL_TEXT[st.teil]}${standardAngepasst(fp) ? ' (Form seither von Hand angepasst)' : ''}`
}

/** Nächste freie Kennung einer Mittelinsel im Fall (e1-1, e1-2, …) */
export function naechsteGruppe(plan: FlaechePlan[] | undefined): string {
  const n = Math.max(0, ...(plan ?? []).map(x => Number(/^e1-(\d+)$/.exec(x.standard?.gruppe ?? '')?.[1] ?? 0)))
  return `e1-${n + 1}`
}

/** Flächen (Plan) einer Mittelinsel (ohne Ids; Reihenfolge: Furt als Fahrbahn falls nötig, Kopf, Insel) */
export function inselFlaechen(lage: InselLage, x: InselMasse, gruppe: string, furtFahrbahn: boolean):
  { art: FlaechePlan['art']; ring: P[]; standard: PlanStandard }[] {
  const g = inselGeometrie(lage, x)
  const st = (teil: StandardTeil): PlanStandard => ({ typ: 'mittelinsel_e1', gruppe, teil, tiefe: x.tiefe, breite: x.breite, furt: x.furt,
    kopf: x.kopf, seite: x.seite, m: [lage.m[0], lage.m[1]], achse: [lage.achse[0], lage.achse[1]], balken: [lage.balken[0], lage.balken[1]] })
  const aus: { art: FlaechePlan['art']; ring: P[]; standard: PlanStandard }[] = []
  if (furtFahrbahn && g.furt) aus.push({ art: 'fahrbahn', ring: g.furt, standard: st('furt') })
  if (g.kopf) aus.push({ art: 'insel', ring: g.kopf, standard: st('kopf') })
  aus.push({ art: 'insel', ring: g.insel, standard: st('insel') })
  return aus
}

/** Punkt p auf die Achse (durch q in Richtung achse) projiziert */
export function aufAchse(p: P, q: P, achse: P): P {
  return add(q, achse, dot(sub(p, q), achse))
}

/** Mitte der Insel auf der Achse p0–p1 in der Fahrbahnmitte (Sehne der Fahrbahn entlang der Achse durch die Streifenmitte);
 * ohne Sehne die Streifenmitte */
export function fahrbahnMitte(sehne: (p: P, r: P) => [number, number] | null, p0: P, p1: P): { m: P; quelle: string } {
  const a = einheit(sub(p1, p0)), mitte: P = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
  const sh = sehne(mitte, a)
  if (!sh) return { m: mitte, quelle: 'Streifenmitte (keine Fahrbahn auf der Achse gefunden)' }
  return { m: add(mitte, a, (sh[0] - sh[1]) / 2), quelle: `Fahrbahnmitte zwischen den Bordkanten (Fahrbahn auf der Achse ${f2(sh[0] + sh[1])} m)` }
}

/** Teilstreifen: Mitte der Lücke zwischen zwei Teilen auf der Achse, die dem Punkt p am nächsten liegt (null: keine Lücke) */
export function teilLuecke(teile: { p0: P; p1: P }[], achse: P, p: P): P | null {
  if (teile.length < 2) return null
  const q = teile[0].p0, t = (x: P) => dot(sub(x, q), achse)
  const iv = teile.map(s => [Math.min(t(s.p0), t(s.p1)), Math.max(t(s.p0), t(s.p1))]).sort((a, b) => a[0] - b[0])
  const tp = t(p)
  let best: number | null = null
  for (let i = 1; i < iv.length; i++) {
    if (iv[i][0] <= iv[i - 1][1]) continue
    const c = (iv[i - 1][1] + iv[i][0]) / 2
    if (best === null || Math.abs(c - tp) < Math.abs(best - tp)) best = c
  }
  return best === null ? null : add(q, achse, best)
}

/** Streifen p0–p1 an der Insel in zwei Teilstreifen teilen (Enden TEIL_ABSTAND_M vor den Inselkanten auf der Achse) */
export function streifenTeilen(p0: P, p1: P, lage: InselLage, x: InselMasse): { teile: [[P, P], [P, P]] } | { grund: string } {
  const L = dist(p0, p1)
  if (!(L > 0)) return { grund: 'Streifen ohne Länge.' }
  const a = einheit(sub(p1, p0))
  if (dot(a, lage.achse) < 0.999) return { grund: 'Die Insel liegt nicht auf der Achse dieses Streifens.' }
  const g = inselGeometrie(lage, x)
  const tm = dot(sub(lage.m, p0), a), h = g.tiefeAchse / 2
  const e1 = tm - h - TEIL_ABSTAND_M, e2 = tm + h + TEIL_ABSTAND_M
  if (e1 < TEIL_MIN_HAND_M - 1e-9 || L - e2 < TEIL_MIN_HAND_M - 1e-9)
    return { grund: `Neben der Insel bliebe ein Teil kürzer als ${f2(TEIL_MIN_HAND_M)} m (Teile ${f2(Math.max(0, e1))} m und ` +
      `${f2(Math.max(0, L - e2))} m): Streifen nicht geteilt – Insel bzw. Enden verschieben.` }
  return { teile: [[p0, add(p0, a, e1)], [add(p0, a, e2), p1]] }
}

/**
 * Teil (1: Seite von Ende A, 2: Seite von Ende B), an den die Eingaben einer Zufahrt des geteilten Streifens gehen: dort, wo ihr
 * erster Sichtpunkt liegt (am Streifenrand auf der Fahrlinie), entlang der Achse vor bzw. hinter der Inselmitte; ohne Sichtpunkt der
 * erste Punkt der Fahrlinie; ohne passende Zufahrt Teil 1. Nicht der erste Punkt der Fahrlinie zuerst (Prüfbefund 20.10.2026,
 * Könizstrasse): bei Streifen von Hand liegt er fast auf der Streifenmitte, die Eingabe landete beim falschen Teil und verwaiste
 */
export function zufahrtTeil(zufahrten: { kennung: string; sichtpunkte: P[]; spur: P[] }[], lage: InselLage): (kennung: string) => 1 | 2 {
  return kennung => {
    const z = zufahrten.find(x => x.kennung === kennung)
    const q = z?.sichtpunkte[0] ?? z?.spur[0]
    if (!q) return 1
    return dot(sub(q, lage.m), lage.achse) < 0 ? 1 : 2
  }
}

/** Prüfung der Lage gegen die Bodenbedeckung (AV mit Flächen (Plan)) vor dem Einfügen */
export interface InselPruefung {
  furtFahrbahn: boolean            // in der Furt liegt heute eine Verkehrsinsel: Furt als Fläche (Plan) Fahrbahn einfügen
  ausserhalbM2: number             // Insel (Kopf, erhöhte Fläche) ausserhalb von Fahrbahn und Verkehrsinseln (Trottoir, Gebäude …)
  restM: [number, number] | null   // Fahrbahn neben der Insel quer zur Fahrbahn: Seite von Ende A, Seite von Ende B
  hinweise: string[]
}
export function inselPruefen(lage: InselLage, x: InselMasse, av: AvFlaeche[], sehne: (p: P, r: P) => [number, number] | null,
  opt: { radstreifen?: boolean | null; kantonBE?: boolean; bern?: boolean } = {}): InselPruefung {
  const g = inselGeometrie(lage, x)
  const ringe = [g.insel, ...(g.kopf ? [g.kopf] : [])]
  const alle = [...ringe, ...(g.furt ? [g.furt] : [])].flat()
  const box = [Math.min(...alle.map(p => p[0])), Math.min(...alle.map(p => p[1])), Math.max(...alle.map(p => p[0])), Math.max(...alle.map(p => p[1]))]
  // nur AV-Flächen, deren Hüllquader die Insel berührt (Strassenflächen haben oft hunderte Stützpunkte)
  const nah = av.filter(f => {
    const r = f.ringe[0] ?? []
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of r) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) }
    return !(x1 < box[0] || x0 > box[2] || y1 < box[1] || y0 > box[3])
  })
  const flaecheIn = (m: Multi, arten: (a: string) => boolean): number => {
    const z = nah.filter(f => arten(f.art)).map(f => f.ringe)
    if (!z.length) return 0
    try { return flaeche(schnitt(m, z)) } catch { return 0 }
  }
  const hinweise: string[] = []
  const furtFahrbahn = !!g.furt && flaecheIn([[g.furt]], a => a === 'Verkehrsinsel') > 0.05
  if (furtFahrbahn) hinweise.push('In der Furt liegt heute eine Verkehrsinsel: die Furt kommt als Fläche (Plan) Fahrbahn dazu (Fahrbahnniveau).')
  let insel: Multi = []
  try { insel = vereinigung(...ringe.map(r => [[r]] as Multi)) } catch { insel = ringe.map(r => [r]) }
  const ausserhalbM2 = flaecheIn(insel, a => a !== 'Strasse_Weg' && a !== 'Verkehrsinsel')
  if (ausserhalbM2 > 0.05) hinweise.push(`Die Insel ragt ${ausserhalbM2.toFixed(1).replace('.', ',')} m² über die Fahrbahn hinaus ` +
    '(Trottoir, Gebäude bzw. andere AV-Fläche): Lage prüfen.')
  const sin = Math.abs(kreuz(lage.achse, lage.balken))
  const sh = sehne(lage.m, lage.achse)
  const h = g.tiefeAchse / 2
  const restM: [number, number] | null = sh ? [(sh[1] - h) * sin, (sh[0] - h) * sin] : null
  // Durchfahrt neben der Insel nach F3 bzw. F3-B (Werte aus dem Katalog des Bedarfsmoduls; Korrektur E1, statt «unter 2,0 m»)
  if (restM) hinweise.push(...durchfahrtHinweise(restM.map(r => Math.max(0, r)), opt))
  return { furtFahrbahn, ausserhalbM2, restM, hinweise }
}

/** Mittelinseln (Standard) eines Falls: je Gruppe die Kennzeichnung (erste gefundene) und die Flächen-Ids */
export function standardGruppen(plan: FlaechePlan[] | undefined): { gruppe: string; st: PlanStandard; ids: string[] }[] {
  const aus: { gruppe: string; st: PlanStandard; ids: string[] }[] = []
  for (const fp of plan ?? []) {
    if (!fp.standard) continue
    const g = aus.find(x => x.gruppe === fp.standard!.gruppe)
    if (g) g.ids.push(fp.id); else aus.push({ gruppe: fp.standard.gruppe, st: fp.standard, ids: [fp.id] })
  }
  return aus
}

/** Quert die Achse p0–p1 die Furt einer Mittelinsel (Standard), aber nicht deren erhöhte Fläche? -> Kennung der Gruppe, sonst null.
 * Dann teilt die Rechnung den Streifen dort nicht (Achse neben der Inselmitte) */
export function furtQuert(plan: FlaechePlan[] | undefined, p0: P, p1: P): { gruppe: string; ids: string[] } | null {
  for (const g of standardGruppen(plan)) {
    const geo = standardGeometrie(g.st)
    if (!geo.furt) continue
    // Proben alle 0,2 m entlang der Achse (die Furt ist entlang der Achse so lang wie die Insel tief)
    const L = dist(p0, p1), n = Math.max(2, Math.ceil(L / 0.2))
    const proben = Array.from({ length: n - 1 }, (_, k) => add(p0, sub(p1, p0), (k + 1) / n))
    if (proben.some(p => imPolygon(p, [geo.furt!])) && !proben.some(p => imPolygon(p, [geo.insel])))
      return { gruppe: g.gruppe, ids: g.ids }
  }
  return null
}

// ---------------------------------------------------------------- Verschieben per Drag-and-drop (Nutzerwunsch 20.10.2026)
// Eine eingefügte Mittelinsel (alle Teile einer Gruppe in der Standardform, standardAngepasst falsch) lässt sich auf der Karte am
// Griff in der Inselmitte ziehen. Standard: die Mitte gleitet entlang der Achse (Projektion auf die Gerade durch die bisherige Mitte
// in Richtung standard.achse); frei (Schalter «frei verschieben» bzw. Umschalttaste während des Ziehens): die Mitte folgt dem
// Zeiger, die Ausrichtung bleibt. Beim Loslassen werden die
// Teile aus den gespeicherten Massen an der neuen Mitte neu gebildet (inselGeometrie, wie beim Einfügen), gleiche Ids und
// Reihenfolge, Kennzeichnung mit der neuen Mitte. Teilstreifen, die beim Einfügen an dieser Insel geteilt wurden (erkannt an der
// Lage: Ende TEIL_ABSTAND_M vor einer Inselkante auf der Achse, Achse parallel, das andere Ende weiter aussen), gehen mit: ihre
// inneren Enden kommen wieder TEIL_ABSTAND_M vor die neuen Inselkanten, auf ihrer eigenen Achse (Schlüssel und Eingaben bleiben).
// Würde ein Teilstreifen dabei kürzer als TEIL_MIN_HAND_M bzw. kehrte er sich um, bleibt alles, wie es war (Meldung).
const ENDE_TOL_M = 0.05

/** Neue Mitte beim Ziehen: auf die Achse projiziert bzw. frei */
export function zugMitte(st: { m: P; achse: P }, ziel: P, frei: boolean): P {
  return frei ? [ziel[0], ziel[1]] : aufAchse(ziel, st.m, st.achse)
}

/** Teile einer Mittelinsel (Gruppe) in Standardform? (Griff nur dann) -> Kennzeichnung des ersten Teils, sonst null */
export function standardZiehbar(plan: FlaechePlan[] | undefined, gruppe: string): PlanStandard | null {
  const teile = (plan ?? []).filter(x => x.standard?.gruppe === gruppe)
  if (!teile.length || teile.some(standardAngepasst)) return null
  return teile[0].standard!
}

/** Teilstreifen an den Inselkanten der Mittelinsel st (beim Einfügen geteilt): je Seite Streifen-Nummer und inneres Ende */
export interface InselTeilstreifen { a: { id: string; ende: 'p0' | 'p1' } | null; b: { id: string; ende: 'p0' | 'p1' } | null }
export function teilstreifenAnInsel(streifen: StreifenHand[], st: PlanStandard): InselTeilstreifen {
  const g = standardGeometrie(st)
  const ziel = [add(g.kanten[0], st.achse, -TEIL_ABSTAND_M), add(g.kanten[1], st.achse, TEIL_ABSTAND_M)]
  // Korrektur 20.10.2026 (Prüfbefund): nach einem freien Zug liegt die Inselmitte seitlich neben der Achse der Teilstreifen. Darum
  // zählt die Lage entlang der Achse: Zielpunkt auf die eigene Achse des Teilstreifens projiziert (ENDE_TOL_M), die Inselmitte
  // höchstens eine halbe Streifenbreite seitlich der Achse (sonst ein anderer, paralleler Streifen); bei mehreren der nächste
  const suche = (k: 0 | 1) => {
    const aussen = k === 0 ? -1 : 1
    let best: [{ id: string; ende: 'p0' | 'p1' }, number] | null = null
    for (const s of streifen) {
      const v = sub(s.p1, s.p0), l = Math.hypot(v[0], v[1])
      if (!(l > 0) || Math.abs(dot(v, st.achse)) / l < 0.999) continue
      const a: P = [v[0] / l, v[1] / l]
      const seitlich = Math.abs(kreuz(sub(st.m, s.p0), a))
      if (seitlich > s.breite / 2 + 1e-9) continue
      const z = aufAchse(ziel[k], s.p0, a)
      for (const ende of ['p0', 'p1'] as const) {
        const andere = ende === 'p0' ? s.p1 : s.p0
        if (dist(s[ende], z) <= ENDE_TOL_M && aussen * dot(sub(andere, s[ende]), st.achse) > 0 && (!best || seitlich < best[1]))
          best = [{ id: s.id, ende }, seitlich]
      }
    }
    return best ? best[0] : null
  }
  return { a: suche(0), b: suche(1) }
}

/** Streifen von Hand, deren Achse in die Insel (Kopf bzw. erhöhte Fläche) reicht (Proben alle 0,1 m) */
export function streifenInInsel(streifen: StreifenHand[], g: InselGeometrie): string[] {
  const ringe = [g.insel, ...(g.kopf ? [g.kopf] : [])]
  return streifen.filter(s => {
    const L = dist(s.p0, s.p1), n = Math.max(2, Math.ceil(L / 0.1))
    for (let k = 0; k <= n; k++) if (ringe.some(r => imPolygon(add(s.p0, sub(s.p1, s.p0), k / n), [r]))) return true
    return false
  }).map(s => s.id)
}

/** Mittelinsel gruppe an die neue Mitte m verschieben (Regeln oben) -> neue Listen und die mitgeführten Teilstreifen, sonst Grund */
export function inselVerschieben(plan: FlaechePlan[], streifen: StreifenHand[], gruppe: string, m: P):
  { plan: FlaechePlan[]; streifen: StreifenHand[]; teilIds: string[]; abAchseM: number | null; inInsel: string[] } | { grund: string } {
  const st = standardZiehbar(plan, gruppe)
  if (!st) return { grund: 'Nur eine Mittelinsel in der Standardform lässt sich ziehen (Form von Hand angepasst bzw. nicht gefunden).' }
  const neuSt: PlanStandard = { ...st, m: [m[0], m[1]] }
  const g = standardGeometrie(neuSt)
  const neuPlan = plan.map(fp => {
    if (fp.standard?.gruppe !== gruppe) return fp
    const ring = teilRing(g, fp.standard.teil)
    return ring ? { ...fp, ring, standard: { ...fp.standard, m: [m[0], m[1]] as P } } : fp
  })
  const ts = teilstreifenAnInsel(streifen, st)
  const neuStreifen = streifen.map(s => ({ ...s }))
  const teilIds: string[] = []
  for (const [k, t] of [[0, ts.a], [1, ts.b]] as const) {
    if (!t) continue
    const s = neuStreifen.find(x => x.id === t.id)!
    const andere = t.ende === 'p0' ? s.p1 : s.p0
    const a = einheit(sub(s.p1, s.p0))
    // neues inneres Ende: TEIL_ABSTAND_M vor der neuen Inselkante, auf der Achse des Teilstreifens
    const z = add(g.kanten[k], st.achse, k === 0 ? -TEIL_ABSTAND_M : TEIL_ABSTAND_M)
    const neu = aufAchse(z, s.p0, a)
    const aussen = k === 0 ? -1 : 1
    const laenge = aussen * dot(sub(andere, neu), st.achse)
    if (laenge < TEIL_MIN_HAND_M - 1e-9)
      return { grund: `Verschiebung zu weit: ein Teilstreifen würde kürzer als ${f2(TEIL_MIN_HAND_M)} m – Insel weniger weit ziehen.` }
    s[t.ende] = neu
    teilIds.push(s.id)
  }
  // Abstand der neuen Mitte von der Achse der Teilstreifen (frei verschoben: Hinweis), ohne Teilstreifen null
  const t0 = streifen.find(x => x.id === teilIds[0])
  const abAchseM = t0 ? Math.abs(kreuz(sub(m, t0.p0), einheit(sub(t0.p1, t0.p0)))) : null
  // Streifen von Hand, die danach in die Insel reichen (z. B. Teilstreifen nicht erkannt bzw. nur einer): Hinweis
  return { plan: neuPlan, streifen: neuStreifen, teilIds, abAchseM, inInsel: streifenInInsel(neuStreifen, g) }
}
