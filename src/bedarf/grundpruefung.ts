// ── Bedarfsmodul: Grundprüfung nach bfu MS.013-2025 (Big Five) ──
//
// Eigene Regeln (Katalog Gruppe B5) strikt nach der bfu-Fachdokumentation Fussgängerstreifen, Ziff. 2.1 bis 2.3, mit deren Werten
// und Stärken nach Wortlaut (Nutzerentscheid 20.10.2026). Je Punkt ein Zustand erfüllt / verletzt (rot hart, gelb weich) / offen /
// Hinweis; anders als das Befundblatt (nur Verletzungen und Offenes) mit ausdrücklichem «erfüllt». Unabhängig von den Ebenen-
// Schaltern, nicht im Entscheidbaum (keine Doppelungen im Befundblatt). Gilt nur für Fussgängerstreifen ohne Lichtsignalanlage.
//
// Sicht (Punkt 1): mit vorhandener Sichtweite von Hand die kleinste gegen das Soll der Querung; sonst je Zufahrt das Ergebnis des
// Sichtrechners (frei bzw. verdeckt). Der Sichtrechner prüft nach dem signalisierten Tempo (VSS 40 241 Tab. 1, gleiche Werte wie die
// bfu) bzw. im Knoten nach Kurvenradius (bfu Tab. 1) und geometrischen Grenzen (bis Knoten, Wegende, Gebäude). Für gerade Zufahrten
// setzt die Grundprüfung die Stufe nach V85 (bei geometrischer Grenze höchstens deren Länge); Abbieger behalten das Soll des
// Sichtrechners. Frei auf einer kürzeren Strecke als nötig bzw. verdeckt auf einer längeren Strecke ist offen, nicht erfüllt bzw.
// verletzt. Unsichere Soll-Werte (Stufe 60 ohne Angabe innerorts, Kurvenradius von Hand ohne Zuordnung der Zufahrt) als Bereich:
// verletzt nur unter der unteren, erfüllt nur ab der oberen Grenze, dazwischen offen.

import { KATALOG, quellText, type GrundId } from './katalog'
import { Kontext, Offen } from './kontext'
import { bfuDurchfahrtOk } from './durchfahrt'
import { QUELLEN_ANNAHME, type BedarfEingaben } from './eingaben'
import { feldName } from './felder'
import type { RegelDef, Staerke } from './typen'

export type GrundZustand = 'erfuellt' | 'verletzt' | 'offen' | 'hinweis'

/** Ergebnis einer Regel der Grundprüfung */
export interface GrundTeil {
  id: GrundId
  /** kurzer Name der geprüften Grösse (neutral, auch für «erfüllt») */
  name: string
  zustand: GrundZustand
  /** Stärke bei verletzt (hart rot, weich gelb) */
  staerke: Staerke | null
  /** Ergebnistext aus dem Katalog (bei verletzt bzw. Hinweis) */
  text: string
  quelle: string
  ist?: string
  soll?: string
  detail?: string
  fehlend?: string[]
  normHinweis?: string
}

export interface GrundPunkt {
  /** T = Tempo (Vorbedingung), 1 bis 5 = Big Five */
  nr: 'T' | '1' | '2' | '3' | '4' | '5'
  titel: string
  zustand: GrundZustand
  staerke: Staerke | null
  teile: GrundTeil[]
  /** feste Hinweise ohne Einfluss auf den Zustand (Erkennbarkeit, Retroreflexion, Forschung) */
  notizen: GrundTeil[]
}

export interface Grundpruefung {
  /** false: Querungstyp ist kein Fussgängerstreifen ohne Lichtsignal */
  gilt: boolean
  grund?: string
  punkte: GrundPunkt[]
  /** weitere bfu-Punkte (DTV, Annäherungsbereich, Fahrbahnhaltestelle) */
  weitere: GrundTeil[]
  annahmen: string[]
}

/** Sicht je Zufahrt aus dem Sichtrechner (Befundblatt, nur Fussgängerstreifen ohne Lichtsignal) */
export interface GrundSicht {
  name: string
  /** Tempo der Zufahrt im Sichtrechner [km/h] */
  tempo: number
  /** geprüfte Sichtweite (Soll des Sichtrechners) [m] */
  soll: number
  /** Herkunft des Solls im Sichtrechner, z. B. VSS Tab. 1, bfu, bis Knoten */
  quelle: string
  frei: boolean
  status: string
  bisM?: number
  /** Abbiegezufahrt: Soll des Sichtrechners gilt (Kurvenradius bzw. Tempo der Querstrasse), V85 der Querung nicht */
  abbiegend?: boolean
}

export interface GrundOptionen {
  /** Sicht je Zufahrt aus dem Sichtrechner; leer bzw. fehlt: nur vorhandene Sichtweite von Hand */
  sicht?: GrundSicht[]
  /** Fussgängerstreifen der Querung ohne geprüfte Zufahrt (Name): Sicht offen */
  ohneZufahrt?: string[]
  /** Teilstreifen teils Fussgängerstreifen, teils ohne Vortritt: Grundprüfung gilt nicht */
  gemischt?: boolean
}

/** Rohergebnis einer Regel; null = hier nicht anwendbar. Fehlt eine Eingabe, wirft der Kontext Offen */
interface Roh {
  zustand: GrundZustand
  staerke?: Staerke
  ist?: string
  soll?: string
  detail?: string
  fehlend?: string[]
  normHinweis?: string
}
type GrundFn = (k: Kontext, o: GrundOptionen) => Roh | null

const K = KATALOG
const EPS = 1e-9
const fmt = (n: number, d = 2): string => n.toFixed(d).replace('.', ',')
/** Zahl für die Anzeige: ganz ohne Nachkommastelle, sonst eine Stelle mit Komma */
const zahl = (n: number): string => (Number.isInteger(n) ? String(n) : fmt(n, 1))
const m0 = (n: number): string => `${zahl(n)} m`
const ok = (x: Omit<Roh, 'zustand'> = {}): Roh => ({ zustand: 'erfuellt', ...x })
const verletzt = (x: Omit<Roh, 'zustand'> = {}): Roh => ({ zustand: 'verletzt', ...x })

const W1 = K['B5-1'].werte
/** Sichtweite nach Tempo (bfu Ziff. 2.1): Zwischenwerte zur nächsthöheren Stufe, über 60 km/h keine Stufe (null) */
export function sollTempo(v: number, innerorts = true): { soll: number; stufe: number } | null {
  const stufen: [number, number][] = [[30, W1.v30], [40, W1.v40], [50, W1.v50], [60, innerorts ? W1.v60 : W1.v60ausserorts]]
  const s = stufen.find(([t]) => v <= t + EPS)
  return s ? { stufe: s[0], soll: s[1] } : null
}
/** Sichtweite im Knoten nach Kurvenradius in Fahrstreifenmitte (bfu Tab. 1): Zwischenwerte zur nächstgrösseren Stufe, über 20 m null */
export function sollKnoten(r: number): { soll: number; stufe: number } | null {
  const stufen: [number, number][] = [[5, W1.r5], [10, W1.r10], [15, W1.r15], [20, W1.r20]]
  const s = stufen.find(([t]) => r <= t + EPS)
  return s ? { stufe: s[0], soll: s[1] } : null
}

/**
 * Bereich der Sichtweite nach Tempo: unten = oben, ausser bei Stufe 60 km/h ohne Angabe innerorts (innerorts 75, ausserorts 100 m;
 * nicht stillschweigend 75 m). null: über 60 km/h keine Stufe.
 */
interface Bereich { unten: number; oben: number; stufe: number; offenWegen?: string }
export function sollBereich(v: number, innerorts: boolean | null): Bereich | null {
  const t = sollTempo(v, innerorts !== false)
  if (!t) return null
  if (innerorts === null && t.stufe === 60) return { unten: W1.v60, oben: W1.v60ausserorts, stufe: 60, offenWegen: 'innerorts' }
  return { unten: t.soll, oben: t.soll, stufe: t.stufe }
}
/** Soll als Text; oben null (Knoten, Tempo der geraden Zufahrten offen): untere Grenze mit Vermerk */
const bereichText = (u: number, o: number | null): string =>
  (o === null ? `≥ ${zahl(u)} m (gerade Zufahrten offen)` : u === o ? `≥ ${zahl(u)} m` : `${zahl(u)} bis ${zahl(o)} m`)

const ANNAHME_V85 = 'V85 fehlt: Sichtweite nach dem signalisierten Tempo (Annahme)'
const OFFEN_INNERORTS = 'Stufe 60 km/h: Soll 75 m (innerorts) bzw. 100 m (ausserorts), Angabe innerorts fehlt'
/** Normhinweise zur Sicht (B5-1): Radius unter 20 m führt die erweiterte Prüfung als Hinweis (H4), bei 20 m gilt H2 */
const hinweisKnoten = (r: number): string => (r >= 20 - EPS
  ? 'Norm: VSS 40 241:2019 Tab. 2 nennt bei Radius 20 m 30 m und gilt nur unter Voraussetzungen; die erweiterte Prüfung nimmt dort wie die Sichtprüfung 24 m (H2).'
  : 'Norm: VSS 40 241:2019 Tab. 2 beginnt erst bei Radius 20 m (30 m) und gilt nur unter Voraussetzungen; die bfu-Werte führt die erweiterte Prüfung als Hinweis (H4).')
const hinweisVsig = (sollSig: number): string =>
  `Norm: VSS 40 241:2019 Z. 14 rechnet grundsätzlich mit dem signalisierten Tempo (${zahl(sollSig)} m), mit V85 nur bei Anzeichen bzw. Messung (H1).`

/** Soll der Querung als Bereich: verletzt unter unten, erfüllt ab oben (oben null: nie sicher erfüllt), dazwischen offen mit grund */
interface SollQ { unten: number; oben: number | null; text: string; grund?: string; fehlend?: string[]; normHinweis?: string }

/**
 * Soll der Querung (Sichtweite von Hand, Erkennungsdistanz): Stufe nach V85 (fehlt: signalisiertes Tempo als Annahme). Mit
 * Kurvenradius bis 20 m (Knoten, bfu Tab. 1) gilt der Radius nur für die Abbiegelinie; welche Zufahrt von Hand das ist, ist offen:
 * unter dem Knoten-Soll verletzt, ab dem Soll nach V85 erfüllt, dazwischen offen. null: über 60 km/h keine Stufe und kein Knoten.
 */
function sollQuerung(k: Kontext): SollQ | null {
  const r = k.o('kurve')?.radius ?? null
  const kn = r !== null ? sollKnoten(r) : null
  const v85 = k.o('v85'), io = k.o('innerorts')
  let t: Bereich | null = null, tText = '', normHinweis: string | undefined, vFehlt = false
  if (v85 === null) {
    const vSig = kn ? k.o('vSig') : k.w('vSig')
    if (vSig === null) vFehlt = true
    else {
      k.annahmen.add(ANNAHME_V85)
      t = sollBereich(vSig, io)
      tText = t ? `Stufe ${t.stufe} km/h (signalisiert, V85 fehlt)` : 'über 60 km/h keine Stufe'
    }
  } else {
    t = sollBereich(v85, io)
    tText = t ? `Stufe ${t.stufe} km/h (V85 ${zahl(v85)} km/h)` : 'über 60 km/h keine Stufe'
    const vSig = k.o('vSig')
    const tSig = vSig !== null ? sollBereich(vSig, io) : null
    if (t && tSig && t.unten === t.oben && tSig.unten === tSig.oben && tSig.unten !== t.unten) normHinweis = hinweisVsig(tSig.unten)
  }
  const fehltIo = t?.offenWegen ? ['innerorts'] : undefined
  if (kn) {
    const oben = t ? Math.max(kn.soll, t.oben) : null
    return { unten: kn.soll, oben, text: `Knoten, Kurvenradius ${zahl(r!)} m: ${kn.soll} m (bfu Tab. 1); gerade Zufahrten ${tText || 'Tempo offen'}`,
      grund: 'Zuordnung Zufahrt zur Abbiegelinie offen: Sichtweite je Zufahrt prüfen', fehlend: vFehlt ? ['vSig'] : fehltIo,
      normHinweis: hinweisKnoten(r!) }
  }
  if (!t) return null
  return { unten: t.unten, oben: t.oben, text: tText, grund: t.offenWegen ? OFFEN_INNERORTS : undefined, fehlend: fehltIo, normHinweis }
}

/** Sicht je Zufahrt aus dem Sichtrechner gegen das Soll nach bfu */
function sichtRechner(k: Kontext, zs: GrundSicht[], ohneZufahrt: string[]): Roh {
  const v85 = k.o('v85'), io = k.o('innerorts')
  type Z = { z: GrundSicht; unten: number | null; oben: number | null; zustand: GrundZustand; text: string; kurz?: number; v85?: boolean; fehlt?: string }
  const liste: Z[] = zs.map(z => {
    let unten = z.soll, oben = z.soll, nachV85 = false, fehlt: string | undefined
    if (!z.abbiegend) {
      // gerade Zufahrt: Stufe nach V85; geometrische Grenze bzw. Kurvenregel des Sichtrechners (bis Knoten, Wegende, Gebäude,
      // Kreiselring) bleibt Obergrenze, das Soll ist dann min(Tab. 1 nach V85, Soll des Sichtrechners)
      if (v85 === null) k.annahmen.add(ANNAHME_V85)
      else nachV85 = true
      const t = sollBereich(v85 ?? z.tempo, io)
      if (!t) return { z, unten: null, oben: null, zustand: 'offen', text: `${z.name}: über 60 km/h keine Sichtweite` }
      if (z.quelle === 'VSS Tab. 1') { unten = t.unten; oben = t.oben } else { unten = Math.min(t.unten, z.soll); oben = Math.min(t.oben, z.soll) }
      fehlt = oben > unten ? t.offenWegen : undefined
    } else if (z.quelle === 'VSS Tab. 1') {
      // abbiegende Zufahrt nach dem Tempo der Querstrasse (ohne V85 der Querung): bei 60 km/h wie gerade Zufahrten 75 m innerorts,
      // 100 m ausserorts, Angabe innerorts offen: Bereich
      const t = sollBereich(z.tempo, io)
      if (t) { unten = t.unten; oben = t.oben; fehlt = oben > unten ? t.offenWegen : undefined }
    }
    const bis = z.bisM !== undefined ? Math.min(z.bisM, z.soll) : z.soll
    const x = { z, unten, oben, v85: nachV85, fehlt }
    if (z.frei) {
      if (bis >= oben - EPS) return { ...x, zustand: 'erfuellt', text: `${z.name}: frei` }
      return { ...x, zustand: 'offen', kurz: bis, text: `${z.name}: frei bis ${m0(bis)}, nötig ${unten === oben ? m0(oben) : `${zahl(unten)} bis ${m0(oben)}`} (nicht geprüft)` }
    }
    if (z.soll <= unten + EPS) return { ...x, zustand: 'verletzt', text: `${z.name}: ${z.status} innerhalb ${m0(z.soll)}` }
    return { ...x, zustand: 'offen', text: `${z.name}: ${z.status} innerhalb ${m0(z.soll)}; ob ${m0(unten)} frei sind, nicht getrennt geprüft` }
  })
  const leer = ohneZufahrt.map(n => `${n}: keine Zufahrt geprüft`)
  const mit = liste.filter(x => x.unten !== null)
  const solls = [...new Set(mit.map(x => bereichText(x.unten!, x.oben)))]
  const sollText = solls.length ? solls.join('; ') : undefined
  const frei = liste.filter(x => x.zustand === 'erfuellt').length
  const kurz = liste.filter(x => x.kurz !== undefined)
  const n = liste.length + ohneZufahrt.length
  const ist = frei === 0 && kurz.length === n && n > 0
    ? `frei bis ${m0(Math.min(...kurz.map(x => x.kurz!)))}, nötig ${m0(Math.max(...kurz.map(x => x.oben!)))}`
    : `${frei} von ${n} Zufahrten frei${kurz.length ? `, ${kurz.length} nur bis ${m0(Math.min(...kurz.map(x => x.kurz!)))} geprüft` : ''}`
  const detail = [...liste.filter(x => x.zustand !== 'erfuellt').map(x => x.text), ...leer].join('; ') || undefined
  const quellen = [...new Set(liste.map(x => x.z.quelle))].join(', ')
  const mitV85 = liste.some(x => x.v85)
  const det = [detail, quellen ? `Sichtrechner: ${quellen}${mitV85 ? `, Tempo-Stufe nach V85 ${zahl(v85!)} km/h` : ''}` : ''].filter(Boolean).join('; ')
  const tabTempo = liste.some(x => x.z.quelle === 'VSS Tab. 1' && !x.z.abbiegend)
  const vSig = k.o('vSig')
  const sig = v85 !== null && vSig !== null && tabTempo && io !== null ? sollTempo(vSig, io) : null
  const v85s = v85 !== null && io !== null ? sollTempo(v85, io) : null
  const normHinweis = sig && v85s && sig.soll !== v85s.soll ? hinweisVsig(sig.soll) : undefined
  if (liste.some(x => x.zustand === 'verletzt')) return verletzt({ ist, soll: sollText, detail: det, normHinweis })
  if (liste.some(x => x.zustand === 'offen') || leer.length) {
    const fehlend = [...new Set(liste.filter(x => x.zustand === 'offen' && x.fehlt).map(x => x.fehlt!))]
    return { zustand: 'offen', ist, soll: sollText, detail: det, fehlend: fehlend.length ? fehlend : ['sichtVorh'], normHinweis }
  }
  return ok({ ist, soll: sollText, detail: det, normHinweis })
}

/** Normhinweis zur Durchfahrt (B5-2c) je nach Wert: nur zwischen 4,25 und 4,50 m wertet F3 milder (Hinweis) */
function hinweisDurchfahrt(schlecht: number[]): string {
  const F3 = K.F3.werte, W = K['B5-2c'].werte
  const band = schlecht.some(d => d >= F3.breitMin - EPS && d < W.dBreit - EPS)
  return `Norm: keine VSS-Norm nennt Durchfahrtsmasse${band ? `; die erweiterte Prüfung (F3, Arbeitshilfe Kanton BE) wertet ${fmt(F3.breitMin)} bis ${fmt(W.dBreit)} m nur als Hinweis` : ''}.`
}

const GRUND: Record<GrundId, GrundFn> = {
  // ── Tempo (Vorbedingung) ──
  'B5-T': k => {
    const max = K['B5-T'].werte.vMax
    const vSig = k.o('vSig'), v85 = k.o('v85')
    if (vSig !== null && vSig > max) return verletzt({ ist: `${zahl(vSig)} km/h signalisiert`, soll: `≤ ${max} km/h` })
    if (v85 !== null && v85 > max) return verletzt({ ist: `V85 ${zahl(v85)} km/h`, soll: `≤ ${max} km/h` })
    if (vSig === null) throw new Offen(['vSig'])
    if (v85 === null) return { zustand: 'offen', ist: `${zahl(vSig)} km/h signalisiert, V85 fehlt`, soll: `≤ ${max} km/h`, fehlend: ['v85'],
      detail: 'V85 messen (vor der Anordnung, besonders bei Verdacht auf schnelleres Fahren)',
      normHinweis: 'Norm: VSS 40 241:2019 Z. 13 rechnet ohne Messung mit dem signalisierten Tempo (C1).' }
    return ok({ ist: `${zahl(vSig)} km/h signalisiert, V85 ${zahl(v85)} km/h`, soll: `≤ ${max} km/h` })
  },

  // ── 1 Sichtverhältnisse ──
  'B5-1': (k, o) => {
    const hand = k.o('sichtVorh')
    if (hand === null) {
      if (!o.sicht?.length && !o.ohneZufahrt?.length) throw new Offen(['sichtVorh'])
      return sichtRechner(k, o.sicht ?? [], o.ohneZufahrt ?? [])
    }
    const s = sollQuerung(k)
    if (!s) return { zustand: 'offen', detail: 'über 60 km/h keine Sichtweite (kein Fussgängerstreifen zulässig)' }
    const min = Math.min(...hand), i = hand.indexOf(min)
    const x = { ist: `${m0(min)}${hand.length > 1 ? ` (kleinste von ${hand.length}, Zufahrt ${i + 1})` : ''}`, soll: bereichText(s.unten, s.oben),
      detail: `von Hand; ${s.text}`, normHinweis: s.normHinweis }
    if (min < s.unten - EPS) return verletzt(x)
    if (s.oben !== null && min >= s.oben - EPS) return ok(x)
    return { zustand: 'offen', ...x, detail: `${x.detail}; ${s.grund ?? 'Soll offen'}`, fehlend: s.fehlend }
  },
  'B5-1b': k => {
    const E = k.w('erkennungM')
    const s = sollQuerung(k)
    if (!s) return null
    const f = K['B5-1b'].werte.faktor
    const x = { ist: m0(E), soll: `${bereichText(f * s.unten, s.oben === null ? null : f * s.oben)} (${f} · Sichtweite)`, detail: s.text }
    if (E < f * s.unten - EPS) return verletzt({ ...x, normHinweis: E < s.unten - EPS ? 'Norm: unter der Sichtweite selbst ist es nach VSS 40 241:2019 Z. 15 eine Pflichtverletzung (H3a).' : undefined })
    if (s.oben !== null && E >= f * s.oben - EPS) return ok(x)
    return { zustand: 'offen', ...x, detail: `${x.detail}; ${s.grund ?? 'Soll offen'}`, fehlend: s.fehlend }
  },
  'B5-1c': () => ({ zustand: 'hinweis' }),

  // ── 2 Fussgängerschutzinsel ──
  'B5-2a': k => {
    if (k.insBaulich()) return null
    const B = k.w('fahrbahnB'), W = K['B5-2a'].werte
    const markiert = k.inselMarkiert()
    const x = { ist: `Fahrbahn ${fmt(B)} m${markiert ? ', Insel nur markiert' : ', keine Insel'}`, soll: `Insel erwägen, besonders über ${fmt(W.bMax)} m`,
      detail: markiert ? 'eine nur markierte Insel gilt nicht als Schutzinsel' : undefined,
      normHinweis: B >= W.bMax - EPS ? 'Norm: ab 8,50 m Fahrbahn bei Gegenverkehr und DTV ab 3000 verlangt VSS 40 241:2019 Z. 24 die Insel, Abweichung nur mit Bericht (D2).' : undefined }
    return B > W.bMax + EPS ? verletzt({ ...x, staerke: 'weich' }) : { zustand: 'hinweis', ...x }
  },
  'B5-2b': k => {
    if (k.o('insel')?.art !== 'baulich' || !k.insBaulich()) return null
    const b = k.s('insel', 'breite'), W = K['B5-2b'].werte
    const x = { ist: `${fmt(b)} m`, soll: `${fmt(W.regel)} m (mindestens ${fmt(W.min)} m)` }
    if (b < W.min - EPS) return verletzt({ ...x, staerke: 'hart' })
    if (b < W.regel - EPS) return verletzt({ ...x, staerke: 'weich' })
    return ok(x)
  },
  'B5-2c': k => {
    if (k.o('insel')?.art !== 'baulich' || !k.insBaulich()) return null
    const d = k.w('durchfahrt'), W = K['B5-2c'].werte
    const schlecht = d.map((x, i) => [x, i] as const).filter(([x]) => !bfuDurchfahrtOk(x))
    const x = { ist: `${d.map(v => fmt(v)).join(' / ')} m`, soll: `${fmt(W.d)} m (bis ${fmt(W.dTol)} m) oder ≥ ${fmt(W.dBreit)} m`,
      detail: schlecht.length ? schlecht.map(([v, i]) => `Seite ${i + 1}: ${fmt(v)} m`).join('; ') : undefined }
    return schlecht.length ? verletzt({ ...x, normHinweis: hinweisDurchfahrt(schlecht.map(([v]) => v)) }) : ok(x)
  },

  // ── 3 Zweistreifigkeit ──
  'B5-3': k => {
    const n = k.nMax(), W = K['B5-3'].werte
    const busspur = k.o('busspur') === true
    const x = { ist: `${n} je Richtung`, soll: `≤ ${W.nMax} je Richtung ohne Insel`, detail: busspur ? 'Busstreifen mitgezählt' : undefined }
    const i = k.o('insel')
    const baulich = !!i?.vorhanden && i.art === 'baulich'
    if (n <= W.nMax) {
      // Busstreifen vorhanden, aber nur ein Fahrstreifen angegeben: ob der Busstreifen mitgezählt ist, ist nicht sicher
      if (busspur && !baulich) return { zustand: 'hinweis', ...x, detail: 'Busstreifen vorhanden: Fahrstreifen je Richtung inkl. Busstreifen prüfen' }
      return ok(x)
    }
    if (k.insBaulich()) return ok({ ...x, detail: ['mit Schutzinsel', x.detail].filter(Boolean).join('; ') })
    return verletzt(x)
  },

  // ── 4 Beleuchtung ──
  'B5-4': k => (k.w('beleuchtung') ? ok({ ist: 'vorhanden' }) : verletzt({ ist: 'keine', soll: 'öffentliche Beleuchtung' })),
  'B5-4b': () => ({ zustand: 'hinweis' }),

  // ── 5 Fussgängerfrequenz ──
  'B5-5': k => {
    const s = K['B5-5'].werte.fgMin
    const fg = k.o('fg5h')
    let unter: boolean, ist: string
    if (fg !== null) { unter = fg < s; ist = `${zahl(fg)} Querende` }
    else {
      const kl = k.o('fgKlasse')
      if (kl === null) throw new Offen(['fg5h', 'fgKlasse'])
      unter = kl === '<100'
      ist = `Schätzklasse ${kl === '<100' ? 'unter 100' : kl === '100-500' ? '100 bis 500' : 'über 500'}`
    }
    const x = { ist, soll: `≥ ${s} in 5 Spitzenstunden` }
    return unter ? verletzt(x) : ok(x)
  },
  'B5-5b': () => ({ zustand: 'hinweis' }),

  // ── weitere bfu-Punkte ──
  'B5-W1': k => {
    const dtv = k.w('dtv'), W = K['B5-W1'].werte
    return dtv < W.dtvMin ? { zustand: 'hinweis', ist: `DTV ${zahl(dtv)}` } : ok({ ist: `DTV ${zahl(dtv)}`, soll: `ab ${W.dtvMin} Fussgängerstreifen sinnvoll` })
  },
  'B5-W2': k => (k.w('annaeherungUeberfahrbar') ? verletzt({ ist: 'überfahrbar' }) : ok({ ist: 'nicht überfahrbar' })),
  'B5-W3': k => {
    // Fahrbahnhaltestelle (Ziff. 2.3): Haltestelle fehlt ganz: offen; keine bzw. Busbucht: nicht anwendbar
    if (k.w('haltestelle').art !== 'fahrbahn') return null
    if (!k.insBaulich()) return verletzt({ ist: k.inselMarkiert() ? 'Fahrbahnhaltestelle, Insel nur markiert' : 'Fahrbahnhaltestelle ohne Insel', soll: 'Schutzinsel' })
    const d = k.w('durchfahrt'), W = K['B5-W3'].werte
    const schlecht = d.map((x, i) => [x, i] as const).filter(([x]) => x < W.d - EPS || x > W.dTol + EPS)
    const x = { ist: `Durchfahrt ${d.map(v => fmt(v)).join(' / ')} m`, soll: `rund ${fmt(W.d)} m (bis ${fmt(W.dTol)} m)`,
      detail: schlecht.length ? schlecht.map(([v, i]) => `Seite ${i + 1}: ${fmt(v)} m`).join('; ') : undefined }
    return schlecht.length ? verletzt(x) : ok(x)
  },
}

/** Implementierte Regeln (Test: genau die Gruppe B5 des Katalogs) */
export const GRUND_IDS = Object.keys(GRUND) as GrundId[]

const NAME: Record<GrundId, string> = {
  'B5-T': 'Tempo', 'B5-1': 'Sichtweite', 'B5-1b': 'Erkennungsdistanz', 'B5-2a': 'ohne Schutzinsel', 'B5-2b': 'Inseltiefe',
  'B5-2c': 'Durchfahrt neben der Insel', 'B5-3': 'Fahrstreifen je Richtung', 'B5-4': 'Beleuchtung', 'B5-4b': 'Markierung',
  'B5-5': 'Querende', 'B5-5b': 'Forschung', 'B5-W1': 'Verkehrsmenge', 'B5-W2': 'Annäherungsbereich', 'B5-1c': 'Erkennbarkeit',
  'B5-W3': 'Fahrbahnhaltestelle',
}

const PUNKTE: { nr: GrundPunkt['nr']; titel: string; teile: GrundId[]; notizen?: GrundId[] }[] = [
  { nr: 'T', titel: 'Tempo', teile: ['B5-T'] },
  { nr: '1', titel: 'Sichtverhältnisse', teile: ['B5-1', 'B5-1b'], notizen: ['B5-1c'] },
  { nr: '2', titel: 'Fussgängerschutzinsel', teile: ['B5-2a', 'B5-2b', 'B5-2c'] },
  { nr: '3', titel: 'Zweistreifigkeit', teile: ['B5-3'] },
  { nr: '4', titel: 'Beleuchtung', teile: ['B5-4'], notizen: ['B5-4b'] },
  { nr: '5', titel: 'Fussgängerfrequenz', teile: ['B5-5'], notizen: ['B5-5b'] },
]
const WEITERE: GrundId[] = ['B5-W1', 'B5-W2', 'B5-W3']

const RANG: Record<string, number> = { hart: 3, hart_bericht: 2, weich: 1, hinweis: 0 }

/** Querungstyp, für den die Grundprüfung nicht gilt, als Text */
const NICHT_FGS: Record<string, string> = {
  lsa: 'Fussgängerstreifen mit Lichtsignal', furt: 'Furt', ohne_vortritt: 'Querung ohne Vortritt', trottoirueberfahrt: 'Trottoirüberfahrt',
  mehrzweck: 'Mehrzweckstreifen',
}
export const NUR_FGS_TEXT = 'Grundprüfung bfu gilt nur für Fussgängerstreifen ohne Lichtsignalanlage'

function teil(id: GrundId, k: Kontext, o: GrundOptionen): GrundTeil | null {
  const def: RegelDef = KATALOG[id]
  let r: Roh | null
  try {
    r = GRUND[id](k, o)
  } catch (x) {
    if (!(x instanceof Offen)) throw x
    r = { zustand: 'offen', fehlend: x.felder }
  }
  if (r === null) return null
  const t: GrundTeil = { id, name: NAME[id], zustand: r.zustand, staerke: r.zustand === 'verletzt' ? r.staerke ?? def.staerke : null,
    text: def.ergebnis, quelle: quellText(id) }
  if (r.ist !== undefined) t.ist = r.ist
  if (r.soll !== undefined) t.soll = r.soll
  if (r.detail) t.detail = r.detail
  if (r.fehlend?.length) t.fehlend = r.fehlend
  // Normhinweis des Katalogs nur, wo die Regel etwas meldet (verletzt; Hinweis nur bei Regeln der Stärke Hinweis); fallbezogen aus der Regel
  const nh = r.normHinweis ?? (r.zustand === 'verletzt' || (r.zustand === 'hinweis' && def.staerke === 'hinweis') ? def.normHinweis : undefined)
  if (nh) t.normHinweis = nh
  return t
}

/** Grundprüfung einer Querung (reine Funktion) */
export function grundpruefung(e: BedarfEingaben, o: GrundOptionen = {}): Grundpruefung {
  const k = new Kontext(e, { Recht: true, Norm: true, Bern: true, 'Kanton BE': true, Richtlinie: true })
  const typ = k.o('typ')
  const lsa = k.o('fgsMitLsa') === true
  if (o.gemischt && !lsa && (typ === null || typ === 'fgs'))
    return { gilt: false, grund: `${NUR_FGS_TEXT} (hier: Teilstreifen teils Fussgängerstreifen, teils ohne Vortritt).`, punkte: [], weitere: [], annahmen: [] }
  if ((typ !== null && typ !== 'fgs') || lsa) {
    const art = NICHT_FGS[typ !== null && typ !== 'fgs' ? typ : 'lsa']
    return { gilt: false, grund: `${NUR_FGS_TEXT} (hier: ${art}).`, punkte: [], weitere: [], annahmen: [] }
  }
  if (typ === null) k.annahmen.add('Querungstyp offen: als Fussgängerstreifen ohne Lichtsignal geprüft')
  const punkte: GrundPunkt[] = PUNKTE.map(p => {
    const teile = p.teile.map(id => teil(id, k, o)).filter((x): x is GrundTeil => x !== null)
    const notizen = (p.notizen ?? []).map(id => teil(id, k, o)).filter((x): x is GrundTeil => x !== null)
    const verl = teile.filter(t => t.zustand === 'verletzt')
    const staerke = verl.length ? verl.map(t => t.staerke!).sort((a, b) => RANG[b] - RANG[a])[0] : null
    const zustand: GrundZustand = verl.length ? 'verletzt' : teile.some(t => t.zustand === 'offen') ? 'offen'
      : teile.some(t => t.zustand === 'hinweis') ? 'hinweis' : 'erfuellt'
    return { nr: p.nr, titel: p.titel, zustand, staerke, teile, notizen }
  })
  const weitere = WEITERE.map(id => teil(id, k, o)).filter((x): x is GrundTeil => x !== null)
  const annahmen = [...k.annahmen]
  for (const f of k.genutzt) {
    // Kurve: die Grundprüfung liest nur den Radius; ohne Radius ist die Annahme zu den Kurven-Voraussetzungen ohne Belang
    if (f === 'kurve' && (e.kurve.wert?.radius ?? null) === null) continue
    const q = e[f].quelle
    if (q && QUELLEN_ANNAHME.includes(q)) annahmen.push(`${feldName(f)}: ${q === 'annahme' ? 'Annahme' : 'Schätzung'}`)
  }
  return { gilt: true, punkte, weitere, annahmen }
}
