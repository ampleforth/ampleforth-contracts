const sinon = require('sinon');
const _ = require('lodash');
const BigNumber = require('bignumber.js');

// ContractEventSpy lets you watch/track specific events published by smart-contracts
// example: let spy = ContractEventSpy(contract.interestingEvent); spy.watch();
// When the contract publishes 'interestingEvent', stores published events in it's
// internal data structure 'indexedEvents'
// spy.stopWatching(); will stop watching the contract
function ContractEventSpy (fns) {
  this.spy = sinon.spy();
  this.eventCount = 0;
  this.eventNames = [];
  this.indexedEvents = {};
  this.contractFns = [];
  this.functionsToWatch = fns;
  return this;
}

ContractEventSpy.prototype.getAllEventsByName = function (name) {
  return _.filter(this.indexedEvents, (k, v) => k.event === name);
};

ContractEventSpy.prototype.getEventByName = function (name) {
  return this.getAllEventsByName(name)[0];
};

ContractEventSpy.prototype.watch = function () {
  const self = this;
  const watcher = (err, r) => {
    if (!self.indexedEvents[r.logIndex]) { // discard duplicate logs
      self.eventNames.push(r.event);
      self.eventCount++;
      self.indexedEvents[r.logIndex] = r;
      self.spy(err, r);
    }
  };
  _.each(this.functionsToWatch, fn => {
    const exec = fn();
    exec.watch(watcher);
    self.contractFns.push(exec);
  });
};

ContractEventSpy.prototype.stopWatching = function () {
  _.each(this.contractFns, fn => {
    fn.stopWatching();
  });
};

// ProxyContract Function Spy, parses spied events to specifically look for,
// 'FunctionCalled', 'FunctionArgumentAddress', 'FunctionArgumentInteger'
// emitted out by function stubs in 'ProxyContract'
function ProxyContractFunctionSpy (contractEventSpy) {
  this.spy = contractEventSpy;
}

ProxyContractFunctionSpy.prototype.getCalledFunctions = function () {
  const fns = this.spy.getAllEventsByName('FunctionCalled');
  const fnArgs = this.spy.getAllEventsByName('FunctionArguments');
  const fnCalls = _.zip(fns, fnArgs);
  const clean = vals => _.filter(vals, v => !(new BigNumber(v).eq(0)));
  const toNumber = vals => _.map(vals, v => v.toNumber());
  return _.map(fnCalls, ([fn, args]) => {
    return {
      'fnName': fn.args.functionName,
      'calledBy': fn.args.caller,
      'arguments': clean(args.args.addrs).concat(
        toNumber(clean(args.args.vals))
      )
    };
  });
};

module.exports = {
  ContractEventSpy,
  ProxyContractFunctionSpy
};
