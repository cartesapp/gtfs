import { openDb, getStops, closeDb, getStoptimes } from 'gtfs'
import { importGtfs } from 'gtfs'
import { readFile } from 'fs/promises'

const config = JSON.parse(
  await readFile(new URL('./config.json', import.meta.url))
)

try {
  //await importGtfs(config);
  const db = openDb(config)
  const stops = getStoptimes({
    stop_id: ['STAR:1320'],
  })
  console.log(stops)

  //  closeDb(db);
} catch (error) {
  console.error(error)
}
