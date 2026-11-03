import { dot, einheit, imPolygon, sub, type P } from '../../../geo'
import { regionalDienst } from './regionalDienste'
import type { RegionalSnapshot, RegionalZone } from './regional'
import type { ZhStrasse } from './zuerichZuordnung'
export interface RegionalTreffer { quelle: string; name: string; tempo: number | null; zone: RegionalZone | null; sicher: boolean; grund: string; ids: string[]; datenstand: string }
const name = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
const hoehe = (t: Record<string, string>) => t.bridge && t.bridge !== 'no' || t.tunnel && t.tunnel !== 'no' || t.layer && t.layer !== '0'
function abstand(p: P, teile: P[][], r?: P): number {
  let d = Infinity
  for (const l of teile) for (let i = 1; i < l.length; i++) {
    const a = l[i - 1], v = sub(l[i], a), l2 = dot(v, v)
    if (!l2 || r && Math.abs(dot(einheit(v), einheit(r))) < Math.cos(10 * Math.PI / 180)) continue
    const t = Math.max(0, Math.min(1, dot(sub(p, a), v) / l2))
    d = Math.min(d, Math.hypot(p[0] - a[0] - t * v[0], p[1] - a[1] - t * v[1]))
  }
  return d
}
/** Strassenbezug ist Pflicht. Geometrisch passende namenlose amtliche Achsen bleiben Bestätigungsvorschläge.
 * Zonen alleine belegen weder Vortritt noch das Tempo einer möglicherweise ausgenommenen Hauptstrasse. */
export function regionalBei(s: RegionalSnapshot, p: P, r: P, strassen: readonly ZhStrasse[]): RegionalTreffer[] {
  if (Math.max(Math.abs(p[0] - s.mitte[0]), Math.abs(p[1] - s.mitte[1])) > s.radiusM - 10) return []
  const osm = strassen.map(w => ({ w, d: abstand(p, w.teile, r) })).filter(x => x.d <= 5).sort((a, b) => a.d - b.d)
  if (!osm.length) return []
  const ws = osm.filter(x => x.d <= osm[0].d + 1)
  if (ws.some(x => hoehe(x.w.tags)) || new Set(ws.map(x => name(x.w.name))).size > 1) return []
  const w = ws[0].w
  const out: RegionalTreffer[] = []
  for (const t of s.teile) {
    const d = regionalDienst(t.id); if (!d || !['tempo', 'zone'].includes(d.art)) continue
    const ls = t.objekte.filter(o => o.teile ? abstand(p, o.teile, r) <= 3 && (!o.name || name(o.name) === name(w.name))
      : o.polygone?.some(poly => imPolygon(p, poly)) && !o.polygone.some(poly => abstand(p, poly) <= 3))
    if (!ls.length) continue
    const vs = new Set(ls.map(o => `${o.tempo}|${o.zone}|${o.bestaetigen}`)), o = ls[0]
    const klar = vs.size === 1, v = d.art === 'zone' ? o.zone === 't30_zone' ? 30 : o.zone === 'begegnungszone' ? 20 : null : o.tempo
    // Automatik nur für amtliche Linien mit passendem Namen. Alle übrigen Treffer werden explizit angeboten.
    const sicher = klar && !ls.some(o => o.bestaetigen) && d.art === 'tempo' && !!o.name && v !== null
    out.push({ quelle: d.id, name: d.anbieter, tempo: klar ? v : null, zone: klar ? o.zone : null, sicher,
      grund: !klar ? 'widersprüchliche amtliche Objekte; Zuordnung offen' : `${sicher ? 'passender amtlicher Abschnitt' : 'räumlicher Treffer; Strasse, Signalisation und Umsetzung bestätigen'}${ls.some(o => !o.name) ? '; amtlicher Strassenname fehlt' : ''}; ${ls.map(o => o.hinweis).filter(Boolean).join('; ')}; ${d.hinweis}`,
      ids: ls.map(o => o.id), datenstand: t.datenstand })
  }
  for (const x of out.filter(x => x.sicher)) {
    const widerspruch = out.some(z => regionalDienst(z.quelle)?.art === 'zone' && z.zone && (z.zone === 'fussgaengerzone' || z.tempo !== x.tempo))
    if (widerspruch) { x.sicher = false; x.grund += '; amtliche Linie und Zoneninventar widersprechen sich; Signalisation prüfen' }
  }
  // Unterschiedliche unabhängige Inventare dürfen sich nicht still gegenseitig überschreiben.
  const sichere = out.filter(x => x.sicher)
  if (new Set(sichere.map(x => x.tempo)).size > 1) for (const x of sichere) { x.sicher = false; x.grund += '; Widerspruch zwischen amtlichen Diensten' }
  return out
}
export function regionalEntlang(s: RegionalSnapshot, proben: { p: P; richtung: P }[], strassen: readonly ZhStrasse[]): RegionalTreffer[] {
  if (!proben.length) return []
  const alle = proben.map(p => regionalBei(s, p.p, p.richtung, strassen))
  return alle[0].map(x => {
    const xs = alle.map(a => a.find(y => y.quelle === x.quelle)), stabil = xs.every(y => y && y.tempo === x.tempo && y.zone === x.zone)
    return { ...x, tempo: stabil ? x.tempo : null, zone: stabil ? x.zone : null, sicher: stabil && xs.every(y => y?.sicher === true),
      grund: stabil ? x.grund : 'Tempo-/Zonenwechsel oder fehlender Bezug entlang der Querung; offen', ids: [...new Set(xs.flatMap(y => y?.ids ?? []))] }
  })
}
export const regionalTempoTreffer = (s: RegionalSnapshot, p: P, r: P, strassen: readonly ZhStrasse[]) => {
  const xs = regionalBei(s, p, r, strassen).filter(x => x.sicher && x.tempo !== null)
  return xs.length && new Set(xs.map(x => x.tempo)).size === 1 ? { tempo:xs[0].tempo!, quelle:[...new Set(xs.map(x=>`${x.name}; Datenstand ${x.datenstand}`))].join(' / ') } : null
}

export const regionalTempo = (s: RegionalSnapshot, p: P, r: P, strassen: readonly ZhStrasse[]) => regionalTempoTreffer(s,p,r,strassen)?.tempo ?? null
