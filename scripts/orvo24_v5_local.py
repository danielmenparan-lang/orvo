#!/usr/bin/env python3
"""ORVO24 v5 local — natural color + English voice from v3 scenes (no API credits)."""
import asyncio
import subprocess
from pathlib import Path

import edge_tts

V3 = Path("/workspace/assets/orvo24/v3")
OUT = Path("/workspace/assets/orvo24/v5")
OUT.mkdir(parents=True, exist_ok=True)

SCENES = [
    ("01_office", None, False),
    ("02_packing", None, False),
    ("03_tom", ("en-US-AndrewMultilingualNeural", "Four thirty? Why leave so early?"), True),
    ("04_maya", ("en-US-AvaMultilingualNeural", "My agent finishes all my work."), True),
    ("05_alex", ("en-US-BrianMultilingualNeural", "You can't even build an agent."), True),
    ("06_phone", ("en-US-AvaMultilingualNeural", "I just use orvo24.com."), True),
    ("07_nods", None, False),
]

SUBS = [
    (0, 5, ""), (5, 10, "She packs up to leave early..."),
    (10, 15, "Four thirty? Why leave so early?"),
    (15, 20, "My agent finishes all my work."),
    (20, 25, "You can't even build an agent."),
    (25, 30, "I just use orvo24.com."), (30, 35, ""),
]

# Natural grade + green cast removal on dialogue scenes
BASE_GRADE = (
    "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,"
    "eq=brightness=0.03:saturation=1.06:contrast=1.02:gamma=1.02,"
    "unsharp=5:5:0.4:5:5:0.0"
)
DIALOGUE_GRADE = (
    "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,"
    "colorbalance=rs=0.04:gs=-0.06:bs=0.02,"
    "eq=brightness=0.04:saturation=1.05:contrast=1.02:gamma=1.02,"
    "curves=g='0/0 0.45/0.42 1/1',"
    "unsharp=5:5:0.35:5:5:0.0"
)


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def dur(path):
    return float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nokey=1", str(path),
    ]).decode())


async def tts(voice, text, path):
    await edge_tts.Communicate(text, voice, rate="+0%", pitch="-1Hz").save(str(path))


def grade(src, dst, dialogue=False):
    vf = DIALOGUE_GRADE if dialogue else BASE_GRADE
    run(["ffmpeg", "-y", "-i", str(src), "-vf", vf,
         "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-pix_fmt", "yuv420p",
         "-an", str(dst)])


def mux(vid, audio, out, delay=0.4):
    d = dur(vid)
    ms = int(delay * 1000)
    run([
        "ffmpeg", "-y", "-i", str(vid), "-i", str(audio),
        "-filter_complex", f"[1:a]adelay={ms}|{ms},apad=whole_dur={d}[a]",
        "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-t", str(d), str(out),
    ])


def silent_audio(vid, out):
    d = dur(vid)
    run([
        "ffmpeg", "-y", "-i", str(vid), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
        "-t", str(d), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
        "-b:a", "96k", "-shortest", str(out),
    ])


async def main():
    audio_dir = OUT / "audio"
    audio_dir.mkdir(exist_ok=True)
    clips = []
    for sid, dlg, is_dlg in SCENES:
        graded = OUT / f"{sid}_g.mp4"
        grade(V3 / f"{sid}.mp4", graded, dialogue=is_dlg)
        if dlg:
            voice, text = dlg
            mp3 = audio_dir / f"{sid}.mp3"
            await tts(voice, text, mp3)
            out = OUT / f"{sid}.mp4"
            mux(graded, mp3, out)
        else:
            out = OUT / f"{sid}.mp4"
            silent_audio(graded, out)
        clips.append(out)
        print(f"ok {sid}", flush=True)

    concat = OUT / "concat.txt"
    concat.write_text("\n".join(f"file '{p.resolve()}'" for p in clips))
    hq = OUT / "orvo24-v5-hq.mp4"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", str(hq)])

    srt = OUT / "subs.srt"
    lines = []
    for n, (a, b, t) in enumerate((x for x in SUBS if x[2]), 1):
        def ts(s):
            h, m = divmod(int(s), 3600); m, s = divmod(m, 60)
            return f"{h:02d}:{m:02d}:{s:02d},000"
        lines += [str(n), f"{ts(a)} --> {ts(b)}", t, ""]
    srt.write_text("\n".join(lines))

    final = OUT / "orvo24-v5.mp4"
    run([
        "ffmpeg", "-y", "-i", str(hq),
        "-vf", f"subtitles={srt}:force_style='FontName=Arial,FontSize=22,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=35'",
        "-map", "0:v:0", "-map", "0:a:0", "-c:v", "libx264", "-crf", "12", "-preset", "slow",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final),
    ])
    web = OUT / "orvo24-v5-web.mp4"
    run([
        "ffmpeg", "-y", "-i", str(final), "-map", "0:v:0", "-map", "0:a:0",
        "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(web),
    ])
    print(f"DONE {final}\n     {web}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
