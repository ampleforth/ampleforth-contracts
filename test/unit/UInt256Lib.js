const UInt256LibMock = artifacts.require('UInt256LibMock');

const BN = web3.utils.BN;
const _require = require('app-root-path').require;
const BlockchainCaller = _require('/util/blockchain_caller');
const chain = new BlockchainCaller(web3);

require('chai')
  .use(require('chai-bn')(BN))
  .should();

contract('UInt256Lib', () => {
  const MAX_INT256 =
				new BN(2).pow(new BN(255)).sub(new BN(1));

  let UInt256Lib;

  beforeEach(async function () {
    UInt256Lib = await UInt256LibMock.new();
  });

  async function returnVal (tx) {
    return (await tx).logs[0].args.val;
  }

  describe('toInt256Safe', function () {
    describe('when then number is more than MAX_INT256', () => {
      it('should fail', async function () {
        expect(
          await chain.isEthException(
            UInt256Lib.toInt256Safe(MAX_INT256.add(new BN(1))))
        ).to.be.true;
      });
    });

    describe('when then number is MAX_INT256', () => {
      it('converts int to uint256 safely', async function () {
        (await returnVal(UInt256Lib.toInt256Safe(MAX_INT256)))
          .should.be.bignumber.eq(MAX_INT256);
      });
    });

    describe('when then number is less than MAX_INT256', () => {
      it('converts int to uint256 safely', async function () {
        (await returnVal(UInt256Lib.toInt256Safe(MAX_INT256.sub(new BN(1)))))
          .should.be.bignumber.eq(MAX_INT256.sub(new BN(1)));
      });
    });

    describe('when then number is 0', () => {
      it('converts int to uint256 safely', async function () {
        (await returnVal(UInt256Lib.toInt256Safe(new BN(0))))
          .should.be.bignumber.eq(new BN(0));
      });
    });
  });
});
