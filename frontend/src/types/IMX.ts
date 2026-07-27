import { Familiar } from "./Familiar"

export type IMXClient = {
    connect: () => Promise<void>,
    disconnect: () => Promise<void>,
    authenticate: () => Promise<void>,
}

export type IMXBalance = {
    available: string,
    preparing: string,
    withdrawable: string
}

export type AppError = {
    code: number,
    reason: string,
    stack?: unknown
}

export type Authentication = {
    eth_address: string,
    eth_timestamp: number,
    eth_signature: string
}

export type AssetRequest = {
    auxiliary_fee_percentages?: string,     // Comma separated string of fee percentages that are to be paired with auxiliary_fee_recipients
    auxiliary_fee_recipients?: string       // Comma separated string of fee recipients that are to be paired with auxiliary_fee_percentages
    buy_orders?: boolean,                   // Set flag to true to fetch an array of buy order details with accepted status associated with the asset
    collection?: string,                    // Collection contract address
    cursor?: string,                        // Cursor
    direction?: "asc" | "desc",             // Direction to sort (asc/desc)
    include_fees?: boolean,                 // Set flag to include fees associated with the asset
    metadata?: string,                       // URL JSON-encoded metadata filters for these assets.
    name?: string,                          // Name of the asset to search
    order_by?: "updated_at" | "name",       // Property to sort by
    page_size?: number,                     // Page size of the result
    sell_orders?: boolean,                  // Set flag to true to fetch an array of sell order details with accepted status associated with the asset
    status?: "eth" | "imx",                 // Status of these assets
    updated_max_timestamp?: string,         // Maximum timestamp for when these assets were last updated, in ISO 8601 UTC format. Example: '2022-05-27T00:10:22Z
    updated_min_timestamp?: string,         // Minimum timestamp for when these assets were last updated, in ISO 8601 UTC format. Example: '2022-05-27T00:10:22Z
    user?: string                           // Ethereum address of the user who owns these assets
}

export type AssetResponseOK = {
    cursor: string,                         // Generated cursor returned by previous query
    remaining: number,                      // Remaining results flag. 1: there are remaining results matching this query, 0: no remaining results
    result: [                               // Assets matching query parameters
    {
        collection: {
            icon_url: string,               // URL of the icon of the collection
            name: string                    // Name of the collection
        },
        created_at: string,                 // Timestamp of when the asset was created
        description: string,                // Description of this asset
        fees: [                             // Royalties to pay on this asset operations
        {
            address: string                 // Wallet address
            percentage: number              // The percentage of fee <= 100
            type: string                    // Type of fee. Examples: royalty, maker, taker or protocol
        }]
        image_url: string,                  // URL of the image which should be used for this asset
        metadata: Familiar,                 // Metadata of this asset
        name: string,                       // Name of this asset
        orders: {
            buy_orders: Array<Object>       // Buy orders for this asset
            sell_orders: Array<Object>      // Sell orders for this asset
        },
        status: "eth" | "imx",               // Status of this asset (where it is in the system)
        token_address: string,               // Address of the ERC721 contract
        token_id: string,                    // ERC721 Token ID of this asset
        updated_at: string,                  // Timestamp of when the asset was updated
        uri: string,                         // URI to access this asset externally to Immutable X
        user: string                         // Ethereum address of the user who owns this asset

    }]                               
}

export type balancesResponseOK = {
  balance: string,
  preparing_withdrawal: string,
  symbol: string,
  token_address: string,
  withdrawable: string
}[]