const uFragments = artifacts.require('UFragments.sol');

const _require = require('app-root-path').require;
const { StandardTokenBehavior } = _require('/test/behavior/erc20');

contract('uFragments', async accounts => {
  let mFragments;

  before(async function () {
    mFragments = await uFragments.deployed();
  });

  describe('uFragments as ERC20', () => {
    it('should confirm to the specification', () => {
      const owner = accounts[0];
      const anotherAccount = accounts[8];
      const recipient = accounts[9];

      StandardTokenBehavior(mFragments, 1000, owner, anotherAccount, recipient);
    });
  });
});
