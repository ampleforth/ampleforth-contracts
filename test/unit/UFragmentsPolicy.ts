import { ethers, upgrades, waffle } from 'hardhat'
import { Contract, Signer, BigNumber, BigNumberish, Event } from 'ethers'
import { TransactionResponse } from '@ethersproject/providers'
import { expect } from 'chai'
import { Result } from 'ethers/lib/utils'
import { imul, increaseTime } from '../utils/utils'

let uFragmentsPolicy: Contract,
  mockUFragments: Contract,
  mockMarketOracle: Contract,
  mockCpiOracle: Contract
let prevEpoch: BigNumber, prevTime: BigNumber
let deployer: Signer, user: Signer, orchestrator: Signer

const MAX_RATE = ethers.utils.parseUnits('1', 24)
const MAX_SUPPLY = ethers.BigNumber.from(2).pow(255).sub(1).div(MAX_RATE)
const BASE_CPI = ethers.utils.parseUnits('1', 20)
const INITIAL_CPI = ethers.utils.parseUnits('251.712', 18)

const INITIAL_CPI_25P_MORE = imul(INITIAL_CPI, '1.25', 1)
const INITIAL_CPI_25P_LESS = imul(INITIAL_CPI, '0.77', 1)
const INITIAL_RATE = imul(INITIAL_CPI, 1e18, BASE_CPI)
const INITIAL_RATE_30P_MORE = imul(INITIAL_RATE, '1.3', 1)
const INITIAL_RATE_30P_LESS = imul(INITIAL_RATE, '0.7', 1)
const INITIAL_RATE_5P_MORE = imul(INITIAL_RATE, '1.05', 1)
const INITIAL_RATE_5P_LESS = imul(INITIAL_RATE, '0.95', 1)
const INITIAL_RATE_60P_MORE = imul(INITIAL_RATE, '1.6', 1)
const INITIAL_RATE_2X = INITIAL_RATE.mul(2)

async function mockedUpgradablePolicy() {
  // get signers
  const [deployer, user, orchestrator] = await ethers.getSigners()
  // deploy mocks
  const mockUFragments = await (
    await ethers.getContractFactory('MockUFragments')
  )
    .connect(deployer)
    .deploy()
  const mockMarketOracle = await (await ethers.getContractFactory('MockOracle'))
    .connect(deployer)
    .deploy('MarketOracle')
  const mockCpiOracle = await (await ethers.getContractFactory('MockOracle'))
    .connect(deployer)
    .deploy('CpiOracle')
  // deploy upgradable contract
  const uFragmentsPolicy = await upgrades.deployProxy(
    (await ethers.getContractFactory('UFragmentsPolicy')).connect(deployer),
    [await deployer.getAddress(), mockUFragments.address, BASE_CPI.toString()],
    {
      initializer: 'initialize(address,address,uint256)',
    },
  )
  // setup oracles
  await uFragmentsPolicy
    .connect(deployer)
    .setMarketOracle(mockMarketOracle.address)
  await uFragmentsPolicy.connect(deployer).setCpiOracle(mockCpiOracle.address)
  await uFragmentsPolicy
    .connect(deployer)
    .setOrchestrator(await orchestrator.getAddress())
  // return entities
  return {
    deployer,
    user,
    orchestrator,
    mockUFragments,
    mockMarketOracle,
    mockCpiOracle,
    uFragmentsPolicy,
  }
}

async function mockedUpgradablePolicyWithOpenRebaseWindow() {
  const {
    deployer,
    user,
    orchestrator,
    mockUFragments,
    mockMarketOracle,
    mockCpiOracle,
    uFragmentsPolicy,
  } = await mockedUpgradablePolicy()
  await uFragmentsPolicy.connect(deployer).setRebaseTimingParameters(60, 0, 60)
  return {
    deployer,
    user,
    orchestrator,
    mockUFragments,
    mockMarketOracle,
    mockCpiOracle,
    uFragmentsPolicy,
  }
}

async function mockExternalData(
  rate: BigNumberish,
  cpi: BigNumberish,
  uFragSupply: BigNumberish,
  rateValidity = true,
  cpiValidity = true,
) {
  await mockMarketOracle.connect(deployer).storeData(rate)
  await mockMarketOracle.connect(deployer).storeValidity(rateValidity)
  await mockCpiOracle.connect(deployer).storeData(cpi)
  await mockCpiOracle.connect(deployer).storeValidity(cpiValidity)
  await mockUFragments.connect(deployer).storeSupply(uFragSupply)
}

async function parseRebaseLog(response: Promise<TransactionResponse>) {
  const receipt = (await (await response).wait()) as any
  const logs = receipt.events.filter(
    (event: Event) => event.event === 'LogRebase',
  )
  return logs[0].args
}

describe('UFragmentsPolicy', function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
  })

  it('should reject any ether sent to it', async function () {
    await expect(
      user.sendTransaction({ to: uFragmentsPolicy.address, value: 1 }),
    ).to.be.reverted
  })
})

describe('UFragmentsPolicy:initialize', async function () {
  describe('initial values set correctly', function () {
    before('setup UFragmentsPolicy contract', async () => {
      ;({
        deployer,
        user,
        orchestrator,
        mockUFragments,
        mockMarketOracle,
        mockCpiOracle,
        uFragmentsPolicy,
      } = await waffle.loadFixture(mockedUpgradablePolicy))
    })

    it('deviationThreshold', async function () {
      expect(await uFragmentsPolicy.deviationThreshold()).to.eq(
        ethers.utils.parseUnits('5', 16),
      )
    })
    it('rebaseLag', async function () {
      expect(await uFragmentsPolicy.rebaseLag()).to.eq(30)
    })
    it('minRebaseTimeIntervalSec', async function () {
      expect(await uFragmentsPolicy.minRebaseTimeIntervalSec()).to.eq(
        24 * 60 * 60,
      )
    })
    it('epoch', async function () {
      expect(await uFragmentsPolicy.epoch()).to.eq(0)
    })
    it('globalAmpleforthEpochAndAMPLSupply', async function () {
      const r = await uFragmentsPolicy.globalAmpleforthEpochAndAMPLSupply()
      expect(r[0]).to.eq(0)
      expect(r[1]).to.eq(0)
    })
    it('rebaseWindowOffsetSec', async function () {
      expect(await uFragmentsPolicy.rebaseWindowOffsetSec()).to.eq(72000)
    })
    it('rebaseWindowLengthSec', async function () {
      expect(await uFragmentsPolicy.rebaseWindowLengthSec()).to.eq(900)
    })
    it('should set owner', async function () {
      expect(await uFragmentsPolicy.owner()).to.eq(await deployer.getAddress())
    })
    it('should set reference to uFragments', async function () {
      expect(await uFragmentsPolicy.uFrags()).to.eq(mockUFragments.address)
    })
  })
})

describe('UFragmentsPolicy:setMarketOracle', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
  })

  it('should set marketOracle', async function () {
    await uFragmentsPolicy
      .connect(deployer)
      .setMarketOracle(await deployer.getAddress())
    expect(await uFragmentsPolicy.marketOracle()).to.eq(
      await deployer.getAddress(),
    )
  })
})

describe('UFragments:setMarketOracle:accessControl', function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
  })

  it('should be callable by owner', async function () {
    await expect(
      uFragmentsPolicy
        .connect(deployer)
        .setMarketOracle(await deployer.getAddress()),
    ).to.not.be.reverted
  })

  it('should NOT be callable by non-owner', async function () {
    await expect(
      uFragmentsPolicy
        .connect(user)
        .setMarketOracle(await deployer.getAddress()),
    ).to.be.reverted
  })
})

describe('UFragmentsPolicy:setCpiOracle', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
  })

  it('should set cpiOracle', async function () {
    await uFragmentsPolicy
      .connect(deployer)
      .setCpiOracle(await deployer.getAddress())
    expect(await uFragmentsPolicy.cpiOracle()).to.eq(
      await deployer.getAddress(),
    )
  })
})

describe('UFragments:setCpiOracle:accessControl', function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
  })

  it('should be callable by owner', async function () {
    await expect(
      uFragmentsPolicy
        .connect(deployer)
        .setCpiOracle(await deployer.getAddress()),
    ).to.not.be.reverted
  })

  it('should NOT be callable by non-owner', async function () {
    await expect(
      uFragmentsPolicy.connect(user).setCpiOracle(await deployer.getAddress()),
    ).to.be.reverted
  })
})

describe('UFragmentsPolicy:setOrchestrator', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
  })

  it('should set orchestrator', async function () {
    await uFragmentsPolicy
      .connect(deployer)
      .setOrchestrator(await user.getAddress())
    expect(await uFragmentsPolicy.orchestrator()).to.eq(await user.getAddress())
  })
})

describe('UFragments:setOrchestrator:accessControl', function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
  })

  it('should be callable by owner', async function () {
    await expect(
      uFragmentsPolicy
        .connect(deployer)
        .setOrchestrator(await deployer.getAddress()),
    ).to.not.be.reverted
  })

  it('should NOT be callable by non-owner', async function () {
    await expect(
      uFragmentsPolicy
        .connect(user)
        .setOrchestrator(await deployer.getAddress()),
    ).to.be.reverted
  })
})

describe('UFragmentsPolicy:setDeviationThreshold', async function () {
  let prevThreshold: BigNumber, threshold: BigNumber
  before('setup UFragmentsPolicy contract', async function () {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
    prevThreshold = await uFragmentsPolicy.deviationThreshold()
    threshold = prevThreshold.add(ethers.utils.parseUnits('1', 16))
    await uFragmentsPolicy.connect(deployer).setDeviationThreshold(threshold)
  })

  it('should set deviationThreshold', async function () {
    expect(await uFragmentsPolicy.deviationThreshold()).to.eq(threshold)
  })
})

describe('UFragments:setDeviationThreshold:accessControl', function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
  })

  it('should be callable by owner', async function () {
    await expect(uFragmentsPolicy.connect(deployer).setDeviationThreshold(0)).to
      .not.be.reverted
  })

  it('should NOT be callable by non-owner', async function () {
    await expect(uFragmentsPolicy.connect(user).setDeviationThreshold(0)).to.be
      .reverted
  })
})

describe('UFragmentsPolicy:setRebaseLag', async function () {
  let prevLag: BigNumber
  before('setup UFragmentsPolicy contract', async function () {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
    prevLag = await uFragmentsPolicy.rebaseLag()
  })

  describe('when rebaseLag is more than 0', async function () {
    it('should setRebaseLag', async function () {
      const lag = prevLag.add(1)
      await uFragmentsPolicy.connect(deployer).setRebaseLag(lag)
      expect(await uFragmentsPolicy.rebaseLag()).to.eq(lag)
    })
  })

  describe('when rebaseLag is 0', async function () {
    it('should fail', async function () {
      await expect(uFragmentsPolicy.connect(deployer).setRebaseLag(0)).to.be
        .reverted
    })
  })
})

describe('UFragments:setRebaseLag:accessControl', function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
  })

  it('should be callable by owner', async function () {
    await expect(uFragmentsPolicy.connect(deployer).setRebaseLag(1)).to.not.be
      .reverted
  })

  it('should NOT be callable by non-owner', async function () {
    await expect(uFragmentsPolicy.connect(user).setRebaseLag(1)).to.be.reverted
  })
})

describe('UFragmentsPolicy:setRebaseTimingParameters', async function () {
  before('setup UFragmentsPolicy contract', async function () {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
  })

  describe('when interval=0', function () {
    it('should fail', async function () {
      await expect(
        uFragmentsPolicy.connect(deployer).setRebaseTimingParameters(0, 0, 0),
      ).to.be.reverted
    })
  })

  describe('when offset > interval', function () {
    it('should fail', async function () {
      await expect(
        uFragmentsPolicy
          .connect(deployer)
          .setRebaseTimingParameters(300, 3600, 300),
      ).to.be.reverted
    })
  })

  describe('when params are valid', function () {
    it('should setRebaseTimingParameters', async function () {
      await uFragmentsPolicy
        .connect(deployer)
        .setRebaseTimingParameters(600, 60, 300)
      expect(await uFragmentsPolicy.minRebaseTimeIntervalSec()).to.eq(600)
      expect(await uFragmentsPolicy.rebaseWindowOffsetSec()).to.eq(60)
      expect(await uFragmentsPolicy.rebaseWindowLengthSec()).to.eq(300)
    })
  })
})

describe('UFragments:setRebaseTimingParameters:accessControl', function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
  })

  it('should be callable by owner', async function () {
    await expect(
      uFragmentsPolicy
        .connect(deployer)
        .setRebaseTimingParameters(600, 60, 300),
    ).to.not.be.reverted
  })

  it('should NOT be callable by non-owner', async function () {
    await expect(
      uFragmentsPolicy.connect(user).setRebaseTimingParameters(600, 60, 300),
    ).to.be.reverted
  })
})

describe('UFragmentsPolicy:Rebase:accessControl', async function () {
  beforeEach('setup UFragmentsPolicy contract', async function () {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
    // await setupContractsWithOpenRebaseWindow()
    await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_CPI, 1000, true)
    await increaseTime(60)
  })

  describe('when rebase called by orchestrator', function () {
    it('should succeed', async function () {
      await expect(uFragmentsPolicy.connect(orchestrator).rebase()).to.not.be
        .reverted
    })
  })

  describe('when rebase called by non-orchestrator', function () {
    it('should fail', async function () {
      await expect(uFragmentsPolicy.connect(user).rebase()).to.be.reverted
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
  })

  describe('when minRebaseTimeIntervalSec has NOT passed since the previous rebase', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_CPI, 1010)
      await increaseTime(60)
      await uFragmentsPolicy.connect(orchestrator).rebase()
    })

    it('should fail', async function () {
      await expect(uFragmentsPolicy.connect(orchestrator).rebase()).to.be
        .reverted
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,

      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
  })

  describe('when rate is within deviationThreshold', function () {
    before(async function () {
      await uFragmentsPolicy
        .connect(deployer)
        .setRebaseTimingParameters(60, 0, 60)
    })

    it('should return 0', async function () {
      await mockExternalData(INITIAL_RATE.sub(1), INITIAL_CPI, 1000)
      await increaseTime(60)
      expect(
        (await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase()))
          .requestedSupplyAdjustment,
      ).to.eq(0)
      await increaseTime(60)

      await mockExternalData(INITIAL_RATE.add(1), INITIAL_CPI, 1000)
      expect(
        (await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase()))
          .requestedSupplyAdjustment,
      ).to.eq(0)
      await increaseTime(60)

      await mockExternalData(INITIAL_RATE_5P_MORE.sub(2), INITIAL_CPI, 1000)
      expect(
        (await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase()))
          .requestedSupplyAdjustment,
      ).to.eq(0)
      await increaseTime(60)

      await mockExternalData(INITIAL_RATE_5P_LESS.add(2), INITIAL_CPI, 1000)
      expect(
        (await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase()))
          .requestedSupplyAdjustment,
      ).to.eq(0)
      await increaseTime(60)
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
  })

  describe('when rate is more than MAX_RATE', function () {
    it('should return same supply delta as delta for MAX_RATE', async function () {
      // Any exchangeRate >= (MAX_RATE=100x) would result in the same supply increase
      await mockExternalData(MAX_RATE, INITIAL_CPI, 1000)
      await increaseTime(60)

      const supplyChange = (
        await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase())
      ).requestedSupplyAdjustment

      await increaseTime(60)

      await mockExternalData(
        MAX_RATE.add(ethers.utils.parseUnits('1', 17)),
        INITIAL_CPI,
        1000,
      )
      expect(
        (await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase()))
          .requestedSupplyAdjustment,
      ).to.eq(supplyChange)

      await increaseTime(60)

      await mockExternalData(MAX_RATE.mul(2), INITIAL_CPI, 1000)
      expect(
        (await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase()))
          .requestedSupplyAdjustment,
      ).to.eq(supplyChange)
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
  })

  describe('when uFragments grows beyond MAX_SUPPLY', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_2X, INITIAL_CPI, MAX_SUPPLY.sub(1))
      await increaseTime(60)
    })

    it('should apply SupplyAdjustment {MAX_SUPPLY - totalSupply}', async function () {
      // Supply is MAX_SUPPLY-1, exchangeRate is 2x; resulting in a new supply more than MAX_SUPPLY
      // However, supply is ONLY increased by 1 to MAX_SUPPLY
      expect(
        (await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase()))
          .requestedSupplyAdjustment,
      ).to.eq(1)
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
  })

  describe('when uFragments supply equals MAX_SUPPLY and rebase attempts to grow', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_2X, INITIAL_CPI, MAX_SUPPLY)
      await increaseTime(60)
    })

    it('should not grow', async function () {
      expect(
        (await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase()))
          .requestedSupplyAdjustment,
      ).to.eq(0)
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
  })

  describe('when the market oracle returns invalid data', function () {
    it('should fail', async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_CPI, 1000, false)
      await increaseTime(60)
      await expect(uFragmentsPolicy.connect(orchestrator).rebase()).to.be
        .reverted
    })
  })

  describe('when the market oracle returns valid data', function () {
    it('should NOT fail', async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_CPI, 1000, true)
      await increaseTime(60)
      await expect(uFragmentsPolicy.connect(orchestrator).rebase()).to.not.be
        .reverted
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
  })

  describe('when the cpi oracle returns invalid data', function () {
    it('should fail', async function () {
      await mockExternalData(
        INITIAL_RATE_30P_MORE,
        INITIAL_CPI,
        1000,
        true,
        false,
      )
      await increaseTime(60)
      await expect(uFragmentsPolicy.connect(orchestrator).rebase()).to.be
        .reverted
    })
  })

  describe('when the cpi oracle returns valid data', function () {
    it('should NOT fail', async function () {
      await mockExternalData(
        INITIAL_RATE_30P_MORE,
        INITIAL_CPI,
        1000,
        true,
        true,
      )
      await increaseTime(60)
      await expect(uFragmentsPolicy.connect(orchestrator).rebase()).to.not.be
        .reverted
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
  })

  describe('positive rate and no change CPI', function () {
    beforeEach(async function () {
      await mockExternalData(INITIAL_RATE_30P_MORE, INITIAL_CPI, 1000)
      await uFragmentsPolicy
        .connect(deployer)
        .setRebaseTimingParameters(60, 0, 60)
      await increaseTime(60)
      await uFragmentsPolicy.connect(orchestrator).rebase()
      prevEpoch = await uFragmentsPolicy.epoch()
      prevTime = await uFragmentsPolicy.lastRebaseTimestampSec()
      await mockExternalData(INITIAL_RATE_60P_MORE, INITIAL_CPI, 1010)
      await increaseTime(60)
    })

    it('should increment epoch', async function () {
      await uFragmentsPolicy.connect(orchestrator).rebase()
      expect(await uFragmentsPolicy.epoch()).to.eq(prevEpoch.add(1))
    })

    it('should update globalAmpleforthEpochAndAMPLSupply', async function () {
      await uFragmentsPolicy.connect(orchestrator).rebase()
      const r = await uFragmentsPolicy.globalAmpleforthEpochAndAMPLSupply()
      expect(r[0]).to.eq(prevEpoch.add(1))
      expect(r[1]).to.eq('1010')
    })

    it('should update lastRebaseTimestamp', async function () {
      await uFragmentsPolicy.connect(orchestrator).rebase()
      const time = await uFragmentsPolicy.lastRebaseTimestampSec()
      expect(time.sub(prevTime)).to.gte(60)
    })

    it('should emit Rebase with positive requestedSupplyAdjustment', async function () {
      const r = uFragmentsPolicy.connect(orchestrator).rebase()
      await expect(r)
        .to.emit(uFragmentsPolicy, 'LogRebase')
        .withArgs(
          prevEpoch.add(1),
          INITIAL_RATE_60P_MORE,
          INITIAL_CPI,
          20,
          (
            await parseRebaseLog(r)
          ).timestampSec,
        )
    })

    it('should call getData from the market oracle', async function () {
      await expect(uFragmentsPolicy.connect(orchestrator).rebase())
        .to.emit(mockMarketOracle, 'FunctionCalled')
        .withArgs('MarketOracle', 'getData', uFragmentsPolicy.address)
    })

    it('should call getData from the cpi oracle', async function () {
      await expect(uFragmentsPolicy.connect(orchestrator).rebase())
        .to.emit(mockCpiOracle, 'FunctionCalled')
        .withArgs('CpiOracle', 'getData', uFragmentsPolicy.address)
    })

    it('should call uFrag Rebase', async function () {
      const r = uFragmentsPolicy.connect(orchestrator).rebase()
      await expect(r)
        .to.emit(mockUFragments, 'FunctionCalled')
        .withArgs('UFragments', 'rebase', uFragmentsPolicy.address)
      await expect(r)
        .to.emit(mockUFragments, 'FunctionArguments')
        .withArgs([prevEpoch.add(1)], [20])
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
  })

  describe('negative rate', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE_30P_LESS, INITIAL_CPI, 1000)
      await increaseTime(60)
    })

    it('should emit Rebase with negative requestedSupplyAdjustment', async function () {
      expect(
        (await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase()))
          .requestedSupplyAdjustment,
      ).to.eq(-10)
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
  })

  describe('when cpi increases', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE, INITIAL_CPI_25P_MORE, 1000)
      await increaseTime(60)
      await uFragmentsPolicy.connect(deployer).setDeviationThreshold(0)
    })

    it('should emit Rebase with negative requestedSupplyAdjustment', async function () {
      expect(
        (await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase()))
          .requestedSupplyAdjustment,
      ).to.eq(-6)
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
  })

  describe('when cpi decreases', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE, INITIAL_CPI_25P_LESS, 1000)
      await increaseTime(60)
      await uFragmentsPolicy.connect(deployer).setDeviationThreshold(0)
    })

    it('should emit Rebase with positive requestedSupplyAdjustment', async function () {
      expect(
        (await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase()))
          .requestedSupplyAdjustment,
      ).to.eq(9)
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  before('setup UFragmentsPolicy contract', async () => {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicyWithOpenRebaseWindow))
  })

  describe('rate=TARGET_RATE', function () {
    before(async function () {
      await mockExternalData(INITIAL_RATE, INITIAL_CPI, 1000)
      await uFragmentsPolicy.connect(deployer).setDeviationThreshold(0)
      await increaseTime(60)
    })

    it('should emit Rebase with 0 requestedSupplyAdjustment', async function () {
      expect(
        (await parseRebaseLog(uFragmentsPolicy.connect(orchestrator).rebase()))
          .requestedSupplyAdjustment,
      ).to.eq(0)
    })
  })
})

describe('UFragmentsPolicy:Rebase', async function () {
  let rbTime: BigNumber,
    rbWindow: BigNumber,
    minRebaseTimeIntervalSec: BigNumber,
    now: BigNumber,
    nextRebaseWindowOpenTime: BigNumber,
    timeToWait: BigNumber,
    lastRebaseTimestamp: BigNumber

  beforeEach('setup UFragmentsPolicy contract', async function () {
    ;({
      deployer,
      user,
      orchestrator,
      mockUFragments,
      mockMarketOracle,
      mockCpiOracle,
      uFragmentsPolicy,
    } = await waffle.loadFixture(mockedUpgradablePolicy))
    await uFragmentsPolicy
      .connect(deployer)
      .setRebaseTimingParameters(86400, 72000, 900)
    await mockExternalData(INITIAL_RATE, INITIAL_CPI, 1000)
    rbTime = await uFragmentsPolicy.rebaseWindowOffsetSec()
    rbWindow = await uFragmentsPolicy.rebaseWindowLengthSec()
    minRebaseTimeIntervalSec = await uFragmentsPolicy.minRebaseTimeIntervalSec()
    now = ethers.BigNumber.from(
      (await ethers.provider.getBlock('latest')).timestamp,
    )
    nextRebaseWindowOpenTime = now
      .sub(now.mod(minRebaseTimeIntervalSec))
      .add(rbTime)
      .add(minRebaseTimeIntervalSec)
  })

  describe('when its 5s after the rebase window closes', function () {
    it('should fail', async function () {
      timeToWait = nextRebaseWindowOpenTime.sub(now).add(rbWindow).add(5)
      await increaseTime(timeToWait)
      expect(await uFragmentsPolicy.inRebaseWindow()).to.be.false
      await expect(uFragmentsPolicy.connect(orchestrator).rebase()).to.be
        .reverted
    })
  })

  describe('when its 5s before the rebase window opens', function () {
    it('should fail', async function () {
      timeToWait = nextRebaseWindowOpenTime.sub(now).sub(5)
      await increaseTime(timeToWait)
      expect(await uFragmentsPolicy.inRebaseWindow()).to.be.false
      await expect(uFragmentsPolicy.connect(orchestrator).rebase()).to.be
        .reverted
    })
  })

  describe('when its 5s after the rebase window opens', function () {
    it('should NOT fail', async function () {
      timeToWait = nextRebaseWindowOpenTime.sub(now).add(5)
      await increaseTime(timeToWait)
      expect(await uFragmentsPolicy.inRebaseWindow()).to.be.true
      await expect(uFragmentsPolicy.connect(orchestrator).rebase()).to.not.be
        .reverted
      lastRebaseTimestamp = await uFragmentsPolicy.lastRebaseTimestampSec()
      expect(lastRebaseTimestamp).to.eq(nextRebaseWindowOpenTime)
    })
  })

  describe('when its 5s before the rebase window closes', function () {
    it('should NOT fail', async function () {
      timeToWait = nextRebaseWindowOpenTime.sub(now).add(rbWindow).sub(5)
      await increaseTime(timeToWait)
      expect(await uFragmentsPolicy.inRebaseWindow()).to.be.true
      await expect(uFragmentsPolicy.connect(orchestrator).rebase()).to.not.be
        .reverted
      lastRebaseTimestamp = await uFragmentsPolicy.lastRebaseTimestampSec.call()
      expect(lastRebaseTimestamp).to.eq(nextRebaseWindowOpenTime)
    })
  })
})
