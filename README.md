# uFragments

<img src="https://frgs3.s3.amazonaws.com/logo_centered_small.jpg" alt="Banner" width="100" />


[![Build Status](https://travis-ci.com/frgprotocol/uFragments.svg?token=xxNsLhLrTiyG3pc78i5v&branch=master)](https://travis-ci.com/frgprotocol/uFragments)&nbsp;&nbsp;[![Coverage Status](https://coveralls.io/repos/github/frgprotocol/uFragments/badge.svg?branch=master&t=GiWi8p)](https://coveralls.io/github/frgprotocol/uFragments?branch=master)

uFragments (μFragments or micro-Fragments) is a decentralized store of value protocol which attempts to create an Ideal money. It maintains a stable unit price by adjusting supply. You can read our [whitepaper](https://drive.google.com/file/d/1ESn7e-si7tCoEB7N9G9GKr-Y1cEwJnWC/preview) for the motivation and complete description of the protocol.

This repository is a collection of [smart contracts](http://fragments.org/docs) that implement the uFragments protocol on the Ethereum blockchain.


## Table of Contents

- [Install](#install)
- [Testing](#testing)
- [Contribute](#contribute)
- [License](#license)


## Install

```bash
# Install project dependencies
npm install

# Install ethereum local blockchain(s) and associated dependencies
npx setup-local-chains
```

## Testing

``` bash
# You can use the following command to start a local blockchain instance
npx start-chain [ganacheUnitTest|gethUnitTest]

# Run all unit tests
npm test

# Run unit tests in isolation
npx truffle --network ganacheUnitTest test test/unit/uFragments.js
```

## Contribute

To report bugs within this package, please create an issue in this repository.
When submitting code ensure that it is free of lint errors and has 100% test coverage.

``` bash
# Lint code
npm run lint

# View code coverage
npm run coverage
```

## License

[GNU General Public License v3.0 (c) 2018 Fragments, Inc.](./LICENSE)
