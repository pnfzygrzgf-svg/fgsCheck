// ── Ortssuche über der Karte: Ort, Adresse, Strasse oder PLZ tippen, Vorschlag wählen -> Karte springt hin ──
//
// Abfrage beim SearchServer von swisstopo (daten/ortssuche.ts) erst nach einer Tipp-Pause von SUCHE_PAUSE_MS und ab
// SUCHE_MIN_ZEICHEN Zeichen (Enter sucht schon ab 2 Zeichen); eine neue Eingabe bricht die laufende Anfrage ab. Tastatur:
// Pfeile wählen, Enter übernimmt, Escape schliesst die Liste bzw. leert das Feld. Treffer werden nur als Text angezeigt.

import { useEffect, useId, useRef, useState } from 'react'
import { sucheOrt, type Ort } from './daten/ortssuche'
import { istAbbruch } from './daten/holen'

const SUCHE_PAUSE_MS = 300
const SUCHE_MIN_ZEICHEN = 3

export default function Ortssuche({ onOrt }: { onOrt: (o: Ort) => void }) {
  const [text, setText] = useState('')
  const [treffer, setTreffer] = useState<Ort[]>([])
  const [aktiv, setAktiv] = useState(-1)
  const [offen, setOffen] = useState(false)
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState('')
  const ctrlRef = useRef<AbortController | null>(null)
  const eingabeRef = useRef<HTMLInputElement>(null)
  const gewaehltRef = useRef('')                     // eben übernommener Text: keine neue Suche dafür
  const timerRef = useRef(0)                          // Entprellung (Enter löscht sie: keine zweite Abfrage)
  const listeId = useId()

  const suchen = (q: string) => {
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setLaedt(true); setFehler('')
    sucheOrt(q, ctrl.signal).then(t => {
      if (ctrl.signal.aborted) return
      setTreffer(t); setAktiv(t.length ? 0 : -1); setOffen(true); setLaedt(false)
    }, e => {
      if (istAbbruch(e) || ctrl.signal.aborted) return
      setTreffer([]); setOffen(false); setLaedt(false)
      setFehler(`Ortssuche nicht verfügbar (${(e as Error).message})`)
    })
  }

  // entprellt suchen, solange getippt wird
  useEffect(() => {
    const q = text.trim()
    if (q === gewaehltRef.current) return
    if (q.length < SUCHE_MIN_ZEICHEN) { ctrlRef.current?.abort(); setTreffer([]); setOffen(false); setLaedt(false); setFehler(''); return }
    timerRef.current = window.setTimeout(() => suchen(q), SUCHE_PAUSE_MS)
    return () => clearTimeout(timerRef.current)
  }, [text])
  useEffect(() => () => ctrlRef.current?.abort(), [])

  const waehlen = (o: Ort) => {
    gewaehltRef.current = o.text
    setText(o.text); setOffen(false); setTreffer([]); setAktiv(-1); setFehler('')
    eingabeRef.current?.blur()                        // Tastatur auf dem Telefon schliessen
    onOrt(o)
  }

  const taste = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!treffer.length) return
      e.preventDefault()
      setOffen(true)
      const d = e.key === 'ArrowDown' ? 1 : -1
      setAktiv(a => (a + d + treffer.length) % treffer.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (offen && treffer[aktiv]) waehlen(treffer[aktiv])
      else if (text.trim().length >= 2) { clearTimeout(timerRef.current); gewaehltRef.current = ''; suchen(text.trim()) }
    } else if (e.key === 'Escape') {
      e.preventDefault()                              // Suchfeld: Browser leert sonst selbst
      if (offen) setOffen(false)
      else { setText(''); setFehler('') }
    }
  }

  return (
    <div className="ortssuche">
      <input ref={eingabeRef} type="search" value={text} placeholder="Ort, Adresse oder Strasse suchen" aria-label="Ort, Adresse oder Strasse suchen"
        role="combobox" aria-autocomplete="list" aria-expanded={offen} aria-controls={listeId}
        aria-activedescendant={offen && aktiv >= 0 ? `${listeId}-${aktiv}` : undefined} autoComplete="off" spellCheck={false}
        onChange={e => { gewaehltRef.current = ''; setText(e.target.value) }} onKeyDown={taste}
        onFocus={() => { if (treffer.length) setOffen(true) }} onBlur={() => setOffen(false)} />
      {laedt && <span className="ortssuche-laedt" aria-hidden="true">…</span>}
      {offen && (
        <ul className="ortssuche-liste" id={listeId} role="listbox">
          {treffer.length === 0 && <li className="ortssuche-leer" role="option" aria-disabled="true" aria-selected={false}>Kein Treffer</li>}
          {treffer.map((o, i) => (
            <li key={`${o.art}|${o.text}|${i}`} id={`${listeId}-${i}`} role="option" aria-selected={i === aktiv}
              className={i === aktiv ? 'aktiv' : undefined}
              // mousedown statt click: das Feld verliert den Fokus sonst vor dem Klick und schliesst die Liste
              onMouseDown={e => { e.preventDefault(); waehlen(o) }} onMouseEnter={() => setAktiv(i)}>
              <span className="ortssuche-text">{o.text}</span> <span className="ortssuche-art">{o.zusatz}</span>
            </li>
          ))}
        </ul>
      )}
      {fehler && <div className="ortssuche-fehler" role="status">{fehler}</div>}
    </div>
  )
}
