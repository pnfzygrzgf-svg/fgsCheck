// ── Bedarfsmodul E1: Block «bedarf» der Fall-Datei und Bildung der Eingaben ──
//
// Gespeichert werden nur Handeingaben (je Pfad Wert und Quelle) und die von Hand geschalteten Ebenen. Die Vorbelegung aus der
// Rechnung (vorbelegung.ts) wird nicht gespeichert, sondern bei jeder Rechnung neu gebildet; eine Handeingabe überschreibt sie.
// Objekt-Felder (insel, haltestelle …) speichert die Datei je Unterfeld («insel.breite»): so prüft fallLesen jedes Unterfeld
// einzeln (Art, Wertebereich, Auswahl), und eine Handeingabe ersetzt nur das betroffene Unterfeld der Vorbelegung.
// Ein Feld ohne Wert ist «offen» (Entscheid E0-2).
// Automatik Paket A (21.10.2026): eine Handeingabe kann ein Feld auch bewusst offen setzen ({ wert: null, quelle: 'hand' }): die
// Vorbelegung gilt dann nicht. Ältere Apps übergehen solche Einträge still (wie bisher jeden Eintrag ohne Wert), darum bleibt die
// Fall-Version. Zustand «rechner»: das Feld hat keinen Wert, der Sichtrechner rechnet es aber je Zufahrt (Sichtweite, Kurvenradius);
// es zählt nicht als offen, die Maske zeigt das Ergebnis des Sichtrechners.

import { FELD_DEF, OBJEKTE, feldName, istObjektFeld, unterfelder, wertGueltig, bereichText, type ObjektFeld } from './felder'
import { FELDNAMEN, leereEingaben, type BedarfEingaben, type Feld, type FeldName, type Quelle } from './eingaben'

/** Handeingabe eines Felds bzw. Unterfelds */
export interface HandFeld { wert: unknown; quelle: Quelle }
/** Handeingabe «bewusst offen» (verwirft die Vorbelegung) */
export const istHandOffen = (h: HandFeld | undefined | null): boolean => !!h && (h.wert === null || h.wert === undefined)
/** Ebenen von Hand geschaltet (fehlt: Vorgabe nach dem Ort; Recht und Norm sind immer an) */
export interface BedarfEbenen { bern?: boolean; kantonBE?: boolean; richtlinie?: boolean }
export interface BedarfBlock {
  /** Handeingaben je Pfad (Feldname bzw. «objekt.unterfeld») */
  felder: Record<string, HandFeld>
  ebenen?: BedarfEbenen
}
/** Quellen, die die Maske für Handeingaben anbietet (die übrigen bringt die Vorbelegung bzw. eine spätere Etappe) */
export const HAND_QUELLEN: readonly Quelle[] = ['hand', 'bestaetigt', 'schaetzung', 'annahme']
export const QUELLE_TEXT: Record<Quelle, string> = {
  av: 'AV', osm: 'OSM', geoportal: 'Geoportal Stadt Bern', luftbild: 'Luftbild', hand: 'von Hand', bestaetigt: 'bestätigt', annahme: 'Annahme',
  schaetzung: 'Schätzung',
  rechnung: 'Sichtrechner', vorschlag: 'Vorschlag',
}

const istObjekt = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const VERBOTEN = ['__proto__', 'constructor', 'prototype']
const EBENEN_SCHLUESSEL = ['bern', 'kantonBE', 'richtlinie'] as const

/** Block leer (keine Handeingabe, keine geschaltete Ebene)? Dann wird er nicht gespeichert (Fall-Version wie ohne Bedarf) */
export const bedarfLeer = (b: BedarfBlock | undefined | null): boolean =>
  !b || (!Object.keys(b.felder).length && !(b.ebenen && Object.keys(b.ebenen).length))

/**
 * Block aus der Fall-Datei lesen und tief prüfen -> [Block oder null, Hinweise]. Unbekannte Pfade, ungültige Werte (Art,
 * Bereich, Auswahl), ungültige Quellen und unbekannte Schlüssel werden übergangen und gemeldet; die gültigen bleiben.
 */
export function bedarfLesen(roh: unknown): [BedarfBlock | null, string[]] {
  const h: string[] = []
  if (!istObjekt(roh)) return [null, ['Bedarf ungültig (kein Objekt), übergangen']]
  const b: BedarfBlock = { felder: {} }
  for (const k of Object.keys(roh)) if (!['felder', 'ebenen'].includes(k)) h.push(`Bedarf: Schlüssel «${k}» unbekannt, übergangen`)
  if (roh.felder !== undefined && !istObjekt(roh.felder)) h.push('Bedarf: Felder ungültig (kein Objekt), übergangen')
  else for (const [pfad, v] of Object.entries(roh.felder ?? {})) {
    if (VERBOTEN.includes(pfad) || pfad === ZONE_GESTRICHEN) continue
    const d = FELD_DEF.get(pfad)
    if (!d) { h.push(`Bedarf-Feld «${pfad}» unbekannt, übergangen`); continue }
    if (!istObjekt(v)) { h.push(`Bedarf-Feld «${pfad}» ungültig (kein Objekt), übergangen`); continue }
    if (v.wert === null || v.wert === undefined) {
      // bewusst offen (Automatik Paket A): nur mit Quelle «von Hand»; sonst wie bisher still übergangen
      if (v.quelle === 'hand' && Object.keys(v).every(k => k === 'wert' || k === 'quelle')) b.felder[pfad] = { wert: null, quelle: 'hand' }
      continue
    }
    if (!wertGueltig(d.art, v.wert)) { h.push(`Bedarf-Feld «${pfad}»: Wert ${JSON.stringify(v.wert)} ungültig, übergangen`); continue }
    if (!(HAND_QUELLEN as readonly unknown[]).includes(v.quelle)) { h.push(`Bedarf-Feld «${pfad}»: Quelle ${JSON.stringify(v.quelle)} ungültig, übergangen`); continue }
    for (const k of Object.keys(v)) if (k !== 'wert' && k !== 'quelle') h.push(`Bedarf-Feld «${pfad}»: Schlüssel «${k}» unbekannt, übergangen`)
    b.felder[pfad] = { wert: structuredClone(v.wert), quelle: v.quelle as Quelle }
  }
  zoneAltLesen(roh.felder, b, h)
  if (roh.ebenen !== undefined) {
    if (!istObjekt(roh.ebenen)) h.push('Bedarf: Ebenen ungültig (kein Objekt), übergangen')
    else {
      const e: BedarfEbenen = {}
      for (const [k, v] of Object.entries(roh.ebenen)) {
        if (!(EBENEN_SCHLUESSEL as readonly string[]).includes(k)) { h.push(`Bedarf: Ebene «${k}» unbekannt, übergangen`); continue }
        if (typeof v !== 'boolean') { h.push(`Bedarf: Ebene «${k}» ungültig, übergangen`); continue }
        e[k as keyof BedarfEbenen] = v
      }
      if (Object.keys(e).length) b.ebenen = e
    }
  }
  return [bedarfLeer(b) ? null : b, h]
}

/** Feld «zoneVerkehrsorientiert» (gestrichen, Nutzerentscheid 20.10.2026): eine Hauptstrasse ausserhalb der Zone ist im
 * Tempo-Regime eine Strecke */
const ZONE_GESTRICHEN = 'zoneVerkehrsorientiert'
/**
 * Alte Fälle mit dem gestrichenen Feld: Wert verworfen. War es «ja» bei Tempo-Regime «Tempo-30-Zone» von Hand, gilt die Strasse
 * als Strecke (Quelle Annahme, mit Hinweis), damit die Beurteilung gleich bleibt (bisher C2c statt C2). Sonst ohne Wirkung, still.
 */
function zoneAltLesen(felder: unknown, b: BedarfBlock, h: string[]): void {
  if (!istObjekt(felder) || !istObjekt(felder[ZONE_GESTRICHEN])) return
  if (felder[ZONE_GESTRICHEN].wert !== true || b.felder.tempoRegime?.wert !== 't30_zone') return
  b.felder.tempoRegime = { wert: 'strecke', quelle: 'annahme' }
  h.push('Bedarf: Feld «verkehrsorientierte Strasse in der Zone» gestrichen; die Hauptstrasse ausserhalb der Zone gilt als Strecke ' +
    '(Tempo-Regime «Strecke» als Annahme)')
}

/** Vorbelegter Wert aus der Rechnung (vorbelegung.ts): Wert, Quelle und Herkunft als Text */
export interface VorWert { wert: unknown; quelle: Quelle; text: string
  /** Runde 4: Wert ist die Länge der ganzen Strasse (abstandFgsM, abstandLsaM; eingaben.Feld.ganzeStrasse) */
  ganzeStrasse?: true }
export type Vorbelegung = Record<string, VorWert>

/** Herkunft eines Pfads für die Anzeige: von Hand (überschreibt) bzw. vorbelegt bzw. offen */
export interface Herkunft { zustand: 'hand' | 'vorbelegt' | 'rechner' | 'offen'; quelle: Quelle | null; text: string; vorbelegt?: VorWert
  /** Wert der Handeingabe */
  wert?: unknown }

export interface Gebildet {
  eingaben: BedarfEingaben
  herkunft: Map<string, Herkunft>
  /** Hinweise zur Bildung (z. B. Unterfelder ohne das nötige Hauptfeld) */
  hinweise: string[]
}

/** Wert eines Unterfelds für das Objekt (Maske -> Typ von eingaben.ts) */
function objektWert(o: ObjektFeld, u: string, x: unknown): unknown {
  if (o === 'haltestelle' && u === 'art' && x === 'keine') return null
  if (o === 'q3' && u === 'anrampung' && Array.isArray(x)) return { neigung: x[0], laenge: x[1] }
  return x
}

/**
 * Eingaben für den Entscheidbaum aus Vorbelegung und Handeingaben bilden. Hand geht vor. Objekt-Felder entstehen aus ihren
 * Unterfeldern, wenn die Pflicht-Unterfelder gesetzt sind (z. B. insel.vorhanden); «keine Insel» setzt die übrigen Unterfelder
 * auf null. Quelle eines Objekts: von Hand, sobald ein Unterfeld von Hand kommt, sonst die Quelle der Vorbelegung des ersten
 * Unterfelds. fgQuelle folgt aus Zählung (fg5h) bzw. Schätzklasse (fgKlasse).
 */
export function eingabenBilden(vor: Vorbelegung, block: BedarfBlock | null | undefined, rechner: Readonly<Record<string, string>> = {}): Gebildet {
  const e = leereEingaben() as Record<FeldName, Feld<unknown>>
  const herkunft = new Map<string, Herkunft>()
  const hinweise: string[] = []
  const hand = block?.felder ?? {}
  const wert = (pfad: string): { wert: unknown; quelle: Quelle; hand: boolean; ganzeStrasse?: true } | null => {
    const hf = hand[pfad]
    if (hf && hf.wert !== null && hf.wert !== undefined) return { wert: hf.wert, quelle: hf.quelle, hand: true }
    if (hf) return null                                   // bewusst offen von Hand: keine Vorbelegung
    const v = vor[pfad]
    if (v && v.wert !== null && v.wert !== undefined) return { wert: v.wert, quelle: v.quelle, hand: false, ...(v.ganzeStrasse ? { ganzeStrasse: true as const } : {}) }
    return null
  }
  for (const [pfad] of FELD_DEF) {
    const hf = hand[pfad], v = vor[pfad]
    herkunft.set(pfad, hf ? { zustand: 'hand', quelle: hf.quelle, text: istHandOffen(hf) ? 'von Hand offen' : QUELLE_TEXT[hf.quelle], vorbelegt: v,
      wert: hf.wert ?? null }
      : v ? { zustand: 'vorbelegt', quelle: v.quelle, text: v.text, vorbelegt: v }
        : rechner[pfad] ? { zustand: 'rechner', quelle: 'rechnung', text: rechner[pfad] } : { zustand: 'offen', quelle: null, text: 'offen' })
  }
  for (const f of FELDNAMEN) {
    if (f === 'fgQuelle') continue
    if (!istObjektFeld(f)) {
      const x = wert(f)
      if (x) e[f] = { wert: structuredClone(x.wert), quelle: x.quelle, ...(x.ganzeStrasse ? { ganzeStrasse: true as const } : {}) }
      continue
    }
    const us = unterfelder(f)
    const werte = new Map(us.map(u => [u, wert(`${f}.${u}`)] as const))
    const gesetzt = us.filter(u => werte.get(u))
    if (!gesetzt.length) continue
    const fehlt = OBJEKTE[f].pflicht.filter(u => !werte.get(u))
    if (fehlt.length) {
      hinweise.push(`${feldName(f)}: bitte zuerst ${fehlt.map(u => `«${FELD_DEF.get(`${f}.${u}`)!.name}»`).join(', ')} angeben; bis dahin bleiben die übrigen Angaben dazu offen`)
      continue
    }
    const obj: Record<string, unknown> = {}
    const leer = (f === 'insel' && werte.get('vorhanden')!.wert === false) || (f === 'hvl' && werte.get('vorhanden')!.wert === false)
    for (const u of us) {
      const x = werte.get(u)
      obj[u] = x && (!leer || u === 'vorhanden') ? objektWert(f, u, structuredClone(x.wert)) : null
    }
    // Haltestelle «keine»: übrige Angaben ohne Bedeutung
    if (f === 'haltestelle' && obj.art === null) for (const u of us) obj[u] = null
    const quellen = us.map(u => werte.get(u)).filter(x => !!x)
    const vonHand = quellen.find(x => x!.hand)
    e[f] = { wert: obj, quelle: vonHand ? vonHand.quelle : werte.get(OBJEKTE[f].pflicht[0] ?? gesetzt[0])?.quelle ?? quellen[0]!.quelle }
  }
  // Fussgänger: Zählung vor Schätzklasse (Entscheid 5)
  if (e.fg5h.wert !== null) e.fgQuelle = { wert: 'zaehlung', quelle: e.fg5h.quelle }
  else if (e.fgKlasse.wert !== null) e.fgQuelle = { wert: 'schaetzung', quelle: 'schaetzung' }
  return { eingaben: e as BedarfEingaben, herkunft, hinweise }
}

/** Handeingabe prüfen wie beim Lesen der Fall-Datei: null = gültig (bzw. leer), sonst Meldung mit dem erlaubten Bereich */
export function handPruefen(pfad: string, wert: unknown, quelle: Quelle = 'hand'): string | null {
  const d = FELD_DEF.get(pfad)
  if (!d) return `Feld «${pfad}» unbekannt`
  if (wert === null || wert === undefined) return null
  if (!wertGueltig(d.art, wert)) return `${d.name}: ungültig, erlaubt ${bereichText(d.art)}`
  if (!HAND_QUELLEN.includes(quelle)) return `${d.name}: Quelle ungültig`
  return null
}

/** Handeingabe setzen bzw. entfernen (wert null): neuer Block, leer -> undefined. Ein ungültiger Wert (handPruefen) ändert nichts.
 * offen: das Feld bewusst offen setzen (verwirft die Vorbelegung; Automatik Paket A) */
export function handSetzen(b: BedarfBlock | undefined, pfad: string, wert: unknown, quelle: Quelle, offen = false): BedarfBlock | undefined {
  if (!FELD_DEF.has(pfad) || (!offen && handPruefen(pfad, wert, quelle))) return b
  const neu: BedarfBlock = { felder: { ...(b?.felder ?? {}) }, ...(b?.ebenen ? { ebenen: { ...b.ebenen } } : {}) }
  if (offen) neu.felder[pfad] = { wert: null, quelle: 'hand' }
  else if (wert === null || wert === undefined) delete neu.felder[pfad]
  else neu.felder[pfad] = { wert, quelle }
  return bedarfLeer(neu) ? undefined : neu
}

/** Gleicher Wert (Handeingabe gegen Vorbelegung): Zahlen, Listen, Text, ja/nein */
export const gleicherWert = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Ebene schalten (null: wieder Vorgabe nach dem Ort) */
export function ebeneSetzen(b: BedarfBlock | undefined, k: keyof BedarfEbenen, an: boolean | null): BedarfBlock | undefined {
  const e: BedarfEbenen = { ...(b?.ebenen ?? {}) }
  if (an === null) delete e[k]; else e[k] = an
  const neu: BedarfBlock = { felder: { ...(b?.felder ?? {}) }, ...(Object.keys(e).length ? { ebenen: e } : {}) }
  return bedarfLeer(neu) ? undefined : neu
}

/** Ebenen: von Hand geschaltet, sonst Vorgabe (Bern bzw. Kanton BE nach dem Ort, Richtlinie an) */
export function ebenenWirksam(b: BedarfBlock | undefined | null, vorgabe: { bern: boolean; kantonBE: boolean }):
  { bern: boolean; kantonBE: boolean; richtlinie: boolean } {
  return { bern: b?.ebenen?.bern ?? vorgabe.bern, kantonBE: b?.ebenen?.kantonBE ?? vorgabe.kantonBE, richtlinie: b?.ebenen?.richtlinie ?? true }
}

/** Gemeinde Bern (BFS-Nummer der Stadt Bern) für die Vorgabe der Ebene Bern */
export const BFS_BERN = 351
/** Vorgabe der Ebenen nach dem Ort: Bern, wenn die AV am Ort zur Stadt Bern gehört; Kanton BE, wenn sie im Kanton Bern liegt */
export const ebenenVorgabe = (bfs: readonly (number | null)[], kantone: readonly string[]): { bern: boolean; kantonBE: boolean } =>
  ({ bern: bfs.includes(BFS_BERN), kantonBE: kantone.includes('BE') })
