// ── Bedarfsmodul Runde 3: Zusammenfassung in drei Sätzen je Querung (reine Ableitung aus Befund, Grundprüfung und Fragen) ──
//
// Nach festen Vorlagen, ohne neue Wertung (Befunde, Stärken, Empfehlung bleiben unverändert):
//   Satz 1 – Antwort: Ist ein Fussgängerstreifen zulässig, und welcher Querungstyp wird empfohlen? Nicht zulässig bzw. nur mit
//            Begründung: mit dem Grund aus der auslösenden Regel (Kurzsatz); Muss-Befund zur Lage (Haltestelle, Lichtsignal,
//            Fussweg): «grundsätzlich zulässig, aber …»; vorläufig: mit dem, was offen ist. Beurteilte Furt, Querung ohne Vortritt
//            bzw. Mehrzweckstreifen: «wäre … zulässig; beurteilt wird …». Ausserorts, Begegnungszone, verteiltes Queren und
//            Trottoirüberfahrt mit eigener Vorlage.
//   Satz 2 – das Wichtigste: Stand der Grundprüfung bfu (Punkte ① bis ⑤; nicht, wenn der Baum vorher endet; «entfällt» über 60 km/h),
//            dann die Befunde: «Zu beheben: Muss; zu verbessern: Soll», zusammen höchstens zwei genannt, der Rest als Zahl. Befunde
//            aus dem Baum, dazu Punkte der Grundprüfung ohne gleichwertige verletzte Regel im Baum (GLEICH). Ohne Befund: Zahl der
//            Prüfungen ohne Befund (Prüfübersicht), nie «erfüllt» ohne Grundlage.
//   Satz 3 – was fehlt: offene Angaben als Fragen (feldhilfen.FRAGEN), zuerst was die Zulässigkeit bzw. Empfehlung offen lässt
//            (vorbehaltFelder), dann Muss-Regeln der Grundprüfung und des Baums, dann der Rest; höchstens zwei ausgeschrieben.
// Länge: höchstens vier Sätze und 60 Wörter; zu lang → weniger Nennungen (STUFEN).

import { KATALOG } from './katalog'
import type { Grundpruefung, GrundTeil } from './grundpruefung'
import type { Befund, Ebene, Eintrag, Empfehlung, RegelDef, Staerke } from './typen'
import type { BefundBlatt } from './befundblatt'
import type { Querungstyp } from './eingaben'
import { fragenFelder, grundKopf, vorbehaltFelder, type ZeilenZustand } from './kompakt'
import { istWeiche, mitEinheit, pruefUebersicht, themaVon, type UebersichtKontext } from './themen'
import { frageVon } from './feldhilfen'

const DEF = KATALOG as Readonly<Record<string, RegelDef>>

/** Ort der Anzeige: Verweise «(siehe unten)» im Panel, «(siehe Befundblatt)» bzw. «(siehe Offene Angaben)» im Bericht */
export type ZfOrt = 'panel' | 'bericht'

export interface ZfEingabe {
  befund: Befund
  grund: Grundpruefung
  /** offene Angaben des Befundblatts (Blöcke ganz ohne Eingabe ausgenommen); fehlt: alle offenen Felder des Befunds */
  offen?: readonly { feld: string }[]
  /** Ebenen und Querungstyp der beurteilten Anlage (Prüfübersicht, Satz 1) */
  kontext?: UebersichtKontext
  ort?: ZfOrt
}

export interface Zusammenfassung {
  /** Satz 1: Zulässigkeit und empfohlener Querungstyp */
  antwort: string
  /** Satz 2: Grundprüfung und wichtigste Befunde (ein bis zwei Sätze; leer, wenn nichts zu sagen ist) */
  wichtig: string
  /** Satz 3: fehlende Angaben; null, wenn keine fehlt */
  fehlt: { einleitung: string; felder: string[]; weitere: number } | null
  /** Regeln, die Satz 1 als Grund nennt */
  grundIds: string[]
  /** in Satz 2 genannte Befunde (Regelnummern) und Zahl der übrigen */
  genannt: string[]
  weitereBefunde: number
  /** alle Befunde für Satz 2 in Reihenfolge (Regelnummern) */
  befunde: string[]
}

// ── Kurzform einer Regel ──

/** Schwelle für den Text: ganz ohne, sonst zwei Nachkommastellen mit Komma */
const zahlText = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','))
/** Klammerzusatz am Ende weg, auch verschachtelt («verdeckt (Parkfeld (auto))» → «verdeckt»; «2,00 m (mindestens 1,50 m)» → «2,00 m») */
function ohneKlammer(t: string): string {
  const s = t.trim()
  if (!s.endsWith(')')) return s
  let tiefe = 0
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ')') tiefe++
    else if (s[i] === '(' && --tiefe === 0) return i > 0 ? s.slice(0, i).trim() : s
  }
  return s
}
/** Soll lesbar: «≥ 3,00 m» → «mindestens 3,00 m» */
const sollLesbar = (t: string): string => t.replace(/^≥\s*/, 'mindestens ').replace(/^≤\s*/, 'höchstens ')

/** Ist lesbar: Schätzklasse, gefahrenes Tempo, Querende ohne doppeltes Wort */
const lesbar = (t: string): string => t.replace(/^Schätzklasse (unter 100|100 bis 500|über 500)$/, 'geschätzt $1 Querende')
  .replace(/^(Schätz)?[Kk]lasse (<|unter )100$/, 'geschätzt unter 100')
  .replace(/^(Schätz)?[Kk]lasse (100-500|100 bis 500)$/, 'geschätzt 100 bis 500').replace(/^(Schätz)?[Kk]lasse (>500|über 500)$/, 'geschätzt über 500')
  .replace(/^V85 /, 'gefahren ')
/** Abkürzungen ausgeschrieben (Pers., Fz/Tag, DTV) */
const ausgeschrieben = (t: string): string => t.replace(/DTV (\d+)( Fz\/Tag)?/g, '$1 Fahrzeuge pro Tag').replace(/Fz\/Tag/g, 'Fahrzeuge pro Tag')
  .replace(/Pers\./g, 'Personen').replace(/(\d),0 °/g, '$1°').replace(/(\d) °/g, '$1°')

/** Sichtregeln: Werte je Zufahrt, auf ganze Meter */
const SICHT = ['H1', 'E3', 'B5-1']
/**
 * Mehrere Werte «70,0 / 70,0 m» lesbar: gleiche «je Zufahrt 70 m», sonst «je Zufahrt 70 m und 50 m» (Sichtregeln je Zufahrt, auf ganze
 * Meter; sonst je Seite). Ohne Klammer «70 m und 50 m (je Zufahrt)», damit die Kurzform keine Klammer in der Klammer hat
 */
function listeLesbar(t: string, id: string, aufrunden = false, grenzeRoh?: number): string {
  const sicht = SICHT.includes(id)
  // liegt schon ein Wert deutlich unter der Grenze, erklärt er den Befund: die übrigen bleiben, wie sie sind
  const zahlen = [...t.matchAll(/\d+(?:,\d+)?/g)].map(m => Number(m[0].replace(',', '.')))
  const grenze = grenzeRoh !== undefined && !zahlen.some(v => v < grenzeRoh - 1e-9) ? grenzeRoh : undefined
  const zahl = (s: string): string => {
    if (!sicht) return s
    const v = Number(s.replace(',', '.'))
    // Korrektur Schlussrunde: das Ist kommt schon gerundet (eine Nachkommastelle bzw. ganze Meter); liegt es auf bzw. höchstens 0,05 m
    // über der Mindestsicht eines verletzten Befunds, war der Rohwert darunter (54,96 → «55,0»): «knapp unter 55 m»
    if (grenze !== undefined && Number.isFinite(v) && v >= grenze - 1e-9 && v <= grenze + 0.05 + 1e-9) return `knapp unter ${zahlText(grenze)}`
    // Ist abgerundet, Soll aufgerundet: das Runden macht aus «54,6 statt mindestens 55» nie «55 statt mindestens 55»
    return Number.isFinite(v) ? String(aufrunden ? Math.ceil(v - 1e-9) : Math.floor(v + 1e-9)) : s
  }
  const m = /^(.*?)(\d+(?:,\d+)?(?: \/ \d+(?:,\d+)?)+)(.*)$/.exec(t)
  if (!m) return sicht ? t.replace(/(\d+(?:,\d+)?)(?= m\b)/g, s => zahl(s)) : t
  const [, vor, liste, nach] = m
  const werte = liste.split(' / ').map(zahl)
  const je = `je ${sicht ? 'Zufahrt' : 'Seite'}`
  if (werte.every(w => w === werte[0])) return `${vor}${je} ${werte[0]}${nach}`
  return `${vor}${je} ${aufzaehlen(werte.map((w, i) => (i === werte.length - 1 ? w : `${w}${nach}`)))}${nach}`
}

interface Wert { id: string; ist?: string; soll?: string; einheit?: string }

/** Kurzform einer Regel mit Ist und Soll: Kurzsatz des Katalogs bzw. Kurztitel mit Ist/Soll in Klammern; muss: «nötig» statt «Soll» */
export function kurzform(x: Wert, muss = DEF[x.id]?.staerke === 'hart' || DEF[x.id]?.staerke === 'hart_bericht'): string {
  const d = DEF[x.id]
  const gueltig = (t?: string): t is string => t !== undefined && t !== '–' && t.trim() !== ''
  // Mindestsicht (untere Grenze des Solls) für «knapp unter …»; kurzform gilt nur verletzten Einträgen
  const grenzeM = gueltig(x.soll) && /^≥/.test(x.soll.trim()) ? Number((/\d+(?:,\d+)?/.exec(x.soll)?.[0] ?? '').replace(',', '.')) : NaN
  const ist = gueltig(x.ist) ? listeLesbar(mitEinheit(lesbar(ohneKlammer(x.ist)), x.einheit), x.id, false, Number.isFinite(grenzeM) ? grenzeM : undefined) : undefined
  const soll = gueltig(x.soll) ? listeLesbar(sollLesbar(mitEinheit(ohneKlammer(x.soll), x.einheit)), x.id, true) : undefined
  const tpl = d?.kurzsatz
  let aus: string | null = null
  if (tpl) {
    let fehlt = false
    const t = tpl.replace(/\{(ist|soll|w:(\w+))\}/g, (_, art: string, w?: string) => {
      const v = art === 'ist' ? ist : art === 'soll' ? soll : d.werte?.[w!] !== undefined ? zahlText(d.werte[w!]) : undefined
      if (v === undefined || v === '') fehlt = true
      return v ?? ''
    })
    if (!fehlt) aus = t
    else {
      // Wert fehlt: der Teil vor der Klammer, wenn er ohne Platzhalter auskommt
      const kopf = tpl.split(' (')[0]
      if (!kopf.includes('{')) aus = kopf
    }
  }
  if (aus === null) {
    const titel = d?.titel ?? x.id
    const klammer = ist && soll ? `${ist} statt ${soll}` : ist ? ist : soll ? `${muss ? 'nötig' : 'Soll'} ${soll}` : ''
    // ohne Wert: «(nicht erfüllt)», damit der Titel nicht wie ein Thema klingt (Klammer statt Doppelpunkt, weil Satz 1 schon einen
    // setzt); Titel mit Klammer am Ende: eine Klammer «(Bern: 20 km/h)»
    const k = klammer || 'nicht erfüllt'
    aus = titel.endsWith(')') ? `${titel.slice(0, -1)}: ${k})` : `${titel} (${k})`
  }
  return ausgeschrieben(aus)
}

/** Ebene Bern bzw. Kanton BE kenntlich machen: «… (Bern)» bzw. in der letzten Klammer «(Kanton BE: …)» */
function mitEbene(t: string, ebene: Ebene): string {
  const w = ebene === 'Bern' ? 'Bern' : ebene === 'Kanton BE' ? 'Kanton BE' : ''
  if (!w || t.includes(w === 'Bern' ? 'Bern' : 'Kanton')) return t
  if (!t.endsWith(')')) return `${t} (${w})`
  const rest = ohneKlammer(t)
  return `${rest} (${w}: ${t.slice(rest.length).trim().slice(1)}`
}

// ── Satz 1 ──

const DATIV: Record<string, string> = { 'vorgezogener Seitenraum': 'vorgezogenem Seitenraum' }
/** Elemente nach dem Fussgängerstreifen: «mit Lichtsignalanlage und Schutzinsel» */
const mitElementen = (e: Empfehlung): string => {
  const r = e.elemente.slice(1).map(x => DATIV[x] ?? x)
  return r.length ? `mit ${aufzaehlen(r)}` : ''
}
/** empfohlener Typ als Satzteil mit Artikel */
function typPhrase(e: Empfehlung): string {
  switch (e.typ) {
    case 'Q1': case 'Q2': { const m = mitElementen(e); return `ein Fussgängerstreifen${m ? ` ${m}` : ''}` }
    case 'Q3': return 'eine Trottoirüberfahrt'
    case 'furt': return 'eine Fussgängerfurt (Insel ohne Balken)'
    case 'ohne_vortritt': return `eine Querung ohne Vortritt (${e.elemente.join('; ')})`
    default: return ''
  }
}
/** Aufzählung «A», «A und B», «A, B und C» */
function aufzaehlen(xs: readonly string[]): string {
  return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`
}

const MUSS: readonly Staerke[] = ['hart', 'hart_bericht']

/** beurteilte Anlage, die kein Fussgängerstreifen ist (Satz 1 nennt sie) */
const ANLAGE: Partial<Record<Querungstyp, string>> = { furt: 'die Fussgängerfurt', ohne_vortritt: 'die Querung ohne Vortritt', mehrzweck: 'der Mehrzweckstreifen' }
/** Muss-Befunde zur Lage: «grundsätzlich zulässig, aber …» */
const LAGE_ABER: Readonly<Record<string, string>> = {
  D4a: 'nicht im Haltestellenbereich', D4b: 'nur mit Insel oder mehr Abstand zur Haltestelle', G2: 'nicht so nah am Lichtsignal',
  G3b: 'nicht in der Achse eines verdeckten Fusswegs',
}
/** was die Empfehlung vorläufig macht (offenWegen) */
function vorlaeufigWegen(e: Empfehlung): string {
  if (e.offenWegen.includes('inselMoeglich')) return 'vorläufig: ob die Schutzinsel Platz hat, ist noch offen'
  // Schutzinsel schon empfohlen: offen ist nicht, ob sie nötig ist
  if (e.offenWegen.some(x => ['D1', 'D2', 'D3a'].includes(x)) && !e.elemente.includes('Schutzinsel'))
    return 'vorläufig: ob eine Schutzinsel nötig ist, hängt noch von fehlenden Angaben ab'
  if (e.offenWegen.some(x => ['D4a', 'D4b'].includes(x))) return 'vorläufig: ob die Lage bei der Haltestelle passt, ist noch offen'
  return 'die Empfehlung ist vorläufig'
}

function antwort(b: Befund, grundIds: string[], typ: Querungstyp | null | undefined): string {
  const e = b.empfehlung, vorl = e.vorlaeufig
  if (b.ende === 'offen') return 'Noch nicht beurteilt: Es fehlt die Angabe, ob die Querung innerorts liegt.'
  if (b.ende === 'ausserorts') return 'Die Querung liegt ausserorts; fgsCheck beurteilt nur Querungen innerorts.'
  if (b.ende === 'begegnungszone') {
    grundIds.push('A2')
    return 'In der Begegnungszone ist kein Fussgängerstreifen zulässig; dort queren Fussgänger überall mit Vortritt.'
  }
  if (b.ende === 'flaechig') {
    grundIds.push('B1')
    return 'Hier wird verteilt über die Strecke gequert: statt eines Fussgängerstreifens eher Begegnungszone, Mehrzweckstreifen oder ' +
      'mehrere Querungen ohne Vortritt.'
  }
  const verletzt = (ids: readonly string[]) => {
    const xs = b.alle.filter(x => x.zustand === 'verletzt' && ids.includes(x.id)).filter((x, i, a) => a.findIndex(y => y.id === x.id) === i)
    grundIds.push(...xs.map(x => x.id))
    return xs
  }
  // beurteilte Trottoirüberfahrt (Q3-4 läuft nur dann): Antwort aus den zwingenden Punkten der Trottoirüberfahrt; die Alternative nach
  // der (still geprüften) Zulässigkeit des Fussgängerstreifens
  if (b.ausgewertet.includes('Q3-4')) {
    const hart = verletzt(b.alle.filter(x => x.id.startsWith('Q3') && x.zustand === 'verletzt' && MUSS.includes(x.staerke)).map(x => x.id))
    if (hart.length) {
      const alt = b.zulaessigkeit === 'offen' ? '; ob stattdessen ein Fussgängerstreifen zulässig ist, ist noch offen'
        : b.zulaessigkeit === 'mit_begruendung' ? '; stattdessen ein Fussgängerstreifen, aber nur mit Begründung'
          : typPhrase(e) && e.typ !== 'Q3' ? `; stattdessen passt ${typPhrase(e)}` : ''
      return `Eine Trottoirüberfahrt ist hier nicht zulässig: ${kurzform(hart[0])}${hart.length > 1 ? ` (und ${hart.length - 1} ${hart.length === 2 ? 'weiterer Grund' : 'weitere Gründe'})` : ''}` +
        `${alt}${vorl ? ' (vorläufig: es fehlen Angaben)' : ''}.`
    }
    if (e.typ === 'Q3') return `${vorl ? 'Vorläufig: ' : ''}Eine Trottoirüberfahrt ist hier zulässig.`
    return 'Vorläufig: Ob eine Trottoirüberfahrt hier zulässig ist, hängt von fehlenden Angaben ab.'
  }
  const anlage = typ ? ANLAGE[typ] : undefined
  const ist = anlage ? 'wäre' : 'ist'
  const beurteilt = anlage ? `; beurteilt wird ${anlage}` : ''
  switch (b.zulaessigkeit) {
    case 'nicht_angezeigt': {
      const g = verletzt(['C1', 'C2']).map(x => kurzform(x))
      const st = e.typ === 'furt' ? ', weil es eine Durchgangsstrasse ist' : e.grundlage.includes('E2') ? ', weil es eine Quartierstrasse ist' : ''
      return `Ein Fussgängerstreifen ist hier nicht zulässig${g.length ? `: ${aufzaehlen(g)}` : ''}; ${vorl ? 'vorläufig ' : ''}empfohlen wird ${typPhrase(e)}${st}${beurteilt}.`
    }
    case 'offen':
      return `Vorläufig: Ob ein Fussgängerstreifen hier zulässig ${anlage ? 'wäre' : 'ist'}, hängt von fehlenden Angaben ab${beurteilt}.`
    default: {
      // Muss-Befund zur Lage: grundsätzlich zulässig, aber nicht an dieser Stelle
      const lage = anlage ? [] : b.alle.filter(x => x.zustand === 'verletzt' && MUSS.includes(x.staerke) && themaVon(x.id) === 'lage' && LAGE_ABER[x.id])
      if (lage.length) grundIds.push(lage[0].id)
      const zul = lage.length ? `grundsätzlich zulässig, aber ${LAGE_ABER[lage[0].id]}` : 'zulässig'
      const m = mitElementen(e)
      const mit = m ? `${lage.length ? ';' : ','} empfohlen ${m}` : ''
      const vorlText = vorl ? `; ${vorlaeufigWegen(e)}` : ''
      if (b.zulaessigkeit === 'mit_begruendung') {
        const g = verletzt(['C2b', 'C3', 'C3b', 'C4']).map(x => kurzform(x))
        const sonst = e.zusatz.some(z => z.startsWith('Querung ohne Vortritt prüfen')) ? '; sonst eine Querung ohne Vortritt' : ''
        return `Ein Fussgängerstreifen ${ist} hier nur mit Begründung zulässig${g.length ? `: ${aufzaehlen(g)}` : ''}` +
          `${lage.length ? `; aber ${LAGE_ABER[lage[0].id]}` : ''}${m ? `; empfohlen ${m}` : ''}${sonst}${vorlText}${beurteilt}.`
      }
      return `Ein Fussgängerstreifen ${ist} hier ${zul}${mit}${vorlText}${beurteilt}.`
    }
  }
}

// ── Satz 2 ──

/** Punkte der Grundprüfung und die Regeln des Baums, die dasselbe prüfen (dann nennt Satz 2 nur die Regel des Baums) */
const GLEICH: Readonly<Record<string, readonly string[]>> = {
  'B5-T': ['C1'], 'B5-1': ['H1', 'E3'], 'B5-1b': ['H3a', 'H3b'], 'B5-2a': ['D1', 'D2', 'D2a', 'D2c', 'D3a'], 'B5-2b': ['F2', 'F2b'],
  'B5-2c': ['F3'], 'B5-3': ['D1'], 'B5-4': ['G8a'], 'B5-5': ['C3', 'C3b'], 'B5-W3': ['D4b'],
}
const WORT: Readonly<Record<Exclude<ZeilenZustand, 'erfuellt'>, string>> = {
  verletzt: 'nicht erfüllt', soll: 'nicht erfüllt (Soll)', offen: 'offen', hinweis: 'mit Hinweis',
}

/**
 * Stand der Grundprüfung in einem Satz: «Grundprüfung bfu: 3 von 5 Punkten erfüllt, Beleuchtung offen.» Punkte, deren Befund Satz 2
 * nennt (genannt), stehen nicht doppelt; kurz: ohne Namen. Endet der Baum vorher, entfällt der Satz; Tempo über 60: «entfällt».
 */
function grundSatz(g: Grundpruefung, b: Befund, kurz: boolean, genannt: readonly string[]): string {
  if (!g.gilt || b.ende !== null) return ''
  const zeilen = grundKopf(g).zeilen
  if (g.punkte.some((p, i) => p.nr === 'T' && zeilen[i].zustand === 'verletzt')) return 'Grundprüfung bfu entfällt (über 60 km/h).'
  const punkte = g.punkte.map((p, i) => ({ p, z: zeilen[i].zustand })).filter(x => x.p.nr !== 'T')
  const n = punkte.filter(x => x.z === 'erfuellt').length
  if (n === punkte.length) return `Grundprüfung bfu: alle ${n} Punkte erfüllt.`
  const imSatz2 = (x: (typeof punkte)[number]) => (x.z === 'verletzt' || x.z === 'soll') &&
    x.p.teile.some(t => genannt.includes(t.id) || (GLEICH[t.id] ?? []).some(id => genannt.includes(id)))
  const teile: string[] = []
  if (!kurz) for (const z of ['verletzt', 'soll', 'offen', 'hinweis'] as const) {
    const ps = punkte.filter(x => x.z === z && !imSatz2(x))
    if (ps.length) teile.push(`${ps.length > 2 ? String(ps.length) : aufzaehlen(ps.map(x => x.p.titel))} ${WORT[z]}`)
  }
  return `Grundprüfung bfu: ${n} von ${punkte.length} Punkten erfüllt${teile.length ? `, ${teile.join(', ')}` : ''}.`
}

interface Nennung { id: string; text: string; muss: boolean }

/** Befunde für Satz 2: Muss vor Soll, je zuerst der Baum, dann die Grundprüfung (ohne gleichwertige verletzte Regel im Baum) */
function befundListe(b: Befund, g: Grundpruefung, grundIds: readonly string[]): Nennung[] {
  const baum: Eintrag[] = []
  for (const x of b.alle) if (x.zustand === 'verletzt' && x.staerke !== 'hinweis' && !istWeiche(x.id) && !grundIds.includes(x.id) &&
    !baum.some(y => y.id === x.id)) baum.push(x)
  // gleichwertig nur, wenn die Regel im Baum selbst einen Befund meldet (Muss bzw. Soll) oder Satz 1 sie als Grund nennt; ein
  // verletzter Hinweis (z. B. D2a, D2c, C3b, F3 knapp) ersetzt keinen Soll-Punkt der Grundprüfung
  const imBaum = new Set(b.alle.filter(x => x.zustand === 'verletzt' && (x.staerke !== 'hinweis' || grundIds.includes(x.id))).map(x => x.id))
  const teile: GrundTeil[] = g.gilt && b.ende === null ? [...g.punkte.flatMap(p => p.teile), ...g.weitere] : []
  const bfu = teile.filter(t => t.zustand === 'verletzt' && t.staerke !== 'hinweis' && !(GLEICH[t.id] ?? []).some(id => imBaum.has(id)))
  const n = (x: Eintrag): Nennung => ({ id: x.id, text: mitEbene(kurzform(x, MUSS.includes(x.staerke)), x.ebene), muss: MUSS.includes(x.staerke) })
  const nt = (t: GrundTeil): Nennung => ({ id: t.id, text: kurzform(t, MUSS.includes(t.staerke ?? 'hinweis')), muss: MUSS.includes(t.staerke ?? 'hinweis') })
  return [...baum.map(n).filter(x => x.muss), ...bfu.map(nt).filter(x => x.muss), ...baum.map(n).filter(x => !x.muss), ...bfu.map(nt).filter(x => !x.muss)]
}

/** «Zu beheben: A und B; zu verbessern: C.» (zusammen höchstens max genannt); ohne Befund: Zahl der Prüfungen */
function befundSatz(liste: readonly Nennung[], max: number, x: ZfEingabe, grundIds: readonly string[], mitGrund: boolean): { text: string; genannt: string[] } {
  const b = x.befund
  if (liste.length) {
    const m = liste.filter(n => n.muss), s = liste.filter(n => !n.muss)
    const km = Math.min(max, m.length), ks = Math.min(max - km, s.length)
    const teil = (xs: readonly Nennung[], k: number): string => {
      const namen = xs.slice(0, k).map(n => n.text), rest = xs.length - k
      if (rest) namen.push(k ? (rest === 1 ? 'ein weiterer Befund' : `${rest} weitere Befunde`) : (rest === 1 ? '1 Befund' : `${rest} Befunde`))
      return aufzaehlen(namen)
    }
    const saetze = [m.length ? `Zu beheben: ${teil(m, km)}` : '', s.length ? `${m.length ? 'zu' : 'Zu'} verbessern: ${teil(s, ks)}` : ''].filter(Boolean)
    const verweis = km + ks < liste.length && km + ks === 0 ? ` (${x.ort === 'bericht' ? 'siehe Befundblatt' : 'siehe unten'})` : ''
    return { text: `${saetze.join('; ')}${verweis}.`, genannt: [...m.slice(0, km), ...s.slice(0, ks)].map(n => n.id) }
  }
  const u = pruefUebersicht(b, x.kontext ?? {})
  const h = u.hinweise ? `${u.hinweise} ${u.hinweise === 1 ? 'Hinweis' : 'Hinweise'}` : ''
  if (!u.geprueft) return { text: '', genannt: [] }
  if (u.befunde > 0 || grundIds.length) return { text: 'Sonst keine Befunde.', genannt: [] }
  if (u.offen) return { text: `Bisher keine Befunde; ${u.offen} von ${u.geprueft} Prüfungen noch offen.`, genannt: [] }
  if (mitGrund) return { text: `Übrige Prüfungen ohne Befund${h ? ` (${h})` : ''}.`, genannt: [] }
  if (!h) return { text: `Keine Befunde: alle ${u.geprueft} Prüfungen ohne Befund.`, genannt: [] }
  return { text: `Keine Befunde: ${u.ohneBefund} von ${u.geprueft} Prüfungen ohne Befund, ${h}.`, genannt: [] }
}

// ── Satz 3 ──

/** Sicht der Grundprüfung offen ohne fehlendes Feld (Knoten: welche Zufahrt die Abbiegelinie ist): Frage zur Kurve */
const sichtOhneFeld = (t: GrundTeil): string[] =>
  (t.zustand === 'offen' && !t.fehlend?.length && (t.id === 'B5-1' || t.id === 'B5-1b') && t.detail?.includes('Kurvenradius') ? ['kurve.radius'] : [])

/** fehlende Felder in der Reihenfolge der Dringlichkeit */
function fehlendeFelder(x: ZfEingabe): string[] {
  const { befund: b, grund: g } = x
  const aus: string[] = []
  // 1. Zulässigkeit bzw. Empfehlung offen
  if (b.ende === 'offen') aus.push(...(b.offenFelder.A1 ?? ['innerorts']))
  if (b.empfehlung.vorlaeufig || b.zulaessigkeit === 'offen') aus.push(...vorbehaltFelder(b))
  // 2. Muss-Regeln offen: Grundprüfung, dann Baum
  if (g.gilt) for (const t of [...g.punkte.flatMap(p => p.teile), ...g.weitere])
    if (t.zustand === 'offen' && DEF[t.id]?.staerke === 'hart') aus.push(...(t.fehlend ?? []), ...sichtOhneFeld(t))
  for (const e of b.alle) if (e.zustand === 'offen' && MUSS.includes(e.staerke)) aus.push(...(e.fehlend ?? []))
  // 3. übrige Fragen der Grundprüfung, dann die offenen Angaben des Befundblatts
  if (g.gilt) {
    const k = grundKopf(g)
    aus.push(...k.zeilen.flatMap(z => z.fragen), ...(k.weitere?.fragen ?? []), ...g.punkte.flatMap(p => p.teile).flatMap(sichtOhneFeld))
  }
  aus.push(...(x.offen ? x.offen.map(o => o.feld) : b.offenGruppen.map(o => o.feld)))
  // «Zufahrten» ist ein Hinweis, keine Frage
  return fragenFelder(aus).filter(f => f !== 'Zufahrten')
}

function fehltSatz(felder: readonly string[], max: number, ort: ZfOrt): Zusammenfassung['fehlt'] {
  const n = felder.length
  if (!n) return null
  if (!max) return { einleitung: `${n === 1 ? 'Eine Angabe fehlt' : `${n} Angaben fehlen`} noch (${ort === 'bericht' ? 'siehe Offene Angaben' : 'siehe unten'}).`, felder: [], weitere: 0 }
  const k = Math.min(max, n)
  const einleitung = n === 1 ? 'Eine Angabe fehlt noch:' : n === 2 ? 'Zwei Angaben fehlen noch:' : `${n} Angaben fehlen noch, zuerst:`
  return { einleitung, felder: felder.slice(0, k), weitere: n - k }
}

// ── Gesamt ──

/** Zusammenfassung als Text (Bericht, Tests): Fragen ausgeschrieben, «(und N weitere)» */
export function zusammenfassungText(z: Pick<Zusammenfassung, 'antwort' | 'wichtig' | 'fehlt'>): string {
  const f = z.fehlt
  const s3 = f ? [f.einleitung, ...f.felder.map(frageVon)].join(' ') + (f.weitere ? ` (und ${f.weitere} weitere)` : '') : ''
  return [z.antwort, z.wichtig, s3].filter(Boolean).join(' ')
}

/** Wörter eines Texts (Zeichenfolgen mit Buchstabe oder Ziffer) */
export const woerter = (t: string): number => t.split(/\s+/).filter(w => /[\p{L}\d]/u.test(w)).length
export const MAX_WOERTER = 60

/** Stufen der Kürzung: Befunde genannt, Fragen ausgeschrieben, Grundprüfung mit Namen */
const STUFEN: readonly { befunde: number; fragen: number; grundKurz: boolean }[] = [
  { befunde: 2, fragen: 2, grundKurz: false }, { befunde: 2, fragen: 1, grundKurz: false }, { befunde: 1, fragen: 1, grundKurz: false },
  { befunde: 1, fragen: 1, grundKurz: true }, { befunde: 0, fragen: 1, grundKurz: true }, { befunde: 0, fragen: 0, grundKurz: true },
]

/** Zusammenfassung einer Querung */
export function zusammenfassung(x: ZfEingabe): Zusammenfassung {
  const grundIds: string[] = []
  const s1 = antwort(x.befund, grundIds, x.kontext?.typ)
  const liste = befundListe(x.befund, x.grund, grundIds)
  const felder = fehlendeFelder(x)
  let z: Zusammenfassung | null = null
  for (const st of STUFEN) {
    const vorab = grundSatz(x.grund, x.befund, st.grundKurz, [])
    const bs = befundSatz(liste, st.befunde, x, grundIds, vorab.startsWith('Grundprüfung bfu:'))
    const wichtig = [grundSatz(x.grund, x.befund, st.grundKurz, bs.genannt), bs.text].filter(Boolean).join(' ')
    z = { antwort: s1, wichtig, fehlt: fehltSatz(felder, st.fragen, x.ort ?? 'panel'), grundIds, genannt: bs.genannt,
      weitereBefunde: liste.length - bs.genannt.length, befunde: liste.map(n => n.id) }
    if (woerter(zusammenfassungText(z)) <= MAX_WOERTER) break
  }
  return z!
}

/** Zusammenfassung zu einem Befundblatt (Panel, Bericht) */
export const zusammenfassungBlatt = (b: BefundBlatt, ort: ZfOrt = 'panel'): Zusammenfassung =>
  zusammenfassung({ befund: b.befund, grund: b.grund, offen: b.offen, kontext: { ebenen: b.ebenen, typ: b.gebildet.eingaben.typ.wert }, ort })
