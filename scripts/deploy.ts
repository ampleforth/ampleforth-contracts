import { BigNumber, utils, constants } from 'ethers'
import { task } from 'hardhat/config'
import { Interface } from '@ethersproject/abi'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

import {
  waitFor,
  deployContract,
  deployProxy,
  deployExternalArtifact,
  verify,
} from './helpers'

task('deploy:amplforce:testnet', 'Deploy ampleforth contract suite for testnet')
  .addFlag('verify', 'The ERC-20 name of the wAMPL token')
  .addFlag('setupMultisig', 'Sets up multisig admin and transfers onwership')
  .setAction(async (args, hre) => {
    // HARD-CODED config values

    // The value of CPI which was set when v1.0.0 contracts were deployed in july 2019
    const INITIAL_CPI = BigNumber.from('109195000000000007392')
    const INITIAL_RATE = utils.parseUnits('1', 18) // 1.0

    // Rate oracle
    const RATE_REPORT_EXPIRATION_SEC = 86400 // 1 day
    const RATE_REPORT_DELAY_SEC = 0
    const RATE_MIN_PROVIDERS = 1

    // CPI oracle
    const CPI_REPORT_EXPIRATION_SEC = 7776000 // 90 days
    const CPI_REPORT_DELAY_SEC = 0
    const CPI_MIN_PROVIDERS = 1

    // Policy
    const DEVIATION_TRESHOLD = utils.parseUnits('0.002', 18) // 0.002% (ie) 0.05/24)
    const LOWER = utils.parseUnits('-0.005', 18) // rebaseFunctionNegativePercentageLimit
    const UPPER = utils.parseUnits('0.005', 18) // rebaseFunctionPositivePercentageLimit
    const POSITIVE_GROWTH = utils.parseUnits('31', 18) // rebaseFunctionPositiveGrowth;
    const NEGATIVE_GROWTH = utils.parseUnits('41', 18) // rebaseFunctionNegativeGrowth;
    const MIN_REBASE_INTERVAL = 1200 // 20 mins
    const REBASE_WINDOW_OFFSET = 0
    const REBASE_WINDOW_LEN = 2400 // 40 mins

    // AMPL
    const DECIMALS = 9

    // get signers
    const deployer = (await hre.ethers.getSigners())[0]
    const owner = await deployer.getAddress()
    console.log('Deployer', owner)

    // deploy ampl erc-20
    const ampl = await deployProxy(
      hre,
      'UFragments',
      deployer,
      'initialize(address)',
      [owner],
    )
    const amplImpl = await getImplementationAddress(
      hre.ethers.provider,
      ampl.address,
    )
    console.log('UFragments deployed to:', ampl.address)
    console.log('Implementation:', amplImpl)

    // deploy market oracle
    const marketOracle = await deployContract(hre, 'MedianOracle', deployer)
    await marketOracle.init(
      RATE_REPORT_EXPIRATION_SEC,
      RATE_REPORT_DELAY_SEC,
      RATE_MIN_PROVIDERS,
    )
    console.log('Market oracle to:', marketOracle.address)

    // deploy cpi oracle
    const cpiOracle = await deployContract(hre, 'MedianOracle', deployer)
    await cpiOracle.init(
      CPI_REPORT_EXPIRATION_SEC,
      CPI_REPORT_DELAY_SEC,
      CPI_MIN_PROVIDERS,
    )
    console.log('CPI oracle to:', cpiOracle.address)

    // deploy policy
    const policy = await deployProxy(
      hre,
      'UFragmentsPolicy',
      deployer,
      'initialize(address,address,uint256)',
      [owner, ampl.address, INITIAL_CPI.toString()],
    )
    const policyImpl = await getImplementationAddress(
      hre.ethers.provider,
      policy.address,
    )
    console.log('UFragmentsPolicy deployed to:', policy.address)
    console.log('Implementation:', policyImpl)

    // deploy orchestrator
    const orchestratorParams = [policy.address]
    const orchestrator = await deployContract(
      hre,
      'Orchestrator',
      deployer,
      orchestratorParams,
    )
    console.log('Orchestrator deployed to:', orchestrator.address)

    // Set references
    await waitFor(ampl.connect(deployer).setMonetaryPolicy(policy.address))
    await waitFor(
      policy.connect(deployer).setMarketOracle(marketOracle.address),
    )
    await waitFor(policy.connect(deployer).setCpiOracle(cpiOracle.address))
    await waitFor(
      policy.connect(deployer).setOrchestrator(orchestrator.address),
    )
    console.log('References set')

    // configure parameters
    await waitFor(policy.setDeviationThreshold(DEVIATION_TRESHOLD))
    await waitFor(policy.setRebaseFunctionPositiveGrowth(POSITIVE_GROWTH))
    await waitFor(policy.setRebaseFunctionNegativeGrowth(NEGATIVE_GROWTH))
    await waitFor(policy.setRebaseFunctionNegativePercentageLimit(LOWER))
    await waitFor(policy.setRebaseFunctionPositivePercentageLimit(UPPER))
    await waitFor(
      policy.setRebaseTimingParameters(
        MIN_REBASE_INTERVAL,
        REBASE_WINDOW_OFFSET,
        REBASE_WINDOW_LEN,
      ),
    )
    await waitFor(marketOracle.addProvider(owner))
    await waitFor(cpiOracle.addProvider(owner))
    console.log('Parameters configured')

    // initial rebase
    await waitFor(marketOracle.pushReport(INITIAL_RATE))
    await waitFor(cpiOracle.pushReport(INITIAL_CPI))
    await waitFor(orchestrator.rebase())
    const r = await policy.globalAmpleforthEpochAndAMPLSupply()
    console.log(
      `Rebase success: ${r[0].toString()} ${utils.formatUnits(
        r[1].toString(),
        DECIMALS,
      )}`,
    )

    // transferring ownership to multisig
    if (args.setupMultisig) {
      const adminWallet = await deployExternalArtifact(
        hre,
        'MultiSigWallet',
        deployer,
        [[owner], 1],
      )
      console.log('Admin/Provider wallet: ', adminWallet.address)
      await waitFor(marketOracle.addProvider(adminWallet.address))
      await waitFor(cpiOracle.addProvider(adminWallet.address))

      console.log('Transferring ownership to: ', adminWallet.address)
      await waitFor(marketOracle.transferOwnership(adminWallet.address))
      await waitFor(cpiOracle.transferOwnership(adminWallet.address))
      await waitFor(ampl.transferOwnership(adminWallet.address))
      await waitFor(policy.transferOwnership(adminWallet.address))
      await waitFor(orchestrator.transferOwnership(adminWallet.address))
    }

    // verification
    if (args.verify) {
      console.log('Verifying contracts:')
      await verify(hre, marketOracle.address)
      await verify(hre, cpiOracle.address)
      await verify(hre, orchestrator.address, orchestratorParams)
      await verify(hre, ampl.address)
      await verify(hre, policy.address)
      await verify(hre, amplImpl)
      await verify(hre, policyImpl)
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
    const wampl = await deployContract(hre, 'WAMPL', deployer, [args.ampl])
    await wampl.init(args.name, args.symbol)
    console.log('wAMPL deployed to:', wampl.address)

    // wait and verify
    await wampl.deployTransaction.wait(5)
    await verify(hre, wampl.address, [args.ampl])
  })

task('deploy:oracle', 'Deploy the median oracle contract')
  .addParam('expiry', 'The report expiry')
  .addParam('delay', 'The report delay')
  .addParam('scalar', 'The scaling factor')
  .setAction(async (args, hre) => {
    console.log(args)

    // get signers
    const deployer = (await hre.ethers.getSigners())[0]
    console.log('Deployer', await deployer.getAddress())

    // deploy contract
    const oracle = await deployContract(hre, 'MedianOracle', deployer, [])
    await oracle.init(args.expiry, args.delay, 1, args.scalar)
    console.log('Oracle deployed to:', oracle.address)

    // wait and verify
    await oracle.deployTransaction.wait(5)
    await verify(hre, oracle.address, [])
  })

task(
  'deploy:dexoracle',
  'Deploy the indirect AMPL/USDC 24h DEX TWAP oracle (AMPL/WETH x WETH/USDC)',
)
  .addParam('medianOracle', 'MedianOracle address the oracle reports to')
  // Mainnet defaults (token orderings verified on-chain):
  //   AMPL/WETH 0xc5be99... : token0=WETH, token1=AMPL -> price1 (WETH per AMPL)
  //   USDC/WETH 0xb4e16d... : token0=USDC, token1=WETH -> price1 (USDC per WETH)
  .addOptionalParam(
    'pairLeg1',
    'AMPL/WETH UniswapV2 pair',
    '0xc5be99a02c6857f9eac67bbce58df5572498f40c',
  )
  .addOptionalParam('leg1UseToken1Price', 'Read price1 on leg1', 'true')
  .addOptionalParam(
    'pairLeg2',
    'WETH/USDC UniswapV2 pair',
    '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc',
  )
  .addOptionalParam('leg2UseToken1Price', 'Read price1 on leg2', 'true')
  .addOptionalParam(
    'orchestrator',
    'Orchestrator allowed to call update(), and to append update() to',
    '',
  )
  .addFlag(
    'register',
    'addProvider(dexOracle) on the MedianOracle (owner only)',
  )
  .addFlag('verify', 'Verify the contract on Etherscan')
  .setAction(async (args, hre) => {
    console.log(args)

    const leg1UseToken1Price = args.leg1UseToken1Price === 'true'
    const leg2UseToken1Price = args.leg2UseToken1Price === 'true'
    const orchestrator = args.orchestrator || constants.AddressZero

    // get signers
    const deployer = (await hre.ethers.getSigners())[0]
    console.log('Deployer', await deployer.getAddress())

    // Reconfirm on-chain token ordering so the direction flags are correct.
    // token0 is the lower address (Uniswap factory invariant); the page UIs
    // mislabel base/quote, so always trust token0()/token1() here.
    for (const [label, pair, useToken1Price] of [
      ['leg1 (AMPL/WETH)', args.pairLeg1, leg1UseToken1Price],
      ['leg2 (WETH/USDC)', args.pairLeg2, leg2UseToken1Price],
    ] as [string, string, boolean][]) {
      const p = await hre.ethers.getContractAt('IUniswapV2Pair', pair)
      const token0 = await p.token0()
      const token1 = await p.token1()
      const base = useToken1Price ? token1 : token0
      const quote = useToken1Price ? token0 : token1
      console.log(
        `${label} ${pair}\n  token0=${token0} token1=${token1}\n` +
          `  useToken1Price=${useToken1Price} -> pricing base=${base} in quote=${quote}`,
      )
    }

    // deploy contract
    const params = [
      args.medianOracle,
      orchestrator,
      args.pairLeg1,
      leg1UseToken1Price,
      args.pairLeg2,
      leg2UseToken1Price,
    ]
    const dexOracle = await deployContract(hre, 'DexOracle', deployer, params)
    console.log('DexOracle deployed to:', dexOracle.address)
    console.log(
      '  decimalsFactorLeg1:',
      (await dexOracle.decimalsFactorLeg1()).toString(),
    )
    console.log(
      '  decimalsFactorLeg2:',
      (await dexOracle.decimalsFactorLeg2()).toString(),
    )

    // Register as a MedianOracle provider (deployer must own the MedianOracle).
    if (args.register) {
      const medianOracle = await hre.ethers.getContractAt(
        'MedianOracle',
        args.medianOracle,
      )
      await waitFor(
        medianOracle.connect(deployer).addProvider(dexOracle.address),
      )
      console.log('Registered as provider on MedianOracle:', args.medianOracle)
    }

    // The Orchestrator is authorized for update() in the constructor. Append
    // update() to its transaction list so it fires right after each rebase.
    // The encoded calldata is always printed so it can be proposed via multisig
    // when the deployer is not the Orchestrator owner.
    const updateData = dexOracle.interface.encodeFunctionData('update')
    console.log('Orchestrator.addTransaction args:')
    console.log('  destination:', dexOracle.address)
    console.log('  data:', updateData)
    if (args.orchestrator) {
      const orchestratorContract = await hre.ethers.getContractAt(
        'Orchestrator',
        args.orchestrator,
      )
      await waitFor(
        orchestratorContract
          .connect(deployer)
          .addTransaction(dexOracle.address, updateData),
      )
      console.log('Appended update() to Orchestrator:', args.orchestrator)
    }

    // wait and verify
    if (args.verify) {
      await dexOracle.deployTransaction.wait(5)
      await verify(hre, dexOracle.address, params)
    }
  })
