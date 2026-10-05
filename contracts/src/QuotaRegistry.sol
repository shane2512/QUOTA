// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InternalBinaryIMT, BinaryIMTData} from "@zk-kit/imt.sol/InternalBinaryIMT.sol";
import {SNARK_SCALAR_FIELD} from "@zk-kit/imt.sol/Constants.sol";
import {PoseidonT2} from "poseidon-solidity/PoseidonT2.sol";
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
/// Slash (PRD C5, B2) is commit–reveal: a slash transaction carries the cheater's secret `a0`, so a block
/// leader or RPC operator who sees it could copy it with their own receiver. The reward is bound to a
/// receiver in an earlier-block commitment, so copying the reveal gains nothing. This is not BTX.
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
        Withdrawn,
        Slashed
    }

    struct Member {
        address operator;
        State state;
        uint64 limit;
        uint64 unlockAt;
        uint128 stake;
        uint32 index; // leaf index in the tree
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
    uint256 public immutable SLASH_SHARE_BPS; // share of a slashed stake paid to the receiver; the rest is burned
    /// RLN(20,16) RangeCheck(16): a limit above 2^16 - 1 could never produce a valid proof.
    uint64 public constant MAX_LIMIT = 65535;

    BinaryIMTData internal tree;
    mapping(bytes32 => bool) internal allowedOrigin;
    mapping(address => Passkey) internal _passkeys;
    mapping(uint256 => Member) internal _members;
    mapping(uint256 => bool) internal rootSeen;
    mapping(uint256 => uint256) internal rootSupersededAt;
    mapping(uint256 => uint256) internal leafAt; // index → current leaf (0 = removed)
    mapping(bytes32 => uint256) public slashCommitBlock; // commitment → block it was first seen
    mapping(uint256 => bool) public pendingRemoval; // slashed while Active, leaf not yet removed
    uint256 public totalBurned;

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
    event SlashCommitted(bytes32 indexed commitment, address indexed committer);
    event Slashed(uint256 indexed idCommitment, address indexed receiver, uint256 reward, uint256 burned, bool leafRemoved);

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
    error BadShare();
    error NoCommitment();
    error RevealTooEarly();
    error NotSlashable();
    error NotPendingRemoval();
    error BadProof();

    constructor(
        string memory rpId,
        string[] memory origins,
        uint256 depth,
        uint256 unit,
        uint256 unstakeDelay,
        uint256 rootTtl,
        uint256 slashShareBps
    ) {
        if (slashShareBps >= 10_000) revert BadShare(); // a full refund would make self-slashing free
        RP_ID_HASH = sha256(bytes(rpId));
        UNIT = unit;
        UNSTAKE_DELAY = unstakeDelay;
        ROOT_TTL = rootTtl;
        SLASH_SHARE_BPS = slashShareBps;
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

    /// @notice Leaves [from, from+count) clipped to the tree size, so clients sync with reads instead of event scans.
    function leaves(uint256 from, uint256 count) external view returns (uint256[] memory out) {
        uint256 n = tree.numberOfLeaves;
        if (from >= n) return out;
        if (count > n - from) count = n - from;
        out = new uint256[](count);
        for (uint256 i; i < count; i++) {
            out[i] = leafAt[from + i];
        }
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
        if (limit == 0 || limit > MAX_LIMIT) revert BadLimit();
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
        m.index = uint32(index);
        uint256 leaf = PoseidonT3.hash([idCommitment, uint256(limit)]);
        tree._insert(leaf);
        leafAt[index] = leaf;
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
        if (newLimit == 0 || newLimit > MAX_LIMIT) revert BadLimit();
        if (m.stake < uint256(newLimit) * UNIT) revert StakeTooLow();

        _checkPasskey(msg.sender, Action.ChangeLimit, abi.encode(idCommitment, newLimit), a);

        uint256 oldLeaf = PoseidonT3.hash([idCommitment, uint256(m.limit)]);
        uint256 newLeaf = PoseidonT3.hash([idCommitment, uint256(newLimit)]);
        uint256 prev = tree.root;
        tree._update(oldLeaf, newLeaf, siblings, path);
        _rootChanged(prev);
        leafAt[_index(path)] = newLeaf;
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
        leafAt[_index(path)] = 0;
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

    // ------------------------------------------------------------------ slash

    /// @notice Step 1: commit to keccak256(abi.encode(a0, receiver, salt)). Reveals nothing about a0.
    function commitSlash(bytes32 commitment) external {
        if (slashCommitBlock[commitment] == 0) {
            slashCommitBlock[commitment] = block.number;
            emit SlashCommitted(commitment, msg.sender);
        }
    }

    /// @notice Step 2 (a later block): reveal the recovered secret. Pays SLASH_SHARE_BPS of the stake to the
    /// committed receiver and burns the rest. Works while Active or Unstaking, so unstaking cannot dodge it.
    /// If the member is still in the tree, the leaf is removed when `siblings`/`path` match the current root;
    /// otherwise (root moved since they were built) the payout still happens and `removeSlashedLeaf` finishes.
    function revealSlash(
        uint256 a0,
        address payable receiver,
        bytes32 salt,
        uint256[] calldata siblings,
        uint8[] calldata path
    ) external {
        bytes32 c = keccak256(abi.encode(a0, receiver, salt));
        uint256 committedAt = slashCommitBlock[c];
        if (committedAt == 0) revert NoCommitment();
        if (committedAt >= block.number) revert RevealTooEarly();
        delete slashCommitBlock[c];

        uint256 id = PoseidonT2.hash([a0]);
        Member storage m = _members[id];
        State st = m.state;
        if (st != State.Active && st != State.Unstaking) revert NotSlashable();

        uint256 stake = m.stake;
        uint256 reward = stake * SLASH_SHARE_BPS / 10_000;
        m.state = State.Slashed;
        m.stake = 0;
        totalBurned += stake - reward;

        bool removed = st != State.Active;
        if (st == State.Active) {
            removed = _tryRemove(PoseidonT3.hash([id, uint256(m.limit)]), siblings, path);
            if (!removed) pendingRemoval[id] = true;
        }
        emit Slashed(id, receiver, reward, stake - reward, removed);
        (bool ok,) = receiver.call{value: reward}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Remove the leaf of a member slashed while its siblings were stale. Anyone may call.
    function removeSlashedLeaf(uint256 idCommitment, uint256[] calldata siblings, uint8[] calldata path) external {
        if (!pendingRemoval[idCommitment]) revert NotPendingRemoval();
        delete pendingRemoval[idCommitment];
        if (!_tryRemove(PoseidonT3.hash([idCommitment, uint256(_members[idCommitment].limit)]), siblings, path)) {
            revert BadProof();
        }
    }

    // --------------------------------------------------------------- internal

    /// Remove `leaf` (set it to the zero leaf 0) in ONE pass over the path: the old and the new root are hashed
    /// side by side, and nothing is written unless the old one equals the current root. zk-kit's _remove would
    /// verify the proof and then hash the path twice more (~60 Poseidon calls vs ~40 here; slashing gas is what
    /// makes small slashes unprofitable). The `lastSubtrees` cache is updated exactly as InternalBinaryIMT._update
    /// does, so later appends stay correct (pinned by OnePassRemovalTest against a full reference recompute).
    /// Returns false (no state change) if the proof does not match the current root.
    function _tryRemove(uint256 leaf, uint256[] calldata siblings, uint8[] calldata path) private returns (bool) {
        uint256 depth = tree.depth;
        if (siblings.length != depth || path.length != depth) return false;
        uint256 oldHash = leaf;
        uint256 newHash = 0; // zero leaf
        uint256[] memory newNodes = new uint256[](depth); // new node value at each level, before hashing upward
        for (uint256 i; i < depth; i++) {
            uint256 sib = siblings[i];
            uint8 bit = path[i];
            if (sib >= SNARK_SCALAR_FIELD || bit > 1) return false;
            newNodes[i] = newHash;
            if (bit == 0) {
                oldHash = PoseidonT3.hash([oldHash, sib]);
                newHash = PoseidonT3.hash([newHash, sib]);
            } else {
                oldHash = PoseidonT3.hash([sib, oldHash]);
                newHash = PoseidonT3.hash([sib, newHash]);
            }
        }
        uint256 prev = tree.root;
        if (oldHash != prev) return false;
        for (uint256 i; i < depth; i++) {
            if (path[i] == 0) {
                if (siblings[i] == tree.lastSubtrees[i][1]) tree.lastSubtrees[i][0] = newNodes[i];
            } else {
                if (siblings[i] == tree.lastSubtrees[i][0]) tree.lastSubtrees[i][1] = newNodes[i];
            }
        }
        tree.root = newHash;
        _rootChanged(prev);
        uint256 idx = _index(path);
        leafAt[idx] = 0;
        emit LeafSet(idx, 0);
        return true;
    }

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
