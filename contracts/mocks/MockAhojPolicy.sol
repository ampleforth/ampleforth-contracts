pragma solidity 0.4.24;

import "./Mock.sol";


contract MockAhojPolicy is Mock {
    
    function rebase() external {
        emit FunctionCalled("AhojPolicy", "rebase", msg.sender);
    }
}
