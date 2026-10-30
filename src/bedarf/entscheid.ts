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
import { QUELLEN_ANNAHME, type BedarfEingaben, type Querungstyp, type Quelle } from './eingaben'
import type { Befund, Ebene, Eintrag, Empfehlung, Liste, MassZeile, RegelDef, Zulaessigkeit } from './typen'

export interface Optionen {
  /** schaltbare Ebenen; Vorgabe: Bern aus, Kanton BE aus, Richtlinie an (S9) */
  ebenen?: { bern?: boolean; kantonBE?: boolean; richtlinie?: boolean }
  /** Quelle eines Felds bzw. Unterfelds («q3.knotensichtOk») der gebildeten Eingaben (befundblatt: Herkunft); für nurMitBestaetigung
   * bei Unterfeldern, deren Quelle das Objekt nicht trägt */
  quelleVon?: (pfad: string) => Quelle | null
  /** Trottoirüberfahrt (27.10.2026): Alternative Fussgängerstreifen mit Fragen prüfen (Sitzung, nicht im Fall). Ohne läuft die Prüfung
   * des Fussgängerstreifens nur still für die Empfehlung einer Alternative: keine Einträge, keine Fragen, keine Annahmen */
  alternative?: boolean
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
  const erfuellt: string[] = []
  const erfuelltGrund: Record<string, string> = {}
  const ebeneAus: string[] = []
  /** Regel einer ausgeschalteten Ebene: wäre sie mit eingeschalteter Ebene anwendbar? (Schattenrechnung ohne Wirkung auf den Befund;
   * Korrektur S6: nur dann «nicht geprüft (Ebene ausgeschaltet)») */
  const wuerdeGelten = (id: BefundId): boolean => {
    const ks = new Kontext(e, { Recht: true, Norm: true, Bern: true, 'Kanton BE': true, Richtlinie: true })
    for (const [a, b] of k.ergebnisse) ks.ergebnisse.set(a, b)
    try { return REGELN[id](ks) !== null } catch (x) { if (x instanceof Offen) return true; throw x }
  }
  const masse = new Map<string, { einheit: string; ist?: string; soll: string[]; verletzt: boolean; offen: boolean; nichtAnwendbar?: boolean
    ausnahme?: string; annahme?: boolean; regeln: string[] }>()

  const typ = k.o('typ')
  // Trottoirüberfahrt ohne «Alternative Fussgängerstreifen prüfen»: die Teile des Fussgängerstreifens laufen nur still (Alternative)
  const tue = typ === 'trottoirueberfahrt'
  const still = tue && opt.alternative !== true
  /** Regel auswerten; stumm: nur für die Empfehlung (kein Eintrag, keine Masse) */
  const pruefe = (id: BefundId, stumm = false): void => {
    // still (Trottoirüberfahrt ohne Alternative): gelesene Felder und Annahmen stummer Regeln gelten nicht als Annahmen des Falls
    if (stumm && still) {
      const g0 = new Set(k.genutzt), a0 = new Set(k.annahmen)
      pruefe0(id, true)
      for (const f of [...k.genutzt]) if (!g0.has(f)) k.genutzt.delete(f)
      for (const x of [...k.annahmen]) if (!a0.has(x)) k.annahmen.delete(x)
      return
    }
    pruefe0(id, stumm)
  }
  const pruefe0 = (id: BefundId, stumm: boolean): void => {
    const def: RegelDef = KATALOG[id]
    if (def.ebene && !ebenen[def.ebene]) { if (!stumm && wuerdeGelten(id)) ebeneAus.push(id); return }
    ausgewertet.push(id)
    let r: ReturnType<(typeof REGELN)[BefundId]> | 'offen'
    let fehlend: string[] = []
    try {
      r = REGELN[id](k)
    } catch (x) {
      if (!(x instanceof Offen)) throw x
      r = 'offen'
      fehlend = x.felder
      k.offenFelder.set(id, fehlend)
    }
    // Korrektur M2: ein hartes Verbot, das nur mit Tatsachen gilt, beruht hier auf einer Annahme bzw. Schätzung → offen, bis sie
    // bestätigt ist («Vorschlag bestätigen» macht den Wert zur Handeingabe mit Quelle «bestätigt»)
    let bestaetigen = false
    // Trottoirüberfahrt (27.10.2026): heutiger Zustand nach OSM als «Vorschlag» gilt für die Planung erst bestätigt; die dazu neu
    // bestätigungspflichtigen Regeln wirken nur bei einer beurteilten Trottoirüberfahrt (an der Einmündung sonst wie bisher)
    const unbest = (q: Quelle) => QUELLEN_ANNAHME.includes(q) || (q === 'vorschlag' && def.gruppe === 'Q3')
    const nmb = def.nurMitBestaetigung && (tue || !NUR_TUE_BESTAETIGUNG.includes(id))
    if (nmb && r !== 'offen' && r !== null && r.verletzt) {
      const unbestaetigt = (def.nurMitBestaetigung === true ? def.eingaben : def.nurMitBestaetigung!).filter(f => {
        if (f.includes('.')) {
          const [o, u] = f.split('.'), q = opt.quelleVon?.(f) ?? null
          const w = (e[o as keyof BedarfEingaben]?.wert as Record<string, unknown> | null | undefined)?.[u]
          return w !== null && w !== undefined && q !== null && unbest(q)
        }
        const x = e[f as keyof BedarfEingaben]
        return x && x.wert !== null && x.quelle !== null && unbest(x.quelle)
      })
      if (unbestaetigt.length) {
        r = 'offen'
        fehlend = unbestaetigt
        bestaetigen = true
        k.offenFelder.set(id, fehlend)
      }
    }
    k.ergebnisse.set(id, r)
    if (stumm || r === null) return
    if (r !== 'offen' && !r.verletzt) { erfuellt.push(id); if (r.grund) erfuelltGrund[id] = r.grund }
    if (def.groesse) {
      const m = masse.get(def.groesse) ?? { einheit: def.einheit ?? '', soll: [], verletzt: false, offen: false, regeln: [] }
      m.regeln.push(id)
      if (r === 'offen') m.offen = true
      else {
        if (m.ist === undefined && r.ist !== undefined) m.ist = r.ist
        if (r.soll !== undefined && !m.soll.includes(r.soll)) m.soll.push(r.soll)
        if (r.verletzt && !r.ohneMassBefund) m.verletzt = true
        if (r.ohneMassBefund) m.nichtAnwendbar = true
        if (r.ausnahme && !r.verletzt) m.ausnahme = r.ausnahme
        if (r.annahme) m.annahme = true
      }
      masse.set(def.groesse, m)
    }
    if (r !== 'offen' && !r.verletzt) return
    const ein: Eintrag = {
      id, ebene: def.ebene!, staerke: (r !== 'offen' && r.staerke) || def.staerke!, zustand: r === 'offen' ? 'offen' : 'verletzt',
      text: (r !== 'offen' && r.text) || def.ergebnis, quelle: quellText(id),
    }
    if (r !== 'offen') {
      if (r.ist !== undefined) ein.ist = r.ist
      if (r.soll !== undefined) ein.soll = r.soll
      if (r.detail) ein.detail = r.detail
      if (def.einheit && (r.ist !== undefined || r.soll !== undefined)) ein.einheit = def.einheit
    } else {
      ein.fehlend = fehlend
      if (bestaetigen) {
        ein.bestaetigen = true
        ein.detail = 'beruht auf einer Annahme der Vorbelegung: Vorschlag bestätigen bzw. von Hand ändern'
      }
    }
    const nh = (r !== 'offen' && r.normHinweis) || def.normHinweis
    if (nh) ein.normHinweis = nh
    alle.push(ein)
  }
  const reihe = (ids: BefundId[], stumm = false): void => { for (const id of ids) pruefe(id, stumm) }

  let ende: Befund['ende'] = null
  let zul: Zulaessigkeit | null = null
  const empf: Empfehlung = { typ: 'keiner', elemente: [], zusatz: [], grundlage: [], vorlaeufig: false, offenWegen: [] }
  const nichtGeprueft: Befund['nichtGeprueft'] = []

  // 1. A Rahmen
  pruefe('A1')
  if (k.istOffen('A1')) ende = 'offen'
  else if (k.hat('A1')) ende = 'ausserorts'
  // Trottoirüberfahrt (27.10.2026): Begegnungszone und verteiltes Queren betreffen nur die Alternative; sie beenden den Ablauf nicht
  let altEnde = false
  if (!ende) {
    pruefe('A2', still)
    if (k.hat('A2')) {
      if (tue) altEnde = true; else ende = 'begegnungszone'
      // Trottoirüberfahrt: nur die Alternative ist flächig; keine Grundlage (die Begründung stützt sich auf Q3 und F5)
      Object.assign(empf, { typ: 'flaechig', elemente: ['Begegnungszone: flächiges Queren mit Vortritt'], grundlage: tue ? [] : ['A2'] })
    }
  }
  if (!ende && !altEnde) {
    reihe(['A3', 'A4'], still)
    // 2. B Nachfrage
    pruefe('B1', still)
    if (k.hat('B1')) {
      if (tue) altEnde = true; else ende = 'flaechig'
      Object.assign(empf, { typ: 'flaechig', elemente: ['Begegnungszone', 'Mehrzweckstreifen', 'dichte Querungen ohne Vortritt'], grundlage: tue ? [] : ['B1'] })
    }
  }
  if (!ende) {
    pruefe('B3')
    reihe(['B4', 'G3'], still)

    // 3. C Zulässigkeit
    // Bei einer beurteilten Trottoirüberfahrt regelt 40 242 Z. 15 Zone und Verkehrsmenge: C und E laufen dann stumm, nur für
    // die Empfehlung einer Alternative (Korrektur N1); mit «Alternative Fussgängerstreifen prüfen» sichtbar (27.10.2026)
    const mzsFgs = typ === 'mehrzweck' && k.o('mzsMitFgs') === true
    if (!altEnde) {
      reihe(['C1', 'C2', 'C2b', 'C2-B', 'C3', 'C3b', 'C3c', 'C4', 'C4-B'], still)
      // C3/C4 (weich) verletzt: zulässig nur mit Begründung, Querung ohne Vortritt als Alternative (Korrektur S2)
      zul = k.hat('C1') || k.hat('C2') ? 'nicht_angezeigt'
        : k.istOffen('C1') || k.istOffen('C2') || k.istOffen('A2') ? 'offen'
          : ['C2b', 'C3', 'C3b', 'C4'].some(id => k.hat(id)) ? 'mit_begruendung' : 'zulaessig'
      // Runde 5 (F8): nur die verletzten Regeln als Grund
      if (!tue && zul !== 'nicht_angezeigt' && (k.hat('C3') || k.hat('C4')))
        empf.zusatz.push(`Querung ohne Vortritt prüfen (${['C3', 'C4'].filter(id => k.hat(id)).join(', ')})`)

      // 4. D Querungstyp mit Vortritt
      if (zul !== 'nicht_angezeigt') {
        const stumm = !(FGS_ARTIG.includes(typ) || mzsFgs || (tue && !still))
        reihe(['D1', 'D1b', 'D2', 'D2a', 'D3a', 'D2c', 'D3b', 'D4a', 'D4b', 'D4c', 'D4d', 'D4-R',
          'D6-1', 'D6-2', 'D6-2b', 'D6-3', 'D6-3b', 'D6-4', 'D6-5'], stumm)
      }

      // 5. E Querungstyp ohne Vortritt
      const pfadE = zul === 'nicht_angezeigt' || (typ !== null && OHNE_VORTRITT.includes(typ)) || (typ === 'mehrzweck' && !mzsFgs)
      if (pfadE) reihe(['E1', 'E1b', 'E1c', 'E2', 'E2a', 'E2d', 'E2e', 'E3', 'E3a'], still)
    }

    // 6. Prüfung der beurteilten Anlage
    if (typ === null) k.annahmen.add('Querungstyp der Anlage fehlt: nur Empfehlung, keine Prüfung von Streifen, Position und Sicht')
    if (typ === 'fgs' || typ === 'lsa' || mzsFgs) {
      // Richtlinie Hindernisfreie Architektur (30.10.2026): Ausrichtung, gerade Trottoirkante, Abstand zum Kreisel; wie die Streifenmasse
      // nur beim Fussgängerstreifen (auch mit Lichtsignal bzw. über dem Mehrzweckstreifen)
      reihe(['F1a', 'F1b', 'F1-K', 'F1c', 'F1d', 'F1e', 'F1d-R', 'G11', 'G12'])
    }
    // Insel, Einengung, vorgezogener Seitenraum (F2 bis F4, E2b, E2c) und Randstein, Absenkung, Tastlinien (F7) gehören zur Querung
    // auf der Fahrbahn, nicht zur Trottoirüberfahrt (27.10.2026); deren Ausstattung prüft F5
    if (!tue) reihe(['F2', 'F2b', 'F2c', 'F2d', 'F2e', 'F2f', 'F2g', 'F2-B', 'F2-K', 'F3', 'F3-M', 'F3-B', 'F4a', 'F4b', 'F4c', 'E2b', 'E2c'])
    if (tue) reihe(['F5a', 'F5c', 'F5d', 'F5e', 'F5f', 'F5g', 'F5h', 'F5i', 'F5j', 'F5k', 'F5b', 'F5l', 'F5m', 'F5n'])
    if (typ === 'mehrzweck') reihe(['F6a', 'F6b', 'F6c', 'D7'])
    if (!tue) reihe(['F7a', 'F7b', 'F7c', 'F7d', 'F7e'])
    if (typ === 'fgs') {
      reihe(['G1', 'G2', 'G3b', 'G4', 'G4b', 'G5', 'G5b', 'G6', 'G6-B', 'G7', 'G7b', 'G8a', 'G8b', 'G9', 'G10a', 'G10b'])
      reihe(['H2', 'H1', 'H1b', 'H3a', 'H3b', 'H4'])
    }

    // 7. D5, Q3, I
    reihe(['D5-1', 'D5-2', 'D5-3', 'D5-4', 'D5-5', 'D5-6'], still)
    if (!altEnde) empfehlen(k, zul!, empf)

    // Q3: Befunde nur für eine beurteilte Trottoirüberfahrt; an einer Einmündung sonst stumm als Option (Korrektur M2)
    if (k.o('lage') === 'einmuendung' || typ === 'trottoirueberfahrt') {
      if (tue) pruefe('Q3-4')
      if (k.o('q3') === null) {
        nichtGeprueft.push({ block: 'Q3', grund: 'Eingaben zur Trottoirüberfahrt (q3) fehlen' })
        empf.zusatz.push('Trottoirüberfahrt nicht geprüft: Eingaben fehlen')
      } else {
        reihe(tue ? Q3_IDS_TUE : Q3_IDS, !tue)
        // Trottoirrand zurückgesetzt (F5c): ebenfalls keine Trottoirüberfahrt (27.10.2026)
        const ids: BefundId[] = tue ? ['Q3-4', ...Q3_IDS, 'F5c'] : Q3_IDS
        const hart = ids.filter(id => regelDef(id).staerke === 'hart' && k.hat(id))
        const hartOffen = ids.filter(id => regelDef(id).staerke === 'hart' && k.istOffen(id))
        // beurteilte Trottoirüberfahrt (28.10.2026): auch die Soll-Regeln der Machbarkeit (Breite, Länge des überfahrbaren Rands)
        const weich = [...ids, ...(tue ? ['F5a', 'F5d'] as BefundId[] : [])].filter(id => regelDef(id).staerke === 'weich' && k.hat(id))
        const bern = k.ergebnisse.get('Q3-B')
        const bernText = bern && bern !== 'offen' && bern.ist ? ` (Bern-Tabelle: ${bern.ist})` : ''
        if (hart.length) empf.zusatz.push(`Trottoirüberfahrt hier nicht zulässig wegen ${hart.join(', ')}`)
        else if (hartOffen.length) empf.zusatz.push(`Trottoirüberfahrt: Zulässigkeit offen (${hartOffen.join(', ')})`)
        else {
          const m = weich.length ? `; Merkmale nicht erfüllt: ${weich.join(', ')}` : ''
          if (tue) {
            Object.assign(empf, { typ: 'Q3', elemente: ['Trottoirüberfahrt'], grundlage: [] })
            if (m || bernText) empf.zusatz.push(`Trottoirüberfahrt normkonform${bernText}${m}`)
          } else empf.zusatz.push(`Trottoirüberfahrt (Q3) normkonform möglich${bernText}${m}`)
        }
      }
    }
    // Trottoirüberfahrt ohne geprüfte Alternative: Zusätze der still geprüften Alternative (z. B. E1b) entfallen (27.10.2026)
    if (still) empf.zusatz = empf.zusatz.filter(z => z.startsWith('Trottoirüberfahrt'))
    // I: nur mit LSA-Zeiten (Korrektur S6). Ausgelöst nur durch eine Zeit (Gelb, Grün bzw. Wartezeit), nicht durch die aus der
    // Vorbelegung kopierten Längen (L, Teilquerungen, Inseltiefe; Nutzerentscheid 21.10.2026)
    if (!still && (typ === 'lsa' || k.o('fgsMitLsa') === true)) {
      const z = k.o('lsaZeiten')
      if (z === null || (z.gelb == null && z.freigabe == null && z.wartezeit == null)) nichtGeprueft.push({ block: 'I', grund: 'LSA-Zeiten fehlen' })
      else reihe(['I1', 'I2', 'I3a', 'I3b', 'I4', 'I5', 'I6', 'I6-B', 'I7-B1', 'I7-B2', 'I7-B3', 'I7-B4', 'I8'])
    }

    // Runde 4 (Kann): Begegnungszone offen (A2 offen, z. B. nur angenommen): keine Empfehlung eines Typs, bis die Zone geklärt ist
    // (in der Begegnungszone gilt flächiges Queren, sonst ein Typ nach C bis E); Trottoirüberfahrt unverändert
    if (!tue && k.istOffen('A2')) Object.assign(empf, { typ: 'keiner', elemente: [], grundlage: [] })

    // Vorbehalt: harte Regel offen (Korrektur S2): aus C oder D, bei einer Trottoirüberfahrt aus Q3
    const hartOffen = (id: string): boolean => k.istOffen(id) && ['hart', 'hart_bericht'].includes(KATALOG[id as RegelId].staerke ?? '')
    empf.offenWegen.push(...ausgewertet.filter(id => (tue ? id.startsWith('Q3') || id === 'F5c' : id.startsWith('C') || id.startsWith('D')) && hartOffen(id)))
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
    zustand: m.verletzt ? 'verletzt' : m.offen ? 'offen' : m.nichtAnwendbar && !m.soll.length ? 'nicht_anwendbar' : m.ausnahme ? 'ausnahme'
      : m.annahme ? 'annahme' : 'erfuellt', regeln: m.regeln, ...(m.ausnahme && !m.verletzt && !m.offen ? { zusatz: m.ausnahme } : {}),
  }))
  const annahmen = [...k.annahmen]
  for (const f of k.genutzt) {
    const q = e[f].quelle
    if (q && QUELLEN_ANNAHME.includes(q)) annahmen.push(`${f}: ${q === 'annahme' ? 'Annahme' : 'Schätzung'}`)
  }
  return {
    beurteilt: ende !== 'ausserorts' && ende !== 'offen', ende, zulaessigkeit: zul, empfehlung: empf,
    norm, lokal, alle, masse: massZeilen, annahmen, ausgewertet, erfuellt, erfuelltGrund, ebeneAus, offenFelder: Object.fromEntries(k.offenFelder), offenGruppen: gruppen(alle), nichtGeprueft,
  }
}

/** Regeln, die erst an einer beurteilten Trottoirüberfahrt eine Bestätigung verlangen (heutiger Zustand ≠ Planung; 27.10.2026) */
const NUR_TUE_BESTAETIGUNG: readonly string[] = ['Q3-7', 'Q3-8', 'Q3-M2', 'Q3-M7']
const Q3_IDS: BefundId[] = ['Q3-1', 'Q3-2', 'Q3-3', 'Q3-5', 'Q3-6', 'Q3-7', 'Q3-8', 'Q3-9', 'Q3-10', 'Q3-11', 'Q3-12',
  'Q3-M1', 'Q3-M2', 'Q3-M3', 'Q3-M4', 'Q3-M5', 'Q3-M6', 'Q3-M7', 'Q3-M8', 'Q3-M9', 'Q3-M10', 'Q3-B']
/** beurteilte Trottoirüberfahrt: Reihenfolge der Prüfliste (VSS 40 242 Tab. 1 und 2, dann Bern); an der Einmündung sonst Q3_IDS */
const Q3_IDS_TUE: BefundId[] = ['Q3-1', 'Q3-2', 'Q3-3', 'Q3-5', 'Q3-6', 'Q3-7', 'Q3-8', 'Q3-9', 'Q3-10', 'Q3-11', 'Q3-12',
  'Q3-M1', 'Q3-M2', 'Q3-M9', 'Q3-M3', 'Q3-M4', 'Q3-M5', 'Q3-M6', 'Q3-M10', 'Q3-M7', 'Q3-M8', 'Q3-B']

/** offene Einträge nach fehlendem Feld (Korrektur S6) */
function gruppen(alle: Eintrag[]): Befund['offenGruppen'] {
  const m = new Map<string, string[]>()
  for (const x of alle) if (x.zustand === 'offen') for (const f of x.fehlend ?? []) if (!(m.get(f) ?? []).includes(x.id)) m.set(f, [...(m.get(f) ?? []), x.id])
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
  const lsaHeute = sicher(() => k.mitLsa()) === true
  const lsa = lsaHeute || k.hat('D1b') || (k.hat('D3a') && k.o('inselMoeglich') === false)
  empf.typ = lsa ? 'Q2' : 'Q1'
  empf.elemente.push('Fussgängerstreifen')
  if (lsa) {
    empf.elemente.push('Lichtsignalanlage')
    // Grund nennen (30.10.2026): eine LSA, die heute da ist, ist keine Empfehlung einer Regel
    const q = k.o('typ') === 'lsa' ? k.e.typ.quelle : k.e.fgsMitLsa.quelle
    empf.lsaWeil = !lsaHeute ? (k.hat('D1b') ? 'D1b' : 'D3a') : q === 'annahme' ? 'annahme' : q === 'hand' || q === 'bestaetigt' ? 'hand' : 'heute'
  }
  const inselMoeglich = k.o('inselMoeglich') !== false
  if (insBaulich || (inselMoeglich && ((inselNoetig && !lsa) || (lsa && k.hat('D2'))))) {
    empf.elemente.push('Schutzinsel')
    if (!insBaulich && k.o('inselMoeglich') === null) empf.offenWegen.push('inselMoeglich')
  }
  if (k.hat('E2b')) empf.elemente.push('vorgezogener Seitenraum')
  gr(['D1', 'D1b', 'D2', 'D3a', 'E2b'])
}
