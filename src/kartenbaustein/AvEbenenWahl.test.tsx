import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AvEbenenWahl } from './AvEbenenWahl'
it('AV-Elemente nur bei eingeschaltetem Hauptschalter, mit Anzahl und echtem Datenstand', () => {
 const legende=[['strasse','#6e6e6e','Strasse, Weg'],['trottoir','#e6e6c8','Trottoir'],['verkehrsinsel','#96c878','Verkehrsinseln'],['gebaeude','#3f3f46','Gebäude'],['gruen','#65a30d','Grünflächen, Wald'],['uebrige','#a8a29e','Übrige Bodenbedeckung']] as const
 const props={legende,quelle:'Amtliche Vermessung Kanton BE; Datenstand 29.10.2026',objekte:[{klasse:'strasse'},{klasse:'gebaeude'}],
  setzen:()=>{},artSetzen:()=>{},arten:new Set(['strasse'])}
 const an=renderToStaticMarkup(<AvEbenenWahl {...props} an />)
 expect(an).toContain('2 im Ausschnitt');expect(an).toContain('Datenstand 29.10.2026');expect(an).toContain('q-av-arten')
 expect((an.match(/type="checkbox"/g)??[]).length).toBe(7)
 const aus=renderToStaticMarkup(<AvEbenenWahl {...props} an={false} />)
 expect(aus).not.toContain('q-av-arten');expect((aus.match(/type="checkbox"/g)??[]).length).toBe(1)
 let tiefe=0;for(const tag of an.match(/<\/?label\b[^>]*>/g)??[]){tiefe+=tag.startsWith('</')?-1:1;expect(tiefe).toBeLessThanOrEqual(1)}
 expect(tiefe).toBe(0)
})
it('zeigt statt der Zahl den Stand, wenn der Rechner ihn mitgibt',()=>{
 expect(renderToStaticMarkup(<AvEbenenWahl quelle="q" objekte={[]} an setzen={()=>{}} artSetzen={()=>{}} arten={new Set()} legende={[]} zahl="lädt …" />)).toContain('lädt …')
})
