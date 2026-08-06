#!/usr/bin/env bash
#
# Rebuild the served site into the repository root.
#
# GitHub Pages is set to publish this branch's root, so a merge changes
# nothing on its own - the export has to be rebuilt and committed. This does
# that in one step, and does the one thing a plain copy gets wrong: `_next` is
# deleted first. Its filenames carry a content hash, so copying over the top
# leaves every previous build's chunks behind for ever, and the stale ones are
# indistinguishable from the live ones by eye.
#
# This should not be needed for long. Point Pages at the gh-pages branch or at
# GitHub Actions and deploy-pages.yml owns publishing again, at which point
# these files come back out of the tree.
#
# Usage: scripts/publish.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "building…"
rm -rf out
GITHUB_PAGES=true npm run build >/dev/null

# Hashed filenames never collide, so nothing but a delete clears the old ones.
rm -rf _next
cp -a out/. .
rm -rf out

# Jekyll skips directories beginning with an underscore, which would drop
# _next entirely and serve a page with no JavaScript or styling.
touch .nojekyll

# Every asset the pages ask for has to actually be here, or the site loads
# half-built and it is not obvious from looking at it.
missing=0
for page in ./*.html; do
  while read -r asset; do
    [ -f "$asset" ] || { echo "MISSING $asset (referenced by $page)"; missing=1; }
  done < <(grep -o '/TimekeepingOC/_next/[^"]*\.\(js\|css\)' "$page" | sed 's#^/TimekeepingOC/##' | sort -u)
done
[ "$missing" -eq 0 ] || { echo "refusing to publish an incomplete build"; exit 1; }

echo "built $(ls ./*.html | wc -l) pages, $(du -sh _next | cut -f1) of assets, all references resolve"
