import { ethers } from 'hardhat'
import { BigNumberish } from 'ethers'
import { BigNumber as BN } from 'bignumber.js'

export const imul = (a: BigNumberish, b: BigNumberish, c: BigNumberish) => {
  return ethers.BigNumber.from(
    new BN(a.toString()).times(b.toString()).idiv(c.toString()).toString(10),
  )
}

export const increaseTime = async (seconds: BigNumberish) => {
  const now = (await ethers.provider.getBlock('latest')).timestamp
  await ethers.provider.send('evm_mine', [
    ethers.BigNumber.from(seconds).add(now).toNumber(),
  ])
}
