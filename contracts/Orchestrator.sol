pragma solidity 0.4.24;

import "openzeppelin-eth/contracts/ownership/Ownable.sol";

import "./UFragmentsPolicy.sol";


contract Orchestrator is Ownable {

    struct Transaction {
        address destination;
        uint value;
        bytes data;
        bool enabled;
    }

    // No ordering of execution is guaranteed
    Transaction[] public transactions;

    UFragmentsPolicy public policy;

    constructor(address policy_) public {
        Ownable.initialize(msg.sender);
        policy = UFragmentsPolicy(policy_);
    }

    function rebase()
        external
    {
        // TODO: add tx.origin stuff here
        policy.rebase();

        for (uint i = 0; i < transactions.length; i++) {
            Transaction storage t = transactions[i];
            if (t.enabled) {
                // Does not revert when false is returned.
                require(externalCall(t.destination, t.value, t.data.length, t.data), "call failed");
            }
        }
    }

    /**
     * @notice Adds a transaction that gets called for a downstream receiver of rebases
     * @param destination Address of contract destination
     * @param value Transaction Ether value
     * @param data Transaction data payload
     */
    function addTransaction(address destination, uint value, bytes data)
        external
        onlyOwner
    {
        transactions.push(Transaction({
            destination: destination,
            value: value,
            data: data,
            enabled: true
        }));
    }

    function removeTransaction(uint index)
        external
        onlyOwner
    {
        require(index < transactions.length, "index out of bounds");

        if (index < transactions.length - 1) {
            transactions[index] = transactions[transactions.length - 1];
        }

        delete transactions[transactions.length - 1];
        transactions.length--;
    }

    function setTransactionEnabled(uint index, bool enabled)
        external
        onlyOwner
    {
        require(index < transactions.length, "index must be in range of stored tx list");
        transactions[index].enabled = enabled;
    }

    function transactionsLength()
        external
        view
        returns (uint256)
    {
        return transactions.length;
    }

    function externalCall(address destination, uint value, uint dataLength, bytes data)
        internal
        returns (bool)
    {
        bool result;
        assembly {  // solhint-disable-line no-inline-assembly
            // "Allocate" memory for output
            // (0x40 is where "free memory" pointer is stored by convention)
            let x := mload(0x40)

            // First 32 bytes are the padded length of data, so exclude that
            let d := add(data, 32)

            result := call(
                // TODO(iles): Update these gas numbers.



                // 34710 is the value that solidity is currently emitting
                // It includes callGas (700) + callVeryLow (3, to pay for SUB)
                // + callValueTransferGas (9000) + callNewAccountGas
                // (25000, in case the destination address does not exist and needs creating)
                sub(gas, 34710),


                destination,
                value,
                d,
                dataLength,  // Size of the input (in bytes). This is what fixes the padding problem
                x,
                0  // Output is ignored, therefore the output size is zero
            )
        }
        return result;
    }
}
