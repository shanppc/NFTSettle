// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";


 error InvalidPrice();
 error NotOwner();
 error NotActive();
 error InvalidAmount();
 error AlreadyListed();
 error TransferFailed();
 
 contract NFTMarketplace is ERC721Holder{
    address public  owner;
    uint256 public feePercent = 250; // 2.5 % 
    uint256 public constant BASIS_POINTS = 10000; // 100 %
    uint256 public totalFee; 

    struct Listing {
        address seller;
        uint96 price;  
    }

    mapping (address => mapping(uint256 => Listing)) public listings;

    event ListingCreated(address indexed seller,
     address indexed nft,
     uint256 tokenId, 
    uint256 price );

    event ListingCancelled(address indexed seller,
     address nft,
     uint256 tokenId);

    event NFTSold(address indexed seller,
     address indexed buyer,
     address indexed nft,
     uint256 tokenId,
     uint256 price);

    event FeeWithdrawn(address indexed owner, uint256 amount);

     constructor(){
        owner = msg.sender;
     }

     modifier onlyOwner() {
        if (owner != msg.sender) { revert NotOwner(); }
        _;
     }

    function listNFT(address _nft, uint256 _tokenId, uint96 _price) external {
       IERC721 nft = IERC721(_nft);
        if(msg.sender != nft.ownerOf(_tokenId)) { revert NotOwner(); }
        if(_price == 0) { revert InvalidPrice(); }   
        Listing memory listing = listings[_nft][_tokenId];
        if( listing.price > 0 ) { revert AlreadyListed(); }

        nft.safeTransferFrom(msg.sender, address(this), _tokenId);

        listings[_nft][_tokenId] = Listing(msg.sender, _price);

        emit ListingCreated(msg.sender, _nft, _tokenId, _price);   
    }

    function cancelListing(address _nft, uint256 _tokenId) external {
        Listing memory listing = listings[_nft][_tokenId];        
        if (listing.seller != msg.sender) {revert NotOwner(); }
        if (listing.price == 0 ) {revert NotActive(); }
        delete listings[_nft][_tokenId];

         IERC721 nft = IERC721(_nft);
         nft.safeTransferFrom(address(this), listing.seller , _tokenId);

         emit ListingCancelled(msg.sender, _nft, _tokenId);
    }

    function buy(address _nft, uint256 _tokenId) external payable {
        Listing memory listing = listings[_nft][_tokenId];
        if( listing.price == 0 ) {revert NotActive(); }
        if( listing.price != msg.value ) { revert InvalidAmount(); }

        uint256 fee = (msg.value *  feePercent) / BASIS_POINTS; // calaulate fee: 
        uint256 amtAfterFee = msg.value - fee;
        totalFee += fee;

        delete listings[_nft][_tokenId];

        IERC721 nft = IERC721(_nft);
        nft.safeTransferFrom(address(this), msg.sender, _tokenId);

        (bool ok, ) = listing.seller.call{value: amtAfterFee}("");
        if( !ok ) {revert TransferFailed(); } 

        emit NFTSold(listing.seller, msg.sender, _nft, _tokenId, msg.value);       
    }

    function withdrawTotalFee() external onlyOwner {
        uint256 feeAmt = totalFee;

        totalFee = 0;

        (bool ok,) = owner.call{value: feeAmt}("");
        if( !ok ) {revert TransferFailed(); }

        emit FeeWithdrawn(msg.sender, feeAmt);
    }


}