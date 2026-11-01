// ── Verweise auf Werke und Fundstellen (Panel): in die Quellen der Prüfungen, auf den Begriff «Projektentscheid», nach fedlex bzw. ins
// PDF des Herausgebers. Eigenes Modul, damit Bedarf-Abschnitt, Hilfe und App dieselben Verweise nutzen (23.10.2026). ──

import { Fragment } from 'react'
import type { WerkId } from './bedarf/katalog'
import { BEGRIFFE } from './bedarf/begriffe'
import { verweisTeile, verweisText, werkAnker, werkBezug, werkLinks, werkTooltip, werkVoll, type WerkLink } from './bedarf/quellen'
import { reiterZeigen } from './reiter'
import { regelnJeWerk } from './bedarf/quellen'

let zeilenCache: Set<string> | null = null
/** Werke mit einer Zeile in den Quellen der Prüfungen (mindestens eine aktive Regel; wie QuellenTabelle) */
const mitZeile = (): Set<string> => (zeilenCache ??= new Set([...regelnJeWerk()].filter(([w, n]) => w !== 'ENTSCHEID' && n > 0).map(([w]) => w)))

/**
 * Zu einem Ziel im Panel springen (Runde 4; seit 23.10.2026 Quellen im Abschnitt «Grundlagen und Quellen», Begriffe im Abschnitt
 * «Begriffe»): übergeordnete Aufklapper öffnen, zeigen und kurz hervorheben. false, wenn es ihn nicht gibt (Bericht, Test): dann
 * folgt der Link seinem Anker
 */
export function hilfeZeigen(anker: string): boolean {
  if (typeof document === 'undefined') return false
  const el = document.getElementById(anker)
  if (!el) return false
  const zeigen = () => {
    for (let d: HTMLElement | null = el; d; d = d.parentElement) if (d instanceof HTMLDetailsElement) d.open = true
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('hervor')
    window.setTimeout(() => el.classList.remove('hervor'), 1600)
  }
  // Ziel in einem verborgenen Reiter (reiter.ts): erst den Reiter zeigen, nach dem Neuzeichnen scrollen
  if (reiterZeigen(el)) window.setTimeout(zeigen, 0); else zeigen()
  return true
}

/** Werk im Lesetext: Verweis innerhalb der App auf seine Zeile in «Grundlagen und Quellen» (voller Titel und Beschreibung als
 * Tooltip); im Bericht reiner Text */
/** Erklärung des Begriffs «Projektentscheid» (Tooltip) */
const PROJEKT_BEGRIFF = BEGRIFFE.find(b => b.id === 'projektentscheid')?.text ?? ''
export function WerkVerweis({ w, anzeige, druck = false }: { w: WerkId; anzeige: string; druck?: boolean }) {
  if (druck) return <>{anzeige}</>
  // Werk ohne Zeile in den Quellen der Prüfungen (keine aktive Regel, z. B. nur gestrichene): nur der Name, kein toter Verweis
  if (w !== 'ENTSCHEID' && !mitZeile().has(w)) return <>{anzeige}</>
  // Projektentscheid: kein externes Werk, Verweis auf den Begriff (Nutzerentscheid 23.10.2026)
  if (w === 'ENTSCHEID') return <a href="#begriff-projektentscheid" className="werk-link" title={PROJEKT_BEGRIFF}
    onClick={e => { if (hilfeZeigen('begriff-projektentscheid')) e.preventDefault() }}>{anzeige}</a>
  return <a href={`#${werkAnker(w)}`} className="werk-link" title={werkTooltip(w)}
    onClick={e => { if (hilfeZeigen(werkAnker(w))) e.preventDefault() }}>{anzeige}</a>
}
/** Fundstelle mit direktem Link (Artikel in fedlex, Seite im PDF), PDF gekennzeichnet; im Bericht reiner Text */
export function FundstelleLink({ text, link, w, druck = false }: { text: string; link: WerkLink | null; w: WerkId; druck?: boolean }) {
  if (druck || !link) return <>{text}</>
  return <a href={link.url} target="_blank" rel="noopener" className="werk-extern"
    title={`${werkVoll(w)}, ${text}${link.art === 'pdf' ? ' (PDF beim Herausgeber)' : ' beim Herausgeber'}, neues Fenster`}>
    {text}{link.art === 'pdf' ? ' (PDF)' : ''} ↗</a>
}

/** http(s)-Adresse im Lesetext (30.10.2026, z. B. Verweis auf KnotenCheck im Normhinweis); Satzzeichen am Ende gehören nicht dazu */
const URL_MUSTER = /https?:\/\/[^\s()«»"]+[^\s()«»".,;:]/g
/** Text mit http(s)-Adressen als Links (neues Fenster); übriger Text unverändert */
export function MitLinks({ text }: { text: string }) {
  const teile: (string | { url: string })[] = []
  let i = 0
  for (const m of text.matchAll(URL_MUSTER)) {
    if (m.index! > i) teile.push(text.slice(i, m.index))
    teile.push({ url: m[0] })
    i = m.index! + m[0].length
  }
  if (i < text.length) teile.push(text.slice(i))
  return <>{teile.map((x, k) => (typeof x === 'string' ? <Fragment key={k}>{x}</Fragment>
    : <a key={k} href={x.url} target="_blank" rel="noopener" className="werk-extern" title={`${x.url} (neues Fenster)`}>{x.url}</a>))}</>
}

/** Lesetext mit Werkverweisen (Begründung, Normhinweise, Feldhilfen): Abkürzungen ausgeschrieben, Werke verlinkt, Artikel mit fedlex;
 * http(s)-Adressen als Links (30.10.2026; im Bericht als Text) */
export function VerweisText({ text, druck = false }: { text: string | undefined; druck?: boolean }) {
  if (!text) return null
  if (druck) return <>{verweisText(text)}</>
  return <>{verweisTeile(text).map((x, i) => ('text' in x ? <MitLinks key={i} text={x.text} />
    : <Fragment key={i}><WerkVerweis w={x.werk} anzeige={x.anzeige} />{x.ziffer && <>, <FundstelleLink text={x.ziffer.text} link={x.ziffer.link} w={x.werk} /></>}</Fragment>))}</>
}

/** externe Links eines Werks beim Herausgeber (neues Fenster, ↗; PDF gekennzeichnet, mit Grösse); kurz: nur ein Link (die Seite,
 * sonst das PDF) als «↗» bzw. «PDF ↗»; sonst «Seite ↗ · PDF, 0,2 MB ↗» und der Vermerk zum Bezug (z. B. «kostenpflichtig») */
export function WerkLinks({ w, kurz = false }: { w: WerkId; kurz?: boolean }) {
  const links = werkLinks(w), bezug = werkBezug(w)
  if (kurz) {
    const l = links[0]
    return l ? <> <a href={l.url} target="_blank" rel="noopener" className="werk-extern"
      title={`${werkVoll(w)}: ${l.art === 'pdf' ? `${l.text} beim Herausgeber` : 'Seite des Herausgebers'}, neues Fenster`}
      aria-label={`${werkVoll(w)}, ${l.art === 'pdf' ? l.text : 'Seite des Herausgebers'} (neues Fenster)`}>{l.art === 'pdf' ? 'PDF ↗' : '↗'}</a></> : null
  }
  return <span className="werk-links">{links.map((l, i) => <Fragment key={l.url}>{i ? ' · ' : ''}<a href={l.url} target="_blank"
    rel="noopener" className="werk-extern" title={`${werkVoll(w)}: ${l.art === 'pdf' ? `${l.text} beim Herausgeber` : 'Seite des Herausgebers'}, neues Fenster`}>
    {l.text} ↗</a></Fragment>)}
    {bezug ? <span className="klein">{links.length ? ' ' : ''}({bezug})</span> : null}</span>
}

