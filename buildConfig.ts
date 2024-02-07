import { YamlLoader } from 'https://deno.land/x/yaml_loader/mod.ts'
import { Destination, download } from 'https://deno.land/x/download/mod.ts'

const yamlLoader = new YamlLoader()
const input = await yamlLoader.parseFile('./input.yaml')

const { datasets } = input

const log = (message) => console.log(`%c${message}`, 'color: lightgreen')

const doFetch = async () => {
  const panRequest = await fetch('https://transport.data.gouv.fr/api/datasets/')
  const panDatasets = await panRequest.json()

  log(`Found ${panDatasets.length} datasets`)

  const interestingDatasets = datasets.map((dataset) =>
    panDatasets.find(({ slug, page_url, id }) =>
      [slug, page_url, id].find((el) => el === dataset)
    )
  )

  log(
    `Among which ${interestingDatasets.length} datasets match our input rules`
  )
  const resources = interestingDatasets.reduce((memo, next) => {
    const gtfsResources = next.resources.filter(
      (resource) => resource.format === 'GTFS'
    )
    return [...memo, ...gtfsResources]
  }, [])

  log(`Expanded to ${resources.length} resources (GTFS files)`)

  const filenames = await Promise.all(
    resources.map(async (resource) => {
      try {
        const filename =
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
        return './input/' + filename
      } catch (err) {
        console.log(err)
      }
    })
  )

  await Deno.writeTextFile(
    './config.json',
    JSON.stringify(
      {
        agencies: filenames.map((path) => ({
          path,
        })),
        ignoreDuplicates: true,
        sqlitePath: 'db/gtfs',
      },
      null,
      4
    )
  )
}

doFetch()
