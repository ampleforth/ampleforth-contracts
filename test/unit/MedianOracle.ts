import { ethers } from 'hardhat'
import { BigNumber, Contract, ContractFactory, Signer } from 'ethers'
import { increaseTime } from '../utils/utils'
import { expect } from 'chai'

let factory: ContractFactory
let oracle: Contract
let accounts: Signer[],
  deployer: Signer,
  A: Signer,
  B: Signer,
  C: Signer,
  D: Signer
let payload: BigNumber
let callerContract: Contract

async function setupContractsAndAccounts() {
  accounts = await ethers.getSigners()
  deployer = accounts[0]
  A = accounts[1]
  B = accounts[2]
  C = accounts[3]
  D = accounts[4]
  factory = await ethers.getContractFactory('MedianOracle')
  oracle = await factory.deploy()
  await oracle.init(60, 10, 1)
  await oracle.deployed()
}

async function setupCallerContract() {
  let callerContractFactory = await ethers.getContractFactory(
    'GetMedianOracleDataCallerContract',
  )
  callerContract = await callerContractFactory.deploy()
  await callerContract.deployed()
  await callerContract.setOracle(oracle.address)
}

describe('MedianOracle:constructor', async function () {
  before(async function () {
    await setupContractsAndAccounts()
  })

  it('should fail if a parameter is invalid', async function () {
    await expect(factory.deploy(60, 10, 0)).to.be.reverted
    await expect(factory.deploy(60 * 60 * 24 * 365 * 11, 10, 1)).to.be.reverted
    await expect(oracle.setReportExpirationTimeSec(60 * 60 * 24 * 365 * 11)).to
      .be.reverted
  })
})

describe('MedianOracle:providersSize', async function () {
  before(async function () {
    await setupContractsAndAccounts()
  })

  it('should return the number of sources added to the whitelist', async function () {
    await oracle.addProvider(await A.getAddress())
    await oracle.addProvider(await B.getAddress())
    await oracle.addProvider(await C.getAddress())
    expect(await oracle.providersSize()).to.eq(BigNumber.from(3))
  })
})

describe('MedianOracle:addProvider', async function () {
  before(async function () {
    await setupContractsAndAccounts()
    expect(await oracle.providersSize()).to.eq(BigNumber.from(0))
  })

  it('should emit ProviderAdded message', async function () {
    await expect(oracle.addProvider(await A.getAddress()))
      .to.emit(oracle, 'ProviderAdded')
      .withArgs(await A.getAddress())
  })

  describe('when successful', async function () {
    it('should add source to the whitelist', async function () {
      expect(await oracle.providersSize()).to.eq(BigNumber.from(1))
    })
    it('should not add an existing source to the whitelist', async function () {
      await expect(oracle.addProvider(await A.getAddress())).to.be.reverted
    })
  })
})

describe('MedianOracle:pushReport', async function () {
  beforeEach(async function () {
    await setupContractsAndAccounts()
    payload = BigNumber.from('1000000000000000000')
  })
  it('should only push from authorized source', async function () {
    await expect(oracle.connect(A).pushReport(payload)).to.be.reverted
  })
  it('should fail if reportDelaySec did not pass since the previous push', async function () {
    await oracle.addProvider(await A.getAddress())
    await oracle.connect(A).pushReport(payload)
    await expect(oracle.connect(A).pushReport(payload)).to.be.reverted
  })
  it('should emit ProviderReportPushed message', async function () {
    oracle.addProvider(await A.getAddress())
    const tx = await oracle.connect(A).pushReport(payload)
    const txReceipt = await tx.wait()
    const txBlock = (await ethers.provider.getBlock(txReceipt.blockNumber))
      .timestamp
    const txEvents = txReceipt.events?.filter((x: any) => {
      return x.event == 'ProviderReportPushed'
    })
    expect(txEvents.length).to.equal(1)
    const event = txEvents[0]
    expect(event.args.length).to.equal(3)
    expect(event.args.provider).to.equal(await A.getAddress())
    expect(event.args.payload).to.equal(payload)
    expect(event.args.timestamp).to.equal(txBlock)
  })
})

describe('MedianOracle:addProvider:accessControl', async function () {
  before(async function () {
    await setupContractsAndAccounts()
  })

  it('should be callable by owner', async function () {
    await oracle.addProvider(await A.getAddress())
  })

  it('should NOT be callable by non-owner', async function () {
    await expect(oracle.connect(B).addProvider(A)).to.be.reverted
  })
})

describe('MedianOracle:removeProvider', async function () {
  describe('when source is part of the whitelist', () => {
    before(async function () {
      payload = BigNumber.from('1000000000000000000')
      await setupContractsAndAccounts()
      await oracle.addProvider(await A.getAddress())
      await oracle.addProvider(await B.getAddress())
      await oracle.addProvider(await C.getAddress())
      await oracle.addProvider(await D.getAddress())
      expect(await oracle.providersSize()).to.eq(BigNumber.from(4))
    })
    it('should emit ProviderRemoved message', async function () {
      expect(await oracle.removeProvider(await B.getAddress()))
        .to.emit(oracle, 'ProviderRemoved')
        .withArgs(await B.getAddress())
    })
    it('should remove source from the whitelist', async function () {
      expect(await oracle.providersSize()).to.eq(BigNumber.from(3))
      await expect(oracle.connect(B).pushReport(payload)).to.be.reverted
      await oracle.connect(D).pushReport(payload)
    })
  })
})

describe('MedianOracle:removeProvider', async function () {
  beforeEach(async function () {
    await setupContractsAndAccounts()
    await oracle.addProvider(await A.getAddress())
    await oracle.addProvider(await B.getAddress())
    await oracle.addProvider(await C.getAddress())
    await oracle.addProvider(await D.getAddress())
    expect(await oracle.providersSize()).to.eq(BigNumber.from(4))
  })
  it('Remove last element', async function () {
    await oracle.removeProvider(await D.getAddress())
    expect(await oracle.providersSize()).to.eq(BigNumber.from(3))
    expect(await oracle.providers(0)).to.eq(await A.getAddress())
    expect(await oracle.providers(1)).to.eq(await B.getAddress())
    expect(await oracle.providers(2)).to.eq(await C.getAddress())
  })

  it('Remove middle element', async function () {
    await oracle.removeProvider(await B.getAddress())
    expect(await oracle.providersSize()).to.eq(BigNumber.from(3))
    expect(await oracle.providers(0)).to.eq(await A.getAddress())
    expect(await oracle.providers(1)).to.eq(await D.getAddress())
    expect(await oracle.providers(2)).to.eq(await C.getAddress())
  })

  it('Remove only element', async function () {
    await oracle.removeProvider(await A.getAddress())
    await oracle.removeProvider(await B.getAddress())
    await oracle.removeProvider(await C.getAddress())
    expect(await oracle.providersSize()).to.eq(BigNumber.from(1))
    expect(await oracle.providers(0)).to.eq(await D.getAddress())
    await oracle.removeProvider(await D.getAddress())
    expect(await oracle.providersSize()).to.eq(BigNumber.from(0))
  })
})

describe('MedianOracle:removeProvider', async function () {
  it('when provider is NOT part of the whitelist', async function () {
    await setupContractsAndAccounts()
    await oracle.addProvider(await A.getAddress())
    await oracle.addProvider(await B.getAddress())
    expect(await oracle.providersSize()).to.eq(BigNumber.from(2))
    await oracle.removeProvider(await C.getAddress())
    expect(await oracle.providersSize()).to.eq(BigNumber.from(2))
    expect(await oracle.providers(0)).to.eq(await A.getAddress())
    expect(await oracle.providers(1)).to.eq(await B.getAddress())
  })
})

describe('MedianOracle:removeProvider:accessControl', async function () {
  beforeEach(async function () {
    await setupContractsAndAccounts()
    await oracle.addProvider(await A.getAddress())
  })

  it('should be callable by owner', async function () {
    await oracle.removeProvider(await A.getAddress())
  })

  it('should NOT be callable by non-owner', async function () {
    await expect(oracle.connect(A).removeProvider(await A.getAddress())).to.be
      .reverted
  })
})

describe('MedianOracle:getData', async function () {
  before(async function () {
    await setupContractsAndAccounts()
    await setupCallerContract()

    await oracle.addProvider(await A.getAddress())
    await oracle.addProvider(await B.getAddress())
    await oracle.addProvider(await C.getAddress())
    await oracle.addProvider(await D.getAddress())

    await oracle.connect(D).pushReport(BigNumber.from('1000000000000000000'))
    await oracle.connect(B).pushReport(BigNumber.from('1041000000000000000'))
    await oracle.connect(A).pushReport(BigNumber.from('1053200000000000000'))
    await oracle.connect(C).pushReport(BigNumber.from('2041000000000000000'))

    await increaseTime(40)
  })

  describe('when the reports are valid', function () {
    it('should calculate the combined market rate and volume', async function () {
      await expect(callerContract.getData())
        .to.emit(callerContract, 'ReturnValueUInt256Bool')
        .withArgs(BigNumber.from('1047100000000000000'), true)
    })
  })
})

describe('MedianOracle:getData', async function () {
  describe('when one of reports has expired', function () {
    before(async function () {
      await setupContractsAndAccounts()
      await setupCallerContract()

      await oracle.addProvider(await A.getAddress())
      await oracle.addProvider(await B.getAddress())
      await oracle.addProvider(await C.getAddress())
      await oracle.addProvider(await D.getAddress())

      await oracle.setReportExpirationTimeSec(40)
      await oracle.connect(C).pushReport(BigNumber.from('2041000000000000000'))
      await increaseTime(41)

      await oracle.connect(B).pushReport(BigNumber.from('1041000000000000000'))
      await oracle.connect(D).pushReport(BigNumber.from('1000000000000000000'))
      await oracle.connect(A).pushReport(BigNumber.from('1053200000000000000'))
      await increaseTime(10)
    })

    it('should emit ReportTimestampOutOfRange message', async function () {
      await expect(oracle.getData())
        .to.emit(oracle, 'ReportTimestampOutOfRange')
        .withArgs(await C.getAddress())
    })
    it('should calculate the exchange rate', async function () {
      await expect(callerContract.getData())
        .to.emit(callerContract, 'ReturnValueUInt256Bool')
        .withArgs(BigNumber.from('1041000000000000000'), true)
    })
  })
})

describe('MedianOracle:getData', async function () {
  describe('when one of the reports is too recent', function () {
    before(async function () {
      await setupContractsAndAccounts()
      await setupCallerContract()

      await oracle.addProvider(await A.getAddress())
      await oracle.addProvider(await B.getAddress())
      await oracle.addProvider(await C.getAddress())
      await oracle.addProvider(await D.getAddress())

      await oracle.connect(C).pushReport(BigNumber.from('2041000000000000000'))
      await oracle.connect(D).pushReport(BigNumber.from('1000000000000000000'))
      await oracle.connect(A).pushReport(BigNumber.from('1053200000000000000'))
      await increaseTime(10)
      await oracle.connect(B).pushReport(BigNumber.from('1041000000000000000'))
    })

    it('should emit ReportTimestampOutOfRange message', async function () {
      await expect(oracle.getData())
        .to.emit(oracle, 'ReportTimestampOutOfRange')
        .withArgs(await B.getAddress())
    })
    it('should calculate the exchange rate', async function () {
      await expect(callerContract.getData())
        .to.emit(callerContract, 'ReturnValueUInt256Bool')
        .withArgs(BigNumber.from('1053200000000000000'), true)
    })
  })
})

describe('MedianOracle:getData', async function () {
  describe('when not enough providers are valid', function () {
    before(async function () {
      await setupContractsAndAccounts()
      await setupCallerContract()

      await oracle.addProvider(await A.getAddress())
      await oracle.addProvider(await B.getAddress())
      await oracle.addProvider(await C.getAddress())
      await oracle.addProvider(await D.getAddress())

      await expect(oracle.setMinimumProviders(0)).to.be.reverted
      await oracle.setMinimumProviders(4)

      await oracle.connect(C).pushReport(BigNumber.from('2041000000000000000'))
      await oracle.connect(D).pushReport(BigNumber.from('1000000000000000000'))
      await oracle.connect(A).pushReport(BigNumber.from('1053200000000000000'))
      await increaseTime(10)
      await oracle.connect(B).pushReport(BigNumber.from('1041000000000000000'))
    })

    it('should emit ReportTimestampOutOfRange message', async function () {
      await expect(oracle.getData())
        .to.emit(oracle, 'ReportTimestampOutOfRange')
        .withArgs(await B.getAddress())
    })
    it('should not have a valid result', async function () {
      await expect(callerContract.getData())
        .to.emit(callerContract, 'ReturnValueUInt256Bool')
        .withArgs(BigNumber.from(0), false)
    })
  })
})

describe('MedianOracle:getData', async function () {
  describe('when all reports have expired', function () {
    before(async function () {
      await setupContractsAndAccounts()
      await setupCallerContract()

      await oracle.addProvider(await A.getAddress())
      await oracle.addProvider(await B.getAddress())

      await oracle.connect(A).pushReport(BigNumber.from('1053200000000000000'))
      await oracle.connect(B).pushReport(BigNumber.from('1041000000000000000'))

      await increaseTime(61)
    })

    it('should emit 2 ReportTimestampOutOfRange messages', async function () {
      const tx = await oracle.getData()
      const txReceipt = await tx.wait()
      const txEvents = txReceipt.events?.filter((x: any) => {
        return x.event == 'ReportTimestampOutOfRange'
      })
      expect(txEvents.length).to.equal(2)
      const eventA = txEvents[0]
      expect(eventA.args.provider).to.equal(await A.getAddress())
      const eventB = txEvents[1]
      expect(eventB.args.provider).to.equal(await B.getAddress())
    })
    it('should return false and 0', async function () {
      await expect(callerContract.getData())
        .to.emit(callerContract, 'ReturnValueUInt256Bool')
        .withArgs(BigNumber.from(0), false)
    })
  })
})

describe('MedianOracle:getData', async function () {
  before(async function () {
    await setupContractsAndAccounts()
    await setupCallerContract()

    await oracle.addProvider(await A.getAddress())

    await oracle.connect(A).pushReport(BigNumber.from('1100000000000000000'))
    await increaseTime(61)
    await oracle.connect(A).pushReport(BigNumber.from('1200000000000000000'))
  })

  describe('when recent is too recent and past is too old', function () {
    it('should emit ReportTimestampOutOfRange message', async function () {
      await expect(oracle.getData())
        .to.emit(oracle, 'ReportTimestampOutOfRange')
        .withArgs(await A.getAddress())
    })
    it('should fail', async function () {
      await expect(callerContract.getData())
        .to.emit(callerContract, 'ReturnValueUInt256Bool')
        .withArgs(BigNumber.from(0), false)
    })
  })
})

describe('MedianOracle:getData', async function () {
  before(async function () {
    await setupContractsAndAccounts()
    await setupCallerContract()
    await oracle.addProvider(await A.getAddress())

    await oracle.connect(A).pushReport(BigNumber.from('1100000000000000000'))
    await increaseTime(10)
    await oracle.connect(A).pushReport(BigNumber.from('1200000000000000000'))
    await increaseTime(1)
    await oracle.setReportDelaySec(30)
  })

  describe('when recent is too recent and past is too recent', function () {
    it('should emit ReportTimestampOutOfRange message', async function () {
      await expect(oracle.getData())
        .to.emit(oracle, 'ReportTimestampOutOfRange')
        .withArgs(await A.getAddress())
    })
    it('should fail', async function () {
      await expect(callerContract.getData())
        .to.emit(callerContract, 'ReturnValueUInt256Bool')
        .withArgs(BigNumber.from(0), false)
    })
  })
})

describe('MedianOracle:getData', async function () {
  before(async function () {
    await setupContractsAndAccounts()
    await setupCallerContract()

    await oracle.addProvider(await A.getAddress())

    await oracle.connect(A).pushReport(BigNumber.from('1100000000000000000'))
    await increaseTime(30)
    await oracle.connect(A).pushReport(BigNumber.from('1200000000000000000'))
    await increaseTime(4)
  })

  describe('when recent is too recent and past is valid', function () {
    it('should succeed', async function () {
      await expect(callerContract.getData())
        .to.emit(callerContract, 'ReturnValueUInt256Bool')
        .withArgs(BigNumber.from('1100000000000000000'), true)
    })
  })
})

describe('MedianOracle:getData', async function () {
  before(async function () {
    await setupContractsAndAccounts()
    await setupCallerContract()

    await oracle.addProvider(await A.getAddress())

    await oracle.connect(A).pushReport(BigNumber.from('1100000000000000000'))
    await increaseTime(30)
    await oracle.connect(A).pushReport(BigNumber.from('1200000000000000000'))
    await increaseTime(10)
  })

  describe('when recent is not too recent nor too old', function () {
    it('should succeed', async function () {
      await expect(callerContract.getData())
        .to.emit(callerContract, 'ReturnValueUInt256Bool')
        .withArgs(BigNumber.from('1200000000000000000'), true)
    })
  })
})

describe('MedianOracle:getData', async function () {
  before(async function () {
    await setupContractsAndAccounts()
    await setupCallerContract()

    await oracle.addProvider(await A.getAddress())

    await oracle.connect(A).pushReport(BigNumber.from('1100000000000000000'))
    await increaseTime(30)
    await oracle.connect(A).pushReport(BigNumber.from('1200000000000000000'))
    await increaseTime(80)
  })

  describe('when recent is not too recent but too old', function () {
    it('should fail', async function () {
      await expect(callerContract.getData())
        .to.emit(callerContract, 'ReturnValueUInt256Bool')
        .withArgs(BigNumber.from(0), false)
    })
  })
})

describe('MedianOracle:PurgeReports', async function () {
  before(async function () {
    await setupContractsAndAccounts()
    await setupCallerContract()

    await oracle.addProvider(await A.getAddress())

    await oracle.connect(A).pushReport(BigNumber.from('1100000000000000000'))
    await increaseTime(20)
    await oracle.connect(A).pushReport(BigNumber.from('1200000000000000000'))
    await increaseTime(20)
    await oracle.connect(A).purgeReports()
  })

  it('data not available after purge', async function () {
    await expect(callerContract.getData())
      .to.emit(callerContract, 'ReturnValueUInt256Bool')
      .withArgs(BigNumber.from(0), false)
  })
  it('data available after another report', async function () {
    await oracle.connect(A).pushReport(BigNumber.from('1300000000000000000'))
    await increaseTime(20)
    await expect(callerContract.getData())
      .to.emit(callerContract, 'ReturnValueUInt256Bool')
      .withArgs(BigNumber.from('1300000000000000000'), true)
  })
  it('cannot purge a non-whitelisted provider', async function () {
    await expect(oracle.connect(B).purgeReports()).to.be.reverted
    await oracle.connect(A).purgeReports()
    await oracle.removeProvider(await A.getAddress())
    await expect(oracle.connect(A).purgeReports()).to.be.reverted
  })
})
