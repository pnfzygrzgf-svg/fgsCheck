// ── Erweiterte Prüfung nach Thema (Nutzerentscheid 23.10.2026, reine Darstellung) ──
//
// Die erweiterte Prüfung steht im Panel und im Bericht je Thema (themen.THEMEN): zuerst die Befunde (✗ ! i), dann die offenen Angaben
// als Fragen (je Feld einmal, auch wenn mehrere Regeln es brauchen), im Panel mit Eingabe; darunter die übrigen Felder des Themas.
// Offene Einträge («?») erscheinen nicht mehr als Zeile, sondern als Frage. Befund, Sortierung und Rechnung bleiben unverändert.
//
// Feld → Thema (feldThema): Mehrheit der Themen der Regeln, die das Feld als geprüfte Grösse lesen (feldhilfen.bezuege, mit GEPRUEFT);
// ohne solche Regel die Regeln, für die es Schalter ist; Gleichstand: Reihenfolge der Themen; ohne Regel: «Weitere Angaben»; einige
// Schalter von Hand (FELD_THEMA).
// Frage → Thema: das Thema des Felds von Hand bzw. wenn eine der offenen Regeln dazu gehört, sonst die Mehrheit der Themen der offenen
// Regeln. Brauchen Regeln anderer Themen dieselbe Angabe, steht dort ein Verweis (zählt nicht); ebenso für Felder der Grundprüfung
// (felder.GRUND_FELDER, oben bei der Grundprüfung) in jedem Thema der Regeln. Blöcke, die der Ablauf ohne Angaben nicht prüft
// (Trottoirüberfahrt, LSA-Zeiten), stehen als Zeile mit Sprung zur ersten Angabe und zählen als offen.

import { FELD_DEF, FELD_DEFS, OBJEKTE, istGrundFeld, istObjektFeld } from './felder'
import { ABSCHNITTE, THEMEN, abschnittVon, istAusfuehrung, istWeiche, nachThema, normVergleich, pruefUebersicht, themaVon, type ThemaDef } from './themen'
import { bezuege, feldZiel, gilt, schaltet, type SichtKontext } from './feldhilfen'
import { KATALOG, type RegelId } from './katalog'
import type { BefundBlatt } from './befundblatt'
import type { Eintrag, Thema } from './typen'

const RANG = new Map<Thema, number>(THEMEN.map((t, i) => [t.id, i]))

/** häufigstes Thema der Regeln (Gleichstand: Reihenfolge der Themen); null ohne Regel mit Thema */
export function mehrheit(ids: readonly string[]): Thema | null {
  const n = new Map<Thema, number>()
  for (const id of ids) { const t = themaVon(id); if (t) n.set(t, (n.get(t) ?? 0) + 1) }
  if (!n.size) return null
  return [...n].sort((a, b) => b[1] - a[1] || RANG.get(a[0])! - RANG.get(b[0])!)[0][0]
}

/**
 * Schalter, deren Regel-Thema in die Irre führt (die Mehrheit ergäbe z. B. «Trottoirüberfahrt» für die Lage der Querung bzw. «Sicht» für
 * den Gegenverkehr): Thema von Hand
 */
const FELD_THEMA: Readonly<Record<string, Thema>> = {
  lage: 'lage', zweirichtung: 'fahrstreifen', radstreifen: 'fahrstreifen', tram: 'fahrstreifen', strassentyp: 'fahrstreifen',
  starkBelastet: 'fahrstreifen', neuanlage: 'zulaessigkeit', mzsMitFgs: 'ohneVortritt', inselMoeglich: 'insel',
  // 30.10.2026: Stellung im Berner Fusswegnetz neben der amtlichen Fusswegnetzplanung (die Regeln C2-B, C4-B stehen in Zulässigkeit
  // bzw. Fahrstreifen und verweisen hierher)
  netz: 'nachfrage',
}

const themaCache = new Map<string, Thema | null>()
/** Thema eines Felds der Maske (null: ohne Regel, «Weitere Angaben») */
export function feldThema(pfad: string): Thema | null {
  if (FELD_THEMA[pfad]) return FELD_THEMA[pfad]
  if (!themaCache.has(pfad)) {
    const b = bezuege(pfad).map(x => x.id)
    themaCache.set(pfad, mehrheit(b.length ? b : schaltet(pfad)))
  }
  return themaCache.get(pfad)!
}

/** offene Angabe als Frage */
export interface ThemaFrage {
  /** Feld der offenen Angabe (wie BefundBlatt.offen: Feld der Maske, Objekt, «Zufahrten») */
  feld: string
  /** Feld der Maske: Eingabe (eingabe) bzw. Sprung; null: Hinweis ohne Feld */
  ziel: string | null
  /** Regeln, die die Angabe brauchen (Katalogreihenfolge der Meldung) */
  regeln: string[]
  /** vorgeschlagene Annahme bestätigen statt eingeben */
  bestaetigen: boolean
  /** Eingabe direkt bei der Frage (in ziel, eingabeFeld); sonst Sprung bzw. Text */
  eingabe: boolean
}
/** Frage nur für die Ausführung (alle Regeln erst bei der Umsetzung): zählt nicht als offen */
export const nurAusfuehrung = (f: Pick<ThemaFrage, 'regeln'>): boolean => f.regeln.length > 0 && f.regeln.every(istAusfuehrung)

/** Verweis auf eine offene Angabe, die anderswo gefragt ist (Grundprüfung bzw. ein anderes Thema); zählt hier nicht */
export interface Verweis {
  /** Feld der Angabe (Sprungziel über feldZiel) */
  feld: string
  /** Regeln dieses Themas, die die Angabe brauchen */
  regeln: string[]
  /** wo die Angabe gefragt ist */
  wo: 'grund' | Thema
}
/** Block, den der Ablauf ohne Angaben nicht prüft (Trottoirüberfahrt, LSA-Zeiten): eine Zeile mit Sprung zur ersten Angabe */
export interface BlockOffen { block: string; text: string; ziel: string; regeln: string[] }

export interface ThemaTeil {
  thema: ThemaDef
  /** Befunde (✗ ! i) je Querung, ohne offene Einträge */
  eintraege: { b: BefundBlatt; xs: Eintrag[] }[]
  fragen: ThemaFrage[]
  /** offene Angaben anderswo (Grundprüfung, anderes Thema), die Regeln dieses Themas brauchen */
  verweise: Verweis[]
  /** Blöcke ohne Angaben nicht geprüft */
  bloecke: BlockOffen[]
  /** offene Regeln ohne Feld (weder Frage noch Verweis) */
  ohneAngaben: string[]
  /** ohne Befund geprüfte Regeln */
  ohneBefund: string[]
  /** erfüllt-Grund je Regel aus ohneBefund, sofern sie einen liefert (Befund.erfuelltGrund, über alle Querungen ohne Doppel) */
  erfuelltGrund: Record<string, string>
  /** geprüfte Regeln (Prüfübersicht, über alle Querungen) */
  geprueft: number
  /** Felder der Maske in diesem Thema (ohne Grundprüfung und ohne Felder mit Frage), Reihenfolge der Maske */
  felder: string[]
  /** Befunde und Hinweise je Regel (über alle Querungen); offen: Fragen, ungeprüfte Blöcke und Regeln ohne Feld (Verweise zählen
   * dort, wo gefragt wird) */
  zahl: { muss: number; soll: number; hinweise: number; offen: number }
}

export interface ThemenAnsicht {
  /** alle Themen in Anzeigereihenfolge */
  themen: ThemaTeil[]
  /** Felder ohne Thema */
  ohneThema: string[]
  /** Hinweise der Weichen (zählen nicht, «Zum Ablauf») */
  ablauf: { b: BefundBlatt; xs: Eintrag[] }[]
  /** Felder, die als Frage mit Eingabe stehen (nicht in der Maske) */
  frageFelder: ReadonlySet<string>
  /** geprüfte Regeln über alle Querungen */
  regeln: number
  /** Ablauf endet ohne Ortslage (alle Querungen) */
  ohneOrtslage: boolean
}

/** Zeile einer ohne Befund geprüften Regel (Panel und Bericht): «Wenig Querende: ohne Befund – Querung im Fusswegnetz (Geoportal Stadt
 * Bern)»; ohne Grund nur «…: ohne Befund» */
export const ohneBefundZeile = (titel: string, grund?: string): string => `${titel}: ohne Befund${grund ? ` – ${grund}` : ''}`

/** Thema mit eigenem Aufklapper: Befund, Frage, Verweis, ungeprüfter Block oder Regel */
export const hatInhalt = (t: ThemaTeil): boolean =>
  t.eintraege.length > 0 || t.fragen.length > 0 || t.verweise.length > 0 || t.bloecke.length > 0 || t.ohneAngaben.length > 0

const kontext = (b: BefundBlatt): SichtKontext => ({ e: b.gebildet.eingaben, ebenen: b.ebenen, alternative: b.alternative })
const giltIn = (id: string, b: BefundBlatt): boolean => !(id in KATALOG) || gilt(id as RegelId, kontext(b))

/** Blöcke, die der Ablauf ohne Angaben nicht prüft (Befund.nichtGeprueft): Thema, Text, erste Angabe, Grund der Prüfübersicht */
const BLOCK: Readonly<Record<string, { thema: Thema; text: string; ziel: string; grund: string }>> = {
  Q3: { thema: 'trottoirueberfahrt', text: 'Angaben zur Trottoirüberfahrt fehlen', ziel: 'q3.bebaut', grund: 'Eingaben zur Trottoirüberfahrt fehlen' },
  I: { thema: 'lichtsignal', text: 'LSA-Zeiten fehlen', ziel: 'lsaZeiten.L', grund: 'LSA-Zeiten fehlen' },
}
/** Gründe «nicht geprüft» der Prüfübersicht, die als Zeile im Thema stehen (nicht nochmals unter «Annahmen und Hinweise») */
export const BLOCK_GRUENDE: readonly string[] = Object.values(BLOCK).map(x => x.grund)

/** Feld, in das eine Frage direkt schreibt: Feld der Maske bzw. Objekt mit genau einem Pflicht-Unterfeld (Halteverbotslinie, Randstein
 * …); null: Frage ohne eigenes Feld (Trottoirüberfahrt, LSA-Zeiten: Sprung zur ersten Angabe; Zufahrten: Hinweis) */
export function eingabeFeld(feld: string): string | null {
  if (FELD_DEF.has(feld)) return feld
  return istObjektFeld(feld) && OBJEKTE[feld].pflicht.length === 1 ? `${feld}.${OBJEKTE[feld].pflicht[0]}` : null
}
/** Feld der Maske zu einem fehlenden Feld (Zählung bzw. Schätzung der Querenden: die Zählung) */
const zielVon = (f: string): string | null => (f === 'fgKlasse' || f === 'fgQuelle' ? 'fg5h' : feldZiel(f))
/** Thema einer Frage: das Thema des Felds (von Hand bzw. wenn eine der Regeln dazu gehört), sonst die Mehrheit der Themen der Regeln */
function themaFuer(ziel: string | null, regeln: readonly string[]): Thema | null {
  if (ziel && FELD_THEMA[ziel]) return FELD_THEMA[ziel]
  const stat = ziel ? feldThema(ziel) : null
  return stat && regeln.some(id => themaVon(id) === stat) ? stat : mehrheit(regeln) ?? stat
}

/** Ansicht der erweiterten Prüfung über alle Querungen eines Falls (Eingaben gelten für alle Querungen) */
export function themenAnsicht(blaetter: readonly BefundBlatt[]): ThemenAnsicht {
  const dazu = (l: string[], rs: readonly string[]) => { for (const r of rs) if (!l.includes(r)) l.push(r) }
  // offene Angaben aus den offenen Einträgen (unabhängig davon, ob der Block der Maske schon eine Eingabe hat), über alle Querungen; nur
  // Regeln, die im Fall greifen können; je Feld der Eingabe eine Frage, Felder der Grundprüfung als Verweis
  const offen = new Map<string, Omit<ThemaFrage, 'regeln'> & { regeln: string[] }>()
  const grundRef = new Map<string, string[]>()
  const ohneFeld = new Set<string>()
  for (const b of blaetter) for (const x of b.befund.alle) {
    if (x.zustand !== 'offen' || !giltIn(x.id, b)) continue
    const felder = x.fehlend ?? []
    if (!felder.length && !istWeiche(x.id)) ohneFeld.add(x.id)
    for (const f0 of felder) {
      const f = f0 === 'fgKlasse' || f0 === 'fgQuelle' ? 'fg5h' : f0
      const ef = eingabeFeld(f), ziel = ef ?? zielVon(f)
      if (ziel && istGrundFeld(ziel)) { const l = grundRef.get(ziel) ?? []; dazu(l, [x.id]); grundRef.set(ziel, l); continue }
      if (!ziel && f !== 'Zufahrten') { if (!istWeiche(x.id)) ohneFeld.add(x.id); continue }
      const key = ef ?? f
      const q = offen.get(key) ?? { feld: f, ziel, regeln: [], bestaetigen: false, eingabe: !!ef }
      dazu(q.regeln, [x.id])
      q.bestaetigen ||= !!x.bestaetigen
      offen.set(key, q)
    }
  }
  const fragenJe = new Map<Thema, ThemaFrage[]>(), verweiseJe = new Map<Thema, Verweis[]>()
  const verweis = (t: Thema, v: Verweis) => {
    const l = verweiseJe.get(t) ?? []
    const da = l.find(y => y.feld === v.feld && y.wo === v.wo)
    if (da) dazu(da.regeln, v.regeln); else l.push({ ...v, regeln: [...v.regeln] })
    verweiseJe.set(t, l)
  }
  const frageFelder = new Set<string>()
  // beurteilte Trottoirüberfahrt (27.10.2026): Fragen ihrer Regeln (z. B. die Lage) stehen in ihrem Thema an der Stelle der Prüfliste
  const nurTue = blaetter.length > 0 && blaetter.every(b => b.gebildet.eingaben.typ.wert === 'trottoirueberfahrt')
  for (const x of offen.values()) {
    const t = nurTue && x.regeln.some(id => themaVon(id) === 'trottoirueberfahrt' && abschnittVon(id)) ? 'trottoirueberfahrt' : themaFuer(x.ziel, x.regeln)
    if (!t) continue
    if (x.eingabe) frageFelder.add(x.ziel!)
    fragenJe.set(t, [...(fragenJe.get(t) ?? []), x])
    // Regeln anderer Themen: Verweis dort (die Regel verschwindet nicht aus ihrem Thema); nicht für Weichen des Ablaufs (sie zählen
    // nicht und gäben sonst einem Thema Inhalt, das im Fall nicht greift, z. B. Trottoirüberfahrt nur wegen der Lage)
    for (const r of x.regeln) { const tr = themaVon(r); if (tr && tr !== t && !istWeiche(r)) verweis(tr, { feld: x.ziel ?? x.feld, regeln: [r], wo: t }) }
  }
  // Fragen im Thema in der Reihenfolge der Norm (27.10.2026): nach der ersten Regel des Themas, die sie braucht
  const erste = (t: Thema, rs: readonly string[]) => [...rs].filter(id => themaVon(id) === t).sort(normVergleich)[0] ?? rs[0]
  for (const [t, fs] of fragenJe) fragenJe.set(t, fs.map((f, i) => ({ f, i })).sort((a, b) => normVergleich(erste(t, a.f.regeln), erste(t, b.f.regeln)) || a.i - b.i)
    .map(x => x.f))
  // Felder der Grundprüfung: Verweis in jedem Thema der Regeln, die sie brauchen
  for (const [ziel, regeln] of grundRef) for (const r of regeln) { const t = themaVon(r); if (t) verweis(t, { feld: ziel, regeln: [r], wo: 'grund' }) }
  const ohneAngabenJe = new Map<Thema, string[]>()
  for (const id of ohneFeld) { const t = themaVon(id); if (t) ohneAngabenJe.set(t, [...(ohneAngabenJe.get(t) ?? []), id]) }
  // Einträge: Befunde nach Thema (offene stehen als Frage bzw. Verweis)
  const ablauf: ThemenAnsicht['ablauf'] = []
  const eintraegeJe = new Map<Thema, { b: BefundBlatt; xs: Eintrag[] }[]>()
  for (const b of blaetter) {
    const ab = b.befund.alle.filter(x => istWeiche(x.id) && x.zustand === 'verletzt')
    if (ab.length) ablauf.push({ b, xs: ab })
    for (const { thema, eintraege } of nachThema(b.befund.alle.filter(x => !istWeiche(x.id) && x.zustand !== 'offen')))
      eintraegeJe.set(thema.id, [...(eintraegeJe.get(thema.id) ?? []), { b, xs: eintraege }])
  }
  // Prüfübersicht je Querung: ohne Befund und geprüft je Thema; Regeln gesamt (Vereinigung)
  const us = blaetter.map(b => pruefUebersicht(b.befund, { ebenen: b.ebenen, typ: b.gebildet.eingaben.typ.wert }))
  const regeln = new Set(us.flatMap(u => [...u.stand.keys()])).size
  // Felder der Maske je Thema
  const felderJe = new Map<Thema, string[]>(), ohneThema: string[] = []
  for (const d of FELD_DEFS) {
    if (istGrundFeld(d.pfad) || frageFelder.has(d.pfad)) continue
    const t = feldThema(d.pfad)
    if (t) felderJe.set(t, [...(felderJe.get(t) ?? []), d.pfad]); else ohneThema.push(d.pfad)
  }
  // Blöcke ohne Angaben nicht geprüft (Trottoirüberfahrt, LSA-Zeiten), mit den betroffenen Regeln der Prüfübersicht
  const bloeckeJe = new Map<Thema, BlockOffen[]>()
  blaetter.forEach((b, i) => {
    for (const ng of b.befund.nichtGeprueft) {
      const d = BLOCK[ng.block]
      if (!d) continue
      const regeln = [...us[i].nichtGeprueftWegen].filter(([, g]) => g === d.grund).map(([id]) => id)
      const l = bloeckeJe.get(d.thema) ?? []
      const da = l.find(y => y.block === ng.block)
      if (da) dazu(da.regeln, regeln); else l.push({ block: ng.block, text: d.text, ziel: d.ziel, regeln })
      bloeckeJe.set(d.thema, l)
    }
  })
  const themen = THEMEN.map((thema, i): ThemaTeil => {
    const eintraege = eintraegeJe.get(thema.id) ?? []
    const xs = eintraege.flatMap(e => e.xs)
    const fragen = fragenJe.get(thema.id) ?? [], bloecke = bloeckeJe.get(thema.id) ?? [], ohneAngaben = ohneAngabenJe.get(thema.id) ?? []
    const ohneBefund = [...new Set(us.flatMap(u => u.themen[i].ohneBefundIds))]
    const erfuelltGrund = Object.fromEntries(ohneBefund.flatMap(id => {
      const g = [...new Set(blaetter.map(b => b.befund.erfuelltGrund?.[id]).filter((x): x is string => !!x))]
      return g.length ? [[id, g.join('; ')]] : []
    }))
    // je Regel einmal (über alle Querungen): Muss vor Soll vor Hinweis
    const ids = (st: readonly string[]) => new Set(xs.filter(x => st.includes(x.staerke)).map(x => x.id))
    const muss = ids(['hart', 'hart_bericht']), soll = [...ids(['weich'])].filter(id => !muss.has(id))
    const hinweise = [...ids(['hinweis'])].filter(id => !muss.has(id) && !soll.includes(id))
    return {
      thema, eintraege, fragen, verweise: verweiseJe.get(thema.id) ?? [], bloecke, ohneAngaben, ohneBefund, erfuelltGrund,
      geprueft: Math.max(0, ...us.map(u => u.themen[i].geprueft)), felder: felderJe.get(thema.id) ?? [],
      zahl: { muss: muss.size, soll: soll.length, hinweise: hinweise.length,
        offen: fragen.filter(f => !nurAusfuehrung(f)).length + bloecke.length + ohneAngaben.filter(id => !istAusfuehrung(id)).length },
    }
  })
  return { themen, ohneThema, ablauf, frageFelder, regeln, ohneOrtslage: blaetter.every(b => b.befund.ende === 'offen') }
}

/** Teil der Gliederung eines Themas (themen.ABSCHNITTE): Überschrift des Abschnitts und des Unterabschnitts (leer: keine) mit seinen
 * Befunden, Fragen und Verweisen */
export interface GliedTeil {
  abschnitt: string
  unter: string
  eintraege: { b: BefundBlatt; xs: Eintrag[] }[]
  fragen: ThemaFrage[]
  verweise: Verweis[]
  /** Ausführung (erst bei der Umsetzung): eingeklappt, Fragen zählen nicht */
  ausfuehrung?: true
}

/**
 * Gliederung eines Themas nach der Prüfliste der Norm (27.10.2026; Trottoirüberfahrt nach VSS 40 242 Tab. 1 bis 3, dann Bern): je
 * Unterabschnitt die Befunde seiner Regeln, die Fragen, deren erste Regel (nach der Gliederung) dort steht, in der Reihenfolge der Regeln
 * und der Maske, und die Verweise. Was keiner Regel der Gliederung gehört, folgt ohne Überschrift. null: Thema ohne Gliederung.
 */
export function themaGliederung(t: ThemaTeil): GliedTeil[] | null {
  const abs = ABSCHNITTE[t.thema.id]
  if (!abs) return null
  const RANG_FELD = new Map(FELD_DEFS.map((d, i) => [d.pfad, i]))
  const erste = (regeln: readonly string[]): number =>
    Math.min(...regeln.map(id => abschnittVon(id)?.rang ?? Infinity))
  const teile: GliedTeil[] = []
  const passt = (regeln: readonly string[], ids: readonly string[]) => { const r = erste(regeln); return Number.isFinite(r) && ids.some(id => abschnittVon(id)?.rang === r) }
  for (const a of abs) for (const u of a.unter) {
    const eintraege = t.eintraege.map(e => ({ b: e.b, xs: e.xs.filter(x => u.regeln.includes(x.id)) })).filter(e => e.xs.length)
    const fragen = t.fragen.filter(f => passt(f.regeln, u.regeln))
      .sort((x, y) => erste(x.regeln) - erste(y.regeln) || (RANG_FELD.get(x.ziel ?? x.feld) ?? 1e9) - (RANG_FELD.get(y.ziel ?? y.feld) ?? 1e9))
    const verweise = t.verweise.filter(v => passt(v.regeln, u.regeln))
    teile.push({ abschnitt: a.titel, unter: u.titel, eintraege, fragen, verweise, ...(a.ausfuehrung ? { ausfuehrung: true as const } : {}) })
  }
  const rest: GliedTeil = { abschnitt: '', unter: '',
    eintraege: t.eintraege.map(e => ({ b: e.b, xs: e.xs.filter(x => !abschnittVon(x.id)) })).filter(e => e.xs.length),
    fragen: t.fragen.filter(f => !Number.isFinite(erste(f.regeln))), verweise: t.verweise.filter(v => !Number.isFinite(erste(v.regeln))) }
  return [...teile, rest].filter(x => x.eintraege.length || x.fragen.length || x.verweise.length)
}
