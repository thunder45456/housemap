"""Curate the important shopping centres / hypermarkets -> replaces the 'mall' items of landmarks.json.

Usage: python -I tools/build_malls.py   (needs tools/malls_raw.json from fetch_extra.py malls, and the old landmarks.json)
Rules (back-office choice): big department stores / malls + hypermarkets (Big C, Lotus's, Makro, Tops Super Store);
small formats (mini, go fresh, express, daily, market) are dropped.
"""
import json, re, math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
raw = json.loads((ROOT / "tools" / "malls_raw.json").read_text(encoding="utf-8"))
lm = json.loads((ROOT / "landmarks.json").read_text(encoding="utf-8"))
old_malls = [i for i in lm["items"] if i["t"] == "mall"]

SMALL = re.compile(r"mini|go ?fresh|fresh|express|daily|market\b|เอ็กซ์เพรส|มินิ|ตลาด|เฟรช", re.I)
HYPER = [
    ("Big C", re.compile(r"^(big ?c|บิ๊กซี|บิ๊กซี).{0,20}$|big c (extra|supercenter)|บิ๊กซี เอ็กซ์ตร้า|บิ๊กซี ซูเปอร์เซ็นเตอร์", re.I)),
    ("Lotus's", re.compile(r"lotus|โลตัส", re.I)),
    ("Makro", re.compile(r"makro|แมคโคร", re.I)),
    ("Tops", re.compile(r"tops (super|plaza)|ท็อปส์ ซูเปอร์|ท็อปส์ พลาซ่า", re.I)),
]
BIG = re.compile(r"central|เซ็นทรัล|robinson|โรบินสัน|maya|เมญ่า|one nimman|วันนิมมาน|kad suan|กาดสวนแก้ว|star avenue|meechok|มีโชค|pantip|พันธุ์ทิพย์|the plaza|เดอะ พลาซ่า|nim city|นิ่มซิตี้|hongfah|topland|ท็อปแลนด์|rimping.*mall|chiang mai complex|airport plaza|เซ็นทรัลพลาซา", re.I)
SKIP = re.compile(r"thaimart|electronic|phoe la min|global house|tj mall|backyard|bigc$|kad farang|ne mall|ไทวัสดุ|พี่|วัสดุ", re.I)

def disp(n, en):
    th = re.search(r"[฀-๿]", n)
    return n if th else (en or n)

def grp(i):
    s = f"{i['n']} {i.get('en','')}"
    if SKIP.search(s) and not re.search(r"lotus|big c|makro", s, re.I): return None
    if SMALL.search(s): return None
    for g, rx in HYPER:
        if rx.search(s): return g
    if BIG.search(s): return "mall"
    return None

cand = []
for i in raw:
    g = grp(i)
    if g: cand.append((g, i))
for i in old_malls:
    s = i["n"]
    if re.search(r"[฀-๿]", s) or not BIG.search(s): 
        pass
    g = grp({"n": i["n"], "en": ""})
    if g == "mall": cand.append(("mall", {"n": i["n"], "en": "", "lat": i["lat"], "lng": i["lng"], "shop": "mall"}))

def km(a, b):
    dx = (a["lng"] - b["lng"]) * 105.5; dy = (a["lat"] - b["lat"]) * 111.2
    return math.hypot(dx, dy)

out = []
for g, i in sorted(cand, key=lambda x: (x[0] != "mall", x[1]["shop"] != "mall")):  # malls first, then hypermarkets
    # one entry per place: drop anything within 350 m of one already kept (malls win over the supermarket inside them)
    if any(km(i, o) < (0.15 if g == "mall" and o["g"] == "mall" else 0.35) for o in out): continue
    name = g if g != "mall" and (g == "Lotus's" or not re.search(r"extra|supercenter|เอ็กซ์ตร้า|ซูเปอร์|plaza", i["n"] + i.get("en", ""), re.I)) else disp(i["n"], i.get("en", ""))
    out.append({"t": "mall", "n": name[:80], "lat": i["lat"], "lng": i["lng"], "g": g})

lm["items"] = [i for i in lm["items"] if i["t"] != "mall"] + [{k: v for k, v in o.items() if k != "g"} for o in out]
lm["fetched"] = lm["fetched"]
(ROOT / "landmarks.json").write_text(json.dumps(lm, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(len(out), "malls kept (was", len(old_malls), ")")
import collections
print(collections.Counter(o["g"] for o in out))
for o in out: print(o["g"], o["lat"], o["n"])
