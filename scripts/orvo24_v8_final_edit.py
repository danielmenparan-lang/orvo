#!/usr/bin/env python3
"""ORVO24 v8 Final — AI footage, smooth English VO, subs, product walkthrough."""
import asyncio
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path("/workspace")
OUT = ROOT / "assets/orvo24/v8"
PRO = OUT / "ai_master"
DEMO = ROOT / "orvo24-demo.html"
CHROME = "/usr/local/bin/google-chrome"
END = OUT / "endcard.mp4"
FONT_EN = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"
XFADE = 0.4
TARGET = 20.0

# Office scenes + longer product + endcard
SCENE_DURS = [2.5, 2.8, 3.0, 3.0, 3.0, 2.0, 4.8, 2.4]
SCENE_KEYS = [
    "s01_g.mp4", "s02_g.mp4", "s03_g.mp4", "s04_g.mp4",
    "s05_g.mp4", "s06_g.mp4", "s07_g.mp4", "s08_g.mp4",
]

# Product slide captions (timed inside product scene)
PRODUCT_SUBS = [
    (0.15, 1.35, "Post what you need."),
    (1.35, 2.55, "A builder responds to you."),
    (2.55, 4.0, "Your agent runs. orvo24.com"),
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

OST = [
    (0.3, 2.2, "Office · 4:00 PM", "40", "48", 32, "white@0.55"),
    (2.3, 4.8, "3:57 PM", "w-tw-55", "h-th-115", 36, "white@0.75"),
]


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
    header = """[Script Info]
Title: ORVO24 v8
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Speaker,Noto Sans,28,&H00458AFF,&H000000FF,&H00000000,&H90000000,1,0,0,0,100,100,0,0,3,0,0,2,100,100,158,1
Style: Dialogue,Noto Sans,44,&H00FFFFFF,&H000000FF,&H00000000,&HA0000000,0,0,0,0,100,100,0,0,3,3,1,2,100,100,92,1
Style: Brand,Noto Sans,48,&H00458AFF,&H000000FF,&H00000000,&HA0000000,1,0,0,0,100,100,0,0,3,3,1,2,100,100,92,1
Style: Product,Noto Sans,40,&H00FFFFFF,&H000000FF,&H00000000,&HB0000000,0,0,0,0,100,100,0,0,3,2,1,2,100,100,120,1

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
    await edge_tts.Communicate(text, voice, rate="-8%", pitch="-1Hz").save(str(path))


async def synthesize_vo(audio_dir):
    """English VO — sequential, no overlap, never cut off."""
    starts = scene_starts(SCENE_DURS, XFADE)
    andrew = "en-US-AndrewMultilingualNeural"
    ava = "en-US-AvaMultilingualNeural"
    MIN_GAP = 0.40

    spec = [
        ("scene", 2, 0.50, andrew, "It's not even five. How come you're leaving?", "Guy"),
        ("scene", 3, 0.45, ava, "My agent finishes my work for me.", "Her"),
        ("scene", 4, 0.40, andrew, "But you don't know how to build an agent.", "Guy"),
        ("chain", None, 0.35, ava, "No.", "Her"),
        ("chain", None, 0.45, ava, "Found a builder on Orvo.", "Her"),
    ]

    placements = []
    subs = []
    last_end = 0.0

    for i, item in enumerate(spec):
        kind = item[0]
        mp3 = audio_dir / f"line_{i:02d}.mp3"
        if kind == "scene":
            _, sc_idx, delay, voice, text, speaker = item
            t0 = max(starts[sc_idx] + delay, last_end + MIN_GAP)
        else:
            _, _, gap, voice, text, speaker = item
            t0 = last_end + gap

        await tts(voice, text, mp3)
        ln_d = dur(mp3)
        t1 = t0 + ln_d
        last_end = t1 + 0.12
        placements.append((t0, mp3, ln_d))
        style = "Brand" if "Orvo" in text else "Dialogue"
        subs.append((t0, t1, "Speaker", speaker))
        subs.append((t0, t1, style, text))
        print(f"  VO {i+1} @{t0:.2f}s ({ln_d:.2f}s) {speaker}: {text}", flush=True)

    # Product scene subtitles (absolute timeline)
    prod_start = starts[6]
    for rel0, rel1, text in PRODUCT_SUBS:
        style = "Brand" if "orvo24" in text else "Product"
        subs.append((prod_start + rel0, prod_start + rel1, style, text))

    return placements, subs


def capture_product():
    """Website flow: post → builder responds → site."""
    frames = OUT / "product_frames"
    frames.mkdir(exist_ok=True)
    profile = OUT / ".chrome-ai"
    profile.mkdir(exist_ok=True)
    # slides 1=post, 2=builder quotes, 4=orvo24.com CTA
    for idx, slide in enumerate([1, 2, 4]):
        out = frames / f"flow_{idx}.png"
        url = DEMO.as_uri() + f"?slide={slide}"
        subprocess.run([
            "timeout", "12", CHROME, "--headless=new", "--no-sandbox", "--disable-gpu",
            f"--user-data-dir={profile}", "--virtual-time-budget=800",
            "--run-all-compositor-stages-before-draw", "--window-size=1920,1080",
            f"--screenshot={out}", url,
        ], capture_output=True)
        if not out.exists() or out.stat().st_size < 5000:
            raise RuntimeError(f"product frame slide {slide} failed")

    dest = PRO / "s07_g.mp4"
    run([
        "ffmpeg", "-y",
        "-loop", "1", "-t", "1.55", "-i", str(frames / "flow_0.png"),
        "-loop", "1", "-t", "1.55", "-i", str(frames / "flow_1.png"),
        "-loop", "1", "-t", "1.55", "-i", str(frames / "flow_2.png"),
        "-filter_complex",
        "[0:v]scale=1920:1080,setsar=1,fade=t=in:st=0:d=0.15[v0];"
        "[1:v]scale=1920:1080,setsar=1[v1];[2:v]scale=1920:1080,setsar=1[v2];"
        "[v0][v1]xfade=transition=fade:duration=0.2:offset=1.35[x01];"
        "[x01][v2]xfade=transition=fade:duration=0.2:offset=2.7[out]",
        "-map", "[out]", "-an", "-r", "24", "-c:v", "libx264", "-crf", "9", "-preset", "slow",
        "-pix_fmt", "yuv420p", "-t", str(SCENE_DURS[6]), str(dest),
    ])
    return dest


def build_silent_scenes():
    if not END.exists():
        run(["python3", str(ROOT / "scripts/orvo24_endcard.py")])
    RAW = OUT
    mapping = [
        ("s01_g.mp4", "s01_establish_raw.mp4", 0.5, SCENE_DURS[0]),
        ("s02_g.mp4", "s02_hero_raw.mp4", 0.8, SCENE_DURS[1]),
        ("s03_g.mp4", "s03_pack_raw.mp4", 0.8, SCENE_DURS[2]),
        ("s04_g.mp4", "s04_her_raw.mp4", 0.8, SCENE_DURS[3]),
        ("s05_g.mp4", "s04_her_raw.mp4", 1.15, SCENE_DURS[4]),
        ("s06_g.mp4", "s06_walk_raw.mp4", 0.5, SCENE_DURS[5]),
    ]
    for dst, src, ss, ln in mapping:
        p = PRO / dst
        run([
            "ffmpeg", "-y", "-ss", str(ss), "-i", str(RAW / src), "-t", str(ln),
            "-vf", AI_GRADE + f",fade=t=in:st=0:d=0.28,fade=t=out:st={max(0.1, ln - 0.28)}:d=0.28",
            "-r", "24", "-an", "-c:v", "libx264", "-crf", "9", "-preset", "slow",
            "-pix_fmt", "yuv420p", str(p),
        ])
    capture_product()
    run([
        "ffmpeg", "-y", "-i", str(END), "-t", str(SCENE_DURS[7]),
        "-vf", "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080",
        "-r", "24", "-an", "-c:v", "libx264", "-crf", "9", "-preset", "slow",
        "-pix_fmt", "yuv420p", str(PRO / "s08_g.mp4"),
    ])


def xfade_video(clips, out):
    ins = []
    for c in clips:
        ins += ["-i", str(c)]
    fade = XFADE
    n = len(clips)
    norm = [f"[{i}:v]fps=24,setpts=PTS-STARTPTS[v{i}n]" for i in range(n)]
    parts = norm
    off = dur(clips[0]) - fade
    parts.append(f"[v0n][v1n]xfade=transition=fade:duration={fade}:offset={off:.3f}[x01]")
    pv = "x01"
    for i in range(2, n):
        off += dur(clips[i - 1]) - fade
        xn = f"x{i:02d}"
        parts.append(f"[{pv}][v{i}n]xfade=transition=fade:duration={fade}:offset={off:.3f}[{xn}]")
        pv = xn
    run([
        "ffmpeg", "-y", *ins, "-filter_complex", ";".join(parts),
        "-map", f"[{pv}]", "-an",
        "-c:v", "libx264", "-crf", "9", "-preset", "slow", "-pix_fmt", "yuv420p",
        str(out),
    ])


def build_audio(video_dur, placements, out):
    """Concat VO into one clean bed — no amix overlap artifacts."""
    tmp = out.parent / "vo_concat.m4a"
    parts = []
    cursor = 0.0
    for start, mp3, ln_d in placements:
        gap = start - cursor
        if gap > 0.02:
            parts.append(("silence", gap))
        parts.append(("file", mp3))
        cursor = start + ln_d
    if cursor < video_dur:
        parts.append(("silence", video_dur - cursor))

    ins = []
    flt = []
    idx = 0
    for kind, val in parts:
        if kind == "silence":
            ins += ["-f", "lavfi", "-i", f"anullsrc=r=48000:cl=mono:duration={val:.3f}"]
        else:
            ins += ["-i", str(val)]
        flt.append(f"[{idx}:a]aformat=sample_rates=48000:channel_layouts=mono[s{idx}]")
        idx += 1
    n = len(parts)
    flt.append("".join(f"[s{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1[vo]")
    flt.append(
        f"[vo]afade=t=in:st=0:d=0.08,afade=t=out:st={max(0.1, video_dur - 0.3):.3f}:d=0.3,"
        f"highpass=f=90,volume=1.05,loudnorm=I=-16:TP=-1.5:LRA=11[vn]"
    )
    run([
        "ffmpeg", "-y", *ins, "-filter_complex", ";".join(flt),
        "-map", "[vn]", "-t", str(video_dur),
        "-c:a", "aac", "-b:a", "192k", str(tmp),
    ])

    run([
        "ffmpeg", "-y",
        "-i", str(tmp),
        "-f", "lavfi", "-i", f"anoisesrc=color=pink:amplitude=0.003:duration={video_dur}",
        "-filter_complex",
        f"[1:a]highpass=f=200,lowpass=f=2200,volume=0.12[room];"
        f"[0:a][room]amix=inputs=2:duration=first:weights=1 0.15[aout]",
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
            f"drawtext=fontfile={FONT_EN}:text='{esc}':fontsize={size}:fontcolor={color}:"
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

    vid_only = OUT / "orvo24-v8-vidonly.mp4"
    print("xfade...", flush=True)
    xfade_video(clips, vid_only)
    vd = dur(vid_only)
    print(f"  video {vd:.2f}s", flush=True)

    audio_dir = OUT / "audio_final"
    audio_dir.mkdir(exist_ok=True)
    print("VO...", flush=True)
    placements, subs = await synthesize_vo(audio_dir)

    write_ass(subs, OUT / "captions.ass")

    audio = OUT / "orvo24-v8-audio.m4a"
    build_audio(TARGET, placements, audio)

    muxed = OUT / "orvo24-v8-muxed.mp4"
    mux_av(vid_only, audio, muxed)

    final = OUT / "orvo24-v8.mp4"
    web = OUT / "orvo24-v8-web.mp4"
    print("subs...", flush=True)
    burn_overlays(muxed, OUT / "captions.ass", final)
    run([
        "ffmpeg", "-y", "-i", str(final), "-t", str(TARGET),
        "-c:v", "libx264", "-crf", "22", "-preset", "slow",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(web),
    ])
    run([
        "ffmpeg", "-y", "-i", str(final), "-t", str(TARGET),
        "-c:v", "libx264", "-crf", "20", "-preset", "slow",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
        str(OUT / "orvo24-v8-full-temp.mp4"),
    ])
    run(["mv", str(OUT / "orvo24-v8-full-temp.mp4"), str(final)])
    run([
        "ffmpeg", "-y", "-ss", "1.0", "-i", str(web), "-update", "1", "-frames:v", "1",
        str(OUT / "poster.jpg"), "-q:v", "3",
    ])
    print(f"DONE {web} ({dur(web):.2f}s)", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
