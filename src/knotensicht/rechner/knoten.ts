// ── Knoten, Arme und vortrittsberechtigte Strasse (E0) ──
//
// Knoten = OSM-Knoten mit drei und mehr Strassenarmen (Wege der Klassen MFZ_HW ohne service, ohne Fahrverbot, wie das
// Knotennetz des fgsCheck: Weg.strasse). Ein Weg, der durch den Knoten läuft, gibt zwei Arme, ein Weg, der dort beginnt oder
// endet, einen.
// Vortrittsberechtigte Strasse in E0 (ohne Signalisation aus OSM): die beiden Arme desselben OSM-Wegs, sonst zwei Arme mit
// gleichem Namen, sonst die höhere highway-Klasse; unter mehreren Paaren die höhere Klasse, dann das gestreckteste. Die Zufahrt wählt der Nutzer;
// gehört sie zur Vortrittsstrasse, bilden die übrigen Arme die Vortrittsstrasse (mit Hinweis). Die Vortrittsregelung ist in
// E0 fest «Vortritt»; OSM highway=stop/give_way erscheinen nur als Hinweis.

import { type P, add, dist, dot, wgs, winkelGrad, abstandStrecke } from '../geo'
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

export const istKnoten = (netz: OsmNetz, n: number): boolean => strassenArme(netz, n).length >= 3

/** alle Knoten im Netz (für Tests und die Anzeige nach dem Klick) */
export function knotenFinden(netz: OsmNetz): number[] {
  return [...netz.an.keys()].filter(n => istKnoten(netz, n)).sort((a, b) => a - b)
}

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

/** Knoten mit Armen, Vortrittsstrasse und Vorschlag für die Zufahrt; null, wenn n kein Knoten ist */
export function knotenInfo(netz: OsmNetz, n: number, signale: VortrittsHinweis[] = []): KnotenInfo | null {
  if (!netz.P.has(n)) return null
  const arme = nummerieren(strassenArme(netz, n).map(a => armInfo(netz, a)))
  if (arme.length < 3) return null
  const vp = vortrittPaar(arme)
  const vortritt: [string, string] | null = vp ? [vp[0][0].key, vp[0][1].key] : null
  const ausserhalb = arme.filter(a => !vortritt?.includes(a.key))
  const p = netz.p(n)
  const namen = [...new Set(arme.map(a => a.name).filter(x => x))]
  return {
    id: n, p, ll: wgs(p[0], p[1]), name: namen.length ? namen.join(' / ') : `OSM-Knoten ${n}`, arme, vortritt,
    vortrittGrund: vp ? vp[1] : '', vorschlag: ausserhalb.length === 1 ? ausserhalb[0].key : null, signale,
  }
}
