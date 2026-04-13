import logger from '../utils/logger'

import networks from './networks'
import addAmendmentsDataFromJSON from './update-amendments-from-json'
import { db, query } from './utils'

const log = logger({ name: 'database-initialize' })

async function seedNetworks(): Promise<void> {
  await Promise.all(
    networks.map(async (network) =>
      query('networks')
        .insert({
          id: network.id,
          entry: network.entry,
          port: network.port,
          unls: network.unls.join(','),
        })
        .onConflict('entry')
        .ignore()
        .catch((err: Error) =>
          log.error(`Error seeding network ${network.entry}: ${err.message}`),
        ),
    ),
  )
}

export default async function initializeDatabase(): Promise<void> {
  await db().migrate.latest()
  await seedNetworks()
  await addAmendmentsDataFromJSON()
}
