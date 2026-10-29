// ── Bedarfsmodul: Regeln (E0) ──
//
// Je Regel mit Befund (Katalogart befund oder weiche) eine Funktion Kontext → Ergebnis | null (null = hier nicht anwendbar).
// Die Schwellen kommen aus dem Katalog (KATALOG[id].werte) bzw. aus tabellen.ts, nie als Zahl im Code. Fehlt eine nötige
// Eingabe, wirft der Kontext Offen. Die Reihenfolge und die Abhängigkeiten (z. B. D5-4 nach H1 und E3) regelt entscheid.ts.

import { KATALOG, type BefundId } from './katalog'
import { type Ergebnis, type Kontext, Offen } from './kontext'
import { BERN_INSEL, BERN_LSA, BERN_Q3, Q3_DTV_GRENZE, bernTabelle, kTempo, sichtFgs, sichtKurveTab2, type Bern3a } from './tabellen'
import { EPS, pruefeSichtOhneVortritt, type SichtOhneVortritt } from './sichtOhneVortritt'
import { freigabeSollInsel, freigabeSollNorm, gelbZulaessig, rundeBern } from './lsaZeiten'
import { sichtweiteKurve } from '../rechner/tempo'
import { f3Klasse } from './durchfahrt'
import type { Staerke } from './typen'

export type RegelFn = (k: Kontext) => Ergebnis | null

const K = KATALOG
const ja = (verletzt: boolean, x: Omit<Ergebnis, 'verletzt'> = {}): Ergebnis => ({ verletzt, ...x })
/** Runde 4: die Strasse endet beidseits ohne Fortsetzung, der Abstand ist ihre ganze Länge: Hinweis statt Befund, Abstand nicht
 * anwendbar (Masse-Zeile mit «ganze Strasse», ohne Soll) */
const ganzeStrasse = (d: number, text: string): Ergebnis => ({ verletzt: true, staerke: 'hinweis', ohneMassBefund: true,
  ist: `${fmt(d, 0)} (ganze Strasse)`, text: `${text} (sie endet beidseits ohne Fortsetzung): Abstand nicht anwendbar` })
/** Zahl mit Dezimalkomma */
export const fmt = (n: number, d = 2): string => n.toFixed(d).replace('.', ',')
const fmtListe = (xs: number[], d = 2): string => xs.map(x => fmt(x, d)).join(' / ')
const tabText = (t: Bern3a): string => (t === 'ja' ? 'Ja' : t === 'nein' ? 'Nein' : 'Ja oder nein')
/** Ist der Berner Tabellen: Tempo und DTV mit dem Tabellenwert («Tempo 50 km/h, DTV 8000: Ja») */
const tabIst = (v: number, dtv: number, t: Bern3a): string => `Tempo ${v} km/h, DTV ${dtv} Fz/Tag: ${tabText(t)}`

// ── Hilfen über mehrere Regeln ──

/** Fussverkehr unter der Schwelle (Zählung vor Schätzklasse, Entscheid 5; Klasse <100 gilt als darunter) */
function fgUnter(k: Kontext, schwelle: number): boolean {
  const fg = k.o('fg5h')
  if (fg !== null) return fg < schwelle
  const kl = k.o('fgKlasse')
  if (kl !== null) return kl === '<100'
  throw new Offen(['fg5h', 'fgKlasse'])
}
function fgIst(k: Kontext): string {
  const fg = k.o('fg5h')
  return fg !== null ? String(fg) : `Klasse ${k.o('fgKlasse') ?? '?'}`
}

/** Sicht für die Querung ohne Vortritt (E3/E3a): bei markierter Insel L = ganze Fahrbahn (Entscheid 6) */
function e3(k: Kontext): { r: SichtOhneVortritt; v: number; L: number[] } {
  const v = k.v85e()
  const L = k.inselMarkiert() ? [k.w('fahrbahnB')] : k.w('querdistanzL')
  return { r: pruefeSichtOhneVortritt(v, L, k.w('sichtVorh'), K.E3.werte.gehV), v, L }
}
/** Ausnahme Z. 8.2: wenig Querende und wenig Verkehr */
const e3Ausnahme = (k: Kontext): boolean => fgUnter(k, K.E3a.werte.fgMax) && k.w('dtv') < K.E3a.werte.dtvMax

/** Normhinweis, wenn bei Radius 20 m der bfu-Wert statt Tab. 2 gilt (Nutzerentscheid 20.10.2026) */
const hinweisTab2 = (t: { sicht: number; norm: number }): string | undefined =>
  t.sicht !== t.norm ? `Norm: VSS 40 241:2019 Tab. 2 nennt ${t.norm} m; verwendet ist wie in der Sichtprüfung der bfu-Wert ${t.sicht} m` : undefined

/**
 * Notwendige Sichtweite FGS (H1, H3): Tab. 2 nach Kurvenradius (H2), sonst Tab. 1 nach vSicht. vSicht = vSig; mit Anzeichen
 * für schnelleres Fahren oder gemessener V85 über vSig gilt V85 (Pflicht); mit nachgewiesener tieferer V85 darf V85 gelten
 * (40 241 Z. 14). offenV85: Anzeichen ohne Messung, V85 wäre nötig.
 */
/** Kurvenregel (VSS 40 241 Z. 14, S. 7): die fünf Voraussetzungen und dazu innerorts mit signalisiert 50 km/h (29.10.2026) */
export const kurvenregelGilt = (k: Kontext): boolean => !!k.w('kurve').fuenfBedingungen && (k.w('kurve').radiusStrasse ?? null) !== null &&
  k.o('innerorts') === true && k.o('vSig') === 50
function hSoll(k: Kontext): { soll: number; text: string; offenV85: boolean; normHinweis?: string } {
  const kurve = k.w('kurve')
  if (kurvenregelGilt(k)) {
    const t = sichtKurveTab2(kurve.radiusStrasse!)
    if (t !== null) return { soll: t.sicht, text: `Tab. 2, Radius ${fmt(kurve.radiusStrasse!, 0)} m`, offenV85: false, normHinweis: hinweisTab2(t) }
  }
  const vSig = k.w('vSig')
  const v85 = k.o('v85')
  const anz = k.w('anzeichenSchneller')
  if (anz && v85 === null) return { soll: sichtFgs(vSig), text: `Tab. 1, ${vSig} km/h signalisiert`, offenV85: true }
  if (v85 !== null && v85 > vSig && (anz || k.w('v85Nachweis')))
    return { soll: sichtFgs(v85), text: `Tab. 1, V85 ${v85} km/h (${anz ? 'Anzeichen' : 'Messung'} über dem signalisierten Tempo)`, offenV85: false }
  if (v85 !== null && v85 < vSig && !anz && k.w('v85Nachweis')) return { soll: sichtFgs(v85), text: `Tab. 1, V85 ${v85} km/h (Messung)`, offenV85: false }
  return { soll: sichtFgs(vSig), text: `Tab. 1, ${vSig} km/h signalisiert`, offenV85: false }
}
function hSollSicher(k: Kontext): number {
  const h = hSoll(k)
  if (h.offenV85) throw new Offen(['v85'])
  return h.soll
}

// Durchfahrt neben der Insel (F3, Kanton BE): Klasse je Seite in durchfahrt.ts (eine Quelle mit dem Werkzeug «Mittelinsel»)

/** Bern: Qualitätsstufe der Wartezeit an der LSA (MP S. 60), mit Insel eigene Spalte */
function wartestufe(w: number, insel: boolean): 'A/B' | 'C' | 'D' | 'E' | 'F' {
  const W = K['I6-B'].werte
  const [ab, c, d, e] = insel ? [W.abInsel, W.cInsel, W.dInsel, W.eInsel] : [W.ab, W.c, W.d, W.e]
  return w <= ab ? 'A/B' : w <= c ? 'C' : w <= d ? 'D' : w <= e ? 'E' : 'F'
}

const istKnoten = (lage: string): boolean => lage.startsWith('knoten')
/**
 * Lesereihenfolge (Nachprüfung 20.10.2026): eine Regel meldet «offen» nur, wenn sie greifen kann. Bekannte Schalter, die sie
 * ausschliessen, werden darum vor offenen Feldern gelesen (k.o): Lichtsignal bekannt, Typ bekannt, Insel bzw. Radstreifen «nein».
 */
const lsaBekannt = (k: Kontext): boolean => k.o('typ') === 'lsa' || k.o('fgsMitLsa') === true

export const REGELN: Record<BefundId, RegelFn> = {
  // ── A ──
  A1: k => ja(!k.w('innerorts')),
  // Runde 4: eine Begegnungszone hat Tempo 20; Strecke bzw. Tempo-30-Zone oder ein bekanntes Tempo ab 30 ohne Zonenangabe: nicht
  // anwendbar (nicht offen); offen nur bei Tempo 20 bzw. unbekanntem Tempo ohne Zonenangabe
  A2: k => {
    const t = k.o('tempoRegime')
    if (t !== null) return t === 'begegnungszone' ? ja(true) : null
    // 23.10.2026: nennt eine Datenquelle eine Begegnungszone und widerspricht das amtliche Tempo (Feld strittig), bleibt A2 offen,
    // auch bei Tempo ab 30 km/h
    if (k.e.tempoRegime?.strittig) throw new Offen(['tempoRegime'])
    const v = k.o('vSig')
    if (v !== null && v >= 30) return null
    throw new Offen(['tempoRegime'])
  },
  A3: k => {
    if (!k.w('innerorts')) return null
    const gemessen = k.o('v85') !== null
    const v = k.v85e()
    return ja(v > K.A3.werte.v85Max, { ist: gemessen ? String(v) : `${v} (signalisiert, nicht gemessen)`, soll: `≤ ${K.A3.werte.v85Max}`,
      ...(gemessen ? {} : { annahme: true as const }) })
  },
  A4: k => (k.o('v85') !== null ? ja(false) : ja(k.w('anzeichenSchneller'))),

  // ── B ──
  B1: k => ja(k.w('nachfrage') === 'flaechig'),
  B3: k => ja(k.w('lage') === 'einmuendung'),
  B4: k => (istKnoten(k.w('lage')) ? ja(k.w('knotenArmeOhneQuerung') > 0, { ist: `${k.w('knotenArmeOhneQuerung')} Arm(e) ohne Querung` }) : null),

  // ── C ──
  C1: k => {
    const vSig = k.w('vSig'), max = K.C1.werte.vMax
    if (vSig > max) return ja(true, { ist: `${vSig} km/h signalisiert`, soll: `≤ ${max}` })
    const gemessen = k.o('v85') !== null
    const v = k.v85e()
    return ja(v > max, { ist: gemessen ? `V85 ${v} km/h` : `${v} km/h signalisiert, V85 nicht gemessen`, soll: `≤ ${max}`,
      ...(gemessen ? {} : { annahme: true as const }) })
  },
  // C2c gestrichen (Nutzerentscheid 20.10.2026): eine Hauptstrasse ausserhalb der Zone ist im Tempo-Regime eine Strecke
  // Runde 5 (Korrektur nach Prüfung): mit bekanntem besonderem Grund ist C2 auch bei offener Zone nicht verletzbar (C2b statt C2);
  // offen ist C2 nur nach den Feldern, die wirklich fehlen (Zone und/oder Grund)
  C2: k => {
    const tr = k.o('tempoRegime'), bd = k.o('beduerfnis')
    if (bd !== null && k.bed()) return tr === null || tr === 't30_zone' ? ja(false) : null
    if (tr === null) throw new Offen(bd === null ? ['tempoRegime', 'beduerfnis'] : ['tempoRegime'])
    return tr !== 't30_zone' ? null : ja(!k.bed())
  },
  C2b: k => {
    const tr = k.o('tempoRegime')
    if (tr !== null) return tr !== 't30_zone' ? null : ja(k.bed())
    if (k.o('beduerfnis') !== null && k.bed())
      return ja(true, { detail: 'Zone noch offen: liegt die Strasse in einer Tempo-30-Zone, ist der Grund für Vortritt auszuweisen' })
    throw new Offen(['tempoRegime'])
  },
  'C2-B': k => (k.w('tempoRegime') !== 't30_zone' ? null : ja(['basisnetz', 'publikumsintensiv'].includes(k.w('netz')))),
  C3: k => {
    const s = K.C3.werte.fgMin
    if (!fgUnter(k, s)) return ja(false, { ist: fgIst(k), soll: `≥ ${s}` })
    return ja(!k.w('netzQualifiziert') && !k.bed(), { ist: fgIst(k), soll: `≥ ${s}` })
  },
  C3b: k => (!fgUnter(k, K.C3b.werte.fgMin) ? ja(false) : ja(k.w('netzQualifiziert') || k.bed(), { ist: fgIst(k) })),
  // Runde 2 (Korrektur A4): ohne Zählung und ohne Schätzklasse offen, nicht «ohne Befund»
  C3c: k => {
    if (k.o('fg5h') === null && k.o('fgKlasse') === null) throw new Offen(['fg5h', 'fgKlasse'])
    return ja(k.o('fgQuelle') === 'schaetzung' || k.o('fg5h') === null)
  },
  C4: k => {
    const dtv = k.w('dtv')
    return ja(dtv < K.C4.werte.dtvMin, { ist: String(dtv), soll: `≥ ${K.C4.werte.dtvMin}` })
  },
  'C4-B': k => ja(k.w('dtv') < K['C4-B'].werte.dtvMin && k.w('netz') !== 'keins'),

  // ── D ──
  D1: k => {
    if (lsaBekannt(k)) return null
    const n = k.nMax()
    const x = { ist: `${n} je Richtung`, soll: `≤ ${K.D1.werte.nMax} je Richtung ohne Insel` }
    if (n <= K.D1.werte.nMax || k.insBaulich()) return ja(false, x)
    if (k.w('lage') === 'knoten_belastet' && k.w('alleZufahrtsstreifenBelastet')) return ja(false, x)
    return ja(!k.mitLsa(), x)
  },
  D1b: k => (k.hat('D1') ? ja(!k.w('inselMoeglich')) : null),
  D2: k => {
    if (!k.w('zweirichtung')) return null
    const B = k.w('fahrbahnB'), W = K.D2.werte
    const x = { ist: fmt(B), soll: `Insel ab ${fmt(W.bMin)} (Gegenverkehr)` }
    if (B < W.bMin || k.insBaulich()) return ja(false, x)
    return ja(k.w('dtv') >= W.dtvMin, x)
  },
  D2a: k => {
    if (!k.w('zweirichtung')) return null
    const W = K.D2a.werte
    if (k.w('fahrbahnB') < W.bMin || k.insBaulich()) return ja(false)
    return ja(k.w('dtv') < W.dtvMin)
  },
  // Korrektur 23.10.2026: nach D3a ausgewertet, damit «nicht verlangt» nicht neben «Insel nötig» (Tram auf eigenem Gleis) steht
  D2c: k => ja(!k.insBaulich() && !k.hat('D1') && !k.hat('D2') && !k.hat('D2a') && !k.hat('D3a')),
  D3a: k => (lsaBekannt(k) || k.w('tram') !== 'eigentrassee' ? null : ja(!k.insBaulich() && !k.mitLsa())),
  D3b: k => (k.w('tram') !== 'eigentrassee' ? null : ja(k.w('balkenAufGleis'))),
  D4a: k => ja(k.w('haltestelle').lage === 'im_bereich'),
  D4b: k => (k.w('haltestelle').art !== 'fahrbahn' ? null : ja(k.s('haltestelle', 'verdeckt') && !k.insBaulich())),
  D4c: k => ja(k.w('haltestelle').lage === 'fgs_vor_halt'),
  D4d: k => {
    const h = k.w('haltestelle')
    if (h.art !== 'fahrbahn' || h.lage !== 'fgs_nach_halt') return null
    return ja(!k.s('haltestelle', 'ueberholenUnterbunden'))
  },
  'D4-R': k => {
    if (k.w('haltestelle').art !== 'fahrbahn') return null
    if (k.insBaulich()) return ja(false)
    const W = K['D4-R'].werte, v = k.w('vSig')
    let a: number
    if (v <= W.v30) a = W.abstand30
    else {
      const B = k.w('fahrbahnB')
      a = B < W.b6 ? W.abstandUnter6 : B < W.b7 ? W.abstand6 : W.abstand7
    }
    return ja(true, { soll: `${a} m`, detail: `Richtwert ${a} m Abstand zur Haltestelle` })
  },
  // Korrektur 23.10.2026: D5-1, D5-4, D5-5, D5-6 wie D5-2/D5-3 nicht anwendbar, wenn die Querung schon ein Lichtsignal hat; das
  // Lichtsignal wird erst gelesen, wenn die Regel sonst greifen würde (kein «offen» nur wegen des Lichtsignals)
  'D5-1': k => {
    if (lsaBekannt(k) || k.w('strassentyp') !== 'verkehrsorientiert') return null
    if (!k.w('starkBelastet')) return ja(false)
    return k.mitLsa() ? null : ja(true)
  },
  'D5-2': k => (lsaBekannt(k) || !istKnoten(k.w('lage')) || k.mitLsa() ? null : ja(k.w('knotenLsa'))),
  'D5-3': k => (k.mitLsa() ? null : ja(k.nMax() >= K['D5-3'].werte.nAb && !k.insBaulich())),
  // Runde 2 (Korrektur A2): nicht anwendbar, wenn weder H1 noch E3 ausgewertet ist; offen, solange eine davon offen ist
  'D5-4': k => {
    const h = k.ergebnisse.get('H1'), e = k.ergebnisse.get('E3')
    if (lsaBekannt(k) || (!h && !e)) return null
    if (k.hat('H1') || k.hat('E3')) return k.mitLsa() ? null : ja(true)
    const fehlt = [...new Set([...(k.offenFelder.get('H1') ?? []), ...(k.offenFelder.get('E3') ?? [])])]
    if (fehlt.length) throw new Offen(fehlt)
    return ja(false)
  },
  'D5-5': k => {
    if (lsaBekannt(k) || k.w('tram') === 'keins') return null
    if (k.w('tramHaltestellenbereich')) return ja(false)
    return k.mitLsa() ? null : ja(true)
  },
  'D5-6': k => {
    if (lsaBekannt(k)) return null
    if (!k.w('fgSehrHoch')) return ja(false)
    return k.mitLsa() ? null : ja(true)
  },
  'D6-1': k => ja(kTempo(k.w('vSig')) === 'k20', { ist: `${k.w('vSig')} km/h` }),
  'D6-2': k => {
    if (k.insBaulich()) return ja(false)
    const t = bernTabelle(BERN_INSEL, k.w('vSig'), k.w('dtv'))
    return ja(t === 'ja', { ist: tabIst(k.w('vSig'), k.w('dtv'), t) })
  },
  'D6-2b': k => {
    if (k.insBaulich()) return ja(false)
    const t = bernTabelle(BERN_INSEL, k.w('vSig'), k.w('dtv'))
    return ja(t === 'ja_nein', { ist: tabIst(k.w('vSig'), k.w('dtv'), t) })
  },
  'D6-3': k => {
    if (k.mitLsa()) return ja(false)
    const t = bernTabelle(BERN_LSA, k.w('vSig'), k.w('dtv'))
    return ja(t === 'ja', { ist: tabIst(k.w('vSig'), k.w('dtv'), t) })
  },
  'D6-3b': k => {
    if (k.mitLsa()) return ja(false)
    const t = bernTabelle(BERN_LSA, k.w('vSig'), k.w('dtv'))
    return ja(t === 'ja_nein', { ist: tabIst(k.w('vSig'), k.w('dtv'), t) })
  },
  'D6-4': k => (lsaBekannt(k) ? null : ja(k.nMax() > K['D6-4'].werte.nMax && !k.insBaulich() && !k.mitLsa())),
  'D6-5': k => {
    if (k.o('typ') !== 'lsa') return null
    if (!k.w('neuanlage')) return ja(false)
    const W = K['D6-5'].werte, n = k.w('nRichtung').reduce((a, b) => a + b, 0)
    if (n > W.nSummeMax) return ja(true, { ist: `${n} Fahrstreifen` })
    const B = k.w('fahrbahnB')
    return ja(B > W.bMax, { ist: `${fmt(B)} m` })
  },
  D7: k => (k.o('typ') !== 'mehrzweck' ? null : ja(k.w('mzsMitFgs') && !k.insBaulich())),

  // ── E ──
  E1: k => ja(k.w('strassentyp') === 'verkehrsorientiert'),
  E1b: k => (k.w('strassentyp') !== 'verkehrsorientiert' ? null : ja(k.w('starkBelastet'))),
  E2: k => ja(k.w('strassentyp') === 'siedlungsorientiert'),
  E1c: k => (k.o('typ') !== 'furt' ? null : ja(!k.insBaulich())),
  E2a: k => (k.o('typ') !== 'furt' ? null : ja(k.w('strassentyp') === 'siedlungsorientiert')),
  E2b: k => {
    if (!k.w('laengsparkierung')) return null
    const s = k.w('seitenraumVorParklinieM')
    return ja(s < K.E2b.werte.min, { ist: fmt(s), soll: `≥ ${fmt(K.E2b.werte.min)}` })
  },
  E2c: k => {
    if (!k.w('laengsparkierung')) return null
    const s = k.w('seitenraumVorParklinieM'), W = K.E2c.werte
    return ja(s >= W.min && s < W.ideal, { ist: fmt(s), soll: `≥ ${fmt(W.ideal)} (ideal)` })
  },
  E2d: k => {
    if (k.o('typ') !== 'ohne_vortritt' || !k.w('ohneBaulich')) return null
    return ja(!k.w('absenkungBeidseits') || !k.w('aufstellflaeche') || k.w('parkierungSichtbehindernd'))
  },
  E2e: k => {
    if (k.o('typ') !== 'ohne_vortritt' || !k.w('ohneBaulich')) return null
    return ja(k.w('dtv') >= K.E2e.werte.dtvMax, { ist: String(k.w('dtv')) })
  },
  E3: k => {
    const { r, v, L } = e3(k)
    const soll = Math.max(...r.teile.map(t => t.soll))
    const x = { ist: fmtListe(r.teile.map(t => t.sicht), 1), soll: `≥ ${fmt(soll, 1)}`,
      detail: `v ${v} km/h, L ${fmtListe(L)} m, Gehgeschwindigkeit ${fmt(K.E3.werte.gehV, 1)} m/s (Z. 8.1), Anhaltesichtweite ${r.teile[0].sollAhs} m` }
    if (r.unterAhs) return ja(true, { ...x, staerke: 'hart', detail: `${x.detail}; unter der Anhaltesichtweite` })
    if (!r.imSpielraum) return ja(false, x)
    if (e3Ausnahme(k)) return ja(false, { ...x, soll: `≥ ${r.teile[0].sollAhs} (Ausnahme E3a)` })
    return ja(true, { ...x, staerke: 'weich', detail: `${x.detail}; über der Anhaltesichtweite, unter der Formel: Ermessensspielraum nach Z. 8.2` })
  },
  E3a: k => {
    const { r } = e3(k)
    if (r.unterAhs || !r.imSpielraum) return ja(false)
    return ja(e3Ausnahme(k), { ist: `${fgIst(k)} Querende, DTV ${k.w('dtv')}` })
  },

  // ── Q3 ──
  'Q3-1': k => ja(!k.w('innerorts') || !k.s('q3', 'bebaut')),
  'Q3-2': k => ja(k.s('q3', 'gewerbe')),
  'Q3-3': k => ja(k.s('q3', 'anschlussGewerbe')),
  // an einem Knoten quer über die einmündende Strasse: Einmündung bzw. Kreuzung über die Zufahrt ohne Vortritt (27.10.2026: auch eine
  // gegenüberliegende Einmündung, VSS 40 242 Tab. 2); Strecke, Kreisel und die Strasse mit Vortritt (Fall Q3-5) nicht
  'Q3-4': k => ja(!['einmuendung', 'knoten_belastet'].includes(k.w('lage'))),
  'Q3-5': k => ja(k.s('q3', 'ueber') === 'haupt'),
  'Q3-6': k => ja(k.s('q3', 'vSigHaupt') > K['Q3-6'].werte.vMax, { ist: `${k.s('q3', 'vSigHaupt')} km/h` }),
  'Q3-7': k => ja(k.s('q3', 'nEinm') > K['Q3-7'].werte.nMax),
  'Q3-8': k => ja(k.s('q3', 'nHaupt') > K['Q3-8'].werte.nMax),
  'Q3-9': k => ja(!k.s('q3', 'trottoirBeidseits')),
  'Q3-10': k => {
    const w = k.s('q3', 'winkel'), W = K['Q3-10'].werte
    return ja(w < W.min || w > W.max, { ist: `${w}°` })
  },
  'Q3-11': k => ja(!k.s('q3', 'knotensichtOk')),
  'Q3-12': k => ja(!k.s('q3', 'hvl5m')),
  'Q3-M1': k => ja(!k.s('q3', 'einmSiedlungsorientiert')),
  'Q3-M2': k => (k.s('q3', 'zoneEinm') === 'keine' || k.s('q3', 'eingangstor') ? ja(false) : ja(!k.s('q3', 'hauptInZone'))),
  'Q3-M3': k => ja(k.s('q3', 'wartezeitEinmS') > K['Q3-M3'].werte.wMax, { ist: `${k.s('q3', 'wartezeitEinmS')} s` }),
  'Q3-M4': k => ja(!k.s('q3', 'lkwGelegentlich')),
  'Q3-M5': k => ja(k.s('q3', 'linienbus')),
  'Q3-M6': k => ja(k.s('q3', 'veloSchule')),
  'Q3-M7': k => ja(k.s('q3', 'lsaKnoten')),
  'Q3-M8': k => ja(k.s('q3', 'kreisel')),
  'Q3-M9': k => (!k.s('q3', 'gegenueberEinm') ? ja(false) : ja(!k.s('q3', 'belastungSchwach'))),
  'Q3-M10': k => {
    const ab = K['Q3-M10'].werte.fgAb, fg = k.o('fg5h')
    const viel = fg !== null ? fg > ab : (() => {
      const kl = k.o('fgKlasse')
      if (kl === null) throw new Offen(['fg5h', 'fgKlasse'])
      return kl === '>500'
    })()
    return viel ? ja(k.s('q3', 'mivEinmHoch'), { detail: `Schwelle ${ab} Querende als Annahme` }) : ja(false)
  },
  'Q3-B': k => {
    const t = BERN_Q3[kTempo(k.s('q3', 'vSigEinm'))][k.s('q3', 'dtvEinm') < Q3_DTV_GRENZE ? 0 : 1]
    return ja(true, { ist: tabText(t) })   // ist geht in den Zusatz der Empfehlung (Bern-Tabelle: …), bleibt kurz
  },

  // ── F ──
  F1a: k => {
    const b = k.w('streifenBreite'), W = K.F1a.werte
    return ja(b < W.min, { ist: fmt(b), soll: `≥ ${fmt(W.min)}` })
  },
  F1b: k => {
    const b = k.w('streifenBreite'), W = K.F1b.werte
    return ja(b >= W.min && b < W.regel, { ist: fmt(b), soll: `${fmt(W.regel)} (Regel)` })
  },
  'F1-K': k => {
    if (!k.w('kantonsstrasse')) return null
    const b = k.w('streifenBreite'), W = K['F1-K'].werte
    return ja(b >= W.regel && b < W.viel, { ist: fmt(b) })
  },
  F1c: k => {
    const r = k.w('randAbstand'), W = K.F1c.werte
    return ja(Math.max(...r) > W.max, { ist: fmtListe(r), soll: `≤ ${fmt(W.max)}` })
  },
  F1d: k => {
    const a = k.w('achsWinkel'), W = K.F1d.werte
    return ja(Math.abs(a - W.recht) > W.tol, { ist: fmt(a, 1), soll: `${W.recht} ± ${W.tol} (Annahme)` })
  },
  F1e: k => (!k.w('busspur') ? null : ja(!k.w('busDurchmarkiert'))),
  F2: k => {
    if (!k.w('insel').vorhanden) return null
    const b = k.s('insel', 'breite'), W = K.F2.werte
    return ja(b < W.min, { ist: fmt(b), soll: `≥ ${fmt(W.min)}` })
  },
  F2b: k => {
    if (!k.w('insel').vorhanden) return null
    const b = k.s('insel', 'breite'), W = K.F2b.werte
    return ja(b >= W.min && b < W.regel, { ist: fmt(b), soll: `${fmt(W.regel)} (Regel)` })
  },
  F2c: k => (!k.w('insel').vorhanden ? null : ja(k.s('insel', 'breite') < K.F2c.werte.min, { ist: fmt(k.s('insel', 'breite')) })),
  F2d: k => {
    if (!k.w('insel').vorhanden) return null
    if (k.s('insel', 'art') !== 'markiert') return ja(false)
    const pflicht = k.hat('D1') || k.hat('D2') || k.hat('D3a')
    return ja(true, { staerke: pflicht ? 'hart' : 'weich', detail: pflicht ? 'eine Inselpflicht (D1, D2 oder D3a) besteht' : undefined })
  },
  F2e: k => {
    if (!k.insBaulich()) return null
    return ja(!k.s('insel', 'vertikal') || !k.s('insel', 'kopfErhoeht'))
  },
  F2f: k => {
    if (!k.insBaulich()) return null
    const u = k.s('insel', 'kopfUeberstand'), W = K.F2f.werte
    return ja(Math.min(...u) < W.min, { ist: fmtListe(u), soll: `≥ ${fmt(W.min)}` })
  },
  F2g: k => {
    if (!k.insBaulich()) return null
    const h = k.s('insel', 'pfostenH'), W = K.F2g.werte
    return ja(h > W.max, { ist: fmt(h), soll: `≤ ${fmt(W.max)}` })
  },
  // Korrektur 23.10.2026: auch ein Durchgang unter der Skizzenbreite 1,20 m ist ein Hinweis
  'F2-B': k => {
    if (!k.w('insel').vorhanden) return null
    const f = k.s('insel', 'furt'), W = K['F2-B'].werte
    return ja(!(f > 0) || f < W.furt - EPS, f > 0 ? { ist: fmt(f) } : {})
  },
  // Nutzerentscheid 23.10.2026: nur, wenn Velos queren und auf der Insel warten (nicht mehr bei Radstreifen entlang der Strasse), nur
  // an einer gebauten Insel; ohne Insel, mit markierter Insel bzw. ohne querende Velos nicht anwendbar, auch wenn das andere Feld offen ist
  'F2-K': k => {
    const i = k.o('insel')
    if (i?.vorhanden === false || (i?.vorhanden && i.art === 'markiert') || k.o('veloQuerung') === false) return null
    if (!k.insBaulich() || !k.w('veloQuerung')) return null
    return ja(k.s('insel', 'breite') < K['F2-K'].werte.min, { ist: fmt(k.s('insel', 'breite')) })
  },
  F3: k => {
    if (!k.insBaulich()) return null
    const d = k.w('durchfahrt'), W = K.F3.werte
    const kl = d.map(f3Klasse)
    const soll = `${fmt(W.ideal)} (mind. ${fmt(W.min)}) bis ${fmt(W.schmalMax)} oder ≥ ${fmt(W.breitIdeal)} (mind. ${fmt(W.breitMin)})`
    const weich = kl.some(c => c === 'schmal' || c === 'band')
    const hinweis = kl.some(c => c === 'knapp')
    const text: Record<string, string> = { schmal: 'zu schmal', band: 'Konfliktband Lastwagen–Velo', knapp: 'unter dem Idealmass' }
    const detail = d.map((x, i) => `Seite ${i + 1}: ${fmt(x)} m${kl[i] ? ` ${text[kl[i]!]}` : ''}`).join('; ')
    return ja(weich || hinweis, { staerke: weich ? 'weich' : 'hinweis', ist: fmtListe(d), soll, detail })
  },
  'F3-M': k => {
    if (!k.inselMarkiert()) return null
    const W = K['F3-M'].werte, d = k.w('durchfahrt'), b = k.s('insel', 'breite'), B = k.w('fahrbahnB')
    const weich = d.some(x => x < W.d) || b < W.inselMin
    const hinweis = B < W.bMin || B > W.bMax
    const teile: string[] = []
    if (d.some(x => x < W.d)) teile.push(`Fahrstreifen ${fmtListe(d)} m unter ${fmt(W.d, 1)} m`)
    if (b < W.inselMin) teile.push(`Insel ${fmt(b)} m unter ${fmt(W.inselMin, 1)} m`)
    if (hinweis) teile.push(`Fahrbahn ${fmt(B)} m ausserhalb ${fmt(W.bMin, 1)} bis ${fmt(W.bMax, 1)} m`)
    return ja(weich || hinweis, { staerke: weich ? 'weich' : 'hinweis', ist: fmtListe(d), soll: `≥ ${fmt(W.d)} (markierte Insel)`, detail: teile.join('; ') || undefined })
  },
  'F3-B': k => {
    if (k.o('insel')?.vorhanden === false || k.o('radstreifen') === false) return null
    if (!k.w('insel').vorhanden || !k.w('radstreifen')) return null
    const d = k.w('durchfahrt'), W = K['F3-B'].werte
    const schmal = d.some(x => x < W.min), breit = d.some(x => x > W.max)
    const st: Staerke = schmal ? 'weich' : 'hinweis'
    return ja(schmal || breit, { staerke: st, ist: fmtListe(d), soll: `${fmt(W.min)} bis ${fmt(W.max)} (mit Radstreifen)` })
  },
  F4a: k => {
    if (!k.w('einengung')) return null
    const kl = k.w('mivKlasse'), W = K.F4a.werte
    if (kl === 'hoch') return null
    const min = kl === 'tief' ? W.tief : W.mittel, r = k.w('restbreiteM')
    return ja(r < min, { ist: fmt(r), soll: `≥ ${fmt(min)} (bei ${kl === 'tief' ? 'wenig' : 'mittlerem'} Autoverkehr)` })
  },
  F4b: k => {
    if (!k.w('einengung')) return null
    const l = k.w('einengungLaengeM'), W = K.F4b.werte
    return ja(l < W.min || l > W.max, { ist: fmt(l), soll: `${fmt(W.min)} bis ${fmt(W.max)}` })
  },
  F4c: k => {
    if (k.o('typ') !== 'fgs' || !k.w('einengung')) return null
    const l = k.w('einengungLaengeM'), W = K.F4c.werte
    return ja(l < W.min, { ist: fmt(l), soll: `≥ ${fmt(W.min)} (Bern, mit FGS)` })
  },
  F5a: k => {
    if (k.o('typ') !== 'trottoirueberfahrt') return null
    const b = k.s('q3', 'breiteM'), W = K.F5a.werte
    const weich = b < W.min || b > W.max
    const hinweis = !weich && (b < W.regelMin || b > W.regelMax)
    return ja(weich || hinweis, { staerke: weich ? 'weich' : 'hinweis', ist: fmt(b), soll: `${fmt(W.regelMin)} bis ${fmt(W.regelMax)}` })
  },
  F5b: k => {
    if (k.o('typ') !== 'trottoirueberfahrt') return null
    const a = k.w('q3').anrampung, W = K.F5b.werte
    if (!a) return null
    return ja(a.neigung < W.nMin || a.neigung > W.nMax || a.laenge < W.lMin, { ist: `${a.neigung} %, ${fmt(a.laenge)} m` })
  },
  // Ausstattung der Trottoirüberfahrt (VSS 40 242 Tab. 3): nur Typ Trottoirüberfahrt, Handangaben
  F5c: k => (k.o('typ') !== 'trottoirueberfahrt' ? null : ja(!k.s('q3', 'randDurchgehend'))),
  F5d: k => {
    if (k.o('typ') !== 'trottoirueberfahrt') return null
    const l = k.s('q3', 'ueberfahrbarM'), W = K.F5d.werte
    return ja(l > W.max, { ist: fmt(l), soll: `≤ ${fmt(W.max)}` })
  },
  // Randsteine bzw. Markierung an den Einlenkern: Soll; ganz ohne Begrenzung nur Hinweis auf Poller beidseits (27.10.2026)
  F5e: k => {
    if (k.o('typ') !== 'trottoirueberfahrt') return null
    const b = k.s('q3', 'begrenzung')
    if (b === 'keine') return ja(true, { staerke: 'hinweis', text: 'Poller oder Pfosten beidseits empfohlen (VSS 40 242 Z. 18, S. 22)' })
    return ja(b === 'randstein', { staerke: 'weich' })
  },
  F5f: k => (k.o('typ') !== 'trottoirueberfahrt' ? null : ja(!k.s('q3', 'erkennbar'))),
  F5g: k => (k.o('typ') !== 'trottoirueberfahrt' ? null : ja(['wechsel', 'beides'].includes(k.s('q3', 'belag')))),
  F5h: k => (k.o('typ') !== 'trottoirueberfahrt' ? null : ja(['absatz', 'beides'].includes(k.s('q3', 'belag')))),
  F5i: k => {
    if (k.o('typ') !== 'trottoirueberfahrt') return null
    const g = k.s('q3', 'quergefaelle'), W = K.F5i.werte
    if (g > W.max) return ja(true, { staerke: 'hart', ist: `${fmt(g, 1)} %`, soll: `≤ ${W.max} %` })
    return ja(g > W.regel, { staerke: 'hinweis', ist: `${fmt(g, 1)} %`, soll: `${W.regel} % (in der Regel)`, text: `Quergefälle über ${W.regel} %: in der Regel ${W.regel} %` })
  },
  F5j: k => {
    if (k.o('typ') !== 'trottoirueberfahrt') return null
    const r = k.s('q3', 'randabschluss')
    if (r === 'anderer') return ja(true, { staerke: 'weich' })
    return ja(r !== 's0625', { staerke: 'hinweis', text: 'Schmalerer bzw. niedrigerer Randabschluss: für Sehbehinderte schlechter ertastbar' })
  },
  F5k: k => (k.o('typ') !== 'trottoirueberfahrt' ? null : ja(!k.s('q3', 'randsteineSenkrecht'))),
  F5l: k => (k.o('typ') !== 'trottoirueberfahrt' ? null : ja(k.s('q3', 'signalisation'))),
  F5m: k => (k.o('typ') !== 'trottoirueberfahrt' ? null : ja(k.s('q3', 'markierung'))),
  F5n: k => {
    if (k.o('typ') !== 'trottoirueberfahrt') return null
    const b = k.w('q3').breiteM ?? null, breit = b !== null && b > K.F5n.werte.breiteZweite
    const zweite = `Überfahrt breiter als ${fmt(K.F5n.werte.breiteZweite)} m: zweite Leitlinie nötig`
    if (!k.s('q3', 'taktil')) return ja(true, { staerke: 'hart', ...(breit ? { detail: zweite } : {}) })
    return ja(breit, { staerke: 'hinweis', text: zweite })
  },
  F6a: k => {
    if (k.o('typ') !== 'mehrzweck') return null
    const m = k.w('mzsBreiteM'), W = K.F6a.werte
    return ja(m < W.min, { ist: fmt(m), soll: `≥ ${fmt(W.min)}` })
  },
  F6b: k => {
    if (k.o('typ') !== 'mehrzweck') return null
    const m = k.w('mzsBreiteM'), W = K.F6b.werte
    return ja(m >= W.min && m < W.regel, { ist: fmt(m), soll: `${fmt(W.regel)} (Regel)` })
  },
  // Korrektur 23.10.2026: zweistufig, über 30 bis 40 km/h Hinweis, über 40 km/h Soll verletzt
  F6c: k => {
    if (k.o('typ') !== 'mehrzweck') return null
    const v = k.v85e(), W = K.F6c.werte
    return ja(v > W.vMax, { staerke: v > W.vGrenze ? 'weich' : 'hinweis', ist: `V85 ${v} km/h`, soll: `≤ ${W.vMax} km/h (allenfalls ${W.vGrenze})` })
  },
  F7a: k => {
    const r = k.w('randabschluss'), W = K.F7a.werte
    if (r.art === 'hoch') return ja(true, { ist: 'hoher Randabschluss' })
    const h = k.s('randabschluss', 'hoeheMm')
    if (r.art === 'vertikal') return ja(Math.abs(h - W.vertikal) > W.tol, { ist: `${h} mm vertikal`, soll: `${W.vertikal} ± ${W.tol} mm` })
    const b = k.s('randabschluss', 'breiteM')
    return ja(Math.abs(h - W.schraeg) > W.tol || b < W.bMin || b > W.bMax,
      { ist: `${h} mm schräg auf ${fmt(b)} m`, soll: `${W.schraeg} ± ${W.tol} mm auf ${fmt(W.bMin)} bis ${fmt(W.bMax)} m` })
  },
  F7b: k => (k.w('randabschluss').art !== 'schraeg' ? null : ja(k.w('quergefaelle') > K.F7b.werte.max, { ist: `${k.w('quergefaelle')} %` })),
  F7c: k => {
    const a = k.w('absenkung')
    return ja(a > K.F7c.werte.max, { ist: String(a), soll: `≤ ${K.F7c.werte.max}` })
  },
  F7d: k => (k.w('absenkung') > 0 ? ja(false) : ja(!k.w('taktil'))),
  F7e: k => {
    const W = K.F7e.werte
    const schraeg = Math.abs(k.w('achsWinkel') - W.recht) > W.tol
    if (!schraeg && !k.w('querungLang')) return ja(false)
    return ja(!k.w('leitlinie'))
  },

  // ── G ──
  G1: k => {
    const d = k.w('abstandFgsM'), W = K.G1.werte
    if (k.ganzeStrasse('abstandFgsM')) return ganzeStrasse(d, 'Kein weiterer Fussgängerstreifen auf dieser Strasse möglich')
    const x = { ist: fmt(d, 0), soll: `≥ ${W.min}` }
    if (d >= W.min) return ja(false, x)
    // Runde 5 (Stelle 31): die Ausnahme steht beim Wert (Masse: «zulässig», nicht «erfüllt»)
    if (k.w('verzweigung')) return ja(false, { ...x, ausnahme: 'an der Verzweigung zulässig' })
    if (k.w('haltestelleAngrenzend')) return ja(false, { ...x, ausnahme: 'bei der Haltestelle zulässig' })
    return ja(true, x)
  },
  G2: k => {
    if (k.mitLsa()) return null
    const d = k.w('abstandLsaM'), W = K.G2.werte
    if (k.ganzeStrasse('abstandLsaM')) return ganzeStrasse(d, 'Kein Lichtsignal auf dieser Strasse')
    const x = { ist: fmt(d, 0), soll: `≥ ${W.min}` }
    if (d >= W.min) return ja(false, x)
    return ja(!k.w('verzweigungErkennbar'), x)
  },
  G3: k => {
    const d = k.w('wunschlinieM'), W = K.G3.werte
    return ja(d > W.max, { ist: fmt(d, 1), soll: `≤ ${W.max}` })
  },
  // Korrektur S8: nur verlangen, was nötig ist; mündet der Weg nicht direkt und verdeckt, sind Versatz und Schranke ohne Belang
  G3b: k => {
    const f = k.o('fusswegAchse')
    if (f === null) throw new Offen(['fusswegAchse.rechtwinkligUneinsehbar'])
    if (!f.rechtwinkligUneinsehbar) return ja(false)
    return ja(!k.s('fusswegAchse', 'versatz') && !k.s('fusswegAchse', 'umlaufschranke'))
  },
  G4: k => (k.w('signal411') ? ja(false) : ja(k.w('lage') !== 'knoten_belastet')),
  G4b: k => (!k.insBaulich() ? null : ja(!k.w('signal411Insel'))),
  G5: k => ja(k.w('annaeherungUeberfahrbar')),
  G5b: k => ja(k.w('einAusfahrtNah')),
  G6: k => {
    if (k.w('lage') !== 'knoten_belastet') return null
    const r = k.w('rueckversatzM'), W = K.G6.werte
    return ja(r < W.min, { ist: fmt(r, 1), soll: `≥ ${W.min}` })
  },
  'G6-B': k => {
    if (!istKnoten(k.w('lage'))) return null
    const r = k.w('rueckversatzM'), W = K['G6-B'].werte
    if (r > W.max) return ja(true, { ist: fmt(r, 1) })
    return ja(r > 0 && k.w('strassentyp') === 'siedlungsorientiert', { ist: fmt(r, 1) })
  },
  G7: k => {
    if (!k.w('haltenSichtrelevantUeber5m')) return null
    if (k.w('haltenSonstVerboten')) return ja(false)
    const h = k.w('hvl'), W = K.G7.werte
    if (!h.vorhanden) return ja(true, { ist: 'keine', soll: `≥ ${W.min}` })
    const L = k.s('hvl', 'laengeM'), soll = Math.max(W.min, k.w('hvlBedarfM'))
    const x = { ist: fmt(L, 1), soll: `≥ ${fmt(soll, 1)}` }
    if (L < soll - EPS) return ja(true, x)
    if (!k.w('zweirichtung') && !k.s('hvl', 'beidseits')) return ja(true, { ...x, detail: 'Einbahnstrasse: Linie auf beiden Seiten nötig' })
    return ja(false, x)
  },
  G7b: k => (!k.w('hvl').vorhanden ? null : ja(!k.w('haltenSichtrelevantUeber5m'))),
  G8a: k => ja(!k.w('beleuchtung')),
  G8b: k => (!k.w('beleuchtung') ? null : ja(!k.w('schattenfrei'))),
  G9: k => (!k.w('reklameUnter20m') ? ja(false) : ja(!k.w('reklameAusnahme'))),
  G10a: k => ja(k.w('blinklicht') === 'nicht_ssv'),
  G10b: k => ja(k.w('blinklicht') === 'gelb_ssv'),

  // ── H ──
  H1: k => {
    const h = hSoll(k), sicht = k.w('sichtVorh')
    const verletzt = sicht.some(s => s < h.soll)
    if (h.offenV85 && !verletzt) throw new Offen(['v85'])
    return ja(verletzt, { ist: fmtListe(sicht, 1), soll: `≥ ${fmt(h.soll, 0)}`, detail: h.text, normHinweis: h.normHinweis })
  },
  // Sicht vom Velo (29.10.2026): nur aus dem Sichtrechner (befundblatt.ts), ohne Eingabe
  'H1-V': () => null,
  H1b: k => {
    const v85 = k.o('v85')
    if (v85 === null) return null
    if (!k.w('anzeichenSchneller') && !k.w('v85Nachweis')) return null
    return ja(v85 > k.w('vSig'), { ist: `V85 ${v85} km/h` })
  },
  H2: k => {
    const kurve = k.w('kurve')
    if (!kurvenregelGilt(k)) return ja(false)
    const t = sichtKurveTab2(kurve.radiusStrasse!)
    return ja(t !== null, t !== null ? { soll: `≥ ${t.sicht}`, detail: `Radius ${fmt(kurve.radiusStrasse!, 0)} m`, normHinweis: hinweisTab2(t) } : {})
  },
  H3a: k => {
    const S = hSollSicher(k), E = k.w('erkennungM')
    return ja(E < S, { ist: fmt(E, 0), soll: `≥ ${fmt(S, 0)}` })
  },
  H3b: k => {
    const S = hSollSicher(k), E = k.w('erkennungM'), f = K.H3b.werte.faktor
    return ja(E >= S && E < f * S, { ist: fmt(E, 0), soll: `≥ ${fmt(f * S, 0)} (doppelte Sichtweite)` })
  },
  H4: k => {
    // ohne Kurve (bzw. ohne Angabe zur Kurve) nicht anwendbar, nicht offen
    const r = k.o('kurve')?.radius ?? null
    if (r === null) return null
    if (r >= K.H4.werte.rMax) return ja(false)
    const [sw] = sichtweiteKurve(r)
    return ja(true, { ist: `Radius ${fmt(r, 1)} m`, soll: `${sw} m` })
  },

  // ── I ──
  I1: k => {
    const W = K.I1.werte, L = k.s('lsaZeiten', 'L'), g = k.s('lsaZeiten', 'gelb')
    const zul = gelbZulaessig(L, W.anteil, W.gehV, W.min, W.max)
    return ja(!zul.includes(g), { ist: String(g), soll: zul.join(' oder ') })
  },
  I2: k => {
    const W = K.I2.werte, L = k.s('lsaZeiten', 'L'), f = k.s('lsaZeiten', 'freigabe')
    const soll = freigabeSollNorm(L, W.anteil, W.gehV, W.min)
    return ja(f < soll - EPS, { ist: fmt(f, 1), soll: `≥ ${fmt(soll, 2)}` })
  },
  I3a: k => {
    const z = k.w('lsaZeiten')
    if (!z.teile) return null
    if (!k.s('lsaZeiten', 'phasengleich')) return null
    const W = K.I3a.werte, f = k.s('lsaZeiten', 'freigabe')
    const soll = freigabeSollInsel(z.teile[0], k.s('lsaZeiten', 'inselB'), z.teile[1], W.anteil, W.gehV)
    return ja(f < soll - EPS, { ist: fmt(f, 1), soll: `≥ ${fmt(soll, 2)}` })
  },
  I3b: k => {
    const z = k.w('lsaZeiten')
    if (!z.teile || k.s('lsaZeiten', 'phasengleich')) return null
    return ja(!k.s('lsaZeiten', 'beideRichtungenImZyklus'))
  },
  I4: k => {
    const W = K.I4.werte, L = k.s('lsaZeiten', 'L'), f = k.s('lsaZeiten', 'freigabe'), g = k.s('lsaZeiten', 'gelb')
    return ja(W.gehV * (f + g) < L - EPS, { ist: `${fmt(W.gehV * (f + g), 1)} m`, soll: `≥ ${fmt(L, 1)} m` })
  },
  I5: k => {
    if (!k.s('lsaZeiten', 'abbiegerKonflikt')) return null
    const v = k.s('lsaZeiten', 'vorstart'), W = K.I5.werte
    return ja(v < W.min || v > W.max, { ist: String(v), soll: `${W.min} bis ${W.max}` })
  },
  I6: k => {
    const w = k.s('lsaZeiten', 'wartezeit'), W = K.I6.werte
    return ja(w > W.max, { ist: String(w), soll: `≤ ${W.max}` })
  },
  'I6-B': k => {
    const st = wartestufe(k.s('lsaZeiten', 'wartezeit'), k.w('insel').vorhanden)
    if (st === 'A/B' || st === 'C') return ja(false, { ist: `Stufe ${st}` })
    return ja(true, { staerke: st === 'E' || st === 'F' ? 'weich' : 'hinweis', ist: `Stufe ${st}` })
  },
  'I7-B1': k => {
    const f = k.s('lsaZeiten', 'freigabe'), W = K['I7-B1'].werte
    return ja(f < W.min, { ist: fmt(f, 1), soll: `≥ ${W.min}` })
  },
  'I7-B2': k => {
    if (k.w('insel').vorhanden) return null
    const W = K['I7-B2'].werte, L = k.s('lsaZeiten', 'L')
    const fg = k.s('lsaZeiten', 'freigabe') + k.s('lsaZeiten', 'gelb')
    return ja(fg < L / W.gehV - EPS, { ist: `${fmt(fg, 1)} s`, soll: `≥ ${fmt(L / W.gehV, 1)} s` })
  },
  'I7-B3': k => {
    if (!k.w('insel').vorhanden || k.s('lsaZeiten', 'inselGeraet') || !k.s('lsaZeiten', 'inselNurAnmeldung')) return null
    const W = K['I7-B3'].werte, L = k.s('lsaZeiten', 'L'), g = k.s('lsaZeiten', 'gelb')
    const soll = rundeBern(W.anteil * L / W.gehV, W.schwelle) + W.zuschlag
    return ja(g < soll, { ist: String(g), soll: `≥ ${soll}` })
  },
  'I7-B4': k => {
    const W = K['I7-B4'].werte, L = k.s('lsaZeiten', 'L'), f = k.s('lsaZeiten', 'freigabe')
    const soll = rundeBern(W.anteil * L / W.gehV, W.schwelle)
    return ja(f < soll, { ist: fmt(f, 1), soll: `≥ ${soll}` })
  },
  I8: k => (!k.w('insel').vorhanden ? null : ja(!k.s('lsaZeiten', 'inselGeraet'))),
}
