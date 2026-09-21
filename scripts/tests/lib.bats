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

# ── sed_inplace ──────────────────────────────────────────────────────────────────────────────────

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

@test "sed_inplace: preserves original file permissions (#218)" {
  echo "hello world" > "$TEST_TMPDIR/f.txt"
  chmod 0644 "$TEST_TMPDIR/f.txt"
  sed_inplace "$TEST_TMPDIR/f.txt" 's/hello/goodbye/'
  # Content replaced correctly
  [ "$(cat "$TEST_TMPDIR/f.txt")" = "goodbye world" ]
  # Permission mode preserved (not downgraded to mktemp default 0600)
  local mode
  mode=$(stat -c '%a' "$TEST_TMPDIR/f.txt" 2>/dev/null || stat -f '%Lp' "$TEST_TMPDIR/f.txt" 2>/dev/null)
  [ "$mode" = "644" ]
}

# ── remove_rows_mismatch_header ────────────────────────────────────────

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

@test "remove_rows_mismatch_header: preserves rows with quoted commas (#170)" {
  cat > "$TEST_TMPDIR/quoted.csv" <<'CSV'
name,age,address
Alice,30,"Taipei, Taiwan"
Bob,25,Kaohsiung
CSV
  run remove_rows_mismatch_header "$TEST_TMPDIR/quoted.csv"
  [ "$status" -eq 0 ]
  [ "$(wc -l < "$TEST_TMPDIR/quoted.csv" | tr -d ' ')" = "3" ]
  grep -q "Alice" "$TEST_TMPDIR/quoted.csv"
  grep -q "Taipei, Taiwan" "$TEST_TMPDIR/quoted.csv"
  [[ "$output" == *"All rows match header"* ]]
}

@test "remove_rows_mismatch_header: preserves rows with escaped quotes (#170)" {
  cat > "$TEST_TMPDIR/escaped.csv" <<'CSV'
name,age,note
Alice,30,"She said ""hello"""
Bob,25,normal
CSV
  run remove_rows_mismatch_header "$TEST_TMPDIR/escaped.csv"
  [ "$status" -eq 0 ]
  [ "$(wc -l < "$TEST_TMPDIR/escaped.csv" | tr -d ' ')" = "3" ]
  grep -q "Alice" "$TEST_TMPDIR/escaped.csv"
  grep -q "Bob" "$TEST_TMPDIR/escaped.csv"
  [[ "$output" == *"All rows match header"* ]]
}

@test "remove_rows_mismatch_header: preserves multi-line quoted fields (#185)" {
  # RFC 4180 §2 rule 6: fields may contain line breaks if enclosed in quotes
  printf 'name,age,address\nAlice,30,"123 Main St\nFloor 2"\nBob,25,Kaohsiung\n' > "$TEST_TMPDIR/multiline.csv"
  run remove_rows_mismatch_header "$TEST_TMPDIR/multiline.csv"
  [ "$status" -eq 0 ]
  grep -q "Alice" "$TEST_TMPDIR/multiline.csv"
  grep -q "Bob" "$TEST_TMPDIR/multiline.csv"
  [[ "$output" == *"All rows match header"* ]]
}

@test "remove_rows_mismatch_header: preserves multi-line quoted fields with commas (#185)" {
  printf 'name,age,address\nAlice,30,"Taipei, Taiwan\nFloor 2, Room 3"\nBob,25,Kaohsiung\n' > "$TEST_TMPDIR/multiline_comma.csv"
  run remove_rows_mismatch_header "$TEST_TMPDIR/multiline_comma.csv"
  [ "$status" -eq 0 ]
  grep -q "Alice" "$TEST_TMPDIR/multiline_comma.csv"
  grep -q "Bob" "$TEST_TMPDIR/multiline_comma.csv"
  [[ "$output" == *"All rows match header"* ]]
}

# ── convert_to_csv_if_needed ───────────────────────────────────────────

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

# ── validate_not_html (#163) ───────────────────────────────────────

@test "validate_not_html: detects HTML file and deletes it (#163)" {
  echo '<!DOCTYPE html><html><head><title>Maintenance</title></head><body>Under maintenance</body></html>' > "$TEST_TMPDIR/test.ods"
  run validate_not_html "$TEST_TMPDIR/test.ods"
  [ "$status" -eq 1 ]
  [[ "$output" == *"is HTML, not a spreadsheet"* ]]
  # HTML file should be deleted
  [ ! -f "$TEST_TMPDIR/test.ods" ]
}

@test "validate_not_html: passes CSV text file (#163)" {
  printf 'name,age,city\nAlice,30,Taipei\n' > "$TEST_TMPDIR/test.csv"
  run validate_not_html "$TEST_TMPDIR/test.csv"
  [ "$status" -eq 0 ]
  [ -f "$TEST_TMPDIR/test.csv" ]
}

@test "validate_not_html: passes binary file (#163)" {
  # PK zip magic bytes (used by xlsx/ods)
  printf '\x50\x4b\x03\x04dummy_content' > "$TEST_TMPDIR/test.xlsx"
  run validate_not_html "$TEST_TMPDIR/test.xlsx"
  [ "$status" -eq 0 ]
  [ -f "$TEST_TMPDIR/test.xlsx" ]
}

@test "validate_not_html: returns 0 for nonexistent file (#163)" {
  run validate_not_html "$TEST_TMPDIR/nonexistent.ods"
  [ "$status" -eq 0 ]
}

# ── atomic_download (#195) ─────────────────────────────────────────

@test "atomic_download: successful download atomically renames to final path (#195)" {
  # Mock download_file to write valid CSV content to the temp path
  download_file() { printf 'name,age\nAlice,30\n' > "$2"; }
  export -f download_file

  local final_path="$TEST_TMPDIR/$NAME_DIR/test_file.ods"
  run atomic_download "http://example.com/test.ods" "$final_path"
  [ "$status" -eq 0 ]
  [ -f "$final_path" ]
  grep -q "Alice" "$final_path"
  # No leftover temp files
  local leftover
  leftover=$(find "$TEST_TMPDIR/$NAME_DIR" -name 'test_file.ods.*' | wc -l)
  [ "$leftover" -eq 0 ]
}

@test "atomic_download: cleans up temp file on download failure (#195)" {
  # Mock download_file to fail
  download_file() { return 1; }
  export -f download_file

  local final_path="$TEST_TMPDIR/$NAME_DIR/test_file.ods"
  run atomic_download "http://example.com/test.ods" "$final_path"
  [ "$status" -ne 0 ]
  # No file at final path
  [ ! -f "$final_path" ]
  # No leftover temp files
  local leftover
  leftover=$(find "$TEST_TMPDIR/$NAME_DIR" -name 'test_file.ods.*' | wc -l)
  [ "$leftover" -eq 0 ]
}

@test "atomic_download: cleans up temp file when HTML detected (#195)" {
  # Mock download_file to write HTML content (validate_not_html will detect and delete)
  download_file() {
    echo '<!DOCTYPE html><html><body>Maintenance</body></html>' > "$2"
  }
  export -f download_file

  local final_path="$TEST_TMPDIR/$NAME_DIR/test_file.ods"
  run atomic_download "http://example.com/test.ods" "$final_path"
  [ "$status" -ne 0 ]
  # No file at final path
  [ ! -f "$final_path" ]
  # No leftover temp files (validate_not_html deletes the HTML, rm -f in else is a no-op)
  local leftover
  leftover=$(find "$TEST_TMPDIR/$NAME_DIR" -name 'test_file.ods.*' | wc -l)
  [ "$leftover" -eq 0 ]
}

# ── check_file (#241) ──────────────────────────────────────────────

@test "check_file: silent on HTTP server error exit code 8 (#241)" {
  # Mock wget to exit 8 (server error / 404)
  wget() { echo "HTTP/1.1 404 Not Found" >&2; return 8; }
  export -f wget
  run check_file "http://example.com/missing.csv"
  [ "$status" -eq 8 ]
  # No warning should be emitted for expected server errors
  [[ "$output" != *"⚠️"* ]]
}

@test "check_file: warns on network error exit code 4 (#241)" {
  # Mock wget to exit 4 (network failure)
  wget() { echo "Network is unreachable" >&2; return 4; }
  export -f wget
  run check_file "http://example.com/test.csv"
  [ "$status" -eq 4 ]
  # Warning should be emitted for network errors
  [[ "$output" == *"⚠️"* ]]
  [[ "$output" == *"network error"* ]]
  [[ "$output" == *"wget exit 4"* ]]
}

@test "check_file: silent on success exit code 0 (#241)" {
  # Mock wget to exit 0 (file exists)
  wget() { return 0; }
  export -f wget
  run check_file "http://example.com/exists.csv"
  [ "$status" -eq 0 ]
  [[ "$output" != *"⚠️"* ]]
}
