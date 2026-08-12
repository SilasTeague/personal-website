#!/usr/bin/env bash
#
# Keep the Lightsail instance's Dahlia binary current with the latest tagged
# release of github.com/SilasTeague/Dahlia.
#
# Runs on the instance from a systemd timer; see dahlia-update.timer. Pull, not
# push: nothing needs inbound access to this box and no credentials live here,
# because the Dahlia repo is public. A missed run is harmless -- the next tick
# catches up.
#
# Installed as /usr/local/bin/dahlia-update.sh. See deploy/README.md.

set -euo pipefail

REPO="${DAHLIA_REPO_SLUG:-SilasTeague/Dahlia}"
DEST="${DAHLIA_BIN:-/srv/dahlia/bin/dahlia}"
# Overridable so the update logic can be exercised against a local fixture
# rather than only ever being tested in production. `/releases/latest/` resolves
# to the newest non-prerelease release, which is exactly the set that v* tags
# produce.
BASE="${DAHLIA_RELEASE_BASE:-https://github.com/$REPO/releases/latest/download}"

# The instance knows its own architecture, so nothing upstream has to be told
# which one to build for.
case "$(uname -m)" in
	x86_64) arch=x64 ;;
	aarch64 | arm64) arch=arm64 ;;
	*)
		echo "unsupported architecture $(uname -m)" >&2
		exit 1
		;;
esac

asset="dahlia-linux-$arch"
dir=$(dirname "$DEST")
mkdir -p "$dir"

curl_get() {
	# --fail so an HTML error page never gets mistaken for a payload.
	curl --fail --silent --show-error --location \
		--retry 3 --retry-delay 5 --max-time 120 "$@"
}

# Ask what the newest release contains before downloading ~2MB to find out.
# SHA256SUMS is a few hundred bytes, which is what makes a 15-minute poll cheap.
sums=$(curl_get "$BASE/SHA256SUMS")
want=$(printf '%s\n' "$sums" | awk -v f="$asset" '$2 == f { print $1 }')

if [ -z "$want" ]; then
	echo "release has no $asset -- is this architecture still built?" >&2
	exit 1
fi

have=""
if [ -f "$DEST" ]; then
	have=$(sha256sum "$DEST" | cut -d' ' -f1)
fi

if [ "$want" = "$have" ]; then
	echo "up to date ($asset ${want:0:12})"
	exit 0
fi

# Staged in the destination directory so the rename below is a same-filesystem
# rename, and therefore atomic.
tmp="$dir/.dahlia.new.$$"
trap 'rm -f "$tmp"' EXIT

echo "updating $asset: ${have:0:12}${have:+ -> }${want:0:12}"
curl_get --output "$tmp" "$BASE/$asset"

got=$(sha256sum "$tmp" | cut -d' ' -f1)
if [ "$got" != "$want" ]; then
	echo "checksum mismatch: got ${got:0:12}, expected ${want:0:12}" >&2
	exit 1
fi

chmod 755 "$tmp"

# Keep one generation back so a bad release is one `mv` from undone.
if [ -f "$DEST" ]; then
	cp -p "$DEST" "$DEST.prev"
fi

# rename(2), not a copy: writing over a running executable fails with ETXTBSY,
# whereas renaming over it leaves any in-progress game running on the old inode
# until it exits. The website spawns a fresh engine per game, so the next new
# game picks this up -- no service restart, no interruption for anyone playing.
mv -f "$tmp" "$DEST"
trap - EXIT

echo "installed $DEST (${want:0:12})"
