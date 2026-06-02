import { ethers, waffle } from 'hardhat'
import { Contract, BigNumber } from 'ethers'
import { expect } from 'chai'

const { loadFixture } = waffle

const BN = BigNumber.from
const Q112 = BN(2).pow(112)
const TWO256 = BN(2).pow(256)
const E18 = BN(10).pow(18)

// Token decimals on mainnet.
const WETH_DECIMALS = 18
const AMPL_DECIMALS = 9
const USDC_DECIMALS = 6

// Per-leg decimals factors: 10**(18 + baseDecimals - quoteDecimals).
//  leg1 (AMPL/WETH, price1): base AMPL(9), quote WETH(18) -> 1e9
//  leg2 (USDC/WETH, price1): base WETH(18), quote USDC(6) -> 1e30
const DF1 = BN(10).pow(18 + AMPL_DECIMALS - WETH_DECIMALS)
const DF2 = BN(10).pow(18 + WETH_DECIMALS - USDC_DECIMALS)

const DAY = 86400
const HOUR = 3600
const PERIOD = 22 * HOUR // default minReportTimeIntervalSec

// Mirror DexOracle's per-leg fixed point conversion exactly.
const legPrice = (
  cumNow: BigNumber,
  cumLast: BigNumber,
  dt: number,
  df: BigNumber,
) => {
  const avg = cumNow.sub(cumLast).mod(TWO256).div(dt) // unchecked diff, then /dt
  return avg.mul(df).shr(112)
}
const chainedPrice = (
  l1Now: BigNumber,
  l1Last: BigNumber,
  l2Now: BigNumber,
  l2Last: BigNumber,
  dt: number,
) =>
  legPrice(l1Now, l1Last, dt, DF1)
    .mul(legPrice(l2Now, l2Last, dt, DF2))
    .div(E18)

const setNextTime = (t: number) =>
  ethers.provider.send('evm_setNextBlockTimestamp', [t])
const mineAt = async (t: number) => {
  await setNextTime(t)
  await ethers.provider.send('evm_mine', [])
}
const latestTime = async () =>
  (await ethers.provider.getBlock('latest')).timestamp

async function fixture() {
  const [deployer] = await ethers.getSigners()

  const tokenFactory = await ethers.getContractFactory('MockERC20Decimals')
  const weth = await tokenFactory.deploy(WETH_DECIMALS)
  const ampl = await tokenFactory.deploy(AMPL_DECIMALS)
  const usdc = await tokenFactory.deploy(USDC_DECIMALS)

  const pairFactory = await ethers.getContractFactory('MockUniswapV2Pair')
  // AMPL/WETH: token0 = WETH, token1 = AMPL (address-sorted on mainnet).
  const pairLeg1 = await pairFactory.deploy(weth.address, ampl.address)
  // USDC/WETH: token0 = USDC, token1 = WETH.
  const pairLeg2 = await pairFactory.deploy(usdc.address, weth.address)

  const medianOracle = await (
    await ethers.getContractFactory('MockMedianOracle')
  ).deploy()

  const oracle = await (
    await ethers.getContractFactory('DexOracle')
  ).deploy(
    medianOracle.address,
    pairLeg1.address,
    true, // leg1UseToken1Price -> WETH-per-AMPL
    pairLeg2.address,
    true, // leg2UseToken1Price -> USDC-per-WETH
  )

  return {
    deployer,
    weth,
    ampl,
    usdc,
    pairLeg1,
    pairLeg2,
    medianOracle,
    oracle,
  }
}

// Writes both pairs' price1 cumulatives and records their last-sync timestamp
// as `ts` (mock data — the measuring call later runs at `ts`, so
// currentCumulativePrices adds no counterfactual). price0 is set to a distinct
// sentinel to prove the contract reads the configured direction.
async function setPairState(
  pairLeg1: Contract,
  pairLeg2: Contract,
  l1Price1: BigNumber,
  l2Price1: BigNumber,
  ts: number,
) {
  const sentinel = BN('0xdead')
  const reserve = BN(10).pow(20)
  await pairLeg1.setCumulatives(sentinel, l1Price1)
  await pairLeg2.setCumulatives(sentinel, l2Price1)
  await pairLeg1.setReserves(reserve, reserve, ts)
  await pairLeg2.setReserves(reserve, reserve, ts)
}

// Returns an update time aligned to the daily update window (02:00 UTC) and the
// matching report time exactly PERIOD later, both safely in the future.
async function windowTimes() {
  const now = await latestTime()
  let tUpdate = Math.floor(now / DAY) * DAY + 7200
  while (tUpdate <= now + 100) tUpdate += DAY
  return { tUpdate, tReport: tUpdate + PERIOD }
}

describe('DexOracle', () => {
  describe('construction', () => {
    it('derives per-leg decimals factors from on-chain decimals', async () => {
      const { oracle } = await loadFixture(fixture)
      expect(await oracle.decimalsFactorLeg1()).to.equal(DF1) // 1e9
      expect(await oracle.decimalsFactorLeg2()).to.equal(DF2) // 1e30
      expect(await oracle.OUTPUT_DECIMALS()).to.equal(18)
    })

    it('logs the shared bridge token as matched', async () => {
      const { oracle, weth } = await loadFixture(fixture)
      await expect(oracle.deployTransaction)
        .to.emit(oracle, 'LogBridgeTokens')
        .withArgs(weth.address, weth.address, true)
    })

    it('sets the deployer as owner', async () => {
      const { oracle, deployer } = await loadFixture(fixture)
      expect(await oracle.owner()).to.equal(await deployer.getAddress())
    })
  })

  describe('before the first update', () => {
    it('reverts computePrice with UPDATE_NEVER_CALLED', async () => {
      const { oracle } = await loadFixture(fixture)
      await expect(oracle.computePrice()).to.be.revertedWith(
        'DexOracle: UPDATE_NEVER_CALLED',
      )
    })

    it('reverts pushReport with UPDATE_NEVER_CALLED', async () => {
      const { oracle } = await loadFixture(fixture)
      await expect(oracle.pushReport()).to.be.revertedWith(
        'DexOracle: UPDATE_NEVER_CALLED',
      )
    })
  })

  describe('update', () => {
    it('snapshots the configured (token1) cumulatives in-window', async () => {
      const { oracle, pairLeg1, pairLeg2 } = await loadFixture(fixture)
      const { tUpdate } = await windowTimes()
      const l1 = BN('111').mul(Q112)
      const l2 = BN('222').mul(Q112)

      await setPairState(pairLeg1, pairLeg2, l1, l2, tUpdate)
      await setNextTime(tUpdate)
      await oracle.update()

      expect(await oracle.priceLeg1CumulativeLast()).to.equal(l1)
      expect(await oracle.priceLeg2CumulativeLast()).to.equal(l2)
      expect(await oracle.blockTimestampLast()).to.equal(tUpdate)
    })

    it('reverts outside the update window', async () => {
      const { oracle, pairLeg1, pairLeg2 } = await loadFixture(fixture)
      const { tUpdate } = await windowTimes()
      const offWindow = tUpdate + 2 * HOUR // 04:00 UTC, outside [02:00, 02:20)
      await setPairState(pairLeg1, pairLeg2, BN(1), BN(1), offWindow)
      await setNextTime(offWindow)
      await expect(oracle.update()).to.be.revertedWith(
        'DexOracle: NOT_IN_UPDATE_WINDOW',
      )
    })
  })

  describe('pushReport', () => {
    it('reports the chained 18-decimal TWAP to the median oracle', async () => {
      const { oracle, pairLeg1, pairLeg2, medianOracle } = await loadFixture(
        fixture,
      )
      const { tUpdate, tReport } = await windowTimes()

      // Window opens with both legs' price1 cumulatives at zero.
      await setPairState(pairLeg1, pairLeg2, BN(0), BN(0), tUpdate)
      await setNextTime(tUpdate)
      await oracle.update()

      // Choose realistic averages: WETH-per-AMPL ~ 0.0004, USDC-per-WETH ~ 3000.
      const avg1 = BN('400000').mul(Q112) // legPrice1 = 4e14
      const avg2 = BN('3000000000000000000000').mul(Q112).div(DF2)
      const l1Report = avg1.mul(PERIOD)
      const l2Report = avg2.mul(PERIOD)
      await setPairState(pairLeg1, pairLeg2, l1Report, l2Report, tReport)

      const expected = chainedPrice(l1Report, BN(0), l2Report, BN(0), PERIOD)

      await setNextTime(tReport)
      await expect(oracle.pushReport())
        .to.emit(oracle, 'LogReportPushed')
        .withArgs(expected, PERIOD)

      expect(await medianOracle.lastPayload()).to.equal(expected)
      expect(await medianOracle.reportCount()).to.equal(1)
      // Sanity: AMPL/USDC should land near $1.20.
      const target = ethers.utils.parseUnits('1.2', 18)
      expect(expected.sub(target).abs()).to.be.lt(target.div(1000))
    })

    it('reverts when the minimum period has not elapsed', async () => {
      const { oracle, pairLeg1, pairLeg2 } = await loadFixture(fixture)
      const { tUpdate } = await windowTimes()
      await setPairState(pairLeg1, pairLeg2, BN(0), BN(0), tUpdate)
      await setNextTime(tUpdate)
      await oracle.update()

      const tEarly = tUpdate + PERIOD - 60 // one minute short of 22h
      await setPairState(
        pairLeg1,
        pairLeg2,
        BN(10).mul(Q112),
        BN(10).mul(Q112),
        tEarly,
      )
      await setNextTime(tEarly)
      await expect(oracle.pushReport()).to.be.revertedWith(
        'DexOracle: PERIOD_NOT_ELAPSED',
      )
    })

    it('handles UniswapV2 accumulator wraparound', async () => {
      const { oracle, pairLeg1, pairLeg2, medianOracle } = await loadFixture(
        fixture,
      )
      const { tUpdate, tReport } = await windowTimes()

      const avg1 = BN('400000').mul(Q112)
      const avg2 = BN('3000000000000000000000').mul(Q112).div(DF2)
      const delta1 = avg1.mul(PERIOD)
      const delta2 = avg2.mul(PERIOD)

      // Start near the uint256 ceiling so the window straddles a wrap.
      const start1 = TWO256.sub(100)
      const start2 = TWO256.sub(7)
      await setPairState(pairLeg1, pairLeg2, start1, start2, tUpdate)
      await setNextTime(tUpdate)
      await oracle.update()

      const end1 = start1.add(delta1).mod(TWO256)
      const end2 = start2.add(delta2).mod(TWO256)
      await setPairState(pairLeg1, pairLeg2, end1, end2, tReport)

      // Wrapped diff must equal the non-wrapped result.
      const expected = chainedPrice(delta1, BN(0), delta2, BN(0), PERIOD)

      await setNextTime(tReport)
      await oracle.pushReport()
      expect(await medianOracle.lastPayload()).to.equal(expected)
    })
  })

  describe('computePrice', () => {
    it('returns the chained TWAP without reporting', async () => {
      const { oracle, pairLeg1, pairLeg2, medianOracle } = await loadFixture(
        fixture,
      )
      const { tUpdate, tReport } = await windowTimes()

      await setPairState(pairLeg1, pairLeg2, BN(0), BN(0), tUpdate)
      await setNextTime(tUpdate)
      await oracle.update()

      const l1 = BN('123456').mul(Q112).mul(PERIOD)
      const l2 = BN('654321').mul(Q112).mul(PERIOD)
      await setPairState(pairLeg1, pairLeg2, l1, l2, tReport)
      // computePrice() is a view (it never mines or writes). This mineAt is a
      // test-only device: an eth_call evaluates against the latest block's
      // timestamp, so we advance the local chain to tReport so the read sees
      // timeElapsed == PERIOD (and block.timestamp == reserves.blockTimestampLast,
      // avoiding a counterfactual). On a live chain block.timestamp advances on
      // its own; nothing mines a block to read the price.
      await mineAt(tReport)

      const expected = chainedPrice(l1, BN(0), l2, BN(0), PERIOD)
      expect(await oracle.computePrice()).to.equal(expected)
      // computePrice must not push a report.
      expect(await medianOracle.reportCount()).to.equal(0)
    })
  })

  describe('price0 direction (useToken1Price = false)', () => {
    it('reads price0 and bases the factor on token0', async () => {
      const [deployer] = await ethers.getSigners()
      const tokenFactory = await ethers.getContractFactory('MockERC20Decimals')
      const usdc = await tokenFactory.deploy(USDC_DECIMALS)
      const weth = await tokenFactory.deploy(WETH_DECIMALS)
      const ampl = await tokenFactory.deploy(AMPL_DECIMALS)
      const pairFactory = await ethers.getContractFactory('MockUniswapV2Pair')
      // Leg with token0 = USDC: price0 prices USDC(base,6) in WETH(quote,18).
      const pairLeg1 = await pairFactory.deploy(usdc.address, weth.address)
      const pairLeg2 = await pairFactory.deploy(weth.address, ampl.address)
      const medianOracle = await (
        await ethers.getContractFactory('MockMedianOracle')
      ).deploy()
      const oracle = await (await ethers.getContractFactory('DexOracle'))
        .connect(deployer)
        .deploy(
          medianOracle.address,
          pairLeg1.address,
          false,
          pairLeg2.address,
          false,
        )

      // base USDC(6), quote WETH(18) -> 10**(18+6-18) = 1e6
      expect(await oracle.decimalsFactorLeg1()).to.equal(BN(10).pow(6))
      // base WETH(18), quote AMPL(9) -> 10**(18+18-9) = 1e27
      expect(await oracle.decimalsFactorLeg2()).to.equal(BN(10).pow(27))
    })
  })
})
