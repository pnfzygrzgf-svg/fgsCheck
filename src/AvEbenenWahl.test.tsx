import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AvEbenenWahl } from './AvEbenenWahl'
import { avArtenLesen } from './daten/anbieter/gemeinsam/avKarte'
it('AV-Elemente nur bei eingeschaltetem Hauptschalter, mit Anzahl und echtem Datenstand', () => {
 const props={quelle:'Amtliche Vermessung Kanton BE; Datenstand 29.10.2026',objekte:[{klasse:'strasse'},{klasse:'gebaeude'}],
  setzen:()=>{},artSetzen:()=>{},arten:avArtenLesen('["strasse"]')}
 const an=renderToStaticMarkup(<AvEbenenWahl {...props} an />)
 expect(an).toContain('2 im Ausschnitt');expect(an).toContain('Datenstand 29.10.2026');expect(an).toContain('q-av-arten')
 expect((an.match(/type="checkbox"/g)??[]).length).toBe(7)
 const aus=renderToStaticMarkup(<AvEbenenWahl {...props} an={false} />)
 expect(aus).not.toContain('q-av-arten');expect((aus.match(/type="checkbox"/g)??[]).length).toBe(1)
 let tiefe=0;for(const tag of an.match(/<\/?label\b[^>]*>/g)??[]){tiefe+=tag.startsWith('</')?-1:1;expect(tiefe).toBeLessThanOrEqual(1)}
 expect(tiefe).toBe(0)
})
