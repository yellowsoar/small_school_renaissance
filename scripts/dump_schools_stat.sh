#!/usr/bin/env bash
set -euo pipefail

NAME_DIR=school_base_stat
FILE_NAME=_basec
NAME_EXT=(
	"xls"
	"xlsx"
	"ods"
	"csv"
)

YEAR_START=87
YEAR_END=$(( $(date +%Y) - 1911 ))

WAIT_MIN=3
WAIT_MAX=5

check_file() {
	wget \
		--spider \
		"${1}" \
		>/dev/null \
		2>&1
}

download_file() {
	wget \
		-N \
		-P "./${NAME_DIR}" \
		--quiet \
		"${1}"
}

# Convert the first available spreadsheet (ods > xlsx > xls) to CSV.
# Skips if CSV already exists. soffice supports all three formats.
convert_to_csv_if_needed() {
	local base="$1"
	local csv_path="./${NAME_DIR}/${base}.csv"

	[ -f "$csv_path" ] && return 0

	local ext src
	for ext in ods xlsx xls; do
		src="./${NAME_DIR}/${base}.${ext}"
		if [ -f "$src" ]; then
			echo "⚙️ Converting ${ext} to csv for ${src}" \
				&& soffice \
					--convert-to csv \
					--outdir "./${NAME_DIR}" \
					"$src" \
				&& echo "✅ File converted to ${csv_path}" \
				&& echo "⚙️ Handling csv header..." \
				&& sed \
					-i '/,,,,,/d' \
					"$csv_path" \
				&& echo "✅ Non header Content removed"
			return $?
		fi
	done
	return 1
}

main() {
	for YEAR_CURRENT in $(seq ${YEAR_START} ${YEAR_END}); do
		echo "⚙️ Working on ${YEAR_CURRENT}"
		for FILE_EXT in "${NAME_EXT[@]}"; do
			URL_TARGET="https://stats.moe.gov.tw/files/detail/${YEAR_CURRENT}/${YEAR_CURRENT}${FILE_NAME}.${FILE_EXT}"
			echo "⚙️ Checking URL: ${URL_TARGET}" \
				&& check_file "${URL_TARGET}" \
				&& download_file "${URL_TARGET}" \
				&& echo "✅ File Downloaded: ${YEAR_CURRENT}${FILE_NAME}.${FILE_EXT}"
			sleep $((RANDOM % (WAIT_MAX - WAIT_MIN + 1) + WAIT_MIN))
		done

		convert_to_csv_if_needed "${YEAR_CURRENT}${FILE_NAME}" || true
	done
}

main
