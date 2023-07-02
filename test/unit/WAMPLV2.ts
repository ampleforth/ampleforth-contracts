import { ethers, upgrades } from 'hardhat'
import { Contract, Signer, BigNumber, BigNumberish } from 'ethers'
import { expect } from 'chai'

const AMPL_DECIMALS = 9
const DECIMALS = 18
const NAME = 'Wrapped Ample V2'
const SYMBOL = 'WAMPL'

const toWAMPLFixedPt = (a: string): BigNumber =>
  ethers.utils.parseUnits(a, DECIMALS)

const toAMPLFixedPt = (a: string): BigNumber =>
  ethers.utils.parseUnits(a, AMPL_DECIMALS)

let accounts: Signer[],
  deployer: Signer,
  deployerAddress: string,
  userA: Signer,
  userAAddress: string,
  userB: Signer,
  userBAddress: string,
  userC: Signer,
  userCAddress: string,
  ampl: Contract,
  wAMPL: Contract,
  balanceBefore: BigNumber,
  balanceAfter: BigNumber

async function setupContracts() {
  accounts = await ethers.getSigners()
  deployer = accounts[0]
  userA = accounts[1]
  userB = accounts[2]
  userC = accounts[3]

  deployerAddress = await deployer.getAddress()
  userAAddress = await userA.getAddress()
  userBAddress = await userB.getAddress()
  userCAddress = await userC.getAddress()

  const amplFactory = await ethers.getContractFactory('UFragments')
  ampl = await upgrades.deployProxy(amplFactory, [deployerAddress], {
    initializer: 'initialize(address)',
  })
  await ampl.setMonetaryPolicy(deployerAddress)

  const wAMPLFactory = await ethers.getContractFactory('WAMPLV2')
  wAMPL = await wAMPLFactory.connect(deployer).deploy()
  await wAMPL.init(NAME, SYMBOL, ampl.address)
}

describe.only('WAMPLV2', () => {
  before('setup WAMPL contract', setupContracts)

  it('should reject any ether sent to it', async function () {
    const user = accounts[1]
    await expect(user.sendTransaction({ to: wAMPL.address, value: 1 })).to.be
      .reverted
  })
})

describe.only('WAMPLV2:Initialization', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  it('should set the underlying reference', async function () {
    expect(await wAMPL.asset()).to.eq(ampl.address)
  })

  it('should set detailed erc20 info parameters', async function () {
    expect(await wAMPL.name()).to.eq(NAME)
    expect(await wAMPL.symbol()).to.eq(SYMBOL)
    expect(await wAMPL.decimals()).to.eq(18)
  })

  it('should set the erc20 balance and supply', async function () {
    expect(await wAMPL.totalSupply()).to.eq('0')
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq('0')
  })

  it('should set the return the asset balance and conversions', async function () {
    expect(await wAMPL.totalAssets()).to.eq('0')
    expect(await wAMPL.assetBalanceOf(await deployer.getAddress())).to.eq('0')
    expect(await wAMPL.previewDeposit(toAMPLFixedPt('500000'))).to.eq(
      toWAMPLFixedPt('100000'),
    )
    expect(await wAMPL.previewMint(toWAMPLFixedPt('100000'))).to.eq(
      toAMPLFixedPt('500000'),
    )
    expect(await wAMPL.previewWithdraw(toAMPLFixedPt('500000'))).to.eq(
      toWAMPLFixedPt('100000'),
    )
    expect(await wAMPL.previewRedeem(toWAMPLFixedPt('100000'))).to.eq(
      toAMPLFixedPt('500000'),
    )
  })
})

describe.only('Underlying Rebase:Expansion', async function () {
  beforeEach('setup WAMPL contract', setupContracts)

  beforeEach(async function () {
    await ampl
      .connect(deployer)
      .transfer(userAAddress, toAMPLFixedPt('1000000'))
    await ampl
      .connect(deployer)
      .transfer(userBAddress, toAMPLFixedPt('1000000'))
    await ampl
      .connect(deployer)
      .transfer(userCAddress, toAMPLFixedPt('1000000'))

    await ampl.connect(userA).approve(wAMPL.address, toAMPLFixedPt('100000'))
    await ampl.connect(userB).approve(wAMPL.address, toAMPLFixedPt('200000'))
    await ampl.connect(userC).approve(wAMPL.address, toAMPLFixedPt('300000'))

    await wAMPL
      .connect(userA)
      .deposit(toAMPLFixedPt('100000'), await userA.getAddress())
    await wAMPL
      .connect(userB)
      .deposit(toAMPLFixedPt('200000'), await userB.getAddress())
    await wAMPL
      .connect(userC)
      .deposit(toAMPLFixedPt('300000'), await userC.getAddress())
  })

  it('should update accounting accurately', async function () {
    expect(await wAMPL.totalAssets()).to.eq(toAMPLFixedPt('600000'))
    expect(await wAMPL.assetBalanceOf(userAAddress)).to.eq(
      toAMPLFixedPt('100000'),
    )
    expect(await wAMPL.assetBalanceOf(userBAddress)).to.eq(
      toAMPLFixedPt('200000'),
    )
    expect(await wAMPL.assetBalanceOf(userCAddress)).to.eq(
      toAMPLFixedPt('300000'),
    )

    expect(await wAMPL.totalSupply()).to.eq(toWAMPLFixedPt('120000'))
    expect(await wAMPL.balanceOf(userAAddress)).to.eq(toWAMPLFixedPt('20000'))
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(toWAMPLFixedPt('40000'))
    expect(await wAMPL.balanceOf(userCAddress)).to.eq(toWAMPLFixedPt('60000'))

    // supply increases by 100%
    await ampl.rebase('1', toAMPLFixedPt('50000000'))

    expect(await wAMPL.totalAssets()).to.eq(toAMPLFixedPt('1200000'))
    expect(await wAMPL.assetBalanceOf(userAAddress)).to.eq(
      toAMPLFixedPt('200000'),
    )
    expect(await wAMPL.assetBalanceOf(userBAddress)).to.eq(
      toAMPLFixedPt('400000'),
    )
    expect(await wAMPL.assetBalanceOf(userCAddress)).to.eq(
      toAMPLFixedPt('600000'),
    )

    expect(await wAMPL.totalSupply()).to.eq(toWAMPLFixedPt('120000'))
    expect(await wAMPL.balanceOf(userAAddress)).to.eq(toWAMPLFixedPt('20000'))
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(toWAMPLFixedPt('40000'))
    expect(await wAMPL.balanceOf(userCAddress)).to.eq(toWAMPLFixedPt('60000'))
  })
})

describe.only('Underlying Rebase:Contraction', async function () {
  beforeEach('setup WAMPL contract', setupContracts)

  beforeEach(async function () {
    await ampl
      .connect(deployer)
      .transfer(userAAddress, toAMPLFixedPt('1000000'))
    await ampl
      .connect(deployer)
      .transfer(userBAddress, toAMPLFixedPt('1000000'))
    await ampl
      .connect(deployer)
      .transfer(userCAddress, toAMPLFixedPt('1000000'))

    await ampl.connect(userA).approve(wAMPL.address, toAMPLFixedPt('100000'))
    await ampl.connect(userB).approve(wAMPL.address, toAMPLFixedPt('200000'))
    await ampl.connect(userC).approve(wAMPL.address, toAMPLFixedPt('300000'))

    await wAMPL
      .connect(userA)
      .deposit(toAMPLFixedPt('100000'), await userA.getAddress())
    await wAMPL
      .connect(userB)
      .deposit(toAMPLFixedPt('200000'), await userB.getAddress())
    await wAMPL
      .connect(userC)
      .deposit(toAMPLFixedPt('300000'), await userC.getAddress())
  })

  it('should update accounting accurately', async function () {
    expect(await wAMPL.totalAssets()).to.eq(toAMPLFixedPt('600000'))
    expect(await wAMPL.assetBalanceOf(userAAddress)).to.eq(
      toAMPLFixedPt('100000'),
    )
    expect(await wAMPL.assetBalanceOf(userBAddress)).to.eq(
      toAMPLFixedPt('200000'),
    )
    expect(await wAMPL.assetBalanceOf(userCAddress)).to.eq(
      toAMPLFixedPt('300000'),
    )

    expect(await wAMPL.totalSupply()).to.eq(toWAMPLFixedPt('120000'))
    expect(await wAMPL.balanceOf(userAAddress)).to.eq(toWAMPLFixedPt('20000'))
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(toWAMPLFixedPt('40000'))
    expect(await wAMPL.balanceOf(userCAddress)).to.eq(toWAMPLFixedPt('60000'))

    // supply decreases by 50%
    await ampl.rebase('1', toAMPLFixedPt('-25000000'))

    expect(await wAMPL.totalAssets()).to.eq(toAMPLFixedPt('300000'))
    expect(await wAMPL.assetBalanceOf(userAAddress)).to.eq(
      toAMPLFixedPt('50000'),
    )
    expect(await wAMPL.assetBalanceOf(userBAddress)).to.eq(
      toAMPLFixedPt('100000'),
    )
    expect(await wAMPL.assetBalanceOf(userCAddress)).to.eq(
      toAMPLFixedPt('150000'),
    )

    expect(await wAMPL.totalSupply()).to.eq(toWAMPLFixedPt('120000'))
    expect(await wAMPL.balanceOf(userAAddress)).to.eq(toWAMPLFixedPt('20000'))
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(toWAMPLFixedPt('40000'))
    expect(await wAMPL.balanceOf(userCAddress)).to.eq(toWAMPLFixedPt('60000'))
  })
})

describe.only('WAMPLV2:deposit', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any, amplesDeposited: BigNumber, wamplesMinted: BigNumber
  beforeEach(async function () {
    // 1% of AMPL total supply
    amplesDeposited = toAMPLFixedPt('500000')

    // 1% of MAX_WAMPL_SUPPLY
    wamplesMinted = toWAMPLFixedPt('100000')
    expect(await wAMPL.previewDeposit(amplesDeposited)).to.eq(wamplesMinted)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    expect(
      await wAMPL
        .connect(deployer)
        .callStatic.deposit(amplesDeposited, deployerAddress),
    ).to.eq(wamplesMinted)

    balanceBefore = await ampl.balanceOf(deployerAddress)
    r = wAMPL.connect(deployer).deposit(amplesDeposited, deployerAddress)
    await r
    balanceAfter = await ampl.balanceOf(deployerAddress)
  })

  it('should mint wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesDeposited)
    expect(await wAMPL.totalAssets()).to.eq(amplesDeposited)
    expect(await wAMPL.assetBalanceOf(deployerAddress)).to.eq(amplesDeposited)

    expect(await wAMPL.totalSupply()).to.eq(wamplesMinted)
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq(wamplesMinted)
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(deployerAddress, wAMPL.address, amplesDeposited)
    expect(balanceBefore.sub(balanceAfter)).to.eq(amplesDeposited)
  })

  it('should log mint', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(ethers.constants.AddressZero, deployerAddress, wamplesMinted)
  })
})

describe.only('WAMPLV2:depositFor', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any, amplesDeposited: BigNumber, wamplesMinted: BigNumber
  beforeEach(async function () {
    // 1% of AMPL total supply
    amplesDeposited = toAMPLFixedPt('500000')

    // 1% of MAX_WAMPL_SUPPLY
    wamplesMinted = toWAMPLFixedPt('100000')
    expect(await wAMPL.previewDeposit(amplesDeposited)).to.eq(wamplesMinted)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    expect(
      await wAMPL.connect(deployer).callStatic.previewDeposit(amplesDeposited),
    ).to.eq(wamplesMinted)

    balanceBefore = await ampl.balanceOf(deployerAddress)
    r = wAMPL.connect(deployer).deposit(amplesDeposited, userBAddress)
    await r
    balanceAfter = await ampl.balanceOf(deployerAddress)
  })

  it('should mint wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesDeposited)
    expect(await wAMPL.totalAssets()).to.eq(amplesDeposited)
    expect(await wAMPL.assetBalanceOf(userBAddress)).to.eq(amplesDeposited)
    expect(await wAMPL.assetBalanceOf(deployerAddress)).to.eq('0')

    expect(await wAMPL.totalSupply()).to.eq(wamplesMinted)
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(wamplesMinted)
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq('0')
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(deployerAddress, wAMPL.address, amplesDeposited)
    expect(balanceBefore.sub(balanceAfter)).to.eq(amplesDeposited)
  })

  it('should log mint', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(ethers.constants.AddressZero, userBAddress, wamplesMinted)
  })
})

describe.only('WAMPLV2:withdraw', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any,
    amplesWithdrawn: BigNumber,
    amplesRemaining: BigNumber,
    wamplesBurnt: BigNumber,
    wamplesRemaining: BigNumber
  beforeEach(async function () {
    // 2% of AMPL total supply
    const amplesDeposited = toAMPLFixedPt('1000000')

    // 2 % of MAX_WAMPL_SUPPLY
    const wamplesMinted = await wAMPL.previewDeposit(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    await wAMPL.connect(deployer).deposit(amplesDeposited, deployerAddress)

    // 0.5% of AMPL total supply
    amplesWithdrawn = toAMPLFixedPt('250000')

    // 1.5% of AMPL total supply
    amplesRemaining = amplesDeposited.sub(amplesWithdrawn)

    // 0.5% of MAX_WAMPL_SUPPLY
    wamplesBurnt = toWAMPLFixedPt('50000')

    // 1.5% of MAX_WAMPL_SUPPLY
    wamplesRemaining = wamplesMinted.sub(wamplesBurnt)

    expect(await wAMPL.previewWithdraw(amplesWithdrawn)).to.eq(wamplesBurnt)
    expect(
      await wAMPL
        .connect(deployer)
        .callStatic.withdraw(amplesWithdrawn, deployerAddress, deployerAddress),
    ).to.eq(wamplesBurnt)

    balanceBefore = await ampl.balanceOf(deployerAddress)
    r = wAMPL
      .connect(deployer)
      .withdraw(amplesWithdrawn, deployerAddress, deployerAddress)
    await r
    balanceAfter = await ampl.balanceOf(deployerAddress)
  })

  it('should burn wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesRemaining)
    expect(await wAMPL.totalAssets()).to.eq(amplesRemaining)
    expect(await wAMPL.assetBalanceOf(deployerAddress)).to.eq(amplesRemaining)

    expect(await wAMPL.totalSupply()).to.eq(wamplesRemaining)
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq(wamplesRemaining)
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(wAMPL.address, deployerAddress, amplesWithdrawn)
    expect(balanceAfter.sub(balanceBefore)).to.eq(amplesWithdrawn)
  })

  it('should log burn', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(deployerAddress, ethers.constants.AddressZero, wamplesBurnt)
  })
})

describe.only('WAMPLV2:withdrawTo', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any,
    amplesWithdrawn: BigNumber,
    amplesRemaining: BigNumber,
    wamplesBurnt: BigNumber,
    wamplesRemaining: BigNumber
  beforeEach(async function () {
    // 2% of AMPL total supply
    const amplesDeposited = toAMPLFixedPt('1000000')

    // 2 % of MAX_WAMPL_SUPPLY
    const wamplesMinted = await wAMPL.previewDeposit(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    await wAMPL.connect(deployer).deposit(amplesDeposited, deployerAddress)

    // 0.5% of AMPL total supply
    amplesWithdrawn = toAMPLFixedPt('250000')

    // 1.5% of AMPL total supply
    amplesRemaining = amplesDeposited.sub(amplesWithdrawn)

    // 0.5% of MAX_WAMPL_SUPPLY
    wamplesBurnt = toWAMPLFixedPt('50000')

    // 1.5% of MAX_WAMPL_SUPPLY
    wamplesRemaining = wamplesMinted.sub(wamplesBurnt)

    expect(await wAMPL.previewWithdraw(amplesWithdrawn)).to.eq(wamplesBurnt)
    expect(
      await wAMPL
        .connect(deployer)
        .callStatic.withdraw(amplesWithdrawn, userBAddress, deployerAddress),
    ).to.eq(wamplesBurnt)

    balanceBefore = await ampl.balanceOf(userBAddress)
    r = wAMPL
      .connect(deployer)
      .withdraw(amplesWithdrawn, userBAddress, deployerAddress)
    await r
    balanceAfter = await ampl.balanceOf(userBAddress)
  })

  it('should burn wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesRemaining)
    expect(await wAMPL.totalAssets()).to.eq(amplesRemaining)
    expect(await wAMPL.assetBalanceOf(userBAddress)).to.eq('0')
    expect(await wAMPL.assetBalanceOf(deployerAddress)).to.eq(amplesRemaining)

    expect(await wAMPL.totalSupply()).to.eq(wamplesRemaining)
    expect(await wAMPL.balanceOf(userBAddress)).to.eq('0')
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq(wamplesRemaining)
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(wAMPL.address, userBAddress, amplesWithdrawn)
    expect(balanceAfter.sub(balanceBefore)).to.eq(amplesWithdrawn)
  })

  it('should log burn', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(deployerAddress, ethers.constants.AddressZero, wamplesBurnt)
  })
})

describe.only('WAMPLV2:mint', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any, amplesDeposited: BigNumber, wamplesMinted: BigNumber
  beforeEach(async function () {
    // 1% of AMPL total supply
    amplesDeposited = toAMPLFixedPt('500000')

    // 1% of MAX_WAMPL_SUPPLY
    wamplesMinted = toWAMPLFixedPt('100000')
    expect(await wAMPL.previewMint(wamplesMinted)).to.eq(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    expect(
      await wAMPL
        .connect(deployer)
        .callStatic.mint(wamplesMinted, deployerAddress),
    ).to.eq(amplesDeposited)

    balanceBefore = await ampl.balanceOf(deployerAddress)
    r = wAMPL.connect(deployer).mint(wamplesMinted, deployerAddress)
    await r
    balanceAfter = await ampl.balanceOf(deployerAddress)
  })

  it('should mint wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesDeposited)
    expect(await wAMPL.totalAssets()).to.eq(amplesDeposited)
    expect(await wAMPL.assetBalanceOf(deployerAddress)).to.eq(amplesDeposited)

    expect(await wAMPL.totalSupply()).to.eq(wamplesMinted)
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq(wamplesMinted)
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(deployerAddress, wAMPL.address, amplesDeposited)
    expect(balanceBefore.sub(balanceAfter)).to.eq(amplesDeposited)
  })

  it('should log mint', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(ethers.constants.AddressZero, deployerAddress, wamplesMinted)
  })
})

describe.only('WAMPLV2:mintFor', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any, amplesDeposited: BigNumber, wamplesMinted: BigNumber
  beforeEach(async function () {
    // 1% of AMPL total supply
    amplesDeposited = toAMPLFixedPt('500000')

    // 1% of MAX_WAMPL_SUPPLY
    wamplesMinted = toWAMPLFixedPt('100000')
    expect(await wAMPL.previewMint(wamplesMinted)).to.eq(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    expect(
      await wAMPL
        .connect(deployer)
        .callStatic.mint(wamplesMinted, userBAddress),
    ).to.eq(amplesDeposited)

    balanceBefore = await ampl.balanceOf(deployerAddress)
    r = wAMPL.connect(deployer).mint(wamplesMinted, userBAddress)
    await r
    balanceAfter = await ampl.balanceOf(deployerAddress)
  })

  it('should mint wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesDeposited)
    expect(await wAMPL.totalAssets()).to.eq(amplesDeposited)
    expect(await wAMPL.assetBalanceOf(userBAddress)).to.eq(amplesDeposited)
    expect(await wAMPL.assetBalanceOf(deployerAddress)).to.eq('0')

    expect(await wAMPL.totalSupply()).to.eq(wamplesMinted)
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(wamplesMinted)
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq('0')
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(deployerAddress, wAMPL.address, amplesDeposited)
    expect(balanceBefore.sub(balanceAfter)).to.eq(amplesDeposited)
  })

  it('should log mint', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(ethers.constants.AddressZero, userBAddress, wamplesMinted)
  })
})

describe.only('WAMPLV2:redeem', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any,
    amplesWithdrawn: BigNumber,
    amplesRemaining: BigNumber,
    wamplesBurnt: BigNumber,
    wamplesRemaining: BigNumber
  beforeEach(async function () {
    // 2% of AMPL total supply
    const amplesDeposited = toAMPLFixedPt('1000000')

    // 2 % of MAX_WAMPL_SUPPLY
    const wamplesMinted = await wAMPL.previewDeposit(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    await wAMPL.connect(deployer).deposit(amplesDeposited, deployerAddress)

    // 0.5% of AMPL total supply
    amplesWithdrawn = toAMPLFixedPt('250000')

    // 1.5% of AMPL total supply
    amplesRemaining = amplesDeposited.sub(amplesWithdrawn)

    // 0.5% of MAX_WAMPL_SUPPLY
    wamplesBurnt = toWAMPLFixedPt('50000')

    // 1.5% of MAX_WAMPL_SUPPLY
    wamplesRemaining = wamplesMinted.sub(wamplesBurnt)

    expect(await wAMPL.previewRedeem(wamplesBurnt)).to.eq(amplesWithdrawn)
    expect(
      await wAMPL
        .connect(deployer)
        .callStatic.redeem(wamplesBurnt, deployerAddress, deployerAddress),
    ).to.eq(amplesWithdrawn)

    balanceBefore = await ampl.balanceOf(deployerAddress)
    r = wAMPL
      .connect(deployer)
      .redeem(wamplesBurnt, deployerAddress, deployerAddress)
    await r
    balanceAfter = await ampl.balanceOf(deployerAddress)
  })

  it('should redeem wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesRemaining)
    expect(await wAMPL.totalAssets()).to.eq(amplesRemaining)
    expect(await wAMPL.assetBalanceOf(deployerAddress)).to.eq(amplesRemaining)

    expect(await wAMPL.totalSupply()).to.eq(wamplesRemaining)
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq(wamplesRemaining)
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(wAMPL.address, deployerAddress, amplesWithdrawn)
    expect(balanceAfter.sub(balanceBefore)).to.eq(amplesWithdrawn)
  })

  it('should log burn', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(deployerAddress, ethers.constants.AddressZero, wamplesBurnt)
  })
})

describe.only('WAMPLV2:redeemTo', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any,
    amplesWithdrawn: BigNumber,
    amplesRemaining: BigNumber,
    wamplesBurnt: BigNumber,
    wamplesRemaining: BigNumber
  beforeEach(async function () {
    // 2% of AMPL total supply
    const amplesDeposited = toAMPLFixedPt('1000000')

    // 2 % of MAX_WAMPL_SUPPLY
    const wamplesMinted = await wAMPL.previewDeposit(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    await wAMPL.connect(deployer).deposit(amplesDeposited, deployerAddress)

    // 0.5% of AMPL total supply
    amplesWithdrawn = toAMPLFixedPt('250000')

    // 1.5% of AMPL total supply
    amplesRemaining = amplesDeposited.sub(amplesWithdrawn)

    // 0.5% of MAX_WAMPL_SUPPLY
    wamplesBurnt = toWAMPLFixedPt('50000')

    // 1.5% of MAX_WAMPL_SUPPLY
    wamplesRemaining = wamplesMinted.sub(wamplesBurnt)

    expect(await wAMPL.previewRedeem(wamplesBurnt)).to.eq(amplesWithdrawn)
    expect(
      await wAMPL
        .connect(deployer)
        .callStatic.redeem(wamplesBurnt, userBAddress, deployerAddress),
    ).to.eq(amplesWithdrawn)

    balanceBefore = await ampl.balanceOf(userBAddress)
    r = wAMPL
      .connect(deployer)
      .redeem(wamplesBurnt, userBAddress, deployerAddress)
    await r
    balanceAfter = await ampl.balanceOf(userBAddress)
  })

  it('should redeem wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesRemaining)
    expect(await wAMPL.totalAssets()).to.eq(amplesRemaining)
    expect(await wAMPL.assetBalanceOf(userBAddress)).to.eq('0')
    expect(await wAMPL.assetBalanceOf(deployerAddress)).to.eq(amplesRemaining)

    expect(await wAMPL.totalSupply()).to.eq(wamplesRemaining)
    expect(await wAMPL.balanceOf(userBAddress)).to.eq('0')
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq(wamplesRemaining)
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(wAMPL.address, userBAddress, amplesWithdrawn)
    expect(balanceAfter.sub(balanceBefore)).to.eq(amplesWithdrawn)
  })

  it('should log burn', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(deployerAddress, ethers.constants.AddressZero, wamplesBurnt)
  })
})

describe.only('user sends funds to the contract incorrectly', async function () {
  beforeEach('setup WAMPL contract', setupContracts)

  beforeEach(async function () {
    await ampl
      .connect(deployer)
      .transfer(userAAddress, toAMPLFixedPt('1000000'))
    await ampl
      .connect(deployer)
      .transfer(userBAddress, toAMPLFixedPt('1000000'))
    await ampl
      .connect(deployer)
      .transfer(userCAddress, toAMPLFixedPt('1000000'))

    await ampl.connect(userA).approve(wAMPL.address, toAMPLFixedPt('100000'))
    await ampl.connect(userB).approve(wAMPL.address, toAMPLFixedPt('200000'))
    await ampl.connect(userC).approve(wAMPL.address, toAMPLFixedPt('300000'))

    await wAMPL
      .connect(userA)
      .deposit(toAMPLFixedPt('100000'), await userA.getAddress())
    await wAMPL
      .connect(userB)
      .deposit(toAMPLFixedPt('200000'), await userB.getAddress())
    await wAMPL
      .connect(userC)
      .deposit(toAMPLFixedPt('300000'), await userC.getAddress())
  })

  it('should not affect balances', async function () {
    expect(await wAMPL.totalAssets()).to.eq(toAMPLFixedPt('600000'))
    expect(await wAMPL.assetBalanceOf(userAAddress)).to.eq(
      toAMPLFixedPt('100000'),
    )
    expect(await wAMPL.assetBalanceOf(userBAddress)).to.eq(
      toAMPLFixedPt('200000'),
    )
    expect(await wAMPL.assetBalanceOf(userCAddress)).to.eq(
      toAMPLFixedPt('300000'),
    )

    expect(await wAMPL.totalSupply()).to.eq(toWAMPLFixedPt('120000'))
    expect(await wAMPL.balanceOf(userAAddress)).to.eq(toWAMPLFixedPt('20000'))
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(toWAMPLFixedPt('40000'))
    expect(await wAMPL.balanceOf(userCAddress)).to.eq(toWAMPLFixedPt('60000'))

    await ampl.transfer(wAMPL.address, toAMPLFixedPt('300000'))

    expect(await wAMPL.totalAssets()).to.eq(toAMPLFixedPt('900000'))
    expect(await wAMPL.assetBalanceOf(userAAddress)).to.eq(
      toAMPLFixedPt('100000'),
    )
    expect(await wAMPL.assetBalanceOf(userBAddress)).to.eq(
      toAMPLFixedPt('200000'),
    )
    expect(await wAMPL.assetBalanceOf(userCAddress)).to.eq(
      toAMPLFixedPt('300000'),
    )

    expect(await wAMPL.totalSupply()).to.eq(toWAMPLFixedPt('120000'))
    expect(await wAMPL.balanceOf(userAAddress)).to.eq(toWAMPLFixedPt('20000'))
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(toWAMPLFixedPt('40000'))
    expect(await wAMPL.balanceOf(userCAddress)).to.eq(toWAMPLFixedPt('60000'))
  })
})
