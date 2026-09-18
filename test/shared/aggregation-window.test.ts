import { knex } from 'knex'

import { getAgreementScores } from '../../src/shared/database/agreement'
import calculateAgreementScore from '../../src/shared/database/agreement-score'
import { query } from '../../src/shared/database/utils'

jest.mock('../../src/shared/database/utils', () => ({ query: jest.fn() }))
jest.mock('../../src/shared/utils/config', () => ({
  agreement_coverage_threshold: 0.9,
  agreement_incomplete_share_threshold: 0.25,
}))
jest.mock('../../src/shared/utils/logger', () => () => ({ error: jest.fn() }))

const sql = knex({ client: 'pg' })
const validator = {
  master_key: 'synthetic-master',
  signing_key: 'synthetic-signing',
}
const start = new Date('2026-09-18T00:00:00.000Z')
const end = new Date('2026-09-19T00:00:00.000Z')
interface Bucket {
  start: Date
  agreement: { validated: number; missed: number; incomplete: boolean }
}
let fixtures: Bucket[] = []
let observedSql = ''

beforeEach(() => {
  fixtures = []
  ;(query as jest.Mock).mockImplementation((table: string) => {
    const builder = sql(table)
    // Compile the actual production Knex query; evaluate only its date predicates
    // over disposable fixtures, without connecting to PostgreSQL.
    builder.then = (async (resolve: (rows: Bucket[]) => unknown) => {
      const compiled = builder.toSQL()
      observedSql = compiled.sql
      const dates = compiled.bindings.filter(
        (value) => value instanceof Date,
      ) as Date[]
      const [lower, upper] = dates
      const inclusive = compiled.sql.includes('"start" >= ?')
      const upperInclusive = compiled.sql.includes('"start" <= ?')
      const rows = fixtures.filter(
        (row) =>
          (inclusive ? row.start >= lower : row.start > lower) &&
          (upperInclusive ? row.start <= upper : row.start < upper),
      )
      return Promise.resolve(rows).then(resolve)
    }) as typeof builder.then
    return builder
  })
})
afterAll(async () => {
  await sql.destroy()
})

function bucket(hour: number, validated = 100, missed = 0): Bucket {
  return {
    start: new Date(start.getTime() + hour * 3600000),
    agreement: { validated, missed, incomplete: false },
  }
}

test('empty real query resolves to zero totals and incomplete coverage', async () => {
  expect(await getAgreementScores(validator, start, end)).toEqual({
    validated: 0,
    missed: 0,
    incomplete: true,
  })
})

test('partial interior window preserves totals and incomplete coverage', async () => {
  fixtures = [bucket(3, 70, 30), bucket(4, 40, 60)]
  expect(await getAgreementScores(validator, start, end)).toEqual({
    validated: 110,
    missed: 90,
    incomplete: true,
  })
})

test('daily window includes its midnight bucket and excludes the next day', async () => {
  fixtures = Array.from({ length: 24 }, (_unused, hour) => bucket(hour))
  fixtures.push(bucket(-1, 999), bucket(24, 999))
  const result = await getAgreementScores(validator, start, end)
  expect(observedSql).toContain('"start" < ?')
  expect(result).toEqual({ validated: 2400, missed: 0, incomplete: false })
})

test('exact coverage and incomplete-share thresholds retain complete status', () => {
  expect(
    calculateAgreementScore(
      [
        { validated: 0, missed: 100, incomplete: true },
        ...Array.from({ length: 3 }, () => ({
          validated: 100,
          missed: 0,
          incomplete: false,
        })),
      ],
      4,
      1,
      0.25,
    ),
  ).toEqual({ validated: 300, missed: 100, incomplete: false })
})
