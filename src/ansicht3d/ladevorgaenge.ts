/** Ein Ladevorgang je Ebene, letzter Sichtbarkeitswunsch gilt auch während des Ladens. */
export function ebenenLader<T>(laden: () => Promise<T>, anwenden: (wert: T, an: boolean) => void,
  verwerfen: (wert: T) => void, beendet: () => boolean) {
  let wunsch = false, wert: T | undefined, laufend: Promise<void> | undefined
  return (an: boolean): Promise<void> => {
    wunsch = an
    if (beendet()) return Promise.resolve()
    if (wert !== undefined) { anwenden(wert, wunsch); return Promise.resolve() }
    if (laufend) return laufend
    if (!an) return Promise.resolve()
    laufend = laden().then(t => {
      if (beendet()) { verwerfen(t); return }
      wert = t
      anwenden(t, wunsch)
    }).finally(() => { laufend = undefined })
    return laufend
  }
}

/** Jede neue Anfrage invalidiert ältere Ergebnisse, auch wenn sie selbst nichts laden muss. */
export function anfragenFolge() {
  let nr = 0
  return { beginnen: () => ++nr, aktuell: (n: number) => n === nr }
}

export function mitEreignispause<T>(sammlung: { suspendEvents(): void; resumeEvents(): void }, arbeit: () => T): T {
  sammlung.suspendEvents()
  try { return arbeit() } finally { sammlung.resumeEvents() }
}
