import WebSocket from 'ws'

import agreement from '../../src/connection-manager/agreement'
import { handleManifest } from '../../src/connection-manager/manifests'
import { handleWsMessageSubscribeTypes } from '../../src/connection-manager/wsHandling'
import {
  StreamLedger,
  StreamManifest,
  ValidationRaw,
} from '../../src/shared/types'
import logger from '../../src/shared/utils/logger'

jest.mock('../../src/connection-manager/manifests')
jest.mock('../../src/shared/utils/logger', () => {
  const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { __esModule: true, default: (): typeof mockLogger => mockLogger }
})

const mockHandleManifest = handleManifest as jest.Mock
const log = logger({ name: 'test' })
const failure = new Error('pool timeout')

async function receive(
  data: ValidationRaw | StreamManifest | StreamLedger,
): Promise<void> {
  await handleWsMessageSubscribeTypes(
    data,
    [],
    'test',
    new Map(),
    { url: 'wss://node.example:6005' } as WebSocket,
    new Map(),
    new Map(),
  )
  // The stream handlers are not awaited; let their rejection settle.
  await new Promise((resolve) => {
    setImmediate(resolve)
  })
}

describe('stream message handling', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  test('logs a failed manifest instead of rejecting unhandled', async () => {
    mockHandleManifest.mockRejectedValue(failure)

    await receive({ type: 'manifestReceived' } as StreamManifest)

    expect(log.error).toHaveBeenCalledWith(
      'Error handling stream manifest',
      failure,
    )
  })

  test('logs a failed validation instead of rejecting unhandled', async () => {
    jest.spyOn(agreement, 'handleValidation').mockRejectedValue(failure)

    await receive({ type: 'validationReceived' } as ValidationRaw)

    expect(log.error).toHaveBeenCalledWith(
      'Error handling stream validation',
      failure,
    )
  })

  test('ignores a message without a type', async () => {
    await expect(receive({} as StreamLedger)).resolves.toBeUndefined()
  })
})
