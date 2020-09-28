/*
  In this script, we generate random cycles of fragments growth and contraction
  and test the precision of fragments transfers
  During every iteration; percentageGrowth is sampled from a unifrom distribution between [-50%,250%]
  and the fragments total supply grows/contracts.
  In each cycle we test the following guarantees:
  - If address 'A' transfers x fragments to address 'B'. A's resulting external balance will
  be decreased by precisely x fragments, and B's external balance will be precisely
  increased by x fragments.
*/

import { ethers, upgrades } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, BigNumberish, Contract, Signer } from 'ethers'
import { imul } from '../utils/utils'
const Stochasm = require('stochasm')

const endSupply = ethers.BigNumber.from(2).pow(128).sub(1)
const uFragmentsGrowth = new Stochasm({
  min: -0.5,
  max: 2.5,
  seed: 'fragments.org',
})

let uFragments: Contract,
  inflation: BigNumber,
  rebaseAmt = ethers.BigNumber.from(0),
  preRebaseSupply = ethers.BigNumber.from(0),
  postRebaseSupply = ethers.BigNumber.from(0)

async function checkBalancesAfterOperation(
  users: Signer[],
  op: Function,
  chk: Function,
) {
  const _bals = []
  const bals = []
  let u
  for (u in users) {
    if (Object.prototype.hasOwnProperty.call(users, u)) {
      _bals.push(await uFragments.balanceOf(users[u].getAddress()))
    }
  }
  await op()
  for (u in users) {
    if (Object.prototype.hasOwnProperty.call(users, u)) {
      bals.push(await uFragments.balanceOf(users[u].getAddress()))
    }
  }
  chk(_bals, bals)
}

async function checkBalancesAfterTransfer(users: Signer[], tAmt: BigNumberish) {
  await checkBalancesAfterOperation(
    users,
    async function () {
      await uFragments.connect(users[0]).transfer(users[1].getAddress(), tAmt)
    },
    function ([_u0Bal, _u1Bal]: BigNumber[], [u0Bal, u1Bal]: BigNumber[]) {
      const _sum = _u0Bal.add(_u1Bal)
      const sum = u0Bal.add(u1Bal)
      expect(_sum).to.eq(sum)
      expect(_u0Bal.sub(tAmt)).to.eq(u0Bal)
      expect(_u1Bal.add(tAmt)).to.eq(u1Bal)
    },
  )
}

async function exec() {
  const [deployer, user] = await ethers.getSigners()
  const factory = await ethers.getContractFactory('UFragments')
  uFragments = await upgrades.deployProxy(
    factory.connect(deployer),
    [await deployer.getAddress()],
    {
      initializer: 'initialize(address)',
    },
  )
  await uFragments.connect(deployer).setMonetaryPolicy(deployer.getAddress())

  let i = 0
  do {
    await uFragments.connect(deployer).rebase(i + 1, rebaseAmt)
    postRebaseSupply = await uFragments.totalSupply()
    i++

    console.log('Rebased iteration', i)
    console.log('Rebased by', rebaseAmt.toString(), 'AMPL')
    console.log('Total supply is now', postRebaseSupply.toString(), 'AMPL')

    console.log('Testing precision of 1c transfer')
    await checkBalancesAfterTransfer([deployer, user], 1)
    await checkBalancesAfterTransfer([user, deployer], 1)

    console.log('Testing precision of max denomination')
    const tAmt = await uFragments.balanceOf(deployer.getAddress())
    await checkBalancesAfterTransfer([deployer, user], tAmt)
    await checkBalancesAfterTransfer([user, deployer], tAmt)

    preRebaseSupply = await uFragments.totalSupply()
    inflation = uFragmentsGrowth.next().toFixed(5)
    rebaseAmt = imul(preRebaseSupply, inflation, 1)
  } while ((await uFragments.totalSupply()).add(rebaseAmt).lt(endSupply))
}

describe('Transfer Precision', function () {
  it('should successfully run simulation', async function () {
    await exec()
  })
})
