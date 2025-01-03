#!/usr/bin/env bash

set -e

if ! command -v msgfmt &> /dev/null; then
	echo "ERROR: gettext isn't installed. Skipping translation updates..."
	exit 1
fi

cd -- "$( dirname "$0" )/../"

# update main.pot
echo -n "Updating 'po/main.pot'"
find src/ data/ \( -name '*.js' -o -name '*.ui' \) -print0 | xargs -0 xgettext \
    --from-code=UTF-8 \
    --output=po/main.pot \
    --add-comments='Translators:'
echo "................ done."

# update .po files
if find po/ | grep -q ".po$" ; then
	for FILE in po/*.po; do
		echo -n "Updating '$FILE'..."
		msgmerge -NU "$FILE" po/main.pot
	done
fi
	echo "There are no .po files to update."
