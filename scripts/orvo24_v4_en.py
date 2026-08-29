#!/usr/bin/env python3
"""ORVO24 v4 — English dub over v3 visuals, brighter grade, web export."""
import asyncio
import subprocess
from pathlib import Path

import edge_tts

V3 = Path("/workspace/assets/orvo24/v3")
OUT = Path("/workspace/assets/orvo24/v4")
OUT.mkdir(parents=True, exist_ok=True)

SCENES = [
    ("01_office", None),
    ("02_packing", None),
    ("03_tom", ("en-US-AndrewNeural", "Wait, it's four thirty? Why are you leaving?")),
    ("04_maya", ("en-US-JennyNeural", "My agent finishes my work for me.")),
    ("05_alex", ("en-US-ChristopherNeural", "But you don't know how to build an agent.")),
    ("06_phone", ("en-US-JennyNeural", "I just went to orvo24.com.")),
    ("07_nods", None),
]

SUBS = [
    (0, 5, ""),
    (5, 10, "She packs up to leave early..."),
    (10, 15, "Wait, 4:30? Why are you leaving?"),
    (15, 20, "My agent finishes my work for me."),
    (20, 25, "But you don't know how to build an agent."),
    (25, 30, "I just went to orvo24.com."),
    (30, 35, ""),
]

GRADE = (
    "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,"
    "eq=brightness=0.10:saturation=1.38:contrast=1.03:gamma=1.04,"
    "colorbalance=rs=0.09:gs=0.04:bs=-0.14,"
    "curves=r='0/0 0.5/0.60 1/1':g='0/0 0.5/0.56 1/1':b='0/0 0.5/0.44 1/1'"
)


async def gen_tts(voice: str, text: str, path: Path):
    await edge_tts.Communicate(text, voice, rate="+4%").save(str(path))


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def video_duration(path: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nokey=1", str(path),
    ]).decode().strip()
    return float(out)


def mux_voice(video: Path, audio: Path, out: Path, delay: float = 0.35):
    dur = video_duration(video)
    delay_ms = int(delay * 1000)
    run([
        "ffmpeg", "-y", "-i", str(video), "-i", str(audio),
        "-filter_complex", f"[1:a]adelay={delay_ms}|{delay_ms},apad=whole_dur={dur}[a]",
        "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-t", str(dur), str(out),
    ])


def grade_clip(src: Path, dst: Path):
    run([
        "ffmpeg", "-y", "-i", str(src), "-vf", GRADE,
        "-c:v", "libx264", "-crf", "13", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(dst),
    ])


def ensure_audio(video: Path, out: Path):
    has_audio = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "a",
        "-show_entries", "stream=index", "-of", "csv=p=0", str(video),
    ]).decode().strip()
    if has_audio:
        run(["ffmpeg", "-y", "-i", str(video), "-c", "copy", str(out)])
        return
    dur = video_duration(video)
    run([
        "ffmpeg", "-y", "-i", str(video), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-t", str(dur), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
        "-b:a", "128k", "-shortest", str(out),
    ])


async def main():
    audio_dir = OUT / "audio"
    audio_dir.mkdir(exist_ok=True)
    dubbed = []

    for sid, dlg in SCENES:
        src = V3 / f"{sid}.mp4"
        if not src.exists():
            raise FileNotFoundError(src)
        raw = OUT / f"{sid}_raw.mp4"
        if dlg:
            voice, text = dlg
            mp3 = audio_dir / f"{sid}.mp3"
            print(f"TTS {sid}: {text}", flush=True)
            await gen_tts(voice, text, mp3)
            mux_voice(src, mp3, raw)
        else:
            run(["ffmpeg", "-y", "-i", str(src), "-c", "copy", str(raw)])

        graded = OUT / f"{sid}.mp4"
        grade_clip(raw, graded)
        with_audio = OUT / f"{sid}_a.mp4"
        ensure_audio(graded, with_audio)
        dubbed.append(with_audio)
        print(f"  ok {with_audio.name}", flush=True)

    scaled = OUT / "scaled"
    scaled.mkdir(exist_ok=True)
    parts = []
    for i, clip in enumerate(dubbed):
        p = scaled / f"s{i:02d}.mp4"
        run(["ffmpeg", "-y", "-i", str(clip), "-c", "copy", str(p)])
        parts.append(p)

    concat = OUT / "concat.txt"
    concat.write_text("\n".join(f"file '{p.resolve()}'" for p in parts))
    hq = OUT / "orvo24-v4-hq.mp4"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", str(hq)])

    srt = OUT / "subs.srt"
    lines = []
    for n, (a, b, t) in enumerate((x for x in SUBS if x[2]), 1):
        def ts(s):
            h, m = divmod(int(s), 3600)
            m, s = divmod(m, 60)
            return f"{h:02d}:{m:02d}:{s:02d},000"
        lines += [str(n), f"{ts(a)} --> {ts(b)}", t, ""]
    srt.write_text("\n".join(lines))

    final = OUT / "orvo24-v4.mp4"
    run([
        "ffmpeg", "-y", "-i", str(hq),
        "-vf", f"subtitles={srt}:force_style='FontName=Arial,FontSize=22,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=35'",
        "-map", "0:v:0", "-map", "0:a:0", "-c:v", "libx264", "-crf", "13", "-preset", "slow",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final),
    ])

    web = OUT / "orvo24-v4-web.mp4"
    run([
        "ffmpeg", "-y", "-i", str(final), "-map", "0:v:0", "-map", "0:a:0",
        "-c:v", "libx264", "-crf", "21", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(web),
    ])

    print(f"DONE\n  {final}\n  {web}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
