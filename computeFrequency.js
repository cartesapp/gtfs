const oneDay = 24 * 60 * 60 * 1000 // hours*minutes*seconds*milliseconds
export function computeFrequencyPerDay(calendars, calendarDates) {
  if (calendars.length > 0) return 0 // not handled yet, minimum, the front-end needs to use a max(x, 0.1) for now

  const dates = calendarDates
    .map((el) => {
      if (el.exception_type === 2) return null

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
