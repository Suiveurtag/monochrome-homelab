#!/bin/sh
set -eu

rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 2>/dev/null || true
Xvfb :99 -screen 0 1280x900x24 -ac +extension GLX +render -noreset >/tmp/xvfb.log 2>&1 &
export DISPLAY=:99
export TS_DEBUG_VISIBLE=1

exec /usr/local/bin/monochrome-spotiflac
