const UFragments = artifacts.require('UFragments.sol');
const UFragmentsPolicy = artifacts.require('UFragmentsPolicy.sol');
const MockUFragments = artifacts.require('MockUFragments.sol');
const MockMarketOracle = artifacts.require('MockMarketOracle.sol');

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

  async function unitTestDeployment (deployer) {
    deployer.logger.log('Deploying test environment with mocks');
    await deployer.deploy(UFragments, deploymentConfig);
    await deployer.deploy(MockUFragments, deploymentConfig);
    await deployer.deploy(MockMarketOracle, deploymentConfig);
    await deployer.deploy(UFragmentsPolicy, MockUFragments.address, MockMarketOracle.address, deploymentConfig);

    const uFrag = UFragments.at(UFragments.address);
    await uFrag.setMonetaryPolicy(deployerAccount);
  }

  async function devDeployment (deployer) {
    deployer.logger.log('Deploying dev environment (still mocking oracle for now)');
    await deployer.deploy(UFragments, deploymentConfig);
    await deployer.deploy(UFragmentsPolicy, UFragments.address, MockMarketOracle.address, deploymentConfig);

    const uFrag = UFragments.at(UFragments.address);
    await uFrag.setMonetaryPolicy(UFragmentsPolicy.address);
  }

  async function liveDeployment (deployer) {
    throw (new Error('Live deployment yet to be implemented'));
  }

  async function deployFragmentsContracts (deployer) {
    if (network === 'ganacheUnitTest' ||
        network === 'gethUnitTest') {
      await unitTestDeployment(deployer);
    } else if (network === 'ganacheDev' ||
               network === 'gethDev') {
      await devDeployment(deployer);
    } else {
      await liveDeployment(deployer);
    }
  }

  async function saveDeploymentData () {
    // Keep track of deployed contract addresses for future reference
    await generateYaml({
      network: config.ref,
      rpcHttpClient: `http://${config.host}:${config.port}`,
      rpcWsClient: `ws://${config.host}:${config.wsPort}`,
      deployer: deployerAccount,
      UFragments: UFragments.address,
      UFragmentsTx: UFragments.transactionHash,
      UFragmentsPolicy: UFragmentsPolicy.address,
      UFragmentsPolicyTx: UFragmentsPolicy.transactionHash,
      MockUFragments: MockUFragments.address,
      MockUFragmentsTx: MockUFragments.transactionHash,
      MockMarketOracle: MockMarketOracle.address,
      MockMarketOracleTx: MockMarketOracle.transactionHash
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
