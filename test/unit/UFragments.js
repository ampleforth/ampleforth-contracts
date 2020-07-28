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
const transferAmount = toUFrgDenomination(10);
const unitTokenAmount = toUFrgDenomination(1);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

let uFragments, b, r, deployer, user, initialSupply;
async function setupContracts () {
  const accounts = await chain.getUserAccounts();
  deployer = accounts[0];
  user = accounts[1];
  uFragments = await UFragments.new();
  r = await uFragments.sendTransaction({
    data: encodeCall('initialize', ['address'], [deployer]),
    from: deployer
  });
  initialSupply = await uFragments.totalSupply.call();
}

contract('UFragments', function (accounts) {
  before('setup UFragments contract', setupContracts);

  it('should reject any ether sent to it', async function () {
    expect(
      await chain.isEthException(uFragments.sendTransaction({ from: user, value: 1 }))
    ).to.be.true;
  });
});

contract('UFragments:Initialization', function (accounts) {
  before('setup UFragments contract', setupContracts);

  it('should transfer 50M uFragments to the deployer', async function () {
    (await uFragments.balanceOf.call(deployer)).should.be.bignumber.eq(INTIAL_SUPPLY);
    const log = r.logs[0];
    expect(log).to.exist;
    expect(log.event).to.eq('Transfer');
    expect(log.args.from).to.eq(ZERO_ADDRESS);
    expect(log.args.to).to.eq(deployer);
    log.args.value.should.be.bignumber.eq(INTIAL_SUPPLY);
  });

  it('should set the totalSupply to 50M', async function () {
    initialSupply.should.be.bignumber.eq(INTIAL_SUPPLY);
  });

  it('should set the owner', async function () {
    expect(await uFragments.owner.call()).to.eq(deployer);
  });

  it('should set detailed ERC20 parameters', async function () {
    expect(await uFragments.name.call()).to.eq('Ampleforth');
    expect(await uFragments.symbol.call()).to.eq('AMPL');
    (await uFragments.decimals.call()).should.be.bignumber.eq(DECIMALS);
  });

  it('should have 9 decimals', async function () {
    const decimals = await uFragments.decimals.call();
    decimals.should.be.bignumber.eq(DECIMALS);
  });

  it('should have AMPL symbol', async function () {
    const symbol = await uFragments.symbol.call();
    symbol.should.be.eq('AMPL');
  });
});

contract('UFragments:setMonetaryPolicy', function (accounts) {
  const policy = accounts[1];

  before('setup UFragments contract', setupContracts);

  it('should set reference to policy contract', async function () {
    await uFragments.setMonetaryPolicy(policy, { from: deployer });
    expect(await uFragments.monetaryPolicy.call()).to.eq(policy);
  });

  it('should emit policy updated event', async function () {
    const r = await uFragments.setMonetaryPolicy(policy, { from: deployer });
    const log = r.logs[0];
    expect(log).to.exist;
    expect(log.event).to.eq('LogMonetaryPolicyUpdated');
    expect(log.args.monetaryPolicy).to.eq(policy);
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

contract('UFragments:Rebase:accessControl', function (accounts) {
  before('setup UFragments contract', async function () {
    await setupContracts();
    await uFragments.setMonetaryPolicy(user, {from: deployer});
  });

  it('should be callable by monetary policy', async function () {
    expect(
      await chain.isEthException(uFragments.rebase(1, transferAmount, { from: user }))
    ).to.be.false;
  });

  it('should not be callable by others', async function () {
    expect(
      await chain.isEthException(uFragments.rebase(1, transferAmount, { from: deployer }))
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
    log.args.epoch.should.be.bignumber.eq(1);
    log.args.totalSupply.should.be.bignumber.eq(initialSupply.plus(rebaseAmt));
  });

  it('should return the new supply', async function () {
    const returnVal = await uFragments.rebase.call(2, rebaseAmt, {from: policy});
    await uFragments.rebase(2, rebaseAmt, {from: policy});
    const supply = await uFragments.totalSupply.call();
    returnVal.should.be.bignumber.eq(supply);
  });
});

contract('UFragments:Rebase:Expansion', function (accounts) {
  const policy = accounts[1];
  const MAX_SUPPLY = new BigNumber(2).pow(128).minus(1);

  describe('when totalSupply is less than MAX_SUPPLY and expands beyond', function () {
    before('setup UFragments contract', async function () {
      await setupContracts();
      await uFragments.setMonetaryPolicy(policy, {from: deployer});
      const totalSupply = await uFragments.totalSupply.call();
      await uFragments.rebase(1, MAX_SUPPLY.minus(totalSupply).minus(toUFrgDenomination(1)), {from: policy});
      r = await uFragments.rebase(2, toUFrgDenomination(2), {from: policy});
    });

    it('should increase the totalSupply to MAX_SUPPLY', async function () {
      b = await uFragments.totalSupply.call();
      b.should.be.bignumber.eq(MAX_SUPPLY);
    });

    it('should emit Rebase', async function () {
      const log = r.logs[0];
      expect(log).to.exist;
      expect(log.event).to.eq('LogRebase');
      expect(log.args.epoch.toNumber()).to.eq(2);
      log.args.totalSupply.should.be.bignumber.eq(MAX_SUPPLY);
    });
  });

  describe('when totalSupply is MAX_SUPPLY and expands', function () {
    before(async function () {
      b = await uFragments.totalSupply.call();
      b.should.be.bignumber.eq(MAX_SUPPLY);
      r = await uFragments.rebase(3, toUFrgDenomination(2), {from: policy});
    });

    it('should NOT change the totalSupply', async function () {
      b = await uFragments.totalSupply.call();
      b.should.be.bignumber.eq(MAX_SUPPLY);
    });

    it('should emit Rebase', async function () {
      const log = r.logs[0];
      expect(log).to.exist;
      expect(log.event).to.eq('LogRebase');
      expect(log.args.epoch.toNumber()).to.eq(3);
      log.args.totalSupply.should.be.bignumber.eq(MAX_SUPPLY);
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
    b.should.be.bignumber.eq(initialSupply);
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
    log.args.epoch.should.be.bignumber.eq(1);
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
    log.args.epoch.should.be.bignumber.eq(1);
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
        await chain.isEthException(uFragments.transfer(uFragments.address, unitTokenAmount, { from: owner }))
      ).to.be.true;
    });

    it('reverts on transferFrom', async function () {
      expect(
        await chain.isEthException(uFragments.transferFrom(owner, uFragments.address, unitTokenAmount, { from: owner }))
      ).to.be.true;
    });
  });

  describe('when the recipient is the zero address', function () {
    const owner = A;

    before(async function () {
      r = await uFragments.approve(ZERO_ADDRESS, transferAmount, { from: owner });
    });
    it('emits an approval event', async function () {
      expect(r.logs.length).to.eq(1);
      expect(r.logs[0].event).to.eq('Approval');
      expect(r.logs[0].args.owner).to.eq(owner);
      expect(r.logs[0].args.spender).to.eq(ZERO_ADDRESS);
      r.logs[0].args.value.should.be.bignumber.eq(transferAmount);
    });

    it('transferFrom should fail', async function () {
      expect(
        await chain.isEthException(uFragments.transferFrom(owner, ZERO_ADDRESS, transferAmount, { from: C }))
      ).to.be.true;
    });
  });
});
