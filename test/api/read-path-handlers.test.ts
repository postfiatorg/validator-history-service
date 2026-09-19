// Modules are reloaded under per-test query-boundary doubles.
/* eslint-disable @typescript-eslint/no-require-imports -- Reload modules after installing each query double. */
/* eslint-disable @typescript-eslint/no-var-requires -- Reload modules after installing each query double. */
/* eslint-disable @typescript-eslint/promise-function-async -- Knex-compatible test doubles must be synchronous thenables. */
/* eslint-disable global-require -- Reload modules after installing each query double. */
/* eslint-disable node/global-require -- Reload modules after installing each query double. */
import { Request, Response } from 'express'

interface QueryTrace {
  columns: string[]
  limited: boolean
  ordered: boolean
}

function responseDouble(): Response & {
  send: jest.Mock
  status: jest.Mock
} {
  const res = {
    send: jest.fn(),
    status: jest.fn().mockReturnThis(),
  }
  return res as unknown as Response & { send: jest.Mock; status: jest.Mock }
}

function projectedValidatorQuery(
  row: Record<string, unknown>,
  traces: QueryTrace[],
): unknown {
  const trace: QueryTrace = { columns: [], limited: false, ordered: false }
  traces.push(trace)
  const chain: Record<string, jest.Mock> = {}
  chain.join = jest.fn().mockReturnValue(chain)
  chain.where = jest.fn().mockReturnValue(chain)
  chain.orWhere = jest.fn().mockReturnValue(chain)
  chain.orderBy = jest.fn(() => {
    trace.ordered = true
    return chain
  })
  chain.limit = jest.fn(() => {
    trace.limited = true
    return chain
  })
  chain.select = jest.fn((columns: string[]) => {
    trace.columns = columns
    return chain
  })
  chain.then = jest.fn((resolve: (value: unknown[]) => unknown) => {
    if (trace.ordered) {
      return Promise.resolve([]).then(resolve)
    }
    const selected = Object.fromEntries(
      trace.columns.map((column) => {
        const key = column.split('.').pop() as string
        return [key, row[key]]
      }),
    )
    return Promise.resolve(trace.limited ? [selected] : []).then(resolve)
  })
  return chain
}

describe('single-record read handlers', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  test('validator database fallback retains ledger_hash', async () => {
    const traces: QueryTrace[] = []
    const row = {
      partial: false,
      unl: true,
      agreement_1hour: null,
      agreement_24hour: null,
      agreement_30day: null,
      current_index: '42',
      domain: 'validator.example',
      domain_verified: true,
      ledger_hash: 'ABC123',
      chain: 'test',
      networks: 'test',
      server_version: 'postfiatd-1.0.6',
      master_key: 'MASTER',
      signing_key: 'SIGNING',
      revoked: false,
      amendments: undefined,
      base_fee: 10,
      reserve_base: 20,
      reserve_inc: 5,
    }

    jest.doMock('../../src/shared/database', () => ({
      query: jest.fn(() => projectedValidatorQuery(row, traces)),
    }))

    const { handleValidator } =
      require('../../src/api/routes/v1/validator') as {
        handleValidator: (req: Request, res: Response) => Promise<void>
      }
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })

    const res = responseDouble()
    await handleValidator(
      { params: { publicKey: 'SIGNING' } } as unknown as Request,
      res,
    )

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'success',
        validation_public_key: 'MASTER',
        ledger_hash: 'ABC123',
      }),
    )
    expect(traces.some((trace) => trace.limited)).toBe(true)
  })

  test('missing node sends one 404 response and stops', async () => {
    const emptyChain: Record<string, jest.Mock> = {}
    for (const method of ['select', 'fullOuterJoin', 'where', 'limit']) {
      emptyChain[method] = jest.fn().mockReturnValue(emptyChain)
    }
    emptyChain.then = jest.fn((resolve: (value: unknown[]) => unknown) =>
      Promise.resolve([]).then(resolve),
    )

    jest.doMock('../../src/shared/database', () => ({
      query: jest.fn(() => emptyChain),
    }))

    const { handleNode } = require('../../src/api/routes/v1/nodes') as {
      handleNode: (req: Request, res: Response) => Promise<void>
    }
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })

    const res = responseDouble()
    await handleNode(
      { params: { publicKey: 'missing' } } as unknown as Request,
      res,
    )

    expect(res.status).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.send).toHaveBeenCalledTimes(1)
    expect(res.send).toHaveBeenCalledWith({
      result: 'error',
      message: 'node not found',
    })
  })

  test('qualifies the public key in the joined node fallback query', async () => {
    const emptyChain: Record<string, jest.Mock> = {}
    for (const method of ['select', 'fullOuterJoin', 'where', 'limit']) {
      emptyChain[method] = jest.fn().mockReturnValue(emptyChain)
    }
    emptyChain.then = jest.fn((resolve: (value: unknown[]) => unknown) =>
      Promise.resolve([]).then(resolve),
    )

    jest.doMock('../../src/shared/database', () => ({
      query: jest.fn(() => emptyChain),
    }))

    const { handleNode } = require('../../src/api/routes/v1/nodes') as {
      handleNode: (req: Request, res: Response) => Promise<void>
    }
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })

    await handleNode(
      { params: { publicKey: 'missing' } } as unknown as Request,
      responseDouble(),
    )

    expect(emptyChain.where).toHaveBeenCalledWith({
      'crawls.public_key': 'missing',
    })
  })
})
