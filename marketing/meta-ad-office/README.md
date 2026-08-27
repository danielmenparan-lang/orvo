# Meta ad — office skit (record to MP4)

**Preview:** open `index.html` in Chrome full screen.

## Automated render (MP4)

```bash
cd marketing/meta-ad-office
npm install
npx playwright install chromium
npm run render
```

Output: `output/orvo24-meta-ad-18s.mp4` (1080×1920, ~18s). Uses the **2D CSS demo** (`index.html?render=1`) — reliable in headless CI. The Three.js demo (`gta-style-3d.html`) needs a real browser with WebGL for recording.

## Record (Mac)

1. Open `marketing/meta-ad-office/index.html`
2. Chrome → View → Enter Full Screen (or F11)
3. QuickTime → File → New Screen Recording → select window
4. Crop to 9:16 in CapCut / Premiere if needed

## Record (Windows)

OBS → Source: Window Capture → 1080×1920 canvas → Start Recording.

## Add voice

Script: `docs/marketing/META-AD-OFFICE-18S.md`

- Record 2 voices (גיא + נועה) or one narrator
- Music: royalty-free lo-fi, low under dialogue
- **Always burn Hebrew subtitles** — most Meta views are muted

## Upload to Meta

- Ratio: **9:16** primary
- Length: this demo is **18s**
- Link: https://orvo24.com?utm_source=meta&utm_medium=paid&utm_campaign=office_skit_v1

## Upgrade path

| Level | What |
|-------|------|
| **CSS demo** | `index.html` — flat illustrated scene |
| **3D demo (GTA-inspired)** | `gta-style-3d.html` — Three.js, third-person camera, walk cycle, office — **not Rockstar GTA** |
| **Broadcast** | Remotion export, or motion studio / real actors |

For broadcast-quality AAA 3D: Blender + mocap + Unreal — weeks of work, not one HTML file.
