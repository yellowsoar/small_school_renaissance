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

WGET_TIMEOUT="--connect-timeout=10 --read-timeout=30"

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"

# Accumulator for failed downloads
FAILED_DOWNLOADS=()

main() {
	for YEAR_CURRENT in $(seq ${YEAR_START} ${YEAR_END}); do
		echo "⚙️ Working on ${YEAR_CURRENT}"
		for FILE_EXT in "${NAME_EXT[@]}"; do
			URL_TARGET="https://stats.moe.gov.tw/files/detail/${YEAR_CURRENT}/${YEAR_CURRENT}${FILE_NAME}.${FILE_EXT}"
			echo "⚙️ Checking URL: ${URL_TARGET}"
			if check_file "${URL_TARGET}"; then
				if download_file "${URL_TARGET}"; then
					local downloaded_path="./${NAME_DIR}/${YEAR_CURRENT}${FILE_NAME}.${FILE_EXT}"
					if validate_not_html "$downloaded_path"; then
						echo "✅ File Downloaded: ${YEAR_CURRENT}${FILE_NAME}.${FILE_EXT}"
					else
						echo "⚠️  downloaded file is HTML, not a spreadsheet: ${URL_TARGET}" >&2
						FAILED_DOWNLOADS+=("${YEAR_CURRENT}/${FILE_EXT}")
					fi
				else
					echo "⚠️  download failed: ${URL_TARGET}" >&2
					FAILED_DOWNLOADS+=("${YEAR_CURRENT}/${FILE_EXT}")
				fi
			fi
			sleep $((RANDOM % (WAIT_MAX - WAIT_MIN + 1) + WAIT_MIN))
		done

		rc=0
		convert_to_csv_if_needed "${YEAR_CURRENT}${FILE_NAME}" || rc=$?
		if [ "$rc" -eq 2 ]; then
			echo "⚠️  conversion failed for ${YEAR_CURRENT}${FILE_NAME}" >&2
			FAILED_DOWNLOADS+=("${YEAR_CURRENT}/csv-conversion")
		elif [ "$rc" -eq 1 ]; then
			echo "ℹ️  no convertible file found for ${YEAR_CURRENT}${FILE_NAME}"
		fi
	done

	if [ ${#FAILED_DOWNLOADS[@]} -gt 0 ]; then
		echo "⚠️  ${#FAILED_DOWNLOADS[@]} download(s) failed:" >&2
		printf '  - %s\n' "${FAILED_DOWNLOADS[@]}" >&2
		exit 1
	fi
}

main
