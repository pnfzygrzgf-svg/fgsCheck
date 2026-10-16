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
//   die Herkunft in 16 Teilen («von Südsüdwesten»), dann «(2)», «(3)». Kurzform für Kartenbild und Bericht-Bild: «von S» bzw.
//   «Abbieger von O». Die Gradzahl steht nur noch im Tooltip und in der Detailansicht einer Zufahrt (Zuordnung zu Rechnung und
//   Berner Karte); in der Fall-Datei stehen die Eingaben unter der Kennung des OSM-Wegs, nicht unter der Gradzahl.

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

/** Anzeigename eines Streifens: eigener Name eines Streifens von Hand, sonst «Streifen 1» bzw. «Streifen <Nr.>» */
export function streifenTitel(fgsId: string, hand: StreifenHand[] = []): string {
  const name = hand.find(x => x.id === fgsId)?.name?.trim()
  if (name) return name
  const m = /^hand-(\d+)$/.exec(fgsId)
  return `Streifen ${m ? m[1] : fgsId}`
}
/** Kurzform für Beschriftungen im Bild (mehrere Streifen): Name bzw. Nummer */
export function streifenKurz(fgsId: string, hand: StreifenHand[] = []): string {
  const name = hand.find(x => x.id === fgsId)?.name?.trim()
  if (name) return name
  const m = /^hand-(\d+)$/.exec(fgsId)
  return m ? m[1] : fgsId
}

export interface ZufahrtName { lang: string; kurz: string }
export interface ZufahrtNamen {
  zufahrt: Map<string, ZufahrtName>          // Schlüssel: ZufahrtErgebnis.zufahrt
  entfallen: Map<string, ZufahrtName>        // Schlüssel: `${zufahrt}|${kennung}` (Entfallen)
}

/** Namen der Zufahrten und der nicht geprüften Richtungen eines Streifens, eindeutig (Regeln oben) */
export function zufahrtNamen(s: { strasse: string; zufahrten: ZufahrtErgebnis[]; entfallen: Entfallen[]; bw?: number },
  wegName: (wid: string) => string | null = () => null): ZufahrtNamen {
  type E = { key: string; liste: 'zufahrt' | 'entfallen'; az: number; abb: boolean; strasse: string }
  const ohne = 'Strasse ohne Namen'
  const alle: E[] = [
    ...s.zufahrten.map((z): E => ({ key: z.zufahrt, liste: 'zufahrt', az: zufahrtAzimut(z, s.bw ?? 0), abb: z.art === 'abbiegend',
      strasse: z.strasse || (z.art === 'abbiegend' ? '' : s.strasse) || ohne })),
    ...s.entfallen.map((e): E => ({ key: `${e.zufahrt}|${e.kennung}`, liste: 'entfallen', az: herkunftAzimut(e.richtung), abb: e.art === 'abbiegend',
      strasse: wegName(e.osmWeg) || (e.art === 'abbiegend' ? '' : s.strasse) || ohne })),
  ]
  const lang = (x: E, fein: boolean) => `${x.abb ? 'Abbieger: ' : ''}${x.strasse} von ${(fein ? R16[teil(x.az, 16)] : R8[teil(x.az, 8)])}`
  const kurz = (x: E, fein: boolean) => `${x.abb ? 'Abbieger ' : ''}von ${(fein ? R16K[teil(x.az, 16)] : R8K[teil(x.az, 8)])}`
  const eindeutig = (f: (x: E, fein: boolean) => string): string[] => {
    const grob = alle.map(x => f(x, false))
    const n = (t: string[], v: string) => t.filter(y => y === v).length
    const zwei = alle.map((x, i) => (n(grob, grob[i]) > 1 ? f(x, true) : grob[i]))
    const zaehler = new Map<string, number>()
    return zwei.map(t => {
      if (n(zwei, t) < 2) return t
      const k = (zaehler.get(t) ?? 0) + 1
      zaehler.set(t, k)
      return k === 1 ? t : `${t} (${k})`
    })
  }
  const l = eindeutig(lang), k = eindeutig(kurz)
  const aus: ZufahrtNamen = { zufahrt: new Map(), entfallen: new Map() }
  alle.forEach((x, i) => aus[x.liste].set(x.key, { lang: l[i], kurz: k[i] }))
  return aus
}

/** Name einer Zufahrt (Schlüssel «70», «a151»); unbekannt: die Gradzahl wie bisher */
export const zufahrtLang = (n: ZufahrtNamen | undefined, zufahrt: string) => n?.zufahrt.get(zufahrt)?.lang ?? `Zufahrt ${zufahrt}`
export const zufahrtKurz = (n: ZufahrtNamen | undefined, zufahrt: string) => n?.zufahrt.get(zufahrt)?.kurz ?? zufahrt
export const entfallenLang = (n: ZufahrtNamen | undefined, e: { zufahrt: string; kennung: string }) =>
  n?.entfallen.get(`${e.zufahrt}|${e.kennung}`)?.lang ?? `Richtung ${e.zufahrt}`

/** Namen der OSM-Wege (Overpass-Rohantwort): Id -> name */
export function wegNamen(roh: unknown): Map<string, string> {
  const el = (roh as { elements?: { type?: string; id?: number; tags?: Record<string, unknown> }[] } | null)?.elements ?? []
  const aus = new Map<string, string>()
  for (const e of el) if (e.type === 'way' && typeof e.tags?.name === 'string') aus.set(String(e.id), e.tags.name)
  return aus
}
