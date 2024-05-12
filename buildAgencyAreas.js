import mapboxPolylines from '@mapbox/polyline'
import turfBbox from '@turf/bbox'
import { getAgencies } from 'gtfs'
import { buildAgencySymbolicGeojsons } from './buildAgencyGeojsons.js'

export const buildAgencyAreas = (db, cache, runtimeCache) => {
  //TODO should be store in the DB, but I'm not yet fluent using node-GTFS's DB
  // so I use a cache library which does a great job but needs to be doubled by an in-memory cache which is also fine and simpler than a relational DB
  console.log(
    'For each agency, compute polylines and a bounding box, store it in a cache. It enables other functions to take as input coords and give as output the list of interesting agencies.'
  )

  const agencyAreas = {}
  const agencies = getAgencies()

  /*
    // get all shapes as geojson
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

    // We've thought extensively about this matter : exact topographic shapes are not so great for voyageur information. Prefer symbolic shapes, with some exceptions and eventually an option to switch to topographic shapes on-demand
    const agenciesWithShapes = Object.keys(byAgency)
    const agenciesWithoutShapes = agencies.filter(
      (agency) => true //!agenciesWithShapes.includes(agency.agency_id)
    )
    console.log(
      'Agencies without shapes',
      agenciesWithoutShapes.map((a) => a.agency_name)
    )

	*/

  const entries = agencies
    .filter(({ agency_id: id }) => ['1187', 'MAT', 'STAR'].includes(id))
    .map((agency) => [
      agency.agency_id,
      buildAgencySymbolicGeojsons(
        db,
        agency.agency_id,
        agency.agency_id == '1187' ? false : true
      ),
    ])

  console.log(
    'Agency geojsons built for ',
    agencies.map((a) => a.agency_id).join(', ')
  )

  // Now compute bboxes for each agency's geojsons
  entries.map(([agency_id, featureCollection]) => {
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

    const polylines = featureCollection.features
      .filter((f) => f.geometry.type === 'LineString')
      .map((lineString) => ({
        ...lineString.properties,
        polyline: mapboxPolylines.fromGeoJSON(lineString),
      }))
    const points = featureCollection.features.filter(
      (el) => el.geometry.type !== 'LineString'
    )
    agencyAreas[agency_id] = {
      bbox,
      agency: agencies.find((agency) => agency.agency_id === agency_id),
      polylines,
      points,
    }
  })

  cache
    .set('agencyAreas', agencyAreas)
    .then((result) => {
      runtimeCache.agencyAreas = agencyAreas // This because retrieving the cache takes 1 sec
      console.log('Cache enregistré')
    })
    .catch((err) => console.log("Erreur dans l'enregistrement du cache"))

  return agencyAreas
}
