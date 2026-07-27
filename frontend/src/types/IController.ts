import { Authentication, AppError, IMXBalance } from "./IMX";
import { Familiar } from "./Familiar";

export interface IController {
    connectIMX(): Promise<[AppError | null, string | null]>,
    getAuthentication(address: string): Promise<[AppError | null, Authentication | null]>,
    getUserFamiliars(address: string, collection: string): Promise<[AppError | null, Array<Familiar> | null]>,
    getUserBalances(address: string): Promise<[AppError | null, IMXBalance | null]>,
    storeUserData(data: string): void,
    deleteUserData(): void
}