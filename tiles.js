import { exec as realExec } from './server.js'

const grid = ['N50E000-10', 'N40E010-10', 'N40E000-10', 'N50E010-10']

const exec = async (text) => {
  console.log(text)
  return Promise.resolve({ stdout: '', stderr: '' })
}

export async function updateTiles() {
  console.log('Will download panoramax planet pmtiles')
  const { stdout, stderr } = await exec(
    'wget https://panoramax.openstreetmap.fr/pmtiles/planet.pmtiles -O ~/gtfs/data/pmtiles/planet.pmtiles'
  )
  console.log('-------------------------------')
  console.log('✅ Downloaded 🌍️')
  console.log('stdout:', stdout)
  console.log('stderr:', stderr)

  // Now france tiles

  const logs = await Promise.all(
    grid.map((zone) =>
      exec(
        `wget https://osm.download.movisda.io/grid/${zone}-10-latest.osm.pbf`
      )
    )
  )

  const tilemakerMerges = grid.map(
    (zone, i) =>
      `tilemaker --input ${zone}-10-latest.osm.pbf --output hexagone-plus.mbtiles --config ~/gtfs/tilemaker/resources/config-openmaptiles.json --process ~/gtfs/tilemaker/resources/process-openmaptiles.lua ${
        i > 0 ? '--merge' : ''
      }`
  )

  await Promise.all(tilemakerMerges.map((command) => exec(command)))

  await exec(
    '~/pmtiles/pmtiles convert hexagone-plus.mbtiles hexagone-plus.pmtiles'
  )
  await exec('mv hexagone-plus.pmtiles ~/gtfs/data/pmtiles/')
  await exec('rm hexagone-plus.mbtiles')

  await Promise.all(grid.map((zone) => `rm ${zone}-10-latest.osm.pbf`))

  console.log('Done updating 😀')
}

updateTiles()
