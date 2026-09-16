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

# Convert the first available spreadsheet (ods > xlsx > xls) to CSV.
# Skips if CSV already exists. soffice supports all three formats.
# Requires NAME_DIR to be set by the caller.
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

			echo "⚙️ Converting ${ext} to csv for ${src}" \
				&& soffice \
					--headless \
					--norestore \
					--env:UserInstallation="file://${soffice_sandbox}" \
					--convert-to csv \
					--outdir "./${NAME_DIR}" \
					"$src" \
				&& echo "✅ File converted to ${csv_path}" \
				&& echo "⚙️ Handling csv header..." \
				&& sed_inplace \
					"$csv_path" \
					'/,,,,,/d' \
				&& echo "✅ Non header Content removed"
			return $?
		fi
	done
	return 1
}
