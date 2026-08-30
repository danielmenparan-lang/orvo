#!/usr/bin/env python3
"""ORVO24 v8 Final — AI footage + precise Hebrew VO, styled subs, on-screen text."""
import asyncio
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path("/workspace")
OUT = ROOT / "assets/orvo24/v8"
PRO = OUT / "ai_master"
FONT = "/usr/share/fonts/truetype/noto/NotoSansHebrew-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/noto/NotoSansHebrew-Regular.ttf"
END = OUT / "endcard.mp4"
XFADE = 0.4
TARGET = 20.0

# Scene video sources (graded, no per-scene VO)
SCENE_DURS = [2.8, 3.2, 3.2, 3.2, 3.2, 2.6, 2.4, 3.2]
SCENE_KEYS = [
    "s01_g.mp4", "s02_g.mp4", "s03_g.mp4", "s04_g.mp4",
    "s05_g.mp4", "s06_g.mp4", "s07_g.mp4", "s08_g.mp4",
]

# scene_idx, delay_in_scene, voice, text, speaker_label
VO_LINES = [
    (2, 0.50, "he-IL-AvriNeural", "עדיין לא חמש. איך את הולכת?", "גיא"),
    (3, 0.45, "he-IL-HilaNeural", "הסוכן שלי מסיים לי את העבודה.", "מיה"),
    (4, 0.40, "he-IL-AvriNeural", "אבל את לא יודעת לבנות סוכן.", "גיא"),
    (4, 2.00, "he-IL-HilaNeural", "לא.", "מיה"),
    (6, 0.35, "he-IL-HilaNeural", "מצאתי אחד ב־Orvo24.", "מיה"),
]

# On-screen text overlays: start, end, text, x_expr, y, size, color
OST = [
    (0.3, 2.5, "משרד · 16:00", "40", "48", 34, "white@0.55"),
    (2.5, 5.0, "15:57", "w-tw-50", "h-th-120", 38, "white@0.75"),
    (16.0, 18.5, "orvo24.com", "(w-tw)/2", "h-th-80", 42, "0xFF6B2C@0.9"),
]

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


def scene_starts(durations, fade):
    starts = [0.0]
    for i in range(1, len(durations)):
        starts.append(starts[-1] + durations[i - 1] - fade)
    return starts


def ass_time(s):
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = s % 60
    return f"{h}:{m:02d}:{sec:05.2f}"


def write_ass(entries, path):
    """entries: list of (start, end, style, text)"""
    header = f"""[Script Info]
Title: ORVO24 v8
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Speaker,Noto Sans Hebrew,30,&H00458AFF,&H000000FF,&H00000000,&H90000000,1,0,0,0,100,100,0,0,3,0,0,2,100,100,155,1
Style: Dialogue,Noto Sans Hebrew,48,&H00FFFFFF,&H000000FF,&H00000000,&HA0000000,0,0,0,0,100,100,0,0,3,3,1,2,100,100,88,1
Style: Brand,Noto Sans Hebrew,52,&H00458AFF,&H000000FF,&H00000000,&HA0000000,1,0,0,0,100,100,0,0,3,3,1,2,100,100,88,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for start, end, style, text in entries:
        lines.append(
            f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{text}\n"
        )
    path.write_text("".join(lines), encoding="utf-8")


async def tts(voice, text, path):
    await edge_tts.Communicate(text, voice, rate="-10%", pitch="-1Hz").save(str(path))


async def synthesize_vo(audio_dir):
    starts = scene_starts(SCENE_DURS, XFADE)
    placements = []
    subs = []
    for i, (sc_idx, delay, voice, text, speaker) in enumerate(VO_LINES):
        mp3 = audio_dir / f"line_{i:02d}.mp3"
        await tts(voice, text, mp3)
        ln_d = dur(mp3)
        t0 = starts[sc_idx] + delay
        t1 = min(t0 + ln_d + 0.2, TARGET - 0.1)
        placements.append((t0, mp3))
        style = "Brand" if "Orvo24" in text or "ORVO" in text.upper() else "Dialogue"
        subs.append((t0, t1, "Speaker", speaker))
        subs.append((t0, t1, style, text))
        print(f"  VO {i+1} @{t0:.2f}s ({ln_d:.2f}s) {speaker}: {text[:30]}...", flush=True)
    return placements, subs


def build_silent_scenes():
    """Ensure graded silent scene clips exist."""
    if not END.exists():
        run(["python3", str(ROOT / "scripts/orvo24_endcard.py")])
    RAW = OUT
    mapping = [
        ("s01_g.mp4", "s01_establish_raw.mp4", 0.5, 2.8),
        ("s02_g.mp4", "s02_hero_raw.mp4", 0.8, 3.2),
        ("s03_g.mp4", "s03_pack_raw.mp4", 0.8, 3.2),
        ("s04_g.mp4", "s04_her_raw.mp4", 0.8, 3.2),
        ("s05_g.mp4", "s04_her_raw.mp4", 1.15, 3.2),
        ("s06_g.mp4", "s06_walk_raw.mp4", 0.5, 2.6),
    ]
    for dst, src, ss, ln in mapping:
        p = PRO / dst
        if p.exists() and p.stat().st_size > 1_000_000:
            continue
        run([
            "ffmpeg", "-y", "-ss", str(ss), "-i", str(RAW / src), "-t", str(ln),
            "-vf", AI_GRADE + f",fade=t=in:st=0:d=0.32,fade=t=out:st={max(0.12, ln - 0.32)}:d=0.32",
            "-r", "24", "-an", "-c:v", "libx264", "-crf", "9", "-preset", "slow",
            "-pix_fmt", "yuv420p", str(p),
        ])
    # product
    if not (PRO / "s07_g.mp4").exists() or (PRO / "s07_g.mp4").stat().st_size < 100_000:
        run(["python3", str(ROOT / "scripts/orvo24_v8_ai_master.py")])
    if not (PRO / "s08_g.mp4").exists():
        run([
            "ffmpeg", "-y", "-i", str(END), "-t", "3.2",
            "-vf", "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080",
            "-r", "24", "-an", "-c:v", "libx264", "-crf", "9", "-preset", "slow",
            "-pix_fmt", "yuv420p", str(PRO / "s08_g.mp4"),
        ])


def xfade_video(clips, out):
    ins = []
    for c in clips:
        ins += ["-i", str(c)]
    fade = XFADE
    parts = []
    off = dur(clips[0]) - fade
    parts.append(f"[0:v][1:v]xfade=transition=fade:duration={fade}:offset={off:.3f}[v01]")
    pv = "v01"
    for i in range(2, len(clips)):
        off += dur(clips[i - 1]) - fade
        vn = f"v{i:02d}"
        parts.append(f"[{pv}][{i}:v]xfade=transition=fade:duration={fade}:offset={off:.3f}[{vn}]")
        pv = vn
    run([
        "ffmpeg", "-y", *ins, "-filter_complex", ";".join(parts),
        "-map", f"[{pv}]", "-an",
        "-c:v", "libx264", "-crf", "9", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-t", str(TARGET + 1), str(out),
    ])


def build_audio(video_dur, placements, out):
    ins = [
        "-f", "lavfi", "-i", f"anullsrc=r=48000:cl=mono",
        "-f", "lavfi", "-i", f"anoisesrc=color=pink:amplitude=0.005:duration={video_dur + 0.5}",
    ]
    flt = [f"[0:a]atrim=0:{video_dur},asetpts=PTS-STARTPTS[base]"]
    for i, (start, mp3) in enumerate(placements):
        ins += ["-i", str(mp3)]
        ms = int(start * 1000)
        flt.append(
            f"[{i+2}:a]adelay={ms}|{ms},"
            f"highpass=f=100,compand=0.3|0.3:1|1:-90/-60|-60/-40|-18/-6|0/-2:6:0:-90:0.2,"
            f"apad=whole_dur={video_dur}[v{i}]"
        )
    n = len(placements)
    mix = "[base]" + "".join(f"[v{i}]" for i in range(n))
    flt.append(f"{mix}amix=inputs={1 + n}:duration=first:dropout_transition=0[vo]")
    flt.append(
        f"[1:a]atrim=0:{video_dur},highpass=f=200,lowpass=f=2200,volume=0.18[room];"
        f"[vo][room]amix=inputs=2:duration=first:weights=1 0.22,"
        f"loudnorm=I=-16:TP=-1.5:LRA=11[aout]"
    )
    run([
        "ffmpeg", "-y", *ins,
        "-filter_complex", ";".join(flt),
        "-map", "[aout]", "-t", str(video_dur),
        "-c:a", "aac", "-b:a", "192k", str(out),
    ])


def mux_av(video, audio, out):
    run([
        "ffmpeg", "-y", "-i", str(video), "-i", str(audio),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "copy", "-t", str(TARGET),
        "-movflags", "+faststart", str(out),
    ])


def burn_overlays(src, ass_path, dst):
    ost_parts = []
    for t0, t1, text, x, y, size, color in OST:
        esc = text.replace(":", "\\:").replace("'", "\\'")
        ost_parts.append(
            f"drawtext=fontfile={FONT}:text='{esc}':fontsize={size}:fontcolor={color}:"
            f"x={x}:y={y}:enable='between(t\\,{t0}\\,{t1})'"
        )
    ass_esc = str(ass_path).replace(":", "\\:").replace("'", "'\\''")
    vf = ost_parts + [f"ass='{ass_esc}'"]
    run([
        "ffmpeg", "-y", "-i", str(src),
        "-vf", ",".join(vf),
        "-c:v", "libx264", "-crf", "18", "-preset", "slow",
        "-c:a", "copy", "-movflags", "+faststart", str(dst),
    ])


async def main():
    print("scenes...", flush=True)
    build_silent_scenes()
    clips = [PRO / k for k in SCENE_KEYS]
    for c in clips:
        if not c.exists():
            raise RuntimeError(f"missing {c}")

    vid_only = OUT / "orvo24-v8-vidonly.mp4"
    print("xfade video...", flush=True)
    xfade_video(clips, vid_only)
    vd = min(dur(vid_only), TARGET + 0.5)
    print(f"  video {vd:.2f}s", flush=True)

    audio_dir = OUT / "audio_final"
    audio_dir.mkdir(exist_ok=True)
    print("VO + subs...", flush=True)
    placements, subs = await synthesize_vo(audio_dir)

    ass_path = OUT / "captions.ass"
    write_ass(subs, ass_path)

    audio = OUT / "orvo24-v8-audio.mp4"
    build_audio(TARGET, placements, audio)

    muxed = OUT / "orvo24-v8-muxed.mp4"
    mux_av(vid_only, audio, muxed)

    final = OUT / "orvo24-v8.mp4"
    web = OUT / "orvo24-v8-web.mp4"
    print("burn subs + OST...", flush=True)
    burn_overlays(muxed, ass_path, final)
    run([
        "ffmpeg", "-y", "-i", str(final), "-t", str(TARGET),
        "-c:v", "libx264", "-crf", "22", "-preset", "slow",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(web),
    ])
    run([
        "ffmpeg", "-y", "-ss", "1.0", "-i", str(web), "-update", "1", "-frames:v", "1",
        str(OUT / "poster.jpg"), "-q:v", "3",
    ])
    print(f"DONE {web} ({dur(web):.2f}s)", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
