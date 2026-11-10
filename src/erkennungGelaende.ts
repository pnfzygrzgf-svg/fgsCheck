// ── Erkennungsdistanz mit Gelände (30.10.2026; Höhenmodell swissALTI3D © swisstopo, in der Stadt Bern DTM 2023 der Stadt) ──
//
// Die Rechnung (rechner/erkennung.ts) prüft die Sicht auf die Markierung in 2D und gibt dünne Sichtlinien mit (ZufahrtErgebnis.
// erkennungLinien: alle 10 m ein Augpunkt mit dem genutzten Zielpunkt). Danach holt die App je Sichtlinie bis zur Erkennungsdistanz
// ein Höhenprofil (daten/sichtProfil.ts, derselbe Höhendienst wie Längsneigung, Kurvenregel und Velo-Sicht; daten/hoehenDienst.ts) und
// prüft, ob das Gelände (DTM, ohne Gebäude und Bewuchs) die Linie schneidet: Augpunkt AUGHOEHE_M (1,0 m, VSS 40 241 Ziffer 14, S. 6) über
// dem Gelände, Ziel die Markierung am Boden (ZIEL_HOEHE_M), Gelände verdeckt erst, wenn es mehr als die Toleranz des Dienstes über die
// Linie ragt (GELAENDE_TOL_M für swissALTI3D, daten/bernDtm.ts für das Berner DTM). Das Ergebnis trägt den Namen des Modells (quelle).
// Warum je Sichtlinie ein Profil (statt eines Rasters bzw. weniger Profile entlang der Fahrlinie und Interpolation): in Kurven läuft
// die Sichtlinie quer über die Innenseite (Böschung, Hang), die ein Profil entlang der Fahrlinie gar nicht erfasst; der Dienst liefert
// nur Profile entlang von Linien, kein Raster. Ein Profil je Sichtlinie misst genau den Boden unter der Linie.
// Abfragen je Zufahrt: eine je Sichtlinie bis zur 2D-Erkennungsdistanz (höchstens 11 bei 110 m, ohne die am Streifenrand), dazu eine
// am Wert selbst, wenn er zwischen zwei Linien liegt, und VERFEINERN_GELAENDE halbierende Abfragen zwischen der letzten freien und der
// ersten geschnittenen Linie (10 m → 2,5 m): höchstens 14. Ergebnis: neue Erkennungsdistanz (verdeckt durch «Gelände»), Status und
// Soll der Sichtprüfung bleiben unverändert. Ohne Antwort bleibt die 2D-Rechnung mit «Gelände nicht geprüft».
// Die Ergebnisse liegen je Zufahrt UND Lage der Linien (gelaendeSchluessel, Prüfsumme): eine neue Rechnung mit anderen Linien (Streifen
// verschoben) prüft neu, eine alte Antwort überschreibt keine neuere.

import { dist, type P } from './geo'
import { sichtProfilPunkte } from './daten/sichtProfil'
import { AUGHOEHE_M, type Erkennung, type ErkennungLinie, type GelaendePruefbereich } from './rechner/erkennung'
import type { ProfilPunkt } from './knotensicht/rechner/neigung'
import type { ZufahrtErgebnis } from './rechner/typen'

/** Ziel: die Markierung liegt am Boden */
export const ZIEL_HOEHE_M = 0
/** Gelände verdeckt erst, wenn es so weit über die Sichtlinie ragt [m] (swissALTI3D; Annahme): Höhengenauigkeit auf befestigten, offenen
 * Flächen rund ±0,3 m, Höhen im Profil auf 0,1 m gerundet; so verdeckt eine ebene bzw. gleichmässig geneigte Fahrbahn nie. Das Berner
 * DTM 2023 hat seine eigene Toleranz (daten/bernDtm.ts) */
export const GELAENDE_TOL_M = 0.3
/** halbierende Abfragen zwischen der letzten freien und der ersten geschnittenen Sichtlinie (10 m → 2,5 m) */
export const VERFEINERN_GELAENDE = 2
/** Wort für das Gelände als Hindernis; mit Modellname über gelaendeName */
export const GELAENDE_NAME = 'Geländemodell'
/** «Geländemodell (swissALTI3D)» bzw. nur «Geländemodell», wenn das Modell unbekannt ist */
export const gelaendeName = (quelle?: string | null): string => (quelle ? `${GELAENDE_NAME} (${quelle})` : GELAENDE_NAME)

/** Stand der Geländeprüfung einer Zufahrt: lädt, geprüft (abM: Erkennungsdistanz durch das Gelände begrenzt, null: Gelände frei;
 * frei: Ergebnis je Sichtlinie nach x; abfragen: Anzahl Profile; quelle: Modellname, tolM: Toleranz des benutzten Dienstes) bzw.
 * Fehler (Rechnung bleibt 2D) */
export interface GelaendeErgebnis { abM: number | null; frei: Record<string, boolean>; abfragen: number; pruefbereich?: GelaendePruefbereich
  quelle?: string; tolM?: number
  /** nur Sicht auf die Wartefläche: Boden unter dem Ziel je Sichtlinie nach x (Mitte der Wartefläche) [m ü. M.] */
  zielBoden?: Record<string, number> }
export type GelaendeStand = { stand: 'laedt' }
  | ({ stand: 'ok' } & GelaendeErgebnis)
  | { stand: 'fehler'; text: string }
/** Höhenprofil entlang der Strecke Augpunkt → Ziel (dist ab dem Augpunkt) */
export type ProfilLader = (auge: P, ziel: P) => Promise<ProfilPunkt[]>

/** Schlüssel einer Sichtlinie nach dem Abstand x (auf 0,01 m) in GelaendeStand.frei (auch sichtGelaende.ts) */
export const xKey = (x: number) => (Math.round(x * 100) / 100).toFixed(2)

// ── Vollständigkeit der Höhenprofile (Prüfung FGS-03, 10.11.2026) ──
// Ein Profil gilt nur, wenn es die ganze Sichtlinie abdeckt: alle Distanzen und Höhen endliche Zahlen, Stationen streng steigend,
// Anfang am Augpunkt und Ende am Ziel (höchstens PROFIL_RAND_M bzw. ein halber Punktabstand daneben: Endpunkte in der Adresse und
// Distanzen von swissALTI3D auf 0,1 m gerundet) und keine Lücke über PROFIL_LUECKE_FAKTOR Punktabstände (also kein fehlender Stützpunkt;
// beide Dienste tasten gleichmässig ab, geprüft am 10.11.2026). Sonst wirft die erste Runde (Rückfall auf den nächsten Höhendienst,
// zuletzt «Geländemodell nicht geprüft»), die Verfeinerung bricht ab (es gilt die letzte frei geprüfte Lage). Grenzen: Annahmen der App.

/** kleinste und grösste Abweichung von Anfang bzw. Ende des Profils zum Augpunkt bzw. Ziel [m]; dazwischen ein halber Punktabstand */
export const PROFIL_RAND_MIN_M = 0.5
export const PROFIL_RAND_MAX_M = 1
/** grösste Lücke zwischen zwei Profilpunkten in Punktabständen der Anfrage */
export const PROFIL_LUECKE_FAKTOR = 1.5
/** Text der Grenzen für Hilfe und Tooltip */
export const PROFIL_ANNAHME = 'Höhenprofile gelten nur vollständig (Annahme: Anfang und Ende höchstens 0,5 bis 1 m neben Augpunkt bzw. Ziel, ' +
  'kein fehlender Stützpunkt, nur gültige Zahlen); sonst Rückfall auf swissALTI3D bzw. «nicht geprüft»'

const m1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',')
/** Mangel des Profils einer Sichtlinie der Länge L (Text) bzw. null, wenn es vollständig ist; punkte: Stützpunkte der Anfrage */
export function profilMangel(profil: readonly ProfilPunkt[], L: number, punkte = sichtProfilPunkte(L)): string | null {
  if (!(L > 0) || !Number.isFinite(L)) return 'Sichtlinie ohne Länge'
  if (profil.length < 2) return profil.length ? 'nur ein Punkt' : 'keine Höhen'
  if (!profil.every(p => Number.isFinite(p?.dist) && Number.isFinite(p?.h))) return 'ungültige Distanz bzw. Höhe'
  for (let i = 1; i < profil.length; i++) if (!(profil[i].dist > profil[i - 1].dist)) return 'Stationen nicht aufsteigend bzw. doppelt'
  const schritt = L / Math.max(1, punkte - 1)
  const rand = Math.min(PROFIL_RAND_MAX_M, Math.max(PROFIL_RAND_MIN_M, schritt / 2))
  const a = profil[0].dist, b = profil[profil.length - 1].dist
  if (Math.abs(a) > rand) return `beginnt ${m1(a)} m nach dem Augpunkt`
  if (b < L - rand) return `endet ${m1(L - b)} m vor dem Ziel`
  if (b > L + rand) return `länger als die Sichtlinie (${m1(b)} statt ${m1(L)} m)`
  for (let i = 1; i < profil.length; i++) {
    const g = profil[i].dist - profil[i - 1].dist
    if (g > PROFIL_LUECKE_FAKTOR * schritt + 1e-9) return `Lücke von ${m1(g)} m ab ${m1(profil[i - 1].dist)} m`
  }
  return null
}
/** Fehler «Höhenprofil unvollständig» mit dem Mangel; null, wenn das Profil vollständig ist */
export const profilFehler = (profil: readonly ProfilPunkt[], auge: P, ziel: P): Error | null => {
  const m = profilMangel(profil, dist(auge, ziel))
  return m ? new Error(`Höhenprofil unvollständig: ${m}`) : null
}

/** Sicht über das Gelände frei? Profil vom Augpunkt zum Ziel; null, wenn das Profil zu kurz ist bzw. ungültige Zahlen enthält
 * (Vollständigkeit prüft profilMangel). Augpunkt AUGHOEHE_M über dem Boden,
 * Ziel zielHoehe über dem Boden (Erkennungsdistanz: Markierung am Boden; Sicht auf die Wartefläche: sichtGelaende.ZIEL_HOEHE_WARTE_M) */
export function gelaendeFrei(profil: readonly ProfilPunkt[], tol = GELAENDE_TOL_M, zielHoehe = ZIEL_HOEHE_M): boolean | null {
  if (profil.length < 2 || !profil.every(p => Number.isFinite(p.dist) && Number.isFinite(p.h))) return null
  const a = profil[0], b = profil[profil.length - 1], L = b.dist - a.dist
  if (!(L > 0)) return null
  const zA = a.h + AUGHOEHE_M, zB = b.h + zielHoehe
  for (const p of profil.slice(1, -1)) {
    const t = (p.dist - a.dist) / L
    if (p.h > zA + (zB - zA) * t + tol) return false
  }
  return true
}

/** Prüfsumme der Linien (Lage auf 0,1 m) und des 2D-Werts: Schlüssel der Geländeprüfung */
function pruefsumme(e: Erkennung, linien: readonly ErkennungLinie[]): string {
  const r = (p: P) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`
  const text = `${e.wert}|${linien.map(l => `${xKey(l.x)}:${r(l.auge)}:${r(l.ziel)}:${l.bruecke ? 1 : 0}`).join(';')}`
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16)
}
/** Schlüssel der Geländeprüfung einer Zufahrt «fgsId|zufahrt|Prüfsumme»; null ohne Erkennungsdistanz bzw. Sichtlinien */
export function gelaendeSchluessel(z: Pick<ZufahrtErgebnis, 'fgsId' | 'zufahrt' | 'erkennungM' | 'erkennungLinien'>): string | null {
  return z.erkennungM && z.erkennungLinien?.length ? `${z.fgsId}|${z.zufahrt}|${pruefsumme(z.erkennungM, z.erkennungLinien)}` : null
}

/** Augpunkt und Ziel beim Abstand x: zwischen zwei Sichtlinien gerade eingeschoben (Ziel der näheren am Streifen) */
function linieBei(linien: readonly ErkennungLinie[], x: number): { auge: P; ziel: P; bruecke: boolean } | null {
  for (let i = 0; i < linien.length - 1; i++) {
    const a = linien[i], b = linien[i + 1]
    if (x < a.x - 1e-9 || x > b.x + 1e-9) continue
    const t = b.x > a.x ? (x - a.x) / (b.x - a.x) : 0
    return { auge: [a.auge[0] + (b.auge[0] - a.auge[0]) * t, a.auge[1] + (b.auge[1] - a.auge[1]) * t], ziel: a.ziel, bruecke: !!(a.bruecke || b.bruecke) }
  }
  return null
}

/**
 * Gelände entlang der Sichtlinien bis zur 2D-Erkennungsdistanz prüfen (Ablauf oben; tol: Toleranz des Dienstes). Wirft, wenn ein
 * Profil der ersten Runde fehlt bzw. unvollständig ist (profilMangel; die Rechnung bleibt dann 2D); fehlt ein Profil der Verfeinerung
 * bzw. ist es unvollständig, gilt die letzte freie Lage. Ein
 * Abbruch wird weitergereicht.
 */
export async function gelaendePruefen(e: Erkennung, linien: readonly ErkennungLinie[], laden: ProfilLader, tol = GELAENDE_TOL_M):
  Promise<GelaendeErgebnis> {
  const sortiert = [...linien].sort((a, b) => a.x - b.x)
  const kand: { x: number; auge: P; ziel: P }[] = sortiert.filter(l => l.x > 1e-6 && l.x <= e.wert + 1e-6 && !l.bruecke)
  if (e.wert > 1e-6 && !sortiert.some(l => Math.abs(l.x - e.wert) < 1e-6)) {
    const q = linieBei(sortiert, e.wert)
    if (q && !q.bruecke) kand.push({ x: e.wert, auge: q.auge, ziel: q.ziel })
  }
  kand.sort((a, b) => a.x - b.x)
  const res = await Promise.all(kand.map(l => laden(l.auge, l.ziel).then(p => {
    const fehler = profilFehler(p, l.auge, l.ziel)
    if (fehler) throw fehler
    const f = gelaendeFrei(p, tol)
    if (f === null) throw new Error('Höhenprofil ohne Höhen')
    return f
  })))
  const frei: Record<string, boolean> = {}
  kand.forEach((l, i) => { frei[xKey(l.x)] = res[i] })
  let abfragen = kand.length
  const k = res.indexOf(false)
  if (k < 0) return { abM: null, frei, abfragen }
  let lo = k ? kand[k - 1].x : 0, hi = kand[k].x
  let letzteFreiM: number | null = k ? lo : null
  for (let i = 0; i < VERFEINERN_GELAENDE; i++) {
    const m = (lo + hi) / 2, q = linieBei(sortiert, m)
    if (!q || q.bruecke) break
    abfragen++
    let f: boolean | null
    try {
      const p = await laden(q.auge, q.ziel)
      f = profilFehler(p, q.auge, q.ziel) ? null : gelaendeFrei(p, tol)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err
      break
    }
    if (f === null) break
    if (f) { lo = m; letzteFreiM = m } else hi = m
  }
  return { abM: Math.floor(lo + 1e-6), frei, abfragen, pruefbereich: { letzteFreiM, ersteVerdecktM: hi } }
}

/**
 * Erkennungsdistanz und Sichtlinien einer Zufahrt zum Zeigen und für die Vorbelegung: mit dem Ergebnis der Geländeprüfung (werte je
 * gelaendeSchluessel), sonst wie gerechnet (2D) mit gelaende «laedt» bzw. «ohne». Schneidet das Gelände eine Sichtlinie vor der
 * 2D-Erkennungsdistanz, endet sie dort (verdeckt durch «Gelände»). undefined ohne gerechnete Erkennungsdistanz.
 */
export function erkennungAnzeige(z: Pick<ZufahrtErgebnis, 'fgsId' | 'zufahrt' | 'erkennungM' | 'erkennungLinien'>,
  werte: Readonly<Record<string, GelaendeStand>> | null | undefined): { e: Erkennung; linien: ErkennungLinie[] } | undefined {
  const e0 = z.erkennungM
  if (!e0) return undefined
  const l0 = z.erkennungLinien ?? []
  const k = gelaendeSchluessel(z), g = k ? werte?.[k] : undefined
  if (!g || g.stand !== 'ok' || !g.abfragen) return { e: { ...e0, gelaende: g?.stand === 'laedt' ? 'laedt' : 'ohne' }, linien: l0 }
  const name = gelaendeName(g.quelle), q = g.quelle ? { gelaendeQuelle: g.quelle } : {}
  const linien = l0.map(l => {
    const f = g.frei[xKey(l.x)]
    return f === undefined ? l : f ? { ...l, gelaende: true } : { ...l, gelaende: false, befund: 'verdeckt' as const, grund: name }
  })
  if (g.abM === null || g.abM >= e0.wert) return { e: { ...e0, gelaende: 'mit', ...q }, linien }
  // Bewuchs gilt nur, solange er vor der neuen Erkennungsdistanz beginnt
  const { ende: _ende, hindernis: _h, bewuchsAb, bewuchs, ...rest } = e0
  return { e: { ...rest, wert: g.abM, bis: 'verdeckt', hindernis: { klasse: 'gelaende', name },
    ...(bewuchsAb !== undefined && bewuchsAb < g.abM ? { bewuchsAb, bewuchs } : {}), gelaende: 'mit', ...q,
    ...(g.pruefbereich ? { gelaendePruefbereich: g.pruefbereich } : {}) }, linien }
}

/** Fahrzeugpositionen, keine entlang der Sichtlinie gemessene Verdeckungsstelle und keine exakte Grenze. */
export function pruefbereichText(p: GelaendePruefbereich): string {
  const m = (x: number) => Number(x.toFixed(2)).toString().replace('.', ',')
  return `${p.letzteFreiM === null ? 'keine freie Position geprüft' : `letzte frei geprüfte Position ${m(p.letzteFreiM)} m`}; erste verdeckte Position ${m(p.ersteVerdecktM)} m vor dem Streifen`
}
/** Modellbezug und, falls vorhanden, die tatsächlich geprüften Grenzpositionen. */
export const gelaendeText = (e: Pick<Erkennung, 'gelaende' | 'gelaendePruefbereich' | 'gelaendeQuelle'>): string => (e.gelaende === 'mit'
  ? `mit ${gelaendeName(e.gelaendeQuelle)}${e.gelaendePruefbereich ? `; ${pruefbereichText(e.gelaendePruefbereich)}` : ''}`
  : e.gelaende === 'laedt' ? 'Geländemodell: Höhenprofile laden' : 'Geländemodell nicht geprüft')
