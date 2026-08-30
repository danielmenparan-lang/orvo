#!/usr/bin/env python3
"""Export minimal ORVO24 end card (0:17-0:20) from orvo24-endcard.html."""
import subprocess
from pathlib import Path

ROOT = Path("/workspace")
HTML = ROOT / "orvo24-endcard.html"
OUT = ROOT / "assets/orvo24/v8"
CHROME = "/usr/local/bin/google-chrome"


def chrome_shot(out, url):
    profile = OUT / ".chrome"
    profile.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "timeout", "12", CHROME, "--headless=new", "--no-sandbox", "--disable-gpu",
        f"--user-data-dir={profile}", "--virtual-time-budget=800",
        "--run-all-compositor-stages-before-draw", "--window-size=1920,1080",
        f"--screenshot={out}", url,
    ], capture_output=True)
    if not out.exists() or out.stat().st_size < 5000:
        raise RuntimeError(f"screenshot failed: {out}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    frames = OUT / "frames"
    frames.mkdir(exist_ok=True)
    for i in range(3):
        chrome_shot(frames / f"e{i}.png", HTML.as_uri() + f"?slide={i}")
    # 3s total: logo 1s, tagline 1s, url 1s, soft fades
    subprocess.run([
        "ffmpeg", "-y",
        "-loop", "1", "-t", "1.15", "-i", str(frames / "e0.png"),
        "-loop", "1", "-t", "1.15", "-i", str(frames / "e1.png"),
        "-loop", "1", "-t", "1.15", "-i", str(frames / "e2.png"),
        "-filter_complex",
        "[0:v]scale=1920:1080,setsar=1,fade=t=in:st=0:d=0.25,fade=t=out:st=0.9:d=0.25[v0];"
        "[1:v]scale=1920:1080,setsar=1,fade=t=in:st=0:d=0.2,fade=t=out:st=0.95:d=0.2[v1];"
        "[2:v]scale=1920:1080,setsar=1,fade=t=in:st=0:d=0.2,fade=t=out:st=0.95:d=0.2[v2];"
        "[v0][v1]xfade=transition=fade:duration=0.25:offset=0.9[x01];"
        "[x01][v2]xfade=transition=fade:duration=0.25:offset=2.05[out]",
        "-map", "[out]", "-c:v", "libx264", "-crf", "14", "-preset", "slow",
        "-pix_fmt", "yuv420p", "-an", str(OUT / "endcard.mp4"),
    ], check=True, capture_output=True)
    print(f"OK {OUT / 'endcard.mp4'}")


if __name__ == "__main__":
    main()
