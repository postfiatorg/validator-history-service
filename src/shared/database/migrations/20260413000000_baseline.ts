/* eslint-disable import/no-unused-modules, jsdoc/require-jsdoc, complexity --
   Knex loads migrations from disk, not via imports. */
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('crawls'))) {
    await knex.schema.createTable('crawls', (table) => {
      table.string('public_key').primary()
      table.dateTime('start')
      table.string('complete_ledgers')
      table.text('complete_shards')
      table.text('incomplete_shards')
      table.string('ip')
      table.integer('port')
      table.string('networks')
      table.string('type')
      table.integer('uptime')
      table.integer('inbound_count')
      table.integer('outbound_count')
      table.string('server_state')
      table.integer('io_latency_ms')
      table.string('load_factor_server')
      table.string('version')
    })
  }

  if (!(await knex.schema.hasTable('location'))) {
    await knex.schema.createTable('location', (table) => {
      table.string('public_key').primary()
      table.foreign('public_key').references('crawls.public_key')
      table.string('ip')
      table.decimal('lat')
      table.decimal('long')
      table.string('continent')
      table.string('country')
      table.string('region')
      table.string('city')
      table.string('postal_code')
      table.string('region_code')
      table.string('country_code')
      table.string('timezone')
      table.string('isp')
      table.string('org')
      table.string('domain')
      table.string('location_source')
      table.dateTime('updated')
    })
  }

  if (!(await knex.schema.hasTable('manifests'))) {
    await knex.schema.createTable('manifests', (table) => {
      table.string('master_key')
      table.string('signing_key')
      table.string('master_signature').unique()
      table.string('signature')
      table.string('domain')
      table.boolean('domain_verified')
      table.boolean('revoked')
      table.bigInteger('seq')
    })
  }

  if (!(await knex.schema.hasTable('validators'))) {
    await knex.schema.createTable('validators', (table) => {
      table.string('master_key')
      table.string('signing_key').unique()
      table.boolean('revoked')
      table.string('ledger_hash')
      table.bigInteger('current_index')
      table.integer('load_fee')
      table.boolean('partial')
      table.string('chain')
      table.string('networks')
      table.string('unl')
      table.string('domain')
      table.boolean('domain_verified')
      table.string('server_version')
      table.dateTime('last_ledger_time')
      table.json('agreement_1hour')
      table.json('agreement_24hour')
      table.json('agreement_30day')
    })
  }

  if (!(await knex.schema.hasTable('hourly_agreement'))) {
    await knex.schema.createTable('hourly_agreement', (table) => {
      table.string('main_key')
      table.dateTime('start')
      table.json('agreement')
      table.primary(['main_key', 'start'])
    })
  }

  if (!(await knex.schema.hasTable('daily_agreement'))) {
    await knex.schema.createTable('daily_agreement', (table) => {
      table.string('main_key')
      table.dateTime('day')
      table.json('agreement')
      table.primary(['main_key', 'day'])
    })
  }

  if (!(await knex.schema.hasTable('networks'))) {
    await knex.schema.createTable('networks', (table) => {
      table.string('id')
      table.string('entry')
      table.integer('port')
      table.string('unls')
      table.primary(['entry'])
    })
  }

  if (!(await knex.schema.hasTable('amendments_status'))) {
    await knex.schema.createTable('amendments_status', (table) => {
      table.string('amendment_id')
      table.string('networks')
      table.integer('ledger_index')
      table.string('tx_hash')
      table.dateTime('date')
      table.dateTime('eta')
      table.primary(['amendment_id', 'networks'])
    })
  }

  if (!(await knex.schema.hasTable('amendments_info'))) {
    await knex.schema.createTable('amendments_info', (table) => {
      table.string('id')
      table.string('name')
      table.string('rippled_version')
      table.boolean('deprecated')
      table.primary(['id'])
    })
  }

  if (!(await knex.schema.hasTable('ballot'))) {
    await knex.schema.createTable('ballot', (table) => {
      table.string('signing_key').unique()
      table.string('ledger_index')
      table.string('amendments', 10000)
      table.integer('base_fee')
      table.integer('reserve_base')
      table.integer('reserve_inc')
    })
  }

  if (!(await knex.schema.hasTable('connection_health'))) {
    await knex.schema.createTable('connection_health', (table) => {
      table.string('ws_url').primary()
      table.string('public_key').references('crawls.public_key')
      table.string('network')
      table.boolean('connected')
      table.dateTime('status_update_time')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('connection_health')
  await knex.schema.dropTableIfExists('ballot')
  await knex.schema.dropTableIfExists('amendments_info')
  await knex.schema.dropTableIfExists('amendments_status')
  await knex.schema.dropTableIfExists('networks')
  await knex.schema.dropTableIfExists('daily_agreement')
  await knex.schema.dropTableIfExists('hourly_agreement')
  await knex.schema.dropTableIfExists('validators')
  await knex.schema.dropTableIfExists('manifests')
  await knex.schema.dropTableIfExists('location')
  await knex.schema.dropTableIfExists('crawls')
}
