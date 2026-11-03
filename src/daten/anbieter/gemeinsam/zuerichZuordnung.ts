import { dot, einheit, imPolygon, lv95, sub, type P } from '../../../geo'
import type { ZhLinie, ZhZone, ZuerichSnapshot } from './zuerich'

export interface ZhStrasse { name: string; tags: Record<string, string>; teile: P[][] }
export const zhStrassen = (wege: readonly { tags: Record<string, string>; geom: [number, number][] }[]): ZhStrasse[] =>
  wege.filter(w => !!w.tags.highway).map(w => ({ name: w.tags.name ?? '', tags: w.tags, teile: [w.geom.map(p => lv95(...p))] }))
const name = (s: string) => s.toLocaleLowerCase('de-CH').normalize('NFKC').replace(/\s+/g, ' ').trim()
const zukunft = (d: string | null, heute: string) => d !== null && d > heute
function abstand(p: P, teile: P[][], richtung?: P): number {
  let d = Infinity
  for (const z of teile) for (let i = 1; i < z.length; i++) {
    const a = z[i - 1], w = sub(z[i], a), l2 = dot(w, w)
    if (!l2 || richtung && Math.abs(dot(einheit(w), einheit(richtung))) < Math.cos(20 * Math.PI / 180)) continue
    const t = Math.max(0, Math.min(1, dot(sub(p, a), w) / l2))
    d = Math.min(d, Math.hypot(p[0] - a[0] - t * w[0], p[1] - a[1] - t * w[1]))
  }
  return d
}
export type ZhTreffer = { tempo: number | null; zone: ZhZone['art']; status: 'zugeordnet' | 'offen' | 'aussen';
  vorschlag?: number; bedingung?: string; grund: string; linien: string[]; zonen: string[]; strasse: string }
/** Pilotparameter anhand echter Zürcher Achsen geprüft: 4 m zum amtlichen Abschnitt, 20° längs, gleicher Strassenname.
 * Keine allgemeine 8-m-Nächste-Linie-Regel. Unklare Parallelstrassen, Ebenen oder Zonenränder bleiben offen. */
export function zuerichBei(s: ZuerichSnapshot, p: P, richtung: P, strassen: readonly ZhStrasse[], heute = new Date().toISOString().slice(0, 10)): ZhTreffer {
  const offen = (grund: string, status: ZhTreffer['status'] = 'offen'): ZhTreffer => ({ tempo: null, zone: null, status, grund, linien: [], zonen: [], strasse: '' })
  if (Math.max(Math.abs(p[0] - s.mitte[0]), Math.abs(p[1] - s.mitte[1])) > s.radiusM - 6) return offen('ausserhalb des geladenen Zürcher Ausschnitts', 'aussen')
  if (!s.tempo) return offen('Zürcher Tempoabschnitte nicht geladen')
  const osm = strassen.map(w => ({ w, d: abstand(p, w.teile, richtung) })).filter(x => x.d <= 6).sort((a, b) => a.d - b.d)
  if (!osm.length) return offen('kein belastbarer OSM-Strassenbezug')
  const wege = osm.filter(x => x.d <= osm[0].d + 1)
  const hoehe = (t: Record<string, string>) => t.bridge && t.bridge !== 'no' || t.tunnel && t.tunnel !== 'no' || t.layer && t.layer !== '0'
  if (wege.some(x => hoehe(x.w.tags))) return offen('Brücke, Tunnel oder andere Höhenlage: Zürcher Zuordnung prüfen')
  if (!wege[0].w.name || wege.some(x => name(x.w.name) !== name(wege[0].w.name))) return offen('Strassenname fehlt oder mehrere OSM-Strassen passen')
  const nahe = s.tempo.objekte.filter(l => abstand(p, l.teile, richtung) <= 4)
  const ls = nahe.filter(l => name(l.name) === name(wege[0].w.name))
  if (!ls.length) return offen(nahe.length ? 'amtlicher Abschnitt gehört zu einer anderen Strasse' : 'kein passender amtlicher Tempoabschnitt')
  if (ls.some(l => zukunft(l.umgesetzt, heute) || zukunft(l.rechtskraeftig, heute))) return offen('Abschnitt noch nicht umgesetzt bzw. rechtskräftig')
  if (new Set(ls.map(l => `${l.regime}|${l.code}`)).size !== 1) return offen('mehrere widersprechende Tempoabschnitte am selben Ort')
  const l = ls[0]
  if (l.verbot) return { ...offen('Fahrverbot für allgemeinen MIV; Ausnahmen und Signalisation vor Ort prüfen. Kein Tempo 0.'), linien: ls.map(x => x.id), strasse: l.name }
  const tagesregel = l.code === 'T30N0' && l.regime === 'T30 tagsüber, Nachtfahrverbot'
  const v = tagesregel ? 30 : l.tempo
  if (v === null) return { ...offen(`Zürcher Temporegime «${l.regime}» (${l.code}); Signalisation und zeitliche Gültigkeit von Hand prüfen`), linien: ls.map(x=>x.id), strasse:l.name }
  if (!s.zonen) return offen('Verkehrszonen nicht geladen; Widerspruchsprüfung offen')
  const innen = s.zonen.objekte.filter(z => z.polygone.some(poly => imPolygon(p, poly)))
  const rand = s.zonen.objekte.some(z => z.polygone.some(poly => abstand(p, poly) <= 2))
  if (rand) return offen('Zonenrand innerhalb 2 m: Strassen- und Zonenzuordnung prüfen')
  if (innen.some(z => !z.art || zukunft(z.umgesetzt, heute) || zukunft(z.rechtskraeftig, heute)) || new Set(innen.map(z => z.art)).size > 1)
    return offen('mehrdeutige oder noch nicht umgesetzte Verkehrszonen')
  const z = innen[0], soll = z?.art === 't30_zone' ? 30 : z?.art === 'begegnungszone' ? 20 : z?.art === 'fussgaengerzone' ? null : undefined
  if (z?.art === 'fussgaengerzone' || soll !== undefined && soll !== v) return { ...offen(z?.art === 'fussgaengerzone'
    ? 'Fussgängerzone: keine gewöhnliche Strasse, Sonderzulassungen und Signalisation prüfen' : 'amtliche Tempolinie und Verkehrszone widersprechen sich'),
    zone: z?.art ?? null, linien: ls.map(x => x.id), zonen: innen.map(x => x.id), strasse: l.name }
  if (tagesregel) return { ...offen('30 km/h tagsüber; Nachtfahrverbot. Zeitliche Gültigkeit und Ausnahmen vor Ort prüfen; Tagesregel ausdrücklich bestätigen.'), vorschlag:30, bedingung:'tagsüber; nachts Fahrverbot', linien:ls.map(x=>x.id), zonen:innen.map(x=>x.id), strasse:l.name }
  return { tempo: v, zone: z?.art ?? null, status: 'zugeordnet', grund: z ? `passender Tempoabschnitt und ${z.regime} «${z.name}»`
    : 'passender Tempoabschnitt; kein Zoneneintrag am geprüften Punkt (keine Vollständigkeitsgarantie)', linien: ls.map(x => x.id), zonen: innen.map(x => x.id), strasse: l.name }
}
/** Querung/Zufahrt muss über mehrere Proben stabil demselben Abschnitt/Regime zugeordnet werden. */
export function zuerichEntlang(s: ZuerichSnapshot, proben: { p: P; richtung: P }[], strassen: readonly ZhStrasse[]): ZhTreffer {
  const xs = proben.map(p => zuerichBei(s, p.p, p.richtung, strassen))
  const schlecht = xs.find(x => x.status !== 'zugeordnet')
  if (schlecht) {
    const gleich = schlecht.vorschlag !== undefined && xs.every(x=>x.vorschlag === schlecht.vorschlag && x.bedingung === schlecht.bedingung && name(x.strasse) === name(schlecht.strasse))
    return { ...schlecht, ...(gleich ? { linien:[...new Set(xs.flatMap(x=>x.linien))] } : { vorschlag: undefined, bedingung: undefined }) }
  }
  if (!xs.length || new Set(xs.map(x => `${x.tempo}|${x.zone}|${name(x.strasse)}`)).size !== 1)
    return { tempo: null, zone: null, status: 'offen', grund: 'wechselndes Tempo, Zone oder Strasse entlang der Querung', linien: [], zonen: [], strasse: '' }
  return { ...xs[0], linien: [...new Set(xs.flatMap(x => x.linien))], zonen: [...new Set(xs.flatMap(x => x.zonen))] }
}
export const zhLinienFuerKarte = (s: ZuerichSnapshot): ZhLinie[] => s.tempo?.objekte ?? []
