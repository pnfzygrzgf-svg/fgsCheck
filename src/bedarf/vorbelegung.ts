// ── Bedarfsmodul E1: Vorbelegung der Eingaben aus der vorhandenen Rechnung ──
//
// Keine neuen Datenquellen (E2): nur, was die Sichtprüfung ohnehin rechnet bzw. der Fall schon enthält. Jeder Wert trägt seine
// Quelle und eine Herkunft als Text; eine Handeingabe überschreibt ihn (fallBedarf.eingabenBilden). Was die Rechnung nicht hat,
// bleibt offen. Beurteilt wird je Querung: alle Teilstreifen auf einer Achse (gleicher Übergang, StreifenErgebnis.uebergangId).
//
// Vorbelegt: Querungstyp (Querungsart der Streifen), Lichtsignal, signalisiertes Tempo (gerade Zufahrten), innerorts (nur als
// Annahme bis 50 km/h), Fahrbahnbreite B und Querdistanzen L (Bordkanten der Rechnung entlang der Achse), Fahrstreifen je
// Richtung (OSM lanes, sonst Annahme aus der Fahrbahnbreite) und Gegenverkehr, Radstreifen (OSM), Tram (OSM-Gleis quert den
// Streifen nicht: kein Tram; quert es: offen mit Hinweis), Insel (Teilstreifen an einer Insel: AV, Fläche (Plan), Mittelinsel
// (Standard), Insel von Hand; Tiefe aus der Lücke zwischen den Teilstreifen), Durchfahrt neben der Insel, Streifenbreite,
// Abstand der Enden zum Rand, Winkel zur Fahrbahn (Streifen von Hand), Längsparkierung und Parkierung im Sichtfeld.
// Seit 20.10.2026 aus Geodaten (geo, siehe GeoVorbelegung; Abschnitt 18 der Regeln): Bushaltestelle (keine im Umkreis bzw. Hinweis),
// besonderer Grund «Haltestelle» (Annahme), Strecke oder Zone (OSM-Tags der Zufahrten), DTV (Geoportal Stadt Bern, sonst Annahme
// 500 in Bern) und ein Hinweis ohne Wert zur Beleuchtung (Strassenlampen und lit in OSM).
// Seit 21.10.2026 Automatik Paket A + B (automatik.ts, Abschnitt 22 der Regeln): innerorts und Strecke/Zone auch aus den OSM-Tags bzw.
// dem Tempo, Insel aus der AV als gebaut (Tatsache) mit Kopfüberstand, Tramgleis eigentrassee/Fahrbahn, dazu die übrigen Felder der
// Automatik (Lage, Abstände, Haltestelle, Annahmen mit Schwellen, Kopien in LSA-Zeiten und Trottoirüberfahrt). rechner: Felder im
// Zustand «rechner» (Sichtrechner rechnet je Zufahrt, z. B. Kurvenradius ohne Abbieger).
// Seit 23.10.2026 die Erkennungsdistanz aus dem Sichtrechner (erkennungVorbelegen, Annahme; Abschnitt 34 der Regeln).
// Seit 21.10.2026 Automatik Paket C (automatikC.ts, Abschnitt 24 der Regeln): Tempo aus V_sig und Strecke/Zone aus der
// Strassenhierarchie (Geoportal Stadt Bern), Strassentyp aus Hierarchie und Strassentypen (Vorrang vor OSM), besonderer Grund
// (Schulen, Kindergärten, Heime), Fusswegnetz, taktile Markierungen, Nutzungszonen, ÖV-Linien; Vortrittsrolle in automatik.ts.

import { type P, dot, sub, add, dist, imPolygon, abstandStrecke, segSchnitt } from '../geo'
import type { StreifenErgebnis } from '../rechner/typen'
import { zufahrtNamen } from '../benennung'
import { erkennungSatz, erkennungZusatz } from '../texte'
import { ERKENNUNG_FAKTOR, type Erkennung } from '../rechner/erkennung'
import { sichtFgs } from './tabellen'
import { type Fall, inselStandard } from '../fall'
import type { Quelle, TempoRegime } from './eingaben'
import type { Vorbelegung } from './fallBedarf'
import { feldName } from './felder'
import { E1_KURZ } from '../rechner/standardinsel'
import { imBereich, HALT_TEXT, type Bereich, type HaltestellenErgebnis, type OevHalt } from '../daten/haltestellen'
import type { VerkehrsdatenErgebnis, VdLinie } from '../daten/verkehrsdaten'
import { automatik, avInselBei, kopfUeberstandAv, zufSicht, type AutoGeo } from './automatik'
import { tag } from './lesetext'
import { knotensichtVorbelegung } from '../tue/texte'
import { TEMPO_QUELLE_AMTLICH } from '../rechner/tempo'
import { automatikC, strassentypBern, tempoAusHierarchie, vsigVorbelegen, zoneNachVsig } from './automatikC'
import { GEOPORTAL_BERN, type BernErgebnis } from '../daten/geoportal'
import type { RichtplanDaten } from '../daten/richtplanFussverkehr'
import type { StrassenhierarchieDaten } from '../daten/strassenhierarchie'
import type { VsigDaten } from '../daten/vsig'
import type { SchulenErgebnis } from '../daten/schulen'
import type { TaktilDaten } from '../daten/taktil'
import type { NutzungszonenDaten } from '../daten/nutzungszonen'
import type { OevLinienDaten } from '../daten/oevLinien'

/** Querung: Teilstreifen auf einer Achse (gleicher Übergang), in der Reihenfolge der Rechnung */
export interface QuerungGruppe { id: string; streifen: StreifenErgebnis[] }
export function querungen(streifen: StreifenErgebnis[]): QuerungGruppe[] {
  const m = new Map<string, StreifenErgebnis[]>()
  for (const s of streifen) m.set(s.uebergangId, [...(m.get(s.uebergangId) ?? []), s])
  return [...m].map(([id, st]) => ({ id, streifen: st }))
}

const f2 = (x: number) => x.toFixed(2).replace('.', ',')
const r2 = (x: number) => Math.round(x * 100) / 100
const einheit = (v: P): P => { const l = Math.hypot(v[0], v[1]); return l > 0 ? [v[0] / l, v[1] / l] : [1, 0] }

/** Teilstreifen an einer Insel: länger als das gilt als unplausibel (Runde 5, F5) */
export const TEIL_MAX_M = 12

/** Querungsart eines gerechneten Streifens: Fussgängerstreifen, ohne Vortritt (Furt bzw. übrige), Trottoirüberfahrt (Wahl am Streifen,
 * nicht geprüft) oder «kein FGS» (nicht geprüft) */
export const streifenTyp = (s: StreifenErgebnis): 'fgs' | 'furt' | 'ohne_vortritt' | 'trottoirueberfahrt' | 'kein' =>
  s.trottoirueberfahrt ? 'trottoirueberfahrt' : s.status === 'kein_fgs' ? 'kein' : s.querung?.typ ?? 'fgs'
/** Herkunft des Querungstyps aus der Wahl «Trottoirüberfahrt» am Streifen */
export const TUE_WAHL_TEXT = 'Wahl am Streifen: Trottoirüberfahrt'

/** Vorbelegung einer Querung: Werte; Hinweise zur Querung; feldHinweise: Hinweis ohne Wert je Feld (das Feld bleibt offen, z. B.
 * Haltestelle in der Nähe: Fahrbahn oder Bucht wählen). Die Hinweise ohne Wert stehen mit dem Feldnamen auch in hinweise. */
export interface Vorbelegt { werte: Vorbelegung; hinweise: string[]; feldHinweise?: Record<string, string>
  /** Anzeige je Pfad im Zustand «rechner» (Feld ohne Wert, Sichtrechner rechnet je Zufahrt; Automatik Paket A) */
  rechner?: Record<string, string>
  /** OSM-Knoten (Kreuzung bzw. Einmündung) bis 20 m von der Querung, wie für die Lage gefunden (automatik.ts); nur für Verweise */
  knoten?: number
  /** Felder, die offen bleiben, weil Datenquellen sich widersprechen (eingaben.Feld.strittig; bisher tempoRegime) */
  strittig?: string[] }

/** Geodaten für die Vorbelegung (App: geladen um den Ladeort); fehlt ein Eintrag, bleibt das Feld wie bisher offen */
export interface GeoVorbelegung extends AutoGeo {
  /** Haltestellen (Geoportal Stadt Bern bzw. OSM); null: noch nicht geladen */
  haltestellen?: HaltestellenErgebnis | null
  /** Verkehrsdaten (nur Stadt Bern); null: ausserhalb Berns bzw. noch nicht geladen */
  verkehrsdaten?: VerkehrsdatenErgebnis | null
  /** Tags der OSM-Strassen nach Weg-Id (osm.wegTags) */
  osmTags?: ReadonlyMap<number, Record<string, string>> | null
  /** Strassenlampen nach OSM (LV95) mit abgedecktem Bereich */
  lampen?: { punkte: P[]; bereich: Bereich } | null
  // Automatik Paket C (21.10.2026): weitere Dienste des Geoportals Stadt Bern (nur Bern; null: ausserhalb Berns bzw. noch nicht
  // geladen; { fehler }: Dienst nicht erreichbar; hinweis: ein Layer des Diensts fehlt) und OSM-Erweiterungen; Hilfen in daten/geoHilfen.ts
  /** Richtplan Fussverkehr: Basisnetz (Linien) und publikumsattraktive Bereiche (Flächen) */
  richtplan?: BernErgebnis<RichtplanDaten> | null
  /** Strassenhierarchie (Typ_id) und Strassentypen (Strgatt_id), Linien */
  strassenhierarchie?: BernErgebnis<StrassenhierarchieDaten> | null
  /** Signalisierte Höchstgeschwindigkeit (V_sig), Linien */
  vsig?: BernErgebnis<VsigDaten> | null
  /** Volksschulen und Kindergärten (Geoportal, nur Bern) sowie Schulen, Kindergärten und Heime nach OSM (überall) */
  schulen?: SchulenErgebnis | null
  /** Taktil-visuelle Markierungen: Felder (Punkte) und Linien (u. a. Leitlinie auf dem Streifen) */
  taktil?: BernErgebnis<TaktilDaten> | null
  /** Nutzungszonen (Grundzonen, Flächen; gewerbe = Industrie- und Gewerbezone) */
  nutzungszonen?: BernErgebnis<NutzungszonenDaten> | null
  /** ÖV-Linien (Bus, Trolleybus, Tram …), auf das Rechteck zugeschnitten */
  oevLinien?: BernErgebnis<OevLinienDaten> | null
  // vortritt (Vortrittszeichen nach OSM, überall) und strassentyp stehen in AutoGeo (automatik.ts)
}

/** Radstreifen an den geraden Zufahrten nach der Rechnung (OSM): true/false, null wenn eine Zufahrt ohne Angabe ist */
export function radstreifenAusRechnung(streifen: StreifenErgebnis[]): boolean | null {
  const v = streifen.flatMap(s => s.zufahrten.filter(z => z.art !== 'abbiegend')).map(z => z.velostreifenRechtsM)
  return v.length && v.every(x => x !== null) ? v.some(x => x! > 0) : null
}

/** Vorbelegung einer Querung (reine Funktion) */
export function vorbelegen(g: QuerungGruppe, fall: Fall, angenommeneInseln: { ring: P[] }[] = [], geo: GeoVorbelegung = {}): Vorbelegt {
  const w: Vorbelegung = {}
  const hinweise: string[] = []
  const feldHinweise: Record<string, string> = {}
  const rechner: Record<string, string> = {}
  const setze = (pfad: string, wert: unknown, quelle: Quelle, text: string, ganzeStrasse?: true) => {
    w[pfad] = { wert, quelle, text, ...(ganzeStrasse ? { ganzeStrasse } : {}) }
  }
  // Trottoirüberfahrt: Zufahrten der Rechnung nur für die Vorbelegung (ohne Sichtbefunde: zufSicht)
  const st = g.streifen.map(s => (s.nurVorbelegung ? { ...s, ...s.nurVorbelegung } : s))
  if (!st.length) return { werte: w, hinweise, feldHinweise, rechner }

  // Querungstyp aus der Querungsart der Streifen (Panel: «Querung» je Streifen)
  const typen = [...new Set(st.map(streifenTyp))]
  const mitLsa = st.some(s => s.lsa === 'ja')
  if (typen.length === 1 && typen[0] === 'fgs') setze('typ', mitLsa ? 'lsa' : 'fgs', 'rechnung', mitLsa
    ? 'Streifen als Fussgängerstreifen mit Lichtsignal gerechnet' : 'Streifen als Fussgängerstreifen gerechnet')
  else if (typen.length === 1 && typen[0] === 'trottoirueberfahrt') setze('typ', typen[0], 'hand', TUE_WAHL_TEXT)
  else if (typen.length === 1 && typen[0] !== 'kein') setze('typ', typen[0], 'hand', `Querungsart von Hand: ${typen[0] === 'furt' ? 'Furt' : 'ohne Vortritt'}`)
  else if (typen.length > 1) hinweise.push('Die Teilstreifen haben verschiedene Querungsarten: Querungstyp offen')
  else hinweise.push('Streifen als «kein FGS» nicht geprüft: Querungstyp offen')

  // Lichtsignal (Streifen-Eingabe bzw. OSM)
  const lsaJa = st.filter(s => s.lsa === 'ja')
  const lsaHand = st.some(s => s.lsaQuelle === 'von Hand')
  // Runde 5 (Stelle 40): eine Ampel in der Nähe ist eine Annahme, keine OSM-Tatsache; Knotennummer nur im Tooltip
  const lq = lsaJa[0]?.lsaQuelle ?? ''
  const ampelNah = /^Ampel in der Nähe/.test(lq), knotenNr = /Knoten (\d+)/.exec(lq)?.[1]
  setze('fgsMitLsa', lsaJa.length > 0, lsaHand ? 'hand' : ampelNah ? 'annahme' : 'osm', !lsaJa.length
    ? (lsaHand ? 'Lichtsignal von Hand: nein' : 'kein Lichtsignal in OSM am Streifen')
    : lsaHand ? 'Lichtsignal von Hand' : ampelNah ? `Ampel in der Nähe (OSM): als Lichtsignal der Querung angenommen${knotenNr ? tag(`Knoten ${knotenNr}`) : ''}`
      : `Lichtsignal am Übergang (OSM)${knotenNr ? tag(`Knoten ${knotenNr}`) : ''}`)

  // Tempo der geraden Zufahrten
  const gerade = st.flatMap(s => s.zufahrten.filter(z => z.art !== 'abbiegend'))
  // (Runde 5, Nutzerentscheid 21.10.2026: in Bern rechnet der Sichtrechner mit V_sig des Geoportals, Quelle «Geoportal»)
  if (gerade.length) {
    const v = Math.max(...gerade.map(z => z.tempo))
    const tz = gerade.filter(z => z.tempo === v)
    const q: Quelle = tz.some(z => z.tempoQuelle === 'Korrektur') ? 'hand' : tz.some(z => z.tempoQuelle === 'Ersatz') ? 'annahme'
      : tz.every(z => z.tempoQuelle === TEMPO_QUELLE_AMTLICH) ? 'geoportal' : 'osm'
    setze('vSig', v, q, q === 'hand' ? 'Tempo der Zufahrten (von Hand)' : q === 'annahme' ? 'Tempo 50 km/h angenommen (OSM ohne Angabe)'
      : q === 'geoportal' ? `Tempo der geraden Zufahrten (${GEOPORTAL_BERN}, signalisierte Höchstgeschwindigkeit)` : 'Tempo der geraden Zufahrten (OSM)')
  }

  // Bordkanten entlang der Achse: L je Teilquerung, B über die ganze Querung
  const s0 = st[0], n = einheit(sub(s0.p1, s0.p0))
  const proj = (p: P) => dot(sub(p, s0.p0), n)
  const alleAv = st.every(s => s.randQuelle === 'AV')
  const L = st.map(s => {
    const ns = einheit(sub(s.p1, s.p0))
    return dot(sub(s.rand[1], s.rand[0]), ns)
  })
  // Runde 5 (F5): Teilstreifen an einer Insel länger als TEIL_MAX_M sind unplausibel (z. B. schräg über eine Einmündung); dann keine
  // Masse aus ihnen (Fahrbahnbreite, Teilquerungen, Durchfahrt), nur ein Hinweis. Die Rechnung selbst bleibt unverändert
  const teilLang = st.length > 1 && L.some(x => x > TEIL_MAX_M) ? Math.max(...L) : null
  if (teilLang !== null) hinweise.push(`Streifen ungewöhnlich lang (bis ${Math.round(teilLang)} m je Teil): Fahrbahnbreite, Teilquerungen und ` +
    'Durchfahrt nicht vorbelegt, Masse prüfen')
  if (teilLang !== null) { /* unplausibel lange Teilstreifen: keine Masse vorbelegen (Hinweis oben) */ }
  else if (alleAv && L.every(x => x > 0)) {
    const ps = st.flatMap(s => s.rand).map(proj)
    const B = Math.max(...ps) - Math.min(...ps)
    setze('fahrbahnB', r2(B), 'rechnung', `Bordkanten der Rechnung (AV${fall.flaechenPlan?.length ? ' bzw. Flächen (Plan)' : ''}) entlang der Achse` +
      (st.length > 1 ? ', über die ganze Querung mit Insel' : ''))
    setze('querdistanzL', L.map(r2), 'rechnung', st.length > 1 ? 'Bordkante bis Insel je Teilquerung (Rechnung)' : 'Bordkante bis Bordkante (Rechnung)')
  } else if (st.length === 1 && s0.vermassung?.fahrbahnM != null && s0.vermassung.fahrbahnM > 0) {
    setze('fahrbahnB', r2(s0.vermassung.fahrbahnM), 'rechnung', 'AV-Sehne entlang der Achse (Vermassung; Bordkanten der Rechnung angenommen)')
    setze('querdistanzL', [r2(s0.vermassung.fahrbahnM)], 'rechnung', 'AV-Sehne entlang der Achse (Vermassung)')
  } else hinweise.push('Bordkanten angenommen (keine passende AV-Sehne): Fahrbahnbreite und Querdistanz offen')

  // Streifenbreite, Abstand der Enden zum Rand, Winkel (Vermassung der Streifen von Hand)
  setze('streifenBreite', r2(Math.min(...st.map(s => s.bw))), 'rechnung', 'Breite (Balkenlänge) der Streifen')
  if (alleAv) {
    const ab = st.flatMap(s => {
      const ns = einheit(sub(s.p1, s.p0))
      return [dot(sub(s.p0, s.rand[0]), ns), dot(sub(s.rand[1], s.p1), ns)]
    })
    setze('randAbstand', ab.map(r2), 'rechnung', 'Enden bis Fahrbahnrand entlang der Achse (+ vor dem Rand, − darüber hinaus)')
  }
  // Winkel Streifenachse zur Fahrbahn: aus der Fahrtrichtung der geraden Zufahrten (die Vermassung misst zum nächsten OSM-Weg, an
  // Knoten oft zum falschen); 90 = rechtwinklig, der kleinste Winkel zählt
  const gerade0 = st.flatMap(s => s.zufahrten.filter(z => z.art !== 'abbiegend').map(z => ({ s, z })))
  const winkel = gerade0.map(({ s, z }) => {
    const a = Math.atan2(s.p1[1] - s.p0[1], s.p1[0] - s.p0[0]) * 180 / Math.PI
    const d = (((z.richtung - a) % 180) + 180) % 180
    return Math.min(d, 180 - d)
  })
  if (winkel.length) setze('achsWinkel', Math.round(Math.min(...winkel) * 10) / 10, 'rechnung', 'Fahrtrichtung der geraden Zufahrten zur Streifenachse')

  // Fahrstreifen je Richtung (gerade Zufahrten), Gegenverkehr, Radstreifen
  const richtungen: { grad: number; n: number; osm: boolean }[] = []
  for (const z of gerade) {
    const r = richtungen.find(x => Math.abs(((z.richtung - x.grad + 540) % 360) - 180) <= 45)
    const nz = z.fahrstreifenOsmN ?? (z.mehrstreifig ? 2 : 1)
    const osm = z.fahrstreifenOsmN != null
    if (r) { r.n = Math.max(r.n, nz); r.osm = r.osm && osm } else richtungen.push({ grad: z.richtung, n: nz, osm })
  }
  if (richtungen.length) {
    const osm = richtungen.every(r => r.osm)
    setze('nRichtung', richtungen.map(r => r.n), osm ? 'osm' : 'annahme', osm ? 'Fahrstreifen nach OSM (lanes)' :
      'Fahrstreifen aus der Fahrbahnbreite je Richtung geschätzt (OSM ohne lanes)')
    const einbahn = gerade.every(z => z.art === 'einbahn')
    if (richtungen.length >= 2 || gerade.some(z => z.art === 'beide')) setze('zweirichtung', true, 'osm', 'Zufahrten aus beiden Richtungen')
    else if (einbahn) setze('zweirichtung', false, 'osm', 'Einbahn nach OSM')
    else if (st.length > 1 && gerade.some(z => z.art === 'insel'))
      setze('zweirichtung', true, 'annahme', 'Teilstreifen an einer Insel: je Fahrbahnteil eine Richtung angenommen')
    const velo = radstreifenAusRechnung(st)
    if (velo !== null) setze('radstreifen', velo, 'osm', velo ? 'Velostreifen nach OSM' : 'kein Velostreifen in OSM')
    const park = gerade.map(z => z.parkRechts)
    if (park.every(x => x !== null)) setze('laengsparkierung', park.some(x => !!x), 'rechnung', park.some(x => !!x)
      ? 'Parkierung rechts an der Zufahrt (OSM bzw. Parkfelder)' : 'keine Parkierung rechts an den Zufahrten')
  }
  const zuf = zufSicht(st)
  if (zuf.length) {
    const auto = zuf.flatMap(z => z.konflikte.filter(k => k.klasse === 'auto'))
    setze('parkierungSichtbehindernd', auto.length > 0, 'rechnung', auto.length ? 'Auto-Parkfelder im Sichtfeld (Sichtrechner)' : 'keine Auto-Parkfelder im Sichtfeld')
    setze('haltenSichtrelevantUeber5m', auto.some(k => k.abstand > 5), 'rechnung', auto.some(k => k.abstand > 5)
      ? 'Auto-Parkfelder im Sichtfeld weiter als 5 m vom Streifen' : 'keine Auto-Parkfelder im Sichtfeld weiter als 5 m vom Streifen')
  }

  // Tram (OSM-Gleis); quert eines, bestimmt die Automatik (AV bzw. OSM embedded) die Art, sonst Hinweis (unten)
  if (st.every(s => s.tram === false)) setze('tram', 'keins', 'osm', 'kein Tramgleis in OSM am Streifen')

  // Kurve: Sichtweite nach Tab. 1, solange die Voraussetzungen für Tab. 2 nicht bestätigt sind
  setze('kurve.fuenfBedingungen', false, 'annahme', 'Sichtweite nach Tab. 1 (Voraussetzungen für die Kurvenregel nicht bestätigt)')

  // Insel: Teilstreifen auf einer Achse sind an einer Insel geteilt
  if (st.length === 1) setze('insel.vorhanden', false, 'rechnung', 'Streifen nicht an einer Insel geteilt')
  else {
    const sortiert = [...st].sort((a, b) => proj(a.m) - proj(b.m))
    const luecken = sortiert.slice(1).map((b, i) => {
      const a = sortiert[i]
      const aMax = Math.max(...a.rand.map(proj)), bMin = Math.min(...b.rand.map(proj))
      return { tiefe: bMin - aMax, m: [s0.p0[0] + n[0] * (aMax + bMin) / 2, s0.p0[1] + n[1] * (aMax + bMin) / 2] as P,
        aMax, bMin }
    })
    const l = luecken.reduce((x, y) => (y.tiefe > x.tiefe ? y : x))
    const mPunkt = l.m
    const plan = (fall.flaechenPlan ?? []).filter(fp => fp.art === 'insel' && imPolygon(mPunkt, [fp.ring]))
    const standard = plan.map(inselStandard).find(x => !!x)
    const hand = fall.hindernisse.find(h => h.art === 'insel' && imPolygon(mPunkt, [h.ring]))
    const angenommen = angenommeneInseln.find(z => imPolygon(mPunkt, [z.ring]))
    const quelle: Quelle = standard || plan.length ? 'rechnung' : hand ? 'hand' : angenommen ? 'luftbild' : 'av'
    const text = standard ? `${E1_KURZ} (Fläche (Plan) von Hand)` : plan.length ? 'Fläche (Plan) Insel von Hand' : hand ? 'Insel von Hand'
      : angenommen ? 'Insel angenommen nach OSM und Luftbild – prüfen' : 'AV-Verkehrsinsel auf der Achse'
    setze('insel.vorhanden', true, quelle, `Teilstreifen an einer Insel: ${text}`)
    // quer zur Fahrbahn wie die Regeln F2/F2b (Lücke entlang der Achse mal sin(Winkel Achse–Fahrbahn)); Mittelinsel: ihre Tiefe
    const sinW = winkel.length ? Math.sin(Math.min(...winkel) * Math.PI / 180) : 1
    const tiefe = standard ? standard.tiefe : l.tiefe * sinW
    if (tiefe > 0) setze('insel.breite', r2(tiefe), quelle, standard ? `${E1_KURZ}: Tiefe ${f2(standard.tiefe)} m` :
      `Lücke zwischen den Teilstreifen (Rechnung), quer zur Fahrbahn${winkel.length ? '' : ' (Winkel unbekannt: entlang der Achse)'}`)
    if (standard) {
      setze('insel.art', 'baulich', 'rechnung', `${E1_KURZ}: erhöhte Insel`)
      setze('insel.vertikal', true, 'rechnung', `${E1_KURZ}: Signalmast im Kopf`)
      setze('insel.furt', standard.furt, 'rechnung', `${E1_KURZ}: Rollstuhlfurt ${f2(standard.furt)} m`)
      setze('insel.kopfUeberstand', [r2(standard.kopf), r2(standard.kopf)], 'rechnung', `${E1_KURZ}: Kopflänge ${f2(standard.kopf)} m`)
    } else if (quelle === 'av' && avInselBei(geo.av, mPunkt)) {
      // Automatik Paket A: AV-Verkehrsinsel unter der Lücke ist gebaut (Tatsache); Kopfüberstand aus ihrem Umriss (Paket B)
      setze('insel.art', 'baulich', 'av', 'AV-Verkehrsinsel unter der Lücke: gebaut')
      const k = kopfUeberstandAv(geo.av!, mPunkt, st)
      if (k) setze('insel.kopfUeberstand', k, 'av', 'AV-Inselumriss entlang der Fahrbahn über die Streifenränder hinaus, je Seite')
    } else if (!angenommen) setze('insel.art', 'baulich', 'annahme', `${text}: baulich angenommen`)
    // Durchfahrt neben der Insel: Teilquerungen (Bord bis Insel), quer zur Fahrbahn
    if (alleAv && teilLang === null) {
      const seiten = sortiert.map(s => {
        const ns = einheit(sub(s.p1, s.p0))
        return dot(sub(s.rand[1], s.rand[0]), ns) * sinW
      })
      setze('durchfahrt', seiten.map(r2), 'rechnung', 'Teilquerungen Bord bis Insel (Rechnung), quer zur Fahrbahn')
    }
  }

  // Geodaten (Abschnitt 18): Haltestelle, Zone, DTV, Beleuchtung (nur Hinweis)
  const feldHinweis = (pfad: string, text: string) => { feldHinweise[pfad] = text; hinweise.push(`${feldName(pfad)}: ${text}`) }
  haltestelleVorbelegen(st, geo.haltestellen ?? null, setze, feldHinweis)
  const tags = geo.osmTags ?? null
  const wegTagsGerade = tags ? gerade.map(z => wegId(z.osmWeg)).map(id => (id === null ? null : tags.get(id) ?? null)) : []
  let zoneText = ''
  if (tags) {
    const z = zoneAusOsm(wegTagsGerade)
    if (z.wert) setze('tempoRegime', z.wert, 'osm', z.text)
    else zoneText = z.text
    // innerorts aus den OSM-Tags (Automatik Paket A): CH:urban, CH:zone*, living_street ja; CH:rural nein; widersprüchlich offen
    const io = innerortsAusOsm(wegTagsGerade)
    if (io.wert !== null) setze('innerorts', io.wert, 'osm', io.text)
    else if (io.text) { delete w.innerorts; feldHinweis('innerorts', io.text) }
  }
  // Paket C: Tempo aus V_sig (Geoportal) vor OSM; eine OSM-Strecke nur aus maxspeed bzw. eine OSM-Zone passt dann ggf. nicht mehr
  vsigVorbelegen(st, geo.vsig, w, setze, hinweise)
  innerortsAusTempo(st, w, setze, feldHinweise, tags)
  // Nutzerentscheid 23.10.2026: amtliches Tempo ab 30 km/h (V_sig des Geoportals) gegen eine Begegnungszone aus OSM (living_street,
  // zone20) ist ein Widerspruch: Strecke/Zone offen mit Hinweis; ohne Geoportal (ausserhalb Berns) bleibt die OSM-Begegnungszone Tatsache
  const vs0 = w.vSig
  let bgzWiderspruch = false
  const strittig: string[] = []
  if (w.tempoRegime?.wert === 'begegnungszone' && w.tempoRegime.quelle === 'osm' && vs0?.quelle === 'geoportal' && typeof vs0.wert === 'number'
    && vs0.wert >= 30) {
    delete w.tempoRegime
    zoneText = `OSM: Begegnungszone, ${GEOPORTAL_BERN}: Tempo ${vs0.wert} km/h – Strecke oder Zone von Hand wählen`
    bgzWiderspruch = true
    strittig.push('tempoRegime')
  }
  const vsigZone = zoneNachVsig(w, setze)
  if (vsigZone) zoneText = `${vsigZone}: Strecke oder Zone von Hand wählen`
  // Strecke aus dem Tempo (Automatik Paket A): ab 40 km/h keine Zone (eine Zone hat höchstens 30 km/h). Nur ohne Hinweis aus den
  // OSM-Tags (z. B. Tempo 30 ohne Zonenangabe bzw. Zufahrten widersprüchlich); Tempo 20 siehe unten
  const vs = w.vSig
  // Korrektur S3: V_sig ab 40 km/h (Geoportal) gegen einen OSM-Hinweis (z. B. Tempo 30 ohne Zonenangabe): Strecke nach dem Geoportal
  if (!w.tempoRegime && !bgzWiderspruch && zoneText && vs?.quelle === 'geoportal' && typeof vs.wert === 'number' && vs.wert >= 40) {
    setze('tempoRegime', 'strecke', 'geoportal', `Tempo ${vs.wert} km/h laut ${GEOPORTAL_BERN}: Strecke (eine Zone hat höchstens 30 km/h; ` +
      `OSM widerspricht: ${zoneText})`)
    zoneText = ''
  }
  if (!w.tempoRegime && !zoneText && vs && typeof vs.wert === 'number') {
    if (vs.wert >= 40) setze('tempoRegime', 'strecke', vs.quelle === 'hand' ? 'rechnung' : vs.quelle,
      `Tempo ${vs.wert} km/h: Strecke (eine Zone hat höchstens 30 km/h)`)
  }
  // Nutzerentscheid 23.10.2026: Tempo 20 (Geoportal bzw. OSM) → Begegnungszone als Vorschlag (Quelle «vorschlag»): gilt für die
  // Beurteilung wie eine Tatsache (Tempo 20 auf einer Strecke ist sehr selten) und ist von Hand auf «Strecke» änderbar (Handeingabe geht
  // vor). Widerspricht eine Zonenangabe in OSM (Tempo-30-Zone, Strecke CH:urban …), bleibt Strecke/Zone offen mit Hinweis.
  // Nachtrag nach Prüfung: massgebend ist das wirksame Tempo (eine Handeingabe im Bedarf geht vor; nicht 20: kein Vorschlag) und das
  // Rohtempo genau 20 (V_sig des Geoportals bzw. OSM maxspeed; der Sichtrechner rundet OSM 5 bzw. 10 km/h auf die Stufe 20).
  // maxspeed=20 mit maxspeed:type=CH:urban am selben Weg ist eine bewusst erfasste Strecke 20 (Entscheid Prüfer), kein Widerspruch.
  const hv = fall.bedarf?.felder.vSig
  const vEff = hv ? (typeof hv.wert === 'number' ? { wert: hv.wert, quelle: hv.quelle } : null) : vs
  if (vEff && vEff.wert === 20 && roh20(vEff.quelle, wegTagsGerade) && w.tempoRegime?.wert !== 'begegnungszone') {
    const andere = wegTagsGerade.filter((t): t is Record<string, string> => !!t && hatZonenangabe(t))
      .map(t => ({ z: zoneAusTags(t), t }))
      .filter(({ z, t }) => z.wert !== null && z.wert !== 'begegnungszone' && !(z.wert === 'strecke' && Number(t.maxspeed) === 20))
      .map(({ z }) => z)
    const von = vEff.quelle === 'geoportal' ? GEOPORTAL_BERN : vEff.quelle === 'osm' ? 'OSM' : vEff.quelle === 'hand' ? 'Eingabe von Hand' : 'Vorbelegung'
    if (andere.length) {
      delete w.tempoRegime
      zoneText = `Tempo 20 km/h laut ${von}, aber ${[...new Set(andere.map(z => z.text))].join(' bzw. ')}: widersprüchlich, ` +
        'Strecke oder Zone von Hand wählen'
    } else if (w.tempoRegime?.wert === 'strecke' && w.tempoRegime.quelle === 'osm') {
      // Strecke 20 aus OSM (maxspeed=20 und CH:urban): bleibt Tatsache
    } else {
      setze('tempoRegime', 'begegnungszone', 'vorschlag', `Tempo 20 km/h laut ${von}: Begegnungszone vorgeschlagen (Tempo 20 auf einer ` +
        'Strecke ist selten; sonst unter «Strecke oder Zone» Strecke wählen)')
      zoneText = ''
    }
  }
  // Paket C: Tempo 30 ohne Zonenangabe in Bern: Strassenhierarchie (Annahme) bzw. Hinweis; nur, wenn OSM an keiner Zufahrt eine
  // Zonenangabe hat (Korrektur M1: ein OSM-Zonentag geht immer vor, widersprüchliche Zufahrten bleiben offen)
  const hierText = wegTagsGerade.some(t => t && hatZonenangabe(t)) ? '' : tempoAusHierarchie(st, geo, w, setze)
  if (!w.tempoRegime && (zoneText || hierText)) feldHinweis('tempoRegime', [zoneText, hierText].filter(Boolean).join('; '))
  // Erkennungsdistanz aus dem Sichtrechner (Nutzerentscheid 23.10.2026): kleinster Wert der geraden Zufahrten, als Annahme (nach
  // dem Tempo aus V_sig: ein Wert «mindestens» bzw. «so weit geprüft» gilt nur, wenn er das Doppelte der Sichtweite erreicht)
  erkennungVorbelegen(st, fall, w, setze, feldHinweis)
  dtvVorbelegen(st, gerade.map(z => z.spur), geo.verkehrsdaten ?? null, setze, feldHinweis)
  const licht = beleuchtungHinweis(st, gerade.map(z => wegId(z.osmWeg)), tags, geo.lampen ?? null)
  if (licht) feldHinweis('beleuchtung', licht)
  // Automatik Paket A + B (automatik.ts); Strassentyp aus dem Geoportal (Paket C) hat Vorrang vor OSM
  const aus: { knoten?: number } = {}
  automatik({ st, fall, geo: { ...geo, strassentyp: geo.strassentyp ?? strassentypBern(st, geo.strassenhierarchie) }, w, setze, feldHinweis,
    hinweise, rechner, aus })
  // Automatik Paket C (automatikC.ts)
  const feldHinweisWeg = (pfad: string) => {
    const t = feldHinweise[pfad]
    if (t === undefined) return
    delete feldHinweise[pfad]
    const i = hinweise.indexOf(`${feldName(pfad)}: ${t}`)
    if (i >= 0) hinweise.splice(i, 1)
  }
  automatikC({ st, geo, w, setze, feldHinweis, feldHinweisWeg, hinweise })
  // Trottoirüberfahrt (K4): die Knotensicht (tue/knotensicht.ts) beantwortet «Sicht beim Ausfahren», nur mit eindeutigem Ergebnis beider
  // Phasen; sonst bleibt die Frage offen (Hinweis). Eine Handeingabe geht vor (fallBedarf)
  const kv = knotensichtVorbelegung(g.streifen.flatMap(s => (s.knotensicht ? [s.knotensicht] : [])))
  if (kv && 'hinweis' in kv) feldHinweis('q3.knotensichtOk', kv.hinweis)
  else if (kv) setze('q3.knotensichtOk', kv.wert, kv.quelle, kv.text)
  if (st.some(s => s.tram === true) && !w.tram && !feldHinweise.tram)
    hinweise.push('Ein Tramgleis nach OSM quert die Querung: Art (Fahrbahn bzw. Eigentrassee) von Hand wählen')
  return { werte: w, hinweise, feldHinweise, rechner, ...(aus.knoten !== undefined ? { knoten: aus.knoten } : {}),
    ...(strittig.length && !w.tempoRegime ? { strittig } : {}) }
}

/** Kurzname einer Quelle in Herkunftstexten */
const QUELLE_KURZ: Partial<Record<Quelle, string>> = { geoportal: 'Geoportal', osm: 'OSM', hand: 'von Hand', annahme: 'angenommen', rechnung: 'Rechnung' }

/**
 * Innerorts als Annahme (Runde 5, F1): nicht schon aus den OSM-Tags der geraden Zufahrten bzw. widersprüchlich. Signalisiertes Tempo
 * der gequerten Strasse bis 50 km/h (Sichtrechner bzw. Geoportal); ohne es (nur Abbieger, z. B. Querung über die Seitenstrasse)
 * OSM-Tags bzw. Tempo der einmündenden Strassen bis 50 km/h. Die Bauzone (Nutzungszonenplan, automatikC) stützt bzw. ergänzt das.
 */
function innerortsAusTempo(st: StreifenErgebnis[], w: Vorbelegung, setze: Setze, feldHinweise: Record<string, string>,
  tags: ReadonlyMap<number, Record<string, string>> | null): void {
  if (w.innerorts || feldHinweise.innerorts) return
  const vs = w.vSig
  // das Ersatztempo 50 km/h (OSM ohne Angabe) ist kein Hinweis auf innerorts (Korrektur nach Prüfung Runde 5)
  if (vs && typeof vs.wert === 'number' && vs.quelle !== 'annahme') {
    if (vs.wert <= 50) setze('innerorts', true, 'annahme', `Tempo ${vs.wert} km/h (${QUELLE_KURZ[vs.quelle] ?? vs.quelle}): innerorts angenommen`)
    return
  }
  const abb = st.flatMap(s => s.zufahrten.filter(z => z.art === 'abbiegend'))
  if (!abb.length) return
  if (tags) {
    const io = innerortsAusOsm(abb.map(z => wegId(z.osmWeg)).map(id => (id === null ? null : tags.get(id) ?? null)))
    if (io.wert !== null) { setze('innerorts', io.wert, 'osm', `${io.text} an der einmündenden Strasse`); return }
  }
  const mit = abb.filter(z => z.tempoQuelle !== 'Ersatz')
  if (mit.length && mit.every(z => z.tempo <= 50)) {
    const v = Math.max(...mit.map(z => z.tempo))
    const q = mit.every(z => z.tempoQuelle === TEMPO_QUELLE_AMTLICH) ? 'Geoportal' : mit.some(z => z.tempoQuelle === 'Korrektur') ? 'von Hand' : 'OSM'
    setze('innerorts', true, 'annahme', `Tempo der einmündenden Strasse ${v} km/h (${q}): innerorts angenommen`)
  }
}

/**
 * Erkennungsdistanz (Nutzerentscheid 23.10.2026, Abschnitt 34 der Regeln): kleinster Wert über die geprüften geraden Zufahrten der
 * Fussgängerstreifen (ZufahrtErgebnis.erkennungM; Abbieger rechnet der Sichtrechner nicht), Quelle «annahme» (2D, ohne Gelände und
 * ohne Signal 4.11). Endet die Fahrlinie vorher, ist der Wert ihre Länge («mindestens …»); bei gleichem Wert zählt ein gerechneter vor
 * einem «mindestens». Eine Handeingabe geht vor (fallBedarf.eingabenBilden).
 * Untergrenzen («mindestens» bzw. frei bis zur Prüfgrenze) belegen das Feld nur, wenn sie das Doppelte der Sichtweite nach dem höchsten
 * bekannten Tempo erreichen (Tempo der Zufahrten, signalisiert vorbelegt bzw. von Hand, V85 von Hand): sonst würde die Grundprüfung
 * aus einer nicht weit genug geprüften Sicht eine Verletzung ableiten. Dann bleibt das Feld offen, mit dem Ergebnis als Hinweis.
 */
export function erkennungVorbelegen(st: StreifenErgebnis[], fall: Fall, w: Vorbelegung, setze: Setze, feldHinweis: FeldHinweis): void {
  const kand = st.flatMap((s, i) => {
    if (streifenTyp(s) !== 'fgs') return []
    const namen = zufahrtNamen(s)
    return s.zufahrten.filter(z => z.art !== 'abbiegend' && z.erkennungM).map(z => {
      const nr = namen.zufahrt.get(z.zufahrt)?.nr
      const name = `${st.length > 1 ? `Teil ${i + 1}, ` : ''}${nr ? `Zufahrt ${nr}` : `Zufahrt ${z.zufahrt}`}`
      return { e: z.erkennungM!, name, tempo: z.tempo }
    })
  })
  if (!kand.length) return
  const rang = (x: { e: Erkennung }) => x.e.wert + (x.e.bis === 'fahrlinie_endet' ? 0.5 : 0)
  const min = kand.reduce((a, b) => (rang(b) < rang(a) ? b : a))
  const text = `Sichtrechner: Streifen ${erkennungSatz(min.e)} (${min.name}, ${erkennungZusatz(min.e)}), ohne Gelände; nur Markierung geprüft, ` +
    'blaue Tafel (Signal 4.11) nicht'
  const zahl = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  const hand = (p: string) => zahl(fall.bedarf?.felder[p]?.wert)
  const v = Math.max(...[zahl(w.vSig?.wert), hand('vSig'), hand('v85'), ...kand.map(k => k.tempo)].filter((x): x is number => x !== null))
  const noetig = ERKENNUNG_FAKTOR * sichtFgs(v)
  if (min.e.bis === 'verdeckt' || min.e.wert >= noetig - 1e-9) setze('erkennungM', min.e.wert, 'annahme', text)
  else feldHinweis('erkennungM', `${text}; nötig ${noetig} m (doppelte Sichtweite bei ${v} km/h), so weit nicht geprüft: von Hand angeben`)
}

// ── Geodaten (Abschnitt 18 der Regeln) ──
type Setze = (pfad: string, wert: unknown, quelle: Quelle, text: string) => void
type FeldHinweis = (pfad: string, text: string) => void
const wegId = (x: string | null | undefined): number | null => {
  const n = Number(String(x ?? '').replace(/^w/, ''))
  return x && Number.isInteger(n) && n > 0 ? n : null
}
const ganz = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')

/** Abstand eines Punkts zum Streifen (Umriss; 0 innerhalb), ohne Umriss zur Achse */
export function abstandZumStreifen(p: P, s: StreifenErgebnis): number {
  const u = s.umriss
  if (!u || u.length < 3) return abstandStrecke(p, s.p0, s.p1)
  if (imPolygon(p, [[...u, u[0]]])) return 0
  let d = Infinity
  for (let i = 0; i < u.length; i++) d = Math.min(d, abstandStrecke(p, u[i], u[(i + 1) % u.length]))
  return d
}
/** Eckpunkte der Streifen (Umriss bzw. Achsenenden) */
const streifenPunkte = (st: StreifenErgebnis[]): P[] => st.flatMap(s => (s.umriss?.length >= 3 ? s.umriss : [s.p0, s.p1]))

/** Umkreis um den Streifen, in dem eine Haltestelle als «an der Querung» gilt */
export const HALT_UMKREIS_M = 50

function haltestelleVorbelegen(st: StreifenErgebnis[], h: HaltestellenErgebnis | null, setze: Setze, feldHinweis: FeldHinweis): void {
  if (!h) return
  if ('fehler' in h) { feldHinweis('haltestelle.art', `Haltestellen konnten nicht geladen werden (${h.fehler})`); return }
  const zusatz = h.zusatz ? `; ${h.zusatz}` : ''
  const naechste = h.halte.map(x => ({ x, d: Math.min(...st.map(s => abstandZumStreifen(x.p, s))) }))
    .filter(y => y.d <= HALT_UMKREIS_M + 1e-9).sort((a, b) => a.d - b.d)
  if (naechste.length) {
    const { x, d } = naechste[0] as { x: OevHalt; d: number }
    const wo = `${HALT_TEXT[x.art]} «${x.name}», ${ganz(d)} m (${h.herkunft}${zusatz})`
    feldHinweis('haltestelle.art', `${HALT_TEXT[x.art]} «${x.name}» (${ganz(d)} m): Bitte angeben, ob der Bus auf der Fahrbahn oder in einer Bucht ` +
      `hält${x.art === 'tram' ? ' (bzw. «keine», wenn dort nur das Tram hält)' : ''}${tag(`${h.herkunft}${zusatz}`)}`)
    // Korrektur nach Prüfung (M5): die Haltestelle ist eine Tatsache aus den Daten, keine Annahme (nicht unter «Annahmen»)
    setze('beduerfnis', ['haltestelle'], h.quelle, `${wo}: Haltestelle an der Querung als Grund für Vortritt`)
    return
  }
  if (!streifenPunkte(st).every(p => imBereich(p, HALT_UMKREIS_M, h.bereich))) {
    feldHinweis('haltestelle.art', `Haltestellen nur bis ${h.bereich.radiusM} m um den Ladeort geladen (${h.herkunft}): Umkreis von ` +
      `${HALT_UMKREIS_M} m um den Streifen nicht ganz abgedeckt`)
    return
  }
  setze('haltestelle.art', 'keine', h.quelle, `keine Haltestelle im Umkreis von ${HALT_UMKREIS_M} m (${h.herkunft}${zusatz})`)
}

/**
 * Strecke oder Zone aus den Tags eines OSM-Wegs: Zone nur mit ausdrücklicher Angabe (zone:maxspeed, maxspeed:type, maxspeed bzw.
 * source:maxspeed = CH:zone30 / CH:zone20, highway=living_street); Strecke mit CH:urban/CH:rural bzw. maxspeed über 30 km/h ohne
 * Zonenangabe (eine Zone hat höchstens 30 km/h). Tempo 30 bzw. 20 ohne Zonenangabe: null (offen, Hinweis).
 */
export function zoneAusTags(t: Record<string, string>): { wert: TempoRegime | null; text: string } {
  for (const k of ['zone:maxspeed', 'maxspeed:type', 'maxspeed', 'source:maxspeed']) {
    const v = (t[k] ?? '').trim()
    if (/^CH:zone30$/.test(v)) return { wert: 't30_zone', text: `Tempo-30-Zone (OSM)${tag(`${k}=${v}`)}` }
    if (/^CH:(zone20|living_street)$/.test(v)) return { wert: 'begegnungszone', text: `Begegnungszone (OSM)${tag(`${k}=${v}`)}` }
    if (/^CH:(urban|rural|trunk|motorway)$/.test(v)) return { wert: 'strecke', text: `Strecke (OSM)${tag(`${k}=${v}`)}` }
  }
  if (t.highway === 'living_street') return { wert: 'begegnungszone', text: `Begegnungszone (OSM)${tag('highway=living_street')}` }
  const v = Number((t.maxspeed ?? '').trim())
  if (Number.isFinite(v) && v > 30) return { wert: 'strecke', text: `Strecke (OSM: Tempo ${v} ohne Zonenangabe)${tag(`maxspeed=${v}`)}` }
  if (Number.isFinite(v) && v > 0) return { wert: null, text: `Tempo ${v} in OSM ohne Zonenangabe${tag('weder zone:maxspeed noch maxspeed:type')}` }
  return { wert: null, text: '' }
}

/**
 * Innerorts aus den OSM-Tags eines Wegs (Automatik Paket A): CH:urban, CH:zone30/zone20 bzw. highway=living_street → ja;
 * CH:rural (bzw. CH:trunk, CH:motorway) → nein; sonst null
 */
export function innerortsAusTags(t: Record<string, string>): { wert: boolean | null; text: string } {
  for (const k of ['maxspeed:type', 'source:maxspeed', 'zone:maxspeed', 'maxspeed']) {
    const v = (t[k] ?? '').trim()
    if (/^CH:(urban|zone30|zone20|living_street)$/.test(v)) return { wert: true, text: `innerorts (OSM)${tag(`${k}=${v}`)}` }
    if (/^CH:(rural|trunk|motorway)$/.test(v)) return { wert: false, text: `ausserorts (OSM)${tag(`${k}=${v}`)}` }
  }
  if (t.highway === 'living_street') return { wert: true, text: `innerorts (OSM)${tag('highway=living_street')}` }
  return { wert: null, text: '' }
}
/** Innerorts aus den Wegen der geraden Zufahrten: ein eindeutiger Wert, sonst null (widersprüchlich: Text) */
export function innerortsAusOsm(wege: (Record<string, string> | null)[]): { wert: boolean | null; text: string } {
  const z = wege.map(t => (t ? innerortsAusTags(t) : { wert: null, text: '' })).filter(x => x.wert !== null)
  const werte = new Set(z.map(x => x.wert))
  if (werte.size > 1) return { wert: null, text: `Zufahrten widersprüchlich: ${[...new Set(z.map(x => x.text))].join(' bzw. ')}; von Hand wählen` }
  return z.length ? { wert: z[0].wert, text: z[0].text } : { wert: null, text: '' }
}

/** Zonenangabe in den OSM-Tags eines Wegs (zone:maxspeed, maxspeed:type, source:maxspeed bzw. maxspeed mit CH:…, living_street) */
export const hatZonenangabe = (t: Record<string, string>): boolean => !!(t['zone:maxspeed'] || t['maxspeed:type'] ||
  /^CH:/.test(t['source:maxspeed'] ?? '') || /^CH:/.test(t.maxspeed ?? '') || t.highway === 'living_street')

/**
 * Rohtempo genau 20 km/h (Nachtrag nach Prüfung 23.10.2026): V_sig des Geoportals bzw. eine Eingabe von Hand zählen wie angegeben;
 * Tempo aus OSM nur, wenn maxspeed der Wege der geraden Zufahrten (ohne Rundung auf die Stufe) überall genau 20 ist; sonst nein
 */
function roh20(quelle: Quelle, wege: (Record<string, string> | null)[]): boolean {
  if (quelle === 'geoportal' || quelle === 'hand' || quelle === 'bestaetigt') return true
  if (quelle !== 'osm') return false
  const v = wege.filter((t): t is Record<string, string> => !!t && t.maxspeed !== undefined).map(t => Number(t.maxspeed.trim()))
  return v.length > 0 && v.every(x => x === 20)
}

/** Strecke oder Zone aus den Tags der Wege der geraden Zufahrten (null: Weg unbekannt): nur wenn alle eindeutig und gleich */
export function zoneAusOsm(wege: (Record<string, string> | null)[]): { wert: TempoRegime | null; text: string } {
  if (!wege.length) return { wert: null, text: '' }
  const z = wege.map(t => (t ? zoneAusTags(t) : { wert: null, text: '' }))
  const werte = [...new Set(z.map(x => x.wert).filter((x): x is TempoRegime => !!x))]
  if (werte.length > 1) return { wert: null, text: `Zufahrten widersprüchlich: ${[...new Set(z.filter(x => x.wert).map(x => x.text))].join(' bzw. ')}; ` +
    'Strecke oder Zone von Hand wählen' }
  if (werte.length === 1 && z.every(x => x.wert)) return { wert: werte[0], text: z[0].text }
  const ohne = [...new Set(z.filter(x => !x.wert && x.text).map(x => x.text))]
  if (werte.length === 1) return { wert: null, text: `nur ein Teil der Zufahrten mit Angabe (${z.find(x => x.wert)!.text}` +
    `${ohne.length ? `; sonst ${ohne.join(', ')}` : ''}): Strecke oder Zone von Hand wählen` }
  return { wert: null, text: ohne.length ? `${ohne.join(', ')}: Strecke oder Zone von Hand wählen` : '' }
}

/** DTV: Abstand (m), bis zu dem eine Zufahrt an einer Verkehrsdaten-Linie liegt; Anteil, bis zu dem sie als «ohne Eintrag» gilt */
export const VD_NAH_M = 10
export const VD_LEER_MAX = 0.2
/** Annahme ohne Eintrag in Bern (Nutzerentscheid 20.10.2026) */
export const DTV_ANNAHME = 500
/** Schnittpunkte mit der Querungsachse in diesem Abstand: dieselbe Strassenachse (Grenze zweier Abschnitte) */
const VD_GLEICH_M = 2

/** Punkte entlang eines Linienzugs alle schritt m bis bis m */
function entlang(z: P[], schritt: number, bis: number): P[] {
  if (!z.length) return []
  const aus: P[] = [z[0]]
  let s = 0, naechst = schritt
  for (let i = 1; i < z.length && naechst <= bis; i++) {
    const l = dist(z[i - 1], z[i])
    if (l <= 0) continue
    while (naechst <= s + l && naechst <= bis) { aus.push(add(z[i - 1], sub(z[i], z[i - 1]), (naechst - s) / l)); naechst += schritt }
    s += l
  }
  return aus
}
const abstandLinie = (p: P, l: VdLinie) => Math.min(...l.teile.map(z => Math.min(...z.slice(1).map((q, i) => abstandStrecke(p, z[i], q)))))

/**
 * DTV aus den Verkehrsdaten: Linien, die die Querungsachse (über alle Teilstreifen, Bord bis Bord) schneiden; Schnittpunkte
 * innert VD_GLEICH_M sind eine Strassenachse (Grenze zweier Abschnitte: höherer Wert), getrennte Achsen (Richtungsfahrbahnen)
 * werden summiert. Ohne Schnitt: liegen höchstens VD_LEER_MAX der geraden Zufahrten (erste 30 m) innert VD_NAH_M an einer Linie,
 * hat die Strasse keinen Eintrag: Annahme DTV_ANNAHME; sonst offen mit Hinweis.
 */
function dtvVorbelegen(st: StreifenErgebnis[], spuren: P[][], vd: VerkehrsdatenErgebnis | null, setze: Setze, feldHinweis: FeldHinweis): void {
  if (!vd) return
  if ('fehler' in vd) { feldHinweis('dtv', `Verkehrsdaten (${GEOPORTAL_BERN}) konnten nicht geladen werden (${vd.fehler})`); return }
  const s0 = st[0], n = einheit(sub(s0.p1, s0.p0))
  const ts = st.flatMap(s => [s.p0, s.p1, ...s.rand]).map(p => dot(sub(p, s0.p0), n))
  const a = add(s0.p0, n, Math.min(...ts) - 1), b = add(s0.p0, n, Math.max(...ts) + 1), lab = dist(a, b)
  const proben = spuren.length ? spuren.flatMap(z => entlang(z, 2, 30)) : entlang([a, b], 2, lab)
  if (![a, b, ...proben].every(p => imBereich(p, VD_NAH_M, vd.bereich))) {
    feldHinweis('dtv', `Verkehrsdaten nur bis ${vd.bereich.radiusM} m um den Ladeort geladen: DTV offen`); return
  }
  const treffer: { t: number; l: VdLinie }[] = []
  for (const l of vd.linien) for (const z of l.teile) for (let i = 1; i < z.length; i++) {
    // Abschnitte stossen an gemeinsamen Punkten an: Enden um 5 cm verlängert (Rundung), damit ein Streifen an der Grenze beide trifft
    const r = einheit(sub(z[i], z[i - 1]))
    const x = segSchnitt(a, b, add(z[i - 1], r, -0.05), add(z[i], r, 0.05))
    if (x && Math.abs(dot(r, n)) <= Math.SQRT1_2) treffer.push({ t: x[0] * lab, l })
  }
  const stand = (ls: VdLinie[]) => [...new Set(ls.map(l => l.stand).filter(Boolean))].join(', ')
  const herkunft = (ls: VdLinie[]) => `${GEOPORTAL_BERN}, 16·Nt + 8·Nn${stand(ls) ? `, Stand ${stand(ls)}` : ''}`
  if (!treffer.length) {
    const nah = proben.filter(p => vd.linien.some(l => abstandLinie(p, l) <= VD_NAH_M)).length / Math.max(1, proben.length)
    if (nah <= VD_LEER_MAX) setze('dtv', DTV_ANNAHME, 'annahme', `DTV ${DTV_ANNAHME} angenommen: keine Verkehrsdaten im ${GEOPORTAL_BERN} ` +
      '(nur Strassen über 2000 Fz/Tag erfasst)')
    else feldHinweis('dtv', `Verkehrsdaten-Linie neben der Querung, aber nicht über ihrer Achse (${GEOPORTAL_BERN}): DTV offen`)
    return
  }
  treffer.sort((x, y) => x.t - y.t)
  const achsen: { t: number; l: VdLinie }[][] = []
  for (const x of treffer) {
    const letzte = achsen[achsen.length - 1]
    if (letzte && x.t - letzte[letzte.length - 1].t <= VD_GLEICH_M) letzte.push(x); else achsen.push([x])
  }
  // Innerhalb einer Achse (Schnitte innert VD_GLEICH_M): Linien, die sich an einem Punkt auf der Querungsachse berühren (eine endet,
  // die nächste beginnt), sind eine Strasse an der Grenze zweier Abschnitte (höherer Wert); Linien ohne gemeinsamen Punkt auf der
  // Achse sind getrennte Äste bzw. Fahrbahnen, z. B. eine Teilung knapp vor dem Streifen (Summe; Korrektur S5)
  const je = achsen.flatMap(ac => grenzGruppen([...new Set(ac.map(x => x.l))], a, b)).map(ls => {
    const werte = ls.map(l => l.dtv).filter((v): v is number => v !== null)
    return { ls, werte, wert: werte.length ? Math.max(...werte) : null }
  })
  const alle = je.flatMap(x => x.ls)
  if (je.some(x => x.wert === null)) {
    feldHinweis('dtv', `Verkehrsdaten-Linie ohne Nt/Nn über der Querung (${GEOPORTAL_BERN}): DTV offen`); return
  }
  const summe = je.reduce((s2, x) => s2 + x.wert!, 0)
  const namen = [...new Set(alle.map(l => l.strasse).filter(Boolean))].join(', ')
  const grenze = je.filter(x => new Set(x.werte).size > 1).map(x => x.werte.map(ganz).join(' bzw. '))
  const teile = je.length > 1 ? `, Summe von ${je.length} Fahrbahnen (${je.map(x => ganz(x.wert!)).join(' + ')})` : ''
  setze('dtv', summe, 'geoportal', `DTV ${ganz(summe)}${namen ? ` ${namen}` : ''} (${herkunft(alle)})${teile}` +
    (grenze.length ? `; Grenze zweier Abschnitte (${grenze.join('; ')}): höherer Wert` : ''))
}

/** Abstand (m), bis zu dem ein Endpunkt auf der Querungsachse liegt bzw. zwei Endpunkte zusammenfallen (Grenze zweier Abschnitte) */
const VD_GRENZE_M = 0.5
/** Linien einer Achse in Gruppen: verbunden, wenn sie einen Endpunkt auf der Querungsachse a–b teilen */
function grenzGruppen(ls: VdLinie[], a: P, b: P): VdLinie[][] {
  const enden = (l: VdLinie) => l.teile.flatMap(z => (z.length ? [z[0], z[z.length - 1]] : [])).filter(p => abstandStrecke(p, a, b) <= VD_GRENZE_M)
  const gr = ls.map((_, i) => i)
  const wurzel = (i: number): number => (gr[i] === i ? i : (gr[i] = wurzel(gr[i])))
  for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++)
    if (enden(ls[i]).some(p => enden(ls[j]).some(q => dist(p, q) <= VD_GRENZE_M))) gr[wurzel(i)] = wurzel(j)
  const m = new Map<number, VdLinie[]>()
  ls.forEach((l, i) => m.set(wurzel(i), [...(m.get(wurzel(i)) ?? []), l]))
  return [...m.values()]
}

/** Beleuchtung: Lampe in diesem Abstand zum Streifen gilt als «an der Querung»; Suche bis LAMPE_SUCH_M */
export const LAMPE_NAH_M = 15
export const LAMPE_SUCH_M = 25

/**
 * Hinweis zur Beleuchtung ohne Wert (Nutzerentscheid 20.10.2026: das Feld bleibt offen): lit an den Wegen der geraden Zufahrten
 * und die nächste Strassenlampe in OSM. Leer ohne Daten.
 */
export function beleuchtungHinweis(st: StreifenErgebnis[], wege: (number | null)[], tags: ReadonlyMap<number, Record<string, string>> | null,
  lampen: { punkte: P[]; bereich: Bereich } | null): string {
  const teile: string[] = []
  const lit = new Set(wege.map(id => (id !== null ? tags?.get(id)?.lit : undefined)).filter((x): x is string => x === 'yes' || x === 'no'))
  // «vor Ort prüfen» nur einmal am Schluss (Nachprüfung)
  let pruefen = ''
  if (lit.size === 2) { teile.push(`laut OSM teils beleuchtet, teils nicht${tag('lit')}`); pruefen = 'vor Ort prüfen' }
  else if (lit.has('yes')) { teile.push(`laut OSM ist die Strasse beleuchtet${tag('lit=yes')}`); pruefen = 'vor Ort prüfen' }
  else if (lit.has('no')) { teile.push(`laut OSM ist die Strasse nicht beleuchtet${tag('lit=no')}`); pruefen = 'vor Ort prüfen' }
  if (lampen) {
    const d = Math.min(Infinity, ...lampen.punkte.map(p => Math.min(...st.map(s => abstandZumStreifen(p, s)))))
    const slg = 'Beleuchtung der Querenden vor Ort prüfen (Richtlinie SLG 202 der Schweizer Licht Gesellschaft)'
    if (d <= LAMPE_NAH_M + 1e-9) { teile.push(`Strassenlampe ${ganz(d)} m vom Streifen (OSM)`); pruefen = slg }
    else if (d <= LAMPE_SUCH_M + 1e-9) { teile.push(`nächste Strassenlampe ${ganz(d)} m vom Streifen (OSM)`); pruefen = slg }
    else if (streifenPunkte(st).every(p => imBereich(p, LAMPE_SUCH_M, lampen.bereich)))
      teile.push(`eine Lampe nahe der Querung ist in OSM nicht eingetragen (OSM oft unvollständig)`)
  }
  return [...teile, ...(pruefen ? [pruefen] : [])].join('; ')
}
