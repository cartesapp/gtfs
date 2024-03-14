import turfBbox from '@turf/bbox'
import turfDistance from '@turf/distance'
import { exec as rawExec } from 'child_process'
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
} from './utils.js'
const exec = util.promisify(rawExec)

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
const port = process.env.PORT || 3001

const loadGTFS = async () => {
  console.log('will load GTFS files in node-gtfs')
  await importGtfs(config)
  computeAgencyAreas()
  return "C'est bon !"
}

const computeAgencyGeojsonsPerRoute = (agency) => {
  const routes = getRoutes({ agency_id: agency.agency_id })

  const featureCollections = routes
    /*
    .filter(
      (route) =>
        route.route_id === 'FR:Line::D6BAEC78-815E-4C9A-BC66-2B9D2C00E41F:'
    )
	*/
    .filter(({ route_short_name }) => route_short_name.match(/^\d.+/g))
    .map((route) => {
      const trips = getTrips({ route_id: route.route_id })
      //console.log(trips.slice(0, 2), trips.length)

      const features = trips.map((trip) => {
        const { trip_id } = trip
        const stopTimes = getStoptimes({ trip_id })

        const coordinates = stopTimes.map(({ stop_id }) => {
          const stops = getStops({ stop_id })
          if (stops.length > 1)
            throw new Error('One stoptime should correspond to only one stop')

          const { stop_lat, stop_lon } = stops[0]
          console.log(stops[0])
          return [stop_lon, stop_lat]
        })

        const dates = getCalendarDates({ service_id: trip.service_id })

        const properties = rejectNullValues({ ...route, ...trip, dates })

        const feature = {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties,
        }
        //beautiful, but not really useful I'm afraid...
        //return bezierSpline(feature)
        return feature
      })

      /* Very simple and potentially erroneous way to avoid straight lines that don't show stops where the trains don't stop.
       * Not effective : lots of straight lines persist through routes that cross France*/
      const mostStops = features.reduce(
        (memo, next) => {
          const memoNum = memo.geometry.coordinates.length,
            nextNum = next.geometry.coordinates.length
          return memoNum > nextNum ? memo : next
        },
        { geometry: { coordinates: [] } }
      )

      return {
        type: 'FeatureCollection',
        features,
        //bezierSpline(mostStops),
        //mostStops,
      }
    })

  return joinFeatureCollections(featureCollections)
}
const computeAgencyGeojsonsPerWeightedSegment = (agency) => {
  const routes = getRoutes({ agency_id: agency.agency_id })

  const segmentMap = new Map()
  const segmentCoordinatesMap = new Map()
  const featureCollections = routes
    /*
    .filter(
      (route) =>
        route.route_id === 'FR:Line::D6BAEC78-815E-4C9A-BC66-2B9D2C00E41F:'
    )
	*/
    // What's that ?
    .filter(({ route_short_name }) => route_short_name.match(/^\d.+/g))
    .forEach((route) => {
      const trips = getTrips({ route_id: route.route_id })

      const features = trips.map((trip) => {
        const { trip_id } = trip
        const stopTimes = getStoptimes({ trip_id })

        const points = stopTimes.map(({ stop_id }) => {
          const stops = getStops({ stop_id })
          if (stops.length > 1)
            throw new Error('One stoptime should correspond to only one stop')

          const { stop_lat, stop_lon, stop_name } = stops[0]
          const coordinates = [stop_lon, stop_lat]
          if (!segmentCoordinatesMap.has(stop_id))
            segmentCoordinatesMap.set(stop_id, coordinates)
          return {
            coordinates,
            stop: { id: stop_id, name: stop_name },
          }
        })

        const dates = getCalendarDates({ service_id: trip.service_id })

        const segments = points
          .map(
            (point, index) =>
              index > 0 && [
                point.stop.id + ' -> ' + points[index - 1].stop.id,
                dates.length,
              ]
          )
          .filter(Boolean)

        segments.forEach(([segmentKey, tripCount]) =>
          segmentMap.set(
            segmentKey,
            (segmentMap.get(segmentKey) || 0) + tripCount
          )
        )

        /*
        const properties = rejectNullValues({ ...route, ...trip, dates })

        const feature = {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties,
        }
		*/
        //beautiful, but not really useful I'm afraid...
        //return bezierSpline(feature)
        //return feature
      })
    }, {})

  const features = [...segmentMap.entries()].map(([segmentId, value]) => {
    const [a, b] = segmentId.split(' -> ')
    const pointA = segmentCoordinatesMap.get(a),
      pointB = segmentCoordinatesMap.get(b)
    return {
      geometry: { type: 'LineString', coordinates: [pointA, pointB] },
      properties: {
        count: value,
      },
      type: 'Feature',
    }
  })
  return { type: 'FeatureCollection', features }
  return joinFeatureCollections(featureCollections)
}

app.get('/agency/geojsons/:agency_id', (req, res) => {
  try {
    const db = openDb(config)
    const { agency_id } = req.params
    const agency = getAgencies({ agency_id })[0]
    const geojsons = computeAgencyGeojsonsPerWeightedSegment(agency)
    res.json(geojsons)
    closeDb(db)
  } catch (e) {
    console.error(e)
  }
})

const computeAgencyAreas = () => {
  //TODO should be store in the DB, but I'm not yet fluent using node-GTFS's DB
  console.log(
    'For each agency, compute polylines and a bounding box, store it in a cache. It enables other functions to take as input coords and give as output the list of interesting agencies.'
  )
  try {
    const db = openDb(config)

    const agencyAreas = {}
    const agencies = getAgencies()

    const featureCollection = getShapesAsGeoJSON()
    const byAgency = featureCollection.features.reduce((memo, next) => {
      return {
        ...memo,
        [next.properties.agency_id]: [
          ...(memo[next.properties.agency_id] || []),
          next,
        ],
      }
    }, {})

    const agenciesWithShapes = Object.keys(byAgency)
    const agenciesWithoutShapes = agencies.filter(
      (agency) => !agenciesWithShapes.includes(agency.agency_id)
    )

    console.log(
      'Agencies without shapes',
      agenciesWithoutShapes.map((a) => a.agency_name)
    )

    const withoutShapesEntries = agenciesWithoutShapes.map((agency) => [
      agency.agency_id,
      computeAgencyGeojsonsPerWeightedSegment(agency),
    ])
    const entries =
      //const results = agenciesWithoutShapes.map(computeAgencyGeojsons(agency))
      [
        ...Object.entries(byAgency).map(([k, v]) => ({
          type: 'FeatureCollection',
          features: v,
        })),
        ...withoutShapesEntries,
      ]

    console.log({ withoutShapesEntries })
    entries
      //.filter((agency) => agency.agency_id === 'PENNARBED')
      .map(([agency_id, featureCollection]) => {
        const bbox = turfBbox(featureCollection)
        if (bbox.some((el) => el === Infinity || el === -Infinity))
          return console.log(
            `L'agence ${agency_id} a une aire de couverture infinie, on l'ignore`
          )
        console.log(agency_id, bbox)
        //const polylines = geojsons.features.map((el) => fromGeoJSON(el))
        agencyAreas[agency_id] = {
          //polylines,
          bbox,
          agency: agencies.find((agency) => agency.agency_id === agency_id),
          geojson: featureCollection,
        }
      })

    cache
      .set('agencyAreas', agencyAreas)
      .then((result) => {
        console.log('Cache enregistré')
      })
      .catch((err) => console.log("Erreur dans l'enregistrement du cache"))

    closeDb(db)
    return agencyAreas
  } catch (error) {
    console.error(error)
  }
}

app.get('/computeAgencyAreas', (req, res) => {
  const areas = computeAgencyAreas()
  res.json(areas)
})

app.get(
  '/agencyArea/:latitude/:longitude/:latitude2/:longitude2/:format/:selection?',
  async (req, res) => {
    try {
      //TODO switch to polylines once the functionnality is judged interesting client-side, to lower the bandwidth client costs
      const {
          longitude,
          latitude,
          latitude2,
          longitude2,
          selection,
          format = 'geojson',
        } = req.params,
        userBbox = [longitude, latitude, longitude2, latitude2]

      const { day } = req.query
      const areas = computeAgencyAreas()
      console.log('AREAS', areas)
      const agencyAreas = await cache.get('agencyAreas')
      if (agencyAreas == null)
        return res.send(
          `Construisez d'abord le cache des aires d'agences avec /computeAgencyAreas`
        )

      const entries = Object.entries(agencyAreas)

      const selectedAgencies = entries.filter(([id, agency]) => {
        const disjointBboxes = areDisjointBboxes(agency.bbox, userBbox)

        const bboxRatio = bboxArea(userBbox) / bboxArea(agency.bbox),
          isRatioSmallEnough = bboxRatio < 3

        const inSelection = !selection || selection.split('|').includes(id)

        console.log(id, disjointBboxes, bboxRatio)
        return !disjointBboxes && isRatioSmallEnough && inSelection
      })

      console.log('SELECTED', selectedAgencies)

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
const rejectNullValues = (object) =>
  Object.fromEntries(
    Object.entries(object)
      .map(([k, v]) => (v == null ? false : [k, v]))
      .filter(Boolean)
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
