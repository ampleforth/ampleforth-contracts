const _require = require('app-root-path').require;
const config = _require('/truffle.js').networks.testrpcCoverage;

module.exports = {
    host: config.host,
    network_id: config.network_id,
    port: config.port,
    gas: config.gas,
    gasPrice: config.gasPrice,
    norpc: true,
    testCommand: 'npx truffle test ./test/unit/*.js',
    compileCommand: 'npx truffle compile',
    skipFiles: ['mocks'],
    copyPackages: ['openzeppelin-eth'],
};
