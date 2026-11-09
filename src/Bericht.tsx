import { BAUM_ANNAHME, baumStammText } from './rechner/baumAnnahme'
import { ParkBerichtAnnahme, ParkBerichtDetails } from './ParkBericht'
import { parkBerichtFelder } from './rechner/parkEinfluss'
import { parkDarstellung } from './rechner/parkgeometrie'
import type { NeigungMessung } from './knotensicht/rechner/typen'
import { fgsSichtMasse, massBildPunkte } from './sichtMasse'
import { MassBild, useSichtWahl, sichtZeigen, sichtMassZeigen, fgsSichtId, tueSichtId, type SichtArt } from './Sichtfelder'
// ── Bericht (E4): Druckansicht eines Falls, als PDF über den Druckdialog des Browsers ──
//
// Eigene Ansicht über der App (die Karte bleibt darunter bestehen), A4 hoch per @media print (index.css); als Portal direkt im body. Das Kartenbild ist
// KEIN Leaflet-Ausschnitt: Kacheln laden beim Drucken oft nicht fertig und Leaflet verschiebt Ebenen mit CSS-Transforms, die
// manche Browser beim Drucken falsch setzen. Stattdessen ein einziges Luftbild per WMS (wms.geo.admin.ch, EPSG:2056) für einen
// festen Ausschnitt und darüber eine SVG-Zeichnung der Geometrie. Weil Bild und Rechnung beide in LV95 (ebene Koordinaten)
// sind, ist die Zuordnung eine reine Verschiebung und Skalierung, ohne Projektion. «Drucken» wird erst frei, wenn das Bild
// geladen ist (bzw. nicht geladen werden konnte oder nach BILD_ZEITGRENZE_MS nicht da ist: dann ohne Hintergrund, mit Hinweis).
// Nach der Zeitgrenze lädt das Bild weiter (Element bleibt, unsichtbar) und erscheint, sobald es eintrifft (
// bis dahin blieb «ohne Luftbild» stehen, auch wenn das Bild später kam); «erneut versuchen» fragt die URL neu an.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { luftbildGilt, type Fall, type Fixpunkt, type StreifenHand, type FlaechePlan, PLAN_ARTEN, streifenHerkunftText, ortOhneUebergangText, inselStandard, istTrottoirueberfahrt } from './fall'
import { planTitel, planFlaecheM2, PLAN_NAME } from './rechner/planflaechen'
import { standardGeometrie, standardAngepasst } from './rechner/standardinsel'
import { planStandardText } from './rechner/seitenraum'
import type { FallRechnung } from './rechner'
import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'
import { type Hindernis, laengsPolygon, stammPolygon } from './rechner/hindernisse'
import type { Multi } from './rechner/poly'
import { TAB1_TEXT, KURVE_SICHTWEITE } from './rechner/tempo'
import { lv95, dist, type P } from './geo'
import { wmsBildUrl } from './daten/luftbild'
import { STATUS_FARBE, STRICH_GEDECKT, UEBERGANG_TEXT, INSEL_FARBE, STRICH_INSEL, hindernisFarbe, hindernisText, INSEL_TEXT, AV_FARBEN, TUE_RAND,
  STRICH_TUE, QUELLE_FARBE } from './Karte'
import { tueGezeichnet, tueFlaeche } from './tue/karte'
import { LESENAME } from './bedarf/quellen'
import { ART, ENTFALLEN_TITEL, entfallenGrund, sichtQuelleKurz, statusText, tempoHerkunft, f1, f2, mText, streifenStatus,
  erkennungText, erkennungEmpfehlungText } from './texte'
import { erkennungAnzeige, gelaendeText, type GelaendeStand } from './erkennungGelaende'
import { sichtGelaendeText } from './sichtGelaende'
import { gelaendeProfile } from './gelaendeKarte'
import { erkennungBaender, erkennungSichtlinien } from './erkennungKarte'
import { ProfilBericht, profilWahlBericht } from './BerichtProfil'
import { fgsFahrzeuge, tueFahrzeuge, fahrzeugFarbe, type FahrzeugForm } from './fahrzeuge'
import type { EbenenObjekt } from './quellenEbenen'
import { KnotensichtBericht } from './tue/KnotensichtBlock'
import { koordText, vorzeichenText, fixpunktMasse } from './rechner/vermassung'
import { fixpunktName, fixMassTexte, naechsterStreifen, ART_TEXT } from './fixpunkt'
import { FIXPUNKT_FARBE, PLAN_FARBEN, STRICH_PLAN, NrMarke } from './Karte'
import { streifenTitel, streifenKopf, streifenArt, titelImFall, zufahrtLang, zufahrtNr, zufahrtText, entfallenNr, entfallenText, nachNr, schildLage, NUMMERN_TEXT, type ZufahrtNamen }
  from './benennung'

/** Zufahrt-Namen je Streifen (benennung.zufahrtNamen, in der App gerechnet) */
type Namen = Map<string, ZufahrtNamen>
import { ausserhalbText, nichtAbgedecktText, type Ausserhalb } from './abdeckung'
import { amtlicherText } from './daten/amtlicheUebergaenge'
import { LUFTBILD_UEBERGANG_TEXT, KEIN_STREIFEN_TEXT, NICHT_GEPRUEFT_TEXT, herkunftText } from './daten/luftbildFgs'
import { BefundblattAnzeige, GrundpruefungAnzeige, VerzeichnisBericht, ZusammenfassungAnzeige, annahmeInTabelle, bedarfKurz, eingabenTabelle, querungTitel } from './BedarfPanel'
import type { BefundBlatt } from './bedarf/befundblatt'
import { AHS_40240 } from './bedarf/tabellen'
import { BerichtQuellenTabelle } from './Datenlage'
import type { OhneTreffer } from './quellenHerangezogen'
import { BILD_BREITE_MM, bildDruckHoeheMm, datumText, ergebnisZusatzMm, legendeZeilen, netzQuelleText } from './berichtSeite1'
import type { Datenlage } from './daten/quellenregister'
import type { QuellenQualitaet } from './daten/anbieter/gemeinsam/qualitaet'

const APP_URL = 'https://fgscheck.ch/'
const RAND_M = 4                       // Rand um Streifen und Sichtfelder im Kartenbild
const MIN_M = 40                       // kleinste Kantenlänge des Ausschnitts
const BILD_PX_MAX = 1400               // Breite des WMS-Bilds höchstens (Auflösung SWISSIMAGE 0,1 m/px)
const BILD_PX_MIN = 1200               // und mindestens: A4 hoch, Kartenbreite rund 186 mm -> rund 164 dpi im Druck
const BILD_ZEITGRENZE_MS = 20000       // danach gilt das Bild als nicht geladen (Drucken ohne Hintergrund)
const VB = 1000                        // Breite der SVG-Zeichnung in Einheiten
const SCHILD_R = 13                    // Nummernschild im Kartenbild: Radius (Einheiten der SVG-Zeichnung, wie SichtweitenCheck)
const SCHILD_AB = 24                   // Mitte so weit hinter dem letzten Sichtpunkt (Sichtpunkt r 5), wie auf der Karte

type Box = [number, number, number, number]

/** Farbe des Status im Text (06.11.2026): grün frei, rot verdeckt, grau übrige; wie die Sichtfelder im Kartenbild */
const statusFarbe = (status: string): string => (status === 'frei' ? '#15803d' : STATUS_FARBE[status] ?? '#374151')
/** Strichart je Status (zusätzlich zur Farbe, damit der Bericht schwarz-weiss lesbar bleibt) */
const strich = (status: string) => (status === 'frei' ? undefined : status.startsWith('verdeckt') ? '14 7' : '3 6')

function hindernisRinge(h: Hindernis): { ringe: P[][]; linie: boolean } {
  if (h.art === 'parkfeld') return { ringe: [h.ring], linie: false }
  if (h.art === 'laengsparkierung') return { ringe: [laengsPolygon(h.linie, h.breite)], linie: false }
  if (h.art === 'baum') return { ringe: [stammPolygon(h.p, Math.max(h.stamm, 0.8))], linie: false }
  if (h.ring) return { ringe: [h.ring], linie: false }
  return { ringe: [h.linie ?? []], linie: true }
}

/** Ausschnitt: Streifen, Sichtfelder und Fixpunkte mit Rand, Seitenverhältnis Höhe/Breite zwischen 0,6 und 0,75 (Ort und Kartenbild passen zusammen auf Seite 1, A4 hoch) */
function ausschnitt(r: FallRechnung, ort: P, fix: P[] = []): Box {
  let e0 = ort[0], e1 = ort[0], n0 = ort[1], n1 = ort[1]
  const dazu = (ps: P[]) => { for (const p of ps) { e0 = Math.min(e0, p[0]); e1 = Math.max(e1, p[0]); n0 = Math.min(n0, p[1]); n1 = Math.max(n1, p[1]) } }
  for (const s of r.streifen) {
    dazu(s.umriss)
    for (const z of s.zufahrten) { for (const poly of z.feld) for (const ring of poly) dazu(ring); dazu(z.sichtpunkte) }
  }
  dazu(fix)
  e0 -= RAND_M; e1 += RAND_M; n0 -= RAND_M; n1 += RAND_M
  const weiten = (a: number, b: number, l: number): [number, number] => { const m = (a + b) / 2; return [m - l / 2, m + l / 2] }
  if (e1 - e0 < MIN_M) [e0, e1] = weiten(e0, e1, MIN_M)
  if (n1 - n0 < MIN_M * 0.6) [n0, n1] = weiten(n0, n1, MIN_M * 0.6)
  const w = e1 - e0, h = n1 - n0
  if (h / w > 0.75) [e0, e1] = weiten(e0, e1, h / 0.75)
  else if (h / w < 0.6) [n0, n1] = weiten(n0, n1, w * 0.6)
  return [e0, n0, e1, n1]
}

/** Masslinien ab Fixpunkt zum nächsten Streifen von Hand (wie auf der Karte): von, bis, Länge */
function masslinien(r: FallRechnung, fixpunkte: Fixpunkt[]): { von: P; bis: P; m: number }[] {
  const hand = r.streifenQuelle === 'hand' ? r.streifen.filter(s => s.vermassung) : []
  return fixpunkte.flatMap(f => {
    const s = naechsterStreifen(f.p, hand)
    if (!s) return []
    const m = fixpunktMasse(f.p, { p0: s.p0, p1: s.p1, breite: s.bw, umriss: s.umriss })
    return m.aufHoehe ? [] : [{ von: f.p, bis: m.kantenPunkt, m: m.laengsKanteM }]
  })
}

/** Farbprobe in der Bildlegende (nach SichtweitenCheck): Fläche, Linie, Rand, Punkt und die Zeichen des fgsCheck (Schraffur, Fahrlinie mit
 *  Sichtpunkten, Band der Erkennungsdistanz, Auto, Velo, Person, Nummernschild, Fixpunkt, Muster der Flächen (Plan)); dunkel: dunkler Grund */
function Probe({ art, farbe, rand, strich, deckung = 1, dunkel = false, fein = false }: {
  art: 'flaeche' | 'linie' | 'rand' | 'punkt' | 'schraffur' | 'fahrlinie' | 'band' | 'auto' | 'velo' | 'person' | 'schild' | 'fixpunkt' | 'muster'
  farbe: string; rand?: string; strich?: string; deckung?: number; dunkel?: boolean; fein?: boolean }) {
  return <svg className="probe" viewBox="0 0 30 14" width="30" height="14" aria-hidden="true">
    {(dunkel || art === 'fahrlinie') && <rect x="0" y="0" width="30" height="14" rx="2" fill="#4b5563" />}
    {art === 'flaeche' && <rect x="2" y="2" width="26" height="10" rx="2" fill={farbe} fillOpacity={deckung} stroke={rand ?? farbe} strokeWidth="1.5" strokeDasharray={strich} />}
    {art === 'muster' && <rect x="2" y="2" width="26" height="10" rx="2" fill={farbe} stroke={rand} strokeWidth="1.5" strokeDasharray={strich} />}
    {art === 'linie' && <line x1="2" y1="7" x2="28" y2="7" stroke={farbe} strokeWidth={fein ? 1.3 : 2.5} strokeDasharray={strich} />}
    {art === 'rand' && <rect x="2" y="2" width="26" height="10" rx="2" fill={farbe} fillOpacity={deckung < 1 ? deckung : 0} stroke={farbe} strokeWidth="2.5" strokeDasharray={strich} />}
    {art === 'punkt' && <circle cx="15" cy="7" r="5" fill={farbe} stroke={rand ?? '#111827'} strokeWidth="2" />}
    {art === 'schraffur' && <rect x="2" y="2" width="26" height="10" rx="2" fill="url(#schraffur)" stroke="#000000" strokeWidth="1" />}
    {art === 'fahrlinie' && <><line x1="2" y1="7" x2="28" y2="7" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="4 4" />
      <circle cx="10" cy="7" r="2" fill="#000000" stroke="#ffffff" strokeWidth="1" /><circle cx="22" cy="7" r="3.5" fill="#000000" stroke="#ffffff" strokeWidth="1" /></>}
    {art === 'band' && <line x1="2" y1="7" x2="28" y2="7" stroke={farbe} strokeWidth="7" strokeOpacity="0.6" strokeDasharray={strich} />}
    {art === 'auto' && <><rect x="3" y="2.5" width="24" height="9" rx="2" fill={farbe} fillOpacity="0.9" stroke="#111827" strokeWidth="1.5" /><rect x="8" y="4" width="4" height="6" fill="#ffffff" /></>}
    {art === 'velo' && <g transform="translate(2 1.5) scale(0.43)"><rect x="2" y="7" width="20" height="6" rx="3" fill={farbe} stroke="#ffffff" strokeWidth="1.5" />
      <rect x="38" y="7" width="20" height="6" rx="3" fill={farbe} stroke="#ffffff" strokeWidth="1.5" /><rect x="18" y="8.5" width="24" height="3" fill={farbe} />
      <rect x="40" y="1" width="3" height="18" rx="1.5" fill={farbe} /><circle cx="27" cy="10" r="5" fill={farbe} stroke="#ffffff" strokeWidth="1.5" /></g>}
    {art === 'person' && <><ellipse cx="14" cy="7" rx="4" ry="6" fill={AV_FARBEN.Trottoir} stroke="#334155" strokeWidth="1.5" /><circle cx="15" cy="7" r="3" fill="#475569" stroke="#ffffff" strokeWidth="1" /></>}
    {art === 'schild' && <><circle cx="15" cy="7" r="6" fill={farbe} stroke={rand} strokeWidth="1.8" /><text x="15" y="9.5" fontSize="7.5" fontWeight="700" fill={rand} textAnchor="middle">1</text></>}
    {art === 'fixpunkt' && <><rect x="9" y="1" width="12" height="12" fill="#ffffff" fillOpacity="0.85" stroke={farbe} strokeWidth="1.5" />
      <path d="M11,3L19,11M19,3L11,11" stroke={farbe} strokeWidth="1.5" /></>}
  </svg>
}
/** Hindernisart für die Legende: «Parkfeld Auto», «Baum», … */
function hindernisArtText(h: Hindernis): string {
  const klasse: Record<string, string> = { auto: 'Auto', velo: 'Velo', motorrad: 'Motorrad' }
  const art: Record<string, string> = { laengsparkierung: 'Längsparkierung', baum: 'Baum', hecke: 'Hecke', mauer: 'Mauer', uebrige: 'übriges Hindernis', insel: 'Insel von Hand' }
  const q = h.quelle === 'hand' ? ' (von Hand)' : h.quelle === 'osm' ? ' (OSM)' : ' (Kataster)'
  return (h.art === 'parkfeld' ? `Parkfeld ${klasse[h.klasse] ?? h.klasse}` : art[h.art] ?? h.art) + (h.art === 'insel' ? '' : q) + (h.art === 'baum' ? `; ${baumStammText(h)}` : '')
}
/** Text je Fahrzeugsymbol in der Legende */
function fahrzeugLegende(f: FahrzeugForm): string {
  if (f.rolle === 'fb') return `Trottoirüberfahrt: wartendes Fahrzeug, Sicht ${f.phase === 'trottoir' ? 'aufs Trottoir' : 'auf die Fahrbahn'}`
  if (f.rolle === 'fa') return 'Trottoirüberfahrt: Fahrzeug mit Vortritt am Ende der Sichtweite'
  if (f.rolle === 'warte') return 'Wartende Person am Streifenende'
  return f.art === 'velo' ? 'Velo am Ende seiner Sicht' : 'Auto am Ende der nötigen Sicht je Zufahrt'
}

function BerichtKarte({ r, hindernisse, fixpunkte, ort, onBereit, namen, hand, plan = [], neigung = null, gelaende = null, zusatzMm = 0 }: {
  zusatzMm?: number              // Höhe der Zusatzzeilen unter «Ergebnis» (berichtSeite1.ts)
  neigung?: Readonly<Record<string, NeigungMessung>> | null
  gelaende?: Readonly<Record<string, GelaendeStand>> | null   // Geländeprüfung der Erkennungsdistanz (Bänder, Sichtlinien)
  r: FallRechnung; hindernisse: Hindernis[]; fixpunkte: Fixpunkt[]; ort: P; onBereit: (s: 'laedt' | 'ok' | 'fehler') => void
  namen: Namen; hand: StreifenHand[]
  plan?: FlaechePlan[]           // Flächen (Plan) von Hand: schraffiert unter Sichtfeldern und Streifen
}) {
  const [sicht] = useSichtWahl()
  const masse = useMemo(() => fgsSichtMasse(r, neigung), [r, neigung])
  // Erkennungsdistanz (06.11.2026): Band je gerade Zufahrt bis zum Soll; Sichtlinien nur, wo die Erkennungsdistanz das Soll nicht erreicht
  const erkBaender = useMemo(() => r.streifen.flatMap(st => erkennungBaender(st, gelaende)), [r, gelaende])
  const sichtlinien = useMemo(() => r.streifen.flatMap(st => st.zufahrten
    .filter(z => erkBaender.find(b => b.zufahrt === `${z.fgsId}|${z.zufahrt}`)?.fehlt)
    .flatMap(z => erkennungSichtlinien(z, gelaende))), [r, gelaende, erkBaender])
  const bandPunkte = useMemo(() => erkBaender.flatMap(b => [...b.gruen, ...(b.gelb ?? []), ...(b.fehlt?.linie ?? [])]), [erkBaender])
  // Fahrzeuge und wartende Personen wie auf der Karte (fahrzeuge.ts; 06.11.2026 im Bericht nachgeführt): Knotensicht der
  // Trottoirüberfahrt, je Zufahrt ein Auto am Ende der nötigen Sicht, Velo am Ende seiner Sicht, Personen an den Streifenenden
  const fahrzeuge = useMemo<FahrzeugForm[]>(() => r.streifen.flatMap(st => [...tueFahrzeuge(st), ...fgsFahrzeuge(st, neigung)]), [r, neigung])
  const box = useMemo(() => {
    const fix = [...fixpunkte.map(f => f.p), ...bandPunkte]
    let box = ausschnitt(r, ort, fix)
    if (sicht.masse) for (let i = 0; i < 3; i++) box = ausschnitt(r, ort, [...fix,
      ...massBildPunkte(masse.filter(m => sichtMassZeigen(sicht, m)), box[2] - box[0])])
    return box
  }, [r, ort, fixpunkte, masse, sicht, bandPunkte])
  const [e0, n0, e1, n1] = box
  const wM = e1 - e0, hM = n1 - n0
  // Breite in Pixeln: 0,1 m/px, begrenzt auf BILD_PX_MIN..BILD_PX_MAX; Höhe aus derselben m/px (gleiches Seitenverhältnis)
  const bw = Math.min(BILD_PX_MAX, Math.max(BILD_PX_MIN, Math.round(wM / 0.1)))
  const mpx = wM / bw
  const bh = Math.round(hM / mpx)
  // erneut versuchen: dieselbe Anfrage mit Zusatzparameter (der Dienst übergeht ihn; der Browser fragt neu an)
  const [versuch, setVersuch] = useState(0)
  const basis = wmsBildUrl(box, bw, bh)
  const url = versuch ? `${basis}&FGSVERSUCH=${versuch}` : basis
  const s = VB / wM, vh = hM * s
  const xy = (p: P) => `${((p[0] - e0) * s).toFixed(1)},${((n1 - p[1]) * s).toFixed(1)}`
  const pfad = (ringe: P[][], zu = true) => ringe.filter(x => x.length).map(x => 'M' + x.map(xy).join('L') + (zu ? 'Z' : '')).join(' ')
  const multi = (m: Multi) => pfad(m.flat())
  // Ladezustand je Bild-URL (ändert sich der Ausschnitt, gilt das neue Bild als nicht geladen): laedt, ok, fehler (onError) bzw.
  // zeit (nach BILD_ZEITGRENZE_MS ohne Antwort: Drucken ohne Hintergrund frei, das Bild lädt weiter und erscheint mit onLoad)
  const [geladen, setGeladen] = useState<{ url: string; stand: 'ok' | 'fehler' | 'zeit' } | null>(null)
  const status: 'laedt' | 'ok' | 'fehler' | 'zeit' = geladen?.url !== url ? 'laedt' : geladen.stand
  useEffect(() => { onBereit(status === 'zeit' ? 'fehler' : status) }, [status, onBereit])
  // Zeitgrenze je Bild-URL (aufgeräumt bei neuer URL und beim Schliessen); ein späteres onLoad bzw. onError gilt weiter
  useEffect(() => {
    const t = setTimeout(() => setGeladen(g => (g?.url === url ? g : { url, stand: 'zeit' })), BILD_ZEITGRENZE_MS)
    return () => clearTimeout(t)
  }, [url])
  const linien = useMemo(() => masslinien(r, fixpunkte), [r, fixpunkte])
  // Mittelinsel (Standard): Signalmast im Kopf der Furt-Seite (nur Hinweis; nicht bei von Hand veränderter Form)
  const masten = plan.filter(fp => inselStandard(fp)?.teil === 'kopf' && !standardAngepasst(fp))
    .map(fp => standardGeometrie(inselStandard(fp)!).mast).filter((m): m is P => !!m)
  // Massstab: runde Länge um ein Fünftel der Breite
  const mass = [5, 10, 20, 25, 50, 100, 200].reduce((b, x) => (Math.abs(x - wM / 5) < Math.abs(b - wM / 5) ? x : b), 10)
  const halo = { stroke: '#ffffff', strokeWidth: 5, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const }
  // gedeckte Abbiegezufahrten (nur mit GEDECKT_RECHNEN, standardmässig aus), beschriftet wie im Bild
  const bildTitel = (fid: string) => { const st = r.streifen.find(x => x.fgsId === fid); return streifenTitel(fid, hand, st ? streifenArt(st) : 'fgs') }
  const gedeckte = r.streifen.flatMap(st => st.zufahrten).filter(z => z.deckung)
    .map(z => `${r.streifen.length > 1 ? `${bildTitel(z.fgsId)}, ` : ''}${zufahrtText(namen.get(z.fgsId), z.zufahrt)}`)
  // Nummernschilder (benennung.ts): hinter dem letzten Sichtpunkt, bei mehreren Streifen mit dem Streifen daneben; Schlüssel der
  // Nummern unter dem Bild (je Streifen in der Reihenfolge der Nummern)
  const mehrere = r.streifen.length > 1
  const schilder = r.streifen.flatMap(st => st.zufahrten.flatMap(z => {
    const nr = zufahrtNr(namen.get(st.fgsId), z.zufahrt), lage = schildLage(z)
    if (!nr || !lage) return []
    const [x, y] = xy(lage.p).split(',').map(Number)
    // am Bildrand ganz ins Bild (der Rand RAND_M reicht bei grossen Ausschnitten nicht immer für das Schild)
    const imBild = (v: number, max: number) => Math.min(max - SCHILD_R - 2, Math.max(SCHILD_R + 2, v))
    return [{ key: z.fgsId + z.zufahrt, nr, x: imBild(x + lage.aussen[0] * SCHILD_AB, VB), y: imBild(y - lage.aussen[1] * SCHILD_AB, vh),
      streifen: mehrere ? streifenTitel(st.fgsId, hand, streifenArt(st)) : null }]
  }))
  // von Hand gestrichene Zufahrten behalten ihre Nummer (ohne Schild): im Schlüssel mit «(gestrichen)»
  const schluessel = r.streifen.map(st => {
    const n = namen.get(st.fgsId)
    const teile = [...st.zufahrten.map(z => ({ nr: Number(zufahrtNr(n, z.zufahrt)), t: zufahrtText(n, z.zufahrt) })),
      ...st.entfallen.filter(e => entfallenNr(n, e)).map(e => ({ nr: Number(entfallenNr(n, e)), t: `${entfallenText(n, e)} (gestrichen)` }))]
      .sort((a, b) => (a.nr || Number.MAX_SAFE_INTEGER) - (b.nr || Number.MAX_SAFE_INTEGER))
    return teile.length ? `${mehrere ? `${streifenTitel(st.fgsId, hand, streifenArt(st))}: ` : ''}${teile.map(x => x.t).join(', ')}` : ''
  }).filter(Boolean)
  // Legende (06.11.2026, nach SichtweitenCheck): je Zeile eine Farbprobe und ein kurzer Text; nur, was im Bild vorkommt
  const zufahrten = r.streifen.flatMap(st => st.zufahrten)
  const autoDa = zufahrten.filter(z => sichtZeigen(sicht, 'auto', fgsSichtId(z)))
  const veloDa = zufahrten.filter(z => z.velo && sichtZeigen(sicht, 'velo', fgsSichtId(z)))
  const tueArten = [...new Set(r.streifen.flatMap(st => (tueGezeichnet(st.knotensicht) ? st.knotensicht.karte.dreiecke
    .filter(d => sichtZeigen(sicht, d.art, tueSichtId(st.fgsId, d.lage))).map(d => d.art) : [])))]
  // je Status der gezeigten Sichtfelder ein Eintrag (rechner/pruefen.konfliktFelder: «verdeckt» heisst Auto-Parkfeld)
  const STATUS_LEGENDE: Record<string, string> = { frei: 'Sichtfeld frei', verdeckt: 'Sichtfeld verdeckt durch ein Auto-Parkfeld',
    verdeckt_gebaeude: 'Sichtfeld verdeckt durch ein Gebäude', verdeckt_gelaende: 'Sichtfeld verdeckt durch das Gelände',
    verdeckt_hindernis: 'Sichtfeld verdeckt durch ein Hindernis (Hecke, Mauer, Fläche von Hand)', verdeckt_baum: 'Sichtfeld verdeckt durch einen Baum',
    verdeckt_zweirad: 'Sichtfeld verdeckt durch ein Zweirad-Parkfeld (Hinweis)' }
  const statusZeilen = [...new Set(autoDa.map(z => z.status))]
  const hindArten = [...new Map(hindernisse.filter(h => !r.seitenraumErsetzt?.some(x => x.id === h.id))
    .map(h => [hindernisFarbe(h) + hindernisArtText(h), { farbe: hindernisFarbe(h), text: hindernisArtText(h) }])).values()]
  const fzArten = [...new Map(fahrzeuge.map(f => { const k = fahrzeugLegende(f); return [k, { farbe: fahrzeugFarbe(f), art: f.art, text: k }] })).values()]
  const bandArten = { gruen: erkBaender.some(b => b.gruen.length >= 2), gelb: erkBaender.some(b => b.gelb), rot: erkBaender.some(b => b.fehlt?.art === 'verdeckt'),
    grau: erkBaender.some(b => b.fehlt && b.fehlt.art !== 'verdeckt') }
  const linienArten = ([['frei', '#15803d', 'grün frei'], ['bewuchs', '#ca8a04', 'gelb nicht sicher'], ['verdeckt', '#dc2626', 'rot verdeckt']] as const)
    .filter(([a]) => sichtlinien.some(l => l.art === a))
  const legende: { probe: React.ReactNode; text: string; breit?: true }[] = [
    ...(schluessel.length > 0 ? [{ probe: <Probe art="schild" farbe="#ffffff" rand="#0f172a" />, text: `${NUMMERN_TEXT} nach der Herkunft der Fahrzeuge` +
      `${mehrere ? ', je Streifen (Streifen neben der Nummer)' : ''}: ${schluessel.join('; ')}. Abbieger heissen nach der Strasse, aus der sie abbiegen.`, breit: true as const }] : []),
    ...(r.streifen.some(st => !st.querung && !st.trottoirueberfahrt) ? [{ probe: <Probe art="flaeche" farbe="#fde047" rand="#000000" />, text: 'Fussgängerstreifen' }] : []),
    ...(r.streifen.some(st => st.querung) ? [{ probe: <Probe art="rand" farbe="#ffffff" strich="6 4" dunkel />, text: r.streifen.every(st =>
      !st.querung || st.querung.typ === 'begegnungszone') ? 'Querung in der Begegnungszone (ohne Balken)' : 'Querung ohne Vortritt (ohne Balken)' }] : []),
    ...(r.streifen.some(st => st.trottoirueberfahrt) ? [{ probe: <Probe art="flaeche" farbe={AV_FARBEN.Trottoir} rand={TUE_RAND} strich="6 4" />, text: 'Trottoirüberfahrt (nicht geprüft), Streifen von Hand als Achse' }] : []),
    ...(r.streifen.some(st => !st.trottoirueberfahrt && st.ann.length) ? [{ probe: <Probe art="flaeche" farbe="#0ea5e9" rand="#0369a1" deckung={0.4} />, text: 'Annäherungsbereiche' }] : []),
    ...statusZeilen.map(st => ({ probe: <Probe art="rand" farbe={STATUS_FARBE[st] ?? '#10b981'} strich={strich(st)} deckung={0.15} />, text: STATUS_LEGENDE[st] ?? 'Sichtfeld nicht geprüft' })),
    ...(autoDa.some(z => z.konflikte.length) ? [{ probe: <Probe art="schraffur" farbe="#dc2626" />, text: 'Hindernis im Sichtfeld (schraffiert)' }] : []),
    ...(autoDa.length ? [{ probe: <Probe art="fahrlinie" farbe="#ffffff" />, text: 'Fahrlinie (weiss gestrichelt) mit Sichtpunkten; dahinter die Nummer der Zufahrt' }] : []),
    ...(veloDa.length ? [{ probe: <Probe art="rand" farbe="#0f766e" strich="6 4" deckung={0.1} />, text: 'Sicht vom Velo: Sichtfeld und Sichtpunkte (fein gestrichelt)' }] : []),
    ...tueArten.map(a => ({ probe: <><Probe art="rand" farbe={a === 'velo' ? '#0f766e' : '#16a34a'} strich={a === 'velo' ? '6 4' : a === 'trottoir' ? '2 4' : undefined} deckung={0.15} />
      <Probe art="rand" farbe="#dc2626" strich={a === 'velo' ? '6 4' : a === 'trottoir' ? '2 4' : undefined} deckung={0.15} /></>,
      text: `Knotensicht der Trottoirüberfahrt, ${a === 'velo' ? 'Velo' : a === 'trottoir' ? 'Trottoir' : 'Fahrbahn'}: frei, rot verdeckt` })),
    ...fzArten.map(x => ({ probe: <Probe art={x.art === 'person' ? 'person' : x.art === 'velo' ? 'velo' : 'auto'} farbe={x.farbe} />, text: x.text })),
    ...(erkBaender.length ? [{ probe: <>{bandArten.gruen && <Probe art="band" farbe="#16a34a" />}{bandArten.gelb && <Probe art="band" farbe="#eab308" />}
      {bandArten.rot && <Probe art="band" farbe="#dc2626" />}{bandArten.grau && <Probe art="band" farbe="#9ca3af" strich="4 3" />}</>,
      text: `Erkennungsdistanz auf der Fahrlinie bis zum Soll: ${[bandArten.gruen && 'grün frei', bandArten.gelb && 'gelb nicht sicher (Bewuchs)',
        bandArten.rot && 'rot verdeckt', bandArten.grau && 'grau gestrichelt nicht geprüft'].filter(Boolean).join(', ')}` }] : []),
    ...(sichtlinien.length ? [{ probe: <>{linienArten.map(([a, farbe]) => <Probe key={a} art="linie" farbe={farbe} fein />)}</>,
      text: `Geprüfte Sichtlinien auf die Markierung, wo das Soll nicht erreicht ist: ${linienArten.map(x => x[2]).join(', ')}` }] : []),
    ...hindArten.map(x => ({ probe: <Probe art="flaeche" farbe={x.farbe} rand={x.farbe} deckung={0.35} />, text: `Hindernis: ${x.text}` })),
    ...((r.seitenraumErsetzt ?? []).length ? [{ probe: <Probe art="rand" farbe={QUELLE_FARBE.hand} strich="4 4" deckung={0.08} />, text: 'Parkierung gestrichelt: durch den vorgezogenen Seitenraum ersetzt' }] : []),
    ...((r.inseln ?? []).length ? [{ probe: <Probe art="rand" farbe={INSEL_FARBE} strich="6 4" deckung={0.15} />, text: INSEL_TEXT }] : []),
    ...[...new Set(plan.map(fp => fp.art))].map(a => ({ probe: <Probe art="muster" farbe={`url(#bericht-plan-${a})`} rand={PLAN_FARBEN[a].linie} strich="6 4" />,
      text: `Fläche (Plan) von Hand: ${PLAN_NAME[a]}; ersetzt die AV-Bodenbedeckung darunter` })),
    ...(masten.length ? [{ probe: <Probe art="punkt" farbe="#000000" rand="#ffffff" />, text: 'Signalmast einer Mittelinsel (nur Hinweis)' }] : []),
    ...(fixpunkte.length ? [{ probe: <Probe art="fixpunkt" farbe={FIXPUNKT_FARBE} />, text: 'Fixpunkt; gestrichelt mit Länge: Mass bis zur Streifenkante' }] : []),
    ...(gedeckte.length ? [{ probe: <Probe art="linie" farbe="#ffffff" strich={STRICH_GEDECKT} dunkel />, text: `Abbiegezufahrt${gedeckte.length > 1 ? 'en' : ''} ${gedeckte.join(', ')} mitgeprüft (Fahrlinie weiss gepunktet)` }] : []),
  ]
  const bildH = bildDruckHoeheMm(legendeZeilen(legende.filter(l => !l.breit).map(l => l.text), legende.filter(l => l.breit).map(l => l.text)), r.streifen.length, BILD_BREITE_MM * bh / bw, zusatzMm)
  // Satz zu den Sichtfeldern: je Art die Zufahrtsnummern, dazu die ausgeblendeten (wie im SichtweitenCheck)
  const sichtSatz = (() => {
    const an: string[] = [], aus: string[] = []
    const nr = (z: ZufahrtErgebnis) => `${mehrere ? `${streifenTitel(z.fgsId, hand, streifenArt(r.streifen.find(st => st.fgsId === z.fgsId)!))} ` : ''}${zufahrtNr(namen.get(z.fgsId), z.zufahrt) || zufahrtText(namen.get(z.fgsId), z.zufahrt)}`
    const gruppe = (name: string, zs: ZufahrtErgebnis[], art: SichtArt) => {
      const ja = zs.filter(z => sichtZeigen(sicht, art, fgsSichtId(z))), nein = zs.filter(z => !sichtZeigen(sicht, art, fgsSichtId(z)))
      if (ja.length) an.push(`${name} ${ja.map(nr).join(', ')}`)
      if (nein.length) aus.push(`${name} ${nein.map(nr).join(', ')}`)
    }
    const nachNummer = [...zufahrten].sort((a, b) => a.fgsId.localeCompare(b.fgsId) ||
      (Number(zufahrtNr(namen.get(a.fgsId), a.zufahrt)) || 99) - (Number(zufahrtNr(namen.get(b.fgsId), b.zufahrt)) || 99))
    gruppe('Auto', nachNummer, 'auto'); gruppe('Velo', nachNummer.filter(z => z.velo), 'velo')
    for (const st of r.streifen) if (tueGezeichnet(st.knotensicht)) for (const d of st.knotensicht.karte.dreiecke) {
      const t = `Trottoirüberfahrt ${d.art === 'velo' ? 'Velo' : d.art === 'trottoir' ? 'Trottoir' : 'Fahrbahn'}`
      ;(sichtZeigen(sicht, d.art, tueSichtId(st.fgsId, d.lage)) ? an : aus).push(t)
    }
    if (!an.length && !aus.length) return ''
    return `Sichtfelder im Bild: ${an.length ? [...new Set(an)].join('; ') : 'keine'}${aus.length ? `; ausgeblendet: ${[...new Set(aus)].join('; ')}` : ''}${sicht.masse ? '; mit Vermassung' : ''}.`
  })()
  return (
    <figure className="bericht-karte">
      {/* Druck: Bildhöhe nach der Länge der Legende (berichtSeite1.ts, index.css --bild-max-breite), damit Ort, Ergebnis, Kartenbild und
          Legende zusammen auf Seite 1 bleiben; am Bildschirm volle Breite */}
      <div className="bericht-bild" style={{ aspectRatio: `${bw} / ${bh}`, '--bild-max-breite': `calc(${bildH}mm * ${(bw / bh).toFixed(4)})` } as React.CSSProperties}>
        {(status === 'fehler' || status === 'zeit') && <div className="bericht-ohne-bild klein">ohne Luftbild</div>}
        {status !== 'fehler' && <img key={url} src={url} alt="Luftbild SWISSIMAGE des Ausschnitts"
          style={status === 'zeit' ? { visibility: 'hidden' } : undefined}
          onLoad={() => setGeladen({ url, stand: 'ok' })} onError={() => setGeladen({ url, stand: 'fehler' })} />}
        <svg viewBox={`0 0 ${VB} ${vh.toFixed(1)}`} preserveAspectRatio="none" aria-label="Streifen, Sichtfelder, Sichtpunkte und Hindernisse">
          <defs>
            <pattern id="schraffur" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="#dc2626" fillOpacity="0.35" />
              <line x1="0" y1="0" x2="0" y2="8" stroke="#000000" strokeWidth="2.5" />
            </pattern>
            {/* Flächen (Plan): eigene Muster im Bericht (die der Karte liegen im ausgeblendeten App-Teil) */}
            {PLAN_ARTEN.map(a => (
              <pattern key={a} id={`bericht-plan-${a}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <rect width="10" height="10" fill={PLAN_FARBEN[a].flaeche} fillOpacity="0.6" />
                <line x1="0" y1="0" x2="0" y2="10" stroke={PLAN_FARBEN[a].linie} strokeWidth="2.5" />
              </pattern>
            ))}
          </defs>
          {plan.map(fp => (
            <path key={'pl' + fp.id} d={pfad([fp.ring])} fill={`url(#bericht-plan-${fp.art})`} stroke={PLAN_FARBEN[fp.art].linie}
              strokeWidth={2.5} strokeDasharray={STRICH_PLAN.split(' ').map(x => Number(x) * 2).join(' ')} />
          ))}
          {masten.map((m, i) => {
            const [x, y] = xy(m).split(',').map(Number)
            return <circle key={'mast' + i} cx={x} cy={y} r={6} fill="#000000" stroke="#ffffff" strokeWidth={2} />
          })}
          {r.streifen.flatMap(st => st.zufahrten).filter(z => sichtZeigen(sicht, 'auto', fgsSichtId(z))).map(z => (
            <path key={'f' + z.fgsId + z.zufahrt} d={multi(z.feld)} fillRule="evenodd" fill={STATUS_FARBE[z.status] ?? '#10b981'} fillOpacity={0.14}
              stroke={STATUS_FARBE[z.status] ?? '#10b981'} strokeWidth={2.5} strokeDasharray={strich(z.status)} />
          ))}
          {r.streifen.flatMap(st => st.zufahrten).map(z => sichtZeigen(sicht, 'velo', fgsSichtId(z)) && z.velo && <g key={'vf' + z.fgsId + z.zufahrt}>
            <path d={multi(z.velo.feld)} fillRule="evenodd" fill="#0f766e" fillOpacity={0.1} stroke="#0f766e" strokeWidth={2} strokeDasharray="6 4" />
            <polyline points={z.velo.sichtpunkte.map(xy).join(' ')} fill="none" stroke="#0f766e" strokeWidth={1.5} strokeDasharray="3 4" />
          </g>)}
          {r.streifen.map(st => tueGezeichnet(st.knotensicht) && st.knotensicht.karte.dreiecke.filter(d => sichtZeigen(sicht, d.art, tueSichtId(st.fgsId, d.lage))).map((d, i) =>
            <g key={'ks' + st.fgsId + i}>{[[d.frei, d.art === 'velo' ? '#0f766e' : '#16a34a'], [d.verdeckt, '#dc2626']].map(([ring, farbe], k) =>
              <path key={k} d={pfad([ring as P[]])} fill={farbe as string} fillOpacity={0.15} stroke={farbe as string} strokeWidth={2}
                strokeDasharray={d.art === 'velo' ? '6 4' : d.art === 'trottoir' ? '2 4' : undefined} />)}</g>))}
          {parkBerichtFelder(berichtParkfelder(r), r).map(h => h.art === 'parkfeld' && h.parkPruefung?.status === 'ergaenzt' &&
            <path key={'kataster' + h.id} d={pfad([h.parkPruefung.original])} fill="none" stroke="#64748b" strokeWidth={2} strokeDasharray="3 4" />)}
          {hindernisse.map((h, hi) => {
            const { ringe, linie } = hindernisRinge(h)
            const farbe = hindernisFarbe(h)
            // Parkierung unter einem vorgezogenen Seitenraum: gestrichelt, blass (entfällt in der Rechnung)
            const ersetzt = r.seitenraumErsetzt?.some(x => x.id === h.id)
            return <path key={'h' + h.id + hi} d={pfad(ringe, !linie)} fill={linie ? 'none' : farbe} fillOpacity={ersetzt ? 0.08 : 0.35} stroke={farbe}
              strokeWidth={linie ? 5 : 2} strokeDasharray={ersetzt ? '4 4' : undefined} strokeOpacity={ersetzt ? 0.6 : undefined} />
          })}
          {(r.inseln ?? []).map((z, i) => (
            <path key={'i' + i} d={pfad([z.ring])} fill={INSEL_FARBE} fillOpacity={0.15} stroke={INSEL_FARBE} strokeWidth={2.5}
              strokeDasharray={STRICH_INSEL.split(' ').map(x => Number(x) * 2).join(' ')} />
          ))}
          {r.streifen.flatMap(st => st.zufahrten).filter(z => sichtZeigen(sicht, 'auto', fgsSichtId(z))).flatMap(z => z.konflikte.map((k, i) => (
            <path key={'k' + z.fgsId + z.zufahrt + i} d={multi(k.geom)} fillRule="evenodd" fill="url(#schraffur)" stroke="#000000" strokeWidth={1.5} />
          )))}
          {r.streifen.map(st => (
            <g key={'s' + st.fgsId}>
              {!st.trottoirueberfahrt && st.ann.map((a, i) => <path key={i} d={pfad(a)} fill="#0ea5e9" fillOpacity={0.35} stroke="#0369a1" strokeWidth={1} />)}
              {st.trottoirueberfahrt
                // Trottoirüberfahrt (27.10.2026): gerechnete Überfahrt (Knotensicht), der Streifen von Hand nur als Achse
                ? <>{tueFlaeche(st.knotensicht) && <path d={pfad([tueFlaeche(st.knotensicht)!])} fill={AV_FARBEN.Trottoir} fillOpacity={0.9}
                  stroke={TUE_RAND} strokeWidth={2.5} strokeDasharray={STRICH_TUE.split(' ').map(x => Number(x) * 2).join(' ')} />}
                  <polyline points={[st.p0, st.p1].map(xy).join(' ')} fill="none" stroke={TUE_RAND} strokeWidth={2} /></>
                : st.querung
                ? <path d={pfad([st.umriss])} fill="#ffffff" fillOpacity={0.3} stroke="#000000" strokeWidth={2.5} strokeDasharray="10 6" />
                : <path d={pfad([st.umriss])} fill="#fde047" fillOpacity={0.7} stroke="#000000" strokeWidth={2} />}
            </g>
          ))}
          {/* Erkennungsdistanz (06.11.2026): Band entlang der Fahrlinie bis zum Soll, dünne Sichtlinien bei zu kurzer Erkennungsdistanz */}
          {erkBaender.map(b => <g key={'eb' + b.zufahrt}>
            {b.gruen.length >= 2 && <polyline points={b.gruen.map(xy).join(' ')} fill="none" stroke="#16a34a" strokeWidth={7} strokeOpacity={0.55} strokeLinecap="butt" />}
            {b.gelb && <polyline points={b.gelb.map(xy).join(' ')} fill="none" stroke="#eab308" strokeWidth={7} strokeOpacity={0.6} strokeLinecap="butt" />}
            {b.fehlt && <polyline points={b.fehlt.linie.map(xy).join(' ')} fill="none" stroke={b.fehlt.art === 'verdeckt' ? '#dc2626' : '#9ca3af'} strokeWidth={7}
              strokeOpacity={0.6} strokeLinecap="butt" strokeDasharray={b.fehlt.art === 'verdeckt' ? undefined : '6 6'} />}
          </g>)}
          {sichtlinien.map((l, i) => <line key={'sl' + i} x1={xy(l.auge).split(',')[0]} y1={xy(l.auge).split(',')[1]} x2={xy(l.ziel).split(',')[0]} y2={xy(l.ziel).split(',')[1]}
            stroke={l.art === 'frei' ? '#15803d' : l.art === 'bewuchs' ? '#ca8a04' : '#dc2626'} strokeWidth={1.2} strokeOpacity={0.85} />)}
          {r.streifen.flatMap(st => st.zufahrten).filter(z => sichtZeigen(sicht, 'auto', fgsSichtId(z))).map(z => (
            <g key={'p' + z.fgsId + z.zufahrt}>
              <polyline points={z.spur.map(xy).join(' ')} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeDasharray={z.deckung ? STRICH_GEDECKT : '5 5'} />
              {z.sichtpunkte.map((p, i) => {
                const ende = i === 0 || i === z.sichtpunkte.length - 1
                const [x, y] = xy(p).split(',').map(Number)
                return <circle key={i} cx={x} cy={y} r={ende ? 5 : 2.5} fill="#000000" stroke="#ffffff" strokeWidth={1.2} />
              })}
            </g>
          ))}
          {/* Fahrzeuge: Autos als Umriss (LV95) mit weisser Scheibe, Velo und Person als Piktogramm fester Grösse, gedreht in Fahrtrichtung */}
          {fahrzeuge.map((f, i) => {
            const farbe = fahrzeugFarbe(f)
            if (f.art === 'auto' && f.umriss && f.scheibe) return <g key={'fz' + i}>
              <path d={pfad([f.umriss])} fill={farbe} fillOpacity={0.9} stroke="#111827" strokeWidth={1.5} />
              <path d={pfad([f.scheibe])} fill="#ffffff" fillOpacity={0.9} stroke="#ffffff" strokeWidth={1} />
            </g>
            const n = Math.hypot(f.richtung[0], f.richtung[1]) || 1
            const grad = Math.atan2(-f.richtung[1] / n, f.richtung[0] / n) * 180 / Math.PI
            const [x, y] = xy(f.mitte).split(',').map(Number)
            if (f.art === 'velo') {
              const k = 26 / 60, rand = f.rolle === 'fb' ? '#111827' : '#ffffff', st = f.rolle === 'fa' ? '3 2' : undefined
              return <g key={'fz' + i} transform={`translate(${x} ${y}) rotate(${grad.toFixed(1)}) scale(${k}) translate(-30 -10)`}>
                <rect x={2} y={7} width={20} height={6} rx={3} fill={farbe} stroke={rand} strokeWidth={1.5} strokeDasharray={st} />
                <rect x={38} y={7} width={20} height={6} rx={3} fill={farbe} stroke={rand} strokeWidth={1.5} strokeDasharray={st} />
                <rect x={18} y={8.5} width={24} height={3} fill={farbe} stroke={rand} strokeWidth={1} />
                <rect x={40} y={1} width={3} height={18} rx={1.5} fill={farbe} stroke={rand} strokeWidth={1} />
                <circle cx={27} cy={10} r={5} fill={farbe} stroke={rand} strokeWidth={1.5} />
              </g>
            }
            const k = 14 / 20
            return <g key={'fz' + i} transform={`translate(${x} ${y}) rotate(${grad.toFixed(1)}) scale(${k}) translate(-10 -10)`}>
              <ellipse cx={9} cy={10} rx={5} ry={8} fill={AV_FARBEN.Trottoir} stroke="#334155" strokeWidth={1.5} />
              <circle cx={10} cy={10} r={4} fill="#475569" stroke="#ffffff" strokeWidth={1} />
            </g>
          })}
          {/* Nummernschilder wie auf der Karte: weisser Kreis, dunkler Rand und Zahl (im Bericht keine gewählte Zufahrt) */}
          {schilder.map(sc => <g key={'nr' + sc.key}>
            <circle cx={sc.x} cy={sc.y} r={SCHILD_R} fill="#ffffff" stroke="#0f172a" strokeWidth={2.5} />
            <text x={sc.x} y={sc.y} fontSize={15} fontWeight={700} fill="#0f172a" textAnchor="middle" dominantBaseline="central">{sc.nr}</text>
            {sc.streifen && <text x={sc.x + SCHILD_R + 4} y={sc.y} fontSize={15} fontWeight={700} fill="#000000" dominantBaseline="central"
              {...halo}>{sc.streifen}</text>}
          </g>)}
          {linien.map((l, i) => {
            const [x0, y0] = xy(l.von).split(',').map(Number), [x1, y1] = xy(l.bis).split(',').map(Number)
            return <g key={'m' + i}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={FIXPUNKT_FARBE} strokeWidth={2.5} strokeDasharray="8 6" />
              <text x={(x0 + x1) / 2 + 6} y={(y0 + y1) / 2 - 6} fontSize={18} fontWeight={700} fill={FIXPUNKT_FARBE} {...halo}>
                {f2(l.m)} m</text>
            </g>
          })}
          {fixpunkte.map(f => {
            const [x, y] = xy(f.p).split(',').map(Number)
            return <g key={'x' + f.id}>
              <rect x={x - 7} y={y - 7} width={14} height={14} fill="#ffffff" fillOpacity={0.85} stroke={FIXPUNKT_FARBE} strokeWidth={2} />
              <path d={`M${x - 5},${y - 5}L${x + 5},${y + 5}M${x + 5},${y - 5}L${x - 5},${y + 5}`} stroke={FIXPUNKT_FARBE} strokeWidth={2} />
            </g>
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
          <MassBild masse={masse} wahl={sicht} xy={xy} />
        </svg>
      </div>
      <figcaption className="klein">
        <p className="legende-satz">{sichtSatz} Ausschnitt {Math.round(wM)} × {Math.round(hM)} m, Norden oben (LV95). Fahrzeuge und Personen nur zur
          Darstellung; die Ergebnisse enthalten alle berechneten Sichtarten.
          {status === 'laedt' && <span className="nicht-drucken"> Luftbild wird geladen …</span>}
          {(status === 'fehler' || status === 'zeit') && <span className="warnung"> Luftbild nicht geladen: Kartenbild ohne Hintergrund.</span>}
          {(status === 'fehler' || status === 'zeit') && <span className="nicht-drucken">
            {status === 'zeit' ? ` Noch keine Antwort nach ${BILD_ZEITGRENZE_MS / 1000} s; es erscheint, sobald es eintrifft.` : ''}{' '}
            <button className="zweit klein" onClick={() => setVersuch(v => v + 1)}>erneut versuchen</button></span>}</p>
        <ul className="bericht-legende">{legende.map((l, i) => <li key={i} className={l.breit ? 'breit' : undefined}><span className="proben">{l.probe}</span><span>{l.text}</span></li>)}</ul>
      </figcaption>
    </figure>
  )
}

/** Beschreibung einer Zufahrt-Eingabe (Schlüssel «Streifen|Kennung») mit dem Namen der Zufahrt, wenn die Rechnung sie kennt */
function zufahrtName(r: FallRechnung | null, key: string, namen: Namen, hand: StreifenHand[]): string {
  const i = key.indexOf('|'), fid = key.slice(0, i), kennung = key.slice(i + 1)
  const s = r?.streifen.find(x => x.fgsId === fid)
  const z = s?.zufahrten.find(x => x.kennung === kennung), e = s?.entfallen.find(x => x.kennung === kennung)
  const t = s ? streifenTitel(fid, hand, streifenArt(s)) : streifenTitel(fid, hand)
  return z ? `${t}, ${zufahrtText(namen.get(fid), z.zufahrt)}` : e ? `${t}, ${entfallenText(namen.get(fid), e)}` :
    `${t}, Zufahrt mit Kennung ${kennung} (ohne passende Zufahrt)`
}

/** Die Knotensicht kann entlang der Hauptstrasse weitere geladene Felder verwenden. */
function berichtParkfelder(r: FallRechnung): Hindernis[] {
  const alle = [...(r.parkAnnahmen ?? []), ...(r.parkPruefflaechen ?? []), ...r.streifen.flatMap(s =>
    s.knotensicht && 'richtungen' in s.knotensicht ? s.knotensicht.parkPruefflaechen ?? [] : [])]
  const gesehen = new Set<string>()
  return alle.filter(h => { if (gesehen.has(h.id)) return false; gesehen.add(h.id); return true })
}

function eingabenListe(fall: Fall, r: FallRechnung | null, namen: Namen): string[] {
  const aus: string[] = [], hand = fall.streifenHand
  // Trottoirüberfahrt (27.10.2026): «Trottoirüberfahrt 1», Achse ohne die Zeichenbreite (Masse aus der Knotensicht)
  for (const s of fall.streifenHand) aus.push(istTrottoirueberfahrt(fall, s.id)
    ? `${titelImFall(s.id, fall, r?.streifen)}: Achse ${f1(dist(s.p0, s.p1))} m, ${streifenHerkunftText(s)}`
    : `${titelImFall(s.id, fall, r?.streifen)}: ${f1(dist(s.p0, s.p1))} m lang, ${f1(s.breite)} m breit, ${streifenHerkunftText(s)}`)
  for (const h of parkBerichtFelder(fall.hindernisse, r)) aus.push(h.art === 'insel' ? 'Insel von Hand (teilt den Streifen wie eine AV-Verkehrsinsel, ersetzt die Insel nach OSM und Luftbild)' :
    `Hindernis: ${hindernisText(h)}` + ((h.art === 'hecke' || h.art === 'mauer' || h.art === 'uebrige') ?
    (h.sichtbehindernd ? ', sichtbehindernd' : ', nicht sichtbehindernd') : '') + (h.art === 'parkfeld' ? `, Klasse ${h.klasse}` : ''))
  for (const [k, z] of Object.entries(fall.zufahrten)) {
    const teile: string[] = []
    if (z.tempo) teile.push(`Tempo ${z.tempo} km/h`)
    if (z.spur?.art === 'A') teile.push(`Fahrlinie seitlich verschoben (am Streifen ${f2(z.spur.a)} m, am Ende ${f2(z.spur.b)} m; + links)`)
    if (z.spur?.art === 'B') teile.push(`Fahrlinie gezeichnet (${z.spur.linie.length} Punkte${z.spur.radius ? `, Radius ${f1(z.spur.radius)} m übernommen` : ''})`)
    if (z.streichen) teile.push('Zufahrt gestrichen («gibt es nicht»)')
    if (teile.length) aus.push(`${zufahrtName(r, k, namen, hand)}: ${teile.join('; ')}`)
  }
  for (const [k, e] of Object.entries(fall.streifen)) {
    const teile: string[] = []
    if (e.lsa) teile.push(`Lichtsignal ${e.lsa}`)
    if (e.keinFgs) teile.push('kein FGS')
    if (e.typ === 'trottoirueberfahrt') teile.push('Trottoirüberfahrt')
    else if (e.typ) teile.push(`Querung ohne Vortritt (${e.typ === 'furt' ? 'Furt, Insel ohne Balken' : 'Nase, Einengung bzw. ohne bauliche Massnahme'})`)
    if (teile.length) aus.push(`${titelImFall(k, fall, r?.streifen)}: ${teile.join(', ')}`)
  }
  const verworfen = Object.keys(fall.vorschlaege).length
  if (verworfen) aus.push(`${verworfen} Vorschläge bzw. amtliche Felder verworfen (zählen nicht)`)
  if (fall.baumkataster) aus.push('Baumkataster zugeschaltet')
  if (fall.parkkataster === false) aus.push('Amtliche Parkfelder abgeschaltet')
  if (fall.luftbild === false) aus.push('Streifen-Suche im Luftbild abgeschaltet')
  for (const fp of fall.flaechenPlan ?? []) aus.push(`${planTitel(fp.id)} (Plan): ${PLAN_NAME[fp.art]}, ${f1(planFlaecheM2(fp.ring))} m², ` +
    `${fp.ring.length} Ecken – ersetzt in der Rechnung die AV-Bodenbedeckung darunter (Gebäude bleiben)` +
    (fp.standard ? `; ${planStandardText(fp)}` : ''))
  for (const f of fall.fixpunkte ?? []) aus.push(`Fixpunkt ${fixpunktName(f)}: ${ART_TEXT[f.art]}, E ${koordText(f.p[0])}, N ${koordText(f.p[1])} ` +
    '(nur Vermassung, ohne Einfluss auf die Rechnung)')
  const nb = Object.keys(fall.bedarf?.felder ?? {}).length, ne = Object.keys(fall.bedarf?.ebenen ?? {}).length
  if (nb || ne) aus.push(`Bedarf und Querungstyp: ${nb} Eingabe(n) von Hand${ne ? `, ${ne} Ebene(n) von Hand geschaltet` : ''} ` +
    '(siehe Abschnitt «Bedarf und Querungstyp»)')
  return aus
}

function hinweisListe(r: FallRechnung, fall: Fall, luftbildStand: LuftbildStand, ausserhalb: Ausserhalb[], namen: Namen, parkOffen = 0): string[] {
  const t = (id: string) => titelImFall(id, fall, r.streifen)
  const aus: string[] = []
  if (r.hinweis) aus.push(r.hinweis)
  // Streifen ausserhalb der Abdeckung: beim Streifen (StreifenTabelle); hier nur die ohne eigenes Ergebnis (jeder Hinweis einmal)
  const ohne = ausserhalb.filter(x => !r.streifen.some(s => s.fgsId === x.id))
  if (ohne.length) aus.push(nichtAbgedecktText(ohne, t))
  aus.push(...r.meldungen)
  const lb = r.luftbild
  if (lb) aus.push(lb.befund === 'erkannt' ? `Luftbild: Streifen erkannt (${lb.teile.map(t => `${t.nBalken} Balken`).join(' + ')})` +
      (r.streifenQuelle === 'luftbild' ? `, ${luftbildGilt(fall, lb.teile) ? 'von Hand bestätigt' : 'nicht von Hand bestätigt'}; die Rechnung nutzt ihn.` :
        r.streifenQuelle === 'hand' && fall.streifenHand.some(h => h.herkunft === 'luftbild') ? ', als Streifen von Hand übernommen.' :
        r.streifenQuelle === 'hand' ? '; die Rechnung nutzt die Streifen von Hand.' :
        lb.nurVorschlag ? '; mit Flächen (Plan) nur Vorschlag, gerechnet mit OSM + AV nach Plan.' : '.')
    : lb.befund === 'unsicher' ? `Luftbild: Muster unsicher (${lb.gruende.join('; ')}); Streifen aus OSM + AV` +
      `${r.inselTeilt ? ', an der Insel aus dem Luftbild geteilt' : ''}.`
      : `Luftbild: kein Streifen gefunden (${lb.gruende.join('; ')}); Streifen aus OSM + AV.`)
  else if (fall.ort.uebergang !== null && fall.luftbild !== false && !fall.streifenHand.length) {
    if (luftbildStand === 'laedt') aus.push('Luftbild wird noch geladen: Streifen vorerst aus OSM + AV.')
    else if (luftbildStand === 'fehlt') aus.push('Luftbild nicht geladen: Streifen aus OSM + AV.')
  }
  const offen = r.vorschlaege.filter(v => v.hindernis.quelle === 'osm').length
  if (offen) aus.push(`${offen} Vorschläge «aus OSM, prüfen» (Parkierung) nicht bestätigt: zählen nicht.`)
  if (parkOffen) aus.push(`${parkOffen} Parkfelder der Stadt Zürich nicht bestätigt: zählen nicht.`)
  if (r.doppelt.length) aus.push(`${r.doppelt.length} Parkierung(en) von Hand decken sich mit amtlichen Parkfeldern (zählen doppelt?).`)
  for (const s of r.streifen) {
    for (const a of s.annahmen) aus.push(`${t(s.fgsId)}: ${a}`)
    for (const z of s.zufahrten) for (const a of z.annahmen) aus.push(`${t(s.fgsId)}, ${zufahrtText(namen.get(s.fgsId), z.zufahrt)}: ${a}`)
  }
  if (!fall.hindernisse.length && !r.vorschlaege.some(v => v.hindernis.quelle === 'kataster'))
    aus.push('Keine Hindernisse eingegeben und keine amtlichen Parkfelder: geprüft wurden nur Gebäude (AV).')
  return [...new Set(aus)]
}

/** Ladezustand des Luftbilds für die Streifen-Suche (App): noch unterwegs, fehlgeschlagen bzw. nicht angefragt, vorhanden */
export type LuftbildStand = 'laedt' | 'fehlt' | 'da'

/** vorhandene Sicht je Zufahrt: bei freier Sicht das Soll bzw. so weit wie geprüft, sonst bis zum ersten Hindernis */
function vorhandeneSichtText(z: ZufahrtErgebnis): string {
  if (z.freiBisM == null) return '–'
  return z.status === 'frei' ? `mindestens ${mText(z.freiBisM)} m` : `${mText(z.freiBisM)} m`
}

function hindernisseText(z: ZufahrtErgebnis): string {
  if (!z.konflikte.length) return 'keine'
  return z.konflikte.map(k => `${k.layer}${k.klasse === 'baum' ? '' : ` ${f1(k.flaeche)} m²`}, ${f1(k.abstand)} m vom Streifen`).join('; ')
}

/** Hindernis, das nur die Erkennungsdistanz begrenzt: Es liegt jenseits der nötigen Sicht und steht darum nicht unter «Hindernisse im Sichtfeld» */
function erkennungHindernisText(z: ZufahrtErgebnis, gelaende?: Readonly<Record<string, GelaendeStand>> | null): string {
  const e = z.erkennungM ? erkennungAnzeige(z, gelaende)?.e : null
  if (!e || z.konflikte.length || e.bis !== 'verdeckt' || !e.hindernis || e.hindernis.klasse === 'gelaende' || e.wert < z.sichtweite) return ''
  return `${e.hindernis.name}: begrenzt nur die Erkennungsdistanz (${mText(e.wert)} m), nicht die nötige Sicht`
}

/** Lage eines Streifens von Hand (LV95) und Masse für den Plan (rechner/vermassung.ts), Vermassung ab Fixpunkt */
function LageTabelle({ s, fixpunkte, namen, plan = false }: { s: StreifenErgebnis; fixpunkte: Fixpunkt[]; namen: ZufahrtNamen | undefined
  plan?: boolean }) {
  const v = s.vermassung
  if (!v) return null
  return (
    <div className="bericht-lage">
      <h4>Lage des Streifens (LV95)</h4>
      <table className="bericht-tabelle">
        <thead><tr><th>Punkt</th><th>E</th><th>N</th></tr></thead>
        <tbody>{v.punkte.map(q => <tr key={q.name}><td>{q.name}</td><td>{koordText(q.p[0])}</td><td>{koordText(q.p[1])}</td></tr>)}</tbody>
      </table>
      <p className="klein">Ende A liegt im {v.seiteA}en. Achse A–B {f2(v.laengeM)} m, Breite {f2(v.breiteM)} m; Winkel zur Fahrbahnachse
        {' '}{v.winkelGrad !== null ? `${f1(v.winkelGrad)}° (90° = senkrecht; ${v.winkelQuelle})` : `– (${v.winkelQuelle})`}. Abstand zum
        Fahrbahnrand entlang der Achse (+ vor dem Rand, − darüber hinaus): {v.randAbstandM ? `Ende A ${vorzeichenText(v.randAbstandM[0])}, ` +
        `Ende B ${vorzeichenText(v.randAbstandM[1])}; Fahrbahn ${f2(v.fahrbahnM!)} m` : '–'} ({v.randQuelle}).
        {v.knoten.length > 0 && <> Nächster Knoten stromauf (OSM, entlang der Strasse ab Streifenrand): {v.knoten.map(k =>
          `${zufahrtText(namen, k.zufahrt)} ${f1(k.abstandM)} m`).join('; ')}.</>}
        {' '}Ecken wie in der Rechnung (Enden parallel zur Fahrbahn bzw. zu den Balken); Randsteine nach AV (Bestand){plan ?
          ' bzw. nach den Flächen (Plan) von Hand' : ''}.</p>
      {fixpunkte.length > 0 && <>
        <h4>Vermassung ab Fixpunkt</h4>
        <table className="bericht-tabelle">
          <thead><tr><th>Fixpunkt</th><th>E / N</th><th>längs zur Kante</th><th>zur Achse</th><th>zum Ende (längs, quer)</th><th>Luftlinie</th></tr></thead>
          <tbody>{fixpunkte.map(f => {
            const t = fixMassTexte(fixpunktMasse(f.p, { p0: s.p0, p1: s.p1, breite: s.bw, umriss: s.umriss }))
            return <tr key={f.id}><td>{fixpunktName(f)}<div className="klein">{ART_TEXT[f.art]}</div></td>
              <td className="klein">{koordText(f.p[0])}<br />{koordText(f.p[1])}</td><td>{t.kante}</td><td>{t.achse}</td><td>{t.ende}</td><td>{t.ecke}</td></tr>
          })}</tbody>
        </table>
        <p className="klein">Längs = entlang der Balken (bei geraden Streifen der Fahrbahn), quer = senkrecht dazu; Kante = Rand des Streifens
          (Achse ± halbe Breite), bei schiefen Streifen auf der Höhe des Fixpunkts gemessen. AV-Punkte sind keine vermarkten Grenzpunkte:
          ihre Lage hat die Genauigkeit der AV-Bodenbedeckung.</p>
      </>}
    </div>
  )
}

function StreifenTabelle({ s, fall, ausserhalb, namen, alle, alleNamen, gelaende, profile, parkfelder }: { s: StreifenErgebnis; fall: Fall; ausserhalb: Ausserhalb | null
  namen: ZufahrtNamen | undefined; alle: StreifenErgebnis[]; alleNamen: Map<string, ZufahrtNamen>
  gelaende: Readonly<Record<string, GelaendeStand>> | null
  parkfelder: readonly Hindernis[]
  profile: readonly EbenenObjekt[]   // Geländeprofile der Sichtlinien (gelaendeKarte.gelaendeProfile), im Bericht nur die massgebenden
}) {
  const profilBilder = s.status === 'kein_fgs' || s.trottoirueberfahrt ? [] : nachNr(s.zufahrten, namen).flatMap(z => profilWahlBericht(profile, z, gelaende))
  return (
    <section className="bericht-block">
      <h3>{streifenKopf(streifenTitel(s.fgsId, fall.streifenHand, streifenArt(s)), s.strasse)}{s.trottoirueberfahrt ? '' : `: ${streifenStatus(s)}`}
        {s.querung ? (s.querung.typ === 'begegnungszone' ? ' (Querung in der Begegnungszone)' : ' (Querung ohne Vortritt)') : ''}</h3>
      <p className="klein">{s.trottoirueberfahrt ? `Achse der Überfahrt ${f1(Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]))} m`
        : `${s.querung ? 'Länge' : 'Markierte Länge'} ${f1(Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]))} m${s.randQuelle === 'AV' ? `, Bordkante bis Bordkante ${f1(Math.hypot(s.rand[1][0] - s.rand[0][0], s.rand[1][1] - s.rand[0][1]))} m` : ''}, Breite ${f1(s.bw)} m`} · Zuordnung OSM: {netzQuelleText(s.netzQuelle)} ·
        Bordkanten: {s.randQuelle === 'AV' ? 'AV' : 'angenommen'} · Lichtsignal: {s.lsa === 'ja' ? `ja (${s.lsaQuelle ?? 'OSM'})` : 'nein'}</p>
      {ausserhalb && <p className="klein"><b>Ausserhalb der geladenen Daten:</b> {ausserhalbText(ausserhalb)}</p>}
      {s.keinFgsHinweis && <p className="klein"><b>Kein Fussgängerstreifen: Prüfung sinngemäss nach den FGS-Regeln, ohne Normbezug.</b></p>}
      {s.querungAnnahme && <p className="klein"><b>{s.querungAnnahme}</b></p>}
      {s.trottoirueberfahrt && <KnotensichtBericht ks={s.knotensicht} fgsId={s.fgsId} titel={id => streifenTitel(id, fall.streifenHand, true)} />}
      {s.markierungHinweis && <p className="klein"><b>Vermutlich Fussgängerstreifen (Markierung in OSM nicht erfasst), bitte prüfen.</b></p>}
      {s.luftbildUebergang && <p className="klein"><b>{s.luftbildUebergang}</b></p>}
      {s.lsa === 'ja' && <p className="klein">Mit Lichtsignal gilt die {LESENAME.AHBE} nicht; die Rechnung wird trotzdem gezeigt.</p>}
      {s.querung?.typ === 'begegnungszone' && <p className="klein"><b>Querung in der Begegnungszone</b> (Vortritt Fussverkehr), kein
        Fussgängerstreifen: Sichtweite = Anhaltesichtweite nach VSS 40 240, Ziffer 8.2, nach dem Tempo der Zufahrt.</p>}
      {s.querung && s.querung.typ !== 'begegnungszone' && <p className="klein"><b>Querung ohne Vortritt</b> ({s.querung.typ === 'furt' ? 'Furt, Insel ohne Balken' :
        'Nase, Einengung bzw. ohne bauliche Massnahme'}), kein Fussgängerstreifen: Sichtweite nach VSS 40 240, Ziffer 8.2, max(v · L / 1,2 m/s;
        Anhaltesichtweite), L = {f1(s.querung.L)} m{s.querung.ganzeFahrbahn ? ' (Insel nur markiert: ganze Fahrbahn)' : ''}.</p>}
      {s.status !== 'kein_fgs' && (
        <table className="bericht-tabelle">
          <thead><tr><th>Zufahrt</th><th>Tempo</th><th>nötige Sicht</th><th>vorhandene Sicht</th><th>Ergebnis</th><th>Parkflächen und Sichthindernisse</th></tr></thead>
          <tbody>
            {nachNr(s.zufahrten, namen).map(z => (
              <tr key={z.zufahrt}>
                <td><NrMarke nr={zufahrtNr(namen, z.zufahrt)} /><b>{zufahrtLang(namen, z.zufahrt)}</b>{z.deckung && <span className="klein"> (mitgeprüft)</span>}
                  <div className="klein">{ART[z.art] ?? z.art}{z.art === 'abbiegend' && z.ueberStrasse ? `, weiter auf ${z.ueberStrasse}` : ''}</div></td>
                <td>{z.tempo} km/h<div className="klein">({z.tempoQuelle === 'Ersatz' ? 'Annahme, ohne Angabe' : z.tempoQuelle === 'Geoportal' ? 'Geoportal Stadt Bern' : tempoHerkunft(z.tempoQuelle)})</div></td>
                <td>{mText(z.sichtweite)} m<div className="klein">({sichtQuelleKurz(z.sichtweiteQuelle)}{z.kurvenradiusM != null ? `, Kurvenradius ${f1(z.kurvenradiusM)} m` : ''})</div>
                  {z.geprueftBisM != null && <div className="klein warnung">geprüft bis {z.geprueftBisM} m, darüber nicht geprüft</div>}</td>
                <td>{vorhandeneSichtText(z)}</td>
                <td><b className="status-farbe" style={{ color: statusFarbe(z.status) }}>Wartefläche: {statusText(z, fall.hindernisse)}</b>{z.unter5m && <div className="klein">Auto-Parkfeld unter 5 m am Streifen</div>}
                  {z.sichtGelaende && <div className="klein">{sichtGelaendeText(z.sichtGelaende)}</div>}
                  {z.erkennungM && (() => {
                    const a = erkennungAnzeige(z, gelaende)!.e
                    return <><div className="klein">{erkennungText(a)}; {gelaendeText(a)}</div>
                      {erkennungEmpfehlungText(a, z.sichtweite) && <div className="klein"><strong className="status-farbe" style={{ color: STATUS_FARBE.verdeckt }}>{erkennungEmpfehlungText(a, z.sichtweite)}</strong></div>}</>
                  })()}</td>
                <td className="klein"><ParkBerichtDetails felder={parkfelder} ergebnis={z} /><div>Im Sichtfeld: {hindernisseText(z)}</div>{erkennungHindernisText(z, gelaende) && <div>{erkennungHindernisText(z, gelaende)}</div>}</td>
              </tr>
            ))}
            {!s.zufahrten.length && <tr><td colSpan={6} className="klein">keine Zufahrt</td></tr>}
          </tbody>
        </table>
      )}
      {profilBilder.length > 0 && <>
        <h4>{profilBilder.length === 1 ? 'Geländeprofil der Sichtlinie, an der das Geländemodell die Sicht verdeckt' : 'Geländeprofile der Sichtlinien, an denen das Geländemodell die Sicht verdeckt'}</h4>
        <p className="klein">Gezeigt wird nur, wo das Geländemodell zu «nicht erfüllt» führt: die Wartefläche ist verdeckt bzw. die
          Erkennungsdistanz erreicht das Soll nicht. Alle geprüften Sichtlinien zeigt die App unter «Geländeprofile ansehen».</p>
        {profilBilder.map(p => <ProfilBericht key={p.id} p={p} />)}
      </>}
      {s.entfallen.length > 0 && (
        <p className="klein">{ENTFALLEN_TITEL}: {s.entfallen.map(e => {
          const g = entfallenGrund(e, s, alle, fid => titelImFall(fid, fall, alle), (fid, z) => zufahrtLang(alleNamen.get(fid), z))
          return `${entfallenText(namen, e)} – ${g.text}${g.kurz ? ` (${g.kurz})` : ''}`
        }).join('; ')}.</p>
      )}
      <LageTabelle s={s} fixpunkte={fall.fixpunkte ?? []} namen={namen} plan={!!fall.flaechenPlan?.length} />
    </section>
  )
}

export default function Bericht({ fall, rechnung, rechnungZeit, luftbildStand, zusatzQuellen, ausserhalb = [], parkVorschlaegeOffen = 0, aendern,
  schliessen, namen = new Map(), blaetter = [], quellenIds = [], quellenOhneTreffer = [], datenlage = null, quellenQualitaet = {}, gelaende = null, neigung = null, bruecke = null }: {
  neigung?: Readonly<Record<string, NeigungMessung>> | null
  /** Brückenumriss der AV (rechner/bruecke.ts): Geländeprofile, die eine Brücke berühren, gelten als unsicher */
  bruecke?: { enthaelt(p: P): boolean } | null
  /** Geländeprüfung der Erkennungsdistanz je erkennungGelaende.gelaendeSchluessel */
  gelaende?: Readonly<Record<string, GelaendeStand>> | null
  /** genutzte Quellen (Kennungen im Quellenregister) und Datenlage am Ort für die Tabelle unter «Quellen» */
  quellenIds?: readonly string[]; quellenOhneTreffer?: readonly OhneTreffer[]; datenlage?: Datenlage | null; quellenQualitaet?: Readonly<Record<string, QuellenQualitaet>>
  namen?: Namen                  // Zufahrten nach Strasse und Herkunft (benennung.ts), je Streifen
  blaetter?: BefundBlatt[]       // Bedarfsmodul: Befundblatt je Querung (gezeigt, sobald eine Beurteilung vorliegt)
  fall: Fall; rechnung: FallRechnung; rechnungZeit: Date | null; luftbildStand: LuftbildStand
  /** Parkfelder als Vorschlag, die noch nicht bestätigt sind (Stadt Zürich) */
  parkVorschlaegeOffen?: number
  zusatzQuellen: string[]
  ausserhalb?: Ausserhalb[]      // Streifen von Hand ausserhalb der geladenen Daten (abdeckung.ts)
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
  const eingaben = eingabenListe(fall, rechnung, namen)
  // der Bedarfsteil steht im Bericht, sobald eine Beurteilung vorliegt (die Vorbelegung genügt)
  const mitBedarf = blaetter.length > 0
  const hinweise = hinweisListe(rechnung, fall, luftbildStand, ausserhalb, namen, parkVorschlaegeOffen)
  // Ergebnis auf Seite 1: neben dem Status die verfehlte Erkennungsdistanz je Zufahrt und die Aussage zum Bedarf
  const erkennungBefunde = (s: StreifenErgebnis): string[] => nachNr(s.zufahrten, namen.get(s.fgsId)).flatMap(z => {
    const t = z.erkennungM ? erkennungEmpfehlungText(erkennungAnzeige(z, gelaende)!.e, z.sichtweite) : ''
    return t ? [`${zufahrtText(namen.get(s.fgsId), z.zufahrt)}: ${t}`] : []
  })
  const bedarfZeilen = blaetter.map(b => `Bedarf${blaetter.length > 1 ? `, ${querungTitel(b)}` : ''}: ${bedarfKurz(b)}`)
  // Geländeprofile der geprüften Sichtlinien (wie in der App, aus dem Abrufcache; keine neue Höhenabfrage)
  const profile = useMemo(() => gelaendeProfile(rechnung.streifen, gelaende, undefined, z => zufahrtText(namen.get(z.fgsId), z.zufahrt), bruecke),
    [rechnung, gelaende, namen, bruecke])
  // Bezeichnung: lokal tippen, erst beim Verlassen des Felds (bzw. Enter, Escape) in den Fall übernehmen – sonst lösten
  // jeder Tastendruck eine neue Rechnung und das Speichern im Browser aus. Der Bericht zeigt den lokalen Wert sofort.
  const [bez, setBez] = useState(fall.ort.bezeichnung ?? '')
  const bezUebernehmen = () => {
    const t = bez
    if (t.trim() === (fall.ort.bezeichnung ?? '').trim()) return
    aendern(f => { if (t.trim()) f.ort.bezeichnung = t; else delete f.ort.bezeichnung; return f })
  }
  const tausender = (x: number) => Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’')
  // Titel des Dokuments = Vorschlag für den Dateinamen beim Speichern als PDF: Bezeichnung, sonst Strasse, sonst OSM-Übergang
  // (Zeichen, die in Dateinamen stören, werden zu «_»)
  const titelTeil = (fall.ort.bezeichnung?.trim() || strassen[0] || (fall.ort.uebergang !== null ? String(fall.ort.uebergang) : 'Ort'))
    .replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 60)
  useEffect(() => {
    const alt = document.title
    const d = new Date(), zz = (x: number) => String(x).padStart(2, '0')        // Lokaldatum (nicht UTC)
    document.title = `fgsCheck_Bericht_${titelTeil}_${d.getFullYear()}-${zz(d.getMonth() + 1)}-${zz(d.getDate())}`
    return () => { document.title = alt }
  }, [titelTeil])
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
      </div>
      <article className="bericht-seite">
        {/* Druckrand als Rahmen (wie VeloroutenCheck): Kopf und Fuss der Tabelle wiederholen sich auf
            jeder gedruckten Seite. So kommt der Bericht ohne Seitenrand aus (@page margin 0), und der Browser setzt keine eigene
            Kopf- und Fusszeile (Titel, Adresse, Seitenzahl, Datum) dazu. Zwei Zeilen: Seite 1 Ort und Kartenbild, ab Seite 2 das
            Ergebnis (Seitenumbruch zwischen den Zeilen; innerhalb einer Zelle greift er nicht in allen Browsern). */}
        <table className="bericht-rahmen">
        {/* Fallkennung auf jeder Seite (lose Blätter); Seitenzahlen kennt der Kopf nicht: der Zähler bleibt dort in Firefox auf 0 */}
        <thead><tr><td><div className="bericht-rand-oben"><span className="bericht-kennung">fgsCheck v{__APP_VERSION__} · {fall.ort.bezeichnung?.trim() || strassen[0] || 'Querung'} · {datum(heute)}</span></div></td></tr></thead>
        <tfoot><tr><td><div className="bericht-rand-unten" /></td></tr></tfoot>
        <tbody><tr><td>
        <header>
          <h1><img className="logo" src={import.meta.env.BASE_URL + 'logo.svg'} alt="" width={36} height={36} />Sichtprüfung Fussgängerstreifen</h1>
          <p className="klein">fgsCheck · {mitBedarf ? 'Sichtprüfung, Bedarf und Querungstyp' : 'Sichtprüfung'} · Bericht vom {datum(heute)}</p>
        </header>

        <section className="bericht-block">
          <h2>Ort</h2>
          <table className="bericht-zahlen"><tbody>
            <tr className={bez.trim() ? undefined : 'nicht-drucken'}><td>Bezeichnung</td><td>
              <input className="nicht-drucken bericht-eingabe" type="text" placeholder="z. B. Adresse, Knoten (erscheint im Bericht)"
                value={bez} onChange={ev => setBez(ev.target.value)} onBlur={bezUebernehmen}
                onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); else if (ev.key === 'Escape') bezUebernehmen() }} />
              <span className="nur-drucken">{bez.trim() ? bez : '–'}</span>
            </td></tr>
            {strassen.length > 0 && <tr><td>Strasse (OSM)</td><td>{strassen.join(', ')}</td></tr>}
            <tr><td>Koordinaten</td><td>LV95 E {tausender(e)}, N {tausender(n)} · WGS84 {fall.ort.lat.toFixed(6)}, {fall.ort.lon.toFixed(6)}</td></tr>
            {fall.ort.amtlich ? <tr><td>Amtlicher Übergang</td><td>{amtlicherText(fall.ort.amtlich)}; Auswahl bestätigt, Lage aus Strassennetz und AV prüfen.</td></tr> : fall.ort.herkunft && fall.ort.uebergang !== null && fall.ort.uebergang < 0
              ? <tr><td>Übergang</td><td>{LUFTBILD_UEBERGANG_TEXT} ({herkunftText(fall.ort.herkunft)}){!rechnung.luftbildUebergang ||
                rechnung.streifenQuelle === 'hand' ? '' : rechnung.luftbildUebergang.bestaetigt ? '; im Luftbild Streifen erkannt'
                : `; ${rechnung.luftbild ? KEIN_STREIFEN_TEXT : NICHT_GEPRUEFT_TEXT}`}</td></tr>
              : <tr><td>OSM-Übergang</td><td>{fall.ort.uebergang !== null ? <>Knoten {fall.ort.uebergang}{mk ? ` (${UEBERGANG_TEXT[mk] ?? mk})` : ''}</> :
              ortOhneUebergangText(fall)}</td></tr>}
            <tr><td>Streifen aus</td><td>{rechnung.streifenQuelle === 'hand' ? (fall.streifenHand.every(h => h.bestand)
              ? 'bestehende Querung, Lage von Hand angepasst' : 'Eingabe von Hand') : rechnung.streifenQuelle === 'luftbild' ? 'Luftbild (erkannt, prüfen)' : fall.ort.amtlich ? 'amtlicher Suchpunkt, Strassennetz und AV (Geometrie prüfen)' : 'OSM und AV'}</td></tr>
            {(fall.flaechenPlan?.length ?? 0) > 0 && <tr><td>Bodenbedeckung</td><td>Rechnung mit geplanter Bodenbedeckung (von Hand):
              AV mit {fall.flaechenPlan!.length} Fläche(n) (Plan), siehe «Eingaben von Hand»</td></tr>}
            <tr><td>Daten geladen</td><td>{datumText(fall.quellen.geladen ?? '–')}; Rechnung {rechnungZeit ? `${datum(rechnungZeit)} ${zeit(rechnungZeit)}` : '–'}</td></tr>
          </tbody></table>
        </section>

        <section className="bericht-block">
          <h2>Ergebnis</h2>
          {rechnung.hinweis && <p><b>{rechnung.hinweis}</b></p>}
          {!rechnung.streifen.length && <p>Kein Streifen gebildet. {rechnung.meldungen.join(' ')}</p>}
          <ul className="bericht-status">
            {rechnung.streifen.map(s => <li key={s.fgsId}>{streifenTitel(s.fgsId, fall.streifenHand, streifenArt(s))}{s.strasse ? ` (${s.strasse})` : ''}{s.querung ?
              (s.querung.typ === 'begegnungszone' ? ' – Querung in der Begegnungszone' : ' – Querung ohne Vortritt') : ''}: <b className="status-farbe" style={{ color: statusFarbe(s.status) }}>{streifenStatus(s)}</b>
              {' '}– {s.trottoirueberfahrt ? 'Knotensicht mit dem SichtweitenCheck prüfen, Sicht auf die Wartefläche nicht geprüft'
                : s.status === 'kein_fgs' ? 'von Hand als kein Fussgängerstreifen bezeichnet, Zufahrten nicht ausgewiesen'
                : `${s.zufahrten.length} ${s.zufahrten.length === 1 ? 'Zufahrt' : 'Zufahrten'} geprüft, davon ${s.zufahrten.filter(z => z.status === 'frei').length} frei` +
                  (s.zufahrten.some(z => z.deckung) ? `; ${s.zufahrten.filter(z => z.deckung).length} durch die gerade Zufahrt ` +
                    `mitgeprüfte ${s.zufahrten.filter(z => z.deckung).length === 1 ? 'Abbiegezufahrt' : 'Abbiegezufahrten'} mitgezählt` : '')}
              {erkennungBefunde(s).map(t => <div key={t} className="status-farbe" style={{ color: STATUS_FARBE.verdeckt }}>{t}</div>)}</li>)}
            {bedarfZeilen.map(t => <li key={t}>{t}</li>)}
          </ul>
        </section>
        {rechnung.streifen.length > 0 && <BerichtKarte neigung={neigung} gelaende={gelaende} r={rechnung} ort={ort} onBereit={setBild} fixpunkte={fall.fixpunkte ?? []}
          namen={namen} hand={fall.streifenHand} plan={fall.flaechenPlan ?? []} zusatzMm={ergebnisZusatzMm([...rechnung.streifen.flatMap(erkennungBefunde), ...bedarfZeilen])}
          hindernisse={parkBerichtFelder([
            ...parkDarstellung([...fall.hindernisse, ...rechnung.vorschlaege.filter(v => v.hindernis.quelle === 'kataster').map(v => v.hindernis)], rechnung.parkPruefflaechen),
            ...rechnung.streifen.flatMap(s => s.knotensicht && 'richtungen' in s.knotensicht ? s.knotensicht.parkPruefflaechen ?? [] : []),
          ], rechnung)} />}

        </td></tr>
        <tr className={rechnung.streifen.length > 0 ? 'bericht-neue-seite' : undefined}><td>
        {/* Seite 1: Ort, Ergebnis und Kartenbild. Ab Seite 2 die Sichtprüfung je Streifen und Zufahrt mit den Geländeprofilen, danach
            Bedarf und Querungstyp, Eingaben, Hinweise und Quellen (Umbau 06.11.2026: die Ergebnisse stehen vorne, keine Begriffsliste) */}
        <section className="bericht-block">
          <h2>Sichtprüfung je Streifen und Zufahrt</h2>
          <p className="klein">Je Zufahrt die nötige und die vorhandene Sicht auf die Wartefläche, die Hindernisse im Sichtfeld und die
            Erkennungsdistanz der Bodenmarkierung; Sichtfelder und Fahrlinien zeigt das Kartenbild auf Seite 1.</p>
        </section>
        {rechnung.streifen.map(s => <StreifenTabelle parkfelder={berichtParkfelder(rechnung)} key={s.fgsId} s={s} fall={fall} gelaende={gelaende} profile={profile} ausserhalb={ausserhalb.find(x => x.id === s.fgsId) ?? null}
          namen={namen.get(s.fgsId)} alle={rechnung.streifen} alleNamen={namen} />)}
        {hinweise.length > 0 && <section className="bericht-block druck-block">
          <h3>Hinweise zur Sichtprüfung</h3>
          <ul className="klein">{hinweise.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>}
        {mitBedarf && <section className="bericht-block">
          <h2>Bedarf und Querungstyp</h2>
          {blaetter.map(b => <ZusammenfassungAnzeige key={`zf-${b.gruppe}`} b={b} druck titel={blaetter.length > 1 ? querungTitel(b) : undefined} />)}
          <p className="klein">Zuerst fünf Grundfragen der bfu, dann alle Einzelprüfungen nach Normen und Berner Standards. «Muss» und
            «Soll» stehen so in der Quelle; als Gesetz verbindlich ist nur, was mit «Recht» bezeichnet ist. «Offen» heisst: eine Angabe
            fehlt, es zählt nie als erfüllt. Die Sicht stammt aus der Sichtprüfung (Abschnitte «Ergebnis» und «Sichtprüfung je Streifen und Zufahrt»).</p>
          {blaetter.map(b => <GrundpruefungAnzeige key={`grund-${b.gruppe}`} g={b.grund} titel={blaetter.length > 1 ? b.titel : undefined} druck
            feldHinweise={b.vorbelegt.feldHinweise} ohneAnnahme={a => annahmeInTabelle(blaetter[0], a)} />)}
          {blaetter.map(b => <BefundblattAnzeige key={b.gruppe} b={b} mehrere={blaetter.length > 1} druck />)}
        </section>}

        <section className="bericht-block druck-block">
          {(parkBerichtFelder(berichtParkfelder(rechnung), rechnung).length > 0 || [...fall.hindernisse, ...rechnung.vorschlaege.filter(v => v.hindernis.quelle === 'kataster').map(v => v.hindernis)].some(h => h.art === 'baum')) && <>
          <h2>Annahmen und Hinweise</h2>
          {[...fall.hindernisse, ...rechnung.vorschlaege.filter(v => v.hindernis.quelle === 'kataster').map(v => v.hindernis)].some(h => h.art === 'baum') && <p className="klein">{BAUM_ANNAHME}</p>}
          {parkBerichtFelder(berichtParkfelder(rechnung), rechnung).length > 0 && <ParkBerichtAnnahme />}
          </>}
          <h2>Eingaben von Hand</h2>
          {eingaben.length ? <ul className="klein">{eingaben.map((x, i) => <li key={i}>{x}</li>)}</ul> :
            <p className="klein">Keine. Ergebnis aus den geladenen Daten, Rechenregeln und ausgewiesenen Annahmen.</p>}
          <p className="klein">Die Eingaben lassen sich in der App mit «Fall speichern» als Fall-Datei (JSON) sichern und mit «Fall laden»
            wiederherstellen.</p>
        </section>

        <section className="bericht-block">
          <h2>Quellen</h2>
          <BerichtQuellenTabelle ids={quellenIds} lage={datenlage} qualitaet={quellenQualitaet} />
          {zusatzQuellen.length > 0 && <ul className="klein">{zusatzQuellen.map(q => <li key={q}>{datumText(q)}</li>)}</ul>}
          {quellenOhneTreffer.length > 0 && <div className="druck-block"><h3>Abgefragt, nicht verwendet</h3>
            <BerichtQuellenTabelle ids={quellenOhneTreffer.map(q => q.id)} qualitaet={quellenQualitaet} gruende={Object.fromEntries(quellenOhneTreffer.map(q => [q.id, q.grund]))} /></div>}
          <h3>Werke der Sichtprüfung</h3>
          <ul className="klein">
            <li>Sichtweiten: {LESENAME['40241']}, Tabelle 1 ({TAB1_TEXT}).</li>
            <li>Im Knoten nach Kurvenradius: {LESENAME.BFU} bzw. {LESENAME['40241']}, Tabelle 2 ({KURVE_SICHTWEITE.map(([r, sw]) => `bis ${r} m: ${sw} m`).join(', ')}).</li>
            <li>Auto-Parkfeld näher als 5 m am Streifen: {LESENAME.VRV}, Art. 18 Abs. 2 Buchstabe e.</li>
            {rechnung.streifen.some(s => s.querung?.typ === 'begegnungszone') && <li>Querung in der Begegnungszone (Vortritt Fussverkehr):
              {' '}{LESENAME['40240']}, Ziffer 8.2, Sichtweite = Anhaltesichtweite.</li>}
            {rechnung.streifen.some(s => s.querung && s.querung.typ !== 'begegnungszone') && <li>Querung ohne Vortritt: {LESENAME['40240']}, Ziffer 8.2, Sichtweite max(v · L / 1,2 m/s;
              Anhaltesichtweite {Object.entries(AHS_40240).map(([t, sw]) => `${t} km/h: ${sw} m`).join(', ')}) je Teilquerung.</li>}
            {mitBedarf && <li>Bedarf und Querungstyp: Regelkatalog des Bedarfsmoduls (Ziffer und Ausgabe je Befund); Grundprüfung nach
              bfu-Fachdokumentation «Fussgängerstreifen» (MS.013-2025, Bestellnummer 2.457), Ziffer 2.1 bis 2.3.</li>}
          </ul>
          {mitBedarf && <VerzeichnisBericht blaetter={blaetter} />}
        </section>

        <footer className="bericht-fuss">
          <p><b>Die App ersetzt keine Beurteilung vor Ort.</b> Daten aus offenen Quellen können veraltet oder unvollständig sein (z. B.
            Parkierung, Hecken, Mauerhöhen, Signalisation).</p>
          <p>fgsCheck v{__APP_VERSION__} (Stand {datumText(__BUILD_DATUM__)}) · {APP_URL} · Code unter MIT, eigene Inhalte unter CC BY 4.0 · eingebundene
            Daten unter ihren eigenen Lizenzen (siehe Quellen).</p>
        </footer>
        </td></tr>
        {/* Anhang auf eigener Seite: Überschrift und Tabelle bleiben zusammen */}
        {mitBedarf && <tr className="bericht-neue-seite"><td>
        <section className="bericht-block">
          <h2>Anhang: Eingaben und Quellen{blaetter.length > 1 ? ` (vorbelegt nach ${blaetter[0].titel})` : ''}</h2>
          {/* Tabelle Feld · Wert · Quelle · Herleitung; eine Annahme zeigt die Spalte Quelle */}
          <table className="bericht-tabelle klein"><thead><tr><th>Angabe</th><th>Wert</th><th>Quelle</th><th>Herleitung</th></tr></thead>
            <tbody>{eingabenTabelle(blaetter[0]).map(z => <tr key={z.feld}><td>{z.feld}</td><td>{z.wert}</td><td>{z.quelle}</td>
              <td>{z.grund}</td></tr>)}</tbody></table>
        </section>
        </td></tr>}
        </tbody>
        </table>
      </article>
    </div>,
    document.body,
  )
}
