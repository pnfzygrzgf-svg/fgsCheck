// ── Übergabe zwischen den Rechnern (Etappe 1 der Verknüpfung, 06.11.2026) ──
//
// Gleiche Datei in fgsCheck, SichtweitenCheck und VeloroutenCheck. Ein Link öffnet den Zielrechner in einem neuen Tab mit Lage,
// öffentlicher OSM-Id und Herkunft, nie mit Eingaben oder Ergebnissen. Die Angaben stehen hinter dem #: so gehen sie weder an den
// Webserver noch an die Statistik, und der Zielrechner nimmt sie beim Start gleich wieder aus der Adresse.
// Beispiel: https://fgscheck.ch/#pruefen?von=swc&lat=46.942058&lon=7.432262&uebergang=123

export type Rechner = 'fgs' | 'swc' | 'vrc'
export const RECHNER_NAME: Record<Rechner, string> = { fgs: 'fgsCheck', swc: 'SichtweitenCheck', vrc: 'VeloroutenCheck' }
const ADRESSE: Record<Rechner, string> = { fgs: 'https://fgscheck.ch/', swc: 'https://sichtweitencheck.ch/', vrc: 'https://veloroutencheck.ch/' }
const ENTWICKLUNG: Record<Rechner, string> = { fgs: 'http://localhost:5176/', swc: 'http://localhost:5177/', vrc: 'http://localhost:5173/' }
const ANKER: Record<Rechner, string> = { fgs: 'pruefen', swc: 'pruefen', vrc: 'rechner' }

export interface Ort { lat: number; lon: number }
export interface Uebergabe {
  von: Rechner | null
  ort: Ort | null
  uebergang: number | null
  /** etwas in der Adresse war nicht lesbar und wurde verworfen */
  fehler: boolean
}

// Schweiz und Liechtenstein mit Rand; alles andere ist kein gültiger Ort
const imGebiet = (o: Ort) => o.lat > 45.7 && o.lat < 47.9 && o.lon > 5.9 && o.lon < 10.6
const ZAHL = /^\d{1,3}(\.\d{1,9})?$/
const OSM_ID = /^[1-9]\d{0,14}$/

/** Angaben hinter dem Anker lesen; null, wenn der Anker keine trägt */
export function uebergabeLesen(hash: string, anker: string): Uebergabe | null {
  if (!hash.startsWith(`#${anker}?`)) return null
  const p = new URLSearchParams(hash.slice(anker.length + 2))
  const roh = p.get('von'), lat = p.get('lat'), lon = p.get('lon'), id = p.get('uebergang')
  const von = roh === 'fgs' || roh === 'swc' || roh === 'vrc' ? roh : null
  let fehler = roh !== null && von === null
  let ort: Ort | null = null
  if (lat !== null || lon !== null) {
    const o = lat !== null && lon !== null && ZAHL.test(lat) && ZAHL.test(lon) ? { lat: Number(lat), lon: Number(lon) } : null
    if (o && imGebiet(o)) ort = o; else fehler = true
  }
  let uebergang: number | null = null
  if (id !== null) { if (ort && OSM_ID.test(id)) uebergang = Number(id); else fehler = true }
  return { von, ort, uebergang, fehler }
}

let uebergabe: Uebergabe | null = null
/** Beim Start aufrufen, bevor der Anker ausgewertet wird: liest die Angaben und lässt in der Adresse nur den Anker stehen */
export function uebergabeUebernehmen(anker: string): Uebergabe | null {
  uebergabe = uebergabeLesen(location.hash, anker)
  if (uebergabe) history.replaceState(history.state, '', `${location.pathname}${location.search}#${anker}`)
  return uebergabe
}
export const aktuelleUebergabe = (): Uebergabe | null => uebergabe

/** Hinweis im Zielrechner; null, wenn es nichts zu sagen gibt */
export function uebergabeText(u: Uebergabe | null, objekt: boolean = !!u?.uebergang): string | null {
  if (!u) return null
  if (u.fehler) return 'Die Angaben in der Adresse waren nicht lesbar und wurden nicht übernommen.'
  return u.von ? `Aus ${RECHNER_NAME[u.von]} geöffnet: nur ${objekt ? 'Ort und Objekt' : 'der Ort'} übernommen, keine Eingaben.` : null
}

/** Adresse zum Zielrechner. knoten nur beim SichtweitenCheck (bestehender Parameter ?knoten=), uebergang nur beim fgsCheck */
export function zielAdresse(ziel: Rechner, von: Rechner, o: { ort?: Ort; uebergang?: number; knoten?: number } = {},
  entwicklung: boolean = import.meta.env.DEV): string {
  const p = new URLSearchParams({ von })
  if (o.ort) { p.set('lat', o.ort.lat.toFixed(6)); p.set('lon', o.ort.lon.toFixed(6)) }
  if (ziel === 'fgs' && o.ort && o.uebergang !== undefined) p.set('uebergang', String(o.uebergang))
  const suche = ziel === 'swc' && o.knoten !== undefined ? `?knoten=${o.knoten}` : ''
  return `${(entwicklung ? ENTWICKLUNG : ADRESSE)[ziel]}${suche}#${ANKER[ziel]}?${p}`
}
