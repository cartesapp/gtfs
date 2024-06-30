import xml from 'npm:xml-js'

const { xml2json } = xml

const text = await Deno.readTextFile('./raw/circo-legislatives-umap.geojson')

const territoriesRequest = await fetch(
  'https://www.resultats-elections.interieur.gouv.fr/telechargements/LG2024/territoires/territoires.xml'
)

const territoriesXml = await territoriesRequest.text()
const territories = JSON.parse(xml2json(territoriesXml, { compact: true }))

const regionToDepartement = territories.Election.EnsembleGeo.Regions.Region.map(
  (region) => {
    const departements = region.Departements.Departement
    const departementsList = Array.isArray(departements)
      ? departements
      : [departements]
    return [
      region.CodReg._text,
      departementsList.map((departement) => departement.CodDpt._text),
    ]
  }
)

const departementToRegion = Object.fromEntries(
  regionToDepartement
    .map(([region, departements]) =>
      departements.map((departement) => [departement, region])
    )
    .flat()
)

const parties = ['NFP', 'Ensemble', 'RN']
const randomPartyGenerator = () => parties[Math.round((Math.random() * 10) / 3)]

const json = JSON.parse(text)

/*
dep: "069",
    circo: "02",
	*/

const points = json.features.filter(
    (feature) => feature.geometry.type === 'Point'
  ),
  resultatsRaw = await Promise.all(
    points.map(async (feature) => {
      const departement = feature.properties['dep'].replace(/^0+/g, '') //TODO ZX ZZ
      const circo = feature.properties['circo']
      const region = departementToRegion[departement]
      const url = `https://www.resultats-elections.interieur.gouv.fr/telechargements/LG2024/resultatsT1/${region}/R1${region}${circo}.xml`
      const req = await fetch(url)
      const text = await req.text()
      if (text.includes('404 Not Found')) return

      const json = JSON.parse(xml2json(text, { compact: true }))

      const resultats =
        json.Election.EnsembleGeo.Region.Departement.Circonscription.Tours.Tour.Resultats.Candidats.Candidat.map(
          (el) => ({
            nuance: el.CodNuaCand._text,
            score: el.RapportExprimes._text,
          })
        ).sort((a, b) => +b.score - +a.score)

      return {
        ...feature,
        properties: { result: resultats[0].nuance },
      }
    })
  ),
  resultats = resultatsRaw.filter(Boolean)

const filtered = json.features.filter((feature) =>
  ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)
)

await Deno.writeTextFile(
  './circo-legislatives.geojson',
  JSON.stringify(filtered)
)

const nuances = new Set(resultats.map((feature) => feature.properties.result))
console.log('nuances', nuances)
await Deno.writeTextFile(
  './geojson/resultats-legislatives-2024-nuances.json',
  JSON.stringify([...nuances])
)
await Deno.writeTextFile(
  './geojson/resultats-legislatives-2024.geojson',
  JSON.stringify({ type: 'FeatureCollection', features: resultats })
)
