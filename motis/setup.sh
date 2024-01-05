#!/bin/sh

TARGET="linux-amd64"

# Download and extract MOTIS.
wget https://github.com/motis-project/motis/releases/latest/download/motis-${TARGET}.tar.bz2
tar xf motis-${TARGET}.tar.bz2


# Write config.ini
#
#paths=osm:input/pays-de-la-loire.osm.pbf
#paths=osm:input/basse-normandie.osm.pbf
#paths=osm:input/haute-normandie.osm.pbf

cat <<EOT >> config.ini
modules=intermodal
modules=address
modules=tiles
modules=ppr
modules=nigiri

intermodal.router=nigiri
server.static_path=motis/web
dataset.no_schedule=true

[import]
paths=schedule-bretagne:input/bretagne.gtfs.zip
paths=schedule-ter:input/export-ter-gtfs-last.zip
paths=schedule-intercites:input/export-intercites-gtfs-last.zip
paths=schedule-tgv:input/export_gtfs_voyages.zip
paths=osm:input/bretagne.osm.pbf

[ppr]
profile=motis/ppr-profiles/default.json

[tiles]
profile=motis/tiles-profiles/background.lua
EOT

# Start MOTIS
./motis/motis
