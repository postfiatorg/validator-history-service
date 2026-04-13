import * as path from 'path'

import type { Knex } from 'knex'

const migrations: Knex.MigratorConfig = {
  directory: path.join(__dirname, 'migrations'),
  loadExtensions: ['.js', '.ts'],
  tableName: 'knex_migrations',
}

export default migrations
