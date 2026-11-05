// Tests 3D-Ansicht, Oberfläche (Ansicht3D.tsx) ohne Browser: Umschalter, Leiste, Status und Legende als statisches HTML. Cesium wird erst
// im Effekt geladen und kommt hier nicht vor.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Ansicht3D, { AnsichtSchalter, BRUECKE_HINWEIS } from './Ansicht3D'
import { LEGENDE, type Szene3D } from './modell'
import { AUS, standSetzen } from './stand'

const leer: Szene3D = { flaechen: [], linien: [], waende: [], koerper: [], sichtlinien: [], kamera: { fahrzeug: null, uebersicht: null }, legende: LEGENDE, leer: true, bruecken: [] }
const mitFahrzeug: Szene3D = { ...leer, leer: false, kamera: { fahrzeug: { auge: [46.9, 7.4], ziel: [46.9, 7.4001], augHoehe: 1, zielHoehe: 0, peilung: 90,
  abstandM: 20, bruecke: true, zufahrt: 'a|b' }, uebersicht: { ziel: [46.9, 7.4001], peilung: 90, distanzM: 60, neigungGrad: -45 } } }
afterEach(() => { vi.unstubAllGlobals(); standSetzen(AUS) })

describe('Umschalter 2D/3D', () => {
  it('zeigt die gewählte Ansicht mit aria-pressed; 3D nur mit gerechnetem Streifen', () => {
    const h = renderToStaticMarkup(<AnsichtSchalter dreiD={false} setzen={() => undefined} moeglich={false} />)
    expect(h).toContain('aria-pressed="true">2D-Karte'); expect(h).toContain('aria-pressed="false" disabled')
    const h2 = renderToStaticMarkup(<AnsichtSchalter dreiD setzen={() => undefined} moeglich />)
    expect(h2).toContain('aria-pressed="true"'); expect(h2).toContain('3D-Ansicht'); expect(h2).not.toContain('disabled')
  })
})

describe('Ansicht3D', () => {
  it('ohne Fahrzeugkamera: «Aus dem Fahrzeug» gesperrt, Übersicht gewählt; Gebäude an, Modellbäume aus; Legende und Status', () => {
    const h = renderToStaticMarkup(<Ansicht3D szene={leer} />)
    expect(h).toMatch(/aria-pressed="false" disabled[^>]*>Aus dem Fahrzeug/)
    expect(h).toMatch(/aria-pressed="true"[^>]*>Übersicht/)
    // «Frei» wählbar, nicht vorgewählt
    expect(h).toMatch(/aria-pressed="false"[^>]*>\s*Frei<\/button>/)
    // Sichtprüfung: in der Übersicht immer sichtbar, darum angehakt und gesperrt; Ebenen im eingeklappten Menü
    const haken = /<input type="checkbox"([^>]*)\/> Sichtprüfung/.exec(h)?.[1] ?? ''
    expect(haken).toContain('checked=""'); expect(haken).toContain('disabled=""')
    expect(h).toMatch(/aria-expanded="false"[^>]*>Ebenen/); expect(h).not.toContain('Modellbäume')
    expect(h).toContain('role="status"'); expect(h).toContain('Wird geöffnet …'); expect(h).toContain('Kein Streifen gerechnet.')
    expect(h).toContain('Höhen angenommen')
  })
  it('mit Fahrzeugkamera: Fahrzeug als Vorgabe, Brückenhinweis nur ohne Brückenebene; gemerkte Übersicht geht vor', () => {
    const h = renderToStaticMarkup(<Ansicht3D szene={mitFahrzeug} />)
    expect(h).toMatch(/aria-pressed="true"[^>]*>Aus dem Fahrzeug/)
    // aus dem Fahrzeug wählbar und zunächst aus
    expect(h).toMatch(/type="checkbox"[^>]*> Sichtprüfung/); expect(h).not.toMatch(/(checked|disabled)=""[^>]*> Sichtprüfung/)
    // Brückenebene ist an: kein Hinweis; fehlt sie, steht er da
    expect(h).not.toContain(BRUECKE_HINWEIS)
    standSetzen({ phase: 'bereit', text: 'Bereit.', bruecken: 'fehlt' })
    expect(renderToStaticMarkup(<Ansicht3D szene={mitFahrzeug} />)).toContain(BRUECKE_HINWEIS)
    standSetzen(AUS)
    vi.stubGlobal('localStorage', { getItem: () => 'uebersicht', setItem: () => undefined })
    const h2 = renderToStaticMarkup(<Ansicht3D szene={mitFahrzeug} />)
    expect(h2).toMatch(/aria-pressed="true"[^>]*>Übersicht/)
    expect(h2).not.toContain(BRUECKE_HINWEIS)
  })
  it('Profilwahl: Auswahl der Sichtlinien mit Kennung, nur mit setProfil', () => {
    const sz: Szene3D = { ...mitFahrzeug, sichtlinien: [{ id: 'sicht:a|b:10', auge: [46.9, 7.4], ziel: [46.9, 7.4001], augHoehe: 1, zielHoehe: 0.6, frei: true, farbe: '#0f0',
      text: 'Sicht auf die Wartefläche 10 m vor dem Streifen: frei', profil: 'gel:a:b:warte:10' }] }
    vi.stubGlobal('localStorage', { getItem: () => 'uebersicht', setItem: () => undefined })
    const h = renderToStaticMarkup(<Ansicht3D szene={sz} profil="gel:a:b:warte:10" setProfil={() => undefined} />)
    expect(h).toContain('<option value="gel:a:b:warte:10" selected="">'); expect(h).toContain('alle Sichtlinien')
    expect(renderToStaticMarkup(<Ansicht3D szene={sz} />)).not.toContain('<select')
  })
  it('zeigt den gemeldeten Stand; ein Fehler ist rot markiert', () => {
    standSetzen({ phase: 'fehler', text: 'Dienst nicht erreichbar' })
    const h = renderToStaticMarkup(<Ansicht3D szene={mitFahrzeug} />)
    expect(h).toContain('a3-status fehler'); expect(h).toContain('Dienst nicht erreichbar')
  })
})

it('kennzeichnet ergänzte Anschlüsse auch in der auf kleinen Bildschirmen sichtbaren Statuszeile', () => {
  standSetzen({ phase: 'bereit', text: 'Bereit.', anschluss: 1 })
  const h = renderToStaticMarkup(<Ansicht3D szene={leer} />)
  expect(h).toMatch(/role="status"[^]*?Ergänzter Fahrbahnanschluss: Darstellung, keine gemessene Fläche/)
})
