# Stadt Zürich – echte Testantworten, 02.11.2026

Quelle: Stadt Zürich, Dienstabteilung Verkehr, CC0. Öffentliche Daten, keine Falldaten.

- `tempo.json`: WFS 1.1.0, Dienst `Signalisierte_Geschwindigkeiten`, Typ `view_geoserver_tempo_ist`, GeoJSON/LV95,
  BBOX 2682800,1247000,2683300,1247500: 101 Abschnitte, davon 64 Fahrverbote. Kein publizierter/geplanter Zustand.
- `zonen.json`: gleicher Ausschnitt, Dienst `Verkehrszonen`, Typ `view_geoserver_zonen_ist`: vier MultiPolygone,
  darunter Tempo-30-, Begegnungs- und Fussgängerzonen. Die Verkehrszonentypen sind keine Bau-/Nutzungszonen.
- `*-metadaten.json`: öffentliche CKAN-package_show-Antworten, IDs `geo_signalisierte_geschwindigkeiten` / `geo_verkehrszonen`.
  `dateLastUpdated` als Katalogstand, nicht `metadata_modified`. Diese Dateien sind Prüfproben; die Apps fragen den Stand neu ab.

Dokumentation: https://data.stadt-zuerich.ch/dataset/geo_signalisierte_geschwindigkeiten und
https://data.stadt-zuerich.ch/dataset/geo_verkehrszonen . Geprüfte Attribute: Temporegime/Codes, Lokalisations-/Zonenname,
Datum Umsetzung/Rechtskraft sowie Ausnahmen/Signal bei Fahrverboten. Keine eigenen Richtungs- oder Höhenattribute.
