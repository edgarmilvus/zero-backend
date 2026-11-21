#!/bin/sh
# Runs the gates the book can run today.
#
#   ./run_offline.sh chapter01    one chapter
#   ./run_offline.sh all          every chapter that has a harness
#
# For a chapter, always: its harness, then its five exercises. Both assert and
# exit non-zero, so this script is the only thing CI has to watch.
#
# Then, once chapters/<id>.md exists, the document checks run too: listings byte
# for byte, headings, run blocks, figures and the word floor. Before the prose is
# written there is nothing to check and the checks are skipped, not faked.
#
# Nothing here needs a key, a network call or a browser: the browser half of a
# measurement is recorded under runs/ and replayed by the chapter that owns it.

set -u

ROOT=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT" || exit 1

failed=0
ran=0

note() { printf '%-10s %s\n' "$1" "$2"; }

run_one() {
  id=$1                              # chapter01
  num=$2                             # 1
  dir="chapters/$id"

  if [ ! -f "$dir/files/run_ex$num.ts" ]; then
    note "$id" "skipped (no harness)"
    return 0
  fi

  ran=$((ran + 1))
  printf '\n=== %s ===\n' "$id"

  if ! node "$dir/files/run_ex$num.ts"; then
    note "$id" "FAILED harness"
    failed=1
    return 0
  fi

  if [ -f "$dir/files/exercises/run_exercises.ts" ]; then
    if ! node "$dir/files/exercises/run_exercises.ts"; then
      note "$id" "FAILED exercises"
      failed=1
      return 0
    fi
  fi

  if [ -f "chapters/$id.md" ] && [ -f tools/check_listings.py ]; then
    python3 tools/embed.py "$id" >/dev/null &&
      python3 tools/check_listings.py "$id" &&
      python3 tools/check_headings.py "$id" &&
      python3 tools/check_run_blocks.py "$id" &&
      python3 tools/check_figures.py "$id" &&
      python3 tools/check_words.py "$id" ||
      { note "$id" "FAILED document checks"; failed=1; return 0; }
  elif [ -f "chapters/$id.md" ]; then
    note "$id" "document checks skipped (the book's sources are not in this copy)"
  else
    note "$id" "document checks skipped (manuscript not in this copy)"
  fi

  if [ -f "$dir/files/browser/serve.mjs" ] && [ -f tools/check_headers.mjs ]; then
    if ! node tools/check_headers.mjs "$id"; then
      note "$id" "FAILED headers"
      failed=1
      return 0
    fi
  fi

  note "$id" "green"
}

case "${1:-all}" in
  all)
    for n in $(seq 1 20); do
      run_one "$(printf 'chapter%02d' "$n")" "$n"
    done
    ;;
  chapter*)
    id=$1
    num=${id#chapter}
    num=${num#0}
    run_one "$id" "$num"
    ;;
  *)
    echo "usage: run_offline.sh [all|chapterNN]" >&2
    exit 2
    ;;
esac

printf '\n'
if [ "$ran" -eq 0 ]; then
  echo "nothing to run: no chapter has a harness yet"
  exit 1
fi

if [ "$failed" -ne 0 ]; then
  echo "gate: FAILED"
  exit 1
fi

echo "gate: green ($ran chapter(s))"
