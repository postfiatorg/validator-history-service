import {
  normalizeManifest,
  verifyValidatorDomain,
} from 'xrpl-validator-domains'

import {
  saveManifest,
  getValidatorKeys,
  query,
  db,
  getNetworks,
} from '../shared/database'
import {
  StreamManifest,
  Manifest,
  UNLBlob,
  UNLValidator,
  DatabaseManifest,
} from '../shared/types'
import { fetchValidatorsFromRpc, fetchRpcManifest, getLists } from '../shared/utils'
import logger from '../shared/utils/logger'

import hard_dunl from './fixtures/unl-hard.json'

const log = logger({ name: 'manifests' })
const MANIFESTS_JOB_INTERVAL = 5 * 60 * 1000 // 5 minutes
let jobsStarted = false

/**
 * Performs Domain verification and saves the Manifest.
 *
 * @param manifest - Manifest to be handled. Can be a Manifest, StreamManifest or hex string.
 * @returns A promise that resolves to void whether or not the manifest was saved.
 */
export async function handleManifest(
  manifest: Manifest | StreamManifest | string,
): Promise<void> {
  let verification
  try {
    verification = await verifyValidatorDomain(manifest)
  } catch {
    let normalized
    try {
      normalized = normalizeManifest(manifest)
    } catch (err: unknown) {
      log.error('Manifest could not be normalized', err)
      return
    }
    log.warn(
      `Domain verification failed for manifest (master key): ${normalized.master_key}`,
    )
    const dBManifest: DatabaseManifest = {
      domain_verified: false,
      ...normalized,
    }
    await saveManifest(dBManifest)
    return
  }
  if (verification.verified_manifest_signature && verification.manifest) {
    const dBManifest: DatabaseManifest = {
      domain_verified: verification.verified,
      ...verification.manifest,
    }
    await saveManifest(dBManifest)
  }
}

/**
 * Saves manifests from the UNL.
 *
 * @returns A promise that resolves to void once all UNL validators are saved.
 */
export async function updateUNLManifests(): Promise<void> {
  const networks = (await getNetworks()).map((network) => network.id)
  const promises = networks.map(async (network) =>
    updateUNLManifestNetwork(network),
  )
  await Promise.all(promises)
}

/**
 * Saves manifests from the UNL.
 * Fetches validators directly from the rippled node using RPC.
 *
 * @param _network - The network to update (unused, kept for compatibility).
 * @returns A promise that resolves to void once all UNL validators are saved.
 */
async function updateUNLManifestNetwork(_network: string): Promise<void> {
  try {
    log.info('Fetching UNL from rippled RPC...')
    const unl: UNLBlob = await fetchValidatorsFromRpc()
    const promises: Array<Promise<void>> = []

    unl.validators.forEach((validator: UNLValidator) => {
      const manifestHex = Buffer.from(validator.manifest, 'base64')
        .toString('hex')
        .toUpperCase()
      promises.push(handleManifest(manifestHex))
    })
    await Promise.all(promises)
  } catch (err) {
    log.error('Error updating UNL manifests', err)
  }
}

/**
 * This function loops through all signing keys in the validators table and queries rippled
 * to find the most recent manifest available.
 *
 * @returns A promise that resolves to void once all of the latest manifests have been saved.
 */
export async function updateManifestsFromRippled(): Promise<void> {
  try {
    log.info('Getting latest Manifests...')
    const keys = await getValidatorKeys()

    const manifestPromises: Array<Promise<string | undefined>> = []

    keys.forEach((key) => {
      manifestPromises.push(fetchRpcManifest(key))
    })

    const manifests = await Promise.all(manifestPromises)

    const handleManifestPromises: Array<Promise<void>> = []
    for (const manifestHex of manifests) {
      // eslint-disable-next-line max-depth -- necessary depth
      if (manifestHex) {
        handleManifestPromises.push(handleManifest(manifestHex))
      }
    }
    await Promise.all(handleManifestPromises)
    log.info('Manifests updated')
  } catch (err) {
    log.error(`Error updating manifests from rippled`, err)
  }
}

/**
 * This function updates the domains and verification status of each validator in the validators table
 * from the corresponding manifest in the manifests table.
 *
 * @returns A promise that resolves to void once all of the latest manifests have been saved.
 */
async function updateValidatorDomainsFromManifests(): Promise<void> {
  log.info('Updating validator domains...')
  try {
    await db().raw(
      'UPDATE validators SET domain = manifests.domain, domain_verified = manifests.domain_verified FROM manifests WHERE validators.signing_key = manifests.signing_key AND manifests.domain IS NOT NULL',
    )
  } catch (err) {
    log.error('Error updating validator domains', err)
  }
  log.info('Finished updating validator domains')
}

/**
 * Update the unl column if the validator is included in a validator list for a network.
 * The unl column now stores 'rpc' to indicate validators are fetched from the rippled node.
 *
 * @returns A promise that resolves to void once unl column is updated for all applicable validators.
 */
export async function updateUnls(): Promise<void> {
  try {
    const lists = await getLists()
    log.info('Updating validator unls...')
    for (const [_name, list] of Object.entries(lists)) {
      // Use signing keys directly from the UNL blob
      const keys: string[] = Array.from(list)

      // Mark validators as fetched from RPC instead of a domain
      const networkUNL = 'rpc'
      await query('validators')
        .whereIn('signing_key', keys)
        .update({ unl: networkUNL })
      await query('validators')
        .whereNotIn('signing_key', keys)
        .where('unl', '=', networkUNL)
        .update({ unl: null })
    }
    log.info('Finished updating validator unls')
  } catch (err) {
    log.error(`Error updating validator unls`, err)
  }
}

/**
 * Updates the master keys in the validators table from the manifests in the manifests table.
 *
 * @returns A promise that resolves to void once all master keys are updated.
 */
async function updateValidatorMasterKeys(): Promise<void> {
  log.info('Updating validator master keys...')
  try {
    await db().raw(
      'UPDATE validators SET master_key = manifests.master_key FROM manifests WHERE validators.signing_key = manifests.signing_key',
    )
  } catch (err) {
    log.error(`Error updating validator master keys`, err)
  }
  log.info('Finished updating validator master keys')
}

/**
 * Checks all manifests and marks old ones as revoked if a newer manifest exists
 * for the same master_key.
 *
 * @returns Void.
 */
async function updateManifestRevocations(): Promise<void> {
  log.info('Updating manifest revocations...')
  try {
    // Mark manifests as revoked if a newer manifest exists for the same master_key
    await db().raw(`
      UPDATE manifests SET revoked = true
      WHERE EXISTS (
        SELECT 1 FROM manifests m2
        WHERE m2.master_key = manifests.master_key
        AND m2.seq > manifests.seq
      )
    `)

    // Mark manifests as not revoked if they are the latest
    await db().raw(`
      UPDATE manifests SET revoked = false
      WHERE NOT EXISTS (
        SELECT 1 FROM manifests m2
        WHERE m2.master_key = manifests.master_key
        AND m2.seq > manifests.seq
      )
    `)
  } catch (err) {
    log.error(`Error updating manifest revocations`, err)
  }
  log.info('Finished updating manifest revocations')
}

/**
 * Updates the revoked column of the validators table
 * Signing keys have been revoked when a manifest with a greater seq has been seen.
 *
 * @returns Void.
 */
async function updateRevocations(): Promise<void> {
  log.info('Updating revocations...')
  try {
    // Copy revoked status from manifests table to validators table
    await db().raw(
      'UPDATE validators SET revoked = manifests.revoked FROM manifests WHERE validators.signing_key = manifests.signing_key',
    )

    // Mark validators as revoked if their signing key doesn't match the latest manifest for their master_key
    // This handles cases where old validators exist but their old manifest was never saved
    await db().raw(`
      UPDATE validators v SET revoked = true
      WHERE v.master_key IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM manifests m
        WHERE m.master_key = v.master_key
        AND m.signing_key != v.signing_key
        AND m.revoked = false
      )
    `)
  } catch (err) {
    log.error(`Error updating revocations`, err)
  }
  log.info('Finished updating revocations')
}

/**
 * Deletes validators that are older than a week.
 *
 * @returns Void.
 */
async function purgeOldValidators(): Promise<void> {
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  log.info('Deleting old validators')
  try {
    await query('validators').where('last_ledger_time', '<', oneWeekAgo).del()
  } catch (err) {
    log.error(`Error purging old validators`, err)
  }
  log.info('Finished deleting old validators')
}

/**
 * Deletes validators with revoked signing keys.
 * This removes old signing keys when a validator rotates to a new key.
 *
 * @returns Void.
 */
async function purgeRevokedValidators(): Promise<void> {
  log.info('Deleting revoked validators')
  try {
    await query('validators').where('revoked', '=', true).del()
  } catch (err) {
    log.error(`Error purging revoked validators`, err)
  }
  log.info('Finished deleting revoked validators')
}

/**
 * Hard codes dUNL validators.
 *
 * @returns Void.
 */
async function updateHardCodedUnls(): Promise<void> {
  log.info('Hard coding validators from dUNL (ddv pending)...')

  interface HardCoded {
    [key: string]: string
  }
  const obj = hard_dunl as HardCoded
  for (const master_key of Object.keys(obj)) {
    try {
      void query('validators')
        .where('master_key', '=', master_key)
        .whereNull('domain')
        .update({ domain: obj[master_key] }, ['master_key'])
        .catch((err) => log.error(`Hard coding error - query error`, err))
    } catch (err) {
      log.error(`Error updating hard coded UNL validators`, err)
    }
  }
  log.info('Finished hard coding dUNL validators')
}

async function jobs(): Promise<void> {
  await updateUNLManifests()
  await updateManifestsFromRippled()
  await updateValidatorDomainsFromManifests()
  await updateUnls()
  await updateValidatorMasterKeys()
  await updateManifestRevocations()
  await updateRevocations()
  await purgeRevokedValidators()
  await purgeOldValidators()
  await updateHardCodedUnls()
}

export async function doManifestJobs(): Promise<void> {
  if (!jobsStarted) {
    jobs().catch((err) => log.error(`Error starting manifest jobs`, err))
    setInterval(() => {
      jobsStarted = true
      jobs().catch((err) => log.error(`Error starting manifest jobs`, err))
    }, MANIFESTS_JOB_INTERVAL)
  }
}
