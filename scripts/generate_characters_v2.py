#!/usr/bin/env python3
"""ORVO24 characters v2 — ideogram photojournalism style."""
import json
import os
import time
import urllib.request
from pathlib import Path

API = os.environ["Daniel"]
OUT = Path("/workspace/assets/characters/v2")
OUT.mkdir(parents=True, exist_ok=True)
MODEL = "ideogram-ai/ideogram-v3-quality"

# Documentary / photojournalism — NOT beauty, NOT AI polish
BASE = (
    "Documentary photojournalism photograph, Magnum Photos style, real unretouched person, "
    "harsh mixed office lighting, slight grain, natural skin with pores and imperfections, "
    "candid not posed, NOT illustration NOT CGI NOT 3D NOT anime NOT beauty filter"
)

CHARACTERS = [
    {"id": "01_hero_woman", "name": "Maya", "prompt": f"{BASE}, Israeli woman 28 leaving startup office, dark ponytail, white shirt, confident tired smile, holding bag"},
    {"id": "02_guy_asks", "name": "Tom", "prompt": f"{BASE}, Israeli man 31 at conference table, surprised expression asking question, blue shirt, stubble, leaning forward"},
    {"id": "03_skeptic", "name": "Alex", "prompt": f"{BASE}, man 33 with glasses skeptical expression, grey t-shirt, startup meeting, arms crossed"},
    {"id": "04_woman_laptop", "name": "Sarah", "prompt": f"{BASE}, Black woman 27 working on laptop in meeting, natural hair, cream sweater, focused"},
    {"id": "05_man_laptop", "name": "David", "prompt": f"{BASE}, East Asian man 29 typing laptop, black t-shirt, side profile, office"},
    {"id": "06_woman_notes", "name": "Lina", "prompt": f"{BASE}, Latina woman 30 taking notes in meeting, minimal makeup, blazer, pen and notebook"},
    {"id": "07_man_senior", "name": "Omer", "prompt": f"{BASE}, Israeli man 40 team lead, grey hair stubble, navy polo, calm expression, wrinkles"},
    {"id": "08_woman_junior", "name": "Noa", "prompt": f"{BASE}, Israeli woman 24 junior employee, brown hair brown eyes, black top, shy smile, freckles"},
]


def api(method, url, data=None):
    body = json.dumps(data).encode() if data is not None else None
    for attempt in range(6):
        req = urllib.request.Request(
            url, data=body, method=method,
            headers={"Authorization": f"Bearer {API}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 15 * (attempt + 1)
                print(f"  rate limit, wait {wait}s", flush=True)
                time.sleep(wait)
                continue
            if e.code in (502, 503, 504) and attempt < 5:
                time.sleep(12 * (attempt + 1))
                continue
            raise


def poll(url, label):
    while True:
        p = api("GET", url)
        s = p["status"]
        print(f"  [{label}] {s}", flush=True)
        if s == "succeeded":
            out = p["output"]
            return out if isinstance(out, str) else out[0]
        if s in ("failed", "canceled"):
            raise RuntimeError(f"{label}: {p.get('error')}")
        time.sleep(10)


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "orvo24/2.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        path.write_bytes(r.read())


def add_grain(path):
    tmp = path.with_suffix(".grain.jpg")
    os.system(
        f"ffmpeg -y -i '{path}' -vf 'noise=alls=8:allf=t+u,eq=contrast=1.05:saturation=0.92' "
        f"-q:v 2 '{tmp}' 2>/dev/null && mv '{tmp}' '{path}'"
    )


def main():
    manifest = {"model": MODEL, "version": "v2-ideogram", "characters": []}
    for ch in CHARACTERS:
        out = OUT / f"{ch['id']}.jpg"
        print(f"\n=== {ch['name']} ===", flush=True)
        pred = api("POST", f"https://api.replicate.com/v1/models/{MODEL}/predictions", {
            "input": {"prompt": ch["prompt"], "aspect_ratio": "3:4"},
        })
        url = poll(pred["urls"]["get"], ch["id"])
        download(url, out)
        add_grain(out)
        print(f"  saved {out} ({out.stat().st_size // 1024}KB)", flush=True)
        manifest["characters"].append({**ch, "file": str(out)})
        time.sleep(14)  # rate limit: 6/min

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\nDONE — 8 v2 in {OUT}", flush=True)


if __name__ == "__main__":
    main()
