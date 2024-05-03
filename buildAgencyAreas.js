import { closeDb, getAgencies, getShapesAsGeoJSON, openDb } from 'gtfs'
import {
  buildAgencyGeojsons,
  buildAgencyGeojsonsForRail,
} from './buildAgencyGeojsons.js'

export const buildAgencyAreas = () => {
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
      (agency) => true //!agenciesWithShapes.includes(agency.agency_id)
    )

    console.log(
      'Agencies without shapes',
      agenciesWithoutShapes.map((a) => a.agency_name)
    )

    const withoutShapesEntries = agenciesWithoutShapes.map((agency) => [
      agency.agency_id,
      buildAgencyGeojsonsPerWeightedSegment(agency),
    ])
    const entries =
      //const results = agenciesWithoutShapes.map(computeAgencyGeojsons(agency))
      [
        ...Object.entries(byAgency).map(([k, v]) => [
          k,
          {
            type: 'FeatureCollection',
            features: v,
          },
        ]),
        ...withoutShapesEntries,
      ]

    console.log({ entries })
    entries
      //.filter((agency) => agency.agency_id === 'PENNARBED')
      .map(([agency_id, featureCollection]) => {
        const bbox = turfBbox(featureCollection)
        if (bbox.some((el) => el === Infinity || el === -Infinity))
          return console.log(
            `L'agence ${agency_id} a une aire de couverture infinie, on l'ignore`
          )
        console.log(agency_id, bbox)
        /*
        const polylines = featureCollection.features.map((el) =>
          mapboxPolylines.fromGeoJSON(el)
        )
		*/
        agencyAreas[agency_id] = {
          // polylines,
          bbox,
          agency: agencies.find((agency) => agency.agency_id === agency_id),
          geojson: featureCollection,
        }
      })

    cache
      .set('agencyAreas', agencyAreas)
      .then((result) => {
        runtimeCache.agencyAreas = agencyAreas // This because retrieving the cache takes 1 sec
        console.log('Cache enregistré')
      })
      .catch((err) => console.log("Erreur dans l'enregistrement du cache"))

    closeDb(db)
    return agencyAreas
  } catch (error) {
    console.error(error)
  }
}
