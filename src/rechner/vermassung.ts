// ── Vermassung eines Streifens von Hand: Lage in LV95 und Masse für den Plan (Planung neuer Streifen, 16.10.2026) ──
//
// Reine Funktionen. Gerechnet im Worker (rechneFall) mit Umriss und Bordkanten der Rechnung, damit die Masse zur Sichtprüfung
// passen (im Panel stünden weder das OSM-Netz noch die AV-Fahrbahn der Rechnung zur Verfügung):
// - Achsenenden A (p0, erster Klick bzw. übernommenes Ende) und B (p1); Umriss wie in der Rechnung (index.handUmriss: Enden
//   parallel zur Balkenrichtung bzw. zum nächsten befahrbaren OSM-Weg, sonst Rechteck); Ecken A1, B1, B2, A2 in der Folge des
//   Umrisses, A1/A2 am Ende A. Benannt nach der Stelle im Umriss (handUmriss liefert A+, B+, B−, A−: Ende A bzw. B plus bzw.
//   minus halbe Breite), nicht nach dem nächsten Achsenende: bei einem kurzen, breiten, schiefen Streifen liegt eine Ecke am
//   Ende A näher bei B (Prüfung 16.10.2026: 2 m lang, 6 m breit, 55° schief ergab «B1, B2, A1, A2»).
// - Bordkanten: wie die Rechnung (streifen.raender): AV-Sehne Strasse_Weg entlang der Achse durch die Streifenmitte, an Inseln
//   (von Hand bzw. angenommen) gekürzt. Die Rechnung nimmt sie nur, wenn beide Sehnenenden höchstens RAND_SEHNE_TOL_M (2,5 m)
//   von den Streifenenden liegen («AV»); sonst nimmt sie den Rand 0,3 m vor den Enden an. Dann nennt die Vermassung die
//   AV-Sehne mit Hinweis (sehne), ohne Sehne keine Abstände.
// - Abstand eines Endes zum Fahrbahnrand entlang der Achse: positiv = das Ende liegt so weit vor dem Rand in der Fahrbahn,
//   negativ = es ragt so weit über den Rand hinaus. Fahrbahnbreite = Bordkante bis Bordkante entlang der Achse.
// - Fahrbahnachse für den Winkel: nächster befahrbarer OSM-Weg bis 15 m (index.fahrbahnRichtung), sonst die Balkenrichtung
//   des Streifens (aus dem Luftbild übernommen bzw. aus der Fall-Datei). 90° = Achse senkrecht zur Fahrbahn.
// - Knoten: je gerade Zufahrt der erste Knoten stromauf aus der Rechnung (ZufahrtErgebnis.ersterKnotenM: entlang des OSM-Wegs
//   ab dem Streifenrand, d. h. ab Streifenmitte minus halbe Breite), nur wo die Rechnung ihn kennt (gerade Zufahrt geprüft).
// - Vermassung ab Fixpunkt (fixpunktMasse, 16.10.2026; Fixpunkte: fixpunkt.ts), im Panel aus der Vermassung der Rechnung und
//   den Fixpunkten des Falls gerechnet (nicht im Worker: Fixpunkte gehen nicht in die Rechnung ein). Masssystem rechtwinklig:
//   «längs» entlang der Balkenrichtung r des Umrisses (Kanten des Streifens = Achse ± halbe Breite in Richtung r; dieselbe
//   Richtung wie die Ecken, bei geraden Streifen die Fahrbahnrichtung), «quer» senkrecht dazu. Längsmass zur Kante bzw. zur
//   Achse: vom Fixpunkt entlang r bis zur näheren Kante bzw. zur Achse (bei einem schiefen Streifen, Achse nicht senkrecht zu r,
//   trifft die Masslinie die schiefe Kante bzw. Achse auf der Höhe des Fixpunkts); liegt der Fixpunkt zwischen den Kanten: 0,
//   «auf Höhe des Streifens». Zum näheren Achsenende (Luftlinie) längs und quer im selben System, damit sich das Ende ab dem
//   Fixpunkt abstecken lässt; dazu die Luftlinie zur nächsten Ecke des Umrisses.

import { type P, dist, dot, einheit, sub } from '../geo'

export interface MassPunkt { name: string; p: P }

export interface Vermassung {
  punkte: MassPunkt[]                          // Ende A, Ende B, Ecken A1, B1, B2, A2 (LV95)
  seiteA: string                               // Himmelsrichtung von Ende A ab der Streifenmitte (Orientierung im Plan)
  laengeM: number                              // Achse A–B
  breiteM: number                              // Breite (Balkenlänge)
  winkelGrad: number | null                    // Streifenachse zur Fahrbahnachse, 90 = senkrecht
  winkelQuelle: string
  randAbstandM: [number, number] | null        // Ende A bzw. B bis zum Fahrbahnrand entlang der Achse (+ davor, − darüber hinaus)
  fahrbahnM: number | null                     // Bordkante bis Bordkante entlang der Achse
  randQuelle: string
  knoten: { zufahrt: string; strasse: string | null; abstandM: number; knoten: string | null }[]
}

export interface VermassungEingabe {
  p0: P; p1: P; breite: number
  umriss: P[]                                  // Umriss der Rechnung
  rand: [P, P]                                 // Bordkanten der Rechnung (StreifenErgebnis.rand)
  randQuelle: string                           // 'AV' bzw. 'Annahme'
  sehne?: [P, P] | null                        // AV-Sehne, wenn die Rechnung den Rand angenommen hat
  fahrbahn?: { r: P; quelle: string } | null   // Richtung der Fahrbahnachse
  zufahrten?: { zufahrt: string; art: string; strasse: string | null; ersterKnotenM: number | null; osmKnoten: string | null }[]
}

/** Namen der Ecken in der Folge des Umrisses (index.handUmriss: A+, B+, B−, A−) */
const ECKEN = ['Ecke A1', 'Ecke B1', 'Ecke B2', 'Ecke A2']
const RICHTUNGEN = ['Nord', 'Nordost', 'Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest']
/** Himmelsrichtung (8 Teile) eines Vektors in LV95 (E nach Osten, N nach Norden) */
export function himmelsrichtung(v: P): string {
  const grad = (Math.atan2(v[0], v[1]) * 180 / Math.PI + 360) % 360
  return RICHTUNGEN[Math.round(grad / 45) % 8]
}

/** Winkel zwischen Streifenachse n und Fahrbahnachse r in Grad (0–90; 90 = senkrecht) */
export function achsWinkel(n: P, r: P): number {
  const c = Math.abs(dot(einheit(n), einheit(r)))
  return Math.acos(Math.min(1, c)) * 180 / Math.PI
}

/** Abstände der Enden zu den Bordkanten entlang der Achse und Fahrbahnbreite (rand[0] am Ende A, rand[1] am Ende B) */
export function randAbstaende(p0: P, p1: P, rand: [P, P]): { abstand: [number, number]; fahrbahn: number } {
  const n = einheit(sub(p1, p0))
  return { abstand: [dot(sub(p0, rand[0]), n), dot(sub(rand[1], p1), n)], fahrbahn: dot(sub(rand[1], rand[0]), n) }
}

export function vermassung(x: VermassungEingabe): Vermassung {
  const { p0, p1 } = x
  const n = sub(p1, p0), m: P = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
  // Ecken nach ihrer Stelle im Umriss (A+, B+, B−, A−; index.handUmriss), nicht nach dem nächsten Achsenende
  const ecken = x.umriss.map((p, i) => ({ name: x.umriss.length === 4 ? ECKEN[i] : `Ecke ${i + 1}`, p }))
  let randAbstandM: [number, number] | null = null, fahrbahnM: number | null = null, randQuelle: string
  if (x.randQuelle === 'AV') {
    const r = randAbstaende(p0, p1, x.rand)
    randAbstandM = r.abstand; fahrbahnM = r.fahrbahn
    randQuelle = 'AV-Bordkanten wie in der Rechnung (Sehne der AV-Fahrbahn entlang der Achse)'
  } else if (x.sehne) {
    const r = randAbstaende(p0, p1, x.sehne)
    randAbstandM = r.abstand; fahrbahnM = r.fahrbahn
    randQuelle = 'AV-Sehne entlang der Achse; die Rechnung nimmt den Rand 0,3 m vor den Enden an (Sehne weicht mehr als 2,5 m ab)'
  } else randQuelle = 'keine AV-Fahrbahn an der Streifenmitte: Rand nicht vermasst'
  const knoten = (x.zufahrten ?? []).filter(z => z.art !== 'abbiegend' && z.ersterKnotenM !== null)
    .map(z => ({ zufahrt: z.zufahrt, strasse: z.strasse, abstandM: z.ersterKnotenM!, knoten: z.osmKnoten }))
  return {
    punkte: [{ name: 'Ende A', p: p0 }, { name: 'Ende B', p: p1 }, ...ecken],
    seiteA: himmelsrichtung(sub(p0, m)),
    laengeM: dist(p0, p1), breiteM: x.breite,
    winkelGrad: x.fahrbahn ? achsWinkel(n, x.fahrbahn.r) : null,
    winkelQuelle: x.fahrbahn ? x.fahrbahn.quelle : 'ohne Fahrbahnachse (kein befahrbarer OSM-Weg bis 15 m)',
    randAbstandM, fahrbahnM, randQuelle, knoten,
  }
}

const zz = (x: number) => x.toFixed(2)
/** Koordinate für Anzeige und Bericht: Tausender mit ’, Komma, auf cm (z. B. 2’596’442,35) */
export function koordText(x: number): string {
  const [g, d] = x.toFixed(2).split('.')
  return `${g.replace(/\B(?=(\d{3})+(?!\d))/g, '’')},${d}`
}
/** Abstand mit Vorzeichen auf cm (z. B. +0,31 m, −0,12 m) */
export function vorzeichenText(x: number): string {
  const r = Math.round(x * 100) / 100
  return `${r < 0 ? '−' : '+'}${Math.abs(r).toFixed(2).replace('.', ',')} m`
}

/** Zwischenablage: tabulatorgetrennt Punkt, E, N (Punkt als Dezimalzeichen, für CAD und Tabellen); Fixpunkte danach */
export function vermassungTabelle(id: string, v: Vermassung, fixpunkte: { name: string; p: P }[] = []): string {
  return ['Punkt\tE\tN', ...v.punkte.map(q => `${id} ${q.name}\t${zz(q.p[0])}\t${zz(q.p[1])}`),
    ...fixpunkte.map(f => `Fixpunkt ${f.name}\t${zz(f.p[0])}\t${zz(f.p[1])}`)].join('\n')
}

/** Masse eines Fixpunkts zu einem Streifen von Hand (Masssystem oben); Beträge in m, Richtungen als Himmelsrichtung */
export interface FixpunktMass {
  aufHoehe: boolean                            // Fixpunkt zwischen den Kanten (längs auf Höhe des Streifens)
  laengsKanteM: number                         // entlang r bis zur näheren Kante (0 auf Höhe des Streifens)
  laengsAchseM: number                         // entlang r bis zur Achse
  kante: string                                // Himmelsrichtung der näheren Kante, vom Streifen aus (Seite des Fixpunkts)
  kantenPunkt: P                               // Ende der Masslinie auf der näheren Kante (= Fixpunkt auf Höhe des Streifens)
  ende: 'A' | 'B'                              // näheres Achsenende (Luftlinie)
  endeLaengsM: number; endeLaengsRichtung: string   // vom Fixpunkt zum Ende entlang r
  endeQuerM: number; endeQuerRichtung: string       // vom Fixpunkt zum Ende senkrecht zu r
  ecke: string; eckeM: number                  // nächste Ecke des Umrisses (Name wie in der Vermassung), Luftlinie
}

const kreuz2 = (a: P, b: P) => a[0] * b[1] - a[1] * b[0]

/** Balkenrichtung des Umrisses (index.handUmriss: erste Ecke = Ende A + r · halbe Breite), sonst senkrecht zur Achse */
export function balkenRichtung(p0: P, p1: P, breite: number, umriss: P[]): P {
  const n = einheit(sub(p1, p0))
  const r = umriss.length === 4 && breite > 0 ? einheit(sub(umriss[0], p0)) : [0, 0] as P
  // fast parallel zur Achse (entartet): senkrecht zur Achse
  return Math.abs(kreuz2(r, n)) > 0.1 ? r : [-n[1], n[0]]
}

export function fixpunktMasse(f: P, s: { p0: P; p1: P; breite: number; umriss: P[] }): FixpunktMass {
  const { p0, p1 } = s
  const n = einheit(sub(p1, p0)), r = balkenRichtung(p0, p1, s.breite, s.umriss), q: P = [-r[1], r[0]], h = s.breite / 2
  // schiefe Koordinaten: f − A = a · r + b · n (a: längs bis zur Achse, auf Höhe des Fixpunkts)
  const d = sub(f, p0), cr = kreuz2(r, n)
  const a = kreuz2(d, n) / cr
  const seite = a < 0 ? -1 : 1
  const aufHoehe = Math.abs(a) <= h + 1e-9
  const kantenPunkt: P = aufHoehe ? [f[0], f[1]] : [f[0] - r[0] * (a - seite * h), f[1] - r[1] * (a - seite * h)]
  const ende = dist(f, p0) <= dist(f, p1) ? 'A' : 'B', pe = ende === 'A' ? p0 : p1
  const el = dot(sub(pe, f), r), eq = dot(sub(pe, f), q)
  let ei = 0
  s.umriss.forEach((p, i) => { if (dist(f, p) < dist(f, s.umriss[ei])) ei = i })
  return {
    aufHoehe, laengsKanteM: aufHoehe ? 0 : Math.abs(a) - h, laengsAchseM: Math.abs(a),
    kante: himmelsrichtung([r[0] * seite, r[1] * seite]), kantenPunkt, ende,
    endeLaengsM: Math.abs(el), endeLaengsRichtung: himmelsrichtung([r[0] * Math.sign(el || 1), r[1] * Math.sign(el || 1)]),
    endeQuerM: Math.abs(eq), endeQuerRichtung: himmelsrichtung([q[0] * Math.sign(eq || 1), q[1] * Math.sign(eq || 1)]),
    ecke: s.umriss.length === 4 ? ECKEN[ei] : `Ecke ${ei + 1}`, eckeM: s.umriss.length ? dist(f, s.umriss[ei]) : NaN,
  }
}
