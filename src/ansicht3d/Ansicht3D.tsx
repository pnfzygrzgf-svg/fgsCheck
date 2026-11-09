// ── 3D-Ansicht: Oberfläche (Umschalter, Bühne, Kamera, Ebenen, Status) ──
//
// Ersetzt die Leaflet-Karte im Kartenbereich, solange sie offen ist (Karte.tsx blendet die Karte nur aus). Cesium lädt erst hier, beim
// Öffnen (cesiumSzene.ts, dynamischer Import); diese Datei kennt Cesium nur als Typ, damit sie im Test ohne Browser gerendert werden
// kann. Lebenszyklus: ein Effekt mit Abbruchsignal und «aktiv»-Marke; im StrictMode zerstört der erste Durchlauf seine Szene, sobald sie
// fertig ist, nur der zweite behält eine. Eine neue Szene (Fall, Auswahl, Gelände) ersetzt die Geometrie; die Kamera folgt nur, wenn sich
// ihr Ziel geändert hat, sonst bleibt der frei gewählte Standpunkt.

import { useEffect, useRef, useState } from 'react'
import { kameraModusVorgabe, modusLesen, modusSpeichern, PARK_HINWEIS, type KameraModus, type Szene3D } from './modell'
import { AUS, standLesen, standSetzen, useAnsicht3dStand } from './stand'
import type { Szene } from './cesiumSzene'
import { ansichtAbgleich } from './abgleich'

/** Bedienung je Kamera (Statuszeile) */
export const GESTEN: Readonly<Record<KameraModus, string>> = {
  fahrzeug: 'Ziehen dreht, Rad oder zwei Finger zoomen, rechte Maustaste bzw. Strg + Ziehen kippt.',
  uebersicht: 'Ziehen dreht um den Streifen, Rad oder zwei Finger zoomen, rechte Maustaste bzw. Strg + Ziehen kippt.',
  frei: 'Frei: Ziehen verschiebt über die Karte, Rad oder zwei Finger zoomen, mittlere Maustaste bzw. Strg + Ziehen kippt und dreht. ' +
    'Daten des Falls (Boden, Bäume, Parkfelder, Personen) nur rund 150 m um den Streifen; «Übersicht» springt zurück.',
}
export const BRUECKE_HINWEIS = 'Auf einer Brücke liegt das Gelände unter der Fahrbahn; ohne die Ebene «Brücken» steht die Kamera dann zu tief.'
export const KEIN_WEBGL = 'Dieser Browser bietet kein WebGL; die 3D-Ansicht ist nicht möglich, die 2D-Karte bleibt nutzbar.'

/** Umschalter im Kartenbereich: «2D-Karte» / «3D-Ansicht» */
export function AnsichtSchalter({ dreiD, setzen, moeglich }: { dreiD: boolean; setzen: (an: boolean) => void; moeglich: boolean }) {
  return (
    <div className="ansicht-wahl" role="group" aria-label="Ansicht">
      <button type="button" aria-pressed={!dreiD} title="Zur 2D-Karte zurück (Esc)" onClick={() => setzen(false)}>2D-Karte</button>
      <button type="button" aria-pressed={dreiD} disabled={!moeglich} onClick={() => setzen(true)}
              title={moeglich ? 'Streifen, Zufahrten und Umgebung räumlich zeigen (nur Darstellung)' : 'Erst einen Übergang prüfen'}>3D-Ansicht</button>
    </div>
  )
}

export default function Ansicht3D({ szene, profil = null, setProfil, baumkatasterAn = false }: { szene: Szene3D; profil?: string | null; setProfil?: (id: string | null) => void; baumkatasterAn?: boolean }) {
  const elRef = useRef<HTMLDivElement>(null), creditRef = useRef<HTMLDivElement>(null)
  const szeneRef = useRef<Szene | null>(null)
  const [bereit, setBereit] = useState(0)
  const [kameraImpuls, setKameraImpuls] = useState(0)
  const abgleich = useRef(ansichtAbgleich())
  const [modus, setModus] = useState<KameraModus>(() => kameraModusVorgabe(szene, modusLesen()))
  const [gebaeude, setGebaeude] = useState(true)
  const [baeume, setBaeume] = useState(baumkatasterAn)
  const [bruecken, setBruecken] = useState(true)
  const [fahrzeuge, setFahrzeuge] = useState(true)
  const [personen, setPersonen] = useState(true)
  const [luftbild, setLuftbild] = useState(false)
  const [schatten, setSchatten] = useState(true)
  const [pruefung, setPruefung] = useState(false)
  const [menue, setMenue] = useState(false)
  const stand = useAnsicht3dStand()
  const startRef = useRef({ gebaeude, baeume, bruecken, fahrzeuge, personen, luftbild, schatten, pruefung })
  startRef.current = { gebaeude, baeume, bruecken, fahrzeuge, personen, luftbild, schatten, pruefung }

  // Öffnen und Schliessen
  useEffect(() => {
    const el = elRef.current, credits = creditRef.current
    if (!el || !credits) return
    let aktiv = true
    const ctrl = new AbortController()
    let szeneLokal: Szene | null = null
    void (async () => {
      try {
        const { webglDa, szeneOeffnen } = await import('./cesiumSzene')
        if (!aktiv) return
        if (!webglDa()) { standSetzen({ phase: 'fehler', text: KEIN_WEBGL }); return }
        const s = await szeneOeffnen(el, credits, standSetzen, ctrl.signal, startRef.current)
        if (!aktiv) { s.zerstoeren(); return }
        szeneLokal = s
        szeneRef.current = s
        abgleich.current = ansichtAbgleich()
        setBereit(n => n + 1)
      } catch (e) {
        if (!aktiv || (e instanceof DOMException && e.name === 'AbortError')) return
        standSetzen({ phase: 'fehler', text: `3D-Ansicht nicht verfügbar: ${e instanceof Error ? e.message : String(e)}` })
      }
    })()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => szeneRef.current?.groesse())
    ro?.observe(el)
    return () => {
      aktiv = false
      abgleich.current.verwerfen()
      ctrl.abort()
      ro?.disconnect()
      szeneLokal?.zerstoeren()
      szeneRef.current = null
      standSetzen(AUS)
    }
  }, [])

  // Ein Abgleich für Modell, Schalter und Kamera; nach dem Öffnen werden alle aktuellen Wünsche nachgeführt.
  useEffect(() => {
    const s = szeneRef.current
    if (!s) return
    let aktiv = true
    void abgleich.current.anwenden(s, szene, startRef.current, modus, kameraImpuls).then(m => {
      if (aktiv && m !== null) { setModus(m) }
    }).catch(e => {
      if (!aktiv || (e instanceof Error && e.name === 'AbortError')) return
      standSetzen({ ...standLesen(), phase: 'fehler', text: `3D-Ansicht nicht verfügbar: ${e instanceof Error ? e.message : String(e)}` })
    })
    return () => { aktiv = false; abgleich.current.verwerfen() }
  }, [bereit, szene, modus, kameraImpuls, gebaeude, baeume, bruecken, fahrzeuge, personen, luftbild, schatten, pruefung])

  const kameraWaehlen = (m: KameraModus) => {
    setModus(m)
    setKameraImpuls(n => n + 1)
    modusSpeichern(m)
  }
  const fahrzeugMoeglich = !!szene.kamera.fahrzeug
  // Hinweis nur, wenn die Brückenebene aus ist oder fehlt; sonst stehen Kamera und Sichtlinien auf der Brücke
  const bruecke = modus === 'fahrzeug' && !!szene.kamera.fahrzeug?.bruecke && (!bruecken || stand.bruecken === 'fehlt')
  // Profile (Sichtlinien mit Kennung) der gewählten Zufahrt, wählbar wie in «Kartenebenen» der 2D-Karte
  const profile = szene.sichtlinien.filter(l => l.profil && !l.id.startsWith('erkennung:')).map(l => ({ id: l.profil!, text: l.text }))
  return (
    <div className="ansicht3d">
      <div ref={elRef} className="a3-buehne" aria-label="3D-Ansicht" />
      <div className="a3-leiste">
        <button type="button" aria-pressed={modus === 'fahrzeug'} disabled={!fahrzeugMoeglich} onClick={() => kameraWaehlen('fahrzeug')}
                title={fahrzeugMoeglich ? 'Blick vom Sichtpunkt der gewählten Zufahrt, 1,0 m über der Fahrbahn' : 'Zuerst eine Zufahrt im Panel wählen'}>
          Aus dem Fahrzeug</button>
        <button type="button" aria-pressed={modus === 'uebersicht'} onClick={() => kameraWaehlen('uebersicht')}
                title="Von schräg oben, um den Streifen drehbar">Übersicht</button>
        <button type="button" aria-pressed={modus === 'frei'} onClick={() => kameraWaehlen('frei')}
                title="Kamera vom Streifen lösen und frei über die Karte bewegen: Ziehen verschiebt, Rad zoomt, mittlere Maustaste bzw. Strg + Ziehen kippt und dreht">
          Frei</button>
        {/* wirkt nur im Blick aus dem Fahrzeug; in Übersicht und «Frei» ist die Prüfung immer sichtbar, darum dort angehakt und gesperrt */}
        <label title={modus !== 'fahrzeug'
          ? 'In der Übersicht und frei sind Sichtfelder, Warteflächen, Fahrlinien, Konflikte und Sichtlinien immer sichtbar; das Häkchen gilt für den Blick aus dem Fahrzeug'
          : 'Sichtfelder, Warteflächen, Fahrlinien, Konflikte und Sichtlinien auch im Blick aus dem Fahrzeug zeigen (in der Übersicht immer sichtbar)'}>
          <input type="checkbox" checked={pruefung || modus !== 'fahrzeug'} disabled={modus !== 'fahrzeug'}
                 onChange={e => setPruefung(e.target.checked)} /> Sichtprüfung</label>
        {setProfil && profile.length > 0 && (pruefung || modus !== 'fahrzeug') && (
          <select aria-label="Geländeprofil" value={profil && profile.some(p => p.id === profil) ? profil : ''} onChange={e => setProfil(e.target.value || null)}
                  title="Ein Geländeprofil hervorheben; «Aus dem Fahrzeug» setzt die Kamera an sein Auge (gleiche Wahl wie in den Kartenebenen)">
            <option value="">alle Sichtlinien</option>
            {profile.map(p => <option key={p.id} value={p.id}>{p.text}</option>)}
          </select>)}
        <button type="button" aria-expanded={menue} onClick={() => setMenue(m => !m)} title="Ebenen der 3D-Ansicht">Ebenen {menue ? '▴' : '▾'}</button>
      </div>
      {menue && <div className="a3-menue" role="group" aria-label="Ebenen der 3D-Ansicht">
        <label title="Luftbild SWISSIMAGE statt der grauen Karte swissTLM auf dem Gelände; die AV-Flächen liegen dann nur als Tönung darüber"><input type="checkbox" checked={luftbild} onChange={e => setLuftbild(e.target.checked)} /> Luftbild</label>
        <label><input type="checkbox" checked={gebaeude} disabled={stand.gebaeude === 'fehlt'} onChange={e => setGebaeude(e.target.checked)} /> Gebäude</label>
        <label title="Brücken aus swissTLM3D (swisstopo), in der Stadt Bern aus den Kunstbauten der Stadt (3D-Netz); das Gelände enthält keine Brücken. Fahrzeuge, Kamera und Sichtlinien stehen in einem Brückenumriss der AV auf der Fahrbahn der Brücke">
          <input type="checkbox" checked={bruecken} disabled={stand.bruecken === 'fehlt'} onChange={e => setBruecken(e.target.checked)} /> Brücken</label>
        <label title="Angenommene Baumkronen direkt über den erfassten Stämmen aus dem Baumkataster bzw. von Hand; Form und Masse sind nicht gemessen">
          <input type="checkbox" checked={baeume} onChange={e => setBaeume(e.target.checked)} /> Modellbäume</label>
        <label title="Fahrzeuge der Zufahrten"><input type="checkbox" checked={fahrzeuge} onChange={e => setFahrzeuge(e.target.checked)} /> Fahrzeuge</label>
        <label title="Wartende Personen an den Streifenenden"><input type="checkbox" checked={personen} onChange={e => setPersonen(e.target.checked)} /> Personen</label>
        <label title="Schatten von Gebäuden, Fahrzeugen und Figuren (fester Sonnenstand, braucht Grafikleistung)"><input type="checkbox" checked={schatten} onChange={e => setSchatten(e.target.checked)} /> Schatten</label>
      </div>}
      <div className="a3-fuss">
        <p className={'a3-status' + (stand.phase === 'fehler' ? ' fehler' : '')} role="status">
          {stand.phase === 'aus' ? 'Wird geöffnet …' : stand.text}{stand.hinweis && <> {stand.hinweis}</>}{!!stand.anschluss && <> Ergänzter Fahrbahnanschluss: Darstellung, keine gemessene Fläche.</>}{bruecke && <> {BRUECKE_HINWEIS}</>}{!szene.leer || <> Kein Streifen gerechnet.</>}
          {szene.flaechen.some(f => f.pruefhuelle) && <span title={PARK_HINWEIS}> Parkquader zeigen die ganze Parkfläche.</span>}
          {stand.phase === 'bereit' && <> {GESTEN[modus]}</>}
        </p>
        <details className="a3-hinweise">
          <summary>Annahmen und Datenquellen</summary>
          <p className="a3-legende">{szene.legende}</p>
        </details>
      </div>
      <div ref={creditRef} className="a3-credits" />
    </div>
  )
}
