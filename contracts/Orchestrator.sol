pragma solidity 0.5.12;

import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";

import "./lib/BytesLib.sol";
import "./UFragmentsPolicy.sol";


/**
 * @title Orchestrator
 * @notice The orchestrator is the main entry point for rebase operations. It coordinates the policy
 * actions with external consumers.
 */
contract Orchestrator is Ownable {

    using BytesLib for bytes;

    struct Transaction {
        bool enabled;
        address destination;
        bytes data;
    }

    event TransactionFailed(address indexed destination, uint index, bytes data, string reason);

    // Stable ordering is not guaranteed.
    Transaction[] public transactions;

    UFragmentsPolicy public policy;

    /**
     * @param policy_ Address of the UFragments policy.
     */
    constructor(address policy_) public {
        Ownable.initialize(msg.sender);
        policy = UFragmentsPolicy(policy_);
    }

    /**
     * @notice Main entry point to initiate a rebase operation.
     *         The Orchestrator calls rebase on the policy and notifies downstream applications.
     *         Contracts are guarded from calling, to avoid flash loan attacks on liquidity
     *         providers.
     *         If a transaction in the transaction list reverts, it is swallowed and the remaining
     *         transactions are executed.
     */
    function rebase()
        external
    {
        // only callable by EOA to prevent flashloan attacks
        require(msg.sender == tx.origin);  // solhint-disable-line avoid-tx-origin

        // call monetary policy rebase, always revert on failure
        policy.rebase();

        // call peripheral contracts, handle reverts based on policy
        for (uint index = 0; index < transactions.length; index++) {
            _executePeripheralTransaction(index);
        }
    }

    /**
     * @notice Get the revert message and code from a call.
     * @param index uint256 Index of the transaction.
     * @return success bool True if peripheral transaction was successful.
     * @return returnData bytes Return data.
     */
    function _executePeripheralTransaction(uint256 index) internal returns (bool success, bytes memory returnData) {
        // declare storage reference
        Transaction storage transaction = transactions[index];

        // perform low level external call
        (success, returnData) = address(transaction.destination).call(transaction.data);

        // Check if any of the atomic transactions failed, if not, decode return data
        if (!success) {
            // If there is no prefix to the revert reason, we assume it was an OOG error and revert the batch
            if (returnData.length == 0) {
                revert("Transaction out of gas");
            } else {
                // parse revert message
                (string memory revertMessage) = _getRevertMsg(returnData);
                // Log any other revert and continue rebase execution
                emit TransactionFailed(transaction.destination, index, transaction.data, revertMessage);
            }
        }

        // explicit return
        return (success, returnData);
	}

    /**
     * @notice Get the revert message from a call.
     * @param res bytes Response of the call.
     * @return revertMessage string Revert message.
     */
	function _getRevertMsg(bytes memory res) internal pure returns (string memory revertMessage) {
		// If the revert reason length is less than 68, then the transaction failed silently (without a revert message)
		if (res.length < 68) {
            return "Transaction reverted silently";
        } else {
            // Else extract revert message
	        bytes memory revertData = res.slice(4, res.length - 4); // Remove the selector which is the first 4 bytes
		    return abi.decode(revertData, (string)); // All that remains is the revert string
        }
	}

    /**
     * @notice Adds a transaction that gets called for a downstream receiver of rebases
     * @param destination Address of contract destination
     * @param data Transaction data payload
     */
    function addTransaction(address destination, bytes calldata data)
        external
        onlyOwner
    {
        transactions.push(Transaction({
            enabled: true,
            destination: destination,
            data: data
        }));
    }

    /**
     * @param index Index of transaction to remove.
     *              Transaction ordering may have changed since adding.
     */
    function removeTransaction(uint index)
        external
        onlyOwner
    {
        require(index < transactions.length, "index out of bounds");

        if (index < transactions.length - 1) {
            transactions[index] = transactions[transactions.length - 1];
        }

        transactions.length--;
    }

    /**
     * @param index Index of transaction. Transaction ordering may have changed since adding.
     * @param enabled True for enabled, false for disabled.
     */
    function setTransactionEnabled(uint index, bool enabled)
        external
        onlyOwner
    {
        require(index < transactions.length, "index must be in range of stored tx list");
        transactions[index].enabled = enabled;
    }

    /**
     * @return Number of transactions, both enabled and disabled, in transactions list.
     */
    function transactionsSize()
        external
        view
        returns (uint256)
    {
        return transactions.length;
    }
}
