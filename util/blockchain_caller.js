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
    const r = await this.sendRawToBlockchain('evm_increaseTime', [durationInSec]);
    return r;
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

BlockchainCaller.prototype.isEthException = async function (promise) {
  let msg = 'No Exception';
  try {
    if (promise.then) { await promise; } else { await promise(); }
  } catch (e) {
    msg = e.message;
  }
  return (
    msg.includes('VM Exception while processing transaction: revert') ||
    msg.includes('invalid opcode') ||
    msg.includes('exited with an error (status 0)')
  );
};

BlockchainCaller.prototype.getBlockGasLimit = async function () {
  const block = await this.web3.eth.getBlock('latest');
  return block.gasLimit;
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

module.exports = BlockchainCaller;
