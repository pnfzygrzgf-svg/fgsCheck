import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EbenenGruppe, HoehenprofilAnsicht } from './Ansicht'
import { profilGeometrie, profilGruppen, profilLage, profilObjekteWaehlen, standardProfil, type HoehenProfil } from './modell'

const profil = (p: Partial<HoehenProfil> = {}): HoehenProfil => ({
  id: 'G1', titel: 'Laubeggstrasse von Nordwesten · Wartefläche, 55 m vor Streifen', zweck: 'Sicht auf die Wartefläche',
  linie: [[2600000, 1200000], [2600010, 1200000]], punkte: [{ dist: 0, h: 500 }, { dist: 5, h: 502 }, { dist: 10, h: 500 }],
  quelle: '© swisstopo', sicht: { augeM: 1, zielM: .6, toleranzM: .2, frei: false }, ...p,
})
describe('Erklärender Höhenschnitt', () => {
  it('beziffert Gefälle und den Bodenhöhenbereich ohne Augenhöhe oder Toleranz dazuzuzählen', () => {
    const html = renderToStaticMarkup(<HoehenprofilAnsicht profile={[profil({ punkte: [{ dist: 0, h: 555.9 }, { dist: 10, h: 555.4 }, { dist: 20, h: 555 }], sicht: { augeM: 2, zielM: 1, toleranzM: .3, frei: true } })]} />)
    expect(html).toContain('Anfang → Ende: −0.90 m (abwärts)')
    expect(html).toContain('Höchster − tiefster Bodenpunkt: 0.90 m')
  })
  it('unterscheidet eine Kuppe von der Höhendifferenz zwischen gleich hohen Endpunkten', () => {
    const html = renderToStaticMarkup(<HoehenprofilAnsicht profile={[profil({ sicht: undefined })]} />)
    expect(html).toContain('Anfang → Ende: 0.00 m (gleich hoch)')
    expect(html).toContain('Höchster − tiefster Bodenpunkt: 2.00 m')
    const aufwaerts = renderToStaticMarkup(<HoehenprofilAnsicht profile={[profil({ sicht: undefined, punkte: [{ dist: 0, h: 500 }, { dist: 10, h: 501.25 }] })]} />)
    expect(aufwaerts).toContain('Anfang → Ende: +1.25 m (aufwärts)')
  })
  it('zeichnet den Sichtstrahl mit den tatsächlichen Höhen von Auge und Ziel und findet die grösste Überschreitung', () => {
    const p = profil(), vorher = structuredClone(p), g = profilGeometrie(p)!
    expect(g.strahl).toEqual({ anfang: 501, ende: 500.6 })
    expect(g.getroffen?.dist).toBe(5)
    expect(g.getroffen?.ueberM).toBeCloseTo(1.2)
    expect(profilLage(p, 5)).toEqual([2600005, 1200000])
    expect(p).toEqual(vorher)
  })
  it('berücksichtigt dieselbe Toleranz wie die Prüfung, ohne eine freie Sicht aus Steigung abzuleiten', () => {
    const p = profil({ punkte: [{ dist: 0, h: 500 }, { dist: 5, h: 500.9 }, { dist: 10, h: 500 }] })
    expect(profilGeometrie(p)!.getroffen).toBeNull()
    const ohneSicht = profilGeometrie({ ...p, sicht: undefined })!
    expect(ohneSicht.strahl).toBeNull()
    expect(ohneSicht.getroffen).toBeNull()
  })
  it('ordnet Profilabstände relativ zum ersten Punkt zu und erfindet keine Kartenlage auf einer gekrümmten Achse', () => {
    const p = profil({ punkte: [{ dist: 2, h: 500 }, { dist: 7, h: 502 }, { dist: 12, h: 500 }] })
    expect(profilLage(p, 7)).toEqual([2600005, 1200000])
    expect(profilLage({ ...p, linie: [[0, 0], [1, 0], [2, 1]] }, 7)).toBeNull()
    expect(profilGeometrie(profil({ punkte: [{ dist: 0, h: 500 }] }))).toBeNull()
  })
  it('erklärt den roten Befund in Metern und trennt Abstand zum FGS von Abstand entlang des Profils', () => {
    const html = renderToStaticMarkup(<HoehenprofilAnsicht profile={[profil()]} />)
    expect(html).toContain('55 m vor Streifen')
    expect(html).toContain('1.20 m über dem Sichtstrahl')
    expect(html).toContain('Geländemodell: Der Boden verdeckt diese Sichtlinie.')
    expect(html).toContain('ab Auge entlang der Sichtlinie')
    expect(html).toContain('Datenstand unbekannt')
    expect(html).toContain('unterschiedliche Massstäbe')
    expect(html).toContain('Toleranz dieser Berechnung')
    expect(html).toContain('Messwerte und Quelle</summary>')
    expect(html).toContain('Fahrer*innenauge</text>')
  })
  it('erklärt freie Profile mit der Toleranz, ohne fehlende Profile als frei zu zeigen', () => {
    const p = profil({ punkte: [{ dist: 0, h: 500 }, { dist: 5, h: 500 }, { dist: 10, h: 500 }], sicht: { augeM: 1, zielM: .6, toleranzM: .2, frei: true } })
    const html = renderToStaticMarkup(<HoehenprofilAnsicht profile={[p]} />)
    expect(html).toContain('nicht um mehr als die berücksichtigte Toleranz')
    expect(html).toContain('Geländemodell: In den geprüften Stützpunkten ist diese Sichtlinie frei.')
    expect(renderToStaticMarkup(<HoehenprofilAnsicht profile={[]} />)).not.toContain('Gelände frei')
  })
  it('zeigt im SWC/VRC nur das verwendete Längsprofil und keine behauptete Sichtprüfung', () => {
    const html = renderToStaticMarkup(<HoehenprofilAnsicht profile={[profil({ sicht: undefined, titel: 'Strassenprofil', zweck: 'Längsneigung' })]} />)
    expect(html).toContain('Hier wird keine Verdeckung einer Sichtlinie geprüft')
    expect(html).not.toContain('Gelände frei')
    expect(html).not.toContain('Blau: Sichtstrahl')
  })
  it('zeigt von 34 Profilen standardmässig nur eine problematische Linie; die eigene Wahl und Gesamtansicht bleiben möglich', () => {
    const profile = Array.from({ length: 34 }, (_, i) => profil({ id: `G${i}`, sicht: { augeM: 1, zielM: .6, toleranzM: .3, frei: i !== 12 } }))
    const objekte = profile.map(p => ({ id: p.id, hoehenprofil: p }))
    expect(standardProfil(profile)?.id).toBe('G12')
    expect(profilObjekteWaehlen(objekte, null, false).map(o => o.id)).toEqual(['G12'])
    expect(profilObjekteWaehlen(objekte, 'G1', false).map(o => o.id)).toEqual(['G1'])
    expect(profilObjekteWaehlen(objekte, 'alterFall', false).map(o => o.id)).toEqual(['G12'])
    expect(profilObjekteWaehlen(objekte, 'G1', true)).toHaveLength(34)
    const html = renderToStaticMarkup(<HoehenprofilAnsicht profile={profile} onKartenAlle={() => {}} />)
    expect(html).toContain('Alle 34 Linien auf der Karte')
    expect(html).not.toContain('type="checkbox" checked')
  })
  it('zeigt Höhenbezug und Brückengrenze, ohne aus einem rechnerisch freien Bodenprofil einen Sichtnachweis zu machen', () => {
    const p = profil({ hinweis: 'Brückenbereich: Boden unter der Brücke', sicht: { augeM: 1, zielM: .6, toleranzM: .3, frei: true } })
    const html = renderToStaticMarkup(<HoehenprofilAnsicht profile={[p]} />)
    expect(html).toContain('keinen verlässlichen Nachweis der Fahrbahnsicht')
    expect(html).toContain('Boden unter der Brücke')
    expect(html).not.toContain('Diese Sichtlinie gilt als frei')
    expect(html).toContain('+1.00 m')
    expect(html).toContain('+0.60 m')
  })
  it('grenzt die Linienauswahl auf die benannte Zufahrt ein und behält Sichtziel, Fahrzeugdistanz und Befund lesbar', () => {
    const profile = [
      profil({ id: 'intern-a', gruppe: { id: 'nw', titel: 'Laubeggstrasse von Nordwesten' }, auswahlText: 'Wartefläche · Auto 20 m vor dem Streifen · durch Gelände verdeckt' }),
      profil({ id: 'intern-b', gruppe: { id: 'nw', titel: 'Laubeggstrasse von Nordwesten' }, auswahlText: 'Bodenmarkierung · Auto 100 m vor dem Streifen · Gelände frei' }),
      profil({ id: 'intern-c', gruppe: { id: 'so', titel: 'Laubeggstrasse von Südosten' }, auswahlText: 'Wartefläche · Auto 55 m vor dem Streifen · Gelände frei' }),
    ]
    const html = renderToStaticMarkup(<HoehenprofilAnsicht profile={profile} />)
    expect(html).toContain('Zufahrt wählen')
    expect(html).toContain('Sichtlinie wählen')
    expect(html.match(/<select /g)).toHaveLength(2)
    expect(html).toContain('Wartefläche · Auto 20 m vor dem Streifen · durch Gelände verdeckt')
    expect(html).toContain('Bodenmarkierung · Auto 100 m vor dem Streifen · Gelände frei')
    expect(html).not.toContain('value="intern-c"')
    expect(profilGruppen(profile).map(g => g.profile.map(p => p.id))).toEqual([['intern-a', 'intern-b'], ['intern-c']])
  })
  it('verbindet Geländeschalter, Quelle und Profilansicht in einer gemeinsamen zugänglichen Gruppe', () => {
    const html = renderToStaticMarkup(<EbenenGruppe mitProfil titel="Gelände (swissALTI3D, Sichtprofile)">
      <label><input type="checkbox" />Gelände (swissALTI3D, Sichtprofile) · © swisstopo</label>
      <HoehenprofilAnsicht profile={[profil()]} />
    </EbenenGruppe>)
    expect(html).toContain('role="group" aria-label="Gelände (swissALTI3D, Sichtprofile)"')
    expect(html).toContain('data-profil-ebene="true"')
    expect(html).toMatch(/swisstopo<\/label><details/)
    expect(html).toContain('Geländeprofile ansehen (1)')
    expect(html).not.toContain('>G1:')
    expect(renderToStaticMarkup(<EbenenGruppe mitProfil={false} titel="Tempo">Tempo</EbenenGruppe>)).toBe('<div>Tempo</div>')
  })
})

describe('Ziel über dem Boden in der Mitte der Wartefläche', () => {
  it('Strahl endet über dem Boden der Mitte, nicht über der tieferen Ecke; Text nennt den Unterschied', () => {
    const p = profil({ punkte: [{ dist: 0, h: 504.2 }, { dist: 5, h: 504.2 }, { dist: 10, h: 504.3 }, { dist: 10.5, h: 503.1 }],
      sicht: { augeM: 1, zielM: .6, toleranzM: .15, frei: true, zielBodenH: 504.2 } })
    const g = profilGeometrie(p)!
    expect(g.strahl!.ende).toBeCloseTo(504.8, 6)
    expect(g.zielBoden).toBe(504.2)
    expect(g.zielAusMitte).toBe(true)
    expect(g.getroffen).toBeNull()
    const html = renderToStaticMarkup(<HoehenprofilAnsicht profile={[p]} />)
    expect(html).toContain('Mitte der Wartefläche')
    // Zahlen im Format de-CH (Dezimalpunkt)
    expect(html).toMatch(/1[.,]10 m tiefer/)
    // ohne Höhe der Mitte bleibt es beim letzten Profilpunkt
    const ohne = profilGeometrie(profil({ ...p, sicht: { augeM: 1, zielM: .6, toleranzM: .15, frei: false } }))!
    expect(ohne.zielBoden).toBe(503.1)
    expect(ohne.zielAusMitte).toBe(false)
  })
})
