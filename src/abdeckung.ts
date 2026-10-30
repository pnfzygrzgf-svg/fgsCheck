// ── Abdeckung der geladenen Daten: wann die App um Streifen von Hand neu lädt (Planung neuer Streifen) ──
//
// Die App lädt AV, OSM und die Kataster um einen Ort (Ladeort): am OSM-Übergang dessen Knoten, beim Planen bzw. nach dem
// Verschieben eines Streifens von Hand die Mitte der Streifen von Hand. Die Rechnung braucht um jeden Streifen Daten bis
// REICHWEITE_M; ein Streifen von Hand gilt als abgedeckt, wenn er ganz innert NACHLADEN_M um den Ladeort liegt.
//
// Herleitung NACHLADEN_M (16.10.2026):
// - Ausschnitte der Abrufe (App.laden): AV (Bodenbedeckung, Einzelobjekte) Rechteck ±AV_RADIUS_M = 150 m, amtliche Parkfelder
//   und Baumkataster Rechteck ±PARK_RADIUS_M = 150 m, OSM Umkreis OSM_RADIUS_M = 300 m (Wege, die ihn schneiden, ganz). Das
//   Rechteck ±150 m enthält den Kreis mit 150 m: in jede Richtung reichen die Daten mindestens 150 m weit.
// - Reichweite der Rechnung um den Umriss eines Streifens, REICHWEITE_M = KATASTER_PARK_M = 120 m (Herleitung in
//   rechner/vorschlaege.ts): gerade Zufahrten bis zur grössten Sichtweite 75 m (VSS 40 241 Tab. 1 ab 60 km/h, SICHTWEITE) und
//   5 m Spur dahinter; Abbiegende bis zum Knoten (innerhalb der Sichtweite, also höchstens 75 m) und 30 m am Arm
//   (ARM_MESSUNG, Fahrbahn und Parkabzug) = 105 m; seitlich bis an die Bordkante rund 10 m = 115 m; Reserve 5 m = 120 m.
// - NACHLADEN_M = min(AV_RADIUS_M, PARK_RADIUS_M) − REICHWEITE_M = 150 − 120 = 30 m. OSM begrenzt nicht (300 − 120 = 180 m).
// Gemessen wird der weiteste Punkt des Umrisses: grösserer Abstand der Achsenenden vom Ladeort plus halbe Breite (die Ecken
// liegen eine halbe Breite neben den Achsenenden, rechner/index.handUmriss), eine strenge obere Schranke. «Abgedeckt» heisst
// also: der ganze Streifen liegt innert 30 m um den Ladeort (nicht nur seine Mitte).
// Der Streifen aus OSM + AV reicht bis rund STREIFEN_OSM_HALB_M = 15 m vom Übergangsknoten (halbe Länge auf breiten
// Fahrbahnen, vgl. PARK_RADIUS_M): der OSM-Übergang bleibt beim Fall, wenn sein Knoten höchstens QUERUNG_M = 30 − 15 = 15 m vom
// neuen Ladeort liegt; dann deckt der Ausschnitt auch den Streifen aus OSM + AV (z. B. nach dem Löschen der Streifen von Hand).
// Mit der halben Balkenlänge (Annahme 4 m: 2 m) reicht dieser Streifen bis rund 15 + 15 + 2 = 32 m vom Ladeort, 2 m über
// NACHLADEN_M: das liegt in der Reserve von 5 m der REICHWEITE_M (die Rechnung erreicht 115 m, die Daten reichen 150 − 32 =
// 118 m), QUERUNG_M bleibt darum 15 m (Korrektur 16.10.2026, Prüfung).
//
// Mehrere Streifen von Hand (Korrektur 16.10.2026, S2): 30 m um einen Streifen sind für die Streifen eines Knotens knapp.
// Ladeort ist darum die Mitte des kleinsten Kreises um alle Streifen von Hand (gemeinsamerOrt: um die Kreise mit halber Breite
// um die Achsenenden, dieselbe Schranke wie oben), wenn dann alle abgedeckt sind: die Streifen spannen dann höchstens rund
// 2 × 30 = 60 m auf. Sonst wie bisher um den Bezugsstreifen; die übrigen meldet die App. Die Ausschnitte (±150 m, 300 m)
// bleiben.
//
// Regeln (Auftrag 16.10.2026, Planung neuer Streifen; Korrektur 16.10.2026):
// - neuer Streifen von Hand: zum laufenden Fall dazu, wenn er in der Abdeckung um den Ladeort liegt oder alle Streifen von Hand
//   (bisherige und neuer) zusammen abgedeckt werden können (danach um den gemeinsamen Ort nachladen, falls nötig); sonst bzw.
//   ohne geladenen Ort neuer Fall am Streifen, nur mit diesem Streifen (planEntscheid). Ein Fall mit OSM-Übergang bleibt im
//   Browser gemerkt (fall.fallMerken); ein Fall ohne Übergang mit ungesicherten Eingaben wird erst nach Bestätigung ersetzt.
// - Streifen von Hand verschoben bzw. Breite geändert und nicht mehr abgedeckt: Daten neu laden, der Fall bleibt
//   (ortEntscheid mit diesem Streifen als Bezug, ortVerlegen).
// - Fall-Datei, deren Streifen von Hand ausserhalb der Abdeckung um ihren Ort liegen: Ort wie oben (fallAmStreifen), mit
//   Hinweis.
// - Mehrere Streifen von Hand weit auseinander (kein gemeinsamer Ort): geladen wird um den Bezugsstreifen (zuletzt verschoben
//   bzw. geändert, sonst der zuletzt gezeichnete = letzte der Liste); die übrigen ausserhalb der Abdeckung meldet die App
//   (nichtAbgedeckt) mit ihrer Reichweite, statt still mit fehlenden Daten zu rechnen.
// - Wird der Ort verlegt, bleibt der OSM-Übergang nur, wenn sein Knoten höchstens QUERUNG_M vom neuen Ort liegt. Die Lage des
//   Knotens kennt die App erst aus den OSM-Daten: beim Laden einer Fall-Datei (bzw. eines gemerkten Falls) ist der
//   gespeicherte Ort der Knoten oder ein schon verlegter Ort höchstens QUERUNG_M davon; die Datei behält den Übergang darum
//   vorläufig mit diesem Spiel (fallAmStreifen), nach dem Laden entscheidet querungAusserhalb mit der Lage aus OSM – nur bei
//   Fällen mit Streifen von Hand; ohne sie gehört der Fall zum Übergang, die App lädt um dessen aktuelle Lage neu (K-a).

import { type P, dist, lv95, wgs, kleinsterKreis } from './geo'
import { KATASTER_PARK_M } from './rechner/vorschlaege'
import { type Fall, ohneUebergang } from './fall'
import { streifenTitel, titelImFall } from './benennung'

/** AV (Bodenbedeckung, Einzelobjekte): Rechteck ± so viel um den Ladeort */
export const AV_RADIUS_M = 150
/** OpenStreetMap (Overpass): Umkreis um den Ladeort */
export const OSM_RADIUS_M = 300
// Amtliche Parkfelder und Baumkataster: Ausschnitt ±150 m um den Ort. Die Rechnung erreicht Felder und Bäume bis
// KATASTER_PARK_M (120 m) um den Umriss der Streifen (rechner/vorschlaege.ts, dort die Herleitung); der Umriss liegt am Ort
// (OSM-Knoten im Streifen, Luftbild-Streifen höchstens 4 m daneben), reicht aber bis zur halben Streifenlänge (breite
// Fahrbahn, Teilstreifen) davon weg: 120 + rund 15 m + Reserve. 150 m entspricht dem AV-Ausschnitt (weiter reicht die
// Fahrbahn der Rechnung nicht) und dem Umkreis der Berner Prüfung. Baumkataster bis 11.10.2026 ±100 m (Bäume bis 100 m um
// die Streifenmitte).
export const PARK_RADIUS_M = 150
export const KATASTER_RADIUS_M = PARK_RADIUS_M

/** Reichweite der Rechnung um den Umriss eines Streifens (Herleitung oben und in rechner/vorschlaege.ts) */
export const REICHWEITE_M = KATASTER_PARK_M
/** Streifen von Hand ganz innert so viel um den Ladeort: abgedeckt (30 m) */
export const NACHLADEN_M = Math.min(AV_RADIUS_M, PARK_RADIUS_M, OSM_RADIUS_M) - REICHWEITE_M
/** Streifen aus OSM + AV: halbe Länge auf breiten Fahrbahnen (Umriss so weit vom Übergangsknoten) */
export const STREIFEN_OSM_HALB_M = 15
/** OSM-Übergang bleibt beim Fall, wenn sein Knoten höchstens so weit vom neuen Ladeort liegt (15 m) */
export const QUERUNG_M = NACHLADEN_M - STREIFEN_OSM_HALB_M
/** Ladeort schon so nah am Ziel: nicht nochmals laden (sehr langer Streifen bleibt teils ausserhalb, Hinweis; keine Schleife
 * aus der Rundung LV95 → WGS84 → LV95) */
export const ORT_TOL_M = 1.0

/** Lage eines Streifens von Hand (Achsenenden, Breite = Balkenlänge) */
export interface HandLage { id: string; p0: P; p1: P; breite: number }
/** Streifen von Hand ausserhalb der Abdeckung: weitester Punkt seines Umrisses vom Ladeort */
export interface Ausserhalb { id: string; reichtM: number }

export const streifenMitte = (s: { p0: P; p1: P }): P => [(s.p0[0] + s.p1[0]) / 2, (s.p0[1] + s.p1[1]) / 2]

/** Weitester Punkt des Umrisses vom Ladeort (obere Schranke: Achsenende + halbe Breite) */
export function streifenAbstand(s: { p0: P; p1: P; breite: number }, ort: P): number {
  return Math.max(dist(ort, s.p0), dist(ort, s.p1)) + s.breite / 2
}

/** Liegt der Streifen ganz in der Abdeckung der Daten um den Ladeort? */
export const abgedeckt = (s: { p0: P; p1: P; breite: number }, ort: P): boolean => streifenAbstand(s, ort) <= NACHLADEN_M + 1e-9

/** Streifen von Hand ausserhalb der Abdeckung um den Ladeort, mit dem weitesten Punkt ihres Umrisses */
export function nichtAbgedeckt(streifen: HandLage[], ort: P): Ausserhalb[] {
  return streifen.filter(s => !abgedeckt(s, ort)).map(s => ({ id: s.id, reichtM: streifenAbstand(s, ort) }))
}

/** Richtungen für die Kreise um die Achsenenden (5°): bei gleicher Breite aller Streifen nicht gebraucht */
const KREIS: P[] = Array.from({ length: 72 }, (_, i): P => [Math.cos(i * Math.PI / 36), Math.sin(i * Math.PI / 36)])

/**
 * Gemeinsamer Ladeort aller Streifen von Hand: Mitte des kleinsten Kreises um die Kreise mit halber Breite um die
 * Achsenenden (die Schranke von streifenAbstand), d. h. der Ort, von dem aus der weiteste Punkt am nächsten liegt.
 * Gleiche Breite: kleinster Kreis um die Achsenenden (genau; ein Streifen: seine Mitte). Verschiedene Breiten: um die Kreise,
 * je 72 Punkte (Fehler unter 1 cm bis 15 m Breite). -> Ort und weitester Punkt aller Streifen von dort; null ohne Streifen.
 */
export function gemeinsamerOrt(streifen: { p0: P; p1: P; breite: number }[]): { ort: P; reichtM: number } | null {
  if (!streifen.length) return null
  const gleich = streifen.every(s => s.breite === streifen[0].breite)
  const punkte = gleich ? streifen.flatMap(s => [s.p0, s.p1]) : streifen.flatMap(s => [s.p0, s.p1]
    .flatMap(e => KREIS.map(([c, sn]): P => [e[0] + c * s.breite / 2, e[1] + sn * s.breite / 2])))
  const k = kleinsterKreis(punkte)!
  return { ort: k.m, reichtM: Math.max(...streifen.map(s => streifenAbstand(s, k.m))) }
}

/** Können alle diese Streifen von einem gemeinsamen Ladeort aus abgedeckt werden? */
export function gemeinsamAbgedeckt(streifen: { p0: P; p1: P; breite: number }[]): boolean {
  const g = gemeinsamerOrt(streifen)
  return !!g && g.reichtM <= NACHLADEN_M + 1e-9
}

export interface OrtEntscheid {
  nachladen: boolean                 // Daten um ort neu laden
  ort: P                             // neuer Ladeort bzw. der bisherige
  art: 'alle' | 'bezug' | null       // neuer Ort: Mitte aller Streifen von Hand bzw. Mitte des Bezugsstreifens; null: bleibt
  bezug: string | null               // Streifen, der den Entscheid auslöst (zuletzt verschoben bzw. geändert, sonst der letzte)
  abstandM: number                   // neuer Ladeort vom bisherigen (0, wenn er bleibt)
  vorher: Ausserhalb[]               // Streifen ausserhalb der Abdeckung um den bisherigen Ladeort
  querungBehalten: boolean           // OSM-Übergang (querung) liegt höchstens QUERUNG_M vom neuen Ladeort: bleibt beim Fall
  nichtAbgedeckt: Ausserhalb[]       // Streifen ausserhalb der Abdeckung (nach dem Entscheid)
}

/**
 * Muss die App um Streifen von Hand neu laden? Sind alle abgedeckt: nein. Sonst neuer Ladeort = gemeinsamerOrt, wenn er alle
 * abdeckt (art 'alle'); sonst Mitte des Bezugsstreifens (art 'bezug': opt.bezug, sonst der zuletzt gezeichnete = letzte der
 * Liste), ausser dieser liegt schon abgedeckt. Liegt der neue Ort höchstens ORT_TOL_M vom bisherigen: nicht nachladen.
 * querung: Lage des OSM-Übergangs (LV95), falls der Fall einen hat; querungSpielM: so weit kann sie von dieser Lage abweichen
 * (gespeicherter Ort statt Knoten, fallAmStreifen), behalten wird dann vorläufig.
 */
export function ortEntscheid(streifen: HandLage[], ort: P,
  opt: { bezug?: string | null; querung?: P | null; querungSpielM?: number } = {}): OrtEntscheid {
  const vorher = nichtAbgedeckt(streifen, ort)
  const b = streifen.find(s => s.id === opt.bezug) ?? streifen[streifen.length - 1] ?? null
  const bleibt: OrtEntscheid = { nachladen: false, ort, art: null, bezug: b?.id ?? null, abstandM: 0, vorher, querungBehalten: true,
    nichtAbgedeckt: vorher }
  if (!b || !vorher.length) return bleibt
  const neu = (art: 'alle' | 'bezug', o: P): OrtEntscheid => (dist(ort, o) <= ORT_TOL_M ? bleibt : { nachladen: true, ort: o, art,
    bezug: b.id, abstandM: dist(ort, o), vorher, querungBehalten: !!opt.querung && dist(opt.querung, o) <= QUERUNG_M + (opt.querungSpielM ?? 0) + 1e-9,
    nichtAbgedeckt: nichtAbgedeckt(streifen, o) })
  const g = gemeinsamerOrt(streifen)!
  if (g.reichtM <= NACHLADEN_M + 1e-9) return neu('alle', g.ort)
  return abgedeckt(b, ort) ? bleibt : neu('bezug', streifenMitte(b))
}

/**
 * Neu gezeichneter Streifen von Hand: zum laufenden Fall dazu ('dazu': in der Abdeckung um den Ladeort, oder der Fall hat
 * schon Streifen von Hand und alle zusammen lassen sich von einem Ort aus abdecken – die App lädt danach dort nach, falls
 * nötig), neuer Fall am Streifen ('neu': kein Fall geladen, bisheriger Fall mit OSM-Übergang – im Browser gemerkt – bzw. ohne
 * ungesicherte Eingaben) oder erst bestätigen ('bestaetigen': bisheriger Fall ohne OSM-Übergang mit Eingaben, die nicht als
 * Datei gesichert sind). Ohne Streifen von Hand zählt nur der Ladeort: der Streifen aus OSM + AV gehört zum Übergang.
 */
export function planEntscheid(s: { p0: P; p1: P; breite: number }, ladeOrt: P | null,
  bisher: { uebergang: number | null; eingaben: boolean; gesichert: boolean; streifen: HandLage[] } | null): 'dazu' | 'neu' | 'bestaetigen' {
  if (bisher && ladeOrt && (abgedeckt(s, ladeOrt) || (bisher.streifen.length > 0 && gemeinsamAbgedeckt([...bisher.streifen, s]))))
    return 'dazu'
  if (!bisher || bisher.uebergang !== null || !bisher.eingaben || bisher.gesichert) return 'neu'
  return 'bestaetigen'
}

/** Fall mit neuem Ort (Ladeort aus dem Entscheid); den OSM-Übergang nur behalten, wenn er in der Abdeckung liegt */
export function ortVerlegen(f: Fall, e: OrtEntscheid): Fall {
  const [lat, lon] = wgs(e.ort[0], e.ort[1])
  const neu: Fall = e.querungBehalten ? structuredClone(f) : ohneUebergang(f)
  neu.ort.lat = lat; neu.ort.lon = lon
  return neu
}

/** Liegt der OSM-Übergang (Lage aus den geladenen OSM-Daten) ausserhalb der Abdeckung um den Ladeort? Dann gehört er nicht
 * zum Fall (Fall-Datei bzw. gemerkter Fall, deren gespeicherter Ort nicht der Knoten ist; fallAmStreifen). 5 cm Spiel: der
 * Ladeort geht über WGS84 (ortVerlegen, App.laden), die Rundung LV95 → WGS84 → LV95 liegt unter 1 cm; ein Übergang, den
 * ortEntscheid knapp behalten hat, fällt danach nicht weg */
export const querungAusserhalb = (knoten: P | null, ladeOrt: P): boolean => !!knoten && dist(knoten, ladeOrt) > QUERUNG_M + 0.05

/** Abstand für Hinweise: unter 1 km in Metern, sonst in km (eine Stelle) */
export function abstandText(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

const ABGEDECKT = `abgedeckt ist ein Streifen, der ganz innert ${NACHLADEN_M} m um den Ort liegt`

/** Anzeigename eines Streifens von Hand in den Hinweisen (Vorgabe benennung.streifenTitel ohne eigene Namen: «Streifen 1») */
export type Titel = (id: string) => string
const TITEL: Titel = id => streifenTitel(id)

/** «Streifen 2 reicht bis 34 m» bzw. «Streifen 1 reicht bis 34 m, Streifen 2 bis 40 m» */
function reichtText(liste: Ausserhalb[], titel: Titel): string {
  return liste.map((x, i) => `${titel(x.id)}${i ? '' : ' reicht'} bis ${abstandText(x.reichtM)}`).join(', ')
}

/** Sammelhinweis: Streifen von Hand ausserhalb der Abdeckung (Panel, Bericht; nur für Streifen ohne eigenes Ergebnis, sonst
 * steht ausserhalbText beim Streifen) */
export function nichtAbgedecktText(liste: Ausserhalb[], titel: Titel = TITEL): string {
  return `Streifen von Hand ausserhalb der geladenen Daten (${reichtText(liste, titel)} vom Ort; ${ABGEDECKT}): dort fehlen AV und OSM ` +
    'zum Teil, das Ergebnis (z. B. «keine Zufahrt») ist nicht verlässlich. Um den Streifen neu laden bzw. weit auseinander ' +
    'liegende Streifen je als eigenen Fall planen.'
}

/** Hinweis beim Streifen (Panel, Bericht): ausserhalb der Abdeckung */
export function ausserhalbText(x: Ausserhalb): string {
  return `reicht bis ${abstandText(x.reichtM)} vom Ort (${ABGEDECKT}): Ergebnis nicht verlässlich, auch «keine Zufahrt» kann daher rühren.`
}

/** Bestätigung bzw. Hinweis: neuer Streifen ausserhalb der Abdeckung, die App beginnt dort einen neuen Fall */
export function planNeuText(reichtM: number | null, mitUebrigen: boolean): string {
  if (reichtM === null) return 'Kein Ort geladen: die App beginnt am Streifen einen neuen Fall.'
  const uebrige = mitUebrigen ? `; auch mit den übrigen Streifen von Hand nicht ganz innert ${NACHLADEN_M} m um einen gemeinsamen Ort` : ''
  return `Der neue Streifen reicht bis ${abstandText(reichtM)} vom geladenen Ort, ausserhalb der geladenen Daten (${ABGEDECKT}${uebrige}): ` +
    'die App beginnt am Streifen einen neuen Fall.'
}

/** Hinweis nach dem Nachladen um die Streifen von Hand (Anlass: Fall-Datei bzw. gemerkter Fall, oder verschobener, geänderter
 * bzw. neu gezeichneter Streifen). Streifen, die danach noch ausserhalb liegen, meldet die App gesondert (nichtAbgedecktText
 * bzw. ausserhalbText, im Panel mit Knopf «neu laden»). anzahl: Zahl der Streifen von Hand */
export function nachladenText(e: OrtEntscheid, anlass: 'datei' | 'geaendert', uebergang: number | null, anzahl: number,
  titel: Titel = TITEL): string {
  const b = titel(e.bezug ?? '')
  const um = e.art === 'alle' ? (anzahl > 1 ? `um alle Streifen von Hand (Ort = Mitte aller Streifen, ${abstandText(e.abstandM)} vom ` +
    'bisherigen)' : `um ${b} (Ort = Streifenmitte)`) : `um ${b} (Ort = Streifenmitte; die Streifen von ` +
    `Hand liegen nicht alle innert ${NACHLADEN_M} m um einen Ort)`
  const weg = uebergang === null || e.querungBehalten ? '' : `; der OSM-Übergang ${uebergang} liegt ausserhalb und gehört nicht mehr ` +
    'zum Fall' + (anlass === 'datei' ? ' (gemerkt als Fall ohne Übergang; mit «Fall speichern» sichern)' : ': sein Eintrag im Browser ' +
    'ist entfernt, gemerkt bleibt der Fall ohne Übergang (mit «Fall speichern» sichern)')
  return anlass === 'datei'
    ? `${reichtText(e.vorher, titel)} vom gespeicherten Ort${uebergang !== null ? ` (OSM-Übergang ${uebergang})` : ''}, weiter als die ` +
      `geladenen Daten reichen (${NACHLADEN_M} m): gerechnet ${um}${weg}.`
    : `${reichtText(e.vorher, titel)} vom bisherigen Ort, ausserhalb der geladenen Daten (${ABGEDECKT}): AV, OSM und Kataster werden ` +
      `${um} neu geladen, die Eingaben bleiben${weg}.`
}

/** Hinweis: OSM-Übergang nach dem Laden ausserhalb der Abdeckung (querungAusserhalb), gehört nicht mehr zum Fall */
export function querungWegText(uebergang: number, abstandM: number): string {
  return `Der OSM-Übergang ${uebergang} liegt ${abstandText(abstandM)} vom Ort, ausserhalb der geladenen Daten (Übergang höchstens ` +
    `${QUERUNG_M} m vom Ort): er gehört nicht mehr zum Fall; sein Eintrag im Browser ist entfernt, gemerkt bleibt der Fall ohne ` +
    'Übergang (mit «Fall speichern» sichern).'
}

/** Hinweis: Fall ohne Streifen von Hand, dessen OSM-Übergang weiter als QUERUNG_M vom gespeicherten Ort liegt (Knoten in OSM
 * verschoben): der Fall bleibt beim Übergang, die App lädt um dessen aktuelle Lage neu (Nachprüfung 16.10.2026, K-a) */
export function querungVerschobenText(uebergang: number, abstandM: number): string {
  return `Der OSM-Übergang ${uebergang} liegt ${abstandText(abstandM)} vom gespeicherten Ort (in OSM verschoben): AV, OSM und Kataster ` +
    'werden um seine aktuelle Lage neu geladen, die Eingaben bleiben beim Übergang.'
}

/**
 * Fall-Datei bzw. gemerkter Fall: liegen die Streifen von Hand ausserhalb der Abdeckung um den gespeicherten Ort, wird der Ort
 * verlegt (ortEntscheid). Der gespeicherte Ort ist der Übergangsknoten oder (schon verlegt) höchstens QUERUNG_M davon: den
 * OSM-Übergang behält der Entscheid vorläufig mit diesem Spiel, nach dem Laden prüft die App mit der Lage aus OSM
 * (querungAusserhalb). -> Fall (bei Bedarf mit neuem Ort, sonst derselbe) und Hinweis (leer, wenn unverändert; übrige
 * Streifen ausserhalb stehen in entscheid.nichtAbgedeckt, die App meldet sie nach dem Laden gesondert).
 */
export function fallAmStreifen(f: Fall): { fall: Fall; entscheid: OrtEntscheid; hinweis: string } {
  const ort = lv95(f.ort.lat, f.ort.lon)
  const e = ortEntscheid(f.streifenHand, ort, { querung: f.ort.uebergang !== null ? ort : null, querungSpielM: QUERUNG_M })
  if (!e.nachladen) return { fall: f, entscheid: e, hinweis: '' }
  return { fall: ortVerlegen(f, e), entscheid: e, hinweis: nachladenText(e, 'datei', f.ort.uebergang, f.streifenHand.length,
    id => titelImFall(id, f)) }
}
