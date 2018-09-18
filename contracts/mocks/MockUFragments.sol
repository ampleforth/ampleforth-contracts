pragma solidity 0.4.24;

import "./Mock.sol";


contract MockUFragments is Mock {
    uint256 private _supply;

    // Methods to mock data on the chain
    function storeSupply(uint256 supply)
        public
    {
        _supply = supply;
    }

    // Mock methods
    function rebase(uint256 epoch, int256 supplyDelta)
        public
    {
        emit FunctionCalled("UFragments:rebase", msg.sender);
        uint256[] memory uintVals = new uint256[](1);
        uintVals[0] = epoch;
        int256[] memory intVals = new int256[](1);
        intVals[0] = supplyDelta;
        emit FunctionArguments(uintVals, intVals);
        _supply++;
    }

    function totalSupply()
        public
        view
        returns (uint256)
    {
        return _supply;
    }
}
