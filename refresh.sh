#!/usr/bin/env bash
# One scrape: all sites side by side, fetching details only for new ids. Every list pass takes minutes, so each refreshes every run.
BOX=37.12,126.6,37.8,127.4
dabang() {
  rm -f next.json; ok=1
  for c in apt officetel; do for t in MONTHLY_RENT LEASE; do
    node dabang_export.js --category $c --types $t --bbox $BOX --level list --out next.json 2>/dev/null || ok=0
  done; done
  if [ $ok = 1 ]; then mv next.json dabang_rentals.json; else echo "dabang list failed, keeping the old one"; fi
  [ -f dabang_rentals.json ] && node dabang_details.js
}
dabang &
node zigbang_export.js &
node 33m2_export.js &
wait
