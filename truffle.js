module.exports = {
  // See <http://truffleframework.com/docs/advanced/configuration>
  // for more about customizing your Truffle configuration!
  networks: {
    ganacheDev: {
      ref: 'ganache-dev',
      host: '127.0.0.1',
      port: 7545,
      gas: 7989556,
      gasPrice: 9000000000,
      network_id: '*'
    },
    ganacheUnitTest: {
      ref: 'ganache-unit-test',
      host: '127.0.0.1',
      port: 8545,
      gas: 7989556,
      gasPrice: 9000000000,
      network_id: '*'
    },
    gethDev: {
      ref: 'geth-dev',
      host: '127.0.0.1',
      port: 7550,
      wsPort: 7551,
      gas: 7989556,
      gasPrice: 9000000000,
      network_id: '1234',
      from: '0x727f09e28c2ffc752e0b0fb4b785d2d53793a9f0',
      passcode: 'fragments'
    },
    gethUnitTest: {
      ref: 'geth-unit-test',
      host: '127.0.0.1',
      port: 8550,
      wsPort: 8551,
      gas: 7989556,
      gasPrice: 9000000000,
      network_id: '1234',
      from: '0x727f09e28c2ffc752e0b0fb4b785d2d53793a9f0',
      passcode: 'fragments'
    }
  }
};
