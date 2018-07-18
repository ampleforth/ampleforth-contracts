const UFragments = artifacts.require('UFragments.sol');
const UFragmentsPolicy = artifacts.require('UFragmentsPolicy.sol');
const MockUFragments = artifacts.require('MockUFragments.sol');
const MockMarketOracle = artifacts.require('MockMarketOracle.sol');

const APP_ROOT_PATH = require('app-root-path');
const MarketSourceFactory = artifacts.require('market-oracle/MarketSourceFactory.sol');
const MarketOracle = artifacts.require('market-oracle/MarketOracle.sol');
const MarketSource = {};

const _require = APP_ROOT_PATH.require;
const generateYaml = _require('/util/yaml_generator');
const truffleConfig = _require('/truffle.js');

module.exports = function (deployer, network, accounts) {
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

  async function devDeployment (deployer) {
    deployer.logger.log('Deploying dev environment (all contracts from the same user)');

    // Deploying market oracle
    await deployer.deploy(MarketOracle, deploymentConfig);
    const oracle = MarketOracle.at(MarketOracle.address);

    // Deploying market source
    await deployer.deploy(MarketSourceFactory, deploymentConfig);
    const factory = MarketSourceFactory.at(MarketSourceFactory.address);
    const createdSourceAddress = (await factory.createSource('DevMarketSource0')).logs[0].args.source;
    MarketSource.address = createdSourceAddress;
    MarketSource.transactionHash = (await oracle.addSource(createdSourceAddress)).tx;

    // Deploying UFragments
    await deployer.deploy(UFragments, deploymentConfig);

    // Deploying UFragmentsPolicy
    await deployer.deploy(UFragmentsPolicy, UFragments.address, MarketOracle.address, deploymentConfig);

    // Setting uFragments reference to the policy
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
      await saveDeploymentData({UFragments, UFragmentsPolicy, MockMarketOracle, MockUFragments});
    } else if (network === 'ganacheDev' ||
               network === 'gethDev') {
      await devDeployment(deployer);
      await saveDeploymentData({UFragments, UFragmentsPolicy, MarketSourceFactory, MarketOracle, MarketSource});
    } else {
      await liveDeployment(deployer);
    }
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
    await deployFragmentsContracts(deployer);
    deployer.logger.log('Deployment complete!');
    deployer.logger.log('************************************************************');
  }

  return deployer.then(() => deploy(deployer));
};
