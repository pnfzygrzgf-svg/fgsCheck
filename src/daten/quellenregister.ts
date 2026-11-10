import { PARK_SN, PARK_ZH, PARK_BE_AUTO, PARK_BE_VELO } from '../rechner/parkgeometrie'
// ── Quellenregister: alle externen Datenquellen der App mit Gebiet, Dienst, Lizenz und Datenschutz (30.10.2026) ──
//
// Ein Eintrag je Quelle. Das Gebiet sagt, wo die Quelle gilt (ganze Schweiz, Kantone, Gemeinden nach BFS-Nummer der AV-Fläche
// bzw. Rechteck in WGS84); daraus folgen die Quellen an einem Ort (quellenFuer) und je Thema die massgebende Quelle (datenlage).
// Die Lader in src/daten/ bleiben, wie sie sind: sie tragen nur die Kennung ihres Eintrags (quelleId), die Zuständigkeit
// (bernZustaendig, parkQuelleFuer, baumQuelleFuer) entscheidet weiter dort. Die Datenschutz-Liste der Hilfe entsteht aus diesem
// Register (datenschutzGruppen), damit sie nicht abweicht.
//
// Eine Stadt kommt dazu mit (1) Einträgen hier (Gebiet nach BFS-Nummern), (2) der Feldzuordnung im Lader (Antwort -> Daten der App)
// und (3) einer Probe an einem bekannten Ort. Im Browser gehen nur Dienste, die den Zugriff erlauben (CORS); ohne CORS bräuchte es
// einen eigenen Zwischenserver (cors: 'proxy'), den die App nicht hat.
// Hier nur Daten und reine Funktionen (getestet, ohne Abruf).

import { REGIONAL_DIENSTE } from './anbieter/gemeinsam/regionalDienste'
import { imPolygon, type P } from '../geo'
import type { AvFlaeche } from './av'
import { OVERPASS_ENDPOINTS } from './osm'
import { LUFTBILD_FGS_STAEDTE } from './luftbildFgs'
import { NPVM_QUELLE } from './anbieter/npvm'
import { BAV_QUELLE } from './anbieter/gemeinsam/bav'
import { ZH_PARK_LIZENZ } from './anbieter/gemeinsam/parkZuerich'

/** Bedarf der App, den eine Quelle deckt */
export type Thema = 'vermessung' | 'luftbild' | 'hoehen' | 'strassennetz' | 'uebergaenge' | 'parkfelder' | 'baeume' | 'haltestellen' |
  'dtv' | 'fusswegnetz' | 'strassentyp' | 'tempo' | 'schulen' | 'taktil' | 'zonen' | 'oevLinien' | 'fgsLuftbild'

export type Gebiet =
  | { art: 'schweiz' }
  | { art: 'kantone'; kantone: string[] }
  | { art: 'gemeinden'; bfs: number[]; name: string }
  | { art: 'bbox'; s: number; w: number; n: number; e: number; name: string }

/** Empfänger der Anfragen (Gruppe der Datenschutz-Liste) */
export type Empfaenger = 'swisstopo' | 'geodienste' | 'overpass' | 'bern' | 'zuerich' | 'regional' | 'eigen'

export interface Quelle {
  /** Rein fachliche, eingebundene Grundlage ohne Netzabfrage (kein Empfänger in der Datenschutz-Liste). */
  netzabfrage?: false
  id: string
  /** welche Bedürfnisse der App die Quelle deckt (leer: nur Karte bzw. Suche) */
  themen: Thema[]
  name: string
  anbieter: string
  gebiet: Gebiet
  dienst: 'wfs' | 'wms' | 'wmts' | 'arcgis' | 'overpass' | 'api' | 'datei'
  lizenz: string
  stand?: string
  /** Zugriff aus dem Browser: true = CORS erlaubt; 'proxy' = nur über einen Zwischenserver; false = nicht möglich */
  cors: true | 'proxy' | false
  /** was an den Dienst geht (Datenschutz) */
  datenschutz: string
  /** Satz nach der Aufzählung der Gruppe (statt in der Aufzählung) */
  datenschutzSatz?: boolean
  empfaenger: Empfaenger
  /** Module, die laden (relativ zu src/) */
  module: string[]
  hinweis?: string
}

/** BFS-Nummer der Stadt Bern */
export const BERN_BFS = 351
const BERN: Gebiet = { art: 'gemeinden', bfs: [BERN_BFS], name: 'Stadt Bern' }
const LUZERN: Gebiet = { art: 'gemeinden', bfs: [1061], name: 'Stadt Luzern' }
const LUZERN_LIZENZ = 'Open Government Data, Quellenangabe Pflicht'
const BERN_LIZENZ = 'Open Data Stadt Bern: freie Nutzung, Quellenangabe Pflicht'
const SWISSTOPO_LIZENZ = 'frei, Quellenangabe «© swisstopo»'
const ZAEHL_HINWEIS = 'Nur der Standort der Zählstelle ist gemessen. Vorschlag: zählt erst nach Bestätigung.'
export const ABRUF_BEIM_LADEN = 'Abruf beim Laden'
const LIVE = ABRUF_BEIM_LADEN

/** Kantone mit freier AV über geodienste.ch (19 ganz, Wallis teilweise) und Liechtenstein */
export const AV_KANTONE = ['ZH', 'BE', 'UR', 'SZ', 'GL', 'ZG', 'FR', 'SO', 'BS', 'BL', 'SH', 'AR', 'AI', 'SG', 'GR', 'AG', 'TG', 'TI', 'GE',
  'VS', 'FL']
/** Kantone, die die AV nur mit Freigabe abgeben */
export const AV_NICHT_FREI = ['LU', 'VD', 'NE', 'NW', 'OW', 'JU']

const host = (u: string) => new URL(u).host
const [OVERPASS_ERSTER, ...OVERPASS_WEITERE] = OVERPASS_ENDPOINTS.map(host)

const bernDienst = (id: string, themen: Thema[], name: string, datenschutz: string, modul: string, stand?: string): Quelle => ({
  id, themen, name, anbieter: 'Geodaten Stadt Bern', gebiet: BERN, dienst: 'arcgis', lizenz: BERN_LIZENZ, stand: stand ?? LIVE, cors: true,
  datenschutz, empfaenger: 'bern', module: [modul],
})

const ETH_KURZ: Record<string, string> = { Bern: 'bern', 'Zürich': 'zurich', Basel: 'basel' }
/** Stand der gebündelten Snapshots (Feld «erzeugt» in public/luftbild_fgs_<stadt>.json; Test prüft die Übereinstimmung) */
export const ETH_STAND: Record<string, string> = { bern: '29.10.2026', zurich: '29.10.2026', basel: '29.10.2026' }
const ETH_BILD: Record<string, string> = { bern: 'SWISSIMAGE und Orthofoto Stadt Bern 2026', zurich: 'SWISSIMAGE', basel: 'SWISSIMAGE' }

export const QUELLEN: readonly Quelle[] = [
  ...([{ id: 'norm.park.be.auto', name: PARK_BE_AUTO, stand: 'revidiert März 2019' },
    { id: 'norm.park.be.zweirad', name: PARK_BE_VELO, stand: 'revidiert April 2011' }].map(q => ({
      ...q, netzabfrage: false as const, themen: [], anbieter: 'Stadt Bern, Bern baut', gebiet: BERN, dienst: 'datei' as const,
      lizenz: 'Fachliche Grundlage, kein Dokument eingebunden', cors: true as const, empfaenger: 'eigen' as const,
      datenschutz: 'Eingebundene Massannahmen; keine Netzabfrage der Normalie.', module: ['rechner/parkgeometrie.ts'],
      hinweis: 'Zweiradmasse ausserhalb Berns als Modellannahme; bei Motorrädern Anordnung von Hand festlegen.' }))),
  { id: 'norm.park.sn', netzabfrage: false, themen: [], name: PARK_SN, anbieter: 'VSS', gebiet: { art: 'schweiz' }, dienst: 'datei',
    lizenz: 'Urheberrechtlich geschützte Norm, kein Normtext eingebunden', stand: 'gültig ab 1.2.2006', cors: true, empfaenger: 'eigen',
    datenschutz: 'Parkplatz-Mindestbreiten als dokumentierte Modellannahme im Browser; keine Netzabfrage der Norm.',
    module: ['rechner/parkgeometrie.ts'], hinweis: 'Tab. 2, Längsparkfelder A/B: 1,90 m; C: 2,00 m. Keine Aussage zur heutigen Normkonformität.' },
  { id: 'norm.park.zh', netzabfrage: false, themen: [], name: PARK_ZH, anbieter: 'Kanton Zürich, Tiefbauamt', gebiet: { art: 'kantone', kantone: ['ZH'] }, dienst: 'datei',
    lizenz: 'Grundlage der Modellannahme, kein Richtlinientext eingebunden', stand: 'Version 1.0, 1.11.2022', cors: true, empfaenger: 'eigen',
    datenschutz: 'Zürcher Parkplatz-Mindestbreite als dokumentierte Modellannahme im Browser; keine Netzabfrage der Richtlinie.',
    module: ['rechner/parkgeometrie.ts'], hinweis: 'Kap. 4.1: 2,00 m auf Staatsstrassen; Anwendung im ganzen Kanton als Modellannahme.' },
  ...REGIONAL_DIENSTE.map((d): Quelle => ({ id: `regional.${d.id}`, themen: ['beleuchtung', 'taktil', 'netz'].includes(d.art) ? [] : d.art === 'tempo' || d.art === 'zone' ? ['tempo'] : d.art==='strasse'?['strassentyp']:d.art==='bauzone'?['zonen']:d.art==='bedarf'?['schulen']:d.art==='tram'||d.art==='unfall'?[]:['uebergaenge'], name: d.name, anbieter: d.anbieter,
    gebiet: d.kanton==='CH'?{art:'schweiz'}:d.bfs ? { art: 'gemeinden', bfs: [d.bfs], name: d.id.startsWith('bedarf.zh.') ? 'Stadt Zürich' : d.id === 'bedarf.winterthur' ? 'Stadt Winterthur' : d.name } : { art: 'kantone', kantone: [d.kanton] },
    dienst: d.format === 'arcgis' ? 'arcgis' : d.format === 'wfs' || d.format === 'gml' ? 'wfs' : 'api',
    lizenz: d.lizenz, stand: 'Objekt-/Dienststand bei jedem Laden neu bezogen; unbekannt, falls nicht geliefert', cors: true,
    empfaenger: d.kanton === 'CH' ? 'swisstopo' : 'regional', datenschutz: `${new URL(d.url).host}: ${d.format === 'poi' ? 'Basiskarten-Vektorkacheln um den geladenen Ort für Schul-/Einrichtungshinweise' : `Rechteck ±200 m für ${d.name}, bei dichten Bundesdaten in Teilrechtecken`}; öffentliche Dienstmetadaten${d.meta ? ` (${new URL(d.meta).host})` : ''}`,
    module: ['daten/anbieter/gemeinsam/regional.ts'], hinweis: d.hinweis })),
  ...(['tempo', 'zonen'] as const).map((thema): Quelle => ({ id: thema === 'tempo' ? 'zh.tempo' : 'zh.zone', themen: ['tempo'],
    name: thema === 'tempo' ? 'Signalisierte Geschwindigkeiten' : 'Verkehrszonen', anbieter: 'Stadt Zürich, Dienstabteilung Verkehr',
    gebiet: { art: 'gemeinden', bfs: [261], name: 'Stadt Zürich' }, dienst: 'wfs', lizenz: 'CC0, Stadt Zürich',
    stand: 'Katalogaktualisierung dynamisch; Umsetzung je Objekt getrennt', cors: true, empfaenger: 'zuerich',
    datenschutz: 'Rechteck ±200 m um den Ladeort für heutigen Tempo-/Zonenbestand und Trefferzahl; öffentliche Katalogmetadaten',
    module: ['daten/anbieter/gemeinsam/zuerich.ts'], hinweis: 'Fahrverbot ist kein Tempo 0; Zuordnung mit Strasse, Richtung und Zone prüfen.' })),
  { id: 'zh.park', themen: ['parkfelder'], name: 'Öffentlich zugängliche Parkplätze', anbieter: 'Stadt Zürich, Dienstabteilung Verkehr',
    gebiet: { art: 'gemeinden', bfs: [261], name: 'Stadt Zürich' }, dienst: 'wfs', lizenz: ZH_PARK_LIZENZ, stand: LIVE, cors: true, empfaenger: 'zuerich',
    datenschutz: 'Rechteck ±150 m um den Ladeort für die Parkfelder', module: ['daten/anbieter/gemeinsam/parkZuerich.ts'],
    hinweis: 'Nur Punkte und Linien, Flächen angenommen. Vorschlag: zählt erst nach Bestätigung.' },
  { id: 'av', themen: ['vermessung'], name: 'Amtliche Vermessung (Bodenbedeckung, Einzelobjekte)', anbieter: 'Kantone über geodienste.ch',
    gebiet: { art: 'kantone', kantone: AV_KANTONE }, dienst: 'wfs', lizenz: 'frei mit Quellenangabe (Bedingungen je Kanton)', stand: LIVE,
    cors: true, datenschutz: 'Rechteck ±150 m um den Übergang bzw. die geplanten Streifen', empfaenger: 'geodienste',
    module: ['daten/av.ts', 'avVorschau.ts'],
    hinweis: `Wallis teilweise (ohne einzelne Gemeinden, z. B. Sitten, Brig); ${AV_NICHT_FREI.join(', ')} nur mit Freigabe: dort keine Rechnung, ausser in der Stadt Luzern mit Ersatz` },
  { id: 'swisstopo.karte', themen: [], name: 'Hintergrundkarte (Luftbild bzw. Landeskarte)', anbieter: 'swisstopo', gebiet: { art: 'schweiz' },
    dienst: 'wmts', lizenz: SWISSTOPO_LIZENZ, cors: true,
    datenschutz: 'Kartenkacheln (Luftbild bzw. Landeskarte) des sichtbaren Ausschnitts (wmts.geo.admin.ch)', empfaenger: 'swisstopo',
    module: ['Karte.tsx'] },
  { id: 'swissimage', themen: ['luftbild'], name: 'Luftbild SWISSIMAGE 10 cm', anbieter: 'swisstopo', gebiet: { art: 'schweiz' }, dienst: 'wms',
    lizenz: SWISSTOPO_LIZENZ, stand: 'Flugjahr je 1-km-Kachel', cors: true,
    datenschutz: 'Luftbild-Ausschnitt ±30 m um den gewählten Übergang und das Kartenbild des Berichts (wms.geo.admin.ch), Flugjahr der ' +
      '1-km-Kachel (api3.geo.admin.ch)', empfaenger: 'swisstopo', module: ['daten/luftbild.ts'] },
  { id: 'swisstopo.suche', themen: [], name: 'Ortssuche', anbieter: 'swisstopo', gebiet: { art: 'schweiz' }, dienst: 'api', lizenz: SWISSTOPO_LIZENZ,
    cors: true, datenschutz: 'bei der Ortssuche der eingegebene Suchbegriff (api3.geo.admin.ch)', empfaenger: 'swisstopo',
    module: ['daten/ortssuche.ts'] },
  { id: 'hoehenkurven', themen: [], name: 'Höhenkurven aus swissALTI3D', anbieter: 'swisstopo', gebiet: { art: 'schweiz' }, dienst: 'api',
    lizenz: SWISSTOPO_LIZENZ, stand: 'Ausgabe und Bereitstellung je verwendeter Kachel', cors: true, empfaenger: 'swisstopo',
    datenschutz: 'nur bei eingeschalteten Höhenkurven ab Zoom 18: sichtbarer Ausschnitt für die Kachelsuche und begrenzte Teilabrufe aus Höhenrastern (data.geo.admin.ch); höchstens vier Kacheln',
    module: ['hoehenkurven/holen.ts'] },
  { id: 'swissalti', themen: ['hoehen'], name: 'Höhenmodell swissALTI3D (Profile)', anbieter: 'swisstopo', gebiet: { art: 'schweiz' }, dienst: 'api',
    lizenz: SWISSTOPO_LIZENZ, stand: LIVE, cors: true,
    datenschutz: 'an einer Trottoirüberfahrt bis vier Linien der Knotensicht (Koordinaten) für Höhenprofile (api3.geo.admin.ch); mit einer ' +
      'Kurve vor dem Streifen bzw. mit Radstreifen oder Radweg die Fahrlinie der Zufahrt (50 m, Koordinaten) für die Längsneigung ' +
      '(Kurvenregel, Sicht vom Velo; api3.geo.admin.ch); am Fussgängerstreifen je Zufahrt bis 14 Sichtlinien (Augpunkt und ' +
      'Markierung bzw. Wartefläche, Koordinaten) für das Gelände der Erkennungsdistanz und der Sicht auf die Wartefläche (api3.geo.admin.ch); ' +
      'in der Stadt Bern nur, wenn der Dienst der Stadt nicht antwortet', empfaenger: 'swisstopo',
    module: ['knotensicht/daten/hoehen.ts', 'daten/sichtProfil.ts', 'daten/hoehenDienst.ts'],
    hinweis: 'Gelände verdeckt erst ab 0,3 m über der Sichtlinie (Annahme nach der Genauigkeit ±0,3 m)' },
  { ...bernDienst('bern.dtm', ['hoehen'], 'Geländemodell DTM 2023 (25 cm, Höhenprofile)',
    'Im Stadtgebiet gehen die Linien der Höhenprofile (Knotensicht, Fahrlinie, Sichtlinien; nur Koordinaten) an gisapp.bern.ch (DTM 2023, 25 cm) ' +
    'statt an swisstopo; antwortet der Dienst nicht, an swisstopo (swissALTI3D).', 'daten/bernDtm.ts',
    'Befliegung 2. Juni 2023; Produktstand aus den Metadaten'), datenschutzSatz: true,
    hinweis: 'Gelände verdeckt erst ab 0,15 m über der Sichtlinie (Annahme nach der Genauigkeit ca. 10 cm); ausserhalb der Stadt und bei Ausfall swissALTI3D' },
  BAV_QUELLE,
  NPVM_QUELLE,
  { id: 'swisstopo.gebiet', themen: [], name: 'Gebietsbestimmung (Gemeindegrenzen)', anbieter: 'swisstopo',
    gebiet: { art: 'schweiz' }, dienst: 'api', lizenz: SWISSTOPO_LIZENZ, stand: 'Aktueller Jahresstand; Abrufzeit je Fall', cors: true,
    datenschutz: 'Ladepunkt und Rechteck ±200 m für die Gebietsbestimmung ohne AV (api3.geo.admin.ch)', empfaenger: 'swisstopo',
    module: ['daten/anbieter/gemeinsam/gebiet.ts'] },
  { id: 'osm', themen: ['strassennetz', 'uebergaenge', 'haltestellen', 'strassentyp', 'tempo', 'schulen'], name: 'OpenStreetMap (Overpass)',
    anbieter: 'OpenStreetMap', gebiet: { art: 'schweiz' }, dienst: 'overpass', lizenz: 'ODbL, © OpenStreetMap-Mitwirkende', stand: LIVE, cors: true,
    datenschutz: 'Kartenausschnitt (Übergänge und Strassennamen) mit etwas Rand bei der Suche (automatisch beim Start und nach dem ' +
      'Verschieben bzw. Zoomen) bzw. Umkreis 300 m um den Übergang bzw. die geplanten Streifen; Server ' +
      `${OVERPASS_ERSTER} (Swiss OpenStreetMap Association), bei Störung ersatzweise ${OVERPASS_WEITERE.join(', ')}`,
    empfaenger: 'overpass', module: ['daten/osm.ts'],
    hinweis: 'Haltestellen, Schulen, Tempo (maxspeed) und Strassentyp (Strassenklasse) nur als Ersatz, wo eine amtliche Quelle fehlt' },
  { id: 'bern.park', themen: ['parkfelder'], name: 'Parkplätze öffentlich', anbieter: 'Geodaten Stadt Bern', gebiet: BERN, dienst: 'wfs',
    lizenz: BERN_LIZENZ, stand: LIVE, cors: true, datenschutz: 'amtliche Parkfelder', empfaenger: 'bern', module: ['daten/parkkataster.ts'],
    hinweis: 'ohne private Parkplätze' },
  { id: 'bern.baum', themen: ['baeume'], name: 'Baumkataster', anbieter: 'Geodaten Stadt Bern', gebiet: BERN, dienst: 'wfs', lizenz: BERN_LIZENZ,
    stand: LIVE, cors: true, datenschutz: 'Baumkataster', empfaenger: 'bern', module: ['daten/baumkataster.ts'] },
  bernDienst('bern.halt', ['haltestellen'], 'Haltestellen', 'Haltestellen', 'daten/haltestellen.ts'),
  bernDienst('bern.dtv', ['dtv'], 'Flächendeckende Verkehrsdaten (DTV)', 'Verkehrsdaten', 'daten/verkehrsdaten.ts', 'DTV des Vorjahres'),
  { id: 'zh.dtv', themen: ['dtv'], name: 'Verkehrsmessstellen', anbieter: 'Kanton Zürich', gebiet: { art: 'kantone', kantone: ['ZH'] }, dienst: 'wfs', lizenz: 'CC0, Kanton Zürich',
    stand: 'Zähljahr je Messstelle', cors: true, empfaenger: 'regional', datenschutz: 'maps.zh.ch: alle Messstellen auf einmal, ohne Ortsangabe', module: ['daten/zaehlstellen.ts'],
    hinweis: ZAEHL_HINWEIS },
  { id: 'lu.dtv', themen: ['dtv'], name: 'Verkehrszähldaten', anbieter: 'Stadt Luzern', gebiet: LUZERN, dienst: 'arcgis', lizenz: LUZERN_LIZENZ, stand: 'Zähljahr je Stelle', cors: true,
    empfaenger: 'regional', datenschutz: 'map.stadtluzern.ch: alle Zählstellen auf einmal, ohne Ortsangabe', module: ['daten/zaehlstellen.ts'], hinweis: ZAEHL_HINWEIS },
  { id: 'bs.dtv', themen: ['dtv'], name: 'Verkehrszählung (Datei dtv_basel.json)', anbieter: 'Kanton Basel-Stadt', gebiet: { art: 'kantone', kantone: ['BS'] }, dienst: 'datei',
    lizenz: 'Open Government Data Kanton Basel-Stadt, Quellenangabe Pflicht', stand: 'unbekannt (Datei ohne Zähljahr)', cors: true, empfaenger: 'eigen',
    datenschutz: 'Die Datei dtv_basel.json (Zählstellen Basel-Stadt) kommt von dieser Seite selbst, dafür geht keine Abfrage an einen anderen Dienst.',
    module: ['daten/zaehlstellen.ts'], hinweis: `Werktagsmittel, kein DTV. ${ZAEHL_HINWEIS}` },
  bernDienst('bern.richtplan', ['fusswegnetz'], 'Richtplan Fussverkehr', 'Richtplan Fussverkehr', 'daten/richtplanFussverkehr.ts'),
  bernDienst('bern.strassen', ['strassentyp'], 'Strassenhierarchie und Strassentypen', 'Strassenhierarchie und Strassentypen',
    'daten/strassenhierarchie.ts'),
  { ...bernDienst('bern.vsig', ['tempo'], 'Signalisierte Höchstgeschwindigkeit', 'signalisierte Höchstgeschwindigkeit', 'daten/vsig.ts'),
    module: ['daten/vsig.ts', 'daten/anbieter/bernTempo.ts'] },
  bernDienst('bern.schulen', ['schulen'], 'Volksschulen, Kindergärten, Kitas, Kinderangebote, Heime, Spitäler', 'Volksschulen, Kindergärten, Kitas (als Kindergarten), Kinderangebote (als Schule), Heime und Spitäler (als Heim) (±200 m)', 'daten/schulen.ts'),
  bernDienst('bern.taktil', ['taktil'], 'Taktil-visuelle Markierungen', 'taktil-visuelle Markierungen', 'daten/taktil.ts'),
  bernDienst('bern.zonen', ['zonen'], 'Nutzungszonenplan', 'Nutzungszonen', 'daten/nutzungszonen.ts'),
  bernDienst('bern.oev', ['oevLinien'], 'ÖV-Linien', 'ÖV-Linien', 'daten/oevLinien.ts'),
  { ...bernDienst('bern.richtplanKarte', [], 'Richtplan Fussverkehr (Kartenebene)',
    'Die Kartenebene «Richtplan Fussverkehr (Geoportal Bern)» sendet den sichtbaren Kartenausschnitt mit Rand (Rechteck in LV95, je Layer ' +
    'eine Abfrage) nur, wenn sie eingeschaltet ist.', 'daten/richtplanKarte.ts'), datenschutzSatz: true,
    hinweis: 'nur Anzeige, anfangs aus, ab Zoomstufe 15' },
  // Kartenebene «Taktile Markierungen (Stadt Bern)» (30.10.2026): eigener Eintrag wie der Richtplan (eigenes Modul, eigene Abfragen)
  { ...bernDienst('bern.taktilKarte', [], 'Taktil-visuelle Markierungen (Kartenebene)',
    'Die Kartenebene «Taktile Markierungen (Stadt Bern)» sendet den sichtbaren Kartenausschnitt mit Rand (Rechteck in LV95, je Layer ' +
    'eine Abfrage, zwei Layer) nur, wenn sie eingeschaltet ist, und erst ab Zoomstufe 15.', 'daten/taktilKarte.ts'), datenschutzSatz: true,
    hinweis: 'nur Anzeige, anfangs aus, ab Zoomstufe 15' },
  { ...bernDienst('bern.ortho', [], 'Orthofoto 2026 (Kartenhintergrund)', 'Wird der Hintergrund «Luftbild Stadt Bern 2026» gewählt, holt der Browser die Kartenbilder des sichtbaren Ausschnitts bei map.bern.ch.', 'kartenbaustein/hintergrund.ts', 'Flug 19. März 2026'), datenschutzSatz: true,
    hinweis: 'nur Hintergrund, wählbar im Gemeindegebiet' },
  // Stadt Luzern: Ersatz der AV (seit 07.11.2026), siehe daten/ersatzLuzern.ts
  { id: 'lu.boden', themen: ['vermessung'], name: 'Strassenflächen (Ersatz der AV)', anbieter: 'Stadt Luzern', gebiet: LUZERN, dienst: 'arcgis', lizenz: LUZERN_LIZENZ, stand: LIVE, cors: true,
    datenschutz: 'Strassenflächen (map.stadtluzern.ch, Rechteck ±150 m)', empfaenger: 'regional', module: ['daten/ersatzLuzern.ts'],
    hinweis: 'Fahrbahn, Trottoir und Inseln; endet an der Stadtgrenze' },
  { id: 'lu.gebaeude', themen: ['vermessung'], name: 'Blockmodelle Gebäude (Ersatz der AV)', anbieter: 'Kanton Luzern', gebiet: LUZERN, dienst: 'arcgis', lizenz: 'Freie Nutzung (opendata.swiss)', stand: LIVE, cors: true,
    datenschutz: 'Gebäudegrundrisse (public.geo.lu.ch, Rechteck ±150 m)', empfaenger: 'regional', module: ['daten/ersatzLuzern.ts'],
    hinweis: 'Grundrisse der AV mit relativer Höhe; Einzelobjekte wie Mauern fehlen' },
  { id: 'lu.park', themen: ['parkfelder'], name: 'Öffentliche Parkplätze', anbieter: 'Stadt Luzern', gebiet: LUZERN, dienst: 'arcgis', lizenz: LUZERN_LIZENZ, stand: LIVE, cors: true,
    datenschutz: 'öffentliche Parkfelder (map.stadtluzern.ch)', empfaenger: 'regional', module: ['daten/parkLuzern.ts'], hinweis: 'ohne private Parkplätze' },
  ...LUFTBILD_FGS_STAEDTE.map(({ stadt, bbox }): Quelle => {
    const k = ETH_KURZ[stadt] ?? stadt.toLowerCase()
    return { id: `eth.fgs.${k}`, themen: ['fgsLuftbild'], name: `Streifen aus dem Luftbild, ${stadt} (ETH-Modell)`,
      anbieter: 'ETH Zürich / eigene Läufe', gebiet: { art: 'bbox', w: bbox[0], s: bbox[1], e: bbox[2], n: bbox[3], name: stadt },
      dienst: 'datei', lizenz: `Modell MIT-Lizenz; Luftbild ${k === 'bern' ? '© swisstopo bzw. © Geodaten Stadt Bern' : '© swisstopo'}; ` +
        'Abgleich ODbL', stand: `Snapshot-Erzeugung und Flugjahre je geladener Datei (${ETH_BILD[k] ?? 'SWISSIMAGE'})`, cors: true,
      datenschutz: 'Die Streifen aus dem Luftbild (ETH-Modell) liegen als Datei je Stadt auf dieser Seite: dafür geht keine Anfrage an ' +
        'einen anderen Dienst.', empfaenger: 'eigen', module: ['daten/luftbildFgs.ts'], hinweis: 'nur Hinweis zum Prüfen' }
  }),
]

export const quelle = (id: string): Quelle | undefined => QUELLEN.find(q => q.id === id)

// ── Ort und Zuständigkeit ──

export interface Gemeinde { bfs: number | null; kanton?: string }
/** Gemeinde (BFS) und Kanton der AV-Fläche an einem Punkt: zuerst Strasse bzw. Weg, sonst jede Fläche; null ohne Treffer */
export function gemeindeAmOrt(p: P, av: readonly AvFlaeche[]): Gemeinde | null {
  const f = av.find(x => x.art === 'Strasse_Weg' && imPolygon(p, x.ringe)) ?? av.find(x => imPolygon(p, x.ringe))
  return f ? { bfs: f.bfs, ...(f.kanton ? { kanton: f.kanton } : {}) } : null
}

export interface Ort { bfs?: number | null; kanton?: string; lat: number; lon: number }

/** Deckt das Gebiet den Ort? Kantone bzw. Gemeinden nur mit bekanntem Kanton bzw. bekannter BFS-Nummer */
export function deckt(g: Gebiet, o: Ort): boolean {
  switch (g.art) {
    case 'schweiz': return true
    case 'kantone': return !!o.kanton && g.kantone.includes(o.kanton)
    case 'gemeinden': return o.bfs != null && g.bfs.includes(o.bfs)
    case 'bbox': return o.lat >= g.s && o.lat <= g.n && o.lon >= g.w && o.lon <= g.e
  }
}

/** Quellen, deren Gebiet den Ort deckt (Reihenfolge des Registers) */
export const quellenFuer = (o: Ort, liste: readonly Quelle[] = QUELLEN): Quelle[] => liste.filter(q => deckt(q.gebiet, o))

/** Vorrang bei mehreren Quellen für ein Thema: die örtlichste */
const RANG: Record<Gebiet['art'], number> = { gemeinden: 0, bbox: 1, kantone: 2, schweiz: 3 }

export const THEMEN: readonly Thema[] = ['vermessung', 'luftbild', 'hoehen', 'strassennetz', 'uebergaenge', 'fgsLuftbild', 'parkfelder', 'baeume',
  'haltestellen', 'dtv', 'fusswegnetz', 'strassentyp', 'tempo', 'schulen', 'taktil', 'zonen', 'oevLinien']

export const THEMA_NAME: Record<Thema, string> = {
  vermessung: 'Vermessung', luftbild: 'Luftbild', hoehen: 'Höhen', strassennetz: 'Strassennetz', uebergaenge: 'Übergänge',
  fgsLuftbild: 'Streifen aus dem Luftbild (ETH)', parkfelder: 'Parkfelder', baeume: 'Bäume', haltestellen: 'Haltestellen', dtv: 'Verkehrsmengen',
  fusswegnetz: 'Fusswegnetz', strassentyp: 'Strassentyp', tempo: 'Tempo-Signalisation', schulen: 'Schulen', taktil: 'taktile Markierungen',
  zonen: 'Bauzonen (Nutzungszonenplan)', oevLinien: 'ÖV-Linien',
}
/** Name eines Themas, wenn es nur OSM deckt */
const THEMA_OSM: Partial<Record<Thema, string>> = { tempo: 'Tempo' }

export type Datenlage = Record<Thema, Quelle | null>
/** je Thema die massgebende Quelle am Ort (örtlichste zuerst), null ohne Quelle */
export function datenlage(o: Ort, liste: readonly Quelle[] = QUELLEN): Datenlage {
  const hier = quellenFuer(o, liste)
  const aus = {} as Datenlage
  for (const t of THEMEN)
    aus[t] = hier.filter(q => q.themen.includes(t)).sort((a, b) => RANG[a.gebiet.art] - RANG[b.gebiet.art])[0] ?? null
  return aus
}

/** Themen der Grundlage (immer genannt) und Themen mit örtlicher Quelle (Reihenfolge des Satzes) */
const ORTS_THEMEN: readonly Thema[] = ['parkfelder', 'baeume', 'haltestellen', 'dtv', 'fusswegnetz', 'strassentyp', 'tempo', 'schulen', 'taktil',
  'zonen', 'oevLinien']

/** Quellen, deren Werte erst nach Bestätigung wirken */
const QUELLEN_MIT_BESTAETIGUNG: readonly string[] = ['zh.park', 'zh.dtv', 'lu.dtv', 'bs.dtv']

const gebietName = (g: Gebiet) => (g.art === 'gemeinden' || g.art === 'bbox' ? g.name : '')

/**
 * Ein bis zwei Sätze zur Datenlage am Ort, z. B. «Datenlage hier: Vermessung, Luftbild, OSM; dazu Stadt Bern: Parkfelder, …».
 * Ohne freie AV: «Amtliche Vermessung hier nicht frei verfügbar: keine Rechnung.» Ohne örtliche Quelle: was OSM ersetzt und wofür
 * es keine Quelle gibt (Angaben von Hand).
 */
export function datenlageSatz(d: Datenlage): string {
  const grund = [d.vermessung && 'Vermessung', d.luftbild && 'Luftbild', (d.strassennetz || d.uebergaenge) && 'OSM',
    d.fgsLuftbild && 'Luftbild-Streifen (ETH)'].filter((x): x is string => !!x)
  const kopf = `Datenlage hier: ${grund.join(', ') || 'keine'}`
  if (!d.vermessung) return `${kopf}. Amtliche Vermessung hier nicht frei verfügbar: keine Rechnung.`
  // örtliche Quellen nach Gebiet (z. B. «Stadt Bern»), OSM als Ersatz, ohne Quelle
  const ort = new Map<string, Thema[]>()
  const weitere = new Map<string, Thema[]>()
  const osm: Thema[] = [], ohne: Thema[] = []
  for (const t of ORTS_THEMEN) {
    const q = d[t]
    if (!q) ohne.push(t)
    else if (q.gebiet.art === 'gemeinden' || q.gebiet.art === 'bbox') ort.set(gebietName(q.gebiet), [...(ort.get(gebietName(q.gebiet)) ?? []), t])
    else if (q.id === 'osm') osm.push(t)
    else weitere.set(q.anbieter, [...(weitere.get(q.anbieter) ?? []), t])
  }
  const zusatz = (t: Thema) => { const id = d[t]?.id ?? ''
    return id === 'are.npvm' ? ' (modelliert)' : id.startsWith('regional.bund.') ? ' (Hinweise, bestätigen)' : QUELLEN_MIT_BESTAETIGUNG.includes(id) ? ' (Vorschlag, bestätigen)' : '' }
  const teile = [...ort].map(([n, ts]) => `dazu ${n}: ${ts.map(t => THEMA_NAME[t] + zusatz(t)).join(', ')}`)
  let s = teile.length ? `${kopf}; ${teile.join('; ')}.` : `${kopf}.`
  const rest: string[] = []
  for (const [anbieter, ts] of weitere) rest.push(`Aus ${anbieter}: ${ts.map(t => THEMA_NAME[t] + zusatz(t)).join(', ')}`)
  if (osm.length) rest.push(`Aus OSM: ${osm.map(t => THEMA_OSM[t] ?? THEMA_NAME[t]).join(', ')}`)
  if (ohne.length) rest.push(`${rest.length ? 'keine' : 'Keine'} Quelle für ${ohne.map(t => THEMA_NAME[t]).join(', ')}: Angaben von Hand`)
  if (rest.length) s += ` ${rest.join('; ')}.`
  return s
}

/** Zeilen der Tabelle je Thema: Thema, Quelle (null: keine) */
export const datenlageZeilen = (d: Datenlage): { thema: Thema; quelle: Quelle | null }[] =>
  THEMEN.map(t => ({ thema: t, quelle: d[t] }))

// ── Datenschutz (Hilfe): je Empfänger die Angaben der Quellen ──

export const EMPFAENGER_NAME: Record<Exclude<Empfaenger, 'eigen'>, string> = {
  swisstopo: 'swisstopo (geo.admin.ch)', geodienste: 'geodienste.ch (Amtliche Vermessung)', overpass: 'Overpass (OpenStreetMap)',
  regional: 'Regionale Geoportale der Kantone und Städte (nur im jeweiligen Gebiet)',
  zuerich: 'ogd.stadt-zuerich.ch und data.stadt-zuerich.ch (Stadt Zürich)',
  bern: 'map.bern.ch und gisapp.bern.ch (Geodaten Stadt Bern), nur in der Stadt Bern',
}
const und = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}` : xs[0] ?? '')

/** Zeilen der Datenschutz-Liste je Empfänger (Reihenfolge wie EMPFAENGER_NAME) und die Sätze zu eigenen Dateien */
export function datenschutzGruppen(liste: readonly Quelle[] = QUELLEN): { gruppen: { name: string; text: string }[]; eigen: string[] } {
  const gruppen = (Object.keys(EMPFAENGER_NAME) as (keyof typeof EMPFAENGER_NAME)[]).flatMap(e => {
    const qs = liste.filter(q => q.empfaenger === e && q.netzabfrage !== false)
    if (!qs.length) return []
    const auf = qs.filter(q => !q.datenschutzSatz).map(q => q.datenschutz), saetze = qs.filter(q => q.datenschutzSatz).map(q => q.datenschutz)
    const kern = e === 'bern' ? `Rechteck ±150 m für ${und(auf)}` : auf.join('; ')
    return [{ name: EMPFAENGER_NAME[e], text: [`${kern}.`, ...saetze].join(' ') }]
  })
  const eigen = [...new Set(liste.filter(q => q.empfaenger === 'eigen' && q.netzabfrage !== false).map(q => q.datenschutz))]
  return { gruppen, eigen }
}
