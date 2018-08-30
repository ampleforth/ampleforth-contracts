pragma solidity 0.4.24;

import "./Mock.sol";
import "../lib/SafeMathInt.sol";


contract SafeMathIntMock is Mock {
    function mul(int256 _a, int256 _b) external {
        emit ReturnValueInt256(SafeMathInt.mul(_a, _b));
    }

    function div(int256 _a, int256 _b) external {
        emit ReturnValueInt256(SafeMathInt.div(_a, _b));
    }

    function sub(int256 _a, int256 _b) external {
        emit ReturnValueInt256(SafeMathInt.sub(_a, _b));
    }

    function add(int256 _a, int256 _b) external {
        emit ReturnValueInt256(SafeMathInt.add(_a, _b));
    }

    function toUint256Safe(int256 _a) external returns (uint256) {
        return SafeMathInt.toUint256Safe(_a);
    }
}
