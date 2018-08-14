# μFragments
The μFragments protocol smart contracts on Ethereum.

[![Build Status](https://travis-ci.com/frgprotocol/uFragments.svg?token=xxNsLhLrTiyG3pc78i5v&branch=master)](https://travis-ci.com/frgprotocol/uFragments)

# Getting started
```bash
# Install project dependencies
npm install

# Install ethereum local blockchain(s) and associated dependencies
npx setup-local-chains
```

# Useful scripts
``` bash
# You can use the following command to start a local blockchain instance
npx start-chain [ganacheUnitTest|gethUnitTest]

# Lint code
npm run lint

# track gas utilization
npm run trackGasUtilization
```

# Testing
```
# Run Unit Tests
npm test

# Run unit tests in isolation
npx truffle --network ganacheUnitTest test test/test_file.js
```
