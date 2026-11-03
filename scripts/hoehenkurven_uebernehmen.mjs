import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const quelle=resolve(dirname(fileURLToPath(import.meta.url)), '../src/hoehenkurven')
const dateien=['modell.ts','projektion.ts','ableiten.ts','holen.ts','stand.ts','Karte.ts','Wahl.tsx']
if(!process.argv.slice(2).length)throw Error('Ziel-App-Verzeichnisse angeben')
for(const ziel of process.argv.slice(2)){
 const ordner=resolve(ziel,'src/hoehenkurven'),sha256={};await mkdir(ordner,{recursive:true})
 for(const f of dateien){const b=await readFile(resolve(quelle,f));await writeFile(resolve(ordner,f),b);sha256[f]=createHash('sha256').update(b).digest('hex')}
 await writeFile(resolve(ordner,'herkunft.json'),JSON.stringify({quelle:'fgsCheckWeb/src/hoehenkurven',sha256},null,2)+'\n')
 console.log('Höhenkurven übernommen: '+ziel)
}
