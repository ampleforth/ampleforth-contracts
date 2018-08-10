/*
  In this test, we generate random cycles of fragments growth and contraction and test the precision of fragments transactions

  During every iteration; percentageGrowth is sampled from a unifrom distribution between [-50%,250%]
  and the fragments total supply grows/contracts.

  In each cycle we test the following guarantees:
  - If address 'A' transfers x fragments to address 'B'. A's resulting external balance will
  be decreased by precisely x fragments, and B's external balance will be precisely
  increased by x fragments.
*/

const UFragments = artifacts.require('UFragments.sol');
const Stochasm = require('stochasm');
const encodeCall = require('zos-lib/lib/helpers/encodeCall').default;

contract('UFragments', async function (accounts) {
  let uFragments, rebaseAmt, inflation;
  const deployer = accounts[0];
  const A = accounts[1];
  const B = accounts[2];
  const C = accounts[3];
  const D = accounts[4];
  const uFragmentsGrowth = new Stochasm({ min: -0.5, max: 2.5, seed: 'fragments.org' });

  before(async function () {
    uFragments = await UFragments.new();
    await uFragments.sendTransaction({
      data: encodeCall('initialize', ['address'], [deployer]),
      from: deployer
    });
    await uFragments.setMonetaryPolicy(deployer, {from: deployer});
    await uFragments.transfer(A, 3, {from: deployer});
    await uFragments.transfer(B, 4, {from: deployer});
    await uFragments.transfer(C, 5, {from: deployer});
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
        _bals.push(await uFragments.balanceOf.call(users[u]));
      }
    }
    const _supply = (await uFragments.totalSupply.call());
    await op();
    const supply = (await uFragments.totalSupply.call());
    for (u in users) {
      if (Object.prototype.hasOwnProperty.call(users, u)) {
        bals.push(await uFragments.balanceOf.call(users[u]));
      }
    }
    chk(_bals, bals, [_supply, supply]);
  }

  async function checkBalancesAfterTransfer (users, tAmt) {
    await checkBalancesAfterOperation(users, async () => {
      await uFragments.transfer(users[1], tAmt, { from: users[0] });
    }, ([_u0Bal, _u1Bal], [u0Bal, u1Bal]) => {
      const _sum = _u0Bal.plus(_u1Bal);
      const sum = u0Bal.plus(u1Bal);
      expect(_sum.eq(sum)).to.be.true;
      expect(_u0Bal.minus(tAmt).eq(u0Bal)).to.be.true;
      expect(_u1Bal.plus(tAmt).eq(u1Bal)).to.be.true;
    });
  }

  for (let i = 0; i < 50; i++) {
    describe('Rebase iteration (' + (parseInt(i) + 1) + ')', () => {
      before(async () => {
        let supply = await uFragments.totalSupply.call();
        inflation = uFragmentsGrowth.next().toFixed(5);
        rebaseAmt = supply.mul(inflation).dividedToIntegerBy(1);
        printRebaseAmt(rebaseAmt);
        await uFragments.rebase(i + 1, rebaseAmt, {from: deployer});
        supply = await uFragments.totalSupply.call();
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
            const tAmt = (await uFragments.balanceOf.call(deployer)).minus(1);
            await checkBalancesAfterTransfer([deployer, D], tAmt);
            await checkBalancesAfterTransfer([D, deployer], tAmt);
          });
        });
      });
    });
  }
});
