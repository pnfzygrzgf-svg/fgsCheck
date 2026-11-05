#!/usr/bin/env node
// ── Statische Dateien von CesiumJS für die 3D-Ansicht bereitstellen ──
//
// Cesium lädt Worker, Hilfsbibliotheken (ThirdParty) und Assets zur Laufzeit unter CESIUM_BASE_URL nach (src/ansicht3d/cesiumSzene.ts
// setzt /cesium/). Vite liefert public/ unverändert aus; darum kopiert dieses Skript die drei Ordner aus node_modules/cesium/Build/Cesium
// nach public/cesium/ (nicht im Repo, .gitignore) und die Lizenz nach public/licenses/cesium.txt (im Repo). Läuft vor «npm run dev» und
// «npm run build» (predev/prebuild); ist die installierte Fassung schon kopiert, passiert nichts.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const quelle = resolve(wurzel, 'node_modules/cesium')
const ziel = resolve(wurzel, 'public/cesium')
const ORDNER = ['Workers', 'ThirdParty', 'Assets']

if (!existsSync(resolve(quelle, 'Build/Cesium'))) throw Error('CesiumJS ist nicht installiert (npm install).')
const { version } = JSON.parse(await readFile(resolve(quelle, 'package.json'), 'utf8'))
const marke = resolve(ziel, 'VERSION.txt')
const vorhanden = existsSync(marke) ? (await readFile(marke, 'utf8')).trim() : ''
if (vorhanden === version && ORDNER.every(o => existsSync(resolve(ziel, o)))) {
  console.log(`Cesium-Dateien ${version} sind bereit (public/cesium).`)
} else {
  await mkdir(ziel, { recursive: true })
  for (const o of ORDNER) await cp(resolve(quelle, 'Build/Cesium', o), resolve(ziel, o), { recursive: true })
  await writeFile(marke, version + '\n')
  console.log(`Cesium-Dateien ${version} nach public/cesium kopiert (${ORDNER.join(', ')}).`)
}
await mkdir(resolve(wurzel, 'public/licenses'), { recursive: true })
await writeFile(resolve(wurzel, 'public/licenses/cesium.txt'),
  `CesiumJS ${version} (Apache-2.0) und mitgelieferte Drittbibliotheken. Originaler Lizenztext der installierten Fassung.\n\n` +
  await readFile(resolve(quelle, 'LICENSE.md'), 'utf8'))
