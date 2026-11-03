import { BEDARF_DIENSTE } from './bedarfOrte'
import { E6_DIENSTE } from './e6'
import type { Gemeinde } from './typen'
export interface RegionalDienst {
  id: string; name: string; anbieter: string; kanton: string; bfs?: number; ausgenommen?: number[]
  art: 'tempo' | 'zone' | 'fgs' | 'signal' | 'lsa' | 'markierung' | 'tram' | 'strasse' | 'bauzone' | 'bedarf' | 'unfall' | 'beleuchtung' | 'taktil' | 'netz'; format: 'wfs' | 'gml' | 'arcgis' | 'ods' | 'qwc' | 'geoAdmin' | 'poi' | 'ogc'; felder?: string; url: string; typ?: string; version?: string; output?: string; where?: string
  apps?: ('fgs'|'swc')[]; lizenz: string; hinweis: string; meta?: string
}
const kt = (id: string, name: string, kanton: string, url: string, typ: string, extra: Partial<RegionalDienst> = {}): RegionalDienst =>
  ({ id, name, kanton, anbieter: `Kanton ${kanton}`, art: 'tempo', format: 'wfs', url, typ, lizenz: 'Quellenangabe gemäss Geoportal', hinweis: 'Inventar deckt nicht zwingend alle Strassen ab.', ...extra })
const arc = (id: string, name: string, kanton: string, url: string, extra: Partial<RegionalDienst> = {}) => kt(id, name, kanton, url, '', { format: 'arcgis', meta: `${url}?f=json`, ...extra })
const ods = (id: string, name: string, kanton: string, host: string, dataset: string, extra: Partial<RegionalDienst> = {}) =>
  kt(id, name, kanton, `https://${host}/api/explore/v2.1/catalog/datasets/${dataset}/records`, '',
    { format: 'ods', meta: `https://${host}/api/explore/v2.1/catalog/datasets/${dataset}`, lizenz: 'CC BY 4.0', ...extra })
export const REGIONAL_DIENSTE: readonly RegionalDienst[] = [
  ...E6_DIENSTE,
  ...BEDARF_DIENSTE,
  kt('ktzh.tempo', 'Tempo auf Staatsstrassen (Kanton Zürich)', 'ZH', 'https://maps.zh.ch/wfs/OGDZHWFS', 'ms:ogd-0450_giszhpub_tba_str_vkm_sign_l', { ausgenommen: [261, 230], lizenz: 'CC0, Kanton Zürich', hinweis: 'Nur Staatsstrassen; keine Gemeindestrassen.' }),
  kt('ktzh.zone', 'Verkehrszonen (Kanton Zürich, verfügt)', 'ZH', 'https://maps.zh.ch/wfs/OGDZHWFS', 'ms:ogd-0065_giszhpub_ogd_tempo_30_20_f', { art: 'zone', ausgenommen: [261], lizenz: 'CC0, Kanton Zürich', hinweis: 'Verfügt ist kein Nachweis der Umsetzung; Übernahme vor Ort bestätigen.' }),
  ods('bs.tempo', 'Tempo (Basel-Stadt)', 'BS', 'data.bs.ch', '100250', { anbieter: 'Geodaten Basel-Stadt' }),
  ...[['100252', 'Tempo-30-Zonen'], ['100215', 'Begegnungszonen'], ['100251', 'Fussgängerzonen'], ['100253', 'Kernzone']].map(([nr, name]) => ods(`bs.zone.${nr}`, `${name} (Basel-Stadt)`, 'BS', 'data.bs.ch', nr, { art: 'zone', anbieter: 'Geodaten Basel-Stadt' })),
  arc('ge.tempo', 'Tempo (Genève)', 'GE', 'https://vector.sitg.ge.ch/arcgis/rest/services/OTC_LIMITATIONS_VITESSE/FeatureServer/0', { anbieter: 'SITG, Canton de Genève', lizenz: 'Données SITG; Quellenangabe und Datenstand' }),
  arc('ge.zone', 'Verkehrszonen (Genève)', 'GE', 'https://vector.sitg.ge.ch/arcgis/rest/services/OTC_ZONE_MODERATION_TRAFIC/FeatureServer/0', { art: 'zone', anbieter: 'SITG, Canton de Genève', lizenz: 'Données SITG; Quellenangabe und Datenstand' }),
  kt('ur.tempo', 'Tempo Kantonsstrassen (Uri)', 'UR', 'https://geo.ur.ch/wfs', 'strassen:ur041_kantonsstrassen_geschwindigkeit', { anbieter: 'LISAG, Kanton Uri' }),
  kt('ur.gemeinde.tempo', 'Tempo Gemeindestrassen (Uri)', 'UR', 'https://geo.ur.ch/wfs', 'strassen:ur043_gemeindestrassennetz_geschwindigkeit', { anbieter: 'LISAG, Kanton Uri' }),
  kt('ur.weitere.tempo', 'Tempo übrige Strassen (Uri)', 'UR', 'https://geo.ur.ch/wfs', 'strassen:ur043_übrige_strassen_geschwindigkeit', { anbieter: 'LISAG, Kanton Uri' }),
  kt('so.tempo', 'Tempo Kantonsstrassen (Solothurn)', 'SO', 'https://geo.so.ch/api/data/v1/ch.so.avt.kantonsstrassen.sig_geschwindigkeiten/', '', { format: 'qwc', anbieter: 'Kanton Solothurn', hinweis: 'Nur Kantonsstrassen.' }),
  kt('sz.tempo', 'Tempo (Schwyz)', 'SZ', 'https://map.geo.sz.ch/mapserv_proxy', 'ms:ch.sz.a115a.geschwindigkeitsbereich', { format: 'gml', anbieter: 'Kanton Schwyz' }),
  arc('fr.tempo', 'Tempo Kantonsstrassen (Fribourg)', 'FR', 'https://maps.fr.ch/ags/rest/services/OpenData/Limitations_de_vitesse__routes_cantonales_/FeatureServer/0', { anbieter: 'Etat de Fribourg', lizenz: 'Source: Etat de Fribourg', hinweis: 'Nur Kantonsstrassen; abweichendes Nachttempo getrennt prüfen.' }),
  kt('ju.tempo', 'Tempo Kantonsstrassen (Jura)', 'JU', 'https://geo.jura.ch/mapserv_proxy?ogcserver=Main_PNG', 'sin_09_26_axes_routiers_vitesse', { format: 'gml', version: '1.1.0', anbieter: 'République et Canton du Jura' }),
  arc('lu.zone', 'Verkehrszonen (Stadt Luzern)', 'LU', 'https://map.stadtluzern.ch/server/rest/services/OGD/verkehrsberuhigte_zone/FeatureServer/16', { art: 'zone', bfs: 1061, anbieter: 'Stadt Luzern', lizenz: '© Geoinformationszentrum Stadt Luzern' }),
  ...[['tempo-30-zonen', 'Tempo-30-Zonen'], ['begegnungszonen', 'Begegnungszonen'], ['fussgangerzone', 'Fussgängerzonen']].map(([nr, name]) => ods(`sg.zone.${nr}`, `${name} (Stadt St. Gallen)`, 'SG', 'daten.stadt.sg.ch', nr, { art: 'zone', bfs: 3203, anbieter: 'Stadt St. Gallen' })),
  kt('lausanne.zone', 'Verkehrszonen (Lausanne)', 'VD', 'https://map.lausanne.ch/mapserv_proxy?ogcserver=source+for+image%2Fpng', 'mobilite_moderation_trafic', { art: 'zone', bfs: 5586, format: 'gml', version: '1.1.0', anbieter: 'Ville de Lausanne', lizenz: 'Open Data Ville de Lausanne, Quellenangabe' }),
  arc('ge.signal', 'Vortritt und Streifensignale (Genève)', 'GE', 'https://vector.sitg.ge.ch/arcgis/rest/services/OTC_SV_SIGNAL/FeatureServer/0', { art: 'signal', anbieter: 'SITG, Canton de Genève', lizenz: 'Données SITG; Quellenangabe und Datenstand', where: "NO_OSR IN ('3.01','3.02','4.11')", hinweis: 'Signalstandort ist keine belegte Querungsachse; Richtung und zugehörige Fahrbahn prüfen.' }),
  arc('ge.lsa', 'Lichtsignalanlagen (Genève)', 'GE', 'https://vector.sitg.ge.ch/arcgis/rest/services/OTC_SL_EQUIPEMENT_CARREFOUR/FeatureServer/0', { art: 'lsa', anbieter: 'SITG, Canton de Genève', lizenz: 'Données SITG; Quellenangabe und Datenstand', where: "TYPE_CARREFOUR_SL = 'SL tricolor'", hinweis: 'Anlagenstandort; keine Signalgruppe oder Querungsphase.' }),
  arc('ge.markierung', 'Fussgängermarkierungen (Genève)', 'GE', 'https://vector.sitg.ge.ch/arcgis/rest/services/OTC_MARQUAGE_LIGNE/FeatureServer/0', { art: 'markierung', anbieter: 'SITG, Canton de Genève', lizenz: 'Données SITG; Quellenangabe und Datenstand', where: "TYPE = 'Piéton'", hinweis: 'Einzelne Markierungslinien, keine fertigen Streifenobjekte; Lage und Zusammengehörigkeit bestätigen.' }),
  arc('lu.fgs', 'Fussgängerstreifen (Kanton Luzern)', 'LU', 'https://public.geo.lu.ch/ogd/rest/services/managed/FUSSGSTR_DS_V1_MP/MapServer/0', { art: 'fgs', anbieter: 'Kanton Luzern', lizenz: '© Kanton Luzern', hinweis: 'Punktinventar; SICHERHEIT ist keine normativ geprüfte Verkehrssicherheit.' }),
  kt('ktzh.fgs', 'Fussgängerstreifen Staatsstrassen (Kanton Zürich)', 'ZH', 'https://maps.zh.ch/wfs/OGDZHWFS', 'ms:ogd-0047_giszhpub_tba_str_fussgaengerstreifen_p', { art: 'fgs', lizenz: 'CC0, Kanton Zürich', ausgenommen: [261], hinweis: 'Nur Staatsstrassen, keine vollständige Erfassung aller Querungen.' }),
  kt('ktzh.lsa', 'Lichtsignalanlagen Staatsstrassen (Kanton Zürich)', 'ZH', 'https://maps.zh.ch/wfs/OGDZHWFS', 'ms:ogd-0523_giszhpub_tba_verkehrstechnik_bsa_p', { art: 'lsa', lizenz: 'CC0, Kanton Zürich', ausgenommen: [261], hinweis: 'Nur aktive Lichtsignalanlagen des BSA-Inventars; keine Signalgruppen.' }),
  kt('sz.signal', 'Vortrittssignale (Schwyz)', 'SZ', 'https://map.geo.sz.ch/mapserv_proxy', 'ms:ch.sz.a245a.strassensignale.vortrittsignale', { art: 'signal', format: 'gml', hinweis: 'Signalstandorte; Fahrbahn, Richtung und Zustand vor Übernahme prüfen.' }),
  kt('sz.fgs_signal', 'Streifensignale 4.11 (Schwyz)', 'SZ', 'https://map.geo.sz.ch/mapserv_proxy', 'ms:ch.sz.a245a.strassensignale.hinweissignale.weitere', { art: 'signal', format: 'gml', hinweis: 'Signal 4.11 belegt keine Querungsachse und keine Abwesenheit anderer Streifen.' }),
  ods('bs.lsa', 'Lichtsignalanlagen (Basel-Stadt)', 'BS', 'data.bs.ch', '100430', { art: 'lsa', anbieter: 'Geodaten Basel-Stadt', hinweis: 'Anlagenpunkte, keine Signalgruppen; CC BY 4.0 und © OpenStreetMap-Mitwirkende.' }),
  arc('lu.lsa', 'Lichtsignalanlagen (Stadt Luzern)', 'LU', 'https://map.stadtluzern.ch/server/rest/services/OGD/lichtsignalanlage/FeatureServer/2', { art: 'lsa', bfs: 1061, anbieter: 'Stadt Luzern', lizenz: '© Geoinformationszentrum Stadt Luzern', hinweis: 'Anlagenstandort; Richtung und Regelung am geprüften Knoten bestätigen.' }),
  kt('stadtzh.lsa', 'Lichtsignalanlagen (Stadt Zürich)', 'ZH', 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Verkehrsknoten_mit_Lichtsignalanlage', 'tbl_knoten_p', { art: 'lsa', bfs: 261, version: '1.1.0', output: 'GeoJSON', anbieter: 'Stadt Zürich, Dienstabteilung Verkehr', lizenz: 'CC0, Stadt Zürich', meta: 'https://data.stadt-zuerich.ch/api/3/action/package_show?id=geo_verkehrsknoten_mit_lichtsignalanlage', hinweis: 'Knoten mit LSA; Betriebszeiten beachten, keine Signalgruppen.' }),
  ods('sg.fgs', 'Fussgängerstreifen (Stadt St. Gallen)', 'SG', 'daten.stadt.sg.ch', 'fussgangerstreifen-stadt-stgallen', { art: 'fgs', bfs: 3203, anbieter: 'Stadt St. Gallen', hinweis: 'Punktinventar; Lage und Strassenzuordnung prüfen.' }),
  kt('zg.fgs', 'Fussgängerstreifen Kantonsstrassen (Zug)', 'ZG', 'https://services.geo.zg.ch/ows/fussgaengerstreifen', 'zg_fussgaengerstreifen_kantonsstrassen', { art: 'fgs', version: '1.1.0', output: 'application/json', anbieter: 'Kanton Zug', lizenz: '© Kanton Zug; freie Nutzung mit Quellenangabe', hinweis: 'Nur Kantonsstrassen, kein vollständiges Gemeindeinventar.' }),

  ...[
    ['bund.tram','Tramgleise (swissTLM3D)','ch.swisstopo.swisstlm3d-eisenbahnnetz','tram','© swisstopo'],
    ['bund.strasse','Strassenklassen (swissTLM3D)','ch.swisstopo.swisstlm3d-strassen','strasse','© swisstopo'],
    ['bund.bauzone','Bauzonen Schweiz (ARE)','ch.are.bauzonen','bauzone','© ARE und Kantone'],
    ['bund.gwr','Gebäudenutzung (GWR, BFS)','ch.bfs.gebaeude_wohnungs_register','bedarf','© BFS, Eidg. Gebäude- und Wohnungsregister'],
    ['bund.unfaelle','Unfälle mit Personenschaden (ASTRA)','ch.astra.unfaelle-personenschaeden_alle','unfall','© ASTRA'],
  ].map(([id,name,layer,art,anbieter]):RegionalDienst=>({id,name,kanton:'CH',anbieter,art:art as RegionalDienst['art'],format:'geoAdmin',url:'https://api3.geo.admin.ch/rest/services/api/MapServer/identify',typ:layer,lizenz:`${anbieter}; freie Nutzung mit Quellenangabe`,hinweis:id==='bund.unfaelle'?'Anonymisierte Unfalllage; nur Kartenkontext, keine Regelwirkung.':'Fachliche Ableitungen nur nach Bestätigung; Vollständigkeit unbekannt.',...(id==='bund.gwr'?{apps:['fgs'] as ['fgs']}:{})})),
  {id:'bund.poi',name:'Einrichtungen (swisstopo Basiskarten-POI)',kanton:'CH',anbieter:'swisstopo Basiskarte',art:'bedarf',format:'poi',url:'https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/tiles.json',apps:['fgs'],lizenz:'© swisstopo, © EDA, © BAFU, © BABS, © SAC, © Naturfreunde Schweiz, © opentransportdata.swiss',hinweis:'POI sind Hinweise; Schul-/Einrichtungsart und Bezug zur Querung bestätigen.'},

]
export const regionalDienst = (id: string) => REGIONAL_DIENSTE.find(d => d.id === id)
export const regionalFuer = (gemeinden: readonly Gemeinde[]) => REGIONAL_DIENSTE.filter(d => d.kanton === 'CH' || gemeinden.some(g => (g.kanton === d.kanton) && (!d.bfs || d.bfs === g.bfs) && !d.ausgenommen?.includes(g.bfs)))
