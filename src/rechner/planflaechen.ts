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
import type { FlaechePlan, PlanArt, PlanStandard, PlanSeitenraum } from '../fall'
import { type P, abstandStrecke, streckenSchnitt } from '../geo'
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
export interface PlanTeil { id: string; art: PlanArt; poly: Poly; standard?: PlanStandard | PlanSeitenraum }   // standard: Mittelinsel (Standard) bzw. vorgezogener Seitenraum

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
    teile.push({ id: fp.id, art: fp.art, poly: e.f.ringe, ...(fp.standard ? { standard: fp.standard } : {}) })
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
/** «Plan-Fläche 1 (Trottoir)»; Teil einer Mittelinsel (Standard): «Plan-Fläche 3 (Insel, Mittelinsel Standard E1)» */
export const planKurz = (t: { id: string; art: PlanArt; standard?: PlanStandard | PlanSeitenraum }) =>
  `${planTitel(t.id)} (${PLAN_NAME[t.art]}${t.standard ? `, ${planStandardKurz(t.standard)}` : ''})`
/** Kurzname der Mittelinsel (Standard) in Annahmen (wie standardinsel.E1_KURZ; hier ohne Abhängigkeit) */
export const PLAN_STANDARD_KURZ = 'Mittelinsel Standard E1'
/** Kurzname eines Standardelements: Mittelinsel bzw. vorgezogener Seitenraum (wie seitenraum.SR_KURZ) */
export const planStandardKurz = (st: { typ: string }) => (st.typ === 'seitenraum' ? 'vorgezogener Seitenraum' : PLAN_STANDARD_KURZ)

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

// ---------------------------------------------------------------- Ecke runden (Nutzerentscheid 20.10.2026)
// Eine fast gerade gezeichnete Ecke einer Fläche (Plan) (Abschrägung mit wenigen Punkten) liest der Eckradius als sehr grossen
// Bogen (abbiegen.ts: über ECK_GROSS_M gilt eine Ecke nach Plan-Fläche als unplausibel, der Abbiegeradius wird geschätzt). Mit
// «Ecke runden» ersetzt die App eine Ecke durch einen Kreisbogen mit dem geplanten Radius R, tangential an beide Kanten:
// - Innenwinkel θ zwischen den beiden Kanten an der Ecke (0 < θ < 180°), Tangentialpunkte im Abstand t = R / tan(θ/2) von der
//   Ecke auf beiden Kanten, Kreismitte auf der Winkelhalbierenden im Abstand R / sin(θ/2). Dieselbe Rechnung für konvexe und
//   einspringende Ecken: der Bogen liegt immer im Winkel θ der beiden Kanten; bei einer konvexen Ecke schneidet er die Ecke ab,
//   bei einer einspringenden füllt er sie aus.
// - Bogen in Schritten von höchstens RUNDEN_SCHRITT_M bzw. RUNDEN_SCHRITT_GRAD (Sehnenpfeil bei R = 6 m rund 5 mm: der Kreisfit
//   des Eckradius liest den Radius auf wenige Zentimeter genau).
// - Ist t länger als eine der beiden Kanten, passt der Bogen nicht: die Fläche bleibt unverändert, Meldung mit dem grössten
//   möglichen Radius. Nicht auf die kürzere Kante begrenzt: der Radius ist die geplante Grösse; ein still verkleinerter Radius
//   ergäbe eine andere Fahrlinie und Sichtweite, als eingegeben (Nutzer wählt: kleinerer Radius bzw. Nachbarecke verschieben).
// - Schneidet der Bogen eine andere Kante der Fläche (z. B. schmale Fläche, gegenüberliegender Rand näher als der Bogen;
//   Prüfbefund 20.10.2026), wird ebenfalls nicht gerundet: der Ring hätte mehr Selbstüberschneidungen als vorher.
// - Gespeichert wird nur die Geometrie (Fall-Datei unverändert im Format); der Radius steht danach nicht mehr in der Datei, der
//   Eckradius liest ihn aus dem Bogen.
/** Bordkantenradius, ab dem eine Ecke als gross gilt (abbiegen.ts): AV-Ecke «prüfen», Ecke nach Plan-Fläche unplausibel (geschätzt) */
export const ECK_GROSS_M = 23.5
export const RUNDEN_R_VORGABE = 6
export const RUNDEN_R_BEREICH: [number, number] = [1, 30]
export const RUNDEN_SCHRITT_M = 0.5
export const RUNDEN_SCHRITT_GRAD = 10
/** Ecken, deren Innenwinkel näher als so viel an 180° bzw. 0° liegt, lassen sich nicht runden (gerade bzw. Spitze) */
export const RUNDEN_WINKEL_MIN_GRAD = 1

export type Rundung =
  | { ok: true; ring: P[]; t: number; innenGrad: number; bogenPunkte: number; einspringend: boolean }
  | { ok: false; grund: string }

const f1r = (x: number) => x.toFixed(1).replace('.', ',')

/** Ecke i des Rings (ohne Schlusspunkt) durch einen Kreisbogen mit Radius R ersetzen (Regeln oben) */
export function eckeRunden(ring: P[], i: number, R: number): Rundung {
  const n = ring.length
  if (n < 3 || i < 0 || i >= n) return { ok: false, grund: 'Ecke nicht gefunden.' }
  if (!(R > 0) || !Number.isFinite(R)) return { ok: false, grund: 'Radius ungültig.' }
  const p = ring[i], a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n]
  const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1])
  if (la < 1e-6 || lb < 1e-6) return { ok: false, grund: 'Ecke mit doppeltem Punkt: zuerst die Ecken bereinigen.' }
  const u1: P = [(a[0] - p[0]) / la, (a[1] - p[1]) / la], u2: P = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb]
  const theta = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])))
  const innenGrad = theta * 180 / Math.PI
  if (innenGrad > 180 - RUNDEN_WINKEL_MIN_GRAD) return { ok: false, grund: 'Die Kanten laufen an dieser Ecke fast gerade durch: nichts zu runden.' }
  if (innenGrad < RUNDEN_WINKEL_MIN_GRAD) return { ok: false, grund: 'Spitze Ecke (Kanten fast deckungsgleich): nicht rundbar.' }
  const t = R / Math.tan(theta / 2)
  const kurz = Math.min(la, lb)
  if (t > kurz + 1e-6) {
    return { ok: false, grund: `Bogen mit ${f1r(R)} m passt nicht: er braucht ${f1r(t)} m auf beiden Kanten, die kürzere ist nur ` +
      `${f1r(kurz)} m lang (Ecke ${f1r(180 - innenGrad)}° abgewinkelt). Höchstens ${f1r(eckeRadiusMax(ring, i)!)} m möglich – kleineren ` +
      'Radius wählen bzw. die Nachbarecke weiter weg schieben.' }
  }
  const t1: P = [p[0] + u1[0] * t, p[1] + u1[1] * t], t2: P = [p[0] + u2[0] * t, p[1] + u2[1] * t]
  const wl = Math.hypot(u1[0] + u2[0], u1[1] + u2[1])
  const w: P = [(u1[0] + u2[0]) / wl, (u1[1] + u2[1]) / wl]
  const cm = R / Math.sin(theta / 2)
  const c: P = [p[0] + w[0] * cm, p[1] + w[1] * cm]
  const ablenkung = Math.PI - theta
  const m = Math.max(1, Math.ceil(R * ablenkung / RUNDEN_SCHRITT_M - 1e-9), Math.ceil(ablenkung * 180 / Math.PI / RUNDEN_SCHRITT_GRAD - 1e-9))
  const v1: P = [t1[0] - c[0], t1[1] - c[1]], v2: P = [t2[0] - c[0], t2[1] - c[1]]
  const sgn = v1[0] * v2[1] - v1[1] * v2[0] >= 0 ? 1 : -1
  const w0 = Math.atan2(v1[1], v1[0])
  const bogen: P[] = [t1]
  for (let k = 1; k < m; k++) {
    const phi = w0 + sgn * ablenkung * k / m
    bogen.push([c[0] + R * Math.cos(phi), c[1] + R * Math.sin(phi)])
  }
  bogen.push(t2)
  // Tangentialpunkt auf der Nachbarecke (t = Kantenlänge): Nachbarecke nicht doppelt
  const davor = ring[(i - 1 + n) % n], danach = ring[(i + 1) % n]
  if (Math.hypot(bogen[0][0] - davor[0], bogen[0][1] - davor[1]) < 1e-3) bogen.shift()
  if (Math.hypot(bogen[bogen.length - 1][0] - danach[0], bogen[bogen.length - 1][1] - danach[1]) < 1e-3) bogen.pop()
  const neu = [...ring.slice(0, i), ...bogen, ...ring.slice(i + 1)]
  if (schnitte(neu) > schnitte(ring)) return { ok: false, grund: `Bogen mit ${f1r(R)} m schnitte eine andere Kante der Fläche ` +
    '(Selbstüberschneidung) – kleineren Radius wählen bzw. die Fläche anpassen.' }
  // einspringend: Ecke auf der anderen Seite als der Umlaufsinn des Rings (Fläche wächst)
  let flaecheS = 0
  for (let k = 0; k < n; k++) { const q = ring[k], r = ring[(k + 1) % n]; flaecheS += (q[0] - ring[0][0]) * (r[1] - ring[0][1]) - (r[0] - ring[0][0]) * (q[1] - ring[0][1]) }
  const kr = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])
  return { ok: true, ring: neu, t, innenGrad, bogenPunkte: bogen.length, einspringend: kr * flaecheS < 0 }
}

/** Grösster Radius, mit dem sich Ecke i runden lässt (Tangentialpunkte auf beiden Kanten: min(Kantenlänge) · tan(θ/2)), auf 0,1 m
 * abgerundet; null, wenn die Ecke nicht rundbar ist (fast gerade bzw. Spitze, doppelter Punkt). Eine Selbstüberschneidung mit
 * anderen Kanten der Fläche prüft erst eckeRunden */
export function eckeRadiusMax(ring: P[], i: number): number | null {
  const n = ring.length
  if (n < 3 || i < 0 || i >= n) return null
  const p = ring[i], a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n]
  const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1])
  if (la < 1e-6 || lb < 1e-6) return null
  const c = ((a[0] - p[0]) * (b[0] - p[0]) + (a[1] - p[1]) * (b[1] - p[1])) / (la * lb)
  const theta = Math.acos(Math.max(-1, Math.min(1, c)))
  const g = theta * 180 / Math.PI
  if (g > 180 - RUNDEN_WINKEL_MIN_GRAD || g < RUNDEN_WINKEL_MIN_GRAD) return null
  return Math.floor(Math.min(la, lb) * Math.tan(theta / 2) * 10 + 1e-6) / 10
}

/** Anzahl echter Schnitte nicht benachbarter Kanten eines Rings (ohne Schlusspunkt) */
function schnitte(r: P[]): number {
  const m = r.length
  let n = 0
  for (let x = 0; x < m; x++) for (let y = x + 2; y < m; y++) {
    if (x === 0 && y === m - 1) continue
    if (streckenSchnitt(r[x], r[(x + 1) % m], r[y], r[(y + 1) % m])) n++
  }
  return n
}

/** Ecke eines Rings höchstens r von p (die nächste; nur unter den Indizes kandidaten, wenn angegeben), sonst null */
export function eckeAmPunkt(ring: P[], p: P, r: number, kandidaten?: number[]): number | null {
  let best: number | null = null, bd = Infinity
  const k = kandidaten ? new Set(kandidaten) : null
  ring.forEach((q, i) => {
    if (k && !k.has(i)) return
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d <= r && d < bd) { bd = d; best = i }
  })
  return best
}

// Echte Ecken (Nutzerbefund 20.10.2026: Bogenpunkte erschienen als Rund-Ziele): Punkte eines Bogens (gerundet bzw. von Hand) und
// fast gerade Punkte drehen je nur wenige Grad; als Ecke zum Runden gelten Punkte mit mindestens ECKE_MIN_DREH_GRAD Drehung, an
// denen sich überhaupt runden lässt (eckeRadiusMax nicht null). Ein Bogen sind mindestens BOGEN_MIN_PUNKTE aufeinanderfolgende
// Punkte, die nicht echte Ecken sind, je mindestens 0,2° im selben Sinn drehen und höchstens BOGEN_KANTE_M auseinander liegen
export const ECKE_MIN_DREH_GRAD = 15
const BOGEN_MIN_PUNKTE = 3
const BOGEN_NACH_M = 2.0          // Bogen so nah hinter der begrenzenden Nachbarecke: im Hinweis nennen
const BOGEN_KANTE_M = 1.0

/** Drehung an Ecke i in Grad (Vorzeichen: links positiv) */
export function eckeDrehung(ring: P[], i: number): number {
  const n = ring.length, a = ring[(i - 1 + n) % n], q = ring[i], b = ring[(i + 1) % n]
  const u: P = [q[0] - a[0], q[1] - a[1]], v: P = [b[0] - q[0], b[1] - q[1]]
  return Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180 / Math.PI
}

/** Indizes der echten Ecken eines Rings (Rund-Ziele) */
export function echteEcken(ring: P[]): number[] {
  return ring.map((_, i) => i).filter(i => Math.abs(eckeDrehung(ring, i)) >= ECKE_MIN_DREH_GRAD && eckeRadiusMax(ring, i) !== null)
}

/** Bögen im Ring: [erster, letzter] Index (zyklisch, in Ringrichtung) */
export function boegen(ring: P[]): [number, number][] {
  const n = ring.length, echt = new Set(echteEcken(ring))
  const dreh = ring.map((_, i) => eckeDrehung(ring, i))
  const bogenPkt = ring.map((_, i) => !echt.has(i) && Math.abs(dreh[i]) >= 0.2)
  if (bogenPkt.every(x => x)) return []
  const start = bogenPkt.findIndex(x => !x)
  const aus: [number, number][] = []
  let lauf: number[] = []
  const ende = () => { if (lauf.length >= BOGEN_MIN_PUNKTE) aus.push([lauf[0], lauf[lauf.length - 1]]); lauf = [] }
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n
    if (!bogenPkt[i]) { ende(); continue }
    const l = lauf[lauf.length - 1]
    if (lauf.length && (Math.sign(dreh[i]) !== Math.sign(dreh[l]) ||
      Math.hypot(ring[i][0] - ring[l][0], ring[i][1] - ring[l][1]) > BOGEN_KANTE_M)) ende()
    lauf.push(i)
  }
  ende()
  return aus
}

/** Was den Radius an Ecke i begrenzt: Nachbarecke an der kürzeren Kante, deren Länge, ggf. ein Bogen gleich dahinter */
export interface EckGrenze { rMax: number; nachbar: number; kanteM: number; bogen: [number, number] | null; bogenNachM: number | null }
export function eckeGrenze(ring: P[], i: number): EckGrenze | null {
  const rMax = eckeRadiusMax(ring, i)
  if (rMax === null) return null
  const n = ring.length, d = (x: number, y: number) => Math.hypot(ring[x][0] - ring[y][0], ring[x][1] - ring[y][1])
  const vor = (i - 1 + n) % n, nach = (i + 1) % n
  const [nachbar, schritt] = d(i, vor) <= d(i, nach) ? [vor, -1] : [nach, 1]
  const bg = boegen(ring)
  const imBogen = (x: number) => bg.find(([a, b]) => (a <= b ? x >= a && x <= b : x >= a || x <= b)) ?? null
  // Bogen an bzw. kurz hinter der Nachbarecke (von Ecke i weg)
  let bogen: [number, number] | null = null, bogenNachM: number | null = null
  let x = nachbar, weg = 0
  for (let k = 0; k < 4 && weg <= BOGEN_NACH_M; k++) {
    const b = imBogen(x)
    if (b) { bogen = b; bogenNachM = weg; break }
    const y = (x + schritt + n) % n
    weg += d(x, y); x = y
  }
  return { rMax, nachbar, kanteM: d(i, nachbar), bogen, bogenNachM }
}

/** Hinweis zur Grenze an Ecke i (Anzeige; Nummern ab 1): «Ecke 3 liegt 5,0 m entfernt; …» */
export function eckeGrenzeText(ring: P[], i: number): string {
  const g = eckeGrenze(ring, i)
  if (!g) return 'An dieser Ecke laufen die Kanten fast gerade durch bzw. sie ist spitz: nicht rundbar.'
  const nr = g.nachbar + 1, bg = g.bogen ? `Bogen der Punkte ${g.bogen[0] + 1}–${g.bogen[1] + 1}` : ''
  if (g.bogen && g.bogenNachM === 0)
    return `Die Kante bis zum ${bg} ist nur ${f1r(g.kanteM)} m lang; für mehr Radius Ecke ${i + 1} weiter vom Bogen weg schieben.`
  return `Ecke ${nr} liegt ${f1r(g.kanteM)} m entfernt; für mehr Radius Ecke ${nr} verschieben` +
    (g.bogen ? ` (${f1r(g.bogenNachM!)} m danach beginnt der ${bg}).` : '.')
}
