pragma solidity 0.4.24;

import "./Mock.sol";
import "../lib/SafeMathInt.sol";


contract SafeMathIntMock is Mock {
    function mul(int256 a, int256 b)
        external
        returns (int256)
    {
        int256 result = SafeMathInt.mul(a, b);
        emit ReturnValueInt256(result);
        return result;
    }

    function div(int256 a, int256 b)
        external
        returns (int256)
    {
        int256 result = SafeMathInt.div(a, b);
        emit ReturnValueInt256(result);
        return result;
    }

    function sub(int256 a, int256 b)
        external
        returns (int256)
    {
        int256 result = SafeMathInt.sub(a, b);
        emit ReturnValueInt256(result);
        return result;
    }

    function add(int256 a, int256 b)
        external
        returns (int256)
    {
        int256 result = SafeMathInt.add(a, b);
        emit ReturnValueInt256(result);
        return result;
    }

    function abs(int256 a)
        external
        returns (int256)
    {
        int256 result = SafeMathInt.abs(a);
        emit ReturnValueInt256(result);
        return result;
    }
}
