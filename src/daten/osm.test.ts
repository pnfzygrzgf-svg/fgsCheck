import { afterEach, describe, expect, it } from 'vitest'
import { retryAfterMs, sperreNachAntwort, overpassSperre, sperreZuruecksetzen, SPERRE_STANDARD_MS, SPERRE_MAX_MS } from './osm'

describe('Overpass: Sperre nach 429 bzw. Retry-After', () => {
  afterEach(sperreZuruecksetzen)
  it('Retry-After in Sekunden bzw. als HTTP-Datum, sonst null', () => {
    const jetzt = Date.parse('2026-10-11T12:00:00Z')
    expect(retryAfterMs('12', jetzt)).toBe(12000)
    expect(retryAfterMs('Sun, 11 Oct 2026 12:00:30 GMT', jetzt)).toBe(30000)
    expect(retryAfterMs('Sun, 11 Oct 2026 11:59:00 GMT', jetzt)).toBe(0)
    expect(retryAfterMs(null, jetzt)).toBeNull()
    expect(retryAfterMs('bald', jetzt)).toBeNull()
  })
  it('429 ohne Angabe: Standardsperre; mit Retry-After nach Angabe, höchstens SPERRE_MAX_MS; nie verkürzt', () => {
    const t = 1_000_000
    sperreNachAntwort(429, null, t)
    expect(overpassSperre(t)).toBe(SPERRE_STANDARD_MS)
    sperreNachAntwort(429, '5', t)                                   // kürzer: bleibt
    expect(overpassSperre(t)).toBe(SPERRE_STANDARD_MS)
    sperreNachAntwort(503, '9999', t)                                // 5xx mit Retry-After: auf das Maximum begrenzt
    expect(overpassSperre(t)).toBe(SPERRE_MAX_MS)
    expect(overpassSperre(t + SPERRE_MAX_MS + 1)).toBe(0)
  })
  it('5xx ohne Retry-After setzt keine Sperre', () => {
    sperreNachAntwort(504, null, 0)
    expect(overpassSperre(0)).toBe(0)
  })
})
