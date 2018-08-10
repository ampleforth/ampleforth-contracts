/**
 * This truffle script deploys upgradable UFragments, UFragmentsPolicy contracts without any references.
 * This script is ONLY to be used in the 'unitTest' environment.
 * Deployment logic for testnets and mainnet will lie in the uFragments-SRE project.
 ********************************** :NOTE: *************************************
 *************************** DO NOT RUN ON MAINNET *****************************
 *******************************************************************************
 *
 * Example usage:
 * $ truffle --network [ganacheUnitTest|gethUnitTest] exec ./scripts/clean_deploy_contracts.js
 */
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const APP_ROOT = require('app-root-path');
const _require = APP_ROOT.require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);
const network = artifacts.options._values.network;

async function executeCommand (cmd) {
  const { stdout, stderr } = await exec(cmd);
  if (stdout) {
    console.log(stdout);
  }
  if (stderr) {
    console.error(stderr);
    throw new Error('Failed to execute command:', cmd);
  }
}

async function deploy () {
  const accounts = await chain.getUserAccounts();
  const deployerAccount = accounts[0];

  console.log('------Deploying contracts without any references');

  console.log('------Removing local history of previous builds');
  await executeCommand(`rm -f ${APP_ROOT}/zos.${network}.json`);

  console.log('------Pushing contract proxies');
  await executeCommand(`zos push --network ${network} --from ${deployerAccount} --reset`);

  console.log('------Deploying UFragments');
  await executeCommand(`zos create UFragments --network ${network} --from ${deployerAccount}`);

  console.log('------Deploying UFragmentsPolicy');
  await executeCommand(`zos create UFragmentsPolicy --network ${network} --from ${deployerAccount}`);

  console.log('------Closing ZOS session');
  await executeCommand('zos session --close');
}

module.exports = function (done) {
  deploy().then(done).catch(e => {
    console.error(e);
    process.exit(1);
  });
};
