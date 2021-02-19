import { HardhatUserConfig } from 'hardhat/config'

import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@openzeppelin/hardhat-upgrades'
import "@nomiclabs/hardhat-etherscan";
import 'solidity-coverage'
import 'hardhat-gas-reporter'

require('./scripts/deploy')

export default {
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  networks: {
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_SECRET}`
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${process.env.INFURA_SECRET}`
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_SECRET}`
    }
  },
  solidity: {
    compilers: [
      {
        version: '0.7.6',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: '0.4.24',
      },
    ],
  },
  mocha: {
    timeout: 100000,
  },
  gasReporter: {
    currency: 'USD',
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: ['mocks/'],
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
} as HardhatUserConfig
