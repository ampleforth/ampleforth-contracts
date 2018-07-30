const HDWalletProvider = require('truffle-hdwallet-provider');
const connectionConfig = require('./scripts/frg-ethereum-runners/config/network_config.json');

const ganacheUnitTestConf = connectionConfig.ganacheUnitTest;
const gethUnitTestConf = connectionConfig.gethUnitTest;

module.exports = {
  accounts: require('./scripts/frg-ethereum-runners/config/accounts.json'),
  networks: {
    gethUnitTest: {
      ref: gethUnitTestConf.ref,
      host: gethUnitTestConf.host,
      port: gethUnitTestConf.port,
      network_id: gethUnitTestConf.network_id,
      gas: gethUnitTestConf.gas,
      gasPrice: gethUnitTestConf.gasPrice,
      provider: new HDWalletProvider(
        gethUnitTestConf.testOnlyHDWPasscode,
        `http://${gethUnitTestConf.host}:${gethUnitTestConf.port}/`, 0, 10)
    },
    ganacheUnitTest: {
      ref: ganacheUnitTestConf.ref,
      host: ganacheUnitTestConf.host,
      port: ganacheUnitTestConf.port,
      network_id: ganacheUnitTestConf.network_id,
      gas: ganacheUnitTestConf.gas,
      gasPrice: ganacheUnitTestConf.gasPrice
    }
  },
  mocha: {
    enableTimeouts: false
  }
};
