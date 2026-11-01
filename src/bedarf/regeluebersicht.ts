// ── Bedarfsmodul: Regelübersicht (Nutzerwunsch 23.10.2026) ──
//
// Alle Regeln des Katalogs als Liste, erzeugt aus dem Katalog (keine Handliste): Kurztitel, Nummer, Thema, Verbindlichkeit,
// Fundstellen, wo die Regel wirkt (Grundprüfung mit Punkt bzw. erweiterte Prüfung mit Thema), wann sie gilt (Geltung und Ebene in
// Worten), welche Angaben sie braucht und was sie prüft (Prüfsatz des Katalogs, seit 23.10.2026 statt des Ergebnistexts). Gegliedert
// nach Thema (Vorgabe) oder nach Quelle; aktive Regeln (art «befund», dieselbe Zählung wie die Spalte «Regeln» der Quellentabelle,
// quellen.regelnJeWerk) in den Gruppen, Verzweigungen des Ablaufs, Zusammenfassungen und Verweise unter «Ablauf», gestrichene Regeln
// am Ende. Nur eigene Texte aus dem Katalog.

import { KATALOG, REGEL_IDS, type RegelId, type WerkId } from './katalog'
import type { RegelDef, Thema } from './typen'
import { ABSCHNITTE, THEMEN, abschnittVon, gruppeAb, normVergleich, themaName } from './themen'
import { GELTUNG, geltungKurz, regelPfade } from './feldhilfen'
import { feldName } from './felder'
import { grundPunktVon } from './grundpruefung'
import { LESENAME, WERK_IDS } from './quellen'

const DEF = KATALOG as Readonly<Record<string, RegelDef>>

export type RegelArtGruppe = 'aktiv' | 'ablauf' | 'gestrichen'
export interface RegelZeile {
  id: RegelId
  titel: string
  thema: Thema
  art: RegelArtGruppe
  /** Verbindlichkeit für Laien: «Muss nach bfu», «Soll nach VSS-Norm», «Hinweis nach Standard Stadt Bern»; leer bei Ablauf und gestrichenen */
  verbindlichkeit: string
  /** was die Regel prüft, ein Satz (Prüfsatz des Katalogs) */
  prueft: string
  /** wo sie wirkt: «Grundprüfung, ② Fussgängerschutzinsel» bzw. «Erweiterte Prüfung, Thema Insel» */
  wo: string
  /** für welche Fälle sie gilt, in Worten (höchstens zwei Teile; «alle Querungen», wenn immer) */
  giltFuer: string
  /** die genaue Bedingung (Tooltip), wenn «und weitere Bedingungen» */
  giltGenau?: string
  /** Angaben, die sie braucht (Pfade der Maske mit Namen) */
  angaben: { pfad: string; name: string }[]
  /** Werke der Fundstellen (ohne Doppel) */
  werke: WerkId[]
}

const PUNKT_NAME: Record<string, string> = { T: 'Tempo', 1: '① Sichtverhältnisse', 2: '② Fussgängerschutzinsel', 3: '③ Fahrstreifen',
  4: '④ Beleuchtung', 5: '⑤ Fussgängerfrequenz', W: 'Ergänzend (bfu)' }
const STAERKE_LAIE: Record<string, string> = { hart: 'Muss', hart_bericht: 'Muss', weich: 'Soll', hinweis: 'Hinweis' }
const EBENE_LAIE: Record<string, string> = { Recht: 'Bundesrecht', Norm: 'VSS-Norm', Bern: 'Standard Stadt Bern', 'Kanton BE': 'Arbeitshilfe Kanton Bern' }
const WERK_LAIE: Partial<Record<WerkId, string>> = { BFU: 'bfu', BFU2016: 'bfu', HA: 'Fachstelle Hindernisfreie Architektur', VCS: 'VCS',
  ENTSCHEID: 'Projektentscheid' }

/** Gruppe einer Regel in der Übersicht: aktiv (mit eigenem Befund), Ablauf (Verzweigung, Zusammenfassung, Verweis), gestrichen */
export const regelArtGruppe = (id: string): RegelArtGruppe =>
  (DEF[id].art === 'befund' ? 'aktiv' : DEF[id].art === 'gestrichen' ? 'gestrichen' : 'ablauf')

/** Verbindlichkeit für Laien aus Stärke und Herkunft (erste Fundstelle bzw. Ebene) */
function verbindlichkeitLaie(d: RegelDef): string {
  if (!d.staerke || !d.ebene) return ''
  const w = d.quellen[0]?.werk as WerkId | undefined
  const her = (w && WERK_LAIE[w]) ?? EBENE_LAIE[d.ebene] ?? 'Richtlinie'
  return `${STAERKE_LAIE[d.staerke]} nach ${her}${d.staerke === 'hart_bericht' ? ' (Abweichung nur mit Bericht)' : ''}`
}

/** Abschnitt der Gliederung eines Themas (themen.ABSCHNITTE), z. B. «, Zwingende Voraussetzungen (VSS 40 242 Tab. 1, S. 28)» */
function abschnittText(id: string): string {
  const a = abschnittVon(id), d = DEF[id]
  return a ? `, ${ABSCHNITTE[d.thema]![a.abschnitt].titel}` : ''
}

/** Zeile einer Regel */
export function regelZeile(id: RegelId): RegelZeile {
  const d = DEF[id]
  const punkt = d.gruppe === 'B5' ? grundPunktVon(id) : null
  const g = geltungKurz(GELTUNG[id])
  const ebene = d.gruppe !== 'B5' && d.ebene === 'Bern' ? 'nur Stadt Bern' : d.gruppe !== 'B5' && d.ebene === 'Kanton BE' ? 'nur Kanton Bern' : ''
  // höchstens zwei Teile, der Rest als «und weitere Bedingungen» (genaue Bedingung im Tooltip)
  const alleTeile = [ebene, ...g.teile].filter(Boolean), teile = alleTeile.slice(0, 2), mehr = alleTeile.length > 2
  return {
    id, titel: d.titel, thema: d.thema, art: regelArtGruppe(id), verbindlichkeit: verbindlichkeitLaie(d),
    prueft: d.pruefsatz,
    wo: d.gruppe === 'B5' ? `Grundprüfung${punkt ? `, ${PUNKT_NAME[punkt]}` : ''}` : `Erweiterte Prüfung, Thema ${themaName(d.thema)}${abschnittText(id)}`,
    giltFuer: teile.length ? `${teile.join('; ')}${mehr ? ' und weitere Bedingungen' : ''}` : 'alle Querungen',
    ...(mehr ? { giltGenau: [ebene, g.genau].filter(Boolean).join('; ') } : {}),
    angaben: regelPfade(id).map(p => ({ pfad: p, name: feldName(p) })),
    werke: [...new Set(d.quellen.map(q => q.werk as WerkId))],
  }
}

/** alle Regeln des Katalogs, je einmal, in der Reihenfolge des Katalogs */
export const regelZeilen = (): RegelZeile[] => REGEL_IDS.map(regelZeile)

export type Gliederung = 'thema' | 'quelle'
export interface RegelFilter { werk?: WerkId | ''; thema?: Thema | ''; suche?: string }
export interface RegelGruppe { schluessel: string; name: string; zeilen: RegelZeile[]
  /** Gliederung nach Thema: Überschrift der Themengruppe (Norm, Kapitel, Seite) vor dem ersten Thema der Gruppe */
  ober?: string }

/** Werke, deren Regeln in der Gliederung nach Quelle nach Kapitel stehen (30.10.2026: Richtlinie Hindernisfreie Architektur, Kap. 4.1,
 * 4.2, 4.4); die übrigen in der Reihenfolge des Katalogs */
const NACH_KAPITEL: readonly WerkId[] = ['HA']
/** Kapitel der Fundstelle im Werk als Zahlen (ohne Kapitel: ans Ende) */
const kapitel = (id: string, w: WerkId): number[] => {
  const m = /Kap\.\s*(\d+(?:\.\d+)*)/.exec(DEF[id].quellen.find(q => q.werk === w)?.ziffer ?? '')
  return m ? m[1].split('.').map(Number) : [Infinity]
}
function nachKapitel(w: WerkId, zs: RegelZeile[]): RegelZeile[] {
  if (!NACH_KAPITEL.includes(w)) return zs
  const vgl = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? -1) - (b[i] ?? -1); if (d) return d } return 0 }
  return zs.map((x, i) => ({ x, i })).sort((a, b) => vgl(kapitel(a.x.id, w), kapitel(b.x.id, w)) || a.i - b.i).map(y => y.x)
}

/** Suche in Titel und Nummer (ohne Gross-/Kleinschreibung) */
const passt = (z: RegelZeile, f: RegelFilter): boolean => {
  const s = (f.suche ?? '').trim().toLowerCase()
  return (!f.werk || z.werke.includes(f.werk)) && (!f.thema || z.thema === f.thema) &&
    (!s || z.titel.toLowerCase().includes(s) || z.id.toLowerCase().includes(s))
}

/**
 * Gruppen der Übersicht: nach Thema (jede Regel genau einmal) bzw. nach Quelle (eine Regel mit mehreren Werken unter jedem; die
 * Zahl der aktiven Regeln je Werk ist die Spalte «Regeln» der Quellentabelle). Ablauf und gestrichene Regeln als eigene Gruppen am
 * Ende; leere Gruppen entfallen.
 */
export function regelGruppen(zeilen: readonly RegelZeile[], nach: Gliederung, f: RegelFilter = {}): RegelGruppe[] {
  const z = zeilen.filter(x => passt(x, f))
  const aktiv = z.filter(x => x.art === 'aktiv')
  const gruppen: RegelGruppe[] = nach === 'thema'
    ? THEMEN.map(t => ({ schluessel: `thema-${t.id}`, name: t.name, zeilen: aktiv.filter(x => x.thema === t.id).map((x, i) => ({ x, i }))
      .sort((a, b) => normVergleich(a.x.id, b.x.id) || a.i - b.i).map(y => y.x), ...(gruppeAb(t.id) ? { ober: gruppeAb(t.id)! } : {}) }))
    : WERK_IDS.filter(w => !f.werk || w === f.werk).map(w => ({ schluessel: `werk-${w}`, name: LESENAME[w], zeilen: nachKapitel(w, aktiv.filter(x => x.werke.includes(w))) }))
  gruppen.push({ schluessel: 'ablauf', name: 'Ablauf (Verzweigungen, Zusammenfassungen, Verweise)', zeilen: z.filter(x => x.art === 'ablauf') })
  gruppen.push({ schluessel: 'gestrichen', name: 'Gestrichen', zeilen: z.filter(x => x.art === 'gestrichen') })
  return gruppen.filter(g => g.zeilen.length)
}

/** Anker der Zeile einer Regel bzw. der Gruppe eines Werks in der Übersicht */
export const regelAnker = (id: string): string => `regel-${id}`
export const regelWerkAnker = (w: string): string => `regeln-werk-${w}`

// ── Sprünge in die Übersicht und zu einem Feld (Ereignisse im Fenster; die Übersicht und der Bedarf-Abschnitt hören zu) ──

/** Zeile einer Regel in der Übersicht zeigen (Gliederung nach Thema, Filter aus) */
export function regelZeigen(id: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('fgs-regel', { detail: { id } }))
}
/** Regeln eines Werks zeigen (Gliederung nach Quelle, auf das Werk gefiltert) */
export function regelnWerkZeigen(werk: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('fgs-regel', { detail: { werk } }))
}
/** zum Feld der Eingabemaske im Reiter «Bedarf und Querungstyp» springen */
export function feldSpringen(pfad: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('fgs-feld', { detail: { pfad } }))
}
