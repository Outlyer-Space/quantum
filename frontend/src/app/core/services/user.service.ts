import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { UserAdmin, Role } from '../models/user.model';

@Injectable({
    providedIn: 'root'
})
export class UserService {
    private http = inject(HttpClient);

    /**
     * Gets all users and their allowed roles for the given mission.
     */
    getUsers(mission: string): Observable<UserAdmin[]> {
        return this.http.get<UserAdmin[]>('/api/users', { params: { mission } });
    }

    /**
     * Set the allowed roles array for an arbitrary user for a specific mission.
     */
    setAllowedRoles(email: string, roles: Role[], mission: string): Observable<any> {
        return this.http.post('/api/users/allowed-roles', { email, roles, mission });
    }

    /**
     * Get the current role for an arbitrary user for a specific mission.
     */
    getCurrentRole(email: string, mission: string): Observable<any> {
        return this.http.get<any>('/api/users/current-role', { params: { email, mission } });
    }

    /**
     * Set the current active role for an arbitrary user for a specific mission.
     */
    setUserRole(email: string, role: Role, mission: string): Observable<any> {
        return this.http.post('/api/users/role', { email, role, mission });
    }

    /**
     * Get the allowed roles for an arbitrary user for a specific mission.
     */
    getAllowedRoles(email: string, mission: string): Observable<any> {
        return this.http.get<any>('/api/users/allowed-roles', { params: { email, mission } });
    }

    /**
     * Fetches the global configuration for valid roles.
     * Note: A quick wrapper for backend `/configRole` logic or a local cache equivalent.
     * Based on backend `role.js`: returns the raw object or an array transformed via map.
     */
    getRoles(): Observable<any> {
        return this.http.get<any>('/api/users/roles');
    }

    /**
     * Gets all distinct mission names across all users.
     * Requires the caller's mission for lead-role authorization.
     */
    getMissions(mission: string): Observable<string[]> {
        return this.http.get<string[]>('/api/users/missions', { params: { mission } });
    }

    /**
     * Gets the mission names assigned to a specific user.
     * Requires the caller's mission for lead-role authorization.
     */
    getUserMissions(email: string, mission: string): Observable<string[]> {
        return this.http.get<string[]>('/api/users/user-missions', { params: { email, mission } });
    }

    /**
     * Assign a mission to a user (creates mission entry with default role).
     */
    addMissionToUser(email: string, mission: string): Observable<any> {
        return this.http.post('/api/users/mission', { email, mission });
    }

    /**
     * Remove a mission from a user.
     */
    removeMissionFromUser(email: string, mission: string): Observable<any> {
        return this.http.post('/api/users/mission/remove', { email, mission });
    }
}
