import axios from 'axios'
import { Request, Response } from 'express'

import {
  EnvironmentVariable,
  getEnvironmentVariable,
} from '../../../shared/utils/environment-variable'
import logger from '../../../shared/utils/logger'

const log = logger({ name: 'api-unl' })

interface UnlValidator {
  validation_public_key: string
  manifest: string
}

interface UnlBlob {
  sequence: number
  expiration: number
  effective?: number
  validators: UnlValidator[]
}

interface UnlResponse {
  public_key: string
  manifest: string
  blobs_v2?: Array<{
    signature: string
    blob: string
  }>
  blob?: string
}

/**
 * Fetches and decodes UNL validators from the configured UNL URL.
 *
 * @returns Array of validator public keys.
 */
async function fetchUnlValidators(): Promise<string[]> {
  const unlUrl = getEnvironmentVariable(EnvironmentVariable.mainnet_unl)

  if (!unlUrl) {
    throw new Error('MAINNET_UNL environment variable is not configured')
  }

  const response = await axios.get<UnlResponse>(`https://${unlUrl}`)
  const data = response.data

  let blobBase64: string | undefined

  // Handle both v2 format (blobs_v2) and v1 format (blob)
  if (data.blobs_v2 && data.blobs_v2.length > 0) {
    blobBase64 = data.blobs_v2[0].blob
  } else if (data.blob) {
    blobBase64 = data.blob
  }

  if (!blobBase64) {
    throw new Error('No blob found in UNL response')
  }

  const decodedBlob = Buffer.from(blobBase64, 'base64').toString('utf-8')
  const unlBlob = JSON.parse(decodedBlob) as UnlBlob

  return unlBlob.validators.map((validator) => validator.validation_public_key)
}

/**
 * Handles UNL validators request.
 *
 * @param _req - Express request.
 * @param res - Express response.
 */
export default async function handleUnl(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const validators = await fetchUnlValidators()
    res.status(200).send({
      result: 'success',
      count: validators.length,
      validators,
    })
  } catch (err: unknown) {
    log.error('Error handleUnl: ', err)
    res.status(500).send({
      result: 'error',
      message: `internal error: ${(err as Error).message}`,
    })
  }
}
