# PostFiat Validator History Service

This is a fork of the [Ripple Validator History Service](https://github.com/ripple/validator-history-service), adapted for the PostFiat network.

## PostFiat Networks

| Network | RPC Endpoint | WebSocket | Network ID |
|---------|--------------|-----------|------------|
| Devnet  | `rpc.devnet.postfiat.org:5006` | `wss://rpc.devnet.postfiat.org` | `dev` |
| Testnet | `rpc.testnet.postfiat.org:5006` | `wss://rpc.testnet.postfiat.org` | `test` |
| Mainnet | `rpc.postfiat.org:5006` | `wss://rpc.postfiat.org` | `main` |

## Differences from Upstream

### UNL Handling
- UNL validators are fetched directly from the connected rippled node using the `validators` RPC command
- No external UNL domain is required; set `RIPPLED_RPC_ADMIN` to a node with admin access

### Configuration
- Environment files pre-configured for PostFiat networks (`.env.devnet`, `.env.testnet`)
- `NETWORK_ID` variable identifies the network for database records

### Docker Images
- Published to Docker Hub under `agtipft/validator-history-service`
- Tags: `devnet-latest`, `testnet-latest`

## Related Resources

- [PostFiat Documentation](https://docs.postfiat.org)
- [PostFiat GitHub](https://github.com/postfiatorg)
