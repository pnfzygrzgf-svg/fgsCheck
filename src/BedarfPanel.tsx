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
// ein Klick springt zum Feld (FeldSprung). Die erweiterte Prüfung ordnet nach Thema, darüber die Prüfübersicht.
// Runde 3 (bedarf/zusammenfassung.ts): zuoberst je Querung eine Zusammenfassung in drei Sätzen (Antwort, das Wichtigste, was
// fehlt) als Absatz; die Empfehlung steht dort, darum entfällt im Panel die Zeile «Empfohlen: …» (Zusatz und Begründung bleiben).

import { Fragment, createContext, useContext, useEffect, useState } from 'react'
import type { Fall } from './fall'
import { FELD_DEFS, GRUPPEN, feldName, gruppenName, istGrundFeld, type FeldDef, type GruppeId } from './bedarf/felder'
import type { GrundPunkt, GrundTeil, GrundZustand, Grundpruefung } from './bedarf/grundpruefung'
import { ZUSTAND_ANZEIGE, eintragSatz, fragenFelder, grundKopf, istSoll, type GrundZeile } from './bedarf/kompakt'
import { HAND_QUELLEN, QUELLE_TEXT, handSetzen, handPruefen, ebeneSetzen, type BedarfEbenen, type Herkunft } from './bedarf/fallBedarf'
import type { BefundBlatt } from './bedarf/befundblatt'
import type { Ebene, Eintrag } from './bedarf/typen'
import type { Quelle } from './bedarf/eingaben'
import { mitTiteln as T, regelName, regelTitel } from './bedarf/regelname'
import { EBENE_WORT, LEGENDE, istWeiche, mitEinheit, nachThema, pruefUebersicht, themaName, verbindlichkeitVon, zaehlText, type ThemaZeile } from './bedarf/themen'
import { FELD_HILFEN, SICHTBAR, bedingungText, bezuegeImFall, feldZiel, frageVon, leerText, schalterText, sichtbar, wozuTeilen,
  type SichtKontext } from './bedarf/feldhilfen'
import { typText } from './bedarf/befundblatt'
import { zusammenfassungBlatt } from './bedarf/zusammenfassung'

/** Sprung zu einem Feld der Maske (Panel); im Bericht fehlt er, die Fragen sind dort Text */
const FeldSprung = createContext<((feld: string) => void) | null>(null)
/** Kennung der Zeile eines Felds in der Maske */
export const feldZeileId = (pfad: string): string => `feld-${pfad.replace(/\./g, '-')}`

/** Frage zu einem fehlenden Feld; im Panel ein Knopf, der zum Feld springt */
function Frage({ feld }: { feld: string }) {
  const sprung = useContext(FeldSprung)
  const ziel = feldZiel(feld)
  const t = frageVon(feld)
  if (!sprung || !ziel) return <span className="frage">{t}</span>
  return <button type="button" className="frage-knopf" title="zum Feld springen"
    onClick={e => { e.preventDefault(); e.stopPropagation(); sprung(ziel) }}>{t}</button>
}
/** mehrere Fragen, höchstens max, dann «und N weitere» */
function Fragen({ felder, max = 99 }: { felder: readonly string[]; max?: number }) {
  const f = fragenFelder(felder)
  return <>{f.slice(0, max).map((x, i) => <Fragment key={x}>{i ? ' ' : ''}<Frage feld={x} /></Fragment>)}
    {f.length > max ? ` und ${f.length - max} weitere` : ''}</>
}

const zahlText = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',')

/** Wert eines Felds als Text (Maske, Bericht) */
export function wertText(d: FeldDef, x: unknown): string {
  if (x === null || x === undefined) return 'offen'
  const a = d.art
  switch (a.art) {
    case 'bool': return x ? 'ja' : 'nein'
    case 'zahl': return `${zahlText(x as number)}${a.einheit ? ` ${a.einheit}` : ''}`
    case 'zahlen': return `${(x as number[]).map(zahlText).join(' / ')}${a.einheit ? ` ${a.einheit}` : ''}`
    case 'wahl': return a.optionen.find(([k]) => k === x)?.[1] ?? String(x)
    case 'liste': return (x as string[]).length ? (x as string[]).map(v => a.optionen.find(([k]) => k === v)?.[1] ?? v).join(', ') : 'keines'
  }
}

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

function TextEingabe({ d, wert, platzhalter, setze }: { d: FeldDef; wert: unknown; platzhalter: string; setze: Setze }) {
  const text = (v: unknown) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.map(zahlText).join(' / ') : zahlText(v as number))
  const [t, setT] = useState(text(wert))
  useEffect(() => { setT(text(wert)) }, [wert])
  const uebernehmen = () => {
    const x = zahlenLesen(t, d)
    if (x === undefined || !setze(x)) { setT(text(wert)); return }
  }
  return <input type="text" inputMode="decimal" className="zahl bedarf-zahl" value={t} placeholder={platzhalter} aria-label={d.name}
    title={d.art.art === 'zahlen' ? 'mehrere Werte mit / trennen; leer = offen bzw. vorbelegt; Enter bzw. Feld verlassen übernimmt'
      : 'leer = offen bzw. vorbelegt; Enter bzw. Feld verlassen übernimmt'}
    onChange={e => setT(e.target.value)} onBlur={uebernehmen} onKeyDown={e => { if (e.key === 'Enter') uebernehmen() }} />
}

/** Liste nach einem Klick: leer heisst ohne Vorbelegung offen (null), mit Vorbelegung Handeingabe «keines» ([]) (Korrektur S4) */
export const listeNeu = (x: string[], vorbelegt: boolean): string[] | null => (x.length ? x : vorbelegt ? [] : null)

function FeldEingabe({ d, h, setze }: { d: FeldDef; h: Herkunft; setze: Setze }) {
  const hand = h.zustand === 'hand'
  const vor = h.vorbelegt
  const a = d.art
  if (a.art === 'bool' || a.art === 'wahl') {
    const opt: [string, string][] = a.art === 'bool' ? [['ja', 'ja'], ['nein', 'nein']] : a.optionen
    const wert = (x: unknown) => (a.art === 'bool' ? (x === true ? 'ja' : x === false ? 'nein' : '') : (x as string) ?? '')
    return <select value={hand ? wert(h.wert) : ''} aria-label={d.name} onChange={e => {
      const v = e.target.value
      setze(v === '' ? null : a.art === 'bool' ? v === 'ja' : v)
    }}>
      <option value="">{vor ? `vorbelegt: ${wertText(d, vor.wert)}` : 'offen'}</option>
      {opt.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
    </select>
  }
  if (a.art === 'liste') {
    const x = (hand ? h.wert : vor?.wert) as string[] | null | undefined
    const liste = Array.isArray(x) ? x : null
    // letztes Häkchen weg: ohne Vorbelegung wieder offen; mit Vorbelegung eine Handeingabe «keines» (kein Rückfall auf die Vorbelegung,
    // Korrektur S4); «keines» ist eine eigene Angabe
    return <span className="bedarf-liste" role="group" aria-label={d.name}>
      {a.optionen.map(([k, t]) => <label key={k}><input type="checkbox" checked={!!liste?.includes(k)} onChange={e => {
        const neu = new Set(liste ?? [])
        if (e.target.checked) neu.add(k); else neu.delete(k)
        const x = a.optionen.map(o => o[0]).filter(o => neu.has(o))
        setze(listeNeu(x, !!vor))
      }} /> {t}</label>)}
      <label><input type="checkbox" checked={!!liste && !liste.length} onChange={e => setze(e.target.checked ? [] : null)} /> keines</label>
    </span>
  }
  return <TextEingabe d={d} wert={hand ? h.wert : null} platzhalter={vor ? wertText(d, vor.wert) : 'offen'} setze={setze} />
}

/** Herkunft eines Felds: Quelle der Handeingabe (wählbar) bzw. der Vorbelegung */
function HerkunftZelle({ d, h, quelle, zurueck, hinweis }: { d: FeldDef; h: Herkunft; quelle: (q: Quelle) => void; zurueck: () => void
  hinweis?: string }) {
  if (h.zustand === 'hand') return <>
    <select className="klein" value={h.quelle ?? 'hand'} aria-label={`Quelle: ${d.name}`} title="Quelle der Handeingabe (erscheint im Befund; Annahmen und Schätzungen sind ausgewiesen)"
      onChange={e => quelle(e.target.value as Quelle)}>
      {HAND_QUELLEN.map(q => <option key={q} value={q}>{QUELLE_TEXT[q]}</option>)}
    </select>{' '}
    <button className="zweit klein" title={h.vorbelegt ? `Handeingabe entfernen: wieder vorbelegt (${h.vorbelegt.text})` : 'Handeingabe entfernen: offen'}
      aria-label={`${d.name}: Handeingabe entfernen`} onClick={zurueck}>zurück</button>
  </>
  if (h.zustand === 'vorbelegt') return <span className="klein" title={`${d.name}: ${h.text}`}>{QUELLE_TEXT[h.quelle!]}: {h.text}</span>
  // offenes Feld mit Hinweis der Vorbelegung (z. B. Lampe in OSM, Haltestelle in der Nähe): Hinweis statt nur «offen» (Korrektur S3)
  return <span className="klein">{hinweis ? <>offen – {hinweis}</> : 'offen'}</span>
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
    <p><b>Was ist gemeint:</b> {T(fh?.was)}</p>
    <b>Wozu:</b>
    <ul>{(fh?.ablauf || sch) && <li>Ablauf: {T([fh?.ablauf, sch].filter(Boolean).join(' '))}</li>}
      {(alle ? bz : kurz).map(b => <li key={b.id}><b>{regelTitel(b.id)}</b> <span className="klein">({b.id})</span>
        {ebeneZusatz(b.ebene, b.grund)}{b.id === 'D5-4' && d.pfad !== 'sichtVorh' ? ' (über die Sichtregeln)' : ''}: {b.text} · {b.quelle}</li>)}
      {!bz.length && !fh?.ablauf && !sch && <li>In diesem Fall greift keine Prüfung mit diesem Feld.</li>}</ul>
    {weitere.length > 0 && <button type="button" className="zweit klein" aria-expanded={alle} onClick={() => setAlle(!alle)}>
      {alle ? 'weniger anzeigen' : `weitere anzeigen (${weitere.length})`}</button>}
    {bed && <p><b>Zählt nur, wenn:</b> {bedingungText(bed)}.</p>}
    <p><b>Leer lassen:</b> {T(leerText(d.pfad).replace(/^Leer: /, ''))}</p>
    {(fh?.vorschlag || vor || hinweis) && <p><b>Vorschlag der App:</b> {vor ? `hier ${wertText(d, vor.wert)} (${QUELLE_TEXT[vor.quelle]}: ${vor.text})` +
      (h.zustand === 'hand' ? '; von Hand überschrieben, «zurück» stellt ihn wieder her' : '') : hinweis ? `hier kein Wert: ${hinweis}` : 'hier keiner'}
      {fh?.vorschlag ? `; allgemein ${fh.vorschlag}` : '.'}</p>}
  </div>
}

/** Eingabemaske nach Blöcken; flach: alle Felder in einer offenen Tabelle mit Blocküberschriften (Grundprüfung). zaehlt: Feld wirkt
 * im Fall (Feldhilfen, SICHTBAR); die übrigen nur mit alle (gekennzeichnet) */
function Maske({ fall, blatt, aendern, felder, flach = false, zaehlt, alle, kontexte }: { fall: Fall; blatt: BefundBlatt
  aendern: (f: (x: Fall) => Fall) => void; felder: FeldDef[]; flach?: boolean; zaehlt: (pfad: string) => boolean; alle: boolean
  kontexte: readonly SichtKontext[] }) {
  const [hilfe, setHilfe] = useState<ReadonlySet<string>>(new Set())
  const umschalten = (pfad: string) => setHilfe(x => { const n = new Set(x); if (n.has(pfad)) n.delete(pfad); else n.add(pfad); return n })
  // Meldung je Feld bei ungültiger Eingabe (Wertebereich wie beim Lesen der Fall-Datei)
  const [fehler, setFehler] = useState<Record<string, string>>({})
  const setze = (pfad: string, wert: unknown, quelle: Quelle): boolean => {
    const f = handPruefen(pfad, wert, quelle)
    setFehler(x => { const n = { ...x }; if (f) n[pfad] = f; else delete n[pfad]; return n })
    if (f) return false
    aendern(x => {
      const b = handSetzen(x.bedarf, pfad, wert, quelle)
      if (b) x.bedarf = b; else delete x.bedarf
      return x
    })
    return true
  }
  const herkunft = (pfad: string): Herkunft => blatt.gebildet.herkunft.get(pfad) ?? { zustand: 'offen', quelle: null, text: 'offen' }
  const zeile = (d: FeldDef, h: Herkunft) => {
    const id = `feldhilfe-${d.pfad.replace(/\./g, '-')}`, auf = hilfe.has(d.pfad)
    return <Fragment key={d.pfad}><tr id={feldZeileId(d.pfad)} className={h.zustand === 'offen' ? 'offen' : undefined}>
    <td>{d.name}{!zaehlt(d.pfad) && <span className="klein"> (zählt hier nicht)</span>}{' '}
      <button type="button" className="zweit klein hilfe-knopf" aria-expanded={auf} aria-controls={id} aria-label={`Erklärung: ${d.name}`}
        title="Erklärung, Regeln und Quellen" onClick={() => umschalten(d.pfad)}>?</button></td>
    <td><FeldEingabe d={d} h={h} setze={x => setze(d.pfad, x, (fall.bedarf?.felder[d.pfad]?.quelle) ?? d.quelle ?? 'hand')} />
      {fehler[d.pfad] && <div className="klein fehler" role="alert">{fehler[d.pfad]}</div>}</td>
    <td><HerkunftZelle d={d} h={h} quelle={q => setze(d.pfad, fall.bedarf?.felder[d.pfad]?.wert, q)} zurueck={() => setze(d.pfad, null, 'hand')}
      hinweis={blatt.vorbelegt.feldHinweise?.[d.pfad]} /></td>
  </tr>
    {auf && <tr className="bedarf-hilfe"><td colSpan={3}><FeldHilfe d={d} h={h} id={id} kontexte={kontexte}
      hinweis={blatt.vorbelegt.feldHinweise?.[d.pfad]} /></td></tr>}</Fragment>
  }
  const bloecke = GRUPPEN.map(g => ({ g, defs: felder.filter(d => d.gruppe === g.id && (alle || zaehlt(d.pfad))) })).filter(x => x.defs.length)
  if (flach) return <table className="bedarf-maske"><tbody>{bloecke.flatMap(({ g, defs }) => [
    <tr key={`kopf-${g.id}`} className="bedarf-block"><th colSpan={3} className="klein">{g.name}</th></tr>,
    ...defs.map(d => zeile(d, herkunft(d.pfad))),
  ])}</tbody></table>
  return <>{bloecke.map(({ g, defs }) => {
    const hs = defs.map(d => herkunft(d.pfad))
    const n = (z: Herkunft['zustand']) => hs.filter(h => h.zustand === z).length
    return <details key={g.id} className="bedarf-gruppe">
      <summary className="klein"><b>{g.name}</b> ({n('hand')} von Hand, {n('vorbelegt')} vorbelegt, {n('offen')} offen)</summary>
      <table className="bedarf-maske"><tbody>{defs.map((d, i) => zeile(d, hs[i]))}</tbody></table>
    </details>
  })}</>
}

/** Felder der Grundprüfung (oben) bzw. der erweiterten Prüfung (aufklappbar) */
const FELDER_GRUND = FELD_DEFS.filter(d => istGrundFeld(d.pfad))
const FELDER_ERWEITERT = FELD_DEFS.filter(d => !istGrundFeld(d.pfad))

const ebeneText: Record<keyof BedarfEbenen, string> = {
  bern: 'Bern (Masterplan Fussverkehr, Handbuch LSA, Standards Veloinfrastruktur)', kantonBE: 'Kanton BE (Arbeitshilfe Fussgängerstreifen)',
  richtlinie: 'Richtlinien (bfu, Hindernisfreie Architektur): nur Hinweise',
}

/** Abschnitt im Panel: Ebenen, Befundblatt je Querung, Eingabemaske */
export function BedarfAbschnitt({ fall, blaetter, vorgabe, aendern }: { fall: Fall; blaetter: BefundBlatt[]
  vorgabe: { bern: boolean; kantonBE: boolean }; aendern: (f: (x: Fall) => Fall) => void }) {
  const [alleZeigen, setAlleZeigen] = useState(false)
  const [sprungZiel, setSprungZiel] = useState<string | null>(null)
  // Sprung zum Feld: übergeordnete Aufklapper öffnen, Zeile zeigen und das Eingabeelement fokussieren
  useEffect(() => {
    if (!sprungZiel) return
    const el = document.getElementById(feldZeileId(sprungZiel))
    if (el) {
      for (let d: HTMLElement | null = el.parentElement; d; d = d.parentElement) if (d instanceof HTMLDetailsElement) d.open = true
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.querySelector<HTMLElement>('input, select')?.focus({ preventScroll: true })
    }
    setSprungZiel(null)
  }, [sprungZiel])
  if (!blaetter.length) return null
  const b0 = blaetter[0]
  // Feld zählt, wenn es in mindestens einer Querung wirken kann (Eingaben gelten für alle Querungen)
  const kontexte: SichtKontext[] = blaetter.map(b => ({ e: b.gebildet.eingaben, ebenen: b.ebenen }))
  const zaehlt = (pfad: string) => kontexte.some(k => sichtbar(pfad, k))
  const versteckt = FELD_DEFS.filter(d => !zaehlt(d.pfad))
  const verstecktHand = versteckt.filter(d => fall.bedarf?.felder[d.pfad]).length
  const springe = (pfad: string) => { if (!zaehlt(pfad)) setAlleZeigen(true); setSprungZiel(pfad) }
  const schalten = (k: keyof BedarfEbenen, an: boolean) => aendern(f => {
    const v = k === 'richtlinie' ? true : vorgabe[k]
    const b = ebeneSetzen(f.bedarf, k, an === v ? null : an)
    if (b) f.bedarf = b; else delete f.bedarf
    return f
  })
  return (
    <FeldSprung.Provider value={springe}>
    <details className="abschnitt bedarf">
      <summary><h2>Bedarf und Querungstyp</h2> <span className="klein">{blaetter.map(b => kopfText(b)).join(' · ')}</span></summary>
      <p className="klein">Darf hier ein Fussgängerstreifen hin, und welche Querung passt? Offene Fragen anklicken und beantworten; der
        Knopf «?» erklärt jedes Feld, die Hilfe den Ablauf.</p>
      {blaetter.map(b => <div key={b.gruppe}>
        {blaetter.length > 1 && <h3>Querung {b.titel}</h3>}
        <ZusammenfassungAnzeige b={b} />
        <TypAnzeige b={b} ohneKopf />
        <GrundpruefungAnzeige g={b.grund} feldHinweise={b.vorbelegt.feldHinweise} />
      </div>)}
      <h3>Eingaben der Grundprüfung{blaetter.length > 1 ? ` (gelten für alle Querungen; vorbelegt nach ${b0.titel})` : ''}</h3>
      <Maske fall={fall} blatt={b0} aendern={aendern} felder={FELDER_GRUND} flach zaehlt={zaehlt} alle={alleZeigen} kontexte={kontexte} />
      {versteckt.length > 0 && <p className="klein">{versteckt.length} Felder ausgeblendet, weil sie in diesem Fall nicht zählen (z. B.
        Angaben zur Insel ohne Insel, LSA-Zeiten ohne Lichtsignal){verstecktHand ? `; ${verstecktHand} davon mit Eingabe von Hand, ` +
        'sie bleiben gespeichert' : ''}.{' '}
        <label><input type="checkbox" checked={alleZeigen} onChange={e => setAlleZeigen(e.target.checked)} /> alle Felder zeigen</label></p>}
      <details className="bedarf-erweitert">
        <summary><b>Erweiterte Prüfung</b> <span className="klein">(Befundblatt nach VSS 40 241, 40 240 und weiteren Grundlagen, übrige
          Eingaben)</span></summary>
        <div className="klein bedarf-ebenen">Ebenen (Recht und Norm immer):{' '}
          {(['bern', 'kantonBE', 'richtlinie'] as const).map(k => <label key={k} title={k === 'richtlinie' ? 'Vorgabe: an' :
            `Vorgabe nach dem Ort (AV): ${vorgabe[k] ? 'an' : 'aus'}`}>
            <input type="checkbox" checked={b0.ebenen[k]} onChange={e => schalten(k, e.target.checked)} /> {ebeneText[k]}
            {fall.bedarf?.ebenen?.[k] !== undefined ? ' (von Hand)' : ''}</label>)}
        </div>
        {blaetter.map(b => <BefundblattAnzeige key={b.gruppe} b={b} mehrere={blaetter.length > 1} ohneTyp />)}
        <h3>Weitere Eingaben{blaetter.length > 1 ? ` (gelten für alle Querungen; vorbelegt nach ${b0.titel})` : ''}</h3>
        <Maske fall={fall} blatt={b0} aendern={aendern} felder={FELDER_ERWEITERT} zaehlt={zaehlt} alle={alleZeigen} kontexte={kontexte} />
      </details>
    </details>
    </FeldSprung.Provider>
  )
}

/** Kopfzeile des Aufklappers je Querung: empfohlener Typ; offene Zulässigkeit ohne Elemente (Runde 3, Korrektur) */
function kopfText(b: BefundBlatt): string {
  const f = b.befund
  if (f.zulaessigkeit === 'offen' && !f.ausgewertet.includes('Q3-4')) return 'Zulässigkeit offen'
  return typText(f, false) + (f.empfehlung.vorlaeufig ? ' (vorläufig)' : '')
}

/**
 * Zusammenfassung einer Querung in drei Sätzen (Panel und Bericht): Antwort, das Wichtigste, was fehlt (Fragen springen im Panel zum
 * Feld). titel: kurzer Titel vor dem Absatz (Bericht mit mehreren Querungen); druck: Verweise auf Befundblatt und offene Angaben
 */
export function ZusammenfassungAnzeige({ b, titel, druck = false }: { b: BefundBlatt; titel?: string; druck?: boolean }) {
  const z = zusammenfassungBlatt(b, druck ? 'bericht' : 'panel')
  const f = z.fehlt
  return <p className="bedarf-zusammenfassung">{titel && <b>{titel}: </b>}{z.antwort}{z.wichtig && <> {z.wichtig}</>}
    {f && <> {f.einleitung}{f.felder.map(x => <Fragment key={x}> <Frage feld={x} /></Fragment>)}{f.weitere ? ` (und ${f.weitere} weitere)` : ''}</>}</p>
}

/**
 * Empfohlener Querungstyp; Begründung mit Ziffern im Panel aufklappbar. Die fehlenden Angaben nennt die Zusammenfassung darüber
 * (Runde 3: keine Dopplung); ohneKopf: ohne die Zeile «Empfohlen» (Panel, die Zusammenfassung nennt den Typ)
 */
function TypAnzeige({ b, druck = false, ohneKopf = false }: { b: BefundBlatt; druck?: boolean; ohneKopf?: boolean }) {
  const e = b.befund.empfehlung
  const begr = <>{b.begruendung && <>{T(b.begruendung)}.</>}</>
  return <>
    {!ohneKopf && <p className="befund-typ"><b>Empfohlen:</b> {T(typText(b.befund, false))}
      {e.vorlaeufig && <> – vorläufig, es fehlen Angaben (siehe Zusammenfassung)</>}</p>}
    {e.zusatz.length > 0 && <p className="klein">Zusätzlich: {T(e.zusatz.join('; '))}.</p>}
    {b.begruendung && (druck ? <p className="klein">{begr}</p>
      : <details className="klein bedarf-begruendung"><summary>Begründung</summary>{begr}</details>)}
  </>
}

const NR: Record<GrundPunkt['nr'], string> = { T: 'Vorbedingung', 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤' }
/** Symbol, Text und Farbklasse eines Zustands (Symbol und Text, damit der Druck auch ohne Farbe lesbar bleibt) */
function zustandAnzeige(z: GrundZustand, st: string | null): [string, string, string] {
  if (z === 'erfuellt') return ['✓', 'erfüllt', 'gruen']
  if (z === 'verletzt') return st === 'weich' ? ['!', 'Soll nicht erfüllt', 'gelb'] : ['✗', 'nicht erfüllt (Muss)', 'rot']
  if (z === 'offen') return ['?', 'offen', 'grau']
  return ['i', 'Hinweis', 'blau']
}

/** Teilregel der Grundprüfung in den Details: Titel (Nummer), Zustand, Ist/Soll, Text, Fundstelle, Normhinweis */
function GrundTeilZeile({ t, notiz = false }: { t: GrundTeil; notiz?: boolean }) {
  const [sym, txt, kl] = zustandAnzeige(t.zustand, t.staerke)
  if (notiz) return <li className="blau"><span className="grund-symbol" aria-hidden="true">i</span> {regelTitel(t.id)}{' '}
    <span className="klein">({t.id})</span>: {T(t.text)}<span className="klein"> · {t.quelle}</span></li>
  const masse = [t.ist !== undefined ? `Ist ${t.ist}` : '', t.soll !== undefined ? `Soll ${t.soll}` : ''].filter(Boolean).join('; ')
  return <li className={kl}><span className="grund-symbol" aria-hidden="true">{sym}</span> {regelTitel(t.id)} <span className="klein">({t.id})</span>:
    {' '}{txt}{masse ? ` (${T(masse)})` : ''}
    {(t.zustand === 'verletzt' || t.zustand === 'hinweis') && <> – {T(t.text)}</>}
    {t.zustand === 'offen' && t.fehlend?.length ? <> – fehlt: {t.fehlend.map(feldName).join(', ')}</> : null}
    {t.detail && <>; {T(t.detail)}</>}
    <span className="klein"> · {t.quelle}</span>
    {t.normHinweis && <div className="klein">{T(t.normHinweis)}</div>}</li>
}

/** eine Zeile der Grundprüfung: Name, Symbol und Wort, ein Satz (mit Zusatz bzw. Fragen) */
function GrundZeileAnzeige({ z, name, thema }: { z: GrundZeile; name: string; thema?: string }) {
  const a = ZUSTAND_ANZEIGE[z.zustand]
  return <tr className={a.klasse}>
    <th scope="row">{name}{thema && <span className="klein"> ({thema})</span>}</th>
    <td className="grund-wort"><span className="grund-symbol" aria-hidden="true">{a.symbol}</span> {a.wort}</td>
    <td>{T(z.satz)}{z.zusatz && <span className="klein"> ({T(z.zusatz)})</span>}
      {z.fragen.length > 0 && <>{z.satz ? ' ' : ''}→ <Fragen felder={z.fragen} /></>}</td>
  </tr>
}

/** Kasten «Grundprüfung nach bfu MS.013 (Big Five)» einer Querung (Panel und Bericht): eine Zeile je Punkt, Details aufklappbar
 * (im Bericht aufgeklappt darunter) */
export function GrundpruefungAnzeige({ g, titel, druck = false, feldHinweise }: { g: Grundpruefung; titel?: string; druck?: boolean
  feldHinweise?: Readonly<Record<string, string>> }) {
  const kopfText = `Grundprüfung nach bfu MS.013-2025, Ziff. 2.1–2.3 (Big Five)${titel ? `: ${titel}` : ''}`
  if (!g.gilt) return <div className={druck ? 'grundpruefung druck' : 'grundpruefung'}>
    <div className="grund-kopf"><b>{kopfText}</b></div><p className="klein">{T(g.grund)}</p></div>
  const k = grundKopf(g, feldHinweise ?? {})
  const details = <>
    <ul className="grund-punkte">{g.punkte.map(p => {
      const [sym, txt, kl] = zustandAnzeige(p.zustand, p.staerke)
      return <li key={p.nr} className={kl}>
        <span className="grund-symbol" aria-hidden="true">{sym}</span> <b>{NR[p.nr]} {p.titel}</b>: {txt}
        <ul className="grund-teile">{p.teile.map(t => <GrundTeilZeile key={t.id} t={t} />)}
          {p.notizen.map(t => <GrundTeilZeile key={t.id} t={t} notiz />)}</ul>
      </li>
    })}</ul>
    {g.weitere.length > 0 && <div><b>Weitere bfu-Punkte</b>
      <ul className="grund-teile">{g.weitere.map(t => <GrundTeilZeile key={t.id} t={t} />)}</ul></div>}
    {g.annahmen.length > 0 && <p className="warnung">Annahmen: {T(g.annahmen.join('; '))}.</p>}
    <p>Unabhängig von den Ebenen. Zeile je Punkt: die Muss-Regel bestimmt den Zustand; offene oder nicht erfüllte Soll-Regeln stehen
      in Klammern. ✓ erfüllt, ✗ Muss nicht erfüllt, ! Soll nicht erfüllt, ? offen (Angabe fehlt), i Hinweis.</p>
  </>
  return (
    <div className={druck ? 'grundpruefung druck' : 'grundpruefung'}>
      <div className="grund-kopf"><b>{kopfText}</b> <span className="grund-zaehlung">{k.zaehlung}</span></div>
      <table className="grund-tabelle"><tbody>
        {g.punkte.map((p, i) => <GrundZeileAnzeige key={p.nr} z={k.zeilen[i]} name={p.nr === 'T' ? 'Tempo' : `${NR[p.nr]} ${p.titel}`}
          thema={p.nr !== 'T' && themaName(p.thema) !== p.titel ? themaName(p.thema) : undefined} />)}
        {k.weitere && <GrundZeileAnzeige z={k.weitere} name="Weitere" />}
      </tbody></table>
      {druck ? <div className="klein grund-details">{details}</div>
        : <details className="klein grund-details"><summary>Details</summary>{details}</details>}
    </div>
  )
}

/** Symbol und Farbklasse eines Eintrags (Symbol und Verbindlichkeitswort tragen die Bedeutung, Farbe nur zusätzlich) */
function eintragStil(x: Eintrag): [string, string] {
  if (x.zustand === 'offen') return ['?', 'grau']
  return x.staerke === 'weich' ? ['!', 'gelb'] : x.staerke === 'hinweis' ? ['i', 'blau'] : ['✗', 'rot']
}

/** Eintrag der erweiterten Prüfung in einer Zeile: Symbol · Kurztitel · Verbindlichkeit · ein Satz bzw. Frage(n); Nummer, Quelle,
 * Detail und Normhinweis hinter «Details» (Bericht: kleine zweite Zeile). mitDetail: Detail in der Zeile (gleiche Regel mehrfach) */
function EintragZeile({ x, druck, mitDetail }: { x: Eintrag; druck: boolean; mitDetail: boolean }) {
  const [sym, kl] = eintragStil(x)
  const offen = x.zustand === 'offen'
  const zeile = <><span className="grund-symbol" aria-hidden="true">{sym}</span> <b>{regelTitel(x.id)}</b> · <i>{verbindlichkeitVon(x)}</i> ·{' '}
    {offen ? <>{x.fehlend?.length ? <Fragen felder={x.fehlend} /> : 'Angabe fehlt'}{istSoll(x) ? ` (${T(istSoll(x))})` : ''}</> : T(eintragSatz(x))}
    {mitDetail && x.detail ? <> ({T(x.detail)})</> : null}</>
  const det = <span className="klein">{regelName(x.id)} · {x.quelle}{x.detail && !mitDetail ? <> · {T(x.detail)}</> : null}
    {x.normHinweis ? <> · {T(x.normHinweis)}</> : null}</span>
  if (druck) return <li className={kl}>{zeile}<div>{det}</div></li>
  return <li className={kl}><details className="eintrag-details"><summary>{zeile}</summary>{det}</details></li>
}

/** Einträge nach Thema (Reihenfolge der Themen; im Thema Muss, Muss mit Bericht, Soll, Hinweis, offen). Weichen des Ablaufs zählen
 * nicht und stehen nicht im Thema (Korrektur S7): ihre Hinweise in einer Zeile «Zum Ablauf» darunter, offene nur bei den offenen Angaben */
function ThemenListe({ alle, druck }: { alle: Eintrag[]; druck: boolean }) {
  const ablauf = alle.filter(x => istWeiche(x.id) && x.zustand === 'verletzt')
  return <>{nachThema(alle.filter(x => !istWeiche(x.id))).map(({ thema, eintraege }) => {
    const n = new Map<string, number>()
    for (const x of eintraege) n.set(x.id, (n.get(x.id) ?? 0) + 1)
    return <div key={thema.id} className="befund-thema">
      <div className="thema-kopf"><b>{thema.name}</b> <span className="klein">({eintraege.length} {eintraege.length === 1 ? 'Eintrag' : 'Einträge'})</span></div>
      <ul>{eintraege.map((x, i) => <EintragZeile key={x.id + i} x={x} druck={druck} mitDetail={(n.get(x.id) ?? 0) > 1} />)}</ul>
    </div>
  })}
  {ablauf.length > 0 && <div className="befund-thema">
    <div className="thema-kopf"><b>Zum Ablauf</b> <span className="klein">(nicht gezählt)</span></div>
    <ul>{ablauf.map((x, i) => <EintragZeile key={x.id + i} x={x} druck={druck} mitDetail={false} />)}</ul>
  </div>}</>
}

/** Prüfübersicht der erweiterten Prüfung: eine Zeile, darunter je Thema (Panel aufklappbar mit den ohne Befund geprüften Regeln;
 * Bericht kompakt ohne diese Liste) */
function PruefUebersichtAnzeige({ b, druck }: { b: BefundBlatt; druck: boolean }) {
  const u = pruefUebersicht(b.befund, { ebenen: b.ebenen, typ: b.gebildet.eingaben.typ.wert })
  const zeile = `Geprüft: ${u.geprueft} Regeln · ohne Befund ${u.ohneBefund} · offen ${u.offen} · Befunde ${u.befunde} · Hinweise ${u.hinweise}`
  const ebenen: Ebene[] = ['Recht', 'Norm', ...(b.ebenen.richtlinie ? ['Richtlinie' as const] : []), ...(b.ebenen.bern ? ['Bern' as const] : []),
    ...(b.ebenen.kantonBE ? ['Kanton BE' as const] : [])]
  const themaZeile = (z: ThemaZeile) => <li key={z.thema.id}><b>{z.thema.name}</b>: {zaehlText(z)}
    {!druck && z.ohneBefundIds.length > 0 && <div className="klein">Geprüft, ohne Befund: {z.ohneBefundIds.map(regelName).join(', ')}</div>}</li>
  const g = b.gestrichen ?? 0
  const inhalt = <>
    <ul className="pruef-themen">{u.themen.map(themaZeile)}</ul>
    <p className="klein">{u.nichtGeprueft > 0 && <>Nicht geprüft: {u.nichtGeprueft} Regeln ({u.gruende.map(x => `${x.grund} ${x.n}`).join(', ')}). </>}
      Nicht anwendbar: {u.nichtAnwendbar} Regeln (gelten in diesem Fall nicht).{g > 0 && <> {g} {g === 1 ? 'Zufahrt' : 'Zufahrten'} von
      Hand gestrichen (nicht geprüft).</>} Ebenen: {ebenen.map(e => EBENE_WORT[e]).join(', ')}.</p>
  </>
  if (druck) return <div className="pruef-uebersicht druck"><b>{zeile}</b>{inhalt}</div>
  return <details className="pruef-uebersicht"><summary><b>{zeile}</b> <span className="klein">(je Thema)</span></summary>{inhalt}</details>
}

/** Befundblatt einer Querung (Panel und Bericht); ohneTyp: Empfehlung steht schon darüber (Panel) */
export function BefundblattAnzeige({ b, mehrere = false, druck = false, ohneTyp = false }: { b: BefundBlatt; mehrere?: boolean; druck?: boolean
  ohneTyp?: boolean }) {
  const { befund } = b
  const offenNach = new Map<GruppeId | 'sonst', typeof b.offen>()
  for (const o of b.offen) offenNach.set(o.gruppe ?? 'sonst', [...(offenNach.get(o.gruppe ?? 'sonst') ?? []), o])
  const lokalAn = b.ebenen.bern || b.ebenen.kantonBE
  // Masse: bekannte Werte als Tabelle, die übrigen (Ist offen) als eine Zeile
  const masse = befund.masse.filter(mz => !(mz.zustand === 'offen' && mz.ist === '–'))
  const masseOffen = befund.masse.filter(mz => mz.zustand === 'offen' && mz.ist === '–').map(mz => mz.groesse)
  return (
    <div className={druck ? 'befundblatt druck' : 'befundblatt'}>
      {(mehrere || druck) && <h3>{mehrere ? `Querung ${b.titel}` : b.titel}</h3>}
      {!ohneTyp && <TypAnzeige b={b} druck={druck} />}
      <PruefUebersichtAnzeige b={b} druck={druck} />
      <ThemenListe alle={befund.alle} druck={druck} />
      <p className="klein legende">{LEGENDE} ✗ Muss nicht erfüllt, ! Soll nicht erfüllt, i Hinweis, ? Angabe fehlt.</p>
      {b.offen.length > 0 && <div className="befund-liste grau">
        <b>Offene Angaben (nach Block der Maske)</b>
        <ul>{[...offenNach].map(([g, os]) => <li key={g}>{g === 'sonst' ? 'Weitere' : gruppenName(g)}: {os.map((o, i) =>
          <Fragment key={o.feld}>{i ? '; ' : ''}<Frage feld={o.feld} /> – fehlt für {o.regeln.map(regelName).join(', ')}</Fragment>)}</li>)}</ul>
      </div>}
      {b.nichtGeprueft.length > 0 && <div className="befund-liste grau"><b>Nicht geprüft</b>
        <ul>{b.nichtGeprueft.map(x => <li key={x.block}>{x.block}: {T(x.grund)}</li>)}</ul></div>}
      {masse.length > 0 && <table className={druck ? 'bericht-tabelle befund-masse' : 'befund-masse'}>
        <thead><tr><th>Mass</th><th>Soll</th><th>Ist</th><th>Stand</th></tr></thead>
        <tbody>{masse.map(mz => <tr key={mz.groesse} className={mz.zustand}>
          <td>{mz.groesse}<div className="klein">{mz.regeln.map(regelName).join(', ')}</div></td>
          <td>{mz.soll ? T(mitEinheit(mz.soll, mz.einheit)) : '–'}</td>
          <td>{T(mitEinheit(mz.ist, mz.einheit))}</td>
          <td>{mz.zustand === 'verletzt' ? 'nicht erfüllt' : mz.zustand === 'offen' ? 'offen' : 'erfüllt'}</td></tr>)}</tbody>
      </table>}
      {masseOffen.length > 0 && <p className="klein">Masse offen (Eingabe fehlt): {masseOffen.join(', ')}.</p>}
      {!lokalAn && <p className="klein">Ebenen Bern und Kanton BE ausgeschaltet.</p>}
      {b.sicht.length > 0 && <p className="klein">Sicht (Sichtrechner, {b.sicht[0].regel === 'E3' ? 'VSS 40 240 Z. 8.2' : 'VSS 40 241 Tab. 1'}):{' '}
        {b.sicht.map(x => `${x.name} ${x.frei ? (x.bisM !== undefined ? `frei bis ${x.bisM} m, darüber nicht geprüft` : 'frei') : x.status} ` +
          `(Soll ${String(x.soll).replace('.', ',')} m)`).join('; ')}.</p>}
      {b.sichtVonHand && <p className="klein">{T('Sicht: vorhandene Sichtweite von Hand eingegeben (Regeln H1 bzw. E3 statt Sichtrechner).')}</p>}
      {b.annahmen.length > 0 && <p className="klein warnung">Annahmen und Schätzungen: {T(b.annahmen.join('; '))}.</p>}
      {b.hinweise.length > 0 && <p className="klein">{T(b.hinweise.join('; '))}.</p>}
    </div>
  )
}

/** Eingaben mit Wert und Quelle (Bericht): von Hand bzw. vorbelegt, je Block */
export function eingabenText(b: BefundBlatt): { gruppe: string; hand: string[]; vorbelegt: string[] }[] {
  return GRUPPEN.map(g => {
    const hand: string[] = [], vorbelegt: string[] = []
    for (const d of FELD_DEFS.filter(x => x.gruppe === g.id)) {
      const h = b.gebildet.herkunft.get(d.pfad)
      if (h?.zustand === 'hand') hand.push(`${d.name}: ${wertText(d, h.wert)} (${h.text})`)
      else if (h?.zustand === 'vorbelegt') vorbelegt.push(`${d.name}: ${wertText(d, h.vorbelegt!.wert)} (${QUELLE_TEXT[h.quelle!]}: ${h.text})`)
    }
    return { gruppe: g.name, hand, vorbelegt }
  }).filter(x => x.hand.length || x.vorbelegt.length)
}
