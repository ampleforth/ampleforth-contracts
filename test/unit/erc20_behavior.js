const UFragments = artifacts.require('UFragments.sol');

const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);
const encodeCall = require('zos-lib/lib/helpers/encodeCall').default;

const transferAmount = 10;
const erroneousAmount = 1001;

contract('UFragments:ERC20', function (accounts) {
  let token;
  const deployer = accounts[0];
  before('setup UFragments contract', async function () {
    token = await UFragments.new();
    await token.sendTransaction({
      data: encodeCall('initialize', ['address'], [deployer]),
      from: deployer
    });
  });

  const initialTotalSupply = 1000;
  const owner = accounts[0];
  const anotherAccount = accounts[8];
  const recipient = accounts[9];

  describe('totalSupply', function () {
    it('returns the total amount of tokens', async function () {
      const totalSupply = await token.totalSupply.call();
      assert.equal(totalSupply.toNumber(), initialTotalSupply);
    });
  });

  describe('balanceOf', function () {
    describe('when the requested account has no tokens', function () {
      it('returns zero', async function () {
        const balance = await token.balanceOf.call(anotherAccount);
        assert.equal(balance.toNumber(), 0);
      });
    });
    describe('when the requested account has some tokens', function () {
      it('returns the total amount of tokens', async function () {
        const balance = await token.balanceOf.call(owner);
        assert.equal(balance.toNumber(), initialTotalSupply);
      });
    });
  });

  describe('transfer', function () {
    describe('when the recipient is not the zero address', function () {
      const to = recipient;

      describe('when the sender does not have enough balance', function () {
        const amount = erroneousAmount;

        it('reverts', async function () {
          await chain.expectEthException(token.transfer(to, amount, { from: owner }));
        }).timeout();
      });

      describe('when the sender has enough balance', function () {
        const amount = transferAmount;

        afterEach(async () => {
          // Ensuring state is consistent after the testing the specification
          await token.transfer(owner, amount, { from: to });
        });

        it('transfers the requested amount & emits a transfer event', async function () {
          const { logs } = await token.transfer(to, amount, { from: owner });

          const senderBalance = await token.balanceOf.call(owner);
          const supply = await token.totalSupply.call();
          assert(supply.minus(amount).eq(senderBalance));

          const recipientBalance = await token.balanceOf.call(to);
          assert.equal(recipientBalance.toNumber(), amount);

          assert.equal(logs.length, 1);
          assert.equal(logs[0].event, 'Transfer');
          assert.equal(logs[0].args.from, owner);
          assert.equal(logs[0].args.to, to);
          assert(logs[0].args.value.eq(amount));
        });
      });
    });
  });

  describe('transfer from', function () {
    const spender = recipient;

    describe('when the recipient is not the zero address', function () {
      const to = anotherAccount;

      describe('when the spender has enough approved balance', function () {
        beforeEach(async function () {
          await token.approve(spender, 10, { from: owner });
        });

        describe('when the owner has enough balance', function () {
          const amount = transferAmount;

          afterEach(async () => {
            // Ensuring state is consistent after the testing the specification
            await token.transfer(owner, amount, { from: to });
          });

          it('transfers the requested amount, decreases the spender allowance, emits a transfer event', async function () {
            const _senderBalance = await token.balanceOf.call(owner);
            const { logs } = await token.transferFrom(owner, to, amount, { from: spender });
            const senderBalance = await token.balanceOf.call(owner);
            assert(_senderBalance.minus(amount).eq(senderBalance));
            const recipientBalance = await token.balanceOf.call(to);
            assert.equal(recipientBalance.toNumber(), amount);
            const allowance = await token.allowance(owner, spender);
            assert(allowance.eq(0));
            assert.equal(logs.length, 1);
            assert.equal(logs[0].event, 'Transfer');
            assert.equal(logs[0].args.from, owner);
            assert.equal(logs[0].args.to, to);
            assert(logs[0].args.value.eq(amount));
          });
        });

        describe('when the owner does not have enough balance', function () {
          const amount = erroneousAmount;

          it('should fail', async function () {
            await chain.expectEthException(token.transferFrom(owner, to, amount, { from: spender }));
          });
        });
      });
    });
  });
});
