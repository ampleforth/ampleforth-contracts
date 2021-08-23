# Ampleforth

[![Build Status](https://travis-ci.com/ampleforth/uFragments.svg?token=xxNsLhLrTiyG3pc78i5v&branch=master)](https://travis-ci.com/ampleforth/uFragments)&nbsp;&nbsp;[![Coverage Status](https://coveralls.io/repos/github/frgprotocol/uFragments/badge.svg?branch=master&t=GiWi8p)](https://coveralls.io/github/frgprotocol/uFragments?branch=master)

Ampleforth (code name uFragments) is a decentralized elastic supply protocol. It maintains a stable unit price by adjusting supply directly to and from wallet holders. You can read the [whitepaper](https://www.ampleforth.org/paper/) for the motivation and a complete description of the protocol.

This repository is a collection of [smart contracts](http://ampleforth.org/docs) that implement the Ampleforth protocol on the Ethereum blockchain.

The official mainnet addresses are:

- ERC-20 Token: [0xD46bA6D942050d489DBd938a2C909A5d5039A161](https://etherscan.io/token/0xd46ba6d942050d489dbd938a2c909a5d5039a161)
- Supply Policy: [0x1B228a749077b8e307C5856cE62Ef35d96Dca2ea](https://etherscan.io/address/0x1b228a749077b8e307c5856ce62ef35d96dca2ea)
- Orchestrator: [0x6fb00a180781e75f87e2b690af0196baa77c7e7c](https://etherscan.io/address/0x6fb00a180781e75f87e2b690af0196baa77c7e7c)
- Market Oracle: [0x99c9775e076fdf99388c029550155032ba2d8914](https://etherscan.io/address/0x99c9775e076fdf99388c029550155032ba2d8914)
- CPI Oracle: [0xa759f960dd59a1ad32c995ecabe802a0c35f244f](https://etherscan.io/address/0xa759f960dd59a1ad32c995ecabe802a0c35f244f)

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

There is a testnet deployment on Kovan. It rebases hourly using real market data.

- ERC-20 Token: [0x3E0437898a5667a4769B1Ca5A34aAB1ae7E81377](https://kovan.etherscan.io/token/0x3E0437898a5667a4769B1Ca5A34aAB1ae7E81377)
- Supply Policy: [0xBB4617d26E704Ac0568E1cbf5232990a8b7846A4](https://kovan.etherscan.io/address/0xBB4617d26E704Ac0568E1cbf5232990a8b7846A4)
- Orchestrator: [0xdAcA62767840febA20Ae103d8B5BF923517FA3b9](https://kovan.etherscan.io/address/0xdAcA62767840febA20Ae103d8B5BF923517FA3b9)
- Market Oracle: [0xFC344AF21d647f4244B5F098203A178BF26c51Dc](https://kovan.etherscan.io/address/0xFC344AF21d647f4244B5F098203A178BF26c51Dc)
- CPI Oracle: [0xCedc17B394051d0E222797588f3e5ECe5023FB4A](https://kovan.etherscan.io/address/0xCedc17B394051d0E222797588f3e5ECe5023FB4A)
- WAMPL: [0x33e24a1902620BeFB88D40714EF980Cd8653234e](https://kovan.etherscan.io/address/0x33e24a1902620BeFB88D40714EF980Cd8653234e)

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
