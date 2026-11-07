// ── Amtliche Vermessung im Kartenausschnitt ──
// Die Ebene soll auch ohne übernommene Abschnitte zu sehen sein. Geladen wird je Halt der Karte ein Quadrat um den Ausschnitt: eine
// Abfrage statt vieler Kacheln, weil geodienste.ch nach den Betriebsbestimmungen rund 10 WFS-Abfragen pro Minute erlaubt. Was schon
// abgedeckt ist, wird nicht noch einmal abgefragt. Eine neue Bitte während einer Abfrage ersetzt die vorherige, die letzte zählt.

export type AvBox = readonly [e0: number, n0: number, e1: number, n1: number]

/** Rand um den Ausschnitt, damit kleines Verschieben keine neue Abfrage braucht */
export const AV_RAND_M = 100
/** Grösste halbe Kantenlänge; bei Zoom 17 reicht das für übliche Bildschirme, rund 8 MB in einer Innenstadt */
export const AV_MAX_RADIUS_M = 800
/** 10 Abfragen pro Minute */
export const AV_ABSTAND_MS = 6000

export interface AvQuadrat { e: number; n: number; r: number }

/** Quadrat um den Ausschnitt; null, wenn es zu gross wäre */
export function avQuadrat(box: AvBox): AvQuadrat | null {
  const r = Math.max(box[2] - box[0], box[3] - box[1]) / 2 + AV_RAND_M
  return r > AV_MAX_RADIUS_M ? null : { e: (box[0] + box[2]) / 2, n: (box[1] + box[3]) / 2, r: Math.ceil(r) }
}

const umfasst = (q: AvQuadrat, b: AvBox) => b[0] >= q.e - q.r && b[1] >= q.n - q.r && b[2] <= q.e + q.r && b[3] <= q.n + q.r

export interface AvLaderAuftrag<T> {
  laden: (q: AvQuadrat) => Promise<T>
  fertig: (daten: T) => void
  fehler: (e: unknown) => void
  zaehlen: (d: 1 | -1) => void
  zuGross: (ja: boolean) => void
  abstandMs?: number
  jetzt?: () => number
}

export function avAusschnittLader<T>(a: AvLaderAuftrag<T>) {
  const abstand = a.abstandMs ?? AV_ABSTAND_MS, jetzt = a.jetzt ?? Date.now
  let geladen: AvQuadrat[] = [], offen: AvBox | null = null, laeuft = false, letzte = -Infinity, timer: ReturnType<typeof setTimeout> | null = null, runde = 0
  const start = () => {
    if (timer !== null || laeuft || !offen) return
    const warten = letzte + abstand - jetzt()
    if (warten > 0) { timer = setTimeout(() => { timer = null; start() }, warten); return }
    const box = offen; offen = null
    if (geladen.some(q => umfasst(q, box))) return
    const q = avQuadrat(box)
    if (!q) return
    const meine = runde
    laeuft = true; letzte = jetzt(); a.zaehlen(1)
    a.laden(q).then(
      d => { if (meine === runde) { geladen.push(q); a.fertig(d) } },
      e => { if (meine === runde) a.fehler(e) },
    ).finally(() => { laeuft = false; a.zaehlen(-1); start() })
  }
  return {
    /** Der Ausschnitt, den die Karte gerade zeigt */
    wunsch(box: AvBox) {
      const zuGross = !avQuadrat(box)
      a.zuGross(zuGross)
      offen = zuGross ? null : box
      start()
    },
    /** Die Objekte sind weg (neue Ladung, Karte leeren, Stadtwechsel): alles gilt als ungeladen, späte Antworten verfallen */
    leeren() {
      geladen = []; offen = null; runde++
      if (timer !== null) { clearTimeout(timer); timer = null }
    },
  }
}
