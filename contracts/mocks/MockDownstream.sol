pragma solidity 0.4.24;

import "./Mock.sol";


contract MockDownstream is Mock {

    function updateNoArg() external returns (bool) {
        emit FunctionCalled("MockDownstream", "updateNoArg", msg.sender);
        uint256[] memory uintVals = new uint256[](0);
        int256[] memory intVals = new int256[](0);
        emit FunctionArguments(uintVals, intVals);
        return true;
    }

    function updateOneArg(uint256 u) external {
        emit FunctionCalled("MockDownstream", "updateOneArg", msg.sender);

        uint256[] memory uintVals = new uint256[](1);
        uintVals[0] = u;
        int256[] memory intVals = new int256[](0);
        emit FunctionArguments(uintVals, intVals);
    }

    function updateTwoArgs(uint256 u, int256 i) external {
        emit FunctionCalled("MockDownstream", "updateTwoArgs", msg.sender);

        uint256[] memory uintVals = new uint256[](1);
        uintVals[0] = u;
        int256[] memory intVals = new int256[](1);
        intVals[0] = i;
        emit FunctionArguments(uintVals, intVals);
    }

    function reverts() external {
        emit FunctionCalled("MockDownstream", "reverts", msg.sender);

        uint256[] memory uintVals = new uint256[](0);
        int256[] memory intVals = new int256[](0);
        emit FunctionArguments(uintVals, intVals);

        require(false, "reverted");
    }
}
