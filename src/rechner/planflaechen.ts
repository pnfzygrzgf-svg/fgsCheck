// ── Flächen (Plan): geplante Bodenbedeckung von Hand mit der AV verschneiden (Nutzerentscheid 16.10.2026) ──
//
// Für die Planung neuer Trottoirränder (Trottoirnase, Fahrbahnverengung, verschobener Randstein, neue Insel) zeichnet man
// Flächen (Plan) mit der Art Trottoir, Fahrbahn bzw. Insel (Fall.flaechenPlan). Vor dem Aufbau des Kontexts (index.rechneFall)
// ersetzen sie die AV-Bodenbedeckung darunter; alle nachgelagerten Teile (Fahrbahn und Bordkanten, Wartebereiche,
// Annäherungsbereiche, Inseln und Teilstreifen, Abbiegen, Fahrlinie, Vermassung) lesen danach die verschnittene Liste.
// - Regel: aus allen AV-Flächen die Plan-Fläche ausschneiden (poly.differenz), dann die Plan-Fläche mit der AV-Art einfügen
//   (trottoir -> Trottoir, fahrbahn -> Strasse_Weg, insel -> Verkehrsinsel). Die Plan-Flächen der Reihe nach (Liste im Fall):
//   eine spätere schneidet auch frühere aus, d. h. die zuletzt gezeichnete gilt, wo sich zwei überlappen (wie Ebenen übereinander;
//   umstellen = löschen und neu zeichnen).
// - Gebäude bleiben: eine Plan-Fläche reisst kein Gebäude ab, sie wird um die AV-Gebäude gekürzt (eine ungenau über eine
//   Fassade gezeichnete Fläche nähme sonst der Sichtprüfung ein Gebäude weg). Ganz im Gebäude: übergangen, mit Meldung.
// - Nur AV-Flächen, deren Hüllquader die Plan-Fläche berührt, werden angefasst (Leistung: Strassenflächen haben oft hunderte
//   Stützpunkte); deren Fläche ändert sich die Differenz um weniger als 1 cm², bleibt die AV-Fläche unverändert (gleiches Objekt).
// - Genauigkeit: poly.ts rechnet um den LV95-Nullpunkt verschoben (Zahlen unter 400 km statt 2,6 Mio. m); hin und zurück bleibt
//   eine Koordinate auf rund 1e-9 m gleich. Die Ecken einer Plan-Fläche fangen beim Zeichnen auf AV-Stützpunkte (fixpunkt.fangen),
//   gemeinsame Kanten fallen daher exakt zusammen. Wo eine Plan-Kante zwischen zwei gefangenen Ecken an einem AV-Bogen entlang
//   läuft, entstehen Splitter: Teile unter SPLITTER_M2 bzw. im Mittel schmaler als SPLITTER_BREITE_M (2·Fläche/Umfang) fallen
//   weg, ebenso so kleine Löcher. Die Lücken (unter 5 cm) überbrückt die Rechnung (Fahrbahn.sehne fasst Teile bis 5 cm zusammen).
// - Die Anzeige (Karte, Bericht) zeigt die AV als Bestand und die Plan-Flächen schraffiert darüber; das Fangen der Fixpunkte und
//   die Vorschläge (Gebäudeecken) bleiben beim Bestand: Fixpunkte müssen vor Ort vorhanden sein.

import type { AvFlaeche } from '../daten/av'
import type { FlaechePlan, PlanArt } from '../fall'
import { type P, abstandStrecke } from '../geo'
import { type Multi, type Poly, type Ring, vereinigung, differenz, schnitt, flaeche, ringFlaeche, abstandLinieMulti } from './poly'

export const PLAN_AV_ART: Record<PlanArt, string> = { trottoir: 'Trottoir', fahrbahn: 'Strasse_Weg', insel: 'Verkehrsinsel' }
export const PLAN_NAME: Record<PlanArt, string> = { trottoir: 'Trottoir', fahrbahn: 'Fahrbahn', insel: 'Insel' }
/** Qualität der eingefügten Flächen (AvFlaeche.qualitaet) */
export const PLAN_QUALITAET = 'Plan von Hand'
export const SPLITTER_M2 = 0.05
export const SPLITTER_BREITE_M = 0.05
/** Bordkante «nach Plan-Fläche», wenn der Rand so nah am Umriss einer Plan-Fläche liegt */
export const PLAN_RAND_TOL_M = 0.05
/** Insel von Hand (Hindernis «insel») zählt nicht mehr, wenn sie zu diesem Anteil in Plan-Flächen der Art Insel liegt */
export const INSEL_DOPPELT_ANTEIL = 0.5

type Box = [number, number, number, number]
function boxVon(ringe: P[][]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const r of ringe) for (const p of r) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) }
  return [x0, y0, x1, y1]
}
const RAND_M = 0.05
const ueberlappt = (a: Box, b: Box) => !(a[2] < b[0] - RAND_M || a[0] > b[2] + RAND_M || a[3] < b[1] - RAND_M || a[1] > b[3] + RAND_M)

/** Anzeigename einer Fläche (Plan): «Plan-Fläche 1» (Nummer aus der Id plan-1) */
export function planTitel(id: string): string {
  const m = /^plan-(\d+)$/.exec(id)
  return `Plan-Fläche ${m ? m[1] : id}`
}
const umfang = (r: Ring) => r.reduce((s, p, i) => s + Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1]), 0)

/** Splitter weg: Teile unter SPLITTER_M2 bzw. im Mittel schmaler als SPLITTER_BREITE_M, ebenso so kleine Löcher */
export function ohneSplitter(m: Multi): Multi {
  const aus: Multi = []
  for (const poly of m) {
    if (!poly.length) continue
    const a = flaeche([poly]), u = umfang(poly[0])
    if (a < SPLITTER_M2 || !(u > 0) || 2 * a / u < SPLITTER_BREITE_M) continue
    aus.push([poly[0], ...poly.slice(1).filter(r => Math.abs(ringFlaeche(r)) >= SPLITTER_M2 && 2 * Math.abs(ringFlaeche(r)) / umfang(r) >= SPLITTER_BREITE_M)])
  }
  return aus
}

/** Fläche (Plan) als Mehrfachpolygon: der gezeichnete Ring, Selbstschnitte aufgelöst (Vereinigung) */
export function planPolygon(ring: P[]): Multi {
  return ring.length >= 3 ? vereinigung([[ring]]) : []
}
/** Fläche einer Fläche (Plan) in m² (Anzeige; Selbstschnitte aufgelöst) */
export function planFlaecheM2(ring: P[]): number {
  return flaeche(planPolygon(ring))
}

/** Wirksamer Teil einer Fläche (Plan) in der Rechnung (nach späteren Plan-Flächen und den Gebäuden) */
export interface PlanTeil { id: string; art: PlanArt; poly: Poly }

export interface PlanErgebnis {
  av: AvFlaeche[]            // AV-Bodenbedeckung mit den Plan-Flächen (ohne Plan-Flächen: dasselbe Array wie die Eingabe)
  teile: PlanTeil[]          // wirksame Teile der Plan-Flächen
  meldungen: string[]
  angefasst: number          // AV-Flächen (Bestand), die eine Plan-Fläche verkleinert bzw. ersetzt hat
}

/** AV-Bodenbedeckung mit den Flächen (Plan) verschnitten (Regeln oben) */
export function avMitPlan(av: AvFlaeche[], plan: FlaechePlan[] | undefined): PlanErgebnis {
  if (!plan?.length) return { av, teile: [], meldungen: [], angefasst: 0 }
  type E = { f: AvFlaeche; box: Box }
  let liste: E[] = av.map(f => ({ f, box: boxVon(f.ringe) }))
  const gebaeude = liste.filter(e => e.f.art === 'Gebaeude')
  const meldungen: string[] = []
  const angefasst = new Set<AvFlaeche>()
  for (const fp of plan) {
    let m: Multi
    try { m = planPolygon(fp.ring) } catch { m = [] }
    if (!m.length) { meldungen.push(`${planTitel(fp.id)} (${PLAN_NAME[fp.art]}) ohne Fläche: übergangen.`); continue }
    let box = boxVon(m.flat())
    const geb = gebaeude.filter(g => ueberlappt(g.box, box))
    if (geb.length) try { m = differenz(m, geb.map(g => g.f.ringe)) } catch { /* Gebäude nicht abgezogen */ }
    m = ohneSplitter(m)
    if (!m.length) { meldungen.push(`${planTitel(fp.id)} (${PLAN_NAME[fp.art]}) liegt ganz in Gebäuden der AV: übergangen.`); continue }
    box = boxVon(m.flat())
    const neu: E[] = []
    for (const e of liste) {
      if (e.f.art === 'Gebaeude' || !ueberlappt(e.box, box)) { neu.push(e); continue }
      const alt: Multi = [e.f.ringe]
      let d: Multi
      // polygon-clipping kann an entarteten Ringen scheitern: dann bleibt die AV-Fläche (Meldung), die Rechnung läuft weiter
      try { d = differenz(alt, m) } catch {
        neu.push(e)
        const t = `${planTitel(fp.id)}: eine AV-Fläche (${e.f.art}) liess sich nicht verschneiden und bleibt darunter bestehen.`
        if (!meldungen.includes(t)) meldungen.push(t)
        continue
      }
      if (Math.abs(flaeche(d) - flaeche(alt)) < 1e-4) { neu.push(e); continue }
      if (!e.f.planId) angefasst.add(e.f)
      for (const poly of ohneSplitter(d)) neu.push({ f: { ...e.f, ringe: poly }, box: boxVon(poly) })
    }
    for (const poly of m) neu.push({ f: { art: PLAN_AV_ART[fp.art], kanton: '', qualitaet: PLAN_QUALITAET, bfs: null, ringe: poly, planId: fp.id },
      box: boxVon(poly) })
    liste = neu
  }
  const teile: PlanTeil[] = []
  for (const e of liste) if (e.f.planId) {
    const fp = plan.find(x => x.id === e.f.planId)!
    teile.push({ id: fp.id, art: fp.art, poly: e.f.ringe })
  }
  for (const fp of plan) if (!teile.some(t => t.id === fp.id) && !meldungen.some(x => x.startsWith(`${planTitel(fp.id)} `)))
    meldungen.push(`${planTitel(fp.id)} (${PLAN_NAME[fp.art]}) ganz von späteren Plan-Flächen überdeckt: wirkt nicht.`)
  return { av: liste.map(e => e.f), teile, meldungen, angefasst: angefasst.size }
}

/** Plan-Fläche, an deren Umriss p liegt (höchstens tol), sonst null */
export function planAmRand(teile: PlanTeil[], p: P, tol = PLAN_RAND_TOL_M): PlanTeil | null {
  for (const t of teile) for (const r of t.poly) for (let i = 0; i < r.length; i++)
    if (abstandStrecke(p, r[i], r[(i + 1) % r.length]) <= tol) return t
  return null
}

/** Plan-Flächen (je Id einmal) höchstens d von der Linie */
export function planNahLinie(teile: PlanTeil[], linie: P[], d: number): PlanTeil[] {
  const aus: PlanTeil[] = []
  for (const t of teile) if (!aus.some(x => x.id === t.id) && abstandLinieMulti(linie, [t.poly]) <= d) aus.push(t)
  return aus
}

/** «Plan-Fläche 1 (Trottoir)» aus Id und AV-Art (Strasse_Weg -> Fahrbahn, Verkehrsinsel -> Insel) */
export function planKurzAv(id: string, avArt: string): string {
  const art = (Object.keys(PLAN_AV_ART) as PlanArt[]).find(a => PLAN_AV_ART[a] === avArt)
  return `${planTitel(id)}${art ? ` (${PLAN_NAME[art]})` : ''}`
}
/** «Plan-Fläche 1 (Trottoir)» */
export const planKurz = (t: { id: string; art: PlanArt }) => `${planTitel(t.id)} (${PLAN_NAME[t.art]})`

/** Anteil eines Rings in den Plan-Flächen der Art Insel (Insel von Hand doppelt zu einer Plan-Insel?) */
export function anteilInPlanInsel(ring: P[], teile: PlanTeil[]): number {
  const inseln = teile.filter(t => t.art === 'insel').map(t => t.poly)
  if (!inseln.length || ring.length < 3) return 0
  const a = flaeche([[ring]])
  return a > 0 ? flaeche(schnitt([[ring]], inseln)) / a : 0
}

/** Flächen (Plan) als AV-Flächen (Fangen der Ecken: auch auf die Ecken anderer Plan-Flächen); ohne die Fläche ohneId */
export function planAlsAv(plan: FlaechePlan[] | undefined, ohneId: string | null = null): AvFlaeche[] {
  return (plan ?? []).filter(x => x.id !== ohneId).map(x => ({ art: PLAN_AV_ART[x.art], kanton: '', qualitaet: PLAN_QUALITAET, bfs: null,
    ringe: [x.ring], planId: x.id }))
}
