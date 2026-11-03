import { istObjekt } from './regionalGeometrie'
import { regionalDatum } from './regional'
export interface BundBeleg { feld: 'typ' | 'innerorts'; wert: 'es' | 'hvs' | boolean; quelleId: 'bund.strasse' | 'bund.bauzone'; objektIds: string[]; datenstand: string; abgerufen: string; text: string }
export function bundBelegLesen(x: unknown, feld: 'typ' | 'innerorts', wert: unknown): BundBeleg | null {
  if (!istObjekt(x) || x.feld !== feld || x.wert !== wert || (feld === 'typ' ? !['es','hvs'].includes(String(wert)) || x.quelleId !== 'bund.strasse' : typeof wert !== 'boolean' || x.quelleId !== 'bund.bauzone') || !Array.isArray(x.objektIds) || !x.objektIds.length || x.objektIds.length > 100 || !x.objektIds.every(id => typeof id === 'string' && id.startsWith(`${x.quelleId}:`) && id.length < 1000) || typeof x.datenstand !== 'string' || !x.datenstand || x.datenstand.length > 2000 || typeof x.abgerufen !== 'string' || !regionalDatum(x.abgerufen) || typeof x.text !== 'string' || !x.text || x.text.length > 8000) return null
  return { feld, wert: x.wert as BundBeleg['wert'], quelleId: x.quelleId as BundBeleg['quelleId'], objektIds: [...x.objektIds] as string[], datenstand: x.datenstand, abgerufen: x.abgerufen, text: x.text }
}
export function bundBelegText(x: BundBeleg): string { return `${x.text}; bestätigt für ${x.feld === 'typ' ? 'Strassentyp' : 'Innerortslage'}; Datenstand ${x.datenstand}; abgerufen ${x.abgerufen}` }
