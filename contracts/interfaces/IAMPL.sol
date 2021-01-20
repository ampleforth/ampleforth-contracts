pragma solidity 0.4.24;

// Interface definition for the AMPL - ERC20 token on Ethereum (the base-chain)
interface IAMPL {
    // ERC20
    function totalSupply() external view returns (uint256);

    function balanceOf(address who) external view returns (uint256);

    function allowance(address owner_, address spender) external view returns (uint256);

    function transfer(address to, uint256 value) external returns (bool);

    function approve(address spender, uint256 value) external returns (bool);

    function increaseAllowance(address spender, uint256 addedValue) external returns (bool);

    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);

    event Approval(address indexed owner, address indexed spender, uint256 value);

    // EIP-2612
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function nonces(address owner) external view returns (uint256);

    function DOMAIN_SEPARATOR() external view returns (bytes32);

    // Elastic token interface
    function scaledBalanceOf(address who) external view returns (uint256);

    function scaledTotalSupply() external pure returns (uint256);

    function transferAll(address to) external returns (bool);

    function transferAllFrom(address from, address to) external returns (bool);

    // AMPL specific
    function monetaryPolicy() external view returns (address);

    event LogRebase(uint256 indexed epoch, uint256 totalSupply);

    event LogMonetaryPolicyUpdated(address monetaryPolicy);

    // Multi-chain AMPL
    function globalAMPLSupply() external view returns (uint256);
}
