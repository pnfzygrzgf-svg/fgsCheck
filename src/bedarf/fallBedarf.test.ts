// Tests Bedarfsmodul E1: Block «bedarf» in der Fall-Datei (Version 1/2/3, tiefe Prüfung), Bildung der Eingaben aus Vorbelegung
// und Handeingaben, Felder der Maske, Durchfahrt neben der Insel (F3/F3-B) und harte Untergrenze im Werkzeug «Mittelinsel».
import { describe, expect, it } from 'vitest'
import { wgs } from '../geo'
import { leererFall, fallLesen, fallSchreiben, fallVersion, eingabenSchluessel, eingabenZahl, hatEingaben, rechnungsSchluessel,
  vonHandAusFall, FALL_VERSION, type Fall } from '../fall'
import { bedarfLesen, eingabenBilden, handSetzen, handPruefen, ebeneSetzen, ebenenWirksam, ebenenVorgabe, bedarfLeer, type Vorbelegung } from './fallBedarf'
import { FELD_DEFS, FELD_DEF, OBJEKTE, unterfelder, wertGueltig, gruppeVon, feldName } from './felder'
import { FELDNAMEN } from './eingaben'
import { durchfahrtHinweise, f3Klasse } from './durchfahrt'
import { masseFehler, inselMasse, INSEL_TIEFE_MIN_M } from '../rechner/standardinsel'
import { INSEL_KEINE, INSEL_OK, S0, fall } from './testfaelle'
import { beurteile } from './entscheid'

const O = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const fallMit = (f: (x: Fall) => void = () => {}): Fall => { const x = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12); f(x); return x }
const NASE = { id: 'plan-1', art: 'trottoir' as const, ring: [[O[0], O[1]], [O[0] + 2, O[1]], [O[0] + 2, O[1] + 2]] as [number, number][] }

describe('Felder der Maske', () => {
  it('jedes Feld der Eingaben hat eine Zeile bzw. seine Unterfelder (ausser dem abgeleiteten fgQuelle); Unterfelder wie im Typ', () => {
    for (const f of FELDNAMEN) {
      if (f === 'fgQuelle') continue
      if (f in OBJEKTE) expect(unterfelder(f as keyof typeof OBJEKTE).length, f).toBeGreaterThan(0)
      else expect(FELD_DEF.has(f), f).toBe(true)
    }
    expect(unterfelder('insel').sort()).toEqual(Object.keys(INSEL_KEINE).sort())
    expect(unterfelder('haltestelle').sort()).toEqual(Object.keys(S0.haltestelle).sort())
    expect(unterfelder('hvl').sort()).toEqual(Object.keys(S0.hvl).sort())
    expect(unterfelder('fusswegAchse').sort()).toEqual(Object.keys(S0.fusswegAchse).sort())
    expect(unterfelder('randabschluss').sort()).toEqual(Object.keys(S0.randabschluss).sort())
    expect(unterfelder('kurve').sort()).toEqual(Object.keys(S0.kurve).sort())
    expect(unterfelder('lsaZeiten').sort()).toEqual(Object.keys(S0.lsaZeiten).sort())
    expect(unterfelder('q3').sort()).toEqual(Object.keys(S0.q3).sort())
    expect(new Set(FELD_DEFS.map(d => d.pfad)).size).toBe(FELD_DEFS.length)
  })
  it('Gruppen und Beschriftungen; Werte prüfen nach Art und Bereich', () => {
    expect(gruppeVon('insel.breite')).toBe('insel'); expect(gruppeVon('insel')).toBe('insel'); expect(gruppeVon('dtv')).toBe('verkehr')
    expect(feldName('q3')).toBe('Trottoirüberfahrt')
    expect(wertGueltig(FELD_DEF.get('dtv')!.art, 8000)).toBe(true)
    expect(wertGueltig(FELD_DEF.get('dtv')!.art, -1)).toBe(false)
    expect(wertGueltig(FELD_DEF.get('insel.kopfUeberstand')!.art, [1, 1])).toBe(true)
    expect(wertGueltig(FELD_DEF.get('insel.kopfUeberstand')!.art, [1])).toBe(false)
    expect(wertGueltig(FELD_DEF.get('beduerfnis')!.art, ['schule', 'schule'])).toBe(false)
    expect(wertGueltig(FELD_DEF.get('beduerfnis')!.art, [])).toBe(true)
    expect(wertGueltig(FELD_DEF.get('lage')!.art, 'irgendwo')).toBe(false)
  })
})

describe('Fall-Datei mit Bedarf (Version 1, 2, 3)', () => {
  const mitBedarf = fallMit(x => {
    x.bedarf = { felder: { dtv: { wert: 8000, quelle: 'hand' }, fgKlasse: { wert: '100-500', quelle: 'schaetzung' },
      'insel.breite': { wert: 1.8, quelle: 'hand' }, beduerfnis: { wert: [], quelle: 'hand' } }, ebenen: { bern: true } }
  })
  it('Version 1 ohne alles, 2 mit Flächen (Plan), 3 mit Bedarf bzw. Querung ohne Vortritt; leerer Block wird nicht geschrieben', () => {
    expect(FALL_VERSION).toBe(4)
    expect(JSON.parse(fallSchreiben(fallMit())).version).toBe(1)
    expect(JSON.parse(fallSchreiben(fallMit(x => { x.flaechenPlan = [NASE] }))).version).toBe(2)
    expect(JSON.parse(fallSchreiben(mitBedarf)).version).toBe(3)
    expect(JSON.parse(fallSchreiben(fallMit(x => { x.streifen['1'] = { typ: 'furt' } }))).version).toBe(3)
    expect(fallVersion(fallMit(x => { x.streifen['1'] = { lsa: 'ja', keinFgs: true } }))).toBe(1)
    const leer = fallMit(x => { x.bedarf = { felder: {} } })
    const t = JSON.parse(fallSchreiben(leer))
    expect(t.version).toBe(1); expect(t.bedarf).toBeUndefined()
  })
  it('Version 3 speichern und laden ergibt denselben Fall; Version 1 und 2 bleiben lesbar; Version 5 abgelehnt', () => {
    const [g, h] = fallLesen(fallSchreiben(mitBedarf))
    expect(h).toEqual([])
    expect({ ...g, gespeichert: undefined }).toEqual({ ...mitBedarf, gespeichert: undefined })
    const v1 = JSON.parse(fallSchreiben(fallMit(x => { x.streifen['1'] = { lsa: 'nein' } })))
    expect(fallLesen(JSON.stringify(v1))[0].streifen).toEqual({ '1': { lsa: 'nein' } })
    const v2 = JSON.parse(fallSchreiben(fallMit(x => { x.flaechenPlan = [NASE] })))
    expect(fallLesen(JSON.stringify(v2))[0].flaechenPlan).toEqual([NASE])
    expect(() => fallLesen(JSON.stringify({ ...v1, version: 5 }))).toThrow('Fall-Datei Version 5 wird nicht unterstützt')
  })
  it('tief geprüft: ungültige Werte, Unterfelder, Quellen, unbekannte Pfade und Ebenen werden gemeldet und übergangen', () => {
    const roh = JSON.parse(fallSchreiben(mitBedarf))
    roh.bedarf = {
      felder: {
        dtv: { wert: 'viel', quelle: 'hand' },                 // keine Zahl
        'insel.breite': { wert: 1.8, quelle: 'hand' },        // gültig
        'insel.art': { wert: 'rund', quelle: 'hand' },        // keine Auswahl
        'insel.kopfUeberstand': { wert: [0.5], quelle: 'hand' }, // zwei Werte nötig
        nRichtung: { wert: [0, 1], quelle: 'hand' },         // ausserhalb 1 bis 6
        'haltestelle.lage': { wert: 'im_bereich', quelle: 'irgendwer' }, // Quelle ungültig
        'q3.winkel': { wert: 200, quelle: 'hand' },           // ausserhalb 0 bis 180
        insel: { wert: { vorhanden: true }, quelle: 'hand' }, // ganzes Objekt: nur je Unterfeld
        fgQuelle: { wert: 'zaehlung', quelle: 'hand' },       // abgeleitet
        beduerfnis: { wert: ['schule', 'kino'], quelle: 'hand' },
        netz: { wert: 'basisnetz', quelle: 'hand', notiz: 'x' }, // gültig, Zusatzschlüssel gemeldet
        typ: { wert: null, quelle: null },                    // offen: still übergangen
      },
      ebenen: { bern: 'ja', mond: true, kantonBE: false },
      extra: 1,
    }
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(g.bedarf).toEqual({ felder: { 'insel.breite': { wert: 1.8, quelle: 'hand' }, netz: { wert: 'basisnetz', quelle: 'hand' } },
      ebenen: { kantonBE: false } })
    for (const t of ['«dtv»', '«insel.art»', '«insel.kopfUeberstand»', '«nRichtung»', '«haltestelle.lage»: Quelle', '«q3.winkel»',
      'Bedarf-Feld «insel» unbekannt', 'Bedarf-Feld «fgQuelle» unbekannt', '«beduerfnis»', '«netz»: Schlüssel «notiz»', 'Ebene «bern» ungültig',
      'Ebene «mond» unbekannt', 'Schlüssel «extra» unbekannt'])
      expect(h.some(x => x.includes(t)), t).toBe(true)
    expect(h.length).toBe(13)
    const [, h2] = bedarfLesen('kaputt'); expect(h2).toEqual(['Bedarf ungültig (kein Objekt), übergangen'])
    const [b3, h3] = bedarfLesen({ felder: [] }); expect(b3).toBeNull(); expect(h3[0]).toContain('Felder ungültig')
  })
  it('Streifen-Eingabe: Querungstyp geprüft; «kein FGS» geht vor', () => {
    const roh = JSON.parse(fallSchreiben(fallMit()))
    roh.version = 3
    roh.streifen = { a: { typ: 'furt' }, b: { typ: 'tunnel' }, c: { keinFgs: true, typ: 'furt' } }
    const [g, h] = fallLesen(JSON.stringify(roh))
    expect(g.streifen).toEqual({ a: { typ: 'furt' }, c: { keinFgs: true } })
    expect(h).toEqual(['Streifen-Eingabe b: Querungstyp ungültig, übergangen',
      'Streifen-Eingabe c: «kein FGS» und Querung ohne Vortritt zugleich – «kein FGS» gilt, Querungstyp übergangen'])
    expect(vonHandAusFall(g).querung!('a')).toEqual({ typ: 'furt', inselMarkiert: false })
    expect(vonHandAusFall(g).querung!('c')).toBeNull()
  })
  it('Eingaben zählen mit (merken, gesichert); Rechnungsschlüssel ohne Bedarf ausser «Insel nur markiert»', () => {
    const ohne = fallMit()
    expect(hatEingaben(ohne)).toBe(false)
    expect(hatEingaben(fallMit(x => { x.bedarf = { felder: { dtv: { wert: 1, quelle: 'hand' } } } }))).toBe(true)
    expect(eingabenZahl(mitBedarf)).toBe(5)
    expect(eingabenSchluessel(mitBedarf)).not.toBe(eingabenSchluessel(ohne))
    expect(eingabenSchluessel(fallMit(x => { x.bedarf = { felder: {} } }))).toBe(eingabenSchluessel(ohne))
    expect(rechnungsSchluessel(mitBedarf)).toBe(rechnungsSchluessel(ohne))
    const markiert = fallMit(x => { x.bedarf = { felder: { 'insel.art': { wert: 'markiert', quelle: 'hand' } } } })
    expect(rechnungsSchluessel(markiert)).not.toBe(rechnungsSchluessel(ohne))
  })
})

describe('Alte Fall-Datei ohne «Velos queren mit» (veloQuerung, 23.10.2026)', () => {
  it('liest ohne Hinweis; Feld offen; Inseltiefe für querende Velos (Kanton BE) offen bei gebauter Insel, nicht mehr nach dem Radstreifen', () => {
    const alt = { felder: { radstreifen: { wert: true, quelle: 'hand' }, 'insel.vorhanden': { wert: true, quelle: 'hand' },
      'insel.art': { wert: 'baulich', quelle: 'hand' }, 'insel.breite': { wert: 1.8, quelle: 'hand' } } }
    const [blk, h] = bedarfLesen(alt)
    expect(h).toEqual([])
    const e = eingabenBilden({}, blk).eingaben
    expect(e.veloQuerung).toEqual({ wert: null, quelle: null })
    const f = fall({ radstreifen: true, insel: { ...INSEL_OK, breite: 1.8 } })
    f.veloQuerung = e.veloQuerung
    expect(beurteile(f, { ebenen: { kantonBE: true } }).alle.find(x => x.id === 'F2-K')).toMatchObject({ zustand: 'offen', fehlend: ['veloQuerung'] })
  })
})

describe('Eingaben bilden: Vorbelegung, Hand, Objekte', () => {
  const vor: Vorbelegung = {
    vSig: { wert: 50, quelle: 'osm', text: 'OSM' },
    fahrbahnB: { wert: 7.4, quelle: 'rechnung', text: 'Bordkanten' },
    'insel.vorhanden': { wert: true, quelle: 'av', text: 'AV-Insel' },
    'insel.breite': { wert: 2.1, quelle: 'av', text: 'Lücke' },
    'kurve.fuenfBedingungen': { wert: false, quelle: 'annahme', text: 'Tab. 1' },
  }
  it('Hand überschreibt Vorbelegung je Feld bzw. Unterfeld; Quelle des Objekts von Hand, sobald ein Unterfeld von Hand kommt', () => {
    const b = { felder: { vSig: { wert: 30, quelle: 'hand' as const }, 'insel.art': { wert: 'markiert', quelle: 'hand' as const } } }
    const g = eingabenBilden(vor, b)
    expect(g.eingaben.vSig).toEqual({ wert: 30, quelle: 'hand' })
    expect(g.eingaben.fahrbahnB).toEqual({ wert: 7.4, quelle: 'rechnung' })
    expect(g.eingaben.insel).toEqual({ wert: { ...INSEL_KEINE, vorhanden: true, art: 'markiert', breite: 2.1 }, quelle: 'hand' })
    expect(g.eingaben.kurve).toEqual({ wert: { radius: null, fuenfBedingungen: false }, quelle: 'annahme' })
    expect(g.eingaben.dtv).toEqual({ wert: null, quelle: null })
    expect(g.herkunft.get('vSig')).toMatchObject({ zustand: 'hand', quelle: 'hand', wert: 30 })
    expect(g.herkunft.get('fahrbahnB')).toMatchObject({ zustand: 'vorbelegt', text: 'Bordkanten' })
    expect(g.herkunft.get('dtv')).toMatchObject({ zustand: 'offen' })
  })
  it('ohne Insel: übrige Unterfelder null; Haltestelle «keine»: alles null; Pflicht-Unterfeld fehlt: offen mit Hinweis', () => {
    const g = eingabenBilden(vor, { felder: { 'insel.vorhanden': { wert: false, quelle: 'hand' }, 'haltestelle.art': { wert: 'keine', quelle: 'hand' },
      'haltestelle.verdeckt': { wert: true, quelle: 'hand' }, 'hvl.laengeM': { wert: 8, quelle: 'hand' } } })
    expect(g.eingaben.insel.wert).toEqual(INSEL_KEINE)
    expect(g.eingaben.haltestelle.wert).toEqual({ art: null, lage: null, verdeckt: null, ueberholenUnterbunden: null })
    expect(g.eingaben.hvl.wert).toBeNull()
    expect(g.hinweise).toEqual(['Halteverbotslinie: bitte zuerst «Halteverbotslinie» angeben; bis dahin bleiben die übrigen Angaben dazu offen'])
  })
  it('Fussgänger: Zählung vor Schätzklasse (Quelle Schätzung); Anrampung als Paar; Liste «keines»', () => {
    const k = eingabenBilden({}, { felder: { fgKlasse: { wert: '<100', quelle: 'schaetzung' }, 'q3.anrampung': { wert: [12, 0.8], quelle: 'hand' },
      beduerfnis: { wert: [], quelle: 'hand' } } })
    expect(k.eingaben.fgQuelle).toEqual({ wert: 'schaetzung', quelle: 'schaetzung' })
    expect((k.eingaben.q3.wert as { anrampung: unknown }).anrampung).toEqual({ neigung: 12, laenge: 0.8 })
    expect(k.eingaben.beduerfnis.wert).toEqual([])
    const z = eingabenBilden({}, { felder: { fgKlasse: { wert: '<100', quelle: 'schaetzung' }, fg5h: { wert: 140, quelle: 'hand' } } })
    expect(z.eingaben.fgQuelle).toEqual({ wert: 'zaehlung', quelle: 'hand' })
  })
  it('Maske: ungültige Werte abgelehnt (handPruefen, handSetzen ändert nichts), mit erlaubtem Bereich', () => {
    for (const [pfad, wert, text] of [['vSig', 500, 'erlaubt 5 bis 120 km/h'], ['fahrbahnB', -3, 'erlaubt 0 bis 60 m'],
      ['achsWinkel', 120, 'erlaubt 0 bis 90 °'], ['nRichtung', [0, 2], 'je 1 bis 6'], ['insel.kopfUeberstand', [1], 'erlaubt 2 Werte mit / getrennt']] as const) {
      expect(handPruefen(pfad, wert), pfad).toContain(text)
      const b = { felder: { dtv: { wert: 1000, quelle: 'hand' as const } } }
      expect(handSetzen(b, pfad, wert, 'hand'), pfad).toBe(b)
    }
    expect(handPruefen('vSig', 50)).toBeNull(); expect(handPruefen('vSig', null)).toBeNull()
    expect(handPruefen('vSig', 50, 'osm')).toContain('Quelle ungültig')
    const [b, h] = bedarfLesen({ felder: { vSig: { wert: 50, quelle: 'osm' } } })
    expect(b).toBeNull(); expect(h[0]).toContain('Quelle "osm" ungültig')
  })
  it('Handeingabe setzen, entfernen, Ebenen schalten; leerer Block verschwindet', () => {
    let b = handSetzen(undefined, 'dtv', 8000, 'hand')
    expect(b).toEqual({ felder: { dtv: { wert: 8000, quelle: 'hand' } } })
    b = ebeneSetzen(b, 'bern', false)
    expect(b!.ebenen).toEqual({ bern: false })
    b = handSetzen(b, 'dtv', null, 'hand')
    expect(b).toEqual({ felder: {}, ebenen: { bern: false } })
    expect(ebeneSetzen(b, 'bern', null)).toBeUndefined()
    expect(bedarfLeer(undefined)).toBe(true)
  })
  it('Ebenen: Vorgabe nach BFS bzw. Kanton der AV (Stadt Bern 351), von Hand übersteuert; Richtlinie an', () => {
    expect(ebenenVorgabe([351], ['BE'])).toEqual({ bern: true, kantonBE: true })
    expect(ebenenVorgabe([356], ['BE'])).toEqual({ bern: false, kantonBE: true })
    expect(ebenenVorgabe([261], ['ZH'])).toEqual({ bern: false, kantonBE: false })
    expect(ebenenWirksam({ felder: {}, ebenen: { bern: false } }, { bern: true, kantonBE: true })).toEqual({ bern: false, kantonBE: true, richtlinie: true })
  })
})

describe('Durchfahrt neben der Insel (F3, F3-B) und Untergrenze der Inseltiefe im Werkzeug', () => {
  it('Bänder nach F3: zu schmal, knapp, Konfliktband, Idealbereich', () => {
    expect([3.44, 3.45, 3.49, 3.5, 3.6, 3.75, 3.76, 4.24, 4.25, 4.5].map(f3Klasse)).toEqual(['schmal', 'schmal', 'schmal', 'knapp', null, null, 'band', 'band', 'knapp', null])
    // zu schmal unter 3,50 m wie die Arbeitshilfe (Nutzerentscheid 23.10.2026); 3,49 zu schmal, 3,50 nur unter dem Idealmass
    expect(durchfahrtHinweise([3.49, 3.6])[0]).toBe('Durchfahrt neben der Insel 3,49 m (Seite Ende A): unter 3,50 m, zu schmal (F3, Arbeitshilfe Kanton BE).')
    expect(durchfahrtHinweise([3.44, 3.6])[0]).toBe('Durchfahrt neben der Insel 3,44 m (Seite Ende A): unter 3,50 m, zu schmal (F3, Arbeitshilfe Kanton BE).')
    expect(durchfahrtHinweise([3.6, 4.6])).toEqual([])
    const h = durchfahrtHinweise([4.0, 3.6], { radstreifen: true })
    expect(h[0]).toBe('Durchfahrt neben der Insel 4,00 m (Seite Ende A): zwischen 3,75 und 4,25 m überholen Lastwagen Velos zu knapp (F3, Arbeitshilfe Kanton BE).')
    expect(h[1]).toContain('Mit Radstreifen: Durchfahrt 4,00 m (Seite Ende A) unter 4,50 m (F3-B')
    expect(h[2]).toContain('Mit Radstreifen: Durchfahrt 3,60 m (Seite Ende B) unter 4,50 m')
    expect(h[3]).toContain('keine VSS-Norm nennt Durchfahrtsmasse')
  })
  it('Mittelinsel: Tiefe unter 1,50 m abgelehnt (F2), 1,50 m zulässig (mit Hinweis «unter 2,00 m»)', () => {
    expect(INSEL_TIEFE_MIN_M).toBe(1.5)
    expect(masseFehler(inselMasse(1.49, 4, 1.2, null, 'links'))).toContain('Inseltiefe 1,49 m unter 1,50 m: zu schmal für eine Schutzinsel (F2')
    expect(masseFehler(inselMasse(1.5, 4, 1.2, null, 'links'))).toBeNull()
  })
})
