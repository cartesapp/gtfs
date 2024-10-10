import { getRoutes } from 'gtfs'
export default function enrichAgencyMeta(agency_id) {
  const routes = getRoutes({ agency_id: agency_id })
  const bit = 1 / routes.length
  const routeTypeStats = routes.reduce((memo, next) => {
    return {
      ...memo,
      [next.route_type]: (memo[next.route_type] || 0) + bit,
    }
  }, {})
  return { routeTypeStats }
}
