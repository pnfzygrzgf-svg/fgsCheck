import { describe, expect, it } from 'vitest'
import { ohneHtml, ortLesen, ortsTreffer, ortZoom, zusatzLesbar, eingabeFolge, antwortAktuell } from './ortssuche'

// Labels wie in den Antworten des SearchServer (geprüft 11.10.2026)
describe('Ortssuche: Labels bereinigen', () => {
  it('entfernt Tags, löst Entitäten auf und fasst Leerraum zusammen', () => {
    expect(ohneHtml('<b>Bern\n</b> (BE)')).toBe('Bern (BE)')
    expect(ohneHtml('A &amp; B &#252;ber &#xE4; &quot;x&quot;')).toBe('A & B über ä "x"')
    expect(ohneHtml('<img src=x onerror=alert(1)>Ort')).toBe('Ort')
    expect(ohneHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('scriptalert(1)/script')
  })
  it('Adresse, Strasse (#), Gemeinde, PLZ und Ortsname', () => {
    expect(ortLesen('address', 'Mühlemattstrasse 31 <b>3007 Bern</b>'))
      .toEqual({ text: 'Mühlemattstrasse 31, 3007 Bern', art: 'adresse', zusatz: 'Adresse' })
    expect(ortLesen('address', 'Mühlemattstrasse # <b>4112 Bättwil</b>'))
      .toEqual({ text: 'Mühlemattstrasse, 4112 Bättwil', art: 'strasse', zusatz: 'Strasse' })
    expect(ortLesen('gg25', '<b>Thun (BE)</b>')).toEqual({ text: 'Thun (BE)', art: 'gemeinde', zusatz: 'Gemeinde' })
    expect(ortLesen('gg25', '<b>Vaduz ()</b>')).toEqual({ text: 'Vaduz', art: 'gemeinde', zusatz: 'Gemeinde' })
    expect(ortLesen('zipcode', '<b>3011 - Bern</b>')).toEqual({ text: '3011 – Bern', art: 'plz', zusatz: 'PLZ' })
    expect(ortLesen('gazetteer', '<i>Ort</i> <b>Schaan</b> () - Schaan')).toEqual({ text: 'Schaan – Schaan', art: 'ort', zusatz: 'Ort' })
    expect(ortLesen('gazetteer', '<b>Thun</b> (BE) - Heimberg,Thierachern'))
      .toEqual({ text: 'Thun (BE) – Heimberg, Thierachern', art: 'ort', zusatz: 'Ort' })
    expect(ortLesen('gazetteer', '')).toBeNull()
    expect(ortLesen('gazetteer', '<i>Gebaeude</i> <b>Bundeshaus</b> (BE) - Bern'))
      .toEqual({ text: 'Bundeshaus (BE) – Bern', art: 'ort', zusatz: 'Gebäude' })
  })
  it('Objektart lesbar (Umlaute, ohne «swisstopo»), übrige unverändert', () => {
    expect(zusatzLesbar('Fliessgewaesser')).toBe('Fliessgewässer')
    expect(zusatzLesbar('Haupthuegel')).toBe('Haupthügel')
    expect(zusatzLesbar('Oeffentliches Parkareal')).toBe('Öffentliches Parkareal')
    expect(zusatzLesbar('Flurname swisstopo')).toBe('Flurname')
    expect(zusatzLesbar('Quartierteil')).toBe('Quartierteil')
  })
  it('Treffer: ohne Doppel, nur mit Koordinaten', () => {
    const t = ortsTreffer({ results: [
      { attrs: { origin: 'gazetteer', label: '<b>Bern</b> (BE) - Bern', lat: 46.95, lon: 7.44 } },
      { attrs: { origin: 'gazetteer', label: '<b>Bern\n</b> (BE) - Bern', lat: 46.95, lon: 7.44 } },
      { attrs: { origin: 'gg25', label: '<b>Bern (BE)</b>' } },
      { attrs: { origin: 'gg25', label: '<b>Bern (BE)</b>', lat: 46.95, lon: 7.42 } },
    ] })
    expect(t.map(o => [o.art, o.text])).toEqual([['ort', 'Bern (BE) – Bern'], ['gemeinde', 'Bern (BE)']])
    expect(ortsTreffer({})).toEqual([])
  })
})

describe('Ortssuche: Zoom je Art', () => {
  it('Adresse am nächsten, Gemeinde und PLZ an der Grenze der Übergangssuche (16)', () => {
    expect(ortZoom('adresse')).toBe(19)
    expect(ortZoom('strasse')).toBe(18)
    expect(ortZoom('ort')).toBe(17)
    expect(ortZoom('gemeinde')).toBe(16)
    expect(ortZoom('plz')).toBe(16)
  })
})

describe('Ortssuche: Eingabe und späte Antworten (Korrektur 13.10.2026)', () => {
  it('jede neue Eingabe verwirft die alten Treffer; nur der eben gewählte Text löst nichts aus', () => {
    expect(eingabeFolge('Bern', '', 3)).toBe('suchen')
    expect(eingabeFolge('Be', '', 3)).toBe('leeren')
    expect(eingabeFolge('', '', 3)).toBe('leeren')                       // Feld geleert: alte Treffer weg (vorher blieben sie)
    expect(eingabeFolge('Thun (BE)', 'Thun (BE)', 3)).toBe('nichts')     // durch Auswahl gesetzt
    expect(eingabeFolge('Thun (BE', 'Thun (BE)', 3)).toBe('suchen')
    expect(eingabeFolge('  ', 'Thun (BE)', 3)).toBe('leeren')
  })
  it('eine Antwort gilt nur zum aktuellen Text', () => {
    expect(antwortAktuell('Bern', ' Bern ')).toBe(true)
    expect(antwortAktuell('Bern', 'Berne')).toBe(false)
    expect(antwortAktuell('Bern', '')).toBe(false)
  })
})
