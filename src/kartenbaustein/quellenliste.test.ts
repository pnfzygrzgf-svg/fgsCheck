import { describe, expect, it } from 'vitest'
import { hostsVon, offeneEntscheide, QUELLENLISTE, type Rechner } from './quellenliste'

const paket = Object.values(import.meta.glob('/package.json', { import: 'name', eager: true }))[0] as string
const RECHNER: Rechner = /sichtweiten/i.test(paket) ? 'swc' : /velorouten/i.test(paket) ? 'vrc' : /knoten/i.test(paket) ? 'kc' : 'fgs'
const code = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/kartenbaustein/**', '!/src/**/testdaten/**', '!/src/knotensicht/**', '!/src/knotenkern/daten/anbieter/gemeinsam/**', '!/src/e5/daten/anbieter/gemeinsam/bedarfOrte.ts', '!/src/e5/daten/anbieter/gemeinsam/regionalDienste.ts', '!/src/daten/anbieter/gemeinsam/bedarfOrte.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
/** Nur Links zum Nachlesen, Lizenzen und Bedienung: keine Dienste, von denen ein Rechner Daten holt */
const NUR_LINK = /(^|\.)(github\.com|gitlab\.ethz\.ch|ko-fi\.com|creativecommons\.org|opensource\.org|gnu\.org|w3\.org|doi\.org|goatcounter\.com|zgo\.at|fgscheck\.ch|sichtweitencheck\.ch|veloroutencheck\.ch|knotencheck\.ch|openstreetmap\.org|google\.com|streetmix\.net|radwege-check\.de|bfu\.ch|fedlex\.admin\.ch|bvd\.be\.ch|verkehrsclub\.ch|swisstopo\.admin\.ch|astra\.admin\.ch|llv\.li|hindernisfreie-architektur\.ch|stadtluzern\.ch|stadt-zuerich\.ch|bern\.ch|bs\.ch|so\.ch|lu\.ch|sitg\.ge\.ch|opentransportdata\.swiss|portal\.openbikesensor\.org|map\.geo\.admin\.ch|localhost)$/

describe('Quellenliste', () => {
  it('hat eindeutige Kennungen und gültige Stufen', () => {
    expect(new Set(QUELLENLISTE.map(q => q.id)).size).toBe(QUELLENLISTE.length)
    for (const q of QUELLENLISTE) for (const r of Object.values(q.rechner)) for (const s of [r.ist, r.soll]) expect('RBAH–').toContain(s)
  })
  it('nennt jeden Dienst, den dieser Rechner nutzt', () => {
    const erlaubt = hostsVon(RECHNER), fehlt = new Set<string>()
    for (const text of Object.values(code)) for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
      const host = m[1].toLowerCase().replace(/^\{s\}\./, '')
      if (!erlaubt.has(host) && !NUR_LINK.test(host)) fehlt.add(host)
    }
    expect([...fehlt].sort()).toEqual([])
  })
  it('liefert die offenen Entscheide', () => {
    expect(offeneEntscheide(RECHNER).every(q => q.rechner[RECHNER].ist !== q.rechner[RECHNER].soll)).toBe(true)
  })
})
