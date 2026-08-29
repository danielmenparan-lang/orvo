#!/usr/bin/env python3
"""
ORVO24 v3 — bright orange, 16:9 only, all Kling Pro, pleasant to watch.
"""
import base64
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

API = os.environ["Daniel"]
CDN = "https://cdn.jsdelivr.net/gh/danielmenparan-lang/orvo@main/assets/characters/v2"
CHAR = Path("/workspace/assets/characters/v2")
OUT = Path("/workspace/assets/orvo24/v3")
OUT.mkdir(parents=True, exist_ok=True)

IDEOGRAM = "ideogram-ai/ideogram-v3-quality"
KLING = "kwaivgi/kling-v2.1"

# Bright, warm, orange — pleasant startup vibe
STYLE = (
    "Bright warm startup office, golden natural sunlight through windows, orange accent decor, "
    "cheerful pleasant atmosphere, high-key lighting, clean and inviting, photorealistic, "
    "16:9 widescreen cinematic, NOT dark NOT blue NOT grey NOT moody"
)

LIP = (
    "speaking naturally with realistic lip sync, mouth moves while talking, expressive face, "
    "natural head and shoulder movement, bright warm lighting"
)

SCENES = [
    {
        "id": "01_office",
        "frame": "01_office.jpg",
        "prompt_img": f"{STYLE}, wide 16:9 shot, 8 diverse people at long conference table with laptops, busy startup meeting, orange wall accents, plants, bright and happy",
        "prompt_vid": "Slow dolly in, eight coworkers typing on laptops, subtle natural movement, bright warm orange office, pleasant atmosphere",
    },
    {
        "id": "02_packing",
        "frame": "02_packing.jpg",
        "prompt_img": f"{STYLE}, 16:9 medium shot, beautiful Israeli woman 28 white shirt packing bag at conference table, warm smile, bright office, coworkers behind",
        "style_ref": "01_hero_woman.jpg",
        "prompt_vid": "Beautiful woman puts laptop in bag, natural arm movement, stands slightly, bright warm office, pleasant confident mood",
    },
    {
        "id": "03_tom",
        "frame": "03_tom.jpg",
        "prompt_img": f"{STYLE}, 16:9 medium shot, man 30 surprised at conference table, blue shirt, pointing at watch, bright orange office background",
        "style_ref": "02_guy_asks.jpg",
        "prompt_vid": f"Man leans forward surprised, {LIP}, gestures to watch asking why she leaves at 4:30, bright warm office",
    },
    {
        "id": "04_maya",
        "frame": "04_maya.jpg",
        "prompt_img": f"{STYLE}, 16:9 medium close, stunning beautiful Israeli woman 28 smiling confidently, white shirt, holding bag, bright golden light, gorgeous but real",
        "style_ref": "01_hero_woman.jpg",
        "prompt_vid": f"Beautiful woman smiles and speaks confidently, {LIP}, warm bright orange office bokeh",
    },
    {
        "id": "05_alex",
        "frame": "05_alex.jpg",
        "prompt_img": f"{STYLE}, 16:9 medium shot, skeptical man with glasses arms crossed at meeting table, bright startup office",
        "style_ref": "03_skeptic.jpg",
        "prompt_vid": f"Man with glasses speaks skeptically, {LIP}, raised eyebrow, team listening, bright warm office",
    },
    {
        "id": "06_phone",
        "frame": "06_phone.jpg",
        "prompt_img": f"{STYLE}, 16:9 medium shot, beautiful woman holds smartphone showing orange orvo24.com website, confident smile, bright office",
        "style_ref": "01_hero_woman.jpg",
        "prompt_vid": "Woman lifts phone toward camera showing website screen, natural hand motion, bright warm smile, pleasant product demo",
    },
    {
        "id": "07_nods",
        "frame": "07_nods.jpg",
        "prompt_img": f"{STYLE}, 16:9 wide shot, diverse team at conference table nodding in agreement, smiling, laptops, bright orange startup office, collaborative happy mood",
        "prompt_vid": "Team at table nods approvingly, subtle head movements, warm smiles, bright pleasant startup office atmosphere",
    },
]

SUBS = [
    (0, 5, ""), (5, 10, "היא אורזת לצאת..."), (10, 15, "אבל 4:30, למה את הולכת?"),
    (15, 20, "הסוכן שלי מסיים לי את העבודה"), (20, 25, "אבל את לא יודעת לבנות סוכן"),
    (25, 30, "פשוט נכנסתי ל-orvo24.com"), (30, 35, ""),
]


def api(method, url, data=None):
    body = json.dumps(data).encode() if data else None
    for attempt in range(8):
        req = urllib.request.Request(url, data=body, method=method,
            headers={"Authorization": f"Bearer {API}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and attempt < 7:
                time.sleep(15 * (attempt + 1))
                continue
            raise


def poll(url, label):
    while True:
        p = api("GET", url)
        s = p["status"]
        print(f"  [{label}] {s}", flush=True)
        if s == "succeeded":
            o = p["output"]
            return o if isinstance(o, str) else o[0]
        if s in ("failed", "canceled"):
            raise RuntimeError(f"{label}: {p.get('error')}")
        time.sleep(12)


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "orvo24-v3"})
    with urllib.request.urlopen(req, timeout=300) as r:
        path.write_bytes(r.read())


def local_uri(path):
    data = path.read_bytes()
    return f"data:image/jpeg;base64,{base64.b64encode(data).decode()}"


def frame_start_url(scene):
    path = OUT / scene["frame"]
    url_path = OUT / f"{scene['frame']}.url"
    if url_path.exists():
        return url_path.read_text().strip()
    if path.exists():
        # Prefer HTTPS URL for Kling; branch raw URL works right after git push.
        branch = os.environ.get("ORVO_GIT_BRANCH", "main")
        repo = os.environ.get("ORVO_GIT_REPO", "danielmenparan-lang/orvo")
        cdn = f"https://raw.githubusercontent.com/{repo}/{branch}/assets/orvo24/v3/{scene['frame']}"
        url_path.write_text(cdn)
        return cdn
    return None


def gen_frame(scene):
    path = OUT / scene["frame"]
    url_path = OUT / f"{scene['frame']}.url"
    existing = frame_start_url(scene)
    if existing and path.exists():
        print(f"  reuse {path.name}", flush=True)
        return existing
    inp = {"prompt": scene["prompt_img"], "aspect_ratio": "16:9", "style_type": "Realistic"}
    if scene.get("style_ref"):
        inp["style_type"] = "General"
        inp["style_reference_images"] = [f"{CDN}/{scene['style_ref']}"]
    pred = api("POST", f"https://api.replicate.com/v1/models/{IDEOGRAM}/predictions", {"input": inp})
    poll_url = pred.get("urls", {}).get("get")
    if not poll_url:
        raise RuntimeError(f"no poll url for frame: {pred}")
    img_url = poll(poll_url, scene["frame"])
    download(img_url, path)
    url_path.write_text(img_url)
    print(f"  saved {path.name}", flush=True)
    time.sleep(14)
    return img_url


def gen_video(scene, start_url):
    path = OUT / f"{scene['id']}.mp4"
    if path.exists():
        print(f"  skip {path.name}", flush=True)
        return path
    pred = api("POST", f"https://api.replicate.com/v1/models/{KLING}/predictions", {
        "input": {
            "mode": "pro",
            "prompt": scene["prompt_vid"],
            "duration": 5,
            "start_image": start_url,
            "negative_prompt": "dark, blue, grey, moody, blurry, distorted, stretched, cartoon, ugly",
        },
    })
    poll_url = pred.get("urls", {}).get("get")
    if not poll_url or not str(poll_url).startswith("http"):
        raise RuntimeError(f"bad kling prediction: {pred}")
    vid_url = poll(poll_url, scene["id"])
    download(vid_url, path)
    print(f"  saved {path.name} ({path.stat().st_size//1024}KB)", flush=True)
    time.sleep(14)
    return path


# Bright warm grade + crop fill 16:9 (no black bars)
GRADE = (
    "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,"
    "eq=brightness=0.08:saturation=1.35:contrast=1.04:gamma=1.05,"
    "colorbalance=rs=0.08:gs=0.03:bs=-0.12,"
    "curves=r='0/0 0.5/0.58 1/1':g='0/0 0.5/0.55 1/1':b='0/0 0.5/0.45 1/1'"
)


def export_final(videos):
    scaled = []
    for i, v in enumerate(videos):
        dst = OUT / f"s{i:02d}.mp4"
        subprocess.run(["ffmpeg", "-y", "-i", str(v), "-vf", GRADE,
            "-c:v", "libx264", "-crf", "13", "-preset", "slow", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", str(dst)], check=True, capture_output=True)
        scaled.append(dst)

    concat = OUT / "c.txt"
    concat.write_text("\n".join(f"file '{p}'" for p in scaled))
    hq = OUT / "orvo24-v3-hq.mp4"
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
        "-c", "copy", str(hq)], check=True, capture_output=True)

    srt = OUT / "subs.srt"
    lines = []
    for n, (a, b, t) in enumerate((x for x in SUBS if x[2]), 1):
        def ts(s):
            h, m = divmod(int(s), 3600); m, s = divmod(m, 60)
            return f"{h:02d}:{m:02d}:{s:02d},000"
        lines += [str(n), f"{ts(a)} --> {ts(b)}", t, ""]
    srt.write_text("\n".join(lines))

    final = OUT / "orvo24-v3.mp4"
    subprocess.run(["ffmpeg", "-y", "-i", str(hq),
        "-vf", f"subtitles={srt}:force_style='FontName=Arial,FontSize=22,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=35'",
        "-c:v", "libx264", "-crf", "13", "-preset", "slow", "-movflags", "+faststart", str(final)],
        check=True, capture_output=True)

    for p in scaled: p.unlink()
    concat.unlink()
    return final, hq


def main():
    vids = []
    for sc in SCENES:
        print(f"\n=== {sc['id']} ===", flush=True)
        uri = gen_frame(sc)
        vids.append(gen_video(sc, uri))
    print("\n=== export ===", flush=True)
    final, hq = export_final(vids)
    print(f"DONE: {final}", flush=True)


if __name__ == "__main__":
    main()
