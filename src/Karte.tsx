import { useEffect, useRef, useState, type CSSProperties } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { AvFlaeche } from './daten/av'
import type { OsmKnoten, Strassenname } from './daten/osm'
import { markierung } from './daten/osm'
import { ANN_HAND_BREITE, ANN_HAND_VERSATZ_MAX, type AnnHand, type ZufahrtErgebnis } from './rechner/typen'
import type { FallRechnung } from './rechner'
import type { Multi } from './rechner/poly'
import { type Hindernis, laengsPolygon, stammPolygon } from './rechner/hindernisse'
import { type StreifenHand, type Fixpunkt, type FlaechePlan, type PlanArt, PLAN_ARTEN, inselStandard } from './fall'
import { planTitel, planFlaecheM2, PLAN_NAME, eckeRadiusMax, echteEcken, RUNDEN_R_BEREICH } from './rechner/planflaechen'
import { standardGeometrie, standardAngepasst } from './rechner/standardinsel'
import { planStandardText, planStandardAngepasst, SR_ERSETZT } from './rechner/seitenraum'
import { fixpunktName, ART_TEXT } from './fixpunkt'
import { wgs, lv95, add, dot, sub, type P } from './geo'
import Ortssuche from './Ortssuche'
import { schildLage, zufahrtNr, zufahrtText, type ZufahrtNamen } from './benennung'
import { ortZoom, type Ort } from './daten/ortssuche'
import { KS_LAGE } from './tue/texte'
import { ksDreieckSichtbar, ksFahrzeugStand, ksPhaseNach, tueFlaeche, tueGezeichnet, type KsPhase } from './tue/karte'
import { messLaenge, messText, type Messung } from './messen'
import { FARBE_VELO, VELO_SICHT_FARBE, fahrzeugFarbe, fgsFahrzeuge, tueFahrzeuge, type FahrzeugForm } from './fahrzeuge'
import { erkennungBaender } from './erkennungKarte'
import { veloSoll, type VeloSoll } from './veloSicht'
import type { NeigungMessung } from './knotensicht/rechner/typen'
import { LUFTBILD_FGS_NAME, kandidatTooltip, type KandidatAnzeige, type LuftbildKandidat } from './daten/luftbildFgs'
import { FUSSWEGNETZ_FARBE, FUSSWEGNETZ_NAME, type FusswegnetzKarte } from './fusswegnetzKarte'
import { RP_WMS_NAME, RP_WMS_URL, rpWmsTeile, rpWmsVerfuegbar } from './daten/richtplanWms'

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
/** Erkennungsdistanz: Teil bis zum Soll, den die Rechnung nicht geprüft hat (Fahrlinie endet), grau gestrichelt */
export const ERKENNUNG_UNGEPRUEFT = '#64748b'
/** Tooltip der Sicht vom Velo: Ergebnis, Soll mit Längsneigung, schnelle E-Bikes (nur über 30 km/h) */
function veloTooltip(namen: ZufahrtNamen | undefined, z: ZufahrtErgebnis, vs: VeloSoll): string {
  return `Sicht vom Velo ${esc(zufahrtText(namen, z.zufahrt))}: ${vs.frei ? 'frei' : `verdeckt, frei bis ${z.velo!.freiBisM} m`}, Soll ${vs.A} m ` +
    `(VSS 40 273 Tab. 3; ${esc(vs.neigungText)})${vs.ebikeA !== null ? `; mit Verbot für schnelle E-Bikes gälte ${vs.ebikeA} m` : ''}`
}
/** Querung ohne Vortritt (Bedarfsmodul E1): Umriss ohne Balken, weiss gestrichelt über dunklem Rand, in Karte und Bericht */
export const OHNE_VORTRITT_FARBE = '#ffffff'
export const STRICH_OHNE_VORTRITT = '6 4'
/** Trottoirüberfahrt (Wahl am Streifen): Umriss grau gestrichelt, Fläche in der Trottoirfarbe der AV, ohne Balken und ohne
 * Annäherungsbereiche, in Karte und Bericht */
export const TUE_RAND = '#64748b'
export const STRICH_TUE = '4 3'
/** Knotensicht an der Trottoirüberfahrt: Strich je Teil (Auto durchgezogen, Velo gestrichelt, Trottoir punktiert) und Namen */
const KS_STRICH: Record<string, string | undefined> = { auto: undefined, velo: '6 4', trottoir: '2 3' }
const KS_ART: Record<string, string> = { auto: 'Auto', velo: 'Velo', trottoir: 'Trottoir' }
/** Rand der Überfahrt: vorderer durchgezogen, hinterer gestrichelt */
const i0 = (t: string) => (t === 'hinterer' ? '5 3' : undefined)
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

/** Annäherungsbereich von Hand in den Grenzen (Breite, Versatz) */
export const annBegrenzt = (h: AnnHand): AnnHand => ({
  versatz: Math.max(-ANN_HAND_VERSATZ_MAX, Math.min(ANN_HAND_VERSATZ_MAX, h.versatz)),
  breite: Math.max(ANN_HAND_BREITE[0], Math.min(ANN_HAND_BREITE[1], h.breite)) })

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
// Fusswegnetz (Richtplan Bern, 30.10.2026): die für die Prüfung genutzte Linie knapp über den Vektoren (overlayPane 400); das Pane lässt
// Klicks durch (nur die Linie selbst zeigt ihren Tooltip), damit Hindernisse und Flächen (Plan) darunter anklickbar bleiben
const FWN_PANE = 'fusswegnetz'
const ECKEN_PANE = 'eckenRunden'                   // «Ecke runden»: Ecken der gewählten Fläche (Plan), über allem anklickbar
const GRIFF_PANE = 'inselGriff'                     // «Mittelinsel (Standard)»: Griff zum Ziehen
// Vierfachpfeil im Kreis (Griff der Mittelinsel)
const GRIFF_SVG = '<svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true"><circle cx="13" cy="13" r="12" fill="#ffffff" ' +
  'stroke="#3f6212" stroke-width="2"/><path d="M13 4l3 3h-2v4h4V9l3 4-3 4v-2h-4v4h2l-3 3-3-3h2v-4H8v2l-3-4 3-4v2h4V7h-2z" fill="#3f6212"/></svg>'
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

export type Werkzeug = null | 'parkfeld' | 'laengs' | 'baum' | 'hecke' | 'mauer' | 'flaeche' | 'insel' | 'streifen' | 'tue' | 'spurB' | 'fixpunkt' |
  'planflaeche' | 'eckeRunden' | 'mittelinsel' | 'seitenraum' | 'messen'
/** Masslinie ab Fixpunkt (rechner/vermassung.fixpunktMasse): von, bis, Beschriftung */
export interface Masslinie { von: P; bis: P; text: string }
export const FIXPUNKT_FARBE = '#be185d'
/** Werkzeug «Messen» */
export const MESS_FARBE = '#6d28d9'
/** Fixpunkt als kleines Kreuz im Quadrat (Karte; Bericht zeichnet dasselbe als SVG) */
const fixIcon = (blass: boolean) => L.divIcon({ className: 'fixpunkt' + (blass ? ' blass' : ''), iconSize: [14, 14],
  html: '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" fill="#ffffff" ' +
    `fill-opacity="0.85" stroke="${FIXPUNKT_FARBE}" stroke-width="1.5"/><path d="M3 3L11 11M11 3L3 11" stroke="${FIXPUNKT_FARBE}" ` +
    'stroke-width="1.5"/></svg>' })

/** Mitte des Nummernschilds so weit hinter dem letzten Sichtpunkt [px], auf jedem Zoom gleich (Schild 22 px, Sichtpunkt r 5 px) */
const SCHILD_PX = 20
/**
 * Nummernschild einer Zufahrt (benennung.ts): weisser Kreis, dunkler Rand und Zahl, gewählt Bernstein; bei mehreren Streifen
 * daneben der Streifen. Der Marker steht auf dem letzten Sichtpunkt, das Schild um SCHILD_PX nach aussen versetzt (Ankerpunkt;
 * Bildschirm: y nach Süden).
 */
const nrIcon = (nr: string, aussen: P, gewaehlt: boolean, streifen: string | null) => L.divIcon({
  className: 'zufahrt-nr' + (gewaehlt ? ' gewaehlt' : ''), iconSize: [22, 22],
  iconAnchor: [11 - aussen[0] * SCHILD_PX, 11 + aussen[1] * SCHILD_PX],
  html: `<span>${esc(nr)}</span>` + (streifen ? `<span class="nr-streifen">${esc(streifen)}</span>` : ''),
})

/** Nummer einer Zufahrt als Marke im Text (Panel, Legende, Bericht) vor dem Namen; ohne Nummer nichts */
export function NrMarke({ nr, gewaehlt = false }: { nr: string; gewaehlt?: boolean }) {
  return nr ? <span className={'zufahrt-nr' + (gewaehlt ? ' gewaehlt' : '')}>{nr}</span> : null
}

const ll = (p: P): L.LatLngTuple => wgs(p[0], p[1])
/** Stil eines Übergangs (gewählt: grösser, dunkler Rand; vermutlich markiert: gestrichelt, blasser) */
const markerStil = (mk: string, g: boolean): L.CircleMarkerOptions => ({
  radius: g ? 9 : 6, color: g ? '#0f172a' : mk === 'vermutlich' ? '#a16207' : '#ffffff', weight: g ? 3 : 2,
  dashArray: mk === 'vermutlich' ? '3 3' : undefined,
  fillColor: UEBERGANG_FARBE[mk], fillOpacity: mk === 'vermutlich' ? 0.45 : 0.95,
})
/** Schlüssel der zuletzt gesehenen Kartenansicht im Browser (nur Bequemlichkeit, darf fehlen) */
const ANSICHT_SCHLUESSEL = 'fgsCheck.karteAnsicht'
/** Streifen aus dem Luftbild (ETH-Modell), nicht in OSM: hohles gelbes Quadrat, gestrichelt (anders als die runden OSM-Übergänge) */
export const LB_FGS_FARBE = '#eab308'
const lbFgsIcon = (g: boolean) => L.divIcon({ className: 'lbfgs-marke' + (g ? ' gewaehlt' : ''), iconSize: g ? [18, 18] : [14, 14] })
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

// ── Fahrzeuge und wartende Personen (27.10.2026, wie der SichtweitenCheck; fahrzeuge.ts) ──
/** Fahrzeuge mit weisser Windschutzscheibe, Farbe nach der Rolle (fahrzeuge.fahrzeugFarbe) */
const SCHEIBE_FARBE = '#ffffff'
/** Fahrzeuge der nicht gewählten Zufahrten erst ab diesem Zoom (Personenwagen 4,5 × 1,8 m) */
export const FAHRZEUG_ZOOM = 18
/** Velo als Piktogramm fester Grösse (wie der SichtweitenCheck: 1,8 × 0,6 m wäre bei Zoom 18 nur wenige Bildpunkte gross) */
const VELO_SYMBOL_PX = 30
/** Person als Piktogramm fester Grösse (rund 0,6 m wären nur ein paar Bildpunkte) */
const PERSON_PX = 14
/** Fahrzeuge und Personen unter den Markern (markerPane 600: Griffe zum Verschieben, Schilder), über den Flächen */
const FAHRZEUG_PANE = 'fahrzeuge'
/** Fahrzeug bzw. Person in die Ebene zeichnen; interaktiv: Tooltip (beim Zeichnen nicht, Klicks gehen an die Karte) */
function fahrzeugZeichnen(ebene: L.LayerGroup, f: FahrzeugForm, blass: boolean, interaktiv: boolean,
  stand: 'normal' | 'hervor' | 'blass' = 'normal'): L.Layer[] {
  const farbe = fahrzeugFarbe(f, blass)
  if (f.art === 'auto' && f.umriss && f.scheibe) {
    // gewählte Phase: kräftiger Rand; andere Phase: durchscheinend (zum Wechseln anklickbar)
    const p = L.polygon(f.umriss.map(ll), { color: '#111827', weight: stand === 'hervor' ? 3.5 : blass ? 1 : 1.5, opacity: blass ? 0.6 : 1,
      fillColor: farbe, fillOpacity: stand === 'blass' ? 0.35 : 0.9,
      interactive: interaktiv, className: `fahrzeug fahrzeug-${f.rolle}${f.phase ? ` fahrzeug-${f.phase}` : ''}`, pane: FAHRZEUG_PANE }).addTo(ebene)
    if (interaktiv) p.bindTooltip(esc(f.text), { sticky: true })
    const sch = L.polygon(f.scheibe.map(ll), { color: SCHEIBE_FARBE, weight: 1, fillColor: SCHEIBE_FARBE, fillOpacity: 0.9, interactive: false, pane: FAHRZEUG_PANE }).addTo(ebene)
    return [p, sch]
  }
  const n = Math.hypot(f.richtung[0], f.richtung[1]) || 1
  // Bildschirm: x nach Osten, y nach Süden; CSS-Drehung im Uhrzeigersinn
  const grad = Math.atan2(-f.richtung[1] / n, f.richtung[0] / n) * 180 / Math.PI
  let html: string, w: number, h: number
  if (f.art === 'velo') {
    // Vogelperspektive, Fahrt nach rechts: Räder, Rahmen, Lenker quer, Kopf; am Ende der Sichtweite (Radstreifen) gestrichelt
    w = VELO_SYMBOL_PX; h = Math.round(VELO_SYMBOL_PX / 3)
    const st = f.rolle === 'fa' ? ' stroke-dasharray="3 2"' : ''
    // herannahendes Velo violett mit weissem Umriss (29.10.2026); wartendes Velo der Knotensicht wie bisher dunkel umrandet
    const rand = f.rolle === 'fb' ? '#111827' : '#ffffff'
    html = `<svg viewBox="0 0 60 20" width="${w}" height="${h}" style="display:block;overflow:visible;transform:rotate(${grad}deg)">` +
      `<rect x="2" y="7" width="20" height="6" rx="3" fill="${farbe}" stroke="${rand}" stroke-width="1.5"${st}/>` +
      `<rect x="38" y="7" width="20" height="6" rx="3" fill="${farbe}" stroke="${rand}" stroke-width="1.5"${st}/>` +
      `<rect x="18" y="8.5" width="24" height="3" fill="${farbe}" stroke="${rand}" stroke-width="1"/>` +
      `<rect x="40" y="1" width="3" height="18" rx="1.5" fill="${farbe}" stroke="${rand}" stroke-width="1"/>` +
      `<circle cx="27" cy="10" r="5" fill="${farbe}" stroke="${rand}" stroke-width="1.5"/></svg>`
  } else {
    // Person von oben: Schultern und Kopf, Blick zur Fahrbahn
    w = h = PERSON_PX
    html = `<svg viewBox="0 0 20 20" width="${w}" height="${h}" style="display:block;overflow:visible;transform:rotate(${grad}deg)">` +
      `<ellipse cx="9" cy="10" rx="5" ry="8" fill="${AV_FARBEN.Trottoir}" stroke="#334155" stroke-width="1.5"/>` +
      `<circle cx="10" cy="10" r="4" fill="#475569" stroke="#ffffff" stroke-width="1"/></svg>`
  }
  const m = L.marker(ll(f.mitte), { icon: L.divIcon({ className: f.art === 'velo' ? 'velo-symbol' : 'person-symbol', html, iconSize: [w, h],
    iconAnchor: [w / 2, h / 2] }), interactive: interaktiv, keyboard: false, pane: FAHRZEUG_PANE }).addTo(ebene)
  if (interaktiv) m.bindTooltip(esc(f.text), { sticky: true })
  return [m]
}

/**
 * Wartendes Fahrzeug der Knotensicht ziehbar (27.10.2026): Griff am Auge (Beobachtungspunkt), das Fahrzeug folgt beim Ziehen; beim
 * Loslassen der neue Punkt an die App (Knotensicht wird neu gerechnet)
 */
function augeGriff(ebene: L.LayerGroup, f: FahrzeugForm, teile: L.Layer[], los: (p: P) => void, klick?: () => void): void {
  if (!f.auge) return
  const start = L.latLng(ll(f.auge))
  const urLagen = teile.map(t => (t instanceof L.Polygon ? (t.getLatLngs() as L.LatLng[][])[0].map(x => L.latLng(x.lat, x.lng))
    : t instanceof L.Marker ? [t.getLatLng()] : []))
  L.marker(start, { draggable: true, keyboard: false, zIndexOffset: 900,
    icon: L.divIcon({ className: 'auge-griff' + (f.vonHand ? ' hand' : ''), iconSize: [14, 14] }) })
    .bindTooltip(`${esc(f.text)}<br><i>ziehen: Standort von Hand</i>`)
    .on('drag', (e: L.LeafletEvent) => {
      const g = (e.target as L.Marker).getLatLng(), dLat = g.lat - start.lat, dLng = g.lng - start.lng
      teile.forEach((t, i) => {
        const neu = urLagen[i].map(x => L.latLng(x.lat + dLat, x.lng + dLng))
        if (t instanceof L.Polygon) t.setLatLngs(neu); else if (t instanceof L.Marker && neu[0]) t.setLatLng(neu[0])
      })
    })
    .on('dragend', (e: L.LeafletEvent) => { const g = (e.target as L.Marker).getLatLng(); los(lv95(g.lat, g.lng)) })
    // Klick ohne Ziehen (Leaflet meldet nach einem Zug keinen Klick): Phase zeigen
    .on('click', (e: L.LeafletEvent) => { L.DomEvent.stopPropagation(e as L.LeafletMouseEvent); klick?.() })
    .addTo(ebene)
}

const KARTE_STUFEN = [30, 45, 70]   // Kartenhöhe auf dem Smartphone in % der Fensterhöhe

export default function Karte(props: {
  mitte: [number, number]
  av: AvFlaeche[] | null
  kantone: string[]
  uebergaenge: OsmKnoten[]
  /** Streifen aus dem Luftbild (ETH-Modell), nicht in OSM (daten/luftbildFgs.ts); gewählt über gewaehlt (negative Kennung) */
  luftbildKandidaten?: KandidatAnzeige[]
  /** Fusswegnetz des Richtplans Fussverkehr (nur Stadt Bern, schon für die Vorbelegung geladen; fusswegnetzKarte.ts); null: keine Ebene */
  fusswegnetz?: FusswegnetzKarte | null
  /** Quellenangabe der Ebene Fusswegnetz */
  fusswegnetzQuelle?: string
  /** WMS-Ebene «Richtplan Fussverkehr (Geoportal Bern)» ein- bzw. ausgeschaltet (Legende) */
  onRichtplanWms?: (an: boolean) => void
  onLuftbildKandidat?: (k: LuftbildKandidat) => void
  strassennamen: Strassenname[]                      // aus der Übergangssuche und den OSM-Daten des gewählten Übergangs (daten/osm.namenKarte)
  gewaehlt: number | null
  rechnung: FallRechnung | null
  auswahl: string | null
  hindernisse: Hindernis[]
  streifenHand: StreifenHand[]
  werkzeug: Werkzeug
  zeichnung: P[]
  bearbeiten: string | null                          // Id des Hindernisses, Handstreifens bzw. Fixpunkts, dessen Ecken verschoben werden
  rundenR?: number                                   // Werkzeug «Ecke runden»: Radius (Tooltip der Ecken)
  // «Ecke runden»: Angebot an einer Ecke, an der der Radius nicht passt (Popup mit «mit x m runden» / «abbrechen»)
  rundenAngebot?: { p: P; text: string; knopf: string } | null
  onRundenAngebot?: (annehmen: boolean) => void
  // «Ecke runden»: Vorschau beim Ziehen des Reglers (Ring, passt der Radius, Text an der Ecke)
  rundenVorschau?: { ring: P[]; passt: boolean; text: string; p: P } | null
  // «Mittelinsel (Standard)»: Vorschau vor dem Einfügen (Inselteile, Furt, Signalmast, Mitte, Teilstreifen beim Teilen)
  inselVorschau?: { ringe: P[][]; furt: P[] | null; mast: P | null; mitte: P; teile: [P, P][]; text?: string; art?: PlanArt } | null
  // «Mittelinsel (Standard)»: Griffe in der Inselmitte (ziehbar), Ziehen (Vorschau) und Loslassen (Übernahme)
  inselGriffe?: { gruppe: string; m: P; text: string }[]
  onInselZug?: (gruppe: string, p: P, frei: boolean) => void
  onInselLos?: (gruppe: string, p: P, frei: boolean) => void
  fixpunkte: Fixpunkt[]
  flaechenPlan: FlaechePlan[]                        // Flächen (Plan) von Hand, über der AV-Ebene
  fixVorschlaege: { p: P; text: string }[]           // vorgeschlagene Fixpunkte (blass; Tooltip, Klick übernimmt)
  onFixVorschlag?: (p: P) => void                    // Klick auf einen vorgeschlagenen Fixpunkt: übernehmen
  masslinien: Masslinie[]
  messung?: Messung | null                             // Werkzeug «Messen»: Strecke mit Länge (messen.ts), nicht im Fall
  zufahrtNamen: Map<string, ZufahrtNamen>                  // Anzeige (benennung.ts) je Streifen: Nummer, Strasse und Herkunft
  streifenTitel: (fgsId: string) => string                 // Anzeige: Name bzw. «Streifen 1»
  /** Längsneigung der Fahrlinie je «fgsId|zufahrt» (Höhenprofil): Soll der Sicht vom Velo nach Tab. 3 */
  neigung?: Readonly<Record<string, NeigungMessung>> | null
  onUebergang: (k: OsmKnoten) => void
  onZufahrt: (key: string | null) => void
  onKlick: (p: P) => void
  onDoppelklick: () => void
  onEcke: (id: string, i: number, p: P) => void
  /** Annäherungsbereich eines Endes (0 = A, 1 = B) eines Streifens von Hand verschoben bzw. verbreitert (Griffe beim Bearbeiten) */
  onAnn?: (fgsId: string, k: 0 | 1, h: AnnHand) => void
  onTueAuge?: (fgsId: string, phase: 'fahrbahn' | 'trottoir', p: P) => void   // wartendes Fahrzeug der Knotensicht gezogen (Auge von Hand)
  ksPhase?: KsPhase                                  // gezeigte Phase der Knotensicht (Sitzung)
  onKsPhase?: (p: KsPhase) => void
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
  const ebenenWahlRef = useRef<L.Control.Layers | null>(null)
  const fwnWarDa = useRef(false)
  const ksPhase: KsPhase = props.ksPhase ?? 'beide'
  // Zoomstufe (Fahrzeuge der nicht gewählten Zufahrten erst ab FAHRZEUG_ZOOM)
  const [zoom, setZoom] = useState(19)
  // Griffe der Mittelinseln je Gruppe: nur beim Überfahren der Insel bzw. des Griffs oder bei gewählter Insel sichtbar
  const griffe = useRef(new Map<string, { mk: L.Marker; fest: boolean }>())
  const griffZeit = useRef(new Map<string, number>())
  const griffZug = useRef(new Set<string>())          // Gruppen, deren Griff gerade gezogen wird
  const griffZeigen = (gruppe: string) => {
    window.clearTimeout(griffZeit.current.get(gruppe)); griffZeit.current.delete(gruppe)
    griffe.current.get(gruppe)?.mk.getElement()?.classList.add('sichtbar')
  }
  const griffVerstecken = (gruppe: string) => {
    const g = griffe.current.get(gruppe)
    if (!g || g.fest) return
    window.clearTimeout(griffZeit.current.get(gruppe))
    // kurz warten: von der Insel auf den Griff wechseln, ohne dass er verschwindet; im Zug bleibt er sichtbar
    griffZeit.current.set(gruppe, window.setTimeout(() => {
      if (!griffZug.current.has(gruppe)) g.mk.getElement()?.classList.remove('sichtbar')
    }, 400))
  }
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
    // letzte Kartenansicht dieses Browsers (29.10.2026): nach einem Neuladen dort weiter statt am Startort; nur in der Schweiz
    const gemerkt = ((): { c: [number, number]; z: number } | null => {
      try {
        const v = JSON.parse(localStorage.getItem(ANSICHT_SCHLUESSEL) ?? 'null') as { c: [number, number]; z: number } | null
        return v && v.c[0] > 45.7 && v.c[0] < 47.9 && v.c[1] > 5.9 && v.c[1] < 10.6 && v.z >= 8 && v.z <= 22 ? v : null
      } catch { return null }
    })()
    const map = L.map(elRef.current, { maxZoom: 22, doubleClickZoom: false }).setView(gemerkt?.c ?? mitte, gemerkt?.z ?? 19)
    map.on('moveend', () => {
      const c = map.getCenter()
      try { localStorage.setItem(ANSICHT_SCHLUESSEL, JSON.stringify({ c: [c.lat, c.lng], z: map.getZoom() })) } catch { /* ohne Speicher */ }
    })
    // Quellenangabe: auf dem Smartphone einzeilig gekürzt (index.css), Tippen klappt sie auf (seit 28.10.2026, wie VeloroutenCheck)
    map.attributionControl.getContainer()?.addEventListener('click', ev => (ev.currentTarget as HTMLElement).classList.toggle('offen'))
    const luftbild = L.tileLayer(HINTERGRUND_LUFTBILD, { maxZoom: 22, maxNativeZoom: 20, attribution: '© swisstopo' }).addTo(map)
    const landeskarte = L.tileLayer(HINTERGRUND_KARTE, { maxZoom: 22, maxNativeZoom: 18, attribution: '© swisstopo' })
    const namenPane = map.createPane(NAMEN_PANE)
    namenPane.style.zIndex = '450'
    namenPane.style.pointerEvents = 'none'
    const fwnPane = map.createPane(FWN_PANE)
    fwnPane.style.zIndex = '401'
    fwnPane.style.pointerEvents = 'none'
    // «Ecke runden»: Ecken der gewählten Fläche (Plan) in einem eigenen Pane über allen Ebenen und Markern (markerPane 600), unter
    // den Tooltips (650); anklickbar auch im Werkzeugmodus (index.css: .karte-werkzeug)
    map.createPane(ECKEN_PANE).style.zIndex = '620'
    // «Mittelinsel (Standard)»: Griffe über den Flächen, Markern und der Vorschau (Pane der Ecken 620), unter den Tooltips (650);
    // beim «Ecke runden» (Werkzeugmodus) sind sie nicht anklickbar
    map.createPane(GRIFF_PANE).style.zIndex = '630'
    // Fahrzeuge und wartende Personen: unter den Markern (Griffe der Streifenenden beim Verschieben bleiben greifbar)
    map.createPane(FAHRZEUG_PANE).style.zIndex = '590'
    const eb: Record<string, L.LayerGroup> = {
      av: L.layerGroup().addTo(map), plan: L.layerGroup().addTo(map), osm: L.layerGroup().addTo(map), lbfgs: L.layerGroup().addTo(map), namen: L.layerGroup().addTo(map), sicht: L.layerGroup().addTo(map),
      nr: L.layerGroup().addTo(map), fahrzeug: L.layerGroup().addTo(map),
      hind: L.layerGroup().addTo(map), fix: L.layerGroup().addTo(map), mess: L.layerGroup().addTo(map), auswahl: L.layerGroup().addTo(map), zeichnen: L.layerGroup().addTo(map),
      standort: L.layerGroup().addTo(map), ecken: L.layerGroup().addTo(map), inselVorschau: L.layerGroup().addTo(map),
      griffe: L.layerGroup().addTo(map),
      // Fusswegnetz: erst mit Daten in der Ebenenwahl und auf der Karte (Effekt unten)
      fwn: L.layerGroup(),
    }
    // Richtplan Fussverkehr als WMS des Geoportals (30.10.2026): in der Ebenenwahl nur, solange die Karte die Stadt Bern zeigt;
    // anfangs aus. Wer die Stadt verlässt, verliert den Eintrag (keine Abfragen); zurück in Bern gilt die letzte Wahl wieder
    const rpWms = L.layerGroup(rpWmsTeile().map(o => L.tileLayer.wms(RP_WMS_URL, { ...o, maxZoom: 22 })))
    let rpWmsDa = false, rpWmsWahl = false
    const rpWmsAbgleich = () => {
      const b = map.getBounds(), da = rpWmsVerfuegbar({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() })
      const wahl = ebenenWahlRef.current
      if (!wahl || da === rpWmsDa) return
      rpWmsDa = da
      if (da) { wahl.addOverlay(rpWms, RP_WMS_NAME); if (rpWmsWahl) rpWms.addTo(map) }
      else { rpWmsWahl = map.hasLayer(rpWms); wahl.removeLayer(rpWms); map.removeLayer(rpWms) }
    }
    rpWms.on('add', () => cb.current.onRichtplanWms?.(true)).on('remove', () => cb.current.onRichtplanWms?.(false))
    ebenenWahlRef.current = L.control.layers({ 'Luftbild (SWISSIMAGE)': luftbild, 'Landeskarte (swisstopo)': landeskarte }, { 'Amtliche Vermessung': eb.av,
      'Flächen (Plan)': eb.plan,
      'OSM-Übergänge': eb.osm, [LUFTBILD_FGS_NAME]: eb.lbfgs, 'Strassennamen (OSM)': eb.namen, 'Sichtfelder': eb.sicht, 'Nummern der Zufahrten': eb.nr, 'Fahrzeuge': eb.fahrzeug, 'Hindernisse': eb.hind,
      'Fixpunkte und Masse': eb.fix },
    { collapsed: true }).addTo(map)
    fwnWarDa.current = false
    rpWmsAbgleich()
    map.on('moveend', rpWmsAbgleich)
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
      // Klick auf eine leere Stelle (nicht auf ein Objekt der Karte) hebt die Auswahl der Zufahrt auf und zeigt beide Phasen der Knotensicht
      if (!(e.originalEvent.target as Element | null)?.closest?.('.leaflet-interactive')) { cb.current.onZufahrt(null); cb.current.onKsPhase?.('beide') }
    })
    map.on('dblclick', () => { if (cb.current.werkzeug) cb.current.onDoppelklick() })
    map.on('moveend', () => { markerAbgleich(); namenAbgleich(); cb.current.onAusschnitt() })
    map.on('zoomend', () => setZoom(map.getZoom()))
    kartenRef.current = map
    ebenenRef.current = eb
    return () => { map.remove(); kartenRef.current = null; ebenenRef.current = null; ebenenWahlRef.current = null }
  }, [mitte, kartenRef])

  useEffect(() => {
    const el = elRef.current
    if (el) el.style.cursor = werkzeug ? 'crosshair' : ''
    // Werkzeugmodus (20.10.2026, Rückmeldung «nicht alle Punkte auswählbar»): alle Objekte der Karte lassen den Klick durch (CSS
    // pointer-events: none auf .leaflet-interactive), damit er als Kartenklick beim Werkzeug ankommt – ausser den Ecken beim
    // «Ecke runden» (.ecke-runden). Gilt gleich für alle Werkzeuge
    el?.classList.toggle('karte-werkzeug', !!werkzeug)
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

  // Fusswegnetz (Richtplan Fussverkehr Stadt Bern, 30.10.2026): nur die für die Vorbelegung genutzte Basisnetz-Linie, kräftig (das
  // ganze Netz zeigt die WMS-Ebene). Eintrag in der Ebenenwahl nur mit einer solchen Linie; eingeschaltet, sobald sie da ist, danach gilt
  // die Wahl in der Ebenenwahl
  const fwn = props.fusswegnetz ?? null, fwnQuelle = props.fusswegnetzQuelle
  useEffect(() => {
    const map = kartenRef.current, eb = ebenenRef.current, wahl = ebenenWahlRef.current
    if (!map || !eb || !wahl) return
    eb.fwn.clearLayers()
    wahl.removeLayer(eb.fwn)
    if (!fwn) { map.removeLayer(eb.fwn); fwnWarDa.current = false; return }
    wahl.addOverlay(eb.fwn, FUSSWEGNETZ_NAME)
    if (!fwnWarDa.current) eb.fwn.addTo(map)
    fwnWarDa.current = true
    for (const l of fwn.linien)
      L.polyline(l.teile.map(t => t.map(ll)), { pane: FWN_PANE, color: FUSSWEGNETZ_FARBE, weight: 4, opacity: 0.9 })
        .bindTooltip(esc(l.text), { sticky: true }).addTo(eb.fwn)
    if (!fwnQuelle) return
    map.attributionControl.addAttribution(fwnQuelle)
    return () => { map.attributionControl.removeAttribution(fwnQuelle) }
  }, [fwn, fwnQuelle, kartenRef])

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
          `${planFlaecheM2(fp.ring).toFixed(1).replace('.', ',')} m²${fp.standard ? `<br>${esc(planStandardText(fp))}` : ''}` +
          (fp.standard && flaechenPlan.some(x => x.standard?.gruppe === fp.standard!.gruppe && planStandardAngepasst(x)) ?
            `<br>Form ${planStandardAngepasst(fp) ? '' : 'eines anderen Teils '}von Hand angepasst: kein Griff zum Ziehen (nur die Standardform ist ziehbar)` : '') +
          '<br>ersetzt in der Rechnung die AV darunter<br><i>Klick: wählen und bearbeiten</i>',
        { sticky: true })
        .on('click', e => { if (cb.current.werkzeug) return; L.DomEvent.stopPropagation(e); cb.current.onHindernis(fp.id) })
        .on('mouseover', () => { if (fp.standard) griffZeigen(fp.standard.gruppe) })
        .on('mouseout', () => { if (fp.standard) griffVerstecken(fp.standard.gruppe) })
        .addTo(eb.plan)
    }
    // Mittelinsel (Standard): Signalmast im Kopf der Furt-Seite (Punkt, nur Hinweis; nicht bei von Hand veränderter Form)
    for (const fp of flaechenPlan) {
      const st = inselStandard(fp)
      if (st?.teil !== 'kopf' || standardAngepasst(fp)) continue
      const mast = standardGeometrie(st).mast
      if (mast) L.circleMarker(ll(mast), { radius: 4, color: '#ffffff', weight: 1.5, fillColor: '#000000', fillOpacity: 1, interactive: !werkzeug })
        .bindTooltip('Signalmast der Mittelinsel (Standard E1): Hinweis, kein Hindernis in der Rechnung').addTo(eb.plan)
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

  // Streifen aus dem Luftbild (ETH-Modell), nicht in OSM: wenige Marker, bei jeder Änderung neu (Klick prüft wie ein OSM-Übergang)
  const lbKand = props.luftbildKandidaten
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.lbfgs.clearLayers()
    for (const k of lbKand ?? []) {
      const g = k.id === gewaehlt
      L.marker([k.lat, k.lon], { icon: lbFgsIcon(g), keyboard: false, zIndexOffset: g ? 500 : 0 })
        .bindTooltip(`<b>${esc(kandidatTooltip(k))}</b><br><i>Klick: prüfen</i>`)
        .on('click', e => {
          if (cb.current.werkzeug) return
          L.DomEvent.stopPropagation(e); cb.current.onLuftbildKandidat?.(k)
        })
        .addTo(eb.lbfgs)
    }
  }, [lbKand, gewaehlt])

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
          .bindTooltip(`Sichtfeld ${esc(zufahrtText(cb.current.zufahrtNamen.get(z.fgsId), z.zufahrt))}${z.deckung ? ' (mitgeprüft)' : ''}: ${z.status === 'frei' ? 'frei' : esc(z.status.replace('_', ' '))}`, { sticky: true })
          .on('click', () => { if (!cb.current.werkzeug) cb.current.onZufahrt(zufahrtKey(z)) }).addTo(eb.sicht)
        // Sicht vom Velo (29.10.2026): gestrichelt wie die Velo-Dreiecke der Knotensicht
        const vs = veloSoll(z, props.neigung)
        if (z.velo && vs) {
          const fv = VELO_SICHT_FARBE[vs.frei ? 'frei' : 'verdeckt']
          L.polygon(multiLl(z.velo.feld), { color: fv, weight: 1, dashArray: KS_STRICH.velo, fillColor: fv, fillOpacity: 0.1, interactive: !cb.current.werkzeug })
            .bindTooltip(veloTooltip(cb.current.zufahrtNamen.get(z.fgsId), z, vs), { sticky: true })
            .addTo(eb.sicht)
        }
      }
      if (s.trottoirueberfahrt) {
        // Trottoirüberfahrt (27.10.2026): die gerechnete Überfahrt zwischen vorderem und hinterem Rand (Trottoirfarbe, grau gestrichelt),
        // nicht der Streifen mit seiner festen Zeichenbreite; dieser bleibt als dünne Achse. Ohne Knotensicht nur die Achse
        const fl = tueFlaeche(s.knotensicht)
        if (fl) L.polygon(fl.map(ll), { color: TUE_RAND, weight: 2, dashArray: STRICH_TUE, fillColor: AV_FARBEN.Trottoir, fillOpacity: 0.85,
          interactive: false, className: 'tue-flaeche' }).addTo(eb.sicht)
        L.polyline([s.p0, s.p1].map(ll), { color: TUE_RAND, weight: 2, interactive: false, className: 'tue-achse' }).addTo(eb.sicht)
        // Knotensicht (K4): Sichtdreiecke je Richtung (frei grün, verdeckt rot; Velo gestrichelt, Trottoir punktiert) und die
        // Beobachtungspunkte der beiden Phasen
        const ks = s.knotensicht
        // über die durchgehende Strasse bzw. ohne Einmündung nur die Achse (und der Hinweis im Panel)
        if (tueGezeichnet(ks)) {
          // gezeigte Phase (Klick auf ein wartendes Fahrzeug bzw. Wahl im Block): nur ihre Sichtdreiecke
          for (const d of ks.karte.dreiecke.filter(x => ksDreieckSichtbar(x.art, ksPhase))) for (const [ring, farbe, wie] of [[d.frei, d.art === 'velo' ? VELO_SICHT_FARBE.frei : STATUS_FARBE.frei, 'frei'],
            [d.verdeckt, d.art === 'velo' ? VELO_SICHT_FARBE.verdeckt : STATUS_FARBE.verdeckt, 'verdeckt']] as const) {
            if (ring.length < 3) continue
            L.polygon(ring.map(ll), { color: farbe, weight: 1, dashArray: KS_STRICH[d.art], fillColor: farbe, fillOpacity: wie === 'frei' ? 0.1 : 0.2,
              interactive: !cb.current.werkzeug })
              .bindTooltip(`Knotensicht ${KS_ART[d.art]} ${KS_LAGE[d.lage] ?? d.lage}: ${wie}`, { sticky: true }).addTo(eb.sicht)
          }
          // vorderer und hinterer Rand der Überfahrt, wie gerechnet
          for (const [k, t] of ks.karte.kanten.map((k, i) => [k, i ? 'hinterer' : 'vorderer'] as const))
            L.polyline(k.map(ll), { color: '#111827', weight: 2, dashArray: i0(t), interactive: !cb.current.werkzeug })
              .bindTooltip(`${t} Rand der Trottoirüberfahrt`).addTo(eb.sicht)
          for (const [p, t] of [[ks.karte.D, 'Fahrbahn (vorderer Rand)'], [ks.karte.Dtrottoir, 'Trottoir (hinterer Rand)']] as const)
            if (p) L.circleMarker(ll(p), { radius: 4, color: '#111827', weight: 1.5, fillColor: '#ffffff', fillOpacity: 1, interactive: !cb.current.werkzeug })
              .bindTooltip(`Auge der Ausfahrenden, Sicht auf ${t}`).addTo(eb.sicht)
        }
        continue
      }
      for (const a of s.ann) L.polygon(a.map(r => r.map(ll)), { color: '#0ea5e9', weight: 1, fillOpacity: 0.4, interactive: false }).addTo(eb.sicht)
      if (s.querung) {
        // ohne Vortritt: keine Balken (keine gelbe Fläche), Umriss weiss gestrichelt auf dunklem Rand
        L.polygon(s.umriss.map(ll), { color: '#0f172a', weight: 4, opacity: 0.55, fill: false, interactive: false }).addTo(eb.sicht)
        L.polygon(s.umriss.map(ll), { color: OHNE_VORTRITT_FARBE, weight: 2, dashArray: STRICH_OHNE_VORTRITT, fillColor: OHNE_VORTRITT_FARBE,
          fillOpacity: 0.12, interactive: false }).addTo(eb.sicht)
      } else L.polygon(s.umriss.map(ll), { color: '#fde047', weight: 2, fillColor: '#fde047', fillOpacity: 0.5, interactive: false }).addTo(eb.sicht)
      // Erkennungsdistanz (27.10.2026) je gerade Zufahrt entlang der Fahrlinie: grün sichtbar, rot verdeckt bis zum Soll, grau nicht
      // geprüft; das verdeckende Hindernis wie ein Konflikt. Die Sichtfelder (Sichtweite) bleiben, wie sie sind
      for (const b of erkennungBaender(s)) {
        const stil = { weight: 4, opacity: 0.95, lineCap: 'butt' as const, interactive: !cb.current.werkzeug }
        const teile: { linie: P[]; farbe: string; strich?: string }[] = [{ linie: b.gruen, farbe: STATUS_FARBE.frei },
          ...(b.fehlt ? [b.fehlt.art === 'verdeckt' ? { linie: b.fehlt.linie, farbe: STATUS_FARBE.verdeckt }
            : { linie: b.fehlt.linie, farbe: ERKENNUNG_UNGEPRUEFT, strich: '6 4' }] : [])]
        for (const { linie, farbe, strich } of teile) {
          if (linie.length < 2) continue
          L.polyline(linie.map(ll), { color: '#0f172a', weight: 7, opacity: 0.45, lineCap: 'butt', interactive: false }).addTo(eb.sicht)
          L.polyline(linie.map(ll), { ...stil, color: farbe, ...(strich ? { dashArray: strich } : {}) }).bindTooltip(esc(b.text), { sticky: true }).addTo(eb.sicht)
        }
        const h = b.hindernisId ? [...hindernisse, ...(rechnung.vorschlaege ?? []).map(v => v.hindernis)].find(x => x.id === b.hindernisId) : undefined
        if (h) (hindernisEbene(h, { color: '#7f1d1d', weight: 2, fillColor: '#dc2626', fillOpacity: 0.6, interactive: !cb.current.werkzeug }) as L.Path)
          .bindTooltip(esc(b.text), { sticky: true }).addTo(eb.sicht)
      }
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
  }, [rechnung, werkzeug, props.zufahrtNamen, ksPhase, hindernisse, props.neigung])

  // Nummernschilder der Zufahrten (benennung.ts) hinter dem letzten Sichtpunkt; Klick wählt die Zufahrt wie die Zeile im Panel
  // (auf der gewählten: Auswahl aufheben); gestrichene Zufahrten ohne Schild (keine Fahrlinie);
  // Tooltip mit dem vollen Namen; die gewählte Zufahrt Bernstein und zuoberst. Beim Zeichnen nicht anklickbar (Klick an die Karte).
  const zNamen = props.zufahrtNamen
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.nr.clearLayers()
    if (!rechnung) return
    const mehrere = rechnung.streifen.length > 1
    for (const s of rechnung.streifen) for (const z of s.zufahrten) {
      const nr = zufahrtNr(zNamen.get(s.fgsId), z.zufahrt), lage = schildLage(z)
      if (!nr || !lage) continue
      const g = zufahrtKey(z) === auswahl, titel = mehrere ? cb.current.streifenTitel(s.fgsId) : null
      L.marker(ll(lage.p), { icon: nrIcon(nr, lage.aussen, g, titel), interactive: !werkzeug, keyboard: false, zIndexOffset: g ? 1000 : 0 })
        .bindTooltip(`${titel ? `${esc(titel)}: ` : ''}<b>${esc(zufahrtText(zNamen.get(s.fgsId), z.zufahrt))}</b>` +
          `${z.deckung ? ' (mitgeprüft)' : ''}: ${z.status === 'frei' ? 'frei' : esc(z.status.replace('_', ' '))}` +
          `<br><i>Klick: ${g ? 'Auswahl aufheben' : 'Zufahrt wählen'}</i>`, { direction: 'top', offset: [lage.aussen[0] * SCHILD_PX, -lage.aussen[1] * SCHILD_PX - 10] })
        .on('click', e => { if (cb.current.werkzeug) return; L.DomEvent.stopPropagation(e); cb.current.onZufahrt(g ? null : zufahrtKey(z)) })
        .addTo(eb.nr)
    }
  }, [rechnung, auswahl, werkzeug, zNamen])

  // Hindernisse (von Hand, bestätigt) und Vorschläge (gestrichelt, «aus OSM, prüfen»)
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.hind.clearLayers()
    // Parkierung unter einem vorgezogenen Seitenraum: gestrichelt, gedimmt (entfällt in der Rechnung ganz bzw. zum überdeckten Teil)
    const ersetzt = new Map((rechnung?.seitenraumErsetzt ?? []).map(x => [x.id, x.ganz]))
    const srStil = (id: string): L.PathOptions => (ersetzt.has(id) ? { dashArray: '3 4', opacity: 0.6, fillOpacity: 0.08 } : {})
    const srText = (id: string) => (ersetzt.has(id) ? `<br>${SR_ERSETZT}${ersetzt.get(id) ? '' : ' (zum überdeckten Teil)'}` : '')
    for (const h of hindernisse) {
      const farbe = hindernisFarbe(h)
      const ebene = hindernisEbene(h, { color: farbe, weight: h.id === bearbeiten ? 3 : 2, fillColor: farbe, fillOpacity: 0.35, ...srStil(h.id) })
      ;(ebene as L.Path).bindTooltip(esc(hindernisText(h)) + ((h.art === 'hecke' || h.art === 'mauer' || h.art === 'uebrige') &&
        !h.sichtbehindernd ? ' – nicht sichtbehindernd' : '') + srText(h.id), { sticky: true })
        .on('click', e => { if (cb.current.werkzeug) return; L.DomEvent.stopPropagation(e); cb.current.onHindernis(h.id) })
      ebene.addTo(eb.hind)
    }
    for (const v of rechnung?.vorschlaege ?? []) {
      const farbe = hindernisFarbe(v.hindernis)
      const ebene = hindernisEbene(v.hindernis, { color: farbe, weight: v.id === bearbeiten ? 4 : 2, dashArray: v.hindernis.quelle === 'osm' ? '5 4' : undefined,
        fillColor: farbe, fillOpacity: v.hindernis.quelle === 'osm' ? 0.12 : 0.35, ...srStil(v.id) })
      ;(ebene as L.Path).bindTooltip(`${esc(v.hindernis.name ?? 'Vorschlag')}<br>${esc(v.grund)}${srText(v.id)}` +
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
      // Trottoirüberfahrt (27.10.2026): in ihrer Randfarbe, «Überfahrt» statt «Streifen»
      const tue = !!rechnung?.streifen.find(x => x.fgsId === s.id)?.trottoirueberfahrt
      L.polyline([ll(s.p0), ll(s.p1)], { color: tue ? TUE_RAND : '#fde047', weight: 3, dashArray: '6 4' })
        .bindTooltip(`${esc(cb.current.streifenTitel(s.id))} (${tue ? 'Überfahrt' : 'Streifen'} von Hand${s.id === bearbeiten ? ', Enden ziehen' : ''})`)
        .addTo(eb.hind)
    }
    // Ecken des bearbeiteten Objekts verschieben
    // Enden eines Streifens (auch der Trottoirüberfahrt, 27.10.2026) im Pane der Griffe über Fahrzeugen, Sichtdreiecken und der
    // Überfahrt, damit nichts sie verdeckt
    const ecken = (id: string, pts: P[], oben = false) => pts.forEach((p, i) => {
      L.marker(ll(p), { draggable: true, icon: L.divIcon({ className: 'ecke', iconSize: [12, 12] }),
        ...(oben ? { pane: GRIFF_PANE, zIndexOffset: 1000 } : {}) })
        .on('dragend', (e: L.LeafletEvent) => { const g = (e.target as L.Marker).getLatLng(); cb.current.onEcke(id, i, lv95(g.lat, g.lng)) })
        .addTo(eb.hind)
    })
    const h = hindernisse.find(x => x.id === bearbeiten)
    if (h) ecken(h.id, h.art === 'parkfeld' ? h.ring : h.art === 'baum' ? [h.p] : h.art === 'laengsparkierung' ? h.linie : h.ring ?? h.linie ?? [])
    const sh = streifenHand.find(x => x.id === bearbeiten)
    if (sh) ecken(sh.id, [sh.p0, sh.p1], true)
    // Annäherungsbereich je Ende (30.10.2026): Mitte (entlang der Bordkante verschieben) und beide Seiten (breiter bzw. schmaler, die
    // andere Seite bleibt); Lage aus der Rechnung (annBasis), Vorgabe von Hand in onAnn
    const se = sh ? rechnung?.streifen.find(x => x.fgsId === sh.id) : undefined
    if (sh && se?.annBasis) se.annBasis.forEach((b, k) => {
      const h = se.annHand?.[k] ?? { versatz: 0, breite: b.breite }
      const lage = (x: number) => add(b.rand, b.u, x)
      const proj = (e: L.LeafletEvent) => { const g = (e.target as L.Marker).getLatLng(); return dot(sub(lv95(g.lat, g.lng), b.rand), b.u) }
      const ende = k === 0 ? 'A' : 'B'
      const griff = (x: number, art: 'mitte' | 'seite', text: string, neu: (p: number) => AnnHand) =>
        L.marker(ll(lage(x)), { draggable: true, pane: GRIFF_PANE, zIndexOffset: 1000, keyboard: false,
          icon: L.divIcon({ className: `ann-griff ann-${art}`, iconSize: art === 'mitte' ? [12, 12] : [10, 10] }) })
          .bindTooltip(`Annäherungsbereich ${ende}: ${text}`, { direction: 'top', offset: [0, -8] })
          .on('dragend', e => cb.current.onAnn?.(sh.id, k as 0 | 1, annBegrenzt(neu(proj(e)))))
          .addTo(eb.hind)
      griff(h.versatz, 'mitte', 'entlang der Bordkante verschieben', p => ({ versatz: p, breite: h.breite }))
      for (const sg of [-1, 1]) {
        const fest = h.versatz - sg * h.breite / 2
        griff(h.versatz + sg * h.breite / 2, 'seite', 'Seite ziehen: breiter bzw. schmaler', p => {
          const breite = Math.max(ANN_HAND_BREITE[0], sg * (p - fest))
          return { versatz: fest + sg * breite / 2, breite }
        })
      }
    })
    const fp = fixpunkte.find(x => x.id === bearbeiten)
    if (fp) ecken(fp.id, [fp.p])
    const pl = flaechenPlan.find(x => x.id === bearbeiten)
    if (pl && werkzeug !== 'eckeRunden') ecken(pl.id, pl.ring)      // beim «Ecke runden»: eigene Ebene (unten)
  }, [hindernisse, rechnung, streifenHand, fixpunkte, flaechenPlan, bearbeiten, werkzeug])

  // «Ecke runden»: Ecken der gewählten Fläche (Plan) als anklickbare Kreise im eigenen Pane über allem (nicht in der Ebene
  // «Hindernisse», die sich ausschalten lässt); Klick wählt genau diese Ecke (als Kartenklick auf ihre Lage, App fängt sie).
  // Ein Kartenklick neben einer Ecke fängt weiterhin die nächste im Fangradius
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.ecken.clearLayers()
    const pl = werkzeug === 'eckeRunden' ? flaechenPlan.find(x => x.id === bearbeiten) : undefined
    if (!pl) return
    const r = props.rundenR ?? 0
    const m = (x: number) => String(x).replace('.', ',')
    // nur echte Ecken als Rund-Ziele (planflaechen.echteEcken); Punkte eines Bogens bzw. fast gerade Punkte als kleine, nicht
    // anklickbare Punkte
    const echt = new Set(echteEcken(pl.ring))
    pl.ring.forEach((p, i) => {
      if (echt.has(i)) return
      L.circleMarker(ll(p), { pane: ECKEN_PANE, radius: 2, color: PLAN_FARBEN[pl.art].linie, weight: 1, fillColor: '#ffffff', fillOpacity: 1,
        interactive: false }).addTo(eb.ecken)
    })
    pl.ring.forEach((p, i) => {
      if (!echt.has(i)) return
      // grösster möglicher Radius (planflaechen.eckeRadiusMax): passt der eingestellte nicht, grau gestrichelt; Klick bietet in der
      // Werkzeughilfe «mit höchstens x m runden» an
      const rMax = eckeRadiusMax(pl.ring, i)
      const passt = rMax !== null && rMax >= r
      const text = rMax === null ? `Ecke ${i + 1} – nicht rundbar (Kanten fast gerade bzw. spitz)` : passt
        ? `Ecke ${i + 1} – ${rMax >= RUNDEN_R_BEREICH[1] ? `bis ${m(RUNDEN_R_BEREICH[1])}` : `höchstens ${m(rMax)}`} m; Klick: mit ${m(r)} m runden`
        : `Ecke ${i + 1} – höchstens ${m(rMax)} m, ${m(r)} m passt nicht; Klick: Angebot mit ${m(rMax)} m`
      L.circleMarker(ll(p), { pane: ECKEN_PANE, className: 'ecke-runden', radius: 8, color: passt ? PLAN_FARBEN[pl.art].linie : '#6b7280',
        weight: 2, dashArray: passt ? undefined : '3 3', fillColor: passt ? '#ffffff' : '#d1d5db', fillOpacity: 1, bubblingMouseEvents: false })
        .bindTooltip(text, { direction: 'top', offset: [0, -8] })
        .on('click', e => { L.DomEvent.stopPropagation(e); cb.current.onKlick(p) })
        .addTo(eb.ecken)
    })
  }, [flaechenPlan, bearbeiten, werkzeug, props.rundenR])

  // «Ecke runden»: Vorschau beim Ziehen des Reglers. Eine Linie und ein Text, einmal angelegt und danach nur nachgeführt
  // (setLatLngs, textContent), damit die Vorschau der Reglerbewegung ohne Neuaufbau der Ebenen folgt
  const vorschauRef = useRef<{ linie: L.Polygon; tip: L.Tooltip; text: HTMLElement } | null>(null)
  const vorschau = props.rundenVorschau ?? null
  useEffect(() => {
    const map = kartenRef.current
    if (!map) return
    let v = vorschauRef.current
    if (!vorschau) {
      if (v) { v.linie.remove(); map.closeTooltip(v.tip) }
      return
    }
    if (!v) {
      const text = L.DomUtil.create('span')
      v = vorschauRef.current = {
        linie: L.polygon([], { pane: ECKEN_PANE, fill: false, weight: 3, dashArray: '6 4', interactive: false }),
        tip: L.tooltip({ permanent: true, direction: 'top', offset: [0, -10], pane: 'tooltipPane' }).setContent(text), text,
      }
    }
    v.linie.setLatLngs(vorschau.ring.map(ll)).setStyle({ color: vorschau.passt ? '#111827' : '#dc2626' })
    if (!map.hasLayer(v.linie)) v.linie.addTo(map)
    v.text.textContent = vorschau.text
    v.tip.setLatLng(ll(vorschau.p))
    if (!map.hasLayer(v.tip)) v.tip.openOn(map)
  }, [vorschau, kartenRef])

  // «Mittelinsel (Standard)»: Vorschau vor dem Einfügen bzw. beim Ziehen am Griff (leichte Ebene im Pane der Ecken, nicht
  // anklickbar: Klicks gehen an die Karte). Inselteile gestrichelt in der Farbe der Plan-Inseln, Furt grau, Mast als Punkt, Mitte als
  // Kreis, Teilstreifen gelb gestrichelt, Lagehinweise als Text an der Mitte. Einmal angelegt und danach nur nachgeführt
  // (setLatLngs, wie die Rundungsvorschau), damit die Vorschau dem Ziehen ohne Neuaufbau folgt
  const inselV = props.inselVorschau ?? null
  const inselVRef = useRef<{ ringe: L.Polygon[]; furt: L.Polygon; teile: L.Polyline[]; mast: L.CircleMarker; mitte: L.CircleMarker
    tip: L.Tooltip; text: HTMLElement } | null>(null)
  useEffect(() => {
    const eb = ebenenRef.current, map = kartenRef.current
    if (!eb || !map) return
    let v = inselVRef.current
    if (!v) {
      const o = { pane: ECKEN_PANE, interactive: false }
      const text = L.DomUtil.create('span')
      v = inselVRef.current = {
        ringe: [0, 1].map(() => L.polygon([], { ...o, color: PLAN_FARBEN.insel.linie, weight: 2, dashArray: '5 4', fillColor: PLAN_FARBEN.insel.flaeche,
          fillOpacity: 0.5 }).addTo(eb.inselVorschau)),
        furt: L.polygon([], { ...o, color: '#6b7280', weight: 1, dashArray: '2 3', fillColor: '#9ca3af', fillOpacity: 0.35 }).addTo(eb.inselVorschau),
        teile: [0, 1].map(() => L.polyline([], { ...o, color: '#ca8a04', weight: 4, dashArray: '6 4' }).addTo(eb.inselVorschau)),
        mast: L.circleMarker([0, 0], { ...o, radius: 4, color: '#ffffff', weight: 1.5, fillColor: '#000000', fillOpacity: 1 }),
        mitte: L.circleMarker([0, 0], { ...o, radius: 3, color: '#111827', weight: 1, fillColor: '#ffffff', fillOpacity: 1 }),
        tip: L.tooltip({ permanent: true, direction: 'bottom', offset: [0, 12], pane: 'tooltipPane', className: 'insel-hinweis' }).setContent(text),
        text,
      }
    }
    const x = v
    // Farbe der Plan-Art (Mittelinsel: Insel; vorgezogener Seitenraum: Trottoir)
    const pf = PLAN_FARBEN[inselV?.art ?? 'insel']
    x.ringe.forEach((r, i) => r.setLatLngs(inselV?.ringe[i]?.map(ll) ?? []).setStyle({ color: pf.linie, fillColor: pf.flaeche }))
    x.furt.setLatLngs(inselV?.furt?.map(ll) ?? [])
    x.teile.forEach((t, i) => t.setLatLngs(inselV?.teile[i]?.map(ll) ?? []))
    const punkt = (m: L.CircleMarker, p: P | null | undefined) => {
      if (p) { m.setLatLng(ll(p)); if (!eb.inselVorschau.hasLayer(m)) m.addTo(eb.inselVorschau) } else eb.inselVorschau.removeLayer(m)
    }
    punkt(x.mast, inselV?.mast); punkt(x.mitte, inselV?.mitte)
    if (inselV?.text) {
      x.text.textContent = inselV.text
      x.tip.setLatLng(ll(inselV.mitte))
      if (!map.hasLayer(x.tip)) x.tip.openOn(map)
    } else if (map.hasLayer(x.tip)) map.closeTooltip(x.tip)
  }, [inselV, kartenRef])

  // «Mittelinsel (Standard)»: Griff in der Inselmitte (Standardform, nicht von Hand angepasst; App.inselGriffe). Ziehen: Mitte
  // entlang der Achse, mit Umschalttaste frei; Vorschau beim Ziehen (onInselZug), Übernahme beim Loslassen (onInselLos). Leaflet-
  // Marker: Ziehen mit Maus und Finger (L.Draggable). Im Werkzeugmodus nicht anklickbar wie die übrigen Ebenen
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.griffe.clearLayers()
    griffe.current.clear()
    // Griff nur sichtbar, solange die Maus über der Insel bzw. dem Griff ist oder ein Teil der Insel gewählt ist (Touch: Tippen
    // auf die Insel, auch auf ihre Mitte unter dem unsichtbaren Griff, wählt sie); sonst ausgeblendet und für Zeiger durchlässig
    // (index.css: .leaflet-marker-icon.insel-griff:not(.sichtbar) mit pointer-events none, gegen die Regel aus leaflet.css)
    const gewaehlt = new Set(flaechenPlan.filter(x => x.id === bearbeiten && x.standard).map(x => x.standard!.gruppe))
    for (const g of props.inselGriffe ?? []) {
      const fest = gewaehlt.has(g.gruppe)
      const mk = L.marker(ll(g.m), { pane: GRIFF_PANE, draggable: !werkzeug, interactive: !werkzeug, keyboard: false,
        icon: L.divIcon({ className: 'insel-griff' + (fest ? ' sichtbar' : ''), html: GRIFF_SVG, iconSize: [26, 26], iconAnchor: [13, 13] }) })
        .bindTooltip(g.text, { direction: 'top', offset: [0, -14], className: 'insel-hinweis' })
      griffe.current.set(g.gruppe, { mk, fest })
      mk.on('mouseover', () => griffZeigen(g.gruppe)).on('mouseout', () => griffVerstecken(g.gruppe))
      let frei = false
      // Umschalttaste schon beim Drücken: Leaflet startet dann kein Ziehen, sondern den Box-Zoom (Ziehen mit Umschalttaste). Über
      // dem Griff ist der Box-Zoom darum aus (beim Verlassen bzw. Entfernen des Griffs wieder an); «frei» gilt erst, wenn die Taste
      // im Zug gedrückt wird, bzw. mit dem Schalter «frei verschieben» (App)
      const map = kartenRef.current
      const boxAus = () => map?.boxZoom.disable(), boxAn = () => map?.boxZoom.enable()
      mk.on('mouseover', boxAus).on('mouseout', boxAn).on('remove', boxAn)
      mk.on('dragstart', () => { griffZug.current.add(g.gruppe); mk.closeTooltip() })
      mk.on('drag', (e: L.LeafletEvent) => {
        const oe = (e as L.LeafletEvent & { originalEvent?: { shiftKey?: boolean } }).originalEvent
        frei = !!oe?.shiftKey
        const q = mk.getLatLng()
        cb.current.onInselZug?.(g.gruppe, lv95(q.lat, q.lng), frei)
      })
      // zurück an die bisherige Mitte: übernimmt die App die Verschiebung, zeichnet sie den Griff an der neuen Mitte neu; lehnt
      // sie ab (Teilstreifen zu kurz), bleibt er dort, wo die Insel ist
      mk.on('dragend', () => { griffZug.current.delete(g.gruppe); griffVerstecken(g.gruppe); const q = mk.getLatLng(); mk.setLatLng(ll(g.m)); cb.current.onInselLos?.(g.gruppe, lv95(q.lat, q.lng), frei) })
      mk.addTo(eb.griffe)
    }
  }, [props.inselGriffe, werkzeug, flaechenPlan, bearbeiten])

  // «Ecke runden»: Angebot als Popup an der Ecke. Inhalt aus DOM-Knoten mit textContent (kein HTML aus Daten); Klicks im Popup
  // gehen nicht an die Karte. Schliessen (Knopf, Kreuz, Klick anderswo) meldet «abbrechen»; die App entfernt das Angebot dann
  const angebot = props.rundenAngebot ?? null
  useEffect(() => {
    const map = kartenRef.current
    if (!map || !angebot) return
    const div = L.DomUtil.create('div', 'runden-angebot')
    L.DomUtil.create('div', '', div).textContent = angebot.text
    const knoepfe = L.DomUtil.create('div', 'runden-knoepfe', div)
    const ja = L.DomUtil.create('button', 'klein', knoepfe)
    ja.type = 'button'; ja.textContent = angebot.knopf
    const nein = L.DomUtil.create('button', 'zweit klein', knoepfe)
    nein.type = 'button'; nein.textContent = 'abbrechen'
    L.DomEvent.disableClickPropagation(div)
    let erledigt = false
    const popup = L.popup({ autoPan: true, closeOnClick: true, maxWidth: 280, offset: [0, -6] }).setLatLng(ll(angebot.p)).setContent(div)
    L.DomEvent.on(ja, 'click', () => { erledigt = true; map.closePopup(popup); cb.current.onRundenAngebot?.(true) })
    L.DomEvent.on(nein, 'click', () => { erledigt = true; map.closePopup(popup); cb.current.onRundenAngebot?.(false) })
    popup.on('remove', () => { if (!erledigt) { erledigt = true; cb.current.onRundenAngebot?.(false) } })
    popup.openOn(map)
    return () => { erledigt = true; map.closePopup(popup) }
  }, [angebot, kartenRef])

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

  // Werkzeug «Messen»: Strecke mit Länge (zwei Nachkommastellen), gefangene Punkte als Quadrat, freie als Kreis
  const messung = props.messung ?? null
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.mess.clearLayers()
    if (!messung) return
    for (const q of [messung.a, messung.b]) if (q) L.circleMarker(ll(q.p), { radius: q.art === 'frei' ? 4 : 5, color: MESS_FARBE, weight: 2,
      fillColor: '#ffffff', fillOpacity: 1, interactive: false }).addTo(eb.mess)
    const x = messLaenge(messung)
    if (x === null || !messung.b) return
    L.polyline([ll(messung.a.p), ll(messung.b.p)], { color: MESS_FARBE, weight: 2.5, interactive: false }).addTo(eb.mess)
    const mitte: P = [(messung.a.p[0] + messung.b.p[0]) / 2, (messung.a.p[1] + messung.b.p[1]) / 2]
    L.marker(ll(mitte), { interactive: false, keyboard: false, icon: L.divIcon({ className: 'masstext messtext', iconSize: [0, 0],
      html: `<span>${esc(messText(x))}</span>` }) }).addTo(eb.mess)
  }, [messung])

  // Fahrzeuge und wartende Personen (27.10.2026, fahrzeuge.ts): Trottoirüberfahrt (Knotensicht) immer; am Fussgängerstreifen die Personen
  // immer, die Fahrzeuge der nicht gewählten Zufahrten blass erst ab Zoom FAHRZEUG_ZOOM (die gewählte kräftig in der Auswahl)
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.fahrzeug.clearLayers()
    if (!rechnung) return
    // anklickbar (Tooltip) nur ohne Werkzeug und ohne «verschieben»: sonst fingen sie Klicks bzw. Griffe ab
    const aktiv = !werkzeug && !bearbeiten
    for (const s of rechnung.streifen) {
      for (const f of tueFahrzeuge(s)) {
        const stand = ksFahrzeugStand(f, ksPhase)
        if (stand === 'aus') continue
        const teile = fahrzeugZeichnen(eb.fahrzeug, f, false, aktiv, stand)
        // Klick (ohne Ziehen) auf ein wartendes Fahrzeug: nur die Sicht seiner Phase zeigen, nochmals: beide
        if (aktiv && f.rolle === 'fb' && f.phase) for (const t of teile) t.on('click', (e: L.LeafletEvent) => {
          L.DomEvent.stopPropagation(e as L.LeafletMouseEvent); cb.current.onKsPhase?.(ksPhaseNach(cb.current.ksPhase ?? 'beide', f.phase!))
        })
        // ziehbar: Phase Fahrbahn immer, Phase Trottoir, sobald der Kern das Auge von Hand kennt; nicht während eines Werkzeugs
        if (aktiv && f.rolle === 'fb' && f.phase && f.ziehbar && cb.current.onTueAuge)
          augeGriff(eb.fahrzeug, f, teile, p => cb.current.onTueAuge?.(s.fgsId, f.phase!, p),
            () => cb.current.onKsPhase?.(ksPhaseNach(cb.current.ksPhase ?? 'beide', f.phase!)))
      }
      for (const f of fgsFahrzeuge(s, cb.current.neigung)) {
        if (f.rolle === 'zufahrt' && (f.zufahrt === auswahl || zoom < FAHRZEUG_ZOOM)) continue
        fahrzeugZeichnen(eb.fahrzeug, f, f.rolle === 'zufahrt', aktiv)
      }
    }
  }, [rechnung, auswahl, zoom, werkzeug, bearbeiten, ksPhase, props.neigung])

  // gewählte Zufahrt hervorheben
  useEffect(() => {
    const eb = ebenenRef.current
    if (!eb) return
    eb.auswahl.clearLayers()
    if (!rechnung || !auswahl) return
    const z = rechnung.streifen.flatMap(s => s.zufahrten).find(x => zufahrtKey(x) === auswahl)
    if (!z) return
    // Fahrzeug am letzten Sichtpunkt der gewählten Zufahrt, kräftig
    const st = rechnung.streifen.find(s => s.fgsId === z.fgsId)
    for (const f of st ? fgsFahrzeuge(st, cb.current.neigung) : []) if (f.zufahrt === auswahl) fahrzeugZeichnen(eb.auswahl, f, false, !cb.current.werkzeug && !cb.current.bearbeiten)
    const farbe = STATUS_FARBE[z.status] ?? '#10b981'
    L.polygon(multiLl(z.feld), { color: farbe, weight: 2, fillColor: farbe, fillOpacity: 0.25, interactive: false }).addTo(eb.auswahl)
    // Sicht vom Velo (29.10.2026): wie das Sichtfeld des Fahrzeugs, gestrichelt, mit den Sichtpunkten der Veloachse
    const vs = veloSoll(z, cb.current.neigung)
    if (z.velo && vs) {
      const fv = VELO_SICHT_FARBE[vs.frei ? 'frei' : 'verdeckt']
      L.polygon(multiLl(z.velo.feld), { color: fv, weight: 2, dashArray: KS_STRICH.velo, fillColor: fv, fillOpacity: 0.25, interactive: false }).addTo(eb.auswahl)
      for (const k of z.velo.konflikte) L.polygon(multiLl(k.geom), { color: '#7f1d1d', weight: 2, dashArray: KS_STRICH.velo, fillColor: '#dc2626', fillOpacity: 0.6 })
        .bindTooltip(`${esc(k.layer)} im Sichtfeld des Velos, ${k.abstand.toFixed(1)} m vom Streifen`).addTo(eb.auswahl)
      z.velo.sichtpunkte.forEach((p, i) => L.circleMarker(ll(p), { radius: i === z.velo!.sichtpunkte.length - 1 ? 4 : 2, color: FARBE_VELO, weight: 1,
        dashArray: '2 2', fillColor: '#ffffff', fillOpacity: 1, interactive: false }).addTo(eb.auswahl))
    }
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
        .bindTooltip(ende ? (i === 0 ? 'erster Sichtpunkt (am Streifen)' : `letzter Sichtpunkt (${String(z.sichtweite).replace('.', ',')} m)`) : 'Sichtpunkt')
        .addTo(eb.auswahl)
    })
  }, [rechnung, auswahl, props.neigung])

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
  // Kartenhöhe auf dem Smartphone (seit 28.10.2026, wie VeloroutenCheck): Knopf ▾/▴ schaltet 30 → 45 → 70 % der Fensterhöhe; nur
  // unter 700 px sichtbar (index.css .karte-hoehe; vorher fest 60 %, dem Panel blieben bei 375 × 812 px rund 325 px). Der Browser
  // merkt sich die Stufe (nur Bequemlichkeit).
  const [stufe, setStufe] = useState(() => {
    try { const v = Number(localStorage.getItem('fgs.karteStufe')); return KARTE_STUFEN.includes(v) ? v : 45 } catch { return 45 }
  })
  const stufeWeiter = () => setStufe(v => {
    const neu = KARTE_STUFEN[(KARTE_STUFEN.indexOf(v) + 1) % KARTE_STUFEN.length]
    try { localStorage.setItem('fgs.karteStufe', String(neu)) } catch { /* ohne Speicher: nur für diese Sitzung */ }
    return neu
  })
  useEffect(() => {
    const raf = requestAnimationFrame(() => kartenRef.current?.invalidateSize())
    return () => cancelAnimationFrame(raf)
  }, [stufe, kartenRef])
  return (
    <div className="kartenrahmen" style={{ '--karte-h': `${stufe}dvh` } as CSSProperties}>
      <PlanMuster />
      <div ref={elRef} className="karte" />
      <button type="button" className="karte-hoehe" onClick={stufeWeiter}
              aria-label={`Kartenhöhe ${stufe} % – ${stufe === 70 ? 'kleiner' : 'grösser'}`}
              title={`Karte ${stufe === 70 ? 'kleiner' : 'grösser'} (jetzt ${stufe} % der Höhe)`}>
        {stufe === 70 ? '▴' : '▾'}
      </button>
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
