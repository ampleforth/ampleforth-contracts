const MicroFragments = artifacts.require('MicroFragments.sol');

const _require = require('app-root-path').require;
const { StandardTokenBehavior } = _require('/test/behavior/erc20');

contract('MicroFragments', async accounts => {
  let mFragments;

  before(async function () {
    mFragments = await MicroFragments.deployed();
  });

  describe('MicroFragments as ERC20', () => {
    it('should confirm to the specification', () => {
      const owner = accounts[0];
      const anotherAccount = accounts[8];
      const recipient = accounts[9];

      StandardTokenBehavior(mFragments, 1000, owner, anotherAccount, recipient);
    });
  });
});
