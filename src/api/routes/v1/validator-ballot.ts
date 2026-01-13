import { Request, Response } from 'express'

import { query } from '../../../shared/database'
import logger from '../../../shared/utils/logger'

const log = logger({ name: 'api-validator-ballot' })

interface BallotRecord {
  signing_key: string
  ledger_index: string
  amendments: string | null
  base_fee: number | null
  reserve_base: number | null
  reserve_inc: number | null
}

interface AmendmentVote {
  id: string
  name?: string
}

/**
 * Gets amendment names from IDs.
 *
 * @param amendmentIds - Array of amendment IDs.
 * @returns Array of amendments with id and name.
 */
async function getAmendmentNames(
  amendmentIds: string[],
): Promise<AmendmentVote[]> {
  if (amendmentIds.length === 0) {
    return []
  }

  const amendments = (await query('amendments_info')
    .select('id', 'name')
    .whereIn('id', amendmentIds)) as Array<{ id: string; name: string }>

  const nameMap = new Map(amendments.map((amend) => [amend.id, amend.name]))

  return amendmentIds.map((id) => ({
    id,
    name: nameMap.get(id),
  }))
}

/**
 * Handles Validator Ballot request - returns amendments voted by a validator.
 *
 * @param req - Express request with publicKey param.
 * @param res - Express response.
 */
export default async function handleValidatorBallot(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { publicKey } = req.params

    const ballot = (await query('ballot')
      .select('*')
      .where('signing_key', publicKey)
      .first()) as BallotRecord | undefined

    if (!ballot) {
      log.error(
        `Error handleValidatorBallot: validator not found. publicKey = ${publicKey}`,
      )
      res.status(404).send({
        result: 'error',
        message: 'validator ballot not found',
      })
      return
    }

    const amendmentIds = ballot.amendments
      ? ballot.amendments.split(',').filter((id) => id.length > 0)
      : []

    const amendmentsVoted = await getAmendmentNames(amendmentIds)

    res.status(200).send({
      result: 'success',
      signing_key: ballot.signing_key,
      ledger_index: ballot.ledger_index,
      amendments_voted: amendmentsVoted,
      base_fee: ballot.base_fee,
      reserve_base: ballot.reserve_base,
      reserve_inc: ballot.reserve_inc,
    })
  } catch (err: unknown) {
    log.error('Error handleValidatorBallot: ', err)
    res.status(500).send({
      result: 'error',
      message: `internal error: ${(err as Error).message}`,
    })
  }
}
