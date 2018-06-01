const MicroFragments = artifacts.require('MicroFragments.sol');

const APP_ROOT_PATH = require('app-root-path');
const _require = APP_ROOT_PATH.require;
const generateYaml = _require('/util/yaml_generator');
const truffleConfig = _require('/truffle.js');

module.exports = function (deployer, network, accounts) {
  const deployerAccount = accounts[0];
  const config = truffleConfig.networks[network];
  const deploymentConfig = {
    gas: config.gas
  };

  async function deployFragmentsContracts (deployer) {
    deployer.logger.log('Deploying core contracts');
    await deployer.deploy(MicroFragments, deploymentConfig);
  }

  async function saveDeploymentData () {
    // Keep track of deployed contract addresses for future reference
    await generateYaml({
      network: config.ref,
      rpcHttpClient: `http://${config.host}:${config.port}`,
      rpcWsClient: `ws://${config.host}:${config.wsPort}`,
      deployer: deployerAccount,
      microFragments: MicroFragments.address,
      microFragmentsTx: MicroFragments.transactionHash,
    }, `${APP_ROOT_PATH}/migrations/deployments/${config.ref}.yaml`);
  }

  async function deploy (deployer) {
    deployer.logger.log('************************************************************');
    deployer.logger.log(`Deploying contracts from: ${deployerAccount}`);
    await deployFragmentsContracts(deployer);
    await saveDeploymentData();
    deployer.logger.log('Deployment complete!');
    deployer.logger.log('************************************************************');
  }

  return deployer.then(() => deploy(deployer));
};
