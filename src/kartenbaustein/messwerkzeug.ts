// ── Messwerkzeug auf der Karte, gleich in allen Rechnern (17.11.2026) ──
// Ein Knopf unter den Zoom-Knöpfen schaltet es ein. Messarten wie das Werkzeug «Messen» des fgsCheck, dazu zwei freie:
// - «Zwei Punkte»: zwei Klicks; jeder rastet am nächsten Stützpunkt der AV-Bodenbedeckung im Umkreis von FANG_PX Bildschirmpunkten ein,
//   sonst an der nächsten Bordkante im selben Radius (der zweite Punkt dann rechtwinklig zum ersten), sonst bleibt er frei.
// - «Ab AV-Kante»: ein Klick auf die Markierung; gemessen wird rechtwinklig bis zur nächsten Bordkante der AV.
// - «Ganze Fläche»: ein Klick in die Fahrbahn; gemessen wird rechtwinklig von der nächsten Kante durch den Klick bis zur gegenüberliegenden.
// - «Linienzug»: beliebig viele Punkte (Länge je Abschnitt und gesamt), «Flächeninhalt»: Inhalt und Umfang eines Vielecks; beide rasten ein
//   wie «Zwei Punkte».
// Mit gedrückter Alt-Taste rastet kein Punkt ein. Doppelklick, Rechtsklick, Enter oder ein Klick auf den letzten Punkt schliesst einen
// Linienzug ab (beim Flächeninhalt auch ein Klick auf den ersten Punkt). Messungen bleiben stehen, bis «Alle löschen» oder das Ausschalten sie
// entfernt; gesetzte Punkte lassen sich ziehen (sie gelten dann als frei).
// Die Bordkanten (messAv.ts) zeigt das Werkzeug orange. Die AV lädt es selbst (avDienst.ladeAvOrt): ab Zoom AV_AB_ZOOM den Ausschnitt,
// höchstens alle AV_ABSTAND_MS (geodienste.ch erlaubt rund 10 Abfragen je Minute), und bei einem Klick ausserhalb des Geladenen die
// Umgebung des Klicks. Hat der Rechner eigene AV (avVorrang, im fgsCheck samt Flächen (Plan)), gilt diese, wo sie liegt.
// Gerechnet wird eben in LV95 (projektion.ts), wie die amtliche Vermessung. Nichts davon kommt in den Fall.
//
// Solange das Werkzeug läuft, gehören ihm alle Klicks auf der Karte: Es fängt sie vor Leaflets Verteilung ab (Map._fireDOMEvent, auch der
// Weg der Canvas-Ebenen), damit kein Werkzeug, Popup oder Objekt des Rechners mitreagiert. Verschieben, Zoomen und Hover bleiben.

import L from 'leaflet'
import './baustein.css'
import { lv95, wgs } from './projektion'
import { dist, type P } from './geometrie'
import { flaechenInhalt, flaechenText, meterText, streckenLaenge } from './messRechnung'
import { bordkanten, FANG_M, FANG_PX, fangRadiusM, messeAbKante, messeFlaeche, messPunktFangen, MESSPUNKT_TEXT, type Kante, type MessAvFlaeche,
  type MessPunktArt } from './messAv'
import { ladeAvOrt, type AvHolen } from './avDienst'
import { AV_ABSTAND_MS } from './avAusschnitt'

export type MessForm = 'hand' | 'kante' | 'flaeche' | 'linie' | 'inhalt'
interface Messung { form: MessForm; punkte: L.LatLng[]; arten: MessPunktArt[]; fertig: boolean }

export const MESSFORM_NAME: Record<MessForm, string> = { hand: 'Zwei Punkte', kante: 'Ab AV-Kante', flaeche: 'Ganze Fläche', linie: 'Linienzug',
  inhalt: 'Flächeninhalt' }
const MESSFORM_TITEL: Record<MessForm, string> = {
  hand: 'Zwei Punkte anklicken. Nahe einem Vermessungspunkt oder einer orangen Kante rastet der Punkt dort ein, der zweite rechtwinklig zum ersten.',
  kante: 'Auf die Markierung klicken, an der Stelle, bis zu der die Breite zählt. Gemessen wird rechtwinklig bis zur nächsten Bordkante der ' +
    'amtlichen Vermessung (orange).',
  flaeche: 'In die Fahrbahn klicken: gemessen wird rechtwinklig von der nächsten Bordkante (orange) durch den Klick bis zur gegenüberliegenden ' +
    'Kante, Bordstein bis Bordstein.',
  linie: 'Anfang, Knicke und Ende anklicken: Länge je Abschnitt und gesamt.',
  inhalt: 'Die Eckpunkte anklicken: Inhalt und Umfang der Fläche.',
}
const MIT_PUNKTEN: ReadonlySet<MessForm> = new Set(['hand', 'linie', 'inhalt'])

/** Ab diesem Zoom lädt das Werkzeug die AV des Ausschnitts von sich aus */
export const AV_AB_ZOOM = 17
const AV_MIN_R = 80, AV_MAX_R = 400, AV_RAND_M = 15

const LINIE = '#ffd400', RAND = '#111827', KANTE = '#f97316'
const PANE = 'messwerkzeug', WERT_PANE = 'messwerkzeugWerte', PUNKT_PANE = 'messwerkzeugPunkte'
/** Abschnitte, die auf dem Bildschirm kürzer sind, bekommen keine eigene Beschriftung */
const ABSCHNITT_PX = 60
const LINEAL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" ' +
  'aria-hidden="true"><path d="M3 15.5 15.5 3 21 8.5 8.5 21z"/><path d="M7 11.5l1.8 1.8M9.5 9l2.5 2.5M12 6.5l1.8 1.8M14.5 4l1 1M6 14l2.5 2.5" ' +
  'stroke-linecap="round"/></svg>'
/** Erklärung hinter ⓘ, in Zeilen (die erste erklärt die gewählte Messart) */
const INFO: readonly [string, string][] = [
  ['Einrasten', 'an AV-Punkten und den orangen Bordkanten der amtlichen Vermessung (geodienste.ch, in der Stadt Luzern die ' +
    'Strassenflächen der Stadt); mit gedrückter Alt-Taste nicht.'],
  ['Abschliessen', 'Doppelklick, Rechtsklick, Enter oder Klick auf den letzten Punkt (Flächeninhalt: auf den ersten). Rücktaste nimmt ' +
    'den letzten Punkt weg, Esc beendet.'],
  ['Genauigkeit', 'Luftbild rund 10 cm je Bildpunkt; Dächer und Brücken liegen darin versetzt, darum am Boden messen. Gerechnet eben in ' +
    'LV95, nichts wird gespeichert.'],
]
const ABFANGEN = new Set(['click', 'dblclick', 'contextmenu'])
/** Wurde gerade gezogen? (Leaflets Handler haben moved(), die Typen kennen es nicht) */
const bewegt = (h: L.Handler | undefined): boolean => !!(h as unknown as { moved?(): boolean } | undefined)?.moved?.()

type DomFeuer = (e: Event, type: string, canvasZiele?: L.Layer[]) => void
interface LeafletIntern { _fireDOMEvent: DomFeuer; boxZoom?: { moved(): boolean } }

export interface MessWerkzeugOptionen {
  position?: L.ControlPosition
  /** Abruf der AV (der Rechner kann Stand und Fehler selbst melden); sonst fetch */
  holen?: AvHolen
  /** AV des Rechners (im fgsCheck samt Flächen (Plan)); gilt im Bereich, den sie abdeckt, vor der selbst geladenen */
  avVorrang?: () => readonly MessAvFlaeche[] | null | undefined
  /** Wert in ein Feld des Rechners übernehmen (im fgsCheck das zuletzt angeklickte Zahlenfeld in Metern): ziel nennt das Feld (null: keins),
   *  setzen schreibt die Länge in Metern hinein, wertText zeigt den Wert so, wie er ins Feld kommt (z. B. gerundet) */
  uebernehmen?: { ziel: () => string | null; setzen: (m: number) => void; wertText?: (m: number) => string; ohneZiel?: string }
}
/** Einmaliges Ziel von «übernehmen» (zum Beispiel ein Feld eines Abschnitts im VeloroutenCheck): gilt vom Start bis zum Ausschalten,
 *  vor `uebernehmen` der Optionen. setzen bekommt die Länge in Metern und die Messart; gibt es false zurück (Wert nicht übernommen, der
 *  Rechner meldet warum), bleibt das Werkzeug offen, sonst schliesst es mit schliessen. */
export interface MessZiel { text: string; setzen: (m: number, info: { form: MessForm }) => boolean | void; wertText?: (m: number) => string; schliessen?: boolean }
export interface MessWerkzeug {
  an(): void; aus(): void; aktiv(): boolean; entfernen(): void
  /** einschalten und die Messart wählen (zum Beispiel aus einem Knopf «messen» neben einem Feld), mit einem einmaligen Ziel */
  starten(f?: MessForm, ziel?: MessZiel): void
}
/** Werkzeug einer Karte, damit der Rechner es aus seinen Knöpfen starten kann, ohne den Verweis selbst zu halten */
const WERKZEUGE = new WeakMap<L.Map, MessWerkzeug>()
export const messWerkzeugFuer = (map: L.Map | null | undefined): MessWerkzeug | undefined => (map ? WERKZEUGE.get(map) : undefined)

const fetchJson: AvHolen = async url => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}
type Kasten = [number, number, number, number]
const kastenVon = (fl: readonly MessAvFlaeche[]): Kasten => {
  const k: Kasten = [Infinity, Infinity, -Infinity, -Infinity]
  for (const f of fl) for (const [e, n] of f.ringe[0] ?? []) { k[0] = Math.min(k[0], e); k[1] = Math.min(k[1], n); k[2] = Math.max(k[2], e); k[3] = Math.max(k[3], n) }
  return k
}
const imKasten = (p: P, k: Kasten, rand: number) => p[0] >= k[0] + rand && p[0] <= k[2] - rand && p[1] >= k[1] + rand && p[1] <= k[3] - rand

/** Hängt Knopf und Werkzeug an die Karte (Position wie Leaflets Steuerelemente, Standard oben links unter den Zoom-Knöpfen) */
export function messWerkzeug(map: L.Map, opt: MessWerkzeugOptionen = {}): MessWerkzeug {
  const intern = map as unknown as LeafletIntern, holen = opt.holen ?? fetchJson
  for (const [name, z, maus] of [[PANE, 640, false], [WERT_PANE, 645, false], [PUNKT_PANE, 646, true]] as const) {
    const p = map.getPane(name) ?? map.createPane(name)
    p.style.zIndex = String(z)
    if (!maus) p.style.pointerEvents = 'none'
  }
  const kantenEbene = L.layerGroup().addTo(map), linien = L.layerGroup().addTo(map), werte = L.layerGroup().addTo(map), punkte = L.layerGroup().addTo(map)
  const gummi = L.polyline([], { pane: PANE, interactive: false, color: LINIE, weight: 2, dashArray: '5 5', opacity: 0.95 })
  const gummiWert = L.marker([0, 0], { pane: WERT_PANE, interactive: false, keyboard: false,
    icon: L.divIcon({ className: 'mw-wert mw-gummi', iconSize: [0, 0], html: '' }) })
  let messungen: Messung[] = [], form: MessForm = 'hand', aktiv = false, zuletzt: Event | null = null, meldung: string | null = null
  let infoOffen = false, tafelHtml = '', einmalZiel: MessZiel | null = null
  let kette: Promise<void> = Promise.resolve()
  const punktZu = new WeakMap<Element, { m: Messung; i: number; marker: L.Marker }>()
  const original = intern._fireDOMEvent

  const laufend = (): Messung | null => { const m = messungen[messungen.length - 1]; return m && !m.fertig ? m : null }
  const lv = (ps: readonly L.LatLng[]): P[] => ps.map(q => lv95(q.lat, q.lng))
  const ll = (p: P) => { const [lat, lon] = wgs(p[0], p[1]); return L.latLng(lat, lon) }
  const pixel = (a: L.LatLng, b: L.LatLng) => map.latLngToContainerPoint(a).distanceTo(map.latLngToContainerPoint(b))
  const wert = (ort: L.LatLng, text: string, klasse = '') => L.marker(ort, { pane: WERT_PANE, interactive: false, keyboard: false,
    icon: L.divIcon({ className: `mw-wert${klasse}`, iconSize: [0, 0], html: `<span>${text}</span>` }) }).addTo(werte)
  const mitte = (a: L.LatLng, b: L.LatLng) => L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2)
  /** Länge von FANG_PX Bildschirmpunkten in Metern, in der Mitte der Karte */
  const fangM = () => { const c = map.getSize().divideBy(2); return fangRadiusM(map.distance(map.containerPointToLatLng(c), map.containerPointToLatLng(c.add([FANG_PX, 0])))) }

  // ── AV: selbst geladen (Quadrate um Ausschnitt bzw. Klick), daraus die Bordkanten; die AV des Rechners hat Vorrang, wo sie liegt ──
  const av = { quadrate: [] as { e: number; n: number; r: number }[], flaechen: [] as MessAvFlaeche[], schluessel: new Set<string>(),
    kanten: null as Kante[] | null, lauf: null as Promise<void> | null, fehler: null as string | null, letzte: -Infinity, uhr: 0 }
  let vorrang: { quelle: readonly MessAvFlaeche[]; kasten: Kasten; kanten: Kante[] } | null = null
  const abgedeckt = (p: P, rand: number) => av.quadrate.some(q => Math.abs(p[0] - q.e) <= q.r - rand && Math.abs(p[1] - q.n) <= q.r - rand)
  const eigeneKanten = () => (av.kanten ??= bordkanten(av.flaechen))
  const vorrangJetzt = () => {
    const q = opt.avVorrang?.()
    if (!q?.length) return (vorrang = null)
    if (vorrang?.quelle !== q) vorrang = { quelle: q, kasten: kastenVon(q), kanten: bordkanten(q) }
    return vorrang
  }
  /** AV und Bordkanten für einen Punkt: die des Rechners, wenn sie ihn abdeckt, sonst die selbst geladene */
  const avBei = (p: P): { flaechen: readonly MessAvFlaeche[]; kanten: readonly Kante[] } => {
    const v = vorrangJetzt()
    return v && imKasten(p, v.kasten, AV_RAND_M) ? { flaechen: v.quelle, kanten: v.kanten } : { flaechen: av.flaechen, kanten: eigeneKanten() }
  }
  /** halbe Kantenlänge eines Quadrats um den Ausschnitt */
  const ausschnittR = () => {
    const b = map.getBounds(), sw = lv95(b.getSouth(), b.getWest()), ne = lv95(b.getNorth(), b.getEast())
    return Math.min(AV_MAX_R, Math.max(AV_MIN_R, Math.ceil(Math.max(ne[0] - sw[0], ne[1] - sw[1]) / 2 + 30)))
  }
  function avLaden(m: P, r: number): Promise<void> {
    av.letzte = Date.now()
    av.lauf = ladeAvOrt(m[0], m[1], r, holen).then(fl => {
      for (const f of fl) {
        const k = `${f.art}:${f.ringe[0]?.[0]?.join(',')}:${f.ringe[0]?.length}`
        if (!av.schluessel.has(k)) { av.schluessel.add(k); av.flaechen.push(f) }
      }
      av.quadrate.push({ e: m[0], n: m[1], r }); av.kanten = null; av.fehler = null
    }, (e: unknown) => { av.fehler = `AV nicht geladen (${e instanceof Error ? e.message : String(e)})` })
      .finally(() => { av.lauf = null; if (aktiv) { kantenZeichnen(); tafel() } })
    tafel()
    return av.lauf
  }
  /** Sorgt dafür, dass die AV um p geladen ist (bei einem Klick: sofort, ohne Wartezeit) */
  async function avFuer(p: P): Promise<void> {
    const v = vorrangJetzt()
    if ((v && imKasten(p, v.kasten, AV_RAND_M)) || abgedeckt(p, AV_RAND_M)) return
    if (av.lauf) { await av.lauf; if (abgedeckt(p, AV_RAND_M)) return }
    const c = map.getCenter(), m = lv95(c.lat, c.lng), r = ausschnittR()
    await avLaden(Math.max(Math.abs(p[0] - m[0]), Math.abs(p[1] - m[1])) <= r - AV_RAND_M ? m : p, r)
  }
  /** Ausschnitt vorladen: ab AV_AB_ZOOM, nur wenn er nicht schon abgedeckt ist, höchstens alle AV_ABSTAND_MS */
  function vorladen() {
    window.clearTimeout(av.uhr)
    if (!aktiv || map.getZoom() < AV_AB_ZOOM || av.lauf) return
    const c = map.getCenter(), m = lv95(c.lat, c.lng), r = ausschnittR(), v = vorrangJetzt()
    const b = map.getBounds(), ecken = [lv95(b.getSouth(), b.getWest()), lv95(b.getNorth(), b.getEast())]
    if (ecken.every(p => abgedeckt(p, 0) || (v && imKasten(p, v.kasten, 0)))) return
    const warten = av.letzte + AV_ABSTAND_MS - Date.now()
    if (warten > 0) { av.uhr = window.setTimeout(vorladen, warten); return }
    void avLaden(m, r)
  }

  // ── Zeichnen: Bordkanten, Linien und Werte immer neu, die Punkte nur, wenn keiner gerade gezogen wird ──
  function kantenZeichnen() {
    kantenEbene.clearLayers()
    if (!aktiv || map.getZoom() < AV_AB_ZOOM - 1) return
    const b = map.getBounds().pad(0.2), sw = lv95(b.getSouth(), b.getWest()), ne = lv95(b.getNorth(), b.getEast())
    const sicht = (k: Kante) => Math.max(k.a[0], k.b[0]) >= sw[0] && Math.min(k.a[0], k.b[0]) <= ne[0] && Math.max(k.a[1], k.b[1]) >= sw[1] &&
      Math.min(k.a[1], k.b[1]) <= ne[1]
    const v = vorrangJetzt()
    const ks = [...(v?.kanten ?? []), ...eigeneKanten().filter(k => !v || !imKasten(k.a, v.kasten, AV_RAND_M))].filter(sicht)
    if (ks.length) L.polyline(ks.map(k => [ll(k.a), ll(k.b)]), { pane: PANE, interactive: false, color: KANTE, weight: 2, opacity: 0.9 }).addTo(kantenEbene)
  }

  function zeichnen(mitPunkten = true) {
    linien.clearLayers(); werte.clearLayers()
    if (mitPunkten) punkte.clearLayers()
    for (const m of messungen) {
      const zu = m.form === 'inhalt' && m.fertig, ps = lv(m.punkte), n = m.punkte.length
      const stil = { pane: PANE, interactive: false } as const
      if (zu) L.polygon(m.punkte, { ...stil, color: RAND, weight: 5, opacity: 0.55, fillColor: LINIE, fillOpacity: 0.18 }).addTo(linien)
      else if (n > 1) L.polyline(m.punkte, { ...stil, color: RAND, weight: 5, opacity: 0.55 }).addTo(linien)
      if (n > 1) (zu ? L.polygon(m.punkte, { ...stil, color: LINIE, weight: 2.5, fill: false })
        : L.polyline(m.punkte, { ...stil, color: LINIE, weight: 2.5 })).addTo(linien)
      if (m.form === 'linie' || m.form === 'inhalt') {
        // Abschnitte: eigene Länge, sobald es mehr als einen gibt
        const abschnitte = zu ? n : n - 1
        if (abschnitte > 1) for (let i = 0; i < abschnitte; i++) {
          const a = m.punkte[i], b = m.punkte[(i + 1) % n]
          if (pixel(a, b) >= ABSCHNITT_PX) wert(mitte(a, b), meterText(streckenLaenge([ps[i], ps[(i + 1) % n]])), ' mw-abschnitt')
        }
        if (zu) wert(L.polygon(m.punkte).getBounds().getCenter(), flaechenText(flaechenInhalt(ps)), ' mw-summe')
        else if (n > 1) wert(m.punkte[n - 1], meterText(streckenLaenge(ps)), ' mw-summe mw-ende')
      } else if (n > 1) wert(mitte(m.punkte[0], m.punkte[1]), meterText(streckenLaenge(ps)), ' mw-summe')
      if (mitPunkten) m.punkte.forEach((q, i) => punkt(m, q, i))
    }
    tafel()
  }

  function punkt(m: Messung, q: L.LatLng, i: number) {
    const ziehbar = MIT_PUNKTEN.has(m.form), erster = i === 0 && m.form === 'inhalt' && !m.fertig && m.punkte.length > 2
    const klasse = `mw-punkt${erster ? ' mw-schliessen' : ''}${m.arten[i] !== 'frei' ? ' mw-gefangen' : ''}${ziehbar ? '' : ' mw-fest'}`
    const marker = L.marker(q, { pane: PUNKT_PANE, draggable: ziehbar, keyboard: false, autoPan: false,
      icon: L.divIcon({ className: klasse, iconSize: ziehbar ? [12, 12] : [8, 8] }),
      title: `${MESSPUNKT_TEXT[m.arten[i]]}${!ziehbar ? '' : erster ? ' · Fläche schliessen' : i === m.punkte.length - 1 && !m.fertig ? ' · Messung abschliessen'
        : ' · ziehen zum Verschieben'}` })
    marker.on('drag', () => { m.punkte[i] = marker.getLatLng(); m.arten[i] = 'frei'; zeichnen(false) })
    marker.on('dragend', () => zeichnen())
    marker.addTo(punkte)
    const el = marker.getElement()
    if (el) punktZu.set(el, { m, i, marker })
  }

  // ── Gummiband vom letzten Punkt zur Maus, mit der Länge bzw. Fläche, die der nächste Klick ergäbe ──
  function gummiband(ort: L.LatLng | null) {
    const m = laufend()
    if (!aktiv || !m || !ort) { gummi.remove(); gummiWert.remove(); return }
    const letzter = m.punkte[m.punkte.length - 1]
    gummi.setLatLngs(m.form === 'inhalt' && m.punkte.length > 1 ? [letzter, ort, m.punkte[0]] : [letzter, ort]).addTo(map)
    const ps = lv([...m.punkte, ort])
    const text = m.form === 'inhalt' && ps.length > 2 ? flaechenText(flaechenInhalt(ps)) : meterText(streckenLaenge(ps))
    gummiWert.setLatLng(ort).setIcon(L.divIcon({ className: 'mw-wert mw-gummi', iconSize: [0, 0], html: `<span>${text}</span>` })).addTo(map)
  }

  function abschliessen() {
    const m = laufend()
    if (!m) return
    if (m.punkte.length < (m.form === 'inhalt' ? 3 : 2)) messungen = messungen.filter(x => x !== m)
    else m.fertig = true
    gummiband(null); zeichnen()
  }

  /** Klick auf die Karte (Punkt bzw. Messung je Messart); läuft nach dem Laden der AV, der Reihe nach */
  async function verarbeiten(p: P, ohneFang: boolean, r: number) {
    if (!ohneFang || form === 'kante' || form === 'flaeche') await avFuer(p)
    if (!aktiv) return
    const { flaechen, kanten } = avBei(p)
    meldung = null
    if (form === 'kante' || form === 'flaeche') {
      abschliessen()
      const ohne = 'Hier gibt es keine Bordkanten der AV: mit «Zwei Punkte» messen.'
      if (form === 'kante') {
        const e = messeAbKante(p, kanten)
        if (e) messungen.push({ form, punkte: [ll(e.fuss), ll(p)], arten: ['bordkante', 'frei'], fertig: true })
        else meldung = kanten.length ? `Keine Bordkante innert ${FANG_M} m: näher bei der Kante klicken oder mit «Zwei Punkte» messen.` : ohne
      } else {
        const e = messeFlaeche(p, kanten)
        if (e) messungen.push({ form, punkte: [ll(e.von), ll(e.bis)], arten: ['bordkante', 'bordkante'], fertig: true })
        else meldung = kanten.length ? `Keine zwei Bordkanten gefunden: in die Fahrbahn klicken, höchstens ${FANG_M} m von einer Kante, oder mit ` +
          '«Zwei Punkte» messen.' : ohne
      }
      zeichnen(); return
    }
    let m = laufend()
    if (m && m.form !== form) { abschliessen(); m = null }
    const von = m ? lv([m.punkte[m.punkte.length - 1]])[0] : undefined
    const q = ohneFang ? { p, art: 'frei' as const } : messPunktFangen(p, flaechen, kanten, r, von)
    // rastet der Klick auf den letzten bzw. (Flächeninhalt) ersten Punkt ein, schliesst er ab wie ein Klick auf dessen Marke
    if (m && ((von && dist(q.p, von) < 0.01) || (m.form === 'inhalt' && m.punkte.length > 2 && dist(q.p, lv([m.punkte[0]])[0]) < 0.01))) {
      abschliessen(); return
    }
    if (m) { m.punkte.push(ll(q.p)); m.arten.push(q.art) }
    else messungen.push(m = { form, punkte: [ll(q.p)], arten: [q.art], fertig: false })
    if (form === 'hand' && m.punkte.length === 2) m.fertig = true
    zeichnen(); gummiband(m.fertig ? null : ll(q.p))
  }

  function klick(e: MouseEvent) {
    const ziel = e.target as Element | null
    const pk = ziel?.closest?.('.mw-punkt'), treffer = pk ? punktZu.get(pk) : undefined
    const m = laufend()
    if (treffer) {
      if (bewegt(treffer.marker.dragging)) return
      if (m && treffer.m === m && (treffer.i === m.punkte.length - 1 && m.punkte.length > 1 ||
        treffer.i === 0 && m.form === 'inhalt' && m.punkte.length > 2)) abschliessen()
      if (MIT_PUNKTEN.has(treffer.m.form)) return
    }
    const ort = map.mouseEventToLatLng(e), p = lv95(ort.lat, ort.lng), ohneFang = e.altKey, r = fangM()
    kette = kette.then(() => verarbeiten(p, ohneFang, r)).catch(() => undefined)
  }

  // Klicks abfangen: nur, solange das Werkzeug läuft; alles andere (Bewegen, Ziehen, Hover) geht den gewohnten Weg
  const abfangen: DomFeuer = function (this: unknown, e, type, canvasZiele) {
    if (!aktiv || !ABFANGEN.has(type) || (e.target as Element | null)?.closest?.('.leaflet-control')) {
      original.call(map, e, type, canvasZiele); return
    }
    if (e === zuletzt) return          // Canvas-Ebenen melden denselben Klick zweimal (Canvas und Karte)
    zuletzt = e
    if (type === 'contextmenu') { L.DomEvent.preventDefault(e); abschliessen(); return }
    if (type === 'dblclick') { abschliessen(); return }
    if (bewegt(map.dragging) || intern.boxZoom?.moved()) return
    klick(e as MouseEvent)
  }

  const maus = (e: MouseEvent) => {
    if (aktiv) gummiband(laufend() && !(e.target as Element | null)?.closest?.('.leaflet-control') ? map.mouseEventToLatLng(e) : null)
  }
  const raus = () => gummiband(null)
  const taste = (e: KeyboardEvent) => {
    if (!aktiv) return
    const t = e.target as HTMLElement | null
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
    if (e.key === 'Escape') { if (laufend()) abschliessen(); else aus(); e.preventDefault() }
    else if (e.key === 'Enter' && laufend()) { abschliessen(); e.preventDefault() }
    else if (e.key === 'Backspace' && laufend()) { letztenWeg(); e.preventDefault() }
  }

  function letztenWeg() {
    const m = laufend() ?? messungen[messungen.length - 1]
    if (!m) return
    if (MIT_PUNKTEN.has(m.form)) { m.punkte.pop(); m.arten.pop(); m.fertig = false } else m.punkte = []
    if (!m.punkte.length) messungen.pop()
    gummiband(null); zeichnen()
  }

  // ── Knopf und Tafel ──
  const steuerung = new L.Control({ position: opt.position ?? 'topleft' })
  const box = L.DomUtil.create('div', 'mw-steuerung')
  const leiste = L.DomUtil.create('div', 'leaflet-bar', box)
  const knopf = L.DomUtil.create('a', 'mw-knopf', leiste)
  knopf.href = '#'; knopf.title = 'Messen auf dem Luftbild'; knopf.innerHTML = LINEAL
  knopf.setAttribute('role', 'button'); knopf.setAttribute('aria-label', 'Messen'); knopf.setAttribute('aria-pressed', 'false')
  const fenster = L.DomUtil.create('div', 'mw-fenster', box)
  fenster.hidden = true
  L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box)
  L.DomEvent.on(knopf, 'click', e => { L.DomEvent.preventDefault(e); if (aktiv) aus(); else an() })
  L.DomEvent.on(fenster, 'click', e => {
    // Die Tafel wird gleich neu geschrieben: ohne Halt fände Leaflet den Knopf nicht mehr in der Tafel und nähme den Klick als Messpunkt
    L.DomEvent.stopPropagation(e)
    const a = (e.target as Element).closest('[data-aktion]')?.getAttribute('data-aktion')
    if (!a) return
    if (a === 'zu') aus()
    else if (a === 'info') { infoOffen = !infoOffen; tafel() }
    else if (a in MESSFORM_NAME) { abschliessen(); form = a as MessForm; meldung = null; zeichnen() }
    else if (a === 'weg') letztenWeg()
    else if (a === 'fertig') abschliessen()
    else if (a === 'leeren') { messungen = []; meldung = null; gummiband(null); zeichnen() }
    else if (a === 'uebernehmen') {
      const w = uebernahmeWert(), m = messungen[messungen.length - 1]
      if (w === null || !m) return
      if (einmalZiel) { const z = einmalZiel; if (z.setzen(w, { form: m.form }) !== false && z.schliessen) aus(); else tafel(); return }
      if (opt.uebernehmen?.ziel()) opt.uebernehmen.setzen(w)
      tafel()
    }
  })
  steuerung.onAdd = () => box
  steuerung.addTo(map)

  function ergebnisText(m: Messung): string {
    const ps = lv(m.punkte)
    if (m.form === 'inhalt' && (m.fertig || ps.length > 2)) return `<b>Fläche ${flaechenText(flaechenInhalt(ps))}</b><br>Umfang ${meterText(streckenLaenge(ps, true))}`
    if (m.form === 'kante') return `<b>Ab Kante ${meterText(streckenLaenge(ps))}</b>`
    if (m.form === 'flaeche') return `<b>Bord bis Bord ${meterText(streckenLaenge(ps))}</b>`
    if (m.form === 'hand') return `<b>Strecke ${meterText(streckenLaenge(ps))}</b> (${m.arten.map(a => MESSPUNKT_TEXT[a]).join(', ')})`
    return `<b>Strecke ${meterText(streckenLaenge(ps))}</b>${ps.length > 2 ? ` (${ps.length - 1} Abschnitte)` : ''}`
  }
  /** Länge der letzten fertigen Messung (nicht beim Flächeninhalt), die «übernehmen» schreibt */
  function uebernahmeWert(): number | null {
    const m = messungen[messungen.length - 1]
    return m && m.fertig && m.form !== 'inhalt' && m.punkte.length > 1 ? streckenLaenge(lv(m.punkte)) : null
  }
  function uebernahmeZeile(): string {
    const u = einmalZiel ?? opt.uebernehmen
    if (!u) return ''
    const ziel = einmalZiel ? einmalZiel.text : opt.uebernehmen!.ziel(), w = uebernahmeWert()
    if (!ziel) return `<div class="mw-ziel">${opt.uebernehmen?.ohneZiel ?? 'Ziel: zuerst ein Zahlenfeld in Metern anklicken; dann schreibt «übernehmen» den Wert hinein.'}</div>`
    const wert = w === null ? null : (u.wertText ?? meterText)(w)
    return `<div class="mw-ziel">Ziel: «${ziel}» <button type="button" data-aktion="uebernehmen"${w === null ? ' disabled' : ''} ` +
      `title="${wert ? `${wert} in «${ziel}» schreiben` : 'zuerst messen (Flächeninhalt geht nicht)'}">übernehmen${wert ? ` (${wert})` : ''}</button></div>`
  }
  function hinweisText(lauf: Messung | null): string {
    if (lauf?.form === 'hand') return 'Zweiten Punkt anklicken.'
    if (lauf?.form === 'inhalt') return 'Klick auf den ersten Punkt schliesst die Fläche.'
    if (lauf) return 'Doppelklick oder Klick auf den letzten Punkt: fertig.'
    return { hand: 'Zwei Punkte anklicken; sie rasten an AV-Punkten und orangen Kanten ein.',
      kante: 'Auf die Markierung klicken: Abstand rechtwinklig zur nächsten orangen Kante.',
      flaeche: 'In die Fahrbahn klicken: Breite von Kante zu Kante.',
      linie: 'Anfang, Knicke und Ende anklicken.', inhalt: 'Die Eckpunkte anklicken.' }[form]
  }
  function avText(): string {
    if (av.lauf) return 'AV wird geladen …'
    if (av.fehler) return av.fehler
    if (map.getZoom() < AV_AB_ZOOM && !av.quadrate.length && !vorrang) return `AV lädt ab Zoom ${AV_AB_ZOOM} oder beim Klick.`
    return ''
  }

  function tafel() {
    if (!aktiv) { fenster.hidden = true; return }
    const m = messungen[messungen.length - 1], lauf = laufend()
    let ergebnis = 'Noch nichts gemessen.'
    if (m && m.punkte.length > 1) ergebnis = ergebnisText(m) + (lauf ? ' <i>(läuft)</i>' : '')
    const wahl = (f: MessForm) => `<button type="button" data-aktion="${f}" class="${form === f ? 'an' : ''}" aria-pressed="${form === f}" ` +
      `title="${MESSFORM_TITEL[f]}">${MESSFORM_NAME[f]}</button>`
    const avZeile = avText()
    // ⓘ klappt die Erklärung in der Tafel auf (title-Tooltips zeigen nicht alle Browser, auf dem Smartphone keiner)
    const html = '<div class="mw-kopf"><span>Messen <button type="button" class="mw-info" data-aktion="info" ' +
      `aria-expanded="${infoOffen}" aria-label="Erklärung ${infoOffen ? 'zuklappen' : 'aufklappen'}">ⓘ</button></span>` +
      '<button type="button" class="mw-zu" data-aktion="zu" title="Messen beenden" aria-label="Messen beenden">×</button></div>' +

      `<div class="mw-wahl">${(Object.keys(MESSFORM_NAME) as MessForm[]).map(wahl).join('')}</div>` +
      `<div class="mw-ergebnis">${ergebnis}</div>` +
      (meldung ? `<div class="mw-meldung">${meldung}</div>` : `<div class="mw-hinweis">${hinweisText(lauf)}</div>`) +
      (avZeile ? `<div class="mw-hinweis">${avZeile}</div>` : '') + uebernahmeZeile() +
      `<div class="mw-knoepfe"><button type="button" data-aktion="weg"${m ? '' : ' disabled'} title="Letzten Punkt entfernen (Rücktaste)">` +
      '↶ Punkt</button>' + (lauf ? '<button type="button" data-aktion="fertig" title="Messung abschliessen (Enter)">Fertig</button>' : '') +
      `<button type="button" data-aktion="leeren"${messungen.length ? '' : ' disabled'}>Alle löschen</button></div>` +
      (infoOffen ? `<dl class="mw-infotext">${[[MESSFORM_NAME[form], MESSFORM_TITEL[form]], ...INFO].map(([k, t]) => `<dt>${k}</dt><dd>${t}</dd>`)
        .join('')}</dl>` : '')
    // nur bei einer Änderung neu schreiben: sonst verschwindet der Knopf unter der Maus zwischen Drücken und Loslassen und der Klick geht verloren
    if (html !== tafelHtml) { fenster.innerHTML = html; tafelHtml = html }
    fenster.hidden = false
  }

  const neu = () => { zeichnen(); kantenZeichnen() }
  // ein anderes Feld angeklickt: das Ziel von «übernehmen» kann gewechselt haben (der Rechner merkt es sich im selben Ereignis)
  const zielGewechselt = (e: FocusEvent) => { if (opt.uebernehmen && !box.contains(e.target as Node)) window.setTimeout(tafel, 0) }
  function starten(f?: MessForm, ziel?: MessZiel) {
    an()
    einmalZiel = ziel ?? null
    if (f && f !== form) { abschliessen(); form = f; meldung = null }
    zeichnen()
  }
  const verschoben = () => { kantenZeichnen(); vorladen() }
  function an() {
    if (aktiv) return
    aktiv = true
    intern._fireDOMEvent = abfangen
    map.getContainer().classList.add('mw-aktiv')
    knopf.classList.add('an'); knopf.setAttribute('aria-pressed', 'true')
    map.getContainer().addEventListener('mousemove', maus)
    map.getContainer().addEventListener('mouseleave', raus)
    document.addEventListener('keydown', taste)
    document.addEventListener('focusin', zielGewechselt)
    map.on('zoomend', neu); map.on('moveend', verschoben)
    zeichnen(); kantenZeichnen(); vorladen()
  }
  function aus() {
    if (!aktiv) return
    aktiv = false
    intern._fireDOMEvent = original
    window.clearTimeout(av.uhr)
    map.getContainer().classList.remove('mw-aktiv')
    knopf.classList.remove('an'); knopf.setAttribute('aria-pressed', 'false')
    map.getContainer().removeEventListener('mousemove', maus)
    map.getContainer().removeEventListener('mouseleave', raus)
    document.removeEventListener('keydown', taste)
    document.removeEventListener('focusin', zielGewechselt)
    map.off('zoomend', neu); map.off('moveend', verschoben)
    messungen = []; meldung = null; einmalZiel = null; gummiband(null); zeichnen(); kantenZeichnen()
  }
  function entfernen() {
    aus()
    steuerung.remove(); kantenEbene.remove(); linien.remove(); werte.remove(); punkte.remove()
    map.off('unload', entfernen)
  }
  map.on('unload', entfernen)
  const werkzeug: MessWerkzeug = { an, aus, aktiv: () => aktiv, entfernen, starten }
  WERKZEUGE.set(map, werkzeug)
  return werkzeug
}
