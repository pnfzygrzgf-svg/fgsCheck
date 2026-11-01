// ── Werkzeuggruppe «Planen» (23.10.2026) und die Werkzeuge für «Eingaben von Hand» ──
//
// Planen (Streifen, Trottoirüberfahrt, Mittelinsel, Seitenraum, Fläche (Plan), Ecke runden, Fixpunkt) steht über der Reiterleiste und ist damit in
// beiden Reitern sichtbar, sobald ein Ort geladen ist; ohne Ort stehen «Streifen planen» und «Trottoirüberfahrt» in der Knopfzeile (beginnt einen neuen
// Fall). «Eingaben von Hand» behält die Korrekturen am Bestand. Reine Oberfläche: die Werkzeuge selbst bleiben in App.tsx.

import type { ReactNode } from 'react'
import type { Werkzeug } from './Karte'
import { FANG_PX } from './fixpunkt'
import { NACHLADEN_M } from './abdeckung'

type W = Exclude<Werkzeug, null>

/** Werkzeug, Name (Knopf) und Kurzhilfe (Tooltip bzw. Werkzeughilfe) */
export const WERKZEUGE: [W, string, string][] = [
  ['parkfeld', 'Parkfeld', 'Ecken anklicken, Doppelklick schliesst'],
  ['laengs', 'Längsparkierung', 'Mittellinie der Parkierung zeichnen, Doppelklick beendet'],
  ['baum', 'Baum', 'Stamm anklicken'],
  ['hecke', 'Hecke', 'Linie zeichnen, Doppelklick beendet'],
  ['mauer', 'Mauer', 'Linie zeichnen, Doppelklick beendet'],
  ['flaeche', 'übriges Hindernis', 'Fläche: Ecken anklicken, Doppelklick schliesst'],
  ['insel', 'Insel', 'Verkehrsinsel, die in der AV fehlt (z. B. markiert bzw. noch nicht erfasst): Ecken anklicken, Doppelklick ' +
    'schliesst; teilt den Streifen und ersetzt eine Insel aus OSM und Luftbild, die AV-Fahrbahn darunter bleibt. Eine geplante ' +
    'bauliche Insel besser als «Fläche (Plan)» mit Art Insel (Planen)'],
  // die gezeichneten Streifen heissen «Streifen von Hand»
  ['streifen', 'Streifen planen', 'beide Wartebereiche anklicken (Achse quer über die Fahrbahn)'],
  // Trottoirüberfahrt (23.10.2026): wie «Streifen planen», der Streifen bekommt gleich die Wahl «Trottoirüberfahrt»
  ['tue', 'Trottoirüberfahrt', 'beide Enden auf dem Trottoir der Hauptstrasse, links und rechts der Seitenstrasse anklicken; geprüft wird die Knotensicht der Ausfahrenden'],
  ['mittelinsel', 'Mittelinsel (Standard)', 'Schutzinsel mit Rollstuhlfurt nach Masterplan Fussverkehr Stadt Bern, Standards, E1, als ' +
    'Flächen (Plan) der Art Insel einfügen'],
  ['seitenraum', 'Vorgezogener Seitenraum', 'nahe einem Streifenende klicken: Fläche (Plan) Trottoir 0,20 m über die Parklinie ' +
    '(VSS 40 240 Z. 13.4: idealerweise mindestens) auf der Seite mit Längsparkierung; Auto-Parkierung darunter entfällt in der Rechnung'],
  ['planflaeche', 'Fläche (Plan)', 'geplante Bodenbedeckung (Trottoirnase, Fahrbahnverengung, verschobener Randstein, neue Insel): ' +
    `Ecken anklicken, die App fängt sie auf Stützpunkte der AV bzw. anderer Plan-Flächen (${FANG_PX} Bildschirmpunkte); ` +
    'Doppelklick schliesst. Ersetzt in der Rechnung die AV-Flächen darunter (Gebäude bleiben); die zuletzt gezeichnete gilt, wo ' +
    'sich Plan-Flächen überlappen'],
  ['eckeRunden', 'Ecke runden', 'eine Ecke einer Fläche (Plan) durch einen Kreisbogen ersetzen (Radius eingeben, Ecke auf der Karte ' +
    'anklicken), z. B. den geplanten Bordkantenradius an einer Einmündung'],
  ['fixpunkt', 'Fixpunkt', 'Gebäudeecke bzw. Punkt der AV anklicken: die App fängt den nächsten AV-Stützpunkt im Umkreis von ' +
    `${FANG_PX} Bildschirmpunkten, sonst freier Punkt. Für die Vermassung der Streifen von Hand, ohne Einfluss auf die Rechnung`],
  // Messen (27.10.2026): Strecke zwischen zwei Punkten, nicht im Fall
  ['messen', 'Messen', 'zwei Punkte anklicken; Fang auf Vermessungspunkte; Wert in ein Zahlenfeld übernehmen'],
]

/** Gruppe Planen, in dieser Reihenfolge */
export const PLAN_WERKZEUGE: W[] = ['streifen', 'tue', 'mittelinsel', 'seitenraum', 'planflaeche', 'eckeRunden', 'fixpunkt', 'messen']
/** «Eingaben von Hand»: Korrekturen am Bestand */
export const BESTAND_WERKZEUGE: W[] = ['parkfeld', 'laengs', 'baum', 'hecke', 'mauer', 'flaeche', 'insel']

export const istPlanWerkzeug = (w: Werkzeug): boolean => w !== null && PLAN_WERKZEUGE.includes(w)

/** Wo die Hilfe zum aktiven Werkzeug steht: unter der Knopfzeile (kein Ort geladen; Bestand-Werkzeug im Reiter Bedarf), in der
 * Gruppe Planen bzw. unter «Eingaben von Hand» */
export function hilfeOrt(w: Werkzeug, geladen: boolean, reiterBedarf: boolean): 'oben' | 'planen' | 'eingaben' {
  if (!geladen) return 'oben'
  if (istPlanWerkzeug(w)) return 'planen'
  return reiterBedarf ? 'oben' : 'eingaben'
}

const eintrag = (w: W) => WERKZEUGE.find(x => x[0] === w)!

/** «Streifen planen» und «Trottoirüberfahrt» in der Knopfzeile: nur ohne geladenen Ort (dort beginnt am Streifen ein neuer Fall;
 * Trottoirüberfahrt seit 27.10.2026 direkt) */
export function StreifenPlanenOben({ geladen, werkzeug, waehlen }: { geladen: boolean; werkzeug: Werkzeug; waehlen: (w: 'streifen' | 'tue') => void }) {
  if (geladen) return null
  const aktiv = werkzeug === 'streifen', tue = werkzeug === 'tue'
  return <><button type="button" className={aktiv ? 'aktiv' : 'zweit'} aria-pressed={aktiv} onClick={() => waehlen('streifen')}
    title={'Neuen Fussgängerstreifen zeichnen, auch ohne OSM-Übergang: beide Wartebereiche anklicken. Zum laufenden Fall kommt ' +
      `er, wenn er ganz innert ${NACHLADEN_M} m um den geladenen Ort liegt oder alle Streifen von Hand zusammen ganz innert ` +
      `${NACHLADEN_M} m um einen Ort liegen (dann lädt die App dort nach); sonst bzw. ohne geladenen Ort beginnt am Streifen ` +
      'ein neuer Fall. Die App lädt AV, OSM und Kataster um den Streifen, rechnet und vermasst ihn.'}>Streifen planen</button>
    {' '}<button type="button" className={tue ? 'aktiv' : 'zweit'} aria-pressed={tue} onClick={() => waehlen('tue')}
      title="Neue Trottoirüberfahrt: beide Enden auf dem Trottoir der Hauptstrasse, links und rechts der Seitenstrasse anklicken; die App lädt die Daten und prüft sie">Trottoirüberfahrt planen</button></>
}

/** Werkzeugknöpfe (aktiv hervorgehoben, aria-pressed); gesperrt: Werkzeug -> Grund (Knopf gesperrt, Grund als Tooltip) */
export function WerkzeugKnoepfe({ liste, werkzeug, waehlen, gesperrt = {} }: { liste: W[]; werkzeug: Werkzeug; waehlen: (w: W) => void
  gesperrt?: Partial<Record<W, string>> }) {
  return <div className="werkzeuge">
    {liste.map(w => {
      const [, name, hilfe] = eintrag(w)
      const grund = gesperrt[w]
      return <button key={w} type="button" className={werkzeug === w ? 'aktiv' : 'zweit'} aria-pressed={werkzeug === w}
        disabled={!!grund} title={grund ?? `${name}: ${hilfe}`} onClick={() => waehlen(w)}>{name}</button>
    })}
  </div>
}

/** Gruppe Planen: Knöpfe, Hilfe des aktiven Planen-Werkzeugs, aufklappbar die geplanten Elemente (anzahl > 0) */
export function PlanenGruppe({ geladen, werkzeug, waehlen, gesperrt, hilfe, anzahl, offen, setOffen, geplant }: { geladen: boolean
  werkzeug: Werkzeug; waehlen: (w: W) => void; gesperrt?: Partial<Record<W, string>>; hilfe: ReactNode; anzahl: number
  offen: boolean; setOffen: (x: boolean) => void; geplant: ReactNode }) {
  if (!geladen) return null
  return <section className="planen" aria-labelledby="planen-kopf">
    <h2 id="planen-kopf">Planen</h2>
    <WerkzeugKnoepfe liste={PLAN_WERKZEUGE} werkzeug={werkzeug} waehlen={waehlen} gesperrt={gesperrt} />
    {istPlanWerkzeug(werkzeug) && hilfe}
    {anzahl > 0 && <details className="geplant" open={offen} onToggle={e => setOffen(e.currentTarget.open)}>
      <summary>Geplante Elemente ({anzahl})</summary>
      {geplant}
    </details>}
  </section>
}
