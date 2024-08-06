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
