// AV-Vorschau beim Planen ohne geladenen Ort (27.10.2026, avVorschau.ts): Laden beim Einschalten des Werkzeugs (fetch nachgebildet),
// Zoomschwelle, Nachladen nach dem Verschieben, Übernahme in den neuen Fall, Aufräumen beim Beenden (Esc).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AvVorschau, NACHLADEN_AB_M, VORSCHAU_TEXT, VORSCHAU_ZOOM, ZOOM_TEXT } from './avVorschau'
import { NACHLADEN_M } from './abdeckung'
import type { P } from './geo'

const M: P = [2600000, 1200000]
const GJ = { features: [{ properties: { Art: 'Trottoir', Kanton: 'BE', Qualitaet: 'AV93', BFSNr: 351 },
  geometry: { type: 'Polygon', coordinates: [[[2599990, 1199990], [2600010, 1199990], [2600010, 1200010], [2599990, 1199990]]] } }] }

/** fetch nachgebildet: gibt das GeoJSON zurück und merkt sich die Adressen */
function mitFetch() {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(url); return new Response(JSON.stringify(GJ), { status: 200 }) }))
  return urls
}
afterEach(() => { vi.unstubAllGlobals() })

describe('AV-Vorschau', () => {
  it('Werkzeug an (Zoom ab 17): lädt die AV ±150 m um die Kartenmitte, nur Anzeige', async () => {
    const urls = mitFetch(), v = new AvVorschau(() => {})
    await v.aktualisieren(true, M, VORSCHAU_ZOOM)
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('geodienste.ch')
    expect(urls[0]).toContain('BBOX=2599850.0,1199850.0,2600150.0,1200150.0')
    expect(v.stand?.av).toHaveLength(1)
    expect(v.hinweis).toBe(VORSCHAU_TEXT)
  })
  it('Zoomschwelle: weiter weg kein Abruf, Hinweis näher heranzoomen', async () => {
    const urls = mitFetch(), v = new AvVorschau(() => {})
    await v.aktualisieren(true, M, VORSCHAU_ZOOM - 1)
    expect(urls).toHaveLength(0)
    expect(v.stand).toBeNull()
    expect(v.hinweis).toBe(ZOOM_TEXT)
  })
  it('Verschieben: bis 100 m kein neuer Abruf, darüber neu um die neue Mitte (nur der letzte Ausschnitt)', async () => {
    const urls = mitFetch(), v = new AvVorschau(() => {})
    await v.aktualisieren(true, M, 18)
    await v.aktualisieren(true, [M[0] + NACHLADEN_AB_M - 1, M[1]], 18)
    expect(urls).toHaveLength(1)
    const neu: P = [M[0] + NACHLADEN_AB_M + 20, M[1]]
    await v.aktualisieren(true, neu, 18)
    expect(urls).toHaveLength(2)
    expect(v.stand?.mitte).toEqual(neu)
  })
  it('neuer Fall: Vorschau wiederverwendet, wenn beide Enden innert der Abdeckung um ihre Mitte liegen, sonst nicht', async () => {
    mitFetch()
    const v = new AvVorschau(() => {})
    await v.aktualisieren(true, M, 18)
    expect(v.fuer([[M[0] - 5, M[1] - 4], [M[0] + 5, M[1] + 4]])).toBe(v.stand)
    expect(v.fuer([[M[0], M[1]], [M[0] + NACHLADEN_M + 5, M[1]]])).toBeNull()
  })
  it('Werkzeug beendet (Esc, anderes Werkzeug): Vorschau weg, laufender Abruf abgebrochen', async () => {
    mitFetch()
    let n = 0
    const v = new AvVorschau(() => { n++ })
    await v.aktualisieren(true, M, 18)
    await v.aktualisieren(false, M, 18)
    expect([v.stand, v.hinweis, v.laedt]).toEqual([null, null, false])
    expect(n).toBeGreaterThan(1)
    // Abbruch während des Ladens: das Ergebnis kommt nicht mehr an
    let los: () => void = () => {}
    const w = new AvVorschau(() => {}, (_e, _n, _r, signal) => new Promise((ok, nein) => {
      los = () => (signal?.aborted ? nein(new DOMException('abgebrochen', 'AbortError')) : ok({ daten: GJ, ms: 1, bytes: 1, quelle: 'x' }))
    }))
    const p = w.aktualisieren(true, M, 18)
    w.leeren(); los(); await p
    expect(w.stand).toBeNull()
  })
})
