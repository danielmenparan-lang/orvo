#!/usr/bin/env python3
"""Wait for Replicate credits, then run orvo24_v6.py."""
import json
import os
import subprocess
import time
import urllib.error
import urllib.request

API = os.environ["Daniel"]


def has_credit():
    req = urllib.request.Request(
        "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
        data=json.dumps({"input": {"prompt": "credit check"}}).encode(),
        method="POST",
        headers={"Authorization": f"Bearer {API}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            pred = json.loads(r.read())
        pid = pred["id"]
        req2 = urllib.request.Request(
            f"https://api.replicate.com/v1/predictions/{pid}/cancel",
            method="POST",
            headers={"Authorization": f"Bearer {API}"},
        )
        try:
            urllib.request.urlopen(req2, timeout=10)
        except Exception:
            pass
        return True
    except urllib.error.HTTPError as e:
        if e.code == 402:
            return False
        if e.code == 429:
            return True
        raise


def main():
    print("Waiting for Replicate credits on Daniel token...", flush=True)
    for i in range(120):
        if has_credit():
            print("Credits detected — starting v6 production!", flush=True)
            subprocess.run(["python3", "-u", "scripts/orvo24_v6.py"], check=True)
            return
        print(f"  still 402 (try {i+1}/120), sleep 30s", flush=True)
        time.sleep(30)
    raise SystemExit("No credits after 60 minutes — check Daniel token matches paid account")


if __name__ == "__main__":
    main()
