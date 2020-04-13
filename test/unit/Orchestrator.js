const MockDownstream = artifacts.require('MockDownstream.sol');
const MockUFragmentsPolicy = artifacts.require('MockUFragmentsPolicy.sol');
const Orchestrator = artifacts.require('Orchestrator.sol');

const BigNumber = web3.BigNumber;
const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

let orchestrator, mockPolicy, mockDownstream;
let r;
let deployer, user;

async function setupContracts () {
  await chain.waitForSomeTime(86400);
  const accounts = await chain.getUserAccounts();
  deployer = accounts[0];
  user = accounts[1];
  mockPolicy = await MockUFragmentsPolicy.new();
  orchestrator = await Orchestrator.new(mockPolicy.address);
  mockDownstream = await MockDownstream.new();
}

contract('Orchestrator', function (accounts) {
  before('setup Orchestrator contract', setupContracts);

  describe('when sent ether', async function () {
    it('should reject', async function () {
      expect(
        await chain.isEthException(orchestrator.sendTransaction({ from: user, value: 1 }))
      ).to.be.true;
    });
  });

  describe('when transaction list is empty', async function () {
    before('calling rebase', async function () {
      r = await orchestrator.rebase();
    });

    it('should have no transactions', async function () {
      (await orchestrator.transactionsLength.call()).should.be.bignumber.eq(0);
    });

    it('should call rebase on policy', async function () {
      const fnCalled = mockPolicy.FunctionCalled().formatter(r.receipt.logs[0]);
      expect(fnCalled.args.instanceName).to.eq('UFragmentsPolicy');
      expect(fnCalled.args.functionName).to.eq('rebase');
      expect(fnCalled.args.caller).to.eq(orchestrator.address);
    });
  });

  describe('when there is a single transaction', async function () {
    before('adding a transaction', async function () {
      const updateOneArgEncoded = mockDownstream.contract.updateOneArg.getData(12345);
      orchestrator.addTransaction(mockDownstream.address, 0, updateOneArgEncoded, {from: deployer});
      r = await orchestrator.rebase();
    });

    it('should have 1 transaction', async function () {
      (await orchestrator.transactionsLength.call()).should.be.bignumber.eq(1);
    });

    it('should call rebase on policy', async function () {
      const fnCalled = mockPolicy.FunctionCalled().formatter(r.receipt.logs[0]);
      expect(fnCalled.args.instanceName).to.eq('UFragmentsPolicy');
      expect(fnCalled.args.functionName).to.eq('rebase');
      expect(fnCalled.args.caller).to.eq(orchestrator.address);
    });

    it('should call the transaction', async function () {
      const fnCalled = mockDownstream.FunctionCalled().formatter(r.receipt.logs[1]);
      expect(fnCalled.args.instanceName).to.eq('MockDownstream');
      expect(fnCalled.args.functionName).to.eq('updateOneArg');
      expect(fnCalled.args.caller).to.eq(orchestrator.address);

      const fnArgs = mockDownstream.FunctionArguments().formatter(r.receipt.logs[2]);
      const parsedFnArgs = Object.keys(fnArgs.args).reduce((m, k) => {
        return fnArgs.args[k].map(d => d.toNumber()).concat(m);
      }, [ ]);
      expect(parsedFnArgs).to.eql([12345]);
    });
  });

  describe('when there are two transactions', async function () {
    before('adding a transaction', async function () {
      const updateTwoArgsEncoded = mockDownstream.contract.updateTwoArgs.getData(12345, 23456);
      orchestrator.addTransaction(mockDownstream.address, 0, updateTwoArgsEncoded, {from: deployer});
      r = await orchestrator.rebase();
    });

    it('should have 2 transaction', async function () {
      (await orchestrator.transactionsLength.call()).should.be.bignumber.eq(2);
    });

    it('should call rebase on policy', async function () {
      const fnCalled = mockPolicy.FunctionCalled().formatter(r.receipt.logs[0]);
      expect(fnCalled.args.instanceName).to.eq('UFragmentsPolicy');
      expect(fnCalled.args.functionName).to.eq('rebase');
      expect(fnCalled.args.caller).to.eq(orchestrator.address);
    });

    it('should call first transaction', async function () {
      const fnCalled = mockDownstream.FunctionCalled().formatter(r.receipt.logs[1]);
      expect(fnCalled.args.instanceName).to.eq('MockDownstream');
      expect(fnCalled.args.functionName).to.eq('updateOneArg');
      expect(fnCalled.args.caller).to.eq(orchestrator.address);

      const fnArgs = mockDownstream.FunctionArguments().formatter(r.receipt.logs[2]);
      const parsedFnArgs = Object.keys(fnArgs.args).reduce((m, k) => {
        return fnArgs.args[k].map(d => d.toNumber()).concat(m);
      }, [ ]);
      expect(parsedFnArgs).to.eql([12345]);
    });

    it('should call second transaction', async function () {
      const fnCalled = mockDownstream.FunctionCalled().formatter(r.receipt.logs[3]);
      expect(fnCalled.args.instanceName).to.eq('MockDownstream');
      expect(fnCalled.args.functionName).to.eq('updateTwoArgs');
      expect(fnCalled.args.caller).to.eq(orchestrator.address);

      const fnArgs = mockDownstream.FunctionArguments().formatter(r.receipt.logs[4]);
      const parsedFnArgs = Object.keys(fnArgs.args).reduce((m, k) => {
        return fnArgs.args[k].map(d => d.toNumber()).concat(m);
      }, [ ]);
      expect(parsedFnArgs).to.eql([23456, 12345]);
    });
  });

  describe('when 1st transaction is disabled', async function () {
    before('disabling a transaction', async function () {
      orchestrator.setTransactionEnabled(0, false);
      r = await orchestrator.rebase();
    });

    it('should have 2 transaction', async function () {
      (await orchestrator.transactionsLength.call()).should.be.bignumber.eq(2);
    });

    it('should call rebase on policy', async function () {
      const fnCalled = mockPolicy.FunctionCalled().formatter(r.receipt.logs[0]);
      expect(fnCalled.args.instanceName).to.eq('UFragmentsPolicy');
      expect(fnCalled.args.functionName).to.eq('rebase');
      expect(fnCalled.args.caller).to.eq(orchestrator.address);
    });

    it('should call second transaction', async function () {
      const fnCalled = mockDownstream.FunctionCalled().formatter(r.receipt.logs[1]);
      expect(fnCalled.args.instanceName).to.eq('MockDownstream');
      expect(fnCalled.args.functionName).to.eq('updateTwoArgs');
      expect(fnCalled.args.caller).to.eq(orchestrator.address);

      const fnArgs = mockDownstream.FunctionArguments().formatter(r.receipt.logs[2]);
      const parsedFnArgs = Object.keys(fnArgs.args).reduce((m, k) => {
        return fnArgs.args[k].map(d => d.toNumber()).concat(m);
      }, [ ]);
      expect(parsedFnArgs).to.eql([23456, 12345]);
    });
  });

  describe('when a transaction is removed', async function () {
    before('removing 1st transaction', async function () {
      orchestrator.removeTransaction(0);
      r = await orchestrator.rebase();
    });

    it('should have 1 transaction', async function () {
      (await orchestrator.transactionsLength.call()).should.be.bignumber.eq(1);
    });

    it('should call rebase on policy', async function () {
      const fnCalled = mockPolicy.FunctionCalled().formatter(r.receipt.logs[0]);
      expect(fnCalled.args.instanceName).to.eq('UFragmentsPolicy');
      expect(fnCalled.args.functionName).to.eq('rebase');
      expect(fnCalled.args.caller).to.eq(orchestrator.address);
    });

    it('should call the transaction', async function () {
      const fnCalled = mockDownstream.FunctionCalled().formatter(r.receipt.logs[1]);
      expect(fnCalled.args.instanceName).to.eq('MockDownstream');
      expect(fnCalled.args.functionName).to.eq('updateTwoArgs');
      expect(fnCalled.args.caller).to.eq(orchestrator.address);

      const fnArgs = mockDownstream.FunctionArguments().formatter(r.receipt.logs[2]);
      const parsedFnArgs = Object.keys(fnArgs.args).reduce((m, k) => {
        return fnArgs.args[k].map(d => d.toNumber()).concat(m);
      }, [ ]);
      expect(parsedFnArgs).to.eql([23456, 12345]);
    });
  });

  describe('when all transactions are removed', async function () {
    before('removing 1st transaction', async function () {
      orchestrator.removeTransaction(0);
      r = await orchestrator.rebase();
    });

    it('should have 0 transaction', async function () {
      (await orchestrator.transactionsLength.call()).should.be.bignumber.eq(0);
    });

    it('should call rebase on policy', async function () {
      const fnCalled = mockPolicy.FunctionCalled().formatter(r.receipt.logs[0]);
      expect(fnCalled.args.instanceName).to.eq('UFragmentsPolicy');
      expect(fnCalled.args.functionName).to.eq('rebase');
      expect(fnCalled.args.caller).to.eq(orchestrator.address);
    });
  });
});
