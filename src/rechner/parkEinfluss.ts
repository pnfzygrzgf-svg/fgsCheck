// Ergebnisbeiträge für den Bericht; reine Dokumentation, keine Änderung der Sichtrechnung.
import type { Hindernis } from './hindernisse'

export interface ParkEinfluss { id: string; grund: string }

/** Nur Ergebnisbefunde und ausdrücklich verwendete Geometriebeiträge, niemals den geladenen Katasterbestand. */
export function parkEinfluesse(ergebnis: unknown): ParkEinfluss[] {
  const out: ParkEinfluss[] = [], gesehen = new Set<string>()
  const dazu = (id: unknown, grund: string) => {
    if (typeof id !== 'string') return
    const key = `${id}\n${grund}`
    if (!gesehen.has(key)) { gesehen.add(key); out.push({ id, grund }) }
  }
  const ohne = new Set(['parkPruefflaechen', 'parkAnnahmen', 'vorschlaege', 'amtlich', 'amtlichVerworfen',
    'geom', 'poly', 'ring', 'feld', 'spur', 'sichtpunkte', 'sichtbar', 'dreieck', 'dreieckFrei', 'dreieckVerdeckt',
    'profilLinie', 'zufahrtProfil', 'trottoirProfil', 'karte', 'profile', 'erkennungLinien', 'massnahmen'])
  const walk = (wert: unknown) => {
    if (!wert || typeof wert !== 'object') return
    if (Array.isArray(wert)) { for (const v of wert) if (v && typeof v === 'object' && !Array.isArray(v)) walk(v); return }
    const o = wert as Record<string, any>
    for (const p of o.parkEinfluss ?? []) dazu(p.id, p.grund)
    if (o.parkStreifen?.abzug) for (const id of o.parkStreifen.ids ?? []) dazu(id, 'Parkstreifenabzug / Lage der Fahrlinie')
    for (const k of o.konflikte ?? []) dazu(k.id, 'Hindernis im Sichtfeld')
    for (const v of o.verdeckerListe ?? []) dazu(v.id, 'Sichtverdeckung')
    dazu(o.verdecker?.id, 'Sichtverdeckung')
    dazu(o.hindernis?.id, 'Erkennung der Markierung')
    for (const id of o.inD ?? []) dazu(id, 'Beobachtungspunkt liegt in der Fläche; für die Sicht ausgelassen')
    for (const [key, v] of Object.entries(o)) if (!ohne.has(key) && key !== 'parkEinfluss') walk(v)
  }
  walk(ergebnis)
  return out
}

export const istParkflaeche = (h: Hindernis): boolean => h.art === 'parkfeld' || h.art === 'laengsparkierung'

export function parkBerichtFelder(felder: readonly Hindernis[], ergebnis: unknown): Hindernis[] {
  const ids = new Set(parkEinfluesse(ergebnis).map(x => x.id))
  const gesehen = new Set<string>()
  return felder.filter(h => {
    if (!istParkflaeche(h)) return true
    if (!ids.has(h.id)) return false
    // Gleiche Quelle kann nach Plan-Abzügen mehrere Teilflächen haben; nur identische Geometrien zusammenfassen.
    const key = `${h.id}:${JSON.stringify(h.art === 'parkfeld' ? h.ring : h.art === 'laengsparkierung' ? h.linie : null)}`
    if (gesehen.has(key)) return false
    gesehen.add(key)
    return true
  })
}

/** Kennungen der Parkplatz-Grundlagen (ParkRegel.quellenId), die über eine Parkfläche mit Ergebnisbeitrag ins Resultat eingehen. */
export function parkQuellenIds(felder: readonly Hindernis[], ergebnis: unknown): string[] {
  const ids = new Set(parkEinfluesse(ergebnis).map(x => x.id))
  return [...new Set(felder.flatMap(h => h.art === 'parkfeld' && h.parkPruefung && ids.has(h.id) ? [h.parkPruefung.regel.quellenId] : []))]
}

/** Wurde ein Parkstreifenabzug angewendet (Lage der Fahrlinie bzw. des Beobachtungspunkts)? */
export const parkAbzugAngewendet = (ergebnis: unknown): boolean => parkEinfluesse(ergebnis).some(x => x.grund.startsWith('Parkstreifenabzug'))
