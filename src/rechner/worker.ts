// ── Web Worker: Rechnung abseits der Karte ──
// Nachricht {id, osm (Overpass roh), av, sosf (GeoJSON roh), nid, fall, kataster, park (amtliche Parkfelder), luftbild
// ({blob, box, px} | null), vsig (V_sig-Linien des Geoportals Stadt Bern mit Bereich | null)}
// -> {id, ok, rechnung} bzw. {id, ok: false, fehler}. Das Luftbild wird hier dekodiert (OffscreenCanvas) und behalten.

import { osmParsen } from '../daten/osm'
import { avParsen, type GeoJson } from '../daten/av'
import { rechneFall } from './index'
import { bildAusPixeln, type Bild } from './luftbild'
import type { Fall } from '../fall'
import type { KatasterBaum } from '../daten/baumkataster'
import type { KatasterFeld } from '../daten/parkkataster'
import type { LuftbildRoh } from '../daten/luftbild'
import { vsigTempo, type VsigLinie } from '../daten/vsig'
import type { Bereich } from '../daten/haltestellen'

interface Auftrag {
  id: number; osm: unknown; av: GeoJson; sosf: GeoJson | null; nid: number | null; fall: Fall
  kataster: { baeume: KatasterBaum[]; quellenangabe: string } | null
  park: { felder: KatasterFeld[]; quellenangabe: string } | null
  luftbild: LuftbildRoh | null
  /** signalisierte Höchstgeschwindigkeit (Geoportal Stadt Bern): Tempo der Zufahrten vor OSM (Nutzerentscheid 21.10.2026) */
  vsig?: { linien: VsigLinie[]; bereich: Bereich } | null
}

let bildSchl = '', bild: Bild | null = null

async function dekodieren(lb: LuftbildRoh): Promise<Bild> {
  const schl = lb.box.join(',')
  if (bild && bildSchl === schl) return bild
  const bmp = await createImageBitmap(lb.blob)
  const cv = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = cv.getContext('2d')!
  ctx.drawImage(bmp, 0, 0)
  const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data
  bild = bildAusPixeln(px, bmp.width, bmp.height, lb.box, 4)
  bildSchl = schl
  return bild
}

self.onmessage = async (ev: MessageEvent<Auftrag>) => {
  const { id, osm, av, sosf, nid, fall, kataster, park, luftbild, vsig } = ev.data
  try {
    let b: Bild | null = null
    if (luftbild) { try { b = await dekodieren(luftbild) } catch { b = null } }
    const r = rechneFall(osmParsen(osm as Parameters<typeof osmParsen>[0]), avParsen(av), sosf ? avParsen(sosf) : [], nid, fall, kataster, b,
      park ?? null, vsig ? vsigTempo(vsig) : null)
    if (luftbild && !b) r.meldungen.push('Luftbild nicht lesbar: Streifen aus OSM + AV.')
    ;(self as unknown as Worker).postMessage({ id, ok: true, rechnung: r })
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ id, ok: false, fehler: String((e as Error)?.message ?? e) })
  }
}
