// ── Knoten, Arme und vortrittsberechtigte Strasse (E0) ──
//
// Knoten = OSM-Knoten mit drei und mehr Strassenarmen (Wege der Klassen MFZ_HW ohne service, ohne Fahrverbot, wie das
// Knotennetz des fgsCheck: Weg.strasse). Ein Weg, der durch den Knoten läuft, gibt zwei Arme, ein Weg, der dort beginnt oder
// endet, einen.
// Vortrittsberechtigte Strasse in E0 (ohne Signalisation aus OSM): die beiden Arme desselben OSM-Wegs, sonst zwei Arme mit
// gleichem Namen, sonst die höhere highway-Klasse; unter mehreren Paaren die höhere Klasse, dann das gestreckteste. Die Zufahrt wählt der Nutzer;
// gehört sie zur Vortrittsstrasse, bilden die übrigen Arme die Vortrittsstrasse (mit Hinweis). Die Vortrittsregelung ist in
// E0 fest «Vortritt»; OSM highway=stop/give_way erscheinen nur als Hinweis.

import { type P, add, dist, dot, wgs, winkelGrad, abstandStrecke, drehung, kreuz, neg, wdiff } from '../geo'
import { type OsmNetz, type Arm, MFZ_HW } from './netz'
import type { OsmDaten } from '../daten/osm'
import type { ArmInfo, KnotenInfo, VortrittsHinweis } from './typen'

/** Rang der Strassenklassen (klein = höher), wie HW_RANG in rechner/netz.ts */
export const HW_RANG: Record<string, number> = { motorway: 0, motorway_link: 0, trunk: 1, trunk_link: 1, primary: 2, primary_link: 2,
  secondary: 3, secondary_link: 3, tertiary: 4, tertiary_link: 4, unclassified: 5, residential: 6, road: 6, living_street: 7 }
/** Vortrittssignale (OSM) bis zu diesem Abstand vom Knoten bzw. von der Zufahrt als Hinweis */
const SIGNAL_KNOTEN_M = 30
const SIGNAL_ARM_M = 4

export const armKey = (a: Arm): string => `${a[0]}:${a[1]}:${a[2]}`

const HIMMEL = ['Ost', 'Nordost', 'Nord', 'Nordwest', 'West', 'Südwest', 'Süd', 'Südost']
/** Himmelsrichtung eines Vektors (LV95: x Ost, y Nord) */
export const himmelsrichtung = (v: P): string => HIMMEL[Math.round(winkelGrad(v) / 45) % 8]

/** Strassenarme am Knoten n (MFZ_HW ohne service, Weg.strasse) */
export function strassenArme(netz: OsmNetz, n: number): Arm[] {
  return netz.arme(n).filter(a => { const w = netz.w(a[0]); return w.strasse && MFZ_HW.has(w.hw) })
}

/** Art eines Punkts mit Strassenarmen (Korrektur 31.10.2026, Punkte 12, 16 und 17): «kein» unter drei Strassenarmen; «kreisel», wenn ein
 *  Weg mit junction=roundabout bzw. circular am Punkt hängt (nicht Gegenstand der App, VSS 40 273 Ziffer 1); «gabelung», wenn höchstens
 *  ein Arm zum Punkt führt (Motorfahrzeuge bzw. Velos gegen die Einbahn): kein wartepflichtiger Verkehr; «fahrbahnteilung», wenn sich
 *  die Fahrbahn in zwei Einbahnen teilt, ohne dass sich die Fahrströme kreuzen (fahrbahnteilung); sonst «knoten» */
export type KnotenArt = 'knoten' | 'gabelung' | 'kreisel' | 'fahrbahnteilung' | 'zusammenfuehrung' | 'kein'
export function knotenArt(netz: OsmNetz, n: number): KnotenArt {
  const arme = strassenArme(netz, n)
  if (arme.length < 3) return 'kein'
  if (netz.arme(n).some(a => netz.w(a[0]).ring)) return 'kreisel'
  if (arme.filter(a => netz.zufluss(a) || netz.veloZufluss(a)[0]).length <= 1) return 'gabelung'
  if (fahrbahnteilung(netz, n)) return 'fahrbahnteilung'
  if (zusammenfuehrung(netz, n)) return 'zusammenfuehrung'
  return 'knoten'
}
/** Meldungen statt einer Rechnung (Korrektur 31.10.2026, Punkte 12, 16 und 17) */
export const GABELUNG_TEXT = 'Gabelung: höchstens ein Arm führt zum Knoten, kein Vortrittsfall'
export const KREISEL_TEXT = 'Kreisverkehr: nicht Gegenstand der App (VSS 40 273 Ziffer 1, S. 4; siehe VSS 40 263)'
export const FAHRBAHNTEILUNG_TEXT = 'Fahrbahnteilung: Hier teilt sich die Fahrbahn in zwei Einbahnen, die Fahrströme kreuzen sich nicht; ' +
  'kein Vortrittsfall'
/** Zusammenführung (Nutzer 31.10.2026, Punkt 22, vorerst Meldung statt Rechnung; die Variante «erkennen und richtig rechnen» ist für
 *  später festgehalten, Korrekturliste Punkt 22) */
export const ZUSAMMENFUEHRUNG_TEXT = 'Zusammenführung: Hier laufen zwei Einbahnen spitz zusammen, der Verkehr fädelt ein. Solche ' +
  'Stellen rechnet die App nicht; prüfe das Einfädeln vor Ort (VSS 40 273 Ziffer 10, S. 7)'
/** Zusatz, wenn eine der beiden Einbahnen bald in einen Kreisel führt (TEILUNG_KREISEL_M) */
export const TEILUNG_KREISEL_TEXT = 'Teil der Zufahrt zum Kreisverkehr (siehe VSS 40 263)'

/** Annahme (Entscheid 31.10.2026, Punkt 17): die beiden Einbahnen einer Fahrbahnteilung liegen höchstens so weit auseinander (Richtung
 *  der Arme ab dem Punkt). Der Wechsel von der einen in die andere ist dann eine Wende von mindestens 180° minus diesem Winkel, also
 *  keine Fahrbeziehung; bei grösserem Winkel (z. B. Einbahn um die Ecke, durchgehende Einbahn) bleibt es ein Knoten */
export const TEILUNG_WINKEL_GRAD = 60
/** Annahme (Entscheid 31.10.2026, Punkt 17): führt eine der beiden Einbahnen innert dieser Strecke ab dem Punkt in einen Kreisel
 *  (junction=roundabout bzw. circular), gehört die Fahrbahnteilung zur Zufahrt des Kreisverkehrs (Zusatz zur Meldung) */
export const TEILUNG_KREISEL_M = 60

/**
 * Einbahnteilung (Befund 31.10.2026, Knoten 282773328): genau drei Strassenarme, einer mit beiden Richtungen (beide), einer als Einbahn
 * zum Punkt (zu) und einer als Einbahn vom Punkt weg (weg); die beiden Einbahnen höchstens TEILUNG_WINKEL_GRAD auseinander und vor dem
 * Arm mit beiden Richtungen. Nur die Geometrie, gleich auf welcher Seite die Einbahnen liegen und ob Velos gegen eine Einbahn fahren:
 * Grundlage der Fahrbahnteilung (fahrbahnteilung) und der Fahrlinie eines Arms, der sich teilt (der Verkehr zum Knoten kommt über die
 * zuführende Einbahn, teilungsFortsetzung). -> die drei Arme bzw. null
 */
export function einbahnTeilung(netz: OsmNetz, n: number): { beide: Arm; zu: Arm; weg: Arm } | null {
  const arme = strassenArme(netz, n)
  if (arme.length !== 3) return null
  const beide = arme.filter(a => netz.w(a[0]).ow === 0)
  const zu = arme.filter(a => netz.w(a[0]).ow !== 0 && netz.zufluss(a))
  const weg = arme.filter(a => !netz.zufluss(a))
  if (beide.length !== 1 || zu.length !== 1 || weg.length !== 1) return null
  const rZu = netz.armRichtung(zu[0]), rWeg = netz.armRichtung(weg[0]), f = neg(netz.armRichtung(beide[0]))
  if (wdiff(rZu, rWeg) > TEILUNG_WINKEL_GRAD || Math.abs(drehung(f, rZu)) >= 90 || Math.abs(drehung(f, rWeg)) >= 90) return null
  return { beide: beide[0], zu: zu[0], weg: weg[0] }
}

/**
 * Fahrbahnteilung (Korrektur 31.10.2026, Punkt 17): Einbahnteilung (einbahnTeilung), bei der von dem Arm mit beiden Richtungen her
 * gesehen die wegführende Einbahn rechts der zuführenden liegt (Rechtsverkehr: so kreuzen sich die Ströme nicht; spiegelverkehrt
 * kreuzen sie sich, das bleibt ein Knoten). Velos gegen die Einbahn: fahren auf der wegführenden Einbahn Velos zum Punkt
 * (veloZufluss), münden sie in den Strom aus der zuführenden Einbahn ein; das ist ein Vortrittsfall, es bleibt ein Knoten.
 * Velos gegen die zuführende Einbahn fahren vom Punkt weg wie auf einer Strasse mit Gegenverkehr und kreuzen keinen Strom; sie ändern
 * nichts. -> die beiden Einbahnen bzw. null
 */
export function fahrbahnteilung(netz: OsmNetz, n: number): { zu: Arm; weg: Arm } | null {
  const t = einbahnTeilung(netz, n)
  if (!t || netz.veloZufluss(t.weg)[0]) return null
  // wegführende Einbahn im Uhrzeigersinn (rechts) von der zuführenden
  return kreuz(netz.armRichtung(t.zu), netz.armRichtung(t.weg)) < 0 ? { zu: t.zu, weg: t.weg } : null
}

/**
 * Zusammenführung (Nutzer 31.10.2026, Punkt 22, Knoten 31413260): genau drei Strassenarme, zwei Einbahnen zum Punkt und eine Einbahn
 * vom Punkt weg (ohne Velos gegen die Einbahn); die beiden zuführenden höchstens TEILUNG_WINKEL_GRAD auseinander und beide gegenüber der
 * wegführenden (der Verkehr fährt geradeaus weiter und fädelt ein). Ein spitzer Winkel trennt sie vom Knoten, an dem eine Einbahn
 * quer in eine andere mündet. -> die beiden zuführenden Arme bzw. null
 */
export function zusammenfuehrung(netz: OsmNetz, n: number): [Arm, Arm] | null {
  const arme = strassenArme(netz, n)
  if (arme.length !== 3) return null
  const zu = arme.filter(a => netz.w(a[0]).ow !== 0 && netz.zufluss(a))
  const weg = arme.filter(a => netz.w(a[0]).ow !== 0 && !netz.zufluss(a) && !netz.veloZufluss(a)[0])
  if (zu.length !== 2 || weg.length !== 1) return null
  const r1 = netz.armRichtung(zu[0]), r2 = netz.armRichtung(zu[1]), f = neg(netz.armRichtung(weg[0]))
  if (wdiff(r1, r2) > TEILUNG_WINKEL_GRAD || Math.abs(drehung(f, r1)) >= 90 || Math.abs(drehung(f, r2)) >= 90) return null
  return [zu[0], zu[1]]
}

/** Fortsetzung der Fahrlinie eines Arms an einer Einbahnteilung (Befund 31.10.2026, Knoten 282773328): endet der Weg wid (mit beiden
 *  Richtungen) am Punkt n, an dem sich die Fahrbahn in zwei Einbahnen teilt, kommt der Verkehr zum Knoten über die zuführende Einbahn:
 *  ihr Weg (seite 'zu'; 'weg': der Weg der wegführenden Einbahn, für die Seite des Verkehrs vom Knoten weg); sonst null. Für
 *  OsmAchsen.spurMitEnde (vorzug) */
export function teilungsFortsetzung(netz: OsmNetz, seite: 'zu' | 'weg' = 'zu'): (n: number, wid: number) => number | null {
  let je = FORTSETZUNG.get(netz)
  if (!je) {
    const cache = new Map<number, ReturnType<typeof einbahnTeilung>>()
    const teilung = (n: number) => {
      if (!cache.has(n)) cache.set(n, netz.P.has(n) ? einbahnTeilung(netz, n) : null)
      return cache.get(n)!
    }
    je = {
      zu: (n, wid) => { const t = teilung(n); return t && t.beide[0] === wid ? t.zu[0] : null },
      weg: (n, wid) => { const t = teilung(n); return t && t.beide[0] === wid ? t.weg[0] : null },
    }
    FORTSETZUNG.set(netz, je)
  }
  return je[seite]
}
const FORTSETZUNG = new WeakMap<OsmNetz, Record<'zu' | 'weg', (n: number, wid: number) => number | null>>()

/** Führt der Arm innert laenge ab dem Punkt in einen Kreisel? Entlang des Wegs und über Wegenden mit genau einem weiteren Strassenweg */
function fuehrtInKreisel(netz: OsmNetz, arm: Arm, laenge: number): boolean {
  let [wid, i, sd] = arm
  const besucht = new Set([wid])
  let p = netz.p(netz.w(wid).nds[i]), s = 0
  for (;;) {
    const nds = netz.w(wid).nds
    const j = i + sd
    if (j < 0 || j >= nds.length) {
      const weiter = strassenArme(netz, nds[i]).filter(a => !besucht.has(a[0]))
      if (weiter.length !== 1) return false
      ;[wid, i, sd] = weiter[0]
      besucht.add(wid)
      continue
    }
    const q = netz.p(nds[j])
    s += dist(p, q)
    if (s > laenge) return false
    if ((netz.an.get(nds[j]) ?? []).some(([w]) => netz.w(w).ring)) return true
    p = q; i = j
  }
}

/** Meldung zur Fahrbahnteilung am Punkt n (mit dem Zusatz zum Kreisel, wenn eine der Einbahnen bald in einen Kreisel führt) */
export function fahrbahnteilungText(netz: OsmNetz, n: number): string {
  const t = fahrbahnteilung(netz, n)
  return t && [t.zu, t.weg].some(a => fuehrtInKreisel(netz, a, TEILUNG_KREISEL_M)) ? `${FAHRBAHNTEILUNG_TEXT}; ${TEILUNG_KREISEL_TEXT}` :
    FAHRBAHNTEILUNG_TEXT
}

export const istKnoten = (netz: OsmNetz, n: number): boolean => knotenArt(netz, n) === 'knoten'

/** alle Knoten im Netz (für Tests und die Anzeige nach dem Klick); ohne Gabelungen, Kreisel und Fahrbahnteilungen */
export function knotenFinden(netz: OsmNetz): number[] {
  return [...netz.an.keys()].filter(n => istKnoten(netz, n)).sort((a, b) => a - b)
}
/** Punkte mit drei und mehr Strassenarmen, die keine Knoten der App sind (Gabelungen, Kreisel, Fahrbahnteilungen): die Knotensuche
 *  blendet sie aus */
export function keineKnoten(netz: OsmNetz): number[] {
  return [...netz.an.keys()].filter(n => { const k = knotenArt(netz, n); return k === 'gabelung' || k === 'kreisel' || k === 'fahrbahnteilung' || k === 'zusammenfuehrung' })
    .sort((a, b) => a - b)
}

/** Annahme (Korrektur 31.10.2026, Punkt 13): Lichtsignal (OSM highway=traffic_signals) bis so weit vom Knoten auf einem Arm (höchstens
 *  SIGNAL_ARM_M neben dem Arm) bzw. am Knotenpunkt (LSA_PUNKT_M): der Knoten gilt als LSA-Knoten */
export const LSA_ARM_M = 30
const LSA_PUNKT_M = 3
/** Lichtsignal am Knoten n bzw. auf einem seiner Strassenarme? ampeln: Lage der Lichtsignale (LV95) */
export function istLsaKnoten(netz: OsmNetz, n: number, ampeln: P[]): boolean {
  if (!ampeln.length || !netz.P.has(n)) return false
  const kp = netz.p(n)
  const nah = ampeln.filter(p => dist(p, kp) <= LSA_ARM_M + SIGNAL_ARM_M)
  if (!nah.length) return false
  if (nah.some(p => dist(p, kp) <= LSA_PUNKT_M)) return true
  return strassenArme(netz, n).some(a => {
    const linie = netz.armLinie(a, LSA_ARM_M)
    return nah.some(p => linie.slice(0, -1).some((q, k) => abstandStrecke(p, q, linie[k + 1]) <= SIGNAL_ARM_M))
  })
}
/** Lage der Lichtsignale aus den OSM-Daten (LV95) */
export const ampelPunkte = (osm: OsmDaten | null, lv: (lat: number, lon: number) => P): P[] =>
  (osm?.ampeln ?? []).map(k => lv(k.lat, k.lon))

/** Grundstückzufahrt: Nummer statt einer Zahl */
export const NR_GRUNDSTUECK = 'Z'
/** Azimut [°] im Uhrzeigersinn ab Norden; bis 1° westlich von Nord zählt als Nord (Sehne knapp neben der Nordrichtung) */
const azimut = (v: P): number => { const a = (450 - winkelGrad(v)) % 360; return a > 359 ? a - 360 : a }
/** Arme nummerieren: im Uhrzeigersinn ab Norden 1, 2, 3 …, fest je Knoten (unabhängig von der Zufahrt) */
export function nummerieren(arme: ArmInfo[]): ArmInfo[] {
  const folge = [...arme].sort((a, b) => azimut(a.richtung) - azimut(b.richtung) || (a.key < b.key ? -1 : 1))
  return arme.map(a => ({ ...a, nr: String(folge.indexOf(a) + 1) }))
}
/** Arme in der Reihenfolge ihrer Nummern (Anzeige; Z zuletzt) */
export const nachNr = <T extends Pick<ArmInfo, 'nr'>>(arme: T[]): T[] =>
  [...arme].sort((a, b) => a.nr.localeCompare(b.nr, 'de', { numeric: true }))
/** Anzeigename eines Arms überall (Karte, Panel, Bericht, Texte der Rechnung): «1 Jolimontstrasse (Nordwest)» */
export const armText = (a: Pick<ArmInfo, 'nr' | 'name' | 'hw' | 'himmel'>): string =>
  `${a.nr ? `${a.nr} ` : ''}${a.name || a.hw}${a.himmel ? ` (${a.himmel})` : ''}`

/** Nummernschild eines Arms (Karte, Kartenbild im Bericht): so weit vom Knoten auf der Armachse; Strassennamen liegen in der
 *  Wegmitte, weiter weg */
export const NR_ABSTAND_M = 12
/** Lage des Nummernschilds: auf der Armachse NR_ABSTAND_M (bzw. abstand) vom Knoten, die Grundstückzufahrt am Zufahrtspunkt (zp) */
export const nrLage = (kn: Pick<KnotenInfo, 'p' | 'grundstueck'>, a: ArmInfo, zp: P | null = null, abstand = NR_ABSTAND_M): P =>
  (kn.grundstueck && a.nr === NR_GRUNDSTUECK && zp ? zp : add(kn.p, a.richtung, abstand))

export function armInfo(netz: OsmNetz, a: Arm): ArmInfo {
  const w = netz.w(a[0])
  const richtung = netz.armRichtung(a)
  const [veloZufluss, veloZuflussQuelle] = netz.veloZufluss(a)
  return { key: armKey(a), nr: '', wid: a[0], i: a[1], sd: a[2], name: w.name, hw: w.hw, richtung, himmel: himmelsrichtung(richtung),
    zufluss: netz.zufluss(a), einbahn: w.ow, veloZufluss, veloZuflussQuelle }
}

/** Gestrecktheit eines Armpaars: 1 = gerade durch, -1 = umkehrend */
const gestreckt = (a: ArmInfo, b: ArmInfo) => -dot(a.richtung, b.richtung)

/**
 * Vortrittsberechtigtes Armpaar unter arme (ohne den Arm «ohne»): derselbe OSM-Weg, sonst gleicher Name, sonst höhere
 * Strassenklasse; je Regel das gestreckteste Paar. -> [Paar, Grund] oder null (weniger als zwei Arme)
 */
export function vortrittPaar(arme: ArmInfo[], ohne: string | null = null): [[ArmInfo, ArmInfo], string] | null {
  const kand = arme.filter(a => a.key !== ohne)
  if (kand.length < 2) return null
  const paare: [ArmInfo, ArmInfo][] = []
  for (let i = 0; i < kand.length; i++) for (let k = i + 1; k < kand.length; k++) paare.push([kand[i], kand[k]])
  const rang = (p: [ArmInfo, ArmInfo]) => Math.max(HW_RANG[p[0].hw] ?? 9, HW_RANG[p[1].hw] ?? 9)
  // unter mehreren Paaren derselben Regel: höhere Klasse, dann das gestreckteste
  const bestes = (ps: [ArmInfo, ArmInfo][]) => ps.reduce((b, p) => (rang(p) < rang(b) ||
    (rang(p) === rang(b) && gestreckt(p[0], p[1]) > gestreckt(b[0], b[1])) ? p : b))
  const gleicherWeg = paare.filter(([a, b]) => a.wid === b.wid)
  if (gleicherWeg.length) return [bestes(gleicherWeg), 'derselbe OSM-Weg führt durch den Knoten']
  const gleicherName = paare.filter(([a, b]) => a.name && a.name === b.name)
  if (gleicherName.length) return [bestes(gleicherName), 'gleicher Strassenname']
  return [bestes(paare), 'höhere Strassenklasse (OSM highway)']
}

/** Vortrittssignale in der Nähe des Knotens (OSM highway=stop/give_way) */
export function vortrittsSignale(osm: OsmDaten | null, p: P, lv: (lat: number, lon: number) => P): VortrittsHinweis[] {
  return (osm?.vortritt ?? []).map(k => ({ id: k.id, art: k.tags.highway as 'stop' | 'give_way', p: lv(k.lat, k.lon) }))
    .filter(s => dist(s.p, p) <= SIGNAL_KNOTEN_M)
}

/** Liegt das Signal an der Zufahrt (bis SIGNAL_ARM_M neben den ersten Metern des Arms bzw. am Knoten)? */
export function signalAnArm(netz: OsmNetz, arm: ArmInfo, s: VortrittsHinweis): boolean {
  const linie = netz.armLinie([arm.wid, arm.i, arm.sd], SIGNAL_KNOTEN_M)
  for (let k = 0; k < linie.length - 1; k++) if (abstandStrecke(s.p, linie[k], linie[k + 1]) <= SIGNAL_ARM_M) return true
  return false
}

/** Arm ohne Zufahrt (Korrektur 31.10.2026, Punkt 11): Einbahn vom Knoten weg ohne Velo gegen die Einbahn */
export const keineZufahrt = (a: Pick<ArmInfo, 'zufluss' | 'veloZufluss'>): boolean => !a.zufluss && !a.veloZufluss

/** Arm, zu dem ein Vortrittssignal gehört: der nächste Arm, an dem es liegt (signalAnArm; nahe am Knoten liegt es sonst an mehreren);
 *  undefined, wenn es an keinem Arm liegt */
export function signalArm(netz: OsmNetz, arme: ArmInfo[], s: VortrittsHinweis): ArmInfo | undefined {
  const abstand = (a: ArmInfo) => {
    const l = netz.armLinie([a.wid, a.i, a.sd], SIGNAL_KNOTEN_M)
    return Math.min(...l.slice(0, -1).map((q, k) => abstandStrecke(s.p, q, l[k + 1])))
  }
  return arme.filter(a => signalAnArm(netz, a, s)).sort((a, b) => abstand(a) - abstand(b))[0]
}

/** Korrektur 31.10.2026 (Punkt 17): Vortrittssignale, die zu diesem Knoten gehören. Ein Signal zählt nur an einem Arm, auf dem Verkehr
 *  zum Knoten fährt (Motorfahrzeuge bzw. Velos gegen die Einbahn); eines auf einer Einbahn vom Knoten weg gilt dem nächsten Knoten in
 *  Fahrtrichtung (z. B. der Einfahrt in einen Kreisel) und fällt hier weg. Signale an keinem Arm bleiben (Hinweis «anderer Arm») */
export const knotenSignale = (netz: OsmNetz, arme: ArmInfo[], signale: VortrittsHinweis[]): VortrittsHinweis[] =>
  signale.filter(s => { const a = signalArm(netz, arme, s); return !a || !keineZufahrt(a) })

/** Knoten mit Armen, Vortrittsstrasse und Vorschlag für die Zufahrt; null, wenn n kein Knoten ist (unter drei Strassenarmen).
 *  Korrektur 31.10.2026 (Punkt 15): steht an einem Arm ein Vortrittssignal (OSM give_way bzw. stop), bilden die übrigen Arme die
 *  Vortrittsstrasse (vortrittSicher, mitVortritt); ebenso zwei Arme einer Hauptstrasse (priority_road). Vorschlag dann der erste Arm
 *  mit Signal; nie ein Arm ohne Zufahrt (Punkt 11). Punkt 17: nur Signale an Armen mit Verkehr zum Knoten (knotenSignale; info.signale
 *  ohne die übrigen). lsa: Lichtsignal am Knoten (Punkt 13) */
export function knotenInfo(netz: OsmNetz, n: number, signaleNah: VortrittsHinweis[] = [], lsa = false): KnotenInfo | null {
  if (!netz.P.has(n)) return null
  const arme = nummerieren(strassenArme(netz, n).map(a => armInfo(netz, a)))
  if (arme.length < 3) return null
  let vp = vortrittPaar(arme)
  let vortrittSicher: string | null = null
  const signale = knotenSignale(netz, arme, signaleNah)
  const armVon = (s: VortrittsHinweis) => signalArm(netz, arme, s)
  const mitSignal = nachNr(arme).filter(a => signale.some(s => armVon(s) === a))
  const ohneSignal = arme.filter(a => !mitSignal.includes(a))
  const prio = arme.filter(a => ['designated', 'yes'].includes(netz.w(a.wid).t.priority_road ?? ''))
  if (mitSignal.length && ohneSignal.length >= 2) {
    const sp = vortrittPaar(ohneSignal)!
    const s0 = signale.find(s => armVon(s) === mitSignal[0])!
    vortrittSicher = `Signal «${s0.art === 'stop' ? 'Stop' : 'Kein Vortritt'}» an ${armText(mitSignal[0])} (OSM highway=${s0.art})`
    vp = [sp[0], `${vortrittSicher}; ${sp[1]}`]
  } else if (prio.length >= 2) {
    const sp = vortrittPaar(prio)!
    vortrittSicher = 'Hauptstrasse (OSM priority_road)'
    vp = [sp[0], `${vortrittSicher}; ${sp[1]}`]
  }
  const vortritt: [string, string] | null = vp ? [vp[0][0].key, vp[0][1].key] : null
  const ausserhalb = arme.filter(a => !vortritt?.includes(a.key))
  const kand = mitSignal.length && vortrittSicher ? mitSignal.filter(a => !keineZufahrt(a)) : ausserhalb.length === 1 ? ausserhalb : []
  const p = netz.p(n)
  const namen = [...new Set(arme.map(a => a.name).filter(x => x))]
  return {
    id: n, p, ll: wgs(p[0], p[1]), name: namen.length ? namen.join(' / ') : `OSM-Knoten ${n}`, arme, vortritt,
    vortrittGrund: vp ? vp[1] : '', vorschlag: kand.length && !keineZufahrt(kand[0]) ? kand[0].key : null, signale,
    ...(vortrittSicher && vortritt ? { vortrittSicher, mitVortritt: [...vortritt] } : {}), ...(lsa ? { lsa: true } : {}),
  }
}
