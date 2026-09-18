import { knex, Knex } from 'knex'

import {
  saveDailyAgreement,
  saveHourlyAgreement,
  update1HourValidatorAgreement,
} from '../../src/shared/database/agreement'
import { query } from '../../src/shared/database/utils'

jest.mock('../../src/shared/database/utils', () => ({ query: jest.fn() }))
jest.mock('../../src/shared/utils/config', () => ({ network_id: 'fixture' }))
jest.mock('../../src/shared/utils/logger', () => () => ({ error: jest.fn() }))

const score = { validated: 100, missed: 0, incomplete: false }

async function completionCase(
  operation: () => Promise<void>,
  rejectWrite = false,
): Promise<{ premature: boolean; sql: string }> {
  let release: (value?: unknown) => void = () => undefined
  let fail: (reason: Error) => void = () => undefined
  const pending = new Promise((resolve, reject) => {
    release = resolve
    fail = reject
  })
  const db = knex({ client: 'pg' })
  let sql = ''
  // Actual Knex builder/compiler, only runner I/O replaced; no PostgreSQL.
  Object.defineProperty(db.client, 'runner', {
    value: (builder: Knex.QueryBuilder): { run: () => Promise<unknown> } => ({
      async run(): Promise<unknown> {
        sql = builder.toSQL().sql
        return pending
      },
    }),
  })
  ;(query as jest.Mock).mockImplementation((table: string) => db(table))
  let settled = false
  const operationPromise = operation().then(() => {
    settled = true
  })
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve()
  }
  const premature = settled
  if (rejectWrite) {
    fail(new Error('synthetic write rejection'))
  } else {
    release([])
  }
  await operationPromise
  // Drain catch handlers in the unguarded daily baseline too.
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve()
  }
  await db.destroy()
  return { premature, sql }
}

describe('agreement persistence completion contract', () => {
  test.each([false, true])(
    'daily save waits for write settlement (reject=%s)',
    async (rejectWrite) => {
      const result = await completionCase(
        async () =>
          saveDailyAgreement({
            main_key: 'fixture-key',
            day: new Date(0),
            agreement: score,
          }),
        rejectWrite,
      )
      expect(result.sql).toContain('insert into "daily_agreement"')
      expect(result.sql).toContain('on conflict ("main_key", "day") do update')
      expect(result.premature).toBe(false)
    },
  )
  test.each([false, true])(
    'hourly save already waits for write settlement (reject=%s)',
    async (rejectWrite) => {
      const result = await completionCase(
        async () =>
          saveHourlyAgreement({
            main_key: 'fixture-key',
            start: new Date(0),
            agreement: score,
          }),
        rejectWrite,
      )
      expect(result.sql).toContain('insert into "hourly_agreement"')
      expect(result.premature).toBe(false)
    },
  )
  test.each([false, true])(
    'validator update already waits for write settlement (reject=%s)',
    async (rejectWrite) => {
      const result = await completionCase(
        async () =>
          update1HourValidatorAgreement(
            { master_key: 'fixture-key', signing_key: 'fixture-signing' },
            score,
          ),
        rejectWrite,
      )
      expect(result.sql).toContain('update "validators"')
      expect(result.premature).toBe(false)
    },
  )
})
