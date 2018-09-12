pragma solidity 0.4.24;

import "./Mock.sol";


contract MockMarketOracle is Mock {
    uint128 private _exchangeRate;
    uint128 private _volume;

    // Mock methods
    function getPriceAndVolume() external returns (uint128, uint128) {
        emit FunctionCalled("MarketOracle:getPriceAndVolume", msg.sender);
        uint256[] memory uintVals = new uint256[](0);
        int256[] memory intVals = new int256[](0);
        emit FunctionArguments(uintVals, intVals);
        return (_exchangeRate, _volume);
    }

    // Methods to mock data on the chain
    function storeRate(uint128 exchangeRate) public {
        _exchangeRate = exchangeRate;
    }

    function storeVolume(uint128 volume) public {
        _volume = volume;
    }
}
