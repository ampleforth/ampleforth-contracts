import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { expect } from 'chai'

describe('SafeMathInt', () => {
  const MIN_INT256 = ethers.BigNumber.from(-2).pow(255)
  const MAX_INT256 = ethers.BigNumber.from(2).pow(255).sub(1)

  let safeMathInt: Contract

  beforeEach(async function () {
    // deploy contract
    const factory = await ethers.getContractFactory('SafeMathIntMock')
    safeMathInt = await factory.deploy()
    await safeMathInt.deployed()
  })

  describe('add', function () {
    it('adds correctly', async function () {
      const a = ethers.BigNumber.from(5678)
      const b = ethers.BigNumber.from(1234)

      await expect(safeMathInt.add(a, b))
        .to.emit(safeMathInt, 'ReturnValueInt256')
        .withArgs(a.add(b))
    })

    it('should fail on addition overflow', async function () {
      const a = MAX_INT256
      const b = ethers.BigNumber.from(1)

      await expect(safeMathInt.add(a, b)).to.be.reverted
      await expect(safeMathInt.add(b, a)).to.be.reverted
    })

    it('should fail on addition overflow, swapped args', async function () {
      const a = ethers.BigNumber.from(1)
      const b = MAX_INT256

      await expect(safeMathInt.add(a, b)).to.be.reverted
      await expect(safeMathInt.add(b, a)).to.be.reverted
    })

    it('should fail on addition negative overflow', async function () {
      const a = MIN_INT256
      const b = ethers.BigNumber.from(-1)

      await expect(safeMathInt.add(a, b)).to.be.reverted
      await expect(safeMathInt.add(b, a)).to.be.reverted
    })
  })

  describe('sub', function () {
    it('subtracts correctly', async function () {
      const a = ethers.BigNumber.from(5678)
      const b = ethers.BigNumber.from(1234)

      await expect(safeMathInt.sub(a, b))
        .to.emit(safeMathInt, 'ReturnValueInt256')
        .withArgs(a.sub(b))
    })

    it('should fail on subtraction overflow', async function () {
      const a = MAX_INT256
      const b = ethers.BigNumber.from(-1)

      await expect(safeMathInt.sub(a, b)).to.be.reverted
    })

    it('should fail on subtraction negative overflow', async function () {
      const a = MIN_INT256
      const b = ethers.BigNumber.from(1)

      await expect(safeMathInt.sub(a, b)).to.be.reverted
    })
  })

  describe('mul', function () {
    it('multiplies correctly', async function () {
      const a = ethers.BigNumber.from(1234)
      const b = ethers.BigNumber.from(5678)

      await expect(safeMathInt.mul(a, b))
        .to.emit(safeMathInt, 'ReturnValueInt256')
        .withArgs(a.mul(b))
    })

    it('handles a zero product correctly', async function () {
      const a = ethers.BigNumber.from(0)
      const b = ethers.BigNumber.from(5678)

      await expect(safeMathInt.mul(a, b))
        .to.emit(safeMathInt, 'ReturnValueInt256')
        .withArgs(a.mul(b))
    })

    it('should fail on multiplication overflow', async function () {
      const a = MAX_INT256
      const b = ethers.BigNumber.from(2)

      await expect(safeMathInt.mul(a, b)).to.be.reverted
      await expect(safeMathInt.mul(b, a)).to.be.reverted
    })

    it('should fail on multiplication negative overflow', async function () {
      const a = MIN_INT256
      const b = ethers.BigNumber.from(2)

      await expect(safeMathInt.mul(a, b)).to.be.reverted
      await expect(safeMathInt.mul(b, a)).to.be.reverted
    })

    it('should fail on multiplication between -1 and MIN_INT256', async function () {
      const a = MIN_INT256
      const b = ethers.BigNumber.from(-1)

      await expect(safeMathInt.mul(a, b)).to.be.reverted
      await expect(safeMathInt.mul(b, a)).to.be.reverted
    })
  })

  describe('div', function () {
    it('divides correctly', async function () {
      const a = ethers.BigNumber.from(5678)
      const b = ethers.BigNumber.from(5678)

      await expect(safeMathInt.div(a, b))
        .to.emit(safeMathInt, 'ReturnValueInt256')
        .withArgs(a.div(b))
    })

    it('should fail on zero division', async function () {
      const a = ethers.BigNumber.from(5678)
      const b = ethers.BigNumber.from(0)

      await expect(safeMathInt.div(a, b)).to.be.reverted
    })

    it('should fail when MIN_INT256 is divided by -1', async function () {
      const a = ethers.BigNumber.from(MIN_INT256)
      const b = ethers.BigNumber.from(-1)

      await expect(safeMathInt.div(a, b)).to.be.reverted
    })
  })

  describe('abs', function () {
    it('works for 0', async function () {
      await expect(safeMathInt.abs(0))
        .to.emit(safeMathInt, 'ReturnValueInt256')
        .withArgs(0)
    })

    it('works on positive numbers', async function () {
      await expect(safeMathInt.abs(100))
        .to.emit(safeMathInt, 'ReturnValueInt256')
        .withArgs(100)
    })

    it('works on negative numbers', async function () {
      await expect(safeMathInt.abs(-100))
        .to.emit(safeMathInt, 'ReturnValueInt256')
        .withArgs(100)
    })

    it('fails on overflow condition', async function () {
      await expect(safeMathInt.abs(MIN_INT256)).to.be.reverted
    })
  })
})
