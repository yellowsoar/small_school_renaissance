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

check_directory() {
	if [ ! -d ${NAME_DIR} ]; then
		mkdir ${NAME_DIR}
	fi
}

check_file() {
	wget \
		--spider \
		"${1}" \
		>/dev/null \
		2>&1
}

download_file() {
	wget \
		-O "${2}" \
		--quiet \
		"${1}"
}

wait_a_second() {
	sleep $((RANDOM % (WAIT_MAX - WAIT_MIN + 1) + WAIT_MIN))
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
			echo "⚙️ Checking URL: ${URL_TARGET}" \
				&& check_file "${URL_TARGET}" \
				&& download_file \
					"${URL_TARGET}" \
					"./${NAME_DIR}/${FULL_FILE_NAME}.${FILE_EXT}" \
				&& echo "✅ File Downloaded: ${FULL_FILE_NAME}.${FILE_EXT}"
			wait_a_second
		done

		convert_to_csv_if_needed "${FULL_FILE_NAME}" || true

		if [ -f "./${NAME_DIR}/${FULL_FILE_NAME}.csv" ]; then
			remove_rows_mismatch_header \
				"./${NAME_DIR}/${FULL_FILE_NAME}.csv"
		fi

	done
}

main
