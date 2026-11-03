import { istAbbruch, type Abruf } from '../../holen'
import { BAV_RADIUS_M, BAV_ANBIETER } from './bav'
import { ladeGebiet } from './gebiet'
import type { BavSnapshot, GebietSnapshot, Stand } from './typen'

export const LEERER_ORTQUELLEN_STAND = { bav: { offen: true as const }, gebiet: { offen: true as const } }
export interface OrtQuellenEmpfang {
  bav: (s: Stand<BavSnapshot>, abruf?: Abruf<BavSnapshot>) => void
  gebiet: (s: Stand<GebietSnapshot>, abruf?: Abruf<GebietSnapshot>) => void
}
/** Unabhängig von AV und OSM. Auch beim Wiederöffnen frisch laden; beide Dienste haben einen eigenen Fehlerzustand. */
export async function ladeOrtQuellen(lat: number, lon: number, signal: AbortSignal, empfang: OrtQuellenEmpfang): Promise<void> {
  const laden = async <T>(abrufen: () => Promise<Abruf<T>>, senden: (s: Stand<T>, r?: Abruf<T>) => void) => {
    if (signal.aborted) return
    senden({ laedt: true })
    try { const r = await abrufen(); if (!signal.aborted) senden({ daten: r.daten }, r) }
    catch (e) { if (!signal.aborted && !istAbbruch(e)) senden({ fehler: (e as Error).message }) }
  }
  await Promise.all([
    laden(() => BAV_ANBIETER.laden(lat, lon, BAV_RADIUS_M, signal, true), empfang.bav),
    laden(() => ladeGebiet(lat, lon, BAV_RADIUS_M, signal, true), empfang.gebiet),
  ])
}
