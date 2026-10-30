// ── Abbiegende Zufahrten (fgs_sicht_pruefen.pruefen, Abschnitt «abbiegende Zufahrten», und eckradius_av) ──
//
// Je Arm mit Rolle «abbiegend»: Spur vom Streifen zum Knoten, Spur des Arms, Tempo der Querstrasse, Fahrbahn des Arms
// (8–30 m ab Knoten), Fahrstreifenmitten beider Strassen als Geraden, Radius der inneren AV-Bordkante (Kreisfit an der
// Ecke) + Abstand der Fahrlinie (Rechtsabbieger 1,5 m, bfu 2.457.01 Abb. 1; Linksabbieger gemessen), Plausibilität der Ecke
// (Probe, Bogen führt in den Arm, Fahrseite), sonst Schätzung aus den Fahrbahnbreiten; Sichtweite nach dem Radius
// (bfu bis 20 m, VSS Tab. 2 bis 40 m, höchstens Tab. 1), «bis Knoten», «gedeckt» (entfällt; Schalter GEDECKT_RECHNEN,
// standardmässig aus); Fahrlinie (konzentrisch zur Ecke bzw. tangential), Sicherheitsnetz, Beginn am Umriss.
// ECKE_AN_FAHRSTREIFEN (Bordkante weit hinter dem Rand, Parkfelder im Bogen) und Abstand zu Parkfeldern (PARK_ABSTAND) seit E2.
// Nicht übernommen (Berner Sonderdaten): Abstand zum Velostreifen aus dem Kataster (VELO_ABBIEGEND), Abzug am
// Streifen aus dem Kataster (ABBIEGENDE_GEOMETRIE_ALT), Spur von Hand.
// Brückenumriss (AV-Einzelobjekte) und R2-Flächen (übrige befestigte Flächen als Fahrbahn) seit E2 wie in Python.
// Querung ohne Vortritt (seit 30.10.2026): Sicht höchstens bis zum Beginn des Abbiegens (Bogenende auf dem Arm, ohneVortritt.ts).

import { freiBis } from './freibis'
import {
  type P, add, dist, dot, einheit, neg, rechts, sub, richtungGrad, wdiff,
} from '../geo'
import { type OsmNetz, type ArmInfo, type Suche, type Knotenbereich, kennungArm, streckeLaenge, NEBENAST_GRAD } from './netz'
import type { Fahrbahn, Inseln } from './flaechen'
import type { Kreisel } from './kreisel'
import { KREISEL_EINFAHRT_LOKAL_M, KREISEL_EINFAHRT_ZUSATZ_M } from './kreisel'
import {
  refAuf, punkteAufSpur, punktAuf, abstandSpur, naechsterAufSpur, projektion, uebergang, glaetten, richtungAmKnoten,
  kreisAnpassen, kreisResiduum, stetigDrehend, kehre, gegendrehung, kanteDrehung, aufFahrbahnNaechst, umsetzen,
  randWaehlen, endpunkteMangel, abstandHalten, SCHRITT, ABST_UEBERGANG_M,
} from './spur'
import {
  type Fs, fahrstreifenmitte, fahrstreifenArm, fahrstreifenUebernehmen, fsHinweis, querschnittAmKnoten, fahrbahnOsm,
  wegeAbschnitte, hochBei, abzugAusOsm, abzugAnnahme, fahrstreifenTags, BREITE_ERSATZ, LAGE_ERSATZ,
} from './fahrstreifen'
import { sichtweiteTab1, sichtweiteKurve, radiusRunden, tempoStart, tempoEntlang, amtlichEntlang, SICHTWEITE, KURVE_SICHTWEITE, QUELLE_TAB1,
  SICHTWEITE_AUSSERORTS_60, istQuelleTab1, quelleTab1, type TempoAmtlich } from './tempo'
import { HW_ALLE } from '../daten/osm'
import { type Streifen, randAmUmriss, umrissRing } from './streifen'
import { type Multi, linieImPolygon, segmentieren, vereinigung, linienLaenge, abstandLinie, abstandPunkt } from './poly'
import { type Zufahrt, type Entfallen, entfallen } from './zufahrten'
import type { ZufahrtErgebnis } from './typen'
import { type VonHand, konfliktFelder, R2_FLAECHEN } from './pruefen'
import { planKurzAv, ECK_GROSS_M } from './planflaechen'
import type { Flaechen } from './flaechen'
import { liniePunkte, sichtweiteRadiusHand } from './spurhand'
import type { HindernisDaten } from './hindernisse'
import { SEHNE_HALB, INSELRAND_M } from './flaechen'
import {
  type OhneVortritt, sollQuerung, quelleQuerung, quelleQuerungAbbiegen, weiteQuerung, REICHWEITE_SICHT_M, BIS_ABBIEGEN,
} from './ohneVortritt'

export const BORD_ABSTAND_M = 1.5
const FAHRLINIE_AUF_FAHRBAHN = 0.9
const BOGEN_ARM_TOL = 2.0
const BOGEN_ARM_WINKEL = 30.0
const BOGEN_K_WINKEL = 45.0
const BOGEN_DREH_TOL = 45.0
const BOGEN_WINKEL_TOL = 15.0
const SEITE_RECHTS_TOL = 1.5
const SEITE_ACHSE_TOL = 1.0
export const RADIUS_MIN = 5.0
export const SPUR_MIN_M = 5.0
const ARM_AUF_FAHRBAHN = 0.5
const ARM_MIN_BREITE = 3.0
export const ARM_MESSUNG = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]
const LAGE_GRENZEN: [number, number] = [-1.0, 6.0]
const KURVE_ZUSATZ = 3.0
const BOGEN_RES_MAX = 0.3
const BOGEN_EINTEILIG = true
const ECK_GERADE_GRAD = 1.0
const ECK_MIN_M = 2.0
const ECK_NUR_PLAUSIBEL = true
const STREIFEN_TOL_M = 5.0
const SCHAETZUNG_AUF_FAHRBAHN = 0.5
const KEHRE_GRAD = 90.0
const GEGENDREH_GRAD = 20.0
const LINKS_DER_MITTE_TOL = 0.5
const RAND_RECHTS_MIN_M = 0.9
const ZWEISPURIG_MIN_M = 5.0
const LINKS_ARM_AM_KNOTEN = true
const KNOTEN_QUER_TOL_M = 1.0
const KNOTEN_QUER_LINKS = false
const LINKS_TANGENTIAL = true
const LINKS_INNEN_MIN_M = 0.5
const GEDECKT_NUR_MIT_GERADE = true
const GEDECKT_BIS_KNOTEN = true
// GEDECKT_RECHNEN an (Nutzerentscheid 13.10.2026, Rückmeldung «nicht systematisch alle Sichtweiten»): eine
// Abbiegezufahrt, die ab dem Knoten von der geraden Zufahrt gedeckt ist (bis dahin Entfallen-Grund «gedeckt»), wird vollständig
// gerechnet – Fahrlinie, Sichtfeld, Konflikte, Status – und zählt für den Streifenstatus; Kennzeichnung: Feld «deckung»
// (bisheriger Entfallen-Text) und Hinweis «gedeckt». Sichtweite: die Kurvensichtweite aus dem Radius (bfu bzw. VSS Tab. 2,
// höchstens Tab. 1 der Querstrasse) wie bei einer Abbiegezufahrt, deren Knoten innerhalb der Kurvensichtweite liegt, nicht
// «bis Knoten»: die Strecke ab dem Knoten prüft die gerade Zufahrt; mit «bis Knoten» entstanden Statuswechsel nur aus
// Sichtpunkten weit hinten im Arm bei Kurventempo (in der Prüfung waren 12 von 15 Statuswechseln solche Artefakte). Ein Radius von Hand
// entscheidet die Deckung neu (gedeckt oder nicht). Die Radiuswahl an der AV-Ecke (gedecktBei) bleibt wie bisher.
// False = wie bisher (entfällt, «gedeckt»). Nutzerentscheid 14.10.2026: aus – mit der Kurvensichtweite bringt die gedeckte
// Zufahrt keine neue Erkenntnis; in 42 Referenzstreifen und 180 Übergängen war keine verdeckt. Schalter und Code bleiben
export const GEDECKT_RECHNEN = false
let gedecktRechnen = GEDECKT_RECHNEN
/** Nur für Tests: Schalter GEDECKT_RECHNEN umstellen (null = Vorgabe) */
export const gedecktRechnenSetzen = (an: boolean | null) => { gedecktRechnen = an ?? GEDECKT_RECHNEN }
// «Fahrstreifen fast parallel»: kleinster Betrag des Kreuzprodukts der beiden Fahrstreifengeraden (geraden), darunter kein
// brauchbarer Schnittpunkt. An die Nebenast-Grenze gekoppelt (13.10.2026): 0,6 · sin(NEBENAST_GRAD), höchstens 0,2 (der Wert
// bis 13.10.2026, sin 11,5°). Mit NEBENAST_GRAD 10° sind das 0,104 = sin 6,0°: jeder Arm ab 10° Drehung wird gerechnet (mit 0,2
// fielen Arme mit 10–11,5° Drehung als «geometrie» weg). Reserve rund 4°, weil die Drehung die OSM-Achse misst (Sehne 10 m),
// die Geraden aber je 3 m Fahrstreifenmitte am Knoten. Die Obergrenze 0,2 hält die Grenze bei einer höheren Nebenast-Grenze
// beim bisherigen Wert (NEBENAST_GRAD 30° -> 0,2 wie bisher), statt Arme zu verwerfen, deren Fahrstreifen flacher münden, als
// die Drehung zeigt
export const PARALLEL_MIN = Math.min(0.2, 0.6 * Math.sin(NEBENAST_GRAD * Math.PI / 180))
// ECK_GROSS_M (23,5 m): seit 20.10.2026 in planflaechen.ts (die Anzeige nennt die Grenze für Ecken nach Plan-Flächen, ohne den Rechner zu laden)
const ECKE_AN_FAHRSTREIFEN = true
const ECKE_FS_MAX_M = 6.0
const ECKE_PARK_MIN = 2
const BRUECKE_SEITE_M = 12.0
const GLAETTUNG_M = 6.0
const f1 = (x: number) => x.toFixed(1).replace('.', ',')
const f2 = (x: number) => x.toFixed(2).replace('.', ',')
const auf01 = (x: number) => Math.ceil(x * 10 - 1e-9) / 10
const RAD = Math.PI / 180

// ---------------------------------------------------------------- eckradius_av
export type Eck = [number | null, string, P | null, P[] | null, [number, number, number, P, P[]] | null]
const eckCache = new Map<string, Eck>()
export const eckCacheLeeren = () => eckCache.clear()

// Bogen nach Plan-Fläche (20.10.2026, «Ecke runden»): der Kreisfit der Ecke (eckradiusAv) nimmt alle Randpunkte im Keil, die
// weder in der Richtung des Anfangs noch des Endes laufen. Endet der Keil an einer zweiten Ecke (z. B. eine gerundete Ecke,
// daneben eine gerade Kante und eine scharfe Ecke einer Plan-Fläche), misst er die Endrichtung dort und nimmt die gerade Kante
// in den Fit (Nutzerfall Könizstrasse: Bogen 6 m gerundet, gelesen 9,0 m). Mit Flächen (Plan) liegen die Ecken eines
// gezeichneten bzw. gerundeten Bogens als Ringpunkte vor: eine Folge von mindestens PLAN_BOGEN_MIN Ringecken auf dem gelesenen
// Bogen, je PLAN_BOGEN_GRAD gedreht (gleicher Sinn), Kanten höchstens PLAN_BOGEN_KANTE_M, zusammen mindestens
// PLAN_BOGEN_SUMME_GRAD, Kreisfit innert BOGEN_RES_MAX. Sie gilt als Bogen dieser Ecke, wenn ihre beiden Endtangenten je einer der
// beiden Strassen folgen (höchstens PLAN_BOGEN_WINKEL_GRAD) und als Bordkante neben deren Achse liegen (Abstand vom Knoten quer
// zur Strasse höchstens halbe Fahrbahn + PLAN_BOGEN_SEITE_M): sonst gehört der Bogen zu einer anderen Ecke (z. B. an der
// gegenüberliegenden Einmündung). Weicht ihr Radius um mehr als 5 cm vom gelesenen ab, gilt sie (die dem Knoten nächste Folge).
// Ohne Flächen (Plan) unverändert
const PLAN_BOGEN_GRAD: [number, number] = [0.2, 12.0]
const PLAN_BOGEN_KANTE_M = 1.0
const PLAN_BOGEN_MIN = 4
const PLAN_BOGEN_SUMME_GRAD = 20.0
const PLAN_BOGEN_WINKEL_GRAD = 30.0
const PLAN_BOGEN_SEITE_M = 3.0
export function planBogen(fahrbahn: Fahrbahn, bogen: P[], j: P, dEigen: P, dArm: P, halbEigen: number, halbArm: number): [number, P, P[]] | null {
  let best: [number, P, P[], number] | null = null
  const sinMax = Math.sin(PLAN_BOGEN_WINKEL_GRAD * RAD)
  // Endtangente (Punkt, Richtung) folgt der Strasse d und liegt höchstens grenze quer neben dem Knoten
  const anStrasse = (q: P, t: P, d_: P, grenze: number) =>
    Math.abs(t[0] * d_[1] - t[1] * d_[0]) <= sinMax && Math.abs((q[0] - j[0]) * d_[1] - (q[1] - j[1]) * d_[0]) <= grenze
  for (const t of fahrbahn.plan) for (const ring of t.poly) {
    const n = ring.length
    if (n < PLAN_BOGEN_MIN) continue
    const dreh = ring.map((q, i) => {
      const a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n]
      const u = sub(q, a), v = sub(b, q)
      return Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) / RAD
    })
    const ok = ring.map((q, i) => abstandLinie(q, bogen) <= 0.05 && Math.abs(dreh[i]) >= PLAN_BOGEN_GRAD[0] && Math.abs(dreh[i]) <= PLAN_BOGEN_GRAD[1])
    if (ok.every(x => x)) continue                               // ganzer Ring ein Bogen (Kreis): keine Ecke
    // Folgen im Ring (zyklisch), Start nach einer Ecke, die nicht passt
    const start = ok.findIndex(x => !x)
    let folge: number[] = []
    const folgen: number[][] = []
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n
      const passt = ok[i] && (!folge.length || (Math.sign(dreh[i]) === Math.sign(dreh[folge[0]]) &&
        dist(ring[i], ring[folge[folge.length - 1]]) <= PLAN_BOGEN_KANTE_M))
      if (passt) folge.push(i)
      else { if (folge.length) folgen.push(folge); folge = ok[i] ? [i] : [] }
    }
    if (folge.length) folgen.push(folge)
    for (const f of folgen) {
      if (f.length < PLAN_BOGEN_MIN || Math.abs(f.reduce((s_, i) => s_ + dreh[i], 0)) < PLAN_BOGEN_SUMME_GRAD) continue
      const pts = f.map(i => ring[i])
      const q0 = pts[0], q1 = pts[pts.length - 1]
      const t0 = einheit(sub(pts[1], q0)), t1 = einheit(sub(q1, pts[pts.length - 2]))
      if (!((anStrasse(q0, t0, dEigen, halbEigen + PLAN_BOGEN_SEITE_M) && anStrasse(q1, t1, dArm, halbArm + PLAN_BOGEN_SEITE_M)) ||
        (anStrasse(q0, t0, dArm, halbArm + PLAN_BOGEN_SEITE_M) && anStrasse(q1, t1, dEigen, halbEigen + PLAN_BOGEN_SEITE_M)))) continue
      const k = kreisAnpassen(pts)
      if (!k || k[1] > 60 || kreisResiduum(k, pts) > BOGEN_RES_MAX) continue
      const dj = Math.min(...pts.map(q => dist(q, j)))
      if (best === null || dj < best[3]) best = [k[1], k[0], pts, dj]
    }
  }
  if (best === null) return null
  let b = segmentieren(best[2], 0.25)
  if (dist(b[0], bogen[0]) > dist(b[b.length - 1], bogen[0])) b = [...b].reverse()
  return [best[0], best[1], b]
}

/** eckradius_av: Radius der inneren Bordkante an der Knotenecke aus der AV -> [radius, grund, mitte, bogenpunkte, eckstück] */
export function eckradiusAv(fahrbahn: Fahrbahn, j: P, dEigen: P, dArm: P, inseln: Inseln | null = null): Eck {
  const schl = `${j[0].toFixed(1)},${j[1].toFixed(1)},${richtungGrad(dEigen)},${richtungGrad(dArm)},${inseln !== null}`
  const c = eckCache.get(schl)
  if (c) return c
  const L = 25.0
  const mitte = dist(dEigen, neg(dArm)) > 1e-6 ? einheit(add(dEigen, dArm)) : rechts(dEigen)
  const keil: P[] = [j, add(j, dEigen, L), add(j, mitte, L * 1.4), add(j, dArm, L)]
  const teile = fahrbahn.polys.filter(g => !(g.env[2] < j[0] - L || g.env[0] > j[0] + L || g.env[3] < j[1] - L || g.env[1] > j[1] + L))
  let erg: Eck = [null, 'keine Fahrbahn', null, null, null]
  if (teile.length) {
    const u = vereinigung(...teile.map(t => [t.poly] as Multi))
    let stuecke: P[][] = []
    for (const poly of u) for (const ring of poly) {
      if (ring.length < 3) continue
      stuecke.push(...linieImPolygon([...ring, ring[0]], [keil], true))
    }
    stuecke = stuecke.map(s => segmentieren(s, 0.25))
    if (inseln !== null) stuecke = stuecke.flatMap(s => inseln.ohneInselrand(s, j, L * 1.5))
    stuecke = stuecke.filter(s => s.length >= 2 && linienLaenge(s) >= 3)
    erg = [null, 'kein Fahrbahnrand in der Ecke', null, null, null]
    if (stuecke.length) {
      const pts = stuecke.reduce((b, s) => (abstandLinie(j, s) < abstandLinie(j, b) ? s : b))
      const richtung = (i: number) => {
        const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)]
        return Math.atan2(b[1] - a[1], b[0] - a[0])
      }
      const diff = (a: number, b: number) => Math.abs(((a - b + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI)
      const h0 = richtung(2), h1 = richtung(pts.length - 3)
      if (diff(h0, h1) < 20 * RAD) erg = [null, 'Rand ohne Ecke', null, null, null]
      else {
        const bogenI = pts.map((_, i) => i).filter(i => diff(richtung(i), h0) > 4 * RAD && diff(richtung(i), h1) > 4 * RAD)
        let bogen = bogenI.map(i => pts[i])
        if (bogen.length < 4) {
          const ecke = pts.reduce((b, p) => (dist(p, j) < dist(b, j) ? p : b))
          erg = [0, 'eckig', ecke, null, null]
        } else {
          let k = kreisAnpassen(bogen)
          const teilL: number[][] = []
          for (const i of bogenI) {
            if (teilL.length && i === teilL[teilL.length - 1][teilL[teilL.length - 1].length - 1] + 1) teilL[teilL.length - 1].push(i)
            else teilL.push([i])
          }
          let eckstueck: [number, number, number, P, P[]] | null = null
          if (k && teilL.length > 1 && kreisResiduum(k, bogen) > BOGEN_RES_MAX) {
            const ecken = teilL.filter(t => t.length >= 4 && diff(richtung(t[0]), richtung(t[t.length - 1])) >= 0.5 * diff(h0, h1))
            if (ecken.length) {
              const t = ecken.reduce((b, x) => (Math.min(...x.map(i => dist(pts[i], j))) < Math.min(...b.map(i => dist(pts[i], j))) ? x : b))
              const b2 = t.map(i => pts[i])
              const k2 = kreisAnpassen(b2)
              if (k2 && k2[1] <= 60 && kreisResiduum(k2, b2) <= BOGEN_RES_MAX) { k = k2; bogen = b2 }
            }
          } else if (k && teilL.length === 1 && BOGEN_EINTEILIG && kreisResiduum(k, bogen) > BOGEN_RES_MAX) {
            const n_ = bogenI.length
            let i0 = 0
            for (let x = 1; x < n_; x++) if (dist(pts[bogenI[x]], j) < dist(pts[bogenI[i0]], j)) i0 = x
            let a_ = Math.max(0, Math.min(i0 - 2, n_ - 5)), b_ = Math.min(n_ - 1, Math.max(i0 + 2, 4))
            const fit = (a2: number, b2: number): [number, [P, number], P[], number, number] | null => {
              const pp = bogenI.slice(a2, b2 + 1).map(i => pts[i])
              const kk = kreisAnpassen(pp)
              return kk ? [kreisResiduum(kk, pp), kk, pp, a2, b2] : null
            }
            let f_ = fit(a_, b_)
            if (f_ && f_[0] <= BOGEN_RES_MAX) {
              for (;;) {
                const kand = [a_ > 0 ? fit(a_ - 1, b_) : null, b_ < n_ - 1 ? fit(a_, b_ + 1) : null]
                  .filter((x): x is NonNullable<typeof x> => !!x && x[0] <= BOGEN_RES_MAX)
                if (!kand.length) break
                f_ = kand.reduce((b, x) => (x[0] < b[0] ? x : b))
                a_ = f_[3]; b_ = f_[4]
              }
              const gerade = (x: number, y: number) => diff(richtung(bogenI[x]), richtung(bogenI[y])) < ECK_GERADE_GRAD * RAD
              while (b_ - a_ >= 4 && gerade(b_, b_ - 2)) b_--
              while (b_ - a_ >= 4 && gerade(a_, a_ + 2)) a_++
              f_ = fit(a_, b_)
              if (f_ && f_[0] <= BOGEN_RES_MAX && ECK_MIN_M <= f_[1][1] && f_[1][1] < k[1] && f_[1][1] <= 60 &&
                diff(richtung(bogenI[a_]), richtung(bogenI[b_])) >= 0.5 * diff(h0, h1)) {
                eckstueck = [k[1], kreisResiduum(k, bogen), f_[1][1], k[0], bogen]
                k = f_[1]; bogen = f_[2]
              }
            }
          }
          erg = k && k[1] <= 60 ? [k[1], 'AV', k[0], bogen, eckstueck] : [null, 'Bogen nicht kreisförmig', null, null, null]
        }
      }
    }
  }
  eckCache.set(schl, erg)
  return erg
}

// ---------------------------------------------------------------- Abbiegezufahrt
export interface AbbiegeKontext {
  vonHand?: VonHand
  /** amtliches Tempo (pruefen.Kontext.tempoAmtlich) */
  tempoAmtlich?: TempoAmtlich | null
  hindernisse?: HindernisDaten | null
  brueckenumriss?: { enthaelt(p: P): boolean } | null
  flaechenR2?: Flaechen | null
  netz: OsmNetz; fahrbahn: Fahrbahn; inseln: Inseln; kreisel: Kreisel
  s: Streifen; zf: Zufahrt; su: Suche; kbe: Knotenbereich | null; d: P; h: number; hAlt: number
  hatGerade: boolean; geradeEntfaellt: boolean
  geradeGestrichen?: boolean     // gerade Zufahrt von Hand gestrichen: deckt die Abbiegenden nicht (wie ohne gerade Zufahrt)
  swAlt: number; swEigen: number; tempo: number; swQuelle: string
  fs: Fs | null; lageAb: number; vomRandAb: number; versatz: number; arS: number; alS: number; rd: P; art: string
  verschiebung: P; refDa: boolean
  streifenPoly: Multi
  sichtfeld: (pts: P[]) => Multi
  konflikte: (feld: Multi, pts: P[]) => ZufahrtErgebnis['konflikte']
  basisErgebnis: () => Pick<ZufahrtErgebnis, 'randQuelle' | 'netzQuelle'>
  /** Querung ohne Vortritt (Bedarfsmodul E1): Soll nach VSS 40 240 Z. 8.2 statt Tab. 1, ohne Kurvenregel (ohneVortritt.ts) */
  ov?: OhneVortritt
  /** Ortslage der Querung ausserorts (pruefen.ortslageSicht; 30.10.2026): Tab. 1 bei 60 km/h 100 m statt 75 m */
  ausserorts?: boolean
}

const ringKnoten = (netz: OsmNetz, nid: number) => (netz.an.get(nid) ?? []).some(([w]) => netz.w(w).ring)

/** Hofzufahrt: Arm über diese Wege (bzw. ausserhalb der Strassen HW_ALLE) nur ab der Einmündung, nach der bfu-Knotenregel */
export const HOF_HW = ['service', 'pedestrian']
/** Eine Abbiegezufahrt (Arm a) -> Ergebnis oder Entfallen */
export function abbiegeZufahrt(k: AbbiegeKontext, a: ArmInfo): ZufahrtErgebnis | Entfallen {
  const { netz, fahrbahn, inseln, kreisel, s, zf, su, kbe, d, h, hAlt } = k
  const fid = s.fgsId
  const hatG = k.hatGerade && !k.geradeGestrichen
  const grad = richtungGrad(a.fahrt)
  const weg = (grund: string, quelle = '') =>
    entfallen(fid, 'abbiegend', grad, `a${grad}`, grund, quelle, a.wid, a.knoten, kennungArm(a))
  if (a.rolle !== 'abbiegend') return weg(a.rolle, a.grund)
  const annahmen: string[] = []
  const dj = a.dj, j = a.j, aus = a.aus
  const bisKnoten = Math.max(0, dj - h)
  const szRoh = netz.spurZumKnoten(su, kbe, a)
  const wegA = glaetten(szRoh.map(p => add(p, k.verschiebung)), GLAETTUNG_M)
  const dK = richtungAmKnoten(wegA, dj)
  const [arm, hinB, hinBM] = netz.armSpur(a, Math.max((k.ov ? weiteQuerung(k.ov, SICHTWEITE[60]) : k.ausserorts ? SICHTWEITE_AUSSERORTS_60 : SICHTWEITE[60]) + h + 15,
    ARM_MESSUNG[ARM_MESSUNG.length - 1] + 2))
  const armAb = wegeAbschnitte(netz, arm), eigAb = wegeAbschnitte(netz, szRoh)
  const mitBruecke = [...armAb, ...eigAb].some(([, , w]) => w !== null && netz.w(w).hoch)
  // R2 für Abbiegende: Streifenmitte auf übriger befestigter Fläche ohne AV-Strasse -> die Fläche gilt als Fahrbahn
  const flR2 = k.flaechenR2 ?? null
  const r2Ab = !!flR2 && !fahrbahn.enthaelt(s.m) && R2_FLAECHEN.includes(flR2.art(s.m) ?? '')
  const fbAb = { enthaelt: (q: P) => fahrbahn.enthaelt(q) || (r2Ab && R2_FLAECHEN.includes(flR2!.art(q) ?? '')) }
  // Sichtpunkt auf einer Brücke: Weg über dem Boden unter q (Arm bzw. eigene Strasse bis 12 m daneben, im AV-Brückenumriss)
  const bu = k.brueckenumriss ?? null
  const aufBruecke = (q: P): number | null => {
    if (!mitBruecke || (bu && !bu.enthaelt(q))) return null
    const kand = ([[naechsterAufSpur(q, arm), armAb], [naechsterAufSpur(q, wegA), eigAb]] as const)
      .filter(([x]) => x !== null && x[0] <= BRUECKE_SEITE_M)
    if (!kand.length) return null
    const [x, ab_] = kand.reduce((b_, c_) => (c_[0]![0] < b_[0]![0] ? c_ : b_))
    return hochBei(netz, ab_ as [number, number, number | null][], x![1])
  }
  const aufFb = (q: P) => fbAb.enthaelt(q) || aufBruecke(q) !== null
  const lbMax = hinB ? Math.max(0, (hinBM ?? 0) - 3.0) : Infinity
  // Tempo der Querstrasse (OSM-maxspeed entlang des Arms)
  let [tempoB, tempoQB] = tempoStart(netz, a.wid)
  const [tB, trefferB] = tempoEntlang(netz, arm, tempoB, 0)
  tempoB = tB
  if (trefferB) tempoQB = 'OSM maxspeed'
  // amtliches Tempo der Querstrasse (Eingabe, z. B. V_sig) vor OSM; Hand geht vor
  const amtlB = amtlichEntlang(k.tempoAmtlich, arm, tempoB, 0)
  if (amtlB) {
    if (amtlB[0] !== tempoB && tempoQB !== 'Ersatz') annahmen.push(`Tempo Querstrasse ${amtlB[0]} km/h laut ${amtlB[1]} (OSM: ${tempoB} km/h)`)
    ;[tempoB, tempoQB] = amtlB
  }
  const tempoHandB = k.vonHand?.tempo?.(fid, 'abbiegend', grad) ?? k.vonHand?.tempoKennung?.(fid, kennungArm(a)) ?? null
  if (tempoHandB) { tempoB = tempoHandB; tempoQB = 'Korrektur' }
  if (tempoQB === 'Ersatz') annahmen.push(`Tempo Querstrasse ${tempoB} km/h angenommen (in OSM keine Höchstgeschwindigkeit erfasst)`)
  const swTab1B = k.ov ? sollQuerung(k.ov, tempoB) : sichtweiteTab1(tempoB, !!k.ausserorts)
  // Fahrbahn der Querstrasse 8–30 m ab Knoten
  const messRef = refAuf(arm, ARM_MESSUNG, 0)
  const fsoB = fahrstreifenArm(netz, a, a.dreh > 0)
  const messHoch = ARM_MESSUNG.slice(0, messRef.length).map(l => hochBei(netz, armAb, l))
  const messIdx = messRef.map((_, i) => i).filter(i => !messHoch[i])
  const messFb = messIdx.map(i => messRef[i])
  const abzugHandB = k.vonHand?.abzug?.(fid, 'abbiegend', grad) ?? null
  const abzugB = abzugHandB ? () => abzugHandB : abzugAusOsm(netz, punkteAufSpur(arm, ARM_MESSUNG))
  const park = k.hindernisse?.park ?? null, parkAlle = k.hindernisse?.parkAlle ?? null
  let fsB: Fs | null = fahrstreifenmitte(messFb, 'beide', fahrbahn, abzugB, 99.0, fsoB, messIdx, !!abzugHandB, park)
  let armOsm: number | null = null
  if (messHoch.some(x => x) && (fsB === null || 2 * messHoch.filter(x => x).length >= messHoch.length)) {
    armOsm = messHoch.find(x => x)!
    fsB = fahrbahnOsm(netz, armOsm)
  }
  if (fsB && fsB.breite < ARM_MIN_BREITE) return weg('arm_schmal', `Fahrbahn ${fsB.breite.toFixed(1)} m`)
  if (a.hw === 'service') {
    const auf = messRef.filter(([q], i) => fahrbahn.enthaelt(q) || !!messHoch[i]).length
    if (fsB === null || auf < ARM_AUF_FAHRBAHN * ARM_MESSUNG.length)
      return weg('arm_ohne_fahrbahn', `${auf} von ${ARM_MESSUNG.length} Messpunkten auf der Fahrbahn`)
  }
  if (fsB && !(LAGE_GRENZEN[0] <= fsB.lagePlausi && fsB.lagePlausi <= LAGE_GRENZEN[1])) fsB = null
  let fsDvB = fahrstreifenUebernehmen(fsB)
  let anteilB = 0.5
  if (fsDvB !== null) anteilB = fsoB!.zweirichtig && fsoB!.gesamt === 1 ? 1.0 : fsoB!.n / fsoB!.gesamt
  let lageB = fsB ? fsB.lage : LAGE_ERSATZ
  if (!fsB) annahmen.push(`Fahrbahn der Querstrasse in der AV nicht gemessen: Fahrlinie ${f2(LAGE_ERSATZ)} m rechts der OSM-Linie angenommen`)
  let querA = k.versatz + k.lageAb
  let vomRandAb = k.vomRandAb

  type Gr = [P, P, P, P, number, P, number, number]   // pa1, dA, kb0, dB, kreuz, K, la_pa1, lb_kb0
  const geraden = (la: number, lb: number): Gr | null => {
    const pa = refAuf(wegA, [Math.max(0, la - 3), Math.max(la, 3)], querA)
    const kb = refAuf(arm, [lb, lb + 3], lageB)
    if (pa.length < 2 || kb.length < 2 || dist(pa[0][0], pa[1][0]) < 0.5) return null
    const pa1 = pa[1][0]
    const dA = einheit(sub(pa[0][0], pa1))
    const kb0 = kb[0][0]
    const dB = einheit(sub(kb0, kb[1][0]))
    const kr = dB[0] * dA[1] - dB[1] * dA[0]
    if (Math.abs(kr) < PARALLEL_MIN) return null
    const t = ((kb0[0] - pa1[0]) * dB[1] - (kb0[1] - pa1[1]) * dB[0]) / (dA[0] * dB[1] - dA[1] * dB[0])
    return [pa1, dA, kb0, dB, kr, add(pa1, dA, t), Math.max(la, 3), lb]
  }
  let gr = geraden(dj, 0)
  if (gr === null) {
    const lA = streckeLaenge(wegA)
    return weg('geometrie', lA < Math.max(dj, 3) ? `Spur zum Knoten zu kurz (${lA.toFixed(1)} m, Knoten nach ${dj.toFixed(1)} m)` :
      'Fahrstreifen fast parallel')
  }
  let ablenkung = Math.acos(Math.max(-1, Math.min(1, dot(gr[3], gr[1]))))
  const linksAb = gr[4] > 0
  // Linksabbieger: Fahrbahn des Arms am Knoten (querschnitt_am_knoten)
  if (linksAb && fsB && LINKS_ARM_AM_KNOTEN && armOsm === null) {
    const fsK = fahrstreifenmitte(querschnittAmKnoten(fahrbahn, messFb), 'beide', fahrbahn, abzugB, 99.0, fsoB, null, !!abzugHandB, park)
    const lageAvB = fsB.lage + (fsDvB ?? 0)
    if (fsK && ((lageAvB > fsK.rechts - RAND_RECHTS_MIN_M && fsB.rechts - fsK.rechts > KNOTEN_QUER_TOL_M) ||
      (KNOTEN_QUER_LINKS && fsB.links - fsK.links > KNOTEN_QUER_TOL_M)) &&
      LAGE_GRENZEN[0] <= fsK.lagePlausi && fsK.lagePlausi <= LAGE_GRENZEN[1] && fsK.breite >= ARM_MIN_BREITE) {
      const fsAlt = fsB, lageAlt = lageB, dvAlt = fsDvB
      const dvK = fahrstreifenUebernehmen(fsK)
      fsB = fsK; lageB = fsK.lage
      fsDvB = dvAlt !== null ? dvK : null
      const grK = geraden(dj, 0)
      if (grK !== null && grK[4] > 0) {
        gr = grK
        ablenkung = Math.acos(Math.max(-1, Math.min(1, dot(gr[3], gr[1]))))
      } else { fsB = fsAlt; lageB = lageAlt; fsDvB = dvAlt }
    }
  }
  // Radius der inneren Bordkante + Abstand der Fahrlinie
  let radiusAv: number | null = null, radiusQuelleB = 'geschätzt (Fahrbahnbreiten)', abstBord: number | null = null
  const knotenHoch = mitBruecke && (hochBei(netz, armAb, 0.5) !== null || hochBei(netz, eigAb, Math.max(0, dj - 0.5)) !== null)
  let eck: Eck
  if (knotenHoch) { eck = [null, 'bruecke', null, null, null]; radiusQuelleB = 'geschätzt (Fahrbahnbreiten, Knoten auf einer Brücke)' }
  else eck = eckradiusAv(fahrbahn, j, dK, aus, linksAb ? null : inseln)
  let [rBord, , eckMitte, bordBogen, eckstueck] = eck
  // Bogen nach Plan-Fläche (planBogen): der gezeichnete bzw. gerundete Bogen statt des Kreisfits über Bogen und Nachbarkante;
  // planBogenR: Radius eines als gezeichnet bzw. gerundet erkannten Plan-Bogens (Schwelle ECK_GROSS_M gilt dafür nicht, unten)
  let planBogenR: number | null = null
  if (fahrbahn.plan.length && bordBogen && rBord !== null) {
    const pb = planBogen(fahrbahn, bordBogen, j, dK, aus, (k.fs ? k.fs.breite : BREITE_ERSATZ) / 2, (fsB ? fsB.breite : BREITE_ERSATZ) / 2)
    if (pb) planBogenR = pb[0]
    if (pb && Math.abs(pb[0] - rBord) > 0.05) { [rBord, eckMitte, bordBogen] = pb; eckstueck = null }
  }
  // Ecke an einer Fläche (Plan) (Quellen- und Annahmetexte): Bogen bzw. bei einer scharfen Ecke der Eckpunkt am Umriss
  const planEcke = (): string | null => {
    if (!fahrbahn.plan.length) return null
    const pl = bordBogen ? fahrbahn.planAnLinie(bordBogen) : rBord === 0 && eckMitte ? fahrbahn.planAnLinie([eckMitte]) : null
    return pl ? planKurzAv(pl.id, pl.art) : null
  }
  const planBogenErkannt = () => planBogenR !== null && rBord !== null && Math.abs(rBord - planBogenR) <= 0.05
  let zielE: [number, number, number] | null = null, zielA: [number, number, number] | null = null
  const armZweirichtig = !(a.ow && netz.zufluss(a.arm))
  let ohneAbstLinks = false
  let abstL = BORD_ABSTAND_M
  if (rBord !== null) {
    const mess0 = refAuf(arm, [ARM_MESSUNG[0]], 0)
    if (linksAb && fsB && mess0.length && k.refDa) {
      const latE = dot(k.rd, aus) > 0 ? k.arS : -k.alS
      const latA = dot(mess0[0][1], dK) > 0 ? fsB.rechts : -fsB.links
      const abstE = Math.abs(k.lageAb - latE), abstA = Math.abs(lageB - latA)
      abstL = Math.max(BORD_ABSTAND_M, (abstE + abstA) / 2)
      zielE = [Math.max(BORD_ABSTAND_M, abstE), querA, vomRandAb]
      zielA = [Math.max(BORD_ABSTAND_M, abstA), lageB, fsB.vomRand]
    } else if (linksAb && armZweirichtig) ohneAbstLinks = true
  }
  if (rBord !== null && !ohneAbstLinks) {
    radiusAv = Math.max(RADIUS_MIN, rBord + abstL)
    abstBord = radiusAv - rBord
    radiusQuelleB = `AV-Bordkante ${f1(rBord)} m + ${f1(abstL)} m`
  } else if (ohneAbstLinks) radiusQuelleB = `geschätzt (AV-Ecke ${f1(rBord!)} m, Abstand links nicht gemessen)`
  const halbA = k.fs ? k.fs.breite / 2 : BREITE_ERSATZ / 2
  // Deckung durch die gerade Zufahrt (SPEC 3.6, GEDECKT_NUR_MIT_GERADE, GEDECKT_BIS_KNOTEN) bei Kurvensichtweite sk: Knoten
  // jenseits beider Sichtweiten bzw. jenseits der Kurvensichtweite mit deckender gerader Zufahrt. Dieselbe Regel für die
  // Radiuswahl an der AV-Ecke (gedecktBei) und für die Zufahrt (unten)
  const geradeDeckt = hatG && (!GEDECKT_BIS_KNOTEN || (!k.geradeEntfaellt && k.swAlt >= Math.min(bisKnoten, k.swEigen)))
  const gedecktBeiSw = (sk: number): boolean =>
    (bisKnoten >= Math.max(sk, k.swEigen) && (geradeDeckt || !GEDECKT_NUR_MIT_GERADE)) || (bisKnoten > sk && geradeDeckt)
  const halbB = fsB ? fsB.breite / 2 : BREITE_ERSATZ / 2
  let radiusB = radiusAv !== null ? radiusAv : Math.max(RADIUS_MIN, (halbA + halbB + 2 * KURVE_ZUSATZ) / 2 / Math.tan(ablenkung / 2))
  const geo: { sprung?: number; sTb?: number; lB?: number; ta?: P; tb?: P; taBogen?: boolean; sTa?: number; tangential?: boolean
    versuchTangential?: boolean; tangRf?: string | null } = {}
  const streifenAbstand = (p: P) => abstandPunkt(k.streifenPoly, p)

  const tangentenbogen = (R: number): [P[], P, P, Gr] | null => {
    let [pa1, dA, kb0, dB, kr, K, laPa1, lbKb0] = gr!
    for (let it = 0; it < 3; it++) {
      const abl = Math.acos(Math.max(-1, Math.min(1, dot(dB, dA))))
      const T = R * Math.tan(abl / 2)
      const Ta = add(K, dA, T), Tb = add(K, dB, -T)
      const laT = laPa1 - dot(sub(Ta, pa1), dA)
      const lbT = lbKb0 + dot(sub(Tb, kb0), neg(dB))
      const g2 = geraden(Math.max(0, laT), Math.min(Math.max(0, lbT), lbMax))
      if (g2 === null) break
      ;[pa1, dA, kb0, dB, kr, K, laPa1, lbKb0] = g2
    }
    if ((kr > 0) !== linksAb) return null
    const abl = Math.acos(Math.max(-1, Math.min(1, dot(dB, dA))))
    const T = R * Math.tan(abl / 2)
    const Ta = add(K, dA, T), Tb = add(K, dB, -T)
    const n: P = linksAb ? [-dB[1], dB[0]] : [dB[1], -dB[0]]
    const Cc = add(Tb, n, R)
    const w0 = Math.atan2(Tb[1] - Cc[1], Tb[0] - Cc[0])
    const sgn = linksAb ? 1 : -1
    const m_ = Math.max(4, Math.ceil(abl * R / 0.5))
    const bogen: P[] = []
    for (let i = 0; i <= m_; i++) bogen.push([Cc[0] + R * Math.cos(w0 + sgn * abl * i / m_), Cc[1] + R * Math.sin(w0 + sgn * abl * i / m_)])
    return [bogen, Ta, Tb, [pa1, dA, kb0, dB, kr, K, laPa1, lbKb0]]
  }

  const innenFrei = (bogen: P[]): number => {
    let best = LINKS_INNEN_MIN_M
    for (let i = 1; i < bogen.length - 1; i++) {
      if (dot(sub(bogen[i], s.m), neg(d)) <= 0) continue
      const t = einheit(sub(bogen[i + 1], bogen[i - 1]))
      const n_: P = linksAb ? [-t[1], t[0]] : [t[1], -t[0]]
      for (let x = 0.25; x <= best + 1e-9; x += 0.25) {
        if (!aufFb(add(bogen[i], n_, x))) { best = x - 0.25; break }
      }
    }
    return best
  }

  type Linie = [P[], null, P[]]
  const kreisEcke = (): [P, P, number, number, number] => {
    const zurMitte = (v: P): P => (linksAb ? [-v[1], v[0]] : [v[1], -v[0]])
    const Tb = add(eckMitte!, zurMitte(gr![3]), -radiusAv!)
    const Ta = add(eckMitte!, zurMitte(gr![1]), -radiusAv!)
    const w0 = Math.atan2(Tb[1] - eckMitte![1], Tb[0] - eckMitte![0])
    const w1 = Math.atan2(Ta[1] - eckMitte![1], Ta[0] - eckMitte![0])
    const sgn = linksAb ? 1 : -1
    return [Tb, Ta, w0, sgn, ((sgn * (w1 - w0)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)]
  }
  const bordCache = new Map<string, [P[], P, P] | null>()
  const bordKante = (): [P[], P, P] | null => {
    if (!bordCache.has('kante')) {
      let kante: [P[], P, P] | null = null
      if (bordBogen && bordBogen.length >= 4) {
        const [, Ta, w0, sgn, abl] = kreisEcke()
        let versetzt: P[] = bordBogen.map((p, i) => {
          const a_ = bordBogen![Math.max(0, i - 1)], b_ = bordBogen![Math.min(bordBogen!.length - 1, i + 1)]
          const t_ = einheit(sub(b_, a_))
          let nrm: P = [-t_[1], t_[0]]
          if (!fahrbahn.enthaelt(add(p, nrm, 0.5))) nrm = [-nrm[0], -nrm[1]]
          return add(p, nrm, abstBord!)
        })
        if (dist(versetzt[0], Ta) < dist(versetzt[versetzt.length - 1], Ta)) versetzt = versetzt.reverse()
        const stetig = stetigDrehend(versetzt, eckMitte!, w0, sgn, abl, BOGEN_WINKEL_TOL * RAD)
        if (stetig.length >= 4) kante = [stetig, stetig[0], stetig[stetig.length - 1]]
      }
      bordCache.set('kante', kante)
    }
    return bordCache.get('kante')!
  }

  const linieKonzentrisch = (gesamtB: number, abstB: number[], mitBord = true, tangentialOk = true): Linie | null => {
    const R = radiusAv!
    geo.versuchTangential = false; geo.tangRf = null
    let [Tb, Ta, w0, sgn, abl] = kreisEcke()
    if (abl > 175 * RAD) return null
    const m_ = Math.max(4, Math.ceil(abl * R / 0.5))
    let bogen: P[] = []
    for (let i = 0; i <= m_; i++) bogen.push(add(eckMitte!, [Math.cos(w0 + sgn * abl * i / m_), Math.sin(w0 + sgn * abl * i / m_)], R))
    const kante = mitBord ? bordKante() : null
    if (kante) [bogen, Tb, Ta] = kante
    let tangential = false
    if (LINKS_TANGENTIAL && tangentialOk && linksAb && zielA !== null && zielE !== null) {
      const tb_ = tangentenbogen(R)
      if (tb_ !== null) {
        const frei = innenFrei(tb_[0])
        if (frei < LINKS_INNEN_MIN_M) geo.tangRf = `Tangentenbogen ${f2(frei)} m an der inneren Ecke`
        else { bogen = tb_[0]; Ta = tb_[1]; Tb = tb_[2]; tangential = geo.versuchTangential = true }
      }
    }
    const lageAuf = (spur: P[], p_: P, schaetz: number): [number, number] | null => {
      let best: [number, number, [P, P]] | null = null
      for (let i = -10; i <= 10; i++) {
        const l_ = Math.max(0, schaetz + i * 0.5)
        const q_ = refAuf(spur, [l_], 0)
        if (q_.length) {
          const dd = dist(q_[0][0], p_)
          if (best === null || dd < best[0]) best = [dd, l_, q_[0]]
        }
      }
      if (best === null) return null
      const [, l_, [q_, r_]] = best
      return [l_, dot(sub(p_, q_), r_)]
    }
    const laTa = lageAuf(wegA, Ta, dot(sub(Ta, s.m), neg(d)))
    const lbTb = lageAuf(arm, Tb, dot(sub(Tb, j), aus))
    if (laTa === null || lbTb === null) return null
    const [La, qA] = laTa, [Lb, qB] = lbTb
    const nebenBord = (spur: P[], lagen: number[], innenRechts: boolean, qEnd: number, lEnd: number,
      ziel0: [number, number, number] | null): P[] => {
      const ziel = innenRechts ? null : ziel0
      const virtuell = lagen.every(l_ => Math.abs(l_ - lEnd) > 1e-6)
      const lagenV = virtuell ? [...lagen, lEnd].sort((x, y) => x - y) : lagen
      const roh: [P, P, number, number, number][] = []
      refAuf(spur, lagenV, 0).forEach(([q_, r_], i) => {
        const l_ = lagenV[i]
        const w = Math.min(1, Math.abs(l_ - lEnd) / ABST_UEBERGANG_M)
        let abstK = abstBord!, ersatz = qEnd
        if (ziel) { abstK = abstBord! + (ziel[0] - abstBord!) * w; ersatz = qEnd + (ziel[1] - qEnd) * w }
        const hochL = mitBruecke && hochBei(netz, spur === arm ? armAb : eigAb, l_) !== null
        if (hochL && spur === arm && armOsm !== null) ersatz = qEnd + (lageB - qEnd) * w
        const sh = hochL ? null : fahrbahn.sehne(q_, r_)
        let lat: number | null = null
        if (sh) {
          lat = innenRechts ? sh[0] - abstK : -(sh[1] - abstK)
          if (ziel) lat = Math.min(lat, sh[0] - ziel[2])
          if (Math.abs(lat - ersatz) > 4.0) lat = null
        }
        roh.push([q_, r_, l_, w, lat === null ? ersatz : lat])
      })
      const med = roh.map((_, i) => {
        const f = roh.slice(Math.max(0, i - 2), i + 3).map(x => x[4]).sort((x, y) => x - y)
        return f[Math.floor(f.length / 2)]
      })
      let kEnd = 0
      roh.forEach((x, i) => { if (Math.abs(x[2] - lEnd) < Math.abs(roh[kEnd][2] - lEnd)) kEnd = i })
      const delta = roh.length ? qEnd - med[kEnd] : 0
      return roh.filter((_, i) => !(virtuell && i === kEnd)).map((x) => {
        const i = roh.indexOf(x)
        return add(x[0], x[1], med[i] + delta * (1 - x[3]))
      })
    }
    const messArm = refAuf(arm, [Lb], 0)
    const innenRArm = messArm.length > 0 && dot(messArm[0][1], dK) > 0
    const lagenArm: number[] = []
    for (let i = 1; i <= Math.floor(gesamtB + 40); i++) lagenArm.push(Lb + i)
    const eingang = nebenBord(arm, lagenArm, innenRArm, qB, Lb, zielA)
    const bogenR = [...bogen].reverse()
    const lageEigen = (p_: P) => dot(sub(p_, s.m), neg(d))
    let vorArm: P[], sprung: number, ausgang: P[] = []
    if (La > 0) {
      const messW = refAuf(wegA, [0], 0)
      const innenRW = messW.length > 0 && dot(messW[0][1], aus) > 0
      const lagenA: number[] = []
      for (let i = 0; i <= Math.floor(La); i++) lagenA.push(i)
      lagenA.push(La)
      ausgang = tangential ? uebergang(wegA, lagenA, querA, qA, La) : nebenBord(wegA, lagenA, innenRW, qA, La, zielE)
      vorArm = [...ausgang, ...bogenR]
      sprung = dist(Ta, uebergang(wegA, [La], 0, qA, La)[0])
    } else {
      const hinter = bogenR.filter(p_ => lageEigen(p_) <= 0)
      const vorne = bogenR.filter(p_ => lageEigen(p_) > 0)
      if (!vorne.length) return null
      let start = vorne[0]
      if (hinter.length) {
        const a_ = hinter[hinter.length - 1], b_ = vorne[0]
        const fa = lageEigen(a_), fb = lageEigen(b_)
        const t_ = fb !== fa ? -fa / (fb - fa) : 0
        start = [a_[0] + t_ * (b_[0] - a_[0]), a_[1] + t_ * (b_[1] - a_[1])]
      }
      if (tangential) {
        const q0 = refAuf(wegA, [0], querA)
        const off = q0.length ? dot(sub(start, q0[0][0]), q0[0][1]) : 0
        const grenze = k.art === 'beide' ? (k.arS - k.alS) / 2 : -k.alS + LINKS_DER_MITTE_TOL
        if (k.lageAb + off < grenze - (k.art === 'beide' ? LINKS_DER_MITTE_TOL : 0)) {
          const lk = linieKonzentrisch(gesamtB, abstB, mitBord, false)
          geo.tangRf = `Streifen im Tangentenbogen, Bogen am Streifen ${f2(-off)} m links der Fahrstreifenmitte`
          return lk
        }
      }
      vorArm = [start, ...vorne]
      sprung = dist(start, vorne[0])
    }
    sprung = Math.max(sprung, dist(Tb, uebergang(arm, [Lb], 0, qB, Lb)[0]))
    Object.assign(geo, { sprung, sTb: streckeLaenge(vorArm), lB: Lb, ta: Ta, tb: Tb, taBogen: La <= 0,
      sTa: La > 0 ? streckeLaenge(ausgang) : 0, tangential })
    let fahrlinie = [...vorArm, ...eingang]
    fahrlinie = fahrlinie.filter((p_, i) => i === 0 || dist(p_, fahrlinie[i - 1]) > 0.01)
    const sp = punkteAufSpur(fahrlinie, abstB).map(x => x[0])
    if (sp.length < 2) return null
    return [sp, null, fahrlinie]
  }

  let mitBord = true
  const linieB = (swB: number, gesamtB: number, R: number): Linie | null => {
    const abstB: number[] = []
    for (let i = 0; i <= Math.floor(swB / SCHRITT); i++) abstB.push(h + i * SCHRITT)
    abstB.push(gesamtB)
    if (radiusAv !== null && eckMitte !== null) {
      let lk = linieKonzentrisch(gesamtB, abstB, mitBord)
      if (geo.versuchTangential && (lk === null || streifenAbstand(lk[0][0]) > STREIFEN_TOL_M ||
        lk[0].filter(aufFb).length < FAHRLINIE_AUF_FAHRBAHN * lk[0].length)) {
        lk = linieKonzentrisch(gesamtB, abstB, mitBord, false)
        geo.tangRf = 'Tangentenbogen passt nicht zwischen Streifen und Arm bzw. liegt neben der Fahrbahn'
      }
      return lk
    }
    const tb_ = tangentenbogen(R)
    if (tb_ === null) return null
    let [bogen, Ta, Tb, [pa1, dA, kb0, dB, , , laPa1, lbKb0]] = tb_
    bogen = [...bogen].reverse()
    const abStreifen = (p_: P) => laPa1 - dot(sub(p_, pa1), dA)
    const La = abStreifen(Ta)
    const start = refAuf(wegA, [0], querA)
    if (!start.length) return null
    let teilA: P[]
    let LA_ = La, qTa = querA
    if (La > 0) {
      const pj = projektion(wegA, Ta, La)
      if (pj) [LA_, qTa] = pj
      const lagen: number[] = []
      for (let i = 0; i <= Math.floor(LA_); i++) lagen.push(i)
      lagen.push(LA_)
      teilA = uebergang(wegA, lagen, querA, qTa, LA_)
    } else {
      const vor = bogen.filter(p_ => abStreifen(p_) <= 0)
      bogen = bogen.filter(p_ => abStreifen(p_) > 0)
      if (vor.length && bogen.length) {
        const a_ = vor[vor.length - 1], b_ = bogen[0]
        const fa = abStreifen(a_), fb = abStreifen(b_)
        const t_ = fb !== fa ? -fa / (fb - fa) : 0
        teilA = [[a_[0] + t_ * (b_[0] - a_[0]), a_[1] + t_ * (b_[1] - a_[1])]]
      } else teilA = [start[0][0]]
    }
    const Lb = lbKb0 + dot(sub(Tb, kb0), neg(dB))
    const langB = gesamtB + 5
    let LB_ = Lb, qTb = lageB
    const pjB = projektion(arm, Tb, Math.max(0, Lb))
    if (pjB) [LB_, qTb] = pjB
    const lagenB: number[] = []
    for (let i = 1; i <= Math.floor(langB); i++) lagenB.push(LB_ + i)
    const teilB = uebergang(arm, lagenB, lageB, qTb, LB_)
    const roh = [...teilA, ...bogen, ...teilB]
    let sprung = teilB.length ? dist(Tb, uebergang(arm, [LB_], lageB, qTb, LB_)[0]) : 0
    if (La > 0) sprung = Math.max(sprung, dist(Ta, uebergang(wegA, [LA_], querA, qTa, LA_)[0]))
    else if (teilA.length) sprung = Math.max(sprung, dist(teilA[teilA.length - 1], bogen.length ? bogen[0] : Tb))
    Object.assign(geo, { sprung, sTb: streckeLaenge([...teilA, ...bogen]), lB: LB_, ta: Ta, tb: Tb, taBogen: La <= 0,
      sTa: streckeLaenge(teilA), tangential: true })
    const fahrlinie = roh.filter((p_, i) => i === 0 || dist(p_, roh[i - 1]) > 0.01)
    const sp = punkteAufSpur(fahrlinie, abstB).map(x => x[0])
    if (sp.length < 2) return null
    return [sp, null, fahrlinie]
  }

  const bogenEndeArm = (mb: boolean): P => { const kt = mb ? bordKante() : null; return kt ? kt[1] : kreisEcke()[0] }
  const probeOk = (mb: boolean): boolean => {
    const ab: number[] = []
    for (let i = 0; i <= Math.floor(30 / SCHRITT); i++) ab.push(h + i * SCHRITT)
    const probe = linieKonzentrisch(30 + h, ab, mb, false)
    return !!probe && streifenAbstand(probe[0][0]) <= STREIFEN_TOL_M &&
      probe[0].filter(aufFb).length >= FAHRLINIE_AUF_FAHRBAHN * probe[0].length
  }
  const bogenImArm = (mb: boolean): string => {
    const tb = bogenEndeArm(mb)
    if (abstandSpur(tb, arm) <= halbB + BOGEN_ARM_TOL || wdiff(sub(tb, j), aus) <= BOGEN_ARM_WINKEL) return 'achse'
    const kante = mb ? bordKante() : null
    if (!kante) return ''
    const na = naechsterAufSpur(tb, arm)!
    const q_ = na[2], u_ = na[3]
    const r_ = rechts(u_)
    const sh = fahrbahn.sehne(tb, r_)
    const lat = dot(sub(q_, tb), r_)
    const K_ = gr![5]
    const vk = sub(tb, K_)
    if (sh !== null && -sh[1] - 0.25 <= lat && lat <= sh[0] + 0.25 && Math.abs(lat) < SEHNE_HALB - 0.5 &&
      fahrbahn.enthaelt(tb) && dot(vk, aus) > 0 && wdiff(vk, aus) <= BOGEN_K_WINKEL &&
      Math.abs(Math.abs(kanteDrehung(kante[0])) - ablenkung * 180 / Math.PI) <= BOGEN_DREH_TOL) return 'fahrbahn'
    return ''
  }
  const seiteOk = (tb: P): boolean => {
    if (linksAb && !armZweirichtig) return true
    const u_ = naechsterAufSpur(tb, arm)![3]
    const rr = rechts(neg(u_))
    const sh = fahrbahn.sehne(tb, rr)
    const pj = projektion(arm, tb)
    if (!linksAb) {
      if (sh !== null && sh[0] < SEHNE_HALB - 0.5)
        return sh[0] <= abstBord! + SEITE_RECHTS_TOL && !inseln.enthaelt(add(tb, rr, sh[0] + INSELRAND_M))
      return !(fsB && pj) || fsB.rechts - pj[1] <= abstBord! + SEITE_RECHTS_TOL
    }
    const breite = fsB ? fsB.breite : BREITE_ERSATZ
    if (sh !== null && Math.max(...sh) < SEHNE_HALB - 0.5 && ZWEISPURIG_MIN_M <= sh[0] + sh[1] && sh[0] + sh[1] <= breite + 3.0) {
      const gegen = anteilB === 0.5 ? Math.min(breite, sh[0] + sh[1]) / 2 : Math.min(breite, sh[0] + sh[1]) * (1 - anteilB)
      return sh[1] >= gegen - LINKS_DER_MITTE_TOL
    }
    const mitte = fsB ? (anteilB === 0.5 ? (fsB.rechts - fsB.links) / 2 : fsB.rechts - (fsB.rechts + fsB.links) * anteilB) : 0
    return pj === null || pj[1] >= mitte - SEITE_ACHSE_TOL
  }
  const eckePruefen = (): [string, boolean, boolean] => {
    let regel = '', gegen = false, mb = true
    if (bordKante() && probeOk(true)) {
      regel = bogenImArm(true)
      if (regel === 'fahrbahn' && !seiteOk(bogenEndeArm(true))) { regel = ''; gegen = true }
    }
    if (regel) mb = true
    else if (bordBogen) {
      const tb0 = bogenEndeArm(false), K_ = gr![5]
      if (bogenImArm(false) && fahrbahn.enthaelt(tb0) && dot(sub(tb0, K_), aus) > 0 && probeOk(false)) {
        if (seiteOk(tb0)) { mb = false; regel = 'kreis'; gegen = false }
        else gegen = true
      }
    } else if (probeOk(false)) {
      mb = false; regel = bogenImArm(false)
      if (regel && !seiteOk(bogenEndeArm(false))) { regel = ''; gegen = true }
    }
    return [regel, gegen, mb]
  }
  const setzeEcke = (rb: number, mitte: P | null, bb: P[] | null) => {
    rBord = rb; eckMitte = mitte; bordBogen = bb
    radiusAv = radiusB = Math.max(RADIUS_MIN, rBord + abstL)
    abstBord = radiusAv - rBord
    bordCache.clear()
  }
  let bogenRegel = '', gegenseite = false
  if (radiusAv !== null && eckMitte !== null) {
    if (eckstueck !== null && ECK_NUR_PLAUSIBEL) {
      const eckVar: [number, P | null, P[] | null] = [rBord!, eckMitte, bordBogen]
      setzeEcke(eckstueck[0], eckstueck[3], eckstueck[4])
      const ganz = eckePruefen()
      if (ganz[0]) {
        const ganzVar: [number, P | null, P[] | null] = [rBord!, eckMitte, bordBogen]
        setzeEcke(...eckVar)
        ;[bogenRegel, gegenseite, mitBord] = eckePruefen()
        let drehE: number | null = null
        if (bogenRegel) {
          const lk = linieB(30, 30 + h, radiusAv!)
          if (lk) {
            const abstE: number[] = []
            for (let i = 0; i <= Math.floor(30 / SCHRITT); i++) abstE.push(h + i * SCHRITT)
            abstE.push(30 + h)
            drehE = gegendrehung(lk[0].filter((_, i) => abstE[i] <= (geo.sTb ?? 0) + ABST_UEBERGANG_M))
          }
        }
        if (!bogenRegel || drehE === null || drehE > GEGENDREH_GRAD) {
          setzeEcke(...ganzVar)
          ;[bogenRegel, gegenseite, mitBord] = ganz
          eckstueck = null
        }
      } else {
        bogenRegel = ''; gegenseite = ganz[1]
        eckstueck = null
      }
      radiusQuelleB = `AV-Bordkante ${f1(rBord!)} m + ${f1(abstL)} m`
    } else [bogenRegel, gegenseite, mitBord] = eckePruefen()
  }
  // ECKE_AN_FAHRSTREIFEN (B3, ecke_an_fs): die innere Ecke gilt nur, wenn ihre Bordkante an die Fahrstreifen grenzt. Portiert
  // sind beide Gründe: AV-Teil (Bordkante mehr als ECKE_FS_MAX_M hinter dem Rand der Strasse: Platz, breite Mündung) und, seit
  // E2 mit eingegebenen Parkfeldern, Parkfelder im Bogen (ECKE_PARK_MIN)
  let eckeFs: string | null = null
  const eckeAnFs = (): [string | null, number | null, number | null] => {
    const kante = mitBord ? bordKante() : null
    let tb_: P, ta_: P, bogen_: P[]
    if (kante) [bogen_, tb_, ta_] = kante
    else {
      let w0_: number, sgn_: number, abl_: number
      ;[tb_, ta_, w0_, sgn_, abl_] = kreisEcke()
      const m_ = Math.max(4, Math.ceil(abl_ * radiusAv! / 0.5))
      bogen_ = Array.from({ length: m_ + 1 }, (_, i) =>
        add(eckMitte!, [Math.cos(w0_ + sgn_ * abl_ * i / m_), Math.sin(w0_ + sgn_ * abl_ * i / m_)], radiusAv!))
    }
    // Parkfelder im Bogen: Prüfpunkte auf der Fahrlinie (vor dem Streifen) und halbwegs zur Bordkante (ECKE_PARK_MIN)
    let nP = 0
    if (parkAlle && !parkAlle.leer) for (const q_ of bogen_) {
      if (dot(sub(q_, s.m), neg(d)) <= 0) continue
      const v_ = sub(eckMitte!, q_), l_ = Math.hypot(v_[0], v_[1])
      for (const x_ of [0, abstBord! / 2]) if (parkAlle.trifft(l_ > 0 ? add(q_, v_, x_ / l_) : q_, 0.1)) nP++
    }
    const sg_ = linksAb ? -1 : 1
    const randE = linksAb ? (zielE ? zielE[0] : null) : vomRandAb
    const randA = linksAb ? (zielA ? zielA[0] : null) : (fsB ? fsB.vomRand : null)
    const rueck: (number | null)[] = []
    for (const [spur_, t_, lage_, rand_, schaetz_] of [
      [wegA, ta_, querA, randE, dot(sub(ta_, s.m), neg(d))],
      [arm, tb_, lageB, randA, dot(sub(tb_, j), aus)]] as [P[], P, number, number | null, number][]) {
      const pj_ = projektion(spur_, t_, Math.max(0, schaetz_))
      rueck.push(rand_ === null || pj_ === null ? null : Math.round((sg_ * (pj_[1] - lage_) + abstBord! - rand_) * 100) / 100)
    }
    const werte = rueck.filter((x): x is number => x !== null)
    const gross = werte.length ? Math.max(...werte) : 0
    const grund_ = nP >= ECKE_PARK_MIN ? `Parkfelder im Bogen (${nP} Prüfpunkte)` : gross > ECKE_FS_MAX_M ? `Bordkante ${f1(gross)} m hinter dem Rand der ` +
      `${rueck[0] !== null && rueck[0] >= gross ? 'eigenen Strasse' : 'Querstrasse'} (Platz, breite Mündung)` : null
    return [grund_, rueck[0], rueck[1]]
  }
  if (ECKE_AN_FAHRSTREIFEN && radiusAv !== null && bogenRegel && eckMitte !== null) {
    const [grundE] = eckeAnFs()
    if (grundE) {
      // nur, wenn die Schätzung eine brauchbare Fahrlinie gibt und die Zufahrt dadurch nicht still «gedeckt» wird (mit
      // GEDECKT_RECHNEN: nicht erst durch die Schätzung zur gedeckten wird; Radiuswahl wie bisher)
      const rAvEcke = radiusAv
      radiusAv = null
      const rSch = Math.max(RADIUS_MIN, (halbA + halbB + 2 * KURVE_ZUSATZ) / 2 / Math.tan(ablenkung / 2))
      const pr_ = linieB(30, 30 + h, rSch)
      radiusAv = rAvEcke
      const gedecktBei = (R_: number): boolean => {
        const sk_ = sichtweiteKurve(R_)[0]
        return gedecktBeiSw(sk_ === null || sk_ >= swTab1B ? swTab1B : sk_)
      }
      if (!(pr_ && streifenAbstand(pr_[0][0]) <= STREIFEN_TOL_M && kehre(pr_[0]) <= KEHRE_GRAD &&
        pr_[0].filter(aufFb).length >= SCHAETZUNG_AUF_FAHRBAHN * pr_[0].length)) {
        annahmen.push(`AV-Ecke bleibt (${grundE}; Schätzung ohne brauchbare Fahrlinie)`)
      } else if (gedecktBei(rSch) && !gedecktBei(radiusB)) {
        annahmen.push(`AV-Ecke bleibt (${grundE}; Schätzung wäre durch die gerade Zufahrt mitgeprüft)`)
      } else {
        eckeFs = grundE
        bogenRegel = ''
      }
    }
  }
  // Ecke nach Plan-Fläche fast gerade gezeichnet (Nutzerentscheid 20.10.2026): liegt der Bordkantenbogen an einer Fläche (Plan)
  // und ist sein Radius grösser als ECK_GROSS_M, gilt er als unplausibel (eine Abschrägung mit wenigen Punkten ist kein geplanter
  // Radius) -> Schätzung wie bei einer unplausiblen AV-Ecke, für alle Zufahrten an dieser Ecke gleich (unabhängig davon, ob die
  // Ecke die übrigen Prüfungen bestünde). AV-Ecken ohne Plan-Fläche wie bisher (dort nur «AV-Ecke prüfen»). Nicht für einen als
  // gezeichnet bzw. gerundet erkannten Plan-Bogen (planBogen): «Ecke runden» erlaubt Radien bis 30 m, die gelten wie geplant
  // (Korrektur 20.10.2026, Prüfbefund M1)
  let planGross: string | null = null
  if (rBord !== null && rBord > ECK_GROSS_M && bordBogen && fahrbahn.plan.length && !planBogenErkannt()) {
    const pl = fahrbahn.planAnLinie(bordBogen)
    if (pl) planGross = planKurzAv(pl.id, pl.art)
  }
  const planGrossText = planGross ? `Ecke nach ${planGross} fast gerade gezeichnet (Bogen ${f1(rBord!)} m): Abbiegeradius ` +
    'geschätzt – den geplanten Radius mit «Ecke runden» festlegen' : ''
  if (planGross && radiusAv !== null) bogenRegel = ''
  if (planGross && ohneAbstLinks) radiusQuelleB = `geschätzt (Ecke nach ${planGross} fast gerade gezeichnet: Bogen ${f1(rBord!)} m)`
  if (radiusAv !== null && !bogenRegel) {
    radiusAv = null
    radiusQuelleB = `geschätzt (AV-Ecke ${f1(rBord!)} m unplausibel` + (gegenseite ? ': Bogenende auf der Gegenseite des Arms)' : ')')
    if (eckeFs) radiusQuelleB = `geschätzt (AV-Ecke ${f1(rBord!)} m grenzt nicht an die Fahrstreifen: ${eckeFs})`
    if (planGross) radiusQuelleB = `geschätzt (Ecke nach ${planGross} fast gerade gezeichnet: Bogen ${f1(rBord!)} m)`
    radiusB = Math.max(RADIUS_MIN, (halbA + halbB + 2 * KURVE_ZUSATZ) / 2 / Math.tan(ablenkung / 2))
  }
  // Kreisel-Einfahrt: Eckradius höchstens Ringradius + 5 m
  if ((a.hinweis || (!a.ring && ringKnoten(netz, a.knoten) ? 'kreisel_einfahrt' : '')) === 'kreisel_einfahrt') {
    const kn = kreisel.naechst(a.j, 1.0)
    const rRing = kn ? kreisel.radius(kn[1], kn[2], kn[3], KREISEL_EINFAHRT_LOKAL_M, KREISEL_EINFAHRT_LOKAL_M)[0] : null
    if (rRing !== null && radiusB > rRing + KREISEL_EINFAHRT_ZUSATZ_M) {
      radiusB = rRing + KREISEL_EINFAHRT_ZUSATZ_M
      radiusQuelleB += `, begrenzt auf Ringradius + ${KREISEL_EINFAHRT_ZUSATZ_M.toFixed(0)} m`
    }
  }
  // Plausibilität der Schätzung
  let schaetzung: [number, number, number] | null = null
  if (radiusAv === null) {
    const probeS = (R: number): [number, number, number] => {
      const pr = linieB(30, 30 + h, R)
      if (!pr) return [0, Infinity, 0]
      return [pr[0].filter(aufFb).length / pr[0].length, streifenAbstand(pr[0][0]), pr[0].filter(q => inseln.enthaelt(q)).length]
    }
    const gutS = (x: [number, number, number], insel = true) =>
      x[0] >= FAHRLINIE_AUF_FAHRBAHN && x[1] <= STREIFEN_TOL_M && !(insel && x[2])
    schaetzung = probeS(radiusB)
    if (!gutS(schaetzung)) {
      const kand = [radiusB * 0.75, radiusB * 0.5, RADIUS_MIN].filter(R => RADIUS_MIN <= R && R < radiusB - 0.5)
        .map(R => [R, probeS(R)] as [number, [number, number, number]])
      let wahl = kand.find(([, x]) => gutS(x)) ?? null
      if (wahl === null && !gutS(schaetzung, false)) wahl = kand.find(([, x]) => gutS(x, false)) ?? null
      if (wahl !== null) {
        radiusQuelleB += `, verkleinert von ${f1(radiusB)} m`
        ;[radiusB, schaetzung] = wahl
      }
    }
    const plE = planGross ? null : planEcke()
    annahmen.push(planGross ? planGrossText : plE ? `Abbiegeradius geschätzt (keine passende Ecke nach ${plE})` :
      'Abbiegeradius geschätzt (keine passende AV-Ecke)')
  }
  let eckFrage = ''
  if (radiusAv !== null && eckMitte !== null) {
    const bisEcke = einheit(add(dK, aus))
    if (dot(sub(eckMitte, j), bisEcke) <= 0) eckFrage = 'Kreismitte hinter dem Knoten'
    else if (rBord! > ECK_GROSS_M && !planBogenErkannt()) eckFrage = `Bordkante ${f1(rBord!)} m`
  }
  // Kurvensichtweite zum Radius R: bfu bzw. VSS Tab. 2, höchstens Tab. 1 der Querstrasse
  const kurveSw = (R: number): [number, string] => {
    // Querung ohne Vortritt: keine Kurvenregel, Soll nach VSS 40 240 Z. 8.2 mit dem Tempo der Querstrasse
    if (k.ov) return [swTab1B, quelleQuerung(k.ov)]
    const [sk_, q_] = sichtweiteKurve(R)
    return sk_ === null || sk_ >= swTab1B ? [swTab1B, quelleTab1(tempoB, !!k.ausserorts)] : [sk_, q_!]
  }
  const [swK, quelleK] = kurveSw(radiusB)
  // Hofzufahrt (29.10.2026): Arm über highway=service (Hof-, Garagenzufahrt) bzw. ausserhalb der Strassen: bfu-Knotenregel nach dem
  // Radius (10 bis 24 m), geprüft nur ab der Einmündung in die gequerte Strasse, nicht entlang des eigenen Wegs (Sichtfelder sonst durch
  // Häuser); liegt die Einmündung weiter weg als diese Sicht, prüft die gerade Zufahrt die Strecke und der Arm ist keine Zufahrt
  const hofHw = netz.w(a.wid).t.highway ?? ''
  const hof = HOF_HW.includes(hofHw) || !HW_ALLE.includes(hofHw)
  const skHof = hof ? sichtweiteKurve(Math.min(radiusB, KURVE_SICHTWEITE[3][0]))[0] ?? KURVE_SICHTWEITE[3][1] : 0
  if (hof && bisKnoten > skHof) return weg('hofzufahrt', `highway=${hofHw || '?'}; Einmündung ${f1(bisKnoten)} m vor dem Streifen, ` +
    `Sicht nach bfu ${skHof} m`)
  const kuerzer = hatG && !geradeDeckt
  // Text zur Deckung bei Kurvensichtweite sk: Entfallen-Text (Grund «gedeckt») bzw. Feld «deckung». Wortlaut seit 14.10.2026
  // ohne «gedeckt»/«deckt» (Nutzerentscheid; bis dahin «Knoten … m, Kurve … m, eigene Strasse … m»). Ohne deckende gerade
  // Zufahrt (nur mit GEDECKT_NUR_MIT_GERADE bzw. GEDECKT_BIS_KNOTEN aus erreichbar) steht Tab. 1 der eigenen Strasse da
  const deckungText = (sk: number): string => `Knoten ${f1(bisKnoten)} m vor dem Streifen; Kurvensichtweite des Abbiegers ${sk} m; ` +
    (!geradeDeckt ? `Tab. 1 eigene Strasse ${k.swEigen} m` : !k.geradeEntfaellt && k.swAlt < k.swEigen
      ? `die gerade Zufahrt prüft diese Strecke über ${k.swAlt} m mit (${k.swQuelle}; Tab. 1 eigene Strasse ${k.swEigen} m)`
      : `die gerade Zufahrt prüft diese Strecke über ${k.swEigen} m mit`) +
    (k.geradeGestrichen ? '; gerade Zufahrt von Hand gestrichen (prüft nicht mit)' : '') +
    (kuerzer ? '; gerade Zufahrt reicht nicht bis zum Knoten' : '')
  // Quelle der Sichtweite einer gedeckten Zufahrt (GEDECKT_RECHNEN): Kurvensichtweite, ab dem Knoten prüft die gerade Zufahrt
  const quelleGedeckt = (q: string) => `${q === QUELLE_TAB1 ? 'Kurvensichtweite, höchstens VSS Tab. 1' : istQuelleTab1(q) ? `Kurvensichtweite, höchstens nach Tempo (${q})`
    : `Kurvensichtweite (${q})`}; ab dem Knoten prüft die gerade Zufahrt mit`
  // gedeckt: bisher entfallen; mit GEDECKT_RECHNEN gerechnet mit der Kurvensichtweite (nicht «bis Knoten») und gezählt
  let deckung: string | null = null
  if (!hof && gedecktBeiSw(swK)) {
    if (!gedecktRechnen) return weg('gedeckt', deckungText(swK))
    deckung = deckungText(swK)
  }
  // Fahrlinie passt nicht: bei einer gedeckten Zufahrt mit dem Deckungstext (bisher entfiel sie als «gedeckt»)
  const wegGeometrie = (q: string) => weg('geometrie', deckung !== null ? `${q}; durch die gerade Zufahrt mitgeprüft: ${deckung}` : q)
  const quelleKnotenB = kuerzer ? 'bis Knoten (gerade Zufahrt kürzer)' : 'bis Knoten (Tab. 1 eigene Strasse' +
    (k.tempo !== tempoB ? `, Tempo ${k.tempo})` : ')')
  let swB: number, swQuelleB: string, swBBasis: number
  const bisB: [string, number][] = []
  if (hof) {
    swB = Math.max(Math.ceil(bisKnoten), SPUR_MIN_M); swQuelleB = `bfu Knotenregel ${skHof} m, bis Einmündung (Hofzufahrt)`
    swBBasis = swB; bisB.push(['knoten', dj])
  } else if (bisKnoten > swK && deckung === null) {
    swB = Math.min(Math.ceil(bisKnoten), k.swEigen); swQuelleB = quelleKnotenB
    swBBasis = k.swEigen; bisB.push(['knoten', dj])
  } else { swB = swK; swQuelleB = deckung !== null ? quelleGedeckt(quelleK) : quelleK; swBBasis = swB }
  let gesamtB = swB + h
  let lb = linieB(swB, gesamtB, radiusB)
  if (lb === null) return wegGeometrie('keine Fahrlinie (Bogen)')
  const startAbst = streifenAbstand(lb[0][0])
  if (startAbst > STREIFEN_TOL_M) return wegGeometrie(`Fahrlinie beginnt ${f1(startAbst)} m neben dem Streifen`)
  if (schaetzung !== null && schaetzung[0] < SCHAETZUNG_AUF_FAHRBAHN)
    return wegGeometrie(`geschätzte Fahrlinie nur zu ${(100 * schaetzung[0]).toFixed(0)} % auf der Fahrbahn`)
  // Querung ohne Vortritt (Nutzerentscheid 30.10.2026, Variante A; Herleitung in ohneVortritt.ts): Sicht höchstens bis zum Beginn
  // des Abbiegens. Beginn des Abbiegens = Bogenende auf dem Arm (geo.tb: Tangentenpunkt bzw. Ende der versetzten Bordkante der
  // Fahrlinie konzentrisch zur Ecke, beim Tangentenbogen dessen Ende; bei geschätztem Radius die geschätzte Fahrlinie gleich);
  // geo.sTb = Länge der Fahrlinie vom Streifen (Mitte) bis dorthin: Strecke bis zum Knoten, an dem das Fahrzeug abbiegt, und Bogen.
  // Soll = min(Z. 8.2; geo.sTb − h), mindestens SPUR_MIN_M. Hofzufahrt (eigene Regel), Strecke «bis Knoten» (Knoten jenseits des
  // Solls: kürzer) und eine gedeckte Zufahrt bleiben wie bisher
  let annahmeB: { grenze: string; normM: number; quelle: string } | null = null
  if (k.ov && !hof && deckung === null && swQuelleB === quelleK && geo.sTb !== undefined) {
    const sAbb = geo.sTb
    const swAbb = Math.max(auf01(sAbb - h), SPUR_MIN_M)
    if (swAbb < swB) {
      annahmeB = { grenze: BIS_ABBIEGEN, normM: swB, quelle: quelleQuerungAbbiegen(k.ov, swB) }
      swB = swAbb; gesamtB = swB + h
      swQuelleB = annahmeB.quelle
      bisB.push(['abbiegen', sAbb])
      lb = linieB(swB, gesamtB, radiusB)
      if (lb === null) return wegGeometrie('keine Fahrlinie (Bogen)')
    }
  }
  let hinweisEnde = false
  if (hinB) {
    const s_ende = naechsterAufSpur(punktAuf(arm, hinBM!), lb[2])![1]
    const swEnde = Math.ceil(s_ende - h)
    if (swEnde < swB) {
      hinweisEnde = true
      swB = Math.max(swEnde, SPUR_MIN_M); gesamtB = swB + h
      bisB.push(['ende', s_ende])
      swQuelleB = hinB === 'strassenende' ? 'bis Knoten (Strassenende)' : 'bis Wegende'
      lb = linieB(swB, gesamtB, radiusB)
      if (lb === null) return wegGeometrie('keine Fahrlinie (Bogen)')
    }
  }
  // Querung ohne Vortritt: geprüft höchstens bis REICHWEITE_SICHT_M (Reichweite der geladenen Daten, ohneVortritt.ts); ein
  // Wegende bzw. Strassenende jenseits davon ist keine Grenze (Grenze der OSM-Daten möglich), es gilt das Soll nach Z. 8.2
  let geprueftB: { bis: number; soll: number } | null = null
  if (k.ov && swB > REICHWEITE_SICHT_M) {
    const ende = swQuelleB === 'bis Knoten (Strassenende)' || swQuelleB === 'bis Wegende'
    geprueftB = { bis: REICHWEITE_SICHT_M, soll: ende ? swTab1B : swB }
    if (ende) { swQuelleB = quelleQuerung(k.ov); hinweisEnde = false }
    swB = REICHWEITE_SICHT_M; gesamtB = swB + h; swBBasis = Math.min(swBBasis, REICHWEITE_SICHT_M)
    lb = linieB(swB, gesamtB, radiusB)
    if (lb === null) return wegGeometrie('keine Fahrlinie (Bogen)')
  }
  // Sicherheitsnetz
  let nVerschB = 0
  let abstAlle: number[] = []
  for (let i = 0; i <= Math.floor(swB / SCHRITT); i++) abstAlle.push(h + i * SCHRITT)
  abstAlle.push(gesamtB)
  let idxB = lb[0].map((_, i) => i)
  const brueckB = lb[0].map(q => aufBruecke(q))
  if (lb[0].some((q, i) => !fbAb.enthaelt(q) && brueckB[i] === null)) {
    let pts = lb[0].map((q, i) => (brueckB[i] !== null ? q : aufFahrbahnNaechst(fbAb, q)))
    const versch = lb[0].map((q, i) => q[0] !== pts[i][0] || q[1] !== pts[i][1])
    const sRoh = abstAlle.slice(0, pts.length)
    const sNeu = pts.map((q, i) => (versch[i] ? (projektion(lb![2], q, sRoh[i]) ?? [sRoh[i], 0])[0] : sRoh[i]))
    const behalten: number[] = []
    let sVor = -Infinity
    for (let i = 0; i < pts.length; i++) {
      if (versch[i]) {
        let sNach = Infinity
        for (let x = i + 1; x < pts.length; x++) if (!versch[x]) { sNach = sRoh[x]; break }
        if (!(sVor < sNeu[i] && sNeu[i] < sNach)) continue
      }
      behalten.push(i); sVor = sNeu[i]
    }
    if (behalten.length >= 2 && behalten.length < pts.length) idxB = behalten
    pts = idxB.map(i => pts[i])
    nVerschB = idxB.filter(i => versch[i]).length
    lb = [pts, null, lb[2]]
  }
  if (radiusAv === null && kehre(lb[0]) > KEHRE_GRAD)
    return wegGeometrie(`geschätzte Fahrlinie kehrt um (Richtungswechsel ${kehre(lb[0]).toFixed(0)}°)`)
  // Beginn am Umriss
  const swBeiB = (h_: number): number => {
    let sw_ = swBBasis
    for (const [art_, x_] of bisB)
      sw_ = Math.min(sw_, art_ === 'knoten' ? Math.max(Math.ceil(Math.max(x_ - h_, 0)), 1) :
        art_ === 'abbiegen' ? Math.max(auf01(x_ - h_), SPUR_MIN_M) : Math.max(Math.ceil(x_ - h_), SPUR_MIN_M))
    return sw_
  }
  const linie2 = lb[2]
  const spurB = (x: number): P | null => { const r = punkteAufSpur(linie2, [x]); return r.length ? r[0][0] : null }
  const abstP = idxB.map(i => abstAlle[i])
  const [hRohB] = lb[0].length >= 2 ? randAmUmriss(s, lb[0], abstP, d, querA, hAlt) : [hAlt]
  let hRandB = hRohB
  if (hRandB !== hAlt) hRandB = randWaehlen(hRohB, hAlt, lb[0], abstP, swBeiB, spurB, aufFb, umrissRing(s), park)[0]
  const swBRand = swBeiB(hRandB)
  if ((hRandB !== hAlt || swBRand !== swB) && lb[0].length >= 2) {
    const [ptsB] = umsetzen(lb[0], abstP, hRandB, swBRand + hRandB, spurB)
    endpunkteMangel([lb[0][0], lb[0][lb[0].length - 1]], [ptsB[0], ptsB[ptsB.length - 1]], aufFb, park)
    swB = swBRand
    lb = [ptsB, null, lb[2]]
  }
  // B1 Abstand zu Parkfeldern (PARK_ABSTAND; ohne Velostreifen-Band): Punkte neben der Fahrbahn bleiben
  if (parkAlle && !parkAlle.leer && lb[0].length >= 2) {
    const festB = new Set(lb[0].map((q, i) => (aufFb(q) ? -1 : i)).filter(i => i >= 0))
    const [ptsP, info] = abstandHalten(lb[0], aufFb, parkAlle, fahrbahn, festB, armZweirichtig)
    lb = [ptsP, null, lb[2]]
    if (info && info.n) annahmen.push(`${info.n} Sichtpunkte für 1,5 m Abstand zu Parkfeldern verschoben`)
  }
  // Spur von Hand B (Linie) mit Radius von Hand: Sichtweite aus dem Radius (sichtweite_radius_hand). Mit GEDECKT_RECHNEN
  // entscheidet der Radius von Hand auch die Deckung neu, nach derselben Regel wie oben: gedeckt -> Kurvensichtweite aus dem
  // Radius von Hand (am Strassen- bzw. Wegende das kürzere, wie sichtweite_radius_hand), sonst ohne «deckung»
  const spurH = k.vonHand?.spur?.(fid, kennungArm(a)) ?? null
  let radiusText: string | null = null, radiusHand: number | null = null, lageHand = false
  // Bordkante der Ecke an einer Fläche (Plan) von Hand: Quelle «nach Plan-Fläche n» statt «AV-» (planflaechen.ts; ohne Plan-Flächen
  // unverändert)
  // Scharfe Ecke (Radius 0, kein Bogen) an einer Plan-Fläche: «Ecke nach Plan-Fläche n (Art) von Hand 0,0 m + …» (Prüfbefund 20.10.)
  const plQ = radiusQuelleB.includes('AV-') ? planEcke() : null
  if (plQ) radiusQuelleB = radiusQuelleB.replace(/AV-(Bordkante|Ecke)/g, (_, w: string) => `${bordBogen ? w : 'Ecke'} nach ${plQ} von Hand`)
  if (spurH && spurH.art === 'B' && spurH.linie.length >= 2) {
    if (spurH.radius && !k.ov) {
      let [swH, qH] = sichtweiteRadiusHand(spurH.radius, swB, swQuelleB, tempoB, bisKnoten, k.swEigen, quelleKnotenB, !!k.ausserorts)
      if (gedecktRechnen) {
        const [skH, qkH] = kurveSw(spurH.radius)
        const ende = swQuelleB === 'bis Knoten (Strassenende)' || swQuelleB === 'bis Wegende'
        deckung = gedecktBeiSw(skH) ? deckungText(skH) : null
        if (deckung !== null && (!ende || skH < swB)) { swH = skH; qH = quelleGedeckt(qkH) }
      }
      radiusText = `von Hand (Fahrlinie von Hand); berechnet ${Number.isFinite(radiusB) ? radiusRunden(radiusB).toFixed(1).replace('.', ',') : '–'} m (${radiusQuelleB})`
      radiusHand = spurH.radius
      swB = swH; swQuelleB = qH
    }
    lb = [liniePunkte(spurH.linie, swB)[0], null, spurH.linie]
    lageHand = true
  }
  if (k.vonHand?.streichen?.(fid, kennungArm(a))) return weg('hand', 'von Hand gestrichen')
  const hinweisA = a.hinweis || (!a.ring && ringKnoten(netz, a.knoten) ? 'kreisel_einfahrt' : '')
  const hinweisB = hinweisEnde ? 'abbiegend_ende' : (hinweisA || 'abbiegend')
  const sichtpunkteB = lb[0]
  const feldB = k.sichtfeld(sichtpunkteB)
  const hinweiseB = [...a.hinweise, ...(!a.nebenarm && su.dist <= h + 3 ? ['knoten_am_streifen'] : [])]
  if (fsB?.osm?.widerspruch) hinweiseB.push('fahrstreifen_widerspruch')
  if (fsB?.osm?.breit) hinweiseB.push('fahrstreifen_einspurig_breit')
  if (armOsm !== null || knotenHoch) hinweiseB.push('bruecke')
  if (lageHand) hinweiseB.push('spur_hand')
  if (hof) hinweiseB.push('hofzufahrt')
  if (deckung !== null) hinweiseB.push('gedeckt')
  const fh = fsHinweis(fsoB, fsDvB)
  if (fh) hinweiseB.push(...fh.split(';'))
  if (swQuelleB === 'VSS Tab. 2' || swQuelleB === quelleGedeckt('VSS Tab. 2')) {
    const ftE = zf.g !== null ? fahrstreifenTags(netz.w(zf.g.wid).t, zf.sd! > 0) : null
    if ((fsoB?.n ?? 0) > 1 || (ftE?.[0] ?? 0) > 1) hinweiseB.push('tab2_mehrstreifig')
  }
  const plF = eckFrage ? planEcke() : null
  if (eckFrage) annahmen.push(plF ? `Ecke nach ${plF} prüfen: ${eckFrage}` : `AV-Ecke prüfen: ${eckFrage}`)
  if (fsB?.abzugQuelle) annahmen.push(abzugAnnahme(fsB.abzugQuelle, true))
  const konflikte = k.konflikte(feldB, sichtpunkteB)
  // frei bis (29.10.2026, wie bei geraden Zufahrten): Grundprüfung und Querung ohne Vortritt entscheiden Muss bzw. Soll danach
  const freiBisM = freiBis(sichtpunkteB, konflikte, k.sichtfeld, k.konflikte, geprueftB ? geprueftB.bis : swB)
  const radiusOut = Number.isFinite(radiusB) ? radiusRunden(radiusB) : null
  return {
    fgsId: fid, zufahrt: `a${grad}`, kennung: kennungArm(a), richtung: grad, art: 'abbiegend',
    strasse: a.name || null, ueberStrasse: zf.name || null, knotenM: Math.round(bisKnoten * 10) / 10,
    tempo: tempoB, tempoQuelle: tempoQB, sichtweite: geprueftB ? geprueftB.soll : swB, sichtweiteQuelle: swQuelleB,
    ...(geprueftB ? { geprueftBisM: geprueftB.bis } : {}),
    ...(annahmeB && swQuelleB === annahmeB.quelle ? { annahmeGrenze: { grenze: annahmeB.grenze, normM: annahmeB.normM } } : {}),
    freiBisM,
    kurvenradiusM: radiusHand !== null ? radiusRunden(radiusHand) : radiusOut, radiusQuelle: radiusText ?? radiusQuelleB, ...konfliktFelder(konflikte), konflikte,
    spurHinweis: hinweisB, spurHinweisM: null, fahrbahnM: fsB ? Math.round(fsB.breite * 100) / 100 : null,
    parkRechts: fsB ? fsB.parkR : null, parkLinks: fsB ? fsB.parkL : null, velostreifenRechtsM: fsB ? fsB.veloR : null,
    velostreifenLinksM: fsB ? fsB.veloL : null, abzugQuelle: fsB?.abzugQuelle ?? null,
    abzugRechtsM: fsB ? Math.max(fsB.parkR ? fsB.abzugParkR : 0, fsB.veloR) : null,
    fahrstreifenM: fsB ? Math.round(fsB.jeRichtung * 100) / 100 : null, mehrstreifig: fsB ? fsB.mehrstreifig : null,
    sichtpunktVomRandM: fsB ? Math.round(fsB.vomRand * 100) / 100 : null, lageQuelle: lageHand ? 'Hand' : armOsm !== null ? 'OSM' : fsB ? 'AV' : 'Annahme',
    ...k.basisErgebnis(), einbahnQuelle: null, osmWeg: String(a.wid), osmKnoten: String(a.knoten), ersterKnotenM: null,
    netzHinweis: [...new Set(hinweiseB)], punkteVerschoben: nVerschB, sichtpunkte: sichtpunkteB, feld: feldB, spur: lb[2],
    annahmen, ...(deckung !== null ? { deckung } : {}),
  }
}
