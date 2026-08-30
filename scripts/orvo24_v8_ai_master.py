#!/usr/bin/env python3
"""ORVO24 v8 AI Master — polish existing Ideogram+Kling clips into best possible 20s cut."""
import asyncio
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path("/workspace")
OUT = ROOT / "assets/orvo24/v8"
RAW = OUT
PRO = OUT / "ai_master"
PRO.mkdir(parents=True, exist_ok=True)
DEMO = ROOT / "orvo24-demo.html"
CHROME = "/usr/local/bin/google-chrome"
END = OUT / "endcard.mp4"

XFADE = 0.4
TARGET = 20.0

# Frame-checked offsets into *_raw.mp4 (avoid s05 — subject looks at lens)
SCENES = [
    ("s01", "s01_establish_raw.mp4", 0.5, 2.8, []),
    ("s02", "s02_hero_raw.mp4", 0.8, 3.2, []),
    ("s03", "s03_pack_raw.mp4", 0.8, 3.2, [
        ("en-US-AndrewMultilingualNeural", "It's not even five. How come you're leaving?", 0.45),
    ]),
    ("s04", "s04_her_raw.mp4", 0.8, 3.2, [
        ("en-US-AvaMultilingualNeural", "My agent finishes my work for me.", 0.4),
    ]),
    ("s05", "s04_her_raw.mp4", 1.15, 3.2, [
        ("en-US-AndrewMultilingualNeural", "But you don't know how to build an agent.", 0.35),
        ("en-US-AvaMultilingualNeural", "No.", 2.05),
    ]),
    ("s06", "s06_walk_raw.mp4", 0.5, 2.6, []),
    ("s07", "product", 0.0, 2.4, [
        ("en-US-AvaMultilingualNeural", "Found one on Orvo24.", 0.3),
    ]),
    ("s08", "endcard", 0.0, 3.2, []),
]

# Cinematic polish — grain + mild denoise hides AI artifacts; warm unified grade
AI_GRADE = (
    "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,"
    "hqdn3d=1.2:1.2:2.5:2.5,"
    "eq=brightness=0.04:saturation=0.97:contrast=1.1:gamma=1.05,"
    "colorbalance=rs=0.05:gs=0.02:bs=-0.03,"
    "curves=all='0/0.03 0.45/0.5 1/0.97',"
    "vignette=angle=PI/5,"
    "noise=alls=10:allf=t+u,"
    "unsharp=5:5:0.22:5:5:0.0"
)


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def dur(p):
    return float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nokey=1", str(p),
    ]).decode())


def capture_product():
    frames = OUT / "product_frames"
    frames.mkdir(exist_ok=True)
    profile = OUT / ".chrome-ai"
    profile.mkdir(exist_ok=True)
    for i in range(5):
        out = frames / f"p{i}.png"
        url = DEMO.as_uri() + f"?slide={i}"
        subprocess.run([
            "timeout", "12", CHROME, "--headless=new", "--no-sandbox", "--disable-gpu",
            f"--user-data-dir={profile}", "--virtual-time-budget=800",
            "--run-all-compositor-stages-before-draw", "--window-size=1920,1080",
            f"--screenshot={out}", url,
        ], capture_output=True)
        if not out.exists() or out.stat().st_size < 5000:
            raise RuntimeError(f"product frame {i} failed")
    dest = PRO / "product.mp4"
    run([
        "ffmpeg", "-y",
        "-loop", "1", "-t", "0.55", "-i", str(frames / "p0.png"),
        "-loop", "1", "-t", "0.55", "-i", str(frames / "p1.png"),
        "-loop", "1", "-t", "0.55", "-i", str(frames / "p2.png"),
        "-loop", "1", "-t", "0.55", "-i", str(frames / "p3.png"),
        "-loop", "1", "-t", "0.55", "-i", str(frames / "p4.png"),
        "-filter_complex",
        "[0:v]scale=1920:1080,setsar=1,fade=t=in:st=0:d=0.12[v0];"
        "[1:v]scale=1920:1080,setsar=1[v1];[2:v]scale=1920:1080,setsar=1[v2];"
        "[3:v]scale=1920:1080,setsar=1[v3];[4:v]scale=1920:1080,setsar=1[v4];"
        "[v0][v1]xfade=transition=fade:duration=0.15:offset=0.4[x01];"
        "[x01][v2]xfade=transition=fade:duration=0.15:offset=0.8[x02];"
        "[x02][v3]xfade=transition=fade:duration=0.15:offset=1.2[x03];"
        "[x03][v4]xfade=transition=fade:duration=0.15:offset=1.6[out]",
        "-map", "[out]", "-c:v", "libx264", "-crf", "10", "-preset", "slow",
        "-pix_fmt", "yuv420p", "-an", str(dest),
    ])
    return dest


def trim_grade(src, dst, ss, length):
    run([
        "ffmpeg", "-y", "-ss", str(ss), "-i", str(src), "-t", str(length),
        "-vf", AI_GRADE + f",fade=t=in:st=0:d=0.32,fade=t=out:st={max(0.12, length - 0.32)}:d=0.32",
        "-r", "24", "-an", "-c:v", "libx264", "-crf", "9", "-preset", "slow",
        "-pix_fmt", "yuv420p", str(dst),
    ])


async def tts(voice, text, path):
    await edge_tts.Communicate(text, voice, rate="-12%", pitch="-2Hz").save(str(path))


async def mux_vo(vid, lines, out):
    d = dur(vid)
    ad = OUT / "audio_ai"
    ad.mkdir(exist_ok=True)
    ins = ["-i", str(vid)]
    flt = []
    for i, (voice, text, delay) in enumerate(lines):
        mp3 = ad / f"{out.stem}_{i}.mp3"
        await tts(voice, text, mp3)
        ins += ["-i", str(mp3)]
        ms = int(delay * 1000)
        flt.append(
            f"[{i+1}:a]adelay={ms}|{ms},apad=whole_dur={d},"
            f"highpass=f=90,compand=0.3|0.3:1|1:-90/-60|-60/-40|-18/-6|0/-2:6:0:-90:0.2,volume=0.9[a{i}]"
        )
    mix = "".join(f"[a{i}]" for i in range(len(lines)))
    fc = ";".join(flt) + f";{mix}amix=inputs={len(lines)}:duration=first:dropout_transition=0[aout]"
    run([
        "ffmpeg", "-y", *ins, "-filter_complex", fc,
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


def xfade_chain(clips, out, fade=XFADE):
    ins = []
    for c in clips:
        ins += ["-i", str(c)]
    parts = []
    off = dur(clips[0]) - fade
    parts.append(f"[0:v][1:v]xfade=transition=fade:duration={fade}:offset={off:.3f}[v01]")
    parts.append(f"[0:a][1:a]acrossfade=d={fade}[a01]")
    pv, pa = "v01", "a01"
    for i in range(2, len(clips)):
        off += dur(clips[i - 1]) - fade
        vn, an = f"v{i:02d}", f"a{i:02d}"
        parts.append(f"[{pv}][{i}:v]xfade=transition=fade:duration={fade}:offset={off:.3f}[{vn}]")
        parts.append(f"[{pa}][{i}:a]acrossfade=d={fade}[{an}]")
        pv, pa = vn, an
    run([
        "ffmpeg", "-y", *ins, "-filter_complex", ";".join(parts),
        "-map", f"[{pv}]", "-map", f"[{pa}]",
        "-c:v", "libx264", "-crf", "9", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out),
    ])


def polish_audio(vid, out):
    d = dur(vid)
    run([
        "ffmpeg", "-y", "-i", str(vid),
        "-f", "lavfi", "-i", f"anoisesrc=color=pink:amplitude=0.006:duration={d + 1}",
        "-filter_complex",
        f"[0:a]apad=whole_dur={d},loudnorm=I=-16:TP=-1.5:LRA=11[vo];"
        f"[1:a]atrim=0:{d},highpass=f=200,lowpass=f=2200,volume=0.2[room];"
        f"[vo][room]amix=inputs=2:duration=longest:weights=1 0.25[aout]",
        "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-t", str(d), str(out),
    ])


async def main():
    product = capture_product()
    if not END.exists():
        run(["python3", str(ROOT / "scripts/orvo24_endcard.py")])

    src_map = {"product": product, "endcard": END}
    built = []
    for sid, key, ss, ln, vo in SCENES:
        graded = PRO / f"{sid}_g.mp4"
        if key == "endcard":
            run([
                "ffmpeg", "-y", "-i", str(END), "-t", str(ln),
                "-vf", "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080",
                "-r", "24", "-an", "-c:v", "libx264", "-crf", "9", "-preset", "slow",
                "-pix_fmt", "yuv420p", str(graded),
            ])
        elif key == "product":
            trim_grade(product, graded, ss, ln)
        else:
            trim_grade(RAW / key, graded, ss, ln)
        final = PRO / f"{sid}.mp4"
        if vo:
            await mux_vo(graded, vo, final)
        else:
            silent(graded, final)
        built.append(final)
        print(f"  {sid} {dur(final):.2f}s", flush=True)

    hq = OUT / "orvo24-v8-ai-hq.mp4"
    print("xfade...", flush=True)
    xfade_chain(built, hq, fade=XFADE)
    print(f"  chain {dur(hq):.2f}s", flush=True)

    mixed = OUT / "orvo24-v8-ai-mix.mp4"
    polish_audio(hq, mixed)

    final = OUT / "orvo24-v8.mp4"
    web = OUT / "orvo24-v8-web.mp4"
    run([
        "ffmpeg", "-y", "-i", str(mixed), "-t", str(TARGET),
        "-c:v", "libx264", "-crf", "20", "-preset", "slow",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(final),
    ])
    run([
        "ffmpeg", "-y", "-i", str(final), "-c:v", "libx264", "-crf", "22", "-preset", "slow",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(web),
    ])
    run([
        "ffmpeg", "-y", "-ss", "1.0", "-i", str(web), "-update", "1", "-frames:v", "1",
        str(OUT / "poster.jpg"), "-q:v", "3",
    ])
    print(f"DONE {web} ({dur(web):.2f}s)", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
