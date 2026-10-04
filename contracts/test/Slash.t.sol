// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PoseidonT2} from "poseidon-solidity/PoseidonT2.sol";
import {PasskeyAuth} from "../src/PasskeyAuth.sol";
import {QuotaRegistry} from "../src/QuotaRegistry.sol";
import {Base} from "./QuotaRegistry.t.sol";

/// Test-only: a one-step slash (commit and reveal in the same call), i.e. what an unprotected `slash(a0, receiver)`
/// would be. Used only to show the copy-and-steal race is real (PRD §7 "slash race").
contract NaiveRegistry is QuotaRegistry {
    constructor(string memory rp, string[] memory o, uint256 d, uint256 u, uint256 del, uint256 ttl, uint256 sh)
        QuotaRegistry(rp, o, d, u, del, ttl, sh)
    {}

    function naiveSlash(uint256 a0, address payable receiver, uint256[] calldata sib, uint8[] calldata path) external {
        slashCommitBlock[keccak256(abi.encode(a0, receiver, bytes32(0)))] = block.number - 1;
        this.revealSlash(a0, receiver, bytes32(0), sib, path);
    }
}

contract RevertingReceiver {
    receive() external payable {
        revert("no");
    }
}

contract SlashTest is Base {
    uint256 constant A0 = 0xC0FFEE;
    uint256 constant OTHER_A0 = 0xBEEF;
    uint64 constant LIMIT = 4;
    uint256 id;
    uint256 otherId;
    address payable slasher = payable(address(0x5EA5));
    address payable searcher = payable(address(0x5EEC));
    bytes32 constant SALT = keccak256("salt");

    function setUp() public override {
        super.setUp();
        id = PoseidonT2.hash([A0]);
        otherId = PoseidonT2.hash([OTHER_A0]);
        _register();
        _enroll(otherId, 1); // index 0
        _enroll(id, LIMIT); // index 1
    }

    function _tree() internal returns (uint256[] memory) {
        return _two(_leaf(otherId, 1), _leaf(id, LIMIT));
    }

    function _commit(address payable receiver, bytes32 salt) internal {
        vm.prank(slasher);
        reg.commitSlash(keccak256(abi.encode(A0, receiver, salt)));
    }

    function _reveal(QuotaRegistry r, address who, address payable receiver, bytes32 salt) internal {
        (uint256[] memory sib, uint8[] memory path) = _proof(_tree(), 1);
        vm.prank(who);
        r.revealSlash(A0, receiver, salt, sib, path);
    }

    function test_idCommitmentMatchesCircuitPoseidon1() public {
        // circomlibjs poseidon([1]) — the circuit's identityCommitment hash
        assertEq(PoseidonT2.hash([uint256(1)]), 18586133768512220936620570745912940619677854269274689475585506675881198879027);
    }

    function test_slash_paysShareBurnsRestRemovesLeaf() public {
        uint256 stake = uint256(LIMIT) * UNIT;
        _commit(slasher, SALT);
        vm.roll(block.number + 1);
        _reveal(reg, slasher, slasher, SALT);

        assertEq(slasher.balance, stake * SHARE / 10_000);
        assertEq(reg.totalBurned(), stake - stake * SHARE / 10_000);
        QuotaRegistry.Member memory m = reg.members(id);
        assertEq(uint256(m.state), uint256(QuotaRegistry.State.Slashed));
        assertEq(m.stake, 0);
        assertEq(reg.root(), _refRoot(_one(_leaf(otherId, 1))));
        assertEq(reg.leaves(0, 10)[1], 0);
        assertFalse(reg.pendingRemoval(id));
    }

    function test_reveal_sameBlock_reverts() public {
        _commit(slasher, SALT);
        (uint256[] memory sib, uint8[] memory path) = _proof(_tree(), 1);
        vm.expectRevert(QuotaRegistry.RevealTooEarly.selector);
        reg.revealSlash(A0, slasher, SALT, sib, path);
    }

    function test_reveal_withoutCommit_reverts() public {
        vm.roll(block.number + 1);
        (uint256[] memory sib, uint8[] memory path) = _proof(_tree(), 1);
        vm.expectRevert(QuotaRegistry.NoCommitment.selector);
        reg.revealSlash(A0, slasher, SALT, sib, path);
    }

    function test_reveal_wrongSaltOrReceiver_reverts() public {
        _commit(slasher, SALT);
        vm.roll(block.number + 1);
        (uint256[] memory sib, uint8[] memory path) = _proof(_tree(), 1);
        vm.expectRevert(QuotaRegistry.NoCommitment.selector);
        reg.revealSlash(A0, slasher, keccak256("other"), sib, path);
        vm.expectRevert(QuotaRegistry.NoCommitment.selector);
        reg.revealSlash(A0, searcher, SALT, sib, path);
    }

    function test_slash_twice_reverts() public {
        _commit(slasher, SALT);
        _commit(slasher, keccak256("s2"));
        vm.roll(block.number + 1);
        _reveal(reg, slasher, slasher, SALT);
        (uint256[] memory sib, uint8[] memory path) = _proof(_tree(), 1); // Poseidon is an external library call
        vm.prank(slasher);
        vm.expectRevert(QuotaRegistry.NotSlashable.selector);
        reg.revealSlash(A0, slasher, keccak256("s2"), sib, path);
    }

    function test_slash_unknownSecret_reverts() public {
        bytes32 c = keccak256(abi.encode(uint256(12345), slasher, SALT));
        reg.commitSlash(c);
        vm.roll(block.number + 1);
        (uint256[] memory sib, uint8[] memory path) = _proof(_tree(), 1);
        vm.expectRevert(QuotaRegistry.NotSlashable.selector);
        reg.revealSlash(12345, slasher, SALT, sib, path);
    }

    function test_slashed_cannotReenrollOrUnstake() public {
        _commit(slasher, SALT);
        vm.roll(block.number + 1);
        _reveal(reg, slasher, slasher, SALT);
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(id, uint64(1), uint256(0), UNIT));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.AlreadyEnrolled.selector);
        reg.enroll{value: UNIT}(id, 1, 0, a);
        vm.expectRevert(QuotaRegistry.NotUnstaking.selector);
        reg.unstake(id);
    }

    function test_slash_duringUnstaking_dodgeFails() public {
        // The cheater requests unstake right after cheating; the stake is still slashable during the delay.
        (uint256[] memory sib, uint8[] memory path) = _proof(_tree(), 1);
        PasskeyAuth.Assertion memory a = _sign(op, A_UNSTAKE, abi.encode(id, op));
        vm.prank(op);
        reg.requestUnstake(id, op, sib, path, a);

        _commit(slasher, SALT);
        vm.roll(block.number + 1);
        (sib, path) = _proof(_one(_leaf(otherId, 1)), 1); // leaf already gone; siblings unused
        vm.prank(slasher);
        reg.revealSlash(A0, slasher, SALT, sib, path);
        assertEq(slasher.balance, uint256(LIMIT) * UNIT * SHARE / 10_000);
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(QuotaRegistry.NotUnstaking.selector);
        reg.unstake(id);
    }

    function test_staleSiblings_paysThenRemovalCompletes() public {
        _commit(slasher, SALT);
        (uint256[] memory staleSib, uint8[] memory path) = _proof(_tree(), 1);
        _enroll(PoseidonT2.hash([uint256(777)]), 1); // tree moves between commit and reveal
        vm.roll(block.number + 1);
        vm.prank(slasher);
        reg.revealSlash(A0, slasher, SALT, staleSib, path);

        assertEq(slasher.balance, uint256(LIMIT) * UNIT * SHARE / 10_000);
        assertTrue(reg.pendingRemoval(id));
        uint256[] memory three = new uint256[](3);
        three[0] = _leaf(otherId, 1);
        three[1] = _leaf(id, LIMIT);
        three[2] = _leaf(PoseidonT2.hash([uint256(777)]), 1);
        assertEq(reg.root(), _refRoot(three)); // still in the tree

        (uint256[] memory sib, uint8[] memory p2) = _proof(three, 1);
        reg.removeSlashedLeaf(id, sib, p2);
        three[1] = 0;
        assertEq(reg.root(), _refRoot(three));
        assertFalse(reg.pendingRemoval(id));
        vm.expectRevert(QuotaRegistry.NotPendingRemoval.selector);
        reg.removeSlashedLeaf(id, sib, p2);
    }

    function test_revertingReceiver_revertsWholeSlash() public {
        address payable bad = payable(address(new RevertingReceiver()));
        _commit(bad, SALT);
        vm.roll(block.number + 1);
        (uint256[] memory sib, uint8[] memory path) = _proof(_tree(), 1);
        vm.expectRevert(QuotaRegistry.TransferFailed.selector);
        reg.revealSlash(A0, bad, SALT, sib, path);
        assertEq(uint256(reg.members(id).state), uint256(QuotaRegistry.State.Active));
    }

    function test_commit_firstBlockKept() public {
        bytes32 c = keccak256(abi.encode(A0, slasher, SALT));
        reg.commitSlash(c);
        uint256 b = block.number;
        vm.roll(b + 5);
        reg.commitSlash(c); // re-commit does not reset the block
        assertEq(reg.slashCommitBlock(c), b);
    }

    // ---- searcher (copy-and-steal) test ----
    // Model: the searcher is a block leader / RPC operator who sees the slasher's pending transaction,
    // can copy its arguments and get its own transaction ordered first in the same block.

    function test_searcher_naiveSlash_isStolen() public {
        string[] memory o = new string[](1);
        o[0] = ORIGIN;
        NaiveRegistry n = new NaiveRegistry(RP, o, DEPTH, UNIT, DELAY, TTL, SHARE);
        reg = n; // reuse helpers against the naive registry
        _register();
        _enroll(otherId, 1);
        _enroll(id, LIMIT);
        (uint256[] memory sib, uint8[] memory path) = _proof(_tree(), 1);
        vm.roll(block.number + 10);

        // slasher broadcasts naiveSlash(a0, slasher); searcher copies a0 with its own receiver, ordered first
        vm.prank(searcher);
        n.naiveSlash(A0, searcher, sib, path);
        vm.prank(slasher);
        vm.expectRevert(QuotaRegistry.NotSlashable.selector);
        n.naiveSlash(A0, slasher, sib, path);

        assertEq(searcher.balance, uint256(LIMIT) * UNIT * SHARE / 10_000, "searcher stole the reward");
        assertEq(slasher.balance, 0);
    }

    function test_searcher_commitReveal_cannotSteal() public {
        _commit(slasher, SALT); // the searcher sees only an opaque hash
        vm.roll(block.number + 1);
        (uint256[] memory sib, uint8[] memory path) = _proof(_tree(), 1);

        // Searcher sees the reveal (a0 now public) and front-runs it in the same block:
        // (a) copy with its own receiver → no commitment for that receiver
        vm.prank(searcher);
        vm.expectRevert(QuotaRegistry.NoCommitment.selector);
        reg.revealSlash(A0, searcher, SALT, sib, path);
        // (b) commit and reveal in the same block → too early
        bytes32 sc = keccak256(abi.encode(A0, searcher, bytes32("s")));
        vm.prank(searcher);
        reg.commitSlash(sc);
        vm.prank(searcher);
        vm.expectRevert(QuotaRegistry.RevealTooEarly.selector);
        reg.revealSlash(A0, searcher, bytes32("s"), sib, path);

        // the slasher's reveal lands
        _reveal(reg, slasher, slasher, SALT);
        assertEq(slasher.balance, uint256(LIMIT) * UNIT * SHARE / 10_000);

        // (c) next block the searcher's own commitment is mature, but the member is already slashed
        vm.roll(block.number + 1);
        vm.prank(searcher);
        vm.expectRevert(QuotaRegistry.NotSlashable.selector);
        reg.revealSlash(A0, searcher, bytes32("s"), sib, path);
        assertEq(searcher.balance, 0, "searcher got nothing");
    }

    function test_searcher_exactCopy_paysCommittedReceiver() public {
        _commit(slasher, SALT);
        vm.roll(block.number + 1);
        _reveal(reg, searcher, slasher, SALT); // searcher submits the identical reveal first
        assertEq(slasher.balance, uint256(LIMIT) * UNIT * SHARE / 10_000);
        assertEq(searcher.balance, 0);
    }
}

contract LimitAndLeavesTest is Base {
    function setUp() public override {
        super.setUp();
        _register();
    }

    function test_enroll_limitAboveCircuitRange_reverts() public {
        uint64 limit = 65536;
        uint256 value = uint256(limit) * UNIT;
        vm.deal(op, value);
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(uint256(5), limit, uint256(0), value));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.BadLimit.selector);
        reg.enroll{value: value}(5, limit, 0, a);
    }

    function test_enroll_maxLimitOk() public {
        uint64 limit = 65535;
        uint256 value = uint256(limit) * UNIT;
        vm.deal(op, value);
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(uint256(5), limit, uint256(0), value));
        vm.prank(op);
        reg.enroll{value: value}(5, limit, 0, a);
        assertEq(reg.members(5).limit, limit);
    }

    function test_changeLimit_aboveCircuitRange_reverts() public {
        _enroll(7, 1);
        vm.deal(op, 1000 ether);
        reg.topUp{value: 700 ether}(7);
        (uint256[] memory sib, uint8[] memory path) = _proof(_one(_leaf(7, 1)), 0);
        PasskeyAuth.Assertion memory a = _sign(op, A_LIMIT, abi.encode(uint256(7), uint64(65536)));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.BadLimit.selector);
        reg.changeLimit(7, 65536, sib, path, a);
    }

    function test_leaves_and_memberIndex() public {
        _enroll(11, 1);
        _enroll(12, 2);
        _enroll(13, 3);
        uint256[] memory all = reg.leaves(0, 100);
        assertEq(all.length, 3);
        assertEq(all[0], _leaf(11, 1));
        assertEq(all[2], _leaf(13, 3));
        assertEq(reg.leaves(1, 1)[0], _leaf(12, 2));
        assertEq(reg.leaves(3, 5).length, 0);
        assertEq(reg.members(13).index, 2);

        // changeLimit and requestUnstake keep leaves() in sync
        (uint256[] memory sib, uint8[] memory path) = _proof(all, 1);
        PasskeyAuth.Assertion memory a = _sign(op, A_LIMIT, abi.encode(uint256(12), uint64(1)));
        vm.prank(op);
        reg.changeLimit(12, 1, sib, path, a);
        assertEq(reg.leaves(1, 1)[0], _leaf(12, 1));
        all[1] = _leaf(12, 1);
        (sib, path) = _proof(all, 2);
        a = _sign(op, A_UNSTAKE, abi.encode(uint256(13), op));
        vm.prank(op);
        reg.requestUnstake(13, op, sib, path, a);
        assertEq(reg.leaves(2, 1)[0], 0);
    }

    function test_constructor_fullShare_reverts() public {
        string[] memory o = new string[](1);
        o[0] = ORIGIN;
        vm.expectRevert(QuotaRegistry.BadShare.selector);
        new QuotaRegistry(RP, o, DEPTH, UNIT, DELAY, TTL, 10_000);
    }
}
