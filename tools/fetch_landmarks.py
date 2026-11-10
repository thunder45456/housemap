"""Fetch landmarks from OpenStreetMap (Overpass) into landmarks.json.

Usage: python tools/fetch_landmarks.py
Covers Chiang Mai + neighbouring provinces. Re-run occasionally to refresh.
Categories: hospital, mall, airport, market.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

BBOX = (16.8, 97.3, 20.5, 100.4)  # south, west, north, east
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

QUERIES = {
    "hospital": 'nwr["amenity"="hospital"]',
    "mall": 'nwr["shop"~"^(mall|department_store)$"]',
    "airport": 'nwr["aeroway"="aerodrome"]["aerodrome:type"!~"military"]["iata"]',
    "market": 'nwr["amenity"="marketplace"]',
}


import re

# OSM has mis-tagged shops under shop=mall; drop obvious non-malls by name.
MALL_BAD = re.compile(r"ร้าน|มินิ|mini|ของชำ|วัสดุ|ก่อสร้าง|ตลาด|ขาย|เซเว่น|7-?eleven", re.I)
# Keep only names that look like real shopping centres / hypermarkets.
MALL_OK = re.compile(r"ห้าง|พลาซ่า|plaza|central|เซ็นทรัล|โรบินสัน|robinson|big ?c|บิ๊กซี|โลตัส|lotus|tops|ท็อป|mall|มอลล์|festival|เมญ่า|maya|complex|คอมเพล็กซ์|แกรนด์|grand|ไอคอน|icon|star avenue|เดอะ|the |เทสโก้|tesco|แมคโคร|makro|โฮมโปร|homepro|ไทวัสดุ|global house|พาร์ค|park|ซิตี้|city|สแควร์|square|walking street|ไนท์บาซาร์|เอ็กซ์ตร้า|extra|ท็อปแลนด์|แอร์พอร์ต", re.I)
THAI = re.compile(r"[฀-๿]")


def keep(cat, name):
    if cat == "mall" and (MALL_BAD.search(name) or not MALL_OK.search(name)):
        return False
    if cat == "airport" and not THAI.search(name):
        return False
    return True


def run(query):
    bbox = ",".join(str(x) for x in BBOX)
    ql = f"[out:json][timeout:180];{query}({bbox});out center tags;"
    data = urllib.parse.urlencode({"data": ql}).encode()
    last = None
    for ep in ENDPOINTS:
        for attempt in range(3):
            try:
                req = urllib.request.Request(ep, data=data, headers={"User-Agent": "HouseMap-landmarks/1.0"})
                with urllib.request.urlopen(req, timeout=240) as r:
                    return json.load(r)["elements"]
            except Exception as e:  # noqa: BLE001
                last = e
                print(f"  retry {ep} {attempt}: {e}", file=sys.stderr)
                time.sleep(10 * (attempt + 1))
    raise SystemExit(f"Overpass failed: {last}")


def main():
    items = []
    for cat, q in QUERIES.items():
        els = run(q)
        kept = 0
        for e in els:
            lat = e.get("lat") or (e.get("center") or {}).get("lat")
            lng = e.get("lon") or (e.get("center") or {}).get("lon")
            tags = e.get("tags", {})
            name = tags.get("name:th") or tags.get("name") or tags.get("name:en")
            if lat is None or lng is None or not name or not keep(cat, name):
                continue
            items.append({"t": cat, "n": name.strip()[:80], "lat": round(lat, 5), "lng": round(lng, 5)})
            kept += 1
        print(f"{cat}: {kept} named of {len(els)}")
        time.sleep(5)
    out = Path(__file__).resolve().parent.parent / "landmarks.json"
    out.write_text(json.dumps({"v": 1, "fetched": date.today().isoformat(), "source": "OpenStreetMap contributors (ODbL)", "items": items}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB, {len(items)} items)")


if __name__ == "__main__":
    main()
