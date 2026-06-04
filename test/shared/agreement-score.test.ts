import calculateAgreementScore from '../../src/shared/database/agreement-score'
import { AgreementScore } from '../../src/shared/types'

const COVERAGE = 0.9
const SHARE = 0.25

function bucket(
  validated: number,
  missed: number,
  incomplete: boolean,
): AgreementScore {
  return { validated, missed, incomplete }
}

function repeat(count: number, score: AgreementScore): AgreementScore[] {
  return Array.from({ length: count }, () => ({ ...score }))
}

describe('calculateAgreementScore', () => {
  test('an occasional blemish in a fully-covered window stays complete', () => {
    const scores = [...repeat(23, bucket(100, 0, false)), bucket(50, 50, true)]

    const result = calculateAgreementScore(scores, 24, COVERAGE, SHARE)

    expect(result.incomplete).toBe(false)
    expect(result.validated).toBe(23 * 100 + 50)
    expect(result.missed).toBe(50)
  })

  test('low coverage is flagged incomplete', () => {
    const scores = repeat(5, bucket(100, 0, false))

    const result = calculateAgreementScore(scores, 24, COVERAGE, SHARE)

    expect(result.incomplete).toBe(true)
  })

  test('a high incomplete share is flagged incomplete', () => {
    const scores = [
      ...repeat(18, bucket(50, 50, true)),
      ...repeat(6, bucket(100, 0, false)),
    ]

    const result = calculateAgreementScore(scores, 24, COVERAGE, SHARE)

    expect(result.incomplete).toBe(true)
  })

  test('coverage exactly at the threshold is complete', () => {
    const scores = repeat(9, bucket(100, 0, false))

    const result = calculateAgreementScore(scores, 10, COVERAGE, SHARE)

    expect(result.incomplete).toBe(false)
  })

  test('an incomplete share exactly at the threshold is complete', () => {
    const scores = [bucket(50, 50, true), ...repeat(3, bucket(100, 0, false))]

    const result = calculateAgreementScore(scores, 4, COVERAGE, SHARE)

    expect(result.incomplete).toBe(false)
  })

  test('absent-style buckets resolve to complete with zero validated', () => {
    const scores = repeat(24, bucket(0, 100, false))

    const result = calculateAgreementScore(scores, 24, COVERAGE, SHARE)

    expect(result.incomplete).toBe(false)
    expect(result.validated).toBe(0)
    expect(result.missed).toBe(2400)
  })

  test('an empty window is incomplete', () => {
    const result = calculateAgreementScore([], 24, COVERAGE, SHARE)

    expect(result.incomplete).toBe(true)
    expect(result.validated).toBe(0)
    expect(result.missed).toBe(0)
  })
})
