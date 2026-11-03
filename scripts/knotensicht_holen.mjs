#!/usr/bin/env node
// ── Kern der Knotensicht aus dem SichtweitenCheck holen (K1, 23.10.2026) ──
//
// Kopiert den Rechenkern des SichtweitenCheck wortgleich nach src/knotensicht/ (gleicher relativer Aufbau: geo.ts, daten/, rechner/,
// damit kein Import geändert werden muss) und schreibt src/knotensicht/herkunft.json (Quelle, Version, Commit, SHA-256 je Datei).
// Der Test src/tue/herkunft.test.ts prüft, dass die Dateien unverändert sind. Von Hand nichts in src/knotensicht/ ändern: Anpassungen
// gehören in den SichtweitenCheck, danach dieses Skript erneut laufen lassen.
//
// Aufruf: node scripts/knotensicht_holen.mjs <Pfad zu SichtweitenCheckWeb> [--trotzdem | --pruefen]
//   (ohne Pfad: Umgebungsvariable SWC_PFAD, sonst ../SichtweitenCheck/SichtweitenCheckWeb neben dem fgsCheck-Ordner)
//   --trotzdem: auch mit nicht eingecheckten Änderungen in der Quelle (die Herkunft vermerkt es)
//   --pruefen: Quelle, Kopie und Manifest vergleichen; keinerlei Dateien schreiben oder löschen.
//
// Kern (Liste im Kopf von src/rechner/rechnen.ts der Quelle): rechner/*.ts ohne Tests und ohne worker.ts, daten/osm, av, parkkataster,
// baumkataster, holen, vsig, hoehen und geo.ts. Dazu die Tests der Quelle, deren Importe alle im Kern liegen (ohne dynamische Importe).

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const ZIEL = resolve(HIER, '..', 'src', 'knotensicht')
const args = process.argv.slice(2)
const trotzdem = args.includes('--trotzdem')
const pruefen = args.includes('--pruefen')
if (args.some(a => a.startsWith('--') && !['--trotzdem', '--pruefen'].includes(a))) {
  console.error('Unbekannte Option; erlaubt sind --trotzdem und --pruefen.'); process.exit(1)
}
const pfad = resolve(args.find(a => !a.startsWith('--')) ?? process.env.SWC_PFAD ?? resolve(HIER, '..', '..', '..', 'SichtweitenCheck', 'SichtweitenCheckWeb'))
const SRC = join(pfad, 'src')
if (!existsSync(join(SRC, 'rechner', 'rechnen.ts'))) { console.error(`Kein SichtweitenCheck unter ${pfad} (src/rechner/rechnen.ts fehlt).`); process.exit(1) }

const git = (...a) => execFileSync('git', ['-C', pfad, ...a], {
  encoding: 'utf-8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
}).trim()
const commit = git('rev-parse', 'HEAD')
const datum = git('show', '-s', '--format=%cI', 'HEAD')
const offen = git('status', '--porcelain', '--', 'src')
if (offen && !trotzdem && !pruefen) { console.error(`Quelle mit nicht eingecheckten Änderungen in src/:\n${offen}\nErst einchecken bzw. --trotzdem.`); process.exit(1) }
const version = JSON.parse(readFileSync(join(pfad, 'package.json'), 'utf-8')).version

const DATEN = ['osm', 'av', 'parkkataster', 'baumkataster', 'holen', 'vsig', 'hoehen'].map(n => `daten/${n}.ts`)
const rechner = readdirSync(join(SRC, 'rechner')).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'worker.ts')
  .map(f => `rechner/${f}`)
const kern = ['geo.ts', ...DATEN, ...rechner, ...['e6', 'regional', 'regionalDienste', 'bedarfOrte', 'regionalGeometrie', 'regionalZuordnung', 'regionalSignale', 'bundBelege', 'bundGeoAdmin', 'bundPoi', 'bundPoiUrl', 'bundesBudget', 'bundesAbruf', 'bav', 'geoAdmin', 'typen'].map(n => `daten/anbieter/gemeinsam/${n}.ts`), 'daten/anbieter/gemeinsam/qualitaet.ts', 'daten/anbieter/gemeinsam/zuerich.ts', 'daten/anbieter/gemeinsam/zuerichZuordnung.ts'].sort()

/** relative Importe einer Datei (statisch); dynamische import(...) zählen getrennt */
const importe = (rel) => {
  const t = readFileSync(join(SRC, rel), 'utf-8')
  // auch mehrzeilige Importe: «from '…'» (import bzw. export … from) und «import '…'» (nur Nebenwirkung)
  const statisch = [...t.matchAll(/\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g), ...t.matchAll(/\bimport\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1])
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

// Nur entfallene Dateien entfernen; unveränderte Dateien behalten (auch für synchronisierte Dokumentordner).
const herkunftPfad = join(ZIEL, 'herkunft.json')
// Vor jedem schreibenden Zweig abbrechen. Auch eine in sich konsistente alte Kopie muss an der aktuellen Quelle gemessen werden.
if (pruefen) {
  const fehler = []
  let manifest
  try { manifest = JSON.parse(readFileSync(herkunftPfad, 'utf-8')) } catch { fehler.push('herkunft.json fehlt oder ist ungültig') }
  const erwartet = [...kern, ...tests], namen = new Set(erwartet)
  for (const f of erwartet) {
    const quelle = readFileSync(join(SRC, f)), ziel = join(ZIEL, f)
    const hash = createHash('sha256').update(quelle).digest('hex')
    if (!existsSync(ziel) || !readFileSync(ziel).equals(quelle)) fehler.push(`${f}: Kopie fehlt oder weicht vom SichtweitenCheck ab`)
    if (manifest?.dateien?.[f] !== hash) fehler.push(`${f}: Prüfsumme im Manifest weicht von der Quelle ab`)
  }
  for (const f of Object.keys(manifest?.dateien ?? {})) if (!namen.has(f)) fehler.push(`${f}: unerwarteter Eintrag im Manifest`)
  const kopierteDateien = (dir, prefix = '') => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? kopierteDateien(join(dir, e.name), `${prefix}${e.name}/`) : e.name.endsWith('.ts') ? [`${prefix}${e.name}`] : []) : []
  for (const f of kopierteDateien(ZIEL)) if (!namen.has(f)) fehler.push(`${f}: Datei gehört nicht zum aktuellen Kern oder dessen Tests`)
  if (manifest && (manifest.kern !== kern.length || manifest.tests !== tests.length || manifest.version !== version)) fehler.push('herkunft.json: Umfang oder Quellversion stimmt nicht')
  if (fehler.length) { console.error(fehler.join('\n')); process.exit(1) }
  console.log(`Kopierprüfung bestanden: ${kern.length} Kerndateien und ${tests.length} Tests stimmen mit Quelle und Manifest überein; nichts geschrieben.`)
  process.exit(0)
}
// (nur Pfade, die sicher in src/knotensicht/ liegen: relativ, ohne «..», Endung .ts; sonst Abbruch)
if (existsSync(herkunftPfad)) {
  const alt = Object.keys(JSON.parse(readFileSync(herkunftPfad, 'utf-8')).dateien ?? {})
  for (const f of alt) {
    const ziel = resolve(ZIEL, f)
    if (!/^[\w/.-]+\.ts$/.test(f) || f.split('/').includes('..') || !ziel.startsWith(ZIEL + sep)) {
      console.error(`herkunft.json nennt einen unzulässigen Pfad «${f}»: nichts gelöscht.`); process.exit(1)
    }
  }
  const neu = new Set([...kern, ...tests])
  for (const f of alt) if (!neu.has(f)) rmSync(resolve(ZIEL, f), { force: true })
}
const dateien = {}
for (const f of [...kern, ...tests]) {
  const inhalt = readFileSync(join(SRC, f))
  mkdirSync(dirname(join(ZIEL, f)), { recursive: true })
  const ziel = join(ZIEL, f)
  if (!existsSync(ziel) || !readFileSync(ziel).equals(inhalt)) writeFileSync(ziel, inhalt)
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
