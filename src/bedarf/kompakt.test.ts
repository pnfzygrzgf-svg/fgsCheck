// Tests Runde 2, Verdichtung: Aggregation je Punkt der Grundprüfung (D1), Fragen je Feld (D2), Einheiten bei Ist/Soll.
import { describe, expect, it } from 'vitest'
import { beurteile } from './entscheid'
import { grundpruefung, type GrundPunkt, type GrundTeil } from './grundpruefung'
import { fall, INSEL_OK, TESTFAELLE } from './testfaelle'
import { FELD_DEFS } from './felder'
import { FELDNAMEN } from './eingaben'
import { FRAGEN, feldZiel, frageVon } from './feldhilfen'
import { annahmenJePunkt, eintragSatz, fragenFelder, grundKopf, istSoll, punktZeile, vorbehaltFelder } from './kompakt'

const teil = (id: GrundTeil['id'], zustand: GrundTeil['zustand'], x: Partial<GrundTeil> = {}): GrundTeil =>
  ({ id, name: id, zustand, staerke: zustand === 'verletzt' ? 'hart' : null, text: '', quelle: '', ...x })
const punkt = (teile: GrundTeil[]): GrundPunkt => ({ nr: '1', titel: 'Sichtverhältnisse', thema: 'sicht', zustand: 'erfuellt', staerke: null, teile, notizen: [] })

describe('Aggregation je Punkt (D1): die Muss-Regel bestimmt den Zustand', () => {
  it('Muss erfüllt, Soll offen → ✓ mit Zusatz; Muss erfüllt, Soll nicht erfüllt → ! mit Zusatz', () => {
    const a = punktZeile(punkt([teil('B5-1', 'erfuellt', { ist: '3 von 3 Zufahrten frei', soll: '≥ 25 m' }), teil('B5-1b', 'offen', { name: 'Erkennungsdistanz', fehlend: ['erkennungM'] })]))
    // 23.10.2026: in der Zeile nur gezählt, der Rest in den Details des Punkts
    expect(a).toMatchObject({ zustand: 'erfuellt', satz: 'alle 3 Zufahrten frei (nötig: 25 m)', zusatz: '1 Punkt offen', fragen: [] })
    const b = punktZeile(punkt([teil('B5-1', 'erfuellt'), teil('B5-1b', 'verletzt', { name: 'Erkennungsdistanz', staerke: 'weich', ist: '60 m' })]))
    // Korrektur S9: die Soll-Regel bestimmt den Zustand, ihr Satz steht in der Zeile, die erfüllte Muss-Regel im Zusatz
    expect(b).toMatchObject({ zustand: 'soll', satz: 'Erkennungsdistanz: 60 m' })
    const c = punktZeile(punkt([teil('B5-1', 'erfuellt', { name: 'Sichtweite', ist: '70 m', soll: '≥ 55 m' }),
      teil('B5-1b', 'verletzt', { name: 'Erkennungsdistanz', staerke: 'weich', ist: '60 m', soll: '≥ 110 m' })]))
    expect(c).toMatchObject({ zustand: 'soll', satz: 'Erkennungsdistanz: 60 m, Soll mindestens 110 m' })
    // die erfüllte Muss-Regel steht nicht in der Zeile (sonst liest sie sich wie der Grund für «!»), nur in den Details
    expect(c.zusatz).toBeUndefined()
  })
  it('Kann/S2/S3: Muss offen und Soll verletzt → ? mit Zusatz; ① ohne V85 mit Annahme; ④ offen mit Hinweis der Vorbelegung; über 60 km/h ein Satz', () => {
    const o = punktZeile(punkt([teil('B5-1', 'offen', { fehlend: ['sichtVorh'] }), teil('B5-1b', 'verletzt', { name: 'Erkennungsdistanz', staerke: 'weich', ist: '60 m' })]))
    expect(o).toMatchObject({ zustand: 'offen', zusatz: '1 Soll nicht erfüllt' })
    const k = grundKopf(grundpruefung(fall({ v85: null, beleuchtung: null })), { beleuchtung: 'Lampe 8 m (OSM), vor Ort prüfen' })
    expect(k.zeilen[1].zusatz).toBe('1 Annahme')
    expect(k.zeilen[1].hinweise).toEqual(['unter Vorbehalt: angenommen, dass nicht schneller als signalisiert gefahren wird'])
    // ④: Zeile nur die Frage, der Hinweis der Vorbelegung in den Details
    expect(k.zeilen[4]).toMatchObject({ zustand: 'offen', fragen: ['beleuchtung'], hinweise: ['Lampe 8 m (OSM), vor Ort prüfen'] })
    expect(k.zeilen[4].zusatz).toBeUndefined()
    const v = grundKopf(grundpruefung(fall({ vSig: 60, v85: 61 })))
    expect(v.zeilen[1].zustand).toBe('offen')
    expect(v.zeilen[1].satz).toContain('über 60 km/h')
  })
  it('Muss offen → ?, mit Fragen; Muss verletzt → ✗ (auch wenn die Soll-Regel erfüllt ist)', () => {
    const o = punktZeile(punkt([teil('B5-1', 'offen', { fehlend: ['sichtVorh'] }), teil('B5-1b', 'erfuellt')]))
    expect(o).toMatchObject({ zustand: 'offen', fragen: ['sichtVorh'] })
    expect(punktZeile(punkt([teil('B5-1', 'verletzt'), teil('B5-1b', 'erfuellt')])).zustand).toBe('verletzt')
  })
  it('Nutzertest 23.10.: ② Inseltiefe erfüllt, Durchfahrt nicht erfüllt → «!» mit dem Satz der Durchfahrt, Inseltiefe nicht in der Zeile', () => {
    const p2 = grundpruefung(fall({ insel: INSEL_OK, durchfahrt: [3.3, 3.5] })).punkte.find(p => p.nr === '2')!
    expect(p2.teile.map(t => [t.id, t.zustand])).toEqual([['B5-2b', 'erfuellt'], ['B5-2c', 'verletzt']])
    const z = punktZeile(p2)
    expect(z).toMatchObject({ zustand: 'soll',
      satz: 'Durchfahrt neben der Insel: je Seite 3,30 m und 3,50 m, Soll 3,50 m (3,45–3,75 m) oder mindestens 4,50 m' })
    expect(z.zusatz).toBeUndefined()
    // 3,47 m (Zieglerstrasse) liegt im Band: ② erfüllt
    expect(punktZeile(grundpruefung(fall({ insel: INSEL_OK, durchfahrt: [3.47, 3.5] })).punkte.find(p => p.nr === '2')!).zustand).toBe('erfuellt')
  })
  it('Annahmen je Punkt: nach den Feldern der Teilregeln; V85-Annahme beim Tempo; übrige für den Kasten', () => {
    const g = grundpruefung(fall({ v85: null }))
    const a = annahmenJePunkt({ ...g, annahmen: [...g.annahmen, 'beleuchtung: Annahme', 'Querungstyp offen: als Fussgängerstreifen ohne Lichtsignal geprüft'] })
    expect(a.je.get('T')).toContain('Tempo wie signalisiert (V85 nicht gemessen)')
    expect(a.je.get('4')).toEqual(['beleuchtung: Annahme'])
    expect(a.allgemein).toEqual(['Querungstyp offen: als Fussgängerstreifen ohne Lichtsignal geprüft'])
  })
  it('ohne Muss-Regel (② ohne gebaute Insel, ⑤): schlimmste Teilregel', () => {
    const p2 = grundpruefung(fall({ fahrbahnB: 9 })).punkte.find(p => p.nr === '2')!
    expect(punktZeile(p2).zustand).toBe('soll')
    const p5 = grundpruefung(fall({ fg5h: null, fgKlasse: null })).punkte.find(p => p.nr === '5')!
    expect(punktZeile(p5)).toMatchObject({ zustand: 'offen', fragen: ['fg5h'] })
    // gebaute Insel: Tiefe ist Muss
    const p2i = grundpruefung(fall({ insel: { ...INSEL_OK, breite: 1.4 } })).punkte.find(p => p.nr === '2')!
    expect(punktZeile(p2i).zustand).toBe('verletzt')
  })
  it('Kopf zählt die fünf Punkte (Tempo getrennt, Runde 5); Grundfall S0', () => {
    const k = grundKopf(grundpruefung(fall({})))
    expect(k.zeilen.length).toBe(6)
    expect(k.zaehlung).toBe('4 von 5 erfüllt · 1 Hinweis')
    expect(k.zeilen.map(z => z.satz)[0]).toBe('50 km/h signalisiert, V85 48 km/h')
    const ko = grundKopf(grundpruefung(fall({ v85: null, beleuchtung: null, anzeichenSchneller: true })))
    expect(ko.zeilen[0]).toMatchObject({ zustand: 'offen', fragen: ['v85'] })
    // Runde 5 (Stelle 16): ohne Antwort zu Anzeichen «voraussichtlich erfüllt» mit der Frage danach
    const kv = grundKopf(grundpruefung(fall({ v85: null, vSig: 30, anzeichenSchneller: null })))
    expect(kv.zeilen[0]).toMatchObject({ zustand: 'offen', wort: 'voraussichtlich erfüllt', fragen: ['anzeichenSchneller'] })
    expect(kv.zeilen[0].satz).toBe('signalisiert 30 km/h; V85 messen nur bei Verdacht auf schnelleres Fahren')
    expect(ko.zeilen[4]).toMatchObject({ zustand: 'offen', satz: '', fragen: ['beleuchtung'] })
  })
})

describe('Fragen je Feld (D2)', () => {
  it('Wächter: jedes Feld der Maske und jedes Objekt-Feld hat eine eigene Frage mit Fragezeichen; Sprungziel bekannt', () => {
    for (const d of FELD_DEFS) {
      expect(FRAGEN[d.pfad], d.pfad).toBeDefined()
      expect(FRAGEN[d.pfad], d.pfad).toMatch(/\?$/)
      expect(FRAGEN[d.pfad].length, d.pfad).toBeLessThanOrEqual(110)
      expect(FRAGEN[d.pfad].toLowerCase(), d.pfad).not.toContain('zebra')
      expect(feldZiel(d.pfad)).toBe(d.pfad)
    }
    for (const f of FELDNAMEN) { expect(frageVon(f), f).toMatch(/\?$/); expect(FRAGEN[f], f).toBeDefined() }
    expect(feldZiel('insel')).toBe('insel.vorhanden')
    expect(feldZiel('fgQuelle')).toBe('fg5h')
    expect(feldZiel('Zufahrten')).toBeNull()
    expect(frageVon('fg5h')).toBe('Wie viele Personen queren in den 5 Spitzenstunden (gezählt oder geschätzt)?')
    expect(frageVon('beleuchtung')).toBe('Ist die Querung nachts beleuchtet?')
    expect(frageVon('haltestelle.art')).toBe('Hält an der Querung ein Bus – auf der Fahrbahn oder in einer Bucht?')
    expect(frageVon('Zufahrten')).toMatch(/^Hinweis:/)
  })
  it('jedes fehlende Feld in allen Testfällen hat eine Frage; Zählung und Schätzung als eine Frage', () => {
    for (const t of TESTFAELLE) for (const x of beurteile(fall(t.abw), { ebenen: { bern: true, kantonBE: true } }).alle)
      for (const f of x.fehlend ?? []) expect(FRAGEN[f], `${t.regel} ${x.id} ${f}`).toBeDefined()
    expect(fragenFelder(['fg5h', 'fgKlasse', 'dtv', 'dtv'])).toEqual(['fg5h', 'dtv'])
  })
  it('Vorbehalt (Korrektur M3): auch still ausgewertete Regeln liefern Felder (Furt ohne Fahrbahnbreite bzw. Haltestelle); Trottoirüberfahrt ohne Angaben', () => {
    for (const [abw, feld] of [[{ typ: 'furt' as const, fahrbahnB: null }, 'fahrbahnB'], [{ typ: 'furt' as const, haltestelle: null }, 'haltestelle']] as const) {
      const b = beurteile(fall(abw))
      expect(b.empfehlung.vorlaeufig).toBe(true)
      expect(b.alle.some(x => b.empfehlung.offenWegen.includes(x.id))).toBe(false)   // still: kein Eintrag
      expect(vorbehaltFelder(b)).toContain(feld)
    }
    const t = beurteile(fall({ typ: 'trottoirueberfahrt', lage: 'einmuendung', q3: null }))
    expect(t.empfehlung.vorlaeufig).toBe(true)
    expect(vorbehaltFelder(t)).toEqual(['q3'])
    // jede vorläufige Empfehlung aller Testfälle nennt mindestens eine Angabe bzw. hat eine offene Zulässigkeit
    for (const tf of TESTFAELLE) for (const typ of [undefined, 'fgs', 'furt', 'trottoirueberfahrt', 'mehrzweck'] as const) {
      const b = beurteile(fall(typ === undefined ? tf.abw : { ...tf.abw, typ }))
      if (b.empfehlung.vorlaeufig) expect(vorbehaltFelder(b).length > 0 || b.zulaessigkeit === 'offen', `${tf.regel} ${tf.name} ${typ}`).toBe(true)
    }
  })
  it('Vorbehalt der Empfehlung: Felder der offenen Regeln statt Regelnummern', () => {
    const b = beurteile(fall({ tempoRegime: null }))
    expect(b.empfehlung.vorlaeufig).toBe(true)
    expect(vorbehaltFelder(b)).toContain('tempoRegime')
  })
})

describe('Ist/Soll mit Einheit', () => {
  it('kein «Soll –», kein «keine m»; jede Zahl mit Einheit bzw. Zählwort (alle Testfälle mit Ebenen)', () => {
    const EINHEIT = /\d(?:[\d,.]*)\s?(?:m\b|km\/h|s\b|%|°|mm|Pers\.|Fz\/Tag)|Fahrstreifen|je Richtung|Querende|DTV|Arm|Stufe|Klasse|Radius|Zufahrten|oder nein|^Ja/
    const fehler = new Set<string>()
    for (const t of TESTFAELLE) for (const x of beurteile(fall(t.abw), { ebenen: { bern: true, kantonBE: true } }).alle) {
      const s = istSoll(x)
      if (/Soll –|keine m\b/.test(eintragSatz(x))) fehler.add(`${x.id}: ${s}`)
      for (const teil of s.split('; ')) if (/\d/.test(teil) && !EINHEIT.test(teil.replace(/^(Ist|Soll) /, ''))) fehler.add(`${x.id}: ${teil}`)
    }
    expect([...fehler]).toEqual([])
  })
  it('Korrekturen: F7a mm am Wert, H3b ohne «(Soll) m», C1 und F6c mit km/h (G7 gestrichen 30.10.2026)', () => {
    const satz = (abw: Parameters<typeof fall>[0], id: string) => eintragSatz(beurteile(fall(abw)).alle.find(x => x.id === id)!)
    expect(satz({ randabschluss: { art: 'vertikal', hoeheMm: 60, breiteM: null } }, 'F7a')).toContain('Ist 60 mm vertikal; Soll 30 ± 5 mm')
    expect(satz({ erkennungM: 100 }, 'H3b')).toContain('Soll ≥ 110 m (doppelte Sichtweite)')
    expect(satz({ v85: 61, vSig: 60 }, 'C1')).toContain('Soll ≤ 60 km/h')
  })
})
