pragma solidity 0.4.24;

import "../UFragmentsPolicy.sol";


contract ConstructorRebaseCallerContract {
    UFragmentsPolicy private _policy;

    constructor(address policy) public {
        _policy = UFragmentsPolicy(policy);
        // Take out a flash loan.
        // Do something funky...
        _policy.rebase();  // should fail
        // pay back flash loan.
    }
}
