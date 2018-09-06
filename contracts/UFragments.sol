pragma solidity 0.4.24;

import "openzeppelin-zos/contracts/math/SafeMath.sol";
import "openzeppelin-zos/contracts/ownership/Ownable.sol";
import "openzeppelin-zos/contracts/token/ERC20/DetailedERC20.sol";


/**
 * @title uFragments ERC20 token
 * @dev This is an implementation of the uFragments Ideal Money protocol @ https://fragments.org/protocol
 *      uFragments operates symmetrically on expansion and contraction. It will both split and
 *      combine coins to maintain a stable unit price.
 *
 *      uFragment balances are internally represented with a hidden denomination, 'gons'. We support
 *      splitting the currency in expansion and combining the currency on contraction by changing
 *      the exchange rate between the hidden 'gons' and the public 'ufragments'. This exchange rate
 *      is determined by the internal properties 'GONS' and 'totalSupply_'.
 */
contract UFragments is DetailedERC20, Ownable {
    // PLEASE READ BEFORE CHANGING ANY ACCOUNTING OR MATH
    // Anytime there is division, there is a risk of numerical instability from rounding errors. In
    // order to minimize this risk, we adhere to the following guidelines:
    // 1) The conversion rate adopted is the number of gons that equals 1 fragment. The inverse
    //    rate must not be used--GONS is always the numerator and totalSupply_ is always the
    //    denominator. (i.e. If you want to convert gons to fragments instead of multiplying by the
    //    inverse rate, you should divide by the normal rate)
    // 2) Gon balances converted into fragments are always rounded down (truncated).
    // 3) Fragment values converted to gon values (such as in transfers) are chosen such at the
    //    below guarantees are upheld.
    //
    // We make the following guarantees:
    // - If address 'A' transfers x fragments to address 'B'. A's resulting external balance will
    //   be decreased by precisely x fragments, and B's external balance will be precisely
    //   increased by x fragments.
    //
    // We do not guarantee that the sum of all balances equals the result of calling totalSupply().
    // This is because, for any conversion function 'f()' that has non-zero rounding error,
    // f(x0) + f(x1) + ... + f(xn) is not always equal to f(x0 + x1 + ... xn).
    //
    // 'The Introduction of the Euro and the Rounding of Currency Amounts (1999)' is a good starting
    // reference for practices related to currency conversions.
    // http://ec.europa.eu/economy_finance/publications/pages/publication1224_en.pdf
    using SafeMath for uint256;

    event LogRebase(uint256 indexed epoch, uint256 totalSupply);
    event LogRebasePaused(bool paused);
    event LogTokenPaused(bool paused);

    // Used for basic authz.
    address public monetaryPolicy;

    modifier onlyMonetaryPolicy() {
        require(msg.sender == monetaryPolicy);
        _;
    }

    // Emergency controls to bridge until system stability
    bool public rebasePaused;
    bool public tokenPaused;

    modifier whenRebaseNotPaused() {
        require(!rebasePaused);
        _;
    }

    modifier whenTokenNotPaused() {
        require(!tokenPaused);
        _;
    }

    modifier validRecipient(address to) {
        require(to != address(0x0));
        require(to != address(this));
        _;
    }

    mapping(address => uint256) private gonBalances;

    // Use max uint256 to get highest granularity
    uint256 private constant GONS = ~uint256(0);
    uint256 private totalSupply_;
    uint256 private gonsPerFragment;

    // This is denominated in uFragments, because the gons-fragments conversion might change before
    // it's fully paid.
    mapping (address => mapping (address => uint256)) private allowedFragments;

    /**
     * @param monetaryPolicy_ The address of the monetary policy contract to use for authz.
     */
    function setMonetaryPolicy(address monetaryPolicy_) external onlyOwner {
        monetaryPolicy = monetaryPolicy_;
    }

    /**
     * @dev Pauses or unpauses the execution of rebase operations.
     * @param paused Pauses rebase operations if this is true.
     */
    function setRebasePaused(bool paused) external onlyOwner {
        rebasePaused = paused;
        emit LogRebasePaused(paused);
    }

    /**
     * @dev Pauses or unpauses execution of ERC-20 transactions.
     * @param paused Pauses ERC-20 transactions if this is true.
     */
    function setTokenPaused(bool paused) external onlyOwner {
        tokenPaused = paused;
        emit LogTokenPaused(paused);
    }

    /**
     * @dev Notifies Fragments contract about a new rebase cycle.
     * @param supplyDelta The number of new fragment tokens to add into circulation via expansion.
     */
    function rebase(uint256 epoch, int256 supplyDelta) external onlyMonetaryPolicy whenRebaseNotPaused {
        if (supplyDelta < 0) {
            totalSupply_ = totalSupply_.sub(uint256(-supplyDelta));
        } else {
            totalSupply_ = totalSupply_.add(uint256(supplyDelta));
        }
        gonsPerFragment = GONS.div(totalSupply_);
        emit LogRebase(epoch, totalSupply_);
    }

    function initialize(address owner) public isInitializer("UFragments", "0") {
        DetailedERC20.initialize("UFragments", "UFRG", 2);
        Ownable.initialize(owner);

        rebasePaused = false;
        tokenPaused = false;

        totalSupply_ = 50000000;  // 50M
        gonBalances[owner] = GONS;
        gonsPerFragment = GONS.div(totalSupply_);
    }

    /**
     * @return The total number of fragments.
     */
    function totalSupply() public view returns (uint256) {
        return totalSupply_;
    }

    /**
     * @param who The address to query.
     * @return The balance of the specified address.
     */
    function balanceOf(address who) public view returns (uint256) {
        return gonBalances[who].div(gonsPerFragment);
    }

    /**
     * @dev Transfer tokens to a specified address.
     * @param to The address to transfer to.
     * @param value The amount to be transferred.
     * @return True on success, false otherwise.
     */
    function transfer(address to, uint256 value) public whenTokenNotPaused returns (bool) {
        transferHelper(msg.sender, to, value);
        return true;
    }

    /**
     * @dev Function to check the amount of tokens that an owner has allowed to a spender.
     * @param owner The address which owns the funds.
     * @param spender The address which will spend the funds.
     * @return The number of tokens still available for the spender.
     */
    function allowance(address owner, address spender) public view returns (uint256) {
        return allowedFragments[owner][spender];
    }

    /**
     * @dev Transfer tokens from one address to another.
     * @param from The address you want to send tokens from.
     * @param to The address you want to transfer to.
     * @param value The amount of tokens to be transferred.
     */
    function transferFrom(address from, address to, uint256 value) public whenTokenNotPaused returns (bool) {
        require(value <= allowedFragments[from][msg.sender]);
        allowedFragments[from][msg.sender] = allowedFragments[from][msg.sender].sub(value);
        transferHelper(from, to, value);
        return true;
    }

    /**
     * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
     *
     * Beware that changing an allowance with this method brings the risk that someone may use both the old
     * and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
     * race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     */
    function approve(address spender, uint256 value) public whenTokenNotPaused returns (bool) {
        allowedFragments[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    /**
     * @dev Increase the amount of tokens that an owner has allowed to a spender.
     *
     * approve should be called when allowed[spender] == 0. To increment
     * allowed value is better to use this function to avoid 2 calls (and wait until
     * the first transaction is mined)
     * From MonolithDAO Token.sol
     * @param spender The address which will spend the funds.
     * @param addedValue The amount of tokens to increase the allowance by.
     */
    function increaseApproval(address spender, uint256 addedValue) public whenTokenNotPaused returns (bool) {
        allowedFragments[msg.sender][spender] = allowedFragments[msg.sender][spender].add(addedValue);
        emit Approval(msg.sender, spender, allowedFragments[msg.sender][spender]);
        return true;
    }

    /**
     * @dev Decrease the amount of tokens that an owner has allowed to a spender.
     *
     * approve should be called when allowed[spender] == 0. To decrement
     * allowed value is better to use this function to avoid 2 calls (and wait until
     * the first transaction is mined)
     * From MonolithDAO Token.sol
     * @param spender The address which will spend the funds.
     * @param subtractedValue The amount of tokens to decrease the allowance by.
     */
    function decreaseApproval(address spender, uint256 subtractedValue) public whenTokenNotPaused returns (bool) {
        uint256 oldValue = allowedFragments[msg.sender][spender];
        if (subtractedValue >= oldValue) {
            allowedFragments[msg.sender][spender] = 0;
        } else {
            allowedFragments[msg.sender][spender] = oldValue.sub(subtractedValue);
        }
        emit Approval(msg.sender, spender, allowedFragments[msg.sender][spender]);
        return true;
    }

    /**
     * @dev Transfers a number of gons between from and to, such that the resulting balances match
     * the expectations when denominated in fragments.
     */
    function transferHelper(address from, address to, uint256 value) private validRecipient(to) {
        uint256 senderMod = gonBalances[from] % gonsPerFragment;
        uint256 receiverMod = gonBalances[to] % gonsPerFragment;
        uint256 baseAmt = value.mul(gonsPerFragment);

        uint256 senderGonMinAmt = baseAmt.sub(gonsPerFragment.sub(senderMod).sub(1));
        uint256 receiverGonMinAmt = baseAmt.sub(receiverMod);

        // Choose the max of the minimum viable transfer amounts on each side.
        uint256 gonValue = (senderGonMinAmt >= receiverGonMinAmt) ? senderGonMinAmt : receiverGonMinAmt;

        require(gonValue <= gonBalances[from]);
        gonBalances[from] = gonBalances[from].sub(gonValue);
        gonBalances[to] = gonBalances[to].add(gonValue);
        emit Transfer(from, to, value);
    }
}
