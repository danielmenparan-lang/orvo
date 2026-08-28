#!/usr/bin/env bash
set -euo pipefail

API_TOKEN="${Daniel:?Daniel secret not set}"
MODEL="minimax/video-01"
VERSION="5aa835260ff7f40f4069c41185f72036accf99e29957bb4a3b3a911f3b6c1912"
OUT_DIR="/workspace/assets/videos"
mkdir -p "$OUT_DIR"

declare -A PROMPTS=(
  [meeting]="Modern startup office meeting room, diverse team at conference table, warm natural light, subtle camera push-in, people shift and listen attentively, cinematic, realistic human motion, orange accent decor on walls"
  [leave]="Professional woman in business casual stands up and walks away from conference table toward door, confident smile, coworkers watch, smooth natural walking motion, bright startup office with orange accents"
  [guy]="Man at office meeting table reacts surprised, leans forward slightly, speaks with confused expression, subtle head movement, realistic lip motion, cinematic close-medium shot, startup office background"
  [phone]="Woman holds smartphone up toward camera showing a website on the screen, slight hand lift motion, confident smile, office meeting background, natural human movement, product demo moment"
  [nods]="Office team at meeting table nods in agreement, subtle approving head movements, warm collaborative startup vibe, realistic group reaction, orange accent decor"
)

create_prediction() {
  local key="$1"
  local prompt="${PROMPTS[$key]}"
  curl -s -X POST "https://api.replicate.com/v1/predictions" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"version\":\"$VERSION\",\"input\":{\"prompt\":$(python3 -c "import json; print(json.dumps('$prompt'))"),\"prompt_optimizer\":true}}"
}

poll_prediction() {
  local url="$1"
  while true; do
    local resp
    resp=$(curl -s -H "Authorization: Bearer $API_TOKEN" "$url")
    local status
    status=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
    if [[ "$status" == "succeeded" ]]; then
      echo "$resp"
      return 0
    elif [[ "$status" == "failed" || "$status" == "canceled" ]]; then
      echo "FAILED: $resp" >&2
      return 1
    fi
    sleep 15
  done
}

echo "Starting 5 video generations..."
declare -A PRED_URLS
for key in meeting leave guy phone nods; do
  resp=$(create_prediction "$key")
  id=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  url=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['urls']['get'])")
  PRED_URLS[$key]="$url"
  echo "Started $key -> $id"
done

echo "Polling for completion (this may take several minutes)..."
declare -A VIDEO_URLS
for key in meeting leave guy phone nods; do
  echo "Waiting for $key..."
  resp=$(poll_prediction "${PRED_URLS[$key]}")
  out=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['output'])")
  VIDEO_URLS[$key]="$out"
  echo "Done $key -> $out"
  curl -sL "$out" -o "$OUT_DIR/$key.mp4"
  echo "Saved $OUT_DIR/$key.mp4"
done

python3 - <<'PY'
import json, os
out_dir = "/workspace/assets/videos"
manifest = {}
for name in ["meeting", "leave", "guy", "phone", "nods"]:
    path = f"{out_dir}/{name}.mp4"
    if os.path.isfile(path):
        manifest[name] = f"assets/videos/{name}.mp4"
with open("/workspace/assets/videos/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)
print("Manifest written")
PY

echo "All videos generated."
