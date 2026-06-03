import nock from 'nock'

import {
  verifyValidatorDomain,
  DomainVerification,
} from '../../src/shared/utils/domain-verification'

jest.mock('xrpl-validator-domains', () => ({
  normalizeManifest: (
    value: Record<string, unknown>,
  ): Record<string, unknown> => value,
}))
jest.mock('xrpl-validator-domains/dist/manifest', () => ({
  __esModule: true,
  default: (): boolean => true,
}))

const DOMAIN = 'example.test'
const TOML_PATH = '/.well-known/pft-ledger.toml'
const MASTER_KEY = 'nHUpcmNsxAw47yt2ADDoNoQrzLyTJPgnyq16u6Qx2kRPA17oUNHz'

// A syntactically valid TOML whose VALIDATORS list does not contain MASTER_KEY,
// so the attestation check fails definitively once the file is retrieved.
const NON_MATCHING_TOML = `[[VALIDATORS]]
public_key = "nHB8Tng2DBgaP1Jj5C5d5GMy7iL9p1bN2bEXAMPLEKEY"
attestation = "00"
`

const manifest = {
  master_key: MASTER_KEY,
  domain: DOMAIN,
  signing_key: 'n9Ls4GcrofTvLvymKh1wCqxw1aLzXUumyBBD9fAtbkk9WtdQ4TUH',
  master_signature: 'AA',
  signature: 'BB',
  seq: 1,
}

describe('verifyValidatorDomain classification', () => {
  afterEach(() => {
    nock.cleanAll()
  })

  test('returns Unreachable when the TOML cannot be fetched', async () => {
    nock(`https://${DOMAIN}`)
      .get(TOML_PATH)
      .times(3)
      .replyWithError('ECONNREFUSED')

    const result = await verifyValidatorDomain(manifest)

    expect(result.status).toBe(DomainVerification.Unreachable)
    expect(nock.isDone()).toBe(true)
  }, 10000)

  test('returns Unreachable on a 4xx without retrying', async () => {
    const scope = nock(`https://${DOMAIN}`).get(TOML_PATH).reply(404)

    const result = await verifyValidatorDomain(manifest)

    expect(result.status).toBe(DomainVerification.Unreachable)
    expect(scope.isDone()).toBe(true)
    expect(nock.pendingMocks()).toHaveLength(0)
  })

  test('retries a transient failure and uses the successful response', async () => {
    nock(`https://${DOMAIN}`).get(TOML_PATH).replyWithError('ECONNRESET')
    nock(`https://${DOMAIN}`).get(TOML_PATH).reply(200, NON_MATCHING_TOML)

    const result = await verifyValidatorDomain(manifest)

    // Reaching Failed (a TOML-derived verdict) proves the retry hit the 200.
    expect(result.status).toBe(DomainVerification.Failed)
    expect(nock.isDone()).toBe(true)
  }, 10000)

  test('returns Failed when the fetched TOML lacks the validator key', async () => {
    nock(`https://${DOMAIN}`).get(TOML_PATH).reply(200, NON_MATCHING_TOML)

    const result = await verifyValidatorDomain(manifest)

    expect(result.status).toBe(DomainVerification.Failed)
  })
})
