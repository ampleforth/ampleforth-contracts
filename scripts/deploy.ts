import { task } from 'hardhat/config'
import { getAdminAddress } from '@openzeppelin/upgrades-core'
import ProxyAdmin from '@openzeppelin/upgrades-core/artifacts/ProxyAdmin.json'
import MultiSigWallet from './MultiSigWalletWithDailyLimit.json'
import { Interface } from '@ethersproject/abi'
import { TransactionReceipt } from '@ethersproject/providers'

const parseEvents = (
  receipt: TransactionReceipt,
  contractInterface: Interface,
  eventName: string,
) =>
  receipt.logs
    .map((log) => contractInterface.parseLog(log))
    .filter((log) => log.name === eventName)

task('deploy:ampl', 'Deploy ampleforth contracts').setAction(
  async (args, hre) => {
    console.log(args)

    // get signers
    const deployer = (await hre.ethers.getSigners())[0]
    console.log('Deployer', await deployer.getAddress())

    // set init params
    const owner = await deployer.getAddress()
    const BASE_CPI = hre.ethers.utils.parseUnits('1', 20)

    // deploy UFragments
    const uFragments = await (
      await hre.upgrades.deployProxy(
        (await hre.ethers.getContractFactory('UFragments')).connect(deployer),
        [owner],
        {
          initializer: 'initialize(address)',
        },
      )
    ).deployed()
    console.log('UFragments deployed to:', uFragments.address)

    // deploy Policy
    const uFragmentsPolicy = await (
      await hre.upgrades.deployProxy(
        (await hre.ethers.getContractFactory('UFragmentsPolicy')).connect(
          deployer,
        ),
        [owner, uFragments.address, BASE_CPI.toString()],
        {
          initializer: 'initialize(address,address,uint256)',
        },
      )
    ).deployed()
    console.log('UFragmentsPolicy deployed to:', uFragmentsPolicy.address)

    // deploy Orchestrator
    const orchestrator = await (
      await hre.ethers.getContractFactory('Orchestrator')
    )
      .connect(deployer)
      .deploy(uFragmentsPolicy.address)
    console.log('Orchestrator deployed to:', orchestrator.address)
  },
)

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
      const multisig = new hre.ethers.Contract(
        args.multisig,
        MultiSigWallet,
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

task('deploy:wampl', 'Deploy wampl contract')
  .addParam('ampl', 'The address to the AMPL token')
  .addParam('name', 'The ERC-20 name of the wAMPL token')
  .addParam('symbol', 'The ERC-20 symbol of the wAMPL token')
  .setAction(async (args, hre) => {
    console.log(args)

    // get signers
    const deployer = (await hre.ethers.getSigners())[0]
    console.log('Deployer', await deployer.getAddress())

    // deploy contract
    const constructorArguments = [args.ampl, args.name, args.symbol]
    const wampl = await (await hre.ethers.getContractFactory('WAMPL'))
      .connect(deployer)
      .deploy(...constructorArguments)
    console.log('wAMPL deployed to:', wampl.address)
    await wampl.deployTransaction.wait(5)

    await hre.run('verify:verify', {
      address: wampl.address,
      constructorArguments,
    })
  })
