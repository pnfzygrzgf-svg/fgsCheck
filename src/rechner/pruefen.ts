// ── Sichtprüfung je Streifen (Portierung von fgs_sicht_pruefen.pruefen, Kern) ──
//
// Je Teilstreifen: Bordkanten, Wartebereiche, Annäherungsbereiche (am AV-Rand), Zufahrten (zufahrten_bilden,
// teilstreifen_paare); je Fahrtrichtung zuerst die Topologie (stromauf, knotenbereich, spur_gerade), dann Tempo (OSM
// entlang der Spur), Sichtweite (Tab. 1, «bis Knoten», Kreisel-Regel nach Ringradius, Spurende), Fahrstreifenlage
// (AV-Sehnen, OSM-Fahrstreifen, Abzüge aus OSM-Tags), Sichtpunkte (am_rand_halten, Beginn am Umriss), Sichtfeld und
// Konflikte (Parkfelder, Gebäude, Hecken/Mauern, Bäume); danach die abbiegenden Zufahrten (abbiegen.ts).
// Nicht übernommen (Berner Sonderdaten bzw. -abläufe): Massenlauf, Abnahme-Liste, Journal, Kataster-Markierungen (Velostreifen,
// Sperrflächen, Haltestellen, Endbalken), Velonetz-Regel B3/B4, amtliche Tempo-Achsen.
// Seit E2: Hindernisse (Parkfelder, Bäume, Hecken/Mauern) mit den davon abhängigen Regeln, Brückenkopf aus dem AV-Brückenumriss
// (Einzelobjekte, WFS) und R2-Flächen (übrige befestigte Flächen unter einem OSM-Weg als Fahrbahn), Eingaben von Hand (VonHand).

import { type P, add, dist, dot, rechts, sub, richtungGrad, neg } from '../geo'
import type { OsmNetz } from './netz'
import { kennungGerade, verlaengern, streckeLaenge, type Knotenbereich, type Suche, type SpurGerade, type ArmInfo } from './netz'
import type { Fahrbahn, Inseln, Gebaeude, Flaechen } from './flaechen'
import { Kreisel, KREISEL_LOKAL_M, KREISEL_RMS_M, KREISEL_BOGEN_M } from './kreisel'
import {
  refAuf, punkteAufSpur, glaetten, versetzen, amRandHalten, querZweirichtig, aufFahrbahnNaechst, umsetzen, randWaehlen,
  endpunkteMangel, abstandHalten, type RandInfo, SCHRITT, VERSATZ_RUECK_M, FAHRSTREIFEN_MAX,
} from './spur'
import {
  type Fs, type Fso, type FsoLage, fahrstreifenmitte, fahrstreifenOsm, fahrstreifenLage, fahrstreifenUebernehmen, fsHinweis,
  abzugAusOsm, fahrbahnOsm, type Abzug, type AbzugQuelle, osmBreite, lageOsm, wegeAbschnitte, wegBei, hochBei, MEHRSTREIFIG_AB, MEHRSTREIFIG_EINBAHN,
} from './fahrstreifen'
import { sichtweiteTab1, sichtweiteKurve, radiusRunden, tempoStart, tempoEntlang, SICHTWEITE } from './tempo'
import {
  type Streifen, zufahrtenStreifen, raender, wartebereiche, annaeherungsbereich, annAmRand, umrissRing, randAmUmriss,
} from './streifen'
import { type Zufahrt, type Entfallen, zufahrtenBilden, teilstreifenPaare, trennungKontext, entfallen } from './zufahrten'
import { OsmAchsen, achseWaehlen } from './achsen'
import { type SpurHand, spurVersetzen, liniePunkte } from './spurhand'
import type { ParkRaster } from './hindernisse'
import { abbiegeZufahrt, SPUR_MIN_M, type AbbiegeKontext } from './abbiegen'
import { type Multi, type Poly, vereinigung, differenz, schnitt, flaeche, konvexeHuelle, enthaelt, abstandMulti, huelle, abstandLinieMulti } from './poly'
import { type HindernisDaten, linieLaengeIn, laengsPolygon } from './hindernisse'
import type { ZufahrtErgebnis, StreifenErgebnis, Konflikt } from './typen'

const RAND_TOL = 1.0
const KNOTEN_SPERRE = 10.0
const GLAETTUNG_M = 6.0
const SPUR_ENDE_KAPPEN = true
const FS_OSM_INSEL_M = 0.5
const MIN_GEBAEUDE = 1.0
const MIN_UEBERDECKUNG = 0.25        // m² Parkfeld im Sichtfeld
const MIN_LINIE_M = 0.5            // Hecke/Mauer als Linie: so viel im Sichtfeld
const VRV_ABSTAND = 5.0            // VRV Art. 18 Abs. 2e
export const R2_FLAECHEN = ['uebrige_befestigte']
const R2_MIN_PUNKTE = 3
const R2_NAH_M = 3.0
export const RANG_STATUS: Record<string, number> = { frei: 0, verdeckt_zweirad: 1, verdeckt_baum: 2, verdeckt_hindernis: 2.5,
  verdeckt_gebaeude: 3, verdeckt: 4 }
const SPUR_AUF_FAHRBAHN = 0.7
const SPUR_PRUEF_M = 40.0
const LSA_QUERUNG_M = 6.0
const LSA_AMPEL_M = 30.0
const f1 = (x: number) => x.toFixed(1).replace('.', ',')

/** Eingaben von Hand (E2: Tempo bestätigen/korrigieren, Parkierung/Velostreifen; im Referenzvergleich die Berner Werte) */
export interface VonHand {
  tempo?: (fid: string, art: 'gerade' | 'abbiegend', grad: number) => number | null
  abzug?: (fid: string, art: 'gerade' | 'abbiegend', grad: number) => { r: Abzug; l: Abzug } | null
  /** Tempo von Hand je Zufahrt (Kennung) */
  tempoKennung?: (fid: string, kennung: string) => number | null
  /** Spur von Hand je Zufahrt (Kennung w…± bzw. k…:w…±) */
  spur?: (fid: string, kennung: string) => SpurHand | null
  /** Zufahrt von Hand gestrichen (Kennung) */
  streichen?: (fid: string, kennung: string) => boolean
  /** Lichtsignal von Hand je Streifen */
  lsa?: (fid: string) => 'ja' | 'nein' | null
  /** Streifen von Hand als «kein FGS» beurteilt: nicht gerechnet */
  keinFgs?: (fid: string) => boolean
}

export interface Kontext {
  vonHand?: VonHand
  netz: OsmNetz | null
  fahrbahn: Fahrbahn
  inseln: Inseln
  gebaeude: Gebaeude
  flaechenRand: Flaechen
  hindernisse?: HindernisDaten | null
  brueckenumriss?: { enthaelt(p: P): boolean } | null     // AV-Einzelobjekte Bruecke_Passerelle (+0,5 m)
  flaechenR2?: Flaechen | null                           // AV uebrige_befestigte und Gebaeude (R2)
}

/** sichtfeld: Vereinigung der Sichtkeile (konvexe Hülle der Ziele mit zwei benachbarten Sichtpunkten) */
export function sichtfeld(sichtpunkte: P[], ziele: Multi): Multi {
  const zielPunkte = ziele.flatMap(poly => poly[0])
  const paare: [P, P][] = sichtpunkte.length > 1 ? sichtpunkte.slice(1).map((b, k) => [sichtpunkte[k], b]) :
    [[sichtpunkte[0], sichtpunkte[0]]]
  const keile: Multi = paare.map(([a, b]) => [konvexeHuelle([...zielPunkte, a, b])])
  return vereinigung(...keile.map(k => [k]))
}

/**
 * konflikte_suchen: Bäume (Stamm im Sichtfeld, auch im Annäherungsbereich; nicht direkt an einem Sichtpunkt), Gebäude und
 * sonstige sichtbehindernde Hindernisse (ohne Streifen und Annäherungsbereiche, keine Durchfahrt, Gebäude ab 1 m²), Parkfelder
 * (alle Klassen, ab MIN_UEBERDECKUNG im Sichtfeld).
 */
export function konflikteSuchen(feld: Multi, streifen: Multi, gebaeude: Gebaeude, ziele: Multi, sichtpunkte: P[],
  hd: HindernisDaten | null = null): Konflikt[] {
  const out: Konflikt[] = []
  if (!feld.length) return out
  const [x0, y0, x1, y1] = huelle(feld)
  if (hd) for (const b of hd.baeume) {
    if (b.xy[0] < x0 - 1 || b.xy[0] > x1 + 1 || b.xy[1] < y0 - 1 || b.xy[1] > y1 + 1) continue
    if (!schnitt(b.stamm, feld).length) continue
    if (sichtpunkte.some(q => dist(b.xy, q) < 1.0)) continue
    out.push({ klasse: 'baum', flaeche: 0, abstand: abstandMulti(b.stamm, streifen), geom: b.stamm, layer: b.name, id: b.id })
  }
  const feldG = differenz(feld, ziele)
  if (feldG.length) {
    for (const t of gebaeude.kandidaten(huelle(feldG))) {
      if (sichtpunkte.some(q => enthaelt([t.poly], q))) continue
      const x = schnitt([t.poly], feldG)
      const fl = flaeche(x)
      if (fl >= MIN_GEBAEUDE) out.push({ klasse: 'gebaeude', flaeche: fl, abstand: abstandMulti([t.poly], streifen), geom: [t.poly],
        layer: 'Gebäude (AV)' })
    }
    if (hd) for (const h of hd.sonstige) {
      if (h.geom) {
        if (sichtpunkte.some(q => enthaelt(h.geom!, q))) continue
        const fl = flaeche(schnitt(h.geom, feldG))
        if (fl >= MIN_GEBAEUDE) out.push({ klasse: 'hindernis', flaeche: fl, abstand: abstandMulti(h.geom, streifen), geom: h.geom,
          layer: h.name, id: h.id })
      } else if (h.linie) {
        const l = linieLaengeIn(h.linie, feldG)
        if (l >= MIN_LINIE_M) out.push({ klasse: 'hindernis', flaeche: 0, abstand: abstandLinieMulti(h.linie, streifen),
          geom: [[laengsPolygon(h.linie, 0.2)]], layer: `${h.name} (${l.toFixed(1).replace('.', ',')} m im Sichtfeld)`, id: h.id })
      }
    }
  }
  if (hd) for (const f of hd.parkAlle.felder) {
    if (f.env[2] < x0 || f.env[0] > x1 || f.env[3] < y0 || f.env[1] > y1) continue
    const fl = flaeche(schnitt([f.poly], feld))
    if (fl >= MIN_UEBERDECKUNG) out.push({ klasse: f.klasse, flaeche: fl, abstand: abstandMulti([f.poly], streifen), geom: [f.poly],
      layer: f.name, id: f.id })
  }
  return out
}

/** Status nach ergebnis(): Rangfolge Auto-Parkfeld, Gebäude, übrige Hindernisse, Baum, Zweirad-Feld; Kennzahlen */
export function konfliktFelder(konflikte: Konflikt[]): Pick<ZufahrtErgebnis, 'status' | 'nAuto' | 'nZweirad' | 'nGebaeude' |
  'nBaeume' | 'nHindernisse' | 'ueberdeckungM2' | 'minAbstandAutoM' | 'unter5m'> {
  const auto = konflikte.filter(k => k.klasse === 'auto'), geb = konflikte.filter(k => k.klasse === 'gebaeude')
  const baum = konflikte.filter(k => k.klasse === 'baum'), zwei = konflikte.filter(k => k.klasse === 'velo' || k.klasse === 'motorrad')
  const hind = konflikte.filter(k => k.klasse === 'hindernis')
  const status = auto.length ? 'verdeckt' : geb.length ? 'verdeckt_gebaeude' : hind.length ? 'verdeckt_hindernis' :
    baum.length ? 'verdeckt_baum' : zwei.length ? 'verdeckt_zweirad' : 'frei'
  return { status, nAuto: auto.length, nZweirad: zwei.length, nGebaeude: geb.length, nBaeume: baum.length, nHindernisse: hind.length,
    ueberdeckungM2: Math.round(auto.reduce((x, k) => x + k.flaeche, 0) * 10) / 10,
    minAbstandAutoM: auto.length ? Math.round(Math.min(...auto.map(k => k.abstand)) * 10) / 10 : null,
    unter5m: auto.some(k => k.abstand < VRV_ABSTAND) }
}

/** Lichtsignale.einordnen mit OSM (crossing=traffic_signals bis 6 m, Ampel bis 30 m gilt als LSA) */
function lsaEinordnen(netz: OsmNetz | null, streifen: Multi): [string, string | null] {
  if (!netz) return ['nein', null]
  let quer: [number, number] | null = null, ampel: [number, number] | null = null
  for (const [nid, u] of netz.U) {
    if (!(u.t.crossing === 'traffic_signals' || u.t['crossing:signals'] === 'yes')) continue
    const d = abstandMulti(streifen, [[[u.p, u.p, u.p]]])
    if (quer === null || d < quer[0]) quer = [d, nid]
  }
  for (const a of netz.ampeln) {
    const d = abstandMulti(streifen, [[[a.p, a.p, a.p]]])
    if (ampel === null || d < ampel[0]) ampel = [d, a.id]
  }
  if (quer && quer[0] <= LSA_QUERUNG_M) return ['ja', `OSM Knoten ${quer[1]}`]
  if (ampel && ampel[0] <= LSA_AMPEL_M) return ['ja', `Ampel in der Nähe, gilt als LSA (OSM Knoten ${ampel[1]})`]
  return ['nein', null]
}

/** schluessel: Schlüssel einer Zufahrt (b-Zusatz bei gleicher Richtung ± 10°/15°) */
function schluessel(ergebnisse: ZufahrtErgebnis[], art: string, grad: number): string {
  const ab = art === 'abbiegend', tol = ab ? 15 : 10
  const n = ergebnisse.filter(e => (e.art === 'abbiegend') === ab && Math.abs(((e.richtung - grad + 540) % 360) - 180) <= tol).length
  return (ab ? 'a' : '') + grad + 'b'.repeat(n)
}

interface StreifenX extends Streifen { netzQuelle?: string; strasse?: string }

/** pruefen: alle Teilstreifen -> Ergebnisse */
export function pruefen(S: StreifenX[], kx: Kontext): StreifenErgebnis[] {
  const { netz, fahrbahn, gebaeude } = kx
  // Inseln ausserhalb der AV (angenommen nach OSM bzw. von Hand, Streifen.inseln): als Verkehrsinsel für die Zufahrten
  // (Inselteil, Einspur, Gegenstück) und den Annäherungsbereich; Fahrbahn, Sichtpunkte und Abbiegende bleiben bei der AV (kx.inseln)
  const zusatz = [...new Set(S.flatMap(s => s.inseln ?? []))].map(z => z.ring)
  const inseln = zusatz.length ? kx.inseln.mit(zusatz) : kx.inseln
  const flaechenRand = zusatz.length ? kx.flaechenRand.mit(zusatz, 'Verkehrsinsel') : kx.flaechenRand
  const kreisel = new Kreisel(netz ? netz.kreiselWege() : [])
  zufahrtenStreifen(S)
  const tk = trennungKontext(S, netz, inseln)
  const vorab = new Map<string, [Zufahrt[], Entfallen[]]>()
  for (const s of S) {
    const [r0, r1, rq] = raender(s, fahrbahn)
    s.rand = [r0, r1]; s.randQuelle = rq
    s.warte = wartebereiche(s, fahrbahn)
    vorab.set(s.fgsId, zufahrtenBilden(s, netz, inseln, r0, r1, tk))
  }
  teilstreifenPaare(S, new Map([...vorab].map(([fid, [zfs]]) => [fid, zfs])), inseln)
  const aus: StreifenErgebnis[] = []
  for (const s of S) {
    const fid = s.fgsId
    let ann: [Poly, Poly] = [annaeherungsbereich(...s.warte[0].slice(0, 2) as [P, P], s.warte[0][2], s.warte[0][3]),
      annaeherungsbereich(...s.warte[1].slice(0, 2) as [P, P], s.warte[1][2], s.warte[1][3])]
    const annRand = s.warte.map(w => annAmRand(w, fahrbahn, flaechenRand))
    ann = [annRand[0] ? annRand[0][0] : ann[0], annRand[1] ? annRand[1][0] : ann[1]]
    const streifenPoly: Multi = [[umrissRing(s)]]
    const ziele = vereinigung(streifenPoly, [ann[0]], [ann[1]])
    let [lsa, lsaQ] = lsaEinordnen(netz, streifenPoly)
    const lsaHand = kx.vonHand?.lsa?.(fid) ?? null
    if (lsaHand) { lsa = lsaHand; lsaQ = 'von Hand' }
    const [zfs, entf0] = vorab.get(fid)!
    const ent: Entfallen[] = [...entf0]
    const erg: ZufahrtErgebnis[] = []
    const annahmenS = [...s.annahmen]
    if (s.randQuelle !== 'AV') annahmenS.push('Bordkanten am Streifen angenommen (keine passende AV-Sehne)')
    const sf = (pts: P[]) => sichtfeld(pts, ziele)
    const kf = (feld: Multi, pts: P[]) => konflikteSuchen(feld, streifenPoly, gebaeude, ziele, pts, kx.hindernisse ?? null)
    const keinFgs = kx.vonHand?.keinFgs?.(fid) ?? false
    for (const zf of keinFgs ? [] : zfs) {
      const r = geradeUndAbbiegend(s, zf, kx, kreisel, sf, kf, streifenPoly, erg)
      erg.push(...r.ergebnisse)
      ent.push(...r.entfallen)
    }
    const status = keinFgs ? 'kein_fgs' :
      erg.length ? erg.reduce((b, e) => (RANG_STATUS[e.status] > RANG_STATUS[b] ? e.status : b), 'frei') : 'ohne_zufahrt'
    aus.push({ fgsId: fid, uebergangId: s.uebergangId, p0: s.p0, p1: s.p1, bw: s.bw, m: s.m, umriss: umrissRing(s), ann,
      rand: s.rand, randQuelle: s.randQuelle, strasse: s.strasse ?? '', netzQuelle: s.netzQuelle ?? '', lsa, lsaQuelle: lsaQ,
      zufahrten: erg, entfallen: ent, status, annahmen: annahmenS })
  }
  return aus
}

function geradeUndAbbiegend(s: StreifenX, zf: Zufahrt, kx: Kontext, kreisel: Kreisel, sf: (p: P[]) => Multi,
  kf: (f: Multi, p: P[]) => Konflikt[], streifenPoly: Multi, bisher: ZufahrtErgebnis[]):
  { ergebnisse: ZufahrtErgebnis[]; entfallen: Entfallen[] } {
  const { netz, fahrbahn, inseln, gebaeude } = kx
  const fid = s.fgsId
  const ergebnisse: ZufahrtErgebnis[] = [], entf: Entfallen[] = []
  const d = zf.d, art = zf.art, versatz = zf.versatz
  const gradD = richtungGrad(d)
  const annahmen: string[] = []
  const h = s.bw / 2, hAlt = h
  let bis: [number, number, number, number, (x: number) => number] | null = null
  const weite = SICHTWEITE[60] + h + 5
  let su: Suche | null = null, kbe: Knotenbereich | null = null, sg: SpurGerade | null = null
  let knotenM: number[] = []
  let wegRoh: P[], tempoStreifen: number, tempoQ: string, kreiselPruefen: boolean, achseFb = true
  if (zf.g !== null && netz) {
    su = netz.stromauf(zf.g, zf.sd!, zf.gegenEinbahn)
    kbe = su.art === 'knoten' ? netz.knotenbereich(su, zf.g) : null
    sg = netz.spurGerade(su, kbe, weite, SPUR_ENDE_KAPPEN)
    wegRoh = sg.punkte; knotenM = sg.knotenM
    ;[tempoStreifen, tempoQ] = tempoStart(netz, zf.g.wid)
    kreiselPruefen = true
  } else {
    // Rückfall ohne gequerten OSM-Weg (rueckfall_spur): Spur entlang der nächsten passenden OSM-Achse (achse_waehlen;
    // in Bern die Tempo-Achsen), sonst gerade Linie senkrecht zum Streifen
    const [treffer, aufFb] = netz ? achseWaehlen(new OsmAchsen(netz), fahrbahn, s.m, d, h) : [null, false]
    achseFb = aufFb
    if (treffer && netz) {
      const achsen = new OsmAchsen(netz)
      const wid = achsen.linien[treffer[0]].wid
      ;[tempoStreifen, tempoQ] = tempoStart(netz, wid)
      wegRoh = achsen.spur([treffer[0], treffer[1], treffer[2]], neg(d), weite)
      zf.name = zf.name || netz.w(wid).name
      kreiselPruefen = true
      annahmen.push(`Kein OSM-Weg quert den Streifen: Spur entlang OSM-Weg ${wid}` + (aufFb ? '' : ' (neben der Fahrbahn)'))
    } else {
      wegRoh = [s.m, add(s.m, neg(d), weite)]
      tempoStreifen = 50; tempoQ = 'Ersatz'
      kreiselPruefen = false
      annahmen.push('Kein OSM-Weg am Streifen: gerade Spur senkrecht zum Streifen')
    }
  }
  let tempo = tempoStreifen
  if ((zf.g !== null || kreiselPruefen) && netz) {
    const [t, treffer] = tempoEntlang(netz, wegRoh, tempoStreifen, h)
    tempo = t
    if (treffer) tempoQ = 'OSM maxspeed'
  }
  let sw = sichtweiteTab1(tempo)
  const tempoHand = kx.vonHand?.tempo?.(fid, 'gerade', gradD) ??
    kx.vonHand?.tempoKennung?.(fid, zf.g !== null ? kennungGerade(zf.g, zf.sd!) : `s${fid}:${gradD}`) ?? null
  if (tempoHand) { tempo = tempoHand; sw = sichtweiteTab1(tempoHand); tempoQ = 'Korrektur' }
  if (tempoQ === 'Ersatz') annahmen.push('Tempo 50 km/h angenommen (kein maxspeed in OSM)')
  const swEigen = sw
  let gesamt = sw + h
  const kInSicht = su !== null && su.art === 'knoten' && su.dist - h < swEigen
  const forts = kbe !== null ? kbe.forts : null
  const fortsService = kbe !== null && kbe.fortsService
  let hatGerade = !kInSicht || (forts !== null && forts.rolle === 'gerade' && !fortsService)
  let grundGerade: string | null = hatGerade ? null : (forts === null || fortsService ? 'einmuendung' : forts.rolle)
  if (zf.teil !== null && zf.teilPartner === null && zf.teilTrennung && !zf.hinweise.includes('teilstreifen'))
    zf.hinweise.push('teilstreifen')
  if (zf.teilPartner !== null && netz) {
    const [pFid, pGrad] = zf.teilPartner
    let quelleT: string
    if (zf.spiegel) quelleT = `Richtung fährt auf dem anderen Fahrbahnteil, OSM Weg ${zf.g!.wid} quert den Streifen; Gegenstück Nr. ${pFid} «${pGrad}» (Teilstreifen, Spiegelregel)`
    else if (zf.teilTrennung) quelleT = `Streifen quert nur einen Fahrbahnteil, ${zf.teilTrennung}${zf.teil ? '' : ' (Bordkante angenommen)'}; Gegenstück Nr. ${pFid} «${pGrad}»`
    else quelleT = `Streifen quert nur den Fahrbahnteil neben der Insel, OSM Weg ${zf.g!.wid} jenseits des Streifenendes${zf.teil ? '' : ' (Bordkante angenommen)'}; Gegenstück Nr. ${pFid} «${pGrad}»`
    if (grundGerade) quelleT += `; sonst ${grundGerade}`
    entf.push(entfallen(fid, 'gerade', gradD, String(gradD), 'teilstreifen', quelleT, zf.g!.wid,
      su !== null && su.art === 'knoten' ? su.K : '', kennungGerade(zf.g!, zf.sd!)))
    let armeT: ArmInfo[] = kInSicht ? kbe!.arme.filter(a => a.rolle !== 'gerade' && a.rolle !== 'gerade_verboten') : []
    armeT = [...armeT, ...su!.nebenarme.filter(na => na.dist - h < swEigen).map(na => netz.nebenarm(su!, na))]
    for (const a of armeT.sort((x, y) => x.dj - y.dj || richtungGrad(x.fahrt) - richtungGrad(y.fahrt))) {
      const grad = richtungGrad(a.fahrt)
      entf.push(entfallen(fid, 'abbiegend', grad, `a${grad}`, a.rolle === 'abbiegend' ? 'teilstreifen' : a.rolle,
        a.rolle === 'abbiegend' ? `in die Richtung «${gradD}» (Teilstreifen, Gegenstück Nr. ${pFid})` : a.grund,
        a.wid, a.knoten, `k${a.knoten}:w${a.wid}${a.arm[2] > 0 ? '+' : '-'}`))
    }
    return { ergebnisse, entfallen: entf }
  }
  let swQuelle = 'VSS Tab. 1', hinweis = '', hinweisM: number | null = null
  if (kInSicht && hatGerade) { hinweis = 'knoten'; hinweisM = su!.dist }
  if (hatGerade && sg !== null && sg.endeM !== null && sg.endeM - h < sw) {
    hinweis = 'spur_ende'; hinweisM = sg.endeM
    const swEnde = Math.ceil(sg.endeM - h)
    if (swEnde < SPUR_MIN_M) {
      hatGerade = false
      grundGerade = sg.endeGrund === 'strassenende' ? 'einmuendung' : sg.endeGrund === 'einbahn_widerspruch' ?
        'einbahn_widerspruch' : 'wegende'
    } else {
      bis = [sg.endeM, 0, 1, sw, Math.ceil]
      sw = swEnde; gesamt = swEnde + h
      swQuelle = sg.endeGrund === 'strassenende' ? 'bis Knoten (Strassenende)' : 'bis Wegende'
      wegRoh = verlaengern(wegRoh, gesamt + 1.0)
    }
  }
  // Kreisel-Regel nach Ringradius
  const kt = kreiselPruefen && hatGerade ? kreisel.treffer(wegRoh, gesamt) : null
  let radiusG: number | null = null, radiusQG: string | null = null
  if (kt) {
    const [rRing, rq] = kreisel.radius(kt[1], kt[2], kt[3], KREISEL_LOKAL_M)
    radiusQG = rq
    radiusG = rRing === null ? null : radiusRunden(rRing)
    let [swR, qR] = rRing !== null ? sichtweiteKurve(rRing) : [null, null]
    const bisRing = Math.max(kt[0], h) - h
    let bisR: [number, number, number] | null = null
    if (swR !== null && bisRing > swR) { bisR = [kt[0], 0, swR]; swR = Math.ceil(bisRing); qR = 'bis Kreiselring' }
    else if (swR !== null) qR = `Kreiselring R ${f1(radiusG!)} m (${qR})`
    if (kreisel.rms(kt[1]) > KREISEL_RMS_M) {
      const grenze = swR !== null ? Math.min(sw, swR) : sw
      let bogenG: [number, number, number, number, string] | null = null
      for (let o = SCHRITT; bisRing + o + KREISEL_LOKAL_M / 2 < grenze; o += SCHRITT) {
        const rO = kreisel.radiusAb(kt[1], kt[2], kt[3], o, KREISEL_LOKAL_M)
        const [swO, qO] = rO !== null ? sichtweiteKurve(rO) : [null, null]
        const noetig = swO === null ? null : Math.max(swO, Math.ceil(bisRing + o + KREISEL_LOKAL_M / 2))
        if (noetig !== null && noetig < (bogenG ? bogenG[0] : grenze)) bogenG = [noetig, rO!, o, swO!, qO!]
      }
      if (bogenG) {
        const [n_, rO, o, swO, qO] = bogenG
        swR = n_
        radiusG = radiusRunden(rO)
        radiusQG = `Kreiselring OSM lokal (Ringbogen ${o.toFixed(0)} m hinter dem Treffpunkt, ${KREISEL_LOKAL_M} m Ring, Ring unrund)`
        qR = swR > swO ? 'bis Ringbogen' : `Ringbogen R ${f1(radiusG)} m (${qO})`
        bisR = swR > swO ? [kt[0], o + KREISEL_LOKAL_M / 2, swO] : null
      }
    }
    if (swR !== null && swR < sw) {
      bis = bisR === null ? null : [bisR[0], bisR[1], bisR[2], sw, Math.ceil]
      sw = swR; gesamt = swR + h; swQuelle = qR!
    }
  }
  // Spur auf die Streifenmitte verschieben, glätten
  const verschiebung = sub(s.m, wegRoh[0])
  let rueckAb: number | null = null
  if (hatGerade && forts !== null && !forts.ring && zf.g !== null && netz && !netz.w(zf.g.wid).ow && netz.w(forts.wid).ow &&
    forts.wid !== zf.g.wid && su!.dist + forts.abK < gesamt) rueckAb = su!.dist + forts.abK
  const weg = glaetten(versetzen(wegRoh, verschiebung, rueckAb), GLAETTUNG_M)
  const abst: number[] = []
  for (let k = 0; k <= Math.floor(sw / SCHRITT); k++) abst.push(h + k * SCHRITT)
  abst.push(gesamt)
  const ref = refAuf(weg, abst, versatz)
  const abschnG = zf.g !== null && netz ? wegeAbschnitte(netz, wegRoh) : []
  const messIdx = abst.map((_, i) => i).filter(i => i < ref.length && knotenM.every(km => Math.abs(abst[i] - km) > KNOTEN_SPERRE))
  const messBr = messIdx.map(i => (abschnG.length ? hochBei(netz!, abschnG, abst[i]) : null))
  const messGut = messIdx.filter((_, x) => !messBr[x])
  const mess = messGut.map(i => ref[i])
  const fso: Fso | null = zf.g !== null && netz ? fahrstreifenOsm(netz, zf.g, zf.sd!, su, kbe, wegRoh, messIdx.map(i => abst[i]), art) : null
  const abzugHand = kx.vonHand?.abzug?.(fid, 'gerade', gradD) ?? null
  const abzugQ: AbzugQuelle | null = abzugHand ? () => abzugHand :
    netz ? abzugAusOsm(netz, punkteAufSpur(wegRoh, messGut.map(i => abst[i]))) : null
  const park = kx.hindernisse?.park ?? null, parkAlle = kx.hindernisse?.parkAlle ?? null
  let fs: Fs | null = fahrstreifenmitte(mess, art, fahrbahn, abzugQ, s.breite, null, null, !!abzugHand, park)
  if (messBr.some(x => x) && netz) {
    const widBr = messBr.find(x => x)!
    if (fs === null && ref.length && osmBreite(netz.w(widBr).t)[0] !== null) {
      fs = fahrbahnOsm(netz, widBr)
      const o0 = refAuf(wegRoh, [abst[0]], 0)
      const off = o0.length ? dot(sub(ref[0][0], o0[0][0]), ref[0][1]) : 0
      fs.lage -= off; fs.rechts -= off; fs.links += off
    }
  }
  let fsoLage: FsoLage | null = null, fsDv: number | null = null
  const rd = rechts(d)
  const rLat = ref.length ? s.rand.map(r_ => dot(sub(r_, ref[0][0]), rd)) : [0, 0]
  const arS = Math.max(...rLat), alS = -Math.min(...rLat)
  let lage: number, vomRand: number, je: number, ms: number, abR: number
  let lageAv: number, vomRandAv: number, jeAv: number, msAv: number
  if (art === 'beide' || art === 'einbahn') {
    let abL: number, randR: number, randL: number
    if (fs) {
      abR = Math.max(fs.parkR ? fs.abzugParkR : 0, fs.veloR)
      abL = Math.max(fs.parkL ? fs.abzugParkL : 0, fs.veloL)
      randR = Math.min(Math.max(fs.rechts, arS), arS + abR + RAND_TOL)
      randL = Math.min(Math.max(fs.links, alS), alS + abL + RAND_TOL)
    } else { abR = abL = 0; randR = arS; randL = alS }
    je = Math.max(randR + randL - abR - abL, 2.0) / (art === 'einbahn' ? 1 : 2)
    const schwelle = art === 'einbahn' ? MEHRSTREIFIG_EINBAHN : MEHRSTREIFIG_AB
    const fahrstreifen = je > schwelle ? FAHRSTREIFEN_MAX : je
    lage = randR - abR - fahrstreifen / 2
    vomRand = abR + fahrstreifen / 2
    ms = je > schwelle ? 1 : 0
    ;[lageAv, vomRandAv, jeAv, msAv] = [lage, vomRand, je, ms]
    if (fso) {
      fsoLage = fahrstreifenLage(fso, Math.max(randR + randL - abR - abL, 2.0), abR, randR, null,
        fs ? Math.max(fs.breite - abR - abL, 2.0) : null)
      if (fsoLage.gilt) {
        fsDv = fsoLage.vomRand - vomRand
        ;[lage, vomRand, je, ms] = [fsoLage.lage, fsoLage.vomRand, fsoLage.je, fsoLage.ms]
      }
    }
    if (fs) { fs.breite = randR + randL; fs.jeRichtung = je; fs.vomRand = vomRand; fs.mehrstreifig = ms }
  } else {
    const w = arS + alS
    abR = fs ? Math.max(fs.parkR ? fs.abzugParkR : 0, fs.veloR) : 0
    if (w - abR > MEHRSTREIFIG_AB) { lage = arS - abR - FAHRSTREIFEN_MAX / 2; vomRand = abR + FAHRSTREIFEN_MAX / 2; ms = 1 }
    else { lage = (arS - abR - alS) / 2; vomRand = abR + (w - abR) / 2; ms = 0 }
    je = w
    ;[lageAv, vomRandAv, jeAv, msAv] = [lage, vomRand, w, ms]
    if (fso) {
      fsoLage = fahrstreifenLage(fso, Math.max(w - abR, 0.5), abR, arS, fso.n, fs ? fs.jeRichtung : null)
      if (fsoLage.gilt) {
        fsDv = fsoLage.vomRand - vomRand
        ;[lage, vomRand, ms] = [fsoLage.lage, fsoLage.vomRand, fsoLage.ms]
      }
    }
    if (fs) { fs.vomRand = vomRand; fs.jeRichtung = w; fs.mehrstreifig = ms }
  }
  const [lageAb, vomRandAb] = fsDv === null || (su !== null && su.wege.includes(fso!.wid)) ? [lage, vomRand] : [lageAv, vomRandAv]
  // Netz-Hinweise und zu prüfende Arme
  const netzHinweis: string[] = []
  let arme: ArmInfo[] = []
  if (su !== null) netzHinweis.push(...su.gabeln.map(x => `gabel@${x.toFixed(1)}`))
  netzHinweis.push(...zf.hinweise)
  if (su !== null && netz) {
    if (su.hinweise.includes('einbahn_widerspruch') || sg!.endeGrund === 'einbahn_widerspruch') netzHinweis.push('einbahn_widerspruch')
    if (su.art === 'knoten' && su.dist <= h + 3) netzHinweis.push('knoten_am_streifen')
    if (kInSicht) arme.push(...kbe!.arme.filter(a => a.rolle !== 'gerade' && a.rolle !== 'gerade_verboten'))
    arme.push(...su.nebenarme.filter(na => na.dist - h < swEigen).map(na => netz.nebenarm(su!, na)))
    netzHinweis.push(...arme.filter(a => a.rolle === 'nebenast').map(a => `nebenast:${a.name || 'Weg ' + a.wid}`))
    if (kbe !== null && kbe.forts !== null) netzHinweis.push(...kbe.forts.hinweise)
  }
  if (fsoLage?.widerspruch) netzHinweis.push('fahrstreifen_widerspruch')
  if (fsoLage?.breit) netzHinweis.push('fahrstreifen_einspurig_breit')
  const fh = fsHinweis(fso, fsDv)
  if (fh) netzHinweis.push(...fh.split(';'))
  const kennungG = zf.g !== null ? kennungGerade(zf.g, zf.sd!) : `s${fid}:${gradD}`
  const mitKnoten = su !== null && su.art === 'knoten'
  let geradeEntfaellt = false
  let sichtpunkte: P[] = [], nVerschoben = 0
  let spurK: P[] | null = null
  const randInfo: RandInfo = {}
  let lageQuelle = fs ? 'AV' : 'Annahme'
  let r2 = false, r2Ende = 0, nKopf = 0
  if (!fs && hatGerade) annahmen.push('Fahrbahn entlang der Spur nicht gemessen: Lage aus den Bordkanten am Streifen')
  if (fs?.abzugQuelle) {
    const br = [fs.parkR || fs.parkL ? 'Parkstreifen 1,90 m' : '', fs.veloR > 0 || fs.veloL > 0 ? 'Velostreifen 1,50 m' : ''].filter(Boolean)
    annahmen.push(`Abzug: ${fs.abzugQuelle}${br.length ? ` (Breiten angenommen: ${br.join(', ')})` : ''}`)
  }
  if (hatGerade) {
    let quer_ab: number | null = null
    if (zf.g !== null && netz && netz.w(zf.g.wid).ow) {
      const zwei = su!.gabeln.filter((_, i) => !netz.w(su!.gabelWege[i]).ow)
      if (zwei.length) quer_ab = zwei[0]
      else if (forts !== null && !forts.ring && !netz.w(forts.wid).ow && netz.w(su!.ankunft![0]).ow) quer_ab = su!.dist + forts.abK
    }
    let refG = ref, vomRandG: number | number[] = vomRand
    if (quer_ab !== null && quer_ab < gesamt && netz) {
      const lagenZ: number[] = []
      for (let k = 0; k < 16; k++) lagenZ.push(quer_ab + VERSATZ_RUECK_M / 2 + 2 * k)
      const refZ = refAuf(weg, lagenZ, versatz)
      const zIdx = lagenZ.map((_, i) => i).filter(i => i < refZ.length &&
        knotenM.filter(km => Math.abs(km - quer_ab!) > 1.0).every(km => Math.abs(lagenZ[i] - km) > KNOTEN_SPERRE) &&
        !(abschnG.length && hochBei(netz, abschnG, lagenZ[i])))
      const messZ = zIdx.map(i => refZ[i])
      const fsoZ = fahrstreifenOsm(netz, zf.g, zf.sd!, su, kbe, wegRoh, lagenZ.filter((_, i) => i < refZ.length &&
        knotenM.filter(km => Math.abs(km - quer_ab!) > 1.0).every(km => Math.abs(lagenZ[i] - km) > KNOTEN_SPERRE)), 'beide')
      const fsZ = fahrstreifenmitte(messZ, 'beide', fahrbahn, abzugHand ? () => abzugHand :
        abzugAusOsm(netz, punkteAufSpur(wegRoh, zIdx.map(i => lagenZ[i]))), s.breite, fsoZ, null, !!abzugHand, park)
      let vomRandZwei: number | null = null
      if (fsZ && fsZ.osm) {
        if (fsZ.osm.widerspruch) netzHinweis.push('fahrstreifen_widerspruch')
        if (fsZ.osm.breit) netzHinweis.push('fahrstreifen_einspurig_breit')
        const dvZ = fahrstreifenUebernehmen(fsZ)
        const fhZ = fsHinweis(fsoZ, dvZ)
        if (fhZ) netzHinweis.push(...fhZ.split(';'))
      }
      if (fsZ) {
        vomRandZwei = fsZ.vomRand
        vomRandG = abst.map(a_ => vomRand + (vomRandZwei! - vomRand) * Math.min(1, Math.max(0, (a_ - quer_ab! + VERSATZ_RUECK_M / 2) / VERSATZ_RUECK_M)))
      }
      refG = querZweirichtig(fahrbahn, ref, abst, quer_ab, lage, vomRandZwei === null ? vomRand : vomRandZwei)[0]
    }
    // Brücken (BRUECKE_OSM) und Flächen ohne AV-Strasse (R2): OSM-Weg je Sichtpunkt aus der unverschobenen Spur. Auf einer Brücke
    // (bzw. am Brückenkopf im AV-Brückenumriss) weder AV-Messung noch Verschieben, Lage aus OSM; R2: liegt die Mitte der Spur an
    // mindestens R2_MIN_PUNKTE Sichtpunkten auf übriger befestigter Fläche ohne AV-Strasse daneben, gilt über die ganze Spur
    // die Lage aus der OSM-Linie (ausser ein Punkt läge dann in einem Gebäude)
    let fest = new Map<number, number | null>()
    if (zf.g !== null && netz && !kt && abschnG.length) {
      const nRef = refG.length
      const mitte = ref.map(([q, r]) => add(q, r, -versatz))
      const widK = abst.slice(0, nRef).map(a_ => wegBei(abschnG, a_))
      const hochK: (number | null)[] = abst.slice(0, nRef).map(a_ => hochBei(netz, abschnG, a_))
      const bu = kx.brueckenumriss ?? null
      if (bu && hochK.some(x => x)) {
        for (const folge of [Array.from({ length: nRef }, (_, i) => i), Array.from({ length: nRef }, (_, i) => nRef - 1 - i)]) {
          let vor: number | null = null
          for (const k of folge) {
            const p_ = add(refG[k][0], refG[k][1], lage)
            if (hochK[k]) vor = hochK[k]
            else if (vor !== null && bu.enthaelt(p_) && !fahrbahn.enthaelt(p_)) { hochK[k] = widK[k] = vor; nKopf++ }
            else vor = null
          }
        }
      }
      const osmK = refAuf(wegRoh, abst, 0)
      const latOsm = (k: number, ersatz: number | null, linie: [P, P][] | null = null): number | null => {
        const li = linie ?? mitte.map((m_, i) => [m_, ref[i][1]] as [P, P])
        const l_ = widK[k] !== null ? lageOsm(netz, widK[k]!, ersatz)[0] : ersatz
        if (l_ === null || k >= Math.min(li.length, nRef)) return null
        const p_ = add(li[k][0], li[k][1], l_)
        return dot(sub(p_, refG[k][0]), refG[k][1])
      }
      for (let k = 0; k < nRef; k++) if (hochK[k]) fest.set(k, latOsm(k, null, osmK))
      const fl = kx.flaechenR2 ?? null
      if (fl) {
        const r2K = Array.from({ length: nRef }, (_, k) => k).filter(k => !hochK[k] && widK[k] !== null &&
          !fahrbahn.enthaelt(mitte[k]) && R2_FLAECHEN.includes(fl.art(mitte[k]) ?? '') &&
          aufFahrbahnNaechst(fahrbahn, mitte[k], 0, R2_NAH_M) === mitte[k])
        if (r2K.length >= R2_MIN_PUNKTE) {
          const festR2 = new Map<number, number | null>()
          for (let k = 0; k < nRef; k++) festR2.set(k, latOsm(k, lage + versatz))
          const arten = [...festR2].map(([k, v]) => (v !== null ? fl.art(add(refG[k][0], refG[k][1], v)) : null))
          r2Ende = arten.length
          while (r2Ende > 1 && arten[r2Ende - 1] === 'Gebaeude') r2Ende--
          if (!arten.slice(0, r2Ende).some(a_ => a_ === 'Gebaeude')) { fest = festR2; r2 = true }
        }
      }
    }
    const naseP: [ParkRaster, number] | null = fs && fs.parkR && park ? [park, abR] : null
    ;[sichtpunkte, nVerschoben] = amRandHalten(fahrbahn, refG, lage, vomRandG, 3.0, randInfo, zf.g !== null, ref, fest, naseP)
    // FS_OSM_INSEL_RUECKFALL
    const inselNah = (pts: P[]) => pts.slice(1).filter(p => inseln.an(p, FS_OSM_INSEL_M)).length
    if (fsDv !== null && !kt && refG === ref && !Array.isArray(vomRandG) && (nVerschoben || inselNah(sichtpunkte))) {
      const infoAv: RandInfo = {}
      const [spAv, nAv] = amRandHalten(fahrbahn, ref, lageAv, vomRandAv, 3.0, infoAv, zf.g !== null, ref, fest, naseP)
      const a1 = [nAv, inselNah(spAv)], b1 = [nVerschoben, inselNah(sichtpunkte)]
      if (a1[0] < b1[0] || (a1[0] === b1[0] && a1[1] < b1[1])) {
        sichtpunkte = spAv; nVerschoben = nAv
        lage = lageAv; vomRand = vomRandAv; fsDv = null
        if (fs) { fs.vomRand = vomRandAv; fs.jeRichtung = jeAv; fs.mehrstreifig = msAv }
        netzHinweis.push('fahrstreifen_osm_insel')
        for (let i = netzHinweis.length - 1; i >= 0; i--)
          if (netzHinweis[i].startsWith('fahrstreifen_osm:') || netzHinweis[i] === 'busstreifen') netzHinweis.splice(i, 1)
      }
    }
    if (fest.size && !r2) { netzHinweis.push('bruecke'); lageQuelle = fs?.quelle === 'OSM' ? 'OSM' : lageQuelle }
    if (nKopf) annahmen.push(`${nKopf} Sichtpunkte am Brückenkopf (AV-Brückenumriss) mit der Lage aus OSM`)
    if (r2 && kx.flaechenR2) {
      // R2: die Fläche gilt als Fahrbahn; Punkte daneben kommen auf die nächste Fahrbahn bzw. Fläche (Spurende im Gebäude bleibt)
      const fl = kx.flaechenR2
      const fbR2 = { enthaelt: (q: P) => fahrbahn.enthaelt(q) || R2_FLAECHEN.includes(fl.art(q) ?? '') }
      const neu = sichtpunkte.map((p, k) => (k >= r2Ende || fbR2.enthaelt(p) ? p : aufFahrbahnNaechst(fbR2, p)))
      const vers = neu.filter((p, k) => p !== sichtpunkte[k]).length
      if (vers) { sichtpunkte = neu; nVerschoben = vers }
      lageQuelle = 'OSM'
      netzHinweis.push('ohne_av_strasse')
      annahmen.push('Spur über übrige befestigte Fläche ohne AV-Strasse (R2): Lage aus der OSM-Linie')
    }
    // Kreisel-Ausfahrt: Spur bis vor den Ring, im Bogen auf den Ring, dann dem Ring entgegen der Fahrtrichtung
    if (kt) {
      const dk = Math.max(kt[0], h)
      const ring = kreisel.rueckwaerts(kt[1], kt[2], kt[3], gesamt - dk + KREISEL_BOGEN_M + 5)
      const vorK = Math.max(h, dk - KREISEL_BOGEN_M)
      const ab1: number[] = []
      for (let i = 0; i <= Math.floor(vorK); i++) ab1.push(i)
      ab1.push(vorK)
      const spurA = refAuf(weg, ab1, versatz).map(([q, r]) => add(q, r, lage))
      const ab2: number[] = []
      for (let i = 0; i < Math.floor(streckeLaenge(ring) - KREISEL_BOGEN_M); i++) ab2.push(KREISEL_BOGEN_M + i)
      const ringB = punkteAufSpur(ring, ab2).map(x => x[0])
      if (spurA.length && ringB.length >= 2) {
        const kontroll = ring[0], p0 = spurA[spurA.length - 1], p2 = ringB[0]
        const bogen: P[] = []
        for (let i = 1; i < 10; i++) {
          const t = i / 10
          bogen.push([(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * kontroll[0] + t * t * p2[0],
            (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * kontroll[1] + t * t * p2[1]])
        }
        let linie = [...spurA, ...bogen, ...ringB]
        linie = linie.filter((p, i) => i === 0 || dist(p, linie[i - 1]) > 0.01)
        const rohK = punkteAufSpur(linie, abst).map(x => x[0])
        spurK = linie
        sichtpunkte = rohK.map(q => aufFahrbahnNaechst(fahrbahn, q))
        nVerschoben = rohK.filter((a_, i) => a_[0] !== sichtpunkte[i][0] || a_[1] !== sichtpunkte[i][1]).length
        hinweis = 'kreisel'; hinweisM = dk
      }
    }
    if (zf.g === null) hinweis = 'ohne_osm', hinweisM = null
    if (zf.g === null && !(kreiselPruefen && achseFb)) {
      const pr = punkteAufSpur(weg, Array.from({ length: Math.floor(SPUR_PRUEF_M / 2) }, (_, i) => h + 2 * (i + 1)))
      const auf = pr.filter(([q]) => fahrbahn.enthaelt(q)).length
      const neben = sichtpunkte.filter(p => !fahrbahn.enthaelt(p)).length
      if (neben || (!kreiselPruefen && (!pr.length || auf < SPUR_AUF_FAHRBAHN * pr.length))) {
        entf.push(entfallen(fid, 'gerade', gradD, String(gradD), 'geometrie',
          (kreiselPruefen ? `Rückfall, OSM-Achse ${zf.name} neben der Fahrbahn` : 'Rückfall ohne OSM-Achse: gerade Linie') + `, ${neben} Sichtpunkte neben der Fahrbahn, ${auf} von ${pr.length} Prüfpunkten der ersten ${SPUR_PRUEF_M} m auf ihr`,
          null, null, kennungG))
        return { ergebnisse, entfallen: entf }
      }
    }
    // Spurende im Gebäude
    if (!kt && sichtpunkte.length > 1) {
      let k_ = sichtpunkte.length
      while (k_ > 1 && !fahrbahn.enthaelt(sichtpunkte[k_ - 1]) && gebaeude.enthaelt(sichtpunkte[k_ - 1])) k_--
      const durchfahrt = k_ === 1 && !fahrbahn.enthaelt(sichtpunkte[0]) && gebaeude.enthaelt(sichtpunkte[0])
      if (k_ < sichtpunkte.length && !durchfahrt) {
        const swGeb = Math.round(abst[k_ - 1] - h)
        if (swGeb < SPUR_MIN_M) {
          geradeEntfaellt = true
          entf.push(entfallen(fid, 'gerade', gradD, String(gradD), 'wegende',
            `Spur endet nach ${swGeb} m an einem Gebäude (Sichtpunkte dahinter im Gebäude)`, zf.g?.wid ?? null,
            mitKnoten ? su!.K : null, kennungG))
        } else {
          sichtpunkte = sichtpunkte.slice(0, k_)
          nVerschoben = (randInfo.verschoben ?? []).slice(0, k_).filter(x => x).length
          bis = [abst[k_ - 1], 0, 1, sw, Math.round]
          sw = swGeb; gesamt = swGeb + h; swQuelle = 'bis Gebäude'
          if (['', 'knoten', 'spur_ende'].includes(hinweis)) { hinweis = 'spur_ende'; hinweisM = gesamt }
        }
      }
    }
  }
  // Sichtpunkte ab dem Rand am Umriss (Auftrag 2)
  const swAlt = sw
  const abstSp = abst.slice(0, sichtpunkte.length)
  const swBeiG = (h_: number) => {
    if (bis === null) return sw
    const [x_, zuschlag, unten, oben, rund] = bis
    return Math.min(oben, Math.max(Math.trunc(rund(Math.max(x_ - h_, 0) + zuschlag)), unten))
  }
  const spurG = (a_: number): P | null => {
    if (spurK !== null) { const x = punkteAufSpur(spurK, [a_]); return x.length ? x[0][0] : null }
    const k_ = a_ < abstSp[0] ? 0 : sichtpunkte.length - 1
    const w0 = refAuf(weg, [abstSp[k_]], 0), wa = refAuf(weg, [a_], 0)
    if (!w0.length || !wa.length) return null
    const [[q0, r0_], [qa, ra]] = [w0[0], wa[0]]
    return add(qa, ra, dot(sub(sichtpunkte[k_], q0), r0_))
  }
  if (hatGerade && !geradeEntfaellt && sichtpunkte.length >= 2) {
    const aufG = (q: P) => fahrbahn.enthaelt(q) || (r2 && R2_FLAECHEN.includes(kx.flaechenR2?.art(q) ?? ''))
    const [hRoh] = randAmUmriss(s, sichtpunkte, abstSp, d, versatz + lage, hAlt)
    let hRand = hRoh
    if (hRand !== hAlt) hRand = randWaehlen(hRoh, hAlt, sichtpunkte, abstSp, swBeiG, spurG, aufG, umrissRing(s), park)[0]
    if (hRand !== hAlt) {
      const endeAlt: [P, P] = [sichtpunkte[0], sichtpunkte[sichtpunkte.length - 1]]
      sw = swBeiG(hRand)
      ;[sichtpunkte] = umsetzen(sichtpunkte, abstSp, hRand, sw + hRand, spurG)
      gesamt = sw + hRand
      endpunkteMangel(endeAlt, [sichtpunkte[0], sichtpunkte[sichtpunkte.length - 1]], aufG, park)
    }
  }
  if (hatGerade && !geradeEntfaellt && parkAlle && !parkAlle.leer) {
    // B1 Abstand zu Parkfeldern (PARK_ABSTAND): Punkte neben der Fahrbahn (Brücke) bleiben
    const aufP = (q: P) => fahrbahn.enthaelt(q) || (r2 && R2_FLAECHEN.includes(kx.flaechenR2?.art(q) ?? ''))
    const festP = new Set(sichtpunkte.map((q, k) => (aufP(q) ? -1 : k)).filter(k => k >= 0))
    const [neu, info] = abstandHalten(sichtpunkte, aufP, parkAlle, fahrbahn, festP)
    sichtpunkte = neu
    if (info && info.n) annahmen.push(`${info.n} Sichtpunkte für 1,5 m Abstand zu Parkfeldern verschoben (bis ${info.max.toFixed(1).replace('.', ',')} m)`)
  }
  // Spur von Hand (SPUR_HAND): A versetzt die berechneten Punkte, B nimmt die gezeichnete Linie
  const spurH = hatGerade && !geradeEntfaellt ? kx.vonHand?.spur?.(fid, kennungG) ?? null : null
  if (spurH && (spurH.art === 'B' || sichtpunkte.length >= 2)) {
    sichtpunkte = spurH.art === 'A' ? spurVersetzen(sichtpunkte, spurH.a, spurH.b) : liniePunkte(spurH.linie, sw)[0]
    lageQuelle = 'Hand'
    netzHinweis.push('spur_hand')
  }
  const geradeGestrichen = hatGerade && !geradeEntfaellt && !!kx.vonHand?.streichen?.(fid, kennungG)
  if (geradeGestrichen) {
    entf.push(entfallen(fid, 'gerade', gradD, String(gradD), 'hand', 'von Hand gestrichen', zf.g?.wid ?? null,
      mitKnoten ? su!.K : null, kennungG))
  } else if (hatGerade && !geradeEntfaellt) {
    const feld = sf(sichtpunkte)
    const konflikte = kf(feld, sichtpunkte)
    ergebnisse.push({
      fgsId: fid, zufahrt: schluessel([...bisher, ...ergebnisse], art, gradD), kennung: kennungG, richtung: gradD, art,
      strasse: zf.name || null, ueberStrasse: null, knotenM: null, tempo, tempoQuelle: tempoQ, sichtweite: sw,
      sichtweiteQuelle: swQuelle, kurvenradiusM: radiusG, radiusQuelle: radiusQG,
      ...konfliktFelder(konflikte), konflikte,
      spurHinweis: hinweis, spurHinweisM: hinweisM === null ? null : Math.round(Math.max(0, hinweisM - h) * 10) / 10,
      fahrbahnM: fs ? Math.round(fs.breite * 100) / 100 : null, parkRechts: fs ? fs.parkR : null, parkLinks: fs ? fs.parkL : null,
      velostreifenRechtsM: fs ? fs.veloR : null, velostreifenLinksM: fs ? fs.veloL : null, abzugQuelle: fs?.abzugQuelle ?? null, abzugRechtsM: fs ? Math.max(fs.parkR ? fs.abzugParkR : 0, fs.veloR) : null,
      fahrstreifenM: fs ? Math.round(fs.jeRichtung * 100) / 100 : null, mehrstreifig: fs ? fs.mehrstreifig : null,
      sichtpunktVomRandM: fs ? Math.round(fs.vomRand * 100) / 100 : null, lageQuelle, randQuelle: s.randQuelle,
      einbahnQuelle: zf.einbahnQuelle, netzQuelle: zf.netzQuelle, osmWeg: zf.g ? String(zf.g.wid) : null,
      osmKnoten: mitKnoten ? String(su!.K) : null, ersterKnotenM: mitKnoten ? Math.round((su!.dist - h) * 10) / 10 : null,
      netzHinweis: [...new Set(netzHinweis)], punkteVerschoben: nVerschoben, sichtpunkte, feld, spur: weg, annahmen,
    })
  } else if (!hatGerade) {
    const ende = sg !== null && sg.endeM !== null ? `Spur endet nach ${sg.endeM.toFixed(1)} m (${sg.endeGrund})` : ''
    let quelleG: string
    if (kInSicht && forts === null) quelleG = `erster Knoten ${su!.K} nach ${su!.dist.toFixed(1)} m ohne Fortsetzung`
    else if (kInSicht && fortsService) quelleG = `erster Knoten ${su!.K} nach ${su!.dist.toFixed(1)} m, Fortsetzung nur service (Weg ${forts!.wid})`
    else if (kbe !== null && kbe.forts !== null && kbe.forts.rolle === 'gerade_verboten') quelleG = kbe.forts.grund
    else quelleG = ende
    entf.push(entfallen(fid, 'gerade', gradD, String(gradD), grundGerade ?? '', quelleG, zf.g?.wid ?? null,
      mitKnoten ? su!.K : null, kennungG))
  }
  // ---- abbiegende Zufahrten
  if (su !== null && netz) {
    const kontext: AbbiegeKontext = {
      vonHand: kx.vonHand, hindernisse: kx.hindernisse ?? null, brueckenumriss: kx.brueckenumriss ?? null,
      flaechenR2: kx.flaechenR2 ?? null, netz, fahrbahn, inseln, kreisel, s, zf, su, kbe, d, h, hAlt, hatGerade, geradeEntfaellt, geradeGestrichen, swAlt, swEigen, tempo,
      swQuelle, fs, lageAb, vomRandAb, versatz, arS, alS, rd, art, verschiebung, refDa: ref.length > 0, streifenPoly,
      sichtfeld: sf, konflikte: kf,
      basisErgebnis: () => ({ randQuelle: s.randQuelle, netzQuelle: zf.netzQuelle }),
    }
    for (const a of [...arme].sort((x, y) => x.dj - y.dj || richtungGrad(x.fahrt) - richtungGrad(y.fahrt))) {
      const r = abbiegeZufahrt(kontext, a)
      if ('fgsId' in r && 'zufahrt' in r && 'sichtpunkte' in r) {
        r.zufahrt = schluessel([...bisher, ...ergebnisse], 'abbiegend', r.richtung)
        ergebnisse.push(r)
      } else entf.push(r as Entfallen)
    }
  }
  return { ergebnisse, entfallen: entf }
}
