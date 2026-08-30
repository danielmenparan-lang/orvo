#!/usr/bin/env python3
"""ORVO24 v7 — real stock footage + product slides. No AI faces. Voiceover only."""
import asyncio
import subprocess
import urllib.request
from pathlib import Path

import edge_tts

ROOT = Path("/workspace")
STOCK = ROOT / "assets/orvo24/v7/stock"
OUT = ROOT / "assets/orvo24/v7"
DEMO = ROOT / "orvo24-demo.html"
CHROME = "/usr/local/bin/google-chrome"

# Pexels IDs (royalty-free). Re-download if stock/ missing.
PEXELS = {
    "01_meeting": 5637279,
    "02_leave": 8873053,
    "03_talk": 6339836,
    "06_walk": 6774633,
    "05_phone": 6774226,
    "07_team": 7804938,
}

SCENES = [
    ("s00", "01_meeting", 1.0, 5.0, None),
    ("s01", "02_leave", 0.5, 5.0, None),
    ("s02", "01_meeting", 4.0, 4.5, ("en-US-AndrewNeural", "Four thirty? Where are you going?")),
    ("s03", "06_walk", 1.0, 4.5, ("en-US-JennyNeural", "My agent finishes the work.")),
    ("s04", "07_team", 5.0, 4.0, ("en-US-GuyNeural", "You can't even build an agent.")),
    ("s05", "product", 0.0, 11.0, ("en-US-JennyNeural", "I just use orvo24.com.")),
    ("s06", "07_team", 8.0, 5.0, None),
]

SUBS = [
    (5, 10, "She packs up to leave early..."),
    (10, 14.5, "Four thirty? Where are you going?"),
    (14.5, 19, "My agent finishes the work."),
    (19, 23, "You can't even build an agent."),
    (23, 33.5, "I just use orvo24.com."),
]

WARM = (
    "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,"
    "eq=brightness=0.07:saturation=1.1:contrast=0.98:gamma=1.1,"
    "colorbalance=rs=0.04:gs=0.02:bs=-0.03"
)


def run(cmd, **kw):
    subprocess.run(cmd, check=True, **kw)


def dur(path):
    return float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nokey=1", str(path),
    ]).decode())


def download_pexels(vid_id, dest):
    if dest.exists() and dest.stat().st_size > 100_000:
        return
    patterns = [
        f"{vid_id}-hd_1920_1080_30fps.mp4",
        f"{vid_id}-hd_1920_1080_25fps.mp4",
        f"{vid_id}-hd_1920_1080_24fps.mp4",
        f"{vid_id}-uhd_2560_1440_25fps.mp4",
    ]
    for p in patterns:
        url = f"https://videos.pexels.com/video-files/{vid_id}/{p}"
        req = urllib.request.Request(url, headers={"User-Agent": "orvo24-v7"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            if len(data) > 100_000 and data[4:8] == b"ftyp":
                dest.write_bytes(data)
                print(f"  downloaded {dest.name}", flush=True)
                return
        except Exception:
            pass
    raise RuntimeError(f"Could not download Pexels {vid_id}")


def ensure_stock():
    STOCK.mkdir(parents=True, exist_ok=True)
    for key, vid in PEXELS.items():
        download_pexels(vid, STOCK / f"{key}.mp4")


def chrome_shot(out, url):
    profile = OUT / ".chrome-profile"
    profile.mkdir(exist_ok=True)
    cmd = [
        "timeout", "12", CHROME,
        "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
        f"--user-data-dir={profile}",
        "--virtual-time-budget=800",
        "--run-all-compositor-stages-before-draw",
        f"--window-size=1920,1080", f"--screenshot={out}", url,
    ]
    subprocess.run(cmd, capture_output=True)
    if not out.exists() or out.stat().st_size < 10_000:
        raise RuntimeError(f"screenshot failed: {out}")


def capture_product_slides():
    frames = OUT / "frames"
    frames.mkdir(parents=True, exist_ok=True)
    for i in range(5):
        out = frames / f"slide_{i:02d}.png"
        url = DEMO.as_uri() + f"?slide={i}"
        chrome_shot(out, url)
    # Slideshow clip: 2.2s per slide
    run([
        "ffmpeg", "-y",
        "-loop", "1", "-t", "2.5", "-i", str(frames / "slide_00.png"),
        "-loop", "1", "-t", "2.5", "-i", str(frames / "slide_01.png"),
        "-loop", "1", "-t", "2.5", "-i", str(frames / "slide_02.png"),
        "-loop", "1", "-t", "2.5", "-i", str(frames / "slide_03.png"),
        "-loop", "1", "-t", "2.5", "-i", str(frames / "slide_04.png"),
        "-filter_complex",
        "[0:v]scale=1920:1080,setsar=1,fade=t=in:st=0:d=0.4[v0];"
        "[1:v]scale=1920:1080,setsar=1,fade=t=in:st=0:d=0.3[v1];"
        "[2:v]scale=1920:1080,setsar=1,fade=t=in:st=0:d=0.3[v2];"
        "[3:v]scale=1920:1080,setsar=1,fade=t=in:st=0:d=0.3[v3];"
        "[4:v]scale=1920:1080,setsar=1,fade=t=in:st=0:d=0.3[v4];"
        "[v0][v1]xfade=transition=fade:duration=0.35:offset=2.15[x01];"
        "[x01][v2]xfade=transition=fade:duration=0.35:offset=4.3[x02];"
        "[x02][v3]xfade=transition=fade:duration=0.35:offset=6.45[x03];"
        "[x03][v4]xfade=transition=fade:duration=0.35:offset=8.6[out]",
        "-map", "[out]", "-c:v", "libx264", "-crf", "14", "-preset", "slow",
        "-pix_fmt", "yuv420p", "-an", str(STOCK / "product.mp4"),
    ], capture_output=True)


def trim_grade(src, dst, start, length):
    run([
        "ffmpeg", "-y", "-ss", str(start), "-i", str(src), "-t", str(length),
        "-vf", WARM + ",fade=t=in:st=0:d=0.35,fade=t=out:st=" + str(max(0, length - 0.35)) + ":d=0.35",
        "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-an", str(dst),
    ], capture_output=True)


async def tts(voice, text, path):
    await edge_tts.Communicate(text, voice, rate="-5%", pitch="-2Hz").save(str(path))


def add_vo(vid, audio, out, pad=0.35):
    d = dur(vid)
    ms = int(pad * 1000)
    run([
        "ffmpeg", "-y", "-i", str(vid), "-i", str(audio),
        "-filter_complex", f"[1:a]adelay={ms}|{ms},apad=whole_dur={d},volume=0.92[a]",
        "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-t", str(d), str(out),
    ], capture_output=True)


def silent(vid, out):
    d = dur(vid)
    run([
        "ffmpeg", "-y", "-i", str(vid), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
        "-t", str(d), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
        "-b:a", "96k", "-shortest", str(out),
    ], capture_output=True)


def concat_clips(clips, out):
    lst = OUT / "concat.txt"
    lst.write_text("\n".join(f"file '{p.resolve()}'" for p in clips))
    run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
        "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out),
    ], capture_output=True)


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "audio").mkdir(exist_ok=True)
    scenes_dir = OUT / "scenes"
    scenes_dir.mkdir(exist_ok=True)

    print("stock...", flush=True)
    ensure_stock()
    print("product slides...", flush=True)
    capture_product_slides()

    built = []
    for sid, key, start, length, dlg in SCENES:
        raw = scenes_dir / f"{sid}_raw.mp4"
        if key == "product":
            src = STOCK / "product.mp4"
            run([
                "ffmpeg", "-y", "-i", str(src), "-t", str(length), "-vf", WARM,
                "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p",
                "-an", str(raw),
            ], capture_output=True)
        else:
            trim_grade(STOCK / f"{key}.mp4", raw, start, length)

        if dlg:
            voice, text = dlg
            mp3 = OUT / "audio" / f"{sid}.mp3"
            await tts(voice, text, mp3)
            final = scenes_dir / f"{sid}.mp4"
            add_vo(raw, mp3, final)
        else:
            final = scenes_dir / f"{sid}.mp4"
            silent(raw, final)
        built.append(final)
        print(f"  {sid} ok", flush=True)

    hq = OUT / "orvo24-v7-hq.mp4"
    print("concat...", flush=True)
    concat_clips(built, hq)

    srt = OUT / "subs.srt"
    lines = []
    for n, (a, b, t) in enumerate(SUBS, 1):
        def ts(s):
            h, m = divmod(int(s), 3600)
            m, s = divmod(m, 60)
            return f"{h:02d}:{m:02d}:{s:02d},000"
        lines += [str(n), f"{ts(a)} --> {ts(b)}", t, ""]
    srt.write_text("\n".join(lines))

    final = OUT / "orvo24-v7.mp4"
    run([
        "ffmpeg", "-y", "-i", str(hq),
        "-vf", f"subtitles={srt}:force_style='FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,"
               "OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=40'",
        "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", str(final),
    ], capture_output=True)

    web = OUT / "orvo24-v7-web.mp4"
    run([
        "ffmpeg", "-y", "-i", str(final), "-c:v", "libx264", "-crf", "20", "-preset", "slow",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(web),
    ], capture_output=True)
    print(f"DONE {web} ({web.stat().st_size // 1024 // 1024}MB)", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
