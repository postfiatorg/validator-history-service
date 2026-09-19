import {
  formatAgreementScore,
  formatAmendments,
} from '../../src/api/routes/v1/utils'
import { query } from '../../src/shared/database'

jest.mock('../../src/shared/database', () => ({
  getNetworks: jest.fn(),
  query: jest.fn(),
}))

const mockedQuery = query as jest.MockedFunction<typeof query>

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('read-path serialization and ordering', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  test('keeps amendment metadata in the requested database order', async () => {
    const pending = {
      first: deferred<{ id: string; name: string }>(),
      second: deferred<{ id: string; name: string }>(),
    }

    mockedQuery.mockImplementation(() => {
      const chain: Record<string, jest.Mock> = {}
      chain.select = jest.fn().mockReturnValue(chain)
      chain.where = jest.fn((_column: string, id: string) => {
        chain.first = jest
          .fn()
          .mockReturnValue(
            id === 'first' ? pending.first.promise : pending.second.promise,
          )
        return chain
      })
      chain.first = jest.fn()
      return chain as never
    })

    const resultPromise = formatAmendments('first,second')
    pending.second.resolve({ id: 'second', name: 'Second' })
    await Promise.resolve()
    pending.first.resolve({ id: 'first', name: 'First' })

    await expect(resultPromise).resolves.toEqual([
      { id: 'first', name: 'First' },
      { id: 'second', name: 'Second' },
    ])
  })

  test('serializes an empty agreement denominator as a finite score', () => {
    expect(
      formatAgreementScore({ validated: 0, missed: 0, incomplete: true }),
    ).toEqual({
      missed: 0,
      total: 0,
      score: '0.00000',
      incomplete: true,
    })
  })
})
