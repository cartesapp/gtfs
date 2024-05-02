import apicache from 'apicache'
let cacheMiddleware = apicache.middleware
import mapboxPolylines from '@mapbox/polyline'
import turfDistance from '@turf/distance'
import { exec as rawExec } from 'child_process'
import compression from 'compression'
import cors from 'cors'
import express from 'express'
import { readFile } from 'fs/promises'
import {
  closeDb,
  getAgencies,
  getCalendarDates,
  getCalendars,
  getFrequencies,
  getRoutes,
  getShapesAsGeoJSON,
  getStops,
  getStopsAsGeoJSON,
  getStoptimes,
  getTrips,
  importGtfs,
  openDb,
} from 'gtfs'
import util from 'util'
import {
  areDisjointBboxes,
  bboxArea,
  filterFeatureCollection,
  joinFeatureCollections,
  rejectNullValues,
} from './utils.js'
import { buildAgencyGeojsonsPerRoute } from './buildAgencyGeojsons.js'
const exec = util.promisify(rawExec)

import Cache from 'file-system-cache'
import { buildAgencyAreas } from './buildAgencyAreas.js'

const month = 60 * 60 * 24 * 30
const cache = Cache.default({
  basePath: './.cache', // (optional) Path where cache files are stored (default).
  ttl: month, // (optional) A time-to-live (in secs) on how long an item remains cached.
})

const runtimeCache = { agencyAreas: null }
// This because retrieving the cache takes 1 sec

cache
  .get('agencyAreas')
  .then((result) => {
    runtimeCache.agencyAreas = result // This because retrieving the cache takes 1 sec
    console.log('runtimecache depuis cache')
  })
  .catch((err) => console.log('Erreur dans le chargement du runtime cache'))

const config = JSON.parse(
  await readFile(new URL('./config.json', import.meta.url))
)
const app = express()
app.use(
  cors({
    origin: '*',
  })
)
app.use(cacheMiddleware('20 minutes'))
app.use(compression())
const port = process.env.PORT || 3001

const loadGTFS = async () => {
  console.log('will load GTFS files in node-gtfs')
  await importGtfs(config)
  buildAgencyAreas()
  return "C'est bon !"
}

app.get('/agency/geojsons/:agency_id', (req, res) => {
  try {
    const db = openDb(config)
    const { agency_id } = req.params
    const agency = getAgencies({ agency_id })[0]
    const geojsons = buildAgencyGeojsonsPerRoute(agency)
    res.json(geojsons)
    closeDb(db)
  } catch (e) {
    console.error(e)
  }
})

app.get('/computeAgencyAreas', (req, res) => {
  const areas = buildAgencyAreas()
  res.json(areas)
})

app.get('/dev-agency', (req, res) => {
  const db = openDb(config)
  const areas = buildAgencyGeojsonsPerRoute({ agency_id: '1187' })
  //res.json(areas)
  return res.json([['1187', areas]])
})

app.get(
  '/agencyArea/:latitude/:longitude2/:latitude2/:longitude/:format/:selection?',
  async (req, res) => {
    try {
      const db = openDb(config)
      //TODO switch to polylines once the functionnality is judged interesting client-side, to lower the bandwidth client costs
      const {
          longitude,
          latitude,
          latitude2,
          longitude2,
          selection,
          format = 'geojson',
        } = req.params,
        userBbox = [+longitude, +latitude, +longitude2, +latitude2]

      if (selection === '1187') {
        const agency = buildAgencyGeojsonsPerRoute({ agency_id: '1187' }, true)

        //res.json(areas)
        return res.json([['1187', agency]])
      }

      const { day } = req.query
      console.time('opening cache' + userBbox.join(''))
      const agencyAreas = runtimeCache.agencyAreas
      console.timeLog('opening cache' + userBbox.join(''))
      if (agencyAreas == null)
        return res.send(
          `Construisez d'abord le cache des aires d'agences avec /computeAgencyAreas`
        )

      const entries = Object.entries(agencyAreas)

      const selectedAgencies = entries.filter(([id, agency]) => {
        const disjointBboxes = areDisjointBboxes(agency.bbox, userBbox)

        const bboxRatio = bboxArea(userBbox) / bboxArea(agency.bbox),
          isAgencyBigEnough = Math.sqrt(bboxRatio) < 3

        const inSelection = !selection || selection.split('|').includes(id)

        /*
        console.log(
          id,
          disjointBboxes,
          userBbox,
          agency.bbox,
          isAgencyBigEnough
        )
		*/
        return !disjointBboxes && isAgencyBigEnough && inSelection
      })

      if (format === 'prefetch')
        return res.json(selectedAgencies.map(([id]) => id))
      return res.json(
        selectedAgencies.map(([id, agency]) => {
          console.log('AGENCY', agency)
          // TODO do this in the computeAgencyAreas step, once
          const polylines = agency.geojson.features
            .filter((f) => f.geometry.type === 'LineString')
            .map((lineString) => ({
              ...lineString.properties,
              polyline: mapboxPolylines.fromGeoJSON(lineString),
            }))
          // These are points generated when we build geojsons for agencies that have no shapes
          const otherGeojsons = agency.geojson.features.filter(
            (el) => el.geometry.type !== 'LineString'
          )

          return [
            id,
            {
              bbox: agency.bbox,
              agency: agency.agency,
              polylines,
              otherGeojsons,
            },
          ]
        })
      )

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

      // Return only the closest agency for now. No algorithm is perfect, so will need to let the user choose in a following iteration
      const theOne = withDistances[0].geojson

      const goodDay = day
        ? filterFeatureCollection(
            theOne,
            (feature) => feature.properties.calendarDates.date === +day
          )
        : theOne
      res.send(goodDay)
    } catch (error) {
      console.error(error)
    }
  }
)

app.get('/agency/:agency_id?', (req, res) => {
  try {
    const { agency_id } = req.params
    console.log(`Requesting agency by id ${agency_id}`)
    const db = openDb(config)
    if (agency_id == null) res.json(getAgencies())
    else res.json(getAgencies({ agency_id })[0])

    return closeDb(db)
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
      stops: stops.map(rejectNullValues),
      trips: trips.map(rejectNullValues),
      routes,
      routesGeojson,
    })

    closeDb(db)
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
app.get('/agencies', (req, res) => {
  try {
    const db = openDb(config)
    const agencies = getAgencies()
    res.json({ agencies })
  } catch (error) {
    console.error(error)
  }
})
app.get('/routes/:routeIds', (req, res) => {
  const { routeIds } = req.params
  try {
    const db = openDb(config)
    const routes = getRoutes({ route_id: routeIds.split('|') })
    res.json(routes)
    closeDb(db)
  } catch (error) {
    console.error(error)
  }
})

app.get('/geojson/route/:routeid', (req, res) => {
  try {
    const { routeId } = req.params
    const { day } = req.query

    const db = openDb(config)

    const trips = db
      .prepare(
        `SELECT trips.trip_id
FROM trips
JOIN calendar_dates ON trips.service_id = calendar_dates.service_id
WHERE trips.route_id = '${routeId}' AND calendar_dates.date = '${day}'
			  ` //AND end_date >= $date'
      )
      //JOIN shapes ON trips.shape_id = shapes.shape_id
      .all({ day })

    const featureCollections = trips.map(({ trip_id }) =>
      getShapesAsGeoJSON({ trip_id })
    )

    return res.json(joinFeatureCollections(featureCollections))

    const shapesGeojson = getShapesAsGeoJSON({
      route_id: req.params.routeId,
    })
    res.json(shapesGeojson)
    closeDb(db)
  } catch (error) {
    console.error(error)
  }
})
app.get('/geojson/shape/:shapeId', (req, res) => {
  try {
    const { shapeId } = req.params

    const db = openDb(config)

    const result = getShapesAsGeoJSON({ shape_id: shapeId })

    res.json(result)

    closeDb(db)
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

/* Update the DB from the local GTFS files */
app.get('/fetch', async (req, res) => {
  const alors = await loadGTFS()

  res.send(alors)
})

app.get('/update', async (req, res) => {
  const { stdout, stderr } = await exec('yarn build-config')
  console.log('-------------------------------')
  console.log('Build config OK')
  console.log('stdout:', stdout)
  console.log('stderr:', stderr)
  const { stdout2, stderr2 } = await exec('systemctl restart motis.service')
  console.log('-------------------------------')
  console.log('Restart Motis OK')
  console.log('stdout:', stdout2)
  console.log('stderr:', stderr2)
  await loadGTFS()
  console.log('-------------------------------')
  console.log('Load GTFS in node-gtfs DB OK')
  res.send({ ok: true })
})

app.listen(port, () => {
  console.log(`Cartes.app GTFS server listening on port ${port}`)
})
