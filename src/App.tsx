import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type L from 'leaflet'
import Karte, { AV_FARBEN, STATUS_FARBE, ERKENNUNG_UNGEPRUEFT, QUELLE_FARBE, PARK_FARBE, UEBERGANG_FARBE, LUFTBILD_FARBE, INSEL_FARBE, INSEL_TEXT, zufahrtKey,
  OHNE_VORTRITT_FARBE, TUE_RAND, FAHRZEUG_ZOOM,
  hindernisText, hindernisFarbe, FIXPUNKT_FARBE, PLAN_FARBEN, planMarke, NrMarke, type Werkzeug, type KartenHinweis, type Masslinie } from './Karte'
import { ladeAvRoh, ladeSosfRoh, avParsen, type AvFlaeche, type GeoJson } from './daten/av'
import { ladeLuftbild, ladeFlugjahr, luftbildLaden, LUFTBILD_QUELLE, LUFTBILD_NAME, type LuftbildRoh } from './daten/luftbild'
import { ladeOsmRoh, osmParsen, ladeUebergaenge, markierung, istFgs, overpassSperre, strassennamen, namenKarte, knotenLage, type OsmKnoten,
  type StrassenMitte, wegTags, strassenlampen, vortrittsZeichen, LAMPEN_RADIUS_M } from './daten/osm'
import { istAbbruch, type Abruf } from './daten/holen'
import { dateienImAusschnitt, ladeLuftbildFgs, kandidatenAnzeigen, herkunftAus, kandidatKnoten, osmMitLuftbildUebergang, ETH_MODELL_QUELLE, flugText,
  ETH_MODELL_URL, ETH_MODELL_CODE, herkunftText,
  type LuftbildFgsSnapshot, type LuftbildHerkunft, type LuftbildKandidat } from './daten/luftbildFgs'
import { AvVorschau } from './avVorschau'
import { baumQuelleFuer, type BaumQuelle, type KatasterBaum } from './daten/baumkataster'
import { parkQuelleFuer, istParkId, type ParkQuelle, type KatasterFeld } from './daten/parkkataster'
import { bernZustaendig, bernErgebnis, GEODATEN_BERN, GEOPORTAL_BERN, type BernLaden } from './daten/geoportal'
import { BERN_C_KEYS, BERN_DIENSTE_C, bernDienstName, bernDienstBericht, type BernDienstKey, type BernDatenC, type BernDienst } from './daten/bernDienste'
import { schulenStand } from './daten/schulen'
import { ladeHaltestellenBern, haltestellenStand, type BernHalte, type Bereich } from './daten/haltestellen'
import type { VsigLinie } from './daten/vsig'
import { ladeVerkehrsdatenBern, type VdLinie } from './daten/verkehrsdaten'
import type { GeoVorbelegung } from './bedarf/vorbelegung'
import { lv95, wgs, dist, sub, add, dot, links, einheit as einheitP, imPolygon, type P } from './geo'
import { type Box, type CacheEintrag, enthaelt, abfrageBox, zuGross, imCache, aufnehmen, vereinigen, vereinigenNamen } from './ausschnitt'
import type { ZufahrtErgebnis, StreifenErgebnis } from './rechner/typen'
import type { FallRechnung } from './rechner'
import { KATASTER_PARK_M } from './rechner/vorschlaege'
import { abzugTeile } from './rechner/fahrstreifen'
import { type Hindernis, BAUM_STAMM_M, LAENGS_BREITE_M } from './rechner/hindernisse'
import { linieKreis, RADIUS_HAND_M } from './rechner/spurhand'
import { ART, ENTFALLEN_ERKLAERUNG, ENTFALLEN_TITEL, entfallenGrund, sichtQuelleKurz, statusText, tempoHerkunft, f1, f2, mText, streifenStatus, TUE_OPTION,
  TUE_NUR_EINMUENDUNG, erkennungText, ERKENNUNG_TITEL } from './texte'
import { KnotensichtBlock } from './tue/KnotensichtBlock'
import { tueBreiteHand } from './tue/texte'
import type { Knotensicht } from './tue/knotensicht'
import { ladeNeigung } from './knotensicht/daten/hoehen'
import { kurveProfilLinie, kurveProfilSchluessel, strassenKurve } from './bedarf/kurvenregel'
import type { NeigungMessung } from './knotensicht/rechner/typen'
import { veloSoll } from './veloSicht'
import type { HoehenVorgabe } from './knotensicht/rechner/typen'
import Bericht from './Bericht'
import { Anleitung, BegriffeListe, Datenschutz, Fusszeile, QuellenTabelle, RechnungGrundlagen } from './Hilfe'
import { VerweisText } from './Verweise'
import { RegelUebersicht } from './RegelUebersicht'
import { streifenStreetView, zufahrtStreetView, zufahrtStreetViewTitel } from './streetview'
import { type Fall, type FallErgebnis, type StreifenHand, type Fixpunkt, type PlanArt, type FlaechePlan, type FurtSeite, PLAN_ARTEN, naechstePlanId, planRingPruefen,
  inselStandard, seitenraumStandard, type PlanSeitenraum,
  naechsteFixId, FIXPUNKT_NAME_MAX, STREIFEN_NAME_MAX, leererFall, fallLesen, fallSchreiben, fallMerken, fallErinnern, fallVergessen,
  ohneUebergang, eingabenSchluessel, ortMerkenEntscheid, zufahrtSchluessel, streifenHandTeilen, teilungZuruecknehmbar,
  teilungZuruecknehmen, type TeilungRueck, verschiebungZuruecknehmbar, verschiebungZuruecknehmen, type VerschiebungRueck, eingabenZahl, hatEingaben, naechsteHandId, streifenUebernehmen, eingabenVerwaist,
  streifenHerkunftText, rechnungsSchluessel, STREIFEN_QUERUNGEN, istTrottoirueberfahrt, type StreifenQuerung } from './fall'
import { augenNachVerschieben, tueMasse, type KsPhase } from './tue/karte'
import { LsaEinmuendung } from './tue/LsaEinmuendung'
import { handSetzen } from './bedarf/fallBedarf'
import { FARBE_HERAN, FARBE_WARTEND, FARBE_WARTEND_TROTTOIR, FARBE_VELO, VELO_SICHT_FARBE } from './fahrzeuge'
import { inFeldSchreiben, inMetern, istZahlenfeld, messKlick, messLaenge, messPunkt, messText, messWert, type Messung } from './messen'
import { AV_RADIUS_M, OSM_RADIUS_M, PARK_RADIUS_M, KATASTER_RADIUS_M, NACHLADEN_M, ORT_TOL_M, streifenMitte, streifenAbstand, planEntscheid,
  ortEntscheid, ortVerlegen, fallAmStreifen, nachladenText, nichtAbgedeckt, nichtAbgedecktText, ausserhalbText, planNeuText, abstandText,
  querungAusserhalb, querungWegText, querungVerschobenText, type OrtEntscheid, type Ausserhalb } from './abdeckung'
import { koordText, vorzeichenText, vermassungTabelle, fixpunktMasse, type Vermassung } from './rechner/vermassung'
import { streifenTitel, zufahrtNamen, zufahrtLang, zufahrtNr, zufahrtText, entfallenLang, entfallenNr, wegNamen, zufahrtHerkunft16, NUMMERN_TEXT, nachNr,
  type ZufahrtNamen } from './benennung'
import { planTitel, planFlaecheM2, planAlsAv, avMitPlan, PLAN_NAME, eckeRunden, eckeAmPunkt, eckeRadiusMax, echteEcken, eckeGrenze, eckeGrenzeText, RUNDEN_R_VORGABE, RUNDEN_R_BEREICH, ECK_GROSS_M } from './rechner/planflaechen'
import { mitTiteln } from './bedarf/regelname'
import { durchfahrtAnzeige } from './bedarf/durchfahrt'
import { inselGeometrie, inselLage, inselMasse, masseFehler, masseHinweise, streifenTeilen, standardText, inselFlaechen,
  fahrbahnMitte, teilLuecke, inselPruefen, zufahrtTeil, zugMitte, standardZiehbar, standardGruppen, inselVerschieben,
  standardGeometrie, furtQuert, naechsteGruppe, aufAchse, balkenAusUmriss, E1_TIEFE_M, E1_BREITE_M, E1_FURT_M, TEIL_ABSTAND_M,
  INSEL_BEREICH, INSEL_TIEFE_MIN_M, type InselLage } from './rechner/standardinsel'
import { Fahrbahn, Inseln } from './rechner/flaechen'
import { seitenraumLage, seitenraumMasse, kanteMessen, parkMessen, parkRinge, seitenraumKennung, seitenraumRing, seitenraumNeu, kanteLinie,
  seitenraumMitte, seitenraumAngepasst, srMasseFehler, naechsteSrGruppe, endeAnLinie, endenNachfuehren, srVerschieben, planStandardText,
  SR_UEBERSTAND_M, SR_PARK_TIEFE_M, SR_RAND_M, SR_RAND_MAX_M, SR_BEREICH, SR_NAME, SR_ERSETZT, type ParkRing, type SrMasse } from './rechner/seitenraum'
import { abstandPunkt, flaeche, schnitt } from './rechner/poly'
import { BedarfAbschnitt, kopfText } from './BedarfPanel'
import { BedarfTeaser, ReiterAnsicht } from './ReiterLeiste'
import { WERKZEUGE, BESTAND_WERKZEUGE, hilfeOrt, PlanenGruppe, StreifenPlanenOben, WerkzeugKnoepfe } from './Planen'
import { REITER_EREIGNIS, reiterAktiv, reiterKnopfId, reiterStand, reiterVorgabe, reiterZustand, teaserText, type Reiter } from './reiter'
import Trenner from './Trenner'
import { ladeBreite } from './panelbreite'
import { befundblaetter, type BefundBlatt } from './bedarf/befundblatt'
import { ebenenVorgabe, ebenenWirksam } from './bedarf/fallBedarf'
import { radstreifenAusRechnung } from './bedarf/vorbelegung'
import { OsmNetz, fahrbahnRichtung } from './rechner/netz'
import { fangen, fangRadiusM, FANG_PX, fixpunktVorschlaege, fixpunktName, fixMassTexte, naechsterStreifen, ART_TEXT, VORSCHLAG_M,
  type FixVorschlag } from './fixpunkt'

interface QuellenStand { name: string; objekte?: string; ms?: number; bytes?: number; server?: string; fehler?: string }
/** Geoportal Stadt Bern für die Vorbelegung des Bedarfsmoduls (Haltestellen, Verkehrsdaten); nr = Ladevorgang (wie ParkStand) */
/** V_sig-Linien für den Sichtrechner (Worker) */
type VsigRechnung = { linien: VsigLinie[]; bereich: Bereich }
interface BernGeo { nr: number; halte: BernHalte; vd: { laedt: true } | { linien: VdLinie[] } | { fehler: string }
  /** weitere Dienste (Automatik Paket C, daten/bernDienste.ts) */
  c: { [K in BernDienstKey]?: BernLaden<BernDatenC[K]> } }
const HALT_QUELLE = `${GEODATEN_BERN}, Haltestellen`, VD_QUELLE = `${GEODATEN_BERN}, Flächendeckende Verkehrsdaten`
interface ParkStand { quelle: ParkQuelle; nr: number; lat: number; lon: number; felder: KatasterFeld[] | null; laedt?: boolean; fehler?: string }
interface Daten { osm: unknown; av: GeoJson; sosf: GeoJson | null; nid: number | null; bfs: (number | null)[]; luftbild: LuftbildRoh | null; flugjahr: string
  ort: P }                                         // Ort in LV95 (Luftbild nachladen)

const START: [number, number] = [46.9420585, 7.4322619]      // Startansicht: Mühlemattstrasse, Bern
const WORKER_MS = 30000
/** Höhenprofile der Knotensicht (Trottoirüberfahrt) in den geladenen Quellen */
const TUE_STREIFEN_M = 4
const HOEHEN_NAME = 'Höhenmodell (swisstopo, swissALTI3D, Profile der Knotensicht)'
// Automatische Übergangssuche nach dem Verschieben bzw. Zoomen: ab SUCHE_ZOOM (rund 1:10 000; weiter draussen wird der
// Ausschnitt für eine Overpass-Abfrage zu gross; dazu Flächengrenze in ausschnitt.ts), SUCHE_PAUSE_MS nach dem letzten moveend,
// zwischen zwei Abfragen mindestens SUCHE_ABSTAND_MS (Overpass Fair Use: höchstens eine laufende Suche, keine Abfragen-Flut
// beim Herumschieben)
const SUCHE_ZOOM = 16
const SUCHE_PAUSE_MS = 800
const SUCHE_ABSTAND_MS = 2000
const SUCHE_NAME = 'OSM-Übergänge und Strassennamen im Ausschnitt'
const ZU_WEIT: KartenHinweis = { text: 'Zum Suchen näher heranzoomen' }
// Ausschnitte der Abrufe (AV_RADIUS_M, OSM_RADIUS_M, PARK_RADIUS_M, KATASTER_RADIUS_M) und die Abdeckung um einen Streifen von
// Hand (NACHLADEN_M): abdeckung.ts, dort die Herleitung
const STREIFEN_MIN_M = 1.0                      // Streifen von Hand: kürzeste Länge

/** Anzeige der AV-Arten in der Legende (Schlüssel wie in AV_FARBEN) */
const AV_NAME: Record<string, string> = { Strasse_Weg: 'Fahrbahn', Gebaeude: 'Gebäude' }

const MIN_PUNKTE: Record<Exclude<Werkzeug, null>, number> = { parkfeld: 3, flaeche: 3, insel: 3, laengs: 2, hecke: 2, mauer: 2, streifen: 2, tue: 2,
  spurB: 2, baum: 1, fixpunkt: 1, planflaeche: 3, eckeRunden: 1, mittelinsel: 1, seitenraum: 1, messen: 2 }
const WERKZEUG_NAME: Record<Exclude<Werkzeug, null>, string> = { parkfeld: 'Parkfeld', flaeche: 'übriges Hindernis (Fläche)', insel: 'Insel',
  laengs: 'Längsparkierung', hecke: 'Hecke', mauer: 'Mauer', streifen: 'Streifen planen', tue: 'Trottoirüberfahrt', spurB: 'Fahrlinie selbst zeichnen', baum: 'Baum',
  fixpunkt: 'Fixpunkt', planflaeche: 'Fläche (Plan)', eckeRunden: 'Ecke runden', mittelinsel: 'Mittelinsel (Standard)',
  seitenraum: 'Vorgezogener Seitenraum', messen: 'Messen' }
/** Textfeld, übernommen erst beim Verlassen bzw. mit Enter (Escape: zurück); leer = kein eigener Text */
function TextFeld({ wert, setze, platzhalter, titel, max = 80 }: { wert: string; setze: (x: string) => void; platzhalter?: string
  titel?: string; max?: number }) {
  const [text, setText] = useState(wert)
  useEffect(() => { setText(wert) }, [wert])
  const uebernehmen = () => { const t = text.trim().slice(0, max); if (t !== wert) setze(t); else setText(wert) }
  return <input type="text" className="textfeld" value={text} placeholder={platzhalter} title={titel} maxLength={max}
    onChange={e => setText(e.target.value)} onBlur={uebernehmen}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') setText(wert) }} />
}

// Streifen von Hand eben neu gezeichnet und zum Fall dazu (geaendert): Abdeckung aller Streifen prüfen, Bezug = der letzte
const NEU_GEZEICHNET = '+neu'

/** Zahlenfeld, das Minus und Komma beim Tippen zulässt; übernommen beim Verlassen bzw. mit Enter. Gültig: |x| < 20 bzw. im
 * Bereich [min, max]; sonst bleibt der bisherige Wert stehen */
function ZahlFeld({ wert, setze, titel, bereich }: { wert: number; setze: (x: number) => void; titel?: string; bereich?: [number, number] }) {
  const [text, setText] = useState(String(wert).replace('.', ','))
  useEffect(() => { setText(String(wert).replace('.', ',')) }, [wert])
  const uebernehmen = () => {
    const x = Number(text.trim().replace(',', '.').replace('−', '-'))
    if (Number.isFinite(x) && (bereich ? x >= bereich[0] && x <= bereich[1] : Math.abs(x) < 20)) setze(Math.round(x * 100) / 100)
    else setText(String(wert).replace('.', ','))
  }
  return <input type="text" inputMode="decimal" className="zahl" title={titel} value={text} onChange={e => setText(e.target.value)}
    onBlur={uebernehmen} onKeyDown={e => { if (e.key === 'Enter') uebernehmen() }} />
}

/** Masse eines vorgezogenen Seitenraums in der Liste «Flächen (Plan)» (änderbar, solange die Form nicht von Hand angepasst ist) */
function SeitenraumZeile({ fp, st, aendere, zurueck }: { fp: FlaechePlan; st: PlanSeitenraum; aendere: (id: string, x: Partial<SrMasse>) => void
  zurueck: (() => void) | null }) {
  // Seite A (s < 0) links bzw. rechts im Blick von der Bordkante in die Fahrbahn
  const aLinks = dot([-st.balken[0], -st.balken[1]], links(st.tief)) > 0
  const feld = (k: keyof SrMasse, name: string, bereich: [number, number]) => <label key={k}>{name} <ZahlFeld wert={st[k]} bereich={bereich}
    titel={`${name} in m (${bereich[0]} bis ${bereich[1]})`} setze={v => aendere(fp.id, { [k]: v })} /> m </label>
  return <div className="klein">{planStandardText(fp)}
    {seitenraumAngepasst(fp) ? ' – Masse nicht mehr änderbar; löschen und neu einfügen.' : <div>
      {feld('ueberstand', 'über die Parklinie', SR_BEREICH.ueberstand)}{feld('tiefePark', 'Parkstreifen', SR_BEREICH.tiefePark)}
      {feld('breite', 'Streifenbreite', SR_BEREICH.breite)}{feld(aLinks ? 'randA' : 'randB', 'Rand links', SR_BEREICH.rand)}
      {feld(aLinks ? 'randB' : 'randA', 'Rand rechts', SR_BEREICH.rand)}</div>}
    {zurueck && <button className="zweit klein" title="wie vor dem letzten Ziehen" onClick={zurueck}>Verschiebung zurücknehmen</button>}
  </div>
}

let zaehler = 0
// stabile leere Listen für die Karte (Prüfbefund 20.10.2026): ein neues [] je Render liess die Karten-Effekte bei jeder Mausbewegung
// im Zug der Mittelinsel alles neu zeichnen
const LEER_FIX: Fixpunkt[] = [], LEER_PLAN: FlaechePlan[] = [], LEER_HIND: Hindernis[] = [], LEER_HAND: StreifenHand[] = []
/** Zwei Ringe gleich (Koordinaten; Fall-Kopien haben neue Arrays) */
const gleicherRing = (a: P[], b: P[]) => a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1])
const neueId = (p: string) => `${p}-${Date.now().toString(36)}-${(zaehler++).toString(36)}`

/** Fixpunkt-Zeichen für die Legende (wie auf der Karte: Kreuz im Quadrat, Vorschlag blass) */
function FixLegende({ blass = false }: { blass?: boolean }) {
  return <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: 3, opacity: blass ? 0.45 : 1 }}>
    <rect x="1" y="1" width="12" height="12" fill="#ffffff" stroke={FIXPUNKT_FARBE} strokeWidth="1.5" />
    <path d="M3 3L11 11M11 3L3 11" stroke={FIXPUNKT_FARBE} strokeWidth="1.5" /></svg>
}

export default function App({ onStartseite }: { onStartseite?: () => void } = {}) {
  const kartenRef = useRef<L.Map | null>(null)
  // Breite des rechten Bereichs (Trenner, gespeichert in localStorage; CSS-Variable --panel-breite)
  const [panelBreite, setPanelBreite] = useState(() => ladeBreite(window.innerWidth))
  const trennerFertig = useCallback(() => { requestAnimationFrame(() => kartenRef.current?.invalidateSize()) }, [])
  const workerRef = useRef<Worker | null>(null)
  const abbruchRef = useRef<AbortController | null>(null)
  const auftrag = useRef(0)
  const [uebergaenge, setUebergaenge] = useState<OsmKnoten[]>([])
  const [gewaehlt, setGewaehlt] = useState<OsmKnoten | null>(null)
  // Streifen aus dem Luftbild (ETH-Modell), die in OSM fehlen (daten/luftbildFgs.ts): geladene Snapshots und die abgesuchten
  // Ausschnitte der Übergangssuche (nur dort ist der Abgleich mit OSM möglich)
  const [lbSnaps, setLbSnaps] = useState<LuftbildFgsSnapshot[]>([])
  const [suchBoxen, setSuchBoxen] = useState<Box[]>([])
  const [daten, setDaten] = useState<Daten | null>(null)
  const [av, setAv] = useState<AvFlaeche[] | null>(null)
  const [fall, setFall] = useState<Fall | null>(null)
  const [rechnung, setRechnung] = useState<FallRechnung | null>(null)
  const [rechnet, setRechnet] = useState(false)
  const [rechnungFall, setRechnungFall] = useState<Fall | null>(null)   // Fall, zu dem die angezeigte Rechnung gehört
  const [rechnungZeit, setRechnungZeit] = useState<Date | null>(null)
  const [bericht, setBericht] = useState(false)                          // Druckansicht (Bericht) offen
  const [meldung, setMeldung] = useState<string>('')
  // Hinweis zum Laden des Falls (Fall-Datei, Browser-Speicher); bleibt stehen, bis ein anderer Ort geladen wird
  const [ladeHinweis, setLadeHinweis] = useState<{ text: string; verwerfen: boolean } | null>(null)
  // Planung (16.10.2026): Inhalt der Eingaben, wie zuletzt als Datei gespeichert bzw. aus einer Datei geladen (fall.eingabenSchluessel;
  // ungesicherte Eingaben erkennen), offener Wechsel zu einem anderen Fall (wartet auf Bestätigung, weil der bisherige Fall ohne
  // OSM-Übergang sonst verloren gehen kann), Laden fehlgeschlagen
  const [gespeichert, setGespeichert] = useState<string | null>(null)
  // wechsel.gemerkt: der bisherige Fall steht im Eintrag «fgsCheck.fall.ort» (sonst liegt dort ein anderer, ortKonflikt)
  const [wechsel, setWechsel] = useState<{ text: string; knopf: string; ersetzt: boolean; gemerkt: boolean; weiter: () => void } | null>(null)
  const [ladeFehler, setLadeFehler] = useState(false)
  // Ort, um den zuletzt geladen wurde bzw. wird (LV95; Abdeckung neuer Streifen von Hand, auch während des Ladens)
  const ladeOrtRef = useRef<P | null>(null)
  // Streifen von Hand, dessen Enden bzw. Breite eben geändert wurden: nach der Änderung Abdeckung prüfen, ggf. um ihn neu laden
  const geaendert = useRef<string | null>(null)
  // Eintrag «fgsCheck.fall.ort», ein einziger für Fälle ohne Übergang (Nachprüfung 16.10.2026, S-b): ortEigen = er gehört dem
  // offenen Fall (von ihm geschrieben bzw. Ersetzen bestätigt); ortFreigabe = ein bestätigter Wechsel gibt den Eintrag des
  // bisherigen Falls dem nächsten frei; ortVergessen = Übergang, dessen Eintrag weg soll, sobald der Fall unter «ort» gemerkt
  // ist; ortKonflikt = dort liegt ein anderer Fall, Ersetzen wartet auf Bestätigung (bis dahin ist der offene Fall nicht gemerkt)
  const ortEigen = useRef(false)
  const ortFreigabe = useRef(false)
  const ortVergessen = useRef<number | null>(null)
  const [ortKonflikt, setOrtKonflikt] = useState<Fall | null>(null)
  // aktueller Ladehinweis für Effekte, die nach laden() (setzt ihn zurück) einen Hinweis anhängen
  const ladeHinweisRef = useRef(ladeHinweis)
  ladeHinweisRef.current = ladeHinweis
  const [auswahl, setAuswahl] = useState<string | null>(null)
  const [quellen, setQuellen] = useState<Record<string, QuellenStand>>({})
  const [werkzeug, setWerkzeug] = useState<Werkzeug>(null)
  // Trottoirüberfahrt: Alternative Fussgängerstreifen mit Fragen prüfen (nur in der Sitzung, nicht im Fall; 27.10.2026)
  const [alternative, setAlternative] = useState(false)
  // Knotensicht: gezeigte Phase (Klick auf ein wartendes Fahrzeug bzw. Wahl im Block; nur Sitzung, 27.10.2026)
  const [ksPhase, setKsPhase] = useState<KsPhase>('beide')
  // Vorschau der AV beim Planen ohne geladenen Ort (27.10.2026, avVorschau.ts): nur Anzeige und Fang, nicht im Fall
  const [, setVorschauNr] = useState(0)
  const vorschau = useRef<AvVorschau | null>(null)
  if (!vorschau.current) vorschau.current = new AvVorschau(() => setVorschauNr(x => x + 1))
  // Werkzeug «Messen» (27.10.2026): laufende Messung und das zuletzt angeklickte Zahlenfeld im Panel (nur Sitzung, nicht im Fall)
  const [messung, setMessung] = useState<Messung | null>(null)
  const zahlenfeld = useRef<HTMLInputElement | null>(null)
  const [zahlenfeldName, setZahlenfeldName] = useState<string | null>(null)
  useEffect(() => {
    const fokus = (e: FocusEvent) => {
      const el = e.target as Element | null
      if (!istZahlenfeld(el) || !el.closest('.panel')) return
      // nur Felder in Metern (27.10.2026): ein anderes Zahlenfeld hebt die Wahl auf
      if (!inMetern(el)) { zahlenfeld.current = null; setZahlenfeldName(null); return }
      zahlenfeld.current = el
      setZahlenfeldName(el.getAttribute('aria-label') ?? el.getAttribute('title')?.split(/[;,(]/)[0] ?? 'Zahlenfeld')
    }
    document.addEventListener('focusin', fokus)
    return () => document.removeEventListener('focusin', fokus)
  }, [])
  // Reiter im Panel (Sichtprüfung / Bedarf und Querungstyp, reiter.ts): Wahl im laufenden Fall, nur in der Sitzung; null = Vorgabe
  // nach dem Fall. Ein neuer Fall (Übergang, geplanter Streifen, Fall-Datei) beginnt wieder mit der Vorgabe
  const [reiterWahl, setReiterWahl] = useState<Reiter | null>(null)
  const reiterNeu = () => setReiterWahl(null)
  const reiterWaehlen = useCallback((r: Reiter) => setReiterWahl(r), [])
  // Gruppe Planen (Planen.tsx): Liste «Geplante Elemente» aufgeklappt (öffnet sich bei einem neuen Element bzw. beim Bearbeiten)
  const [geplantOffen, setGeplantOffen] = useState(false)
  const [zeichnung, setZeichnung] = useState<P[]>([])
  const [bearbeiten, setBearbeiten] = useState<string | null>(null)
  const [klasse, setKlasse] = useState<'auto' | 'velo'>('auto')
  const [planArt, setPlanArt] = useState<PlanArt>('trottoir')
  // «Ecke runden» (20.10.2026): Radius des Bogens; zuletzt gerundete Fläche (Ring davor und danach) zum Zurücknehmen
  const [rundenR, setRundenR] = useState(RUNDEN_R_VORGABE)
  // rundung: zuletzt gerundete Ecke (Index i im Ring vorher, Radius R); ändert der Nutzer danach den Radius, wird sie aus «vorher»
  // neu gerundet (solange die Fläche seither nicht anders geändert wurde). rundenFehler: Ablehnung, steht in der Werkzeughilfe bis
  // zur nächsten Aktion; rundenAngebot: Ecke, an der der eingestellte Radius nicht passt -> «mit höchstens x m runden»
  const [rundung, setRundung] = useState<{ id: string; i: number; R: number; vorher: P[]; nachher: P[]; text: string } | null>(null)
  const [rundenFehler, setRundenFehler] = useState<string | null>(null)
  // Radius beim Ziehen des Reglers (nur Vorschau auf der Karte, keine Rechnung); übernommen beim Loslassen (natives «change»)
  const [rundenZug, setRundenZug] = useState<number | null>(null)
  const reglerAlt = useRef<HTMLInputElement | null>(null)
  const reglerLos = useRef<(v: number) => void>(() => {})
  reglerLos.current = v => { setRundenZug(null); setRundenR(v) }
  const reglerChange = useCallback((e: Event) => reglerLos.current(Number((e.target as HTMLInputElement).value)), [])
  // React meldet mit onChange jede Bewegung (input); das native «change» kommt erst beim Loslassen (Maus, Finger) bzw. je Tastenschritt
  const reglerRef = useCallback((el: HTMLInputElement | null) => {
    reglerAlt.current?.removeEventListener('change', reglerChange)
    el?.addEventListener('change', reglerChange)
    reglerAlt.current = el
  }, [reglerChange])
  const [rundenAngebot, setRundenAngebot] = useState<{ id: string; i: number; rMax: number; ring: P[]; text: string } | null>(null)
  // «Mittelinsel (Standard)» (20.10.2026, rechner/standardinsel.ts): Masse (Vorgaben E1; kopf null = halbe Tiefe), Streifen von Hand
  // an der Insel teilen; inselOrt: gewählte Lage (streifen: Kennung des Streifens, auf dessen Achse die Insel liegt, sonst null)
  const [inselEin, setInselEin] = useState<{ tiefe: number; breite: number; furt: number; kopf: number | null; seite: FurtSeite;
    teilen: boolean }>({ tiefe: E1_TIEFE_M, breite: E1_BREITE_M, furt: E1_FURT_M, kopf: null, seite: 'links', teilen: true })
  const [inselOrt, setInselOrt] = useState<{ streifen: string | null; lage: InselLage; quelle: string } | null>(null)
  // letzte Teilung eines Streifens von Hand an einer Mittelinsel (Gruppe der Insel): «Teilung zurücknehmen», solange die Teilstreifen
  // seither nicht anders geändert wurden (fall.teilungZuruecknehmbar)
  const [teilung, setTeilung] = useState<(TeilungRueck & { gruppe: string }) | null>(null)
  // Mittelinsel am Griff ziehen (Drag-and-drop): laufender Zug (nur Vorschau, ohne Rechnung) und letzte Verschiebung zum
  // Zurücknehmen (mit der Teilung davor, deren Teilstreifen die Verschiebung nachführt)
  const [inselZug, setInselZug] = useState<{ gruppe: string; m: P; frei: boolean } | null>(null)
  // Schalter «frei verschieben» (auch für Touch): Umschalttaste schon beim Drücken startet in Leaflet den Box-Zoom statt des Ziehens
  const [inselFrei, setInselFrei] = useState(false)
  const [verschiebung, setVerschiebung] = useState<(VerschiebungRueck & { teilungVorher: (TeilungRueck & { gruppe: string }) | null }) | null>(null)
  const [breite, setBreite] = useState(LAENGS_BREITE_M)
  const [streifenBreite, setStreifenBreite] = useState(4)
  const [sichtbehindernd, setSichtbehindernd] = useState(true)
  const [spurFuer, setSpurFuer] = useState<string | null>(null)     // Zufahrt, für die eine Linie (Spur B) gezeichnet wird
  const [nurMarkiert, setNurMarkiert] = useState(false)
  // Baumkataster: lat/lon = Ladeort (wie die amtlichen Parkfelder; Ausschnitt deckt sich mit AV und Abdeckung, abdeckung.ts)
  const [kataster, setKataster] = useState<{ quelle: BaumQuelle; baeume: KatasterBaum[] | null; fehler?: string; lat: number; lon: number } | null>(null)
  // amtliche Parkfelder: nr = Nummer des Ladevorgangs (ladeNr), damit ein alter Abruf keine Felder in einen neuen Fall schreibt
  const ladeNr = useRef(0)
  const [parkKat, setParkKat] = useState<ParkStand | null>(null)
  const [bernGeo, setBernGeo] = useState<BernGeo | null>(null)
  const setzeQuelle = (k: string, s: QuellenStand) => setQuellen(q => ({ ...q, [k]: s }))
  // Eingabe der Rechnung: nur die geladenen Felder und die Quellenangabe. Der Ladezustand (laedt, fehler) löst keine Rechnung
  // aus; nach erfolgreichem Laden ändern sich felder (und im selben Schritt fall.quellen) -> genau eine neue Rechnung.
  const parkFelder = parkKat?.felder ?? null, parkAngabe = parkKat?.quelle.quellenangabe ?? ''
  const parkDaten = useMemo(() => (parkFelder ? { felder: parkFelder, quellenangabe: parkAngabe } : null), [parkFelder, parkAngabe])
  // Gewählter OSM-Übergang aus den geladenen OSM-Daten (Lage und Tags): der Ladeort ist nicht immer sein Knoten (Planung: Mitte
  // der Streifen von Hand, abdeckung.ts), eine Fall-Datei bringt nur den gespeicherten Ort mit
  const querungKnoten = useMemo(() => (daten && daten.nid !== null ? knotenLage(daten.osm, daten.nid) : null), [daten])
  const querungLage = useMemo(() => (querungKnoten ? lv95(querungKnoten.lat, querungKnoten.lon) : null), [querungKnoten])
  // Eingaben als Datei gesichert: Inhalt wie beim letzten Speichern bzw. Laden der Datei (nicht Objektgleichheit: Quellenangaben
  // und Markierung, die nach dem Laden eintreffen, ändern daran nichts). Ob der Download wirklich ankam (abgebrochen, Datei
  // gelöscht), kann die App nicht erkennen: «gesichert» heisst «Speichern ausgelöst».
  const gesichert = useMemo(() => !!fall && gespeichert !== null && eingabenSchluessel(fall) === gespeichert, [fall, gespeichert])
  // Fall ohne OSM-Übergang mit Eingaben, die nicht als Datei gesichert sind: Rückfrage beim Wechsel, Warnung beim Verlassen
  const ungesichert = !!fall && fall.ort.uebergang === null && hatEingaben(fall) && !gesichert

  // ---------------------------------------------------------------- Worker
  // aktiv: App angezeigt (false nach dem Wechsel zur Startseite); laufend: Abbruch der offenen Rechnungen (beim Verlassen)
  const aktiv = useRef(true)
  const laufend = useRef(new Set<() => void>())
  const neuerWorker = () => {
    workerRef.current?.terminate()
    workerRef.current = aktiv.current ? new Worker(new URL('./rechner/worker.ts', import.meta.url), { type: 'module' }) : null
    return workerRef.current
  }
  // Verlassen der Prüfung (Startseite): offene Rechnung beenden (keine Antwort wird mehr übernommen, ein später Timeout erzeugt
  // keinen neuen Worker), laufende Abrufe abbrechen
  useEffect(() => {
    aktiv.current = true
    neuerWorker()
    const offen = laufend.current
    return () => {
      aktiv.current = false
      auftrag.current++
      for (const f of [...offen]) f()
      abbruchRef.current?.abort()
      workerRef.current?.terminate(); workerRef.current = null
    }
  }, [])

  const rechnen = useCallback(async (d: Daten, f: Fall, kat: typeof kataster, pk: typeof parkDaten, vs: VsigRechnung | null,
    hs: Record<string, HoehenVorgabe> | null) => {
    const nr = ++auftrag.current
    const w = workerRef.current ?? neuerWorker()
    if (!w) return
    setRechnet(true)
    const antwort = await new Promise<{ ok: boolean; rechnung?: FallRechnung; fehler?: string }>(res => {
      const fertig = (x: { ok: boolean; rechnung?: FallRechnung; fehler?: string }) => {
        clearTimeout(t); w.removeEventListener('message', h); w.removeEventListener('error', fe); laufend.current.delete(abbrechen); res(x)
      }
      const abbrechen = () => fertig({ ok: false, fehler: 'abgebrochen' })
      laufend.current.add(abbrechen)
      const h = (ev: MessageEvent) => { if (ev.data.id === nr) fertig(ev.data) }
      const fe = (ev: ErrorEvent) => { neuerWorker(); fertig({ ok: false, fehler: `Worker-Fehler: ${ev.message || 'unbekannt'}` }) }
      const t = setTimeout(() => { neuerWorker(); fertig({ ok: false, fehler: `keine Antwort innert ${WORKER_MS / 1000} s` }) }, WORKER_MS)
      w.addEventListener('message', h)
      w.addEventListener('error', fe)
      w.postMessage({ id: nr, osm: d.osm, av: d.av, sosf: d.sosf, nid: d.nid, fall: f, luftbild: d.luftbild,
        kataster: kat && kat.baeume && f.baumkataster ? { baeume: kat.baeume, quellenangabe: kat.quelle.quellenangabe } : null,
        park: pk && f.parkkataster !== false ? pk : null, vsig: vs, avZentrum: d.ort, hoehen: hs })
    })
    if (nr !== auftrag.current) return
    setRechnet(false)
    if (!antwort.ok) { setMeldung(`Fehler in der Rechnung: ${antwort.fehler}`); return }
    setRechnung(antwort.rechnung!)
    setRechnungFall(f)
    setRechnungZeit(new Date())
    const mk = antwort.rechnung!.markierung
    if (mk) setFall(x => (x && x.ort.markierung !== mk ? { ...x, ort: { ...x.ort, markierung: mk } } : x))
    setMeldung(antwort.rechnung!.streifen.length ? '' : antwort.rechnung!.meldungen.join(' ') || 'Kein Streifen gebildet.')
  }, [])

  /** Fall im Browser merken; ohne Übergang gehört ihm danach der Eintrag «ort», der Eintrag eines verlassenen Übergangs geht weg */
  const merken = (f: Fall) => {
    fallMerken(f)
    if (f.ort.uebergang !== null) return
    ortEigen.current = true
    if (ortVergessen.current !== null) { fallVergessen(ortVergessen.current); ortVergessen.current = null }
  }
  /** Ein anderer Fall wird offen bzw. der Fall verliert seinen Übergang: der Eintrag «ort» gehört ihm (noch) nicht, ausser ein
   * bestätigter Wechsel hat den Eintrag des bisherigen Falls freigegeben; ein noch offenes ortVergessen gehörte zum bisherigen
   * Fall und verfällt (sonst entfernte ein späterer Fall den Eintrag eines inzwischen wieder bearbeiteten Übergangs) */
  const neuerFallImOrt = () => { ortEigen.current = ortFreigabe.current; ortFreigabe.current = false; ortVergessen.current = null }
  // nach jeder Änderung den Fall merken (ohne Eingaben: eigenen Eintrag entfernen; auch während des Ladens, z. B. nach «Eingaben
  // verwerfen»); einen anderen Fall im Eintrag «ort» erst nach Rückfrage ersetzen bzw. löschen (fall.ortMerkenEntscheid)
  useEffect(() => {
    if (!fall) return
    const gemerkt = fall.ort.uebergang === null && !ortEigen.current ? fallErinnern('ort') : null
    const e = ortMerkenEntscheid(fall, ortEigen.current, gemerkt)
    setOrtKonflikt(e === 'rueckfrage' ? gemerkt : null)
    if (e === 'merken') merken(fall)
  }, [fall])
  // Zuletzt bearbeiteter Fall ohne OSM-Übergang im Browser («fgsCheck.fall.ort»): zum Wiederherstellen anbieten, solange nicht er
  // bzw. ein anderer Fall ohne Übergang offen ist (der Eintrag ist dann der offene Fall selbst). Ein Fall ohne Übergang geht
  // sonst beim Wechsel zur Startseite, mit der Zurück-Taste, beim Neuladen bzw. Schliessen und beim Wechsel zu einem Übergang
  // aus der App verloren. Gelesen beim Rendern: fallMerken schreibt den Eintrag nur, solange ein Fall ohne Übergang offen ist.
  // Rückfragen: Logo und Wechsel über wechseln, Neuladen/Schliessen über beforeunload. Die Zurück-Taste (Anker #pruefen, Einstieg)
  // fragt nicht: hashchange bzw. popstate kommen erst nach dem Wechsel, abfangen liesse sie sich nur mit einem künstlichen
  // Verlaufseintrag, der die Taste sperrt (verwirrend, auch für Fälle ohne Eingaben); dort fängt dieser Eintrag den Fall auf, und
  // bevor ein anderer Fall ohne Übergang ihn ersetzt, fragt die App nach (ortKonflikt).
  const ortGemerkt = useMemo(() => (!fall || fall.ort.uebergang !== null ? fallErinnern('ort') : null), [fall])
  // Verlassen bzw. Neuladen der Seite mit ungesichertem Fall ohne Übergang: Rückfrage des Browsers (eigener Text nicht möglich)
  useEffect(() => {
    if (!ungesichert) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [ungesichert])
  // und neu rechnen (kurz entprellt); Eingaben zu Bedarf und Querungstyp ändern die Rechnung nicht (ausser «Insel nur markiert»):
  // gleicher Rechnungsschlüssel, gleicher Fall für die Rechnung (fall.rechnungsSchluessel)
  const rechenRef = useRef<{ k: string; f: Fall } | null>(null)
  const rechenFall = useMemo(() => {
    if (!fall) return null
    const k = rechnungsSchluessel(fall)
    if (rechenRef.current?.k !== k) rechenRef.current = { k, f: fall }
    return rechenRef.current.f
  }, [fall])
  // Tempo der Zufahrten in Bern aus V_sig (Geoportal Stadt Bern; Nutzerentscheid 21.10.2026): sobald die Linien geladen sind und der
  // Streifen auf einer AV-Fläche der Stadt Bern liegt (wie die übrige Vorbelegung), rechnet der Sichtrechner neu; OSM bleibt Rückfall
  const vsigStand = bernGeo && bernGeo.nr === ladeNr.current ? bernGeo.c.vsig : null
  const vsigBern = useMemo(() => bernZustaendig(rechnung?.streifen[0]?.m ?? daten?.ort, av ?? []), [rechnung, daten, av])
  const vsigRechnung = useMemo<VsigRechnung | null>(() => (daten && vsigBern && vsigStand && 'daten' in vsigStand
    ? { linien: vsigStand.daten.linien, bereich: { mitte: daten.ort, radiusM: BERN_DIENSTE_C.vsig.radiusM ?? PARK_RADIUS_M, form: 'quadrat' } }
    : null), [daten, vsigBern, vsigStand])
  // Trottoirüberfahrt (K3): Längsneigung der Knotensicht aus dem Höhenmodell (swisstopo, swissALTI3D), je «Knoten|Zufahrt»; nach dem
  // Eintreffen rechnet der Worker die Knotensicht neu (Effekt «Längsneigung der Knotensicht» unten)
  const [ksHoehen, setKsHoehen] = useState<{ nr: number; werte: Record<string, HoehenVorgabe> } | null>(null)
  const hoehenWerte = ksHoehen && ksHoehen.nr === ladeNr.current ? ksHoehen.werte : null
  useEffect(() => {
    if (!daten || !rechenFall) return
    const t = setTimeout(() => rechnen(daten, rechenFall, kataster, parkDaten, vsigRechnung, hoehenWerte), 200)
    return () => clearTimeout(t)
  }, [daten, rechenFall, kataster, parkDaten, vsigRechnung, hoehenWerte, rechnen])
  // Nach einer Rechnung mit Knotensicht: Profile entlang der Fahrstreifenachsen, der Zufahrt und der Gehlinie (höchstens vier je
  // Knoten und Zufahrt, nur einmal je Ladevorgang); ein Fehler des Dienstes gibt 0 % mit Hinweis (daten/hoehen der Kopie)
  const hoehenLaeuft = useRef(new Set<string>())
  useEffect(() => {
    const ctrl = abbruchRef.current, nr = ladeNr.current
    if (!rechnung || !ctrl || ctrl.signal.aborted) return
    const offen = rechnung.streifen.map(s => s.knotensicht).filter((k): k is Knotensicht => !!k && !('fehler' in k))
      .filter(k => !hoehenWerte?.[k.hoehenSchluessel] && !hoehenLaeuft.current.has(`${nr}|${k.hoehenSchluessel}`))
    for (const k of offen) {
      const lauf = `${nr}|${k.hoehenSchluessel}`
      hoehenLaeuft.current.add(lauf)
      const linien = (Object.entries(k.profile) as [keyof HoehenVorgabe, P[]][]).filter(([, l]) => l.length >= 2)
      setzeQuelle('hoehen', { name: HOEHEN_NAME })
      Promise.all(linien.map(([n, l]) => ladeNeigung(l, ctrl.signal).then(r => [n, r] as const))).then(res => {
        if (ctrl.signal.aborted || ladeNr.current !== nr) return
        const stand: HoehenVorgabe = Object.fromEntries(res.map(([n, [m]]) => [n, m]))
        setKsHoehen(h => ({ nr, werte: { ...(h && h.nr === nr ? h.werte : {}), [k.hoehenSchluessel]: stand } }))
        const fehler = res.filter(([, [, a]]) => typeof a === 'string')
        const ok = res.map(([, [, a]]) => a).filter((a): a is Exclude<typeof a, string> => typeof a !== 'string')
        setzeQuelle('hoehen', { name: HOEHEN_NAME, objekte: `${res.length} Profile`, ...(ok.length ? { ms: Math.max(...ok.map(a => a.ms)),
          bytes: ok.reduce((x, a) => x + a.bytes, 0), server: ok[0].quelle } : {}),
          ...(fehler.length ? { fehler: `${fehler.length} Profil(e) nicht verfügbar (0 % angenommen)` } : {}) })
      }, err => {
        if (ctrl.signal.aborted || istAbbruch(err)) return
        setzeQuelle('hoehen', { name: HOEHEN_NAME, fehler: `${(err as Error).message} (0 % angenommen)` })
      })
    }
  }, [rechnung, hoehenWerte])

  // Längsneigung entlang der Fahrlinie (29.10.2026), 50 m vor dem Streifen, aus demselben Höhenprofil-Dienst wie die Knotensicht:
  // für die Kurvenregel (Zufahrt mit der Strassenkurve) und die Sicht vom Velo (Zufahrten mit Radstreifen bzw. Radweg); einmal je
  // Ladevorgang und Zufahrt. Fehlt das Profil (lädt, Fehler), gelten 0 % bzw. die Frage bleibt offen
  const [kurveNeigung, setKurveNeigung] = useState<{ nr: number; werte: Record<string, NeigungMessung> } | null>(null)
  const kurveLaeuft = useRef(new Set<string>())
  useEffect(() => {
    const ctrl = abbruchRef.current, nr = ladeNr.current
    if (!rechnung || !ctrl || ctrl.signal.aborted) return
    const kz = strassenKurve(rechnung.streifen)?.z
    const zs = [...(kz ? [kz] : []), ...rechnung.streifen.flatMap(s => s.zufahrten.filter(z => z.velo))]
    for (const z of zs) {
      const key = kurveProfilSchluessel(z), lauf = `${nr}|${key}`
      const linie = kurveProfilLinie(z)
      if (linie.length < 2 || kurveLaeuft.current.has(lauf)) continue
      kurveLaeuft.current.add(lauf)
      setzeQuelle('hoehen', { name: HOEHEN_NAME })
      ladeNeigung(linie, ctrl.signal).then(([m, a]) => {
        if (ctrl.signal.aborted || ladeNr.current !== nr) return
        setKurveNeigung(h => ({ nr, werte: { ...(h && h.nr === nr ? h.werte : {}), [key]: m } }))
        setzeQuelle('hoehen', typeof a === 'string' ? { name: HOEHEN_NAME, fehler: `${a} (Längsneigung der Fahrlinie: 0 % bzw. offen)` }
          : { name: HOEHEN_NAME, objekte: 'Profil der Fahrlinie', ms: a.ms, bytes: a.bytes, server: a.quelle })
      }, err => {
        if (ctrl.signal.aborted || istAbbruch(err)) return
        setzeQuelle('hoehen', { name: HOEHEN_NAME, fehler: `${(err as Error).message} (Längsneigung der Fahrlinie: 0 % bzw. offen)` })
      })
    }
  }, [rechnung])

  const aendern = useCallback((f: (x: Fall) => Fall) => setFall(x => (x ? f(structuredClone(x)) : x)), [])

  // ---------------------------------------------------------------- Übergangssuche (automatisch)
  // Eigene Abbruch-Steuerung (suche.ctrl), getrennt von abbruchRef: Suche und Laden eines Übergangs brechen einander nicht ab.
  // Die Suche ändert nur die Liste der Übergänge (gewählter Übergang, Fall, Rechnung und Zeichnung bleiben).
  // Eine laufende Suche läuft zu Ende (abgebrochen wird sie nur beim Verlassen der Prüfung); wird inzwischen ein Ausschnitt
  // gewünscht, den sie nicht deckt (nachher), fragt die App danach nur den dann gezeigten Ausschnitt ab, falls er noch nicht
  // abgesucht ist. Nach 429 gilt die Sperre aus daten/osm.ts (overpassSperre) auch für die nächste automatische Suche.
  const suche = useRef<{ ctrl: AbortController | null; box: Box | null; timer: number; start: number; nachher: boolean;
    cache: CacheEintrag<OsmKnoten, StrassenMitte>[] }>({ ctrl: null, box: null, timer: 0, start: -Infinity, nachher: false, cache: [] })
  // Strassennamen (Wegmitten) aus derselben Abfrage, Vereinigung der Ausschnitte im Cache (gleiche Verdrängung wie die Übergänge)
  const [namenAusschnitt, setNamenAusschnitt] = useState<StrassenMitte[]>([])
  const [suchHinweis, setSuchHinweis] = useState<KartenHinweis | null>(null)
  /** sichtbarer Ausschnitt, null wenn zu weit herausgezoomt bzw. zu gross für eine Abfrage */
  const sichtBox = (map: L.Map): Box | null => {
    if (map.getZoom() < SUCHE_ZOOM) return null
    const b = map.getBounds()
    const sicht: Box = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }
    return zuGross(sicht) ? null : sicht
  }
  // Hinweis nach einer Suche; ist inzwischen weiter herausgezoomt, bleibt «näher heranzoomen» stehen
  const suchHinweisNach = (h: KartenHinweis | null) =>
    setSuchHinweis(kartenRef.current && !sichtBox(kartenRef.current) ? ZU_WEIT : h)
  const gesperrtHinweis = (ms: number): KartenHinweis =>
    ({ text: `Overpass ausgelastet: nächste Übergangssuche in rund ${Math.ceil(ms / 1000)} s` })

  // Snapshot der Stadt im Ausschnitt (statische Datei der eigenen Seite), mit der Übergangssuche ab SUCHE_ZOOM, je Datei einmal
  const lbLaedt = useRef(new Set<string>())
  const luftbildFgsLaden = useCallback((b: Box) => {
    for (const datei of dateienImAusschnitt(b)) {
      if (lbLaedt.current.has(datei)) continue
      lbLaedt.current.add(datei)
      ladeLuftbildFgs(datei).then(sn => setLbSnaps(l => (l.some(x => x.datei === sn.datei) ? l : [...l, sn])),
        () => { lbLaedt.current.delete(datei) })
    }
  }, [])

  const suchen = useCallback(async () => {
    const map = kartenRef.current, st = suche.current
    clearTimeout(st.timer)
    if (!map) return
    const sicht = sichtBox(map)
    if (!sicht) { setSuchHinweis(ZU_WEIT); return }
    luftbildFgsLaden(sicht)
    // schon abgesucht bzw. die laufende Suche deckt den Ausschnitt: nichts abfragen
    const treffer = imCache(st.cache, sicht)
    if (treffer) {
      st.cache = treffer
      if (!st.ctrl) setSuchHinweis(null)
      return
    }
    if (st.ctrl) {
      // laufende Suche nicht abbrechen; deckt sie den Ausschnitt nicht, danach den dann gezeigten abfragen
      if (!(st.box && enthaelt(st.box, sicht))) st.nachher = true
      return
    }
    // Sperre nach 429 (Retry-After): Suche erst danach, mit Hinweis
    const gesperrt = overpassSperre()
    if (gesperrt > 0) {
      setSuchHinweis(gesperrtHinweis(gesperrt))
      st.timer = window.setTimeout(suchen, gesperrt + 100)
      return
    }
    const warten = st.start + SUCHE_ABSTAND_MS - performance.now()
    if (warten > 0) { st.timer = window.setTimeout(suchen, warten); return }
    const ctrl = new AbortController(), box = abfrageBox(sicht)
    Object.assign(st, { ctrl, box, start: performance.now(), nachher: false })
    setSuchHinweis({ text: 'Übergänge werden gesucht …' })
    try {
      const r = await ladeUebergaenge(box.s, box.w, box.n, box.e, ctrl.signal)
      if (ctrl.signal.aborted) return
      st.cache = aufnehmen(st.cache, { box, daten: r.daten, namen: r.namen })
      const alle = vereinigen(st.cache)
      setUebergaenge(alle)
      setSuchBoxen(st.cache.map(c => c.box))
      setNamenAusschnitt(vereinigenNamen(st.cache))
      setzeQuelle('suche', { name: SUCHE_NAME, objekte: `${r.daten.length} Übergänge und ${r.namen.length} benannte Strassenstücke im ` +
        `Ausschnitt, ${alle.length} Übergänge angezeigt (letzte ${st.cache.length} Ausschnitte)`, ms: r.ms, bytes: r.bytes, server: r.quelle })
      suchHinweisNach(r.daten.length ? null : { text: 'Keine OSM-Übergänge im Ausschnitt' })
    } catch (e) {
      if (ctrl.signal.aborted || istAbbruch(e)) return
      setzeQuelle('suche', { name: SUCHE_NAME, fehler: (e as Error).message })
      const gesperrt = overpassSperre()
      if (gesperrt > 0) {
        // nach 429: Hinweis mit Wartezeit, danach selbst neu versuchen
        suchHinweisNach(gesperrtHinweis(gesperrt))
        st.nachher = false
        st.timer = window.setTimeout(suchen, gesperrt + 100)
      } else {
        suchHinweisNach({ text: `Suche fehlgeschlagen: ${(e as Error).message}`, fehler: true, erneut: () => suchen() })
      }
    } finally {
      if (st.ctrl === ctrl) { st.ctrl = null; st.box = null }
      // inzwischen verschoben: den jetzt gezeigten Ausschnitt abfragen (suchen prüft Cache, Sperre und Abstand)
      if (st.nachher && !ctrl.signal.aborted) { st.nachher = false; suchen() }
    }
  }, [luftbildFgsLaden])
  /** nach jedem Verschieben bzw. Zoomen: Hinweis sofort, Suche nach einer Pause */
  const ausschnitt = useCallback(() => {
    const map = kartenRef.current, st = suche.current
    if (!map) return
    if (planOhneOrtRef.current) { window.clearTimeout(vorschauTimer.current); vorschauTimer.current = window.setTimeout(vorschauPruefen, 400) }
    clearTimeout(st.timer)
    if (!sichtBox(map)) { setSuchHinweis(ZU_WEIT); return }
    setSuchHinweis(h => (h?.text === ZU_WEIT.text ? null : h))
    st.timer = window.setTimeout(suchen, SUCHE_PAUSE_MS)
  }, [suchen])
  // erste Suche beim Start; beim Verlassen laufende Suche abbrechen
  useEffect(() => {
    const st = suche.current
    const t = setTimeout(suchen, 300)
    return () => { clearTimeout(t); clearTimeout(st.timer); st.ctrl?.abort(); st.ctrl = null; st.box = null; st.nachher = false }
  }, [suchen])

  // ---------------------------------------------------------------- Laden
  /** Daten um einen Ort laden (Übergang oder Ort aus der Fall-Datei); fallNeu: mitgebrachte Eingaben */
  const laden = useCallback(async (lat: number, lon: number, nid: number | null, fallNeu: Fall | null, avVorab: Abruf<GeoJson> | null = null,
    herkunft: LuftbildHerkunft | null = null) => {
    abbruchRef.current?.abort()
    const ctrl = new AbortController()
    abbruchRef.current = ctrl
    auftrag.current++
    setRechnung(null); setAuswahl(null); setAv(null); setDaten(null); setWerkzeug(null); setZeichnung([]); setBearbeiten(null)
    setAlternative(false); setKsPhase('beide'); setKataster(null); setParkKat(null); setBernGeo(null); setWechsel(null); setLadeFehler(false)
    const nr = ++ladeNr.current
    const erinnert = !fallNeu && nid !== null ? fallErinnern(nid) : null
    // Fall aus dem Browser, dessen Streifen von Hand nur um den gespeicherten Ort abgedeckt sind (Ort nach dem Verschieben an die
    // Streifenmitte gelegt, OSM-Übergang höchstens QUERUNG_M daneben, abdeckung.ts): dort laden statt am Übergangsknoten
    if (erinnert?.streifenHand.length && nichtAbgedeckt(erinnert.streifenHand, lv95(lat, lon)).length &&
      !nichtAbgedeckt(erinnert.streifenHand, lv95(erinnert.ort.lat, erinnert.ort.lon)).length) ({ lat, lon } = erinnert.ort)
    const start = fallNeu ?? erinnert ?? leererFall(lat, lon, nid)
    // Übergang aus dem Luftbild (negative Kennung): Herkunft aus der Wahl bzw. aus dem Fall (Datei, Browser); ohne sie findet die
    // Rechnung den Übergang nicht (Meldung «nicht in den OSM-Daten»)
    const lbHerkunft = nid !== null && nid < 0 ? herkunft ?? start.ort.herkunft ?? null : null
    setFall(lbHerkunft && !start.ort.herkunft ? { ...start, ort: { ...start.ort, herkunft: lbHerkunft } } : start)
    setLadeHinweis(erinnert && eingabenZahl(erinnert) ? { text: `Eingaben zu diesem Übergang aus dem Browser übernommen ` +
      `(${eingabenZahl(erinnert)} Einträge, Stand ${erinnert.gespeichert?.slice(0, 10) ?? 'unbekannt'}).`, verwerfen: true } : null)
    setMeldung('AV und OSM werden geladen …')
    const [e, n] = lv95(lat, lon)
    ladeOrtRef.current = [e, n]
    const AV_NAME = `Amtliche Vermessung (WFS, ±${AV_RADIUS_M} m)`, OSM_NAME = `OpenStreetMap (Overpass, ${OSM_RADIUS_M} m)`
    setQuellen(q => ({ suche: q.suche, av: { name: AV_NAME }, osm: { name: OSM_NAME } }))
    const quelleFehler = (key: string, name: string) => (err: unknown) => {
      if (!istAbbruch(err)) setzeQuelle(key, { name, fehler: (err as Error).message })
      throw err
    }
    try {
      const [ra, ro, rs] = await Promise.all([
        // Vorschau der AV am selben Ort (Planen ohne Ort): keine zweite Abfrage
        (avVorab ? Promise.resolve(avVorab) : ladeAvRoh(e, n, AV_RADIUS_M, ctrl.signal)).then(r => { setzeQuelle('av', { name: AV_NAME,
          objekte: `${r.daten.features?.length ?? 0} Flächen`, ms: r.ms, bytes: r.bytes, server: r.quelle }); return r }, quelleFehler('av', AV_NAME)),
        ladeOsmRoh(lat, lon, OSM_RADIUS_M, ctrl.signal).then(r => { setzeQuelle('osm', { name: OSM_NAME, ms: r.ms, bytes: r.bytes,
          server: r.quelle }); return r }, quelleFehler('osm', OSM_NAME)),
        ladeSosfRoh(e, n, AV_RADIUS_M, ctrl.signal).then(r => r, err => {
          if (!istAbbruch(err)) setzeQuelle('sosf', { name: 'AV-Einzelobjekte (Brücken)', fehler: (err as Error).message })
          return null
        }),
      ])
      if (ctrl.signal.aborted) return
      const avF = avParsen(ra.daten)
      setAv(avF)
      if (!avF.length) {
        setMeldung('Keine AV-Daten an diesem Ort: Kanton bzw. Gemeinde ohne freie AV über geodienste.ch (JU, LU, NE, NW, OW, VD ' +
          'nur mit Freigabe; im Wallis fehlen einzelne Gemeinden, z. B. Sitten, Brig) bzw. ausserhalb der Schweiz. Rechnung nicht möglich.')
        return
      }
      const bfs = [...new Set(avF.map(f => f.bfs))]
      const bq = baumQuelleFuer(bfs)
      if (bq) setKataster({ quelle: bq, baeume: null, lat, lon })
      const pq = parkQuelleFuer(bfs)
      if (pq) setParkKat({ quelle: pq, nr, lat, lon, felder: null })
      // Berner Dienste nur, wenn die AV-Fläche am Ladeort in der Stadt Bern liegt (Korrektur M4; nicht jede Gemeinde im Ausschnitt)
      const bernHier = bernZustaendig([e, n], avF)
      if (bernHier) setBernGeo({ nr, halte: { laedt: true }, vd: { laedt: true }, c: Object.fromEntries(BERN_C_KEYS.map(k => [k, { laedt: true }])) })
      setMeldung('Rechnung läuft …')
      // das Luftbild zieht der Effekt «Luftbild nachladen» nach (nur am OSM-Übergang und wenn die Suche nicht abgeschaltet ist)
      // Übergang aus dem Luftbild: als Knoten (mit Fussweg für die Richtung) in die OSM-Antwort, dann rechnet alles wie an einem OSM-Übergang
      const osmRoh = lbHerkunft && nid !== null ? osmMitLuftbildUebergang(ro.daten, nid, lbHerkunft) : ro.daten
      setDaten({ osm: osmRoh, av: ra.daten, sosf: rs ? rs.daten : null, nid, bfs, luftbild: null, flugjahr: '', ort: [e, n] })
      setFall(f => f ? { ...f, quellen: { osm: ro.quelle, av: `${ra.quelle}, Kanton ${[...new Set(avF.map(x => x.kanton))].join(', ')}`,
        geladen: new Date().toISOString().slice(0, 10) } } : f)
      // Bedarfsmodul (Vorbelegung): Haltestellen und Verkehrsdaten aus dem Geoportal der Stadt Bern, nicht blockierend (ohne sie
      // bleiben die Felder offen bzw. die Haltestellen kommen aus OSM)
      if (bernHier) {
        const hier = () => ladeNr.current === nr && !ctrl.signal.aborted
        const HN = `Haltestellen Stadt Bern (${GEOPORTAL_BERN}, ±${PARK_RADIUS_M} m)`, VN = `Verkehrsdaten Stadt Bern (${GEOPORTAL_BERN}, ±${PARK_RADIUS_M} m)`
        setzeQuelle('haltestellen', { name: HN }); setzeQuelle('verkehrsdaten', { name: VN })
        ladeHaltestellenBern(lat, lon, PARK_RADIUS_M, ctrl.signal).then(r => {
          if (!hier()) return
          setBernGeo(g => (g && g.nr === nr ? { ...g, halte: { halte: r.daten } } : g))
          setzeQuelle('haltestellen', { name: HN, objekte: `${r.daten.length} Haltekanten`, ms: r.ms, bytes: r.bytes, server: r.quelle })
          setFall(f => (f ? { ...f, quellen: { ...f.quellen, haltestellen: HALT_QUELLE } } : f))
        }, err => {
          if (istAbbruch(err) || !hier()) return
          setBernGeo(g => (g && g.nr === nr ? { ...g, halte: { fehler: (err as Error).message } } : g))
          setzeQuelle('haltestellen', { name: HN, fehler: `${(err as Error).message} (Haltestellen aus OSM)` })
        })
        ladeVerkehrsdatenBern(lat, lon, PARK_RADIUS_M, ctrl.signal).then(r => {
          if (!hier()) return
          setBernGeo(g => (g && g.nr === nr ? { ...g, vd: { linien: r.daten } } : g))
          setzeQuelle('verkehrsdaten', { name: VN, objekte: `${r.daten.length} Strassenabschnitte`, ms: r.ms, bytes: r.bytes, server: r.quelle })
          setFall(f => (f ? { ...f, quellen: { ...f.quellen, verkehrsdaten: VD_QUELLE } } : f))
        }, err => {
          if (istAbbruch(err) || !hier()) return
          setBernGeo(g => (g && g.nr === nr ? { ...g, vd: { fehler: (err as Error).message } } : g))
          setzeQuelle('verkehrsdaten', { name: VN, fehler: `${(err as Error).message} (DTV bleibt offen)` })
        })
        // weitere Dienste (Automatik Paket C): je Dienst getrennt, Fehler nur in «Geladene Quellen»
        const dienstLaden = <K extends BernDienstKey>(k: K) => {
          const d: BernDienst<BernDatenC[K]> = BERN_DIENSTE_C[k]
          const rad = d.radiusM ?? PARK_RADIUS_M
          const name = bernDienstName(k, rad)
          setzeQuelle(k, { name })
          d.laden(lat, lon, rad, ctrl.signal).then(r => {
            if (!hier()) return
            const stand: BernLaden<BernDatenC[K]> = { daten: r.daten, ...(r.hinweis ? { hinweis: r.hinweis } : {}) }
            setBernGeo(g => (g && g.nr === nr ? { ...g, c: { ...g.c, [k]: stand } } : g))
            setzeQuelle(k, { name, objekte: d.objekte(r.daten) + (r.hinweis ? ` (${r.hinweis})` : ''), ms: r.ms, bytes: r.bytes,
              server: r.quelle })
            setFall(f => (f ? { ...f, quellen: { ...f.quellen, [k]: d.quelle } } : f))
          }, err => {
            if (istAbbruch(err) || !hier()) return
            setBernGeo(g => (g && g.nr === nr ? { ...g, c: { ...g.c, [k]: { fehler: (err as Error).message } } } : g))
            setzeQuelle(k, { name, fehler: `${(err as Error).message} (${d.ohne})` })
          })
        }
        for (const k of BERN_C_KEYS) dienstLaden(k)
      }
    } catch (err) {
      if (ctrl.signal.aborted || istAbbruch(err)) return
      setMeldung(`Laden fehlgeschlagen: ${(err as Error).message} (Details unter «Geladene Quellen»)`)
      setLadeFehler(true)
    }
  }, [])

  /** Zu einem anderen Fall bzw. zur Startseite wechseln (Übergang, Fall-Datei, neuer Streifen weit weg, Logo): hat der bisherige
   * Fall keinen OSM-Übergang und Eingaben, die nicht als Datei gesichert sind, erst nach Bestätigung (mit Übergang merkt ihn der
   * Browser je Übergang; ohne nur als letzten Fall ohne Übergang, ersetzt: das Ziel ist selbst ein Fall ohne Übergang und
   * nimmt dessen Eintrag «ort»). Hinweis mit zweitem Klick statt window.confirm: so lässt sich der Fall vorher noch speichern.
   * Ohne Rückfrage gibt ein als Datei gesicherter Fall ohne Übergang seinen Eintrag frei (sein Inhalt liegt in der Datei). */
  const wechseln = (text: string, knopf: string, weiter: () => void, ersetzt = false) => {
    if (ungesichert) { setWechsel({ text, knopf, ersetzt, gemerkt: ortEigen.current, weiter }); return }
    if (ersetzt && ortEigen.current && fall?.ort.uebergang === null && gesichert) ortFreigabe.current = true
    setWechsel(null); weiter()
  }

  const pruefen = (k: OsmKnoten) => {
    if (werkzeug) { setMeldung('Zeichnen läuft: zuerst «Fertig» oder «Abbrechen», dann einen anderen Übergang wählen.'); return }
    wechseln(`Übergang ${k.id} prüfen: der bisherige Fall wird ersetzt.`, 'Übergang laden', () => {
      setGewaehlt(k); setGespeichert(null); neuerFallImOrt(); reiterNeu()
      laden(k.lat, k.lon, k.id, null)
    })
  }

  /** Streifen aus dem Luftbild (ETH-Modell) prüfen: synthetischer Übergang am Kandidaten, sonst wie ein OSM-Übergang */
  const pruefenLuftbild = (k: LuftbildKandidat) => {
    if (werkzeug) { setMeldung('Zeichnen läuft: zuerst «Fertig» oder «Abbrechen», dann einen anderen Übergang wählen.'); return }
    wechseln('Übergang aus dem Luftbild prüfen: der bisherige Fall wird ersetzt.', 'Übergang laden', () => {
      const h = herkunftAus(k), kn = kandidatKnoten(k.id, h)
      setGewaehlt(kn); setGespeichert(null); neuerFallImOrt(); reiterNeu()
      laden(kn.lat, kn.lon, k.id, null, null, h)
    })
  }

  // Baumkataster auf Wunsch laden (um den Ladeort)
  useEffect(() => {
    if (!fall?.baumkataster || !kataster || kataster.baeume || kataster.fehler) return
    const ctrl = abbruchRef.current
    kataster.quelle.laden(kataster.lat, kataster.lon, KATASTER_RADIUS_M, ctrl?.signal).then(r => {
      setKataster(k => k ? { ...k, baeume: r.daten } : k)
      setzeQuelle('kataster', { name: kataster.quelle.name, objekte: `${r.daten.length} Bäume`, ms: r.ms, bytes: r.bytes, server: r.quelle })
      setFall(f => f ? { ...f, quellen: { ...f.quellen, baumkataster: kataster.quelle.quellenangabe } } : f)
    }, err => {
      if (istAbbruch(err)) return
      setKataster(k => k ? { ...k, fehler: (err as Error).message } : k)
      setzeQuelle('kataster', { name: kataster.quelle.name, fehler: `${(err as Error).message} (Dienst bzw. Zugriff aus dem Browser gesperrt?)` })
    })
  }, [fall?.baumkataster, kataster])

  // Amtliche Parkfelder automatisch laden (wenn die Gemeinde eine Quelle hat und der Fall sie nicht abgeschaltet hat). Bis sie
  // da sind, rechnet die App ohne sie, danach neu. Abbruch mit dem neuen Klick (abbruchRef); ein später Abruf eines alten Orts
  // schreibt nichts (Vergleich über die Nummer des Ladevorgangs).
  const parkAus = fall?.parkkataster === false
  useEffect(() => {
    if (parkAus || !parkKat || parkKat.felder || parkKat.fehler || parkKat.laedt || parkKat.nr !== ladeNr.current) return
    const ctrl = abbruchRef.current, { quelle, nr } = parkKat
    const name = `${quelle.name} (WFS, ±${PARK_RADIUS_M} m)`
    const hier = (k: ParkStand | null) => !!k && k.nr === nr && ladeNr.current === nr && !ctrl?.signal.aborted
    setParkKat(k => (hier(k) ? { ...k!, laedt: true } : k))
    setzeQuelle('parkkataster', { name })
    quelle.laden(parkKat.lat, parkKat.lon, PARK_RADIUS_M, ctrl?.signal).then(r => {
      if (ctrl?.signal.aborted || ladeNr.current !== nr) return
      const n = (kl: string) => r.daten.filter(f => f.klasse === kl).length
      setParkKat(k => (hier(k) ? { ...k!, felder: r.daten, laedt: false } : k))
      setzeQuelle('parkkataster', { name, objekte: `${r.daten.length} Felder im Ausschnitt ±${PARK_RADIUS_M} m (${n('auto')} Auto, ${n('velo')} Velo, ${n('motorrad')} Motorrad)`,
        ms: r.ms, bytes: r.bytes, server: r.quelle })
      setFall(f => (f && f.parkkataster !== false ? { ...f, quellen: { ...f.quellen, parkkataster: quelle.quellenangabe } } : f))
    }, err => {
      if (istAbbruch(err) || ctrl?.signal.aborted || ladeNr.current !== nr) return
      setParkKat(k => (hier(k) ? { ...k!, laedt: false, fehler: (err as Error).message } : k))
      setzeQuelle('parkkataster', { name, fehler: `${(err as Error).message} (Dienst bzw. Zugriff aus dem Browser gesperrt?)` })
    })
  }, [parkAus, parkKat])

  // Luftbild nachladen: zuerst rechnet die App mit OSM + AV, mit dem Bild dann neu. Nur am OSM-Übergang und solange «Streifen im
  // Luftbild suchen» eingeschaltet ist; abgeschaltet lädt die App weder Bild noch Flugjahr. Wird die Suche später eingeschaltet,
  // holt der Effekt das Laden nach. Höchstens ein Versuch je Ladevorgang (lbVersuch = ladeNr): kein doppeltes Laden, nach einem
  // Fehler kein Wiederholen. Abbruch mit dem neuen Klick (abbruchRef); ein später Abruf schreibt nur in denselben Ladevorgang
  // bzw. Übergang (ladeNr, nid).
  const lbVersuch = useRef(0)
  const lbAn = fall?.luftbild !== false
  useEffect(() => {
    // Übergang ausserhalb der Abdeckung: gehört gleich nicht mehr zum Fall (Effekt unten), kein Luftbild
    if (!daten || daten.nid === null || querungAusserhalb(querungLage, daten.ort)) return
    const nr = ladeNr.current, versucht = lbVersuch.current === nr
    if (!lbAn) {
      if (!versucht && !daten.luftbild) setzeQuelle('luftbild', { name: LUFTBILD_NAME, objekte: 'abgeschaltet, nicht geladen' })
      return
    }
    if (!luftbildLaden({ nid: daten.nid, hatBild: !!daten.luftbild, an: lbAn, versucht })) return
    lbVersuch.current = nr
    // Ausschnitt um den Übergangsknoten (Erkennung am Knoten, Datenschutz-Hinweis «±30 m um den gewählten Übergang»): am Knoten
    // geladen (Normalfall) wie bisher um den Ladeort, sonst (Ort an die Streifen von Hand verlegt) um den Knoten aus OSM
    const lbOrt = querungLage && dist(querungLage, daten.ort) > ORT_TOL_M ? querungLage : daten.ort
    const ctrl = abbruchRef.current, nid = daten.nid, [e, n] = lbOrt
    const hier = () => !ctrl?.signal.aborted && ladeNr.current === nr
    setzeQuelle('luftbild', { name: LUFTBILD_NAME })
    Promise.all([ladeLuftbild(e, n, ctrl?.signal), ladeFlugjahr(e, n, ctrl?.signal)]).then(([rl, fj]) => {
      if (!hier()) return
      setzeQuelle('luftbild', { name: LUFTBILD_NAME, ms: rl.ms, bytes: rl.bytes, server: rl.quelle })
      setDaten(d => (d && d.nid === nid ? { ...d, luftbild: rl.daten, flugjahr: fj } : d))
      setFall(f => (f && f.luftbild !== false ? { ...f, quellen: { ...f.quellen, luftbild: `${LUFTBILD_QUELLE}${fj ? `, Flugjahr ${fj}` : ''}` } } : f))
    }, err => {
      if (!istAbbruch(err) && hier())
        setzeQuelle('luftbild', { name: LUFTBILD_NAME, fehler: `${(err as Error).message} (Streifen aus OSM + AV)` })
    })
  }, [lbAn, daten, querungLage])

  // Nach dem Laden: gewählten Übergang aus den OSM-Daten nachführen (Fall-Datei: Lage war der gespeicherte Ort, Tags fehlten)
  useEffect(() => {
    if (!querungKnoten) return
    const k = querungKnoten
    setGewaehlt(g => (g && g.id === k.id && (!Object.keys(g.tags).length || dist(lv95(g.lat, g.lon), lv95(k.lat, k.lon)) > 0.5) ? k : g))
  }, [querungKnoten])
  // Nach dem Laden: liegt der OSM-Übergang weiter als QUERUNG_M vom Ladeort (Fall-Datei bzw. gemerkter Fall, deren gespeicherter
  // Ort nicht der Knoten war bzw. deren Knoten in OSM inzwischen verschoben ist; abdeckung.querungAusserhalb):
  // - mit Streifen von Hand gehört er nicht mehr zum Fall: wie beim Verlegen des Orts (nachladen) Übergang weg; den Eintrag des
  //   Übergangs im Browser entfernt die App, sobald der Fall unter «fgsCheck.fall.ort» gemerkt ist; Hinweis.
  // - ohne Streifen von Hand (nur Hindernisse, Tempo usw.) gehört der Fall zum Übergang (Nachprüfung 16.10.2026, K-a): um dessen
  //   aktuelle Lage neu laden, wie beim Klick auf ihn (danach liegt der Knoten am Ladeort, keine Schleife).
  useEffect(() => {
    if (!daten || daten.nid === null || !fall || fall.ort.uebergang !== daten.nid || !querungKnoten ||
      !querungAusserhalb(querungLage, daten.ort)) return
    const nid = daten.nid, ab = dist(querungLage!, daten.ort), k = querungKnoten, alt = ladeHinweisRef.current
    if (!fall.streifenHand.length) {
      const neu: Fall = structuredClone(fall)
      neu.ort.lat = k.lat; neu.ort.lon = k.lon
      setGewaehlt(k)
      laden(k.lat, k.lon, nid, neu)
      setLadeHinweis({ text: (alt ? `${alt.text} ` : '') + querungVerschobenText(nid, ab), verwerfen: alt?.verwerfen ?? false })
      return
    }
    neuerFallImOrt(); ortVergessen.current = nid
    setFall(f => (f && f.ort.uebergang === nid ? ohneUebergang(f) : f))
    setDaten(d => (d && d.nid === nid ? { ...d, nid: null, luftbild: null, flugjahr: '' } : d))
    setGewaehlt(g => (g?.id === nid ? null : g))
    setLadeHinweis({ text: (alt ? `${alt.text} ` : '') + querungWegText(nid, ab), verwerfen: alt?.verwerfen ?? false })
  }, [daten, querungLage, querungKnoten, fall, laden])

  // ---------------------------------------------------------------- Zeichnen
  // Zeichnung zusätzlich in einer Ref, damit Klicks ohne Seiteneffekte in State-Updatern auskommen (StrictMode)
  const zeichnungRef = useRef<P[]>([])
  useEffect(() => { zeichnungRef.current = zeichnung }, [zeichnung])
  const fertig = useCallback((pts: P[]) => {
    if (!werkzeug) return
    const min = MIN_PUNKTE[werkzeug]
    if (pts.length < min) {
      setMeldung(`Zu wenige Punkte: ${WERKZEUG_NAME[werkzeug]} braucht mindestens ${min}. Weiter klicken oder «Abbrechen».`)
      return
    }
    const id = neueId(werkzeug)
    if (werkzeug === 'spurB' && spurFuer) {
      aendern(f => { const z = f.zufahrten[spurFuer] ?? {}; f.zufahrten[spurFuer] = { ...z, spur: { art: 'B', linie: pts, radius: null } }; return f })
    } else if (werkzeug === 'streifen' || werkzeug === 'tue') {
      // «Trottoirüberfahrt» (Planen): derselbe Streifen von Hand, gleich mit der Wahl «Trottoirüberfahrt» am Streifen
      const tue = werkzeug === 'tue'
      if (dist(pts[0], pts[1]) < STREIFEN_MIN_M) {
        setMeldung(tue ? 'Trottoirüberfahrt zu kurz: beide Enden auf den gegenüberliegenden Seiten der einmündenden Strasse anklicken.'
          : 'Streifen zu kurz: die beiden Wartebereiche auf den gegenüberliegenden Seiten der Fahrbahn anklicken.')
        setZeichnung([]); zeichnungRef.current = []
        return
      }
      // Planung (16.10.2026): in der Abdeckung der geladenen Daten bzw. mit den übrigen Streifen von Hand gemeinsam abdeckbar zum
      // laufenden Fall dazu (danach prüft der Effekt «geaendert» die Abdeckung und lädt um alle nach), sonst neuer Fall am Streifen
      // (abdeckung.planEntscheid; ohne OSM-Übergang mit ungesicherten Eingaben erst nach Bestätigung)
      // Trottoirüberfahrt: Streifen 4 m breit (nur Zeichnung); die Breite der Überfahrt kommt aus der Frage im Block «Knotensicht»
      const neu = { p0: pts[0], p1: pts[1], breite: tue ? TUE_STREIFEN_M : streifenBreite }
      const ort = ladeOrtRef.current
      const art = planEntscheid(neu, fall ? ort : null, fall ? { uebergang: fall.ort.uebergang, eingaben: hatEingaben(fall), gesichert,
        streifen: fall.streifenHand } : null)
      if (art === 'dazu') {
        geaendert.current = NEU_GEZEICHNET
        aendern(f => {
          const hid = naechsteHandId(f)
          f.streifenHand.push({ id: hid, ...neu, herkunft: 'gezeichnet' })
          if (tue) f.streifen[hid] = { typ: 'trottoirueberfahrt' }
          return f
        })
      } else {
        const reicht = fall && ort ? streifenAbstand(neu, ort) : null
        setWerkzeug(null); setSpurFuer(null)
        // die gezeichnete Achse bleibt sichtbar, bis der Wechsel bestätigt bzw. abgebrochen ist
        zeichnungRef.current = []; setZeichnung(art === 'bestaetigen' ? pts : [])
        wechseln(planNeuText(reicht, !!fall?.streifenHand.length), 'neuen Fall beginnen', () => planFall(neu, reicht, tue), true)
        return
      }
    } else if (werkzeug === 'fixpunkt') {
      fixpunktSetzen(pts[0])
    } else if (werkzeug === 'planflaeche') {
      const ring = planRingPruefen(pts)
      if (!ring) {
        setMeldung('Fläche (Plan) ohne Fläche (Ecken doppelt bzw. auf einer Linie): weiter klicken oder «Abbrechen».')
        return
      }
      aendern(f => { f.flaechenPlan = [...(f.flaechenPlan ?? []), { id: naechstePlanId(f), art: planArt, ring }]; return f })
      setMeldung(`Fläche (Plan) gezeichnet: ${PLAN_NAME[planArt]}, ${f1(planFlaecheM2(ring))} m². Sie ersetzt in der Rechnung die ` +
        'AV-Flächen darunter; Art und Ecken unter «Flächen (Plan)» änderbar.')
    } else {
      let h: Hindernis | null = null
      if (werkzeug === 'parkfeld') h = { id, art: 'parkfeld', klasse: klasse === 'velo' ? 'velo' : 'auto', ring: pts, quelle: 'hand' }
      if (werkzeug === 'laengs') h = { id, art: 'laengsparkierung', linie: pts, breite, quelle: 'hand' }
      if (werkzeug === 'baum') h = { id, art: 'baum', p: pts[0], stamm: BAUM_STAMM_M, quelle: 'hand' }
      if (werkzeug === 'hecke' || werkzeug === 'mauer') h = { id, art: werkzeug, linie: pts, sichtbehindernd, quelle: 'hand' }
      if (werkzeug === 'flaeche') h = { id, art: 'uebrige', ring: pts, sichtbehindernd, quelle: 'hand' }
      if (werkzeug === 'insel') h = { id, art: 'insel', ring: pts, quelle: 'hand' }
      if (h) aendern(f => { f.hindernisse.push(h!); return f })
    }
    setZeichnung([]); zeichnungRef.current = []; setWerkzeug(null); setSpurFuer(null)
  }, [werkzeug, spurFuer, klasse, breite, streifenBreite, sichtbehindernd, aendern, fall, gesichert, av, planArt])

  // «Ecke runden» (20.10.2026, planflaechen.eckeRunden): Klick fängt die nächste Ecke der gewählten Fläche (Plan) im Fangradius
  // (mindestens 1 m); die Ecke wird durch einen Kreisbogen mit Radius rundenR ersetzt, tangential an beide Kanten. Passt der Bogen
  // nicht, bleibt die Fläche unverändert (Meldung mit dem grössten möglichen Radius). Das Werkzeug bleibt an (weitere Ecken)
  /** Ecke i des Rings vorher der Fläche id mit Radius R runden und übernehmen -> Fehlertext bzw. null */
  const rundungAnwenden = (id: string, vorher: P[], i: number, R: number): string | null => {
    const r = eckeRunden(vorher, i, R)
    if (!r.ok) return `Ecke runden (${planTitel(id)}, Ecke ${i + 1}): ${r.grund}`
    const ring = planRingPruefen(r.ring)
    if (!ring) return `Ecke runden (${planTitel(id)}): die gerundete Fläche wäre ungültig (zu viele Ecken bzw. ohne Fläche).`
    aendern(f => { const x = f.flaechenPlan?.find(y => y.id === id); if (x) x.ring = ring; return f })
    const text = `${planTitel(id)}: Ecke ${i + 1} mit Radius ${f1(R)} m gerundet (${r.einspringend ? 'einspringende Ecke, Bogen füllt sie aus' :
      'Bogen schneidet die Ecke ab'}; Tangentialpunkte ${f1(r.t)} m von der Ecke, ${r.bogenPunkte} Bogenpunkte).`
    setRundung({ id, i, R, vorher, nachher: ring, text })
    setRundenFehler(null); setRundenAngebot(null)
    setMeldung(`${text} Der Eckradius der Abbieger liest den Bogen; Radius ändern passt diese Ecke an, weitere Ecke anklicken bzw. «fertig».`)
    return null
  }
  const eckeRundenBei = (p: P) => {
    setRundenFehler(null); setRundenAngebot(null)
    const pl = fall?.flaechenPlan?.find(x => x.id === bearbeiten)
    if (!pl) { setMeldung('Ecke runden: zuerst unter «Flächen (Plan)» die Fläche wählen («Ecke runden»).'); return }
    // nur echte Ecken (planflaechen.echteEcken): Bogenpunkte und fast gerade Punkte sind keine Rund-Ziele
    const i = eckeAmPunkt(pl.ring, p, Math.max(1, fangRadius()), echteEcken(pl.ring))
    if (i === null) {
      setMeldung(`Ecke runden: keine Ecke von ${planTitel(pl.id)} getroffen – näher an eine Ecke klicken (Kreise; Punkte eines Bogens sind keine Ecken).`)
      return
    }
    const fehler = rundungAnwenden(pl.id, pl.ring, i, rundenR)
    if (fehler) {
      const t = `${fehler} ${eckeGrenzeText(pl.ring, i)} Die Fläche bleibt unverändert.`
      setRundenFehler(t); setMeldung(t)
      const g = eckeGrenze(pl.ring, i)
      // Angebot (Popup an der Ecke und Knopf in der Werkzeughilfe): mit dem grössten möglichen Radius runden
      if (g && g.rMax >= RUNDEN_R_BEREICH[0] && g.rMax < rundenR)
        setRundenAngebot({ id: pl.id, i, rMax: g.rMax, ring: pl.ring,
          text: `Ecke ${i + 1}: höchstens ${f1(g.rMax)} m (Nachbarkante ${f1(g.kanteM)} m). ${eckeGrenzeText(pl.ring, i)}` })
    }
  }
  /** Angebot annehmen: mit dem grössten möglichen Radius runden und den Radius darauf setzen */
  const angebotAnnehmen = () => {
    const a = rundenAngebot
    if (!a) return
    const pl = fall?.flaechenPlan?.find(x => x.id === a.id)
    if (!pl || !gleicherRing(pl.ring, a.ring)) { setRundenAngebot(null); setRundenFehler('Die Fläche wurde inzwischen geändert: Ecke neu anklicken.'); return }
    const fehler = rundungAnwenden(a.id, a.ring, a.i, a.rMax)
    if (fehler) { setRundenFehler(`${fehler} Die Fläche bleibt unverändert.`); setRundenAngebot(null) }
    else setRundenR(a.rMax)
  }
  // Radius übernommen (Regler losgelassen, Zahlenfeld mit Enter bzw. verlassen): die zuletzt gerundete Ecke neu runden, solange
  // ihre Fläche seither nicht anders geändert wurde; passt der neue Radius nicht, bleibt die bisherige Rundung (Meldung in der
  // Werkzeughilfe). Beim Ziehen nur die Vorschau (rundenVorschau), ohne Rechnung
  useEffect(() => {
    if (werkzeug !== 'eckeRunden' || !rundung || rundung.R === rundenR) return
    const pl = fall?.flaechenPlan?.find(x => x.id === rundung.id)
    if (!pl || !gleicherRing(pl.ring, rundung.nachher)) return
    const fehler = rundungAnwenden(rundung.id, rundung.vorher, rundung.i, rundenR)
    if (fehler) { setRundenFehler(`${fehler} Die bisherige Rundung (${f1(rundung.R)} m) bleibt.`); setRundenAngebot(null) }
  }, [rundenR, rundung, werkzeug, fall])
  // Vorschau beim Ziehen: die zuletzt gerundete Ecke aus dem Ring vor der Rundung mit dem Radius am Regler (nur Geometrie)
  const rundenVorschau = useMemo(() => {
    if (werkzeug !== 'eckeRunden' || rundenZug === null || !rundung) return null
    const pl = fall?.flaechenPlan?.find(x => x.id === rundung.id)
    if (!pl || !gleicherRing(pl.ring, rundung.nachher)) return null
    const p = rundung.vorher[rundung.i]
    const r = eckeRunden(rundung.vorher, rundung.i, rundenZug)
    if (r.ok) return { ring: r.ring, passt: true, text: `${f1(rundenZug)} m`, p }
    const rMax = eckeRadiusMax(rundung.vorher, rundung.i)
    return { ring: rundung.nachher, passt: false, text: `${f1(rundenZug)} m passt nicht${rMax !== null ? ` (höchstens ${f1(rMax)} m)` : ''}`, p }
  }, [werkzeug, rundenZug, rundung, fall])
  // «Mittelinsel (Standard)» (20.10.2026, rechner/standardinsel.ts). Streifen, auf deren Achse die Insel liegen kann: die Streifen
  // von Hand (Teilstreifen-Gruppe aus der Rechnung: uebergangId), ohne sie die gerechneten Streifen (OSM + AV bzw. Luftbild; die
  // Rechnung teilt diese selbst an der Insel). Balkenrichtung wie in der Rechnung (Umriss), sonst Balken des Streifens bzw. OSM-Weg
  const inselAktiv = werkzeug === 'mittelinsel'
  const inselNetz = useMemo(() => (inselAktiv && daten ? new OsmNetz(osmParsen(daten.osm as Parameters<typeof osmParsen>[0])) : null),
    [inselAktiv, daten])
  const inselAv = useMemo(() => (inselAktiv && av ? avMitPlan(av, fall?.flaechenPlan).av : null), [inselAktiv, av, fall?.flaechenPlan])
  const inselFahrbahn = useMemo(() => (inselAv ? new Fahrbahn(inselAv) : null), [inselAv])
  type InselStreifen = { id: string; titel: string; p0: P; p1: P; breite: number; balken: P | null; hand: boolean; gruppe: { id: string; p0: P; p1: P }[] }
  const inselStreifen = useMemo<InselStreifen[]>(() => {
    if (!inselAktiv || !fall) return []
    const erg = rechnung?.streifen ?? []
    if (fall.streifenHand.length) {
      const lang = fall.streifenHand.filter(h => dist(h.p0, h.p1) >= STREIFEN_MIN_M)
      return lang.map(h => {
        const e = erg.find(x => x.fgsId === h.id)
        const a = sub(h.p1, h.p0), m: P = [(h.p0[0] + h.p1[0]) / 2, (h.p0[1] + h.p1[1]) / 2]
        const balken = (e ? balkenAusUmriss(einheitP(a), e.umriss) : null) ?? h.richtung ?? fahrbahnRichtung(inselNetz, m)
        const gruppe = e ? lang.filter(x => erg.find(y => y.fgsId === x.id)?.uebergangId === e.uebergangId) : [h]
        return { id: h.id, titel: streifenTitel(h.id, fall.streifenHand), p0: h.p0, p1: h.p1, breite: h.breite, balken, hand: true,
          gruppe: gruppe.map(x => ({ id: x.id, p0: x.p0, p1: x.p1 })) }
      })
    }
    return erg.map(e => ({ id: e.fgsId, titel: `Streifen ${e.fgsId} (${rechnung?.streifenQuelle === 'luftbild' ? 'Luftbild' : 'OSM + AV'})`,
      p0: e.p0, p1: e.p1, breite: e.bw, balken: balkenAusUmriss(einheitP(sub(e.p1, e.p0)), e.umriss), hand: false,
      gruppe: erg.filter(x => x.uebergangId === e.uebergangId).map(x => ({ id: x.fgsId, p0: x.p0, p1: x.p1 })) }))
  }, [inselAktiv, fall, rechnung, inselNetz])
  // ---- Mittelinsel ziehen: Griffe (nur Standardform), Vorschau und Lagehinweise beim Ziehen, Übernahme beim Loslassen
  const planListe = fall?.flaechenPlan
  // ---- «Vorgezogener Seitenraum» (23.10.2026, rechner/seitenraum.ts): Griff in der Mitte (nur in der Standardform), Ziehen entlang der
  // Bordkante (Vorschau ohne Rechnung), Übernahme beim Loslassen mit «Verschiebung zurücknehmen» wie bei der Mittelinsel
  const [srZug, setSrZug] = useState<{ gruppe: string; p: P } | null>(null)
  /** Fahrbahn mit den Flächen (Plan) ohne das Element gruppe (Bordkante heute) */
  const srFahrbahn = useCallback((plan: FlaechePlan[] | undefined, gruppe: string | null) =>
    new Fahrbahn(avMitPlan(av ?? [], plan?.filter(x => !gruppe || x.standard?.gruppe !== gruppe)).av), [av])
  const srZugGruppe = srZug?.gruppe ?? null
  const srZugFb = useMemo(() => (srZugGruppe && av ? srFahrbahn(planListe, srZugGruppe) : null), [srZugGruppe, av, planListe, srFahrbahn])
  const srGriffe = useMemo(() => (planListe ?? []).filter(fp => seitenraumStandard(fp) && !seitenraumAngepasst(fp)).map(fp => {
    const st = seitenraumStandard(fp)!
    return { gruppe: st.gruppe, m: seitenraumMitte(st), text: 'Vorgezogenen Seitenraum ziehen: gleitet entlang der Bordkante.' }
  }), [planListe])
  const srElement = (plan: FlaechePlan[] | undefined, gruppe: string) => {
    const fp = plan?.find(x => seitenraumStandard(x)?.gruppe === gruppe)
    return fp ? { fp, st: seitenraumStandard(fp)! } : null
  }
  const srZugVorschau = useMemo(() => {
    if (!srZug) return null
    const e = srElement(planListe, srZug.gruppe)
    if (!e) return null
    const neu = srVerschieben(e.st, srZug.p, srZugFb ? (q, r) => srZugFb.sehne(q, r) : null)
    return { ringe: [seitenraumRing(neu, neu)], furt: null, mast: null, mitte: seitenraumMitte(neu), teile: [] as [P, P][],
      text: `entlang der Bordkante ${f2(dist(neu.k, e.st.k))} m`, art: 'trottoir' as PlanArt }
  }, [srZug, planListe, srZugFb])
  /** Element ersetzen (Masse bzw. Lage) und Streifen von Hand an der Vorderkante nachführen -> nachgeführte Streifen */
  const srErsetzen = (f: Fall, id: string, alt: PlanSeitenraum, neu: PlanSeitenraum): string[] => {
    const x = f.flaechenPlan?.find(y => y.id === id)
    if (!x) return []
    const r = endenNachfuehren(f.streifenHand, kanteLinie(alt, alt, true), kanteLinie(neu, neu, true), kanteLinie(neu, neu, false),
      kanteLinie(alt, alt, false))
    Object.assign(x, seitenraumNeu(x, neu))
    f.streifenHand = r.streifen
    return r.ids
  }
  const srZiehen = useCallback((gruppe: string, p: P) => setSrZug({ gruppe, p }), [])
  const srLoslassen = (gruppe: string, p: P) => {
    setSrZug(null)
    const e = srElement(fall?.flaechenPlan, gruppe)
    if (!e || !fall) return
    const fb = av ? srFahrbahn(fall.flaechenPlan, gruppe) : null
    const neu = srVerschieben(e.st, p, fb ? (q, r) => fb.sehne(q, r) : null)
    if (dist(neu.k, e.st.k) < 0.01) return
    const nachher = structuredClone(fall)
    const ids = srErsetzen(nachher, e.fp.id, e.st, neu)
    setVerschiebung({ gruppe, schluessel: eingabenSchluessel(nachher), flaechenPlan: structuredClone(fall.flaechenPlan ?? []),
      streifenHand: structuredClone(fall.streifenHand), teilungVorher: teilung })
    aendern(f => { srErsetzen(f, e.fp.id, e.st, neu); return f })
    setMeldung(`${SR_NAME} um ${f2(dist(neu.k, e.st.k))} m entlang der Bordkante verschoben` +
      (ids.length ? `; Ende von ${ids.map(id => streifenTitel(id, fall.streifenHand)).join(', ')} nachgeführt` : '') +
      '. Zurück mit «Verschiebung zurücknehmen» unter «Flächen (Plan)».')
  }
  /** Masse ändern (Liste «Flächen (Plan)») */
  const srAendern = (id: string, neu: Partial<SrMasse>) => {
    const fp = fall?.flaechenPlan?.find(x => x.id === id), st = fp && seitenraumStandard(fp)
    if (!fall || !st) return
    const st2: PlanSeitenraum = { ...st, ...neu, ...(neu.tiefePark !== undefined ? { parkQuelle: 'hand' as const } : {}) }
    const fe = srMasseFehler(st2)
    if (fe) { setMeldung(`${SR_NAME} nicht geändert: ${fe}`); return }
    aendern(f => { srErsetzen(f, id, st, st2); return f })
  }
  const inselGriffe = useMemo(() => standardGruppen(planListe).filter(g => standardZiehbar(planListe, g.gruppe))
    .map(g => ({ gruppe: g.gruppe, m: g.st.m, text: inselFrei ? 'Mittelinsel ziehen: frei verschieben (Schalter «frei verschieben» ist an).' :
      'Mittelinsel ziehen: gleitet entlang der Streifenachse. Frei: Schalter «frei verschieben» oder Umschalttaste während des Ziehens.' })),
  [planListe, inselFrei])
  // Bodenbedeckung ohne die gezogene Mittelinsel (für die Lagehinweise; einmal je Zug, nicht bei jeder Bewegung)
  const zugGruppe = inselZug?.gruppe ?? null
  // Radstreifen an der Querung (Bedarf von Hand, sonst OSM aus der Rechnung): Durchfahrt neben der Mittelinsel nach F3-B
  // und Ebenen Kanton BE (F3) bzw. Bern (F3-B) wie im Befundblatt (Vorgabe nach der AV, von Hand geschaltet)
  const inselOpt = useMemo(() => {
    const h = fall?.bedarf?.felder.radstreifen?.wert
    const e = ebenenWirksam(fall?.bedarf, ebenenVorgabe(daten?.bfs ?? [], [...new Set((av ?? []).map(f => f.kanton).filter(Boolean))]))
    return { radstreifen: typeof h === 'boolean' ? h : radstreifenAusRechnung(rechnung?.streifen ?? []), kantonBE: e.kantonBE, bern: e.bern }
  }, [fall, rechnung, daten, av])
  const zugBoden = useMemo(() => {
    if (!zugGruppe || !av) return null
    const a = avMitPlan(av, planListe?.filter(x => x.standard?.gruppe !== zugGruppe)).av
    return { av: a, fb: new Fahrbahn(a) }
  }, [zugGruppe, av, planListe])
  /** Lage nach dem Ziehen: neue Listen bzw. Grund, Vorschau-Geometrie, Lagehinweise */
  const zugAuswerten = useCallback((gruppe: string, m: P) => {
    const st = standardZiehbar(planListe, gruppe)
    if (!st || !fall) return null
    const r = inselVerschieben(planListe ?? [], fall.streifenHand, gruppe, m)
    const neuSt = { ...st, m }
    const g = standardGeometrie(neuSt)
    const hinweise: string[] = []
    if ('grund' in r) hinweise.push(r.grund)
    else {
      if (r.abAchseM !== null && r.abAchseM > 0.05) hinweise.push(`Mitte ${f2(r.abAchseM)} m neben der Achse der Teilstreifen.`)
      // Streifen von Hand, die danach in die Insel reichen (Teilstreifen nicht bzw. nur einer erkannt, ungeteilter Streifen)
      if (r.inInsel.length) hinweise.push(`${r.inInsel.map(id => streifenTitel(id, fall.streifenHand)).join(', ')} reicht in die Insel bzw. quert sie (nicht mitgeführt): ` +
        'Enden prüfen bzw. «als zwei Teilstreifen zeichnen».')
    }
    if (zugBoden) {
      const pr = inselPruefen({ m, achse: st.achse, balken: st.balken }, st, zugBoden.av, (p, q) => zugBoden.fb.sehne(p, q),
        inselOpt)
      hinweise.push(...pr.hinweise.filter(h => !h.startsWith('In der Furt')).map(h => mitTiteln(durchfahrtAnzeige(h))))
      if (pr.furtFahrbahn && !(planListe ?? []).some(x => inselStandard(x)?.gruppe === gruppe && inselStandard(x)!.teil === 'furt'))
        hinweise.push('In der Furt liegt eine Verkehrsinsel der AV: für die Furt auf Fahrbahnniveau die Mittelinsel dort neu einfügen.')
    }
    // Achse eines Streifens quert die Furt: Streifen der Rechnung (ohne die mitgeführten Teilstreifen) und die gemeinsame Achse der
    // Teilstreifen an ihrer neuen Lage (vom äusseren Ende des einen zum äusseren Ende des anderen)
    const tmp = [{ id: 'zug', art: 'insel' as PlanArt, ring: g.insel, standard: { ...neuSt, teil: 'insel' as const } }]
    const teilIds = 'grund' in r ? [] : r.teilIds
    const achsen: [P, P][] = (rechnung?.streifen ?? []).filter(e => !teilIds.includes(e.fgsId)).map(e => [e.p0, e.p1])
    if (!('grund' in r) && r.teilIds.length === 2) {
      const [t1, t2] = r.teilIds.map(id => r.streifen.find(x => x.id === id)!)
      const aussen = (t: StreifenHand) => (dist(t.p0, m) > dist(t.p1, m) ? t.p0 : t.p1)
      achsen.push([aussen(t1), aussen(t2)])
    }
    if (achsen.some(([a, b]) => furtQuert(tmp, a, b)))
      hinweise.push('Eine Streifenachse quert die Rollstuhlfurt statt der erhöhten Inselfläche: dort teilt die Rechnung nicht an der Insel.')
    return { r, g, hinweise }
  }, [planListe, fall, zugBoden, rechnung, inselOpt])
  const zugVorschau = useMemo(() => {
    if (srZugVorschau) return srZugVorschau
    if (!inselZug) return null
    const a = zugAuswerten(inselZug.gruppe, inselZug.m)
    if (!a) return null
    const rr = a.r
    const teile = 'grund' in rr ? [] : rr.streifen.filter(x => rr.teilIds.includes(x.id)).map(x => [x.p0, x.p1] as [P, P])
    return { ringe: [...(a.g.kopf ? [a.g.kopf] : []), a.g.insel], furt: a.g.furt, mast: a.g.mast, mitte: inselZug.m, teile,
      text: [inselZug.frei ? 'frei verschoben' : 'entlang der Achse', ...a.hinweise].join(' – ') }
  }, [inselZug, zugAuswerten, srZugVorschau])
  const inselZiehen = useCallback((gruppe: string, p: P, umschalt: boolean) => {
    const st = standardZiehbar(planListe, gruppe), frei = umschalt || inselFrei
    if (st) setInselZug({ gruppe, m: zugMitte(st, p, frei), frei })
  }, [planListe, inselFrei])
  const inselLoslassen = useCallback((gruppe: string, p: P, umschalt: boolean) => {
    const frei = umschalt || inselFrei
    setInselZug(null)
    const st = standardZiehbar(planListe, gruppe)
    if (!st || !fall) return
    const m = zugMitte(st, p, frei)
    if (dist(m, st.m) < 0.01) return
    const a = zugAuswerten(gruppe, m)
    if (!a) return
    if ('grund' in a.r) { setMeldung(`Mittelinsel nicht verschoben: ${a.r.grund}`); return }
    const r = a.r
    const nachher = structuredClone(fall); nachher.flaechenPlan = r.plan; nachher.streifenHand = r.streifen
    setVerschiebung({ gruppe, schluessel: eingabenSchluessel(nachher), flaechenPlan: structuredClone(fall.flaechenPlan ?? []),
      streifenHand: structuredClone(fall.streifenHand), teilungVorher: teilung })
    aendern(f => {
      const x = inselVerschieben(f.flaechenPlan ?? [], f.streifenHand, gruppe, m)
      if (!('grund' in x)) { f.flaechenPlan = x.plan; f.streifenHand = x.streifen }
      return f
    })
    // die Teilung (zum Zurücknehmen) kennt jetzt die nachgeführten Teilstreifen
    if (teilung && r.teilIds.includes(teilung.id) && r.teilIds.includes(teilung.neuId))
      setTeilung({ ...teilung, teil1: structuredClone(r.streifen.find(x => x.id === teilung.id)!),
        teil2: structuredClone(r.streifen.find(x => x.id === teilung.neuId)!) })
    setMeldung(`Mittelinsel um ${f2(dist(m, st.m))} m ${frei ? 'frei ' : 'entlang der Achse '}verschoben` +
      (r.teilIds.length ? `; Teilstreifen ${r.teilIds.map(id => streifenTitel(id, fall.streifenHand)).join(' und ')} an die Inselkanten nachgeführt` : '') +
      `.${a.hinweise.length ? ` ${mitTiteln(a.hinweise.join(' '))}` : ''} Zurück mit «Verschiebung zurücknehmen» unter «Flächen (Plan)».`)
  }, [planListe, fall, zugAuswerten, teilung, aendern, inselFrei])
  // Griffe der Mittelinseln und der vorgezogenen Seitenräume (Kennung sr-…); Ziehen und Loslassen nach der Art des Elements
  const alleGriffe = useMemo(() => [...inselGriffe, ...srGriffe], [inselGriffe, srGriffe])
  // nach der Art des Elements (nicht nach dem Präfix der Kennung)
  const griffZug = (gruppe: string, p: P, umschalt: boolean) => (srElement(planListe, gruppe) ? srZiehen(gruppe, p) : inselZiehen(gruppe, p, umschalt))
  const griffLos = (gruppe: string, p: P, umschalt: boolean) => (srElement(planListe, gruppe) ? srLoslassen(gruppe, p) : inselLoslassen(gruppe, p, umschalt))
  const verschiebungZurueck = () => {
    const v = verschiebung
    if (!v || !fall) return
    if (!verschiebungZuruecknehmbar(fall, v)) { setVerschiebung(null); setMeldung('Seither wurde etwas anderes geändert: Verschiebung nicht zurückgenommen.'); return }
    aendern(f => { verschiebungZuruecknehmen(f, v); return f })
    setTeilung(v.teilungVorher); setVerschiebung(null)
    setMeldung(`Verschiebung ${srElement(v.flaechenPlan, v.gruppe) ? 'des vorgezogenen Seitenraums' : 'der Mittelinsel'} zurückgenommen.`)
  }
  const inselM = useMemo(() => inselMasse(inselEin.tiefe, inselEin.breite, inselEin.furt, inselEin.kopf, inselEin.seite), [inselEin])
  const inselFehler = masseFehler(inselM)
  const inselK = inselOrt?.streifen ? inselStreifen.find(k => k.id === inselOrt.streifen) ?? null : null
  // Streifen von Hand teilen: nur ein einzelner Streifen von Hand (Teilstreifen sind schon geteilt)
  const inselTeilbar = !!inselK && inselK.hand && inselK.gruppe.length === 1
  const inselTeilung = useMemo(() => (inselOrt && inselK && inselTeilbar && !inselFehler ?
    streifenTeilen(inselK.p0, inselK.p1, inselOrt.lage, inselM) : null), [inselOrt, inselK, inselTeilbar, inselFehler, inselM])
  const inselPruefung = useMemo(() => (inselOrt && inselAv && inselFahrbahn && !inselFehler ?
    inselPruefen(inselOrt.lage, inselM, inselAv, (p, r) => inselFahrbahn.sehne(p, r), inselOpt) : null),
  [inselOrt, inselAv, inselFahrbahn, inselFehler, inselM, inselOpt])
  const inselVorschau = useMemo(() => {
    if (zugVorschau) return zugVorschau
    if (!inselOrt || inselFehler) return null
    const g = inselGeometrie(inselOrt.lage, inselM)
    return { ringe: [...(g.kopf ? [g.kopf] : []), g.insel], furt: g.furt, mast: g.mast, mitte: inselOrt.lage.m,
      teile: inselEin.teilen && inselTeilung && 'teile' in inselTeilung ? inselTeilung.teile : [] }
  }, [inselOrt, inselFehler, inselM, inselEin.teilen, inselTeilung, zugVorschau])
  useEffect(() => { if (!inselAktiv) setInselOrt(null) }, [inselAktiv])
  /** Streifen k wählen: Insel auf seiner Achse, in der Fahrbahnmitte bzw. (Teilstreifen) in der Lücke nächst p; Breite des Streifens */
  const inselAufStreifen = (k: InselStreifen, p: P | null) => {
    const achse = einheitP(sub(k.p1, k.p0))
    let m: P, quelle: string
    const l = k.gruppe.length > 1 ? teilLuecke(k.gruppe, achse, p ?? k.p0) : null
    if (l) { m = l; quelle = 'Mitte der Lücke zwischen den Teilstreifen' }
    else if (inselFahrbahn) ({ m, quelle } = fahrbahnMitte((q, r) => inselFahrbahn.sehne(q, r), k.p0, k.p1))
    else { m = [(k.p0[0] + k.p1[0]) / 2, (k.p0[1] + k.p1[1]) / 2]; quelle = 'Streifenmitte' }
    setInselOrt({ streifen: k.id, lage: inselLage(m, achse, k.balken), quelle: `${k.titel}: ${quelle}` })
    setInselEin(x => ({ ...x, breite: Math.round(Math.min(INSEL_BEREICH.breite[1], Math.max(INSEL_BEREICH.breite[0], k.breite)) * 100) / 100 }))
  }
  /** Abstand von p zur Achse eines Streifens (Strecke, je 2 m verlängert) */
  const achsAbstand = (k: { p0: P; p1: P }, p: P) => {
    const a = einheitP(sub(k.p1, k.p0)), L = dist(k.p0, k.p1), t = Math.max(-2, Math.min(L + 2, a[0] * (p[0] - k.p0[0]) + a[1] * (p[1] - k.p0[1])))
    return dist(p, [k.p0[0] + a[0] * t, k.p0[1] + a[1] * t])
  }
  const mittelinselBei = (p: P) => {
    // gewählter Streifen: Klick nahe der Achse (Gruppe) verschiebt die Insel entlang der Achse
    if (inselOrt && inselK && inselK.gruppe.some(g => achsAbstand(g, p) <= inselK.breite / 2 + 1.5)) {
      setInselOrt({ ...inselOrt, lage: { ...inselOrt.lage, m: aufAchse(p, inselOrt.lage.m, inselOrt.lage.achse) },
        quelle: `${inselK.titel}: von Hand auf der Achse verschoben` })
      return
    }
    // anderer Streifen in der Nähe: wählen
    let best: [InselStreifen, number] | null = null
    for (const k of inselStreifen) { const d = achsAbstand(k, p); if (d <= k.breite / 2 + 1.5 && (!best || d < best[1])) best = [k, d] }
    if (best) { inselAufStreifen(best[0], p); return }
    // ohne Streifen: Klick setzt die Mitte, Ausrichtung nach dem nächsten befahrbaren OSM-Weg
    const r = fahrbahnRichtung(inselNetz, p)
    if (!r) { setMeldung('Mittelinsel: kein Streifen und kein befahrbarer OSM-Weg bis 15 m – auf einen Streifen bzw. näher an die Strasse klicken.'); return }
    setInselOrt({ streifen: null, lage: inselLage(p, [-r[1], r[0]], r), quelle: 'Mitte von Hand gesetzt, ausgerichtet nach dem nächsten OSM-Weg' })
  }
  const mittelinselEinfuegen = () => {
    if (!inselOrt || inselFehler || !fall) return
    const lage = inselOrt.lage, masse = inselM, k = inselK
    const tl = inselEin.teilen && inselTeilung && 'teile' in inselTeilung ? inselTeilung.teile : null
    const furtFahrbahn = inselPruefung?.furtFahrbahn ?? false
    // Eingaben je Zufahrt des geteilten Streifens: an den Teil, an dem der erste Sichtpunkt der Zufahrt liegt (standardinsel.zufahrtTeil)
    const e = k ? rechnung?.streifen.find(x => x.fgsId === k.id) : undefined
    const teilVon = zufahrtTeil(e?.zufahrten ?? [], lage)
    // Änderung am Fall (rein: gleiche Eingabe, gleiches Ergebnis); für die Meldung einmal auf einer Kopie des offenen Falls, dann
    // im Updater (der später bzw. zweimal laufen kann)
    const einfuegen = (f: Fall) => {
      const ids: string[] = []
      let neuId = '', verschoben = 0, rueck: TeilungRueck | null = null
      const gruppe = naechsteGruppe(f.flaechenPlan)
      f.flaechenPlan = [...(f.flaechenPlan ?? [])]
      for (const x of inselFlaechen(lage, masse, gruppe, furtFahrbahn)) { const id = naechstePlanId(f); f.flaechenPlan.push({ id, ...x }); ids.push(id) }
      if (tl && k) {
        const t = streifenHandTeilen(f, k.id, tl, teilVon)
        if (t) ({ neuId, verschoben, rueck } = t)
      }
      return { ids, neuId, verschoben, rueck: rueck as TeilungRueck | null, gruppe }
    }
    const { ids, neuId, verschoben, rueck, gruppe } = einfuegen(structuredClone(fall))
    aendern(f => { einfuegen(f); return f })
    setTeilung(rueck ? { ...rueck, gruppe } : null)
    setInselOrt(null); setWerkzeug(null)
    setMeldung(`${standardText(masse)} eingefügt als ${ids.map(planTitel).join(', ')} (Art Insel${furtFahrbahn ? '; Furt als Fahrbahn' : ''}).` +
      (neuId && k ? ` ${k.titel} an der Insel in zwei Teilstreifen geteilt (${streifenTitel(k.id, fall.streifenHand)} und ein neuer Teil)` +
        `${verschoben ? `; ${verschoben} Eingabe(n) je Zufahrt an den zweiten Teil übertragen – bitte prüfen` : ''}; zurück mit ` +
        '«Teilung zurücknehmen» beim Streifen.' : '') +
      (k && k.hand && !neuId ? ' Der Streifen von Hand ist nicht geteilt: die Rechnung meldet «als zwei Teilstreifen zeichnen».' : ''))
  }
  /** Teilung zurücknehmen (fall.teilungZuruecknehmen); die Mittelinsel bleibt */
  const teilungZurueck = () => {
    const t = teilung
    if (!t || !fall) return
    if (!teilungZuruecknehmbar(fall, t)) { setTeilung(null); setMeldung('Die Teilstreifen wurden seither geändert: Teilung nicht zurückgenommen.'); return }
    aendern(f => { teilungZuruecknehmen(f, t); return f })
    setTeilung(null)
    setMeldung(`Teilung zurückgenommen: ${titel(t.id)} wieder ungeteilt, mit den Eingaben wie vor dem Teilen; ${titel(t.neuId)} entfernt.`)
  }
  /** alle Flächen (Plan) einer Mittelinsel löschen, auf Wunsch mit der Teilung des Streifens */
  const mittelinselLoeschen = (g: string, mitTeilung: boolean) => {
    if (!fall) return
    if (fall.flaechenPlan?.some(x => x.standard?.gruppe === g && x.id === bearbeiten)) { setBearbeiten(null); if (werkzeug === 'eckeRunden') setWerkzeug(null) }
    const t = mitTeilung && teilung?.gruppe === g && teilungZuruecknehmbar(fall, teilung) ? teilung : null
    aendern(f => {
      f.flaechenPlan = (f.flaechenPlan ?? []).filter(x => x.standard?.gruppe !== g)
      if (!f.flaechenPlan.length) delete f.flaechenPlan
      if (t) teilungZuruecknehmen(f, t)
      return f
    })
    if (t) setTeilung(null)
    setMeldung(`Mittelinsel gelöscht${t ? `; Teilung zurückgenommen (${titel(t.id)} wieder ungeteilt)` : ''}.`)
  }
  /** «Vorgezogener Seitenraum» an einem Streifenende einfügen (Klick p): nächstes Streifenende der Rechnung (Bordkante rand); fast in
   * der Streifenmitte das Ende mit Längsparkierung. Tiefe aus der Parkierung (Parkfelder, Längsparkierung, Vorschläge), sonst Annahme */
  const seitenraumBei = (p: P) => {
    if (!fall || !av || !rechnung?.streifen.length) { setMeldung(`${SR_NAME}: zuerst einen Streifen rechnen lassen.`); return }
    const fb = srFahrbahn(fall.flaechenPlan, null), inseln = new Inseln(avMitPlan(av, fall.flaechenPlan).av)
    const parkAlle: ParkRing[] = parkRinge(fall.hindernisse, rechnung.vorschlaege.map(v => v.hindernis))
    const vorschlag = (e: StreifenErgebnis, k: 0 | 1) => {
      const l0 = seitenraumLage(e.p0, e.p1, k, balkenAusUmriss(einheitP(sub(e.p1, e.p0)), e.umriss), e.rand[k])
      const kante = kanteMessen(l0, seitenraumMasse(e.bw, null), (q, r) => fb.sehne(q, r)) ?? [0, 0]
      const lage = { ...l0, kante }
      const park = parkMessen(parkAlle, lage, e.bw, (q, r) => fb.sehne(q, r))
      return { lage, park, masse: seitenraumMasse(e.bw, park), insel: inseln.enthaelt(add(e.rand[k], l0.tief, -0.5)) }
    }
    const kand = rechnung.streifen.flatMap(e => ([0, 1] as const).map(k => ({ e, k, d: dist(p, e.rand[k]) })))
      .filter(x => x.d <= Math.max(6, x.e.bw)).sort((a, b) => a.d - b.d)
    if (!kand.length) { setMeldung(`${SR_NAME}: kein Streifenende in der Nähe – nahe an ein Ende (Wartebereich) klicken.`); return }
    let wahl = kand[0]
    const andere = kand.find(x => x.e === wahl.e && x.k !== wahl.k)
    if (andere && Math.abs(andere.d - wahl.d) < dist(wahl.e.rand[0], wahl.e.rand[1]) / 3 && !vorschlag(wahl.e, wahl.k).park &&
      vorschlag(andere.e, andere.k).park) wahl = andere
    const { e, k } = wahl
    const v = vorschlag(e, k)
    if (v.insel) { setMeldung(`${SR_NAME}: dieses Ende liegt an einer Insel – das Ende am Trottoir wählen.`); return }
    const da = (fall.flaechenPlan ?? []).find(x => seitenraumStandard(x) && abstandPunkt([[x.ring]], e.rand[k]) <= 1)
    if (da) { setMeldung(`${SR_NAME}: an diesem Ende liegt schon einer (${planTitel(da.id)}); Masse dort unter «Flächen (Plan)» ändern.`); return }
    const st = seitenraumKennung(naechsteSrGruppe(fall.flaechenPlan), v.lage, v.masse)
    const fe = srMasseFehler(st)
    if (fe) { setMeldung(`${SR_NAME} nicht eingefügt: ${fe}`); return }
    // Überlappung mit anderen Flächen (Plan): Mittelinsel bzw. anderer Seitenraum abweisen, übrige melden (der Seitenraum gilt dort)
    const ring = seitenraumRing(st, st)
    const ueber = (fall.flaechenPlan ?? []).filter(x => { try { return flaeche(schnitt([[ring]], [[x.ring]])) > 0.05 } catch { return false } })
    const sperrt = ueber.find(x => x.standard)
    if (sperrt) { setMeldung(`${SR_NAME} nicht eingefügt: überlappt ${planTitel(sperrt.id)} (${inselStandard(sperrt) ? 'Mittelinsel' : SR_NAME}).`); return }
    // Fahrbahn entlang der Achse vorher und nachher (Sehne durch die Streifenmitte)
    const breiteFb = (f: Fahrbahn) => { const sh = f.sehne(e.m, einheitP(sub(e.p1, e.p0))); return sh ? sh[0] + sh[1] : null }
    const fbVor = breiteFb(fb), fbNach = breiteFb(new Fahrbahn(avMitPlan(av, [...(fall.flaechenPlan ?? []),
      { id: 'neu', art: 'trottoir', ring, standard: st }]).av))
    const ende = k === 0 ? 'p0' as const : 'p1' as const
    const einfuegen = (f: Fall) => {
      const id = naechstePlanId(f)
      f.flaechenPlan = [...(f.flaechenPlan ?? []), { id, art: 'trottoir', ring: seitenraumRing(st, st), standard: st }]
      const h = f.streifenHand.find(x => x.id === e.fgsId)
      const q = h ? endeAnLinie(h, ende, kanteLinie(st, st, true)) : null
      if (h && q) { h[ende] = q; h.angepasst = true }
      return { id, hand: !!q }
    }
    const { id, hand } = einfuegen(structuredClone(fall))
    aendern(f => { einfuegen(f); return f })
    setWerkzeug(null)
    const titelS = fall.streifenHand.length ? streifenTitel(e.fgsId, fall.streifenHand) : `Streifen ${e.fgsId}`
    const text = `${SR_NAME} als ${planTitel(id)} (Trottoir) an ${titelS}, Ende ${k ? 'B' : 'A'}: ` +
      (v.park && v.park.quelle === 'parkierung' ? `Parkstreifen ${f2(st.tiefePark)} m aus der Parkierung (${v.park.ids.length} Feld(er)` +
        `${v.park.versetzt ? '; Bordkante versetzt (Nase/Bucht): Tiefe gegen die Kante am Streifen gemessen, bitte prüfen' : ''})` :
        v.park ? `Parkstreifen ${f2(st.tiefePark)} m nur aus OSM-Vorschlägen (Lage angenommen) – prüfen` :
        `keine Parkierung gefunden – Parkstreifen ${f2(SR_PARK_TIEFE_M)} m angenommen; ohne Längsparkierung wirkt das Element wie eine ` +
        'seitliche Einengung') +
      ` + ${f2(SR_UEBERSTAND_M)} m, Länge ${f2(st.breite + st.randA + st.randB)} m` +
      (fbNach !== null ? `; Fahrbahn entlang der Achse ${fbVor !== null ? `${f2(fbVor)} → ` : ''}${f2(fbNach)} m` : '') + '.' +
      (ueber.length ? ` Überlappt ${ueber.map(x => planTitel(x.id)).join(', ')}: dort gilt der Seitenraum (später gezeichnet).` : '') +
      (e.randQuelle !== 'AV' ? ' Bordkante dort angenommen (keine AV-Sehne): Lage prüfen.' : '') +
      (hand ? ` Streifenende an die neue Bordkante gesetzt.` : '') + ' Masse unter «Flächen (Plan)» änderbar.'
    setMeldung(text)
    setSrPruef({ id, fgsId: e.fgsId, text })
  }
  // nach der Rechnung mit dem neuen Element: Hinweis, wenn der Streifen verdeckt bleibt
  const [srPruef, setSrPruef] = useState<{ id: string; fgsId: string; text: string } | null>(null)
  useEffect(() => {
    if (!srPruef || !rechnung || !rechnungFall?.flaechenPlan?.some(x => x.id === srPruef.id)) return
    const s = rechnung.streifen.find(x => x.fgsId === srPruef.fgsId) ?? rechnung.streifen[0]
    setMeldung(srPruef.text + (s?.status === 'verdeckt' ? ' Der Streifen bleibt «verdeckt»: der Seitenraum allein genügt hier nicht ' +
      '(weitere Hindernisse im Sichtfeld) – Zufahrten prüfen, Länge bzw. weitere Massnahmen erwägen.' : s ? ` Status jetzt «${s.status}».` : ''))
    setSrPruef(null)
  }, [srPruef, rechnung, rechnungFall])
  // Fangen der Ecken einer Fläche (Plan): AV-Stützpunkte und Ecken der übrigen Plan-Flächen (ohneId: die eben bearbeitete)
  const planFangen = (p: P, ohneId: string | null): P => fangen(p, [...(av ?? []), ...planAlsAv(fall?.flaechenPlan, ohneId)], fangRadius()).p
  const klick = useCallback((p: P) => {
    if (werkzeug === 'messen') { const q = messPunkt(p, av ?? [], fangRadius()); setMessung(m => messKlick(m, q)); return }
    if (werkzeug === 'eckeRunden') { eckeRundenBei(p); return }
    if (werkzeug === 'mittelinsel') { mittelinselBei(p); return }
    if (werkzeug === 'seitenraum') { seitenraumBei(p); return }
    if (werkzeug === 'baum' || werkzeug === 'fixpunkt') { fertig([p]); return }
    if (werkzeug === 'planflaeche') p = planFangen(p, null)
    // Enden eines Streifens bzw. einer Trottoirüberfahrt fangen auf AV-Stützpunkte (auch der Vorschau; 27.10.2026)
    if (werkzeug === 'streifen' || werkzeug === 'tue') p = fangen(p, av ?? vorschau.current?.stand?.av ?? [], fangRadius()).p
    const neu = [...zeichnungRef.current, p]
    zeichnungRef.current = neu
    if ((werkzeug === 'streifen' || werkzeug === 'tue') && neu.length === 2) { fertig(neu); return }
    setZeichnung(neu)
  }, [werkzeug, fertig, av, fall, bearbeiten, rundenR, inselOrt, inselK, inselStreifen, inselNetz, inselFahrbahn, rechnung])

  const doppelklick = useCallback(() => {
    if (werkzeug === 'eckeRunden' || werkzeug === 'mittelinsel' || werkzeug === 'seitenraum' || werkzeug === 'messen') return
    // Doppelklick setzt zwei Klicks ab: den doppelten letzten Punkt weglassen
    const z = zeichnungRef.current
    const pts = z.length >= 2 && dist(z[z.length - 1], z[z.length - 2]) < 0.3 ? z.slice(0, -1) : z
    fertig(pts)
  }, [fertig, werkzeug])

  // Fixpunkte, die verschoben wurden, solange die AV fehlte (Laden läuft): nach dem Laden fangen (Id -> Lage beim Verschieben;
  // gefangen wird nur, wenn der Fixpunkt noch dort liegt, sonst gilt der Eintrag als erledigt)
  const fangOffen = useRef(new Map<string, P>())
  const ecke = useCallback((id: string, i: number, p: P) => {
    geaendert.current = id
    if (fall?.fixpunkte?.some(x => x.id === id) && !av) {
      // ohne AV kein Fangen: Lage übernehmen, Art behalten (nicht zum «freien Punkt» machen), nach dem Laden fangen
      fangOffen.current.set(id, p)
      aendern(f => { const fp = f.fixpunkte?.find(x => x.id === id); if (fp) fp.p = p; return f })
      setMeldung('Fixpunkt verschoben, während die Daten laden: er wird nach dem Laden auf die AV gefangen.')
      return
    }
    // Fixpunkt verschoben: wieder auf die AV fangen (gerechnet für jeden Griff, verwendet nur beim Fixpunkt)
    const g = fangen(p, av ?? [], fangRadius())
    // Ecke einer Fläche (Plan): auf AV bzw. andere Plan-Flächen fangen (ohne AV: wie geklickt)
    const pp = fall?.flaechenPlan?.some(x => x.id === id) ? planFangen(p, id) : p
    // Trottoirüberfahrt (27.10.2026): Ende fängt auf die AV wie beim Zeichnen; Augen von Hand bleiben nur, wenn sie zur verschobenen
    // Überfahrt noch passen (sonst wieder gerechnet, mit Meldung)
    const s0 = fall?.streifenHand.find(x => x.id === id)
    const tue = !!fall && !!s0 && istTrottoirueberfahrt(fall, id)
    const q = tue ? fangen(p, av ?? [], fangRadius()).p : p
    const augen = tue && s0 && fall?.streifen[id] ? augenNachVerschieben(fall.streifen[id], i === 0 ? { p0: q, p1: s0.p1 } : { p0: s0.p0, p1: q }) : null
    aendern(f => {
    const fp = f.fixpunkte?.find(x => x.id === id)
    if (fp) { fp.p = g.p; fp.art = g.art; if (g.avArt) fp.avArt = g.avArt; else delete fp.avArt; return f }
    const pl = f.flaechenPlan?.find(x => x.id === id)
    if (pl) {
      const ring = [...pl.ring]; ring[i] = pp
      // ungültig (z. B. Ecke auf die Nachbarecke gezogen): Fläche bleibt wie sie war
      const ok = planRingPruefen(ring)
      if (ok) pl.ring = ok
      return f
    }
    const h = f.hindernisse.find(x => x.id === id)
    if (h) {
      if (h.art === 'parkfeld') h.ring[i] = p
      else if (h.art === 'baum') h.p = p
      else if (h.art === 'laengsparkierung') h.linie[i] = p
      else if (h.ring) h.ring[i] = p
      else if (h.linie) h.linie[i] = p
      if (h.quelle !== 'hand' && !(h.name ?? '').endsWith(' (angepasst)')) h.name = (h.name ?? '') + ' (angepasst)'
    }
    const s = f.streifenHand.find(x => x.id === id)
    if (s) {
      if (i === 0) s.p0 = q; else s.p1 = q
      s.angepasst = true
      if (augen && f.streifen[id]) f.streifen[id] = augen.e
    }
    return f
  })
  if (augen?.zurueck.length) setMeldung(`Überfahrt verschoben: Auge von Hand (Phase ${augen.zurueck.join(' und ')}) passt nicht mehr und ist wieder gerechnet.`)
  }, [aendern, av, fall])
  // nach dem Laden: die beim Laden verschobenen Fixpunkte fangen
  useEffect(() => {
    if (!av || !fangOffen.current.size) return
    const offen = new Map(fangOffen.current)
    fangOffen.current.clear()
    const r = fangRadius()
    aendern(f => {
      for (const [id, p] of offen) {
        const fp = f.fixpunkte?.find(x => x.id === id)
        if (!fp || fp.p[0] !== p[0] || fp.p[1] !== p[1]) continue
        const g = fangen(p, av, r)
        fp.p = g.p; fp.art = g.art
        if (g.avArt) fp.avArt = g.avArt; else delete fp.avArt
      }
      return f
    })
  }, [av, aendern])

  // ---------------------------------------------------------------- Fixpunkte (Vermassung ab Fixpunkt, fixpunkt.ts)
  /** Länge von FANG_PX Bildschirmpunkten in Metern beim aktuellen Zoom (Mitte der Karte), höchstens FANG_MAX_M */
  function fangRadius(): number {
    const map = kartenRef.current
    if (!map) return fangRadiusM(Infinity)
    const c = map.getCenter(), pt = map.latLngToContainerPoint(c)
    return fangRadiusM(map.distance(c, map.containerPointToLatLng([pt.x + FANG_PX, pt.y])))
  }
  /** Fixpunkt am Klick: auf die AV gefangen bzw. frei (Meldung) */
  function fixpunktSetzen(p: P, art?: Fixpunkt['art']) {
    const g = art ? { p, art } : fangen(p, av ?? [], fangRadius())
    aendern(f => { f.fixpunkte = [...(f.fixpunkte ?? []), { id: naechsteFixId(f), ...g }]; return f })
    setMeldung(g.art === 'frei' ? `Fixpunkt gesetzt: freier Punkt, nicht aus der AV (kein AV-Stützpunkt im Umkreis von ${FANG_PX} ` +
      'Bildschirmpunkten). Zum Fangen näher heranzoomen bzw. genauer auf die Ecke klicken.' :
      `Fixpunkt gesetzt: ${fixpunktName(g)} (gefangen). Bezeichnung unter «Fixpunkte» änderbar.`)
  }

  const werkzeugWaehlen = (w: Werkzeug) => {
    setZeichnung([]); setBearbeiten(null); setMessung(null); setWerkzeug(x => (x === w ? null : w))
  }
  /** Knopf der Gruppe Planen; «Ecke runden» nimmt die gewählte Fläche (Plan), sonst die zuletzt gezeichnete (Wahl in der Hilfe) */
  const planWaehlen = (w: Exclude<Werkzeug, null>) => {
    if (w !== 'eckeRunden') { werkzeugWaehlen(w); return }
    setZeichnung([]); zeichnungRef.current = []; setSpurFuer(null); setRundenFehler(null); setRundenAngebot(null)
    if (werkzeug === 'eckeRunden') { setWerkzeug(null); setBearbeiten(null); return }
    const plan = fall?.flaechenPlan ?? []
    setBearbeiten(plan.some(x => x.id === bearbeiten) ? bearbeiten : plan[plan.length - 1]?.id ?? null)
    setWerkzeug('eckeRunden')
  }
  /** Werkzeug beenden (Esc): Zeichnung verwerfen, wie «Abbrechen» bzw. «fertig» in der Werkzeughilfe */
  const werkzeugBeenden = useRef<() => void>(() => {})
  werkzeugBeenden.current = () => {
    if (!werkzeug) return
    if (werkzeug === 'eckeRunden') { setBearbeiten(null); setRundenFehler(null); setRundenAngebot(null) }
    if (werkzeug === 'mittelinsel') setInselOrt(null)
    setMessung(null)
    setZeichnung([]); zeichnungRef.current = []; setSpurFuer(null); setWerkzeug(null)
  }
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // Esc in einem Eingabefeld gehört dem Feld (TextFeld, Ortssuche: Text zurücksetzen bzw. Liste schliessen)
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      werkzeugBeenden.current()
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [])

  // ---------------------------------------------------------------- Planung: Streifen von Hand ohne OSM-Übergang (16.10.2026)
  /** Neuer Fall am gezeichneten Streifen (nur dieser Streifen, ohne OSM-Übergang); die Karte bleibt, wo sie ist. reicht: weitester
   * Punkt des Streifens vom bisherigen Ladeort (null ohne geladenen Ort) */
  const planFall = (neu: { p0: P; p1: P; breite: number }, reicht: number | null, tue = false) => {
    // liegt der Streifen in der Abdeckung der AV-Vorschau, lädt der Fall an ihrer Mitte und nimmt sie als AV (27.10.2026)
    const vs = fall ? null : vorschau.current?.fuer([neu.p0, neu.p1]) ?? null
    const m0 = vs ? vs.mitte : streifenMitte(neu)
    const [lat, lon] = wgs(m0[0], m0[1])
    const f = leererFall(lat, lon, null)
    const id = naechsteHandId(f)
    f.streifenHand.push({ id, ...neu, herkunft: 'gezeichnet' })
    if (tue) f.streifen[id] = { typ: 'trottoirueberfahrt' }
    const bisher = fall && hatEingaben(fall) ? fall.ort.uebergang : null
    setGewaehlt(null); setGespeichert(null); neuerFallImOrt(); reiterNeu()
    laden(lat, lon, null, f, vs?.abruf ?? null)
    const weit = reicht !== null ? ` (reicht bis ${abstandText(reicht)} vom bisherigen Ort)` : ''
    setLadeHinweis({ text: `Neuer Fall am geplanten ${streifenTitel(id)}${weit}: AV, OSM und Kataster werden um den Streifen geladen.` +
      (bisher !== null ? ` Der bisherige Fall bleibt beim OSM-Übergang ${bisher} im Browser gemerkt.` : ''), verwerfen: false })
  }
  /** Daten um die Streifen von Hand neu laden, der Fall bleibt (Ort aus dem Entscheid; OSM-Übergang nur, wenn noch abgedeckt –
   * sonst gehört der Fall nicht mehr zum Übergang: er kommt unter «fgsCheck.fall.ort» (liegt dort ein anderer Fall, nach
   * Rückfrage), danach entfernt merken den Eintrag des Übergangs) */
  const nachladen = (f: Fall, e: OrtEntscheid) => {
    const neu = ortVerlegen(f, e)
    if (neu.ort.uebergang === null) setGewaehlt(null)
    if (neu.ort.uebergang === null && f.ort.uebergang !== null) { neuerFallImOrt(); ortVergessen.current = f.ort.uebergang }
    const b = bearbeiten
    laden(neu.ort.lat, neu.ort.lon, neu.ort.uebergang, neu)
    if (b && neu.streifenHand.some(x => x.id === b)) setBearbeiten(b)      // «verschieben» bleibt offen
    setLadeHinweis({ text: nachladenText(e, 'geaendert', f.ort.uebergang, f.streifenHand.length, id => streifenTitel(id, f.streifenHand)),
      verwerfen: false })
  }
  // Streifen von Hand ausserhalb der Abdeckung um den Ladeort; gemeldet beim Streifen (Panel, Bericht), gesammelt nur die ohne
  // eigenes Ergebnis in der Rechnung (z. B. während sie läuft) – jeder Hinweis nur einmal
  const ausserhalb = useMemo(() => (fall && daten ? nichtAbgedeckt(fall.streifenHand, daten.ort) : []), [fall, daten])
  const ausserhalbOhne = ausserhalb.filter(x => !rechnung?.streifen.some(s => s.fgsId === x.id))
  /** um einen Streifen von Hand neu laden (Knopf im Hinweis «ausserhalb der geladenen Daten») */
  const umStreifenLaden = (id: string) => {
    if (!fall || !daten) return
    const e = ortEntscheid(fall.streifenHand, daten.ort, { bezug: id, querung: querungLage })
    if (e.nachladen) nachladen(fall, e)
  }
  // nach dem Verschieben eines Endes, dem Ändern der Breite bzw. einem neu gezeichneten Streifen («dazu»): liegen die Streifen
  // von Hand nicht mehr alle in der Abdeckung, neu laden (um alle bzw. um diesen Streifen, abdeckung.ortEntscheid)
  useEffect(() => {
    const id = geaendert.current
    if (!id || !fall || !daten) return
    geaendert.current = null
    if (id !== NEU_GEZEICHNET && !fall.streifenHand.some(x => x.id === id)) return
    const e = ortEntscheid(fall.streifenHand, daten.ort, { bezug: id === NEU_GEZEICHNET ? null : id, querung: querungLage })
    if (e.nachladen) nachladen(fall, e)
  }, [fall, daten, querungLage])

  // ---------------------------------------------------------------- Fall-Datei
  /** Fall als JSON-Datei herunterladen (offener Fall mit Ergebnis-Auszug bzw. der im Browser gemerkte ohne) */
  const herunterladen = (f: Fall, ergebnis: FallErgebnis | null) => {
    const blob = new Blob([fallSchreiben(f, ergebnis)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `fgsCheck_${f.ort.uebergang ?? 'ort'}_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const speichern = () => {
    if (!fall) return
    // als gesichert gilt der Inhalt der Eingaben zum Zeitpunkt des Speicherns (ein abgebrochener Download bleibt unerkannt)
    setGespeichert(eingabenSchluessel(fall))
    const ergebnis: FallErgebnis | null = rechnung ? { hinweis: rechnung.hinweis, luftbild: rechnung.luftbild?.befund,
      streifenQuelle: rechnung.streifenQuelle, streifen: rechnung.streifen.map(s => ({
      fgsId: s.fgsId, status: s.status,
      zufahrten: s.zufahrten.map(z => ({ zufahrt: z.zufahrt, status: z.status, tempo: z.tempo, sichtweite: z.sichtweite,
        ...(z.deckung ? { gedeckt: true as const } : {}) })) })) } : null
    herunterladen(fall, ergebnis)
  }
  /** Rückfrage «anderer Fall im Browser» (ortKonflikt): der offene Fall ersetzt den gemerkten */
  const ortErsetzen = () => {
    setOrtKonflikt(null)
    if (!fall) return
    ortEigen.current = true
    merken(fall)
  }
  /** Fall öffnen (Fall-Datei bzw. letzter Fall ohne Übergang aus dem Browser). Streifen von Hand ausserhalb der Abdeckung um den
   * gespeicherten Ort: Ort verlegen (abdeckung.fallAmStreifen); den Übergang prüft die App nach dem Laden mit der Lage aus OSM.
   * titel: Anfang des Hinweises; datei: aus einer Datei geladen (gilt dann als gesichert) */
  const fallOeffnen = (f0: Fall, hinweise: string[], titel: string, datei: boolean) => {
    const { fall: f, hinweis: ortHinweis } = fallAmStreifen(f0)
    kartenRef.current?.setView([f.ort.lat, f.ort.lon], 19)
    // Lage des Übergangs vorläufig der gespeicherte Ort (Tags fehlen); nach dem Laden aus OSM nachgeführt
    setGewaehlt(f.ort.uebergang !== null ? { id: f.ort.uebergang, lat: f0.ort.lat, lon: f0.ort.lon, tags: {} } : null)
    setGespeichert(datei ? eingabenSchluessel(f) : null)
    neuerFallImOrt(); reiterNeu()
    laden(f.ort.lat, f.ort.lon, f.ort.uebergang, f)
    // nach dem Start von laden (setzt den Hinweis zurück); ein späterer Hinweis (Übergang ausserhalb) wird angehängt
    setLadeHinweis({ text: `${titel} (${eingabenZahl(f)} Eingaben)` +
      (hinweise.length ? `; ${hinweise.length} ungültige Einträge übergangen (${[...new Set(hinweise)].join('; ')}).` : '.') +
      (ortHinweis ? ` ${ortHinweis}` : ''), verwerfen: false })
  }
  /** Fall-Datei gewählt: lesen, dann (bei ungesichertem Fall ohne Übergang nach Bestätigung) öffnen */
  const dateiGewaehlt = async (datei: File) => {
    let f0: Fall, hinweise: string[]
    try { [f0, hinweise] = fallLesen(await datei.text()) } catch (e) { setMeldung(`Fall-Datei nicht lesbar: ${(e as Error).message}`); return }
    wechseln(`Fall-Datei «${datei.name}» laden: der bisherige Fall wird ersetzt.`, 'Datei laden',
      () => fallOeffnen(f0, hinweise, `Fall «${datei.name}» geladen`, true), fallAmStreifen(f0).fall.ort.uebergang === null)
  }
  /** Letzten Fall ohne Übergang aus dem Browser wiederherstellen («fgsCheck.fall.ort», S1) */
  const ortWiederherstellen = () => {
    const f0 = fallErinnern('ort')
    if (!f0) { setMeldung('Kein gemerkter Fall ohne OSM-Übergang (mehr) im Browser.'); return }
    wechseln('Letzten geplanten Fall wiederherstellen: der bisherige Fall wird ersetzt.', 'wiederherstellen',
      () => fallOeffnen(f0, [], `Letzten Fall ohne OSM-Übergang aus dem Browser wiederhergestellt (Stand ${f0.gespeichert?.slice(0, 10) ??
        'unbekannt'})`, false))
  }

  const schliessenBericht = useCallback(() => setBericht(false), [])
  // anderer Ort bzw. keine Rechnung mehr: Bericht schliessen
  useEffect(() => { if (!rechnung) setBericht(false) }, [rechnung])

  // gewählter Übergang immer dabei, auch wenn sein Ausschnitt aus dem Cache der Suche gefallen ist
  const sichtbar = useMemo(() => {
    const l = nurMarkiert ? uebergaenge.filter(k => istFgs(markierung(k.tags)) || k.id === gewaehlt?.id) : uebergaenge
    // ein gewählter Übergang aus dem Luftbild (negative Kennung) steht in der eigenen Ebene (lbKandidaten), nicht bei den OSM-Übergängen
    return gewaehlt && gewaehlt.id > 0 && !l.some(k => k.id === gewaehlt.id) ? [...l, gewaehlt] : l
  }, [uebergaenge, nurMarkiert, gewaehlt])
  // Streifen aus dem Luftbild (ETH-Modell): in abgesuchten Ausschnitten, ohne OSM-Übergang in 15 m; der gewählte immer dabei
  const lbHerkunft = fall?.ort.herkunft, lbId = fall?.ort.uebergang ?? null
  const lbKandidaten = useMemo(() => {
    const l = kandidatenAnzeigen(lbSnaps, suchBoxen, uebergaenge)
    if (!lbHerkunft || lbId === null || lbId >= 0 || l.some(k => k.id === lbId)) return l
    const [lat, lon] = wgs(lbHerkunft.p[0], lbHerkunft.p[1])
    return [...l, { id: lbId, p: lbHerkunft.p, conf: lbHerkunft.conf, jahre: lbHerkunft.jahre, richtung: lbHerkunft.richtung, lat, lon,
      flug: flugText(lbHerkunft.jahre, Object.assign({}, ...lbSnaps.map(x => x.bildJeJahr))) }]
  }, [lbSnaps, suchBoxen, uebergaenge, lbHerkunft, lbId])
  const verwaist = useMemo(() => (fall && rechnung && rechnungFall === rechenFall ? eingabenVerwaist(fall, rechnung.streifen) : []),
    [fall, rechnung, rechnungFall, rechenFall])
  // «Geladene Quellen» eingeklappt; hat eine Quelle einen Fehler, klappt der Abschnitt auf (und die Überschrift nennt ihn)
  const quellenFehler = Object.values(quellen).some(q => q.fehler)
  const [quellenOffen, setQuellenOffen] = useState(false)
  useEffect(() => { if (quellenFehler) setQuellenOffen(true) }, [quellenFehler])
  const kantone = useMemo(() => [...new Set((av ?? []).map(f => f.kanton).filter(Boolean))].sort(), [av])
  // Planen ohne geladenen Ort: AV-Vorschau um die Kartenmitte (avVorschau.ts), beim Werkzeug an und nach dem Verschieben (verzögert)
  const planOhneOrt = (werkzeug === 'streifen' || werkzeug === 'tue') && !(fall && daten)
  const planOhneOrtRef = useRef(planOhneOrt)
  planOhneOrtRef.current = planOhneOrt
  const vorschauTimer = useRef<number | undefined>(undefined)
  const vorschauPruefen = useCallback(() => {
    const map = kartenRef.current
    if (!map) return
    const c = map.getCenter()
    void vorschau.current!.aktualisieren(planOhneOrtRef.current, lv95(c.lat, c.lng), map.getZoom())
  }, [])
  useEffect(() => { vorschauPruefen() }, [planOhneOrt, vorschauPruefen])
  const vs = planOhneOrt ? vorschau.current!.stand : null
  const avKarte = av ?? vs?.av ?? null
  const kantoneKarte = useMemo(() => [...new Set((avKarte ?? []).map(f => f.kanton).filter(Boolean))].sort(), [avKarte])
  const vorschauHinweis = planOhneOrt && vorschau.current!.hinweis ? { text: vorschau.current!.hinweis } : null
  // Strassennamen für die Karte ohne eigenen Abruf: vor dem Klick die Wegmitten aus der Übergangssuche (alle Ausschnitte im
  // Cache), nach dem Klick im Umkreis OSM_RADIUS_M um den Übergang vorrangig die genaueren aus dem Umkreis-Abruf (Wegmitten aus
  // der Geometrie); je Name höchstens eine Beschriftung pro rund 120 m (daten/osm.namenKarte)
  const osmRoh = daten?.osm, osmOrt = daten?.ort
  const namen = useMemo(() => namenKarte(namenAusschnitt, osmRoh && osmOrt ? strassennamen(osmRoh, osmOrt, OSM_RADIUS_M) : [],
    osmRoh && osmOrt ? osmOrt : null, OSM_RADIUS_M), [namenAusschnitt, osmRoh, osmOrt])
  const alleZ = useMemo(() => rechnung?.streifen.flatMap(s => s.zufahrten) ?? [], [rechnung])
  // Anzeige (benennung.ts): Streifen von Hand mit Namen bzw. «Streifen 1», Zufahrten nach Strasse und Herkunft statt Gradzahl
  const osmWegNamen = useMemo(() => wegNamen(daten?.osm), [daten])
  const zNamen = useMemo(() => new Map((rechnung?.streifen ?? []).map(s => [s.fgsId, zufahrtNamen(s, w => osmWegNamen.get(w) ?? null)])),
    [rechnung, osmWegNamen])
  const handListe = fall?.streifenHand
  // Trottoirüberfahrt (27.10.2026): «Trottoirüberfahrt 1» statt «Streifen 1»
  const streifenWahl = fall?.streifen
  const titel = useCallback((id: string) => streifenTitel(id, handListe ?? [], streifenWahl?.[id]?.typ === 'trottoirueberfahrt' && !streifenWahl[id]?.keinFgs),
    [handListe, streifenWahl])
  // Bedarfsmodul E1: Ebenen nach dem Ort (BFS bzw. Kanton der AV-Fläche an der Streifenmitte, sonst aller geladenen AV-Flächen)
  const bedarfVorgabe = useMemo(() => {
    const m = rechnung?.streifen[0]?.m
    const f = m ? (av ?? []).find(x => x.art === 'Strasse_Weg' && imPolygon(m, x.ringe)) : undefined
    return f ? ebenenVorgabe([f.bfs], f.kanton ? [f.kanton] : []) : ebenenVorgabe(daten?.bfs ?? [], kantone)
  }, [rechnung, av, daten, kantone])
  // Geodaten für die Vorbelegung (Haltestellen, Verkehrsdaten, OSM-Tags der Wege, Strassenlampen) um den Ladeort
  // Berner Daten nur, wenn der Streifen auf einer AV-Fläche der Stadt Bern liegt (Korrektur M4, wie die Ebenen-Vorgabe)
  const streifenBern = useMemo(() => bernZustaendig(rechnung?.streifen[0]?.m ?? daten?.ort, av ?? []), [rechnung, daten, av])
  const geoVor = useMemo<GeoVorbelegung>(() => {
    if (!daten) return {}
    const halte = streifenBern && bernGeo && bernGeo.nr === ladeNr.current ? bernGeo.halte : null
    const vd = streifenBern && bernGeo && bernGeo.nr === ladeNr.current ? bernGeo.vd : null
    const c = streifenBern && bernGeo && bernGeo.nr === ladeNr.current ? bernGeo.c : null
    const bq = { mitte: daten.ort, radiusM: PARK_RADIUS_M, form: 'quadrat' as const }
    return {
      haltestellen: haltestellenStand(halte, daten.osm, daten.ort, PARK_RADIUS_M),
      verkehrsdaten: vd && 'linien' in vd ? { linien: vd.linien, bereich: { mitte: daten.ort, radiusM: PARK_RADIUS_M, form: 'quadrat' } }
        : vd && 'fehler' in vd ? { fehler: vd.fehler } : null,
      osmTags: wegTags(daten.osm),
      lampen: { punkte: strassenlampen(daten.osm), bereich: { mitte: daten.ort, radiusM: LAMPEN_RADIUS_M, form: 'kreis' } },
      // Automatik Paket A + B (bedarf/automatik.ts): geparstes OSM-Netz, AV, Ladeort und Umkreis der OSM-Abfrage
      osm: daten.osm ? osmParsen(daten.osm as Parameters<typeof osmParsen>[0]) : null,
      av: av ?? null, ladeort: daten.ort, osmRadiusM: OSM_RADIUS_M,
      // Automatik Paket C: weitere Berner Dienste (nur am Berner Streifen) und OSM-Erweiterungen (überall); nur Daten, Regeln in vorbelegung.ts
      richtplan: c ? bernErgebnis(c.richtplan, bq) : null,
      strassenhierarchie: c ? bernErgebnis(c.strassenhierarchie, bq) : null,
      vsig: c ? bernErgebnis(c.vsig, bq) : null,
      schulen: schulenStand(c?.schulen ?? null, daten.osm, daten.ort, BERN_DIENSTE_C.schulen.radiusM ?? PARK_RADIUS_M),
      taktil: c ? bernErgebnis(c.taktil, bq) : null,
      nutzungszonen: c ? bernErgebnis(c.nutzungszonen, bq) : null,
      oevLinien: c ? bernErgebnis(c.oevLinien, bq) : null,
      vortritt: { zeichen: vortrittsZeichen(daten.osm), bereich: { mitte: daten.ort, radiusM: OSM_RADIUS_M, form: 'kreis' } },
      kurveNeigung: kurveNeigung && kurveNeigung.nr === ladeNr.current ? kurveNeigung.werte : null,
    }
  }, [daten, bernGeo, streifenBern, av, kurveNeigung])
  const blaetter = useMemo(() => (fall && rechnung && rechnung.streifen.length ? befundblaetter(rechnung, fall, { vorgabe: bedarfVorgabe,
    titel, zufahrt: (fid, z) => zufahrtText(zNamen.get(fid), z), geo: geoVor, ...(alternative ? { alternative } : {}) }) : []),
  [fall, rechnung, bedarfVorgabe, titel, zNamen, geoVor, alternative])
  // Reiter: Vorgabe nach dem Fall (bestehender Übergang mit Streifen → Sichtprüfung, Planung → Bedarf), sobald Bedarfsblätter da
  // sind; die Vorgabe der ersten Rechnung gilt im Fall weiter (kein Springen, wenn später ein Streifen von Hand dazukommt)
  const mitReitern = !!fall && blaetter.length > 0
  const vorgabeReiter = reiterVorgabe({ uebergang: fall?.ort.uebergang ?? null, streifenQuelle: rechnung?.streifenQuelle ?? null,
    markierung: rechnung?.markierung ?? fall?.ort.markierung ?? null, herkunft: fall?.streifenHand.map(s => s.herkunft) })
  const reiter = reiterAktiv(reiterWahl, vorgabeReiter)
  useEffect(() => { if (mitReitern && reiterWahl === null) setReiterWahl(vorgabeReiter) }, [mitReitern, reiterWahl, vorgabeReiter])
  // Sprünge in einen verborgenen Reiter (Ereignis aus reiter.reiterZeigen) zeigen ihren Reiter
  useEffect(() => {
    const auf = (e: Event) => { const r = (e as CustomEvent<Reiter>).detail; if (r === 'sicht' || r === 'bedarf') reiterWaehlen(r) }
    window.addEventListener(REITER_EREIGNIS, auf)
    return () => window.removeEventListener(REITER_EREIGNIS, auf)
  }, [reiterWaehlen])
  const bedarfStaende = blaetter.map(b => reiterStand(b.befund))
  const bedarfZustand = mitReitern ? reiterZustand(bedarfStaende) : null
  // Klick auf eine Zufahrt bzw. ein Hindernis auf der Karte (ausserhalb der Werkzeuge): Liste und Detail stehen in der Sichtprüfung
  const zurSicht = () => { if (mitReitern && reiter === 'bedarf') reiterWaehlen('sicht') }
  const zeigeBedarf = useCallback(() => reiterWaehlen('bedarf'), [reiterWaehlen])
  const gewaehlteZ: ZufahrtErgebnis | null = useMemo(() => alleZ.find(z => zufahrtKey(z) === auswahl) ?? null, [alleZ, auswahl])
  const vorschlagOsm = (rechnung?.vorschlaege ?? []).filter(v => v.hindernis.quelle === 'osm')
  const katBaeume = (rechnung?.vorschlaege ?? []).filter(v => v.hindernis.quelle === 'kataster' && v.hindernis.art === 'baum')
  const katPark = (rechnung?.vorschlaege ?? []).filter(v => v.hindernis.quelle === 'kataster' && v.hindernis.art === 'parkfeld')
  const parkKlasseZahl = (kl: string) => katPark.filter(v => v.hindernis.art === 'parkfeld' && v.hindernis.klasse === kl).length
  const parkVerworfen = fall && parkKat ? Object.keys(fall.vorschlaege).filter(id => istParkId(id, parkKat.quelle)) : []
  const parkAn = !!fall && fall.parkkataster !== false
  const parkGewaehlt = bearbeiten ? katPark.find(v => v.id === bearbeiten) ?? null : null
  const parkZurueck = bearbeiten ? rechnung?.parkVerworfen.find(v => v.id === bearbeiten) ?? null : null
  // Parkierung im Fall, die sich mit amtlichen Feldern deckt (im Worker gerechnet, rechner/vorschlaege.doppeltAmtlich)
  const doppelt = useMemo(() => new Set(rechnung?.doppelt ?? []), [rechnung])
  const doppeltIds = useMemo(() => (fall ? fall.hindernisse.filter(h => doppelt.has(h.id)).map(h => h.id) : []), [fall, doppelt])
  // Parkierung unter einem vorgezogenen Seitenraum (Rechnung): entfällt ganz bzw. zum überdeckten Teil (Eintrag bleibt)
  const srErsetzt = useMemo(() => new Map((rechnung?.seitenraumErsetzt ?? []).map(x => [x.id, x.ganz])), [rechnung])
  const srErsetztText = (id: string) => (srErsetzt.has(id) ? ` – ${SR_ERSETZT}${srErsetzt.get(id) ? '' : ' (zum überdeckten Teil)'}` : '')

  // Vermassung ab Fixpunkt: gerechnete Streifen von Hand (mit Vermassung), Vorschläge je Streifen (nächste Gebäudeecke je
  // Strassenseite, ohne schon gesetzte Fixpunkte), Masslinien je Fixpunkt zum nächsten Streifen (Karte)
  const handStreifen = useMemo(() => (rechnung?.streifenQuelle === 'hand' ? rechnung.streifen.filter(s => s.vermassung) : []), [rechnung])
  const fixListe = fall?.fixpunkte
  const fixVorschlag = useMemo(() => new Map(handStreifen.map(s => [s.fgsId, fixpunktVorschlaege(s, av ?? [])
    .filter(v => !(fixListe ?? []).some(f => dist(f.p, v.p) < 0.01))])), [handStreifen, av, fixListe])
  const masslinien = useMemo<Masslinie[]>(() => (fixListe ?? []).flatMap(f => {
    const s = naechsterStreifen(f.p, handStreifen)
    if (!s) return []
    const m = fixpunktMasse(f.p, { p0: s.p0, p1: s.p1, breite: s.bw, umriss: s.umriss })
    return m.aufHoehe ? [] : [{ von: f.p, bis: m.kantenPunkt, text: `${f2(m.laengsKanteM)} m` }]
  }), [fixListe, handStreifen])
  const vorschlagKarte = useMemo(() => [...fixVorschlag.values()].flat().map(v => ({ p: v.p,
    text: `Vorschlag Fixpunkt: nächste Gebäudeecke (AV), ${f1(v.abstandM)} m vom Streifen` })), [fixVorschlag])

  // OSM-Querung ohne Fussgängerstreifen, Streifen aus OSM + AV: Übernahme als geplanter Streifen (Planungs-Wortlaut)
  const planQuerung = !!rechnung && rechnung.streifenQuelle === 'osm' && !!rechnung.markierung && !istFgs(rechnung.markierung)
  /** Koordinaten eines Streifens von Hand in die Zwischenablage (tabulatorgetrennt Punkt, E, N); Rückmeldung als Meldung */
  const kopieren = async (id: string, v: Vermassung) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Zwischenablage hier nicht verfügbar (nur über https bzw. in neueren Browsern)')
      const fix = (fall?.fixpunkte ?? []).map(f => ({ name: fixpunktName(f), p: f.p }))
      await navigator.clipboard.writeText(vermassungTabelle(titel(id), v, fix))
      setMeldung(`Koordinaten von ${titel(id)} kopiert: ${v.punkte.length} Punkte${fix.length ? ` und ${fix.length} Fixpunkt(e)` : ''}, ` +
        'tabulatorgetrennt (Punkt, E, N in LV95, Meter).')
    } catch (e) { setMeldung(`Koordinaten nicht kopiert: ${(e as Error).message}`) }
  }
  // Hilfe zum gewählten Werkzeug (Planen.hilfeOrt): ohne geladenen Ort unter der Knopfzeile («Streifen planen»); Planen-Werkzeuge
  // in der Gruppe Planen (beide Reiter); Bestand-Werkzeuge unter «Eingaben von Hand», im Reiter «Bedarf und Querungstyp» unter
  // der Knopfzeile
  const hilfeWo = hilfeOrt(werkzeug, !!(fall && daten), mitReitern && reiter === 'bedarf')
  // geplante Elemente (Gruppe Planen): Streifen von Hand, Fixpunkte, Flächen (Plan) samt Mittelinsel und Seitenraum; die Liste
  // klappt auf, wenn ein Element dazukommt bzw. eines davon bearbeitet wird
  const geplantZahl = fall ? fall.streifenHand.length + (fall.fixpunkte?.length ?? 0) + (fall.flaechenPlan?.length ?? 0) : 0
  const geplantVorher = useRef(geplantZahl)
  useEffect(() => {
    if (geplantZahl > geplantVorher.current) setGeplantOffen(true)
    geplantVorher.current = geplantZahl
  }, [geplantZahl])
  useEffect(() => {
    if (bearbeiten && fall && (fall.streifenHand.some(x => x.id === bearbeiten) || fall.fixpunkte?.some(x => x.id === bearbeiten) ||
      fall.flaechenPlan?.some(x => x.id === bearbeiten))) setGeplantOffen(true)
  }, [bearbeiten, fall])
  // Angebot für das Popup an der Ecke (gleiches Objekt, solange das Angebot gleich bleibt: sonst öffnete die Karte es neu)
  const angebotKarte = useMemo(() => (werkzeug === 'eckeRunden' && rundenAngebot ? { p: rundenAngebot.ring[rundenAngebot.i],
    text: rundenAngebot.text, knopf: `mit ${f1(rundenAngebot.rMax)} m runden` } : null), [werkzeug, rundenAngebot])
  const rundenPlan = werkzeug === 'eckeRunden' ? fall?.flaechenPlan?.find(x => x.id === bearbeiten) ?? null : null
  // Werkzeughilfe «Mittelinsel (Standard)»: Streifen, Masse, Furt-Seite, Teilen; Lage, Hinweise, Einfügen
  const inselSetze = (k: 'tiefe' | 'breite' | 'furt') => (x: number) => setInselEin(e => ({ ...e, [k]: x }))
  const inselHinweise = [...(inselFehler ? [] : masseHinweise(inselM)), ...(inselPruefung?.hinweise ?? []),
    ...(inselEin.teilen && inselTeilung && 'grund' in inselTeilung ? [inselTeilung.grund] : [])]
  const inselHilfe = (
    <div className="werkzeughilfe">
      <b>Mittelinsel (Standard):</b> Schutzinsel mit Rollstuhlfurt nach Masterplan Fussverkehr Stadt Bern, Standards, E1
      (Abbildung «Neues Prinzip: Mittelinsel mit Rollstuhlfurt»). Streifen wählen bzw. auf oder neben einen Streifen klicken: die
      Insel liegt mit der Mitte auf der Streifenachse in der Fahrbahnmitte zwischen den Bordkanten, ausgerichtet nach den Balken; ein
      weiterer Klick auf der Achse verschiebt sie entlang der Achse. Ohne Streifen setzt der Klick die Mitte, ausgerichtet nach dem
      nächsten OSM-Weg. Vorschau gestrichelt (Furt grau, Signalmast als Punkt); «Mittelinsel einfügen» legt die Flächen (Plan) an.
      <div className="zeile">
        <label> Streifen <select value={inselOrt?.streifen ?? ''} onChange={e => {
          const k = inselStreifen.find(x => x.id === e.target.value)
          if (k) inselAufStreifen(k, null); else setInselOrt(null)
        }}>
          <option value="">{inselStreifen.length ? '– wählen bzw. auf der Karte klicken –' : '– keiner: auf der Karte klicken –'}</option>
          {inselStreifen.map(k => <option key={k.id} value={k.id}>{k.titel}</option>)}</select></label>
      </div>
      <div className="zeile">
        <label> Inseltiefe <ZahlFeld wert={inselEin.tiefe} bereich={INSEL_BEREICH.tiefe} setze={inselSetze('tiefe')}
          titel={`Tiefe der Insel quer zur Fahrbahn in m (E1: mindestens ${f2(E1_TIEFE_M)} m; unter ${f2(INSEL_TIEFE_MIN_M)} m keine Insel)`} /> m</label>
        <label> Streifenbreite <ZahlFeld wert={inselEin.breite} bereich={INSEL_BEREICH.breite} setze={inselSetze('breite')}
          titel={`Breite des Fussgängerstreifens entlang der Fahrbahn in m (Vorgabe: Breite des gewählten Streifens bzw. ${f2(E1_BREITE_M)} m)`} /> m</label>
        <label> Furt <ZahlFeld wert={inselEin.furt} bereich={INSEL_BEREICH.furt} setze={inselSetze('furt')}
          titel={`Rollstuhlfurt auf Fahrbahnniveau in m (E1: ${f2(E1_FURT_M)} m; 0 = ohne Furt)`} /> m</label>
        <label> Kopflänge <ZahlFeld wert={inselEin.kopf ?? inselEin.tiefe / 2} bereich={INSEL_BEREICH.kopf}
          setze={x => setInselEin(e => ({ ...e, kopf: Math.abs(x - e.tiefe / 2) < 1e-9 ? null : x }))}
          titel="Länge der Inselköpfe vor und nach dem Streifen in m (Vorgabe: halbe Tiefe, halbrund; 0 = ohne Kopf)" /> m</label>
        {inselEin.kopf !== null && <button className="zweit klein" onClick={() => setInselEin(e => ({ ...e, kopf: null }))}
          title="Kopflänge = halbe Tiefe">halbrund</button>}
      </div>
      <div className="zeile">
        <span>Furt {inselEin.seite} {inselK ? '(Blick von Ende A nach Ende B des Streifens)' : '(siehe Vorschau: Furt grau, Mast im Kopf daneben)'}</span>
        <button className="zweit klein" onClick={() => setInselEin(e => ({ ...e, seite: e.seite === 'links' ? 'rechts' : 'links' }))}>
          Furt-Seite wechseln</button>
      </div>
      {inselTeilbar && inselK && <div><label><input type="checkbox" checked={inselEin.teilen}
        onChange={e => setInselEin(x => ({ ...x, teilen: e.target.checked }))} /> {inselK.titel} an der Insel in zwei Teilstreifen teilen
        (empfohlen: Streifen von Hand teilt die Rechnung nicht selbst; Enden {f2(TEIL_ABSTAND_M)} m vor den Inselkanten)</label></div>}
      {inselK && !inselK.hand && <p className="klein">Streifen aus {inselK.titel.includes('Luftbild') ? 'dem Luftbild' : 'OSM + AV'}: die Rechnung
        teilt ihn selbst an der Insel (mit Flächen (Plan) gilt der Streifen aus OSM + AV).</p>}
      {inselOrt
        ? <p className="klein">Lage: {inselOrt.quelle}. {standardText(inselM)}
          {inselPruefung?.restM && <>; Fahrbahn neben der Insel (quer) {f2(Math.max(0, inselPruefung.restM[0]))} m bzw.{' '}
            {f2(Math.max(0, inselPruefung.restM[1]))} m</>}.</p>
        : <p className="klein">Noch nicht platziert.</p>}
      {inselFehler && <p className="klein warnung">{inselFehler}</p>}
      {inselHinweise.map(h => <p key={h} className="klein warnung">{mitTiteln(durchfahrtAnzeige(h))}</p>)}
      <div><button onClick={mittelinselEinfuegen} disabled={!inselOrt || !!inselFehler}>Mittelinsel einfügen</button>{' '}
        <button className="zweit" onClick={() => { setInselOrt(null); setWerkzeug(null) }}>Abbrechen</button></div>
    </div>
  )
  const srHilfe = (
    <div className="werkzeughilfe">
      <b>{SR_NAME}:</b> nahe einem Streifenende (Wartebereich) klicken. Die Fläche (Plan) Trottoir reicht von der heutigen Bordkante
      bis {f2(SR_UEBERSTAND_M)} m über die Parklinie (idealerweise mindestens; Längsparkierung aus Parkfeldern bzw. OSM, sonst
      {' '}{f2(SR_PARK_TIEFE_M)} m angenommen), je Seite bis zum ersten Parkfeld (höchstens {f2(SR_RAND_MAX_M)} m, sonst {f2(SR_RAND_M)} m).
      Auto-Parkierung darunter entfällt in der Rechnung.
      <div><button className="zweit" onClick={() => setWerkzeug(null)}>Abbrechen</button></div>
    </div>
  )
  // Messen: Länge mit «übernehmen» in das zuletzt angeklickte Zahlenfeld des Panels (auf 0,05 m gerundet)
  const messM = messLaenge(messung)
  const messHilfe = (
    <div className="werkzeughilfe">
      <b>Messen:</b> {messM !== null ? <>{messText(messM)} ({[messung!.a, messung!.b!].map(q => (q.art === 'frei' ? 'frei' : 'gefangen')).join(', ')}){' '}
        {zahlenfeldName ? <button className="klein" title={`${messWert(messM)} m in «${zahlenfeldName}» schreiben`} onClick={() => {
          const el = zahlenfeld.current
          if (el && el.isConnected) inFeldSchreiben(el, messWert(messM)); else setZahlenfeldName(null)
        }}>übernehmen</button> : <button className="klein" disabled>zuerst ein Zahlenfeld in Metern anklicken</button>}</>
        : messung ? 'zweiten Punkt anklicken' : 'ersten Punkt anklicken'}
      <div className="klein">Fang auf Vermessungspunkte der AV im Umkreis von {FANG_PX} Bildschirmpunkten, sonst freier Punkt; Esc beendet.</div>
      <div><button className="zweit" onClick={() => { setMessung(null); setWerkzeug(null) }}>fertig</button></div>
    </div>
  )
  const werkzeugHilfe = werkzeug === 'messen' ? messHilfe : werkzeug === 'mittelinsel' ? inselHilfe : werkzeug === 'seitenraum' ? srHilfe : werkzeug === 'eckeRunden' ? (
    <div className="werkzeughilfe">
      <b>Ecke runden{rundenPlan ? ` (${planTitel(rundenPlan.id)})` : ''}:</b>{(fall?.flaechenPlan?.length ?? 0) > 1 && <>{' '}
        <label>Fläche <select value={bearbeiten ?? ''} onChange={e => { setBearbeiten(e.target.value || null); setRundenFehler(null)
          setRundenAngebot(null) }}>{!rundenPlan && <option value="">– wählen –</option>}
          {fall!.flaechenPlan!.map(x => <option key={x.id} value={x.id}>{planTitel(x.id)} ({PLAN_NAME[x.art]})</option>)}</select></label>;</>}
      {' '}Radius einstellen, dann eine Ecke der Fläche anklicken
      (Kreise; die App fängt die nächste Ecke). Die Ecke wird durch einen Kreisbogen mit diesem Radius ersetzt, tangential an beide
      Kanten; konvexe Ecken werden abgeschnitten, einspringende ausgefüllt. Grau gestrichelte Ecken: der eingestellte Radius passt
      dort nicht (Tooltip: höchstens möglicher Radius; Klick bietet ihn an). Kleine Punkte gehören zu einem Bogen und sind keine
      Ecken. Radius ändern passt die zuletzt gerundete Ecke an. An einer Einmündung den
      Radius der Bordkante eingeben (die Fahrlinie der Abbieger rechnet die App daneben).
      <label> Radius <ZahlFeld wert={rundenR} bereich={RUNDEN_R_BEREICH} setze={setRundenR}
        titel={`Radius des Bogens in m, ${RUNDEN_R_BEREICH[0]} bis ${RUNDEN_R_BEREICH[1]} m; Enter bzw. Feld verlassen übernimmt`} /> m{' '}
        <input type="range" ref={reglerRef} min={RUNDEN_R_BEREICH[0]} max={RUNDEN_R_BEREICH[1]} step={0.5} value={rundenZug ?? rundenR}
          aria-label="Radius" title="Radius verschieben: Vorschau beim Ziehen, die zuletzt gerundete Ecke folgt beim Loslassen"
          onChange={e => setRundenZug(Number(e.target.value))} /></label>
      {rundenFehler && <p className="klein warnung">{rundenFehler}{rundenAngebot && <>{' '}
        <button className="klein" onClick={angebotAnnehmen}>mit höchstens {f1(rundenAngebot.rMax)} m runden</button></>}</p>}
      <div><button className="zweit" onClick={() => { setWerkzeug(null); setBearbeiten(null); setRundenFehler(null); setRundenAngebot(null) }}>fertig</button></div>
    </div>
  ) : werkzeug && (
    <div className="werkzeughilfe">
      <b>{(WERKZEUGE.find(x => x[0] === werkzeug) ?? ['', 'Fahrlinie selbst zeichnen'])[1]}:</b>{' '}
      {(WERKZEUGE.find(x => x[0] === werkzeug) ?? ['', '', 'am Streifen beginnen, gegen die Fahrtrichtung klicken, Doppelklick beendet'])[2]}
      {(werkzeug === 'streifen' || werkzeug === 'tue') && (fall
        ? <>; liegt der Streifen nicht ganz innert {NACHLADEN_M} m um den geladenen Ort{fall.streifenHand.length ? <> und auch mit
            den übrigen Streifen von Hand nicht ganz innert {NACHLADEN_M} m um einen gemeinsamen Ort</> : ''}, beginnt dort ein
            neuer Fall (AV, OSM und Kataster werden um ihn geladen)</>
        : <>; ohne geladenen Ort beginnt am Streifen ein neuer Fall (AV, OSM und Kataster werden um ihn geladen)</>)}
      {werkzeug === 'planflaeche' && <label> Art <select value={planArt} onChange={e => setPlanArt(e.target.value as PlanArt)}>
        {PLAN_ARTEN.map(a => <option key={a} value={a}>{PLAN_NAME[a]}</option>)}</select></label>}
      {werkzeug === 'parkfeld' && <label> Klasse <select value={klasse} onChange={e => setKlasse(e.target.value as 'auto' | 'velo')}>
        <option value="auto">Auto</option><option value="velo">Velo/Motorrad</option></select></label>}
      {werkzeug === 'laengs' && <label> Breite <input type="number" step="0.1" min="1" max="6" value={breite}
        onChange={e => setBreite(Number(e.target.value) || LAENGS_BREITE_M)} /> m</label>}
      {werkzeug === 'streifen' && <label> Breite <input type="number" step="0.5" min="1" max="15" value={streifenBreite}
        onChange={e => setStreifenBreite(Number(e.target.value) || 4)} /> m</label>}
      {(werkzeug === 'hecke' || werkzeug === 'mauer' || werkzeug === 'flaeche') &&
        <label> <input type="checkbox" checked={sichtbehindernd} onChange={e => setSichtbehindernd(e.target.checked)} /> sichtbehindernd</label>}
      <div><button onClick={() => fertig(zeichnung)} disabled={zeichnung.length < 2}>Fertig</button>{' '}
        <button className="zweit" onClick={() => { setZeichnung([]); setWerkzeug(null) }}>Abbrechen</button></div>
    </div>
  )

  return (
    <div className="app" style={{ '--panel-breite': `${panelBreite}px` } as CSSProperties}>
      <Karte mitte={START} av={avKarte} kantone={kantoneKarte} uebergaenge={sichtbar} strassennamen={namen} gewaehlt={gewaehlt?.id ?? null}
        luftbildKandidaten={lbKandidaten} onLuftbildKandidat={pruefenLuftbild}
        rechnung={rechnung} auswahl={auswahl} hindernisse={fall?.hindernisse ?? LEER_HIND} streifenHand={fall?.streifenHand ?? LEER_HAND}
        werkzeug={werkzeug} zeichnung={zeichnung} bearbeiten={bearbeiten} rundenR={rundenR}
        rundenAngebot={angebotKarte} rundenVorschau={rundenVorschau} inselVorschau={inselVorschau}
        inselGriffe={alleGriffe} onInselZug={griffZug} onInselLos={griffLos}
        neigung={kurveNeigung && kurveNeigung.nr === ladeNr.current ? kurveNeigung.werte : null}
        onRundenAngebot={ja => { if (ja) angebotAnnehmen(); else setRundenAngebot(null) }} fixpunkte={fall?.fixpunkte ?? LEER_FIX} fixVorschlaege={vorschlagKarte} onFixVorschlag={p => fixpunktSetzen(p, 'gebaeudeecke')}
        flaechenPlan={fall?.flaechenPlan ?? LEER_PLAN}
        masslinien={masslinien} messung={werkzeug === 'messen' ? messung : null} zufahrtNamen={zNamen} streifenTitel={titel}
        onUebergang={pruefen} onZufahrt={key => { setAuswahl(key); if (key) zurSicht() }}
        ksPhase={ksPhase} onKsPhase={setKsPhase}
        onTueAuge={(fid, phase, p) => aendern(f => {
          f.streifen[fid] = { ...(f.streifen[fid] ?? {}), [phase === 'fahrbahn' ? 'tueD' : 'tueDtrottoir']: p }
          return f
        })}
        onKlick={klick} onDoppelklick={doppelklick} onEcke={ecke} onHindernis={id => { setBearbeiten(b => (b === id ? null : id)); zurSicht() }}
        onAusschnitt={ausschnitt} hinweis={vorschauHinweis ?? suchHinweis} kartenRef={kartenRef} />
      <Trenner breite={panelBreite} setze={setPanelBreite} onFertig={trennerFertig} />
      <aside className="panel">
        <h1>{onStartseite
          ? <button type="button" className="logo-knopf" onClick={() => wechseln('Zur Startseite: der bisherige Fall wird verlassen.',
              'zur Startseite', onStartseite)} aria-label="Zur Startseite" title="Zur Startseite">
              <img className="logo" src={import.meta.env.BASE_URL + 'logo.svg'} alt="" width={40} height={40} /></button>
          : <img className="logo" src={import.meta.env.BASE_URL + 'logo.svg'} alt="" width={40} height={40} />}
          fgsCheck <span className="marke">Prototyp v{__APP_VERSION__}</span></h1>
        <Anleitung />
        <div className="knopfzeile">
          <label className="knopf">Fall laden<input type="file" accept=".json,application/json" hidden
            onChange={e => { const d = e.target.files?.[0]
              if (d) dateiGewaehlt(d)
              e.target.value = '' }} /></label>
          {/* mit geladenem Ort steht «Streifen planen» in der Gruppe Planen (Planen.tsx) */}
          <StreifenPlanenOben geladen={!!(fall && daten)} werkzeug={werkzeug} waehlen={werkzeugWaehlen} />
          {fall && <button onClick={speichern}>Fall speichern</button>}
          {ortGemerkt && <button className="zweit" onClick={ortWiederherstellen} title={'Den zuletzt bearbeiteten Fall ohne ' +
            `OSM-Übergang (z. B. geplanter Streifen; ${eingabenZahl(ortGemerkt)} Eingaben, Stand ${ortGemerkt.gespeichert?.slice(0, 10) ??
            'unbekannt'}) aus dem Browser zurückholen. Der Browser merkt nur einen solchen Fall: ein anderer Fall ohne Übergang ` +
            'ersetzt ihn erst nach Rückfrage.'}>Letzten geplanten Fall wiederherstellen</button>}
          {fall && rechnung && !rechnet && <button onClick={() => setBericht(true)} title={'Druckansicht mit Kartenbild, Ergebnis, Eingaben ' +
            'und Quellen; als PDF speichern über den Druckdialog des Browsers'}>Bericht drucken / als PDF</button>}
          {rechnung && rechnung.streifen.length > 0 && <a className="knopf zweit streetview" href={streifenStreetView(rechnung.streifen[0])}
            target="_blank" rel="noopener noreferrer" title={'Google Street View an der Mitte des Streifens, Blick entlang des Streifens ' +
            '(öffnet Google Maps; die Koordinaten gehen dabei an Google)'}>Street View ↗</a>}
        </div>
        <label className="klein"><input type="checkbox" checked={nurMarkiert} onChange={e => setNurMarkiert(e.target.checked)} />
          {' '}nur markierte Übergänge zeigen (Fussgängerstreifen, vermutliche und Lichtsignal)</label>
        {meldung && <p className="klein">{meldung}{ladeFehler && fall && !daten && <>{' '}
          <button className="zweit klein" onClick={() => laden(fall.ort.lat, fall.ort.lon, fall.ort.uebergang, fall)}>erneut laden</button></>}</p>}
        {hilfeWo === 'oben' && werkzeugHilfe}
        {wechsel && (
          <p className="klein warnung hinweisbox">{wechsel.text} Der bisherige Fall hat keinen OSM-Übergang und ist nicht als Datei
            gesichert{fall ? ` (${eingabenZahl(fall)} Eingaben)` : ''}: {!wechsel.gemerkt ? 'er ist im Browser nicht gemerkt (dort liegt ' +
            'ein anderer Fall) und geht verloren.' : wechsel.ersetzt ? 'der Browser merkt nur einen Fall ohne Übergang, der neue ' +
            'ersetzt ihn.' : 'der Browser merkt ihn als letzten geplanten Fall («Letzten geplanten Fall wiederherstellen»).'}{' '}
            {fall && <button className="zweit klein" onClick={speichern}>Fall speichern</button>}{' '}
            <button className="klein" onClick={() => {
              const w = wechsel
              // bestätigt: der Eintrag «ort» des bisherigen Falls darf an den neuen Fall ohne Übergang gehen
              if (w.ersetzt && w.gemerkt && ortEigen.current) ortFreigabe.current = true
              setWechsel(null); setZeichnung([]); w.weiter()
            }}>{wechsel.knopf}</button>{' '}
            <button className="zweit klein" onClick={() => { setWechsel(null); setZeichnung([]) }}>abbrechen</button></p>
        )}
        {ortKonflikt && fall && !wechsel && (
          <p className="klein warnung hinweisbox">Im Browser ist noch ein anderer Fall ohne OSM-Übergang gemerkt
            ({eingabenZahl(ortKonflikt)} Eingaben, Stand {ortKonflikt.gespeichert?.slice(0, 10) ?? 'unbekannt'}). Der Browser merkt nur
            einen solchen Fall: der offene Fall ersetzt ihn erst nach Bestätigung, bis dahin ist er nur hier offen.{' '}
            <button className="zweit klein" onClick={() => herunterladen(ortKonflikt, null)} title={'Den gemerkten Fall als JSON-Datei ' +
              'speichern (danach «ersetzen»)'}>gemerkten Fall speichern</button>{' '}
            <button className="zweit klein" onClick={ortWiederherstellen}>letzten geplanten Fall wiederherstellen</button>{' '}
            <button className="klein" onClick={ortErsetzen}>ersetzen</button></p>
        )}
        {!wechsel && !ortKonflikt && ungesichert && (
          <p className="klein hinweisbox">Fall ohne OSM-Übergang, nicht als Datei gesichert: der Browser merkt nur den zuletzt
            bearbeiteten Fall ohne Übergang («Letzten geplanten Fall wiederherstellen»), ein anderer ersetzt ihn erst nach
            Rückfrage – mit «Fall speichern» als Datei sichern.</p>
        )}
        {ladeHinweis && fall && (
          <p className="klein hinweisbox">{ladeHinweis.text}{' '}
            {ladeHinweis.verwerfen && <button className="zweit klein" onClick={() => {
              const leer = leererFall(fall.ort.lat, fall.ort.lon, fall.ort.uebergang)
              if (fall.ort.herkunft) leer.ort.herkunft = fall.ort.herkunft     // Übergang aus dem Luftbild bleibt
              setFall(leer); setLadeHinweis(null)
            }}>Eingaben verwerfen</button>}{' '}
            <button className="zweit klein" onClick={() => setLadeHinweis(null)}>ausblenden</button></p>
        )}
        {verwaist.length > 0 && fall && (
          <p className="klein warnung">{verwaist.length} Eingabe(n) ohne passende Zufahrt bzw. Streifen ({verwaist.join(', ')}) –
            Nummern oder Kennungen haben sich geändert.{' '}
            <button className="zweit klein" onClick={() => aendern(f => {
              for (const k of verwaist) { delete f.zufahrten[k]; delete f.streifen[k] }
              return f
            })}>entfernen</button></p>
        )}
        {rechnung?.hinweis && <p className={rechnung.markierung && istFgs(rechnung.markierung) ? 'pruefen' :
          rechnung.streifenQuelle === 'hand' ? 'hinweisbox' : 'keinfgs'}>{rechnung.hinweis}{fall?.ort.herkunft && rechnung.luftbildUebergang
          ? ` (${herkunftText(fall.ort.herkunft)})` : ''}</p>}
        {/* Streifen ausserhalb der Abdeckung: beim Streifen (StreifenAnzeige); hier gesammelt nur die ohne eigenes Ergebnis */}
        {ausserhalbOhne.length > 0 && (
          <p className="klein warnung">{nichtAbgedecktText(ausserhalbOhne, titel)}{' '}
            {ausserhalbOhne.map(x => <button key={x.id} className="zweit klein" onClick={() => umStreifenLaden(x.id)}>um {titel(x.id)} neu laden</button>)}</p>
        )}
        {rechnet && <p className="klein">Rechnung läuft …</p>}

        {/* Reiter (ReiterLeiste.tsx): davor die Gruppe Planen (in beiden Reitern); Sichtprüfung mit Teaser zum Bedarf, Eingaben von
            Hand und Streifen; Bedarf und Querungstyp */}
        <ReiterAnsicht mitReitern={mitReitern} aktiv={reiter} waehlen={reiterWaehlen} zustand={bedarfZustand}
          kopf={fall && daten && <PlanenGruppe geladen werkzeug={werkzeug} waehlen={planWaehlen} hilfe={hilfeWo === 'planen' && werkzeugHilfe}
            gesperrt={fall.flaechenPlan?.length ? {} : { eckeRunden: 'Ecke runden: zuerst eine Fläche (Plan) zeichnen bzw. eine ' +
              'Mittelinsel oder einen vorgezogenen Seitenraum einfügen' }}
            anzahl={geplantZahl} offen={geplantOffen} setOffen={setGeplantOffen} geplant={<>
            {fall.streifenHand.length > 0 && (
              <>
                <h3>{fall.streifenHand.every(s => istTrottoirueberfahrt(fall, s.id)) ? 'Trottoirüberfahrten von Hand'
                  : fall.streifenHand.some(s => istTrottoirueberfahrt(fall, s.id)) ? 'Streifen und Trottoirüberfahrten von Hand (ersetzen den Streifen aus OSM)'
                  : 'Streifen von Hand (ersetzen den Streifen aus OSM)'}</h3>
                <ul className="liste">
                  {fall.streifenHand.map(s => (
                    <li key={s.id}>
                      <span className="farbe" style={{ background: '#fde047' }} />
                      {/* Name: erst beim Verlassen bzw. Enter übernommen (TextFeld), sonst rechnete jeder Tastendruck neu */}
                      <TextFeld wert={s.name ?? ''} max={STREIFEN_NAME_MAX} platzhalter={streifenTitel(s.id, [], istTrottoirueberfahrt(fall, s.id))}
                        titel={`Name ${istTrottoirueberfahrt(fall, s.id) ? 'der Überfahrt' : 'des Streifens'} ` +
                        '(erscheint in Panel, Karte und Bericht statt «' + streifenTitel(s.id, [], istTrottoirueberfahrt(fall, s.id)) + '»); leer: Nummer. Enter bzw. Feld verlassen übernimmt'}
                        setze={t => aendern(f => { const y = f.streifenHand.find(z => z.id === s.id); if (y) { if (t) y.name = t; else delete y.name } return f })} />
                      : {f1(dist(s.p0, s.p1))} m lang,{' '}
                      {/* Breite (Balkenlänge) änderbar; setzt «angepasst» nicht: das beschreibt verschobene Enden, die Breite steht
                          in Liste und Bericht ohnehin als Zahl. Trottoirüberfahrt: die Breite kommt aus der Knotensicht (27.10.2026) */}
                      {istTrottoirueberfahrt(fall, s.id) ? <>Trottoirüberfahrt, </> : <><ZahlFeld wert={s.breite} bereich={[0.5, 15]} titel={'Breite des Streifens (Balkenlänge entlang der Fahrbahn) in m, ' +
                        '0,5 bis 15 m; Enter bzw. Feld verlassen übernimmt'} setze={x => {
                        if (x === s.breite) return
                        geaendert.current = s.id
                        aendern(f => { const y = f.streifenHand.find(z => z.id === s.id); if (y) y.breite = x; return f })
                      }} /> m breit, </>}{streifenHerkunftText(s)}
                      <span className="aktionen">
                        <button className="zweit klein" title={istTrottoirueberfahrt(fall, s.id) ? 'Überfahrt verschieben: Enden auf der Karte ziehen (fangen auf die AV)'
                          : 'Enden auf der Karte verschieben'} onClick={() => setBearbeiten(b => (b === s.id ? null : s.id))}>
                          {bearbeiten === s.id ? 'fertig' : 'verschieben'}</button>
                        <button className="zweit klein" onClick={() => aendern(f => { f.streifenHand = f.streifenHand.filter(x => x.id !== s.id); return f })}>löschen</button>
                      </span>
                      {teilung?.id === s.id && teilungZuruecknehmbar(fall, teilung) && <div className="klein">An der Mittelinsel in zwei
                        Teilstreifen geteilt ({titel(teilung.id)} und {titel(teilung.neuId)}).{' '}
                        <button className="zweit klein" title="den ungeteilten Streifen samt seinen Eingaben wie vor dem Teilen (die Mittelinsel bleibt)"
                          onClick={teilungZurueck}>Teilung zurücknehmen</button></div>}
                      <MasseAnzeige s={s} e={rechnung?.streifen.find(x => x.fgsId === s.id) ?? null} kopieren={kopieren} namen={zNamen.get(s.id)}
                        fixpunkte={fall.fixpunkte ?? []} vorschlaege={fixVorschlag.get(s.id) ?? []}
                        setzen={() => werkzeugWaehlen('fixpunkt')} uebernehmen={v => fixpunktSetzen(v.p, 'gebaeudeecke')} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {(fall.fixpunkte?.length ?? 0) > 0 && (
              <>
                <h3>Fixpunkte (Vermassung der Streifen von Hand, ohne Einfluss auf die Rechnung)</h3>
                <ul className="liste">
                  {fall.fixpunkte!.map(fp => (
                    <li key={fp.id} className={bearbeiten === fp.id ? 'aktiv' : ''}>
                      <span className="farbe" style={{ background: FIXPUNKT_FARBE }} />
                      <TextFeld wert={fp.name ?? ''} max={FIXPUNKT_NAME_MAX} platzhalter={fixpunktName({ ...fp, name: undefined })} titel={'Bezeichnung des Fixpunkts ' +
                        '(z. B. Gebäudeecke Haus Nr. 5); leer: nach Art. Enter bzw. Feld verlassen übernimmt'} setze={t => aendern(f => {
                        const x = f.fixpunkte?.find(y => y.id === fp.id)
                        if (x) { if (t) x.name = t; else delete x.name }
                        return f
                      })} />
                      <span className="klein">{ART_TEXT[fp.art]} · E {koordText(fp.p[0])}, N {koordText(fp.p[1])}</span>
                      <span className="aktionen">
                        <button className="zweit klein" title="auf der Karte verschieben (fängt wieder auf die AV)"
                          onClick={() => setBearbeiten(b => (b === fp.id ? null : fp.id))}>{bearbeiten === fp.id ? 'fertig' : 'verschieben'}</button>
                        <button className="zweit klein" onClick={() => aendern(f => {
                          f.fixpunkte = (f.fixpunkte ?? []).filter(x => x.id !== fp.id)
                          if (!f.fixpunkte.length) delete f.fixpunkte
                          return f
                        })}>löschen</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {(fall.flaechenPlan?.length ?? 0) > 0 && (
              <>
                <h3>Flächen (Plan): geplante Bodenbedeckung, ersetzt in der Rechnung die AV darunter</h3>
                <ul className="liste">
                  {fall.flaechenPlan!.map(fp => (
                    <li key={fp.id} className={bearbeiten === fp.id ? 'aktiv' : ''}>
                      <span className="farbe" style={{ background: planMarke(fp.art), borderColor: PLAN_FARBEN[fp.art].linie }} />
                      {planTitel(fp.id)}:{' '}
                      <select value={fp.art} title="Art der geplanten Fläche" onChange={e => aendern(f => {
                        const x = f.flaechenPlan?.find(y => y.id === fp.id)
                        if (x) x.art = e.target.value as PlanArt
                        return f
                      })}>{PLAN_ARTEN.map(a => <option key={a} value={a}>{PLAN_NAME[a]}</option>)}</select>
                      {' '}{f1(planFlaecheM2(fp.ring))} m², {fp.ring.length} Ecken
                      <span className="aktionen">
                        <button className="zweit klein" title="Ecken auf der Karte verschieben (fangen auf die AV bzw. andere Plan-Flächen)"
                          onClick={() => { if (werkzeug === 'eckeRunden') setWerkzeug(null); setBearbeiten(b => (b === fp.id && werkzeug !== 'eckeRunden' ? null : fp.id)) }}>
                          {bearbeiten === fp.id && werkzeug !== 'eckeRunden' ? 'fertig' : 'bearbeiten'}</button>
                        <button className={werkzeug === 'eckeRunden' && bearbeiten === fp.id ? 'aktiv klein' : 'zweit klein'}
                          title={'Eine Ecke dieser Fläche durch einen Kreisbogen ersetzen (Radius eingeben, Ecke auf der Karte anklicken), z. B. den ' +
                          'geplanten Bordkantenradius an einer Einmündung'} onClick={() => {
                            setZeichnung([]); zeichnungRef.current = []; setSpurFuer(null)
                            setRundenFehler(null); setRundenAngebot(null)
                            if (werkzeug === 'eckeRunden' && bearbeiten === fp.id) { setWerkzeug(null); setBearbeiten(null) }
                            else { setWerkzeug('eckeRunden'); setBearbeiten(fp.id) }
                          }}>Ecke runden</button>
                        <button className="zweit klein" onClick={() => {
                          if (bearbeiten === fp.id) { setBearbeiten(null); if (werkzeug === 'eckeRunden') setWerkzeug(null) }
                          aendern(f => {
                            // vorgezogener Seitenraum: Streifen von Hand, die an seiner Vorderkante enden, wieder an die Bordkante heute
                            const sr = seitenraumStandard(fp)
                            if (sr) f.streifenHand = endenNachfuehren(f.streifenHand, kanteLinie(sr, sr, true), kanteLinie(sr, sr, false)).streifen
                            f.flaechenPlan = (f.flaechenPlan ?? []).filter(x => x.id !== fp.id)
                            if (!f.flaechenPlan.length) delete f.flaechenPlan
                            return f
                          })
                        }}>löschen</button>
                      </span>
                      {inselStandard(fp) && <div className="klein">{planStandardText(fp)}
                        {(fall.flaechenPlan ?? []).find(x => x.standard?.gruppe === fp.standard!.gruppe)?.id === fp.id &&
                          inselGriffe.some(g => g.gruppe === fp.standard!.gruppe) && <>{' '}
                          <label title="Ziehen am Griff in der Inselmitte: frei statt entlang der Streifenachse (gilt für alle Mittelinseln; auch auf Touch)">
                            <input type="checkbox" checked={inselFrei} onChange={e => setInselFrei(e.target.checked)} /> frei verschieben</label></>}
                        {verschiebung?.gruppe === fp.standard!.gruppe && (fall.flaechenPlan ?? []).find(x => x.standard?.gruppe === fp.standard!.gruppe)?.id === fp.id &&
                          verschiebungZuruecknehmbar(fall, verschiebung) && <>{' '}
                          <button className="zweit klein" title="Mittelinsel (und nachgeführte Teilstreifen) wie vor dem letzten Ziehen"
                            onClick={verschiebungZurueck}>Verschiebung zurücknehmen</button></>}
                        {(fall.flaechenPlan ?? []).filter(x => x.standard?.gruppe === fp.standard!.gruppe)[0]?.id === fp.id &&
                          (fall.flaechenPlan ?? []).filter(x => x.standard?.gruppe === fp.standard!.gruppe).length > 1 && <>{' '}
                          <button className="zweit klein" title="alle Flächen (Plan) dieser Mittelinsel löschen (Streifen von Hand bleiben, wie sie sind)"
                            onClick={() => mittelinselLoeschen(fp.standard!.gruppe, false)}>ganze Mittelinsel löschen</button>
                          {teilung?.gruppe === fp.standard!.gruppe && teilungZuruecknehmbar(fall, teilung) && <>{' '}
                            <button className="zweit klein" title={`alle Flächen (Plan) dieser Mittelinsel löschen und ${titel(teilung.id)} wieder ungeteilt (samt Eingaben wie vor dem Teilen)`}
                              onClick={() => mittelinselLoeschen(fp.standard!.gruppe, true)}>Mittelinsel löschen und Teilung zurücknehmen</button></>}</>}</div>}
                      {seitenraumStandard(fp) && <SeitenraumZeile fp={fp} st={seitenraumStandard(fp)!} aendere={srAendern}
                        zurueck={verschiebung?.gruppe === fp.standard!.gruppe && verschiebungZuruecknehmbar(fall, verschiebung) ? verschiebungZurueck : null} />}
                      {rundung?.id === fp.id && gleicherRing(rundung.nachher, fp.ring) && <div className="klein">{rundung.text}{' '}
                        <button className="zweit klein" title="die Fläche wie vor dem letzten Runden" onClick={() => {
                          const r = rundung
                          aendern(f => { const x = f.flaechenPlan?.find(y => y.id === r.id); if (x && gleicherRing(x.ring, r.nachher)) x.ring = r.vorher; return f })
                          setRundung(null); setMeldung(`${planTitel(r.id)}: Rundung zurückgenommen.`)
                        }}>Rundung zurücknehmen</button></div>}
                    </li>
                  ))}
                </ul>
                {rechnung?.planFlaechen !== undefined && <p className="klein">Rechnung mit geplanter Bodenbedeckung (von Hand):
                  {' '}{rechnung.planFlaechen} von {fall.flaechenPlan!.length} Plan-Fläche(n) wirksam; Bordkanten, Wartebereiche, Inseln und
                  Fahrlinien richten sich danach (Annahmen je Streifen und Zufahrt). Wo sich Plan-Flächen überlappen, gilt die spätere.
                  Eine Ecke nach Plan-Fläche, deren Bordkante die App als Bogen über {f1(ECK_GROSS_M)} m liest (fast gerade bzw. als
                  Abschrägung gezeichnet), gilt als unplausibel: der Abbiegeradius wird geschätzt. Den geplanten Radius mit «Ecke runden»
                  festlegen.</p>}
              </>
            )}
            </>} />}
          bedarf={fall && blaetter.length > 0 && <BedarfAbschnitt fall={fall} blaetter={blaetter} vorgabe={bedarfVorgabe} aendern={aendern}
            zeigen={zeigeBedarf} alternative={alternative} setAlternative={setAlternative} sichtLinks={fgsIds => (rechnung?.streifen ?? []).filter(x => fgsIds.includes(x.fgsId)).flatMap(x =>
              nachNr(x.zufahrten, zNamen.get(x.fgsId)).flatMap(z => {
                const u = zufahrtStreetView(z, x), nr = zufahrtNr(zNamen.get(x.fgsId), z.zufahrt)
                return u ? [{ name: `${nr ? `${nr} ` : ''}${zufahrtLang(zNamen.get(x.fgsId), z.zufahrt)}`, url: u, titel: zufahrtStreetViewTitel(nr || z.zufahrt) }] : []
              }))} />}
          sicht={<>
        {bedarfZustand && <BedarfTeaser zustand={bedarfZustand} oeffnen={() => {
          reiterWaehlen('bedarf')
          window.setTimeout(() => document.getElementById(reiterKnopfId('bedarf'))?.focus(), 0)
        }} text={teaserText(bedarfStaende, blaetter.map(kopfText))} />}
        {fall && daten && (
          <section className="eingaben">
            <h2>Eingaben von Hand</h2>
            <WerkzeugKnoepfe liste={BESTAND_WERKZEUGE} werkzeug={werkzeug} waehlen={werkzeugWaehlen} />
            {hilfeWo === 'eingaben' && werkzeugHilfe}
            <LuftbildAnzeige rechnung={rechnung} fall={fall} flugjahr={daten.flugjahr} hatBild={!!daten.luftbild} aendern={aendern}
              setMeldung={setMeldung} />
            {rechnung && rechnung.streifenQuelle !== 'hand' && rechnung.streifen.length > 0 && (
              <p className="klein"><button className="zweit klein" onClick={() => {
                let n = 0, ni = 0
                // angenommene Inseln (nach OSM und Luftbild) als Insel von Hand mit, sonst ginge die Teilung verloren
                aendern(f => { const vor = f.hindernisse.length
                  n = streifenUebernehmen(f, rechnung.streifenQuelle === 'luftbild' && rechnung.luftbild ? rechnung.luftbild.teile : rechnung.streifen, rechnung.streifen,
                    rechnung.streifenQuelle === 'luftbild' && rechnung.luftbild ? 'luftbild' : 'osm', rechnung.inseln ?? [])
                  ni = f.hindernisse.length - vor; return f })
                setMeldung((n ? `${planQuerung ? 'Querung als geplanten Streifen' : 'Streifen'} übernommen; ${n} Eingaben (Tempo, Spur, ` +
                  'Streichen, Lichtsignal, kein FGS) auf die neuen Nummern übertragen – bitte prüfen.' : planQuerung ?
                  'Querung als geplanten Streifen übernommen: Enden verschieben und Breite anpassen.' : 'Streifen übernommen.') +
                  (ni ? ' Die Insel aus dem Luftbild steht jetzt als Insel von Hand unter den Hindernissen.' : ''))
              }}>{planQuerung ? 'Querung als geplanten Streifen' : `Streifen aus ${rechnung.streifenQuelle === 'luftbild' ? 'dem Luftbild' : 'OSM'}`}
                {' '}übernehmen und anpassen</button> (Enden danach verschieben)</p>
            )}
            <h3>Hindernisse ({fall.hindernisse.length})</h3>
            <p className="klein">Höhe von Hecken und Mauern vor Ort prüfen: sichtbehindernd sind sie nur, wenn sie die Sicht
              zwischen Fahrzeug und wartender Person verdecken.</p>
            {!fall.hindernisse.length && <p className="klein">Noch keine. Werkzeug wählen und auf dem Luftbild zeichnen.</p>}
            {doppeltIds.length > 0 && (
              <p className="klein warnung">{doppeltIds.length} Parkierung(en) decken sich mit amtlichen Parkfeldern (z. B. vor dem Laden der
                amtlichen Felder gezeichnet) und zählen dann doppelt. Prüfen und, wenn doppelt, löschen.{' '}
                <button className="zweit klein" onClick={() => aendern(f => {
                  const weg = new Set(doppeltIds)
                  f.hindernisse = f.hindernisse.filter(x => !weg.has(x.id))
                  return f
                })}>doppelte löschen ({doppeltIds.length})</button></p>
            )}
            <ul className="liste">
              {fall.hindernisse.map(h => (
                <li key={h.id} className={bearbeiten === h.id ? 'aktiv' : ''}>
                  <span className="farbe" style={{ background: hindernisFarbe(h) }} />{hindernisText(h)}
                  {srErsetzt.has(h.id) && <span className="klein">{srErsetztText(h.id)}</span>}
                  {doppelt.has(h.id) && <span className="warnung" title={'Mindestens 30 % der Fläche liegen auf amtlichen Parkfeldern ' +
                    '(auch verworfenen). Der Eintrag zählt weiter; «löschen», wenn er dieselbe Parkierung beschreibt.'}> – deckt sich mit
                    amtlichen Parkfeldern – doppelt?</span>}
                  {(h.art === 'hecke' || h.art === 'mauer' || h.art === 'uebrige') && <label className="klein"> <input type="checkbox"
                    checked={h.sichtbehindernd} onChange={e => aendern(f => {
                      const x = f.hindernisse.find(y => y.id === h.id)
                      if (x && (x.art === 'hecke' || x.art === 'mauer' || x.art === 'uebrige')) x.sichtbehindernd = e.target.checked
                      return f
                    })} /> sichtbehindernd</label>}
                  <span className="aktionen">
                    <button className="zweit klein" onClick={() => setBearbeiten(b => (b === h.id ? null : h.id))}>{bearbeiten === h.id ? 'fertig' : 'bearbeiten'}</button>
                    <button className="zweit klein" onClick={() => aendern(f => { f.hindernisse = f.hindernisse.filter(x => x.id !== h.id); return f })}>löschen</button>
                  </span>
                </li>
              ))}
            </ul>
            {vorschlagOsm.length > 0 && (
              <>
                <h3>Vorschläge: Parkierung aus OSM, prüfen ({vorschlagOsm.length})</h3>
                <p className="klein warnung">Aus OSM-Tags abgeleitet, Lage und Breite angenommen. Zählen erst, wenn bestätigt.</p>
                <ul className="liste">
                  {vorschlagOsm.map(v => (
                    <li key={v.id}><span className="farbe gestrichelt" style={{ borderColor: QUELLE_FARBE.osm }} />{v.hindernis.name}
                      <span className="aktionen">
                        <button className="klein" onClick={() => aendern(f => { f.hindernisse.push({ ...v.hindernis, name: `${v.hindernis.name} – bestätigt` }); return f })}>bestätigen</button>
                        <button className="zweit klein" onClick={() => aendern(f => { f.vorschlaege[v.id] = 'verworfen'; return f })}>verwerfen</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {kataster && (
              <div className="klein">
                <label><input type="checkbox" checked={fall.baumkataster} onChange={e => aendern(f => {
                  f.baumkataster = e.target.checked
                  if (!f.baumkataster) delete f.quellen.baumkataster
                  return f
                })} />
                  {' '}{kataster.quelle.name} laden ({kataster.quelle.quellenangabe})</label>
                {kataster.fehler && <div className="fehler">Nicht geladen: {kataster.fehler}{' '}
                  <button className="zweit klein" onClick={() => setKataster(k => (k ? { quelle: k.quelle, baeume: null, lat: k.lat, lon: k.lon } : k))}>erneut laden</button></div>}
                {fall.baumkataster && kataster.baeume && <div>{katBaeume.length} Bäume in Reichweite der Rechnung ({KATASTER_PARK_M} m um den Streifen) zählen als Hindernis (Stamm {f1(BAUM_STAMM_M)} m);
                  einzelne auf der Karte anklicken und unten verwerfen.</div>}
                {bearbeiten && katBaeume.some(v => v.id === bearbeiten) && <button className="zweit klein"
                  onClick={() => { aendern(f => { f.vorschlaege[bearbeiten] = 'verworfen'; return f }); setBearbeiten(null) }}>gewählten Baum verwerfen</button>}
              </div>
            )}
            {parkKat && (
              <div className="klein parkkataster">
                <label title={`${parkKat.quelle.quellenangabe}; WFS map.bern.ch, Ausschnitt ±${PARK_RADIUS_M} m um den Ort. Die Felder ` +
                  'zählen ohne Bestätigung als Hindernis (Status, Parkabzug, 1,5 m Abstand, Parkfeld unter 5 m), wie gezeichnete Parkfelder.'}>
                  <input type="checkbox" checked={parkAn} onChange={e => aendern(f => {
                    if (e.target.checked) { delete f.parkkataster; if (parkKat.felder) f.quellen.parkkataster = parkKat.quelle.quellenangabe }
                    else { f.parkkataster = false; delete f.quellen.parkkataster }
                    return f
                  })} />
                  {' '}{parkKat.quelle.name} laden</label>
                {parkAn && !parkKat.felder && !parkKat.fehler && <div>werden geladen … (bis dahin ohne sie gerechnet)</div>}
                {parkKat.fehler && <div className="fehler">Nicht geladen: {parkKat.fehler}{' '}
                  <button className="zweit klein" onClick={() => setParkKat(k => (k ? { ...k, felder: null, fehler: undefined, laedt: false } : k))}>
                    erneut laden</button></div>}
                {parkAn && parkKat.felder && <div title={`Felder bis ${KATASTER_PARK_M} m um den Streifen (geladen: Ausschnitt ±${PARK_RADIUS_M} m, ` +
                  `${parkKat.felder.length} Felder). Klassen wie in der Berner Prüfung: Parkfelder, ` +
                  'Spezialfelder und übrige = Auto; Parkplatz Velo/Mofa = Velo; Parkplatz Motorrad = Motorrad; Parkverbote und ' +
                  'Veloabstellplätze zählen nicht.'}>
                  {katPark.length} Felder in Reichweite der Rechnung ({KATASTER_PARK_M} m um den Streifen; {parkKlasseZahl('auto')} Auto,
                  {' '}{parkKlasseZahl('velo')} Velo, {parkKlasseZahl('motorrad')} Motorrad) zählen als Hindernis; einzelne auf der Karte
                  anklicken und verwerfen, verworfene (gestrichelt) dort anklicken und wieder zählen. Nur öffentliche Felder: private Parkplätze von
                  Hand ergänzen.</div>}
                {parkGewaehlt && <div><button className="zweit klein" onClick={() => {
                  aendern(f => { f.vorschlaege[parkGewaehlt.id] = 'verworfen'; return f }); setBearbeiten(null)
                }}>gewähltes Parkfeld verwerfen</button> {parkGewaehlt.hindernis.name}{srErsetztText(parkGewaehlt.id)}</div>}
                {parkAn && parkZurueck && <div><button className="zweit klein" onClick={() => {
                  aendern(f => { delete f.vorschlaege[parkZurueck.id]; return f }); setBearbeiten(null)
                }}>wieder zählen</button> {parkZurueck.hindernis.name} (verworfen)</div>}
                {parkVerworfen.length > 0 && <div><button className="zweit klein" title="verworfene amtliche Parkfelder wieder zählen"
                  onClick={() => aendern(f => { for (const id of parkVerworfen) delete f.vorschlaege[id]; return f })}>
                  verworfene wieder einblenden ({parkVerworfen.length})</button></div>}
              </div>
            )}
          </section>
        )}

        {rechnung && rechnung.meldungen.length > 0 && <ul className="annahmen">{rechnung.meldungen.map(m => <li key={m}>{m}</li>)}</ul>}
        {rechnung?.streifen.map(s => fall && (
          <StreifenAnzeige key={s.fgsId} s={s} fall={fall} auswahl={auswahl} setAuswahl={setAuswahl} aendern={aendern} namen={zNamen.get(s.fgsId)}
            alleStreifen={rechnung?.streifen ?? []} alleNamen={zNamen} blatt={blaetter.find(b => b.streifen.includes(s.fgsId)) ?? null}
            gewaehlteZ={gewaehlteZ} spurZeichnen={key => { setSpurFuer(key); setZeichnung([]); setWerkzeug('spurB') }}
            ausserhalb={ausserhalb.find(x => x.id === s.fgsId) ?? null} neuLaden={() => umStreifenLaden(s.fgsId)} ksPhase={ksPhase} setKsPhase={setKsPhase}
            grau={!!rechnung && rechnung.streifenQuelle !== 'hand' && !!rechnung.markierung && !istFgs(rechnung.markierung)}
            neigung={kurveNeigung && kurveNeigung.nr === ladeNr.current ? kurveNeigung.werte : null} />
        ))}
        {rechnung && <p className="klein">Rechenzeit {Math.round(rechnung.ms)} ms (Web Worker).</p>}
          </>} />

        <details className="abschnitt" open={quellenOffen} onToggle={e => setQuellenOffen(e.currentTarget.open)}>
        <summary><h2>Geladene Quellen{quellenFehler && <span className="fehler"> (Fehler)</span>}</h2></summary>
        <table>
          <tbody>
            {Object.entries(quellen).map(([k, q]) => (
              <tr key={k}><td>{q.name}{q.server && <div className="klein">{q.server}</div>}</td>
                {q.fehler ? <td className="fehler">{q.fehler}{k === 'parkkataster' && parkKat?.fehler && <>{' '}
                  <button className="zweit klein" onClick={() => setParkKat(x => (x ? { ...x, felder: null, fehler: undefined, laedt: false } : x))}>
                    erneut laden</button></>}</td> :
                  <td className="klein">{[q.objekte, q.ms != null ? `${Math.round(q.ms)} ms` : '', q.bytes != null ? `${Math.round(q.bytes / 1024)} kB` : '']
                    .filter(Boolean).join(', ')}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        </details>

        <details className="abschnitt">
        <summary><h2>Legende</h2></summary>
        <ul className="legende">
          <li><span className="farbe rund" style={{ background: UEBERGANG_FARBE.markiert }} />OSM-Übergang mit Fussgängerstreifen-Markierung,
            <span className="farbe rund gestrichelt" style={{ background: UEBERGANG_FARBE.vermutlich, borderColor: '#a16207', opacity: 0.6 }} />vermutlich
            (crossing=uncontrolled ohne Markierungs-Tag), <span className="farbe rund" style={{ background: UEBERGANG_FARBE.lsa }} />mit Lichtsignal,
            <span className="farbe rund" style={{ background: UEBERGANG_FARBE.unmarkiert }} />unmarkiert bzw. ohne Angabe (kein FGS)</li>
          <li><span className="farbe lbfgs-marke" />Streifen aus dem Luftbild (ETH-Modell), nicht in OSM: Kandidat zum Prüfen (Klick: wie ein
            OSM-Übergang prüfen)</li>
          <li><span className="farbe" style={{ background: '#fde047' }} />Streifen, <span className="farbe gestrichelt" style={{ background: '#e2e8f0',
            borderColor: '#0f172a', borderStyle: 'dashed', boxShadow: `inset 0 0 0 1px ${OHNE_VORTRITT_FARBE}` }} />Querung ohne Vortritt (ohne Balken, weiss
            gestrichelt; Sichtweite nach <VerweisText text="VSS 40 240" />, Ziffer 8.2), <span className="farbe gestrichelt" style={{ background: AV_FARBEN.Trottoir,
            borderColor: TUE_RAND, borderStyle: 'dashed' }} />Trottoirüberfahrt (gerechnete Fläche, Strich: gezeichnete Achse),
            <span className="farbe" style={{ background: '#0ea5e9' }} />Annäherungsbereiche,
            <span className="farbe" style={{ borderColor: LUFTBILD_FARBE, borderWidth: 2 }} />Balken aus dem Luftbild (gestrichelt: unsicher)</li>
          <li><NrMarke nr="1" />{NUMMERN_TEXT} (je Streifen nach der Herkunft der Fahrzeuge, gerade und abbiegende gemeinsam; von Hand
            gestrichene behalten ihre Nummer ohne Schild, aus den Daten entfallene Richtungen haben keine), Schild hinter dem letzten Sichtpunkt; <NrMarke nr="2" gewaehlt />gewählte Zufahrt (Klick
            aufs Schild wählt sie)</li>
          <li><span className="farbe" style={{ background: STATUS_FARBE.frei }} />Sichtfeld frei, <span className="farbe" style={{ background: STATUS_FARBE.verdeckt }} />verdeckt
            (Auto-Parkfeld, Gebäude), <span className="farbe" style={{ background: STATUS_FARBE.verdeckt_hindernis }} />Hecke, Mauer,
            übriges Hindernis, <span className="farbe" style={{ background: STATUS_FARBE.verdeckt_baum }} />Baum,
            <span className="farbe" style={{ background: STATUS_FARBE.verdeckt_zweirad }} />Zweirad-Feld (Velo/Motorrad)</li>
          {rechnung?.streifen.some(s => s.zufahrten.some(z => z.velo)) && <li>Sicht vom Velo (Radstreifen bzw. Radweg; VSS 40 273 Tab. 3), gestrichelt:
            Sichtfeld <span className="farbe gestrichelt" style={{ background: VELO_SICHT_FARBE.frei, borderStyle: 'dashed' }} />türkis frei,
            {' '}<span className="farbe gestrichelt" style={{ background: VELO_SICHT_FARBE.verdeckt, borderStyle: 'dashed' }} />orange verdeckt;
            {' '}<span className="farbe" style={{ background: FARBE_VELO }} />Velo violett beim Soll (gewählte Zufahrt mit Sichtpunkten, die übrigen
            Velos ab Zoom {FAHRZEUG_ZOOM})</li>}
          {rechnung?.streifen.some(s => s.trottoirueberfahrt) && <li>Knotensicht: <span className="farbe" style={{ background: STATUS_FARBE.frei }} />frei,
            <span className="farbe" style={{ background: STATUS_FARBE.verdeckt }} />verdeckt; Auto durchgezogen, Trottoir punktiert; Velo gestrichelt,
            Sichtfeld <span className="farbe" style={{ background: VELO_SICHT_FARBE.frei }} />türkis frei, <span className="farbe"
            style={{ background: VELO_SICHT_FARBE.verdeckt }} />orange verdeckt, Velo <span className="farbe" style={{ background: FARBE_VELO }} />violett; <span className="farbe rund" style={{ background: '#ffffff', borderColor: '#111827' }} />Auge der Ausfahrenden</li>}
          {rechnung?.streifen.some(s => s.trottoirueberfahrt) && <li>Fahrzeuge: <span className="farbe" style={{ background: FARBE_WARTEND }} />wartend,
            Sicht auf die Fahrbahn: grau; <span className="farbe" style={{ background: FARBE_WARTEND_TROTTOIR }} />wartend, Sicht aufs Trottoir: ocker;
            {' '}<span className="farbe" style={{ background: FARBE_HERAN }} />am Ende der Sichtweite: blau. Wartende am Auge ziehen: Standort von Hand</li>}
          {rechnung?.streifen.some(s => !s.trottoirueberfahrt && s.zufahrten.length) && <li><span className="farbe" style={{ background: FARBE_HERAN }} />Fahrzeug
            am letzten Sichtpunkt: blau (gewählte Zufahrt; die übrigen blass ab Zoom {FAHRZEUG_ZOOM}), <span className="farbe rund" style={{ background: AV_FARBEN.Trottoir,
            borderColor: '#334155' }} />wartende Person am Streifenende</li>}
          {rechnung?.streifen.some(s => !s.trottoirueberfahrt && s.zufahrten.some(z => z.erkennungM)) && <li>Erkennungsdistanz entlang der
            Fahrlinie: <span className="farbe" style={{ background: STATUS_FARBE.frei }} />Markierung sichtbar, <span className="farbe"
            style={{ background: STATUS_FARBE.verdeckt }} />verdeckt bis zum Soll (doppelte Sichtweite, höchstens 110 m; das verdeckende
            Hindernis rot), <span className="farbe gestrichelt" style={{ background: ERKENNUNG_UNGEPRUEFT }} />nicht geprüft (Fahrlinie
            endet)</li>}
          <li><span className="farbe" style={{ background: QUELLE_FARBE.hand }} />von Hand, <span className="farbe" style={{ background: QUELLE_FARBE.osm }} />aus OSM (gestrichelt: Vorschlag, prüfen),
            <span className="farbe" style={{ background: QUELLE_FARBE.kataster }} />aus Baumkataster</li>
          <li><span className="farbe gestrichelt" style={{ borderColor: INSEL_FARBE, borderWidth: 2 }} />{INSEL_TEXT};
            <span className="farbe" style={{ background: INSEL_FARBE }} />Insel von Hand (Werkzeug «Insel»)</li>
          <li>Amtliche Parkfelder (zählen, einzeln verwerfbar): <span className="farbe" style={{ background: PARK_FARBE.auto }} />Auto,
            <span className="farbe" style={{ background: PARK_FARBE.velo }} />Velo, <span className="farbe" style={{ background: PARK_FARBE.motorrad }} />Motorrad,
            <span className="farbe gestrichelt" style={{ borderColor: PARK_FARBE.auto, opacity: 0.6 }} />verworfen (gestrichelt, anklicken: wieder zählen)</li>
          <li><FixLegende />Fixpunkt, <FixLegende blass />Vorschlag Fixpunkt (nächste Gebäudeecke der AV; Klick übernimmt), gestrichelte
            Masslinie bis zur Streifenkante</li>
          {Object.entries(AV_FARBEN).map(([art, farbe]) => <li key={art}><span className="farbe" style={{ background: farbe }} />AV {AV_NAME[art] ?? art}</li>)}
          <li>Flächen (Plan) von Hand, schraffiert mit gestricheltem Rand (ersetzen in der Rechnung die AV darunter):{' '}
            {PLAN_ARTEN.map((a, i) => <span key={a}>{i ? ', ' : ''}<span className="farbe" style={{ background: planMarke(a),
              borderColor: PLAN_FARBEN[a].linie }} />{PLAN_NAME[a]}</span>)}; beim Werkzeug «Ecke runden» die Ecken der gewählten
            Fläche als weisse Kreise</li>
          <li><span className="farbe" style={{ background: '#000000', borderRadius: '50%' }} />Signalmast einer Mittelinsel (Standard E1),
            im Kopf auf der Seite der Rollstuhlfurt: nur Hinweis, kein Hindernis; beim Werkzeug «Mittelinsel (Standard)» Vorschau
            gestrichelt, Furt grau, Teilstreifen gelb gestrichelt; Kreis mit Vierfachpfeil in der Inselmitte: Griff zum Ziehen
            (entlang der Achse; frei mit dem Schalter «frei verschieben» oder der Umschalttaste während des Ziehens)</li>
          <li><span className="farbe" style={{ background: planMarke('trottoir'), borderColor: PLAN_FARBEN.trottoir.linie }} />Vorgezogener
            Seitenraum: Plan-Fläche Trottoir mit Griff in der Mitte (entlang der Bordkante ziehen); Parkierung darunter gestrichelt
            (entfällt in der Rechnung)</li>
        </ul>
        </details>

        <details className="abschnitt" id="abschnitt-grundlagen">
        <summary><h2>Grundlagen und Quellen</h2></summary>
        <h3>Rechnung und Sichtweiten</h3>
        <RechnungGrundlagen />
        <h3>Daten</h3>
        <p className="klein">
          Luftbild und Streifen-Erkennung {LUFTBILD_QUELLE}{daten?.flugjahr ? ` (Flugjahr ${daten.flugjahr})` : ''} · Bodenbedeckung und Einzelobjekte: Amtliche Vermessung, Kanton {kantone.join(', ') || '…'}, geodienste.ch ·
          Strassennetz und Übergänge © OpenStreetMap-Mitwirkende (ODbL){fall?.baumkataster && kataster ? ` · ${kataster.quelle.quellenangabe}` : ''}{parkAn && parkKat?.felder ? ` · ${parkKat.quelle.quellenangabe}` : ''}{fall?.quellen.haltestellen ? ` · ${HALT_QUELLE}` : ''}{fall?.quellen.verkehrsdaten ? ` · ${VD_QUELLE}` : ''}{BERN_C_KEYS.filter(k => fall?.quellen[k]).map(k => ` · ${BERN_DIENSTE_C[k].quelle}`).join('')}{hoehenWerte || kurveNeigung ? ' · Höhenmodell swissALTI3D © swisstopo' : ''}.
        </p>
        <p className="klein">
          Streifen aus dem Luftbild, die in OSM fehlen: {ETH_MODELL_QUELLE} (<a href={ETH_MODELL_URL} target="_blank" rel="noopener noreferrer">Artikel ↗</a>,{' '}
          <a href={ETH_MODELL_CODE} target="_blank" rel="noopener noreferrer">Code ↗</a>); Snapshot je Stadt (Bern, Zürich, Basel) mit Abgleich
          © OpenStreetMap-Mitwirkende, nur Hinweis zum Prüfen.
        </p>
        <p className="klein">Die App ersetzt keine Beurteilung vor Ort. Eingaben bleiben im Browser bzw. in der Fall-Datei.</p>
        <h3>Quellen der Prüfungen</h3>
        <QuellenTabelle />
        </details>

        <details className="abschnitt" id="abschnitt-begriffe">
        <summary><h2>Begriffe</h2></summary>
        <p className="klein">Fachbegriffe des Reiters «Bedarf und Querungstyp» in Alltagssprache.</p>
        <BegriffeListe />
        </details>

        <details className="abschnitt" id="abschnitt-regeln">
        <summary><h2>Regeln</h2></summary>
        <RegelUebersicht />
        </details>
        <Datenschutz />
        <Fusszeile />
      </aside>
      {bericht && fall && rechnung && (
        <Bericht fall={fall} rechnung={rechnung} rechnungZeit={rechnungZeit} kantone={kantone} flugjahr={daten?.flugjahr ?? ''}
          luftbildStand={daten?.luftbild ? 'da' : fall.luftbild !== false && quellen.luftbild && !quellen.luftbild.fehler ? 'laedt' : 'fehlt'}
          zusatzQuellen={[...(fall.baumkataster && kataster?.baeume ? [`Baumkataster: ${kataster.quelle.quellenangabe} (WFS map.bern.ch)`] : []),
            ...(parkAn && parkKat?.felder ? [`Amtliche Parkfelder: ${parkKat.quelle.quellenangabe} (WFS map.bern.ch)`] : []),
            ...(fall.quellen.haltestellen ? [`Haltestellen (Vorbelegung Bedarf): ${HALT_QUELLE} (${GEOPORTAL_BERN}, ArcGIS REST map.bern.ch)`] : []),
            ...(fall.quellen.verkehrsdaten ? [`Verkehrsmenge DTV (Vorbelegung Bedarf): ${VD_QUELLE}, DTV = 16·Nt + 8·Nn (${GEOPORTAL_BERN}, ` +
              'ArcGIS REST map.bern.ch)'] : []),
            ...BERN_C_KEYS.filter(k => fall.quellen[k]).map(bernDienstBericht),
            ...(fall.ort.herkunft ? [`Übergang aus dem Luftbild (nicht in OSM): ${ETH_MODELL_QUELLE}`] : []),
            ...(hoehenWerte ? ['Längsneigung der Knotensicht: Höhenmodell swissALTI3D © swisstopo (Profile, api3.geo.admin.ch)'] : []),
            ...(kurveNeigung ? ['Längsgefälle der Kurvenregel: Höhenmodell swissALTI3D © swisstopo (Profil entlang der Fahrlinie, api3.geo.admin.ch)'] : [])]}
          ausserhalb={ausserhalb} aendern={aendern} schliessen={schliessenBericht} namen={zNamen} blaetter={blaetter} />
      )}
    </div>
  )
}

/** Lage und Masse eines Streifens von Hand (Vermassung aus der Rechnung, rechner/vermassung.ts), aufklappbar; Vermassung ab
 * Fixpunkt (fixpunkt.ts) mit Vorschlägen (nächste Gebäudeecke je Strassenseite) */
function MasseAnzeige({ s, e, kopieren, namen, fixpunkte, vorschlaege, setzen, uebernehmen }: { s: StreifenHand; e: StreifenErgebnis | null
  namen: ZufahrtNamen | undefined
  kopieren: (id: string, v: Vermassung) => void; fixpunkte: Fixpunkt[]; vorschlaege: FixVorschlag[]; setzen: () => void
  uebernehmen: (v: FixVorschlag) => void }) {
  const v = e?.vermassung ?? null
  // Rechnung zu einem älteren Stand (Enden bzw. Breite seither geändert): keine alten Masse zeigen
  const aktuell = !!e && e.p0[0] === s.p0[0] && e.p0[1] === s.p0[1] && e.p1[0] === s.p1[0] && e.p1[1] === s.p1[1] && e.bw === s.breite
  return (
    <details className="masse">
      <summary className="klein">Lage und Masse</summary>
      {!v || !aktuell ? <div className="klein">{e && !aktuell ? 'wird neu gerechnet …' : 'noch nicht gerechnet'}</div> : <div className="klein">
        <table className="zahlen"><thead><tr><th>Punkt</th><th>E (LV95)</th><th>N (LV95)</th></tr></thead><tbody>
          {v.punkte.map(q => <tr key={q.name}><td>{q.name}</td><td>{koordText(q.p[0])}</td><td>{koordText(q.p[1])}</td></tr>)}
        </tbody></table>
        <div>Ende A liegt im {v.seiteA}en (erster Punkt). Achse A–B {f2(v.laengeM)} m, {e.trottoirueberfahrt ? (() => {
          // Trottoirüberfahrt (27.10.2026): Breite und Länge der gerechneten Überfahrt statt der Zeichenbreite des Streifens
          const m = tueMasse(e.knotensicht)
          const ks = e.knotensicht
          return m ? `Überfahrt ${f2(m.breite)} m breit und ${f2(m.laenge)} m lang (Knotensicht)`
            : ks && ('fehler' in ks || ks.durchgehend) ? 'keine Masse der Überfahrt (siehe Knotensicht)' : 'Masse der Überfahrt nach der Knotensicht (noch nicht gerechnet)'
        })() : `Breite ${f2(v.breiteM)} m`}, Winkel zur
          Fahrbahnachse {v.winkelGrad !== null ? `${f1(v.winkelGrad)}° (90° = senkrecht; ${v.winkelQuelle})` : `– (${v.winkelQuelle})`}.</div>
        <div>Abstand zum Fahrbahnrand entlang der Achse (+ vor dem Rand, − darüber hinaus): {v.randAbstandM ? <>Ende A
          {' '}{vorzeichenText(v.randAbstandM[0])}, Ende B {vorzeichenText(v.randAbstandM[1])}; Fahrbahn {f2(v.fahrbahnM!)} m</> : '–'}
          {' '}({v.randQuelle}).</div>
        {v.knoten.length > 0 && <div>Nächster Knoten stromauf (OSM, entlang der Strasse ab Streifenrand): {v.knoten.map(k =>
          `${zufahrtText(namen, k.zufahrt)} ${f1(k.abstandM)} m`).join('; ')}.</div>}
        <div><b>Vermassung ab Fixpunkt</b> (längs = entlang der Balken bzw. der Fahrbahn, quer = senkrecht dazu){' '}
          <button className="zweit klein" onClick={setzen} title={'Fixpunkt auf der Karte setzen (fängt Gebäudeecken und Punkte der AV)'}>
            Fixpunkt setzen</button></div>
        {fixpunkte.length > 0 && <table className="zahlen fixmasse"><thead><tr><th>Fixpunkt</th><th>längs zur Kante</th><th>zur Achse</th>
          <th>zum Ende (längs, quer)</th><th>Luftlinie</th></tr></thead><tbody>
          {fixpunkte.map(f => {
            const t = fixMassTexte(fixpunktMasse(f.p, { p0: e.p0, p1: e.p1, breite: e.bw, umriss: e.umriss }))
            return <tr key={f.id}><td>{fixpunktName(f)}<div className="klein">{ART_TEXT[f.art]}</div></td><td>{t.kante}</td>
              <td>{t.achse}</td><td>{t.ende}</td><td>{t.ecke}</td></tr>
          })}
        </tbody></table>}
        {vorschlaege.length > 0 && <div>Vorschlag (nächste Gebäudeecke der AV je Strassenseite, bis {VORSCHLAG_M} m):{' '}
          {vorschlaege.map(x => <span key={x.seite}>Seite {x.seite}, {f1(x.abstandM)} m vom Streifen{' '}
            <button className="zweit klein" onClick={() => uebernehmen(x)}>übernehmen</button>{' '}</span>)}</div>}
        <button className="zweit klein" onClick={() => kopieren(s.id, v)} title={'Punkt, E und N (LV95, Meter, Dezimalpunkt) ' +
          'tabulatorgetrennt in die Zwischenablage, z. B. für CAD oder eine Tabelle; mit den Fixpunkten'}>Koordinaten kopieren</button>
      </div>}
    </details>
  )
}

/** Luftbild-Erkennung: Befund, Schalter, Übernahme als Streifen von Hand */
function LuftbildAnzeige({ rechnung, fall, flugjahr, hatBild, aendern, setMeldung }: {
  rechnung: FallRechnung | null; fall: Fall; flugjahr: string; hatBild: boolean
  aendern: (f: (x: Fall) => Fall) => void; setMeldung: (m: string) => void
}) {
  if (fall.ort.uebergang === null || fall.streifenHand.length) return null
  const lb = rechnung?.luftbild ?? null
  const an = fall.luftbild !== false
  const f1_ = (x: number) => x.toFixed(2).replace('.', ',')
  return (
    <div className="klein luftbild">
      <label><input type="checkbox" checked={an} onChange={e => aendern(f => {
        if (e.target.checked) { delete f.luftbild; if (hatBild) f.quellen.luftbild = `${LUFTBILD_QUELLE}${flugjahr ? `, Flugjahr ${flugjahr}` : ''}` }
        else { f.luftbild = false; delete f.quellen.luftbild }
        return f
      })} />
        {' '}Streifen im Luftbild suchen ({LUFTBILD_QUELLE}{flugjahr ? `, Flugjahr ${flugjahr}` : ''})</label>
      {an && !hatBild && <div className="warnung">Luftbild noch nicht geladen bzw. nicht verfügbar: Streifen aus OSM + AV.</div>}
      {an && lb && (
        <div className={lb.befund === 'erkannt' ? 'pruefen' : lb.befund === 'unsicher' ? 'hinweisbox' : ''}>
          {lb.befund === 'erkannt' && <>Streifen aus dem Luftbild erkannt ({lb.teile.map(t => `${t.nBalken} Balken`).join(' + ')}, NCC {f1_(lb.ncc)},
            Gelb-Kontrast {lb.kontrast.toFixed(1).replace('.', ',')}) – aus Luftbild, prüfen. {lb.nurVorschlag ? <>Mit Flächen (Plan): der
            Streifen aus dem Luftbild (Bestand) ist nur Vorschlag (gestrichelt); gerechnet wird mit OSM + AV nach Plan bzw. mit den
            Streifen von Hand.</> : 'Die Rechnung nutzt ihn.'}</>}
          {lb.befund === 'unsicher' && <>Muster im Luftbild unsicher ({lb.gruende.join('; ')}): gestrichelt als Vorschlag; die Rechnung
            nutzt den Streifen aus OSM + AV{rechnung?.inselTeilt ? ', an der Insel aus dem Luftbild geteilt' : ''}.</>}
          {lb.befund === 'nicht_gefunden' && <>Im Luftbild kein Streifen gefunden ({lb.gruende.join('; ')}): Streifen aus OSM + AV.</>}
          {(lb.befund === 'unsicher' || lb.nurVorschlag) && lb.teile.length > 0 && <div><button className="zweit klein" onClick={() => {
            let n = 0, ni = 0
            // die Insel, an der die Luftbild-Teile geteilt sind, als Insel von Hand mit (sonst ginge die Teilung verloren)
            aendern(f => { const vor = f.hindernisse.length
              n = streifenUebernehmen(f, lb.teile, rechnung?.streifen ?? [], lb.nurVorschlag ? 'luftbild' : 'luftbild_vorschlag', lb.insel ? [lb.insel] : [])
              ni = f.hindernisse.length - vor; return f })
            setMeldung(`Streifen aus dem Luftbild als Streifen von Hand übernommen${n ? `; ${n} Eingaben übertragen – bitte prüfen` : ''}` +
              `${ni ? '; die Insel aus dem Luftbild steht jetzt als Insel von Hand unter den Hindernissen' : ''}.`)
          }}>Luftbild-Streifen übernehmen und anpassen</button></div>}
          <div>Erkennung {Math.round(lb.ms)} ms.</div>
        </div>
      )}
    </div>
  )
}

/** Link «Street View ↗» je Zufahrt (Blick der Fahrenden vom Sichtpunkt in Soll-Distanz auf die Wartefläche); der Klick wählt die
 * Zeile nicht */
function StreetViewZufahrt({ url, nr }: { url: string | null; nr: string }) {
  if (!url) return null
  return <div className="klein"><a href={url} target="_blank" rel="noopener noreferrer" className="streetview-link" title={zufahrtStreetViewTitel(nr)}
    onClick={e => e.stopPropagation()}>Street View ↗</a></div>
}

/** Tooltip gedeckter Abbiegezufahrten (nur mit GEDECKT_RECHNEN, seit 14.10.2026 standardmässig aus) */
const GEDECKT_TITEL = 'Geprüft; den Weg ab dem Knoten prüft die gerade Zufahrt mit; das Ergebnis zählt trotzdem'

function StreifenAnzeige({ s, fall, auswahl, setAuswahl, aendern, gewaehlteZ, spurZeichnen, ausserhalb, neuLaden, namen, alleStreifen, alleNamen, blatt,
  ksPhase, setKsPhase, grau = false, neigung = null }: {
  s: StreifenErgebnis; fall: Fall; auswahl: string | null; setAuswahl: (k: string | null) => void
  /** unmarkierte OSM-Querung (29.10.2026): ohne Wahl als Querung ohne Vortritt angenommen, Fussgängerstreifen ausdrücklich wählbar */
  grau?: boolean
  /** Längsneigung der Fahrlinie je «fgsId|zufahrt» (Höhenprofil; Sicht vom Velo) */
  neigung?: Readonly<Record<string, NeigungMessung>> | null
  ksPhase: KsPhase; setKsPhase: (p: KsPhase) => void   // Knotensicht: gezeigte Phase (Karte und Block gleich)
  blatt: BefundBlatt | null          // Bedarf der Querung: Lage (Hinweis zur Trottoirüberfahrt) und OSM-Knoten (SichtweitenCheck)
  alleStreifen: StreifenErgebnis[]; alleNamen: Map<string, ZufahrtNamen>   // für «geprüft beim anderen Teil» bzw. die gerade Zufahrt
  namen: ZufahrtNamen | undefined    // Zufahrten nach Strasse und Herkunft (benennung.ts)
  aendern: (f: (x: Fall) => Fall) => void; gewaehlteZ: ZufahrtErgebnis | null; spurZeichnen: (key: string) => void
  ausserhalb: Ausserhalb | null      // Streifen von Hand ausserhalb der geladenen Daten (abdeckung.ts)
  neuLaden: () => void               // um diesen Streifen neu laden
}) {
  const se = fall.streifen[s.fgsId] ?? {}
  // Lage der Querung im Bedarf (Vorbelegung bzw. von Hand): bekannt und keine Einmündung → Hinweis an der Trottoirüberfahrt
  const lage = blatt?.gebildet.eingaben.lage.wert ?? null
  const nichtEinmuendung = lage !== null && lage !== 'einmuendung' && lage !== 'knoten_belastet'
  const setzeS = (e: Partial<typeof se>) => aendern(f => {
    const neu = { ...(f.streifen[s.fgsId] ?? {}), ...e }
    for (const k of Object.keys(neu) as (keyof typeof neu)[]) if (neu[k] === undefined || neu[k] === false) delete neu[k]
    f.streifen[s.fgsId] = neu
    return f
  })
  return (
    <section className="streifen">
      <h2>
        <span className="farbe" style={{ background: STATUS_FARBE[s.status] ?? '#64748b' }} />
        {streifenTitel(s.fgsId, fall.streifenHand, !!s.trottoirueberfahrt)} {s.strasse && <>– {s.strasse}</>}{s.trottoirueberfahrt ? null : <>: {streifenStatus(s)}</>}
        {s.querung && <span className="klein"> (ohne Vortritt)</span>}
      </h2>
      <div className="klein zeile">
        {s.trottoirueberfahrt ? <LsaEinmuendung fall={fall} blatt={blatt} aendern={aendern} /> : <>
        Lichtsignal: <select value={se.lsa ?? ''} onChange={e => setzeS({ lsa: (e.target.value || undefined) as 'ja' | 'nein' | undefined })}>
          <option value="">automatisch ({s.lsa === 'ja' ? 'ja' : 'nein'}{s.lsa === 'ja' && s.lsaQuelle !== 'von Hand' ? ', aus OSM' : ''})</option>
          <option value="ja">ja (von Hand)</option><option value="nein">nein (von Hand)</option>
        </select></>}
        {' '}<label title={'Kein Fussgängerstreifen: Streifen nicht prüfen (Bestand ohne Markierung). Für eine geplante bzw. bestehende ' +
          'Querung ohne Vortritt stattdessen unten «Querung» wählen: sie wird mit der Sichtweite nach VSS 40 240 Z. 8.2 geprüft.'}>
          <input type="checkbox" checked={!!se.keinFgs} onChange={e => setzeS({ keinFgs: e.target.checked, typ: e.target.checked ? undefined : se.typ })} /> kein FGS</label>
      </div>
      <div className="klein zeile">
        <label htmlFor={`querung-${s.fgsId}`}>Querung:</label> <select id={`querung-${s.fgsId}`} value={se.typ ?? ''} disabled={!!se.keinFgs} title={se.keinFgs ? '«kein FGS»: nicht geprüft' :
          'Fussgängerstreifen: Sichtweite nach VSS 40 241 Tab. 1. Ohne Vortritt (Furt bzw. Nase, Einengung, ohne Massnahme): Sichtweite ' +
          'nach VSS 40 240 Z. 8.2 je Teilquerung, auf der Karte ohne Balken. Trottoirüberfahrt: keine Sicht auf die Wartefläche, ' +
          'massgebend ist die Knotensicht der Einbiegenden (hier gerechnet)'}
          onChange={e => setzeS({ typ: (STREIFEN_QUERUNGEN as string[]).includes(e.target.value) ? e.target.value as StreifenQuerung : undefined })}>
          {grau ? <><option value="">automatisch: ohne Vortritt ({!se.typ && s.querung?.typ === 'furt' ? 'Furt' : !se.typ && s.querung ? 'ohne bauliche Massnahme'
            : 'nach der Insel'}), unmarkiert in OSM</option><option value="fgs">Fussgängerstreifen (geplant bzw. zu prüfen)</option></>
            : <option value="">Fussgängerstreifen</option>}
          <option value="furt">ohne Vortritt: Furt (Insel ohne Balken)</option>
          <option value="ohne_vortritt">ohne Vortritt: Nase, Einengung bzw. ohne bauliche Massnahme</option>
          <option value="trottoirueberfahrt">{TUE_OPTION}{nichtEinmuendung ? ` – ${TUE_NUR_EINMUENDUNG}` : ''}</option>
        </select>
      </div>
      {s.trottoirueberfahrt && <KnotensichtBlock ks={s.knotensicht} fgsId={s.fgsId} titel={id => streifenTitel(id, fall.streifenHand, true)}
        lage={nichtEinmuendung ? lage : null}
        breiteHand={tueBreiteHand(fall)} setzeBreite={m => aendern(f => {
          const felder = { ...(f.bedarf?.felder ?? {}) }
          if (m === null) delete felder['q3.breiteM']; else felder['q3.breiteM'] = { wert: m, quelle: 'hand' }
          f.bedarf = { ...(f.bedarf ?? {}), felder }
          return f
        })}
        // Planung: Tempo der Hauptstrasse (27.10.2026) = Bedarf «Tempo auf der Hauptstrasse» von Hand; «aus den Daten» entfernt die Eingabe
        tempoHand={(() => { const h = fall.bedarf?.felder['q3.vSigHaupt']; return h?.quelle === 'hand' && typeof h.wert === 'number' ? h.wert : null })()}
        setzeTempo={v => aendern(f => {
          const b = handSetzen(f.bedarf, 'q3.vSigHaupt', v, 'hand')
          if (b) f.bedarf = b; else delete f.bedarf
          return f
        })}
        // Auge von Hand (27.10.2026): am Streifen, an dem die Knotensicht rechnet
        augeVonHand={(() => { const e = fall.streifen[s.fgsId]; return e ? [...(e.tueD ? ['fahrbahn' as const] : []), ...(e.tueDtrottoir ? ['trottoir' as const] : [])] : null })()}
        phase={ksPhase} setzePhase={setKsPhase}
        augeZuruecksetzen={() => aendern(f => {
          const e = f.streifen[s.fgsId]
          if (e) { const { tueD: _d, tueDtrottoir: _t, ...rest } = e; void _d; void _t; f.streifen[s.fgsId] = rest }
          return f
        })} />}
      {s.querung && <p className="klein">Querung ohne Vortritt: Sichtweite nach <VerweisText text="VSS 40 240" />, Ziffer 8.2, max(v · L / 1,2 m/s; Anhaltesichtweite) mit
        L = {f1(s.querung.L)} m{s.querung.ganzeFahrbahn ? ' (Insel nur markiert: ganze Fahrbahn)' : ''}; kein Fussgängerstreifen.</p>}
      <p className="klein">Zuordnung OSM: {s.netzQuelle} · Bordkanten: {s.randQuelle === 'AV' ? 'AV' : 'angenommen'} ·
        {s.trottoirueberfahrt ? <>Achse der Überfahrt {f1(Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]))} m (Masse der Überfahrt: Knotensicht)</>
          : <>Länge {f1(Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]))} m, Breite {f1(s.bw)} m</>}</p>
      {ausserhalb && <p className="klein warnung"><b>Ausserhalb der geladenen Daten:</b> {ausserhalbText(ausserhalb)}{' '}
        <button className="zweit klein" onClick={neuLaden}>um {streifenTitel(s.fgsId, fall.streifenHand, !!s.trottoirueberfahrt)} neu laden</button></p>}
      {s.keinFgsHinweis && <p className="keinfgs klein">Kein Fussgängerstreifen: Prüfung sinngemäss nach den FGS-Regeln, ohne Normbezug.</p>}
      {s.querungAnnahme && <p className="pruefen klein">{s.querungAnnahme}</p>}
      {s.markierungHinweis && <p className="pruefen klein">Vermutlich Fussgängerstreifen (Markierung in OSM nicht erfasst), bitte prüfen.</p>}
      {s.luftbildUebergang && <p className="pruefen klein">{s.luftbildUebergang}</p>}
      {s.lsa === 'ja' && <p className="klein">Mit Lichtsignal gilt die <VerweisText text="Arbeitshilfe Fussgängerstreifen Kanton Bern" /> nicht; die Rechnung wird trotzdem gezeigt.</p>}
      {s.annahmen.length > 0 && <ul className="annahmen">{s.annahmen.map(a => <li key={a}>{a}</li>)}</ul>}
      {s.status !== 'kein_fgs' && (
        <table className="zufahrten">
          <thead><tr><th>Zufahrt</th><th>Tempo</th><th title="Sichtweite, die frei sein muss (nach Tempo bzw. Kurvenradius)">nötige Sicht</th>
            <th>Ergebnis</th></tr></thead>
          <tbody>
            {nachNr(s.zufahrten, namen).map(z => (<Fragment key={z.zufahrt}>
              <tr className={zufahrtKey(z) === auswahl ? 'aktiv' : ''}
                title={`Fahrtrichtung ${z.richtung}° (Zufahrt «${z.zufahrt}», ab Osten gegen den Uhrzeigersinn); Fahrt von ${zufahrtHerkunft16(z, s.bw)}` +
                  (z.deckung ? `. ${GEDECKT_TITEL}` : '')}
                onClick={() => setAuswahl(zufahrtKey(z) === auswahl ? null : zufahrtKey(z))}>
                <td><NrMarke nr={zufahrtNr(namen, z.zufahrt)} gewaehlt={zufahrtKey(z) === auswahl} /><b>{zufahrtLang(namen, z.zufahrt)}</b>
                  {z.deckung && <span className="klein"> (mitgeprüft)</span>}<div className="klein">{ART[z.art] ?? z.art}{z.netzHinweis.includes('hofzufahrt') ? ', Hofzufahrt (bfu Knotenregel, ab der Einmündung)' : ''}
                  {z.art === 'abbiegend' && z.ueberStrasse ? `, weiter auf ${z.ueberStrasse}` : ''}</div>
                  {z.lageQuelle === 'Hand' && <div className="klein">Fahrlinie von Hand</div>}
                  <StreetViewZufahrt url={zufahrtStreetView(z, s)} nr={zufahrtNr(namen, z.zufahrt) || z.zufahrt} /></td>
                <td>{z.tempo} km/h<div className={z.tempoQuelle === 'Ersatz' ? 'klein warnung' : 'klein'}>({tempoHerkunft(z.tempoQuelle)})</div></td>
                <td title={`Herleitung: ${z.sichtweiteQuelle}${z.kurvenradiusM != null ? `, Kurvenradius ${f1(z.kurvenradiusM)} m` : ''}`}>{mText(z.sichtweite)} m
                  <div className="klein">({sichtQuelleKurz(z.sichtweiteQuelle)})</div>
                  {z.geprueftBisM != null && <div className="klein warnung">geprüft bis {z.geprueftBisM} m, darüber nicht geprüft</div>}</td>
                <td><span className="farbe" style={{ background: STATUS_FARBE[z.status] }} />{statusText(z, fall.hindernisse)}
                  {z.unter5m && <div className="klein warnung">Parkfeld unter 5 m</div>}
                  {z.erkennungM && <div className="klein" title={ERKENNUNG_TITEL}>{erkennungText(z.erkennungM)}</div>}</td>
              </tr>
              {/* Sicht vom Velo (29.10.2026): zweite Prüfung von der Veloachse, nur mit Radstreifen bzw. Radweg */}
              {z.velo && (() => {
                const vs = veloSoll(z, neigung)!
                return <tr className="velo-zeile">
                  <td className="klein">↳ Velo ({z.velo.fuehrung === 'radstreifen' ? 'Radstreifen' : 'Radweg nach OSM'}, Achse {f1(z.velo.vomRandM)} m vom Rand)</td>
                  <td />
                  <td title={`Herleitung: VSS 40 273 ${vs.text}; ${vs.neigungText}`}>{vs.A} m<div className="klein">(VSS 40 273 Tab. 3)</div>
                    <div className="klein">{vs.neigungText}</div></td>
                  <td><span className="farbe" style={{ background: STATUS_FARBE[vs.frei ? 'frei' : 'verdeckt'] }} />
                    Velo: {vs.frei ? 'frei' : `verdeckt, frei bis ${z.velo.freiBisM} m`}, Soll {vs.A} m
                    {vs.nurBis !== undefined && <div className="klein warnung">geprüft bis {vs.nurBis} m, darüber nicht geprüft</div>}
                    {vs.ebikeA !== null && <div className="klein" title="VSS 40 273 Tab. 3">mit Verbot für schnelle E-Bikes gälte {vs.ebikeA} m</div>}</td>
                </tr>
              })()}
            </Fragment>))}
            {!s.zufahrten.length && <tr><td colSpan={4} className="klein">keine Zufahrt</td></tr>}
          </tbody>
        </table>
      )}
      {gewaehlteZ && gewaehlteZ.fgsId === s.fgsId && <ZufahrtDetail z={gewaehlteZ} name={zufahrtLang(namen, gewaehlteZ.zufahrt)}
        nr={zufahrtNr(namen, gewaehlteZ.zufahrt)} fall={fall}
        aendern={aendern} spurZeichnen={spurZeichnen} />}
      {s.entfallen.length > 0 && (
        <details>
          <summary className="klein" title={ENTFALLEN_ERKLAERUNG}>{ENTFALLEN_TITEL} ({s.entfallen.length})</summary>
          <table><tbody>
            {s.entfallen.map(e => {
              const g = entfallenGrund(e, s, alleStreifen, fid => streifenTitel(fid, fall.streifenHand), (fid, z) => zufahrtLang(alleNamen.get(fid), z))
              return <tr key={e.kennung + e.zufahrt} title={`Fahrtrichtung ${e.richtung}° (ab Osten gegen den Uhrzeigersinn)${g.zusatz ? `; Rechnung: ${g.zusatz}` : ''}`}>
                <td><NrMarke nr={entfallenNr(namen, e)} />{entfallenLang(namen, e)}</td><td>{g.text}{g.kurz && <div className="klein">{g.kurz}</div>}
                {e.grund === 'hand' && <button className="zweit klein" onClick={() => aendern(f => {
                  const k = zufahrtSchluessel(s.fgsId, e.kennung)
                  if (f.zufahrten[k]) delete f.zufahrten[k].streichen
                  return f
                })}>wieder prüfen</button>}</td></tr>
            })}
          </tbody></table>
        </details>
      )}
    </section>
  )
}

function ZufahrtDetail({ z, name, nr, fall, aendern, spurZeichnen }: {
  z: ZufahrtErgebnis; name: string; nr: string; fall: Fall; aendern: (f: (x: Fall) => Fall) => void; spurZeichnen: (key: string) => void
}) {
  const key = zufahrtSchluessel(z.fgsId, z.kennung)
  const zh = fall.zufahrten[key] ?? {}
  const setze = (neu: Partial<typeof zh> | null) => aendern(f => {
    const x = { ...(f.zufahrten[key] ?? {}), ...(neu ?? {}) }
    for (const k of Object.keys(x) as (keyof typeof x)[]) if (x[k] === undefined) delete x[k]
    if (Object.keys(x).length) f.zufahrten[key] = x; else delete f.zufahrten[key]
    return f
  })
  const spur = zh.spur
  const kreis = spur?.art === 'B' ? linieKreis(spur.linie) : null
  return (
    <div className="detail">
      <h3><NrMarke nr={nr} gewaehlt />{name} <span className="klein">(Fahrtrichtung {z.richtung}°, Kennung {z.kennung})</span></h3>
      <table className="zahlen"><tbody>
        <tr><td>Tempo</td><td>
          <select value={zh.tempo ?? ''} onChange={e => setze({ tempo: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">{zh.tempo ? 'aus den Daten' : `${z.tempo} km/h (${z.tempoQuelle === 'Ersatz' ? 'Annahme' : z.tempoQuelle === 'Geoportal' ? 'Geoportal' : 'aus OSM'})`}</option>
            {[20, 30, 40, 50, 60, 80].map(t => <option key={t} value={t}>{t} km/h (von Hand)</option>)}
          </select></td></tr>
        <tr><td>Sichtweite</td><td>{mText(z.sichtweite)} m ({z.sichtweiteQuelle}){z.geprueftBisM != null &&
          <span className="warnung">; geprüft bis {z.geprueftBisM} m (Reichweite der geladenen Daten), darüber nicht geprüft</span>}</td></tr>
        {z.kurvenradiusM != null && <tr><td>Radius</td><td>{f1(z.kurvenradiusM)} m ({z.radiusQuelle})</td></tr>}
        {z.erkennungM && <tr><td>Erkennbar</td><td title={ERKENNUNG_TITEL}>{erkennungText(z.erkennungM)}; Sichtrechner, ohne Gelände (Annahme)</td></tr>}
        {z.knotenM != null && <tr><td>Knoten</td><td>{f1(z.knotenM)} m vor dem Streifen</td></tr>}
        {z.deckung && <tr><td>Mitgeprüft</td><td title={GEDECKT_TITEL}>ab dem Knoten durch die gerade Zufahrt ({z.deckung}); zählt trotzdem</td></tr>}
        <tr><td>Fahrbahn</td><td>{z.fahrbahnM != null ? `${f2(z.fahrbahnM)} m` : '–'}, Fahrstreifen
          {z.fahrstreifenM != null ? ` ${f2(z.fahrstreifenM)} m` : ' –'}{z.mehrstreifig ? ' (mehrstreifig)' : ''}</td></tr>
        <tr><td>Sichtpunkt vom Rand</td><td>{z.sichtpunktVomRandM != null ? `${f2(z.sichtpunktVomRandM)} m` : '–'} (Lage {z.lageQuelle}){z.abzugQuelle ? `; von der Fahrbahn abgezogen: ${abzugTeile(z.abzugQuelle)}` : ''}</td></tr>
        <tr><td>Sichtfeld</td><td>{z.konflikte.length ? z.konflikte.map(k => `${k.layer}${k.klasse === 'baum' ? '' : ` ${f1(k.flaeche)} m²`}`).join('; ') : 'kein Hindernis'}
          {z.minAbstandAutoM != null && <div className="klein">Auto-Parkfeld {f1(z.minAbstandAutoM)} m vom Streifen{z.unter5m ? ' (unter 5 m)' : ''}</div>}</td></tr>
        {z.netzHinweis.length > 0 && <tr><td>Hinweise Netz</td><td className="klein">{z.netzHinweis.join(', ')}</td></tr>}
      </tbody></table>
      {z.annahmen.length > 0 && <ul className="annahmen">{z.annahmen.map(a => <li key={a}>{a}</li>)}</ul>}
      <div className="klein spur">
        <b title={'Die Fahrlinie ist die Linie, auf der das Auto fährt, das den Wartebereich sehen muss; auf ihr liegen die ' +
          'Sichtpunkte. Korrigieren, wenn sie nicht dort liegt, wo Autos fahren (z. B. im Velostreifen, auf der Haltestelle, im ' +
          'falschen Fahrstreifen).'}>Fahrlinie korrigieren</b>{' '}
        <span className="klein">(falls die Sichtpunkte nicht dort liegen, wo Autos fahren)</span><br />
        {z.art !== 'abbiegend' && <>
          <span title={'Die berechnete Linie seitlich verschieben: erster Wert am Streifen, zweiter am Ende der Sichtweite, ' +
            'dazwischen gleichmässig. Plus = nach links in Fahrtrichtung, minus = nach rechts. Beispiel 1,5 / 1,5: ganze Linie 1,5 m ' +
            'nach links. Nur gerade Zufahrten.'}>A: Linie seitlich verschieben:</span> am Streifen <ZahlFeld wert={spur?.art === 'A' ? spur.a : 0}
            setze={x => setze({ spur: { art: 'A', a: x, b: spur?.art === 'A' ? spur.b : 0 } })} /> m,
          am Ende <ZahlFeld wert={spur?.art === 'A' ? spur.b : 0}
            setze={x => setze({ spur: { art: 'A', a: spur?.art === 'A' ? spur.a : 0, b: x } })} /> m
          (+ links, − rechts) ·{' '}
        </>}
        <button className="zweit klein" onClick={() => spurZeichnen(key)} title={'Fahrlinie auf der Karte selbst zeichnen: am Streifen beginnen, gegen die Fahrtrichtung klicken, Doppelklick ' +
          'beendet. Die Sichtpunkte liegen alle 2 m auf der Linie; ist sie kürzer als die Sichtweite, wird sie gerade verlängert. ' +
          'Auch für Kurven und Abbiegende.'}>B: Fahrlinie selbst zeichnen</button>
        {spur && <button className="zweit klein" onClick={() => setze({ spur: undefined })} title="wieder die berechnete Fahrlinie verwenden">Fahrlinie zurücksetzen</button>}
        {spur?.art === 'B' && z.art === 'abbiegend' && kreis && (
          <div>
            Kreis der Linie: {kreis.r !== null ? `${f1(kreis.r)} m (${kreis.text})` : kreis.text}
            {kreis.r !== null && kreis.r >= RADIUS_HAND_M[0] && kreis.r <= RADIUS_HAND_M[1] && (
              <label> <input type="checkbox" checked={!!spur.radius} onChange={e => setze({ spur: { ...spur,
                radius: e.target.checked ? Math.round(kreis.r! * 10) / 10 : null } })} /> Radius übernehmen</label>)}
          </div>
        )}
      </div>
      <label className="klein" title={'Zufahrt aus der Prüfung nehmen, wenn es sie in Wirklichkeit nicht gibt, z. B. verbotenes ' +
        'Abbiegen, Einbahn in Gegenrichtung, reine Arealzufahrt. Sie zählt nicht mehr für den Status und steht unter «entfallen» ' +
        '(«von Hand gestrichen»); Häkchen entfernen holt sie zurück. Abbiegezufahrten, die bisher wegen der geraden Zufahrt ' +
        'entfielen («durch die gerade Zufahrt mitgeprüft»), werden nach dem Streichen selbst geprüft, bis zum Knoten mit Tab. 1 ' +
        'der eigenen Strasse.'}><input type="checkbox" checked={!!zh.streichen} onChange={e => setze({ streichen: e.target.checked || undefined })} />
        {' '}Diese Zufahrt gibt es nicht (streichen)</label>
    </div>
  )
}
