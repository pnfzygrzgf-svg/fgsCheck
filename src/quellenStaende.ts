import type { QuellenQualitaet } from './daten/anbieter/gemeinsam/qualitaet'
type Staende = Readonly<Record<string, QuellenQualitaet>>
/** Nur fachliche Datenstände können die Herkunft einer Vorbelegung ändern. */
export function quellenStaende(quellen:Readonly<Record<string, QuellenQualitaet & {ms?:number;fehler?:string;zeit?:string}>>, vorher:Staende):Staende {
 const neu=Object.fromEntries(Object.entries(quellen).filter(([,q])=>q.datenstand!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,q])=>[k,{datenstand:q.datenstand}]))
 return JSON.stringify(neu)===JSON.stringify(vorher)?vorher:neu
}
