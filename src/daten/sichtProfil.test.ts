import { afterEach, expect, it, vi } from 'vitest'
import { ladeSichtProfil, sichtProfilVorhanden } from './sichtProfil'

afterEach(() => vi.unstubAllGlobals())
it('bewahrt die tatsächlich geladenen Punkte mit Abrufzeit für die Profilansicht auf, ohne erneut zu laden', async () => {
  const holen = vi.fn(async () => new Response(JSON.stringify([
    { dist: 0, alts: { COMB: 500 } }, { dist: 5, alts: { COMB: 502 } }, { dist: 10, alts: { COMB: 500 } },
  ])))
  vi.stubGlobal('fetch', holen)
  const auge: [number, number] = [2600123, 1200456], ziel: [number, number] = [2600133, 1200456]
  expect(sichtProfilVorhanden(auge, ziel)).toBeNull()
  const r = await ladeSichtProfil(auge, ziel)
  const gespeichert = sichtProfilVorhanden(auge, ziel)!
  expect(gespeichert.daten).toBe(r.daten)
  expect(gespeichert.abgerufen).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(gespeichert.datenstand).toBeUndefined() // Abrufzeit wird nicht zum Datenstand
  await ladeSichtProfil(auge, ziel)
  expect(holen).toHaveBeenCalledTimes(1)
})
