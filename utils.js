export function areDisjointBboxes(bbox1, bbox2) {
  const [longitudeA1, latitudeA1, longitudeA2, latitudeA2] = bbox1,
    [longitudeB1, latitudeB1, longitudeB2, latitudeB2] = bbox2

  return (
    longitudeA2 < longitudeB1 ||
    longitudeB2 < longitudeA1 ||
    latitudeA2 < latitudeB1 ||
    latitudeB2 < latitudeA1
  )
}
export const bboxArea = (bbox) => {
  const [longitudeA1, latitudeA1, longitudeA2, latitudeA2] = bbox

  return (longitudeA2 - longitudeA1) * (latitudeA2 - latitudeA1)
}
export const joinFeatureCollections = (elements) => ({
  type: 'FeatureCollection',
  features: elements.map((element) => element.features).flat(),
})

export const filterFeatureCollection = (featureCollection, filter) => ({
  type: 'FeatureCollection',
  features: featureCollection.features.filter(filter),
})
export const editFeatureCollection = (featureCollection, edit) => ({
  type: 'FeatureCollection',
  features: featureCollection.features.map(edit),
})
export const rejectNullValues = (object) =>
  Object.fromEntries(
    Object.entries(object)
      .map(([k, v]) => (v == null ? false : [k, v]))
      .filter(Boolean)
  )

export const dateHourMinutes = () => {
  const date = new Date()

  const date2 = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return (
    date2.toISOString().split('T')[0] +
    '-' +
    date2.getHours() +
    '-' +
    date2.getMinutes()
  )
}
const createPoint = (coordinates) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties: {},
})
export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000)
}

export const nowAsYYMMDD = (delimiter = '') => {
  var d = new Date(),
    month = '' + (d.getMonth() + 1),
    day = '' + d.getDate(),
    year = d.getFullYear()

  if (month.length < 2) month = '0' + month
  if (day.length < 2) day = '0' + day

  return [year, month, day].join(delimiter)
}
