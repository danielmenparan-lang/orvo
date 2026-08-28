#!/usr/bin/env python3
"""Generate 8 photorealistic office team characters for ORVO24."""
import json
import os
import time
import urllib.request
from pathlib import Path

API = os.environ["Daniel"]
OUT = Path("/workspace/assets/characters")
MODEL = "black-forest-labs/flux-dev"
OUT.mkdir(parents=True, exist_ok=True)

# Photorealistic — NO game/cartoon style
BASE = (
    "Ultra photorealistic professional headshot, natural skin texture with pores and subtle imperfections, "
    "real human photograph, shot on Sony A7IV 85mm f/1.8, soft window light, shallow depth of field, "
    "authentic expression, no CGI, no illustration, no cartoon, no 3D render, no anime, no plastic skin"
)

CHARACTERS = [
    {
        "id": "01_hero_woman",
        "name": "Maya — הגיבורה",
        "role": "Professional woman leaving early, confident and warm",
        "prompt": (
            f"{BASE}, Israeli woman age 28, dark brown hair in low ponytail, warm brown eyes, "
            "subtle natural makeup, white linen blouse, gentle confident smile, startup office background blurred, "
            "approachable and smart, looks like a real person not a model"
        ),
    },
    {
        "id": "02_guy_asks",
        "name": "Tom — שואל למה הולכת",
        "role": "Curious coworker, surprised expression",
        "prompt": (
            f"{BASE}, man age 30, light stubble, short dark hair, casual blue button-down shirt, "
            "slightly surprised curious expression, raised eyebrow, sitting at meeting table, "
            "natural office lighting, looks like real coworker"
        ),
    },
    {
        "id": "03_skeptic",
        "name": "Alex — הספקן",
        "role": "Skeptical team member",
        "prompt": (
            f"{BASE}, man age 32, glasses, neat short hair, grey t-shirt under blazer, "
            "skeptical but friendly expression, arms relaxed, modern office background, "
            "real person candid photo style"
        ),
    },
    {
        "id": "04_woman_laptop",
        "name": "Sarah — בלפטופ",
        "role": "Team member at laptop",
        "prompt": (
            f"{BASE}, Black woman age 27, natural curly hair, focused on laptop screen glow, "
            "cream sweater, conference room setting, authentic workplace moment"
        ),
    },
    {
        "id": "05_man_laptop",
        "name": "David — בלפטופ",
        "role": "Team member at laptop",
        "prompt": (
            f"{BASE}, Asian man age 29, clean look, black t-shirt, typing on laptop, "
            "slight concentration, modern startup office, realistic candid photo"
        ),
    },
    {
        "id": "06_woman_notes",
        "name": "Lina — רושמת",
        "role": "Taking notes in meeting",
        "prompt": (
            f"{BASE}, Latina woman age 31, dark hair shoulder length, holding pen near notebook, "
            "listening attentively, soft smile, business casual, natural meeting room light"
        ),
    },
    {
        "id": "07_man_senior",
        "name": "Omer — מנהל",
        "role": "Senior team lead",
        "prompt": (
            f"{BASE}, Israeli man age 38, salt and pepper short hair, navy polo, "
            "calm leadership presence, slight smile, experienced professional, real executive photo"
        ),
    },
    {
        "id": "08_woman_junior",
        "name": "Noa — ג'וניור",
        "role": "Junior team member",
        "prompt": (
            f"{BASE}, young Israeli woman age 24, light brown hair bob cut, green eyes, "
            "simple black top, eager friendly expression, fresh graduate energy, authentic portrait"
        ),
    },
]


def api(method, url, data=None):
    body = json.dumps(data).encode() if data is not None else None
    for attempt in range(5):
        req = urllib.request.Request(
            url, data=body, method=method,
            headers={"Authorization": f"Bearer {API}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (502, 503, 504) and attempt < 4:
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
            return out[0] if isinstance(out, list) else out
        if s in ("failed", "canceled"):
            raise RuntimeError(f"{label}: {p.get('error')}")
        time.sleep(8)


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "orvo24-chars/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        path.write_bytes(r.read())


def main():
    manifest = {"characters": [], "style": "photorealistic"}

    for ch in CHARACTERS:
        out_path = OUT / f"{ch['id']}.jpg"
        if out_path.exists():
            print(f"skip {ch['id']} (exists)", flush=True)
            manifest["characters"].append({**ch, "file": str(out_path)})
            continue

        print(f"\n=== {ch['name']} ===", flush=True)
        pred = api("POST", f"https://api.replicate.com/v1/models/{MODEL}/predictions", {
            "input": {
                "prompt": ch["prompt"],
                "aspect_ratio": "3:4",
                "num_outputs": 1,
                "output_format": "jpg",
                "output_quality": 95,
                "num_inference_steps": 35,
            },
        })
        img_url = poll(pred["urls"]["get"], ch["id"])
        download(img_url, out_path)
        print(f"  saved {out_path} ({out_path.stat().st_size // 1024}KB)", flush=True)
        manifest["characters"].append({**ch, "file": str(out_path), "url": img_url})

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\nDONE — {len(manifest['characters'])} characters in {OUT}", flush=True)


if __name__ == "__main__":
    main()
