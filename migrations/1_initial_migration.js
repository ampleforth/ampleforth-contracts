const Migrations = artifacts.require('./Migrations.sol');
const _require = require('app-root-path').require;
const truffleConfig = _require('/truffle.js');

module.exports = function (deployer, network, addresses) {
  const config = truffleConfig.networks[network];

  const deploymentConfig = {
    gas: config.gas
  };

  async function preDeploymentCalls () {
    if (config.passcode) {
      for (const account in config.passcode) {
        if (Object.prototype.hasOwnProperty.call(config.passcode, account)) {
          await web3.personal.unlockAccount(account, config.passcode[account], 0);
          deployer.logger.log('Unlocked account: ' + account);
        }
      }
    }
  }

  deployer.then(preDeploymentCalls).then(() => deployer.deploy(Migrations, deploymentConfig));
};
