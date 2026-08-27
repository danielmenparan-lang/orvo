#!/usr/bin/env bash
# English TTS for premium Meta ad (global EN campaign)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)/audio-en"
mkdir -p "$DIR"
export PATH="$HOME/.local/bin:$PATH"

edge-tts --voice en-US-GuyNeural --rate=+10% --volume=+50% \
  --text "Leaving already?" --write-media "$DIR/g1.mp3"
edge-tts --voice en-US-JennyNeural --rate=+10% --volume=+50% \
  --text "My agent finished my tasks." --write-media "$DIR/h1.mp3"
edge-tts --voice en-US-GuyNeural --rate=+10% --volume=+50% \
  --text "But you can't build an agent…" --write-media "$DIR/g2.mp3"
edge-tts --voice en-US-JennyNeural --rate=+10% --volume=+50% \
  --text "I use orvo24.com." --write-media "$DIR/h2.mp3"
edge-tts --voice en-US-JennyNeural --rate=+8% --volume=+40% \
  --text "ORVO. Hire vetted AI agent builders. Post. Quote. Pay on-platform." --write-media "$DIR/end-vo.mp3"
echo "English voice files in $DIR"
