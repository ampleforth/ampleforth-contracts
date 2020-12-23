import { HardhatUserConfig } from 'hardhat/config'

import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@openzeppelin/hardhat-upgrades'
import 'solidity-coverage'

require('./scripts/deploy')

export default {
  solidity: {
    version: '0.4.24',
  },
  mocha: {
    timeout: 100000,
  },
} as HardhatUserConfig
