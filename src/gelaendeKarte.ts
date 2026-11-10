import type { StreifenErgebnis, ZufahrtErgebnis } from './rechner/typen'
import { erkennungAnzeige, type GelaendeStand } from './erkennungGelaende'
import type { EbenenObjekt } from './quellenEbenen'
import { sichtProfilVorhanden } from './daten/sichtProfil'
import { hoehenDienst, SWISSALTI, type HoehenDienst } from './daten/hoehenDienst'
import { AUGHOEHE_M } from './rechner/erkennung'
import { ZIEL_HOEHE_M } from './erkennungGelaende'
import { ZIEL_HOEHE_WARTE_M } from './sichtGelaende'
import type { P } from './geo'

/** Diagnose der dargestellten Abfragelinie, ohne Änderung der Sichtrechnung. */
export function profilBeruehrtBruecke(auge: P, ziel: P, bruecke?: { enthaelt(p: P): boolean } | null): boolean {
  if (!bruecke) return false
  const n = Math.max(1, Math.ceil(Math.hypot(ziel[0] - auge[0], ziel[1] - auge[1]) / .5))
  for (let i = 0; i <= n; i++) if (bruecke.enthaelt([auge[0] + (ziel[0] - auge[0]) * i / n, auge[1] + (ziel[1] - auge[1]) * i / n])) return true
  return false
}

/** Bereits geprüfte Sichtlinien, keine zusätzliche Höhenabfrage oder Änderung der Rechnung.
 * Die im Abrufcache vorliegenden Punkte erklären den Befund, keine flächige Geländekarte. Der Dienst je Linie folgt dem Modellnamen
 * des Ergebnisses (sichtGelaende.quelle bzw. Erkennung.gelaendeQuelle; ohne Namen swissALTI3D). */
export function gelaendeProfile(streifen: readonly StreifenErgebnis[],
  erkennung: Readonly<Record<string, GelaendeStand>> | null | undefined, vorhanden = sichtProfilVorhanden,
  zufahrtName: (z: ZufahrtErgebnis) => string = z => `Zufahrt ${z.zufahrt}`,
  bruecke?: { enthaelt(p: P): boolean } | null): EbenenObjekt[] {
  const aus: EbenenObjekt[] = []
  for (const [index, s] of streifen.entries()) {
    if (s.trottoirueberfahrt || s.status === 'kein_fgs') continue
    for (const z of s.zufahrten) {
      const nimm = (art: 'warte' | 'markierung', x: number, auge: EbenenObjekt['punkt'], ziel: EbenenObjekt['punkt'], frei: boolean, d: HoehenDienst,
        zielBodenH?: number) => {
        if (!auge || !ziel) return
        const id = `gel:${s.fgsId}:${z.zufahrt}:${art}:${x}`, profil = vorhanden(auge, ziel, d)
        const hinweis = profilBeruehrtBruecke(auge, ziel, bruecke)
          ? 'Der Schnitt berührt einen erfassten Brückenbereich. Das Geländeprofil kann den Boden unter der Brücke zeigen; die Höhe der Brückenfahrbahn ist damit nicht nachgewiesen.' : undefined
        const name = `${zufahrtName(z)}${streifen.length > 1 ? ` · Teilstreifen ${index + 1}` : ''}`
        const auswahlText = `${art === 'warte' ? 'Wartefläche' : 'Bodenmarkierung'} · Auto ${Math.round(x)} m vor dem Streifen · ${hinweis ? 'Brückenbereich, unsicher' : frei ? 'im Geländemodell frei' : 'im Geländemodell verdeckt'}`
        const titel = `${name} · ${auswahlText}`
        aus.push({ id, wert: auswahlText, linien: [[auge, ziel]],
          klasse: hinweis ? 'bruecke' : frei ? 'frei' : 'verdeckt', gestrichelt: true,
          quelle: `${d.anbieter}; ${d.kurz}, Geländeprüfung entlang der Sichtlinien; keine flächige Geländekarte`,
          quellenSchluessel: art === 'warte' ? d.schluessel.sicht : d.schluessel.neigung,
          ...(profil ? { hoehenprofil: { id, titel, gruppe: { id: `${s.fgsId}:${z.zufahrt}`, titel: name }, auswahlText,
            linie: [auge, ziel], punkte: profil.daten, quelle: `${d.anbieter}; Höhenprofil ${d.kurz}${d.id === 'swissalti' ? '/Kombinationsmodell' : ' (25 cm)'}`, zielText: art === 'warte' ? 'Wartefläche' : 'Bodenmarkierung',
            datenstand: profil.datenstand, abgerufen: profil.abgerufen,
            hinweis,
            zweck: `Das Auto steht ${Math.round(x)} m vor dem Fussgängerstreifen. Geprüft wird der Blick vom Fahrer*innenauge ${art === 'warte' ? 'zur Wartefläche' : 'auf die Bodenmarkierung'}.`,
            sicht: { augeM: AUGHOEHE_M, zielM: art === 'warte' ? ZIEL_HOEHE_WARTE_M : ZIEL_HOEHE_M, toleranzM: d.tolM, frei,
              ...(zielBodenH !== undefined ? { zielBodenH } : {}) } } } : {}),
          text: `${name}: ${art === 'warte' ? 'Sicht auf die Wartefläche' : 'Erkennung der Bodenmarkierung'}, ` +
            `${Math.round(x)} m vor dem Streifen; ${hinweis ?? (frei ? 'im Geländemodell frei (andere Hindernisse separat geprüft)' : 'im Geländemodell verdeckt')}; Höhenschnitt unter Kartenebenen → Gelände → Geländeprofile ansehen` })
      }
      if (z.sichtGelaende?.stand === 'mit') {
        const d = hoehenDienst(z.sichtGelaende.quelle) ?? SWISSALTI
        for (const l of z.sichtGelaende.linien) if (!l.bruecke && l.frei !== null) nimm('warte', l.x, l.auge, l.ziel, l.frei, d, l.zielBodenH)
      }
      const a = erkennungAnzeige(z, erkennung)
      const dm = hoehenDienst(a?.e.gelaendeQuelle) ?? SWISSALTI
      for (const l of a?.linien ?? []) {
        if (!l.bruecke && typeof l.gelaende === 'boolean') nimm('markierung', l.x, l.auge, l.ziel, l.gelaende, dm)
      }
    }
  }
  return aus
}
