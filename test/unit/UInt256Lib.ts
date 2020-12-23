import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { expect } from 'chai'

describe('UInt256Lib', () => {
  const MAX_INT256 = ethers.BigNumber.from(2).pow(255).sub(1)

  let UInt256Lib: Contract

  beforeEach(async function () {
    // deploy contract
    const factory = await ethers.getContractFactory('UInt256LibMock')
    UInt256Lib = await factory.deploy()
    await UInt256Lib.deployed()
  })

  describe('toInt256Safe', function () {
    describe('when then number is more than MAX_INT256', () => {
      it('should fail', async function () {
        await expect(UInt256Lib.toInt256Safe(MAX_INT256.add(1))).to.be.reverted
      })
    })

    describe('when then number is MAX_INT256', () => {
      it('converts int to uint256 safely', async function () {
        await expect(UInt256Lib.toInt256Safe(MAX_INT256))
          .to.emit(UInt256Lib, 'ReturnValueInt256')
          .withArgs(MAX_INT256)
      })
    })

    describe('when then number is less than MAX_INT256', () => {
      it('converts int to uint256 safely', async function () {
        await expect(UInt256Lib.toInt256Safe(MAX_INT256.sub(1)))
          .to.emit(UInt256Lib, 'ReturnValueInt256')
          .withArgs(MAX_INT256.sub(1))
      })
    })

    describe('when then number is 0', () => {
      it('converts int to uint256 safely', async function () {
        await expect(UInt256Lib.toInt256Safe(0))
          .to.emit(UInt256Lib, 'ReturnValueInt256')
          .withArgs(0)
      })
    })
  })
})
