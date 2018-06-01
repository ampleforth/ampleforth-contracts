const MicroFragments = artifacts.require('MicroFragments.sol');

const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

contract('MicroFragments', async accounts => {
  let fragments, proxy;
  const deployer = accounts[0];

  before(async function () {
    fragments = await MicroFragments.deployed();
  });

  describe('rebase', () => {
    it('should be callable by the contract owner', async () => {
      await fragments.rebase(10, { from: deployer });
    });
    it('should NOT be callable by others', async () => {
      await chain.expectEthException(
        fragments.rebase(100, { from: accounts[1] })
      );
    });
  });
});
