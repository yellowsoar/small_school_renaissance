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
	trap 'rm -f "$tmpfile"' RETURN
	sed "$@" "$file" > "$tmpfile" && mv -f "$tmpfile" "$file"
}

# Remove rows whose column count does not match the header row.
# Replaces the heuristic sed '/,,,,,/d' which could false-positive on
# legitimate rows with many empty fields (#83).
# Logs the number of removed rows so operators can detect upstream
# format changes or download corruption (#108).
# Usage: remove_rows_mismatch_header <csv-file>
remove_rows_mismatch_header() {
	local file="$1"
	local tmpfile
	tmpfile=$(mktemp "${file}.XXXXXX")
	trap 'rm -f "$tmpfile"' RETURN

	local expected_commas before_count after_count removed
	expected_commas=$(head -n 1 "${file}" | tr -dc ',' | wc -c)
	before_count=$(wc -l < "${file}")

	echo "⚙️ Removing rows that its column mismatches the header..."
	sed -n "/^\([^,]*,\)\{${expected_commas}\}[^,]*$/p" "${file}" > "$tmpfile" \
		&& mv -f "$tmpfile" "${file}"
	local rc=$?
	if [ "$rc" -ne 0 ]; then
		return "$rc"
	fi

	after_count=$(wc -l < "${file}")
	removed=$((before_count - after_count))
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
#   0 = success (CSV already exists or conversion completed)
#   1 = no convertible spreadsheet source found (expected, not an error)
#   2 = soffice conversion or row-cleanup failed (abnormal)
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
			trap 'rm -rf "$soffice_sandbox"' RETURN

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
				return 0
			else
				echo "❌ Conversion failed for ${src} (exit code: $?)" >&2
				return 2
			fi
		fi
	done
	return 1
}

# Check if a remote URL exists (HTTP HEAD request).
# Requires WGET_TIMEOUT to be set by the caller.
# Usage: check_file <url>
check_file() {
	wget \
		--spider \
		${WGET_TIMEOUT} \
		"${1}" \
		>/dev/null \
		2>&1
}

# Download a file from a remote URL.
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
			${WGET_TIMEOUT} \
			"${url}"
	else
		wget \
			-N \
			-P "./${NAME_DIR}" \
			--quiet \
			${WGET_TIMEOUT} \
			"${url}"
	fi
}
