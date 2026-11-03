#!/usr/bin/env node
// E1a: gemeinsame Datenmodule aus fgsCheck in den SichtweitenCheck übernehmen; keine App-/Rechenmodule.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ziel = resolve(process.argv[2] ?? resolve(root, '../../SichtweitenCheck/SichtweitenCheckWeb'))
if (ziel === root || !existsSync(join(ziel, 'src/daten/holen.ts')) || !existsSync(join(ziel, 'src/geo.ts')))
  throw new Error('Ziel muss ein vorhandener SichtweitenCheck mit geo.ts und daten/holen.ts sein')
const rel = 'src/daten/anbieter/gemeinsam'
const dateien = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
  ? dateien(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]).sort()
const hashes = {}
for (const name of dateien(join(root, rel))) {
  const inhalt = readFileSync(join(root, rel, name)), datei = join(ziel, rel, name)
  mkdirSync(dirname(datei), { recursive: true }); writeFileSync(datei, inhalt)
  hashes[name] = createHash('sha256').update(inhalt).digest('hex')
}
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
const herkunft = { quelle: 'fgsCheck/fgsCheckWeb', bereich: rel, erzeugt: new Date().toISOString(),
  commit: git('rev-parse', 'HEAD'), mitLokalenAenderungen: !!git('status', '--porcelain', '--', rel),
  hinweis: 'Commit bezeichnet die Basis; Prüfsummen bezeichnen die tatsächlich übernommene Fassung. Nur im fgsCheck ändern und erneut übernehmen.',
  dateien: hashes }
mkdirSync(join(ziel, 'src/daten/anbieter'), { recursive: true })
writeFileSync(join(ziel, 'src/daten/anbieter/herkunft.json'), JSON.stringify(herkunft, null, 2) + '\n')
console.log(`${Object.keys(hashes).length} gemeinsame Dateien übernommen; Herkunft und SHA-256 gespeichert.`)
