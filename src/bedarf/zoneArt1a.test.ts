// Abnahmetests Prüfung FGS-02 (10.11.2026): Zonenregel C2/C2b (Art. 4 Abs. 2) und Geltungsbereich nach Art. 1a der Zonenverordnung
// (SR 741.213.3, Stand 01.10.2026): verkehrsorientierte Strassen gelten nicht als Zonenstrassen. Die Strassenfunktion zählt nur
// belastbar (von Hand, bestätigt, amtlich bzw. Geoportal); eine Annahme bzw. ein offener Strassentyp hält C2 offen.
import { describe, expect, it } from 'vitest'
import { beurteile } from './entscheid'
import { fall } from './testfaelle'
import type { Quelle } from './eingaben'

const zone = (strassentyp: 'verkehrsorientiert' | 'siedlungsorientiert' | null, quelle: Quelle = 'hand', beduerfnis: string[] = []) => {
  const e = fall({ tempoRegime: 't30_zone', vSig: 30, beduerfnis: beduerfnis as never })
  e.strassentyp = { wert: strassentyp, quelle: strassentyp === null ? null : quelle }
  const b = beurteile(e)
  const c = (id: string) => b.alle.find(x => x.id === id)
  return { b, C2: c('C2'), C2b: c('C2b') }
}

describe('Zonenregel und Strassenfunktion (Art. 1a)', () => {
  it('verkehrsorientiert von Hand, bestätigt bzw. aus dem Geoportal: kein C2 und kein C2b, Grund Art. 1a', () => {
    for (const q of ['hand', 'bestaetigt', 'geoportal'] as Quelle[]) {
      const z = zone('verkehrsorientiert', q)
      expect(z.C2, q).toBeUndefined()
      expect(z.C2b, q).toBeUndefined()
      expect(z.b.offenFelder.C2, q).toBeUndefined()
      expect(z.b.erfuelltGrund?.C2 ?? JSON.stringify(z.b), q).toContain('Art. 1a')
    }
    expect(zone('verkehrsorientiert', 'hand', ['schule']).C2b).toBeUndefined()
  })
  it('siedlungsorientiert von Hand: ohne Grund C2 verletzt, mit Grund C2b (Art. 4 Abs. 2)', () => {
    expect(zone('siedlungsorientiert').C2).toMatchObject({ zustand: 'verletzt' })
    const g = zone('siedlungsorientiert', 'hand', ['schule'])
    expect(g.C2).toBeUndefined()
    expect(g.C2b).toBeDefined()
  })
  it('Strassentyp offen: C2 offen mit dem Feld Strassentyp, keine Gleichsetzung mit einer der beiden Klassen', () => {
    const z = zone(null)
    expect(z.C2).toMatchObject({ zustand: 'offen' })
    expect(z.b.offenFelder.C2).toEqual(['strassentyp'])
  })
  it('nur angenommen (OSM) bzw. geschätzt: weder Befund noch Freigabe, offen mit «Vorschlag bestätigen»', () => {
    for (const st of ['verkehrsorientiert', 'siedlungsorientiert'] as const) {
      for (const q of ['annahme', 'schaetzung'] as Quelle[]) {
        const z = zone(st, q)
        expect(z.C2, `${st} ${q}`).toMatchObject({ zustand: 'offen' })
        expect(z.b.offenFelder.C2, `${st} ${q}`).toEqual(['strassentyp'])
      }
    }
  })
})
