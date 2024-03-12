import gtfsToGeoJSON from 'gtfs-to-geojson'
import { readFile } from 'fs/promises'
const config = JSON.parse(
  await readFile(new URL('./config.json', import.meta.url))
)

const keyedConfig = {
  ...config,
  agencies: config.agencies.map((agency) => ({
    ...agency,
    agency_key: agency.path,
  })),
}
console.log(keyedConfig)

gtfsToGeoJSON(keyedConfig)
  .then(() => {
    console.log('GeoJSON Generation Successful')
  })
  .catch((err) => {
    console.error(err)
  })
