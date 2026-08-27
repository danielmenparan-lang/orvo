#!/usr/bin/env bash
# Hebrew TTS for Meta ad — requires: pip install edge-tts
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)/audio"
mkdir -p "$DIR"
export PATH="$HOME/.local/bin:$PATH"
edge-tts --voice he-IL-AvriNeural --text "רגע, לא מוקדם?" --write-media "$DIR/g1.mp3"
edge-tts --voice he-IL-HilaNeural --text "הסוכן שלי סיים לי את המשימות." --write-media "$DIR/h1.mp3"
edge-tts --voice he-IL-AvriNeural --text "אבל את לא יודעת לבנות סוכן…" --write-media "$DIR/g2.mp3"
edge-tts --voice he-IL-HilaNeural --text "נכנסתי ל-orvo24.com" --write-media "$DIR/h2.mp3"
edge-tts --voice he-IL-HilaNeural --text "ORVO — מרקטפלייס לסוכני AI. בונים מאומתים. אתה מפרסם, הם בונים." --write-media "$DIR/end-vo.mp3"
echo "Voice files in $DIR"
