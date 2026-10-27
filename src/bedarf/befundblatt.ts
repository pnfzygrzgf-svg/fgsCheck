// ── Bedarfsmodul E1: Befundblatt (reine Funktion zwischen Rechnung + Eingaben und Anzeige) ──
//
// Je Querung (Teilstreifen auf einer Achse): Vorbelegung aus der Rechnung (vorbelegung.ts) und Handeingaben des Falls
// (fallBedarf.ts) bilden die Eingaben; der Entscheidbaum (entscheid.beurteile) liefert Querungstyp und Befunde, mit den Ebenen
// Bern bzw. Kanton BE nach dem Ort (von Hand schaltbar). Die Sicht kommt aus dem Sichtrechner (Skizze: «Sicht bleibt der letzte
// Schritt»): ist keine vorhandene Sichtweite von Hand eingegeben, ersetzt sein Ergebnis die Regeln H1 (Fussgängerstreifen) bzw.
// E3 (Querung ohne Vortritt, VSS 40 240 Z. 8.2) des Baums – je Zufahrt verdeckt = Befund, frei = erfüllt. Die Regeln H1/E3 des
// Baums kennen weder «bis Knoten» noch Kurvenradien der Rechnung und würden deren Sichtweiten falsch werten.
// Offene Einträge stehen nach fehlendem Feld und Block der Maske; Blöcke ganz ohne Eingaben als «nicht geprüft».
// Automatik Paket A (21.10.2026): «Sichtweite je Zufahrt» ohne Handeingabe im Zustand «rechner» (Anzeige des Sichtrechners je
// Zufahrt, zählt nicht als offen); «frei bis» je gerade Zufahrt (ZufahrtErgebnis.freiBisM) in Sichtzeilen und Grundprüfung. H4
// (Knotenradius unter 20 m) erscheint mit dem Radius aus dem Sichtrechner nur, wenn das Soll nach Radius strenger ist als das
// nach Tempo (sonst prüft der Sichtrechner die Abbieger schon nach Radius); mit einem Radius von Hand wie bisher.

import { beurteile } from './entscheid'
import { KATALOG, WERKE, quellText, type RegelId, type WerkId } from './katalog'
import type { Befund, Eintrag, Liste, MassZeile } from './typen'
import { eingabenBilden, ebenenWirksam, QUELLE_TEXT, type Gebildet } from './fallBedarf'
import { querungen, vorbelegen, streifenTyp, type QuerungGruppe, type Vorbelegt, type GeoVorbelegung } from './vorbelegung'
import { FELD_DEFS, FELD_DEF, GRUPPEN, feldName, gruppeVon, gruppenName, wertText, type GruppeId } from './felder'
import { lesetext } from './lesetext'
import { QUELLEN_ANNAHME } from './eingaben'
import { ahs } from './tabellen'
import { grundpruefung, type Grundpruefung } from './grundpruefung'
import { ausgeblendeteBloeckeLeeren } from './feldhilfen'
import { regelName, regelTitel } from './regelname'
import { fundstelleKurz } from './quellen'
import { nachAbschnitt, themaVon } from './themen'
import type { Querungstyp } from './eingaben'
import type { StreifenErgebnis, ZufahrtErgebnis } from '../rechner/typen'
import type { Fall } from '../fall'
import type { P } from '../geo'
import { sichtweiteKurve } from '../rechner/tempo'
import { sichtQuelleKurz } from '../texte'
import { sichtFgs } from './tabellen'

export interface BlattOptionen {
  /** Vorgabe der Ebenen nach dem Ort (fallBedarf.ebenenVorgabe) */
  vorgabe: { bern: boolean; kantonBE: boolean }
  /** angenommene Inseln der Rechnung (nach OSM und Luftbild) */
  inseln?: { ring: P[] }[]
  /** Name eines Streifens bzw. einer Zufahrt für die Anzeige (App: benennung.ts) */
  titel?: (fgsId: string) => string
  zufahrt?: (fgsId: string, zufahrt: string) => string
  /** Geodaten für die Vorbelegung (Haltestellen, Verkehrsdaten, OSM-Tags, Strassenlampen; vorbelegung.ts) */
  geo?: GeoVorbelegung
  /** Trottoirüberfahrt: Alternative Fussgängerstreifen mit Fragen prüfen (Sitzung, nicht im Fall; entscheid.Optionen.alternative) */
  alternative?: boolean
}

/** Sicht je Zufahrt aus dem Sichtrechner */
export interface SichtZeile {
  fgsId: string; zufahrt: string; name: string; regel: 'H1' | 'E3'
  tempo: number; soll: number; quelle: string; frei: boolean; status: string
  /** nur bis hier geprüft (Querung ohne Vortritt über der Reichweite der geladenen Daten) */
  bisM?: number
  /** Sichtfeld frei bis (gerade Zufahrten, Sichtrechner) */
  freiBisM?: number
}
export interface OffenZeile { feld: string; name: string; gruppe: GruppeId | null; regeln: string[]
  /** Feld hat eine vorgeschlagene Annahme, die ein hartes Verbot trägt: bestätigen statt eingeben (Korrektur M2) */
  bestaetigen?: boolean }

export interface BefundBlatt {
  gruppe: string
  streifen: string[]
  titel: string
  befund: Befund
  gebildet: Gebildet
  vorbelegt: Vorbelegt
  ebenen: { bern: boolean; kantonBE: boolean; richtlinie: boolean }
  /** Sicht aus dem Sichtrechner (leer, wenn sie von Hand eingegeben ist bzw. nicht passt) */
  sicht: SichtZeile[]
  sichtVonHand: boolean
  /** Empfohlener Querungstyp mit Elementen als Text */
  typText: string
  /** Zulässigkeit eines Fussgängerstreifens als Text */
  zulText: string
  /** eine Zeile Begründung mit Ziffern */
  begruendung: string
  offen: OffenZeile[]
  nichtGeprueft: { block: string; grund: string }[]
  annahmen: string[]
  /** Hinweise zur Vorbelegung und Bildung */
  hinweise: string[]
  /** Grundprüfung nach bfu (Big Five), unabhängig von den Ebenen */
  grund: Grundpruefung
  /** von Hand gestrichene Zufahrten (nicht geprüft; Vermerk in der Prüfübersicht) */
  gestrichen?: number
  /** Trottoirüberfahrt mit geprüfter Alternative Fussgängerstreifen (nur dann true) */
  alternative?: boolean
}

/** Empfehlung ausgesetzt, solange offen ist, ob die Querung in einer Begegnungszone liegt (Runde 4) */
export const A2_OFFEN_TEXT = 'Empfehlung folgt, sobald geklärt ist, ob die Querung in einer Begegnungszone liegt'
/** Ohne Ortslage keine Empfehlung (Runde 5, Stelle 55) */
export const OHNE_ORTSLAGE_TEXT = 'Noch keine Empfehlung: Es fehlt die Angabe, ob die Querung innerorts liegt'
/** Detail eines Verbots, das auf einer Annahme bzw. Schätzung von Hand beruht (Runde 4; aus der Vorbelegung: entscheid.ts) */
export const DETAIL_HAND_ANNAHME = 'beruht auf einer Annahme bzw. Schätzung: als Quelle «bestätigt» bzw. «von Hand» wählen oder den Wert ändern'

const leer = (): Liste => ({ verletzungen: [], bericht: [], empfehlungen: [], hinweise: [], offen: [] })
const LOKAL = ['Bern', 'Kanton BE']

/** kurze Fundstelle einer Regel: erstes Werk und Ziffer, z. B. «VSS 40 241 Z. 24» */
export function kurzQuelle(id: string): string {
  const d = KATALOG[id as RegelId]
  const q = d?.quellen[0]
  return q ? `${WERKE[q.werk as WerkId].name} ${q.ziffer}` : ''
}

/** Empfohlener Querungstyp als Text; mitVorbehalt false: ohne den Zusatz «vorläufig …» (Panel: Fragen statt Regeln) */
export function typText(b: Befund, mitVorbehalt = true): string {
  const e = b.empfehlung, el = e.elemente
  const mit = (x: string[]) => (x.length ? `${x[0]}${x.length > 1 ? ` mit ${x.slice(1).join(' und ')}` : ''}` : '')
  let t: string
  switch (e.typ) {
    case 'Q1': case 'Q2': t = mit(el.map((x, i) => (i ? DATIV[x] ?? x : x))); break
    case 'Q3': t = 'Trottoirüberfahrt'; break
    case 'furt': t = `Querung ohne Vortritt: ${el.join(', ')}; kein Fussgängerstreifen`; break
    case 'ohne_vortritt': t = `Querung ohne Vortritt: ${el.join(', ')}; kein Fussgängerstreifen`; break
    case 'flaechig': t = `Flächige Querung: ${el.join(', ')}`; break
    default: t = b.ende === 'ausserorts' ? 'Ausserorts: nicht beurteilt' : b.alle.some(x => x.id === 'A2' && x.zustand === 'offen') ? A2_OFFEN_TEXT
      : OHNE_ORTSLAGE_TEXT
  }
  if (e.vorlaeufig && mitVorbehalt && t !== A2_OFFEN_TEXT) t += ` (vorläufig: offen ${e.offenWegen.length ? `wegen ${e.offenWegen.map(feldOderRegel).join(', ')}` : 'ist die Zulässigkeit'})`
  return t
}
/** Elemente nach «mit» (Dativ) */
const DATIV: Record<string, string> = { 'vorgezogener Seitenraum': 'vorgezogenem Seitenraum' }
const feldOderRegel = (x: string): string => (x in KATALOG ? regelName(x) : feldName(x))

const ZUL: Record<string, string> = {
  zulaessig: 'Fussgängerstreifen zulässig', mit_begruendung: 'Fussgängerstreifen zulässig mit Begründung',
  nicht_angezeigt: 'Fussgängerstreifen nicht angezeigt', offen: 'Zulässigkeit offen',
}

/** Regel mit Kurztitel und lesbarer Fundstelle, ohne Nummer (Nutzertest 23.10.2026), z. B. «Wenig Fahrverkehr – VSS-Norm 40 241
 * Fussgängerstreifen, Ziffer 17»; die Anzeige verlinkt das Werk ins Quellenverzeichnis */
const regelVerweis = (id: string): string => `${regelTitel(id)} – ${fundstelleKurz(id)}`

/** Begründung in einer Zeile: Zulässigkeit, Regeln für den Typ mit Fundstelle */
export function begruendung(b: Befund, typ: Querungstyp | null = null): string {
  const teile: string[] = []
  const verl = (ids: string[]) => [...new Set(b.alle.filter(x => x.zustand === 'verletzt' && ids.includes(x.id)).map(x => x.id))]
  // beurteilte Trottoirüberfahrt (27.10.2026): nur aus ihren zwingenden Punkten und Merkmalen, nichts zum Fussgängerstreifen
  if (typ === 'trottoirueberfahrt') return begruendungTue(b)
  if (b.zulaessigkeit === 'offen') {
    // Runde 5 (Stelle 6, F4): die wirklich offene Regel nennen, nicht die verletzten Soll-Regeln
    const offen = b.alle.filter(x => x.zustand === 'offen' && ['A2', 'C1', 'C2'].includes(x.id))
      .filter((x, i, a) => a.findIndex(y => y.id === x.id) === i)
    teile.push(`Zulässigkeit offen, weil ${offen.length ? offen.map(x => `${offenWeil(x)}: ${regelVerweis(x.id)}`).join('; ')
      : 'Angaben fehlen'}`)
    const gegen = verl(['C3', 'C4'])
    if (gegen.length) teile.push(`Zusätzlich spricht dagegen: ${gegen.map(regelVerweis).join('; ')}`)
  } else if (b.zulaessigkeit) {
    const ids = verl(['C1', 'C2', 'C2b', 'C3', 'C3b', 'C4'])
    teile.push(`${ZUL[b.zulaessigkeit]}${ids.length ? `: ${ids.map(regelVerweis).join('; ')}` : ''}`)
  }
  const gr = b.empfehlung.grundlage.filter(id => !['C1', 'C2'].includes(id))
  if (gr.length) teile.push(`Typ nach ${gr.map(regelVerweis).join('; ')}`)
  // gewählte Anlage ohne Vortritt (Furt usw.): kein Satz zur Insel des Fussgängerstreifens (Runde 5, Fall 6)
  else if (b.empfehlung.typ === 'Q1' && !(typ && OHNE_VORTRITT_ANLAGE.includes(typ))) teile.push(b.empfehlung.elemente.includes('Schutzinsel') ? 'Schutzinsel vorhanden; ein Lichtsignal ist nicht nötig'
    : 'Insel oder Lichtsignal sind nicht nötig (keine Regel verlangt sie)')
  return teile.join('. ')
}
const OHNE_VORTRITT_ANLAGE: readonly string[] = ['furt', 'ohne_vortritt', 'mehrzweck']

/** Begründung einer beurteilten Trottoirüberfahrt: zwingende Punkte (Q3, Trottoirrand F5c) verletzt bzw. offen, sonst die nicht erfüllten
 * Merkmale (Soll); leer, solange die Prüfung nicht gelaufen ist */
function begruendungTue(b: Befund): string {
  if (!b.ausgewertet.includes('Q3-4')) return ''
  const zwingend = (id: string) => (id.startsWith('Q3') || id === 'F5c') && ['hart', 'hart_bericht'].includes(KATALOG[id as RegelId]?.staerke ?? '')
  const ids = (z: 'verletzt' | 'offen', f: (id: string) => boolean) =>
    nachAbschnitt([...new Set(b.alle.filter(x => x.zustand === z && f(x.id) && (z === 'offen' || x.staerke !== 'hinweis')).map(x => x.id))], x => x)
  const hart = ids('verletzt', zwingend), offen = ids('offen', zwingend)
  if (hart.length) return `Nicht zulässig: ${hart.map(regelVerweis).join('; ')}`
  if (offen.length) return `Zulässigkeit offen, weil Angaben fehlen: ${offen.map(regelVerweis).join('; ')}`
  const soll = ids('verletzt', id => themaVon(id) === 'trottoirueberfahrt' && KATALOG[id as RegelId]?.staerke === 'weich')
  return `Zwingende Punkte ohne Befund (VSS 40 242 Tab. 1)${soll.length ? `. Merkmale bzw. Ausstattung nicht erfüllt: ${soll.map(regelVerweis).join('; ')}` : ''}`
}
/** was bei offener Zulässigkeit fehlt (Begründung) */
const OFFEN_WEIL: Record<string, string> = {
  A2: 'nicht geklärt ist, ob eine Begegnungszone vorliegt', C1: 'das Tempo nicht geklärt ist',
}
/** Grund der offenen Zulässigkeit nach den fehlenden Feldern (C2: Zone und/oder besonderer Grund; Korrektur nach Prüfung Runde 5) */
function offenWeil(x: Eintrag): string {
  if (x.id !== 'C2') return OFFEN_WEIL[x.id]
  const f = x.fehlend ?? []
  const zone = 'noch offen ist, ob die Strasse in einer Tempo-30-Zone liegt', grund = 'noch kein besonderer Grund für Vortritt bestätigt ist'
  return f.includes('tempoRegime') && f.includes('beduerfnis') ? `${zone}, und ${grund}` : f.includes('tempoRegime') ? zone : grund
}

function statusKurz(z: ZufahrtErgebnis): string {
  if (z.status === 'frei') return 'frei'
  const arten = [...new Set(z.konflikte.map(konfliktName))].slice(0, 3)
  return `verdeckt${arten.length ? ` durch ${arten.join(', ')}` : ''}`
}
/** Hindernis im Lesetext (Runde 5, Stelle 42): keine Layer- bzw. Rohnamen */
export function konfliktName(k: { klasse: string; layer: string }): string {
  if (k.klasse === 'auto') return /kataster|Parkfeld_|APK|_\(/i.test(k.layer) ? 'Parkfeld (Parkkataster)' : 'Parkfeld'
  return KONFLIKT_TEXT[k.klasse] ?? 'Hindernis'
}

/** Liste und Gruppen neu aus «alle» (nach dem Ersetzen der Sicht) */
function neuOrdnen(b: Befund): void {
  const norm = leer(), lokal = leer()
  for (const x of b.alle) {
    const l = LOKAL.includes(x.ebene) ? lokal : norm
    if (x.zustand === 'offen') l.offen.push(x)
    else if (x.staerke === 'hart') l.verletzungen.push(x)
    else if (x.staerke === 'hart_bericht') l.bericht.push(x)
    else if (x.staerke === 'weich') l.empfehlungen.push(x)
    else l.hinweise.push(x)
  }
  b.norm = norm; b.lokal = lokal
  const m = new Map<string, string[]>()
  for (const x of b.alle) if (x.zustand === 'offen') for (const f of x.fehlend ?? []) if (!(m.get(f) ?? []).includes(x.id)) m.set(f, [...(m.get(f) ?? []), x.id])
  b.offenGruppen = [...m].map(([feld, regeln]) => ({ feld, regeln })).sort((a, c) => c.regeln.length - a.regeln.length)
}

const OHNE_VORTRITT = ['furt', 'ohne_vortritt']
/** Typen, die aus den Streifen folgen */
const STREIFEN_TYPEN = ['fgs', 'lsa', 'furt', 'ohne_vortritt']
const TYP_TEXT: Record<string, string> = { fgs: 'Fussgängerstreifen', lsa: 'Fussgängerstreifen mit Lichtsignal', furt: 'Furt',
  ohne_vortritt: 'Querung ohne Vortritt', trottoirueberfahrt: 'Trottoirüberfahrt' }

/**
 * Ist das Soll des Sichtrechners (nach dem Tempo der Zufahrt) das richtige? (Korrektur A3) Fussgängerstreifen (H1, VSS 40 241 Z. 14):
 * Anzeichen für schnelleres Fahren unbekannt → offen; Anzeichen ohne V85 → offen (V85 messen); V85 über dem signalisierten Tempo mit
 * Anzeichen bzw. Messung → Soll nach V85, rechnet der Sichtrechner tiefer → offen. Ohne Vortritt (E3): V85 über dem Tempo der Zufahrt →
 * offen. null: Soll passt.
 */
function tempoPruefen(e: Gebildet['eingaben'], regel: 'H1' | 'E3', tempo: number): { fehlend: string[]; grund: string } | null {
  const v85 = e.v85.wert, vSig = e.vSig.wert
  // Korrektur M1: signalisiertes Tempo (z. B. von Hand) höher als das Tempo im Sichtrechner → Sicht nach dem höheren Tempo neu rechnen
  const hoeher = vSig !== null && vSig > tempo + 1e-9
    ? { fehlend: ['sichtVorh'], grund: `signalisiert ${vSig} km/h, der Sichtrechner rechnet mit ${tempo} km/h: Sicht nach dem höheren Tempo ` +
      'neu rechnen (Tempo der Zufahrt von Hand) bzw. Sichtweite von Hand eingeben' } : null
  if (regel === 'E3') {
    if (v85 !== null && v85 > tempo) return { fehlend: ['sichtVorh'], grund: `Soll nach V85 ${v85} km/h nötig, der Sichtrechner rechnet mit ${tempo} km/h` }
    return v85 === null ? hoeher : null
  }
  const anz = e.anzeichenSchneller.wert, nachweis = e.v85Nachweis.wert
  if (anz === null) return { fehlend: ['anzeichenSchneller'], grund: 'ob schneller als signalisiert gefahren wird, ist offen' }
  if (anz && v85 === null) return { fehlend: ['v85'], grund: 'Anzeichen für schnelleres Fahren und V85 nicht gemessen' }
  if (v85 !== null && vSig !== null && v85 > vSig) {
    if (!anz && nachweis === null) return { fehlend: ['v85Nachweis'], grund: 'ob die V85 gemessen ist, ist offen' }
    if ((anz || nachweis) && tempo < v85) return { fehlend: ['sichtVorh'],
      grund: `Soll nach V85 ${v85} km/h nötig (Sichtweite nach gefahrenem Tempo, H1b), der Sichtrechner rechnet mit ${tempo} km/h` }
  }
  // gemessene tiefere V85 darf gelten (VSS 40 241 Z. 14): dann genügt das Tempo des Sichtrechners, wenn es mindestens die V85 ist
  if (hoeher && !(v85 !== null && !anz && nachweis && v85 <= tempo + 1e-9)) return hoeher
  return null
}

/** Titel aus einer OSM-Nummer («Streifen 2066165582», «Streifen 5180148897-1»): im Lesetext durch die Strasse ersetzen (Runde 5, Stelle 41) */
const istNummernTitel = (t: string): boolean => /^Streifen \d{4,}(-\d+)?$/.test(t)
/** Name eines Streifens in Detailtexten: Streifen von Hand mit Titel; OSM-Streifen «Querung <Strasse>» bzw. an der Insel «Teil 1», «Teil 2» */
function teilTitel(g: QuerungGruppe, titel: (id: string) => string): (id: string) => string {
  return id => {
    const t = titel(id)
    if (!istNummernTitel(t)) return t
    if (g.streifen.length > 1) return `Teil ${g.streifen.findIndex(s => s.fgsId === id) + 1}`
    const s = g.streifen.find(x => x.fgsId === id)
    return s?.strasse ? `Querung ${s.strasse}` : t
  }
}
/** Titel des Blatts: «Querung Murtenstrasse (zwei Teile an der Insel)»; Streifen von Hand mit ihrem Titel */
export function blattTitel(g: QuerungGruppe, titel: (id: string) => string): string {
  const ts = g.streifen.map(s => titel(s.fgsId))
  if (!ts.every(istNummernTitel)) return ts.join(' und ')
  const str = [...new Set(g.streifen.map(s => s.strasse).filter(Boolean))].join(', ')
  if (!str) return ts.join(' und ')
  return `Querung ${str}${g.streifen.length === 2 ? ' (zwei Teile an der Insel)' : g.streifen.length > 2 ? ` (${g.streifen.length} Teile)` : ''}`
}

/** Befundblatt einer Querung */
export function befundblatt(g: QuerungGruppe, fall: Fall, opt: BlattOptionen): BefundBlatt {
  const titel = teilTitel(g, opt.titel ?? ((id: string) => id))
  const zName = opt.zufahrt ?? ((_: string, z: string) => z)
  const vorbelegt = vorbelegen(g, fall, opt.inseln ?? [], opt.geo)
  const rechnerAnzeige = { ...(vorbelegt.rechner ?? {}) }
  const sichtText = sichtAnzeige(g, titel, zName)
  if (sichtText) rechnerAnzeige.sichtVorh = sichtText
  vorbelegt.rechner = rechnerAnzeige
  const gebildet = eingabenBilden(vorbelegt.werte, fall.bedarf, rechnerAnzeige)
  // strittige Felder (Datenquellen widersprechen sich) bleiben ohne Handeingabe offen mit Kennzeichen (A2 offen, 23.10.2026)
  for (const f of vorbelegt.strittig ?? []) {
    const x = gebildet.eingaben[f as keyof typeof gebildet.eingaben]
    if (x && x.wert === null) x.strittig = true
  }
  // Querungstyp Fussgängerstreifen bzw. ohne Vortritt folgt aus den Streifen (Querungsart, Lichtsignal); eine abweichende
  // Handeingabe dieser Typen gilt nicht (die Rechnung prüft die Streifen nach ihrer Querungsart). Trottoirüberfahrt und
  // Mehrzweckstreifen bleiben Handeingaben; ist am Streifen «Trottoirüberfahrt» gewählt (23.10.2026), gilt diese Wahl auch gegen
  // eine Handeingabe Fussgängerstreifen bzw. ohne Vortritt
  const vorTyp = vorbelegt.werte.typ, handTyp = fall.bedarf?.felder.typ?.wert as string | undefined
  const typHinweis: string[] = []
  if (vorTyp && handTyp && STREIFEN_TYPEN.includes(handTyp) && handTyp !== vorTyp.wert) {
    gebildet.eingaben.typ = { wert: vorTyp.wert as Querungstyp, quelle: vorTyp.quelle }
    const h = gebildet.herkunft.get('typ')
    if (h) gebildet.herkunft.set('typ', { ...h, text: `${h.text}, übergangen: es gilt die Querungsart der Streifen (${vorTyp.text})` })
    typHinweis.push(`Querungstyp im Bedarf (${TYP_TEXT[handTyp]}) widerspricht der Querungsart der Streifen: es gilt ${TYP_TEXT[vorTyp.wert as string]}`)
  }
  const ebenen = ebenenWirksam(fall.bedarf, opt.vorgabe)
  // ausgeblendete Unterfelder lösen die Blöcke Trottoirüberfahrt bzw. LSA-Zeiten nicht aus (Feldhilfen, SICHTBAR)
  const alternative = opt.alternative === true && gebildet.eingaben.typ.wert === 'trottoirueberfahrt'
  ausgeblendeteBloeckeLeeren(gebildet.eingaben, ebenen, alternative)
  const befund = beurteile(gebildet.eingaben, { ebenen: { bern: ebenen.bern, kantonBE: ebenen.kantonBE, richtlinie: ebenen.richtlinie },
    quelleVon: p => gebildet.herkunft.get(p)?.quelle ?? null, ...(alternative ? { alternative } : {}) })
  // Runde 4: beruht ein Verbot nur auf Annahmen bzw. Schätzungen von Hand (nicht aus der Vorbelegung), gibt es keinen Vorschlag zu
  // bestätigen; das Detail sagt das (entscheid.ts kennt die Herkunft nicht)
  for (const x of befund.alle) if (x.bestaetigen && x.fehlend?.length && x.fehlend.every(f => gebildet.herkunft.get(f)?.zustand === 'hand'))
    x.detail = DETAIL_HAND_ANNAHME
  const hinweise = [...typHinweis, ...vorbelegt.hinweise, ...gebildet.hinweise]
  // H4 mit dem Radius aus dem Sichtrechner nur, wenn das Soll nach Radius strenger ist als das nach Tempo (Automatik Paket A)
  const rH = gebildet.herkunft.get('kurve.radius'), r = gebildet.eingaben.kurve.wert?.radius ?? null, vSig = gebildet.eingaben.vSig.wert
  if (rH?.zustand === 'vorbelegt' && r !== null && befund.alle.some(x => x.id === 'H4')) {
    const [swR] = sichtweiteKurve(r)
    if (!(swR !== null && vSig !== null && swR > sichtFgs(vSig))) {
      befund.alle = befund.alle.filter(x => x.id !== 'H4')
      befund.erfuellt = [...new Set([...befund.erfuellt, 'H4'])]
      neuOrdnen(befund)
    }
  }

  // Sicht aus dem Sichtrechner statt H1/E3, solange keine vorhandene Sichtweite von Hand eingegeben ist
  const sichtVonHand = gebildet.eingaben.sichtVorh.wert !== null
  const sicht: SichtZeile[] = []
  if (!sichtVonHand) {
    const typ = gebildet.eingaben.typ.wert
    befund.alle = befund.alle.filter(x => !['H1', 'E3', 'E3a', 'D5-4'].includes(x.id))
    befund.masse = befund.masse.filter(mz => !mz.regeln.some(id => ['H1', 'E3'].includes(id)))
    const neu: Eintrag[] = []
    const eintrag = (regel: 'H1' | 'E3', x: Partial<Eintrag> & Pick<Eintrag, 'zustand' | 'staerke'>): Eintrag =>
      ({ id: regel, ebene: 'Norm', text: KATALOG[regel].ergebnis, quelle: quellText(regel), ...x })
    // Korrektur S1: Einträge zur Sicht nur für Regeln, die der Baum erreicht hat (nicht ausserorts, Begegnungszone, flächig, Typ offen …)
    const erreichtR = (r: 'H1' | 'E3') => befund.ausgewertet.includes(r)
    for (const s of g.streifen) {
      const st = streifenTyp(s)
      // «kein FGS» und Trottoirüberfahrt (Wahl am Streifen): keine Sicht auf die Wartefläche gerechnet
      if (st === 'kein' || st === 'trottoirueberfahrt') continue
      const ov = OHNE_VORTRITT.includes(st)
      const regel: 'H1' | 'E3' = ov ? 'E3' : 'H1'
      // Fussgängerstreifen mit Lichtsignal: VSS 40 241 gilt nicht (kein H1), Sichtrechner nur zur Information
      if (!ov && s.lsa === 'ja') {
        const zu = s.zufahrten.filter(z => z.status !== 'frei').length
        hinweise.push(`${titel(s.fgsId)}: mit Lichtsignal gilt die Sichtweite nach VSS 40 241 nicht (kein Befund H1); Sichtrechner zur ` +
          `Information: ${zu ? `${zu} von ${s.zufahrten.length} Zufahrten verdeckt` : 'alle Zufahrten frei'}`)
        continue
      }
      // Querungstyp, den der Sichtrechner nicht prüft (Trottoirüberfahrt, Mehrzweckstreifen) bzw. der nicht zur Querungsart passt
      if (typ !== null && (OHNE_VORTRITT.includes(typ) !== ov || ['trottoirueberfahrt', 'mehrzweck'].includes(typ))) {
        const r: 'H1' | 'E3' | null = erreichtR(regel) ? regel : erreichtR(ov ? 'H1' : 'E3') ? (ov ? 'H1' : 'E3') : null
        if (r && !neu.some(x => x.id === r && x.detail?.includes('gilt nicht für den Querungstyp'))) neu.push(eintrag(r, { staerke: 'hart', zustand: 'offen', fehlend: ['sichtVorh'],
          detail: `${titel(s.fgsId)}: Sicht des Sichtrechners (${ov ? 'ohne Vortritt' : 'Fussgängerstreifen'}) gilt nicht für den Querungstyp ` +
            'im Bedarf; vorhandene Sichtweite von Hand eingeben' }))
        continue
      }
      if (!erreichtR(regel)) {
        for (const z of s.zufahrten) sicht.push({ fgsId: s.fgsId, zufahrt: z.zufahrt, name: zName(s.fgsId, z.zufahrt), regel, tempo: z.tempo,
          soll: z.sichtweite, quelle: z.sichtweiteQuelle, frei: z.status === 'frei', status: statusKurz(z),
          ...(z.geprueftBisM !== undefined ? { bisM: z.geprueftBisM } : {}), ...(z.freiBisM !== undefined ? { freiBisM: z.freiBisM } : {}) })
        continue
      }
      if (!s.zufahrten.length) neu.push(eintrag(regel, { staerke: 'hart', zustand: 'offen', fehlend: ['Zufahrten'],
        detail: `${titel(s.fgsId)}: keine Zufahrt geprüft` }))
      // Runde 2 (Korrektur A3): frei heisst nur dann ohne Befund, wenn das Soll nach dem richtigen Tempo gerechnet ist
      const tempoOffen: { z: string; fehlend: string[]; grund: string }[] = []
      for (const z of s.zufahrten) {
        const frei = z.status === 'frei'
        const bis = z.geprueftBisM
        sicht.push({ fgsId: s.fgsId, zufahrt: z.zufahrt, name: zName(s.fgsId, z.zufahrt), regel, tempo: z.tempo, soll: z.sichtweite,
          quelle: z.sichtweiteQuelle, frei, status: statusKurz(z), ...(bis !== undefined ? { bisM: bis } : {}),
          ...(z.freiBisM !== undefined ? { freiBisM: z.freiBisM } : {}) })
        const soll = `${String(z.sichtweite).replace('.', ',')} m frei (${z.sichtweiteQuelle})`
        const wo = g.streifen.length > 1 ? `${titel(s.fgsId)}, ${zName(s.fgsId, z.zufahrt)}` : zName(s.fgsId, z.zufahrt)
        if (frei && bis === undefined) {
          // abbiegende Zufahrten: das Tempo des Sichtrechners ist das der Querstrasse, das Soll kommt aus ihr bzw. dem Kurvenradius
          // (wie in der Grundprüfung); signalisiertes Tempo und V85 der Querung gelten dort nicht (Nachprüfung)
          const t = z.zufahrt.startsWith('a') ? null : tempoPruefen(gebildet.eingaben, regel, z.tempo)
          if (t) tempoOffen.push({ z: zName(s.fgsId, z.zufahrt), ...t })
          continue
        }
        if (frei) {
          // Soll über der Reichweite der geladenen Daten: offen, nicht erfüllt
          neu.push(eintrag(regel, { staerke: 'hart', zustand: 'offen', fehlend: ['sichtVorh'], ist: `frei bis ${bis} m`, soll,
            detail: `${wo}: Sichtfeld bis ${bis} m frei, darüber nicht geprüft (Reichweite der geladenen Daten)` }))
          continue
        }
        // verdeckt: ohne Vortritt hart nur, wenn schon die geprüfte Strecke höchstens die Anhaltesichtweite ist; sonst weich, bis eine
        // zweite Prüfung bis zur Anhaltesichtweite folgt (E2)
        const geprueft = Math.min(z.sichtweite, bis ?? Infinity)
        const hart = !ov || geprueft <= ahs(z.tempo) + 1e-9
        neu.push(eintrag(regel, { staerke: hart ? 'hart' : 'weich', zustand: 'verletzt', ist: statusKurz(z), soll,
          detail: `${wo}: Sichtfeld ${bis !== undefined ? `bis ${bis} m ` : 'bis zur Soll-Sichtweite '}nicht frei (Sichtrechner)` +
            (ov && !hart ? `; ob die Anhaltesichtweite (${ahs(z.tempo)} m) frei bleibt, ist nicht getrennt geprüft: Befund vorerst weich` : '') }))
      }
      if (tempoOffen.length) neu.push(eintrag(regel, { staerke: 'hart', zustand: 'offen',
        fehlend: [...new Set(tempoOffen.flatMap(x => x.fehlend))],
        detail: `${titel(s.fgsId)}: ${tempoOffen.map(x => x.z).join(', ')} frei, aber ${[...new Set(tempoOffen.map(x => x.grund))].join('; ')}` }))
    }
    // Nachprüfung: erreicht der Baum eine Sichtregel, für die der Sichtrechner keine Sicht hat (z. B. E3 bei Fussgängerstreifen, wenn
    // ein Streifen nicht angezeigt ist), bleibt sie offen: Sichtweite von Hand eingeben (wie bei Querungsarten, die er nicht prüft)
    for (const r of ['H1', 'E3'] as const) if (erreichtR(r) && !sicht.some(x => x.regel === r) && !neu.some(x => x.id === r))
      neu.push(eintrag(r, { staerke: 'hart', zustand: 'offen', fehlend: ['sichtVorh'],
        detail: `der Sichtrechner prüft die Sicht hier ${r === 'E3' ? 'als Fussgängerstreifen, nicht ohne Vortritt' : 'nicht als Fussgängerstreifen'}; ` +
          'vorhandene Sichtweite von Hand eingeben' }))
    befund.alle.push(...neu)
    // Korrektur S1: Zustand «rechner» nur, solange H1/E3 die Sichtweite nicht als fehlend führen; sonst offen mit dem Grund
    const sichtFehlt = neu.filter(x => x.zustand === 'offen' && x.fehlend?.includes('sichtVorh'))
    if (sichtFehlt.length && gebildet.herkunft.get('sichtVorh')?.zustand === 'rechner') {
      const grund = [...new Set(sichtFehlt.map(x => x.detail).filter(Boolean))].join('; ')
      gebildet.herkunft.set('sichtVorh', { zustand: 'offen', quelle: null, text: 'offen' })
      vorbelegt.feldHinweise = { ...(vorbelegt.feldHinweise ?? {}), sichtVorh: `${rechnerAnzeige.sichtVorh ?? 'Sichtrechner'}; offen: ${grund}` }
    }
    // D5-4 (Korrektur A2): Hinweis bei verdeckter Sicht; offen, solange die Sicht offen ist; ohne erreichte Sichtregel nicht anwendbar
    const erreicht = (['H1', 'E3'] as const).filter(r => befund.ausgewertet.includes(r))
    const d54 = befund.ausgewertet.includes('D5-4')
    const offenSicht = neu.filter(x => x.zustand === 'offen')
    if (neu.some(x => x.zustand === 'verletzt')) befund.alle.push({ id: 'D5-4', ebene: 'Norm', staerke: 'hinweis', zustand: 'verletzt',
      text: KATALOG['D5-4'].ergebnis, quelle: quellText('D5-4') })
    else if (d54 && offenSicht.length) befund.alle.push({ id: 'D5-4', ebene: 'Norm', staerke: 'hinweis', zustand: 'offen',
      text: KATALOG['D5-4'].ergebnis, quelle: quellText('D5-4'), fehlend: [...new Set(offenSicht.flatMap(x => x.fehlend ?? []))] })
    if (sicht.length) {
      // Korrektur M2: «erfüllt» nur, wenn die Sichtregel erreicht ist und ohne Befund bleibt; offen bei offenem Eintrag bzw. nicht erreicht
      const regeln = [...new Set(sicht.map(x => x.regel))]
      const zahl = sicht.filter(x => !x.frei).length, teil = sicht.filter(x => x.frei && x.bisM !== undefined).length
      const n = sicht.length, zf = (k: number) => `${k} ${k === 1 ? 'Zufahrt' : 'Zufahrten'}`
      const erreicht0 = regeln.some(erreichtR)
      const offenR = neu.some(x => x.zustand === 'offen' && regeln.includes(x.id as 'H1' | 'E3'))
      const verletztR = neu.some(x => x.zustand === 'verletzt')
      // Runde 5 (Stelle 14, Muster 3): gerade und abbiegende Zufahrten getrennt; frei, aber offen nur wegen der Frage nach schnellerem
      // Fahren: «erfüllt unter Vorbehalt» (wie Kasten und Befundblatt)
      const sollVon = (ab: boolean) => [...new Set(sicht.filter(x => x.zufahrt.startsWith('a') === ab).map(x => String(x.soll).replace('.', ',')))].join('; ')
      const sG = sollVon(false), sA = sollVon(true)
      const offenEintraege = neu.filter(x => x.zustand === 'offen' && regeln.includes(x.id as 'H1' | 'E3'))
      const nurAnzeichen = offenR && !teil && !zahl && offenEintraege.every(x => (x.fehlend ?? []).every(f => f === 'anzeichenSchneller'))
      const vSv = gebildet.eingaben.vSig.wert
      const mz: MassZeile = { groesse: 'Sichtweite (Sichtrechner)', einheit: 'm',
        soll: sG && sA ? `${sG} geradeaus, ${sA} für Abbiegende` : sG || `${sA} für Abbiegende`,
        ist: (zahl ? `verdeckt (${zahl} von ${n} Zufahrten)` : teil ? `frei, ${teil} von ${n} Zufahrten nur bis ` +
          `${sicht.find(x => x.bisM !== undefined)!.bisM} m geprüft` : `frei (${zf(n)})`) + (erreicht0 ? '' : '; Sichtregel hier nicht geprüft'),
        zustand: !erreicht0 ? 'offen' : verletztR ? 'verletzt' : nurAnzeichen ? 'vorbehalt' : offenR || teil ? 'offen' : 'erfuellt', regeln,
        ...(nurAnzeichen && erreicht0 && !verletztR ? { zusatz: `gilt, wenn nicht schneller als ${vSv !== null ? `${vSv} km/h` : 'signalisiert'} gefahren ` +
          'wird (Frage oben)' } : {}) }
      befund.masse.push(mz)
    }
    neuOrdnen(befund)
    // Prüfübersicht: H1/E3 erfüllt, wo der Sichtrechner Zufahrten geprüft hat und kein Eintrag bleibt; E3a gilt nur mit Sicht von
    // Hand; Regeln mit Eintrag (z. B. D5-4 nach verdeckter Sicht) sind nicht erfüllt
    // (Korrektur A3: nur wenn der Baum H1 bzw. E3 erreicht hat; D5-4 erfüllt, wenn eine erreichte Sichtregel erfüllt ist)
    const mitEintrag = new Set(befund.alle.map(x => x.id))
    const sichtErfuellt = erreicht.filter(r => sicht.some(x => x.regel === r) && !mitEintrag.has(r))
    befund.erfuellt = [...new Set([...befund.erfuellt.filter(id => !['H1', 'E3', 'E3a', 'D5-4'].includes(id)), ...sichtErfuellt,
      ...(d54 && sichtErfuellt.length ? ['D5-4'] : [])])].filter(id => !mitEintrag.has(id))
  }

  // offen nach Feld und Block; Blöcke ganz ohne Eingabe: nicht geprüft
  const mitEingabe = new Set<GruppeId>()
  for (const d of FELD_DEFS) if (gebildet.herkunft.get(d.pfad)?.zustand !== 'offen') mitEingabe.add(d.gruppe)
  const offen: OffenZeile[] = [], ohne = new Map<GruppeId, Set<string>>()
  const mitZaehlung = befund.offenGruppen.some(o => o.feld === 'fg5h')
  for (const o of befund.offenGruppen) {
    // Zählung und Schätzung der Querenden: eine Frage (Runde 5, Stelle 27)
    if (o.feld === 'fgKlasse' && mitZaehlung) {
      const z = offen.find(x => x.feld === 'fg5h')
      if (z) for (const r of o.regeln) if (!z.regeln.includes(r)) z.regeln.push(r)
      continue
    }
    const gr = gruppeVon(o.feld)
    if (gr && !mitEingabe.has(gr)) { for (const r of o.regeln) ohne.set(gr, (ohne.get(gr) ?? new Set()).add(r)); continue }
    const best = befund.alle.some(x => x.bestaetigen && x.fehlend?.includes(o.feld))
    offen.push({ feld: o.feld, name: o.feld === 'Zufahrten' ? 'geprüfte Zufahrten' : feldName(o.feld), gruppe: gr, regeln: o.regeln,
      ...(best ? { bestaetigen: true } : {}) })
  }
  const nichtGeprueft = [
    ...befund.nichtGeprueft.map(x => ({ block: x.block === 'Q3' ? 'Trottoirüberfahrt' : 'LSA-Zeiten', grund: x.grund })),
    ...GRUPPEN.filter(gr => ohne.has(gr.id) && !(gr.id === 'q3' && befund.nichtGeprueft.some(x => x.block === 'Q3')) &&
      !(gr.id === 'lsa' && befund.nichtGeprueft.some(x => x.block === 'I')))
      .map(gr => ({ block: gr.name, grund: `keine Eingaben (${ohne.get(gr.id)!.size} Regeln offen)` })),
  ]

  // Annahmen mit Wert und kurzer Herkunft (Runde 5, Stellen 18, 44, 45): Objekt-Felder je Unterfeld mit eigenem Namen
  const annahmen = [...new Set(befund.annahmen.flatMap(a => annahmeZeilen(a, gebildet)))]

  // Grundprüfung bfu: Sicht des Sichtrechners je Zufahrt der Fussgängerstreifen (nicht ohne Vortritt, nicht mit Lichtsignal); ein
  // Fussgängerstreifen ohne geprüfte Zufahrt lässt die Sicht offen; Teilstreifen teils mit, teils ohne Vortritt: gilt nicht
  const arten = new Set(g.streifen.map(streifenTyp).filter(t => t !== 'kein'))
  const grund = grundpruefung(gebildet.eingaben, {
    sicht: sicht.filter(x => x.regel === 'H1').map(x => ({
      name: g.streifen.length > 1 ? `${titel(x.fgsId)}, ${x.name}` : x.name, tempo: x.tempo, soll: x.soll, quelle: x.quelle, frei: x.frei,
      status: x.status, abbiegend: x.zufahrt.startsWith('a'), ...(x.bisM !== undefined ? { bisM: x.bisM } : {}),
      ...(x.freiBisM !== undefined ? { freiBisM: x.freiBisM } : {}) })),
    ohneZufahrt: g.streifen.filter(s => streifenTyp(s) === 'fgs' && s.lsa !== 'ja' && !s.zufahrten.length).map(s => titel(s.fgsId)),
    // Nachtrag nach Prüfung: auch Fussgängerstreifen und Trottoirüberfahrt in einer Querung
    gemischt: arten.has('fgs') && [...arten].some(t => OHNE_VORTRITT.includes(t)) ? true
      : arten.has('fgs') && arten.has('trottoirueberfahrt') ? 'trottoirueberfahrt' : false,
  })

  // Annahmen der Grundprüfung mit Wert und Herkunft (Runde 5, Stelle 18)
  grund.annahmen = [...new Set(grund.annahmen.flatMap(a => annahmeZeilen(a, gebildet)))]
  // Runde 5 (F2): rechnet der Sichtrechner an einer geraden Zufahrt mit einem anderen Tempo als dem signalisierten, steht das in der Zeile ①
  const vS = gebildet.eingaben.vSig.wert, vSH = gebildet.herkunft.get('vSig')
  const anders = g.streifen.flatMap(s => s.zufahrten.filter(z => z.art !== 'abbiegend' && vS !== null && z.tempo > vS))
  if (grund.gilt && anders.length && vS !== null) {
    const z = anders[0]
    const q = z.tempoQuelle === 'Ersatz' ? 'Annahme' : z.tempoQuelle === 'Korrektur' ? 'von Hand' : z.tempoQuelle === 'Geoportal' ? 'Geoportal' : 'OSM'
    grund.tempoHinweis = `Soll gerechnet mit ${z.tempo} km/h (${q}); signalisiert ${vS} km/h${vSH?.quelle ? ` (${QUELLE_TEXT[vSH.quelle]})` : ''}: ` +
      'Tempo der Zufahrten prüfen'
  }

  return {
    grund, gestrichen: g.streifen.reduce((n, s) => n + s.entfallen.filter(x => x.grund === 'hand').length, 0),
    gruppe: g.id, streifen: g.streifen.map(s => s.fgsId), titel: blattTitel(g, opt.titel ?? ((id: string) => id)),
    befund, gebildet, vorbelegt, ebenen, sicht, sichtVonHand, typText: typText(befund),
    zulText: befund.zulaessigkeit ? ZUL[befund.zulaessigkeit] : '', begruendung: begruendung(befund, gebildet.eingaben.typ.wert), offen, nichtGeprueft, annahmen,
    hinweise: [...new Set(hinweise.map(lesetext))], ...(alternative ? { alternative } : {}),
  }
}

/** Herkunft kurz (Muster 6): erste Aussage, ohne Belege und ohne das Schlusswort «… angenommen» */
export function herkunftKurz(text: string): string {
  let t = lesetext(text).split('; ')[0]
  t = t.replace(/:\s*[^:]*angenommen$/, '').replace(/^Sichtrechner: /, '')
  if (t.split(/\s+/).length > 15 && t.includes(': ')) t = t.slice(0, t.indexOf(': '))
  return t
}
/**
 * Annahme der Liste «Annahmen» als Zeilen «Feld: Wert – Herkunft» (Runde 5). Eintrag «feld: Annahme» des Befunds bzw. der Grundprüfung;
 * Objekt-Felder (z. B. q3, kurve): die Unterfelder mit Annahme bzw. Schätzung. Andere Texte unverändert.
 */
export function annahmeZeilen(a: string, gebildet: Gebildet): string[] {
  const m = /^([\w.]+): (Annahme|Schätzung)$/.exec(a)
  if (!m) return [a]
  if (m[1] === 'fgQuelle') return []
  const pfade = gebildet.herkunft.has(m[1]) ? [m[1]] : [...gebildet.herkunft.keys()].filter(p => p.startsWith(`${m[1]}.`))
  const zeilen = pfade.flatMap(p => {
    const h = gebildet.herkunft.get(p)!
    if (h.zustand !== 'vorbelegt' && h.zustand !== 'hand') return []
    if (pfade.length > 1 && !(h.quelle && QUELLEN_ANNAHME.includes(h.quelle))) return []
    const d = FELD_DEF.get(p)
    const wert = h.zustand === 'hand' ? h.wert : h.vorbelegt?.wert
    return [`${feldName(p)}: ${d ? wertText(d, wert) : m[2]}${h.zustand === 'vorbelegt' ? ` – ${herkunftKurz(h.text)}` : ` (${m[2]} von Hand)`}`]
  })
  return zeilen.length ? zeilen : [`${feldName(m[1])}: ${m[2]}`]
}

const KONFLIKT_TEXT: Record<string, string> = { auto: 'Auto-Parkfeld', velo: 'Zweirad-Parkfeld', motorrad: 'Zweirad-Parkfeld', gebaeude: 'Gebäude',
  baum: 'Baum', hindernis: 'Hindernis' }
const m1 = (x: number) => `${String(Math.round(x * 10) / 10).replace('.', ',')} m`
/**
 * Anzeige des Sichtrechners im Feld «Sichtweite je Zufahrt» (Zustand «rechner», Automatik Paket A): je Zufahrt frei bis bzw. verdeckt
 * mit dem nächsten Konflikt und dem Soll, z. B. «Nord: frei bis 55 m, Soll 55 m (VSS Tab. 1) · Süd: verdeckt, Auto-Parkfeld 8 m vor
 * dem Streifen, frei bis 6 m, Soll 55 m». Leer ohne geprüfte Zufahrt.
 */
export function sichtAnzeige(g: QuerungGruppe, titel: (fgsId: string) => string, zName: (fgsId: string, z: string) => string): string {
  const teile: string[] = []
  for (const s of g.streifen) {
    if (streifenTyp(s) === 'kein' || streifenTyp(s) === 'trottoirueberfahrt') continue
    for (const z of s.zufahrten) {
      const name = `${g.streifen.length > 1 ? `${titel(s.fgsId)}, ` : ''}${zName(s.fgsId, z.zufahrt)}`
      // Herleitung in Worten statt Rohfundstelle (Nachprüfung 23.10.2026)
      const soll = `Soll ${m1(z.sichtweite)} (${sichtQuelleKurz(z.sichtweiteQuelle)})`
      if (z.status === 'frei') {
        const bis = z.geprueftBisM ?? z.freiBisM
        teile.push(`${name}: ${bis !== undefined ? `frei bis ${m1(bis)}` : 'frei'}, ${soll}`)
        continue
      }
      const k = [...z.konflikte].sort((a, b) => a.abstand - b.abstand)[0]
      teile.push(`${name}: verdeckt${k ? `, ${konfliktName(k)} ${m1(k.abstand)} vor dem Streifen` : ''}` +
        `${z.freiBisM !== undefined ? `, frei bis ${m1(z.freiBisM)}` : ''}, ${soll}`)
    }
  }
  return teile.length ? `Sichtrechner: ${teile.join(' · ')}` : ''
}

/** Befundblätter aller Querungen einer Rechnung */
export function befundblaetter(r: { streifen: StreifenErgebnis[]; inseln?: { ring: P[] }[]; streifenQuelle?: GeoVorbelegung['streifenQuelle'] },
  fall: Fall, opt: BlattOptionen): BefundBlatt[] {
  const geo = r.streifenQuelle && !opt.geo?.streifenQuelle ? { ...opt.geo, streifenQuelle: r.streifenQuelle } : opt.geo
  return querungen(r.streifen).map(g => befundblatt(g, fall, { ...opt, geo, inseln: opt.inseln ?? r.inseln ?? [] }))
}

export { gruppenName }
