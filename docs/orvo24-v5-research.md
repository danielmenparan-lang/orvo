# ORVO24 v5 Research — Human-realistic pleasant video

## Findings (Aug 2026)

### Visual realism
- **Documentary photojournalism** prompts (Magnum-style, pores, candid) beat "cinematic beauty" for human feel.
- **Character style refs** (ideogram v3 + v2 portraits) lock identity.
- **Neutral white balance** + soft window light > heavy orange grade (orange reads AI; green cast from aggressive colorbalance).
- **Kling v2.1 Pro** on Replicate: best available i2v with speaking motion; Kling 3 native audio not on Replicate yet.

### Lip sync
- **kwaivgi/kling-lip-sync**: audio2video via `video_url` + `audio_file` (HTTPS URI, mp3 <5MB).
- Keep lines **8–12 words / 5s** for reliable sync (English best).
- Pipeline: Kling i2v → TTS mp3 → upload audio URL → lip-sync → download.

### Voice
- **edge-tts** multilingual US voices, rate +0%, natural pauses.
- Tom: AndrewMultilingual, Maya: AvaMultilingual, Alex: BrianMultilingual.

### Color (pleasant, not tiring)
- Subtle warmth only: brightness +0.03, saturation 1.10, minimal colorbalance.
- Avoid teal/orange extremes; target accurate skin tones.

### Negative prompts (always)
- plastic skin, doll face, AI generated, beauty filter, green tint, teal, oversaturated orange, blurry, distorted, cartoon, uncanny valley
