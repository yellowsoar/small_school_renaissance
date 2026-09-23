#!/usr/bin/env bash
set -euo pipefail

# Variables consumed by lib.sh after source (not unused).
# shellcheck disable=SC2034
NAME_DIR=school_base_stat
FILE_NAME=_basec
# shellcheck disable=SC2034
NAME_EXT=(
	"xls"
	"xlsx"
	"ods"
	"csv"
)

# shellcheck disable=SC2034
YEAR_START=87
YEAR_END=$(( $(date +%Y) - 1911 ))

# shellcheck disable=SC2034
WAIT_MIN=3
# shellcheck disable=SC2034
WAIT_MAX=5

# shellcheck disable=SC2034
WGET_TIMEOUT=(--connect-timeout=10 --read-timeout=30)

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"

build_url() {
	echo "https://stats.moe.gov.tw/files/detail/${1}/${1}${FILE_NAME}.${2}"
}

build_name() {
	echo "${1}${FILE_NAME}"
}

run_download_pipeline build_url build_name
