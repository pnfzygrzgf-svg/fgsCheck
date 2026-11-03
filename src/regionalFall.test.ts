import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { leererFall, fallSchreiben, fallLesen } from './fall'
import { regionalDienst } from './daten/anbieter/gemeinsam/regionalDienste'
import { regionalUrl } from './daten/anbieter/gemeinsam/regional'

it('erhält bekannte Regionaldaten und meldet einen unbekannten Teil beim Fallladen', () => {
  const f = leererFall(46.95, 7.44, 123), d = regionalDienst('e6.zh.licht')!
  const fixture = JSON.parse(readFileSync(new URL('./daten/anbieter/gemeinsam/testdaten/e6/zh.licht.json', import.meta.url), 'utf8'))
  f.regional = { version: 1, mitte: [2683000,1252000], radiusM: 200, teile: [{ id: d.id, url: regionalUrl(d, [2683000,1252000]), abgerufen: '2026-11-03T12:00:00Z', datenstand: 'unbekannt', objekte: [], roh: fixture.roh, meta: fixture.meta }] }
  const roh = JSON.parse(fallSchreiben(f))
  roh.regional.teile.push({ id: 'zukuenftig.unbekannt', roh: {} })
  const [g, hinweise] = fallLesen(JSON.stringify(roh))
  expect(g.regional?.teile.map(t => t.id)).toEqual([d.id])
  expect(g.regional?.teile[0].objekte).toHaveLength(15)
  expect(hinweise.join(' ')).toContain('zukuenftig.unbekannt')
})
