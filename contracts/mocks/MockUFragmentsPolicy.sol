pragma solidity 0.6.12;

import "./Mock.sol";

contract MockUFragmentsPolicy is Mock {
    function rebase() external {
        emit FunctionCalled("UFragmentsPolicy", "rebase", msg.sender);
    }
}
