const Migrations = artifacts.require('./Migrations.sol');

const Web3 = require('web3');

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
      const web3 = new Web3(new Web3.providers.HttpProvider(`http://${config.host}:${config.port}`));
      await web3.eth.personal.unlockAccount(config.from, config.passcode, 0);
      deployer.logger.log('Unlocked account: ' + config.from);
    }
  }

  deployer.then(preDeploymentCalls).then(() => deployer.deploy(Migrations, deploymentConfig));
};
