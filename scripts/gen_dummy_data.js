/**
 * This truffle script generates dummy data. It generates a history of
 * exchange rate reports and rebase events on the blockchain which are useful in
 * integration testing or bootstrapping dependent components.
 *
 * Example usage:
 * $ npm run blockchain:start gethUnitTest
 * $ npm run genDummyData
 */
const yaml = require('js-yaml');
const fs = require('fs');
const APP_ROOT_PATH = require('app-root-path');

const UFragments = artifacts.require('UFragments.sol');
const UFragmentsPolicy = artifacts.require('UFragmentsPolicy.sol');
const MockMarketOracle = artifacts.require('MockMarketOracle.sol');

const Stochasm = require('stochasm');
const BigNumber = require('bignumber.js');
const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

const network = artifacts.options._values.network;
const truffleConfig = _require('/truffle.js');
const config = truffleConfig.networks[network];
const chainConfig = yaml.safeLoad(fs.readFileSync(`${APP_ROOT_PATH}/migrations/deployments/${config.ref}.yaml`));

async function mockData () {
  const accounts = await chain.getUserAccounts();
  const deployer = accounts[0];
  const txConfig = {
    gas: config.gas,
    from: deployer
  };

  const uFragments = UFragments.at(chainConfig.UFragments);
  const policy = UFragmentsPolicy.at(chainConfig.UFragmentsPolicy);
  const oracle = await MockMarketOracle.at(chainConfig.MockMarketOracle);
  await policy.setMinRebaseTimeIntervalSec(1);

  const rateGen = new Stochasm({ mean: 1.75, stdev: 0.5, min: 0.5, max: 5, seed: 'fragments.org' });
  let supply = await uFragments.totalSupply.call();
  for (let i = 0, r; i < 1000; i++) {
    // Reporting rates
    const volumeGen = new Stochasm({ mean: 0.25 * supply, stdev: 0.1 * supply, min: 0, max: supply, seed: 'fragments.org' });
    const rate = new BigNumber(rateGen.next().toFixed(5)).mul(10 ** 18);
    const volume = new BigNumber(volumeGen.next().toFixed(0));
    console.log(`Reporting (Volume=${volume}), (Rate=${rate}), (Supply=${supply})`);

    // Getting total supply
    supply = await uFragments.totalSupply.call();
    supply = new BigNumber(supply);

    // Report data through market oracle
    await oracle.storeRate(rate, txConfig);
    await oracle.storeVolume(volume, txConfig);

    // Calling policy rebase
    r = await policy.rebase(txConfig);

    const epoch = await policy.epoch.call();
    const supplyDelta = r.logs[0].args.appliedSupplyAdjustment;
    const supply_ = await uFragments.totalSupply.call();
    console.log(`Rebase: SupplyDelta=${supplyDelta} Supply_=${supply_} Epoch=${epoch}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  process.exit(-1);
}

module.exports = function (callback) {
  mockData().then(callback);
};
