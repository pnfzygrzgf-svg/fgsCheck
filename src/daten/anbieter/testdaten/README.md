# Berner Tempo-Testdaten

Quelle: **Geodaten Stadt Bern**, Geoportal, Dienst `Signalisierte_Hoechstgeschwindigkeit`, Layer 0.
Freie Nutzung mit Quellenangabe gemäss dem bestehenden Quellenregister-Eintrag `bern.vsig`.

`bernTempo.json` enthält die drei unveränderten Features mit Objectid 81, 83 und 2640 aus der bereits lokal gespeicherten
Antwort `referenz_bern/cache/vsig_177.json`. Die übrigen Features sind entfernt; die Datei ist keine vollständige Antwort.
Übernommen für E0 am 01.11.2026; ursprünglicher Abrufzeitpunkt und fachlicher Datenstand sind unbekannt.

Die Probe prüft LineString, MultiLineString, Koordinaten mit Höhe und einen leeren V_sig. Die synthetischen Fälle in
`anbieter.test.ts` ergänzen AFU-Werte, Übertragungsgrenzen und Fehler. Die Tests benötigen keinen Netzzugriff.
