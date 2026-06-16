import { normalizeManifest } from 'xrpl-validator-domains'

import {
  saveManifest,
  getManifestVerificationState,
  updateManifestVerification,
  getValidatorKeys,
  query,
  db,
  getNetworks,
  ManifestVerificationState,
} from '../shared/database'
import {
  StreamManifest,
  Manifest,
  UNLBlob,
  UNLValidator,
} from '../shared/types'
import {
  fetchValidatorsFromRpc,
  fetchRpcManifest,
  getLists,
} from '../shared/utils'
import {
  verifyValidatorDomain,
  DomainVerification,
} from '../shared/utils/domain-verification'
import logger from '../shared/utils/logger'

import hard_dunl from './fixtures/unl-hard.json'

const log = logger({ name: 'manifests' })
const MANIFESTS_JOB_INTERVAL = 5 * 60 * 1000 // 5 minutes
// A verified domain checked within this window is not re-fetched, regardless of
// how many triggers fire. Unverified or never-established domains use the
// shorter DOMAIN_RETRY_INTERVAL instead, and new or rotated manifests have no
// prior check and are verified immediately.
const DOMAIN_REVERIFY_INTERVAL = 12 * 60 * 60 * 1000 // 12 hours
// Domains that are not currently verified are re-probed on this shorter
// interval so a recovered domain re-verifies within a job cycle instead of
// waiting up to DOMAIN_REVERIFY_INTERVAL. Floored to the job cycle so the
// manifest stream cannot trigger repeated TOML fetches between scheduled runs;
// when stream activity resets the check timestamp just after a job tick, a
// re-probe can slip to the next tick, bounding worst-case recovery at two cycles.
const DOMAIN_RETRY_INTERVAL = MANIFESTS_JOB_INTERVAL
// A verified domain that stays unreachable beyond this window is downgraded to
// unverified, so abandoned domains eventually converge to the truth without
// reintroducing short-term flapping.
const DOMAIN_STALE_THRESHOLD = 7 * 24 * 60 * 60 * 1000 // 7 days
let jobsStarted = false

/**
 * Determines whether a manifest's domain was checked within the given interval
 * and re-verification should therefore be skipped this cycle.
 *
 * @param last_checked - When the manifest's domain was last checked.
 * @param now - The current time.
 * @param interval - The applicable re-verification interval.
 * @returns Whether re-verification should be skipped.
 */
function checkedRecently(
  last_checked: Date | null,
  now: Date,
  interval: number,
): boolean {
  if (!last_checked) {
    return false
  }
  return now.getTime() - new Date(last_checked).getTime() < interval
}

/**
 * Selects the re-verification interval for a manifest from its stored
 * verification state. A verified domain is re-checked on the slow interval to
 * limit load on healthy endpoints, while an unverified or never-established
 * domain is retried on the short interval so a recovered domain re-verifies
 * within a job cycle instead of up to the slow interval later.
 *
 * @param existing - The stored verification state.
 * @returns The interval in milliseconds.
 */
function reverifyInterval(existing: ManifestVerificationState): number {
  return existing.domain_verified
    ? DOMAIN_REVERIFY_INTERVAL
    : DOMAIN_RETRY_INTERVAL
}

/**
 * Performs Domain verification and saves the Manifest.
 *
 * @param manifest - Manifest to be handled. Can be a Manifest, StreamManifest or hex string.
 * @returns A promise that resolves to void whether or not the manifest was saved.
 */
export async function handleManifest(
  manifest: Manifest | StreamManifest | string,
): Promise<void> {
  let normalized
  try {
    normalized = normalizeManifest(manifest)
  } catch (err: unknown) {
    log.error('Manifest could not be normalized', err)
    return
  }

  const now = new Date()
  const masterSignature = normalized.master_signature
  const existing = masterSignature
    ? await getManifestVerificationState(masterSignature)
    : undefined

  // Throttle: skip a domain re-checked within its applicable interval. Verified
  // domains use the slow interval; unverified or never-established domains use a
  // short interval so a recovered domain re-verifies within a job cycle. A new
  // or rotated manifest has no prior row and verifies now.
  if (
    existing &&
    checkedRecently(existing.last_checked, now, reverifyInterval(existing))
  ) {
    return
  }

  log.info(
    `Processing manifest for master_key: ${
      normalized.master_key
    }, signing_key: ${normalized.signing_key ?? 'unknown'}, domain: ${
      normalized.domain ?? 'none'
    }`,
  )

  let verification
  try {
    verification = await verifyValidatorDomain(manifest)
  } catch (err: unknown) {
    // Unexpected failure: preserve the last-known state rather than assert false.
    log.error(
      `Domain verification exception for ${normalized.master_key} (domain: ${
        normalized.domain ?? 'none'
      })`,
      err,
    )
    if (masterSignature && existing) {
      await updateManifestVerification(masterSignature, { last_checked: now })
    }
    return
  }

  log.info(
    `Domain verification for ${normalized.master_key}: status=${verification.status}, message="${verification.message}"`,
  )

  if (verification.status === DomainVerification.InvalidManifest) {
    // The manifest signature itself is unverifiable; do not persist or overwrite.
    log.warn(
      `Manifest signature verification failed for ${normalized.master_key}, not saving to database`,
    )
    return
  }

  if (verification.status === DomainVerification.Verified) {
    await saveManifest({
      ...verification.manifest,
      domain_verified: true,
      last_verified: now,
      last_checked: now,
    })
    return
  }

  if (verification.status === DomainVerification.Failed) {
    await saveManifest({
      ...verification.manifest,
      domain_verified: false,
      last_checked: now,
    })
    return
  }

  // DomainVerification.Unreachable: the TOML could not be retrieved.
  await handleUnreachableDomain(
    verification.manifest,
    masterSignature,
    existing,
    now,
  )
}

/**
 * Handles a manifest whose domain TOML could not be retrieved. Preserves the
 * last-known verification state, advancing only the check timestamp, and
 * downgrades a previously verified domain that has been unreachable past the
 * staleness threshold.
 *
 * @param manifest - The normalized manifest.
 * @param masterSignature - The manifest's master signature, if present.
 * @param existing - The stored verification state, if any.
 * @param now - The current time.
 * @returns Void.
 */
async function handleUnreachableDomain(
  manifest: Manifest,
  masterSignature: string | undefined,
  existing:
    | { domain_verified: boolean | null; last_verified: Date | null }
    | undefined,
  now: Date,
): Promise<void> {
  if (!existing || !masterSignature) {
    // Never-seen manifest we cannot reach: store its metadata with an unknown
    // (null) verification rather than asserting an unverified result.
    await saveManifest({
      ...manifest,
      domain_verified: null,
      last_checked: now,
    })
    return
  }

  const lastVerified = existing.last_verified
    ? new Date(existing.last_verified).getTime()
    : undefined
  const stale =
    existing.domain_verified &&
    lastVerified !== undefined &&
    now.getTime() - lastVerified > DOMAIN_STALE_THRESHOLD

  if (stale) {
    log.warn(
      `Domain for ${manifest.master_key} unreachable since ${String(
        existing.last_verified,
      )}; downgrading to unverified`,
    )
    await updateManifestVerification(masterSignature, {
      domain_verified: false,
      last_checked: now,
    })
    return
  }

  await updateManifestVerification(masterSignature, { last_checked: now })
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
