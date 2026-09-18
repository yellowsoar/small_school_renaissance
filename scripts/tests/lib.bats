#!/usr/bin/env bats
# Unit tests for scripts/lib.sh shared helper functions.
# Requires: bats-core (https://github.com/bats-core/bats-core)

setup() {
  TEST_TMPDIR="$(mktemp -d)"
  cd "$TEST_TMPDIR" || return 1
  # NAME_DIR must be relative — convert_to_csv_if_needed() builds
  # paths with "./${NAME_DIR}/..." matching production behavior.
  export NAME_DIR="data"
  mkdir -p "$NAME_DIR"
  # WGET_TIMEOUT is required by check_file/download_file but not tested here
  export WGET_TIMEOUT="--connect-timeout=5 --read-timeout=10"

  LIB_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
  # shellcheck source=../lib.sh
  source "$LIB_DIR/lib.sh"
}

teardown() {
  rm -rf "$TEST_TMPDIR"
}

# ── sed_inplace ──────────────────────────────────────────────

@test "sed_inplace: successful substitution" {
  echo "hello world" > "$TEST_TMPDIR/f.txt"
  sed_inplace "$TEST_TMPDIR/f.txt" 's/hello/goodbye/'
  [ "$(cat "$TEST_TMPDIR/f.txt")" = "goodbye world" ]
}

@test "sed_inplace: cleans up tmpfile on sed failure" {
  echo "hello" > "$TEST_TMPDIR/f.txt"
  # Unterminated character class triggers a sed regex error
  run sed_inplace "$TEST_TMPDIR/f.txt" 's/[/x/'
  [ "$status" -ne 0 ]
  # Original file preserved
  [ "$(cat "$TEST_TMPDIR/f.txt")" = "hello" ]
  # No leftover tmpfiles (pattern: f.txt.XXXXXX)
  local leftover
  leftover=$(find "$TEST_TMPDIR" -name 'f.txt.*' | wc -l)
  [ "$leftover" -eq 0 ]
}

@test "sed_inplace: handles multi-line file" {
  printf "line1\nline2\nline3\n" > "$TEST_TMPDIR/f.txt"
  sed_inplace "$TEST_TMPDIR/f.txt" 's/line2/replaced/'
  grep -q "replaced" "$TEST_TMPDIR/f.txt"
  [ "$(wc -l < "$TEST_TMPDIR/f.txt" | tr -d ' ')" = "3" ]
}

# ── remove_rows_mismatch_header ──────────────────────────────

@test "remove_rows_mismatch_header: keeps all rows when columns match" {
  cat > "$TEST_TMPDIR/good.csv" <<'CSV'
name,age,city
Alice,30,Taipei
Bob,25,Kaohsiung
CSV
  run remove_rows_mismatch_header "$TEST_TMPDIR/good.csv"
  [ "$status" -eq 0 ]
  [ "$(wc -l < "$TEST_TMPDIR/good.csv" | tr -d ' ')" = "3" ]
  [[ "$output" == *"All rows match header"* ]]
}

@test "remove_rows_mismatch_header: removes rows with too few columns" {
  cat > "$TEST_TMPDIR/few.csv" <<'CSV'
name,age,city
Alice,30,Taipei
Bob,25
Charlie,28,Tainan
CSV
  remove_rows_mismatch_header "$TEST_TMPDIR/few.csv"
  [ "$(wc -l < "$TEST_TMPDIR/few.csv" | tr -d ' ')" = "3" ]
  ! grep -q "Bob" "$TEST_TMPDIR/few.csv"
}

@test "remove_rows_mismatch_header: removes rows with too many columns (#114)" {
  cat > "$TEST_TMPDIR/many.csv" <<'CSV'
name,age,city
Alice,30,Taipei
Bob,25,Kaohsiung,extra,fields
Charlie,28,Tainan
CSV
  remove_rows_mismatch_header "$TEST_TMPDIR/many.csv"
  [ "$(wc -l < "$TEST_TMPDIR/many.csv" | tr -d ' ')" = "3" ]
  ! grep -q "Bob" "$TEST_TMPDIR/many.csv"
}

@test "remove_rows_mismatch_header: preserves header-only file" {
  echo "name,age,city" > "$TEST_TMPDIR/hdr.csv"
  remove_rows_mismatch_header "$TEST_TMPDIR/hdr.csv"
  [ "$(wc -l < "$TEST_TMPDIR/hdr.csv" | tr -d ' ')" = "1" ]
  [ "$(cat "$TEST_TMPDIR/hdr.csv")" = "name,age,city" ]
}

@test "remove_rows_mismatch_header: logs removed row count" {
  cat > "$TEST_TMPDIR/mix.csv" <<'CSV'
name,age,city
Alice,30,Taipei
bad,row
another,bad
CSV
  run remove_rows_mismatch_header "$TEST_TMPDIR/mix.csv"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Removed 2 row(s)"* ]]
}

@test "remove_rows_mismatch_header: preserves rows with empty field values" {
  cat > "$TEST_TMPDIR/empty.csv" <<'CSV'
name,age,city
Alice,,Taipei
,25,
,,
CSV
  remove_rows_mismatch_header "$TEST_TMPDIR/empty.csv"
  # All rows have exactly 2 commas matching the header — all should survive
  [ "$(wc -l < "$TEST_TMPDIR/empty.csv" | tr -d ' ')" = "4" ]
}

# ── convert_to_csv_if_needed ─────────────────────────────────

@test "convert_to_csv_if_needed: returns 0 when CSV already exists" {
  echo "name,age" > "$NAME_DIR/existing.csv"
  run convert_to_csv_if_needed "existing"
  [ "$status" -eq 0 ]
}

@test "convert_to_csv_if_needed: returns 1 when no source file found" {
  run convert_to_csv_if_needed "nonexistent"
  [ "$status" -eq 1 ]
}

@test "convert_to_csv_if_needed: errors when NAME_DIR is unset" {
  unset NAME_DIR
  run convert_to_csv_if_needed "test"
  [ "$status" -ne 0 ]
}

# ── convert_to_csv_if_needed: empty CSV validation (#141) ────

@test "convert_to_csv_if_needed: returns 2 when converted CSV has only header (#141)" {
  # Create mock soffice that produces a header-only CSV
  mkdir -p "$TEST_TMPDIR/bin"
  cat > "$TEST_TMPDIR/bin/soffice" <<'MOCK'
#!/usr/bin/env bash
# Mock soffice: extract --outdir and source file, write header-only CSV
prev=""
outdir=""
src=""
for arg in "$@"; do
  if [ "$prev" = "--outdir" ]; then
    outdir="$arg"
  fi
  prev="$arg"
  src="$arg"
done
base=$(basename "$src")
base="${base%.*}.csv"
echo "name,age,city" > "${outdir}/${base}"
MOCK
  chmod +x "$TEST_TMPDIR/bin/soffice"
  export PATH="$TEST_TMPDIR/bin:$PATH"

  # Create dummy ODS source file to trigger conversion path
  echo "dummy" > "$NAME_DIR/headeronly.ods"

  run convert_to_csv_if_needed "headeronly"
  [ "$status" -eq 2 ]
  [[ "$output" == *"empty or has no data rows"* ]]
  # Empty CSV should be cleaned up
  [ ! -f "$NAME_DIR/headeronly.csv" ]
}

@test "convert_to_csv_if_needed: returns 2 when converted CSV is completely empty (#141)" {
  mkdir -p "$TEST_TMPDIR/bin"
  cat > "$TEST_TMPDIR/bin/soffice" <<'MOCK'
#!/usr/bin/env bash
prev=""
outdir=""
src=""
for arg in "$@"; do
  if [ "$prev" = "--outdir" ]; then
    outdir="$arg"
  fi
  prev="$arg"
  src="$arg"
done
base=$(basename "$src")
base="${base%.*}.csv"
touch "${outdir}/${base}"
MOCK
  chmod +x "$TEST_TMPDIR/bin/soffice"
  export PATH="$TEST_TMPDIR/bin:$PATH"

  echo "dummy" > "$NAME_DIR/emptyfile.ods"

  run convert_to_csv_if_needed "emptyfile"
  [ "$status" -eq 2 ]
  [[ "$output" == *"empty or has no data rows"* ]]
  [ ! -f "$NAME_DIR/emptyfile.csv" ]
}

@test "convert_to_csv_if_needed: returns 0 when converted CSV has data rows (#141)" {
  mkdir -p "$TEST_TMPDIR/bin"
  cat > "$TEST_TMPDIR/bin/soffice" <<'MOCK'
#!/usr/bin/env bash
prev=""
outdir=""
src=""
for arg in "$@"; do
  if [ "$prev" = "--outdir" ]; then
    outdir="$arg"
  fi
  prev="$arg"
  src="$arg"
done
base=$(basename "$src")
base="${base%.*}.csv"
printf "name,age,city\nAlice,30,Taipei\n" > "${outdir}/${base}"
MOCK
  chmod +x "$TEST_TMPDIR/bin/soffice"
  export PATH="$TEST_TMPDIR/bin:$PATH"

  echo "dummy" > "$NAME_DIR/valid.ods"

  run convert_to_csv_if_needed "valid"
  [ "$status" -eq 0 ]
  [ -f "$NAME_DIR/valid.csv" ]
}
