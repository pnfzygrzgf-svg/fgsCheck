// ── Kurze fgsCheck-Texte zu den Hinweisen des Kerns (Korrektur nach Review 23.10.2026, S4) ──
//
// Der Kern des SichtweitenCheck schreibt seine Hinweise für das eigene Panel (Eingaben, die es in fgsCheck nicht gibt, Ziffern ohne
// Normname, Armnummern). Hier wird jeder bekannte Hinweis auf einen kurzen, für fgsCheck richtigen Satz abgebildet; unbekannte bzw. hier
// gegenstandslose Hinweise (Haltelinie, D von Hand, Rechtsvortritt, Anhaltesicht-Diagramm) entfallen. Einige Hinweise machen das
// Ergebnis unsicher (unklar): dann belegt die Knotensicht die Frage im Bedarf nicht vor.

/** Hinweis «durchgehende Strasse»: die Überfahrt gehört über die einmündende Strasse */
export const KS_DURCHGEHEND = 'Der Streifen quert die durchgehende Strasse: eine Trottoirüberfahrt gehört über die einmündende Strasse ' +
  '(VSS 40 242 Ziffer 14.2).'
/** Hinweis: Streifen quer über die Hauptstrasse (27.10.2026) */
export const ksUeberHaupt = (haupt: string, seite: string): string =>
  `Die Überfahrt quert die ${haupt}; sie gehört quer über die Seitenstrasse (${seite}), beide Enden auf dem Trottoir der Hauptstrasse.`
export const KS_AV_KNAPP = 'AV-Ausschnitt reicht nicht bis ans Ende der nötigen Sicht: weiter weg fehlen Gebäude.'
/** Einbahn vom Knoten weg ohne Velo gegen die Einbahn: niemand fährt aus */
export const KS_EINBAHN = 'Die einmündende Strasse ist eine Einbahn vom Knoten weg: hier fährt niemand aus; nur prüfen, wenn Velos gegen ' +
  'die Einbahn fahren.'
/** Einbahn vom Knoten weg mit Velo gegen die Einbahn: geprüft wird die Sicht der Velofahrenden */
export const KS_EINBAHN_VELO = 'Die einmündende Strasse ist eine Einbahn vom Knoten weg: aus ihr fahren nur Velos (gegen die Einbahn, OSM).'
export const KS_UNEBEN = 'Höhenprofil uneben (Kuppe, Wanne oder Brücke?): Längsneigung vor Ort prüfen.'

export interface Kurz { text: string; unklar?: true }
type Regel = [RegExp, (m: RegExpMatchArray) => Kurz | string | null]

const REGELN: Regel[] = [
  [/durchgehenden Strasse/, () => ({ text: KS_DURCHGEHEND, unklar: true })],
  [/^Zielpunkte reichen über den AV-Ausschnitt/, () => ({ text: KS_AV_KNAPP, unklar: true })],
  [/Höhenprofil uneben/, () => ({ text: KS_UNEBEN, unklar: true })],
  [/^Höhenmodell nicht verfügbar|^Höhenprofil mit \d+ Punkten/, () => 'Höhenprofil nicht verfügbar: Längsneigung 0 % angenommen.'],
  [/^Höhenprofil: (\d+) Punkte? weit neben/, m => `Höhenprofil: ${m[1]} Punkt${m[1] === '1' ? '' : 'e'} weit neben der Ausgleichsgeraden nicht gerechnet.`],
  [/^Kein Schnitt der Zufahrtsachse mit der Fahrstreifenachse/, () => 'Kein Schnitt der Ausfahrt mit der Fahrlinie: Anfang der Sicht angenähert.'],
  [/^Kein Schnitt der Zufahrtsachse mit der Veloachse/, () => 'Kein Schnitt der Ausfahrt mit der Veloachse: Anfang der Sicht angenähert.'],
  [/schneidet den Rand der Vortrittsstrasse nicht/, () => 'Kein Schnitt der Ausfahrt mit dem Fahrbahnrand: Rand angenommen.'],
  [/Aussenkante des Radwegs nicht|reicht nicht bis an die Zufahrt/, () => 'Kein Schnitt mit dem Radweg: Sicht auf die Fahrbahn ab der Bordkante.'],
  [/^Radweg in OSM/, () => 'Radweg neben dem Fahrbahnrand (OSM): Sicht auf die Fahrbahn ab seiner Aussenkante.'],
  [/^OSM: Signal «([^»]+)» \(highway=\w+\) an einem anderen Arm/, m => `Signal «${m[1]}» nach OSM an einer anderen Strasse des Knotens: Vortritt prüfen.`],
  [/^OSM: Signal «([^»]+)» \(highway=\w+\) an der Zufahrt/, m => `Signal «${m[1]}» an der Ausfahrt (OSM).`],
  // Einbahn vom Knoten weg: aus dem Ergebnis (Arm der Zufahrt, Velo gegen die Einbahn) in knotensicht.ts, hier ohne Text
  [/^Die Zufahrt ist (nach OSM )?eine Einbahn vom Knoten weg/, () => null],
  [/spitzer Winkel/, () => 'Spitzer Winkel: Seiten links und rechts prüfen.'],
  [/^Kreisverkehr/, () => 'Kreisverkehr: Ergebnis nur zur Orientierung.'],
  [/^D liegt in einem Gebäude/, () => 'Das Auge der Ausfahrenden liegt in einem Gebäude: Lage prüfen.'],
  [/^D liegt im Hindernis «([^»]+)»/, m => `Das Auge der Ausfahrenden liegt in «${m[1]}»: dieses Hindernis zählt nicht.`],
  [/^Die Achse läuft bis A durch «([^»]+)»/, m => `Die Fahr- bzw. Gehlinie läuft durch «${m[1]}»: dafür nicht gerechnet, Lage prüfen.`],
  [/^Breite der Trottoirüberfahrt von Hand ([\d,]+) m \(AV: ([\d,]+) m\)/, m => `Breite von Hand ${m[1]} m (AV ${m[2]} m).`],
  [/^Breite der Trottoirüberfahrt ([\d,]+) m: angrenzendes Trottoir nach AV ([\d,]+) m/,
    m => `Angrenzendes Trottoir ${m[2]} m: Breite auf ${m[1]} m begrenzt (VSS 40 242 Ziffer 16).`],
  [/^Trottoirüberfahrt ausserorts/, () => 'Ausserorts nach OSM: Trottoirüberfahrten gibt es nur innerorts (VSS 40 242 Ziffer 14.1).'],
  [/^Tempo auf der Hauptfahrbahn (\d+) km\/h/, m => `Tempo der Hauptstrasse ${m[1]} km/h: Trottoirüberfahrt höchstens bei 50 km/h (VSS 40 242 Ziffer 14.3.1).`],
  [/^Einbiegewinkel rund (\d+)°/, m => `Einbiegewinkel rund ${m[1]}°: vorgesehen sind 45° bis 135° (VSS 40 242 Ziffer 14.3.4).`],
  [/^OSM: Velos auf dem Trottoir gestattet/, () => 'Velos auf dem Trottoir gestattet (OSM): wie ein Radweg zu prüfen, hier nicht gerechnet ' +
    '(VSS 40 242 Ziffer 15.4.2).'],
  [/^Trottoirüberfahrt: Strasse in einer Kurve, hinterer Rand .*\(([\d,]+) m statt ([\d,]+) m hinter der Bordkante\)/,
    m => `Rand der Hauptstrasse nicht gerade: hinterer Rand der Überfahrt auf der Ausfahrt ${m[1]} m hinter der Bordkante (bei geradem Rand ${m[2]} m).`],
  [/^Steile Zufahrt: Längsneigung ([^ ]+) %/, m => `Steile einmündende Strasse (${m[1]} %).`],
  [/^Tempo (\d+) km\/h laut .+?\(signalisierte Höchstgeschwindigkeit\), OSM (.+?)\.$/, m => `Tempo ${m[1]} km/h nach Geoportal, OSM ${m[2]}.`],
  [/: Tempo aus OSM\.$/, () => 'Kein Tempo im Geoportal: Tempo aus OSM.'],
  [/^Signalisiertes Tempo von Hand (\d+) km\/h, (.+) (\d+) km\/h/, m => `Tempo von Hand ${m[1]} km/h, ${/Geoportal/.test(m[2]) ? 'Geoportal' : 'OSM'} ` +
    `${m[3]} km/h: Signalisation vor Ort prüfen.`],
  [/^Tempo (\d+) km\/h über der Tab\. 1/, m => `Tempo ${m[1]} km/h über VSS 40 273 Tab. 1: Werte der höchsten Stufe, prüfen.`],
  [/^Einbahn vom Knoten weg: von dieser Seite kommen nur Velos/, () => 'Von dieser Seite kommen nur Velos (Einbahn).'],
  [/^Zweiräder im Sichtfeld/, () => 'Velo- bzw. Motorrad-Parkfelder im Sichtfeld: vor Ort prüfen.'],
  [/^Palisade \(Bäume[^)]*\): (\d+) % der Strecke bis A verdeckt/, m => `Bäume verdecken ${m[1]} % der nötigen Sicht.`],
]

/** Hinweis des Kerns → kurzer fgsCheck-Text (null: entfällt) */
export function kurzHinweis(text: string): Kurz | null {
  for (const [re, f] of REGELN) {
    const m = text.match(re)
    if (!m) continue
    const k = f(m)
    return k === null ? null : typeof k === 'string' ? { text: k } : k
  }
  return null
}

/** Liste von Hinweisen des Kerns → kurze Texte (ohne Doppel) und ob einer das Ergebnis unsicher macht */
export function kurzHinweise(texte: readonly string[]): { texte: string[]; unklar: string[] } {
  const aus: string[] = [], unklar: string[] = []
  for (const t of texte) {
    const k = kurzHinweis(t)
    if (!k || aus.includes(k.text)) continue
    aus.push(k.text)
    if (k.unklar) unklar.push(k.text)
  }
  return { texte: aus, unklar }
}
