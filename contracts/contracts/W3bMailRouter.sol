// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "./PubKeyRegistry.sol";
import "./MailboxIndex.sol";

/// @dev Proxy-safe reentrancy guard with ERC-7201 namespaced storage.
///      Default storage 0 means NOT_ENTERED, so no constructor / initializer
///      is required. OZ's ReentrancyGuard uses 1=NOT_ENTERED, which forces a
///      constructor write that proxies skip — unsafe for UUPS.
abstract contract ProxySafeReentrancyGuard {
    /// keccak256("w3bmail.storage.ReentrancyGuard")
    bytes32 private constant SLOT =
        keccak256("w3bmail.storage.ReentrancyGuard");

    error ReentrancyGuardReentrantCall();

    modifier nonReentrant() {
        bytes32 slot = SLOT;
        uint256 status;
        assembly { status := sload(slot) }
        if (status != 0) revert ReentrancyGuardReentrantCall();
        assembly { sstore(slot, 1) }
        _;
        assembly { sstore(slot, 0) }
    }
}

/// @title W3bMailRouter
/// @notice Main entry point — orchestrates mail send / delete / read on
///         Asset Hub (pallet-revive). Inherits MailboxIndex for CID tracking.
/// @dev    UUPS upgradeable — no selfdestruct on pallet-revive.
contract W3bMailRouter is
    Initializable,
    MailboxIndex,
    UUPSUpgradeable,
    ProxySafeReentrancyGuard,
    AccessControlUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    PubKeyRegistry public pubKeyRegistry;

    /// @notice Max messages per inbox before sender is rejected (DoS guard)
    uint256 public maxInboxSize;

    struct EmailMetadata {
        address sender;
        address receiver;
        bytes32 messageCid; // CID of encrypted blob on Bulletin Chain
        string  msgId;      // UUIDv7 — sortable, embeds creation timestamp
        uint256 timestamp;
        bool    deleted;
    }

    /// @notice receiver → all emails (including deleted; soft-delete only)
    mapping(address => EmailMetadata[]) internal inbox;
    /// @notice sender → all sent emails
    mapping(address => EmailMetadata[]) internal sent;

    event MessageSent(address indexed sender, address indexed receiver, string msgId);
    event MessageDeleted(address indexed owner, string msgId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _pubKeyRegistry, uint256 _maxInboxSize) public initializer {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        pubKeyRegistry = PubKeyRegistry(_pubKeyRegistry);
        maxInboxSize = _maxInboxSize;
    }

    function _authorizeUpgrade(address) internal override onlyRole(ADMIN_ROLE) {}

    /// @notice Send an email
    /// @dev    nonReentrant — pallet-revive forwards ALL gas (no 2300 stipend)
    function sendMessage(address _receiver, bytes32 _messageCid, string calldata _msgId)
        external
        nonReentrant
    {
        require(_receiver != address(0), "Zero receiver");
        require(_messageCid != bytes32(0), "Empty CID");
        require(bytes(_msgId).length > 0 && bytes(_msgId).length <= 64, "Bad msgId");
        require(inbox[_receiver].length < maxInboxSize, "Receiver inbox full");
        require(pubKeyRegistry.hasPubKey(_receiver), "Receiver has no public key");

        EmailMetadata memory email = EmailMetadata({
            sender: msg.sender,
            receiver: _receiver,
            messageCid: _messageCid,
            msgId: _msgId,
            timestamp: block.timestamp,
            deleted: false
        });

        inbox[_receiver].push(email);
        sent[msg.sender].push(email);
        _addMessageCid(_receiver, _messageCid);

        // Keep event payload < 416 B (REVM limit) — emit IDs only
        emit MessageSent(msg.sender, _receiver, _msgId);
    }

    /// @notice Soft-delete emails by msgId (caller's inbox only)
    function deleteMessages(string[] calldata _msgIds) external nonReentrant {
        EmailMetadata[] storage msgs = inbox[msg.sender];
        uint256 mlen = msgs.length;

        for (uint256 i = 0; i < _msgIds.length; i++) {
            bytes32 idHash = keccak256(bytes(_msgIds[i]));
            for (uint256 j = 0; j < mlen; j++) {
                if (!msgs[j].deleted && keccak256(bytes(msgs[j].msgId)) == idHash) {
                    msgs[j].deleted = true;
                    _removeMessageCid(msg.sender, msgs[j].messageCid);
                    emit MessageDeleted(msg.sender, _msgIds[i]);
                    break;
                }
            }
        }
    }

    /// @notice Active (non-deleted) inbox count for any wallet (public — polling)
    /// @dev O(n) bounded by maxInboxSize. For very large mailboxes use off-chain indexer.
    function getActiveInboxCount(address _user) external view returns (uint256) {
        EmailMetadata[] storage msgs = inbox[_user];
        uint256 mlen = msgs.length;
        uint256 count = 0;
        for (uint256 i = 0; i < mlen; i++) {
            if (!msgs[i].deleted) count++;
        }
        return count;
    }

    /// @notice Paginated inbox read for caller
    function getInboxPage(uint256 _offset, uint256 _limit)
        external
        view
        returns (EmailMetadata[] memory page, uint256 total)
    {
        EmailMetadata[] storage msgs = inbox[msg.sender];
        total = msgs.length;
        if (_offset >= total) {
            return (new EmailMetadata[](0), total);
        }
        uint256 end = _offset + _limit;
        if (end > total) end = total;
        uint256 len = end - _offset;

        page = new EmailMetadata[](len);
        for (uint256 i = 0; i < len; i++) {
            page[i] = msgs[_offset + i];
        }
    }

    /// @notice Paginated sent read for caller
    function getSentPage(uint256 _offset, uint256 _limit)
        external
        view
        returns (EmailMetadata[] memory page, uint256 total)
    {
        EmailMetadata[] storage msgs = sent[msg.sender];
        total = msgs.length;
        if (_offset >= total) {
            return (new EmailMetadata[](0), total);
        }
        uint256 end = _offset + _limit;
        if (end > total) end = total;
        uint256 len = end - _offset;

        page = new EmailMetadata[](len);
        for (uint256 i = 0; i < len; i++) {
            page[i] = msgs[_offset + i];
        }
    }

    /// @notice Admin: update max inbox cap
    function setMaxInboxSize(uint256 _max) external onlyRole(ADMIN_ROLE) {
        maxInboxSize = _max;
    }
}
