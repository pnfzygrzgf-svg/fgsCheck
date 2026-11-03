import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const quelle = resolve(dirname(fileURLToPath(import.meta.url)), '../src/hoehenprofil')
const ziele = process.argv.slice(2)
if (!ziele.length) throw Error('Ziel-App-Verzeichnisse angeben')
const dateien = ['modell.ts', 'Ansicht.tsx']
for (const ziel of ziele) {
  const ordner = resolve(ziel, 'src/hoehenprofil'), sha256 = {}
  await mkdir(ordner, { recursive: true })
  for (const datei of dateien) {
    const b = await readFile(resolve(quelle, datei))
    await writeFile(resolve(ordner, datei), b)
    sha256[datei] = createHash('sha256').update(b).digest('hex')
  }
  await writeFile(resolve(ordner, 'herkunft.json'), JSON.stringify({ quelle: 'fgsCheckWeb/src/hoehenprofil', sha256 }, null, 2) + '\n')
  console.log(`Höhenprofil-Darstellung übernommen: ${ziel}`)
}
