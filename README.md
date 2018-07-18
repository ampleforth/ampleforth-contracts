# μFragments
The μFragments protocol smart contracts on Ethereum.

[![Build Status](https://travis-ci.com/frgprotocol/uFragments.svg?token=xxNsLhLrTiyG3pc78i5v&branch=master)](https://travis-ci.com/frgprotocol/uFragments)

# Getting started
```bash

# (TEMPORARY) To use other private uFragments github repository dependencies
# Generate a github token {https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/}
# https://stackoverflow.com/questions/23210437/npm-install-private-github-repositories-by-dependency-in-package-json
git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf git@github.com:

# Install dependencies
npm install
```

# Useful scripts
``` bash
# You can use the following commands to start/stop local ganache chain
npm run blockchain:start
npm run blockchain:stop
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
