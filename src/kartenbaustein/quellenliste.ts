// ── Gemeinsame Quellenliste aller Rechner ──
// Je Quelle ist festgehalten, wie jeder Rechner sie heute nutzt (ist) und wie entschieden wurde (soll). Eine neue Quelle kommt zuerst hierher
// und wird dort entschieden. Der Test in quellenliste.test.ts schlägt an, wenn ein Rechner einen Dienst nutzt, der hier nicht steht.
// Stufen: R rechnet, B wirkt nach Bestätigung, A nur Anzeige, H Hintergrund oder Suche, – nicht eingebunden.

import liste from './quellenliste.json'

export type Rechner = 'fgs' | 'swc' | 'vrc' | 'kc'
export type Stufe = 'R' | 'B' | 'A' | 'H' | '–'
export interface ListenQuelle {
  id: string; name: string; anbieter: string; gruppe: string; hosts: string[]; wofuer: string
  rechner: Record<Rechner, { ist: Stufe; soll: Stufe }>
}
export const QUELLENLISTE = liste as ListenQuelle[]
/** Noch umzusetzende Entscheide eines Rechners */
export const offeneEntscheide = (r: Rechner) => QUELLENLISTE.filter(q => q.rechner[r].ist !== q.rechner[r].soll)
/** Dienste, die ein Rechner nutzt oder nutzen soll */
export const hostsVon = (r: Rechner): Set<string> =>
  new Set(QUELLENLISTE.filter(q => q.rechner[r].ist !== '–' || q.rechner[r].soll !== '–').flatMap(q => q.hosts))
