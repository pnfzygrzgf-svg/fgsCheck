// ── Bedarfsmodul E1: Abschnitt «Bedarf und Querungstyp» im Panel (Eingabemaske, Ebenen, Befundblatt) und Befundblatt im Bericht ──
//
// Die Eingaben gelten je Fall (eine Querung, auch mit Teilstreifen an einer Insel); vorbelegt wird je Querung aus der Rechnung
// (bedarf/vorbelegung.ts), eine Handeingabe überschreibt die Vorbelegung (Quelle wählbar: von Hand, Schätzung, Annahme).
// Leere Felder sind «offen». Das Befundblatt (bedarf/befundblatt.ts) steht im Panel oberhalb des Sichtbefunds und im Bericht.
// Oben die Grundprüfung nach bfu (Big Five, bedarf/grundpruefung.ts) mit ihren Eingaben, darunter aufklappbar die erweiterte
// Prüfung (Ebenen, Befundblatt, übrige Eingaben). Die Empfehlung des Querungstyps bleibt oben sichtbar.
// Feldhilfen (bedarf/feldhilfen.ts): je Feld ein Knopf «?» mit Erklärung, Regeln und Quellen, Bedeutung von leer; Felder, die im
// Fall nicht zählen, sind ausgeblendet (Werte bleiben im Fall). Im Bericht keine Feldhilfen.
// Regeln erscheinen nie als Nummer allein: Kurztitel mit Nummer als Verweis (bedarf/regelname.ts; Texte über mitTiteln = T).
// Runde 2 (bedarf/themen.ts, bedarf/kompakt.ts): eine Zeile je Punkt der Grundprüfung bzw. je Eintrag (Symbol, Kurztitel,
// Verbindlichkeit, ein Satz); Nummern, Fundstellen und Normhinweise hinter «Details». Offene Angaben als Frage (feldhilfen.FRAGEN);
// ein Klick springt zum Feld (FeldSprung). Die erweiterte Prüfung ordnet nach Thema.
// Runde 3 (bedarf/zusammenfassung.ts): zuoberst je Querung eine Zusammenfassung in drei Sätzen (Antwort, das Wichtigste, was
// fehlt) als Absatz; die Empfehlung steht dort, darum entfällt im Panel die Zeile «Empfohlen: …» (Zusatz und Begründung bleiben).
// Automatik Paket A (21.10.2026): der vorbelegte Wert steht im Feld (Klasse «vorbelegt»), daneben ein Quellen-Chip (Herkunft als
// Tooltip). Eine Änderung wird nur zur Handeingabe, wenn sie vom vorbelegten Wert abweicht (Chip «von Hand» mit «zurück»); «offen»
// verwirft die Vorbelegung bewusst. Felder im Zustand «rechner» (Sichtweite je Zufahrt, Kurvenradius ohne Abbieger) zeigen das
// Ergebnis des Sichtrechners, darunter die Eingabe «von Hand überschreiben». Unter der Zusammenfassung stehen die offenen Fragen der
// Grundprüfung zum direkten Beantworten (Block «Offene Fragen», 23.10.2026).
// Runde 4: offene Felder nennen klein, wofür die Angabe fehlt (bedarf/feldbedarf.ts); «Vorschlag bestätigen» nur, wo ein Verbot an der
// Annahme hängt; in den Details führt der Werkname zum Quellenverzeichnis der Hilfe (bedarf/quellen.ts), Begriffe in Feldhilfen und
// Details lassen sich mit «?» erklären (bedarf/begriffe.ts); im Bericht beides als Verzeichnis des Falls (VerzeichnisBericht).
// Runde 5 (Lesetest 21.10.2026): Zeile zum Typ auch im Panel (Panel und Bericht gleich, «Falls zulässig» bei offener Zulässigkeit),
// Zusätze ohne Regelnummern, Belege in ⟦…⟧ nur im Tooltip (bedarf/lesetext.ts), Stand der Grundprüfung in Zeile und Details gleich,
// Masse mit Ausnahme bzw. Vorbehalt beim Wert, Bericht «Eingaben und Quellen» als Tabelle.
// Erweiterte Prüfung nach Thema (23.10.2026, bedarf/themenansicht.ts): je Thema ein Aufklapper mit den Befunden, den offenen Angaben als
// Fragen mit Eingabe (dieselbe Liste wie der Block «Offene Fragen», FragenListe) und den übrigen Feldern des Themas; Masse und Annahmen
// je ein Aufklapper am Ende. «Offene Angaben» und «Weitere Eingaben» als eigene Teile entfallen. Bericht: gleiche Gliederung, offen.

import { Fragment, createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react'
import type { Fall } from './fall'
import { FELD_DEF, FELD_DEFS, GRUPPEN, feldName, istGrundFeld, wertText, type FeldDef } from './bedarf/felder'
import { ANNAHME_V85, type GrundPunkt, type GrundTeil, type GrundZustand, type Grundpruefung } from './bedarf/grundpruefung'
import { ZUSTAND_ANZEIGE, annahmenJePunkt, eintragSatz, fragenFelder, grundKopf, istSoll, type GrundZeile } from './bedarf/kompakt'
import { HAND_QUELLEN, QUELLE_TEXT, gleicherWert, handSetzen, handPruefen, ebeneSetzen, type BedarfEbenen, type Herkunft } from './bedarf/fallBedarf'
import type { BefundBlatt } from './bedarf/befundblatt'
import type { Ebene, Eintrag } from './bedarf/typen'
import { QUELLEN_ANNAHME, QUELLEN_BESTAETIGBAR, type Quelle, KURVE_BEDINGUNGEN } from './bedarf/eingaben'
import { mitTiteln, regelName, regelTitel } from './bedarf/regelname'
import { ABSCHNITTE, EBENE_WORT, LEGENDE, THEMEN, abschnittVon, gruppeVonThema, istAusfuehrung, mitEinheit, nachAbschnitt, pruefUebersicht, themaName,
  themaVon, verbindlichkeitVon } from './bedarf/themen'
import { BLOCK_GRUENDE, hatInhalt, ohneBefundZeile, themaGliederung, themenAnsicht, type ThemaFrage, type ThemaTeil, type ThemenAnsicht } from './bedarf/themenansicht'
import { FELD_HILFEN, SICHTBAR, bedingungText, bezuegeImFall, feldZiel, frageVon, leerText, regelPfade, schalter, schalterText, sichtbar,
  wozuTeilen, type SichtKontext } from './bedarf/feldhilfen'
import { A2_OFFEN_TEXT, OHNE_ORTSLAGE_TEXT, typText, herkunftKurz, herkunftSichtbar } from './bedarf/befundblatt'
import { offeneFragen, zusammenfassung, zfEingabeBlatt, type OffeneFrage } from './bedarf/zusammenfassung'
import { lesetext, tooltipText } from './bedarf/lesetext'
import type { MassZeile } from './bedarf/typen'
import { bestaetigungsFelder, feldBedarf, feldBedarfText, type FeldBedarf } from './bedarf/feldbedarf'
import { begriffeImFall, begriffeIn } from './bedarf/begriffe'
import { LESENAME, WERK_INFO, abkLesbar, werkText, fundstelleLink, fundstelleText, werkBezug, werkeImFall, werkLinks, werkVoll } from './bedarf/quellen'
import { FundstelleLink, VerweisText, WerkLinks, WerkVerweis, hilfeZeigen } from './Verweise'
import { KATALOG, WERKE, type RegelId, type WerkId } from './bedarf/katalog'
import { reiterZeigen } from './reiter'
import { regelAnker, regelZeigen } from './bedarf/regeluebersicht'

/** Sprung zu einem Feld der Maske (Panel); im Bericht fehlt er, die Fragen sind dort Text */
/** Text für die Anzeige: Regelnummern mit Titel (mitTiteln), Abkürzungen der Fundstellen ausgeschrieben (Nutzertest 23.10.2026) */
function T(text: string): string
function T(text: string | undefined): string | undefined
function T(text: string | undefined): string | undefined { return text === undefined ? text : abkLesbar(mitTiteln(text)) }

const FeldSprung = createContext<((feld: string) => void) | null>(null)
/** Feld hat einen Wert (vorbelegt bzw. von Hand): Befundzeilen bieten «ändern» (27.10.2026) */
const WertFeld = createContext<((pfad: string) => boolean) | null>(null)
/** Felder einer Regel, die ihre geprüfte Grösse tragen (ohne Schalter) und einen Wert haben */
export function aenderFelder(id: string, hatWert: (pfad: string) => boolean): string[] {
  if (!(id in KATALOG)) return []
  const sch = schalter(id as RegelId)
  return regelPfade(id as RegelId).filter(p => !sch.includes(p) && FELD_DEF.has(p) && hatWert(p))
}
/** Kennung der Zeile eines Felds in der Maske */
export const feldZeileId = (pfad: string): string => `feld-${pfad.replace(/\./g, '-')}`

/** Frage zu einem fehlenden Feld; im Panel ein Knopf, der zum Feld springt */
function Frage({ feld, text, zweck }: { feld: string; text?: string
  /** Halbsatz, warum die Frage hier steht (Muster 7) */
  zweck?: string }) {
  const sprung = useContext(FeldSprung)
  const ziel = feldZiel(feld)
  const t = (text ?? frageVon(feld)) + (zweck ? ` (${zweck})` : '')
  if (!sprung || !ziel) return <span className="frage">{t}</span>
  return <button type="button" className="frage-knopf" title="zum Feld springen"
    onClick={e => { e.preventDefault(); e.stopPropagation(); sprung(ziel) }}>{t}</button>
}
/** mehrere Fragen, höchstens max, dann «und N weitere» */
function Fragen({ felder, max = 99, regel }: { felder: readonly string[]; max?: number
  /** Regel, für die gefragt wird (Zweck der Frage, Muster 7) */
  regel?: string }) {
  const f = fragenFelder(felder)
  return <>{f.slice(0, max).map((x, i) => <Fragment key={x}>{i ? ' ' : ''}<Frage feld={x} zweck={regel ? frageZweck(x, regel) : undefined} /></Fragment>)}
    {f.length > max ? ` und ${f.length - max} weitere` : ''}</>
}

/** Warum eine Frage bei einer Regel steht, wenn sie mehreren Regeln dient (Runde 5, Muster 7 und Stelle 26) */
export function frageZweck(feld: string, regel: string): string | undefined {
  const sicht = ['H1', 'H1b', 'H3a', 'H3b', 'D5-4', 'E3', 'B5-1', 'B5-1b']
  if (['anzeichenSchneller', 'v85', 'v85Nachweis'].includes(feld))
    return sicht.includes(regel) ? 'davon hängt die nötige Sichtweite ab' : ['C1', 'B5-T', 'A3'].includes(regel) ? 'davon hängt ab, ob das Tempo zulässig ist' : undefined
  if (feld === 'innerorts') return regel === 'A1' ? 'davon hängt ab, ob fgsCheck überhaupt beurteilt (nur innerorts)'
    : sicht.includes(regel) ? 'davon hängt die nötige Sichtweite bei 60 km/h ab' : undefined
  if (feld === 'dtv') return ['D2', 'D2a'].includes(regel) ? 'davon hängt ab, ob eine Insel nötig ist' : undefined
  return undefined
}

export { hilfeZeigen, VerweisText }

/** Fundstellen eines Eintrags lesbar (Nutzertest 23.10.2026): Werk mit Lesenamen als Verweis ins Quellenverzeichnis, Ziffer
 * ausgeschrieben, Artikel bzw. Seite mit direktem Link; im Bericht reiner Text. Ohne Katalogeintrag: der Text lesbar */
export function QuelleMitVerweis({ id, quelle, druck = false }: { id: string; quelle: string; druck?: boolean }) {
  const def = (KATALOG as Readonly<Record<string, { quellen: readonly { werk: string; ziffer: string }[] }>>)[id]
  if (!def) return <VerweisText text={quelle} druck={druck} />
  return <>{def.quellen.map((q, i) => {
    const w = q.werk as WerkId, z = abkLesbar(q.ziffer)
    return <Fragment key={i}>{i ? '; ' : ''}<WerkVerweis w={w} anzeige={LESENAME[w] ?? q.werk} druck={druck} />
      {z && <>, <FundstelleLink text={z} link={fundstelleLink(q)} w={w} druck={druck} /></>}</Fragment>
  })}</>
}

/** Begriffe, die in den Texten vorkommen, als dezente Knöpfe «Name ?»; ein Klick zeigt die Erklärung (Tooltip mit demselben Text) */
export function BegriffVerweise({ texte, nur }: { texte: readonly (string | undefined)[]
  /** nur diese Begriffe (Befundblatt: je Begriff nur bei der ersten Nennung) */
  nur?: readonly string[] }) {
  const [auf, setAuf] = useState<string | null>(null)
  const bs = begriffeIn(texte.filter(Boolean).join('\n')).filter(b => !nur || nur.includes(b.id))
  if (!bs.length) return null
  const b = bs.find(x => x.id === auf)
  return <span className="begriff-verweise"> Begriffe:{bs.map(x => <Fragment key={x.id}> <button type="button" className="begriff-knopf"
    title={x.text} aria-expanded={auf === x.id} onClick={e => { e.preventDefault(); e.stopPropagation(); setAuf(auf === x.id ? null : x.id) }}>
    {x.name}<span aria-hidden="true"> ?</span></button></Fragment>)}
    {b && <span className="begriff-def" role="note"><b>{b.name}:</b> {b.text} <a href={`#begriff-${b.id}`} className="werk-link"
      onClick={e => { if (hilfeZeigen(`begriff-${b.id}`)) e.preventDefault() }}>alle Begriffe</a></span>}</span>
}

/** Bericht (Runde 4): Quellenverzeichnis und Begriffe am Ende des Bedarfsteils, nur was im Fall vorkommt */
export function VerzeichnisBericht({ blaetter }: { blaetter: readonly BefundBlatt[] }) {
  const werke = werkeImFall(blaetter), begriffe = begriffeImFall(blaetter)
  return <>
    {werke.length > 0 && <><h3>Quellen der Beurteilung</h3>
      <ul className="klein">{werke.map(w => {
        // Bericht (druckbar): voller Titel und die Adresse als Text (lesbar, Umlaute statt %-Kodierung)
        const links = werkLinks(w), bezug = werkBezug(w)
        return <li key={w}><b>{WERKE[w].name}</b> ({WERKE[w].ausgabe}): {werkVoll(w)}. {WERK_INFO[w].ebene}: {werkText(w)}{links.map(l => <Fragment key={l.url}> {l.text}: <span className="url-text">{decodeURI(l.url)}</span></Fragment>)}
          {bezug ? ` (${bezug})` : ''}</li>
      })}</ul></>}
    {begriffe.length > 0 && <><h3>Begriffe</h3>
      <ul className="klein">{begriffe.map(b => <li key={b.id}><b>{b.name}:</b> {b.text}</li>)}</ul></>}
  </>
}

const zahlText = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',')

export { wertText }

/** Text einer Zahl bzw. Zahlenliste aus der Eingabe lesen; null = leer, undefined = ungültig */
function zahlenLesen(t: string, d: FeldDef): unknown {
  const s = t.trim()
  if (!s) return null
  const teile = s.split(/[/;]/).map(x => Number(x.trim().replace(',', '.').replace('−', '-')))
  if (teile.some(x => !Number.isFinite(x))) return undefined
  return d.art.art === 'zahl' ? (teile.length === 1 ? teile[0] : undefined) : teile
}

/** Eingabe setzen: false, wenn der Wert ungültig ist (die Maske zeigt dann die Meldung, das Feld springt zurück) */
type Setze = (x: unknown) => boolean

function TextEingabe({ d, wert, platzhalter, setze, vorbelegt = false, label }: { d: FeldDef; wert: unknown; platzhalter: string; setze: Setze
  vorbelegt?: boolean; label?: string }) {
  const text = (v: unknown) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.map(zahlText).join(' / ') : zahlText(v as number))
  const [t, setT] = useState(text(wert))
  useEffect(() => { setT(text(wert)) }, [wert])
  const uebernehmen = () => {
    const x = zahlenLesen(t, d)
    if (x === undefined || !setze(x)) { setT(text(wert)); return }
  }
  return <input type="text" inputMode="decimal" className={`zahl bedarf-zahl${vorbelegt ? ' vorbelegt' : ''}`} value={t} placeholder={platzhalter}
    aria-label={label ?? d.name}
    title={d.art.art === 'zahlen' ? 'mehrere Werte mit / trennen; leer = offen bzw. vorbelegt; Enter bzw. Feld verlassen übernimmt'
      : 'leer = offen bzw. vorbelegt; Enter bzw. Feld verlassen übernimmt'}
    onChange={e => setT(e.target.value)} onBlur={uebernehmen} onKeyDown={e => { if (e.key === 'Enter') uebernehmen() }} />
}

/** Auswahlwert «bewusst offen» (Handangabe, verwirft die Vorbelegung) */
const OFFEN_WAHL = '__offen'
/** Handangabe «offen» (ohne Wert) */
export const istHandOffenH = (h: Herkunft): boolean => h.zustand === 'hand' && (h.wert === null || h.wert === undefined)
/**
 * Eingabe übernehmen (Automatik Paket A): gleicher Wert wie die Vorbelegung ist keine Handeingabe (eine bestehende wird entfernt);
 * leer (null) ohne Handeingabe lässt die Vorbelegung stehen. false: ungültig bzw. nicht übernommen (Feld springt zurück)
 */
export function eingabeUebernehmen(h: Herkunft, x: unknown, setze: Setze): boolean {
  const vor = h.vorbelegt
  const hand = h.zustand === 'hand'
  if (x === null || x === undefined) return hand ? setze(null) : false
  if (vor && gleicherWert(x, vor.wert)) return hand ? setze(null) : true
  return setze(x)
}

/** Liste nach einem Klick: leer heisst ohne Vorbelegung offen (null), mit Vorbelegung Handeingabe «keines» ([]) (Korrektur S4) */
export const listeNeu = (x: string[], vorbelegt: boolean): string[] | null => (x.length ? x : vorbelegt ? [] : null)

/**
 * Eingabe eines Felds (Maske und Block «Offene Fragen», gleiche Übernahme). knoepfe (Block, 23.10.2026): Ja/Nein bzw. Auswahl bis
 * vier Optionen als Knöpfe, Zahl mit Einheit und Knopf «übernehmen», Liste mit Knopf «übernehmen»; label: Beschriftung (die Frage)
 */
export function FeldEingabe({ d, h, setze, offen, knoepfe = false, label }: { d: FeldDef; h: Herkunft; setze: Setze; offen: () => void
  knoepfe?: boolean; label?: string }) {
  const hand = h.zustand === 'hand'
  const handOffen = istHandOffenH(h)
  const vor = h.vorbelegt
  const a = d.art
  const uebernehmen = (x: unknown) => eingabeUebernehmen(h, x, setze)
  const name = label ?? d.name
  if (knoepfe && (a.art === 'bool' || (a.art === 'wahl' && a.optionen.length <= 4))) {
    const opt: [unknown, string][] = a.art === 'bool' ? [[true, 'ja'], [false, 'nein']] : a.optionen
    return <span className="frage-antworten" role="group" aria-label={name}>{opt.map(([k, t]) => <Fragment key={String(k)}>
      <button type="button" className="zweit klein" aria-label={`${name} ${t}`} onClick={() => uebernehmen(k)}>{t}</button>{' '}</Fragment>)}</span>
  }
  if (knoepfe && a.art === 'liste') return <ListeMitKnopf d={d} name={name} vor={!!vor} uebernehmen={uebernehmen} />
  if (a.art === 'bool' || a.art === 'wahl') {
    const opt: [string, string][] = a.art === 'bool' ? [['ja', 'ja'], ['nein', 'nein']] : a.optionen
    const wert = (x: unknown) => (a.art === 'bool' ? (x === true ? 'ja' : x === false ? 'nein' : '') : (x as string) ?? '')
    const gewaehlt = handOffen ? (vor ? OFFEN_WAHL : '') : hand ? wert(h.wert) : vor ? wert(vor.wert) : ''
    return <select value={gewaehlt} aria-label={name} className={!hand && vor ? 'vorbelegt' : undefined}
      title={!hand && vor ? `vorbelegt (${QUELLE_TEXT[vor.quelle]}: ${tooltipText(vor.text)}); eine andere Wahl gilt als Handeingabe` : undefined}
      onChange={e => {
        const v = e.target.value
        if (v === OFFEN_WAHL) { offen(); return }
        if (v === '') { setze(null); return }
        uebernehmen(a.art === 'bool' ? v === 'ja' : v)
      }}>
      {vor ? <option value={OFFEN_WAHL}>offen (Vorbelegung verwerfen)</option> : <option value="">offen</option>}
      {opt.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
    </select>
  }
  if (a.art === 'liste') {
    const x = (handOffen ? null : hand ? h.wert : vor?.wert) as string[] | null | undefined
    const liste = Array.isArray(x) ? x : null
    // letztes Häkchen weg: ohne Vorbelegung wieder offen; mit Vorbelegung eine Handeingabe «keines» (kein Rückfall auf die Vorbelegung,
    // Korrektur S4); «keines» ist eine eigene Angabe
    return <span className="bedarf-liste" role="group" aria-label={d.name}>
      {a.optionen.map(([k, t]) => <label key={k}><input type="checkbox" checked={!!liste?.includes(k)} onChange={e => {
        const neu = new Set(liste ?? [])
        if (e.target.checked) neu.add(k); else neu.delete(k)
        const x = a.optionen.map(o => o[0]).filter(o => neu.has(o))
        const y = listeNeu(x, !!vor)
        if (y === null) setze(null); else uebernehmen(y)
      }} /> {t}</label>)}
      <label><input type="checkbox" checked={!!liste && !liste.length} onChange={e => (e.target.checked ? uebernehmen([]) : setze(null))} /> keines</label>
    </span>
  }
  const text = <TextEingabe d={d} wert={handOffen ? null : hand ? h.wert : vor?.wert ?? null} vorbelegt={!hand && !!vor} label={name}
    platzhalter={h.zustand === 'rechner' ? 'von Hand überschreiben' : 'offen'} setze={uebernehmen} />
  // Block: Einheit und «übernehmen» (der Knopf nimmt den Fokus, das Feld übernimmt beim Verlassen)
  if (knoepfe && (a.art === 'zahl' || a.art === 'zahlen')) return <span className="frage-antworten">{text} {a.einheit}{' '}
    <button type="button" className="zweit klein" aria-label={`${name} übernehmen`}>übernehmen</button></span>
  return text
}

/** Liste im Block «Offene Fragen»: Kästchen sammeln, «übernehmen» setzt die Liste (wie die Maske: leer heisst «keines») */
export function ListeMitKnopf({ d, name, vor, uebernehmen }: { d: FeldDef; name: string; vor: boolean; uebernehmen: (x: unknown) => boolean }) {
  const [wahl, setWahl] = useState<ReadonlySet<string>>(new Set())
  if (d.art.art !== 'liste') return null
  const optionen = d.art.optionen
  return <span className="frage-antworten bedarf-liste" role="group" aria-label={name}>
    {optionen.map(([k, t]) => <label key={k}><input type="checkbox" checked={wahl.has(k)} onChange={e => setWahl(x => {
      const n = new Set(x); if (e.target.checked) n.add(k); else n.delete(k); return n })} /> {t}</label>)}{' '}
    <button type="button" className="zweit klein" aria-label={`${name} übernehmen`}
      onClick={() => uebernehmen(listeNeu(optionen.map(o => o[0]).filter(o => wahl.has(o)), vor) ?? [])}>
      {wahl.size ? 'übernehmen' : 'keines'}</button></span>
}

/** Herkunft eines Felds: Quelle der Handeingabe (wählbar) bzw. der Vorbelegung */
function HerkunftZelle({ d, h, quelle, zurueck, offen, hinweis, bestaetigen }: { d: FeldDef; h: Herkunft; quelle: (q: Quelle) => void
  zurueck: () => void; offen: () => void; hinweis?: string
  /** Annahme der Vorbelegung als Handeingabe «bestätigt» übernehmen (Korrektur M2) */
  bestaetigen?: () => void }) {
  const zurueckKnopf = <button className="zweit klein" title={h.vorbelegt ? `Handeingabe entfernen: wieder vorbelegt (${h.vorbelegt.text})`
    : 'Handeingabe entfernen: offen'} aria-label={`${d.name}: Handeingabe entfernen`} onClick={zurueck}>zurück</button>
  if (istHandOffenH(h)) return <><span className="quelle-chip hand" title="von Hand bewusst offen gesetzt (die Vorbelegung gilt nicht)">von Hand: offen</span>{' '}
    {zurueckKnopf}</>
  if (h.zustand === 'hand') return <>
    <select className="klein" value={h.quelle ?? 'hand'} aria-label={`Quelle: ${d.name}`} title="Quelle der Handeingabe (erscheint im Befund; Annahmen und Schätzungen sind ausgewiesen)"
      onChange={e => quelle(e.target.value as Quelle)}>
      {HAND_QUELLEN.map(q => <option key={q} value={q}>{QUELLE_TEXT[q]}</option>)}
    </select>{' '}
    <span className="quelle-chip hand">von Hand</span>{' '}{zurueckKnopf}
  </>
  if (h.zustand === 'vorbelegt') return <><span className={`quelle-chip q-${h.quelle}`} title={`${d.name}: ${tooltipText(h.text)}`}>{QUELLE_TEXT[h.quelle!]}</span>
    {/* Fusswegnetz (30.10.2026): Kategorie und Abstand sichtbar neben dem Wert, nicht nur im Tooltip */}
    {herkunftSichtbar(d.pfad, h.text) && <>{' '}<span className="klein herkunft-sichtbar" title={tooltipText(h.text)}>– {herkunftSichtbar(d.pfad, h.text)}</span></>}
    {bestaetigen && h.vorbelegt && QUELLEN_BESTAETIGBAR.includes(h.quelle!) && <>{' '}<button type="button" className="zweit klein"
      title={`Annahme übernehmen: ${tooltipText(h.text)} (wird Handeingabe «bestätigt»; ein Verbot, das auf ihr beruht, gilt dann)`}
      aria-label={`${d.name}: Vorschlag bestätigen`} onClick={bestaetigen}>Vorschlag bestätigen</button></>}
    {!(d.art.art === 'bool' || d.art.art === 'wahl') && <>{' '}<button type="button" className="zweit klein"
      title="Vorbelegung verwerfen: Feld bewusst offen (von Hand)" aria-label={`${d.name}: offen setzen`} onClick={offen}>offen</button></>}</>
  if (h.zustand === 'rechner') return <span className="quelle-chip q-rechnung" title={h.text}>{QUELLE_TEXT.rechnung}</span>
  // offenes Feld mit Hinweis der Vorbelegung (z. B. Lampe in OSM, Haltestelle in der Nähe): Hinweis statt nur «offen» (Korrektur S3)
  return <span className="klein" title={hinweis && hinweis !== lesetext(hinweis) ? tooltipText(hinweis) : undefined}>{hinweis ? <>offen – {lesetext(hinweis)}</> : 'offen'}</span>
}

const ebeneZusatz = (ebene: string, grund: boolean): string => (grund ? ' (Grundprüfung)' : ebene === 'Norm' || ebene === 'Recht' ? '' : ` (${ebene})`)

/** Feldhilfe unter dem Feld: Was ist gemeint, Wozu (nur Regeln, die im Fall greifen können, höchstens WOZU_MAX, Rest aufklappbar;
 * Schalterfelder mit Ablauf-Satz), wann es zählt, Leer lassen, Vorschlag */
export function FeldHilfe({ d, h, id, kontexte, hinweis }: { d: FeldDef; h: Herkunft; id: string; kontexte: readonly SichtKontext[]
  hinweis?: string }) {
  const [alle, setAlle] = useState(false)
  const fh = FELD_HILFEN[d.pfad]
  const bed = SICHTBAR[d.pfad]
  const vor = h.vorbelegt
  const bz = bezuegeImFall(d.pfad, kontexte)
  const { sichtbar: kurz, weitere } = wozuTeilen(bz)
  const sch = schalterText(d.pfad, kontexte)
  return <div id={id} className="feld-hilfe klein">
    <p><b>Was ist gemeint:</b> {T(fh?.was)}<BegriffVerweise texte={[d.name, fh?.was]} /></p>
    <b>Wozu:</b>
    <ul>{(fh?.ablauf || sch) && <li>Ablauf: {T([fh?.ablauf, sch].filter(Boolean).join(' '))}</li>}
      {(alle ? bz : kurz).map(b => <li key={b.id}><b>{regelTitel(b.id)}</b> <span className="klein">({b.id})</span>
        {ebeneZusatz(b.ebene, b.grund)}{b.id === 'D5-4' && d.pfad !== 'sichtVorh' ? ' (über die Sichtregeln)' : ''}: {b.text} · <VerweisText text={b.quelle} /></li>)}
      {!bz.length && !fh?.ablauf && !sch && <li>In diesem Fall greift keine Prüfung mit diesem Feld.</li>}</ul>
    {weitere.length > 0 && <button type="button" className="zweit klein" aria-expanded={alle} onClick={() => setAlle(!alle)}>
      {alle ? 'weniger anzeigen' : `weitere anzeigen (${weitere.length})`}</button>}
    {bed && <p><b>Zählt nur, wenn:</b> {bedingungText(bed)}.</p>}
    <p><b>Leer lassen:</b> {T(leerText(d.pfad).replace(/^Leer: /, ''))}</p>
    {(fh?.vorschlag || vor || hinweis || h.zustand === 'rechner') && <p><b>Vorschlag der App:</b> {vor ? `hier ${wertText(d, vor.wert)} (${QUELLE_TEXT[vor.quelle]}: ${lesetext(vor.text)})` +
      (h.zustand === 'hand' ? '; von Hand überschrieben, «zurück» stellt ihn wieder her' : '') : h.zustand === 'rechner' ? `hier kein Wert; ${lesetext(h.text)}`
      : hinweis ? `hier kein Wert: ${lesetext(hinweis)}` : 'hier keiner'}
      {fh?.vorschlag ? `; allgemein ${fh.vorschlag}` : '.'}</p>}
  </div>
}

/**
 * Handeingabe setzen (Maske und Block «Offene Fragen», eine Funktion): Wert prüfen (Meldung je Feld bei ungültiger Eingabe,
 * Wertebereich wie beim Lesen der Fall-Datei) und als Handeingabe in den Fall schreiben. handQuelle: Quelle einer neuen Eingabe (die
 * bisherige; nach «Vorschlag bestätigen» wieder «von Hand»; sonst die Vorgabe des Felds)
 */
function useFeldSetzen(fall: Fall, aendern: (f: (x: Fall) => Fall) => void) {
  const [fehler, setFehler] = useState<Record<string, string>>({})
  const setze = (pfad: string, wert: unknown, quelle: Quelle, offen = false): boolean => {
    const f = offen ? null : handPruefen(pfad, wert, quelle)
    setFehler(x => { const n = { ...x }; if (f) n[pfad] = f; else delete n[pfad]; return n })
    if (f) return false
    aendern(x => {
      const b = handSetzen(x.bedarf, pfad, wert, quelle, offen)
      if (b) x.bedarf = b; else delete x.bedarf
      return x
    })
    return true
  }
  const handQuelle = (d: FeldDef): Quelle => {
    const q = fall.bedarf?.felder[d.pfad]?.wert != null ? fall.bedarf.felder[d.pfad].quelle : null
    return (q === 'bestaetigt' ? 'hand' : q) ?? d.quelle ?? 'hand'
  }
  return { setze, fehler, handQuelle }
}

/** Eingabemaske nach Blöcken; flach: alle Felder in einer offenen Tabelle mit Blocküberschriften (Grundprüfung). zaehlt: Feld wirkt
 * im Fall (Feldhilfen, SICHTBAR); die übrigen nur mit alle (gekennzeichnet) */
export function Maske({ fall, blatt, aendern, felder, flach = false, zaehlt, alle, kontexte, bedarf, bestaetig, abschnitte, ohneKoepfe = false }: {
  fall: Fall; blatt: BefundBlatt
  aendern: (f: (x: Fall) => Fall) => void; felder: FeldDef[]; flach?: boolean; zaehlt: (pfad: string) => boolean; alle: boolean
  kontexte: readonly SichtKontext[]
  /** Runde 4: wofür ein offenes Feld fehlt (Muss-Hinweis) */
  bedarf?: ReadonlyMap<string, FeldBedarf>
  /** Runde 4: Felder, deren Annahme ein Verbot offen hält («Vorschlag bestätigen» nur dort) */
  bestaetig?: ReadonlySet<string>
  /** Gliederung statt der Blöcke der Maske (erweiterte Prüfung, «Weitere Angaben»: je Thema) */
  abschnitte?: { id: string; name: string; defs: FeldDef[] }[]
  /** flach ohne Kopfzeilen (Angaben eines Themas) */
  ohneKoepfe?: boolean }) {
  const [hilfe, setHilfe] = useState<ReadonlySet<string>>(new Set())
  const umschalten = (pfad: string) => setHilfe(x => { const n = new Set(x); if (n.has(pfad)) n.delete(pfad); else n.add(pfad); return n })
  const { setze, fehler, handQuelle } = useFeldSetzen(fall, aendern)
  const herkunft = (pfad: string): Herkunft => blatt.gebildet.herkunft.get(pfad) ?? { zustand: 'offen', quelle: null, text: 'offen' }
  const zeile = (d: FeldDef, h: Herkunft) => {
    const id = `feldhilfe-${d.pfad.replace(/\./g, '-')}`, auf = hilfe.has(d.pfad)
    const offenSetzen = () => { setze(d.pfad, null, 'hand', true) }
    const offenF = h.zustand === 'offen' || istHandOffenH(h), best = !!bestaetig?.has(d.pfad) && h.zustand === 'vorbelegt'
    const bedarfText = offenF || best ? feldBedarfText(bedarf?.get(d.pfad)) : null
    const zaehltNicht = !zaehlt(d.pfad)
    return <Fragment key={d.pfad}><tr id={feldZeileId(d.pfad)} className={[offenF ? 'offen' : '', zaehltNicht ? 'zaehlt-nicht' : ''].filter(Boolean).join(' ') || undefined}>
    <td>{d.name}{zaehltNicht && <span className="klein"> (zählt in diesem Fall nicht)</span>}{' '}
      <button type="button" className="zweit klein hilfe-knopf" aria-expanded={auf} aria-controls={id} aria-label={`Erklärung: ${d.name}`}
        title="Erklärung, Regeln und Quellen" onClick={() => umschalten(d.pfad)}>?</button>
      {bedarfText && <div className="klein feld-bedarf"><span aria-hidden="true">⚑</span> {bedarfText}</div>}</td>
    <td>{h.zustand === 'rechner' && <div className="klein rechner-anzeige">{h.text}</div>}
      <FeldEingabe d={feldFuerEbenen(d, blatt.ebenen.bern)} h={h} offen={offenSetzen}
        setze={x => setze(d.pfad, x, handQuelle(d))} />
      {fehler[d.pfad] && <div className="klein fehler" role="alert">{fehler[d.pfad]}</div>}</td>
    <td><HerkunftZelle d={d} h={h} quelle={q => setze(d.pfad, fall.bedarf?.felder[d.pfad]?.wert, q)} zurueck={() => setze(d.pfad, null, 'hand')}
      offen={offenSetzen} hinweis={blatt.vorbelegt.feldHinweise?.[d.pfad]}
      bestaetigen={best ? () => { setze(d.pfad, h.vorbelegt!.wert, 'bestaetigt') } : undefined} /></td>
  </tr>
    {auf && <tr className="bedarf-hilfe"><td colSpan={3}><FeldHilfe d={d} h={h} id={id} kontexte={kontexte}
      hinweis={blatt.vorbelegt.feldHinweise?.[d.pfad]} /></td></tr>}</Fragment>
  }
  const roh = abschnitte ?? GRUPPEN.map(g => ({ id: g.id, name: g.name, defs: felder.filter(d => d.gruppe === g.id) }))
  const bloecke = roh.map(g => ({ g, defs: g.defs.filter(d => alle || zaehlt(d.pfad)) })).filter(x => x.defs.length)
  if (flach) return <table className="bedarf-maske"><tbody>{bloecke.flatMap(({ g, defs }) => [
    ...(ohneKoepfe ? [] : [<tr key={`kopf-${g.id}`} className="bedarf-block"><th colSpan={3} className="klein">{g.name}</th></tr>]),
    ...defs.map(d => zeile(d, herkunft(d.pfad))),
  ])}</tbody></table>
  return <>{bloecke.map(({ g, defs }) => {
    const hs = defs.map(d => herkunft(d.pfad))
    const n = (z: Herkunft['zustand']) => hs.filter(h => h.zustand === z).length
    return <details key={g.id} className="bedarf-gruppe">
      <summary className="klein"><b>{g.name}</b> ({n('hand')} von Hand, {n('vorbelegt') + n('rechner')} vorbelegt, {n('offen')} offen)</summary>
      <table className="bedarf-maske"><tbody>{defs.map((d, i) => zeile(d, hs[i]))}</tbody></table>
    </details>
  })}</>
}

/** Auswahl «Fusswegnetz (Bern)» beim besonderen Grund nur mit der Ebene Bern (Korrektur nach Prüfung Runde 5); ein gesetzter Wert bleibt sichtbar */
function feldFuerEbenen(d: FeldDef, bern: boolean): FeldDef {
  if (bern || d.pfad !== 'beduerfnis' || d.art.art !== 'liste') return d
  return { ...d, art: { ...d.art, optionen: d.art.optionen.filter(([k]) => k !== 'fusswegnetz') } }
}

/** Felder der Grundprüfung (oben) bzw. der erweiterten Prüfung (aufklappbar) */
const FELDER_GRUND = FELD_DEFS.filter(d => istGrundFeld(d.pfad))
const FELDER_ERWEITERT = FELD_DEFS.filter(d => !istGrundFeld(d.pfad))

const ebeneText: Record<keyof BedarfEbenen, string> = {
  bern: 'Stadt Bern (Masterplan Fussverkehr, Handbuch Lichtsignalanlagen, Standards Veloinfrastruktur)', kantonBE: 'Kanton Bern (Arbeitshilfe Fussgängerstreifen)',
  richtlinie: 'Richtlinien (bfu, Hindernisfreie Architektur): Hinweise und Soll-Punkte',
}
/** Ebenen kurz (Zeile «Welche Vorgaben gelten», Werke im Tooltip) */
const EBENE_KURZ: Record<keyof BedarfEbenen, string> = { bern: 'Stadt Bern', kantonBE: 'Kanton Bern', richtlinie: 'Richtlinien' }

/** Kennung des Aufklappers eines Themas (Sprung zum Feld öffnet ihn) */
export const themaId = (t: string): string => `thema-${t}`

/** Abschnitt im Panel (Inhalt des Reiters «Bedarf und Querungstyp», offen mit eigenem Kopf): Zusammenfassung, Typ, Grundprüfung,
 * Eingaben; aufklappbar die erweiterte Prüfung (Ebenen, je Thema Befunde, Fragen und Angaben, Masse, Annahmen). zeigen: Reiter
 * aktivieren, bevor ein Sprung zum Feld scrollt (Reiter verborgen) */
export function BedarfAbschnitt({ fall, blaetter, vorgabe, aendern, zeigen, sichtLinks, alternative = false, setAlternative, datenlage }: { fall: Fall
  blaetter: BefundBlatt[]
  vorgabe: { bern: boolean; kantonBE: boolean }; aendern: (f: (x: Fall) => Fall) => void; zeigen?: () => void
  /** Street View je Zufahrt der Streifen einer Querung (Details von ① Sichtverhältnisse) */
  sichtLinks?: (fgsIds: string[]) => SichtLink[]
  /** Trottoirüberfahrt: Alternative Fussgängerstreifen mit Fragen prüfen (Sitzung, nicht im Fall; 27.10.2026) */
  alternative?: boolean; setAlternative?: (x: boolean) => void
  /** «Datenlage hier» (Quellenregister, Datenlage.tsx) unter dem Kopf */
  datenlage?: ReactNode }) {
  // ausgeblendete Felder je Maske einblenden (Nutzertest 23.10.2026: ein Schalter je Maske, nahe bei ihr)
  const [alleGrund, setAlleGrund] = useState(false)
  const [alleErw, setAlleErw] = useState(false)
  const [sprungZiel, setSprungZiel] = useState<string | null>(null)
  // Sprung zum Feld: übergeordnete Aufklapper öffnen (auch das Thema), Zeile zeigen und die erste Eingabe fokussieren
  useEffect(() => {
    if (!sprungZiel) return
    const el = document.getElementById(feldZeileId(sprungZiel))
    const hin = (x: HTMLElement) => {
      for (let d: HTMLElement | null = x.parentElement; d; d = d.parentElement) if (d instanceof HTMLDetailsElement) d.open = true
      x.scrollIntoView({ block: 'center', behavior: 'smooth' })
      x.querySelector<HTMLElement>('input, select, button:not(.hilfe-knopf)')?.focus({ preventScroll: true })
    }
    // Reiter noch verborgen (Sprung ohne zeigen): erst den Reiter zeigen, nach dem Neuzeichnen scrollen
    if (el) { if (reiterZeigen(el)) window.setTimeout(() => hin(el), 0); else hin(el) }
    setSprungZiel(null)
  }, [sprungZiel])
  if (!blaetter.length) return null
  const b0 = blaetter[0]
  // Feld zählt, wenn es in mindestens einer Querung wirken kann (Eingaben gelten für alle Querungen)
  const kontexte: SichtKontext[] = blaetter.map(b => ({ e: b.gebildet.eingaben, ebenen: b.ebenen, alternative: b.alternative }))
  const zaehlt = (pfad: string) => kontexte.some(k => sichtbar(pfad, k))
  const bedarf = feldBedarf(blaetter), bestaetig = bestaetigungsFelder(blaetter)
  // offene Fragen der Grundprüfung über alle Querungen (je Feld einmal): steuert, ob «Eingaben der Grundprüfung» offen ist
  const grundOffenN = new Set(blaetter.flatMap(b => offeneFragen(b, bestaetig).map(f => f.feld))).size, grundOffen = grundOffenN > 0
  const ansicht = themenAnsicht(blaetter)
  const verstecktGrund = FELDER_GRUND.filter(d => !zaehlt(d.pfad))
  const verstecktErw = FELDER_ERWEITERT.filter(d => !zaehlt(d.pfad) && !ansicht.frageFelder.has(d.pfad))
  const springe = (pfad: string) => {
    zeigen?.()
    if (!zaehlt(pfad)) { if (istGrundFeld(pfad)) setAlleGrund(true); else setAlleErw(true) }
    setSprungZiel(pfad)
  }
  /** Satz und Schalter zu den ausgeblendeten Feldern einer Maske; beim Einschalten zum ersten eingeblendeten Feld */
  const ausgeblendet = (defs: FeldDef[], an: boolean, setzen: (x: boolean) => void) => {
    if (!defs.length) return null
    const hand = defs.filter(d => fall.bedarf?.felder[d.pfad]).length
    return <p className="klein feld-ausgeblendet">{defs.length === 1 ? '1 Feld zählt in diesem Fall nicht und ist ausgeblendet'
      : `${defs.length} Felder zählen in diesem Fall nicht und sind ausgeblendet`}{hand ? ` (${hand} davon mit Eingabe von Hand, sie bleiben gespeichert)` : ''}.{' '}
      <label><input type="checkbox" checked={an} onChange={e => { setzen(e.target.checked); if (e.target.checked) setSprungZiel(defs[0].pfad) }} />
        {' '}trotzdem zeigen</label></p>
  }
  // Sprung aus der Regelübersicht (Ereignis «fgs-feld», regeluebersicht.feldSpringen)
  useEffect(() => {
    const h = (e: Event) => springe((e as CustomEvent<{ pfad: string }>).detail.pfad)
    window.addEventListener('fgs-feld', h)
    return () => window.removeEventListener('fgs-feld', h)
  })
  const schalten = (k: keyof BedarfEbenen, an: boolean) => aendern(f => {
    const v = k === 'richtlinie' ? true : vorgabe[k]
    const b = ebeneSetzen(f.bedarf, k, an === v ? null : an)
    if (b) f.bedarf = b; else delete f.bedarf
    return f
  })
  const eingabe: ErwEingabe = { fall, aendern, zaehlt, alle: alleErw, kontexte, bedarf, bestaetig }
  const hatWert = (p: string) => blaetter.some(b => { const h = b.gebildet.herkunft.get(p)
    return !!h && (h.zustand === 'vorbelegt' || (h.zustand === 'hand' && h.wert !== null && h.wert !== undefined)) })
  return (
    <FeldSprung.Provider value={springe}><WertFeld.Provider value={hatWert}>
    <section className="abschnitt bedarf" aria-labelledby="bedarf-titel">
      <div className="bedarf-kopf">
        <h2 id="bedarf-titel">Bedarf und Querungstyp</h2>
        <p className="bedarf-leitfrage">Darf hier ein Fussgängerstreifen hin, und welche Querung passt?</p>
        <p className="klein bedarf-kopfzeile">{blaetter.map(b => kopfText(b)).join(' · ')}</p>
      </div>
      {datenlage}
      <p className="klein">Offene Fragen anklicken und beantworten; der Knopf «?» erklärt jedes Feld, die Hilfe den Ablauf.</p>
      {blaetter.map(b => <div key={b.gruppe}>
        {blaetter.length > 1 && <h3>{querungTitel(b)}</h3>}
        <ZusammenfassungAnzeige b={b} imBlock={blockFelder(offeneFragen(b, bestaetig))} />
        {setAlternative && istTue(b) && b === blaetter.find(istTue) && <p><button type="button" className={alternative ? 'aktiv klein' : 'zweit klein'}
          aria-pressed={alternative} title="Fragen zum Fussgängerstreifen als Alternative zeigen und zählen (nur in dieser Sitzung)"
          onClick={() => setAlternative(!alternative)}>Alternative Fussgängerstreifen prüfen</button></p>}
        <OffeneFragen b={b} fall={fall} aendern={aendern} springe={springe} bestaetig={bestaetig} />
        <TypAnzeige b={b} />
        <GrundpruefungAnzeige g={b.grund} feldHinweise={b.vorbelegt.feldHinweise} sichtLinks={sichtLinks?.(b.streifen)} />
      </div>)}
      {/* zugeklappt, sobald keine Frage der Grundprüfung mehr offen ist (Nutzerwunsch 23.10.2026); Sprünge zum Feld klappen auf.
          key: beim Wechsel offen ↔ alles beantwortet neu aufbauen, damit der Vorgabezustand gilt */}
      <details className="bedarf-grund-eingaben" key={grundOffen ? 'offen' : 'fertig'} open={grundOffen}>
        <summary><b>{b0.grund.gilt ? 'Eingaben der Grundprüfung' : 'Wichtigste Eingaben'}</b>{' '}
          <span className="klein">{grundOffen ? `(${grundOffenN} ${grundOffenN === 1 ? 'Frage' : 'Fragen'} offen)` : '(alle beantwortet)'}
          {blaetter.length > 1 ? ` · gelten für alle Querungen; vorbelegt nach ${b0.titel}` : ''}</span></summary>
        <Maske fall={fall} blatt={b0} aendern={aendern} felder={FELDER_GRUND} flach zaehlt={zaehlt} alle={alleGrund} kontexte={kontexte}
          bedarf={bedarf} bestaetig={bestaetig} />
        {ausgeblendet(verstecktGrund, alleGrund, setAlleGrund)}
      </details>
      <details className="bedarf-erweitert" open={blaetter.some(istTue) || undefined}>
        <summary><b>Erweiterte Prüfung</b> <span className="klein" title={`${LEGENDE} ${SYMBOLE}`}>{erweitertKopf(ansicht)}</span></summary>
        <div className="klein bedarf-ebenen"><span title="Bundesrecht und Normen gelten immer">Welche Vorgaben gelten:</span>{' '}
          {(['bern', 'kantonBE', 'richtlinie'] as const).map(k => <label key={k} title={`${ebeneText[k]}; ${k === 'richtlinie' ? 'Vorgabe: an' :
            `Vorgabe nach dem Ort (AV): ${vorgabe[k] ? 'an' : 'aus'}`}`}>
            <input type="checkbox" checked={b0.ebenen[k]} onChange={e => schalten(k, e.target.checked)} /> {EBENE_KURZ[k]}
            {fall.bedarf?.ebenen?.[k] !== undefined ? ' (von Hand)' : ''}</label>)}
        </div>
        {blaetter.length > 1 && <p className="klein">Angaben gelten für alle Querungen; vorbelegt nach {b0.titel}.</p>}
        <ErweiterteAnzeige blaetter={blaetter} ansicht={ansicht} eingabe={eingabe} />
        {ausgeblendet(verstecktErw, alleErw, setAlleErw)}
      </details>
    </section>
    </WertFeld.Provider></FeldSprung.Provider>
  )
}

/** Symbole der erweiterten Prüfung (Tooltip im Panel, Zeile im Bericht) */
const SYMBOLE = '✗ Muss nicht erfüllt, ! Soll nicht erfüllt, i Hinweis, ? Angabe offen.'
const zahlWort = (n: number, ein: string, mehr: string) => `${n} ${n === 1 ? ein : mehr}`
/** Kopf der erweiterten Prüfung: «48 Regeln · 1 Befund · 2 Hinweise · 5 offen» (Hinweise und offen nur, wenn es sie gibt) */
export function erweitertKopf(a: ThemenAnsicht): string {
  if (a.ohneOrtslage) return 'nicht geprüft (Ortslage fehlt)'
  const z = a.themen.reduce((s, t) => ({ befunde: s.befunde + t.zahl.muss + t.zahl.soll, hinweise: s.hinweise + t.zahl.hinweise, offen: s.offen + t.zahl.offen }),
    { befunde: 0, hinweise: 0, offen: 0 })
  return [zahlWort(a.regeln, 'Regel', 'Regeln'), zahlWort(z.befunde, 'Befund', 'Befunde'), z.hinweise ? zahlWort(z.hinweise, 'Hinweis', 'Hinweise') : '',
    z.offen ? zahlWort(z.offen, 'Angabe offen', 'Angaben offen') : ''].filter(Boolean).join(' · ')
}
/** Zählung im Kopf eines Themas: Symbol (für Sehende) und Wort (trägt die Bedeutung, auch vorgelesen), z. B. «! 1 Soll-Befund · ? 3 offen» */
export function themaZahl(t: ThemaTeil): [string, string][] {
  const z = t.zahl, aus: [string, string][] = []
  if (z.muss) aus.push(['✗', zahlWort(z.muss, 'Muss-Befund', 'Muss-Befunde')])
  if (z.soll) aus.push(['!', zahlWort(z.soll, 'Soll-Befund', 'Soll-Befunde')])
  if (z.hinweise) aus.push(['i', zahlWort(z.hinweise, 'Hinweis', 'Hinweise')])
  if (z.offen) aus.push(['?', `${z.offen} offen`])
  return aus
}

/** Kurzgrund einer Frage im Block: nur, wo die Antwort (Zulässigkeit bzw. Typ) daran hängt (Nutzerentscheid 23.10.2026) */
const frageGrund = (f: OffeneFrage): string | null => (f.entscheidend ? 'davon hängt die Antwort ab' : null)
/** Erkennungsdistanz (①): Empfehlung aus dem Soll der Grundprüfung (doppelte Sichtweite) */
function erkennungEmpfohlen(b: BefundBlatt): string {
  // erste Zahl (bei «u bis o» der untere Wert), mit Nachkommastellen
  const teile = b.grund.punkte.flatMap(p => p.teile), zahl = (t?: string) => { const m = t ? /\d+(?:,\d+)?/.exec(t) : null; return m ? Number(m[0].replace(',', '.')) : undefined }
  // Soll der Erkennungsdistanz; fehlt es (Angabe offen), das Doppelte der Sichtweite (Soll von ①)
  const e = zahl(teile.find(x => x.id === 'B5-1b')?.soll), sw = zahl(teile.find(x => x.id === 'B5-1')?.soll)
  const n = e ?? (sw !== undefined ? sw * KATALOG['B5-1b'].werte.faktor : undefined)
  const w = n === undefined ? undefined : String(Math.round(n * 10) / 10).replace('.', ',')
  return w ? ` Empfohlen: doppelte Sichtweite, hier ${w} m.` : ' Empfohlen: doppelte Sichtweite.'
}

/** Felder der Fragen im Block (Satz 3 nennt sie nicht ausgeschrieben); Zählung der Querenden mit der Schätzklasse */
const blockFelder = (fr: readonly OffeneFrage[]): string[] => fr.flatMap(f => (f.feld === 'fg5h' ? ['fg5h', 'fgKlasse'] : [f.feld]))
/** festes Zeichen des Punkts der Grundprüfung vor der Frage (wechselt nicht, wenn eine andere Frage beantwortet ist) */
const PUNKT_ZEICHEN: Partial<Record<OffeneFrage['punkte'][number], string>> = { T: 'Tempo', 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤' }

/** eine Frage der Listen (Block «Offene Fragen» und Themen der erweiterten Prüfung) */
interface FrageZeile {
  /** Feld der Maske (Eingabe bzw. Bestätigung); bei «text» das Feld der Frage (Sprung, ohne Feld nur Text) */
  ziel: string
  art: 'eingabe' | 'bestaetigen' | 'text'
  frage: string
  /** vor der Frage (Zeichen des Punkts) bzw. nach ihr (Grund, «für: …») */
  vor?: ReactNode
  nach?: ReactNode
  /** Knopf «zum Feld» (Block der Grundprüfung) */
  zumFeld?: boolean
  /** Kennung der Zeile (Thema: die Frage steht an Stelle des Felds und ist das Ziel eines Sprungs) */
  id?: string
  /** Knopf «?» mit der Feldhilfe (Thema: die Frage steht an Stelle der Zeile der Maske) */
  hilfe?: { kontexte: readonly SichtKontext[]; hinweis?: string }
  /** wofür die Angabe fehlt (⚑, wie in der Maske) */
  bedarf?: string
}

/**
 * Fragen mit Eingabe (Block «Offene Fragen» und Themen der erweiterten Prüfung, eine Komponente): je Frage die Eingabe aus derselben
 * Felddefinition und mit derselben Übernahme wie die Maske (useFeldSetzen); Querende gezählt oder geschätzt in einer Frage; vorbelegte
 * Annahmen mit Bestätigungspflicht: «Vorschlag bestätigen» bzw. «ändern». Nach einer Antwort verschwindet die Frage, der Fokus geht auf
 * die nächste.
 */
function FragenListe({ b, fall, aendern, springe, fragen, leerFokus }: { b: BefundBlatt; fall: Fall; aendern: (f: (x: Fall) => Fall) => void
  springe?: (pfad: string) => void; fragen: readonly FrageZeile[]
  /** Aufklapper, dessen Kopf den Fokus erhält, wenn die letzte Frage beantwortet ist */
  leerFokus?: string }) {
  const { setze, fehler, handQuelle } = useFeldSetzen(fall, aendern)
  const [aendernAuf, setAendernAuf] = useState<string | null>(null)
  const [fokus, setFokus] = useState(false)
  const [hilfeAuf, setHilfeAuf] = useState<string | null>(null)
  const id = useId()
  const schluessel = fragen.map(f => f.ziel).join('|')
  // nach einer Antwort: Fokus auf die erste Eingabe der nun ersten Frage
  useEffect(() => {
    if (!fokus) return
    setFokus(false)
    const el = document.getElementById(id)?.querySelector<HTMLElement>('li button:not(.hilfe-knopf), li input, li select')
      ?? (leerFokus ? document.getElementById(leerFokus)?.querySelector<HTMLElement>('summary') : null)
    el?.focus()
  }, [schluessel, fokus, id, leerFokus])
  if (!fragen.length) return null
  const herkunft = (pfad: string): Herkunft => b.gebildet.herkunft.get(pfad) ?? { zustand: 'offen', quelle: null, text: 'offen' }
  const eingabe = (pfad: string, frage: string) => {
    const d = FELD_DEF.get(pfad)!
    return <FeldEingabe d={d} h={herkunft(pfad)} knoepfe label={frage}
      setze={x => { const ok = setze(pfad, x, handQuelle(d)); if (ok) setFokus(true); return ok }}
      offen={() => { setze(pfad, null, 'hand', true); setFokus(true) }} />
  }
  return <ul id={id}>{fragen.map(f => {
    const h = herkunft(f.ziel)
    return <li key={f.ziel} id={f.id}>
      {f.vor}{f.vor ? ' ' : null}
      {f.art === 'text' ? <Frage feld={f.ziel} text={f.frage} /> : <span className="frage-text">{f.frage}</span>}{f.nach}{' '}
      {f.hilfe && <><button type="button" className="zweit klein hilfe-knopf" aria-expanded={hilfeAuf === f.ziel} aria-controls={`${id}-hilfe`}
        aria-label={`Erklärung: ${feldName(f.ziel)}`} title="Erklärung, Regeln und Quellen"
        onClick={() => setHilfeAuf(hilfeAuf === f.ziel ? null : f.ziel)}>?</button>{' '}</>}
      {f.art === 'text' ? null : f.art === 'bestaetigen' && aendernAuf !== f.ziel
        ? <span className="frage-antworten"><button type="button" className="zweit klein" aria-label={`${f.frage} Vorschlag bestätigen`}
            onClick={() => { if (setze(f.ziel, h.vorbelegt!.wert, 'bestaetigt')) setFokus(true) }}>Vorschlag bestätigen</button>{' '}
            <button type="button" className="zweit klein" aria-label={`${f.frage} ändern`} onClick={() => setAendernAuf(f.ziel)}>ändern</button></span>
        : f.ziel === 'fg5h'
          ? <span className="frage-antworten">gezählt: {eingabe('fg5h', `${f.frage} gezählt`)} oder geschätzt: {eingabe('fgKlasse', `${f.frage} geschätzt`)}</span>
          : eingabe(f.ziel, f.frage)}{' '}
      {f.zumFeld && springe && <button type="button" className="frage-knopf klein" aria-label={`zum Feld: ${feldName(f.ziel)}`} onClick={() => springe(f.ziel)}>zum Feld</button>}
      {(fehler[f.ziel] || (f.ziel === 'fg5h' && fehler.fgKlasse)) && <div className="klein fehler" role="alert">{fehler[f.ziel] ?? fehler.fgKlasse}</div>}
      {f.bedarf && <div className="klein feld-bedarf"><span aria-hidden="true">⚑</span> {f.bedarf}</div>}
      {f.hilfe && hilfeAuf === f.ziel && <FeldHilfe d={FELD_DEF.get(f.ziel)!} h={h} id={`${id}-hilfe`} kontexte={f.hilfe.kontexte} hinweis={f.hilfe.hinweis} />}
    </li>
  })}</ul>
}

/**
 * Block «Offene Fragen» (23.10.2026, ersetzt die einzelne Frage nach Anzeichen für schnelleres Fahren): unter der Zusammenfassung alle
 * offenen Fragen der Grundprüfung (Nutzerentscheid: nur Grundprüfung, ohne Nummern, mit dem festen Zeichen des Punkts), je Frage mit
 * Eingabe (FragenListe) und Knopf «zum Feld».
 */
function OffeneFragen({ b, fall, aendern, springe, bestaetig }: { b: BefundBlatt; fall: Fall; aendern: (f: (x: Fall) => Fall) => void
  springe: (pfad: string) => void; bestaetig: ReadonlySet<string> }) {
  const fragen = offeneFragen(b, bestaetig)
  if (!fragen.length) return null
  const fragen0 = zfEingabeBlatt(b).fragen
  const zeilen = fragen.map((f): FrageZeile => {
    const grund = frageGrund(f)
    return { ziel: f.ziel, art: f.art, frage: (fragen0[f.feld] ?? frageVon(f.feld)) + (f.ziel === 'erkennungM' ? erkennungEmpfohlen(b) : ''), zumFeld: true,
      vor: <span className="frage-punkt" title="Punkt der Grundprüfung">{f.punkte.map(p => PUNKT_ZEICHEN[p]).join(' ')}</span>,
      nach: grund ? <span className="klein"> ({grund})</span> : undefined }
  })
  return <div className="offene-fragen" role="region" aria-label="Offene Fragen der Grundprüfung">
    <b>Offene Fragen der Grundprüfung</b>
    <FragenListe b={b} fall={fall} aendern={aendern} springe={springe} fragen={zeilen} />
  </div>
}

/** beurteilte Anlage ist eine Trottoirüberfahrt */
export const istTue = (b: BefundBlatt): boolean => b.gebildet.eingaben.typ.wert === 'trottoirueberfahrt'

/** Kopfzeile des Aufklappers je Querung: empfohlener Typ; offene Zulässigkeit ohne Elemente (Runde 3, Korrektur) */
export function kopfText(b: BefundBlatt): string {
  const f = b.befund
  if (istTue(b)) return 'Trottoirüberfahrt beurteilt'
  const anlage = ANLAGE_NAME[b.gebildet.eingaben.typ.wert ?? '']
  if (anlage) return `${anlage} beurteilt`
  if (f.ende === 'offen') return 'noch nicht beurteilt (innerorts?)'
  if (typText(f, false) === A2_OFFEN_TEXT) return 'Begegnungszone? noch offen'
  if (f.zulaessigkeit === 'offen' && !f.ausgewertet.includes('Q3-4')) return 'Fussgängerstreifen: noch offen, ob erlaubt'
  return typText(f, false) + (f.empfehlung.vorlaeufig ? ' (vorläufig)' : '')
}
/** gewählte Anlage ohne Vortritt (Satz 1 und Kopf, Runde 5) */
const ANLAGE_NAME: Record<string, string> = { furt: 'Fussgängerfurt', ohne_vortritt: 'Querung ohne Vortritt', mehrzweck: 'Mehrzweckstreifen' }
/** Überschrift einer Querung (Titel beginnt schon mit «Querung» bzw. ist ein Streifen von Hand) */
export const querungTitel = (b: BefundBlatt): string => (b.titel.startsWith('Querung') ? b.titel
  : /^Streifen \d+( und Streifen \d+)*$/.test(b.titel) ? 'Querung, Streifen von Hand' : `Querung ${b.titel}`)

/**
 * Zusammenfassung einer Querung in drei Sätzen (Panel und Bericht): Antwort, das Wichtigste, was fehlt (Fragen springen im Panel zum
 * Feld). titel: kurzer Titel vor dem Absatz (Bericht mit mehreren Querungen); druck: Verweise auf Befundblatt und offene Angaben
 */
export function ZusammenfassungAnzeige({ b, titel, druck = false, imBlock }: { b: BefundBlatt; titel?: string; druck?: boolean
  /** Panel: Felder, deren Fragen im Block «Offene Fragen» darunter stehen (Satz 3 zählt sie nur) */
  imBlock?: readonly string[] }) {
  const x = { ...zfEingabeBlatt(b, druck ? 'bericht' : 'panel'), imBlock: druck ? [] : imBlock ?? [] }
  const z = zusammenfassung(x)
  const f = z.fehlt
  return <p className="bedarf-zusammenfassung">{titel && <b>{titel}: </b>}{z.antwort}{z.wichtig && <> {z.wichtig}</>}
    {f && <> {f.einleitung}{f.felder.map(y => <Fragment key={y}> <Frage feld={y} text={x.fragen[y]} /></Fragment>)}{f.weitere ? ` (und ${f.weitere} weitere).` : ''}
      {f.nachsatz && <> {f.nachsatz}</>}{f.block && <> {f.block}</>}</>}{z.hinweis && <> {z.hinweis}</>}</p>
}

/**
 * Empfohlener Querungstyp; Begründung mit Ziffern im Panel aufklappbar. Die fehlenden Angaben nennt die Zusammenfassung darüber
 * (Runde 3: keine Dopplung); ohneKopf: ohne die Zeile zum Typ (Runde 5: Panel und Bericht zeigen sie beide)
 */
function TypAnzeige({ b, druck = false, ohneKopf = false }: { b: BefundBlatt; druck?: boolean; ohneKopf?: boolean }) {
  const begr = <>{b.begruendung && <><VerweisText text={T(b.begruendung)} druck={druck} />.</>}</>
  const zusatz = zusatzTexte(b)
  // Panel: im Satz «normkonform; nicht erfüllt: …» springen die Namen zur Befundzeile (28.10.2026)
  const normkonform = istTue(b) ? tueNormkonformText(b) : null
  return <>
    {!ohneKopf && <p className="befund-typ">{typZeile(b)}</p>}
    {zusatz.length > 0 && <p className="klein">{zusatz.map((z, i) => <Fragment key={i}>{i ? ' ' : ''}{!druck && z === normkonform
      ? <TueNormkonform b={b} /> : z}</Fragment>)}</p>}
    {b.begruendung && (druck ? <p className="klein">{begr}</p>
      : <details className="klein bedarf-begruendung"><summary>Begründung</summary>{begr}</details>)}
  </>
}

/**
 * Zeile zum Querungstyp (Runde 5, Muster 1): «Empfohlen» nur bei geklärter Zulässigkeit; offen: «Falls zulässig: …»; gewählte Anlage
 * ohne Vortritt: «Beurteilt: …»; ohne Ortslage: «Noch keine Empfehlung …»
 */
export function typZeile(b: BefundBlatt): JSX.Element {
  const f = b.befund, t = typText(f, false)
  const anlage = ANLAGE_NAME[b.gebildet.eingaben.typ.wert ?? '']
  if (t === A2_OFFEN_TEXT || t === OHNE_ORTSLAGE_TEXT) return <><b>{t}</b> (siehe Zusammenfassung)</>
  // Trottoirüberfahrt: die Alternative nennt die Zusammenfassung (27.10.2026)
  if (istTue(b)) return <><b>Beurteilt:</b> Trottoirüberfahrt{b.gebildet.eingaben.neuanlage.wert === true ? ' (geplant)' : ''} (siehe Zusammenfassung)</>
  const fgs = f.zulaessigkeit === 'offen' ? 'ob ein Fussgängerstreifen zulässig wäre, ist noch offen'
    : f.zulaessigkeit === 'nicht_angezeigt' ? 'ein Fussgängerstreifen wäre nicht zulässig' : f.zulaessigkeit === 'mit_begruendung'
      ? 'ein Fussgängerstreifen wäre nur mit Begründung zulässig' : 'ein Fussgängerstreifen wäre ebenfalls zulässig'
  if (anlage) return <><b>Beurteilt:</b> {anlage}{b.gebildet.eingaben.neuanlage.wert === true ? ' (geplant)' : ''}; {fgs} (siehe Zusammenfassung)</>
  if (f.zulaessigkeit === 'offen') return <><b>Falls zulässig:</b> {T(t)}. Ob er zulässig ist, ist noch offen (siehe Zusammenfassung).</>
  return <><b>Empfohlen:</b> {T(t)}{f.empfehlung.vorlaeufig && <> – vorläufig, es fehlen Angaben (siehe Zusammenfassung)</>}</>
}

/**
 * Beurteilte Trottoirüberfahrt (28.10.2026): nicht erfüllte Soll-Regeln der Prüfliste ohne die Ausführung und ohne Bern (Tab. 2 und
 * Machbarkeit), in der Reihenfolge der Prüfliste; Hinweise nicht
 */
export function tueMerkmaleNichtErfuellt(b: BefundBlatt): string[] {
  const bern = (ABSCHNITTE.trottoirueberfahrt ?? []).findIndex(a => a.titel === 'Bern')
  const ids = [...new Set(b.befund.alle.filter(x => x.zustand === 'verletzt' && x.staerke === 'weich').map(x => x.id))]
    .filter(id => { const a = abschnittVon(id); return !!a && a.abschnitt !== bern && !istAusfuehrung(id) && (KATALOG as Record<string, { thema?: string }>)[id]?.thema === 'trottoirueberfahrt' })
  return nachAbschnitt(ids, x => x)
}
/** höchstens so viele nicht erfüllte Merkmale mit Namen, dann «und n weitere» */
const MERKMALE_MAX = 3
const weitereMerkmale = (n: number): string => (n === 1 ? ' (und 1 weiteres Merkmal)' : ` (und ${n} weitere Merkmale)`)
/** Satz «normkonform; nicht erfüllt: …» als Text */
function tueNormkonformText(b: BefundBlatt): string {
  const ids = tueMerkmaleNichtErfuellt(b)
  if (!ids.length) return 'Die Trottoirüberfahrt ist normkonform.'
  const n = ids.slice(0, MERKMALE_MAX).map(regelTitel), rest = ids.length - n.length
  return `Die Trottoirüberfahrt ist normkonform; nicht erfüllt: ${n.join(', ')}${rest > 0 ? weitereMerkmale(rest) : ''}.`
}
/** zur Befundzeile einer Regel im Thema springen (Aufklapper öffnen, Zeile zeigen); Kennung data-regel an der Zeile */
function befundZeigen(id: string): void {
  const el = document.querySelector<HTMLElement>(`[data-regel="${id}"]`)
  if (!el) return
  const hin = () => {
    for (let d: HTMLElement | null = el.parentElement; d; d = d.parentElement) if (d instanceof HTMLDetailsElement) d.open = true
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true })
  }
  if (reiterZeigen(el)) window.setTimeout(hin, 0); else hin()
}
/** derselbe Satz im Panel: die Namen springen zur Befundzeile */
function TueNormkonform({ b }: { b: BefundBlatt }) {
  const ids = tueMerkmaleNichtErfuellt(b)
  if (!ids.length) return <>Die Trottoirüberfahrt ist normkonform.</>
  const k = ids.slice(0, MERKMALE_MAX), rest = ids.length - k.length
  return <>Die Trottoirüberfahrt ist normkonform; nicht erfüllt: {k.map((id, i) => <Fragment key={id}>{i ? ', ' : ''}<button type="button"
    className="frage-knopf" title="zur Befundzeile im Thema Trottoirüberfahrt" onClick={e => { e.preventDefault(); e.stopPropagation(); befundZeigen(id) }}>
    {regelTitel(id)}</button></Fragment>)}{rest > 0 ? weitereMerkmale(rest) : ''}.</>
}

/** Zusätze der Empfehlung ohne Codes (Runde 5, Stellen 29, 30): Trottoirüberfahrt bzw. Querung ohne Vortritt in Worten */
export function zusatzTexte(b: BefundBlatt): string[] {
  const f = b.befund
  const felderVon = (ids: string[]) => new Set(ids.flatMap(id => f.offenFelder[id] ?? f.alle.find(x => x.id === id)?.fehlend ?? [])).size
  // beurteilte Trottoirüberfahrt (27.10.2026): die Zusätze sprechen von ihr selbst, nicht von einer zusätzlichen Prüfung neben dem
  // Fussgängerstreifen
  const tue = istTue(b)
  return f.empfehlung.zusatz.map(z => {
    let m = /^Trottoirüberfahrt: Zulässigkeit offen \((.*)\)$/.exec(z)
    if (m && tue) {
      const n = felderVon(m[1].split(', '))
      return `Für die zwingenden Punkte fehlen noch ${n === 1 ? '1 Angabe' : `${n} Angaben`} (Thema Trottoirüberfahrt der erweiterten Prüfung).`
    }
    if (m) {
      const n = felderVon(m[1].split(', '))
      return `Zusätzlich prüfen: eine Trottoirüberfahrt über die Seitenstrasse; dafür fehlen noch ${n === 1 ? '1 Angabe' : `${n} Angaben`} (Thema Trottoirüberfahrt der erweiterten Prüfung).`
    }
    m = /^Trottoirüberfahrt hier nicht zulässig wegen (.*)$/.exec(z)
    if (m) return `Eine Trottoirüberfahrt ${tue ? 'ist' : 'wäre'} hier nicht zulässig (${m[1].split(', ').map(regelTitel).join(', ')}).`
    m = /^Querung ohne Vortritt prüfen \((.*)\)$/.exec(z)
    if (m) {
      const ids = m[1].split(', ')
      const c3offen = !ids.includes('C3') && f.alle.some(x => x.id === 'C3' && x.zustand === 'offen')
      return `Zusätzlich prüfen: eine Querung ohne Vortritt, weil ${ids.map(id => (id === 'C4' ? 'wenig Fahrverkehr' : 'wenig Leute queren')).join(' und ')}` +
        `${c3offen ? '; ob auch wenig Leute queren, ist noch offen' : ''}.`
    }
    if (/^Trottoirüberfahrt \(Q3\) normkonform möglich/.test(z)) return `Zusätzlich möglich: eine Trottoirüberfahrt über die Seitenstrasse${z.includes('Merkmale nicht erfüllt') ? ' (einige Merkmale nicht erfüllt, siehe Thema Trottoirüberfahrt)' : ''}.`
    if (/^Trottoirüberfahrt normkonform/.test(z)) return tueNormkonformText(b)
    if (z === 'Trottoirüberfahrt nicht geprüft: Eingaben fehlen' && tue) return 'Für die Trottoirüberfahrt fehlen die Angaben (Thema Trottoirüberfahrt der erweiterten Prüfung).'
    if (z === 'Trottoirüberfahrt nicht geprüft: Eingaben fehlen') return 'Zusätzlich möglich: eine Trottoirüberfahrt über die Seitenstrasse; dafür fehlen die Angaben (Thema Trottoirüberfahrt der erweiterten Prüfung).'
    return `Zusätzlich: ${z}.`
  })
}

/** feste Hinweise nur in der Hilfe, nicht in den Details (Runde 5, Stelle 22: Studien ohne Wertung) */
const NUR_HILFE = ['B5-5b']
const NR: Record<GrundPunkt['nr'], string> = { T: 'Vorbedingung', 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤' }
/** Symbol, Text und Farbklasse eines Zustands (Symbol und Text, damit der Druck auch ohne Farbe lesbar bleibt) */
function zustandAnzeige(z: GrundZustand, st: string | null): [string, string, string] {
  if (z === 'erfuellt') return ['✓', 'erfüllt', 'gruen']
  if (z === 'verletzt') return st === 'weich' ? ['!', 'Soll nicht erfüllt', 'gelb'] : ['✗', 'nicht erfüllt (Muss)', 'rot']
  if (z === 'offen') return ['?', 'offen', 'grau']
  return ['i', 'Hinweis', 'blau']
}

/** Nummer einer Regel in Klammern als Verweis auf ihre Zeile in der Regelübersicht (Panel); im Bericht reiner Text */
function RegelNr({ id, druck = false }: { id: string; druck?: boolean }) {
  if (druck) return <>({id})</>
  return <a href={`#${regelAnker(id)}`} className="werk-link" title="in der Regelübersicht"
    onClick={e => { e.preventDefault(); e.stopPropagation(); regelZeigen(id) }}>({id})</a>
}
/** Knopf «Wert ändern» am Ende der Befundzeile (27.10.2026): springt zur Eingabe des Werts, auf dem der Befund beruht (nur Felder mit
 * Wert, nicht im Bericht); bei mehreren Feldern je ein Knopf mit dem Namen */
function Aendern({ id, druck = false }: { id: string; druck?: boolean }) {
  const sprung = useContext(FeldSprung), hatWert = useContext(WertFeld)
  if (druck || !sprung || !hatWert) return null
  const fs = aenderFelder(id, hatWert)
  if (!fs.length) return null
  return <span className="wert-aendern">{fs.map(p => <Fragment key={p}>{' '}<button type="button" className="zweit klein" title={`${feldName(p)}: zum Feld`}
    aria-label={`${feldName(p)} ändern`} onClick={e => { e.preventDefault(); e.stopPropagation(); sprung(p) }}>
    {fs.length === 1 ? 'Wert ändern' : `Wert ändern: ${feldName(p)}`}</button></Fragment>)}</span>
}
/** kleiner Verweis «in der Regelübersicht» hinter der Fundstelle (nicht im Bericht) */
function InUebersicht({ id, druck = false }: { id: string; druck?: boolean }) {
  if (druck) return null
  return <> · <a href={`#${regelAnker(id)}`} className="werk-link" onClick={e => { e.preventDefault(); e.stopPropagation(); regelZeigen(id) }}>
    in der Regelübersicht</a></>
}

/** Teilregel der Grundprüfung in den Details: Titel (Nummer), Zustand, Ist/Soll, Text, Fundstelle, Normhinweis */
function GrundTeilZeile({ t, notiz = false, druck = false }: { t: GrundTeil; notiz?: boolean; druck?: boolean }) {
  const [sym, txt, kl] = zustandAnzeige(t.zustand, t.staerke)
  if (notiz) return <li className="blau"><span className="grund-symbol" aria-hidden="true">i</span> {regelTitel(t.id)}{' '}
    <span className="klein"><RegelNr id={t.id} druck={druck} /></span>: {T(t.text)}<span className="klein"> · <QuelleMitVerweis id={t.id} quelle={t.quelle} druck={druck} />
      <InUebersicht id={t.id} druck={druck} /></span></li>
  const masse = [t.ist !== undefined ? `Ist ${t.ist}` : '', t.soll !== undefined ? `Soll ${t.soll}` : ''].filter(Boolean).join('; ')
  return <li className={kl}><span className="grund-symbol" aria-hidden="true">{sym}</span> {regelTitel(t.id)} <span className="klein"><RegelNr id={t.id} druck={druck} /></span>:
    {' '}{txt}{masse ? ` (${T(masse)})` : ''}
    {(t.zustand === 'verletzt' || t.zustand === 'hinweis') && <> – {T(t.text)}</>}
    {t.zustand === 'offen' && t.fehlend?.length ? <> – fehlt: {t.fehlend.map(feldName).join(', ')}</> : null}
    {t.detail && <>; {T(t.detail)}</>}
    <span className="klein"> · <QuelleMitVerweis id={t.id} quelle={t.quelle} druck={druck} /><InUebersicht id={t.id} druck={druck} /></span>
    {t.normHinweis && <div className="klein"><VerweisText text={T(t.normHinweis)} druck={druck} /></div>}</li>
}

/** Details eines Punkts der Grundprüfung: Teilregeln (Kurztitel, Nummer klein, Ist/Soll, Quelle, Normhinweis), feste Hinweise,
 * Sätze aus der Zeile (Vorbehalt, Hinweise der Vorbelegung) und Annahmen, die den Punkt betreffen */
function GrundPunktDetails({ teile, notizen = [], hinweise, annahmen, druck, links }: { teile: readonly GrundTeil[]; notizen?: readonly GrundTeil[]
  hinweise: readonly string[]; annahmen: readonly string[]; druck: boolean; links?: readonly SichtLink[] }) {
  return <ul className="grund-teile">{teile.map(t => <GrundTeilZeile key={t.id} t={t} druck={druck} />)}
    {notizen.filter(t => !NUR_HILFE.includes(t.id)).map(t => <GrundTeilZeile key={t.id} t={t} notiz druck={druck} />)}
    {hinweise.map(h => <li key={h} className="blau"><span className="grund-symbol" aria-hidden="true">i</span> {T(h)}</li>)}
    {annahmen.length > 0 && <li className="warnung">Angenommen: {T(annahmen.join('; '))}.</li>}
    {links && links.length > 0 && <li>Vor Ort ansehen: {links.map((l, i) => <Fragment key={l.url}>{i ? ' · ' : ''}<a href={l.url}
      target="_blank" rel="noopener noreferrer" title={l.titel}>Street View {l.name} ↗</a></Fragment>)}</li>}</ul>
}

/** Link auf Google Street View je Zufahrt (App: streetview.ts) */
export interface SichtLink { name: string; url: string; titel: string }

/** eine Zeile der Grundprüfung: Name, Symbol und Wort, ein Satz (mit kurzem Zusatz bzw. Fragen); am Zeilenende der Knopf ▸/▾ für
 * die Details dieses Punkts (Panel), darunter die Details (aufgeklappt bzw. im Bericht immer) */
function GrundZeileAnzeige({ z, name, thema, details, druck }: { z: GrundZeile; name: string; thema?: string; details: JSX.Element
  druck: boolean }) {
  const [auf, setAuf] = useState(false)
  const id = useId()
  const a = ZUSTAND_ANZEIGE[z.zustand]
  return <>
    {/* ganze Zeile klickbar (Nutzertest 23.10.2026); Knöpfe in der Zeile (Fragen, Details) halten den Klick selbst */}
    <tr className={`${a.klasse}${druck ? '' : ' grund-zeile-klick'}`} onClick={druck ? undefined : () => setAuf(!auf)}>
      <th scope="row">{name}{thema && <span className="klein"> ({thema})</span>}</th>
      <td className="grund-wort"><span className="grund-symbol" aria-hidden="true">{a.symbol}</span> {z.wort ?? a.wort}</td>
      <td>{T(z.satz)}{z.zusatz && <span className="klein"> ({T(z.zusatz)})</span>}
        {z.fragen.length > 0 && <>{z.satz ? ' ' : ''}→ <Fragen felder={z.fragen} /></>}</td>
      {!druck && <td className="grund-auf-zelle"><button type="button" className="grund-auf" aria-expanded={auf} aria-controls={auf ? id : undefined}
        title={auf ? 'Details ausblenden' : 'Details zu diesem Punkt'} aria-label={`Details zu ${name}`}
        onClick={e => { e.stopPropagation(); setAuf(!auf) }}>Details <span aria-hidden="true">{auf ? '▴' : '▾'}</span></button></td>}
    </tr>
    {(druck || auf) && <tr className={`grund-detail rand-${a.klasse}`} id={id}><td colSpan={druck ? 3 : 4} className="klein">{details}</td></tr>}
  </>
}

/** Kasten «Grundprüfung bfu (Big Five)» einer Querung (Panel und Bericht): eine Zeile je Punkt, Details je Punkt aufklappbar (im
 * Bericht direkt unter der Zeile); Quelle, Legende und Annahmen ohne Punkt einmal klein darunter */
export function GrundpruefungAnzeige({ g: g0, titel, druck = false, feldHinweise, sichtLinks, ohneAnnahme }: { g: Grundpruefung; titel?: string
  druck?: boolean; feldHinweise?: Readonly<Record<string, string>>
  /** Annahmen, die anderswo stehen (Bericht: in der Tabelle «Eingaben und Quellen»), nicht nennen */
  ohneAnnahme?: (a: string) => boolean
  /** Street View je Zufahrt (Panel: in den Details von ①; nicht im Bericht) */
  sichtLinks?: readonly SichtLink[] }) {
  const g = ohneAnnahme ? { ...g0, annahmen: g0.annahmen.filter(a => !ohneAnnahme(a)) } : g0
  const kopfText = `Grundprüfung bfu (Big Five)${titel ? `: ${titel}` : ''}`
  const quelle = <>Nach <WerkVerweis w="BFU" anzeige={LESENAME.BFU} druck={druck} />, Ziffer 2.1–2.3{druck ? '' : <WerkLinks w="BFU" kurz />}</>
  if (!g.gilt) return <div className={druck ? 'grundpruefung druck' : 'grundpruefung'}>
    <div className="grund-kopf"><b>{kopfText}</b></div><p className="klein">{T(g.grund)}
      {/* Nutzerentscheid 23.10.2026: Begegnungszone bei Tempo 20 nur vorgeschlagen, von Hand auf Strecke änderbar */}
      {g.zoneVorschlag && !druck && <>{' '}<Frage feld="tempoRegime" text="Falls Strecke: unter «Strecke oder Zone» ändern" /></>}</p>
      <p className="klein grund-fuss">{quelle}.</p></div>
  const k = grundKopf(g, feldHinweise ?? {})
  const an = annahmenJePunkt(g, feldName, FELD_DEFS.map(d => d.pfad))
  return (
    <div className={druck ? 'grundpruefung druck' : 'grundpruefung'}>
      <div className="grund-kopf"><b>{kopfText}</b> <span className="grund-zaehlung">{k.zaehlung}</span></div>
      <table className="grund-tabelle"><tbody>
        {g.punkte.map((p, i) => <GrundZeileAnzeige key={p.nr} z={k.zeilen[i]} druck={druck} name={p.nr === 'T' ? 'Tempo' : `${NR[p.nr]} ${p.titel}`}
          thema={p.nr !== 'T' && themaName(p.thema) !== p.titel ? themaName(p.thema) : undefined}
          details={<GrundPunktDetails teile={p.teile} notizen={p.notizen} hinweise={k.zeilen[i].hinweise} annahmen={an.je.get(p.nr) ?? []}
            druck={druck} links={p.nr === '1' && !druck ? sichtLinks : undefined} />} />)}
        {k.weitere && <GrundZeileAnzeige z={k.weitere} name="Ergänzend (bfu)" druck={druck}
          details={<GrundPunktDetails teile={g.weitere} hinweise={[]} annahmen={an.je.get('W') ?? []} druck={druck} />} />}
      </tbody></table>
      {an.allgemein.length > 0 && <p className="klein warnung">Angenommen: {T(an.allgemein.join('; '))}.</p>}
      <p className="klein grund-fuss">{quelle}; unabhängig von den Ebenen. ✓ erfüllt, ✗ Muss nicht erfüllt, ! Soll nicht erfüllt,
        ? offen (Angabe fehlt), i Hinweis.{druck ? '' : ' Details je Punkt mit «Details».'}</p>
    </div>
  )
}

/** Texte eines Eintrags, in denen Begriffe erkannt werden (Satz, Detail, Normhinweis) */
const eintragTexte = (x: Eintrag): (string | undefined)[] => [eintragSatz(x), x.detail, x.normHinweis]

/** Symbol und Farbklasse eines Eintrags (Symbol und Verbindlichkeitswort tragen die Bedeutung, Farbe nur zusätzlich) */
function eintragStil(x: Eintrag): [string, string] {
  if (x.zustand === 'offen') return ['?', 'grau']
  return x.staerke === 'weich' ? ['!', 'gelb'] : x.staerke === 'hinweis' ? ['i', 'blau'] : ['✗', 'rot']
}

/** Eintrag der erweiterten Prüfung in einer Zeile: Symbol · Kurztitel · Verbindlichkeit · ein Satz bzw. Frage(n); Nummer, Quelle,
 * Detail und Normhinweis hinter «Details» (Bericht: kleine zweite Zeile). mitDetail: Detail in der Zeile (gleiche Regel mehrfach) */
function EintragZeile({ x, druck, mitDetail, begriffe }: { x: Eintrag; druck: boolean; mitDetail: boolean
  /** Begriffe, die dieser Eintrag erklärt (erste Nennung im Blatt) */
  begriffe?: readonly string[] }) {
  const [sym, kl] = eintragStil(x)
  const offen = x.zustand === 'offen'
  const zeile = <><span className="grund-symbol" aria-hidden="true">{sym}</span> <b>{regelTitel(x.id)}</b> · <i>{verbindlichkeitVon(x)}</i> ·{' '}
    {offen ? <>{x.fehlend?.length ? <Fragen felder={x.fehlend} regel={x.id} /> : 'Angabe fehlt'}{istSoll(x) ? ` (${T(istSoll(x))})` : ''}</> : T(eintragSatz(x))}
    {mitDetail && x.detail ? <> ({T(x.detail)})</> : null}</>
  const det = <span className="klein">{regelTitel(x.id)} <RegelNr id={x.id} druck={druck} /> · <QuelleMitVerweis id={x.id} quelle={x.quelle} druck={druck} />
    <InUebersicht id={x.id} druck={druck} />
    {x.detail && !mitDetail ? <> · {T(x.detail)}</> : null}{x.normHinweis ? <> · <VerweisText text={T(x.normHinweis)} druck={druck} /></> : null}
    {!druck && <BegriffVerweise texte={eintragTexte(x)} nur={begriffe} />}{!offen && <Aendern id={x.id} druck={druck} />}</span>
  if (druck) return <li className={kl}>{zeile}<div>{det}</div></li>
  // Trottoirüberfahrt (28.10.2026): Sprungziel aus der Zusammenfassung («nicht erfüllt: …»); andere Regeln ohne Kennung
  return <li className={kl} {...(/^(Q3|F5)/.test(x.id) ? { 'data-regel': x.id } : {})}><details className="eintrag-details"><summary>{zeile}</summary>{det}</details></li>
}

/** Eingaben der erweiterten Prüfung im Panel (ohne: Bericht bzw. reine Anzeige) */
interface ErwEingabe {
  fall: Fall; aendern: (f: (x: Fall) => Fall) => void; zaehlt: (pfad: string) => boolean; alle: boolean; kontexte: readonly SichtKontext[]
  bedarf: ReadonlyMap<string, FeldBedarf>; bestaetig: ReadonlySet<string>
}

/** Begriffe je Anzeige nur einmal erklären: beim ersten Eintrag (Anzeigereihenfolge), der sie nennt */
function begriffeJeEintrag(xs: readonly Eintrag[]): Map<Eintrag, string[]> {
  const gesehen = new Set<string>(), aus = new Map<Eintrag, string[]>()
  for (const x of xs) {
    const neu = begriffeIn(eintragTexte(x).filter(Boolean).join('\n')).map(b => b.id).filter(id => !gesehen.has(id))
    neu.forEach(id => gesehen.add(id))
    aus.set(x, neu)
  }
  return aus
}

/** Regeln als Kurztitel, die Nummern im Tooltip */
const Titel = ({ ids }: { ids: readonly string[] }) => <span title={ids.join(', ')}>{ids.map(regelTitel).join(', ')}</span>
/** wofür eine Frage steht (klein hinter der Frage) */
const Fuer = ({ regeln }: { regeln: readonly string[] }) => <span className="klein frage-fuer"> – für: <Titel ids={regeln} /></span>

/** Text einer Frage im Thema: «Bitte bestätigen: …» bei einer vorgeschlagenen Annahme, sonst die Frage zum Feld */
function frageText(f: ThemaFrage, blaetter: readonly BefundBlatt[]): string {
  if (f.bestaetigen) for (const b of blaetter) { const t = zfEingabeBlatt(b).fragen[f.feld]; if (t) return t }
  return frageVon(f.feld)
}

/** Frage eines Themas für die FragenListe: Eingabe an Stelle des Felds (Kennung der Feldzeile, Sprungziel); Objekt bzw. Hinweis als Text */
function themaFrageZeile(f: ThemaFrage, blaetter: readonly BefundBlatt[], eingabe: ErwEingabe): FrageZeile {
  const ziel = f.eingabe ? f.ziel! : f.feld
  const b0 = blaetter[0], h = b0.gebildet.herkunft.get(ziel)
  const best = f.bestaetigen && h?.zustand === 'vorbelegt' && !!h.quelle && QUELLEN_BESTAETIGBAR.includes(h.quelle)
  return { ziel, art: !f.eingabe ? 'text' : best ? 'bestaetigen' : 'eingabe', frage: frageText(f, blaetter), nach: <Fuer regeln={f.regeln} />,
    ...(f.eingabe ? { id: feldZeileId(ziel), hilfe: { kontexte: eingabe.kontexte, hinweis: b0.vorbelegt.feldHinweise?.[ziel] },
      bedarf: feldBedarfText(eingabe.bedarf.get(ziel)) ?? undefined } : {}) }
}

/** Regeln als aufklappbare Liste der Kurztitel, je mit Verweis in die Regelübersicht (auch auf Touch); im Bericht nur die Zahl */
function RegelListe({ ids, kopf, druck, gruende }: { ids: readonly string[]; kopf: ReactNode; druck: boolean
  /** erfüllt-Grund je Regel (ohne Befund geprüfte Regeln, 30.10.2026) */
  gruende?: Readonly<Record<string, string>> }) {
  if (druck) return <>{kopf}</>
  return <details className="klein thema-ohne"><summary>{kopf}</summary>
    <ul>{ids.map(id => <li key={id}><a href={`#${regelAnker(id)}`} className="werk-link" title="in der Regelübersicht"
      onClick={e => { e.preventDefault(); e.stopPropagation(); regelZeigen(id) }}>{regelTitel(id)}</a>{gruende?.[id]
      ? T(`: ohne Befund – ${gruende[id]}`) : null}</li>)}</ul></details>
}
/** Text eines Felds im Verweis: Name des Felds bzw. die Frage (Objekt, Hinweis) */
const verweisText = (feld: string): string => (FELD_DEF.has(feld) ? feldName(feld) : frageVon(feld))

/** die fünf Voraussetzungen der Kurvenregel (Felder der Maske) */
const KURVE_FELDER: readonly string[] = ['kurve.radiusStrasse', ...KURVE_BEDINGUNGEN.map(u => `kurve.${u}`)]
/**
 * Kurvenregel (VSS 40 241 Z. 14, S. 7; 29.10.2026): die fünf Voraussetzungen mit Wert und Herkunft, im Panel als Eingaben (offene
 * zählen als Fragen des Themas), im Bericht als Liste; darunter, ob die Regel gilt
 */
function KurvenregelBlock({ b, druck, eingabe }: { b: BefundBlatt; druck: boolean; eingabe?: ErwEingabe }) {
  const k = b.gebildet.eingaben.kurve.wert
  const stand = (k?.radiusStrasse ?? 0) < 20 ? 'Radius unter 20 m: kein Wert nach Tab. 2, Sicht nach dem Tempo'
    : k?.fuenfBedingungen ? 'gilt: Sicht nach dem Kurvenradius' : k?.vorschlag ? 'möglich, aber mit Annahmen: bitte bestätigen'
    : KURVE_BEDINGUNGEN.some(u => k?.[u] === false) ? 'gilt nicht: Sicht nach dem Tempo' : 'noch offen: Sicht nach dem Tempo, bis alle fünf ja sind'
  const kopf = <div className="thema-abschnitt"><b>{T('Kurvenregel (VSS 40 241 Z. 14, S. 7)')}</b> <span className="klein">– {T(stand)}</span></div>
  if (eingabe && !druck) return <div className="thema-teil kurvenregel">{kopf}
    <Maske fall={eingabe.fall} blatt={b} aendern={eingabe.aendern} felder={KURVE_FELDER.map(p => FELD_DEF.get(p)!)} flach ohneKoepfe
      zaehlt={eingabe.zaehlt} alle={eingabe.alle} kontexte={eingabe.kontexte} bedarf={eingabe.bedarf} bestaetig={eingabe.bestaetig} /></div>
  return <div className="thema-teil kurvenregel">{kopf}<ul className="klein">{KURVE_FELDER.map(p => {
    const h = b.gebildet.herkunft.get(p), w = h?.zustand === 'hand' ? h.wert : h?.zustand === 'vorbelegt' ? h.vorbelegt?.wert : null
    return <li key={p}>{frageVon(p)} {w === true ? 'ja' : w === false ? 'nein' : typeof w === 'number' ? `${String(w).replace('.', ',')} m` : 'offen'}{h && h.zustand !== 'offen' && h.zustand !== 'rechner'
      ? ` (${h.zustand === 'hand' ? 'von Hand' : `${QUELLE_TEXT[h.quelle!]}: ${lesetext(h.text)}`})` : ''}</li>
  })}</ul></div>
}

/** Kopf eines Themas: Name und Zählung in Symbol und Wort */
function ThemaZahl({ t }: { t: ThemaTeil }) {
  return <span className="klein thema-zahl">{themaZahl(t).map(([s, w], i) => <Fragment key={s}>{i ? ' · ' : ''}<span className="grund-symbol"
    aria-hidden="true">{s}</span> {w}</Fragment>)}</span>
}

/** Aufklapper (Panel) bzw. offener Teil (Bericht) der erweiterten Prüfung; offen: nur beim ersten Zeichnen (klappt nicht zu, wenn
 * eine Antwort den Befund behebt) */
function ErwTeil({ titel, zahl, druck, offen: offen0 = false, id, umfang, children }: { titel: string; zahl?: ReactNode; druck: boolean
  offen?: boolean; id?: string; umfang?: string; children: ReactNode }) {
  const [offen] = useState(offen0)
  if (druck) return <div className="befund-thema"><div className="thema-kopf"><b>{titel}</b>{zahl && <> {zahl}</>}</div>{children}</div>
  return <details className="befund-thema bedarf-thema" id={id} open={offen || undefined}>
    <summary title={umfang}><b>{titel}</b>{zahl && <> {zahl}</>}</summary>{children}</details>
}

/**
 * Ein Thema: Befunde (eine Zeile je Eintrag, Details aufklappbar), offene Angaben als Fragen (Panel mit Eingabe, Bericht als Liste
 * «Noch offen»), Verweis auf offene Felder der Grundprüfung, ohne Angaben nicht geprüfte Regeln, ohne Befund geprüfte Regeln (nur
 * Panel) und die übrigen Felder des Themas (Panel, zugeklappt). Themen mit Befund ✗ bzw. ! sind offen.
 */
function ThemaAnzeige({ t, blaetter, druck, eingabe, begriffe }: { t: ThemaTeil; blaetter: readonly BefundBlatt[]; druck: boolean
  eingabe?: ErwEingabe; begriffe: ReadonlyMap<Eintrag, string[]> }) {
  const b0 = blaetter[0], mehrere = blaetter.length > 1
  // Kurvenregel (29.10.2026): die fünf Voraussetzungen im Thema Sicht als eigener Block (nur mit Kurve), nicht unter «Alle Angaben»
  const kurveBlock = t.thema.id === 'sicht' && blaetter.some(b => (b.gebildet.eingaben.kurve.wert?.radiusStrasse ?? null) !== null)
  const felder = eingabe ? t.felder.filter(p => (eingabe.alle || eingabe.zaehlt(p)) && !(kurveBlock && KURVE_FELDER.includes(p)))
    .map(p => FELD_DEF.get(p)!) : []
  // beurteilte Trottoirüberfahrt: ihr Thema ist die Prüfung, offen (27.10.2026)
  const tue = t.thema.id === 'trottoirueberfahrt' && blaetter.some(b => b.gebildet.eingaben.typ.wert === 'trottoirueberfahrt')
  // beurteilte Trottoirüberfahrt (27.10.2026): von der App vorbelegte Angaben sichtbar im Thema (prüfen, bei Bedarf ändern), nicht in
  // «Alle Angaben» versteckt
  const vorbelegt = (p: string) => tue && blaetter.some(b => b.gebildet.herkunft.get(p)?.zustand === 'vorbelegt')
  const felderVor = felder.filter(d => vorbelegt(d.pfad)), felderRest = felder.filter(d => !vorbelegt(d.pfad))
  // Gliederung nach der Prüfliste der Norm (themen.ABSCHNITTE): Überschriften mit Tabelle und Seite
  const glied = themaGliederung(t)
  const eintraegeListe = (es: ThemaTeil['eintraege']) => es.map(({ b, xs }) => {
    const n = new Map<string, number>()
    for (const x of xs) n.set(x.id, (n.get(x.id) ?? 0) + 1)
    return <Fragment key={b.gruppe}>{mehrere && <div className="klein thema-querung">{querungTitel(b)}</div>}
      <ul>{xs.map((x, i) => <EintragZeile key={x.id + i} x={x} druck={druck} mitDetail={(n.get(x.id) ?? 0) > 1} begriffe={begriffe.get(x)} />)}</ul></Fragment>
  })
  const fragenListe = (fs: ThemaFrage[], kopf = 'Noch offen:') => fs.length > 0 && <div className="thema-fragen">{eingabe
    ? <FragenListe b={b0} fall={eingabe.fall} aendern={eingabe.aendern} fragen={fs.map(f => themaFrageZeile(f, blaetter, eingabe))}
      leerFokus={themaId(t.thema.id)} />
    : <><span className="klein">{kopf}</span><ul>{fs.map(f => <li key={f.feld}><Frage feld={f.feld} text={frageText(f, blaetter)} />
      <Fuer regeln={f.regeln} /></li>)}</ul></>}</div>
  const verweisZeilen = (vs0: ThemaTeil['verweise']) => (['grund', ...THEMEN.map(x => x.id)] as const).map(wo => {
    const vs = vs0.filter(v => v.wo === wo)
    if (!vs.length) return null
    return <p key={wo} className="klein thema-verweis">siehe {wo === 'grund' ? (tue ? 'oben' : 'Grundprüfung') : `«${themaName(wo)}»`}: {vs.map((v, i) =>
      <Fragment key={v.feld}>{i ? '; ' : ''}<Frage feld={v.feld} text={verweisText(v.feld)} />{v.regeln.length === 1 && v.regeln[0] === 'A1'
        ? ' – davon hängt ab, ob fgsCheck überhaupt beurteilt (nur innerorts)' : <Fuer regeln={v.regeln} />}</Fragment>)}</p>
  })
  let abschnitt = ''
  return <ErwTeil titel={t.thema.name} zahl={<ThemaZahl t={t} />} druck={druck} offen={t.zahl.muss + t.zahl.soll > 0 || tue} id={themaId(t.thema.id)}
    umfang={t.thema.umfang}>
    {glied ? glied.map((g, i) => {
      const neu = g.abschnitt !== abschnitt
      abschnitt = g.abschnitt
      // Ausführung (27.10.2026): im Panel eingeklappt, Fragen zählen nicht; im Bericht unter derselben Überschrift
      if (g.ausfuehrung) {
        const inhalt = <>{eintraegeListe(g.eintraege)}{fragenListe(g.fragen, 'Erst bei der Umsetzung zu klären:')}{verweisZeilen(g.verweise)}</>
        const n = g.fragen.length
        return druck ? <div key={i} className="thema-teil">{neu && <div className="thema-abschnitt"><b>{T(g.abschnitt)}</b></div>}{inhalt}</div>
          : <details key={i} className="thema-teil thema-ausfuehrung"><summary><b>{T(g.abschnitt)}</b>
            {n > 0 && <span className="klein"> – {n === 1 ? '1 Frage' : `${n} Fragen`} offen, nicht gezählt</span>}</summary>{inhalt}</details>
      }
      return <div key={i} className="thema-teil">
        {neu && g.abschnitt && <div className="thema-abschnitt"><b>{T(g.abschnitt)}</b></div>}
        {g.unter && <div className="klein thema-unter"><i>{g.unter}</i></div>}
        {eintraegeListe(g.eintraege)}{fragenListe(g.fragen)}{verweisZeilen(g.verweise)}
      </div>
    }) : <>{eintraegeListe(t.eintraege)}{fragenListe(kurveBlock && eingabe ? t.fragen.filter(f => !KURVE_FELDER.includes(f.ziel ?? '')) : t.fragen)}</>}
    {kurveBlock && <KurvenregelBlock b={b0} druck={druck} eingabe={eingabe} />}
    {t.bloecke.map(x => <div key={x.block} className="klein thema-block"><span className="grund-symbol" aria-hidden="true">?</span> Nicht geprüft:
      {' '}{x.text} {!druck && <><Frage feld={x.ziel} text="Angaben eingeben" />{' '}</>}
      <RegelListe ids={x.regeln} druck={druck} kopf={`(${zahlWort(x.regeln.length, 'Regel', 'Regeln')})`} /></div>)}
    {t.ohneAngaben.length > 0 && <p className="klein">Angabe fehlt: <Titel ids={t.ohneAngaben} /></p>}
    {!glied && verweisZeilen(t.verweise)}
    {t.ohneBefund.length > 0 && (() => {
      const kopf = <><span className="grund-symbol" aria-hidden="true">✓</span> {zahlWort(t.ohneBefund.length, 'Regel', 'Regeln')} ohne Befund</>
      // Bericht: die Regeln mit erfüllt-Grund als eigene Zeile (30.10.2026), die übrigen nur gezählt
      const mitGrund = t.ohneBefund.filter(id => t.erfuelltGrund[id])
      return druck ? <><p className="klein">{kopf}</p>{mitGrund.length > 0 && <ul className="klein">{mitGrund.map(id =>
        <li key={id}>{T(ohneBefundZeile(regelTitel(id), t.erfuelltGrund[id]))}</li>)}</ul>}</>
        : <RegelListe ids={t.ohneBefund} druck={false} kopf={kopf} gruende={t.erfuelltGrund} />
    })()}
    {eingabe && felderVor.length > 0 && <div className="thema-vorbelegt"><p className="klein">Von der App vorbelegt (prüfen; ein anderer Wert
      gilt als Eingabe von Hand):</p>
      <Maske fall={eingabe.fall} blatt={b0} aendern={eingabe.aendern} felder={felderVor} flach ohneKoepfe zaehlt={eingabe.zaehlt} alle={eingabe.alle}
        kontexte={eingabe.kontexte} bedarf={eingabe.bedarf} bestaetig={eingabe.bestaetig} /></div>}
    {eingabe && felderRest.length > 0 && <details className="thema-angaben"><summary className="klein">{felderVor.length ? 'Weitere Angaben' : 'Alle Angaben'} ({felderRest.length})</summary>
      <Maske fall={eingabe.fall} blatt={b0} aendern={eingabe.aendern} felder={felderRest} flach ohneKoepfe zaehlt={eingabe.zaehlt} alle={eingabe.alle}
        kontexte={eingabe.kontexte} bedarf={eingabe.bedarf} bestaetig={eingabe.bestaetig} /></details>}
  </ErwTeil>
}

/** Stand einer Masse-Zeile (Runde 5, Muster 3: Ausnahmen und Vorbehalte beim Wert) */
const MASS_STAND: Record<MassZeile['zustand'], (m: MassZeile) => JSX.Element | string> = {
  verletzt: () => 'nicht erfüllt', offen: () => 'offen', erfuellt: () => 'erfüllt', annahme: () => 'erfüllt (Annahme)',
  vorbehalt: () => 'erfüllt unter Vorbehalt', ausnahme: m => m.zusatz ?? 'zulässig (Ausnahme)',
  nicht_anwendbar: () => <><span className="grund-symbol" aria-hidden="true">i</span> nicht anwendbar</>,
}
/** Masse mit bekanntem Wert (Ist offen: steht als Frage im Thema) */
const masseZeilen = (b: BefundBlatt): MassZeile[] => b.befund.masse.filter(mz => !(mz.zustand === 'offen' && mz.ist === '–'))

function MasseTabelle({ b, druck }: { b: BefundBlatt; druck: boolean }) {
  return <table className={druck ? 'bericht-tabelle befund-masse' : 'befund-masse'}>
    <thead><tr><th>Mass</th><th>Soll</th><th>Ist</th><th>Stand</th></tr></thead>
    <tbody>{masseZeilen(b).map(mz => <tr key={mz.groesse} className={mz.zustand}>
      <td>{mz.groesse}<div className="klein">{mz.regeln.map(regelName).join(', ')}</div></td>
      <td>{mz.soll ? T(mitEinheit(mz.soll, mz.einheit)) : '–'}</td>
      <td>{T(mitEinheit(mz.ist, mz.einheit))}{mz.zusatz && mz.zustand === 'vorbehalt' ? <div className="klein">{mz.zusatz}</div> : null}</td>
      <td>{MASS_STAND[mz.zustand](mz)}</td></tr>)}</tbody>
  </table>
}

/** Annahme des Befunds, die die Grundprüfung schon nennt (gleicher Text; fehlende V85 heisst dort «Tempo wie signalisiert») */
export const annahmeInGrund = (b: BefundBlatt, a: string): boolean => b.grund.gilt &&
  (b.grund.annahmen.includes(a) || (/^V85 fehlt:/.test(a) && b.grund.annahmen.includes(ANNAHME_V85)))
/** Annahme zu einem Feld, das die Tabelle «Eingaben und Quellen» des Berichts als Annahme mit Grund führt */
export const annahmeInTabelle = (b: BefundBlatt, a: string): boolean => eingabenTabelle(b).some(z => z.annahme && a.startsWith(`${z.feld}:`))

/** Annahmen und Hinweise einer Querung als Liste: Sicht des Sichtrechners, Annahmen, Hinweise der Vorbelegung, Ablauf, nicht geprüft */
function annahmenPunkte(b: BefundBlatt, ablauf: readonly Eintrag[], druck: boolean, begriffe: ReadonlyMap<Eintrag, string[]>): JSX.Element[] {
  const aus: JSX.Element[] = []
  if (b.sicht.length) aus.push(<li key="sicht">Sicht (Sichtrechner, <VerweisText druck={druck}
    text={b.sicht[0].regel === 'E3' ? fundstelleText({ werk: '40240', ziffer: 'Z. 8.2' }) : fundstelleText({ werk: '40241', ziffer: 'Tab. 1' })} />):
    <ul>{b.sicht.map((x, i) => <li key={i}>{`${x.name} ${x.frei ? (x.bisM !== undefined ? `frei bis ${x.bisM} m, darüber nicht geprüft` : 'frei') : x.status} ` +
      `(Soll ${String(x.soll).replace('.', ',')} m)`}</li>)}</ul></li>)
  if (b.sichtVonHand) aus.push(<li key="sichthand">{T('Sicht: vorhandene Sichtweite von Hand eingegeben (Regeln H1 bzw. E3 statt Sichtrechner).')}</li>)
  // Annahmen nur einmal: im Panel ohne die der Grundprüfung, im Bericht auch ohne die der Tabelle «Eingaben und Quellen»
  const annahmen = b.annahmen.filter(a => !annahmeInGrund(b, a) && !(druck && annahmeInTabelle(b, a)))
  if (annahmen.length) aus.push(<li key="annahmen" className="warnung">Angenommen bzw. geschätzt:<ul>{annahmen.map(a => <li key={a}>{T(a)}</li>)}</ul></li>)
  for (const h of b.hinweise) aus.push(<li key={`h-${h}`}>{T(h)}</li>)
  if (ablauf.length) aus.push(<li key="ablauf">Zum Ablauf (nicht gezählt):<ul className="befund-thema">{ablauf.map((x, i) => <EintragZeile key={x.id + i} x={x}
    druck={druck} mitDetail={false} begriffe={begriffe.get(x)} />)}</ul></li>)
  const u = pruefUebersicht(b.befund, { ebenen: b.ebenen, typ: b.gebildet.eingaben.typ.wert })
  const g = b.gestrichen ?? 0
  const ebenen: Ebene[] = ['Recht', 'Norm', ...(b.ebenen.richtlinie ? ['Richtlinie' as const] : []), ...(b.ebenen.bern ? ['Bern' as const] : []),
    ...(b.ebenen.kantonBE ? ['Kanton BE' as const] : [])]
  // ungeprüfte Blöcke (Trottoirüberfahrt, LSA-Zeiten) stehen schon im Thema
  const gruende = u.gruende.filter(x => !BLOCK_GRUENDE.includes(x.grund)), ng = gruende.reduce((n, x) => n + x.n, 0)
  const pruef = [ng > 0 ? `Nicht geprüft: ${zahlWort(ng, 'Regel', 'Regeln')} (${gruende.map(x => `${x.grund} ${x.n}`).join(', ')}).` : '',
    g > 0 ? `${g} ${g === 1 ? 'Zufahrt' : 'Zufahrten'} von Hand gestrichen (nicht geprüft).` : '',
    druck ? `Ebenen: ${ebenen.map(e => EBENE_WORT[e]).join(', ')}.` : ''].filter(Boolean).join(' ')
  if (pruef) aus.push(<li key="pruef">{pruef}</li>)
  return aus
}

/**
 * Inhalt der erweiterten Prüfung (Panel und Bericht): je Thema mit Befund, Frage, Verweis oder ungeprüfter Regel ein Teil; die Themen
 * ohne das in einer Zeile «Ohne Befund»; im Panel «Weitere Angaben» (Felder dieser Themen bzw. ohne Thema); am Ende Masse (Soll und
 * Ist) und Annahmen und Hinweise. Jedes Feld der erweiterten Prüfung steht im Panel genau einmal (Frage oder Angabe).
 */
function ErweiterteAnzeige({ blaetter, ansicht, druck = false, eingabe }: { blaetter: readonly BefundBlatt[]; ansicht: ThemenAnsicht
  druck?: boolean; eingabe?: ErwEingabe }) {
  const mehrere = blaetter.length > 1
  // Panel (29.10.2026): jedes geprüfte Thema als eigene Zeile, auch ohne Befund (eingeklappt); der Bericht bleibt knapp
  const einzeln = !!eingabe && !druck
  // nicht geprüfte Themen (29.10.2026): eigene graue Zeile mit dem Grund (z. B. Baum endet in der Begegnungszone)
  const uebersicht = einzeln ? pruefUebersicht(blaetter[0].befund, { ebenen: blaetter[0].ebenen, typ: blaetter[0].gebildet.eingaben.typ.wert }) : null
  const ngZeile = (t: ThemaTeil) => uebersicht?.themen.find(x => x.thema.id === t.thema.id)
  const nichtGeprueft = (t: ThemaTeil) => einzeln && !hatInhalt(t) && t.geprueft === 0 && (ngZeile(t)?.nichtGeprueft ?? 0) > 0
  const themen = ansicht.themen.filter(t => hatInhalt(t) || (einzeln && t.geprueft > 0) || nichtGeprueft(t))
  const ohne = einzeln ? [] : ansicht.themen.filter(t => !hatInhalt(t) && t.geprueft > 0)
  const begriffe = begriffeJeEintrag([...themen.flatMap(t => t.eintraege.flatMap(e => e.xs)), ...ansicht.ablauf.flatMap(a => a.xs)])
  const weitere = eingabe ? [...ansicht.themen.filter(t => !hatInhalt(t) && !(einzeln && t.geprueft > 0) && !nichtGeprueft(t))
    .map(t => ({ id: t.thema.id, name: t.thema.name, defs: t.felder })),
    { id: 'ohne', name: 'Ohne Thema', defs: ansicht.ohneThema }].map(x => ({ ...x, defs: x.defs.filter(p => eingabe.alle || eingabe.zaehlt(p))
      .map(p => FELD_DEF.get(p)!) })).filter(x => x.defs.length) : []
  const nWeitere = weitere.reduce((n, x) => n + x.defs.length, 0)
  const masse = blaetter.filter(b => masseZeilen(b).length)
  const annahmen = blaetter.map(b => ({ b, punkte: annahmenPunkte(b, ansicht.ablauf.find(a => a.b === b)?.xs ?? [], druck, begriffe) }))
    .filter(x => x.punkte.length)
  return <>
    {/* Gruppen nach der Gliederung der Normen (27.10.2026): Überschrift mit Kapitel und Seite vor dem ersten Thema der Gruppe */}
    {themen.map((t, i) => {
      const g = gruppeVonThema(t.thema.id), neu = !i || gruppeVonThema(themen[i - 1].thema.id) !== g
      return <Fragment key={t.thema.id}>{neu && <p className="themen-gruppe"><b>{T(g)}</b></p>}
        {hatInhalt(t) ? <ThemaAnzeige t={t} blaetter={blaetter} druck={druck} eingabe={eingabe} begriffe={begriffe} />
          : t.geprueft > 0 ? <ThemaOhneBefund t={t} blaetter={blaetter} eingabe={eingabe!} />
          : <ThemaNichtGeprueft t={t} blaetter={blaetter} eingabe={eingabe!} grund={ngZeile(t)?.grund}
            regeln={[...(uebersicht?.nichtGeprueftWegen.keys() ?? [])].filter(id => themaVon(id) === t.thema.id)} />}</Fragment>
    })}
    {ohne.length > 0 && <p className="klein thema-ohne">Ohne Befund: {ohne.map((t, i) => <Fragment key={t.thema.id}>{i ? ', ' : ''}<span
      title={t.ohneBefund.map(regelTitel).join(', ')}>{t.thema.name}</span></Fragment>)}{ohne.some(t => Object.keys(t.erfuelltGrund).length)
      && <>. Davon mit Grund: {ohne.flatMap(t => t.ohneBefund.filter(id => t.erfuelltGrund[id]).map(id => ohneBefundZeile(regelTitel(id), t.erfuelltGrund[id])))
        .map((z, i) => <Fragment key={i}>{i ? '; ' : ''}{T(z)}</Fragment>)}.</>}</p>}
    {eingabe && nWeitere > 0 && <details className="befund-thema bedarf-thema thema-angaben" id={themaId('weitere')}>
      <summary><b>Weitere Angaben</b> <span className="klein">({nWeitere})</span></summary>
      <Maske fall={eingabe.fall} blatt={blaetter[0]} aendern={eingabe.aendern} felder={weitere.flatMap(x => x.defs)} flach abschnitte={weitere}
        zaehlt={eingabe.zaehlt} alle={eingabe.alle} kontexte={eingabe.kontexte} bedarf={eingabe.bedarf} bestaetig={eingabe.bestaetig} /></details>}
    {masse.length > 0 && <ErwTeil titel="Masse (Soll und Ist)" druck={druck} id={themaId('masse')}>
      {masse.map(b => <Fragment key={b.gruppe}>{mehrere && <div className="klein thema-querung">{querungTitel(b)}</div>}<MasseTabelle b={b} druck={druck} /></Fragment>)}
    </ErwTeil>}
    {annahmen.length > 0 && <ErwTeil titel="Annahmen und Hinweise" druck={druck} id={themaId('annahmen')}>
      {annahmen.map(({ b, punkte }) => <Fragment key={b.gruppe}>{mehrere && <div className="klein thema-querung">{querungTitel(b)}</div>}
        <ul className="annahmen-liste klein">{punkte}</ul></Fragment>)}
    </ErwTeil>}
  </>
}

/** Ergebnis einer ohne Befund geprüften Regel in einer Zeile: Sicht je Zufahrt mit frei bis und Soll (H1, E3), sonst «ohne Befund», mit
 * dem erfüllt-Grund der Regel, sofern sie einen liefert (z. B. «Wenig Querende: ohne Befund – Querung im Fusswegnetz (von Hand)») */
function ohneBefundZeilen(id: string, blaetter: readonly BefundBlatt[], grund?: string): string[] {
  const s = blaetter.flatMap(b => b.sicht.filter(x => x.regel === id))
  if (!s.length) return [ohneBefundZeile(regelTitel(id), grund)]
  return s.map(x => `${regelTitel(id)}: ${x.name} ${x.frei ? `frei${x.freiBisM !== undefined ? ` bis ${x.freiBisM} m` : ''}` : x.status}, ` +
    `Soll ${String(x.soll).replace('.', ',')} m`)
}
/** Thema ohne Befund, Frage und Verweis, aber mit geprüften Regeln (Panel, 29.10.2026): eingeklappte Zeile «✓ n Regeln ohne Befund»,
 * aufgeklappt die Regeln mit ihrem Ergebnis und die Angaben des Themas */
function ThemaOhneBefund({ t, blaetter, eingabe }: { t: ThemaTeil; blaetter: readonly BefundBlatt[]; eingabe: ErwEingabe }) {
  const felder = t.felder.filter(p => eingabe.alle || eingabe.zaehlt(p)).map(p => FELD_DEF.get(p)!)
  return <details className="befund-thema bedarf-thema thema-ohne-befund" id={themaId(t.thema.id)}>
    <summary title={t.thema.umfang}><b>{t.thema.name}</b> <span className="klein thema-zahl"><span className="grund-symbol" aria-hidden="true">✓</span>
      {' '}{zahlWort(t.ohneBefund.length || t.geprueft, 'Regel', 'Regeln')} ohne Befund</span></summary>
    <ul className="klein">{(t.ohneBefund.length ? t.ohneBefund : []).flatMap(id => ohneBefundZeilen(id, blaetter, t.erfuelltGrund[id]).map((z, i) =>
      <li key={`${id}-${i}`}><span className="grund-symbol" aria-hidden="true">✓</span> {T(z)}<InUebersicht id={id} /></li>))}</ul>
    {felder.length > 0 && <div className="thema-angaben"><p className="klein">Angaben ({felder.length}):</p>
      <Maske fall={eingabe.fall} blatt={blaetter[0]} aendern={eingabe.aendern} felder={felder} flach ohneKoepfe zaehlt={eingabe.zaehlt} alle={eingabe.alle}
        kontexte={eingabe.kontexte} bedarf={eingabe.bedarf} bestaetig={eingabe.bestaetig} /></div>}
  </details>
}

/** Grund «nicht geprüft» lesbar (Begegnungszone mit Fundstelle) */
const GRUND_LESBAR: Readonly<Record<string, string>> = {
  'Baum endet: Begegnungszone': 'Begegnungszone, flächiges Queren (VSS 40 240 Z. 20, S. 19)',
  'Baum endet: flächige Nachfrage': 'flächiges Queren',
  'Baum endet: ausserorts': 'ausserorts',
}
/** Thema, dessen Regeln der Ablauf nicht prüft (Panel, 29.10.2026): eingeklappte graue Zeile mit dem Grund, aufgeklappt die Regeln und
 * die Angaben des Themas */
function ThemaNichtGeprueft({ t, blaetter, eingabe, grund, regeln }: { t: ThemaTeil; blaetter: readonly BefundBlatt[]; eingabe: ErwEingabe
  grund?: string; regeln: readonly string[] }) {
  const felder = t.felder.filter(p => eingabe.alle || eingabe.zaehlt(p)).map(p => FELD_DEF.get(p)!)
  return <details className="befund-thema bedarf-thema thema-nicht-geprueft grau" id={themaId(t.thema.id)}>
    <summary title={t.thema.umfang}><b>{t.thema.name}</b> <span className="klein">– nicht geprüft{grund ? `: ${T(GRUND_LESBAR[grund] ?? grund)}` : ''}</span></summary>
    {regeln.length > 0 && <p className="klein">Nicht geprüft: <Titel ids={regeln} /></p>}
    {felder.length > 0 && <div className="thema-angaben"><p className="klein">Angaben ({felder.length}):</p>
      <Maske fall={eingabe.fall} blatt={blaetter[0]} aendern={eingabe.aendern} felder={felder} flach ohneKoepfe zaehlt={eingabe.zaehlt} alle={eingabe.alle}
        kontexte={eingabe.kontexte} bedarf={eingabe.bedarf} bestaetig={eingabe.bestaetig} /></div>}
  </details>
}

/** Erweiterte Prüfung einer Querung ohne Eingaben (Bericht; im Panel steht sie mit Eingaben in BedarfAbschnitt); ohneTyp: Empfehlung
 * steht schon darüber */
export function BefundblattAnzeige({ b, mehrere = false, druck = false, ohneTyp = false }: { b: BefundBlatt; mehrere?: boolean; druck?: boolean
  ohneTyp?: boolean }) {
  const a = themenAnsicht([b])
  return (
    <div className={druck ? 'befundblatt druck' : 'befundblatt'}>
      {(mehrere || druck) && <h3>Erweiterte Prüfung{mehrere ? `: ${querungTitel(b)}` : ''}</h3>}
      {!ohneTyp && <TypAnzeige b={b} druck={druck} />}
      <p className="klein erweitert-kopf">{erweitertKopf(a)}</p>
      <ErweiterteAnzeige blaetter={[b]} ansicht={a} druck={druck} />
      <p className="klein legende">{LEGENDE} {SYMBOLE}</p>
    </div>
  )
}

/** Quelle in einem Wort (Bericht, Tabelle «Eingaben und Quellen», Runde 5 Stelle 50) */
const QUELLE_WORT: Record<string, string> = { av: 'AV', osm: 'OSM', geoportal: 'Geoportal', luftbild: 'Luftbild', hand: 'von Hand',
  bestaetigt: 'bestätigt', annahme: 'Annahme', schaetzung: 'Schätzung', rechnung: 'Sichtrechner', vorschlag: 'Vorschlag' }
export interface EingabeZeile { gruppe: string; feld: string; wert: string; quelle: string; annahme: boolean; grund?: string }
/** Eingaben als Tabelle (Bericht): Feld, Wert, Quelle in einem Wort, Annahme ja/nein; eine Begründung nur bei Annahmen (Muster 6) */
export function eingabenTabelle(b: BefundBlatt): EingabeZeile[] {
  const aus: EingabeZeile[] = []
  for (const g of GRUPPEN) for (const d of FELD_DEFS.filter(x => x.gruppe === g.id)) {
    const h = b.gebildet.herkunft.get(d.pfad)
    if (!h || h.zustand === 'offen') continue
    const q = h.quelle ?? 'rechnung'
    const annahme = QUELLEN_ANNAHME.includes(q as Quelle)
    const wert = h.zustand === 'hand' ? wertText(d, h.wert) : h.zustand === 'vorbelegt' ? wertText(d, h.vorbelegt!.wert) : 'je Zufahrt'
    aus.push({ gruppe: g.name, feld: d.name, wert, quelle: QUELLE_WORT[q] ?? q, annahme, ...(annahme && h.zustand !== 'hand' ? { grund: herkunftKurz(h.text) } : {}) })
  }
  return aus
}

/** Eingaben mit Wert und Quelle (Bericht): von Hand bzw. vorbelegt, je Block */
export function eingabenText(b: BefundBlatt): { gruppe: string; hand: string[]; vorbelegt: string[] }[] {
  return GRUPPEN.map(g => {
    const hand: string[] = [], vorbelegt: string[] = []
    for (const d of FELD_DEFS.filter(x => x.gruppe === g.id)) {
      const h = b.gebildet.herkunft.get(d.pfad)
      if (h?.zustand === 'hand') hand.push(`${d.name}: ${wertText(d, h.wert)} (${h.text})`)
      else if (h?.zustand === 'vorbelegt') vorbelegt.push(`${d.name}: ${wertText(d, h.vorbelegt!.wert)} (${QUELLE_TEXT[h.quelle!]}: ${lesetext(h.text).replace(/^Sichtrechner: /, '')})`)
      else if (h?.zustand === 'rechner') vorbelegt.push(`${d.name}: kein Wert (${lesetext(h.text)})`)
    }
    return { gruppe: g.name, hand, vorbelegt }
  }).filter(x => x.hand.length || x.vorbelegt.length)
}
