pragma solidity 0.4.24;

import "./Mock.sol";
import "../lib/SafeMathInt.sol";


contract SafeMathIntMock is Mock {
    function mul(int256 _a, int256 _b) external returns (int256) {
        int256 result = SafeMathInt.mul(_a, _b);
        emit ReturnValueInt256(result);
        return result;
    }

    function div(int256 _a, int256 _b) external returns (int256) {
        int256 result = SafeMathInt.div(_a, _b);
        emit ReturnValueInt256(result);
        return result;
    }

    function sub(int256 _a, int256 _b) external returns (int256) {
        int256 result = SafeMathInt.sub(_a, _b);
        emit ReturnValueInt256(result);
        return result;
    }

    function add(int256 _a, int256 _b) external returns (int256) {
        int256 result = SafeMathInt.add(_a, _b);
        emit ReturnValueInt256(result);
        return result;
    }

    function toUint256Safe(int256 _a) external returns (uint256) {
        uint256 result = SafeMathInt.toUint256Safe(_a);
        emit ReturnValueUInt256(result);
        return result;
    }
}
