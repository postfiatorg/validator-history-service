import axios from 'axios'
import { decodeNodePublic } from 'ripple-address-codec'
import { verify } from 'ripple-keypairs'
import toml from 'toml'
import {
  normalizeManifest,
  Manifest,
  StreamManifest,
  ManifestParsed,
} from 'xrpl-validator-domains'
import verifyManifestSignature from 'xrpl-validator-domains/dist/manifest'

const TOML_PATH = '/.well-known/pft-ledger.toml'
const TOML_FETCH_TIMEOUT_MS = 10000
const TOML_FETCH_MAX_RETRIES = 2
const TOML_FETCH_RETRY_BASE_DELAY_MS = 500
const HTTP_SERVER_ERROR = 500
const HTTP_TOO_MANY_REQUESTS = 429

/**
 * Outcome of a domain verification attempt.
 *
 * The distinction between Failed and Unreachable is deliberate: Failed is a
 * definitive negative derived from a TOML that was actually retrieved, whereas
 * Unreachable means the TOML could not be obtained and the prior verification
 * state must be preserved rather than overwritten.
 */
export enum DomainVerification {
  // Manifest signature could not be verified; nothing can be asserted.
  InvalidManifest = 'invalid_manifest',
  // TOML was retrieved and the attestation/key check produced a definitive no.
  Failed = 'failed',
  // The TOML could not be retrieved (network, timeout, HTTP error); state unknown.
  Unreachable = 'unreachable',
  // TOML was retrieved and the attestation verified.
  Verified = 'verified',
}

interface ValidatorInfo {
  public_key: string
  attestation: string
}

interface TomlData {
  VALIDATORS?: ValidatorInfo[]
}

interface VerificationResult {
  status: DomainVerification
  message: string
  manifest: Manifest
}

/**
 * Determines whether a failed TOML request is worth retrying.
 * Network errors, timeouts, rate limiting, and 5xx responses are transient;
 * other HTTP responses (e.g. 4xx) and parse errors are not.
 *
 * @param error - The error thrown by the request.
 * @returns Whether the request should be retried.
 */
function isRetryableError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false
  }
  const { response } = error
  if (response) {
    return (
      response.status >= HTTP_SERVER_ERROR ||
      response.status === HTTP_TOO_MANY_REQUESTS
    )
  }
  // No response means a network-level failure or timeout.
  return true
}

/**
 * Resolves after the given delay.
 *
 * @param ms - Milliseconds to wait.
 * @returns A promise that resolves after the delay.
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Fetches the TOML file from a validator domain, with a bounded timeout and
 * retry with exponential backoff for transient failures.
 *
 * @param domain - The domain to fetch the TOML file from.
 * @returns Parsed TOML data.
 * @throws If the TOML file cannot be fetched or parsed after all attempts.
 */
async function fetchToml(domain: string): Promise<TomlData> {
  const url = `https://${domain}${TOML_PATH}`
  let lastError: unknown

  for (let attempt = 0; attempt <= TOML_FETCH_MAX_RETRIES; attempt++) {
    try {
      const response = await axios({
        method: 'get',
        url,
        responseType: 'text',
        timeout: TOML_FETCH_TIMEOUT_MS,
      })
      return toml.parse(response.data) as TomlData
    } catch (err: unknown) {
      lastError = err
      if (attempt >= TOML_FETCH_MAX_RETRIES || !isRetryableError(err)) {
        break
      }

      await delay(TOML_FETCH_RETRY_BASE_DELAY_MS * 2 ** attempt)
    }
  }

  throw lastError
}

/**
 * Verifies the signature and domain associated with a manifest.
 * This is a custom implementation that uses pft-ledger.toml instead of xrp-ledger.toml.
 *
 * A failure to retrieve the domain's TOML resolves to Unreachable rather than a
 * negative result, so callers can preserve the last-known verification state
 * instead of clearing it on a transient network error.
 *
 * @param manifest - The signed manifest that contains the validator's domain.
 * @returns A verification result carrying the outcome status and message.
 */
export async function verifyValidatorDomain(
  manifest: string | ManifestParsed | StreamManifest | Manifest,
): Promise<VerificationResult> {
  const normalizedManifest = normalizeManifest(manifest)
  const domain = normalizedManifest.domain
  const publicKey = normalizedManifest.master_key

  if (!publicKey) {
    return {
      status: DomainVerification.InvalidManifest,
      message: 'Manifest does not contain a master_key',
      manifest: normalizedManifest,
    }
  }

  if (!verifyManifestSignature(manifest)) {
    return {
      status: DomainVerification.InvalidManifest,
      message: 'Cannot verify manifest signature',
      manifest: normalizedManifest,
    }
  }

  if (domain === undefined) {
    return {
      status: DomainVerification.Failed,
      message: 'Manifest does not contain a domain',
      manifest: normalizedManifest,
    }
  }

  let validatorInfo: TomlData
  try {
    validatorInfo = await fetchToml(domain)
  } catch (err: unknown) {
    return {
      status: DomainVerification.Unreachable,
      message: `Failed to fetch TOML file from ${domain}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      manifest: normalizedManifest,
    }
  }

  if (!validatorInfo.VALIDATORS) {
    return {
      status: DomainVerification.Failed,
      message: 'Invalid .toml file - missing VALIDATORS section',
      manifest: normalizedManifest,
    }
  }

  const decodedPubKey = Buffer.from(decodeNodePublic(publicKey)).toString('hex')
  const message = `[domain-attestation-blob:${domain}:${publicKey}]`
  const message_bytes = Buffer.from(message).toString('hex')

  const validators = validatorInfo.VALIDATORS.filter(
    (validator) => validator.public_key === publicKey,
  )

  if (validators.length === 0) {
    return {
      status: DomainVerification.Failed,
      message: '.toml file does not have matching public key',
      manifest: normalizedManifest,
    }
  }

  for (const validator of validators) {
    const attestation = Buffer.from(validator.attestation, 'hex').toString(
      'hex',
    )
    const failedToVerify: VerificationResult = {
      status: DomainVerification.Failed,
      message: `Invalid attestation, cannot verify ${domain}`,
      manifest: normalizedManifest,
    }

    let verified: boolean
    try {
      verified = verify(message_bytes, attestation, decodedPubKey)
    } catch (_u) {
      return failedToVerify
    }

    if (!verified) {
      return failedToVerify
    }
  }

  return {
    status: DomainVerification.Verified,
    message: `${domain} has been verified`,
    manifest: normalizedManifest,
  }
}
