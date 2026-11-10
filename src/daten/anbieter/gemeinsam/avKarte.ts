/** Einheitliche, dezente AV-Darstellung; die Auswahl ist ausschliesslich eine Kartenansicht. */
export const AV_FARBEN: Record<string, string> = {
  Strasse_Weg: '#6e6e6e', Trottoir: '#e6e6c8', Verkehrsinsel: '#96c878', Gebaeude: '#3f3f46',
}
export const AV_LEGENDE: [string, string, string][] = [
  ['strasse', AV_FARBEN.Strasse_Weg, 'Strasse, Weg'], ['trottoir', AV_FARBEN.Trottoir, 'Trottoir'],
  ['verkehrsinsel', AV_FARBEN.Verkehrsinsel, 'Verkehrsinseln'], ['gebaeude', AV_FARBEN.Gebaeude, 'Gebäude'],
  ['gruen', '#65a30d', 'Grünflächen, Wald'], ['uebrige', '#a8a29e', 'Übrige Bodenbedeckung'],
]
export const AV_ARTEN = AV_LEGENDE.map(l => l[0])
/** Vorauswahl ohne gespeicherte Wahl: Trottoir, Verkehrsinseln, Gebäude; die übrigen Arten lassen sich zuschalten */
export const AV_VORAUSWAHL: readonly string[] = ['trottoir', 'verkehrsinsel', 'gebaeude']
export function avKlasse(art: string): string {
  return art === 'Strasse_Weg' ? 'strasse' : art === 'Trottoir' || art === 'Verkehrsinsel' ? art.toLowerCase() : art === 'Gebaeude' ? 'gebaeude' :
    /humus|Gartenanlage|Acker|Wiese|Wald|bestockt|Gebuesch/i.test(art) ? 'gruen' : 'uebrige'
}
export function avKartenStil(art: string): { farbe: string; deckkraft: number } {
  const klasse = avKlasse(art)
  return { farbe: AV_LEGENDE.find(l => l[0] === klasse)![1], deckkraft:
    ({ strasse: 0.25, trottoir: 0.45, verkehrsinsel: 0.6, gebaeude: 0.5 } as Record<string, number>)[klasse] ?? 0.08 }
}
export function avArtenLesen(text: string | null): Set<string> {
  try { const v: unknown = JSON.parse(text ?? 'null'); if (Array.isArray(v)) return new Set(v.filter((x): x is string => typeof x === 'string' && AV_ARTEN.includes(x))) } catch { /* Vorgabe */ }
  return new Set(AV_VORAUSWAHL)
}
export const avArtSichtbar = (art: string, an: boolean, arten: ReadonlySet<string>): boolean => an && arten.has(avKlasse(art))
