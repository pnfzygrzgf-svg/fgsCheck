// Berner Tempo-Anbieter (E0): unveränderter Dienst, URL-Bau und Umwandlung aus daten/vsig.ts.
// Prüfung von LV95, Übertragungsgrenzen, HTTP-Fehlern und Zwischenspeicher bleiben in geoportal.ts.
import { arcgisUrl, arcgisHolen, linienTeile, textFeld, zahlFeld, featureId, type ArcgisGeoJson } from '../geoportal'
import { quelle } from '../quellenregister'
import type { Anbieter, TempoDaten, TempoLinie } from './typen'

export const BERN_TEMPO_DIENST = 'Signalisierte_Hoechstgeschwindigkeit'

const quelleneintrag = quelle('bern.vsig')
if (!quelleneintrag) throw new Error('Tempo-Anbieter bern.vsig fehlt im Quellenregister')

/** V_sig ausserhalb 5–130 km/h gilt als ohne Angabe; leere Linien bleiben für die Zuordnung erhalten. */
function tempoAusGeoportal(gj: ArcgisGeoJson): TempoDaten {
  const linien: TempoLinie[] = (gj.features ?? []).flatMap((f, i) => {
    const teile = linienTeile(f), pr = f.properties ?? {}
    if (!teile.length) return []
    const v = zahlFeld(pr.V_sig), ok = (x: number | null) => (x !== null && x >= 5 && x <= 130 ? x : null)
    const afu = ok(zahlFeld(pr.V_afu_manuell)) ?? ok(zahlFeld(pr.V_afu))
    return [{ id: featureId('bernvsig', f, i), strasse: textFeld(pr.Strassenname) ?? '', vSig: ok(v), teile,
      ...(afu !== null ? { vAfu: afu } : {}) }]
  })
  return { linien }
}

const tempoUrl = (lat: number, lon: number, radiusM: number) =>
  arcgisUrl(BERN_TEMPO_DIENST, lat, lon, radiusM, 'Objectid,V_sig,V_afu,V_afu_manuell,Strassenname', { nachkomma: 2 })

export const BERN_TEMPO: Anbieter<ArcgisGeoJson, TempoDaten> = {
  quelle: quelleneintrag,
  thema: 'tempo',
  format: 'geojson',
  datenart: 'signalisiert',
  datenstand: null,
  abdeckung: {
    inhalt: 'Signalisierte Höchstgeschwindigkeit je Strassenachse der Stadt Bern',
    einschraenkungen: ['Linien ohne V_sig liefern keinen Tempowert', 'Keine Angabe zu Zone oder Strecke',
      'V_afu und V_afu_manuell dienen nur als Hinweis bei einem Widerspruch'],
    vollstaendigkeit: 'unbekannt',
  },
  url: tempoUrl,
  umwandeln: tempoAusGeoportal,
  async laden(lat, lon, radiusM, signal) {
    const r = await arcgisHolen(tempoUrl(lat, lon, radiusM), signal)
    return { ...r, daten: tempoAusGeoportal(r.daten) }
  },
}
