#!/usr/bin/env python3
"""CLI utilities for CSV processing and integrity verification.

Extracted from inline python3 -c blocks in lib.sh (#384) to enable
ruff linting and improve maintainability.

Usage: python3 csv_utils.py <command> [args...]

Commands:
  remove-mismatched-rows <infile> <outfile>
      Remove rows whose column count doesn't match the header.
      Prints the number of removed rows to stdout.

  validate-csv-header <csvfile> <col1> [col2 ...]
      Check that a CSV header contains all required columns.
      Prints each missing column name to stdout (one per line).
      Exit codes: 0 = success, 2 = argument error, 3 = file read error.

  count-csv-records <csvfile>
      Print the number of data rows (excluding header) in a CSV.

  compute-checksum <file>
      Print the SHA-256 hex digest of a file.

  lookup-checksum <manifest> <key>
      Print the hash for <key> from a JSON manifest, or empty string.

  record-checksum <manifest> <key> <hash>
      Upsert <key>: <hash> into a JSON manifest (created if missing).
"""

import csv
import hashlib
import json
import os
import sys
import tempfile


def _require_args(count, usage):
    """Exit with usage message if positional args after command are fewer than *count*."""
    if len(sys.argv) < count + 2:  # +2 for script name + command
        print(f"Usage: csv_utils.py {usage}", file=sys.stderr)
        sys.exit(2)


def remove_mismatched_rows():
    """Remove rows whose column count does not match the header row."""
    _require_args(2, "remove-mismatched-rows <infile> <outfile>")
    infile, outfile = sys.argv[2], sys.argv[3]
    removed = 0

    # Read with utf-8-sig to auto-strip BOM from MOE CSV exports (#414).
    # Write with utf-8 to avoid prepending a BOM to the output.
    with open(infile, newline="", encoding="utf-8-sig") as f_in, \
         open(outfile, "w", newline="", encoding="utf-8") as f_out:
        reader = csv.reader(f_in)
        writer = csv.writer(f_out, lineterminator="\n")
        try:
            header = next(reader)
        except StopIteration:
            print(0)
            sys.exit(0)
        header_fields = len(header)
        writer.writerow(header)
        for row in reader:
            if len(row) == header_fields:
                writer.writerow(row)
            else:
                removed += 1

    print(removed)


def validate_csv_header():
    """Check that a CSV header contains all required columns.

    Exit codes:
      0 - all columns present (empty stdout) or missing columns listed on stdout
      2 - argument count error (_require_args)
      3 - file cannot be read (OSError)
    """
    _require_args(1, "validate-csv-header <csvfile> <col1> [col2 ...]")
    file_path = sys.argv[2]
    required = sys.argv[3:]

    try:
        # utf-8-sig: auto-strip BOM so the first header field matches (#414).
        with open(file_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            try:
                header = next(reader)
            except StopIteration:
                for col in required:
                    print(col)
                sys.exit(0)
        header_set = set(h.strip() for h in header)
        for col in required:
            if col not in header_set:
                print(col)
    except OSError as e:
        print(f"ERROR: cannot read {file_path}: {e}", file=sys.stderr)
        sys.exit(3)


def count_csv_records():
    """Print the number of data rows (excluding header) in a CSV."""
    _require_args(1, "count-csv-records <csvfile>")
    # utf-8-sig: tolerate BOM in MOE CSV exports (#414).
    with open(sys.argv[2], newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        try:
            next(reader)
        except StopIteration:
            print(0)
            sys.exit(0)
        print(sum(1 for _ in reader))


def compute_checksum():
    """Print the SHA-256 hex digest of a file."""
    _require_args(1, "compute-checksum <file>")
    h = hashlib.sha256()
    with open(sys.argv[2], "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    print(h.hexdigest())


def lookup_checksum():
    """Print the hash for a key from a JSON manifest, or empty string."""
    _require_args(2, "lookup-checksum <manifest> <key>")
    try:
        # utf-8-sig: tolerate BOM if the manifest was edited with a
        # BOM-inserting tool (#414).
        with open(sys.argv[2], encoding="utf-8-sig") as f:
            data = json.load(f)
        print(data.get(sys.argv[3], ""))
    except (json.JSONDecodeError, OSError):
        print("")


def record_checksum():
    """Upsert a key-hash pair into a JSON manifest (created if missing)."""
    _require_args(3, "record-checksum <manifest> <key> <hash>")
    path, key, val = sys.argv[2], sys.argv[3], sys.argv[4]
    data = {}
    if os.path.isfile(path):
        try:
            # utf-8-sig on read: tolerate BOM (#414).
            with open(path, encoding="utf-8-sig") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            data = {}
    data[key] = val

    dir_name = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(dir=dir_name, suffix=".tmp")
    try:
        # utf-8 on write: do not prepend BOM (RFC 8259 recommendation).
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, sort_keys=True)
            f.write("\n")
        os.replace(tmp, path)  # atomic on POSIX
    except BaseException:
        os.unlink(tmp)
        raise


COMMANDS = {
    "remove-mismatched-rows": remove_mismatched_rows,
    "validate-csv-header": validate_csv_header,
    "count-csv-records": count_csv_records,
    "compute-checksum": compute_checksum,
    "lookup-checksum": lookup_checksum,
    "record-checksum": record_checksum,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        name = sys.argv[1] if len(sys.argv) >= 2 else "(none)"
        print(f"Unknown command: {name}", file=sys.stderr)
        print(f"Available: {', '.join(sorted(COMMANDS))}", file=sys.stderr)
        sys.exit(1)
    COMMANDS[sys.argv[1]]()
