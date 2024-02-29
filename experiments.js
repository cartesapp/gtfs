const computeAgencyAreasCustom = () => {
  //TODO should be store in the DB, but I'm not yet fluent using node-GTFS's DB
  console.log(
    'For each agency, compute polylines and a bounding box, store it in a cache. It enables other functions to take as input coords and give as output the list of interesting agencies.'
  )
  try {
    const db = openDb(config)

    const agencyAreas = {}
    const agencies = getAgencies()

    // Since the other function is slow, here I tried another way to get shapes from the DB directly.
    // But I end up with an extremely long json list probably including lots of duplicates or irrelevant things
    // to be continued...
    const data = db
      .prepare(
        `SELECT DISTINCT trips.trip_id, trips.route_id, calendar_dates.date, routes.agency_id, trips.shape_id
FROM trips
JOIN calendar_dates ON trips.service_id = calendar_dates.service_id
JOIN routes ON trips.route_id = routes.route_id
WHERE routes.agency_id = 'PENNARBED'
`

        //WHERE trips.route_id = '${routeId}' AND calendar_dates.date = '${day}'
        //AND end_date >= $date
        //JOIN shapes ON trips.shape_id = shapes.shape_id
      )
      .all()

    const shapeIds = [...new Set(data.map((trip) => trip.shape_id))]
    console.log(shapeIds.length, shapeIds)
    const shapes = shapeIds.map(
      (id, index) =>
        console.log(index) || [
          id,
          getShapesAsGeoJSON({
            shape_id: id,
          }),
        ]
    )

    return shapes

    // Too slow for this data volume
    const perAgency = trips.reduce(
      (memo, next) => ({
        [next.agency_id]: [...(memo[next.agency_id] || []), next],
      }),
      {}
    )
    console.log('egencies mapped', Object.keys(perAgency))
    const entries = Object.entries(perAgency).map(([k, v]) => {})
    console.log(entries)

    return
    agencies
      //.filter((agency) => agency.agency_id === 'PENNARBED')
      .map(({ agency_id, agency_name }) => {
        console.log(`Processing ${agency_id}`)
        const routes = getRoutes({ agency_id })

        const geojsons = routes.map((route) => {
          const trips = getTrips({ route_id: route.route_id })
          console.log('trips', trips.length)
          const calendarDatesList = getCalendarDates({
            service_id: trips.map((trip) => trip.service_id),
          })
          console.log(
            'calendarDates',
            calendarDatesList.length,
            calendarDatesList[0]
          )
          const geojsonList = getShapesAsGeoJSON({
            trip_id: trips.map((trip) => trip.trip_id),
          })

          return editFeatureCollection(geojsonList, (feature, index) => {
            return {
              ...feature,
              properties: {
                ...feature.properties,
                calendarDates: calendarDatesList[index],
              },
            }
          })
        })

        console.log(geojsons.length, geojsons[0])
        const geojson = joinFeatureCollections(geojsons)
        const bbox = turfBbox(geojson)
        if (bbox.some((el) => el === Infinity || el === -Infinity))
          return console.log(
            `L'agence ${agency_id} a une aire de couverture infinie, on l'ignore`
          )
        console.log(agency_id, bbox)
        //const polylines = geojsons.features.map((el) => fromGeoJSON(el))
        agencyAreas[agency_id] = {
          //polylines,
          bbox,
          name: agency_name,
          geojson,
        }
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
