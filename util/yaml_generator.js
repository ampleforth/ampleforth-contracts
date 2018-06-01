const yaml = require('js-yaml');
const fs = require('fs');
const {promisify} = require('util');

async function generateYaml (obj, path) {
  let yamlDump = yaml.safeDump(obj);
  yamlDump = '# Code generated - DO NOT EDIT.\n' +
    '# Any manual changes may be lost.\n' +
    yamlDump;
  await promisify(fs.writeFile)(path, yamlDump);
}

module.exports = generateYaml;
