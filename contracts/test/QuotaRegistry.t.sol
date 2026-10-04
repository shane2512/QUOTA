// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PasskeyAuth} from "../src/PasskeyAuth.sol";
import {QuotaRegistry} from "../src/QuotaRegistry.sol";

contract Reenter {
    QuotaRegistry public reg;
    uint256 public id;
    bool public reentered;

    constructor(QuotaRegistry r, uint256 i) {
        reg = r;
        id = i;
    }

    receive() external payable {
        try reg.unstake(id) {
            reentered = true;
        } catch {}
    }
}

abstract contract Base is Test {
    uint256 constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    string constant RP = "localhost";
    string constant ORIGIN = "http://localhost:3000";
    uint256 constant PK = 0xA11CE;
    uint256 constant DEPTH = 4;
    uint256 constant UNIT = 0.01 ether;
    uint256 constant DELAY = 1 days;
    uint256 constant TTL = 1 hours;
    uint256 constant SHARE = 5000; // 50% to the slasher

    uint8 constant A_REGISTER = 0;
    uint8 constant A_ENROLL = 1;
    uint8 constant A_UNSTAKE = 2;
    uint8 constant A_LIMIT = 3;

    QuotaRegistry reg;
    address op = address(0xA11);
    uint256 x;
    uint256 y;

    function setUp() public virtual {
        (x, y) = vm.publicKeyP256(PK);
        reg = _deploy();
        vm.deal(op, 100 ether);
    }

    function _deploy() internal returns (QuotaRegistry r) {
        string[] memory o = new string[](1);
        o[0] = ORIGIN;
        r = new QuotaRegistry(RP, o, DEPTH, UNIT, DELAY, TTL, SHARE);
    }

    // ---- passkey helpers (challenge computed independently of the contract) ----

    function _challenge(address registry, address operator, uint8 action, bytes memory params, uint256 nonce)
        internal
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, registry, operator, action, keccak256(params), nonce));
    }

    function _assertionFor(bytes32 challenge, uint256 pk) internal returns (PasskeyAuth.Assertion memory) {
        bytes memory ad = abi.encodePacked(sha256(bytes(RP)), uint8(0x05), uint32(1));
        string memory cdj = string.concat(
            '{"type":"webauthn.get","challenge":"',
            PasskeyAuth.b64url(challenge),
            '","origin":"',
            ORIGIN,
            '","crossOrigin":false}'
        );
        (bytes32 r, bytes32 s) = vm.signP256(pk, sha256(abi.encodePacked(ad, sha256(bytes(cdj)))));
        uint256 sv = uint256(s);
        if (sv > N / 2) sv = N - sv;
        return PasskeyAuth.Assertion(ad, cdj, uint256(r), sv);
    }

    function _sign(address operator, uint8 action, bytes memory params) internal returns (PasskeyAuth.Assertion memory) {
        return _assertionFor(_challenge(address(reg), operator, action, params, reg.passkeyNonce(operator)), PK);
    }

    function _register() internal {
        PasskeyAuth.Assertion memory a = _sign(op, A_REGISTER, abi.encode(x, y));
        vm.prank(op);
        reg.registerPasskey(x, y, a);
    }

    function _enroll(uint256 id, uint64 limit) internal {
        uint256 value = uint256(limit) * UNIT;
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(id, limit, uint256(0), value));
        vm.prank(op);
        reg.enroll{value: value}(id, limit, 0, a);
    }

    // ---- reference Merkle tree (full recompute, independent of zk-kit) ----

    function _levels(uint256[] memory leaves) internal returns (uint256[][] memory L) {
        L = new uint256[][](DEPTH + 1);
        L[0] = new uint256[](1 << DEPTH);
        for (uint256 i; i < leaves.length; i++) {
            L[0][i] = leaves[i];
        }
        for (uint256 d; d < DEPTH; d++) {
            L[d + 1] = new uint256[](L[d].length / 2);
            for (uint256 i; i < L[d + 1].length; i++) {
                L[d + 1][i] = PoseidonT3.hash([L[d][2 * i], L[d][2 * i + 1]]);
            }
        }
    }

    function _refRoot(uint256[] memory leaves) internal returns (uint256) {
        return _levels(leaves)[DEPTH][0];
    }

    function _proof(uint256[] memory leaves, uint256 idx) internal returns (uint256[] memory sib, uint8[] memory path) {
        uint256[][] memory L = _levels(leaves);
        sib = new uint256[](DEPTH);
        path = new uint8[](DEPTH);
        for (uint256 d; d < DEPTH; d++) {
            sib[d] = L[d][idx ^ 1];
            path[d] = uint8(idx & 1);
            idx >>= 1;
        }
    }

    function _leaf(uint256 id, uint64 limit) internal returns (uint256) {
        return PoseidonT3.hash([id, uint256(limit)]);
    }

    function _one(uint256 a) internal pure returns (uint256[] memory l) {
        l = new uint256[](1);
        l[0] = a;
    }

    function _two(uint256 a, uint256 b) internal pure returns (uint256[] memory l) {
        l = new uint256[](2);
        l[0] = a;
        l[1] = b;
    }
}

contract PoseidonTest is Test {
    function test_poseidon_circomVector() public {
        // circomlibjs poseidon([1,2])
        assertEq(
            PoseidonT3.hash([uint256(1), 2]),
            7853200120776062878684798364095072458815029376092732009249414926327459813530
        );
    }
}

contract RegisterPasskeyTest is Base {
    function test_register() public {
        _register();
        (uint256 px, uint256 py) = reg.passkeys(op);
        assertEq(px, x);
        assertEq(py, y);
        assertEq(reg.passkeyNonce(op), 1);
    }

    function test_register_twice_reverts() public {
        _register();
        PasskeyAuth.Assertion memory a = _sign(op, A_REGISTER, abi.encode(x, y));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.PasskeyAlreadyRegistered.selector);
        reg.registerPasskey(x, y, a);
    }

    function test_register_requiresPossessionOfKey() public {
        // assertion made by another key does not register someone else's key
        PasskeyAuth.Assertion memory a = _assertionFor(
            _challenge(address(reg), op, A_REGISTER, abi.encode(x, y), 0), 0xB0B
        );
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.BadSignature.selector);
        reg.registerPasskey(x, y, a);
    }

    function test_register_zeroKeyReverts() public {
        PasskeyAuth.Assertion memory a = _sign(op, A_REGISTER, abi.encode(uint256(0), uint256(0)));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.BadPasskey.selector);
        reg.registerPasskey(0, 0, a);
    }

    function test_register_boundToOperator() public {
        PasskeyAuth.Assertion memory a = _sign(op, A_REGISTER, abi.encode(x, y));
        vm.prank(address(0xBAD)); // someone else replays op's assertion
        vm.expectRevert(PasskeyAuth.ChallengeMismatch.selector);
        reg.registerPasskey(x, y, a);
    }

    function test_register_boundToRegistry() public {
        QuotaRegistry other = _deploy();
        PasskeyAuth.Assertion memory a = _assertionFor(_challenge(address(other), op, A_REGISTER, abi.encode(x, y), 0), PK);
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.ChallengeMismatch.selector);
        reg.registerPasskey(x, y, a);
    }

    function test_register_boundToChainId() public {
        PasskeyAuth.Assertion memory a = _sign(op, A_REGISTER, abi.encode(x, y));
        vm.chainId(999);
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.ChallengeMismatch.selector);
        reg.registerPasskey(x, y, a);
    }

    function test_register_boundToAction() public {
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(x, y));
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.ChallengeMismatch.selector);
        reg.registerPasskey(x, y, a);
    }
}

contract EnrollTest is Base {
    event Enrolled(
        uint256 indexed idCommitment, address indexed operator, uint64 limit, uint256 stake, uint256 index, uint256 leaf
    );
    event LeafSet(uint256 indexed index, uint256 leaf);

    function setUp() public override {
        super.setUp();
        _register();
    }

    function test_initialRootIsEmptyTree() public {
        assertEq(reg.root(), _refRoot(new uint256[](0)));
        assertTrue(reg.isKnownRoot(reg.root()));
    }

    function test_enroll_updatesRootAndRecordsMember() public {
        uint256 id = 111;
        uint256 leaf = _leaf(id, 5);
        vm.expectEmit(true, true, false, true);
        emit Enrolled(id, op, 5, 5 * UNIT, 0, leaf);
        vm.expectEmit(true, false, false, true);
        emit LeafSet(0, leaf);
        _enroll(id, 5);
        assertEq(reg.root(), _refRoot(_one(leaf)));
        assertEq(reg.numberOfLeaves(), 1);
        QuotaRegistry.Member memory m = reg.members(id);
        assertEq(m.operator, op);
        assertEq(m.limit, 5);
        assertEq(m.stake, 5 * UNIT);
        assertEq(uint256(m.state), uint256(QuotaRegistry.State.Active));
        assertEq(address(reg).balance, 5 * UNIT);
    }

    function test_enroll_twoLeavesMatchReference() public {
        _enroll(111, 5);
        _enroll(222, 3);
        assertEq(reg.root(), _refRoot(_two(_leaf(111, 5), _leaf(222, 3))));
    }

    function test_enroll_overpaymentIsStaked() public {
        uint256 value = 5 * UNIT + 1 wei;
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(uint256(111), uint64(5), uint256(0), value));
        vm.prank(op);
        reg.enroll{value: value}(111, 5, 0, a);
        assertEq(reg.members(111).stake, value);
    }

    function test_enroll_noPasskey_reverts() public {
        address other = address(0xC0DE);
        vm.deal(other, 1 ether);
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(uint256(1), uint64(1), uint256(0), UNIT));
        vm.prank(other);
        vm.expectRevert(QuotaRegistry.NoPasskey.selector);
        reg.enroll{value: UNIT}(1, 1, 0, a);
    }

    function test_enroll_stakeTooLow_reverts() public {
        PasskeyAuth.Assertion memory a =
            _sign(op, A_ENROLL, abi.encode(uint256(1), uint64(5), uint256(0), 5 * UNIT - 1));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.StakeTooLow.selector);
        reg.enroll{value: 5 * UNIT - 1}(1, 5, 0, a);
    }

    function test_enroll_zeroLimit_reverts() public {
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(uint256(1), uint64(0), uint256(0), UNIT));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.BadLimit.selector);
        reg.enroll{value: UNIT}(1, 0, 0, a);
    }

    function test_enroll_badCommitment_reverts() public {
        uint256 field = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(uint256(0), uint64(1), uint256(0), UNIT));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.BadCommitment.selector);
        reg.enroll{value: UNIT}(0, 1, 0, a);
        a = _sign(op, A_ENROLL, abi.encode(field, uint64(1), uint256(0), UNIT));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.BadCommitment.selector);
        reg.enroll{value: UNIT}(field, 1, 0, a);
    }

    function test_enroll_unknownTree_reverts() public {
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(uint256(1), uint64(1), uint256(1), UNIT));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.UnknownTree.selector);
        reg.enroll{value: UNIT}(1, 1, 1, a);
    }

    function test_enroll_duplicate_reverts() public {
        _enroll(111, 1);
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(uint256(111), uint64(1), uint256(0), UNIT));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.AlreadyEnrolled.selector);
        reg.enroll{value: UNIT}(111, 1, 0, a);
    }

    function test_enroll_replayedAssertion_reverts() public {
        // an assertion for id 111 cannot be reused to enroll id 222 or to enroll 111 again
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(uint256(111), uint64(1), uint256(0), UNIT));
        vm.prank(op);
        reg.enroll{value: UNIT}(111, 1, 0, a);
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.ChallengeMismatch.selector);
        reg.enroll{value: UNIT}(222, 1, 0, a);
    }

    function test_enroll_boundToParams() public {
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(uint256(111), uint64(1), uint256(0), UNIT));
        // different commitment
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.ChallengeMismatch.selector);
        reg.enroll{value: UNIT}(112, 1, 0, a);
        // different limit
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.ChallengeMismatch.selector);
        reg.enroll{value: 2 * UNIT}(111, 2, 0, a);
        // different value
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.ChallengeMismatch.selector);
        reg.enroll{value: 2 * UNIT}(111, 1, 0, a);
    }

    function test_enroll_treeFull() public {
        for (uint256 i; i < (1 << DEPTH); i++) {
            _enroll(i + 1, 1);
        }
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(uint256(999), uint64(1), uint256(0), UNIT));
        vm.prank(op);
        vm.expectRevert(); // zk-kit TreeIsFull
        reg.enroll{value: UNIT}(999, 1, 0, a);
    }

    function test_enroll_gas_depth20() public {
        string[] memory o = new string[](1);
        o[0] = ORIGIN;
        QuotaRegistry big = new QuotaRegistry(RP, o, 20, UNIT, DELAY, TTL, SHARE);
        PasskeyAuth.Assertion memory r =
            _assertionFor(_challenge(address(big), op, A_REGISTER, abi.encode(x, y), 0), PK);
        vm.prank(op);
        big.registerPasskey(x, y, r);
        PasskeyAuth.Assertion memory a = _assertionFor(
            _challenge(address(big), op, A_ENROLL, abi.encode(uint256(7), uint64(1), uint256(0), UNIT), 1), PK
        );
        vm.prank(op);
        uint256 g = gasleft();
        big.enroll{value: UNIT}(7, 1, 0, a);
        emit log_named_uint("enroll gas, depth 20 (forge, not Monad)", g - gasleft());
    }
}

contract RootsTest is Base {
    function setUp() public override {
        super.setUp();
        _register();
    }

    function test_unknownRoot() public {
        assertFalse(reg.isKnownRoot(12345));
    }

    function test_oldRootValidWithinTtlThenExpires() public {
        uint256 r0 = reg.root();
        _enroll(111, 1);
        uint256 r1 = reg.root();
        assertTrue(reg.isKnownRoot(r0));
        assertTrue(reg.isKnownRoot(r1));
        vm.warp(block.timestamp + TTL);
        assertTrue(reg.isKnownRoot(r0)); // boundary inclusive
        vm.warp(block.timestamp + 1);
        assertFalse(reg.isKnownRoot(r0));
        assertTrue(reg.isKnownRoot(r1)); // current root never expires
    }

    function test_currentRootNeverExpires() public {
        _enroll(111, 1);
        vm.warp(block.timestamp + 365 days);
        assertTrue(reg.isKnownRoot(reg.root()));
    }

    function test_rootThatReturnsBecomesValidAgain() public {
        uint256 r0 = reg.root();
        _enroll(111, 1);
        (uint256[] memory sib, uint8[] memory path) = _proof(_one(_leaf(111, 1)), 0);
        vm.warp(block.timestamp + 30 days);
        assertFalse(reg.isKnownRoot(r0));
        PasskeyAuth.Assertion memory a = _sign(op, A_UNSTAKE, abi.encode(uint256(111), op));
        vm.prank(op);
        reg.requestUnstake(111, op, sib, path, a);
        assertEq(reg.root(), r0); // empty tree again
        assertTrue(reg.isKnownRoot(r0));
    }
}

contract TopUpUnstakeTest is Base {
    function setUp() public override {
        super.setUp();
        _register();
        _enroll(111, 2);
    }

    function _req(address dest) internal {
        (uint256[] memory sib, uint8[] memory path) = _proof(_one(_leaf(111, 2)), 0);
        PasskeyAuth.Assertion memory a = _sign(op, A_UNSTAKE, abi.encode(uint256(111), dest));
        vm.prank(op);
        reg.requestUnstake(111, dest, sib, path, a);
    }

    function test_topUp_anyoneCanAddStake() public {
        address donor = address(0xD0);
        vm.deal(donor, 1 ether);
        vm.prank(donor);
        reg.topUp{value: 0.5 ether}(111);
        assertEq(reg.members(111).stake, 2 * UNIT + 0.5 ether);
    }

    function test_topUp_unknownOrInactive_reverts() public {
        vm.expectRevert(QuotaRegistry.NotActive.selector);
        reg.topUp{value: 1}(999);
        _req(op);
        vm.expectRevert(QuotaRegistry.NotActive.selector);
        reg.topUp{value: 1}(111);
    }

    function test_requestUnstake_removesLeaf() public {
        _req(op);
        assertEq(reg.root(), _refRoot(new uint256[](0)));
        QuotaRegistry.Member memory m = reg.members(111);
        assertEq(uint256(m.state), uint256(QuotaRegistry.State.Unstaking));
        assertEq(m.unlockAt, block.timestamp + DELAY);
        assertEq(m.destination, op);
    }

    function test_unstake_beforeDelay_reverts() public {
        _req(op);
        vm.warp(block.timestamp + DELAY - 1);
        vm.expectRevert(QuotaRegistry.StillLocked.selector);
        reg.unstake(111);
    }

    function test_unstake_paysDestinationOnce() public {
        address dest = address(0xDE57);
        _req(dest);
        vm.warp(block.timestamp + DELAY);
        reg.unstake(111);
        assertEq(dest.balance, 2 * UNIT);
        assertEq(address(reg).balance, 0);
        assertEq(reg.members(111).stake, 0);
        vm.expectRevert(QuotaRegistry.NotUnstaking.selector);
        reg.unstake(111);
    }

    function test_unstake_cannotReenroll() public {
        _req(op);
        vm.warp(block.timestamp + DELAY);
        reg.unstake(111);
        PasskeyAuth.Assertion memory a = _sign(op, A_ENROLL, abi.encode(uint256(111), uint64(2), uint256(0), 2 * UNIT));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.AlreadyEnrolled.selector);
        reg.enroll{value: 2 * UNIT}(111, 2, 0, a);
    }

    function test_unstake_destinationBoundToAssertion() public {
        (uint256[] memory sib, uint8[] memory path) = _proof(_one(_leaf(111, 2)), 0);
        PasskeyAuth.Assertion memory a = _sign(op, A_UNSTAKE, abi.encode(uint256(111), op));
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.ChallengeMismatch.selector);
        reg.requestUnstake(111, address(0xBAD), sib, path, a); // attacker swaps destination
    }

    function test_requestUnstake_onlyOperator() public {
        (uint256[] memory sib, uint8[] memory path) = _proof(_one(_leaf(111, 2)), 0);
        PasskeyAuth.Assertion memory a = _sign(op, A_UNSTAKE, abi.encode(uint256(111), op));
        vm.prank(address(0xBAD));
        vm.expectRevert(QuotaRegistry.NotOperator.selector);
        reg.requestUnstake(111, op, sib, path, a);
    }

    function test_requestUnstake_noPasskeySigIsNotEnough() public {
        (uint256[] memory sib, uint8[] memory path) = _proof(_one(_leaf(111, 2)), 0);
        PasskeyAuth.Assertion memory a = _assertionFor(
            _challenge(address(reg), op, A_UNSTAKE, abi.encode(uint256(111), op), reg.passkeyNonce(op)), 0xB0B
        );
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.BadSignature.selector);
        reg.requestUnstake(111, op, sib, path, a);
    }

    function test_requestUnstake_wrongProof_reverts() public {
        (uint256[] memory sib, uint8[] memory path) = _proof(_one(_leaf(111, 2)), 0);
        sib[1] += 1; // tampered sibling
        PasskeyAuth.Assertion memory a = _sign(op, A_UNSTAKE, abi.encode(uint256(111), op));
        vm.prank(op);
        vm.expectRevert(); // zk-kit LeafDoesNotExist
        reg.requestUnstake(111, op, sib, path, a);
    }

    function test_requestUnstake_replayedAssertion_reverts() public {
        _enroll(222, 2);
        (uint256[] memory sib, uint8[] memory path) = _proof(_two(_leaf(111, 2), _leaf(222, 2)), 0);
        PasskeyAuth.Assertion memory a = _sign(op, A_UNSTAKE, abi.encode(uint256(111), op));
        vm.prank(op);
        reg.requestUnstake(111, op, sib, path, a);
        (sib, path) = _proof(_one(_leaf(222, 2)), 1);
        // replay the same assertion on the other member
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.ChallengeMismatch.selector);
        reg.requestUnstake(222, op, sib, path, a);
    }

    function test_unstake_reentrancy_paysOnce() public {
        Reenter bad = new Reenter(reg, 111);
        _req(address(bad));
        vm.warp(block.timestamp + DELAY);
        reg.unstake(111);
        assertFalse(bad.reentered());
        assertEq(address(bad).balance, 2 * UNIT);
    }
}

contract ChangeLimitTest is Base {
    function setUp() public override {
        super.setUp();
        _register();
        _enroll(111, 2);
    }

    function _change(uint64 newLimit) internal {
        (uint256[] memory sib, uint8[] memory path) = _proof(_one(_leaf(111, 2)), 0);
        PasskeyAuth.Assertion memory a = _sign(op, A_LIMIT, abi.encode(uint256(111), newLimit));
        vm.prank(op);
        reg.changeLimit(111, newLimit, sib, path, a);
    }

    function test_changeLimit_updatesLeaf() public {
        vm.prank(op);
        reg.topUp{value: 3 * UNIT}(111); // stake now 5 UNIT
        _change(5);
        assertEq(reg.root(), _refRoot(_one(_leaf(111, 5))));
        assertEq(reg.members(111).limit, 5);
    }

    function test_changeLimit_lower() public {
        _change(1);
        assertEq(reg.root(), _refRoot(_one(_leaf(111, 1))));
    }

    function test_changeLimit_exceedsStake_reverts() public {
        (uint256[] memory sib, uint8[] memory path) = _proof(_one(_leaf(111, 2)), 0);
        PasskeyAuth.Assertion memory a = _sign(op, A_LIMIT, abi.encode(uint256(111), uint64(3)));
        vm.prank(op);
        vm.expectRevert(QuotaRegistry.StakeTooLow.selector);
        reg.changeLimit(111, 3, sib, path, a);
    }

    function test_changeLimit_needsPasskey() public {
        (uint256[] memory sib, uint8[] memory path) = _proof(_one(_leaf(111, 2)), 0);
        PasskeyAuth.Assertion memory a = _assertionFor(
            _challenge(address(reg), op, A_LIMIT, abi.encode(uint256(111), uint64(1)), reg.passkeyNonce(op)), 0xB0B
        );
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.BadSignature.selector);
        reg.changeLimit(111, 1, sib, path, a);
    }

    function test_changeLimit_onlyOperator() public {
        (uint256[] memory sib, uint8[] memory path) = _proof(_one(_leaf(111, 2)), 0);
        PasskeyAuth.Assertion memory a = _sign(op, A_LIMIT, abi.encode(uint256(111), uint64(1)));
        vm.prank(address(0xBAD));
        vm.expectRevert(QuotaRegistry.NotOperator.selector);
        reg.changeLimit(111, 1, sib, path, a);
    }

    function test_changeLimit_boundToNewLimit() public {
        (uint256[] memory sib, uint8[] memory path) = _proof(_one(_leaf(111, 2)), 0);
        PasskeyAuth.Assertion memory a = _sign(op, A_LIMIT, abi.encode(uint256(111), uint64(1)));
        vm.prank(op);
        vm.expectRevert(PasskeyAuth.ChallengeMismatch.selector);
        reg.changeLimit(111, 2, sib, path, a);
    }
}
