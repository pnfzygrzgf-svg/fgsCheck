// ── Texte für Panel und Bericht: Gründe, Arten, Status, Zahlformat ──

import type { ZufahrtErgebnis } from './rechner/typen'
import type { Hindernis } from './rechner/hindernisse'

export const f1 = (x: number) => x.toFixed(1).replace('.', ',')
export const f2 = (x: number) => x.toFixed(2).replace('.', ',')

export const GRUND: Record<string, string> = {
  einbahn_osm: 'Einbahn (OSM)', richtungsfahrbahn: 'Richtungsfahrbahn (Gegenfahrbahn daneben)', insel: 'Inselteil: Insel rechts der Fahrt',
  insel_einbahn: 'Einbahn gegen die Inselregel', einspurig: 'einspurig neben Verkehrsinsel',
  einmuendung: 'Einmündung: Strasse führt am Knoten nicht weiter', gerade_verboten: 'Weiterfahrt verboten',
  gedeckt: 'durch die gerade Zufahrt gedeckt', kein_zufluss: 'kein Zufluss (Einbahn vom Knoten weg)', verbot: 'Abbiegeverbot (OSM)',
  kreisel: 'Kreisel: über den Ring gedeckt', wenden: 'Wenden (Gegenfahrbahn)', nebenast: 'Nebenast (Drehung unter 30°)',
  zu_steil: 'zu steil (Drehung über 150°)', arm_schmal: 'Querstrasse schmaler als 3 m', arm_ohne_fahrbahn: 'Zufahrt ohne AV-Fahrbahn',
  geometrie: 'Fahrlinie passt nicht (Geometrie)', teilstreifen: 'fährt auf dem anderen Fahrbahnteil (Teilstreifen)',
  wegende: 'Weg endet', einbahn_widerspruch: 'Einbahn-Widerspruch', hand: 'von Hand gestrichen',
}
export const ART: Record<string, string> = { beide: 'gerade', einbahn: 'gerade (Einbahn)', insel: 'gerade (Inselteil)', abbiegend: 'abbiegend' }
export const STATUS: Record<string, string> = {
  frei: 'frei', verdeckt: 'verdeckt (Auto-Parkfeld)', verdeckt_gebaeude: 'verdeckt (Gebäude)', verdeckt_hindernis: 'verdeckt (Hecke, Mauer bzw. übriges Hindernis)',
  verdeckt_baum: 'verdeckt (Baum)', verdeckt_zweirad: 'verdeckt (Zweirad-Feld)', kein_fgs: 'kein FGS (von Hand)', ohne_zufahrt: 'keine Zufahrt',
}
/** Status einer Zufahrt; bei «verdeckt_hindernis» mit den Arten der verdeckenden Hindernisse (Hecke, Mauer, übriges Hindernis) */
export function statusText(z: ZufahrtErgebnis, hindernisse: Hindernis[]): string {
  if (z.status !== 'verdeckt_hindernis') return STATUS[z.status] ?? z.status
  const name: Record<string, string> = { hecke: 'Hecke', mauer: 'Mauer', uebrige: 'übriges Hindernis' }
  const arten = [...new Set(z.konflikte.filter(k => k.klasse === 'hindernis')
    .map(k => name[hindernisse.find(h => h.id === k.id)?.art ?? ''] ?? 'Hindernis'))]
  return `verdeckt (${arten.join(', ')})`
}

