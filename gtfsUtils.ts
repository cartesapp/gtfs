import { parse, stringify } from 'jsr:@std/csv'

export const prefixGtfsColumnValues = async (csvFileName, prefix, column) => {
  try {
    const textCsv = await Deno.readTextFile(csvFileName)

    const data = parse(textCsv, {
      skipFirstRow: true,
      strip: true,
    })
    const newData = data.map((line) => ({
      ...line,
      [column]: prefix + line[column],
    }))

    const newCsv = stringify(newData, {
      columns: Object.keys(newData[0]),
    })

    await Deno.writeTextFile(csvFileName, newCsv)

    console.log('Prefixed service_ids in ' + csvFileName)
  } catch (e) {
    console.log(e)
  }
}

export const prefixGtfsServiceIds = (gtfsDir, prefix) => {
  prefixGtfsColumnValues(gtfsDir + '/calendar_dates.txt', prefix, 'service_id')
  prefixGtfsColumnValues(gtfsDir + '/calendars.txt', prefix, 'service_id')
  prefixGtfsColumnValues(gtfsDir + '/trips.txt', prefix, 'service_id')
}
