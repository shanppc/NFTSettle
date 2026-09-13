const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");

describe("NFTMarketplace - Auction system", function () {
  const ONE_DAY = 24 * 60 * 60;
  const FEE_PERCENT = 250n; // 2.5%
  const BASIS_POINTS = 10000n;

  async function deployFixture() {
    const [owner, seller, bidder1, bidder2, bidder3, other] =
      await ethers.getSigners();

    const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
    const marketplace = await NFTMarketplace.deploy();

    const MockERC721 = await ethers.getContractFactory("MockERC721");
    const nft = await MockERC721.deploy();

    // Mint a token to the seller
    const mintTx = await nft.mint(seller.address);
    const receipt = await mintTx.wait();
    // tokenId is nextId - 1; since it's the first mint, tokenId = 0
    const tokenId = 0n;

    // seller approves marketplace to pull the NFT during createAuction
    await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);

    return { marketplace, nft, owner, seller, bidder1, bidder2, bidder3, other, tokenId };
  }

  async function auctionCreatedFixture() {
    const base = await loadFixture(deployFixture);
    const { marketplace, nft, seller, tokenId } = base;

    const startingPrice = ethers.parseEther("1");
    const duration = ONE_DAY;

    await marketplace
      .connect(seller)
      .createAuction(await nft.getAddress(), tokenId, startingPrice, duration);

    return { ...base, startingPrice, duration };
  }

  describe("createAuction", function () {
    it("reverts if starting price is 0", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(deployFixture);

      await expect(
        marketplace.connect(seller).createAuction(await nft.getAddress(), tokenId, 0, ONE_DAY)
      ).to.be.revertedWithCustomError(marketplace, "InvalidPrice");
    });

    it("reverts if duration is 0", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(deployFixture);

      await expect(
        marketplace
          .connect(seller)
          .createAuction(await nft.getAddress(), tokenId, ethers.parseEther("1"), 0)
      ).to.be.revertedWithCustomError(marketplace, "invalidDuration");
    });

    it("reverts if caller does not own the NFT", async function () {
      const { marketplace, nft, other, tokenId } = await loadFixture(deployFixture);

      await expect(
        marketplace
          .connect(other)
          .createAuction(await nft.getAddress(), tokenId, ethers.parseEther("1"), ONE_DAY)
      ).to.be.revertedWithCustomError(marketplace, "NftNotAvailable");
    });

    it("reverts if the token is already listed for sale", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(deployFixture);

      await nft.connect(seller).approve(await marketplace.getAddress(), tokenId);
      await marketplace
        .connect(seller)
        .listNFT(await nft.getAddress(), tokenId, ethers.parseEther("1"));

      // listing already transferred the NFT out of seller's hands, so ownerOf check
      // in createAuction (msg.sender == owner) will fail first with NftNotAvailable
      await expect(
        marketplace
          .connect(seller)
          .createAuction(await nft.getAddress(), tokenId, ethers.parseEther("1"), ONE_DAY)
      ).to.be.revertedWithCustomError(marketplace, "NftNotAvailable");
    });

    it("reverts if an auction already exists for the token", async function () {
      const { marketplace, nft, seller, tokenId, startingPrice, duration } =
        await loadFixture(auctionCreatedFixture);

      // seller no longer owns the NFT (it's held by marketplace), so re-creating
      // will revert with NftNotAvailable before reaching the AlreadyAuctioned check
      await expect(
        marketplace
          .connect(seller)
          .createAuction(await nft.getAddress(), tokenId, startingPrice, duration)
      ).to.be.revertedWithCustomError(marketplace, "NftNotAvailable");
    });

    it("transfers the NFT into escrow and records auction data", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(deployFixture);
      const startingPrice = ethers.parseEther("1");

      await marketplace
        .connect(seller)
        .createAuction(await nft.getAddress(), tokenId, startingPrice, ONE_DAY);

      expect(await nft.ownerOf(tokenId)).to.equal(await marketplace.getAddress());

      const auction = await marketplace.auctions(await nft.getAddress(), tokenId);
      expect(auction.seller).to.equal(seller.address);
      expect(auction.startingPrice).to.equal(startingPrice);
      expect(auction.highestBid).to.equal(0);
      expect(auction.highestBidder).to.equal(ethers.ZeroAddress);
    });

    it("emits AuctionCreated", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(deployFixture);
      const startingPrice = ethers.parseEther("1");

      await expect(
        marketplace
          .connect(seller)
          .createAuction(await nft.getAddress(), tokenId, startingPrice, ONE_DAY)
      ).to.emit(marketplace, "AuctionCreated");
      // Note: contract currently emits `auction.startingPrice` read *before* the
      // struct is written to storage, so it emits 0 rather than startingPrice.
      // Worth fixing in the contract if the event payload matters to you.
    });
  });

  describe("placeBid", function () {
    it("reverts if no auction exists for the token", async function () {
      const { marketplace, nft, bidder1, tokenId } = await loadFixture(deployFixture);

      await expect(
        marketplace
          .connect(bidder1)
          .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(marketplace, "AuctionNotexist");
    });

    it("reverts if bid is below the starting price", async function () {
      const { marketplace, nft, bidder1, tokenId } = await loadFixture(auctionCreatedFixture);

      await expect(
        marketplace
          .connect(bidder1)
          .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWithCustomError(marketplace, "LowBid");
    });

    it("reverts if bid is not strictly higher than current highest bid", async function () {
      const { marketplace, nft, bidder1, bidder2, tokenId } = await loadFixture(
        auctionCreatedFixture
      );

      await marketplace
        .connect(bidder1)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("1") });

      await expect(
        marketplace
          .connect(bidder2)
          .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(marketplace, "LowBid");
    });

    it("reverts if the seller tries to bid on their own auction", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(auctionCreatedFixture);

      await expect(
        marketplace
          .connect(seller)
          .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(marketplace, "UnAuthorized");
    });

    it("reverts if the auction has already ended", async function () {
      const { marketplace, nft, bidder1, tokenId, duration } = await loadFixture(
        auctionCreatedFixture
      );

      await time.increase(duration + 1);

      await expect(
        marketplace
          .connect(bidder1)
          .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(marketplace, "AuctionClosed");
    });

    it("records the highest bid and bidder, and emits BidPlaced", async function () {
      const { marketplace, nft, bidder1, tokenId } = await loadFixture(auctionCreatedFixture);

      await expect(
        marketplace
          .connect(bidder1)
          .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("1") })
      )
        .to.emit(marketplace, "BidPlaced")
        .withArgs(bidder1.address, await nft.getAddress(), tokenId, ethers.parseEther("1"));

      const auction = await marketplace.auctions(await nft.getAddress(), tokenId);
      expect(auction.highestBidder).to.equal(bidder1.address);
      expect(auction.highestBid).to.equal(ethers.parseEther("1"));
    });

    it("credits the previous highest bidder's pendingWithdrawls when outbid", async function () {
      const { marketplace, nft, bidder1, bidder2, tokenId } = await loadFixture(
        auctionCreatedFixture
      );

      await marketplace
        .connect(bidder1)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("1") });

      await marketplace
        .connect(bidder2)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("2") });

      expect(await marketplace.pendingWithdrawls(bidder1.address)).to.equal(
        ethers.parseEther("1")
      );
      expect(await marketplace.pendingWithdrawls(bidder2.address)).to.equal(0);
    });

    it("locks the marketplace's ETH balance to hold the highest bid in escrow", async function () {
      const { marketplace, nft, bidder1, bidder2, tokenId } = await loadFixture(
        auctionCreatedFixture
      );

      await marketplace
        .connect(bidder1)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("1") });
      await marketplace
        .connect(bidder2)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("2") });

      const marketplaceAddress = await marketplace.getAddress();
      expect(await ethers.provider.getBalance(marketplaceAddress)).to.equal(
        ethers.parseEther("3") // 1 (outbid, pending) + 2 (current highest)
      );
    });
  });

  describe("endAuction", function () {
    it("reverts if no auction exists for the token", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(deployFixture);

      await expect(
        marketplace.connect(seller).endAuction(await nft.getAddress(), tokenId)
      ).to.be.revertedWithCustomError(marketplace, "AuctionNotexist");
    });

    it("reverts if the auction has not ended yet", async function () {
      const { marketplace, nft, seller, tokenId } = await loadFixture(auctionCreatedFixture);

      await expect(
        marketplace.connect(seller).endAuction(await nft.getAddress(), tokenId)
      ).to.be.revertedWithCustomError(marketplace, "NotEnded");
    });

    it("reverts if called by anyone other than the seller", async function () {
      const { marketplace, nft, other, tokenId, duration } = await loadFixture(
        auctionCreatedFixture
      );

      await time.increase(duration + 1);

      await expect(
        marketplace.connect(other).endAuction(await nft.getAddress(), tokenId)
      ).to.be.revertedWithCustomError(marketplace, "UnAuthorized");
      // Note: this restricts settlement to the seller only. Typically auction
      // houses let anyone (or the winning bidder) trigger settlement once the
      // timer expires - worth confirming this is the intended design.
    });

    it("with a winning bid: transfers NFT to winner, pays seller minus fee, and accrues fee", async function () {
      const { marketplace, nft, seller, bidder1, tokenId, duration } = await loadFixture(
        auctionCreatedFixture
      );

      const bidAmount = ethers.parseEther("2");
      await marketplace
        .connect(bidder1)
        .placeBid(await nft.getAddress(), tokenId, { value: bidAmount });

      await time.increase(duration + 1);

      const fee = (bidAmount * FEE_PERCENT) / BASIS_POINTS;
      const amountToSeller = bidAmount - fee;

      const sellerBalBefore = await ethers.provider.getBalance(seller.address);

      const tx = await marketplace.connect(seller).endAuction(await nft.getAddress(), tokenId);
      await tx.wait();

      const sellerBalAfter = await ethers.provider.getBalance(seller.address);

      expect(await nft.ownerOf(tokenId)).to.equal(bidder1.address);
      expect(sellerBalAfter - sellerBalBefore).to.equal(amountToSeller);
      expect(await marketplace.totalFee()).to.equal(fee);

      // auction record cleared
      const auction = await marketplace.auctions(await nft.getAddress(), tokenId);
      expect(auction.startingPrice).to.equal(0);
    });

    it("emits AuctionEnded with the winner and highest bid", async function () {
      const { marketplace, nft, seller, bidder1, tokenId, duration } = await loadFixture(
        auctionCreatedFixture
      );

      const bidAmount = ethers.parseEther("2");
      await marketplace
        .connect(bidder1)
        .placeBid(await nft.getAddress(), tokenId, { value: bidAmount });

      await time.increase(duration + 1);

      await expect(marketplace.connect(seller).endAuction(await nft.getAddress(), tokenId))
        .to.emit(marketplace, "AuctionEnded")
        .withArgs(seller.address, bidder1.address, await nft.getAddress(), tokenId, bidAmount);
    });

    it("with no bids: returns the NFT to the seller and accrues no fee", async function () {
      const { marketplace, nft, seller, tokenId, duration } = await loadFixture(
        auctionCreatedFixture
      );

      await time.increase(duration + 1);

      await marketplace.connect(seller).endAuction(await nft.getAddress(), tokenId);

      expect(await nft.ownerOf(tokenId)).to.equal(seller.address);
      expect(await marketplace.totalFee()).to.equal(0);
    });
  });

  describe("withdrawAuctionEth", function () {
    it("reverts if the caller has nothing pending", async function () {
      const { marketplace, other } = await loadFixture(deployFixture);

      await expect(marketplace.connect(other).withdrawAuctionEth()).to.be.revertedWithCustomError(
        marketplace,
        "InvalidAmount"
      );
    });

    it("lets an outbid bidder withdraw their refund and zeroes their balance", async function () {
      const { marketplace, nft, bidder1, bidder2, tokenId } = await loadFixture(
        auctionCreatedFixture
      );

      await marketplace
        .connect(bidder1)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("1") });
      await marketplace
        .connect(bidder2)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("2") });

      const balBefore = await ethers.provider.getBalance(bidder1.address);

      const tx = await marketplace.connect(bidder1).withdrawAuctionEth();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const balAfter = await ethers.provider.getBalance(bidder1.address);

      expect(balAfter - balBefore + gasCost).to.equal(ethers.parseEther("1"));
      expect(await marketplace.pendingWithdrawls(bidder1.address)).to.equal(0);
    });

    it("reverts on a second withdrawal attempt (balance already zeroed)", async function () {
      const { marketplace, nft, bidder1, bidder2, tokenId } = await loadFixture(
        auctionCreatedFixture
      );

      await marketplace
        .connect(bidder1)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("1") });
      await marketplace
        .connect(bidder2)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("2") });

      await marketplace.connect(bidder1).withdrawAuctionEth();

      await expect(marketplace.connect(bidder1).withdrawAuctionEth()).to.be.revertedWithCustomError(
        marketplace,
        "InvalidAmount"
      );
    });

    it("emits AuctionEthWithdrawn", async function () {
      const { marketplace, nft, bidder1, bidder2, tokenId } = await loadFixture(
        auctionCreatedFixture
      );

      await marketplace
        .connect(bidder1)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("1") });
      await marketplace
        .connect(bidder2)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("2") });

      await expect(marketplace.connect(bidder1).withdrawAuctionEth())
        .to.emit(marketplace, "AuctionEthWithdrawn")
        .withArgs(bidder1.address, ethers.parseEther("1"));
    });
  });

  describe("full lifecycle with multiple bidders", function () {
    it("only the final winner gets the NFT; all outbid bidders can recover funds", async function () {
      const { marketplace, nft, seller, bidder1, bidder2, bidder3, tokenId, duration } =
        await loadFixture(auctionCreatedFixture);

      await marketplace
        .connect(bidder1)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("1") });
      await marketplace
        .connect(bidder2)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("2") });
      await marketplace
        .connect(bidder3)
        .placeBid(await nft.getAddress(), tokenId, { value: ethers.parseEther("3") });

      await time.increase(duration + 1);
      await marketplace.connect(seller).endAuction(await nft.getAddress(), tokenId);

      expect(await nft.ownerOf(tokenId)).to.equal(bidder3.address);

      // bidder1 and bidder2 were outbid and should be able to withdraw
      await expect(marketplace.connect(bidder1).withdrawAuctionEth()).to.changeEtherBalance(
        bidder1,
        ethers.parseEther("1")
      );
      await expect(marketplace.connect(bidder2).withdrawAuctionEth()).to.changeEtherBalance(
        bidder2,
        ethers.parseEther("2")
      );
    });
  });
});
