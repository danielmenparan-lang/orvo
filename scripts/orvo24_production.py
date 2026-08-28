#!/usr/bin/env python3
"""
ORVO24 cinematic ad — character-first pipeline.
1. Generate reference stills (flux-schnell)
2. Animate with minimax/video-01 image-to-video
Budget target: <= $5
"""
import json
import os
import time
import urllib.request
from pathlib import Path

API = os.environ["Daniel"]
OUT = Path("/workspace/assets/orvo24")
OUT.mkdir(parents=True, exist_ok=True)

FLUX_MODEL = "black-forest-labs/flux-schnell"
VIDEO_MODEL = "minimax/video-01"

STYLE = (
    "GTA V cinematic game cutscene style, photorealistic 3D render, warm orange ambient lighting, "
    "modern futuristic startup office, shallow depth of field, film grain, dramatic camera, "
    "hyperreal human skin, natural motion blur, 4K quality"
)

SCENES = [
    {
        "id": "01_office",
        "image_prompt": (
            f"{STYLE}, wide establishing shot, long conference table with 8 diverse professionals "
            "working on open laptops, glass walls, orange neon accents, space-age startup interior, "
            "afternoon golden light, everyone focused on screens"
        ),
        "video_prompt": (
            "Slow cinematic dolly push-in, 8 people typing on laptops at long table, subtle head movements, "
            "natural office ambience, warm orange lighting, realistic human motion"
        ),
        "use_subject": False,
    },
    {
        "id": "02_packing",
        "image_prompt": (
            f"{STYLE}, medium shot, same woman as reference — confident young Israeli woman late 20s, dark hair ponytail, "
            "white blouse, packing laptop and notebook into bag at conference table, orange startup office, "
            "coworkers blurred in background"
        ),
        "video_prompt": (
            "Woman smoothly packs her bag, picks up items, natural hand movements, stands slightly, "
            "confident expression, coworkers visible behind, cinematic medium shot"
        ),
        "use_subject": True,
    },
    {
        "id": "03_guy_asks",
        "image_prompt": (
            f"{STYLE}, close-medium shot, young man early 30s at conference table, surprised curious face, "
            "leaning forward, pointing at watch, orange-lit startup office, laptops on table"
        ),
        "video_prompt": (
            "Man leans forward speaking with surprised expression, subtle head tilt, realistic lip movement, "
            "gestures toward watch, cinematic dialogue moment"
        ),
        "use_subject": False,
    },
    {
        "id": "04_hero_reply",
        "image_prompt": (
            f"{STYLE}, close-up, same woman — confident young Israeli woman smiling, holding bag, turning to camera, "
            "orange warm office bokeh background, proud expression"
        ),
        "video_prompt": (
            "Woman smiles confidently while speaking, natural lip sync motion, slight head nod, "
            "holds bag, warm orange cinematic lighting"
        ),
        "use_subject": True,
    },
    {
        "id": "05_skeptic",
        "image_prompt": (
            f"{STYLE}, medium shot, skeptical male coworker at table, arms crossed, raised eyebrow, "
            "other team members listening, orange startup office, laptops open"
        ),
        "video_prompt": (
            "Man speaks skeptically with confused expression, subtle hand gesture, coworkers glance between "
            "each other, natural group reaction"
        ),
        "use_subject": False,
    },
    {
        "id": "06_phone",
        "image_prompt": (
            f"{STYLE}, close-up, same woman holds smartphone toward camera, screen shows ORVO24 website "
            "with orange branding and 'AI Agent Marketplace' text, confident smile, office background"
        ),
        "video_prompt": (
            "Woman lifts smartphone toward camera showing website on screen, slight hand movement, "
            "confident smile, product demo moment, natural motion"
        ),
        "use_subject": True,
    },
]

SUBTITLES = [
    (0, 5, ""),
    (5, 10, "היא אורזת לצאת..."),
    (10, 15, "אבל 4:30, למה את הולכת?"),
    (15, 20, "הסוכן שלי מסיים לי את העבודה"),
    (20, 25, "אבל את לא יודעת לבנות סוכן"),
    (25, 30, "פשוט נכנסתי ל-orvo24.com"),
]


def api(method, url, data=None, retries=5):
    body = json.dumps(data).encode() if data is not None else None
    for attempt in range(retries):
        req = urllib.request.Request(
            url, data=body, method=method,
            headers={"Authorization": f"Bearer {API}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (502, 503, 504) and attempt < retries - 1:
                print(f"  api retry {attempt+1} ({e.code})", flush=True)
                time.sleep(15 * (attempt + 1))
                continue
            raise


def create_prediction(model, inp):
    return api("POST", f"https://api.replicate.com/v1/models/{model}/predictions", {"input": inp})


def poll(url, label=""):
    while True:
        for attempt in range(5):
            try:
                p = api("GET", url)
                break
            except urllib.error.HTTPError as e:
                if e.code in (502, 503, 504) and attempt < 4:
                    print(f"  [{label}] retry {attempt+1} ({e.code})", flush=True)
                    time.sleep(15 * (attempt + 1))
                    continue
                raise
        s = p["status"]
        print(f"  [{label}] {s}", flush=True)
        if s == "succeeded":
            return p["output"]
        if s in ("failed", "canceled"):
            raise RuntimeError(f"{label} failed: {p.get('error')}")
        time.sleep(12)


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "orvo24/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        path.write_bytes(r.read())


def local_image_url(path):
    import base64
    data = Path(path).read_bytes()
    mime = "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def generate_image(prompt, out_path):
    if out_path.exists():
        print(f"  reuse image {out_path.name}", flush=True)
        return local_image_url(out_path)
    pred = create_prediction(FLUX_MODEL, {"prompt": prompt, "aspect_ratio": "16:9", "num_outputs": 1})
    url = poll(pred["urls"]["get"], out_path.stem)
    img_url = url[0] if isinstance(url, list) else url
    download(img_url, out_path)
    print(f"  saved {out_path}", flush=True)
    return img_url


def generate_video(scene, image_url):
    vid_path = OUT / f"{scene['id']}.mp4"
    if vid_path.exists():
        print(f"  skip video {vid_path.name}", flush=True)
        return vid_path

    inp = {
        "prompt": scene["video_prompt"],
        "first_frame_image": image_url,
        "prompt_optimizer": True,
    }
    # minimax: cannot combine first_frame_image + subject_reference

    pred = create_prediction(VIDEO_MODEL, inp)
    url = poll(pred["urls"]["get"], scene["id"])
    download(url, vid_path)
    print(f"  saved {vid_path}", flush=True)
    return vid_path


def main():
    manifest = {"scenes": [], "style": STYLE}

    # Step 1: hero character reference
    hero_path = OUT / "hero_ref.jpg"
    if not hero_path.exists():
        generate_image(
            f"{STYLE}, character reference portrait, confident young Israeli woman late 20s, "
            "dark hair ponytail, white blouse, friendly smile, neutral background, full upper body",
            hero_path,
        )
    else:
        print("  skip hero_ref (exists)", flush=True)
    manifest["hero_ref"] = str(hero_path)

    videos = []
    for scene in SCENES:
        print(f"\n=== {scene['id']} ===", flush=True)
        img_path = OUT / f"{scene['id']}_frame.jpg"
        vid_path = OUT / f"{scene['id']}.mp4"
        if vid_path.exists():
            print(f"  skip video {vid_path.name}", flush=True)
            videos.append(vid_path)
            manifest["scenes"].append({"id": scene["id"], "image": str(img_path), "video": str(vid_path)})
            continue
        img_url = generate_image(scene["image_prompt"], img_path)
        vid = generate_video(scene, img_url)
        videos.append(vid)
        manifest["scenes"].append({"id": scene["id"], "image": str(img_path), "video": str(vid)})

    # Step 3: concat
    concat_file = OUT / "concat.txt"
    concat_file.write_text("\n".join(f"file '{v}'" for v in videos))
    raw = OUT / "orvo24-raw.mp4"
    os.system(f"ffmpeg -y -f concat -safe 0 -i '{concat_file}' -c copy '{raw}' 2>/dev/null")

    # Step 4: subtitles
    srt = OUT / "subs.srt"
    lines = []
    for i, (start, end, text) in enumerate(SUBTITLES):
        if not text:
            continue
        def ts(sec):
            h, m = divmod(int(sec), 3600)
            m, s = divmod(m, 60)
            return f"{h:02d}:{m:02d}:{s:02d},000"
        lines += [str(i + 1), f"{ts(start)} --> {ts(end)}", text, ""]
    srt.write_text("\n".join(lines))

    final = OUT / "orvo24-story.mp4"
    os.system(
        f"ffmpeg -y -i '{raw}' -vf \"subtitles='{srt}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,"
        f"OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=1,Alignment=2,MarginV=40'\" "
        f"-c:v libx264 -c:a copy '{final}' 2>/dev/null"
    )

    manifest["final"] = str(final)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nDONE: {final}", flush=True)


if __name__ == "__main__":
    main()
