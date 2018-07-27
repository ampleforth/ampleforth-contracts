const UFragmentsPolicy = artifacts.require('UFragmentsPolicy.sol');
const MockUFragments = artifacts.require('MockUFragments.sol');
const MockMarketOracle = artifacts.require('MockMarketOracle.sol');

const BigNumber = require('bignumber.js');
const _require = require('app-root-path').require;
const { ContractEventSpy, MockFunctionSpy } = _require('/util/spies');
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

let uFragmentsPolicy, mockUFragments, mockMarketOracle;
let r, _epoch, _time;

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
      r = await uFragmentsPolicy.rebase();
      expect(r.logs[0].args.appliedSupplyAdjustment.toNumber()).to.eq(0);
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', setContractReferences);

  describe('when uFragments grows beyond MAX_SUPPLY', function () {
    before(async function () {
      await mockExternalData(2e18, 100, new BigNumber(2).pow(128).minus(2));
    });

    // Supply is {2^128-2}, exchangeRate is 2x; resulting in a new supply more than MAX_SUPPLY={2^128-1}
    // Supply is increased by 1 to MAX_SUPPLY
    it('should apply SupplyAdjustment {MAX_SUPPLY - totalSupply}', async function () {
      r = await uFragmentsPolicy.rebase();
      expect(r.logs[0].args.appliedSupplyAdjustment.toNumber()).to.eq(1);
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', setContractReferences);

  describe('when uFragments supply equals MAX_SUPPLY', function () {
    before(async function () {
      await mockExternalData(2e18, 100, new BigNumber(2).pow(128).minus(1));
    });

    it('should apply SupplyAdjustment=0', async function () {
      r = await uFragmentsPolicy.rebase();
      expect(r.logs[0].args.appliedSupplyAdjustment.toNumber()).to.eq(0);
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', setContractReferences);

  describe('when minRebaseTimeIntervalSec has passed since the previous rebase', function () {
    describe('positive rate', function () {
      let uFragSpy, oracleSpy;
      before(async function () {
        await mockExternalData(1.3e18, 100, 1000);
        await uFragmentsPolicy.setMinRebaseTimeIntervalSec(5); // 5 sec
        await uFragmentsPolicy.rebase();
        await chain.waitForSomeTime(5); // 10 sec
        _epoch = await uFragmentsPolicy.epoch.call();
        _time = await uFragmentsPolicy.lastRebaseTimestamp.call();
        await mockExternalData(1.6e18, 100, 1010);
        uFragSpy = new ContractEventSpy([mockUFragments.FunctionCalled, mockUFragments.FunctionArguments]);
        uFragSpy.watch();
        oracleSpy = new ContractEventSpy([mockMarketOracle.FunctionCalled, mockMarketOracle.FunctionArguments]);
        oracleSpy.watch();
        r = await uFragmentsPolicy.rebase();
      });
      after(async function () {
        uFragSpy.stopWatching();
        oracleSpy.stopWatching();
      });

      it('should increment epoch', async function () {
        const epoch = await uFragmentsPolicy.epoch.call();
        expect(_epoch.plus(1).eq(epoch));
      });
      it('should update lastRebaseTimestamp', async function () {
        const time = await uFragmentsPolicy.lastRebaseTimestamp.call();
        expect(time.minus(_time).gte(5)).to.be.true;
      });
      it('should emit Rebase with positive appliedSupplyAdjustment', async function () {
        const log = r.logs[0];
        expect(log.event).to.eq('Rebase');
        expect(log.args.epoch.eq(_epoch.plus(1))).to.be.true;
        expect(log.args.appliedSupplyAdjustment.toNumber()).to.eq(20);
        expect(log.args.volume.toNumber()).to.eq(100);
      });
      it('should call getPriceAndVolume from the market oracle', async function () {
        const fnCalls = new MockFunctionSpy(oracleSpy).getCalledFunctions();
        expect(fnCalls[0].fnName).to.eq('MarketOracle:getPriceAndVolume');
        expect(fnCalls[0].calledBy).to.eq(uFragmentsPolicy.address);
        expect(fnCalls[0].arguments).to.be.empty;
      });
      it('should call uFrag Rebase', async function () {
        const fnCalls = new MockFunctionSpy(uFragSpy).getCalledFunctions();
        const epoch = await uFragmentsPolicy.epoch.call();
        expect(fnCalls[0].fnName).to.eq('UFragments:rebase');
        expect(fnCalls[0].calledBy).to.eq(uFragmentsPolicy.address);
        expect(fnCalls[0].arguments).to.include.members([epoch.toNumber(), 20]);
      });
    });
  });
});

contract('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', setContractReferences);

  describe('negative rate', function () {
    let uFragSpy;
    before(async function () {
      uFragSpy = new ContractEventSpy([mockUFragments.FunctionCalled, mockUFragments.FunctionArguments]);
      uFragSpy.watch();
      await mockExternalData(0.7e18, 100, 1000);
      r = await uFragmentsPolicy.rebase();
    });
    after(async function () {
      uFragSpy.stopWatching();
    });

    it('should emit Rebase with negative appliedSupplyAdjustment', async function () {
      const log = r.logs[0];
      expect(log.event).to.eq('Rebase');
      expect(log.args.appliedSupplyAdjustment.toNumber()).to.eq(-10);
    });
  });
});
