import { einheit, sub } from '../geo'
import type { StreifenErgebnis } from '../rechner/typen'
import type { RegionalSnapshot } from '../daten/anbieter/gemeinsam/regional'
import type { ZhStrasse } from '../daten/anbieter/gemeinsam/zuerichZuordnung'
import { bundHinweise } from '../daten/anbieter/gemeinsam/bundHinweise'
import type { BedarfBlock, DatenquelleId, QuellenOption, Vorbelegung } from './fallBedarf'
/** Bundesquellen ergänzen Auswahlmöglichkeiten; keine Vorbelegung wird dadurch automatisch wirksam. */
export function bundVorbelegen(st: StreifenErgebnis[], s: RegionalSnapshot, strassen: ZhStrasse[], w: Vorbelegung, hand?: BedarfBlock): void {
  const optionen = new Map<string, QuellenOption[]>()
  const add = (p: string, q: QuellenOption) => {
    const xs = optionen.get(p) ?? []
    const alt = xs.find(x => x.id === q.id && JSON.stringify(x.wert) === JSON.stringify(q.wert))
    if (alt) alt.text += `; ${q.text}`
    else xs.push(q)
    optionen.set(p, xs)
  }
  for (const s0 of st) {
    const u = einheit(sub(s0.p1, s0.p0)), r: [number,number] = [-u[1], u[0]]
    for (const h of bundHinweise(s, s0.m, r, strassen)) {
      const b = h.objekt.bund!, q = { id: `regional.${h.quelleId}` as DatenquelleId, quelle: 'vorschlag' as const, text: h.text, datenstand: h.datenstand }
      if (b.typ === 'strasse') add('strassentyp', { ...q, wert: 'verkehrsorientiert', zusatz: 'TLM-Verkehrsbedeutung; Normzuordnung prüfen' })
      if (b.typ === 'tram') {
        add('tram', { ...q, wert: 'fahrbahn', zusatz: 'Gleis in Fahrbahn bestätigen' })
        add('tram', { ...q, wert: 'eigentrassee', zusatz: 'Eigentrassee bestätigen' })
        add('tramHaltestellenbereich', { ...q, wert: true, zusatz: 'Haltestellenbezug zusätzlich vor Ort bestätigen' })
      }
      if (b.typ === 'bauzone') {
        add('innerorts', { ...q, wert: true, zusatz: 'Bauzone ist keine Ortstafel; Innerortslage prüfen' })
        add('q3.bebaut', { ...q, wert: true, zusatz: 'tatsächliche Bebauung bestätigen' })
        if (/arbeit|industrie|gewerbe/i.test(h.objekt.name)) add('q3.gewerbe', { ...q, wert: true, zusatz: 'tatsächliche Nutzung bestätigen' })
      }
      const gruende = b.typ === 'bildung' ? ['schule','kindergarten'] : b.typ === 'schule' ? ['schule'] : b.typ === 'kindergarten' ? ['kindergarten'] : ['gesundheit','gemeinschaft','spital'].includes(b.typ) ? ['heim'] : []
      for (const g of gruende) {
        const vorher = hand?.felder.beduerfnis?.wert ?? w.beduerfnis?.wert
        add('beduerfnis', { ...q, wert: [...new Set([...(Array.isArray(vorher) ? vorher as string[] : []), g])], zusatz: `${g === 'heim' ? 'Heim/Spital' : g === 'schule' ? 'Volksschule' : 'Kindergarten'} und Bezug zur Querung bestätigen` })
      }
    }
  }
  for (const [p, qs] of optionen) {
    if (!w[p]) w[p] = { wert: null, quelle: 'vorschlag', text: 'Bundesquelle liefert einen räumlichen Hinweis. Fachliche Aussage neben dem Feld bestätigen.', bestaetigungNoetig: true }
    w[p].quellenOptionen = [...(w[p].quellenOptionen ?? []), ...qs.map(q => ({ ...q, text:q.text.slice(0,7900) }))]
  }
}
