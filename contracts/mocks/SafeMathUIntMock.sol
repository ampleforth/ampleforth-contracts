pragma solidity 0.4.24;

import "./Mock.sol";
import "../lib/UInt256Lib.sol";


contract SafeMathUIntMock is Mock {
    function toInt256Safe(uint256 _a) external returns (int256) {
        int256 result = UInt256Lib.toInt256Safe(_a);
        emit ReturnValueInt256(result);
        return result;
    }
}
