const text = await Deno.readTextFile('./raw/circo-legislatives-umap.geojson')

const parties = ['NFP', 'Ensemble', 'RN']
const randomPartyGenerator = () => parties[Math.round((Math.random() * 10) / 3)]

const json = JSON.parse(text)

const points = json.features.filter(
    (feature) => feature.geometry.type === 'Point'
  ),
  simulatedResults = points.map((feature) => ({
    ...feature,
    properties: { result: randomPartyGenerator() },
  }))

const filtered = json.features.filter((feature) =>
  ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)
)

await Deno.writeTextFile(
  './circo-legislatives.geojson',
  JSON.stringify(filtered)
)

await Deno.writeTextFile(
  './geojson/resultats-legislatives-2024.geojson',
  JSON.stringify({ type: 'FeatureCollection', features: simulatedResults })
)
