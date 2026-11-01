// ── Panel-Abschnitt «Regeln» (Nutzerwunsch 23.10.2026): alle Regeln des Katalogs, nach Thema oder nach Quelle, mit Filter und Suche ──
//
// Daten aus bedarf/regeluebersicht.ts. Gruppen zugeklappt mit Anzahl im Kopf; Sprünge aus der Quellentabelle (Werk) und aus den
// Details (Regel) kommen als Ereignis «fgs-regel». Nicht im Bericht.

import { Fragment, useEffect, useMemo, useState } from 'react'
import { THEMEN, themaName } from './bedarf/themen'
import { WERK_IDS, LESENAME } from './bedarf/quellen'
import type { WerkId } from './bedarf/katalog'
import type { Thema } from './bedarf/typen'
import { feldSpringen, regelAnker, regelGruppen, regelWerkAnker, regelZeilen, type Gliederung, type RegelFilter } from './bedarf/regeluebersicht'
import { QuelleMitVerweis } from './BedarfPanel'
import { hilfeZeigen } from './Verweise'
import { mitTiteln } from './bedarf/regelname'
import { abkLesbar } from './bedarf/quellen'

export function RegelUebersicht({ anfang = 'thema', anfangFilter = {} }: { anfang?: Gliederung; anfangFilter?: RegelFilter }) {
  const zeilen = useMemo(regelZeilen, [])
  const [nach, setNach] = useState<Gliederung>(anfang)
  const [f, setF] = useState<RegelFilter>(anfangFilter)
  const [ziel, setZiel] = useState<string | null>(null)
  // Sprung: Regel (Thema, ohne Filter) bzw. Werk (Quelle, gefiltert); nach dem Neuzeichnen zeigen und hervorheben
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; werk?: string }>).detail
      if (d.id) { setNach('thema'); setF({}); setZiel(regelAnker(d.id)) }
      else if (d.werk) { setNach('quelle'); setF({ werk: d.werk as WerkId }); setZiel(regelWerkAnker(d.werk)) }
    }
    window.addEventListener('fgs-regel', h)
    return () => window.removeEventListener('fgs-regel', h)
  }, [])
  useEffect(() => {
    if (!ziel) return
    const t = window.setTimeout(() => { hilfeZeigen(ziel); setZiel(null) }, 0)
    return () => window.clearTimeout(t)
  }, [ziel, nach, f])
  const gruppen = regelGruppen(zeilen, nach, f)
  const n = gruppen.filter(g => g.schluessel !== 'ablauf' && g.schluessel !== 'gestrichen')
  const aktiv = new Set(n.flatMap(g => g.zeilen.map(z => z.id))).size
  return <div className="regel-uebersicht">
    <p className="klein">Alle Regeln, die die App im Reiter «Bedarf und Querungstyp» anwendet: was sie prüft, Fundstelle, Geltung und
      nötige Angaben. Die Zahl «Regeln» in den Quellen der Prüfungen zählt die Regeln unter dem Werk.</p>
    <div className="klein regel-steuerung">
      <span role="radiogroup" aria-label="Gliederung">Gliederung:{' '}
        {(['thema', 'quelle'] as const).map(x => <label key={x}><input type="radio" name="regel-gliederung" checked={nach === x}
          onChange={() => setNach(x)} /> nach {x === 'thema' ? 'Thema' : 'Quelle'}</label>)}</span>{' '}
      <label>Werk: <select value={f.werk ?? ''} onChange={e => setF({ ...f, werk: e.target.value as WerkId | '' })}>
        <option value="">alle</option>{WERK_IDS.map(w => <option key={w} value={w}>{LESENAME[w]}</option>)}</select></label>{' '}
      <label>Thema: <select value={f.thema ?? ''} onChange={e => setF({ ...f, thema: e.target.value as Thema | '' })}>
        <option value="">alle</option>{THEMEN.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>{' '}
      <label>Suche: <input type="search" value={f.suche ?? ''} placeholder="Titel oder Nummer" onChange={e => setF({ ...f, suche: e.target.value })} /></label>
    </div>
    <p className="klein">{aktiv} Regeln{f.werk || f.thema || f.suche ? ' (gefiltert)' : ''}.</p>
    {gruppen.map(g => <Fragment key={g.schluessel}>{g.ober && <p className="themen-gruppe"><b>{abkLesbar(g.ober)}</b></p>}
      <details className="regel-gruppe" id={nach === 'quelle' && g.schluessel.startsWith('werk-') ? regelWerkAnker(g.schluessel.slice(5)) : undefined}>
      <summary><b>{g.name}</b> <span className="klein">({g.zeilen.length})</span></summary>
      <ul className="regel-liste">{g.zeilen.map(z => <li key={z.id} id={nach === 'thema' ? regelAnker(z.id) : undefined}>
        {/* Nutzertest 23.10.2026: kurz und in Alltagssprache, Nummer klein grau beim Titel */}
        <b>{z.titel}</b> <span className="regel-nr">({z.id})</span>{z.verbindlichkeit && <> · {z.verbindlichkeit}</>}
        {nach === 'quelle' && <span className="klein"> · {themaName(z.thema)}</span>}
        <dl className="regel-teile klein">
          <dt>Prüft:</dt><dd>{abkLesbar(mitTiteln(z.prueft))}</dd>
          <dt>Gilt für:</dt><dd title={z.giltGenau}>{z.giltFuer}</dd>
          <dt>Wo:</dt><dd>{abkLesbar(z.wo)}</dd>
          <dt>Quelle:</dt><dd><QuelleMitVerweis id={z.id} quelle="" /></dd>
          {z.angaben.length > 0 && <><dt>Braucht:</dt><dd>{z.angaben.map((a, i) => <Fragment key={a.pfad}>{i ? ' · ' : ''}
            {a.name}{' '}<button type="button" className="zweit klein" title="zum Feld springen: Wert ansehen bzw. ändern" aria-label={`zum Feld: ${a.name}`}
              onClick={() => feldSpringen(a.pfad)}>zum Feld</button></Fragment>)}</dd></>}
        </dl>
      </li>)}</ul>
    </details></Fragment>)}
  </div>
}
