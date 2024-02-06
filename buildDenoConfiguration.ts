const deps = {
  '@turf/helpers': '^6.5.0',
  'better-sqlite3': '^9.3.0',
  'csv-parse': '^5.5.3',
  'csv-stringify': '^6.4.5',
  'gtfs-realtime-bindings': '^1.1.1',
  'lodash-es': '^4.17.21',
  long: '^5.2.3',
  'node-fetch': '^3.3.2',
  'node-stream-zip': '^1.15.0',
  pluralize: '^8.0.0',
  'pretty-error': '^4.0.0',
  'promise-map-series': '^0.3.0',
  'recursive-copy': '^2.0.14',
  'sanitize-filename': '^1.6.3',
  'sqlstring-sqlite': '^0.1.1',
  'strip-bom-stream': '^5.0.0',
  'tmp-promise': '^3.0.3',
  untildify: '^5.0.0',
  yargs: '^17.7.2',
  yoctocolors: '^1.0.0',
}
const conf = Object.fromEntries(
  Object.entries(deps).map(([k, v]) => [k, `npm:${k}@${v}`])
)
await Deno.writeTextFile('deno.json', JSON.stringify({ imports: conf }))
