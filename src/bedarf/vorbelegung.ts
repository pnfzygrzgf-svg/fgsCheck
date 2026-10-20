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

import { type P, dot, sub, imPolygon } from '../geo'
import type { StreifenErgebnis } from '../rechner/typen'
import type { Fall } from '../fall'
import type { Quelle } from './eingaben'
import type { Vorbelegung } from './fallBedarf'
import { E1_KURZ } from '../rechner/standardinsel'

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

/** Querungsart eines gerechneten Streifens: Fussgängerstreifen, ohne Vortritt (Furt bzw. übrige) oder «kein FGS» (nicht geprüft) */
export const streifenTyp = (s: StreifenErgebnis): 'fgs' | 'furt' | 'ohne_vortritt' | 'kein' =>
  s.status === 'kein_fgs' ? 'kein' : s.querung?.typ ?? 'fgs'

export interface Vorbelegt { werte: Vorbelegung; hinweise: string[] }

/** Radstreifen an den geraden Zufahrten nach der Rechnung (OSM): true/false, null wenn eine Zufahrt ohne Angabe ist */
export function radstreifenAusRechnung(streifen: StreifenErgebnis[]): boolean | null {
  const v = streifen.flatMap(s => s.zufahrten.filter(z => z.art !== 'abbiegend')).map(z => z.velostreifenRechtsM)
  return v.length && v.every(x => x !== null) ? v.some(x => x! > 0) : null
}

/** Vorbelegung einer Querung (reine Funktion) */
export function vorbelegen(g: QuerungGruppe, fall: Fall, angenommeneInseln: { ring: P[] }[] = []): Vorbelegt {
  const w: Vorbelegung = {}
  const hinweise: string[] = []
  const setze = (pfad: string, wert: unknown, quelle: Quelle, text: string) => { w[pfad] = { wert, quelle, text } }
  const st = g.streifen
  if (!st.length) return { werte: w, hinweise }

  // Querungstyp aus der Querungsart der Streifen (Panel: «Querung» je Streifen)
  const typen = [...new Set(st.map(streifenTyp))]
  const mitLsa = st.some(s => s.lsa === 'ja')
  if (typen.length === 1 && typen[0] === 'fgs') setze('typ', mitLsa ? 'lsa' : 'fgs', 'rechnung', mitLsa
    ? 'Streifen als Fussgängerstreifen mit Lichtsignal gerechnet' : 'Streifen als Fussgängerstreifen gerechnet')
  else if (typen.length === 1 && typen[0] !== 'kein') setze('typ', typen[0], 'hand', 'Querungsart der Streifen von Hand: ohne Vortritt')
  else if (typen.length > 1) hinweise.push('Die Teilstreifen haben verschiedene Querungsarten: Querungstyp offen')
  else hinweise.push('Streifen als «kein FGS» nicht geprüft: Querungstyp offen')

  // Lichtsignal (Streifen-Eingabe bzw. OSM)
  const lsaJa = st.filter(s => s.lsa === 'ja')
  const lsaHand = st.some(s => s.lsaQuelle === 'von Hand')
  setze('fgsMitLsa', lsaJa.length > 0, lsaHand ? 'hand' : 'osm', lsaJa.length ? `Lichtsignal: ${lsaJa[0].lsaQuelle ?? 'OSM'}` :
    lsaHand ? 'Lichtsignal von Hand: nein' : 'kein Lichtsignal in OSM am Streifen')

  // Tempo der geraden Zufahrten
  const gerade = st.flatMap(s => s.zufahrten.filter(z => z.art !== 'abbiegend'))
  if (gerade.length) {
    const v = Math.max(...gerade.map(z => z.tempo))
    const q: Quelle = gerade.some(z => z.tempoQuelle === 'Korrektur') ? 'hand' : gerade.some(z => z.tempoQuelle === 'Ersatz') ? 'annahme' : 'osm'
    setze('vSig', v, q, q === 'hand' ? 'Tempo der Zufahrten (von Hand)' : q === 'annahme' ? 'Tempo 50 km/h angenommen (OSM ohne Angabe)'
      : 'Tempo der geraden Zufahrten (OSM maxspeed)')
    if (v <= 50) setze('innerorts', true, 'annahme', `Tempo ${v} km/h: innerorts angenommen`)
  }

  // Bordkanten entlang der Achse: L je Teilquerung, B über die ganze Querung
  const s0 = st[0], n = einheit(sub(s0.p1, s0.p0))
  const proj = (p: P) => dot(sub(p, s0.p0), n)
  const alleAv = st.every(s => s.randQuelle === 'AV')
  const L = st.map(s => {
    const ns = einheit(sub(s.p1, s.p0))
    return dot(sub(s.rand[1], s.rand[0]), ns)
  })
  if (alleAv && L.every(x => x > 0)) {
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
  const zuf = st.flatMap(s => s.zufahrten)
  if (zuf.length) {
    const auto = zuf.flatMap(z => z.konflikte.filter(k => k.klasse === 'auto'))
    setze('parkierungSichtbehindernd', auto.length > 0, 'rechnung', auto.length ? 'Auto-Parkfelder im Sichtfeld (Sichtrechner)' : 'keine Auto-Parkfelder im Sichtfeld')
    setze('haltenSichtrelevantUeber5m', auto.some(k => k.abstand > 5), 'rechnung', auto.some(k => k.abstand > 5)
      ? 'Auto-Parkfelder im Sichtfeld weiter als 5 m vom Streifen' : 'keine Auto-Parkfelder im Sichtfeld weiter als 5 m vom Streifen')
  }

  // Tram (OSM-Gleis)
  if (st.some(s => s.tram === true)) hinweise.push('Ein Tramgleis nach OSM quert die Querung: Art (Fahrbahn bzw. Eigentrassee) von Hand wählen')
  else if (st.every(s => s.tram === false)) setze('tram', 'keins', 'osm', 'kein Tramgleis in OSM am Streifen')

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
    const standard = plan.find(fp => fp.standard)?.standard
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
    } else if (!angenommen) setze('insel.art', 'baulich', 'annahme', `${text}: baulich angenommen`)
    // Durchfahrt neben der Insel: Teilquerungen (Bord bis Insel), quer zur Fahrbahn
    if (alleAv) {
      const seiten = sortiert.map(s => {
        const ns = einheit(sub(s.p1, s.p0))
        return dot(sub(s.rand[1], s.rand[0]), ns) * sinW
      })
      setze('durchfahrt', seiten.map(r2), 'rechnung', 'Teilquerungen Bord bis Insel (Rechnung), quer zur Fahrbahn')
    }
  }
  return { werte: w, hinweise }
}
