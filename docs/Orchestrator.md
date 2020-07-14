### Adding transactions

1) Use the truffle console to encode the function call as follows.

```
# Sync tx
web3.eth.abi.encodeFunctionCall({
  name: 'sync',
  type: 'function',
  inputs: [],
}, []);


# Gulp tx
web3.eth.abi.encodeFunctionCall({
  name: 'gulp',
  type: 'function',
  inputs: [{
      type: 'address',
      name: 'token'
  }],
}, ['0xD46bA6D942050d489DBd938a2C909A5d5039A161']);
```

2) Admin invokes `addTransaction` with the destination contract address and `bytes`
as encoded from step 1.

### Current list of transactions

1. UniswapV2 (AMPL-DAI): sync() => `0x08a564924C26D8289503bbaA18714B9C366dF9a5`: `0xfff6cae9`
2. UniswapV2 (AMPL-ETH): sync() => `0xc5be99A02C6857f9Eac67BbCE58DF5572498F40c`: `0xfff6cae9`
3. Balancer Bpool (AMPL-ETH): gulp('0xD46bA6D942050d489DBd938a2C909A5d5039A161') => `0xeefb11cA05c6F0d5252757Dbe35fFC4458108e89`: `0x8c28cbe8000000000000000000000000d46ba6d942050d489dbd938a2c909a5d5039a161`


