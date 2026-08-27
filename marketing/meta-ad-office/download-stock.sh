#!/usr/bin/env bash
# Download Mixkit stock clips used by compose-ad.mjs (run once)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)/stock"
mkdir -p "$DIR"
base="https://assets.mixkit.co/videos"
curl -sL -o "$DIR/clip5.mp4" "$base/918/918-1080.mp4"
curl -sL -o "$DIR/v42648.mp4" "$base/42648/42648-1080.mp4"
curl -sL -o "$DIR/bw1.mp4" "$base/42660/42660-1080.mp4"
curl -sL -o "$DIR/bw2.mp4" "$base/42664/42664-1080.mp4"
echo "Stock clips in $DIR"
