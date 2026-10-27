// ── Bedarfsmodul: Eingaben (E0) ──
//
// Alle Felder aus Bedarfsmodul_E0_Regeln.md Abschnitt 2.2, je mit Wert und Quelle. Ein Feld ohne Wert ist «offen»
// (Entscheid E0-2): Regeln, die es brauchen, melden «offen» statt «bestanden». Einziger Ersatzwert: fehlt V85, gilt das
// signalisierte Tempo (als Annahme im Befund).
// Begriffe (Entscheid E0-3): fahrbahnB = Bord–Bord entlang der Streifenachse (nach Flächen (Plan)), inklusive Park- und
// Radstreifen (wie die Vermassung); nRichtung = Fahrstreifen je Richtung aus OSM lanes, Busstreifen zählen, Radstreifen nicht.
// E0 hat keine Oberfläche; E1 hängt diesen Block an die Fall-Datei (Block bedarf).

/**
 * Herkunft eines Werts; bestaetigt = vorgeschlagene Annahme von Hand bestätigt (Korrektur M2, gilt als Handeingabe, keine Annahme);
 * vorschlag = Vorschlag der Vorbelegung, der für die Beurteilung wie eine Tatsache gilt und von Hand geändert werden kann (bisher nur
 * Begegnungszone bei Tempo 20, Nutzerentscheid 23.10.2026); keine Annahme, also kein «Annahme bestätigen»
 */
export type Quelle = 'av' | 'osm' | 'geoportal' | 'luftbild' | 'hand' | 'bestaetigt' | 'annahme' | 'schaetzung' | 'rechnung' | 'vorschlag'
export const QUELLEN: readonly Quelle[] = ['av', 'osm', 'geoportal', 'luftbild', 'hand', 'bestaetigt', 'annahme', 'schaetzung', 'rechnung', 'vorschlag']
/** Quellen, die der Befund als Annahme ausweist */
export const QUELLEN_ANNAHME: readonly Quelle[] = ['annahme', 'schaetzung']

export type Querungstyp = 'fgs' | 'furt' | 'ohne_vortritt' | 'lsa' | 'trottoirueberfahrt' | 'mehrzweck'
export const QUERUNGSTYPEN: readonly Querungstyp[] = ['fgs', 'furt', 'ohne_vortritt', 'lsa', 'trottoirueberfahrt', 'mehrzweck']
export type TempoRegime = 'strecke' | 't30_zone' | 'begegnungszone'
export type FgKlasse = '<100' | '100-500' | '>500'
export type FgQuelle = 'zaehlung' | 'schaetzung'
export type Netz = 'basisnetz' | 'publikumsintensiv' | 'feinverteiler' | 'keins'
/** fusswegnetz: Zugehörigkeit zum Fusswegnetz (Bern, C2-B; Runde 5), zählt nur mit der Ebene Bern */
export type Beduerfnis = 'schule' | 'kindergarten' | 'heim' | 'haltestelle' | 'schulweg' | 'fusswegnetz'
export type Strassentyp = 'verkehrsorientiert' | 'siedlungsorientiert'
export type Nachfrage = 'punktuell' | 'flaechig'
export type Lage = 'strecke' | 'knoten_berechtigt' | 'knoten_belastet' | 'einmuendung' | 'kreisel'
export type Tram = 'keins' | 'eigentrassee' | 'fahrbahn'
export type Blinklicht = 'keins' | 'gelb_ssv' | 'nicht_ssv'
export type MivKlasse = 'tief' | 'mittel' | 'hoch'

/** Insel an der Querung. kopfUeberstand: Inselkopf über den Streifenrand je Seite [m]; furt: Rollstuhlfurt [m] */
export interface Insel {
  vorhanden: boolean
  art: 'baulich' | 'markiert' | null
  breite: number | null
  kopfUeberstand: [number, number] | null
  vertikal: boolean | null
  kopfErhoeht: boolean | null
  pfostenH: number | null
  furt: number | null
}
/** Bushaltestelle in der Nähe; art null = keine Haltestelle */
export interface Haltestelle {
  art: 'fahrbahn' | 'bucht' | null
  lage: 'fgs_nach_halt' | 'fgs_vor_halt' | 'im_bereich' | null
  verdeckt: boolean | null
  ueberholenUnterbunden: boolean | null
}
/** Halteverbotslinie; beidseits: auf Einbahnstrassen auf beiden Seiten */
export interface Hvl { vorhanden: boolean; laengeM: number | null; beidseits: boolean | null }
/** Fussweg in der Achse des Streifens (G3b) */
/** Fussweg in der Achse: versatz und umlaufschranke zählen nur, wenn der Weg direkt und verdeckt mündet (Korrektur S8) */
export interface FusswegAchse { rechtwinkligUneinsehbar: boolean; versatz: boolean | null; umlaufschranke: boolean | null }
export interface Randabschluss { art: 'vertikal' | 'schraeg' | 'hoch'; hoeheMm: number | null; breiteM: number | null }
/** Kurve vor dem Streifen bzw. Knotenradius; fuenfBedingungen: Voraussetzungen von 40 241 Tab. 2 alle erfüllt */
export interface Kurve { radius: number | null; fuenfBedingungen: boolean }
/** LSA-Zeiten (nur Typ Q2; Ausbau E4). L = Querung Bord–Bord [m], teile = Teilquerungen an der Insel, Zeiten in s */
export interface LsaZeiten {
  L: number | null
  teile: [number, number] | null
  inselB: number | null
  gelb: number | null
  freigabe: number | null
  phasengleich: boolean | null
  beideRichtungenImZyklus: boolean | null
  wartezeit: number | null
  vorstart: number | null
  abbiegerKonflikt: boolean | null
  inselGeraet: boolean | null
  inselNurAnmeldung: boolean | null
}
/** Trottoirüberfahrt (nur Einmündungen; Ausbau E5). anrampung null = keine Anrampung gewählt */
export interface Q3 {
  bebaut: boolean | null
  gewerbe: boolean | null
  anschlussGewerbe: boolean | null
  ueber: 'einmuendend' | 'haupt' | null
  vSigHaupt: number | null
  vSigEinm: number | null
  nEinm: number | null
  nHaupt: number | null
  trottoirBeidseits: boolean | null
  winkel: number | null
  knotensichtOk: boolean | null
  hvl5m: boolean | null
  gegenueberEinm: boolean | null
  belastungSchwach: boolean | null
  veloSchule: boolean | null
  einmSiedlungsorientiert: boolean | null
  zoneEinm: 'keine' | 't30' | 'bgz' | null
  eingangstor: boolean | null
  /** Hauptverkehrsstrasse innerorts in einer Tempo-30-Zone (Ausnahme 40 242 Z. 15.1) */
  hauptInZone: boolean | null
  wartezeitEinmS: number | null
  lkwGelegentlich: boolean | null
  linienbus: boolean | null
  lsaKnoten: boolean | null
  kreisel: boolean | null
  breiteM: number | null
  anrampung: { neigung: number; laenge: number } | null
  dtvEinm: number | null
  /** viel Verkehr auf der einmündenden Strasse (Handangabe, keine Zahl in der Norm; Q3-M10) */
  mivEinmHoch: boolean | null
  // Ausstattung (VSS 40 242 Tab. 3; F5c bis F5n, Handangaben)
  /** Trottoirrand entlang der Hauptstrasse läuft gerade durch (nicht zurückgesetzt) */
  randDurchgehend?: boolean | null
  /** Länge des überfahrbaren Randabschlusses entlang der Hauptstrasse [m] */
  ueberfahrbarM?: number | null
  /** Begrenzung des befahrbaren Bereichs */
  begrenzung?: 'poller' | 'randstein' | 'keine' | null
  /** aus der Seitenstrasse auf mindestens 10 m als Überfahrt erkennbar */
  erkennbar?: boolean | null
  /** Belag über die Überfahrt: gleich, Wechsel, Absatz, beides */
  belag?: 'gleich' | 'wechsel' | 'absatz' | 'beides' | null
  /** Quergefälle auf der Überfahrt [%] */
  quergefaelle?: number | null
  /** überfahrbarer Randabschluss zur Hauptstrasse */
  randabschluss?: 's0625' | 's0630' | 's0416' | 'anderer' | null
  /** Randsteine neben der Überfahrt senkrecht, mindestens 6 cm */
  randsteineSenkrecht?: boolean | null
  /** dauernde Signalisation der Überfahrt vorgesehen */
  signalisation?: boolean | null
  /** Markierungen auf der Überfahrt bzw. Wartelinie davor vorgesehen */
  markierung?: boolean | null
  /** Aufmerksamkeitsfelder beidseits mit verbindender Leitlinie */
  taktil?: boolean | null
}

/** Werte aller Felder (ohne Quelle). (neu) = nicht in der Skizze, für die Regeln nötig */
export interface Werte {
  innerorts: boolean
  vSig: number
  tempoRegime: TempoRegime
  v85: number
  v85Nachweis: boolean
  anzeichenSchneller: boolean
  dtv: number
  fg5h: number
  fgKlasse: FgKlasse
  fgQuelle: FgQuelle
  fgSehrHoch: boolean
  netz: Netz
  netzQualifiziert: boolean
  beduerfnis: Beduerfnis[]
  strassentyp: Strassentyp
  starkBelastet: boolean
  nachfrage: Nachfrage
  wunschlinieM: number
  lage: Lage
  knotenArmeOhneQuerung: number
  /** Knoten mit LSA für den Fahrverkehr (neu, D5-2) */
  knotenLsa: boolean
  fahrbahnB: number
  zweirichtung: boolean
  /** Fahrstreifen je Richtung ([n] bei Einbahn) */
  nRichtung: number[]
  radstreifen: boolean
  busspur: boolean
  busDurchmarkiert: boolean
  alleZufahrtsstreifenBelastet: boolean
  tram: Tram
  tramHaltestellenbereich: boolean
  /** Balken über die Gleise markiert (neu, D3b) */
  balkenAufGleis: boolean
  insel: Insel
  inselMoeglich: boolean
  /** Durchfahrt neben der Insel je Seite, quer gemessen [m] */
  durchfahrt: number[]
  haltestelle: Haltestelle
  abstandFgsM: number
  abstandLsaM: number
  verzweigung: boolean
  verzweigungErkennbar: boolean
  haltestelleAngrenzend: boolean
  fgsMitLsa: boolean
  /** Neuanlage (neu, D6-5) */
  neuanlage: boolean
  rueckversatzM: number
  signal411: boolean
  signal411Insel: boolean
  beleuchtung: boolean
  schattenfrei: boolean
  hvl: Hvl
  /** Länge der Halteverbotslinie nach Sichtbedarf [m] (neu, aus dem Sichtrechner) */
  hvlBedarfM: number
  haltenSichtrelevantUeber5m: boolean
  haltenSonstVerboten: boolean
  reklameUnter20m: boolean
  reklameAusnahme: boolean
  annaeherungUeberfahrbar: boolean
  einAusfahrtNah: boolean
  blinklicht: Blinklicht
  /** (neu, G3b) */
  fusswegAchse: FusswegAchse
  streifenBreite: number
  /** Abstand äusserster Balken bis Trottoirkante je Ende [m] */
  randAbstand: number[]
  /** Winkel Streifenachse zum Fahrbahnrand [°], 90 = rechtwinklig */
  achsWinkel: number
  randabschluss: Randabschluss
  /** Quergefälle [%] */
  quergefaelle: number
  /** Trottoirabsenkung [%], 0 = keine */
  absenkung: number
  taktil: boolean
  leitlinie: boolean
  /** lange Querung (neu, F7e; Handangabe, keine Zahl in der Norm) */
  querungLang: boolean
  /** vorhandene Sichtweite je Zufahrt (H1) bzw. je Teilquerung (E3) [m] */
  sichtVorh: number[]
  erkennungM: number
  kurve: Kurve
  /** Querungstyp der beurteilten Anlage (Bestand oder Planung) */
  typ: Querungstyp
  /** Querung ohne bauliche Massnahme (neu, E2d/E2e) */
  ohneBaulich: boolean
  /** Querdistanz je Teilquerung [m] */
  querdistanzL: number[]
  laengsparkierung: boolean
  /** Vorgezogener Seitenraum: Kante vor (+) bzw. hinter (−) der Parklinie [m] */
  seitenraumVorParklinieM: number
  absenkungBeidseits: boolean
  aufstellflaeche: boolean
  parkierungSichtbehindernd: boolean
  /** Nase bzw. seitliche Einengung an der Querung (neu, F4) */
  einengung: boolean
  mivKlasse: MivKlasse
  restbreiteM: number
  einengungLaengeM: number
  mzsBreiteM: number
  /** Fussgängerstreifen über dem Mehrzweckstreifen (neu, D7) */
  mzsMitFgs: boolean
  lsaZeiten: LsaZeiten
  q3: Q3
  kantonsstrasse: boolean
  /** Velos queren mit und warten auf der Insel (neu 23.10.2026, F2-K; nur von Hand, alte Fälle: offen) */
  veloQuerung: boolean
}

export type FeldName = keyof Werte
/** Wert mit Quelle; wert null = offen */
export interface Feld<T> { wert: T | null; quelle: Quelle | null
  /** Runde 4: Abstand entlang der Strasse ist die Länge der ganzen Strasse (sie endet beidseits ohne Fortsetzung; nur aus der
   * Vorbelegung, eine Handeingabe trägt es nicht): G1/G2 dann als Hinweis, kein weiterer Streifen bzw. kein Lichtsignal möglich */
  ganzeStrasse?: true
  /** 23.10.2026: Feld offen, weil Datenquellen sich widersprechen (bisher nur Strecke/Zone: Begegnungszone aus OSM gegen amtliches
   * Tempo ab 30 km/h); A2 bleibt dann offen statt nicht anwendbar */
  strittig?: true }
export type BedarfEingaben = { [K in FeldName]: Feld<Werte[K]> }

/** Art je Feld für die Prüfung beim Lesen (wie fall.ts: Ungültiges wird offen, mit Hinweis) */
type Art = 'bool' | 'zahl' | 'zahlen' | 'objekt' | readonly string[]
const BED: readonly Beduerfnis[] = ['schule', 'kindergarten', 'heim', 'haltestelle', 'schulweg', 'fusswegnetz']
export const FELDER: { readonly [K in FeldName]: Art } = {
  innerorts: 'bool', vSig: 'zahl', tempoRegime: ['strecke', 't30_zone', 'begegnungszone'],
  v85: 'zahl', v85Nachweis: 'bool', anzeichenSchneller: 'bool', dtv: 'zahl', fg5h: 'zahl', fgKlasse: ['<100', '100-500', '>500'],
  fgQuelle: ['zaehlung', 'schaetzung'], fgSehrHoch: 'bool', netz: ['basisnetz', 'publikumsintensiv', 'feinverteiler', 'keins'],
  netzQualifiziert: 'bool', beduerfnis: 'objekt', strassentyp: ['verkehrsorientiert', 'siedlungsorientiert'], starkBelastet: 'bool',
  nachfrage: ['punktuell', 'flaechig'], wunschlinieM: 'zahl',
  lage: ['strecke', 'knoten_berechtigt', 'knoten_belastet', 'einmuendung', 'kreisel'], knotenArmeOhneQuerung: 'zahl',
  knotenLsa: 'bool', fahrbahnB: 'zahl', zweirichtung: 'bool', nRichtung: 'zahlen', radstreifen: 'bool', busspur: 'bool',
  busDurchmarkiert: 'bool', alleZufahrtsstreifenBelastet: 'bool', tram: ['keins', 'eigentrassee', 'fahrbahn'],
  tramHaltestellenbereich: 'bool', balkenAufGleis: 'bool', insel: 'objekt', inselMoeglich: 'bool', durchfahrt: 'zahlen',
  haltestelle: 'objekt', abstandFgsM: 'zahl', abstandLsaM: 'zahl', verzweigung: 'bool', verzweigungErkennbar: 'bool',
  haltestelleAngrenzend: 'bool', fgsMitLsa: 'bool', neuanlage: 'bool', rueckversatzM: 'zahl', signal411: 'bool',
  signal411Insel: 'bool', beleuchtung: 'bool', schattenfrei: 'bool', hvl: 'objekt', hvlBedarfM: 'zahl',
  haltenSichtrelevantUeber5m: 'bool', haltenSonstVerboten: 'bool', reklameUnter20m: 'bool', reklameAusnahme: 'bool',
  annaeherungUeberfahrbar: 'bool', einAusfahrtNah: 'bool', blinklicht: ['keins', 'gelb_ssv', 'nicht_ssv'], fusswegAchse: 'objekt',
  streifenBreite: 'zahl', randAbstand: 'zahlen', achsWinkel: 'zahl', randabschluss: 'objekt', quergefaelle: 'zahl',
  absenkung: 'zahl', taktil: 'bool', leitlinie: 'bool', querungLang: 'bool', sichtVorh: 'zahlen', erkennungM: 'zahl',
  kurve: 'objekt', typ: QUERUNGSTYPEN, ohneBaulich: 'bool', querdistanzL: 'zahlen', laengsparkierung: 'bool',
  seitenraumVorParklinieM: 'zahl', absenkungBeidseits: 'bool', aufstellflaeche: 'bool', parkierungSichtbehindernd: 'bool',
  einengung: 'bool', mivKlasse: ['tief', 'mittel', 'hoch'], restbreiteM: 'zahl', einengungLaengeM: 'zahl', mzsBreiteM: 'zahl',
  mzsMitFgs: 'bool', lsaZeiten: 'objekt', q3: 'objekt', kantonsstrasse: 'bool', veloQuerung: 'bool',
}
export const FELDNAMEN = Object.keys(FELDER) as FeldName[]

/** Alle Felder offen */
export function leereEingaben(): BedarfEingaben {
  const e = {} as Record<FeldName, Feld<unknown>>
  for (const k of FELDNAMEN) e[k] = { wert: null, quelle: null }
  return e as BedarfEingaben
}

/** Feld mit Wert und Quelle (Vorgabe Hand) */
export const feld = <T>(wert: T | null, quelle: Quelle = 'hand'): Feld<T> => ({ wert, quelle: wert === null ? null : quelle })

/** Eingaben aus Werten bilden (fehlende Felder offen), alle mit derselben Quelle */
export function eingabenAus(werte: Partial<Werte>, quelle: Quelle = 'hand'): BedarfEingaben {
  const e = leereEingaben() as Record<FeldName, Feld<unknown>>
  for (const k of FELDNAMEN) if (werte[k] !== undefined) e[k] = feld(werte[k], quelle)
  return e as BedarfEingaben
}

const istObjekt = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const istZahl = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

function passt(art: Art, k: FeldName, x: unknown): boolean {
  if (art === 'bool') return typeof x === 'boolean'
  if (art === 'zahl') return istZahl(x)
  if (art === 'zahlen') return Array.isArray(x) && x.length > 0 && x.every(istZahl)
  if (art === 'objekt') return k === 'beduerfnis' ? Array.isArray(x) && x.every(b => (BED as readonly unknown[]).includes(b)) : istObjekt(x)
  return art.includes(x as string)
}

/**
 * Eingaben aus einer Fall-Datei lesen (E1): unbekannte Schlüssel übergangen, ungültige Felder offen, je mit Hinweis.
 * Objekte (insel, q3 …) werden nur als Objekt geprüft; ihre Unterfelder prüfen die Regeln (fehlt eines, meldet die Regel offen).
 */
export function eingabenLesen(roh: unknown): [BedarfEingaben, string[]] {
  const e = leereEingaben() as Record<FeldName, Feld<unknown>>
  const hinweise: string[] = []
  if (!istObjekt(roh)) return [e as BedarfEingaben, ['Bedarf-Eingaben ungültig (kein Objekt), alle offen']]
  for (const [k, v] of Object.entries(roh)) {
    if (!(k in FELDER)) { hinweise.push(`Bedarf-Feld «${k}» unbekannt, übergangen`); continue }
    const name = k as FeldName
    if (!istObjekt(v)) { hinweise.push(`Bedarf-Feld «${k}» ungültig, offen`); continue }
    if (v.wert === null || v.wert === undefined) continue
    const q = v.quelle
    if (!passt(FELDER[name], name, v.wert) || !(QUELLEN as readonly unknown[]).includes(q)) {
      hinweise.push(`Bedarf-Feld «${k}» ungültig, offen`); continue
    }
    e[name] = { wert: v.wert, quelle: q as Quelle }
  }
  return [e as BedarfEingaben, hinweise]
}
