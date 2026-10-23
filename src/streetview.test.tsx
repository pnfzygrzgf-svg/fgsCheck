import { describe, expect, it } from 'vitest'
import { lv95, type P } from './geo'
import { renderToStaticMarkup } from 'react-dom/server'
import { peilung, streetViewUrl, streifenStreetView, zufahrtStreetView, zufahrtStreetViewTitel } from './streetview'
import { GrundpruefungAnzeige } from './BedarfPanel'
import { grundpruefung } from './bedarf/grundpruefung'
import { fall } from './bedarf/testfaelle'

describe('Street View als Link', () => {
  it('Format: Maps URL mit 6 Nachkommastellen, heading gerundet 0–359, ohne heading ohne Parameter', () => {
    expect(streetViewUrl(46.9480001234, 7.4474, 90.4)).toBe('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=46.948000,7.447400&heading=90')
    expect(streetViewUrl(46.948, 7.4474, 359.6)).toMatch(/&heading=0$/)
    expect(streetViewUrl(46.948, 7.4474, -10)).toMatch(/&heading=350$/)
    expect(streetViewUrl(46.948, 7.4474)).not.toContain('heading')
    expect(streetViewUrl(46.948, 7.4474, null)).not.toContain('heading')
  })
  it('Peilung in LV95: Norden 0°, Osten 90°, Süden 180°, Westen 270°', () => {
    const o: P = [2600000, 1200000]
    expect(peilung(o, [o[0], o[1] + 10])).toBeCloseTo(0)
    expect(peilung(o, [o[0] + 10, o[1]])).toBeCloseTo(90)
    expect(peilung(o, [o[0], o[1] - 10])).toBeCloseTo(180)
    expect(peilung(o, [o[0] - 10, o[1]])).toBeCloseTo(270)
  })
  it('je Zufahrt vom fernsten Sichtpunkt mit Blick auf die Streifenmitte; Streifen entlang der Achse', () => {
    const m = lv95(46.948, 7.4474)
    const z = { sichtpunkte: [[m[0] - 10, m[1]], [m[0] - 50, m[1]]] as P[] }
    expect(zufahrtStreetView(z, { m })).toMatch(/&heading=90$/)
    expect(zufahrtStreetView({ sichtpunkte: [] }, { m })).toBeNull()
    expect(streifenStreetView({ m, p0: [m[0], m[1] - 5], p1: [m[0], m[1] + 5] })).toMatch(/viewpoint=46\.948000,7\.447400&heading=0$/)
  })
  it('Bedarf: Links je Zufahrt in den Details von ① (Panel, neues Fenster), nicht im Bericht', () => {
    const g = grundpruefung(fall({}))
    const links = [{ name: '1 Hauptstrasse von Westen', url: streetViewUrl(46.948, 7.4474, 90), titel: zufahrtStreetViewTitel('1') }]
    // Details sind im Panel zugeklappt: die Links stehen im Bericht nicht, im Panel erst nach dem Aufklappen (Details von ①)
    expect(renderToStaticMarkup(<GrundpruefungAnzeige g={g} druck sichtLinks={links} />)).not.toContain('google.com')
    expect(zufahrtStreetViewTitel('2')).toBe('Google Street View: Blick der Fahrenden aus Zufahrt 2 auf die Wartefläche – Hecken, Mauern, ' +
      'Parkierung prüfen (öffnet Google Maps)')
  })
})
