const UFragmentsPolicy = artifacts.require('UFragmentsPolicy.sol');
const ProxyContract = artifacts.require('ProxyContract.sol');

const BigNumber = require('bignumber.js');
const _require = require('app-root-path').require;
const { ContractEventSpy, ProxyContractFunctionSpy } = _require('/util/spies');
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

contract('uFragmentsPolicy', async accounts => {
  let uFragmentsPolicy, proxy, snapshot;

  before(async function () {
    uFragmentsPolicy = await UFragmentsPolicy.deployed();
    proxy = await ProxyContract.deployed();
  });

  async function mockExternalData (exchangeRate, volume, uFragSupply) {
    await proxy.storeRate(exchangeRate);
    await proxy.storeVolume(volume);
    await proxy.storeSupply(uFragSupply);
  }

  describe('Rebase', () => {
    let r, _epoch, _time;

    describe('when minRebaseTimeIntervalSec has NOT passed since the previous rebase', () => {
      before(async () => {
        snapshot = await chain.snapshotChain();
        await mockExternalData(1.3e18, 100, 1010);
        await uFragmentsPolicy.rebase();
      });
      after(async () => {
        await chain.revertToSnapshot(snapshot);
      });

      it('should fail', async () => {
        await chain.expectEthException(uFragmentsPolicy.rebase());
      });
    });

    describe('when rate is withinDeviationThreshold', () => {
      before(async () => {
        snapshot = await chain.snapshotChain();
        await mockExternalData(1.0499e18, 100, 1000);
      });
      after(async () => {
        await chain.revertToSnapshot(snapshot);
      });

      it('should return 0', async () => {
        r = await uFragmentsPolicy.rebase();
        expect(r.logs[0].args.appliedSupplyAdjustment.toNumber()).to.eq(0);
      });
    });

    describe('when uFragments grows beyond MAX_SUPPLY', () => {
      before(async () => {
        snapshot = await chain.snapshotChain();
        await mockExternalData(2e18, 100, new BigNumber(2).pow(128).minus(2));
      });
      after(async () => {
        await chain.revertToSnapshot(snapshot);
      });

      // Supply is {2^128-2}, exchangeRate is 2x; resulting in a new supply more than MAX_SUPPLY={2^128-1}
      // Supply is increased by 1 to MAX_SUPPLY
      it('should apply SupplyAdjustment {MAX_SUPPLY - totalSupply}', async () => {
        r = await uFragmentsPolicy.rebase();
        expect(r.logs[0].args.appliedSupplyAdjustment.toNumber()).to.eq(1);
      });
    });

    describe('when uFragments supply equals MAX_SUPPLY', () => {
      before(async () => {
        snapshot = await chain.snapshotChain();
        await mockExternalData(2e18, 100, new BigNumber(2).pow(128).minus(1));
      });
      after(async () => {
        await chain.revertToSnapshot(snapshot);
      });

      it('should apply SupplyAdjustment=0', async () => {
        r = await uFragmentsPolicy.rebase();
        expect(r.logs[0].args.appliedSupplyAdjustment.toNumber()).to.eq(0);
      });
    });

    describe('when minRebaseTimeIntervalSec has passed since the previous rebase', () => {
      describe('positive rate', () => {
        let uFragSpy;
        before(async () => {
          snapshot = await chain.snapshotChain();
          await mockExternalData(1.3e18, 100, 1000);
          await uFragmentsPolicy.rebase();
          await chain.waitForSomeTime(3600 * 24);
          _epoch = await uFragmentsPolicy.epoch.call();
          _time = await uFragmentsPolicy.lastRebaseTimestamp.call();
          await mockExternalData(1.6e18, 100, 1010);
          uFragSpy = new ContractEventSpy([proxy.FunctionCalled, proxy.FunctionArguments]);
          uFragSpy.watch();
          r = await uFragmentsPolicy.rebase();
        });
        after(async () => {
          uFragSpy.stopWatching();
          await chain.revertToSnapshot(snapshot);
        });

        it('should increment epoch', async () => {
          const epoch = await uFragmentsPolicy.epoch.call();
          expect(_epoch.plus(1).eq(epoch));
        });
        it('should update lastRebaseTimestamp', async () => {
          const time = await uFragmentsPolicy.lastRebaseTimestamp.call();
          expect(time.minus(_time).gte(3600 * 24)).to.be.true;
        });
        it('should emit Rebase with positive appliedSupplyAdjustment', async () => {
          const log = r.logs[0];
          expect(log.event).to.eq('Rebase');
          expect(log.args.epoch.eq(_epoch.plus(1))).to.be.true;
          expect(log.args.appliedSupplyAdjustment.toNumber()).to.eq(20);
          expect(log.args.volume.toNumber()).to.eq(100);
        });
        it('should call aggregate from the exchange rate aggregator', async () => {
          const fnCalls = new ProxyContractFunctionSpy(uFragSpy).getCalledFunctions();
          expect(fnCalls[0].fnName).to.eq('ExchangeRateAggregator:aggregate');
          expect(fnCalls[0].calledBy).to.eq(uFragmentsPolicy.address);
          expect(fnCalls[0].arguments).to.be.empty;
        });
        it('should call uFrag Rebase', async () => {
          const fnCalls = new ProxyContractFunctionSpy(uFragSpy).getCalledFunctions();
          const epoch = await uFragmentsPolicy.epoch.call();
          expect(fnCalls[1].fnName).to.eq('UFragments:rebase');
          expect(fnCalls[1].calledBy).to.eq(uFragmentsPolicy.address);
          expect(fnCalls[1].arguments).to.include.members([epoch.toNumber(), 20]);
        });
      });

      describe('negative rate', () => {
        let uFragSpy;
        before(async () => {
          snapshot = await chain.snapshotChain();
          uFragSpy = new ContractEventSpy([proxy.FunctionCalled, proxy.FunctionArguments]);
          uFragSpy.watch();
          await mockExternalData(0.7e18, 100, 1000);
          r = await uFragmentsPolicy.rebase();
        });
        after(async () => {
          uFragSpy.stopWatching();
          await chain.revertToSnapshot(snapshot);
        });

        it('should emit Rebase with negative appliedSupplyAdjustment', async () => {
          const log = r.logs[0];
          expect(log.event).to.eq('Rebase');
          expect(log.args.appliedSupplyAdjustment.toNumber()).to.eq(-10);
        });
      });
    });
  });
});
