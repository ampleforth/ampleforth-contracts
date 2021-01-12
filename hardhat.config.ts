import { HardhatUserConfig } from 'hardhat/config'

import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@openzeppelin/hardhat-upgrades'
import 'solidity-coverage'
import 'hardhat-gas-reporter'

require('./scripts/deploy')

export default {
  solidity: {
    version: '0.4.24',
  },
  mocha: {
    timeout: 100000,
  },
  gasReporter: {
    currency: 'USD',
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: ['mocks/'],
  },
} as HardhatUserConfig
