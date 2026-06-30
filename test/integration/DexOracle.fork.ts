import { ethers, network } from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
import { increaseTime } from '../utils/utils'

// Mainnet UniswapV2 pools (token orderings verified on-chain):
//   AMPL/WETH 0xc5be99... : token0=WETH(18), token1=AMPL(9) -> price1
//   USDC/WETH 0xb4e16d... : token0=USDC(6),  token1=WETH(18) -> price1
const PAIR_AMPL_WETH = '0xc5be99a02c6857f9eac67bbce58df5572498f40c'
const PAIR_USDC_WETH = '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc'

const REBASE = 24 * 3600
const E18 = BigNumber.from(10).pow(18)

// Forking is opt-in: set FORK_RPC_URL to a mainnet RPC to run, e.g.
//   FORK_RPC_URL=https://... yarn hardhat test test/integration/DexOracle.fork.ts
// Without it the whole suite is skipped, so the normal unit-test run stays
// offline and fast.
const FORK_RPC = process.env.FORK_RPC_URL || ''

describe('DexOracle (mainnet fork)', () => {
  let oracle: any
  let medianOracle: any

  before(async function () {
    if (!FORK_RPC) {
      this.skip()
      return
    }
    this.timeout(600000) // forking fetches state over the network; be generous
    await network.provider.request({
      method: 'hardhat_reset',
      params: [{ forking: { jsonRpcUrl: FORK_RPC } }],
    })

    const [deployer] = await ethers.getSigners()
    medianOracle = await (
      await ethers.getContractFactory('MockMedianOracle')
    ).deploy()
    oracle = await (
      await ethers.getContractFactory('DexOracle')
    ).deploy(
      medianOracle.address,
      await deployer.getAddress(), // orchestrator (so deployer may update anytime)
      PAIR_AMPL_WETH,
      true, // leg1 price1 -> WETH per AMPL
      PAIR_USDC_WETH,
      true, // leg2 price1 -> USDC per WETH
      REBASE,
    )
  })

  after(async () => {
    // Drop the fork so later runs in the same process start clean.
    if (FORK_RPC)
      await network.provider.request({ method: 'hardhat_reset', params: [] })
  })

  it('bridges decimals correctly against the live pools', async () => {
    expect(await oracle.decimalsFactorLeg1()).to.equal(
      BigNumber.from(10).pow(9),
    )
    expect(await oracle.decimalsFactorLeg2()).to.equal(
      BigNumber.from(10).pow(30),
    )
  })

  it('computes a plausible AMPL/USDC TWAP and reports it', async function () {
    this.timeout(600000)
    await oracle.update()
    await increaseTime(22 * 3600) // mature the window ~22h

    const price = await oracle.consult()
    // Loose sanity band — AMPL targets ~$1 (CPI-adjusted) but floats. On a fork
    // with no swaps this equals the spot at fork height.
    expect(price).to.be.gt(E18.div(5)) // > $0.20
    expect(price).to.be.lt(E18.mul(5)) // < $5.00
    // eslint-disable-next-line no-console
    console.log('AMPL/USDC TWAP (18dp):', price.toString())

    await oracle.pushReport()
    expect(await medianOracle.reportCount()).to.equal(1)
    const reported = await medianOracle.lastPayload()
    expect(reported).to.be.gt(E18.div(5))
    expect(reported).to.be.lt(E18.mul(5))
  })
})
