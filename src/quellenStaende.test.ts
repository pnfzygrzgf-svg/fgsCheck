import { expect, it } from 'vitest'
import { quellenStaende } from './quellenStaende'
it('Statusmeldungen und Abrufzeiten ändern die Vorbelegungsgrundlage nicht',()=>{
 const vorher=quellenStaende({osm:{datenstand:'Stand 1'}},{})
 const meldung={osm:{datenstand:'Stand 1',ms:15,zeit:'jetzt'},av:{fehler:'Lädt …',ms:0}}
 expect(quellenStaende(meldung,vorher)).toBe(vorher)
 expect(quellenStaende({osm:{datenstand:'Stand 2'}},vorher)).toEqual({osm:{datenstand:'Stand 2'}})
 expect(quellenStaende({},vorher)).toEqual({})
})
it('blosse Metadaten ohne fachlichen Stand erzeugen keine neue Grundlage',()=>{
 const leer={}
 expect(quellenStaende({av:{vollstaendigkeit:'ja'}},leer)).toBe(leer)
})
