const UFragments = artifacts.require('UFragments.sol');
const ProxyContract = artifacts.require('ProxyContract.sol');

const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

contract('UFragments', async accounts => {
  let fragments, proxy;
  const deployer = accounts[0];

  before(async function () {
    fragments = await UFragments.deployed();
    proxy = await ProxyContract.deployed();
  });

  describe('rebase', () => {
    it('should be callable by the contract owner', async () => {
      await proxy.callThroughToUFRGRebase(1, 10);
    });
    it('should NOT be callable by others', async () => {
      await chain.expectEthException(
        fragments.rebase(1, 100, { from: deployer })
      );
    });
  });
});
