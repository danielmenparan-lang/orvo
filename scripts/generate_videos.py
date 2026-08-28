#!/usr/bin/env python3
"""Generate ORVO cinematic demo clips via Replicate (minimax/video-01)."""
import json
import os
import time
import urllib.request

API_TOKEN = os.environ["Daniel"]
VERSION = "5aa835260ff7f40f4069c41185f72036accf99e29957bb4a3b3a911f3b6c1912"
OUT_DIR = "/workspace/assets/videos"

SCENES = {
    "meeting": "Modern startup office meeting room, diverse team at conference table, warm natural light, subtle camera push-in, people shift and listen attentively, cinematic, realistic human motion, orange accent decor on walls",
    "leave": "Professional woman in business casual stands up and walks away from conference table toward door, confident smile, coworkers watch, smooth natural walking motion, bright startup office with orange accents",
    "guy": "Man at office meeting table reacts surprised, leans forward slightly, speaks with confused expression, subtle head movement, realistic lip motion, cinematic close-medium shot, startup office background",
    "phone": "Woman holds smartphone up toward camera showing a website on the screen, slight hand lift motion, confident smile, office meeting background, natural human movement, product demo moment",
    "nods": "Office team at meeting table nods in agreement, subtle approving head movements, warm collaborative startup vibe, realistic group reaction, orange accent decor",
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


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    jobs = {}

    for key, prompt in SCENES.items():
        pred = api("POST", "https://api.replicate.com/v1/predictions", {
            "version": VERSION,
            "input": {"prompt": prompt, "prompt_optimizer": True},
        })
        jobs[key] = pred["urls"]["get"]
        print(f"started {key}: {pred['id']}", flush=True)

    manifest = {}
    for key, poll_url in jobs.items():
        while True:
            pred = api("GET", poll_url)
            status = pred["status"]
            print(f"{key}: {status}", flush=True)
            if status == "succeeded":
                out_url = pred["output"]
                dest = os.path.join(OUT_DIR, f"{key}.mp4")
                download(out_url, dest)
                manifest[key] = {
                    "file": f"assets/videos/{key}.mp4",
                    "replicate_url": out_url,
                }
                print(f"saved {dest}", flush=True)
                break
            if status in ("failed", "canceled"):
                raise RuntimeError(f"{key} failed: {pred.get('error')}")
            time.sleep(15)

    with open(os.path.join(OUT_DIR, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print("done", flush=True)


if __name__ == "__main__":
    main()
