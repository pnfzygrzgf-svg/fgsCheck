// Tests Runde 3: Zusammenfassung in drei Sätzen je Querung (Vorlagen aus Befund, Grundprüfung und Fragen).
// Über alle Testfälle mal Typvarianten mal zwei Ebenenstände und an synthetischen Befundblättern (Rechnung wie befundblatt.test.ts):
// Länge (höchstens vier Sätze, 60 Wörter), keine leeren Werte, keine nackte Regelnummer, Fragen mit Fragezeichen, Konsistenz mit dem
// Befund (Muss genannt, vorläufig, nicht zulässig mit Grund, ohne offene Angabe kein Satz 3, Typen ohne Grundprüfung).
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmWeg } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import { rechneFall } from '../rechner/index'
import { leererFall, type Fall } from '../fall'
import { KATALOG, REGEL_IDS } from './katalog'
import { beurteile } from './entscheid'
import { grundpruefung } from './grundpruefung'
import { befundblaetter } from './befundblatt'
import type { BedarfBlock } from './fallBedarf'
import { fragenFelder, grundKopf, vorbehaltFelder } from './kompakt'
import { feldZiel, frageVon } from './feldhilfen'
import { istWeiche } from './themen'
import { nummernOhneTitel } from './regelname'
import { fall, TESTFAELLE, type Abw } from './testfaelle'
import type { RegelDef } from './typen'
import { MAX_WOERTER, kurzform, woerter, zusammenfassung, zusammenfassungBlatt, zusammenfassungText, type ZfEingabe, type Zusammenfassung } from './zusammenfassung'

const DEF = KATALOG as Readonly<Record<string, RegelDef>>
/** gleichwertige Regeln im Baum je Punkt der Grundprüfung (wie zusammenfassung.ts) */
const GLEICH_TEST: Readonly<Record<string, readonly string[]>> = {
  'B5-T': ['C1'], 'B5-1': ['H1', 'E3'], 'B5-1b': ['H3a', 'H3b'], 'B5-2a': ['D1', 'D2', 'D2a', 'D2c', 'D3a'], 'B5-2b': ['F2', 'F2b'],
  'B5-2c': ['F3'], 'B5-3': ['D1'], 'B5-4': ['G8a'], 'B5-5': ['C3', 'C3b'], 'B5-W3': ['D4b'],
}
const TYPEN = [undefined, 'fgs', 'lsa', 'furt', 'ohne_vortritt', 'trottoirueberfahrt', 'mehrzweck', null] as const
const MUSS = ['hart', 'hart_bericht']

/** Eingabe wie im Befundblatt, aber ohne Rechnung (offene Angaben = alle offenen Felder des Befunds) */
function eingabe(abw: Abw, eb: { bern?: boolean; kantonBE?: boolean } = {}): ZfEingabe {
  const e = fall(abw)
  return { befund: beurteile(e, { ebenen: eb }), grund: grundpruefung(e),
    kontext: { ebenen: { bern: false, kantonBE: false, richtlinie: true, ...eb }, typ: e.typ.wert } }
}
const zf = (abw: Abw, eb: { bern?: boolean; kantonBE?: boolean } = {}) => zusammenfassung(eingabe(abw, eb))
const text = (z: Zusammenfassung) => zusammenfassungText(z)
/** Sätze: Satzende vor Grossbuchstaben bzw. am Ende («Pers. in» ist kein Satzende); die Fragen in Satz 3 zählen als ein Satz */
const saetze = (t: string): number => (t.match(/[.?!](?=\s+[A-ZÄÖÜ]|$)/g) ?? []).length

/** Prüft die Regeln der Zusammenfassung; gibt Fehlertexte zurück */
function pruefe(name: string, x: ZfEingabe, z: Zusammenfassung): string[] {
  const f: string[] = []
  const t = text(z)
  const b = x.befund
  if (woerter(t) > MAX_WOERTER) f.push(`${name}: ${woerter(t)} Wörter`)
  if (saetze(z.antwort) !== 1) f.push(`${name}: Satz 1 hat ${saetze(z.antwort)} Sätze`)
  if (saetze(z.antwort) + saetze(z.wichtig) + (z.fehlt ? 1 : 0) > 4) f.push(`${name}: mehr als 4 Sätze`)
  if (/undefined|null|NaN|\{|\}/.test(t)) f.push(`${name}: leerer Wert in «${t}»`)
  if (/\(\s*\)|\s[,;.]|,,|\.\./.test(t)) f.push(`${name}: Satzzeichen in «${t}»`)
  if (/zebra/i.test(t)) f.push(`${name}: Zebra`)
  for (const n of nummernOhneTitel(t)) f.push(`${name}: Nummer ${n}`)
  for (const q of z.fehlt?.felder ?? []) if (!frageVon(q).endsWith('?')) f.push(`${name}: keine Frage ${q}`)
  // Muss-Befund des Baums: Grund in Satz 1 oder in Satz 2 genannt bzw. unter «weitere Befunde»
  const muss = [...new Set(b.alle.filter(e => e.zustand === 'verletzt' && MUSS.includes(e.staerke) && !istWeiche(e.id)).map(e => e.id))]
  for (const id of muss) {
    if (z.grundIds.includes(id) || z.genannt.includes(id)) continue
    if (!z.befunde.includes(id) || z.weitereBefunde === 0 || !/weitere(r)? Befund|\d+ Befunde?\b/.test(z.wichtig)) f.push(`${name}: Muss ${id} fehlt in Satz 2`)
  }
  // Korrektur M1: ein Soll- bzw. Muss-Punkt der Grundprüfung fehlt nur, wenn eine gleichwertige Regel im Baum selbst einen Befund meldet
  const gemeldet = new Set(b.alle.filter(e => e.zustand === 'verletzt' && (e.staerke !== 'hinweis' || z.grundIds.includes(e.id))).map(e => e.id))
  if (x.grund.gilt && b.ende === null) for (const t of [...x.grund.punkte.flatMap(p => p.teile), ...x.grund.weitere])
    if (t.zustand === 'verletzt' && t.staerke !== 'hinweis' && !(GLEICH_TEST[t.id] ?? []).some(id => gemeldet.has(id)) && !z.befunde.includes(t.id))
      f.push(`${name}: Punkt ${t.id} der Grundprüfung fehlt in Satz 2`)
  if (/nicht erfüllt/.test(z.wichtig) && /Keine Befunde|ohne Befund|Bisher keine/.test(z.wichtig)) f.push(`${name}: «nicht erfüllt» neben «ohne Befund»`)
  // Muss und Soll getrennt: «Zu beheben» nur mit Muss, «zu verbessern» nur mit Soll
  const mussIds = z.befunde.filter(id => MUSS.includes(b.alle.find(e => e.id === id && e.zustand === 'verletzt')?.staerke ??
    [...x.grund.punkte.flatMap(p => p.teile), ...x.grund.weitere].find(t => t.id === id)?.staerke ?? ''))
  if (/Zu beheben/.test(z.wichtig) !== mussIds.length > 0) f.push(`${name}: «Zu beheben» passt nicht`)
  if (/[Zz]u verbessern/.test(z.wichtig) !== z.befunde.length > mussIds.length) f.push(`${name}: «zu verbessern» passt nicht`)
  // Muss vor Soll
  const st = z.befunde.map(id => MUSS.includes(b.alle.find(e => e.id === id && e.zustand === 'verletzt')?.staerke ?? '') ||
    (id.startsWith('B5') && DEF[id].staerke === 'hart' && x.grund.punkte.flatMap(p => p.teile).concat(x.grund.weitere).find(tt => tt.id === id)?.staerke !== 'weich'))
  if (st.some((m, i) => m && st.slice(0, i).some(v => !v))) f.push(`${name}: Soll vor Muss`)
  // vorläufig: Satz 1 sagt es, Satz 3 nennt die Angaben
  if (b.empfehlung.vorlaeufig && (!/[Vv]orläufig/.test(z.antwort) || !z.fehlt)) f.push(`${name}: vorläufig ohne Vermerk bzw. Satz 3`)
  if (b.zulaessigkeit === 'offen' && !z.antwort.startsWith('Vorläufig')) f.push(`${name}: Zulässigkeit offen`)
  // nicht zulässig: mit Grund
  if (b.zulaessigkeit === 'nicht_angezeigt' && !b.ausgewertet.includes('Q3-4') && !/nicht zulässig: .+; (vorläufig )?empfohlen wird /.test(z.antwort))
    f.push(`${name}: nicht zulässig ohne Grund: ${z.antwort}`)
  if (b.zulaessigkeit === 'mit_begruendung' && !b.ausgewertet.includes('Q3-4') && !/nur mit Begründung zulässig: /.test(z.antwort))
    f.push(`${name}: mit Begründung ohne Grund: ${z.antwort}`)
  // Satz 3 genau dann, wenn eine Angabe fehlt; nur Felder, die wirklich offen sind
  const offen = new Set(fragenFelder([
    ...(x.offen ? x.offen.map(o => o.feld) : b.offenGruppen.map(o => o.feld)), ...b.alle.flatMap(e => (e.zustand === 'offen' && MUSS.includes(e.staerke) ? e.fehlend ?? [] : [])),
    ...(b.empfehlung.vorlaeufig || b.zulaessigkeit === 'offen' ? vorbehaltFelder(b) : []), ...(b.ende === 'offen' ? b.offenFelder.A1 ?? [] : []),
    ...(x.grund.gilt ? [...grundKopf(x.grund).zeilen.flatMap(r => r.fragen), ...(grundKopf(x.grund).weitere?.fragen ?? []),
      ...x.grund.punkte.flatMap(p => p.teile).filter(tt => tt.zustand === 'offen' && DEF[tt.id].staerke === 'hart').flatMap(tt => tt.fehlend ?? []),
      // Sicht am Knoten offen ohne fehlendes Feld: Frage zur Kurve
      ...x.grund.punkte.flatMap(p => p.teile).filter(tt => tt.zustand === 'offen' && !tt.fehlend?.length && tt.detail?.includes('Kurvenradius')).map(() => 'kurve.radius')] : []),
  ]).filter(q => q !== 'Zufahrten'))
  if (!offen.size && z.fehlt) f.push(`${name}: Satz 3 ohne offene Angabe`)
  if (offen.size && !z.fehlt) f.push(`${name}: offene Angabe ohne Satz 3`)
  for (const q of z.fehlt?.felder ?? []) if (!offen.has(q)) f.push(`${name}: Frage zu ${q} ist nicht offen`)
  if (z.fehlt && z.fehlt.felder.length + z.fehlt.weitere !== (z.fehlt.felder.length ? offen.size : z.fehlt.weitere)) f.push(`${name}: Zahl der Angaben`)
  // Typen ohne Grundprüfung: kein Satz zur Grundprüfung
  if ((!x.grund.gilt || b.ende !== null) && z.wichtig.includes('Grundprüfung')) f.push(`${name}: Grundprüfung bei Typ ohne Grundprüfung bzw. Ende des Baums`)
  if (x.grund.gilt && b.ende === null && !z.wichtig.startsWith('Grundprüfung bfu')) f.push(`${name}: Grundprüfung fehlt`)
  // beurteilte Anlage ohne Vortritt bzw. Mehrzweckstreifen: Satz 1 nennt sie
  const typ = x.kontext?.typ
  if (b.ende === null && (typ === 'furt' || typ === 'ohne_vortritt' || typ === 'mehrzweck') && !z.antwort.includes('beurteilt wird')) f.push(`${name}: beurteilte Anlage fehlt`)
  // Trottoirüberfahrt nicht zulässig: Alternative nur, wenn der Fussgängerstreifen zulässig ist
  if (b.ausgewertet.includes('Q3-4') && /stattdessen passt ein Fussgängerstreifen/.test(z.antwort) && b.zulaessigkeit !== 'zulaessig') f.push(`${name}: Alternative trotz ${b.zulaessigkeit}`)
  return f
}

describe('Zusammenfassung über alle Testfälle', () => {
  it('Testfälle × Typvarianten × Ebenen: Länge, Werte, Nummern, Fragen und Konsistenz mit dem Befund', () => {
    const fehler: string[] = []
    let n = 0, mitFragen = 0, mitBefund = 0, kurz = 0
    for (const t of TESTFAELLE) for (const typ of TYPEN) for (const eb of [t.ebenen ?? {}, { bern: true, kantonBE: true }]) {
      const abw: Abw = typ === undefined ? t.abw : { ...t.abw, typ }
      const x = eingabe(abw, eb)
      const z = zusammenfassung(x)
      n++
      if (z.fehlt) mitFragen++
      if (z.genannt.length) mitBefund++
      if (z.fehlt && z.fehlt.felder.length < Math.min(2, z.fehlt.felder.length + z.fehlt.weitere)) kurz++
      fehler.push(...pruefe(`${t.regel} ${t.name} ${String(typ)} ${JSON.stringify(eb)}`, x, z))
    }
    expect(n).toBeGreaterThan(3000)
    expect(mitFragen).toBeGreaterThan(50)
    expect(mitBefund).toBeGreaterThan(1000)
    expect(kurz).toBe(0)
    expect(fehler.slice(0, 20)).toEqual([])
  })
  it('Typen ohne Grundprüfung (Lichtsignal, Furt, ohne Vortritt, Mehrzweckstreifen): Satz 2 ohne Grundprüfung; Trottoirüberfahrt eigene Antwort', () => {
    for (const typ of ['lsa', 'furt', 'ohne_vortritt', 'mehrzweck'] as const) expect(zf({ typ }).wichtig, typ).not.toContain('Grundprüfung')
    expect(zf({ fgsMitLsa: true }).wichtig).not.toContain('Grundprüfung')
    expect(zf({ typ: 'trottoirueberfahrt', lage: 'einmuendung' }).antwort).toBe('Eine Trottoirüberfahrt ist hier zulässig.')
    const tue = zf({ typ: 'trottoirueberfahrt' })
    expect(tue.antwort).toMatch(/^Eine Trottoirüberfahrt ist hier nicht zulässig: Trottoirüberfahrt nicht an einer Einmündung; stattdessen passt ein Fussgängerstreifen/)
    expect(tue.grundIds).toContain('Q3-4')
    expect(zf({ typ: 'trottoirueberfahrt', lage: 'einmuendung', q3: null }).antwort).toBe('Vorläufig: Ob eine Trottoirüberfahrt hier zulässig ist, hängt von fehlenden Angaben ab.')
  })
})

describe('Vorlagen', () => {
  it('Grundfall vollständig: zulässig, Grundprüfung, keine Befunde, kein Satz 3', () => {
    const z = zf({})
    expect(z.antwort).toBe('Ein Fussgängerstreifen ist hier zulässig.')
    expect(z.wichtig).toBe('Grundprüfung bfu: 4 von 5 Punkten erfüllt, Fussgängerschutzinsel mit Hinweis. Übrige Prüfungen ohne Befund (1 Hinweis).')
    expect(zf({ typ: 'lsa', fgsMitLsa: true }).wichtig).toBe('Keine Befunde: 27 von 28 Prüfungen ohne Befund, 1 Hinweis.')
    expect(z.fehlt).toBeNull()
  })
  it('Grundfall mit offenen Feldern: Fragen, Muss zuerst, höchstens zwei ausgeschrieben, Rest als Zahl', () => {
    const z = zf({ fahrbahnB: 9, dtv: null, beleuchtung: null, fg5h: null, fgKlasse: null })
    expect(z.antwort).toBe('Ein Fussgängerstreifen ist hier zulässig; vorläufig: ob eine Schutzinsel nötig ist, hängt noch von fehlenden Angaben ab.')
    expect(z.fehlt!.felder.length).toBe(2)
    expect(z.fehlt!.einleitung).toMatch(/^\d+ Angaben fehlen noch, zuerst:$/)
    expect(z.fehlt!.weitere).toBeGreaterThan(0)
    // die Empfehlung hängt an DTV (Insel bei breiter Fahrbahn) bzw. die Zulässigkeit an den Querenden: zuerst
    expect(z.fehlt!.felder[0]).toBe('dtv')
    expect(text(z)).toContain('Ist die Querung nachts beleuchtet?')
    expect(feldZiel(z.fehlt!.felder[0])).toBe('dtv')
  })
  it('Tempo-30-Zone ohne Grund: nicht zulässig mit Grund und Empfehlung', () => {
    const z = zf({ tempoRegime: 't30_zone', vSig: 30 })
    expect(z.antwort).toBe('Ein Fussgängerstreifen ist hier nicht zulässig: Tempo-30-Zone ohne besonderen Grund für Vortritt; empfohlen wird ' +
      'eine Fussgängerfurt (Insel ohne Balken), weil es eine Durchgangsstrasse ist.')
    expect(z.grundIds).toEqual(['C2'])
    expect(z.genannt).not.toContain('C2')
    const q = zf({ tempoRegime: 't30_zone', vSig: 30, strassentyp: 'siedlungsorientiert', laengsparkierung: false })
    expect(q.antwort).toMatch(/empfohlen wird eine Querung ohne Vortritt \(vorgezogener Seitenraum, Einengung oder Anhebung\), weil es eine Quartierstrasse ist\.$/)
  })
  it('Tempo über 60: Grund mit Ist-Wert; Furt empfohlen', () => {
    const z = zf({ vSig: 60, v85: 65 })
    expect(z.antwort).toBe('Ein Fussgängerstreifen ist hier nicht zulässig: Tempo über 60 km/h (gefahren 65 km/h); empfohlen wird eine Fussgängerfurt ' +
      '(Insel ohne Balken), weil es eine Durchgangsstrasse ist.')
    // Grundprüfung entfällt über 60 km/h
    expect(z.wichtig.startsWith('Grundprüfung bfu entfällt (über 60 km/h).')).toBe(true)
  })
  it('breite Fahrbahn ohne Insel: Muss mit Kurzsatz (Ist und Schwelle), Empfehlung mit Schutzinsel', () => {
    const z = zf({ fahrbahnB: 9.2 })
    expect(z.antwort).toBe('Ein Fussgängerstreifen ist hier zulässig, empfohlen mit Schutzinsel.')
    expect(z.genannt[0]).toBe('D2')
    expect(z.wichtig).toContain('Zu beheben: Insel fehlt bei breiter Fahrbahn (9,20 m, ab 8,50 m nötig)')
    // der Punkt Fussgängerschutzinsel steht nicht doppelt (sein Befund ist genannt)
    expect(z.wichtig).toBe('Grundprüfung bfu: 4 von 5 Punkten erfüllt. Zu beheben: Insel fehlt bei breiter Fahrbahn (9,20 m, ab 8,50 m nötig).')
  })
  it('mehr als zwei Befunde: zwei genannt, Rest als «weitere Befunde»; Muss vor Soll', () => {
    const z = zf({ fahrbahnB: 9.2, streifenBreite: 2.8, abstandLsaM: 100, abstandFgsM: 30 })
    expect(z.genannt.length).toBe(2)
    expect(z.weitereBefunde).toBeGreaterThan(0)
    expect(z.wichtig).toMatch(/Zu beheben: .+; zu verbessern: (ein weiterer Befund|\d+ (weitere )?Befunde?)\./)
    expect(z.wichtig).toContain('Streifen zu schmal (2,80 m statt mindestens 3,00 m)')
  })
  it('Lichtsignal: Empfehlung mit Lichtsignalanlage, keine Grundprüfung', () => {
    const z = zf({ typ: 'lsa', fgsMitLsa: true })
    expect(z.antwort).toBe('Ein Fussgängerstreifen ist hier zulässig, empfohlen mit Lichtsignalanlage.')
    expect(z.wichtig).not.toContain('Grundprüfung')
  })
  it('ausserorts, Begegnungszone, verteiltes Queren, Ortslage offen', () => {
    expect(zf({ innerorts: false }).antwort).toBe('Die Querung liegt ausserorts; fgsCheck beurteilt nur Querungen innerorts.')
    expect(zf({ tempoRegime: 'begegnungszone' }).antwort).toMatch(/^In der Begegnungszone ist kein Fussgängerstreifen zulässig/)
    expect(zf({ nachfrage: 'flaechig' }).antwort).toMatch(/^Hier wird verteilt über die Strecke gequert/)
    const o = zf({ innerorts: null })
    expect(o.antwort).toBe('Noch nicht beurteilt: Es fehlt die Angabe, ob die Querung innerorts liegt.')
    expect(o.fehlt!.felder[0]).toBe('innerorts')
  })
  it('Kurzform: Kurzsatz mit Platzhaltern; ohne Wert der Teil vor der Klammer; ohne Kurzsatz Titel mit Ist und Soll', () => {
    expect(kurzform({ id: 'F1a', ist: '2,80', soll: '≥ 3,00', einheit: 'm' })).toBe('Streifen zu schmal (2,80 m statt mindestens 3,00 m)')
    expect(kurzform({ id: 'F1a' })).toBe('Streifen zu schmal')
    expect(kurzform({ id: 'H1', ist: 'verdeckt (Parkfeld (auto))', soll: '55 m frei (VSS Tab. 1)', einheit: 'm' })).toBe('zu wenig Sicht auf die Wartefläche (verdeckt statt 55 m frei)')
    expect(kurzform({ id: 'C3', ist: 'Klasse <100', einheit: 'Pers.' })).toBe('wenige Querende (geschätzt unter 100 Personen in 5 Spitzenstunden)')
    expect(kurzform({ id: 'C4', ist: '2000', einheit: 'Fz/Tag' })).toBe('wenig Fahrverkehr (2000 Fahrzeuge pro Tag)')
    expect(kurzform({ id: 'G3', ist: '12', soll: '≤ 10', einheit: 'm' })).toBe('Querung abseits der Gehlinie (12 m statt höchstens 10 m)')
    // Werte je Zufahrt bzw. je Seite (Korrektur S3), Sichtweiten auf ganze Meter
    expect(kurzform({ id: 'H1', ist: '70,0 / 70,0', soll: '≥ 75', einheit: 'm' })).toBe('zu wenig Sicht auf die Wartefläche (je Zufahrt 70 m statt mindestens 75 m)')
    expect(kurzform({ id: 'E3', ist: '70,0 / 50,4', soll: '≥ 82,6', einheit: 'm' })).toBe('zu wenig Sicht (je Zufahrt 70 m und 50 m statt mindestens 83 m)')
    expect(kurzform({ id: 'B5-1', ist: '54,6 m (kleinste von 2, Zufahrt 1)', soll: '≥ 55 m' })).toBe('zu wenig Sicht auf die Wartefläche (54 m statt mindestens 55 m)')
    expect(kurzform({ id: 'F3', ist: '3,00 / 3,00', soll: '3,60 (mind. 3,50) bis 3,75 oder ≥ 4,50 (mind. 4,25)', einheit: 'm' }))
      .toBe('Durchfahrt neben der Insel ungünstig (je Seite 3,00 m, Soll 3,50 bis 3,75 m oder mindestens 4,50 m)')
    expect(kurzform({ id: 'F2f', ist: '0,50 / 0,80', soll: '≥ 0,75', einheit: 'm' })).toBe('Inselspitze ragt zu wenig vor (je Seite 0,50 m und 0,80 m statt mindestens 0,75 m)')
    // ohne Kurzsatz: Titel mit Ist/Soll, ohne Wert «(nicht erfüllt)»; «nötig» nur bei Muss
    expect(kurzform({ id: 'F4c' })).toBe('Länge der Einengung mit Streifen (Bern: nicht erfüllt)')
    expect(kurzform({ id: 'F1c', soll: '≤ 0,50', einheit: 'm' })).toBe('Abstand Balken zur Trottoirkante (nötig höchstens 0,50 m)')
    expect(kurzform({ id: 'F1c', soll: '≤ 0,50', einheit: 'm' }, false)).toBe('Abstand Balken zur Trottoirkante (Soll höchstens 0,50 m)')
  })
  it('Korrektur M1: ein verletzter Hinweis im Baum unterdrückt den Soll-Punkt der Grundprüfung nicht', () => {
    for (const abw of [{ fahrbahnB: 9.2, dtv: 2000 }, { ...TESTFAELLE.find(t => t.name === 'n [2,1] mit baulicher Insel')!.abw, durchfahrt: [4.3, 4.3] }] as Abw[]) {
      const z = zf(abw)
      expect(z.befunde.some(id => id.startsWith('B5')), JSON.stringify(abw)).toBe(true)
      expect(z.wichtig, JSON.stringify(abw)).not.toMatch(/Keine Befunde|ohne Befund/)
    }
  })
  it('Korrektur M2: Trottoirüberfahrt nicht zulässig – Alternative nach der Zulässigkeit des Fussgängerstreifens', () => {
    expect(zf({ typ: 'trottoirueberfahrt' }).antwort).toMatch(/; stattdessen passt ein Fussgängerstreifen\.$/)
    expect(zf({ typ: 'trottoirueberfahrt', tempoRegime: 't30_zone', vSig: 30, beduerfnis: ['schule'] }).antwort)
      .toMatch(/; stattdessen ein Fussgängerstreifen, aber nur mit Begründung\.$/)
    expect(zf({ typ: 'trottoirueberfahrt', tempoRegime: null }).antwort).toMatch(/; ob stattdessen ein Fussgängerstreifen zulässig ist, ist noch offen\.$/)
    expect(zf({ typ: 'trottoirueberfahrt', vSig: 60, v85: 65 }).antwort).toMatch(/; stattdessen passt eine Fussgängerfurt \(Insel ohne Balken\)\.$/)
  })
  it('beurteilte Furt, Querung ohne Vortritt, Mehrzweckstreifen: «wäre zulässig; beurteilt wird …»', () => {
    expect(zf({ typ: 'furt' }).antwort).toBe('Ein Fussgängerstreifen wäre hier zulässig; beurteilt wird die Fussgängerfurt.')
    expect(zf({ typ: 'ohne_vortritt' }).antwort).toBe('Ein Fussgängerstreifen wäre hier zulässig; beurteilt wird die Querung ohne Vortritt.')
    expect(zf({ typ: 'mehrzweck' }).antwort).toBe('Ein Fussgängerstreifen wäre hier zulässig; beurteilt wird der Mehrzweckstreifen.')
  })
  it('Muss-Befund zur Lage: grundsätzlich zulässig, aber …; der Befund steht nicht noch einmal in Satz 2', () => {
    const z = zf(TESTFAELLE.find(t => t.regel === 'D4a')!.abw)
    expect(z.antwort).toBe('Ein Fussgängerstreifen ist hier grundsätzlich zulässig, aber nicht im Haltestellenbereich.')
    expect(z.grundIds).toContain('D4a')
    expect(z.genannt).not.toContain('D4a')
    expect(zf({ abstandLsaM: 100 }).antwort).toBe('Ein Fussgängerstreifen ist hier grundsätzlich zulässig, aber nicht so nah am Lichtsignal.')
  })
  it('Ende des Baums: kein Satz zur Grundprüfung; Ebenen Bern und Kanton BE in Satz 2 gekennzeichnet', () => {
    for (const abw of [{ innerorts: false }, { tempoRegime: 'begegnungszone' }, { nachfrage: 'flaechig' }] as Abw[]) expect(zf(abw).wichtig).not.toContain('Grundprüfung')
    const zb = zf({ ...TESTFAELLE.find(t => t.name === 'n [2,1] mit baulicher Insel')!.abw, durchfahrt: [3.3, 3.3], dtv: 8000 }, { bern: true, kantonBE: true })
    expect(zb.wichtig).toMatch(/\(Kanton BE: je Seite 3,30 m/)
  })
  it('Schlussrunde: gerundetes Ist auf der Grenze wird «knapp unter …» (54,96 m bei 55 m); deutlich tiefere Werte erklären den Befund', () => {
    expect(kurzform({ id: 'H1', ist: '55,0 / 90,0', soll: '≥ 55', einheit: 'm' })).toBe('zu wenig Sicht auf die Wartefläche (je Zufahrt knapp unter 55 m und 90 m statt mindestens 55 m)')
    expect(kurzform({ id: 'H1', ist: '55,0 / 40,0', soll: '≥ 55', einheit: 'm' })).toBe('zu wenig Sicht auf die Wartefläche (je Zufahrt 55 m und 40 m statt mindestens 55 m)')
    for (const sicht of [[54.96, 90], [54.96, 54.96]]) {
      const t = text(zf({ sichtVorh: sicht }))
      expect(t, JSON.stringify(sicht)).toContain('knapp unter 55 m')
      expect(t, JSON.stringify(sicht)).not.toMatch(/(?<!unter )\b55 m statt mindestens 55 m/)
    }
    expect(text(zf({ sichtVorh: [54.96] }))).toContain('zu wenig Sicht auf die Wartefläche (knapp unter 55 m statt mindestens 55 m)')
  })
  it('Schlussrunde: vorläufig nach dem, was offen ist (Platz für die Insel, Insel schon empfohlen)', () => {
    expect(zf({ fahrbahnB: 9.2, inselMoeglich: null }).antwort).toBe('Ein Fussgängerstreifen ist hier zulässig, empfohlen mit Schutzinsel; vorläufig: ob die Schutzinsel Platz hat, ist noch offen.')
    expect(zf({ fahrbahnB: 9, dtv: null }).antwort).toBe('Ein Fussgängerstreifen ist hier zulässig; vorläufig: ob eine Schutzinsel nötig ist, hängt noch von fehlenden Angaben ab.')
  })
  it('Schlussrunde: Sicht am Knoten offen ohne fehlendes Feld bekommt die Frage zur Kurve', () => {
    const z = zf({ kurve: { radius: 20, fuenfBedingungen: true }, sichtVorh: [25, 25] })
    expect(z.fehlt?.felder).toContain('kurve.radius')
  })
  it('Katalog: Kurzsätze kurz, eigene Texte, nur bekannte Platzhalter; für Big Five und die häufigen Muss-Regeln vorhanden', () => {
    const mit = REGEL_IDS.filter(id => DEF[id].kurzsatz)
    expect(mit.length).toBeGreaterThanOrEqual(30)
    for (const id of ['C1', 'C2', 'D1', 'D2', 'D3a', 'D4a', 'D4b', 'E3', 'F1a', 'F2', 'G1', 'G2', 'G8a', 'H1', 'H3a', 'B5-T', 'B5-1', 'B5-2b', 'B5-3', 'B5-4', 'B5-5'])
      expect(DEF[id].kurzsatz, id).toBeTruthy()
    for (const id of mit) {
      const k = DEF[id].kurzsatz!
      expect(k.length, id).toBeLessThanOrEqual(120)
      expect(k, id).not.toMatch(/["„“”«»ß]|zebra/i)
      expect(nummernOhneTitel(k), id).toEqual([])
      for (const m of k.matchAll(/\{([^}]+)\}/g)) {
        const p = m[1]
        if (p.startsWith('w:')) expect(DEF[id].werte?.[p.slice(2)], `${id} ${p}`).toBeTypeOf('number')
        else expect(['ist', 'soll'], `${id} ${p}`).toContain(p)
      }
    }
  })
})

// ── Befundblätter mit Rechnung (künstliche Strasse wie befundblatt.test.ts) ──
const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
const weg = (id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) })
const OSM: OsmDaten = {
  wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
}
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const fallMit = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const HAND: BedarfBlock = { felder: {
  dtv: { wert: 8000, quelle: 'hand' }, fgKlasse: { wert: '100-500', quelle: 'schaetzung' }, netz: { wert: 'basisnetz', quelle: 'hand' },
  tempoRegime: { wert: 'strecke', quelle: 'hand' }, strassentyp: { wert: 'verkehrsorientiert', quelle: 'hand' },
  nachfrage: { wert: 'punktuell', quelle: 'hand' }, lage: { wert: 'strecke', quelle: 'hand' }, beduerfnis: { wert: [], quelle: 'hand' },
  'haltestelle.art': { wert: 'keine', quelle: 'hand' },
} }
const park = (x: Fall) => x.hindernisse.push({ id: 'p1', art: 'parkfeld', klasse: 'auto', ring: rechteck(-12, 2, -7, 4), quelle: 'hand' })

describe('Zusammenfassung an Befundblättern mit Rechnung', () => {
  const fid = rechneFall(OSM, AV, [], 12, fallMit(), null).streifen[0].fgsId
  const blatt = (f: Fall, bern = false) => befundblaetter(rechneFall(OSM, AV, [], 12, f, null), f, { vorgabe: { bern, kantonBE: bern } })[0]
  const szenarien: [string, Fall][] = [
    ['leer', fallMit()],
    ['Handeingaben', fallMit(x => { x.bedarf = HAND })],
    ['Sicht verdeckt', fallMit(x => { park(x); x.bedarf = HAND })],
    ['Furt', fallMit(x => { x.streifen[fid] = { typ: 'furt' }; x.bedarf = HAND })],
    ['Lichtsignal', fallMit(x => { x.streifen[fid] = { lsa: 'ja' }; park(x); x.bedarf = HAND })],
    ['Tempo 30 Zone', fallMit(x => { x.bedarf = { felder: { ...HAND.felder, tempoRegime: { wert: 't30_zone', quelle: 'hand' }, vSig: { wert: 30, quelle: 'hand' } } } })],
  ]
  it('Regeln der Zusammenfassung an allen Szenarien (beide Ebenenstände)', () => {
    const fehler: string[] = []
    for (const [name, f] of szenarien) for (const bern of [false, true]) {
      const b = blatt(f, bern)
      const z = zusammenfassungBlatt(b)
      fehler.push(...pruefe(`${name} ${bern}`, { befund: b.befund, grund: b.grund, offen: b.offen }, z))
    }
    expect(fehler).toEqual([])
  })
  it('ohne Handeingaben: vorläufig, Fragen springen zum Feld; Sicht verdeckt: Muss aus dem Sichtrechner genannt', () => {
    const z0 = zusammenfassungBlatt(blatt(fallMit(x => { x.bedarf = { felder: { tempoRegime: { wert: null, quelle: 'hand' } } } })))
    expect(z0.antwort).toBe('Vorläufig: Ob ein Fussgängerstreifen hier zulässig ist, hängt von fehlenden Angaben ab.')
    expect(z0.fehlt!.felder.length).toBeGreaterThanOrEqual(1)
    for (const q of z0.fehlt!.felder) expect(feldZiel(q), q).not.toBeNull()
    const zv = zusammenfassungBlatt(blatt(szenarien[2][1]))
    expect(zv.genannt[0]).toBe('H1')
    expect(zv.wichtig).toMatch(/Zu beheben: zu wenig Sicht auf die Wartefläche \(verdeckt statt \d+ m frei\)/)
    const zl = zusammenfassungBlatt(blatt(szenarien[4][1]))
    expect(zl.antwort).toBe('Ein Fussgängerstreifen ist hier zulässig, empfohlen mit Lichtsignalanlage.')
    expect(zl.wichtig).not.toContain('Grundprüfung')
  })
})
