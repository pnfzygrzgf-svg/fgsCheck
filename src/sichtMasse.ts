import { fgsSichtId } from './SichtKennung'
import { add, sub, dist, einheit, type P } from './geo'
import type { SichtArt } from './Sichtfelder'

export interface SichtMass { objekt?: string; objekte?: string[]; art: SichtArt; linien: P[][]; p: P; text: string; hinweis: string }
const f = (x: number) => x.toFixed(1).replace('.', ',')
/** Exakte Bogenlänge, auch zwischen Stützpunkten; nie die Diagonale als Sichtweite ausgeben. */
export function massStrecke(linie: P[], soll: number): { linie: P[]; laenge: number } {
  if (!linie.length || !Number.isFinite(soll) || soll < 0) return { linie: [], laenge: 0 }
  const aus: P[] = [linie[0]]
  let rest = soll
  for (let i = 1; i < linie.length && rest > 1e-8; i++) {
    const a = linie[i - 1], b = linie[i], d = dist(a, b)
    if (d < 1e-8) continue
    if (d > rest) { aus.push(add(a, sub(b, a), rest / d)); rest = 0 }
    else { aus.push(b); rest -= d }
  }
  return { linie: aus, laenge: soll - rest }
}
export function massAchse(achse: P[], soll: number, name: string, art: SichtArt, versatz = 3): SichtMass | null {
  const m = massStrecke(achse, soll), l = m.linie
  if (l.length < 2 || m.laenge < 0.01) return null
  const u = einheit(sub(l[l.length - 1], l[0])), n: P = [-u[1], u[0]]
  const pl = l.map(p => add(p, n, versatz)), linien: P[][] = [pl, [l[0], pl[0]], [l[l.length - 1], pl[pl.length - 1]]]
  // Pfeile an beiden Enden, auf den Masslinien; kleine feste Länge in Meter.
  for (const [p, q] of [[pl[0], pl[1]], [pl[pl.length - 1], pl[pl.length - 2]]]) {
    const t = einheit(sub(q, p)), v: P = [-t[1], t[0]], a = add(p, t, Math.min(0.8, m.laenge / 4))
    linien.push([add(a, v, 0.3), p, add(a, v, -0.3)])
  }
  const mitte = massStrecke(pl, m.laenge / 2).linie
  const unvollstaendig = m.laenge + 0.05 < soll
  return { art, linien, p: mitte[mitte.length - 1], text: `${name} ${f(soll)} m${unvollstaendig ? ` (gezeichnet ${f(m.laenge)} m)` : ''}`,
    hinweis: unvollstaendig ? 'Die geladene Achse erreicht die erforderliche Sichtweite nicht; die Masslinie endet an der vorhandenen Geometrie.' :
      'Mass entlang der berechneten Achse; versetzte Masslinie mit Bezugslinien.' }
}
export function massPunkt(p: P, text: string, art: SichtArt, hinweis = ''): SichtMass { return { art, linien: [], p, text, hinweis } }
export function sichtLinie(D: P, ziel: P, text: string, art: SichtArt): SichtMass {
  return { art, linien: [[D, ziel]], p: add(D, sub(ziel, D), 0.65), text, hinweis: 'Sichtlinie, keine entlang der Strasse gemessene Sichtweite.' }
}
export function massGerade(a: P, b: P, name: string, art: SichtArt, versatz = 3): SichtMass | null {
  return massAchse([a, b], dist(a, b), name, art, versatz)
}

/** Schrift ist in SVG-Einheiten skaliert; ihr Platz gehört ebenfalls zum Bildausschnitt. */
export function massBildPunkte(masse: SichtMass[], breiteM: number, vb = 1000): P[] {
  return masse.flatMap(m => {
    const halb = (m.text.length * 8 + 12) * breiteM / vb / 2
    return [...m.linien.flat(), [m.p[0] - halb, m.p[1]] as P, [m.p[0] + halb, m.p[1] + 22 * breiteM / vb] as P]
  })
}

import type { FallRechnung } from './rechner'
import { veloSoll } from './veloSicht'
import type { NeigungMessung } from './knotensicht/rechner/typen'
import { tueGezeichnet, ksDreieckSichtbar, type KsPhase } from './tue/karte'
export function fgsSichtMasse(r: FallRechnung | null, neigung: Readonly<Record<string, NeigungMessung>> | null = null, phase: KsPhase = 'beide'): SichtMass[] {
  const out: SichtMass[] = []
  const dazu = (m: SichtMass | null) => { if (m) out.push(m) }
  for (const s of r?.streifen ?? []) {
    for (const z of s.zufahrten) {
      const beginn = out.length
      dazu(massAchse(z.spur, z.sichtweite, z.art === 'abbiegend' ? 'Sₖ Auto' : 'Sicht Auto', 'auto'))
      const lm = massStrecke(z.spur, z.sichtweite).linie
      if (z.kurvenradiusM != null && lm.length) out.push(massPunkt(lm[Math.floor(lm.length / 2)], `R ${f(z.kurvenradiusM)} m`, 'auto', 'Kurvenradius aus der Rechnung; keine nachträgliche Schätzung aus der Zeichnung.'))
      if (z.sichtpunktVomRandM != null && lm.length >= 2) {
        const ziel = lm[lm.length - 1], u = einheit(sub(ziel, lm[lm.length - 2])), n: P = [-u[1], u[0]]
        dazu(massGerade(ziel, add(ziel, n, z.sichtpunktVomRandM), 'd', 'auto', 1))
      }
      const vs = veloSoll(z, neigung)
      if (z.velo && vs) dazu(massAchse(z.velo.sichtpunkte, vs.A, 'Sicht Velo', 'velo', -3))
      for (const m of out.slice(beginn)) m.objekt = fgsSichtId(z)
    }
    if (!s.trottoirueberfahrt) for (const poly of s.ann) {
      const l = poly[0]
      // annäherungsbereich liefert vier Eckpunkte; nach AV-Anpassung nur die tatsächlich gezeichnete Geometrie bemassen.
      if (l?.length === 4) {
        const [a, b, c, d] = l, t = einheit(sub(b, a)), u = sub(d, a)
        const seitlich = u[0] * t[0] + u[1] * t[1], fuss = add(a, t, seitlich)
        for (const art of ['auto', 'velo'] as const) {
          if (art === 'velo' && !s.zufahrten.some(z => z.velo)) continue
          dazu(massGerade(fuss, d, 'Annäherung Tiefe', art, -1))
          dazu(massGerade(a, fuss, 'seitlich', art, -1))
          const v = sub(c, b), fussR = add(b, t, v[0] * t[0] + v[1] * t[1])
          dazu(massGerade(b, fussR, 'seitlich', art, 1))
          const winkel = Math.acos(Math.min(1, Math.max(-1, Math.abs(seitlich) / (Math.hypot(...u) || 1)))) * 180 / Math.PI
          out.push(massPunkt(add(a, sub(d, a), 0.5), `${f(winkel)}°`, art, 'Winkel des dargestellten Annäherungsbereichs.'))
        }
      }
    }
    for (const m of out) if (!m.objekt && !m.objekte) m.objekte = s.zufahrten.filter(z => m.art !== 'velo' || z.velo).map(fgsSichtId)
    const ks = s.knotensicht
    if (tueGezeichnet(ks)) {
      out.push(...(ks.karte.masse ?? []).filter(m => ksDreieckSichtbar(m.art === 'ueberholen' ? 'auto' : m.art, phase)))
    }
  }
  return out
}
