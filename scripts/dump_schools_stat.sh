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

check_file() {
	wget \
		--spider \
		${WGET_TIMEOUT} \
		"${1}" \
		>/dev/null \
		2>&1
}

download_file() {
	wget \
		-N \
		-P "./${NAME_DIR}" \
		--quiet \
		${WGET_TIMEOUT} \
		"${1}"
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
