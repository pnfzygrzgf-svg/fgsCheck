// ── Daten des Bundes im Kartenausschnitt (api3.geo.admin.ch) ──
// Der Dienst liefert 200 Treffer je Abruf ohne feste Ordnung. Darum lädt diese Funktion alles oder wirft: Eine gekürzte Liste fiele nicht auf.
// Blättern mit offset reicht dafür nicht: Die Seiten überlappen, in swissTLM3D fehlten so in Bern 81 von 490 und in Zürich 188 von 554 Strassen.
// Ein voller Abruf wird darum geviertelt, bis jede Antwort unter der Grenze liegt.

const IDENTIFY = 'https://api3.geo.admin.ch/rest/services/ech/MapServer/identify'
export const BUND_SEITE = 200
/** Sicherungen gegen endloses Teilen; ein Ausschnitt, der sie erreicht, gilt als nicht geladen */
export const BUND_ABRUFE = 170
const BUND_TIEFE = 6
const GLEICHZEITIG = 4

export interface BundTreffer { featureId?: string | number; id?: string | number; geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> }
interface Antwort { results?: BundTreffer[]; exceededTransferLimit?: boolean }

export const bundAbfrage = (layer: string, box: string) => `${IDENTIFY}?${new URLSearchParams({ geometry: box, geometryType: 'esriGeometryEnvelope',
  geometryFormat: 'geojson', layers: `all:${layer}`, tolerance: '0', sr: '2056', lang: 'de', returnGeometry: 'true', limit: String(BUND_SEITE) })}`

/** Rechteck um alle vier Kartenecken: Das Koordinatennetz steht ausserhalb von Bern leicht schräg zur Karte */
export function ausschnittBox(ecken: readonly (readonly [number, number])[]): string {
  const e = ecken.map(p => p[0]), n = ecken.map(p => p[1])
  return [Math.min(...e), Math.min(...n), Math.max(...e), Math.max(...n)].map(v => v.toFixed(1)).join(',')
}

type Rechteck = readonly [number, number, number, number]
const viertel = ([w, s, o, n]: Rechteck): Rechteck[] => {
  const x = (w + o) / 2, y = (s + n) / 2
  return [[w, s, x, y], [x, s, o, y], [w, y, x, n], [x, y, o, n]]
}

async function abfragen(layer: string, r: Rechteck, signal?: AbortSignal): Promise<BundTreffer[]> {
  const a = await fetch(bundAbfrage(layer, r.map(v => v.toFixed(1)).join(',')), { signal })
  if (!a.ok) throw new Error(`Bund: HTTP ${a.status}`)
  const j = await a.json() as Antwort
  if (!Array.isArray(j.results) || j.exceededTransferLimit) throw new Error('Bund: Antwort unvollständig')
  return j.results
}

export async function ladeBundAusschnitt(layer: string, box: string, signal?: AbortSignal): Promise<BundTreffer[]> {
  // Eine Linie, die zwei Teile berührt, kommt in beiden: Die Kennung macht sie wieder zu einem Objekt
  const aus = new Map<string, BundTreffer>()
  let offen: { r: Rechteck; tiefe: number }[] = [{ r: box.split(',').map(Number) as unknown as Rechteck, tiefe: 0 }], abrufe = 0
  while (offen.length) {
    const jetzt = offen.slice(0, GLEICHZEITIG)
    offen = offen.slice(GLEICHZEITIG)
    if ((abrufe += jetzt.length) > BUND_ABRUFE) throw new Error('Bund: zu viele Objekte im Ausschnitt')
    const antworten = await Promise.all(jetzt.map(t => abfragen(layer, t.r, signal)))
    antworten.forEach((liste, i) => {
      const { r, tiefe } = jetzt[i]
      if (liste.length < BUND_SEITE) { for (const f of liste) aus.set(String(f.featureId ?? f.id ?? aus.size), f); return }
      if (tiefe >= BUND_TIEFE) throw new Error('Bund: zu viele Objekte im Ausschnitt')
      offen.push(...viertel(r).map(t => ({ r: t, tiefe: tiefe + 1 })))
    })
  }
  return [...aus.values()]
}
