const UFragments = artifacts.require('UFragments.sol');
const UFragmentsPolicy = artifacts.require('UFragmentsPolicy.sol');
const ProxyContract = artifacts.require('ProxyContract.sol');

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

  async function useProxyLinks () {
    await deployer.deploy(ProxyContract, deploymentConfig);
    await deployer.deploy(UFragmentsPolicy, ProxyContract.address, ProxyContract.address, deploymentConfig);
    const proxy = ProxyContract.at(ProxyContract.address);
    await proxy.setReferences(UFragments.address, deploymentConfig);
    const uFrag = UFragments.at(UFragments.address);
    await uFrag.transferOwnership(ProxyContract.address, deploymentConfig);
  }

  async function useActualLinks () {
    throw (new Error('Deployment logic yet to be implemented'));
  }

  // TODO: handle deployment logic for different environments
  async function deployFragmentsContracts (deployer) {
    deployer.logger.log('Deploying core contract(s)');
    await deployer.deploy(UFragments, deploymentConfig);

    if (network === 'ganacheUnitTest' ||
        network === 'gethUnitTest' ||
        network === 'ganacheDev' ||
        network === 'gethDev') {
      await useProxyLinks(deployer);
    } else {
      await useActualLinks(deployer);
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
      ProxyContract: ProxyContract.address,
      ProxyContractTx: ProxyContract.transactionHash
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
