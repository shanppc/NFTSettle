// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";


 error InvalidPrice();
 error NotActive();
 error InvalidAmount();
 error AlreadyListed();
 error TransferFailed();
 error AlreadyOffered();
 error OfferNotAvailable();
 error NftNotAvailable();
 error invalidDuration();
 error AlreadyAuctioned();
 error AuctionNotexist();
 error LowBid();
 error UnAuthorized();
 error AuctionEnded();
 
 contract NFTMarketplace is ERC721Holder{
    address public  owner;
    uint256 public feePercent = 250; // 2.5 % 
    uint256 public constant BASIS_POINTS = 10000; // 100 %
    uint256 public totalFee; 

    struct Listing {
        address seller;
        uint96 price;  
    }

    struct Auction {
        uint64 endTime;
        address seller;
        address highestBidder;
        uint256 startingPrice;
        uint256 highestBid;
    }

    mapping (address => mapping(uint256 => Listing)) public listings;
    mapping (address => mapping(uint256 => mapping(address => uint256 ))) public offers;
    mapping (address => mapping(uint256 => Auction)) public auctions;
    mapping (address => uint256) public pendingWithdrawls;

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
    event OfferCreated(address indexed buyer,
     address indexed nft,
     uint256 tokenId,
     uint256 amount);
    
    event OfferCancelled(address indexed buyer,
    address indexed nft,
    uint256 tokenId,
    uint256 amtToRefund);
    event OfferAccpected(address indexed seller,
    address indexed buyer,
    address indexed nft,
    uint256 tokenId,
    uint256 amount);
    event AuctionCreated(address indexed seller, address indexed nft, uint256 tokenId,uint256 startingPrice, uint64 endAt,);
    event BidPlaced(address indexed Bider, address indexed nft, uint256 tokenId, uint256 bid);
     
    constructor(){
        owner = msg.sender;
     }

     modifier onlyOwner() {
        if (owner != msg.sender) { revert UnAuthorized(); }
        _;
     }

    function listNFT(address _nft, uint256 _tokenId, uint96 _price) external {
       IERC721 nft = IERC721(_nft);
        if(msg.sender != nft.ownerOf(_tokenId)) { revert UnAuthorized(); }
        if(_price == 0) { revert InvalidPrice(); }   
        Listing memory listing = listings[_nft][_tokenId];
        if( listing.price > 0 ) { revert AlreadyListed(); }

        nft.safeTransferFrom(msg.sender, address(this), _tokenId);

        listings[_nft][_tokenId] = Listing(msg.sender, _price);

        emit ListingCreated(msg.sender, _nft, _tokenId, _price);   
    }

    function cancelListing(address _nft, uint256 _tokenId) external {
        Listing memory listing = listings[_nft][_tokenId];        
        if (listing.seller != msg.sender) {revert UnAuthorized(); }
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

    function makeOffer(address _nft, uint256 _tokenId) external payable {
        Listing memory listing = listings[_nft][_tokenId];        
        if(listing.price == 0 ){ revert NotActive(); }
        if(msg.value == 0) {revert InvalidAmount(); }
        if(offers[_nft][_tokenId][msg.sender] > 0 ) { revert AlreadyOffered(); }

        offers[_nft][_tokenId][msg.sender] = msg.value;

        emit OfferCreated(msg.sender, _nft, _tokenId, msg.value);
    }

    function cancelOffer(address _nft, uint256 _tokenId) external {
        uint256 amtToRefund = offers[_nft][_tokenId][msg.sender];
        if(amtToRefund == 0 ) {revert InvalidAmount(); } 

        delete offers[_nft][_tokenId][msg.sender];

        (bool ok,) = msg.sender.call{value: amtToRefund}("");
        if (!ok ) {revert TransferFailed(); }

        emit OfferCancelled(msg.sender, _nft, _tokenId, amtToRefund);
    }

    function accpectOffer(address _nft, uint256 _tokenId, address _buyer) external {
     Listing memory listing = listings[_nft][_tokenId];
     IERC721 nft = IERC721(_nft);
     uint256 offerAmt = offers[_nft][_tokenId][_buyer];
      if( listing.price == 0 ) {revert NotActive(); }
      if(offerAmt == 0 ){revert OfferNotAvailable(); }
      if (listing.seller != msg.sender) {revert UnAuthorized(); }
      if ( nft.ownerOf(_tokenId) != address(this)) { revert NftNotAvailable(); }

      uint256 fee = (offerAmt * feePercent) / BASIS_POINTS;
      uint256 amtAfterFee = offerAmt - fee; 

      delete listings[_nft][_tokenId];
      delete offers[_nft][_tokenId][_buyer];
      totalFee += fee;      
      
      nft.safeTransferFrom(address(this), _buyer, _tokenId);

      (bool ok,) = msg.sender.call{value: amtAfterFee}("");
      if ( !ok ) { revert TransferFailed(); }

      emit OfferAccpected(msg.sender, _buyer, _nft, _tokenId, offerAmt);
    }

    function createAuction(address _nft, uint256 _tokenId, uint256 _startingPrice, uint64 _duration) external {
        if(_startingPrice == 0 ) {revert InvalidPrice(); }
        if(_duration == 0 ) {revert invalidDuration();}
        IERC721 nft = IERC721(_nft);
        Listing memory listing = listings[_nft][_tokenId];
        Auction memory auction = auctions[_nft][_tokenId];
        if(nft.ownerOf(_tokenId) != msg.sender) {revert NftNotAvailable(); }
        if(listing.price > 0) {revert AlreadyListed();}
        if(auction.startingPrice > 0) {revert AlreadyAuctioned(); }

    uint64 endTime = _duration + block.timestamp;
    auctions[_nft][_tokenId] = Auction({endTime: endTime, seller: msg.sender, highestBidder: address(0), startingPrice: _startingPrice, highestBid: 0});
    nft.safeTransferFrom(msg.sender, address(this), _tokenId);

    emit AuctionCreated(msg.sender, _nft, _tokenId, auction.startingPrice, endTime)
    }

    function placeBid(address _nft, uint256 _tokenId) external payable {
        Auction storage auction = auctions[_nft][_tokenId];
        if(auction.startingPrice == 0 ) {revert AuctionNotexist(); }
        if(msg.value < auction.startingPrice ) {revert LowBid();}
        if(msg.value <= auction.highestBid) {revert LowBid(); }
        if(msg.sender == auction.seller) { revert UnAuthorized(); }
        if(block.timestamp >= auction.endTime) {revert AuctionEnded(); }

        uint256 prevHighestBid = auction.highestBid;
        address prevHighestBidder = auction.highestBidder;
    
        if(prevHighestBidder != address(0)){
          pendingWithdrawls[prevHighestBidder] += prevHighestBid;
        }
        auction.highestBidder = msg.sender;
        auction.highestBid = msg.value;

        emit BidPlaced(msg.sender, _nft, _tokenId, msg.value);
    }


}