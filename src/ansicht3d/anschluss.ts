// Nur Darstellung: ergänzte Fahrbahn am Brückenkopf, ausschliesslich innerhalb der AV-Strassenfläche.
import { abstandStrecke, dist, type P } from '../geo'
import { abstandPunkt, differenz, enthaelt, schnitt, vereinigung, type Multi, type Poly } from '../rechner/poly'
import { wegBezug, type FahrbahnProbe } from './fahrbahn'
import { LN02_ZU_SZENE_M, type Grundriss } from './kunstbauten'

export const ANSCHLUSS_MIN_M = 0.3
export const ANSCHLUSS_NAEHE_M = 20
export const ERSATZ_HALBBREITE_M = 3
export const ANSCHLUSS_TEXT = 'Ergänzter Fahrbahnanschluss: Darstellung, keine gemessene Fläche. Höhe aus der bestätigten Fahrbahn; Breite aus der AV-Strassenfläche, ersatzweise 6 m, immer auf die AV-Strassenfläche begrenzt.'
export interface AnschlussProbe { punkte: [P, P, P]; hoehen: [number, number, number] }
export interface AnschlussFlaeche { ringe: Poly; hoehen: number[][] }

function querBreite(p: P, n: P, strassen: Multi): [number, number] | null {
  if (!enthaelt(strassen, p) && abstandPunkt(strassen, p) > 1e-6) return null
  const schnitte: number[] = []
  for (const poly of strassen) for (const ring of poly) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1]
    const nenner = n[0] * dy - n[1] * dx
    if (Math.abs(nenner) < 1e-9) continue
    const ap: P = [a[0] - p[0], a[1] - p[1]]
    const t = (ap[0] * dy - ap[1] * dx) / nenner, u = (ap[0] * n[1] - ap[1] * n[0]) / nenner
    if (u >= 0 && u <= 1) schnitte.push(t)
  }
  const links = schnitte.filter(x => x < -1e-6), rechts = schnitte.filter(x => x > 1e-6)
  return [links.length ? Math.max(...links) : -ERSATZ_HALBBREITE_M, rechts.length ? Math.min(...rechts) : ERSATZ_HALBBREITE_M]
}
/** Kleine Streifen entlang bestätigter Wege. Ohne AV oder ohne Brückennähe entsteht nichts. */
export function anschlussProben(wege: readonly (readonly FahrbahnProbe[])[], strassen: Multi,
  nahe: (p: P) => boolean): AnschlussProbe[] {
  if (!strassen.length) return []
  const aus: AnschlussProbe[] = []
  for (const weg of wege) for (let i = 1; i < weg.length; i++) {
    const a = weg[i - 1], b = weg[i], ha = a.hoehe.h, hb = b.hoehe.h, l = dist(a.p, b.p)
    if (ha === null || hb === null || l < 0.01 || l > 1.5) continue
    const m: P = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2]
    if (!nahe(m)) continue
    const n: P = [-(b.p[1] - a.p[1]) / l, (b.p[0] - a.p[0]) / l], breite = querBreite(m, n, strassen)
    if (!breite) continue
    const bei = (p: P, t: number): P => [p[0] + t * n[0], p[1] + t * n[1]]
    const ps = [bei(a.p, breite[0]), bei(a.p, breite[1]), bei(b.p, breite[1]), bei(b.p, breite[0])]
    aus.push({ punkte: [ps[0], ps[1], ps[2]], hoehen: [ha, ha, hb] }, { punkte: [ps[0], ps[2], ps[3]], hoehen: [ha, hb, hb] })
  }
  return aus
}
export function fahrbahnAmPunkt(p: P, wege: readonly (readonly FahrbahnProbe[])[]): number | null {
  const bezuege = wege.map(w => wegBezug(p, w)).filter((x): x is NonNullable<typeof x> => !!x && x.abstand <= 8)
    .sort((a, b) => a.abstand - b.abstand)
  if (!bezuege.length) return null
  const nah = bezuege.filter(x => x.abstand <= bezuege[0].abstand + 0.5)
  if (nah.some(x => x.hoehe.h === null)) return null
  const hs = nah.map(x => x.hoehe.h!)
  return Math.max(...hs) - Math.min(...hs) <= 0.75 ? hs[0] : null
}
/** Bestehende Flächen nahe der gewählten Höhe ausschneiden, auch am schrägen Rand exakt. */
export function tragendeFlaechen(g: Grundriss | null, wege: readonly (readonly FahrbahnProbe[])[]): Multi {
  if (!g) return []
  const aus: Multi = [], d = g.dreiecke
  for (let i = 0; i + 8 < d.length; i += 9) {
    const ps: P[] = [[d[i], d[i + 1]], [d[i + 3], d[i + 4]], [d[i + 6], d[i + 7]]]
    const fl = (ps[1][0] - ps[0][0]) * (ps[2][1] - ps[0][1]) - (ps[2][0] - ps[0][0]) * (ps[1][1] - ps[0][1])
    if (Math.abs(fl) < 1e-6) continue
    if (ps.every((p, j) => { const h = fahrbahnAmPunkt(p, wege); return h !== null && Math.abs(d[i + 3 * j + 2] + LN02_ZU_SZENE_M - h) <= 0.75 })) aus.push([ps])
  }
  return aus.length ? vereinigung(aus) : []
}
/** Dreiecke an der Höhendifferenz zum Gelände schneiden; null bleibt eine Lücke. */
export function anschlussFlaechen(proben: readonly AnschlussProbe[], terrain: readonly (number | null)[],
  strassen: Multi, traeger: Multi, wege: readonly (readonly FahrbahnProbe[])[], nahe: (p: P) => boolean, getragen: readonly boolean[] = []): AnschlussFlaeche[] {
  const teile: Multi = []
  proben.forEach((probe, i) => {
    if (getragen.slice(3 * i, 3 * i + 3).some(Boolean)) return
    const ts = terrain.slice(3 * i, 3 * i + 3)
    if (ts.length !== 3 || ts.some(h => h === null || !Number.isFinite(h))) return
    const ring: P[] = []
    for (let j = 0; j < 3; j++) {
      const k = (j + 1) % 3, a = probe.punkte[j], b = probe.punkte[k]
      const da = probe.hoehen[j] - ts[j]! - ANSCHLUSS_MIN_M, db = probe.hoehen[k] - ts[k]! - ANSCHLUSS_MIN_M
      if (da > 0) ring.push(a)
      if ((da > 0) !== (db > 0)) { const t = da / (da - db); ring.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]) }
    }
    if (ring.length < 3) return
    for (const poly of differenz(schnitt([[ring]], strassen), traeger)) {
      if (poly.flat().every(nahe)) teile.push(poly)
    }
  })
  if (!teile.length) return []
  const aus: AnschlussFlaeche[] = []
  for (const ringe of vereinigung(teile)) {
    const hoehen = ringe.map(r => r.map(p => fahrbahnAmPunkt(p, wege)))
    if (hoehen.every(r => r.every((h): h is number => h !== null))) aus.push({ ringe, hoehen: hoehen as number[][] })
  }
  return aus
}
/** Für die Brückennähe ausserhalb einer Kunstbaute genügt der genaue Abstand zur AV-Hülle. */
export function naheUmriss(p: P, umrisse: Multi): boolean {
  if (enthaelt(umrisse, p)) return true
  return umrisse.some(poly => poly.some(r => r.some((a, i) => abstandStrecke(p, a, r[(i + 1) % r.length]) <= ANSCHLUSS_NAEHE_M)))
}
