const UFragments = artifacts.require('UFragments.sol');
const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);
const BigNumber = web3.BigNumber;
const encodeCall = require('zos-lib/lib/helpers/encodeCall').default;

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

function toUFrgDenomination (x) {
  return new BigNumber(x).mul(10 ** DECIMALS);
}
const DECIMALS = 9;
const INTIAL_SUPPLY = toUFrgDenomination(50 * 10 ** 6);

let uFragments, b, r, deployer, user, initialSupply;
async function setupContracts () {
  const accounts = await chain.getUserAccounts();
  deployer = accounts[0];
  user = accounts[1];
  uFragments = await UFragments.new();
  await uFragments.sendTransaction({
    data: encodeCall('initialize', ['address'], [deployer]),
    from: deployer
  });
  initialSupply = await uFragments.totalSupply.call();
}

contract('UFragments:Initialization', function (accounts) {
  before('setup UFragments contract', setupContracts);

  it('should add 50M uFragments to the deployer', async function () {
    b = await uFragments.balanceOf.call(deployer);
    b.should.be.bignumber.eq(INTIAL_SUPPLY);
  });

  it('should set the totalSupply to 50M', async function () {
    b = await uFragments.totalSupply.call();
    b.should.be.bignumber.eq(INTIAL_SUPPLY);
  });
});

contract('UFragments:setMonetaryPolicy', function (accounts) {
  const policy = accounts[1];

  before('setup UFragments contract', setupContracts);

  it('should set reference to policy contract', async function () {
    await uFragments.setMonetaryPolicy(policy, { from: deployer });
    expect(await uFragments._monetaryPolicy.call()).to.eq(policy);
  });
});

contract('UFragments:setMonetaryPolicy', function (accounts) {
  const policy = accounts[1];

  before('setup UFragments contract', setupContracts);

  it('should not be callable after reference is set', async function () {
    expect(
      await chain.isEthException(uFragments.setMonetaryPolicy(policy, { from: deployer }))
    ).to.be.false;
    expect(
      await chain.isEthException(uFragments.setMonetaryPolicy(policy, { from: deployer }))
    ).to.be.true;
  });
});

contract('UFragments:setMonetaryPolicy:accessControl', function (accounts) {
  const policy = accounts[1];

  before('setup UFragments contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(uFragments.setMonetaryPolicy(policy, { from: deployer }))
    ).to.be.false;
  });
});

contract('UFragments:setMonetaryPolicy:accessControl', function (accounts) {
  const policy = accounts[1];
  const user = accounts[2];

  before('setup UFragments contract', setupContracts);

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(uFragments.setMonetaryPolicy(policy, { from: user }))
    ).to.be.true;
  });
});

contract('UFragments:PauseRebase', function (accounts) {
  const policy = accounts[1];
  const A = accounts[2];
  const B = accounts[3];

  before('setup UFragments contract', async function () {
    await setupContracts();
    await uFragments.setMonetaryPolicy(policy, {from: deployer});
    r = await uFragments.setRebasePaused(true);
  });

  it('should emit pause event', async function () {
    const log = r.logs[0];
    expect(log).to.exist;
    expect(log.event).to.eq('LogRebasePaused');
    expect(log.args.paused).to.be.true;
  });

  it('should not allow calling rebase', async function () {
    expect(
      await chain.isEthException(uFragments.rebase(1, toUFrgDenomination(500), { from: policy }))
    ).to.be.true;
  });

  it('should allow calling transfer', async function () {
    await uFragments.transfer(A, toUFrgDenomination(10), { from: deployer });
  });

  it('should allow calling approve', async function () {
    await uFragments.approve(A, toUFrgDenomination(10), { from: deployer });
  });

  it('should allow calling allowance', async function () {
    await uFragments.allowance.call(deployer, A);
  });

  it('should allow calling transferFrom', async function () {
    await uFragments.transferFrom(deployer, B, toUFrgDenomination(10), {from: A});
  });

  it('should allow calling increaseAllowance', async function () {
    await uFragments.increaseAllowance(A, toUFrgDenomination(10), {from: deployer});
  });

  it('should allow calling decreaseAllowance', async function () {
    await uFragments.decreaseAllowance(A, 10, {from: deployer});
  });

  it('should allow calling balanceOf', async function () {
    await uFragments.balanceOf.call(deployer);
  });

  it('should allow calling totalSupply', async function () {
    await uFragments.totalSupply.call();
  });
});

contract('UFragments:PauseRebase:accessControl', function (accounts) {
  before('setup UFragments contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(uFragments.setRebasePaused(true, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(uFragments.setRebasePaused(true, { from: user }))
    ).to.be.true;
  });
});

contract('UFragments:PauseToken', function (accounts) {
  const policy = accounts[1];
  const A = accounts[2];
  const B = accounts[3];

  before('setup UFragments contract', async function () {
    await setupContracts();
    await uFragments.setMonetaryPolicy(policy, {from: deployer});
    r = await uFragments.setTokenPaused(true);
  });

  it('should emit pause event', async function () {
    const log = r.logs[0];
    expect(log).to.exist;
    expect(log.event).to.eq('LogTokenPaused');
    expect(log.args.paused).to.be.true;
  });

  it('should allow calling rebase', async function () {
    await uFragments.rebase(1, toUFrgDenomination(500), { from: policy });
  });

  it('should not allow calling transfer', async function () {
    expect(
      await chain.isEthException(uFragments.transfer(A, toUFrgDenomination(10), { from: deployer }))
    ).to.be.true;
  });

  it('should not allow calling approve', async function () {
    expect(
      await chain.isEthException(uFragments.approve(A, toUFrgDenomination(10), { from: deployer }))
    ).to.be.true;
  });

  it('should allow calling allowance', async function () {
    await uFragments.allowance.call(deployer, A);
  });

  it('should not allow calling transferFrom', async function () {
    expect(
      await chain.isEthException(uFragments.transferFrom(deployer, B, toUFrgDenomination(10), {from: A}))
    ).to.be.true;
  });

  it('should not allow calling increaseAllowance', async function () {
    expect(
      await chain.isEthException(uFragments.increaseAllowance(A, toUFrgDenomination(10), {from: deployer}))
    ).to.be.true;
  });

  it('should not allow calling decreaseAllowance', async function () {
    expect(
      await chain.isEthException(uFragments.decreaseAllowance(A, toUFrgDenomination(10), {from: deployer}))
    ).to.be.true;
  });

  it('should allow calling balanceOf', async function () {
    await uFragments.balanceOf.call(deployer);
  });

  it('should allow calling totalSupply', async function () {
    await uFragments.totalSupply.call();
  });
});

contract('UFragments:PauseToken:accessControl', function (accounts) {
  before('setup UFragments contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(uFragments.setTokenPaused(true, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(uFragments.setTokenPaused(true, { from: user }))
    ).to.be.true;
  });
});

contract('UFragments:Rebase:accessControl', function (accounts) {
  before('setup UFragments contract', async function () {
    await setupContracts();
    await uFragments.setMonetaryPolicy(user, {from: deployer});
  });

  it('should be callable by monetary policy', async function () {
    expect(
      await chain.isEthException(uFragments.rebase(1, toUFrgDenomination(10), { from: user }))
    ).to.be.false;
  });

  it('should not be callable by others', async function () {
    expect(
      await chain.isEthException(uFragments.rebase(1, toUFrgDenomination(10), { from: deployer }))
    ).to.be.true;
  });
});

contract('UFragments:Rebase:Expansion', function (accounts) {
  // Rebase +5M (10%), with starting balances A:750 and B:250.
  const A = accounts[2];
  const B = accounts[3];
  const policy = accounts[1];
  const rebaseAmt = INTIAL_SUPPLY / 10;

  before('setup UFragments contract', async function () {
    await setupContracts();
    await uFragments.setMonetaryPolicy(policy, {from: deployer});
    await uFragments.transfer(A, toUFrgDenomination(750), { from: deployer });
    await uFragments.transfer(B, toUFrgDenomination(250), { from: deployer });
    r = await uFragments.rebase(1, rebaseAmt, {from: policy});
  });

  it('should increase the totalSupply', async function () {
    b = await uFragments.totalSupply.call();
    b.should.be.bignumber.eq(initialSupply.plus(rebaseAmt));
  });

  it('should increase individual balances', async function () {
    b = await uFragments.balanceOf.call(A);
    b.should.be.bignumber.eq(toUFrgDenomination(825));

    b = await uFragments.balanceOf.call(B);
    b.should.be.bignumber.eq(toUFrgDenomination(275));
  });

  it('should emit Rebase', async function () {
    const log = r.logs[0];
    expect(log).to.exist;
    expect(log.event).to.eq('LogRebase');
    expect(log.args.epoch.toNumber()).to.eq(1);
    log.args.totalSupply.should.be.bignumber.eq(initialSupply.plus(rebaseAmt));
  });
});

contract('UFragments:Rebase:Expansion', function (accounts) {
  const policy = accounts[1];
  const MAX_SUPPLY = new BigNumber(2).pow(128).minus(1);

  before('setup UFragments contract', async function () {
    await setupContracts();
    await uFragments.setMonetaryPolicy(policy, {from: deployer});
  });

  describe('when the totalSupply is less than MAX_SUPPLY and expands beyond', function () {
    before(async function () {
      const rebaseAmt = MAX_SUPPLY.minus(initialSupply).minus(toUFrgDenomination(1));
      await uFragments.rebase(1, rebaseAmt, {from: policy});
      await uFragments.rebase(2, toUFrgDenomination(2), {from: policy});
    });

    it('should increase the totalSupply to MAX_SUPPLY', async function () {
      b = await uFragments.totalSupply.call();
      b.should.be.bignumber.eq(MAX_SUPPLY);
    });
  });

  describe('when the totalSupply MAX_SUPPLY and expands beyond', function () {
    before(async function () {
      r = await uFragments.rebase(3, toUFrgDenomination(0.01), {from: policy});
    });

    it('should not change totalSupply', async function () {
      b = await uFragments.totalSupply.call();
      b.should.be.bignumber.eq(MAX_SUPPLY);
    });
  });
});

contract('UFragments:Rebase:NoChange', function (accounts) {
  // Rebase (0%), with starting balances A:750 and B:250.
  const A = accounts[2];
  const B = accounts[3];
  const policy = accounts[1];

  before('setup UFragments contract', async function () {
    await setupContracts();
    await uFragments.setMonetaryPolicy(policy, {from: deployer});
    await uFragments.transfer(A, toUFrgDenomination(750), { from: deployer });
    await uFragments.transfer(B, toUFrgDenomination(250), { from: deployer });
    r = await uFragments.rebase(1, 0, {from: policy});
  });

  it('should NOT CHANGE the totalSupply', async function () {
    b = await uFragments.totalSupply.call();
    expect(b.toNumber()).to.eq(initialSupply.toNumber());
  });

  it('should NOT CHANGE individual balances', async function () {
    b = await uFragments.balanceOf.call(A);
    b.should.be.bignumber.eq(toUFrgDenomination(750));

    b = await uFragments.balanceOf.call(B);
    b.should.be.bignumber.eq(toUFrgDenomination(250));
  });

  it('should emit Rebase', async function () {
    const log = r.logs[0];
    expect(log).to.exist;
    expect(log.event).to.eq('LogRebase');
    expect(log.args.epoch.toNumber()).to.eq(1);
    log.args.totalSupply.should.be.bignumber.eq(initialSupply);
  });
});

contract('UFragments:Rebase:Contraction', function (accounts) {
  // Rebase -5M (-10%), with starting balances A:750 and B:250.
  const A = accounts[2];
  const B = accounts[3];
  const policy = accounts[1];
  const rebaseAmt = INTIAL_SUPPLY / 10;

  before('setup UFragments contract', async function () {
    await setupContracts();
    await uFragments.setMonetaryPolicy(policy, {from: deployer});
    await uFragments.transfer(A, toUFrgDenomination(750), { from: deployer });
    await uFragments.transfer(B, toUFrgDenomination(250), { from: deployer });
    r = await uFragments.rebase(1, -rebaseAmt, {from: policy});
  });

  it('should decrease the totalSupply', async function () {
    b = await uFragments.totalSupply.call();
    b.should.be.bignumber.eq(initialSupply.minus(rebaseAmt));
  });

  it('should decrease individual balances', async function () {
    b = await uFragments.balanceOf.call(A);
    b.should.be.bignumber.eq(toUFrgDenomination(675));

    b = await uFragments.balanceOf.call(B);
    b.should.be.bignumber.eq(toUFrgDenomination(225));
  });

  it('should emit Rebase', async function () {
    const log = r.logs[0];
    expect(log).to.exist;
    expect(log.event).to.eq('LogRebase');
    expect(log.args.epoch.toNumber()).to.eq(1);
    log.args.totalSupply.should.be.bignumber.eq(initialSupply.minus(rebaseAmt));
  });
});

contract('UFragments:Transfer', function (accounts) {
  const A = accounts[2];
  const B = accounts[3];
  const C = accounts[4];

  before('setup UFragments contract', setupContracts);

  describe('deployer transfers 12 to A', function () {
    it('should have correct balances', async function () {
      const deployerBefore = await uFragments.balanceOf.call(deployer);
      await uFragments.transfer(A, toUFrgDenomination(12), { from: deployer });
      b = await uFragments.balanceOf.call(deployer);
      b.should.be.bignumber.eq(deployerBefore.minus(toUFrgDenomination(12)));
      b = await uFragments.balanceOf.call(A);
      b.should.be.bignumber.eq(toUFrgDenomination(12));
    });
  });

  describe('deployer transfers 15 to B', async function () {
    it('should have balances [973,15]', async function () {
      const deployerBefore = await uFragments.balanceOf.call(deployer);
      await uFragments.transfer(B, toUFrgDenomination(15), { from: deployer });
      b = await uFragments.balanceOf.call(deployer);
      b.should.be.bignumber.eq(deployerBefore.minus(toUFrgDenomination(15)));
      b = await uFragments.balanceOf.call(B);
      b.should.be.bignumber.eq(toUFrgDenomination(15));
    });
  });

  describe('deployer transfers the rest to C', async function () {
    it('should have balances [0,973]', async function () {
      const deployerBefore = await uFragments.balanceOf.call(deployer);
      await uFragments.transfer(C, deployerBefore, { from: deployer });
      b = await uFragments.balanceOf.call(deployer);
      b.should.be.bignumber.eq(0);
      b = await uFragments.balanceOf.call(C);
      b.should.be.bignumber.eq(deployerBefore);
    });
  });

  describe('when the recipient address is the contract address', function () {
    const owner = A;

    it('reverts on transfer', async function () {
      expect(
        await chain.isEthException(uFragments.transfer(uFragments.address, toUFrgDenomination(1), { from: owner }))
      ).to.be.true;
    });

    it('reverts on transferFrom', async function () {
      expect(
        await chain.isEthException(uFragments.transferFrom(owner, uFragments.address, toUFrgDenomination(1), { from: owner }))
      ).to.be.true;
    });
  });
});
