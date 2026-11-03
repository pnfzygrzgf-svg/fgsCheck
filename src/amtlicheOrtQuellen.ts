import { verbindeBundesBudget } from './daten/anbieter/gemeinsam/bundesBudget'
import { useCallback, useRef, useState } from 'react'
import { BAV_QUELLENANGABE, bavDatenstandText } from './daten/anbieter/gemeinsam/bav'
import { GEBIET_QUELLENANGABE } from './daten/anbieter/gemeinsam/gebiet'
import { ladeOrtQuellen, LEERER_ORTQUELLEN_STAND } from './daten/anbieter/gemeinsam/ortQuellen'
import type { AmtlicheQuellen, OrtQuellenStand } from './daten/anbieter/gemeinsam/typen'
import type { Abruf } from './daten/holen'
import type { QuellenQualitaet } from './daten/anbieter/gemeinsam/qualitaet'

export interface AmtlicherFall { amtlicheQuellen?: AmtlicheQuellen; quellen: { bav?: string; gebiet?: string } }
export interface QuellenZeile extends QuellenQualitaet { name: string; objekte?: string; ms?: number; bytes?: number; server?: string; fehler?: string }

/** Eigener Auftrag schützt auch bei wiederholtem Aktualisieren am selben Ort vor verspäteten Antworten. */
export function useAmtlicheOrtQuellen<F extends AmtlicherFall>(
  setFall: React.Dispatch<React.SetStateAction<F | null>>, setzeQuelle: (key: string, s: QuellenZeile) => void) {
  const [stand, setStand] = useState<OrtQuellenStand>(LEERER_ORTQUELLEN_STAND)
  const nr = useRef(0), ctrl = useRef<AbortController | null>(null)
  const zurueck = useCallback(() => { nr.current++; ctrl.current?.abort(); setStand(LEERER_ORTQUELLEN_STAND) }, [])
  const starten = useCallback((lat: number, lon: number, signal: AbortSignal) => {
    ctrl.current?.abort()
    const eigen = new AbortController(), id = ++nr.current
    verbindeBundesBudget(signal, eigen.signal)
    ctrl.current = eigen
    const abbrechen = () => eigen.abort()
    if (signal.aborted) eigen.abort(); else signal.addEventListener('abort', abbrechen, { once: true })
    setStand(LEERER_ORTQUELLEN_STAND)
    // Alte Ausschnitte bleiben in der gespeicherten Datei; der neu geöffnete Fall enthält nur neu verwendete Quelldaten.
    setFall(f => { if (!f) return f; const { amtlicheQuellen: _alt, quellen, ...rest } = f
      const { bav: _bav, gebiet: _gebiet, ...andere } = quellen
      return { ...rest, quellen: andere } as F })
    const empfangen = <K extends keyof AmtlicheQuellen>(key: K, s: OrtQuellenStand[K], r?: Abruf<NonNullable<AmtlicheQuellen[K]>>) => {
      if (eigen.signal.aborted || id !== nr.current) return
      setStand(v => ({ ...v, [key]: s }))
      const name = key === 'bav' ? 'BAV-Haltestellen (Bus/Tram, ±200 m)' : 'Gebietsbestimmung (swisstopo, Punkt und ±200 m)'
      const daten = 'daten' in s ? s.daten : null
      const inhalt = daten ? key === 'bav' ? `${(daten as NonNullable<AmtlicheQuellen['bav']>).halte.length} ${(daten as NonNullable<AmtlicheQuellen['bav']>).halte.length === 1 ? 'Haltestellenpunkt' : 'Haltestellenpunkte'}` :
        `${(daten as NonNullable<AmtlicheQuellen['gebiet']>).amOrt.map(g => `${g.name} (${g.kanton}, BFS ${g.bfs})`).join(' / ')}; ` +
        `${(daten as NonNullable<AmtlicheQuellen['gebiet']>).imAusschnitt.length} ${(daten as NonNullable<AmtlicheQuellen['gebiet']>).imAusschnitt.length === 1 ? 'Gemeinde' : 'Gemeinden'} im Ausschnitt` : ''
      setzeQuelle(key, { name, ...('fehler' in s ? { fehler: s.fehler } : 'offen' in s ?
        { objekte: 'nicht geladen; bei Bedarf ausdrücklich laden' } : daten ?
        { objekte: `${inhalt}; ${r ? 'abgerufen' : 'gespeicherter Stand'} ${daten.abgerufen}`,
          datenstand: key === 'bav' ? `${bavDatenstandText(daten as NonNullable<AmtlicheQuellen['bav']>)} (Ebene)` :
            `${(daten as NonNullable<AmtlicheQuellen['gebiet']>).jahr} (Jahresstand)`,
          ...(r ? { ms: r.ms, bytes: r.bytes, server: r.quelle } : { server: 'gespeicherter Ausschnitt' }) } : {}) })
      if (daten) setFall(f => f ? { ...f, amtlicheQuellen: { ...f.amtlicheQuellen, [key]: daten },
        quellen: { ...f.quellen, [key]: key === 'bav' ? BAV_QUELLENANGABE : GEBIET_QUELLENANGABE } } : f)
    }
    void ladeOrtQuellen(lat, lon, eigen.signal, {
      bav: (s, r) => empfangen('bav', s, r), gebiet: (s, r) => empfangen('gebiet', s, r),
    }).finally(() => signal.removeEventListener('abort', abbrechen))
  }, [setFall, setzeQuelle])
  return { stand, starten, zurueck }
}
