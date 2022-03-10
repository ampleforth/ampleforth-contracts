import { ethers } from 'hardhat'
import { Contract } from 'ethers'
import { expect } from 'chai'

describe('Select', () => {
  let select: Contract

  beforeEach(async function () {
    const factory = await ethers.getContractFactory('SelectMock')
    select = await factory.deploy()
    await select.deployed()
  })

  describe('computeMedian', function () {
    it('median of 1', async function () {
      const a = ethers.BigNumber.from(5678)
      await expect(select.computeMedian([a], 1))
        .to.emit(select, 'ReturnValueUInt256')
        .withArgs(a)
    })

    it('median of 2', async function () {
      const list = [ethers.BigNumber.from(10000), ethers.BigNumber.from(30000)]
      await expect(select.computeMedian(list, 2))
        .to.emit(select, 'ReturnValueUInt256')
        .withArgs(20000)
    })

    it('median of 3', async function () {
      const list = [
        ethers.BigNumber.from(10000),
        ethers.BigNumber.from(30000),
        ethers.BigNumber.from(21000),
      ]
      await expect(select.computeMedian(list, 3))
        .to.emit(select, 'ReturnValueUInt256')
        .withArgs(21000)
    })

    it('median of odd sized list', async function () {
      const count = 15
      const list = Array.from({ length: count }, () =>
        Math.floor(Math.random() * 10 ** 18),
      )
      const median = ethers.BigNumber.from(
        [...list].sort((a, b) => b - a)[Math.floor(count / 2)].toString(),
      )
      const bn_list = Array.from(list, (x) =>
        ethers.BigNumber.from(x.toString()),
      )
      await expect(select.computeMedian(bn_list, count))
        .to.emit(select, 'ReturnValueUInt256')
        .withArgs(median)
    })

    it('median of even sized list', async function () {
      const count = 20
      const list = Array.from({ length: count }, () =>
        Math.floor(Math.random() * 10 ** 18),
      )
      const bn_list = Array.from(list, (x) =>
        ethers.BigNumber.from(x.toString()),
      )
      list.sort((a, b) => b - a)
      let median = ethers.BigNumber.from(list[Math.floor(count / 2)].toString())
      median = median.add(
        ethers.BigNumber.from(list[Math.floor(count / 2) - 1].toString()),
      )
      median = median.div(2)

      await expect(select.computeMedian(bn_list, count))
        .to.emit(select, 'ReturnValueUInt256')
        .withArgs(median)
    })

    it('not enough elements in array', async function () {
      await expect(select.computeMedian([1], 2)).to.be.reverted
    })

    it('median of empty list', async function () {
      await expect(select.computeMedian([], 1)).to.be.reverted
    })

    it('median of list of size 0', async function () {
      await expect(select.computeMedian([10000], 0)).to.be.reverted
    })
  })
})
