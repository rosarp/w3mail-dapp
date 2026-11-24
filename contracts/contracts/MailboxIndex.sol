// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/// @title MailboxIndex
/// @notice Per-user CID index. Each message = individual encrypted blob on
///         Bulletin Chain with its own CID. Inheritor (W3bMailRouter) calls
///         _addMessageCid / _removeMessageCid.
/// @dev    msg.sender check on getMyMessagesPage provides no real privacy:
///         RPC node operators can spoof msg.sender in eth_call. All
///         confidentiality relies on client-side encryption.
abstract contract MailboxIndex {
    /// @notice wallet → array of message CIDs stored on Bulletin Chain
    mapping(address => bytes32[]) internal messageCids;

    event MessageCidAdded(address indexed wallet, bytes32 cid);
    event MessageCidRemoved(address indexed wallet, bytes32 cid);

    function _addMessageCid(address _wallet, bytes32 _cid) internal {
        messageCids[_wallet].push(_cid);
        emit MessageCidAdded(_wallet, _cid);
    }

    function _removeMessageCid(address _wallet, bytes32 _cid) internal {
        bytes32[] storage cids = messageCids[_wallet];
        uint256 len = cids.length;
        for (uint256 i = 0; i < len; i++) {
            if (cids[i] == _cid) {
                cids[i] = cids[len - 1];
                cids.pop();
                emit MessageCidRemoved(_wallet, _cid);
                return;
            }
        }
    }

    /// @notice Paginated CID read for caller
    function getMyMessagesPage(uint256 _offset, uint256 _limit)
        external
        view
        returns (bytes32[] memory page, uint256 total)
    {
        bytes32[] storage cids = messageCids[msg.sender];
        total = cids.length;
        if (_offset >= total) {
            return (new bytes32[](0), total);
        }
        uint256 end = _offset + _limit;
        if (end > total) end = total;
        uint256 len = end - _offset;

        page = new bytes32[](len);
        for (uint256 i = 0; i < len; i++) {
            page[i] = cids[_offset + i];
        }
    }

    /// @notice Total message count for any wallet (public — for polling)
    function getMessageCount(address _wallet) external view returns (uint256) {
        return messageCids[_wallet].length;
    }

    /// @dev Storage gap for upgradeable inheritors
    uint256[49] private __gap;
}
