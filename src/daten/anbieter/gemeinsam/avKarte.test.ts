import { expect, it } from 'vitest'
import { AV_ARTEN, AV_VORAUSWAHL, avArtenLesen, avArtSichtbar, avKlasse, avKartenStil } from './avKarte'
it('AV-Hauptschalter und einzelne Arten wirken unabhängig; fehlender Speicher zeigt die Vorauswahl', () => {
 expect([...avArtenLesen(null)]).toEqual(['trottoir','verkehrsinsel','gebaeude'])
 expect(AV_ARTEN.filter(a => !AV_VORAUSWAHL.includes(a))).toEqual(['strasse','gruen','uebrige'])   // weiterhin zuschaltbar
 expect([...avArtenLesen(JSON.stringify(AV_ARTEN))]).toEqual(AV_ARTEN)
 const alle=new Set(AV_ARTEN)
 const weniger=new Set(alle);weniger.delete('gebaeude')
 expect(avArtSichtbar('Gebaeude',true,weniger)).toBe(false)
 expect(avArtSichtbar('Strasse_Weg',true,weniger)).toBe(true)
 expect(avArtSichtbar('Trottoir',false,weniger)).toBe(false)
 expect([...avArtenLesen('[]')]).toEqual([])
 expect([...avArtenLesen('["gebaeude","unbekannt",false]')]).toEqual(['gebaeude'])
 expect([...avArtenLesen('{kaputt')]).toEqual([...AV_VORAUSWAHL])
})
it('gleiche dezente AV-Farben und getrennte Bodenbedeckungsklassen für beide Rechner', () => {
 expect(avKartenStil('Strasse_Weg')).toEqual({farbe:'#6e6e6e',deckkraft:.25})
 expect(avKartenStil('Trottoir')).toEqual({farbe:'#e6e6c8',deckkraft:.45})
 expect(avKartenStil('Gebaeude')).toEqual({farbe:'#3f3f46',deckkraft:.5})
 expect(avKlasse('geschlossener_Wald')).toBe('gruen')
 expect(avKlasse('stehendes_Gewaesser')).toBe('uebrige')
 expect(avKartenStil('Gartenanlage').deckkraft).toBeLessThan(avKartenStil('Gebaeude').deckkraft)
})
