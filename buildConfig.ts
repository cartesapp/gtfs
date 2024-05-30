import { YamlLoader } from 'https://deno.land/x/yaml_loader/mod.ts'
import { Destination, download } from 'https://deno.land/x/download/mod.ts'
import { exec } from 'https://deno.land/x/exec/mod.ts'
import { existsSync } from 'https://deno.land/std/fs/mod.ts'
import { prefixGtfsServiceIds } from './gtfsUtils.ts'

const log = (message) => console.log(`%c${message}`, 'color: lightgreen')

const tidyFilename = 'gtfstidy.v0.2.linux.amd64'
const pathFound = existsSync(tidyFilename)
if (pathFound) log('gtfstidy already present')
else {
  log('will download gtfstidy')

  await exec(
    'wget https://github.com/patrickbr/gtfstidy/releases/download/v0.2/gtfstidy.v0.2.linux.amd64'
  )
  await exec('chmod +x gtfstidy.v0.2.linux.amd64')
}

const yamlLoader = new YamlLoader()
const input = await yamlLoader.parseFile('./input.yaml')

const { datasets: rawDatasets } = input

const datasets = rawDatasets.map((dataset) =>
  typeof dataset === 'string' ? { slug: dataset } : dataset
)

const doFetch = async () => {
  const panRequest = await fetch('https://transport.data.gouv.fr/api/datasets/')
  const panDatasets = await panRequest.json()

  log(`Found ${panDatasets.length} datasets`)

  const interestingDatasets = datasets.map((dataset) => {
    const found = panDatasets.find(({ slug, page_url, id }) =>
      [slug, page_url, id].find((el) => el === dataset.slug)
    )
    return { ...found, prefix: dataset.prefix }
  })

  log(
    `Among which ${interestingDatasets.length} datasets match our input rules`
  )
  const resources = interestingDatasets.reduce((memo, next) => {
    const gtfsResources = next.resources.filter(
      (resource) => resource.format === 'GTFS' && resource.is_available
    )
    const uniqueTitle = Object.values(
      Object.fromEntries(gtfsResources.map((el) => [el.title, el]))
    )
    return [
      ...memo,
      ...uniqueTitle.map((resource) => ({
        slug: next.slug,
        prefix: next.prefix,
        ...resource,
      })),
    ]
  }, [])

  log(`Expanded to ${resources.length} resources (GTFS files)`)

  const filenames = await Promise.all(
    resources.map(async (resource) => {
      try {
        const filename =
          (resource.prefix || resource.slug) +
          '|' +
          resource.title.replace(/\s/g, '-') +
          (resource.format === 'GTFS' ? '.gtfs.zip' : '.unknown')
        // NOTE : You need to ensure that the directory you pass exists.
        const destination: Destination = {
          file: filename,
          dir: './input',
        }
        /* sample with mode
     const destination: Destination = {
        file: 'example.pdf',
        dir: './test',
        mode: 0o777
    }
    */
        // I wanted to use "url" but it sometimes is an index file, e.g. with slug "horaires-des-lignes-ter-sncf"
        await download(resource.original_url, destination)
        log(`Downloaded file ${resource.title}`)
        // We gtfstidy everything, motis expects this and we had problems with node-gtfs before gtfstidying
        const extractedFileName = filename.split('.zip')[0]
        await exec(
          `./gtfstidy.v0.2.linux.amd64 input/${filename} --fix -o input/${extractedFileName}`
        )
        log(
          `Fixed errors with gtfs tidy as requested in input for file ${resource.title}`
        )

        const path = './input/' + extractedFileName
        prefixGtfsServiceIds(path, resource.prefix + '-')

        return { path, prefix: resource.prefix }
      } catch (err) {
        console.log(err)
      }
    })
  )

  const nodeGtfsConfigFile = './config.json'
  await Deno.writeTextFile(
    nodeGtfsConfigFile,
    JSON.stringify(
      {
        agencies: filenames.map(({ path }) => ({ path })), // We tried using the prefix option of node-GTFS to make service_ids unique, but it rewrites STAR:1235 with bzhSTAR:1235 which breaks external discovery e.g. OSM tag of a bus stop
        ignoreDuplicates: true,
      },
      null,
      4
    )
  )
  log(`Wrote node-gtfs config file ${nodeGtfsConfigFile}`)
  const motisConfigFile = '../motis/config.ini'
  await Deno.writeTextFile(
    motisConfigFile,
    `modules=intermodal
#modules=address
#modules=tiles
modules=ppr
modules=nigiri

intermodal.router=nigiri
server.static_path=motis/web

[import]
${filenames
  .map(
    (filename) =>
      `paths=schedule-${
        filename.path.split('/')[2].split('.gtfs')[0]
      }:../gtfs/${filename.path}`
  )
  .join('\n')}
paths=osm:input/cartes.osm.pbf

[ppr]
profile=motis/ppr-profiles/distance_only.json
profile=motis/ppr-profiles/default.json

#[tiles]
#profile=motis/tiles-profiles/background.lua
`
  )
  log(`Wrote motis config file ${motisConfigFile}`)
}

await doFetch()

//await exec('PORT=3000 pm2 start "yarn start"')
