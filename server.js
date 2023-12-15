import express from 'express'
import cors from 'cors'
import {
  openDb,
  getStops,
  closeDb,
  getStoptimes,
  getTrips,
  getRoutes,
} from 'gtfs'
import { importGtfs } from 'gtfs'
import { readFile } from 'fs/promises'
import { pipeline } from 'stream/promises'

const config = JSON.parse(
  await readFile(new URL('./config.json', import.meta.url))
)
import fs from 'fs'
const app = express()
app.use(
  cors({
    origin: '*',
  })
)
const port = process.env.PORT || 3000
import { Readable } from 'node:stream'

const url = 'https://www.korrigo.bzh/ftp/OPENDATA/KORRIGOBRET.gtfs.zip'

const fetchGTFS = async () => {
  console.log('will fetch gtfs zip and import in node-gtfs')
  const response = await fetch(url)
  const fileWriteStream = fs.createWriteStream('./gtfs/bretagne.zip')
  const readableStream = Readable.fromWeb(response.body)
  await pipeline(readableStream, fileWriteStream)
  await importGtfs(config)
  return "C'est bon !"
}

app.get('/stopTimes/:id', (req, res) => {
  try {
    const id = req.params.id
    const db = openDb(config)
    const stops = getStoptimes({
      stop_id: [id],
    })
    const stopTrips = stops.reduce((memo, next) => [...memo, next.trip_id], [])

    const trips = getTrips({ trip_id: stopTrips })
    const tripRoutes = trips.reduce(
      (memo, next) => [...memo, next.route_id],
      []
    )

    const routes = getRoutes({ route_id: tripRoutes })
    res.json({ stops, trips, routes })

    //  closeDb(db);
  } catch (error) {
    console.error(error)
  }
})
app.get('/fetch', async (req, res) => {
  const alors = await fetchGTFS()
  res.send(alors)
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
