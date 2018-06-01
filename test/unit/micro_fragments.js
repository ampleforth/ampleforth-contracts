const MicroFragments = artifacts.require('MicroFragments.sol');

const _require = require('app-root-path').require;
const { ContractEventSpy } = _require('/util/spies');
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

contract('MicroFragments', async accounts => {
  let mFragments, snapshot, b;
  const deployer = accounts[0];
  const A = accounts[1];
  const B = accounts[2];
  const C = accounts[3];

  before(async function () {
    mFragments = await MicroFragments.deployed();
  });

  describe('on initialization', () => {
    it('should add +1000 mFragments to the deployer', async () => {
      b = await mFragments.balanceOf.call(deployer);
      expect(b.toNumber()).to.eq(1000);
    });
    it('should set the totalSupply to 1000', async () => {
      b = await mFragments.totalSupply.call();
      expect(b.toNumber()).to.eq(1000);
    });
    it('should set epoch to 0', async () => {
      b = await mFragments.epoch();
      expect(b.toNumber()).to.eq(0);
    });
  });

  describe('Transfer', () => {
    before(async () => {
      snapshot = await chain.snapshotChain();
    });
    after(async () => {
      await chain.revertToSnapshot(snapshot);
    });

    describe('deployer transfers 12 to A', () => {
      it('should have balances [988,12]', async () => {
        await mFragments.transfer(A, 12, { from: deployer });
        b = await mFragments.balanceOf.call(deployer);
        expect(b.toNumber()).to.eq(988);
        b = await mFragments.balanceOf.call(A);
        expect(b.toNumber()).to.eq(12);
      });
    });

    describe('deployer transfers 15 to B', async () => {
      it('should have balances [973,15]', async () => {
        await mFragments.transfer(B, 15, { from: deployer });
        b = await mFragments.balanceOf.call(deployer);
        expect(b.toNumber()).to.eq(973);
        b = await mFragments.balanceOf.call(B);
        expect(b.toNumber()).to.eq(15);
      });
    });

    describe('deployer transfers the rest to C', async () => {
      //      it('should have balances [0, 973]');
      it('should have balances [0,973]', async () => {
        await mFragments.transfer(C, 973, { from: deployer });
        b = await mFragments.balanceOf.call(deployer);
        expect(b.toNumber()).to.eq(0);
        b = await mFragments.balanceOf.call(C);
        expect(b.toNumber()).to.eq(973);
      });
    });
  });

  describe('Rebase', function () {
    let rebaseSpy;
    // Rebase +500 (50%), with starting balances deployer:750 and A:250.
    before(async () => {
      snapshot = await chain.snapshotChain();
      await mFragments.transfer(A, 250, { from: deployer });
      rebaseSpy = new ContractEventSpy([mFragments.Rebase]);
      rebaseSpy.watch();
      await mFragments.rebase(500, {from: deployer});
    });
    after(async () => {
      rebaseSpy.stopWatching();
      await chain.revertToSnapshot(snapshot);
    });

    it('should increase the totalSupply', async () => {
      b = await mFragments.totalSupply.call();
      expect(b.toNumber()).to.eq(1500);
    });
    it('should increase individual balances', async () => {
      b = await mFragments.balanceOf.call(deployer);
      expect(b.toNumber()).to.be.above(750).and.at.most(1125);

      b = await mFragments.balanceOf.call(A);
      expect(b.toNumber()).to.be.above(250).and.at.most(375);
    });
    it('should emit Rebase', async () => {
      const rebaseEvent = rebaseSpy.getEventByName('Rebase');
      expect(rebaseEvent).to.exist;
      expect(rebaseEvent.args.epoch.toNumber()).to.eq(1);
      expect(rebaseEvent.args.supplyDelta.toNumber()).to.eq(500);
    });
  });
});
