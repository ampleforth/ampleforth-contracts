import * as path from 'path'
import { readFileSync } from 'fs'
import { Signer } from 'ethers'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { TransactionResponse } from '@ethersproject/providers'
import { ContractFactory, Contract } from 'ethers'

const EXTERNAL_ARTIFACTS_PATH = path.join(__dirname, '/../external-artifacts')
export async function getContractFactoryFromExternalArtifacts(
  hre: HardhatRuntimeEnvironment,
  name: string,
): Promise<ContractFactory> {
  const artifact = JSON.parse(
    readFileSync(`${EXTERNAL_ARTIFACTS_PATH}/${name}.json`).toString(),
  )
  return hre.ethers.getContractFactoryFromArtifact(artifact)
}

export async function sleep(sleepSec: number) {
  await new Promise(resolve => setTimeout(resolve, sleepSec));
}

export async function waitFor(tx: TransactionResponse) {
  return (await tx).wait()
}

export async function deployContract(
  hre: HardhatRuntimeEnvironment,
  factoryName: string,
  signer: Signer,
  params: any = [],
): Promise<Contract> {
  const contract = await (await hre.ethers.getContractFactory(factoryName))
    .connect(signer)
    .deploy(...params)
  await contract.deployed()
  return contract
}

export async function deployProxy(
  hre: HardhatRuntimeEnvironment,
  factoryName: string,
  signer: Signer,
  initializer: string,
  params: any = [],
): Promise<Contract> {
  const contract = await hre.upgrades.deployProxy(
    (await hre.ethers.getContractFactory(factoryName)).connect(signer),
    params,
    { initializer },
  )
  await contract.deployed()
  return contract
}

export async function deployExternalArtifact(
  hre: HardhatRuntimeEnvironment,
  name: string,
  signer: Signer,
  params: any = [],
): Promise<Contract> {
  const Factory = await getContractFactoryFromExternalArtifacts(hre, name)
  const contract = await Factory.connect(signer).deploy(...params)
  await contract.deployed()
  return contract
}

export async function verify(
  hre: HardhatRuntimeEnvironment,
  address: string,
  constructorArguments: any = [],
) {
  try {
    await hre.run('verify:verify', { address, constructorArguments })
  } catch (e) {
    console.log('Verification failed:', e)
    console.log('Execute the following')
    console.log(
      `yarn hardhat run verify:verify --address ${address}  --constructor-arguments "${JSON.stringify(
        constructorArguments,
      ).replace(/"/g, '\\"')}"`,
    )
  }
}
