pragma solidity 0.7.6;

contract Mock {
    event FunctionCalled(string instanceName, string functionName, address caller);
    event FunctionArguments(uint256[] uintVals, int256[] intVals);
    event ReturnValueInt256(int256 val);
    event ReturnValueUInt256(uint256 val);
}
