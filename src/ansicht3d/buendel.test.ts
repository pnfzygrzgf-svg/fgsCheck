// CesiumJS gehört nicht ins Hauptbündel: nur ansicht3d/cesiumSzene.ts lädt es, und zwar per import(); cesiumSzene.ts selbst wird
// ausserhalb von Typimporten nur per import() eingebunden (Ansicht3D.tsx). Der Rechenworker bleibt frei davon (workerGrenze.test.ts).
import { expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(__dirname, '..')
const dateien = (d: string): string[] => readdirSync(d).flatMap(n => {
  const p = join(d, n)
  if (statSync(p).isDirectory()) return n === 'testdaten' ? [] : dateien(p)
  return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
})

it('Cesium wird nur in cesiumSzene.ts und nur dynamisch geladen; cesiumSzene.ts nur per import() eingebunden', () => {
  const treffer: string[] = []
  for (const p of dateien(SRC)) {
    const rel = relative(SRC, p), text = readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    // Importe stehen in diesem Code auf einer Zeile (ohne Strichpunkt); [^\n] hält das Muster auf der Zeile
    const statisch = /^\s*import\s+(?!type\b)[^\n]*?from\s+['"]cesium['"]/m.test(text) || /^\s*import\s+['"]cesium['"]/m.test(text)
    const dynamisch = /import\(\s*['"]cesium['"]\s*\)/.test(text)
    if (statisch) treffer.push(`${rel}: statischer Import von cesium`)
    if (dynamisch && rel !== 'ansicht3d/cesiumSzene.ts') treffer.push(`${rel}: lädt cesium`)
    if (/^\s*import\s+(?!type\b)[^\n]*?from\s+['"][./]*cesiumSzene['"]/m.test(text)) treffer.push(`${rel}: statischer Import von cesiumSzene`)
  }
  expect(treffer).toEqual([])
  expect(/import\(\s*['"]cesium['"]\s*\)/.test(readFileSync(join(SRC, 'ansicht3d/cesiumSzene.ts'), 'utf8'))).toBe(true)
})
