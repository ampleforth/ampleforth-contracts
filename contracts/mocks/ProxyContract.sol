pragma solidity 0.4.24;

import "../UFragments.sol";

contract ProxyContract {

  UFragments private uFrag;

  uint256 private epoch;
  uint128 private exchangeRate;
  uint256 private volume;
  uint256 private supply;

  event FunctionCalled(string functionName, address caller);
  event FunctionArguments(uint256[] uintVals, int256[] intVals);

  function setReferences(UFragments _uFrag) public {
    uFrag = _uFrag;
  }

  // Methods to mock data on the chain
  function storeRate(uint128 _exchangeRate) public {
    exchangeRate = _exchangeRate;
  }

  function storeVolume(uint256 _volume) public {
    volume = _volume;
  }

  function storeSupply(uint256 _supply) public {
    supply = _supply;
  }

  // Call through methods
  function callThroughToUFRGRebase(uint256 epoch, int256 supplyDelta){
    uFrag.rebase(epoch, supplyDelta);
  }

  // Mock methods
  function rebase(uint256 epoch, int256 supplyDelta) public {
    emit FunctionCalled("UFragments:rebase", msg.sender);
    uint256[] memory uintVals = new uint256[](1);
    uintVals[0] = epoch;
    int256[] memory intVals = new int256[](1);
    intVals[0] = supplyDelta;
    emit FunctionArguments(uintVals, intVals);
  }

  function aggregate() external returns (uint128, uint256) {
    emit FunctionCalled("ExchangeRateAggregator:aggregate", msg.sender);
    uint256[] memory uintVals = new uint256[](0);
    int256[] memory intVals = new int256[](0);
    emit FunctionArguments(uintVals, intVals);
    return (exchangeRate, volume);
  }

  function totalSupply() public view returns (uint256) {
    return supply;
  }
}
