// Legende der Ebene «Richtplan Fussverkehr (Geoportal Bern)» (30.10.2026; App, Abschnitt «Legende»): eigene Marken in der Darstellung
// der Karte (daten/richtplanKarte.rpStil), Stand der Ebene (Zoomstufe, lädt, Layer nicht erreichbar)
import { RP_KARTE_NAME, RP_KARTE_ZOOM, RP_LEGENDE, RP_MUSTER, RP_NAME, rpStil, type RpArt } from './daten/richtplanKarte'
import type { RichtplanStand } from './Karte'

/** Marke einer Art als kleines SVG (Linie bzw. Fläche wie auf der Karte; das Muster steht einmal im Dokument, Karte.PlanMuster) */
export function RpMarke({ art, genutzt = false }: { art: RpArt; genutzt?: boolean }) {
  const s = rpStil(art, genutzt)
  return <svg className="rp-marke" width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
    {s.flaeche ? <rect x="1" y="1" width="26" height="10" stroke={s.color} strokeWidth={s.weight} strokeOpacity={s.opacity}
      strokeDasharray={s.dashArray} fill={s.fill === 'muster' ? `url(#${RP_MUSTER})` : s.color} fillOpacity={s.fill === 'muster' ? 1 : s.fillOpacity} />
      : <line x1="1" y1="6" x2="27" y2="6" stroke={s.color} strokeWidth={s.weight} strokeOpacity={s.opacity} strokeDasharray={s.dashArray}
        strokeLinecap={s.lineCap ?? 'butt'} />}
  </svg>
}

/** Legendenzeile der Ebene (nur wenn sie an ist); genutzt: eine Basisnetz-Linie dient der Vorbelegung (kräftiger) */
export function RichtplanLegende({ stand, genutzt, netzM }: { stand: Extract<RichtplanStand, { an: true }>; genutzt: boolean; netzM: number }) {
  const zusatz = !stand.zoom ? ` – erst ab Zoomstufe ${RP_KARTE_ZOOM} (näher heranzoomen)` : stand.laedt ? ' – lädt …'
    : stand.fehler.length ? ` – nicht erreichbar: ${stand.fehler.map(a => RP_NAME[a]).join(', ')}` : ''
  return <li className="rp-legende">{RP_KARTE_NAME}{zusatz}:
    <ul>{RP_LEGENDE.map(a => <li key={a}><RpMarke art={a} />{RP_NAME[a]}</li>)}
      {genutzt && <li><RpMarke art="basisnetz" genutzt />Basisnetz-Linie, die die Prüfung nutzt (quert die Fahrbahn bis {netzM} m vom Streifen)</li>}</ul>
    <span className="klein">Maus über eine Linie bzw. Fläche: was es ist.</span></li>
}
