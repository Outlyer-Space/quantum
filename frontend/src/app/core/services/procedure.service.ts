import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, map, of } from 'rxjs';
import {
    ProcedureStep,
    ProcedureInstance,
    ArchivedInstance,
    ProcedureData,
    ProcedureSummary,
    RawProcedure,
    RawProcedureSummary,
    RawSection,
    StepType,
    ActiveUser
} from '../models/procedure.model';

/**
 * Centralized service for procedure data.
 * All methods return Observables backed by real HttpClient calls.
 */
@Injectable({ providedIn: 'root' })
export class ProcedureService {
    private http = inject(HttpClient);

    /** Legacy event bus — kept for components not yet migrated to rxResource. */
    public refresh$ = new Subject<void>();

    /**
     * Signal-based refresh counter for rxResource consumers.
     * Increment this instead of emitting on refresh$ once a component
     * has been migrated to rxResource (the resource reads this in its
     * request() fn, so any increment triggers a re-fetch automatically).
     */
    public refreshTick = signal(0);

    public requestRefresh(): void {
        this.refresh$.next();
        this.refreshTick.update(n => n + 1);
    }

    // ───────────────────────────────────────────────
    //  Dashboard Table
    // ───────────────────────────────────────────────

    /** Fetch procedures and map them to dashboard-friendly summaries.
     *  Pass a mission name to filter server-side; omit for all accessible missions. */
    getProcedureList(mission?: string): Observable<ProcedureSummary[]> {
        const params: Record<string, string> = {};
        if (mission) params['mission'] = mission;

        return this.http.get<RawProcedureSummary[]>('/api/procedures', { params }).pipe(
            map(procs => procs.map(p => ({
                id: p.procedureID,
                title: p.title,
                lastUse: p.lastuse || '',
                running: p.running ?? 0,
                archived: p.archived ?? 0,
                eventname: p.eventname || ''
            })))
        );
    }

    // ───────────────────────────────────────────────
    //  Procedure Steps (Preview & ViewProcedure)
    // ───────────────────────────────────────────────

    /** Fetch full procedure data and transform sections into nested ProcedureStep tree */
    getProcedureData(id: string): Observable<ProcedureData> {
        return this.http.get<RawProcedure>('/api/procedures/single', {
            params: { id }
        }).pipe(
            map(proc => {
                if (!proc) {
                    return { id, title: 'Unknown Procedure', steps: [] };
                }
                return {
                    id: proc.procedureID,
                    title: proc.title,
                    steps: this.transformSections(proc.sections),
                    eventname: proc.eventname || ''
                };
            })
        );
    }

    /** Fetch live procedure instance, mapping dynamic recorded values onto the static steps */
    getLiveInstanceData(id: string, revision: string): Observable<ProcedureData> {
        return this.http.get<RawProcedure>('/api/procedures/single', {
            params: { id, revision }
        }).pipe(
            map(proc => {
                if (!proc) {
                    return { id, title: 'Unknown Procedure', steps: [] };
                }
                const instance = proc.instances?.find(i => i.revision.toString() === revision);
                return {
                    id: proc.procedureID,
                    title: proc.title,
                    steps: this.transformSections(proc.sections, instance?.Steps),
                    eventname: proc.eventname || '',
                    activeUsers: instance?.users || []
                };
            })
        );
    }

    /** Send user presence heartbeat for an instance */
    setUserStatus(id: string, revision: string, username: string, email: string, isOnline: boolean): Observable<any> {
        const payload = {
            pid: id,
            revision,
            username,
            email,
            isOnline
        };
        return this.http.post('/api/procedures/instances/user-status', payload);
    }

    /** Lightweight fetch of only the active users array for a running instance */
    getActiveUsers(id: string, revision: string): Observable<ActiveUser[]> {
        return this.http.get<{ users: ActiveUser[] }>('/api/procedures/instances/users', {
            params: { id, revision }
        }).pipe(
            map(data => data.users || [])
        );
    }

    // ───────────────────────────────────────────────
    //  Running & Archived Instances
    // ───────────────────────────────────────────────

    /** Fetch all instances for a procedure, returning both running and archived with the title */
    getAllInstances(procedureId: string): Observable<{
        title: string;
        running: ProcedureInstance[];
        archived: ArchivedInstance[];
    }> {
        return this.http.get<{ title: string; instances: any[] }>('/api/procedures/instances', {
            params: { procedureID: procedureId }
        }).pipe(
            map(data => {
                const running: ProcedureInstance[] = [];
                const archived: ArchivedInstance[] = [];

                if (data.instances) {
                    for (const inst of data.instances) {
                        if (inst.running) {
                            running.push({
                                id: procedureId,
                                revision: inst.revision,
                                version: inst.version || 1,
                                openedBy: inst.openedBy,
                                startedAt: inst.startedAt
                            });
                        } else {
                            archived.push({
                                id: procedureId,
                                revision: inst.revision,
                                version: inst.version || 1,
                                openedBy: inst.openedBy,
                                startedAt: inst.startedAt,
                                closedBy: inst.closedBy,
                                completedAt: inst.completedAt
                            });
                        }
                    }
                }

                return { title: data.title || '', running, archived };
            })
        );
    }

    // ───────────────────────────────────────────────
    //  Execution (Run Action)
    // ───────────────────────────────────────────────

    /** 
     * Create a new running instance of a procedure.
     * Returns an object containing the new `revision` number.
     */
    createInstance(id: string, username: string, email: string, role: string): Observable<{ revision: number }> {
        const payload = {
            id,
            usernamerole: role ? `${username} - ${role}` : username,
            lastuse: new Date().toISOString(),
            username,
            email,
            role
        };
        return this.http.post<{ revision: number }>('/api/procedures/instances', payload);
    }

    /** Complete a specific step, submitting the recorded value to the backend */
    setStepValue(id: string, revision: string, flatIndex: number, recordedValue: string, steptype: string, username: string, info: string = ''): Observable<any> {
        // Must match what `procedure.controller.js` `setInfo` expects
        const payload = {
            id,
            revision: parseInt(revision, 10),
            step: flatIndex,
            recordedValue,
            steptype: steptype === 'input' ? 'Input' : steptype,
            info: info,
            usernamerole: username, // Fallback format used on the backend
            lastuse: new Date().toISOString()
        };
        return this.http.post('/api/procedures/instances/steps', payload);
    }

    /** Set completion info for multiple parent heading steps at once */
    setParentsInfo(id: string, revision: string, parentsArray: { index: number, parent: any }[], info: string, username: string): Observable<any> {
        const payload = {
            id,
            revision: parseInt(revision, 10),
            parentsArray,
            info,
            usernamerole: username,
            lastuse: new Date().toISOString()
        };
        return this.http.post('/api/procedures/instances/parent-steps', payload);
    }

    /** Set an entire procedure instance to the Completed/Archived status */
    completeInstance(id: string, revision: string, username: string): Observable<any> {
        const payload = {
            id,
            revision: parseInt(revision, 10),
            usernamerole: username,
            lastuse: new Date().toISOString()
        };
        return this.http.post('/api/procedures/instances/complete', payload);
    }

    // ───────────────────────────────────────────────

    /** Upload an xlsx procedure file */
    uploadProcedure(file: File, userdetails: string, mission: string): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('userdetails', userdetails);
        formData.append('mission', mission);
        return this.http.post('/api/procedures/upload', formData);
    }

    // ───────────────────────────────────────────────
    //  Rename
    // ───────────────────────────────────────────────

    /** Rename a procedure */
    renameProcedure(prevProcId: string, newId: string, groupName: string, title: string): Observable<any> {
        return this.http.patch('/api/procedures/name', {
            procId: prevProcId,
            newprocedurename: { id: newId, gname: groupName, title }
        });
    }

    // ───────────────────────────────────────────────
    //  Download
    // ───────────────────────────────────────────────

    /** Download a procedure as xlsx binary */
    downloadProcedure(id: string): Observable<Blob> {
        return this.http.get('/api/procedures/data', {
            params: { id },
            responseType: 'blob'
        });
    }

    // ───────────────────────────────────────────────
    //  Transform helpers
    // ───────────────────────────────────────────────

    /** Convert flat backend sections array into nested ProcedureStep tree */
    private transformSections(sections: RawSection[], liveSteps?: any[]): ProcedureStep[] {
        if (!sections || sections.length === 0) return [];

        const allSteps: ProcedureStep[] = sections.map((s, index) => {
            const liveData = liveSteps ? liveSteps[index] : null;

            // Extract completion note or recorded value. Backend uses 'Info' or 'info' for checkboxes.
            const recordedValue = liveData?.recordedValue || liveData?.info || liveData?.Info || '';

            return {
                id: s.Step,
                level: this.getLevel(s.Step),
                role: s.Role,
                type: this.mapType(s.Type),
                content: s.Content,
                flatIndex: index,
                referenceUrl: s.Reference,
                isOpen: true,
                children: [],
                recordedValue: recordedValue
            };
        });

        // Build tree by nesting children under their heading parents
        const tree: ProcedureStep[] = [];
        const stack: ProcedureStep[] = [];

        for (const step of allSteps) {
            // Pop stack until we find a parent at a lower level
            while (stack.length > 0 && stack[stack.length - 1].level >= step.level) {
                stack.pop();
            }

            if (stack.length > 0) {
                const parent = stack[stack.length - 1];
                if (!parent.children) parent.children = [];
                parent.children.push(step);
            } else {
                tree.push(step);
            }

            // Only push headings / parent-level steps onto the stack
            if (step.type === 'string') {
                stack.push(step);
            }
        }

        return tree;
    }

    private getLevel(stepId: string): 1 | 2 | 3 {
        const parts = stepId.split('.');
        if (parts.length <= 1) return 1;
        // x.0 is a heading (level 1), x.y is level 2, x.y.z is level 3
        if (parts[parts.length - 1] === '0') {
            return parts.length <= 2 ? 1 : 2 as any;
        }
        return Math.min(parts.length, 3) as 1 | 2 | 3;
    }

    private mapType(backendType: string): StepType {
        const t = backendType.toUpperCase();
        switch (t) {
            case 'ACTION': return 'command';
            case 'CAUTION': return 'alert';
            case 'WARNING': return 'alert';
            case 'DECISION': return 'decision';
            case 'RECORD': return 'input';
            case 'VERIFY': return 'verify';
            case 'INFO': return 'string';
            case 'HEADING': return 'string';
            default: return 'string';
        }
    }
}
