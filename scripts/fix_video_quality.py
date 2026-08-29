#!/usr/bin/env python3
"""Re-export ORVO24 final video at uniform 1080p with minimal quality loss."""
import subprocess
from pathlib import Path

OUT = Path("/workspace/assets/orvo24/final")
SCENES = [
    "01_office.mp4",
    "02_packing.mp4",
    "03_tom_asks.mp4",
    "04_maya_reply.mp4",
    "05_alex_skeptic.mp4",
    "06_maya_phone.mp4",
]

# Scale to 1080p, pad to 16:9, light sharpen
VF = (
    "scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,"
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,"
    "unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.45"
)

subs = OUT / "subs.srt"
scaled = []

print("Scaling scenes to 1080p...", flush=True)
for i, name in enumerate(SCENES):
    src = OUT / name
    dst = OUT / f"scaled_{i:02d}.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(src),
        "-vf", VF,
        "-c:v", "libx264", "-crf", "14", "-preset", "slow",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        str(dst),
    ], check=True, capture_output=True)
    scaled.append(dst)
    print(f"  {name} -> {dst.name}", flush=True)

concat = OUT / "concat_scaled.txt"
concat.write_text("\n".join(f"file '{p}'" for p in scaled))

hq = OUT / "orvo24-final-hq.mp4"
print("Concatenating...", flush=True)
subprocess.run([
    "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
    "-c", "copy", str(hq),
], check=True, capture_output=True)

final = OUT / "orvo24-final.mp4"
print("Burning subtitles...", flush=True)
subprocess.run([
    "ffmpeg", "-y", "-i", str(hq),
    "-vf", f"subtitles={subs}:force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Alignment=2,MarginV=48'",
    "-c:v", "libx264", "-crf", "14", "-preset", "slow",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    str(final),
], check=True, capture_output=True)

for p in scaled:
    p.unlink()
concat.unlink()

subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "stream=width,height,bit_rate",
                "-of", "csv=p=0", str(final)], check=False)
print(f"DONE: {final} ({final.stat().st_size // 1024 // 1024}MB)", flush=True)
