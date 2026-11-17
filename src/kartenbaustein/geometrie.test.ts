// Schneller Punkt-in-Fläche-Test (17.11.2026): muss für jeden Punkt genau dasselbe ergeben wie imPolygon
import { describe, expect, it } from 'vitest'
import { imPolygon, imPolygonSchnell, type P } from './geometrie'
import { bordkanten, type MessAvFlaeche } from './messAv'

/** einfacher Zufall mit festem Anfang, damit der Test immer gleich läuft */
function zufall(start: number) { let x = start; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648 } }

/** sternförmige Fläche mit Loch, Koordinaten in LV95-Grössenordnung, teils auf Streifengrenzen (Vielfache von 4 m) */
function flaeche(z: () => number, e0: number, n0: number): P[][] {
  const aussen: P[] = [], loch: P[] = [], k = 7 + Math.floor(z() * 30)
  for (let i = 0; i < k; i++) {
    const w = (i / k) * 2 * Math.PI, r = 20 + z() * 60
    const p: P = [e0 + r * Math.cos(w), n0 + r * Math.sin(w)]
    if (z() < 0.2) p[1] = Math.round(p[1] / 4) * 4          // genau auf einer Streifengrenze
    if (z() < 0.1 && aussen.length) p[1] = aussen[aussen.length - 1][1]   // waagrechte Kante
    aussen.push(p)
  }
  for (let i = 0; i < 5; i++) { const w = (i / 5) * 2 * Math.PI; loch.push([e0 + 6 * Math.cos(w), n0 + 6 * Math.sin(w)]) }
  return [aussen, loch]
}

describe('imPolygonSchnell', () => {
  it('ergibt für Zufallspunkte, Eckpunkte und Punkte auf Streifengrenzen dasselbe wie imPolygon', () => {
    const z = zufall(42)
    let geprueft = 0, innen = 0
    for (let f = 0; f < 40; f++) {
      const e0 = 2600000 + z() * 1000, n0 = 1200000 + z() * 1000, ringe = flaeche(z, e0, n0)
      const punkte: P[] = []
      for (let i = 0; i < 400; i++) punkte.push([e0 - 90 + z() * 180, n0 - 90 + z() * 180])
      for (const r of ringe) for (const p of r) punkte.push([p[0], p[1]], [p[0] + 1e-9, p[1]], [p[0], Math.round(p[1] / 4) * 4])
      for (let i = 0; i < 50; i++) punkte.push([e0 - 90 + z() * 180, Math.floor((n0 - 90 + z() * 180) / 4) * 4])
      for (const p of punkte) {
        const a = imPolygon(p, ringe)
        expect(imPolygonSchnell(p, ringe)).toBe(a)
        geprueft++; if (a) innen++
      }
    }
    expect(geprueft).toBeGreaterThan(20000)
    expect(innen).toBeGreaterThan(1000)
  })
  it('Bordkanten bleiben gleich (Strasse in zwei Flächen, Trottoir, Insel als Loch)', () => {
    const av: MessAvFlaeche[] = [
      { art: 'Strasse_Weg', ringe: [[[0, 0], [20, 0], [20, 7], [0, 7]], [[5, 3], [8, 3], [8, 4], [5, 4]]] },
      { art: 'Strasse_Weg', ringe: [[[20, 0], [40, 0], [40, 7], [20, 7]]] },
      { art: 'Trottoir', ringe: [[[0, 7], [40, 7], [40, 9], [0, 9]]] },
    ]
    const k = bordkanten(av)
    expect(k.filter(x => Math.abs(x.a[0] - 20) < 1e-9 && Math.abs(x.b[0] - 20) < 1e-9)).toHaveLength(0)
    expect(k.some(x => x.a[1] === 3 || x.b[1] === 3)).toBe(true)        // Rand der Insel zählt
    expect(k.length).toBeGreaterThan(4)
  })
})
