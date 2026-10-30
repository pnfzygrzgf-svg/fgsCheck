// Tests Regelprüfung nach Quelle, Block 2 (Nutzerentscheide 30.10.2026 nach dem Vergleich mit VSS 40 240, 40 241 und 40 242): Stärke Hinweis,
// gestrichene Regeln und Felder (alte Fall-Dateien still), Bedingungen Q3-M2 und D4c, Fundstellen, Sichtweite 20 km/h als Annahme,
// Informationszeile zum Verkehr an der Trottoirüberfahrt, Verweis auf KnotenCheck mit Link. Block 3 (30.10.2026): Block I (LSA-Zeiten),
// G7, G7b (Halteverbotslinie), F1a, F1b, F1c, F1-K (Streifenbreite, Abstand der Balken) gestrichen, F7d Hinweis, Fundstellen G3 und H1-V.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KATALOG, WERKE, type RegelId } from './katalog'
import { REGELN } from './regeln'
import { FELDER } from './eingaben'
import { FELD_DEF } from './felder'
import { bedarfLesen } from './fallBedarf'
import { beurteile } from './entscheid'
import { Q3_OK, fall } from './testfaelle'
import { tueVerkehrZeile } from './befundblatt'
import { sichtFgsHerkunft } from './tabellen'
import { LESENAME, WERK_INFO, regelnJeWerk } from './quellen'
import { THEMEN_GRUPPEN } from './themen'
import { VerweisText } from '../Verweise'
import type { RegelDef } from './typen'

const D = (id: string) => KATALOG[id as RegelId] as RegelDef

describe('Stärke Hinweis (A)', () => {
  // F1c, G7, G7b seit Block 3 (30.10.2026) gestrichen; F7d seit Block 3 Hinweis
  const HINWEIS = ['G3b', 'G6', 'F1e', 'F2e', 'F2f', 'G4', 'G4b', 'G5', 'G5b', 'G9', 'F7a', 'F7b', 'F7c', 'F7d', 'F7e', 'D3b',
    'Q3-12', 'Q3-M6', 'F5c', 'F5d', 'F5e', 'F5g', 'F5h', 'F5n']
  it('Hinweis ohne fallabhängige Stärke, Prüfsatz im Hinweiston', () => {
    for (const id of HINWEIS) {
      expect(D(id).staerke, id).toBe('hinweis')
      expect(D(id).auch, id).toBeUndefined()
      expect(D(id).pruefsatz, id).toMatch(/\? Hinweis: /)
    }
  })
  it('G3b ohne Berichtsvorbehalt; Q3-M6 nur noch mit Z. 14.2', () => {
    expect([D('G3b').pruefsatz, D('G3b').ergebnis].join(' ')).not.toMatch(/Bericht/)
    expect(D('Q3-M6').quellen).toEqual([{ werk: '40242', ziffer: 'Z. 14.2, S. 15' }])
  })
  it('Trottoirrand zurückgesetzt (F5c) und viel Verkehr in der Seitenstrasse machen die Trottoirüberfahrt nicht mehr unzulässig', () => {
    const b = beurteile(fall({ lage: 'einmuendung', typ: 'trottoirueberfahrt', q3: { ...Q3_OK, randDurchgehend: false, hvl5m: false } }))
    expect(b.alle.filter(x => ['F5c', 'Q3-12'].includes(x.id)).map(x => x.staerke)).toEqual(['hinweis', 'hinweis'])
    expect(b.empfehlung.zusatz.join(' ')).not.toMatch(/nicht zulässig/)
    expect(b.empfehlung.typ).toBe('Q3')
  })
})

describe('Gestrichene Regeln und Felder (B)', () => {
  const REGELN_G = ['F2g', 'Q3-M10', 'F5b', 'F5f', 'F5i', 'F5j', 'F5k', 'F5l', 'F5m']
  const FELDER_G = ['insel.pfostenH', 'q3.mivEinmHoch', 'q3.hauptInZone', 'q3.anrampung', 'q3.erkennbar', 'q3.quergefaelle', 'q3.randabschluss',
    'q3.randsteineSenkrecht', 'q3.signalisation', 'q3.markierung']
  it('Regeln gestrichen wie das Vorbild (Quellen bleiben), ohne Auswertung; Felder nicht mehr in der Maske', () => {
    for (const id of REGELN_G) {
      const d = D(id)
      expect([d.art, d.ebene, d.staerke, d.eingaben, d.bedingung], id).toEqual(['gestrichen', null, null, [], '–'])
      expect(d.pruefsatz, id).toMatch(/^Gestrichen: /)
      expect(d.bemerkung, id).toMatch(/^Nutzerentscheid 30\.10\.2026: /)
      expect(d.quellen.length, id).toBeGreaterThan(0)
      expect(Object.keys(REGELN), id).not.toContain(id)
    }
    for (const p of FELDER_G) expect(FELD_DEF.has(p), p).toBe(false)
    for (const [id, d] of Object.entries(KATALOG)) for (const f of (d as RegelDef).eingaben) expect(FELDER_G, id).not.toContain(f)
    expect(Object.keys(FELDER)).toContain('q3')
  })
  it('alter Fall mit den gestrichenen Feldern: still übergangen, ohne Hinweis; übrige Angaben bleiben', () => {
    const felder: Record<string, unknown> = { 'q3.belag': { wert: 'gleich', quelle: 'hand' }, 'insel.breite': { wert: 2, quelle: 'hand' },
      'insel.pfostenH': { wert: 0.95, quelle: 'hand' }, 'q3.mivEinmHoch': { wert: true, quelle: 'hand' }, 'q3.hauptInZone': { wert: true, quelle: 'hand' },
      'q3.anrampung': { wert: [12, 0.8], quelle: 'hand' }, 'q3.erkennbar': { wert: false, quelle: 'hand' }, 'q3.quergefaelle': { wert: 4, quelle: 'hand' },
      'q3.randabschluss': { wert: 's0630', quelle: 'hand' }, 'q3.randsteineSenkrecht': { wert: true, quelle: 'hand' },
      'q3.signalisation': { wert: false, quelle: 'hand' }, 'q3.markierung': { wert: true, quelle: 'hand' } }
    const [b, h] = bedarfLesen({ felder })
    expect(h).toEqual([])
    expect(Object.keys(b!.felder).sort()).toEqual(['insel.breite', 'q3.belag'])
  })
})

describe('Bedingungen (C)', () => {
  const tue = (q3: Partial<typeof Q3_OK>) => beurteile(fall({ lage: 'einmuendung', typ: 'trottoirueberfahrt', q3: { ...Q3_OK, ...q3 } }))
  it('Q3-M2: in der Zone nur mit Eingangstor zulässig; eine Hauptstrasse in der Zone ist keine Ausnahme mehr', () => {
    expect(tue({ zoneEinm: 't30' }).alle.find(x => x.id === 'Q3-M2')).toMatchObject({ zustand: 'verletzt', staerke: 'hart' })
    expect(tue({ zoneEinm: 'bgz', eingangstor: true }).alle.find(x => x.id === 'Q3-M2')).toBeUndefined()
    expect(D('Q3-M2').eingaben).toEqual(['q3.zoneEinm', 'q3.eingangstor'])
    expect(D('Q3-M2').pruefsatz).toBe('Liegt die Einmündung in einer Tempo-30- oder Begegnungszone und ist die Überfahrt nicht das Eingangstor ' +
      'der Zone? Dann ist keine Trottoirüberfahrt zulässig.')
  })
  it('Kurvenregel: erste Voraussetzung und H2 nennen den Vortritt', () => {
    expect(FELD_DEF.get('kurve.b1Innerorts50')!.name).toBe('Kurve innerorts, 50 km/h, vortrittsberechtigte Strasse')
    expect(D('H2').pruefsatz).toMatch(/Strasse mit Vortritt/)
  })
  it('D4c: Haltestelle auf beiden Strassenseiten nicht anwendbar', () => {
    const h = (beidseits: boolean | null) => beurteile(fall({ haltestelle: { art: 'bucht', lage: 'fgs_vor_halt', verdeckt: false,
      ueberholenUnterbunden: false, beidseits } })).alle.find(x => x.id === 'D4c')?.zustand ?? '-'
    expect([h(false), h(true), h(null)]).toEqual(['verletzt', '-', 'offen'])
    expect(FELD_DEF.get('haltestelle.beidseits')).toMatchObject({ name: 'Haltestelle auf beiden Strassenseiten', art: { art: 'bool' } })
  })
})

describe('Sichtweite 20 km/h und über 60 km/h als Annahme (D)', () => {
  it('Text im Bedarf: Annahme statt Tab. 1', () => {
    expect([20, 30, 50, 60, 80].map(sichtFgsHerkunft)).toEqual(['Annahme: wie 30 km/h (VSS 40 241 Tab. 1 ohne Zeile für 20 km/h)', 'Tab. 1',
      'Tab. 1', 'Tab. 1', 'Annahme: wie 60 km/h (VSS 40 241 Tab. 1 endet bei 60 km/h; Fussgängerstreifen über 60 km/h unzulässig)'])
    const h1 = beurteile(fall({ vSig: 20, v85: null, sichtVorh: [20, 20] })).alle.find(x => x.id === 'H1')
    expect(h1).toMatchObject({ zustand: 'verletzt', soll: '≥ 25' })
    expect(h1!.detail).toBe('Annahme: wie 30 km/h (VSS 40 241 Tab. 1 ohne Zeile für 20 km/h), 20 km/h signalisiert')
  })
})

describe('Fundstellen (E)', () => {
  it('mit Seite', () => {
    expect(D('A4').quellen[0].ziffer).toBe('Z. 14, S. 7')
    expect(D('C4').quellen[0].ziffer).toBe('Z. 17, S. 10')
    expect(D('G3').quellen[0].ziffer).toBe('Z. 18, S. 10')
    expect(D('G3b').quellen[0].ziffer).toBe('Z. 18, S. 10')
    expect(D('G6').quellen[0].ziffer).toBe('Z. 18, S. 10; Abb. 9–11')
  })
})

describe('Verkehr an der Trottoirüberfahrt als Information (F)', () => {
  it('Zeile mit Verhältnis; fehlt ein Wert: offen', () => {
    const NORM = ' Norm (VSS 40 242 Z. 15.2.1, S. 17): Verkehr der Seitenstrasse deutlich geringer als auf der Hauptfahrbahn; bei geringem ' +
      'Gesamtverkehr sind auch gleiche Mengen zulässig.'
    expect(tueVerkehrZeile(1500, 12000)).toBe('Verkehr: Seitenstrasse 1 500 Fz/Tag, Hauptfahrbahn 12 000 Fz/Tag, Verhältnis 1 : 8,0.' + NORM)
    expect(tueVerkehrZeile(null, 12000)).toBe('Verkehr: Seitenstrasse offen, Hauptfahrbahn 12 000 Fz/Tag, Verhältnis offen.' + NORM)
    expect(tueVerkehrZeile(800, null)).toMatch(/^Verkehr: Seitenstrasse 800 Fz\/Tag, Hauptfahrbahn offen, Verhältnis offen\./)
    expect(tueVerkehrZeile(3000, 3000)).toMatch(/Verhältnis 1 : 1,0\./)
  })
})

describe('Verweis auf KnotenCheck bei der Wartezeit (G)', () => {
  it('Normhinweis Q3-M3 mit Link (neues Fenster); im Bericht als Text', () => {
    const t = D('Q3-M3').normHinweis!
    expect(t).toContain('https://knotencheck.ch/')
    const html = renderToStaticMarkup(<VerweisText text={t} />)
    expect(html).toContain('<a href="https://knotencheck.ch/" target="_blank" rel="noopener"')
    expect(html).toContain('>https://knotencheck.ch/</a>) die mittlere Wartezeit')
    const druck = renderToStaticMarkup(<VerweisText text={t} druck />)
    expect(druck).not.toContain('<a ')
    expect(druck).toContain('https://knotencheck.ch/')
    // Satzzeichen am Ende gehören nicht zur Adresse
    expect(renderToStaticMarkup(<VerweisText text="siehe https://knotencheck.ch/." />)).toContain('href="https://knotencheck.ch/"')
  })
})

describe('Block 3 (Nutzerentscheide 30.10.2026)', () => {
  const I = ['I1', 'I2', 'I3a', 'I3b', 'I4', 'I5', 'I6', 'I6-B', 'I7-B1', 'I7-B2', 'I7-B3', 'I7-B4', 'I8']
  it('Block I, G7, G7b, F1a, F1b, F1c, F1-K gestrichen wie das Vorbild (Quellen bleiben), ohne Auswertung', () => {
    for (const id of [...I, 'G7', 'G7b', 'F1a', 'F1b', 'F1c', 'F1-K']) {
      const d = D(id)
      expect([d.art, d.ebene, d.staerke, d.eingaben, d.bedingung], id).toEqual(['gestrichen', null, null, [], '–'])
      expect(d.pruefsatz, id).toMatch(/^Gestrichen: /)
      expect(d.bemerkung, id).toMatch(/^Nutzerentscheid 30\.10\.2026: /)
      expect(d.quellen.length, id).toBeGreaterThan(0)
      expect(Object.keys(REGELN), id).not.toContain(id)
    }
    // keine Regel der Gruppe I mehr aktiv
    expect(Object.values(KATALOG).filter(d => (d as RegelDef).gruppe === 'I' && (d as RegelDef).art !== 'gestrichen')).toEqual([])
  })
  it('mit Lichtsignal: keine I-Regel, kein «nicht geprüft»; die Regeln, wann ein Lichtsignal zu prüfen ist (D5), bleiben', () => {
    for (const abw of [{ typ: 'lsa' as const }, { fgsMitLsa: true }]) {
      const b = beurteile(fall(abw), { ebenen: { bern: true, kantonBE: true } })
      expect(b.ausgewertet.filter(id => /^I\d/.test(id))).toEqual([])
      expect(b.nichtGeprueft).toEqual([])
    }
    expect(beurteile(fall({ lage: 'knoten_berechtigt' })).alle.find(x => x.id === 'D5-2')).toBeDefined()
    expect(FELD_DEF.get('fgsMitLsa')).toBeDefined()
    expect(THEMEN_GRUPPEN.map(g => g.titel)).not.toContain('Lichtsignalanlage (VSS 40 837)')
  })
  it('F7d: Hinweis (Ausrüstung)', () => {
    expect(D('F7d').staerke).toBe('hinweis')
    expect(D('F7d').pruefsatz).toMatch(/\? Hinweis: /)
    expect(D('F7d').bemerkung).toContain('Nutzerentscheid 30.10.2026: Hinweis (Ausrüstung)')
    expect(beurteile(fall({ absenkung: 0, taktil: false })).alle.find(x => x.id === 'F7d')).toMatchObject({ zustand: 'verletzt', staerke: 'hinweis' })
  })
  it('Fundstellen: G3 ohne SN 640 070 (Werk aus dem Verzeichnis), H1-V mit Ziffer und Seite', () => {
    expect(D('G3').quellen.map(q => q.werk)).toEqual(['40241', '40240'])
    expect(Object.keys(WERKE)).not.toContain('640070')
    expect(Object.keys(LESENAME)).not.toContain('640070')
    expect(Object.keys(WERK_INFO)).not.toContain('640070')
    expect(D('H1-V').quellen).toEqual([{ werk: '40241', ziffer: 'Z. 14, S. 6' }, { werk: '40273', ziffer: 'Z. 13.3, S. 9; Tab. 3, S. 9' }])
  })
  it('Werke ohne aktive Regel bleiben im Verzeichnis: VSS 40 837 und Handbuch LSA Bern', () => {
    const n = regelnJeWerk()
    expect([n.get('40837'), n.get('HBLSA')]).toEqual([0, 0])
    expect(WERKE['40837'].name).toBe('VSS 40 837')
    expect(WERKE.HBLSA).toBeDefined()
  })
})
