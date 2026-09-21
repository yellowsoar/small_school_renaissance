#!/usr/bin/env bash
# Shared helper functions for data-pipeline shell scripts.
# Source this file after setting NAME_DIR.

# Cross-platform sed in-place edit using mktemp + mv.
# Usage: sed_inplace <file> <sed-args...>
sed_inplace() {
	local file="$1"
	shift
	local tmpfile
	tmpfile=$(mktemp "${file}.XXXXXX")
	# Preserve original file permissions (GNU stat → BSD stat fallback).
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

	echo "⚙️ Removing rows that its column mismatches the header..."
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
		echo "⚠️  Removed ${removed} row(s) from ${file}"
	else
		echo "✅ All rows match header for ${file}"
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

			echo "⚙️ Converting ${ext} to csv for ${src}"
			if soffice \
				--headless \
				--norestore \
				--env:UserInstallation="file://${soffice_sandbox}" \
				--convert-to csv \
				--outdir "./${NAME_DIR}" \
				"$src" \
				&& remove_rows_mismatch_header "$csv_path"; then
				echo "✅ File converted to ${csv_path}"
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
					echo "⚠️ Converted CSV from ${ext} has header but no data rows: ${csv_path}, trying next format..." >&2
					rm -f "$csv_path"
					continue
				fi
				return 0
			else
				echo "⚠️ Conversion from ${ext} failed for ${src} (exit code: $?), trying next format..." >&2
				rm -f "$csv_path"          # Remove residual CSV to prevent silent reuse (#260)
				rm -rf "$soffice_sandbox"
				continue
			fi
		fi
	done
	[ "$tried" -eq 0 ] && return 1  # No convertible spreadsheet source found
	return 2  # All available formats failed
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
		echo "❌ ${file} is HTML, not a spreadsheet (${mime}) — possible redirect to login/maintenance page" >&2
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
# Network failures (DNS, SSL, timeout — exit != 8) emit a diagnostic
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
		# Exit code 8 = server error (HTTP 4xx/5xx) — expected for
		# missing files; stay silent to match pre-#241 behavior.
		if [ "$rc" -ne 8 ]; then
			echo "⚠️  check_file: network error for ${url} (wget exit ${rc}): ${stderr_output}" >&2
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

# Atomic download: download to temp file, validate not HTML, then rename.
# Prevents partial/corrupt files from polluting the data pipeline (#195).
# Usage: atomic_download <url> <final_path>
atomic_download() {
	local url="$1" final="$2"
	local tmp
	tmp=$(mktemp "${final}.XXXXXX")

	if download_file "$url" "$tmp" \
		&& validate_not_html "$tmp"; then
		mv -f "$tmp" "$final"
		return 0
	else
		local rc=$?
		rm -f "$tmp"
		return "$rc"
	fi
}
