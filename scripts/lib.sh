#!/usr/bin/env bash
# Shared helper functions for data-pipeline shell scripts.
# Source this file after setting NAME_DIR.

# Path to the checksums manifest (alongside lib.sh).
# Used by integrity verification functions (#314).
CHECKSUM_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/data-checksums.json"

# Cross-platform sed in-place edit using mktemp + mv.
# Usage: sed_inplace <file> <sed-args...>
sed_inplace() {
	local file="$1"
	shift
	local tmpfile
	tmpfile=$(mktemp "${file}.XXXXXX")
	# Preserve original file permissions (GNU stat -> BSD stat fallback).
	# Failure is non-fatal: falls back to mktemp default (0600).
	local perms
	perms=$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file" 2>/dev/null) || true
	[ -n "$perms" ] && chmod "$perms" "$tmpfile" || true
	if sed "$@" "$file" > "$tmpfile" && mv -f "$tmpfile" "$file"; then
		return 0
	else
		local rc=$?
		rm -f "$tmpfile"
		return "$rc"
	fi
}

# Remove rows whose column count does not match the header row.
# Uses Python csv.reader/csv.writer for RFC 4180 compliant handling,
# including quoted commas (#170) and multi-line quoted fields (#185).
# Replaces the previous sed/tr heuristic that could false-positive on
# quoted fields (#83, #170).
# Logs the number of removed rows so operators can detect upstream
# format changes or download corruption (#108).
# Usage: remove_rows_mismatch_header <csv-file>
remove_rows_mismatch_header() {
	local file="$1"
	local tmpfile
	tmpfile=$(mktemp "${file}.XXXXXX")

	echo "\u2699\ufe0f Removing rows that its column mismatches the header..."
	local removed
	removed=$(python3 -c '
import csv, sys

infile, outfile = sys.argv[1], sys.argv[2]
removed = 0

with open(infile, newline="") as f_in, open(outfile, "w", newline="") as f_out:
    reader = csv.reader(f_in)
    writer = csv.writer(f_out, lineterminator="\n")
    try:
        header = next(reader)
    except StopIteration:
        print(0)
        sys.exit(0)
    header_fields = len(header)
    writer.writerow(header)
    for row in reader:
        if len(row) == header_fields:
            writer.writerow(row)
        else:
            removed += 1

print(removed)
' "$file" "$tmpfile") \
		&& mv -f "$tmpfile" "${file}"
	local rc=$?
	if [ "$rc" -ne 0 ]; then
		rm -f "$tmpfile"
		return "$rc"
	fi

	if [ "$removed" -gt 0 ]; then
		echo "\u26a0\ufe0f  Removed ${removed} row(s) from ${file}"
	else
		echo "\u2705 All rows match header for ${file}"
	fi
}

# Convert the first available spreadsheet (ods > xlsx > xls) to CSV.
# Tries all available formats in priority order; stops at the first
# successful conversion.  Previously stopped at the first failure (#261).
# Skips if CSV already exists. soffice supports all three formats.
# Requires NAME_DIR to be set by the caller.
#
# Return codes (#85):
#   0 = success (CSV already exists or conversion completed with data)
#   1 = no convertible spreadsheet source found (expected, not an error)
#   2 = all available formats failed conversion (abnormal)
#
# Security: soffice runs with --headless, --norestore and an isolated
# UserInstallation directory so that no embedded macros can execute and
# no trusted-macro certificates from the host profile are honoured.
convert_to_csv_if_needed() {
	local base="$1"
	local csv_path="./${NAME_DIR:?NAME_DIR not set}/${base}.csv"

	[ -f "$csv_path" ] && return 0

	local tried=0
	local ext src
	for ext in ods xlsx xls; do
		src="./${NAME_DIR}/${base}.${ext}"
		if [ -f "$src" ]; then
			tried=1
			# Sandboxed profile: empty UserInstallation ensures zero
			# trusted macro certificates and no user-level config.
			local soffice_sandbox
			soffice_sandbox=$(mktemp -d "${TMPDIR:-/tmp}/soffice-sandbox.XXXXXX")

			echo "\u2699\ufe0f Converting ${ext} to csv for ${src}"
			if soffice \
				--headless \
				--norestore \
				--env:UserInstallation="file://${soffice_sandbox}" \
				--convert-to csv \
				--outdir "./${NAME_DIR}" \
				"$src" \
				&& remove_rows_mismatch_header "$csv_path"; then
				echo "\u2705 File converted to ${csv_path}"
				rm -rf "$soffice_sandbox"
				# Verify converted CSV has data rows (not just header) (#141, #262)
				# Uses Python csv.reader for RFC 4180 logical record count,
				# consistent with remove_rows_mismatch_header.
				local record_count
				record_count=$(python3 -c '
import csv, sys
with open(sys.argv[1], newline="") as f:
    reader = csv.reader(f)
    try: next(reader)  # skip header
    except StopIteration: print(0); sys.exit(0)
    print(sum(1 for _ in reader))
' "$csv_path")
				if [ "$record_count" -lt 1 ]; then
					echo "\u26a0\ufe0f Converted CSV from ${ext} is empty or has no data rows: ${csv_path}, trying next format..." >&2
					rm -f "$csv_path"
					continue
				fi
				return 0
			else
				echo "\u26a0\ufe0f Conversion from ${ext} failed for ${src} (exit code: $?), trying next format..." >&2
				rm -f "$csv_path"          # Remove residual CSV to prevent silent reuse (#260)
				rm -rf "$soffice_sandbox"
				continue
			fi
		fi
	done
	[ "$tried" -eq 0 ] && return 1  # No convertible spreadsheet source found
	return 2  # All available formats failed
}

# --- Integrity verification (#314) -------------------------------------------
# SHA-256 checksum functions for downloaded files.  Uses Python3 hashlib
# for cross-platform compatibility (sha256sum is GNU-only; macOS ships
# shasum).  Python3 is already a runtime dependency of this library.

# Compute SHA-256 hash of a file.
# Usage: compute_checksum <file>
# Prints: hex digest to stdout
compute_checksum() {
	local file="$1"
	python3 -c '
import hashlib, sys
h = hashlib.sha256()
with open(sys.argv[1], "rb") as f:
    for chunk in iter(lambda: f.read(65536), b""):
        h.update(chunk)
print(h.hexdigest())
' "$file"
}

# Validate a file against an expected SHA-256 hash.
# Skips validation when expected_hash is empty (TOFU first-download).
# Deletes the file and returns 1 on mismatch.
# Usage: validate_checksum <file> <expected_hash>
validate_checksum() {
	local file="$1" expected_hash="$2"
	[ -z "$expected_hash" ] && return 0
	local actual
	actual=$(compute_checksum "$file")
	if [ "$actual" != "$expected_hash" ]; then
		echo "\u274c Checksum mismatch for ${file}: expected ${expected_hash}, got ${actual}" >&2
		rm -f "$file"
		return 1
	fi
}

# Look up the expected checksum for a key from the manifest.
# Prints the hex hash to stdout, or empty string if not found.
# Usage: lookup_checksum <key>
lookup_checksum() {
	local key="$1"
	[ -f "$CHECKSUM_FILE" ] || { echo ""; return 0; }
	python3 -c '
import json, sys
try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
    print(data.get(sys.argv[2], ""))
except (json.JSONDecodeError, OSError):
    print("")
' "$CHECKSUM_FILE" "$key"
}

# Record (upsert) a checksum in the manifest.
# Creates the manifest if it does not exist.
# Usage: record_checksum <key> <hash>
record_checksum() {
	local key="$1" hash="$2"
	python3 -c '
import json, sys, os
path, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
data = {}
if os.path.isfile(path):
    try:
        with open(path) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        data = {}
data[key] = val
with open(path, "w") as f:
    json.dump(data, f, indent=2, sort_keys=True)
    f.write("\n")
' "$CHECKSUM_FILE" "$key" "$hash"
}

# Validate that a downloaded file is not HTML (e.g. a redirected
# login/maintenance/WAF page).  Uses `file --mime-type` for content
# sniffing.  Deletes the file and returns non-zero if HTML is detected.
# Returns 0 if the file does not exist (nothing to validate).
# Usage: validate_not_html <file>
validate_not_html() {
	local file="$1"
	[ -f "$file" ] || return 0
	local mime
	mime=$(file --mime-type -b "$file")
	if [ "$mime" = "text/html" ]; then
		echo "\u274c ${file} is HTML, not a spreadsheet (${mime}) \u2014 possible redirect to login/maintenance page" >&2
		rm -f "$file"
		return 1
	fi
}

# Check if a remote URL exists (HTTP HEAD request).
# Limits redirects to 3 hops to avoid following login/WAF redirects (#163).
# Requires WGET_TIMEOUT to be set by the caller (as an array).
#
# Distinguishes HTTP server errors (exit 8) from network-level failures
# (#241).  Server errors (404 etc.) are expected and stay silent.
# Network failures (DNS, SSL, timeout \u2014 exit != 8) emit a diagnostic
# warning to stderr so operators can tell "file not found" apart from
# "server unreachable".
# Usage: check_file <url>
check_file() {
	local url="$1"
	local stderr_output
	stderr_output=$(wget \
		--spider \
		--max-redirect=3 \
		"${WGET_TIMEOUT[@]}" \
		"${url}" \
		2>&1 >/dev/null) || {
		local rc=$?
		# Exit code 8 = server error (HTTP 4xx/5xx) \u2014 expected for
		# missing files; stay silent to match pre-#241 behavior.
		if [ "$rc" -ne 8 ]; then
			echo "\u26a0\ufe0f  check_file: network error for ${url} (wget exit ${rc}): ${stderr_output}" >&2
		fi
		return "$rc"
	}
}

# Download a file from a remote URL.
# Limits redirects to 3 hops to avoid following login/WAF redirects (#163).
# Requires WGET_TIMEOUT to be set by the caller (as an array).
# Usage: download_file <url> [output_path]
#   With 1 arg:  wget -N -P "./${NAME_DIR}" (timestamp-checked, directory mode)
#   With 2 args: wget -O "$2" (explicit output path mode)
download_file() {
	local url="$1"
	if [ -n "${2:-}" ]; then
		wget \
			-O "${2}" \
			--quiet \
			--max-redirect=3 \
			"${WGET_TIMEOUT[@]}" \
			"${url}"
	else
		wget \
			-N \
			-P "./${NAME_DIR}" \
			--quiet \
			--max-redirect=3 \
			"${WGET_TIMEOUT[@]}" \
			"${url}"
	fi
}

# Atomic download: download to temp file, validate, then rename.
# Chains MIME-type check (#195) and optional SHA-256 verification (#314).
# Usage: atomic_download <url> <final_path> [expected_hash]
atomic_download() {
	local url="$1" final="$2" expected_hash="${3:-}"
	local tmp
	tmp=$(mktemp "${final}.XXXXXX")

	if download_file "$url" "$tmp" \
		&& validate_not_html "$tmp" \
		&& validate_checksum "$tmp" "$expected_hash"; then
		mv -f "$tmp" "$final"
		return 0
	else
		local rc=$?
		rm -f "$tmp"
		return "$rc"
	fi
}

# Run the download-and-convert pipeline for all years and file formats.
# Accepts two callback function names to customise URL and filename
# construction \u2014 the only parts that differ between data sources (#263).
#
# Integrity verification (#314): before each download, looks up the
# expected SHA-256 from the checksums manifest.  After a successful
# download, records the actual hash.  Set CHECKSUM_UPDATE=1 to skip
# verification and force re-record (for known upstream changes).
#
# Requires these variables to be set by the caller:
#   NAME_DIR, NAME_EXT, YEAR_START, YEAR_END, WAIT_MIN, WAIT_MAX, WGET_TIMEOUT
#
# Usage: run_download_pipeline <url_builder_func> <name_builder_func>
#   url_builder_func:  called as "$func" "$YEAR" "$EXT"  -> prints download URL
#   name_builder_func: called as "$func" "$YEAR"         -> prints base filename (no extension)
run_download_pipeline() {
	local url_builder="$1"
	local name_builder="$2"
	local -a FAILED_DOWNLOADS=()
	local SUCCESS_COUNT=0

	mkdir -p "./${NAME_DIR}"
	for YEAR_CURRENT in $(seq ${YEAR_START} ${YEAR_END}); do
		echo "\u2699\ufe0f Working on ${YEAR_CURRENT}"
		local base_name
		base_name=$("$name_builder" "$YEAR_CURRENT")
		for FILE_EXT in "${NAME_EXT[@]}"; do
			local URL_TARGET
			URL_TARGET=$("$url_builder" "$YEAR_CURRENT" "$FILE_EXT")
			echo "\u2699\ufe0f Checking URL: ${URL_TARGET}"
			local check_rc=0
			check_file "${URL_TARGET}" || check_rc=$?
			if [ "$check_rc" -eq 0 ]; then
				local downloaded_path="./${NAME_DIR}/${base_name}.${FILE_EXT}"
				# Integrity verification (#314): look up expected hash
				local checksum_key="${NAME_DIR}/${base_name}.${FILE_EXT}"
				local expected_hash=""
				if [ "${CHECKSUM_UPDATE:-}" != "1" ]; then
					expected_hash=$(lookup_checksum "$checksum_key")
				fi
				if atomic_download "${URL_TARGET}" "$downloaded_path" "$expected_hash"; then
					echo "\u2705 File Downloaded: ${base_name}.${FILE_EXT}"
					# Record actual hash after successful download (#314)
					local actual_hash
					actual_hash=$(compute_checksum "$downloaded_path")
					record_checksum "$checksum_key" "$actual_hash"
					((SUCCESS_COUNT++)) || true
				else
					echo "\u26a0\ufe0f  download or validation failed: ${URL_TARGET}" >&2
					FAILED_DOWNLOADS+=("${YEAR_CURRENT}/${FILE_EXT}")
				fi
			elif [ "$check_rc" -ne 8 ]; then
				echo "\u26a0\ufe0f  availability check failed (network): ${URL_TARGET}" >&2
				FAILED_DOWNLOADS+=("${YEAR_CURRENT}/${FILE_EXT}/availability-check")
			fi
			sleep $((RANDOM % (WAIT_MAX - WAIT_MIN + 1) + WAIT_MIN))
		done

		local rc=0
		convert_to_csv_if_needed "${base_name}" || rc=$?
		if [ "$rc" -eq 2 ]; then
			echo "\u26a0\ufe0f  conversion failed for ${base_name}" >&2
			FAILED_DOWNLOADS+=("${YEAR_CURRENT}/csv-conversion")
		elif [ "$rc" -eq 1 ]; then
			echo "\u2139\ufe0f  no convertible file found for ${base_name}"
		fi
	done

	if [ "$SUCCESS_COUNT" -eq 0 ] && [ ${#FAILED_DOWNLOADS[@]} -eq 0 ]; then
		echo "\u274c No files were downloaded at all \u2014 upstream may be unreachable" >&2
		exit 1
	fi

	if [ ${#FAILED_DOWNLOADS[@]} -gt 0 ]; then
		echo "\u26a0\ufe0f  ${#FAILED_DOWNLOADS[@]} download(s) failed:" >&2
		printf '  - %s\n' "${FAILED_DOWNLOADS[@]}" >&2
		exit 1
	fi
}
