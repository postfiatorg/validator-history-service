import { Request, Response } from 'express'

import { query } from '../../../shared/database'
import { AgreementScore } from '../../../shared/types'
import logger from '../../../shared/utils/logger'

const log = logger({ name: 'api-validator-hourly-report' })

const DEFAULT_DAYS = 30
const MAX_DAYS = 30

interface HourlyScoreResponse {
  validation_public_key: string
  start: Date
  score: string
  total: string
  missed: string
  incomplete: boolean
}

interface DatabaseResponse {
  main_key: string
  start: Date
  agreement: AgreementScore
}

/**
 * Formats database query response.
 *
 * @param response - Response from the database query.
 * @returns Formatted hourly score.
 */
function formatResponse(response: DatabaseResponse): HourlyScoreResponse {
  const {
    main_key,
    start,
    agreement: { validated, missed, incomplete },
  } = response
  const denominator = validated + missed
  const score: number = denominator === 0 ? 0 : validated / denominator

  return {
    validation_public_key: main_key,
    start,
    score: score.toFixed(5),
    total: (validated + missed).toString(),
    missed: missed.toString(),
    incomplete,
  }
}

/**
 * Gets hourly agreement reports for a validator.
 *
 * @param master_key - Master key of validator.
 * @param days - Number of days to retrieve (max 30).
 * @returns A promise that resolves to an array of HourlyScoreResponse.
 */
async function getHourlyReports(
  master_key: string,
  days: number,
): Promise<HourlyScoreResponse[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  return query('hourly_agreement')
    .select(['main_key', 'start', 'agreement'])
    .where('main_key', '=', master_key)
    .andWhere('start', '>=', since)
    .orderBy('start', 'desc')
    .then((resp: DatabaseResponse[]) => resp.map(formatResponse))
}

/**
 * Handles hourly report request.
 *
 * @param req - Express request.
 * @param res - Express response.
 * @returns Void.
 */
export default async function handleValidatorHourlyReport(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const master_key = req.params.publicKey
    const daysParam = req.query.days
    const parsed = parseInt(daysParam as string, 10)
    const days =
      Number.isNaN(parsed) || parsed <= 0
        ? DEFAULT_DAYS
        : Math.min(parsed, MAX_DAYS)

    const scores: HourlyScoreResponse[] = await getHourlyReports(
      master_key,
      days,
    )

    const response = {
      result: 'success',
      count: scores.length,
      reports: scores,
    }

    res.status(200).send(response)
  } catch (err: unknown) {
    log.error('Error handleValidatorHourlyReport: ', err)
    res.status(500).send({
      result: 'error',
      message: `internal error: ${(err as Error).message}`,
    })
  }
}
