import { quellenQualitaetText, type QuellenQualitaet } from './qualitaet'
export interface QuellenLadeinfo extends QuellenQualitaet { fehler?: string }
/** Nur ein vorhandener Datenausschnitt belegt einen abgeschlossenen Abruf, nicht dessen Metadateneintrag. */
export function regionalEbenenZustand(vorhanden: boolean, anzahl: number, meta?: QuellenLadeinfo): 'zeigen' | 'ohne' | 'laedt' | 'fehler' | null {
  if (meta?.fehler) return 'fehler'
  if (vorhanden) return anzahl ? 'zeigen' : 'ohne'
  return meta ? 'laedt' : null
}
export interface ObjektHerkunft { quellenHinweis?: string; quelle?: string; quellenSchluessel?: string; datenstand?: string; text: string }
export function objektQualitaet(o: ObjektHerkunft, vorgabe?: QuellenQualitaet, metadaten?: Readonly<Record<string, QuellenQualitaet>>): QuellenQualitaet {
  const q = o.quellenSchluessel ? metadaten?.[o.quellenSchluessel] : vorgabe
  return { ...q, ...(o.datenstand ? { datenstand: o.datenstand } : {}) }
}
/** Nur tatsächlich vorkommende Anbieter; gemischte Daten behalten je Anbieter ihren eigenen Stand. */
export function ebenenQuellenText(objekte: readonly ObjektHerkunft[], vorgabe: string, qualitaet?: QuellenQualitaet, metadaten?: Readonly<Record<string, QuellenQualitaet>>): string {
  if (!objekte.length) return `${vorgabe}; ${quellenQualitaetText(qualitaet)}`
  return [...new Set(objekte.map(o => `${o.quelle || vorgabe}; ${quellenQualitaetText(objektQualitaet(o, qualitaet, metadaten))}`))].join(' · ')
}
export function objektQuellenText(o: ObjektHerkunft, vorgabe: string, qualitaet?: QuellenQualitaet, metadaten?: Readonly<Record<string, QuellenQualitaet>>): string {
  // Der Diensthinweis bleibt in der Ebenenbeschreibung, wird im Objekttext aber nur einmal ausgegeben.
  const quelle = o.quelle || vorgabe
  const hinweis = o.quellenHinweis
  const ohneWiederholung = hinweis && o.text.includes(hinweis) && quelle.endsWith(`; ${hinweis}`)
    ? quelle.slice(0, -hinweis.length - 2) : quelle
  return `${o.text}; Quelle: ${ohneWiederholung}; ${quellenQualitaetText(objektQualitaet(o, qualitaet, metadaten))}`
}
