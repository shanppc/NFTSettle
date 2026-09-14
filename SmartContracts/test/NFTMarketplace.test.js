const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-network-helpers");

const TOKEN_ID = 0; 
const PRICE = ethers.parseEther("1");
const FEE_PERCENT = 250n; // 2.5%
const BASIS_POINTS = 10000n;

function feeOn(amount) {
  const fee = (amount * FEE_PERCENT) / BASIS_POINTS;
  return { fee, afterFee: amount - fee };
}

describe("NFTMarketplace", function () {
  async function deployFixture() {
    const [owner, seller, buyer, bidder1, bidder2, other] =
      await ethers.getSigners();

    const Market = await ethers.getContractFactory("NFTMarketplace");
    const market = await Market.deploy();

    const NFT = await ethers.getContractFactory("MockERC721");
    const nft = await NFT.deploy();

    await nft.mint(seller.address); // mints TOKEN_ID (0) to seller

    return { market, nft, owner, seller, buyer, bidder1, bidder2, other };
  }

  async function listedFixture() {
    const f = await deployFixture();
    await f.nft
      .connect(f.seller)
      .approve(await f.market.getAddress(), TOKEN_ID);
    await f.market.connect(f.seller).listNFT(await f.nft.getAddress(), TOKEN_ID, PRICE);
    return f;
  }

  // ---------------------------------------------------------------------
  // listNFT
  // ---------------------------------------------------------------------
  describe("listNFT", function () {
    it("transfers the NFT into escrow and records the listing", async function () {
      const { market, nft, seller } = await loadFixture(deployFixture);
      const nftAddr = await nft.getAddress();
      const marketAddr = await market.getAddress();

      await nft.connect(seller).approve(marketAddr, TOKEN_ID);

      await expect(market.connect(seller).listNFT(nftAddr, TOKEN_ID, PRICE))
        .to.emit(market, "ListingCreated")
        .withArgs(seller.address, nftAddr, TOKEN_ID, PRICE);

      expect(await nft.ownerOf(TOKEN_ID)).to.equal(marketAddr);

      const listing = await market.listings(nftAddr, TOKEN_ID);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.price).to.equal(PRICE);
    });

    it("reverts if caller does not own the NFT", async function () {
      const { market, nft, buyer } = await loadFixture(deployFixture);
      await expect(
        market.connect(buyer).listNFT(await nft.getAddress(), TOKEN_ID, PRICE)
      ).to.be.revertedWithCustomError(market, "UnAuthorized");
    });

    it("reverts on zero price", async function () {
      const { market, nft, seller } = await loadFixture(deployFixture);
      const nftAddr = await nft.getAddress();
      await nft.connect(seller).approve(await market.getAddress(), TOKEN_ID);
      await expect(
        market.connect(seller).listNFT(nftAddr, TOKEN_ID, 0)
      ).to.be.revertedWithCustomError(market, "InvalidPrice");
    });

    it("cannot be re-listed by the original seller once escrowed (ownerOf check fires first)", async function () {
      // Note: after listNFT escrows the token, the seller is no longer nft.ownerOf(tokenId),
      // so a repeat call hits UnAuthorized before it can ever reach the AlreadyListed check.
      const { market, nft, seller } = await loadFixture(listedFixture);
      await expect(
        market.connect(seller).listNFT(await nft.getAddress(), TOKEN_ID, PRICE)
      ).to.be.revertedWithCustomError(market, "UnAuthorized");
    });
  });

  // ---------------------------------------------------------------------
  // cancelListing
  // ---------------------------------------------------------------------
  describe("cancelListing", function () {
    it("returns the NFT to the seller and clears the listing", async function () {
      const { market, nft, seller } = await loadFixture(listedFixture);
      const nftAddr = await nft.getAddress();

      await expect(market.connect(seller).cancelListing(nftAddr, TOKEN_ID))
        .to.emit(market, "ListingCancelled")
        .withArgs(seller.address, nftAddr, TOKEN_ID);

      expect(await nft.ownerOf(TOKEN_ID)).to.equal(seller.address);
      const listing = await market.listings(nftAddr, TOKEN_ID);
      expect(listing.price).to.equal(0);
    });

    it("reverts if caller is not the seller", async function () {
      const { market, nft, other } = await loadFixture(listedFixture);
      await expect(
        market.connect(other).cancelListing(await nft.getAddress(), TOKEN_ID)
      ).to.be.revertedWithCustomError(market, "UnAuthorized");
    });

    it("reverts for a non-existent listing (seller check runs first, so UnAuthorized fires)", async function () {
      // Note: the contract checks `listing.seller != msg.sender` before `listing.price == 0`,
      // so for any real caller a missing listing surfaces as UnAuthorized, not NotActive.
      const { market, nft, seller } = await loadFixture(deployFixture);
      await expect(
        market.connect(seller).cancelListing(await nft.getAddress(), TOKEN_ID)
      ).to.be.revertedWithCustomError(market, "UnAuthorized");
    });
  });

  // ---------------------------------------------------------------------
  // buy
  // ---------------------------------------------------------------------
  describe("buy", function () {
    it("transfers NFT to buyer, pays seller minus fee, and accrues totalFee", async function () {
      const { market, nft, seller, buyer } = await loadFixture(listedFixture);
      const nftAddr = await nft.getAddress();
      const { fee, afterFee } = feeOn(PRICE);

      const tx = market.connect(buyer).buy(nftAddr, TOKEN_ID, { value: PRICE });

      await expect(tx)
        .to.emit(market, "NFTSold")
        .withArgs(seller.address, buyer.address, nftAddr, TOKEN_ID, PRICE);
      await expect(tx).to.changeEtherBalances(
        [buyer, seller, market],
        [-PRICE, afterFee, fee]
      );

      expect(await nft.ownerOf(TOKEN_ID)).to.equal(buyer.address);
      expect(await market.totalFee()).to.equal(fee);

      const listing = await market.listings(nftAddr, TOKEN_ID);
      expect(listing.price).to.equal(0);
    });

    it("reverts if value does not exactly match the listing price", async function () {
      const { market, nft, buyer } = await loadFixture(listedFixture);
      await expect(
        market
          .connect(buyer)
          .buy(await nft.getAddress(), TOKEN_ID, { value: PRICE - 1n })
      ).to.be.revertedWithCustomError(market, "InvalidAmount");
    });

    it("reverts if the listing is not active", async function () {
      const { market, nft, buyer } = await loadFixture(deployFixture);
      await expect(
        market.connect(buyer).buy(await nft.getAddress(), TOKEN_ID, { value: PRICE })
      ).to.be.revertedWithCustomError(market, "NotActive");
    });

    it("cannot be bought twice (second buyer reverts)", async function () {
      const { market, nft, buyer, other } = await loadFixture(listedFixture);
      const nftAddr = await nft.getAddress();
      await market.connect(buyer).buy(nftAddr, TOKEN_ID, { value: PRICE });
      await expect(
        market.connect(other).buy(nftAddr, TOKEN_ID, { value: PRICE })
      ).to.be.revertedWithCustomError(market, "NotActive");
    });
  });

  // ---------------------------------------------------------------------
  // withdrawTotalFee
  // ---------------------------------------------------------------------
  describe("withdrawTotalFee", function () {
    it("lets only the owner withdraw accrued fees and resets totalFee", async function () {
      const { market, nft, owner, buyer } = await loadFixture(listedFixture);
      const nftAddr = await nft.getAddress();
      const { fee } = feeOn(PRICE);
      await market.connect(buyer).buy(nftAddr, TOKEN_ID, { value: PRICE });

      await expect(
        market.connect(owner).withdrawTotalFee()
      ).to.changeEtherBalances([owner, market], [fee, -fee]);

      expect(await market.totalFee()).to.equal(0);
    });

    it("reverts if called by non-owner", async function () {
      const { market, other } = await loadFixture(deployFixture);
      await expect(
        market.connect(other).withdrawTotalFee()
      ).to.be.revertedWithCustomError(market, "UnAuthorized");
    });
  });

  // ---------------------------------------------------------------------
  // offers
  // ---------------------------------------------------------------------
  describe("offers", function () {
    it("makeOffer records the offer and rejects a second offer from the same bidder", async function () {
      const { market, nft, buyer } = await loadFixture(listedFixture);
      const nftAddr = await nft.getAddress();
      const offerAmt = ethers.parseEther("0.5");

      await expect(
        market.connect(buyer).makeOffer(nftAddr, TOKEN_ID, { value: offerAmt })
      )
        .to.emit(market, "OfferCreated")
        .withArgs(buyer.address, nftAddr, TOKEN_ID, offerAmt);

      expect(await market.offers(nftAddr, TOKEN_ID, buyer.address)).to.equal(
        offerAmt
      );

      await expect(
        market.connect(buyer).makeOffer(nftAddr, TOKEN_ID, { value: offerAmt })
      ).to.be.revertedWithCustomError(market, "AlreadyOffered");
    });

    it("cancelOffer refunds the bidder and clears the offer", async function () {
      const { market, nft, buyer } = await loadFixture(listedFixture);
      const nftAddr = await nft.getAddress();
      const offerAmt = ethers.parseEther("0.5");
      await market.connect(buyer).makeOffer(nftAddr, TOKEN_ID, { value: offerAmt });

      await expect(
        market.connect(buyer).cancelOffer(nftAddr, TOKEN_ID)
      ).to.changeEtherBalances([buyer, market], [offerAmt, -offerAmt]);

      expect(await market.offers(nftAddr, TOKEN_ID, buyer.address)).to.equal(0);
    });

    it("accpectOffer pays seller (minus fee), transfers NFT to buyer, and clears listing/offer", async function () {
      const { market, nft, seller, buyer } = await loadFixture(listedFixture);
      const nftAddr = await nft.getAddress();
      const offerAmt = ethers.parseEther("0.5");
      const { fee, afterFee } = feeOn(offerAmt);
      await market.connect(buyer).makeOffer(nftAddr, TOKEN_ID, { value: offerAmt });

      const tx = market.connect(seller).accpectOffer(nftAddr, TOKEN_ID, buyer.address);

      await expect(tx)
        .to.emit(market, "OfferAccpected")
        .withArgs(seller.address, buyer.address, nftAddr, TOKEN_ID, offerAmt);
      await expect(tx).to.changeEtherBalances([seller, market], [afterFee, -afterFee]);

      expect(await nft.ownerOf(TOKEN_ID)).to.equal(buyer.address);
      expect(await market.totalFee()).to.equal(fee);
      expect((await market.listings(nftAddr, TOKEN_ID)).price).to.equal(0);
      expect(await market.offers(nftAddr, TOKEN_ID, buyer.address)).to.equal(0);
    });

    it("accpectOffer reverts when called by someone other than the seller", async function () {
      const { market, nft, buyer, other } = await loadFixture(listedFixture);
      const nftAddr = await nft.getAddress();
      const offerAmt = ethers.parseEther("0.5");
      await market.connect(buyer).makeOffer(nftAddr, TOKEN_ID, { value: offerAmt });

      await expect(
        market.connect(other).accpectOffer(nftAddr, TOKEN_ID, buyer.address)
      ).to.be.revertedWithCustomError(market, "UnAuthorized");
    });

    it("accpectOffer reverts if there is no offer from that buyer", async function () {
      const { market, nft, seller, other } = await loadFixture(listedFixture);
      await expect(
        market
          .connect(seller)
          .accpectOffer(await nft.getAddress(), TOKEN_ID, other.address)
      ).to.be.revertedWithCustomError(market, "OfferNotAvailable");
    });
  });

  // ---------------------------------------------------------------------
  // auctions
  // ---------------------------------------------------------------------
  describe("auctions", function () {
    const START_PRICE = ethers.parseEther("1");
    const DURATION = 3600; // 1 hour

    async function auctionFixture() {
      const f = await deployFixture();
      const nftAddr = await f.nft.getAddress();
      const marketAddr = await f.market.getAddress();
      await f.nft.connect(f.seller).approve(marketAddr, TOKEN_ID);
      await f.market
        .connect(f.seller)
        .createAuction(nftAddr, TOKEN_ID, START_PRICE, DURATION);
      return f;
    }

    it("createAuction escrows the NFT and stores auction data", async function () {
      const { market, nft, seller } = await loadFixture(deployFixture);
      const nftAddr = await nft.getAddress();
      await nft.connect(seller).approve(await market.getAddress(), TOKEN_ID);

      await expect(
        market.connect(seller).createAuction(nftAddr, TOKEN_ID, START_PRICE, DURATION)
      ).to.emit(market, "AuctionCreated");

      expect(await nft.ownerOf(TOKEN_ID)).to.equal(await market.getAddress());
      const auction = await market.auctions(nftAddr, TOKEN_ID);
      expect(auction.seller).to.equal(seller.address);
      expect(auction.startingPrice).to.equal(START_PRICE);
      expect(auction.highestBid).to.equal(0);
    });

    it("createAuction reverts if the seller no longer owns the NFT (e.g. already listed elsewhere)", async function () {
      // Once listNFT escrows the token, seller fails the ownerOf check before
      // the AlreadyListed branch is ever reached.
      const { market, nft, seller } = await loadFixture(listedFixture);
      await expect(
        market
          .connect(seller)
          .createAuction(await nft.getAddress(), TOKEN_ID, START_PRICE, DURATION)
      ).to.be.revertedWithCustomError(market, "NftNotAvailable");
    });

    it("placeBid rejects a bid below starting price, and below current highest bid", async function () {
      const { market, nft, bidder1, bidder2 } = await loadFixture(auctionFixture);
      const nftAddr = await nft.getAddress();

      await expect(
        market.connect(bidder1).placeBid(nftAddr, TOKEN_ID, { value: START_PRICE - 1n })
      ).to.be.revertedWithCustomError(market, "LowBid");

      await market.connect(bidder1).placeBid(nftAddr, TOKEN_ID, { value: START_PRICE });

      await expect(
        market.connect(bidder2).placeBid(nftAddr, TOKEN_ID, { value: START_PRICE })
      ).to.be.revertedWithCustomError(market, "LowBid");
    });

    it("placeBid refunds (via pendingWithdrawls) the previous highest bidder when outbid", async function () {
      const { market, nft, bidder1, bidder2 } = await loadFixture(auctionFixture);
      const nftAddr = await nft.getAddress();

      await market.connect(bidder1).placeBid(nftAddr, TOKEN_ID, { value: START_PRICE });
      await market
        .connect(bidder2)
        .placeBid(nftAddr, TOKEN_ID, { value: START_PRICE + ethers.parseEther("0.1") });

      expect(await market.pendingWithdrawls(bidder1.address)).to.equal(START_PRICE);

      const auction = await market.auctions(nftAddr, TOKEN_ID);
      expect(auction.highestBidder).to.equal(bidder2.address);
      expect(auction.highestBid).to.equal(START_PRICE + ethers.parseEther("0.1"));

      await expect(
        market.connect(bidder1).withdrawAuctionEth()
      ).to.changeEtherBalances([bidder1, market], [START_PRICE, -START_PRICE]);
    });

    it("placeBid reverts once the auction end time has passed", async function () {
      const { market, nft, bidder1 } = await loadFixture(auctionFixture);
      await time.increase(DURATION + 1);
      await expect(
        market.connect(bidder1).placeBid(await nft.getAddress(), TOKEN_ID, { value: START_PRICE })
      ).to.be.revertedWithCustomError(market, "AuctionClosed");
    });

    it("placeBid reverts if the seller tries to bid on their own auction", async function () {
      const { market, nft, seller } = await loadFixture(auctionFixture);
      await expect(
        market.connect(seller).placeBid(await nft.getAddress(), TOKEN_ID, { value: START_PRICE })
      ).to.be.revertedWithCustomError(market, "UnAuthorized");
    });

    it("endAuction reverts before the end time is reached", async function () {
      const { market, nft, seller } = await loadFixture(auctionFixture);
      await expect(
        market.connect(seller).endAuction(await nft.getAddress(), TOKEN_ID)
      ).to.be.revertedWithCustomError(market, "NotEnded");
    });

    it("endAuction with a winning bid pays seller (minus fee) and transfers NFT to the winner", async function () {
      const { market, nft, seller, bidder1 } = await loadFixture(auctionFixture);
      const nftAddr = await nft.getAddress();
      await market.connect(bidder1).placeBid(nftAddr, TOKEN_ID, { value: START_PRICE });
      await time.increase(DURATION + 1);

      const { fee, afterFee } = feeOn(START_PRICE);

      const tx = market.connect(seller).endAuction(nftAddr, TOKEN_ID);

      await expect(tx)
        .to.emit(market, "AuctionEnded")
        .withArgs(seller.address, bidder1.address, nftAddr, TOKEN_ID, START_PRICE);
      await expect(tx).to.changeEtherBalances([seller, market], [afterFee, -afterFee]);

      expect(await nft.ownerOf(TOKEN_ID)).to.equal(bidder1.address);
      expect(await market.totalFee()).to.equal(fee);
      const auction = await market.auctions(nftAddr, TOKEN_ID);
      expect(auction.startingPrice).to.equal(0);
    });

    it("endAuction with no bids returns the NFT to the seller and charges no fee", async function () {
      const { market, nft, seller } = await loadFixture(auctionFixture);
      const nftAddr = await nft.getAddress();
      await time.increase(DURATION + 1);

      await expect(market.connect(seller).endAuction(nftAddr, TOKEN_ID))
        .to.emit(market, "AuctionEnded")
        .withArgs(seller.address, ethers.ZeroAddress, nftAddr, TOKEN_ID, 0);

      expect(await nft.ownerOf(TOKEN_ID)).to.equal(seller.address);
      expect(await market.totalFee()).to.equal(0);
    });

    it("endAuction reverts if called by someone other than the seller", async function () {
      const { market, nft, bidder1, other } = await loadFixture(auctionFixture);
      const nftAddr = await nft.getAddress();
      await market.connect(bidder1).placeBid(nftAddr, TOKEN_ID, { value: START_PRICE });
      await time.increase(DURATION + 1);

      await expect(
        market.connect(other).endAuction(nftAddr, TOKEN_ID)
      ).to.be.revertedWithCustomError(market, "UnAuthorized");
    });

    it("withdrawAuctionEth reverts if there is nothing to withdraw", async function () {
      const { market, other } = await loadFixture(deployFixture);
      await expect(
        market.connect(other).withdrawAuctionEth()
      ).to.be.revertedWithCustomError(market, "InvalidAmount");
    });
  });
});
