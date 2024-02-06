import express from 'express'
import cors from 'cors'
import {
  openDb,
  getStops,
  closeDb,
  getStoptimes,
  getTrips,
  getRoutes,
  getFrequencies,
  getCalendars,
  getCalendarDates,
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

app.get('/getStopIdsAroundGPS', (req, res) => {
  try {
    const latitude = req.query.latitude
    const longitude = req.query.longitude
    const distance = req.query.distance || 20
    const db = openDb(config)

    const test = getStops(
      { "stop_lat": latitude, "stop_lon": longitude },
      [], [], { "distance_m": distance }
    )

    if (test.length === 0) {
      res.json({ stopIds: null })
    } else {
      res.json({
        // Filters location_type=(0|null) to return only stop/platform
        stopIds: test.filter((stop) => { return !stop.location_type; })
                     .map((stop) => stop.stop_id)})
    }

    closeDb(db);
  } catch (error) {
    console.error(error)
  }
})

app.get('/stopTimes/:id', (req, res) => {
  try {
    const id = req.params.id
    const db = openDb(config)
    const stops = getStoptimes({
      stop_id: [id],
    })
    const stopTrips = stops.reduce((memo, next) => [...memo, next.trip_id], [])

    const trips = getTrips({ trip_id: stopTrips }).map((trip) => ({
      ...trip,
      frequencies: getFrequencies({ trip_id: trip.trip_id }),
      calendar: getCalendars({ service_id: trip.service_id }),
      calendarDates: getCalendarDates({ service_id: trip.service_id }),
    }))
    const stopsWithTrips = stops.map((stop) => ({
      ...stop,
      trip: trips.find((el) => el.trip_id === stop.trip_id),
    }))

    const tripRoutes = trips.reduce(
      (memo, next) => [...memo, next.route_id],
      []
    )

    const routes = getRoutes({ route_id: tripRoutes })
    res.json({ stops: stopsWithTrips, trips, routes })

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
