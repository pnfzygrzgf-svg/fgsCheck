import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { AvFlaeche } from './daten/av'
import type { OsmKnoten } from './daten/osm'
import { markierung } from './daten/osm'
import type { ZufahrtErgebnis } from './rechner/typen'
import type { FallRechnung } from './rechner'
import type { Multi } from './rechner/poly'
import { type Hindernis, laengsPolygon, stammPolygon } from './rechner/hindernisse'
import type { StreifenHand } from './fall'
import { wgs, lv95, type P } from './geo'

export const AV_FARBEN: Record<string, string> = {
  Strasse_Weg: '#94a3b8',
  Trottoir: '#f59e0b',
  Verkehrsinsel: '#a3e635',
  Gebaeude: '#b91c1c',
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
export const LUFTBILD_FARBE = '#f59e0b'
export const QUELLE_FARBE: Record<string, string> = { hand: '#0ea5e9', osm: '#f97316', kataster: '#16a34a' }
/**
 * Amtliche Parkfelder (Kataster der Stadt) nach Klasse, durchgezogen; verworfene gestrichelt und gedimmt. Farben abseits der
 * übrigen: Auto dunkelblau (nicht Rot wie AV-Gebäude und «verdeckt»), Motorrad pink (nicht Ocker wie «verdeckt (Baum)»).
 */
export const PARK_FARBE: Record<string, string> = { auto: '#1e40af', velo: '#0f766e', motorrad: '#ec4899' }
/** Farbe eines Hindernisses: amtliche Parkfelder nach Klasse, sonst nach Quelle */
export const hindernisFarbe = (h: Hindernis): string =>
  h.quelle === 'kataster' && h.art === 'parkfeld' ? PARK_FARBE[h.klasse] : QUELLE_FARBE[h.quelle] ?? '#0ea5e9'

export type Werkzeug = null | 'parkfeld' | 'laengs' | 'baum' | 'hecke' | 'mauer' | 'flaeche' | 'streifen' | 'spurB'

const ll = (p: P): L.LatLngTuple => wgs(p[0], p[1])
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
  const art = { parkfeld: 'Parkfeld', laengsparkierung: 'Längsparkierung', baum: 'Baum', hecke: 'Hecke', mauer: 'Mauer', uebrige: 'Hindernis' }[h.art]
  return `${h.name ?? art} (${q})`
}

export default function Karte(props: {
  mitte: [number, number]
  av: AvFlaeche[] | null
  kantone: string[]
  uebergaenge: OsmKnoten[]
  gewaehlt: number | null
  rechnung: FallRechnung | null
  auswahl: string | null
  hindernisse: Hindernis[]
  streifenHand: StreifenHand[]
  werkzeug: Werkzeug
  zeichnung: P[]
  bearbeiten: string | null                          // Id des Hindernisses bzw. Handstreifens, dessen Ecken verschoben werden
  onUebergang: (k: OsmKnoten) => void
  onZufahrt: (key: string | null) => void
  onKlick: (p: P) => void
  onDoppelklick: () => void
  onEcke: (id: string, i: number, p: P) => void
  onHindernis: (id: string) => void
  kartenRef: React.MutableRefObject<L.Map | null>
}) {
  const { mitte, av, kantone, uebergaenge, gewaehlt, rechnung, auswahl, hindernisse, streifenHand, werkzeug, zeichnung, bearbeiten,
    kartenRef } = props
  const elRef = useRef<HTMLDivElement>(null)
  const ebenenRef = useRef<Record<string, L.LayerGroup> | null>(null)
  const cb = useRef(props)
  cb.current = props

  useEffect(() => {
    if (!elRef.current || kartenRef.current) return
    const map = L.map(elRef.current, { maxZoom: 22, doubleClickZoom: false }).setView(mitte, 19)
    L.tileLayer('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
      { maxZoom: 22, maxNativeZoom: 20, attribution: '© swisstopo' }).addTo(map)
    const eb: Record<string, L.LayerGroup> = {
      av: L.layerGroup().addTo(map), osm: L.layerGroup().addTo(map), sicht: L.layerGroup().addTo(map),
      hind: L.layerGroup().addTo(map), auswahl: L.layerGroup().addTo(map), zeichnen: L.layerGroup().addTo(map),
    }
    L.control.layers(undefined, { 'Amtliche Vermessung': eb.av, 'OSM-Übergänge': eb.osm, 'Sichtfelder': eb.sicht,
      'Hindernisse': eb.hind }, { collapsed: true }).addTo(map)
    L.control.scale({ imperial: false }).addTo(map)
    map.attributionControl.addAttribution('© OpenStreetMap-Mitwirkende')
    map.on('click', (e: L.LeafletMouseEvent) => { if (cb.current.werkzeug) cb.current.onKlick(lv95(e.latlng.lat, e.latlng.lng)) })
    map.on('dblclick', () => { if (cb.current.werkzeug) cb.current.onDoppelklick() })
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
      L.polygon(f.ringe.map(r => r.map(ll)), { color: farbe, weight: 1, fillColor: farbe, fillOpacity: 0.25, interactive: false })
        .addTo(eb.av)
    }
    const text = `Amtliche Vermessung, Kanton ${kantone.join(', ') || '?'}, geodienste.ch`
    map.attributionControl.addAttribution(text)
    return () => { map.attributionControl.removeAttribution(text) }
  }, [av, kantone, kartenRef])

  // OSM-Übergänge zum Anklicken
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.osm.clearLayers()
    for (const k of uebergaenge) {
      const g = k.id === gewaehlt
      const mk = markierung(k.tags)
      L.circleMarker([k.lat, k.lon], {
        radius: g ? 9 : 6, color: g ? '#0f172a' : mk === 'vermutlich' ? '#a16207' : '#ffffff', weight: g ? 3 : 2,
        dashArray: mk === 'vermutlich' ? '3 3' : undefined,
        fillColor: UEBERGANG_FARBE[mk], fillOpacity: mk === 'vermutlich' ? 0.45 : 0.95,
      }).bindTooltip(`<b>OSM-Übergang ${k.id}</b> (${UEBERGANG_TEXT[mk]})<br>` +
        Object.entries(k.tags).map(([a, b]) => `${esc(a)}=${esc(b)}`).join('<br>') + '<br><i>Klick: prüfen</i>')
        // beim Zeichnen: Klick auf den gewählten Übergang setzt einen Punkt, auf einen anderen meldet die App
        .on('click', e => { if (cb.current.werkzeug && g) return; L.DomEvent.stopPropagation(e); cb.current.onUebergang(k) }).addTo(eb.osm)
    }
  }, [uebergaenge, gewaehlt])

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
          .bindTooltip(`Sichtfeld Zufahrt «${esc(z.zufahrt)}»: ${z.status === 'frei' ? 'frei' : esc(z.status.replace('_', ' '))}`, { sticky: true })
          .on('click', () => { if (!cb.current.werkzeug) cb.current.onZufahrt(zufahrtKey(z)) }).addTo(eb.sicht)
      }
      for (const a of s.ann) L.polygon(a.map(r => r.map(ll)), { color: '#0ea5e9', weight: 1, fillOpacity: 0.4, interactive: false }).addTo(eb.sicht)
      L.polygon(s.umriss.map(ll), { color: '#fde047', weight: 2, fillColor: '#fde047', fillOpacity: 0.5, interactive: false }).addTo(eb.sicht)
    }
    // Luftbild-Erkennung: Balken (erkannt durchgezogen, unsicher gestrichelt), «aus Luftbild, prüfen»
    const lb = rechnung.luftbild
    if (lb && lb.befund !== 'nicht_gefunden') {
      const st = { color: LUFTBILD_FARBE, weight: 1.5, fill: false, dashArray: lb.befund === 'erkannt' ? undefined : '4 3', interactive: false }
      for (const b of lb.balken) L.polygon(b.map(ll), st).addTo(eb.sicht)
      for (const t of lb.teile) L.polygon(t.umriss.map(ll), { ...st, weight: 2, interactive: true })
        .bindTooltip(`Streifen aus Luftbild (${lb.befund === 'erkannt' ? 'erkannt' : 'unsicher'}), prüfen: ${t.nBalken} Balken, ` +
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
      L.polyline([ll(s.p0), ll(s.p1)], { color: '#fde047', weight: 3, dashArray: '6 4' }).bindTooltip(`Streifen von Hand ${esc(s.id)}`)
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
  }, [hindernisse, rechnung, streifenHand, bearbeiten])

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
    L.polyline(z.spur.map(ll), { color: '#ffffff', weight: 1.5, dashArray: '4 4', interactive: false }).addTo(eb.auswahl)
    z.sichtpunkte.forEach((p, i) => {
      const ende = i === 0 || i === z.sichtpunkte.length - 1
      L.circleMarker(ll(p), { radius: ende ? 5 : 3, color: '#ffffff', weight: 1, fillColor: '#dc2626', fillOpacity: 1, interactive: ende })
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

  return <div ref={elRef} className="karte" />
}
