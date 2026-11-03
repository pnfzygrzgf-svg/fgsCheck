import { add, einheit, sub, type P } from '../geo'
import type { StreifenErgebnis } from '../rechner/typen'
import type { ZuerichSnapshot } from '../daten/anbieter/gemeinsam/zuerich'
import { zhStandText } from '../daten/anbieter/gemeinsam/zuerich'
import { zuerichEntlang, type ZhStrasse } from '../daten/anbieter/gemeinsam/zuerichZuordnung'
import type { QuellenOption, Vorbelegung } from './fallBedarf'

/** Amtliche Linien und Zonen gemeinsam prüfen; Widersprüche überschreiben keine eigenen Eingaben. */
export function zuerichVorbelegen(st: StreifenErgebnis[], s: ZuerichSnapshot, strassen: ZhStrasse[], w: Vorbelegung,
  osmTempo: QuellenOption | undefined, osmZone: { wert: unknown; text: string }, hinweis: (p: string, t: string) => void): void {
  const proben = st.flatMap(t => {
    const u = einheit(sub(t.p1, t.p0)), r: P = [-u[1], u[0]]
    return [-8, 0, 8].map(d => ({ p: add(t.m, r, d), richtung: r }))
  })
  const x = zuerichEntlang(s, proben, strassen)
  if (x.status === 'aussen') return
  const meta = `Stadt Zürich; Tempo: Datenstand ${s.tempo ? zhStandText(s.tempo) : 'unbekannt'}, abgerufen ${s.tempo?.abgerufen ?? 'noch nicht geladen'}; ` +
    `Verkehrszonen: Datenstand ${s.zonen ? zhStandText(s.zonen) : 'unbekannt'}, abgerufen ${s.zonen?.abgerufen ?? 'noch nicht geladen'}`
  const text = `${x.strasse ? `${x.strasse}: ` : ''}${x.grund}; ${meta}; Abschnitte ${x.linien.join(', ') || 'offen'}, Zonen ${x.zonen.join(', ') || 'ohne eindeutigen Treffer'}`
  const altTempo = w.vSig, altZone = w.tempoRegime
  const tempo: QuellenOption = { id: 'zh.tempo', wert: x.tempo ?? x.vorschlag ?? null, quelle: 'amtlich', text, datenstand: s.tempo ? zhStandText(s.tempo) : 'unbekannt', ...(x.bedingung ? { zusatz: x.bedingung } : {}), ...(x.tempo !== null ? { vorgabe: true as const } : {}) }
  w.vSig = { wert: x.tempo ?? x.vorschlag ?? null, quelle: 'amtlich', text, ...(x.vorschlag !== undefined ? { bestaetigungNoetig:true as const } : {}), quellenOptionen: [tempo, ...(osmTempo ? [osmTempo] : [])] }
  // Ein leerer Polygon-Treffer ist keine belegte Vollständigkeit: «Strecke» nur zur Bestätigung vorschlagen.
  const regime = x.status === 'zugeordnet' ? x.zone ?? 'strecke' : null
  const zone: QuellenOption = { id: 'zh.zone', datenstand:s.zonen ? zhStandText(s.zonen) : 'unbekannt', wert: regime, quelle: x.zone ? 'amtlich' : 'vorschlag', text, vorgabe: true }
  w.tempoRegime = { wert: regime, quelle: zone.quelle, text, quellenOptionen: [zone,
    { id: 'osm.zone', wert: osmZone.wert, quelle: 'osm', text: osmZone.text || 'Keine eindeutige Zonenangabe in OSM.' }],
    ...(regime === 'strecke' ? { bestaetigungNoetig: true as const } : {}) }
  if (x.status !== 'zugeordnet') { hinweis('vSig', text); hinweis('tempoRegime', text) }
  else {
    if (altTempo?.wert != null && altTempo.wert !== x.tempo) hinweis('vSig', `${text}; bisheriger Vorschlag ${altTempo.wert} km/h weicht ab`)
    if (osmZone.wert != null && osmZone.wert !== regime) hinweis('tempoRegime', `${text}; OSM widerspricht (${String(osmZone.wert)}); amtliche, untereinander passende Linien und Zone haben Vorrang`)
    else if (altZone?.wert != null && altZone.wert !== regime && altZone.quelle === 'osm') hinweis('tempoRegime', text)
  }
}
