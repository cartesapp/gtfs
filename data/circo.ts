import xml from 'npm:xml-js'
import { Destination, download } from 'https://deno.land/x/download/mod.ts'

const { xml2json } = xml

const destination: Destination = {
  file: 'circos.geojson',
  dir: './raw',
}
await download(
  'https://github.com/laem/circonscriptions-legislatives-france/blob/50c0fea5d81a8bca1e18d5b99033ad0df09445f2/circos.geojson?raw=true',
  destination
)

const text = await Deno.readTextFile('./raw/circos.geojson')

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

console.log(regionToDepartement)

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
)
console.log('Points length', points.length)
const resultatsRaw = await Promise.all(
    points.map(async (feature) => {
      const departementRaw = feature.properties['dep'],
        departement =
          departementRaw.length === 3
            ? departementRaw.replace(/^0/g, '')
            : departementRaw //TODO ZX ZZ
      const circo = feature.properties['circo']
      const region = departementToRegion[departement]
      const url = `https://www.resultats-elections.interieur.gouv.fr/telechargements/LG2024/resultatsT1/${departement}/R1${departement}${circo}.xml`
      //console.log(url)
      const req = await fetch(url)
      const text = await req.text()
      if (text.includes('404 Not Found')) {
        return console.log('foirage', circo, departement)
      }

      const json = JSON.parse(xml2json(text, { compact: true }))

      const resultats =
        json.Election.EnsembleGeo.Region.Departement.Circonscription.Tours.Tour.Resultats.Candidats.Candidat.map(
          (el) => ({
            nuance: el.CodNuaCand._text,
            score: +el.RapportExprimes._text.replace(',', '.'),
            scoreInscrits: +el.RapportInscrits._text.replace(',', '.'),
            NomPsn: el.NomPsn._text,
            PrenomPsn: el.PrenomPsn._text,
            LibNuaCand: el.LibNuaCand._text,
            Couleur: el.Couleur?._text,
            Sortant: el.Sortant?._text,
          })
        ).sort((a, b) => b.score - a.score)

      return {
        ...feature,
        properties: {
          ...feature.properties,
          result: resultats[0].nuance,
          results: resultats,
          circo: departement + circo,
        },
      }
    })
  ),
  resultats = resultatsRaw.filter(Boolean)
console.log('Resultst length', resultats.length)

const filtered = json.features.filter((feature) =>
  ['Polygon', 'MultiPolygon'].includes(feature.geometry.type)
)

await Deno.writeTextFile(
  './circo-legislatives.geojson',
  JSON.stringify(filtered)
)

const nuances = new Set(
  resultats
    .map((feature) =>
      feature.properties.results.map(
        (result) => result.LibNuaCand + ' | ' + result.nuance
      )
    )
    .flat()
)
console.log('nuances', nuances)
await Deno.writeTextFile(
  './geojson/resultats-legislatives-2024-nuances.json',
  JSON.stringify([...nuances])
)
await Deno.writeTextFile(
  './geojson/resultats-legislatives-2024.geojson',
  JSON.stringify({ type: 'FeatureCollection', features: resultats })
)
