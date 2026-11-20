#!/usr/bin/env bash
# Downloads every image the site uses from the old Squarespace CDN into public/images/.
# Run once from the repository root:  bash scripts/fetch-images.sh
# Already-downloaded files are skipped, so it is safe to re-run.
set -u
cd "$(dirname "$0")/.."
fail=0
while read -r url path; do
  [ -z "$url" ] && continue
  [ -s "$path" ] && continue
  mkdir -p "$(dirname "$path")"
  if curl -fsSL --retry 3 -o "$path" "$url"; then echo "ok   $path"; else echo "FAIL $url"; rm -f "$path"; fail=$((fail+1)); fi
done < scripts/images.txt
echo "Done. $fail failed."
