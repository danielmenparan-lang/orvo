#!/usr/bin/env python3
"""
ORVO24 FINAL production — Kling v2.1 + Ideogram + v2 characters.
Max realism: face/body motion, lip sync on dialogue scenes.
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
CHAR_DIR = Path("/workspace/assets/characters/v2")
OUT = Path("/workspace/assets/orvo24/final")
OUT.mkdir(parents=True, exist_ok=True)

IDEOGRAM = "ideogram-ai/ideogram-v3-quality"
KLING = "kwaivgi/kling-v2.1"

STYLE = (
    "Documentary photorealism, warm orange startup office lighting, modern glass conference room, "
    "natural skin texture, cinematic 24fps film look, NOT cartoon NOT CGI NOT illustration"
)

LIPSYNC = (
    "speaking dialogue with natural lip sync, mouth opens and closes realistically while talking, "
    "subtle facial micro-expressions, eyes alive, natural head movement, upper body motion, 24fps"
)

SCENES = [
    {
        "id": "01_office",
        "frame": "01_office_wide.jpg",
        "gen_frame": True,
        "image_prompt": (
            f"{STYLE}, wide shot startup conference room, 8 diverse professionals at long table "
            "with open laptops working, orange accent lights, glass walls, candid office moment"
        ),
        "video_prompt": (
            "Slow cinematic dolly in, eight people typing and shifting at conference table, "
            "natural head turns, laptops open, warm orange office light, realistic human motion"
        ),
        "start_from_char": None,
        "kling_mode": "standard",
    },
    {
        "id": "02_packing",
        "frame": "02_maya_packing.jpg",
        "gen_frame": True,
        "image_prompt": (
            f"{STYLE}, beautiful Israeli woman 28 packing leather bag at conference table, "
            "white shirt, confident warm smile, coworkers blurred behind, natural beauty photorealistic"
        ),
        "style_ref": "01_hero_woman.jpg",
        "video_prompt": (
            "Beautiful woman picks up laptop and notebook into bag, natural hand and arm movement, "
            "stands up slightly, confident body language, coworkers in background, realistic motion"
        ),
        "kling_mode": "standard",
    },
    {
        "id": "03_tom_asks",
        "frame": "03_tom_frame.jpg",
        "gen_frame": False,
        "copy_char": "02_guy_asks.jpg",
        "video_prompt": (
            f"Man at desk leans forward surprised, {LIPSYNC}, gestures toward wristwatch, "
            "asking why colleague is leaving early, expressive face, office background"
        ),
        "kling_mode": "pro",
    },
    {
        "id": "04_maya_reply",
        "frame": "04_maya_beautiful.jpg",
        "gen_frame": True,
        "image_prompt": (
            f"{STYLE}, close-up portrait beautiful Israeli woman 28, warm confident smile, "
            "natural makeup, freckles, white shirt, holding bag strap, stunning but photorealistic"
        ),
        "style_ref": "01_hero_woman.jpg",
        "video_prompt": (
            f"Beautiful woman turns toward camera smiling, {LIPSYNC}, proud confident expression, "
            "subtle shoulder movement, warm orange bokeh office background"
        ),
        "kling_mode": "pro",
    },
    {
        "id": "05_alex_skeptic",
        "frame": "05_alex_frame.jpg",
        "gen_frame": False,
        "copy_char": "03_skeptic.jpg",
        "video_prompt": (
            f"Man with glasses arms crossed, {LIPSYNC}, skeptical raised eyebrow, "
            "slight hand gesture, coworkers listening, natural group reaction"
        ),
        "kling_mode": "pro",
    },
    {
        "id": "06_maya_phone",
        "frame": "06_maya_phone.jpg",
        "gen_frame": True,
        "image_prompt": (
            f"{STYLE}, beautiful woman holds smartphone toward camera, screen shows orange website "
            "orvo24.com AI marketplace, confident smile, office background, product demo pose"
        ),
        "style_ref": "01_hero_woman.jpg",
        "video_prompt": (
            "Woman lifts smartphone toward camera showing website, natural arm and hand motion, "
            "confident smile, slight head nod, product demo moment, realistic body movement"
        ),
        "kling_mode": "pro",
    },
]

SUBTITLES = [
    (0, 5, ""),
    (5, 10, "היא אורזת לצאת..."),
    (10, 15, "אבל 4:30, למה את הולכת?"),
    (15, 20, "הסוכן שלי מסיים לי את העבודה"),
    (20, 25, "אבל את לא יודעת לבנות סוכן"),
    (25, 30, "פשוט נכנסתי ל-orvo24.com"),
]


def api(method, url, data=None):
    body = json.dumps(data).encode() if data is not None else None
    for attempt in range(8):
        req = urllib.request.Request(
            url, data=body, method=method,
            headers={"Authorization": f"Bearer {API}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 7:
                time.sleep(15 * (attempt + 1))
                continue
            if e.code in (502, 503, 504) and attempt < 7:
                time.sleep(12 * (attempt + 1))
                continue
            raise


def poll(url, label):
    while True:
        p = api("GET", url)
        s = p["status"]
        print(f"  [{label}] {s}", flush=True)
        if s == "succeeded":
            return p["output"]
        if s in ("failed", "canceled"):
            raise RuntimeError(f"{label}: {p.get('error')}")
        time.sleep(12)


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "orvo24-final/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        path.write_bytes(r.read())


def local_uri(path):
    data = Path(path).read_bytes()
    mime = "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def cdn_url(char_file):
    return f"{CDN}/{char_file}"


def generate_frame(scene):
    path = OUT / scene["frame"]
    if path.exists():
        print(f"  reuse frame {path.name}", flush=True)
        return local_uri(path)

    if scene.get("copy_char"):
        src = CHAR_DIR / scene["copy_char"]
        path.write_bytes(src.read_bytes())
        print(f"  copied {scene['copy_char']}", flush=True)
        return local_uri(path)

    inp = {
        "prompt": scene["image_prompt"],
        "aspect_ratio": "16:9" if scene["id"] == "01_office" else "3:4",
    }
    if scene.get("style_ref"):
        inp["style_type"] = "General"
        inp["style_reference_images"] = [cdn_url(scene["style_ref"])]
    else:
        inp["style_type"] = "Realistic"

    pred = api("POST", f"https://api.replicate.com/v1/models/{IDEOGRAM}/predictions", {"input": inp})
    url = poll(pred["urls"]["get"], scene["frame"])
    out_url = url if isinstance(url, str) else url[0]
    download(out_url, path)
    print(f"  saved frame {path}", flush=True)
    time.sleep(14)
    return local_uri(path)


def animate(scene, start_uri):
    vid = OUT / f"{scene['id']}.mp4"
    if vid.exists():
        print(f"  skip video {vid.name}", flush=True)
        return vid

    pred = api("POST", f"https://api.replicate.com/v1/models/{KLING}/predictions", {
        "input": {
            "mode": scene["kling_mode"],
            "prompt": scene["video_prompt"],
            "duration": 5,
            "start_image": start_uri,
            "negative_prompt": "cartoon, anime, CGI, plastic skin, frozen face, no lip movement, blur, distortion",
        },
    })
    url = poll(pred["urls"]["get"], scene["id"])
    download(url, vid)
    print(f"  saved video {vid} ({vid.stat().st_size // 1024}KB)", flush=True)
    time.sleep(14)
    return vid


def concat_and_subtitle(videos):
    VF = (
        "scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,"
        "unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.45"
    )
    scaled = []
    for i, v in enumerate(videos):
        dst = OUT / f"scaled_{i:02d}.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-i", str(v), "-vf", VF,
            "-c:v", "libx264", "-crf", "14", "-preset", "slow",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst),
        ], check=True, capture_output=True)
        scaled.append(dst)

    concat = OUT / "concat_scaled.txt"
    concat.write_text("\n".join(f"file '{p}'" for p in scaled))
    hq = OUT / "orvo24-final-hq.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
        "-c", "copy", str(hq),
    ], check=True, capture_output=True)

    srt = OUT / "subs.srt"
    lines = []
    n = 1
    for start, end, text in SUBTITLES:
        if not text:
            continue
        def ts(sec):
            h, m = divmod(int(sec), 3600)
            m, s = divmod(m, 60)
            return f"{h:02d}:{m:02d}:{s:02d},000"
        lines += [str(n), f"{ts(start)} --> {ts(end)}", text, ""]
        n += 1
    srt.write_text("\n".join(lines))

    final = OUT / "orvo24-final.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(hq),
        "-vf", f"subtitles={srt}:force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Alignment=2,MarginV=48'",
        "-c:v", "libx264", "-crf", "14", "-preset", "slow",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(final),
    ], check=True, capture_output=True)

    for p in scaled:
        p.unlink(missing_ok=True)
    concat.unlink(missing_ok=True)
    return final


def main():
    manifest = {"scenes": [], "models": {"frames": IDEOGRAM, "video": KLING}}
    videos = []

    for scene in SCENES:
        print(f"\n=== {scene['id']} ===", flush=True)
        frame_uri = generate_frame(scene)
        vid = animate(scene, frame_uri)
        videos.append(vid)
        manifest["scenes"].append({"id": scene["id"], "frame": scene["frame"], "video": str(vid)})

    print("\n=== concat + subtitles ===", flush=True)
    final = concat_and_subtitle(videos)
    manifest["final"] = str(final)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nDONE: {final}", flush=True)


if __name__ == "__main__":
    main()
