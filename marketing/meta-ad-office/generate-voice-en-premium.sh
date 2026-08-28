#!/usr/bin/env bash
# Premium English VO — Andrew/Emma Multilingual + studio polish
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)/audio-en-premium"
mkdir -p "$DIR"
export PATH="$HOME/.local/bin:$PATH"

post() {
  ffmpeg -y -i "$1" -af \
    "highpass=f=85,lowpass=f=13000,\
     equalizer=f=200:t=q:w=1:g=2,\
     equalizer=f=3000:t=q:w=1.2:g=1.8,\
     acompressor=threshold=-18dB:ratio=3:attack=5:release=80:makeup=2" \
    -ar 48000 -c:a libmp3lame -b:a 320k "$2" 2>/dev/null
}

gen() {
  local voice="$1" rate="$2" pitch="$3" text="$4" file="$5"
  edge-tts --voice "$voice" --rate="$rate" --pitch="$pitch" --volume="+25%" \
    --text "$text" --write-media "$DIR/${file}.raw.mp3" 2>/dev/null
  post "$DIR/${file}.raw.mp3" "$DIR/${file}.mp3"
  rm -f "$DIR/${file}.raw.mp3"
}

gen "en-US-AndrewMultilingualNeural"  "-4%"  "+1Hz" "Wait… you're leaving already?" "g1"
gen "en-US-EmmaMultilingualNeural"    "-2%"  "+2Hz" "My agent finished all my tasks." "h1"
gen "en-US-AndrewMultilingualNeural"  "-6%"  "-1Hz" "But… you can't build an agent…" "g2"
gen "en-US-EmmaMultilingualNeural"    "+0%"  "+3Hz" "I just use orvo24.com." "h2"
gen "en-US-EmmaMultilingualNeural"    "-3%"  "+0Hz" "ORVO. Hire vetted AI agent builders. Post, quote, pay on platform." "end-vo"

echo "Premium voice:"
for f in g1 h1 g2 h2 end-vo; do
  printf "  %-8s %ss\n" "$f" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$DIR/$f.mp3")"
done
