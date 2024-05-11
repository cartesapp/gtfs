import mapboxPolylines from '@mapbox/polyline'
import turfDistance from '@turf/distance'
import apicache from 'apicache'
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
import { buildAgencySymbolicGeojsons } from './buildAgencyGeojsons.js'
import {
  areDisjointBboxes,
  bboxArea,
  filterFeatureCollection,
  joinFeatureCollections,
  rejectNullValues,
} from './utils.js'
let cacheMiddleware = apicache.middleware
const exec = util.promisify(rawExec)

import Cache from 'file-system-cache'
import { buildAgencyAreas } from './buildAgencyAreas.js'
import {
  dateFromString,
  getWeekday,
  isAfternoon,
  isLunch,
  isMorning,
} from './timetableAnalysis.js'

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
    console.log('runtimeCache chargé depuis cache')
  })
  .catch((err) => console.log('Erreur dans le chargement du runtime cache'))

export const config = JSON.parse(
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
  //TODO buildAgencyAreas(cache, runtimeCache)
  return "C'est bon !"
}

app.get('/agency/geojsons/:agency_id', (req, res) => {
  try {
    const db = openDb(config)
    const { agency_id } = req.params
    const agency = getAgencies({ agency_id })[0]
    const geojsons = buildAgencySymbolicGeojsons(db, agency)
    res.json(geojsons)
    closeDb(db)
  } catch (e) {
    console.error(e)
  }
})

app.get('/buildAgencyAreas', (req, res) => {
  try {
    const db = openDb(config)
    const areas = buildAgencyAreas(db, cache, runtimeCache)
    closeDb(db)
    res.json(areas)
  } catch (e) {
    console.error(e)
  }
})

app.get('/dev-agency', (req, res) => {
  const db = openDb(config)
  const areas = buildAgencySymbolicGeojsons(db, { agency_id: '1187' })
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

      const { noCache } = req.query

      const selectionList = selection?.split('|')
      if (selection && noCache) {
        const agencies = getAgencies({ agency_id: selectionList })
        console.log(
          'Will build geojson shapes for ',
          selection,
          '. Agencies found : ',
          agencies
        )
        const result = agencies.map((agency) => {
          const agency_id = agency.agency_id
          const geojson =
            agency_id == '1187'
              ? buildAgencySymbolicGeojsons(db, agency_id)
              : buildAgencySymbolicGeojsons(db, agency_id, true)
          return [agency_id, { agency, geojson }]
        })

        //res.json(areas)
        return res.json(result)
      }

      const { day } = req.query

      const { agencyAreas } = runtimeCache
      if (agencyAreas == null)
        return res.send(
          `Construisez d'abord le cache des aires d'agences avec /buildAgencyAreas`
        )

      const entries = Object.entries(agencyAreas)

      const selectedAgencies = entries.filter(([id, agency]) => {
        const disjointBboxes = areDisjointBboxes(agency.bbox, userBbox)

        const bboxRatio = bboxArea(userBbox) / bboxArea(agency.bbox),
          isAgencyBigEnough = Math.sqrt(bboxRatio) < 3

        const inSelection = !selection || selectionList.includes(id)

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
      return res.json(selectedAgencies)

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

app.get('/stopTimes/:ids', (req, res) => {
  try {
    const ids = req.params.ids.split('|')

    const db = openDb(config)
    const results = ids.map((id) => {
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

      const routes = getRoutes({ route_id: tripRoutes }).map((route) => ({
        ...route,
        tripsCount: trips.filter((trip) => trip.route_id === route.route_id)
          .length,
      }))
      const features = routes
        .map((route) => [
          ...getShapesAsGeoJSON({
            route_id: route.route_id,
          }).features,
          ...getStopsAsGeoJSON({
            route_id: route.route_id,
          }).features,
        ])
        .flat()

      const result = {
        stops: stops.map(rejectNullValues),
        trips: trips.map(rejectNullValues),
        routes,
        features,
      }
      return [id, result]
    })

    res.json(results)
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
app.get('/route/:routeId', (req, res) => {
  const { routeId: route_id } = req.params
  try {
    const db = openDb(config)
    const route = getRoutes({ route_id })[0]
    const trips = getTrips({ route_id })
    const times = getStoptimes({
      trip_id: trips.map((trip) => trip.trip_id),
    }).map((el) => {
      const h = +el.departure_time.slice(0, 2)
      return {
        ...el,
        debugSchool:
          isMorning(h) || isAfternoon(h) || isLunch(h)
            ? 'school'
            : 'not school',
        isMorning: isMorning(h),
        isAfternoon: isAfternoon(h),
        isLunch: isLunch(h),
      }
    })
    const calendarDates = getCalendarDates({
      service_id: trips.map((el) => el.service_id),
    }).map((el) => {
      const day = {
        ...el,
        date_o: dateFromString('' + el.date),
        weekday: getWeekday(dateFromString('' + el.date)),
      }
      return day
    })

    res.json({ route, trips, calendarDates, times })
    closeDb(db)
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

  const { stdout3, stderr3 } = await exec('rm -f db/gtfs')
  console.log('-------------------------------')
  console.log('Deleted DB') // It looks like region Bretagne's GTFS reuses old ids, which may cause wrong route times analysis !
  console.log('stdout:', stdout3)
  console.log('stderr:', stderr3)

  await loadGTFS()
  console.log('-------------------------------')
  console.log('Load GTFS in node-gtfs DB OK')

  const { stdout2, stderr2 } = await exec('systemctl restart motis.service')
  console.log('-------------------------------')
  console.log('Restart Motis OK')
  console.log('stdout:', stdout2)
  console.log('stderr:', stderr2)

  res.send({ ok: true })
})

app.listen(port, () => {
  console.log(`Cartes.app GTFS server listening on port ${port}`)
})
