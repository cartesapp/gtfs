import cors from 'cors'
import express from 'express'
import { readFile } from 'fs/promises'
import {
  getCalendarDates,
  getCalendars,
  getFrequencies,
  getRoutes,
  getStoptimes,
  getTrips,
  importGtfs,
  openDb,
} from 'gtfs'

const config = JSON.parse(
  await readFile(new URL('./config.json', import.meta.url))
)
const app = express()
app.use(
  cors({
    origin: '*',
  })
)
const port = process.env.PORT || 3000

const fetchGTFS = async () => {
  console.log('will fetch gtfs zip and import in node-gtfs')
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
app.get('/routes/trip/:tripId', (req, res) => {
  try {
    const tripId = req.params.tripId
    const db = openDb(config)
    const routeIds = getTrips({ trip_id: [tripId] }).map((el) => el.route_id)
    const routes = getRoutes({
      route_id: routeIds,
    })
    res.json({ routes })

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
  console.log(`Cartes.app GTFS server listening on port ${port}`)
})
