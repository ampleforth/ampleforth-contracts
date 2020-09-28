import { usePlugin, BuidlerConfig } from '@nomiclabs/buidler/config'

usePlugin('@nomiclabs/buidler-ethers')
usePlugin('@nomiclabs/buidler-waffle')
usePlugin('@openzeppelin/buidler-upgrades')
usePlugin('solidity-coverage')

require('./scripts/deploy')

export default {
  solc: {
    version: '0.4.24',
  },
  mocha: {
    timeout: 100000,
  },
} as BuidlerConfig
