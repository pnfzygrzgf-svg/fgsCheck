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
// Länge: vier Sätze, Ziel 70, höchstens 85 Wörter (Runde 5); zu lang → kürzen nach STUFEN (Satz 4 bleibt immer, kurz).

import { KATALOG } from './katalog'
import type { Grundpruefung, GrundPunkt, GrundTeil } from './grundpruefung'
import type { Befund, Ebene, Eintrag, Empfehlung, RegelDef, Staerke } from './typen'
import type { BefundBlatt } from './befundblatt'
import type { Querungstyp } from './eingaben'
import { fragenFelder, grundKopf, vorbehaltFelder, type ZeilenZustand } from './kompakt'
import { istWeiche, mitEinheit, nachAbschnitt, pruefUebersicht, themaVon, type UebersichtKontext } from './themen'
import { feldZiel, frageVon } from './feldhilfen'
import { QUELLEN_ANNAHME } from './eingaben'
import { FELD_DEF, wertText } from './felder'
import { lesetext } from './lesetext'
import { ANNAHME_V85 } from './grundpruefung'

const DEF = KATALOG as Readonly<Record<string, RegelDef>>

/** Ort der Anzeige: Verweise «(siehe unten)» im Panel, «(siehe erweiterte Prüfung)» im Bericht (23.10.2026: Befunde und offene Angaben je Thema) */
export type ZfOrt = 'panel' | 'bericht'

export interface ZfEingabe {
  befund: Befund
  grund: Grundpruefung
  /** offene Angaben des Befundblatts (Blöcke ganz ohne Eingabe ausgenommen); fehlt: alle offenen Felder des Befunds */
  offen?: readonly { feld: string }[]
  /** Ebenen und Querungstyp der beurteilten Anlage (Prüfübersicht, Satz 1) */
  kontext?: UebersichtKontext
  ort?: ZfOrt
  /** Runde 5: beurteilte Anlage geplant (true) bzw. Bestand (false) – Satz 1 bei Furt usw. */
  geplant?: boolean | null
  /** Runde 5 (Muster 2): Annahmen, an denen Befunde hängen (kurz, mit Wert) und gefundene Gründe für Vortritt (Satz 4) */
  annahmen?: readonly string[]
  gefunden?: readonly string[]
  /** Runde 5 (Stelle 10): Frage je Feld statt der Standardfrage (z. B. «Bitte bestätigen: Tempo-30-Zone (angenommen)?») */
  fragen?: Readonly<Record<string, string>>
  /** 23.10.2026: Felder, deren Fragen im Block «Offene Fragen» darunter stehen (Panel, nur Grundprüfung); Satz 3 nennt sie nicht
   * ausgeschrieben, sondern zählt sie */
  imBlock?: readonly string[]
  /** Trottoirüberfahrt mit geprüfter Alternative Fussgängerstreifen (27.10.2026) */
  alternative?: boolean
}

export interface Zusammenfassung {
  /** Satz 1: Zulässigkeit und empfohlener Querungstyp */
  antwort: string
  /** Satz 2: Grundprüfung und wichtigste Befunde (ein bis zwei Sätze; leer, wenn nichts zu sagen ist) */
  wichtig: string
  /** Satz 3: fehlende Angaben; null, wenn keine fehlt. Runde 5 (Muster 9): zuerst die entscheidenden Angaben, nachsatz zählt den Rest */
  fehlt: { einleitung: string; felder: string[]; weitere: number; nachsatz?: string; gesamt: number
    /** Verweis auf den Block «Offene Fragen» (Panel): «2 Fragen der Grundprüfung stehen unten.» */
    block?: string } | null
  /** Satz 4 (Runde 5): Annahmen und gefundene Gründe; leer ohne */
  hinweis: string
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
/** ganze Zahl bzw. eine Nachkommastelle (Grenze in «knapp unter …») */
const zahl1 = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))
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
    // Grenze mit einer Nachkommastelle wie das Soll («knapp unter 77,8 m», nicht «77,80»)
    if (grenze !== undefined && Number.isFinite(v) && v >= grenze - 1e-9 && v <= grenze + 0.05 + 1e-9) return `knapp unter ${zahl1(grenze)}`
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
const ANLAGE: Partial<Record<Querungstyp, [string, string]>> = { furt: ['die', 'Fussgängerfurt'], ohne_vortritt: ['die', 'Querung ohne Vortritt'],
  mehrzweck: ['der', 'Mehrzweckstreifen'] }
/** Regeln, die gegen einen Streifen sprechen (Muster 8): keine Massnahme zum Verbessern */
const GEGEN = ['C3', 'C4']

/**
 * Satz 1 für eine gewählte Anlage ohne Vortritt (Runde 5, Fall 6): «Beurteilt wird die geplante Fussgängerfurt …», dann ihr Befund
 * (Muss-Befunde der Typ-Regeln E, Furt ohne Insel) und die Alternative Fussgängerstreifen nach der Zulässigkeit
 */
function antwortAnlage(b: Befund, grundIds: string[], typ: Querungstyp, geplant: boolean | null | undefined): string {
  const [art, name] = ANLAGE[typ]!
  const adj = geplant === true ? (art === 'der' ? 'geplante ' : 'geplante ') : geplant === false ? 'bestehende ' : ''
  const teile: string[] = [`Beurteilt wird ${art} ${adj}${name}`]
  // Muss-Befunde zur Eignung der Anlage (Furt im Quartier); die Sicht nennt Satz 2
  const hart = b.alle.filter(x => x.zustand === 'verletzt' && ['E2a'].includes(x.id) && MUSS.includes(x.staerke))
  if (hart.length) { grundIds.push(hart[0].id); teile[0] += `; ${art === 'der' ? 'er' : 'sie'} passt hier nicht: ${kurzform(hart[0])}` }
  if (b.alle.some(x => x.id === 'E1c' && x.zustand === 'verletzt')) {
    grundIds.push('E1c')
    teile[0] += '; ohne gebaute Schutzinsel ist sie keine Furt im Sinn der Norm'
  }
  const alt = b.zulaessigkeit === 'offen' ? 'ob stattdessen ein Fussgängerstreifen zulässig wäre, ist noch offen (erste Frage unten)'
    : b.zulaessigkeit === 'nicht_angezeigt' ? `ein Fussgängerstreifen wäre hier nicht zulässig${(() => {
      const g = b.alle.filter(x => x.zustand === 'verletzt' && ['C1', 'C2'].includes(x.id)); return g.length ? ` (${kurzform(g[0])})` : '' })()}` +
      (typPhrase(b.empfehlung) && b.empfehlung.typ !== typ ? `, empfohlen wird ${typPhrase(b.empfehlung)}` : '')
      : b.zulaessigkeit === 'mit_begruendung' ? 'ein Fussgängerstreifen wäre hier nur mit Begründung zulässig'
        : b.zulaessigkeit === 'zulaessig' ? 'ein Fussgängerstreifen wäre hier ebenfalls zulässig' : ''
  return `${teile[0]}${alt ? `; ${alt}` : ''}.`
}
/** Muss-Befunde zur Lage: «grundsätzlich zulässig, aber …» */
const LAGE_ABER: Readonly<Record<string, string>> = {
  D4a: 'nicht im Haltestellenbereich', D4b: 'nur mit Insel oder mehr Abstand zur Haltestelle', G2: 'nicht so nah am Lichtsignal',
  G3b: 'nicht in der Achse eines verdeckten Fusswegs',
}
/** was die Empfehlung vorläufig macht (offenWegen) */
function vorlaeufigWegen(e: Empfehlung): string {
  if (e.offenWegen.includes('inselMoeglich')) return 'vorläufig: ob die Schutzinsel Platz hat, ist offen'
  // Schutzinsel schon empfohlen: offen ist nicht, ob sie nötig ist
  if (e.offenWegen.some(x => ['D1', 'D2', 'D3a'].includes(x)) && !e.elemente.includes('Schutzinsel'))
    return 'vorläufig: ob eine Schutzinsel nötig ist, ist offen'
  if (e.offenWegen.some(x => ['D4a', 'D4b'].includes(x))) return 'vorläufig: ob die Lage bei der Haltestelle passt, ist offen'
  return 'die Empfehlung ist vorläufig'
}

function antwort(b: Befund, grundIds: string[], typ: Querungstyp | null | undefined, geplant?: boolean | null, zoneVorschlag?: boolean,
  alternative = false): string {
  const e = b.empfehlung, vorl = e.vorlaeufig
  if (b.ende === 'offen') return 'Noch nicht beurteilt: Es fehlt die Angabe, ob die Querung innerorts liegt.'
  if (b.ende === 'ausserorts') return 'Die Querung liegt ausserorts; fgsCheck beurteilt nur Querungen innerorts.'
  if (b.ende === 'begegnungszone') {
    grundIds.push('A2')
    return `In der ${zoneVorschlag ? 'vorgeschlagenen Begegnungszone (Tempo 20)' : 'Begegnungszone'} ist kein Fussgängerstreifen zulässig; ` +
      'dort queren Fussgänger überall mit Vortritt.'
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
    // zwingende Punkte (Q3) und der Trottoirrand (F5c), in der Reihenfolge der Prüfliste (27.10.2026)
    const hart = nachAbschnitt(verletzt(b.alle.filter(x => (x.id.startsWith('Q3') || x.id === 'F5c') && x.zustand === 'verletzt' &&
      MUSS.includes(x.staerke)).map(x => x.id)), x => x.id)
    if (hart.length) {
      // die Alternative (still bzw. mit «Alternative Fussgängerstreifen prüfen» geprüft) in einem kurzen Satz
      const grob = alternative ? '' : ' (nur grob geprüft)'
      const alt = b.zulaessigkeit === 'offen' ? `; ob stattdessen ein Fussgängerstreifen zulässig ist, ist noch offen${grob}`
        : b.zulaessigkeit === 'mit_begruendung' ? `; stattdessen ein Fussgängerstreifen, aber nur mit Begründung${grob}`
          : typPhrase(e) && e.typ !== 'Q3' ? `; stattdessen passt ${typPhrase(e)}${grob}` : ''
      return `Eine Trottoirüberfahrt ist hier nicht zulässig: ${kurzform(hart[0])}${hart.length > 1 ? ` (und ${hart.length - 1} ${hart.length === 2 ? 'weiterer Grund' : 'weitere Gründe'})` : ''}` +
        `${alt}${vorl ? ' (vorläufig: es fehlen Angaben)' : ''}.`
    }
    if (e.typ === 'Q3') return `${vorl ? 'Vorläufig: ' : ''}Eine Trottoirüberfahrt ist hier zulässig.`
    return 'Vorläufig: Ob eine Trottoirüberfahrt hier zulässig ist, hängt von fehlenden Angaben ab.'
  }
  if (typ && ANLAGE[typ]) return antwortAnlage(b, grundIds, typ, geplant)
  const ist = 'ist', beurteilt = ''
  switch (b.zulaessigkeit) {
    case 'nicht_angezeigt': {
      const g = verletzt(['C1', 'C2']).map(x => kurzform(x))
      const st = e.typ === 'furt' ? ', weil es eine Durchgangsstrasse ist' : e.grundlage.includes('E2') ? ', weil es eine Quartierstrasse ist' : ''
      return `Ein Fussgängerstreifen ist hier nicht zulässig${g.length ? `: ${aufzaehlen(g)}` : ''}; ${vorl ? 'vorläufig ' : ''}empfohlen wird ${typPhrase(e)}${st}.`
    }
    case 'offen': {
      // Runde 5 (Muster 1): Satz 1 nennt den möglichen Typ und die entscheidende Frage
      if (b.alle.some(x => x.id === 'A2' && x.zustand === 'offen'))
        return 'Offen ist, ob die Querung in einer Begegnungszone liegt (erste Frage unten): dort braucht es keinen Fussgängerstreifen, ' +
          'Fussgänger haben überall Vortritt; sonst kommt ein Fussgängerstreifen in Frage.'
      const p = typPhrase(e)
      return `Noch offen ist, ob hier ein Fussgängerstreifen zulässig ist (das entscheidet die erste Frage unten)${p ? `; falls ja, passt ${p}` : ''}.`
    }
    default: {
      // Muss-Befund zur Lage: grundsätzlich zulässig, aber nicht an dieser Stelle
      const lage = b.alle.filter(x => x.zustand === 'verletzt' && MUSS.includes(x.staerke) && themaVon(x.id) === 'lage' && LAGE_ABER[x.id])
      if (lage.length) grundIds.push(lage[0].id)
      const zul = lage.length ? `grundsätzlich zulässig, aber ${LAGE_ABER[lage[0].id]}` : 'zulässig'
      const m = mitElementen(e)
      const mit = m ? `${lage.length ? ';' : ','} empfohlen ${m}` : ''
      const vorlText = vorl ? `; ${vorlaeufigWegen(e)}` : ''
      if (b.zulaessigkeit === 'mit_begruendung') {
        // Zone noch offen, Grund bekannt (C2b ohne Zone): «falls Tempo-30-Zone: …» statt einer Zone, die nicht feststeht
        const g = verletzt(['C2b', 'C3', 'C3b', 'C4']).map(x => (x.id === 'C2b' && x.detail?.startsWith('Zone noch offen')
          ? 'falls Tempo-30-Zone, Grund für Vortritt ausweisen' : kurzform(x)))
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

interface Nennung { id: string; text: string; muss: boolean; gegen?: boolean }

/** Befunde für Satz 2: Muss vor Soll, je zuerst der Baum, dann die Grundprüfung (ohne gleichwertige verletzte Regel im Baum) */
function befundListe(b: Befund, g: Grundpruefung, grundIds: readonly string[]): Nennung[] {
  const baum: Eintrag[] = []
  for (const x of nachAbschnitt(b.alle, y => y.id)) if (x.zustand === 'verletzt' && x.staerke !== 'hinweis' && !istWeiche(x.id) && !grundIds.includes(x.id) &&
    !baum.some(y => y.id === x.id)) baum.push(x)
  // gleichwertig nur, wenn die Regel im Baum selbst einen Befund meldet (Muss bzw. Soll) oder Satz 1 sie als Grund nennt; ein
  // verletzter Hinweis (z. B. D2a, D2c, C3b, F3 knapp) ersetzt keinen Soll-Punkt der Grundprüfung
  const imBaum = new Set(b.alle.filter(x => x.zustand === 'verletzt' && (x.staerke !== 'hinweis' || grundIds.includes(x.id))).map(x => x.id))
  const teile: GrundTeil[] = g.gilt && b.ende === null ? [...g.punkte.flatMap(p => p.teile), ...g.weitere] : []
  const bfu = teile.filter(t => t.zustand === 'verletzt' && t.staerke !== 'hinweis' && !(GLEICH[t.id] ?? []).some(id => imBaum.has(id)))
  const n = (x: Eintrag): Nennung => ({ id: x.id, text: mitEbene(kurzform(x, MUSS.includes(x.staerke)), x.ebene), muss: MUSS.includes(x.staerke),
    ...(GEGEN.includes(x.id) ? { gegen: true } : {}) })
  const nt = (t: GrundTeil): Nennung => ({ id: t.id, text: kurzform(t, MUSS.includes(t.staerke ?? 'hinweis')), muss: MUSS.includes(t.staerke ?? 'hinweis') })
  return [...baum.map(n).filter(x => x.muss), ...bfu.map(nt).filter(x => x.muss), ...baum.map(n).filter(x => !x.muss), ...bfu.map(nt).filter(x => !x.muss)]
}

/** «Zu beheben: A und B; zu verbessern: C.» (zusammen höchstens max genannt); ohne Befund: Zahl der Prüfungen */
function befundSatz(liste: readonly Nennung[], max: number, x: ZfEingabe, grundIds: readonly string[], mitGrund: boolean): { text: string; genannt: string[] } {
  const b = x.befund
  if (liste.length) {
    const m = liste.filter(n => n.muss), s = liste.filter(n => !n.muss && !n.gegen), g = liste.filter(n => n.gegen)
    const km = Math.min(max, m.length), ks = Math.min(max - km, s.length), kg = Math.min(Math.max(1, max - km - ks), g.length)
    const wo = x.ort === 'bericht' ? 'siehe erweiterte Prüfung' : 'siehe unten'
    // Runde 5 (Stelle 11): der Rest als Zahl mit Verweis, nie «ein weiterer Befund» ohne Inhalt
    const teil = (xs: readonly Nennung[], k: number): string => {
      const namen = xs.slice(0, k).map(n => n.text), rest = xs.length - k
      const t = aufzaehlen(namen)
      if (!rest) return t
      return k ? `${t} (${rest} ${rest === 1 ? 'weiterer' : 'weitere'}, ${wo})` : `${rest} ${rest === 1 ? 'Befund' : 'Befunde'} (${wo})`
    }
    // Muster 8: was gegen einen Streifen spricht, heisst so (keine Massnahme «zu verbessern»)
    const saetze = [m.length ? `Zu beheben: ${teil(m, km)}` : '', s.length ? `${m.length ? 'zu' : 'Zu'} verbessern: ${teil(s, ks)}` : ''].filter(Boolean)
    const gegen = g.length ? `Spricht eher gegen einen Streifen: ${teil(g, kg)}.` : ''
    return { text: [saetze.length ? `${saetze.join('; ')}.` : '', gegen].filter(Boolean).join(' '),
      genannt: [...m.slice(0, km), ...s.slice(0, ks), ...g.slice(0, kg)].map(n => n.id) }
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

/** Felder, die über die Antwort (Satz 1) entscheiden: Ortslage, Zulässigkeit, Vorbehalt der Empfehlung (Runde 5, Muster 9) */
export function entscheidendeFelder(x: Pick<ZfEingabe, 'befund' | 'alternative'>): string[] {
  const b = x.befund
  const aus: string[] = []
  if (b.ende === 'offen') aus.push(...(b.offenFelder.A1 ?? ['innerorts']))
  // Trottoirüberfahrt ohne geprüfte Alternative (27.10.2026): nur ihre eigenen offenen Punkte, nicht die der still geprüften Alternative
  if (b.ausgewertet.includes('Q3-4') && !x.alternative) {
    const w = b.empfehlung.offenWegen
    if (b.empfehlung.vorlaeufig) aus.push(...vorbehaltFelder({ alle: b.alle, empfehlung: b.empfehlung, nichtGeprueft: b.nichtGeprueft,
      offenFelder: Object.fromEntries(w.map(id => [id, b.offenFelder[id] ?? []])) }))
  } else if (b.empfehlung.vorlaeufig || b.zulaessigkeit === 'offen') aus.push(...vorbehaltFelder(b))
  return fragenFelder(aus).filter(f => f !== 'Zufahrten')
}

/** Felder offener Muss-Regeln: Grundprüfung, dann Baum */
function mussFelder(x: ZfEingabe): string[] {
  const { befund: b, grund: g } = x
  const aus: string[] = []
  if (g.gilt) for (const t of [...g.punkte.flatMap(p => p.teile), ...g.weitere])
    if (t.zustand === 'offen' && DEF[t.id]?.staerke === 'hart') aus.push(...(t.fehlend ?? []), ...sichtOhneFeld(t))
  for (const e of b.alle) if (e.zustand === 'offen' && MUSS.includes(e.staerke)) aus.push(...(e.fehlend ?? []))
  return aus
}

/**
 * Wichtige Fragen (Block «Offene Fragen», 23.10.2026): Felder, die die Antwort (Zulässigkeit bzw. Typ) entscheiden, dann die Felder
 * offener Muss-Prüfungen – dieselbe Reihenfolge wie Satz 3; entscheidend: davon die Felder, die die Antwort tragen
 */
export function wichtigeFelder(x: ZfEingabe): { felder: string[]; entscheidend: string[]; alle: string[] } {
  const entscheidend = entscheidendeFelder(x)
  return { felder: fragenFelder([...entscheidend, ...mussFelder(x)]).filter(f => f !== 'Zufahrten'), entscheidend, alle: fehlendeFelder(x) }
}

/** fehlende Felder in der Reihenfolge der Dringlichkeit */
function fehlendeFelder(x: ZfEingabe): string[] {
  const { befund: b, grund: g } = x
  const aus: string[] = []
  // 1. Zulässigkeit bzw. Empfehlung offen
  aus.push(...entscheidendeFelder(x))
  // 2. Muss-Regeln offen: Grundprüfung, dann Baum
  aus.push(...mussFelder(x))
  // 3. übrige Fragen der Grundprüfung, dann die offenen Angaben des Befundblatts
  if (g.gilt) {
    const k = grundKopf(g)
    aus.push(...k.zeilen.flatMap(z => z.fragen), ...(k.weitere?.fragen ?? []), ...g.punkte.flatMap(p => p.teile).flatMap(sichtOhneFeld))
  }
  aus.push(...(x.offen ? x.offen.map(o => o.feld) : b.offenGruppen.map(o => o.feld)))
  // «Zufahrten» ist ein Hinweis, keine Frage
  return fragenFelder(aus).filter(f => f !== 'Zufahrten')
}

function fehltSatz(felder: readonly string[], entscheidend: readonly string[], max: number, ort: ZfOrt): Zusammenfassung['fehlt'] {
  const n = felder.length
  if (!n) return null
  const wo = ort === 'bericht' ? 'siehe erweiterte Prüfung' : 'siehe unten'
  const ent = felder.filter(f => entscheidend.includes(f)), rest = n - ent.length
  // Runde 5 (Muster 9): entscheidende Angaben getrennt von denen, die die Prüfung nur vervollständigen
  if (ent.length) {
    const k = Math.min(Math.max(max, 1), ent.length)
    const nachsatz = rest ? `Für die vollständige Prüfung ${rest === 1 ? 'fehlt noch 1 weitere Angabe' : `fehlen noch ${rest} weitere Angaben`} (${wo}).` : undefined
    if (!max) return { einleitung: `Für die Antwort ${ent.length === 1 ? 'entscheidet 1 Angabe' : `entscheiden ${ent.length} Angaben`} (${wo}).`, felder: [], weitere: 0,
      ...(nachsatz ? { nachsatz } : {}), gesamt: n }
    return { einleitung: 'Für die Antwort entscheidend:', felder: ent.slice(0, k), weitere: ent.length - k, ...(nachsatz ? { nachsatz } : {}), gesamt: n }
  }
  if (!max) return { einleitung: `Für die vollständige Prüfung ${n === 1 ? 'fehlt noch 1 Angabe' : `fehlen noch ${n} Angaben`} (${wo}).`, felder: [], weitere: 0, gesamt: n }
  const k = Math.min(max, n)
  const einleitung = n === 1 ? 'Für die vollständige Prüfung fehlt noch eine Angabe:' : `Für die vollständige Prüfung fehlen noch ${n} Angaben, zuerst:`
  return { einleitung, felder: felder.slice(0, k), weitere: n - k, gesamt: n }
}

/** Satz 3 mit dem Verweis auf den Block «Offene Fragen» (k Fragen der Grundprüfung) */
function mitBlock(f: Zusammenfassung['fehlt'], k: number): Zusammenfassung['fehlt'] {
  if (!k) return f
  const block = k === 1 ? '1 Frage der Grundprüfung steht unten.' : `${k} Fragen der Grundprüfung stehen unten.`
  return f ? { ...f, block } : { einleitung: '', felder: [], weitere: 0, gesamt: k, block }
}

// ── Gesamt ──

/** Zusammenfassung als Text (Bericht, Tests): Fragen ausgeschrieben, «(und N weitere)» */
export function zusammenfassungText(z: Pick<Zusammenfassung, 'antwort' | 'wichtig' | 'fehlt'> & { hinweis?: string },
  fragen: Readonly<Record<string, string>> = {}): string {
  const f = z.fehlt
  const s3 = f ? ([f.einleitung, ...f.felder.map(x => fragen[x] ?? frageVon(x))].join(' ') + (f.weitere ? ` (und ${f.weitere} weitere).` : '') +
    (f.nachsatz ? ` ${f.nachsatz}` : '') + (f.block ? ` ${f.block}` : '')).trim() : ''
  return [z.antwort, z.wichtig, s3, z.hinweis ?? ''].filter(Boolean).join(' ')
}

/** Satz 4 (Runde 5, Muster 2): «Angenommen, bitte prüfen: Tempo-30-Zone, innerorts. Gefunden: Kindergarten «Florastrasse», 63 m.» */
function hinweisSatz(x: ZfEingabe, kurz: boolean): string {
  const a = (x.annahmen ?? []).slice(0, kurz ? 2 : 3), g = (x.gefunden ?? []).slice(0, kurz ? 1 : 2)
  return [a.length ? `Angenommen, bitte prüfen: ${aufzaehlen(a)}.` : '', g.length ? `Als Grund für Vortritt gefunden: ${aufzaehlen(g)}.` : '']
    .filter(Boolean).join(' ')
}

/** Wörter eines Texts (Zeichenfolgen mit Buchstabe oder Ziffer) */
export const woerter = (t: string): number => t.split(/\s+/).filter(w => /[\p{L}\d]/u.test(w)).length
/** harte Grenze; Ziel im Normalfall ZIEL_WOERTER (Korrektur nach Prüfung Runde 5) */
export const MAX_WOERTER = 85
export const ZIEL_WOERTER = 70

/**
 * Stufen der Kürzung (Korrektur nach Prüfung Runde 5): zuerst «Sonst keine Befunde.», dann der Nachsatz zu den übrigen Angaben, dann der
 * Verweis «(das entscheidet die erste Frage unten)» (doppelt zu «Für die Antwort entscheidend»), dann weniger Befunde und Fragen und die
 * kurze Grundprüfung. Satz 4 (Annahmen, gefundene Gründe) fällt nie ganz weg, nur auf die kurze Form. Gewählt wird die erste Stufe bis
 * ZIEL_WOERTER, die noch einen Befund nennt, sonst die erste bis MAX_WOERTER, sonst die letzte.
 */
interface Stufe { befunde: number; fragen: number; grundKurz: boolean; hinweisKurz: boolean; ohneSonst: boolean; ohneNachsatz: boolean
  ohneVerweis: boolean }
const S0: Stufe = { befunde: 2, fragen: 2, grundKurz: false, hinweisKurz: false, ohneSonst: false, ohneNachsatz: false, ohneVerweis: false }
const STUFEN: readonly Stufe[] = [
  S0, { ...S0, ohneSonst: true }, { ...S0, ohneSonst: true, ohneNachsatz: true },
  { ...S0, ohneSonst: true, ohneNachsatz: true, ohneVerweis: true },
  { ...S0, ohneSonst: true, ohneNachsatz: true, ohneVerweis: true, fragen: 1 },
  { ...S0, ohneSonst: true, ohneNachsatz: true, ohneVerweis: true, fragen: 1, befunde: 1, hinweisKurz: true },
  { ...S0, ohneSonst: true, ohneNachsatz: true, ohneVerweis: true, fragen: 1, befunde: 1, hinweisKurz: true, grundKurz: true },
  { ...S0, ohneSonst: true, ohneNachsatz: true, ohneVerweis: true, fragen: 1, befunde: 0, hinweisKurz: true, grundKurz: true },
  { ...S0, ohneSonst: true, ohneNachsatz: true, ohneVerweis: true, fragen: 0, befunde: 0, hinweisKurz: true, grundKurz: true },
]
/** Verweise in Satz 1 auf die Frage unten */
const VERWEIS = / \((das entscheidet die )?erste Frage unten\)/

/** Zusammenfassung einer Querung */
export function zusammenfassung(x: ZfEingabe): Zusammenfassung {
  const grundIds: string[] = []
  const s1 = antwort(x.befund, grundIds, x.kontext?.typ, x.geplant, x.grund?.zoneVorschlag, x.alternative)
  const liste = befundListe(x.befund, x.grund, grundIds)
  const felder = fehlendeFelder(x), entscheidend = entscheidendeFelder(x)
  // Block «Offene Fragen» (Panel): diese Fragen nennt Satz 3 nicht ausgeschrieben, sondern zählt sie (im Bericht kein Block)
  const imBlock = x.ort === 'bericht' ? [] : x.imBlock ?? []
  // Zahl der Fragen im Block (Zählung und Schätzung der Querenden sind eine Frage)
  const nBlock = imBlock.filter(f => f !== 'fgKlasse').length
  const varianten: Zusammenfassung[] = []
  for (const st of STUFEN) {
    const vorab = grundSatz(x.grund, x.befund, st.grundKurz, [])
    const bs = befundSatz(liste, st.befunde, x, grundIds, vorab.startsWith('Grundprüfung bfu:'))
    const bsText = st.ohneSonst && bs.text === 'Sonst keine Befunde.' ? '' : bs.text
    const wichtig = [grundSatz(x.grund, x.befund, st.grundKurz, bs.genannt), bsText].filter(Boolean).join(' ')
    const f0 = mitBlock(fehltSatz(felder.filter(f => !imBlock.includes(f)), entscheidend, st.fragen, x.ort ?? 'panel'), nBlock)
    const fehlt = f0 && st.ohneNachsatz && f0.nachsatz && f0.felder.length ? (({ nachsatz: _n, ...r }) => { void _n; return r })(f0) : f0
    // der Verweis in Satz 1 fällt nur weg, wenn Satz 3 die entscheidende Frage selbst nennt
    const antwortS = st.ohneVerweis && fehlt?.einleitung === 'Für die Antwort entscheidend:' && fehlt.felder.length ? s1.replace(VERWEIS, '') : s1
    varianten.push({ antwort: antwortS, wichtig, fehlt, hinweis: hinweisSatz(x, st.hinweisKurz),
      grundIds, genannt: bs.genannt, weitereBefunde: liste.length - bs.genannt.length, befunde: liste.map(n => n.id) })
  }
  const n = (z: Zusammenfassung) => woerter(zusammenfassungText(z, x.fragen))
  // ein Befund bleibt genannt, solange die harte Grenze es erlaubt: das Ziel gilt nur für Stufen mit mindestens einem Befund
  const mitBefund = varianten.filter((_z, i) => STUFEN[i].befunde > 0 || !liste.length)
  return mitBefund.find(z => n(z) <= ZIEL_WOERTER) ?? varianten.find(z => n(z) <= MAX_WOERTER) ?? varianten[varianten.length - 1]
}

/** Zusammenfassung zu einem Befundblatt (Panel, Bericht) */
export const zusammenfassungBlatt = (b: BefundBlatt, ort: ZfOrt = 'panel'): Zusammenfassung =>
  zusammenfassung(zfEingabeBlatt(b, ort))

/** Eingabe der Zusammenfassung aus einem Befundblatt: Annahmen, Funde und Fragen zum Bestätigen aus der Herkunft der Felder (Runde 5) */
export function zfEingabeBlatt(b: BefundBlatt, ort: ZfOrt = 'panel'): ZfEingabe & { fragen: Record<string, string> } {
  const h = b.gebildet.herkunft, e = b.gebildet.eingaben
  const annahme = (f: string) => { const x = h.get(f); return x?.zustand === 'vorbelegt' && !!x.quelle && QUELLEN_ANNAHME.includes(x.quelle) }
  const genutzt = new Set(b.befund.annahmen.map(a => /^([\w.]+): (Annahme|Schätzung)$/.exec(a)?.[1]).filter((v): v is string => !!v))
  const annahmen: string[] = []
  for (const f of ANNAHME_KURZ_REIHE) if (annahme(f) && genutzt.has(f)) {
    const t = ANNAHME_KURZ[f](h.get(f)!.vorbelegt!.wert)
    if (t) annahmen.push(t)
  }
  if (b.grund.gilt && b.grund.annahmen.includes(ANNAHME_V85)) annahmen.push('Tempo wie signalisiert (nicht gemessen)')
  // gefundene Gründe für Vortritt (Schule, Kindergarten, Heim, Haltestelle, Fusswegnetz) aus der Vorbelegung
  const gefunden: string[] = []
  const bd = h.get('beduerfnis')
  if (bd?.zustand === 'vorbelegt' && Array.isArray(bd.vorbelegt?.wert)) {
    const w = bd.vorbelegt!.wert as string[]
    for (const teil of lesetext(bd.text).replace(/: Haltestelle an der Querung als Grund für Vortritt/g, '').replace(/: Grund für Vortritt\b/g, '').split('; '))
      if (/^(Volksschule|Kindergarten|Schule|Heim|Haltestelle|Bushaltestelle|Tramhaltestelle)/.test(teil))
        gefunden.push(teil.replace(/ \((Geoportal Stadt Bern|OSM[^)]*)\)/g, '').replace(/ \(Geoportal Stadt Bern[^)]*\)/g, ''))
    if (w.includes('fusswegnetz')) gefunden.push('Basisnetz des Fusswegnetzes (Bern)')
  }
  // Fragen zum Bestätigen (Stelle 10): vorbelegte Annahme, die eine offene Regel trägt
  const fragen: Record<string, string> = {}
  for (const o of b.offen) if (o.bestaetigen && annahme(o.feld)) {
    const d = FELD_DEF.get(o.feld)
    if (d) fragen[o.feld] = `Bitte bestätigen: ${wertText(d, h.get(o.feld)!.vorbelegt!.wert)} (angenommen)?`
  }
  return { befund: b.befund, grund: b.grund, offen: b.offen, kontext: { ebenen: b.ebenen, typ: e.typ.wert }, ort,
    geplant: e.neuanlage.wert, annahmen, gefunden, fragen, ...(b.alternative ? { alternative: true } : {}) }
}

/** Annahmen für Satz 4: Reihenfolge und Kurzform mit Wert */
const ANNAHME_KURZ_REIHE = ['tempoRegime', 'innerorts', 'beduerfnis', 'vSig', 'strassentyp', 'fgsMitLsa', 'nachfrage', 'dtv'] as const
const ANNAHME_KURZ: Record<(typeof ANNAHME_KURZ_REIHE)[number], (w: unknown) => string> = {
  tempoRegime: w => (w === 't30_zone' ? 'Tempo-30-Zone' : w === 'begegnungszone' ? 'Begegnungszone' : w === 'strecke' ? 'keine Zone (Strecke)' : ''),
  innerorts: w => (w === true ? 'innerorts' : w === false ? 'ausserorts' : ''),
  beduerfnis: w => (Array.isArray(w) && !w.length ? 'kein besonderer Grund für Vortritt' : ''),
  vSig: w => (typeof w === 'number' ? `Tempo ${w} km/h` : ''),
  strassentyp: w => (w === 'siedlungsorientiert' ? 'Quartierstrasse' : w === 'verkehrsorientiert' ? 'Durchgangsstrasse' : ''),
  fgsMitLsa: w => (w === true ? 'Lichtsignal der nahen Ampel gilt für die Querung' : ''),
  nachfrage: w => (w === 'punktuell' ? 'gebündeltes Queren' : w === 'flaechig' ? 'verteiltes Queren' : ''),
  dtv: w => (typeof w === 'number' ? `${w} Fahrzeuge pro Tag` : ''),
}

// ── Block «Offene Fragen» (23.10.2026) ──

/** eine Frage im Block: Feld der Frage, Feld der Maske (Ziel), Eingabe bzw. Vorschlag bestätigen, Punkt der Grundprüfung (festes
 * Zeichen: T Tempo, 1–5; W ergänzende bfu-Aspekte, im Block nicht verwendet), entscheidet die Antwort */
export interface OffeneFrage { feld: string; ziel: string; art: 'eingabe' | 'bestaetigen'; punkte: (GrundPunkt['nr'] | 'W')[]; entscheidend: boolean }

/**
 * Fragen für den Block «Offene Fragen» (Nutzerentscheid 23.10.2026): alle Felder, die eine Regel der Grundprüfung (Tempo und die fünf
 * Punkte, ohne die ergänzenden bfu-Aspekte) offen lässt, höchstens rund sechs. Feste Reihenfolge nach Punkt (Tempo, ① bis ⑤), im
 * Punkt Muss vor Soll vor Hinweis; Felder, die die Antwort entscheiden, tragen nur den Hinweis. Je Feld der Maske einmal (unter mehreren Punkten mit allen
 * Zeichen; Zählung bzw. Schätzklasse der Querenden als eine Frage); beantwortbar sind offene Felder (auch bewusst offen gesetzte
 * und solche mit Rechner-Anzeige) und vorbelegte Annahmen mit Bestätigungspflicht (bestaetig).
 */
export function offeneFragen(b: BefundBlatt, bestaetig: ReadonlySet<string>): OffeneFrage[] {
  return offeneFragenAus(b.grund, entscheidendeFelder(zfEingabeBlatt(b)), ziel => {
    const h = b.gebildet.herkunft.get(ziel)
    const offen = !h || h.zustand === 'offen' || h.zustand === 'rechner' || (h.zustand === 'hand' && (h.wert === null || h.wert === undefined))
    const best = h?.zustand === 'vorbelegt' && bestaetig.has(ziel) && !!h.quelle && QUELLEN_ANNAHME.includes(h.quelle)
    return best ? 'bestaetigen' : offen ? 'eingabe' : null
  })
}

/** Auswahl der Fragen (offeneFragen) aus der Grundprüfung, den entscheidenden Feldern und der Beantwortbarkeit je Feld der Maske */
export function offeneFragenAus(g: Grundpruefung, entscheidend: readonly string[],
  art: (ziel: string) => OffeneFrage['art'] | null): OffeneFrage[] {
  if (!g.gilt) return []
  const RANG_ST: Record<string, number> = { hart: 0, hart_bericht: 0, weich: 1, hinweis: 2 }
  const roh: { feld: string; punkt: GrundPunkt['nr'] | 'W' }[] = []
  const gruppen: [GrundPunkt['nr'] | 'W', readonly GrundTeil[]][] = [...g.punkte.map(p => [p.nr, p.teile] as [GrundPunkt['nr'], GrundTeil[]]), ['W', g.weitere]]
  for (const [punkt, teile] of gruppen) {
    // nur Tempo und die fünf Punkte (Nutzerentscheid 23.10.2026): die ergänzenden bfu-Aspekte bleiben bei ihren Feldern
    if (punkt === 'W') continue
    const offen = teile.filter(t => t.zustand === 'offen')
      .sort((x, y) => (RANG_ST[DEF[x.id]?.staerke ?? 'hinweis'] ?? 2) - (RANG_ST[DEF[y.id]?.staerke ?? 'hinweis'] ?? 2))
    for (const t of offen) for (const f of [...(t.fehlend ?? []), ...sichtOhneFeld(t)]) roh.push({ feld: f, punkt })
  }
  // feste Reihenfolge Tempo, ① bis ⑤, Weitere (Nutzerentscheid 23.10.2026: Stabilität); entscheidende nur mit Hinweis
  const fragen: OffeneFrage[] = []
  for (const { feld: f0, punkt } of roh) {
    if (f0 === 'Zufahrten') continue
    // Zählung oder Schätzklasse der Querenden (⑤): eine gemeinsame Frage beim Feld der Zählung
    const f = f0 === 'fgKlasse' ? 'fg5h' : f0
    const ziel = feldZiel(f)
    if (!ziel) continue
    const da = fragen.find(x => x.ziel === ziel)
    // dasselbe Feld unter einem weiteren Punkt: eine Frage, beide Zeichen
    if (da) { if (!da.punkte.includes(punkt)) da.punkte.push(punkt); continue }
    const a = art(ziel)
    if (!a) continue
    fragen.push({ feld: f, ziel, art: a, punkte: [punkt], entscheidend: entscheidend.includes(f) })
  }
  return fragen
}
