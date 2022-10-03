# Ampleforth

[![Nightly](https://github.com/ampleforth/ampleforth-contracts/actions/workflows/nightly.yml/badge.svg)](https://github.com/ampleforth/ampleforth-contracts/actions/workflows/nightly.yml)&nbsp;&nbsp;[![Coverage Status](https://coveralls.io/repos/github/ampleforth/ampleforth-contracts/badge.svg?branch=master)](https://coveralls.io/github/ampleforth/ampleforth-contracts?branch=master)

Ampleforth (code name uFragments) is a decentralized elastic supply protocol. It maintains a stable unit price by adjusting supply directly to and from wallet holders. You can read the [whitepaper](https://www.ampleforth.org/paper/) for the motivation and a complete description of the protocol.

This repository is a collection of [smart contracts](http://ampleforth.org/docs) that implement the Ampleforth protocol on the Ethereum blockchain.

The official mainnet addresses are:

- ERC-20 Token: [0xD46bA6D942050d489DBd938a2C909A5d5039A161](https://etherscan.io/token/0xd46ba6d942050d489dbd938a2c909a5d5039a161)
- Supply Policy: [0x1B228a749077b8e307C5856cE62Ef35d96Dca2ea](https://etherscan.io/address/0x1b228a749077b8e307c5856ce62ef35d96dca2ea)
- Orchestrator: [0x6fb00a180781e75f87e2b690af0196baa77c7e7c](https://etherscan.io/address/0x6fb00a180781e75f87e2b690af0196baa77c7e7c)
- Market Oracle: [0x99c9775e076fdf99388c029550155032ba2d8914](https://etherscan.io/address/0x99c9775e076fdf99388c029550155032ba2d8914)
- CPI Oracle: [0xa759f960dd59a1ad32c995ecabe802a0c35f244f](https://etherscan.io/address/0xa759f960dd59a1ad32c995ecabe802a0c35f244f)
- WAMPL: [0xEDB171C18cE90B633DB442f2A6F72874093b49Ef](https://etherscan.io/address/0xEDB171C18cE90B633DB442f2A6F72874093b49Ef)

## Table of Contents

- [Install](#install)
- [Testing](#testing)
- [Testnets](#testnets)
- [Contribute](#contribute)
- [License](#license)

## Install

```bash
# Install project dependencies
yarn
```

## Testing

```bash
# Run all unit tests (compatible with node v12+)
yarn test
```

## Testnets

There is a testnet deployment on Goerli. It rebases hourly using real market data.

- ERC-20 Token: [0x08c5b39F000705ebeC8427C1d64D6262392944EE](https://goerli.etherscan.io/token/0x08c5b39F000705ebeC8427C1d64D6262392944EE)
- Supply Policy: [0x047b82a5D79d9DF62dE4f34CbaBa83F71848a6BF](https://goerli.etherscan.io/address/0x047b82a5D79d9DF62dE4f34CbaBa83F71848a6BF)
- Orchestrator: [0x0ec93391752ef1A06AA2b83D15c3a5814651C891](https://goerli.etherscan.io/address/0x0ec93391752ef1A06AA2b83D15c3a5814651C891)
- Market Oracle: [0xd4F96E4aC4B4f4E2359734a89b5484196298B69D](https://goerli.etherscan.io/address/0xd4F96E4aC4B4f4E2359734a89b5484196298B69D)
- CPI Oracle: [0x53c75D13a07AA02615Cb43e942829862C963D9bf](https://goerli.etherscan.io/address/0x53c75D13a07AA02615Cb43e942829862C963D9bf)
- Admin: [0x02C32fB5498e89a8750cc9Bd66382a681665c3a3](https://goerli.etherscan.io/address/0x02C32fB5498e89a8750cc9Bd66382a681665c3a3)
- WAMPL: [0x3b624861a14979537DE1B88F9565F41a7fc45FBf](https://goerli.etherscan.io/address/0x3b624861a14979537DE1B88F9565F41a7fc45FBf)

## Contribute

To report bugs within this package, create an issue in this repository.
For security issues, please contact dev-support@ampleforth.org.
When submitting code ensure that it is free of lint errors and has 100% test coverage.

```bash
# Lint code
yarn lint

# Format code
yarn format

# Run solidity coverage report (compatible with node v12)
yarn coverage

# Run solidity gas usage report
yarn profile
```

## License

[GNU General Public License v3.0 (c) 2018 Fragments, Inc.](./LICENSE)
