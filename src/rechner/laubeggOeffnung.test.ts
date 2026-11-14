// Nachtrag B, BK3 (Plan AV-Geometrie, 14.11.2026): Fussgängerstreifen OSM 275422258 an der Laubeggstrasse, derselbe Ausschnitt wie im
// VeloroutenCheck (testdaten/laubegg_275422258_osm.json und _av.json, Kopien von VeloroutenCheckWeb/src/testdaten, abgerufen am 14.11.2026;
// © OpenStreetMap-Mitwirkende, ODbL; AV Kanton Bern über geodienste.ch). Beide Fussweg-Öffnungen (11,3 bzw. 11,4 m) liegen in der
// Bordflucht: das Bordmodell verbindet sie als «Öffnung», beide äusseren Enden liegen 0,30 m vor dieser Flucht. Vorher 5,27 + 7,79 m
// (eine Seite aus dem OSM-Fussweg geklemmt, die andere am Rand in der Mündung). Soll fest in LV95 wie VeloroutenCheck fgsLaubeggEcht.test.tsx
// (Bordecken je Seite vor und nach der Öffnung).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dist, lv95, type P } from '../geo'
import { osmParsen } from '../daten/osm'
import { avParsen } from '../daten/av'
import { kontextBauen, rechneUebergang } from './index'
import { gequerterWeg } from './streifen'
import { achseAmWeg } from './bordquelle'
import { schnittBord } from '../kartenbaustein/bordmodell'

const lesen = (n: string) => JSON.parse(readFileSync(new URL(`../testdaten/${n}`, import.meta.url), 'utf8'))
const osm = osmParsen(lesen('laubegg_275422258_osm.json')), av = avParsen(lesen('laubegg_275422258_av.json'))
const k = kontextBauen(osm, av)
const r = rechneUebergang(osm, av, 275422258, k)
const BORDECKEN: [P, P][] = [[[2602250.64, 1199502.35], [2602243.49, 1199505.10]], [[2602239.80, 1199496.02], [2602230.94, 1199499.43]]]
const abstandGerade = (p: P, [a, b]: [P, P]) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / dist(a, b)

describe('BK3 Laubeggstrasse FGS 275422258 im fgsCheck (derselbe Ausschnitt wie im VeloroutenCheck)', () => {
  it('zwei Teilstreifen um die Insel, 3,57 + 3,44 m (vorher 5,27 + 7,79 m); beide Enden aus dem Bordmodell', () => {
    expect(r.streifen).toHaveLength(2)
    expect(r.streifen.map(s => dist(s.p0, s.p1))).toEqual([expect.closeTo(3.57, 1), expect.closeTo(3.44, 1)])
    for (const s of r.streifen) expect(s.annahmen.join(' | ')).toContain('Enden 0,3 m vor der AV-Bordkante (Bordmodell)')
  })
  it('die äusseren Enden liegen 0,30 m vor der Bordflucht über die Fussweg-Öffnung (Gerade durch die Bordecken, fest in LV95)', () => {
    const [a, b] = r.streifen
    expect(abstandGerade(a.p0, BORDECKEN[0])).toBeCloseTo(0.3, 1)
    expect(abstandGerade(b.p1, BORDECKEN[1])).toBeCloseTo(0.3, 1)
  })
  it('Bordmodell am gequerten Weg: beide Öffnungen «oeffnung», verbunden, Anschlusspunkte und Herkunft wie im VeloroutenCheck', () => {
    const u = osm.uebergaenge.find(x => x.id === 275422258)!, c = lv95(u.lat, u.lon)
    const gw = gequerterWeg({ nid: 275422258, p: c, tags: u.tags }, k.netz!)!
    const m = k.bord!.modell(achseAmWeg(k.netz!, gw.best.wid, gw.best.k, gw.best.q))!
    const o = m.abweichungen.filter(x => x.art === 'oeffnung')
    expect(o.map(x => [x.seite, x.verbunden, Math.round(dist(x.von!, x.bis!) * 10) / 10])).toEqual([['rechts', true, 11.3], ['links', true, 11.4]])
    expect(o.map(x => x.grund)).toEqual(['Bordflucht über die Öffnung 11,3 m (Richtung 2,4°, Versatz 0,25 m)', 'Bordflucht über die Öffnung 11,4 m (Richtung 0,0°, Versatz 0,00 m)'])
    for (const x of o) expect(schnittBord(m, x.seite, 'rand').ueberbrueckt.map(y => y.grund)).toContain(x.grund)
  })
})
