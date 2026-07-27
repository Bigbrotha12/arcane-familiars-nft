import { Authentication, AppError, IMXBalance, Familiar, IController } from "../types";
import { Link } from "@imtbl/imx-sdk";
import { hashMessage } from '@ethersproject/hash';
import axios, { Axios } from "axios";

export class AppController implements IController {
    IMXProvider: string;
    LinkProvider: string;
    client: Axios;
        
    constructor(IMXProvider: string, LinkProvider: string) {
        this.IMXProvider = IMXProvider;
        this.LinkProvider = LinkProvider;
        this.client = axios.create({ 
            baseURL: IMXProvider, 
            timeout: 3000,
            headers: { "Content-Type": "application/json" }
        });
    }
    /**
     * Sets up user account connection with IMX Link
     * @returns eth address of user
     */
    async connectIMX(): Promise<[AppError | null, string | null]> {
        let link: Link = new Link(this.LinkProvider);
    
        try {
            const userInfo = await link.setup({});
            const userAddress = userInfo.address;
            return [null, userAddress];
        } catch (error) {
            const err = error as Error;
            return [{code: (err as any).code || 10, reason: 'Unable to set-up user account.', stack: err.stack}, null];
        }
    }

    /**
     * Creates request for user to sign timestamp data to verify account ownership.
     * @param address User address to be authenticated.
     * @returns signed timestamp from user's wallet.
     */
    async getAuthentication(address: string): Promise<[AppError | null, Authentication | null]> {
        let link: Link = new Link(this.LinkProvider);

        try {
            const now: string = Math.floor(Date.now()/1000).toString();
            const message: string = hashMessage(now);
            const signature: { result: string } = await link.sign({ 
                message: message, 
                description: "Authentication Request"});
            const authentication: Authentication = {
                eth_address: address,
                eth_timestamp: Number(now),
                eth_signature: signature.result
            }
            return [null, authentication];
        } catch (error) {
            const err = error as Error;
            return [{code: (err as any).code || 11, reason: "Could not obtain authentication data", stack: err.stack}, null];
        }
    }

    /**
     * Fetches user's NFT assets from cache, if available, or IMX API.
     * @param address eth address of user
     * @returns array of familiars the user owns
     */
    async getUserFamiliars(user: string, collection: string): Promise<[AppError | null, Array<Familiar> | null]> {
        try {
            const URI: string = "/v1/assets";
            const { data } = await this.client.get(URI, { params: { user, collection } });
            if (!data) throw new Error("Unable to fetch IMX assets");
            
            const familiars = data;
            console.log(familiars);
            return [null, familiars];

        } catch (error) {
            const err = error as Error;
            return [{code: (err as any).code || 1, reason: "Unable to fetch user's NFT assets.", stack: err.stack}, null];
        }
    }

    async getUserBalances(address: string): Promise<[AppError | null, IMXBalance | null]> {
        try {
            let URI: string = `/v2/balances/${address}`;
            const { data } = await this.client.get(URI);
            if (!data) throw new Error("Unable to fetch asset metadata.");
            
            let balances = data;
            return [null, balances];
            
        } catch (error) {
            const err = error as Error;
            return [{code: (err as any).code || 1, reason: "Unable to fetch user's balance.", stack: err.stack}, null];
        }
    }

    // Browser API
    storeUserData(value: string): void {
        try {
            localStorage.setItem("UserAddress", value);
        } catch (error) {
            console.error(error as Error);
        }
    }

    getUserData(): [AppError | null , string | null] {
        try {
            const data: string | null = localStorage.getItem("UserAddress");
            if (data === null) { return [{code: 5, reason: "No stored data."}, null]}
            
            const info: string | undefined = JSON.parse(data);
            if (info === undefined) { return [{code: 6,  reason: "Data parsing error."}, null]}
            return [null, info];

        } catch (error) {
            const err = error as Error;
            return [{code: 7, reason: "Unable to get browser data.", stack: err.stack}, null];
        }
    }

    deleteUserData(): void {
        try {
            localStorage.removeItem("UserAddress");
        } catch(error) {
            console.error(error as Error);
        }
    }
}