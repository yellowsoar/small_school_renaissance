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
	if sed "$@" "$file" > "$tmpfile" && mv -f "$tmpfile" "$file"; then
		return 0
	else
		local rc=$?
		rm -f "$tmpfile"
		return "$rc"
	fi
}

# Remove rows whose column count does not match the header row.
# Uses Python csv.reader for RFC 4180 compliant quote-aware field
# counting, so quoted commas (e.g. "Taipei, Taiwan") are not
# miscounted (#170).  Replaces the previous sed/tr heuristic that
# could false-positive on quoted fields (#83, #170).
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
import csv, io, sys

infile, outfile = sys.argv[1], sys.argv[2]
removed = 0

with open(infile, newline="") as f_in, open(outfile, "w", newline="") as f_out:
    lines = f_in.readlines()
    if not lines:
        print(0)
        sys.exit(0)
    header_fields = len(next(csv.reader(io.StringIO(lines[0]))))
    f_out.write(lines[0])
    for line in lines[1:]:
        row = list(csv.reader(io.StringIO(line)))
        if row and len(row[0]) == header_fields:
            f_out.write(line)
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
# Skips if CSV already exists. soffice supports all three formats.
# Requires NAME_DIR to be set by the caller.
#
# Return codes (#85):
#   0 = success (CSV already exists or conversion completed with data)
#   1 = no convertible spreadsheet source found (expected, not an error)
#   2 = soffice conversion, row-cleanup, or empty-result failed (abnormal)
#
# Security: soffice runs with --headless, --norestore and an isolated
# UserInstallation directory so that no embedded macros can execute and
# no trusted-macro certificates from the host profile are honoured.
convert_to_csv_if_needed() {
	local base="$1"
	local csv_path="./${NAME_DIR:?NAME_DIR not set}/${base}.csv"

	[ -f "$csv_path" ] && return 0

	local ext src
	for ext in ods xlsx xls; do
		src="./${NAME_DIR}/${base}.${ext}"
		if [ -f "$src" ]; then
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
				# Verify converted CSV has data rows (not just header) (#141)
				local line_count
				line_count=$(wc -l < "$csv_path")
				if [ "$line_count" -lt 2 ]; then
					echo "❌ Converted CSV is empty or has no data rows: ${csv_path} (${line_count} lines)" >&2
					rm -f "$csv_path"
					return 2
				fi
				return 0
			else
				echo "❌ Conversion failed for ${src} (exit code: $?)" >&2
				rm -rf "$soffice_sandbox"
				return 2
			fi
		fi
	done
	return 1
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
# Requires WGET_TIMEOUT to be set by the caller.
# Usage: check_file <url>
check_file() {
	wget \
		--spider \
		--max-redirect=3 \
		${WGET_TIMEOUT} \
		"${1}" \
		>/dev/null \
		2>&1
}

# Download a file from a remote URL.
# Limits redirects to 3 hops to avoid following login/WAF redirects (#163).
# Requires WGET_TIMEOUT to be set by the caller.
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
			${WGET_TIMEOUT} \
			"${url}"
	else
		wget \
			-N \
			-P "./${NAME_DIR}" \
			--quiet \
			--max-redirect=3 \
			${WGET_TIMEOUT} \
			"${url}"
	fi
}
