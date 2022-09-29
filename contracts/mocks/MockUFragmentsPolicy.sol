pragma solidity 0.8.4;

import "./Mock.sol";

contract MockUFragmentsPolicy is Mock {
    function rebase() external {
        emit FunctionCalled("UFragmentsPolicy", "rebase", msg.sender);
    }
}
