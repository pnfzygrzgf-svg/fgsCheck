// ── Bedarfsmodul: Auswertungskontext (E0) ──
//
// Zugriff der Regeln auf die Eingaben. Fehlt ein nötiger Wert, wirft der Zugriff Offen (Entscheid E0-2); entscheid.ts fängt das
// und meldet die Regel als «offen» mit den fehlenden Feldern. Einziger Ersatzwert: v85e() nimmt ohne V85 das signalisierte Tempo
// und vermerkt die Annahme.

import type { BedarfEingaben, FeldName, Werte } from './eingaben'
import type { Ebene, Staerke } from './typen'

/** Eine nötige Eingabe fehlt */
export class Offen extends Error {
  constructor(readonly felder: string[]) { super(`offen: ${felder.join(', ')}`) }
}

/** Ergebnis einer Regel: verletzt = Bedingung trifft zu; null (statt Ergebnis) = Regel hier nicht anwendbar */
export interface Ergebnis {
  verletzt: boolean
  /** Stärke im Einzelfall (Regeln mit fallabhängiger Stärke, z. B. F2d, F3) */
  staerke?: Staerke
  ist?: string
  soll?: string
  detail?: string
  /** fallbezogener Normhinweis (ergänzt bzw. ersetzt den des Katalogs) */
  normHinweis?: string
  /** fallbezogener Ergebnistext statt dem des Katalogs (Runde 4: G1/G2 bei ganzer Strasse) */
  text?: string
  /** Masse-Zeile nicht als verletzt werten (Hinweis statt Befund; Runde 4) */
  ohneMassBefund?: true
}

export type Stand = Ergebnis | 'offen' | null

export class Kontext {
  /** gelesene Felder (für die Liste der Annahmen) */
  readonly genutzt = new Set<FeldName>()
  readonly annahmen = new Set<string>()
  readonly ergebnisse = new Map<string, Stand>()
  /** fehlende Felder offener Regeln (D5-4 übernimmt die von H1 bzw. E3) */
  readonly offenFelder = new Map<string, string[]>()

  constructor(readonly e: BedarfEingaben, private readonly ebenen: Readonly<Record<Ebene, boolean>>) {}

  /** Wert eines Felds; fehlt er: Offen */
  w<K extends FeldName>(f: K): Werte[K] {
    const x = this.e[f]
    if (x?.wert === null || x?.wert === undefined) throw new Offen([f])
    this.genutzt.add(f)
    return x.wert as Werte[K]
  }

  /** Wert eines Felds oder null (für Felder, deren Fehlen die Regel selbst behandelt) */
  o<K extends FeldName>(f: K): Werte[K] | null {
    const x = this.e[f]
    if (x?.wert === null || x?.wert === undefined) return null
    this.genutzt.add(f)
    return x.wert as Werte[K]
  }

  /** Unterfeld eines Objekt-Felds (z. B. insel.breite); fehlt es: Offen mit «feld.unterfeld» */
  s<K extends FeldName, U extends keyof NonNullable<Werte[K]>>(f: K, u: U): NonNullable<NonNullable<Werte[K]>[U]> {
    const obj = this.w(f) as NonNullable<Werte[K]>
    const v = obj[u]
    if (v === null || v === undefined) throw new Offen([`${f}.${String(u)}`])
    return v as NonNullable<NonNullable<Werte[K]>[U]>
  }

  /** V85, ersatzweise das signalisierte Tempo (Annahme, Entscheid E0-2) */
  v85e(): number {
    const v = this.o('v85')
    if (v !== null) return v
    const s = this.w('vSig')
    this.annahmen.add(`V85 fehlt: signalisiertes Tempo ${s} km/h als V85 verwendet`)
    return s
  }

  nMax(): number { return Math.max(...this.w('nRichtung')) }
  /** Insel vorhanden und baulich (eine markierte Insel erfüllt keine Inselpflicht, F2d) */
  insBaulich(): boolean {
    const i = this.w('insel')
    if (!i.vorhanden) return false
    return this.s('insel', 'art') === 'baulich'
  }
  inselMarkiert(): boolean {
    const i = this.w('insel')
    return i.vorhanden && this.s('insel', 'art') === 'markiert'
  }
  /** Abstand ist die Länge der ganzen Strasse (Vorbelegung, Runde 4) */
  ganzeStrasse(f: 'abstandFgsM' | 'abstandLsaM'): boolean { return this.e[f]?.ganzeStrasse === true && this.e[f].wert !== null }
  /** besonderes Vortrittsbedürfnis (Schule, Kindergarten, Heim, Haltestelle, Schulweg) */
  bed(): boolean { return this.w('beduerfnis').length > 0 }
  /** Querung mit LSA (Typ lsa oder Lichtsignal am Streifen) */
  mitLsa(): boolean { return this.o('typ') === 'lsa' || this.w('fgsMitLsa') }

  /** Regel wurde ausgewertet und ist verletzt */
  hat(id: string): boolean {
    const r = this.ergebnisse.get(id)
    return !!r && r !== 'offen' && r.verletzt
  }
  istOffen(id: string): boolean { return this.ergebnisse.get(id) === 'offen' }
  an(e: Ebene): boolean { return this.ebenen[e] }
}
