pragma solidity 0.4.24;

import "openzeppelin-zos/contracts/math/SafeMath.sol";
import "openzeppelin-zos/contracts/ownership/Ownable.sol";
import "openzeppelin-zos/contracts/token/ERC20/DetailedERC20.sol";

import "./lib/SafeMathInt.sol";


/**
 * @title uFragments ERC20 token
 * @dev This is an implementation of the uFragments Ideal Money protocol @ https://fragments.org/protocol
 *      uFragments operates symmetrically on expansion and contraction. It will both split and
 *      combine coins to maintain a stable unit price.
 *
 *      uFragment balances are internally represented with a hidden denomination, 'gons'. We support
 *      splitting the currency in expansion and combining the currency on contraction by changing
 *      the exchange rate between the hidden 'gons' and the public 'ufragments'. This exchange rate
 *      is determined by the internal properties '_totalGons' and '_totalSupply'.
 */
contract UFragments is DetailedERC20, Ownable {
    // PLEASE READ BEFORE CHANGING ANY ACCOUNTING OR MATH
    // Anytime there is division, there is a risk of numerical instability from rounding errors. In
    // order to minimize this risk, we adhere to the following guidelines:
    // 1) The conversion rate adopted is the number of gons that equals 1 fragment. The inverse
    //    rate must not be used--_totalGons is always the numerator and _totalSupply is always the
    //    denominator. (i.e. If you want to convert gons to fragments instead of multiplying by the
    //    inverse rate, you should divide by the normal rate)
    // 2) Gon balances converted into fragments are always rounded down (truncated).
    // 3) Fragment values converted to gon values (such as in transfers) are chosen such that the
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
    using SafeMathInt for int256;

    event LogRebase(uint256 indexed epoch, uint256 totalSupply);
    event LogRebasePaused(bool paused);
    event LogTokenPaused(bool paused);

    // Used for basic authz.
    address public _monetaryPolicy;

    modifier onlyMonetaryPolicy() {
        require(msg.sender == _monetaryPolicy);
        _;
    }

    // Emergency controls to bridge until system stability
    bool public _rebasePaused;
    bool public _tokenPaused;

    modifier whenRebaseNotPaused() {
        require(!_rebasePaused);
        _;
    }

    modifier whenTokenNotPaused() {
        require(!_tokenPaused);
        _;
    }

    modifier validRecipient(address to) {
        require(to != address(0x0));
        require(to != address(this));
        _;
    }

    mapping(address => uint256) private _gonBalances;

    uint8 private constant DECIMAL_POINTS = 2;
    uint256 private constant MAX_UINT256 = ~uint256(0);
    uint256 private constant MAX_SUPPLY = ~uint128(0);
    uint256 private _totalGons;
    uint256 private _totalSupply;
    uint256 private _gonsPerFragment;

    // This is denominated in uFragments, because the gons-fragments conversion might change before
    // it's fully paid.
    mapping (address => mapping (address => uint256)) private _allowedFragments;

    /**
     * @param monetaryPolicy The address of the monetary policy contract to use for authz.
     */
    function setMonetaryPolicy(address monetaryPolicy) external onlyOwner {
        require(_monetaryPolicy == address(0x0));
        _monetaryPolicy = monetaryPolicy;
    }

    /**
     * @dev Pauses or unpauses the execution of rebase operations.
     * @param paused Pauses rebase operations if this is true.
     */
    function setRebasePaused(bool paused) external onlyOwner {
        _rebasePaused = paused;
        emit LogRebasePaused(paused);
    }

    /**
     * @dev Pauses or unpauses execution of ERC-20 transactions.
     * @param paused Pauses ERC-20 transactions if this is true.
     */
    function setTokenPaused(bool paused) external onlyOwner {
        _tokenPaused = paused;
        emit LogTokenPaused(paused);
    }

    /**
     * @dev Notifies Fragments contract about a new rebase cycle.
     * @param supplyDelta The number of new fragment tokens to add into circulation via expansion.
     */
    function rebase(uint256 epoch, int256 supplyDelta) external onlyMonetaryPolicy whenRebaseNotPaused {
        if (supplyDelta < 0) {
            _totalSupply = _totalSupply.sub(supplyDelta.abs().toUInt256Safe());
        } else {
            _totalSupply = _totalSupply.add(uint256(supplyDelta));
        }

        // Cap the supply to MAX_UINT128
        if (_totalSupply >= MAX_SUPPLY) {
            _totalSupply = MAX_SUPPLY.sub(1);
        }

        // _gonsPerFragment is considered an exact value, such that
        // _gonsPerFragment can convert bidirectionally with no rounding errors.
        // If there is a remainder to this division, the precision loss is
        // assumed to be in _totalSupply and it can be up to
        // (_totalSupply^2)/(_totalGons - _totalSupply)
        _gonsPerFragment = _totalGons.div(_totalSupply);

        // If supply is >= MAX_UINT128 - not possible due to MAX_SUPPLY cap -
        // The assumed error in _totalSupply can be >= 1, and in that case
        // _totalSupply needs to be adjusted to the nearest smaller integer as
        // _totalSupply = _totalGons.div(_gonsPerFragment)
        // to minimize precision loss.
        emit LogRebase(epoch, _totalSupply);
    }

    function initialize(address owner) public isInitializer("UFragments", "0") {
        DetailedERC20.initialize("UFragments", "UFRG", DECIMAL_POINTS);
        Ownable.initialize(owner);

        _rebasePaused = false;
        _tokenPaused = false;

        // TODO(naguib): Correct this value to 50 * 10**6 * 10**2 and fix tests
        // accordingly
        _totalSupply = 50 * 10**6; // * 10**2;  // 50M

        // Set _totalGons to a multiple of totalSupply so _gonsPerFragment can be
        // computed exactly.
        // For highest granularity, set it to the greatest multiple of
        // _totalSupply that fits in a uint256
        _totalGons = MAX_UINT256.sub(MAX_UINT256 % _totalSupply);
        _gonBalances[owner] = _totalGons;
        _gonsPerFragment = _totalGons.div(_totalSupply);

        emit Transfer(address(0x0), owner, _totalSupply);
    }

    /**
     * @return The total number of fragments.
     */
    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    /**
     * @param who The address to query.
     * @return The balance of the specified address.
     */
    function balanceOf(address who) public view returns (uint256) {
        return _gonBalances[who].div(_gonsPerFragment);
    }

    /**
     * @dev Transfer tokens to a specified address.
     * @param to The address to transfer to.
     * @param value The amount to be transferred.
     * @return True on success, false otherwise.
     */
    function transfer(address to, uint256 value)
        public
        validRecipient(to)
        whenTokenNotPaused
        returns (bool)
    {
        uint256 gonValue = value.mul(_gonsPerFragment);
        _gonBalances[msg.sender] = _gonBalances[msg.sender].sub(gonValue);
        _gonBalances[to] = _gonBalances[to].add(gonValue);
        emit Transfer(msg.sender, to, value);
        return true;
    }

    /**
     * @dev Function to check the amount of tokens that an owner has allowed to a spender.
     * @param owner The address which owns the funds.
     * @param spender The address which will spend the funds.
     * @return The number of tokens still available for the spender.
     */
    function allowance(address owner, address spender) public view returns (uint256) {
        return _allowedFragments[owner][spender];
    }

    /**
     * @dev Transfer tokens from one address to another.
     * @param from The address you want to send tokens from.
     * @param to The address you want to transfer to.
     * @param value The amount of tokens to be transferred.
     */
    function transferFrom(address from, address to, uint256 value)
        public
        validRecipient(to)
        whenTokenNotPaused
        returns (bool)
    {
        require(value <= _allowedFragments[from][msg.sender]);
        _allowedFragments[from][msg.sender] = _allowedFragments[from][msg.sender].sub(value);

        uint256 gonValue = value.mul(_gonsPerFragment);
        _gonBalances[from] = _gonBalances[from].sub(gonValue);
        _gonBalances[to] = _gonBalances[to].add(gonValue);
        emit Transfer(from, to, value);

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
        require(spender != address(0x0));

        _allowedFragments[msg.sender][spender] = value;
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
    function increaseAllowance(address spender, uint256 addedValue) public whenTokenNotPaused returns (bool) {
        require(spender != address(0x0));

        _allowedFragments[msg.sender][spender] = _allowedFragments[msg.sender][spender].add(addedValue);
        emit Approval(msg.sender, spender, _allowedFragments[msg.sender][spender]);
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
    function decreaseAllowance(address spender, uint256 subtractedValue) public whenTokenNotPaused returns (bool) {
        require(spender != address(0x0));

        uint256 oldValue = _allowedFragments[msg.sender][spender];
        if (subtractedValue >= oldValue) {
            _allowedFragments[msg.sender][spender] = 0;
        } else {
            _allowedFragments[msg.sender][spender] = oldValue.sub(subtractedValue);
        }
        emit Approval(msg.sender, spender, _allowedFragments[msg.sender][spender]);
        return true;
    }
}
