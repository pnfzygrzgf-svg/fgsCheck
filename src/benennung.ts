// ── Benennung für Panel, Karte und Bericht: Streifen von Hand und Zufahrten (16.10.2026) ──
//
// Nur Anzeige: die Schlüssel bleiben (Streifen «hand-1», Zufahrt «70» bzw. «a151», Eingaben «Streifen|Kennung», Ergebnis-Auszug
// der Fall-Datei); die Rechnung ist unverändert.
// - Streifen von Hand: eigener Name (Feld name der Fall-Datei), sonst «Streifen 1» (Nummer aus der Id). Streifen aus OSM bzw.
//   Luftbild wie bisher «Streifen <Nr.>».
// - Zufahrten: die Zahl der Zufahrt ist die Fahrtrichtung in Grad (geo.richtungGrad: ab Osten gegen den Uhrzeigersinn; 70 =
//   Fahrt nach Nordnordosten). Angezeigt wird die Strasse und die Herkunft (Gegenrichtung der Fahrt) als Himmelsrichtung in
//   8 Teilen: «Glockenstrasse von Süden». Die Herkunft kommt aus der Lage der Fahrlinie: Richtung vom ersten zum letzten
//   Sichtpunkt (bzw. Ende der Fahrlinie), nicht aus der Fahrtrichtung am Streifen – auf kurvigen Strassen kommen die Fahrzeuge
//   sonst «von Südwesten», obwohl die Fahrlinie nach Südsüdosten liegt (Prüfung 16.10.2026, Referenz 1137); bei Abbiegern
//   die Fahrtrichtung im Arm (zufahrtAzimut). Ohne Sichtpunkte (nicht geprüfte Richtungen) die
//   Fahrtrichtung.
//   Abbiegend «Abbieger: Bernstrasse von Osten» (Strasse des Arms, aus dem abgebogen wird,
//   ZufahrtErgebnis.strasse; die Strasse des Streifens steht in ueberStrasse). Nicht geprüfte Richtungen haben keinen
//   Strassennamen: gerade die Strasse des Streifens, abbiegend der Name des OSM-Wegs (wegName). Gleiche Namen an einem Streifen:
//   die Herkunft in 16 Teilen («von Südsüdwesten»), dann «(2)», «(3)». Kurzform «von S» bzw. «Abbieger von O» (zufahrtKurz;
//   seit 17.10.2026 zeigt das Bericht-Bild statt ihrer die Nummer). Die Gradzahl steht nur noch im Tooltip und in der Detailansicht einer Zufahrt (Zuordnung zu Rechnung und
//   Berner Karte); in der Fall-Datei stehen die Eingaben unter der Kennung des OSM-Wegs, nicht unter der Gradzahl.
// - Nummern (17.10.2026, nach dem SichtweitenCheck): je Streifen 1, 2, 3 … im Uhrzeigersinn ab Norden nach der Herkunft
//   (zufahrtAzimut, wie die Namen), gerade und abbiegende Zufahrten gemeinsam; bis 1° westlich von Nord zählt als Nord, nach
//   dem exakten Winkel, bei Gleichstand in der Reihenfolge der Rechnung; «(2)» im Namen folgt den Nummern. Nummeriert werden
//   die geprüften und die von Hand gestrichenen Zufahrten (Grund «hand»): Streichen lässt die übrigen Nummern stehen, die
//   gestrichene behält ihre Nummer unter «Hier nicht geprüfte Richtungen» (ohne Schild auf der Karte, es gibt keine Fahrlinie).
//   Aus den Daten entfallene Richtungen (Einbahn, Einmündung …) haben keine Nummer. Grenze: die Herkunft einer gestrichenen
//   geraden Zufahrt kommt aus der Fahrtrichtung, nicht mehr aus den Sichtpunkten; auf kurvigen Strassen kann sie darum mit
//   einer Nachbarin den Platz tauschen. Nur Anzeige, nicht in der Fall-Datei. Karte und Bericht-Bild zeigen das Nummernschild
//   hinter dem letzten Sichtpunkt (schildLage), Panel und Bericht die Nummer vor dem Namen («1 Glockenstrasse von Süden»).

import type { StreifenHand } from './fall'
import type { P } from './geo'
import type { ZufahrtErgebnis } from './rechner/typen'
import type { Entfallen } from './rechner/zufahrten'

const R8 = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten']
const R8K = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW']
const R16 = ['Norden', 'Nordnordosten', 'Nordosten', 'Ostnordosten', 'Osten', 'Ostsüdosten', 'Südosten', 'Südsüdosten', 'Süden',
  'Südsüdwesten', 'Südwesten', 'Westsüdwesten', 'Westen', 'Westnordwesten', 'Nordwesten', 'Nordnordwesten']
const R16K = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

/** Azimut (Grad ab Norden im Uhrzeigersinn) der Herkunft einer Zufahrt mit Fahrtrichtung grad (ab Osten gegen den Uhrzeigersinn) */
export const herkunftAzimut = (grad: number): number => (((270 - grad) % 360) + 360) % 360
const teil = (az: number, n: number) => Math.round(az / (360 / n)) % n
export const herkunft8 = (grad: number) => R8[teil(herkunftAzimut(grad), 8)]
export const herkunft16 = (grad: number) => R16[teil(herkunftAzimut(grad), 16)]
/** Fahrlinie höchstens so kurz (erster bis letzter Sichtpunkt): Herkunft aus der Fahrtrichtung */
export const HERKUNFT_LINIE_MIN_M = 2
/**
 * Azimut der Herkunft einer Zufahrt. Gerade: vom ersten zum letzten Sichtpunkt (bzw. Anfang und Ende der Fahrlinie). Abbiegend
 * aus der Fahrtrichtung im Arm (Prüfbefunde S1 und Nachprüfung 16.10.2026). Sonst bzw. bei zu kurzer Strecke
 * (HERKUNFT_LINIE_MIN_M) aus der Fahrtrichtung grad.
 */
export function zufahrtAzimut(z: { richtung: number; art?: string; knotenM?: number | null; sichtpunkte?: P[]; spur?: P[] },
  _breite = 0): number {
  // Abbiegend: Fahrtrichtung im Arm (Nachprüfung 16.10.2026: passt am besten zur Lage der OSM-Arme, 2 von 38 im
  // Nachbarsektor, höchstens 16° daneben; die Lage aus der Fahrlinie ab dem Knoten lag öfter daneben)
  if (z.art === 'abbiegend') return herkunftAzimut(z.richtung)
  const l = z.sichtpunkte && z.sichtpunkte.length >= 2 ? z.sichtpunkte : z.spur ?? []
  if (l.length >= 2) {
    const a = l[0], b = l[l.length - 1], dx = b[0] - a[0], dy = b[1] - a[1]
    if (Math.hypot(dx, dy) >= HERKUNFT_LINIE_MIN_M) return ((Math.atan2(dx, dy) * 180 / Math.PI) % 360 + 360) % 360
  }
  return herkunftAzimut(z.richtung)
}
/** Herkunft einer Zufahrt in 16 Teilen (Tooltip), aus der Fahrlinie (zufahrtAzimut) */
export const zufahrtHerkunft16 = (z: Parameters<typeof zufahrtAzimut>[0], breite = 0) => R16[teil(zufahrtAzimut(z, breite), 16)]

/** Anzeigename eines Streifens: eigener Name eines Streifens von Hand, sonst «Streifen 1» bzw. «Streifen <Nr.>»; Trottoirüberfahrt
 * (tue, 27.10.2026): «Trottoirüberfahrt 1» (die Kennung bleibt) */
export function streifenTitel(fgsId: string, hand: StreifenHand[] = [], tue = false): string {
  const name = hand.find(x => x.id === fgsId)?.name?.trim()
  if (name) return name
  const m = /^hand-(\d+)$/.exec(fgsId)
  return `${tue ? 'Trottoirüberfahrt' : 'Streifen'} ${m ? m[1] : fgsId}`
}
/** Kurzform für Beschriftungen im Bild (mehrere Streifen): Name bzw. Nummer */
export function streifenKurz(fgsId: string, hand: StreifenHand[] = []): string {
  const name = hand.find(x => x.id === fgsId)?.name?.trim()
  if (name) return name
  const m = /^hand-(\d+)$/.exec(fgsId)
  return m ? m[1] : fgsId
}

export interface ZufahrtName {
  lang: string; kurz: string
  nr?: string                                // Nummer am Streifen (nur geprüfte Zufahrten): «1», «2» …
}
export interface ZufahrtNamen {
  zufahrt: Map<string, ZufahrtName>          // Schlüssel: ZufahrtErgebnis.zufahrt
  entfallen: Map<string, ZufahrtName>        // Schlüssel: `${zufahrt}|${kennung}` (Entfallen)
}

/** Namen der Zufahrten und der nicht geprüften Richtungen eines Streifens, eindeutig (Regeln oben) */
export function zufahrtNamen(s: { strasse: string; zufahrten: ZufahrtErgebnis[]; entfallen: Entfallen[]; bw?: number },
  wegName: (wid: string) => string | null = () => null): ZufahrtNamen {
  type E = { key: string; liste: 'zufahrt' | 'entfallen'; az: number; abb: boolean; strasse: string; gestrichen?: boolean }
  const ohne = 'Strasse ohne Namen'
  const alle: E[] = [
    ...s.zufahrten.map((z): E => ({ key: z.zufahrt, liste: 'zufahrt', az: zufahrtAzimut(z, s.bw ?? 0), abb: z.art === 'abbiegend',
      strasse: z.strasse || (z.art === 'abbiegend' ? '' : s.strasse) || ohne })),
    ...s.entfallen.map((e): E => ({ key: `${e.zufahrt}|${e.kennung}`, liste: 'entfallen', az: herkunftAzimut(e.richtung), abb: e.art === 'abbiegend',
      strasse: wegName(e.osmWeg) || (e.art === 'abbiegend' ? '' : s.strasse) || ohne, gestrichen: e.grund === GESTRICHEN })),
  ]
  // Nummern: geprüfte und von Hand gestrichene Zufahrten im Uhrzeigersinn ab Norden (exakter Winkel), bei Gleichstand in der
  // Reihenfolge der Rechnung; Reihenfolge für «(2)» im Namen: nummerierte nach Nummer, dann die übrigen wie gehabt
  const folge = alle.map((x, i) => ({ x, i })).filter(({ x }) => x.liste === 'zufahrt' || x.gestrichen)
    .sort((a, b) => { const d = nrAzimut(a.x.az) - nrAzimut(b.x.az); return Math.abs(d) < NR_GLEICH_GRAD ? a.i - b.i : d })
    .map(({ i }) => i)
  const nr = new Map(folge.map((i, j) => [i, String(j + 1)]))
  const reihe = [...folge, ...alle.map((_, i) => i).filter(i => !nr.has(i))]
  const lang = (x: E, fein: boolean) => `${x.abb ? 'Abbieger: ' : ''}${x.strasse} von ${(fein ? R16[teil(x.az, 16)] : R8[teil(x.az, 8)])}`
  const kurz = (x: E, fein: boolean) => `${x.abb ? 'Abbieger ' : ''}von ${(fein ? R16K[teil(x.az, 16)] : R8K[teil(x.az, 8)])}`
  const eindeutig = (f: (x: E, fein: boolean) => string): string[] => {
    const grob = alle.map(x => f(x, false))
    const n = (t: string[], v: string) => t.filter(y => y === v).length
    const zwei = alle.map((x, i) => (n(grob, grob[i]) > 1 ? f(x, true) : grob[i]))
    const zaehler = new Map<string, number>(), aus = [...zwei]
    for (const i of reihe) {
      const t = zwei[i]
      if (n(zwei, t) < 2) continue
      const k = (zaehler.get(t) ?? 0) + 1
      zaehler.set(t, k)
      if (k > 1) aus[i] = `${t} (${k})`
    }
    return aus
  }
  const l = eindeutig(lang), k = eindeutig(kurz)
  const aus: ZufahrtNamen = { zufahrt: new Map(), entfallen: new Map() }
  alle.forEach((x, i) => aus[x.liste].set(x.key, nr.has(i) ? { lang: l[i], kurz: k[i], nr: nr.get(i) } : { lang: l[i], kurz: k[i] }))
  return aus
}

/** Azimut für die Nummern: bis 1° westlich von Nord zählt als Nord (wie SichtweitenCheck), sonst 0–359° */
const nrAzimut = (az: number) => (az > 359 ? az - 360 : az)
/** Herkunft gleich (Reihenfolge der Rechnung) unter diesem Unterschied [°] */
const NR_GLEICH_GRAD = 1e-6
/** Grund einer von Hand gestrichenen Zufahrt («gibt es nicht»): mitnummeriert, damit die übrigen Nummern bleiben */
const GESTRICHEN = 'hand'

/** Name einer Zufahrt (Schlüssel «70», «a151»); unbekannt: die Gradzahl wie bisher */
export const zufahrtLang = (n: ZufahrtNamen | undefined, zufahrt: string) => n?.zufahrt.get(zufahrt)?.lang ?? `Zufahrt ${zufahrt}`
export const zufahrtKurz = (n: ZufahrtNamen | undefined, zufahrt: string) => n?.zufahrt.get(zufahrt)?.kurz ?? zufahrt
export const entfallenLang = (n: ZufahrtNamen | undefined, e: { zufahrt: string; kennung: string }) =>
  n?.entfallen.get(`${e.zufahrt}|${e.kennung}`)?.lang ?? `Richtung ${e.zufahrt}`
/** Nummer einer Zufahrt am Streifen («1»); unbekannt bzw. nicht geprüft: leer */
export const zufahrtNr = (n: ZufahrtNamen | undefined, zufahrt: string) => n?.zufahrt.get(zufahrt)?.nr ?? ''
/** Nummer einer nicht geprüften Richtung: nur von Hand gestrichene, sonst leer */
export const entfallenNr = (n: ZufahrtNamen | undefined, e: { zufahrt: string; kennung: string }) =>
  n?.entfallen.get(`${e.zufahrt}|${e.kennung}`)?.nr ?? ''
/** Name einer nicht geprüften Richtung mit Nummer (nur von Hand gestrichene): «3 Glockenstrasse von Norden» */
export const entfallenText = (n: ZufahrtNamen | undefined, e: { zufahrt: string; kennung: string }) => {
  const nr = entfallenNr(n, e), l = entfallenLang(n, e)
  return nr ? `${nr} ${l}` : l
}
/** Name mit Nummer für Fliesstext und Tooltips: «1 Glockenstrasse von Süden» (ohne Nummer nur der Name) */
export const zufahrtText = (n: ZufahrtNamen | undefined, zufahrt: string) => {
  const nr = zufahrtNr(n, zufahrt), l = zufahrtLang(n, zufahrt)
  return nr ? `${nr} ${l}` : l
}
/** Zufahrten in der Reihenfolge ihrer Nummern (Tabellen in Panel und Bericht); ohne Nummer zuletzt, sonst wie gehabt */
export const nachNr = <T extends { zufahrt: string }>(liste: T[], n: ZufahrtNamen | undefined): T[] => {
  const k = (z: T) => Number(zufahrtNr(n, z.zufahrt)) || Number.MAX_SAFE_INTEGER
  return [...liste].sort((a, b) => k(a) - k(b))
}
/** Erklärsatz zu den Nummern (Legende im Panel, Hilfe, Bericht) */
export const NUMMERN_TEXT = 'Nummern: Zufahrten im Uhrzeigersinn ab Norden'
/** Ein Einheitsvektor (E, N) bzw. null bei Länge 0 */
const einheit = (a: P, b: P): P | null => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy)
  return l > 1e-6 ? [dx / l, dy / l] : null
}
/** Punkte vor dem Ende für die Richtung nach aussen (Sichtpunkte alle 2 m: rund 6 m) */
const SCHILD_RUECK = 3
/**
 * Lage des Nummernschilds einer Zufahrt (Karte, Bericht-Bild): der letzte Sichtpunkt (ohne Sichtpunkte das Ende der Fahrlinie)
 * und die Richtung nach aussen (Einheitsvektor E/N, entlang der Fahrlinie vom Streifen weg, aus den letzten Punkten). Das
 * Schild steht um einen festen Abstand in Bildpunkten in dieser Richtung hinter dem Punkt: dort, wo die Fahrzeuge herkommen,
 * ohne Streifen und Sichtpunkte zu verdecken; die Enden gerader und abbiegender Zufahrten liegen auseinander, die Anfänge am
 * Streifen nicht. Ohne Punkte null.
 */
export function schildLage(z: { sichtpunkte: P[]; spur: P[] }): { p: P; aussen: P } | null {
  const l = z.sichtpunkte.length ? z.sichtpunkte : z.spur
  if (!l.length) return null
  const p = l[l.length - 1]
  const aussen = einheit(l[Math.max(0, l.length - 1 - SCHILD_RUECK)], p) ?? (l.length > 1 ? einheit(l[0], p) : null) ??
    (z.spur.length > 1 ? einheit(z.spur[0], z.spur[z.spur.length - 1]) : null) ?? [0, 1]
  return { p, aussen }
}

/** Namen der OSM-Wege (Overpass-Rohantwort): Id -> name */
export function wegNamen(roh: unknown): Map<string, string> {
  const el = (roh as { elements?: { type?: string; id?: number; tags?: Record<string, unknown> }[] } | null)?.elements ?? []
  const aus = new Map<string, string>()
  for (const e of el) if (e.type === 'way' && typeof e.tags?.name === 'string') aus.set(String(e.id), e.tags.name)
  return aus
}
