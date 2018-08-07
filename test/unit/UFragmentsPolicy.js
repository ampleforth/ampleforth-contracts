const UFragmentsPolicy = artifacts.require('UFragmentsPolicy.sol');
const MockUFragments = artifacts.require('MockUFragments.sol');
const MockMarketOracle = artifacts.require('MockMarketOracle.sol');

const _ = require('lodash');
const BigNumber = web3.BigNumber;
const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

let uFragmentsPolicy, mockUFragments, mockMarketOracle;
let r, _epoch, _time;
const MAX_SUPPLY = new BigNumber('578960446186580977117854925043439539266349923328202820197');

async function mockExternalData (exchangeRate, volume, uFragSupply) {
  await mockMarketOracle.storeRate(exchangeRate);
  await mockMarketOracle.storeVolume(volume);
  await mockUFragments.storeSupply(uFragSupply);
}

async function setContractReferences () {
  mockUFragments = await MockUFragments.deployed();
  mockMarketOracle = await MockMarketOracle.deployed();
  uFragmentsPolicy = await UFragmentsPolicy.new(MockUFragments.address, MockMarketOracle.address);
}

contract('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', setContractReferences);

  describe('when minRebaseTimeIntervalSec has NOT passed since the previous rebase', function () {
    before(async function () {
      await mockExternalData(1.3e18, 100, 1010);
      await uFragmentsPolicy.rebase();
    });

    it('should fail', async function () {
      await chain.expectEthException(uFragmentsPolicy.rebase());
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', setContractReferences);

  describe('when rate is withinDeviationThreshold', function () {
    before(async function () {
      await mockExternalData(1.0499e18, 100, 1000);
    });

    it('should return 0', async function () {
      const r = await uFragmentsPolicy.rebase();
      r.logs[0].args.appliedSupplyAdjustment.should.be.bignumber.eq(0);
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', setContractReferences);

  describe('when uFragments grows beyond MAX_SUPPLY', function () {
    before(async function () {
      await mockExternalData(200e18, 100, MAX_SUPPLY.minus(1));
    });

    // Supply is MAX_SUPPLY-1, exchangeRate is 200x; resulting in a new supply more than MAX_SUPPLY
    // Supply is increased by 1 to MAX_SUPPLY
    it('should apply SupplyAdjustment {MAX_SUPPLY - totalSupply}', async function () {
      r = await uFragmentsPolicy.rebase();
      r.logs[0].args.appliedSupplyAdjustment.should.be.bignumber.eq(1);
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', setContractReferences);

  describe('when uFragments supply equals MAX_SUPPLY', function () {
    before(async function () {
      await mockExternalData(2e18, 100, MAX_SUPPLY);
    });

    it('should apply SupplyAdjustment=0', async function () {
      r = await uFragmentsPolicy.rebase();
      r.logs[0].args.appliedSupplyAdjustment.should.be.bignumber.eq(0);
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', setContractReferences);

  describe('when minRebaseTimeIntervalSec has passed since the previous rebase', function () {
    describe('positive rate', function () {
      before(async function () {
        await mockExternalData(1.3e18, 100, 1000);
        await uFragmentsPolicy.setMinRebaseTimeIntervalSec(5); // 5 sec
        await uFragmentsPolicy.rebase();
        await chain.waitForSomeTime(5); // 10 sec
        _epoch = await uFragmentsPolicy.epoch.call();
        _time = await uFragmentsPolicy.lastRebaseTimestamp.call();
        await mockExternalData(1.6e18, 100, 1010);
        r = await uFragmentsPolicy.rebase();
      });

      it('should increment epoch', async function () {
        const epoch = await uFragmentsPolicy.epoch.call();
        _epoch.plus(1).should.be.bignumber.eq(epoch);
      });
      it('should update lastRebaseTimestamp', async function () {
        const time = await uFragmentsPolicy.lastRebaseTimestamp.call();
        time.minus(_time).should.be.bignumber.gte(5);
      });
      it('should emit Rebase with positive appliedSupplyAdjustment', async function () {
        const log = r.logs[0];
        log.event.should.eq('Rebase');
        log.args.epoch.should.bignumber.eq(_epoch.plus(1));
        log.args.appliedSupplyAdjustment.should.bignumber.eq(20);
        log.args.volume24hrs.should.bignumber.eq(100);
      });
      it('should call getPriceAndVolume from the market oracle', async function () {
        const fnCalled = mockUFragments.FunctionCalled().formatter(r.receipt.logs[0]);
        fnCalled.args.functionName.should.eq('MarketOracle:getPriceAndVolume');
        fnCalled.args.caller.should.eq(uFragmentsPolicy.address);
      });
      it('should call uFrag Rebase', async function () {
        _epoch = await uFragmentsPolicy.epoch.call();
        const fnCalled = mockUFragments.FunctionCalled().formatter(r.receipt.logs[2]);
        fnCalled.args.functionName.should.be.eq('UFragments:rebase');
        fnCalled.args.caller.should.be.bignumber.eq(uFragmentsPolicy.address);
        const fnArgs = mockUFragments.FunctionArguments().formatter(r.receipt.logs[3]);
        const parsedFnArgs = _.reduce(fnArgs.args, function (m, v, k) {
          return _.map(v, d => d.toNumber()).concat(m);
        }, [ ]);
        parsedFnArgs.should.include.members([_epoch.toNumber(), 20]);
      });
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', setContractReferences);

  describe('negative rate', function () {
    before(async function () {
      await mockExternalData(0.7e18, 100, 1000);
      r = await uFragmentsPolicy.rebase();
    });

    it('should emit Rebase with negative appliedSupplyAdjustment', async function () {
      const log = r.logs[0];
      log.event.should.eq('Rebase');
      log.args.appliedSupplyAdjustment.should.be.bignumber.eq(-10);
    });
  });
});
