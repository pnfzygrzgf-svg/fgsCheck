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
import { knotenInfo } from '../knotensicht/rechner/knoten'
import { STRASSENTYP_TEXT } from '../knotensicht/rechner/sichtweite'
import { B_INNERORTS_M } from '../knotensicht/rechner/beobachtung'
import { D_MFZ_M } from '../knotensicht/rechner/hauptachsen'
import { faLage, fbLage, fbVeloLage, veloLage } from '../knotensicht/rechner/fahrzeug'
import { kurzHinweise, ksUeberHaupt, KS_DURCHGEHEND, KS_EINBAHN, KS_EINBAHN_VELO } from './kurztexte'
import { fahrstreifenTags } from '../rechner/fahrstreifen'
import { HOEHEN_QUELLE } from '../knotensicht/rechner/neigung'
import { KEINE_ALLE_EINGABEN, TUE_BREITE_MAX, TUE_BREITE_MIN, TEMPO_MIN, TEMPO_MAX, type HoehenVorgabe, type Lage, type Richtung, type RichtungStatus,
  type TueBreiteQuelle, type TuePhase, type TempoAmtlichLinie } from '../knotensicht/rechner/typen'
import type { Hindernis } from '../rechner/hindernisse'
import type { KatasterFeld } from '../daten/parkkataster'
import herkunft from '../knotensicht/herkunft.json'
import type { Fall } from '../fall'
import { tueBreiteHandWert, tempoHauptHand, type HandWert } from './texte'
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
/** Fahrstreifen je Richtung eines Arms nach den OSM-Tags seines Wegs (grösserer Wert der beiden Richtungen); ohne Angabe 1 (Annahme) */
function fsVon(osm: OsmDaten, a: { wid: number; name: string } | null): KsFahrstreifen {
  const t = (a && osm.wege.find(w => w.id === a.wid)?.tags) ?? {}
  const n = [fahrstreifenTags(t, true), fahrstreifenTags(t, false)].flatMap(x => (x ? [x[0]] : []))
  const tag = ['lanes', 'lanes:forward', 'lanes:backward', 'oneway'].filter(k => t[k]).map(k => `${k}=${t[k]}`).join(', ')
  return n.length ? { n: Math.max(...n), quelle: 'osm', strasse: strassenName(a?.name), tag } : { n: 1, quelle: 'annahme', strasse: strassenName(a?.name), tag }
}

/** Herkunft der Rechnung (Panel, Bericht) */
export const KS_QUELLE = `SichtweitenCheck ${herkunft.version} (${herkunft.commit.slice(0, 7)})`

export interface KsTeil { soll: number; ist: number; status: RichtungStatus; verdecker: string | null
  /** frei bis ans Ende der geprüften Strecke (ist = mindestens) */
  bisEnde: boolean }
/** Herkunft des Tempos einer Richtung: von Hand (Bedarf), Geoportal (V_sig), OSM, angenommen (ohne Angabe) */
export type KsTempoHerkunft = 'hand' | 'geoportal' | 'osm' | 'annahme'
export interface KsRichtung {
  richtung: Richtung; lage: Lage; strasse: string
  tempo: number; tempoQuelle: string; tempoHerkunft: KsTempoHerkunft
  /** Phase Fahrbahn: Auto (Tab. 1, massgebender Wert als Soll) und Velo (Tab. 3); null = kein Verkehr dieser Art von dieser Seite */
  auto: KsTeil | null; velo: KsTeil | null
  /** Phase Trottoir (Tab. 2); null = nicht geprüft */
  trottoir: (KsTeil & { neigung: number }) | null
  keinGrund: string | null
  /** kurze Hinweise je Phase (kurztexte.ts) */
  hinweise: { fahrbahn: string[]; trottoir: string[] }
}
export interface KsDreieck { art: 'auto' | 'velo' | 'trottoir'; lage: Lage; frei: P[]; verdeckt: P[] }
/** Fahrzeug der Knotensicht für die Karte (27.10.2026, wie der SichtweitenCheck): F_B wartend auf der Zufahrt je Phase (Lenker bei D' bzw.
 * D), F_A am Ende der Sichtweite A je Richtung (Auto, Velo auf dem Radstreifen nach Tab. 3); Mitte und Fahrtrichtung, Tooltip */
export interface KsFahrzeug { art: 'auto' | 'velo'; rolle: 'fb' | 'fa'; mitte: P; richtung: P; text: string }
export interface Knotensicht {
  quelle: string
  /** Streifen, an dem gerechnet wurde (Querung mit Teilstreifen: einmal je Querung) */
  streifenId: string
  knoten: number; zufahrt: string; zufahrtName: string
  breite: number; breiteQuelle: TueBreiteQuelle; laenge: number; einbiegewinkel: number
  phaseTrottoir: TuePhase; phaseFahrbahn: TuePhase
  richtungen: KsRichtung[]
  /** Ergebnis für die Frage im Bedarf: true = beide Phasen genügen (mindestens der massgebende Wert), false = beide Phasen beurteilt und
   * eine genügt nicht, null = nicht eindeutig (eine Phase ohne Prüfung, unklar) */
  ok: boolean | null
  /** Gründe, warum das Ergebnis unsicher ist (AV-Ausschnitt, unebenes Profil, durchgehende Strasse): keine Vorbelegung */
  unklar: string[]
  /** Zufahrt auf der durchgehenden Strasse (Überfahrt gehört über die einmündende Strasse) */
  durchgehend: boolean
  /** Längsneigung aus dem Höhenmodell in allen Profilen (sonst 0 % angenommen) */
  neigungGemessen: boolean
  /** wesentliche Annahmen (Breite, Tempo, Neigung): Quelle «Annahme» im Bedarf */
  annahmeGrund: string[]
  /** kurze Annahmen (eigene Texte) und Hinweise zur ganzen Knotensicht (kurztexte.ts) */
  annahmen: string[]; hinweise: string[]
  karte: { D: P; Dtrottoir: P | null; vorderkante: P; hinterkante: P; kanten: [P, P][]; dreiecke: KsDreieck[]; fahrzeuge?: KsFahrzeug[] }
  /** Linien der Höhenprofile (App lädt sie und rechnet mit hoehen[hoehenSchluessel] neu) */
  profile: Partial<Record<keyof HoehenVorgabe, P[]>>
  hoehenSchluessel: string
  /** Fahrstreifen je Richtung der Seitenstrasse (Zufahrt) und der Hauptstrasse am Knoten (Vorbelegung im Bedarf; 27.10.2026) */
  fahrstreifen?: { seite: KsFahrstreifen; haupt: KsFahrstreifen | null }
}
/** Fahrstreifen je Richtung einer Strasse am Knoten nach OSM (lanes, lanes:forward/backward, oneway), sonst 1 als Annahme */
export interface KsFahrstreifen { n: number; quelle: 'osm' | 'annahme'; strasse: string; tag: string }
/** Streifen quer über die Hauptstrasse statt über die Seitenstrasse (27.10.2026): keine Knotensicht, Hinweis, Vorbelegung «quert die
 * Hauptstrasse»; Namen der beiden Strassen */
export interface KsUeberHaupt { haupt: string; seite: string }
export type KnotensichtAntwort = Knotensicht | { fehler: string; ohneZufahrt?: true; ueberHauptstrasse?: KsUeberHaupt }

export interface KsDaten {
  osm: OsmDaten; av: AvFlaeche[]; kx?: Kontext
  /** AV ohne Flächen (Plan): Zuständigkeit der Stadt Bern (fehlt: av) */
  avBestand?: AvFlaeche[]
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
export interface KsStreifen { fgsId?: string; p0: P; p1: P; rand: [P, P]; breite: number | HandWert | null
  /** Tempo der Hauptstrasse von Hand (Bedarf), km/h */
  tempoHand?: number | HandWert | null }

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

const teil = (status: RichtungStatus, soll: number, ist: number, v: { name: string } | null, bisEnde: boolean): KsTeil =>
  ({ soll, ist: Math.round(ist * 10) / 10, status, verdecker: v?.name ?? null, bisEnde })
const klar = (s: RichtungStatus) => s === 'erfuellt' || s === 'massgebend' || s === 'nicht_erfuellt'
const gut = (s: RichtungStatus) => s === 'erfuellt' || s === 'massgebend'
const f2 = (x: number) => x.toFixed(2).replace('.', ',')
/** Strassenname ohne Armnummer; ohne Namen nie die OSM-Klasse */
const strassenName = (name: string | undefined) => name?.trim() || 'Strasse ohne Namen'
const HERKUNFT_WORT: Record<KsTempoHerkunft, string> = { hand: 'von Hand', geoportal: 'Geoportal', osm: 'OSM', annahme: 'angenommen' }

/** Knotensicht einer Trottoirüberfahrt am Streifen; z: Zufahrt (sonst gesucht) */
export function knotensichtTue(d: KsDaten, s: KsStreifen, z0?: { knoten: number; zufahrt: string } | null): KnotensichtAntwort {
  const kx = d.kx ?? kontextBauen(d.osm, d.av)
  const z = z0 ?? zufahrtFinden(kx, s)
  if (!z) return { fehler: `kein Knoten mit gequerter Einmündung bis ${KNOTEN_M} m vom Streifen (OSM)`, ohneZufahrt: true }
  const kp = kx.netz.p(z.knoten)
  // Streifen quer über die Hauptstrasse (27.10.2026): die Achse zwischen den Enden schneidet einen anderen Arm des Knotens; dann gehört
  // die Überfahrt quer über die Seitenstrasse, die Knotensicht entfällt
  const info = knotenInfo(kx.netz, z.knoten)
  const zArm = info?.arme.find(a => a.key === z.zufahrt)
  const reichweite = Math.max(...[s.p0, s.p1].map(p => Math.hypot(p[0] - kp[0], p[1] - kp[1]))) + VERL_M
  const gekreuzt = (info?.arme ?? []).filter(a => linieKreuzt(kx.netz.armLinie([a.wid, a.i, a.sd], reichweite), s.p0, s.p1))
  if (gekreuzt.some(a => a.key !== z.zufahrt)) {
    // Hauptstrasse: gekreuzter Arm der Strasse mit Vortritt; Seitenstrasse: gekreuzter Arm ohne Vortritt (sonst die gefundene Zufahrt)
    const vt = (a: { key: string }) => !!info?.vortritt?.includes(a.key)
    const h = gekreuzt.find(vt) ?? gekreuzt.find(a => a.key !== z.zufahrt)!
    const sArm = gekreuzt.find(a => !vt(a) && a !== h) ?? (zArm && zArm !== h ? zArm : null)
    const haupt = strassenName(h.name), seite = strassenName(sArm?.name)
    return { fehler: ksUeberHaupt(haupt, seite), ueberHauptstrasse: { haupt, seite } }
  }
  // Fahrstreifen je Richtung nach OSM: Seitenstrasse = Zufahrt, Hauptstrasse = ein Arm der Strasse mit Vortritt
  const hArm = info?.arme.find(a => a.key !== z.zufahrt && info.vortritt?.includes(a.key)) ?? null
  const fahrstreifen = { seite: fsVon(d.osm, zArm ?? null), haupt: hArm ? fsVon(d.osm, hArm) : null }
  // Zuständigkeit nach der AV ohne Flächen (Plan)
  const tempoAmtlich = d.vsig && bernZustaendig(kp, d.avBestand ?? d.av) ? vsigRechnung(d.vsig.linien, d.vsig.bereich.mitte, d.vsig.bereich.radiusM) : null
  const bh = typeof s.breite === 'number' ? { wert: s.breite, annahme: false } : s.breite
  const breite = bh && bh.wert >= TUE_BREITE_MIN && bh.wert <= TUE_BREITE_MAX ? bh.wert : null
  const tv = typeof s.tempoHand === 'number' ? { wert: s.tempoHand, annahme: false } : s.tempoHand ?? null
  const th = tv && tv.wert >= TEMPO_MIN && tv.wert <= TEMPO_MAX
    ? { art: 'signalisiert' as const, wert: tv.wert, begruendung: 'Tempo der Hauptstrasse im Bedarf' } : null
  const hindernisse = zaehlend(d)
  const rechne = (hoehen: HoehenVorgabe | null) => rechneKnoten(d.osm, d.av, {
    knoten: z.knoten, zufahrt: z.zufahrt,
    eingaben: { ...KEINE_ALLE_EINGABEN, tempo: { links: th, rechts: th }, trottoirueberfahrt: { breite } },
    hindernisse: { hindernisse, verworfen: d.verworfen, park: null, baeume: null },
    avZentrum: d.avZentrum, hoehen, tempoAmtlich,
  }, kx, d.avRadius)
  // Längsneigung je «Knoten|Zufahrt|Abstand des hinteren Rands» (die Gehlinie hängt daran): erst ohne, dann mit dem passenden Profil
  let r = rechne(null)
  const b0 = r.ergebnis?.trottoirueberfahrt?.abstand
  const hoehenSchluessel = `${z.knoten}|${z.zufahrt}|${b0 !== undefined ? f2(b0) : ''}`
  const hoehen = d.hoehen?.[hoehenSchluessel] ?? null
  if (hoehen) r = rechne(hoehen)
  const e = r.ergebnis, t = e?.trottoirueberfahrt
  if (!e || !t) return { fehler: r.meldungen.join(' ') || 'Knotensicht nicht gerechnet' }
  const arme = new Map((r.knoten?.arme ?? []).map(a => [a.key, a]))
  const tp = e.trottoirPruefung
  const herkunft = (rr: (typeof e.richtungen)[number]): KsTempoHerkunft => rr.tempoArt !== null ? (tv?.annahme ? 'annahme' : 'hand') : rr.tempoAnnahme ? 'annahme'
    : tempoAmtlich && rr.tempoQuelle.startsWith(tempoAmtlich.quelle) ? 'geoportal' : 'osm'
  const unklar: string[] = []
  const richtungen: KsRichtung[] = e.richtungen.map(rr => {
    const tr = tp?.richtungen.find(x => x.richtung === rr.richtung)
    const hf = kurzHinweise([...rr.hinweise, ...(rr.velo?.hinweise ?? [])]), ht = kurzHinweise(tr?.hinweise ?? [])
    unklar.push(...hf.unklar, ...ht.unklar)
    return { richtung: rr.richtung, lage: rr.lage, strasse: strassenName(arme.get(rr.arm)?.name), tempo: rr.tempo, tempoQuelle: rr.tempoQuelle,
      tempoHerkunft: herkunft(rr),
      auto: rr.status === 'keine_zufahrt' ? null : teil(rr.status, rr.massgebend, rr.vorhanden, rr.verdecker, rr.bisEnde),
      velo: rr.velo ? teil(rr.velo.status, rr.velo.A, rr.velo.vorhanden, rr.velo.verdecker, rr.velo.bisEnde) : null,
      trottoir: tr ? { ...teil(tr.status, tr.A, tr.vorhanden, tr.verdecker, tr.bisEnde), neigung: tr.neigung } : null,
      keinGrund: rr.keinGrund ?? null, hinweise: { fahrbahn: hf.texte, trottoir: ht.texte } }
  })
  const allg = kurzHinweise(e.hinweise)
  unklar.push(...allg.unklar)
  // durchgehende Strasse (Feld des Kerns): die Überfahrt gehört über die einmündende Strasse; keine Vorbelegung, ein kurzer Hinweis
  const durchgehend = t.durchgehend === true
  if (durchgehend && !allg.texte.includes(KS_DURCHGEHEND)) allg.texte.unshift(KS_DURCHGEHEND)
  if (durchgehend && !unklar.includes(KS_DURCHGEHEND)) unklar.push(KS_DURCHGEHEND)
  // Einbahn vom Knoten weg (Arm der Zufahrt nach OSM): ohne Velo gegen die Einbahn fährt niemand aus (kein Ergebnis); mit Velo prüft der
  // Kern die Sicht der Velofahrenden
  const einbahnWeg = arme.get(e.zufahrt)?.zufluss === false
  if (einbahnWeg && !e.zufahrtVelo) { allg.texte.unshift(KS_EINBAHN); unklar.push(KS_EINBAHN) }
  else if (einbahnWeg) allg.texte.unshift(KS_EINBAHN_VELO)
  // gemessen: alle geprüften Profile (Richtungen mit Auto- bzw. Veloverkehr, Trottoir) mit Neigung aus dem Höhenmodell
  const gemessen = (m: { i: number | null } | undefined) => !!m && m.i !== null
  const neigungGemessen = !!hoehen && e.richtungen.every(rr => (rr.status === 'keine_zufahrt' && !rr.velo) || rr.neigungHand ||
    gemessen(hoehen[rr.richtung])) && (!tp || gemessen(hoehen.trottoir))
  const mitVerkehr = richtungen.filter(x => x.auto || x.velo)
  const annahmeGrund = [...(t.breiteQuelle === 'annahme' || (t.breiteQuelle === 'eingabe' && bh?.annahme) ? ['Breite angenommen'] : []),
    ...(mitVerkehr.some(x => x.tempoHerkunft === 'annahme') ? ['Tempo angenommen'] : []),
    ...(mitVerkehr.some(x => x.tempoHerkunft === 'osm') ? ['Tempo nach OSM'] : []),
    ...(neigungGemessen ? [] : ['Längsneigung 0 % angenommen'])]
  const ok = unklar.length || !klar(t.phaseTrottoir.status) || !klar(t.phaseFahrbahn.status) ? null
    : gut(t.phaseTrottoir.status) && gut(t.phaseFahrbahn.status)
  const dreiecke: KsDreieck[] = [
    ...e.richtungen.flatMap(rr => [...(rr.status !== 'keine_zufahrt' ? [{ art: 'auto' as const, lage: rr.lage, frei: rr.dreieckFrei,
      verdeckt: rr.dreieckVerdeckt }] : []),
      ...(rr.velo ? [{ art: 'velo' as const, lage: rr.lage, frei: rr.velo.dreieckFrei, verdeckt: rr.velo.dreieckVerdeckt }] : [])]),
    ...(tp?.richtungen ?? []).map(x => ({ art: 'trottoir' as const, lage: x.lage, frei: x.dreieckFrei, verdeckt: x.dreieckVerdeckt }))]
  // Vorder- und Hinterkante der Überfahrt für die Karte: entlang der Hauptstrasse (Richtung der ersten Fahr- bzw. Gehlinie), so lang
  // wie der Streifen
  const achse = [...e.richtungen.flatMap(rr => [rr.achse, rr.velo?.achse ?? []]), ...(tp?.richtungen ?? []).map(x => x.achse)].find(a => a.length >= 2)
  const halb = Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]) / 2
  const u = achse ? einheit([achse[achse.length > 3 ? 3 : 1][0] - achse[0][0], achse[achse.length > 3 ? 3 : 1][1] - achse[0][1]]) : null
  const kante = (p: P): [P, P] => [[p[0] - u![0] * halb, p[1] - u![1] * halb], [p[0] + u![0] * halb, p[1] + u![1] * halb]]
  // Fahrzeuge (27.10.2026): F_B je Phase mit dem Lenker beim Beobachtungspunkt (Velo gegen die Einbahn: das Velo), F_A am Ende von A
  const fahrzeuge: KsFahrzeug[] = []
  const voraus = (p: P): P => [p[0] + e.fbRichtung[0], p[1] + e.fbRichtung[1]]
  const fb = (Dachse: P, wo: string) => {
    const [mitte, richtung] = e.zufahrtVelo ? fbVeloLage(Dachse, voraus(Dachse)) : fbLage(Dachse, voraus(Dachse))
    fahrzeuge.push({ art: e.zufahrtVelo ? 'velo' : 'auto', rolle: 'fb', mitte, richtung,
      text: `wartendes ${e.zufahrtVelo ? 'Velo' : 'Fahrzeug'}, Auge der Ausfahrenden hinter dem ${wo} Rand` })
  }
  if (tp) fb(tp.Dachse, 'hinteren')
  fb(e.Dachse, 'vorderen')
  for (const rr of e.richtungen) {
    const seite = rr.lage === 'gegenueber' ? 'von gegenüber' : rr.lage
    const fa = rr.status !== 'keine_zufahrt' ? faLage(rr.sichtpunkte, Math.min(rr.massgebend, rr.sichtpunkte.length - 1)) : null
    if (fa) fahrzeuge.push({ art: 'auto', rolle: 'fa', mitte: fa[0], richtung: fa[1], text: `Fahrzeug am Ende der nötigen Sichtweite, ${seite}` })
    const vl = rr.velo ? veloLage(rr.velo.sichtpunkte, Math.min(rr.velo.A, rr.velo.sichtpunkte.length - 1)) : null
    if (vl) fahrzeuge.push({ art: 'velo', rolle: 'fa', mitte: vl[0], richtung: vl[1], text: `Velo am Ende der nötigen Sichtweite, ${seite}` })
  }
  const profile: Knotensicht['profile'] = {}
  for (const rr of e.richtungen) if (rr.profilLinie.length >= 2) profile[rr.richtung] = rr.profilLinie
  if (e.zufahrtProfil.length >= 2) profile.zufahrt = e.zufahrtProfil
  if (e.trottoirProfil.length >= 2) profile.trottoir = e.trottoirProfil
  // eigene kurze Annahmen (statt der Texte des Kerns)
  const annahmen = [
    e.regelung === 'stop' ? 'Ausfahrt mit Stop (OSM).' : 'Ausfahrt ohne Vortritt (Trottoirüberfahrt).',
    `${e.zufahrtVelo ? 'Auge der Velofahrenden auf ihrer Achse (gegen die Einbahn)' : 'Auge der Ausfahrenden am Fahrersitz'}, ` +
      `${f2(e.B)} m hinter dem vorderen Rand${e.radwegRand ? ' bzw. dem Radweg' : ''} (Fahrbahn) und ${f2(B_INNERORTS_M)} m hinter dem ` +
      'hinteren Rand (Trottoir).',
    `Gehlinie ${f2(t.gehlinie)} m vor dem hinteren Rand der Überfahrt; Fahrlinie der Autos ${f2(D_MFZ_M)} m vom rechten Fahrbahnrand.`,
    `Tempo ${mitVerkehr.map(x => `${x.lage === 'gegenueber' ? 'von gegenüber' : `von ${x.lage}`} ${x.tempo} km/h (${HERKUNFT_WORT[x.tempoHerkunft]})`).join(', ') || '–'}.`,
    neigungGemessen ? 'Längsneigung aus dem Höhenmodell (swissALTI3D).' : 'Längsneigung 0 % (Höhenmodell nicht geladen bzw. nicht verfügbar).',
    `Strassentyp der Hauptstrasse: ${STRASSENTYP_TEXT[e.strasse.typ]} (nach OSM).`,
    `Sichthindernisse: Gebäude der AV${hindernisse.length ? ` und ${hindernisse.length} weitere (von Hand, Bäume aus dem Baumkataster, ` +
      'amtliche Parkfelder)' : ''}; Parkfelder gelten als belegt.`,
  ]
  return {
    quelle: KS_QUELLE, streifenId: s.fgsId ?? '', knoten: z.knoten, zufahrt: e.zufahrt, zufahrtName: strassenName(arme.get(e.zufahrt)?.name),
    breite: t.breite, breiteQuelle: t.breiteQuelle, laenge: t.laenge, einbiegewinkel: e.einbiegewinkel,
    phaseTrottoir: t.phaseTrottoir, phaseFahrbahn: t.phaseFahrbahn, richtungen, ok, unklar: [...new Set(unklar)], durchgehend, neigungGemessen,
    annahmeGrund, annahmen, hinweise: allg.texte,
    karte: { D: e.D, Dtrottoir: tp?.D ?? null, vorderkante: t.vorderkante, hinterkante: t.hinterkante,
      kanten: u ? [kante(t.vorderkante), kante(t.hinterkante)] : [], dreiecke, fahrzeuge },
    profile, hoehenSchluessel, fahrstreifen,
  }
}

/** Herkunft der Neigung: aus dem Höhenmodell (Text der Messung beginnt mit der Quelle) */
export const ausHoehenmodell = (quelle: string): boolean => quelle.startsWith(HOEHEN_QUELLE)

/** Daten für die Knotensicht aus den Rohdaten des Workers (Overpass, AV-GeoJSON) */
export function ksDatenAusRoh(osmRoh: unknown, avRoh: GeoJson, rest: Omit<KsDaten, 'osm' | 'av' | 'kx' | 'avBestand'>, av?: AvFlaeche[]): KsDaten {
  const osm = osmParsen(osmRoh as Parameters<typeof osmParsen>[0]), bestand = avParsen(avRoh), a = av ?? bestand
  return { ...rest, osm, av: a, avBestand: bestand, kx: kontextBauen(osm, a) }
}



/** Worker: Knotensicht je Querung (Teilstreifen auf einer Achse, gleicher Übergang) mit der Wahl «Trottoirüberfahrt» anfügen: die
 * Zufahrt wird über alle Teile gesucht (ein Teil ohne gequerte Einmündung hindert nicht), gerechnet wird einmal; jeder Teil der Querung
 * trägt dasselbe Ergebnis. Andere Streifen bleiben unberührt */
export function knotensichtAnfuegen(r: { streifen: StreifenErgebnis[] }, roh: { osm: unknown; av: GeoJson }, fall: Fall,
  rest: { park: KsDaten['park']; baeume?: KsDaten['baeume']; vsig: { linien: TempoAmtlichLinie[]; bereich: { mitte: P; radiusM: number } } | null; avZentrum: P
    avRadius: number; hoehen: KsDaten['hoehen'] }): void {
  const tue = r.streifen.filter(s => s.trottoirueberfahrt)
  if (!tue.length) return
  const fehler = (e: unknown) => ({ fehler: `Knotensicht nicht gerechnet (${String((e as Error)?.message ?? e)})` })
  try {
    // Flächen (Plan) von Hand wirken wie in der übrigen Rechnung (verschobene Bordkante, geplantes Trottoir); vorgezogener Seitenraum:
    // nur Plan-Flächen der Art Trottoir (wie rechneFall)
    const plan = fall.flaechenPlan?.length ? avMitPlan(avParsenFgs(roh.av), fall.flaechenPlan) : null
    const seitenraum = plan ? plan.teile.filter(t => t.standard?.typ === 'seitenraum' && t.art === 'trottoir').map(t => t.poly) : []
    const d = ksDatenAusRoh(roh.osm, roh.av, { ...rest, seitenraum, vsig: rest.vsig ? { linien: rest.vsig.linien, bereich: { mitte: rest.vsig.bereich.mitte,
      radiusM: rest.vsig.bereich.radiusM } } : null, hindernisse: fall.hindernisse, verworfen: Object.keys(fall.vorschlaege) }, plan?.av)
    const breite = tueBreiteHandWert(fall), tempoHand = tempoHauptHand(fall)
    const gruppen = new Map<string, StreifenErgebnis[]>()
    for (const s of tue) gruppen.set(s.uebergangId, [...(gruppen.get(s.uebergangId) ?? []), s])
    for (const teile of gruppen.values()) {
      let ks: KnotensichtAntwort
      try {
        const kand = teile.map(s => ({ s, z: zufahrtFinden(d.kx!, s) })).filter(x => x.z)
        const best = kand.sort((a, b) => a.z!.d - b.z!.d)[0]
        ks = best ? knotensichtTue(d, { fgsId: best.s.fgsId, p0: best.s.p0, p1: best.s.p1, rand: best.s.rand, breite, tempoHand }, best.z)
          : { fehler: `kein Knoten mit gequerter Einmündung bis ${KNOTEN_M} m vom Streifen (OSM)`, ohneZufahrt: true }
        // Teile queren verschiedene Einmündungen: gerechnet wird die nächste, mit Hinweis
        if (!('fehler' in ks) && new Set(kand.map(x => `${x.z!.knoten}|${x.z!.zufahrt}`)).size > 1)
          ks.hinweise.unshift(`Die Teilstreifen queren verschiedene Einmündungen: gerechnet für ${ks.zufahrtName} (am nächsten beim Streifen).`)
      } catch (e) { ks = fehler(e) }
      for (const s of teile) s.knotensicht = ks
    }
  } catch (e) {
    for (const s of tue) s.knotensicht = fehler(e)
  }
}
