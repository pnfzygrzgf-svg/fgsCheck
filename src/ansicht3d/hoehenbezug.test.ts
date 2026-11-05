// Wächter 3D-Ansicht (cesiumSzene.ts): Fahrzeuge, Personen, Bäume, Parkfelder und Hindernisse docken nicht an 3D-Kacheln an.
// CLAMP_TO_GROUND bzw. RELATIVE_TO_GROUND hängen Körper in Cesium auch an Gebäude- und Brückenkacheln, und zwar an die gerade geladene
// Detailstufe: dann schwebten sie (Greyerzstrasse, Bern) oder standen unter einer Brücke (Klösterlistutz, Bern), beides 08.11.2026.
// Die Szene stellt alles auf das Gelände (*_TO_TERRAIN) und hebt Körper auf einer Brücke um eine selbst bestimmte Höhe an.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Quelltext ohne Kommentare (der Kopf der Datei nennt die verbotenen Werte zur Erklärung) */
const code = readFileSync(join(__dirname, 'cesiumSzene.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('Höhenbezug der 3D-Szene', () => {
  it('kein Andocken an 3D-Kacheln (Gebäude, Brücken, Bäume)', () => {
    for (const verboten of ['CLAMP_TO_GROUND', 'RELATIVE_TO_GROUND', 'CLAMP_TO_3D_TILE', 'RELATIVE_TO_3D_TILE',
      'ClassificationType.BOTH', 'ClassificationType.CESIUM_3D_TILE']) expect(code, verboten).not.toContain(verboten)
  })
  it('Flächen und Linien werden nicht auf Gebäude projiziert', () => {
    expect(code).toContain('classificationType: C.ClassificationType.TERRAIN')
    expect(code).not.toContain('extrudedHeightReference')
  })
})
