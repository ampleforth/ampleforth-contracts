pragma solidity 0.4.24;

import "../UFragmentsPolicy.sol";


contract RebaseCallerContract {
    function callRebase(address policy) public returns (bool) {
        // Take out a flash loan.
        // Do something funky...
        UFragmentsPolicy(policy).rebase();  // should fail
        // pay back flash loan.
        return true;
    }
}
