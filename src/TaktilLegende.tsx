// Legende der Ebene «Taktile Markierungen (Stadt Bern)» (30.10.2026; App, Abschnitt «Legende»): eigene Marken in der Darstellung der
// Karte (daten/taktilKarte.tkStil), Stand der Ebene (Zoomstufe, lädt, Layer nicht erreichbar bzw. zu viele Objekte)
import { TK_BEISPIELE, TK_KARTE_NAME, TK_KARTE_ZOOM, TK_LEGENDE, TK_NAME, tkStil, type TkArt } from './daten/taktilKarte'
import type { TaktilStand } from './Karte'

/** Marke einer Art als kleines SVG (Quadrat bzw. weisse Linie mit dunkler Kontur wie auf der Karte) */
export function TkMarke({ art, genutzt = false }: { art: TkArt; genutzt?: boolean }) {
  const s = tkStil(art, genutzt)
  if (art === 'feld') {
    const r = s.rand / 2, g = s.groesse - s.rand
    return <svg className="rp-marke tk-marke" width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
      <rect x={14 - s.groesse / 2 + r} y={7 - s.groesse / 2 + r} width={g} height={g} fill={s.fuellung} stroke={s.randFarbe}
        strokeWidth={s.rand} opacity={s.opacity} />
    </svg>
  }
  return <svg className="rp-marke tk-marke" width="28" height="14" viewBox="0 0 28 14" aria-hidden="true" opacity={s.opacity}>
    <line x1="1" y1="7" x2="27" y2="7" stroke={s.randFarbe} strokeWidth={s.kontur} strokeLinecap="butt" />
    <line x1="1" y1="7" x2="27" y2="7" stroke={s.fuellung} strokeWidth={s.groesse} strokeLinecap="butt" />
  </svg>
}

/** Legendenzeile der Ebene (nur wenn sie an ist); genutzt: ein Feld bzw. eine Leitlinie dient der Vorbelegung (grösser, kräftiger) */
export function TaktilLegende({ stand, genutzt, taktilM }: { stand: Extract<TaktilStand, { an: true }>; genutzt: boolean; taktilM: number }) {
  const zusatz = !stand.zoom ? ` – erst ab Zoomstufe ${TK_KARTE_ZOOM} (näher heranzoomen)` : stand.laedt ? ' – lädt …'
    : [stand.fehler.length ? `nicht erreichbar: ${stand.fehler.map(a => TK_NAME[a]).join(', ')}` : '',
      stand.zuViel.length ? `zu viele Objekte im Ausschnitt (näher heranzoomen): ${stand.zuViel.map(a => TK_NAME[a]).join(', ')}` : '']
      .filter(Boolean).map(t => ` – ${t}`).join('')
  return <li className="rp-legende">{TK_KARTE_NAME}{zusatz}:
    <ul>{TK_LEGENDE.map(a => <li key={a}><TkMarke art={a} />{TK_NAME[a]} ({TK_BEISPIELE[a]})</li>)}
      {genutzt && <li><TkMarke art="feld" genutzt /><TkMarke art="linie" genutzt />Feld bzw. Leitlinie, die die Prüfung nutzt (Feld bis {taktilM} m
        vom Streifenende, Leitlinie auf dem Streifen)</li>}</ul>
    <span className="klein">Maus über ein Feld bzw. eine Linie: was es ist.</span></li>
}
