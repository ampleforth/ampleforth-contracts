import { ethers, upgrades, waffle } from 'hardhat'
import { Contract, Signer, BigNumber } from 'ethers'
import { TransactionResponse } from '@ethersproject/providers'
import { expect } from 'chai'

const DECIMALS = 9
const INITIAL_SUPPLY = ethers.utils.parseUnits('50', 6 + DECIMALS)
const MAX_UINT256 = ethers.BigNumber.from(2).pow(256).sub(1)
const MAX_INT256 = ethers.BigNumber.from(2).pow(255).sub(1)
const TOTAL_GONS = MAX_UINT256.sub(MAX_UINT256.mod(INITIAL_SUPPLY))

const toUFrgDenomination = (ample: string): BigNumber =>
  ethers.utils.parseUnits(ample, DECIMALS)

const unitTokenAmount = toUFrgDenomination('1')

let token: Contract, owner: Signer, anotherAccount: Signer, recipient: Signer

async function upgradeableToken() {
  const [owner, recipient, anotherAccount] = await ethers.getSigners()
  const factory = await ethers.getContractFactory('UFragments')
  const token = await upgrades.deployProxy(
    factory.connect(owner),
    [await owner.getAddress()],
    {
      initializer: 'initialize(address)',
    },
  )
  return { token, owner, recipient, anotherAccount }
}

describe('UFragments:Elastic', () => {
  beforeEach('setup UFragments contract', async function () {
    ;({ token, owner, recipient, anotherAccount } = await waffle.loadFixture(
      upgradeableToken,
    ))
  })

  describe('scaledTotalSupply', function () {
    it('returns the scaled total amount of tokens', async function () {
      expect(await token.scaledTotalSupply()).to.eq(TOTAL_GONS)
    })
  })

  describe('scaledBalanceOf', function () {
    describe('when the requested account has no tokens', function () {
      it('returns zero', async function () {
        expect(
          await token.scaledBalanceOf(await anotherAccount.getAddress()),
        ).to.eq(0)
      })
    })

    describe('when the requested account has some tokens', function () {
      it('returns the total amount of tokens', async function () {
        expect(await token.scaledBalanceOf(await owner.getAddress())).to.eq(
          TOTAL_GONS,
        )
      })
    })
  })
})

describe('UFragments:Elastic:transferAll', () => {
  beforeEach('setup UFragments contract', async function () {
    ;({ token, owner, recipient, anotherAccount } = await waffle.loadFixture(
      upgradeableToken,
    ))
  })

  describe('when the recipient is the zero address', function () {
    it('should revert', async function () {
      await expect(
        token.connect(owner).transferAll(ethers.constants.AddressZero),
      ).to.be.reverted
    })
  })

  describe('when the recipient is the contract address', function () {
    it('should revert', async function () {
      await expect(token.connect(owner).transferAll(token.address)).to.be
        .reverted
    })
  })

  describe('when the sender has zero balance', function () {
    it('should not revert', async function () {
      await expect(
        token.connect(anotherAccount).transferAll(await owner.getAddress()),
      ).not.to.be.reverted
    })
  })

  describe('when the sender has balance', function () {
    it('should emit a transfer event', async function () {
      await expect(
        token.connect(owner).transferAll(await recipient.getAddress()),
      )
        .to.emit(token, 'Transfer')
        .withArgs(
          await owner.getAddress(),
          await recipient.getAddress(),
          INITIAL_SUPPLY,
        )
    })

    it("should transfer all of the sender's balance", async function () {
      const senderBalance = await token.balanceOf(await owner.getAddress())
      const recipientBalance = await token.balanceOf(
        await recipient.getAddress(),
      )
      await token.connect(owner).transferAll(await recipient.getAddress())
      const senderBalance_ = await token.balanceOf(await owner.getAddress())
      const recipientBalance_ = await token.balanceOf(
        await recipient.getAddress(),
      )
      expect(senderBalance_).to.eq('0')
      expect(recipientBalance_.sub(recipientBalance)).to.eq(senderBalance)
    })
  })
})

describe('UFragments:Elastic:transferAllFrom', () => {
  beforeEach('setup UFragments contract', async function () {
    ;({ token, owner, recipient, anotherAccount } = await waffle.loadFixture(
      upgradeableToken,
    ))
  })

  describe('when the recipient is the zero address', function () {
    it('should revert', async function () {
      const senderBalance = await token.balanceOf(await owner.getAddress())
      await token
        .connect(owner)
        .approve(await anotherAccount.getAddress(), senderBalance)
      await expect(
        token
          .connect(anotherAccount)
          .transferAllFrom(
            await owner.getAddress(),
            ethers.constants.AddressZero,
          ),
      ).to.be.reverted
    })
  })

  describe('when the recipient is the contract address', function () {
    it('should revert', async function () {
      const senderBalance = await token.balanceOf(await owner.getAddress())
      await token
        .connect(owner)
        .approve(await anotherAccount.getAddress(), senderBalance)
      await expect(
        token
          .connect(anotherAccount)
          .transferAllFrom(await owner.getAddress(), token.address),
      ).to.be.reverted
    })
  })

  describe('when the sender has zero balance', function () {
    it('should not revert', async function () {
      const senderBalance = await token.balanceOf(
        await anotherAccount.getAddress(),
      )
      await token
        .connect(anotherAccount)
        .approve(await anotherAccount.getAddress(), senderBalance)

      await expect(
        token
          .connect(recipient)
          .transferAllFrom(
            await anotherAccount.getAddress(),
            await recipient.getAddress(),
          ),
      ).not.to.be.reverted
    })
  })

  describe('when the spender does NOT have enough approved balance', function () {
    it('reverts', async function () {
      await token
        .connect(owner)
        .approve(await anotherAccount.getAddress(), unitTokenAmount)
      await expect(
        token
          .connect(anotherAccount)
          .transferAllFrom(
            await owner.getAddress(),
            await recipient.getAddress(),
          ),
      ).to.be.reverted
    })
  })

  describe('when the spender has enough approved balance', function () {
    it('emits a transfer event', async function () {
      const senderBalance = await token.balanceOf(await owner.getAddress())
      await token
        .connect(owner)
        .approve(await anotherAccount.getAddress(), senderBalance)

      await expect(
        token
          .connect(anotherAccount)
          .transferAllFrom(
            await owner.getAddress(),
            await recipient.getAddress(),
          ),
      )
        .to.emit(token, 'Transfer')
        .withArgs(
          await owner.getAddress(),
          await recipient.getAddress(),
          senderBalance,
        )
    })

    it('transfers the requested amount', async function () {
      const senderBalance = await token.balanceOf(await owner.getAddress())
      const recipientBalance = await token.balanceOf(
        await recipient.getAddress(),
      )

      await token
        .connect(owner)
        .approve(await anotherAccount.getAddress(), senderBalance)

      await token
        .connect(anotherAccount)
        .transferAllFrom(await owner.getAddress(), await recipient.getAddress())

      const senderBalance_ = await token.balanceOf(await owner.getAddress())
      const recipientBalance_ = await token.balanceOf(
        await recipient.getAddress(),
      )
      expect(senderBalance_).to.eq('0')
      expect(recipientBalance_.sub(recipientBalance)).to.eq(senderBalance)
    })

    it('decreases the spender allowance', async function () {
      const senderBalance = await token.balanceOf(await owner.getAddress())
      await token
        .connect(owner)
        .approve(await anotherAccount.getAddress(), senderBalance.add('99'))
      await token
        .connect(anotherAccount)
        .transferAllFrom(await owner.getAddress(), await recipient.getAddress())
      expect(
        await token.allowance(
          await owner.getAddress(),
          await anotherAccount.getAddress(),
        ),
      ).to.eq('99')
    })
  })
})
