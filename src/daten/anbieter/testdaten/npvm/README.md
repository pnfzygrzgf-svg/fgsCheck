# NPVM-Testantworten – 01.11.2026

- `zuerich.json`: unveränderte GeoAdmin-identify-Antwort für LV95-Rechteck 2682800,1247000,2683300,1247500,
  Layer `ch.are.belastung-personenverkehr-strasse`, `sr=2056`, GeoJSON, 64 Modellstrecken.
- `legende.html`: offizielle [GeoAdmin-Legende](https://api3.geo.admin.ch/rest/services/api/MapServer/ch.are.belastung-personenverkehr-strasse/legend?lang=de),
  Modell NPVM 2023, Datenstand 30.06.2023. Abrufdatum ist davon getrennt.
- `richtungsabgleich.json`: acht Beispielstrecken aus obiger Antwort, mit den zwei gerichteten DTV_FZG-Werten und den
  DTV_MR-Anteilen des offiziellen Originalexports, verknüpft über `nr` / `NO`. Alle 64 Online-Strecken wurden beim lokalen
  Abgleich exakt als Summe der beiden Originalrichtungen bestätigt; acht davon sind hier als Regressionsextrakt archiviert.

Original: [ARE NPVM 2023, Version 3 vom 28.09.2026](https://zenodo.org/records/23009199), Datei
`2_Belastungswerte_Strasse_Schweiz_NPVM_2023.zip`, Tabelle `Belastungswerte_Strasse_Schweiz_NPVM_2023` im GeoPackage.
DTV_FZG umfasst auch Motorräder. Der DWV ist ein anderer Wert und wird nicht als DTV-Ersatz verwendet. Die API liefert
keine einzelnen Richtungen: ihre Richtungssumme darf nicht nochmals verdoppelt werden. Verschiedene NO/Modellstrecken
werden nicht automatisch addiert. Quellenangabe: © ARE, NPVM und AMG; öffentliche Modelldaten, keine Falldaten.

Die grossen Originaldateien liegen nur temporär ausserhalb des Repositorys. Der Testextrakt dokumentiert die geprüfte Fassung,
nicht die Semantik künftiger Modelljahre.
