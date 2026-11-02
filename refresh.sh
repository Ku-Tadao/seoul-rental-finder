#!/usr/bin/env bash
# One scrape: both sites side by side, fetching details only for new ids. Dabang's list takes minutes so it refreshes every run; Zigbang's takes hours so it refreshes daily.
BOX=37.25,126.6,37.8,127.4
dabang() {
  if [ -z "$(find dabang_rentals.json -mmin -240 2>/dev/null)" ]; then
    rm -f next.json; ok=1
    for c in apt officetel; do for t in MONTHLY_RENT LEASE; do
      node dabang_export.js --category $c --types $t --bbox $BOX --level list --out next.json 2>/dev/null || ok=0
    done; done
    if [ $ok = 1 ]; then mv next.json dabang_rentals.json; else echo "dabang list failed, keeping the old one"; fi
  fi
  [ -f dabang_rentals.json ] && node dabang_details.js
}
dabang &
node zigbang_export.js &
wait
