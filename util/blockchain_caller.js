// A wrapper on top of web3 to help interact with an underlying blockchain
// This is where blockchain specific interaction logic goes
class BlockchainCaller {
  constructor (web3) {
    this._web3 = web3;
  }
  get web3 () {
    return this._web3;
  }
  rpcmsg (method, params = []) {
    const id = Date.now();
    return {
      jsonrpc: '2.0',
      method: method,
      params: params,
      'id': id
    };
  }
}

BlockchainCaller.prototype.sendRawToBlockchain = function (method, params) {
  return new Promise((resolve, reject) => {
    this.web3.currentProvider.sendAsync(this.rpcmsg(method, params), function (e, r) {
      if (e) reject(e);
      resolve(r);
    });
  });
};

BlockchainCaller.prototype.waitForSomeTime = async function (durationInSec) {
  try {
    await this.sendRawToBlockchain('evm_increaseTime', [durationInSec]);
  } catch (e) {
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(), durationInSec * 1000);
    });
  }
};

BlockchainCaller.prototype.getUserAccounts = async function () {
  const accounts = await this.sendRawToBlockchain('eth_accounts');
  return accounts.result;
};

BlockchainCaller.prototype.getBlockGasLimit = async function () {
  const block = await this.web3.eth.getBlock('latest');
  return block.gasLimit;
};

BlockchainCaller.prototype.currentTime = async function () {
  const block = await this.sendRawToBlockchain('eth_getBlockByNumber', ['latest', false]);
  return parseInt(block.result.timestamp);
};

BlockchainCaller.prototype.getTransactionMetrics = async function (hash) {
  const txR = await this.web3.eth.getTransactionReceipt(hash);
  const tx = await this.web3.eth.getTransaction(hash);
  return {
    gasUsed: txR.gasUsed,
    gasPrice: tx.gasPrice,
    byteCodeSize: (tx.input.length * 4 / 8)
  };
};

/*
  Inspired loosely by Openzeppelin's assertRevert.
  https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/test/helpers/assertRevert.js
*/
BlockchainCaller.prototype.isEthException = async function (promise) {
  let msg = 'No Exception';
  try {
    await promise;
  } catch (e) {
    msg = e.message;
  }
  return (
    msg.includes('VM Exception while processing transaction: revert') ||
    msg.includes('invalid opcode') ||
    msg.includes('exited with an error (status 0)')
  );
};

module.exports = BlockchainCaller;
