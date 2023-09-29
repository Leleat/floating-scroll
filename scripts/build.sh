#!/bin/bash

# exit, if a command fails
set -e

UUID="floating-scroll@extensions.leleat"
EXT_PACKAGE="$UUID.shell-extension.zip"
RESOURCE_XML=floating-scroll.gresource.xml

# cd to repo dir
cd -- "$(dirname -- "$0")"/../

# copy ui files into extension dir
echo "Copying .ui files into build directory..."
mkdir -p $UUID/prefs
cp -r ui $UUID/prefs

# copy other files into extension dir
echo "Copying schemas and metadata.json into build directory..."
cp -r schemas metadata.json $UUID

# create resource xml
echo "<?xml version='1.0' encoding='UTF-8'?>
<gresources>
    <gresource prefix=\"/floating-scroll\">
$(
    for RESOURCE in resources/*; do
        echo "        <file>$(basename "$RESOURCE")</file>"
    done
)
    </gresource>
</gresources>" \
> $RESOURCE_XML

npm i
npx tsc

# compile resources into extension dir
echo "Compiling resoures..."
glib-compile-resources \
    --generate $RESOURCE_XML \
    --sourcedir="resources" \
    --target="$UUID/floating-scroll.gresource"

# create zip package
cd $UUID
zip -FSqr $EXT_PACKAGE ./*
mv -f $EXT_PACKAGE ./../
cd ..
echo Extension packaged as $EXT_PACKAGE

while getopts i FLAG; do
    case $FLAG in

        i)  echo Installing extension package...
            gnome-extensions install --force $EXT_PACKAGE && \
            echo Installation complete. Restart GNOME Shell and enable the extension to use it. || \
            exit 1;;

        *)  echo Don\'t use any flags to just create an extension package. Use \'-i\' to additionally install the extension.
            exit 1;;
    esac
done
