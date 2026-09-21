#!/usr/bin/env bash
set -euo pipefail

NAME_DIR=school_list_far
FILE_NAME=faraway_new
NAME_EXT=(
	"xls"
	"xlsx"
	"ods"
	"csv"
)

YEAR_START=101
YEAR_END=$(($(date +%Y) - 1911))

WAIT_MIN=3
WAIT_MAX=5

WGET_TIMEOUT=(--connect-timeout=10 --read-timeout=30)

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"

# Accumulator for failed downloads
FAILED_DOWNLOADS=()

wait_a_second() {
	sleep $((RANDOM % (WAIT_MAX - WAIT_MIN + 1) + WAIT_MIN))
}

main() {
	local SUCCESS_COUNT=0
	mkdir -p "./${NAME_DIR}"
	for YEAR_CURRENT in $(seq ${YEAR_START} ${YEAR_END}); do
		echo "⚙️ Working on ${YEAR_CURRENT}"
		FULL_FILE_NAME="${YEAR_CURRENT}_${FILE_NAME}"
		for FILE_EXT in "${NAME_EXT[@]}"; do
			URL_TARGET="https://stats.moe.gov.tw/files/school/${YEAR_CURRENT}/${FILE_NAME}.${FILE_EXT}"
			echo "⚙️ Checking URL: ${URL_TARGET}"
			if check_file "${URL_TARGET}"; then
				if atomic_download \
					"${URL_TARGET}" \
					"./${NAME_DIR}/${FULL_FILE_NAME}.${FILE_EXT}"; then
					echo "✅ File Downloaded: ${FULL_FILE_NAME}.${FILE_EXT}"
					((SUCCESS_COUNT++)) || true
				else
					echo "⚠️  download or validation failed: ${URL_TARGET}" >&2
					FAILED_DOWNLOADS+=("${YEAR_CURRENT}/${FILE_EXT}")
				fi
			fi
			wait_a_second
		done

		rc=0
		convert_to_csv_if_needed "${FULL_FILE_NAME}" || rc=$?
		if [ "$rc" -eq 2 ]; then
			echo "⚠️  conversion failed for ${FULL_FILE_NAME}" >&2
			FAILED_DOWNLOADS+=("${YEAR_CURRENT}/csv-conversion")
		elif [ "$rc" -eq 1 ]; then
			echo "ℹ️  no convertible file found for ${FULL_FILE_NAME}"
		fi

	done

	if [ "$SUCCESS_COUNT" -eq 0 ] && [ ${#FAILED_DOWNLOADS[@]} -eq 0 ]; then
		echo "❌ No files were downloaded at all — upstream may be unreachable" >&2
		exit 1
	fi

	if [ ${#FAILED_DOWNLOADS[@]} -gt 0 ]; then
		echo "⚠️  ${#FAILED_DOWNLOADS[@]} download(s) failed:" >&2
		printf '  - %s\n' "${FAILED_DOWNLOADS[@]}" >&2
		exit 1
	fi
}

main
