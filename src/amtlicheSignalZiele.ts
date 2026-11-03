import { dist, type P } from './geo'
import { osmParsen } from './knotensicht/daten/osm'
import { OsmNetz } from './knotensicht/rechner/netz'
import { knotenFinden, knotenInfo, keineZufahrt } from './knotensicht/rechner/knoten'
import type { SignalZiel } from './daten/anbieter/gemeinsam/regionalSignale'
/** Angebote für alle Zufahrten naher Knoten; Auswahl bestätigt erst die fachliche Zugehörigkeit. */
export function amtlicheSignalZiele(roh: unknown, streifen: { m: P }[]): SignalZiel[] {
  if (!roh || !streifen.length) return []
  const netz = new OsmNetz(osmParsen(roh as Parameters<typeof osmParsen>[0]))
  return knotenFinden(netz).filter(id => streifen.some(s => dist(s.m, netz.p(id)) <= 20)).flatMap(id => {
    const info = knotenInfo(netz, id)
    return info?.arme.filter(a => !keineZufahrt(a)).map(a => ({ knoten: id, zufahrt: a.key, p: info.p, name: `Knoten ${info.name}, Zufahrt ${a.nr}: ${a.name || a.hw} (${a.himmel})` })) ?? []
  })
}
