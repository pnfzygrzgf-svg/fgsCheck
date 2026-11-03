# E1a: gespeicherte Antworten

Abgerufen am 01.11.2026 für Tests ohne Netzaufrufe.

- bav-zuerich.json: © BAV, Haltestellen des öffentlichen Verkehrs, GeoAdmin identify, Rechteck LV95 2682800,1247000,2683300,1247500. Unveränderte vollständige Antwort mit Haltestellen, doppelten Treffern, Haltekanten und Betriebspunkten; Datenstand der Ebene aus der separat gespeicherten offiziellen Legende; kein Änderungsdatum je Haltestelle.
- gebiet-zuerich.json: Gemeindegrenzen swissBOUNDARIES3D © swisstopo; Punkt 2683105,1247126, timeInstant=2026, returnGeometry=false. Unveränderte Antwort.

API: https://docs.geo.admin.ch/access-data/identify-features.html

BAV: freie Nutzung mit Quellenangabe © BAV. Gemeindegrenzen: freie Nutzung mit Quellenangabe © swisstopo.

- bav-legende.html: offizielle GeoAdmin-Legende für ch.bav.haltestellen-oev, unveränderte Antwort vom 01.11.2026. Das Feld «Datenstand» nennt 01.11.2026.
- bern-produktstaende.json: unveränderte Felder produktname, letzte_aktualisierung und nachfuehrungsfrequenz aus den 16 verwendeten öffentlichen Berner Produktmetadaten (read_produkt.php?name=…), abgerufen 01.11.2026, © Geodaten Stadt Bern. Personen- und Kontaktfelder wurden nicht übernommen.
- av-publikationsstaende.csv: unveränderte Spalten base_topic, topic, canton, updated_at und cantonal_coverage des öffentlichen Exports https://www.geodienste.ch/info/services.csv?base_topics=av&language=de, abgerufen 01.11.2026. updated_at entspricht dem auf der offiziellen Produktseite ausgewiesenen «Zeitstand (letzte Publikation)»; keine Aussage zum Änderungsdatum einzelner Vermessungsobjekte.

Die Datumswerte sind historische Testdaten. Die App liest die Werte bei jedem neuen Laden aus den offiziellen Quellen; diese Fixtures werden dafür nicht verwendet.
