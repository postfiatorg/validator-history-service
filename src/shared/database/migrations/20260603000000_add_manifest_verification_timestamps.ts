/* eslint-disable import/no-unused-modules, jsdoc/require-jsdoc --
   Knex loads migrations from disk, not via imports. */
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasLastVerified = await knex.schema.hasColumn(
    'manifests',
    'last_verified',
  )
  const hasLastChecked = await knex.schema.hasColumn(
    'manifests',
    'last_checked',
  )

  if (!hasLastVerified || !hasLastChecked) {
    await knex.schema.alterTable('manifests', (table) => {
      if (!hasLastVerified) {
        table.dateTime('last_verified')
      }
      if (!hasLastChecked) {
        table.dateTime('last_checked')
      }
    })
  }

  // Seed a verification baseline for already-verified manifests so the staleness
  // backstop has a reference point. last_checked is left null so the first cycle
  // after deploy re-verifies every manifest once and establishes fresh timestamps.
  if (!hasLastVerified) {
    await knex('manifests')
      .where('domain_verified', true)
      .update({ last_verified: knex.fn.now() })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('manifests', (table) => {
    table.dropColumn('last_checked')
    table.dropColumn('last_verified')
  })
}
