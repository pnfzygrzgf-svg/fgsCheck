import { lv95 } from '../../geo'
import { quelle } from '../quellenregister'
import { ladeZuerich, zhTempoLesen, zhUrl, zhZonenLesen, type ZhArt } from './gemeinsam/zuerich'

const beschreibung = (art: ZhArt) => ({ quelle: quelle(art === 'tempo' ? 'zh.tempo' : 'zh.zone')!, thema: 'tempo' as const,
  format: 'geojson' as const, datenart: 'signalisiert' as const, datenstand: null,
  abdeckung: { inhalt: art === 'tempo' ? 'heutige signalisierte Geschwindigkeiten' : 'bestehende Verkehrszonen',
    vollstaendigkeit: 'unbekannt' as const, einschraenkungen: ['nur Stadt Zürich', 'Zuordnung zu Strasse und Zone prüfen', 'Fahrverbot ist kein Tempo 0'] },
  url: (lat: number, lon: number, radiusM: number) => zhUrl(art, lv95(lat, lon), radiusM),
  laden: (lat: number, lon: number, radiusM: number, signal?: AbortSignal) => ladeZuerich(art, lv95(lat, lon), radiusM, signal) })
export const ZUERICH_TEMPO = { ...beschreibung('tempo'), umwandeln: zhTempoLesen }
export const ZUERICH_ZONEN = { ...beschreibung('zonen'), umwandeln: zhZonenLesen }
