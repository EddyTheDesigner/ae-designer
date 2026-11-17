#!/bin/bash
set -euo pipefail
TASK_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd -- "$TASK_DIR/.." && pwd)"
SOURCE="$PACKAGE_DIR/extension"
TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/com.edm.aedesigner"
if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '%s\n' 'This installer is for macOS.'
  exit 1
fi
if [[ ! -f "$SOURCE/CSXS/manifest.xml" ]]; then
  printf '%s\n' 'Keep the scripts and extension folders together inside the extracted download.'
  exit 1
fi
if [[ -e "$TARGET" ]]; then
  BACKUP="${TARGET}.backup.$(date +%Y%m%d-%H%M%S)"
  /bin/mv "$TARGET" "$BACKUP"
  printf 'Previous personal build backed up to:\n%s\n' "$BACKUP"
fi
/bin/mkdir -p "$(dirname -- "$TARGET")"
/usr/bin/ditto "$SOURCE" "$TARGET"
# CEP development mode is necessary for this unsigned, personally installed build.
/usr/bin/defaults write com.adobe.CSXS.11 PlayerDebugMode -string 1
/usr/bin/defaults write com.adobe.CSXS.12 PlayerDebugMode -string 1
/usr/bin/defaults write com.adobe.CSXS.13 PlayerDebugMode -string 1
printf '\n%s\n' 'Installed AE Designer.' 'Restart After Effects, then open Window > Extensions > AE Designer.'
printf '%s\n' 'The editor has not been tested in After Effects. Start with a duplicate test project.'
read -r -p 'Press Return to close. ' _reply
