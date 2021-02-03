import { ethers, upgrades } from 'hardhat'
import { Contract, Signer, BigNumber } from 'ethers'
import { expect } from 'chai'

const toUFrgDenomination = (ample: string): BigNumber =>
  ethers.utils.parseUnits(ample, DECIMALS)

const DECIMALS = 9
const INITIAL_SUPPLY = ethers.utils.parseUnits('50', 6 + DECIMALS)
const MAX_UINT256 = ethers.BigNumber.from(2).pow(256).sub(1)
const MAX_INT256 = ethers.BigNumber.from(2).pow(255).sub(1)
const TOTAL_GONS = MAX_UINT256.sub(MAX_UINT256.mod(INITIAL_SUPPLY))

const transferAmount = toUFrgDenomination('10')
const unitTokenAmount = toUFrgDenomination('1')

let accounts: Signer[],
  deployer: Signer,
  uFragments: Contract,
  initialSupply: BigNumber

async function setupContracts() {
  // prepare signers
  accounts = await ethers.getSigners()
  deployer = accounts[0]
  // deploy upgradable token
  const factory = await ethers.getContractFactory('UFragments')
  uFragments = await upgrades.deployProxy(
    factory,
    [await deployer.getAddress()],
    {
      initializer: 'initialize(address)',
    },
  )
  // fetch initial supply
  initialSupply = await uFragments.totalSupply()
}

describe('UFragments', () => {
  before('setup UFragments contract', setupContracts)

  it('should reject any ether sent to it', async function () {
    const user = accounts[1]
    await expect(user.sendTransaction({ to: uFragments.address, value: 1 })).to
      .be.reverted
  })
})

describe('UFragments:Initialization', () => {
  before('setup UFragments contract', setupContracts)

  it('should transfer 50M uFragments to the deployer', async function () {
    expect(await uFragments.balanceOf(await deployer.getAddress())).to.eq(
      INITIAL_SUPPLY,
    )
  })

  it('should set the totalSupply to 50M', async function () {
    expect(await uFragments.totalSupply()).to.eq(INITIAL_SUPPLY)
  })

  it('should set the owner', async function () {
    expect(await uFragments.owner()).to.eq(await deployer.getAddress())
  })

  it('should set detailed ERC20 parameters', async function () {
    expect(await uFragments.name()).to.eq('Ampleforth')
    expect(await uFragments.symbol()).to.eq('AMPL')
    expect(await uFragments.decimals()).to.eq(DECIMALS)
  })
})

describe('UFragments:setMonetaryPolicy', async () => {
  let policy: Signer, policyAddress: string

  before('setup UFragments contract', async () => {
    await setupContracts()
    policy = accounts[1]
    policyAddress = await policy.getAddress()
  })

  it('should set reference to policy contract', async function () {
    await expect(uFragments.connect(deployer).setMonetaryPolicy(policyAddress))
      .to.emit(uFragments, 'LogMonetaryPolicyUpdated')
      .withArgs(policyAddress)
    expect(await uFragments.monetaryPolicy()).to.eq(policyAddress)
  })
})

describe('UFragments:setMonetaryPolicy:accessControl', async () => {
  let policy: Signer, policyAddress: string

  before('setup UFragments contract', async () => {
    await setupContracts()
    policy = accounts[1]
    policyAddress = await policy.getAddress()
  })

  it('should be callable by owner', async function () {
    await expect(uFragments.connect(deployer).setMonetaryPolicy(policyAddress))
      .to.not.be.reverted
  })
})

describe('UFragments:setMonetaryPolicy:accessControl', async () => {
  let policy: Signer, policyAddress: string, user: Signer

  before('setup UFragments contract', async () => {
    await setupContracts()
    policy = accounts[1]
    user = accounts[2]
    policyAddress = await policy.getAddress()
  })

  it('should NOT be callable by non-owner', async function () {
    await expect(uFragments.connect(user).setMonetaryPolicy(policyAddress)).to
      .be.reverted
  })
})

describe('UFragments:Rebase:accessControl', async () => {
  let user: Signer, userAddress: string

  before('setup UFragments contract', async function () {
    await setupContracts()
    user = accounts[1]
    userAddress = await user.getAddress()
    await uFragments.connect(deployer).setMonetaryPolicy(userAddress)
  })

  it('should be callable by monetary policy', async function () {
    await expect(uFragments.connect(user).rebase(1, transferAmount)).to.not.be
      .reverted
  })

  it('should not be callable by others', async function () {
    await expect(uFragments.connect(deployer).rebase(1, transferAmount)).to.be
      .reverted
  })
})

describe('UFragments:Rebase:Expansion', async () => {
  // Rebase +5M (10%), with starting balances A:750 and B:250.
  let A: Signer, B: Signer, policy: Signer
  const rebaseAmt = INITIAL_SUPPLY.div(10)

  before('setup UFragments contract', async function () {
    await setupContracts()
    A = accounts[2]
    B = accounts[3]
    policy = accounts[1]
    await uFragments
      .connect(deployer)
      .setMonetaryPolicy(await policy.getAddress())
    await uFragments
      .connect(deployer)
      .transfer(await A.getAddress(), toUFrgDenomination('750'))
    await uFragments
      .connect(deployer)
      .transfer(await B.getAddress(), toUFrgDenomination('250'))

    expect(await uFragments.totalSupply()).to.eq(INITIAL_SUPPLY)
    expect(await uFragments.balanceOf(await A.getAddress())).to.eq(
      toUFrgDenomination('750'),
    )
    expect(await uFragments.balanceOf(await B.getAddress())).to.eq(
      toUFrgDenomination('250'),
    )

    expect(await uFragments.scaledTotalSupply()).to.eq(TOTAL_GONS)
    expect(await uFragments.scaledBalanceOf(await A.getAddress())).to.eq(
      '1736881338559742931353564775130318617799049769984608460591863250000000000',
    )
    expect(await uFragments.scaledBalanceOf(await B.getAddress())).to.eq(
      '578960446186580977117854925043439539266349923328202820197287750000000000',
    )
  })

  it('should emit Rebase', async function () {
    await expect(uFragments.connect(policy).rebase(1, rebaseAmt))
      .to.emit(uFragments, 'LogRebase')
      .withArgs(1, initialSupply.add(rebaseAmt))
  })

  it('should increase the totalSupply', async function () {
    expect(await uFragments.totalSupply()).to.eq(initialSupply.add(rebaseAmt))
  })

  it('should NOT CHANGE the scaledTotalSupply', async function () {
    expect(await uFragments.scaledTotalSupply()).to.eq(TOTAL_GONS)
  })

  it('should increase individual balances', async function () {
    expect(await uFragments.balanceOf(await A.getAddress())).to.eq(
      toUFrgDenomination('825'),
    )
    expect(await uFragments.balanceOf(await B.getAddress())).to.eq(
      toUFrgDenomination('275'),
    )
  })

  it('should NOT CHANGE the individual scaled balances', async function () {
    expect(await uFragments.scaledBalanceOf(await A.getAddress())).to.eq(
      '1736881338559742931353564775130318617799049769984608460591863250000000000',
    )
    expect(await uFragments.scaledBalanceOf(await B.getAddress())).to.eq(
      '578960446186580977117854925043439539266349923328202820197287750000000000',
    )
  })

  it('should return the new supply', async function () {
    const returnVal = await uFragments
      .connect(policy)
      .callStatic.rebase(2, rebaseAmt)
    await uFragments.connect(policy).rebase(2, rebaseAmt)
    expect(await uFragments.totalSupply()).to.eq(returnVal)
  })
})

describe('UFragments:Rebase:Expansion', async function () {
  let policy: Signer
  const MAX_SUPPLY = ethers.BigNumber.from(2).pow(128).sub(1)

  describe('when totalSupply is less than MAX_SUPPLY and expands beyond', function () {
    before('setup UFragments contract', async function () {
      await setupContracts()
      policy = accounts[1]
      await uFragments
        .connect(deployer)
        .setMonetaryPolicy(await policy.getAddress())
      const totalSupply = await uFragments.totalSupply.call()
      await uFragments
        .connect(policy)
        .rebase(1, MAX_SUPPLY.sub(totalSupply).sub(toUFrgDenomination('1')))
    })

    it('should emit Rebase', async function () {
      await expect(
        uFragments.connect(policy).rebase(2, toUFrgDenomination('2')),
      )
        .to.emit(uFragments, 'LogRebase')
        .withArgs(2, MAX_SUPPLY)
    })

    it('should increase the totalSupply to MAX_SUPPLY', async function () {
      expect(await uFragments.totalSupply()).to.eq(MAX_SUPPLY)
    })
  })

  describe('when totalSupply is MAX_SUPPLY and expands', function () {
    before(async function () {
      expect(await uFragments.totalSupply()).to.eq(MAX_SUPPLY)
    })

    it('should emit Rebase', async function () {
      await expect(
        uFragments.connect(policy).rebase(3, toUFrgDenomination('2')),
      )
        .to.emit(uFragments, 'LogRebase')
        .withArgs(3, MAX_SUPPLY)
    })

    it('should NOT change the totalSupply', async function () {
      expect(await uFragments.totalSupply()).to.eq(MAX_SUPPLY)
    })
  })
})

describe('UFragments:Rebase:NoChange', function () {
  // Rebase (0%), with starting balances A:750 and B:250.
  let A: Signer, B: Signer, policy: Signer

  before('setup UFragments contract', async function () {
    await setupContracts()
    A = accounts[2]
    B = accounts[3]
    policy = accounts[1]
    await uFragments
      .connect(deployer)
      .setMonetaryPolicy(await policy.getAddress())
    await uFragments
      .connect(deployer)
      .transfer(await A.getAddress(), toUFrgDenomination('750'))
    await uFragments
      .connect(deployer)
      .transfer(await B.getAddress(), toUFrgDenomination('250'))

    expect(await uFragments.totalSupply()).to.eq(INITIAL_SUPPLY)
    expect(await uFragments.balanceOf(await A.getAddress())).to.eq(
      toUFrgDenomination('750'),
    )
    expect(await uFragments.balanceOf(await B.getAddress())).to.eq(
      toUFrgDenomination('250'),
    )

    expect(await uFragments.scaledTotalSupply()).to.eq(TOTAL_GONS)
    expect(await uFragments.scaledBalanceOf(await A.getAddress())).to.eq(
      '1736881338559742931353564775130318617799049769984608460591863250000000000',
    )
    expect(await uFragments.scaledBalanceOf(await B.getAddress())).to.eq(
      '578960446186580977117854925043439539266349923328202820197287750000000000',
    )
  })

  it('should emit Rebase', async function () {
    await expect(uFragments.connect(policy).rebase(1, 0))
      .to.emit(uFragments, 'LogRebase')
      .withArgs(1, initialSupply)
  })

  it('should NOT CHANGE the totalSupply', async function () {
    expect(await uFragments.totalSupply()).to.eq(initialSupply)
  })

  it('should NOT CHANGE the scaledTotalSupply', async function () {
    expect(await uFragments.scaledTotalSupply()).to.eq(TOTAL_GONS)
  })

  it('should NOT CHANGE individual balances', async function () {
    expect(await uFragments.balanceOf(await A.getAddress())).to.eq(
      toUFrgDenomination('750'),
    )
    expect(await uFragments.balanceOf(await B.getAddress())).to.eq(
      toUFrgDenomination('250'),
    )
  })

  it('should NOT CHANGE the individual scaled balances', async function () {
    expect(await uFragments.scaledBalanceOf(await A.getAddress())).to.eq(
      '1736881338559742931353564775130318617799049769984608460591863250000000000',
    )
    expect(await uFragments.scaledBalanceOf(await B.getAddress())).to.eq(
      '578960446186580977117854925043439539266349923328202820197287750000000000',
    )
  })
})

describe('UFragments:Rebase:Contraction', function () {
  // Rebase -5M (-10%), with starting balances A:750 and B:250.
  let A: Signer, B: Signer, policy: Signer
  const rebaseAmt = INITIAL_SUPPLY.div(10)

  before('setup UFragments contract', async function () {
    await setupContracts()
    A = accounts[2]
    B = accounts[3]
    policy = accounts[1]
    await uFragments
      .connect(deployer)
      .setMonetaryPolicy(await policy.getAddress())
    await uFragments
      .connect(deployer)
      .transfer(await A.getAddress(), toUFrgDenomination('750'))
    await uFragments
      .connect(deployer)
      .transfer(await B.getAddress(), toUFrgDenomination('250'))

    expect(await uFragments.totalSupply()).to.eq(INITIAL_SUPPLY)
    expect(await uFragments.balanceOf(await A.getAddress())).to.eq(
      toUFrgDenomination('750'),
    )
    expect(await uFragments.balanceOf(await B.getAddress())).to.eq(
      toUFrgDenomination('250'),
    )

    expect(await uFragments.scaledTotalSupply()).to.eq(TOTAL_GONS)
    expect(await uFragments.scaledBalanceOf(await A.getAddress())).to.eq(
      '1736881338559742931353564775130318617799049769984608460591863250000000000',
    )
    expect(await uFragments.scaledBalanceOf(await B.getAddress())).to.eq(
      '578960446186580977117854925043439539266349923328202820197287750000000000',
    )
  })

  it('should emit Rebase', async function () {
    await expect(uFragments.connect(policy).rebase(1, -rebaseAmt))
      .to.emit(uFragments, 'LogRebase')
      .withArgs(1, initialSupply.sub(rebaseAmt))
  })

  it('should decrease the totalSupply', async function () {
    expect(await uFragments.totalSupply()).to.eq(initialSupply.sub(rebaseAmt))
  })

  it('should NOT. CHANGE the scaledTotalSupply', async function () {
    expect(await uFragments.scaledTotalSupply()).to.eq(TOTAL_GONS)
  })

  it('should decrease individual balances', async function () {
    expect(await uFragments.balanceOf(await A.getAddress())).to.eq(
      toUFrgDenomination('675'),
    )
    expect(await uFragments.balanceOf(await B.getAddress())).to.eq(
      toUFrgDenomination('225'),
    )
  })

  it('should NOT CHANGE the individual scaled balances', async function () {
    expect(await uFragments.scaledBalanceOf(await A.getAddress())).to.eq(
      '1736881338559742931353564775130318617799049769984608460591863250000000000',
    )
    expect(await uFragments.scaledBalanceOf(await B.getAddress())).to.eq(
      '578960446186580977117854925043439539266349923328202820197287750000000000',
    )
  })
})

describe('UFragments:Transfer', function () {
  let A: Signer, B: Signer, C: Signer

  before('setup UFragments contract', async () => {
    await setupContracts()
    A = accounts[2]
    B = accounts[3]
    C = accounts[4]
  })

  describe('deployer transfers 12 to A', function () {
    it('should have correct balances', async function () {
      const deployerBefore = await uFragments.balanceOf(
        await deployer.getAddress(),
      )
      await uFragments
        .connect(deployer)
        .transfer(await A.getAddress(), toUFrgDenomination('12'))
      expect(await uFragments.balanceOf(await deployer.getAddress())).to.eq(
        deployerBefore.sub(toUFrgDenomination('12')),
      )
      expect(await uFragments.balanceOf(await A.getAddress())).to.eq(
        toUFrgDenomination('12'),
      )
    })
  })

  describe('deployer transfers 15 to B', async function () {
    it('should have balances [973,15]', async function () {
      const deployerBefore = await uFragments.balanceOf(
        await deployer.getAddress(),
      )
      await uFragments
        .connect(deployer)
        .transfer(await B.getAddress(), toUFrgDenomination('15'))
      expect(await uFragments.balanceOf(await deployer.getAddress())).to.eq(
        deployerBefore.sub(toUFrgDenomination('15')),
      )
      expect(await uFragments.balanceOf(await B.getAddress())).to.eq(
        toUFrgDenomination('15'),
      )
    })
  })

  describe('deployer transfers the rest to C', async function () {
    it('should have balances [0,973]', async function () {
      const deployerBefore = await uFragments.balanceOf(
        await deployer.getAddress(),
      )
      await uFragments
        .connect(deployer)
        .transfer(await C.getAddress(), deployerBefore)
      expect(await uFragments.balanceOf(await deployer.getAddress())).to.eq(0)
      expect(await uFragments.balanceOf(await C.getAddress())).to.eq(
        deployerBefore,
      )
    })
  })

  describe('when the recipient address is the contract address', function () {
    it('reverts on transfer', async function () {
      await expect(
        uFragments.connect(A).transfer(uFragments.address, unitTokenAmount),
      ).to.be.reverted
    })

    it('reverts on transferFrom', async function () {
      await expect(
        uFragments
          .connect(A)
          .transferFrom(
            await A.getAddress(),
            uFragments.address,
            unitTokenAmount,
          ),
      ).to.be.reverted
    })
  })

  describe('when the recipient is the zero address', function () {
    it('emits an approval event', async function () {
      await expect(
        uFragments
          .connect(A)
          .approve(ethers.constants.AddressZero, transferAmount),
      )
        .to.emit(uFragments, 'Approval')
        .withArgs(
          await A.getAddress(),
          ethers.constants.AddressZero,
          transferAmount,
        )
    })

    it('transferFrom should fail', async function () {
      await expect(
        uFragments
          .connect(C)
          .transferFrom(
            await A.getAddress(),
            ethers.constants.AddressZero,
            unitTokenAmount,
          ),
      ).to.be.reverted
    })
  })
})
