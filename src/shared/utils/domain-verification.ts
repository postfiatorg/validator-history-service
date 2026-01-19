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

interface ValidatorInfo {
  public_key: string
  attestation: string
}

interface TomlData {
  VALIDATORS?: ValidatorInfo[]
}

interface VerificationResult {
  verified: boolean
  verified_manifest_signature: boolean
  message: string
  manifest?: Manifest
}

/**
 * Fetches TOML file from validator domain.
 *
 * @param domain - The domain to fetch the TOML file from.
 * @returns Parsed TOML data.
 * @throws If there is an error fetching or parsing the TOML file.
 */
async function fetchToml(domain: string): Promise<TomlData> {
  const url = `https://${domain}${TOML_PATH}`
  const response = await axios({
    method: 'get',
    url,
    responseType: 'text',
  })
  return toml.parse(response.data) as TomlData
}

/**
 * Verifies the signature and domain associated with a manifest.
 * This is a custom implementation that uses pft-ledger.toml instead of xrp-ledger.toml.
 *
 * @param manifest - The signed manifest that contains the validator's domain.
 * @returns A verification result with verified status, manifest signature status, and message.
 */
// eslint-disable-next-line import/prefer-default-export -- Named export preferred for clarity
export async function verifyValidatorDomain(
  manifest: string | ManifestParsed | StreamManifest | Manifest,
): Promise<VerificationResult> {
  const normalizedManifest = normalizeManifest(manifest)
  const domain = normalizedManifest.domain
  const publicKey = normalizedManifest.master_key

  if (!publicKey) {
    return {
      verified: false,
      verified_manifest_signature: false,
      message: 'Manifest does not contain a master_key',
      manifest: normalizedManifest,
    }
  }

  const decodedPubKey = Buffer.from(decodeNodePublic(publicKey)).toString('hex')

  if (!verifyManifestSignature(manifest)) {
    return {
      verified: false,
      verified_manifest_signature: false,
      message: 'Cannot verify manifest signature',
      manifest: normalizedManifest,
    }
  }

  if (domain === undefined) {
    return {
      verified: false,
      verified_manifest_signature: true,
      message: 'Manifest does not contain a domain',
      manifest: normalizedManifest,
    }
  }

  let validatorInfo: TomlData
  try {
    validatorInfo = await fetchToml(domain)
  } catch (err: unknown) {
    return {
      verified: false,
      verified_manifest_signature: true,
      message: `Failed to fetch TOML file from ${domain}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      manifest: normalizedManifest,
    }
  }

  if (!validatorInfo.VALIDATORS) {
    return {
      verified: false,
      verified_manifest_signature: true,
      message: 'Invalid .toml file - missing VALIDATORS section',
      manifest: normalizedManifest,
    }
  }

  const message = `[domain-attestation-blob:${domain}:${publicKey}]`
  const message_bytes = Buffer.from(message).toString('hex')

  const validators = validatorInfo.VALIDATORS.filter(
    (validator) => validator.public_key === publicKey,
  )

  if (validators.length === 0) {
    return {
      verified: false,
      verified_manifest_signature: true,
      message: '.toml file does not have matching public key',
      manifest: normalizedManifest,
    }
  }

  for (const validator of validators) {
    const attestation = Buffer.from(validator.attestation, 'hex').toString(
      'hex',
    )
    const failedToVerify: VerificationResult = {
      verified: false,
      verified_manifest_signature: true,
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
    verified: true,
    verified_manifest_signature: true,
    message: `${domain} has been verified`,
    manifest: normalizedManifest,
  }
}
