pragma solidity 0.4.24;

import "./Mock.sol";


contract MockUFragmentsPolicy is Mock {
    
    function rebase() external {
        emit FunctionCalled("UFragmentsPolicy", "rebase", msg.sender);
    }
}
