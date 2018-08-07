pragma solidity 0.4.24;

import "../lib/SafeMathInt.sol";

contract SafeMathIntMock {

    function mul(int256 _a, int256 _b) public pure returns (int256) {
        return SafeMathInt.mul(_a, _b);
    }
    
    function div(int256 _a, int256 _b) public pure returns (int256) {
        return SafeMathInt.div(_a, _b);
    }

    function sub(int256 _a, int256 _b) public pure returns (int256) {
        return SafeMathInt.sub(_a, _b);
    }
    
    function add(int256 _a, int256 _b) public pure returns (int256) {
        return SafeMathInt.add(_a, _b);
    }
    
    function toUint256Safe(int256 _a) public pure returns (uint256) {
        return SafeMathInt.toUint256Safe(_a);
  }
}
