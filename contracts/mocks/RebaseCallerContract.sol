pragma solidity 0.7.6;

interface IOrchestrator {
    function rebase() external;
}

contract RebaseCallerContract {
    function callRebase(address orchestrator) public returns (bool) {
        // Take out a flash loan.
        // Do something funky...
        IOrchestrator(orchestrator).rebase(); // should fail
        // pay back flash loan.
        return true;
    }
}
