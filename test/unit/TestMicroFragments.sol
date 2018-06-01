pragma solidity ^0.4.18;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../../contracts/MicroFragments.sol";

contract TestMicroFragments {
    address myAddress = this;
    address Alice = address(0xf17f52151EbEF6C7334FAD080c5704D77216b732);

    // Tests on deployed contract
    function testInitialBalanceUsingDeployedContract() public {
        MicroFragments frgContract = MicroFragments(DeployedAddresses.MicroFragments());
        Assert.equal(frgContract.balanceOf(tx.origin), 1000, "Owner has wrong initial balance.");
    }

    // Tests in code
    function testInitialBalanceWithNewFRG() public {
        MicroFragments mFragments = new MicroFragments();
        Assert.equal(mFragments.balanceOf(myAddress), 1000, "Owner has wrong initial balance.");
    }

    function testTotalSupplyWithNewFRG() public {
        MicroFragments mFragments = new MicroFragments();
        Assert.equal(mFragments.totalSupply(), 1000, "Wrong initial supply.");
    }

    function testTransfer() public {
        MicroFragments mFragments = new MicroFragments();
        Assert.equal(mFragments.balanceOf(myAddress), 1000, "Owner has wrong initial balance.");
        Assert.equal(mFragments.balanceOf(Alice), 0, "Alice has wrong initial balance.");

        bool success = mFragments.transfer(Alice, 250);

        Assert.isTrue(success, "Transfer failed");
        Assert.equal(mFragments.balanceOf(myAddress), 750, "Sender has wrong final balance.");
        Assert.equal(mFragments.balanceOf(Alice), 250, "Alice received wrong balance.");
    }

    function testRebase() public {
        MicroFragments mFragments = new MicroFragments();
        Assert.equal(mFragments.totalSupply(), 1000, "Incorrect supply after rebase.");
        Assert.equal(mFragments.balanceOf(myAddress), 1000, "Incorrect balance after rebase.");

        mFragments.rebase(500);

        Assert.equal(mFragments.totalSupply(), 1500, "Incorrect supply after rebase.");
        Assert.equal(mFragments.balanceOf(myAddress), 1500, "Incorrect balance after rebase.");
    }
}
