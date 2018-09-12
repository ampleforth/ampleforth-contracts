const UFragments = artifacts.require('UFragments.sol');

const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);
const encodeCall = require('zos-lib/lib/helpers/encodeCall').default;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const transferAmount = 10;
const erroneousAmount = 50000001;

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

  const initialTotalSupply = 50000000;
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
          expect(
            await chain.isEthException(token.transfer(to, amount, { from: owner }))
          ).to.be.true;
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
            expect(
              await chain.isEthException(token.transferFrom(owner, to, amount, { from: spender }))
            ).to.be.true;
          });
        });
      });

      describe('when the spender does not have enough approved balance', function () {
        beforeEach(async function () {
          await token.approve(spender, 9, { from: owner });
        });

        describe('when the owner has enough balance', function () {
          const amount = transferAmount;

          it('reverts', async function () {
            expect(
              await chain.isEthException(token.transferFrom(owner, to, amount, { from: spender }))
            ).to.be.true;
          });
        });

        describe('when the owner does not have enough balance', function () {
          const amount = erroneousAmount;

          it('reverts', async function () {
            expect(
              await chain.isEthException(token.transferFrom(owner, to, amount, { from: spender }))
            ).to.be.true;
          });
        });
      });
    });
  });

  describe('approve', function () {
    describe('when the spender is not the zero address', function () {
      const spender = recipient;

      describe('when the sender has enough balance', function () {
        const amount = transferAmount;

        it('emits an approval event', async function () {
          const { logs } = await token.approve(spender, amount, { from: owner });

          assert.equal(logs.length, 1);
          assert.equal(logs[0].event, 'Approval');
          assert.equal(logs[0].args.owner, owner);
          assert.equal(logs[0].args.spender, spender);
          assert(logs[0].args.value.eq(amount));
        });

        describe('when there was no approved amount before', function () {
          it('approves the requested amount', async function () {
            await token.approve(spender, amount, { from: owner });

            const allowance = await token.allowance(owner, spender);
            assert.equal(allowance, amount);
          });
        });

        describe('when the spender had an approved amount', function () {
          beforeEach(async function () {
            await token.approve(spender, 1, { from: owner });
          });

          it('approves the requested amount and replaces the previous one', async function () {
            await token.approve(spender, amount, { from: owner });

            const allowance = await token.allowance(owner, spender);
            assert.equal(allowance, amount);
          });
        });
      });

      describe('when the sender does not have enough balance', function () {
        const amount = erroneousAmount;

        it('emits an approval event', async function () {
          const { logs } = await token.approve(spender, amount, { from: owner });

          assert.equal(logs.length, 1);
          assert.equal(logs[0].event, 'Approval');
          assert.equal(logs[0].args.owner, owner);
          assert.equal(logs[0].args.spender, spender);
          assert(logs[0].args.value.eq(amount));
        });

        describe('when there was no approved amount before', function () {
          it('approves the requested amount', async function () {
            await token.approve(spender, amount, { from: owner });

            const allowance = await token.allowance(owner, spender);
            assert.equal(allowance, amount);
          });
        });

        describe('when the spender had an approved amount', function () {
          beforeEach(async function () {
            await token.approve(spender, 1, { from: owner });
          });

          it('approves the requested amount and replaces the previous one', async function () {
            await token.approve(spender, amount, { from: owner });

            const allowance = await token.allowance(owner, spender);
            assert.equal(allowance, amount);
          });
        });
      });
    });

    describe('when the spender is the zero address', function () {
      it('should fail', async function () {
        expect(
          await chain.isEthException(token.approve(ZERO_ADDRESS, transferAmount, { from: owner }))
        ).to.be.true;
      });
    });
  });

  describe('decrease approval', function () {
    describe('when the spender is not the zero address', function () {
      const spender = recipient;

      beforeEach(async () => {
        await token.approve(spender, 0, { from: owner });
      });

      describe('when the sender has enough balance', function () {
        const amount = transferAmount;

        it('emits an approval event', async function () {
          const { logs } = await token.decreaseAllowance(spender, amount, { from: owner });

          assert.equal(logs.length, 1);
          assert.equal(logs[0].event, 'Approval');
          assert.equal(logs[0].args.owner, owner);
          assert.equal(logs[0].args.spender, spender);
          assert(logs[0].args.value.eq(0));
        });

        describe('when there was no approved amount before', function () {
          it('keeps the allowance to zero', async function () {
            await token.decreaseAllowance(spender, amount, { from: owner });

            const allowance = await token.allowance(owner, spender);
            assert.equal(allowance, 0);
          });
        });

        describe('when the spender had an approved amount', function () {
          beforeEach(async function () {
            await token.approve(spender, amount + 1, { from: owner });
          });

          it('decreases the spender allowance subtracting the requested amount', async function () {
            await token.decreaseAllowance(spender, amount, { from: owner });

            const allowance = await token.allowance(owner, spender);
            assert.equal(allowance, 1);
          });
        });
      });

      describe('when the sender does not have enough balance', function () {
        const amount = erroneousAmount;

        it('emits an approval event', async function () {
          const { logs } = await token.decreaseAllowance(spender, amount, { from: owner });

          assert.equal(logs.length, 1);
          assert.equal(logs[0].event, 'Approval');
          assert.equal(logs[0].args.owner, owner);
          assert.equal(logs[0].args.spender, spender);
          assert(logs[0].args.value.eq(0));
        });

        describe('when there was no approved amount before', function () {
          it('keeps the allowance to zero', async function () {
            await token.decreaseAllowance(spender, amount, { from: owner });

            const allowance = await token.allowance(owner, spender);
            assert.equal(allowance, 0);
          });
        });

        describe('when the spender had an approved amount', function () {
          beforeEach(async function () {
            await token.approve(spender, amount + 1, { from: owner });
          });

          it('decreases the spender allowance subtracting the requested amount', async function () {
            await token.decreaseAllowance(spender, amount, { from: owner });

            const allowance = await token.allowance(owner, spender);
            assert.equal(allowance, 1);
          });
        });
      });
    });

    describe('when the spender is the zero address', function () {
      it('should fail', async function () {
        expect(
          await chain.isEthException(token.decreaseAllowance(ZERO_ADDRESS, transferAmount, { from: owner }))
        ).to.be.true;
      });
    });
  });

  describe('increase approval', function () {
    const amount = transferAmount;

    describe('when the spender is not the zero address', function () {
      const spender = recipient;

      beforeEach(async () => {
        await token.approve(spender, 0, { from: owner });
      });

      describe('when the sender has enough balance', function () {
        it('emits an approval event', async function () {
          const { logs } = await token.increaseAllowance(spender, amount, { from: owner });

          assert.equal(logs.length, 1);
          assert.equal(logs[0].event, 'Approval');
          assert.equal(logs[0].args.owner, owner);
          assert.equal(logs[0].args.spender, spender);
          assert(logs[0].args.value.eq(amount));
        });

        describe('when there was no approved amount before', function () {
          it('approves the requested amount', async function () {
            await token.increaseAllowance(spender, amount, { from: owner });
            const allowance = await token.allowance(owner, spender);
            assert.equal(allowance.toNumber(), amount);
          });
        });

        describe('when the spender had an approved amount', function () {
          beforeEach(async function () {
            await token.approve(spender, 1, { from: owner });
          });

          it('increases the spender allowance adding the requested amount', async function () {
            await token.increaseAllowance(spender, amount, { from: owner });

            const allowance = await token.allowance(owner, spender);
            assert.equal(allowance, amount + 1);
          });
        });
      });

      describe('when the sender does not have enough balance', function () {
        const amount = erroneousAmount;

        it('emits an approval event', async function () {
          const { logs } = await token.increaseAllowance(spender, amount, { from: owner });

          assert.equal(logs.length, 1);
          assert.equal(logs[0].event, 'Approval');
          assert.equal(logs[0].args.owner, owner);
          assert.equal(logs[0].args.spender, spender);
          assert(logs[0].args.value.eq(amount));
        });

        describe('when there was no approved amount before', function () {
          it('approves the requested amount', async function () {
            await token.increaseAllowance(spender, amount, { from: owner });

            const allowance = await token.allowance(owner, spender);
            assert.equal(allowance.toNumber(), amount);
          });
        });

        describe('when the spender had an approved amount', function () {
          beforeEach(async function () {
            await token.approve(spender, 1, { from: owner });
          });

          it('increases the spender allowance adding the requested amount', async function () {
            await token.increaseAllowance(spender, amount, { from: owner });

            const allowance = await token.allowance(owner, spender);
            assert.equal(allowance, amount + 1);
          });
        });
      });
    });

    describe('when the spender is the zero address', function () {
      it('should fail', async function () {
        expect(
          await chain.isEthException(token.increaseAllowance(ZERO_ADDRESS, amount, { from: owner }))
        ).to.be.true;
      });
    });
  });
});
