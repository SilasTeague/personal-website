#!/usr/bin/env bash
#
# Put Dahlia binaries in engine/, where the chess server looks for them.
#
#   scripts/install-engine.sh              # Linux x64 + arm64, for deploying
#   scripts/install-engine.sh x64          # just the one Lightsail needs
#   scripts/install-engine.sh --native     # a build for this machine, for npm run dev
#
# Set DAHLIA_REPO if the engine checkout isn't at ~/projects/Dahlia.
#
# See engine/README.md for the naming convention and why it is what it is.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dahlia_repo="${DAHLIA_REPO:-$HOME/projects/Dahlia}"
engine_dir="$repo_root/engine"

if [ ! -d "$dahlia_repo" ]; then
	echo "No Dahlia checkout at $dahlia_repo. Set DAHLIA_REPO to its path." >&2
	exit 1
fi

mkdir -p "$engine_dir"

if [ "${1:-}" = "--native" ]; then
	# Asking Node for the name guarantees it matches what the server looks up,
	# rather than reimplementing the uname -> process.arch mapping here and
	# letting the two drift.
	target="$engine_dir/dahlia-$(node -p 'process.platform + "-" + process.arch')"

	# Tests and benchmarks are off so this builds the engine and nothing else;
	# leaving them on makes CMake fetch Catch2 and Google Benchmark.
	(
		cd "$dahlia_repo"
		cmake --preset release -DDAHLIA_BUILD_TESTS=OFF -DDAHLIA_BUILD_BENCHMARKS=OFF
		cmake --build --preset release
	)

	install -m 755 "$dahlia_repo/build/release/dahlia" "$target"
	echo "==> $target"
	exit 0
fi

# The Linux builds are Dahlia's to define -- it owns the Dockerfile and the flags
# that make the output portable. This just aims the output at engine/, where the
# file names it produces are already the ones the server expects.
DIST_DIR="$engine_dir" "$dahlia_repo/scripts/build-release.sh" "$@"
