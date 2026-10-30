// ── Erkennungsdistanz auf der Karte (27.10.2026; nur Darstellung, ohne Wirkung auf die Rechnung) ──
//
// Je gerade Zufahrt eines Fussgängerstreifens mit gerechneter Erkennungsdistanz (ZufahrtErgebnis.erkennungM) ein Band entlang der
// Fahrlinie ab dem ersten Sichtpunkt (Streifenrand): grün bis zur Erkennungsdistanz; fehlt sie bis zum Soll (doppelte Sichtweite,
// höchstens 110 m), rot von dort bis zum Soll (verdeckt) bzw. grau (Fahrlinie endet, weiter zurück nicht geprüft). Reicht die Fahrlinie
// nicht so weit, geht das Band gerade in ihrer letzten Richtung weiter. Das verdeckende Hindernis (Erkennung.hindernis) wird über seine
// Kennung gesucht (Hindernisse von Hand, Vorschläge, Kataster).
// Sichtlinien (30.10.2026): Klick auf ein Band zeigt die dünnen Sichtlinien der Rechnung (ZufahrtErgebnis.erkennungLinien) bis zum Soll
// bzw. bis zur Erkennungsdistanz, wenn sie weiter reicht: je Augpunkt eine Linie zum genutzten Zielpunkt der Markierung.
// Gelände (30.10.2026): Band und Linien zeigen die Erkennungsdistanz nach der Geländeprüfung (erkennungGelaende.erkennungAnzeige, Werte
// je gelaendeSchluessel); fehlt sie, wie gerechnet mit «Gelände nicht geprüft».

import { add, dist, einheit, sub, type P } from './geo'
import { ERKENNUNG_FAKTOR, ERKENNUNG_MAX_M } from './rechner/erkennung'
import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'
import { erkennungWert } from './texte'
import { erkennungAnzeige, gelaendeText, type GelaendeStand } from './erkennungGelaende'

type Gelaende = Readonly<Record<string, GelaendeStand>> | null | undefined

/** Wort für das verdeckende Hindernis (wie texte.erkennungZusatz) */
const HINDERNIS_WORT: Record<string, string> = { gebaeude: 'Gebäude', auto: 'Auto-Parkfeld', baum: 'Baum', gelaende: 'Gelände (swissALTI3D)' }

export interface ErkennungBand {
  /** Schlüssel «fgsId|zufahrt» */
  zufahrt: string
  /** sichtbar: ab dem Streifenrand bis zur Erkennungsdistanz (bzw. bis zum Soll, wenn sie weiter reicht) */
  gruen: P[]
  /** fehlt bis zum Soll: verdeckt (rot) bzw. nicht geprüft (Fahrlinie endet, grau); null: erfüllt */
  fehlt: { art: 'verdeckt' | 'ungeprueft'; linie: P[] } | null
  soll: number
  text: string
  /** Kennung des verdeckenden Hindernisses (falls bekannt) */
  hindernisId?: string
}

/** Soll der Erkennungsdistanz einer Zufahrt: doppelte Sichtweite, höchstens bis zur Prüfgrenze */
export const erkennungSoll = (z: Pick<ZufahrtErgebnis, 'sichtweite'>): number => Math.min(ERKENNUNG_MAX_M, ERKENNUNG_FAKTOR * z.sichtweite)

/** Lage des Punkts p auf der Linie als Abstand ab ihrem Anfang (nächster Punkt) */
function lageAuf(linie: P[], p: P): number {
  let best = Infinity, a = 0, s = 0
  for (let i = 1; i < linie.length; i++) {
    const u = sub(linie[i], linie[i - 1]), l = Math.hypot(u[0], u[1])
    if (l <= 0) continue
    const t = Math.max(0, Math.min(1, ((p[0] - linie[i - 1][0]) * u[0] + (p[1] - linie[i - 1][1]) * u[1]) / (l * l)))
    const d = dist(p, add(linie[i - 1], u, t))
    if (d < best) { best = d; a = s + t * l }
    s += l
  }
  return a
}

/** Teil der Linie zwischen den Abständen von und bis (ab ihrem Anfang); über das Ende hinaus gerade in der letzten Richtung */
export function abschnitt(linie: P[], von: number, bis: number): P[] {
  if (linie.length < 2 || bis <= von) return []
  const punkt = (x: number): P => {
    let s = 0
    for (let i = 1; i < linie.length; i++) {
      const l = dist(linie[i - 1], linie[i])
      if (l > 0 && x <= s + l) return add(linie[i - 1], sub(linie[i], linie[i - 1]), (x - s) / l)
      s += l
    }
    let k = linie.length - 1
    while (k > 0 && dist(linie[k - 1], linie[k]) <= 0) k--
    return add(linie[linie.length - 1], einheit(sub(linie[k], linie[Math.max(0, k - 1)])), x - s)
  }
  const aus: P[] = [punkt(von)]
  let s = 0
  for (let i = 1; i < linie.length; i++) {
    s += dist(linie[i - 1], linie[i])
    if (s > von && s < bis) aus.push(linie[i])
  }
  aus.push(punkt(bis))
  return aus
}

/** Bänder der Erkennungsdistanz eines Streifens (leer bei Trottoirüberfahrt bzw. ohne gerechnete Erkennungsdistanz) */
export function erkennungBaender(s: StreifenErgebnis, gelaende?: Gelaende): ErkennungBand[] {
  if (s.trottoirueberfahrt) return []
  return s.zufahrten.flatMap(z => {
    const e = erkennungAnzeige(z, gelaende)?.e
    if (!e || z.art === 'abbiegend' || !z.sichtpunkte.length || z.spur.length < 2) return []
    const soll = erkennungSoll(z)
    const a0 = lageAuf(z.spur, z.sichtpunkte[0])
    const gruen = abschnitt(z.spur, a0, a0 + Math.min(e.wert, ERKENNUNG_MAX_M))
    const kurz = e.wert < soll - 1e-9
    const fehlt = kurz ? { art: e.bis === 'verdeckt' ? 'verdeckt' as const : 'ungeprueft' as const, linie: abschnitt(z.spur, a0 + e.wert, a0 + soll) } : null
    const wer = e.hindernis ? HINDERNIS_WORT[e.hindernis.klasse] ?? e.hindernis.name : ''
    const text = `Erkennungsdistanz: Markierung ${e.bis === 'fahrlinie_endet' ? 'auf' : 'ab'} ${erkennungWert(e)} sichtbar, Soll ${Math.round(soll)} m` +
      (e.bis === 'verdeckt' ? (wer ? `; verdeckt durch ${wer}` : '; weiter entfernt verdeckt')
        : e.bis === 'fahrlinie_endet' ? '; Fahrlinie endet, weiter zurück nicht geprüft' : '') + `; ${gelaendeText(e)}`
    return [{ zufahrt: `${z.fgsId}|${z.zufahrt}`, gruen, fehlt: fehlt && fehlt.linie.length >= 2 ? fehlt : null, soll, text,
      ...(e.bis === 'verdeckt' && e.hindernis?.id ? { hindernisId: e.hindernis.id } : {}) }]
  })
}

/** Sichtlinie auf der Karte: Augpunkt, genutzter Zielpunkt der Markierung, Befund und Tooltip */
export interface SichtlinieKarte { x: number; auge: P; ziel: P; art: 'frei' | 'verdeckt'; text: string }

/** Sichtlinien einer Zufahrt zum Zeigen: ab dem ersten Augpunkt hinter dem Streifenrand bis zum Soll bzw. bis zur Erkennungsdistanz,
 * wenn sie weiter reicht (leer ohne gerechnete Erkennungsdistanz) */
export function erkennungSichtlinien(z: ZufahrtErgebnis, gelaende?: Gelaende): SichtlinieKarte[] {
  const a = erkennungAnzeige(z, gelaende)
  if (!a || !a.linien.length || z.art === 'abbiegend') return []
  const bis = Math.max(erkennungSoll(z), a.e.wert, z.erkennungM!.wert)
  return a.linien.filter(x => x.x > 1e-6 && x.x <= bis + 1e-6).map(x => ({ x: x.x, auge: x.auge, ziel: x.ziel, art: x.befund,
    text: `Sichtlinie ${Math.round(x.x)} m vor dem Streifen auf die Markierung: ${x.befund === 'frei' ? 'in den Daten frei'
      : `verdeckt${x.grund ? ` (${x.grund})` : ''}`}${x.gelaende === true ? ', Gelände frei' : x.gelaende === false ? ''
      : x.bruecke ? ', Gelände nicht prüfbar (Brücke)' : x.befund === 'frei' ? ', Gelände nicht geprüft' : ''}` }))
}
