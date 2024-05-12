const oneDay = 24 * 60 * 60 * 1000 // hours*minutes*seconds*milliseconds
export function computeFrequencyPerDay(calendars, calendarDates) {
  if (calendars.length > 0) return 0 // TODO not handled yet, minimum, the front-end needs to use a max(x, 0.1) for now

  const dates = calendarDates
    .map((el) => {
      if (el.exception_type === 2) return null // used when calendars

      const d = '' + el.date

      //20240427
      const year = d.slice(0, 4),
        month = +d.slice(4, 6),
        day = +d.slice(6, 8)
      return new Date(year, month, day)
    })
    .filter(Boolean)

  const daysRange =
    Math.round(Math.abs((Math.max(...dates) - Math.min(...dates)) / oneDay)) + 1

  return dates.length / daysRange
}

export function computeIsNight(stopTimes) {
  //departure_time: '08:10:00'
  const nightDepartures = stopTimes.filter(({ departure_time }) => {
    const hour = +departure_time.slice(0, 2)

    // Saint-Malo (agency_id:MAT) has "bus de soir" starting at 19h20
    const condition = hour >= 19 || hour < 7

    return condition
  })
  return nightDepartures.length > 0.8 * stopTimes.length
}

const options = { weekday: 'long' }

export const getWeekday = (date) =>
  new Intl.DateTimeFormat('fr-FR', options).format(date)

export const dateFromString = (d) => {
  const year = d.slice(0, 4),
    month = +d.slice(4, 6),
    day = +d.slice(6, 8)
  const date = new Date(year, month - 1, day)
  return date
}

export const isMorning = (h) => h >= 6 && h <= 9
export const isAfternoon = (h) => h >= 16 && h <= 19
export const isLunch = (h) => h >= 12 && h < 15

// string date to date object mapping to cache date creation between agencies
const weekdaysMap = new Map()

export function computeIsSchool(calendars, calendarDates, stopTimes) {
  // the Bretagne region does not use calendars, whereas Saint-Malo, a source of Bretagne GTFS, uses it. Good to know for debugging
  if (calendars.length > 0) return null // not handled yet TODO

  const weekdaysSet = new Set(
    calendarDates.map((el) => {
      //20240427
      const found = weekdaysMap.get(el.date)
      if (found) return found
      const date = dateFromString('' + el.date)
      const weekday = getWeekday(date)
      weekdaysMap.set(el.date, weekday)
      return weekday
    })
  )

  const weekdays = [...weekdaysSet]
  if (weekdays.length > 5) return
  if (weekdays.includes('dimanche') || weekdays.includes('samedi')) return false

  const condition = stopTimes.every(({ departure_time }) => {
    const hour = +departure_time.slice(0, 2)

    /*
    const mercredi =
      weekdays.length === 1 &&
      weekdays[0] === 'mercredi' &&
      (isMorning(h) || isLunch(h))

	  */

    const stopCondition = isLunch(hour) || isMorning(hour) || isAfternoon(hour)

    return stopCondition
  })

  return condition
}
