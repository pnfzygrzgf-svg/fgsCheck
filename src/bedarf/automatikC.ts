// ── Bedarfsmodul: Automatik Paket C (21.10.2026) ──
//
// Vorbelegung aus den weiteren Diensten des Geoportals Stadt Bern (Richtplan Fussverkehr, Strassenhierarchie und Strassentypen,
// signalisierte Höchstgeschwindigkeit, Volksschulen und Kindergärten, taktil-visuelle Markierungen, Nutzungszonen, ÖV-Linien) und
// aus OSM (Schulen, Kindergärten, Heime). Daten in daten/*.ts, Geometrie-Hilfen in daten/geoHilfen.ts. Wie Paket A + B: jeder Wert
// trägt Quelle und Herkunft als Text, Annahmen die Quelle «annahme» (im Befund unter «Annahmen»); fehlen Daten, ist ein Dienst
// ausgefallen oder deckt der geladene Ausschnitt den Umkreis nicht, bleibt das Feld offen (mit Hinweis, wo er weiterhilft). Eine
// Handeingabe überschreibt jeden Wert. Die Geoportal-Quelle hat Vorrang vor OSM-Annahmen. Schwellen in AUTO_C (Nutzerentscheide
// 21.10.2026, Abschnitt 24 der Regeln).
//
// Ablauf in vorbelegung.vorbelegen: vsigVorbelegen und zoneNachVsig nach den OSM-Tags (vor «Strecke aus dem Tempo»), danach
// tempoAusHierarchie; strassentypBern geht als geo.strassentyp an die Automatik (B6); automatikC am Schluss. Die Vortrittsrolle an
// Kreuzungen (OSM-Vortrittszeichen) steht in automatik.ts (vortrittRolle), weil sie das OSM-Netz der Automatik braucht.

import { type P, add, sub, dot, dist, einheit, segSchnitt } from '../geo'
import type { StreifenErgebnis } from '../rechner/typen'
import type { Beduerfnis, Quelle, Strassentyp } from './eingaben'
import type { Vorbelegung } from './fallBedarf'
import type { GeoVorbelegung } from './vorbelegung'
import { AUTO, abstandQuerung, eckenVon, linieAbstand, type AutoGeo } from './automatik'
import { GEOPORTAL_BERN, type BernErgebnis } from '../daten/geoportal'
import { imBereich, type Bereich } from '../daten/haltestellen'
import { abstandFlaeche, abstandLinie, flaecheAmPunkt, inFlaeche } from '../daten/geoHilfen'
import { HIERARCHIE_TEXT, type HierarchieTyp, type StrassenhierarchieDaten, type StrassentypCode, type StrassenKlasse } from '../daten/strassenhierarchie'
import { istBauzone, type NzFlaeche } from '../daten/nutzungszonen'
import { TVM_LEITLINIE_STREIFEN } from '../daten/taktil'
import type { SchulOrt } from '../daten/schulen'

/** Schwellen des Pakets C (Abschnitt 24 der Regeln; Annahmen ausser wo vermerkt) */
export const AUTO_C = {
  /** Schule, Kindergarten, Heim bis hier vom Streifen: besonderer Grund für Vortritt (Nutzerentscheid) */
  grundM: 150,
  /** Basisnetz-Linie quert die Fahrbahn bis hier vom Streifen: Querung im Basisnetz (Nutzerentscheid) */
  netzM: 15,
  /** Gehlinie (wunschlinieM) nur bis hier */
  wunschM: 30,
  /** taktil-visuelles Feld bis hier von einem Streifenende (Nutzerentscheid) */
  taktilM: 3,
  /** Leitlinie auf dem Streifen: Linie bis hier vom Streifenumriss (Lagegenauigkeit) */
  leitlinieM: 0.5,
  /** Tramlinie bis hier vom Haltepunkt: der Halt (Geoportal, ohne Bus/Tram) ist ein Tramhalt */
  tramAmHaltM: 15,
  /** Linien längs der gequerten Strasse (Hierarchie, Tempo, Bus): Schnittwinkel mit der Querungsachse mindestens (°) */
  laengsWinkel: 45,
  /** Linien quer zur Strasse (Basisnetz): Winkel des letzten Stücks zur Querungsachse höchstens (°) */
  querWinkel: 45,
  /** Nutzungszonen: Proben auf der Achse und so weit hinter den Bordkanten (m) */
  zonenProbenM: [0, 5, 10],
} as const

/** taktil-visuelle Felder, die eine Querung anzeigen (Aufmerksamkeitsfeld, Blindenquadrat, gepflästert, Abschluss-, Abzweigfeld) */
const TVM_FELD_QUERUNG = [1001, 1002, 1003, 1004, 1005]

type Setze = (pfad: string, wert: unknown, quelle: Quelle, text: string) => void
type FeldHinweis = (pfad: string, text: string) => void

const r1 = (x: number) => Math.round(x * 10) / 10 || 0
const f1 = (x: number) => r1(x).toFixed(1).replace('.', ',')
const ganz = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)]
type Geladen<T> = T & { bereich: Bereich; hinweis?: string }
const geladen = <T>(x: BernErgebnis<T> | null | undefined): Geladen<T> | null => (x && !('fehler' in x) ? x as Geladen<T> : null)
const abgedeckt = (pts: P[], rand: number, b: Bereich) => pts.every(p => imBereich(p, rand, b))

/** Querungsachse über alle Teilstreifen (Bord bis Bord, je 1 m darüber; wie DTV und Automatik): A, B, Richtung u, quer dazu t */
export interface Achse { A: P; B: P; u: P; t: P; mitte: P; L: number }
export function querungsAchse(st: StreifenErgebnis[]): Achse {
  const s0 = st[0], u = einheit(sub(s0.p1, s0.p0))
  const ts = st.flatMap(s => [s.p0, s.p1, ...s.rand]).map(p => dot(sub(p, s0.p0), u))
  const A = add(s0.p0, u, Math.min(...ts) - 1), B = add(s0.p0, u, Math.max(...ts) + 1)
  return { A, B, u, t: [-u[1], u[0]], mitte: add(A, sub(B, A), 0.5), L: dist(A, B) }
}

/** Linien längs der gequerten Strasse: Schnitt mit der Querungsachse, Winkel mindestens AUTO_C.laengsWinkel. Abschnitte stossen an
 * gemeinsamen Punkten an: Stücke um 5 cm verlängert (wie DTV), damit eine Grenze genau auf der Achse beide Abschnitte trifft */
function laengs<T extends { teile: P[][] }>(linien: readonly T[], a: Achse): T[] {
  const sin = Math.sin(AUTO_C.laengsWinkel * Math.PI / 180)
  return linien.filter(l => l.teile.some(z => z.some((p, i) => {
    if (i === 0) return false
    const r = einheit(sub(p, z[i - 1]))
    return Math.abs(r[0] * a.u[1] - r[1] * a.u[0]) >= sin - 1e-9 && !!segSchnitt(a.A, a.B, add(z[i - 1], r, -0.05), add(p, r, 0.05))
  })))
}

/**
 * Abstand (entlang der Strasse, quer zur Streifenachse) einer Linie, die die Fahrbahn quert, bis maxM; null ohne. Quert die Linie
 * beide Bordlinien (Senkrechte durch A bzw. B, je ± maxM): Abstand in der Fahrbahnmitte (0, wenn sie die Streifenachse kreuzt).
 * Endet bzw. beginnt sie auf der Fahrbahn und kommt quer zur Strasse an (letztes Stück höchstens AUTO_C.querWinkel zur Achse):
 * Abstand ihres Endpunkts. Linien längs der Strasse zählen nicht.
 */
export function querAbstand(teile: readonly P[][], a: Achse, maxM: number): number | null {
  const off = (p: P) => dot(sub(p, a.A), a.t)
  const bord = (q: P): number[] => {
    const q0 = add(q, a.t, -maxM), q1 = add(q, a.t, maxM), aus: number[] = []
    for (const z of teile) for (let i = 0; i + 1 < z.length; i++) {
      const s = segSchnitt(q0, q1, z[i], z[i + 1])
      if (s) aus.push(-maxM + s[0] * 2 * maxM)
    }
    return aus
  }
  let best: number | null = null
  const nimm = (d: number) => { if (d <= maxM + 1e-9 && (best === null || d < best)) best = d }
  const oa = bord(a.A), ob = bord(a.B)
  for (const x of oa) for (const y of ob) nimm(x * y <= 0 ? 0 : Math.abs((x + y) / 2))
  const cos = Math.cos(AUTO_C.querWinkel * Math.PI / 180)
  for (const z of teile) {
    if (z.length < 2) continue
    for (const [e, nb] of [[z[0], z[1]], [z[z.length - 1], z[z.length - 2]]] as [P, P][]) {
      const s = dot(sub(e, a.A), a.u)
      if (s < 0 || s > a.L || Math.abs(dot(einheit(sub(e, nb)), a.u)) < cos - 1e-9) continue
      nimm(Math.abs(off(e)))
    }
  }
  return best
}

/** Abstand eines Orts (Schule, Heim) zum Streifen: Punkt bzw. Fläche (Umriss, 0 innerhalb; Korrektur S9) */
export function abstandOrt(o: SchulOrt, st: StreifenErgebnis[]): number {
  if (!o.umriss || o.umriss.length < 3) return abstandQuerung(o.p, st)
  const ecken = st.flatMap(eckenVon)
  return Math.min(...o.umriss.map(p => abstandQuerung(p, st)), ...ecken.map(p => abstandFlaeche(p, [o.umriss!])),
    linieAbstand([...o.umriss, o.umriss[0]], st))
}

/**
 * Abstand eines Orts als Text (Runde 4): bei einer OSM-Fläche, deren Umriss nur das Rechteck ihrer Grenzen ist, mit «Rand des Areals,
 * Grenzrechteck» (das Rechteck kann grösser sein als das Areal), innerhalb «im Areal»; sonst «N m»
 */
export function ortAbstandText(o: SchulOrt, d: number): string {
  if (!o.grenzrechteck) return `${ganz(d)} m`
  return d < 0.5 ? 'im Areal, Grenzrechteck' : `${ganz(d)} m, Rand des Areals, Grenzrechteck`
}

/**
 * Name eines Abschnitts des Geoportals im Text (Runde 5, F3): die Linien stammen aus dem Achsschnitt mit der Querungsachse (gequerter
 * Abschnitt). Heisst er im Geoportal anders als die gequerte Strasse in OSM, nennt der Text beide, damit kein falscher Eindruck entsteht.
 */
export function abschnittName(ls: readonly { strasse: string }[], st: StreifenErgebnis[]): string {
  const namen = uniq(ls.map(l => l.strasse).filter(Boolean))
  if (!namen.length) return ''
  const osm = uniq(st.map(s => s.strasse).filter(Boolean))
  if (!osm.length || namen.every(n => osm.includes(n))) return ` ${namen.join(', ')}`
  return ` auf dem gequerten Abschnitt («${namen.join(', ')}» laut Geoportal, in OSM ${osm.join(', ')})`
}

// ── V_sig (Geoportal) vor OSM ──

/**
 * Signalisiertes Tempo aus V_sig (Geoportal Stadt Bern): Linien über der Querungsachse (Schnitt wie DTV), Grenze zweier Abschnitte:
 * höherer Wert. Vorrang vor OSM (Text nennt einen abweichenden OSM-Wert, dazu ein Hinweis zur Sichtrechnung); leerer V_sig: OSM
 * bleibt; Tempo von Hand bleibt (Hinweis bei Abweichung).
 */
export function vsigVorbelegen(st: StreifenErgebnis[], vsig: GeoVorbelegung['vsig'], w: Vorbelegung, setze: Setze, hinweise: string[]): void {
  if (!vsig) return
  if ('fehler' in vsig) { hinweise.push(`Signalisierte Höchstgeschwindigkeit (${GEOPORTAL_BERN}) nicht erreichbar (${vsig.fehler}): Tempo aus OSM`); return }
  const a = querungsAchse(st)
  if (!abgedeckt([a.A, a.B], 0, vsig.bereich)) return
  const ls = laengs(vsig.linien, a)
  const werte = uniq(ls.map(l => l.vSig).filter((v): v is number => v !== null)).sort((x, y) => x - y)
  if (!werte.length) {
    if (ls.length) hinweise.push(`Signalisierte Höchstgeschwindigkeit über der Querung ohne Wert (${GEOPORTAL_BERN}): Tempo aus OSM`)
    return
  }
  const v = werte[werte.length - 1]
  let text = `Tempo ${v} km/h${abschnittName(ls, st)} (${GEOPORTAL_BERN}, signalisierte Höchstgeschwindigkeit)` +
    (werte.length > 1 ? `; Grenze zweier Abschnitte (${werte.join(' bzw. ')} km/h): höherer Wert` : '')
  // Tempo des Amts für Umwelt weicht ab (Korrektur nach Prüfung Runde 5): nur Hinweis «Tempo prüfen»
  const afu = uniq(ls.filter(l => l.vSig !== null && l.vAfu != null && l.vAfu !== l.vSig).map(l => l.vAfu!))
  if (afu.length) {
    text += `; Amt für Umwelt: ${afu.join(' bzw. ')} km/h, Tempo prüfen`
    hinweise.push(`Tempo prüfen: laut ${GEOPORTAL_BERN} signalisiert ${v} km/h, beim Amt für Umwelt ${afu.join(' bzw. ')} km/h`)
  }
  const alt = w.vSig
  if (alt?.quelle === 'hand') {
    if (alt.wert !== v) hinweise.push(`Signalisiertes Tempo: von Hand ${alt.wert} km/h, laut ${GEOPORTAL_BERN} ${v} km/h`)
    return
  }
  if (alt && alt.wert !== v) {
    // Runde 5 (Nutzerentscheid 21.10.2026): der Sichtrechner rechnet in Bern selbst mit V_sig; eine Abweichung bleibt nur, wo die
    // Linien entlang der Zufahrten ein anderes Tempo tragen als über der Querung bzw. wo sie fehlen
    text += `; Sichtrechner ${alt.wert} km/h (${alt.quelle === 'geoportal' ? 'Geoportal entlang der Zufahrten' : 'OSM bzw. Annahme'})`
    hinweise.push(`Signalisiertes Tempo über der Querung ${v} km/h (${GEOPORTAL_BERN}), der Sichtrechner rechnet entlang der Zufahrten mit ` +
      `${alt.wert} km/h: Tempo der Zufahrten prüfen`)
  }
  setze('vSig', v, 'geoportal', text)
}

/**
 * Strecke oder Zone nach dem Tempo des Geoportals: Tempo bis 30 km/h, OSM-Strecke nur aus maxspeed (ohne Zonenangabe): verworfen
 * (die Strassenhierarchie entscheidet; Rückgabe: Hinweis, falls sie offen bleibt); Tempo ab 40 km/h, OSM-Zone: Strecke (eine Zone hat
 * höchstens 30 km/h), Quelle Geoportal.
 */
export function zoneNachVsig(w: Vorbelegung, setze: Setze): string {
  const vs = w.vSig, tr = w.tempoRegime
  if (vs?.quelle !== 'geoportal' || typeof vs.wert !== 'number' || !tr || tr.quelle !== 'osm') return ''
  if (vs.wert <= 30 && tr.wert === 'strecke' && /ohne Zonenangabe/.test(tr.text)) {
    delete w.tempoRegime
    return `Tempo ${vs.wert} km/h laut ${GEOPORTAL_BERN}, ${tr.text}`
  }
  if (vs.wert >= 40 && tr.wert !== 'strecke')
    setze('tempoRegime', 'strecke', 'geoportal', `Tempo ${vs.wert} km/h laut ${GEOPORTAL_BERN}: Strecke (eine Zone hat höchstens 30 km/h; OSM: ${tr.text})`)
  return ''
}

// ── Strassenhierarchie und Strassentypen (Geoportal) ──

interface HierarchieAnQuerung { typen: HierarchieTyp[]; codes: StrassentypCode[]; klassen: StrassenKlasse[]; namen: string }
/** Hierarchie und Strassentypen der gequerten Strasse (Linien längs über der Querungsachse); null ohne Daten bzw. Abdeckung */
function hierarchieAnQuerung(st: StreifenErgebnis[], sh: BernErgebnis<StrassenhierarchieDaten> | null | undefined): HierarchieAnQuerung | null {
  const d = geladen(sh)
  if (!d?.hierarchie) return null
  const a = querungsAchse(st)
  if (!abgedeckt([a.A, a.B], 0, d.bereich)) return null
  const h = laengs(d.hierarchie, a).filter(l => l.typ && l.typ !== 'nicht_befahrbar')
  const t = d.typen ? laengs(d.typen, a).filter(l => l.typ) : []
  return { typen: uniq(h.map(l => l.typ!)), codes: uniq(t.map(l => l.typ!)), klassen: uniq(t.map(l => l.klasse!)),
    namen: abschnittName(h, st).trim() }
}
/** Strassentyp in Worten (Kann-Punkt: kein Rohcode im Text) */
const TYP_WORT: Record<StrassentypCode, string> = { SS_30: 'Sammelstrasse 30', SS_50: 'Sammelstrasse 50', VS_50_60: 'Verbindungsstrasse 50/60',
  HVS_50_60: 'Hauptverkehrsstrasse 50/60', HVS_80: 'Hauptverkehrsstrasse 80' }
const typText = (h: HierarchieAnQuerung) => (h.codes.length ? `Strassentyp ${h.codes.map(c => TYP_WORT[c]).join(', ')} laut ${GEOPORTAL_BERN}` : '')
const hierText = (h: HierarchieAnQuerung) => `${h.typen.map(x => HIERARCHIE_TEXT[x]).join(' bzw. ')}${h.namen ? (h.namen.startsWith('auf ') ? ` ${h.namen}` : ` (${h.namen})`) : ''}`

/**
 * Tempo 30 ohne Zonenangabe in OSM (Nutzerentscheid 21.10.2026), als Annahme: Quartierstrasse (auch ergänzend) Tempo-30-Zone,
 * Basisnetz Strecke; Quartierverbindungsstrasse bzw. uneinheitlich: offen, Rückgabe = Hinweis. Strassentyp SS_30 stützt die Zone.
 */
export function tempoAusHierarchie(st: StreifenErgebnis[], geo: GeoVorbelegung, w: Vorbelegung, setze: Setze): string {
  if (w.tempoRegime || w.vSig?.wert !== 30) return ''
  const h = hierarchieAnQuerung(st, geo.strassenhierarchie)
  if (!h?.typen.length) return ''
  if (h.typen.length > 1) return `Strassenhierarchie an der Querung uneinheitlich (${hierText(h)}, ${GEOPORTAL_BERN}): Zone oder Strecke wählen`
  const typ = h.typen[0]
  const tt = typText(h)
  if (typ === 'quartier' || typ === 'quartier_ergaenzend') {
    const zusatz = h.codes.includes('SS_30') ? `; Strassentyp Sammelstrasse 30 laut ${GEOPORTAL_BERN} stützt die Zone`
      : tt ? `; ${tt}: prüfen, ob die Strasse zur Zone gehört` : ''
    setze('tempoRegime', 't30_zone', 'annahme', `Tempo 30 ohne Zonenangabe in OSM, ${hierText(h)} laut ${GEOPORTAL_BERN}: Tempo-30-Zone ` +
      `angenommen${zusatz}`)
  } else if (typ === 'basisnetz' || typ === 'autobahn') {
    setze('tempoRegime', 'strecke', 'annahme', `Tempo 30, ${hierText(h)} laut ${GEOPORTAL_BERN}: Strecke angenommen${tt ? `; ${tt}` : ''}`)
  } else if (typ === 'quartierverbindung') return `Quartierverbindungsstrasse laut ${GEOPORTAL_BERN}: Zone oder Strecke wählen`
  return ''
}

/**
 * Strassentyp in Bern (Nutzerentscheid 21.10.2026): Basisnetz verkehrsorientiert, Quartierstrasse (auch ergänzend)
 * siedlungsorientiert, Quartierverbindungsstrasse offen; Strassentypen HVS/VS stützen verkehrs-, SS siedlungsorientiert,
 * Widerspruch: offen. Rückgabe für AutoGeo.strassentyp (Vorrang vor OSM); wert null mit Text: offen mit Hinweis; null ohne Daten.
 */
export function strassentypBern(st: StreifenErgebnis[], sh: GeoVorbelegung['strassenhierarchie']): AutoGeo['strassentyp'] {
  const h = hierarchieAnQuerung(st, sh)
  if (!h?.typen.length) return null
  const offen = (text: string) => ({ wert: null, quelle: 'geoportal' as const, text: `${text}: Durchgangs- oder Quartierstrasse von Hand wählen` })
  if (h.typen.length > 1) return offen(`Strassenhierarchie an der Querung uneinheitlich (${hierText(h)}, ${GEOPORTAL_BERN})`)
  const typ = h.typen[0]
  const tt = typText(h)
  const ausH: Strassentyp | null = typ === 'basisnetz' || typ === 'autobahn' ? 'verkehrsorientiert'
    : typ === 'quartier' || typ === 'quartier_ergaenzend' ? 'siedlungsorientiert' : null
  if (!ausH) return offen(`${hierText(h)} laut ${GEOPORTAL_BERN}${tt ? `; ${tt}` : ''}`)
  const ausT = uniq(h.klassen.map(k => (k === 'sammel' ? 'siedlungsorientiert' : 'verkehrsorientiert')))
  if (ausT.some(x => x !== ausH)) return offen(`${hierText(h)} laut ${GEOPORTAL_BERN} und ${tt} widersprechen sich`)
  return { wert: ausH, quelle: 'geoportal', text: `${hierText(h)} laut ${GEOPORTAL_BERN}: ${ausH}${tt ? `; ${tt} stützt das` : ''}` }
}

// ── Hauptfunktion (am Schluss von vorbelegen) ──
export interface AutoEingangC {
  st: StreifenErgebnis[]
  geo: GeoVorbelegung
  w: Vorbelegung
  setze: Setze
  feldHinweis: FeldHinweis
  /** Hinweis ohne Wert eines Felds entfernen (Feld bekommt nun einen Wert) */
  feldHinweisWeg: (pfad: string) => void
  hinweise: string[]
}

export function automatikC(x: AutoEingangC): void {
  grundVorbelegen(x)
  if (netzVorbelegen(x)) fusswegnetzGrund(x)
  taktilVorbelegen(x)
  zonenVorbelegen(x)
  oevVorbelegen(x)
}

/**
 * Besonderer Grund für Vortritt (Nutzerentscheid 21.10.2026): Volksschule bzw. Kindergarten (Geoportal, Tatsache) bis 150 m; Heim
 * nach OSM (nursing_home, group_home, assisted_living) bis 150 m (Annahme); Haltestelle bis 50 m (vorbelegung, Tatsache); Schule bzw.
 * Kindergarten nach OSM: in Bern ohne Treffer im Geoportal nur Hinweis, ausserhalb Berns Annahme. Nichts im ganz geladenen Umkreis
 * (Haltestellen inbegriffen): in Bern «keines» als Annahme, ausserhalb Berns offen mit Hinweis (Korrektur S5). Flächen (OSM) zählen
 * nach ihrem Umriss (Korrektur S9). Schulweg bleibt Handeingabe.
 */
function grundVorbelegen(x: AutoEingangC): void {
  const { st, geo, w, setze, feldHinweis } = x
  const s = geo.schulen
  if (!s) return
  if ('fehler' in s) { if (!w.beduerfnis) feldHinweis('beduerfnis', `Schulen, Kindergärten und Heime nicht geladen (${s.fehler})`); return }
  const R = AUTO_C.grundM, pts = st.flatMap(eckenVon)
  const nah = (os: readonly SchulOrt[] | null | undefined) => (os ?? []).map(o => ({ o, d: abstandOrt(o, st) }))
    .filter(y => y.d <= R + 1e-9).sort((a, b) => a.d - b.d)
  const { bern, osm } = s
  // in Bern: Geoportal geladen bzw. ausgefallen (Hinweis); ausserhalb weder noch
  const inBern = !!bern || !!s.hinweis
  const funde: { art: Beduerfnis; text: string; quelle: Quelle }[] = []
  const hw: string[] = []
  if (bern) for (const [os, art, wort] of [[bern.volksschulen, 'schule', 'Volksschule'], [bern.kindergaerten, 'kindergarten', 'Kindergarten']] as const) {
    const n0 = nah(os)[0]
    if (n0) funde.push({ art, text: `${wort} «${n0.o.name}», ${ganz(n0.d)} m (${GEOPORTAL_BERN})`, quelle: 'geoportal' })
  }
  if (osm) for (const { o, d } of nah(osm.orte)) {
    const heim = o.art === 'heim' || (o.art === 'sozial' && /assisted_living/.test(o.tag ?? ''))
    const art: Beduerfnis | null = heim ? 'heim' : o.art === 'schule' || o.art === 'kindergarten' ? o.art : null
    if (!art || funde.some(f => f.art === art)) continue
    const wort = art === 'heim' ? 'Heim' : art === 'schule' ? 'Schule' : 'Kindergarten'
    const amtlich = art === 'schule' ? bern?.volksschulen : art === 'kindergarten' ? bern?.kindergaerten : undefined
    const ab = ortAbstandText(o, d)
    if (art === 'heim' || !inBern) funde.push({ art, text: `${wort} «${o.name}», ${ab} (OSM; Annahme)`, quelle: 'annahme' })
    else if (amtlich) hw.push(`${wort} «${o.name}» laut OSM (${ab}), ${art === 'schule' ? 'keine Volksschule' : 'kein Kindergarten'} laut ${GEOPORTAL_BERN}`)
    else hw.push(`${wort} «${o.name}» laut OSM (${ab}); ${GEOPORTAL_BERN} dazu nicht geladen`)
  }
  const halt = Array.isArray(w.beduerfnis?.wert) && (w.beduerfnis!.wert as string[]).includes('haltestelle') ? w.beduerfnis! : null
  const hinweisText = uniq(hw).join('; ')
  if (funde.length) {
    const ORDNUNG: Beduerfnis[] = ['schule', 'kindergarten', 'heim', 'haltestelle']
    const werte = ORDNUNG.filter(a => funde.some(f => f.art === a) || (a === 'haltestelle' && halt))
    // Quelle: eine Tatsache genügt für «Grund vorhanden» (die Regeln fragen nur danach); nur Annahmen: Annahme
    const fakten = [...funde.filter(f => f.quelle !== 'annahme').map(f => f.quelle), ...(halt ? [halt.quelle] : [])]
    const quelle: Quelle = fakten.includes('geoportal') ? 'geoportal' : fakten[0] ?? 'annahme'
    const teile = [...ORDNUNG.flatMap(a => funde.filter(f => f.art === a).map(f => f.text)),
      ...(halt ? [halt.text.replace(/: Haltestelle an der Querung als Grund für Vortritt$/, '')] : [])]
    setze('beduerfnis', werte, quelle, `${teile.join('; ')}: Grund für Vortritt`)
    if (hinweisText) feldHinweis('beduerfnis', hinweisText)
    return
  }
  if (halt) { if (hinweisText) feldHinweis('beduerfnis', hinweisText); return }
  if (hinweisText) { feldHinweis('beduerfnis', `${hinweisText}: besonderen Grund von Hand wählen`); return }
  // Korrektur S5 (Nutzerentscheid): ausserhalb Berns kein «keines» aus OSM allein, nur Treffer
  if (!inBern) {
    if (osm && abgedeckt(pts, R, osm.bereich)) feldHinweis('beduerfnis', `nichts in OSM im Umkreis von ${R} m (keine Schule, kein ` +
      'Kindergarten, kein Heim); OSM ist unvollständig: besonderen Grund von Hand wählen')
    return
  }
  const fehlt: string[] = []
  if (!osm || !abgedeckt(pts, R, osm.bereich)) fehlt.push(`Heime nach OSM nicht im ganzen Umkreis von ${R} m geladen`)
  if (!(bern?.volksschulen && bern.kindergaerten && abgedeckt(pts, R, bern.bereich)))
    fehlt.push(`Volksschulen bzw. Kindergärten (${GEOPORTAL_BERN}) nicht im ganzen Umkreis von ${R} m geladen${s.hinweis ? ` (${s.hinweis})` : ''}`)
  if (w['haltestelle.art']?.wert !== 'keine') fehlt.push('Haltestellen im Umkreis von 50 m nicht geklärt')
  if (!fehlt.length) setze('beduerfnis', [], 'annahme', `kein besonderer Grund im Umkreis von ${R} m (${GEOPORTAL_BERN}, OSM)`)
  else feldHinweis('beduerfnis', `keine Schule, kein Kindergarten und kein Heim im Umkreis von ${R} m gefunden, aber ${fehlt.join('; ')}: offen`)
}

/**
 * Fusswegnetz aus dem Richtplan Fussverkehr (Nutzerentscheid 21.10.2026): Basisnetz-Linie quert die Fahrbahn bis 15 m vom Streifen:
 * Basisnetz; Streifen in einem publikumsattraktiven Bereich: publikumsintensiv (geht vor); beides Netzplanung (netzQualifiziert ja);
 * Nachfrage gebündelt (Annahme) nur beim Basisnetz-Treffer (Korrektur S4); kein Treffer: offen mit Hinweis (Feinverteiler nicht
 * kartiert). Gehlinie: Abstand zur Basisnetz-Linie bis 15 m (Annahme), bis 30 m nur Hinweis (Korrektur S8).
 */
function netzVorbelegen(x: AutoEingangC): boolean {
  const { st, geo, setze, feldHinweis } = x
  const rp = geo.richtplan
  if (!rp) return false
  if ('fehler' in rp) { feldHinweis('netz', `Richtplan Fussverkehr (${GEOPORTAL_BERN}) nicht erreichbar (${rp.fehler})`); return false }
  const a = querungsAchse(st)
  if (!abgedeckt([a.A, a.B], AUTO_C.wunschM, rp.bereich)) { feldHinweis('netz', `Richtplan Fussverkehr nur bis ${rp.bereich.radiusM} m um den Ladeort geladen`); return false }
  const quelle = `Richtplan Fussverkehr, ${GEOPORTAL_BERN}`
  const wo = (x: number) => (Math.round(x) === 0 ? 'beim Streifen' : `${ganz(x)} m vom Streifen`)
  const d = rp.basisnetz ? rp.basisnetz.map(l => querAbstand(l.teile, a, AUTO_C.wunschM)).filter((v): v is number => v !== null)
    .sort((p, q) => p - q)[0] ?? null : null
  const basis = d !== null && d <= AUTO_C.netzM + 1e-9
  const pub = !!rp.publikum?.some(f => st.some(s => inFlaeche(s.m, f.ringe)))
  if (pub) setze('netz', 'publikumsintensiv', 'geoportal', `Streifen in einem publikumsattraktiven Bereich (${quelle})` +
    (basis ? `; zudem quert eine Basisnetz-Linie die Fahrbahn ${wo(d!)}` : ''))
  else if (basis) setze('netz', 'basisnetz', 'geoportal', `Basisnetz-Linie quert die Fahrbahn ${wo(d!)} (${quelle})`)
  if (pub || basis) {
    setze('netzQualifiziert', true, 'geoportal', `Querung im Fusswegnetz des Richtplans Fussverkehr (behördliche Netzplanung; ${GEOPORTAL_BERN})`)
    // Korrektur S4 (Nutzerentscheid): gebündelt nur bei einem Basisnetz-Treffer; im publikumsattraktiven Bereich bleibt die Nachfrage
    // offen (dort ist verteiltes Queren möglich)
    if (basis) setze('nachfrage', 'punktuell', 'annahme', 'Basisnetz-Linie quert die Fahrbahn an der Querung: gebündelte Nachfrage angenommen')
    else feldHinweis('nachfrage', 'publikumsattraktiver Bereich (Richtplan Fussverkehr): gebündelt oder verteilt von Hand wählen')
  } else if (rp.basisnetz && rp.publikum) {
    const t = `nicht im kartierten Basisnetz (${GEOPORTAL_BERN}); Feinverteiler nicht kartiert`
    feldHinweis('netz', t)
    feldHinweis('netzQualifiziert', t)
  } else feldHinweis('netz', `Richtplan Fussverkehr teilweise nicht erreichbar${rp.hinweis ? ` (${rp.hinweis})` : ''}`)
  // Korrektur S8: Gehlinie nur bis 15 m (Basisnetz-Treffer); darüber nur Hinweis
  // Runde 5 (F6): die Basisnetz-Linie ist eine schematische Netzlinie; daraus nur ein Hinweis, kein Wert (kein Befund G3 aus einer Annahme)
  if (d !== null) feldHinweis('wunschlinieM', `die schematische Basisnetz-Linie quert die Fahrbahn ${wo(d)} (${quelle}): Abstand zur Gehlinie ` +
    'vor Ort schätzen')
  return basis
}

/**
 * Fusswegnetz als besonderer Grund (Runde 5, Stelle 10; Masterplan Fussverkehr Bern, C2-B): quert eine Basisnetz-Linie die Fahrbahn
 * an der Querung (Geoportal; der publikumsattraktive Bereich allein genügt nicht), kommt «Fusswegnetz (Bern)» zum besonderen Grund hinzu
 * (ohne andere Funde: einziger Grund als Annahme, bestätigbar; ein «keines» aus der Vorbelegung wird ersetzt). Es zählt nur mit der
 * Ebene Bern (Kontext.bed). Eine Handeingabe geht vor.
 */
function fusswegnetzGrund(x: AutoEingangC): void {
  const { w, setze, feldHinweisWeg } = x
  const satz = `Basisnetz (Richtplan Fussverkehr, ${GEOPORTAL_BERN}): Bern: Zugehörigkeit zum Fusswegnetz gilt als Begründung`
  const b = w.beduerfnis
  const alt = Array.isArray(b?.wert) ? (b!.wert as string[]) : []
  if (b && alt.length) {
    if (!alt.includes('fusswegnetz')) setze('beduerfnis', [...alt, 'fusswegnetz'], b.quelle, `${b.text}; ${satz}`)
    return
  }
  setze('beduerfnis', ['fusswegnetz'], 'annahme', satz)
  feldHinweisWeg('beduerfnis')
}

/**
 * Taktil-visuelle Markierungen (Nutzerentscheid 21.10.2026): Feld (Codes 1001–1005) bis 3 m von einem Streifenende: ja (Geoportal);
 * Felder geladen, keines: nein (Annahme). Leitlinie auf dem Streifen (Code 1003) schneidet den Streifen: ja (Geoportal); Linien
 * geladen, keine: nein (Annahme). Das OSM-Tag tactile_paving bleibt ein Hinweis (automatik.ts).
 */
function taktilVorbelegen(x: AutoEingangC): void {
  const { st, geo, setze, feldHinweis } = x
  const t = geo.taktil
  if (!t) return
  const quelle = `${GEOPORTAL_BERN}, taktil-visuelle Markierungen`
  if ('fehler' in t) { feldHinweis('taktil', `Taktil-visuelle Markierungen (${GEOPORTAL_BERN}) nicht erreichbar (${t.fehler})`); return }
  // Streifenenden am Trottoir: die beiden äussersten Enden entlang der Achse (Enden an einer Insel zählen nicht)
  const a = querungsAchse(st)
  const allEnden = st.flatMap(s => [s.p0, s.p1]).map(p => ({ p, t: dot(sub(p, a.A), a.u) })).sort((x, y) => x.t - y.t)
  const enden = [allEnden[0].p, allEnden[allEnden.length - 1].p]
  if (t.felder && abgedeckt(enden, AUTO_C.taktilM, t.bereich)) {
    const f = t.felder.filter(z => z.art !== null && TVM_FELD_QUERUNG.includes(z.art)).map(z => ({ z, d: Math.min(...enden.map(e => dist(e, z.p))) }))
      .sort((p, q) => p.d - q.d)[0]
    if (f && f.d <= AUTO_C.taktilM + 1e-9) setze('taktil', true, 'geoportal', `${f.z.text || 'Feld'} ${f1(f.d)} m vom Streifenende (${quelle})`)
    else setze('taktil', false, 'annahme', `kein taktiles Aufmerksamkeitsfeld laut ${GEOPORTAL_BERN} innert ${AUTO_C.taktilM} m der ` +
      'Streifenenden (Inventar möglicherweise unvollständig)')
  } else if (!t.felder) feldHinweis('taktil', `Taktile Felder (${GEOPORTAL_BERN}) nicht erreichbar${t.hinweis ? ` (${t.hinweis})` : ''}`)
  if (t.linien && abgedeckt(st.flatMap(eckenVon), 1, t.bereich)) {
    const l = t.linien.find(z => z.art === TVM_LEITLINIE_STREIFEN && z.teile.some(tl => linieAbstand(tl, st) <= AUTO_C.leitlinieM + 1e-9))
    if (l) setze('leitlinie', true, 'geoportal', `${l.text} (${quelle})`)
    else setze('leitlinie', false, 'annahme', `keine Leitlinie auf dem Streifen laut ${GEOPORTAL_BERN} (Inventar möglicherweise unvollständig)`)
  }
}

/**
 * Nutzungszonen (Nutzerentscheid 21.10.2026): Proben auf der Achse und hinter den Bordkanten; Industrie- und Gewerbezone (1004) bzw.
 * Gewerbegebiet Matte (1018): Gewerbe ja, sonst nein (Geoportal, nur mit Zone an einer Probe); Bauzone: bebautes Gebiet (Annahme),
 * stützt innerorts (Text).
 */
function zonenVorbelegen(x: AutoEingangC): void {
  const { st, geo, w, setze, feldHinweis } = x
  const nz = geo.nutzungszonen
  if (!nz) return
  if ('fehler' in nz) { feldHinweis('q3.gewerbe', `Nutzungszonenplan (${GEOPORTAL_BERN}) nicht erreichbar (${nz.fehler})`); return }
  const a = querungsAchse(st)
  const proben = [a.mitte, ...AUTO_C.zonenProbenM.flatMap(m => [add(a.A, a.u, -m), add(a.B, a.u, m)])]
  if (!abgedeckt(proben, 0, nz.bereich)) return
  const zonen = uniq(proben.map(p => flaecheAmPunkt(p, nz.flaechen)).filter((z): z is NzFlaeche => !!z))
  const name = (z: NzFlaeche) => z.text || `Zone ${z.zone ?? '?'}`
  const quelle = `${GEOPORTAL_BERN}, Nutzungszonenplan`
  if (!zonen.length) { feldHinweis('q3.gewerbe', `keine Grundzone am Streifen (${quelle})`); return }
  const namen = uniq(zonen.map(name)).join(', ')
  const gew = zonen.find(z => z.gewerbe)
  if (gew) setze('q3.gewerbe', true, 'geoportal', `${name(gew)} am Streifen (${quelle})`)
  else setze('q3.gewerbe', false, 'geoportal', `Grundzonen am Streifen: ${namen} (keine Industrie- oder Gewerbezone; ${quelle})`)
  const bau = zonen.find(z => istBauzone(z.zone) === true)
  if (bau) {
    setze('q3.bebaut', true, 'annahme', `Bauzone am Streifen (${name(bau)}, ${quelle}): bebautes Gebiet angenommen`)
    const io = w.innerorts
    if (io?.wert === true && io.quelle === 'annahme') setze('innerorts', true, 'annahme', `${io.text}; Bauzone laut Nutzungszonenplan stützt das`)
    // Runde 5 (F1): ohne Wert aus Tempo bzw. OSM (z. B. nur Abbieger): innerorts aus der Bauzone als Annahme
    else if (!io) setze('innerorts', true, 'annahme', `Bauzone am Streifen (${name(bau)}, Nutzungszonenplan): innerorts angenommen`)
  } else feldHinweis('q3.bebaut', `keine Bauzone am Streifen (${namen}; ${quelle}): von Hand wählen`)
}

/**
 * ÖV-Linien (Nutzerentscheid 21.10.2026): Bus- bzw. Trolleybuslinie längs der gequerten Strasse (Seitenstrasse an der Einmündung):
 * Linienbus ja, sonst nein (Geoportal). Haltestellen des Geoportals (ohne Bus/Tram): Halt bis 30 m mit Tramlinie bis 15 m am
 * Haltepunkt: Tramhaltestellenbereich ja; kein Halt bis 50 m mit Tramlinie: nein; sonst Hinweis.
 */
function oevVorbelegen(x: AutoEingangC): void {
  const { st, geo, setze, feldHinweis, feldHinweisWeg } = x
  const o = geo.oevLinien
  if (!o) return
  if ('fehler' in o) { feldHinweis('q3.linienbus', `ÖV-Linien (${GEOPORTAL_BERN}) nicht erreichbar (${o.fehler})`); return }
  const quelle = `${GEOPORTAL_BERN}, ÖV-Linien`
  const a = querungsAchse(st)
  if (abgedeckt([a.A, a.B], 0, o.bereich)) {
    const bus = laengs(o.linien.filter(l => l.typ === 'bus' || l.typ === 'trolleybus'), a)
    const nr = uniq(bus.map(l => l.nummer).filter(Boolean))
    if (bus.length) setze('q3.linienbus', true, 'geoportal', `Buslinie${nr.length > 1 ? 'n' : ''}${nr.length ? ` ${nr.join(', ')}` : ''} in der gequerten Strasse (${quelle})`)
    else setze('q3.linienbus', false, 'geoportal', `keine Buslinie in der gequerten Strasse (${quelle})`)
  }
  const h = geo.haltestellen
  if (!h || 'fehler' in h || h.quelle !== 'geoportal') return
  const halte = h.halte.map(y => ({ y, d: abstandQuerung(y.p, st) })).filter(z => z.d <= AUTO.haltUmkreisM + 1e-9).sort((p, q) => p.d - q.d)
  if (!halte.length || !halte.every(z => imBereich(z.y.p, AUTO_C.tramAmHaltM, o.bereich))) return
  const tram = o.linien.filter(l => l.typ === 'tram')
  const mit = halte.map(z => ({ ...z, l: tram.find(l => abstandLinie(z.y.p, l.teile) <= AUTO_C.tramAmHaltM + 1e-9) ?? null }))
  const nah = mit.find(z => z.l && z.d <= AUTO.tramHaltM + 1e-9)
  if (nah) {
    // Korrektur S7: Tramhalt nur aus der Nähe einer Tramlinie zum Haltepunkt erschlossen (Haltestellen ohne Bus/Tram): Annahme
    setze('tramHaltestellenbereich', true, 'annahme', `Haltestelle «${nah.y.name}», ${ganz(nah.d)} m, Tramlinie${nah.l!.nummer ? ` ${nah.l!.nummer}` : ''} ` +
      `höchstens ${AUTO_C.tramAmHaltM} m vom Haltepunkt (${GEOPORTAL_BERN}, Haltestellen und ÖV-Linien): Tramhalt angenommen`)
    feldHinweisWeg('tramHaltestellenbereich')
  } else if (mit.every(z => !z.l)) {
    setze('tramHaltestellenbereich', false, 'geoportal', `Haltestelle${mit.length > 1 ? 'n' : ''} im Umkreis von ${AUTO.haltUmkreisM} m ohne ` +
      `Tramlinie (${GEOPORTAL_BERN}, Haltestellen und ÖV-Linien)`)
    feldHinweisWeg('tramHaltestellenbereich')
  } else {
    const z = mit.find(y => y.l)!
    feldHinweisWeg('tramHaltestellenbereich')
    feldHinweis('tramHaltestellenbereich', `Tramhalt «${z.y.name}», ${ganz(z.d)} m (über ${AUTO.tramHaltM} m; ${quelle}): von Hand wählen`)
  }
}
