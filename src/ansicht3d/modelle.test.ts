// Jedes 3D-Modell unter public/modelle/ ist in HERKUNFT.txt mit Quelle, Lizenz und Prüfsumme festgehalten; die Prüfsumme stimmt mit der Datei
// überein, und die Masse in cesiumSzene.ts (MODELLE) sind dort genannt.
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODELLE } from './cesiumSzene'

const ORDNER = join(__dirname, '../../public/modelle')

describe('3D-Modelle', () => {
  const herkunft = readFileSync(join(ORDNER, 'HERKUNFT.txt'), 'utf8')
  const dateien = readdirSync(ORDNER).filter(f => f.endsWith('.glb'))
  it('jede Modelldatei hat Quelle, Lizenz und passende Prüfsumme in HERKUNFT.txt', () => {
    expect(dateien.length).toBeGreaterThan(0)
    for (const f of dateien) {
      const block = herkunft.split(/\n(?=\S)/).find(b => b.startsWith(f))
      expect(block, f).toBeTruthy()
      expect(block).toMatch(/Lizenz: CC0/); expect(block).toMatch(/https?:\/\//)
      const sha = createHash('sha256').update(readFileSync(join(ORDNER, f))).digest('hex')
      expect(block, `${f}: SHA-256`).toContain(sha)
    }
  })
  it('MODELLE verweist nur auf vorhandene Dateien', () => {
    for (const m of Object.values(MODELLE).flat()) expect(dateien, m.datei).toContain(m.datei.replace('modelle/', ''))
    expect(MODELLE.person?.length).toBe(2)
  })
  it('Fusssohlen-Versatz entspricht der tatsächlichen Unterkante beider Personenmodelle', () => {
    for (const m of MODELLE.person!) {
      const glb = readFileSync(join(ORDNER, m.datei.replace('modelle/', '')))
      const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString())
      // Diese statischen Modelle haben keine Knoten-Transformation, glTF-Y ist ihre Hochachse.
      expect(json.nodes.every((n: any) => !n.matrix && !n.translation && !n.rotation && !n.scale)).toBe(true)
      const unterkante = Math.min(...json.meshes.flatMap((mesh: any) => mesh.primitives.map((p: any) => json.accessors[p.attributes.POSITION].min[1])))
      expect(m.unterkanteModell).toBeCloseTo(unterkante, 8)
    }
  })
})
