pragma solidity 0.4.24;

import "./Mock.sol";


contract MockUFragmentsPolicy is Mock {

    // Mock methods
    function rebase() external {
        emit FunctionCalled("UFragmentsPolicy", "rebase", msg.sender);
    }
}
