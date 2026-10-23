// ── Trottoirüberfahrt am Streifen (23.10.2026): Hinweis im Reiter Sichtprüfung ──
//
// Für eine Trottoirüberfahrt gilt die Sicht auf die Wartefläche nicht; massgebend ist die Knotensicht, die fgsCheck nicht rechnet.
// Der Hinweis verweist auf den SichtweitenCheck (mit dem OSM-Knoten der Lage, falls bekannt) und auf die Frage im Bedarf.

import { REITER_NAME } from './reiter'
import { FELD_DEF, feldName, wertText } from './bedarf/felder'
import { sichtweitenCheckUrl, TUE_NUR_EINMUENDUNG } from './texte'

/** knoten: OSM-Knoten der Lage (Vorbelegung); lage: bekannte Lage, die keine Einmündung ist (sonst null) */
export function TueHinweis({ knoten, lage }: { knoten: number | null; lage: string | null }) {
  const d = FELD_DEF.get('lage')
  return <p className="tue klein"><b>Trottoirüberfahrt:</b> Massgebend ist die Knotensicht der Einbiegenden. fgsCheck rechnet sie
    nicht – mit dem <a href={sichtweitenCheckUrl(knoten)} target="_blank" rel="noopener noreferrer">SichtweitenCheck ↗</a> prüfen
    und im Reiter «{REITER_NAME.bedarf}» die Frage «{feldName('q3.knotensichtOk')}» beantworten.
    {lage && <span className="warnung"> Lage laut Bedarf: {d ? wertText(d, lage) : lage} – Trottoirüberfahrten gibt es {TUE_NUR_EINMUENDUNG}.</span>}</p>
}
