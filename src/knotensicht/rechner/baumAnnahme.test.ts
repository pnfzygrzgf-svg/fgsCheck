import { expect, it } from 'vitest'
import { baumStammText, BAUM_ANNAHME } from './baumAnnahme'
it('nennt Durchmesser und Radius ausdrücklich, auch bei abweichender Eingabe', () => {
  expect(baumStammText({ id: 'b', art: 'baum', p: [0, 0], stamm: 0.5, quelle: 'kataster' })).toBe('Stammdurchmesser 50 cm angenommen; Radius 25 cm')
  expect(baumStammText({ id: 'b', art: 'baum', p: [0, 0], stamm: 0.8, quelle: 'hand' })).toBe('Stammdurchmesser 80 cm (Eingabe); Radius 40 cm')
  expect(baumStammText({ id: 'b', art: 'baum', p: [0, 0], stamm: 0.5, quelle: 'osm' })).toBe('Stammdurchmesser 50 cm angenommen; Radius 25 cm')
  expect(BAUM_ANNAHME).toContain('kein gemessener Stammdurchmesser')
})
