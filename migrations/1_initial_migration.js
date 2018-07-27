const Migrations = artifacts.require('./Migrations.sol');
const _require = require('app-root-path').require;
const truffleConfig = _require('/truffle.js');
const accounts = truffleConfig.accounts;

module.exports = function (deployer, network) {
  const deployerAccount = accounts[0];
  const config = truffleConfig.networks[network];
  const deploymentConfig = {
    gas: config.gas,
    from: deployerAccount
  };
  deployer.deploy(Migrations, deploymentConfig);
};
