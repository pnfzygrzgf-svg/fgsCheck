// Der Kartenbaustein ist in allen Rechnern gleich. Schlägt dieser Test an, wurde eine Kopie von Hand geändert oder das Skript nicht ausgeführt.
import { describe, expect, it } from 'vitest'
import herkunft from './herkunft.json'

const quellen = import.meta.glob(['/src/kartenbaustein/*.{ts,tsx,json}', '/src/kartenbaustein/LICENSE', '!/src/kartenbaustein/herkunft.json', '/src/daten/ersatzLuzern*.ts', '/src/daten/parkLuzern.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sha256 = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('')

describe('Kopie des Kartenbausteins', () => {
  it('stimmt Datei für Datei mit dem fgsCheck überein', async () => {
    const dateien = herkunft.sha256 as Record<string, string>
    // Vitest liefert CSS beim Einlesen leer, darum direkt von der Platte
    const fs = await import(/* @vite-ignore */ 'node:' + 'fs') as { readFileSync(p: URL, kodierung: string): string }
    quellen['/src/kartenbaustein/baustein.css'] = fs.readFileSync(new URL('./baustein.css', import.meta.url), 'utf8')
    const hier = Object.keys(quellen).map(p => p.replace('/src/', ''))
    expect(hier.filter(f => !dateien[f])).toEqual([])
    for (const [f, s] of Object.entries(dateien)) if (quellen[`/src/${f}`] !== undefined) expect(await sha256(quellen[`/src/${f}`]), f).toBe(s)
    // Der Test sieht sich selbst nicht
    expect(Object.keys(dateien).filter(f => f.startsWith('kartenbaustein/') && f !== 'kartenbaustein/herkunft.test.ts' && quellen[`/src/${f}`] === undefined)).toEqual([])
  })
})
