import { BAUM_STAMM_M, type Hindernis } from './hindernisse'

export const BAUM_ANNAHME = 'Baumstämme: Für Katasterbäume wird ein Stammdurchmesser von 50 cm angenommen, entsprechend einem Kreis mit 25 cm Radius im Grundriss. ' +
  'Das ist kein gemessener Stammdurchmesser. Baumkronen werden in der Sichtrechnung nicht berücksichtigt. Abweichende Eingaben von Hand sind beim jeweiligen Baum ausgewiesen.'

export function baumStammText(h: Hindernis): string {
  if (h.art !== 'baum') return ''
  const d = (h.stamm || BAUM_STAMM_M) * 100
  const f = (v: number) => Number(v.toFixed(2)).toString().replace('.', ',')
  return `Stammdurchmesser ${f(d)} cm ${h.quelle !== 'hand' && d === 50 ? 'angenommen' : '(Eingabe)'}; Radius ${f(d / 2)} cm`
}
