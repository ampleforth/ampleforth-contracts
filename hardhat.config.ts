import { HardhatUserConfig } from 'hardhat/config'
import { Wallet } from 'ethers'

import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@openzeppelin/hardhat-upgrades'
import '@nomiclabs/hardhat-etherscan'
import 'solidity-coverage'
import 'hardhat-gas-reporter'

require('./scripts/deploy')

export default {
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_SECRET}`,
      accounts: {
        mnemonic: process.env.DEV_MNEMONIC || Wallet.createRandom().mnemonic.phrase,
      },
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${process.env.INFURA_SECRET}`,
      accounts: {
        mnemonic: process.env.DEV_MNEMONIC || Wallet.createRandom().mnemonic.phrase,
      },
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_SECRET}`,
      accounts: {
        mnemonic: process.env.PROD_MNEMONIC || Wallet.createRandom().mnemonic.phrase,
      },
    },
  },
  solidity: {
    compilers: [
      {
        version: '0.8.4',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
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
