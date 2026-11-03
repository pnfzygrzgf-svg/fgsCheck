import { expect, it } from 'vitest'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import ts from 'typescript'

it('Rechenworker enthält weder Oberfläche, Browserglobale noch Datenparser',async()=>{
 const r=await build({entryPoints:[resolve(__dirname,'rechner/worker.ts')],bundle:true,write:false,metafile:true,platform:'browser',format:'esm',logLevel:'silent'})
 // Entscheidend ist der ausgelieferte Code; vollständig entfernte Importe sind kein Bestandteil des Workers.
 const enthalten=Object.values(r.metafile!.outputs).flatMap(o=>Object.entries(o.inputs).filter(([,v])=>v.bytesInOutput>0).map(([p])=>p))
 expect(enthalten.filter(p=>/\.tsx$|node_modules\/(react\/|leaflet\/|fast-xml-parser\/|@mapbox\/vector-tile\/|pbf\/)/.test(p))).toEqual([])
 const globale:string[]=[]
 const ast=ts.createSourceFile('worker.js',r.outputFiles[0].text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
 const lesen=(n:ts.Node)=>{
   if(ts.isIdentifier(n)&&['window','document'].includes(n.text)&&
     !(ts.isPropertyAccessExpression(n.parent)&&n.parent.name===n&&n.parent.expression.getText(ast)!=='globalThis')&&
     !(ts.isPropertyAssignment(n.parent)&&n.parent.name===n))globale.push(n.text)
   ts.forEachChild(n,lesen)
 }
 lesen(ast);expect(globale).toEqual([])
})
