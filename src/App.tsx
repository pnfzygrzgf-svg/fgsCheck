import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type L from 'leaflet'
import Karte, { AV_FARBEN, STATUS_FARBE, QUELLE_FARBE, PARK_FARBE, UEBERGANG_FARBE, LUFTBILD_FARBE, INSEL_FARBE, INSEL_TEXT, zufahrtKey,
  hindernisText, hindernisFarbe, type Werkzeug, type KartenHinweis } from './Karte'
import { ladeAvRoh, ladeSosfRoh, avParsen, type AvFlaeche, type GeoJson } from './daten/av'
import { ladeLuftbild, ladeFlugjahr, luftbildLaden, LUFTBILD_QUELLE, LUFTBILD_NAME, type LuftbildRoh } from './daten/luftbild'
import { ladeOsmRoh, ladeUebergaenge, markierung, istFgs, overpassSperre, strassennamen, namenKarte, type OsmKnoten,
  type StrassenMitte } from './daten/osm'
import { istAbbruch } from './daten/holen'
import { baumQuelleFuer, type BaumQuelle, type KatasterBaum } from './daten/baumkataster'
import { parkQuelleFuer, istParkId, type ParkQuelle, type KatasterFeld } from './daten/parkkataster'
import { lv95, dist, type P } from './geo'
import { type Box, type CacheEintrag, enthaelt, abfrageBox, zuGross, imCache, aufnehmen, vereinigen, vereinigenNamen } from './ausschnitt'
import type { ZufahrtErgebnis, StreifenErgebnis } from './rechner/typen'
import type { FallRechnung } from './rechner'
import { KATASTER_PARK_M } from './rechner/vorschlaege'
import { SICHTWEITE, KURVE_SICHTWEITE } from './rechner/tempo'
import { type Hindernis, BAUM_STAMM_M, LAENGS_BREITE_M } from './rechner/hindernisse'
import { linieKreis, RADIUS_HAND_M } from './rechner/spurhand'
import { GRUND, ART, STATUS, statusText, f1, f2 } from './texte'
import Bericht from './Bericht'
import { Anleitung, Datenschutz, Fusszeile } from './Hilfe'
import { type Fall, type FallErgebnis, leererFall, fallLesen, fallSchreiben, fallMerken, fallErinnern, zufahrtSchluessel, eingabenZahl,
  naechsteHandId, streifenUebernehmen, eingabenVerwaist, streifenHerkunftText } from './fall'

interface QuellenStand { name: string; objekte?: string; ms?: number; bytes?: number; server?: string; fehler?: string }
interface ParkStand { quelle: ParkQuelle; nr: number; lat: number; lon: number; felder: KatasterFeld[] | null; laedt?: boolean; fehler?: string }
interface Daten { osm: unknown; av: GeoJson; sosf: GeoJson | null; nid: number | null; bfs: (number | null)[]; luftbild: LuftbildRoh | null; flugjahr: string
  ort: P }                                         // Ort in LV95 (Luftbild nachladen)

const AV_RADIUS_M = 150
const OSM_RADIUS_M = 300
const START: [number, number] = [46.9420585, 7.4322619]      // Startansicht: Mühlemattstrasse, Bern
const WORKER_MS = 30000
// Automatische Übergangssuche nach dem Verschieben bzw. Zoomen: ab SUCHE_ZOOM (rund 1:10 000; weiter draussen wird der
// Ausschnitt für eine Overpass-Abfrage zu gross; dazu Flächengrenze in ausschnitt.ts), SUCHE_PAUSE_MS nach dem letzten moveend,
// zwischen zwei Abfragen mindestens SUCHE_ABSTAND_MS (Overpass Fair Use: höchstens eine laufende Suche, keine Abfragen-Flut
// beim Herumschieben)
const SUCHE_ZOOM = 16
const SUCHE_PAUSE_MS = 800
const SUCHE_ABSTAND_MS = 2000
const SUCHE_NAME = 'OSM-Übergänge und Strassennamen im Ausschnitt'
const ZU_WEIT: KartenHinweis = { text: 'Zum Suchen näher heranzoomen' }
// Amtliche Parkfelder und Baumkataster: Ausschnitt ±150 m um den Ort. Die Rechnung erreicht Felder und Bäume bis
// KATASTER_PARK_M (120 m) um den Umriss der Streifen (rechner/vorschlaege.ts, dort die Herleitung); der Umriss liegt am Ort
// (OSM-Knoten im Streifen, Luftbild-Streifen höchstens 4 m daneben), reicht aber bis zur halben Streifenlänge (breite
// Fahrbahn, Teilstreifen) davon weg: 120 + rund 15 m + Reserve. 150 m entspricht dem AV-Ausschnitt (weiter reicht die
// Fahrbahn der Rechnung nicht) und dem Umkreis der Berner Prüfung. Baumkataster bis 11.10.2026 ±100 m (Bäume bis 100 m um
// die Streifenmitte).
const PARK_RADIUS_M = 150
const KATASTER_RADIUS_M = PARK_RADIUS_M
const STREIFEN_MIN_M = 1.0                      // Streifen von Hand: kürzeste Länge
const WERKZEUGE: [Exclude<Werkzeug, null>, string, string][] = [
  ['parkfeld', 'Parkfeld', 'Ecken anklicken, Doppelklick schliesst'],
  ['laengs', 'Längsparkierung', 'Mittellinie der Parkierung zeichnen, Doppelklick beendet'],
  ['baum', 'Baum', 'Stamm anklicken'],
  ['hecke', 'Hecke', 'Linie zeichnen, Doppelklick beendet'],
  ['mauer', 'Mauer', 'Linie zeichnen, Doppelklick beendet'],
  ['flaeche', 'übriges Hindernis', 'Fläche: Ecken anklicken, Doppelklick schliesst'],
  ['insel', 'Insel', 'Verkehrsinsel: Ecken anklicken, Doppelklick schliesst; teilt den Streifen und ersetzt eine Insel aus OSM und Luftbild'],
  ['streifen', 'Streifen von Hand', 'beide Wartebereiche anklicken (Achse quer über die Fahrbahn)'],
]

/** Anzeige der AV-Arten in der Legende (Schlüssel wie in AV_FARBEN) */
const AV_NAME: Record<string, string> = { Strasse_Weg: 'Fahrbahn', Gebaeude: 'Gebäude' }

const MIN_PUNKTE: Record<Exclude<Werkzeug, null>, number> = { parkfeld: 3, flaeche: 3, insel: 3, laengs: 2, hecke: 2, mauer: 2, streifen: 2,
  spurB: 2, baum: 1 }
const WERKZEUG_NAME: Record<Exclude<Werkzeug, null>, string> = { parkfeld: 'Parkfeld', flaeche: 'übriges Hindernis (Fläche)', insel: 'Insel',
  laengs: 'Längsparkierung', hecke: 'Hecke', mauer: 'Mauer', streifen: 'Streifen von Hand', spurB: 'Fahrlinie selbst zeichnen', baum: 'Baum' }

/** Zahlenfeld, das Minus und Komma beim Tippen zulässt; übernommen beim Verlassen bzw. mit Enter */
function ZahlFeld({ wert, setze, titel }: { wert: number; setze: (x: number) => void; titel?: string }) {
  const [text, setText] = useState(String(wert).replace('.', ','))
  useEffect(() => { setText(String(wert).replace('.', ',')) }, [wert])
  const uebernehmen = () => {
    const x = Number(text.trim().replace(',', '.').replace('−', '-'))
    if (Number.isFinite(x) && Math.abs(x) < 20) setze(Math.round(x * 100) / 100)
    else setText(String(wert).replace('.', ','))
  }
  return <input type="text" inputMode="decimal" className="zahl" title={titel} value={text} onChange={e => setText(e.target.value)}
    onBlur={uebernehmen} onKeyDown={e => { if (e.key === 'Enter') uebernehmen() }} />
}

let zaehler = 0
const neueId = (p: string) => `${p}-${Date.now().toString(36)}-${(zaehler++).toString(36)}`

export default function App({ onStartseite }: { onStartseite?: () => void } = {}) {
  const kartenRef = useRef<L.Map | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const abbruchRef = useRef<AbortController | null>(null)
  const auftrag = useRef(0)
  const [uebergaenge, setUebergaenge] = useState<OsmKnoten[]>([])
  const [gewaehlt, setGewaehlt] = useState<OsmKnoten | null>(null)
  const [daten, setDaten] = useState<Daten | null>(null)
  const [av, setAv] = useState<AvFlaeche[] | null>(null)
  const [fall, setFall] = useState<Fall | null>(null)
  const [rechnung, setRechnung] = useState<FallRechnung | null>(null)
  const [rechnet, setRechnet] = useState(false)
  const [rechnungFall, setRechnungFall] = useState<Fall | null>(null)   // Fall, zu dem die angezeigte Rechnung gehört
  const [rechnungZeit, setRechnungZeit] = useState<Date | null>(null)
  const [bericht, setBericht] = useState(false)                          // Druckansicht (Bericht) offen
  const [meldung, setMeldung] = useState<string>('Ort suchen bzw. Karte verschieben; dann einen Übergang auf der Karte anklicken.')
  // Hinweis zum Laden des Falls (Fall-Datei, Browser-Speicher); bleibt stehen, bis ein anderer Ort geladen wird
  const [ladeHinweis, setLadeHinweis] = useState<{ text: string; verwerfen: boolean } | null>(null)
  const [auswahl, setAuswahl] = useState<string | null>(null)
  const [quellen, setQuellen] = useState<Record<string, QuellenStand>>({})
  const [werkzeug, setWerkzeug] = useState<Werkzeug>(null)
  const [zeichnung, setZeichnung] = useState<P[]>([])
  const [bearbeiten, setBearbeiten] = useState<string | null>(null)
  const [klasse, setKlasse] = useState<'auto' | 'velo'>('auto')
  const [breite, setBreite] = useState(LAENGS_BREITE_M)
  const [streifenBreite, setStreifenBreite] = useState(4)
  const [sichtbehindernd, setSichtbehindernd] = useState(true)
  const [spurFuer, setSpurFuer] = useState<string | null>(null)     // Zufahrt, für die eine Linie (Spur B) gezeichnet wird
  const [nurMarkiert, setNurMarkiert] = useState(false)
  const [kataster, setKataster] = useState<{ quelle: BaumQuelle; baeume: KatasterBaum[] | null; fehler?: string } | null>(null)
  // amtliche Parkfelder: nr = Nummer des Ladevorgangs (ladeNr), damit ein alter Abruf keine Felder in einen neuen Fall schreibt
  const ladeNr = useRef(0)
  const [parkKat, setParkKat] = useState<ParkStand | null>(null)
  const setzeQuelle = (k: string, s: QuellenStand) => setQuellen(q => ({ ...q, [k]: s }))
  // Eingabe der Rechnung: nur die geladenen Felder und die Quellenangabe. Der Ladezustand (laedt, fehler) löst keine Rechnung
  // aus; nach erfolgreichem Laden ändern sich felder (und im selben Schritt fall.quellen) -> genau eine neue Rechnung.
  const parkFelder = parkKat?.felder ?? null, parkAngabe = parkKat?.quelle.quellenangabe ?? ''
  const parkDaten = useMemo(() => (parkFelder ? { felder: parkFelder, quellenangabe: parkAngabe } : null), [parkFelder, parkAngabe])

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

  const rechnen = useCallback(async (d: Daten, f: Fall, kat: typeof kataster, pk: typeof parkDaten) => {
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
        park: pk && f.parkkataster !== false ? pk : null })
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

  // nach jeder Änderung den Fall merken (ohne Eingaben: Eintrag entfernen; auch während des Ladens, z. B. nach «Eingaben verwerfen»)
  useEffect(() => { if (fall) fallMerken(fall) }, [fall])
  // und neu rechnen (kurz entprellt)
  useEffect(() => {
    if (!daten || !fall) return
    const t = setTimeout(() => rechnen(daten, fall, kataster, parkDaten), 200)
    return () => clearTimeout(t)
  }, [daten, fall, kataster, parkDaten, rechnen])

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

  const suchen = useCallback(async () => {
    const map = kartenRef.current, st = suche.current
    clearTimeout(st.timer)
    if (!map) return
    const sicht = sichtBox(map)
    if (!sicht) { setSuchHinweis(ZU_WEIT); return }
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
  }, [])
  /** nach jedem Verschieben bzw. Zoomen: Hinweis sofort, Suche nach einer Pause */
  const ausschnitt = useCallback(() => {
    const map = kartenRef.current, st = suche.current
    if (!map) return
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
  const laden = useCallback(async (lat: number, lon: number, nid: number | null, fallNeu: Fall | null) => {
    abbruchRef.current?.abort()
    const ctrl = new AbortController()
    abbruchRef.current = ctrl
    auftrag.current++
    setRechnung(null); setAuswahl(null); setAv(null); setDaten(null); setWerkzeug(null); setZeichnung([]); setBearbeiten(null)
    setKataster(null); setParkKat(null)
    const nr = ++ladeNr.current
    const erinnert = !fallNeu && nid !== null ? fallErinnern(nid) : null
    setFall(fallNeu ?? erinnert ?? leererFall(lat, lon, nid))
    setLadeHinweis(erinnert && eingabenZahl(erinnert) ? { text: `Eingaben zu diesem Übergang aus dem Browser übernommen ` +
      `(${eingabenZahl(erinnert)} Einträge, Stand ${erinnert.gespeichert?.slice(0, 10) ?? 'unbekannt'}).`, verwerfen: true } : null)
    setMeldung('AV und OSM werden geladen …')
    const [e, n] = lv95(lat, lon)
    const AV_NAME = `Amtliche Vermessung (WFS, ±${AV_RADIUS_M} m)`, OSM_NAME = `OpenStreetMap (Overpass, ${OSM_RADIUS_M} m)`
    setQuellen(q => ({ suche: q.suche, av: { name: AV_NAME }, osm: { name: OSM_NAME } }))
    const quelleFehler = (key: string, name: string) => (err: unknown) => {
      if (!istAbbruch(err)) setzeQuelle(key, { name, fehler: (err as Error).message })
      throw err
    }
    try {
      const [ra, ro, rs] = await Promise.all([
        ladeAvRoh(e, n, AV_RADIUS_M, ctrl.signal).then(r => { setzeQuelle('av', { name: AV_NAME,
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
      if (bq) setKataster({ quelle: bq, baeume: null })
      const pq = parkQuelleFuer(bfs)
      if (pq) setParkKat({ quelle: pq, nr, lat, lon, felder: null })
      setMeldung('Rechnung läuft …')
      // das Luftbild zieht der Effekt «Luftbild nachladen» nach (nur am OSM-Übergang und wenn die Suche nicht abgeschaltet ist)
      setDaten({ osm: ro.daten, av: ra.daten, sosf: rs ? rs.daten : null, nid, bfs, luftbild: null, flugjahr: '', ort: [e, n] })
      setFall(f => f ? { ...f, quellen: { osm: ro.quelle, av: `${ra.quelle}, Kanton ${[...new Set(avF.map(x => x.kanton))].join(', ')}`,
        geladen: new Date().toISOString().slice(0, 10) } } : f)
    } catch (err) {
      if (ctrl.signal.aborted || istAbbruch(err)) return
      setMeldung(`Laden fehlgeschlagen: ${(err as Error).message} (Details unter «Geladene Quellen»)`)
    }
  }, [])

  const pruefen = useCallback((k: OsmKnoten) => {
    if (werkzeug) { setMeldung('Zeichnen läuft: zuerst «Fertig» oder «Abbrechen», dann einen anderen Übergang wählen.'); return }
    setGewaehlt(k); laden(k.lat, k.lon, k.id, null)
  }, [laden, werkzeug])

  // Baumkataster auf Wunsch laden
  useEffect(() => {
    if (!fall?.baumkataster || !kataster || kataster.baeume || kataster.fehler) return
    const ctrl = abbruchRef.current
    kataster.quelle.laden(fall.ort.lat, fall.ort.lon, KATASTER_RADIUS_M, ctrl?.signal).then(r => {
      setKataster(k => k ? { ...k, baeume: r.daten } : k)
      setzeQuelle('kataster', { name: kataster.quelle.name, objekte: `${r.daten.length} Bäume`, ms: r.ms, bytes: r.bytes, server: r.quelle })
      setFall(f => f ? { ...f, quellen: { ...f.quellen, baumkataster: kataster.quelle.quellenangabe } } : f)
    }, err => {
      if (istAbbruch(err)) return
      setKataster(k => k ? { ...k, fehler: (err as Error).message } : k)
      setzeQuelle('kataster', { name: kataster.quelle.name, fehler: `${(err as Error).message} (Dienst bzw. Zugriff aus dem Browser gesperrt?)` })
    })
  }, [fall?.baumkataster, kataster, fall?.ort.lat, fall?.ort.lon])

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
    if (!daten || daten.nid === null) return
    const nr = ladeNr.current, versucht = lbVersuch.current === nr
    if (!lbAn) {
      if (!versucht && !daten.luftbild) setzeQuelle('luftbild', { name: LUFTBILD_NAME, objekte: 'abgeschaltet, nicht geladen' })
      return
    }
    if (!luftbildLaden({ nid: daten.nid, hatBild: !!daten.luftbild, an: lbAn, versucht })) return
    lbVersuch.current = nr
    const ctrl = abbruchRef.current, nid = daten.nid, [e, n] = daten.ort
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
  }, [lbAn, daten])

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
    } else if (werkzeug === 'streifen') {
      if (dist(pts[0], pts[1]) < STREIFEN_MIN_M) {
        setMeldung('Streifen zu kurz: die beiden Wartebereiche auf den gegenüberliegenden Seiten der Fahrbahn anklicken.')
        setZeichnung([]); zeichnungRef.current = []
        return
      }
      aendern(f => { f.streifenHand.push({ id: naechsteHandId(f), p0: pts[0], p1: pts[1], breite: streifenBreite, herkunft: 'gezeichnet' }); return f })
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
  }, [werkzeug, spurFuer, klasse, breite, streifenBreite, sichtbehindernd, aendern])

  const klick = useCallback((p: P) => {
    if (werkzeug === 'baum') { fertig([p]); return }
    const neu = [...zeichnungRef.current, p]
    zeichnungRef.current = neu
    if (werkzeug === 'streifen' && neu.length === 2) { fertig(neu); return }
    setZeichnung(neu)
  }, [werkzeug, fertig])

  const doppelklick = useCallback(() => {
    // Doppelklick setzt zwei Klicks ab: den doppelten letzten Punkt weglassen
    const z = zeichnungRef.current
    const pts = z.length >= 2 && dist(z[z.length - 1], z[z.length - 2]) < 0.3 ? z.slice(0, -1) : z
    fertig(pts)
  }, [fertig])

  const ecke = useCallback((id: string, i: number, p: P) => aendern(f => {
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
    if (s) { if (i === 0) s.p0 = p; else s.p1 = p; s.angepasst = true }
    return f
  }), [aendern])

  const werkzeugWaehlen = (w: Werkzeug) => { setZeichnung([]); setBearbeiten(null); setWerkzeug(x => (x === w ? null : w)) }

  // ---------------------------------------------------------------- Fall-Datei
  const speichern = () => {
    if (!fall) return
    const ergebnis: FallErgebnis | null = rechnung ? { hinweis: rechnung.hinweis, luftbild: rechnung.luftbild?.befund,
      streifenQuelle: rechnung.streifenQuelle, streifen: rechnung.streifen.map(s => ({
      fgsId: s.fgsId, status: s.status,
      zufahrten: s.zufahrten.map(z => ({ zufahrt: z.zufahrt, status: z.status, tempo: z.tempo, sichtweite: z.sichtweite,
        ...(z.deckung ? { gedeckt: true as const } : {}) })) })) } : null
    const blob = new Blob([fallSchreiben(fall, ergebnis)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `fgsCheck_${fall.ort.uebergang ?? 'ort'}_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const ladenDatei = async (datei: File) => {
    try {
      const [f, hinweise] = fallLesen(await datei.text())
      kartenRef.current?.setView([f.ort.lat, f.ort.lon], 19)
      setGewaehlt(f.ort.uebergang !== null ? { id: f.ort.uebergang, lat: f.ort.lat, lon: f.ort.lon, tags: {} } : null)
      await laden(f.ort.lat, f.ort.lon, f.ort.uebergang, f)
      setLadeHinweis({ text: `Fall «${datei.name}» geladen (${eingabenZahl(f)} Eingaben)` +
        (hinweise.length ? `; ${hinweise.length} ungültige Einträge übergangen (${[...new Set(hinweise)].join('; ')}).` : '.'), verwerfen: false })
    } catch (e) { setMeldung(`Fall-Datei nicht lesbar: ${(e as Error).message}`) }
  }

  const schliessenBericht = useCallback(() => setBericht(false), [])
  // anderer Ort bzw. keine Rechnung mehr: Bericht schliessen
  useEffect(() => { if (!rechnung) setBericht(false) }, [rechnung])

  // gewählter Übergang immer dabei, auch wenn sein Ausschnitt aus dem Cache der Suche gefallen ist
  const sichtbar = useMemo(() => {
    const l = nurMarkiert ? uebergaenge.filter(k => istFgs(markierung(k.tags)) || k.id === gewaehlt?.id) : uebergaenge
    return gewaehlt && !l.some(k => k.id === gewaehlt.id) ? [...l, gewaehlt] : l
  }, [uebergaenge, nurMarkiert, gewaehlt])
  const verwaist = useMemo(() => (fall && rechnung && rechnungFall === fall ? eingabenVerwaist(fall, rechnung.streifen) : []), [fall, rechnung, rechnungFall])
  // «Geladene Quellen» eingeklappt; hat eine Quelle einen Fehler, klappt der Abschnitt auf (und die Überschrift nennt ihn)
  const quellenFehler = Object.values(quellen).some(q => q.fehler)
  const [quellenOffen, setQuellenOffen] = useState(false)
  useEffect(() => { if (quellenFehler) setQuellenOffen(true) }, [quellenFehler])
  const kantone = useMemo(() => [...new Set((av ?? []).map(f => f.kanton).filter(Boolean))].sort(), [av])
  // Strassennamen für die Karte ohne eigenen Abruf: vor dem Klick die Wegmitten aus der Übergangssuche (alle Ausschnitte im
  // Cache), nach dem Klick im Umkreis OSM_RADIUS_M um den Übergang vorrangig die genaueren aus dem Umkreis-Abruf (Wegmitten aus
  // der Geometrie); je Name höchstens eine Beschriftung pro rund 120 m (daten/osm.namenKarte)
  const osmRoh = daten?.osm, osmOrt = daten?.ort
  const namen = useMemo(() => namenKarte(namenAusschnitt, osmRoh && osmOrt ? strassennamen(osmRoh, osmOrt, OSM_RADIUS_M) : [],
    osmRoh && osmOrt ? osmOrt : null, OSM_RADIUS_M), [namenAusschnitt, osmRoh, osmOrt])
  const alleZ = useMemo(() => rechnung?.streifen.flatMap(s => s.zufahrten) ?? [], [rechnung])
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

  return (
    <div className="app">
      <Karte mitte={START} av={av} kantone={kantone} uebergaenge={sichtbar} strassennamen={namen} gewaehlt={gewaehlt?.id ?? null}
        rechnung={rechnung} auswahl={auswahl} hindernisse={fall?.hindernisse ?? []} streifenHand={fall?.streifenHand ?? []}
        werkzeug={werkzeug} zeichnung={zeichnung} bearbeiten={bearbeiten} onUebergang={pruefen} onZufahrt={setAuswahl}
        onKlick={klick} onDoppelklick={doppelklick} onEcke={ecke} onHindernis={id => setBearbeiten(b => (b === id ? null : id))}
        onAusschnitt={ausschnitt} hinweis={suchHinweis} kartenRef={kartenRef} />
      <aside className="panel">
        <h1>{onStartseite
          ? <button type="button" className="logo-knopf" onClick={onStartseite} aria-label="Zur Startseite" title="Zur Startseite">
              <img className="logo" src={import.meta.env.BASE_URL + 'logo.svg'} alt="" width={40} height={40} /></button>
          : <img className="logo" src={import.meta.env.BASE_URL + 'logo.svg'} alt="" width={40} height={40} />}
          fgsCheck <span className="marke">Prototyp v{__APP_VERSION__}</span></h1>
        <p className="hinweis">
          Sichtprüfung an Fussgängerstreifen nach VSS 40 241 und bfu 2.457.01, gerechnet im Browser. Den Streifen sucht die App
          im Luftbild (sonst aus OSM und AV); Parkfelder, Bäume, Hecken und Mauern zeichnen Sie auf dem Luftbild ein; Vorschläge
          aus OSM zählen erst nach Bestätigung. In Bern lädt die App die amtlichen Parkfelder der Stadt; sie zählen sofort.
        </p>
        <Anleitung />
        <div className="knopfzeile">
          <label className="knopf">Fall laden<input type="file" accept=".json,application/json" hidden
            onChange={e => { const d = e.target.files?.[0]; if (d) ladenDatei(d); e.target.value = '' }} /></label>
          {fall && <button onClick={speichern}>Fall speichern</button>}
          {fall && rechnung && !rechnet && <button onClick={() => setBericht(true)} title={'Druckansicht mit Kartenbild, Ergebnis, Eingaben ' +
            'und Quellen; als PDF speichern über den Druckdialog des Browsers'}>Bericht drucken / als PDF</button>}
        </div>
        <label className="klein"><input type="checkbox" checked={nurMarkiert} onChange={e => setNurMarkiert(e.target.checked)} />
          {' '}nur markierte Übergänge zeigen (Fussgängerstreifen, vermutliche und Lichtsignal)</label>
        {meldung && <p className="klein">{meldung}</p>}
        {ladeHinweis && fall && (
          <p className="klein hinweisbox">{ladeHinweis.text}{' '}
            {ladeHinweis.verwerfen && <button className="zweit klein" onClick={() => {
              setFall(leererFall(fall.ort.lat, fall.ort.lon, fall.ort.uebergang)); setLadeHinweis(null)
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
        {rechnung?.hinweis && <p className={rechnung.markierung && istFgs(rechnung.markierung) ? 'pruefen' : 'keinfgs'}>{rechnung.hinweis}</p>}
        {rechnet && <p className="klein">Rechnung läuft …</p>}

        {fall && daten && (
          <section className="eingaben">
            <h2>Eingaben von Hand</h2>
            <div className="werkzeuge">
              {WERKZEUGE.map(([w, name]) => (
                <button key={w} className={werkzeug === w ? 'aktiv' : 'zweit'} onClick={() => werkzeugWaehlen(w)}>{name}</button>
              ))}
            </div>
            {werkzeug && (
              <div className="werkzeughilfe">
                <b>{(WERKZEUGE.find(x => x[0] === werkzeug) ?? ['', 'Fahrlinie selbst zeichnen'])[1]}:</b>{' '}
                {(WERKZEUGE.find(x => x[0] === werkzeug) ?? ['', '', 'am Streifen beginnen, gegen die Fahrtrichtung klicken, Doppelklick beendet'])[2]}
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
            )}
            {fall.streifenHand.length > 0 && (
              <>
                <h3>Streifen von Hand (ersetzen den Streifen aus OSM)</h3>
                <ul className="liste">
                  {fall.streifenHand.map(s => (
                    <li key={s.id}>
                      <span className="farbe" style={{ background: '#fde047' }} />{s.id}: {f1(dist(s.p0, s.p1))} m lang, {f1(s.breite)} m breit, {streifenHerkunftText(s)}
                      <span className="aktionen">
                        <button className="zweit klein" title="Enden auf der Karte verschieben" onClick={() => setBearbeiten(b => (b === s.id ? null : s.id))}>
                          {bearbeiten === s.id ? 'fertig' : 'verschieben'}</button>
                        <button className="zweit klein" onClick={() => aendern(f => { f.streifenHand = f.streifenHand.filter(x => x.id !== s.id); return f })}>löschen</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
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
                setMeldung((n ? `Streifen übernommen; ${n} Eingaben (Tempo, Spur, Streichen, Lichtsignal, kein FGS) auf die neuen ` +
                  'Nummern übertragen – bitte prüfen.' : 'Streifen übernommen.') + (ni ? ' Die Insel aus dem Luftbild steht jetzt als Insel ' +
                  'von Hand unter den Hindernissen.' : ''))
              }}>Streifen aus {rechnung.streifenQuelle === 'luftbild' ? 'dem Luftbild' : 'OSM'} übernehmen und anpassen</button> (Enden danach
                verschieben)</p>
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
                  <button className="zweit klein" onClick={() => setKataster(k => (k ? { quelle: k.quelle, baeume: null } : k))}>erneut laden</button></div>}
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
                }}>gewähltes Parkfeld verwerfen</button> {parkGewaehlt.hindernis.name}</div>}
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
          <StreifenAnzeige key={s.fgsId} s={s} fall={fall} auswahl={auswahl} setAuswahl={setAuswahl} aendern={aendern}
            gewaehlteZ={gewaehlteZ} spurZeichnen={key => { setSpurFuer(key); setZeichnung([]); setWerkzeug('spurB') }} />
        ))}
        {rechnung && <p className="klein">Rechenzeit {Math.round(rechnung.ms)} ms (Web Worker).</p>}

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
          <li><span className="farbe" style={{ background: '#fde047' }} />Streifen, <span className="farbe" style={{ background: '#0ea5e9' }} />Annäherungsbereiche,
            <span className="farbe" style={{ borderColor: LUFTBILD_FARBE, borderWidth: 2 }} />Balken aus dem Luftbild (gestrichelt: unsicher)</li>
          <li><span className="farbe" style={{ background: STATUS_FARBE.frei }} />Sichtfeld frei, <span className="farbe" style={{ background: STATUS_FARBE.verdeckt }} />verdeckt
            (Auto-Parkfeld, Gebäude), <span className="farbe" style={{ background: STATUS_FARBE.verdeckt_hindernis }} />Hecke, Mauer,
            übriges Hindernis, <span className="farbe" style={{ background: STATUS_FARBE.verdeckt_baum }} />Baum,
            <span className="farbe" style={{ background: STATUS_FARBE.verdeckt_zweirad }} />Zweirad-Feld (Velo/Motorrad)</li>
          <li><span className="farbe" style={{ background: QUELLE_FARBE.hand }} />von Hand, <span className="farbe" style={{ background: QUELLE_FARBE.osm }} />aus OSM (gestrichelt: Vorschlag, prüfen),
            <span className="farbe" style={{ background: QUELLE_FARBE.kataster }} />aus Baumkataster</li>
          <li><span className="farbe gestrichelt" style={{ borderColor: INSEL_FARBE, borderWidth: 2 }} />{INSEL_TEXT};
            <span className="farbe" style={{ background: INSEL_FARBE }} />Insel von Hand (Werkzeug «Insel»)</li>
          <li>Amtliche Parkfelder (zählen, einzeln verwerfbar): <span className="farbe" style={{ background: PARK_FARBE.auto }} />Auto,
            <span className="farbe" style={{ background: PARK_FARBE.velo }} />Velo, <span className="farbe" style={{ background: PARK_FARBE.motorrad }} />Motorrad,
            <span className="farbe gestrichelt" style={{ borderColor: PARK_FARBE.auto, opacity: 0.6 }} />verworfen (gestrichelt, anklicken: wieder zählen)</li>
          {Object.entries(AV_FARBEN).map(([art, farbe]) => <li key={art}><span className="farbe" style={{ background: farbe }} />AV {AV_NAME[art] ?? art}</li>)}
        </ul>
        </details>

        <details className="abschnitt">
        <summary><h2>Grundlagen und Quellen</h2></summary>
        <p className="klein">
          Sichtweiten: VSS 40 241, Tab. 1 ({Object.entries(SICHTWEITE).map(([t, s]) => `${t} km/h: ${s} m`).join(', ')}); im Knoten nach
          Kurvenradius (bfu 2.457.01 bzw. VSS Tab. 2: {KURVE_SICHTWEITE.map(([r, s]) => `bis ${r} m: ${s} m`).join(', ')}).
          Sichtpunkte mindestens 1,5 m von Parkfeldern; Auto-Parkfeld näher als 5 m am Streifen: VRV Art. 18 Abs. 2e.
        </p>
        <p className="klein">
          Luftbild und Streifen-Erkennung {LUFTBILD_QUELLE}{daten?.flugjahr ? ` (Flugjahr ${daten.flugjahr})` : ''} · Bodenbedeckung und Einzelobjekte: Amtliche Vermessung, Kanton {kantone.join(', ') || '…'}, geodienste.ch ·
          Strassennetz und Übergänge © OpenStreetMap-Mitwirkende (ODbL){fall?.baumkataster && kataster ? ` · ${kataster.quelle.quellenangabe}` : ''}{parkAn && parkKat?.felder ? ` · ${parkKat.quelle.quellenangabe}` : ''}.
        </p>
        <p className="klein">Die App ersetzt keine Beurteilung vor Ort. Eingaben bleiben im Browser bzw. in der Fall-Datei.</p>
        </details>
        <Datenschutz />
        <Fusszeile />
      </aside>
      {bericht && fall && rechnung && (
        <Bericht fall={fall} rechnung={rechnung} rechnungZeit={rechnungZeit} kantone={kantone} flugjahr={daten?.flugjahr ?? ''}
          luftbildStand={daten?.luftbild ? 'da' : fall.luftbild !== false && quellen.luftbild && !quellen.luftbild.fehler ? 'laedt' : 'fehlt'}
          zusatzQuellen={[...(fall.baumkataster && kataster?.baeume ? [`Baumkataster: ${kataster.quelle.quellenangabe} (WFS map.bern.ch)`] : []),
            ...(parkAn && parkKat?.felder ? [`Amtliche Parkfelder: ${parkKat.quelle.quellenangabe} (WFS map.bern.ch)`] : [])]}
          aendern={aendern} schliessen={schliessenBericht} />
      )}
    </div>
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
            Gelb-Kontrast {lb.kontrast.toFixed(1).replace('.', ',')}) – aus Luftbild, prüfen. Die Rechnung nutzt ihn.</>}
          {lb.befund === 'unsicher' && <>Muster im Luftbild unsicher ({lb.gruende.join('; ')}): gestrichelt als Vorschlag; die Rechnung
            nutzt den Streifen aus OSM + AV{rechnung?.inselTeilt ? ', an der Insel aus dem Luftbild geteilt' : ''}.</>}
          {lb.befund === 'nicht_gefunden' && <>Im Luftbild kein Streifen gefunden ({lb.gruende.join('; ')}): Streifen aus OSM + AV.</>}
          {lb.befund === 'unsicher' && lb.teile.length > 0 && <div><button className="zweit klein" onClick={() => {
            let n = 0, ni = 0
            // die Insel, an der die Luftbild-Teile geteilt sind, als Insel von Hand mit (sonst ginge die Teilung verloren)
            aendern(f => { const vor = f.hindernisse.length
              n = streifenUebernehmen(f, lb.teile, rechnung?.streifen ?? [], 'luftbild_vorschlag', lb.insel ? [lb.insel] : [])
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

/** Tooltip gedeckter Abbiegezufahrten (nur mit GEDECKT_RECHNEN, seit 14.10.2026 standardmässig aus) */
const GEDECKT_TITEL = 'Geprüft; den Weg ab dem Knoten prüft die gerade Zufahrt mit; das Ergebnis zählt trotzdem'

function StreifenAnzeige({ s, fall, auswahl, setAuswahl, aendern, gewaehlteZ, spurZeichnen }: {
  s: StreifenErgebnis; fall: Fall; auswahl: string | null; setAuswahl: (k: string | null) => void
  aendern: (f: (x: Fall) => Fall) => void; gewaehlteZ: ZufahrtErgebnis | null; spurZeichnen: (key: string) => void
}) {
  const se = fall.streifen[s.fgsId] ?? {}
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
        Streifen {s.fgsId} {s.strasse && <>– {s.strasse}</>}: {STATUS[s.status] ?? s.status}
      </h2>
      <div className="klein zeile">
        Lichtsignal: <select value={se.lsa ?? ''} onChange={e => setzeS({ lsa: (e.target.value || undefined) as 'ja' | 'nein' | undefined })}>
          <option value="">automatisch ({s.lsa === 'ja' ? 'ja' : 'nein'}{s.lsa === 'ja' && s.lsaQuelle !== 'von Hand' ? ', aus OSM' : ''})</option>
          <option value="ja">ja (von Hand)</option><option value="nein">nein (von Hand)</option>
        </select>
        {' '}<label><input type="checkbox" checked={!!se.keinFgs} onChange={e => setzeS({ keinFgs: e.target.checked })} /> kein FGS</label>
      </div>
      <p className="klein">Zuordnung OSM: {s.netzQuelle} · Bordkanten: {s.randQuelle === 'AV' ? 'AV' : 'angenommen'} ·
        Länge {f1(Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]))} m, Breite {f1(s.bw)} m</p>
      {s.keinFgsHinweis && <p className="keinfgs klein">Kein Fussgängerstreifen: Prüfung sinngemäss nach den FGS-Regeln, ohne Normbezug.</p>}
      {s.markierungHinweis && <p className="pruefen klein">Vermutlich Fussgängerstreifen (Markierung in OSM nicht erfasst), bitte prüfen.</p>}
      {s.lsa === 'ja' && <p className="klein">Mit Lichtsignal gilt die Arbeitshilfe nicht; die Rechnung wird trotzdem gezeigt.</p>}
      {s.annahmen.length > 0 && <ul className="annahmen">{s.annahmen.map(a => <li key={a}>{a}</li>)}</ul>}
      {s.status !== 'kein_fgs' && (
        <table className="zufahrten">
          <thead><tr><th>Zufahrt</th><th>Tempo</th><th>Sichtweite</th><th>vom Rand</th><th>Status</th></tr></thead>
          <tbody>
            {s.zufahrten.map(z => (
              <tr key={z.zufahrt} className={zufahrtKey(z) === auswahl ? 'aktiv' : ''} title={z.deckung ? GEDECKT_TITEL : undefined}
                onClick={() => setAuswahl(zufahrtKey(z) === auswahl ? null : zufahrtKey(z))}>
                <td><b>{z.zufahrt}</b>{z.deckung && <span className="klein"> (mitgeprüft)</span>}<div className="klein">{ART[z.art] ?? z.art}{z.strasse ? `, ${z.strasse}` : ''}</div></td>
                <td>{z.tempo}<div className={z.tempoQuelle === 'Ersatz' ? 'klein warnung' : 'klein'}>
                  {z.tempoQuelle === 'Ersatz' ? 'Annahme' : z.tempoQuelle === 'Korrektur' ? 'von Hand' : 'OSM'}</div></td>
                <td>{z.sichtweite} m<div className="klein">{z.sichtweiteQuelle}{z.kurvenradiusM != null ? `, R ${f1(z.kurvenradiusM)} m` : ''}</div></td>
                <td>{z.sichtpunktVomRandM != null ? `${f2(z.sichtpunktVomRandM)} m` : '–'}{z.lageQuelle === 'Hand' && <div className="klein">Fahrlinie von Hand</div>}</td>
                <td><span className="farbe" style={{ background: STATUS_FARBE[z.status] }} />{statusText(z, fall.hindernisse)}
                  {z.unter5m && <div className="klein warnung">Parkfeld unter 5 m</div>}</td>
              </tr>
            ))}
            {!s.zufahrten.length && <tr><td colSpan={5} className="klein">keine Zufahrt</td></tr>}
          </tbody>
        </table>
      )}
      {gewaehlteZ && gewaehlteZ.fgsId === s.fgsId && <ZufahrtDetail z={gewaehlteZ} fall={fall} aendern={aendern} spurZeichnen={spurZeichnen} />}
      {s.entfallen.length > 0 && (
        <details>
          <summary className="klein">Nicht geprüfte Richtungen ({s.entfallen.length})</summary>
          <table><tbody>
            {s.entfallen.map(e => (
              <tr key={e.kennung + e.zufahrt}><td>{e.zufahrt}</td><td>{GRUND[e.grund] ?? e.grund}<div className="klein">{e.quelle}</div>
                {e.grund === 'hand' && <button className="zweit klein" onClick={() => aendern(f => {
                  const k = zufahrtSchluessel(s.fgsId, e.kennung)
                  if (f.zufahrten[k]) delete f.zufahrten[k].streichen
                  return f
                })}>wieder prüfen</button>}</td></tr>
            ))}
          </tbody></table>
        </details>
      )}
    </section>
  )
}

function ZufahrtDetail({ z, fall, aendern, spurZeichnen }: {
  z: ZufahrtErgebnis; fall: Fall; aendern: (f: (x: Fall) => Fall) => void; spurZeichnen: (key: string) => void
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
      <h3>Zufahrt «{z.zufahrt}» ({z.kennung})</h3>
      <table className="zahlen"><tbody>
        <tr><td>Tempo</td><td>
          <select value={zh.tempo ?? ''} onChange={e => setze({ tempo: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">{zh.tempo ? 'aus OSM' : `${z.tempo} km/h (${z.tempoQuelle === 'Ersatz' ? 'Annahme' : 'aus OSM'})`}</option>
            {[20, 30, 40, 50, 60, 80].map(t => <option key={t} value={t}>{t} km/h (von Hand)</option>)}
          </select></td></tr>
        <tr><td>Sichtweite</td><td>{z.sichtweite} m ({z.sichtweiteQuelle})</td></tr>
        {z.kurvenradiusM != null && <tr><td>Radius</td><td>{f1(z.kurvenradiusM)} m ({z.radiusQuelle})</td></tr>}
        {z.knotenM != null && <tr><td>Knoten</td><td>{f1(z.knotenM)} m vor dem Streifen</td></tr>}
        {z.deckung && <tr><td>Mitgeprüft</td><td title={GEDECKT_TITEL}>ab dem Knoten durch die gerade Zufahrt ({z.deckung}); zählt trotzdem</td></tr>}
        <tr><td>Fahrbahn</td><td>{z.fahrbahnM != null ? `${f2(z.fahrbahnM)} m` : '–'}, Fahrstreifen
          {z.fahrstreifenM != null ? ` ${f2(z.fahrstreifenM)} m` : ' –'}{z.mehrstreifig ? ' (mehrstreifig)' : ''}</td></tr>
        <tr><td>Sichtpunkt vom Rand</td><td>{z.sichtpunktVomRandM != null ? `${f2(z.sichtpunktVomRandM)} m` : '–'} (Lage {z.lageQuelle}){z.abzugQuelle ? `; Abzug: ${z.abzugQuelle}` : ''}</td></tr>
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
