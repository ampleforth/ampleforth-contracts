import { ethers, waffle } from 'hardhat'
import { Contract, Signer } from 'ethers'
import { increaseTime } from '../utils/utils'
import { expect } from 'chai'
import { TransactionResponse } from '@ethersproject/providers'

let orchestrator: Contract, mockPolicy: Contract, mockDownstream: Contract
let r: Promise<TransactionResponse>
let deployer: Signer, user: Signer

async function mockedOrchestrator() {
  await increaseTime(86400)
  // get signers
  const [deployer, user] = await ethers.getSigners()
  // deploy mocks
  const mockPolicy = await (
    await ethers.getContractFactory('MockUFragmentsPolicy')
  )
    .connect(deployer)
    .deploy()
  const orchestrator = await (await ethers.getContractFactory('Orchestrator'))
    .connect(deployer)
    .deploy(mockPolicy.address)
  const mockDownstream = await (
    await ethers.getContractFactory('MockDownstream')
  )
    .connect(deployer)
    .deploy()
  return {
    deployer,
    user,
    orchestrator,
    mockPolicy,
    mockDownstream,
  }
}

describe('Orchestrator', function () {
  before('setup Orchestrator contract', async () => {
    ;({ deployer, user, orchestrator, mockPolicy, mockDownstream } =
      await waffle.loadFixture(mockedOrchestrator))
  })

  describe('when sent ether', async function () {
    it('should reject', async function () {
      await expect(user.sendTransaction({ to: orchestrator.address, value: 1 }))
        .to.be.reverted
    })
  })

  describe('when rebase called by a contract', function () {
    it('should fail', async function () {
      const rebaseCallerContract = await (
        await ethers.getContractFactory('RebaseCallerContract')
      )
        .connect(deployer)
        .deploy()
      await expect(rebaseCallerContract.callRebase(orchestrator.address)).to.be
        .reverted
    })
  })

  describe('when rebase called by a contract which is being constructed', function () {
    it('should fail', async function () {
      await expect(
        (await ethers.getContractFactory('ConstructorRebaseCallerContract'))
          .connect(deployer)
          .deploy(orchestrator.address),
      ).to.be.reverted
    })
  })

  describe('when transaction list is empty', async function () {
    before('calling rebase', async function () {
      r = orchestrator.rebase()
    })

    it('should have no transactions', async function () {
      expect(await orchestrator.transactionsSize()).to.eq(0)
    })

    it('should call rebase on policy', async function () {
      await expect(r)
        .to.emit(mockPolicy, 'FunctionCalled')
        .withArgs('UFragmentsPolicy', 'rebase', orchestrator.address)
    })

    it('should not have any subsequent logs', async function () {
      expect((await (await r).wait()).logs.length).to.eq(1)
    })
  })

  describe('when there is a single transaction', async function () {
    before('adding a transaction', async function () {
      const updateOneArgEncoded =
        await mockDownstream.populateTransaction.updateOneArg(12345)
      await orchestrator
        .connect(deployer)
        .addTransaction(mockDownstream.address, updateOneArgEncoded.data)
      r = orchestrator.connect(deployer).rebase()
    })

    it('should have 1 transaction', async function () {
      expect(await orchestrator.transactionsSize()).to.eq(1)
    })

    it('should call rebase on policy', async function () {
      await expect(r)
        .to.emit(mockPolicy, 'FunctionCalled')
        .withArgs('UFragmentsPolicy', 'rebase', orchestrator.address)
    })

    it('should call the transaction', async function () {
      await expect(r)
        .to.emit(mockDownstream, 'FunctionCalled')
        .withArgs('MockDownstream', 'updateOneArg', orchestrator.address)

      await expect(r)
        .to.emit(mockDownstream, 'FunctionArguments')
        .withArgs([12345], [])
    })

    it('should not have any subsequent logs', async function () {
      expect((await (await r).wait()).logs.length).to.eq(3)
    })
  })

  describe('when there are two transactions', async function () {
    before('adding a transaction', async function () {
      const updateTwoArgsEncoded =
        await mockDownstream.populateTransaction.updateTwoArgs(12345, 23456)
      await orchestrator
        .connect(deployer)
        .addTransaction(mockDownstream.address, updateTwoArgsEncoded.data)
      r = orchestrator.connect(deployer).rebase()
    })

    it('should have 2 transactions', async function () {
      expect(await orchestrator.transactionsSize()).to.eq(2)
    })

    it('should call rebase on policy', async function () {
      await expect(r)
        .to.emit(mockPolicy, 'FunctionCalled')
        .withArgs('UFragmentsPolicy', 'rebase', orchestrator.address)
    })

    it('should call first transaction', async function () {
      await expect(r)
        .to.emit(mockDownstream, 'FunctionCalled')
        .withArgs('MockDownstream', 'updateOneArg', orchestrator.address)

      await expect(r)
        .to.emit(mockDownstream, 'FunctionArguments')
        .withArgs([12345], [])
    })

    it('should call second transaction', async function () {
      await expect(r)
        .to.emit(mockDownstream, 'FunctionCalled')
        .withArgs('MockDownstream', 'updateTwoArgs', orchestrator.address)

      await expect(r)
        .to.emit(mockDownstream, 'FunctionArguments')
        .withArgs([12345], [23456])
    })

    it('should not have any subsequent logs', async function () {
      expect((await (await r).wait()).logs.length).to.eq(5)
    })
  })

  describe('when 1st transaction is disabled', async function () {
    before('disabling a transaction', async function () {
      await orchestrator.connect(deployer).setTransactionEnabled(0, false)
      r = orchestrator.connect(deployer).rebase()
    })

    it('should have 2 transactions', async function () {
      expect(await orchestrator.transactionsSize()).to.eq(2)
    })

    it('should call rebase on policy', async function () {
      await expect(r)
        .to.emit(mockPolicy, 'FunctionCalled')
        .withArgs('UFragmentsPolicy', 'rebase', orchestrator.address)
    })

    it('should call second transaction', async function () {
      await expect(r)
        .to.emit(mockDownstream, 'FunctionCalled')
        .withArgs('MockDownstream', 'updateTwoArgs', orchestrator.address)

      await expect(r)
        .to.emit(mockDownstream, 'FunctionArguments')
        .withArgs([12345], [23456])
    })

    it('should not have any subsequent logs', async function () {
      expect(await (await (await r).wait()).logs.length).to.eq(3)
    })
  })

  describe('when a transaction is removed', async function () {
    before('removing 1st transaction', async function () {
      await orchestrator.connect(deployer).removeTransaction(0)
      r = orchestrator.connect(deployer).rebase()
    })

    it('should have 1 transaction', async function () {
      expect(await orchestrator.transactionsSize()).to.eq(1)
    })

    it('should call rebase on policy', async function () {
      await expect(r)
        .to.emit(mockPolicy, 'FunctionCalled')
        .withArgs('UFragmentsPolicy', 'rebase', orchestrator.address)
    })

    it('should call the transaction', async function () {
      await expect(r)
        .to.emit(mockDownstream, 'FunctionCalled')
        .withArgs('MockDownstream', 'updateTwoArgs', orchestrator.address)

      await expect(r)
        .to.emit(mockDownstream, 'FunctionArguments')
        .withArgs([12345], [23456])
    })

    it('should not have any subsequent logs', async function () {
      expect((await (await r).wait()).logs.length).to.eq(3)
    })
  })

  describe('when all transactions are removed', async function () {
    before('removing 1st transaction', async function () {
      await orchestrator.connect(deployer).removeTransaction(0)
      r = orchestrator.connect(deployer).rebase()
    })

    it('should have 0 transactions', async function () {
      expect(await orchestrator.transactionsSize()).to.eq(0)
    })

    it('should call rebase on policy', async function () {
      await expect(r)
        .to.emit(mockPolicy, 'FunctionCalled')
        .withArgs('UFragmentsPolicy', 'rebase', orchestrator.address)
    })

    it('should not have any subsequent logs', async function () {
      expect((await (await r).wait()).logs.length).to.eq(1)
    })
  })

  describe('when a transaction reverts', async function () {
    before('adding 3 transactions', async function () {
      const updateOneArgEncoded =
        await mockDownstream.populateTransaction.updateOneArg(123)
      await orchestrator
        .connect(deployer)
        .addTransaction(mockDownstream.address, updateOneArgEncoded.data)

      const revertsEncoded = await mockDownstream.populateTransaction.reverts()
      await orchestrator
        .connect(deployer)
        .addTransaction(mockDownstream.address, revertsEncoded.data)

      const updateTwoArgsEncoded =
        await mockDownstream.populateTransaction.updateTwoArgs(12345, 23456)
      await orchestrator
        .connect(deployer)
        .addTransaction(mockDownstream.address, updateTwoArgsEncoded.data)
      await expect(orchestrator.connect(deployer).rebase()).to.be.reverted
    })

    it('should have 3 transactions', async function () {
      expect(await orchestrator.transactionsSize()).to.eq(3)
    })
  })

  describe('Access Control', function () {
    describe('addTransaction', async function () {
      it('should be callable by owner', async function () {
        const updateNoArgEncoded =
          await mockDownstream.populateTransaction.updateNoArg()
        await expect(
          orchestrator
            .connect(deployer)
            .addTransaction(mockDownstream.address, updateNoArgEncoded.data),
        ).to.not.be.reverted
      })

      it('should not be callable by others', async function () {
        const updateNoArgEncoded =
          await mockDownstream.populateTransaction.updateNoArg()
        await expect(
          orchestrator
            .connect(user)
            .addTransaction(mockDownstream.address, updateNoArgEncoded.data),
        ).to.be.reverted
      })
    })

    describe('setTransactionEnabled', async function () {
      it('should be callable by owner', async function () {
        expect(await orchestrator.transactionsSize()).to.gt(0)
        await expect(
          orchestrator.connect(deployer).setTransactionEnabled(0, true),
        ).to.not.be.reverted
      })

      it('should revert if index out of bounds', async function () {
        expect(await orchestrator.transactionsSize()).to.lt(5)
        await expect(
          orchestrator.connect(deployer).setTransactionEnabled(5, true),
        ).to.be.reverted
      })

      it('should not be callable by others', async function () {
        expect(await orchestrator.transactionsSize()).to.gt(0)
        await expect(orchestrator.connect(user).setTransactionEnabled(0, true))
          .to.be.reverted
      })
    })

    describe('removeTransaction', async function () {
      it('should not be callable by others', async function () {
        expect(await orchestrator.transactionsSize()).to.gt(0)
        await expect(orchestrator.connect(user).removeTransaction(0)).to.be
          .reverted
      })

      it('should revert if index out of bounds', async function () {
        expect(await orchestrator.transactionsSize()).to.lt(5)
        await expect(orchestrator.connect(deployer).removeTransaction(5)).to.be
          .reverted
      })

      it('should be callable by owner', async function () {
        expect(await orchestrator.transactionsSize()).to.gt(0)
        await expect(orchestrator.connect(deployer).removeTransaction(0)).to.not
          .be.reverted
      })
    })

    describe('transferOwnership', async function () {
      it('should transfer ownership', async function () {
        expect(await orchestrator.owner()).to.eq(await deployer.getAddress())
        await orchestrator
          .connect(deployer)
          .transferOwnership(user.getAddress())
        expect(await orchestrator.owner()).to.eq(await user.getAddress())
      })
    })
  })
})
