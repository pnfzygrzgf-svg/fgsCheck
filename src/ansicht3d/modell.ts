// ── 3D-Ansicht: Datenmodell der Szene (reine Funktionen, ohne Cesium, DOM oder Leaflet) ──
//
// Bildet die Geometrie eines gerechneten Falls (LV95) auf eine Szene in WGS84 ab: Flächen und Linien, die auf das Gelände gelegt
// werden, Körper (Fahrzeuge, Personen, Bäume), Wände (Hecken, Mauern) und die Sichtlinien der gewählten Zufahrt. Höhen gibt es nur
// relativ zum Gelände; die Szene (cesiumSzene.ts) stellt alles auf das Gelände von swisstopo, eigene absolute Höhen kommen nicht vor.
// Nur Darstellung: Status, Farben und Befunde stammen aus der Rechnung, die 3D-Ansicht ändert nichts daran. Die Höhen der Fahrzeuge,
// Personen, Parkfelder, Hecken und Bäume sind Annahmen und stehen in der Legende.
// Den Boden bilden die Flächen der Amtlichen Vermessung in den Farben der 2D-Karte (rundherum die graue Karte swissTLM, Luftbild zuschaltbar), Gebäude
// kommen aus swissBUILDINGS3D. Die Farben der Karte (STATUS_FARBE, hindernisFarbe, PLAN_FARBEN, INSEL_FARBE) übergibt Karte.tsx, weil
// es Leaflet lädt.

import { add, dist, einheit, rechts, sub, wgs, type P } from '../geo'
import type { FallRechnung } from '../rechner'
import type { Konflikt, StreifenErgebnis, ZufahrtErgebnis } from '../rechner/typen'
import type { Poly } from '../rechner/poly'
import { type Hindernis, laengsPolygon, BAUM_STAMM_M } from '../rechner/hindernisse'
import type { FlaechePlan, PlanArt } from '../fall'
import type { AvFlaeche } from '../daten/av'
import { avKartenStil, avKlasse } from '../daten/anbieter/gemeinsam/avKarte'
import type { NeigungMessung } from '../knotensicht/rechner/typen'
import { PW_BREITE_M, PW_LAENGE_M } from '../knotensicht/rechner/fahrzeug'
import { AUGHOEHE_M, type ErkennungLinie } from '../rechner/erkennung'
import { ZIEL_HOEHE_WARTE_M } from '../sichtGelaende'
import { fahrzeugFarbe, fgsFahrzeuge, tueFahrzeuge, VELO_SICHT_FARBE, type FahrzeugForm } from '../fahrzeuge'
import { peilung } from '../streetview'

/** WGS84 [Breite, Länge] in Grad */
export type LL = [lat: number, lon: number]
/** fahrzeug: Blick vom Sichtpunkt; uebersicht: Kreisbahn um den Streifen; frei: Kamera vom Streifen gelöst, über die Karte verschiebbar */
export type KameraModus = 'fahrzeug' | 'uebersicht' | 'frei'

/** Augenhöhe über der Fahrbahn [m], wie die Sichtrechnung (VSS 40 241) */
export const AUGHOEHE = AUGHOEHE_M
/** Zielpunkt der Sichtlinien [m]: Wartefläche 0,60 m über dem Boden wie die Geländeprüfung (sichtGelaende.ts), Bodenmarkierung am Boden */
export const ZIELHOEHE_WARTE_M = ZIEL_HOEHE_WARTE_M
export const ZIELHOEHE_MARKIERUNG_M = 0
/** Balken des Fussgängerstreifens: 0,50 m breit mit 0,50 m Abstand quer zur Streifenachse (wie die Luftbild-Erkennung), Länge = Streifenbreite */
export const BALKEN_M = 0.5
/** Annahmen für die Darstellung [m]: Länge × Breite × Höhe bzw. Höhe */
export const AUTO_MASSE: readonly [number, number, number] = [PW_LAENGE_M, PW_BREITE_M, 1.5]
export const VELO_MASSE: readonly [number, number, number] = [1.8, 0.6, 1.2]
export const PERSON_MASSE: readonly [number, number, number] = [0.5, 0.5, 1.7]
export const PARK_HOEHE_M = 1.5
export const PARKRAND_FARBE = '#2563eb'
export const PARK_HINWEIS = 'Parkquader zeigen die ganze Parkfläche, die auch die Rechnung berücksichtigt. Belegung und Höhe sind angenommen.'
/** Velo- und Motorradfelder zählen in der Rechnung nur als Hinweis: niedriger und blasser */
export const PARK_ZWEIRAD_HOEHE_M = 1.0
export const SICHTBEHINDERND_M = 1.5
export const NICHT_SICHTBEHINDERND_M = 0.5
export const BAUM_HOEHE_M = 4
/** Ausschliesslich Darstellung: generische Krone, 5 m breit, von 2 bis 8 m über dem Boden. Keine gemessene Kronengeometrie. */
export const BAUM_KRONE_MASSE: readonly [number, number, number] = [5, 5, 6]
export const BAUM_KRONE_MITTE_M = 5
export const BAUM_STAMM_MIN_M = 0.3
/** verdeckende Objekte der Rechnung je Klasse: Höhe des Körpers; Gebäude nur aufgelegt (das Haus kommt aus swissBUILDINGS3D) */
export const KONFLIKT_HOEHE: Readonly<Record<Konflikt['klasse'], number | undefined>> =
  { auto: PARK_HOEHE_M, velo: PARK_ZWEIRAD_HOEHE_M, motorrad: PARK_ZWEIRAD_HOEHE_M, hindernis: SICHTBEHINDERND_M, baum: BAUM_HOEHE_M, gebaeude: undefined }
/** Übersicht: Abstand der Kamera zum Streifen [m] und Neigung [°, negativ = abwärts] */
export const UEBERSICHT_DISTANZ_M = 60
export const UEBERSICHT_NEIGUNG_GRAD = -45
/** zuletzt gewählte Kamera (nur Bequemlichkeit, darf fehlen) */
export const SCHLUESSEL_MODUS = 'fgs.ansicht3d'

/** Farben wie auf der 2D-Karte (Karte.tsx) */
export const STREIFEN_FARBE = '#eab308'
export const OHNE_VORTRITT_FARBE = '#ffffff'
export const TUE_FARBE = '#64748b'
export const ANN_FARBE = '#111827'
export const SPUR_FARBE = '#ffffff'
export const KONFLIKT_FARBE = '#dc2626'
export const PERSON_FARBE = '#475569'
export const BAUM_FARBE = '#78350f'
export const SICHT_NICHT_GEPRUEFT = '#94a3b8'
export const SICHT_BEWUCHS = '#facc15'
/** Deckkraft der AV-Flächen auf dem neutralen Boden (auf der 2D-Karte liegen sie blass über dem Luftbild) */
export const AV_DECKKRAFT: Readonly<Record<string, number>> = { strasse: 0.9, trottoir: 0.9, verkehrsinsel: 0.9, gebaeude: 0.6, gruen: 0.45, uebrige: 0.3 }
/** Reihenfolge der aufgelegten Flächen und Linien von unten nach oben (Cesium zIndex) */
export const EBENE: Readonly<Record<Flaeche3D['art'] | Linie3D['art'], number>> = { av: 0, ann: 1, plan: 2, sichtfeld: 3, velofeld: 4, streifen: 5,
  konflikt: 6, parkfeld: 6, hindernis: 6, annRand: 7, planRand: 7, inselRand: 7, umriss: 8, spur: 9 }

export interface Farben3D {
  status: Readonly<Record<string, string>>
  hindernis: (h: Hindernis) => string
  plan: Readonly<Record<PlanArt, { flaeche: string; linie: string }>>
  insel: string
}

/** Fläche auf dem Gelände (hoehe fehlt) bzw. als Körper mit dieser Höhe über dem Gelände; ringe[0] aussen, weitere Löcher */
export interface Flaeche3D {
  /** Kennung der Parkfläche für Grundriss und transparente Prüfhülle. */
  parkfeld?: string
  pruefhuelle?: true
  fahrbahn?: string
  avArt?: string
  id: string
  art: 'av' | 'streifen' | 'ann' | 'sichtfeld' | 'velofeld' | 'konflikt' | 'plan' | 'parkfeld' | 'hindernis'
  ringe: LL[][]
  farbe: string
  alpha: number
  hoehe?: number
  text: string
}
/** Linie auf dem Gelände */
export interface Linie3D { parkfeld?: string; fahrbahn?: string; id: string; art: 'spur' | 'umriss' | 'annRand' | 'inselRand' | 'planRand'; punkte: LL[]; farbe: string; breite: number
  gestrichelt?: boolean; text: string }
/** Wand (Hecke, Mauer, Übriges als Linie) mit dieser Höhe über dem Gelände */
export interface Wand3D { fahrbahn?: string; id: string; punkte: LL[]; hoehe: number; farbe: string; text: string }
/** Körper auf dem Gelände: Fahrzeug (Box), Person und Baum (Zylinder); peilung = Fahrt- bzw. Blickrichtung in Grad ab Norden */
export interface Koerper3D {
  fahrbahn?: string
  id: string
  art: 'auto' | 'velo' | 'person' | 'baum'
  mitte: LL
  peilung: number
  masse: readonly [number, number, number]
  farbe: string
  text: string
  /** Fahrzeug der gewählten Zufahrt: im Modus «Aus dem Fahrzeug» ausgeblendet, die Kamera sitzt darin */
  eigen?: true
}
/** Sichtlinie der gewählten Zufahrt: vom Auge (Gelände + augHoehe) zum Ziel (Gelände + zielHoehe); frei aus der Rechnung; profil = Kennung des
 *  Geländeprofils wie in gelaendeKarte.ts (gel:<fgsId>:<zufahrt>:warte|markierung:<x>), gewaehlt = dieses Profil ist ausgewählt */
export interface Sichtlinie3D { fahrbahn?: string; id: string; auge: LL; ziel: LL; augHoehe: number; zielHoehe: number; frei: boolean | null; farbe: string
  text: string; bruecke?: true; profil?: string; gewaehlt?: boolean }
export interface KameraFahrzeug { auge: LL; ziel: LL; augHoehe: number; zielHoehe: number; peilung: number; abstandM: number; bruecke: boolean
  zufahrt: string; profil?: string }
/** weitere Eingaben der Szene: Sichtfeldwahl der 2D-Karte (Sichtfelder.tsx) und das gewählte Geländeprofil (Karte.tsx profilAuswahl) */
/** bruecken: Umrisse der AV-Einzelobjekte Bruecke_Passerelle (LV95), dieselbe Quelle wie die Rechnung (rechner/bruecke.ts) */
export interface SzeneOptionen { feldZeigen?: (art: 'auto' | 'velo', z: ZufahrtErgebnis) => boolean; profil?: string | null; bruecken?: readonly Poly[] }
export interface KameraUebersicht { ziel: LL; peilung: number; distanzM: number; neigungGrad: number }
export interface Szene3D {
  /** Wege beginnen am Streifen; Schlüssel der Zufahrt bzw. streifen:<id> für Warteflächen. */
  wege?: { id: string; punkte: LL[] }[]
  flaechen: Flaeche3D[]
  linien: Linie3D[]
  waende: Wand3D[]
  koerper: Koerper3D[]
  sichtlinien: Sichtlinie3D[]
  kamera: { fahrzeug: KameraFahrzeug | null; uebersicht: KameraUebersicht | null }
  legende: string
  leer: boolean
  /** Brückenumrisse (WGS84): nur darin dürfen Körper, Kamera und Sichtlinien auf eine Brückenfahrbahn gehoben werden */
  bruecken: LL[][][]
}

export const ll = (p: P): LL => wgs(p[0], p[1])
/** Ring ohne doppelten Schlusspunkt, in WGS84 */
export function ring(r: readonly P[]): LL[] {
  const n = r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.length - 1 : r.length
  return r.slice(0, n).map(ll)
}
const zufahrtKey = (z: Pick<ZufahrtErgebnis, 'fgsId' | 'zufahrt'>) => `${z.fgsId}|${z.zufahrt}`
const m1 = (v: number) => v.toFixed(1).replace('.', ',')

export const LEGENDE = `Höhen angenommen: Auge ${m1(AUGHOEHE)} m über der Fahrbahn, Ziel auf der Wartefläche ${m1(ZIELHOEHE_WARTE_M)} m; Autos ${m1(AUTO_MASSE[2])} m, ` +
  `Personen ${m1(PERSON_MASSE[2])} m; Prüfhüllen der Auto-Parkflächen ${m1(PARK_HOEHE_M)} m (Velo- und Motorradflächen ${m1(PARK_ZWEIRAD_HOEHE_M)} m); Hecken und Mauern ${m1(SICHTBEHINDERND_M)} m (sichtbehindernd) bzw. ` +
  `${m1(NICHT_SICHTBEHINDERND_M)} m; Bäume als Stamm ${BAUM_HOEHE_M} m. Zuschaltbare Baumkronen direkt an diesen Standorten: Form angenommen, 5 m breit, Gesamthöhe 8 m; keine gemessenen Kronen. Boden: Flächen der Amtlichen Vermessung auf dem Gelände von swisstopo; Gebäude aus swissBUILDINGS3D, Brücken aus swissTLM3D, in der Stadt Bern aus den Kunstbauten der Stadt. ` +
  'Fahrbahnhöhen folgen den Zufahrten mit Bodenprofilen aus dem DTM 2023 der Stadt Bern bzw. swissALTI3D. Ergänzte Fahrbahnanschlüsse: Darstellung, keine gemessene Fläche; Breite aus der AV, ersatzweise 6 m innerhalb der AV-Strassenfläche. Mehrdeutige Höhen werden nicht dargestellt. ' + PARK_HINWEIS + ' Die Ansicht prüft nichts und ändert kein Ergebnis.'

/** Flächen eines Polygons mit Löchern (rechner/poly: Ring[0] aussen) */
const polyRinge = (poly: Poly): LL[][] => poly.filter(r => r.length >= 3).map(ring)

/**
 * Szene aus der Rechnung: Boden aus den AV-Flächen, alle Streifen mit Warteflächen, Fahrlinien und Sichtfeldern, Fahrzeuge und Personen,
 * Hindernisse, Flächen (Plan); für die gewählte Zufahrt (auswahl = «fgsId|zufahrt») zusätzlich Velo-Sichtfeld, verdeckende Objekte, Sichtlinien und die Kamera
 * «Aus dem Fahrzeug». Die Übersicht zielt auf den Streifen der gewählten Zufahrt, sonst auf den ersten.
 */
export function szene3d(rechnung: FallRechnung | null, auswahl: string | null, hindernisse: readonly Hindernis[],
  flaechenPlan: readonly FlaechePlan[], neigung: Readonly<Record<string, NeigungMessung>> | null, farben: Farben3D,
  av: readonly AvFlaeche[] = [], optionen: SzeneOptionen = {}): Szene3D {
  const flaechen: Flaeche3D[] = [], linien: Linie3D[] = [], waende: Wand3D[] = [], koerper: Koerper3D[] = [], sichtlinien: Sichtlinie3D[] = []
  av.forEach((f, i) => { const ringe = polyRinge(f.ringe); if (ringe.length) { const st = avKartenStil(f.art)
    flaechen.push({ id: `av:${i}`, art: 'av', avArt: f.art, ringe, farbe: st.farbe, alpha: AV_DECKKRAFT[avKlasse(f.art)] ?? 0.3, text: `Amtliche Vermessung: ${f.art}` }) } })
  const kamera: { fahrzeug: KameraFahrzeug | null; uebersicht: KameraUebersicht | null } = { fahrzeug: null, uebersicht: null }
  const streifen = rechnung?.streifen ?? []
  const wege: NonNullable<Szene3D['wege']> = []
  for (const s of streifen) {
    const vorher = [flaechen.length, linien.length, koerper.length, sichtlinien.length]
    streifenEinfuegen(s, auswahl, neigung, farben, optionen, flaechen, linien, koerper, sichtlinien, k => { kamera.fahrzeug = k })
    const id = `streifen:${s.fgsId}`
    wege.push({ id, punkte: [ll(s.m), ll(s.p0), ll(s.p1)] })
    for (const z of s.zufahrten) if (z.spur.length) wege.push({ id: zufahrtKey(z), punkte: z.spur.map(ll) })
    for (const [j, objekte] of [flaechen, linien, koerper, sichtlinien].entries())
      for (const o of objekte.slice(vorher[j])) {
        // Fahrzeuge ohne zugeordnete Zufahrt (Knotensicht) nicht an den Streifen versetzen.
        if (j === 2 && 'art' in o && o.art !== 'person') continue
        o.fahrbahn ??= id
      }
  }
  const zielStreifen = streifen.find(s => s.zufahrten.some(z => zufahrtKey(z) === auswahl)) ?? streifen[0]
  if (zielStreifen) kamera.uebersicht = { ziel: ll(zielStreifen.m), peilung: kamera.fahrzeug?.peilung ?? 0, distanzM: UEBERSICHT_DISTANZ_M,
    neigungGrad: UEBERSICHT_NEIGUNG_GRAD }
  for (const h of hindernisse) hindernisEinfuegen(h, farben, flaechen, linien, waende, koerper)
  // Vorschläge der Rechnung: amtliche Parkfelder (Kataster) zählen ohne Bestätigung und stehen als Körper; Vorschläge aus OSM zählen erst
  // nach Bestätigung und liegen nur als Umriss auf dem Boden. Verworfene Parkfelder (rechnung.parkVerworfen) fehlen.
  for (const v of rechnung?.vorschlaege ?? []) {
    if (v.hindernis.quelle === 'kataster') {
      if (!hindernisse.some(h => h.id === v.hindernis.id)) hindernisEinfuegen(v.hindernis, farben, flaechen, linien, waende, koerper)
    }
    else if (v.hindernis.art === 'parkfeld' && v.hindernis.ring.length >= 3) flaechen.push({ id: `vorschlag:${v.id}`, art: 'parkfeld', ringe: [ring(v.hindernis.ring)],
      farbe: farben.hindernis(v.hindernis), alpha: 0.25, text: `Vorschlag aus OSM, zählt erst nach Bestätigung: ${v.grund}` })
  }
  for (const fp of flaechenPlan) if (fp.ring.length >= 3) {
    const farbe = farben.plan[fp.art]
    flaechen.push({ id: `plan:${fp.id}`, art: 'plan', ringe: [ring(fp.ring)], farbe: farbe.flaeche, alpha: 0.25, text: `Fläche (Plan): ${fp.art}` })
    linien.push({ id: `planRand:${fp.id}`, art: 'planRand', punkte: geschlossen(fp.ring), farbe: farbe.linie, breite: 2, gestrichelt: true,
      text: `Fläche (Plan): ${fp.art}` })
  }
  const bruecken = (optionen.bruecken ?? []).map(polyRinge).filter(r => r.length)
  return { flaechen, linien, waende, koerper, sichtlinien, kamera, legende: LEGENDE, leer: streifen.length === 0, bruecken, wege }
}

const geschlossen = (r: readonly P[]): LL[] => { const x = ring(r); return x.length ? [...x, x[0]] : x }

/** Balken des Streifens quer zur Achse p0→p1, je BALKEN_M breit mit BALKEN_M Abstand, Länge = Streifenbreite bw */
export function balken(s: Pick<StreifenErgebnis, 'p0' | 'p1' | 'bw'>): P[][] {
  const L = dist(s.p0, s.p1)
  if (L < BALKEN_M || s.bw <= 0) return []
  const u = einheit(sub(s.p1, s.p0)), n = rechts(u), h = s.bw / 2
  const aus: P[][] = []
  for (let d = BALKEN_M / 2; d + BALKEN_M / 2 <= L + 1e-6; d += 2 * BALKEN_M) {
    const a = add(s.p0, u, d - BALKEN_M / 2), b = add(s.p0, u, d + BALKEN_M / 2)
    aus.push([add(a, n, -h), add(b, n, -h), add(b, n, h), add(a, n, h)])
  }
  return aus
}

function streifenEinfuegen(s: StreifenErgebnis, auswahl: string | null, neigung: Readonly<Record<string, NeigungMessung>> | null,
  farben: Farben3D, optionen: SzeneOptionen, flaechen: Flaeche3D[], linien: Linie3D[], koerper: Koerper3D[], sichtlinien: Sichtlinie3D[],
  kamera: (k: KameraFahrzeug) => void): void {
  const feldZeigen = optionen.feldZeigen ?? (() => true)
  const tue = !!s.trottoirueberfahrt
  if (s.umriss.length >= 3) {
    if (tue) linien.push({ id: `umriss:${s.fgsId}`, art: 'umriss', punkte: geschlossen(s.umriss), farbe: TUE_FARBE, breite: 3, gestrichelt: true,
      text: `Trottoirüberfahrt ${s.strasse}` })
    else if (s.querung) linien.push({ id: `umriss:${s.fgsId}`, art: 'umriss', punkte: geschlossen(s.umriss), farbe: OHNE_VORTRITT_FARBE, breite: 3,
      gestrichelt: true, text: `Querung ohne Vortritt ${s.strasse}` })
    else balken(s).forEach((b, i) => flaechen.push({ id: `streifen:${s.fgsId}:${i}`, art: 'streifen', ringe: [ring(b)], farbe: STREIFEN_FARBE, alpha: 0.9,
      text: `Fussgängerstreifen ${s.strasse}` }))
  }
  if (!tue) s.ann.forEach((poly, i) => {
    const ringe = polyRinge(poly)
    if (!ringe.length) return
    flaechen.push({ id: `ann:${s.fgsId}:${i}`, art: 'ann', ringe, farbe: ANN_FARBE, alpha: 0.15, text: 'Wartefläche (Annäherungsbereich)' })
    linien.push({ id: `annRand:${s.fgsId}:${i}`, art: 'annRand', punkte: [...ringe[0], ringe[0][0]], farbe: ANN_FARBE, breite: 2, gestrichelt: true,
      text: 'Wartefläche (Annäherungsbereich)' })
  })
  for (const z of s.zufahrten) {
    const key = zufahrtKey(z), gewaehlt = key === auswahl
    const farbe = farben.status[z.status] ?? farben.status.frei
    if (z.spur.length >= 2) linien.push({ id: `spur:${key}`, fahrbahn: key, art: 'spur', punkte: z.spur.map(ll), farbe: SPUR_FARBE, breite: 2, gestrichelt: true,
      text: `Fahrlinie ${z.strasse ?? ''}`.trim() })
    if (feldZeigen('auto', z)) z.feld.forEach((poly, i) => { const ringe = polyRinge(poly); if (ringe.length) flaechen.push({ id: `sichtfeld:${key}:${i}`, art: 'sichtfeld', ringe,
      farbe, alpha: gewaehlt ? 0.3 : 0.12, text: `Sichtfeld ${z.strasse ?? ''}: ${z.status.replace(/_/g, ' ')}`.trim() }) })
    if (!gewaehlt) continue
    if (feldZeigen('velo', z)) z.velo?.feld.forEach((poly, i) => { const ringe = polyRinge(poly); if (ringe.length) flaechen.push({ id: `velofeld:${key}:${i}`, art: 'velofeld',
      ringe, farbe: z.velo!.frei ? VELO_SICHT_FARBE.frei : VELO_SICHT_FARBE.verdeckt, alpha: 0.25, text: 'Sichtfeld des Velos' }) })
    z.konflikte.forEach((k, i) => k.geom.forEach((poly, j) => { const ringe = polyRinge(poly); if (ringe.length) flaechen.push({
      id: `konflikt:${key}:${i}:${j}`, fahrbahn: key, art: 'konflikt', ringe, farbe: KONFLIKT_FARBE, alpha: 0.6, hoehe: KONFLIKT_HOEHE[k.klasse],
      text: `Verdeckt die Sicht: ${k.klasse}${k.id ? ` ${k.id}` : ''}` }) }))
    const auge = z.sichtpunkte[z.sichtpunkte.length - 1]
    if (!auge) continue
    const sg = z.sichtGelaende, profilId = (art: 'warte' | 'markierung', x: number) => `gel:${s.fgsId}:${z.zufahrt}:${art}:${x}`
    if (sg?.linien.length) for (const l of sg.linien) sichtlinien.push({ id: `sicht:${key}:${l.x}`, fahrbahn: key, auge: ll(l.auge), ziel: ll(l.ziel),
      augHoehe: AUGHOEHE, zielHoehe: ZIELHOEHE_WARTE_M, frei: l.frei, farbe: l.frei === null ? SICHT_NICHT_GEPRUEFT : l.frei ? farben.status.frei : farben.status.verdeckt_gelaende,
      text: `Sicht auf die Wartefläche ${l.x} m vor dem Streifen: ${l.frei === null ? 'nicht geprüft' : l.frei ? 'frei' : 'durch das Gelände verdeckt'}`,
      profil: profilId('warte', l.x), gewaehlt: optionen.profil === profilId('warte', l.x), ...(l.bruecke ? { bruecke: true } : {}) })
    else s.rand.forEach((r, i) => sichtlinien.push({ id: `sicht:${key}:rand${i}`, fahrbahn: key, auge: ll(auge), ziel: ll(r), augHoehe: AUGHOEHE, zielHoehe: ZIELHOEHE_WARTE_M,
      frei: null, farbe: SICHT_NICHT_GEPRUEFT, text: 'Sichtlinie vom Auge zur Bordkante (Gelände nicht geprüft)' }))
    // gewähltes Profil der Erkennungsdistanz (Bodenmarkierung): nur dieses, Ziel am Boden
    const markierung = (z.erkennungLinien ?? []).find((l: ErkennungLinie) => optionen.profil === profilId('markierung', l.x))
    if (markierung) sichtlinien.push({ id: `erkennung:${key}:${markierung.x}`, fahrbahn: key, auge: ll(markierung.auge), ziel: ll(markierung.ziel), augHoehe: AUGHOEHE,
      zielHoehe: ZIELHOEHE_MARKIERUNG_M, frei: markierung.befund === 'frei', profil: profilId('markierung', markierung.x), gewaehlt: true,
      farbe: markierung.befund === 'frei' ? farben.status.frei : markierung.befund === 'bewuchs' ? SICHT_BEWUCHS : farben.status.verdeckt,
      text: `Erkennung der Bodenmarkierung ${markierung.x} m vor dem Streifen: ${markierung.befund}` })
    // Kamera: am Auge des gewählten Profils, sonst am Sichtpunkt der Zufahrt
    const p = sichtlinien.find(l => l.gewaehlt)
    const augeP = p ? p.auge : ll(auge), zielP = p ? p.ziel : ll(s.m)
    const augeLv = p && sg?.linien.find(l => profilId('warte', l.x) === p.profil)?.auge || (markierung && p?.profil === profilId('markierung', markierung.x) ? markierung.auge : null) || auge
    const zielLv = p && (sg?.linien.find(l => profilId('warte', l.x) === p.profil)?.ziel ?? markierung?.ziel) || s.m
    kamera({ auge: augeP, ziel: zielP, augHoehe: AUGHOEHE, zielHoehe: p ? p.zielHoehe : ZIELHOEHE_WARTE_M, peilung: peilung(augeLv, zielLv), abstandM: dist(augeLv, zielLv),
      bruecke: sg?.stand === 'bruecke' || !!sg?.linien.some(l => l.bruecke), zufahrt: key, ...(p?.profil ? { profil: p.profil } : {}) })
  }
  // Velos nicht zeigen: für die Sichtweite der Autos ohne Bedeutung (Nutzerentscheid 04.11.2026); ihr Sichtfeld bleibt bei der gewählten Zufahrt.
  // Wartende Personen nicht in der Mitte der Wartefläche (so die 2D-Karte), sondern an ihren hinteren Ecken: dort prüft die Rechnung die Sicht,
  // und dort fehlt sie oft zuerst (05.11.2026)
  for (const f of [...fgsFahrzeuge(s, neigung), ...tueFahrzeuge(s)]) if (f.art !== 'velo' && f.rolle !== 'warte') koerper.push(koerperAus(f, auswahl))
  if (!tue) s.ann.forEach((poly, i) => { for (const [k, p] of hintereEcken(poly, s.m).entries())
    koerper.push({ id: `person:${s.fgsId}:${i}:${k}`, art: 'person', mitte: ll(p), peilung: peilung(p, s.m), masse: PERSON_MASSE, farbe: PERSON_FARBE,
      text: 'Wartende Person an der Ecke der Wartefläche (dort prüft die Rechnung die Sicht)' }) })
}

/** die beiden Ecken des äusseren Rings einer Wartefläche, die am weitesten von der Streifenmitte liegen (hintere Ecken des Trapezes) */
export function hintereEcken(poly: Poly, m: P): P[] {
  const ring = poly[0] ?? []
  if (ring.length < 3) return []
  return [...ring].sort((a, b) => dist(b, m) - dist(a, m)).slice(0, 2)
}

function koerperAus(f: FahrzeugForm, auswahl: string | null): Koerper3D {
  const blass = !!f.zufahrt && f.zufahrt !== auswahl
  const masse = f.art === 'auto' ? AUTO_MASSE : f.art === 'velo' ? VELO_MASSE : PERSON_MASSE
  const farbe = f.art === 'person' ? PERSON_FARBE : fahrzeugFarbe(f, blass)
  const eigen = f.art === 'auto' && !!f.zufahrt && f.zufahrt === auswahl
  return { id: `fahrzeug:${f.objekt ?? `${f.zufahrt ?? f.rolle}:${f.mitte[0].toFixed(2)}:${f.mitte[1].toFixed(2)}`}`, art: f.art, mitte: ll(f.mitte),
    peilung: peilung(f.mitte, add(f.mitte, f.richtung)), masse, farbe, text: f.text, fahrbahn: f.zufahrt, ...(eigen ? { eigen: true as const } : {}) }
}

function hindernisEinfuegen(h: Hindernis, farben: Farben3D, flaechen: Flaeche3D[], linien: Linie3D[], waende: Wand3D[], koerper: Koerper3D[]): void {
  const farbe = farben.hindernis(h), name = h.name ?? h.art
  if (h.art === 'parkfeld' || h.art === 'laengsparkierung') {
    const r = h.art === 'parkfeld' ? h.ring : laengsPolygon(h.linie, h.breite)
    const zweirad = h.art === 'parkfeld' && h.klasse !== 'auto'
    if (!zweirad && r.length >= 3) {
      const parkfeld = h.id, text = `${h.art === 'parkfeld' ? 'Parkfeld' : 'Längsparkierung'} ${name} – Belegung angenommen`.trim()
      flaechen.push({ id: `hindernis:${h.id}`, parkfeld, art: 'parkfeld', ringe: [ring(r)], farbe: PARKRAND_FARBE, alpha: 0.1, text })
      linien.push({ id: `parkRand:${h.id}`, parkfeld, art: 'umriss', punkte: geschlossen(r), farbe: PARKRAND_FARBE, breite: 2, text })
      flaechen.push({ id: `parkhuelle:${h.id}`, parkfeld, pruefhuelle: true, art: 'parkfeld', ringe: [ring(r)], farbe: PARKRAND_FARBE,
        alpha: 0.18, hoehe: PARK_HOEHE_M, text: `Prüfhülle: ganze Parkfläche ${name} (Höhe angenommen)` })
      return
    }
    if (r.length >= 3) flaechen.push({ id: `hindernis:${h.id}`, art: 'parkfeld', ringe: [ring(r)], farbe, alpha: zweirad ? 0.4 : 0.7,
      hoehe: zweirad ? PARK_ZWEIRAD_HOEHE_M : PARK_HOEHE_M,
      text: `${h.art === 'parkfeld' ? `Parkfeld (${h.klasse})` : 'Längsparkierung'} ${name}${zweirad ? ' – nur Hinweis, kein Sichthindernis der Rechnung' : ''}`.trim() })
  } else if (h.art === 'baum') {
    const d = Math.max(h.stamm || BAUM_STAMM_M, BAUM_STAMM_MIN_M)
    koerper.push({ id: `hindernis:${h.id}`, art: 'baum', mitte: ll(h.p), peilung: 0, masse: [d, d, BAUM_HOEHE_M], farbe: BAUM_FARBE,
      text: `Baum ${name} (Stamm ${m1(d)} m, Höhe angenommen)` })
  } else if (h.art === 'insel') {
    if (h.ring.length >= 3) linien.push({ id: `inselRand:${h.id}`, art: 'inselRand', punkte: geschlossen(h.ring), farbe: farben.insel, breite: 2,
      gestrichelt: true, text: `Insel ${name}` })
  } else {
    const hoehe = h.sichtbehindernd ? SICHTBEHINDERND_M : NICHT_SICHTBEHINDERND_M
    const text = `${h.art} ${name} (${h.sichtbehindernd ? 'sichtbehindernd' : 'nicht sichtbehindernd'}, Höhe angenommen)`
    if (h.ring && h.ring.length >= 3) flaechen.push({ id: `hindernis:${h.id}`, art: 'hindernis', ringe: [ring(h.ring)], farbe, alpha: 0.7, hoehe, text })
    else if (h.linie && h.linie.length >= 2) waende.push({ id: `hindernis:${h.id}`, punkte: h.linie.map(ll), hoehe, farbe, text })
  }
}

// ---------------------------------------------------------------- Kamera

/** Vorgabe der Kamera: gemerkter Modus, sonst «Aus dem Fahrzeug», wenn eine Zufahrt gewählt ist; ohne Fahrzeugkamera immer Übersicht */
export function kameraModusVorgabe(szene: Pick<Szene3D, 'kamera'>, gemerkt: KameraModus | null): KameraModus {
  if (!szene.kamera.fahrzeug) return 'uebersicht'
  return gemerkt ?? 'fahrzeug'
}

const rad = (grad: number) => (grad * Math.PI) / 180
/** Blick aus dem Fahrzeug: Heading aus der Peilung, Neigung aus dem Höhenunterschied (Szenenhöhen Ziel − Auge) über die Distanz [rad] */
export function kameraHeadingPitch(dHoehe: number, horizontalM: number, peilungGrad: number): { heading: number; pitch: number } {
  return { heading: rad(peilungGrad), pitch: horizontalM > 0 ? Math.atan2(dHoehe, horizontalM) : 0 }
}
/** Drehung eines Körpers: Cesium zählt das Heading der Körper ab Osten (ENU), die Peilung ab Norden [rad] */
export const koerperHeading = (peilungGrad: number): number => rad(peilungGrad - 90)
/** Übersicht als Kreisbahn um den Streifen: Heading, Neigung und Abstand für camera.lookAt [rad, rad, m] */
export function uebersichtKamera(k: KameraUebersicht): { heading: number; pitch: number; range: number } {
  return { heading: rad(k.peilung), pitch: rad(k.neigungGrad), range: k.distanzM }
}

type Speicher = Pick<Storage, 'getItem' | 'setItem'>
function speicher(): Speicher | null { try { return globalThis.localStorage ?? null } catch { return null } }
/** gemerkter Kameramodus; fehlt er bzw. ist der Speicher nicht lesbar: null */
export function modusLesen(s: Speicher | null = speicher()): KameraModus | null {
  try { const v = s?.getItem(SCHLUESSEL_MODUS); return v === 'fahrzeug' || v === 'uebersicht' ? v : null } catch { return null }
}
/** Kameramodus merken (Fehler beim Schreiben werden geschluckt); «frei» nicht: es hat keinen eigenen Startpunkt, beim Öffnen gilt
 *  der zuletzt gemerkte feste Modus */
export function modusSpeichern(m: KameraModus, s: Speicher | null = speicher()): void {
  if (m === 'frei') return
  try { s?.setItem(SCHLUESSEL_MODUS, m) } catch { /* nicht speicherbar: nur für diese Sitzung */ }
}

/** Liegt der Punkt in einem Brückenumriss (gerade/ungerade über alle Ringe eines Umrisses, Löcher eingeschlossen)? */
export function aufBruecke(p: LL, bruecken: readonly LL[][][]): boolean {
  const [y, x] = p
  return bruecken.some(poly => {
    let drin = false
    for (const r of poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [yi, xi] = r[i], [yj, xj] = r[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) drin = !drin
    }
    return drin
  })
}

/** Exakter Schnitt einer Linie mit den Rändern eines Brückenumrisses, auch ohne Stützpunkt darin. */
export function linieBeruehrtBruecke(pts: readonly LL[], bruecken: readonly LL[][][]): boolean {
  if (pts.some(p => aufBruecke(p, bruecken))) return true
  const kreuz = (a: LL, b: LL, c: LL) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  for (let i = 1; i < pts.length; i++) for (const poly of bruecken) for (const ring of poly)
    for (let j = 0; j < ring.length; j++) {
      const a = pts[i - 1], b = pts[i], c = ring[j], d = ring[(j + 1) % ring.length]
      const box = [0, 1].every(k => Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k])) <= Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k])))
      if (box && kreuz(a, b, c) * kreuz(a, b, d) <= 0 && kreuz(c, d, a) * kreuz(c, d, b) <= 0) return true
    }
  return false
}

/** Linie mit Zwischenpunkten höchstens alle schrittM Meter (für Linien, die einer Brückenfahrbahn folgen, statt aufs Gelände gelegt) */
export function verdichten(pts: readonly LL[], schrittM: number): LL[] {
  if (pts.length < 2) return pts.slice()
  const aus: LL[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const [la0, lo0] = pts[i - 1], [la1, lo1] = pts[i]
    const m = Math.hypot((la1 - la0) * 111320, (lo1 - lo0) * 111320 * Math.cos((la0 * Math.PI) / 180))
    const n = Math.max(1, Math.ceil(m / schrittM))
    for (let k = 1; k <= n; k++) aus.push([la0 + ((la1 - la0) * k) / n, lo0 + ((lo1 - lo0) * k) / n])
  }
  return aus
}

/** Punkt um m Meter in Richtung der Peilung (Grad ab Norden im Uhrzeigersinn) versetzt; negativ = rückwärts */
export function versatz(p: LL, peilungGrad: number, m: number): LL {
  const r = (peilungGrad * Math.PI) / 180
  return [p[0] + (Math.cos(r) * m) / 111320, p[1] + (Math.sin(r) * m) / (111320 * Math.cos((p[0] * Math.PI) / 180))]
}
