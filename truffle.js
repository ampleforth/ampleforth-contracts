const connectionConfig = require('frg-ethereum-runners/config/network_config.json');

module.exports = {
  networks: {
    ganacheUnitTest: connectionConfig.ganacheUnitTest,
    gethUnitTest: connectionConfig.gethUnitTest,
    testrpcCoverage: connectionConfig.testrpcCoverage
  },
  mocha: {
    enableTimeouts: false
  }
};
