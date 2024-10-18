import { readFileSync } from 'fs'
import * as path from 'path'

import { task } from 'hardhat/config'
import { getAdminAddress } from '@openzeppelin/upgrades-core'
import { Interface } from '@ethersproject/abi'
import { TransactionReceipt } from '@ethersproject/providers'
import ProxyAdmin from '@openzeppelin/upgrades-core/artifacts/ProxyAdmin.json'

import {
  getContractFactoryFromExternalArtifacts,
  verify,
  sleep,
} from './helpers'

const parseEvents = (
  receipt: TransactionReceipt,
  contractInterface: Interface,
  eventName: string,
) =>
  receipt.logs
    .map((log) => contractInterface.parseLog(log))
    .filter((log) => log.name === eventName)

task('check:admin', 'Upgrade ampleforth contracts')
  .addParam('address', 'proxy address')
  .setAction(async (args, hre) => {
    console.log(await getAdminAddress(hre.ethers.provider, args.address))
  })

task('upgrade:ampl', 'Upgrade ampleforth contracts')
  .addParam('contract', 'which implementation contract to use')
  .addParam('address', 'which proxy address to upgrade')
  .addOptionalParam('multisig', 'which multisig address to use for upgrade')
  .setAction(async (args, hre) => {
    console.log(args)
    const upgrades = hre.upgrades as any

    // can only upgrade token or policy
    const supported = ['UFragments', 'UFragmentsPolicy']
    if (!supported.includes(args.contract)) {
      throw new Error(
        `requested to upgrade ${args.contract} but only ${supported} are supported`,
      )
    }

    // get signers
    const deployer = (await hre.ethers.getSigners())[0]
    console.log('Deployer', await deployer.getAddress())

    if (args.multisig) {
      // deploy new implementation
      const implementation = await upgrades.prepareUpgrade(
        args.address,
        await hre.ethers.getContractFactory(args.contract),
      )
      console.log(
        `New implementation for ${args.contract} deployed to`,
        implementation,
      )

      // prepare upgrade transaction
      const admin = new hre.ethers.Contract(
        await getAdminAddress(hre.ethers.provider, args.address),
        ProxyAdmin.abi,
        deployer,
      )
      const upgradeTx = await admin.populateTransaction.upgrade(
        args.address,
        implementation,
      )
      console.log(`Upgrade transaction`, upgradeTx)

      // send upgrade transaction to multisig
      const MultisigWallet = await getContractFactoryFromExternalArtifacts(
        hre,
        'MultiSigWallet',
      )
      const multisig = (await MultisigWallet.attach(args.multisig)).connect(
        deployer,
      )

      const receipt = await (
        await multisig.submitTransaction(
          upgradeTx.to,
          upgradeTx.value,
          upgradeTx.data,
        )
      ).wait()
      const events = parseEvents(receipt, multisig.interface, 'Submission')
      console.log(
        `Upgrade transaction submitted to multisig with transaction index`,
        events[0].args.transactionId,
      )
    } else {
      await upgrades.upgradeProxy(
        args.address,
        await hre.ethers.getContractFactory(args.contract),
      )
      console.log(args.contract, 'upgraded')
    }
  })

task('prep:upgrade:policy')
  .addParam('address', 'which proxy address to upgrade')
  .setAction(async function (args: TaskArguments, hre) {
    console.log(args)
    const upgrades = hre.upgrades as any

    const signer = (await hre.ethers.getSigners())[0]
    const signerAddress = await signer.getAddress()
    console.log('Signer', signerAddress)

    const newFactory = await hre.ethers.getContractFactory('UFragmentsPolicy')
    await upgrades.validateUpgrade(args.address, newFactory)
    const newImpl = await upgrades.prepareUpgrade(args.address, newFactory)
    console.log('New implementation at:', newImpl)

    console.log('Update implementation by executing the following')
    console.log(
      'Proxy Admin',
      await getAdminAddress(hre.ethers.provider, args.address),
    )
    console.log(`proxyAdmin.upgrade(${args.address}, ${newImpl})`)

    await sleep(15)
    await verify(hre, newImpl, [])
  })
