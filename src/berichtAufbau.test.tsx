// Aufbau des Berichts (06.11.2026): Ergebnisse zuerst, keine Begriffsliste, Geländeprofile der massgebenden Sichtlinien, Quellen am Ende
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfilBericht, profilWahlBericht } from './BerichtProfil'
import { BILD_MIN_MM, bildDruckHoeheMm, datumText, ergebnisZusatzMm, legendeZeilen, netzQuelleText } from './berichtSeite1'
import type { EbenenObjekt } from './quellenEbenen'
import type { HoehenProfil } from './hoehenprofil/modell'
import type { ZufahrtErgebnis } from './rechner/typen'

const quelle = (f: string) => readFileSync(join(__dirname, f), 'utf-8')

describe('Bericht: Reihenfolge der Abschnitte', () => {
  it('Ort, Ergebnis und Kartenbild auf Seite 1, dann Sichtprüfung je Streifen mit Hinweisen, Bedarf, Eingaben, Quellen, Anhang', () => {
    const src = quelle('Bericht.tsx')
    const lage = (s: string) => { const i = src.indexOf(s); expect(i, s).toBeGreaterThan(0); return i }
    const reihe = ['<h2>Ort</h2>', '<h2>Ergebnis</h2>', '<BerichtKarte ', 'bericht-neue-seite', '<h2>Sichtprüfung je Streifen und Zufahrt</h2>',
      '<StreifenTabelle ', '<h3>Hinweise zur Sichtprüfung</h3>', '<h2>Bedarf und Querungstyp</h2>', '<h2>Eingaben von Hand</h2>', '<h2>Quellen</h2>',
      '<h3>Werke der Sichtprüfung</h3>', '<VerzeichnisBericht blaetter={blaetter} />', '<footer className="bericht-fuss">', '<h2>Anhang: Eingaben und Quellen'].map(lage)
    expect([...reihe].sort((a, b) => a - b)).toEqual(reihe)
    expect(src).not.toContain('<h2>Normbezüge</h2>')
    expect(src).not.toContain('<h2>Annahmen und Hinweise</h2>')   // die Überschrift steht nur noch im Bedarf; Park- und Baumannahmen unter «Hinweise zur Sichtprüfung»
    expect(src).toContain('bedarfZeilen.map(')                    // Aussage zum Bedarf im Ergebnis auf Seite 1
    expect(src).toContain('erkennungBefunde(s).map(')             // verfehlte Erkennungsdistanz im Ergebnis auf Seite 1
  })
  it('keine Begriffsliste im Bericht; Geländeprofile im Streifenabschnitt', () => {
    expect(quelle('BedarfPanel.tsx')).not.toContain('<h3>Begriffe</h3>')
    expect(quelle('Bericht.tsx')).toContain('<ProfilBericht key={p.id} p={p} />')
    // Fahrzeuge und Personen wie auf der Karte (06.11.2026)
    expect(quelle('Bericht.tsx')).toContain('fgsFahrzeuge(st, neigung)')
  })
  it('Legende nach SichtweitenCheck: Farbprobe je Zeile, nur was im Bild vorkommt, Satz zu den Sichtfeldern', () => {
    const src = quelle('Bericht.tsx')
    expect(src).toContain('function Probe(')
    expect(src).toContain('<ul className="bericht-legende">{legende.map(')
    expect(src).toContain('Sichtfelder im Bild:')
    // Einträge hängen am Vorkommen: Status der gezeigten Sichtfelder, Hindernisarten, Fahrzeuge, Bänder, Flächen (Plan)
    for (const bedingt of ['statusZeilen.map', 'hindArten.map', 'fzArten.map', 'erkBaender.length ?', 'plan.map(fp => fp.art)', 'fixpunkte.length ?', 'masten.length ?'])
      expect(src).toContain(bedingt)
    expect(src).not.toContain('<b>Streifen und Sicht:</b>')
    // Ursache der Verdeckung je Status; «verdeckt» heisst Auto-Parkfeld (rechner/pruefen.konfliktFelder)
    expect(src).toContain("verdeckt: 'Sichtfeld verdeckt durch ein Auto-Parkfeld'")
    expect(src).not.toContain('Gebäude bzw. Gelände')
    expect(quelle('index.css')).toContain('.bericht-seite .bericht-legende { list-style: none;')
  })
})

describe('Bericht: Druck in Firefox', () => {
  it('keine Abhängigkeit von break-after: was zusammenbleiben soll, steht in einem Block; Fallkennung im wiederholten Kopf', () => {
    const css = quelle('index.css'), panel = quelle('BedarfPanel.tsx')
    expect(css).toMatch(/\.grund-einheit, \.druck-block[^{]*\{ break-inside: avoid/)
    expect(panel).toContain('<tbody className="grund-einheit">')
    expect(panel).toContain('className="druck-block"')
    expect(quelle('Bericht.tsx')).toContain('<span className="bericht-kennung">')
    expect(panel).toContain('<a href={l.url}>{l.text}</a>')
    expect(panel).not.toContain('url-text')
  })
})

describe('Bericht: Seite 1 im Druck', () => {
  it('Zeilen der Legende: ganze Breite für sich, sonst zwei Spalten, die höhere Zelle zählt', () => {
    expect(legendeZeilen(['kurz', 'kurz', 'kurz'])).toBe(2)
    expect(legendeZeilen(['x'.repeat(100), 'kurz'])).toBe(3)
    expect(legendeZeilen([], ['x'.repeat(180)])).toBe(2)
  })
  it('Bild: volle Höhe, wenn es passt; kleiner bei langer Legende bzw. langem Ergebnis; nie unter dem Mindestmass', () => {
    expect(bildDruckHoeheMm(10, 1, 111)).toBe(111)
    expect(bildDruckHoeheMm(20, 2, 111)).toBe(82)
    expect(bildDruckHoeheMm(20, 2, 111, 15)).toBe(BILD_MIN_MM)
    expect(bildDruckHoeheMm(60, 4, 111)).toBe(BILD_MIN_MM)
  })
  it('Zusatzzeilen im Ergebnis; Datum und Zuordnung als Text', () => {
    expect(ergebnisZusatzMm(['kurz', 'x'.repeat(100)])).toBe(15)
    expect(datumText('Abruf 2026-11-06, Bericht')).toBe('Abruf 06.11.2026, Bericht')
    expect(netzQuelleText('uebergang')).toBe('am Übergang')
    expect(netzQuelleText('anders')).toBe('anders')
  })
})

const profil = (id: string, frei: boolean, h: number[], hinweis?: string): EbenenObjekt => ({
  id, klasse: frei ? 'frei' : 'verdeckt', text: id, linien: [[[0, 0], [50, 0]]],
  hoehenprofil: { id, titel: `Profil ${id}`, zweck: 'Test', quelle: 'Test', linie: [[0, 0], [50, 0]], hinweis,
    punkte: h.map((v, i) => ({ dist: i * 10, h: v })), sicht: { augeM: 1, zielM: 0, toleranzM: 0.15, frei } } as HoehenProfil,
})

describe('Bericht: Wahl der Geländeprofile', () => {
  const objekte = [
    profil('gel:A:z1:markierung:30', true, [500, 500, 500, 500, 500, 500]),
    profil('gel:A:z1:markierung:50', false, [500, 500.4, 500.6, 500.5, 500.2, 500.1]),
    profil('gel:A:z1:markierung:60', false, [500, 500.5, 500.9, 500.6, 500.2, 500.1]),
    profil('gel:A:z1:warte:20', true, [500, 500, 500, 500, 500, 500]),
    profil('gel:A:z2:warte:20', false, [500, 500.5, 500.9, 500.6, 500.2, 500.1]),
    profil('gel:A:z2:warte:30', false, [500, 500.5, 500.9, 500.6, 500.2, 500.1]),
  ]
  const zufahrt = (x: Partial<ZufahrtErgebnis>): ZufahrtErgebnis => ({ fgsId: 'A', zufahrt: 'z1', status: 'frei', sichtweite: 55, art: 'gerade', ...x } as unknown as ZufahrtErgebnis)
  it('Erkennung: nur wenn das Gelände das Soll verhindert, die Linie an der ersten verdeckten Position', () => {
    const e = { wert: 47, bis: 'verdeckt', hindernis: { klasse: 'gelaende', name: 'Geländemodell' }, gelaendePruefbereich: { letzteFreiM: 47.5, ersteVerdecktM: 50 } }
    expect(profilWahlBericht(objekte, zufahrt({ erkennungM: e } as Partial<ZufahrtErgebnis>), null).map(p => p.id)).toEqual(['gel:A:z1:markierung:50'])
    // Soll erreicht bzw. anderes Hindernis: kein Bild
    expect(profilWahlBericht(objekte, zufahrt({ erkennungM: { ...e, wert: 110 } } as Partial<ZufahrtErgebnis>), null)).toEqual([])
    expect(profilWahlBericht(objekte, zufahrt({ erkennungM: { ...e, hindernis: { klasse: 'gebaeude', name: 'Gebäude' } } } as Partial<ZufahrtErgebnis>), null)).toEqual([])
    expect(profilWahlBericht(objekte, zufahrt({}), null)).toEqual([])
  })
  it('Wartefläche: nur bei Status «verdeckt (Geländemodell)», die erste verdeckte Linie', () => {
    const z = zufahrt({ zufahrt: 'z2', status: 'verdeckt_gelaende', sichtGelaende: { stand: 'mit', abM: 20, bisM: 55, linien: [] } } as Partial<ZufahrtErgebnis>)
    expect(profilWahlBericht(objekte, z, null).map(p => p.id)).toEqual(['gel:A:z2:warte:20'])
    expect(profilWahlBericht(objekte, zufahrt({ zufahrt: 'z2' }), null)).toEqual([])
  })
  it('Bild: Höhenschnitt mit Auge, Ziel, roter Markierung und Bildunterschrift mit Überschreitung und Toleranz', () => {
    const html = renderToStaticMarkup(<ProfilBericht p={objekte[2].hoehenprofil!} />)
    expect(html).toContain('bericht-profil')
    expect(html).toContain('Fahrer*innenauge')
    expect(html).toContain('Der Boden verdeckt diese Sichtlinie')
    expect(html).toContain('über dem Sichtstrahl')
    expect(html).toContain('Toleranz 0.15 m')
    expect(html).toContain('#dc2626')
    const frei = renderToStaticMarkup(<ProfilBericht p={objekte[0].hoehenprofil!} />)
    expect(frei).toContain('ist diese Sichtlinie frei')
    expect(frei).not.toContain('über dem Sichtstrahl')
  })
})
