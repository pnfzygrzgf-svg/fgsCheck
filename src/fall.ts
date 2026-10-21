// ── Fall-Datei: alle Eingaben eines Übergangs (E2) ──
//
// JSON mit Version, Ort und Quellenstand; Koordinaten in LV95 (m). Wird als Datei gespeichert/geladen und zusätzlich im
// localStorage gehalten (Zugriffe mit try/catch, die App läuft auch ohne). Kein Server.

import { type P, imPolygon } from './geo'
import { MARKIERUNGEN, type Markierung } from './daten/osm'
import type { Hindernis } from './rechner/hindernisse'
import type { SpurHand } from './rechner/spurhand'
import type { VonHand } from './rechner/pruefen'
import type { QuerungOhneVortritt } from './rechner/typen'
import { bedarfLesen, bedarfLeer, type BedarfBlock } from './bedarf/fallBedarf'

/**
 * Versionen der Fall-Datei (Korrektur 16.10.2026, Prüfbefund S2): 1 = bisher; 2 = mit Flächen (Plan) (Feld flaechenPlan). Version 2
 * wird nur geschrieben, wenn der Fall Flächen (Plan) hat (fallVersion): eine ältere App lehnt die Datei dann ab («Fall-Datei
 * Version 2 wird nicht unterstützt»), statt still ohne die Plan-Flächen zu rechnen; alle übrigen Dateien bleiben Version 1 und
 * für ältere Apps lesbar. FALL_VERSION ist die höchste lesbare Version.
 * Version 3 (Bedarfsmodul E1, 20.10.2026): mit Block «bedarf» (Handeingaben zu Bedarf und Querungstyp) bzw. mit einem Streifen
 * als Querung ohne Vortritt (StreifenEingabe.typ). Beides würde eine ältere App still übergehen (den Streifen ohne Vortritt
 * prüfte sie als Fussgängerstreifen); sie lehnt Version 3 mit ihrer Meldung ab. Ohne beides bleibt es bei 1 bzw. 2.
 */
export const FALL_VERSION = 3
export const FALL_VERSION_BASIS = 1
/** Version, mit der ein Fall geschrieben wird: 3 mit Bedarf bzw. Querung ohne Vortritt, 2 mit Flächen (Plan), sonst 1 */
export const fallVersion = (f: { flaechenPlan?: unknown[]; bedarf?: BedarfBlock; streifen?: Record<string, StreifenEingabe> }): number =>
  (!bedarfLeer(f.bedarf) || Object.values(f.streifen ?? {}).some(e => !!e.typ) ? 3 : f.flaechenPlan?.length ? 2 : FALL_VERSION_BASIS)

export interface StreifenHand { id: string; p0: P; p1: P; breite: number; richtung?: P   // richtung: Balken (Luftbild), sonst OSM-Weg
  herkunft?: StreifenHerkunft      // woher der Streifen stammt (fehlt in Fällen vor dem 11.10.2026: unbekannt)
  angepasst?: boolean              // Enden nach dem Übernehmen bzw. Zeichnen verschoben
  name?: string                    // eigener Name (Anzeige statt «Streifen 1», benennung.streifenTitel; seit 16.10.2026)
}
/** Name eines Streifens von Hand höchstens so lang (Zeichen) */
export const STREIFEN_NAME_MAX = 60
export type StreifenHerkunft = 'gezeichnet' | 'osm' | 'luftbild' | 'luftbild_vorschlag'
const HERKUNFTE: StreifenHerkunft[] = ['gezeichnet', 'osm', 'luftbild', 'luftbild_vorschlag']
export interface ZufahrtHand { tempo?: number; streichen?: boolean; spur?: SpurHand }
/** Fixpunkt für die Vermassung eines Streifens von Hand (seit 16.10.2026; fixpunkt.ts): gefangen auf eine Gebäudeecke bzw. einen
 * Stützpunkt der AV-Bodenbedeckung, sonst frei gesetzt. Beeinflusst die Rechnung nicht. avArt: Art der AV-Fläche (av_punkt) */
export type FixpunktArt = 'gebaeudeecke' | 'av_punkt' | 'frei'
export const FIXPUNKT_ARTEN: FixpunktArt[] = ['gebaeudeecke', 'av_punkt', 'frei']
/** Name eines Fixpunkts höchstens so lang (Zeichen; wie das Textfeld in der Liste) */
export const FIXPUNKT_NAME_MAX = 80
export interface Fixpunkt { id: string; p: P; art: FixpunktArt; name?: string; avArt?: string }
/** Eingaben je Streifen: Lichtsignal von Hand; keinFgs: kein Fussgängerstreifen, Streifen nicht prüfen (wie bisher); typ:
 * Querung ohne Vortritt (Bedarfsmodul E1), geprüft mit der Sichtweite nach VSS 40 240 Z. 8.2. keinFgs und typ schliessen sich aus
 * (keinFgs geht vor). Fehlt typ: Fussgängerstreifen */
export interface StreifenEingabe { lsa?: 'ja' | 'nein'; keinFgs?: boolean; typ?: QuerungOhneVortritt }
export const QUERUNG_OHNE_VORTRITT: QuerungOhneVortritt[] = ['furt', 'ohne_vortritt']
/** Fläche (Plan) von Hand (seit 16.10.2026; rechner/planflaechen.ts): geplante Bodenbedeckung, ersetzt für die Rechnung die
 * AV-Flächen darunter (Trottoirnase, Fahrbahnverengung, verschobener Randstein, neue Insel). Ring ohne Schlusspunkt, LV95 */
export type PlanArt = 'trottoir' | 'fahrbahn' | 'insel'
export const PLAN_ARTEN: PlanArt[] = ['trottoir', 'fahrbahn', 'insel']
/** Mittelinsel (Standard) (seit 20.10.2026; rechner/standardinsel.ts): Kennzeichnung der Flächen (Plan), die das Werkzeug
 * «Mittelinsel (Standard)» nach Masterplan Fussverkehr Stadt Bern, Standards, E1 (Schutzinsel mit Rollstuhlfurt) einfügt. Optional:
 * die Rechnung liest nur Art und Ring; ältere Apps übergehen das Feld (die Geometrie bleibt). Gespeichert sind die Masse und die
 * Lage (Mitte, Achse, Balkenrichtung), daraus lassen sich Teile und Signalmast neu bilden (standardinsel.inselGeometrie);
 * weicht der Ring davon ab, gilt der Teil als von Hand angepasst. gruppe: gemeinsame Kennung aller Teile einer Mittelinsel */
export type FurtSeite = 'links' | 'rechts'
export type StandardTeil = 'kopf' | 'insel' | 'furt'
export interface PlanStandard {
  typ: 'mittelinsel_e1'; gruppe: string; teil: StandardTeil
  tiefe: number; breite: number; furt: number; kopf: number; seite: FurtSeite   // m: Tiefe quer, Streifenbreite, Furt, Kopflänge
  m: P; achse: P; balken: P                                                        // Mitte (LV95), Achse A -> B, Balkenrichtung
}
export interface FlaechePlan { id: string; art: PlanArt; ring: P[]; standard?: PlanStandard }
/** Fläche (Plan): höchstens so viele Ecken (Fall-Datei) */
export const PLAN_ECKEN_MAX = 500

export interface Fall {
  app: 'fgsCheck'
  version: number
  ort: { lat: number; lon: number; uebergang: number | null; bezeichnung?: string; markierung?: Markierung }
  quellen: { osm?: string; av?: string; baumkataster?: string; parkkataster?: string; luftbild?: string; geladen?: string
    /** Geoportal Stadt Bern für die Vorbelegung des Bedarfsmoduls (seit 20.10.2026) */
    haltestellen?: string; verkehrsdaten?: string }
  streifenHand: StreifenHand[]
  hindernisse: Hindernis[]
  zufahrten: Record<string, ZufahrtHand>          // Schlüssel «Streifen|Kennung»
  streifen: Record<string, StreifenEingabe>        // Schlüssel Streifen-Nr.
  vorschlaege: Record<string, 'verworfen'>        // verworfene Vorschläge (aus OSM, Baumkataster) und amtliche Parkfelder
  baumkataster: boolean
  parkkataster?: boolean                          // amtliche Parkfelder laden (Vorgabe: ja; false = abgeschaltet)
  luftbild?: boolean                              // Streifen im Luftbild suchen (Vorgabe: ja)
  fixpunkte?: Fixpunkt[]                          // Fixpunkte der Vermassung (fehlt, solange keiner gesetzt ist; ältere Apps übergehen das Feld)
  flaechenPlan?: FlaechePlan[]                    // Flächen (Plan) von Hand, spätere vor früheren (fehlt, solange keine gezeichnet ist)
  bedarf?: BedarfBlock                            // Bedarfsmodul E1: Handeingaben zu Bedarf und Querungstyp je Fall (fehlt ohne; Version 3)
  gespeichert?: string
  ergebnis?: FallErgebnis                         // nur beim Speichern geschrieben (Auszug), beim Laden neu gerechnet
}

export interface FallErgebnis {
  hinweis: string                                // z. B. «Kein Fussgängerstreifen: …»
  luftbild?: string                              // Befund der Luftbild-Erkennung (erkannt / unsicher / nicht_gefunden)
  streifenQuelle?: string                        // osm / luftbild / hand
  streifen: { fgsId: string; status: string; zufahrten: { zufahrt: string; status: string; tempo: number; sichtweite: number
    gedeckt?: true }[] }[]                       // gedeckt: Abbiegezufahrt, gedeckt durch die gerade Zufahrt (nur mit GEDECKT_RECHNEN)
}

export function leererFall(lat: number, lon: number, uebergang: number | null): Fall {
  return { app: 'fgsCheck', version: FALL_VERSION_BASIS, ort: { lat, lon, uebergang }, quellen: {}, streifenHand: [], hindernisse: [],
    zufahrten: {}, streifen: {}, vorschlaege: {}, baumkataster: false }
}

export const zufahrtSchluessel = (fgsId: string, kennung: string) => `${fgsId}|${kennung}`

const zahl = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
/** echtes Objekt (kein Array, nicht null) */
const istObjekt = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const istP = (x: unknown): x is P => Array.isArray(x) && x.length === 2 && x.every(zahl)
const istPs = (x: unknown, min: number): x is P[] => Array.isArray(x) && x.length >= min && x.every(istP)

function hindernisPruefen(h: unknown): Hindernis | null {
  if (!istObjekt(h)) return null
  const o = h
  if (typeof o.id !== 'string' || typeof o.art !== 'string') return null
  const quelle = (['hand', 'osm', 'kataster'].includes(o.quelle as string) ? o.quelle : 'hand') as Hindernis['quelle']
  const name = typeof o.name === 'string' ? o.name : undefined
  switch (o.art) {
    case 'parkfeld':
      return istPs(o.ring, 3) ? { id: o.id, art: 'parkfeld', klasse: (['auto', 'velo', 'motorrad'].includes(o.klasse as string) ? o.klasse : 'auto') as 'auto',
        ring: o.ring, quelle, name } : null
    case 'laengsparkierung':
      return istPs(o.linie, 2) ? { id: o.id, art: 'laengsparkierung', linie: o.linie,
        breite: zahl(o.breite) && o.breite > 0.5 && o.breite < 8 ? o.breite : 2.0, quelle, name } : null
    case 'baum':
      return istP(o.p) ? { id: o.id, art: 'baum', p: o.p, stamm: zahl(o.stamm) && o.stamm > 0 && o.stamm < 5 ? o.stamm : 0.5,
        quelle, name } : null
    case 'hecke': case 'mauer': case 'uebrige': {
      const linie = istPs(o.linie, 2) ? o.linie : undefined, ring = istPs(o.ring, 3) ? o.ring : undefined
      return linie || ring ? { id: o.id, art: o.art, linie, ring, sichtbehindernd: o.sichtbehindernd !== false, quelle, name } : null
    }
    case 'insel':                                  // Verkehrsinsel von Hand (seit 14.10.2026)
      return istPs(o.ring, 3) ? { id: o.id, art: 'insel', ring: o.ring, quelle, name } : null
  }
  return null
}

function spurPruefen(x: unknown): SpurHand | undefined {
  if (!istObjekt(x)) return undefined
  const o = x
  if (o.art === 'A' && zahl(o.a) && zahl(o.b) && Math.abs(o.a) < 20 && Math.abs(o.b) < 20)
    return { art: 'A', a: o.a, b: o.b }
  if (o.art === 'B' && istPs(o.linie, 2))
    return { art: 'B', linie: o.linie, radius: zahl(o.radius) && o.radius >= 3 && o.radius <= 60 ? o.radius : null }
  return undefined
}

/**
 * Gebiet der App für den Ort einer Fall-Datei (WGS84, Grad): Schweiz und Liechtenstein mit etwa 10 km Rand. Die Schweiz
 * reicht von 45,82° (Chiasso) bis 47,81° N (Bargen SH) und von 5,96° (Chancy GE) bis 10,49° O (Müstair), Liechtenstein
 * liegt darin. Ausserhalb gibt es weder AV über geodienste.ch noch SWISSIMAGE, und die LV95-Umrechnung (geo.ts) ist nur
 * für dieses Gebiet gedacht; der Rand lässt Übergänge an der Grenze zu.
 */
export const GEBIET = { latMin: 45.7, latMax: 47.9, lonMin: 5.8, lonMax: 10.6 }
export const imGebiet = (lat: number, lon: number): boolean =>
  lat >= GEBIET.latMin && lat <= GEBIET.latMax && lon >= GEBIET.lonMin && lon <= GEBIET.lonMax

/**
 * Koordinaten in LV95 (m) plausibel für das Gebiet der App (GEBIET): Schweiz und Liechtenstein reichen von rund E 2'485'000 bis
 * 2'834'000 und N 1'075'000 bis 1'296'000; mit etwa 10 km Rand wie beim Ort. Prüft Punkte aus der Fall-Datei (Fixpunkte, Flächen
 * (Plan)), damit eine verdorbene Datei (WGS84-Grad, vertauschte Achsen, LV03) nicht weit weg rechnet bzw. zeichnet.
 */
export const LV95_GEBIET = { eMin: 2475000, eMax: 2845000, nMin: 1065000, nMax: 1305000 }
export const imLv95 = (p: P): boolean =>
  p[0] >= LV95_GEBIET.eMin && p[0] <= LV95_GEBIET.eMax && p[1] >= LV95_GEBIET.nMin && p[1] <= LV95_GEBIET.nMax

/** Ring einer Fläche (Plan) aus der Datei: Punkte in LV95, Schlusspunkt weg, doppelte Nachbarn weg; null wenn ungültig
 * (weniger als 3 Ecken, mehr als PLAN_ECKEN_MAX, ausserhalb, Fläche unter 0,01 m²) */
export function planRingPruefen(x: unknown): P[] | null {
  if (!istPs(x, 3) || x.length > PLAN_ECKEN_MAX + 1 || !x.every(imLv95)) return null
  const r: P[] = []
  for (const p of x) if (!r.length || r[r.length - 1][0] !== p[0] || r[r.length - 1][1] !== p[1]) r.push([p[0], p[1]])
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop()
  if (r.length < 3) return null
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[0][0]) * (r[i][1] - r[0][1]) - (r[i][0] - r[0][0]) * (r[j][1] - r[0][1])
  return Math.abs(a / 2) >= 0.01 ? r : null
}

/** Kennzeichnung «Mittelinsel (Standard)» einer Fläche (Plan) aus der Datei; null wenn ungültig (die Fläche bleibt, ohne Kennzeichnung) */
export function planStandardPruefen(x: unknown): PlanStandard | null {
  if (!istObjekt(x) || x.typ !== 'mittelinsel_e1' || typeof x.gruppe !== 'string' || !x.gruppe || x.gruppe.length > 40) return null
  if (!['kopf', 'insel', 'furt'].includes(x.teil as string) || !['links', 'rechts'].includes(x.seite as string)) return null
  const im = (v: unknown, a: number, b: number): v is number => zahl(v) && v >= a && v <= b
  if (!im(x.tiefe, 0.5, 20) || !im(x.breite, 0.5, 15) || !im(x.furt, 0, 15) || !im(x.kopf, 0, 20)) return null
  const einheitP = (v: unknown): v is P => istP(v) && Math.abs(Math.hypot(v[0], v[1]) - 1) < 0.01
  if (!istP(x.m) || !imLv95(x.m) || !einheitP(x.achse) || !einheitP(x.balken)) return null
  return { typ: 'mittelinsel_e1', gruppe: x.gruppe, teil: x.teil as StandardTeil, tiefe: x.tiefe, breite: x.breite, furt: x.furt,
    kopf: x.kopf, seite: x.seite as FurtSeite, m: [x.m[0], x.m[1]], achse: [x.achse[0], x.achse[1]], balken: [x.balken[0], x.balken[1]] }
}

const QUELLEN_SCHLUESSEL = ['osm', 'av', 'baumkataster', 'parkkataster', 'luftbild', 'geladen', 'haltestellen', 'verkehrsdaten'] as const

/** Fall aus JSON lesen und prüfen -> [Fall, Hinweise]. Ausnahme nur bei fremder Datei, Version oder ungültigem Ort; ungültige
 * Listen bzw. Objekte und einzelne ungültige Einträge werden übergangen und gemeldet. Auch für den Browser-Speicher (fallErinnern). */
export function fallLesen(text: string): [Fall, string[]] {
  const roh: unknown = JSON.parse(text)
  if (!istObjekt(roh) || roh.app !== 'fgsCheck') throw new Error('keine fgsCheck-Fall-Datei')
  if (!zahl(roh.version) || roh.version > FALL_VERSION) throw new Error(`Fall-Datei Version ${String(roh.version)} wird nicht unterstützt` +
    (zahl(roh.version) && roh.version > FALL_VERSION ? ' (aus einer neueren fgsCheck-Version: Seite neu laden)' : ''))
  const ort = roh.ort
  if (!istObjekt(ort) || !zahl(ort.lat) || !zahl(ort.lon)) throw new Error('Ort fehlt in der Fall-Datei')
  if (Math.abs(ort.lat) > 90 || Math.abs(ort.lon) > 180) throw new Error(`Ort ungültig (lat ${ort.lat}, lon ${ort.lon}: keine WGS84-Koordinaten)`)
  if (!imGebiet(ort.lat, ort.lon))
    throw new Error(`Ort ausserhalb der Schweiz bzw. Liechtensteins (lat ${ort.lat}, lon ${ort.lon}); fgsCheck rechnet nur dort`)
  const hinweise: string[] = []
  const fall = leererFall(ort.lat, ort.lon, zahl(ort.uebergang) ? ort.uebergang : null)
  if (typeof ort.bezeichnung === 'string') fall.ort.bezeichnung = ort.bezeichnung
  if (MARKIERUNGEN.includes(ort.markierung as Markierung)) fall.ort.markierung = ort.markierung as Markierung
  /** Liste bzw. Objekt nur, wenn vorhanden und vom richtigen Typ; sonst Hinweis */
  const liste = (k: string, name: string): unknown[] => {
    const x = roh[k]
    if (x === undefined) return []
    if (Array.isArray(x)) return x
    hinweise.push(`${name} ungültig (keine Liste), übergangen`); return []
  }
  const objekt = (k: string, name: string): [string, unknown][] => {
    const x = roh[k]
    if (x === undefined) return []
    // «__proto__» u. ä. nie als Schlüssel übernehmen (würde den Prototyp des Ziel-Objekts ersetzen)
    if (istObjekt(x)) return Object.entries(x).filter(([s]) => !['__proto__', 'constructor', 'prototype'].includes(s))
    hinweise.push(`${name} ungültig (kein Objekt), übergangen`); return []
  }
  for (const [k, v] of objekt('quellen', 'Quellen')) {
    if ((QUELLEN_SCHLUESSEL as readonly string[]).includes(k) && typeof v === 'string') fall.quellen[k as typeof QUELLEN_SCHLUESSEL[number]] = v
    else if ((QUELLEN_SCHLUESSEL as readonly string[]).includes(k)) hinweise.push(`Quelle «${k}» ungültig, übergangen`)
  }
  for (const s of liste('streifenHand', 'Streifen von Hand')) {
    const o = istObjekt(s) ? s : null
    if (o && typeof o.id === 'string' && istP(o.p0) && istP(o.p1) && zahl(o.breite) && o.breite >= 0.5 && o.breite <= 15) {
      // doppelte Nummern (ältere Fassung) eindeutig machen
      const doppelt = fall.streifenHand.some(x => x.id === o.id)
      if (doppelt) hinweise.push(`Streifen von Hand ${o.id} doppelt, neu nummeriert`)
      const sh: StreifenHand = { id: doppelt ? naechsteHandId(fall) : o.id, p0: o.p0, p1: o.p1, breite: o.breite }
      if (istP(o.richtung) && Math.abs(Math.hypot(o.richtung[0], o.richtung[1]) - 1) < 0.01) sh.richtung = o.richtung
      if (HERKUNFTE.includes(o.herkunft as StreifenHerkunft)) sh.herkunft = o.herkunft as StreifenHerkunft
      if (o.angepasst === true) sh.angepasst = true
      if (typeof o.name === 'string' && o.name.trim()) sh.name = o.name.trim().slice(0, STREIFEN_NAME_MAX)
      fall.streifenHand.push(sh)
    } else hinweise.push('Streifen von Hand ungültig, übergangen')
  }
  for (const h of liste('hindernisse', 'Hindernisse')) {
    const x = hindernisPruefen(h)
    if (x) fall.hindernisse.push(x); else hinweise.push('Hindernis ungültig, übergangen')
  }
  const fix: Fixpunkt[] = []
  for (const x of liste('fixpunkte', 'Fixpunkte')) {
    const o = istObjekt(x) ? x : null
    if (o && typeof o.id === 'string' && istP(o.p) && imLv95(o.p) && FIXPUNKT_ARTEN.includes(o.art as FixpunktArt) &&
      !fix.some(y => y.id === o.id)) {
      const fp: Fixpunkt = { id: o.id, p: o.p, art: o.art as FixpunktArt }
      if (typeof o.name === 'string' && o.name.trim()) fp.name = o.name.trim().slice(0, FIXPUNKT_NAME_MAX)
      if (typeof o.avArt === 'string' && o.avArt) fp.avArt = o.avArt
      fix.push(fp)
    } else hinweise.push('Fixpunkt ungültig, übergangen')
  }
  if (fix.length) fall.fixpunkte = fix
  const plan: FlaechePlan[] = []
  for (const x of liste('flaechenPlan', 'Flächen (Plan)')) {
    const o = istObjekt(x) ? x : null
    const ring = o ? planRingPruefen(o.ring) : null
    if (o && ring && typeof o.id === 'string' && o.id && PLAN_ARTEN.includes(o.art as PlanArt) && !plan.some(y => y.id === o.id)) {
      const fp: FlaechePlan = { id: o.id, art: o.art as PlanArt, ring }
      if (o.standard !== undefined) {
        const st = planStandardPruefen(o.standard)
        if (st) fp.standard = st; else hinweise.push(`Kennzeichnung «Mittelinsel (Standard)» von ${o.id} ungültig, übergangen (Fläche bleibt)`)
      }
      plan.push(fp)
    } else hinweise.push('Fläche (Plan) ungültig, übergangen')
  }
  if (plan.length) fall.flaechenPlan = plan
  for (const [k, v] of objekt('zufahrten', 'Zufahrten')) {
    if (!istObjekt(v)) { hinweise.push(`Zufahrt ${k} ungültig, übergangen`); continue }
    const z: ZufahrtHand = {}
    if (zahl(v.tempo) && v.tempo >= 10 && v.tempo <= 120) z.tempo = v.tempo
    if (v.streichen === true) z.streichen = true
    const sp = spurPruefen(v.spur)
    if (sp) z.spur = sp
    if (Object.keys(z).length) fall.zufahrten[k] = z
    else if (Object.keys(v).length) hinweise.push(`Zufahrt ${k} ungültig, übergangen`)
  }
  for (const [k, v] of objekt('streifen', 'Streifen-Eingaben')) {
    if (!istObjekt(v)) { hinweise.push(`Streifen-Eingabe ${k} ungültig, übergangen`); continue }
    const e: StreifenEingabe = {}
    if (v.lsa === 'ja' || v.lsa === 'nein') e.lsa = v.lsa
    if (v.keinFgs === true) e.keinFgs = true
    let gemeldet = false
    if (v.typ !== undefined) {
      gemeldet = true
      if (!QUERUNG_OHNE_VORTRITT.includes(v.typ as QuerungOhneVortritt)) hinweise.push(`Streifen-Eingabe ${k}: Querungstyp ungültig, übergangen`)
      else if (e.keinFgs) hinweise.push(`Streifen-Eingabe ${k}: «kein FGS» und Querung ohne Vortritt zugleich – «kein FGS» gilt, Querungstyp übergangen`)
      else { e.typ = v.typ as QuerungOhneVortritt; gemeldet = false }
    }
    if (Object.keys(e).length) fall.streifen[k] = e
    else if (Object.keys(v).length && !gemeldet) hinweise.push(`Streifen-Eingabe ${k} ungültig, übergangen`)
  }
  for (const [k, v] of objekt('vorschlaege', 'Vorschläge')) {
    if (v === 'verworfen') fall.vorschlaege[k] = 'verworfen'
    else hinweise.push(`Vorschlag ${k} ungültig, übergangen`)
  }
  fall.baumkataster = roh.baumkataster === true
  if (roh.parkkataster === false) fall.parkkataster = false
  if (roh.luftbild === false) fall.luftbild = false
  if (roh.bedarf !== undefined) {
    const [b, hb] = bedarfLesen(roh.bedarf)
    hinweise.push(...hb)
    if (b) fall.bedarf = b
  }
  if (typeof roh.gespeichert === 'string') fall.gespeichert = roh.gespeichert   // Stand im Hinweis «aus dem Browser übernommen»
  return [fall, hinweise]
}

export function fallSchreiben(fall: Fall, ergebnis: FallErgebnis | null = null): string {
  const { ergebnis: _alt, bedarf, ...ohne } = fall
  void _alt
  // leerer Bedarf-Block (keine Handeingabe, keine Ebene) wird nicht geschrieben: der Fall bleibt Version 1 bzw. 2
  const rest = bedarfLeer(bedarf) ? ohne : { ...ohne, bedarf }
  return JSON.stringify({ ...rest, version: fallVersion(fall), gespeichert: new Date().toISOString(), ...(ergebnis ? { ergebnis } : {}) }, null, 1)
}

/** Eingaben des Falls als VonHand für die Rechnung */
export function vonHandAusFall(fall: Fall): VonHand {
  const z = (fid: string, kennung: string) => fall.zufahrten[zufahrtSchluessel(fid, kennung)]
  return {
    spur: (fid, kennung) => z(fid, kennung)?.spur ?? null,
    streichen: (fid, kennung) => !!z(fid, kennung)?.streichen,
    lsa: fid => fall.streifen[fid]?.lsa ?? null,
    keinFgs: fid => !!fall.streifen[fid]?.keinFgs,
    tempoKennung: (fid, kennung) => z(fid, kennung)?.tempo ?? null,
    querung: fid => {
      const e = fall.streifen[fid]
      return e?.typ && !e.keinFgs ? { typ: e.typ, inselMarkiert: inselMarkiert(fall) } : null
    },
  }
}

/** Insel im Bedarf von Hand als «nur markiert» bezeichnet (Querung ohne Vortritt: L über die ganze Fahrbahn) */
export const inselMarkiert = (fall: Fall): boolean => fall.bedarf?.felder['insel.art']?.wert === 'markiert'

/**
 * Schlüssel der Eingaben, die die Rechnung braucht: der ganze Fall ohne Bedarf-Block (der wirkt nur über «Insel nur markiert»),
 * ohne Speicherdatum und Ergebnis-Auszug. Gleicher Schlüssel: keine neue Rechnung nach einer Bedarf-Eingabe (App)
 */
export function rechnungsSchluessel(f: Fall): string {
  const { bedarf: _b, gespeichert: _g, ergebnis: _e, ...rest } = f
  void _b; void _g; void _e
  return stabil([rest, inselMarkiert(f)])
}

// ---------------------------------------------------------------- localStorage (nur Bequemlichkeit, darf fehlen)
const SPEICHER = 'fgsCheck.fall.'
/** Fall im Browser merken (Schlüssel «fgsCheck.fall.<Übergang>»); ein Fall ohne Eingaben wird nicht gespeichert, ein
 * vorhandener Eintrag dann entfernt (z. B. nach «Eingaben verwerfen» oder wenn alle Eingaben gelöscht sind) */
export function fallMerken(fall: Fall): void {
  const key = SPEICHER + (fall.ort.uebergang ?? 'ort')
  try {
    if (hatEingaben(fall)) localStorage.setItem(key, fallSchreiben(fall))
    else localStorage.removeItem(key)
  } catch { /* ohne Speicher */ }
}
/** Gemerkten Fall lesen: zu einem Übergang bzw. 'ort' = der zuletzt bearbeitete Fall ohne Übergang (Planung; ein einziger
 * Eintrag, «Letzten geplanten Fall wiederherstellen»). Unlesbarer Inhalt bzw. ohne Speicher: null */
export function fallErinnern(uebergang: number | 'ort'): Fall | null {
  try {
    const t = localStorage.getItem(SPEICHER + uebergang)
    return t ? fallLesen(t)[0] : null
  } catch { return null }
}
/** Eintrag eines Übergangs entfernen: der Fall gehört nicht mehr zu ihm (Ort verlegt, Übergang ausserhalb der geladenen
 * Daten; abdeckung.ts). Er lebt dann unter «fgsCheck.fall.ort» weiter, unter dem Übergang bliebe ein veralteter Stand. */
export function fallVergessen(uebergang: number): void {
  try { localStorage.removeItem(SPEICHER + uebergang) } catch { /* ohne Speicher */ }
}

/** Fall ohne OSM-Übergang (Kopie): Übergang und dessen Markierung weg, sonst unverändert */
export function ohneUebergang(f: Fall): Fall {
  const neu: Fall = structuredClone(f)
  neu.ort.uebergang = null
  delete neu.ort.markierung
  return neu
}

/** Wert als Text mit sortierten Schlüsseln (Inhaltsvergleich unabhängig von der Reihenfolge der Einträge) */
function stabil(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stabil).join(',')}]`
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().filter(k => (x as Record<string, unknown>)[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${stabil((x as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(x) ?? 'null'
}
/**
 * Inhalt der Eingaben eines Falls (Vergleich «als Datei gesichert», App): was hatEingaben zählt – Streifen von Hand, Hindernisse,
 * Zufahrten, Streifen-Eingaben, Vorschläge, Kataster- und Luftbild-Schalter, Bezeichnung, Fixpunkte, Flächen (Plan). Nicht dabei: quellen, gespeichert
 * und ergebnis (laufen nach dem Laden bzw. Rechnen nach, ohne Zutun), ort.markierung (aus der Rechnung) und die Lage des Orts
 * (folgt aus dem Übergang bzw. den Streifen von Hand; nach dem Laden einer Fall-Datei kann die App sie verlegen, die Datei
 * ergibt beim nächsten Laden dasselbe). Gleicher Text = gleiche Eingaben.
 */
export function eingabenSchluessel(f: Fall): string {
  // Flächen (Plan) nur, wenn vorhanden: der Schlüssel der Fälle ohne sie bleibt wie bisher
  // Bedarf ebenso nur, wenn vorhanden (Bedarfsmodul E1)
  return stabil([f.ort.bezeichnung ?? '', f.streifenHand, f.hindernisse, f.zufahrten, f.streifen, f.vorschlaege, f.baumkataster,
    f.parkkataster !== false, f.luftbild !== false, f.fixpunkte ?? [], ...(f.flaechenPlan?.length ? [f.flaechenPlan] : []),
    ...(!bedarfLeer(f.bedarf) ? [{ bedarf: f.bedarf }] : [])])
}

/**
 * Den offenen Fall im Browser merken? Für Fälle ohne Übergang gibt es nur den einen Eintrag «fgsCheck.fall.ort» (Planung). Ein
 * dort gemerkter ANDERER Fall (andere Eingaben, eingabenSchluessel) wird nicht still ersetzt (Nachprüfung 16.10.2026: Planfall
 * A ungesichert, Wechsel zu Übergang X bestätigt, bei X weit weg «Streifen planen» – B ersetzte A ohne Rückfrage).
 * eigen: der Eintrag gehört schon dem offenen Fall (er hat ihn geschrieben, bzw. Ersetzen ist bestätigt); gemerkt: Inhalt des
 * Eintrags (null: keiner bzw. unlesbar). -> 'merken' (fallMerken wie bisher, mit Übergang immer), 'nichts' (weder schreiben noch
 * den fremden Eintrag löschen: der offene Fall hat keine Eingaben) bzw. 'rueckfrage' (erst nach Bestätigung ersetzen).
 */
export function ortMerkenEntscheid(fall: Fall, eigen: boolean, gemerkt: Fall | null): 'merken' | 'nichts' | 'rueckfrage' {
  if (fall.ort.uebergang !== null || eigen) return 'merken'
  if (!gemerkt || !hatEingaben(gemerkt) || eingabenSchluessel(gemerkt) === eingabenSchluessel(fall)) return 'merken'
  return hatEingaben(fall) ? 'rueckfrage' : 'nichts'
}

// ---------------------------------------------------------------- Hilfen für die Oberfläche (E2-Korrektur)
/** Anzahl Eingaben eines Falls (Streifen von Hand, Hindernisse, Zufahrten, Streifen-Eingaben, verworfene Vorschläge bzw.
 * Parkfelder, Baumkataster zugeschaltet, amtliche Parkfelder abgeschaltet, Fixpunkte, Flächen (Plan), Bedarf: Handeingaben und
 * geschaltete Ebenen) */
export function eingabenZahl(f: Fall): number {
  return f.streifenHand.length + f.hindernisse.length + Object.keys(f.zufahrten).length + Object.keys(f.streifen).length +
    Object.keys(f.vorschlaege).length + (f.baumkataster ? 1 : 0) + (f.parkkataster === false ? 1 : 0) + (f.fixpunkte?.length ?? 0) +
    (f.flaechenPlan?.length ?? 0) + Object.keys(f.bedarf?.felder ?? {}).length + Object.keys(f.bedarf?.ebenen ?? {}).length
}

/** Hat der Fall etwas zu merken? Eingaben (eingabenZahl), Luftbild-Suche abgeschaltet oder eine Bezeichnung */
export function hatEingaben(f: Fall): boolean {
  return eingabenZahl(f) > 0 || f.luftbild === false || !!f.ort.bezeichnung?.trim()
}

/** Nächste freie Nummer für einen Streifen von Hand (höchste vorhandene + 1, eindeutig auch nach Löschen) */
export function naechsteHandId(f: Fall): string {
  const n = Math.max(0, ...f.streifenHand.map(s => Number(/^hand-(\d+)$/.exec(s.id)?.[1] ?? 0)))
  return `hand-${n + 1}`
}
/** Nächste freie Nummer für eine Fläche (Plan) (plan-1, plan-2, …) */
export function naechstePlanId(f: Fall): string {
  const n = Math.max(0, ...(f.flaechenPlan ?? []).map(x => Number(/^plan-(\d+)$/.exec(x.id)?.[1] ?? 0)))
  return `plan-${n + 1}`
}
/** Nächste freie Nummer für einen Fixpunkt (fix-1, fix-2, …) */
export function naechsteFixId(f: Fall): string {
  const n = Math.max(0, ...(f.fixpunkte ?? []).map(x => Number(/^fix-(\d+)$/.exec(x.id)?.[1] ?? 0)))
  return `fix-${n + 1}`
}

/**
 * Streifen (aus OSM + AV bzw. aus dem Luftbild) als Streifen von Hand übernehmen. Luftbild-Teile bringen die Enden auf der
 * geschrägten Achse (q0/q1) und die Balkenrichtung mit, damit der Umriss das Parallelogramm nachbildet. Eingaben der bisher
 * gerechneten Streifen (alte: Tempo, Spur, Streichen je Zufahrt; LSA, kein FGS je Streifen) gehen an den neuen Streifen mit der
 * nächsten Mitte (höchstens ZUORDNUNG_M entfernt), nicht über gleiche Nummern; die Rückfall-Kennung «s<Nr>:<Grad>» wird mit
 * umbenannt. Nicht zuordenbare Eingaben bleiben stehen (die App meldet sie als ohne Zufahrt). Angenommene Inseln (nach OSM und
 * Luftbild, inseln: die der Rechnung bzw. der Luftbild-Teile) gehen als Insel von Hand (Hindernis «insel», Name
 * INSEL_UEBERNOMMEN) in den Fall, damit die Streifen von Hand an der Insel geteilt bleiben (Zufahrten Inselteil, Einspur);
 * nicht, wenn schon eine Insel von Hand dieselbe Fläche deckt (inselnUebernehmen). Rückgabe: übertragene Eingaben.
 */
const ZUORDNUNG_M = 3.0
export function streifenUebernehmen(f: Fall, neue: { p0: P; p1: P; bw: number; q0?: P; q1?: P; richtung?: P }[],
  alte: { fgsId: string; p0: P; p1: P }[], herkunft?: StreifenHerkunft, inseln: { ring: P[] }[] = []): number {
  const mitte = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  f.streifenHand = []
  const neuM: [string, P][] = []
  for (const s of neue) {
    const id = naechsteHandId(f)
    const sh: StreifenHand = { id, p0: s.q0 ?? s.p0, p1: s.q1 ?? s.p1, breite: s.bw }
    if (s.richtung) sh.richtung = s.richtung
    if (herkunft) sh.herkunft = herkunft
    f.streifenHand.push(sh)
    neuM.push([id, mitte(s.p0, s.p1)])
  }
  const neu = new Map<string, string>()
  for (const a of alte) {
    const m = mitte(a.p0, a.p1)
    let best: [string, number] | null = null
    for (const [id, q] of neuM) { const d = Math.hypot(q[0] - m[0], q[1] - m[1]); if (d <= ZUORDNUNG_M && (!best || d < best[1])) best = [id, d] }
    if (best) neu.set(a.fgsId, best[0])
  }
  let n = 0
  const zuf: Record<string, ZufahrtHand> = {}
  for (const [k, v] of Object.entries(f.zufahrten)) {
    const i = k.indexOf('|'), alt = k.slice(0, i), kennung = k.slice(i + 1)
    const id = neu.get(alt)
    if (id) { zuf[zufahrtSchluessel(id, kennung.replace(`s${alt}:`, `s${id}:`))] = v; n++ } else zuf[k] = v
  }
  f.zufahrten = zuf
  const str: Record<string, StreifenEingabe> = {}
  for (const [k, v] of Object.entries(f.streifen)) {
    const id = neu.get(k)
    if (id) { str[id] = v; n++ } else str[k] = v
  }
  f.streifen = str
  inselnUebernehmen(f, inseln)
  return n
}

/**
 * Streifen von Hand id an einer Insel in zwei Teilstreifen teilen (Werkzeug «Mittelinsel (Standard)», 20.10.2026): der Streifen
 * behält Nummer und Eingaben und wird zum ersten Teil (teile[0]), der zweite Teil (teile[1]) bekommt die nächste freie Nummer und
 * steht in der Liste gleich dahinter; beide «angepasst», Name mit «(Teil 1)» bzw. «(Teil 2)». Die Streifen-Eingaben (Lichtsignal,
 * kein FGS) gelten für beide Teile; Eingaben je Zufahrt gehen an den Teil, den teilVon(Kennung) nennt (Rückfall-Kennung
 * «s<Nr>:<Grad>» umbenannt wie in streifenUebernehmen). -> neue Nummer, Zahl der übertragenen Zufahrt-Eingaben und was
 * teilungZuruecknehmen braucht; null ohne Streifen
 */
export interface TeilungRueck {
  id: string; neuId: string
  vorher: StreifenHand                      // der ungeteilte Streifen
  teil1: StreifenHand; teil2: StreifenHand  // die Teilstreifen direkt nach dem Teilen (Vergleich: seither geändert?)
  zufahrten: Record<string, ZufahrtHand>    // Eingaben je Zufahrt des ungeteilten Streifens (Schlüssel «id|Kennung»)
  streifen: StreifenEingabe | null          // Streifen-Eingabe des ungeteilten Streifens
}
export function streifenHandTeilen(f: Fall, id: string, teile: [[P, P], [P, P]], teilVon: (kennung: string) => 1 | 2):
  { neuId: string; verschoben: number; rueck: TeilungRueck } | null {
  const s = f.streifenHand.find(y => y.id === id)
  if (!s) return null
  const vorher = structuredClone(s)
  const zufVorher = Object.fromEntries(Object.entries(f.zufahrten).filter(([k]) => k.slice(0, k.indexOf('|')) === id)
    .map(([k, v]) => [k, structuredClone(v)]))
  const strVorher = f.streifen[id] ? structuredClone(f.streifen[id]) : null
  const neuId = naechsteHandId(f)
  const name = (n: number) => (s.name ? { name: `${s.name} (Teil ${n})`.slice(0, STREIFEN_NAME_MAX) } : {})
  const zweiter: StreifenHand = { ...s, id: neuId, p0: teile[1][0], p1: teile[1][1], angepasst: true, ...name(2) }
  Object.assign(s, { p0: teile[0][0], p1: teile[0][1], angepasst: true, ...name(1) })
  f.streifenHand.splice(f.streifenHand.indexOf(s) + 1, 0, zweiter)
  if (f.streifen[id]) f.streifen[neuId] = { ...f.streifen[id] }
  let verschoben = 0
  for (const [key, v] of Object.entries(f.zufahrten)) {
    const i = key.indexOf('|')
    if (key.slice(0, i) !== id) continue
    const kennung = key.slice(i + 1)
    if (teilVon(kennung) !== 2) continue
    delete f.zufahrten[key]
    f.zufahrten[zufahrtSchluessel(neuId, kennung.replace(`s${id}:`, `s${neuId}:`))] = v
    verschoben++
  }
  return { neuId, verschoben, rueck: { id, neuId, vorher, teil1: structuredClone(s), teil2: structuredClone(zweiter), zufahrten: zufVorher,
    streifen: strVorher } }
}

/** Sind die Teilstreifen einer Teilung seither unverändert (Lage, Breite, Name, Richtung)? Dann lässt sie sich zurücknehmen */
export function teilungZuruecknehmbar(f: Fall, r: TeilungRueck): boolean {
  const a = f.streifenHand.find(y => y.id === r.id), b = f.streifenHand.find(y => y.id === r.neuId)
  return !!a && !!b && stabil(a) === stabil(r.teil1) && stabil(b) === stabil(r.teil2)
}

/** Teilung zurücknehmen: den ungeteilten Streifen samt seinen Eingaben wie vor dem Teilen; Eingaben, die seither an den
 * Teilstreifen gesetzt wurden, entfallen. -> false, wenn die Teilstreifen seither geändert wurden (dann bleibt alles) */
export function teilungZuruecknehmen(f: Fall, r: TeilungRueck): boolean {
  if (!teilungZuruecknehmbar(f, r)) return false
  const i = f.streifenHand.findIndex(y => y.id === r.id)
  f.streifenHand[i] = structuredClone(r.vorher)
  f.streifenHand = f.streifenHand.filter(y => y.id !== r.neuId)
  for (const k of Object.keys(f.zufahrten)) if ([r.id, r.neuId].includes(k.slice(0, k.indexOf('|')))) delete f.zufahrten[k]
  Object.assign(f.zufahrten, structuredClone(r.zufahrten))
  delete f.streifen[r.neuId]
  if (r.streifen) f.streifen[r.id] = structuredClone(r.streifen); else delete f.streifen[r.id]
  return true
}

/** Letzte Verschiebung einer Mittelinsel (Drag-and-drop): Flächen (Plan) und Streifen von Hand davor; schluessel: Eingaben
 * (eingabenSchluessel) direkt danach. Zurücknehmen nur, solange seither nichts anderes geändert wurde (gleicher Schlüssel) */
export interface VerschiebungRueck { gruppe: string; schluessel: string; flaechenPlan: FlaechePlan[]; streifenHand: StreifenHand[] }
export const verschiebungZuruecknehmbar = (f: Fall, r: VerschiebungRueck): boolean => eingabenSchluessel(f) === r.schluessel
/** Verschiebung zurücknehmen: Flächen (Plan) und Streifen von Hand wie davor -> false, wenn seither etwas anderes geändert wurde */
export function verschiebungZuruecknehmen(f: Fall, r: VerschiebungRueck): boolean {
  if (!verschiebungZuruecknehmbar(f, r)) return false
  f.flaechenPlan = structuredClone(r.flaechenPlan)
  f.streifenHand = structuredClone(r.streifenHand)
  return true
}

/** Name einer beim Übernehmen geschriebenen Insel (angenommen nach OSM und Luftbild, danach Insel von Hand) */
export const INSEL_UEBERNOMMEN = 'Insel (aus Luftbild übernommen)'

/**
 * Angenommene Inseln als Inseln von Hand in den Fall schreiben (streifenUebernehmen). Doppel vermeiden: deckt schon eine Insel
 * von Hand die Mitte der Fläche, wird sie nicht nochmals geschrieben. Rückgabe: geschriebene Inseln.
 */
export function inselnUebernehmen(f: Fall, inseln: { ring: P[] }[]): number {
  const mitte = (r: P[]): P => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length]
  let n = 0
  for (const z of inseln) {
    if (z.ring.length < 3 || f.hindernisse.some(h => h.art === 'insel' && imPolygon(mitte(z.ring), [h.ring]))) continue
    let k = 1
    while (f.hindernisse.some(h => h.id === `insel-lb-${k}`)) k++
    f.hindernisse.push({ id: `insel-lb-${k}`, art: 'insel', ring: z.ring.map(p => [p[0], p[1]] as P), quelle: 'hand', name: INSEL_UEBERNOMMEN })
    n++
  }
  return n
}

/** Eingaben (Schlüssel), zu denen die Rechnung keine Zufahrt bzw. keinen Streifen mehr kennt */
export function eingabenVerwaist(f: Fall, streifen: { fgsId: string; zufahrten: { kennung: string }[];
  entfallen: { kennung: string }[] }[]): string[] {
  const zk = new Set(streifen.flatMap(s => [...s.zufahrten, ...s.entfallen].map(z => zufahrtSchluessel(s.fgsId, z.kennung))))
  const sk = new Set(streifen.map(s => s.fgsId))
  return [...Object.keys(f.zufahrten).filter(k => !zk.has(k)), ...Object.keys(f.streifen).filter(k => !sk.has(k))]
}

/** Bericht, Zeile «OSM-Übergang» eines Falls ohne Übergang: «geplanter Streifen» nur, wenn alle Streifen von Hand gezeichnet
 * sind (Herkunft 'gezeichnet', Werkzeug «Streifen planen»); übernommen bzw. Herkunft unklar (Fall-Dateien vor dem 11.10.2026):
 * neutral */
export function ortOhneUebergangText(f: Fall): string {
  if (!f.streifenHand.length) return 'kein OSM-Übergang'
  return f.streifenHand.every(s => s.herkunft === 'gezeichnet') ? 'kein OSM-Übergang (Ort am geplanten Streifen)' :
    'kein OSM-Übergang (Ort am Streifen von Hand)'
}

/** Herkunft eines Streifens von Hand als Text (Panel, Bericht) */
export function streifenHerkunftText(s: StreifenHand): string {
  const t = s.herkunft === 'gezeichnet' ? 'von Hand gezeichnet' : s.herkunft === 'osm' ? 'aus OSM und AV übernommen' :
    s.herkunft === 'luftbild' ? 'aus dem Luftbild übernommen' : s.herkunft === 'luftbild_vorschlag' ? 'aus dem Luftbild-Vorschlag (unsicher) übernommen' :
    'von Hand (Herkunft nicht gespeichert)'
  if (!s.angepasst || !s.herkunft) return t
  return s.herkunft === 'gezeichnet' ? `${t}, Enden verschoben` : `${t}, Enden von Hand angepasst`
}
