import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MassBild, SICHT_ALLE, SichtTaste, sichtBildText, sichtLesen, sichtZeigen, sichtAendern, sichtMassZeigen, fgsSichtId, richtungSichtId, type SichtWahl } from './Sichtfelder'
import { massAchse, massGerade, massStrecke } from './sichtMasse'
const w = (teile: Partial<SichtWahl>): SichtWahl => ({ ...SICHT_ALLE, ...teile })
afterEach(() => vi.unstubAllGlobals())
describe('Sichtarten und Vermassung sind reine Ansichtsentscheidungen', () => {
  it('Überholsicht bleibt bei ausgeblendeter Autosicht separat sichtbar; Master schaltet alles aus', () => {
    const a = w({ auto: false, velo: false, trottoir: false })
    expect(sichtZeigen(a, 'ueberholen')).toBe(true)
    expect(sichtZeigen(a, 'auto')).toBe(false)
    expect(sichtBildText(a, ['auto','velo','ueberholen'])).toContain('Überholsicht')
    expect(sichtBildText(a, ['auto','velo','ueberholen'])).not.toContain('Auto /')
    for (const art of ['auto','velo','trottoir','ueberholen'] as const) expect(sichtZeigen({...a,an:false},art)).toBe(false)
  })
  it('fehlender oder beschädigter Browserspeicher blockiert die Karte nicht; Masse auch bei früher gespeichertem Einblenden zunächst aus', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{kaputt' });expect(sichtLesen()).toEqual(SICHT_ALLE)
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({auto:false,velo:'false',trottoir:0,masse:true}) })
    expect(sichtLesen()).toEqual(w({auto:false,masse:false}))
    vi.stubGlobal('localStorage', { getItem: () => { throw Error('gesperrt') } });expect(sichtLesen()).toEqual(SICHT_ALLE)
  })
  it('Befundfeld bleibt beschriftet und bedienbar, auch wenn seine Sicht ausgeblendet ist', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({velo:false}) })
    const h=renderToStaticMarkup(<SichtTaste art="velo">Velo: frei</SichtTaste>)
    expect(h).toContain('aria-pressed="false"');expect(h).toContain('Velo: frei');expect(h).toContain('einblenden')
  })
  it('A folgt der gekrümmten Achse und interpoliert zwischen Stützpunkten, nicht der Diagonale', () => {
    const l: [number,number][]=[[0,0],[10,0],[10,10]]
    expect(massStrecke(l,15)).toEqual({linie:[[0,0],[10,0],[10,5]],laenge:15})
    const m=massAchse(l,15,'A Auto','auto',0)!
    expect(m.linien[0]).toEqual([[0,0],[10,0],[10,5]]);expect(m.text).toBe('A Auto 15,0 m')
    expect(massAchse(l,30,'A Auto','auto')!.text).toContain('gezeichnet 20,0 m')
    expect(massGerade([0,0],[0,3],'B','auto',0)!.text).toBe('B 3,0 m')
  })
  it('Berichtskarte zeigt nur gewählte Arten und ihre Masse; keine Masse bei ausgeschalteter Vermassung', () => {
    const masse=[massAchse([[0,0],[10,0]],10,'A Auto','auto')!,massAchse([[0,0],[0,10]],10,'A Velo','velo')!]
    const xy=([x,y]:[number,number])=>`${x},${y}`
    const aus=renderToStaticMarkup(<MassBild masse={masse} wahl={w({masse:false})} xy={xy} />)
    expect(aus).toBe('')
    const h=renderToStaticMarkup(<MassBild masse={masse} wahl={w({masse:true,auto:false})} xy={xy} />)
    expect(h).toContain('A Velo 10,0 m');expect(h).not.toContain('A Auto')
    const klein = renderToStaticMarkup(<MassBild masse={masse} wahl={w({masse:true})} xy={xy} skala={0.09} />)
    expect(klein).toContain('font-size="1.26"');expect(klein).not.toContain('font-size="14"')
    expect(renderToStaticMarkup(<MassBild masse={masse} wahl={w({masse:true,an:false})} xy={xy} />)).not.toContain('A Velo')
  })
})


describe('Einzelne Fahrzeuge statt ganzer Kategorien schalten', () => {
  it('nur eines von drei Autos ausblenden; andere Autos und Velos bleiben sichtbar', () => {
    const ids = ['Auto 1', 'Auto 2', 'Auto 3']
    const aus = sichtAendern(SICHT_ALLE, 'auto', false, ids[1])
    expect(ids.map(id => sichtZeigen(aus, 'auto', id))).toEqual([true, false, true])
    expect(sichtZeigen(aus, 'velo', ids[1])).toBe(true)
    const an = sichtAendern(aus, 'auto', true, ids[1])
    expect(ids.every(id => sichtZeigen(an, 'auto', id))).toBe(true)
    expect(SICHT_ALLE.einzeln).toBeUndefined()
  })
  it('ein Fahrzeug gezielt einschalten, auch wenn zuvor alles ausgeblendet war', () => {
    const aus = sichtAendern(SICHT_ALLE, 'an', false)
    const an = sichtAendern(aus, 'auto', true, 'Auto 2')
    expect(sichtZeigen(an, 'auto', 'Auto 2')).toBe(true)
    expect(sichtZeigen(an, 'auto', 'Auto 1')).toBe(false)
    expect(sichtZeigen(an, 'velo', 'Auto 2')).toBe(false)
    expect(sichtZeigen(sichtAendern(an, 'auto', true), 'auto', 'Auto 1')).toBe(true)
  })
  it('Fahrzeug und zugehörige Masse folgen derselben Auswahl; gemeinsame Masse bleiben bis zum letzten Fahrzeug sichtbar', () => {
    const a = sichtAendern(w({masse:true}), 'auto', false, '1')
    const m = { ...massAchse([[0,0],[10,0]],10,'Auto 1','auto')!, objekt: '1' }
    expect(sichtMassZeigen(a, m)).toBe(false)
    expect(sichtMassZeigen(a, {...m, objekt:'2'})).toBe(true)
    const gemeinsam = {...m, objekt: undefined, objekte:['1','2']}
    expect(sichtMassZeigen(a, gemeinsam)).toBe(true)
    expect(sichtMassZeigen(sichtAendern(a,'auto',false,'2'),gemeinsam)).toBe(false)
    const h=renderToStaticMarkup(<MassBild masse={[m]} wahl={a} xy={p=>p.join(',')} />)
    expect(h).not.toContain('Auto 1')
  })
  it('Speicher und Befundschalter erhalten die Einzelwahl; andere Streifen/Knoten sind unabhängig', () => {
    const id=fgsSichtId({fgsId:'2268005627',zufahrt:'a222'})
    const a=sichtAendern(SICHT_ALLE,'auto',false,id)
    vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(a)})
    expect(sichtZeigen(sichtLesen(),'auto',id)).toBe(false)
    expect(sichtZeigen(sichtLesen(),'auto',fgsSichtId({fgsId:'anderer',zufahrt:'a222'}))).toBe(true)
    expect(richtungSichtId({knoten:1,zufahrt:'z'},{richtung:'links'})).not.toBe(richtungSichtId({knoten:2,zufahrt:'z'},{richtung:'links'}))
    const h=renderToStaticMarkup(<SichtTaste art="auto" id={id}>Auto 1: verdeckt</SichtTaste>)
    expect(h).toContain('aria-pressed="false"');expect(h).toContain('dieses Sichtfeld');expect(h).toContain('einblenden')
  })
})
