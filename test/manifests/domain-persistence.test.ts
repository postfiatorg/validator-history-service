import { handleManifest } from '../../src/connection-manager/manifests'
import {
  destroy,
  query,
  initializeDatabase,
  tearDown,
} from '../../src/shared/database'
import {
  verifyValidatorDomain,
  DomainVerification,
} from '../../src/shared/utils/domain-verification'

jest.mock('../../src/shared/utils/domain-verification', () => ({
  __esModule: true,
  // Mirrors the real enum's string values so handleManifest's comparisons hold.
  DomainVerification: {
    InvalidManifest: 'invalid_manifest',
    Failed: 'failed',
    Unreachable: 'unreachable',
    Verified: 'verified',
  },
  verifyValidatorDomain: jest.fn(),
}))

const mockVerify = verifyValidatorDomain as jest.Mock

const MASTER_KEY = 'nHDaeKJcfRzzmx3gGKnrFTQazYi95tdGrdoiCYLinoU9EkJsp4Ho'
const SIGNING_KEY = 'n9KhXam7XB436XHhzo3aTzEW5NxkKwVDkuy9DwdDC1ja8j8mv3ot'
const MASTER_SIGNATURE =
  '7CA31C480E2ED7DBD1C2A0CA950545C73C7EB9838D5A5C5D16D61DFDB47EBC23DAF2BD25B9AA4FE5B8E39D30C575501BC7EE4042E068D935D6D97391B3B46706'

const manifest = {
  master_key: MASTER_KEY,
  master_signature: MASTER_SIGNATURE,
  seq: 1,
  signature:
    '30440220711EC38538E10E01198086D85D4728E81993ADD0746E6D3CEF2E12DC3C3A3A92022046F698FD1B1B3222498049D6006E95EC1422C4E0CB2BFD0D210A4709BAF17A08',
  signing_key: SIGNING_KEY,
}

const verifiedManifest = { ...manifest, domain: 'example.test' }

interface SeedFields {
  domain_verified: boolean | null
  last_verified?: Date
  last_checked?: Date
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

async function seedManifest(fields: SeedFields): Promise<void> {
  await query('manifests').insert({
    master_key: MASTER_KEY,
    signing_key: SIGNING_KEY,
    master_signature: MASTER_SIGNATURE,
    domain: 'example.test',
    revoked: false,
    seq: 1,
    ...fields,
  })
}

async function readDomainVerified(): Promise<boolean | null> {
  const rows = (await query('manifests')
    .select('domain_verified')
    .where({ master_signature: MASTER_SIGNATURE })) as Array<{
    domain_verified: boolean | null
  }>
  return rows[0]?.domain_verified ?? null
}

async function readLastVerified(): Promise<Date | null> {
  const rows = (await query('manifests')
    .select('last_verified')
    .where({ master_signature: MASTER_SIGNATURE })) as Array<{
    last_verified: Date | null
  }>
  return rows[0]?.last_verified ?? null
}

describe('domain verification persistence', () => {
  beforeAll(async () => {
    await tearDown()
    await initializeDatabase()
  })

  afterAll(async () => {
    await tearDown()
    await destroy()
  })

  beforeEach(async () => {
    mockVerify.mockReset()
    await query('manifests').delete('*')
    await query('validators').delete('*')
  })

  test('preserves a verified domain when the TOML is unreachable', async () => {
    await seedManifest({
      domain_verified: true,
      last_verified: hoursAgo(1),
      last_checked: hoursAgo(13),
    })
    mockVerify.mockResolvedValue({
      status: DomainVerification.Unreachable,
      message: 'unreachable',
      manifest: verifiedManifest,
    })

    await handleManifest(manifest)

    expect(await readDomainVerified()).toBe(true)
  })

  test('downgrades when the fetched TOML fails verification', async () => {
    await seedManifest({
      domain_verified: true,
      last_verified: hoursAgo(1),
      last_checked: hoursAgo(13),
    })
    mockVerify.mockResolvedValue({
      status: DomainVerification.Failed,
      message: 'attestation invalid',
      manifest: verifiedManifest,
    })

    await handleManifest(manifest)

    expect(await readDomainVerified()).toBe(false)
  })

  test('downgrades a verified domain unreachable past the staleness threshold', async () => {
    await seedManifest({
      domain_verified: true,
      last_verified: daysAgo(8),
      last_checked: hoursAgo(13),
    })
    mockVerify.mockResolvedValue({
      status: DomainVerification.Unreachable,
      message: 'unreachable',
      manifest: verifiedManifest,
    })

    await handleManifest(manifest)

    expect(await readDomainVerified()).toBe(false)
  })

  test('skips re-verification within the throttle window', async () => {
    await seedManifest({
      domain_verified: true,
      last_verified: hoursAgo(1),
      last_checked: hoursAgo(1),
    })

    await handleManifest(manifest)

    expect(mockVerify).not.toHaveBeenCalled()
    expect(await readDomainVerified()).toBe(true)
  })

  test('records a verified domain and its verification timestamp', async () => {
    await seedManifest({
      domain_verified: false,
      last_checked: hoursAgo(13),
    })
    mockVerify.mockResolvedValue({
      status: DomainVerification.Verified,
      message: 'verified',
      manifest: verifiedManifest,
    })

    await handleManifest(manifest)

    expect(await readDomainVerified()).toBe(true)
    expect(await readLastVerified()).not.toBeNull()
  })
})
