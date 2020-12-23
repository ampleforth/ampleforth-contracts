/*
  MIT License
  Copyright (c) 2016 Smart Contract Solutions, Inc.
  Copyright (c) 2018 Fragments, Inc.
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:
  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
  This file tests if the UFragments contract confirms to the ERC20 specification.
  These test cases are inspired from OpenZepplin's ERC20 unit test.
  https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/test/token/ERC20/ERC20.test.js
*/

import { ethers, upgrades, waffle } from 'hardhat'
import { Contract, Signer, BigNumber } from 'ethers'
import { TransactionResponse } from '@ethersproject/providers'
import { expect } from 'chai'

const toUFrgDenomination = (ample: string): BigNumber =>
  ethers.utils.parseUnits(ample, DECIMALS)

const DECIMALS = 9
const INITIAL_SUPPLY = ethers.utils.parseUnits('50', 6 + DECIMALS)
const transferAmount = toUFrgDenomination('10')
const unitTokenAmount = toUFrgDenomination('1')
const overdraftAmount = INITIAL_SUPPLY.add(unitTokenAmount)
const overdraftAmountPlusOne = overdraftAmount.add(unitTokenAmount)
const overdraftAmountMinusOne = overdraftAmount.sub(unitTokenAmount)
const transferAmountPlusOne = transferAmount.add(unitTokenAmount)
const transferAmountMinusOne = transferAmount.sub(unitTokenAmount)

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

describe('UFragments:ERC20', () => {
  before('setup UFragments contract', async function () {
    ;({ token, owner, recipient, anotherAccount } = await waffle.loadFixture(
      upgradeableToken,
    ))
  })

  describe('totalSupply', function () {
    it('returns the total amount of tokens', async function () {
      expect(await token.totalSupply()).to.eq(INITIAL_SUPPLY)
    })
  })

  describe('balanceOf', function () {
    describe('when the requested account has no tokens', function () {
      it('returns zero', async function () {
        expect(await token.balanceOf(await anotherAccount.getAddress())).to.eq(
          0,
        )
      })
    })

    describe('when the requested account has some tokens', function () {
      it('returns the total amount of tokens', async function () {
        expect(await token.balanceOf(await owner.getAddress())).to.eq(
          INITIAL_SUPPLY,
        )
      })
    })
  })
})

describe('UFragments:ERC20:transfer', () => {
  before('setup UFragments contract', async function () {
    ;({ token, owner, recipient, anotherAccount } = await waffle.loadFixture(
      upgradeableToken,
    ))
  })

  describe('when the sender does NOT have enough balance', function () {
    it('reverts', async function () {
      await expect(
        token
          .connect(owner)
          .transfer(await recipient.getAddress(), overdraftAmount),
      ).to.be.reverted
    })
  })

  describe('when the sender has enough balance', function () {
    it('should emit a transfer event', async function () {
      await expect(
        token
          .connect(owner)
          .transfer(await recipient.getAddress(), transferAmount),
      )
        .to.emit(token, 'Transfer')
        .withArgs(
          await owner.getAddress(),
          await recipient.getAddress(),
          transferAmount,
        )
    })

    it('should transfer the requested amount', async function () {
      const senderBalance = await token.balanceOf(await owner.getAddress())
      const recipientBalance = await token.balanceOf(
        await recipient.getAddress(),
      )
      const supply = await token.totalSupply()
      expect(supply.sub(transferAmount)).to.eq(senderBalance)
      expect(recipientBalance).to.eq(transferAmount)
    })
  })

  describe('when the recipient is the zero address', function () {
    it('should fail', async function () {
      await expect(
        token
          .connect(owner)
          .transfer(ethers.constants.AddressZero, transferAmount),
      ).to.be.reverted
    })
  })
})

describe('UFragments:ERC20:transferFrom', () => {
  before('setup UFragments contract', async function () {
    ;({ token, owner, recipient, anotherAccount } = await waffle.loadFixture(
      upgradeableToken,
    ))
  })

  describe('when the spender does NOT have enough approved balance', function () {
    describe('when the owner does NOT have enough balance', function () {
      it('reverts', async function () {
        await token
          .connect(owner)
          .approve(await anotherAccount.getAddress(), overdraftAmountMinusOne)
        await expect(
          token
            .connect(anotherAccount)
            .transferFrom(
              await owner.getAddress(),
              await recipient.getAddress(),
              overdraftAmount,
            ),
        ).to.be.reverted
      })
    })

    describe('when the owner has enough balance', function () {
      it('reverts', async function () {
        await token
          .connect(owner)
          .approve(await anotherAccount.getAddress(), transferAmountMinusOne)
        await expect(
          token
            .connect(anotherAccount)
            .transferFrom(
              await owner.getAddress(),
              await recipient.getAddress(),
              transferAmount,
            ),
        ).to.be.reverted
      })
    })
  })

  describe('when the spender has enough approved balance', function () {
    describe('when the owner does NOT have enough balance', function () {
      it('should fail', async function () {
        await token
          .connect(owner)
          .approve(await anotherAccount.getAddress(), overdraftAmount)
        await expect(
          token
            .connect(anotherAccount)
            .transferFrom(
              await owner.getAddress(),
              await recipient.getAddress(),
              overdraftAmount,
            ),
        ).to.be.reverted
      })
    })

    describe('when the owner has enough balance', function () {
      let prevSenderBalance: BigNumber
      before(async function () {
        prevSenderBalance = await token.balanceOf(await owner.getAddress())
        await token
          .connect(owner)
          .approve(await anotherAccount.getAddress(), transferAmount)
      })

      it('emits a transfer event', async function () {
        await expect(
          token
            .connect(anotherAccount)
            .transferFrom(
              await owner.getAddress(),
              await recipient.getAddress(),
              transferAmount,
            ),
        )
          .to.emit(token, 'Transfer')
          .withArgs(
            await owner.getAddress(),
            await recipient.getAddress(),
            transferAmount,
          )
      })

      it('transfers the requested amount', async function () {
        const senderBalance = await token.balanceOf(await owner.getAddress())
        const recipientBalance = await token.balanceOf(
          await recipient.getAddress(),
        )
        expect(prevSenderBalance.sub(transferAmount)).to.eq(senderBalance)
        expect(recipientBalance).to.eq(transferAmount)
      })

      it('decreases the spender allowance', async function () {
        expect(
          await token.allowance(
            await owner.getAddress(),
            await anotherAccount.getAddress(),
          ),
        ).to.eq(0)
      })
    })
  })
})

describe('UFragments:ERC20:approve', () => {
  before('setup UFragments contract', async function () {
    ;({ token, owner, recipient, anotherAccount } = await waffle.loadFixture(
      upgradeableToken,
    ))
  })

  describe('when the spender is NOT the zero address', function () {
    describe('when the sender has enough balance', function () {
      describe('when there was no approved amount before', function () {
        let r: Promise<TransactionResponse>
        before(async function () {
          await token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), 0)
          r = token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), transferAmount)
        })

        it('approves the requested amount', async function () {
          await r
          expect(
            await token.allowance(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
            ),
          ).to.eq(transferAmount)
        })

        it('emits an approval event', async function () {
          await expect(r)
            .to.emit(token, 'Approval')
            .withArgs(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
              transferAmount,
            )
        })
      })

      describe('when the spender had an approved amount', function () {
        let r: Promise<TransactionResponse>
        before(async function () {
          await token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), toUFrgDenomination('1'))
          r = token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), transferAmount)
        })

        it('approves the requested amount and replaces the previous one', async function () {
          await r
          expect(
            await token.allowance(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
            ),
          ).to.eq(transferAmount)
        })

        it('emits an approval event', async function () {
          await expect(r)
            .to.emit(token, 'Approval')
            .withArgs(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
              transferAmount,
            )
        })
      })
    })

    describe('when the sender does not have enough balance', function () {
      describe('when there was no approved amount before', function () {
        let r: Promise<TransactionResponse>
        before(async function () {
          await token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), 0)
          r = token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), overdraftAmount)
        })

        it('approves the requested amount', async function () {
          await r
          expect(
            await token.allowance(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
            ),
          ).to.eq(overdraftAmount)
        })

        it('emits an approval event', async function () {
          await expect(r)
            .to.emit(token, 'Approval')
            .withArgs(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
              overdraftAmount,
            )
        })
      })

      describe('when the spender had an approved amount', function () {
        let r: Promise<TransactionResponse>
        before(async function () {
          await token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), toUFrgDenomination('1'))
          r = token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), overdraftAmount)
        })

        it('approves the requested amount', async function () {
          await r
          expect(
            await token.allowance(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
            ),
          ).to.eq(overdraftAmount)
        })

        it('emits an approval event', async function () {
          await expect(r)
            .to.emit(token, 'Approval')
            .withArgs(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
              overdraftAmount,
            )
        })
      })
    })
  })
})

describe('UFragments:ERC20:increaseAllowance', () => {
  before('setup UFragments contract', async function () {
    ;({ token, owner, recipient, anotherAccount } = await waffle.loadFixture(
      upgradeableToken,
    ))
  })

  describe('when the spender is NOT the zero address', function () {
    describe('when the sender has enough balance', function () {
      describe('when there was no approved amount before', function () {
        let r: Promise<TransactionResponse>
        before(async function () {
          await token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), 0)
          r = token
            .connect(owner)
            .increaseAllowance(
              await anotherAccount.getAddress(),
              transferAmount,
            )
        })
        it('approves the requested amount', async function () {
          await r
          expect(
            await token.allowance(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
            ),
          ).to.eq(transferAmount)
        })

        it('emits an approval event', async function () {
          await expect(r)
            .to.emit(token, 'Approval')
            .withArgs(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
              transferAmount,
            )
        })
      })

      describe('when the spender had an approved amount', function () {
        let r: Promise<TransactionResponse>
        beforeEach(async function () {
          await token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), unitTokenAmount)
          r = token
            .connect(owner)
            .increaseAllowance(
              await anotherAccount.getAddress(),
              transferAmount,
            )
        })

        it('increases the spender allowance adding the requested amount', async function () {
          await r
          expect(
            await token.allowance(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
            ),
          ).to.eq(transferAmountPlusOne)
        })

        it('emits an approval event', async function () {
          await expect(r)
            .to.emit(token, 'Approval')
            .withArgs(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
              transferAmountPlusOne,
            )
        })
      })
    })

    describe('when the sender does not have enough balance', function () {
      describe('when there was no approved amount before', function () {
        let r: Promise<TransactionResponse>
        before(async function () {
          await token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), 0)
          r = token
            .connect(owner)
            .increaseAllowance(
              await anotherAccount.getAddress(),
              overdraftAmount,
            )
        })

        it('approves the requested amount', async function () {
          await r
          expect(
            await token.allowance(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
            ),
          ).to.eq(overdraftAmount)
        })

        it('emits an approval event', async function () {
          await expect(r)
            .to.emit(token, 'Approval')
            .withArgs(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
              overdraftAmount,
            )
        })
      })

      describe('when the spender had an approved amount', function () {
        let r: Promise<TransactionResponse>
        beforeEach(async function () {
          await token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), unitTokenAmount)
          r = token
            .connect(owner)
            .increaseAllowance(
              await anotherAccount.getAddress(),
              overdraftAmount,
            )
        })

        it('increases the spender allowance adding the requested amount', async function () {
          await r
          expect(
            await token.allowance(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
            ),
          ).to.eq(overdraftAmountPlusOne)
        })

        it('emits an approval event', async function () {
          await expect(r)
            .to.emit(token, 'Approval')
            .withArgs(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
              overdraftAmountPlusOne,
            )
        })
      })
    })
  })
})

describe('UFragments:ERC20:decreaseAllowance', () => {
  before('setup UFragments contract', async function () {
    ;({ token, owner, recipient, anotherAccount } = await waffle.loadFixture(
      upgradeableToken,
    ))
  })

  describe('when the spender is NOT the zero address', function () {
    describe('when the sender does NOT have enough balance', function () {
      describe('when there was no approved amount before', function () {
        let r: Promise<TransactionResponse>
        before(async function () {
          r = token
            .connect(owner)
            .decreaseAllowance(
              await anotherAccount.getAddress(),
              overdraftAmount,
            )
        })

        it('keeps the allowance to zero', async function () {
          await r
          expect(
            await token.allowance(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
            ),
          ).to.eq(0)
        })

        it('emits an approval event', async function () {
          await expect(r)
            .to.emit(token, 'Approval')
            .withArgs(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
              0,
            )
        })
      })

      describe('when the spender had an approved amount', function () {
        let r: Promise<TransactionResponse>
        before(async function () {
          await token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), overdraftAmountPlusOne)
          r = token
            .connect(owner)
            .decreaseAllowance(
              await anotherAccount.getAddress(),
              overdraftAmount,
            )
        })

        it('decreases the spender allowance subtracting the requested amount', async function () {
          await r
          expect(
            await token.allowance(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
            ),
          ).to.eq(unitTokenAmount)
        })

        it('emits an approval event', async function () {
          await expect(r)
            .to.emit(token, 'Approval')
            .withArgs(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
              unitTokenAmount,
            )
        })
      })
    })

    describe('when the sender has enough balance', function () {
      describe('when there was no approved amount before', function () {
        let r: Promise<TransactionResponse>
        before(async function () {
          await token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), 0)
          r = token
            .connect(owner)
            .decreaseAllowance(
              await anotherAccount.getAddress(),
              transferAmount,
            )
        })

        it('keeps the allowance to zero', async function () {
          await r
          expect(
            await token.allowance(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
            ),
          ).to.eq(0)
        })

        it('emits an approval event', async function () {
          await expect(r)
            .to.emit(token, 'Approval')
            .withArgs(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
              0,
            )
        })
      })

      describe('when the spender had an approved amount', function () {
        let r: Promise<TransactionResponse>
        before(async function () {
          await token
            .connect(owner)
            .approve(await anotherAccount.getAddress(), transferAmountPlusOne)
          r = token
            .connect(owner)
            .decreaseAllowance(
              await anotherAccount.getAddress(),
              transferAmount,
            )
        })

        it('decreases the spender allowance subtracting the requested amount', async function () {
          await r
          expect(
            await token.allowance(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
            ),
          ).to.eq(unitTokenAmount)
        })

        it('emits an approval event', async function () {
          await expect(r)
            .to.emit(token, 'Approval')
            .withArgs(
              await owner.getAddress(),
              await anotherAccount.getAddress(),
              unitTokenAmount,
            )
        })
      })
    })
  })
})
