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

build_url() {
	echo "https://stats.moe.gov.tw/files/school/${1}/${FILE_NAME}.${2}"
}

build_name() {
	echo "${1}_${FILE_NAME}"
}

run_download_pipeline build_url build_name
