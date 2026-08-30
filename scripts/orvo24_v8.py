#!/usr/bin/env python3
"""
ORVO24 v8 — full 20-sec director's brief.
Exact timing · Hebrew VO · NO lip-sync · documentary prompts.
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
BRANCH = os.environ.get("ORVO_GIT_BRANCH", "cursor/orvo24-v8-full-7bf7")
OUT = Path("/workspace/assets/orvo24/v8")
OUT.mkdir(parents=True, exist_ok=True)

IDEOGRAM = "ideogram-ai/ideogram-v3-quality"
KLING = "kwaivgi/kling-v2.1"

DOC = (
    "Documentary office footage, candid unstaged moment, natural imperfect skin, "
    "subtle pores fine lines, matte skin not shiny, never look at camera, "
    "small restrained expressions, Apple Airbnb Linear commercial aesthetic, photorealistic, 16:9"
)
OFFICE = (
    "Bright natural afternoon sunlight from large windows on left side, warm golden light, "
    "light oak wood floor, off-white cream walls, large central wooden desk, "
    "glass whiteboard with notes, wood bookshelf, large floor plant corner, "
    "small desk plants, coffee mugs, water bottle, realistic startup office not futuristic"
)
NEG = (
    "looking at camera, fourth wall, exaggerated smile, open mouth, oily sweaty skin, "
    "plastic skin, uncanny valley, AI face, beauty filter, neon RGB, futuristic office, "
    "robots, blue screens, duplicate faces, distorted hands, extra fingers, cartoon, "
    "commercial posing, influencer, glossy skin, model perfect, tech explosion"
)

GRADE = (
    "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,"
    "eq=brightness=0.04:saturation=1.06:contrast=1.0:gamma=1.05,"
    "colorbalance=rs=0.03:gs=0.01:bs=-0.02"
)

# id, duration_sec, frame prompt, video prompt, [(voice, text, delay_in_scene)] or None
SCENES = [
    {
        "id": "s01_establish",
        "dur": 2.0,
        "prompt_img": (
            f"Wide eye-level cinematic shot, {OFFICE}, six diverse real employees at large wooden table "
            "with six laptops open notebooks, woman 27 dark wavy hair cream tee beige pants, "
            "man 28 stubble dark blue shirt, woman black hair bun round glasses light green shirt, "
            "man 30 dark blond grey polo, woman 30 short hair beige sweater coffee cup, "
            "man 25 curly hair white shirt headphones neck, everyone working quietly looking at screens, "
            f"NOT looking at camera, {DOC}"
        ),
        "prompt_vid": (
            "Very slow subtle dolly into bright office, gentle typing, someone laughs quietly off-screen, "
            "minimal natural movement, documentary afternoon startup, warm window light from left"
        ),
        "audio": None,
    },
    {
        "id": "s02_hero",
        "dur": 3.0,
        "prompt_img": (
            f"Medium shot same office, woman 27-30 dark brown wavy hair freckles minimal makeup "
            "cream white t-shirt beige wide pants small watch, at laptop showing small professional "
            "slide deck with subtle orange accent colors not fullscreen, reading screen pauses "
            "small natural smile glances at wristwatch, hand on laptop lid about to close, "
            f"candid not posing, {OFFICE}, {DOC}"
        ),
        "prompt_vid": (
            "Woman reads laptop, tiny smile, glances at watch, slowly closes laptop lid, "
            "exhales softly, reaches for bag, subtle documentary camera drift"
        ),
        "audio": None,
    },
    {
        "id": "s03_pack",
        "dur": 3.0,
        "prompt_img": (
            "Close-up woman dark wavy hair cream tee packing charger notebook pen into simple canvas bag, "
            "slings bag on shoulder, soft focus man 28 stubble dark blue shirt in background "
            "notices raises eyebrows slightly, natural skin texture, "
            f"{OFFICE}, {DOC}"
        ),
        "prompt_vid": (
            "Close-up hands pack items in bag, woman lifts bag onto shoulder, "
            "background man subtly raises eyebrows, natural documentary motion"
        ),
        "audio": [("he-IL-AvriNeural", "עדיין לא חמש. איך את הולכת?", 0.4)],
    },
    {
        "id": "s04_her",
        "dur": 3.0,
        "prompt_img": (
            f"Over-shoulder medium two-shot woman dark wavy hair cream tee talking to man 28 stubble "
            "dark blue shirt seated at wooden desk, she looks at him not camera calm small smile, "
            f"relaxed casual body language, {OFFICE} warm light from left, {DOC}"
        ),
        "prompt_vid": (
            "Woman speaks casually to colleague, small natural smile, slight head tilt, "
            "man listens, neither looks at camera, documentary office moment"
        ),
        "audio": [("he-IL-HilaNeural", "הסוכן שלי מסיים לי את העבודה.", 0.35)],
    },
    {
        "id": "s05_skeptic",
        "dur": 3.0,
        "prompt_img": (
            f"Medium shot man 28 brown hair short stubble dark blue shirt turns in office chair "
            "mildly surprised slight eyebrow raise restrained small smile looking at woman with bag, "
            "she holds his gaze calm tiny smile, {OFFICE}, {DOC}"
        ),
        "prompt_vid": (
            "Man turns in chair, eyebrows lift slightly, small smile, woman responds with tiny smile, "
            "subtle documentary reactions not exaggerated"
        ),
        "audio": [
            ("he-IL-AvriNeural", "אבל את לא יודעת לבנות סוכן.", 0.3),
            ("he-IL-HilaNeural", "לא.", 2.0),
        ],
    },
    {
        "id": "s06_walk",
        "dur": 3.0,
        "prompt_img": (
            f"Medium wide woman with canvas bag walks toward office door glancing back over shoulder, "
            "man at desk watches her then looks down at laptop then back up with tiny intrigued smile, "
            f"subtle wait-what micro-expression, {OFFICE} afternoon light, {DOC}"
        ),
        "prompt_vid": (
            "Woman walks toward door turning head back while walking, man watches then glances at screen "
            "then back at her with subtle curious half-smile, documentary natural motion"
        ),
        "audio": [("he-IL-HilaNeural", "מצאתי אחד ב־Orvo24.", 0.35)],
    },
]

SUBS = [
    (0, 2, ""),
    (2, 5, ""),
    (5, 8, "עדיין לא חמש. איך את הולכת?"),
    (8, 11, "הסוכן שלי מסיים לי את העבודה."),
    (11, 13.5, "אבל את לא יודעת לבנות סוכן."),
    (13.5, 14.5, "לא."),
    (14.5, 17, "מצאתי אחד ב־Orvo24."),
    (17, 20, ""),
]


def api(method, url, data=None):
    body = json.dumps(data).encode() if data else None
    for attempt in range(12):
        req = urllib.request.Request(url, data=body, method=method,
            headers={"Authorization": f"Bearer {API}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and attempt < 11:
                time.sleep(15 * (attempt + 1))
                continue
            if e.code == 402:
                raise RuntimeError("Replicate credits exhausted (402)")
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
    req = urllib.request.Request(url, headers={"User-Agent": "orvo24-v8"})
    with urllib.request.urlopen(req, timeout=300) as r:
        path.write_bytes(r.read())


def raw_url(rel: str) -> str:
    return f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/{rel}"


def jsdelivr(rel: str) -> str:
    return f"https://cdn.jsdelivr.net/gh/{REPO}@{BRANCH}/{rel}"


def git_publish(paths: list[Path], msg: str):
    root = Path("/workspace")
    rels = [str(p.relative_to(root)) for p in paths if p.exists()]
    if not rels:
        return
    subprocess.run(["git", "add", *rels], cwd=root, check=True, capture_output=True)
    st = subprocess.run(["git", "status", "--porcelain"], cwd=root, capture_output=True, text=True)
    if not st.stdout.strip():
        return
    subprocess.run(["git", "commit", "-m", msg], cwd=root, capture_output=True)
    for i in range(4):
        if subprocess.run(["git", "push", "-u", "origin", BRANCH], cwd=root, capture_output=True).returncode == 0:
            break
        time.sleep(4 * (i + 1))
    time.sleep(5)


def dur(path):
    return float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nokey=1", str(path),
    ]).decode())


def gen_frame(sc):
    jpg = OUT / f"{sc['id']}.jpg"
    urlf = OUT / f"{sc['id']}.jpg.url"
    if jpg.exists() and urlf.exists():
        print(f"  reuse {jpg.name}", flush=True)
        return urlf.read_text().strip()
    pred = api("POST", f"https://api.replicate.com/v1/models/{IDEOGRAM}/predictions", {
        "input": {"prompt": sc["prompt_img"], "aspect_ratio": "16:9", "style_type": "Realistic"},
    })
    img_url = poll(pred["urls"]["get"], sc["id"] + ".jpg")
    download(img_url, jpg)
    git_publish([jpg], f"v8 frame {sc['id']}")
    urlf.write_text(img_url)
    print(f"  saved {jpg.name}", flush=True)
    time.sleep(12)
    return img_url


def gen_video(sc, start_url):
    raw = OUT / f"{sc['id']}_raw.mp4"
    urlf = OUT / f"{sc['id']}_raw.url"
    if raw.exists() and urlf.exists():
        print(f"  reuse {raw.name}", flush=True)
        return raw
    pred = api("POST", f"https://api.replicate.com/v1/models/{KLING}/predictions", {
        "input": {
            "mode": "pro", "prompt": sc["prompt_vid"], "duration": 5,
            "start_image": start_url, "negative_prompt": NEG,
        },
    })
    vid_url = poll(pred["urls"]["get"], sc["id"])
    download(vid_url, raw)
    git_publish([raw], f"v8 video {sc['id']}")
    urlf.write_text(jsdelivr(f"assets/orvo24/v8/{sc['id']}_raw.mp4"))
    print(f"  saved {raw.name}", flush=True)
    time.sleep(12)
    return raw


async def tts(voice, text, path):
    await edge_tts.Communicate(text, voice, rate="-10%", pitch="-1Hz").save(str(path))


def trim_grade(src, dst, length, start=0.3):
    subprocess.run([
        "ffmpeg", "-y", "-ss", str(start), "-i", str(src), "-t", str(length),
        "-vf", GRADE + f",fade=t=in:st=0:d=0.2,fade=t=out:st={max(0.1, length - 0.2)}:d=0.2",
        "-an", "-c:v", "libx264", "-crf", "13", "-preset", "slow", "-pix_fmt", "yuv420p",
        str(dst),
    ], check=True, capture_output=True)


async def add_audio(vid, lines, out):
    """lines: list of (voice, text, delay_sec)"""
    d = dur(vid)
    audio_dir = OUT / "audio"
    audio_dir.mkdir(exist_ok=True)
    inputs = ["-i", str(vid)]
    filters = []
    for i, (voice, text, delay) in enumerate(lines):
        mp3 = audio_dir / f"{out.stem}_{i}.mp3"
        await tts(voice, text, mp3)
        inputs += ["-i", str(mp3)]
        ms = int(delay * 1000)
        filters.append(f"[{i+1}:a]adelay={ms}|{ms},apad=whole_dur={d}[a{i}]")
    if filters:
        mix_in = "".join(f"[a{i}]" for i in range(len(lines)))
        fc = ";".join(filters) + f";{mix_in}amix=inputs={len(lines)}:duration=first:dropout_transition=0[aout]"
        subprocess.run([
            "ffmpeg", "-y", *inputs, "-filter_complex", fc,
            "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-t", str(d), str(out),
        ], check=True, capture_output=True)
    else:
        subprocess.run([
            "ffmpeg", "-y", "-i", str(vid), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
            "-t", str(d), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
            "-b:a", "96k", "-shortest", str(out),
        ], check=True, capture_output=True)


async def main():
    built = []
    t0 = 0.0
    for sc in SCENES:
        print(f"\n=== {sc['id']} ({sc['dur']}s) ===", flush=True)
        img_url = gen_frame(sc)
        raw = gen_video(sc, img_url)
        trimmed = OUT / "scenes" / f"{sc['id']}_v.mp4"
        trimmed.parent.mkdir(exist_ok=True)
        trim_grade(raw, trimmed, sc["dur"])
        final = OUT / "scenes" / f"{sc['id']}.mp4"
        if sc.get("audio"):
            await add_audio(trimmed, sc["audio"], final)
        else:
            subprocess.run([
                "ffmpeg", "-y", "-i", str(trimmed), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
                "-t", str(sc["dur"]), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
                "-b:a", "96k", "-shortest", str(final),
            ], check=True, capture_output=True)
        built.append(final)
        t0 += sc["dur"]
        print(f"  ok t={t0}", flush=True)

    # End card 3s
    end = OUT / "endcard.mp4"
    if not end.exists():
        subprocess.run(["python3", "/workspace/scripts/orvo24_endcard.py"], check=True)
    end_trim = OUT / "scenes" / "s07_endcard.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(end), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
        "-t", "3.0", "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-crf", "13",
        "-c:a", "aac", "-b:a", "96k", "-shortest", str(end_trim),
    ], check=True, capture_output=True)
    built.append(end_trim)

    concat = OUT / "concat.txt"
    concat.write_text("\n".join(f"file '{p.resolve()}'" for p in built))
    hq = OUT / "orvo24-v8-hq.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
        "-c:v", "libx264", "-crf", "13", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(hq),
    ], check=True, capture_output=True)

    srt = OUT / "subs.srt"
    lines = []
    for n, (a, b, t) in enumerate((x for x in SUBS if x[2]), 1):
        def ts(s):
            h, m = divmod(int(s), 3600)
            m, s = divmod(m, 60)
            return f"{h:02d}:{m:02d}:{s:02d},000"
        lines += [str(n), f"{ts(a)} --> {ts(b)}", t, ""]
    srt.write_text("\n".join(lines))

    final = OUT / "orvo24-v8.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(hq),
        "-vf", f"subtitles={srt}:force_style='FontName=Arial,FontSize=24,"
               "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=40'",
        "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", str(final),
    ], check=True, capture_output=True)

    web = OUT / "orvo24-v8-web.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(final), "-c:v", "libx264", "-crf", "20", "-preset", "slow",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(web),
    ], check=True, capture_output=True)

    git_publish([web, final, srt], "v8 final 20-sec brief video")
    print(f"\nDONE {web} ({dur(web):.1f}s)", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
