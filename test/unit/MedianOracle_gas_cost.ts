// TODO(naguib): Fail tests if gas utilization changes
import { ethers } from 'hardhat'
import { BigNumber, Contract, ContractFactory, Signer } from 'ethers'
import { increaseTime } from '../utils/utils'

let factory: ContractFactory
let oracle: Contract
let accounts: Signer[]

async function setupContractsAndAccounts() {
  accounts = await ethers.getSigners()
  factory = await ethers.getContractFactory('MedianOracle')
  oracle = await factory.deploy(60, 10, 1)
  await oracle.deployed()
}

// TODO(naguib): Fail if gas utilization changes.
describe('MedianOracle:GasTests', async function () {
  before(async function () {
    await setupContractsAndAccounts()
    const count = 9
    const list = Array.from({ length: count }, () =>
      BigNumber.from(Math.floor(Math.random() * 10 ** 18).toString()),
    )

    for (let i = 0; i < count; i++) {
      await oracle.addProvider(await accounts[i + 1].getAddress())
      const tx = await oracle.connect(accounts[i + 1]).pushReport(list[i])
      const r = await tx.wait()
      console.log('Initial pushReport() gas:', r.gasUsed)
    }
    increaseTime(10)
    for (let i = 0; i < count; i++) {
      const tx = await oracle
        .connect(accounts[i + 1])
        .pushReport(list[i].add(BigNumber.from(1)))
      const r = await tx.wait()
      console.log('Update pushReport() gas:', r.gasUsed)
    }
  })

  describe('when the sources are live', function () {
    it('should calculate the combined market rate and volume', async function () {
      const tx = await oracle.getData()
      const r = await tx.wait()
      console.log('getData() gas:', r.gasUsed)
    })
  })
})
