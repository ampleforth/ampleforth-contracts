/*
  In this test, we generate random cycles of fragments growth and contraction and test the precision of fragments transactions

  During every iteration; percentageGrowth is sampled from a unifrom distribution between [-50%,250%]
  and the fragments total supply grows/contracts.

  In each cycle we test the following guarantees:
  - If address 'A' transfers x fragments to address 'B'. A's resulting external balance will
  be decreased by precisely x fragments, and B's external balance will be precisely
  increased by x fragments.
*/

const uFragments = artifacts.require('UFragments.sol');

const Stochasm = require('stochasm');

const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

contract('uFragments', async accounts => {
  let fragments, snapshot, rebaseAmt, inflation;
  const deployer = accounts[0];
  const A = accounts[1];
  const B = accounts[2];
  const C = accounts[3];
  const D = accounts[4];
  const fragmentsGrowth = new Stochasm({ min: -0.5, max: 2.5, seed: 'fragments.org' });

  before(async function () {
    fragments = await uFragments.deployed();
    snapshot = await chain.snapshotChain();

    await fragments.transfer(A, 3);
    await fragments.transfer(B, 4);
    await fragments.transfer(C, 5);
  });
  after(async () => {
    await chain.revertToSnapshot(snapshot);
  });

  function printSupply (supply) {
    console.log('Total supply is now', supply.toString(), 'UFRG');
  }

  function printRebaseAmt (rebaseAmt) {
    console.log('Rebased by', (rebaseAmt.toString()), 'UFRG');
  }

  async function checkBalancesAfterOperation (users, op, chk) {
    const _bals = [ ];
    const bals = [ ];
    let u;
    for (u in users) {
      if (Object.prototype.hasOwnProperty.call(users, u)) {
        _bals.push(await fragments.balanceOf.call(users[u]));
      }
    }
    const _supply = (await fragments.totalSupply.call());
    await op();
    const supply = (await fragments.totalSupply.call());
    for (u in users) {
      if (Object.prototype.hasOwnProperty.call(users, u)) {
        bals.push(await fragments.balanceOf.call(users[u]));
      }
    }
    chk(_bals, bals, [_supply, supply]);
  }

  async function checkBalancesAfterTransfer (users, tAmt) {
    await checkBalancesAfterOperation(users, async () => {
      await fragments.transfer(users[1], tAmt, { from: users[0] });
    }, ([_u0Bal, _u1Bal], [u0Bal, u1Bal]) => {
      const _sum = _u0Bal.plus(_u1Bal);
      const sum = u0Bal.plus(u1Bal);
      expect(_sum.eq(sum)).to.be.true;
      expect(_u0Bal.minus(tAmt).eq(u0Bal)).to.be.true;
      expect(_u1Bal.plus(tAmt).eq(u1Bal)).to.be.true;
    });
  }

  for (let i = 0; i < 10; i++) {
    describe('Rebase iteration (' + (parseInt(i) + 1) + ')', () => {
      before(async () => {
        let supply = await fragments.totalSupply.call();
        inflation = fragmentsGrowth.next().toFixed(5);
        rebaseAmt = supply.mul(inflation).dividedToIntegerBy(1);
        printRebaseAmt(rebaseAmt);
        await fragments.rebase(rebaseAmt, {from: deployer});
        supply = await fragments.totalSupply.call();
        printSupply(supply);
      });

      describe('transfer precision', () => {
        describe('0.01 UFRG transaction', () => {
          it('should be precise', async () => {
            await checkBalancesAfterTransfer([deployer, D], 1);
            await checkBalancesAfterTransfer([D, deployer], 1);
          });
        });

        describe('near max denomination UFRG transaction', () => {
          it('should be precise', async () => {
            const tAmt = (await fragments.balanceOf.call(deployer)).minus(1);
            await checkBalancesAfterTransfer([deployer, D], tAmt);
            await checkBalancesAfterTransfer([D, deployer], tAmt);
          });
        });
      });
    });
  }
});
