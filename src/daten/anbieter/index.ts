import { ZUERICH_TEMPO, ZUERICH_ZONEN } from './zuerich'
// Register der bereits angebundenen Anbieter. E0: nur Berner Tempo; keine neue Gebietswahl oder Priorisierung.
import { NPVM_ANBIETER } from './npvm'
import { BERN_TEMPO } from './bernTempo'
import { BAV_ANBIETER } from './gemeinsam/bav'

export const ANBIETER = { 'bern.vsig': BERN_TEMPO, 'bav.halt': BAV_ANBIETER, 'are.npvm': NPVM_ANBIETER, 'zh.tempo': ZUERICH_TEMPO, 'zh.zone': ZUERICH_ZONEN } as const
