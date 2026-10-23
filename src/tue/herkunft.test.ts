// Herkunft der Knotensicht (K1): src/knotensicht/ ist eine wortgleiche Kopie aus dem SichtweitenCheck (scripts/knotensicht_holen.mjs).
// Jede Datei muss die SHA-256 aus herkunft.json haben, und im Ordner liegen keine weiteren Dateien (keine stille Handänderung).
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import herkunft from '../knotensicht/herkunft.json'

const ORDNER = join(__dirname, '..', 'knotensicht')
const alle = (d: string, rel = ''): string[] => readdirSync(join(d, rel)).flatMap(f => {
  const r = rel ? `${rel}/${f}` : f
  return statSync(join(d, r)).isDirectory() ? alle(d, r) : [r]
})

describe('Kopie des SichtweitenCheck-Kerns (herkunft.json)', () => {
  const dateien = herkunft.dateien as Record<string, string>
  it('Quelle, Version und Commit vermerkt', () => {
    expect(herkunft.quelle).toBe('SichtweitenCheck')
    expect(herkunft.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(Object.keys(dateien)).toContain('rechner/rechnen.ts')
  })
  it('jede Datei unverändert (SHA-256 wie beim Holen)', () => {
    for (const [f, h] of Object.entries(dateien))
      expect(createHash('sha256').update(readFileSync(join(ORDNER, f))).digest('hex'), f).toBe(h)
  })
  it('keine weiteren Dateien im Ordner', () => {
    expect(alle(ORDNER).filter(f => f !== 'herkunft.json' && f !== '.DS_Store').sort()).toEqual(Object.keys(dateien).sort())
  })
})
