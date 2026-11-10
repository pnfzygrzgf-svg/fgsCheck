// Geometrietests zum Kurvenbogen (Prüfung FGS-01, 10.11.2026): bekannte Kreisbögen bei dichter und lockerer Punktfolge, eckige und
// zu kurze Linien, Abstand des Kurvenendes vom Streifen
import { describe, expect, it } from 'vitest'
import type { P } from '../geo'
import { kurvenbogen, kreisAnpassen } from './kurvenbogen'
import { sichtweiteKurve, sichtweiteTab2 } from './tempo'

/** Fahrlinie ab dem Streifen: gerade vor, dann Linkskurve mit Radius r über winkel Grad (Stützpunkt alle schritt Grad), dann gerade nach */
function linie(r: number, winkel = 90, schritt = 1, vor = 3, nach = 20): P[] {
  const pts: P[] = [[0, 0], [0, vor]]
  const mitte: P = [-r, vor]
  for (let g = schritt; g <= winkel + 1e-9; g += schritt) {
    const a = g * Math.PI / 180
    pts.push([mitte[0] + r * Math.cos(a), mitte[1] + r * Math.sin(a)])
  }
  const a = winkel * Math.PI / 180, e = pts[pts.length - 1], t: P = [-Math.sin(a), Math.cos(a)]
  pts.push([e[0] + t[0] * nach, e[1] + t[1] * nach])
  return pts
}

describe('Kurvenbogen aus der Fahrlinie', () => {
  it('Kreisanpassung: Punkte auf einem Kreis ergeben dessen Radius', () => {
    const k = kreisAnpassen(Array.from({ length: 20 }, (_, i) => [10 * Math.cos(i / 5), 10 * Math.sin(i / 5)] as P))!
    expect(k.radius).toBeCloseTo(10, 6)
    expect(k.rms).toBeLessThan(1e-6)
  })
  it('bekannte Radien bei dichter Punktfolge (1°): ungerundet, innert 1 %', () => {
    for (const r of [15, 19.9, 20, 20.4, 25, 38]) {
      const b = kurvenbogen(linie(r), 0, 80)!
      expect(b.grund, `R ${r}`).toBeNull()
      expect(Math.abs(b.radius! - r) / r, `R ${r}`).toBeLessThan(0.01)
      expect(Math.abs(b.endeM! - 3), `R ${r}`).toBeLessThanOrEqual(0.5)
    }
  })
  it('lockere Punktfolge (alle 15° bzw. 30°): Radius innert 3 % bzw. 8 %', () => {
    for (const r of [15, 20, 30]) {
      expect(Math.abs(kurvenbogen(linie(r, 90, 15), 0, 80)!.radius! - r) / r, `R ${r}, 15°`).toBeLessThan(0.03)
      expect(Math.abs(kurvenbogen(linie(r, 90, 30), 0, 80)!.radius! - r) / r, `R ${r}, 30°`).toBeLessThan(0.08)
    }
  })
  it('Stufengrenze 20 m: ungerundeter Radius entscheidet (19,9 m bfu 24 m; 20,4 m kein bfu-Wert, Tab. 2 35 m)', () => {
    const r199 = kurvenbogen(linie(19.9), 0, 80)!.radius!, r204 = kurvenbogen(linie(20.4), 0, 80)!.radius!
    expect(sichtweiteKurve(r199)[0]).toBe(24)
    expect(sichtweiteKurve(r204)[0]).toBeNull()
    expect(sichtweiteTab2(r204)).toBe(35)
    expect(sichtweiteTab2(20)).toBe(30)
    expect(sichtweiteTab2(19.99)).toBeNull()
    expect(sichtweiteTab2(40.01)).toBeNull()
  })
  it('eckige Linie (90° an einem Punkt) und zu kurze Kurve: kein Radius', () => {
    const eckig: P[] = [[0, 0], [0, 10], [-10, 10]]
    expect(kurvenbogen(eckig, 0, 40)).toMatchObject({ radius: null, grund: 'Bogen zu kurz bzw. eckig' })
    expect(kurvenbogen(linie(20, 10), 0, 80)).toMatchObject({ radius: null, grund: 'keine Kurve' })
    expect(kurvenbogen([[0, 0], [0, 40]], 0, 40)).toMatchObject({ endeM: null, radius: null, grund: 'keine Kurve' })
  })
  it('ungleichmässiger Bogen (zwei Radien hintereinander) gilt nicht als Kreis', () => {
    const a = linie(10, 45, 1, 3, 0), e = a[a.length - 1]
    // weiter mit Radius 40 über 45°: aus der Richtung bei 45° (−sin, cos)
    const r2 = 40, t0 = Math.PI / 4, mitte: P = [e[0] - r2 * Math.cos(t0), e[1] - r2 * Math.sin(t0)]
    for (let g = 1; g <= 45; g++) { const w = t0 + g * Math.PI / 180; a.push([mitte[0] + r2 * Math.cos(w), mitte[1] + r2 * Math.sin(w)]) }
    expect(kurvenbogen(a, 0, 100)).toMatchObject({ radius: null, grund: 'Bogen ungleichmässig gekrümmt' })
  })
})
