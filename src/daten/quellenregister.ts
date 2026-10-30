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

import { imPolygon, type P } from '../geo'
import type { AvFlaeche } from './av'
import { OVERPASS_ENDPOINTS } from './osm'
import { LUFTBILD_FGS_STAEDTE } from './luftbildFgs'

/** Bedarf der App, den eine Quelle deckt */
export type Thema = 'vermessung' | 'luftbild' | 'hoehen' | 'strassennetz' | 'uebergaenge' | 'parkfelder' | 'baeume' | 'haltestellen' |
  'dtv' | 'fusswegnetz' | 'strassentyp' | 'tempo' | 'schulen' | 'taktil' | 'zonen' | 'oevLinien' | 'fgsLuftbild'

export type Gebiet =
  | { art: 'schweiz' }
  | { art: 'kantone'; kantone: string[] }
  | { art: 'gemeinden'; bfs: number[]; name: string }
  | { art: 'bbox'; s: number; w: number; n: number; e: number; name: string }

/** Empfänger der Anfragen (Gruppe der Datenschutz-Liste) */
export type Empfaenger = 'swisstopo' | 'geodienste' | 'overpass' | 'bern' | 'eigen'

export interface Quelle {
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
const BERN_LIZENZ = 'Open Data Stadt Bern: freie Nutzung, Quellenangabe Pflicht'
const SWISSTOPO_LIZENZ = 'frei, Quellenangabe «© swisstopo»'
const LIVE = 'Abruf beim Laden'

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
  { id: 'av', themen: ['vermessung'], name: 'Amtliche Vermessung (Bodenbedeckung, Einzelobjekte)', anbieter: 'Kantone über geodienste.ch',
    gebiet: { art: 'kantone', kantone: AV_KANTONE }, dienst: 'wfs', lizenz: 'frei mit Quellenangabe (Bedingungen je Kanton)', stand: LIVE,
    cors: true, datenschutz: 'Rechteck ±150 m um den Übergang bzw. die geplanten Streifen', empfaenger: 'geodienste',
    module: ['daten/av.ts', 'avVorschau.ts'],
    hinweis: `Wallis teilweise (ohne einzelne Gemeinden, z. B. Sitten, Brig); ${AV_NICHT_FREI.join(', ')} nur mit Freigabe: dort keine Rechnung` },
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
  { id: 'swissalti', themen: ['hoehen'], name: 'Höhenmodell swissALTI3D (Profile)', anbieter: 'swisstopo', gebiet: { art: 'schweiz' }, dienst: 'api',
    lizenz: SWISSTOPO_LIZENZ, stand: LIVE, cors: true,
    datenschutz: 'an einer Trottoirüberfahrt bis vier Linien der Knotensicht (Koordinaten) für Höhenprofile (api3.geo.admin.ch); mit einer ' +
      'Kurve vor dem Streifen bzw. mit Radstreifen oder Radweg die Fahrlinie der Zufahrt (50 m, Koordinaten) für die Längsneigung ' +
      '(Kurvenregel, Sicht vom Velo; api3.geo.admin.ch)', empfaenger: 'swisstopo', module: ['knotensicht/daten/hoehen.ts'] },
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
  bernDienst('bern.richtplan', ['fusswegnetz'], 'Richtplan Fussverkehr', 'Richtplan Fussverkehr', 'daten/richtplanFussverkehr.ts'),
  bernDienst('bern.strassen', ['strassentyp'], 'Strassenhierarchie und Strassentypen', 'Strassenhierarchie und Strassentypen',
    'daten/strassenhierarchie.ts'),
  bernDienst('bern.vsig', ['tempo'], 'Signalisierte Höchstgeschwindigkeit', 'signalisierte Höchstgeschwindigkeit', 'daten/vsig.ts'),
  bernDienst('bern.schulen', ['schulen'], 'Volksschulen und Kindergärten', 'Volksschulen und Kindergärten (±200 m)', 'daten/schulen.ts'),
  bernDienst('bern.taktil', ['taktil'], 'Taktil-visuelle Markierungen', 'taktil-visuelle Markierungen', 'daten/taktil.ts'),
  bernDienst('bern.zonen', ['zonen'], 'Nutzungszonenplan', 'Nutzungszonen', 'daten/nutzungszonen.ts'),
  bernDienst('bern.oev', ['oevLinien'], 'ÖV-Linien', 'ÖV-Linien', 'daten/oevLinien.ts'),
  { ...bernDienst('bern.richtplanKarte', [], 'Richtplan Fussverkehr (Kartenebene)',
    'Die Kartenebene «Richtplan Fussverkehr (Geoportal Bern)» sendet den sichtbaren Kartenausschnitt mit Rand (Rechteck in LV95, je Layer ' +
    'eine Abfrage) nur, wenn sie eingeschaltet ist.', 'daten/richtplanKarte.ts'), datenschutzSatz: true,
    hinweis: 'nur Anzeige, anfangs aus, ab Zoomstufe 15' },
  ...LUFTBILD_FGS_STAEDTE.map(({ stadt, bbox }): Quelle => {
    const k = ETH_KURZ[stadt] ?? stadt.toLowerCase()
    return { id: `eth.fgs.${k}`, themen: ['fgsLuftbild'], name: `Streifen aus dem Luftbild, ${stadt} (ETH-Modell)`,
      anbieter: 'ETH Zürich / eigene Läufe', gebiet: { art: 'bbox', w: bbox[0], s: bbox[1], e: bbox[2], n: bbox[3], name: stadt },
      dienst: 'datei', lizenz: `Modell MIT-Lizenz; Luftbild ${k === 'bern' ? '© swisstopo bzw. © Geodaten Stadt Bern' : '© swisstopo'}; ` +
        'Abgleich ODbL', stand: `Snapshot ${ETH_STAND[k] ?? '–'} (${ETH_BILD[k] ?? 'SWISSIMAGE'})`, cors: true,
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
  zonen: 'Zonen', oevLinien: 'ÖV-Linien',
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
  const osm: Thema[] = [], ohne: Thema[] = []
  for (const t of ORTS_THEMEN) {
    const q = d[t]
    if (!q) ohne.push(t)
    else if (q.gebiet.art === 'gemeinden' || q.gebiet.art === 'bbox') ort.set(gebietName(q.gebiet), [...(ort.get(gebietName(q.gebiet)) ?? []), t])
    else osm.push(t)
  }
  const teile = [...ort].map(([n, ts]) => `dazu ${n}: ${ts.map(t => THEMA_NAME[t]).join(', ')}`)
  let s = teile.length ? `${kopf}; ${teile.join('; ')}.` : `${kopf}.`
  const rest: string[] = []
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
  bern: 'map.bern.ch (Geodaten Stadt Bern), nur in der Stadt Bern',
}
const und = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}` : xs[0] ?? '')

/** Zeilen der Datenschutz-Liste je Empfänger (Reihenfolge wie EMPFAENGER_NAME) und die Sätze zu eigenen Dateien */
export function datenschutzGruppen(liste: readonly Quelle[] = QUELLEN): { gruppen: { name: string; text: string }[]; eigen: string[] } {
  const gruppen = (Object.keys(EMPFAENGER_NAME) as (keyof typeof EMPFAENGER_NAME)[]).flatMap(e => {
    const qs = liste.filter(q => q.empfaenger === e)
    if (!qs.length) return []
    const auf = qs.filter(q => !q.datenschutzSatz).map(q => q.datenschutz), saetze = qs.filter(q => q.datenschutzSatz).map(q => q.datenschutz)
    const kern = e === 'bern' ? `Rechteck ±150 m für ${und(auf)}` : auf.join('; ')
    return [{ name: EMPFAENGER_NAME[e], text: [`${kern}.`, ...saetze].join(' ') }]
  })
  const eigen = [...new Set(liste.filter(q => q.empfaenger === 'eigen').map(q => q.datenschutz))]
  return { gruppen, eigen }
}
