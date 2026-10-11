// Tests der Luftbild-Erkennung mit synthetischen Bildern (keine echten Luftbilder im Repo)
import { describe, expect, it } from 'vitest'
import type { P } from '../geo'
import { lab, merkmalGelb, taktKorrelation, nccVorlage, bildAusPixeln, streifenImBild } from './luftbild'

const O: P = [2600000, 1200000]
const RES = 0.1, HALB = 30
const BOX: [number, number, number, number] = [O[0] - HALB, O[1] - HALB, O[0] + HALB, O[1] + HALB]
const GELB = [225, 195, 45], BELAG = [95, 95, 98], GRUEN = [60, 110, 50]

/** Zufall mit Saat (wiederholbar) */
function zufall(saat: number) { let s = saat >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) }

/**
 * Synthetisches Luftbild: Fahrbahn West–Ost (|y| ≤ halbBreite), Balken parallel zur Fahrbahn (Länge bw) im Takt P quer,
 * Mitte bei x = ux; schräg: Balkenmitten verschieben sich um y·tan(schraeg); luecke: y-Bereich ohne Fahrbahn (Insel).
 */
function bild(o: { ux?: number; bw?: number; P?: number; halbBreite?: number; schraeg?: number; insel?: [number, number];
  rauschen?: number; drehung?: number; fehlend?: number[]; laub?: [number, number] } = {}) {
  const { ux = 0, bw = 4, P = 1.0, halbBreite = 4, schraeg = 0, insel = null, rauschen = 6, drehung = 0, fehlend = [], laub = null } = o
  const n = Math.round(2 * HALB / RES), px = new Uint8Array(n * n * 3), rnd = zufall(42)
  const cw = Math.cos(drehung * Math.PI / 180), sw = Math.sin(drehung * Math.PI / 180)
  for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
    const xw = -HALB + (q + 0.5) * RES, yw = HALB - (r + 0.5) * RES
    const x = xw * cw + yw * sw, y = -xw * sw + yw * cw          // in den Rahmen der Fahrbahn gedreht
    let f = Math.abs(y) <= halbBreite ? BELAG : GRUEN
    if (insel && y >= insel[0] && y <= insel[1]) f = GRUEN
    if (f === BELAG) {
      const k = Math.round((y + halbBreite - 0.5) / P), yk = -halbBreite + 0.5 + k * P
      const xm = ux + y * Math.tan(schraeg * Math.PI / 180)
      if (Math.abs(y - yk) <= 0.25 && Math.abs(x - xm) <= bw / 2 && yk <= halbBreite - 0.25 && !fehlend.includes(k)) f = GELB
      // Laub über dem Streifen (Baumkrone)
      if (laub && y >= laub[0] && y <= laub[1] && Math.abs(x - xm) <= bw / 2 + 1) f = GRUEN
    }
    for (let c = 0; c < 3; c++) px[(r * n + q) * 3 + c] = Math.max(0, Math.min(255, f[c] + (rnd() - 0.5) * 2 * rauschen))
  }
  return bildAusPixeln(px, n, n, BOX, 3)
}

describe('Farbmerkmal', () => {
  it('b* hoch für Gelb, nahe 0 für Grau; Grün gedämpft', () => {
    expect(lab(225, 195, 45)[2]).toBeGreaterThan(60)
    expect(Math.abs(lab(95, 95, 98)[2])).toBeLessThan(3)
    const g = lab(60, 110, 50), gelb = lab(225, 195, 45), grau = lab(95, 95, 98)
    const F = merkmalGelb(new Float32Array([grau[1], grau[1], g[1], gelb[1]]), new Float32Array([grau[2], grau[2], g[2], gelb[2]]))
    expect(F[2]).toBeCloseTo(F[0], 0)                         // Grün zählt nicht als Gelb
    expect(F[3] - F[0]).toBeGreaterThan(50)
  })
})

describe('Takt und Kreuzkorrelation', () => {
  it('Balkentakt: Korrelation hoch bei der richtigen Periode, Phase an den Balken', () => {
    const x = Array.from({ length: 100 }, (_, j) => ((j * 0.1 + 0.25) % 1.0 < 0.5 ? 20 : 0))   // Balken 0…0,25 und 0,75…1
    const [r1, a1, phi] = taktKorrelation(x, 0.1, 1.0)
    const [r2] = taktKorrelation(x, 0.1, 1.5)
    expect(r1).toBeGreaterThan(0.85)
    expect(r2).toBeLessThan(0.4)
    expect(a1).toBeGreaterThan(10)
    const s = ((phi / (2 * Math.PI)) * 1.0 + 1) % 1.0
    expect(Math.min(Math.abs(s - 0.0), Math.abs(s - 1.0))).toBeLessThan(0.1)   // Maximum bei s = 0 (Balkenmitte)
    expect(taktKorrelation([1, NaN, 1, NaN], 0.1, 1)).toEqual([0, 0, 0])
  })
  it('NCC: 1 für die Vorlage selbst, −1 für das Negativ, unabhängig von Helligkeit und Kontrast', () => {
    const T = [0, 1, 1, 0, 0, 1, 1, 0], W = T.map(() => 1)
    expect(nccVorlage(T.map(t => 10 + 5 * t), T, W)).toBeCloseTo(1)
    expect(nccVorlage(T.map(t => 3 - 2 * t), T, W)).toBeCloseTo(-1)
    expect(nccVorlage(T.map(t => 10 + 5 * t + (t ? 0 : NaN)), T, W)).toBe(0)
  })
})

const aufStrasse = (hb: number) => (p: P) => Math.abs(p[1] - O[1]) <= hb

describe('Streifen im Bild', () => {
  it('findet den Streifen am Knoten: Achse, Enden, Balkenlänge', () => {
    const e = streifenImBild(bild(), O, [1, 0], aufStrasse(4))
    expect(e.befund).toBe('erkannt')
    expect(e.teile.length).toBe(1)
    const t = e.teile[0]
    const m: P = [(t.p0[0] + t.p1[0]) / 2 - O[0], (t.p0[1] + t.p1[1]) / 2 - O[1]]
    expect(Math.abs(m[0])).toBeLessThan(0.3)
    expect(Math.abs(m[1])).toBeLessThan(0.3)
    expect(Math.abs(Math.abs(t.p1[1] - t.p0[1]) - 7.5)).toBeLessThan(0.3)    // Balken −3,5 … +3,5, äussere Kanten ±3,75
    expect(Math.abs(t.bw - 4)).toBeLessThan(0.4)
    expect(t.nBalken).toBe(8)
    expect(e.periode).toBeCloseTo(1.0, 1)
  })
  it('Streifen 8 m neben dem Knoten: nur «unsicher» (Knoten nicht im Streifen)', () => {
    const e = streifenImBild(bild({ ux: 8 }), O, [1, 0], aufStrasse(4))
    expect(e.befund).toBe('unsicher')
    expect(e.gruende.join(' ')).toMatch(/OSM-Knoten/)
  })
  it('Fahrbahnrichtung 7° daneben und schräge Achse', () => {
    const e = streifenImBild(bild({ drehung: 7, schraeg: 20 }), O, [1, 0])
    expect(e.befund).toBe('erkannt')
    expect(Math.abs(e.drehungGrad - 7)).toBeLessThanOrEqual(1)
    expect(Math.abs(e.schraegGrad - 20)).toBeLessThanOrEqual(2)
  })
  it('Teilstreifen nur über einer AV-Insel; fehlende Balken auf der Fahrbahn halten zusammen', () => {
    const auf = (p: P) => { const y = p[1] - O[1]; return Math.abs(y) <= 8 && !(y >= -1.2 && y <= 1.2) }
    const insel = (p: P) => { const y = p[1] - O[1]; return y >= -1.2 && y <= 1.2 }
    const b = bild({ halbBreite: 8, insel: [-1.2, 1.2] })
    const e2 = streifenImBild(b, O, [1, 0], auf, { insel })
    expect(e2.befund).toBe('erkannt')
    expect(e2.teile.length).toBe(2)
    // ohne Beleg (keine AV-Insel, keine OSM-Querung) bleibt nur der Teil am Knoten
    const e4 = streifenImBild(b, O, [1, 0], auf)
    expect(e4.teile.length).toBe(1)
    expect(e4.gruende.join(' ')).toMatch(/weggelassen/)
    const e3 = streifenImBild(bild({ fehlend: [3, 4] }), O, [1, 0], aufStrasse(4))
    expect(e3.teile.length).toBe(1)
    expect(e3.teile[0].nBalken).toBe(6)
  })
  it('Laub über dem Streifenende: bis zur Bordkante verlängert; Ende ohne Grund vor dem Rand: unsicher', () => {
    const e = streifenImBild(bild({ laub: [1.8, 4] }), O, [1, 0], aufStrasse(4))
    expect(e.befund).toBe('erkannt')
    expect(e.gruende.join(' ')).toMatch(/verlängert/)
    expect(Math.max(e.teile[0].p0[1], e.teile[0].p1[1]) - O[1]).toBeGreaterThan(3.4)
    const e2 = streifenImBild(bild({ fehlend: [5, 6, 7] }), O, [1, 0], aufStrasse(4))
    expect(e2.befund).toBe('unsicher')
    expect(e2.gruende.join(' ')).toMatch(/vor der Bordkante/)
  })
  it('ohne Muster, leeres Bild, Ort ausserhalb des Ausschnitts: nicht gefunden', () => {
    expect(streifenImBild(bild({ bw: 0 }), O, [1, 0]).befund).toBe('nicht_gefunden')
    const leer = bildAusPixeln(new Uint8Array(600 * 600 * 3).fill(100), 600, 600, BOX, 3)
    expect(streifenImBild(leer, O, [1, 0]).befund).toBe('nicht_gefunden')
    expect(streifenImBild(bild(), [O[0] + 500, O[1]], [1, 0]).befund).toBe('nicht_gefunden')
  })
})
