import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type L from 'leaflet'
import { PruefGruppe } from './PruefGruppe'

const ebene = {} as L.Layer, andere = {} as L.Layer
const map = { hasLayer: (l: L.Layer) => l === ebene, on: () => map, off: () => map } as unknown as L.Map

describe('PruefGruppe', () => {
  it('zeigt je Ebene ein Häkchen nach dem Stand der Karte', () => {
    const html = renderToStaticMarkup(<PruefGruppe map={map} gruppen={[{ name: 'Fahrzeuge', ebene }, { name: 'Hindernisse', ebene: andere }]} />)
    expect(html).toContain('Prüfung'); expect(html).toContain('Fahrzeuge'); expect(html).toContain('Hindernisse')
    expect((html.match(/checked=""/g) ?? []).length).toBe(1)
  })
  it('fehlt ohne Karte oder ohne Ebenen', () => {
    expect(renderToStaticMarkup(<PruefGruppe map={null} gruppen={[{ name: 'x', ebene }]} />)).toBe('')
    expect(renderToStaticMarkup(<PruefGruppe map={map} gruppen={[]} />)).toBe('')
  })
})
