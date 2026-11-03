import { add, einheit, sub, type P } from '../geo'
import type { StreifenErgebnis } from '../rechner/typen'
import type { RegionalSnapshot } from '../daten/anbieter/gemeinsam/regional'
import { regionalEntlang } from '../daten/anbieter/gemeinsam/regionalZuordnung'
import type { ZhStrasse } from '../daten/anbieter/gemeinsam/zuerichZuordnung'
import type { DatenquelleId, QuellenOption, Vorbelegung } from './fallBedarf'
export function regionalVorbelegen(st: StreifenErgebnis[], s: RegionalSnapshot, strassen: ZhStrasse[], w: Vorbelegung): void {
  const proben = st.flatMap(t => { const u = einheit(sub(t.p1, t.p0)), r: P = [-u[1], u[0]]; return [-8, 0, 8].map(d => ({ p: add(t.m, r, d), richtung: r })) })
  const treffer = regionalEntlang(s, proben, strassen)
  for (const [pfad, eigenschaft] of [['vSig', 'tempo'], ['tempoRegime', 'zone']] as const) {
    const options: QuellenOption[] = treffer.filter(t => t[eigenschaft] !== null).map(t => ({ id: `regional.${t.quelle}` as DatenquelleId, wert: t[eigenschaft], quelle: 'amtlich', text: `${t.name}: ${t.grund}; Datenstand ${t.datenstand}; Objekte ${t.ids.join(', ')}` }))
    if (!options.length) continue
    const alt = w[pfad], auto = treffer.find(t => t.sicher && t[eigenschaft] !== null), vorgabe = auto ? options.find(o => o.id === `regional.${auto.quelle}`) : undefined
    w[pfad] = { ...(vorgabe ? { wert: vorgabe.wert, quelle: vorgabe.quelle, text: vorgabe.text } : alt ?? { wert: null, quelle: 'vorschlag', text: 'Amtliche Quelle neben dem Feld wählen und bestätigen.' }),
      quellenOptionen: [...options.map(o => ({ ...o, ...(o === vorgabe ? { vorgabe: true as const } : {}) })), ...(alt?.quellenOptionen ?? [])],
      ...(!vorgabe && !alt ? { bestaetigungNoetig: true as const } : {}) }
  }
}
