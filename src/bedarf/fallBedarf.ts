import { REGIONAL_DIENSTE, regionalDienst } from '../daten/anbieter/gemeinsam/regionalDienste'
import type { NpvmBeleg } from '../daten/anbieter/npvm'
import { npvmBelegLesen } from '../daten/anbieter/npvmSpeicher'
// ── Bedarfsmodul E1: Block «bedarf» der Fall-Datei und Bildung der Eingaben ──
//
// Gespeichert werden nur Handeingaben (je Pfad Wert und Quelle) und die von Hand geschalteten Ebenen. Die Vorbelegung aus der
// Rechnung (vorbelegung.ts) wird nicht gespeichert, sondern bei jeder Rechnung neu gebildet; eine Handeingabe überschreibt sie.
// Objekt-Felder (insel, haltestelle …) speichert die Datei je Unterfeld («insel.breite»): so prüft fallLesen jedes Unterfeld
// einzeln (Art, Wertebereich, Auswahl), und eine Handeingabe ersetzt nur das betroffene Unterfeld der Vorbelegung.
// Ein Feld ohne Wert ist «offen».
// Eine Handeingabe kann ein Feld auch bewusst offen setzen ({ wert: null, quelle: 'hand' }): die
// Vorbelegung gilt dann nicht. Ältere Apps übergehen solche Einträge still (wie bisher jeden Eintrag ohne Wert), darum bleibt die
// Fall-Version. Zustand «rechner»: das Feld hat keinen Wert, die Sichtprüfung rechnet es aber je Zufahrt (Sichtweite, Kurvenradius);
// es zählt nicht als offen, die Maske zeigt das Ergebnis der Sichtprüfung.

import { FELD_DEF, OBJEKTE, feldName, istObjektFeld, unterfelder, wertGueltig, bereichText, type ObjektFeld } from './felder'
import { FELDNAMEN, KURVE_BEDINGUNGEN, QUELLEN_ANNAHME, leereEingaben, type BedarfEingaben, type Feld, type FeldName, type Quelle } from './eingaben'

/** Handeingabe eines Felds bzw. Unterfelds */
export const DATENQUELLEN = {
  ...Object.fromEntries(REGIONAL_DIENSTE.map(d => [`regional.${d.id}`, d.anbieter])) as Record<`regional.${string}`, string>,
  'bern.dtv': 'Geoportal Stadt Bern', 'are.npvm': 'ARE; NPVM', 'app.dtv': 'App-Annahme',
  'zh.tempo': 'Stadt Zürich', 'zh.zone': 'Stadt Zürich; Verkehrszonen', 'osm.zone': 'OpenStreetMap (OSM)',
  'bern.vsig': 'Geoportal Stadt Bern', 'osm.tempo': 'OpenStreetMap (OSM)',
  'bern.halt': 'Geoportal Stadt Bern', 'bav.halt': 'BAV; Haltestellenpunkte', 'osm.halt': 'OpenStreetMap (OSM)',
} as const
export type DatenquelleId = keyof typeof DATENQUELLEN
export interface QuellenOption { datenstand?: string; zusatz?: string; id: DatenquelleId; wert: unknown; quelle: Quelle; text: string; npvmBeleg?: NpvmBeleg; vorgabe?: true }
export interface HandFeld { wert: unknown; quelle: Quelle; npvmBeleg?: NpvmBeleg; datenquelle?: { id: DatenquelleId; text: string; datenstand?: string } }
const quellPfad = (pfad: string, id: string): boolean => {
  const d = id.startsWith('regional.') ? regionalDienst(id.slice(9)) : null
  if (d?.id.startsWith('bedarf.')) return pfad === 'beduerfnis'
  if (d) return d.art === 'tempo' ? pfad === 'vSig' || pfad === 'tempoRegime'
    : d.art === 'zone' ? pfad === 'vSig' || pfad === 'tempoRegime'
      : d.id === 'bund.strasse' ? pfad === 'strassentyp'
        : d.id === 'bund.tram' ? ['tram', 'tramHaltestellenbereich'].includes(pfad)
          : d.id === 'bund.bauzone' ? ['innerorts','q3.bebaut','q3.gewerbe'].includes(pfad)
            : ['bund.gwr','bund.poi'].includes(d.id) && pfad === 'beduerfnis'
  return pfad === 'dtv' ? ['bern.dtv', 'are.npvm', 'app.dtv'].includes(id)
    : pfad === 'vSig' ? ['bern.vsig', 'osm.tempo', 'zh.tempo'].includes(id)
      : pfad === 'tempoRegime' ? ['zh.zone', 'osm.zone'].includes(id)
        : ['beduerfnis', 'haltestelleAngrenzend', 'tramHaltestellenbereich'].includes(pfad) && ['bern.halt', 'bav.halt', 'osm.halt'].includes(id)
}
/** Handeingabe «bewusst offen» (verwirft die Vorbelegung) */
export const istHandOffen = (h: HandFeld | undefined | null): boolean => !!h && (h.wert === null || h.wert === undefined)
/** Ebenen von Hand geschaltet (fehlt: Vorgabe nach dem Ort; Recht und Norm sind immer an) */
export interface BedarfEbenen { bern?: boolean; kantonBE?: boolean; richtlinie?: boolean }
export interface BedarfBlock {
  /** Handeingaben je Pfad (Feldname bzw. «objekt.unterfeld») */
  felder: Record<string, HandFeld>
  ebenen?: BedarfEbenen
}
/** Quellen, die die Maske für Handeingaben anbietet (die übrigen bringt die Vorbelegung bzw. ein späterer Ausbau) */
export const HAND_QUELLEN: readonly Quelle[] = ['hand', 'bestaetigt', 'schaetzung', 'annahme']
export const QUELLE_TEXT: Record<Quelle, string> = {
  av: 'AV', osm: 'OSM', geoportal: 'Geoportal Stadt Bern', amtlich: 'amtliche Quelle', luftbild: 'Luftbild', hand: 'von Hand', bestaetigt: 'bestätigt', annahme: 'Annahme',
  schaetzung: 'Schätzung',
  rechnung: 'Rechnung', vorschlag: 'Vorschlag',
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
    if (VERBOTEN.includes(pfad) || pfad === ZONE_GESTRICHEN || GESTRICHEN.includes(pfad) || objektGestrichen(pfad)) continue
    // alte Fall-Dateien (bis 29.10.2026): eine Frage «Sicht nach Kurvenradius anwendbar»; ja = alle fünf Voraussetzungen ja
    if (pfad === 'kurve.fuenfBedingungen') {
      if (istObjekt(v) && v.wert === true && (HAND_QUELLEN as readonly unknown[]).includes(v.quelle))
        for (const u of KURVE_BEDINGUNGEN) b.felder[`kurve.${u}`] = { wert: true, quelle: v.quelle as Quelle }
      continue
    }
    const d = FELD_DEF.get(pfad)
    if (!d) { h.push(`Bedarf-Feld «${pfad}» unbekannt, übergangen`); continue }
    if (!istObjekt(v)) { h.push(`Bedarf-Feld «${pfad}» ungültig (kein Objekt), übergangen`); continue }
    if (v.wert === null || v.wert === undefined) {
      // bewusst offen: nur mit Quelle «von Hand»; sonst wie bisher still übergangen
      if (v.quelle === 'hand' && Object.keys(v).every(k => k === 'wert' || k === 'quelle')) b.felder[pfad] = { wert: null, quelle: 'hand' }
      continue
    }
    if (!wertGueltig(d.art, v.wert)) { h.push(`Bedarf-Feld «${pfad}»: Wert ${JSON.stringify(v.wert)} ungültig, übergangen`); continue }
    if (!(HAND_QUELLEN as readonly unknown[]).includes(v.quelle)) { h.push(`Bedarf-Feld «${pfad}»: Quelle ${JSON.stringify(v.quelle)} ungültig, übergangen`); continue }
    for (const k of Object.keys(v)) if (!['wert', 'quelle', 'datenquelle'].includes(k) && !(pfad === 'dtv' && k === 'npvmBeleg')) h.push(`Bedarf-Feld «${pfad}»: Schlüssel «${k}» unbekannt, übergangen`)
    b.felder[pfad] = { wert: structuredClone(v.wert), quelle: v.quelle as Quelle }
    if (v.datenquelle !== undefined) {
      const q = v.datenquelle
      if (v.quelle === 'bestaetigt' && istObjekt(q) && typeof q.id === 'string' && Object.prototype.hasOwnProperty.call(DATENQUELLEN, q.id)
        && quellPfad(pfad, q.id) && typeof q.text === 'string' && q.text.length > 0 && q.text.length <= 8000
        && (q.datenstand === undefined || typeof q.datenstand === 'string' && q.datenstand.length <= 4000) && Object.keys(q).every(k => k === 'id' || k === 'text' || k === 'datenstand'))
        b.felder[pfad].datenquelle = { id: q.id as DatenquelleId, text: q.text, ...(typeof q.datenstand === 'string' ? { datenstand:q.datenstand } : {}) }
      else h.push(`Bedarf-Feld «${pfad}»: Datenquelle ungültig, übergangen`)
    }
    if (pfad === 'dtv' && v.npvmBeleg !== undefined) {
      const beleg = npvmBelegLesen(v.npvmBeleg)
      if (beleg && beleg.wert === v.wert && v.quelle === 'bestaetigt') b.felder[pfad].npvmBeleg = beleg
      else h.push('NPVM-Zuordnungsbeleg zum DTV ungültig, übergangen')
    }
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

/** Feld «zoneVerkehrsorientiert» (gestrichen): eine Hauptstrasse ausserhalb der Zone ist im
 * Tempo-Regime eine Strecke */
const ZONE_GESTRICHEN = 'zoneVerkehrsorientiert'
/** Gestrichene Felder alter Fall-Dateien, still übergangen: «Arme der Kreuzung ohne Querung» (B4) und «Kreuzung mit Lichtsignal»
 * (D5-2 ohne diese Bedingung); ebenso die Unterfelder zu den am 30.10.2026 gestrichenen Regeln F2g
 * (Pfostenhöhe), Q3-M10 (viel Verkehr), Q3-M2 (Hauptstrasse in der Zone) und F5b, F5f, F5i bis F5m (Ausführung der Trottoirüberfahrt).
 * Unterfelder stehen in der Datei je Pfad («q3.erkennbar»), darum genügt der Pfad */
const GESTRICHEN = ['knotenArmeOhneQuerung', 'knotenLsa', 'insel.pfostenH', 'q3.mivEinmHoch', 'q3.hauptInZone', 'q3.anrampung', 'q3.erkennbar',
  'q3.quergefaelle', 'q3.randabschluss', 'q3.randsteineSenkrecht', 'q3.signalisation', 'q3.markierung',
  // Block 3 vom 30.10.2026: Streifenbreite und Lücke Balken–Trottoirkante (F1a, F1b, F1c), Kantonsstrasse (F1-K), Halten im Sichtfeld
  // und nötige Länge der Halteverbotslinie (G7, G7b)
  'streifenBreite', 'randAbstand', 'kantonsstrasse', 'hvlBedarfM', 'haltenSichtrelevantUeber5m', 'haltenSonstVerboten']
/** Ganz gestrichene Objekt-Felder: LSA-Zeiten (Block I, zwölf Unterfelder) und Halteverbotslinie (G7, G7b).
 * Die Datei speichert sie je Unterfeld («lsaZeiten.gelb», «hvl.laengeM»); ein Eintrag unter dem Objektnamen selbst wird ebenso still
 * übergangen */
const OBJEKTE_GESTRICHEN = ['lsaZeiten', 'hvl']
const objektGestrichen = (pfad: string): boolean => OBJEKTE_GESTRICHEN.some(o => pfad === o || pfad.startsWith(`${o}.`))
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
export interface VorWert { datenstand?: string; wert: unknown; quelle: Quelle; text: string; npvmBeleg?: NpvmBeleg; quellenOptionen?: QuellenOption[]
  /** Neue Quellenableitung: wird erst nach ausdrücklicher Übernahme zur Eingabe der Regeln. */
  bestaetigungNoetig?: true
  /** Wert ist die Länge der ganzen Strasse (abstandFgsM, abstandLsaM; eingaben.Feld.ganzeStrasse) */
  ganzeStrasse?: true
  /** Wert aus der Rechnung der geraden Zufahrten (erkennungM; eingaben.Feld.geradeZufahrt) */
  geradeZufahrt?: true }
export type Vorbelegung = Record<string, VorWert>

/** Herkunft eines Pfads für die Anzeige: von Hand (überschreibt) bzw. vorbelegt bzw. offen */
export interface Herkunft { zustand: 'hand' | 'vorbelegt' | 'rechner' | 'offen'; quelle: Quelle | null; text: string; vorbelegt?: VorWert
  datenquelle?: HandFeld['datenquelle']
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
  const wert = (pfad: string): { wert: unknown; quelle: Quelle; hand: boolean; ganzeStrasse?: true; geradeZufahrt?: true } | null => {
    const hf = hand[pfad]
    if (hf && hf.wert !== null && hf.wert !== undefined) return { wert: hf.wert, quelle: hf.quelle, hand: true }
    if (hf) return null                                   // bewusst offen von Hand: keine Vorbelegung
    const v = vor[pfad]
    if (v?.bestaetigungNoetig) return null
    if (v && v.wert !== null && v.wert !== undefined) return { wert: v.wert, quelle: v.quelle, hand: false, ...(v.ganzeStrasse ? { ganzeStrasse: true as const } : {}), ...(v.geradeZufahrt ? { geradeZufahrt: true as const } : {}) }
    return null
  }
  for (const [pfad] of FELD_DEF) {
    const hf = hand[pfad], v = vor[pfad]
    herkunft.set(pfad, hf ? { zustand: 'hand', quelle: hf.quelle, text: istHandOffen(hf) ? 'von Hand offen' : QUELLE_TEXT[hf.quelle] + (hf.npvmBeleg ? `; modelliert (NPVM ${hf.npvmBeleg.bezugsjahr}), Strecke ${hf.npvmBeleg.nr}, Datenstand ${hf.npvmBeleg.datenstand ?? 'unbekannt'}, abgerufen ${hf.npvmBeleg.abgerufen}` : ''), vorbelegt: v,
      ...(hf.datenquelle ? { datenquelle: hf.datenquelle, text: `${QUELLE_TEXT[hf.quelle]}; ${DATENQUELLEN[hf.datenquelle.id]}: ${hf.datenquelle.text}` } : {}), wert: hf.wert ?? null }
      : v ? { zustand: v.wert == null ? 'offen' : 'vorbelegt', quelle: v.quelle, text: v.text, vorbelegt: v }
        : rechner[pfad] ? { zustand: 'rechner', quelle: 'rechnung', text: rechner[pfad] } : { zustand: 'offen', quelle: null, text: 'offen' })
  }
  for (const f of FELDNAMEN) {
    if (f === 'fgQuelle') continue
    if (!istObjektFeld(f)) {
      const x = wert(f)
      if (x) e[f] = { wert: structuredClone(x.wert), quelle: x.quelle, ...(x.ganzeStrasse ? { ganzeStrasse: true as const } : {}), ...(x.geradeZufahrt ? { geradeZufahrt: true as const } : {}) }
      continue
    }
    const us = unterfelder(f)
    const werte = new Map(us.map(u => [u, wert(`${f}.${u}`)] as const))
    const gesetzt = us.filter(u => werte.get(u))
    // Kurve (29.10.2026): immer da; ohne Angaben Sicht nach Tempo als Annahme (wie bisher die Vorbelegung «nein»)
    if (f === 'kurve') {
      const obj: Record<string, unknown> = Object.fromEntries(us.map(u => [u, werte.get(u) ? structuredClone(werte.get(u)!.wert) : null]))
      const b = KURVE_BEDINGUNGEN.map(u => werte.get(u))
      const alleJa = b.every(x => x?.wert === true)
      const angenommen = b.some(x => !!x && !x.hand && QUELLEN_ANNAHME.includes(x.quelle))
      obj.fuenfBedingungen = alleJa && !angenommen
      if (alleJa && angenommen) obj.vorschlag = true
      const qs = us.map(u => werte.get(u)).filter(x => !!x)
      // Quelle: von Hand, sonst Annahme (ohne Angaben bzw. mit angenommener Voraussetzung), sonst die der ersten Voraussetzung
      const bq = b.filter(x => !!x)
      e.kurve = { wert: obj, quelle: qs.find(x => x!.hand)?.quelle ?? (!bq.length || angenommen ? 'annahme' : bq[0]!.quelle) } as Feld<unknown>
      continue
    }
    if (!gesetzt.length) continue
    const fehlt = OBJEKTE[f].pflicht.filter(u => !werte.get(u))
    if (fehlt.length) {
      hinweise.push(`${feldName(f)}: bitte zuerst ${fehlt.map(u => `«${FELD_DEF.get(`${f}.${u}`)!.name}»`).join(', ')} angeben; bis dahin bleiben die übrigen Angaben dazu offen`)
      continue
    }
    const obj: Record<string, unknown> = {}
    const leer = f === 'insel' && werte.get('vorhanden')!.wert === false
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
  // Fussgänger: Zählung vor Schätzklasse
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
 * offen: das Feld bewusst offen setzen (verwirft die Vorbelegung) */
export function handSetzen(b: BedarfBlock | undefined, pfad: string, wert: unknown, quelle: Quelle, offen = false): BedarfBlock | undefined {
  if (!FELD_DEF.has(pfad) || (!offen && handPruefen(pfad, wert, quelle))) return b
  const neu: BedarfBlock = { felder: { ...(b?.felder ?? {}) }, ...(b?.ebenen ? { ebenen: { ...b.ebenen } } : {}) }
  if (offen) neu.felder[pfad] = { wert: null, quelle: 'hand' }
  else if (wert === null || wert === undefined) delete neu.felder[pfad]
  else neu.felder[pfad] = { wert, quelle }
  return bedarfLeer(neu) ? undefined : neu
}

/** Explizite Quellenwahl: Wert und nachvollziehbare Herkunft gemeinsam übernehmen. */
export function quellenWahlSetzen(b: BedarfBlock | undefined, pfad: string, option: QuellenOption): BedarfBlock | undefined {
  if (!quellPfad(pfad, option.id) || option.wert == null || handPruefen(pfad, option.wert, 'bestaetigt')) return b
  const neu = handSetzen(b, pfad, structuredClone(option.wert), 'bestaetigt')!
  neu.felder[pfad].datenquelle = { id: option.id, text: option.text, ...(option.datenstand ? { datenstand: option.datenstand } : {}) }
  if (pfad === 'dtv' && option.id === 'are.npvm' && option.npvmBeleg?.wert === option.wert)
    neu.felder[pfad].npvmBeleg = structuredClone(option.npvmBeleg)
  return neu
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
