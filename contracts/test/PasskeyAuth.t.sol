// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PasskeyAuth} from "../src/PasskeyAuth.sol";

/// Harness exposing the internal library with local state.
contract Harness {
    mapping(bytes32 => bool) public origins;
    bytes32 public rpIdHash;

    constructor(string memory rpId, string memory origin) {
        rpIdHash = sha256(bytes(rpId));
        origins[keccak256(bytes(origin))] = true;
    }

    function verify(PasskeyAuth.Assertion calldata a, bytes32 challenge, uint256 x, uint256 y) external view {
        PasskeyAuth.verify(a, challenge, x, y, rpIdHash, origins);
    }
}

contract PasskeyAuthTest is Test {
    uint256 constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    string constant RP = "localhost";
    string constant ORIGIN = "http://localhost:3000";
    uint256 constant PK = 0xA11CE;
    uint256 x;
    uint256 y;
    Harness h;
    bytes32 constant CH = keccak256("challenge-1");

    function setUp() public {
        (x, y) = vm.publicKeyP256(PK);
        h = new Harness(RP, ORIGIN);
    }

    // ---- helpers -------------------------------------------------------

    function _cdj(string memory type_, bytes32 challenge, string memory origin) internal pure returns (string memory) {
        return string.concat(
            '{"type":"',
            type_,
            '","challenge":"',
            PasskeyAuth.b64url(challenge),
            '","origin":"',
            origin,
            '","crossOrigin":false}'
        );
    }

    function _authData(string memory rp, uint8 flags) internal pure returns (bytes memory) {
        return abi.encodePacked(sha256(bytes(rp)), flags, uint32(1));
    }

    function _sign(bytes memory authData, string memory cdj, uint256 pk, bool lowS)
        internal
        returns (PasskeyAuth.Assertion memory a)
    {
        bytes32 digest = sha256(abi.encodePacked(authData, sha256(bytes(cdj))));
        (bytes32 r, bytes32 s) = vm.signP256(pk, digest);
        uint256 sv = uint256(s);
        if (lowS && sv > N / 2) sv = N - sv;
        if (!lowS && sv <= N / 2) sv = N - sv;
        a = PasskeyAuth.Assertion(authData, cdj, uint256(r), sv);
    }

    function _good() internal returns (PasskeyAuth.Assertion memory) {
        return _sign(_authData(RP, 0x05), _cdj("webauthn.get", CH, ORIGIN), PK, true);
    }

    // ---- positive ------------------------------------------------------

    function test_b64url_knownVectors() public pure {
        assertEq(PasskeyAuth.b64url(bytes32(0)), "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
        assertEq(PasskeyAuth.b64url(bytes32(type(uint256).max)), "__________________________________________8");
        // 0xfb -> "-w" (url alphabet uses '-' for 62), checked via 0xfbff.. prefix
        assertEq(
            bytes(PasskeyAuth.b64url(bytes32(hex"fbef"))).length, 43
        );
        assertEq(bytes(PasskeyAuth.b64url(bytes32(hex"fbef")))[0], bytes1("-"));
        assertEq(bytes(PasskeyAuth.b64url(bytes32(hex"fbef")))[1], bytes1("-"));
    }

    function test_valid() public {
        h.verify(_good(), CH, x, y);
    }

    function test_valid_UP_UV_plus_extra_flags() public {
        // BE|BS|UV|UP = 0x1d
        h.verify(_sign(_authData(RP, 0x1d), _cdj("webauthn.get", CH, ORIGIN), PK, true), CH, x, y);
    }

    // ---- negative ------------------------------------------------------

    function test_wrongChallenge() public {
        PasskeyAuth.Assertion memory a = _good();
        vm.expectRevert(PasskeyAuth.ChallengeMismatch.selector);
        h.verify(a, keccak256("other"), x, y);
    }

    function test_wrongType_create() public {
        PasskeyAuth.Assertion memory a = _sign(_authData(RP, 0x05), _cdj("webauthn.create", CH, ORIGIN), PK, true);
        vm.expectRevert(PasskeyAuth.BadClientData.selector);
        h.verify(a, CH, x, y);
    }

    function test_wrongOrigin() public {
        PasskeyAuth.Assertion memory a =
            _sign(_authData(RP, 0x05), _cdj("webauthn.get", CH, "https://evil.example"), PK, true);
        vm.expectRevert(PasskeyAuth.OriginNotAllowed.selector);
        h.verify(a, CH, x, y);
    }

    function test_originExtendsAllowed_rejected() public {
        PasskeyAuth.Assertion memory a =
            _sign(_authData(RP, 0x05), _cdj("webauthn.get", CH, "http://localhost:30000"), PK, true);
        vm.expectRevert(PasskeyAuth.OriginNotAllowed.selector);
        h.verify(a, CH, x, y);
    }

    function test_wrongRpId() public {
        PasskeyAuth.Assertion memory a =
            _sign(_authData("evil.example", 0x05), _cdj("webauthn.get", CH, ORIGIN), PK, true);
        vm.expectRevert(PasskeyAuth.RpIdMismatch.selector);
        h.verify(a, CH, x, y);
    }

    function test_missingUP() public {
        PasskeyAuth.Assertion memory a = _sign(_authData(RP, 0x04), _cdj("webauthn.get", CH, ORIGIN), PK, true);
        vm.expectRevert(PasskeyAuth.UserNotPresent.selector);
        h.verify(a, CH, x, y);
    }

    function test_missingUV() public {
        PasskeyAuth.Assertion memory a = _sign(_authData(RP, 0x01), _cdj("webauthn.get", CH, ORIGIN), PK, true);
        vm.expectRevert(PasskeyAuth.UserNotVerified.selector);
        h.verify(a, CH, x, y);
    }

    function test_highS() public {
        PasskeyAuth.Assertion memory a = _sign(_authData(RP, 0x05), _cdj("webauthn.get", CH, ORIGIN), PK, false);
        vm.expectRevert(PasskeyAuth.HighS.selector);
        h.verify(a, CH, x, y);
    }

    function test_wrongKey() public {
        (uint256 x2, uint256 y2) = vm.publicKeyP256(0xB0B);
        PasskeyAuth.Assertion memory a = _good();
        vm.expectRevert(PasskeyAuth.BadSignature.selector);
        h.verify(a, CH, x2, y2);
    }

    function test_tamperedClientData_signatureFails() public {
        PasskeyAuth.Assertion memory a = _good();
        a.clientDataJSON = string.concat(a.clientDataJSON, " ");
        vm.expectRevert(PasskeyAuth.BadSignature.selector);
        h.verify(a, CH, x, y);
    }

    function test_zeroR() public {
        PasskeyAuth.Assertion memory a = _good();
        a.r = 0;
        vm.expectRevert(PasskeyAuth.BadSignature.selector);
        h.verify(a, CH, x, y);
    }

    function test_malformed_garbage() public {
        PasskeyAuth.Assertion memory a = _sign(
            _authData(RP, 0x05), "not json at all, but long enough to pass a length check.....................", PK, true
        );
        vm.expectRevert(PasskeyAuth.BadClientData.selector);
        h.verify(a, CH, x, y);
    }

    function test_malformed_empty() public {
        PasskeyAuth.Assertion memory a = _sign(_authData(RP, 0x05), "", PK, true);
        vm.expectRevert(PasskeyAuth.BadClientData.selector);
        h.verify(a, CH, x, y);
    }

    function test_malformed_reorderedKeys() public {
        string memory cdj = string.concat(
            '{"challenge":"', PasskeyAuth.b64url(CH), '","type":"webauthn.get","origin":"', ORIGIN, '"}'
        );
        PasskeyAuth.Assertion memory a = _sign(_authData(RP, 0x05), cdj, PK, true);
        vm.expectRevert(PasskeyAuth.BadClientData.selector);
        h.verify(a, CH, x, y);
    }

    function test_malformed_unterminatedOrigin() public {
        string memory cdj =
            string.concat('{"type":"webauthn.get","challenge":"', PasskeyAuth.b64url(CH), '","origin":"', ORIGIN);
        PasskeyAuth.Assertion memory a = _sign(_authData(RP, 0x05), cdj, PK, true);
        vm.expectRevert(PasskeyAuth.BadClientData.selector);
        h.verify(a, CH, x, y);
    }

    function test_shortAuthData() public {
        bytes memory ad = new bytes(36);
        PasskeyAuth.Assertion memory a = _sign(ad, _cdj("webauthn.get", CH, ORIGIN), PK, true);
        vm.expectRevert(PasskeyAuth.BadAuthData.selector);
        h.verify(a, CH, x, y);
    }
}
