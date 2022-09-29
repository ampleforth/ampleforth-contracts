pragma solidity 0.8.4;

import "../lib/Select.sol";

contract Mock {
    event ReturnValueUInt256(uint256 val);
}

contract SelectMock is Mock {
    function computeMedian(uint256[] memory data, uint256 size) external returns (uint256) {
        uint256 result = Select.computeMedian(data, size);
        emit ReturnValueUInt256(result);
        return result;
    }
}
