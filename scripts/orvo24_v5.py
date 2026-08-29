#!/usr/bin/env python3
"""
ORVO24 v5 — maximum human realism, natural colors, English lip-sync.
Research: docs/orvo24-v5-research.md
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
OUT = Path("/workspace/assets/orvo24/v5")
OUT.mkdir(parents=True, exist_ok=True)

IDEOGRAM = "ideogram-ai/ideogram-v3-quality"
KLING = "kwaivgi/kling-v2.1"
LIPSYNC = "kwaivgi/kling-lip-sync"

DOC = (
    "Documentary photojournalism, real unretouched people, natural skin texture pores, "
    "candid authentic not posed, soft neutral daylight, accurate skin tones, "
    "NOT CGI NOT plastic NOT doll NOT beauty filter NOT AI face"
)

OFFICE = (
    "Bright pleasant startup office, warm natural window light, neutral white balance, "
    "light wood table white walls subtle orange plant accents, comfortable inviting, 16:9 widescreen"
)

NEG = (
    "plastic skin, doll face, AI generated, beauty filter, green tint, teal, cyan cast, "
    "oversaturated orange, dark moody, blue grey, blurry, distorted, cartoon, uncanny valley, ugly"
)

LIP = (
    "speaking naturally to camera, realistic lip and jaw movement, subtle micro-expressions, "
    "natural blink, relaxed shoulders, documentary realism"
)

SCENES = [
    {
        "id": "01_office",
        "frame": "01_office.jpg",
        "prompt_img": f"{DOC}, {OFFICE}, wide shot eight diverse real coworkers at conference table laptops, candid meeting",
        "prompt_vid": "Slow gentle dolly in, real people typing subtle natural movement, soft daylight, documentary office",
    },
    {
        "id": "02_packing",
        "frame": "02_packing.jpg",
        "style_ref": "01_hero_woman.jpg",
        "prompt_img": f"{DOC}, {OFFICE}, medium shot Israeli woman 28 white shirt packing bag warm natural smile",
        "prompt_vid": "Woman closes laptop into bag, natural hand motion, stands calmly, soft window light, candid",
    },
    {
        "id": "03_tom",
        "frame": "03_tom.jpg",
        "style_ref": "02_guy_asks.jpg",
        "dialogue": ("en-US-AndrewMultilingualNeural", "Four thirty? Why leave so early?"),
        "prompt_img": f"{DOC}, {OFFICE}, medium shot man 31 surprised leaning forward blue shirt gesturing at watch",
        "prompt_vid": f"Man speaks surprised to colleague, {LIP}, points at watch, natural daylight office",
    },
    {
        "id": "04_maya",
        "frame": "04_maya.jpg",
        "style_ref": "01_hero_woman.jpg",
        "dialogue": ("en-US-AvaMultilingualNeural", "My agent finishes all my work."),
        "prompt_img": f"{DOC}, {OFFICE}, medium close Israeli woman 28 confident gentle smile white shirt holding bag",
        "prompt_vid": f"Woman speaks calmly with confident smile, {LIP}, soft bokeh office background",
    },
    {
        "id": "05_alex",
        "frame": "05_alex.jpg",
        "style_ref": "03_skeptic.jpg",
        "dialogue": ("en-US-BrianMultilingualNeural", "You can't even build an agent."),
        "prompt_img": f"{DOC}, {OFFICE}, medium shot man 33 glasses skeptical arms crossed grey shirt",
        "prompt_vid": f"Man with glasses speaks skeptically, {LIP}, raised eyebrow, team listening",
    },
    {
        "id": "06_phone",
        "frame": "06_phone.jpg",
        "style_ref": "01_hero_woman.jpg",
        "dialogue": ("en-US-AvaMultilingualNeural", "I just use orvo24.com."),
        "prompt_img": f"{DOC}, {OFFICE}, woman holds smartphone showing orange website confident natural smile",
        "prompt_vid": "Woman lifts phone toward camera showing screen, speaks briefly, natural hand motion, soft light",
    },
    {
        "id": "07_nods",
        "frame": "07_nods.jpg",
        "prompt_img": f"{DOC}, {OFFICE}, wide shot diverse team nodding smiling at table laptops collaborative mood",
        "prompt_vid": "Team nods approvingly subtle head movement warm smiles, documentary office atmosphere",
    },
]

SUBS = [
    (0, 5, ""), (5, 10, "She packs up to leave early..."),
    (10, 15, "Four thirty? Why leave so early?"),
    (15, 20, "My agent finishes all my work."),
    (20, 25, "You can't even build an agent."),
    (25, 30, "I just use orvo24.com."),
    (30, 35, ""),
]

# Natural pleasant grade — no green/teal, no orange overload
GRADE = (
    "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,"
    "eq=brightness=0.03:saturation=1.08:contrast=1.02:gamma=1.02,"
    "colorbalance=rs=0.02:gs=0.00:bs=-0.03,"
    "curves=r='0/0 0.5/0.52 1/1':g='0/0 0.5/0.51 1/1':b='0/0 0.5/0.50 1/1'"
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
    req = urllib.request.Request(url, headers={"User-Agent": "orvo24-v5"})
    with urllib.request.urlopen(req, timeout=300) as r:
        path.write_bytes(r.read())


def raw_url(rel: str) -> str:
    return f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/{rel}"


def git_publish(paths: list[Path], msg: str):
    root = Path("/workspace")
    rels = [str(p.relative_to(root)) for p in paths]
    subprocess.run(["git", "add", *rels], cwd=root, check=True, capture_output=True)
    st = subprocess.run(["git", "status", "--porcelain"], cwd=root, capture_output=True, text=True)
    if not st.stdout.strip():
        return
    subprocess.run(["git", "commit", "-m", msg], cwd=root, check=True, capture_output=True)
    for _ in range(4):
        r = subprocess.run(["git", "push", "origin", BRANCH], cwd=root, capture_output=True)
        if r.returncode == 0:
            break
        time.sleep(4 * (_ + 1))
    else:
        raise RuntimeError("git push failed")
    time.sleep(3)


def frame_url(scene):
    rel = f"assets/orvo24/v5/{scene['frame']}"
    url_path = OUT / f"{scene['frame']}.url"
    path = OUT / scene["frame"]
    if url_path.exists():
        return url_path.read_text().strip()
    if path.exists():
        u = raw_url(rel)
        url_path.write_text(u)
        return u
    return None


def gen_frame(scene):
    path = OUT / scene["frame"]
    existing = frame_url(scene)
    if existing and path.exists():
        print(f"  reuse {path.name}", flush=True)
        return existing
    inp = {"prompt": scene["prompt_img"], "aspect_ratio": "16:9", "style_type": "Realistic"}
    if scene.get("style_ref"):
        inp["style_type"] = "General"
        inp["style_reference_images"] = [f"{CDN_CHAR}/{scene['style_ref']}"]
    pred = api("POST", f"https://api.replicate.com/v1/models/{IDEOGRAM}/predictions", {"input": inp})
    poll_url = pred["urls"]["get"]
    img_url = poll(poll_url, scene["frame"])
    download(img_url, path)
    (OUT / f"{scene['frame']}.url").write_text(img_url)
    git_publish([path], f"v5 frame {scene['id']}")
    u = raw_url(f"assets/orvo24/v5/{scene['frame']}")
    (OUT / f"{scene['frame']}.url").write_text(u)
    print(f"  saved {path.name}", flush=True)
    time.sleep(14)
    return u


def gen_video(scene, start_url):
    path = OUT / f"{scene['id']}_base.mp4"
    if path.exists():
        print(f"  reuse base {path.name}", flush=True)
        return path, raw_url(f"assets/orvo24/v5/{scene['id']}_base.mp4")
    pred = api("POST", f"https://api.replicate.com/v1/models/{KLING}/predictions", {
        "input": {
            "mode": "pro",
            "prompt": scene["prompt_vid"],
            "duration": 5,
            "start_image": start_url,
            "negative_prompt": NEG,
        },
    })
    poll_url = pred["urls"]["get"]
    vid_url = poll(poll_url, scene["id"])
    download(vid_url, path)
    git_publish([path], f"v5 base video {scene['id']}")
    print(f"  saved base {path.name}", flush=True)
    time.sleep(14)
    return path, raw_url(f"assets/orvo24/v5/{scene['id']}_base.mp4")


async def gen_tts(voice, text, path: Path):
    await edge_tts.Communicate(text, voice, rate="+0%").save(str(path))


def lip_sync(video_url, audio_url, label):
    path = OUT / f"{label}.mp4"
    if path.exists():
        print(f"  reuse {path.name}", flush=True)
        return path
    pred = api("POST", f"https://api.replicate.com/v1/models/{LIPSYNC}/predictions", {
        "input": {"video_url": video_url, "audio_file": audio_url},
    })
    poll_url = pred["urls"]["get"]
    out_url = poll(poll_url, f"lip-{label}")
    download(out_url, path)
    print(f"  lip-sync saved {path.name}", flush=True)
    time.sleep(14)
    return path


def ensure_silent_audio(video: Path, out: Path):
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
        p = OUT / f"s{i:02d}.mp4"
        grade_clip(c, p)
        scaled.append(p)
    concat = OUT / "concat.txt"
    concat.write_text("\n".join(f"file '{x.resolve()}'" for x in scaled))
    hq = OUT / "orvo24-v5-hq.mp4"
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

    final = OUT / "orvo24-v5.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(hq),
        "-vf", f"subtitles={srt}:force_style='FontName=Arial,FontSize=22,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=35'",
        "-map", "0:v:0", "-map", "0:a:0", "-c:v", "libx264", "-crf", "12", "-preset", "slow",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final),
    ], check=True, capture_output=True)

    web = OUT / "orvo24-v5-web.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(final), "-map", "0:v:0", "-map", "0:a:0",
        "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(web),
    ], check=True, capture_output=True)
    return final, web


async def prepare_dialogue_audio():
    audio_dir = OUT / "audio"
    audio_dir.mkdir(exist_ok=True)
    paths = []
    for sc in SCENES:
        if not sc.get("dialogue"):
            continue
        voice, text = sc["dialogue"]
        mp3 = audio_dir / f"{sc['id']}.mp3"
        if not mp3.exists():
            print(f"TTS {sc['id']}: {text}", flush=True)
            await gen_tts(voice, text, mp3)
        paths.append(mp3)
    if paths:
        git_publish(paths, "v5 dialogue audio for lip-sync")
    return {sc["id"]: raw_url(f"assets/orvo24/v5/audio/{sc['id']}.mp3")
            for sc in SCENES if sc.get("dialogue")}


async def main():
    print("=== Phase 1: dialogue TTS ===", flush=True)
    audio_urls = await prepare_dialogue_audio()

    final_clips = []
    for sc in SCENES:
        print(f"\n=== {sc['id']} ===", flush=True)
        start = gen_frame(sc)
        base_path, base_url = gen_video(sc, start)
        if sc.get("dialogue"):
            clip = lip_sync(base_url, audio_urls[sc["id"]], sc["id"])
        else:
            clip = OUT / f"{sc['id']}_silent.mp4"
            ensure_silent_audio(base_path, clip)
        final_clips.append(clip)

    print("\n=== export ===", flush=True)
    final, web = export_final(final_clips)
    git_publish([final, web], "v5 final exports")
    print(f"DONE\n  {final}\n  {web}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
