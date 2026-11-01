// ── Abrufe mit Zeitgrenze (Kopf und Inhalt), Abbruch von aussen und Messung (Ladezeit, Grösse) ──

export interface Abruf<T> {
  daten: T
  ms: number           // Ladezeit bis zum vollständigen Text
  bytes: number        // Länge der Antwort (Zeichen ≈ Bytes)
  quelle: string       // tatsächlich benutzter Server
}

/** Fehler eines Abrufs mit HTTP-Status (für Meldungen je Quelle) */
export class AbrufFehler extends Error {
  constructor(msg: string, public status: number | null = null) { super(msg) }
}

export const istAbbruch = (e: unknown) => (e as Error)?.name === 'AbortError'

/**
 * Antwort und Inhalt (Text) holen; die Zeitgrenze gilt bis zum vollständigen Text, nicht nur bis zum Kopf. signal: Abbruch
 * von aussen (neuer Klick). -> [Response, Text]
 */
export async function holeText(url: string, init: RequestInit, ms: number, signal?: AbortSignal): Promise<[Response, string]> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(new DOMException('Zeitüberschreitung', 'TimeoutError')), ms)
  const weiter = () => ctrl.abort(signal?.reason ?? new DOMException('abgebrochen', 'AbortError'))
  if (signal) { if (signal.aborted) weiter(); else signal.addEventListener('abort', weiter, { once: true }) }
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    const text = await res.text()
    return [res, text]
  } catch (e) {
    if (signal?.aborted) throw new DOMException('abgebrochen', 'AbortError')
    if (ctrl.signal.aborted) throw new AbrufFehler(`keine vollständige Antwort innert ${Math.round(ms / 1000)} s`)
    throw new AbrufFehler(`nicht erreichbar (${(e as Error)?.message ?? e})`)
  } finally {
    clearTimeout(t)
    signal?.removeEventListener('abort', weiter)
  }
}

/** JSON holen, Zeit und Grösse messen. Wirft AbrufFehler bei HTTP-Fehler, Zeitüberschreitung oder ungültigem JSON. */
export async function holeJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20000, signal?: AbortSignal): Promise<Abruf<T>> {
  const t0 = performance.now()
  const [res, text] = await holeText(url, init, timeoutMs, signal)
  if (!res.ok) throw new AbrufFehler(`HTTP ${res.status}`, res.status)
  const ms = performance.now() - t0
  let daten: T
  try { daten = JSON.parse(text) as T }
  catch { throw new AbrufFehler('Antwort ist kein JSON') }
  return { daten, ms, bytes: text.length, quelle: new URL(url).host }
}
