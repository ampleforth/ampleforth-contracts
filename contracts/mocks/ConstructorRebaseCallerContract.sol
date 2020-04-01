pragma solidity 0.4.24;

import "../UFragmentsPolicy.sol";


contract ConstructorRebaseCallerContract {
    constructor(address policy) public {
        // Take out a flash loan.
        // Do something funky...
        UFragmentsPolicy(policy).rebase();  // should fail
        // pay back flash loan.
    }
}
