import express from 'express'
import { openDb, getStops, closeDb, getStoptimes } from 'gtfs'
import { importGtfs } from 'gtfs'
import { readFile } from 'fs/promises'

const config = JSON.parse(
  await readFile(new URL('./config.json', import.meta.url))
)
import fs from 'fs'
const app = express()
const port = process.env.PORT || 3000
import { Readable } from 'node:stream'

const url = 'https://www.korrigo.bzh/ftp/OPENDATA/KORRIGOBRET.gtfs.zip'

const fetchGTFS = async () => {
  const response = await fetch(url)
  const fileWriteStream = fs.createWriteStream('./gtfs/bretagne.zip')
  const readableStream = Readable.fromWeb(response.body)
  readableStream.pipe(fileWriteStream)
  setTimeout(() => {
    importGtfs(config)
  }, 20000)
}

fetchGTFS()

app.get('/', (req, res) => {
  try {
    const db = openDb(config)
    const stops = getStoptimes({
      stop_id: ['STAR:1320'],
    })
    console.log(stops)
    res.json(stops)

    //  closeDb(db);
  } catch (error) {
    console.error(error)
  }
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
