pragma solidity 0.4.24;

import "../UFragmentsPolicy.sol";


contract RebaseCallerContract {
    UFragmentsPolicy private _policy;

    constructor(address policy) public {
        _policy = UFragmentsPolicy(policy);
    }

    function callRebase() public returns (bool) {
        // Take out a flash loan.
        // Do something funky...
        _policy.rebase();  // should fail
        // pay back flash loan.

        return true;
    }
}
