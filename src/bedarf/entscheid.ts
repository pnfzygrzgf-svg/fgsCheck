// ── Bedarfsmodul: Entscheidbaum (E0) ──
//
// beurteile(eingaben, optionen) → Befund: reine Funktion ohne Oberfläche. Ablauf nach Bedarfsmodul_E0_Regeln.md 2.4:
//   1. A1 (ausserorts) → Ende; A2 (Begegnungszone) → Ende; A3, A4.
//   2. B1 (flächig) → Ende mit Hinweisen; B3 (Einmündung) merkt Q3 vor; B4, G3.
//   3. C1 bis C4 → Zulässigkeit. Nicht angezeigt (C1, C2 verletzt) → Pfad E, sonst Pfad D.
//   4. D (Norm setzt den Typ, Bern meldet nur). Die Befunde aus D gelten dem Fussgängerstreifen; ist die beurteilte Anlage kein
//      FGS (Typ furt, ohne_vortritt …), bestimmen sie nur die Empfehlung und erscheinen nicht als Befund.
//   5. E bei «nicht angezeigt» oder Typ ohne Vortritt: E1/E2, E2a, E2d, E2e, Sicht E3/E3a.
//   6. Prüfung der beurteilten Anlage nach Typ: F1 (FGS, LSA), F2–F4, F7 und E2b/E2c (alle), F5 (Trottoirüberfahrt), F6 und D7
//      (Mehrzweckstreifen), G und H (nur FGS).
//   7. D5 (LSA prüfen), Q3 (Einmündung bzw. Typ Trottoirüberfahrt), I (mit LSA).
// Ebenen Recht und Norm sind immer an; Bern, Kanton BE und Richtlinie schaltet die Option (ausgeschaltete Regeln werden nicht
// ausgewertet). Bern und Kanton BE stehen getrennt im Teil «lokal» des Befunds.

import { KATALOG, quellText, regelDef, type BefundId, type RegelId } from './katalog'
import { REGELN } from './regeln'
import { Kontext, Offen } from './kontext'
import { QUELLEN_ANNAHME, type BedarfEingaben, type Querungstyp } from './eingaben'
import type { Befund, Ebene, Eintrag, Empfehlung, Liste, MassZeile, RegelDef, Zulaessigkeit } from './typen'

export interface Optionen {
  /** schaltbare Ebenen; Vorgabe: Bern aus, Kanton BE aus, Richtlinie an (S9) */
  ebenen?: { bern?: boolean; kantonBE?: boolean; richtlinie?: boolean }
}

const leereListe = (): Liste => ({ verletzungen: [], bericht: [], empfehlungen: [], hinweise: [], offen: [] })
const LOKAL: readonly Ebene[] = ['Bern', 'Kanton BE']

/** Typen, für die die Befunde aus D (Querung mit Vortritt) gelten */
const FGS_ARTIG: readonly (Querungstyp | null)[] = [null, 'fgs', 'lsa']
/** Typen ohne Vortritt (Pfad E prüft sie) */
const OHNE_VORTRITT: readonly Querungstyp[] = ['furt', 'ohne_vortritt']

export function beurteile(e: BedarfEingaben, opt: Optionen = {}): Befund {
  const eb = opt.ebenen ?? {}
  const ebenen: Record<Ebene, boolean> = {
    Recht: true, Norm: true, Bern: eb.bern ?? false, 'Kanton BE': eb.kantonBE ?? false, Richtlinie: eb.richtlinie ?? true,
  }
  const k = new Kontext(e, ebenen)
  const alle: Eintrag[] = []
  const ausgewertet: string[] = []
  const masse = new Map<string, { einheit: string; ist?: string; soll: string[]; verletzt: boolean; offen: boolean; regeln: string[] }>()

  /** Regel auswerten; stumm: nur für die Empfehlung (kein Eintrag, keine Masse) */
  const pruefe = (id: BefundId, stumm = false): void => {
    const def: RegelDef = KATALOG[id]
    if (def.ebene && !ebenen[def.ebene]) return
    ausgewertet.push(id)
    let r: ReturnType<(typeof REGELN)[BefundId]> | 'offen'
    let fehlend: string[] = []
    try {
      r = REGELN[id](k)
    } catch (x) {
      if (!(x instanceof Offen)) throw x
      r = 'offen'
      fehlend = x.felder
    }
    k.ergebnisse.set(id, r)
    if (stumm || r === null) return
    if (def.groesse) {
      const m = masse.get(def.groesse) ?? { einheit: def.einheit ?? '', soll: [], verletzt: false, offen: false, regeln: [] }
      m.regeln.push(id)
      if (r === 'offen') m.offen = true
      else {
        if (m.ist === undefined && r.ist !== undefined) m.ist = r.ist
        if (r.soll !== undefined && !m.soll.includes(r.soll)) m.soll.push(r.soll)
        if (r.verletzt) m.verletzt = true
      }
      masse.set(def.groesse, m)
    }
    if (r !== 'offen' && !r.verletzt) return
    const ein: Eintrag = {
      id, ebene: def.ebene!, staerke: (r !== 'offen' && r.staerke) || def.staerke!, zustand: r === 'offen' ? 'offen' : 'verletzt',
      text: def.ergebnis, quelle: quellText(id),
    }
    if (r !== 'offen') {
      if (r.ist !== undefined) ein.ist = r.ist
      if (r.soll !== undefined) ein.soll = r.soll
      if (r.detail) ein.detail = r.detail
      if (def.einheit && (r.ist !== undefined || r.soll !== undefined)) ein.einheit = def.einheit
    } else ein.fehlend = fehlend
    const nh = (r !== 'offen' && r.normHinweis) || def.normHinweis
    if (nh) ein.normHinweis = nh
    alle.push(ein)
  }
  const reihe = (ids: BefundId[], stumm = false): void => { for (const id of ids) pruefe(id, stumm) }

  const typ = k.o('typ')
  let ende: Befund['ende'] = null
  let zul: Zulaessigkeit | null = null
  const empf: Empfehlung = { typ: 'keiner', elemente: [], zusatz: [], grundlage: [], vorlaeufig: false, offenWegen: [] }
  const nichtGeprueft: Befund['nichtGeprueft'] = []

  // 1. A Rahmen
  pruefe('A1')
  if (k.istOffen('A1')) ende = 'offen'
  else if (k.hat('A1')) ende = 'ausserorts'
  if (!ende) {
    pruefe('A2')
    if (k.hat('A2')) {
      ende = 'begegnungszone'
      Object.assign(empf, { typ: 'flaechig', elemente: ['Begegnungszone: flächiges Queren mit Vortritt'], grundlage: ['A2'] })
    }
  }
  if (!ende) {
    reihe(['A3', 'A4'])
    // 2. B Nachfrage
    pruefe('B1')
    if (k.hat('B1')) {
      ende = 'flaechig'
      Object.assign(empf, { typ: 'flaechig', elemente: ['Begegnungszone', 'Mehrzweckstreifen', 'dichte Querungen ohne Vortritt'], grundlage: ['B1'] })
    }
  }
  if (!ende) {
    reihe(['B3', 'B4', 'G3'])

    // 3. C Zulässigkeit
    // Bei einer beurteilten Trottoirüberfahrt regelt 40 242 Z. 15 Zone und Verkehrsmenge: C und E laufen dann stumm, nur für
    // die Empfehlung einer Alternative (Korrektur N1)
    const tue = typ === 'trottoirueberfahrt'
    reihe(['C1', 'C2', 'C2b', 'C2c', 'C2-B', 'C3', 'C3b', 'C3c', 'C4', 'C4-B'], tue)
    // C3/C4 (weich) verletzt: zulässig nur mit Begründung, Querung ohne Vortritt als Alternative (Korrektur S2)
    zul = k.hat('C1') || k.hat('C2') ? 'nicht_angezeigt'
      : k.istOffen('C1') || k.istOffen('C2') ? 'offen'
        : ['C2b', 'C3', 'C3b', 'C4'].some(id => k.hat(id)) ? 'mit_begruendung' : 'zulaessig'
    if (!tue && zul !== 'nicht_angezeigt' && (k.hat('C3') || k.hat('C4'))) empf.zusatz.push('Querung ohne Vortritt prüfen (C3, C4)')

    // 4. D Querungstyp mit Vortritt
    const mzsFgs = typ === 'mehrzweck' && k.o('mzsMitFgs') === true
    if (zul !== 'nicht_angezeigt') {
      const stumm = !(FGS_ARTIG.includes(typ) || mzsFgs)
      reihe(['D1', 'D1b', 'D2', 'D2a', 'D2c', 'D3a', 'D3b', 'D3c', 'D4a', 'D4b', 'D4c', 'D4d', 'D4-R',
        'D6-1', 'D6-2', 'D6-2b', 'D6-3', 'D6-3b', 'D6-4', 'D6-5'], stumm)
    }

    // 5. E Querungstyp ohne Vortritt
    const pfadE = zul === 'nicht_angezeigt' || (typ !== null && OHNE_VORTRITT.includes(typ)) || (typ === 'mehrzweck' && !mzsFgs)
    if (pfadE) reihe(['E1', 'E1b', 'E2', 'E2a', 'E2d', 'E2e', 'E3', 'E3a'], tue)

    // 6. Prüfung der beurteilten Anlage
    if (typ === null) k.annahmen.add('Querungstyp der Anlage fehlt: nur Empfehlung, keine Prüfung von Streifen, Position und Sicht')
    if (typ === 'fgs' || typ === 'lsa' || mzsFgs) {
      reihe(['F1a', 'F1b', 'F1-K', 'F1c', 'F1d', 'F1e'])
    }
    reihe(['F2', 'F2b', 'F2c', 'F2d', 'F2e', 'F2f', 'F2g', 'F2-B', 'F2-K', 'F3', 'F3-M', 'F3-B', 'F4a', 'F4b', 'F4c', 'E2b', 'E2c'])
    if (typ === 'trottoirueberfahrt') reihe(['F5a', 'F5b'])
    if (typ === 'mehrzweck') reihe(['F6a', 'F6b', 'F6c', 'D7'])
    reihe(['F7a', 'F7b', 'F7c', 'F7d', 'F7e'])
    if (typ === 'fgs') {
      reihe(['G1', 'G2', 'G3b', 'G4', 'G4b', 'G5', 'G5b', 'G6', 'G6-B', 'G7', 'G7b', 'G8a', 'G8b', 'G9', 'G10a', 'G10b'])
      reihe(['H2', 'H1', 'H1b', 'H3a', 'H3b', 'H4'])
    }

    // 7. D5, Q3, I
    reihe(['D5-1', 'D5-2', 'D5-3', 'D5-4', 'D5-5', 'D5-6'])
    empfehlen(k, zul, empf)

    // Q3: Befunde nur für eine beurteilte Trottoirüberfahrt; an einer Einmündung sonst stumm als Option (Korrektur M2)
    if (k.o('lage') === 'einmuendung' || typ === 'trottoirueberfahrt') {
      if (tue) pruefe('Q3-4')
      if (k.o('q3') === null) {
        nichtGeprueft.push({ block: 'Q3', grund: 'Eingaben zur Trottoirüberfahrt (q3) fehlen' })
        empf.zusatz.push('Trottoirüberfahrt nicht geprüft: Eingaben fehlen')
      } else {
        reihe(Q3_IDS, !tue)
        const ids: BefundId[] = tue ? ['Q3-4', ...Q3_IDS] : Q3_IDS
        const hart = ids.filter(id => regelDef(id).staerke === 'hart' && k.hat(id))
        const hartOffen = ids.filter(id => regelDef(id).staerke === 'hart' && k.istOffen(id))
        const weich = ids.filter(id => regelDef(id).staerke === 'weich' && k.hat(id))
        const bern = k.ergebnisse.get('Q3-B')
        const bernText = bern && bern !== 'offen' && bern.ist ? ` (Bern-Tabelle: ${bern.ist})` : ''
        if (hart.length) empf.zusatz.push(`Trottoirüberfahrt hier nicht zulässig wegen ${hart.join(', ')}`)
        else if (hartOffen.length) empf.zusatz.push(`Trottoirüberfahrt: Zulässigkeit offen (${hartOffen.join(', ')})`)
        else {
          const m = weich.length ? `; Merkmale nicht erfüllt: ${weich.join(', ')}` : ''
          if (tue) {
            Object.assign(empf, { typ: 'Q3', elemente: ['Trottoirüberfahrt'] })
            if (m || bernText) empf.zusatz.push(`Trottoirüberfahrt normkonform${bernText}${m}`)
          } else empf.zusatz.push(`Trottoirüberfahrt (Q3) normkonform möglich${bernText}${m}`)
        }
      }
    }
    // I: nur mit LSA-Zeiten (Korrektur S6)
    if (typ === 'lsa' || k.o('fgsMitLsa') === true) {
      if (k.o('lsaZeiten') === null) nichtGeprueft.push({ block: 'I', grund: 'LSA-Zeiten fehlen' })
      else reihe(['I1', 'I2', 'I3a', 'I3b', 'I4', 'I5', 'I6', 'I6-B', 'I7-B1', 'I7-B2', 'I7-B3', 'I7-B4', 'I8'])
    }

    // Vorbehalt: harte Regel offen (Korrektur S2): aus C oder D, bei einer Trottoirüberfahrt aus Q3
    const hartOffen = (id: string): boolean => k.istOffen(id) && ['hart', 'hart_bericht'].includes(KATALOG[id as RegelId].staerke ?? '')
    empf.offenWegen.push(...ausgewertet.filter(id => (tue ? id.startsWith('Q3') : id.startsWith('C') || id.startsWith('D')) && hartOffen(id)))
    empf.vorlaeufig = (!tue && zul === 'offen') || empf.offenWegen.length > 0 || (tue && k.o('q3') === null)
  }

  // Befund zusammenstellen
  const norm = leereListe(), lokal = leereListe()
  for (const x of alle) {
    const l = LOKAL.includes(x.ebene) ? lokal : norm
    if (x.zustand === 'offen') l.offen.push(x)
    else if (x.staerke === 'hart') l.verletzungen.push(x)
    else if (x.staerke === 'hart_bericht') l.bericht.push(x)
    else if (x.staerke === 'weich') l.empfehlungen.push(x)
    else l.hinweise.push(x)
  }
  const massZeilen: MassZeile[] = [...masse].filter(([, m]) => m.ist !== undefined || m.offen).map(([groesse, m]) => ({
    groesse, einheit: m.einheit, soll: m.soll.join('; '), ist: m.ist ?? '–',
    zustand: m.verletzt ? 'verletzt' : m.offen ? 'offen' : 'erfuellt', regeln: m.regeln,
  }))
  const annahmen = [...k.annahmen]
  for (const f of k.genutzt) {
    const q = e[f].quelle
    if (q && QUELLEN_ANNAHME.includes(q)) annahmen.push(`${f}: ${q === 'annahme' ? 'Annahme' : 'Schätzung'}`)
  }
  return {
    beurteilt: ende !== 'ausserorts' && ende !== 'offen', ende, zulaessigkeit: zul, empfehlung: empf,
    norm, lokal, alle, masse: massZeilen, annahmen, ausgewertet, offenGruppen: gruppen(alle), nichtGeprueft,
  }
}

const Q3_IDS: BefundId[] = ['Q3-1', 'Q3-2', 'Q3-3', 'Q3-5', 'Q3-6', 'Q3-7', 'Q3-8', 'Q3-9', 'Q3-10', 'Q3-11', 'Q3-12',
  'Q3-M1', 'Q3-M2', 'Q3-M3', 'Q3-M4', 'Q3-M5', 'Q3-M6', 'Q3-M7', 'Q3-M8', 'Q3-M9', 'Q3-M10', 'Q3-B']

/** offene Einträge nach fehlendem Feld (Korrektur S6) */
function gruppen(alle: Eintrag[]): Befund['offenGruppen'] {
  const m = new Map<string, string[]>()
  for (const x of alle) if (x.zustand === 'offen') for (const f of x.fehlend ?? []) m.set(f, [...(m.get(f) ?? []), x.id])
  return [...m].map(([feld, regeln]) => ({ feld, regeln })).sort((a, b) => b.regeln.length - a.regeln.length)
}

/** Ergebnis D bzw. E: empfohlener Querungstyp mit Elementen (nur Normregeln setzen den Typ) */
function empfehlen(k: Kontext, zul: Zulaessigkeit, empf: Empfehlung): void {
  const gr = (ids: RegelId[]): void => { for (const id of ids) if (k.hat(id) && !empf.grundlage.includes(id)) empf.grundlage.push(id) }
  const sicher = <T>(f: () => T): T | null => { try { return f() } catch (x) { if (x instanceof Offen) return null; throw x } }
  if (zul === 'nicht_angezeigt') {
    gr(['C1', 'C2'])
    const st = k.o('strassentyp')
    if (st === 'verkehrsorientiert') {
      empf.typ = 'furt'
      empf.elemente.push('Fussgängerfurt (Insel ohne Balken)')
      if (k.o('inselMoeglich') === null) empf.offenWegen.push('inselMoeglich')
      gr(['E1'])
      if (k.hat('E1b')) { empf.zusatz.push('LSA bzw. Unter- oder Überführung prüfen'); gr(['E1b']) }
    } else {
      empf.typ = 'ohne_vortritt'
      if (st === 'siedlungsorientiert') gr(['E2'])
      empf.elemente.push(k.o('laengsparkierung') ? 'vorgezogener Seitenraum' : 'vorgezogener Seitenraum, Einengung oder Anhebung')
      const dtv = k.o('dtv')
      if (dtv !== null && dtv < KATALOG.E2e.werte.dtvMax) empf.elemente.push('ohne bauliche Massnahme möglich')
    }
    return
  }
  const insBaulich = sicher(() => k.insBaulich()) === true
  const inselNoetig = k.hat('D1') || k.hat('D2') || k.hat('D3a')
  const lsa = sicher(() => k.mitLsa()) === true || k.hat('D1b') || (k.hat('D3a') && k.o('inselMoeglich') === false)
  empf.typ = lsa ? 'Q2' : 'Q1'
  empf.elemente.push('Fussgängerstreifen')
  if (lsa) empf.elemente.push('Lichtsignalanlage')
  const inselMoeglich = k.o('inselMoeglich') !== false
  if (insBaulich || (inselMoeglich && ((inselNoetig && !lsa) || (lsa && k.hat('D2'))))) {
    empf.elemente.push('Schutzinsel')
    if (!insBaulich && k.o('inselMoeglich') === null) empf.offenWegen.push('inselMoeglich')
  }
  if (k.hat('E2b')) empf.elemente.push('vorgezogener Seitenraum')
  gr(['D1', 'D1b', 'D2', 'D3a', 'E2b'])
}
