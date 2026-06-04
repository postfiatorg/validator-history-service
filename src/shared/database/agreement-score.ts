import { AgreementScore } from '../types'

/**
 * Aggregates hourly agreement buckets into a single rolling score and decides
 * whether the result is incomplete.
 *
 * A window is incomplete only when the underlying data is genuinely
 * insufficient, rather than because of any single blemished hour: either
 * coverage (present buckets relative to the window's expected hours) falls
 * below coverageThreshold, or the share of present buckets that were themselves
 * incomplete exceeds incompleteShareThreshold. An established validator with
 * full coverage and the occasional incomplete hour therefore resolves to
 * complete, while a new validator (sparse coverage) or a window where the
 * consensus data was gappy for a large fraction of the hours stays incomplete.
 *
 * @param scores - The hourly agreement buckets in the window.
 * @param expectedBuckets - Number of hourly buckets the window should contain.
 * @param coverageThreshold - Minimum present/expected ratio to be complete.
 * @param incompleteShareThreshold - Maximum incomplete/present ratio allowed.
 * @returns The aggregated score with the resolved incomplete flag.
 */
export default function calculateAgreementScore(
  scores: AgreementScore[],
  expectedBuckets: number,
  coverageThreshold: number,
  incompleteShareThreshold: number,
): AgreementScore {
  let validated = 0
  let missed = 0
  let incompleteBuckets = 0

  for (const score of scores) {
    validated += score.validated
    missed += score.missed
    if (score.incomplete) {
      incompleteBuckets += 1
    }
  }

  const coverage = expectedBuckets > 0 ? scores.length / expectedBuckets : 0
  const incompleteShare =
    scores.length > 0 ? incompleteBuckets / scores.length : 0

  const incomplete =
    coverage < coverageThreshold || incompleteShare > incompleteShareThreshold

  return { validated, missed, incomplete }
}
