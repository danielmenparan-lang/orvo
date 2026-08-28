#!/usr/bin/env python3
"""Retry failed scenes with bytedance/seedance-2.5."""
import json
import os
import time
import urllib.request

API_TOKEN = os.environ["Daniel"]
VERSION = "ca38262bae0952bf80a7f10eda58af860a0eae7d48957a099e32632792b8f116"
OUT_DIR = "/workspace/assets/videos"

SCENES = {
    "meeting": "Modern startup office meeting room, diverse team at conference table, warm natural light, subtle camera push-in, people shift and listen attentively, cinematic, realistic human motion, orange accent decor on walls",
    "leave": "Professional woman in business casual stands up and walks away from conference table toward door, confident smile, coworkers watch, smooth natural walking motion, bright startup office with orange accents",
}


def api(method, url, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {API_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "orvo-demo/1.0"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        with open(path, "wb") as f:
            f.write(resp.read())


def generate(key, prompt):
    pred = api("POST", "https://api.replicate.com/v1/predictions", {
        "version": VERSION,
        "input": {
            "prompt": prompt,
            "duration": 5,
            "resolution": "720p",
            "aspect_ratio": "16:9",
            "generate_audio": False,
        },
    })
    poll_url = pred["urls"]["get"]
    print(f"started {key}: {pred['id']}", flush=True)
    while True:
        pred = api("GET", poll_url)
        status = pred["status"]
        print(f"{key}: {status}", flush=True)
        if status == "succeeded":
            dest = os.path.join(OUT_DIR, f"{key}.mp4")
            download(pred["output"], dest)
            print(f"saved {dest}", flush=True)
            return
        if status in ("failed", "canceled"):
            raise RuntimeError(f"{key} failed: {pred.get('error')}")
        time.sleep(20)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for key, prompt in SCENES.items():
        if os.path.isfile(os.path.join(OUT_DIR, f"{key}.mp4")):
            print(f"skip {key} (exists)", flush=True)
            continue
        generate(key, prompt)


if __name__ == "__main__":
    main()
