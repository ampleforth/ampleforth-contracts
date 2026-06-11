import { ethers, waffle } from 'hardhat'
import { Contract, BigNumber } from 'ethers'
import { expect } from 'chai'

const { loadFixture } = waffle

const BN = BigNumber.from
const Q112 = BN(2).pow(112)
const TWO32 = 2 ** 32
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

const HOUR = 3600
const PERIOD = 22 * HOUR // default period (min interval between updates)

// Mirror DexOracle's scale-then-diff fixed point math exactly: each raw
// UQ112x112 cumulative is bridged to an 18-decimal price-seconds value
// (uq * decimalsFactor >> 112) before the windowed difference is taken.
const scaled = (uq: BigNumber, df: BigNumber) => uq.mul(df).shr(112)
const legPrice = (
  uqNow: BigNumber,
  uqLast: BigNumber,
  dt: number,
  df: BigNumber,
) => scaled(uqNow, df).sub(scaled(uqLast, df)).div(dt)
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
    ethers.constants.AddressZero, // orchestrator (set per-test where needed)
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

// Writes both pairs' raw price1 UQ112x112 cumulatives and records their
// last-sync timestamp as `reservesTs` (mock data; when it equals the measuring
// call's uint32 block timestamp the oracle library adds no counterfactual).
// price0 is set to a sentinel to prove the contract reads the configured
// direction.
async function setPairState(
  pairLeg1: Contract,
  pairLeg2: Contract,
  l1Price1: BigNumber,
  l2Price1: BigNumber,
  reservesTs: number,
) {
  const sentinel = BN('0xdead')
  const reserve = BN(10).pow(20)
  await pairLeg1.setCumulatives(sentinel, l1Price1)
  await pairLeg2.setCumulatives(sentinel, l2Price1)
  await pairLeg1.setReserves(reserve, reserve, reservesTs)
  await pairLeg2.setReserves(reserve, reserve, reservesTs)
}

// Returns an update time and the matching report time exactly PERIOD later,
// both safely in the future and below the uint32 boundary.
async function windowTimes() {
  const now = await latestTime()
  const tUpdate = now + 100
  return { tUpdate, tReport: tUpdate + PERIOD }
}

// Realistic averages: WETH-per-AMPL ~ 0.0004, USDC-per-WETH ~ 3000.
const AVG1_UQ = BN('400000').mul(Q112) // -> legPrice1 = 4e14
const AVG2_UQ = BN('3000000000000000000000').mul(Q112).div(DF2)

describe('DexOracle', () => {
  describe('construction', () => {
    it('derives per-leg decimals factors from on-chain decimals', async () => {
      const { oracle } = await loadFixture(fixture)
      expect(await oracle.decimalsFactorLeg1()).to.equal(DF1) // 1e9
      expect(await oracle.decimalsFactorLeg2()).to.equal(DF2) // 1e30
      expect(await oracle.OUTPUT_DECIMALS()).to.equal(18)
      expect(await oracle.orchestrator()).to.equal(ethers.constants.AddressZero)
    })

    it('records the median oracle and exposes it as settable', async () => {
      const { oracle, medianOracle } = await loadFixture(fixture)
      expect(await oracle.medianOracle()).to.equal(medianOracle.address)

      const other = await (
        await ethers.getContractFactory('MockMedianOracle')
      ).deploy()
      await oracle.setMedianOracle(other.address)
      expect(await oracle.medianOracle()).to.equal(other.address)

      const [, stranger] = await ethers.getSigners()
      await expect(oracle.connect(stranger).setMedianOracle(other.address)).to
        .be.reverted
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
    it('reverts consult with UPDATE_NEVER_CALLED', async () => {
      const { oracle } = await loadFixture(fixture)
      await expect(oracle.consult()).to.be.revertedWith(
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
    it('snapshots the configured (token1) decimal cumulatives', async () => {
      const { oracle, pairLeg1, pairLeg2 } = await loadFixture(fixture)
      const { tUpdate } = await windowTimes()
      const l1 = BN('111').mul(Q112)
      const l2 = BN('222').mul(Q112)

      await setPairState(pairLeg1, pairLeg2, l1, l2, tUpdate)
      await setNextTime(tUpdate)
      await oracle.update()

      expect(await oracle.priceLeg1CumulativeLast()).to.equal(scaled(l1, DF1))
      expect(await oracle.priceLeg2CumulativeLast()).to.equal(scaled(l2, DF2))
      expect(await oracle.blockTimestampLast()).to.equal(tUpdate)
    })

    it('lets the owner update at any time', async () => {
      const { oracle, pairLeg1, pairLeg2 } = await loadFixture(fixture)
      const { tUpdate } = await windowTimes()

      await setPairState(pairLeg1, pairLeg2, BN(1), BN(1), tUpdate)
      await setNextTime(tUpdate)
      await oracle.update() // deployer is owner

      // Immediately again — no period gate for trusted callers.
      const soon = tUpdate + 60
      await setPairState(pairLeg1, pairLeg2, BN(2), BN(2), soon)
      await setNextTime(soon)
      await oracle.update()
      expect(await oracle.blockTimestampLast()).to.equal(soon)
    })

    it('lets the orchestrator update at any time', async () => {
      const { oracle, pairLeg1, pairLeg2 } = await loadFixture(fixture)
      const [, orchestrator] = await ethers.getSigners()
      await oracle.setOrchestrator(await orchestrator.getAddress())
      const { tUpdate } = await windowTimes()

      await setPairState(pairLeg1, pairLeg2, BN(1), BN(1), tUpdate)
      await setNextTime(tUpdate)
      await oracle.connect(orchestrator).update()
      expect(await oracle.blockTimestampLast()).to.equal(tUpdate)
    })

    it('rejects update from a non-orchestrator, non-owner caller', async () => {
      const { oracle, pairLeg1, pairLeg2 } = await loadFixture(fixture)
      const [, stranger] = await ethers.getSigners()
      const { tUpdate } = await windowTimes()
      await setPairState(pairLeg1, pairLeg2, BN(1), BN(1), tUpdate)
      await setNextTime(tUpdate)
      await expect(oracle.connect(stranger).update()).to.be.revertedWith(
        'DexOracle: UNAUTHORIZED',
      )
    })

    it('restricts setOrchestrator to the owner', async () => {
      const { oracle } = await loadFixture(fixture)
      const [, stranger] = await ethers.getSigners()
      await expect(
        oracle.connect(stranger).setOrchestrator(await stranger.getAddress()),
      ).to.be.reverted
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

      const l1Report = AVG1_UQ.mul(PERIOD)
      const l2Report = AVG2_UQ.mul(PERIOD)
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

    it('does not gate on elapsed time (reports even shortly after update)', async () => {
      const { oracle, pairLeg1, pairLeg2, medianOracle } = await loadFixture(
        fixture,
      )
      const { tUpdate } = await windowTimes()

      await setPairState(pairLeg1, pairLeg2, BN(0), BN(0), tUpdate)
      await setNextTime(tUpdate)
      await oracle.update()

      // Only one hour of measurement — well under `period` — must still report.
      const tEarly = tUpdate + HOUR
      const l1 = AVG1_UQ.mul(HOUR)
      const l2 = AVG2_UQ.mul(HOUR)
      await setPairState(pairLeg1, pairLeg2, l1, l2, tEarly)
      await setNextTime(tEarly)
      await oracle.pushReport()

      const expected = chainedPrice(l1, BN(0), l2, BN(0), HOUR)
      expect(await medianOracle.lastPayload()).to.equal(expected)
    })

    it('is callable by anyone (fully open)', async () => {
      const { oracle, pairLeg1, pairLeg2, medianOracle } = await loadFixture(
        fixture,
      )
      const [, stranger] = await ethers.getSigners()
      const { tUpdate, tReport } = await windowTimes()

      await setPairState(pairLeg1, pairLeg2, BN(0), BN(0), tUpdate)
      await setNextTime(tUpdate)
      await oracle.update()

      const l1 = AVG1_UQ.mul(PERIOD)
      const l2 = AVG2_UQ.mul(PERIOD)
      await setPairState(pairLeg1, pairLeg2, l1, l2, tReport)
      await setNextTime(tReport)
      await oracle.connect(stranger).pushReport()

      const expected = chainedPrice(l1, BN(0), l2, BN(0), PERIOD)
      expect(await medianOracle.lastPayload()).to.equal(expected)
    })

    it('handles the uint32 block-timestamp wraparound', async () => {
      const { oracle, pairLeg1, pairLeg2, medianOracle } = await loadFixture(
        fixture,
      )

      // Straddle the 2**32 boundary: update just before it, report just after.
      const tUpdate = TWO32 - 100
      const tReport = tUpdate + PERIOD // wraps mod 2**32

      await setPairState(pairLeg1, pairLeg2, BN(0), BN(0), tUpdate % TWO32)
      await setNextTime(tUpdate)
      await oracle.update()

      const l1 = AVG1_UQ.mul(PERIOD)
      const l2 = AVG2_UQ.mul(PERIOD)
      await setPairState(pairLeg1, pairLeg2, l1, l2, tReport % TWO32)

      const expected = chainedPrice(l1, BN(0), l2, BN(0), PERIOD)
      await setNextTime(tReport)
      await expect(oracle.pushReport())
        .to.emit(oracle, 'LogReportPushed')
        .withArgs(expected, PERIOD) // elapsed still resolves to PERIOD
      expect(await medianOracle.lastPayload()).to.equal(expected)
    })
  })

  describe('consult', () => {
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
      // consult() is a view (it never mines or writes). This mineAt is a
      // test-only device: an eth_call evaluates against the latest block's
      // timestamp, so we advance the local chain to tReport so the read sees
      // timeElapsed == PERIOD (and block.timestamp == reserves.blockTimestampLast,
      // avoiding a counterfactual). On a live chain block.timestamp advances on
      // its own; nothing mines a block to read the price.
      await mineAt(tReport)

      const expected = chainedPrice(l1, BN(0), l2, BN(0), PERIOD)
      expect(await oracle.consult()).to.equal(expected)
      // consult() must not push a report.
      expect(await medianOracle.reportCount()).to.equal(0)
    })
  })

  describe('purgeReports', () => {
    it('passes the purge through to the median oracle', async () => {
      const { oracle, medianOracle } = await loadFixture(fixture)
      await oracle.purgeReports()
      expect(await medianOracle.purgeCount()).to.equal(1)
    })

    it('is restricted to the owner', async () => {
      const { oracle } = await loadFixture(fixture)
      const [, stranger] = await ethers.getSigners()
      await expect(oracle.connect(stranger).purgeReports()).to.be.reverted
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
          ethers.constants.AddressZero,
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
