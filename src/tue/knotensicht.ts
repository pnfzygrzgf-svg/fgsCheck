// ── Knotensicht an einer Trottoirüberfahrt (K2, 23.10.2026): Adapter fgsCheck → Kern des SichtweitenCheck (src/knotensicht) ──
//
// Für jeden Streifen mit der Wahl «Trottoirüberfahrt» rechnet der Kopie-Kern (rechneKnoten im Modus Trottoirüberfahrt) die Knotensicht
// der Einbiegenden in zwei Phasen: vom hinteren Rand der Überfahrt aufs Trottoir, vom vorderen Rand zur Fahrbahn.
// Eingaben aus den Daten, die fgsCheck schon geladen hat:
// - Knoten und Zufahrt: OSM-Knoten mit mindestens drei Strassenarmen (Kern knotenInfo) höchstens KNOTEN_M von der Streifenachse, auf
//   einem Weg, den die Streifenachse quert (netz.schnitte); die Zufahrt ist der Arm dieses Wegs auf der Seite des Streifens.
// - Breite der Überfahrt: von Hand (Bedarf «Breite der Trottoirüberfahrt»), sonst wie im Kern (AV quer, schmaleres angrenzendes
//   Trottoir begrenzt auf 2,00 bis 3,50 m, Annahme 2,00 m).
// - Tempo: V_sig des Geoportals Stadt Bern (wie die übrige fgsCheck-Rechnung; nur wenn die AV-Fläche unter dem Knoten zur Stadt Bern
//   gehört), sonst OSM.
// - Hindernisse wie in der Sichtprüfung von fgsCheck (Entscheid 23.10.2026): von Hand gezeichnete (ohne Insel), Bäume aus dem
//   Baumkataster (eingeschaltet, ohne verworfene; zählen sofort, im Kern als Baum mit Palisade) und amtliche Parkfelder ohne verworfene;
//   Parkierung unter einem vorgezogenen Seitenraum entfällt bzw. wird gekürzt (seitenraum.parkOhneSeitenraum). Flächen (Plan) wirken
//   auf die AV wie in der Sichtprüfung (avMitPlan).
// - Längsneigung: Profile aus dem Höhenmodell (App, daten/hoehen der Kopie), je Knoten und Zufahrt; ohne Profile 0 %.
// Das Ergebnis ist schlank und serialisierbar (Worker → App), mit den Linien für die Höhenprofile und den Sichtdreiecken für die Karte.

import type { P } from '../geo'
import { abstandStrecke } from '../knotensicht/geo'
import { osmParsen, type OsmDaten } from '../knotensicht/daten/osm'
import { avParsen, type AvFlaeche, type GeoJson } from '../knotensicht/daten/av'
import { vsigRechnung, bernZustaendig } from '../knotensicht/daten/vsig'
import { kontextBauen, rechneKnoten, type Kontext } from '../knotensicht/rechner/rechnen'
import { knotenInfo, armText } from '../knotensicht/rechner/knoten'
import { HOEHEN_QUELLE } from '../knotensicht/rechner/neigung'
import { KEINE_ALLE_EINGABEN, TUE_BREITE_MAX, TUE_BREITE_MIN, type HoehenVorgabe, type Lage, type Richtung, type RichtungStatus,
  type TueBreiteQuelle, type TuePhase, type TempoAmtlichLinie } from '../knotensicht/rechner/typen'
import type { Hindernis } from '../rechner/hindernisse'
import type { KatasterFeld } from '../daten/parkkataster'
import herkunft from '../knotensicht/herkunft.json'
import type { Fall } from '../fall'
import { tueBreiteHand } from './texte'
import type { StreifenErgebnis } from '../rechner/typen'
import { avParsen as avParsenFgs } from '../daten/av'
import { avMitPlan } from '../rechner/planflaechen'
import { parkOhneSeitenraum } from '../rechner/seitenraum'
import { BAUM_STAMM_M } from '../rechner/hindernisse'
import type { Multi } from '../rechner/poly'
import type { KatasterBaum } from '../daten/baumkataster'

/** Knoten höchstens so weit von der Streifenachse (wie automatik.AUTO.knotenM) */
export const KNOTEN_M = 20
/** Streifenachse über die Bordkanten hinaus verlängert, um den gequerten Weg zu finden [m] */
const VERL_M = 1
/** Armlinie so weit über den Abstand des Knotens hinaus verfolgt [m] */
const ARM_REICHWEITE_M = 15
/** Schneidet die Linie die Strecke A–B? */
function linieKreuzt(l: P[], A: P, B: P): boolean {
  const x = (o: P, p: P, q: P) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
  for (let i = 0; i + 1 < l.length; i++) {
    const c = l[i], d = l[i + 1]
    if (x(A, B, c) * x(A, B, d) <= 0 && x(c, d, A) * x(c, d, B) <= 0 && (x(A, B, c) !== 0 || x(A, B, d) !== 0)) return true
  }
  return false
}
/** Herkunft der Rechnung (Panel, Bericht) */
export const KS_QUELLE = `SichtweitenCheck ${herkunft.version} (${herkunft.commit.slice(0, 7)})`

export interface KsTeil { soll: number; ist: number; status: RichtungStatus; verdecker: string | null }
export interface KsRichtung {
  richtung: Richtung; lage: Lage; strasse: string
  tempo: number; tempoQuelle: string; tempoAnnahme: boolean
  /** Phase Fahrbahn: Auto (Tab. 1, massgebender Wert als Soll) und Velo (Tab. 3); null = kein Verkehr dieser Art von dieser Seite */
  auto: KsTeil | null; velo: KsTeil | null
  /** Phase Trottoir (Tab. 2); null = nicht geprüft */
  trottoir: (KsTeil & { neigung: number }) | null
  keinGrund: string | null
}
export interface KsDreieck { art: 'auto' | 'velo' | 'trottoir'; lage: Lage; frei: P[]; verdeckt: P[] }
export interface Knotensicht {
  quelle: string
  knoten: number; knotenName: string; zufahrt: string; zufahrtName: string
  breite: number; breiteQuelle: TueBreiteQuelle; breiteText: string; laenge: number; einbiegewinkel: number
  regelungText: string
  phaseTrottoir: TuePhase; phaseFahrbahn: TuePhase
  richtungen: KsRichtung[]
  /** Ergebnis für die Frage im Bedarf: true = beide Phasen erfüllt (mindestens der massgebende Wert), false = beide Phasen beurteilt und
   * eine nicht erfüllt, null = nicht eindeutig (eine Phase ohne Prüfung) */
  ok: boolean | null
  /** Längsneigung aus dem Höhenmodell in allen Profilen (sonst 0 % angenommen) */
  neigungGemessen: boolean
  /** wesentliche Annahmen (Breite angenommen, Tempo angenommen, Neigung 0 %): Quelle «Annahme» im Bedarf */
  annahmeGrund: string[]
  annahmen: string[]; hinweise: string[]
  karte: { D: P; Dtrottoir: P | null; vorderkante: P; hinterkante: P; dreiecke: KsDreieck[] }
  /** Linien der Höhenprofile (App lädt sie und rechnet mit hoehen[hoehenSchluessel] neu) */
  profile: Partial<Record<keyof HoehenVorgabe, P[]>>
  hoehenSchluessel: string
}
export type KnotensichtAntwort = Knotensicht | { fehler: string; ohneZufahrt?: true }

export interface KsDaten {
  osm: OsmDaten; av: AvFlaeche[]; kx?: Kontext
  avZentrum: P; avRadius: number
  /** fgsCheck-Hindernisse des Falls (Insel zählt nicht) und verworfene Vorschläge bzw. amtliche Parkfelder (Ids) */
  hindernisse: Hindernis[]; verworfen: string[]
  park: { felder: KatasterFeld[]; quellenangabe: string } | null
  /** Bäume aus dem Baumkataster (null: abgeschaltet bzw. nicht geladen) */
  baeume?: { baeume: KatasterBaum[]; quellenangabe: string } | null
  /** Flächen der vorgezogenen Seitenräume (Plan, Art Trottoir): Parkierung darunter entfällt */
  seitenraum?: Multi
  /** V_sig-Linien (Geoportal Stadt Bern) mit abgedecktem Bereich; null ausserhalb Berns bzw. nicht geladen */
  vsig: { linien: TempoAmtlichLinie[]; bereich: { mitte: P; radiusM: number } } | null
  /** Längsneigung je Schlüssel «Knoten|Zufahrt» (App) */
  hoehen: Record<string, HoehenVorgabe> | null
}
export interface KsStreifen { p0: P; p1: P; rand: [P, P]; breite: number | null }

const einheit = (v: P): P => { const l = Math.hypot(v[0], v[1]); return l > 0 ? [v[0] / l, v[1] / l] : [1, 0] }

/** Knoten und Zufahrt zum Streifen: Arm (Schlüssel «wid:i:sd») eines Knotens bis KNOTEN_M von der Achse auf einem gequerten Weg */
export function zufahrtFinden(kx: Kontext, s: Pick<KsStreifen, 'p0' | 'p1' | 'rand'>): { knoten: number; zufahrt: string; d: number } | null {
  const n = einheit([s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]])
  const t = [s.p0, s.p1, ...s.rand].map(p => (p[0] - s.p0[0]) * n[0] + (p[1] - s.p0[1]) * n[1])
  const A: P = [s.p0[0] + n[0] * (Math.min(...t) - VERL_M), s.p0[1] + n[1] * (Math.min(...t) - VERL_M)]
  const B: P = [s.p0[0] + n[0] * (Math.max(...t) + VERL_M), s.p0[1] + n[1] * (Math.max(...t) + VERL_M)]
  let best: { knoten: number; zufahrt: string; d: number } | null = null
  // Knoten nahe der Achse; je Arm die Armlinie (folgt dem Weg über Teilungen in OSM hinweg) bis knapp über die Achse hinaus
  for (const [kn, p] of kx.netz.P) {
    const d = abstandStrecke(p, A, B)
    if (d > KNOTEN_M + 1e-9 || (best && d >= best.d)) continue
    const info = knotenInfo(kx.netz, kn)
    if (!info) continue
    const arm = info.arme.find(a => linieKreuzt(kx.netz.armLinie([a.wid, a.i, a.sd], d + ARM_REICHWEITE_M), A, B))
    if (arm) best = { knoten: kn, zufahrt: arm.key, d }
  }
  return best
}

type OhneInsel = Exclude<Hindernis, { art: 'insel' }>
const ohneInsel = (h: Hindernis): h is OhneInsel => h.art !== 'insel'
/** Hindernisse der Knotensicht wie in der Sichtprüfung: von Hand (ohne Insel), Bäume aus dem Baumkataster, amtliche Parkfelder (ohne
 * verworfene; wie im Kern nach den Eingaben), Parkierung unter einem vorgezogenen Seitenraum entfällt bzw. gekürzt */
function zaehlend(d: KsDaten): OhneInsel[] {
  const weg = new Set(d.verworfen), da = new Set(d.hindernisse.map(h => h.id))
  const baeume: Hindernis[] = (d.baeume?.baeume ?? []).filter(b => !weg.has(b.id) && !da.has(b.id))
    .map(b => ({ id: b.id, art: 'baum', p: b.p, stamm: BAUM_STAMM_M, quelle: 'kataster', name: b.name }))
  const amtlich: Hindernis[] = (d.park?.felder ?? []).filter(f => !weg.has(f.id) && f.ring.length >= 3)
    .map(f => ({ id: f.id, art: 'parkfeld', klasse: f.klasse, ring: f.ring, quelle: 'kataster', name: f.name }))
  const alle = [...d.hindernisse, ...baeume, ...amtlich].filter(ohneInsel)
  return d.seitenraum?.length ? parkOhneSeitenraum(alle, d.seitenraum).hindernisse.filter(ohneInsel) : alle
}

const teil = (status: RichtungStatus, soll: number, ist: number, v: { name: string } | null): KsTeil =>
  ({ soll, ist: Math.round(ist * 10) / 10, status, verdecker: v?.name ?? null })
const klar = (s: RichtungStatus) => s === 'erfuellt' || s === 'massgebend' || s === 'nicht_erfuellt'
const gut = (s: RichtungStatus) => s === 'erfuellt' || s === 'massgebend'

/** Knotensicht einer Trottoirüberfahrt am Streifen */
export function knotensichtTue(d: KsDaten, s: KsStreifen): KnotensichtAntwort {
  const kx = d.kx ?? kontextBauen(d.osm, d.av)
  const z = zufahrtFinden(kx, s)
  if (!z) return { fehler: `kein Knoten mit gequerter Einmündung bis ${KNOTEN_M} m vom Streifen (OSM)`, ohneZufahrt: true }
  const kp = kx.netz.p(z.knoten)
  const tempoAmtlich = d.vsig && bernZustaendig(kp, d.av) ? vsigRechnung(d.vsig.linien, d.vsig.bereich.mitte, d.vsig.bereich.radiusM) : null
  const hoehenSchluessel = `${z.knoten}|${z.zufahrt}`
  const hoehen = d.hoehen?.[hoehenSchluessel] ?? null
  const breite = s.breite !== null && s.breite >= TUE_BREITE_MIN && s.breite <= TUE_BREITE_MAX ? s.breite : null
  const r = rechneKnoten(d.osm, d.av, {
    knoten: z.knoten, zufahrt: z.zufahrt,
    eingaben: { ...KEINE_ALLE_EINGABEN, trottoirueberfahrt: { breite } },
    hindernisse: { hindernisse: zaehlend(d), verworfen: d.verworfen, park: null, baeume: null },
    avZentrum: d.avZentrum, hoehen, tempoAmtlich,
  }, kx, d.avRadius)
  const e = r.ergebnis, t = e?.trottoirueberfahrt
  if (!e || !t) return { fehler: r.meldungen.join(' ') || 'Knotensicht nicht gerechnet' }
  const zArm = r.knoten?.arme.find(a => a.key === e.zufahrt)
  const tp = e.trottoirPruefung
  const richtungen: KsRichtung[] = e.richtungen.map(rr => {
    const tr = tp?.richtungen.find(x => x.richtung === rr.richtung)
    return { richtung: rr.richtung, lage: rr.lage, strasse: rr.strasse, tempo: rr.tempo, tempoQuelle: rr.tempoQuelle, tempoAnnahme: rr.tempoAnnahme,
      auto: rr.status === 'keine_zufahrt' ? null : teil(rr.status, rr.massgebend, rr.vorhanden, rr.verdecker),
      velo: rr.velo ? teil(rr.velo.status, rr.velo.A, rr.velo.vorhanden, rr.velo.verdecker) : null,
      trottoir: tr ? { ...teil(tr.status, tr.A, tr.vorhanden, tr.verdecker), neigung: tr.neigung } : null,
      keinGrund: rr.keinGrund ?? null }
  })
  // gemessen: alle geprüften Profile (Richtungen mit Verkehr, Trottoir) mit Neigung aus dem Höhenmodell
  const gemessen = (m: { i: number | null } | undefined) => !!m && m.i !== null
  const neigungGemessen = !!hoehen && e.richtungen.every(rr => rr.status === 'keine_zufahrt' || rr.neigungHand || gemessen(hoehen[rr.richtung])) &&
    (!tp || gemessen(hoehen.trottoir))
  const annahmeGrund = [...(t.breiteQuelle === 'annahme' ? ['Breite angenommen'] : []),
    ...(richtungen.some(x => x.tempoAnnahme && (x.auto || x.velo)) ? ['Tempo angenommen'] : []),
    ...(neigungGemessen ? [] : ['Längsneigung 0 % angenommen'])]
  const ok = klar(t.phaseTrottoir.status) && klar(t.phaseFahrbahn.status)
    ? gut(t.phaseTrottoir.status) && gut(t.phaseFahrbahn.status) : null
  const dreiecke: KsDreieck[] = [
    ...e.richtungen.flatMap(rr => [...(rr.status !== 'keine_zufahrt' ? [{ art: 'auto' as const, lage: rr.lage, frei: rr.dreieckFrei,
      verdeckt: rr.dreieckVerdeckt }] : []),
      ...(rr.velo ? [{ art: 'velo' as const, lage: rr.lage, frei: rr.velo.dreieckFrei, verdeckt: rr.velo.dreieckVerdeckt }] : [])]),
    ...(tp?.richtungen ?? []).map(x => ({ art: 'trottoir' as const, lage: x.lage, frei: x.dreieckFrei, verdeckt: x.dreieckVerdeckt }))]
  const profile: Knotensicht['profile'] = {}
  for (const rr of e.richtungen) if (rr.profilLinie.length >= 2) profile[rr.richtung] = rr.profilLinie
  if (e.zufahrtProfil.length >= 2) profile.zufahrt = e.zufahrtProfil
  if (e.trottoirProfil.length >= 2) profile.trottoir = e.trottoirProfil
  return {
    quelle: KS_QUELLE, knoten: z.knoten, knotenName: r.knoten?.name ?? `OSM-Knoten ${z.knoten}`, zufahrt: e.zufahrt,
    zufahrtName: zArm ? armText(zArm) : e.zufahrtName,
    breite: t.breite, breiteQuelle: t.breiteQuelle, breiteText: t.breiteText, laenge: t.laenge, einbiegewinkel: e.einbiegewinkel,
    regelungText: t.regelungText, phaseTrottoir: t.phaseTrottoir, phaseFahrbahn: t.phaseFahrbahn, richtungen, ok, neigungGemessen, annahmeGrund,
    annahmen: e.annahmen, hinweise: e.hinweise,
    karte: { D: e.D, Dtrottoir: tp?.D ?? null, vorderkante: t.vorderkante, hinterkante: t.hinterkante, dreiecke },
    profile, hoehenSchluessel,
  }
}

/** Herkunft der Neigung: aus dem Höhenmodell (Text der Messung beginnt mit der Quelle) */
export const ausHoehenmodell = (quelle: string): boolean => quelle.startsWith(HOEHEN_QUELLE)

/** Daten für die Knotensicht aus den Rohdaten des Workers (Overpass, AV-GeoJSON) */
export function ksDatenAusRoh(osmRoh: unknown, avRoh: GeoJson, rest: Omit<KsDaten, 'osm' | 'av' | 'kx'>, av?: AvFlaeche[]): KsDaten {
  const osm = osmParsen(osmRoh as Parameters<typeof osmParsen>[0]), a = av ?? avParsen(avRoh)
  return { ...rest, osm, av: a, kx: kontextBauen(osm, a) }
}



/** Worker: Knotensicht an jedem Streifen mit der Wahl «Trottoirüberfahrt» anfügen (andere Streifen bleiben unberührt) */
export function knotensichtAnfuegen(r: { streifen: StreifenErgebnis[] }, roh: { osm: unknown; av: GeoJson }, fall: Fall,
  rest: { park: KsDaten['park']; baeume?: KsDaten['baeume']; vsig: { linien: TempoAmtlichLinie[]; bereich: { mitte: P; radiusM: number } } | null; avZentrum: P
    avRadius: number; hoehen: KsDaten['hoehen'] }): void {
  const tue = r.streifen.filter(s => s.trottoirueberfahrt)
  if (!tue.length) return
  try {
    // Flächen (Plan) von Hand wirken wie in der übrigen Rechnung (verschobene Bordkante, geplantes Trottoir)
    // vorgezogener Seitenraum: nur Plan-Flächen der Art Trottoir (wie rechneFall)
    const plan = fall.flaechenPlan?.length ? avMitPlan(avParsenFgs(roh.av), fall.flaechenPlan) : null
    const av = plan?.av
    const seitenraum = plan ? plan.teile.filter(t => t.standard?.typ === 'seitenraum' && t.art === 'trottoir').map(t => t.poly) : []
    const d = ksDatenAusRoh(roh.osm, roh.av, { ...rest, seitenraum, vsig: rest.vsig ? { linien: rest.vsig.linien, bereich: { mitte: rest.vsig.bereich.mitte,
      radiusM: rest.vsig.bereich.radiusM } } : null, hindernisse: fall.hindernisse, verworfen: Object.keys(fall.vorschlaege) }, av)
    const breite = tueBreiteHand(fall)
    for (const s of tue) {
      try { s.knotensicht = knotensichtTue(d, { p0: s.p0, p1: s.p1, rand: s.rand, breite }) }
      catch (e) { s.knotensicht = { fehler: `Knotensicht nicht gerechnet (${String((e as Error)?.message ?? e)})` } }
    }
  } catch (e) {
    for (const s of tue) s.knotensicht = { fehler: `Knotensicht nicht gerechnet (${String((e as Error)?.message ?? e)})` }
  }
}
