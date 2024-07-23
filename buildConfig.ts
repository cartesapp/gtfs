import { YamlLoader } from 'https://deno.land/x/yaml_loader/mod.ts'
import { Destination, download } from 'https://deno.land/x/download/mod.ts'
import { exec } from 'https://deno.land/x/exec/mod.ts'
import { existsSync } from 'https://deno.land/std/fs/mod.ts'
import { prefixGtfsServiceIds } from './gtfsUtils.ts'
import { load } from 'https://deno.land/std@0.224.0/dotenv/mod.ts'
const env = await load()

const log = (message) => console.log(`%c${message}`, 'color: lightgreen')

const gtfsCleanFilename = 'gtfsclean'
const pathFound = existsSync(gtfsCleanFilename)
if (pathFound) log('gtfsclean already present')
else {
  log('will download gtfsclean (fork of gtfs tidy)')

  await exec(
    'wget https://github.com/public-transport/gtfsclean/releases/download/snapshot-2/gtfsclean'
  )
  await exec('chmod +x gtfsclean')
}

const yamlLoader = new YamlLoader()
const input = await yamlLoader.parseFile('./input.yaml')

const { datasets: allDatasets } = input

const onlyMeOverrides = allDatasets.filter((dataset) => dataset.onlyMe)
const datasets = onlyMeOverrides.length ? onlyMeOverrides : allDatasets

const doFetch = async () => {
  const panRequest = await fetch('https://transport.data.gouv.fr/api/datasets/')
  const panDatasets = await panRequest.json()

  log(`Found ${panDatasets.length} datasets`)

  const interestingDatasets = datasets.map((dataset) => {
    const found = panDatasets.find(({ slug, page_url, id }) =>
      [slug, page_url, id].find((el) => el === dataset.slug)
    )
    return {
      ...found,
      prefix: dataset.prefix,
      auth: dataset.auth,
      prefixServiceIds: dataset.prefixServiceIds,
    }
  })

  log(
    `Among which ${interestingDatasets.length} datasets match our input rules`
  )
  const resources = interestingDatasets.reduce((memo, next) => {
    const gtfsResources = next.resources.filter(
      (resource) =>
        resource.format === 'GTFS' && //&& resource.is_available flixbus marked as not available but is in fact
        resource.community_resource_publisher == null // Some transport.data.gouv.fr entries have multiple official complementary GTFS files, e.g. breton islands.
      // Some others have intersecting resources, e.g. reseau-urbain-et-interurbain-dile-de-france-mobilites
      // It looks like intersecting, which are problematic for us, appear only with community resources
    )
    const uniqueTitle = Object.values(
      Object.fromEntries(gtfsResources.map((el) => [el.title, el]))
    )
    return [
      ...memo,
      ...uniqueTitle.map((resource) => ({
        slug: next.slug,
        auth: next.auth,
        prefix: next.prefix,
        prefixServiceIds: next.prefixServiceIds,
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

        const needAuth = resource.auth
        if (needAuth && !env[needAuth])
          console.log(
            `%cErreur : la resource du slug ${resource.slug} nécessite une authentification ${resource.auth}`,
            'color: crimson'
          )
        const reqInit: RequestInit = {
          method: 'GET',
          ...(needAuth
            ? {
                headers: {
                  Authorization: 'Basic ' + btoa(env[needAuth]),
                },
              }
            : {}),
        }
        // I wanted to use "url" but it sometimes is an index file, e.g. with slug "horaires-des-lignes-ter-sncf"
        await download(resource.original_url, destination, reqInit)
        log(`Downloaded file ${resource.title}`)
        // We gtfsclean everything, motis expects this and we had problems with node-gtfs before gtfstidying
        const extractedFileName = filename.split('.zip')[0]
        await exec(
          `./gtfsclean input/${filename} --fix -o input/${extractedFileName}`
        )
        log(
          `Fixed errors with gtfs tidy as requested in input for file ${resource.title}`
        )

        const path = './input/' + extractedFileName
        if (resource.prefixServiceIds)
          prefixGtfsServiceIds(path, resource.prefix + '-')

        return { path, prefix: resource.prefix }
      } catch (err) {
        console.log(err)
      }
    })
  )

  filenames.forEach((filename) => {
    log(
      `Found resource with path=${filename.path} and prefix=${filename.prefix}`
    )
  })
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
  try {
    await Deno.mkdir('../motis')
  } catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists)) {
      throw err
    }
  }
  const motisConfigFile = '../motis/config.ini'
  await Deno.writeTextFile(
    motisConfigFile,
    `modules=intermodal
#modules=address
#modules=tiles
modules=ppr
modules=nigiri
modules=osrm

intermodal.router=nigiri
server.static_path=motis/web

[nigiri]
max_footpath_length=15

[import]
${filenames
  .map(
    (filename) =>
      `paths=schedule-${
        filename.path.split('/')[2].split('.gtfs')[0]
      }:../gtfs/${filename.path}`
  )
  .join('\n')}
paths=osm:input/france.osm.pbf

[ppr]
profile=motis/ppr-profiles/distance_only.json
profile=motis/ppr-profiles/default.json

[osrm]
profiles=motis/osrm-profiles/bike.lua

#[tiles]
#profile=motis/tiles-profiles/background.lua
`
  )
  log(`Wrote motis config file ${motisConfigFile}`)
}

await doFetch()

//await exec('PORT=3000 pm2 start "yarn start"')
