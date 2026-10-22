// Tests Automatik Paket C (21.10.2026) und Korrekturen nach Prüfung: Vorbelegung aus Richtplan, Strassenhierarchie, V_sig, Schulen, taktilen Markierungen,
// Nutzungszonen, ÖV-Linien (Geoportal Stadt Bern) und OSM (Heime, Schulen ausserhalb Berns, Vortrittszeichen). Künstliche Strasse wie
// vorbelegungGeo.test.ts: Hauptstrasse West–Ost (y = 0), Fahrbahn 8 m, Tempo 50 (OSM), Übergang bei x = 0; je Regel beide Seiten der
// Schwelle, Bern bzw. ausserhalb, Dienstausfall und Widersprüche.
import { describe, expect, it } from 'vitest'
import { wgs, type P } from '../geo'
import type { OsmDaten, OsmKnoten, OsmWeg, VortrittZeichen } from '../daten/osm'
import type { AvFlaeche } from '../daten/av'
import type { Bereich, HaltestellenErgebnis, OevHalt } from '../daten/haltestellen'
import type { ShLinie, StLinie, StrassentypCode } from '../daten/strassenhierarchie'
import { HIERARCHIE_ID, STRASSENTYP_ID, strassenKlasse } from '../daten/strassenhierarchie'
import type { SchulOrt, SchulenErgebnis } from '../daten/schulen'
import type { NzFlaeche } from '../daten/nutzungszonen'
import { NZ_GEWERBE } from '../daten/nutzungszonen'
import type { OevLinie } from '../daten/oevLinien'
import type { TvmFeld, TvmLinie } from '../daten/taktil'
import { rechneFall } from '../rechner/index'
import { leererFall, type Fall } from '../fall'
import { querungen, vorbelegen, type GeoVorbelegung } from './vorbelegung'
import { automatik, type AutoGeo } from './automatik'
import { AUTO_C, ortAbstandText, abstandOrt, querAbstand, querungsAchse } from './automatikC'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BedarfAbschnitt } from '../BedarfPanel'
import { DETAIL_HAND_ANNAHME, befundblatt, typText } from './befundblatt'
import { bedarfLesen } from './fallBedarf'
import { frageVon } from './feldhilfen'
import { vorbehaltFelder } from './kompakt'
import { beurteile } from './entscheid'
import { fall as testfall } from './testfaelle'
import { kurzform } from './zusammenfassung'
import type { Vorbelegung } from './fallBedarf'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
function weg(id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg {
  return { id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) }
}
const knoten = (id: number, x: number, y: number, tags: Record<string, string>): OsmKnoten => ({ id, tags, lat: ll(x, y)[0], lon: ll(x, y)[1] })
const HAUPT = { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' }
const UEB = knoten(12, 0, 0, { highway: 'crossing', crossing: 'marked' })
const OSM: OsmDaten = { wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], HAUPT)], tram: [], ampeln: [], querungen: [], relationen: [],
  uebergaenge: [UEB] }
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
const fallMit = (): Fall => leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
const r = rechneFall(OSM, AV, [], 12, fallMit(), null)
const g = querungen(r.streifen)[0]
const s = g.streifen[0]
const RAND_X = Math.max(...s.umriss.map(p => p[0])) - O[0]
const BQ: Bereich = { mitte: O, radiusM: 150, form: 'quadrat' }
const vor = (geo: GeoVorbelegung) => vorbelegen(g, fallMit(), [], geo)

// Strassenachse (längs) und Linien quer zur Strasse bei x
const LAENGS: P[][] = [[lv(-200, 0), lv(200, 0)]]
const quer = (x: number, y0 = -40, y1 = 40): P[][] => [[lv(x, y0), lv(x, y1)]]
const hier = (typId: number, teile = LAENGS, strasse = 'Hauptstrasse'): ShLinie =>
  ({ id: `h${typId}`, strasse, typId, typ: HIERARCHIE_ID[typId] ?? null, text: '', teile })
const styp = (id: number): StLinie => {
  const typ = STRASSENTYP_ID[id] as StrassentypCode
  return { id: `t${id}`, strasse: 'Hauptstrasse', typId: id, typ, klasse: strassenKlasse(typ), text: typ, teile: LAENGS }
}
const SH = (h: ShLinie[], t: StLinie[] = []): GeoVorbelegung['strassenhierarchie'] => ({ hierarchie: h, typen: t, bereich: BQ })
const VS = (v: (number | null)[], teile: P[][][] = v.map(() => LAENGS)): GeoVorbelegung['vsig'] =>
  ({ linien: v.map((x, i) => ({ id: `v${i}`, strasse: 'Hauptstrasse', vSig: x, teile: teile[i] })), bereich: BQ })

describe('Paket C: Tempo (V_sig) und Strecke/Zone (Strassenhierarchie)', () => {
  it('V_sig über der Achse hat Vorrang vor OSM; Abweichung mit Hinweis; leerer V_sig bzw. Ausfall: OSM bleibt', () => {
    const v = vor({ vsig: VS([30]) })
    expect(v.werte.vSig).toMatchObject({ wert: 30, quelle: 'geoportal' })
    expect(v.werte.vSig.text).toContain('Sichtrechner 50 km/h (OSM bzw. Annahme)')
    expect(v.hinweise.join(' ')).toContain('Signalisiertes Tempo über der Querung 30 km/h (Geoportal Stadt Bern), der Sichtrechner rechnet entlang der Zufahrten mit 50 km/h')
    expect(vor({ vsig: VS([50]) }).werte.vSig).toMatchObject({ wert: 50, quelle: 'geoportal' })
    expect(vor({ vsig: VS([50]) }).hinweise.join(' ')).not.toContain('nach OSM')
    const leer = vor({ vsig: VS([null]) })
    expect(leer.werte.vSig).toMatchObject({ wert: 50, quelle: 'osm' })
    expect(leer.hinweise.join(' ')).toContain('ohne Wert')
    const aus = vor({ vsig: { fehler: 'HTTP 503' } })
    expect(aus.werte.vSig.quelle).toBe('osm')
    expect(aus.hinweise.join(' ')).toContain('nicht erreichbar (HTTP 503): Tempo aus OSM')
    // Linie quer zur Strasse (Querstrasse) bzw. nicht abgedeckt: kein Wert
    expect(vor({ vsig: VS([30], [quer(0)]) }).werte.vSig.quelle).toBe('osm')
    expect(vor({ vsig: { ...VS([30])!, bereich: { mitte: lv(400, 0), radiusM: 150, form: 'quadrat' } } as GeoVorbelegung['vsig'] }).werte.vSig.quelle).toBe('osm')
  })
  it('Grenze zweier Abschnitte über der Achse: höherer Wert', () => {
    const v = vor({ vsig: VS([30, 50], [[[lv(-200, 0), lv(0, 0)]], [[lv(0, 0), lv(200, 0)]]]) })
    expect(v.werte.vSig.wert).toBe(50)
    expect(v.werte.vSig.text).toContain('Grenze zweier Abschnitte (30 bzw. 50 km/h)')
  })
  it('Tempo 30 ohne Zonenangabe: Quartierstrasse (auch ergänzend) Zone, Basisnetz Strecke (Annahmen), Quartierverbindungsstrasse offen', () => {
    const t = (typId: number, typen: StLinie[] = []) => vor({ vsig: VS([30]), strassenhierarchie: SH([hier(typId)], typen) })
    expect(t(1000).werte.tempoRegime).toMatchObject({ wert: 't30_zone', quelle: 'annahme' })
    expect(t(1005).werte.tempoRegime).toMatchObject({ wert: 't30_zone', quelle: 'annahme' })
    expect(t(1000, [styp(1)]).werte.tempoRegime.text).toContain('Strassentyp Sammelstrasse 30 laut Geoportal Stadt Bern stützt die Zone')
    expect(t(1002).werte.tempoRegime).toMatchObject({ wert: 'strecke', quelle: 'annahme' })
    const qv = t(1001)
    expect(qv.werte.tempoRegime).toBeUndefined()
    expect(qv.feldHinweise!.tempoRegime).toContain('Quartierverbindungsstrasse laut Geoportal Stadt Bern: Zone oder Strecke wählen')
    // uneinheitlich (zwei Hierarchie-Linien über der Achse): offen
    const zwei = vor({ vsig: VS([30]), strassenhierarchie: SH([hier(1000, [[lv(-200, 0), lv(0, 0)]]), hier(1002, [[lv(0, 0), lv(200, 0)]])]) })
    expect(zwei.werte.tempoRegime).toBeUndefined()
    expect(zwei.feldHinweise!.tempoRegime).toContain('uneinheitlich')
  })
  it('Tempo ab 40 km/h bleibt Strecke (A3); eine Zone nach OSM-Tag geht vor; V_sig 50 gegen OSM-Zone: Strecke (Geoportal)', () => {
    expect(vor({ vsig: VS([50]), strassenhierarchie: SH([hier(1000)]) }).werte.tempoRegime).toMatchObject({ wert: 'strecke', quelle: 'geoportal' })
    const zone = { osmTags: new Map([[1, { ...HAUPT, maxspeed: '30', 'zone:maxspeed': 'CH:zone30' }]]) }
    expect(vor({ ...zone, strassenhierarchie: SH([hier(1002)]) }).werte.tempoRegime).toMatchObject({ wert: 't30_zone', quelle: 'osm' })
    const w = vor({ ...zone, vsig: VS([50]) }).werte.tempoRegime
    expect(w).toMatchObject({ wert: 'strecke', quelle: 'geoportal' })
    expect(w.text).toContain('OSM: Tempo-30-Zone')
    // OSM-Strecke nur aus maxspeed=50, V_sig 30: die Hierarchie entscheidet
    const s50 = { osmTags: new Map([[1, HAUPT]]) }
    expect(vor({ ...s50 }).werte.tempoRegime).toMatchObject({ wert: 'strecke', quelle: 'osm' })
    expect(vor({ ...s50, vsig: VS([30]), strassenhierarchie: SH([hier(1000)]) }).werte.tempoRegime).toMatchObject({ wert: 't30_zone', quelle: 'annahme' })
    const ohneH = vor({ ...s50, vsig: VS([30]) })
    expect(ohneH.werte.tempoRegime).toBeUndefined()
    expect(ohneH.feldHinweise!.tempoRegime).toBe('Tempo 30 km/h laut Geoportal Stadt Bern, Strecke (OSM: Tempo 50 ohne Zonenangabe) ⟦maxspeed=50⟧: Strecke oder Zone von Hand wählen')
  })
  it('ohne Berner Daten unverändert (ausserhalb Berns: OSM-Tempo, Hinweis aus den OSM-Tags)', () => {
    const t30 = { osmTags: new Map([[1, { ...HAUPT, maxspeed: '30' }]]) }
    const v = vor(t30)
    expect(v.werte.tempoRegime).toBeUndefined()
    expect(v.feldHinweise!.tempoRegime).toContain('Tempo 30 in OSM ohne Zonenangabe')
  })
})

describe('Paket C: Strassentyp (Strassenhierarchie und Strassentypen) vor OSM', () => {
  const osm = { osm: OSM }
  it('Basisnetz verkehrsorientiert, Quartierstrasse siedlungsorientiert (Geoportal); Strassentyp stützt', () => {
    expect(vor({ ...osm, strassenhierarchie: SH([hier(1002)]) }).werte.strassentyp).toMatchObject({ wert: 'verkehrsorientiert', quelle: 'geoportal' })
    const q = vor({ ...osm, strassenhierarchie: SH([hier(1000)], [styp(1)]) }).werte.strassentyp
    expect(q).toMatchObject({ wert: 'siedlungsorientiert', quelle: 'geoportal' })
    expect(q.text).toContain('Strassentyp Sammelstrasse 30 laut Geoportal Stadt Bern stützt das')
    expect(vor({ ...osm, strassenhierarchie: SH([hier(1002)], [styp(5)]) }).werte.strassentyp.wert).toBe('verkehrsorientiert')
  })
  it('Quartierverbindungsstrasse bzw. Widerspruch zum Strassentyp: offen mit Hinweis, keine OSM-Annahme', () => {
    const qv = vor({ ...osm, strassenhierarchie: SH([hier(1001)]) })
    expect(qv.werte.strassentyp).toBeUndefined()
    expect(qv.feldHinweise!.strassentyp).toContain('Quartierverbindungsstrasse (Hauptstrasse) laut Geoportal Stadt Bern')
    const wid = vor({ ...osm, strassenhierarchie: SH([hier(1002)], [styp(1)]) })
    expect(wid.werte.strassentyp).toBeUndefined()
    expect(wid.feldHinweise!.strassentyp).toContain('widersprechen sich')
  })
  it('ohne Hierarchie-Linie über der Achse bzw. ausserhalb Berns: OSM als Annahme; Dienstausfall: OSM', () => {
    expect(vor(osm).werte.strassentyp).toMatchObject({ wert: 'verkehrsorientiert', quelle: 'annahme' })
    expect(vor({ ...osm, strassenhierarchie: SH([hier(1000, quer(60))]) }).werte.strassentyp.quelle).toBe('annahme')
    expect(vor({ ...osm, strassenhierarchie: { fehler: 'HTTP 500' } }).werte.strassentyp.quelle).toBe('annahme')
    // nicht befahrbar (Fussweg) zählt nicht
    expect(vor({ ...osm, strassenhierarchie: SH([hier(1004)]) }).werte.strassentyp.quelle).toBe('annahme')
  })
})

// Schulen: Orte östlich des Streifens auf der Achse y = 0 (Abstand zum Umriss = d)
const ort = (d: number, art: SchulOrt['art'], quelle: SchulOrt['quelle'] = 'geoportal', tag?: string, name = 'Beispiel'): SchulOrt =>
  ({ id: `${art}${d}`, art, name, p: lv(RAND_X + d, 0), quelle, ...(tag ? { tag } : {}) })
const SB: Bereich = { mitte: O, radiusM: 200, form: 'quadrat' }
const SK: Bereich = { mitte: O, radiusM: 200, form: 'kreis' }
const schulenBern = (vs: SchulOrt[], kg: SchulOrt[], osm: SchulOrt[] = []): SchulenErgebnis =>
  ({ bern: { volksschulen: vs, kindergaerten: kg, bereich: SB }, osm: { orte: osm, bereich: SK } })
const schulenAussen = (osm: SchulOrt[]): SchulenErgebnis => ({ bern: null, osm: { orte: osm, bereich: SK } })
const halt = (d: number): OevHalt => ({ id: `h${d}`, name: 'Beispielplatz', p: lv(RAND_X + d, 0), art: 'oev' })
const hst = (halte: OevHalt[]): HaltestellenErgebnis => ({ quelle: 'geoportal', herkunft: 'Geoportal Stadt Bern', halte, bereich: BQ })

describe('Paket C: besonderer Grund (Schulen, Kindergärten, Heime, Haltestelle)', () => {
  it('Volksschule bzw. Kindergarten bis 150 m: Tatsache (Geoportal); 151 m: «keines» als Annahme', () => {
    const v = vor({ schulen: schulenBern([ort(149.9, 'schule')], []), haltestellen: hst([]) })
    expect(v.werte.beduerfnis).toMatchObject({ wert: ['schule'], quelle: 'geoportal' })
    expect(v.werte.beduerfnis.text).toContain('Volksschule «Beispiel», 150 m (Geoportal Stadt Bern)')
    expect(vor({ schulen: schulenBern([], [ort(80, 'kindergarten')]), haltestellen: hst([]) }).werte.beduerfnis.wert).toEqual(['kindergarten'])
    const k = vor({ schulen: schulenBern([ort(150.2, 'schule')], []), haltestellen: hst([]) })
    expect(k.werte.beduerfnis).toEqual({ wert: [], quelle: 'annahme', text: 'kein besonderer Grund im Umkreis von 150 m (Geoportal Stadt Bern, OSM)' })
  })
  it('Heim nach OSM: Annahme; zusammen mit Volksschule und Haltestelle: Liste, Quelle der Tatsache', () => {
    const heim = vor({ schulen: schulenBern([], [], [ort(100, 'heim', 'osm', 'social_facility=nursing_home')]), haltestellen: hst([]) })
    expect(heim.werte.beduerfnis).toMatchObject({ wert: ['heim'], quelle: 'annahme' })
    const betreut = vor({ schulen: schulenAussen([ort(100, 'sozial', 'osm', 'amenity=social_facility, social_facility=assisted_living')]), haltestellen: hst([]) })
    expect(betreut.werte.beduerfnis.wert).toEqual(['heim'])
    const andere = vor({ schulen: schulenBern([], [], [ort(100, 'sozial', 'osm', 'amenity=social_facility, social_facility=outreach')]), haltestellen: hst([]) })
    expect(andere.werte.beduerfnis.wert).toEqual([])
    expect(heim.werte.beduerfnis.text).toBe('Heim «Beispiel», 100 m (OSM; Annahme): Grund für Vortritt')
    const alle = vor({ schulen: schulenBern([ort(120, 'schule')], [], [ort(100, 'heim', 'osm', 'amenity=nursing_home')]), haltestellen: hst([halt(30)]) })
    expect(alle.werte.beduerfnis).toMatchObject({ wert: ['schule', 'heim', 'haltestelle'], quelle: 'geoportal' })
    expect(alle.werte.beduerfnis.text).toMatch(/Volksschule .*; Heim .*Annahme\); Haltestelle «Beispielplatz», 30 m .*: Grund für Vortritt$/)
  })
  it('Schule nach OSM: in Bern ohne Volksschule nur Hinweis (offen); ausserhalb Berns Annahme', () => {
    const b = vor({ schulen: schulenBern([], [], [ort(60, 'schule', 'osm', 'amenity=school', 'Privatschule')]), haltestellen: hst([]) })
    expect(b.werte.beduerfnis).toBeUndefined()
    expect(b.feldHinweise!.beduerfnis).toContain('Schule «Privatschule» laut OSM (60 m), keine Volksschule laut Geoportal Stadt Bern')
    const a = vor({ schulen: schulenAussen([ort(60, 'schule', 'osm', 'amenity=school')]), haltestellen: { ...hst([]), quelle: 'osm', herkunft: 'OSM' } })
    expect(a.werte.beduerfnis).toMatchObject({ wert: ['schule'], quelle: 'annahme' })
    // Volksschule und dieselbe Schule nach OSM: kein Hinweis
    const beide = vor({ schulen: schulenBern([ort(60, 'schule')], [], [ort(61, 'schule', 'osm', 'amenity=school')]), haltestellen: hst([]) })
    expect(beide.feldHinweise!.beduerfnis).toBeUndefined()
  })
  it('«keines» nur mit ganz geladenem Umkreis und geklärten Haltestellen; Ausfall des Geoportals: offen mit Hinweis', () => {
    const k = (geo: GeoVorbelegung) => vor(geo).werte.beduerfnis
    // Korrektur S5: ausserhalb Berns kein «keines» aus OSM allein, nur Hinweis
    const aussen = vor({ schulen: schulenAussen([]), haltestellen: { ...hst([]), quelle: 'osm', herkunft: 'OSM' } })
    expect(aussen.werte.beduerfnis).toBeUndefined()
    expect(aussen.feldHinweise!.beduerfnis).toContain('nichts in OSM im Umkreis von 150 m')
    expect(k({ schulen: schulenBern([], []) })).toBeUndefined()                           // Haltestellen nicht geladen
    expect(k({ schulen: { ...schulenBern([], []), osm: { orte: [], bereich: { mitte: lv(30, 0), radiusM: 150, form: 'kreis' } } },
      haltestellen: hst([]) })).toBeUndefined()                                            // OSM-Umkreis nicht ganz geladen
    const aus = vor({ schulen: { bern: null, osm: { orte: [], bereich: SK }, hinweis: 'Geoportal Stadt Bern nicht erreichbar (HTTP 503)' }, haltestellen: hst([]) })
    expect(aus.werte.beduerfnis).toBeUndefined()
    expect(aus.feldHinweise!.beduerfnis).toContain('nicht erreichbar (HTTP 503)')
    const teil = vor({ schulen: { bern: { volksschulen: [], kindergaerten: null, bereich: SB }, osm: { orte: [], bereich: SK }, hinweis: 'Kindergärten nicht erreichbar' },
      haltestellen: hst([]) })
    expect(teil.werte.beduerfnis).toBeUndefined()
    expect(vor({ schulen: { fehler: 'OpenStreetMap nicht geladen' } }).feldHinweise!.beduerfnis).toContain('nicht geladen')
  })
  it('ohne Schuldaten bleibt die bisherige Vorbelegung (Haltestelle) unverändert', () => {
    expect(vor({ haltestellen: hst([halt(30)]) }).werte.beduerfnis).toMatchObject({ wert: ['haltestelle'], quelle: 'geoportal' })
    expect(vor({ haltestellen: hst([]) }).werte.beduerfnis).toBeUndefined()
  })
})

const RP = (basis: P[][][] | null, publikum: P[][] | null = []): GeoVorbelegung['richtplan'] => ({
  basisnetz: basis && basis.map((teile, i) => ({ id: `b${i}`, layer: 'RP-Inhalt-Basisnetz Fussweg_bestehend', teile })),
  publikum: publikum && publikum.map((ring, i) => ({ id: `p${i}`, layer: 'RP-Hinweis-publikumsattraktive Bereiche', name: null, ringe: [ring] })),
  bereich: BQ })

describe('Paket C: Fusswegnetz (Richtplan Fussverkehr)', () => {
  it('Basisnetz-Linie quert die Fahrbahn bis 15 m: Basisnetz, Netzplanung, Nachfrage gebündelt (Annahme), Gehlinie', () => {
    const v = vor({ richtplan: RP([quer(15)]) })
    expect(v.werte.netz).toMatchObject({ wert: 'basisnetz', quelle: 'geoportal' })
    expect(v.werte.netzQualifiziert).toMatchObject({ wert: true, quelle: 'geoportal' })
    expect(v.werte.nachfrage).toMatchObject({ wert: 'punktuell', quelle: 'annahme' })
    // Runde 5 (F6): Gehlinie aus der schematischen Netzlinie nur als Hinweis
    expect(v.werte.wunschlinieM).toBeUndefined()
    expect(v.feldHinweise!.wunschlinieM).toContain('schematische Basisnetz-Linie quert die Fahrbahn 15 m vom Streifen')
    const w = vor({ richtplan: RP([quer(15.3)]) })
    expect(w.werte.netz).toBeUndefined()
    // Korrektur S8: Gehlinie über 15 m nur als Hinweis
    expect(w.werte.wunschlinieM).toBeUndefined()
    expect(w.feldHinweise!.wunschlinieM).toContain('15 m vom Streifen')
    expect(w.feldHinweise!.netz).toBe('nicht im kartierten Basisnetz (Geoportal Stadt Bern); Feinverteiler nicht kartiert')
    expect(w.feldHinweise!.netzQualifiziert).toBe(w.feldHinweise!.netz)
    expect(vor({ richtplan: RP([quer(30.5)]) }).feldHinweise!.wunschlinieM).toBeUndefined()
    expect(vor({ richtplan: RP([quer(0)]) }).feldHinweise!.wunschlinieM).toContain('beim Streifen')
    expect(vor({ richtplan: RP([quer(0)]) }).werte.netz.text).toBe('Basisnetz-Linie quert die Fahrbahn beim Streifen (Richtplan Fussverkehr, Geoportal Stadt Bern)')
  })
  it('Linie längs der Strasse zählt nicht; Linie endet quer an der Fahrbahn: zählt; schräg über die Achse: 0 m', () => {
    expect(vor({ richtplan: RP([LAENGS]) }).werte.netz).toBeUndefined()
    const ende = vor({ richtplan: RP([quer(10, 40, 0)]) })
    expect(ende.werte.netz?.wert).toBe('basisnetz')
    expect(ende.feldHinweise!.wunschlinieM).toContain('10 m vom Streifen')
    expect(vor({ richtplan: RP([[[lv(-8, -30), lv(8, 30)]]]) }).feldHinweise!.wunschlinieM).toContain('beim Streifen')
    const a = querungsAchse(g.streifen)
    expect(querAbstand(LAENGS, a, AUTO_C.wunschM)).toBeNull()
  })
  it('Streifen in einem publikumsattraktiven Bereich: publikumsintensiv (geht dem Basisnetz vor)', () => {
    const v = vor({ richtplan: RP([quer(5)], [rechteck(-50, -50, 50, 50)]) })
    expect(v.werte.netz).toMatchObject({ wert: 'publikumsintensiv', quelle: 'geoportal' })
    expect(v.werte.netz.text).toContain('zudem quert eine Basisnetz-Linie die Fahrbahn 5 m vom Streifen')
    expect(v.werte.netzQualifiziert.wert).toBe(true)
    expect(v.werte.nachfrage.wert).toBe('punktuell')
    // Korrektur S4: nur publikumsattraktiver Bereich: Nachfrage offen mit Hinweis
    const pub = vor({ richtplan: RP([], [rechteck(-50, -50, 50, 50)]) })
    expect(pub.werte.netz.wert).toBe('publikumsintensiv')
    expect(pub.werte.nachfrage).toBeUndefined()
    expect(pub.feldHinweise!.nachfrage).toContain('gebündelt oder verteilt')
    expect(vor({ richtplan: RP([], [rechteck(20, -50, 50, 50)]) }).werte.netz).toBeUndefined()
  })
  it('Dienstausfall bzw. ein Layer fehlt: offen mit Hinweis; ausserhalb Berns: nichts', () => {
    expect(vor({ richtplan: { fehler: 'HTTP 500' } }).feldHinweise!.netz).toContain('nicht erreichbar (HTTP 500)')
    const teil = vor({ richtplan: { ...RP([quer(40)], null)!, hinweis: 'publikumsattraktive Bereiche nicht erreichbar (HTTP 500)' } as GeoVorbelegung['richtplan'] })
    expect(teil.werte.netz).toBeUndefined()
    expect(teil.feldHinweise!.netz).toContain('teilweise nicht erreichbar')
    const ohne = vor({})
    expect([ohne.werte.netz, ohne.feldHinweise!.netz, ohne.werte.netzQualifiziert, ohne.werte.nachfrage]).toEqual([undefined, undefined, undefined, undefined])
  })
})

const TK = (felder: TvmFeld[] | null, linien: TvmLinie[] | null = []): GeoVorbelegung['taktil'] => ({ felder, linien, bereich: BQ })
const feld = (p: P, art = 1001): TvmFeld => ({ id: `f${p[0]}`, art, text: art === 1001 ? 'Aufmerksamkeitsfeld' : 'Anschluss andere', p, baujahr: null })
const linie = (art: number, teile: P[][]): TvmLinie => ({ id: `l${art}`, art, text: art === 1003 ? 'Leitlinie auf dem Fussgängerstreifen' : 'Leitlinie',
  teile, baujahr: null, aufStreifen: art === 1003 })

describe('Paket C: taktil-visuelle Markierungen', () => {
  const ende = s.p1, u: P = [(s.p1[0] - s.p0[0]) / Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]), (s.p1[1] - s.p0[1]) / Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1])]
  const hinter = (d: number): P => [ende[0] + u[0] * d, ende[1] + u[1] * d]
  it('Feld bis 3 m vom Streifenende: ja (Geoportal); 3,1 m bzw. anderer Code: nein (Annahme); OSM-Tag bleibt Hinweis', () => {
    expect(vor({ taktil: TK([feld(hinter(2.9))]) }).werte.taktil).toMatchObject({ wert: true, quelle: 'geoportal' })
    expect(vor({ taktil: TK([feld(hinter(2.9))]) }).werte.taktil.text).toContain('Aufmerksamkeitsfeld 2,9 m vom Streifenende')
    const nein = vor({ taktil: TK([feld(hinter(3.1))]) }).werte.taktil
    expect(nein).toMatchObject({ wert: false, quelle: 'annahme' })
    expect(nein.text).toContain('kein taktiles Aufmerksamkeitsfeld laut Geoportal Stadt Bern')
    expect(vor({ taktil: TK([feld(hinter(1), 1099)]) }).werte.taktil.wert).toBe(false)
    const osm: OsmDaten = { ...OSM, uebergaenge: [knoten(12, 0, 0, { highway: 'crossing', crossing: 'marked', tactile_paving: 'yes' })] }
    const mit = vor({ osm, taktil: TK([feld(hinter(1))]) })
    expect(mit.werte.taktil.wert).toBe(true)
    expect(mit.feldHinweise!.taktil).toContain('tactile_paving=yes')
  })
  it('Leitlinie auf dem Streifen (Code 1003) schneidet ihn: ja; andere Linie bzw. keine: nein (Annahme)', () => {
    expect(vor({ taktil: TK([], [linie(1003, quer(0, -6, 6))]) }).werte.leitlinie).toMatchObject({ wert: true, quelle: 'geoportal' })
    expect(vor({ taktil: TK([], [linie(1001, quer(0, -6, 6))]) }).werte.leitlinie).toMatchObject({ wert: false, quelle: 'annahme' })
    expect(vor({ taktil: TK([], [linie(1003, quer(40, -6, 6))]) }).werte.leitlinie.wert).toBe(false)
  })
  it('Ausfall bzw. Layer fehlt: offen mit Hinweis; ausserhalb Berns nichts', () => {
    expect(vor({ taktil: { fehler: 'HTTP 503' } }).feldHinweise!.taktil).toContain('nicht erreichbar (HTTP 503)')
    const t = vor({ taktil: { ...TK(null, null)!, hinweis: 'Taktile Felder nicht erreichbar' } as GeoVorbelegung['taktil'] })
    expect([t.werte.taktil, t.werte.leitlinie]).toEqual([undefined, undefined])
    expect(vor({}).werte.taktil).toBeUndefined()
  })
})

const NZ = (zonen: [number, P[]][]): GeoVorbelegung['nutzungszonen'] => ({ bereich: BQ,
  flaechen: zonen.map(([zone, ring], i): NzFlaeche => ({ id: `z${i}`, zone, text: `Zone ${zone}`, bauklasse: null, gewerbe: NZ_GEWERBE.includes(zone), ringe: [ring] })) })

describe('Paket C: Nutzungszonen (Gewerbe, bebaut)', () => {
  it('Industrie- und Gewerbezone bzw. Gewerbegebiet Matte: Gewerbe ja (Geoportal); Wohnzone: nein, bebaut ja (Annahme)', () => {
    expect(vor({ nutzungszonen: NZ([[1004, rechteck(-50, 4, 50, 60)]]) }).werte['q3.gewerbe']).toMatchObject({ wert: true, quelle: 'geoportal' })
    expect(vor({ nutzungszonen: NZ([[1018, rechteck(-50, -60, 50, -4)]]) }).werte['q3.gewerbe'].wert).toBe(true)
    const w = vor({ nutzungszonen: NZ([[1000, rechteck(-50, 4, 50, 60)]]) }).werte
    expect(w['q3.gewerbe']).toMatchObject({ wert: false, quelle: 'geoportal' })
    expect(w['q3.bebaut']).toMatchObject({ wert: true, quelle: 'annahme' })
    expect(w.innerorts.text).toContain('Bauzone laut Nutzungszonenplan stützt das')
  })
  it('nur Schutzzone bzw. Landwirtschaft: bebaut offen mit Hinweis; keine Zone an den Proben: Gewerbe offen; Ausfall: Hinweis', () => {
    const sz = vor({ nutzungszonen: NZ([[1013, rechteck(-50, 4, 50, 60)]]) })
    expect(sz.werte['q3.gewerbe'].wert).toBe(false)
    expect(sz.werte['q3.bebaut']).toBeUndefined()
    expect(sz.feldHinweise!['q3.bebaut']).toContain('keine Bauzone')
    const leer = vor({ nutzungszonen: NZ([[1004, rechteck(100, 4, 140, 60)]]) })
    expect(leer.werte['q3.gewerbe']).toBeUndefined()
    expect(leer.feldHinweise!['q3.gewerbe']).toContain('keine Grundzone')
    expect(vor({ nutzungszonen: { fehler: 'HTTP 503' } }).feldHinweise!['q3.gewerbe']).toContain('nicht erreichbar')
    expect(vor({}).werte['q3.gewerbe']).toBeUndefined()
  })
})

const OEV = (linien: Partial<OevLinie>[]): GeoVorbelegung['oevLinien'] => ({ bereich: BQ,
  linien: linien.map((l, i) => ({ id: `o${i}`, typ: 'bus', typText: 'Bus', nummer: String(10 + i), teile: LAENGS, ...l })) })

describe('Paket C: ÖV-Linien (Linienbus, Tramhalt)', () => {
  it('Buslinie längs der gequerten Strasse: Linienbus ja; Tram bzw. Bus in der Querstrasse: nein (Geoportal)', () => {
    expect(vor({ oevLinien: OEV([{ typ: 'trolleybus' }]) }).werte['q3.linienbus']).toMatchObject({ wert: true, quelle: 'geoportal' })
    expect(vor({ oevLinien: OEV([{ typ: 'tram' }]) }).werte['q3.linienbus']).toMatchObject({ wert: false, quelle: 'geoportal' })
    expect(vor({ oevLinien: OEV([{ teile: quer(40) }]) }).werte['q3.linienbus'].wert).toBe(false)
    expect(vor({ oevLinien: { fehler: 'HTTP 503' } }).feldHinweise!['q3.linienbus']).toContain('nicht erreichbar')
  })
  it('Geoportal-Halt bis 30 m mit Tramlinie: Tramhaltestellenbereich ja (Hinweis entfällt); ohne Tramlinie: nein; Tramhalt 40 m: Hinweis', () => {
    const tram = vor({ haltestellen: hst([halt(25)]), oevLinien: OEV([{ typ: 'tram', teile: [[lv(-200, 3), lv(200, 3)]] }]) })
    expect(tram.werte.tramHaltestellenbereich).toMatchObject({ wert: true, quelle: 'annahme' })               // Korrektur S7
    expect(tram.werte.tramHaltestellenbereich.text).toContain('Tramhalt angenommen')
    expect(tram.feldHinweise!.tramHaltestellenbereich).toBeUndefined()
    expect(tram.hinweise.join(' ')).not.toContain('ohne Angabe Bus oder Tram')
    const bus = vor({ haltestellen: hst([halt(25)]), oevLinien: OEV([{ typ: 'bus' }]) })
    expect(bus.werte.tramHaltestellenbereich).toMatchObject({ wert: false, quelle: 'geoportal' })
    const fern = vor({ haltestellen: hst([halt(40)]), oevLinien: OEV([{ typ: 'tram', teile: [[lv(-200, 30), lv(200, 30)], [lv(RAND_X + 40, -50), lv(RAND_X + 40, 50)]] }]) })
    expect(fern.werte.tramHaltestellenbereich).toBeUndefined()
    expect(fern.feldHinweise!.tramHaltestellenbereich).toContain('Tramhalt «Beispielplatz», 40 m (über 30 m')
    // ohne ÖV-Linien: wie bisher Hinweis «ohne Angabe Bus oder Tram»
    expect(vor({ haltestellen: hst([halt(25)]) }).feldHinweise!.tramHaltestellenbereich).toContain('ohne Angabe Bus oder Tram')
  })
})

describe('Paket C: Vortrittsrolle an der Kreuzung (OSM-Vortrittszeichen)', () => {
  // T-Knoten wie automatik.test.tsx: Seitenstrasse nach Norden bei x = xs; die gequerte Hauptstrasse geht weiter (Kreuzung)
  const xs = RAND_X + 12
  const tKnoten = (extra: [number, number, number][] = []): OsmDaten => ({ ...OSM,
    wege: [weg(1, [[10, -300, 0], [12, 0, 0], [14, xs, 0], ...extra, [13, 300, 0]], HAUPT),
      weg(2, [[14, xs, 0], [30, xs, 12], [20, xs, 200]], { highway: 'residential', name: 'Querweg', maxspeed: '30' })] })
  const zeichen = (id: number, x: number, y: number, art: VortrittZeichen['art'] = 'give_way'): VortrittZeichen =>
    ({ id, art, p: lv(x, y), richtung: null, zeichen: null })
  const auto = (osm: OsmDaten, z: VortrittZeichen[] | null) => {
    const w: Vorbelegung = {}, fh: Record<string, string> = {}
    const geo: AutoGeo = { osm, av: AV, ladeort: O, osmRadiusM: 300, vortritt: z && { zeichen: z, bereich: { mitte: O, radiusM: 300, form: 'kreis' } } }
    automatik({ st: g.streifen, fall: fallMit(), geo, w, hinweise: [], rechner: {}, setze: (p, wert, quelle, text) => { w[p] = { wert, quelle, text } },
      feldHinweis: (p, t) => { fh[p] = t } })
    return { w, fh }
  }
  it('Zeichen auf der Querstrasse: die gequerte Strasse hat Vortritt (knoten_berechtigt)', () => {
    const { w } = auto(tKnoten(), [zeichen(30, xs, 12)])
    expect(w.lage).toMatchObject({ wert: 'knoten_berechtigt', quelle: 'osm' })
    expect(w.lage.text).toContain('«Kein Vortritt» 12 m vom Knoten (OSM) auf der Querstrasse')
    // Signal CH:3.02 als traffic_sign auf dem Querarm zählt wie give_way
    expect(auto(tKnoten(), [{ ...zeichen(30, xs, 12, 'schild'), zeichen: 'CH:3.02' }]).w.lage.wert).toBe('knoten_berechtigt')
    expect(auto(tKnoten(), [{ ...zeichen(30, xs, 12, 'schild'), zeichen: 'CH:4.08' }]).w.lage).toBeUndefined()
    // Korrektur S2: frei stehendes Zeichen (kein Knoten eines Arms) zählt nicht
    expect(auto(tKnoten(), [zeichen(99, xs + 1.5, 8, 'stop')]).w.lage).toBeUndefined()
  })
  it('Zeichen auf der gequerten Strasse: sie gewährt Vortritt (knoten_belastet)', () => {
    const { w } = auto(tKnoten([[15, xs + 6, 0]]), [zeichen(15, xs + 6, 0, 'stop')])
    expect(w.lage).toMatchObject({ wert: 'knoten_belastet', quelle: 'osm' })
    expect(w.lage.text).toContain('«Stop»')
  })
  it('ohne Zeichen bzw. Zeichen über 20 m vom Knoten: offen mit Hinweis; Zeichen auf beiden Strassen: Hinweis', () => {
    for (const z of [null, [], [zeichen(20, xs, 200)]]) {
      const { w, fh } = auto(tKnoten(), z)
      expect(w.lage).toBeUndefined()
      expect(fh.lage).toMatch(/^Kreuzung \d+ m entfernt \(OSM\)\. Bitte wählen/)
    }
    const beide = auto(tKnoten([[15, xs + 6, 0]]), [zeichen(15, xs + 6, 0), zeichen(30, xs, 12)])
    expect(beide.w.lage).toBeUndefined()
    expect(beide.fh.lage).toContain('auf der gequerten Strasse und auf der Querstrasse: von Hand wählen')
  })
})

describe('Kleinpunkte (Nutzerentscheide 21.10.2026)', () => {
  it('LSA-Zeiten: nur kopierte Längen lösen den Block I nicht aus («LSA-Zeiten fehlen»); eine Zeit von Hand schon', () => {
    const lsa = { L: 7, teile: null, inselB: null, gelb: null, freigabe: null, phasengleich: null, beideRichtungenImZyklus: null, wartezeit: null,
      vorstart: null, abbiegerKonflikt: null, inselGeraet: null, inselNurAnmeldung: null }
    const BERN = { ebenen: { bern: true, kantonBE: true } }
    expect(beurteile(testfall({ fgsMitLsa: true, lsaZeiten: lsa }), BERN).nichtGeprueft).toEqual([{ block: 'I', grund: 'LSA-Zeiten fehlen' }])
    const mit = beurteile(testfall({ fgsMitLsa: true, lsaZeiten: { ...lsa, gelb: 3 } }), BERN)
    expect(mit.nichtGeprueft).toEqual([])
    expect(mit.ausgewertet).toContain('I1')
  })
  it('«knapp unter» mit einer Nachkommastelle wie das Soll', () => {
    expect(kurzform({ id: 'H1', ist: '77,8', soll: '≥ 77,8', einheit: 'm' })).toContain('knapp unter 77,8 m')
  })
})

describe('Korrekturen nach Prüfung (21.10.2026)', () => {
  // Zufahrten auf zwei Wegen (West 1, Ost 3) mit eigenen Tags
  const zwei = (tw: Record<string, string>, to: Record<string, string>) => {
    const st = g.streifen.map(x => ({ ...x, zufahrten: x.zufahrten.map(z => ({ ...z, osmWeg: z.richtung > 90 && z.richtung < 270 ? '3' : '1' })) }))
    return { g2: { ...g, streifen: st }, tags: new Map([[1, tw], [3, to]]) }
  }
  it('M1: Zonentag an einer Zufahrt bzw. widersprüchlich: kein Eingriff der Strassenhierarchie, offen mit Hinweis', () => {
    const t = zwei({ ...HAUPT, maxspeed: '30', 'zone:maxspeed': 'CH:zone30' }, { ...HAUPT, maxspeed: '30' })
    for (const typId of [1000, 1002]) {
      const v = vorbelegen(t.g2, fallMit(), [], { osmTags: t.tags, vsig: VS([30]), strassenhierarchie: SH([hier(typId)]) })
      expect(v.werte.tempoRegime).toBeUndefined()
      expect(v.feldHinweise!.tempoRegime).toContain('nur ein Teil der Zufahrten mit Angabe')
    }
    const wid = zwei({ ...HAUPT, maxspeed: '30', 'zone:maxspeed': 'CH:zone30' }, { ...HAUPT, maxspeed: '30', 'maxspeed:type': 'CH:urban' })
    const v = vorbelegen(wid.g2, fallMit(), [], { osmTags: wid.tags, vsig: VS([30]), strassenhierarchie: SH([hier(1000)]) })
    expect(v.werte.tempoRegime).toBeUndefined()
    expect(v.feldHinweise!.tempoRegime).toContain('widersprüchlich')
    // ohne Zonentag an beiden Zufahrten: Hierarchie entscheidet (Annahme)
    const ohne = zwei({ ...HAUPT, maxspeed: '30' }, { ...HAUPT, maxspeed: '30' })
    expect(vorbelegen(ohne.g2, fallMit(), [], { osmTags: ohne.tags, vsig: VS([30]), strassenhierarchie: SH([hier(1000)]) }).werte.tempoRegime)
      .toMatchObject({ wert: 't30_zone', quelle: 'annahme' })
  })
  it('S3: V_sig 50 (Geoportal) gegen OSM «Tempo 30 ohne Zonenangabe»: Strecke (Geoportal) mit Hinweis auf OSM', () => {
    const v = vor({ osmTags: new Map([[1, { ...HAUPT, maxspeed: '30' }]]), vsig: VS([50]) })
    expect(v.werte.tempoRegime).toMatchObject({ wert: 'strecke', quelle: 'geoportal' })
    expect(v.werte.tempoRegime.text).toContain('OSM widerspricht: Tempo 30 in OSM ohne Zonenangabe')
    expect(v.feldHinweise!.tempoRegime).toBeUndefined()
  })
  it('M2: hartes Verbot nur aus Annahmen bleibt offen («Annahme bestätigen»); Tatsache bzw. bestätigt: verletzt', () => {
    const BERN = { ebenen: { bern: true, kantonBE: true } }
    type Q = 'osm' | 'annahme' | 'bestaetigt' | 'hand'
    const c2 = (qZone: Q, qGrund: Q) => {
      const e = testfall({ tempoRegime: 't30_zone', vSig: 30 })
      e.tempoRegime = { wert: 't30_zone', quelle: qZone }
      e.beduerfnis = { wert: [], quelle: qGrund }
      return beurteile(e, BERN)
    }
    for (const [qz, qg, erwartet] of [['osm', 'hand', 'verletzt'], ['bestaetigt', 'bestaetigt', 'verletzt'], ['osm', 'bestaetigt', 'verletzt'],
      ['annahme', 'hand', 'offen'], ['osm', 'annahme', 'offen'], ['annahme', 'annahme', 'offen'], ['bestaetigt', 'annahme', 'offen']] as [Q, Q, string][]) {
      const b = c2(qz, qg)
      const x = b.alle.find(y => y.id === 'C2')!
      expect(x.zustand, `${qz}/${qg}`).toBe(erwartet)
      expect(b.zulaessigkeit, `${qz}/${qg}`).toBe(erwartet === 'offen' ? 'offen' : 'nicht_angezeigt')
      if (erwartet === 'offen') {
        expect(x.bestaetigen).toBe(true)
        expect(x.fehlend).toEqual([...(qz === 'annahme' ? ['tempoRegime'] : []), ...(qg === 'annahme' ? ['beduerfnis'] : [])])
        expect(vorbehaltFelder(b)).toEqual(x.fehlend)
      }
    }
    // Begegnungszone als Annahme (Tempo 20): A2 offen, kein Ende «Begegnungszone», Zulässigkeit offen; als Tatsache: Ende
    const bgz = (q: Q) => { const e = testfall({ tempoRegime: 'begegnungszone', vSig: 20 }); e.tempoRegime = { wert: 'begegnungszone', quelle: q }; return beurteile(e, BERN) }
    expect(bgz('annahme').ende).toBeNull()
    expect(bgz('annahme').zulaessigkeit).toBe('offen')
    expect(bgz('annahme').alle.find(y => y.id === 'A2')).toMatchObject({ zustand: 'offen', bestaetigen: true, fehlend: ['tempoRegime'] })
    expect(bgz('osm').ende).toBe('begegnungszone')
    expect(bgz('bestaetigt').ende).toBe('begegnungszone')
    // Runde 4 (Kann): solange A2 offen ist, keine Empfehlung eines Typs (statt Fussgängerstreifen); Strecke als Tatsache: wie bisher
    expect(bgz('annahme').empfehlung).toMatchObject({ typ: 'keiner', elemente: [], grundlage: [], vorlaeufig: true })
    expect(typText(bgz('annahme'), false)).toBe('Empfehlung folgt, sobald geklärt ist, ob die Querung in einer Begegnungszone liegt')
    expect(typText(bgz('annahme'))).toBe('Empfehlung folgt, sobald geklärt ist, ob die Querung in einer Begegnungszone liegt')
    expect(bgz('osm').empfehlung.typ).toBe('flaechig')
    expect(beurteile(testfall({ tempoRegime: 'strecke' }), BERN).empfehlung.typ).not.toBe('keiner')
    // andere Regeln behalten Annahmen wie bisher (C2b Hinweis bei Zone als Annahme und Grund)
    const e = testfall({ tempoRegime: 't30_zone', vSig: 30, beduerfnis: ['schule'] }); e.tempoRegime = { wert: 't30_zone', quelle: 'annahme' }
    expect(beurteile(e, BERN).alle.find(y => y.id === 'C2b')?.zustand).toBe('verletzt')
    expect(frageVon('tempoRegime')).toContain('Tempo-30')
    expect(frageVon('beduerfnis')).toContain('besonderen Grund für Vortritt')
  })
  it('M2: Befundblatt «Annahme bestätigen», Knopf «Vorschlag bestätigen», bestätigt schaltet die Regel scharf', () => {
    const geo: GeoVorbelegung = { vsig: VS([30]), strassenhierarchie: SH([hier(1000)]), schulen: schulenBern([], []), haltestellen: hst([]) }
    const opt = { vorgabe: { bern: true, kantonBE: true }, geo }
    const b = befundblatt(g, fallMit(), opt)
    expect(b.gebildet.eingaben.tempoRegime).toEqual({ wert: 't30_zone', quelle: 'annahme' })
    expect(b.befund.zulaessigkeit).toBe('offen')
    expect(b.offen.filter(o => o.bestaetigen).map(o => o.feld).sort()).toEqual(['beduerfnis', 'tempoRegime'])
    const html = renderToStaticMarkup(createElement(BedarfAbschnitt, { fall: fallMit(), blaetter: [b], vorgabe: { bern: true, kantonBE: true }, aendern: () => {} }))
    expect(html).toContain('Vorschlag bestätigen')
    expect(html).toContain('Annahme bestätigen für')
    // Runde 4: der Knopf nur an den Feldern, deren Annahme das Verbot offen hält (nicht an jeder Annahme)
    const knoepfe = [...html.matchAll(/aria-label="([^"]+): Vorschlag bestätigen"/g)].map(x => x[1])
    expect(knoepfe.sort()).toEqual(['Besonderer Grund für Vortritt', 'Strecke oder Zone (Tempo-Regime)'])
    expect([...b.gebildet.herkunft.values()].filter(h => h.zustand === 'vorbelegt' && (h.quelle === 'annahme' || h.quelle === 'schaetzung')).length)
      .toBeGreaterThan(2)
    expect(b.befund.alle.find(y => y.id === 'C2')?.detail).toBe('beruht auf einer Annahme der Vorbelegung: Vorschlag bestätigen bzw. von Hand ändern')
    // Runde 4: Annahmen von Hand (kein Vorschlag): Detail ohne «Vorbelegung», kein Knopf
    const fh = fallMit()
    fh.bedarf = { felder: { tempoRegime: { wert: 't30_zone', quelle: 'annahme' }, beduerfnis: { wert: [], quelle: 'schaetzung' } } }
    const bh = befundblatt(g, fh, opt)
    expect(bh.befund.alle.find(y => y.id === 'C2')).toMatchObject({ zustand: 'offen', bestaetigen: true, detail: DETAIL_HAND_ANNAHME })
    expect(DETAIL_HAND_ANNAHME).toMatch(/^beruht auf einer Annahme bzw\. Schätzung/)
    expect(renderToStaticMarkup(createElement(BedarfAbschnitt, { fall: fh, blaetter: [bh], vorgabe: { bern: true, kantonBE: true }, aendern: () => {} })))
      .not.toContain('Vorschlag bestätigen')
    // beide bestätigt (Handeingabe «bestätigt»): C2 verletzt, nicht angezeigt
    const f = fallMit()
    f.bedarf = { felder: { tempoRegime: { wert: 't30_zone', quelle: 'bestaetigt' }, beduerfnis: { wert: [], quelle: 'bestaetigt' } } }
    const b2 = befundblatt(g, f, opt)
    expect(b2.befund.zulaessigkeit).toBe('nicht_angezeigt')
    expect(b2.annahmen.join(' ')).not.toMatch(/Strecke oder Zone|Besonderer Grund/)
    // Fall-Datei: Quelle «bestätigt» wird gelesen
    expect(bedarfLesen({ felder: { tempoRegime: { wert: 't30_zone', quelle: 'bestaetigt' } } })[0]!.felder.tempoRegime.quelle).toBe('bestaetigt')
  })
  it('Runde 4: A2 nur, wenn eine Begegnungszone möglich ist (Tempo 20 bzw. unbekannt); Tempo 30 ohne Zonenangabe nicht anwendbar', () => {
    const mit = (tags: Record<string, string>) => {
      const o: OsmDaten = { ...OSM, wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { ...HAUPT, ...tags })] }
      const gg = querungen(rechneFall(o, AV, [], 12, fallMit(), null).streifen)[0]
      return befundblatt(gg, fallMit(), { vorgabe: { bern: true, kantonBE: true }, geo: { osmTags: new Map(o.wege.map(w => [w.id, w.tags])) } })
    }
    const BERN = { ebenen: { bern: true, kantonBE: true } }
    // Tempo 30 ohne Zonentag: Strecke/Zone offen, A2 nicht anwendbar (kein Eintrag), Empfehlung Fussgängerstreifen (vorläufig wegen C2)
    const t30 = mit({ maxspeed: '30' })
    expect(t30.gebildet.eingaben.tempoRegime.wert).toBeNull()
    expect(t30.befund.alle.some(y => y.id === 'A2')).toBe(false)
    expect(t30.befund.ausgewertet).toContain('A2')
    expect(t30.befund.empfehlung.typ).toBe('Q1')
    // Tempo 20 ohne Zonenangabe (OSM-Tags allein): Strecke/Zone offen → A2 offen, Empfehlung ausgesetzt
    const t20 = mit({ maxspeed: '20' })
    expect(t20.gebildet.eingaben.tempoRegime.wert).toBeNull()
    expect(t20.befund.alle.find(y => y.id === 'A2')).toMatchObject({ zustand: 'offen', fehlend: ['tempoRegime'] })
    expect(t20.befund.empfehlung.typ).toBe('keiner')
    // Begegnungszone als Annahme (Tempo 20): offen mit «bestätigen», Empfehlung ausgesetzt
    const ann = testfall({ tempoRegime: 'begegnungszone', vSig: 20 }); ann.tempoRegime = { wert: 'begegnungszone', quelle: 'annahme' }
    expect(beurteile(ann, BERN).alle.find(y => y.id === 'A2')).toMatchObject({ zustand: 'offen', bestaetigen: true, fehlend: ['tempoRegime'] })
    expect(beurteile(ann, BERN).empfehlung.typ).toBe('keiner')
    // Tempo 20 mit living_street (OSM, Tatsache): A2 verletzt, Ende Begegnungszone
    const ls = mit({ maxspeed: '20', highway: 'living_street' })
    expect(ls.gebildet.eingaben.tempoRegime).toEqual({ wert: 'begegnungszone', quelle: 'osm' })
    expect(ls.befund.alle.find(y => y.id === 'A2')).toMatchObject({ zustand: 'verletzt' })
    expect(ls.befund.ende).toBe('begegnungszone')
    // Tempo unbekannt ohne Zonenangabe: offen
    const e = testfall({ tempoRegime: null, vSig: null })
    expect(beurteile(e, BERN).alle.find(y => y.id === 'A2')?.zustand).toBe('offen')
    // vSig als Annahme hält ein Begegnungszonen-Verbot aus OSM nicht offen (nur Strecke/Zone zählt)
    const e2 = testfall({ tempoRegime: 'begegnungszone', vSig: 20 }); e2.vSig = { wert: 20, quelle: 'annahme' }
    expect(beurteile(e2, BERN).ende).toBe('begegnungszone')
  })
  it('M3 und S1: V_sig 50 (Geoportal), Sichtrechner mit OSM 30: Grundprüfung ① offen (neu rechnen), Sichtweite offen statt «rechner»', () => {
    const o: OsmDaten = { ...OSM, wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { ...HAUPT, maxspeed: '30' })] }
    const gg = querungen(rechneFall(o, AV, [], 12, fallMit(), null).streifen)[0]
    const f = fallMit(); f.bedarf = { felder: { anzeichenSchneller: { wert: false, quelle: 'hand' } } }
    const tags = new Map(o.wege.map(w => [w.id, w.tags]))
    const b = befundblatt(gg, f, { vorgabe: { bern: true, kantonBE: true }, geo: { osmTags: tags, vsig: VS([50]) } })
    const p1 = b.grund.punkte.find(p => p.nr === '1')!
    expect(p1.zustand).toBe('offen')
    expect(JSON.stringify(p1.teile)).toContain('Sicht nach dem höheren Tempo neu rechnen')
    expect(b.gebildet.herkunft.get('sichtVorh')?.zustand).toBe('offen')
    expect(b.vorbelegt.feldHinweise!.sichtVorh).toContain('neu rechnen')
    // gleiches Tempo: ① wie bisher, Sichtweite im Zustand «rechner»
    const c = befundblatt(gg, f, { vorgabe: { bern: true, kantonBE: true }, geo: { osmTags: tags } })
    expect(JSON.stringify(c.grund.punkte.find(p => p.nr === '1')!.teile)).not.toContain('neu rechnen')
    expect(c.gebildet.herkunft.get('sichtVorh')?.zustand).toBe('rechner')
  })
  it('S2: Vortrittszeichen an einer Garagenausfahrt (service) bzw. auf einem Radweg zählen nicht', () => {
    const xs = RAND_X + 12
    const zeichen = (id: number, x: number, y: number): VortrittZeichen => ({ id, art: 'give_way', p: lv(x, y), richtung: null, zeichen: null })
    const o = (extra: OsmWeg[]): OsmDaten => ({ ...OSM, wege: [weg(1, [[10, -300, 0], [12, 0, 0], [14, xs, 0], [16, xs + 7, 0], [13, 300, 0]], HAUPT),
      weg(2, [[14, xs, 0], [30, xs, 12], [20, xs, 200]], { highway: 'residential', name: 'Querweg' }), ...extra] })
    const lage = (osm: OsmDaten, z: VortrittZeichen[]) => {
      const w: Vorbelegung = {}, fh: Record<string, string> = {}
      automatik({ st: g.streifen, fall: fallMit(), geo: { osm, av: AV, ladeort: O, osmRadiusM: 300, vortritt: { zeichen: z, bereich: { mitte: O, radiusM: 300, form: 'kreis' } } },
        w, hinweise: [], rechner: {}, setze: (p, wert, quelle, text) => { w[p] = { wert, quelle, text } }, feldHinweis: (p, t) => { fh[p] = t } })
      return { w, fh }
    }
    const service = lage(o([weg(5, [[16, xs + 7, 0], [40, xs + 7, -3], [41, xs + 7, -20]], { highway: 'service' })]), [zeichen(40, xs + 7, -3)])
    expect(service.w.lage).toBeUndefined()
    expect(service.fh.lage).toContain('Bitte wählen')
    const rad = lage(o([weg(6, [[30, xs, 12], [42, xs - 3, 8], [43, xs - 30, 8]], { highway: 'cycleway' })]), [zeichen(42, xs - 3, 8)])
    expect(rad.w.lage).toBeUndefined()
  })
  it('S9: Schulareal nach dem Umriss: Mittelpunkt 170 m, Rand 120 m → Grund', () => {
    const areal: SchulOrt = { ...ort(170, 'schule', 'osm', 'amenity=school'), umriss: [lv(RAND_X + 120, -30), lv(RAND_X + 220, -30), lv(RAND_X + 220, 30), lv(RAND_X + 120, 30)] }
    const v = vor({ schulen: schulenAussen([areal]), haltestellen: { ...hst([]), quelle: 'osm', herkunft: 'OSM' } })
    expect(v.werte.beduerfnis).toMatchObject({ wert: ['schule'], quelle: 'annahme' })
    expect(v.werte.beduerfnis.text).toContain('120 m')
    expect(v.werte.beduerfnis.text).not.toContain('Grenzrechteck')
    expect(abstandOrt({ ...areal, umriss: undefined }, g.streifen)).toBeCloseTo(170, 0)
    // Runde 4: Umriss nur aus den Grenzen (out bb) → im Text gekennzeichnet; innerhalb «im Areal»
    const bb = vor({ schulen: schulenAussen([{ ...areal, grenzrechteck: true }]), haltestellen: { ...hst([]), quelle: 'osm', herkunft: 'OSM' } })
    expect(bb.werte.beduerfnis.text).toContain('120 m, Rand des Areals, Grenzrechteck (OSM; Annahme)')
    expect(ortAbstandText({ ...areal, grenzrechteck: true }, 0)).toBe('im Areal, Grenzrechteck')
    expect(ortAbstandText(areal, 120.4)).toBe('120 m')
  })
  it('Kann: taktiles Feld am Inselende zählt nicht als Streifenende', () => {
    const u: P = [(s.p1[0] - s.p0[0]) / Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]), (s.p1[1] - s.p0[1]) / Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1])]
    const m: P = [(s.p0[0] + s.p1[0]) / 2, (s.p0[1] + s.p1[1]) / 2]
    const teil = (a: P, b: P) => ({ ...s, p0: a, p1: b, umriss: [], rand: [a, b] as [P, P] })
    const st = [teil(s.p0, [m[0] - u[0], m[1] - u[1]]), teil([m[0] + u[0], m[1] + u[1]], s.p1)]
    const amInsel = vorbelegen({ ...g, streifen: st }, fallMit(), [], { taktil: TK([feld(m)]) })
    expect(amInsel.werte.taktil).toMatchObject({ wert: false, quelle: 'annahme' })
    const amRand = vorbelegen({ ...g, streifen: st }, fallMit(), [], { taktil: TK([feld([s.p1[0] + u[0], s.p1[1] + u[1]])]) })
    expect(amRand.werte.taktil.wert).toBe(true)
  })
})
