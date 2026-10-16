import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { AvFlaeche } from './daten/av'
import type { OsmKnoten, Strassenname } from './daten/osm'
import { markierung } from './daten/osm'
import type { ZufahrtErgebnis } from './rechner/typen'
import type { FallRechnung } from './rechner'
import type { Multi } from './rechner/poly'
import { type Hindernis, laengsPolygon, stammPolygon } from './rechner/hindernisse'
import { type StreifenHand, type Fixpunkt, type FlaechePlan, type PlanArt, PLAN_ARTEN } from './fall'
import { planTitel, planFlaecheM2, PLAN_NAME } from './rechner/planflaechen'
import { fixpunktName, ART_TEXT } from './fixpunkt'
import { wgs, lv95, type P } from './geo'
import Ortssuche from './Ortssuche'
import { ortZoom, type Ort } from './daten/ortssuche'

// AV-Farben nach der Berner Karte (karte_vorlage.html AV_STIL), Gebäude neutral dunkelgrau statt braun: kein Rot/Orange, damit Gebäude und Trottoir nicht mit
// «verdeckt» bzw. dem Luftbild-Streifen verwechselt werden (Nutzerbefund 11.10.2026)
export const AV_FARBEN: Record<string, string> = {
  Strasse_Weg: '#6e6e6e',
  Trottoir: '#e6e6c8',
  Verkehrsinsel: '#96c878',
  Gebaeude: '#3f3f46',
}
const AV_DECKKRAFT: Record<string, number> = { Strasse_Weg: 0.25, Trottoir: 0.45, Verkehrsinsel: 0.6, Gebaeude: 0.5 }
/**
 * Flächen (Plan) von Hand (rechner/planflaechen.ts): schraffiert in der Farbe der AV-Art (flaeche, wie AV_FARBEN) mit dunkleren
 * Schraffurlinien und gestricheltem Rand (linie), über der AV-Ebene; so als «Plan» vom AV-Bestand zu unterscheiden. Die Muster
 * (SVG-Pattern, id PLAN_MUSTER + Art) stehen einmal im Dokument (PlanMuster), Karte und Legende verweisen darauf.
 */
export const PLAN_FARBEN: Record<PlanArt, { flaeche: string; linie: string }> = {
  trottoir: { flaeche: AV_FARBEN.Trottoir, linie: '#8a8350' },
  fahrbahn: { flaeche: AV_FARBEN.Strasse_Weg, linie: '#262626' },
  insel: { flaeche: AV_FARBEN.Verkehrsinsel, linie: '#3f6212' },
}
export const PLAN_MUSTER = 'fgs-plan-'
export const STRICH_PLAN = '6 3'
/** Hintergrund einer Legenden-Farbmarke für eine Fläche (Plan) (CSS, schräg gestreift wie das Muster) */
export const planMarke = (art: PlanArt) => `repeating-linear-gradient(45deg, ${PLAN_FARBEN[art].linie} 0 2px, ${PLAN_FARBEN[art].flaeche} 2px 5px)`
/** SVG-Muster der Flächen (Plan), einmal im Dokument (unsichtbares SVG mit Grösse 0; nicht display:none, sonst finden manche
 * Browser die Muster nicht) */
function PlanMuster() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {PLAN_ARTEN.map(a => (
          <pattern key={a} id={PLAN_MUSTER + a} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill={PLAN_FARBEN[a].flaeche} fillOpacity="0.55" />
            <line x1="0" y1="0" x2="0" y2="7" stroke={PLAN_FARBEN[a].linie} strokeWidth="2" />
          </pattern>
        ))}
      </defs>
    </svg>
  )
}
/** Farbe und Text der OSM-Übergänge nach Markierung (daten/osm.markierung) */
export const UEBERGANG_FARBE: Record<string, string> = { markiert: '#eab308', vermutlich: '#eab308', lsa: '#7c3aed', unmarkiert: '#94a3b8',
  unbelegt: '#94a3b8' }
export const UEBERGANG_TEXT: Record<string, string> = { markiert: 'Fussgängerstreifen', lsa: 'mit Lichtsignal',
  vermutlich: 'Markierung nicht erfasst, vermutlich Fussgängerstreifen', unmarkiert: 'unmarkiert, kein FGS',
  unbelegt: 'ohne Angabe zur Art, kein FGS' }
export const STATUS_FARBE: Record<string, string> = {
  frei: '#10b981', verdeckt: '#dc2626', verdeckt_gebaeude: '#dc2626', verdeckt_hindernis: '#ea580c', verdeckt_baum: '#ca8a04',
  verdeckt_zweirad: '#a855f7', kein_fgs: '#64748b', ohne_zufahrt: '#64748b',
}
/** Strichmuster der Fahrlinie einer gedeckten Abbiegezufahrt (nur mit GEDECKT_RECHNEN), in Karte und Bericht gleich */
export const STRICH_GEDECKT = '2 8'
export const LUFTBILD_FARBE = '#f59e0b'
/** Insel ausserhalb der AV: angenommen nach OSM und Luftbild (gestrichelt, «prüfen») bzw. von Hand (durchgezogen) */
export const INSEL_FARBE = '#65a30d'
export const STRICH_INSEL = '6 4'
/** Tooltip bzw. Legende einer angenommenen Insel (nach OSM und Luftbild; neutral, ob markiert oder gebaut: auch gebaute Inseln
 * fehlen zuweilen in der AV, rechner/streifen.ts inselLuftbildText) */
export const INSEL_TEXT = 'Insel angenommen (OSM/Luftbild), in der AV nicht erfasst – prüfen'
export const QUELLE_FARBE: Record<string, string> = { hand: '#0ea5e9', osm: '#f97316', kataster: '#16a34a' }
/**
 * Amtliche Parkfelder (Kataster der Stadt) nach Klasse, durchgezogen; verworfene gestrichelt und gedimmt. Farben abseits der
 * übrigen: Auto dunkelblau (nicht Rot wie AV-Gebäude und «verdeckt»), Motorrad pink (nicht Ocker wie «verdeckt (Baum)»).
 */
export const PARK_FARBE: Record<string, string> = { auto: '#1e40af', velo: '#0f766e', motorrad: '#ec4899' }
/** Farbe eines Hindernisses: amtliche Parkfelder nach Klasse, sonst nach Quelle */
export const hindernisFarbe = (h: Hindernis): string =>
  h.art === 'insel' ? INSEL_FARBE : h.quelle === 'kataster' && h.art === 'parkfeld' ? PARK_FARBE[h.klasse] : QUELLE_FARBE[h.quelle] ?? '#0ea5e9'

/** Hinweis über der Karte (Stand der Übergangssuche); erneut: Knopf «erneut suchen» (nur nach einem Fehler) */
export interface KartenHinweis { text: string; fehler?: boolean; erneut?: () => void }

export const STANDORT_ZOOM = 18
const STANDORT_UNGENAU_M = 100                    // ungenauer: ganzen Genauigkeitskreis zeigen statt auf STANDORT_ZOOM
// Hintergründe (WMTS geo.admin.ch, umschaltbar in der Ebenenwahl): Luftbild bis Zoom 20, Landeskarte bis 18 (Zoom 19 liefert
// der Dienst nur hochgerechnet, geprüft 14.10.2026); darüber vergrössert Leaflet die Kacheln
const HINTERGRUND_LUFTBILD = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg'
const HINTERGRUND_KARTE = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg'
// Strassennamen (OSM): eigenes Pane über den Vektoren (overlayPane 400), unter den Leaflet-Markern; nicht anklickbar. Seit
// 14.10.2026 schon vor dem Klick (Übergangssuche, viele Namen): nur im Sichtbereich mit Rand (MARKER_RAND) und erst ab NAMEN_ZOOM
// gezeichnet (weiter draussen zu dicht; die Suche beginnt ebenfalls bei Zoom 16)
const NAMEN_PANE = 'strassennamen'
const NAMEN_ZOOM = 16
// Übergänge: nur Marker im Sichtbereich mit diesem Rand (Anteil je Seite) zeichnen; nach jedem Verschieben nachgeführt
const MARKER_RAND = 0.5
const STANDORT_MS = 10000
const STANDORT_FARBE = '#2563eb'
const STANDORT_SYMBOL = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>' +
  '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>'

/** Meldung zu einem Fehler der Standortbestimmung (GeolocationPositionError.code) */
export function standortFehlerText(code: number): string {
  if (code === 1) return 'Standort nicht freigegeben: Zugriff auf den Standort in den Einstellungen des Browsers erlauben.'
  if (code === 3) return `Standort nicht innert ${STANDORT_MS / 1000} s bestimmt; nochmals versuchen.`
  return 'Standort zurzeit nicht verfügbar (kein GPS- bzw. Netzempfang).'
}

export type Werkzeug = null | 'parkfeld' | 'laengs' | 'baum' | 'hecke' | 'mauer' | 'flaeche' | 'insel' | 'streifen' | 'spurB' | 'fixpunkt' |
  'planflaeche'
/** Masslinie ab Fixpunkt (rechner/vermassung.fixpunktMasse): von, bis, Beschriftung */
export interface Masslinie { von: P; bis: P; text: string }
export const FIXPUNKT_FARBE = '#be185d'
/** Fixpunkt als kleines Kreuz im Quadrat (Karte; Bericht zeichnet dasselbe als SVG) */
const fixIcon = (blass: boolean) => L.divIcon({ className: 'fixpunkt' + (blass ? ' blass' : ''), iconSize: [14, 14],
  html: '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" fill="#ffffff" ' +
    `fill-opacity="0.85" stroke="${FIXPUNKT_FARBE}" stroke-width="1.5"/><path d="M3 3L11 11M11 3L3 11" stroke="${FIXPUNKT_FARBE}" ` +
    'stroke-width="1.5"/></svg>' })

const ll = (p: P): L.LatLngTuple => wgs(p[0], p[1])
/** Stil eines Übergangs (gewählt: grösser, dunkler Rand; vermutlich markiert: gestrichelt, blasser) */
const markerStil = (mk: string, g: boolean): L.CircleMarkerOptions => ({
  radius: g ? 9 : 6, color: g ? '#0f172a' : mk === 'vermutlich' ? '#a16207' : '#ffffff', weight: g ? 3 : 2,
  dashArray: mk === 'vermutlich' ? '3 3' : undefined,
  fillColor: UEBERGANG_FARBE[mk], fillOpacity: mk === 'vermutlich' ? 0.45 : 0.95,
})
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const multiLl = (m: Multi) => m.map(poly => poly.map(r => r.map(ll)))
export const zufahrtKey = (z: ZufahrtErgebnis) => `${z.fgsId}|${z.zufahrt}`

/** Geometrie eines Hindernisses als Leaflet-Ebene */
function hindernisEbene(h: Hindernis, stil: L.PathOptions): L.Layer {
  if (h.art === 'parkfeld') return L.polygon(h.ring.map(ll), stil)
  if (h.art === 'laengsparkierung') return L.polygon(laengsPolygon(h.linie, h.breite).map(ll), stil)
  if (h.art === 'baum') return L.polygon(stammPolygon(h.p, Math.max(h.stamm, 0.5)).map(ll), { ...stil, weight: 3 })
  if (h.ring) return L.polygon(h.ring.map(ll), stil)
  return L.polyline((h.linie ?? []).map(ll), { ...stil, weight: 4 })
}

export function hindernisText(h: Hindernis): string {
  const q = h.quelle === 'hand' ? 'von Hand' : h.quelle === 'osm' ? 'aus OSM' : h.art === 'baum' ? 'aus Baumkataster' :
    h.art === 'parkfeld' ? 'amtlich, aus dem Kataster der Stadt' : 'aus Kataster der Stadt'
  const art = { parkfeld: 'Parkfeld', laengsparkierung: 'Längsparkierung', baum: 'Baum', hecke: 'Hecke', mauer: 'Mauer', uebrige: 'Hindernis',
    insel: 'Insel' }[h.art]
  return `${h.name ?? art} (${q})`
}

export default function Karte(props: {
  mitte: [number, number]
  av: AvFlaeche[] | null
  kantone: string[]
  uebergaenge: OsmKnoten[]
  strassennamen: Strassenname[]                      // aus der Übergangssuche und den OSM-Daten des gewählten Übergangs (daten/osm.namenKarte)
  gewaehlt: number | null
  rechnung: FallRechnung | null
  auswahl: string | null
  hindernisse: Hindernis[]
  streifenHand: StreifenHand[]
  werkzeug: Werkzeug
  zeichnung: P[]
  bearbeiten: string | null                          // Id des Hindernisses, Handstreifens bzw. Fixpunkts, dessen Ecken verschoben werden
  fixpunkte: Fixpunkt[]
  flaechenPlan: FlaechePlan[]                        // Flächen (Plan) von Hand, über der AV-Ebene
  fixVorschlaege: { p: P; text: string }[]           // vorgeschlagene Fixpunkte (blass; Tooltip, Klick übernimmt)
  onFixVorschlag?: (p: P) => void                    // Klick auf einen vorgeschlagenen Fixpunkt: übernehmen
  masslinien: Masslinie[]
  zufahrtName: (fgsId: string, zufahrt: string) => string   // Anzeige (benennung.ts): Strasse und Herkunft
  streifenTitel: (fgsId: string) => string                 // Anzeige: Name bzw. «Streifen 1»
  onUebergang: (k: OsmKnoten) => void
  onZufahrt: (key: string | null) => void
  onKlick: (p: P) => void
  onDoppelklick: () => void
  onEcke: (id: string, i: number, p: P) => void
  onHindernis: (id: string) => void
  onAusschnitt: () => void                           // nach jedem Verschieben bzw. Zoomen (moveend)
  hinweis: KartenHinweis | null
  kartenRef: React.MutableRefObject<L.Map | null>
}) {
  const { mitte, av, kantone, uebergaenge, strassennamen, gewaehlt, rechnung, auswahl, hindernisse, streifenHand, werkzeug, zeichnung,
    bearbeiten, fixpunkte, flaechenPlan, fixVorschlaege, masslinien, kartenRef } = props
  // Rückruf in einer Ref: der Fixpunkt-Effekt soll nicht bei jedem Neuzeichnen der App neu laufen
  const fixVorschlagRef = useRef(props.onFixVorschlag)
  fixVorschlagRef.current = props.onFixVorschlag
  const elRef = useRef<HTMLDivElement>(null)
  const ebenenRef = useRef<Record<string, L.LayerGroup> | null>(null)
  const cb = useRef(props)
  cb.current = props
  const markerRef = useRef(new Map<number, { k: OsmKnoten; m: L.CircleMarker }>())
  const namenRef = useRef<{ s: Strassenname; m: L.Marker | null }[]>([])
  /** Strassennamen im Sichtbereich (mit Rand) ab NAMEN_ZOOM auf die Karte, die übrigen weg (Marker nur bei Bedarf erzeugt) */
  const namenAbgleich = () => {
    const map = kartenRef.current, eb = ebenenRef.current
    if (!map || !eb) return
    const b = map.getBounds().pad(MARKER_RAND), an = map.getZoom() >= NAMEN_ZOOM
    for (const x of namenRef.current) {
      const zeigen = an && b.contains([x.s.lat, x.s.lon])
      if (zeigen && !x.m) x.m = L.marker([x.s.lat, x.s.lon], { pane: NAMEN_PANE, interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'strassenname', iconSize: [0, 0], html: `<span>${esc(x.s.name)}</span>` }) }).addTo(eb.namen)
      else if (!zeigen && x.m) { eb.namen.removeLayer(x.m); x.m = null }
    }
  }
  const gewaehltRef = useRef<number | null>(null)
  /** Marker im Sichtbereich (mit Rand) auf die Karte, die übrigen weg; der gewählte bleibt immer */
  const markerAbgleich = () => {
    const map = kartenRef.current, eb = ebenenRef.current
    if (!map || !eb) return
    const b = map.getBounds().pad(MARKER_RAND)
    for (const { k, m } of markerRef.current.values()) {
      const zeigen = k.id === cb.current.gewaehlt || b.contains([k.lat, k.lon])
      if (zeigen && !eb.osm.hasLayer(m)) m.addTo(eb.osm)
      else if (!zeigen && eb.osm.hasLayer(m)) eb.osm.removeLayer(m)
    }
  }
  // Standort: nur Anzeige auf der Karte, wird nirgends gespeichert oder gesendet
  const [standortHinweis, setStandortHinweis] = useState<KartenHinweis | null>(null)
  useEffect(() => {
    if (!standortHinweis?.fehler) return
    const t = setTimeout(() => setStandortHinweis(null), 8000)
    return () => clearTimeout(t)
  }, [standortHinweis])

  useEffect(() => {
    if (!elRef.current || kartenRef.current) return
    const map = L.map(elRef.current, { maxZoom: 22, doubleClickZoom: false }).setView(mitte, 19)
    const luftbild = L.tileLayer(HINTERGRUND_LUFTBILD, { maxZoom: 22, maxNativeZoom: 20, attribution: '© swisstopo' }).addTo(map)
    const landeskarte = L.tileLayer(HINTERGRUND_KARTE, { maxZoom: 22, maxNativeZoom: 18, attribution: '© swisstopo' })
    const namenPane = map.createPane(NAMEN_PANE)
    namenPane.style.zIndex = '450'
    namenPane.style.pointerEvents = 'none'
    const eb: Record<string, L.LayerGroup> = {
      av: L.layerGroup().addTo(map), plan: L.layerGroup().addTo(map), osm: L.layerGroup().addTo(map), namen: L.layerGroup().addTo(map), sicht: L.layerGroup().addTo(map),
      hind: L.layerGroup().addTo(map), fix: L.layerGroup().addTo(map), auswahl: L.layerGroup().addTo(map), zeichnen: L.layerGroup().addTo(map),
      standort: L.layerGroup().addTo(map),
    }
    L.control.layers({ 'Luftbild (SWISSIMAGE)': luftbild, 'Landeskarte (swisstopo)': landeskarte }, { 'Amtliche Vermessung': eb.av,
      'Flächen (Plan)': eb.plan,
      'OSM-Übergänge': eb.osm, 'Strassennamen (OSM)': eb.namen, 'Sichtfelder': eb.sicht, 'Hindernisse': eb.hind,
      'Fixpunkte und Masse': eb.fix },
    { collapsed: true }).addTo(map)
    L.control.scale({ imperial: false }).addTo(map)
    // «Zum eigenen Standort» unter den Zoom-Knöpfen
    const standortKnopf = new L.Control({ position: 'topleft' })
    standortKnopf.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar standort-knopf')
      const a = L.DomUtil.create('a', '', div)
      a.href = '#'; a.title = 'Zum eigenen Standort'; a.setAttribute('role', 'button'); a.setAttribute('aria-label', 'Zum eigenen Standort')
      a.innerHTML = STANDORT_SYMBOL
      L.DomEvent.disableClickPropagation(div)
      L.DomEvent.on(a, 'click', e => { L.DomEvent.preventDefault(e); standort() })
      return div
    }
    standortKnopf.addTo(map)
    const standort = () => {
      if (!window.isSecureContext) { setStandortHinweis({ text: 'Standort nur über eine sichere Verbindung (https) abrufbar.', fehler: true }); return }
      if (!('geolocation' in navigator)) { setStandortHinweis({ text: 'Dieser Browser kann den Standort nicht bestimmen.', fehler: true }); return }
      setStandortHinweis({ text: 'Standort wird bestimmt …' })
      navigator.geolocation.getCurrentPosition(pos => {
        if (kartenRef.current !== map) return            // Karte inzwischen entfernt bzw. neu aufgebaut
        const { latitude: lat, longitude: lon, accuracy } = pos.coords
        eb.standort.clearLayers()
        // nicht anklickbar: Klicks (Zeichnen, Auswahl) gehen an die Karte
        L.circle([lat, lon], { radius: accuracy, color: STANDORT_FARBE, weight: 1, fillColor: STANDORT_FARBE, fillOpacity: 0.12,
          interactive: false }).addTo(eb.standort)
        L.circleMarker([lat, lon], { radius: 6, color: '#ffffff', weight: 2, fillColor: STANDORT_FARBE, fillOpacity: 1, interactive: false })
          .addTo(eb.standort)
        if (accuracy > STANDORT_UNGENAU_M) map.fitBounds(L.latLng(lat, lon).toBounds(2 * accuracy))
        else map.setView([lat, lon], STANDORT_ZOOM)
        setStandortHinweis(null)
      }, err => setStandortHinweis({ text: standortFehlerText(err.code), fehler: true }),
      { enableHighAccuracy: true, timeout: STANDORT_MS, maximumAge: 30000 })
    }
    map.attributionControl.addAttribution('© OpenStreetMap-Mitwirkende')
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (cb.current.werkzeug) { cb.current.onKlick(lv95(e.latlng.lat, e.latlng.lng)); return }
      // Klick auf eine leere Stelle (nicht auf ein Objekt der Karte) hebt die Auswahl der Zufahrt auf
      if (!(e.originalEvent.target as Element | null)?.closest?.('.leaflet-interactive')) cb.current.onZufahrt(null)
    })
    map.on('dblclick', () => { if (cb.current.werkzeug) cb.current.onDoppelklick() })
    map.on('moveend', () => { markerAbgleich(); namenAbgleich(); cb.current.onAusschnitt() })
    kartenRef.current = map
    ebenenRef.current = eb
    return () => { map.remove(); kartenRef.current = null; ebenenRef.current = null }
  }, [mitte, kartenRef])

  useEffect(() => {
    const el = elRef.current
    if (el) el.style.cursor = werkzeug ? 'crosshair' : ''
  }, [werkzeug])

  // AV-Bodenbedeckung (Ebene, standardmässig aus)
  useEffect(() => {
    const map = kartenRef.current, eb = ebenenRef.current
    if (!map || !eb) return
    eb.av.clearLayers()
    if (!av) return
    for (const f of av) {
      const farbe = AV_FARBEN[f.art]
      if (!farbe) continue
      L.polygon(f.ringe.map(r => r.map(ll)), { color: farbe, weight: 1, fillColor: farbe, fillOpacity: AV_DECKKRAFT[f.art] ?? 0.25, interactive: false })
        .addTo(eb.av)
    }
    const text = `Amtliche Vermessung, Kanton ${kantone.join(', ') || '?'}, geodienste.ch`
    map.attributionControl.addAttribution(text)
    return () => { map.attributionControl.removeAttribution(text) }
  }, [av, kantone, kartenRef])

  // Flächen (Plan) von Hand: schraffiert über der AV (Bestand bleibt darunter sichtbar); Klick wählt zum Bearbeiten, Ecken des
  // gewählten Plans als Griffe (Hindernisse-Effekt)
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.plan.clearLayers()
    for (const fp of flaechenPlan) {
      const f = PLAN_FARBEN[fp.art]
      L.polygon(fp.ring.map(ll), { color: f.linie, weight: fp.id === bearbeiten ? 3 : 2, dashArray: STRICH_PLAN,
        fillColor: `url(#${PLAN_MUSTER}${fp.art})`, fillOpacity: 1, interactive: !werkzeug })
        .bindTooltip(`<b>${esc(planTitel(fp.id))}: ${esc(PLAN_NAME[fp.art])} (Plan, von Hand)</b>, ` +
          `${planFlaecheM2(fp.ring).toFixed(1).replace('.', ',')} m²<br>ersetzt in der Rechnung die AV darunter<br><i>Klick: wählen und bearbeiten</i>`,
        { sticky: true })
        .on('click', e => { if (cb.current.werkzeug) return; L.DomEvent.stopPropagation(e); cb.current.onHindernis(fp.id) })
        .addTo(eb.plan)
    }
    // av: nach einem Neuzeichnen der AV-Ebene (eigene Pfade im selben SVG) die Plan-Flächen wieder darüber
  }, [flaechenPlan, bearbeiten, werkzeug, av])

  // Strassennamen (OSM): Beschriftungen nur zur Orientierung, nicht anklickbar (Klicks gehen an die Karte)
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.namen.clearLayers()
    namenRef.current = strassennamen.map(s => ({ s, m: null }))
    namenAbgleich()
  }, [strassennamen])

  // OSM-Übergänge zum Anklicken. Marker je Übergang einmal erzeugt (neu nur bei geänderten Daten des Knotens), gezeichnet
  // werden nur die im Sichtbereich mit Rand (MARKER_RAND); die Auswahl ändert nur den Stil des alten und des neuen Markers.
  useEffect(() => {
    const vorher = markerRef.current, neu = new Map<number, { k: OsmKnoten; m: L.CircleMarker }>()
    for (const k of uebergaenge) {
      const alt = vorher.get(k.id)
      if (alt && alt.k === k) { neu.set(k.id, alt); vorher.delete(k.id); continue }
      const mk = markierung(k.tags)
      const m = L.circleMarker([k.lat, k.lon], markerStil(mk, k.id === cb.current.gewaehlt))
        .bindTooltip(`<b>OSM-Übergang ${k.id}</b> (${UEBERGANG_TEXT[mk]})<br>` +
          Object.entries(k.tags).map(([a, b]) => `${esc(a)}=${esc(b)}`).join('<br>') + '<br><i>Klick: prüfen</i>')
        // beim Zeichnen zählt der Klick auf jeden Übergang als Kartenklick (setzt einen Punkt; ohne stopPropagation geht er an die
        // Karte): sonst finge ein fremder Marker z. B. einen Wartebereich eines geplanten Streifens ab (Prüfung 16.10.2026)
        .on('click', e => {
          if (cb.current.werkzeug) return
          L.DomEvent.stopPropagation(e); cb.current.onUebergang(k)
        })
      neu.set(k.id, { k, m })
    }
    for (const { m } of vorher.values()) m.remove()
    markerRef.current = neu
    markerAbgleich()
  }, [uebergaenge])
  useEffect(() => {
    const n = markerRef.current
    for (const id of new Set([gewaehltRef.current, gewaehlt])) {
      const x = id === null ? undefined : n.get(id)
      if (!x) continue
      const g = id === gewaehlt
      x.m.setStyle(markerStil(markierung(x.k.tags), g))
    }
    gewaehltRef.current = gewaehlt
    markerAbgleich()                                   // gewählter Übergang immer gezeichnet
    const x = gewaehlt === null ? undefined : n.get(gewaehlt)
    if (x && ebenenRef.current?.osm.hasLayer(x.m)) x.m.bringToFront()
  }, [gewaehlt])

  // Ergebnis: Streifen, Annäherungsbereiche, Sichtfelder
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.sicht.clearLayers()
    if (!rechnung) return
    for (const s of rechnung.streifen) {
      for (const z of s.zufahrten) {
        const farbe = STATUS_FARBE[z.status] ?? '#10b981'
        L.polygon(multiLl(z.feld), { color: farbe, weight: 1, fillColor: farbe, fillOpacity: 0.1, interactive: !cb.current.werkzeug })
          .bindTooltip(`Sichtfeld ${esc(cb.current.zufahrtName(z.fgsId, z.zufahrt))}${z.deckung ? ' (mitgeprüft)' : ''}: ${z.status === 'frei' ? 'frei' : esc(z.status.replace('_', ' '))}`, { sticky: true })
          .on('click', () => { if (!cb.current.werkzeug) cb.current.onZufahrt(zufahrtKey(z)) }).addTo(eb.sicht)
      }
      for (const a of s.ann) L.polygon(a.map(r => r.map(ll)), { color: '#0ea5e9', weight: 1, fillOpacity: 0.4, interactive: false }).addTo(eb.sicht)
      L.polygon(s.umriss.map(ll), { color: '#fde047', weight: 2, fillColor: '#fde047', fillOpacity: 0.5, interactive: false }).addTo(eb.sicht)
    }
    // angenommene Inseln (nach OSM und Luftbild): gestrichelter Umriss, «prüfen»
    for (const z of rechnung.inseln ?? [])
      L.polygon(z.ring.map(ll), { color: INSEL_FARBE, weight: 2, dashArray: STRICH_INSEL, fillColor: INSEL_FARBE, fillOpacity: 0.12,
        interactive: !cb.current.werkzeug })
        .bindTooltip(`${INSEL_TEXT}: Lücke zwischen den Balken ${z.breite.toFixed(1).replace('.', ',')} m quer zur Strasse; ` +
          'teilt den Streifen. Sonst Werkzeug «Insel» unter «Eingaben von Hand».', { sticky: true }).addTo(eb.sicht)
    // Luftbild-Erkennung: Balken (erkannt durchgezogen, unsicher gestrichelt), «aus Luftbild, prüfen»
    const lb = rechnung.luftbild
    if (lb && lb.befund !== 'nicht_gefunden') {
      // gestrichelt: unsicher bzw. mit Flächen (Plan) nur Vorschlag
      const st = { color: LUFTBILD_FARBE, weight: 1.5, fill: false, dashArray: lb.befund === 'erkannt' && !lb.nurVorschlag ? undefined : '4 3',
        interactive: false }
      for (const b of lb.balken) L.polygon(b.map(ll), st).addTo(eb.sicht)
      for (const t of lb.teile) L.polygon(t.umriss.map(ll), { ...st, weight: 2, interactive: true })
        .bindTooltip(`Streifen aus Luftbild (${lb.befund === 'erkannt' ? 'erkannt' : 'unsicher'}${lb.nurVorschlag ? ', mit Flächen (Plan) nur Vorschlag' : ''}), prüfen: ${t.nBalken} Balken, ` +
          `Balkenlänge ${t.bw.toFixed(1).replace('.', ',')} m`, { sticky: true }).addTo(eb.sicht)
    }
  }, [rechnung, werkzeug])

  // Hindernisse (von Hand, bestätigt) und Vorschläge (gestrichelt, «aus OSM, prüfen»)
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.hind.clearLayers()
    for (const h of hindernisse) {
      const farbe = hindernisFarbe(h)
      const ebene = hindernisEbene(h, { color: farbe, weight: h.id === bearbeiten ? 3 : 2, fillColor: farbe, fillOpacity: 0.35 })
      ;(ebene as L.Path).bindTooltip(esc(hindernisText(h)) + ((h.art === 'hecke' || h.art === 'mauer' || h.art === 'uebrige') &&
        !h.sichtbehindernd ? ' – nicht sichtbehindernd' : ''), { sticky: true })
        .on('click', e => { if (cb.current.werkzeug) return; L.DomEvent.stopPropagation(e); cb.current.onHindernis(h.id) })
      ebene.addTo(eb.hind)
    }
    for (const v of rechnung?.vorschlaege ?? []) {
      const farbe = hindernisFarbe(v.hindernis)
      const ebene = hindernisEbene(v.hindernis, { color: farbe, weight: v.id === bearbeiten ? 4 : 2, dashArray: v.hindernis.quelle === 'osm' ? '5 4' : undefined,
        fillColor: farbe, fillOpacity: v.hindernis.quelle === 'osm' ? 0.12 : 0.35 })
      ;(ebene as L.Path).bindTooltip(`${esc(v.hindernis.name ?? 'Vorschlag')}<br>${esc(v.grund)}` +
        (v.hindernis.quelle === 'kataster' ? '<br><i>Klick: wählen, im Panel verwerfen</i>' : ''), { sticky: true })
        .on('click', e => { if (cb.current.werkzeug) return; L.DomEvent.stopPropagation(e); cb.current.onHindernis(v.id) })
      ebene.addTo(eb.hind)
    }
    // verworfene amtliche Parkfelder: gestrichelt, gedimmt; Klick wählt, im Panel «wieder zählen»
    for (const v of rechnung?.parkVerworfen ?? []) {
      const farbe = hindernisFarbe(v.hindernis)
      const ebene = hindernisEbene(v.hindernis, { color: farbe, weight: v.id === bearbeiten ? 3 : 1.5, dashArray: '4 4', opacity: 0.6,
        fillColor: farbe, fillOpacity: 0.05 })
      ;(ebene as L.Path).bindTooltip(`${esc(v.hindernis.name ?? 'Parkfeld')} – verworfen, zählt nicht<br><i>Klick: wählen, im Panel wieder zählen</i>`,
        { sticky: true })
        .on('click', e => { if (cb.current.werkzeug) return; L.DomEvent.stopPropagation(e); cb.current.onHindernis(v.id) })
      ebene.addTo(eb.hind)
    }
    for (const s of streifenHand) {
      L.polyline([ll(s.p0), ll(s.p1)], { color: '#fde047', weight: 3, dashArray: '6 4' })
        .bindTooltip(`${esc(cb.current.streifenTitel(s.id))} (Streifen von Hand)`)
        .addTo(eb.hind)
    }
    // Ecken des bearbeiteten Objekts verschieben
    const ecken = (id: string, pts: P[]) => pts.forEach((p, i) => {
      L.marker(ll(p), { draggable: true, icon: L.divIcon({ className: 'ecke', iconSize: [12, 12] }) })
        .on('dragend', (e: L.LeafletEvent) => { const g = (e.target as L.Marker).getLatLng(); cb.current.onEcke(id, i, lv95(g.lat, g.lng)) })
        .addTo(eb.hind)
    })
    const h = hindernisse.find(x => x.id === bearbeiten)
    if (h) ecken(h.id, h.art === 'parkfeld' ? h.ring : h.art === 'baum' ? [h.p] : h.art === 'laengsparkierung' ? h.linie : h.ring ?? h.linie ?? [])
    const sh = streifenHand.find(x => x.id === bearbeiten)
    if (sh) ecken(sh.id, [sh.p0, sh.p1])
    const fp = fixpunkte.find(x => x.id === bearbeiten)
    if (fp) ecken(fp.id, [fp.p])
    const pl = flaechenPlan.find(x => x.id === bearbeiten)
    if (pl) ecken(pl.id, pl.ring)
  }, [hindernisse, rechnung, streifenHand, fixpunkte, flaechenPlan, bearbeiten])

  // Fixpunkte (Kreuz im Quadrat; Klick wählt zum Verschieben, beim Zeichnen nicht anklickbar), Vorschläge blass, Masslinien
  // gestrichelt mit Länge in m (rechner/vermassung.fixpunktMasse)
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.fix.clearLayers()
    for (const m of masslinien) {
      L.polyline([ll(m.von), ll(m.bis)], { color: FIXPUNKT_FARBE, weight: 2, dashArray: '5 4', interactive: false }).addTo(eb.fix)
      const mitte: P = [(m.von[0] + m.bis[0]) / 2, (m.von[1] + m.bis[1]) / 2]
      L.marker(ll(mitte), { interactive: false, keyboard: false, icon: L.divIcon({ className: 'masstext', iconSize: [0, 0],
        html: `<span>${esc(m.text)}</span>` }) }).addTo(eb.fix)
    }
    // Vorschläge: Tooltip mit Herkunft und Abstand, Klick übernimmt (beim Zeichnen nicht anklickbar, der Klick geht an die Karte)
    for (const v of fixVorschlaege)
      L.marker(ll(v.p), { interactive: !werkzeug, keyboard: false, icon: fixIcon(true) })
        .bindTooltip(`${esc(v.text)}<br><i>Klick: als Fixpunkt übernehmen</i>`)
        .on('click', () => fixVorschlagRef.current?.(v.p)).addTo(eb.fix)
    for (const f of fixpunkte) {
      if (f.id === bearbeiten) continue                    // mit Griff gezeichnet (Hindernisse-Effekt)
      L.marker(ll(f.p), { interactive: !werkzeug, keyboard: false, icon: fixIcon(false) })
        .bindTooltip(`<b>${esc(fixpunktName(f))}</b><br>${esc(ART_TEXT[f.art])}<br><i>Klick: wählen und verschieben</i>`)
        .on('click', e => { if (cb.current.werkzeug) return; L.DomEvent.stopPropagation(e); cb.current.onHindernis(f.id) })
        .addTo(eb.fix)
    }
  }, [fixpunkte, fixVorschlaege, masslinien, bearbeiten, werkzeug])

  // gewählte Zufahrt hervorheben
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.auswahl.clearLayers()
    if (!rechnung || !auswahl) return
    const z = rechnung.streifen.flatMap(s => s.zufahrten).find(x => zufahrtKey(x) === auswahl)
    if (!z) return
    const farbe = STATUS_FARBE[z.status] ?? '#10b981'
    L.polygon(multiLl(z.feld), { color: farbe, weight: 2, fillColor: farbe, fillOpacity: 0.25, interactive: false }).addTo(eb.auswahl)
    for (const k of z.konflikte)
      L.polygon(multiLl(k.geom), { color: '#7f1d1d', weight: 2, fillColor: '#dc2626', fillOpacity: 0.6 })
        .bindTooltip(`${esc(k.layer)}: ${k.klasse === 'baum' ? 'Stamm' : `${k.flaeche.toFixed(1)} m²`} im Sichtfeld, ${k.abstand.toFixed(1)} m vom Streifen`)
        .addTo(eb.auswahl)
    // Fahrlinie weiss gestrichelt; gedeckte Abbiegezufahrt (nur mit GEDECKT_RECHNEN) mit weiterem Strichabstand, Sichtfeld wie üblich
    L.polyline(z.spur.map(ll), { color: '#ffffff', weight: 1.5, dashArray: z.deckung ? STRICH_GEDECKT : '4 4', interactive: false }).addTo(eb.auswahl)
    z.sichtpunkte.forEach((p, i) => {
      const ende = i === 0 || i === z.sichtpunkte.length - 1
      // weiss mit dunklem Rand: Rot steht in der Karte für «verdeckt»
      L.circleMarker(ll(p), { radius: ende ? 5 : 3, color: '#111827', weight: 1.5, fillColor: '#ffffff', fillOpacity: 1, interactive: ende })
        .bindTooltip(ende ? (i === 0 ? 'erster Sichtpunkt (am Streifen)' : `letzter Sichtpunkt (${z.sichtweite} m)`) : 'Sichtpunkt')
        .addTo(eb.auswahl)
    })
  }, [rechnung, auswahl])

  // Zeichnung in Arbeit
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.zeichnen.clearLayers()
    if (!zeichnung.length) return
    L.polyline(zeichnung.map(ll), { color: '#f43f5e', weight: 2, dashArray: '3 3', interactive: false }).addTo(eb.zeichnen)
    for (const p of zeichnung) L.circleMarker(ll(p), { radius: 4, color: '#f43f5e', fillColor: '#ffffff', fillOpacity: 1, interactive: false }).addTo(eb.zeichnen)
  }, [zeichnung])

  const ortWaehlen = (o: Ort) => kartenRef.current?.setView([o.lat, o.lon], ortZoom(o.art))
  const hinweise = [props.hinweis, standortHinweis].filter((h): h is KartenHinweis => !!h)
  return (
    <div className="kartenrahmen">
      <PlanMuster />
      <div ref={elRef} className="karte" />
      <div className="kartenkopf">
        <Ortssuche onOrt={ortWaehlen} />
        {hinweise.map(h => (
          <div key={h.text} className={'kartenhinweis' + (h.fehler ? ' fehler' : '')} role="status">
            {h.text}
            {h.erneut && <>{' '}<button className="zweit klein" onClick={h.erneut}>erneut suchen</button></>}
          </div>
        ))}
      </div>
    </div>
  )
}
