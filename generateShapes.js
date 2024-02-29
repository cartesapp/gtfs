import gtfsToGeoJSON from 'gtfs-to-geojson'
const config = {
  agencies: [
    /*
    {
      agency_key: '1187',
      path: './input/horaires-des-train-voyages-tgvinouiouigo.csv.gtfs.zip',
    },
	*/
    /*
    {
      agency_key: '43',
      path: './input/bateaux-finistère-pfaedle',
    },
	*/
    {
      agency_key: 'PENNARBED',
      path: './input/korrigo-pfaedle',
    },
  ],
  ignoreDuplicates: true,
  outputFormat: 'lines',
}
gtfsToGeoJSON(config)
  .then(() => {
    console.log('GeoJSON Generation Successful')
  })
  .catch((err) => {
    console.error(err)
  })
