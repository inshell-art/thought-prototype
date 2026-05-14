// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ThoughtSpecRegistry} from "../src/ThoughtSpecRegistry.sol";
import {ColorFontV1, ColorFontV1Data} from "../src/ColorFontV1.sol";
import {ThoughtNFT} from "../src/ThoughtNFT.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
    function expectRevert(bytes calldata revertData) external;
    function prank(address msgSender) external;
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
}

contract MockPathNFT {
    bytes32 public constant MOVEMENT_THOUGHT = bytes32("THOUGHT");
    bytes32 private constant _CONSUME_AUTHORIZATION_TYPEHASH = keccak256(
        "ConsumeAuthorization(address pathNft,uint256 chainId,uint256 pathId,bytes32 movement,address claimer,address executor,uint256 nonce,uint256 deadline)"
    );

    address public authorizedMinter;

    mapping(uint256 pathId => address owner) public ownerOf;
    mapping(address claimer => uint256 nonce) public getConsumeNonce;
    mapping(uint256 pathId => bool consumed) public thoughtConsumed;

    function setAuthorizedMinter(address minter) external {
        authorizedMinter = minter;
    }

    function mintPath(address owner, uint256 pathId) external {
        ownerOf[pathId] = owner;
    }

    function consumeUnit(uint256 pathId, bytes32 movement, address claimer, uint256 deadline, bytes calldata signature)
        external
        returns (uint32 serial)
    {
        require(authorizedMinter != address(0) && msg.sender == authorizedMinter, "ERR_UNAUTHORIZED_MINTER");
        require(block.timestamp <= deadline, "CONSUME_AUTH_EXPIRED");
        require(ownerOf[pathId] != address(0), "ERC721: invalid token ID");
        require(movement == MOVEMENT_THOUGHT, "BAD_MOVEMENT");
        require(ownerOf[pathId] == claimer, "ERR_NOT_OWNER");
        require(!thoughtConsumed[pathId], "QUOTA_EXHAUSTED");

        uint256 nonce = getConsumeNonce[claimer];
        bytes32 structHash = keccak256(
            abi.encode(
                _CONSUME_AUTHORIZATION_TYPEHASH,
                address(this),
                uint256(block.chainid),
                pathId,
                movement,
                claimer,
                msg.sender,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash));
        require(_recover(digest, signature) == claimer, "BAD_CONSUME_AUTH");

        thoughtConsumed[pathId] = true;
        getConsumeNonce[claimer] = nonce + 1;
        return 0;
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) {
            return address(0);
        }

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) {
            v += 27;
        }

        return ecrecover(digest, v, r, s);
    }
}

contract FakeColorFontV1 {
    string private _id;
    string private _version;
    bytes32 private _hash;

    constructor(string memory id_, string memory version_, bytes32 hash_) {
        _id = id_;
        _version = version_;
        _hash = hash_;
    }

    function id() external view returns (string memory) {
        return _id;
    }

    function version() external view returns (string memory) {
        return _version;
    }

    function hash() external view returns (bytes32) {
        return _hash;
    }
}

contract ThoughtNFTTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant USER_KEY = 0xA11CE;
    uint256 private constant OTHER_KEY = 0xB0B;
    string private constant DEFAULT_PROVENANCE = '{"schema":"thought.provenance.v1","route":"local"}';
    bytes32 private constant DEFAULT_SPEC_ID = keccak256("THOUGHT.v1.md");
    bytes32 private constant DEFAULT_SPEC_HASH = keccak256("THOUGHT.md fixture");
    string private constant DEFAULT_SPEC_REF = "THOUGHT.v1.md";
    string private constant DEFAULT_SPEC_TEXT = "THOUGHT.md fixture";
    string private constant DEFAULT_SPEC_NAME = "THOUGHT.v1.md";
    bytes32 private constant DEFAULT_PROMPT_HASH = keccak256("why we are here?");
    bytes32 private constant CONSUME_AUTHORIZATION_TYPEHASH = keccak256(
        "ConsumeAuthorization(address pathNft,uint256 chainId,uint256 pathId,bytes32 movement,address claimer,address executor,uint256 nonce,uint256 deadline)"
    );

    event ThoughtMinted(
        uint256 indexed tokenId,
        address indexed minter,
        uint256 indexed pathId,
        bytes32 textHash,
        bytes32 provenanceHash,
        bytes32 thoughtSpecId,
        bytes32 thoughtSpecHash,
        uint64 mintedAt
    );

    MockPathNFT private path;
    ColorFontV1 private colorFont;
    ThoughtSpecRegistry private registry;
    ThoughtNFT private token;
    address private user;

    function setUp() public {
        user = vm.addr(USER_KEY);
        path = new MockPathNFT();
        colorFont = new ColorFontV1();
        registry = new ThoughtSpecRegistry();
        (bytes32 specId, bytes32 specHash,) =
            registry.registerThoughtSpec(DEFAULT_SPEC_NAME, DEFAULT_SPEC_REF, bytes(DEFAULT_SPEC_TEXT));
        require(specId == DEFAULT_SPEC_ID, "fixture spec id mismatch");
        require(specHash == DEFAULT_SPEC_HASH, "fixture spec hash mismatch");
        token = new ThoughtNFT(address(path), address(registry), address(colorFont));
        path.setAuthorizedMinter(address(token));
        for (uint256 pathId = 1; pathId <= 32; pathId++) {
            path.mintPath(user, pathId);
        }
    }

    function testDefaultThoughtSpecIsRegistered() public view {
        (
            bool exists,
            string memory specName,
            bytes32 hash,
            string memory ref,
            address pointer,
            uint32 byteLength,
            uint64 registeredAt
        ) = registry.thoughtSpecMeta(DEFAULT_SPEC_ID);

        require(exists, "spec should exist");
        require(_equal(specName, DEFAULT_SPEC_NAME), "spec name mismatch");
        require(hash == DEFAULT_SPEC_HASH, "spec hash mismatch");
        require(_equal(ref, DEFAULT_SPEC_REF), "spec ref mismatch");
        require(pointer != address(0), "spec pointer missing");
        require(byteLength == bytes(DEFAULT_SPEC_TEXT).length, "spec byte length mismatch");
        require(registeredAt == uint64(block.timestamp), "spec registeredAt mismatch");
        require(registry.thoughtSpecIdOfName(DEFAULT_SPEC_NAME) == DEFAULT_SPEC_ID, "spec id helper mismatch");
        require(registry.thoughtSpecExists(DEFAULT_SPEC_ID), "spec exists helper mismatch");
        require(registry.isRegisteredThoughtSpec(DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH), "pair should be registered");
        require(!registry.isRegisteredThoughtSpec(DEFAULT_SPEC_ID, bytes32(uint256(1))), "wrong hash should fail");
        require(registry.validateThoughtSpec(DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH), "spec validation failed");
        require(_equal(registry.thoughtSpecText(DEFAULT_SPEC_ID), DEFAULT_SPEC_TEXT), "spec text mismatch");
        require(_bytesEqual(registry.thoughtSpecBytes(DEFAULT_SPEC_ID), bytes(DEFAULT_SPEC_TEXT)), "spec bytes mismatch");
        require(registry.thoughtSpecCount() == 1, "spec count mismatch");
        require(registry.thoughtSpecIdAt(0) == DEFAULT_SPEC_ID, "spec index mismatch");
        require(registry.latestThoughtSpecId() == DEFAULT_SPEC_ID, "latest helper mismatch");
        require(token.thoughtSpecRegistry() == address(registry), "token registry mismatch");
    }

    function testConstructorPinsDependenciesAndRejectsInvalidTargets() public {
        require(token.pathNft() == address(path), "path dependency mismatch");
        require(token.thoughtSpecRegistry() == address(registry), "registry dependency mismatch");
        require(token.colorFont() == address(colorFont), "color font dependency mismatch");

        vm.expectRevert(abi.encodeWithSelector(ThoughtNFT.InvalidPathNft.selector));
        new ThoughtNFT(address(0), address(registry), address(colorFont));

        vm.expectRevert(abi.encodeWithSelector(ThoughtNFT.InvalidPathNft.selector));
        new ThoughtNFT(address(0x1234), address(registry), address(colorFont));

        vm.expectRevert(abi.encodeWithSelector(ThoughtNFT.InvalidThoughtSpecRegistry.selector));
        new ThoughtNFT(address(path), address(0), address(colorFont));

        vm.expectRevert(abi.encodeWithSelector(ThoughtNFT.InvalidThoughtSpecRegistry.selector));
        new ThoughtNFT(address(path), address(0x1234), address(colorFont));

        vm.expectRevert(abi.encodeWithSelector(ThoughtNFT.InvalidColorFont.selector));
        new ThoughtNFT(address(path), address(registry), address(0));

        vm.expectRevert(abi.encodeWithSelector(ThoughtNFT.InvalidColorFont.selector));
        new ThoughtNFT(address(path), address(registry), address(0x1234));

        vm.expectRevert(abi.encodeWithSelector(ThoughtNFT.InvalidColorFont.selector));
        new ThoughtNFT(address(path), address(registry), address(registry));

        FakeColorFontV1 wrongColorFontId = new FakeColorFontV1("thought.colorfont.v1", "v1", ColorFontV1Data.hash());
        FakeColorFontV1 wrongColorFontVersion = new FakeColorFontV1(ColorFontV1Data.id(), "v2", ColorFontV1Data.hash());
        FakeColorFontV1 wrongColorFontHash =
            new FakeColorFontV1(ColorFontV1Data.id(), ColorFontV1Data.version(), bytes32(0));

        vm.expectRevert(abi.encodeWithSelector(ThoughtNFT.InvalidColorFont.selector));
        new ThoughtNFT(address(path), address(registry), address(wrongColorFontId));

        vm.expectRevert(abi.encodeWithSelector(ThoughtNFT.InvalidColorFont.selector));
        new ThoughtNFT(address(path), address(registry), address(wrongColorFontVersion));

        vm.expectRevert(abi.encodeWithSelector(ThoughtNFT.InvalidColorFont.selector));
        new ThoughtNFT(address(path), address(registry), address(wrongColorFontHash));
    }

    function testSupportsMarketplaceMetadataInterfaces() public view {
        require(token.supportsInterface(0x01ffc9a7), "missing ERC165");
        require(token.supportsInterface(0x80ac58cd), "missing ERC721");
        require(token.supportsInterface(0x5b5e139f), "missing ERC721 metadata");
        require(!token.supportsInterface(0xffffffff), "invalid interface should be false");
    }

    function testRegisterSameThoughtSpecNameReverts() public {
        (bool ok,) = address(registry)
            .call(
                abi.encodeWithSelector(
                    registry.registerThoughtSpec.selector, DEFAULT_SPEC_NAME, DEFAULT_SPEC_REF, bytes(DEFAULT_SPEC_TEXT)
                )
            );
        require(!ok, "duplicate spec id should fail");
    }

    function testRegisterSpecAndReadExactBytesBack() public {
        string memory specName = "THOUGHT.v2.md";
        bytes32 specId = keccak256(bytes(specName));
        bytes memory specBytes = bytes("THOUGHT.md v2\nnew procedure");
        (bytes32 returnedId, bytes32 returnedHash, address pointer) =
            registry.registerThoughtSpec(specName, "THOUGHT.md@v2", specBytes);

        (bool exists, string memory returnedName, bytes32 hash, string memory ref, address metaPointer, uint32 byteLength,) =
            registry.thoughtSpecMeta(specId);
        require(exists, "new spec should exist");
        require(returnedId == specId, "new spec id mismatch");
        require(returnedHash == keccak256(specBytes), "new spec returned hash mismatch");
        require(_equal(returnedName, specName), "new spec name mismatch");
        require(hash == keccak256(specBytes), "new spec hash mismatch");
        require(_equal(ref, "THOUGHT.md@v2"), "new spec ref mismatch");
        require(pointer != address(0), "new spec pointer missing");
        require(metaPointer == pointer, "new spec meta pointer mismatch");
        require(byteLength == specBytes.length, "new spec byte length mismatch");
        require(_bytesEqual(registry.thoughtSpecBytes(specId), specBytes), "new spec bytes mismatch");
        require(registry.validateThoughtSpec(specId, keccak256(specBytes)), "new spec validation failed");
    }

    function testSpecNameValidation() public view {
        require(registry.isValidThoughtSpecName("THOUGHT.v1.md"), "v1 should pass");
        require(registry.isValidThoughtSpecName("THOUGHT.v2.md"), "v2 should pass");
        require(registry.isValidThoughtSpecName("THOUGHT.v12.md"), "v12 should pass");
        require(!registry.isValidThoughtSpecName("THOUGHT.v0.md"), "v0 should fail");
        require(!registry.isValidThoughtSpecName("THOUGHT.v01.md"), "leading zero should fail");
        require(!registry.isValidThoughtSpecName("THOUGHT.md"), "old name should fail");
        require(!registry.isValidThoughtSpecName("THOUGHT.V1.md"), "case variant should fail");
        require(!registry.isValidThoughtSpecName("MY_BRAIN.v1.md"), "foreign namespace should fail");
        require(!registry.isValidThoughtSpecName("THOUGHT.v1.txt"), "wrong suffix should fail");
        require(!registry.isValidThoughtSpecName(""), "empty name should fail");
    }

    function testSpecDataValidation() public {
        vm.expectRevert(abi.encodeWithSelector(ThoughtSpecRegistry.EmptyThoughtSpec.selector));
        registry.registerThoughtSpec("THOUGHT.v2.md", "empty", "");

        bytes memory tooLarge = _bytesRepeat("S", registry.MAX_THOUGHT_SPEC_BYTES() + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                ThoughtSpecRegistry.ThoughtSpecTooLarge.selector,
                tooLarge.length,
                registry.MAX_THOUGHT_SPEC_BYTES()
            )
        );
        registry.registerThoughtSpec("THOUGHT.v2.md", "too-large", tooLarge);

        bytes memory boundary = _bytesRepeat("S", registry.MAX_THOUGHT_SPEC_BYTES());
        registry.registerThoughtSpec("THOUGHT.v2.md", "boundary", boundary);
    }

    function testGas_registerSpec_500Bytes() public {
        registry.registerThoughtSpec("THOUGHT.v2.md", "gas.spec.500", _bytesRepeat("S", 500));
    }

    function testGas_registerSpec_1KB() public {
        registry.registerThoughtSpec("THOUGHT.v2.md", "gas.spec.1kb", _bytesRepeat("S", 1024));
    }

    function testGas_registerSpec_4KB() public {
        registry.registerThoughtSpec("THOUGHT.v2.md", "gas.spec.4kb", _bytesRepeat("S", 4096));
    }

    function testGas_registerSpec_8KB() public {
        registry.registerThoughtSpec("THOUGHT.v2.md", "gas.spec.8kb", _bytesRepeat("S", 8192));
    }

    function testGas_registerSpec_16KB() public {
        registry.registerThoughtSpec("THOUGHT.v2.md", "gas.spec.16kb", _bytesRepeat("S", 16_384));
    }

    function testNormalizeThoughtKeepsReadableSingleSpaces() public view {
        string memory normalized = token.normalizeThought("hello, WORLD!!! 42");
        require(_equal(normalized, "HELLO WORLD"), "unexpected normalization");
    }

    function testTextCodecPreviewsCanonicalText() public view {
        (string memory normalized, bool valid, uint8 reasonCode) = token.previewText("hello, WORLD!!! 42");
        require(_equal(normalized, "HELLO WORLD"), "unexpected preview text");
        require(valid, "preview should be valid");
        require(reasonCode == 0, "unexpected reason");
        require(token.MAX_RAW_RETURN_BYTES() == 512, "unexpected raw return cap");
        require(token.MAX_TEXT_BYTES() == 128, "unexpected text cap");
        require(token.isCanonicalText("HELLO WORLD"), "canonical text should be valid");
        require(!token.isCanonicalText("hello"), "lowercase text is not canonical");
        require(!token.isCanonicalText("HELLO  WORLD"), "repeated spaces are not canonical");
        require(token.textHashOf("HELLO WORLD") == keccak256(bytes("HELLO WORLD")), "unexpected codec hash");
    }

    function testPreviewWorkNormalizesAndRenders() public view {
        (bool ok, string memory text, string memory svg, uint8 reasonCode) = token.previewWork("cat");
        require(ok, "preview should pass");
        require(_equal(text, "CAT"), "unexpected preview text");
        require(bytes(svg).length > 0, "missing preview svg");
        require(reasonCode == token.ERR_NONE(), "unexpected reason");
        require(_equal(svg, token.renderThoughtSvg("CAT")), "preview svg should match renderer");
    }

    function testPreviewWorkAccepts128CanonicalChars() public view {
        string memory rawReturn = _repeat("A", 128);
        (bool ok, string memory text, string memory svg, uint8 reasonCode) = token.previewWork(rawReturn);
        require(ok, "128 chars should pass");
        require(bytes(text).length == 128, "unexpected text length");
        require(bytes(svg).length > 0, "missing svg");
        require(reasonCode == token.ERR_NONE(), "unexpected reason");
    }

    function testPreviewWorkRejects129CanonicalChars() public view {
        (bool ok, string memory text, string memory svg, uint8 reasonCode) = token.previewWork(_repeat("A", 129));
        require(!ok, "129 chars should fail");
        require(bytes(text).length == 129, "should return normalized text");
        require(bytes(svg).length == 0, "failed preview should not render");
        require(reasonCode == token.ERR_TEXT_TOO_LONG(), "unexpected reason");
    }

    function testPreviewWorkRejectsOversizeRawReturn() public view {
        (bool ok, string memory text, string memory svg, uint8 reasonCode) =
            token.previewWork(_repeat("A", token.MAX_RAW_RETURN_BYTES() + 1));
        require(!ok, "oversize raw return should fail");
        require(bytes(text).length == 0, "oversize raw return should not normalize");
        require(bytes(svg).length == 0, "oversize raw return should not render");
        require(reasonCode == token.ERR_RAW_RETURN_TOO_LONG(), "unexpected reason");
    }

    function testColorFontAbiExposesCanonicalData() public view {
        string memory data = token.colorFontData();
        bytes memory dataBytes = bytes(data);

        require(_equal(token.colorFontId(), "inshell.colorfont.v1"), "unexpected color font id");
        require(_equal(token.colorFontVersion(), "v1"), "unexpected color font version");
        require(token.colorFontLength() == 26, "unexpected color font length");
        require(_equal(data, _canonicalColorFontData()), "unexpected color font data");
        require(_lineCount(data) == 26, "color font should have 26 lines");
        require(dataBytes.length > 0 && dataBytes[dataBytes.length - 1] != 0x0a, "trailing blank line");
        require(token.colorFontHash() == keccak256(bytes(data)), "color font hash mismatch");
        require(_equal(colorFont.id(), token.colorFontId()), "standalone id mismatch");
        require(_equal(colorFont.version(), token.colorFontVersion()), "standalone version mismatch");
        require(colorFont.length() == token.colorFontLength(), "standalone length mismatch");
        require(_equal(colorFont.data(), token.colorFontData()), "standalone data mismatch");
        require(colorFont.hash() == token.colorFontHash(), "standalone hash mismatch");
    }

    function testColorFontGlyphs() public view {
        (string memory firstLetter, uint8 firstOrdinal, string memory firstAlias, string memory firstHex) =
            token.colorFontGlyph(1);
        require(_equal(firstLetter, "A"), "first letter mismatch");
        require(firstOrdinal == 1, "first ordinal mismatch");
        require(_equal(firstAlias, "aqua"), "first alias mismatch");
        require(_equal(firstHex, "#00ffff"), "first hex mismatch");

        (string memory lastLetter, uint8 lastOrdinal, string memory lastAlias, string memory lastHex) =
            token.colorFontGlyph(26);
        require(_equal(lastLetter, "Z"), "last letter mismatch");
        require(lastOrdinal == 26, "last ordinal mismatch");
        require(_equal(lastAlias, "zombie gray"), "last alias mismatch");
        require(_equal(lastHex, "#778877"), "last hex mismatch");

        (uint8 aOrdinal, string memory aAlias, string memory aHex) = token.colorFontGlyphOf("A");
        require(aOrdinal == 1, "A ordinal mismatch");
        require(_equal(aAlias, "aqua"), "A alias mismatch");
        require(_equal(aHex, "#00ffff"), "A hex mismatch");

        (uint8 zOrdinal, string memory zAlias, string memory zHex) = token.colorFontGlyphOf("Z");
        require(zOrdinal == 26, "Z ordinal mismatch");
        require(_equal(zAlias, "zombie gray"), "Z alias mismatch");
        require(_equal(zHex, "#778877"), "Z hex mismatch");
    }

    function testColorFontInvalidInputsRevert() public {
        vm.expectRevert(abi.encodeWithSelector(ColorFontV1Data.InvalidColorFontIndex.selector));
        token.colorFontGlyph(0);

        vm.expectRevert(abi.encodeWithSelector(ColorFontV1Data.InvalidColorFontIndex.selector));
        token.colorFontGlyph(27);

        vm.expectRevert(abi.encodeWithSelector(ColorFontV1Data.InvalidColorFontLetter.selector));
        token.colorFontGlyphOf("a");
    }

    function testMintRejectsNonCanonicalText() public {
        ConsumeAuth memory auth = _signConsume(1, USER_KEY);
        vm.prank(user);
        (bool ok,) = address(token)
            .call(
                abi.encodeWithSelector(
                    token.mint.selector,
                    "hello",
                    1,
                    DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH,
                    DEFAULT_PROMPT_HASH,
                    DEFAULT_PROVENANCE,
                    auth.deadline,
                    auth.signature
                )
            );
        require(!ok, "mint should reject noncanonical text");
        require(!path.thoughtConsumed(1), "noncanonical text should not consume path");
    }

    function testMintStoresRawTextProvenanceAndOwnership() public {
        string memory text = "HELLOWORLD";
        string memory storedText = "HELLOWORLD";
        string memory provenance = '{"schema":"thought.provenance.v1","route":"local"}';
        uint256 tokenId = _mintAsUserWithProvenance(text, provenance, 1, USER_KEY);
        bytes32 textHash = keccak256(bytes(storedText));
        bytes32 provenanceHash = keccak256(bytes(provenance));

        require(tokenId == 1, "unexpected token id");
        require(token.totalSupply() == 1, "unexpected total supply");
        require(token.ownerOf(tokenId) == user, "unexpected owner");
        require(_equal(token.thoughtText(tokenId), storedText), "unexpected stored text");
        require(_equal(token.rawTextOf(tokenId), storedText), "unexpected raw text");
        require(_equal(token.provenanceOf(tokenId), provenance), "unexpected provenance");
        require(token.textHashOf(tokenId) == textHash, "unexpected text hash");
        require(token.provenanceHashOf(tokenId) == provenanceHash, "unexpected provenance hash");
        require(token.isThoughtMinted(textHash), "text should be marked minted");
        require(token.tokenOfThought(textHash) == tokenId, "unexpected text token");
        require(token.authorOf(tokenId) == user, "unexpected author");
        require(token.pathIdOf(tokenId) == 1, "unexpected path id");
        require(token.pathSerialOf(tokenId) == 0, "unexpected path serial");
        require(path.thoughtConsumed(1), "path thought was not consumed");

        (
            bytes32 recordTextHash,
            bytes32 recordPromptHash,
            bytes32 recordProvenanceHash,
            bytes32 recordSpecId,
            bytes32 recordSpecHash,
            uint256 recordPathId,
            address recordMinter,
            uint64 recordMintedAt
        ) = token.recordOf(tokenId);
        require(recordTextHash == textHash, "recordOf text hash mismatch");
        require(recordPromptHash == DEFAULT_PROMPT_HASH, "recordOf prompt hash mismatch");
        require(recordProvenanceHash == provenanceHash, "recordOf provenance hash mismatch");
        require(recordSpecId == DEFAULT_SPEC_ID, "recordOf spec mismatch");
        require(recordSpecHash == DEFAULT_SPEC_HASH, "recordOf spec hash mismatch");
        require(recordPathId == 1, "recordOf path mismatch");
        require(recordMinter == user, "recordOf minter mismatch");
        require(recordMintedAt == uint64(block.timestamp), "recordOf mintedAt mismatch");
    }

    function testRenderThoughtSvgIncludesExpectedColorsAndText() public view {
        string memory svg = token.renderThoughtSvg("WHY TAG");
        require(_contains(svg, "#f5deb3"), "missing W color");
        require(_contains(svg, "#ffcc00"), "missing H color");
        require(_contains(svg, "#ffff00"), "missing Y color");
        require(_contains(svg, "#008080"), "missing T color");
        require(_contains(svg, "<clipPath id='canvasClip'>"), "missing canvas clip");
        require(_contains(svg, "<g clip-path='url(#canvasClip)'>"), "missing clipped content group");
        require(_contains(svg, ">WHY TAG</text>"), "missing rendered text");
    }

    function testRenderThoughtSvgUsesColorFontV1ForCat() public view {
        string memory svg = token.renderThoughtSvg("CAT");
        require(_contains(svg, "#6f4e37"), "missing C color");
        require(_contains(svg, "#00ffff"), "missing A color");
        require(_contains(svg, "#008080"), "missing T color");
    }

    function testRenderThoughtSvgRejectsNonCanonicalText() public {
        vm.expectRevert(abi.encodeWithSelector(ThoughtNFT.NonCanonicalThoughtText.selector));
        token.renderThoughtSvg("cat");
    }

    function testRenderThoughtSvgIncludesCanvasClip() public view {
        string memory svg = token.renderThoughtSvg("HELLO");
        require(_contains(svg, "<clipPath id='canvasClip'>"), "missing canvas clip");
        require(_contains(svg, "<g clip-path='url(#canvasClip)'>"), "missing clipped content group");
        require(_contains(svg, ">HELLO</text>"), "missing rendered text");
    }

    function testRenderThoughtSvgUsesLargestFittingTextSize() public view {
        string memory shortSvg = token.renderThoughtSvg("HELLO");
        string memory mediumSvg = token.renderThoughtSvg(_repeat("A", 64));
        string memory longSvg = token.renderThoughtSvg(_repeat("A", 100));
        string memory maxSvg = token.renderThoughtSvg(_repeat("A", token.MAX_TEXT_BYTES()));

        require(_contains(shortSvg, "font-size='18'"), "short text should use max font");
        require(_contains(mediumSvg, "font-size='18'"), "medium text should keep max font");
        require(_contains(longSvg, "font-size='15'"), "long text should use fitted font");
        require(_contains(maxSvg, "font-size='11'"), "max text should use fitted font");
        require(_contains(maxSvg, _repeat("A", token.MAX_TEXT_BYTES())), "max text should render fully");
    }

    function testTokenUriIsMetadataJsonWithOnchainSvgImage() public {
        uint256 tokenId = _mintAsUser("HELLOWORLD", 1, USER_KEY);
        string memory uri = token.tokenURI(tokenId);
        string memory metadata = _metadataJsonFromTokenUri(uri);
        string memory svg = token.svgOf(tokenId);
        require(_contains(uri, "data:application/json;base64,"), "missing metadata data uri");
        require(_contains(metadata, '"Thought Spec ID"'), "metadata missing spec id trait");
        require(_contains(metadata, _bytes32ToHexTest(DEFAULT_SPEC_ID)), "metadata missing typed spec id");
        require(_contains(metadata, '"Thought Spec Hash"'), "metadata missing spec hash trait");
        require(_contains(metadata, _bytes32ToHexTest(DEFAULT_SPEC_HASH)), "metadata missing typed spec hash");
        require(!_contains(metadata, DEFAULT_SPEC_TEXT), "metadata should not embed full spec text");
        require(_contains(svg, "<svg"), "missing svg root");
        require(_contains(svg, ">HELLOWORLD</text>"), "missing rendered text");
        require(_equal(svg, token.renderTokenSvg(tokenId)), "svg helper mismatch");
        (, string memory previewText_, string memory previewSvg,) = token.previewWork("HELLOWORLD");
        require(_equal(previewText_, "HELLOWORLD"), "unexpected preview text");
        require(_equal(svg, previewSvg), "token svg should match preview svg");
    }

    function testMintRejectsEthValue() public {
        ConsumeAuth memory auth = _signConsume(1, USER_KEY);
        vm.prank(user);
        (bool ok,) = address(token).call{value: 1}(
            abi.encodeWithSelector(
                token.mint.selector,
                "HELLO",
                1,
                DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH,
                DEFAULT_PROMPT_HASH,
                DEFAULT_PROVENANCE,
                auth.deadline,
                auth.signature
            )
        );
        require(!ok, "mint should reject ETH value");
        require(!path.thoughtConsumed(1), "path should not be consumed by payable mismatch");
    }

    function testMintRequiresPathAuthorization() public {
        path.setAuthorizedMinter(address(0xCAFE));
        string memory text = "HELLO";
        bytes32 textHash = keccak256(bytes(text));
        ConsumeAuth memory auth = _signConsume(1, USER_KEY);
        vm.prank(user);
        (bool ok,) = address(token)
            .call(
                abi.encodeWithSelector(
                    token.mint.selector,
                    text,
                    1,
                    DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH,
                    DEFAULT_PROMPT_HASH,
                    DEFAULT_PROVENANCE,
                    auth.deadline,
                    auth.signature
                )
            );
        require(!ok, "mint should fail without path movement authorization");
        require(token.totalSupply() == 0, "thought should not mint after failed consume");
        require(!token.isThoughtMinted(textHash), "failed consume should not reserve text");
    }

    function testMintRequiresSignedPathConsumeAuth() public {
        ConsumeAuth memory auth = _signConsume(1, OTHER_KEY);
        vm.prank(user);
        (bool ok,) = address(token)
            .call(
                abi.encodeWithSelector(
                    token.mint.selector,
                    "HELLO",
                    1,
                    DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH,
                    DEFAULT_PROMPT_HASH,
                    DEFAULT_PROVENANCE,
                    auth.deadline,
                    auth.signature
                )
            );
        require(!ok, "mint should fail with bad consume signature");
        require(token.totalSupply() == 0, "thought should not mint after bad signature");
    }

    function testPathThoughtQuotaIsOne() public {
        _mintAsUser("FIRST", 1, USER_KEY);

        ConsumeAuth memory auth = _signConsume(1, USER_KEY);
        vm.prank(user);
        (bool ok,) = address(token)
            .call(
                abi.encodeWithSelector(
                    token.mint.selector,
                    "SECOND",
                    1,
                    DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH,
                    DEFAULT_PROMPT_HASH,
                    DEFAULT_PROVENANCE,
                    auth.deadline,
                    auth.signature
                )
            );
        require(!ok, "second thought from same path should fail");
        require(token.totalSupply() == 1, "quota failure should not mint");
    }

    function testDuplicateCanonicalTextRevertsEvenWithDifferentProvenance() public {
        string memory text = "HELLO";
        _mintAsUserWithProvenance("HELLO", '{"schema":"thought.provenance.v1","run":"a"}', 1, USER_KEY);
        bytes32 textHash = keccak256(bytes(text));
        require(token.isThoughtMinted(textHash), "canonical text should be marked minted");
        require(_equal(token.thoughtText(1), text), "stored text should be canonical");

        ConsumeAuth memory auth = _signConsume(2, USER_KEY);
        vm.prank(user);
        (bool ok,) = address(token)
            .call(
                abi.encodeWithSelector(
                    token.mint.selector,
                    "HELLO",
                    2,
                    DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH,
                    DEFAULT_PROMPT_HASH,
                    '{"schema":"thought.provenance.v1","run":"b"}',
                    auth.deadline,
                    auth.signature
                )
            );
        require(!ok, "duplicate canonical text should fail");
        require(token.totalSupply() == 1, "duplicate should not mint");
        require(!path.thoughtConsumed(2), "duplicate should not consume path");
    }

    function testSameProvenanceWithDifferentCanonicalTextIsAllowed() public {
        string memory provenance = '{"schema":"thought.provenance.v1","run":"same"}';
        uint256 firstTokenId = _mintAsUserWithProvenance("HELLO", provenance, 1, USER_KEY);
        uint256 secondTokenId = _mintAsUserWithProvenance("WORLD", provenance, 2, USER_KEY);

        require(firstTokenId == 1, "unexpected first token");
        require(secondTokenId == 2, "unexpected second token");
        require(
            token.provenanceHashOf(firstTokenId) == token.provenanceHashOf(secondTokenId), "provenance hashes differ"
        );
    }

    function testDifferentEnglishLettersAreDifferentTexts() public {
        _mintAsUser("HELLO", 1, USER_KEY);
        _mintAsUser("HELLOO", 2, USER_KEY);
        _mintAsUser("HELLOWORLD", 3, USER_KEY);

        require(token.totalSupply() == 3, "distinct stored titles should mint");
    }

    function testEmptyRawTextReverts() public {
        ConsumeAuth memory auth = _signConsume(1, USER_KEY);
        vm.prank(user);
        (bool ok,) = address(token)
            .call(
                abi.encodeWithSelector(
                    token.mint.selector,
                    "",
                    1,
                    DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH,
                    DEFAULT_PROMPT_HASH,
                    DEFAULT_PROVENANCE,
                    auth.deadline,
                    auth.signature
                )
            );
        require(!ok, "empty raw text should fail");
        require(!path.thoughtConsumed(1), "empty text should not consume path");

        ConsumeAuth memory whitespaceAuth = _signConsume(2, USER_KEY);
        vm.prank(user);
        (bool whitespaceOk,) = address(token)
            .call(
                abi.encodeWithSelector(
                    token.mint.selector,
                    " \n\t ",
                    2,
                    DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH,
                    DEFAULT_PROMPT_HASH,
                    DEFAULT_PROVENANCE,
                    whitespaceAuth.deadline,
                    whitespaceAuth.signature
                )
            );
        require(!whitespaceOk, "whitespace-only raw text should fail");
        require(!path.thoughtConsumed(2), "whitespace-only text should not consume path");

        ConsumeAuth memory numberAuth = _signConsume(3, USER_KEY);
        vm.prank(user);
        (bool numberOk,) = address(token)
            .call(
                abi.encodeWithSelector(
                    token.mint.selector,
                    "12345!!!",
                    3,
                    DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH,
                    DEFAULT_PROMPT_HASH,
                    DEFAULT_PROVENANCE,
                    numberAuth.deadline,
                    numberAuth.signature
                )
            );
        require(!numberOk, "number-only raw text should fail");
        require(!path.thoughtConsumed(3), "number-only text should not consume path");
    }

    function testEmptyProvenanceReverts() public {
        ConsumeAuth memory auth = _signConsume(1, USER_KEY);
        vm.prank(user);
        (bool ok,) = address(token)
            .call(
                abi.encodeWithSelector(
                    token.mint.selector,
                    "HELLO",
                    1,
                    DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH,
                    DEFAULT_PROMPT_HASH,
                    "",
                    auth.deadline,
                    auth.signature
                )
            );
        require(!ok, "empty provenance should fail");
        require(!path.thoughtConsumed(1), "empty provenance should not consume path");
    }

    function testUnknownThoughtSpecReverts() public {
        bytes32 unknownSpecId = keccak256("thought.md.unknown");
        ConsumeAuth memory auth = _signConsume(1, USER_KEY);
        vm.prank(user);
        (bool ok,) = address(token)
            .call(
                abi.encodeWithSelector(
                    token.mint.selector,
                    "HELLO",
                    1,
                    unknownSpecId,
                    DEFAULT_SPEC_HASH,
                    DEFAULT_PROMPT_HASH,
                    DEFAULT_PROVENANCE,
                    auth.deadline,
                    auth.signature
                )
            );
        require(!ok, "unknown spec should fail");
        require(!path.thoughtConsumed(1), "unknown spec should not consume path");
    }

    function testWrongAndZeroThoughtSpecPairsRevert() public {
        ConsumeAuth memory wrongHashAuth = _signConsume(1, USER_KEY);
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                ThoughtNFT.InvalidThoughtSpecPair.selector, DEFAULT_SPEC_ID, bytes32(uint256(0xBEEF))
            )
        );
        token.mint(
            "HELLO",
            1,
            DEFAULT_SPEC_ID,
            bytes32(uint256(0xBEEF)),
            DEFAULT_PROMPT_HASH,
            DEFAULT_PROVENANCE,
            wrongHashAuth.deadline,
            wrongHashAuth.signature
        );
        require(!path.thoughtConsumed(1), "wrong spec hash should not consume path");

        ConsumeAuth memory zeroIdAuth = _signConsume(2, USER_KEY);
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(ThoughtNFT.InvalidThoughtSpecPair.selector, bytes32(0), DEFAULT_SPEC_HASH)
        );
        token.mint(
            "WORLD",
            2,
            bytes32(0),
            DEFAULT_SPEC_HASH,
            DEFAULT_PROMPT_HASH,
            DEFAULT_PROVENANCE,
            zeroIdAuth.deadline,
            zeroIdAuth.signature
        );
        require(!path.thoughtConsumed(2), "zero spec id should not consume path");

        ConsumeAuth memory zeroHashAuth = _signConsume(3, USER_KEY);
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(ThoughtNFT.InvalidThoughtSpecPair.selector, DEFAULT_SPEC_ID, bytes32(0))
        );
        token.mint(
            "THIRD",
            3,
            DEFAULT_SPEC_ID,
            bytes32(0),
            DEFAULT_PROMPT_HASH,
            DEFAULT_PROVENANCE,
            zeroHashAuth.deadline,
            zeroHashAuth.signature
        );
        require(!path.thoughtConsumed(3), "zero spec hash should not consume path");
    }

    function testOlderAndNewerRegisteredSpecsCanBothMint() public {
        bytes memory v2Bytes = bytes("THOUGHT.md fixture v2");
        (bytes32 v2SpecId, bytes32 v2SpecHash,) =
            registry.registerThoughtSpec("THOUGHT.v2.md", "THOUGHT.v2.md", v2Bytes);

        uint256 olderTokenId = _mintAsUserWithSpec("OLDER", 1, USER_KEY, DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH);
        uint256 newerTokenId = _mintAsUserWithSpec("NEWER", 2, USER_KEY, v2SpecId, v2SpecHash);

        (,,, bytes32 olderSpecId, bytes32 olderSpecHash,,,) = token.recordOf(olderTokenId);
        (,,, bytes32 newerSpecId, bytes32 newerSpecHash,,,) = token.recordOf(newerTokenId);
        require(olderSpecId == DEFAULT_SPEC_ID, "older spec id mismatch");
        require(olderSpecHash == DEFAULT_SPEC_HASH, "older spec hash mismatch");
        require(newerSpecId == v2SpecId, "newer spec id mismatch");
        require(newerSpecHash == v2SpecHash, "newer spec hash mismatch");

        (bytes32 resolvedId, bytes32 resolvedHash, string memory resolvedName, string memory resolvedRef) =
            token.thoughtSpecOf(newerTokenId);
        require(resolvedId == v2SpecId, "resolved spec id mismatch");
        require(resolvedHash == v2SpecHash, "resolved spec hash mismatch");
        require(_equal(resolvedName, "THOUGHT.v2.md"), "resolved spec name mismatch");
        require(_equal(resolvedRef, "THOUGHT.v2.md"), "resolved spec ref mismatch");
    }

    function testTypedSpecStateWinsOverProvenanceJson() public {
        string memory conflictingProvenance =
            '{"schema":"thought.provenance.v1","thoughtSpecId":"0xdead","thoughtSpecHash":"0xbeef"}';
        uint256 tokenId = _mintAsUserWithProvenance("TYPED", conflictingProvenance, 1, USER_KEY);

        (,,, bytes32 recordSpecId, bytes32 recordSpecHash,,,) = token.recordOf(tokenId);
        (bytes32 resolvedSpecId, bytes32 resolvedSpecHash, string memory resolvedName,) = token.thoughtSpecOf(tokenId);
        require(recordSpecId == DEFAULT_SPEC_ID, "record spec id should be typed state");
        require(recordSpecHash == DEFAULT_SPEC_HASH, "record spec hash should be typed state");
        require(resolvedSpecId == DEFAULT_SPEC_ID, "resolved spec id should be typed state");
        require(resolvedSpecHash == DEFAULT_SPEC_HASH, "resolved spec hash should be typed state");
        require(_equal(resolvedName, DEFAULT_SPEC_NAME), "resolved spec name mismatch");

        string memory uri = token.tokenURI(tokenId);
        require(!_contains(uri, "proof of model generation"), "metadata uses proof language");
        require(!_contains(uri, "verified AI output"), "metadata uses verification language");
    }

    function testOversizeTextReverts() public {
        string memory text = _repeat("A", token.MAX_TEXT_BYTES() + 1);
        ConsumeAuth memory auth = _signConsume(1, USER_KEY);
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(ThoughtNFT.ThoughtTextTooLarge.selector, bytes(text).length, token.MAX_TEXT_BYTES())
        );
        token.mint(text, 1, DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH, DEFAULT_PROMPT_HASH, DEFAULT_PROVENANCE, auth.deadline, auth.signature);
        require(!path.thoughtConsumed(1), "oversize text should not consume path");
    }

    function testOversizeProvenanceReverts() public {
        string memory provenance = _repeat("P", token.MAX_PROVENANCE_BYTES() + 1);
        ConsumeAuth memory auth = _signConsume(1, USER_KEY);
        vm.prank(user);
        (bool ok,) = address(token)
            .call(
                abi.encodeWithSelector(
                    token.mint.selector,
                    "HELLO",
                    1,
                    DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH,
                    DEFAULT_PROMPT_HASH,
                    provenance,
                    auth.deadline,
                    auth.signature
                )
            );
        require(!ok, "oversize provenance should fail");
        require(!path.thoughtConsumed(1), "oversize provenance should not consume path");
    }

    function testGas_mint_provenance_512b() public {
        _mintAsUserWithProvenance("GASFIVEONETWO", _repeat("P", 512), 1, USER_KEY);
    }

    function testGas_mint_provenance_700b() public {
        _mintAsUserWithProvenance("GASSEVENHUNDRED", _repeat("P", 700), 1, USER_KEY);
    }

    function testGas_mint_provenance_900b() public {
        _mintAsUserWithProvenance("GASNINEHUNDRED", _repeat("P", 900), 1, USER_KEY);
    }

    function testGas_mint_provenance_2048b() public {
        _mintAsUserWithProvenance("GASTWENTYFORTYEIGHT", _repeat("P", 2048), 1, USER_KEY);
    }

    function testGas_revert_provenance_2049b() public {
        _assertOversizeProvenanceReverts(_repeat("P", 2049), 1);
    }

    function testMintEventIncludesProvenanceFields() public {
        string memory text = "HELLO";
        string memory storedText = "HELLO";
        string memory provenance = '{"schema":"thought.provenance.v1","event":"yes"}';
        bytes32 textHash = keccak256(bytes(storedText));
        bytes32 provenanceHash = keccak256(bytes(provenance));

        vm.expectEmit(true, true, true, true);
        emit ThoughtMinted(
            1, user, 1, textHash, provenanceHash, DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH, uint64(block.timestamp)
        );

        _mintAsUserWithProvenance(text, provenance, 1, USER_KEY);
    }

    struct ConsumeAuth {
        uint256 deadline;
        bytes signature;
    }

    function _mintAsUser(string memory text, uint256 pathId, uint256 privateKey) private returns (uint256 tokenId) {
        return _mintAsUserWithProvenance(text, DEFAULT_PROVENANCE, pathId, privateKey);
    }

    function _mintAsUserWithProvenance(string memory text, string memory provenance, uint256 pathId, uint256 privateKey)
        private
        returns (uint256 tokenId)
    {
        ConsumeAuth memory auth = _signConsume(pathId, privateKey);
        vm.prank(user);
        return token.mint(text, pathId, DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH, DEFAULT_PROMPT_HASH, provenance, auth.deadline, auth.signature);
    }

    function _mintAsUserWithSpec(
        string memory text,
        uint256 pathId,
        uint256 privateKey,
        bytes32 specId,
        bytes32 specHash
    ) private returns (uint256 tokenId) {
        ConsumeAuth memory auth = _signConsume(pathId, privateKey);
        vm.prank(user);
        return token.mint(text, pathId, specId, specHash, DEFAULT_PROMPT_HASH, DEFAULT_PROVENANCE, auth.deadline, auth.signature);
    }

    function _signConsume(uint256 pathId, uint256 privateKey) private returns (ConsumeAuth memory auth) {
        address claimer = vm.addr(privateKey);
        auth.deadline = block.timestamp + 1 hours;
        uint256 nonce = path.getConsumeNonce(claimer);
        bytes32 structHash = keccak256(
            abi.encode(
                CONSUME_AUTHORIZATION_TYPEHASH,
                address(path),
                uint256(block.chainid),
                pathId,
                token.PATH_MOVEMENT_THOUGHT(),
                claimer,
                address(token),
                nonce,
                auth.deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        auth.signature = abi.encodePacked(r, s, v);
    }

    function _assertOversizeProvenanceReverts(string memory provenance, uint256 pathId) private {
        ConsumeAuth memory auth = _signConsume(pathId, USER_KEY);
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                ThoughtNFT.ProvenanceTooLarge.selector, bytes(provenance).length, token.MAX_PROVENANCE_BYTES()
            )
        );
        token.mint("OVERSIZE", pathId, DEFAULT_SPEC_ID, DEFAULT_SPEC_HASH, DEFAULT_PROMPT_HASH, provenance, auth.deadline, auth.signature);
        require(!path.thoughtConsumed(pathId), "oversize provenance should not consume path");
    }

    function _bytes32ToHexTest(bytes32 value) private pure returns (string memory) {
        bytes16 hexDigits = "0123456789abcdef";
        bytes memory output = new bytes(66);
        output[0] = "0";
        output[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            uint8 charCode = uint8(value[i]);
            output[2 + i * 2] = hexDigits[charCode >> 4];
            output[3 + i * 2] = hexDigits[charCode & 0x0f];
        }
        return string(output);
    }

    function _metadataJsonFromTokenUri(string memory uri) private pure returns (string memory) {
        bytes memory source = bytes(uri);
        bytes memory prefix = bytes("data:application/json;base64,");
        require(source.length > prefix.length, "token uri too short");
        for (uint256 i = 0; i < prefix.length; i++) {
            require(source[i] == prefix[i], "token uri prefix mismatch");
        }

        bytes memory encoded = new bytes(source.length - prefix.length);
        for (uint256 i = 0; i < encoded.length; i++) {
            encoded[i] = source[prefix.length + i];
        }
        return string(_base64Decode(encoded));
    }

    function _base64Decode(bytes memory data) private pure returns (bytes memory) {
        require(data.length % 4 == 0, "bad base64 length");
        uint256 padding = 0;
        if (data.length > 0 && data[data.length - 1] == bytes1("=")) {
            padding++;
        }
        if (data.length > 1 && data[data.length - 2] == bytes1("=")) {
            padding++;
        }

        bytes memory output = new bytes((data.length / 4) * 3 - padding);
        uint256 out = 0;
        for (uint256 i = 0; i < data.length; i += 4) {
            uint24 chunk = (uint24(_base64Value(data[i])) << 18) | (uint24(_base64Value(data[i + 1])) << 12)
                | (uint24(_base64Value(data[i + 2])) << 6) | uint24(_base64Value(data[i + 3]));
            if (out < output.length) {
                output[out++] = bytes1(uint8(chunk >> 16));
            }
            if (out < output.length) {
                output[out++] = bytes1(uint8(chunk >> 8));
            }
            if (out < output.length) {
                output[out++] = bytes1(uint8(chunk));
            }
        }
        return output;
    }

    function _base64Value(bytes1 char_) private pure returns (uint8) {
        uint8 code = uint8(char_);
        if (code >= 65 && code <= 90) {
            return code - 65;
        }
        if (code >= 97 && code <= 122) {
            return code - 71;
        }
        if (code >= 48 && code <= 57) {
            return code + 4;
        }
        if (char_ == bytes1("+")) {
            return 62;
        }
        if (char_ == bytes1("/")) {
            return 63;
        }
        if (char_ == bytes1("=")) {
            return 0;
        }
        revert("bad base64 char");
    }

    function _contains(string memory haystack, string memory needle) private pure returns (bool) {
        bytes memory source = bytes(haystack);
        bytes memory target = bytes(needle);

        if (target.length == 0 || target.length > source.length) {
            return false;
        }

        for (uint256 i = 0; i <= source.length - target.length; i++) {
            bool match_ = true;
            for (uint256 j = 0; j < target.length; j++) {
                if (source[i + j] != target[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) {
                return true;
            }
        }

        return false;
    }

    function _equal(string memory left, string memory right) private pure returns (bool) {
        return keccak256(bytes(left)) == keccak256(bytes(right));
    }

    function _bytesEqual(bytes memory left, bytes memory right) private pure returns (bool) {
        return keccak256(left) == keccak256(right);
    }

    function _lineCount(string memory value) private pure returns (uint256 count) {
        bytes memory valueBytes = bytes(value);
        if (valueBytes.length == 0) {
            return 0;
        }

        count = 1;
        for (uint256 i = 0; i < valueBytes.length; i++) {
            if (valueBytes[i] == 0x0a) {
                count++;
            }
        }
    }

    function _canonicalColorFontData() private pure returns (string memory) {
        return string.concat(
            "A:1:aqua:#00ffff\n",
            "B:2:blue:#0000ff\n",
            "C:3:coffee:#6f4e37\n",
            "D:4:denim:#6699ff\n",
            "E:5:eggshell:#fff9e3\n",
            "F:6:fuchsia:#ff00ff\n",
            "G:7:green:#008000\n",
            "H:8:honey:#ffcc00\n",
            "I:9:indigo:#4b0082\n",
            "J:10:jade green:#00a86b\n",
            "K:11:khaki:#c3b091\n",
            "L:12:lime:#00ff00\n",
            "M:13:maroon:#800000\n",
            "N:14:navy:#0a1172\n",
            "O:15:orange:#ffa500\n",
            "P:16:pink:#ffaadd\n",
            "Q:17:quicksilver:#a6a6a6\n",
            "R:18:red:#ff0000\n",
            "S:19:salmon:#fa8072\n",
            "T:20:teal:#008080\n",
            "U:21:ultramarine:#5533ff\n",
            "V:22:violet:#aa55ff\n",
            "W:23:wheat:#f5deb3\n",
            "X:24:xray:#bbcccc\n",
            "Y:25:yellow:#ffff00\n",
            "Z:26:zombie gray:#778877"
        );
    }

    function _bytesRepeat(string memory char_, uint256 count) private pure returns (bytes memory) {
        bytes memory charBytes = bytes(char_);
        bytes memory output = new bytes(charBytes.length * count);
        for (uint256 i = 0; i < count; i++) {
            for (uint256 j = 0; j < charBytes.length; j++) {
                output[i * charBytes.length + j] = charBytes[j];
            }
        }
        return output;
    }

    function _repeat(string memory char_, uint256 count) private pure returns (string memory) {
        bytes memory charBytes = bytes(char_);
        bytes memory output = new bytes(charBytes.length * count);
        for (uint256 i = 0; i < count; i++) {
            for (uint256 j = 0; j < charBytes.length; j++) {
                output[i * charBytes.length + j] = charBytes[j];
            }
        }
        return string(output);
    }
}
