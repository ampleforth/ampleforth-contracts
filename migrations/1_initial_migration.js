const Migrations = artifacts.require('./Migrations.sol');
const _require = require('app-root-path').require;
const truffleConfig = _require('/truffle.js');

module.exports = function (deployer, network, addresses) {
  const config = truffleConfig.networks[network];

  const deploymentConfig = {
    gas: config.gas
  };

  async function preDeploymentCalls () {
    // Requires the deployer account to be unlocked
    if (config.passcode) {
      await web3.personal.unlockAccount(config.from, config.passcode, 0);
      deployer.logger.log('Unlocked account: ' + config.from);
    }
  }

  deployer.then(preDeploymentCalls).then(() => deployer.deploy(Migrations, deploymentConfig));
};
