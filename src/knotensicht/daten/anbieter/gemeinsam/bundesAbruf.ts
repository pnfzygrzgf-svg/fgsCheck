import { holeJson, holeText } from '../../holen'
import { mitBundesBudget } from './bundesBudget'
/** Der Platz im Budget bleibt bis zum vollständig gelesenen Antwortinhalt belegt. */
export const holeBundText:typeof holeText=(url,init,ms,signal)=>mitBundesBudget(signal,s=>holeText(url,init,ms,s))
export const holeBundJson:typeof holeJson=(url,init,ms,signal)=>mitBundesBudget(signal,s=>holeJson(url,init,ms,s))
