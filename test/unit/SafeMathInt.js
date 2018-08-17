const SafeMathIntMock = artifacts.require('SafeMathIntMock');

const BigNumber = web3.BigNumber;
const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('SafeMathInt', () => {
  const MIN_INT256 = new BigNumber('-57896044618658097711785492504343953926634992332820282019728792003956564819968');
  const MAX_INT256 = new BigNumber('57896044618658097711785492504343953926634992332820282019728792003956564819967');

  let safeMathInt;

  beforeEach(async function () {
    safeMathInt = await SafeMathIntMock.new();
  });

  async function returnVal (tx) {
    return (await tx).logs[0].args.intVal;
  }

  describe('add', function () {
    it('adds correctly', async function () {
      const a = new BigNumber(5678);
      const b = new BigNumber(1234);

      (await returnVal(safeMathInt.add(a, b))).should.be.bignumber.eq(a.plus(b));
    });

    it('throws an error on addition overflow', async function () {
      const a = MAX_INT256;
      const b = new BigNumber(1);

      await chain.expectInvalidOpcode(safeMathInt.add(a, b));
      await chain.expectInvalidOpcode(safeMathInt.add(b, a));
    });

    it('throws an error on addition negative overflow', async function () {
      const a = MIN_INT256;
      const b = new BigNumber(-1);

      await chain.expectInvalidOpcode(safeMathInt.add(a, b));
      await chain.expectInvalidOpcode(safeMathInt.add(b, a));
    });
  });

  describe('sub', function () {
    it('subtracts correctly', async function () {
      const a = new BigNumber(5678);
      const b = new BigNumber(1234);

      (await returnVal(safeMathInt.sub(a, b))).should.be.bignumber.eq(a.minus(b));
    });

    it('throws an error on subtraction overflow', async function () {
      const a = MAX_INT256;
      const b = new BigNumber(-1);

      await chain.expectInvalidOpcode(safeMathInt.sub(a, b));
    });

    it('throws an error on subtraction negative overflow', async function () {
      const a = MIN_INT256;
      const b = new BigNumber(1);

      await chain.expectInvalidOpcode(safeMathInt.sub(a, b));
    });
  });

  describe('mul', function () {
    it('multiplies correctly', async function () {
      const a = new BigNumber(1234);
      const b = new BigNumber(5678);

      (await returnVal(safeMathInt.mul(a, b))).should.be.bignumber.eq(a.times(b));
    });

    it('handles a zero product correctly', async function () {
      const a = new BigNumber(0);
      const b = new BigNumber(5678);

      (await returnVal(safeMathInt.mul(a, b))).should.be.bignumber.eq(a.times(b));
    });

    it('throws an error on multiplication overflow', async function () {
      const a = MAX_INT256;
      const b = new BigNumber(2);

      await chain.expectInvalidOpcode(safeMathInt.mul(a, b));
      await chain.expectInvalidOpcode(safeMathInt.mul(b, a));
    });

    it('throws an error on multiplication negative overflow', async function () {
      const a = MIN_INT256;
      const b = new BigNumber(2);

      await chain.expectInvalidOpcode(safeMathInt.mul(a, b));
      await chain.expectInvalidOpcode(safeMathInt.mul(b, a));
    });

    it('throws an error on multiplication between -1 and MIN_INT256', async function () {
      const a = MIN_INT256;
      const b = new BigNumber(-1);

      await chain.expectInvalidOpcode(safeMathInt.mul(a, b));
      await chain.expectInvalidOpcode(safeMathInt.mul(b, a));
    });
  });

  describe('div', function () {
    it('divides correctly', async function () {
      const a = new BigNumber(5678);
      const b = new BigNumber(5678);

      (await returnVal(safeMathInt.div(a, b))).should.be.bignumber.eq(a.div(b));
    });

    it('throws an error on zero division', async function () {
      const a = new BigNumber(5678);
      const b = new BigNumber(0);

      await chain.expectInvalidOpcode(safeMathInt.div(a, b));
    });
  });
});
