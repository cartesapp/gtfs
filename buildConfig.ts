import { YamlLoader } from 'https://deno.land/x/yaml_loader/mod.ts'
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
}

doFetch()
