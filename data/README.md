## Circonscriptions administratives

deno run --allow-write --allow-read --allow-net circo.ts

## Arbres

```
[out:json];
area["name"="Bretagne"]->.boundaryarea;
node[natural=tree]
  (area.boundaryarea);
/*added by auto repair*/
(._;>;);
/*end of auto repair*/
out;
```

Exporter -> geojson -> copier (14Mo pour la Bretagne)

```
tippecanoe -zg -Z14 -o trees.pmtiles --drop-densest-as-needed trees.geojson --force --include=
scp -r ~/gtfs/data/pmtiles/trees.pmtiles root@51.159.173.121:/root/gtfs/data/pmtiles

```

Ou mieux, en ligne de commande pour la France et ses 500 Mo d'arbres 

Coller la requête sans JSON dans trees.osm. 
``` 
area["name"="Bretagne"]->.boundaryarea;
node[natural=tree]
  (area.boundaryarea);
/*added by auto repair*/
(._;>;);
/*end of auto repair*/
out;
``` 
```
wget -O ../temp/trees.osm --post-file=trees.osm "http://overpass-api.de/api/interpreter"
osmtogeojson ../temp/trees.osm > ../temp/trees.geojson
tippecanoe -zg -Z14 -o ../temp/trees.pmtiles --drop-densest-as-needed ../temp/trees.geojson --force --include=
```

