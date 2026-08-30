#!/usr/bin/env python3
"""
ORVO24 v6 — bright, happy, Instagram-pleasant, English lip-sync.
Optimized for: smiling, fresh, high-key — NOT sweaty/sad/oily/unflattering.
"""
import asyncio
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import edge_tts

API = os.environ["Daniel"]
REPO = os.environ.get("ORVO_GIT_REPO", "danielmenparan-lang/orvo")
BRANCH = os.environ.get("ORVO_GIT_BRANCH", "main")
CDN_CHAR = f"https://cdn.jsdelivr.net/gh/{REPO}@main/assets/characters/v2"
OUT = Path("/workspace/assets/orvo24/v6")
OUT.mkdir(parents=True, exist_ok=True)

IDEOGRAM = "ideogram-ai/ideogram-v3-quality"
KLING = "kwaivgi/kling-v2.1"
LIPSYNC = "kwaivgi/kling-lip-sync"

# Light playful tone — same sunny office throughout
LOOK = (
    "Bright uplifting startup commercial, happy smiling professionals, light playful energy, "
    "same modern sunny startup office throughout, soft flattering golden window light, "
    "high-key clean lighting, attractive well-groomed people, fun friendly vibe, 16:9"
)

OFFICE = (
    "Sunny bright startup office, white walls, warm natural daylight, orange plant accents only, "
    "clean airy spacious, cheerful collaborative atmosphere"
)

NEG = (
    "sweaty, oily skin, greasy shiny face, tired, sad, depressed, unhappy, miserable, angry, stressed, "
    "dark circles, unflattering, overweight, bloated, harsh shadows, moody, dark, dim, blue grey, "
    "green tint, teal, plastic doll, AI face, uncanny valley, ugly, messy, acne, wrinkled tired, "
    "blurry, distorted, cartoon, horror, creepy"
)

LIP = (
    "speaking with warm friendly expression, natural lip sync, gentle smile while talking, "
    "relaxed confident body language, bright soft lighting on face"
)

SCENES = [
    {
        "id": "01_office",
        "frame": "01_office.jpg",
        "prompt_img": f"{LOOK}, {OFFICE}, wide shot eight happy diverse coworkers smiling at conference table laptops, upbeat team energy",
        "prompt_vid": "Slow dolly in, happy coworkers typing and smiling subtly, bright sunny office, pleasant upbeat mood",
    },
    {
        "id": "02_packing",
        "frame": "02_packing.jpg",
        "style_ref": "01_hero_woman.jpg",
        "prompt_img": f"{LOOK}, {OFFICE}, beautiful woman 28 white shirt packing bag with bright confident smile, fresh glowing skin",
        "prompt_vid": "Attractive woman packs laptop cheerfully, warm smile, stands with light energy, bright sunny office",
    },
    {
        "id": "03_tom",
        "frame": "03_tom.jpg",
        "style_ref": "02_guy_asks.jpg",
        "dialogue": ("en-US-AndrewMultilingualNeural", "Wait, four thirty? Where are you going?"),
        "prompt_img": f"{LOOK}, {OFFICE}, handsome man 31 friendly surprised smile blue shirt, fresh clean look gesturing at watch",
        "prompt_vid": f"Handsome man speaks with playful surprised grin, {LIP}, light humor, bright office, points at watch",
    },
    {
        "id": "04_maya",
        "frame": "04_maya.jpg",
        "style_ref": "01_hero_woman.jpg",
        "dialogue": ("en-US-AvaMultilingualNeural", "My agent finishes everything for me!"),
        "prompt_img": f"{LOOK}, {OFFICE}, stunning woman 28 radiant confident smile white shirt, fresh beautiful glowing skin holding bag",
        "prompt_vid": f"Beautiful woman speaks with bright amused confident smile, {LIP}, golden soft light, pleasant bokeh",
    },
    {
        "id": "05_alex",
        "frame": "05_alex.jpg",
        "style_ref": "03_skeptic.jpg",
        "dialogue": ("en-US-BrianMultilingualNeural", "You? Build an agent? Seriously?"),
        "prompt_img": f"{LOOK}, {OFFICE}, attractive man 33 glasses friendly skeptical smirk, clean fresh look, smart casual",
        "prompt_vid": f"Attractive man speaks with playful skeptical smirk, {LIP}, light comedic tone, bright cheerful office",
    },
    {
        "id": "06_phone",
        "frame": "06_phone.jpg",
        "style_ref": "01_hero_woman.jpg",
        "dialogue": ("en-US-AvaMultilingualNeural", "I just went to orvo24.com. That's it."),
        "prompt_img": f"{LOOK}, {OFFICE}, beautiful woman holds phone showing orange orvo24.com, bright happy proud smile",
        "prompt_vid": "Woman shows phone with proud playful smile, speaks cheerfully, natural hand motion, bright light",
    },
    {
        "id": "07_nods",
        "frame": "07_nods.jpg",
        "prompt_img": f"{LOOK}, {OFFICE}, wide shot happy diverse team nodding and smiling at table, joyful approval, bright sunny office",
        "prompt_vid": "Team nods with warm happy smiles, upbeat collaborative energy, bright pleasant office",
    },
]

SUBS = [
    (0, 5, ""), (5, 10, "She packs up to leave early..."),
    (10, 15, "Wait, four thirty? Where are you going?"),
    (15, 20, "My agent finishes everything for me!"),
    (20, 25, "You? Build an agent? Seriously?"),
    (25, 30, "I just went to orvo24.com. That's it."),
    (30, 35, ""),
]

# High-key happy grade — bright, clean skin tones, no green
GRADE = (
    "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,"
    "eq=brightness=0.06:saturation=1.12:contrast=0.98:gamma=1.03,"
    "colorbalance=rs=0.04:gs=-0.02:bs=-0.02,"
    "curves=r='0/0 0.5/0.54 1/1':g='0/0 0.5/0.52 1/1':b='0/0 0.5/0.50 1/1'"
)


def api(method, url, data=None):
    body = json.dumps(data).encode() if data else None
    for attempt in range(10):
        req = urllib.request.Request(url, data=body, method=method,
            headers={"Authorization": f"Bearer {API}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and attempt < 9:
                wait = 15 * (attempt + 1)
                if e.code == 429:
                    try:
                        wait = max(wait, int(json.loads(e.read()).get("retry_after", 15)))
                    except Exception:
                        pass
                time.sleep(wait)
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
    req = urllib.request.Request(url, headers={"User-Agent": "orvo24-v6"})
    with urllib.request.urlopen(req, timeout=300) as r:
        path.write_bytes(r.read())


def raw_url(rel: str) -> str:
    return f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/{rel}"


def git_publish(paths: list[Path], msg: str):
    root = Path("/workspace")
    rels = [str(p.relative_to(root)) for p in paths if p.exists()]
    if not rels:
        return
    subprocess.run(["git", "add", *rels], cwd=root, check=True, capture_output=True)
    st = subprocess.run(["git", "status", "--porcelain"], cwd=root, capture_output=True, text=True)
    if not st.stdout.strip():
        return
    r = subprocess.run(["git", "commit", "-m", msg], cwd=root, capture_output=True)
    if r.returncode != 0:
        return
    for i in range(4):
        if subprocess.run(["git", "push", "origin", BRANCH], cwd=root, capture_output=True).returncode == 0:
            break
        time.sleep(4 * (i + 1))
    time.sleep(4)


def clip_duration(path: Path) -> float:
    return float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nokey=1", str(path),
    ]).decode().strip())


def soften_clip(src: Path, dst: Path, fade: float = 0.35):
    """Fade in/out so hard cuts feel smoother."""
    d = clip_duration(src)
    out_f = max(0.1, d - fade)
    subprocess.run([
        "ffmpeg", "-y", "-i", str(src),
        "-vf", f"fade=t=in:st=0:d={fade},fade=t=out:st={out_f}:d={fade}",
        "-af", f"afade=t=in:st=0:d={fade},afade=t=out:st={out_f}:d={fade}",
        "-c:v", "libx264", "-crf", "12", "-preset", "fast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(dst),
    ], check=True, capture_output=True)


def gen_frame(scene):
    path = OUT / scene["frame"]
    url_path = OUT / f"{scene['frame']}.url"
    if path.exists() and url_path.exists():
        print(f"  reuse {path.name}", flush=True)
        return url_path.read_text().strip()
    inp = {"prompt": scene["prompt_img"], "aspect_ratio": "16:9", "style_type": "Realistic"}
    if scene.get("style_ref"):
        inp["style_type"] = "General"
        inp["style_reference_images"] = [f"{CDN_CHAR}/{scene['style_ref']}"]
    pred = api("POST", f"https://api.replicate.com/v1/models/{IDEOGRAM}/predictions", {"input": inp})
    img_url = poll(pred["urls"]["get"], scene["frame"])
    download(img_url, path)
    git_publish([path], f"v6 frame {scene['id']}")
    u = raw_url(f"assets/orvo24/v6/{scene['frame']}")
    url_path.write_text(u)
    print(f"  saved {path.name}", flush=True)
    time.sleep(14)
    return u


def gen_video(scene, start_url):
    path = OUT / f"{scene['id']}_base.mp4"
    url_path = OUT / f"{scene['id']}_base.url"
    if path.exists() and url_path.exists():
        print(f"  reuse base {path.name}", flush=True)
        return path, url_path.read_text().strip()
    pred = api("POST", f"https://api.replicate.com/v1/models/{KLING}/predictions", {
        "input": {
            "mode": "pro", "prompt": scene["prompt_vid"], "duration": 5,
            "start_image": start_url, "negative_prompt": NEG,
        },
    })
    vid_url = poll(pred["urls"]["get"], scene["id"])
    download(vid_url, path)
    git_publish([path], f"v6 base {scene['id']}")
    u = raw_url(f"assets/orvo24/v6/{scene['id']}_base.mp4")
    url_path.write_text(u)
    print(f"  saved base {path.name}", flush=True)
    time.sleep(14)
    return path, u


async def gen_tts(voice, text, path: Path):
    await edge_tts.Communicate(text, voice, rate="+2%", pitch="+2Hz").save(str(path))


def lip_sync(video_url, audio_url, label):
    path = OUT / f"{label}.mp4"
    if path.exists():
        print(f"  reuse {path.name}", flush=True)
        return path
    pred = api("POST", f"https://api.replicate.com/v1/models/{LIPSYNC}/predictions", {
        "input": {"video_url": video_url, "audio_file": audio_url},
    })
    out_url = poll(poll_url := pred["urls"]["get"], f"lip-{label}")
    download(out_url, path)
    print(f"  lip-sync {path.name}", flush=True)
    time.sleep(14)
    return path


def ensure_silent(video: Path, out: Path):
    dur = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nokey=1", str(video),
    ]).decode().strip()
    subprocess.run([
        "ffmpeg", "-y", "-i", str(video), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
        "-t", dur, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "96k",
        "-shortest", str(out),
    ], check=True, capture_output=True)


def grade_clip(src: Path, dst: Path):
    subprocess.run([
        "ffmpeg", "-y", "-i", str(src), "-vf", GRADE,
        "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(dst),
    ], check=True, capture_output=True)


def export_final(clips):
    scaled = []
    for i, c in enumerate(clips):
        g = OUT / f"g{i:02d}.mp4"
        grade_clip(c, g)
        s = OUT / f"s{i:02d}.mp4"
        soften_clip(g, s)
        scaled.append(s)
        g.unlink(missing_ok=True)
    concat = OUT / "concat.txt"
    concat.write_text("\n".join(f"file '{x.resolve()}'" for x in scaled))
    hq = OUT / "orvo24-v6-hq.mp4"
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
    final = OUT / "orvo24-v6.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(hq),
        "-vf", f"subtitles={srt}:force_style='FontName=Arial,FontSize=22,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=35'",
        "-map", "0:v:0", "-map", "0:a:0", "-c:v", "libx264", "-crf", "12", "-preset", "slow",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final),
    ], check=True, capture_output=True)
    web = OUT / "orvo24-v6-web.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(final), "-map", "0:v:0", "-map", "0:a:0",
        "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(web),
    ], check=True, capture_output=True)
    return final, web


async def prepare_audio():
    audio_dir = OUT / "audio"
    audio_dir.mkdir(exist_ok=True)
    paths = []
    for sc in SCENES:
        if not sc.get("dialogue"):
            continue
        voice, text = sc["dialogue"]
        mp3 = audio_dir / f"{sc['id']}.mp3"
        print(f"TTS {sc['id']}: {text}", flush=True)
        await gen_tts(voice, text, mp3)
        paths.append(mp3)
    if paths:
        git_publish(paths, "v6 dialogue audio")
    return {sc["id"]: raw_url(f"assets/orvo24/v6/audio/{sc['id']}.mp3")
            for sc in SCENES if sc.get("dialogue")}


async def main():
    print("=== TTS ===", flush=True)
    audio_urls = await prepare_audio()
    clips = []
    for sc in SCENES:
        print(f"\n=== {sc['id']} ===", flush=True)
        start = gen_frame(sc)
        _, base_url = gen_video(sc, start)
        if sc.get("dialogue"):
            clip = lip_sync(base_url, audio_urls[sc["id"]], sc["id"])
        else:
            clip = OUT / f"{sc['id']}_silent.mp4"
            ensure_silent(OUT / f"{sc['id']}_base.mp4", clip)
        clips.append(clip)
    print("\n=== export ===", flush=True)
    final, web = export_final(clips)
    git_publish([final, web], "v6 final video")
    print(f"DONE\n  {final}\n  {web}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
