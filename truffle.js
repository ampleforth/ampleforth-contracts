module.exports = {
  // See <http://truffleframework.com/docs/advanced/configuration>
  // for more about customizing your Truffle configuration!
  networks: {
    ganacheUnitTest: {
      ref: 'ganache-unit-test',
      host: '127.0.0.1',
      port: 8545,
      gas: 7989556,
      gasPrice: 9000000000,
      network_id: '*'
    },
    gethUnitTest: {
      ref: 'geth-unit-test',
      host: '127.0.0.1',
      port: 8550,
      wsPort: 8551,
      gas: 7989556,
      gasPrice: 9000000000,
      network_id: '1234',
      passcode: 'fragments'
    }
  }
};
