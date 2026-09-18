#!/usr/bin/env bats

@test "trivial: true returns 0" {
  run true
  [ "$status" -eq 0 ]
}

@test "can source lib.sh" {
  export NAME_DIR="testdata"
  export WGET_TIMEOUT="--connect-timeout=5"
  LIB_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  source "$LIB_DIR/lib.sh"
  [ "$(type -t sed_inplace)" = "function" ]
}
