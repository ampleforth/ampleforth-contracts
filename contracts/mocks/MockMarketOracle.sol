pragma solidity 0.4.24;

import "./Mock.sol";

contract MockMarketOracle is Mock {
    uint128 private exchangeRate;
    uint128 private volume;

    // Methods to mock data on the chain
    function storeRate(uint128 _exchangeRate) public {
        exchangeRate = _exchangeRate;
    }

    function storeVolume(uint128 _volume) public {
        volume = _volume;
    }

    // Mock methods
    function getPriceAndVolume() external returns (uint128, uint128) {
        emit FunctionCalled("MarketOracle:getPriceAndVolume", msg.sender);
        uint256[] memory uintVals = new uint256[](0);
        int256[] memory intVals = new int256[](0);
        emit FunctionArguments(uintVals, intVals);
        return (exchangeRate, volume);
    }
}
