// ── Web Worker: Rechnung abseits der Karte ──
// Nachricht {id, osm (Overpass roh), av, sosf (GeoJSON roh), nid, fall, kataster, park (amtliche Parkfelder), luftbild
// ({blob, box, px} | null), vsig (V_sig-Linien des Geoportals Stadt Bern mit Bereich | null), avZentrum (Ladeort, LV95), hoehen
// (Längsneigung der Knotensicht je «Knoten|Zufahrt»)}
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
import { type P, lv95 } from '../geo'
import { AV_RADIUS_M } from '../abdeckung'
import { knotensichtAnfuegen } from '../tue/knotensicht'
import type { HoehenVorgabe } from '../knotensicht/rechner/typen'

interface Auftrag {
  id: number; osm: unknown; av: GeoJson; sosf: GeoJson | null; nid: number | null; fall: Fall
  kataster: { baeume: KatasterBaum[]; quellenangabe: string } | null
  park: { felder: KatasterFeld[]; quellenangabe: string } | null
  luftbild: LuftbildRoh | null
  /** signalisierte Höchstgeschwindigkeit (Geoportal Stadt Bern): Tempo der Zufahrten vor OSM (Nutzerentscheid 21.10.2026) und, wie in
   * der Vorbelegung des Bedarfs, Strecke oder Zone der unmarkierten OSM-Querung (Begegnungszone, 30.10.2026) */
  vsig?: { linien: VsigLinie[]; bereich: Bereich } | null
  /** Trottoirüberfahrt (K2/K3): Mitte des AV-Ausschnitts und Längsneigung der Knotensicht aus dem Höhenmodell */
  avZentrum?: P; hoehen?: Record<string, HoehenVorgabe> | null
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
  const { id, osm, av, sosf, nid, fall, kataster, park, luftbild, vsig, avZentrum, hoehen } = ev.data
  try {
    let b: Bild | null = null
    if (luftbild) { try { b = await dekodieren(luftbild) } catch { b = null } }
    const r = rechneFall(osmParsen(osm as Parameters<typeof osmParsen>[0]), avParsen(av), sosf ? avParsen(sosf) : [], nid, fall, kataster, b,
      park ?? null, vsig ? vsigTempo(vsig) : null, vsig ?? null)
    if (luftbild && !b) r.meldungen.push('Luftbild nicht lesbar: Streifen aus OSM + AV.')
    // Trottoirüberfahrt: Knotensicht der Einbiegenden (Kern des SichtweitenCheck); ohne Trottoirüberfahrt geschieht nichts
    knotensichtAnfuegen(r, { osm, av }, fall, { park: park ?? null, baeume: kataster ?? null, vsig: vsig ?? null, avZentrum: avZentrum ?? lv95(fall.ort.lat, fall.ort.lon),
      avRadius: AV_RADIUS_M, hoehen: hoehen ?? null })
    ;(self as unknown as Worker).postMessage({ id, ok: true, rechnung: r })
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ id, ok: false, fehler: String((e as Error)?.message ?? e) })
  }
}
