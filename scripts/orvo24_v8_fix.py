#!/usr/bin/env python3
"""ORVO24 v8.1 pro fix — cohesive grade, real stock B-roll, English VO, no cheap subs."""
import asyncio
import subprocess
import urllib.request
from pathlib import Path

import edge_tts

OUT = Path("/workspace/assets/orvo24/v8")
V8SC = OUT / "scenes"
STOCK = OUT / "stock_pro"
STOCK.mkdir(parents=True, exist_ok=True)
END = OUT / "endcard.mp4"

# Pexels royalty-free
PEX = {
    "wide": 5637279,
    "laptop": 8873053,
    "pack": 8873053,
    "talk": 6339836,
    "team": 7804938,
    "walk": 6774633,
}

SCENES = [
    ("s01", "wide", 1.2, 2.0, None),
    ("s02", "laptop", 0.8, 3.0, None),
    ("s03", "pack", 3.5, 3.0, ("en-US-GuyNeural", "It's not even five. How come you're leaving?", 0.5)),
    ("s04", "talk", 0.2, 3.0, ("en-US-JennyNeural", "My agent finishes my work for me.", 0.4)),
    ("s05", "team", 3.0, 3.0, [
        ("en-US-GuyNeural", "But you don't know how to build an agent.", 0.35),
        ("en-US-JennyNeural", "No.", 2.1),
    ]),
    ("s06", "walk", 1.5, 3.0, ("en-US-JennyNeural", "Found one on Orvo24.", 0.4)),
    ("s07", "endcard", 0.0, 3.0, None),
]

# Unified cinematic grade — match all sources
GRADE = (
    "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,"
    "eq=brightness=0.03:saturation=0.92:contrast=1.1:gamma=1.06,"
    "colorbalance=rs=0.02:gs=-0.01:bs=-0.04,"
    "curves=r='0/0 0.35/0.32 0.65/0.68 1/1':"
    "g='0/0 0.35/0.34 0.65/0.66 1/1':"
    "b='0/0 0.35/0.33 0.65/0.62 1/1',"
    "unsharp=3:3:0.25:3:3:0.0"
)

AI_GRADE = GRADE + ",noise=alls=6:allf=t+u"


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def dur(p):
    return float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nokey=1", str(p),
    ]).decode())


def download_pexels(vid, dest):
    if dest.exists() and dest.stat().st_size > 100_000:
        return
    for p in (
        f"{vid}-hd_1920_1080_25fps.mp4",
        f"{vid}-hd_1920_1080_30fps.mp4",
        f"{vid}-hd_1920_1080_24fps.mp4",
        f"{vid}-uhd_2560_1440_25fps.mp4",
    ):
        url = f"https://videos.pexels.com/video-files/{vid}/{p}"
        req = urllib.request.Request(url, headers={"User-Agent": "orvo24-v8-pro"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            if len(data) > 100_000 and data[4:8] == b"ftyp":
                dest.write_bytes(data)
                print(f"  stock {dest.name}", flush=True)
                return
        except Exception:
            pass
    raise RuntimeError(f"pexels {vid}")


def trim_grade(src, dst, start, length, ai=False):
    vf = AI_GRADE if ai else GRADE
    run([
        "ffmpeg", "-y", "-ss", str(start), "-i", str(src), "-t", str(length),
        "-vf", vf + f",fade=t=in:st=0:d=0.25,fade=t=out:st={max(0.05, length - 0.25)}:d=0.25",
        "-an", "-c:v", "libx264", "-crf", "11", "-preset", "slow", "-pix_fmt", "yuv420p", str(dst),
    ])


async def tts(voice, text, path):
    await edge_tts.Communicate(text, voice, rate="-12%", pitch="-2Hz").save(str(path))


async def mux_vo(vid, lines, out):
    """lines: (voice, text, delay) or list of them"""
    if not isinstance(lines, list):
        lines = [lines]
    d = dur(vid)
    ad = OUT / "audio_pro"
    ad.mkdir(exist_ok=True)
    inputs = ["-i", str(vid)]
    flt = []
    for i, (voice, text, delay) in enumerate(lines):
        mp3 = ad / f"{out.stem}_{i}.mp3"
        await tts(voice, text, mp3)
        inputs += ["-i", str(mp3)]
        ms = int(delay * 1000)
        flt.append(f"[{i+1}:a]adelay={ms}|{ms},apad=whole_dur={d},volume=0.88[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(lines)))
    fc = ";".join(flt) + f";{mix}amix=inputs={len(lines)}:duration=first[aout]"
    run([
        "ffmpeg", "-y", *inputs, "-filter_complex", fc,
        "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-t", str(d), str(out),
    ])


def silent(vid, out):
    d = dur(vid)
    run([
        "ffmpeg", "-y", "-i", str(vid), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
        "-t", str(d), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
        "-b:a", "96k", "-shortest", str(out),
    ])


def concat_clips(clips, out):
    lst = OUT / "concat_pro.txt"
    lst.write_text("\n".join(f"file '{p.resolve()}'" for p in clips))
    run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
        "-c:v", "libx264", "-crf", "11", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out),
    ])


def add_ambience(vid, out):
    d = dur(vid)
    run([
        "ffmpeg", "-y", "-i", str(vid),
        "-f", "lavfi", "-i", f"anoisesrc=color=pink:amplitude=0.012:duration={d + 0.5}",
        "-filter_complex",
        f"[0:a]apad=whole_dur={d}[va];"
        f"[1:a]atrim=0:{d},highpass=f=200,lowpass=f=3000,volume=0.3[room];"
        f"[va][room]amix=inputs=2:duration=longest:weights=1 0.35[aout]",
        "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-t", str(d), str(out),
    ])


async def main():
    pro = OUT / "pro_scenes"
    pro.mkdir(exist_ok=True)

    print("download stock...", flush=True)
    for k, pid in PEX.items():
        download_pexels(pid, STOCK / f"{k}.mp4")

    if not END.exists():
        run(["python3", "/workspace/scripts/orvo24_endcard.py"])

    src_map = {
        "wide": STOCK / "wide.mp4",
        "laptop": STOCK / "laptop.mp4",
        "pack": STOCK / "pack.mp4",
        "talk": STOCK / "talk.mp4",
        "team": STOCK / "team.mp4",
        "walk": STOCK / "walk.mp4",
        "endcard": END,
    }

    built = []
    for sid, key, start, length, vo in SCENES:
        raw = pro / f"{sid}_g.mp4"
        if key == "endcard":
            run([
                "ffmpeg", "-y", "-i", str(END), "-t", str(length),
                "-vf", "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080",
                "-an", "-c:v", "libx264", "-crf", "11", "-preset", "slow", "-pix_fmt", "yuv420p", str(raw),
            ])
        else:
            trim_grade(src_map[key], raw, start, length, ai=False)
        final = pro / f"{sid}.mp4"
        if vo:
            await mux_vo(raw, vo, final)
        else:
            silent(raw, final)
        built.append(final)
        print(f"  {sid} ok", flush=True)

    hq = OUT / "orvo24-v8-pro-hq.mp4"
    print("concat...", flush=True)
    concat_clips(built, hq)

    mixed = OUT / "orvo24-v8-pro-mix.mp4"
    add_ambience(hq, mixed)

    web = OUT / "orvo24-v8-web.mp4"
    final = OUT / "orvo24-v8.mp4"
    run([
        "ffmpeg", "-y", "-i", str(mixed), "-c:v", "libx264", "-crf", "16", "-preset", "slow",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(final),
    ])
    run([
        "ffmpeg", "-y", "-i", str(final), "-c:v", "libx264", "-crf", "19", "-preset", "slow",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(web),
    ])
    print(f"DONE {web} ({dur(web):.1f}s)", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
