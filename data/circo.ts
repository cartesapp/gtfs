const text = await Deno.readTextFile('./raw/circo-legislatives-umap.geojson')

const json = JSON.parse(text)

const filtered = json.features.filter((feature) =>
  ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)
)

await Deno.writeTextFile(
  './circo-legislatives.geojson',
  JSON.stringify(filtered)
)
