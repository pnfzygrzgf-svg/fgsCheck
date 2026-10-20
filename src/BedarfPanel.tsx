// ── Bedarfsmodul E1: Abschnitt «Bedarf und Querungstyp» im Panel (Eingabemaske, Ebenen, Befundblatt) und Befundblatt im Bericht ──
//
// Die Eingaben gelten je Fall (eine Querung, auch mit Teilstreifen an einer Insel); vorbelegt wird je Querung aus der Rechnung
// (bedarf/vorbelegung.ts), eine Handeingabe überschreibt die Vorbelegung (Quelle wählbar: von Hand, Schätzung, Annahme).
// Leere Felder sind «offen». Das Befundblatt (bedarf/befundblatt.ts) steht im Panel oberhalb des Sichtbefunds und im Bericht.

import { useEffect, useState } from 'react'
import type { Fall } from './fall'
import { FELD_DEFS, GRUPPEN, gruppenName, type FeldDef, type GruppeId } from './bedarf/felder'
import { HAND_QUELLEN, QUELLE_TEXT, handSetzen, handPruefen, ebeneSetzen, type BedarfEbenen, type Herkunft } from './bedarf/fallBedarf'
import type { BefundBlatt } from './bedarf/befundblatt'
import type { Eintrag } from './bedarf/typen'
import type { Quelle } from './bedarf/eingaben'

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
    // letztes Häkchen weg: wieder offen (bzw. vorbelegt); «keines» ist eine eigene Angabe
    return <span className="bedarf-liste" role="group" aria-label={d.name}>
      {a.optionen.map(([k, t]) => <label key={k}><input type="checkbox" checked={!!liste?.includes(k)} onChange={e => {
        const neu = new Set(liste ?? [])
        if (e.target.checked) neu.add(k); else neu.delete(k)
        const x = a.optionen.map(o => o[0]).filter(o => neu.has(o))
        setze(x.length ? x : null)
      }} /> {t}</label>)}
      <label><input type="checkbox" checked={!!liste && !liste.length} onChange={e => setze(e.target.checked ? [] : null)} /> keines</label>
    </span>
  }
  return <TextEingabe d={d} wert={hand ? h.wert : null} platzhalter={vor ? wertText(d, vor.wert) : 'offen'} setze={setze} />
}

/** Herkunft eines Felds: Quelle der Handeingabe (wählbar) bzw. der Vorbelegung */
function HerkunftZelle({ d, h, quelle, zurueck }: { d: FeldDef; h: Herkunft; quelle: (q: Quelle) => void; zurueck: () => void }) {
  if (h.zustand === 'hand') return <>
    <select className="klein" value={h.quelle ?? 'hand'} aria-label={`Quelle: ${d.name}`} title="Quelle der Handeingabe (erscheint im Befund; Annahmen und Schätzungen sind ausgewiesen)"
      onChange={e => quelle(e.target.value as Quelle)}>
      {HAND_QUELLEN.map(q => <option key={q} value={q}>{QUELLE_TEXT[q]}</option>)}
    </select>{' '}
    <button className="zweit klein" title={h.vorbelegt ? `Handeingabe entfernen: wieder vorbelegt (${h.vorbelegt.text})` : 'Handeingabe entfernen: offen'}
      aria-label={`${d.name}: Handeingabe entfernen`} onClick={zurueck}>zurück</button>
  </>
  if (h.zustand === 'vorbelegt') return <span className="klein" title={`${d.name}: ${h.text}`}>{QUELLE_TEXT[h.quelle!]}: {h.text}</span>
  return <span className="klein">offen</span>
}

/** Eingabemaske nach Blöcken */
function Maske({ fall, blatt, aendern }: { fall: Fall; blatt: BefundBlatt; aendern: (f: (x: Fall) => Fall) => void }) {
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
  return <>{GRUPPEN.map(g => {
    const defs = FELD_DEFS.filter(d => d.gruppe === g.id)
    const hs = defs.map(d => herkunft(d.pfad))
    const n = (z: Herkunft['zustand']) => hs.filter(h => h.zustand === z).length
    return <details key={g.id} className="bedarf-gruppe">
      <summary className="klein"><b>{g.name}</b> ({n('hand')} von Hand, {n('vorbelegt')} vorbelegt, {n('offen')} offen)</summary>
      <table className="bedarf-maske"><tbody>{defs.map((d, i) => {
        const h = hs[i]
        return <tr key={d.pfad} className={h.zustand === 'offen' ? 'offen' : undefined}>
          <td title={d.hilfe}>{d.name}</td>
          <td><FeldEingabe d={d} h={h} setze={x => setze(d.pfad, x, (fall.bedarf?.felder[d.pfad]?.quelle) ?? d.quelle ?? 'hand')} />
            {fehler[d.pfad] && <div className="klein fehler" role="alert">{fehler[d.pfad]}</div>}</td>
          <td><HerkunftZelle d={d} h={h} quelle={q => setze(d.pfad, fall.bedarf?.felder[d.pfad]?.wert, q)} zurueck={() => setze(d.pfad, null, 'hand')} /></td>
        </tr>
      })}</tbody></table>
    </details>
  })}</>
}

const ebeneText: Record<keyof BedarfEbenen, string> = {
  bern: 'Bern (Masterplan Fussverkehr, Handbuch LSA, Standards Veloinfrastruktur)', kantonBE: 'Kanton BE (Arbeitshilfe Fussgängerstreifen)',
  richtlinie: 'Richtlinien (bfu, Hindernisfreie Architektur): nur Hinweise',
}

/** Abschnitt im Panel: Ebenen, Befundblatt je Querung, Eingabemaske */
export function BedarfAbschnitt({ fall, blaetter, vorgabe, aendern }: { fall: Fall; blaetter: BefundBlatt[]
  vorgabe: { bern: boolean; kantonBE: boolean }; aendern: (f: (x: Fall) => Fall) => void }) {
  if (!blaetter.length) return null
  const b0 = blaetter[0]
  const schalten = (k: keyof BedarfEbenen, an: boolean) => aendern(f => {
    const v = k === 'richtlinie' ? true : vorgabe[k]
    const b = ebeneSetzen(f.bedarf, k, an === v ? null : an)
    if (b) f.bedarf = b; else delete f.bedarf
    return f
  })
  return (
    <details className="abschnitt bedarf">
      <summary><h2>Bedarf und Querungstyp</h2> <span className="klein">{blaetter.map(b => b.typText).join(' · ')}</span></summary>
      <p className="klein">Darf hier ein Fussgängerstreifen hin, welcher Querungstyp passt, welche Elemente und Masse braucht er? Beurteilt
        nach VSS 40 241, 40 240 und weiteren Normen (nur Ziffern und eigene Kurztexte). Vorbelegt ist, was die Rechnung kennt; alles
        Übrige von Hand eingeben, leere Felder bleiben offen und zählen nie als erfüllt. Die Sicht kommt aus dem Sichtrechner unten.</p>
      <div className="klein bedarf-ebenen">Ebenen (Recht und Norm immer):{' '}
        {(['bern', 'kantonBE', 'richtlinie'] as const).map(k => <label key={k} title={k === 'richtlinie' ? 'Vorgabe: an' :
          `Vorgabe nach dem Ort (AV): ${vorgabe[k] ? 'an' : 'aus'}`}>
          <input type="checkbox" checked={b0.ebenen[k]} onChange={e => schalten(k, e.target.checked)} /> {ebeneText[k]}
          {fall.bedarf?.ebenen?.[k] !== undefined ? ' (von Hand)' : ''}</label>)}
      </div>
      {blaetter.map(b => <BefundblattAnzeige key={b.gruppe} b={b} mehrere={blaetter.length > 1} />)}
      <h3>Eingaben{blaetter.length > 1 ? ` (gelten für alle Querungen; vorbelegt nach ${b0.titel})` : ''}</h3>
      <Maske fall={fall} blatt={b0} aendern={aendern} />
    </details>
  )
}

function eintragZeile(x: Eintrag): string {
  const masse = x.ist !== undefined || x.soll !== undefined
    ? ` (Ist ${x.ist ?? '–'}${x.einheit && x.ist !== undefined ? ` ${x.einheit}` : ''}; Soll ${x.soll ?? '–'}${x.einheit && x.soll !== undefined ? ` ${x.einheit}` : ''})` : ''
  return `${x.text}${masse}${x.detail ? `; ${x.detail}` : ''}`
}

function EintragListe({ titel, liste, klasse, ebene = false }: { titel: string; liste: Eintrag[]; klasse: string; ebene?: boolean }) {
  if (!liste.length) return null
  return <div className={`befund-liste ${klasse}`}>
    <b>{titel} ({liste.length})</b>
    <ul>{liste.map((x, i) => <li key={x.id + i}><b>{x.id}</b>{ebene ? ` [${x.ebene}]` : ''} {eintragZeile(x)}
      <span className="klein"> · {x.quelle}</span>
      {x.normHinweis && <div className="klein">{x.normHinweis}</div>}</li>)}</ul>
  </div>
}

/** Befundblatt einer Querung (Panel und Bericht) */
export function BefundblattAnzeige({ b, mehrere = false, druck = false }: { b: BefundBlatt; mehrere?: boolean; druck?: boolean }) {
  const { befund } = b
  const offenNach = new Map<GruppeId | 'sonst', typeof b.offen>()
  for (const o of b.offen) offenNach.set(o.gruppe ?? 'sonst', [...(offenNach.get(o.gruppe ?? 'sonst') ?? []), o])
  const lokal = befund.lokal
  const lokalAn = b.ebenen.bern || b.ebenen.kantonBE
  // Masse: bekannte Werte als Tabelle, die übrigen (Ist offen) als eine Zeile
  const masse = befund.masse.filter(mz => !(mz.zustand === 'offen' && mz.ist === '–'))
  const masseOffen = befund.masse.filter(mz => mz.zustand === 'offen' && mz.ist === '–').map(mz => mz.groesse)
  return (
    <div className={druck ? 'befundblatt druck' : 'befundblatt'}>
      {(mehrere || druck) && <h3>{mehrere ? `Querung ${b.titel}` : b.titel}</h3>}
      <p className="befund-typ"><b>Empfohlen:</b> {b.typText}</p>
      {b.begruendung && <p className="klein">{b.begruendung}.</p>}
      {befund.empfehlung.zusatz.length > 0 && <p className="klein">Zusätzlich: {befund.empfehlung.zusatz.join('; ')}.</p>}
      <EintragListe titel="Pflichtverletzungen" liste={befund.norm.verletzungen} klasse="rot" />
      <EintragListe titel="Nur mit verkehrstechnischem Bericht" liste={befund.norm.bericht} klasse="rot" />
      <EintragListe titel="Empfehlungen" liste={befund.norm.empfehlungen} klasse="gelb" />
      <EintragListe titel="Hinweise" liste={befund.norm.hinweise} klasse="blau" />
      {b.offen.length > 0 && <div className="befund-liste grau">
        <b>Offen ({befund.norm.offen.length + lokal.offen.length} Regeln; fehlende Eingaben nach Block)</b>
        <ul>{[...offenNach].map(([g, os]) => <li key={g}>{g === 'sonst' ? 'Weitere' : gruppenName(g)}: {os.map(o =>
          `${o.name} (${o.regeln.join(', ')})`).join('; ')}</li>)}</ul>
      </div>}
      {b.nichtGeprueft.length > 0 && <div className="befund-liste grau"><b>Nicht geprüft</b>
        <ul>{b.nichtGeprueft.map(x => <li key={x.block}>{x.block}: {x.grund}</li>)}</ul></div>}
      {masse.length > 0 && <table className={druck ? 'bericht-tabelle befund-masse' : 'befund-masse'}>
        <thead><tr><th>Mass</th><th>Soll</th><th>Ist</th><th>Stand</th></tr></thead>
        <tbody>{masse.map(mz => <tr key={mz.groesse} className={mz.zustand}>
          <td>{mz.groesse}<div className="klein">{mz.regeln.join(', ')}</div></td>
          <td>{mz.soll ? `${mz.soll}${mz.einheit && !/[a-z]/.test(mz.soll) ? ` ${mz.einheit}` : ''}` : '–'}</td>
          <td>{mz.ist}{mz.einheit && /^[\d,./ −-]+$/.test(mz.ist) ? ` ${mz.einheit}` : ''}</td>
          <td>{mz.zustand === 'verletzt' ? 'nicht erfüllt' : mz.zustand === 'offen' ? 'offen' : 'erfüllt'}</td></tr>)}</tbody>
      </table>}
      {masseOffen.length > 0 && <p className="klein">Masse offen (Eingabe fehlt): {masseOffen.join(', ')}.</p>}
      {lokalAn && <div className="befund-lokal">
        <b>Ebene {[b.ebenen.bern ? 'Bern' : '', b.ebenen.kantonBE ? 'Kanton BE' : ''].filter(Boolean).join(' und ')}</b>
        {!lokal.verletzungen.length && !lokal.bericht.length && !lokal.empfehlungen.length && !lokal.hinweise.length && !lokal.offen.length &&
          <span className="klein"> – keine Befunde</span>}
        <EintragListe titel="Pflichtverletzungen" liste={lokal.verletzungen} klasse="rot" ebene />
        <EintragListe titel="Nur mit verkehrstechnischem Bericht" liste={lokal.bericht} klasse="rot" ebene />
        <EintragListe titel="Empfehlungen" liste={lokal.empfehlungen} klasse="gelb" ebene />
        <EintragListe titel="Hinweise" liste={lokal.hinweise} klasse="blau" ebene />
        {lokal.offen.length > 0 && <p className="klein">Offen: {lokal.offen.map(x => x.id).join(', ')}</p>}
      </div>}
      {!lokalAn && <p className="klein">Ebenen Bern und Kanton BE ausgeschaltet.</p>}
      {b.sicht.length > 0 && <p className="klein">Sicht (Sichtrechner, {b.sicht[0].regel === 'E3' ? 'VSS 40 240 Z. 8.2' : 'VSS 40 241 Tab. 1'}):{' '}
        {b.sicht.map(x => `${x.name} ${x.frei ? (x.bisM !== undefined ? `frei bis ${x.bisM} m, darüber nicht geprüft` : 'frei') : x.status} ` +
          `(Soll ${String(x.soll).replace('.', ',')} m)`).join('; ')}.</p>}
      {b.sichtVonHand && <p className="klein">Sicht: vorhandene Sichtweite von Hand eingegeben (Regeln H1 bzw. E3 statt Sichtrechner).</p>}
      {b.annahmen.length > 0 && <p className="klein warnung">Annahmen und Schätzungen: {b.annahmen.join('; ')}.</p>}
      {b.hinweise.length > 0 && <p className="klein">{b.hinweise.join('; ')}.</p>}
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
