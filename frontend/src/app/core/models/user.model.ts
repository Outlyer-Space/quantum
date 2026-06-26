/**
 * Represents the authenticated user structure
 * based on the backend /api/me response.
 */
export interface UserAuth {
    email: string;
    id?: string;
    name?: string;
}

export interface User {
    _id: string;
    email: string;
    auth: UserAuth;
    roles?: string[];
    missions?: {
        name?: string;
        currentRole?: {
            name?: string;
            callsign?: string;
        };
        allowedRoles?: {
            name?: string;
            callsign?: string;
        }[];
    }[];
}

export interface Role {
    name: string;
    callsign: string;
}

/**
 * Maps to the response of the /getUsers endpoint
 * for managing roles in the User Administration dialog
 */
export interface UserAdmin {
    auth: {
        email: string;
        name: string;
    };
    currentRole: Role;
    // The backend sends allowedRoles as an object map: { 'FLIGHT': 1, 'CC': 1 }
    // but the API endpoints like /setAllowedRoles expect an array of Role objects
    allowedRoles: Record<string, number> | Role[];
    /** Which mission this record was loaded from (set client-side after getUsers) */
    mission?: string;
}
