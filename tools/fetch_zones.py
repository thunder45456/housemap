"""Fetch land-use polygons from OpenStreetMap (Overpass) into zones.json.

Usage: python tools/fetch_zones.py
Classes (priority order, most specific first): industrial, commercial, residential, agriculture, forest.
Polygons are simplified (Douglas-Peucker ~20 m), tiny ones dropped, holes ignored, to keep the file small.
This is real land use drawn by volunteers, NOT the legal city plan (ผังเมือง).
"""
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

BBOX = (18.2, 98.5, 19.4, 99.5)  # south, west, north, east: Chiang Mai basin + Lamphun
STEP = 0.3  # tile size in degrees
CACHE = Path(__file__).resolve().parent / "zones_cache"  # per-tile results, lets a re-run resume
ENDPOINTS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter"]
TOL = 0.0002  # degrees, about 20 m

# id -> (overpass tag filters, min area in hectares)
CLASSES = {
    "industrial": (['["landuse"="industrial"]'], 0.1),
    "commercial": (['["landuse"="commercial"]', '["landuse"="retail"]'], 0.1),
    "residential": (['["landuse"="residential"]'], 0.5),
    "agriculture": (['["landuse"~"^(farmland|orchard|plantation|paddy|farmyard|greenhouse_horticulture)$"]'], 5),
    "forest": (['["landuse"="forest"]', '["natural"="wood"]'], 20),
}


def run(query):
    data = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for ep in ENDPOINTS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(ep, data=data, headers={"User-Agent": "HouseMap-zones/1.0"})
                with urllib.request.urlopen(req, timeout=240) as r:
                    return json.load(r)["elements"]
            except Exception as e:  # noqa: BLE001
                last = e
                print(f"  retry {ep} {attempt}: {e}", file=sys.stderr)
                time.sleep(15 * (attempt + 1))
    raise SystemExit(f"Overpass failed: {last}")


def tiles():
    s, w, n, e = BBOX
    la = s
    while la < n - 1e-9:
        lo = w
        while lo < e - 1e-9:
            yield (round(la, 4), round(lo, 4), round(min(la + STEP, n), 4), round(min(lo + STEP, e), 4))
            lo += STEP
        la += STEP


def dp(points, tol):
    """Douglas-Peucker on a list of (lat, lng), iterative."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ay, ax), (by, bx) = points[a], points[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        far, idx = 0.0, -1
        for i in range(a + 1, b):
            py, px = points[i]
            d = math.hypot(px - ax, py - ay) if norm == 0 else abs(dy * (px - ax) - dx * (py - ay)) / norm
            if d > far:
                far, idx = d, i
        if far > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep) if k]


def area_ha(ring):
    lat0 = sum(p[0] for p in ring) / len(ring)
    k = math.cos(math.radians(lat0)) * 111320
    pts = [(p[1] * k, p[0] * 110540) for p in ring]
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2 / 10000


def join_rings(segments):
    """Join open way segments into closed rings (outer members of a multipolygon)."""
    segs = [list(s) for s in segments if len(s) >= 2]
    rings = []
    while segs:
        ring = segs.pop()
        progressed = True
        while ring[0] != ring[-1] and progressed:
            progressed = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += s[::-1][1:]
                elif s[-1] == ring[0]:
                    ring = s[:-1] + ring
                elif s[0] == ring[0]:
                    ring = s[::-1][:-1] + ring
                else:
                    continue
                segs.pop(i)
                progressed = True
                break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
    return rings


def element_rings(el):
    if el["type"] == "way":
        g = [(round(p["lat"], 6), round(p["lon"], 6)) for p in el.get("geometry", [])]
        return [g] if len(g) >= 4 and g[0] == g[-1] else []
    if el["type"] == "relation":
        segs = []
        for m in el.get("members", []):
            if m.get("type") == "way" and m.get("role") in ("outer", "") and m.get("geometry"):
                segs.append([(round(p["lat"], 6), round(p["lon"], 6)) for p in m["geometry"]])
        return join_rings(segs)
    return []


def process_tile(cid, ci, filters, min_ha, tile):
    """Fetch one class x tile, simplify, and cache the result (so a re-run skips finished tiles)."""
    s_, w_, n_, e_ = tile
    f = CACHE / f"{cid}_{s_}_{w_}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    bb = f"({s_:.4f},{w_:.4f},{n_:.4f},{e_:.4f})"
    body = "".join(f"way{x}{bb};relation{x}{bb};" for x in filters)
    els = run(f"[out:json][timeout:200];({body});out geom tags;")
    polys, dropped, seen = [], 0, set()
    for el in els:
        key = (el["type"], el["id"])
        if key in seen:
            continue
        seen.add(key)
        for ring in element_rings(el):
            if area_ha(ring) < min_ha:
                dropped += 1
                continue
            simp = dp(ring[:-1], TOL)
            if len(simp) < 3:
                dropped += 1
                continue
            lats = [p[0] for p in simp]
            lngs = [p[1] for p in simp]
            flat = []
            for la, ln in simp:
                flat += [round(la, 4), round(ln, 4)]
            polys.append({"c": ci, "b": [round(min(lats), 4), round(min(lngs), 4), round(max(lats), 4), round(max(lngs), 4)], "r": flat})
    res = {"polys": polys, "dropped": dropped}
    CACHE.mkdir(exist_ok=True)
    f.write_text(json.dumps(res, separators=(",", ":")), encoding="utf-8")
    return res


def main():
    from concurrent.futures import ThreadPoolExecutor

    ids = list(CLASSES)
    all_tiles = list(tiles())
    print(f"{len(all_tiles)} tiles x {len(ids)} classes", flush=True)
    polys = []
    seen_poly = set()
    for ci, cid in enumerate(ids):
        filters, min_ha = CLASSES[cid]
        kept = dropped = 0
        with ThreadPoolExecutor(max_workers=2) as ex:
            results = list(ex.map(lambda t: process_tile(cid, ci, filters, min_ha, t), all_tiles))
        for r in results:
            dropped += r["dropped"]
            for p in r["polys"]:
                k = (p["c"], tuple(p["r"][:6]), len(p["r"]))  # polygons crossing a tile edge appear twice
                if k in seen_poly:
                    continue
                seen_poly.add(k)
                polys.append(p)
                kept += 1
        print(f"{cid}: kept {kept}, dropped {dropped}", flush=True)
    s_, w_, n_, e_ = BBOX
    out = Path(__file__).resolve().parent.parent / "zones.json"
    out.write_text(json.dumps({"v": 1, "fetched": date.today().isoformat(), "source": "OpenStreetMap contributors (ODbL)", "bbox": [s_, w_, n_, e_], "classes": ids, "polys": polys}, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB, {len(polys)} polygons)")


if __name__ == "__main__":
    main()
