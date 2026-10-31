// ── Achsen am Knoten: Mittellinien der Arme, Querschnitt aus der AV, Fahrstreifenachsen, Kreuzungspunkt K (E0) ──
//
// Mittellinie eines Arms: OSM-Weg vom Knoten weg, an Wegenden weiter auf dem Weg mit der kleinsten Richtungsänderung bis 45°,
// sonst gerade verlängert (OsmAchsen.spur aus fgsCheck). Querschnitt: AV-Fahrbahn quer zur Mittellinie (Fahrbahn.sehne), Median
// über einen Abschnitt ausserhalb der Einmündung; dazu (Entscheid 31.10.2026) die Ränder je Stelle bis zum Ende der Mittellinie
// (fahrstreifen.randProfil), damit die Achsen der AV-Fahrbahn folgen, auch wenn die OSM-Linie schräg zu ihr liegt (versetztVariabel).
// Konvention: u = Richtung der Mittellinie vom Knoten weg; seitliche Lage positiv nach links von u. Der Verkehr, der auf einem
// Arm zum Knoten fährt, fährt in Richtung −u; sein rechter Fahrbahnrand liegt darum links von u (Rechtsverkehr).
// Fahrstreifenachse der vortrittsberechtigten Fahrzeuge (VSS 40 273, Ziffer 10, Abb. 1): Fahrzeugmitte d = 1,50 m vom rechten
// Fahrbahnrand. Nach links liegt sie auf der nahen, nach rechts auf der fernen Fahrbahnhälfte; das ergibt sich hier von selbst,
// weil der Verkehr jeweils vom Arm her kommt.
// Parkstreifen (Folgeauftrag E2a, Regel aus fgsCheck fahrstreifenmitte): liegen Parkfelder auf der Fahrbahn am rechten
// Rand, läuft die Achse d neben dem Parkstreifen statt neben dem AV-Rand (Abzug PARKSTREIFEN 1,90 m, durchgehend, auch in
// Lücken). Prüfpunkte PARK_SONDE_M innerhalb des Rands, je QUER_SCHRITT_M; ein Prüfpunkt trifft, wenn ein Feld höchstens
// PARK_SONDE_RADIUS_M entfernt ist (ParkRaster.trifft). Seit 31.10.2026 (Punkt 23) zählen Parkfelder aller Klassen. Abweichend von fgsCheck (mindestens 2 Treffer) braucht es Treffer an
// mindestens 2 Feldern bzw. PARK_EIN_FELD_TREFFER an einem Feld (Längsparkierung, Streifen aus OSM, Feld für zwei Fahrzeuge):
// ein einzelnes Feld von 5 m trifft bei 2 m Abstand schon 2 bis 3 Prüfpunkte und soll die Achse nicht verschieben.
// Kreuzungspunkt K (Ziffer 4): Schnitt der Achse des Zufahrtsstreifens mit der Fahrstreifenachse; beide Achsen sind dafür über
// den Knoten hinaus gerade verlängert (VERLAENGERUNG_M).

import { type P, add, dist, einheit, links, sub, median, segSchnitt } from '../geo'
import type { OsmNetz } from './netz'
import type { Fahrbahn } from './flaechen'
import { SEHNE_HALB } from './flaechen'
import { OsmAchsen, type SpurEnde, type SpurWechsel } from './achsen'
import { teilungsFortsetzung, einbahnTeilung } from './knoten'
import { punkteAufSpur } from './spur'
import { streckeLaenge } from './netz'
import { osmBreite, PARKSTREIFEN, PARK_MIN_TREFFER, PARK_SONDE_M, randProfilEntlang, profilBei, bezugsBreite, type RandProfil } from './fahrstreifen'
import type { ArmInfo } from './typen'
import type { ParkRaster } from './hindernisse'
import { abstandPunkt } from './poly'

/** VSS 40 273 Ziffer 10 (Abb. 1): Abstand Mitte Motorfahrzeug – rechter Fahrbahnrand */
export const D_MFZ_M = 1.5
/** Achsen über den Knoten hinaus gerade verlängert, damit sich Zufahrtsachse und Fahrstreifenachse sicher schneiden */
export const VERLAENGERUNG_M = 30
/** Querschnitt der vortrittsberechtigten Strasse: Median der AV-Sehnen von QUER_VON_M bis QUER_BIS_M ab dem Knoten */
export const QUER_VON_M = 6
export const QUER_BIS_M = 40
export const QUER_SCHRITT_M = 2
export const QUER_MIN = 3
/** Annahme (Befund 31.10.2026, Hubelmattstrasse/Loryplatz): stösst die AV-Fahrbahn an mehr als diesem Anteil der Querschnittstellen
 *  an die Suchgrenze (kein Rand innert SEHNE_HALB: Platz oder Kreuzungsfläche neben dem Arm), gilt der AV-Querschnitt nicht, auch wenn
 *  einzelne Sehnen einen fernen Rand treffen (z. B. den Rand der nächsten Strasse jenseits des Platzes); Breite bzw. Lage aus OSM */
export const SEHNE_OFFEN_ANTEIL = 0.5
/** ohne AV-Querschnitt und ohne OSM-Breite angenommene Fahrbahnbreite (Annahme E0) */
export const BREITE_ANNAHME_M = 6.0

/** Teilung der Fahrbahn auf der Mittellinie eines Arms (Befund 31.10.2026, Knoten 282773328): ab ab [m ab dem Knoten] folgt die
 *  Linie am OSM-Knoten «knoten» der zuführenden Einbahn wid */
export interface ArmTeilung { ab: number; knoten: number; wid: number }
/** Mittellinie eines Arms mit dem Ende der OSM-Linie (SpurEnde), den Teilungen und den Stellen, ab denen die Fahrbahn eine andere ist
 *  (abschnitte, Bogenlänge: Teilung in zwei Einbahnen bzw. Zusammenführung zweier Einbahnen; dort beginnt im Querschnitt ein eigenes
 *  Randprofil) */
export interface ArmLinie { linie: P[]; ende: SpurEnde | null; teilungen: ArmTeilung[]; abschnitte: number[] }
/** ArmLinie aus dem Ergebnis von OsmAchsen.spurMitEnde: Teilungen = Wechsel nach vorzug; Zusammenführung = Wechsel von einer der
 *  beiden Einbahnen auf den Weg mit beiden Richtungen an einer Einbahnteilung, nur nach einer Teilung (ein Arm, der am Knoten schon
 *  Einbahn ist, rechnet wie bisher mit einem Randprofil) */
export function armLinieAus(netz: OsmNetz, r: { linie: P[]; ende: SpurEnde | null; wechsel: SpurWechsel[] }): ArmLinie {
  const zusammen = (w: SpurWechsel) => {
    const t = netz.P.has(w.knoten) ? einbahnTeilung(netz, w.knoten) : null
    return !!t && t.beide[0] === w.nach && (t.zu[0] === w.von || t.weg[0] === w.von)
  }
  const erste = r.wechsel.findIndex(w => w.vorgabe)
  return { linie: r.linie, ende: r.ende, teilungen: r.wechsel.filter(w => w.vorgabe).map(w => ({ ab: w.ab, knoten: w.knoten, wid: w.nach })),
    abschnitte: erste < 0 ? [] : r.wechsel.filter((w, k) => w.vorgabe || (k > erste && zusammen(w))).map(w => w.ab) }
}

/** Mittellinie eines Arms vom Knoten weg bis laenge (Netz, an Wegenden bis 45° weiter, sonst gerade; an einer Teilung in zwei
 *  Einbahnen auf der zuführenden, armMittellinieMitEnde) */
export function armMittellinie(netz: OsmNetz, achsen: OsmAchsen, arm: Pick<ArmInfo, 'wid' | 'i' | 'sd' | 'richtung'>, laenge: number): P[] {
  return armMittellinieMitEnde(netz, achsen, arm, laenge).linie
}
/** wie armMittellinie, dazu die Stelle, ab der die Linie gerade verlängert ist (SpurEnde; null: folgt bis laenge den OSM-Wegen bzw. Weg
 *  ohne Achse). Befund 31.10.2026 (Knoten 282773328): teilt sich die Fahrbahn des Arms in zwei Einbahnen (einbahnTeilung), folgt die
 *  Linie der zuführenden Einbahn, denn auf ihr kommt der Verkehr zum Knoten (Fahrzeuge mit Vortritt und die wartenden auf der
 *  Zufahrt); teilungen: wo und auf welchen Weg. seite 'weg': die Linie der Gegenrichtung (wegführende Einbahn), für Rand, Trottoir und
 *  Radweg auf der Seite des Verkehrs vom Knoten weg */
export function armMittellinieMitEnde(netz: OsmNetz, achsen: OsmAchsen, arm: Pick<ArmInfo, 'wid' | 'i' | 'sd' | 'richtung'>,
  laenge: number, seite: 'zu' | 'weg' = 'zu'): ArmLinie {
  const idx = achsen.linien.findIndex(l => l.wid === arm.wid)
  if (idx < 0) {
    const p0 = netz.p(netz.w(arm.wid).nds[arm.i])
    return { linie: [p0, add(p0, arm.richtung, laenge)], ende: null, teilungen: [], abschnitte: [] }
  }
  const start: [number, number, number] = arm.sd > 0 ? [idx, arm.i, 0] : [idx, arm.i - 1, 1]
  return armLinieAus(netz, achsen.spurMitEnde(start, arm.richtung, laenge, teilungsFortsetzung(netz, seite)))
}

/** Polylinie ab ihrem Anfang in Schritten neu abtasten und seitlich versetzen (positiv nach links der Laufrichtung) */
export function versetzt(linie: P[], versatz: number, schritt = 1): P[] {
  return versetztVariabel(linie, () => versatz, schritt)
}

/** wie versetzt, aber mit seitlicher Lage je Bogenlänge s der Linie (Entscheid 31.10.2026: Achse folgt der AV-Fahrbahn) */
export function versetztVariabel(linie: P[], versatz: (s: number) => number, schritt = 1): P[] {
  const L = streckeLaenge(linie)
  const ab: number[] = []
  for (let s = 0; s < L - 1e-9; s += schritt) ab.push(s)
  ab.push(L)
  return punkteAufSpur(linie, ab).map(([q, t], i) => add(q, links(t), versatz(ab[i])))
}

/** Mündungsbereich der Zufahrt glätten (Befund 17.10.2026, Jolimontstrasse / Gruberstrasse): kurze Knickstücke der OSM-Linie
 *  direkt am Knoten (1 bis 3 m lange Segmente mit abweichender Richtung) stellten D, F_B und die Verlängerung schief, weil die
 *  Tangente an D aus diesen Stücken kam. Die ersten MUENDUNG_BIS_M der Linie werden durch eine Gerade ersetzt, deren Richtung
 *  die mittlere Richtung zwischen MUENDUNG_VON_M und MUENDUNG_BIS_M ist, verankert am Punkt bei MUENDUNG_BIS_M (ab dort folgt
 *  die Linie wieder der OSM-Geometrie, in 1-m-Schritten abgetastet). Kurze Linien bleiben unverändert. */
export const MUENDUNG_VON_M = 2
export const MUENDUNG_BIS_M = 12
/** Übergang von der Geraden zurück auf die OSM-Linie (linear gemischt), damit die seitlich versetzte Achse keinen Sprung macht */
export const MUENDUNG_UEBERGANG_M = 8
export function muendungGeglaettet(linie: P[]): P[] {
  const L = streckeLaenge(linie)
  if (linie.length < 2 || L <= MUENDUNG_BIS_M + 1) return linie
  const [[a], [b]] = punkteAufSpur(linie, [MUENDUNG_VON_M, MUENDUNG_BIS_M])
  if (dist(a, b) < 1e-6) return linie
  const u = einheit(sub(b, a))
  const ab: number[] = []
  for (let s = MUENDUNG_BIS_M; s < L - 1e-9; s += 1) ab.push(s)
  ab.push(L)
  const rest = punkteAufSpur(linie, ab).map(([q], k) => {
    const w = Math.min(1, (ab[k] - MUENDUNG_BIS_M) / MUENDUNG_UEBERGANG_M)        // 0 bei b (Gerade) … 1 ab dem Ende des Übergangs
    const gerade = add(b, u, ab[k] - MUENDUNG_BIS_M)
    return [gerade[0] * (1 - w) + q[0] * w, gerade[1] * (1 - w) + q[1] * w] as P
  })
  return [add(b, u, -MUENDUNG_BIS_M), ...rest]
}

/** Polylinie am Anfang gerade um m verlängern (Richtung der ersten 3 m) */
export function mitVerlaengerung(linie: P[], m = VERLAENGERUNG_M): P[] {
  const q = punkteAufSpur(linie, [Math.min(3, streckeLaenge(linie))])
  const t = einheit(sub(q.length ? q[0][0] : linie[1], linie[0]))
  return [add(linie[0], t, -m), ...linie]
}

export interface Schnitt { p: P; sa: number; sb: number }

/** alle Schnitte der Polylinien a und b mit Bogenlänge auf beiden */
export function schnitte(a: P[], b: P[]): Schnitt[] {
  const out: Schnitt[] = []
  let sa = 0
  for (let i = 0; i < a.length - 1; i++) {
    const la = dist(a[i], a[i + 1])
    let sb = 0
    for (let k = 0; k < b.length - 1; k++) {
      const lb = dist(b[k], b[k + 1])
      const x = segSchnitt(a[i], a[i + 1], b[k], b[k + 1])
      if (x) out.push({ p: add(a[i], sub(a[i + 1], a[i]), x[0]), sa: sa + la * x[0], sb: sb + lb * x[1] })
      sb += lb
    }
    sa += la
  }
  return out
}

/** Schnitt von a und b, der p am nächsten liegt */
export function schnittBei(a: P[], b: P[], p: P): Schnitt | null {
  const s = schnitte(a, b)
  return s.length ? s.reduce((x, y) => (dist(y.p, p) < dist(x.p, p) ? y : x)) : null
}

/** Lotfusspunkt von p auf die Polylinie: Bogenlänge und Punkt */
export function lot(linie: P[], p: P): { s: number; p: P } {
  let best = { s: 0, p: linie[0], d: Infinity }, acc = 0
  for (let k = 0; k < linie.length - 1; k++) {
    const a = linie[k], v = sub(linie[k + 1], a), l = Math.hypot(v[0], v[1])
    const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / (l * l))) : 0
    const q = add(a, v, t), d = dist(p, q)
    if (d < best.d) best = { s: acc + l * t, p: q, d }
    acc += l
  }
  return { s: best.s, p: best.p }
}

/** Polylinie ab der Bogenlänge s (Anfang interpoliert) */
export function abBogen(linie: P[], s: number): P[] {
  let acc = 0
  for (let k = 0; k < linie.length - 1; k++) {
    const l = dist(linie[k], linie[k + 1])
    if (acc + l >= s && l > 0) {
      const f = (s - acc) / l
      return [add(linie[k], sub(linie[k + 1], linie[k]), f), ...linie.slice(k + 1)]
    }
    acc += l
  }
  return [linie[linie.length - 1]]
}

export interface Querschnitt {
  links: number           // Abstand Mittellinie – Fahrbahnrand links von u [m]
  rechts: number          // Abstand Mittellinie – Fahrbahnrand rechts von u [m]
  quelle: string
  annahme: boolean
  /** Ränder je Stelle (Entscheid 31.10.2026; Sehne nach links von u: profil.rechts = Rand links von u, profil.links = Rand rechts
   *  von u), ab QUER_VON_M bis zum Ende der Mittellinie; fehlt ohne genügend AV-Querschnitte (dann gilt der Median) */
  profil?: RandProfil
}

/** Abstand Mittellinie – Fahrbahnrand links von u bei der Bogenlänge s (Profil, sonst Median) */
export function randLinksBei(qs: Querschnitt, s: number): number {
  return qs.profil ? profilBei(qs.profil.s, qs.profil.rechts, s) : qs.links
}
/** Abstand Mittellinie – Fahrbahnrand rechts von u bei der Bogenlänge s (Profil, sonst Median) */
export function randRechtsBei(qs: Querschnitt, s: number): number {
  return qs.profil ? profilBei(qs.profil.s, qs.profil.links, s) : qs.rechts
}

/**
 * Querschnitt eines Arms aus der AV: Median der Sehnen quer zur Mittellinie von von bis bis (ab dem Knoten). Sehnen, die an die
 * Suchlänge stossen (Einmündung, Platz), zählen nicht. Ohne AV: Breite aus OSM (width, lanes), sonst BREITE_ANNAHME_M.
 * Dazu (Entscheid 31.10.2026) die Ränder je Stelle von von bis zum Ende der Mittellinie (randProfil, Bezugsbreite = Median), damit
 * Fahrstreifen-, Velo- und Überholachse sowie der Rand der AV-Fahrbahn folgen, wenn die OSM-Linie schräg zu ihr liegt.
 * abschnitte (Befund 31.10.2026, Knoten 282773328; ArmLinie.abschnitte): ab jeder dieser Stellen ist die Fahrbahn eine andere (Teilung
 * in zwei Einbahnen, Zusammenführung): dort beginnt ein eigenes Randprofil mit eigener Bezugsbreite, sonst verwürfe es die schmalere
 * bzw. breitere Fahrbahn als Ausreisser. Abschnitte ohne Randprofil überbrückt profilBei (vor dem ersten gültigen konstant).
 */
export function querschnitt(netz: OsmNetz, fahrbahn: Fahrbahn, mittellinie: P[], wid: number, von = QUER_VON_M, bis = QUER_BIS_M,
  abschnitte: number[] = []): Querschnitt {
  const ab: number[] = []
  for (let s = von; s <= bis + 1e-9; s += QUER_SCHRITT_M) ab.push(s)
  const li: number[] = [], re: number[] = [], sGut: number[] = []
  let gemessen = 0
  punkteAufSpur(mittellinie, ab).forEach(([q, t], k) => {
    const sh = fahrbahn.sehne(q, links(t))
    if (sh) gemessen++
    if (!sh || Math.max(sh[0], sh[1]) >= SEHNE_HALB - 0.5) return
    li.push(sh[0]); re.push(sh[1]); sGut.push(ab[k])
  })
  const offen = gemessen - li.length
  const platz = offen > SEHNE_OFFEN_ANTEIL * gemessen
  const platzText = platz ? ` (AV: an ${offen} von ${gemessen} Stellen kein Fahrbahnrand innert ${String(SEHNE_HALB).replace('.', ',')} m, ` +
    'Platz oder Kreuzungsfläche neben dem Arm)' : ''
  if (li.length >= QUER_MIN && !platz) {
    const l = median(li), r = median(re)
    const L = streckeLaenge(mittellinie)
    // Abschnitte: Beginn je Abschnitt (der erste bei von)
    const anfaenge = [von, ...[...abschnitte].filter(x => x > von + 1e-9 && x < L).sort((x, y) => x - y)]
    const teile: RandProfil[] = []
    for (let k = 0; k < anfaenge.length; k++) {
      const bisK = k + 1 < anfaenge.length ? anfaenge[k + 1] : L + 1e-9
      const abP: number[] = []
      for (let s = anfaenge[k]; s < bisK - 1e-9 || (k + 1 === anfaenge.length && s <= L + 1e-9); s += QUER_SCHRITT_M) abP.push(s)
      // Bezugsbreite im ersten Abschnitt: die am besten gestützte Breite der Sehnen von von bis bis (bezugsBreite), nicht ihr Median l + r
      // (Mündungen); in den übrigen die eigene (randProfil)
      const brK = li.map((x, i) => x + re[i]).filter((_, i) => sGut[i] < bisK)
      const p = abP.length ? randProfilEntlang(fahrbahn, mittellinie, abP, k === 0 ? (brK.length ? bezugsBreite(brK) : null) : null) : null
      if (p) teile.push(p)
    }
    const profil: RandProfil | null = !teile.length ? null : teile.length === 1 ? teile[0] : { ...teile[0], s: teile.flatMap(p => p.s),
      rechts: teile.flatMap(p => p.rechts), links: teile.flatMap(p => p.links), n: teile.reduce((x, p) => x + p.n, 0),
      verworfen: teile.reduce((x, p) => x + p.verworfen, 0), ersetzt: teile.reduce((x, p) => x + (p.ersetzt ?? 0), 0) }
    return { links: l, rechts: r, quelle: `AV-Querschnitt (Median aus ${li.length} Sehnen${profil ? `; Ränder je Stelle aus ${profil.n} ` +
      `Sehnen${teile.length > 1 ? ` in ${teile.length} Abschnitten (Fahrbahn geteilt)` : ''}, Lage folgt der Fahrbahn` : ''})`,
      annahme: false, ...(profil ? { profil } : {}) }
  }
  const [b, , q] = osmBreite(netz.w(wid).t)
  if (b !== null) return { links: b / 2, rechts: b / 2, quelle: `ohne AV-Querschnitt${platzText}: Breite aus OSM (${q}), Mitte am OSM-Weg`, annahme: true }
  return { links: BREITE_ANNAHME_M / 2, rechts: BREITE_ANNAHME_M / 2,
    quelle: `ohne AV-Querschnitt${platzText} und OSM-Breite: Fahrbahn ${String(BREITE_ANNAHME_M).replace('.', ',')} m angenommen, Mitte am OSM-Weg`, annahme: true }
}

/** Fahrstreifenachse des Verkehrs, der auf dem Arm zum Knoten fährt: d vom rechten Rand (links von u), vom Knoten weg */
export function fahrstreifenAchse(mittellinie: P[], qs: Querschnitt, d = D_MFZ_M): P[] {
  return versetztVariabel(mittellinie, s => randLinksBei(qs, s) - d)
}

// ---------------------------------------------------------------- Parkstreifen am rechten Rand (Abzug)
/** Prüfpunkt trifft ein Feld, wenn es höchstens so weit entfernt ist (wie ParkRaster.trifft) */
export const PARK_SONDE_RADIUS_M = 0.4
/** Treffer an einem einzigen Feld, ab denen es als Parkstreifen gilt (rund 8 m bei 2 m Abstand der Prüfpunkte) */
export const PARK_EIN_FELD_TREFFER = 4

export interface ParkStreifen {
  abzug: number               // 0 bzw. PARKSTREIFEN [m]
  treffer: number             // Prüfpunkte auf einem Parkfeld (alle Klassen, Korrektur Punkt 23)
  punkte: number              // Prüfpunkte gesamt
  felder: number              // verschiedene getroffene Felder
}
export const KEIN_PARKSTREIFEN: ParkStreifen = { abzug: 0, treffer: 0, punkte: 0, felder: 0 }

/** Parkstreifen aus Prüfpunkten (je einer PARK_SONDE_M innerhalb des Rands) gegen die Parkfelder (ParkRaster.parkAlle, alle Klassen) */
export function parkStreifen(sonden: P[], park: ParkRaster | null): ParkStreifen {
  if (!park || park.leer || !sonden.length) return { ...KEIN_PARKSTREIFEN, punkte: sonden.length }
  const r = PARK_SONDE_RADIUS_M
  const jeFeld = new Map<string, number>()
  let treffer = 0
  for (const p of sonden) {
    const hier = park.felder.filter(f => p[0] >= f.env[0] - r && p[0] <= f.env[2] + r && p[1] >= f.env[1] - r && p[1] <= f.env[3] + r &&
      abstandPunkt([f.poly], p) <= r)
    if (!hier.length) continue
    treffer++
    for (const f of hier) jeFeld.set(f.id, (jeFeld.get(f.id) ?? 0) + 1)
  }
  const streifen = treffer >= PARK_MIN_TREFFER && (jeFeld.size >= 2 || Math.max(0, ...jeFeld.values()) >= PARK_EIN_FELD_TREFFER)
  return { abzug: streifen ? PARKSTREIFEN : 0, treffer, punkte: sonden.length, felder: jeFeld.size }
}

/** Prüfpunkte am rechten Rand des Verkehrs zum Knoten (links von u, Abstand qs.links) entlang der Mittellinie von 0 bis bis */
export function sondenRechts(mittellinie: P[], qs: Querschnitt, bis: number): P[] {
  const ab: number[] = []
  for (let s = 0; s <= bis + 1e-9; s += QUER_SCHRITT_M) ab.push(s)
  return punkteAufSpur(mittellinie, ab).map(([q, t], i) => add(q, links(t), randLinksBei(qs, ab[i]) - PARK_SONDE_M))
}

const f2 = (x: number) => x.toFixed(2).replace('.', ',')
/** Text zum Parkstreifen, z. B. «Abzug 1,90 m für Parkstreifen rechts (12 von 27 Prüfpunkten, 3 Felder)» */
export function parkStreifenText(ps: ParkStreifen): string {
  const z = `${ps.treffer} von ${ps.punkte} Prüfpunkten${ps.treffer ? `, ${ps.felder} ${ps.felder === 1 ? 'Feld' : 'Felder'}` : ''}`
  return ps.abzug ? `Abzug ${f2(ps.abzug)} m für Parkstreifen rechts (${z})` : `kein Parkstreifen rechts (${z})`
}
