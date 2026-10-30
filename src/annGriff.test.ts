// Tests 30.10.2026: Griffe des Annäherungsbereichs fangen (AV-Stützpunkte, Fixpunkte, Streifenenden) und projizieren den gefangenen
// Punkt auf die Bordkanten-Gerade; Zahleneingabe je Ende (Versatz, Breite, leer = wie gerechnet, Grenzen); Fall-Datei unverändert.
// Künstliche Strasse wie annHand.test.ts: Hauptstrasse West–Ost, Fahrbahn 8 m (y −4 … 4), Streifen von Hand bei x = 0.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from './geo'
import type { OsmDaten, OsmWeg } from './daten/osm'
import type { AvFlaeche } from './daten/av'
import { rechneFall } from './rechner/index'
import { ANN_HAND_BREITE, ANN_HAND_VERSATZ_MAX, type AnnBasis } from './rechner/typen'
import { annHandSetzen, fallLesen, fallSchreiben, leererFall, type Fall, type StreifenHand } from './fall'
import { ANN_FANG_WEIT_M, annBegrenzt, annEingabe, annFangText, annGleich, annGriffNeu, annGriffX, annGriffZiehen, annProjektion,
  fangZiele, fangenMitZielen, type FangTreffer } from './annGriff'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rel = (p: P) => [Math.round((p[0] - O[0]) * 1000) / 1000, Math.round((p[1] - O[1]) * 1000) / 1000]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
const weg = (id: number, k: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: k.map(x => x[0]), geom: k.map(x => ll(x[1], x[2])) })
const OSM: OsmDaten = {
  wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [{ id: 12, tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' }, lat: ll(0, 0)[0], lon: ll(0, 0)[1] }],
}
// Südliches Trottoir mit einem Stützpunkt auf der Bordkante bei x = 3 (z. B. Beginn einer Eckausrundung) und einem 0,4 m dahinter
// bei x = −3 (Randstein-Eckpunkt im Trottoir); Gebäude südlich mit Ecke bei (6, −9)
const AV: AvFlaeche[] = [
  av('Strasse_Weg', [lv(-300, -4), lv(3, -4), lv(300, -4), lv(300, 4), lv(-300, 4)]),
  av('Trottoir', [lv(-300, 4), lv(300, 4), lv(300, 7), lv(-300, 7)]),
  av('Trottoir', [lv(-300, -7), lv(300, -7), lv(300, -4), lv(3, -4), lv(-3, -4.4), lv(-300, -4)]),
  av('Gebaeude', [lv(6, -9), lv(16, -9), lv(16, -20), lv(6, -20)]),
]
function fallMit(ann?: StreifenHand['ann']): Fall {
  const f = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
  f.streifenHand = [{ id: 'hand-1', p0: lv(0, -4.5), p1: lv(0, 4.5), breite: 4, herkunft: 'gezeichnet', ...(ann ? { ann } : {}) }]
  return f
}
/** Bordkante bei y = −4, Mitte bei x = 0, positiver Versatz nach Westen (links der Achse A→B nach Norden) */
const B: AnnBasis = { rand: lv(0, -4), u: [-1, 0], breite: 4 }
const R = 2.4   // Fangradius bei Zoom 19 (12 px)
const fang = (ziele: Parameters<typeof fangenMitZielen>[2] = []) => (p: P): FangTreffer => fangenMitZielen(p, AV, ziele, R)

describe('Fangen: AV-Stützpunkte, Fixpunkte, Streifenenden', () => {
  it('nächster AV-Stützpunkt im Fangradius mit Bezeichnung; ausserhalb frei an der Stelle', () => {
    const t = fangenMitZielen(lv(3.5, -4.6), AV, [], R)
    expect(t.art).toBe('av')
    expect(rel(t.p)).toEqual([3, -4])
    expect(t.name).toBe('AV-Punkt (Strasse/Weg)')
    const g = fangenMitZielen(lv(7, -8), AV, [], R)
    expect(g).toMatchObject({ art: 'av', name: 'Gebäudeecke (AV)' })
    expect(fangenMitZielen(lv(50, 0), AV, [], R)).toEqual({ p: lv(50, 0), art: 'frei', name: null })
  })
  it('Ziel (Fixpunkt, Streifenende) vor der AV, wenn näher bzw. am selben Punkt; weiter weg gewinnt die AV', () => {
    const mast = { p: lv(4, -4.8), name: 'Fixpunkt «Mast»' }
    expect(fangenMitZielen(lv(4.2, -4.8), AV, [mast], R)).toMatchObject({ art: 'ziel', name: 'Fixpunkt «Mast»' })
    expect(fangenMitZielen(lv(3.1, -4.1), AV, [mast], R)).toMatchObject({ art: 'av' })
    const gleich = { p: lv(3, -4), name: 'Fixpunkt «Ecke»' }
    expect(fangenMitZielen(lv(3.2, -4.2), AV, [gleich], R)).toMatchObject({ art: 'ziel', name: 'Fixpunkt «Ecke»' })
    expect(fangenMitZielen(lv(40, 0), AV, [{ p: lv(43, 0), name: 'x' }], R).art).toBe('frei')
  })
  it('Ziele: Fixpunkte und Enden der übrigen Streifen, nicht die des eigenen; von Hand vor dem Ergebnis', () => {
    const z = fangZiele([{ p: lv(1, 1), art: 'av_punkt', avArt: 'Trottoir' }, { p: lv(2, 2), art: 'frei', name: 'Mast' }],
      [{ id: 'hand-1', p0: lv(0, -4), p1: lv(0, 4) }, { id: 'osm-7', p0: lv(20, -4), p1: lv(20, 4) }, { id: 'hand-2', p0: lv(40, -4), p1: lv(40, 4) },
        { id: 'hand-2', p0: lv(41, -4), p1: lv(41, 4) }], 'hand-1', id => `Streifen ${id}`)
    expect(z.map(x => x.name)).toEqual(['Fixpunkt «AV-Punkt (Trottoir)»', 'Fixpunkt «Mast»', 'Ende A von Streifen osm-7', 'Ende B von Streifen osm-7',
      'Ende A von Streifen hand-2', 'Ende B von Streifen hand-2'])
    expect(rel(z[4].p)).toEqual([41, -4])
  })
})

describe('Griffe des Annäherungsbereichs: Projektion auf die Bordkante', () => {
  const h0 = { versatz: 0, breite: 4 }
  it('Projektion: Versatz entlang der Kante (positiv nach links) und Abstand zur Geraden', () => {
    const q = annProjektion(B, lv(-1.5, -4.4))
    expect(q.x).toBeCloseTo(1.5, 9); expect(q.abstand).toBeCloseTo(0.4, 9)
  })
  it('Mitte verschiebt, Seite verbreitert bzw. verschmälert (andere Seite bleibt), in den Grenzen', () => {
    expect(annGriffNeu(h0, 'mitte', 1.25)).toEqual({ versatz: 1.25, breite: 4 })
    expect(annGriffNeu(h0, -1, -3)).toEqual({ versatz: -0.5, breite: 5 })
    expect(annGriffNeu(h0, 1, 1)).toEqual({ versatz: -0.5, breite: 3 })
    expect(annGriffNeu(h0, 1, -5).breite).toBe(ANN_HAND_BREITE[0])
    expect(annGriffNeu(h0, 'mitte', 40).versatz).toBe(ANN_HAND_VERSATZ_MAX)
    expect(annGriffX({ versatz: -0.5, breite: 5 }, -1)).toBeCloseTo(-3, 9)
    expect(annBegrenzt({ versatz: -20, breite: 0 })).toEqual({ versatz: -ANN_HAND_VERSATZ_MAX, breite: ANN_HAND_BREITE[0] })
  })
  it('Seite auf den AV-Punkt am Beginn der Eckausrundung: gefangen, auf der Bordkante, Griff dort', () => {
    const z = annGriffZiehen(B, h0, -1, lv(3.6, -4.7), fang())
    expect(z.h).toEqual({ versatz: -0.5, breite: 5 })
    expect(rel(z.lage)).toEqual([3, -4])
    expect(z.text).toBe('gefangen: AV-Punkt (Strasse/Weg), auf der Bordkante')
    expect(z.weit).toBe(false)
  })
  it('Punkt neben der Bordkante: projiziert, Text mit Abstand; weit erst über ANN_FANG_WEIT_M', () => {
    const z = annGriffZiehen(B, h0, 1, lv(-3.3, -4.6), fang())
    expect(rel(z.treffer.p)).toEqual([-3, -4.4])
    expect(z.h.breite).toBeCloseTo(5, 9); expect(z.h.versatz).toBeCloseTo(0.5, 9)
    expect(rel(z.lage)).toEqual([-3, -4])
    expect(z.text).toBe('gefangen: AV-Punkt (Trottoir), 0,4 m neben der Bordkante')
    expect(z.weit).toBe(false)
    const mast = { p: lv(-1, -5.5), name: 'Fixpunkt «Mast»' }
    const w = annGriffZiehen(B, h0, 'mitte', lv(-1.1, -5.4), fang([mast]))
    expect(w.h.versatz).toBeCloseTo(1, 9)
    expect(w.text).toBe('gefangen: Fixpunkt «Mast», 1,5 m neben der Bordkante')
    expect(w.weit).toBe(1.5 > ANN_FANG_WEIT_M)
  })
  it('ohne Punkt im Fangradius: Lage wie gezogen auf die Gerade, kein Text', () => {
    const z = annGriffZiehen(B, h0, 'mitte', lv(-30.7, -6), fang())
    expect(z.h.versatz).toBeCloseTo(15, 9)            // in den Grenzen
    expect(rel(z.lage)).toEqual([-15, -4])
    expect(z.text).toBeNull()
    expect(annGriffZiehen(B, h0, 'mitte', lv(-0.5, -6.5), fang()).h.versatz).toBeCloseTo(0.5, 9)
    expect(annFangText({ p: lv(0, 0), art: 'frei', name: null }, 0)).toBeNull()
  })
  it('gezogene Vorgabe in der Rechnung: Seite des Annäherungsbereichs A am gefangenen Punkt (x = 3)', () => {
    const basis = rechneFall(OSM, AV, [], 12, fallMit(), null).streifen[0].annBasis![0]
    const z = annGriffZiehen(basis, { versatz: 0, breite: basis.breite }, -1, lv(3.4, -4.5), fang())
    expect(z.h.breite).toBeCloseTo(basis.breite / 2 + 3, 6)
    const s = rechneFall(OSM, AV, [], 12, fallMit([z.h, null]), null).streifen[0]
    expect(s.annHand).toEqual([{ versatz: Math.round(z.h.versatz * 100) / 100, breite: Math.round(z.h.breite * 100) / 100 }, null])
    // Wartebereich: Mitte um den Versatz verschoben; Seite Ost am gefangenen Punkt, Seite West wie gerechnet
    const mx = s.warte![0][0][0] - O[0], bw = s.annHand![0]!.breite
    expect(mx).toBeCloseTo(basis.rand[0] - O[0] + basis.u[0] * z.h.versatz, 2)
    expect(mx + bw / 2).toBeCloseTo(3, 1)
    expect(mx - bw / 2).toBeCloseTo(basis.rand[0] - O[0] - basis.breite / 2, 1)
  })
})

describe('Zahleneingabe je Ende', () => {
  it('Versatz bzw. Breite setzen (0,1 m), die andere Grösse wie gerechnet bzw. wie vorgegeben', () => {
    expect(annEingabe(null, 4.37, 'versatz', 0.84)).toEqual({ versatz: 0.8, breite: 4.37 })
    expect(annEingabe(null, 4.37, 'breite', 3)).toEqual({ versatz: 0, breite: 3 })
    expect(annEingabe({ versatz: 1.23, breite: 3 }, 4, 'breite', 2.46)).toEqual({ versatz: 1.23, breite: 2.5 })
  })
  it('leer = wie gerechnet; beide wie gerechnet = keine Vorgabe', () => {
    expect(annEingabe({ versatz: 1, breite: 3 }, 4, 'versatz', null)).toEqual({ versatz: 0, breite: 3 })
    expect(annEingabe({ versatz: 0, breite: 3 }, 4, 'breite', null)).toBeNull()
    expect(annEingabe({ versatz: 1, breite: 4 }, 4, 'versatz', 0)).toBeNull()
    expect(annEingabe(null, 4, 'versatz', null)).toBeNull()
  })
  it('Grenzen wie annBegrenzt', () => {
    expect(annEingabe(null, 4, 'versatz', -22)).toEqual({ versatz: -ANN_HAND_VERSATZ_MAX, breite: 4 })
    expect(annEingabe(null, 4, 'breite', 0.1)).toEqual({ versatz: 0, breite: ANN_HAND_BREITE[0] })
    expect(annEingabe(null, 4, 'breite', 99)).toEqual({ versatz: 0, breite: ANN_HAND_BREITE[1] })
  })
  it('Text zum Fang gilt nur für dieselbe Vorgabe (auf den cm)', () => {
    expect(annGleich({ versatz: 0.5, breite: 3.004 }, { versatz: 0.5, breite: 3 })).toBe(true)
    expect(annGleich({ versatz: 0.5, breite: 3 }, { versatz: 0.6, breite: 3 })).toBe(false)
    expect(annGleich(null, { versatz: 0, breite: 3 })).toBe(false)
  })
})

describe('Fall-Datei unverändert', () => {
  it('Eingabe bzw. gefangener Griff schreibt nur Versatz und Breite (kein Fang-Text), Version wie bisher', () => {
    const roh = fallMit()
    annHandSetzen(roh.streifenHand[0], 0, { versatz: 0.8, breite: 3 })
    const ein = fallMit()
    annHandSetzen(ein.streifenHand[0], 0, annEingabe(annEingabe(null, 4, 'versatz', 0.8), 4, 'breite', 3))
    const zug = fallMit()
    annHandSetzen(zug.streifenHand[0], 1, annGriffZiehen(B, { versatz: 0, breite: 4 }, 'mitte', lv(-3.2, -4.3), fang()).h)
    const ohneZeit = (t: string) => { const j = JSON.parse(t); delete j.gespeichert; return j }
    expect(ohneZeit(fallSchreiben(ein))).toEqual(ohneZeit(fallSchreiben(roh)))
    const j = ohneZeit(fallSchreiben(zug))
    expect(j.version).toBe(ohneZeit(fallSchreiben(roh)).version)
    expect(j.streifenHand[0].ann).toEqual([null, { versatz: 3, breite: 4 }])
    expect(Object.keys(j.streifenHand[0].ann[1]).sort()).toEqual(['breite', 'versatz'])
    const [g, hw] = fallLesen(fallSchreiben(zug))
    expect(hw).toEqual([])
    expect(g.streifenHand[0].ann).toEqual([null, { versatz: 3, breite: 4 }])
    // leer an beiden Grössen: kein Feld
    const leer = fallMit([{ versatz: 1, breite: 3 }, null])
    annHandSetzen(leer.streifenHand[0], 0, annEingabe(annEingabe(leer.streifenHand[0].ann![0], 4, 'versatz', null), 4, 'breite', null))
    expect(JSON.parse(fallSchreiben(leer)).streifenHand[0].ann).toBeUndefined()
  })
})
