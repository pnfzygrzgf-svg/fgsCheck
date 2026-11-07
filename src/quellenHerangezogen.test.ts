// Quellen im Bericht: nur, was für diesen Fall herangezogen wurde (06.11.2026)
import { describe, expect, it } from 'vitest'
import { bedarfQuellenIds, herangezogeneQuellen, GEOPORTAL_FELD_KEYS } from './quellenHerangezogen'
import { leererFall } from './fall'
import type { BefundBlatt } from './bedarf/befundblatt'
import type { Herkunft } from './bedarf/fallBedarf'

const blatt = (felder: Record<string, Herkunft>): BefundBlatt => ({ gebildet: { herkunft: new Map(Object.entries(felder)) } } as unknown as BefundBlatt)
const vor = (quelle: Herkunft['quelle'], optionen?: { id: string; vorgabe?: true }[]): Herkunft =>
  ({ zustand: 'vorbelegt', quelle, text: '', vorbelegt: { wert: 1, quelle: quelle!, text: '', ...(optionen ? { quellenOptionen: optionen } : {}) } } as unknown as Herkunft)

describe('Bedarf: Quellen, die ein Feld gefüllt haben', () => {
  const quellen = { vsig: 'x', richtplan: 'x', schulen: 'x', haltestellen: 'x', verkehrsdaten: 'x', taktil: 'x' }
  it('Zählstelle und NPVM erscheinen erst nach Bestätigung als Quelle', () => {
    const vorschlag = (id: string): Herkunft => ({ ...vor('vorschlag', [{ id, vorgabe: true }]), vorbelegt: { ...vor('vorschlag', [{ id, vorgabe: true }]).vorbelegt!, bestaetigungNoetig: true } })
    expect([...bedarfQuellenIds([blatt({ dtv: vorschlag('zh.dtv') })], {})]).toEqual([])
    expect([...bedarfQuellenIds([blatt({ dtv: vorschlag('are.npvm') })], {})]).toEqual([])
    const bestaetigt = (id: string): Herkunft => ({ zustand: 'hand', quelle: 'bestaetigt', text: '', wert: 9000, datenquelle: { id: id as never, text: 'x' } })
    expect([...bedarfQuellenIds([blatt({ dtv: bestaetigt('zh.dtv') })], {})]).toEqual(['zh.dtv'])
    expect([...bedarfQuellenIds([blatt({ dtv: bestaetigt('are.npvm') })], {})]).toEqual(['are.npvm'])
  })
  it('Geoportal-Vorbelegung über den Dienst des Felds; nur geladene Dienste', () => {
    const b = blatt({ vSig: vor('geoportal'), netz: vor('geoportal'), beduerfnis: vor('geoportal'), 'q3.gewerbe': vor('geoportal'), 'haltestelle.art': vor('geoportal') })
    expect([...bedarfQuellenIds([b], quellen)].sort()).toEqual(['bern.halt', 'bern.richtplan', 'bern.schulen', 'bern.vsig'])
  })
  it('Vorgabe unter den Quellenoptionen, gewählte Datenquelle von Hand, OSM und AV; «app.*» ist keine Quelle', () => {
    const b = blatt({ dtv: vor('amtlich', [{ id: 'bern.dtv' }, { id: 'are.npvm', vorgabe: true }]), vSig: { zustand: 'hand', quelle: 'hand', text: '', wert: 30, datenquelle: { id: 'zh.tempo', text: '' } },
      innerorts: vor('osm'), fahrbahnB: vor('av'), tempoRegime: vor('osm', [{ id: 'osm.zone', vorgabe: true }]), dtv2: vor('annahme', [{ id: 'app.dtv', vorgabe: true }]),
      offen: { zustand: 'offen', quelle: null, text: '' }, hand: { zustand: 'hand', quelle: 'hand', text: '', wert: 1 } })
    expect([...bedarfQuellenIds([b], quellen)].sort()).toEqual(['are.npvm', 'av', 'osm', 'zh.tempo'])
  })
  it('Annahme, die sich auf das Geoportal stützt, nennt den Dienst; Annahme aus OSM nicht', () => {
    const annahme = (text: string): Herkunft => ({ zustand: 'vorbelegt', quelle: 'annahme', text, vorbelegt: { wert: false, quelle: 'annahme', text } } as unknown as Herkunft)
    const b = blatt({ taktil: annahme('kein taktiles Aufmerksamkeitsfeld laut Geoportal Stadt Bern'), strassentyp: annahme('Hauptstrasse laut OSM') })
    expect([...bedarfQuellenIds([b], { ...quellen, strassenhierarchie: 'x' })]).toEqual(['bern.taktil'])
  })
  it('jedes Geoportal-Feld hat einen Fall-Schlüssel der Dienste', () => {
    const keys = ['vsig', 'verkehrsdaten', 'richtplan', 'taktil', 'nutzungszonen', 'oevLinien', 'strassenhierarchie', 'schulen', 'haltestellen']
    for (const ks of Object.values(GEOPORTAL_FELD_KEYS)) for (const k of ks) expect(keys).toContain(k)
  })
})

describe('herangezogene Quellen eines Falls', () => {
  it('Sichtprüfung: AV, OSM, Luftbild immer; Kataster nur mit übernommenem Hindernis; Höhen, amtlicher Übergang; ungenutzte Dienste nicht', () => {
    const f = leererFall(46.95, 7.44, 1)
    f.quellen = { av: 'a', osm: 'o', luftbild: 'l', vsig: 'v', richtplan: 'r', schulen: 's', gebiet: 'g', baumkataster: 'b', parkkataster: 'p' }
    expect(herangezogeneQuellen(f, null, [], []).ids).toEqual(['av', 'osm', 'swissimage'])
    f.hindernisse.push({ id: 'b1', art: 'baum', p: [0, 0], stamm: 0.5, quelle: 'kataster' })
    f.hindernisse.push({ id: 'p1', art: 'parkfeld', klasse: 'auto', ring: [[0, 0], [1, 0], [1, 1]], quelle: 'hand' })
    expect(herangezogeneQuellen(f, null, [], ['bern.dtm']).ids).toEqual(['av', 'osm', 'swissimage', 'bern.baum', 'bern.dtm'])
    const b = blatt({ vSig: vor('geoportal') })
    expect(herangezogeneQuellen(f, null, [b], []).ids).toEqual(['av', 'osm', 'swissimage', 'bern.baum', 'bern.vsig'])
  })
  it('Parkfelder aus den Vorschlägen der Rechnung zählen als herangezogen', () => {
    const f = leererFall(46.95, 7.44, 1)
    f.quellen = { av: 'a', osm: 'o', parkkataster: 'p' }
    const r = { vorschlaege: [{ hindernis: { id: 'p1', art: 'parkfeld', klasse: 'auto', ring: [], quelle: 'kataster' } }] } as never
    expect(herangezogeneQuellen(f, r, [], []).ids).toContain('bern.park')
    expect(herangezogeneQuellen(f, null, [], []).ids).not.toContain('bern.park')
  })
  it('DTV-Ersatzwert: Verkehrsdaten und NPVM abgefragt, nicht verwendet, mit Grund', () => {
    const dtv = (optionen: unknown[]) => ({ zustand: 'vorbelegt', quelle: 'annahme', text: '', vorbelegt: { wert: 500, quelle: 'annahme', text: '', quellenOptionen: optionen } }) as unknown as Herkunft
    const ersatz = { id: 'app.dtv', wert: 500, vorgabe: true, text: 'DTV 500 angenommen: keine Verkehrsdaten im Geoportal Stadt Bern (nur Strassen über 2000 Fz/Tag erfasst)' }
    const f = leererFall(46.95, 7.44, 1)
    const o = herangezogeneQuellen(f, null, [blatt({ dtv: dtv([ersatz, { id: 'are.npvm', wert: null, text: 'NPVM: keine eindeutig passende Modellstrecke; fehlender Eintrag bedeutet nicht keinen Verkehr' }]) })], [])
    expect(o.ohneTreffer).toEqual([{ id: 'bern.dtv', grund: 'keine Verkehrsdaten im Geoportal Stadt Bern (nur Strassen über 2000 Fz/Tag erfasst)' },
      { id: 'are.npvm', grund: 'keine eindeutig passende Modellstrecke' }])
    expect(o.ids).not.toContain('bern.dtv')
    // Modell nur als Vergleich; noch nicht geladen: kein Eintrag
    expect(herangezogeneQuellen(f, null, [blatt({ dtv: dtv([{ id: 'are.npvm', wert: 417, text: 'x' }]) })], []).ohneTreffer[0].grund).toContain('Vergleichswert')
    expect(herangezogeneQuellen(f, null, [blatt({ dtv: dtv([{ id: 'are.npvm', wert: null, text: 'Noch kein verwendbarer NPVM-Ausschnitt' }]) })], []).ohneTreffer).toEqual([])
  })
})
