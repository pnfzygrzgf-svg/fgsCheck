// Tests 3D-Ansicht, Kunstbauten der Stadt Bern (kunstbauten.ts): Shape-Puffer lesen, Entpacken, Dreiecke, Abfrage
import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { aufGrundriss, bauHoehe, bauHoehen, dreiecke, entpacken, grenzenLv95, grundriss, inBern, kunstbautenLesen, kunstbautenUrl, multipatchLesen, LN02_ZU_SZENE_M } from './kunstbauten'

/** Shape-Puffer (MultiPatch, Typ 54 mit z-Kennzeichen) aus Teilen mit Typ und Punkten */
function shape(teile: { typ: number; punkte: [number, number, number][] }[]): Uint8Array {
  const pts = teile.flatMap(t => t.punkte), nT = teile.length, nP = pts.length
  const b = new DataView(new ArrayBuffer(44 + 8 * nT + 16 * nP + 16 + 8 * nP))
  b.setUint32(0, 0x80000036, true)
  b.setInt32(36, nT, true); b.setInt32(40, nP, true)
  let o = 44, start = 0
  for (const t of teile) { b.setInt32(o, start, true); o += 4; start += t.punkte.length }
  for (const t of teile) { b.setInt32(o, t.typ, true); o += 4 }
  for (const p of pts) { b.setFloat64(o, p[0], true); b.setFloat64(o + 8, p[1], true); o += 16 }
  o += 16
  for (const p of pts) { b.setFloat64(o, p[2], true); o += 8 }
  return new Uint8Array(b.buffer)
}
/** wie der Dienst: 12 Byte Kopf, dann zlib, als Base64 */
function gepackt(roh: Uint8Array): string {
  const z = deflateSync(roh), kopf = new DataView(new ArrayBuffer(12))
  kopf.setUint32(0, 0x80800036, true); kopf.setUint32(4, roh.length, true); kopf.setInt32(8, z.length, true)
  return Buffer.concat([Buffer.from(kopf.buffer), z]).toString('base64')
}
const dreieck: [number, number, number][] = [[2601500, 1199800, 504], [2601510, 1199800, 504.5], [2601505, 1199808, 505]]

describe('Kunstbauten Stadt Bern', () => {
  it('liest einen gepackten MultiPatch (Ring mit Schlusspunkt = ein Dreieck)', async () => {
    const roh = shape([{ typ: 4, punkte: [...dreieck, dreieck[0]] }])
    const mp = multipatchLesen(await entpacken(gepackt(roh)))
    expect(mp.teile).toEqual([0]); expect(mp.typen).toEqual([4])
    expect(Array.from(mp.punkte.slice(0, 3))).toEqual([2601500, 1199800, 504])
    expect(Array.from(dreiecke(mp))).toEqual(dreieck.flat())
  })
  it('Streifen, Fächer und Dreiecke; Löcher werden übergangen', () => {
    const p = (i: number): [number, number, number] => [i, i * 2, i * 3]
    const mp = multipatchLesen(shape([
      { typ: 0, punkte: [p(0), p(1), p(2), p(3)] },   // Streifen: 2 Dreiecke
      { typ: 1, punkte: [p(4), p(5), p(6), p(7)] },   // Fächer: 2 Dreiecke
      { typ: 6, punkte: [p(8), p(9), p(10)] },        // Dreiecke: 1
      { typ: 3, punkte: [p(11), p(12), p(13)] },      // Loch: keins
    ]))
    const d = dreiecke(mp)
    expect(d.length / 9).toBe(5)
    expect(Array.from(d.slice(27, 36))).toEqual([...p(4), ...p(6), ...p(7)])
  })
  it('kein MultiPatch bzw. abgeschnitten: Fehler; ein unlesbares Bauwerk fehlt, die übrigen bleiben', async () => {
    const falsch = shape([{ typ: 4, punkte: dreieck }]); new DataView(falsch.buffer).setUint32(0, 5, true)
    expect(() => multipatchLesen(falsch)).toThrow(/kein MultiPatch/)
    expect(() => multipatchLesen(shape([{ typ: 4, punkte: dreieck }]).slice(0, 60))).toThrow(/unvollständig/)
    const gut = gepackt(shape([{ typ: 4, punkte: [...dreieck, dreieck[0]] }]))
    const k = await kunstbautenLesen({ features: [
      { attributes: { cgUnId: 'Untertorbrücke' }, geometry: { binaryPatches: gut } },
      { attributes: { cgUnId: 'kaputt' }, geometry: { binaryPatches: 'AAAA' } },
    ] })
    expect(k.map(x => x.name)).toEqual(['Untertorbrücke'])
    expect(grenzenLv95(k[0])).toEqual([2601500, 1199800, 2601510, 1199808])
    await expect(kunstbautenLesen({ error: { message: 'Token required' } })).rejects.toThrow(/Token required/)
  })
  it('Abfrage: Rechteck ±150 m in LV95, 3D-Form ohne Materialien; nur in der Stadt Bern', () => {
    const u = new URL(kunstbautenUrl([2601549.6, 1199824]))
    expect(u.host).toBe('gisapp.bern.ch')
    expect(u.searchParams.get('geometry')).toBe('2601399.6,1199674.0,2601699.6,1199974.0')
    expect(u.searchParams.get('multipatchOption')).toBe('stripMaterials')
    expect(u.searchParams.get('returnZ')).toBe('true')
    expect(inBern([2601549.6, 1199824])).toBe(true)
    expect(inBern([2683000, 1248000])).toBe(false)
    // Höhenbezug: die Szene trägt Landeshöhen (LHN95), LN02 liegt in Bern 0,04 m darüber; kein Sprung von rund 50 m aufs Ellipsoid
    expect(LN02_ZU_SZENE_M).toBeCloseTo(-0.04, 3)
    expect(Math.abs(LN02_ZU_SZENE_M)).toBeLessThan(1)
  })
})

describe('Grundriss der Kunstbauten', () => {
  it('belegt die Fläche der Dreiecke von oben, nicht senkrechte Wände', () => {
    const flach = new Float64Array([0, 0, 500, 10, 0, 500, 0, 10, 500])        // halbes Quadrat 10 × 10 m
    const wand = new Float64Array([20, 0, 500, 20, 0, 505, 20, 10, 500])       // senkrecht: keine Fläche von oben
    const g = grundriss([{ name: 'a', dreiecke: flach }, { name: 'b', dreiecke: wand }], 0.5)!
    expect(aufGrundriss(g, [2, 2])).toBe(true)
    expect(aufGrundriss(g, [8, 8])).toBe(false)     // jenseits der Diagonale
    expect(aufGrundriss(g, [20, 5])).toBe(false)    // Wand
    expect(aufGrundriss(g, [-1, 2])).toBe(false)
    expect(aufGrundriss(null, [2, 2])).toBe(false)
    expect(grundriss([])).toBeNull()
    // Höhe der obersten Fläche je Zelle; ausserhalb null
    expect(bauHoehe(g, [2, 2])).toBeCloseTo(500, 3)
    expect(bauHoehe(g, [8, 8])).toBeNull()
    const zwei = grundriss([{ name: 'unten', dreiecke: flach }, { name: 'oben', dreiecke: new Float64Array([0, 0, 503, 10, 0, 503, 0, 10, 503]) }], 0.5)!
    expect(bauHoehe(zwei, [2, 2])).toBeCloseTo(503, 3)
  })
})

it('behält mehrere Decks als getrennte Höhenkandidaten', () => {
  const deck = (h: number) => ({ name: String(h), dreiecke: new Float64Array([0, 0, h, 10, 0, h, 0, 10, h]) })
  const g = grundriss([deck(500), deck(505)])
  expect(bauHoehen(g, [2, 2]).sort()).toEqual([500, 505])
})

it('schräger Rand: Index enthält das Dreieck auch bei Zellmitte ausserhalb; tatsächlicher Punkt bestimmt Höhe', () => {
  const k = { name: 'Rand', dreiecke: new Float64Array([0, 0, 500, 1, 0, 501, 0, 1, 502]) }
  const g = grundriss([k], 0.5)
  expect(bauHoehe(g, [0.51, 0.01])).toBeCloseTo(500.53, 8)
  expect(bauHoehe(g, [0.9, 0.2])).toBeNull()
  expect(bauHoehe(g, [1, 0])).toBeCloseTo(501, 8)
  expect(bauHoehe(g, [0, 1])).toBeCloseTo(502, 8)
})
