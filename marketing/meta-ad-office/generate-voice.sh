#!/usr/bin/env bash
# Hebrew TTS — loud, clear voices for Meta ad
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)/audio"
mkdir -p "$DIR"
export PATH="$HOME/.local/bin:$PATH"

edge-tts --voice he-IL-AvriNeural --rate=+8% --volume=+50% \
  --text "רגע, לא מוקדם?" --write-media "$DIR/g1-loud.mp3"
edge-tts --voice he-IL-HilaNeural --rate=+8% --volume=+50% \
  --text "הסוכן שלי סיים לי את המשימות." --write-media "$DIR/h1-loud.mp3"
edge-tts --voice he-IL-AvriNeural --rate=+8% --volume=+50% \
  --text "אבל את לא יודעת לבנות סוכן…" --write-media "$DIR/g2-loud.mp3"
edge-tts --voice he-IL-HilaNeural --rate=+8% --volume=+50% \
  --text "נכנסתי ל-orvo24.com" --write-media "$DIR/h2-loud.mp3"
edge-tts --voice he-IL-HilaNeural --rate=+5% --volume=+35% \
  --text "ORVO. מרקטפלייס לסוכני AI." --write-media "$DIR/end-vo-short.mp3"

# Legacy filenames for older scripts
cp -f "$DIR/g1-loud.mp3" "$DIR/g1.mp3"
cp -f "$DIR/h1-loud.mp3" "$DIR/h1.mp3"
cp -f "$DIR/g2-loud.mp3" "$DIR/g2.mp3"
cp -f "$DIR/h2-loud.mp3" "$DIR/h2.mp3"
echo "Voice files ready in $DIR"
