#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────────────────────
# Fussgängerstreifen aus dem Luftbild, die in OpenStreetMap fehlen → gebündelter Snapshot für fgsCheck.
#
# Quelle: eigene Läufe des Modells «remote_velo» (ETH Zürich, Papini/Zani/Adey 2026, MIT-Lizenz, DOI
# 10.1007/s11116-026-10728-8) auf SWISSIMAGE 10 cm (© swisstopo) bzw. dem Orthofoto der Stadt Bern 2026 (© Geodaten Stadt Bern),
# wie in VeloroutenCheck (tools/luftbild_stadt.py): je Ordner funde_curriculum.jsonl und funde_paper.jsonl, eine Zeile je Fund
#   {"cls": "crosswalk", "conf": 0.91, "poly": [[E, N] × 4, LV95], "jahr": 2024, "quelle": "bern2026" (nur Stadtflug), ...}
# Übernommen werden nur Lage, Sicherheit, Flugjahr und Richtung der Funde der Klasse «crosswalk»; kein Feld aus dem
# ETH-Datensatz 2021 (InC-NC, nicht öffentlich), keine Bildausschnitte.
#
# Schritte (Zahlen je Schritt in der Ausgabe):
#   1. Funde der Klasse crosswalk aus allen Ordnern und beiden Modellen;
#   2. zusammenfassen: Mitten höchstens ZUSAMMEN_M auseinander (Kette, über Modelle und Flüge); je Gruppe Lage und Richtung des
#      sichersten Funds, grösste Sicherheit, alle Flugjahre;
#   3. Sicherheit mindestens CONF_MIN;
#   4. Mitte höchstens STRASSE_M von einer OSM-Strasse für Fahrzeuge (STRASSEN; nicht service, parking_aisle, track, Fuss- und
#      Radwege): Funde auf Parkplätzen, in Gärten und auf Plätzen fallen weg;
#   5. kein OSM-Übergang in UEBERGANG_M: Knoten highway=crossing|traffic_signals bzw. mit crossing*, crossing_ref (ausser
#      crossing=no), Weg footway=crossing. Die App blendet zur Laufzeit zusätzlich jeden Kandidaten aus, der in der geladenen
#      Übergangssuche einen OSM-Übergang in 15 m hat (OSM inzwischen nachgeführt).
#
# Richtung: Azimut der langen Seite des Fund-Rechtecks (Grad ab Nord im Uhrzeigersinn, 0–179); bei einem fast quadratischen
# Rechteck (lange : kurze Seite unter RICHTUNG_VERHAELTNIS) null. Die lange Seite liegt meist entlang der Gehrichtung
# (Streifenachse); die App nimmt sie nur, wenn sie höchstens 45° von der Senkrechten zur Strasse abweicht.
#
# Kennung: negative ganze Zahl aus der Lage auf den Meter, −((E − 2 000 000) · 10⁶ + (N − 1 000 000)): stabil bei neuem Lauf,
# nie eine OSM-Kennung (die sind positiv).
#
# Erzeugt public/luftbild_fgs_<stadt>.json =
#   { "quelle", "modell", "flug", "flugjahre", "bild_je_jahr", "erzeugt", "osm_stand", "filter", "bbox": [lon_min, lat_min, lon_max, lat_max],
#     "kandidaten": [{ "id", "p": [E, N] (0,1 m), "conf" (0,01), "jahre": [..], "richtung": Grad | null }] }
#
# Braucht GDAL (osgeo) und Netz (Overpass, overpass.osm.ch). Aufruf aus dem Ordner fgsCheckWeb:
#   python3 tools/luftbild_fgs.py <stadt> <ordner mit funde_*.jsonl> [weitere Ordner …]
#   z. B. python3 tools/luftbild_fgs.py bern ~/Documents/VeloroutenCheck/_lokal/luftbild_erkennung \
#                                            ~/Documents/VeloroutenCheck/_lokal/luftbild_erkennung/bern2026
#         python3 tools/luftbild_fgs.py zurich ~/Documents/VeloroutenCheck/_lokal/luftbild_erkennung/zuerich
# ─────────────────────────────────────────────────────────────────────────────
import datetime, json, math, os, sys, time, urllib.parse, urllib.request
from osgeo import osr

osr.UseExceptions()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELLE = ("curriculum", "paper")
KLASSE = "crosswalk"
ZUSAMMEN_M = 8.0
CONF_MIN = 0.5
STRASSE_M = 6.0
UEBERGANG_M = 15.0
RICHTUNG_VERHAELTNIS = 1.25
STRASSEN = ["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
            "tertiary", "tertiary_link", "unclassified", "residential", "living_street"]
OVERPASS = ["https://overpass.osm.ch/api/interpreter", "https://overpass-api.de/api/interpreter"]
KACHEL_GRAD = 0.03          # Overpass-Abfrage in Kacheln (rund 2,3 × 3,3 km)
BILD_NAMEN = {"swissimage": "SWISSIMAGE 10 cm © swisstopo",
              "bern2026": "Orthofoto Stadt Bern 19.03.2026, 10 cm © Geodaten Stadt Bern"}
BILD_KURZ = {"swissimage": "SWISSIMAGE", "bern2026": "Orthofoto Stadt Bern"}

lv95 = osr.SpatialReference(); lv95.ImportFromEPSG(2056)
wgs = osr.SpatialReference(); wgs.ImportFromEPSG(4326)
wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)   # lon, lat
ZU_WGS = osr.CoordinateTransformation(lv95, wgs)
ZU_LV95 = osr.CoordinateTransformation(wgs, lv95)


def mitte(p):
    return (sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p))


def richtung(p):
    """Azimut (Grad ab Nord, 0–179) der langen Seite des Rechtecks; None, wenn fast quadratisch."""
    a, b = math.dist(p[0], p[1]), math.dist(p[1], p[2])
    lang, kurz = (p[0], p[1]) if a >= b else (p[1], p[2])
    if min(a, b) <= 0 or max(a, b) / min(a, b) < RICHTUNG_VERHAELTNIS:
        return None
    de, dn = kurz[0] - lang[0], kurz[1] - lang[1]
    return int(round(math.degrees(math.atan2(de, dn)))) % 180


def kennung(e, n):
    return -((int(round(e)) - 2_000_000) * 1_000_000 + (int(round(n)) - 1_000_000))


class Raster:
    """Einfaches Gitter für Nachbarsuchen (Zellen in m)."""
    def __init__(self, zelle):
        self.z, self.c = zelle, {}

    def schluessel(self, x, y):
        return int(x // self.z), int(y // self.z)

    def add(self, x, y, obj):
        self.c.setdefault(self.schluessel(x, y), []).append(obj)

    def nahe(self, x, y, r):
        i0, j0 = self.schluessel(x - r, y - r)
        i1, j1 = self.schluessel(x + r, y + r)
        for i in range(i0, i1 + 1):
            for j in range(j0, j1 + 1):
                yield from self.c.get((i, j), ())


def funde_lesen(ordnerliste):
    funde, zahl = [], {}
    for ordner in ordnerliste:
        for m in MODELLE:
            pfad = os.path.join(ordner, f"funde_{m}.jsonl")
            if not os.path.exists(pfad):
                sys.exit(f"{pfad} fehlt")
            n = 0
            for z in open(pfad, encoding="utf-8"):
                f = json.loads(z)
                if f.get("cls") != KLASSE or len(f.get("poly", [])) < 4:
                    continue
                p = [tuple(q) for q in f["poly"][:4]]
                funde.append({"m": mitte(p), "conf": float(f["conf"]), "jahr": int(f["jahr"]) if f.get("jahr") else None,
                              "bild": f.get("quelle", "swissimage"), "richtung": richtung(p)})
                n += 1
            zahl[pfad] = n
    return funde, zahl


def zusammenfassen(funde):
    """Kette: Mitten höchstens ZUSAMMEN_M auseinander gehören zusammen (Union-Find über ein Gitter)."""
    eltern = list(range(len(funde)))

    def wurzel(i):
        while eltern[i] != i:
            eltern[i] = eltern[eltern[i]]
            i = eltern[i]
        return i
    r = Raster(ZUSAMMEN_M)
    for i, f in enumerate(funde):
        for j in r.nahe(*f["m"], ZUSAMMEN_M):
            if math.dist(f["m"], funde[j]["m"]) <= ZUSAMMEN_M:
                a, b = wurzel(i), wurzel(j)
                if a != b:
                    eltern[a] = b
        r.add(*f["m"], i)
    gruppen = {}
    for i in range(len(funde)):
        gruppen.setdefault(wurzel(i), []).append(funde[i])
    aus = []
    for g in gruppen.values():
        best = max(g, key=lambda f: f["conf"])
        aus.append({"m": best["m"], "conf": best["conf"], "richtung": best["richtung"],
                    "jahre": sorted({f["jahr"] for f in g if f["jahr"]}), "bilder": {f["bild"] for f in g},
                    "jahrbild": {f["jahr"]: f["bild"] for f in g if f["jahr"]}})
    return aus


def overpass(abfrage):
    letzter = ""
    for versuch in range(3):
        for url in OVERPASS:
            try:
                req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": abfrage}).encode(),
                                             headers={"User-Agent": "fgsCheck tools/luftbild_fgs.py (Snapshot, einmalig)"})
                with urllib.request.urlopen(req, timeout=300) as r:
                    d = json.loads(r.read().decode("utf-8"))
                if "runtime error" in str(d.get("remark", "")):
                    raise RuntimeError(d["remark"])
                return d
            except Exception as e:  # nächster Server bzw. neuer Versuch
                letzter = f"{url}: {e}"
                time.sleep(5 * (versuch + 1))
    sys.exit(f"Overpass nicht erreichbar ({letzter})")


def osm_laden(bbox):
    """Strassen (Segmente in LV95) und Übergänge (Punkte bzw. Segmente footway=crossing) im Rechteck, in Kacheln."""
    lon0, lat0, lon1, lat1 = bbox
    strassen, uebergaenge, quer, gesehen, stand = [], [], [], set(), ""
    lats = [lat0 + i * KACHEL_GRAD for i in range(int(math.ceil((lat1 - lat0) / KACHEL_GRAD)) + 1)]
    lons = [lon0 + i * KACHEL_GRAD for i in range(int(math.ceil((lon1 - lon0) / KACHEL_GRAD)) + 1)]
    kacheln = [(a, b, min(a + KACHEL_GRAD, lat1), min(b + KACHEL_GRAD, lon1)) for a in lats[:-1] or [lat0] for b in lons[:-1] or [lon0]]
    for k, (s, w, n, e) in enumerate(kacheln):
        bb = f"{s:.6f},{w:.6f},{n:.6f},{e:.6f}"
        d = overpass(f'[out:json][timeout:240];(way({bb})["highway"~"^({"|".join(STRASSEN)})$"];way({bb})["footway"="crossing"];);'
                     f'out tags geom;(node({bb})["highway"~"^(crossing|traffic_signals)$"];node({bb})["crossing"];'
                     f'node({bb})["crossing:markings"];node({bb})["crossing_ref"];);out;')
        ts = str(d.get("osm3s", {}).get("timestamp_osm_base", ""))
        stand = ts[:10] if len(ts) >= 10 and ts[4] == "-" else stand
        for el in d.get("elements", []):
            schl = (el["type"], el["id"])
            if schl in gesehen:
                continue
            gesehen.add(schl)
            t = el.get("tags", {})
            if el["type"] == "node":
                if t.get("crossing") == "no" and t.get("highway") != "traffic_signals":
                    continue
                x, y, _ = ZU_LV95.TransformPoint(el["lon"], el["lat"])
                uebergaenge.append((x, y))
            elif el["type"] == "way" and el.get("geometry"):
                pts = [ZU_LV95.TransformPoint(g["lon"], g["lat"])[:2] for g in el["geometry"] if g]
                segs = list(zip(pts, pts[1:]))
                (quer if t.get("footway") == "crossing" else strassen).extend(segs)
        print(f"  Overpass Kachel {k + 1}/{len(kacheln)}: {len(strassen)} Strassensegmente, {len(uebergaenge)} Übergangsknoten, "
              f"{len(quer)} Segmente footway=crossing", flush=True)
        time.sleep(2)
    return strassen, uebergaenge, quer, stand


def abstand_segment(p, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    l2 = vx * vx + vy * vy
    t = 0 if l2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2))
    return math.dist(p, (a[0] + t * vx, a[1] + t * vy))


def segment_raster(segs, zelle=50.0):
    r = Raster(zelle)
    for s in segs:
        # Segment in jede Zelle seiner Hülle (Segmente sind meist kurz)
        x0, x1 = sorted((s[0][0], s[1][0])); y0, y1 = sorted((s[0][1], s[1][1]))
        i0, j0 = r.schluessel(x0, y0); i1, j1 = r.schluessel(x1, y1)
        for i in range(i0, i1 + 1):
            for j in range(j0, j1 + 1):
                r.c.setdefault((i, j), []).append(s)
    return r


def naechstes_segment(r, p, grenze):
    return min((abstand_segment(p, *s) for s in r.nahe(*p, grenze)), default=math.inf)


def main():
    if len(sys.argv) < 3:
        sys.exit("Aufruf: python3 tools/luftbild_fgs.py <stadt> <ordner mit funde_*.jsonl> [weitere Ordner …]")
    stadt, ordnerliste = sys.argv[1], sys.argv[2:]
    funde, zahl = funde_lesen(ordnerliste)
    for pfad, n in zahl.items():
        print(f"  {pfad}: {n} Funde {KLASSE}")
    print(f"1. Funde {KLASSE}: {len(funde)}")
    gruppen = zusammenfassen(funde)
    print(f"2. zusammengefasst ({ZUSAMMEN_M:g} m): {len(gruppen)}")
    gruppen = [g for g in gruppen if g["conf"] >= CONF_MIN]
    print(f"3. Sicherheit ab {CONF_MIN:g}: {len(gruppen)}")
    lonlat = [ZU_WGS.TransformPoint(*g["m"])[:2] for g in gruppen]
    rand = 0.002
    bbox = (min(x for x, _ in lonlat) - rand, min(y for _, y in lonlat) - rand, max(x for x, _ in lonlat) + rand,
            max(y for _, y in lonlat) + rand)
    strassen, uebergaenge, quer, stand = osm_laden(bbox)
    rs, rq, ru = segment_raster(strassen), segment_raster(quer), Raster(50.0)
    for u in uebergaenge:
        ru.add(*u, u)
    gruppen = [g for g in gruppen if naechstes_segment(rs, g["m"], STRASSE_M) <= STRASSE_M]
    print(f"4. an einer Strasse für Fahrzeuge (bis {STRASSE_M:g} m): {len(gruppen)}")
    ohne = []
    for g in gruppen:
        if any(math.dist(g["m"], u) <= UEBERGANG_M for u in ru.nahe(*g["m"], UEBERGANG_M)):
            continue
        if naechstes_segment(rq, g["m"], UEBERGANG_M) <= UEBERGANG_M:
            continue
        ohne.append(g)
    print(f"5. ohne OSM-Übergang in {UEBERGANG_M:g} m: {len(ohne)}")
    bilder = set().union(*(g["bilder"] for g in ohne)) if ohne else set()
    jahre = sorted({j for g in ohne for j in g["jahre"]})
    jahrbild = {}
    for g in ohne:
        jahrbild.update(g["jahrbild"])
    flug = " und ".join(BILD_NAMEN[b] for b in ("swissimage", "bern2026") if b in bilder)
    ohne.sort(key=lambda g: (g["m"][0], g["m"][1]))
    ll = [ZU_WGS.TransformPoint(*g["m"])[:2] for g in ohne]
    out = {
        "quelle": f"Luftbild {flug}; Erkennung: Modell remote_velo, ETH Zürich (MIT-Lizenz), eigener Lauf; Abgleich © "
                  "OpenStreetMap-Mitwirkende (ODbL)",
        "modell": "remote_velo (ETH Zürich, Papini/Zani/Adey 2026, doi:10.1007/s11116-026-10728-8, MIT-Lizenz), Modelle curriculum "
                  "und paper, Klasse crosswalk",
        "flug": flug,
        "flugjahre": jahre,
        "bild_je_jahr": {str(j): BILD_KURZ[b] for j, b in sorted(jahrbild.items())},   # Kurzname des Luftbilds je Flugjahr (Tooltip)
        "erzeugt": datetime.date.today().isoformat(),
        "osm_stand": stand or datetime.date.today().isoformat(),   # Stand der Overpass-Daten, sonst Tag der Abfrage
        "filter": {"zusammenfassen_m": ZUSAMMEN_M, "conf_min": CONF_MIN, "strasse_m": STRASSE_M, "osm_uebergang_m": UEBERGANG_M},
        "bbox": [round(min(x for x, _ in ll), 5), round(min(y for _, y in ll), 5), round(max(x for x, _ in ll), 5),
                 round(max(y for _, y in ll), 5)] if ll else None,
        "kandidaten": [{"id": kennung(*g["m"]), "p": [round(g["m"][0], 1), round(g["m"][1], 1)], "conf": round(g["conf"], 2),
                        "jahre": g["jahre"], "richtung": g["richtung"]} for g in ohne],
    }
    ziel = os.path.join(ROOT, "public", f"luftbild_fgs_{stadt}.json")
    with open(ziel, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(ohne)} Kandidaten (Flugjahre {jahre}) → {ziel} ({os.path.getsize(ziel)} Bytes)")


if __name__ == "__main__":
    main()
