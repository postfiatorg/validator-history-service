import {
  destroy,
  initializeDatabase,
  query,
  tearDown,
} from '../../src/shared/database'

/**
 * Checks whether a migrated table is present by issuing a query that rejects
 * when the relation does not exist.
 *
 * @returns Whether the crawls table currently exists.
 */
async function crawlsTableExists(): Promise<boolean> {
  try {
    await query('crawls').count()
    return true
  } catch (_err) {
    return false
  }
}

describe('database teardown and reinitialization', () => {
  afterAll(async () => {
    await tearDown()
    await destroy()
  })

  test('reinitialization rebuilds the schema dropped by teardown', async () => {
    await initializeDatabase()
    expect(await crawlsTableExists()).toBe(true)

    // A prior suite's teardown drops the tables and the migration bookkeeping.
    await tearDown()
    expect(await crawlsTableExists()).toBe(false)

    // Reinitialization must re-run the migrations and recreate the schema.
    // Without resetting knex_migrations in teardown, migrate.latest() would
    // treat the migrations as already applied and leave the tables missing.
    await initializeDatabase()
    expect(await crawlsTableExists()).toBe(true)
  })
})
