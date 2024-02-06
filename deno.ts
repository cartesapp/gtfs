import {
  /*
  getStops,
  getShapesAsGeoJSON,
  getAgencies,
  getCalendarDates,
  getCalendars,
  getFrequencies,
  getRoutes,
  getStoptimes,
  getTrips,
  openDb,
  getStopsAsGeoJSON,
		*/
  importGtfs,
} from '../node-gtfs/index.js'

import { Hono } from 'https://deno.land/x/hono/mod.ts'

import { YamlLoader } from 'https://deno.land/x/yaml_loader/mod.ts'
const yamlLoader = new YamlLoader()

const app = new Hono()

app.get('/', (c) => c.text('Salut bonjour !'))
app.get('/fetch', () => fetchGTFS())

const port = 3000
Deno.serve({ port }, app.fetch)

const config = await yamlLoader.parseFile('./config.yaml')

const fetchGTFS = async () => {
  console.log('will fetch gtfs zip and import in node-gtfs')
  await importGtfs(config)
  return "C'est bon !"
}
