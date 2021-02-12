// NOTE: this file is required by our internal deployment script uFragments-eth-integration
// which still works with truffle
// This can be removed once we completely transition to the new hardhat workflow
module.exports = {
  compilers: {
    solc: {
      version: '0.7.6',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        }
      }
    }
  }
};
