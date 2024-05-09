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
