import axios from 'axios'
import { exec as rawExec, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import util from 'util'
const realExec = util.promisify(rawExec)

import * as chalk from 'chalk'
import { MultiProgressBars } from 'multi-progress-bars'

const grid = ['N50E000', 'N40E010', 'N40E000', 'N50E010']

const dryExec = async (text) => {
  console.log(text)
  return Promise.resolve({ stdout: '', stderr: '' })
}

const log = (...messages) => console.log(...messages)
const liveExec = async (command) => {
  const promise = new Promise((resolve, reject) => {
    const child = spawn(command, [], { shell: true })

    child.stdout.on('data', function (data) {
      log('🟢stdout: ' + data.toString())
    })
    child.stderr.on('data', function (data) {
      const message = '🔴stderr: ' + data.toString()
      log(message)
      //reject(message)
    })
    child.on('close', function (code) {
      const message = 'child process exited with code ' + code
      console.log(message)
      resolve(message)
    })
  })

  return promise
}

/*
liveExec(
  'wget https://download.geofabrik.de/europe/france/bretagne-latest.osm.pbf'
)
*/

const exec = liveExec

export async function updatePlanetTiles() {
  console.log('Will download panoramax planet pmtiles')
  const { stdout, stderr } = await exec(
    'wget https://panoramax.openstreetmap.fr/pmtiles/planet.pmtiles -O ~/gtfs/data/pmtiles/planet.pmtiles'
  )
  console.log('-------------------------------')
  console.log('✅ Downloaded 🌍️')
  console.log('stdout:', stdout)

  console.log('stderr:', stderr)
}

updateFranceTiles()
export async function updateFranceTiles() {
  // Now france tiles

  /*
  await Promise.all(
    grid.map((zone) =>
      download(`https://osm.download.movisda.io/grid/${zone}-10-latest.osm.pbf`)
    )
  )
*/
  const tilemakerMerges = grid.map((zone, i) => {
    const command = `tilemaker --input ${zone}-10-latest.osm.pbf --output hexagone-plus.mbtiles --config ~/gtfs/tilemaker/resources/config-openmaptiles.json --process ~/gtfs/tilemaker/resources/process-openmaptiles.lua${
      i > 0 ? ' --merge' : ''
    }`

    const [program, ...args] = command.split(' ')
    console.log(program, args)
    return command
  })

  for (const command of tilemakerMerges) {
    console.log(command)
    await exec(command)
  }

  await exec(
    '~/pmtiles/pmtiles convert hexagone-plus.mbtiles hexagone-plus.pmtiles'
  )

  // sudo because this dir is handled by www-data
  await exec('sudo mv hexagone-plus.pmtiles ~/gtfs/data/pmtiles/')
  // wait until the above step is verified before deleting, we've got disk space
  //await exec('rm hexagone-plus.mbtiles')

  //await Promise.all(grid.map((zone) => exec(`rm ${zone}-10-latest.osm.pbf`)))

  console.log('Done updating 😀')
}

//updateTiles()

// Initialize mpb
const mpb = new MultiProgressBars({
  initMessage: ' $ Example Fullstack Build ',
  anchor: 'top',
  persist: true,
  border: true,
})

function download(url) {
  return new Promise(async (resolve, reject) => {
    const filename = url.split('/').slice(-1)[0]
    console.log('Will write', filename)
    console.log('Connecting …')
    const { data, headers } = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
    })
    const totalLength = headers['content-length']

    console.log('Starting download')
    const task = 'Downloading ' + filename
    mpb.addTask(task, {
      type: 'percentage',
      barColorFn: chalk.yellow,
    })
    const total = parseInt(totalLength)

    const writer = fs.createWriteStream(path.resolve('./', filename))

    data.on('data', (chunk) =>
      mpb.incrementTask(task, { percentage: (chunk.length / total) * 1 })
    )

    data.pipe(writer)

    data.on('end', () => resolve())
  })
}

/*
download(
  'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
)
*/
