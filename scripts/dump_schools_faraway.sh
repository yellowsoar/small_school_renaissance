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

WGET_TIMEOUT="--connect-timeout=10 --read-timeout=30"

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"

# Accumulator for failed downloads
FAILED_DOWNLOADS=()

check_directory() {
	if [ ! -d ${NAME_DIR} ]; then
		mkdir ${NAME_DIR}
	fi
}

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
		-O "${2}" \
		--quiet \
		${WGET_TIMEOUT} \
		"${1}"
}

wait_a_second() {
	sleep $((RANDOM % (WAIT_MAX - WAIT_MIN + 1) + WAIT_MIN))
}

remove_rows_mismatch_header() {
	local tmpfile
	tmpfile=$(mktemp "${1}.XXXXXX")
	trap 'rm -f "$tmpfile"' RETURN

	local expected_commas
	expected_commas=$(head -n 1 "${1}" | tr -dc ',' | wc -c)

	echo "⚙️ Removing rows that its column mismatches the header..." \
		&& sed -n "/\(.*,\)\{${expected_commas},\}/p" "${1}" > "$tmpfile" \
		&& mv -f "$tmpfile" "${1}" \
		&& echo "✅ Done for ${1}"
}

main() {
	check_directory
	for YEAR_CURRENT in $(seq ${YEAR_START} ${YEAR_END}); do
		echo "⚙️ Working on ${YEAR_CURRENT}"
		FULL_FILE_NAME="${YEAR_CURRENT}_${FILE_NAME}"
		for FILE_EXT in "${NAME_EXT[@]}"; do
			URL_TARGET="https://stats.moe.gov.tw/files/school/${YEAR_CURRENT}/${FILE_NAME}.${FILE_EXT}"
			echo "⚙️ Checking URL: ${URL_TARGET}"
			if check_file "${URL_TARGET}"; then
				if download_file \
					"${URL_TARGET}" \
					"./${NAME_DIR}/${FULL_FILE_NAME}.${FILE_EXT}"; then
					echo "✅ File Downloaded: ${FULL_FILE_NAME}.${FILE_EXT}"
				else
					echo "⚠️  download failed: ${URL_TARGET}" >&2
					FAILED_DOWNLOADS+=("${YEAR_CURRENT}/${FILE_EXT}")
				fi
			fi
			wait_a_second
		done

		if ! convert_to_csv_if_needed "${FULL_FILE_NAME}"; then
			echo "⚠️  no convertible file found for ${FULL_FILE_NAME}" >&2
		fi

		if [ -f "./${NAME_DIR}/${FULL_FILE_NAME}.csv" ]; then
			remove_rows_mismatch_header \
				"./${NAME_DIR}/${FULL_FILE_NAME}.csv"
		fi

	done

	if [ ${#FAILED_DOWNLOADS[@]} -gt 0 ]; then
		echo "⚠️  ${#FAILED_DOWNLOADS[@]} download(s) failed:" >&2
		printf '  - %s\n' "${FAILED_DOWNLOADS[@]}" >&2
		exit 1
	fi
}

main
