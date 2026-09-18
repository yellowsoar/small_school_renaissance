#!/usr/bin/env bats
# Minimal test to isolate CI failure

@test "trivial: true returns 0" {
  run true
  [ "$status" -eq 0 ]
}

@test "source lib.sh works" {
  export NAME_DIR="testdata"
  export WGET_TIMEOUT="--connect-timeout=5"
  LIB_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  source "$LIB_DIR/lib.sh"
  [ "$(type -t sed_inplace)" = "function" ]
}

@test "sed_inplace: basic" {
  export NAME_DIR="testdata"
  export WGET_TIMEOUT="--connect-timeout=5"
  LIB_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  source "$LIB_DIR/lib.sh"
  local tmpdir
  tmpdir=$(mktemp -d)
  echo "hello" > "$tmpdir/f.txt"
  sed_inplace "$tmpdir/f.txt" 's/hello/goodbye/'
  [ "$(cat "$tmpdir/f.txt")" = "goodbye" ]
  rm -rf "$tmpdir"
}
