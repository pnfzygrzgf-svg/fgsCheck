import { dot, einheit, imPolygon, sub, type P } from '../../../geo'
import type { RegionalObjekt, RegionalSnapshot } from './regional'
import { regionalDienst } from './regionalDienste'
import type { ZhStrasse } from './zuerichZuordnung'
export interface BundHinweis { quelleId: string; objekt: RegionalObjekt; datenstand: string; abgerufen: string; text: string; abstand: number }
export function linienAbstand(p: P, linien: P[][], richtung?: P): number {
  let d = Infinity
  for (const l of linien) for (let i = 1; i < l.length; i++) {
    const a = l[i - 1], v = sub(l[i], a), n = dot(v, v)
    if (!n || richtung && Math.abs(dot(einheit(v), einheit(richtung))) < Math.cos(Math.PI / 9)) continue
    const t = Math.max(0, Math.min(1, dot(sub(p, a), v) / n))
    d = Math.min(d, Math.hypot(p[0] - a[0] - t * v[0], p[1] - a[1] - t * v[1]))
  }
  return d
}
const name = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase('de-CH').replace(/\s+/g, ' ')
/** Das sind Prüfkandidaten, nie automatische Normklassierungen oder Belege für ein Fehlen. */
export function bundHinweise(s: RegionalSnapshot | null | undefined, p: P, richtung?: P, strassen: readonly ZhStrasse[] = []): BundHinweis[] {
  if (!s || Math.max(Math.abs(p[0] - s.mitte[0]), Math.abs(p[1] - s.mitte[1])) > s.radiusM - 10) return []
  const wege = strassen.filter(w => linienAbstand(p, w.teile, richtung) <= 6)
  const ebeneOffen = wege.some(w => w.tags.bridge && w.tags.bridge !== 'no' || w.tags.tunnel && w.tags.tunnel !== 'no' || w.tags.layer && w.tags.layer !== '0')
  const out: BundHinweis[] = []
  for (const t of s.teile) for (const o of t.objekte) {
    const b = o.bund
    if (!b || b.typ === 'unfall') continue
    let d = Infinity
    if (o.teile) d = linienAbstand(p, o.teile, b.typ === 'strasse' ? richtung : undefined)
    if (o.punkte) d = Math.min(...o.punkte.map(q => Math.hypot(q[0] - p[0], q[1] - p[1])))
    if (o.polygone) d = Math.min(...o.polygone.map(poly => imPolygon(p, poly) ? 0 : linienAbstand(p, poly)))
    const limit = b.typ === 'strasse' ? 6 : b.typ === 'tram' ? 20 : b.typ === 'bauzone' ? 15 : 200
    if (d > limit) continue
    if (b.typ === 'strasse' && (ebeneOffen || !richtung || ![200, 300].includes(b.code ?? 0) || !o.name || !wege.some(w => name(w.name) === name(o.name)) || wege.some(w => name(w.name) !== name(o.name)))) continue
    const text = `${regionalDienst(t.id)?.name}: ${o.name || b.typ}; ${Math.round(d)} m; ${o.hinweis}; Objekt ${o.id}; Datenstand ${o.stand ? o.stand.split('-').reverse().join('.') + ' (Objekt-/Exportstand)' : t.datenstand}; abgerufen ${t.abgerufen}. Zuordnung und fachliche Aussage bestätigen.`
    out.push({ quelleId: t.id, objekt: o, datenstand: o.stand ? `${o.stand.split('-').reverse().join('.')} (Objekt-/Exportstand)` : t.datenstand, abgerufen: t.abgerufen, text, abstand: d })
  }
  return out.sort((a,b) => a.abstand-b.abstand || a.objekt.id.localeCompare(b.objekt.id))
}
/** Proben nach gefahrenen Metern, unabhängig von Anzahl und Abstand der Stützpunkte. */
export function bundProbe(achse: readonly P[], meter=12): {p:P;richtung:P}|null {
  let rest=meter
  for(let i=1;i<achse.length;i++){
    const a=achse[i-1],v=sub(achse[i],a),l=Math.hypot(...v)
    if(l<0.001)continue
    if(rest<=l || i===achse.length-1){const d=Math.min(rest,l);return {p:[a[0]+v[0]*d/l,a[1]+v[1]*d/l],richtung:[v[0]/l,v[1]/l]}}
    rest-=l
  }
  return null
}
