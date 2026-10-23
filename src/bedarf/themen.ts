// ── Bedarfsmodul Runde 2: Themen, Verbindlichkeit in Worten, Prüfübersicht (nur Anzeige) ──
//
// Themen: jede Regel des Katalogs hat genau ein Thema (KATALOG[id].thema, Pflichtfeld). THEMEN gibt Namen in Alltagssprache,
// Umfang und Anzeigereihenfolge. Die Punkte der Grundprüfung (bfu, Big Five) führen die bfu-Namen, ihr Thema steht klein daneben.
//
// Verbindlichkeit (Korrektur Runde 2, Schweizer Amtssprache Muss/Soll/Kann): aus Stärke (Wortlaut der Quelle, Entscheid E0-1) und
// Ebene ein Wort, z. B. «Muss (Norm)», «Muss (Norm), Abweichung nur mit verkehrstechnischem Bericht», «Soll (Norm), Abweichung
// begründen», «Hinweis (Richtlinie)». Regeln aus Projektentscheiden (erste Quelle fgsCheck) heissen «… (Projektentscheid fgsCheck)».
// Mehr sagt das Wort nicht (LEGENDE).
//
// Prüfübersicht (erweiterte Prüfung, ohne Grundprüfung B5 und ohne Weichen des Baums): je Regel ein Stand aus den Einträgen.
//   geprüft          = mit Eintrag (verletzt bzw. offen) oder erfüllt (Befund.erfuellt)
//   Befund           = mindestens ein Eintrag verletzt mit Stärke Muss, Muss mit Bericht oder Soll
//   offen            = kein solcher Eintrag, aber mindestens ein offener (Angabe fehlt)
//   Hinweis          = nur Einträge der Stärke Hinweis
//   ohne Befund      = erfüllt ohne Eintrag; nicht bei der zweiten Stufe eines Paars (PAARE), wenn die erste verletzt oder offen ist
//   nicht geprüft    = die Regel könnte gelten, ist aber nicht ausgewertet: Baum endet (Ortslage fehlt, ausserorts, Begegnungszone,
//                      flächige Nachfrage), Querungstyp fehlt, Zulässigkeit offen, Block ohne Eingaben, Ebene ausgeschaltet (nur
//                      Regeln, die mit eingeschalteter Ebene anwendbar wären, Befund.ebeneAus), Vorstufe nicht erfüllt bzw. offen
//   nicht anwendbar  = die Regel gilt im Fall nicht (Ergebnis null, nur still für die Empfehlung, andere Querungsart, Pfad nicht
//                      gewählt); zählt nicht als geprüft
// Damit gilt je Thema und gesamt: ohne Befund + offen + Befunde + Hinweise = geprüft; geprüft + nicht geprüft + nicht anwendbar =
// Zahl der Regeln (ERWEITERT_IDS).

import { KATALOG, REGEL_IDS } from './katalog'
import type { Befund, Ebene, Eintrag, RegelDef, Staerke, Thema } from './typen'
import type { Querungstyp } from './eingaben'

export interface ThemaDef { id: Thema; name: string; umfang: string }

const DEF = KATALOG as Readonly<Record<string, RegelDef>>

/** Namen und Umfang je Thema (Record: jedes Thema muss hier stehen) */
const THEMA_DEF = {
  zulaessigkeit: { name: 'Zulässigkeit', umfang: 'Ortslage, Tempo, Zone' },
  nachfrage: { name: 'Nachfrage', umfang: 'Querende, Fusswegnetz, Gründe für den Vortritt' },
  sicht: { name: 'Sicht', umfang: 'Sichtweite, Erkennbarkeit, Halteverbot, Parkierung' },
  insel: { name: 'Insel', umfang: 'ob eine Insel nötig ist, ihre Masse, Durchfahrt daneben' },
  fahrstreifen: { name: 'Fahrstreifen und Verkehr', umfang: 'Fahrstreifen je Richtung, Verkehrsmenge' },
  lage: { name: 'Lage und Abstände', umfang: 'Haltestelle, Abstand zu Lichtsignal und Streifen, Gehlinie, Knoten' },
  ausruestung: { name: 'Masse und Ausrüstung', umfang: 'Breite und Winkel, Markierung, Signale, Randstein, Tastlinien, Einengung' },
  beleuchtung: { name: 'Beleuchtung', umfang: 'Licht und Schatten an der Querung' },
  lichtsignal: { name: 'Lichtsignal', umfang: 'wann ein Lichtsignal zu prüfen ist, Grün- und Gelbzeiten' },
  trottoirueberfahrt: { name: 'Trottoirüberfahrt', umfang: 'Querung einer Seitenstrasse auf Trottoirhöhe' },
  ohneVortritt: { name: 'Ohne Vortritt und Mehrzweckstreifen', umfang: 'Furt, Querung ohne Vortritt, Mehrzweckstreifen' },
} as const satisfies Record<Thema, { name: string; umfang: string }>

/** Anzeigereihenfolge der Themen */
const REIHE: readonly Thema[] = ['zulaessigkeit', 'nachfrage', 'sicht', 'insel', 'fahrstreifen', 'lage', 'ausruestung', 'beleuchtung',
  'lichtsignal', 'trottoirueberfahrt', 'ohneVortritt']

/** Themen in Anzeigereihenfolge */
export const THEMEN: readonly ThemaDef[] = REIHE.map(id => ({ id, ...THEMA_DEF[id] }))

export const themaName = (t: Thema): string => THEMA_DEF[t].name
/** Thema einer Regel (unbekannte Nummer: null) */
export const themaVon = (id: string): Thema | null => DEF[id]?.thema ?? null

// ── Verbindlichkeit in Worten ──

/** Stärke nach Wortlaut der Quelle (Entscheid E0-1): Muss, Soll, Hinweis */
export const STAERKE_WORT: Readonly<Record<Staerke, string>> = { hart: 'Muss', hart_bericht: 'Muss', weich: 'Soll', hinweis: 'Hinweis' }
/** Zusatz nach der Ebene */
export const STAERKE_ZUSATZ: Readonly<Record<Staerke, string>> = {
  hart: '', hart_bericht: ', Abweichung nur mit verkehrstechnischem Bericht', weich: ', Abweichung begründen', hinweis: '',
}
/** Ebene als Herkunft */
export const EBENE_WORT: Readonly<Record<Ebene, string>> = {
  Recht: 'Recht', Norm: 'Norm', Bern: 'Standard Stadt Bern', 'Kanton BE': 'Arbeitshilfe Kanton Bern', Richtlinie: 'Richtlinie',
}
/** Herkunft «Projektentscheid» (Regeln, deren erste Quelle ein Entscheid des Projekts ist, z. B. A1, C3c) */
export const PROJEKT_WORT = 'Projektentscheid fgsCheck'
/** Verbindlichkeit in Worten aus Ebene und Stärke, z. B. «Muss (Norm)», «Soll (Standard Stadt Bern), Abweichung begründen» */
export const verbindlichkeit = (ebene: Ebene, staerke: Staerke): string =>
  `${STAERKE_WORT[staerke]} (${EBENE_WORT[ebene]})${STAERKE_ZUSATZ[staerke]}`
/** Verbindlichkeit eines Eintrags: wie verbindlichkeit, bei Projektentscheiden mit dieser Herkunft */
export function verbindlichkeitVon(x: Pick<Eintrag, 'id' | 'ebene' | 'staerke'>): string {
  if (DEF[x.id]?.quellen[0]?.werk === 'ENTSCHEID') return `${STAERKE_WORT[x.staerke]} (${PROJEKT_WORT})${STAERKE_ZUSATZ[x.staerke]}`
  return verbindlichkeit(x.ebene, x.staerke)
}
/** Legende unter Befundblatt und im Bericht */
export const LEGENDE = 'Muss, Soll und Hinweis nach dem Wortlaut der Quelle.'
/** Wort für einen offenen Eintrag (Eingabe fehlt, Entscheid E0-2) */
export const OFFEN_WORT = 'Angabe fehlt'

/**
 * Einheit an eine Ist- bzw. Soll-Angabe hängen, wo sie fehlt: am Ende nach einer Zahl («≥ 3,00» → «≥ 3,00 m») bzw. vor einem
 * Klammerzusatz am Ende («4,00 (Regel)» → «4,00 m (Regel)»); sonst (Wörter nach der Zahl, keine Zahl, Einheit schon da) unverändert.
 */
export function mitEinheit(t: string, einheit?: string): string {
  if (!einheit || !/\d/.test(t)) return t
  // Einheit schon da (als eigenes Wort nach einer Zahl, nicht als Buchstabe in «markierte» oder «bis»)
  const esc = einheit.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  if (new RegExp(`\\d\\s?${esc}(?![\\wäöü])`).test(t)) return t
  if (/\d$/.test(t)) return `${t} ${einheit}`
  const i = t.lastIndexOf(' (')
  if (t.endsWith(')') && i > 0 && /\d$/.test(t.slice(0, i))) return `${t.slice(0, i)} ${einheit}${t.slice(i)}`
  return t
}

/** Rang in einem Thema: hart, hart mit Bericht, weich, Hinweis, offen */
export function rang(x: Pick<Eintrag, 'zustand' | 'staerke'>): number {
  if (x.zustand === 'offen') return 4
  return { hart: 0, hart_bericht: 1, weich: 2, hinweis: 3 }[x.staerke]
}

/** Einträge nach Thema (Reihenfolge THEMEN; Themen ohne Eintrag fehlen), im Thema nach Rang, sonst in der Reihenfolge der Auswertung */
export function nachThema(alle: readonly Eintrag[]): { thema: ThemaDef; eintraege: Eintrag[] }[] {
  return THEMEN.map(thema => ({
    thema,
    eintraege: alle.map((x, i) => ({ x, i })).filter(({ x }) => themaVon(x.id) === thema.id)
      .sort((a, b) => rang(a.x) - rang(b.x) || a.i - b.i).map(({ x }) => x),
  })).filter(g => g.eintraege.length > 0)
}

// ── Prüfübersicht ──

/** Weiche des Baums (Art weiche: A1, B3, D1b, E1, E2, H2): steuert den Ablauf, zählt nicht und steht nicht als Eintrag im Befundblatt */
export const istWeiche = (id: string): boolean => DEF[id]?.art === 'weiche'
/** Weichen des Baums (Art weiche): melden einen Hinweis, zählen aber nicht als Regel */
const ZAEHLT = (d: RegelDef): boolean => d.gruppe !== 'B5' && d.art === 'befund'
/** Regeln der erweiterten Prüfung mit eigenem Befund (ohne Grundprüfung, Weichen, Aggregate, Verweise, gestrichene) */
export const ERWEITERT_IDS: readonly string[] = REGEL_IDS.filter(id => ZAEHLT(DEF[id]))

/**
 * Regelpaare bzw. Ketten (Korrektur A1): die zweite Stufe zählt nicht als «ohne Befund», wenn die erste verletzt oder offen ist
 * (die zweite Stufe ist dann nicht anwendbar bzw. unbekannt, ihr «nicht verletzt» hätte keine Grundlage).
 */
export const PAARE: readonly (readonly [string, string])[] = [
  ['F1a', 'F1b'], ['F2', 'F2b'], ['F6a', 'F6b'], ['E2b', 'E2c'], ['H3a', 'H3b'], ['C3', 'C3b'], ['C2', 'C2b'], ['D6-2', 'D6-2b'],
  ['D6-3', 'D6-3b'], ['D1', 'D2c'], ['D2', 'D2c'], ['D2a', 'D2c'], ['D2', 'D2a'], ['E3', 'E3a'], ['G7', 'G7b'],
]
const VORSTUFE = 'Vorstufe nicht erfüllt bzw. offen'
const EBENE_AUS = 'Ebene ausgeschaltet'

export type RegelStand = 'befund' | 'offen' | 'hinweis' | 'ohne_befund'

export interface Zaehlung {
  geprueft: number; ohneBefund: number; offen: number; befunde: number; hinweise: number; nichtGeprueft: number; nichtAnwendbar: number
}
export interface ThemaZeile extends Zaehlung {
  thema: ThemaDef
  /** ohne Befund geprüfte Regeln (Katalogreihenfolge) */
  ohneBefundIds: string[]
  /** häufigster Grund «nicht geprüft» im Thema */
  grund?: string
}
export interface PruefUebersicht extends Zaehlung {
  themen: ThemaZeile[]
  /** Stand je geprüfter Regel */
  stand: Map<string, RegelStand>
  /** nicht geprüfte Regeln mit Grund */
  nichtGeprueftWegen: Map<string, string>
  /** Gründe mit Zahl der Regeln (häufigste zuerst) */
  gruende: { grund: string; n: number }[]
}

/** Stand einer Regel aus ihren Einträgen: Befund vor offen vor Hinweis */
function standAus(xs: readonly Eintrag[]): RegelStand {
  if (xs.some(x => x.zustand === 'verletzt' && x.staerke !== 'hinweis')) return 'befund'
  if (xs.some(x => x.zustand === 'offen')) return 'offen'
  return 'hinweis'
}

/** Umfeld der Zählung: Ebenen-Schalter und Querungstyp (für die Gründe «nicht geprüft») */
export interface UebersichtKontext {
  ebenen?: { bern: boolean; kantonBE: boolean; richtlinie: boolean }
  typ?: Querungstyp | null
}
const ENDE: Record<string, string> = {
  offen: 'Ortslage fehlt', ausserorts: 'Baum endet: ausserorts', begegnungszone: 'Baum endet: Begegnungszone',
  flaechig: 'Baum endet: flächige Nachfrage',
}
const TYP_BLOECKE = ['E', 'F', 'G', 'H']

/** Grund «nicht geprüft» einer nicht ausgewerteten Regel; null = nicht anwendbar */
function grundVon(id: string, b: Pick<Befund, 'ausgewertet' | 'ende' | 'nichtGeprueft' | 'zulaessigkeit'> & Partial<Pick<Befund, 'ebeneAus'>>,
  k: UebersichtKontext): string | null {
  const d = DEF[id]
  if (b.ausgewertet.includes(id)) return null
  const eb = k.ebenen ?? { bern: false, kantonBE: false, richtlinie: true }
  // Korrektur S6: ausgeschaltete Ebene nur, wo die Regel mit eingeschalteter Ebene anwendbar wäre (Befund.ebeneAus); sonst nicht anwendbar
  const aus = (d.ebene === 'Bern' && !eb.bern) || (d.ebene === 'Kanton BE' && !eb.kantonBE) || (d.ebene === 'Richtlinie' && !eb.richtlinie)
  if (aus) return !b.ebeneAus || b.ebeneAus.includes(id) ? EBENE_AUS : null
  if (b.ende && ENDE[b.ende]) return ENDE[b.ende]
  if (d.gruppe === 'Q3' && b.nichtGeprueft.some(x => x.block === 'Q3')) return 'Eingaben zur Trottoirüberfahrt fehlen'
  if (d.gruppe === 'I' && b.nichtGeprueft.some(x => x.block === 'I')) return 'LSA-Zeiten fehlen'
  if (k.typ === null && (TYP_BLOECKE.includes(d.gruppe) || id === 'D7')) return 'Querungstyp fehlt'
  if (b.zulaessigkeit === 'offen' && d.gruppe === 'E') return 'Zulässigkeit offen'
  return null
}

const zaehle = (ids: readonly string[], stand: ReadonlyMap<string, RegelStand>, ng: ReadonlyMap<string, string>): Zaehlung => {
  const n = (s: RegelStand) => ids.filter(id => stand.get(id) === s).length
  const geprueft = ids.filter(id => stand.has(id)).length, nichtGeprueft = ids.filter(id => ng.has(id)).length
  return { geprueft, ohneBefund: n('ohne_befund'), offen: n('offen'), befunde: n('befund'), hinweise: n('hinweis'), nichtGeprueft,
    nichtAnwendbar: ids.length - geprueft - nichtGeprueft }
}
const gruendeVon = (ids: readonly string[], ng: ReadonlyMap<string, string>) => {
  const m = new Map<string, number>()
  for (const id of ids) { const g = ng.get(id); if (g) m.set(g, (m.get(g) ?? 0) + 1) }
  return [...m].map(([grund, n]) => ({ grund, n })).sort((a, c) => c.n - a.n)
}

/** Prüfübersicht eines Befunds (erweiterte Prüfung) */
export function pruefUebersicht(b: Pick<Befund, 'alle' | 'erfuellt' | 'ausgewertet' | 'ende' | 'nichtGeprueft' | 'zulaessigkeit'> & Partial<Pick<Befund, 'ebeneAus'>>,
  k: UebersichtKontext = {}): PruefUebersicht {
  const je = new Map<string, Eintrag[]>()
  for (const x of b.alle) if (ERWEITERT_IDS.includes(x.id)) je.set(x.id, [...(je.get(x.id) ?? []), x])
  const stand = new Map<string, RegelStand>()
  for (const [id, xs] of je) stand.set(id, standAus(xs))
  for (const id of b.erfuellt) if (ERWEITERT_IDS.includes(id) && !stand.has(id)) stand.set(id, 'ohne_befund')
  const ng = new Map<string, string>()
  // zweite Stufe eines Paars: nicht «ohne Befund», wenn die erste verletzt oder offen ist
  for (const [a, z] of PAARE) {
    const sa = stand.get(a)
    if (stand.get(z) === 'ohne_befund' && sa && sa !== 'ohne_befund') { stand.delete(z); ng.set(z, VORSTUFE) }
  }
  for (const id of ERWEITERT_IDS) if (!stand.has(id) && !ng.has(id)) { const g = grundVon(id, b, k); if (g) ng.set(id, g) }
  const themen = THEMEN.map(thema => {
    const t = ERWEITERT_IDS.filter(id => themaVon(id) === thema.id)
    const z = zaehle(t, stand, ng)
    // Grund im Thema: ein «echter» (nicht nur ausgeschaltete Ebene); die Ebene allein nur, wenn sonst nichts im Thema gilt
    const gr = gruendeVon(t, ng), echt = gr.filter(x => x.grund !== EBENE_AUS)
    const grund = echt[0]?.grund ?? (!z.geprueft && !z.nichtAnwendbar ? gr[0]?.grund : undefined)
    return { thema, ...z, ohneBefundIds: t.filter(id => stand.get(id) === 'ohne_befund'), ...(grund ? { grund } : {}) }
  })
  return { ...zaehle(ERWEITERT_IDS, stand, ng), themen, stand, nichtGeprueftWegen: ng, gruende: gruendeVon(ERWEITERT_IDS, ng) }
}

/** Zählung als Text: «12 geprüft, 9 ohne Befund, 2 offen, 1 Befund»; nichts geprüft: «nicht geprüft (Grund)» bzw. «nicht anwendbar» */
export function zaehlText(z: Zaehlung & { grund?: string }): string {
  if (!z.geprueft) return z.grund ? `nicht geprüft (${z.grund})` : 'nicht anwendbar'
  const teile = [`${z.ohneBefund} ohne Befund`]
  if (z.offen) teile.push(`${z.offen} offen`)
  if (z.befunde) teile.push(`${z.befunde} ${z.befunde === 1 ? 'Befund' : 'Befunde'}`)
  if (z.hinweise) teile.push(`${z.hinweise} ${z.hinweise === 1 ? 'Hinweis' : 'Hinweise'}`)
  return `${z.geprueft} geprüft, ${teile.join(', ')}`
}
