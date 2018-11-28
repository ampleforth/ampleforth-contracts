const UFragmentsPolicy = artifacts.require('UFragmentsPolicy.sol');
const MockUFragments = artifacts.require('MockUFragments.sol');
const MockMarketOracle = artifacts.require('MockMarketOracle.sol');

const encodeCall = require('zos-lib/lib/helpers/encodeCall').default;
const BigNumber = web3.BigNumber;
const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

let uFragmentsPolicy, mockUFragments, mockMarketOracle;
let r, prevEpoch, prevTime;
let deployer, user;
const MAX_RATE = (new BigNumber('1')).mul(10 ** 6 * 10 ** 18);
const MAX_SUPPLY = (new BigNumber(2).pow(255).minus(1)).div(MAX_RATE);

async function setupContracts () {
  const accounts = await chain.getUserAccounts();
  deployer = accounts[0];
  user = accounts[1];
  mockUFragments = await MockUFragments.new();
  mockMarketOracle = await MockMarketOracle.new();
  uFragmentsPolicy = await UFragmentsPolicy.new();
  await uFragmentsPolicy.sendTransaction({
    data: encodeCall('initialize', ['address', 'address'], [deployer, mockUFragments.address]),
    from: deployer
  });
  await uFragmentsPolicy.setMarketOracle(mockMarketOracle.address);
}

async function mockExternalData (exchangeRate, volume, uFragSupply) {
  await mockMarketOracle.storeRate(exchangeRate);
  await mockMarketOracle.storeVolume(volume);
  await mockUFragments.storeSupply(uFragSupply);
}

contract('UFragmentsPolicy', function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  it('should reject any ether sent to it', async function () {
    expect(
      await chain.isEthException(uFragmentsPolicy.sendTransaction({ from: user, value: 1 }))
    ).to.be.true;
  });
});

contract('UFragmentsPolicy:initialize', async function (accounts) {
  describe('initial values set correctly', function () {
    before('setup UFragmentsPolicy contract', setupContracts);

    it('_deviationThreshold', async function () {
      (await uFragmentsPolicy.deviationThreshold.call()).should.be.bignumber.eq((5 / 100) * (10 ** 18));
    });
    it('_minimumVolume', async function () {
      (await uFragmentsPolicy.minimumVolume.call()).should.be.bignumber.eq(1);
    });
    it('_rebaseLag', async function () {
      (await uFragmentsPolicy.rebaseLag.call()).should.be.bignumber.eq(30);
    });
    it('_minRebaseTimeIntervalSec', async function () {
      (await uFragmentsPolicy.minRebaseTimeIntervalSec.call()).should.be.bignumber.eq(24 * 60 * 60);
    });
    it('_epoch', async function () {
      (await uFragmentsPolicy.epoch.call()).should.be.bignumber.eq(0);
    });
    it('should set owner', async function () {
      expect(await uFragmentsPolicy.owner.call()).to.eq(deployer);
    });
    it('should set reference to uFragments', async function () {
      expect(await uFragmentsPolicy.uFrags.call()).to.eq(mockUFragments.address);
    });
  });
});

contract('UFragmentsPolicy:setMarketOracle', async function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  it('should set marketOracle', async function () {
    await uFragmentsPolicy.setMarketOracle(deployer);
    expect(await uFragmentsPolicy.marketOracle.call()).to.eq(deployer);
  });
});

contract('UFragments:setMarketOracle:accessControl', function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(uFragmentsPolicy.setMarketOracle(deployer, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(uFragmentsPolicy.setMarketOracle(deployer, { from: user }))
    ).to.be.true;
  });
});

contract('UFragmentsPolicy:setDeviationThreshold', async function (accounts) {
  let prevThreshold, threshold;
  before('setup UFragmentsPolicy contract', async function () {
    await setupContracts();
    prevThreshold = await uFragmentsPolicy.deviationThreshold.call();
    threshold = prevThreshold.plus(0.1 * 10 ** 18);
    await uFragmentsPolicy.setDeviationThreshold(threshold);
  });

  it('should set deviationThreshold', async function () {
    (await uFragmentsPolicy.deviationThreshold.call()).should.be.bignumber.eq(threshold);
  });
});

contract('UFragments:setDeviationThreshold:accessControl', function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(uFragmentsPolicy.setDeviationThreshold(0, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(uFragmentsPolicy.setDeviationThreshold(0, { from: user }))
    ).to.be.true;
  });
});

contract('UFragmentsPolicy:setMinimumVolume', async function (accounts) {
  let prevVol, vol;
  before('setup UFragmentsPolicy contract', async function () {
    await setupContracts();
    prevVol = await uFragmentsPolicy.minimumVolume.call();
    vol = prevVol.plus(1);
    await uFragmentsPolicy.setMinimumVolume(vol);
  });

  it('should set minimumVolume', async function () {
    (await uFragmentsPolicy.minimumVolume.call()).should.be.bignumber.eq(vol);
  });
});

contract('UFragments:setMinimumVolume:accessControl', function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(uFragmentsPolicy.setMinimumVolume(0, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(uFragmentsPolicy.setMinimumVolume(0, { from: user }))
    ).to.be.true;
  });
});

contract('UFragmentsPolicy:setRebaseLag', async function (accounts) {
  let prevLag;
  before('setup UFragmentsPolicy contract', async function () {
    await setupContracts();
    prevLag = await uFragmentsPolicy.rebaseLag.call();
  });

  describe('when rebaseLag is more than 0', async function () {
    it('should setRebaseLag', async function () {
      const lag = prevLag.plus(1);
      await uFragmentsPolicy.setRebaseLag(lag);
      (await uFragmentsPolicy.rebaseLag.call()).should.be.bignumber.eq(lag);
    });
  });

  describe('when rebaseLag is 0', async function () {
    it('should fail', async function () {
      expect(
        await chain.isEthException(uFragmentsPolicy.setRebaseLag(0))
      ).to.be.true;
    });
  });
});

contract('UFragments:setRebaseLag:accessControl', function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(uFragmentsPolicy.setRebaseLag(1, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(uFragmentsPolicy.setRebaseLag(1, { from: user }))
    ).to.be.true;
  });
});

contract('UFragmentsPolicy:setMinRebaseTimeIntervalSec', async function (accounts) {
  let prevInterval;
  before('setup UFragmentsPolicy contract', async function () {
    await setupContracts();
    prevInterval = await uFragmentsPolicy.minRebaseTimeIntervalSec.call();
  });

  it('should setMinRebaseTimeIntervalSec', async function () {
    const interval = prevInterval.plus(1);
    await uFragmentsPolicy.setMinRebaseTimeIntervalSec(interval);
    (await uFragmentsPolicy.minRebaseTimeIntervalSec.call()).should.be.bignumber.eq(interval);
  });
});

contract('UFragments:setMinRebaseTimeIntervalSec:accessControl', function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  it('should be callable by owner', async function () {
    expect(
      await chain.isEthException(uFragmentsPolicy.setMinRebaseTimeIntervalSec(1, { from: deployer }))
    ).to.be.false;
  });

  it('should NOT be callable by non-owner', async function () {
    expect(
      await chain.isEthException(uFragmentsPolicy.setMinRebaseTimeIntervalSec(1, { from: user }))
    ).to.be.true;
  });
});

contract('UFragmentsPolicy:Rebase', async function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  describe('when minRebaseTimeIntervalSec has NOT passed since the previous rebase', function () {
    before(async function () {
      await mockExternalData(1.3e18, 100, 1010);
      await uFragmentsPolicy.rebase();
    });

    it('should fail', async function () {
      expect(
        await chain.isEthException(uFragmentsPolicy.rebase())
      ).to.be.true;
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  describe('when rate is within deviationThreshold', function () {
    before(async function () {
      await mockExternalData(1.0499e18, 100, 1000);
    });

    it('should return 0', async function () {
      r = await uFragmentsPolicy.rebase();
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  describe('when volume is too low', function () {
    before(async function () {
      await mockExternalData(1.06e18, 0, 1000);
    });

    it('should return 0', async function () {
      r = await uFragmentsPolicy.rebase();
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  describe('when rate is more than MAX_RATE', function () {
    before(async function () {
      await uFragmentsPolicy.setMinRebaseTimeIntervalSec(1);
    });

    it('should return same supply delta as delta for MAX_RATE', async function () {
      // Any exchangeRate >= (MAX_RATE=100x) would result in the same supply increase
      await mockExternalData(MAX_RATE, 100, 1000);
      r = await uFragmentsPolicy.rebase();
      const supplyChange = r.logs[0].args.requestedSupplyAdjustment;

      await chain.waitForSomeTime(2); // 2 sec

      await mockExternalData(MAX_RATE.add(1e17), 100, 1000);
      r = await uFragmentsPolicy.rebase();
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(supplyChange);

      await chain.waitForSomeTime(2); // 2 sec

      await mockExternalData(MAX_RATE.mul(2), 100, 1000);
      r = await uFragmentsPolicy.rebase();
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(supplyChange);
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  describe('when uFragments grows beyond MAX_SUPPLY', function () {
    before(async function () {
      await mockExternalData(2e18, 100, MAX_SUPPLY.minus(1));
    });

    it('should apply SupplyAdjustment {MAX_SUPPLY - totalSupply}', async function () {
      // Supply is MAX_SUPPLY-1, exchangeRate is 2x; resulting in a new supply more than MAX_SUPPLY
      // However, supply is ONLY increased by 1 to MAX_SUPPLY
      r = await uFragmentsPolicy.rebase();
      r.logs[0].args.requestedSupplyAdjustment.should.be.bignumber.eq(1);
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  describe('when uFragments supply equals MAX_SUPPLY and rebase attempts to grow', function () {
    before(async function () {
      await mockExternalData(2e18, 100, MAX_SUPPLY);
    });

    it('should fail', async function () {
      expect(
        await chain.isEthException(uFragmentsPolicy.rebase())
      ).to.be.true;
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  describe('positive rate', function () {
    before(async function () {
      await mockExternalData(1.3e18, 100, 1000);
      await uFragmentsPolicy.setMinRebaseTimeIntervalSec(5); // 5 sec
      await uFragmentsPolicy.rebase();
      await chain.waitForSomeTime(6); // 6 sec
      prevEpoch = await uFragmentsPolicy.epoch.call();
      prevTime = await uFragmentsPolicy.lastRebaseTimestampSec.call();
      await mockExternalData(1.6e18, 100, 1010);
      r = await uFragmentsPolicy.rebase();
    });

    it('should increment epoch', async function () {
      const epoch = await uFragmentsPolicy.epoch.call();
      expect(prevEpoch.plus(1).eq(epoch));
    });

    it('should update lastRebaseTimestamp', async function () {
      const time = await uFragmentsPolicy.lastRebaseTimestampSec.call();
      expect(time.minus(prevTime).gte(5)).to.be.true;
    });

    it('should emit Rebase with positive requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      expect(log.args.epoch.eq(prevEpoch.plus(1))).to.be.true;
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(20);
      log.args.volume24hrs.should.be.bignumber.eq(100);
    });

    it('should call getPriceAnd24HourVolume from the market oracle', async function () {
      const fnCalled = mockUFragments.FunctionCalled().formatter(r.receipt.logs[0]);
      expect(fnCalled.args.functionName).to.eq('MarketOracle:getPriceAnd24HourVolume');
      expect(fnCalled.args.caller).to.eq(uFragmentsPolicy.address);
    });

    it('should call uFrag Rebase', async function () {
      prevEpoch = await uFragmentsPolicy.epoch.call();
      const fnCalled = mockUFragments.FunctionCalled().formatter(r.receipt.logs[2]);
      expect(fnCalled.args.functionName).to.eq('UFragments:rebase');
      expect(fnCalled.args.caller).to.eq(uFragmentsPolicy.address);
      const fnArgs = mockUFragments.FunctionArguments().formatter(r.receipt.logs[3]);
      const parsedFnArgs = Object.keys(fnArgs.args).reduce((m, k) => {
        return fnArgs.args[k].map(d => d.toNumber()).concat(m);
      }, [ ]);
      expect(parsedFnArgs).to.include.members([prevEpoch.toNumber(), 20]);
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  describe('negative rate', function () {
    before(async function () {
      await mockExternalData(0.7e18, 100, 1000);
      r = await uFragmentsPolicy.rebase();
    });

    it('should emit Rebase with negative requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(-10);
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function (accounts) {
  before('setup UFragmentsPolicy contract', setupContracts);

  describe('rate=1', function () {
    before(async function () {
      await mockExternalData(1e18, 100, 1000);
      await uFragmentsPolicy.setDeviationThreshold(0);
      r = await uFragmentsPolicy.rebase();
    });

    it('should emit Rebase with 0 requestedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('LogRebase');
      log.args.requestedSupplyAdjustment.should.be.bignumber.eq(0);
    });
  });
});
