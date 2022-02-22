pragma solidity 0.4.24;

import "../lib/Select.sol";

contract Mock {
    event ReturnValueUInt256(uint256 val);
}

contract SelectMock is Mock {
    function computeMedian(uint256[] data, uint256 size) external returns (uint256) {
        uint256 result = Select.computeMedian(data, size);
        emit ReturnValueUInt256(result);
        return result;
    }
}
