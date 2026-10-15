// ── Bericht (E4): Druckansicht eines Falls, als PDF über den Druckdialog des Browsers ──
//
// Eigene Ansicht über der App (die Karte bleibt darunter bestehen), A4 hoch per @media print (index.css); als Portal direkt im body. Das Kartenbild ist
// KEIN Leaflet-Ausschnitt: Kacheln laden beim Drucken oft nicht fertig und Leaflet verschiebt Ebenen mit CSS-Transforms, die
// manche Browser beim Drucken falsch setzen. Stattdessen ein einziges Luftbild per WMS (wms.geo.admin.ch, EPSG:2056) für einen
// festen Ausschnitt und darüber eine SVG-Zeichnung der Geometrie. Weil Bild und Rechnung beide in LV95 (ebene Koordinaten)
// sind, ist die Zuordnung eine reine Verschiebung und Skalierung, ohne Projektion. «Drucken» wird erst frei, wenn das Bild
// geladen ist (bzw. nicht geladen werden konnte oder nach BILD_ZEITGRENZE_MS nicht da ist: dann ohne Hintergrund, mit Hinweis).

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Fall, streifenHerkunftText } from './fall'
import type { FallRechnung } from './rechner'
import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'
import { type Hindernis, laengsPolygon, stammPolygon } from './rechner/hindernisse'
import type { Multi } from './rechner/poly'
import { SICHTWEITE, KURVE_SICHTWEITE } from './rechner/tempo'
import { lv95, dist, type P } from './geo'
import { wmsBildUrl, LUFTBILD_QUELLE } from './daten/luftbild'
import { STATUS_FARBE, STRICH_GEDECKT, UEBERGANG_TEXT, INSEL_FARBE, STRICH_INSEL, hindernisFarbe, hindernisText, INSEL_TEXT } from './Karte'
import { GRUND, ART, STATUS, statusText, f1, f2 } from './texte'

const APP_URL = 'https://fgscheck.ch/'
const RAND_M = 4                       // Rand um Streifen und Sichtfelder im Kartenbild
const MIN_M = 40                       // kleinste Kantenlänge des Ausschnitts
const BILD_PX_MAX = 1400               // Breite des WMS-Bilds höchstens (Auflösung SWISSIMAGE 0,1 m/px)
const BILD_PX_MIN = 1200               // und mindestens: A4 hoch, Kartenbreite rund 186 mm -> rund 164 dpi im Druck
const BILD_ZEITGRENZE_MS = 20000       // danach gilt das Bild als nicht geladen (Drucken ohne Hintergrund)
const VB = 1000                        // Breite der SVG-Zeichnung in Einheiten

type Box = [number, number, number, number]

/** Strichart je Status (zusätzlich zur Farbe, damit der Bericht schwarz-weiss lesbar bleibt) */
const strich = (status: string) => (status === 'frei' ? undefined : status.startsWith('verdeckt') ? '14 7' : '3 6')

function hindernisRinge(h: Hindernis): { ringe: P[][]; linie: boolean } {
  if (h.art === 'parkfeld') return { ringe: [h.ring], linie: false }
  if (h.art === 'laengsparkierung') return { ringe: [laengsPolygon(h.linie, h.breite)], linie: false }
  if (h.art === 'baum') return { ringe: [stammPolygon(h.p, Math.max(h.stamm, 0.8))], linie: false }
  if (h.ring) return { ringe: [h.ring], linie: false }
  return { ringe: [h.linie ?? []], linie: true }
}

/** Ausschnitt: Streifen und Sichtfelder mit Rand, Seitenverhältnis Höhe/Breite zwischen 0,6 und 0,95 (passt auf A4 hoch) */
function ausschnitt(r: FallRechnung, ort: P): Box {
  let e0 = ort[0], e1 = ort[0], n0 = ort[1], n1 = ort[1]
  const dazu = (ps: P[]) => { for (const p of ps) { e0 = Math.min(e0, p[0]); e1 = Math.max(e1, p[0]); n0 = Math.min(n0, p[1]); n1 = Math.max(n1, p[1]) } }
  for (const s of r.streifen) {
    dazu(s.umriss)
    for (const z of s.zufahrten) { for (const poly of z.feld) for (const ring of poly) dazu(ring); dazu(z.sichtpunkte) }
  }
  e0 -= RAND_M; e1 += RAND_M; n0 -= RAND_M; n1 += RAND_M
  const weiten = (a: number, b: number, l: number): [number, number] => { const m = (a + b) / 2; return [m - l / 2, m + l / 2] }
  if (e1 - e0 < MIN_M) [e0, e1] = weiten(e0, e1, MIN_M)
  if (n1 - n0 < MIN_M * 0.6) [n0, n1] = weiten(n0, n1, MIN_M * 0.6)
  const w = e1 - e0, h = n1 - n0
  if (h / w > 0.95) [e0, e1] = weiten(e0, e1, h / 0.95)
  else if (h / w < 0.6) [n0, n1] = weiten(n0, n1, w * 0.6)
  return [e0, n0, e1, n1]
}

function BerichtKarte({ r, hindernisse, ort, onBereit }: {
  r: FallRechnung; hindernisse: Hindernis[]; ort: P; onBereit: (s: 'laedt' | 'ok' | 'fehler') => void
}) {
  const box = useMemo(() => ausschnitt(r, ort), [r, ort])
  const [e0, n0, e1, n1] = box
  const wM = e1 - e0, hM = n1 - n0
  // Breite in Pixeln: 0,1 m/px, begrenzt auf BILD_PX_MIN..BILD_PX_MAX; Höhe aus derselben m/px (gleiches Seitenverhältnis)
  const bw = Math.min(BILD_PX_MAX, Math.max(BILD_PX_MIN, Math.round(wM / 0.1)))
  const mpx = wM / bw
  const bh = Math.round(hM / mpx)
  const url = wmsBildUrl(box, bw, bh)
  const s = VB / wM, vh = hM * s
  const xy = (p: P) => `${((p[0] - e0) * s).toFixed(1)},${((n1 - p[1]) * s).toFixed(1)}`
  const pfad = (ringe: P[][], zu = true) => ringe.filter(x => x.length).map(x => 'M' + x.map(xy).join('L') + (zu ? 'Z' : '')).join(' ')
  const multi = (m: Multi) => pfad(m.flat())
  // Ladezustand je Bild-URL (ändert sich der Ausschnitt, gilt das neue Bild als nicht geladen)
  const [geladen, setGeladen] = useState<{ url: string; ok: boolean } | null>(null)
  const status: 'laedt' | 'ok' | 'fehler' = geladen?.url !== url ? 'laedt' : geladen.ok ? 'ok' : 'fehler'
  useEffect(() => { onBereit(status) }, [status, onBereit])
  // Zeitgrenze je Bild-URL: ohne Antwort gilt das Bild als nicht geladen (aufgeräumt bei neuer URL und beim Schliessen)
  useEffect(() => {
    const t = setTimeout(() => setGeladen(g => (g?.url === url ? g : { url, ok: false })), BILD_ZEITGRENZE_MS)
    return () => clearTimeout(t)
  }, [url])
  // Massstab: runde Länge um ein Fünftel der Breite
  const mass = [5, 10, 20, 25, 50, 100, 200].reduce((b, x) => (Math.abs(x - wM / 5) < Math.abs(b - wM / 5) ? x : b), 10)
  const halo = { stroke: '#ffffff', strokeWidth: 5, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const }
  // gedeckte Abbiegezufahrten (nur mit GEDECKT_RECHNEN, standardmässig aus), beschriftet wie im Bild
  const gedeckte = r.streifen.flatMap(st => st.zufahrten).filter(z => z.deckung)
    .map(z => `${r.streifen.length > 1 ? `${z.fgsId}/` : ''}${z.zufahrt}`)
  return (
    <figure className="bericht-karte">
      <div className="bericht-bild" style={{ aspectRatio: `${bw} / ${bh}` }}>
        {status === 'fehler'
          ? <div className="bericht-ohne-bild klein">ohne Luftbild</div>
          : <img src={url} alt="Luftbild SWISSIMAGE des Ausschnitts" onLoad={() => setGeladen({ url, ok: true })}
            onError={() => setGeladen({ url, ok: false })} />}
        <svg viewBox={`0 0 ${VB} ${vh.toFixed(1)}`} preserveAspectRatio="none" aria-label="Streifen, Sichtfelder, Sichtpunkte und Hindernisse">
          <defs>
            <pattern id="schraffur" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="#dc2626" fillOpacity="0.35" />
              <line x1="0" y1="0" x2="0" y2="8" stroke="#000000" strokeWidth="2.5" />
            </pattern>
          </defs>
          {r.streifen.flatMap(st => st.zufahrten).map(z => (
            <path key={'f' + z.fgsId + z.zufahrt} d={multi(z.feld)} fillRule="evenodd" fill={STATUS_FARBE[z.status] ?? '#10b981'} fillOpacity={0.14}
              stroke={STATUS_FARBE[z.status] ?? '#10b981'} strokeWidth={2.5} strokeDasharray={strich(z.status)} />
          ))}
          {hindernisse.map(h => {
            const { ringe, linie } = hindernisRinge(h)
            const farbe = hindernisFarbe(h)
            return <path key={'h' + h.id} d={pfad(ringe, !linie)} fill={linie ? 'none' : farbe} fillOpacity={0.35} stroke={farbe}
              strokeWidth={linie ? 5 : 2} />
          })}
          {(r.inseln ?? []).map((z, i) => (
            <path key={'i' + i} d={pfad([z.ring])} fill={INSEL_FARBE} fillOpacity={0.15} stroke={INSEL_FARBE} strokeWidth={2.5}
              strokeDasharray={STRICH_INSEL.split(' ').map(x => Number(x) * 2).join(' ')} />
          ))}
          {r.streifen.flatMap(st => st.zufahrten).flatMap(z => z.konflikte.map((k, i) => (
            <path key={'k' + z.fgsId + z.zufahrt + i} d={multi(k.geom)} fillRule="evenodd" fill="url(#schraffur)" stroke="#000000" strokeWidth={1.5} />
          )))}
          {r.streifen.map(st => (
            <g key={'s' + st.fgsId}>
              {st.ann.map((a, i) => <path key={i} d={pfad(a)} fill="#0ea5e9" fillOpacity={0.35} stroke="#0369a1" strokeWidth={1} />)}
              <path d={pfad([st.umriss])} fill="#fde047" fillOpacity={0.7} stroke="#000000" strokeWidth={2} />
            </g>
          ))}
          {r.streifen.flatMap(st => st.zufahrten).map(z => (
            <g key={'p' + z.fgsId + z.zufahrt}>
              <polyline points={z.spur.map(xy).join(' ')} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeDasharray={z.deckung ? STRICH_GEDECKT : '5 5'} />
              {z.sichtpunkte.map((p, i) => {
                const ende = i === 0 || i === z.sichtpunkte.length - 1
                const [x, y] = xy(p).split(',').map(Number)
                return <circle key={i} cx={x} cy={y} r={ende ? 5 : 2.5} fill="#000000" stroke="#ffffff" strokeWidth={1.2} />
              })}
            </g>
          ))}
          {r.streifen.flatMap(st => st.zufahrten).map(z => {
            const p = z.sichtpunkte[z.sichtpunkte.length - 1]
            if (!p) return null
            const [x, y] = xy(p).split(',').map(Number)
            const mehrere = r.streifen.length > 1
            return <text key={'t' + z.fgsId + z.zufahrt} x={x + 8} y={y - 8} fontSize={20} fontWeight={700} fill="#000000" {...halo}>
              {mehrere ? `${z.fgsId}/` : ''}{z.zufahrt}</text>
          })}
          <g transform={`translate(20 ${(vh - 24).toFixed(1)})`}>
            <rect x={-8} y={-30} width={mass * s + 16} height={44} fill="#ffffff" fillOpacity={0.85} />
            <rect x={0} y={0} width={mass * s / 2} height={6} fill="#000000" />
            <rect x={mass * s / 2} y={0} width={mass * s / 2} height={6} fill="#ffffff" stroke="#000000" strokeWidth={1} />
            <text x={0} y={-8} fontSize={16}>0</text>
            <text x={mass * s} y={-8} fontSize={16} textAnchor="end">{mass} m</text>
          </g>
          <g transform={`translate(${VB - 36} 40)`}>
            <path d="M0,-26 L9,4 L0,-3 L-9,4 Z" fill="#000000" stroke="#ffffff" strokeWidth={1.5} />
            <text x={0} y={24} fontSize={18} fontWeight={700} textAnchor="middle" {...halo}>N</text>
          </g>
          <text x={VB - 8} y={vh - 8} fontSize={13} textAnchor="end" {...halo} strokeWidth={4}>© swisstopo · Geometrie: fgsCheck (AV, OSM, Eingaben)</text>
        </svg>
      </div>
      <figcaption className="klein">
        {status === 'laedt' && <span className="nicht-drucken">Luftbild wird geladen … </span>}
        {status === 'fehler' && <span className="warnung">Luftbild nicht geladen: Kartenbild ohne Hintergrund. </span>}
        Ausschnitt {Math.round(wM)} × {Math.round(hM)} m, Norden oben (LV95). Gelb: Streifen; blau: Annäherungsbereiche; Sichtfelder umrandet in
        der Farbe des Status (durchgezogen: frei, gestrichelt: verdeckt, gepunktet: nicht geprüft); schraffiert: Hindernis im Sichtfeld;
        schwarze Punkte: Sichtpunkte auf der Fahrlinie (weiss gestrichelt), beschriftet am letzten Sichtpunkt mit der Zufahrt; farbige
        Flächen: Hindernisse (Parkfelder, Bäume, Hecken, Mauern).
        {(r.inseln ?? []).length > 0 && <> Grün gestrichelt: {INSEL_TEXT} (crossing:island in OSM und Lücke zwischen den Balken im
          Luftbild).</>}
        {hindernisse.some(h => h.art === 'insel') && <> Grün: Insel von Hand.</>}
        {gedeckte.length > 0 && <> Abbiegezufahrt{gedeckte.length > 1 ? 'en' : ''} {gedeckte.join(', ')} (mitgeprüft): Weg ab dem Knoten durch die
          gerade Zufahrt mitgeprüft, selbst geprüft und für den Status gezählt; Fahrlinie weiss gepunktet.</>}
      </figcaption>
    </figure>
  )
}

/** Beschreibung einer Zufahrt-Eingabe (Schlüssel «Streifen|Kennung») mit dem Namen der Zufahrt, wenn die Rechnung sie kennt */
function zufahrtName(r: FallRechnung | null, key: string): string {
  const i = key.indexOf('|'), fid = key.slice(0, i), kennung = key.slice(i + 1)
  const s = r?.streifen.find(x => x.fgsId === fid)
  const z = s ? [...s.zufahrten, ...s.entfallen].find(x => x.kennung === kennung) : undefined
  return z ? `Streifen ${fid}, Zufahrt ${z.zufahrt}` : `Streifen ${fid}, ${kennung} (ohne passende Zufahrt)`
}

function eingabenListe(fall: Fall, r: FallRechnung | null): string[] {
  const aus: string[] = []
  for (const s of fall.streifenHand) aus.push(`Streifen ${s.id}: ${f1(dist(s.p0, s.p1))} m lang, ${f1(s.breite)} m breit, ${streifenHerkunftText(s)}`)
  for (const h of fall.hindernisse) aus.push(h.art === 'insel' ? 'Insel von Hand (teilt den Streifen wie eine AV-Verkehrsinsel, ersetzt die Insel nach OSM und Luftbild)' :
    `Hindernis: ${hindernisText(h)}` + ((h.art === 'hecke' || h.art === 'mauer' || h.art === 'uebrige') ?
    (h.sichtbehindernd ? ', sichtbehindernd' : ', nicht sichtbehindernd') : '') + (h.art === 'parkfeld' ? `, Klasse ${h.klasse}` : ''))
  for (const [k, z] of Object.entries(fall.zufahrten)) {
    const teile: string[] = []
    if (z.tempo) teile.push(`Tempo ${z.tempo} km/h`)
    if (z.spur?.art === 'A') teile.push(`Fahrlinie seitlich verschoben (am Streifen ${f2(z.spur.a)} m, am Ende ${f2(z.spur.b)} m; + links)`)
    if (z.spur?.art === 'B') teile.push(`Fahrlinie gezeichnet (${z.spur.linie.length} Punkte${z.spur.radius ? `, Radius ${f1(z.spur.radius)} m übernommen` : ''})`)
    if (z.streichen) teile.push('Zufahrt gestrichen («gibt es nicht»)')
    if (teile.length) aus.push(`${zufahrtName(r, k)}: ${teile.join('; ')}`)
  }
  for (const [k, e] of Object.entries(fall.streifen)) {
    const teile: string[] = []
    if (e.lsa) teile.push(`Lichtsignal ${e.lsa}`)
    if (e.keinFgs) teile.push('kein FGS')
    if (teile.length) aus.push(`Streifen ${k}: ${teile.join(', ')}`)
  }
  const verworfen = Object.keys(fall.vorschlaege).length
  if (verworfen) aus.push(`${verworfen} Vorschläge bzw. amtliche Felder verworfen (zählen nicht)`)
  if (fall.baumkataster) aus.push('Baumkataster zugeschaltet')
  if (fall.parkkataster === false) aus.push('Amtliche Parkfelder abgeschaltet')
  if (fall.luftbild === false) aus.push('Streifen-Suche im Luftbild abgeschaltet')
  return aus
}

function hinweisListe(r: FallRechnung, fall: Fall, luftbildStand: LuftbildStand): string[] {
  const aus: string[] = []
  if (r.hinweis) aus.push(r.hinweis)
  aus.push(...r.meldungen)
  const lb = r.luftbild
  if (lb) aus.push(lb.befund === 'erkannt' ? `Luftbild: Streifen erkannt (${lb.teile.map(t => `${t.nBalken} Balken`).join(' + ')}) – aus Luftbild, prüfen` +
      (r.streifenQuelle === 'luftbild' ? '; die Rechnung nutzt ihn.' : r.streifenQuelle === 'hand' ? '; die Rechnung nutzt die Streifen von Hand.' : '.')
    : lb.befund === 'unsicher' ? `Luftbild: Muster unsicher (${lb.gruende.join('; ')}); Streifen aus OSM + AV` +
      `${r.inselTeilt ? ', an der Insel aus dem Luftbild geteilt' : ''}.`
      : `Luftbild: kein Streifen gefunden (${lb.gruende.join('; ')}); Streifen aus OSM + AV.`)
  else if (fall.ort.uebergang !== null && fall.luftbild !== false && !fall.streifenHand.length) {
    if (luftbildStand === 'laedt') aus.push('Luftbild wird noch geladen: Streifen vorerst aus OSM + AV.')
    else if (luftbildStand === 'fehlt') aus.push('Luftbild nicht geladen: Streifen aus OSM + AV.')
  }
  const offen = r.vorschlaege.filter(v => v.hindernis.quelle === 'osm').length
  if (offen) aus.push(`${offen} Vorschläge «aus OSM, prüfen» (Parkierung) nicht bestätigt: zählen nicht.`)
  if (r.doppelt.length) aus.push(`${r.doppelt.length} Parkierung(en) von Hand decken sich mit amtlichen Parkfeldern (zählen doppelt?).`)
  for (const s of r.streifen) {
    for (const a of s.annahmen) aus.push(`Streifen ${s.fgsId}: ${a}`)
    for (const z of s.zufahrten) for (const a of z.annahmen) aus.push(`Streifen ${s.fgsId}, Zufahrt ${z.zufahrt}: ${a}`)
  }
  if (!fall.hindernisse.length && !r.vorschlaege.some(v => v.hindernis.quelle === 'kataster'))
    aus.push('Keine Hindernisse eingegeben und keine amtlichen Parkfelder: geprüft wurden nur Gebäude (AV).')
  return [...new Set(aus)]
}

/** Ladezustand des Luftbilds für die Streifen-Suche (App): noch unterwegs, fehlgeschlagen bzw. nicht angefragt, vorhanden */
export type LuftbildStand = 'laedt' | 'fehlt' | 'da'

function hindernisseText(z: ZufahrtErgebnis): string {
  if (!z.konflikte.length) return 'keine'
  return z.konflikte.map(k => `${k.layer}${k.klasse === 'baum' ? '' : ` ${f1(k.flaeche)} m²`}, ${f1(k.abstand)} m vom Streifen`).join('; ')
}

function StreifenTabelle({ s, fall }: { s: StreifenErgebnis; fall: Fall }) {
  return (
    <section className="bericht-block">
      <h3>Streifen {s.fgsId}{s.strasse ? ` – ${s.strasse}` : ''}: {STATUS[s.status] ?? s.status}</h3>
      <p className="klein">Länge {f1(Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]))} m, Breite {f1(s.bw)} m · Zuordnung OSM: {s.netzQuelle} ·
        Bordkanten: {s.randQuelle === 'AV' ? 'AV' : 'angenommen'} · Lichtsignal: {s.lsa === 'ja' ? `ja (${s.lsaQuelle ?? 'OSM'})` : 'nein'}</p>
      {s.keinFgsHinweis && <p className="klein"><b>Kein Fussgängerstreifen: Prüfung sinngemäss nach den FGS-Regeln, ohne Normbezug.</b></p>}
      {s.markierungHinweis && <p className="klein"><b>Vermutlich Fussgängerstreifen (Markierung in OSM nicht erfasst), bitte prüfen.</b></p>}
      {s.lsa === 'ja' && <p className="klein">Mit Lichtsignal gilt die Arbeitshilfe nicht; die Rechnung wird trotzdem gezeigt.</p>}
      {s.status !== 'kein_fgs' && (
        <table className="bericht-tabelle">
          <thead><tr><th>Zufahrt</th><th>Art</th><th>Tempo</th><th>Sichtweite</th><th>Status</th><th>Hindernisse im Sichtfeld</th></tr></thead>
          <tbody>
            {s.zufahrten.map(z => (
              <tr key={z.zufahrt}>
                <td><b>{z.zufahrt}</b>{z.deckung && <span className="klein"> (mitgeprüft)</span>}{z.strasse ? <div className="klein">{z.strasse}</div> : null}</td>
                <td>{ART[z.art] ?? z.art}</td>
                <td>{z.tempo} km/h<div className="klein">{z.tempoQuelle === 'Ersatz' ? 'Annahme (ohne Angabe)' : z.tempoQuelle === 'Korrektur' ? 'von Hand' : 'OSM'}</div></td>
                <td>{z.sichtweite} m<div className="klein">{z.sichtweiteQuelle}{z.kurvenradiusM != null ? `, R ${f1(z.kurvenradiusM)} m` : ''}</div></td>
                <td><b>{statusText(z, fall.hindernisse)}</b>{z.unter5m && <div className="klein">Auto-Parkfeld unter 5 m am Streifen</div>}</td>
                <td className="klein">{hindernisseText(z)}</td>
              </tr>
            ))}
            {!s.zufahrten.length && <tr><td colSpan={6} className="klein">keine Zufahrt</td></tr>}
          </tbody>
        </table>
      )}
      {s.entfallen.length > 0 && (
        <p className="klein">Nicht geprüfte Richtungen: {s.entfallen.map(e => `${e.zufahrt} (${GRUND[e.grund] ?? e.grund})`).join('; ')}.</p>
      )}
    </section>
  )
}

export default function Bericht({ fall, rechnung, rechnungZeit, kantone, flugjahr, luftbildStand, zusatzQuellen, aendern, schliessen }: {
  fall: Fall; rechnung: FallRechnung; rechnungZeit: Date | null; kantone: string[]; flugjahr: string; luftbildStand: LuftbildStand
  zusatzQuellen: string[]
  aendern: (f: (x: Fall) => Fall) => void; schliessen: () => void
}) {
  const [bild, setBild] = useState<'laedt' | 'ok' | 'fehler'>('laedt')
  const wartet = rechnung.streifen.length > 0 && bild === 'laedt'      // ohne Streifen kein Kartenbild
  const [e, n] = lv95(fall.ort.lat, fall.ort.lon)
  const ort = useMemo<P>(() => [e, n], [e, n])
  const heute = new Date()
  const datum = (d: Date) => d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const zeit = (d: Date) => d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
  const strassen = [...new Set(rechnung.streifen.map(s => s.strasse).filter(Boolean))]
  const mk = rechnung.markierung ?? fall.ort.markierung
  const eingaben = eingabenListe(fall, rechnung)
  const hinweise = hinweisListe(rechnung, fall, luftbildStand)
  // Bezeichnung: lokal tippen, erst beim Verlassen des Felds (bzw. Enter, Escape) in den Fall übernehmen – sonst lösten
  // jeder Tastendruck eine neue Rechnung und das Speichern im Browser aus. Der Bericht zeigt den lokalen Wert sofort.
  const [bez, setBez] = useState(fall.ort.bezeichnung ?? '')
  const bezUebernehmen = () => {
    const t = bez
    if (t.trim() === (fall.ort.bezeichnung ?? '').trim()) return
    aendern(f => { if (t.trim()) f.ort.bezeichnung = t; else delete f.ort.bezeichnung; return f })
  }
  const tausender = (x: number) => Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’')
  // Titel des Dokuments = Vorschlag für den Dateinamen beim Speichern als PDF
  useEffect(() => {
    const alt = document.title
    const d = new Date(), zz = (x: number) => String(x).padStart(2, '0')        // Lokaldatum (nicht UTC)
    document.title = `fgsCheck_Bericht_${fall.ort.uebergang ?? 'Ort'}_${d.getFullYear()}-${zz(d.getMonth() + 1)}-${zz(d.getDate())}`
    return () => { document.title = alt }
  }, [fall.ort.uebergang])
  // gedruckt wird nur der Bericht (index.css: body.bericht-offen #root ausgeblendet)
  useEffect(() => {
    document.body.classList.add('bericht-offen')
    return () => document.body.classList.remove('bericht-offen')
  }, [])
  useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') schliessen() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [schliessen])

  return createPortal(
    <div className="bericht" role="dialog" aria-label="Bericht">
      <div className="bericht-leiste nicht-drucken">
        <button onClick={() => window.print()} disabled={wartet} title={wartet ? 'Luftbild wird noch geladen' : ''}>
          {wartet ? 'Luftbild lädt …' : 'Drucken / als PDF speichern'}</button>
        <button className="zweit" onClick={schliessen}>Zurück zur Karte</button>
        <span className="klein">Im Druckdialog «Als PDF sichern» bzw. «Microsoft Print to PDF» wählen; A4 hoch, Hintergrundgrafiken einschalten.</span>
      </div>
      <article className="bericht-seite">
        <header>
          <h1><img className="logo" src={import.meta.env.BASE_URL + 'logo.svg'} alt="" width={36} height={36} />Sichtprüfung Fussgängerstreifen</h1>
          <p className="klein">fgsCheck · Bericht vom {datum(heute)}</p>
        </header>

        <section className="bericht-block">
          <h2>Ort</h2>
          <table className="bericht-zahlen"><tbody>
            <tr><td>Bezeichnung</td><td>
              <input className="nicht-drucken bericht-eingabe" type="text" placeholder="z. B. Adresse, Knoten (erscheint im Bericht)"
                value={bez} onChange={ev => setBez(ev.target.value)} onBlur={bezUebernehmen}
                onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); else if (ev.key === 'Escape') bezUebernehmen() }} />
              <span className="nur-drucken">{bez.trim() ? bez : '–'}</span>
            </td></tr>
            {strassen.length > 0 && <tr><td>Strasse (OSM)</td><td>{strassen.join(', ')}</td></tr>}
            <tr><td>Koordinaten</td><td>LV95 E {tausender(e)}, N {tausender(n)} · WGS84 {fall.ort.lat.toFixed(6)}, {fall.ort.lon.toFixed(6)}</td></tr>
            <tr><td>OSM-Übergang</td><td>{fall.ort.uebergang !== null ? <>Knoten {fall.ort.uebergang}{mk ? ` (${UEBERGANG_TEXT[mk] ?? mk})` : ''}</> : 'kein OSM-Übergang (Ort aus der Fall-Datei)'}</td></tr>
            <tr><td>Streifen aus</td><td>{rechnung.streifenQuelle === 'hand' ? `Eingabe von Hand: ${[...new Set(fall.streifenHand.map(streifenHerkunftText))].join('; ')}` : rechnung.streifenQuelle === 'luftbild' ? 'Luftbild (erkannt, prüfen)' : 'OSM und AV'}</td></tr>
            <tr><td>Daten geladen</td><td>{fall.quellen.geladen ?? '–'}; Rechnung {rechnungZeit ? `${datum(rechnungZeit)} ${zeit(rechnungZeit)}` : '–'}</td></tr>
          </tbody></table>
        </section>

        {rechnung.streifen.length > 0 && <BerichtKarte r={rechnung} ort={ort} onBereit={setBild}
          hindernisse={[...fall.hindernisse, ...rechnung.vorschlaege.filter(v => v.hindernis.quelle === 'kataster').map(v => v.hindernis)]} />}

        <section className="bericht-block">
          <h2>Ergebnis</h2>
          {rechnung.hinweis && <p><b>{rechnung.hinweis}</b></p>}
          {!rechnung.streifen.length && <p>Kein Streifen gebildet. {rechnung.meldungen.join(' ')}</p>}
          <ul className="bericht-status">
            {rechnung.streifen.map(s => <li key={s.fgsId}>Streifen {s.fgsId}{s.strasse ? ` (${s.strasse})` : ''}: <b>{STATUS[s.status] ?? s.status}</b>
              {' '}– {s.status === 'kein_fgs' ? 'von Hand als kein Fussgängerstreifen bezeichnet, Zufahrten nicht ausgewiesen'
                : `${s.zufahrten.length} Zufahrt(en) geprüft, davon ${s.zufahrten.filter(z => z.status === 'frei').length} frei` +
                  (s.zufahrten.some(z => z.deckung) ? `; ${s.zufahrten.filter(z => z.deckung).length} durch die gerade Zufahrt ` +
                    'mitgeprüfte Abbiegezufahrt(en) mitgezählt' : '')}</li>)}
          </ul>
        </section>
        {rechnung.streifen.map(s => <StreifenTabelle key={s.fgsId} s={s} fall={fall} />)}

        <section className="bericht-block">
          <h2>Eingaben von Hand</h2>
          {eingaben.length ? <ul className="klein">{eingaben.map((x, i) => <li key={i}>{x}</li>)}</ul> :
            <p className="klein">Keine. Ergebnis allein aus den geladenen Daten.</p>}
          <p className="klein">Die Eingaben lassen sich in der App mit «Fall speichern» als Fall-Datei (JSON) sichern und mit «Fall laden»
            wiederherstellen.</p>
        </section>

        {hinweise.length > 0 && (
          <section className="bericht-block">
            <h2>Annahmen und Hinweise</h2>
            <ul className="klein">{hinweise.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </section>
        )}

        <section className="bericht-block">
          <h2>Quellen</h2>
          <ul className="klein">
            <li>Luftbild: {LUFTBILD_QUELLE}{flugjahr ? `, Flugjahr ${flugjahr}` : ''} (wms.geo.admin.ch; Karte: WMTS geo.admin.ch)</li>
            <li>Bodenbedeckung und Einzelobjekte: Amtliche Vermessung, Kanton {kantone.join(', ') || '–'}, über geodienste.ch
              {fall.quellen.av ? ` (${fall.quellen.av})` : ''}</li>
            <li>Strassennetz und Übergänge: © OpenStreetMap-Mitwirkende, ODbL{fall.quellen.osm ? ` (Overpass, ${fall.quellen.osm})` : ''}</li>
            {zusatzQuellen.map(q => <li key={q}>{q}</li>)}
          </ul>
        </section>

        <section className="bericht-block">
          <h2>Normbezüge</h2>
          <ul className="klein">
            <li>Sichtweiten: VSS 40 241, Tab. 1 ({Object.entries(SICHTWEITE).map(([t, sw]) => `${t} km/h: ${sw} m`).join(', ')}).</li>
            <li>Im Knoten nach Kurvenradius: bfu 2.457.01 bzw. VSS 40 241, Tab. 2 ({KURVE_SICHTWEITE.map(([r, sw]) => `bis ${r} m: ${sw} m`).join(', ')}).</li>
            <li>Auto-Parkfeld näher als 5 m am Streifen: VRV Art. 18 Abs. 2e.</li>
          </ul>
        </section>

        <footer className="bericht-fuss">
          <p><b>Die App ersetzt keine Beurteilung vor Ort.</b> Daten aus offenen Quellen können veraltet oder unvollständig sein (z. B.
            Parkierung, Hecken, Mauerhöhen, Signalisation); Ergebnis und Eingaben vor Ort prüfen.</p>
          <p>fgsCheck v{__APP_VERSION__} (Stand {__BUILD_DATUM__}) · {APP_URL} · Code und eigene Inhalte unter CC BY-NC 4.0 · eingebundene
            Daten unter ihren eigenen Lizenzen (siehe Quellen).</p>
        </footer>
      </article>
    </div>,
    document.body,
  )
}
