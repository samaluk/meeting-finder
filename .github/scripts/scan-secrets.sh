#!/bin/sh
# Scan exactly the tracked and unignored files eligible for publication, never dependencies.
set -eu
scan_dir=$(mktemp -d)
trap 'rm -rf "$scan_dir"' EXIT HUP INT TERM
git ls-files --cached --others --exclude-standard -z > "$scan_dir/files"
tar --null -T "$scan_dir/files" -cf "$scan_dir/source.tar"
mkdir "$scan_dir/source"
tar -xf "$scan_dir/source.tar" -C "$scan_dir/source"
gitleaks dir --redact --no-banner "$scan_dir/source"
