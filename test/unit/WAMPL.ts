import { ethers, upgrades } from 'hardhat'
import { Contract, Signer, BigNumber, BigNumberish } from 'ethers'
import { expect } from 'chai'

const AMPL_DECIMALS = 9
const DECIMALS = 18
const NAME = 'Wrapped Ample'
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
  wAMPL: Contract

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

  const wAMPLFactory = await ethers.getContractFactory('WAMPL')
  wAMPL = await wAMPLFactory
    .connect(deployer)
    .deploy(ampl.address, NAME, SYMBOL)
}

describe('WAMPL', () => {
  before('setup WAMPL contract', setupContracts)

  it('should reject any ether sent to it', async function () {
    const user = accounts[1]
    await expect(user.sendTransaction({ to: wAMPL.address, value: 1 })).to.be
      .reverted
  })
})

describe('WAMPL:Initialization', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  it('should set the underlying reference', async function () {
    expect(await wAMPL.underlying()).to.eq(ampl.address)
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

  it('should set the underlying balance and supply', async function () {
    expect(await wAMPL.totalUnderlying()).to.eq('0')
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq('0')
    expect(await wAMPL.underlyingToWrapper(toAMPLFixedPt('500000'))).to.eq(
      toWAMPLFixedPt('100000'),
    )
    expect(await wAMPL.wrapperToUnderlying(toWAMPLFixedPt('100000'))).to.eq(
      toAMPLFixedPt('500000'),
    )
  })
})

describe('WAMPL:deposit', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any, amplesDeposited: BigNumber, wamplesMinted: BigNumber
  beforeEach(async function () {
    // 1% of AMPL total supply
    amplesDeposited = toAMPLFixedPt('500000')

    // 1% of MAX_WAMPL_SUPPLY
    wamplesMinted = toWAMPLFixedPt('100000')
    expect(await wAMPL.underlyingToWrapper(amplesDeposited)).to.eq(
      wamplesMinted,
    )

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    expect(
      await wAMPL.connect(deployer).callStatic.deposit(amplesDeposited),
    ).to.eq(wamplesMinted)

    r = wAMPL.connect(deployer).deposit(amplesDeposited)
    await r
  })

  it('should mint wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesDeposited)
    expect(await wAMPL.totalUnderlying()).to.eq(amplesDeposited)
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq(
      amplesDeposited,
    )

    expect(await wAMPL.totalSupply()).to.eq(wamplesMinted)
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq(wamplesMinted)
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(deployerAddress, wAMPL.address, amplesDeposited)
  })

  it('should log mint', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(ethers.constants.AddressZero, deployerAddress, wamplesMinted)
  })
})

describe('WAMPL:depositFor', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any, amplesDeposited: BigNumber, wamplesMinted: BigNumber
  beforeEach(async function () {
    // 1% of AMPL total supply
    amplesDeposited = toAMPLFixedPt('500000')

    // 1% of MAX_WAMPL_SUPPLY
    wamplesMinted = toWAMPLFixedPt('100000')
    expect(await wAMPL.underlyingToWrapper(amplesDeposited)).to.eq(
      wamplesMinted,
    )

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    expect(
      await wAMPL
        .connect(deployer)
        .callStatic.depositFor(userBAddress, amplesDeposited),
    ).to.eq(wamplesMinted)

    r = wAMPL.connect(deployer).depositFor(userBAddress, amplesDeposited)
    await r
  })

  it('should mint wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesDeposited)
    expect(await wAMPL.totalUnderlying()).to.eq(amplesDeposited)
    expect(await wAMPL.balanceOfUnderlying(userBAddress)).to.eq(amplesDeposited)
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq('0')

    expect(await wAMPL.totalSupply()).to.eq(wamplesMinted)
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(wamplesMinted)
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq('0')
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(deployerAddress, wAMPL.address, amplesDeposited)
  })

  it('should log mint', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(ethers.constants.AddressZero, userBAddress, wamplesMinted)
  })
})

describe('WAMPL:withdraw', () => {
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
    const wamplesMinted = await wAMPL.underlyingToWrapper(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    await wAMPL.connect(deployer).deposit(amplesDeposited)

    // 0.5% of AMPL total supply
    amplesWithdrawn = toAMPLFixedPt('250000')

    // 1.5% of AMPL total supply
    amplesRemaining = amplesDeposited.sub(amplesWithdrawn)

    // 0.5% of MAX_WAMPL_SUPPLY
    wamplesBurnt = toWAMPLFixedPt('50000')

    // 1.5% of MAX_WAMPL_SUPPLY
    wamplesRemaining = wamplesMinted.sub(wamplesBurnt)

    expect(await wAMPL.underlyingToWrapper(amplesWithdrawn)).to.eq(wamplesBurnt)
    expect(
      await wAMPL.connect(deployer).callStatic.withdraw(amplesWithdrawn),
    ).to.eq(wamplesBurnt)

    r = wAMPL.connect(deployer).withdraw(amplesWithdrawn)
    await r
  })

  it('should burn wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesRemaining)
    expect(await wAMPL.totalUnderlying()).to.eq(amplesRemaining)
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq(
      amplesRemaining,
    )

    expect(await wAMPL.totalSupply()).to.eq(wamplesRemaining)
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq(wamplesRemaining)
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(wAMPL.address, deployerAddress, amplesWithdrawn)
  })

  it('should log burn', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(deployerAddress, ethers.constants.AddressZero, wamplesBurnt)
  })
})

describe('WAMPL:withdrawTo', () => {
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
    const wamplesMinted = await wAMPL.underlyingToWrapper(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    await wAMPL.connect(deployer).deposit(amplesDeposited)

    // 0.5% of AMPL total supply
    amplesWithdrawn = toAMPLFixedPt('250000')

    // 1.5% of AMPL total supply
    amplesRemaining = amplesDeposited.sub(amplesWithdrawn)

    // 0.5% of MAX_WAMPL_SUPPLY
    wamplesBurnt = toWAMPLFixedPt('50000')

    // 1.5% of MAX_WAMPL_SUPPLY
    wamplesRemaining = wamplesMinted.sub(wamplesBurnt)

    expect(await wAMPL.underlyingToWrapper(amplesWithdrawn)).to.eq(wamplesBurnt)
    expect(
      await wAMPL
        .connect(deployer)
        .callStatic.withdrawTo(userBAddress, amplesWithdrawn),
    ).to.eq(wamplesBurnt)

    r = wAMPL.connect(deployer).withdrawTo(userBAddress, amplesWithdrawn)
    await r
  })

  it('should burn wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesRemaining)
    expect(await wAMPL.totalUnderlying()).to.eq(amplesRemaining)
    expect(await wAMPL.balanceOfUnderlying(userBAddress)).to.eq('0')
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq(
      amplesRemaining,
    )

    expect(await wAMPL.totalSupply()).to.eq(wamplesRemaining)
    expect(await wAMPL.balanceOf(userBAddress)).to.eq('0')
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq(wamplesRemaining)
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(wAMPL.address, userBAddress, amplesWithdrawn)
  })

  it('should log burn', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(deployerAddress, ethers.constants.AddressZero, wamplesBurnt)
  })
})

describe('WAMPL:withdrawAll', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any, amplesDeposited: BigNumber, wamplesMinted: BigNumber
  beforeEach(async function () {
    // 2% of AMPL total supply
    amplesDeposited = toAMPLFixedPt('1000000')

    // 2 % of MAX_WAMPL_SUPPLY
    wamplesMinted = await wAMPL.underlyingToWrapper(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    await wAMPL.connect(deployer).deposit(amplesDeposited)

    expect(await wAMPL.wrapperToUnderlying(wamplesMinted)).to.eq(
      amplesDeposited,
    )
    expect(await wAMPL.connect(deployer).callStatic.withdrawAll()).to.eq(
      wamplesMinted,
    )

    r = wAMPL.connect(deployer).withdrawAll()
    await r
  })

  it('should burn wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq('0')
    expect(await wAMPL.totalUnderlying()).to.eq('0')
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq('0')

    expect(await wAMPL.totalSupply()).to.eq('0')
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq('0')
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(wAMPL.address, deployerAddress, amplesDeposited)
  })

  it('should log burn', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(deployerAddress, ethers.constants.AddressZero, wamplesMinted)
  })
})

describe('WAMPL:withdrawAllTo', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any, amplesDeposited: BigNumber, wamplesMinted: BigNumber
  beforeEach(async function () {
    // 2% of AMPL total supply
    amplesDeposited = toAMPLFixedPt('1000000')

    // 2 % of MAX_WAMPL_SUPPLY
    wamplesMinted = await wAMPL.underlyingToWrapper(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    await wAMPL.connect(deployer).deposit(amplesDeposited)

    expect(await wAMPL.wrapperToUnderlying(wamplesMinted)).to.eq(
      amplesDeposited,
    )
    expect(
      await wAMPL.connect(deployer).callStatic.withdrawAllTo(userBAddress),
    ).to.eq(wamplesMinted)

    r = wAMPL.connect(deployer).withdrawAllTo(userBAddress)
    await r
  })

  it('should burn wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq('0')
    expect(await wAMPL.totalUnderlying()).to.eq('0')
    expect(await wAMPL.balanceOfUnderlying(userBAddress)).to.eq('0')
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq('0')

    expect(await wAMPL.totalSupply()).to.eq('0')
    expect(await wAMPL.balanceOf(userBAddress)).to.eq('0')
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq('0')
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(wAMPL.address, userBAddress, amplesDeposited)
  })

  it('should log burn', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(deployerAddress, ethers.constants.AddressZero, wamplesMinted)
  })
})

describe('WAMPL:mint', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any, amplesDeposited: BigNumber, wamplesMinted: BigNumber
  beforeEach(async function () {
    // 1% of AMPL total supply
    amplesDeposited = toAMPLFixedPt('500000')

    // 1% of MAX_WAMPL_SUPPLY
    wamplesMinted = toWAMPLFixedPt('100000')
    expect(await wAMPL.wrapperToUnderlying(wamplesMinted)).to.eq(
      amplesDeposited,
    )

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    expect(await wAMPL.connect(deployer).callStatic.mint(wamplesMinted)).to.eq(
      amplesDeposited,
    )

    r = wAMPL.connect(deployer).mint(wamplesMinted)
    await r
  })

  it('should mint wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesDeposited)
    expect(await wAMPL.totalUnderlying()).to.eq(amplesDeposited)
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq(
      amplesDeposited,
    )

    expect(await wAMPL.totalSupply()).to.eq(wamplesMinted)
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq(wamplesMinted)
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(deployerAddress, wAMPL.address, amplesDeposited)
  })

  it('should log mint', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(ethers.constants.AddressZero, deployerAddress, wamplesMinted)
  })
})

describe('WAMPL:mintFor', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any, amplesDeposited: BigNumber, wamplesMinted: BigNumber
  beforeEach(async function () {
    // 1% of AMPL total supply
    amplesDeposited = toAMPLFixedPt('500000')

    // 1% of MAX_WAMPL_SUPPLY
    wamplesMinted = toWAMPLFixedPt('100000')
    expect(await wAMPL.wrapperToUnderlying(wamplesMinted)).to.eq(
      amplesDeposited,
    )

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    expect(
      await wAMPL
        .connect(deployer)
        .callStatic.mintFor(userBAddress, wamplesMinted),
    ).to.eq(amplesDeposited)

    r = wAMPL.connect(deployer).mintFor(userBAddress, wamplesMinted)
    await r
  })

  it('should mint wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesDeposited)
    expect(await wAMPL.totalUnderlying()).to.eq(amplesDeposited)
    expect(await wAMPL.balanceOfUnderlying(userBAddress)).to.eq(amplesDeposited)
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq('0')

    expect(await wAMPL.totalSupply()).to.eq(wamplesMinted)
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(wamplesMinted)
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq('0')
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(deployerAddress, wAMPL.address, amplesDeposited)
  })

  it('should log mint', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(ethers.constants.AddressZero, userBAddress, wamplesMinted)
  })
})

describe('WAMPL:burn', () => {
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
    const wamplesMinted = await wAMPL.underlyingToWrapper(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    await wAMPL.connect(deployer).deposit(amplesDeposited)

    // 0.5% of AMPL total supply
    amplesWithdrawn = toAMPLFixedPt('250000')

    // 1.5% of AMPL total supply
    amplesRemaining = amplesDeposited.sub(amplesWithdrawn)

    // 0.5% of MAX_WAMPL_SUPPLY
    wamplesBurnt = toWAMPLFixedPt('50000')

    // 1.5% of MAX_WAMPL_SUPPLY
    wamplesRemaining = wamplesMinted.sub(wamplesBurnt)

    expect(await wAMPL.wrapperToUnderlying(wamplesBurnt)).to.eq(amplesWithdrawn)
    expect(await wAMPL.connect(deployer).callStatic.burn(wamplesBurnt)).to.eq(
      amplesWithdrawn,
    )

    r = wAMPL.connect(deployer).burn(wamplesBurnt)
    await r
  })

  it('should burn wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesRemaining)
    expect(await wAMPL.totalUnderlying()).to.eq(amplesRemaining)
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq(
      amplesRemaining,
    )

    expect(await wAMPL.totalSupply()).to.eq(wamplesRemaining)
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq(wamplesRemaining)
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(wAMPL.address, deployerAddress, amplesWithdrawn)
  })

  it('should log burn', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(deployerAddress, ethers.constants.AddressZero, wamplesBurnt)
  })
})

describe('WAMPL:burnTo', () => {
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
    const wamplesMinted = await wAMPL.underlyingToWrapper(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    await wAMPL.connect(deployer).deposit(amplesDeposited)

    // 0.5% of AMPL total supply
    amplesWithdrawn = toAMPLFixedPt('250000')

    // 1.5% of AMPL total supply
    amplesRemaining = amplesDeposited.sub(amplesWithdrawn)

    // 0.5% of MAX_WAMPL_SUPPLY
    wamplesBurnt = toWAMPLFixedPt('50000')

    // 1.5% of MAX_WAMPL_SUPPLY
    wamplesRemaining = wamplesMinted.sub(wamplesBurnt)

    expect(await wAMPL.wrapperToUnderlying(wamplesBurnt)).to.eq(amplesWithdrawn)
    expect(
      await wAMPL
        .connect(deployer)
        .callStatic.burnTo(userBAddress, wamplesBurnt),
    ).to.eq(amplesWithdrawn)

    r = wAMPL.connect(deployer).burnTo(userBAddress, wamplesBurnt)
    await r
  })

  it('should burn wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq(amplesRemaining)
    expect(await wAMPL.totalUnderlying()).to.eq(amplesRemaining)
    expect(await wAMPL.balanceOfUnderlying(userBAddress)).to.eq('0')
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq(
      amplesRemaining,
    )

    expect(await wAMPL.totalSupply()).to.eq(wamplesRemaining)
    expect(await wAMPL.balanceOf(userBAddress)).to.eq('0')
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq(wamplesRemaining)
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(wAMPL.address, userBAddress, amplesWithdrawn)
  })

  it('should log burn', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(deployerAddress, ethers.constants.AddressZero, wamplesBurnt)
  })
})

describe('WAMPL:burnAll', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any, amplesDeposited: BigNumber, wamplesMinted: BigNumber
  beforeEach(async function () {
    // 2% of AMPL total supply
    amplesDeposited = toAMPLFixedPt('1000000')

    // 2 % of MAX_WAMPL_SUPPLY
    wamplesMinted = await wAMPL.underlyingToWrapper(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    await wAMPL.connect(deployer).deposit(amplesDeposited)

    expect(await wAMPL.wrapperToUnderlying(wamplesMinted)).to.eq(
      amplesDeposited,
    )
    expect(await wAMPL.connect(deployer).callStatic.burnAll()).to.eq(
      amplesDeposited,
    )

    r = wAMPL.connect(deployer).burnAll()
    await r
  })

  it('should burn wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq('0')
    expect(await wAMPL.totalUnderlying()).to.eq('0')
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq('0')

    expect(await wAMPL.totalSupply()).to.eq('0')
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq('0')
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(wAMPL.address, deployerAddress, amplesDeposited)
  })

  it('should log burn', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(deployerAddress, ethers.constants.AddressZero, wamplesMinted)
  })
})

describe('WAMPL:burnAllTo', () => {
  beforeEach('setup WAMPL contract', setupContracts)

  let r: any, amplesDeposited: BigNumber, wamplesMinted: BigNumber
  beforeEach(async function () {
    // 2% of AMPL total supply
    amplesDeposited = toAMPLFixedPt('1000000')

    // 2 % of MAX_WAMPL_SUPPLY
    wamplesMinted = await wAMPL.underlyingToWrapper(amplesDeposited)

    await ampl.connect(deployer).approve(wAMPL.address, amplesDeposited)
    await wAMPL.connect(deployer).deposit(amplesDeposited)

    expect(await wAMPL.wrapperToUnderlying(wamplesMinted)).to.eq(
      amplesDeposited,
    )
    expect(
      await wAMPL.connect(deployer).callStatic.burnAllTo(userBAddress),
    ).to.eq(amplesDeposited)

    r = wAMPL.connect(deployer).withdrawAllTo(userBAddress)
    await r
  })

  it('should burn wamples', async function () {
    expect(await ampl.balanceOf(wAMPL.address)).to.eq('0')
    expect(await wAMPL.totalUnderlying()).to.eq('0')
    expect(await wAMPL.balanceOfUnderlying(userBAddress)).to.eq('0')
    expect(await wAMPL.balanceOfUnderlying(deployerAddress)).to.eq('0')

    expect(await wAMPL.totalSupply()).to.eq('0')
    expect(await wAMPL.balanceOf(userBAddress)).to.eq('0')
    expect(await wAMPL.balanceOf(deployerAddress)).to.eq('0')
  })

  it('should log transfer', async function () {
    await expect(r)
      .to.emit(ampl, 'Transfer')
      .withArgs(wAMPL.address, userBAddress, amplesDeposited)
  })

  it('should log burn', async function () {
    await expect(r)
      .to.emit(wAMPL, 'Transfer')
      .withArgs(deployerAddress, ethers.constants.AddressZero, wamplesMinted)
  })
})

describe('Underlying Rebase:Expansion', async function () {
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

    await wAMPL.connect(userA).deposit(toAMPLFixedPt('100000'))
    await wAMPL.connect(userB).deposit(toAMPLFixedPt('200000'))
    await wAMPL.connect(userC).deposit(toAMPLFixedPt('300000'))
  })

  it('should update accounting accurately', async function () {
    expect(await wAMPL.totalUnderlying()).to.eq(toAMPLFixedPt('600000'))
    expect(await wAMPL.balanceOfUnderlying(userAAddress)).to.eq(
      toAMPLFixedPt('100000'),
    )
    expect(await wAMPL.balanceOfUnderlying(userBAddress)).to.eq(
      toAMPLFixedPt('200000'),
    )
    expect(await wAMPL.balanceOfUnderlying(userCAddress)).to.eq(
      toAMPLFixedPt('300000'),
    )

    expect(await wAMPL.totalSupply()).to.eq(toWAMPLFixedPt('120000'))
    expect(await wAMPL.balanceOf(userAAddress)).to.eq(toWAMPLFixedPt('20000'))
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(toWAMPLFixedPt('40000'))
    expect(await wAMPL.balanceOf(userCAddress)).to.eq(toWAMPLFixedPt('60000'))

    // supply increases by 100%
    await ampl.rebase('1', toAMPLFixedPt('50000000'))

    expect(await wAMPL.totalUnderlying()).to.eq(toAMPLFixedPt('1200000'))
    expect(await wAMPL.balanceOfUnderlying(userAAddress)).to.eq(
      toAMPLFixedPt('200000'),
    )
    expect(await wAMPL.balanceOfUnderlying(userBAddress)).to.eq(
      toAMPLFixedPt('400000'),
    )
    expect(await wAMPL.balanceOfUnderlying(userCAddress)).to.eq(
      toAMPLFixedPt('600000'),
    )

    expect(await wAMPL.totalSupply()).to.eq(toWAMPLFixedPt('120000'))
    expect(await wAMPL.balanceOf(userAAddress)).to.eq(toWAMPLFixedPt('20000'))
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(toWAMPLFixedPt('40000'))
    expect(await wAMPL.balanceOf(userCAddress)).to.eq(toWAMPLFixedPt('60000'))
  })
})

describe('Underlying Rebase:Contraction', async function () {
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

    await wAMPL.connect(userA).deposit(toAMPLFixedPt('100000'))
    await wAMPL.connect(userB).deposit(toAMPLFixedPt('200000'))
    await wAMPL.connect(userC).deposit(toAMPLFixedPt('300000'))
  })

  it('should update accounting accurately', async function () {
    expect(await wAMPL.totalUnderlying()).to.eq(toAMPLFixedPt('600000'))
    expect(await wAMPL.balanceOfUnderlying(userAAddress)).to.eq(
      toAMPLFixedPt('100000'),
    )
    expect(await wAMPL.balanceOfUnderlying(userBAddress)).to.eq(
      toAMPLFixedPt('200000'),
    )
    expect(await wAMPL.balanceOfUnderlying(userCAddress)).to.eq(
      toAMPLFixedPt('300000'),
    )

    expect(await wAMPL.totalSupply()).to.eq(toWAMPLFixedPt('120000'))
    expect(await wAMPL.balanceOf(userAAddress)).to.eq(toWAMPLFixedPt('20000'))
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(toWAMPLFixedPt('40000'))
    expect(await wAMPL.balanceOf(userCAddress)).to.eq(toWAMPLFixedPt('60000'))

    // supply decreases by 50%
    await ampl.rebase('1', toAMPLFixedPt('-25000000'))

    expect(await wAMPL.totalUnderlying()).to.eq(toAMPLFixedPt('300000'))
    expect(await wAMPL.balanceOfUnderlying(userAAddress)).to.eq(
      toAMPLFixedPt('50000'),
    )
    expect(await wAMPL.balanceOfUnderlying(userBAddress)).to.eq(
      toAMPLFixedPt('100000'),
    )
    expect(await wAMPL.balanceOfUnderlying(userCAddress)).to.eq(
      toAMPLFixedPt('150000'),
    )

    expect(await wAMPL.totalSupply()).to.eq(toWAMPLFixedPt('120000'))
    expect(await wAMPL.balanceOf(userAAddress)).to.eq(toWAMPLFixedPt('20000'))
    expect(await wAMPL.balanceOf(userBAddress)).to.eq(toWAMPLFixedPt('40000'))
    expect(await wAMPL.balanceOf(userCAddress)).to.eq(toWAMPLFixedPt('60000'))
  })
})
