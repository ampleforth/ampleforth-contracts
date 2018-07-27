const UFragments = artifacts.require('UFragments.sol');
const UFragmentsPolicy = artifacts.require('UFragmentsPolicy.sol');
const MockUFragments = artifacts.require('MockUFragments.sol');
const MockMarketOracle = artifacts.require('MockMarketOracle.sol');

const APP_ROOT_PATH = require('app-root-path');
const _require = APP_ROOT_PATH.require;
const generateYaml = _require('/util/yaml_generator');
const truffleConfig = _require('/truffle.js');
const accounts = truffleConfig.accounts;

module.exports = function (deployer, network) {
  const deployerAccount = accounts[0];
  const config = truffleConfig.networks[network];
  const deploymentConfig = {
    gas: config.gas,
    from: deployerAccount
  };

  async function unitTestDeployment (deployer) {
    deployer.logger.log('Deploying test environment with mocks');
    await deployer.deploy(UFragments, deploymentConfig);
    await deployer.deploy(MockUFragments, deploymentConfig);
    await deployer.deploy(MockMarketOracle, deploymentConfig);
    await deployer.deploy(UFragmentsPolicy, MockUFragments.address, MockMarketOracle.address, deploymentConfig);

    const uFrag = UFragments.at(UFragments.address);
    await uFrag.setMonetaryPolicy(deployerAccount);
  }

  async function saveDeploymentData (deployedContracts) {
    // Keep track of deployed contract addresses for future reference
    const deploymentRef = {
      network: config.ref,
      rpcHttpClient: `http://${config.host}:${config.port}`,
      rpcWsClient: `ws://${config.host}:${config.wsPort}`,
      deployer: deployerAccount
    };
    for (const contractName in deployedContracts) {
      if (Object.prototype.hasOwnProperty.call(deployedContracts, contractName)) {
        const contract = deployedContracts[contractName];
        deploymentRef[contractName] = contract.address;
        deploymentRef[contractName + 'Tx'] = contract.transactionHash;
      }
    }
    await generateYaml(deploymentRef, `${APP_ROOT_PATH}/migrations/deployments/${config.ref}.yaml`);
  }

  async function deploy (deployer) {
    deployer.logger.log('************************************************************');
    deployer.logger.log(`Deploying contracts from: ${deployerAccount}`);
    await unitTestDeployment(deployer);
    await saveDeploymentData({UFragments, UFragmentsPolicy, MockMarketOracle, MockUFragments});
    deployer.logger.log('Deployment complete!');
    deployer.logger.log('************************************************************');
  }

  return deployer.then(() => deploy(deployer));
};
