// Abnahmetests Prüfung FGS-03 (10.11.2026): unvollständige Höhenprofile gelten nicht als Nachweis freier Geländesicht, weder bei der
// Erkennungsdistanz (erkennungGelaende.ts) noch bei der Sicht auf die Wartefläche (sichtGelaende.ts). Künstliche Profile über einen
// eingespeisten Lader, kein Abruf. Die Stützpunkte folgen dem Dienst (sichtProfilPunkte, gleichmässig wie swissALTI3D und das Berner
// DTM, geprüft am 10.11.2026).
import { describe, expect, it } from 'vitest'
import type { P } from './geo'
import type { ProfilPunkt } from './knotensicht/rechner/neigung'
import type { Poly } from './rechner/poly'
import type { ErkennungLinie } from './rechner/erkennung'
import type { ZufahrtErgebnis } from './rechner/typen'
import { gelaendeFrei, gelaendePruefen, profilMangel, type ProfilLader } from './erkennungGelaende'
import { bodenAusProfil, sichtGelaendePruefen, sichtGeo } from './sichtGelaende'
import { sichtProfilPunkte } from './daten/sichtProfil'
import { BERN_DTM, SWISSALTI, mitRueckfall } from './daten/hoehenDienst'

const L_ = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1])
/** vollständiges Profil der Länge L wie beim Dienst */
const profil = (L: number, h: (d: number) => number = () => 500): ProfilPunkt[] => {
  const n = sichtProfilPunkte(L)
  return Array.from({ length: n }, (_, i) => { const d = i === n - 1 ? L : (i * L) / (n - 1); return { dist: d, h: h(d) } })
}
/** Lader: vollständige Profile, 2 m hohe Kuppe quer über die Fahrbahn bei y = kuppeY für Augpunkte mehr als 3 m dahinter */
const kuppe = (kuppeY: number): ProfilLader => async (a, b) => {
  const L = L_(a, b)
  return profil(L, d => (Math.abs(a[1] + d * (b[1] - a[1]) / L - kuppeY) < 3 && a[1] - kuppeY > 3 ? 502 : 500))
}
/** Antwort der Gegenprobe des Berichts: nur dist 0 und 1 m, beide 500 m */
const nurEinMeter: ProfilLader = async () => [{ dist: 0, h: 500 }, { dist: 1, h: 500 }]

// Wartefläche: Sichtpunkte alle 2 m entlang x = 1,5 bis 55 m, Warteflächen beidseits (wie sichtGelaende.test.ts)
const ANN: Poly[] = [[[[4, -4], [6, -4], [6, -1], [4, -1]]], [[[-6, -4], [-4, -4], [-4, -1], [-6, -1]]]]
const punkte = (L: number): P[] => Array.from({ length: Math.floor(L / 2) + 1 }, (_, i) => [1.5, Math.min(L, i * 2)] as P).concat(L % 2 ? [[1.5, L] as P] : [])
const geo55 = () => sichtGeo({ sichtpunkte: punkte(55), sichtweite: 55 } as unknown as ZufahrtErgebnis, ANN)!
// Erkennungsdistanz: Sichtlinien entlang der y-Achse, Augpunkt (0, x + 1), Ziel (0, 0,5)
const linien = (xs: number[]): ErkennungLinie[] => xs.map(x => ({ x, auge: [0, x + 1] as P, ziel: [0, 0.5] as P, befund: 'frei' }))
const L55 = linien([0, 10, 20, 30, 40, 50, 55])

describe('FGS-03: Gegenprobe des Berichts (Profil nur 0 und 1 m)', () => {
  it('Wartefläche: keine der Sichtlinien 10 bis 55 m gilt als frei, die Prüfung wirft (Rechnung bleibt 2D)', async () => {
    await expect(sichtGelaendePruefen(geo55(), nurEinMeter)).rejects.toThrow(/Höhenprofil unvollständig: endet .* m vor dem Ziel/)
  })
  it('Erkennungsdistanz: ebenso', async () => {
    await expect(gelaendePruefen({ wert: 55, bis: 'frei' }, L55, nurEinMeter)).rejects.toThrow(/Höhenprofil unvollständig: endet/)
  })
  it('Rückfall: unvollständiges Profil des ersten Dienstes → der nächste Dienst prüft; scheitern beide, bleibt «nicht geprüft» (Fehler)', async () => {
    const gemeldet: string[] = []
    const r = await mitRueckfall([BERN_DTM, SWISSALTI], d => sichtGelaendePruefen(geo55(), d === BERN_DTM ? nurEinMeter : kuppe(-100)),
      (d, f) => gemeldet.push(`${d.id}: ${f.message}`))
    expect(r.dienst).toBe(SWISSALTI)
    expect(r.wert.abM).toBeNull()
    expect(gemeldet[0]).toMatch(/^bern\.dtm: Höhenprofil unvollständig/)
    await expect(mitRueckfall([BERN_DTM, SWISSALTI], () => sichtGelaendePruefen(geo55(), nurEinMeter))).rejects.toThrow('unvollständig')
  })
})

describe('FGS-03: Mängel des Profils', () => {
  const L = 40, voll = profil(L)
  it('vollständig: kurze Linie, flaches langes Profil, lange Linie mit 60 Punkten', () => {
    expect(profilMangel(profil(10), 10)).toBeNull()
    expect(profilMangel(profil(110), 110)).toBeNull()
    expect(profilMangel(profil(300), 300)).toBeNull()
    expect(sichtProfilPunkte(300)).toBe(60)
    // Rundung der Endpunkte (0,1 m) und der Distanzen von swissALTI3D (0,1 m)
    expect(profilMangel(voll.map(p => ({ ...p, dist: Math.round(p.dist * 10) / 10 })), L + 0.14)).toBeNull()
  })
  it('fehlender Anfang bzw. fehlendes Ende', () => {
    expect(profilMangel(voll.slice(1), L)).toMatch(/^beginnt 2,0 m nach dem Augpunkt/)
    expect(profilMangel(voll.slice(0, -1), L)).toMatch(/^endet 2,0 m vor dem Ziel/)
    expect(profilMangel(voll.slice(0, 6), L)).toMatch(/^endet/)
    expect(profilMangel([...voll, { dist: L + 5, h: 500 }], L)).toMatch(/^länger als die Sichtlinie/)
  })
  it('innere Lücke: schon ein fehlender Stützpunkt', () => {
    expect(profilMangel([...voll.slice(0, 10), ...voll.slice(11)], L)).toMatch(/^Lücke von 4,0 m ab 18,0 m/)
    expect(profilMangel([...voll.slice(0, 3), ...voll.slice(-3)], L)).toMatch(/^Lücke/)
  })
  it('NaN, Infinity, fehlende Zahl', () => {
    for (const x of [NaN, Infinity, -Infinity, undefined]) {
      expect(profilMangel(voll.map((p, i) => (i === 5 ? { ...p, h: x as number } : p)), L)).toBe('ungültige Distanz bzw. Höhe')
      expect(profilMangel(voll.map((p, i) => (i === 5 ? { ...p, dist: x as number } : p)), L)).toBe('ungültige Distanz bzw. Höhe')
    }
    expect(profilMangel(voll, NaN)).toBe('Sichtlinie ohne Länge')
    // gelaendeFrei selbst: NaN gilt nie als frei
    expect(gelaendeFrei(voll.map((p, i) => (i === 5 ? { ...p, h: NaN } : p)))).toBeNull()
  })
  it('unsortierte bzw. doppelte Stationen', () => {
    const t = [...voll]; [t[4], t[5]] = [t[5], t[4]]
    expect(profilMangel(t, L)).toBe('Stationen nicht aufsteigend bzw. doppelt')
    expect(profilMangel([...voll.slice(0, 5), voll[4], ...voll.slice(5)], L)).toBe('Stationen nicht aufsteigend bzw. doppelt')
    expect(profilMangel([...voll].reverse(), L)).toBe('Stationen nicht aufsteigend bzw. doppelt')
  })
  it('weniger als zwei Punkte', () => {
    expect(profilMangel([], L)).toBe('keine Höhen')
    expect(profilMangel([{ dist: 0, h: 500 }], L)).toBe('nur ein Punkt')
  })
})

describe('FGS-03: beide Geländeprüfungen', () => {
  it('Kuppe bei 32 m wird mit vollständigen Profilen erkannt (Wartefläche und Erkennungsdistanz)', async () => {
    const s = await sichtGelaendePruefen(geo55(), kuppe(32))
    expect(s.abM).not.toBeNull()
    expect(s.abM!).toBeLessThan(40)
    const e = await gelaendePruefen({ wert: 55, bis: 'frei' }, L55, kuppe(32))
    expect(e.abM).not.toBeNull()
    expect(e.abM!).toBeLessThan(40)
  })
  it('flache lange Linie bleibt frei', async () => {
    expect((await sichtGelaendePruefen(geo55(), kuppe(-100))).abM).toBeNull()
    expect((await gelaendePruefen({ wert: 55, bis: 'frei' }, L55, kuppe(-100))).abM).toBeNull()
  })
  it('eine Linie der ersten Runde mit Lücke genügt, damit nicht «frei» herauskommt', async () => {
    const mitLuecke: ProfilLader = async (a, b) => {
      const p = await kuppe(-100)(a, b)
      return a[1] > 50 ? [...p.slice(0, 5), ...p.slice(-5)] : p
    }
    await expect(sichtGelaendePruefen(geo55(), mitLuecke)).rejects.toThrow(/Höhenprofil unvollständig: Lücke/)
    await expect(gelaendePruefen({ wert: 55, bis: 'frei' }, L55, mitLuecke)).rejects.toThrow(/Höhenprofil unvollständig: Lücke/)
  })
  it('unvollständiges Profil in der Verfeinerung: es gilt die letzte frei geprüfte Lage, keine Zwischenlage erfunden', async () => {
    // Kuppe trifft die Linien ab 40 m; Verfeinerung bei 35 m liefert nur ein abgeschnittenes Profil
    const laden = (verfeinerung: number): ProfilLader => async (a, b) => {
      const p = await kuppe(33)(a, b)
      return Math.abs(a[1] - verfeinerung) < 1e-6 ? p.slice(0, 4) : p
    }
    const s = await sichtGelaendePruefen(geo55(), laden(35))
    expect(s).toMatchObject({ abM: 30, pruefbereich: { letzteFreiM: 30, ersteVerdecktM: 40 } })
    const e = await gelaendePruefen({ wert: 55, bis: 'frei' }, L55, laden(36))
    expect(e).toMatchObject({ abM: 30, pruefbereich: { letzteFreiM: 30, ersteVerdecktM: 40 } })
  })
})

describe('FGS-03: Boden in der Mitte der Wartefläche nur aus gültigem Profil', () => {
  it('erster Punkt an der Mitte: seine Höhe; gleiche Stationen der Rundung von swissALTI3D zulässig (Antwort vom 10.11.2026)', () => {
    const roh = [0, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5].map((dist, i) => ({ dist, h: 540 + i * 0.1 }))
    expect(bodenAusProfil(roh)).toBe(540)
  })
  it('Mitte ohne Höhe, ungültige Zahl, unsortiert bzw. leer: wirft', () => {
    expect(() => bodenAusProfil([{ dist: 1.5, h: 540 }, { dist: 2, h: 540 }])).toThrow('Mitte ohne Höhe')
    expect(() => bodenAusProfil([{ dist: 0, h: NaN }, { dist: 1, h: 540 }])).toThrow('ungültige')
    expect(() => bodenAusProfil([{ dist: 0, h: 540 }, { dist: 1, h: 540 }, { dist: 0.5, h: 540 }])).toThrow('ungültige')
    expect(() => bodenAusProfil([])).toThrow('ohne Höhen')
  })
  it('ungültiges Profil der Mitte: die Prüfung wirft (Rückfall), statt die Höhe der Ecke zu nehmen', async () => {
    const laden: ProfilLader = async (a, b) => (a[1] < 0 ? [{ dist: 1.2, h: 500 }, { dist: L_(a, b), h: 500 }] : kuppe(-100)(a, b))
    await expect(sichtGelaendePruefen(geo55(), laden)).rejects.toThrow('Höhenprofil der Wartefläche unvollständig')
  })
})
