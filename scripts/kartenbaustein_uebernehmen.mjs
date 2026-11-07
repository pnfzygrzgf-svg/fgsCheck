#!/usr/bin/env node
// Verteilt den Kartenbaustein aus dem fgsCheck an die anderen Rechner und schreibt je eine Prüfsummenliste (herkunft.json).
// Aufruf: node scripts/kartenbaustein_uebernehmen.mjs <SichtweitenCheckWeb> <VeloroutenCheckWeb> <KnotenCheckWeb>
// Geändert wird nur hier; herkunft.test.ts schlägt an, wenn eine Kopie abweicht. Die Dateien in daten/ gehen nur an Rechner mit derselben
// Datenschicht (daten/parkkataster.ts).
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src')
const baustein = readdirSync(join(src, 'kartenbaustein')).filter(f => f !== 'herkunft.json').sort().map(f => `kartenbaustein/${f}`)
const daten = ['daten/ersatzLuzern.ts', 'daten/ersatzLuzern.test.ts', 'daten/parkLuzern.ts']
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const liste = (wurzel, dateien) => writeFileSync(join(wurzel, 'kartenbaustein/herkunft.json'),
  JSON.stringify({ quelle: 'fgsCheckWeb/src/kartenbaustein', sha256: Object.fromEntries(dateien.map(f => [f, sha(join(wurzel, f))])) }, null, 2) + '\n')

liste(src, [...baustein, ...daten])
if (!process.argv.slice(2).length) throw Error('Ziel-Apps angeben')
for (const ziel of process.argv.slice(2)) {
  const wurzel = resolve(ziel, 'src'), mitDaten = existsSync(join(wurzel, 'daten/parkkataster.ts')), dateien = [...baustein, ...(mitDaten ? daten : [])]
  // Nur überschreiben und Altes einzeln löschen: Wird der ganze Ordner entfernt, stellt iCloud die alten Dateien als «… 2» wieder her
  mkdirSync(join(wurzel, 'kartenbaustein'), { recursive: true })
  for (const f of readdirSync(join(wurzel, 'kartenbaustein'))) if (f !== 'herkunft.json' && !dateien.includes(`kartenbaustein/${f}`)) rmSync(join(wurzel, 'kartenbaustein', f))
  for (const f of dateien) copyFileSync(join(src, f), join(wurzel, f))
  liste(wurzel, dateien)
  console.log(`Kartenbaustein übernommen: ${ziel} (${dateien.length} Dateien)`)
}
