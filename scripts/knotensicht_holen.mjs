#!/usr/bin/env node
// ── Kern der Knotensicht aus dem SichtweitenCheck holen (K1, 23.10.2026) ──
//
// Kopiert den Rechenkern des SichtweitenCheck wortgleich nach src/knotensicht/ (gleicher relativer Aufbau: geo.ts, daten/, rechner/,
// damit kein Import geändert werden muss) und schreibt src/knotensicht/herkunft.json (Quelle, Version, Commit, SHA-256 je Datei).
// Der Test src/tue/herkunft.test.ts prüft, dass die Dateien unverändert sind. Von Hand nichts in src/knotensicht/ ändern: Anpassungen
// gehören in den SichtweitenCheck, danach dieses Skript erneut laufen lassen.
//
// Aufruf: node scripts/knotensicht_holen.mjs <Pfad zu SichtweitenCheckWeb> [--trotzdem]
//   (ohne Pfad: Umgebungsvariable SWC_PFAD, sonst ../SichtweitenCheck/SichtweitenCheckWeb neben dem fgsCheck-Ordner)
//   --trotzdem: auch mit nicht eingecheckten Änderungen in der Quelle (die Herkunft vermerkt es)
//
// Kern (Liste im Kopf von src/rechner/rechnen.ts der Quelle): rechner/*.ts ohne Tests und ohne worker.ts, daten/osm, av, parkkataster,
// baumkataster, holen, vsig, hoehen und geo.ts. Dazu die Tests der Quelle, deren Importe alle im Kern liegen (ohne dynamische Importe).

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const ZIEL = resolve(HIER, '..', 'src', 'knotensicht')
const args = process.argv.slice(2)
const trotzdem = args.includes('--trotzdem')
const pfad = resolve(args.find(a => !a.startsWith('--')) ?? process.env.SWC_PFAD ?? resolve(HIER, '..', '..', '..', 'SichtweitenCheck', 'SichtweitenCheckWeb'))
const SRC = join(pfad, 'src')
if (!existsSync(join(SRC, 'rechner', 'rechnen.ts'))) { console.error(`Kein SichtweitenCheck unter ${pfad} (src/rechner/rechnen.ts fehlt).`); process.exit(1) }

const git = (...a) => execFileSync('git', ['-C', pfad, ...a], { encoding: 'utf-8' }).trim()
const commit = git('rev-parse', 'HEAD')
const datum = git('show', '-s', '--format=%cI', 'HEAD')
const offen = git('status', '--porcelain', '--', 'src')
if (offen && !trotzdem) { console.error(`Quelle mit nicht eingecheckten Änderungen in src/:\n${offen}\nErst einchecken bzw. --trotzdem.`); process.exit(1) }
const version = JSON.parse(readFileSync(join(pfad, 'package.json'), 'utf-8')).version

const DATEN = ['osm', 'av', 'parkkataster', 'baumkataster', 'holen', 'vsig', 'hoehen'].map(n => `daten/${n}.ts`)
const rechner = readdirSync(join(SRC, 'rechner')).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'worker.ts')
  .map(f => `rechner/${f}`)
const kern = ['geo.ts', ...DATEN, ...rechner].sort()

/** relative Importe einer Datei (statisch); dynamische import(...) zählen getrennt */
const importe = (rel) => {
  const t = readFileSync(join(SRC, rel), 'utf-8')
  const statisch = [...t.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"\n]*?(?:from\s*)?['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1])
  const dynamisch = /\bimport\s*\(/.test(t)
  return { ziele: statisch.map(z => normalize(join(dirname(rel), z.endsWith('.ts') ? z : `${z}.ts`))), dynamisch }
}
// Hülle prüfen: jeder Import des Kerns liegt im Kern
const menge = new Set(kern)
for (const f of kern) for (const z of importe(f).ziele) if (!menge.has(z)) { console.error(`${f} importiert ${z} ausserhalb des Kerns.`); process.exit(1) }
// Tests der Quelle, deren Importe ganz im Kern liegen
const testKand = ['geo.test.ts', ...DATEN.map(d => d.replace(/\.ts$/, '.test.ts')),
  ...readdirSync(join(SRC, 'rechner')).filter(f => f.endsWith('.test.ts')).map(f => `rechner/${f}`)]
  .filter(f => existsSync(join(SRC, f)))
const tests = testKand.filter(f => { const i = importe(f); return !i.dynamisch && i.ziele.every(z => menge.has(z)) }).sort()
const ausgelassen = testKand.filter(f => !tests.includes(f)).sort()

// alte Kopie entfernen (nur Dateien der bisherigen Herkunft), neue schreiben
const herkunftPfad = join(ZIEL, 'herkunft.json')
if (existsSync(herkunftPfad)) for (const f of Object.keys(JSON.parse(readFileSync(herkunftPfad, 'utf-8')).dateien ?? {})) rmSync(join(ZIEL, f), { force: true })
const dateien = {}
for (const f of [...kern, ...tests]) {
  const inhalt = readFileSync(join(SRC, f))
  mkdirSync(dirname(join(ZIEL, f)), { recursive: true })
  writeFileSync(join(ZIEL, f), inhalt)
  dateien[f] = createHash('sha256').update(inhalt).digest('hex')
}
const herkunft = {
  hinweis: 'Wortgleiche Kopie des Rechenkerns aus dem SichtweitenCheck (scripts/knotensicht_holen.mjs). Nicht von Hand ändern; der Test ' +
    'src/tue/herkunft.test.ts prüft die SHA-256 je Datei.',
  quelle: 'SichtweitenCheck', version, commit, datum, ...(offen ? { nichtEingecheckt: true } : {}),
  kern: kern.length, tests: tests.length, ausgelasseneTests: ausgelassen, dateien,
}
writeFileSync(herkunftPfad, JSON.stringify(herkunft, null, 1) + '\n')
console.log(`SichtweitenCheck ${version} (${commit.slice(0, 7)}): ${kern.length} Kerndateien, ${tests.length} Tests nach src/knotensicht/ ` +
  `(ausgelassen: ${ausgelassen.join(', ') || 'keine'}).`)
