const Migrations = artifacts.require('./Migrations.sol');
const _require = require('app-root-path').require;
const truffleConfig = _require('/truffle.js');

module.exports = function (deployer, network, addresses) {
  const config = truffleConfig.networks[network];

  const deploymentConfig = {
    gas: config.gas
  };

  async function preDeploymentCalls () {
    const deployerAccount = addresses[0];
    // Requires the deployer account to be unlocked
    if (config.passcode) {
      await web3.personal.unlockAccount(deployerAccount, config.passcode, 0);
      deployer.logger.log('Unlocked account: ' + deployerAccount);
    }
  }

  deployer.then(preDeploymentCalls).then(() => deployer.deploy(Migrations, deploymentConfig));
};
