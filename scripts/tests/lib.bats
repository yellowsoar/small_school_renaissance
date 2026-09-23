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

  # Override CHECKSUM_FILE to use temp dir instead of repo path (#314).
  # lib.sh sets it to the scripts/ directory; tests must not modify the
  # real manifest.
  export CHECKSUM_FILE="$TEST_TMPDIR/data-checksums.json"
}

teardown() {
  rm -rf "$TEST_TMPDIR"
}

# ── sed_inplace ────────────────────────────────────────────────────────────────────────────────────

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
printf "學校代碼,學校名稱,縣市名稱,緯度,經度\nA001,大同國小,臺北市,25.05,121.51\n" > "${outdir}/${base}"
MOCK
  chmod +x "$TEST_TMPDIR/bin/soffice"
  export PATH="$TEST_TMPDIR/bin:$PATH"

  echo "dummy" > "$NAME_DIR/valid.ods"

  run convert_to_csv_if_needed "valid"
  [ "$status" -eq 0 ]
  [ -f "$NAME_DIR/valid.csv" ]
}

# ── validate_not_html (#163) ───────────────────────────────────────────────

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

# ── atomic_download (#195) ─────────────────────────────────────────────────

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

# ── check_file (#241) ──────────────────────────────────────────────────────

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

# ── run_download_pipeline: check_file network failure (#307) ───────

@test "run_download_pipeline: records FAILED_DOWNLOADS on check_file network failure (#307)" {
  # Setup minimal pipeline variables
  export YEAR_START=113
  export YEAR_END=113
  export NAME_EXT=(csv)
  export WAIT_MIN=0
  export WAIT_MAX=0
  export WGET_TIMEOUT=("--connect-timeout=1")

  # Mock check_file to return exit code 4 (network failure)
  check_file() { return 4; }
  export -f check_file

  # Mock convert_to_csv_if_needed to report no convertible source
  convert_to_csv_if_needed() { return 1; }
  export -f convert_to_csv_if_needed

  # Trivial builder callbacks
  url_builder() { echo "http://example.com/$1.$2"; }
  name_builder() { echo "test_$1"; }
  export -f url_builder name_builder

  run run_download_pipeline url_builder name_builder
  [ "$status" -ne 0 ]
  [[ "$output" == *"availability check failed"* ]]
  [[ "$output" == *"download(s) failed"* ]]
}

# ── compute_checksum (#314) ───────────────────────────────────────────────

@test "compute_checksum: returns correct SHA-256 for known content (#314)" {
  echo -n "hello world" > "$TEST_TMPDIR/known.txt"
  run compute_checksum "$TEST_TMPDIR/known.txt"
  [ "$status" -eq 0 ]
  # SHA-256 of "hello world" (no newline)
  [ "$output" = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9" ]
}

@test "compute_checksum: different content produces different hash (#314)" {
  echo -n "hello world" > "$TEST_TMPDIR/a.txt"
  echo -n "hello earth" > "$TEST_TMPDIR/b.txt"
  local hash_a hash_b
  hash_a=$(compute_checksum "$TEST_TMPDIR/a.txt")
  hash_b=$(compute_checksum "$TEST_TMPDIR/b.txt")
  [ "$hash_a" != "$hash_b" ]
}

# ── validate_checksum (#314) ──────────────────────────────────────────────

@test "validate_checksum: passes when hash matches (#314)" {
  echo -n "hello world" > "$TEST_TMPDIR/match.txt"
  run validate_checksum "$TEST_TMPDIR/match.txt" "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
  [ "$status" -eq 0 ]
  [ -f "$TEST_TMPDIR/match.txt" ]
}

@test "validate_checksum: fails and deletes file on mismatch (#314)" {
  echo -n "hello world" > "$TEST_TMPDIR/mismatch.txt"
  run validate_checksum "$TEST_TMPDIR/mismatch.txt" "0000000000000000000000000000000000000000000000000000000000000000"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Checksum mismatch"* ]]
  [ ! -f "$TEST_TMPDIR/mismatch.txt" ]
}

@test "validate_checksum: skips when expected hash is empty (#314)" {
  echo -n "hello world" > "$TEST_TMPDIR/skip.txt"
  run validate_checksum "$TEST_TMPDIR/skip.txt" ""
  [ "$status" -eq 0 ]
  [ -f "$TEST_TMPDIR/skip.txt" ]
}

# ── lookup_checksum (#314) ────────────────────────────────────────────────

@test "lookup_checksum: returns hash for existing key (#314)" {
  echo '{"data/file.csv": "abc123"}' > "$CHECKSUM_FILE"
  run lookup_checksum "data/file.csv"
  [ "$status" -eq 0 ]
  [ "$output" = "abc123" ]
}

@test "lookup_checksum: returns empty for missing key (#314)" {
  echo '{"data/file.csv": "abc123"}' > "$CHECKSUM_FILE"
  run lookup_checksum "data/other.csv"
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

@test "lookup_checksum: returns empty when manifest does not exist (#314)" {
  rm -f "$CHECKSUM_FILE"
  run lookup_checksum "data/file.csv"
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

@test "lookup_checksum: returns empty on corrupt manifest (#314)" {
  echo "not json" > "$CHECKSUM_FILE"
  run lookup_checksum "data/file.csv"
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

# ── record_checksum (#314) ────────────────────────────────────────────────

@test "record_checksum: inserts new key into empty manifest (#314)" {
  echo '{}' > "$CHECKSUM_FILE"
  record_checksum "data/file.csv" "abc123"
  run python3 -c "import json; d=json.load(open('$CHECKSUM_FILE')); print(d['data/file.csv'])"
  [ "$output" = "abc123" ]
}

@test "record_checksum: updates existing key (#314)" {
  echo '{"data/file.csv": "old_hash"}' > "$CHECKSUM_FILE"
  record_checksum "data/file.csv" "new_hash"
  run python3 -c "import json; d=json.load(open('$CHECKSUM_FILE')); print(d['data/file.csv'])"
  [ "$output" = "new_hash" ]
}

@test "record_checksum: creates manifest when missing (#314)" {
  rm -f "$CHECKSUM_FILE"
  record_checksum "data/file.csv" "abc123"
  [ -f "$CHECKSUM_FILE" ]
  run python3 -c "import json; d=json.load(open('$CHECKSUM_FILE')); print(d['data/file.csv'])"
  [ "$output" = "abc123" ]
}

# ── atomic_download with checksum (#314) ──────────────────────────────────

@test "atomic_download: passes when checksum matches (#314)" {
  download_file() { echo -n "hello world" > "$2"; }
  export -f download_file

  local expected_hash="b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
  local final_path="$TEST_TMPDIR/$NAME_DIR/verified.csv"
  run atomic_download "http://example.com/test.csv" "$final_path" "$expected_hash"
  [ "$status" -eq 0 ]
  [ -f "$final_path" ]
}

@test "atomic_download: fails and cleans up when checksum mismatches (#314)" {
  download_file() { echo -n "tampered content" > "$2"; }
  export -f download_file

  local expected_hash="b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
  local final_path="$TEST_TMPDIR/$NAME_DIR/tampered.csv"
  run atomic_download "http://example.com/test.csv" "$final_path" "$expected_hash"
  [ "$status" -ne 0 ]
  [ ! -f "$final_path" ]
  # No leftover temp files
  local leftover
  leftover=$(find "$TEST_TMPDIR/$NAME_DIR" -name 'tampered.csv.*' | wc -l)
  [ "$leftover" -eq 0 ]
}

@test "atomic_download: skips checksum when hash is empty (#314)" {
  download_file() { printf 'name,age\nAlice,30\n' > "$2"; }
  export -f download_file

  local final_path="$TEST_TMPDIR/$NAME_DIR/no_hash.csv"
  run atomic_download "http://example.com/test.csv" "$final_path" ""
  [ "$status" -eq 0 ]
  [ -f "$final_path" ]
}

# ── validate_csv_header (#320) ────────────────────────────────────────────

@test "validate_csv_header: passes when all required headers present (#320)" {
  cat > "$TEST_TMPDIR/valid.csv" <<'CSV'
學校代碼,學校名稱,縣市名稱,緯度,經度,其他欄位
A001,大同國小,臺北市,25.05,121.51,extra
CSV
  run validate_csv_header "$TEST_TMPDIR/valid.csv" "學校代碼" "學校名稱" "縣市名稱" "緯度" "經度"
  [ "$status" -eq 0 ]
}

@test "validate_csv_header: fails when one required header missing (#320)" {
  cat > "$TEST_TMPDIR/missing1.csv" <<'CSV'
學校代碼,學校名稱,緯度,經度
A001,大同國小,25.05,121.51
CSV
  run validate_csv_header "$TEST_TMPDIR/missing1.csv" "學校代碼" "學校名稱" "縣市名稱" "緯度" "經度"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing column: 縣市名稱"* ]]
}

@test "validate_csv_header: fails and logs all missing headers (#320)" {
  cat > "$TEST_TMPDIR/missing_multi.csv" <<'CSV'
col_a,col_b,col_c
1,2,3
CSV
  run validate_csv_header "$TEST_TMPDIR/missing_multi.csv" "學校代碼" "學校名稱" "縣市名稱"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing column: 學校代碼"* ]]
  [[ "$output" == *"missing column: 學校名稱"* ]]
  [[ "$output" == *"missing column: 縣市名稱"* ]]
}

@test "validate_csv_header: passes with extra columns beyond required (#320)" {
  cat > "$TEST_TMPDIR/extra.csv" <<'CSV'
學校代碼,學校名稱,縣市名稱,緯度,經度,地區屬性,電話
A001,大同國小,臺北市,25.05,121.51,一般,02-1234
CSV
  run validate_csv_header "$TEST_TMPDIR/extra.csv" "學校代碼" "縣市名稱"
  [ "$status" -eq 0 ]
}

@test "validate_csv_header: fails on empty file (#320)" {
  touch "$TEST_TMPDIR/empty.csv"
  run validate_csv_header "$TEST_TMPDIR/empty.csv" "學校代碼" "學校名稱"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing column: 學校代碼"* ]]
  [[ "$output" == *"missing column: 學校名稱"* ]]
}

@test "validate_csv_header: handles quoted CSV headers RFC 4180 (#320)" {
  printf '"\u5b78\u6821\u4ee3\u78bc","\u5b78\u6821\u540d\u7a31","\u7e23\u5e02\u540d\u7a31","\u7def\u5ea6","\u7d93\u5ea6"\nA001,\u5927\u540c\u570b\u5c0f,\u81fa\u5317\u5e02,25.05,121.51\n' > "$TEST_TMPDIR/quoted.csv"
  run validate_csv_header "$TEST_TMPDIR/quoted.csv" "學校代碼" "學校名稱" "縣市名稱" "緯度" "經度"
  [ "$status" -eq 0 ]
}

@test "validate_csv_header: uses SHELL_REQUIRED_HEADERS constant (#320)" {
  cat > "$TEST_TMPDIR/real.csv" <<'CSV'
學校代碼,學校名稱,縣市名稱,鄉鎮市區,地址,電話,網址,地區屬性,緯度,經度,學生人數
A001,大同國小,臺北市,大同區,某地址,02-1234,http://example.com,一般,25.05,121.51,500
CSV
  run validate_csv_header "$TEST_TMPDIR/real.csv" "${SHELL_REQUIRED_HEADERS[@]}"
  [ "$status" -eq 0 ]
}

# ── convert_to_csv_if_needed: header validation integration (#320) ────

@test "convert_to_csv_if_needed: returns 2 when converted CSV has wrong headers (#320)" {
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
printf "wrong_col_a,wrong_col_b,wrong_col_c\n1,2,3\n" > "${outdir}/${base}"
MOCK
  chmod +x "$TEST_TMPDIR/bin/soffice"
  export PATH="$TEST_TMPDIR/bin:$PATH"

  echo "dummy" > "$NAME_DIR/badheader.ods"

  run convert_to_csv_if_needed "badheader"
  [ "$status" -eq 2 ]
  [[ "$output" == *"invalid headers"* ]]
  [ ! -f "$NAME_DIR/badheader.csv" ]
}

@test "convert_to_csv_if_needed: passes when converted CSV has valid headers (#320)" {
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
printf "學校代碼,學校名稱,縣市名稱,緯度,經度\nA001,大同國小,臺北市,25.05,121.51\n" > "${outdir}/${base}"
MOCK
  chmod +x "$TEST_TMPDIR/bin/soffice"
  export PATH="$TEST_TMPDIR/bin:$PATH"

  echo "dummy" > "$NAME_DIR/goodheader.ods"

  run convert_to_csv_if_needed "goodheader"
  [ "$status" -eq 0 ]
  [ -f "$NAME_DIR/goodheader.csv" ]
}
