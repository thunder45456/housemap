"""Fetch (1) hypermarkets/department stores that matter and (2) schools into extra.json-style files.

Usage: python -I tools/fetch_extra.py
Writes malls_raw.json and schools.json (schools: lazy-loaded by the site when someone opens the place picker).
"""
import json, sys, time, urllib.parse, urllib.request
from datetime import date
from pathlib import Path

BBOX = (16.8, 97.3, 20.5, 100.4)
ENDPOINTS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
ROOT = Path(__file__).resolve().parent.parent

def run(query):
    bbox = ",".join(str(x) for x in BBOX)
    ql = f"[out:json][timeout:180];{query}({bbox});out center tags;"
    data = urllib.parse.urlencode({"data": ql}).encode()
    last = None
    for ep in ENDPOINTS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(ep, data=data, headers={"User-Agent": "HouseMap-extra/1.0"})
                with urllib.request.urlopen(req, timeout=240) as r:
                    return json.load(r)["elements"]
            except Exception as e:  # noqa: BLE001
                last = e
                print(f"  retry {ep}: {e}", file=sys.stderr)
                time.sleep(8)
    raise SystemExit(f"Overpass failed: {last}")

def pt(e):
    lat = e.get("lat") or (e.get("center") or {}).get("lat")
    lng = e.get("lon") or (e.get("center") or {}).get("lon")
    return lat, lng

def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("all", "malls"):
        els = run('nwr["shop"~"^(mall|department_store|supermarket|wholesale)$"]["name"~"Lotus|โลตัส|Big ?C|บิ๊กซี|Makro|แมคโคร|Tops|ท็อปส์|Central|เซ็นทรัล|Robinson|โรบินสัน|Maya|เมญ่า|Promenada|พรอมมีนาดา|Think|ทิงค์|Kad|กาดสวนแก้ว|Airport|แอร์พอร์ต|Nim|นิ่ม|Meechok|มีโชค|Star|Pantip|พันธุ์ทิพย์|Complex|คอมเพล็กซ์|Plaza|พลาซ่า|Mall|มอลล์|Festival|เฟสติวัล|Rim ?Ping|ริมปิง|Fresh|IKEA|HomePro|โฮมโปร|Global|โกลบอล"]')
        out = []
        for e in els:
            lat, lng = pt(e)
            t = e.get("tags", {})
            name = t.get("name:th") or t.get("name") or t.get("name:en")
            if lat is None or not name: continue
            out.append({"n": name.strip()[:80], "en": (t.get("name:en") or "")[:80], "brand": t.get("brand", "")[:40], "shop": t["shop"], "lat": round(lat, 5), "lng": round(lng, 5)})
        (ROOT / "tools" / "malls_raw.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        print("malls_raw", len(out))
        time.sleep(5)
    if which in ("all", "schools"):
        els = run('nwr["amenity"~"^(school|university|college)$"]')
        items = []
        for e in els:
            lat, lng = pt(e)
            t = e.get("tags", {})
            name = t.get("name:th") or t.get("name") or t.get("name:en")
            if lat is None or not name: continue
            kind = "u" if t["amenity"] in ("university", "college") else "s"
            items.append({"t": "school", "k": kind, "n": name.strip()[:80], "lat": round(lat, 5), "lng": round(lng, 5)})
        (ROOT / "schools.json").write_text(json.dumps({"v": 1, "fetched": date.today().isoformat(), "source": "OpenStreetMap contributors (ODbL)", "items": items}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print("schools", len(items), (ROOT / "schools.json").stat().st_size // 1024, "KB")

main()
