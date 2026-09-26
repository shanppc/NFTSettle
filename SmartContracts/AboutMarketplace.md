# NFT Marketplace --- Smart Contract Overview

## 1. Problem and Solution

### The Problem

NFT trading normally requires users to coordinate several actions:

-   Transfer ownership of an NFT.
-   Find a buyer or seller.
-   Handle ETH payments securely.
-   Support fixed-price sales.
-   Support offers from buyers.
-   Support competitive auctions.
-   Return funds to losing bidders or cancelled offers.
-   Collect marketplace fees.

Handling these operations directly between users can create unnecessary
trust and security risks.

### The Solution

This `NFTMarketplace` smart contract acts as an on-chain escrow and
settlement layer.

The marketplace temporarily holds NFTs during active listings and
auctions, holds ETH associated with offers and bids, and performs the
final settlement according to predefined contract rules.

The contract supports three main trading mechanisms:

1.  **Fixed-price listings**
2.  **Buyer offers**
3.  **English-style auctions**

All important ownership and payment movements are executed by the smart
contract rather than relying on an off-chain intermediary.

------------------------------------------------------------------------

## 2. Smart Contract Architecture

``` mermaid
flowchart TB
    NFT[("ERC721 NFT Contract")]
    Market(["NFTMarketplace"])
    TotalFee[("totalFee")]

    subgraph FixedPrice["Fixed-Price Listing & Purchase"]
        direction LR
        Seller1["Seller"] -->|"listNFT()"| Market
        Market -->|"safeTransferFrom (escrow)"| NFT
        Buyer1["Buyer"] -->|"buy() + ETH"| Market
        Market -->|"NFT"| Buyer1
        Market -->|"ETH − fee"| Seller1
    end

    subgraph Offers["Buyer Offers"]
        direction LR
        Buyer2["Buyer"] -->|"makeOffer() + ETH"| Market
        Seller2["Seller"] -->|"acceptOffer()"| Market
        Market -->|"NFT"| Buyer2
        Market -->|"ETH − fee"| Seller2
    end

    subgraph Auctions["English-Style Auctions"]
        direction LR
        Seller3["Seller"] -->|"createAuction()"| Market
        Market -->|"safeTransferFrom (escrow)"| NFT
        BidderA["Bidder"] -->|"placeBid() + ETH"| Market
        BidderB["Higher Bidder"] -->|"placeBid() + ETH"| Market
        Market -->|"outbid refund credited"| Pending[("pendingWithdrawls")]
        BidderA -->|"withdrawAuctionEth()"| Pending
        Seller3 -->|"endAuction()"| Market
        Market -->|"NFT"| Winner["Winner"]
        Market -->|"ETH − fee"| Seller3
    end

    Market -->|"fee"| TotalFee
    Owner["Marketplace Owner"] -->|"withdrawTotalFee()"| TotalFee

    style Market fill:#4f46e5,color:#fff,stroke:#312e81
    style NFT fill:#0891b2,color:#fff,stroke:#164e63
    style TotalFee fill:#ca8a04,color:#fff,stroke:#713f12
    style Pending fill:#ca8a04,color:#fff,stroke:#713f12
```

### Main State

The contract uses separate mappings for each trading mechanism:

``` solidity
mapping(address => mapping(uint256 => Listing)) public listings;

mapping(address => mapping(uint256 => mapping(address => uint256)))
    public offers;

mapping(address => mapping(uint256 => Auction)) public auctions;

mapping(address => uint256) public pendingWithdrawls;
```

The NFT contract address and `tokenId` together identify an NFT position
inside the marketplace.

### Escrow Model

For active listings and auctions, the marketplace contract becomes the
NFT custodian.

``` text
Seller
   |
   | safeTransferFrom()
   v
NFTMarketplace
   |
   | settlement
   v
Buyer / Winner
```

This gives the contract control over the NFT during settlement and
prevents a seller from selling or transferring the escrowed NFT outside
the marketplace while the trade is active.

------------------------------------------------------------------------

## 3. Core Features

### Fixed-Price Listing

`listNFT()` allows an NFT owner to create a listing with a non-zero
price.

The contract:

1.  Verifies the caller owns the NFT.
2.  Verifies the price is valid.
3.  Prevents an already-listed NFT from being listed again.
4.  Transfers the NFT into marketplace escrow.
5.  Stores the seller and price.
6.  Emits `ListingCreated`.

`cancelListing()` allows the original seller to cancel an active listing
and receive the NFT back.

### Fixed-Price Purchase

`buy()` allows a buyer to purchase an active listing.

The buyer must send exactly the listed price.

The contract:

1.  Calculates the marketplace fee.
2.  Adds the fee to `totalFee`.
3.  Deletes the listing.
4.  Transfers the NFT to the buyer.
5.  Sends the remaining ETH to the seller.
6.  Emits `NFTSold`.

### Buyer Offers

`makeOffer()` allows a buyer to deposit ETH against an active listing.

Each buyer can have one active offer for a particular NFT.

`cancelOffer()` uses a pull-payment approach:

-   The offer is deleted first.
-   The buyer's ETH becomes withdrawable immediately through the
    transaction.
-   The buyer receives the deposited ETH through a direct withdrawal
    call.

### Accepting Offers

`accpectOffer()` allows the seller to accept a specific buyer's offer.

The contract verifies:

-   The listing is active.
-   The offer exists.
-   The caller is the seller.
-   The marketplace still owns the NFT.

The NFT is transferred to the buyer and the seller receives the offer
amount minus the marketplace fee.

### Auctions

`createAuction()` creates an auction with:

-   Starting price
-   End time
-   Seller
-   Highest bidder
-   Highest bid

The NFT is transferred into marketplace escrow when the auction starts.

`placeBid()` requires:

-   A valid auction.
-   A bid at or above the starting price.
-   A bid higher than the current highest bid.
-   A bidder who is not the seller.
-   An auction that has not ended.

When a new highest bid arrives, the previous highest bidder's ETH is
moved into:

``` solidity
pendingWithdrawls[previousHighestBidder]
```

The previous bidder can later call `withdrawAuctionEth()`.

### Auction Settlement

`endAuction()` can be called by the seller after the auction ends.

If there is a winner:

``` text
NFT -> Winner
ETH - Fee -> Seller
Fee -> Marketplace
```

If there is no bidder:

``` text
NFT -> Seller
```

### Marketplace Fees

The contract uses basis points:

``` solidity
uint256 public feePercent = 250;
uint256 public constant BASIS_POINTS = 10000;
```

Therefore:

``` text
250 / 10000 = 2.5%
```

Fees are accumulated in:

``` solidity
totalFee
```

The marketplace owner can withdraw accumulated fees through
`withdrawTotalFee()`.

------------------------------------------------------------------------

## 4. Why It Consumes Less Gas

The contract applies several Solidity-level gas optimization techniques.

### Custom Errors

Instead of storing long revert strings, the contract uses custom errors:

``` solidity
error InvalidPrice();
error NotActive();
error InvalidAmount();
error TransferFailed();
```

Custom errors generally use less deployment and runtime gas than
equivalent string-based revert messages.

### Compact Integer Types

The contract intentionally uses smaller integer types where the expected
range is known:

``` solidity
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
```

`uint96` is used for listing prices and `uint64` for auction end times.

These choices can improve storage packing where compatible values share
a storage slot.

### Mappings Instead of Large Arrays

NFT positions are accessed through mappings using:

``` text
NFT contract address + tokenId
```

This provides direct key-based storage access instead of requiring
iteration through a growing array.

### No Unnecessary On-Chain Loops

The marketplace does not loop through:

-   All listings
-   All offers
-   All bidders
-   All NFTs

This is important because unbounded loops can make transactions
increasingly expensive as marketplace activity grows.

### Pull Payment for Losing Bidders

Instead of automatically sending ETH to every participant when an
auction changes hands, previous bids are credited to:

``` solidity
pendingWithdrawls
```

The bidder withdraws their own funds later.

This avoids requiring the contract to perform potentially many external
payments during auction processing.

> Gas optimization is a design consideration, not a guarantee that every
> transaction is cheaper than every alternative implementation. Actual
> gas usage depends on the operation and blockchain state.

------------------------------------------------------------------------

## 5. Why It Is Secure

The contract implements several important smart-contract security
patterns.

### Checks-Effects-Interactions

State-changing functions generally follow the pattern:

``` text
1. Checks
2. State updates
3. External interaction
```

For example, before sending ETH, the contract removes or updates the
relevant marketplace state.

In `buy()`:

``` solidity
delete listings[_nft][_tokenId];
```

happens before the seller payment.

In `cancelOffer()`:

``` solidity
delete offers[_nft][_tokenId][msg.sender];
```

happens before the ETH transfer.

In `withdrawAuctionEth()`:

``` solidity
pendingWithdrawls[msg.sender] = 0;
```

happens before the ETH transfer.

This reduces the risk of reentrancy through those payment paths.

### NFT Escrow

The marketplace uses `safeTransferFrom()` to move NFTs into
contract-controlled escrow.

This means an active listing or auction is backed by the NFT held by the
marketplace.

### Ownership Verification

The contract verifies ownership when creating listings and auctions.

For example:

``` solidity
if(msg.sender != nft.ownerOf(_tokenId)) {
    revert UnAuthorized();
}
```

### Active-State Validation

The contract checks whether listings, offers, and auctions actually
exist before processing them.

Examples include:

``` solidity
if(listing.price == 0)
```

and:

``` solidity
if(auction.startingPrice == 0)
```

This prevents operations against inactive marketplace state.

### Exact Payment Validation

For fixed-price purchases, the buyer must send exactly the listed price:

``` solidity
if(listing.price != msg.value) {
    revert InvalidAmount();
}
```

This prevents underpayment or accidental overpayment through the
marketplace purchase function.

### Pull-Based Auction Refunds

Previous bidders do not receive an automatic external call during every
new bid.

Their funds are recorded:

``` solidity
pendingWithdrawls[previousHighestBidder] += prevHighestBid;
```

They later withdraw them themselves.

This is a widely used approach for reducing external-call complexity in
payment flows.

### State Cleanup Before External Calls

Important marketplace records are deleted before NFT and ETH transfers.

For example:

``` solidity
delete auctions[_nft][_tokenId];
```

occurs before final auction transfers.

If an external interaction fails, the entire transaction reverts and
Solidity restores the previous state.

------------------------------------------------------------------------

## 6. Why the Architecture Uses Industry-Recognized Patterns

The contract follows several patterns commonly found in professional
Solidity systems.

### Escrow

The marketplace takes custody of an NFT while a trade is active.

This creates a clear invariant:

``` text
Active trade -> Marketplace should control the NFT
```

The buyer and seller do not need to perform a separate NFT transfer
during settlement.

### Pull Payments

Auction refunds use:

``` solidity
pendingWithdrawls
```

instead of immediately paying previous bidders.

Pull-payment designs are commonly used when external ETH transfers could
otherwise make a larger operation more fragile.

### Checks-Effects-Interactions

The contract validates conditions and updates important state before
interacting with external contracts or sending ETH.

This is a foundational Solidity security pattern.

### Events

The marketplace emits events such as:

``` solidity
ListingCreated
ListingCancelled
NFTSold
OfferCreated
OfferCancelled
OfferAccpected
AuctionCreated
BidPlaced
AuctionEnded
AuctionEthWithdrawn
```

Events provide an efficient way for off-chain applications and indexers
to track marketplace activity.

### OpenZeppelin ERC721Holder

The contract inherits:

``` solidity
ERC721Holder
```

from OpenZeppelin.

This allows the marketplace contract to safely receive ERC-721 NFTs
through `safeTransferFrom()`.

### Clear Separation of State

Listings, offers, auctions, pending withdrawals, and accumulated fees
have separate storage structures.

This makes the contract's state transitions easier to reason about and
reduces unnecessary coupling between different trading mechanisms.

------------------------------------------------------------------------

## 7. Important Contract Invariants

The architecture is built around several important assumptions:

### Listing

``` text
Active listing
    =>
NFT should be held by the marketplace
```

### Auction

``` text
Active auction
    =>
NFT should be held by the marketplace
```

### Offer

``` text
Active offer
    =>
ETH is held by the marketplace for that offer
```

### Previous Auction Bid

``` text
pendingWithdrawls[bidder] > 0
    =>
ETH is reserved for that bidder
```

### Marketplace Fee

``` text
totalFee
    =>
ETH accumulated from marketplace trading fees
```

These invariants are useful when testing the contract because every
state-changing function should preserve the appropriate invariant.

------------------------------------------------------------------------

## 8. Security and Production Considerations

This contract implements several strong Solidity patterns, but
architecture following industry practices does **not** mean the contract
is automatically production-safe.

Before handling real-value mainnet assets, it should undergo:

-   Comprehensive unit testing
-   Integration testing
-   Fuzz testing
-   Invariant testing
-   Static analysis
-   Independent security review or audit
-   Mainnet deployment review

The contract should also be evaluated against the exact ERC-721
implementations it is expected to support.

This documentation describes the architecture and security patterns
implemented in the current contract; it is not a security audit.
