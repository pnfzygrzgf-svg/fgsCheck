import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('prüft die Kopie gegen den aktuellen SWC, auch bei passend gefälschtem Manifest, ohne zu schreiben', () => {
  // Unterhalb des Test-Repos, damit die nur lesenden Git-Abfragen ohne eigenes Test-Commit funktionieren.
  // Die Quell-Dateien sind eine lokale Fixture; ein benachbarter SWC-Checkout wird nicht vorausgesetzt.
  const tmp = mkdtempSync(join(process.cwd(), '_lokal_kopierpruefung_'))
  try {
    const skript = join(tmp, 'scripts/knotensicht_holen.mjs'), ziel = join(tmp, 'src/knotensicht')
    mkdirSync(join(tmp, 'scripts')); writeFileSync(skript, readFileSync(new URL('../../scripts/knotensicht_holen.mjs', import.meta.url)))
    const quelle = join(tmp, 'quelle')
    cpSync(new URL('../knotensicht/', import.meta.url), join(quelle, 'src'), { recursive: true })
    for (const name of ['e6.ts', 'regional.ts', 'regionalDienste.ts']) {
      cpSync(new URL(`../daten/anbieter/gemeinsam/${name}`, import.meta.url), join(quelle, 'src/daten/anbieter/gemeinsam', name))
    }
    writeFileSync(join(quelle, 'package.json'), JSON.stringify({ version: '0.0.0' }))
    const lauf = (...args: string[]) => spawnSync(process.execPath, [skript, quelle, '--trotzdem', ...args], {
      encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    })
    const kopie = lauf()
    expect(kopie.stderr).toBe(''); expect(kopie.status).toBe(0)
    const manifest = join(ziel, 'herkunft.json'), m = JSON.parse(readFileSync(manifest, 'utf8'))
    expect(m.dateien['daten/anbieter/gemeinsam/e6.ts']).toBeDefined()
    const datei = 'daten/anbieter/gemeinsam/regional.ts', abweichend = readFileSync(join(ziel, datei), 'utf8') + '\n// Abweichung trotz passender eigener Prüfsumme\n'
    writeFileSync(join(ziel, datei), abweichend)
    m.dateien[datei] = createHash('sha256').update(abweichend).digest('hex')
    writeFileSync(manifest, JSON.stringify(m))
    const zustand = (dir: string): unknown[] => readdirSync(dir, { withFileTypes: true }).map(e => {
      const p = join(dir, e.name)
      return [e.name, e.isDirectory() ? zustand(p) : [readFileSync(p).toString('base64'), statSync(p).mtimeMs]]
    })
    const vorher = zustand(ziel), pruefung = lauf('--pruefen')
    expect(pruefung.status).toBe(1)
    expect(pruefung.stderr).toContain(datei)
    expect(zustand(ziel)).toEqual(vorher)
    // Auch der erfolgreiche Prüfzweig lässt Inhalte und Änderungszeiten unangetastet.
    expect(lauf().status).toBe(0)
    const gleich = zustand(ziel)
    expect(lauf('--pruefen').status).toBe(0)
    expect(zustand(ziel)).toEqual(gleich)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})
