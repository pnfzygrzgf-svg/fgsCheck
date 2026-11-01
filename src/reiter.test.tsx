// Tests Reiter im Panel (22.10.2026): Vorgabe nach dem Fall, Wechsel bei Sprung und Pfeiltasten, Zustand und Teaser (reiter.ts);
// Leiste und beide Reiterfelder mit Rollen und aria (ReiterLeiste.tsx), Bedarfsabschnitt offen mit eigenem Kopf, ohne nackte Nummern.
// Künstliche Strasse wie die Bedarfs-Tests: Hauptstrasse West–Ost (y = 0), Fahrbahn 8 m, Tempo 50 (OSM), Übergang bei x = 0.

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { wgs, type P } from './geo'
import type { OsmDaten, OsmKnoten, OsmWeg } from './daten/osm'
import type { AvFlaeche } from './daten/av'
import { rechneFall } from './rechner/index'
import { leererFall } from './fall'
import { befundblaetter } from './bedarf/befundblatt'
import { nummernOhneTitel } from './bedarf/regelname'
import { BedarfAbschnitt, kopfText } from './BedarfPanel'
import { BedarfTeaser, ReiterAnsicht } from './ReiterLeiste'
import { reiterAktiv, reiterNachSprung, reiterStand, reiterTaste, reiterVorgabe, reiterZustand, teaserText } from './reiter'

const O: P = [2600000, 1200000]
const ll = (x: number, y: number): [number, number] => wgs(O[0] + x, O[1] + y)
const lv = (x: number, y: number): P => [O[0] + x, O[1] + y]
const rechteck = (x0: number, y0: number, x1: number, y1: number): P[] => [lv(x0, y0), lv(x1, y0), lv(x1, y1), lv(x0, y1)]
const av = (art: string, ring: P[]): AvFlaeche => ({ art, kanton: 'BE', qualitaet: 'AV93', bfs: 351, ringe: [[...ring, ring[0]]] })
const weg = (id: number, knoten: [number, number, number][], tags: Record<string, string>): OsmWeg =>
  ({ id, tags, knoten: knoten.map(k => k[0]), geom: knoten.map(k => ll(k[1], k[2])) })
const knoten = (id: number, x: number, y: number, tags: Record<string, string>): OsmKnoten => ({ id, tags, lat: ll(x, y)[0], lon: ll(x, y)[1] })
const OSM: OsmDaten = { wege: [weg(1, [[10, -300, 0], [12, 0, 0], [13, 300, 0]], { highway: 'tertiary', name: 'Hauptstrasse', maxspeed: '50' })],
  tram: [], ampeln: [], querungen: [], relationen: [], uebergaenge: [knoten(12, 0, 0, { highway: 'crossing', crossing: 'marked' })] }
const AV: AvFlaeche[] = [av('Strasse_Weg', rechteck(-300, -4, 300, 4)), av('Trottoir', rechteck(-300, 4, 300, 7)), av('Trottoir', rechteck(-300, -7, 300, -4))]
// sichtbarer Text wie im Browser: Tags weg, Leerraum zusammengefasst
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ')

describe('Reiter Sichtprüfung / Bedarf und Querungstyp', () => {
  it('Logik: Vorgabe nach Fall, gemerkte Wahl, Sprung, Pfeiltasten, Zustand in Wort und Symbol, Teaser', () => {
    // bestehender Übergang mit Streifen → Sichtprüfung; Planung bzw. Querung ohne Streifen → Bedarf
    expect(reiterVorgabe({ uebergang: 12, streifenQuelle: 'osm', markierung: 'markiert' })).toBe('sicht')
    expect(reiterVorgabe({ uebergang: 12, streifenQuelle: 'luftbild', markierung: 'vermutlich' })).toBe('sicht')
    expect(reiterVorgabe({ uebergang: 12, streifenQuelle: 'osm', markierung: 'lsa' })).toBe('sicht')
    expect(reiterVorgabe({ uebergang: null, streifenQuelle: 'hand', markierung: null })).toBe('bedarf')
    expect(reiterVorgabe({ uebergang: null, streifenQuelle: 'osm' })).toBe('bedarf')
    expect(reiterVorgabe({ uebergang: 12, streifenQuelle: 'osm', markierung: 'unmarkiert' })).toBe('bedarf')
    // Wahl geht vor; ohne Wahl die Vorgabe
    expect(reiterAktiv(null, 'sicht')).toBe('sicht')
    expect(reiterAktiv('bedarf', 'sicht')).toBe('bedarf')
    // Sprung zu einem Feld im Reiter Bedarf aktiviert ihn; Ziel ohne Reiter lässt den aktiven
    expect(reiterNachSprung('sicht', 'bedarf')).toBe('bedarf')
    expect(reiterNachSprung('bedarf', 'bedarf')).toBe('bedarf')
    expect(reiterNachSprung('sicht', null)).toBe('sicht')
    // Pfeiltasten im Kreis, Pos1/Ende; andere Tasten nicht
    expect(reiterTaste('sicht', 'ArrowRight')).toBe('bedarf')
    expect(reiterTaste('bedarf', 'ArrowRight')).toBe('sicht')
    expect(reiterTaste('sicht', 'ArrowLeft')).toBe('bedarf')
    expect(reiterTaste('bedarf', 'Home')).toBe('sicht')
    expect(reiterTaste('sicht', 'End')).toBe('bedarf')
    expect(reiterTaste('sicht', 'Enter')).toBeNull()
    // Teaser: Satz und «empfohlen» bzw. «falls zulässig»; offene Kopfzeile nicht doppelt; Anlage wie im Kopf; mehrere Querungen gezählt
    expect(teaserText(['mit_begruendung'], ['Fussgängerstreifen mit Schutzinsel']))
      .toBe('Bedarf und Querungstyp: Fussgängerstreifen nur mit Begründung zulässig; empfohlen: Fussgängerstreifen mit Schutzinsel')
    expect(teaserText(['offen'], ['Fussgängerstreifen mit Schutzinsel']))
      .toBe('Bedarf und Querungstyp: Zulässigkeit noch offen; falls zulässig: Fussgängerstreifen mit Schutzinsel')
    expect(teaserText(['offen'], ['Fussgängerstreifen: noch offen, ob erlaubt'])).toBe('Bedarf und Querungstyp: Zulässigkeit noch offen')
    expect(teaserText(['offen'], ['Begegnungszone? noch offen'])).toBe('Bedarf und Querungstyp: Zulässigkeit noch offen')
    expect(teaserText(['nicht_angezeigt'], ['Fussgängerfurt beurteilt'])).toBe('Bedarf und Querungstyp: Fussgängerstreifen nicht zulässig; Fussgängerfurt beurteilt')
    expect(teaserText(['kein_streifen'], ['Noch keine Empfehlung'])).toBe('Bedarf und Querungstyp: Kein Fussgängerstreifen')
    expect(teaserText(['nicht_beurteilt'], ['Ausserorts: nicht beurteilt'])).toBe('Bedarf und Querungstyp: Nicht beurteilt (ausserorts)')
    expect(teaserText(['mit_begruendung', 'zulaessig'], ['a', 'b'])).toBe('Bedarf und Querungstyp: bei 1 von 2 Querungen: Fussgängerstreifen nur mit Begründung zulässig')
    expect(teaserText(['zulaessig', 'zulaessig'], ['a', 'b'])).toBe('Bedarf und Querungstyp: bei beiden Querungen: Fussgängerstreifen zulässig')
  })

  it('Vorgabe (Korrektur): jede Markierung ohne Streifen → Bedarf; Streifen von Hand nur gezeichnet → Bedarf, übernommen → Sicht', () => {
    expect(reiterVorgabe({ uebergang: 12, streifenQuelle: 'osm', markierung: 'unbelegt' })).toBe('bedarf')
    // Streifen von Hand am Übergang: nur gezeichnete → Bedarf; aus OSM bzw. Luftbild übernommen (auch gemischt, alt ohne Herkunft) → Sicht
    expect(reiterVorgabe({ uebergang: 12, streifenQuelle: 'hand', markierung: 'markiert', herkunft: ['gezeichnet', 'gezeichnet'] })).toBe('bedarf')
    expect(reiterVorgabe({ uebergang: 12, streifenQuelle: 'hand', markierung: 'markiert', herkunft: ['osm'] })).toBe('sicht')
    expect(reiterVorgabe({ uebergang: 12, streifenQuelle: 'hand', markierung: 'markiert', herkunft: ['luftbild', 'gezeichnet'] })).toBe('sicht')
    expect(reiterVorgabe({ uebergang: 12, streifenQuelle: 'hand', markierung: 'markiert', herkunft: [undefined] })).toBe('sicht')
    expect(reiterVorgabe({ uebergang: 12, streifenQuelle: 'hand', markierung: 'unmarkiert', herkunft: ['osm'] })).toBe('bedarf')
  })

  it('Zustand (Korrektur): Begegnungszone bzw. verteiltes Queren → kein Streifen, ausserorts → nicht beurteilt, ohne Angabe offen', () => {
    // Stand aus dem Befund: Ende des Ablaufs vor der Zulässigkeit; ohne Zulässigkeit offen
    expect(reiterStand({ ende: 'begegnungszone', zulaessigkeit: null })).toBe('kein_streifen')
    expect(reiterStand({ ende: 'flaechig', zulaessigkeit: null })).toBe('kein_streifen')
    expect(reiterStand({ ende: 'ausserorts', zulaessigkeit: null })).toBe('nicht_beurteilt')
    expect(reiterStand({ ende: 'offen', zulaessigkeit: null })).toBe('offen')
    expect(reiterStand({ ende: null, zulaessigkeit: null })).toBe('offen')
    expect(reiterStand({ ende: null, zulaessigkeit: 'mit_begruendung' })).toBe('mit_begruendung')
    // Zustand: Wort und Symbol; mehrere Querungen: die strengste Aussage; null neben «zulässig» zählt als offen
    expect(reiterZustand(['zulaessig'])).toMatchObject({ wort: 'zulässig', symbol: '✓' })
    expect(reiterZustand(['mit_begruendung'])).toMatchObject({ wort: 'mit Begründung', symbol: '!' })
    expect(reiterZustand(['nicht_angezeigt'])).toMatchObject({ wort: 'nicht zulässig', symbol: '✗' })
    expect(reiterZustand(['kein_streifen'])).toMatchObject({ wort: 'kein Streifen', symbol: '✗' })
    expect(reiterZustand(['nicht_beurteilt'])).toMatchObject({ wort: 'nicht beurteilt', symbol: '–' })
    expect(reiterZustand([reiterStand({ ende: null, zulaessigkeit: null })])).toMatchObject({ wort: 'offen', symbol: '?' })
    expect(reiterZustand(['zulaessig', reiterStand({ ende: null, zulaessigkeit: null })]).z).toBe('offen')
    expect(reiterZustand(['offen', 'mit_begruendung', 'zulaessig']).z).toBe('mit_begruendung')
    expect(reiterZustand(['nicht_angezeigt', 'kein_streifen']).z).toBe('kein_streifen')
  })

  it('Anzeige: Leiste mit Rollen und aria, beide Reiterfelder, Bedarf offen mit Kopf und Leitfrage, Teaser; keine nackten Nummern', () => {
    const f = leererFall(ll(0, 0)[0], ll(0, 0)[1], 12)
    const r = rechneFall(OSM, AV, [], 12, f, null)
    const bl = befundblaetter(r, f, { vorgabe: { bern: false, kantonBE: false } })
    expect(bl.length).toBe(1)
    const zul = bl.map(b => reiterStand(b.befund)), z = reiterZustand(zul)
    const bedarf = <BedarfAbschnitt fall={f} blaetter={bl} vorgabe={{ bern: false, kantonBE: false }} aendern={() => {}} />
    const sicht = <BedarfTeaser zustand={z} oeffnen={() => {}} text={teaserText(zul, bl.map(kopfText))} />
    const html = renderToStaticMarkup(<ReiterAnsicht mitReitern aktiv="sicht" waehlen={() => {}} zustand={z} sicht={sicht} bedarf={bedarf} />)
    // Leiste: zwei Reiter, der aktive mit aria-selected und Tab-Fokus, beide mit aria-controls auf ihr Feld
    expect(html).toMatch(/<div class="reiterleiste" role="tablist" aria-label="[^"]+">/)
    expect(html).toContain('role="tab" id="reiter-sicht" aria-selected="true" aria-controls="reiterfeld-sicht" tabindex="0"')
    expect(html).toContain('role="tab" id="reiter-bedarf" aria-selected="false" aria-controls="reiterfeld-bedarf" tabindex="-1"')
    // Zustand im Reiter Bedarf in Wort und Symbol (Symbol nicht vorgelesen)
    expect(html).toContain(`<span aria-hidden="true">${z.symbol}</span> ${z.wort}</span>`)
    // Felder: Sichtprüfung sichtbar, Bedarf verborgen, aber gerendert (Sprünge finden ihr Ziel)
    expect(html).toMatch(/<div class="reiterfeld reiterfeld-sicht" data-reiter="sicht" role="tabpanel" id="reiterfeld-sicht" aria-labelledby="reiter-sicht">/)
    expect(html).toMatch(/<div class="reiterfeld reiterfeld-bedarf" data-reiter="bedarf" hidden="" role="tabpanel" id="reiterfeld-bedarf" aria-labelledby="reiter-bedarf" tabindex="0">/)
    // Bedarf: offen (kein Aufklapper als Abschnitt), eigener Kopf mit Titel und Leitfrage; die Felder der Maske sind da
    expect(html).not.toContain('<details class="abschnitt bedarf">')
    expect(html).toContain('<section class="abschnitt bedarf" aria-labelledby="bedarf-titel"><div class="bedarf-kopf"><h2 id="bedarf-titel">Bedarf und Querungstyp</h2>')
    expect(html).toContain('<p class="bedarf-leitfrage">Darf hier ein Fussgängerstreifen hin, und welche Querung passt?</p>')
    expect(html).toContain('id="feld-')
    // Teaser im Reiter Sichtprüfung: Satz zum Bedarf, Pfeil, verweist auf das Feld Bedarf
    expect(html).toContain('class="bedarf-teaser')
    expect(html).toContain('aria-controls="reiterfeld-bedarf"')
    expect(text(html)).toContain(`Bedarf und Querungstyp: ${z.satz}`)
    // aktiver Reiter Bedarf: Felder umgekehrt
    const b2 = renderToStaticMarkup(<ReiterAnsicht mitReitern aktiv="bedarf" waehlen={() => {}} zustand={z} sicht={sicht} bedarf={bedarf} />)
    expect(b2).toContain('id="reiter-bedarf" aria-selected="true"')
    expect(b2).toMatch(/reiterfeld-sicht" data-reiter="sicht" hidden=""/)
    expect(b2).not.toMatch(/reiterfeld-bedarf" data-reiter="bedarf" hidden=""/)
    // ohne Bedarfsblätter: keine Leiste, keine Rollen, nur die Sichtprüfung
    const ohne = renderToStaticMarkup(<ReiterAnsicht mitReitern={false} aktiv="bedarf" waehlen={() => {}} zustand={null} sicht={<p>Sicht</p>}
      bedarf={bedarf} />)
    expect(ohne).toBe('<div class="reiterfeld reiterfeld-sicht ohne-reiter" data-reiter="sicht"><p>Sicht</p></div>')
    // Render-Wächter: keine Regelnummer ohne Kurztitel
    expect(nummernOhneTitel(text(html))).toEqual([])
  })
})
