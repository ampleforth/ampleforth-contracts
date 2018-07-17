pragma solidity 0.4.24;

contract Mock {
    event FunctionCalled(string functionName, address caller);
    event FunctionArguments(uint256[] uintVals, int256[] intVals);
}
