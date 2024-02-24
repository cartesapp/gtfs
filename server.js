import cors from 'cors'
import express from 'express'
import { readFile } from 'fs/promises'
import polyline from '@mapbox/polyline'
const { fromGeoJSON } = polyline
import turfBbox from '@turf/bbox'
import turfDistance from '@turf/distance'
import {
  getStops,
  getShapesAsGeoJSON,
  getAgencies,
  getCalendarDates,
  getCalendars,
  getFrequencies,
  getRoutes,
  getStoptimes,
  getTrips,
  importGtfs,
  openDb,
  closeDb,
  getStopsAsGeoJSON,
} from 'gtfs'

import Cache from 'file-system-cache'

const month = 60 * 60 * 24 * 30
const cache = Cache.default({
  basePath: './.cache', // (optional) Path where cache files are stored (default).
  ttl: month, // (optional) A time-to-live (in secs) on how long an item remains cached.
})

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
  computeAgencyAreas()
  return "C'est bon !"
}

const computeAgencyAreas = () => {
  //TODO should be store in the DB, but I'm not yet fluent using node-GTFS's DB
  console.log(
    'For each agency, compute polylines and a bounding box, store it in a cache'
  )
  try {
    const db = openDb(config)

    const agencyAreas = {}
    const agencies = getAgencies()
    agencies.map(({ agency_id, agency_name }) => {
      const routes = getRoutes({ agency_id })

      const shapesGeojson = getShapesAsGeoJSON({
        route_id: routes.map((route) => route.route_id),
      })

      const bbox = turfBbox(shapesGeojson)
      if (bbox.some((el) => el === Infinity || el === -Infinity))
        return console.log(
          `L'agence ${agency_id} a une aire de couverture infinie, on l'ignore`
        )
      console.log(agency_id, bbox)
      const polylines = shapesGeojson.features.map((el) => fromGeoJSON(el))
      agencyAreas[agency_id] = { polylines, bbox, name: agency_name }
    })
    cache
      .set('agencyAreas', agencyAreas)
      .then((result) => console.log('Cache enregistré'))
      .catch((err) => console.log("Erreur dans l'enregistrement du cache"))

    closeDb(db)
  } catch (error) {
    console.error(error)
  }
}

app.get('/computeAgencyAreas', (req, res) => {
  computeAgencyAreas()
  res.send("Voilà c'est fait")
})

app.get('/agencyArea/:latitude/:longitude', async (req, res) => {
  try {
    const { longitude, latitude } = req.params
    const agencyAreas = await cache.get('agencyAreas')
    if (agencyAreas == null)
      return res.send(
        `Construisez d'abord le cache des aires d'agences avec /computeAgencyAreas`
      )
    const entries = Object.entries(agencyAreas)
    const withDistances = entries
      .map(([agencyId, agency]) => {
        const { bbox } = agency
        const isIncluded =
          longitude > bbox[0] &&
          longitude < bbox[2] &&
          latitude > bbox[1] &&
          latitude < bbox[3]
        if (!isIncluded) return false
        const bboxCenter = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
        const distance = turfDistance(
          point(bboxCenter),
          point([longitude, latitude])
        )
        return { agencyId, ...agency, bboxCenter, distance }
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance)

    res.json(withDistances)
  } catch (error) {
    console.error(error)
  }
})

const point = (coordinates) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties: {},
})

app.get('/getStopIdsAroundGPS', (req, res) => {
  try {
    const latitude = req.query.latitude
    const longitude = req.query.longitude
    const distance = req.query.distance || 20
    const db = openDb(config)

    const test = getStops({ stop_lat: latitude, stop_lon: longitude }, [], [], {
      bounding_box_side_m: distance,
    })

    if (test.length === 0) {
      res.json({ stopIds: null })
    } else {
      res.json({
        // Filters location_type=(0|null) to return only stop/platform
        stopIds: test
          .filter((stop) => {
            return !stop.location_type
          })
          .map((stop) => stop.stop_id),
      })
    }

    closeDb(db)
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
    const stopTrips = stops.map((stop) => stop.trip_id)

    const trips = getTrips({ trip_id: stopTrips }).map((trip) => ({
      ...trip,
      frequencies: getFrequencies({ trip_id: trip.trip_id }),
      calendar: getCalendars({ service_id: trip.service_id }),
      calendarDates: getCalendarDates({ service_id: trip.service_id }),
    }))

    const tripRoutes = trips.reduce(
      (memo, next) => [...memo, next.route_id],
      []
    )

    const routes = getRoutes({ route_id: tripRoutes })
    const routesGeojson = routes.map((route) => ({
      route,

      shapes: getShapesAsGeoJSON({
        route_id: route.route_id,
      }),
      stops: getStopsAsGeoJSON({
        route_id: route.route_id,
      }),
    }))

    res.json({
      stops: rejectNullValues(stops),
      trips: rejectNullValues(trips),
      routes,
      routesGeojson,
    })

    closeDb(db)
  } catch (error) {
    console.error(error)
  }
})
const rejectNullValues = (list) =>
  list.map((object) =>
    Object.fromEntries(
      Object.entries(object)
        .map(([k, v]) => (v == null ? false : [k, v]))
        .filter(Boolean)
    )
  )

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
app.get('/agencies', (req, res) => {
  try {
    const db = openDb(config)
    const agencies = getAgencies()
    res.json({ agencies })
  } catch (error) {
    console.error(error)
  }
})

app.get('/geojson/route/:routeId', (req, res) => {
  try {
    const db = openDb(config)
    const shapesGeojson = getShapesAsGeoJSON({
      route_id: req.params.routeId,
    })
    res.json(shapesGeojson)
  } catch (error) {
    console.error(error)
  }
})

app.get('/geoStops/:lat/:lon/:distance', (req, res) => {
  try {
    const db = openDb(config)

    const { lat, lon, distance } = req.params

    console.log('Will query stops for lat ', lat, ' and lon ', lon)

    const results = getStops(
      {
        stop_lat: lat,
        stop_lon: lon,
      },
      [],
      [],
      { bounding_box_side_m: distance }
    )

    res.json(results)

    closeDb(db)
  } catch (error) {
    console.error(error)
  }
})

/* Update files */
app.get('/fetch', async (req, res) => {
  const alors = await fetchGTFS()

  res.send(alors)
})

app.listen(port, () => {
  console.log(`Cartes.app GTFS server listening on port ${port}`)
})
