#!/usr/bin/env bash
# Regenerate web assets from the Python demos.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

source .venv/bin/activate 2>/dev/null || python3 -m venv .venv && source .venv/bin/activate
pip install -q numpy matplotlib pydantic cadquery

mkdir -p out docs/assets
python3 router.py
python3 geometry.py
python3 demo2.py
python3 render2.py
python3 demo3.py

cp out/*.png out/*.json out/*.step docs/assets/

echo "Web assets copied to docs/assets/"
