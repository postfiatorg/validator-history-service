import selectConnectionTargets from '../../src/connection-manager/peer-selection'
import { WsNode } from '../../src/shared/types'

const entry: WsNode = {
  ip: 'rpc.testnet.postfiat.org',
  ws_url: 'wss://ws.testnet.postfiat.org',
  networks: 'test',
}

function peer(ip: string, uptime?: number): WsNode {
  return { ip, networks: 'test', uptime }
}

describe('selectConnectionTargets', () => {
  test('anchors entry nodes and fills remaining slots by highest uptime', () => {
    const peers = [peer('a', 10), peer('b', 100), peer('c', 50)]

    const result = selectConnectionTargets([entry], peers, 3)

    expect(result).toHaveLength(3)
    expect(result[0]).toBe(entry)
    expect(result.slice(1).map((node) => node.ip)).toEqual(['b', 'c'])
  })

  test('never exceeds the connection cap', () => {
    const peers = Array.from({ length: 50 }, (_value, index) =>
      peer(`p${index}`, index),
    )

    const result = selectConnectionTargets([entry], peers, 20)

    expect(result).toHaveLength(20)
    expect(result[0]).toBe(entry)
  })

  test('keeps the anchor even when a peer has higher uptime', () => {
    const result = selectConnectionTargets([entry], [peer('a', 9999)], 1)

    expect(result).toEqual([entry])
  })

  test('truncates entries when they alone exceed the cap', () => {
    const secondEntry: WsNode = { ip: 'entry2', networks: 'dev' }

    const result = selectConnectionTargets(
      [entry, secondEntry],
      [peer('a', 5)],
      1,
    )

    expect(result).toEqual([entry])
  })

  test('is deterministic and does not mutate its inputs', () => {
    const peers = [peer('a', 10), peer('b', 100)]
    const peersCopy = Array.from(peers)

    const first = selectConnectionTargets([entry], peers, 3)
    const second = selectConnectionTargets([entry], peers, 3)

    expect(first).toEqual(second)
    expect(peers).toEqual(peersCopy)
  })

  test('treats missing uptime as zero', () => {
    const peers = [peer('a'), peer('b', 5)]

    const result = selectConnectionTargets([entry], peers, 2)

    expect(result[1].ip).toBe('b')
  })
})
