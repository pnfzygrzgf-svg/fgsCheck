// ── Kreisel: Sicht aus der gewählten Einfahrt (K4) und zwischen benachbarten Zufahrten (K4b), Plan Kreisel 31.10./01.11.2026 ──
//
// Ak (VSS 40 263 Ziffer 13.2, S. 8–9, Abb. 3): A nach VSS 40 273 Tab. 1 mit dem Tempo aus K3 (kleinstes β; Minikreisel fest 30 km/h,
// ohne gültige Konstruktion 40 km/h); bei 35 km/h zwischen den Werten für 30 und 40 km/h linear (Annahme). Strassentyp der
// Kreiselfahrbahn: Hauptverkehrsstrasse, sobald ein Arm eine ist (wie am Knoten: Zwischenwert), sonst unterer Wert; der Ring gilt als eben
//. Zielpunkte ab K entlang der Fahrlinie mit Vortritt (E2, E9) gegen die Fahrtrichtung, Sicht von D (B hinter der
// Wartelinie, am Fahrersitz); Status wie am Knoten (erfüllt ab dem oberen Wert, massgebend erfüllt, nicht erfüllt). Hindernisse wie am
// Knoten (Gebäude der AV, von Hand, bestätigte Vorschläge, amtliche Parkfelder; Bäume als Palisade).
// Velo: dieselbe Linie, A nach VSS 40 273 Tab. 3 (eben).
// Sichtberme: Teil der Insel bzw. des Innenrings im Sichtfeld (Dreiecke D – Zielpunkte bis zum grösseren nötigen Wert);
// ein Hindernis darin → nicht erfüllt. Der Rest der Insel: «Durchsicht verhindern» (VSS 40 263 Ziffer 13.3, S. 9; bfu BM.024-2024),
// ein Hindernis dort ist erwünscht; ob die Durchsicht tatsächlich verhindert ist, prüft die App nicht.
// Az (K4b, Vergleichswert, kein Normwert): ab K auf der Fahrlinie mit Vortritt gegen die Fahrtrichtung bis zum K der
// Zufahrt links, dann auf deren Fahrlinie (Mitte des Einfahrtsfahrstreifens) hinaus, wie die fette Fahrlinie in bfu 2.446.01 Abb. 3, LU
// Abb. 8 und ZH Abb. 10 (die Linie am Ringrand ist dort nur die Masslinie); nicht an der vorherigen Einfahrt begrenzt; Werte nach LU 731.501 Tab. 2 mit dem Tempo aus β
// (Regelfall / Minimal). Ohne Zufahrt links (nur Ausfahrt) entfällt Az.

import { type P, dist, imPolygon, winkelGrad } from '../geo'
import { abschneiden, streckeLaenge } from './netz'
import { sichtEntlang, sichtdreieck, type Verdeckend } from './sicht'
import { sichtweiteA, sichtStatus, istHvsHighway, type Status, type Strassentyp } from './sichtweite'
import { veloSichtweite } from './velo'
import { vereinigung, schnitt, differenz, type Multi } from './poly'
import { armText } from './knoten'
import { profilLinie, profilPunkt, profilWert, profilWinkel, grenzeProfil } from './kreisel'
import type { KreiselInfo, KreiselSicht, KreiselSichtTeil, KreiselArm } from './typen'

/** Zielpunkte bis zu diesem Vielfachen des grössten nötigen Werts (wie am Knoten, VSS 40 273 Skizze) */
export const KREISEL_ZIEL_FAKTOR = 1.5
/** Az: Vergleichswerte nach Kanton Luzern vif 731.501 «Planung Kreisel», Tab. 2 (S. 8), Tempo -> [Regelfall, Minimal] [m] */
export const AZ_LU: Record<number, [number, number]> = { 40: [40, 35], 35: [30, 25], 30: [25, 20] }
export const AZ_QUELLE = 'bfu-Fachdokumentation 2.446.01 (2024) Kap. 2.5, Abb. 3; Kreiselrichtlinien ZH 2022 Abb. 10 und LU 731.501 Tab. 2'
/** Sichtberme: Hinweis auf die Durchsicht (E4) */
export const DURCHSICHT_TEXT = 'Ausserhalb der Sichtberme soll die Mittelinsel die Durchsicht verhindern (VSS 40 263 Ziffer 13.3, S. 9: ' +
  '«soll grundsätzlich»; bfu BM.024-2024 «Kreisel – Mittelinsel»: «muss»), etwa mit Bepflanzung oder Ausstattung; ein Hindernis dort ist ' +
  'erwünscht. Ob die Durchsicht tatsächlich verhindert ist, prüft die App nicht.'

const f1 = (x: number) => x.toFixed(1).replace('.', ',')
const gerundet = (x: number) => Math.round(x * 10) / 10

/** Tab.-1-Werte am Kreisel: Tempo 30/40 direkt, 35 km/h linear zwischen 30 und 40 (E7); der Ring ist eben (E3) */
export function kreiselA(tempo: number, typ: Strassentyp): { massgebend: number; oben: number; text: string; interpoliert: boolean } {
  if (tempo === 35) {
    const a = sichtweiteA(30, typ), b = sichtweiteA(40, typ)
    return { massgebend: (a.massgebend + b.massgebend) / 2, oben: (a.oben + b.oben) / 2, interpoliert: true,
      text: `VSS 40 273 Tab. 1, 35 km/h zwischen 30 und 40 km/h linear (Annahme), ${a.typText}` }
  }
  const sw = sichtweiteA(tempo, typ)
  return { massgebend: sw.massgebend, oben: sw.oben, interpoliert: false, text: `VSS 40 273 Tab. 1, ${tempo} km/h, ${sw.typText}` }
}

/** Sicht auf einer Linie; Hindernisse (nicht Gebäude der AV), durch die die Linie bis A läuft, zählen nicht (wie am Knoten) */
function teil(D: P, achse: P[], sMax: number, flaechenAlle: Verdeckend[], A: number, oben: number, minimal: number | null, text: string,
  status: (vorhanden: number) => Status): Omit<KreiselSichtTeil, 'begrenzt'> {
  const zp: P[] = []
  for (let s = 0; s <= A + 1e-9; s += 0.5) { const q = abschneiden(achse, s); zp.push(q[q.length - 1]) }
  const durch = flaechenAlle.filter(f => f.quelle && f.quelle !== 'AV' && zp.some(p => imPolygon(p, f.poly)))
  const flaechen = durch.length ? flaechenAlle.filter(f => !durch.includes(f)) : flaechenAlle
  const si = sichtEntlang(D, achse, sMax, flaechen, oben)
  const vd = si.verdecker as Verdeckend | null
  const frei = Math.min(si.vorhanden, oben)
  const hinweise = durch.map(f => `Die Linie läuft bis A durch «${f.name}» (${f.quelle}): für diese Sicht nicht gerechnet; Lage prüfen.`)
  if (si.palisade && (si.palisade.anteil > 0 || si.palisade.zaehlt)) hinweise.push(`Palisade (Bäume): ${Math.round(si.palisade.anteil * 100)} % ` +
    `der Strecke bis A verdeckt, längste Strecke ${f1(si.palisade.laengste)} m${si.palisade.zaehlt ? ' (zählt als Verdeckung)' : ''}.`)
  return { A, oben, minimal, text, achse: abschneiden(achse, sMax), sMax, vorhanden: si.vorhanden, bisEnde: si.bisEnde, status: status(si.vorhanden),
    verdecker: vd ? { id: vd.id, name: vd.name, art: vd.art ?? 'Gebäude', quelle: vd.quelle ?? 'AV', ring: vd.poly[0], sVerdeckt: si.sVerdeckt ?? 0 } : null,
    verdeckerListe: si.liste.map(t => ({ id: t.v.id, name: t.v.name, art: t.v.art ?? 'Gebäude', quelle: t.v.quelle ?? 'AV', wirkung: t.v.wirkung ?? 'voll',
      sErst: t.sErst, strecke: t.strecke, ring: t.v.poly[0] })),
    dreieckFrei: sichtdreieck(D, achse, 0, frei), dreieckVerdeckt: si.vorhanden < oben ? sichtdreieck(D, achse, si.vorhanden, oben) : [], hinweise }
}

/** Sichtfeld als Fläche: Vereinigung der Dreiecke D – Zielpunkt – nächster Zielpunkt bis s (robust auch bei gekrümmter Linie) */
function sichtfeld(D: P, achse: P[], s: number): Multi {
  const pts: P[] = []
  for (let x = 0; x < s; x += 1) { const q = abschneiden(achse, x); pts.push(q[q.length - 1]) }
  const q = abschneiden(achse, s); pts.push(q[q.length - 1])
  const dreiecke: Multi = pts.slice(1).map((p, i) => [[D, pts[i], p]])
  return vereinigung(...dreiecke.map(d => [d]))
}

/** Arm links der Einfahrt (der nächste gegen den Uhrzeigersinn der Fahrt, also im Uhrzeigersinn von oben gesehen) */
function armLinks(arme: KreiselArm[], arm: KreiselArm): KreiselArm | null {
  const w = (a: KreiselArm) => winkelGrad(a.richtung)
  const andere = arme.filter(a => a !== arm)
  if (!andere.length) return null
  return andere.reduce((m, a) => (((w(arm) - w(a)) % 360 + 360) % 360 < ((w(arm) - w(m)) % 360 + 360) % 360 ? a : m))
}

/**
 * K4 und K4b für die gewählte Einfahrt des Kreisels k: verdeckend = Gebäude der AV und Hindernisse; null ohne gewählte Einfahrt.
 * Ohne hindernis (HindernisStand: in rechnen.ts ergänzt)
 */
export function kreiselSicht(k: KreiselInfo, verdeckend: Verdeckend[]):
  Omit<KreiselSicht, 'hindernis'> | null {
  const z = k.zufahrt
  if (!z) return null
  const v = k.vermessung, arm = k.arme.find(a => a.key === z.arm)!
  const annahmen: string[] = [], hinweise: string[] = []
  const D = z.D
  const inD = verdeckend.filter(f => f.quelle && f.quelle !== 'AV' && imPolygon(D, f.poly))
  const hv = verdeckend.filter(f => !inD.includes(f))
  for (const f of inD) hinweise.push(`D liegt im Hindernis «${f.name}»: für die Sicht nicht gerechnet.`)
  // Tempo und Strassentyp (E3, E7)
  const tempo = k.beta.tempo
  const hvs = k.arme.filter(a => istHvsHighway(a.hw))
  const typ: Strassentyp = hvs.length ? 'hvs' : 'es'
  const typQuelle = hvs.length ? `Hauptverkehrsstrasse: Arm ${armText(hvs[0])} (OSM highway=${hvs[0].hw})` : 'kein Arm ist eine Hauptverkehrsstrasse (OSM highway)'
  const sw = kreiselA(tempo, typ)
  // Linie der Fahrlinie mit Vortritt ab K gegen die Fahrtrichtung (abnehmender Winkel), höchstens eine ganze Runde; ist die nötige Länge
  // grösser, gilt die Rundenlänge (Annahme)
  const gK = profilWinkel(v.mitte, z.K)
  const linie: P[] = [z.K]
  for (let g = Math.floor(gK); g > gK - 360; g--) linie.push(profilPunkt(v.mitte, v.fahrlinie, g))
  linie.push(z.K)
  const velo = veloSichtweite(tempo, 0)
  const runde = streckeLaenge(linie)
  const begrenzt = (A: number, oben: number) => (oben > runde + 1e-6 ? { A, oben, grund: 'länger als eine Runde' } : null)
  const swB = { massgebend: Math.min(sw.massgebend, runde), oben: Math.min(sw.oben, runde) }
  const veloA = Math.min(velo.A, runde)
  const sMax = Math.min(runde, Math.ceil(KREISEL_ZIEL_FAKTOR * Math.max(swB.oben, veloA)))
  const auto = { ...teil(D, linie, sMax, hv, swB.massgebend, swB.oben, null, sw.text, x => sichtStatus(x, swB)), begrenzt: begrenzt(sw.massgebend, sw.oben) }
  const veloT = { ...teil(D, linie, sMax, hv, veloA, veloA, null, `VSS 40 273 ${velo.text} (Ring eben)`,
    x => (x + 1e-6 >= veloA ? 'erfuellt' : 'nicht_erfuellt')), begrenzt: begrenzt(velo.A, velo.A) }
  if (auto.begrenzt || veloT.begrenzt) annahmen.push(`Die nötige Sicht wäre länger als eine Runde auf der Fahrlinie mit Vortritt ` +
    `(${f1(runde)} m): nötig ist höchstens diese Rundenlänge (${[auto.begrenzt ? `Ak statt ${f1(sw.oben)} m` : '', veloT.begrenzt ?
      `Velo statt ${velo.A} m` : ''].filter(x => x).join(', ')}).`)
  // Sichtberme (E4): Sichtfeld bis zum grösseren nötigen Wert
  const feld = sichtfeld(D, linie, Math.min(runde, Math.max(swB.oben, veloA)))
  const grenze = grenzeProfil(v)
  const innenFlaeche: Multi = grenze.some(x => x > 0) ? [[profilLinie(v.mitte, grenze).slice(0, -1)]] : []
  const inselFlaeche: Multi = v.inselR > 0 ? [[profilLinie(v.mitte, v.insel).slice(0, -1)]] : []
  const berme = schnitt(feld, innenFlaeche)
  const durchsicht = differenz(inselFlaeche, feld)
  let tiefe = 0, innenring = false
  // Tiefe ab dem Inselrand: an den Ecken und an der Stelle jeder Kante, die der Mitte am nächsten liegt (die äusserste Sichtlinie)
  const tiefeBei = (p: P) => profilWert(v.insel, profilWinkel(v.mitte, p)) - dist(p, v.mitte)
  for (const poly of berme) for (const ring of poly) ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length], d: P = [q[0] - p[0], q[1] - p[1]], l2 = d[0] * d[0] + d[1] * d[1]
    const t = l2 ? Math.max(0, Math.min(1, ((v.mitte[0] - p[0]) * d[0] + (v.mitte[1] - p[1]) * d[1]) / l2)) : 0
    tiefe = Math.max(tiefe, tiefeBei(p), tiefeBei([p[0] + d[0] * t, p[1] + d[1] * t]))
    if (tiefeBei(p) < -0.05) innenring = true
  })
  // liegt die Mitte in der Sichtberme, reicht sie bis zur Mitte der Insel
  const ganz = berme.some(poly => imPolygon(v.mitte, poly))
  if (ganz) tiefe = Math.max(tiefe, profilWert(v.insel, 0) > 0 ? Math.max(...v.insel) : 0)
  const inBerme = hv.filter(f => f.quelle && f.quelle !== 'AV' && schnitt(berme, [f.poly]).length)
  const bermeStatus: 'erfuellt' | 'nicht_erfuellt' = inBerme.length ? 'nicht_erfuellt' : 'erfuellt'
  if (berme.length) hinweise.push(`Sichtberme: ${ganz && !durchsicht.length ? 'die ganze Insel' + (innenring ? ' mit dem Innenring' : '') :
    `Teil der ${innenring ? 'Insel und des Innenrings' : 'Insel'}`} im Sichtfeld, bis ${f1(Math.max(0, tiefe))} m ab dem Inselrand; dort ` +
    `zwischen 0,60 und 3,00 m Höhe nichts, das die Sicht verdeckt (VSS 40 263 Ziffer 13.3, S. 9).` +
    (inBerme.length ? ` In der Sichtberme: ${inBerme.map(f => `«${f.name}»`).join(', ')}.` : ''))
  if (inselFlaeche.length) hinweise.push(DURCHSICHT_TEXT)
  // Az (K4b): Zufahrt links
  let az: KreiselSichtTeil | null = null, azGrund: string | null = null, azLinks: string | null = null
  const links = armLinks(k.arme, arm)
  if (!links || !links.ein) azGrund = links ? `Links liegt nur eine Ausfahrt (Arm ${armText(links)}): keine Zufahrt links, Az entfällt.` :
    'Keine Zufahrt links: Az entfällt.'
  else {
    azLinks = armText(links)
    const kL = k.einfahrtK[links.key], achseL = k.einfahrtAchse[links.key]
    if (!kL || !achseL) azGrund = `Zufahrt links (Arm ${azLinks}): Fahrlinie der Einfahrt nicht konstruierbar; Az nicht gerechnet.`
    else {
      // Fahrlinie mit Vortritt ab K gegen die Fahrtrichtung bis zum K der Zufahrt links, dann deren Fahrlinie (Mitte des
      // Einfahrtsfahrstreifens) nach aussen; die Linie am Ringrand der Vorlagen ist nur die Masslinie
      const g0 = profilWinkel(v.mitte, z.K), g1 = profilWinkel(v.mitte, kL)
      const bogen = ((g0 - g1) % 360 + 360) % 360
      const ring: P[] = [z.K]
      for (let g = Math.floor(g0); g > g0 - bogen; g--) ring.push(profilPunkt(v.mitte, v.fahrlinie, g))
      ring.push(kL)
      const azLinie = [...ring, ...[...achseL].reverse().slice(1)]
      const [regel, minimal] = AZ_LU[tempo] ?? AZ_LU[40]
      const azMax = Math.min(streckeLaenge(azLinie), Math.ceil(KREISEL_ZIEL_FAKTOR * regel))
      az = { begrenzt: null, ...teil(D, azLinie, azMax, hv, regel, regel, minimal, `Vergleichswert ${tempo} km/h: Regelfall ${regel} m, Minimal ${minimal} m (${AZ_QUELLE})`,
        x => (x + 1e-6 >= regel ? 'erfuellt' : x + 1e-6 >= minimal ? 'massgebend' : 'nicht_erfuellt')) }
    }
  }
  // Annahmen
  if (sw.interpoliert) annahmen.push('Tempo 35 km/h: A zwischen den Werten der Tab. 1 für 30 und 40 km/h linear (Entscheid E7).')
  annahmen.push(`Strassentyp der Kreiselfahrbahn: ${typ === 'hvs' ? 'Hauptverkehrsstrasse, weil ein Arm eine ist (wie am Knoten der Zwischenwert)' :
    'unterer Wert, weil kein Arm eine Hauptverkehrsstrasse ist'}; die Kreiselfahrbahn gilt als eben (Entscheid E3).`)
  annahmen.push('Velos fahren auf derselben Fahrlinie wie die Autos, in der Mitte der Kreiselfahrbahn (Entscheid E6).')
  annahmen.push('Die App rechnet im Grundriss und prüft nicht, ob ein Hindernis in die Höhe des Sichtfelds reicht (0,60 bis 3,00 m, ' +
    'VSS 40 273 Ziffer 10, S. 7).')
  if (az) annahmen.push(`Az ist ein Vergleichswert, kein Normwert (${AZ_QUELLE}).`)
  hinweise.push('Anhaltesichtweite auf der Kreiselfahrbahn und in die Ausfahrt folgt in einer späteren Version; die Sicht auf ' +
    'Fussgängerstreifen prüft fgsCheck.')
  const rang: Record<Status, number> = { erfuellt: 0, massgebend: 1, nicht_erfuellt: 2 }
  const gesamt = [auto.status, veloT.status, bermeStatus as Status].reduce((m, s) => (rang[s] > rang[m] ? s : m))
  return { arm: arm.key, D, tempo, typ, typQuelle, auto: { ...auto, A: gerundet(auto.A), oben: gerundet(auto.oben) }, velo: veloT, az, azGrund, azLinks,
    berme: { flaechen: berme.map(p => p[0]), tiefe: Math.max(0, tiefe), innenring, ganz: ganz && !durchsicht.length, hindernisse: inBerme.map(f => f.name), ids: inBerme.map(f => f.id),
      status: bermeStatus },
    durchsicht: durchsicht.map(p => p[0]), gesamt, annahmen, hinweise }
}

/** Sichtdreiecke für die Vorschläge (Parkierung im Sichtfeld) */
export const kreiselDreiecke = (s: Omit<KreiselSicht, 'hindernis'>): P[][] =>
  [s.auto, s.velo, ...(s.az ? [s.az] : [])].filter(t => t.achse.length >= 2).map(t => sichtdreieck(s.D, t.achse, 0, t.sMax))

