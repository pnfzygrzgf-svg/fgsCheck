// Tests Werkzeuggruppe «Planen» (23.10.2026, Planen.tsx): Gruppe über der Reiterleiste in beiden Reitern mit allen sieben Knöpfen (seit 23.10.2026 mit «Trottoirüberfahrt»),
// ohne Ort nur «Streifen planen» in der Knopfzeile; «Eingaben von Hand» ohne Planen-Werkzeuge; Hilfe und geplante Elemente in der
// Gruppe, Hilfe der Bestand-Werkzeuge unter «Eingaben von Hand».

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReiterAnsicht } from './ReiterLeiste'
import { BESTAND_WERKZEUGE, PLAN_WERKZEUGE, PlanenGruppe, StreifenPlanenOben, WERKZEUGE, WerkzeugKnoepfe, hilfeOrt } from './Planen'

const PLAN_NAMEN = ['Streifen planen', 'Trottoirüberfahrt', 'Mittelinsel (Standard)', 'Vorgezogener Seitenraum', 'Fläche (Plan)', 'Ecke runden', 'Fixpunkt', 'Messen']
const BESTAND_NAMEN = ['Parkfeld', 'Längsparkierung', 'Baum', 'Hecke', 'Mauer', 'übriges Hindernis', 'Insel']
const knoepfe = (html: string): string[] => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(m => m[1])
const nichts = () => {}
const gruppeTitel = (w: 'tue') => /title="([^"]*)"[^>]*>Trottoirüberfahrt</.exec(renderToStaticMarkup(<PlanenGruppe geladen werkzeug={null}
  waehlen={nichts} hilfe={null} anzahl={0} offen={false} setOffen={nichts} geplant={null} />))?.[1] ?? w

describe('Werkzeuggruppe Planen', () => {
  it('Gruppe über der Reiterleiste, in beiden Reitern sichtbar, acht Knöpfe in der Reihenfolge (seit 27.10.2026 mit «Messen»); aktiver Knopf hervorgehoben', () => {
    for (const aktiv of ['sicht', 'bedarf'] as const) {
      const html = renderToStaticMarkup(<ReiterAnsicht mitReitern aktiv={aktiv} waehlen={nichts} zustand={null}
        sicht={<p>SICHT</p>} bedarf={<p>BEDARF</p>}
        kopf={<PlanenGruppe geladen werkzeug="seitenraum" waehlen={nichts} hilfe={null} anzahl={0} offen={false} setOffen={nichts}
          geplant={null} />} />)
      const gruppe = html.slice(html.indexOf('<section class="planen"'), html.indexOf('</section>'))
      expect(html.indexOf('<section class="planen"')).toBeGreaterThanOrEqual(0)
      // vor der Reiterleiste und nicht in einem (verborgenen) Reiterfeld
      expect(html.indexOf('<section class="planen"')).toBeLessThan(html.indexOf('role="tablist"'))
      expect(html.indexOf('</section>')).toBeLessThan(html.indexOf('class="reiterfeld'))
      expect(gruppe).toContain('>Planen</h2>')
      expect(knoepfe(gruppe)).toEqual(PLAN_NAMEN)
      expect(gruppe).toMatch(/class="aktiv" aria-pressed="true"[^>]*>Vorgezogener Seitenraum</)
      expect(gruppe.match(/aria-pressed="true"/g)).toHaveLength(1)
    }
    expect(PLAN_WERKZEUGE.map(w => WERKZEUGE.find(x => x[0] === w)![1])).toEqual(PLAN_NAMEN)
    // «Trottoirüberfahrt» direkt nach «Streifen planen», mit eigener Kurzhilfe
    expect(PLAN_WERKZEUGE.indexOf('tue')).toBe(PLAN_WERKZEUGE.indexOf('streifen') + 1)
    expect(gruppeTitel('tue')).toBe('Trottoirüberfahrt: über eine Einmündung: beide Enden anklicken; geprüft wird die Knotensicht der Einbiegenden')
    // gesperrt (Ecke runden ohne Fläche (Plan)): Knopf gesperrt, Grund als Tooltip
    const g = renderToStaticMarkup(<PlanenGruppe geladen werkzeug={null} waehlen={nichts} hilfe={null} anzahl={0} offen={false}
      setOffen={nichts} geplant={null} gesperrt={{ eckeRunden: 'zuerst eine Fläche (Plan)' }} />)
    expect(g).toMatch(/disabled="" title="zuerst eine Fläche \(Plan\)"[^>]*>Ecke runden</)
  })

  it('ohne Ort: nur «Streifen planen» und «Trottoirüberfahrt» oben, keine Gruppe; mit Ort: oben keiner (keine Doppelung)', () => {
    const oben = renderToStaticMarkup(<StreifenPlanenOben geladen={false} werkzeug={null} waehlen={nichts} />)
    expect(knoepfe(oben)).toEqual(['Streifen planen', 'Trottoirüberfahrt'])
    // Trottoirüberfahrt gewählt: dieser Knopf aktiv; die Hilfe steht oben
    expect(renderToStaticMarkup(<StreifenPlanenOben geladen={false} werkzeug="tue" waehlen={nichts} />)).toMatch(/class="aktiv" aria-pressed="true"[^>]*>Trottoirüberfahrt</)
    expect(hilfeOrt('tue', false, false)).toBe('oben')
    expect(renderToStaticMarkup(<PlanenGruppe geladen={false} werkzeug={null} waehlen={nichts} hilfe={null} anzahl={2} offen
      setOffen={nichts} geplant={<p>LISTE</p>} />)).toBe('')
    expect(renderToStaticMarkup(<StreifenPlanenOben geladen werkzeug={null} waehlen={nichts} />)).toBe('')
    // Hilfe ohne Ort oben; mit Ort Planen-Werkzeuge in der Gruppe, Bestand unter «Eingaben von Hand» (im Reiter Bedarf oben)
    expect(hilfeOrt('streifen', false, false)).toBe('oben')
    for (const w of PLAN_WERKZEUGE) { expect(hilfeOrt(w, true, false)).toBe('planen'); expect(hilfeOrt(w, true, true)).toBe('planen') }
    for (const w of [...BESTAND_WERKZEUGE, 'spurB'] as const) {
      expect(hilfeOrt(w, true, false)).toBe('eingaben'); expect(hilfeOrt(w, true, true)).toBe('oben')
    }
  })

  it('«Eingaben von Hand» ohne Planen-Werkzeuge; Hilfe und geplante Elemente in der Gruppe', () => {
    const bestand = renderToStaticMarkup(<WerkzeugKnoepfe liste={BESTAND_WERKZEUGE} werkzeug={null} waehlen={nichts} />)
    expect(knoepfe(bestand)).toEqual(BESTAND_NAMEN)
    for (const n of PLAN_NAMEN) expect(knoepfe(bestand)).not.toContain(n)
    // jedes Werkzeug genau in einer Gruppe
    expect(new Set([...PLAN_WERKZEUGE, ...BESTAND_WERKZEUGE]).size).toBe(WERKZEUGE.length)
    // Hilfe nur, wenn ein Planen-Werkzeug aktiv ist; geplante Elemente aufklappbar mit Anzahl
    const mit = (werkzeug: 'mittelinsel' | 'baum', offen: boolean) => renderToStaticMarkup(<PlanenGruppe geladen werkzeug={werkzeug}
      waehlen={nichts} hilfe={<div className="werkzeughilfe">HILFE</div>} anzahl={3} offen={offen} setOffen={nichts}
      geplant={<h3>Streifen von Hand</h3>} />)
    expect(mit('mittelinsel', false)).toContain('HILFE')
    expect(mit('baum', false)).not.toContain('HILFE')
    expect(mit('baum', false)).toMatch(/<details class="geplant"><summary>Geplante Elemente \(3\)<\/summary><h3>Streifen von Hand<\/h3><\/details>/)
    expect(mit('baum', true)).toContain('<details class="geplant" open="">')
    expect(renderToStaticMarkup(<PlanenGruppe geladen werkzeug={null} waehlen={nichts} hilfe={null} anzahl={0} offen setOffen={nichts}
      geplant={<p>LISTE</p>} />)).not.toContain('Geplante Elemente')
  })
})
