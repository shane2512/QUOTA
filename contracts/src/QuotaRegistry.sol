// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InternalBinaryIMT, BinaryIMTData} from "@zk-kit/imt.sol/InternalBinaryIMT.sol";
import {SNARK_SCALAR_FIELD} from "@zk-kit/imt.sol/Constants.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PasskeyAuth} from "./PasskeyAuth.sol";

/// @title QuotaRegistry
/// @notice Staked membership set for anonymous rate limits (PRD C1, C3, C4, C6).
///
/// Leaf = Poseidon(idCommitment, limit) where idCommitment = Poseidon(a0). The contract computes
/// the leaf itself so an operator cannot commit to a larger limit than the stake pays for.
/// Operator = msg.sender. Every custody action needs a fresh WebAuthn assertion bound to
/// (chainId, this registry, operator, action, params, nonce); see PasskeyAuth.
///
/// Slash (PRD C5) arrives in Phase 3 and uses the member records kept here.
contract QuotaRegistry {
    using InternalBinaryIMT for BinaryIMTData;

    enum Action {
        RegisterPasskey,
        Enroll,
        RequestUnstake,
        ChangeLimit
    }

    enum State {
        None,
        Active,
        Unstaking,
        Withdrawn
    }

    struct Member {
        address operator;
        State state;
        uint64 limit;
        uint64 unlockAt;
        uint128 stake;
        address destination;
    }

    struct Passkey {
        uint256 x;
        uint256 y;
        uint256 nonce;
    }

    bytes32 public immutable RP_ID_HASH;
    uint256 public immutable UNIT; // wei of stake per message of per-epoch limit
    uint256 public immutable UNSTAKE_DELAY; // seconds between requestUnstake and unstake
    uint256 public immutable ROOT_TTL; // seconds a superseded root stays acceptable

    BinaryIMTData internal tree;
    mapping(bytes32 => bool) internal allowedOrigin;
    mapping(address => Passkey) internal _passkeys;
    mapping(uint256 => Member) internal _members;
    mapping(uint256 => bool) internal rootSeen;
    mapping(uint256 => uint256) internal rootSupersededAt;

    event PasskeyRegistered(address indexed operator, uint256 x, uint256 y);
    event Enrolled(
        uint256 indexed idCommitment, address indexed operator, uint64 limit, uint256 stake, uint256 index, uint256 leaf
    );
    /// Every tree mutation. leaf == 0 means removed. Off-chain trees rebuild from these in order.
    event LeafSet(uint256 indexed index, uint256 leaf);
    event ToppedUp(uint256 indexed idCommitment, uint256 amount, uint256 stake);
    event LimitChanged(uint256 indexed idCommitment, uint64 limit);
    event UnstakeRequested(uint256 indexed idCommitment, address destination, uint64 unlockAt);
    event Unstaked(uint256 indexed idCommitment, address destination, uint256 amount);

    error PasskeyAlreadyRegistered();
    error BadPasskey();
    error NoPasskey();
    error UnknownTree();
    error BadLimit();
    error BadCommitment();
    error StakeTooLow();
    error AlreadyEnrolled();
    error NotOperator();
    error NotActive();
    error NotUnstaking();
    error StillLocked();
    error BadDestination();
    error TransferFailed();
    error StakeOverflow();

    constructor(
        string memory rpId,
        string[] memory origins,
        uint256 depth,
        uint256 unit,
        uint256 unstakeDelay,
        uint256 rootTtl
    ) {
        RP_ID_HASH = sha256(bytes(rpId));
        UNIT = unit;
        UNSTAKE_DELAY = unstakeDelay;
        ROOT_TTL = rootTtl;
        for (uint256 i; i < origins.length; i++) {
            allowedOrigin[keccak256(bytes(origins[i]))] = true;
        }
        tree._init(depth, 0); // zero leaf = 0, as in the RLN-v2 circuit
        rootSeen[tree.root] = true;
    }

    // ------------------------------------------------------------------ views

    function root() public view returns (uint256) {
        return tree.root;
    }

    function numberOfLeaves() external view returns (uint256) {
        return tree.numberOfLeaves;
    }

    function depth() external view returns (uint256) {
        return tree.depth;
    }

    function members(uint256 idCommitment) external view returns (Member memory) {
        return _members[idCommitment];
    }

    function passkeys(address operator) external view returns (uint256 x, uint256 y) {
        Passkey storage p = _passkeys[operator];
        return (p.x, p.y);
    }

    function passkeyNonce(address operator) external view returns (uint256) {
        return _passkeys[operator].nonce;
    }

    /// @notice A root is acceptable if it is current, or was superseded no more than ROOT_TTL ago.
    /// Removals (unstake, slash) therefore take full effect after at most ROOT_TTL.
    function isKnownRoot(uint256 r) public view returns (bool) {
        if (!rootSeen[r]) return false;
        if (r == tree.root) return true;
        return block.timestamp <= rootSupersededAt[r] + ROOT_TTL;
    }

    // ---------------------------------------------------------------- passkey

    /// @notice Registers the operator's P-256 key (once). The assertion proves possession of the key.
    function registerPasskey(uint256 x, uint256 y, PasskeyAuth.Assertion calldata a) external {
        Passkey storage p = _passkeys[msg.sender];
        if (p.x != 0) revert PasskeyAlreadyRegistered();
        if (x == 0 || y == 0) revert BadPasskey();
        _verify(msg.sender, Action.RegisterPasskey, abi.encode(x, y), p.nonce, x, y, a);
        p.x = x;
        p.y = y;
        p.nonce = 1;
        emit PasskeyRegistered(msg.sender, x, y);
    }

    function _checkPasskey(address operator, Action action, bytes memory params, PasskeyAuth.Assertion calldata a)
        private
    {
        Passkey storage p = _passkeys[operator];
        if (p.x == 0) revert NoPasskey();
        _verify(operator, action, params, p.nonce, p.x, p.y, a);
        p.nonce++;
    }

    function _verify(
        address operator,
        Action action,
        bytes memory params,
        uint256 nonce,
        uint256 x,
        uint256 y,
        PasskeyAuth.Assertion calldata a
    ) private view {
        bytes32 challenge =
            keccak256(abi.encode(block.chainid, address(this), operator, uint8(action), keccak256(params), nonce));
        PasskeyAuth.verify(a, challenge, x, y, RP_ID_HASH, allowedOrigin);
    }

    // ------------------------------------------------------------------ stake

    /// @notice Enroll an agent. `treeId` must be 0 (Open tree); Screened/Compliant trees are Phase 6.
    function enroll(uint256 idCommitment, uint64 limit, uint256 treeId, PasskeyAuth.Assertion calldata a)
        external
        payable
    {
        if (treeId != 0) revert UnknownTree();
        if (limit == 0) revert BadLimit();
        if (idCommitment == 0 || idCommitment >= SNARK_SCALAR_FIELD) revert BadCommitment();
        if (msg.value < uint256(limit) * UNIT) revert StakeTooLow();
        if (msg.value > type(uint128).max) revert StakeOverflow();
        Member storage m = _members[idCommitment];
        if (m.state != State.None) revert AlreadyEnrolled();

        _checkPasskey(msg.sender, Action.Enroll, abi.encode(idCommitment, limit, treeId, msg.value), a);

        m.operator = msg.sender;
        m.state = State.Active;
        m.limit = limit;
        m.stake = uint128(msg.value);

        uint256 prev = tree.root;
        uint256 index = tree.numberOfLeaves;
        uint256 leaf = PoseidonT3.hash([idCommitment, uint256(limit)]);
        tree._insert(leaf);
        _rootChanged(prev);
        emit Enrolled(idCommitment, msg.sender, limit, msg.value, index, leaf);
        emit LeafSet(index, leaf);
    }

    /// @notice Add stake to an active member. Anyone may donate; only the operator can withdraw.
    function topUp(uint256 idCommitment) external payable {
        Member storage m = _members[idCommitment];
        if (m.state != State.Active) revert NotActive();
        uint256 s = uint256(m.stake) + msg.value;
        if (s > type(uint128).max) revert StakeOverflow();
        m.stake = uint128(s);
        emit ToppedUp(idCommitment, msg.value, s);
    }

    /// @notice Change an agent's per-epoch limit (replaces its leaf). Needs a passkey assertion.
    function changeLimit(
        uint256 idCommitment,
        uint64 newLimit,
        uint256[] calldata siblings,
        uint8[] calldata path,
        PasskeyAuth.Assertion calldata a
    ) external {
        Member storage m = _members[idCommitment];
        if (m.operator != msg.sender) revert NotOperator();
        if (m.state != State.Active) revert NotActive();
        if (newLimit == 0) revert BadLimit();
        if (m.stake < uint256(newLimit) * UNIT) revert StakeTooLow();

        _checkPasskey(msg.sender, Action.ChangeLimit, abi.encode(idCommitment, newLimit), a);

        uint256 oldLeaf = PoseidonT3.hash([idCommitment, uint256(m.limit)]);
        uint256 newLeaf = PoseidonT3.hash([idCommitment, uint256(newLimit)]);
        uint256 prev = tree.root;
        tree._update(oldLeaf, newLeaf, siblings, path);
        _rootChanged(prev);
        m.limit = newLimit;
        emit LimitChanged(idCommitment, newLimit);
        emit LeafSet(_index(path), newLeaf);
    }

    /// @notice Remove the agent from the tree and start the unstake delay. The withdrawal destination
    /// is bound into the passkey assertion, so a stolen operator wallet cannot redirect the funds.
    function requestUnstake(
        uint256 idCommitment,
        address destination,
        uint256[] calldata siblings,
        uint8[] calldata path,
        PasskeyAuth.Assertion calldata a
    ) external {
        Member storage m = _members[idCommitment];
        if (m.operator != msg.sender) revert NotOperator();
        if (m.state != State.Active) revert NotActive();
        if (destination == address(0)) revert BadDestination();

        _checkPasskey(msg.sender, Action.RequestUnstake, abi.encode(idCommitment, destination), a);

        uint256 prev = tree.root;
        tree._remove(PoseidonT3.hash([idCommitment, uint256(m.limit)]), siblings, path);
        _rootChanged(prev);
        m.state = State.Unstaking;
        m.destination = destination;
        m.unlockAt = uint64(block.timestamp + UNSTAKE_DELAY);
        emit UnstakeRequested(idCommitment, destination, m.unlockAt);
        emit LeafSet(_index(path), 0);
    }

    /// @notice Pay out after the delay. Anyone may call; funds only go to the bound destination.
    function unstake(uint256 idCommitment) external {
        Member storage m = _members[idCommitment];
        if (m.state != State.Unstaking) revert NotUnstaking();
        if (block.timestamp < m.unlockAt) revert StillLocked();
        uint256 amount = m.stake;
        address dest = m.destination;
        m.state = State.Withdrawn;
        m.stake = 0;
        (bool ok,) = dest.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Unstaked(idCommitment, dest, amount);
    }

    // --------------------------------------------------------------- internal

    function _rootChanged(uint256 prev) private {
        uint256 nr = tree.root;
        if (nr == prev) return;
        rootSupersededAt[prev] = block.timestamp;
        rootSupersededAt[nr] = 0;
        rootSeen[nr] = true;
    }

    function _index(uint8[] calldata path) private pure returns (uint256 idx) {
        for (uint256 i; i < path.length; i++) {
            idx |= uint256(path[i]) << i;
        }
    }
}
