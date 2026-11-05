import type { Szene } from './cesiumSzene'
import type { KameraModus, Szene3D } from './modell'
import { anfragenFolge } from './ladevorgaenge'

export interface AnzeigeOptionen {
  gebaeude: boolean; baeume: boolean; bruecken: boolean; fahrzeuge: boolean; personen: boolean
  luftbild: boolean; schatten: boolean; pruefung: boolean
}

/** Auch der erste Abgleich nach dem Öffnen verwendet die aktuellen Wünsche. Nur jüngste Ergebnisse übernehmen. */
export function ansichtAbgleich() {
  const folge = anfragenFolge()
  let gezeigt: Szene3D | null = null, bruecken: boolean | null = null, kameraKey: string | null = null, kameraImpuls = -1
  return {
    verwerfen: () => folge.beginnen(),
    async anwenden(s: Szene, modell: Szene3D, o: AnzeigeOptionen, modus: KameraModus, impuls = 0): Promise<KameraModus | null> {
      const nr = folge.beginnen()
      // Wünsche vor dem ersten await setzen, damit ein Ausschalten auch laufende Abrufe erreicht.
      const ebenen = [s.gebaeude(o.gebaeude), s.baeume(o.baeume), s.bruecken(o.bruecken)]
      try {
        s.kategorie('fahrzeuge', o.fahrzeuge); s.kategorie('personen', o.personen)
        s.luftbild(o.luftbild); s.schatten(o.schatten); s.pruefung(o.pruefung)
      } catch (e) {
        await Promise.allSettled(ebenen)
        throw e
      }
      await Promise.all(ebenen)
      if (!folge.aktuell(nr)) return null
      if (gezeigt !== modell || bruecken !== o.bruecken) {
        await s.zeigen(modell)
        if (!folge.aktuell(nr)) return null
        gezeigt = modell; bruecken = o.bruecken
      }
      const key = JSON.stringify([modell.kamera, modus, o.bruecken])
      if (kameraKey === key && kameraImpuls === impuls) return modus
      const tatsaechlich = await s.kamera(modus)
      if (!folge.aktuell(nr) || tatsaechlich === null) return null
      kameraImpuls = impuls
      kameraKey = JSON.stringify([modell.kamera, tatsaechlich, o.bruecken])
      return tatsaechlich
    },
  }
}
