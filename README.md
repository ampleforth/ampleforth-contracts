# μFragments
The μFragments protocol smart contracts on Ethereum.

[![Build Status](https://travis-ci.com/frgprotocol/uFragments.svg?token=xxNsLhLrTiyG3pc78i5v&branch=master)](https://travis-ci.com/frgprotocol/uFragments)

# Getting started
```bash
# Install ethereum local blockchain(s) and associated dependencies
./scripts/frg-ethereum-runners/dep-install.sh

# Install project dependencies
npm install
```

# Useful scripts
``` bash
# You can use the following commands to start/stop local chain
npm run blockchain:[start|stop] [ganacheUnitTest|gethUnitTest]

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
npm run truffle test test/test_file.js
```
