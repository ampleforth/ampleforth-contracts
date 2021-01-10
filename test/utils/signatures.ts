// https://github.com/albertocuestacanada/ERC20Permit/blob/master/utils/signatures.ts
import {
  keccak256,
  defaultAbiCoder,
  toUtf8Bytes,
  solidityPack,
  splitSignature,
} from 'ethers/lib/utils'
import { ecsign } from 'ethereumjs-util'
import { BigNumberish, Wallet } from 'ethers'

export const EIP712_DOMAIN_TYPEHASH = keccak256(
  toUtf8Bytes(
    'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
  ),
)

export const EIP712_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
]

export const EIP2612_PERMIT_TYPEHASH = keccak256(
  toUtf8Bytes(
    'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)',
  ),
)

export const EIP2612_PERMIT_TYPE = [
  { name: 'owner', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
]

// Gets the EIP712 domain separator
export function getDomainSeparator(
  version: string,
  name: string,
  contractAddress: string,
  chainId: number,
) {
  return keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        EIP712_DOMAIN_TYPEHASH,
        keccak256(toUtf8Bytes(name)),
        keccak256(toUtf8Bytes(version)),
        chainId,
        contractAddress,
      ],
    ),
  )
}

// Returns the EIP712 hash which should be signed by the user
// in order to make a call to `permit`
export function getPermitDigest(
  version: string,
  name: string,
  address: string,
  chainId: number,
  owner: string,
  spender: string,
  value: number,
  nonce: number,
  deadline: BigNumberish,
) {
  const DOMAIN_SEPARATOR = getDomainSeparator(version, name, address, chainId)
  const permitHash = keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
      [EIP2612_PERMIT_TYPEHASH, owner, spender, value, nonce, deadline],
    ),
  )
  const hash = keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      ['0x19', '0x01', DOMAIN_SEPARATOR, permitHash],
    ),
  )
  return hash
}

export const signEIP712Permission = async (
  version: string,
  name: string,
  verifyingContract: string,
  chainId: number,
  signer: Wallet,
  owner: string,
  spender: string,
  value: number,
  nonce: number,
  deadline: BigNumberish,
) => {
  const domain = {
    name,
    version,
    chainId,
    verifyingContract,
  }

  const types = { Permit: EIP2612_PERMIT_TYPE }

  const data = {
    owner,
    spender,
    value,
    nonce,
    deadline,
  }

  const signature = await signer._signTypedData(domain, types, data)

  return splitSignature(signature)
}
