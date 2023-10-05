pragma solidity 0.8.4;

import "../MedianOracle.sol";

contract GetMedianOracleDataCallerContract {
    event ReturnValueUInt256Bool(uint256 value, bool valid);

    IOracle public oracle;

    constructor() public {}

    function setOracle(IOracle _oracle) public {
        oracle = _oracle;
    }

    function getData() public returns (uint256) {
        uint256 _value;
        bool _valid;
        (_value, _valid) = oracle.getData();
        emit ReturnValueUInt256Bool(_value, _valid);
        return _value;
    }
}
