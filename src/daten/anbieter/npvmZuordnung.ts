import { add, dist, einheit, sub, type P } from '../../geo'
import { abstandLinie, achsSchnitte } from '../geoHilfen'
import type { NpvmBeleg, NpvmSnapshot } from './npvm'

export type NpvmZuordnung = { beleg: NpvmBeleg; hinweis: string } | { beleg: null; hinweis: string }
/** Konservative Zuordnung: echte Querung der Achse, Verlauf beidseits längs derselben OSM-Strasse; keine Summierung fremder Achsen. */
export function npvmZuordnen(s: NpvmSnapshot, achse: [P, P], spuren: readonly P[][], hoehenlageUnklar = false): NpvmZuordnung {
  const offen = (hinweis: string): NpvmZuordnung => ({ beleg: null, hinweis })
  if (s.bezugsjahr !== 2023) return offen('NPVM: Bezugsjahr bzw. Fahrzeug-/Richtungsbezug dieser Modellfassung noch nicht geprüft; DTV offen')
  if (hoehenlageUnklar) return offen('NPVM: Brücke, Tunnel oder abweichende Höhenlage; automatische Zuordnung offen')
  const [a, b] = achse
  if (dist(a, b) < 0.5 || !spuren.some(z => z.length >= 2)) return offen('NPVM: keine belastbare Querungs- und Strassenachse; DTV offen')
  if (![a, b].every(p => Math.max(Math.abs(p[0] - s.mitte[0]), Math.abs(p[1] - s.mitte[1])) + 25 <= s.radiusM))
    return offen('NPVM: Querung ausserhalb der geladenen Abdeckung; DTV offen')
  const kandidaten = s.linien.filter(l => achsSchnitte(l.teile, a, b, 1).some(x => {
    if (x.winkel < 60) return false
    const u = einheit(sub(b, a)), t: P = [-u[1], u[0]]
    const proben = [-12, 0, 12].map(m => add(x.p, t, m))
    return proben.every(p => abstandLinie(p, l.teile) <= 6 && spuren.some(z => abstandLinie(p, [z]) <= 6))
  }))
  if (kandidaten.length !== 1) return offen(kandidaten.length ? 'NPVM: mehrere passende Modellstrecken (z. B. parallele Fahrbahnen oder Knoten); DTV offen' :
    'NPVM: keine eindeutig passende Modellstrecke; fehlender Eintrag bedeutet nicht keinen Verkehr')
  const l = kandidaten[0]
  if (l.dtv === null) return offen('NPVM: passende Modellstrecke ohne gültigen DTV; Wert offen')
  // Richtungssumme je Modellstrecke wurde anhand des offiziellen NPVM-Exports 2023 geprüft; kein Addieren benachbarter Strecken.
  const beleg: NpvmBeleg = { version: 1, quelleId: 'are.npvm', wert: l.dtv, linie: l.id, nr: l.nr, bezugsjahr: s.bezugsjahr,
    datenstand: s.datenstand, abgerufen: s.abgerufen, url: s.url, achse: [[...a], [...b]],
    bezug: 'summe_richtungen_je_modellstrecke', zuordnung: 'achsenschnitt_und_osm_nähe' }
  return { beleg, hinweis: 'Achse wird eindeutig gequert; Verlauf beidseits im Abstand höchstens 6 m an derselben OSM-Strasse; Zuordnung vor Übernahme prüfen' }
}
